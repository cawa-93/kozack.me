// Ізометричний котячий куточок і безлад на підлозі (крок 16, F3b, `GRAPHICS_PLAN.md`): миски й поїлки з фонтанчиком,
// лотки (з запахом, коли брудні), будиночки, кігтеточки, іграшки, автогодівниці, робот і док, переноска, кошик білизни,
// шкарпетка в схованці, бруд, жмути шерсті й скинуті дрібнички — кожне окремим кадром маніфесту з точкою в реєстрі глибини
// (`iso/depth.ts`): кіт і персонаж стають перед річчю чи за нею, а пласке (бруд, шерсть, док) — під тими, хто на ньому.
//
// Те саме, що показує старий куточок (`legacy/floorview.ts`, `legacy/catcorner.ts`), з того самого стану (`looks.ts`).

import type Phaser from "phaser";

import { carriedToy } from "../../sim/catai";
import { CARRIER_SPOT, itemPoint, LAUNDRY_BASKET, slotCenter, STASHES } from "../../sim/home";
import { furTufts, ROBOT_DOCK, robotAt } from "../../sim/household";
import type { Target } from "../../sim/targets";
import type { GameState, TrinketKind, Vec } from "../../sim/types";
import { addArt, setArt } from "../art/atlas";
import type { PartContext } from "../world/context";
import { isoItemLook, type IsoFootprint } from "../world/objects";
import type { Point, WorldFrame, WorldPart } from "../world/part";
import { ISO } from "../world/projection";
import { isoDepth, type IsoDepth, type IsoPointHandle, type IsoPointOptions } from "./depth";
import { floorAnchorAt } from "./geometry";
import { IsoHighlight } from "./highlight";
import { basketState, carrierOccupied, feederFrame, itemFrame, messFrame, robotFrame, trinketFrame, type IsoFrame } from "./looks";

/** Що лежить на речі, — у її проміжку глибини, нижче за пів проміжку (`ISO_DEPTH_SLOT` 0,01). */
const ON = { overlay: 0.002, fx: 0.003, grate: 0.004 } as const;

/** Ґратки переноски — над нею (у її проміжку): старий кіт, що спить у переносці (`legacy/cat.ts`), — між нею й ґратками. */
export const CARRIER_GRATE_DEPTH = ON.grate;

/** Автогодівниця стоїть позаду своєї миски на тій самій клітинці: для порядку — на стільки клітинок далі. */
const FEEDER_BEHIND = 0.3;
/** Бабл над безладом — на стільки над підлогою (як у старому вигляді: 12 px над плямою). */
const MESS_HEIGHT = 6;
/** Як часто хвилі запаху брудного лотка міняють кадр, мс, і на якій частці висоти лотка вони починаються. */
const SMELL_MS = 450;
const SMELL_LIFT = 0.8;
/** Пів сторони сліду речі на підлозі для каркаса підсвітки без WebGL, клітинки. */
const OUTLINE_HALF = 0.4;

/** Накладка на річ: малюнок, кадр, що зараз показано, і зсув глибини від самої речі. */
interface Extra {
  image: Phaser.GameObjects.Image;
  key: string;
  offset: number;
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
  /** Речі котячого кутка за id, безлад за id, автогодівниці за місцем миски, дрібнички за видом, жмути шерсті за номером. */
  private readonly items = new Map<number, Spot>();
  private readonly messes = new Map<number, Spot>();
  private readonly feeders = new Map<string, Spot>();
  private readonly trinkets = new Map<TrinketKind, Spot>();
  private readonly tufts: Spot[] = [];
  /** Одиничні: робот, його док, переноска, кошик білизни, шкарпетка за диваном. */
  private readonly singles = new Map<string, Spot>();

  constructor(private readonly ctx: PartContext) {
    this.depth = isoDepth(ctx);
    this.glow = new IsoHighlight(ctx.scene, ctx.layer);
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
      const at = itemPoint(item);
      this.place(spot, look, at, isoItemLook(item.kind, item.quality).height, item.kind === "toy" ? item.hidden : undefined);
      // Фонтанчик (§8.7) — на кожній мисці з водою; брудний лоток пахне (§9.12).
      if (item.kind === "water") this.extra(spot, "fountain", fountain ? { id: `item/fountain/${fountain}`, state: null } : null, ON.overlay);
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

    // Безлад (§9.12): пласкі плями під котами й персонажем.
    for (const mess of home.messes) {
      let spot = this.messes.get(mess.id);
      if (!spot) {
        spot = this.spot(messFrame(mess.kind), { id: `mess:${mess.id}`, flat: true, half: 40 });
        this.messes.set(mess.id, spot);
      }
      this.place(spot, messFrame(mess.kind), mess, MESS_HEIGHT);
    }

    // Шерсть видно лише від межі (§8.7, А17): що більше, то більше жмутів.
    furTufts(state).forEach((at, i) => {
      const spot = (this.tufts[i] ??= this.spot({ id: "mess/fur-tuft", state: null }, { flat: true, half: 16 }));
      this.place(spot, { id: "mess/fur-tuft", state: null }, at, 4);
    });

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

    this.forgetUnseen();
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
      this.single("dock", { id: "item/robot-dock", state: null }, ROBOT_DOCK, 14, { flat: true, half: 32 });
      this.single("robot", robotFrame(state, robot), robotAt(state), isoItemLook("robot", robot).height, { id: "robot", half: isoItemLook("robot", robot).half });
    }
    if (home.carrier) {
      const carrier = this.single("carrier", { id: `item/carrier/${home.carrier}`, state: "body" }, CARRIER_SPOT, isoItemLook("carrier").height, {
        id: "carrier",
        half: isoItemLook("carrier").half,
      });
      this.extra(carrier, "grate", carrierOccupied(state) ? { id: `item/carrier/${home.carrier}`, state: "grate" } : null, ON.grate);
    }
    this.single("basket", { id: "env/laundry-basket", state: basketState(home.clothes) }, LAUNDRY_BASKET, isoItemLook("basket").height, {
      id: "basket",
      half: isoItemLook("basket").half,
    });
    // Шкарпетка в схованці (§9.12, «Подарунки й схованки»): п'ятка визирає з-за дивана — під ним.
    if (home.sock === true) this.single("sock", { id: "mess/sock", state: "peek" }, STASHES.sofa.at, 8, { half: 20 }, "sofa");
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
    yield this.tufts;
    yield this.singles.values();
  }

  /** Речі, яких цього кадру немає (продали, прибрали, зламалися), прибрати; жмути шерсті — сховати, їх знову стане більше. */
  private forgetUnseen(): void {
    for (const map of [this.items, this.messes, this.feeders, this.trinkets, this.singles] as Map<unknown, Spot>[]) {
      for (const [key, spot] of map) {
        if (spot.seen) continue;
        destroySpot(spot);
        map.delete(key);
      }
    }
    for (const spot of this.tufts) if (!spot.seen) this.hide(spot);
  }

  lateUpdate(): void {
    this.glow.apply();
    this.depth.solve();
  }

  /** Новий день чи нова гра: id речей і безладу можуть означати вже інше. */
  reset(): void {
    for (const spots of this.all()) for (const spot of spots) destroySpot(spot);
    this.items.clear();
    this.messes.clear();
    this.feeders.clear();
    this.trinkets.clear();
    this.tufts.length = 0;
    this.singles.clear();
  }

  destroy(): void {
    this.reset();
    this.glow.destroy();
  }

  /** Над річчю котячого кутка чи безладом. */
  anchor(id: string): Point | null {
    const [kind, raw] = id.split(":");
    const number = Number(raw);
    const home = this.ctx.state().home;
    if (kind === "item") {
      const item = home.items.find((i) => i.id === number);
      return item ? floorAnchorAt(itemPoint(item), isoItemLook(item.kind, item.quality).height) : null;
    }
    if (kind === "mess") {
      const mess = home.messes.find((m) => m.id === number);
      return mess ? floorAnchorAt(mess, MESS_HEIGHT) : null;
    }
    return null;
  }

  /** Сяйво довкола речі чи безладу (без WebGL — каркас довкола точки). */
  highlight(target: Target, alpha: number): boolean {
    if (target.type !== "item" && target.type !== "mess") return false;
    const spot = target.type === "item" ? this.items.get(target.item.id) : this.messes.get(target.mess.id);
    const at: Vec = target.type === "item" ? itemPoint(target.item) : target.mess;
    const height = target.type === "item" ? isoItemLook(target.item.kind, target.item.quality).height : MESS_HEIGHT;
    if (spot) this.glow.request(spot.image, around(at), height, alpha);
    return true;
  }
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
