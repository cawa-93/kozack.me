// Гонка дорогою (§8.5): три смуги, свої й чужі машини; джойстик чи стрілки: вперед — газ, назад — гальмо. Сцена лише малює стан
// гонки й передає керування в симуляцію; коли гонка закінчилася, повертає день.

import Phaser from "phaser";

import { PALETTE } from "../../art/palette";
import { RACE } from "../sim/config";
import { drive } from "../sim/game";
import { carAt, type RaceInput } from "../sim/race";
import { formatClock, gameMinutes } from "../sim/time";
import type { Destination, GameState, Race, RaceCar, Trip } from "../sim/types";
import type { Session } from "../session";
import { isRotateNoticeShown, onRotateNotice, safeArea, type Insets } from "../screen";
import { RACE_START_HINT } from "../texts";
import { addArt } from "../view/art/atlas";
import { addBakedArt, releaseBaked, setBakedArt } from "../view/art/bake";
import { artEntry } from "../view/art/manifest";
import { RACE_TILES } from "../view/art/manifest/a14-race";
import type { ArtId, TintRecipe } from "../view/art/types";
import { COLORS } from "../view/colors";
import { currentGfx } from "../view/gfx";
import {
  barParts,
  laneX,
  RACE_BAR_X,
  RACE_PLAYER_Y,
  racePixelsPerUnit,
  raceScale,
  rowFlipped,
  steerTilt,
  tileRows,
  TRAFFIC_COLORS,
  trafficLook,
  vergeColumns,
  type BarPart,
  type TrafficLook,
} from "../view/racelook";

const MAX_FRAME_SECONDS = 0.1;
/** Джойстик гонки: радіус, мертва зона й наскільки відхилити вбік, щоб перестроїтися. */
const STICK_RADIUS = 70;
const STICK_DEAD = 0.2;
const STICK_STEER = 0.5;

export const DESTINATION_TITLES: Record<Destination, string> = {
  shop: "Магазин",
  vet: "Ветеринар",
  doctor: "Лікар",
  shelter: "Притулок",
  breeder: "Розплідник",
  groomer: "Грумер",
  office: "Офіс",
  show: "Виставка котів",
};

const CAR_COLORS = [0x4f7fb3, 0x8e4a6a, 0x6fae6a, 0xe8b93a, 0x9aa3ab];

export class RaceScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private label!: Phaser.GameObjects.Text;
  /** «W ↑» на дорозі, поки машина стоїть, а гравець ще нічого не натискав (на клавіатурі). */
  private hint!: Phaser.GameObjects.Text;
  /** Гравець уже торкнувся екрана чи натиснув газ, гальмо чи смугу в цій гонці: підказка старту більше не потрібна. */
  private touched = false;
  private keys: Record<"up" | "down" | "up2" | "down2", Phaser.Input.Keyboard.Key> | null = null;
  private steer: -1 | 0 | 1 = 0;
  /** Плаваючий джойстик, як удома: вперед — газ, назад — гальмо, убік — перестроїтися. */
  private stick: { id: number; origin: { x: number; y: number }; x: number; y: number; steered: boolean } | null = null;
  /** Нова графіка (крок 16, `?gfx=iso`): дорога, узбіччя, машини й смуга прогресу з атласу; у старому вигляді — null. */
  private art: RaceArt | null = null;

  constructor(private readonly session: Session) {
    super("race");
  }

  private get state(): GameState {
    return this.session.save.current;
  }

  create(): void {
    this.art = currentGfx() === "iso" ? new RaceArt(this) : null;
    this.g = this.add.graphics();
    this.label = this.add.text(0, 0, "", { fontFamily: "system-ui, sans-serif", fontSize: "22px", color: "#f3e9dc", fontStyle: "bold", resolution: 2 });
    this.hint = this.add
      .text(0, 0, RACE_START_HINT, { fontFamily: "system-ui, sans-serif", fontSize: "26px", color: "#f3e9dc", fontStyle: "bold", resolution: 2 })
      .setOrigin(0.5, 1)
      .setVisible(false);
    if (this.art) {
      // Над полем і дорогою: джойстик і підказка, а написи — з чорнильною обвідкою, щоб читалися на траві.
      this.g.setDepth(RACE_DEPTH.ui);
      this.label.setDepth(RACE_DEPTH.ui).setStroke(PALETTE.ink, 5);
      this.hint.setDepth(RACE_DEPTH.ui).setStroke(PALETTE.ink, 5);
      const art = this.art;
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => art.destroy());
    }
    this.touched = false;
    const keyboard = this.input.keyboard;
    if (keyboard) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      this.keys = keyboard.addKeys({ up: K.W, down: K.S, up2: K.UP, down2: K.DOWN }, false) as RaceScene["keys"];
      for (const [key, dir] of [["LEFT", -1], ["A", -1], ["RIGHT", 1], ["D", 1]] as const) {
        keyboard.on(`keydown-${key}`, () => (this.steer = dir));
      }
    }
    this.input.addPointer(2);
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.down(p));
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.moveStick(p));
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => this.up(p));
    this.input.on("pointerupoutside", (p: Phaser.Input.Pointer) => this.up(p));
    // Телефон повернули вертикально — гонка на паузі (§10), а джойстик скидається, щоб після повороту машина не газувала сама.
    const stop = onRotateNotice((shown) => {
      if (shown) this.stick = null;
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
  }

  /** Джойстик з'являється під пальцем будь-де на екрані. */
  private down(p: Phaser.Input.Pointer): void {
    this.touched = true;
    if (this.stick !== null) return;
    this.stick = { id: p.id, origin: { x: p.x, y: p.y }, x: 0, y: 0, steered: false };
  }

  private moveStick(p: Phaser.Input.Pointer): void {
    const stick = this.stick;
    if (stick?.id !== p.id) return;
    const dx = p.x - stick.origin.x;
    const dy = p.y - stick.origin.y;
    const length = Math.hypot(dx, dy);
    const scale = length > STICK_RADIUS ? STICK_RADIUS / length : 1;
    stick.x = (dx * scale) / STICK_RADIUS;
    stick.y = (dy * scale) / STICK_RADIUS;
    // Одне відхилення вбік — одне перестроювання; наступне — після повернення до середини.
    if (!stick.steered && Math.abs(stick.x) >= STICK_STEER) {
      this.steer = stick.x < 0 ? -1 : 1;
      stick.steered = true;
    } else if (Math.abs(stick.x) < STICK_STEER / 2) stick.steered = false;
  }

  private up(p: Phaser.Input.Pointer): void {
    if (this.stick?.id === p.id) this.stick = null;
  }

  private input_(): RaceInput {
    const k = this.keys;
    let throttle = 0;
    if (k && (k.up.isDown || k.up2.isDown)) throttle += 1;
    if (k && (k.down.isDown || k.down2.isDown)) throttle -= 1;
    // Джойстик угору — газ, униз — гальмо, сильніше відхилення — сильніше натиск.
    const forward = -(this.stick?.y ?? 0);
    if (Math.abs(forward) > STICK_DEAD) throttle += (forward - Math.sign(forward) * STICK_DEAD) / (1 - STICK_DEAD);
    const steer = this.steer;
    this.steer = 0;
    if (throttle !== 0 || steer !== 0) this.touched = true;
    return { steer, throttle: Math.max(-1, Math.min(1, throttle)) };
  }

  override update(_time: number, delta: number): void {
    const state = this.state;
    if (state.trip?.phase !== "drive" || state.end !== null) return this.finish();
    // Пауза розробника чи заглушка «Поверніть телефон» (§10): дорога стоїть.
    if (!this.session.paused && !isRotateNoticeShown()) {
      const seconds = Math.min(delta / 1000, MAX_FRAME_SECONDS);
      const { result, night } = drive(this.session.save, gameMinutes(seconds) * this.session.speed, this.input_());
      if (result !== null || night !== null) return this.finish();
    }
    this.draw();
  }

  private finish(): void {
    this.stick = null;
    this.scene.wake("day");
    this.scene.stop();
  }

  private draw(): void {
    const trip = this.state.trip;
    if (!trip) return;
    if (this.art) return this.drawArt(trip, this.art);
    const race = trip.race;
    const { width, height } = this.scale;
    const g = this.g.clear();
    const safe = safeArea();
    g.fillStyle(0x55704a).fillRect(0, 0, width, height);
    const roadW = Math.min(width * 0.7, 420);
    const laneW = roadW / RACE.lanes;
    const left = (width - roadW) / 2;
    g.fillStyle(0x3a3a40).fillRect(left, 0, roadW, height);
    // Розмітка біжить униз, поки машина їде вгору.
    const pixelsPerUnit = (height * 0.75) / RACE.view;
    const dash = 0.25;
    const offset = ((race.done % (dash * 2)) / (dash * 2)) * dash * 2 * pixelsPerUnit;
    g.fillStyle(0xf3e9dc, 0.8);
    for (let lane = 1; lane < RACE.lanes; lane++) {
      const x = left + lane * laneW - 2;
      for (let y = -dash * 2 * pixelsPerUnit + offset; y < height; y += dash * 2 * pixelsPerUnit) g.fillRect(x, y, 4, dash * pixelsPerUnit);
    }
    const carW = laneW * 0.55;
    const carH = RACE.carLength * pixelsPerUnit * 1.6;
    const playerY = height * 0.78;
    for (const car of race.cars) {
      const y = playerY - (carAt(race, car) - race.done) * pixelsPerUnit;
      if (y < -carH || y > height + carH) continue;
      this.car(g, left + (car.lane + 0.5) * laneW, y, carW, carH, CAR_COLORS[Math.floor(car.start * 7) % CAR_COLORS.length] ?? 0x9aa3ab);
    }
    this.car(g, left + (race.lane + 0.5) * laneW, playerY, carW, carH, COLORS.danger);
    // Стрілка прогресу дороги збоку.
    const barX = left + roadW + 24;
    const barTop = safe.top + 90;
    const barH = height - barTop - safe.bottom - 40;
    g.fillStyle(COLORS.ink, 0.6).fillRoundedRect(barX, barTop, 12, barH, 6);
    g.fillStyle(COLORS.good).fillRoundedRect(barX, barTop + barH * (1 - race.done / race.road), 12, barH * (race.done / race.road), 6);
    this.drawStick(g);
    this.drawStartHint(g, race.speed === 0 && !this.touched, { x: Math.max(safe.left + STICK_RADIUS + 12, left / 2), y: height * 0.62 }, { x: left + (race.lane + 0.5) * laneW, y: playerY - carH * 0.6 });
    this.drawLabel(trip, safe);
  }

  /**
   * Нова графіка (крок 16, `?gfx=iso`): поле й дорога плитками, що біжать донизу, машини з атласу, смуга прогресу; джойстик,
   * підказка старту й напис — ті самі, що й у старому вигляді. Відстані дороги переводяться в пікселі так само, як там.
   */
  private drawArt(trip: Trip, art: RaceArt): void {
    const race = trip.race;
    const { width, height } = this.scale;
    const g = this.g.clear();
    const safe = safeArea();
    const view: RaceView = { width, height, k: raceScale(height), ppu: racePixelsPerUnit(height), cx: width / 2, playerY: height * RACE_PLAYER_Y, safe };
    art.draw(race, view);
    this.drawStick(g);
    const roadLeft = view.cx - RACE_TILES.road.curb * view.k;
    const carTop = { x: laneX(view.cx, race.lane, view.k), y: view.playerY - RACE_CAR_FRONT * view.k };
    this.drawStartHint(g, race.speed === 0 && !this.touched, { x: Math.max(safe.left + STICK_RADIUS + 12, roadLeft / 2), y: height * 0.62 }, carTop);
    this.drawLabel(trip, safe);
  }

  /** Джойстик під пальцем. */
  private drawStick(g: Phaser.GameObjects.Graphics): void {
    const stick = this.stick;
    if (stick) {
      g.fillStyle(0xffffff, 0.12).fillCircle(stick.origin.x, stick.origin.y, STICK_RADIUS);
      g.lineStyle(3, 0xffffff, 0.35).strokeCircle(stick.origin.x, stick.origin.y, STICK_RADIUS);
      g.fillStyle(0xffffff, 0.35).fillCircle(stick.origin.x + stick.x * STICK_RADIUS, stick.origin.y + stick.y * STICK_RADIUS, 30);
    }
  }

  /** Куди їдемо, котра година й швидкість — угорі ліворуч. */
  private drawLabel(trip: Trip, safe: Insets): void {
    this.label
      .setPosition(safe.left + 20, safe.top + 16)
      .setText(`${DESTINATION_TITLES[trip.destination]} · ${formatClock(this.state.minute)} · ×${trip.race.speed.toFixed(1).replace(".", ",")}`);
  }

  /**
   * Підказка без слів на старті (§8.5, §11.3а «показуй, а не розказуй»; загальна ревізія 2026-10-29): машина стоїть, а гравець
   * ще нічого не натискав — на сенсорному екрані ліворуч від дороги ледь помітно пульсує тінь джойстика, що тягнеться вгору,
   * а з клавіатурою над машиною — «W ↑». Від першого дотику чи натискання підказка зникає до кінця гонки.
   */
  private drawStartHint(g: Phaser.GameObjects.Graphics, shown: boolean, stickAt: { x: number; y: number }, carTop: { x: number; y: number }): void {
    const touch = window.matchMedia("(pointer: coarse)").matches;
    const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 300);
    this.hint.setVisible(shown && !touch);
    if (!shown) return;
    if (!touch) {
      this.hint.setPosition(carTop.x, carTop.y).setAlpha(0.35 + 0.4 * pulse);
      return;
    }
    const { x, y } = stickAt;
    // Палець тягне ручку вгору й відпускає — раз на секунду.
    const reach = ((this.time.now / 1100) % 1) * STICK_RADIUS * 0.7;
    const alpha = 0.1 + 0.15 * pulse;
    g.fillStyle(0xffffff, alpha * 0.6).fillCircle(x, y, STICK_RADIUS);
    g.lineStyle(3, 0xffffff, alpha * 1.6).strokeCircle(x, y, STICK_RADIUS);
    g.fillStyle(0xffffff, alpha * 1.8).fillCircle(x, y - reach, 30);
    // Стрілка вгору над тінню.
    const tip = y - STICK_RADIUS - 34;
    g.fillStyle(0xffffff, alpha * 2).fillTriangle(x, tip, x - 16, tip + 20, x + 16, tip + 20);
  }

  private car(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number): void {
    g.fillStyle(color).fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
    g.fillStyle(0xcfe3ef, 0.9).fillRoundedRect(x - w / 2 + 5, y - h / 2 + h * 0.18, w - 10, h * 0.22, 4);
    g.lineStyle(2.5, COLORS.ink).strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);
  }
}

// --- Нова графіка (крок 16, A14) ---------------------------------------------------------------------

/** Шари гонки в новій графіці: поле, дорога, машини потоку, своя машина, смуга прогресу, джойстик і напис. */
const RACE_DEPTH = { verge: 0, road: 1, traffic: 2, player: 3, bar: 4, ui: 10 } as const;
/** Від середини своєї машини до її переду з контуром, одиниці арту (`race/car/player`): над ним — підказка «W ↑». */
const RACE_CAR_FRONT = 34;

/** Розміри кадру гонки: полотно, масштаб арту, пікселів на одиницю дороги, середина дороги, де своя машина, безпечна зона. */
interface RaceView {
  width: number;
  height: number;
  k: number;
  ppu: number;
  cx: number;
  playerY: number;
  safe: Insets;
}

/** Рецепт машини потоку: кузов (`fill`) — колір потоку, решта шарів — як намальовано (тінь — звичайним накладанням). */
function trafficRecipe(color: number): TintRecipe {
  const tint = TRAFFIC_COLORS[color] ?? COLORS.paper;
  return {
    key: `race-car-${tint.toString(16)}`,
    steps: [
      { layer: "fill", color: tint, put: "source-over" },
      { layer: "detail", color: null, put: "source-over" },
      { layer: "shade", color: null, put: "source-over" },
      { layer: "ink", color: null, put: "source-over" },
    ],
  };
}

/**
 * Гонка з атласу (`src/view/art/manifest/a14-race.ts`): узбіччя стовпцями й дорога плитками (`racelook.ts`), машини
 * потоку — запечені кадри свого кольору (власник на колір, `releaseBaked` наприкінці гонки), своя машина нахиляється, поки
 * перестроюється, а смуга прогресу розтягується трьома частинами кадру. Зображення беруться з пулів і ховаються, коли зайві.
 */
class RaceArt {
  private readonly verge: Phaser.GameObjects.Image[] = [];
  private readonly road: Phaser.GameObjects.Image[] = [];
  private readonly traffic: Phaser.GameObjects.Image[] = [];
  private readonly player: Phaser.GameObjects.Image;
  private readonly track: Phaser.GameObjects.Image[];
  private readonly fill: Phaser.GameObjects.Image[];
  /** Вигляд машини потоку — з першої зустрічі (`trafficLook`): машина, яку сим відсуває назад, не перефарбовується. */
  private readonly looks = new WeakMap<RaceCar, TrafficLook>();
  /** Що показує зображення потоку (вид і рецепт). */
  private readonly shown = new WeakMap<Phaser.GameObjects.Image, string>();
  /** Масштаб, який уже стоїть на зображенні, відносно базового з атласу. */
  private readonly applied = new WeakMap<Phaser.GameObjects.Image, { x: number; y: number }>();
  private readonly recipes = new Map<number, TintRecipe>();
  private readonly owners = new Set<string>();

  constructor(private readonly scene: Phaser.Scene) {
    this.player = addArt(scene, null, "race/car/player").setDepth(RACE_DEPTH.player);
    this.track = [0, 1, 2].map(() => addArt(scene, null, "race/progress", { state: "track" }).setDepth(RACE_DEPTH.bar).setOrigin(0.5, 0));
    this.fill = [0, 1, 2].map(() => addArt(scene, null, "race/progress", { state: "fill" }).setDepth(RACE_DEPTH.bar).setOrigin(0.5, 0));
  }

  draw(race: Race, view: RaceView): void {
    const { width, height, k, ppu, cx, playerY } = view;
    const distance = race.done * ppu;
    const tiles = RACE_TILES;

    // Узбіччя: стовпці зі своєю фазою, віддзеркалені через один; дорога — одна колона плиток посередині. Ряди теж
    // віддзеркалюються через один (`rowFlipped`), тож малюнок не повторюється на одному екрані.
    const vergePeriod = tiles.verge.period * k;
    const vergePivot = (artEntry("race/verge")?.pivot.y ?? 256) - tiles.verge.top;
    let n = 0;
    for (const column of vergeColumns(width, cx, k)) {
      for (const row of tileRows(distance + column.phase * vergePeriod, vergePeriod, height)) {
        const image = this.pooled(this.verge, n++, "race/verge", RACE_DEPTH.verge);
        this.fit(image, column.flip !== rowFlipped(row.n) ? -k : k, k).setPosition(column.x, row.y + vergePivot * k);
      }
    }
    hideFrom(this.verge, n);
    const roadPeriod = tiles.road.period * k;
    const roadPivot = (artEntry("race/road")?.pivot.y ?? 256) - tiles.road.top;
    n = 0;
    for (const row of tileRows(distance, roadPeriod, height)) {
      const image = this.pooled(this.road, n++, "race/road", RACE_DEPTH.road);
      this.fit(image, rowFlipped(row.n) ? -k : k, k).setPosition(cx, row.y + roadPivot * k);
    }
    hideFrom(this.road, n);

    // Машини потоку: ті, що в кадрі (з запасом на довжину машини).
    const reach = (artEntry("race/car/traffic")?.size.h ?? 84) * k;
    n = 0;
    for (const car of race.cars) {
      const y = playerY - (carAt(race, car) - race.done) * ppu;
      if (y < -reach || y > height + reach) continue;
      let look = this.looks.get(car);
      if (!look) {
        look = trafficLook(car);
        this.looks.set(car, look);
      }
      this.fit(this.trafficImage(n++, look), k, k).setPosition(laneX(cx, car.lane, k), y);
    }
    hideFrom(this.traffic, n);

    this.fit(this.player, k, k)
      .setPosition(laneX(cx, race.lane, k), playerY)
      .setRotation(steerTilt(race.lane, race.targetLane));

    // Смуга прогресу збоку дороги — там само по висоті, що й у старому вигляді.
    const barTop = view.safe.top + 90;
    const barH = height - barTop - view.safe.bottom - 40;
    const barX = cx + RACE_BAR_X * k;
    this.placeBar(this.track, barX, barTop, barH, k);
    const done = Math.max(0, Math.min(1, race.road > 0 ? race.done / race.road : 0));
    const fillH = barH * done;
    if (fillH >= 1) this.placeBar(this.fill, barX, barTop + barH - fillH, fillH, k);
    else hideFrom(this.fill, 0);
  }

  /** Звільнити запечені кадри потоку (сцена гонки закінчилася). */
  destroy(): void {
    for (const owner of this.owners) releaseBaked(this.scene, owner);
    this.owners.clear();
  }

  /** Зображення пулу з номером `i`: нове — з атласу, наявне — показати. */
  private pooled(pool: Phaser.GameObjects.Image[], i: number, id: ArtId, depth: number): Phaser.GameObjects.Image {
    let image = pool[i];
    if (!image) {
      image = addArt(this.scene, null, id).setDepth(depth);
      pool[i] = image;
    }
    return image.setVisible(true);
  }

  /** Машина потоку з пулу: запечений кадр виду й кольору (той самий — нічого не робить). */
  private trafficImage(i: number, look: TrafficLook): Phaser.GameObjects.Image {
    let recipe = this.recipes.get(look.color);
    if (!recipe) {
      recipe = trafficRecipe(look.color);
      this.recipes.set(look.color, recipe);
    }
    const owner = `race:${look.color}`;
    this.owners.add(owner);
    const key = `${look.kind}@${recipe.key}`;
    let image = this.traffic[i];
    if (!image) {
      image = addBakedArt(this.scene, null, "race/car/traffic", recipe, { state: look.kind, owner }).setDepth(RACE_DEPTH.traffic);
      this.traffic[i] = image;
    } else if (this.shown.get(image) !== key) {
      setBakedArt(image, "race/car/traffic", recipe, { state: look.kind, owner });
    }
    this.shown.set(image, key);
    return image.setVisible(true);
  }

  /**
   * Масштаб зображення — `x` і `y` пікселів на одиницю арту (від'ємний `x` — віддзеркалення) поверх базового з атласу (1
   * одиниця = 1 px); той самий масштаб не перераховується.
   */
  private fit(image: Phaser.GameObjects.Image, x: number, y: number): Phaser.GameObjects.Image {
    const prev = this.applied.get(image) ?? { x: 1, y: 1 };
    if (prev.x !== x || prev.y !== y) {
      image.setScale((image.scaleX / prev.x) * x, (image.scaleY / prev.y) * y);
      this.applied.set(image, { x, y });
    }
    return image;
  }

  /** Розтягнути смугу (три зображення одного кадру) на висоту `height` від `top`: краї як є, середина — розтягнута. */
  private placeBar(parts: Phaser.GameObjects.Image[], x: number, top: number, height: number, k: number): void {
    const entry = artEntry("race/progress");
    const frameH = entry?.size.h ?? 96;
    const slice = entry?.points?.["slice"]?.y ?? frameH / 4;
    const layout = barParts(top, height, k, frameH, slice);
    const list: (BarPart | null)[] = [layout.top, layout.middle, layout.bottom];
    list.forEach((part, i) => {
      const image = parts[i];
      if (!image) return;
      if (!part) {
        image.setVisible(false);
        return;
      }
      // Обрізка — у пікселях повного кадру (атлас кладе його з `res` пікселів на одиницю).
      const res = image.frame.realHeight / frameH;
      this.fit(image, k, part.scaleY).setPosition(x, part.y).setVisible(true);
      image.setCrop(0, part.cropY * res, image.frame.realWidth, part.cropH * res);
    });
  }
}

/** Сховати зображення пулу з номера `from`. */
function hideFrom(pool: Phaser.GameObjects.Image[], from: number): void {
  for (let i = from; i < pool.length; i++) pool[i]?.setVisible(false);
}
