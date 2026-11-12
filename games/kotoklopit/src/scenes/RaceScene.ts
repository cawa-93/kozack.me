// Дорога (§8.5): гонка й дорога додому. Гонка — три смуги, свої й чужі машини; джойстик чи стрілки: вперед — газ, назад — гальмо.
// Сцена лише малює стан гонки й передає керування в симуляцію; коли гонка закінчилася, повертає день. Аварію показує, як
// засинання (`src/view/racecrash.ts`): камера наїжджає на машину, екран темніє, а тоді день показує картку аварії. Дорога
// додому — коротка катсцена без керування: сим тоді не йде, час дороги рахує день, коли вона скінчилася. Доїхали (§8.5 «На місці
// — кадр парковки», `src/view/parking.ts`) — без керування машина гальмує й стає на парковці пункту, і сцена лишається на цьому
// кадрі, поки день показує картку пункту поверх нього; «Додому» — машина виїжджає з парковки (`departureFrame`) й без розриву
// йде дорога додому. З чорного (`src/view/homeroad.ts`) дорога додому починається лише тоді, коли машини на парковці немає:
// знайда, яку відносять у притулок, і запасний шлях. Виїзд із дому (§8.5 «Виїзд із дому», рішення автора 2026-11-03) — дзеркало:
// поїздка щойно вирушила від дверей, і день, затемнивши квартиру, запускає сцену дороги з від'їздом від свого будинку
// (`homeDepartureFrame`): з чорного — парковка біля дому, машина задкує, звертає на дорогу носом угору й доїжджає до старту, і без
// розриву, з тією самою швидкістю, починається гонка. У темний час (§8.9 «День і ніч») поверх дороги — ніч
// (`src/view/racenight.ts`, розрахунки — `src/view/racelight.ts`): тон, фари й задні вогні, вуличні ліхтарі, світло таблички;
// HUD гонки — над нею.

import Phaser from "phaser";

import { PALETTE } from "../../art/palette";
import { SFX } from "../audio/config";
import { sceneLoop, sceneMoment, uiSound } from "../audio/sfx/sounds";
import { ENGINE, EngineHum, engineRate } from "../audio/sfx/trip/engine";
import { Horns } from "../audio/sfx/trip/horns";
import { Revs } from "../audio/sfx/trip/revs";
import { RACE } from "../sim/config";
import { drive } from "../sim/game";
import { gripFactor, trafficFactor } from "../sim/modifiers";
import { carAt, type RaceInput } from "../sim/race";
import { formatClock, raceMinutes } from "../sim/time";
import type { Destination, GameState, RaceCar, Save, Trip } from "../sim/types";
import type { Session } from "../session";
import { isCoarsePointer, isRotateNoticeShown, onRotateNotice, safeArea, type Insets } from "../screen";
import { RACE_START_HINT } from "../texts";
import { asideCardRight } from "../ui/cardsize";
import { DESTINATION_TITLES } from "../ui/titles";
import { addArt, setArt } from "../view/art/atlas";
import { addBakedArt, releaseBaked, setBakedArt } from "../view/art/bake";
import { artEntry } from "../view/art/manifest";
import { RACE_BUILDING, RACE_LOT, RACE_TILES } from "../view/art/manifest/a14-race";
import type { ArtId, TintRecipe } from "../view/art/types";
import { COLORS } from "../view/colors";
import { CAR_REACH, canSkipHomeRoad, HOME_ROAD, homeRoadFrame, type HomeRoadFrame } from "../view/homeroad";
import { iconArt } from "../view/iconnames";
import { daylight } from "../view/light/daylight";
import {
  arrivalFrame,
  arrivalMs,
  arrivalStart,
  departureFrame,
  HOME_DEPARTURE,
  HOME_LOT,
  homeDepartureFrame,
  homeDepartureHud,
  homeDepartureStart,
  LOT_BOUNDS,
  lotCars,
  lotFitPan,
  lotInFrame,
  lotScreenY,
  parkedCars,
  parkedFrame,
  parkedKey,
  parkingLayout,
  parkingSpot,
  raceBarAlpha,
  type ArrivalStart,
  type CarPose,
  type HomeDepartureStart,
  type LotPlace,
  type ParkingCar,
  type ParkingFrame,
  type ParkingLayout,
  type ParkingSpot,
} from "../view/parking";
import { CRASH_FX, crashView } from "../view/racecrash";
import { icyRoad } from "../view/raceice";
import { RaceIceLayer } from "../view/raceicelayer";
import {
  arrivalLights,
  carLights,
  departureLightMinute,
  departureLights,
  DRIVING_LIGHTS,
  headlightsOn,
  homeDepartureLights,
  LIGHT_REACH,
  lightFade,
  lookSeed,
  lotLights,
  PARKED_LIGHTS,
  raceNight,
  SIGN_AT,
  streetPools,
  TAIL,
  trafficLights,
  tripLightMinute,
  type LitCar,
  type NightLights,
  type OwnLights,
  type RaceNightLevel,
} from "../view/racelight";
import { RaceNight } from "../view/racenight";
import { canvasNow, fitUiCamera } from "../view/viewport";
import {
  barMarkerY,
  barParts,
  DESTINATION_ROOFS,
  laneX,
  RACE_BAR_X,
  RACE_MARKER_SCALE,
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
import { startHintShown } from "../view/starthint";
import { DESTINATION_ICONS } from "../view/symbols";

const MAX_FRAME_SECONDS = 0.1;
/** Як часто перечитувати безпечну зону без зміни розміру екрана, мс (`RaceScene.safeCss`). */
const SAFE_REFRESH_MS = 1000;
/** Джойстик гонки: радіус, мертва зона й наскільки відхилити вбік, щоб перестроїтися. */
const STICK_RADIUS = 70;
const STICK_DEAD = 0.2;
const STICK_STEER = 0.5;

/**
 * Що показує сцена дороги (`scene.launch("race", …)`): гонку (§8.5), дорогу додому з чорного — катсцену без керування (знайда,
 * запасний шлях) — чи одразу кадр на місці (`parked`: поїздка вже на місці, а сцени дороги немає — перезавантаження сторінки).
 * `depart` — гонку, але спершу від'їзд від свого будинку (§8.5 «Виїзд із дому»): поїздка щойно вирушила від дверей
 * (`takeDeparture`), квартира вже темна. Передавати завжди: Phaser без даних лишає сцені ті, з якими її запускали минулого разу.
 */
export interface RoadStart {
  mode: "race" | "home" | "parked" | "depart";
}

/**
 * З чим сцена дороги будить день (`scene.wake("day", …)`): що вона показувала; чи скінчилася аварією — тоді екран уже чорний
 * (анімація аварії), і день тримає його чорним під карткою аварії; чи машина стала на парковці (`parked`) — тоді сцена дороги
 * не зупиняється, а лишається на кадрі на місці під карткою пункту, і день не темніє.
 */
export interface RoadEnd {
  mode: "race" | "home";
  crashed?: boolean;
  parked?: boolean;
}

/** Чи друкує зараз гравець у полі вводу (панель розробника): тоді клавіша катсцени не пропускає. */
function isTyping(): boolean {
  const active = document.activeElement;
  return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
}

export class RaceScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private label!: Phaser.GameObjects.Text;
  /** «W ↑» на дорозі на старті гонки (і поки машина стоїть), а гравець ще нічого не натискав (на клавіатурі; `startHintShown`). */
  private hint!: Phaser.GameObjects.Text;
  /** Гравець уже торкнувся екрана чи натиснув газ, гальмо чи смугу в цій гонці: підказка старту більше не потрібна. */
  private touched = false;
  /** Машини позаду сигналять, коли пригальмували за персонажем (§8.5). */
  private readonly horns = new Horns();
  /** Мотор гарчить, коли гравець натиснув газ. */
  private readonly revs = new Revs();
  /** Мотор гуде, поки машина їде: оберти — за швидкістю (`trip/engine.ts`). */
  private readonly engine = new EngineHum((sound) => sceneLoop("trip", sound));
  /** Сцена показує гонку від самого старту (від'їзд від дому чи свіжа гонка), а не з середини після перезавантаження (`startHintShown`). */
  private fromStart = false;
  private keys: Record<"up" | "down" | "up2" | "down2", Phaser.Input.Keyboard.Key> | null = null;
  private steer: -1 | 0 | 1 = 0;
  /** Плаваючий джойстик, як удома: вперед — газ, назад — гальмо, убік — перестроїтися. */
  private stick: { id: number; origin: { x: number; y: number }; x: number; y: number; steered: boolean } | null = null;
  /** Дорога, узбіччя, машини й смуга прогресу з атласу (крок 16, A14); створюється з кожною гонкою. */
  private art: RaceArt | null = null;
  /**
   * Темрява поверх дороги: аварія (§8.5), дорога додому з чорного — на початку й наприкінці, від'їзд із парковки — лише
   * наприкінці.
   */
  private dark!: Phaser.GameObjects.Rectangle;
  /**
   * Аварію показано (§8.5): скільки мс іде анімація (лише поки гра не стоїть) і з яким збереженням вона почалася — гру
   * замінили посеред анімації, і день сам покаже, що треба.
   */
  private crash: { ms: number; save: Save } | null = null;
  /**
   * Дорога додому (§8.5): скільки мс іде катсцена, з яким збереженням почалася, чи гравець її пропустив і звідки — з парковки
   * (від'їзд, `departureFrame`, з того місця, що й на місці) чи з чорного (`homeRoadFrame`).
   */
  private home: ({ ms: number; save: Save; skipped: boolean } & ({ from: "black" } | { from: "parked"; at: ParkedAt })) | null = null;
  /**
   * Прибуття (§8.5 «На місці — кадр парковки»): знімок гонки в мить фінішу (`arrivalStart`; той самий об'єкт до кінця —
   * план прибуття рахується з нього раз), скільки мс іде анімація й з яким збереженням вона почалася.
   */
  private arrival: { start: ArrivalStart; ms: number; save: Save } | null = null;
  /** На місці: кадр парковки під карткою пункту — з яким збереженням, де стала машина й який пункт. */
  private parked: ({ save: Save } & ParkedAt) | null = null;
  /**
   * Від'їзд від свого будинку перед гонкою (§8.5 «Виїзд із дому»): скільки мс іде, з яким збереженням почався, чи гравець його
   * пропустив і знімок старту гонки (`homeDepartureStart`). Скінчився — гонка в тій самій сцені, без розриву.
   */
  private leave: { ms: number; save: Save; skipped: boolean; start: HomeDepartureStart } | null = null;
  /** Натискання вже пропускає катсцену (`listenSkip`): обробники — раз на показ сцени. */
  private skipListening = false;
  /** Де парковка на місці зараз (`parkingLayout`): щокадру — розмір екрана й безпечна зона змінюються. */
  private place: ParkingLayout = { aside: false, pan: 0, strip: null };
  /** Ключ кадру на місці, що вже намальований (`parkedKey`): кадр нерухомий, і за тим самим ключем його не перемальовують. */
  private parkedDrawn: string | null = null;
  /**
   * Безпечна зона, px CSS (`safeArea`): читати її стиль щокадру дорого, тож — зі зміною розміру екрана й раз на `SAFE_REFRESH_MS`
   * (телефон, перевернутий набік іншим боком, міняє бік вирізу, а розмір — ні).
   */
  private safeCss: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  /** Коли (час сцени, мс) перечитати безпечну зону. */
  private safeAt = 0;

  constructor(private readonly session: Session) {
    super("race");
  }

  private get state(): GameState {
    return this.session.save.current;
  }

  create(data?: Partial<RoadStart>): void {
    const art = new RaceArt(this, icyRoad(this.state));
    this.art = art;
    // Phaser перевикористовує сцену: стан минулого показу — геть, і день не бачить парковки, якої вже немає.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      art.destroy();
      this.engine.stop();
      this.parked = null;
      this.arrival = null;
      this.leave = null;
    });
    this.crash = null;
    this.arrival = null;
    this.skipListening = false;
    this.place = { aside: false, pan: 0, strip: null };
    this.parkedDrawn = null;
    this.safeCss = safeArea();
    const resized = (): void => {
      this.safeCss = safeArea();
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, resized);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, resized));
    this.home = data?.mode === "home" ? { ms: 0, save: this.session.save, skipped: false, from: "black" } : null;
    const trip = this.state.trip;
    this.parked = data?.mode === "parked" && trip?.phase === "visit" ? { save: this.session.save, ...parkedAt(trip) } : null;
    // Від'їзд від свого будинку — лише перед свіжою гонкою (ще не їхали): інакше — одразу гонка, як і раніше.
    const state = this.state;
    this.leave =
      data?.mode === "depart" && trip?.phase === "drive" && trip.race.minutes === 0 && state.end === null
        ? { ms: 0, save: this.session.save, skipped: false, start: homeDepartureStart(trip.race, state.seed, state.difficulty, trafficFactor(state), gripFactor(state)) }
        : null;
    // Темрява — над усім, і над написом.
    this.dark = this.add.rectangle(0, 0, 1, 1, 0x000000, 0).setOrigin(0).setDepth(RACE_DEPTH.dark);
    // Над полем і дорогою: джойстик і підказка, а написи — з чорнильною обвідкою, щоб читалися на траві.
    this.g = this.add.graphics().setDepth(RACE_DEPTH.ui);
    this.label = this.add
      .text(0, 0, "", { fontFamily: "system-ui, sans-serif", fontSize: "22px", color: "#f3e9dc", fontStyle: "bold", resolution: 2 })
      .setDepth(RACE_DEPTH.ui)
      .setStroke(PALETTE.ink, 5);
    this.hint = this.add
      .text(0, 0, RACE_START_HINT, { fontFamily: "system-ui, sans-serif", fontSize: "26px", color: "#f3e9dc", fontStyle: "bold", resolution: 2 })
      .setOrigin(0.5, 1)
      .setVisible(false)
      .setDepth(RACE_DEPTH.ui)
      .setStroke(PALETTE.ink, 5);
    // Керування — лише своєї гонки: перестроювання, натиснуте ще в минулій (на прибутті, на місці, у від'їзді), сюди не переходить.
    this.touched = false;
    this.fromStart = trip?.phase === "drive" && trip.race.minutes === 0;
    this.stick = null;
    this.steer = 0;
    if (this.home) {
      this.listenSkip();
      return;
    }
    // На місці одразу (перезавантаження сторінки): кадр парковки без керування гонки — день уже показує меню чи картку поверх.
    if (data?.mode === "parked") {
      this.drawParked();
      return;
    }
    if (trip) art.prepare(trip);
    if (this.leave) {
      art.prepareHome(this.leave.start);
      this.listenSkip();
    }
    const keyboard = this.input.keyboard;
    if (keyboard) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      this.keys = keyboard.addKeys({ up: K.W, down: K.S, up2: K.UP, down2: K.DOWN }, false) as RaceScene["keys"];
      for (const [key, dir] of [["LEFT", -1], ["A", -1], ["RIGHT", 1], ["D", 1]] as const) {
        keyboard.on(`keydown-${key}`, () => {
          if (this.steering()) this.steer = dir;
        });
      }
    }
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.down(p));
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.moveStick(p));
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => this.up(p));
    this.input.on("pointerupoutside", (p: Phaser.Input.Pointer) => this.up(p));
    // Телефон повернули вертикально — гонка на паузі (§10), а джойстик скидається, щоб після повороту машина не газувала сама.
    const stop = onRotateNotice((shown) => {
      if (shown) this.stick = null;
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
    // Перший кадр — уже чорний кадр від'їзду: сцена не блимне тим, що стоїть на місцях за замовчуванням.
    if (this.leave) this.drawLeave();
  }

  /**
   * Дорогу додому пропускає будь-яке натискання (§8.5): дотик, клавіша миші чи клавіатури — але не те, що закрило картку
   * візиту (`canSkipHomeRoad`), і не клавіша в полі панелі розробника. Від'їзд від свого будинку — так само, з першої миті:
   * картку «Куди поїхати?» закрили ще в квартирі, до її затемнення (§8.5 «Виїзд із дому»: натискання пропускає — одразу гонка).
   */
  private listenSkip(): void {
    if (this.skipListening) return;
    this.skipListening = true;
    const skip = (): void => {
      const home = this.home;
      if (home && canSkipHomeRoad(home.ms)) home.skipped = true;
      if (this.leave) this.leave.skipped = true;
    };
    this.input.on("pointerdown", skip);
    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      if (!event.repeat && !isTyping()) skip();
    });
  }

  /**
   * Чи гравець зараз кермує: гонка, а не аварія, прибуття, кадр на місці чи від'їзд. Обробники керування з `create` живуть, доки
   * працює сцена, а вона тепер лишається й на прибутті, на місці під карткою пункту й у від'їзді: там стрілка чи дотик нічого не
   * кермують — інакше перестроювання лишилося б у полі й наступна гонка почалася б із нього (машина сама в сусідню смугу, а
   * підказки старту немає). Від'їзд від свого будинку — теж без керування: дотик лише пропускає його, і гонка починається з
   * підказкою старту.
   */
  private steering(): boolean {
    return this.home === null && this.crash === null && this.arrival === null && this.parked === null && this.leave === null;
  }

  /** Джойстик з'являється під пальцем будь-де на екрані. Точка дотику — у пікселях полотна, гонка — в одиницях інтерфейсу. */
  private down(p: Phaser.Input.Pointer): void {
    if (!this.steering()) return;
    this.touched = true;
    if (this.stick !== null) return;
    const ui = canvasNow().ui;
    this.stick = { id: p.id, origin: { x: p.x / ui, y: p.y / ui }, x: 0, y: 0, steered: false };
  }

  private moveStick(p: Phaser.Input.Pointer): void {
    const stick = this.stick;
    if (stick?.id !== p.id) return;
    const ui = canvasNow().ui;
    const dx = p.x / ui - stick.origin.x;
    const dy = p.y / ui - stick.origin.y;
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

  override update(time: number, delta: number): void {
    if (time >= this.safeAt) {
      this.safeCss = safeArea();
      this.safeAt = time + SAFE_REFRESH_MS;
    }
    if (this.home) return this.updateHome(delta);
    if (this.crash) return this.updateCrash(delta);
    if (this.arrival) return this.updateArrival(delta);
    if (this.parked) return this.updateParked();
    if (this.leave) return this.updateLeave(delta);
    this.updateRace(delta);
  }

  /** Кадр гонки: крок сима з керуванням гравця, тоді кадр — машини потоку вже з цього кроку. */
  private updateRace(delta: number): void {
    const state = this.state;
    if (state.trip?.phase !== "drive" || state.end !== null) return this.finish({ mode: "race" });
    if (this.running()) {
      const seconds = Math.min(delta / 1000, MAX_FRAME_SECONDS);
      const input = this.input_();
      const { result, night } = drive(this.session.save, raceMinutes(seconds) * (__DEV_TOOLS__ ? this.session.speed : 1), input);
      const race = this.state.trip?.race;
      if (result === null && race) {
        if (this.horns.tick(race, seconds * 1000)) uiSound("trip", "horn");
        if (this.revs.tick(input.throttle)) uiSound("trip", "rev");
      }
      // Врізалися (сим уже застосував аварію, §8.5) — спершу анімація аварії тут, а картку покаже день.
      if (result === "crash" && night === null && state.end === null) return this.startCrash();
      // Доїхали (§8.5 «На місці — кадр парковки») — спершу прибуття на парковку тут, а картку пункту покаже день поверх неї.
      // Ніч чи кінець гри в ту саму мить — день одразу, як і раніше.
      if (result === "arrived" && night === null && state.end === null && this.state.trip?.phase === "visit") return this.startArrival();
      if (result !== null || night !== null) return this.finish({ mode: "race" });
    }
    const race = state.trip?.race;
    if (race) this.hum(engineRate(race.speed));
    this.draw();
  }

  /** Мотор гуде з висотою `rate`: на паузі тихо, як петлі квартири, і згасає разом із темрявою катсцени (`dark`). */
  private hum(rate: number, dark = 0): void {
    this.engine.run(rate, (this.running() ? 1 : SFX.pausedLoops) * (1 - dark));
  }

  /** Машина стоїть на парковці під карткою пункту (§8.5 «На місці — кадр парковки»): день показує картку пункту, лише коли так. */
  get parkedNow(): boolean {
    return this.parked !== null;
  }

  /** Чи картку пункту притиснути ліворуч (`Overlay.setAside`): праворуч від неї вміщається парковка (`parkingLayout`, щокадру). */
  get parkingAside(): boolean {
    return this.parked !== null && this.place.aside;
  }

  /**
   * Непрозора картка дня закриває гру (`Overlay.covers`, §2.1 «Малювання й завантаження»): тоді сцена дороги не малюється — день
   * ставить це щокадру, поки вона працює (кадр на місці під меню після перезавантаження сторінки).
   */
  cover(on: boolean): void {
    this.sys.setVisible(!on);
  }

  /**
   * «Додому» з місця (§8.5 «На місці — кадр парковки»): машина виїжджає з парковки й без розриву йде дорога додому — від'їзд
   * (`departureFrame`) з того самого кадру, без затемнення на початку; пропуск натисканням, як у дорозі додому. Повертає false,
   * якщо машина не стоїть на парковці (знайда, сцени дороги немає): тоді день запускає дорогу додому з чорного сам.
   */
  depart(): boolean {
    const parked = this.parked;
    if (!parked || !this.sys.isActive()) return false;
    this.parked = null;
    this.parkedDrawn = null;
    this.home = { ms: 0, save: this.session.save, skipped: false, from: "parked", at: { spot: parked.spot, destination: parked.destination } };
    sceneMoment("unparked");
    this.stick = null;
    this.g.clear();
    this.label.setVisible(false);
    this.listenSkip();
    return true;
  }

  /** Чи йде час дороги: пауза розробника чи заглушка «Поверніть телефон» (§10) зупиняють і гонку, і анімації. */
  private running(): boolean {
    return !(__DEV_TOOLS__ && this.session.paused) && !isRotateNoticeShown();
  }

  /** Мілісекунди анімації за кадр: стільки ж, скільки гра йде (довгий кадр — не більше 0,1 с). */
  private animationMs(delta: number): number {
    return this.running() ? Math.min(delta, MAX_FRAME_SECONDS * 1000) : 0;
  }

  private finish(end: RoadEnd): void {
    this.engine.stop();
    this.stick = null;
    this.arrival = null;
    this.parked = null;
    this.leave = null;
    this.scene.wake("day", end);
    this.scene.stop();
  }

  /**
   * Від'їзд від свого будинку (§8.5 «Виїзд із дому»): йде, поки гра не стоїть, без керування, і час гри тим часом не йде (сим не
   * кличемо). Скінчився чи гравець натиснув будь-що — гонка в цій самій сцені: кадр кінця від'їзду — це кадр її старту, тож
   * розриву немає, а пропуск — одразу гонка. Гру замінили чи поїздка вже не та (сценарій) — день: він сам покаже, що треба.
   * Перезавантаження сторінки посеред від'їзду — одразу гонка: позначка від'їзду (`takeDeparture`) живе лише в пам'яті.
   *
   * Перший кадр гонки — уже з кроком сима того самого кадру (`updateRace`): машини потоку сим ставить лише першим кроком
   * (`driveRace`), і кадр гонки без нього на мить лишився б без них (уночі — і без їхніх фар), а наступний кадр поставив би їх
   * знову (рецензія від'їзду 2026-11-03). Крок — ті самі машини, що в знімку старту (`homeDepartureStart`) і в кадрі кінця
   * від'їзду.
   *
   * Машина стартує не з місця (§8.5, рішення автора 2026-11-03): кадр кінця від'їзду — гонка в мить старту, а дорога в ньому
   * біжить зі швидкістю старту. Тож від'їзд, що скінчився сам, передає гонці лише ту частку кадру, яка вже за його кінцем: інакше
   * дорога за цей кадр проїхала б більше, ніж за звичайний, — ривок. Кінець припав рівно на кадр — у ньому й лишається кадр кінця
   * від'їзду (там ті самі машини потоку), а гонка — з наступного. Пропуск — як і раніше, крок на весь кадр.
   */
  private updateLeave(delta: number): void {
    const leave = this.leave;
    if (!leave) return;
    const state = this.state;
    if (this.session.save !== leave.save || state.trip?.phase !== "drive" || state.end !== null) return this.finish({ mode: "race" });
    leave.ms += this.animationMs(delta);
    // Заводять на початку від'їзду (подія `trip-started`): гудіння — після звуку запуску, машина розганяється до швидкості старту.
    if (leave.ms >= ENGINE.startDelayMs) this.hum(engineRate(RACE.startSpeed * Math.min(1, leave.ms / HOME_DEPARTURE.ms)));
    if (!leave.skipped && !this.drawLeave()) return;
    const over = leave.skipped ? delta : leave.ms - HOME_DEPARTURE.ms;
    this.leave = null;
    this.dark.setFillStyle(0x000000, 0);
    if (over > 0) this.updateRace(over);
  }

  /**
   * Кадр від'їзду від свого будинку (`homeDepartureFrame`): парковка з дахом свого кольору й гліфом дому на табличці, вогні
   * своєї машини (`homeDepartureLights`), темрява з чорного на початку; наприкінці проступають напис і смуга прогресу гонки.
   * Повертає, чи від'їзд скінчився.
   */
  private drawLeave(): boolean {
    const leave = this.leave;
    const art = this.art;
    const trip = this.state.trip;
    if (!leave || !art || !trip) return true;
    const view = this.layout();
    const frame = homeDepartureFrame(leave.ms, view.height, leave.start);
    const panned = { ...view, cx: view.width / 2 + frame.pan * lotFitPan(view) };
    art.drawFrame(
      { offset: frame.offset, car: frame.car, traffic: frame.traffic, lot: { y: frame.lot, place: "home", cars: frame.parked }, lights: homeDepartureLights(leave.ms) },
      panned,
    );
    const hud = homeDepartureHud(leave.ms);
    art.drawBar(trip, panned, hud);
    const g = this.g.clear();
    if (hud > 0) {
      this.drawLabel(trip, view.safe, hud);
      // Підказка старту проступає разом із написом, над передом своєї машини, що якраз доїжджає до старту (без гальмування, §8.5):
      // наприкінці від'їзду вона там само й така сама, як у першому кадрі гонки (`draw`), — не з'являється стрибком (рецензія
      // від'їзду 2026-11-03).
      this.drawStartHint(g, startHintShown(trip.race, this.fromStart, this.touched), panned, { x: panned.cx + frame.car.x, y: frame.car.y }, hud);
    } else {
      this.label.setVisible(false);
      this.hint.setVisible(false);
    }
    this.dark.setSize(view.width, view.height).setFillStyle(0x000000, frame.dark);
    return frame.done;
  }

  /**
   * Прибуття (§8.5 «На місці — кадр парковки»): керування більше немає — напис, підказка, джойстик і смуга прогресу зникають, а
   * машина без стрибка гальмує від своєї швидкості в мить фінішу й звертає на своє місце на парковці (`arrivalFrame`).
   */
  private startArrival(): void {
    const trip = this.state.trip;
    const art = this.art;
    if (!trip || !art) return this.finish({ mode: "race" });
    const start = arrivalStart(trip.race, trip.seed, __DEV_TOOLS__ ? this.session.speed : 1, (car) => art.lookOf(car));
    this.arrival = { start, ms: 0, save: this.session.save };
    this.stick = null;
    this.g.clear();
    this.label.setVisible(false);
    this.hint.setVisible(false);
    this.drawArrival();
  }

  /**
   * Анімація прибуття йде, поки гра не стоїть; скінчилася — кадр на місці, і день показує картку пункту поверх нього (сцена дороги
   * лишається). Гру замінили, поїздка вже не на місці чи гра скінчилася — день одразу: він сам покаже, що треба. Перезавантаження
   * сторінки посеред прибуття — одразу кадр на місці: сим уже на місці, а анімація нічого не зберігає.
   */
  private updateArrival(delta: number): void {
    const arrival = this.arrival;
    if (!arrival) return;
    const state = this.state;
    const trip = state.trip;
    if (this.session.save !== arrival.save || trip?.phase !== "visit" || state.end !== null) return this.finish({ mode: "race" });
    arrival.ms += this.animationMs(delta);
    // Машина гальмує на парковку — мотор скидає оберти.
    this.hum(engineRate(trip.race.speed * Math.max(0, 1 - arrival.ms / arrivalMs(arrival.start))));
    if (!this.drawArrival()) return;
    this.engine.stop();
    sceneMoment("parked");
    this.arrival = null;
    this.parked = { save: arrival.save, ...parkedAt(trip) };
    this.drawParked();
    this.scene.wake("day", { mode: "race", parked: true } satisfies RoadEnd);
  }

  /** Кадр прибуття: дорога гальмує, машина звертає на парковку, світ зсувається вбік. Повертає, чи анімація скінчилася. */
  private drawArrival(): boolean {
    const arrival = this.arrival;
    const art = this.art;
    const trip = this.state.trip;
    if (!arrival || !art || !trip) return true;
    const view = this.layout();
    this.place = this.parkingPlace(view);
    const frame = arrivalFrame(arrival.ms, view.height, arrival.start);
    art.drawFrame(parkingRoad(frame, trip.destination, arrivalLights(arrival.ms, arrivalMs(arrival.start))), this.panned(view, frame.pan));
    return frame.done;
  }

  /**
   * На місці: кадр нерухомий, поки день показує картку пункту. Гру замінили, а поїздка й далі на місці (сценарій) — той самий
   * кадр уже нового пункту; поїздки на місці більше немає чи гра скінчилася — сцена зупиняється сама, без пробудження дня: він
   * не спить, а з цієї миті вже не чекає парковки (`parkedNow`).
   */
  private updateParked(): void {
    const parked = this.parked;
    if (!parked) return;
    const state = this.state;
    const trip = state.trip;
    if (trip?.phase !== "visit" || state.end !== null) {
      this.parked = null;
      this.scene.stop();
      return;
    }
    if (this.session.save !== parked.save) this.parked = { save: this.session.save, ...parkedAt(trip) };
    if (this.parkedKeyOf(parked) !== this.parkedDrawn) this.drawParked();
  }

  /** Від чого залежить кадр на місці зараз (`parkedKey`): розмір і щільність полотна, безпечна зона, місце, світло й годинник. */
  private parkedKeyOf(parked: ParkedAt): string {
    const game = this.scale.gameSize;
    const fit = canvasNow();
    const light = this.lightMinute();
    return parkedKey({ width: game.width, height: game.height, ui: fit.ui, unit: fit.unit, safe: this.safeCss, spot: parked.spot, destination: parked.destination, light, clock: formatClock(this.state.minute) });
  }

  /** Кадр на місці (`parkedFrame`) і напис «пункт · час» угорі вільної смуги. */
  private drawParked(): void {
    const parked = this.parked;
    const art = this.art;
    if (!parked || !art) return;
    const view = this.layout();
    this.place = this.parkingPlace(view);
    const frame = parkedFrame(view.height, parked.spot);
    art.drawFrame(parkingRoad(frame, parked.destination, PARKED_LIGHTS), this.panned(view, frame.pan));
    this.dark.setFillStyle(0x000000, 0);
    this.drawParkedLabel(parked.destination, view.safe.top);
    this.parkedDrawn = this.parkedKeyOf(parked);
  }

  /**
   * Аварія (§8.5): як засинання (§8.8) — машина стоїть, де врізалася, камера наїжджає на неї, екран темніє до чорного. Керування
   * більше немає, напис і підказка зникають; поштовх камери — мить удару.
   */
  private startCrash(): void {
    this.engine.stop();
    this.crash = { ms: 0, save: this.session.save };
    this.stick = null;
    this.g.clear();
    this.label.setVisible(false);
    this.hint.setVisible(false);
    this.cameras.main.shake(CRASH_FX.shakeMs, CRASH_FX.shake);
    this.drawCrash();
  }

  /**
   * Анімація аварії йде, поки гра не стоїть; скінчилася — день, і він покаже картку аварії. Гру замінили (сценарій, нова гра)
   * чи аварії вже немає — день одразу: він сам покаже, що треба. Перезавантаження сторінки посеред анімації — одразу картка:
   * сим уже в аварії, а анімація нічого не зберігає.
   */
  private updateCrash(delta: number): void {
    const crash = this.crash;
    if (!crash) return;
    if (this.session.save !== crash.save || this.state.trip?.phase !== "accident") return this.finish({ mode: "race" });
    crash.ms += this.animationMs(delta);
    if (this.drawCrash()) this.finish({ mode: "race", crashed: true });
  }

  /** Кадр аварії: гонка, як у мить удару, з наїздом камери й темрявою (`crashView`). Повертає, чи анімація скінчилася. */
  private drawCrash(): boolean {
    const trip = this.state.trip;
    const art = this.art;
    const crash = this.crash;
    if (!trip || !art || !crash) return true;
    const view = this.layout();
    art.draw(trip, view);
    const frame = crashView(crash.ms, { x: laneX(view.cx, trip.race.lane, view.k), y: view.playerY }, view);
    this.cameras.main.setZoom(canvasNow().ui * frame.zoom).setScroll(frame.scroll.x, frame.scroll.y);
    // Камера не виходить за кадр (`crashView`), тож темрява на весь кадр закриває все, що видно.
    this.dark.setSize(view.width, view.height).setFillStyle(0x000000, frame.dark);
    return frame.done;
  }

  /**
   * Дорога додому (§8.5): катсцена йде, поки гра не стоїть, і закінчується сама чи натисканням; тоді день — він і рахує час
   * дороги (`goHome`), як раніше. З місця вона починається від'їздом із парковки (`departureFrame`: світ зсунутий так само, як на
   * місці, і повертається до середини дороги), інакше — з чорного (`homeRoadFrame`). Гру замінили посеред катсцени — день
   * одразу, і дороги він не рахує. Перезавантаження сторінки посеред неї — знову кадр на місці й картка пункту: сим ще на місці.
   */
  private updateHome(delta: number): void {
    const home = this.home;
    const art = this.art;
    if (!home || !art) return;
    if (home.skipped || this.session.save !== home.save) return this.finish({ mode: "home" });
    home.ms += this.animationMs(delta);
    const view = this.layout();
    let frame: { dark: number; done: boolean };
    if (home.from === "parked") {
      this.place = this.parkingPlace(view);
      const departure = departureFrame(home.ms, view.height, home.at.spot);
      art.drawFrame(parkingRoad(departure, home.at.destination, departureLights(home.ms)), this.panned(view, departure.pan));
      frame = departure;
    } else {
      // Уночі — з запасом на промінь фар: попутна за верхнім краєм світить донизу, у кадр (`LIGHT_REACH`).
      const road = homeRoadFrame(home.ms, view.height, view.night ? (LIGHT_REACH - CAR_REACH) * view.k : 0);
      art.drawFrame(homeRoad(road, view.k), view);
      frame = road;
    }
    this.dark.setSize(view.width, view.height).setFillStyle(0x000000, frame.dark);
    // З парковки щойно завели (`unparked`): гудіння — після звуку запуску; з чорного — одразу.
    if (home.from !== "parked" || home.ms >= ENGINE.startDelayMs) this.hum(engineRate(RACE.startSpeed), frame.dark);
    if (frame.done) this.finish({ mode: "home" });
  }

  /**
   * Де парковка на місці (`parkingLayout`): картка пункту, притиснута ліворуч (`asideCardRight` — у px CSS, як її кладе
   * `overlay.css`), і вільна смуга праворуч від неї. Вікно й безпечна зона в px CSS — кадр в одиницях інтерфейсу, поділений на
   * одиниці на px.
   */
  private parkingPlace(view: RaceView): ParkingLayout {
    const unit = canvasNow().unit;
    const css = { width: view.width / unit, height: view.height / unit };
    return parkingLayout(view, asideCardRight(css, view.safe.left / unit, view.safe.right / unit) * unit);
  }

  /** Кадр зі світом, зсунутим убік на частку `pan` зсуву парковки (`ParkingLayout.pan`): середина дороги — `cx`. */
  private panned(view: RaceView, pan: number): RaceView {
    return { ...view, cx: view.width / 2 + pan * this.place.pan };
  }

  /**
   * Розміри кадру дороги: в одиницях інтерфейсу (1280 × 720, що ширшає чи вищає) — полотно в пікселях пристрою, камера
   * масштабує (`fitUiCamera` щокадру ставить звичайний масштаб і прокрутку; наїзд аварії — поверх). І ніч гонки (§8.9) — щокадру
   * плавно за годинником: гонка його рухає, тож ніч може настати посеред неї.
   */
  private layout(): RaceView {
    const { width, height } = fitUiCamera(this.cameras.main, this.scale.gameSize);
    const css = this.safeCss;
    const unit = canvasNow().unit;
    const safe = { top: css.top * unit, right: css.right * unit, bottom: css.bottom * unit, left: css.left * unit };
    const minute = this.lightMinute();
    const night = raceNight(minute === null ? null : daylight(minute, true));
    return { width, height, k: raceScale(height), ppu: racePixelsPerUnit(height), cx: width / 2, playerY: height * RACE_PLAYER_Y, safe, night };
  }

  /**
   * На яку хвилину світло доби на дорозі (§8.9): у гонці, на прибутті, в аварії й на місці — годинник гри; на від'їзді й у
   * дорозі додому — уже з часом візиту й частки дороги, які сим додасть, коли катсцена скінчиться (`tripLightMinute`), — тож
   * удома тон не стрибає. Режим розробки задає хвилину сам (`Session.lightAt`, `?light=`); `off` — без світла доби (null).
   */
  private lightMinute(): number | null {
    const at = __DEV_TOOLS__ ? this.session.lightAt : null;
    if (at === "off") return null;
    if (at !== null) return at;
    const home = this.home;
    if (!home) return tripLightMinute(this.state, "drive");
    return home.from === "parked" ? departureLightMinute(this.state, home.ms) : tripLightMinute(this.state, "home", home.ms / HOME_ROAD.ms);
  }

  /**
   * Кадр гонки (крок 16, A14): поле й дорога плитками, що біжать донизу, машини з атласу, смуга прогресу; поверх — джойстик,
   * підказка старту й напис.
   */
  private draw(): void {
    const trip = this.state.trip;
    const art = this.art;
    if (!trip || !art) return;
    const race = trip.race;
    const view = this.layout();
    const g = this.g.clear();
    art.draw(trip, view);
    this.drawStick(g);
    this.drawStartHint(g, startHintShown(race, this.fromStart, this.touched), view, { x: laneX(view.cx, race.lane, view.k), y: view.playerY });
    this.drawLabel(trip, view.safe);
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

  /** Куди їдемо, котра година й швидкість — угорі ліворуч (`alpha` — поки проступає наприкінці від'їзду від свого будинку). */
  private drawLabel(trip: Trip, safe: Insets, alpha = 1): void {
    this.label
      .setOrigin(0, 0)
      .setPosition(safe.left + 20, safe.top + 16)
      .setText(`${DESTINATION_TITLES[trip.destination]} · ${formatClock(this.state.minute)} · ×${trip.race.speed.toFixed(1).replace(".", ",")}`)
      .setAlpha(alpha)
      .setVisible(true);
  }

  /**
   * На місці (§8.5 «На місці — кадр парковки»): панелі квартири немає — угорі вільної смуги праворуч від картки назва пункту й
   * годинник, без швидкості (над будівлею, а не на ній). Картка посередині — напису немає: вільної смуги нема, а висока картка
   * (магазин на 667 × 375) закрила б його цілком; годинник тоді — у підзаголовку картки пункту (`Card.awayClock`).
   */
  private drawParkedLabel(destination: Destination, top: number): void {
    const strip = this.place.strip;
    if (!strip) {
      this.label.setVisible(false);
      return;
    }
    this.label
      .setText(`${DESTINATION_TITLES[destination]} · ${formatClock(this.state.minute)}`)
      .setOrigin(0.5, 0)
      .setPosition((strip.left + strip.right) / 2, top + 16)
      .setVisible(true);
  }

  /**
   * Підказка без слів на старті (§8.5, §11.3а «показуй, а не розказуй»; загальна ревізія 2026-10-29): гонка від самого старту чи
   * машина стоїть, а гравець ще нічого не натискав (`startHintShown`) — на сенсорному екрані ліворуч від дороги ледь помітно
   * пульсує тінь джойстика, що тягнеться вгору, а з клавіатурою над машиною — «W ↑». Від першого дотику чи натискання підказка
   * зникає до кінця гонки. `car` — середина своєї машини на екрані, `fade` — частка проступання (наприкінці від'їзду від свого
   * будинку, `homeDepartureHud`).
   */
  private drawStartHint(g: Phaser.GameObjects.Graphics, shown: boolean, view: RaceView, car: { x: number; y: number }, fade = 1): void {
    const touch = isCoarsePointer();
    const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 300);
    this.hint.setVisible(shown && !touch);
    if (!shown) return;
    if (!touch) {
      this.hint.setPosition(car.x, car.y - RACE_CAR_FRONT * view.k).setAlpha((0.35 + 0.4 * pulse) * fade);
      return;
    }
    // Тінь джойстика — ліворуч від дороги, посередині поля (не ближче до краю, ніж безпечна зона).
    const roadLeft = view.cx - RACE_TILES.road.curb * view.k;
    const x = Math.max(view.safe.left + STICK_RADIUS + 12, roadLeft / 2);
    const y = view.height * 0.62;
    // Палець тягне ручку вгору й відпускає — раз на секунду.
    const reach = ((this.time.now / 1100) % 1) * STICK_RADIUS * 0.7;
    const alpha = (0.1 + 0.15 * pulse) * fade;
    g.fillStyle(0xffffff, alpha * 0.6).fillCircle(x, y, STICK_RADIUS);
    g.lineStyle(3, 0xffffff, alpha * 1.6).strokeCircle(x, y, STICK_RADIUS);
    g.fillStyle(0xffffff, alpha * 1.8).fillCircle(x, y - reach, 30);
    // Стрілка вгору над тінню.
    const tip = y - STICK_RADIUS - 34;
    g.fillStyle(0xffffff, alpha * 2).fillTriangle(x, tip, x - 16, tip + 20, x + 16, tip + 20);
  }
}

// --- Арт гонки (крок 16, A14) ------------------------------------------------------------------------

/**
 * Шари гонки: поле, дорога, парковка пункту (з'їзд — над дорогою), машини потоку й запарковані, своя машина, будівля пункту
 * (над машинами) й іконка на її табличці, смуга прогресу, джойстик і напис; над усім — темрява. Ніч (§8.9, `RaceNight`): світло
 * ночі — над будівлею й під іконкою таблички (табличка «світиться»), над ним — самі фари, задні вогні й ореол таблички; смуга
 * прогресу, машинка на ній, джойстик і написи — над ніччю, тож HUD гонки не темніє.
 */
const RACE_DEPTH = {
  verge: 0,
  road: 1,
  /** Лід «Ожеледиці» (`raceice.ts`) — над дорогою, під парковкою (її з'їзд перекриває бордюр) і машинами. */
  ice: 1.5,
  lot: 2,
  traffic: 3,
  player: 4,
  building: 5,
  night: 5.5,
  beams: 5.7,
  tails: 5.8,
  signGlow: 5.9,
  sign: 6,
  bar: 7,
  marker: 8,
  ui: 10,
  dark: 20,
} as const;
/** Від середини своєї машини до її переду з контуром, одиниці арту (`race/car/player`): над ним — підказка «W ↑». */
const RACE_CAR_FRONT = 34;
/** Власник запечених дахів будівлі пункту (`releaseBaked` наприкінці сцени). */
const BUILDING_OWNER = "race:building";

/**
 * Розміри кадру гонки: полотно, масштаб арту, пікселів на одиницю дороги, середина дороги, де своя машина, безпечна зона; ніч
 * гонки (`raceNight`; удень — null).
 */
interface RaceView {
  width: number;
  height: number;
  k: number;
  ppu: number;
  cx: number;
  playerY: number;
  safe: Insets;
  night: RaceNightLevel | null;
}

/**
 * Кадр дороги без керування (§8.5): прибуття, на місці, від'їзд із парковки чи дорога додому. Зсув дороги — як `distance` у
 * `drawRoad`; x машин — px від середини дороги (`RaceView.cx`), поворот — радіани (0 — носом угору); парковка пункту — середня
 * лінія з'їзду (px кадру), пункт і запарковані машини, або null — дорога без парковки. Уночі (§8.9): вогні своєї машини
 * (`lights`; на місці — вимкнено) і за скільки одиниць арту за краєм кадру гаснуть вогні попутних (`lightBand`, `lightFade`).
 */
interface RoadFrame {
  offset: number;
  car: CarPose;
  traffic: readonly ParkingCar[];
  lot: { y: number; place: LotPlace; cars: readonly ParkingCar[] } | null;
  lights: OwnLights;
  lightBand?: number;
}

/** Рецепт машини потоку: кузов (`fill`) — колір потоку, решта шарів — як намальовано (тінь — звичайним накладанням). */
function trafficRecipe(color: number): TintRecipe {
  const tint = TRAFFIC_COLORS[color] ?? COLORS.paper;
  return bakedRecipe(`race-car-${tint.toString(16)}`, tint);
}

/**
 * Рецепт будівлі пункту: дах (`fill`) — колір пункту (`DESTINATION_ROOFS`), решта — як намальовано, як у машин потоку. Свій
 * будинок (§8.5 «Виїзд із дому») — дах свого кольору (`HOME_LOT.roof`).
 */
function buildingRecipe(place: LotPlace): TintRecipe {
  const tint = place === "home" ? HOME_LOT.roof : DESTINATION_ROOFS[place];
  return bakedRecipe(`race-building-${tint.toString(16)}`, tint);
}

function bakedRecipe(key: string, tint: number): TintRecipe {
  return {
    key,
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
 * перестроюється, а смуга прогресу розтягується трьома частинами кадру, і на ній — своя машинка, зменшена. За фінішем —
 * парковка пункту (§8.5 «На місці — кадр парковки», `src/view/parking.ts`): з'їзд і місця, запарковані машини, будівля з
 * дахом кольору пункту (запечений, власник `race:building`) і табличка з іконкою пункту. Усе, що на дорозі й біля неї, стоїть
 * від середини дороги `RaceView.cx`: на місці світ зсунуто вбік ним, а не камерою. Зображення беруться з пулів і ховаються,
 * коли зайві. У тиждень «Ожеледиці» асфальт укриває лід (`RaceIceLayer`).
 */
class RaceArt {
  private readonly verge: Phaser.GameObjects.Image[] = [];
  private readonly road: Phaser.GameObjects.Image[] = [];
  private readonly traffic: Phaser.GameObjects.Image[] = [];
  /** Запарковані машини на парковці пункту. */
  private readonly parked: Phaser.GameObjects.Image[] = [];
  private readonly player: Phaser.GameObjects.Image;
  private readonly track: Phaser.GameObjects.Image[];
  private readonly fill: Phaser.GameObjects.Image[];
  /** Своя машинка на смузі прогресу — там, де пройдене. */
  private readonly marker: Phaser.GameObjects.Image;
  /** Парковка пункту, будівля (з першої появи) й іконка пункту на табличці. */
  private readonly lot: Phaser.GameObjects.Image;
  private building: Phaser.GameObjects.Image | null = null;
  private readonly sign: Phaser.GameObjects.Image;
  /** Вигляд машини потоку — з першої зустрічі (`trafficLook`): машина, яку сим відсуває назад, не перефарбовується. */
  private readonly looks = new WeakMap<RaceCar, TrafficLook>();
  /** Що показує зображення потоку (вид і рецепт). */
  private readonly shown = new WeakMap<Phaser.GameObjects.Image, string>();
  /** Масштаб, який уже стоїть на зображенні, відносно базового з атласу. */
  private readonly applied = new WeakMap<Phaser.GameObjects.Image, { x: number; y: number }>();
  private readonly recipes = new Map<number, TintRecipe>();
  private readonly owners = new Set<string>();
  /** Ніч (§8.9): з першого кадру й незалежно від темряви `dark`; удень схована. */
  private readonly night: RaceNight;
  /** Лід «Ожеледиці» (`raceice.ts`): тиждень не міняється посеред показу сцени, тож є чи немає — з її початку. */
  private readonly ice: RaceIceLayer | null;

  constructor(private readonly scene: Phaser.Scene, icy: boolean) {
    this.night = new RaceNight(scene, { night: RACE_DEPTH.night, beams: RACE_DEPTH.beams, tails: RACE_DEPTH.tails, signGlow: RACE_DEPTH.signGlow });
    this.ice = icy ? new RaceIceLayer(scene, RACE_DEPTH.ice) : null;
    this.player = addArt(scene, null, "race/car/player").setDepth(RACE_DEPTH.player);
    this.track = [0, 1, 2].map(() => addArt(scene, null, "race/progress", { state: "track" }).setDepth(RACE_DEPTH.bar).setOrigin(0.5, 0));
    this.fill = [0, 1, 2].map(() => addArt(scene, null, "race/progress", { state: "fill" }).setDepth(RACE_DEPTH.bar).setOrigin(0.5, 0));
    this.marker = addArt(scene, null, "race/car/player").setDepth(RACE_DEPTH.marker);
    this.lot = addArt(scene, null, "race/lot").setDepth(RACE_DEPTH.lot).setVisible(false);
    this.sign = addArt(scene, null, iconArt(DESTINATION_ICONS.shop)).setDepth(RACE_DEPTH.sign).setVisible(false);
  }

  /**
   * Запекти наперед дах пункту й запарковані машини (§8.5 «На місці — кадр парковки»): ліниво вони запікалися б у мить, коли
   * парковка в'їжджає в кадр (≈ 1 с до фінішу на ×1), — машина тоді на швидкості під керуванням, а дах (282 × 188 одиниць арту,
   * ≈ 0,2 Мпкс полотна) — це десятки мс в одному кадрі на телефоні. Тут — у `create`, ще до першого кадру сцени: машина на старті
   * гонки вже котиться (§8.5 «Виїзд із дому»), але на від'їзді від свого будинку кадр тим часом ще чорний, тож запинки не видно, а
   * гонка без від'їзду (знайда в притулок, перезавантаження) запинається лише раз, у першу мить сцени, а не посеред їзди. Запечене
   * звільняє `destroy` наприкінці сцени, як і решту.
   */
  prepare(trip: Trip): void {
    this.buildingImage(trip.destination).setVisible(false);
    lotCars(trip.seed).forEach(({ look }, i) => this.carImage(this.parked, i, look, RACE_DEPTH.traffic).setVisible(false));
  }

  /**
   * Від'їзд від свого будинку (§8.5 «Виїзд із дому»): запекти й дах свого кольору, машини сусідів і потік старту гонки — поки
   * кадр ще чорний. Дах пункту лишається запеченим (`prepare`): у гонці будівля лише перемикається на нього, без запікання.
   */
  prepareHome(start: HomeDepartureStart): void {
    this.buildingImage("home").setVisible(false);
    lotCars(start.seed).forEach(({ look }, i) => this.carImage(this.parked, i, look, RACE_DEPTH.traffic).setVisible(false));
    start.cars.forEach(({ look }, i) => this.carImage(this.traffic, i, look, RACE_DEPTH.traffic).setVisible(false));
  }

  /** Вигляд машини потоку, який сцена показує (з першої зустрічі): той самий і на прибутті (`arrivalStart`). */
  lookOf(car: RaceCar): TrafficLook {
    let look = this.looks.get(car);
    if (!look) {
      look = trafficLook(car);
      this.looks.set(car, look);
    }
    return look;
  }

  /**
   * Кадр гонки: дорога їде донизу, поки машина їде вгору; машини потоку там, де їх веде сим; попереду — парковка пункту, коли
   * вона в кадрі; смуга прогресу, що згасає, поки парковка в'їжджає в кадр згори (`raceBarAlpha`).
   */
  draw(trip: Trip, view: RaceView): void {
    const race = trip.race;
    const { height, k, ppu, cx, playerY } = view;
    const lotY = lotScreenY(race.done, race.road, height);
    this.drawRoad(race.done * ppu, view, lotY);

    // Машини потоку: ті, що в кадрі (з запасом на довжину машини). Уночі їхні вогні гаснуть за краєм кадру раніше, ніж машину
    // відсікає сцена чи прибирає сим (`lightFade`), тож запасу на промінь тут не треба.
    const reach = (artEntry("race/car/traffic")?.size.h ?? 84) * k;
    const player = { x: laneX(cx, race.lane, k), y: playerY, rotation: steerTilt(race.lane, race.targetLane) };
    const lit: LitCar[] = [];
    let n = 0;
    for (const car of race.cars) {
      const y = playerY - (carAt(race, car) - race.done) * ppu;
      if (y < -reach || y > height + reach) continue;
      const look = this.lookOf(car);
      const pose = { x: laneX(cx, car.lane, k), y, rotation: 0 };
      this.fit(this.carImage(this.traffic, n++, look, RACE_DEPTH.traffic), k, k).setPosition(pose.x, pose.y).setRotation(0).setAlpha(1);
      if (view.night) lit.push(trafficLit(pose, look, player, view.night, k, lightFade(y, height, k)));
    }
    hideFrom(this.traffic, n);

    this.fit(this.player, k, k).setPosition(player.x, player.y).setRotation(player.rotation);
    if (view.night) lit.push(ownLit(player, DRIVING_LIGHTS, view.night, k));

    // Запарковані машини — лише коли парковка вже в кадрі (`drawLot` іншої й не малює): до фінішу її здебільшого не видно.
    const lot = { y: lotY, place: trip.destination, cars: lotInFrame(lotY, height) ? parkedCars(trip.seed, lotY, height) : NO_CARS };
    this.drawLot(lot, view);
    this.drawNight(view, race.done * ppu, lot.y, lit);
    this.drawBar(trip, view);
  }

  /**
   * Смуга прогресу збоку дороги: від панелі (90 px під безпечною зоною) до 40 px над низом. Стоїть там, де парковка пункту, тож
   * згасає, поки та в'їжджає в кадр; `fade` — ще й проступає наприкінці від'їзду від свого будинку (§8.5 «Виїзд із дому»).
   */
  drawBar(trip: Trip, view: RaceView, fade = 1): void {
    const race = trip.race;
    const { height, k, cx } = view;
    const alpha = raceBarAlpha(lotScreenY(race.done, race.road, height), height) * fade;
    if (!(alpha > 0)) {
      this.hideBar();
      return;
    }
    const barTop = view.safe.top + 90;
    const barH = height - barTop - view.safe.bottom - 40;
    const barX = cx + RACE_BAR_X * k;
    this.placeBar(this.track, barX, barTop, barH, k, alpha);
    const done = Math.max(0, Math.min(1, race.road > 0 ? race.done / race.road : 0));
    const fillH = barH * done;
    if (fillH >= 1) this.placeBar(this.fill, barX, barTop + barH - fillH, fillH, k, alpha);
    else hideFrom(this.fill, 0);
    this.fit(this.marker, RACE_MARKER_SCALE * k, RACE_MARKER_SCALE * k)
      .setPosition(barX, barMarkerY(barTop, barH, done, k))
      .setAlpha(alpha)
      .setVisible(true);
  }

  /**
   * Кадр дороги без керування (§8.5, `RoadFrame`): прибуття, на місці, від'їзд із парковки чи дорога додому — зсув дороги, своя
   * машина там і так повернута, як каже кадр, машини потоку з їхньою непрозорістю й парковка, якщо вона є; смуги прогресу
   * немає — це не гонка.
   */
  drawFrame(frame: RoadFrame, view: RaceView): void {
    const { k, height } = view;
    this.drawRoad(frame.offset, view, frame.lot?.y ?? null);
    frame.traffic.forEach((car, i) => this.placeCar(this.carImage(this.traffic, i, car.look, RACE_DEPTH.traffic), car, view));
    hideFrom(this.traffic, frame.traffic.length);
    const player = { x: view.cx + frame.car.x, y: frame.car.y, rotation: frame.car.rotation };
    this.fit(this.player, k, k).setPosition(player.x, player.y).setRotation(player.rotation);
    this.drawLot(frame.lot, view);
    this.hideBar();
    const night = view.night;
    const lit: LitCar[] = [];
    if (night) {
      for (const car of frame.traffic) {
        const pose = { x: view.cx + car.x, y: car.y, rotation: car.rotation };
        lit.push(trafficLit(pose, car.look, player, night, k, car.alpha * lightFade(car.y, height, k, frame.lightBand)));
      }
      lit.push(ownLit(player, frame.lights, night, k));
    }
    this.drawNight(view, frame.offset, frame.lot?.y ?? null, lit);
  }

  /**
   * Ніч (§8.9, `RaceNight`): тон, плями вуличних ліхтарів уздовж дороги (зсув `offset`, як у `drawRoad`), ліхтарі парковки й
   * сяйво таблички, поки вони світять у кадр (`lotLights`; `lotY` — середня лінія з'їзду, px; null — парковки немає), вогні
   * машин `cars`. Удень (`view.night` — null) — шар схований.
   */
  private drawNight(view: RaceView, offset: number, lotY: number | null, cars: readonly LitCar[]): void {
    const night = view.night;
    if (!night) {
      this.night.draw(view, null, NO_LIGHTS);
      return;
    }
    const lot = lotLights(lotY, view);
    this.night.draw(view, night, { pools: [...streetPools(offset, view, lotY), ...lot.pools], cars, sign: lot.sign });
  }

  /**
   * Парковка пункту з будівлею (§8.5 «На місці — кадр парковки»; `RoadFrame.lot`): з'їзд і місця, запарковані машини, будівля з
   * дахом кольору пункту й іконка пункту на табличці (свій будинок, §8.5 «Виїзд із дому», — дах свого кольору й гліф дому,
   * `HOME_LOT`); y — від середньої лінії з'їзду, x — від середини дороги `view.cx`. Не в кадрі (чи парковки немає) — сховано.
   */
  private drawLot(lot: RoadFrame["lot"], view: RaceView): void {
    const { k, cx, height } = view;
    if (lot === null || !lotInFrame(lot.y, height)) {
      this.lot.setVisible(false);
      this.building?.setVisible(false);
      this.sign.setVisible(false);
      hideFrom(this.parked, 0);
      return;
    }
    const lotY = lot.y;
    this.fit(this.lot, k, k)
      .setPosition(cx + RACE_LOT.entrance.x * k, lotY + RACE_LOT.entrance.y * k)
      .setVisible(true);
    this.fit(this.buildingImage(lot.place), k, k).setPosition(cx + RACE_BUILDING.pivotAt.x * k, lotY + RACE_BUILDING.pivotAt.y * k);
    // Іконка — стороною `sign.icon` одиниць арту (кадр атласу — повна сторона іконки).
    const icon = lot.place === "home" ? HOME_LOT.sign : iconArt(DESTINATION_ICONS[lot.place]);
    setArt(this.sign, icon);
    const scale = (RACE_BUILDING.sign.icon / (artEntry(icon)?.size.w ?? RACE_BUILDING.sign.size)) * k;
    this.fit(this.sign, scale, scale)
      .setPosition(cx + SIGN_AT.x * k, lotY + SIGN_AT.y * k)
      .setVisible(true);
    lot.cars.forEach((car, i) => this.placeCar(this.carImage(this.parked, i, car.look, RACE_DEPTH.traffic), car, view));
    hideFrom(this.parked, lot.cars.length);
  }

  /** Будівля пункту (чи свій будинок): запечений дах кольору пункту (той самий — нічого не робить). */
  private buildingImage(place: LotPlace): Phaser.GameObjects.Image {
    const recipe = buildingRecipe(place);
    this.owners.add(BUILDING_OWNER);
    let image = this.building;
    if (!image) {
      image = addBakedArt(this.scene, null, "race/building", recipe, { owner: BUILDING_OWNER }).setDepth(RACE_DEPTH.building);
      this.building = image;
    } else if (this.shown.get(image) !== recipe.key) {
      setBakedArt(image, "race/building", recipe, { owner: BUILDING_OWNER });
    }
    this.shown.set(image, recipe.key);
    return image.setVisible(true);
  }

  /** Машина кадру без керування: x — від середини дороги, поворот і непрозорість — з кадру. */
  private placeCar(image: Phaser.GameObjects.Image, car: ParkingCar, view: RaceView): void {
    this.fit(image, view.k, view.k).setPosition(view.cx + car.x, car.y).setRotation(car.rotation).setAlpha(car.alpha);
  }

  /** Сховати смугу прогресу й машинку на ній. */
  private hideBar(): void {
    hideFrom(this.track, 0);
    hideFrom(this.fill, 0);
    this.marker.setVisible(false);
  }

  /**
   * Поле й дорога плитками, зсунутими на `distance` пікселів проїханого (більше — нижче, менше — вище). Узбіччя — стовпці зі
   * своєю фазою, віддзеркалені через один; дорога — одна колона плиток посередині. Ряди теж віддзеркалюються через один
   * (`rowFlipped`), тож малюнок не повторюється на одному екрані. Плитки узбіччя, що лягають під парковку з будівлею (`lotY` —
   * середня лінія з'їзду, px; null — парковки немає), — без дерев (стан `plain`): крону вигляду згори не сховаєш під асфальтом
   * чи дахом, а край плитки — лише трава, тож шва немає й плитка не змінюється, поки їде разом із парковкою.
   */
  private drawRoad(distance: number, view: RaceView, lotY: number | null): void {
    const { width, height, k, cx } = view;
    const tiles = RACE_TILES;
    const vergePeriod = tiles.verge.period * k;
    const vergePivot = (artEntry("race/verge")?.pivot.y ?? 256) - tiles.verge.top;
    // Вміст плитки — від верху ряду (`row.y`) на `vergeSize` донизу й на половину того в боки від середини стовпця.
    const vergeSize = (tiles.verge.bottom - tiles.verge.top) * k;
    const lot =
      lotY === null
        ? null
        : { left: cx + LOT_BOUNDS.left * k, right: cx + LOT_BOUNDS.right * k, top: lotY + LOT_BOUNDS.top * k, bottom: lotY + LOT_BOUNDS.bottom * k };
    let n = 0;
    for (const column of vergeColumns(width, cx, k)) {
      const underLot = lot !== null && column.x - vergeSize / 2 < lot.right && column.x + vergeSize / 2 > lot.left;
      for (const row of tileRows(distance + column.phase * vergePeriod, vergePeriod, height)) {
        const image = this.pooled(this.verge, n++, "race/verge", RACE_DEPTH.verge);
        const plain = underLot && row.y < lot.bottom && row.y + vergeSize > lot.top;
        setArt(image, "race/verge", { state: plain ? "plain" : "full" });
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
    this.ice?.draw(cx, k, height, distance);
  }

  /** Звільнити запечені кадри потоку й будівлі (сцена гонки закінчилася). */
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

  /** Машина потоку (чи запаркована) з пулу: запечений кадр виду й кольору (той самий — нічого не робить). */
  private carImage(pool: Phaser.GameObjects.Image[], i: number, look: TrafficLook, depth: number): Phaser.GameObjects.Image {
    let recipe = this.recipes.get(look.color);
    if (!recipe) {
      recipe = trafficRecipe(look.color);
      this.recipes.set(look.color, recipe);
    }
    const owner = `race:${look.color}`;
    this.owners.add(owner);
    const key = `${look.kind}@${recipe.key}`;
    let image = pool[i];
    if (!image) {
      image = addBakedArt(this.scene, null, "race/car/traffic", recipe, { state: look.kind, owner }).setDepth(depth);
      pool[i] = image;
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
  private placeBar(parts: Phaser.GameObjects.Image[], x: number, top: number, height: number, k: number, alpha: number): void {
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
      this.fit(image, k, part.scaleY).setPosition(x, part.y).setAlpha(alpha).setVisible(true);
      image.setCrop(0, part.cropY * res, image.frame.realWidth, part.cropH * res);
    });
  }
}

/** Де стала машина на місці (зсув дороги й зерно поїздки, `parkingSpot`) і який пункт. */
interface ParkedAt {
  spot: ParkingSpot;
  destination: Destination;
}

function parkedAt(trip: Trip): ParkedAt {
  return { spot: parkingSpot(trip), destination: trip.destination };
}

/** Кадр парковки (прибуття, на місці, від'їзд) як кадр без керування: з парковкою пункту й вогнями своєї машини `lights`. */
function parkingRoad(frame: ParkingFrame, destination: Destination, lights: OwnLights): RoadFrame {
  return { offset: frame.offset, car: frame.car, traffic: frame.traffic, lot: { y: frame.lot, place: destination, cars: frame.parked }, lights };
}

/**
 * Кадр дороги додому (`homeRoadFrame`) як кадр без керування: дорога біжить угору, машини (і своя) — носом донизу. Попутні
 * відсікаються з запасом на промінь (уночі), тож і гаснуть за ним (`LIGHT_REACH`).
 */
function homeRoad(frame: HomeRoadFrame, k: number): RoadFrame {
  return {
    offset: -frame.camera,
    car: { x: laneX(0, HOME_ROAD.lane, k), y: frame.car, rotation: Math.PI },
    traffic: frame.traffic.map((car) => ({ x: laneX(0, car.lane, k), y: car.y, rotation: Math.PI, look: car.look, alpha: 1 })),
    lot: null,
    lights: DRIVING_LIGHTS,
    lightBand: LIGHT_REACH,
  };
}

/** Нічого не світить (день). */
const NO_LIGHTS: NightLights = { pools: [], cars: [], sign: null };
/** Парковки ще не видно — машин на ній не рахують. */
const NO_CARS: readonly ParkingCar[] = [];

/**
 * Машина потоку вночі на кадрі з `k` px на одиницю арту: фари й задні вогні — з її порога (`headlightsOn`), `fade` —
 * непрозорість і згасання за краєм кадру; вогні під кузовом своєї машини (`own` — її поза) не горять (`trafficLights`).
 */
function trafficLit(pose: CarPose, look: TrafficLook, own: CarPose, night: RaceNightLevel, k: number, fade: number): LitCar {
  const on = headlightsOn(night.dark, lookSeed(look)) ? fade : 0;
  return { lights: trafficLights(pose, look.kind, own, k), head: on, tail: TAIL.running * on, reverse: 0 };
}

/** Своя машина вночі: вогні етапу (`lights`), коли її фари вже ввімкнено (свій поріг — `HEADLIGHTS.threshold`). */
function ownLit(pose: CarPose, lights: OwnLights, night: RaceNightLevel, k: number): LitCar {
  const on = headlightsOn(night.dark, null) ? 1 : 0;
  return { lights: carLights(pose, "player", k), head: lights.head * on, tail: lights.tail * on, reverse: lights.reverse * on };
}

/** Сховати зображення пулу з номера `from`. */
function hideFrom(pool: Phaser.GameObjects.Image[], from: number): void {
  for (let i = from; i < pool.length; i++) pool[i]?.setVisible(false);
}
