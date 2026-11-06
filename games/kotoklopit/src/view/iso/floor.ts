// Ізометричний котячий куточок і безлад на підлозі (крок 16, F3b, `GRAPHICS_PLAN.md`): миски й поїлки з фонтанчиком,
// лотки (з запахом, коли брудні), будиночки, кігтеточки, іграшки, автогодівниці, робот і док, переноска, кошик білизни,
// шкарпетка в схованці, вертикальний пилосос, що стоїть на підлозі, бруд, жмути шерсті, пил і скинуті дрібнички — кожне
// окремим кадром маніфесту з точкою в реєстрі глибини (`iso/depth.ts`): кіт і персонаж стають перед річчю чи за нею, а
// пласке (бруд, шерсть, пил, док) — під тими, хто на ньому. Павутину на стіні малює квартира (`apartment.ts`). Те, що
// прибрав пилосос у руках (`PersonSwept`), не зникає миттю, а втягується в щітку (`SUCK`). Новий жмут шерсті не вискакує, а
// викочується з-під кота й наростає (`Appear`, `tuftappear.ts`).
//
// Що показати — зі стану гри (`looks.ts`).

import type Phaser from "phaser";

import { carriedToy } from "../../sim/catai";
import { DUST_SPOTS, dustOf } from "../../sim/dust";
import type { GameEvent } from "../../sim/events";
import { CARRIER_SPOT, itemPoint, ROBOT_DOCK, slotCenter } from "../../sim/home";
import { cleaningTool, FUR_SPOTS, robotAt, tuftCat, tuftsOf } from "../../sim/household";
import { thingSpot } from "../../sim/moving";
import { VACUUM_TARGET, type Target } from "../../sim/targets";
import type { CleaningTool, GameState, HomeItem, TrinketKind, Vec } from "../../sim/types";
import { addArt, setArt } from "../art/atlas";
import type { PartContext } from "../world/context";
import { isoItemLook, type IsoFootprint } from "../world/objects";
import type { Point, WorldFrame, WorldPart } from "../world/part";
import { ISO } from "../world/projection";
import { isoDepth, type IsoDepth, type IsoPointHandle, type IsoPointOptions } from "./depth";
import { PlaceMark } from "./placemark";
import { BASKET_AT, floorAnchorAt, SOFA_PEEK, stashPoint } from "./geometry";
import { IsoHighlight } from "./highlight";
import { basketState, carrierOccupied, dockFrame, dustFrame, feederFrame, fountainFrame, itemFrame, messFrame, placedFrame, robotFrame, trinketFrame, type IsoFrame } from "./looks";
import { PersonSwept } from "./swept";
import { freshTuft, TUFT_APPEAR, tuftAppearLook, tuftRollFrom } from "./tuftappear";

/** Що лежить на речі, — у її проміжку глибини, нижче за пів проміжку (`ISO_DEPTH_SLOT` 0,01). */
const ON = { overlay: 0.002, fx: 0.003, grate: 0.004 } as const;

/** Ґратки переноски — над нею (у її проміжку): кіт, що спить у переносці (`catspot.ts`), — між нею й ґратками. */
export const CARRIER_GRATE_DEPTH = ON.grate;

/** Наскільки видно річ на клітинці, куди вона стане з рук (§8.7). */
const GHOST_ALPHA = 0.6;

/** Автогодівниця стоїть позаду своєї миски на тій самій клітинці: для порядку — на стільки клітинок далі. */
const FEEDER_BEHIND = 0.3;
/** Бабл над безладом — на стільки над підлогою (як у старому вигляді: 12 px над плямою). */
const MESS_HEIGHT = 6;
/** Як часто хвилі запаху брудного лотка міняють кадр, мс, і на якій частці висоти лотка вони починаються. */
const SMELL_MS = 450;
const SMELL_LIFT = 0.8;
/** Пів сторони сліду речі на підлозі для каркаса підсвітки без WebGL, клітинки. */
const OUTLINE_HALF = 0.4;
/** Жмут шерсті на підлозі: бабла над ним немає, висота — для порядку; півширина малюнка `mess/fur-tuft`. */
const TUFT = { height: 4, half: 16 } as const;
/**
 * Пил на підлозі (§8.7): пласкі кадри `mess/dust/*` — півширина за видом (полотна 62, 84 і 50 одиниць арту, `a20-dust.ts`),
 * висота — для порядку.
 */
const DUST_HALF = { corner: 31, wall: 42, floor: 25 } as const;
const DUST_HEIGHT = 4;
/** Інструмент на підлозі (§8.7): кадри без станів. */
const TOOL_FRAME: Record<CleaningTool, IsoFrame> = { vacuum: { id: "env/vacuum", state: null }, broom: { id: "env/broom", state: null } };
/**
 * Прибране пилососом у руках (§8.7) втягується в щітку: за `ms` летить до неї, прискорюючись, меншає до `shrink` і блідне до
 * `fade`.
 */
const SUCK = { ms: 280, shrink: 0.25, fade: 0.4 } as const;

/** Накладка на річ: малюнок, кадр, що зараз показано, і зсув глибини від самої речі. */
interface Extra {
  image: Phaser.GameObjects.Image;
  key: string;
  offset: number;
}

/**
 * Те, що втягується в щітку пилососа: річ, звідки (px світу), з якої миті й базовий масштаб; `orphan` — її вже немає в мапах
 * (прибраний безлад): наприкінці прибрати зовсім, інакше (жмут, пил) — сховати до наступного разу.
 */
interface Suck {
  spot: Spot;
  from: Point;
  start: number;
  scale: { x: number; y: number };
  orphan: boolean;
}

/**
 * Новий жмут шерсті, що з'являється (§8.7, [Змінено пізніше], `tuftappear.ts`): звідки котиться (px світу; null — проступає на
 * місці), куди, з якої миті й його базовий масштаб.
 */
interface Appear {
  spot: Spot;
  from: Point | null;
  to: Point;
  start: number;
  scale: { x: number; y: number };
}

/** Річ на підлозі: малюнок, точка в реєстрі глибини, що на ній лежить (фонтанчик, запах, ґратки). */
interface Spot {
  image: Phaser.GameObjects.Image;
  point: IsoPointHandle;
  key: string;
  extras: Map<string, Extra>;
  depth: number;
  /** Де річ на підлозі, клітинки, і її висота — для бабла й підсвітки. */
  at: Vec;
  height: number;
  /** Цього кадру річ є: решту прибирають. */
  seen: boolean;
}

export class IsoFloorView implements WorldPart {
  private readonly depth: IsoDepth;
  private readonly glow: IsoHighlight;
  private readonly placeMark: PlaceMark;
  /**
   * Речі котячого кутка за id, безлад за id, автогодівниці за місцем миски, дрібнички за видом, жмути шерсті за місцем
   * (`FUR_SPOTS`), пил на підлозі за місцем (`DUST_SPOTS`).
   */
  private readonly items = new Map<number, Spot>();
  private readonly messes = new Map<number, Spot>();
  private readonly feeders = new Map<string, Spot>();
  private readonly trinkets = new Map<TrinketKind, Spot>();
  private readonly tufts = new Map<number, Spot>();
  private readonly dust = new Map<number, Spot>();
  /** Одиничні: робот, його док, переноска, кошик білизни, шкарпетка за диваном, вертикальний пилосос. */
  private readonly singles = new Map<string, Spot>();
  /** Що зараз втягується в щітку пилососа. */
  private readonly sucking: Suck[] = [];
  /** Що прибрав пилосос у руках з минулого кадру (події `vacuumed`): лише воно втягується в щітку. */
  private readonly swept = new PersonSwept();
  /** Нові жмути шерсті, що зараз з'являються. */
  private readonly appearing: Appear[] = [];
  /**
   * Підлогу вже показано хоч раз після `reset` (нова гра, перегравання чи сценарій — `DayScene.restart`; новий день і
   * повернення з поїздки його не викликають): до того жмути, що лежать, — одразу на місці, без появи. Від жмутів, що лягли,
   * поки гравця не було (уночі, у поїздці), появу відсікає `freshTuft` (давніші за `TUFT_APPEAR.freshMinutes`); жмут, докладений
   * уранці після короткої ночі (`topUpTufts`), — свіжий, і його поява йде, але під титулкою дня.
   */
  private settled = false;

  constructor(private readonly ctx: PartContext) {
    this.depth = isoDepth(ctx);
    this.glow = new IsoHighlight(ctx.scene, ctx.layer, ctx.world);
    this.placeMark = new PlaceMark(ctx.scene, ctx.layer, this.depth);
  }

  /** Створити річ із кадром `frame` і точкою в реєстрі (`options` — пласка, півширина, id). */
  private spot(frame: IsoFrame, options: IsoPointOptions): Spot {
    const image = addArt(this.ctx.scene, this.ctx.layer, frame.id, { state: frame.state });
    const view = { image, key: frameKey(frame), extras: new Map<string, Extra>(), depth: 0, at: { x: 0, y: 0 }, height: 0, seen: true };
    const point = this.depth.addPoint((d) => {
      view.depth = d;
      image.setDepth(d);
      for (const extra of view.extras.values()) extra.image.setDepth(d + extra.offset);
    }, options);
    return Object.assign(view, { point });
  }

  /**
   * Показати річ у точці `at` (клітинки) кадром `frame`. Для порядку малювання — точка `order` (типово `at`; автогодівниця
   * стоїть позаду миски), а на коробці `under` — під нею (схованка під диваном).
   */
  private place(spot: Spot, frame: IsoFrame, at: Vec, height: number, under?: string, order: Vec = at): void {
    spot.seen = true;
    const key = frameKey(frame);
    if (spot.key !== key) {
      spot.key = key;
      setArt(spot.image, frame.id, { state: frame.state });
    }
    const s = ISO.toScreen(at);
    spot.image.setPosition(s.x, s.y).setVisible(true);
    spot.at = at;
    spot.height = height;
    if (under) spot.point.placeUnder(order.x, order.y, under);
    else spot.point.place(order.x, order.y);
  }

  /** Сховати річ, якої зараз не видно (іграшка в зубах кота): у порядку малювання її немає. */
  private hide(spot: Spot): void {
    spot.seen = true;
    spot.image.setVisible(false);
    for (const extra of spot.extras.values()) extra.image.setVisible(false);
    spot.point.hide();
  }

  /** Накладка на річ (фонтанчик на мисці, запах над лотком, ґратки переноски): null — сховати; `lift` — на скільки вище. */
  private extra(spot: Spot, name: string, frame: IsoFrame | null, offset: number, lift = 0): void {
    let extra = spot.extras.get(name);
    if (!frame) {
      extra?.image.setVisible(false);
      return;
    }
    if (!extra) {
      extra = { image: addArt(this.ctx.scene, this.ctx.layer, frame.id, { state: frame.state }), key: frameKey(frame), offset };
      extra.image.setDepth(spot.depth + offset);
      spot.extras.set(name, extra);
    }
    const key = frameKey(frame);
    if (extra.key !== key) {
      extra.key = key;
      setArt(extra.image, frame.id, { state: frame.state });
    }
    const s = ISO.toScreen(spot.at);
    extra.image.setPosition(s.x, s.y - lift).setVisible(spot.image.visible);
  }

  update(state: GameState, frame: WorldFrame): void {
    this.glow.begin();
    const { home } = state;
    for (const spots of this.all()) for (const spot of spots) spot.seen = false;

    // Речі котячого кутка (§9.12); іграшку в зубах малює кіт.
    const fountain = home.appliances.fountain;
    for (const item of home.items) {
      const look = itemFrame(state, item);
      let spot = this.items.get(item.id);
      if (!spot) {
        spot = this.spot(look, { id: `item:${item.id}`, half: isoItemLook(item.kind, item.quality).half });
        this.items.set(item.id, spot);
      }
      if (item.kind === "toy" && carriedToy(state, item)) {
        this.hide(spot);
        continue;
      }
      this.place(spot, look, shownAt(item), isoItemLook(item.kind, item.quality).height, item.kind === "toy" ? item.hidden : undefined);
      // Фонтанчик (§8.7) — на кожній мисці з водою; брудний лоток пахне (§9.12).
      if (item.kind === "water") this.extra(spot, "fountain", fountain ? fountainFrame(state, fountain, item) : null, ON.overlay);
      if (item.kind === "litter") {
        const smell: IsoFrame = { id: "fx/smell", state: Math.floor(frame.time / SMELL_MS) % 2 === 0 ? "a" : "b" };
        this.extra(spot, "smell", look.state?.endsWith("-dirty") ? smell : null, ON.fx, spot.height * SMELL_LIFT);
      }
    }

    // Автогодівниці над мисками (§9.12): позаду миски на тій самій клітинці.
    for (const feeder of home.feeders ?? []) {
      const look = feederFrame(feeder);
      let spot = this.feeders.get(feeder.slot);
      if (!spot) {
        spot = this.spot(look, { id: `feeder:${feeder.slot}`, half: isoItemLook("feeder", feeder.quality).half });
        this.feeders.set(feeder.slot, spot);
      }
      const c = slotCenter(feeder.slot);
      this.place(spot, look, c, isoItemLook("feeder", feeder.quality).height, undefined, { x: c.x - FEEDER_BEHIND, y: c.y - FEEDER_BEHIND });
    }

    this.drawHousehold(state);
    this.drawThingSpot(state);

    // Безлад (§9.12): пласкі плями під котами й персонажем.
    for (const mess of home.messes) {
      let spot = this.messes.get(mess.id);
      if (!spot) {
        spot = this.spot(messFrame(mess.kind), { id: `mess:${mess.id}`, flat: true, half: 40 });
        this.messes.set(mess.id, spot);
      }
      this.place(spot, messFrame(mess.kind), mess, MESS_HEIGHT);
    }

    // Жмути шерсті (§8.7, рішення автора 2026-11-02): лежать на своїх місцях, доки їх не прибере пилосос чи робот, — прибирають
    // їх не по черзі, тож місце, а не порядок появи. Новий, що ліг щойно (`freshTuft`), не вискакує, а з'являється (`Appear`).
    const fresh = this.settled ? freshTuft(state) : null;
    for (const index of tuftsOf(state)) {
      const at = FUR_SPOTS[index];
      if (!at) continue;
      let spot = this.tufts.get(index);
      const shown = spot?.image.visible === true;
      if (!spot) {
        spot = this.spot({ id: "mess/fur-tuft", state: null }, { flat: true, half: TUFT.half });
        this.tufts.set(index, spot);
      }
      this.place(spot, { id: "mess/fur-tuft", state: null }, at, TUFT.height);
      if (!shown && index === fresh) this.startAppear(state, spot, index, at, frame.time);
    }

    // Пил (§8.7, «Пил і павутина»): купки в кутах, смужки біля плінтусів і клубки на підлозі — пласкі, як безлад.
    for (const index of dustOf(state)) {
      const at = DUST_SPOTS[index];
      const look = dustFrame(index);
      if (!at || !look || at.kind === "cobweb") continue;
      let spot = this.dust.get(index);
      if (!spot) {
        spot = this.spot(look, { flat: true, half: DUST_HALF[at.kind] });
        this.dust.set(index, spot);
      }
      this.place(spot, look, at, DUST_HEIGHT);
    }

    // Скинуті дрібнички лежать на підлозі до ранку; розбитий кухоль — уламки, їх показує безлад (§9.12).
    for (const [kind, fallen] of Object.entries(home.trinkets ?? {}) as [TrinketKind, { x: number; y: number; broken?: true } | undefined][]) {
      if (!fallen || fallen.broken === true) continue;
      const look = trinketFrame(kind, true);
      let spot = this.trinkets.get(kind);
      if (!spot) {
        spot = this.spot(look, { flat: true, half: 20 });
        this.trinkets.set(kind, spot);
      }
      this.place(spot, look, fallen, 8);
    }

    this.forgetUnseen(frame.time);
    this.suck(frame.time);
    this.appear(frame.time);
    this.settled = true;
  }

  onEvent(event: GameEvent): void {
    this.swept.onEvent(event);
  }

  /**
   * Побут (§8.5, §8.7): робот-пилосос на доку чи в дорозі; переноска біля дверей (з ґратками поверх кота, що в ній спить);
   * кошик білизни біля пральної машини наповнюється, поки чистого одягу меншає; шкарпетка визирає з-за дивана.
   */
  private drawHousehold(state: GameState): void {
    const { home } = state;
    const robot = home.appliances.robot;
    if (robot) {
      // Док плаский: робот на ньому — над ним.
      this.single("dock", dockFrame(state), ROBOT_DOCK, 14, { flat: true, half: 32 });
      this.single("robot", robotFrame(state, robot), robotAt(state), isoItemLook("robot", robot).height, { id: "robot", half: isoItemLook("robot", robot).half });
    }
    if (home.carrier) {
      const carrier = this.single("carrier", { id: `item/carrier/${home.carrier}`, state: "body" }, CARRIER_SPOT, isoItemLook("carrier").height, {
        id: "carrier",
        half: isoItemLook("carrier").half,
      });
      this.extra(carrier, "grate", carrierOccupied(state) ? { id: `item/carrier/${home.carrier}`, state: "grate" } : null, ON.grate);
    }
    this.single("basket", { id: "env/laundry-basket", state: basketState(home.clothes) }, BASKET_AT, isoItemLook("basket").height, {
      id: "basket",
      half: isoItemLook("basket").half,
    });
    // Шкарпетка в схованці (§9.12, «Подарунки й схованки»): п'ятка визирає з-за дивана — під ним (`SOFA_PEEK`).
    if (home.sock === true) this.single("sock", { id: "mess/sock", state: "peek" }, SOFA_PEEK, 8, { half: 20 }, "sofa");
    // Вертикальний пилосос (§8.7, «Пилосос у руках»): стоїть там, де його поставили; у руках його малює персонаж (`item/vacuum`).
    const vacuum = home.vacuumAt;
    if (vacuum) this.single(VACUUM_TARGET, TOOL_FRAME[cleaningTool(state)], vacuum, isoItemLook("vacuum").height, { id: VACUUM_TARGET, half: isoItemLook("vacuum").half });
  }

  /** Поки річ у руках, видно, де вона стане (§8.7): напівпрозора річ і контур клітинки. Поставити нікуди — нічого не видно. */
  private drawThingSpot(state: GameState): void {
    const held = state.character.held;
    const place = held?.kind === "thing" ? thingSpot(state) : null;
    if (held?.kind !== "thing" || place === null) {
      this.placeMark.hide();
      return;
    }
    const { kind, quality } = held.item;
    const look = isoItemLook(kind, quality);
    const at = { x: place.x + 0.5, y: place.y + 0.5 };
    const ghost = this.single(`ghost:${kind}:${quality}`, placedFrame(held.item), at, look.height, { half: look.half });
    this.extra(ghost, "feeder", held.feeder ? feederFrame(held.feeder) : null, -ON.overlay);
    const fountain = held.item.kind === "water" ? state.home.appliances.fountain : null;
    this.extra(ghost, "fountain", fountain && held.item.kind === "water" ? fountainFrame(state, fountain, held.item) : null, ON.overlay);
    ghost.image.setAlpha(GHOST_ALPHA);
    for (const extra of ghost.extras.values()) extra.image.setAlpha(GHOST_ALPHA);
    this.placeMark.show(at);
  }

  private single(name: string, frame: IsoFrame, at: Vec, height: number, options: IsoPointOptions, under?: string): Spot {
    let spot = this.singles.get(name);
    if (!spot) {
      spot = this.spot(frame, options);
      this.singles.set(name, spot);
    }
    this.place(spot, frame, at, height, under);
    return spot;
  }

  private *all(): Generator<Iterable<Spot>> {
    yield this.items.values();
    yield this.messes.values();
    yield this.feeders.values();
    yield this.trinkets.values();
    yield this.tufts.values();
    yield this.dust.values();
    yield this.singles.values();
  }

  /**
   * Речі, яких цього кадру немає (продали, прибрали, зламалися), прибрати; жмути шерсті й пил — сховати: місця сталі, і там
   * знову ляже шерсть чи пил. Безлад, шерсть і пил, що прибрав пилосос у руках (`swept`), втягуються в щітку (`SUCK`) і лише
   * тоді зникають; прибране роботом-пилососом і руками — зникає одразу.
   */
  private forgetUnseen(time: number): void {
    const swept = this.swept;
    for (const map of [this.items, this.messes, this.feeders, this.trinkets, this.singles] as Map<unknown, Spot>[]) {
      for (const [key, spot] of map) {
        if (spot.seen) continue;
        map.delete(key);
        if (map === this.messes && swept.messes.has(key as number)) this.startSuck(spot, time, true);
        else destroySpot(spot);
      }
    }
    for (const [spots, sucked] of [[this.tufts, swept.tufts], [this.dust, swept.dust]] as const) {
      for (const [index, spot] of spots) {
        if (spot.seen || !spot.image.visible || this.sucking.some((s) => s.spot === spot)) continue;
        // Жмут прибрали, поки він ще з'являвся: спершу — свого розміру й на місці, а тоді втягується чи зникає.
        this.endAppear(spot);
        if (sucked.has(index)) this.startSuck(spot, time, false);
        else this.hide(spot);
      }
    }
    swept.clear();
  }

  /** Почати втягувати річ у щітку: її точка лишається в реєстрі (пласка — під персонажем і пилососом) до кінця. */
  private startSuck(spot: Spot, time: number, orphan: boolean): void {
    this.sucking.push({ spot, from: { x: spot.image.x, y: spot.image.y }, start: time, scale: { x: spot.image.scaleX, y: spot.image.scaleY }, orphan });
  }

  /**
   * Те, що втягується, — до щітки пилососа (`PersonPart.brush`; поставили пилосос посеред польоту — лишається, де була,
   * і просто зникає): за `SUCK.ms`, прискорюючись, меншає й блідне. Летить по підлозі — його точка в реєстрі глибини йде
   * разом із ним (`floorAt`), тож кіт, що стоїть ближче до камери, його закриває. Наприкінці — масштаб і прозорість як
   * були, і сховати чи прибрати.
   */
  private suck(time: number): void {
    const brush = this.ctx.world.person.brush;
    for (let i = this.sucking.length - 1; i >= 0; i--) {
      const s = this.sucking[i]!;
      const t = (time - s.start) / SUCK.ms;
      const image = s.spot.image;
      if (t >= 1 || !(t >= 0)) {
        image.setScale(s.scale.x, s.scale.y).setAlpha(1);
        if (s.orphan) destroySpot(s.spot);
        else this.hide(s.spot);
        this.sucking.splice(i, 1);
        continue;
      }
      const e = t * t;
      const to = brush ?? s.from;
      const k = 1 - (1 - SUCK.shrink) * e;
      const x = s.from.x + (to.x - s.from.x) * e;
      const y = s.from.y + (to.y - s.from.y) * e;
      image
        .setPosition(x, y)
        .setScale(s.scale.x * k, s.scale.y * k)
        .setAlpha(1 - (1 - SUCK.fade) * e)
        .setVisible(true);
      const floor = floorAt(x, y);
      s.spot.point.place(floor.x, floor.y);
    }
  }

  /**
   * Почати появу нового жмута (§8.7, [Змінено пізніше]): котиться по підлозі з-під кота, з-під якого він ліг (`tuftCat`), — якщо
   * цього кота зараз видно (`WorldQuery`), він стоїть на підлозі (`CatPoints.floor`) і недалеко (`tuftRollFrom`), — інакше
   * проступає на місці. Кіт на меблях, на руках чи колінах, у речі чи під нею — жмут не летить у повітрі з висоти меблів чи з
   * рук, а проступає на місці.
   */
  private startAppear(state: GameState, spot: Spot, index: number, at: Vec, time: number): void {
    const world = this.ctx.world;
    const cat = tuftCat(state, index);
    const floor = cat && world.anchor(`cat:${cat.id}`) ? (world.cat(cat.id)?.floor ?? null) : null;
    const to = ISO.toScreen(at);
    this.appearing.push({ spot, from: tuftRollFrom(cat, floor, at), to: { x: to.x, y: to.y }, start: time, scale: { x: spot.image.scaleX, y: spot.image.scaleY } });
  }

  /**
   * Нові жмути з'являються (`tuftAppearLook`) за `TUFT_APPEAR.ms`: котиться по підлозі — його точка в реєстрі глибини йде разом
   * із ним (`floorAt`), як і в того, що втягується в щітку. Котиться він від точки підлоги (`CatPoints.floor`), тож `floorAt`
   * дає клітинки між котом і місцем, а не позаду них. Наприкінці — свого розміру, непрозорий і рівно на місці.
   */
  private appear(time: number): void {
    for (let i = this.appearing.length - 1; i >= 0; i--) {
      const a = this.appearing[i]!;
      const t = (time - a.start) / TUFT_APPEAR.ms;
      if (t >= 1 || !(t >= 0)) {
        this.endAppear(a.spot);
        continue;
      }
      const look = tuftAppearLook(t, a.from, a.to);
      a.spot.image
        .setPosition(look.x, look.y)
        .setScale(a.scale.x * look.scale, a.scale.y * look.scale)
        .setAlpha(look.alpha)
        .setRotation(look.angle);
      const floor = floorAt(look.x, look.y);
      a.spot.point.place(floor.x, floor.y);
    }
  }

  /** Жмут більше не з'являється: свого розміру, непрозорий, рівно; на місці його ставить `place`. */
  private endAppear(spot: Spot): void {
    const i = this.appearing.findIndex((a) => a.spot === spot);
    if (i < 0) return;
    const a = this.appearing[i]!;
    spot.image.setPosition(a.to.x, a.to.y).setScale(a.scale.x, a.scale.y).setAlpha(1).setRotation(0);
    this.appearing.splice(i, 1);
  }

  lateUpdate(): void {
    this.glow.apply();
    this.depth.solve();
  }

  /** Новий день чи нова гра: id речей і безладу можуть означати вже інше. */
  reset(): void {
    // Прибраний безлад, що ще втягувався, — уже поза мапами: прибрати окремо.
    for (const s of this.sucking) if (s.orphan) destroySpot(s.spot);
    this.sucking.length = 0;
    this.appearing.length = 0;
    this.settled = false;
    this.swept.clear();
    for (const spots of this.all()) for (const spot of spots) destroySpot(spot);
    this.items.clear();
    this.messes.clear();
    this.feeders.clear();
    this.trinkets.clear();
    this.tufts.clear();
    this.dust.clear();
    this.singles.clear();
  }

  destroy(): void {
    this.reset();
    this.glow.destroy();
  }

  /** Над річчю котячого кутка, безладом чи вертикальним пилососом на підлозі. */
  anchor(id: string): Point | null {
    const home = this.ctx.state().home;
    if (id === VACUUM_TARGET) return home.vacuumAt ? floorAnchorAt(home.vacuumAt, isoItemLook("vacuum").height) : null;
    const [kind, raw] = id.split(":");
    const number = Number(raw);
    if (kind === "item") {
      const item = home.items.find((i) => i.id === number);
      return item ? floorAnchorAt(shownAt(item), isoItemLook(item.kind, item.quality).height) : null;
    }
    if (kind === "mess") {
      const mess = home.messes.find((m) => m.id === number);
      return mess ? floorAnchorAt(mess, MESS_HEIGHT) : null;
    }
    return null;
  }

  /** Сяйво довкола речі, безладу чи пилососа на підлозі (без WebGL — каркас довкола точки). */
  highlight(target: Target, alpha: number): boolean {
    if (target.type === "vacuum") {
      const spot = this.singles.get(VACUUM_TARGET);
      if (spot) this.glow.request(spot.image, around(target.at), isoItemLook("vacuum").height, alpha);
      return true;
    }
    if (target.type !== "item" && target.type !== "mess") return false;
    const spot = target.type === "item" ? this.items.get(target.item.id) : this.messes.get(target.mess.id);
    const at: Vec = target.type === "item" ? shownAt(target.item) : target.mess;
    const height = target.type === "item" ? isoItemLook(target.item.kind, target.item.quality).height : MESS_HEIGHT;
    if (spot) this.glow.request(spot.image, around(at), height, alpha);
    return true;
  }
}

/** Де показано річ котячого кутка: на своєму місці, а загнану під диван — там, де її видно (`stashPoint`). */
function shownAt(item: HomeItem): Vec {
  return stashPoint(itemPoint(item), item.kind === "toy" ? item.hidden : undefined);
}

/** Точка підлоги (клітинки) під точкою екрана (px світу): обернення `ISO.toScreen`. */
function floorAt(x: number, y: number): Vec {
  const origin = ISO.toScreen({ x: 0, y: 0 });
  const u = (x - origin.x) / (ISO.tile.width / 2);
  const v = (y - origin.y) / (ISO.tile.height / 2);
  return { x: (u + v) / 2, y: (v - u) / 2 };
}

function frameKey(frame: IsoFrame): string {
  return `${frame.id}|${frame.state ?? ""}`;
}

function destroySpot(spot: Spot): void {
  spot.point.remove();
  spot.image.destroy();
  for (const extra of spot.extras.values()) extra.image.destroy();
  spot.extras.clear();
}

/** Слід довкола точки підлоги для каркаса підсвітки. */
function around(p: Vec): IsoFootprint {
  return { x0: p.x - OUTLINE_HALF, y0: p.y - OUTLINE_HALF, x1: p.x + OUTLINE_HALF, y1: p.y + OUTLINE_HALF };
}
