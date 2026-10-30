// Реєстр глибини ізометричного світу (крок 16, `GRAPHICS_PLAN.md`, «Проєкція і глибина»): хто кого закриває серед
// ізометричних частин. Частини реєструють коробки (меблі, сегменти внутрішніх і передніх стін — один раз) і точки (персонаж,
// коти, речі на підлозі, бруд — ставлять щокадру) з колбеком глибини; розв'язувач кличе `isoOrder` і роздає глибини. Один
// реєстр на світ (`isoDepth(ctx)`). Phaser не потрібен: колбек сам ставить глибину своїм об'єктам.
//
// Глибини — в одиницях екранного y світу, як `ISO.depthOf` / `ISO.depthAt` (ними ще користуються старі кіт і персонаж на
// ізометричній підлозі, `?gfx=iso`): кожен елемент хоче глибину своєї середини на екрані (точка — ноги, коробка — середина
// сліду), а реєстр піднімає її рівно настільки, щоб іти за порядком `isoOrder` з кроком `ISO_DEPTH_SLOT`. Тож порядок
// ізометричних частин точний, а старі частини стають між ними приблизно правильно. Усі глибини реєстру — від 0 до
// `ISO_DEPTH_MAX`, нижче за позначки, бабли й підписи (`WORLD_LAYERS.marks`); підлога й плити кімнат із задніми стінами —
// `ISO_BACKDROP_DEPTH`, нижче за все.
//
// Хто й коли розв'язує: точки ставлять в `update` частини, а кожна ізометрична частина, що щось зареєструвала, кличе
// `solve()` наприкінці свого `lateUpdate` (усі `update` світу вже пройшли — див. `World.update`). Розв'язувач рахує лише
// тоді, коли з минулого разу щось змінилося, тож працює перший виклик кадру, а решта нічого не коштують; колбек
// кличеться лише тоді, коли глибина змінилася.

import { IsoWork, isoOrder, type IsoBox, type IsoPoint } from "../world/isoorder";
import { WORLD_LAYERS } from "../world/layers";
import type { WorldQuery } from "../world/part";
import { ISO_DEPTH_TIE, ISO_ORIGIN, ISO_TILE } from "../world/projection";

/** Колбек глибини: наприклад, `(d) => image.setDepth(d)`, чи кілька шматків на `d`, `d + 0.001`… (див. `ISO_DEPTH_SLOT`). */
export type SetDepth = (depth: number) => void;

/**
 * Скільки глибини має кожен елемент реєстру: `[d, d + ISO_DEPTH_SLOT)` — його, наступний ближчий починається не раніше.
 * Шматки одного елемента (тінь, тіло, рука спереду) кладуть у цей проміжок.
 */
export const ISO_DEPTH_SLOT = 0.01;
/** Найбільша глибина реєстру: нижче за позначки, бабли й підписи. */
export const ISO_DEPTH_MAX = WORLD_LAYERS.marks - 1;
/** Підлога, плити кімнат із задніми стінами й вікнами, килим — під усім, що в реєстрі. */
export const ISO_BACKDROP_DEPTH = -1000;

/** Коробка для реєстру: слід у клітинках, `id` — щоб на неї могли ставати точки (id речі квартири: `fridge`, `sofa`). */
export interface IsoBoxSpec extends IsoBox {
  readonly id?: string;
}

export interface IsoBoxHandle {
  readonly id: string | null;
  /** Остання глибина (NaN — ще не було розв'язку з цією коробкою). */
  readonly depth: number;
  /**
   * Чи коробка зараз є (сховища з'являються з першим запасом, ящики біля входу — лише з покупками): без неї порядок
   * рахується так, ніби її немає, а точки, що на ній стояли, — на підлозі.
   */
  setActive(active: boolean): void;
  remove(): void;
}

export interface IsoPointOptions {
  /** Щоб на точку могли посилатися інші (`placeAbove`): `person`, `cat:3`. */
  readonly id?: string;
  /** Пласка річ на підлозі (бруд, слід паперу): під тим, хто стоїть на ній чи перед нею. */
  readonly flat?: boolean;
  /** Півширина малюнка на екрані, одиниці арту (типово — пів ромба, `ISO_POINT_HALF`). */
  readonly half?: number;
}

export interface IsoPointHandle {
  readonly id: string | null;
  /** Остання глибина (NaN — ще не було розв'язку з цією точкою). */
  readonly depth: number;
  /**
   * Поставити точку на підлогу (x, y у клітинках) — або на коробку з id `on` (кіт на меблях: над нею, а відносно решти — як
   * вона). Точка лишається, доки її не сховали чи не поставили інакше; кликати щокадру, коли точка рухається.
   */
  place(x: number, y: number, on?: string | null): void;
  /** Під коробкою з id `box` (кіт ховається під меблями): одразу за нею, а відносно решти — як вона. */
  placeUnder(x: number, y: number, box: string): void;
  /**
   * Над іншою точкою чи коробкою з id `target` (кіт на руках персонажа): глибина цілі плюс `offset` (типово — пів
   * `ISO_DEPTH_SLOT`, тож шматки цілі нижче за пів проміжку — під цією точкою, вище — над нею). Ціль — на підлозі чи коробка.
   */
  placeAbove(target: string, offset?: number): void;
  /** Точки зараз не видно (кіт у поїздці): у порядку її немає. */
  hide(): void;
  remove(): void;
}

/** Внутрішній запис коробки. Сам є `IsoBox` для `isoOrder`. */
class BoxEntry implements IsoBoxHandle, IsoBox {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly id: string | null;
  active = true;
  removed = false;
  depth = Number.NaN;
  /** Місце серед активних коробок цього розв'язку. */
  index = -1;

  constructor(
    private readonly registry: IsoDepth,
    spec: IsoBoxSpec,
    readonly setDepth: SetDepth,
  ) {
    this.x0 = spec.x0;
    this.y0 = spec.y0;
    this.x1 = spec.x1;
    this.y1 = spec.y1;
    this.id = spec.id ?? null;
  }

  setActive(active: boolean): void {
    if (this.active === active || this.removed) return;
    this.active = active;
    this.registry.changed();
  }

  remove(): void {
    if (this.removed) return;
    this.removed = true;
    this.registry.forgetBox(this);
  }
}

type PointMode = "hidden" | "floor" | "above";

/** Внутрішній запис точки. Його `iso` — точка для `isoOrder` (той самий об'єкт щокадру). */
class PointEntry implements IsoPointHandle {
  readonly id: string | null;
  depth = Number.NaN;
  mode: PointMode = "hidden";
  removed = false;
  x = 0;
  y = 0;
  on: string | null = null;
  under = false;
  target = "";
  offset = ISO_DEPTH_SLOT / 2;
  readonly iso: { x: number; y: number; on: number; under: boolean; flat: boolean; half?: number };

  constructor(
    private readonly registry: IsoDepth,
    options: IsoPointOptions,
    readonly setDepth: SetDepth,
  ) {
    this.id = options.id ?? null;
    this.iso = { x: 0, y: 0, on: -1, under: false, flat: options.flat === true, ...(options.half === undefined ? {} : { half: options.half }) };
  }

  place(x: number, y: number, on: string | null = null): void {
    this.set("floor", x, y, on, false);
  }

  placeUnder(x: number, y: number, box: string): void {
    this.set("floor", x, y, box, true);
  }

  placeAbove(target: string, offset = ISO_DEPTH_SLOT / 2): void {
    if (this.removed) return;
    if (this.mode === "above" && this.target === target && this.offset === offset) return;
    this.mode = "above";
    this.target = target;
    this.offset = offset;
    this.registry.changed();
  }

  hide(): void {
    if (this.removed || this.mode === "hidden") return;
    this.mode = "hidden";
    this.registry.changed();
  }

  remove(): void {
    if (this.removed) return;
    this.removed = true;
    this.registry.forgetPoint(this);
  }

  private set(mode: PointMode, x: number, y: number, on: string | null, under: boolean): void {
    if (this.removed) return;
    if (this.mode === mode && this.x === x && this.y === y && this.on === on && this.under === under) return;
    this.mode = mode;
    this.x = x;
    this.y = y;
    this.on = on;
    this.under = under;
    this.registry.changed();
  }
}

/** Екранна половина висоти ромба: на стільки нижче з кожною одиницею x + y. */
const HALF_H = ISO_TILE.height / 2;

/** Реєстр глибини одного світу. */
export class IsoDepth {
  private readonly boxes: BoxEntry[] = [];
  private readonly points: PointEntry[] = [];
  private readonly boxById = new Map<string, BoxEntry>();
  private readonly pointById = new Map<string, PointEntry>();
  private readonly work = new IsoWork();
  private readonly activeBoxes: BoxEntry[] = [];
  private readonly floorPoints: PointEntry[] = [];
  private readonly isoPoints: IsoPoint[] = [];
  private dirty = true;
  /** Скільки разів останній розв'язок розривав цикл (`IsoWork.cycles`): 0 — усі правила виконано. */
  cycles = 0;

  /** Зареєструвати коробку (один раз, коли частина створює свої меблі чи стіни). Id — унікальний у світі. */
  addBox(spec: IsoBoxSpec, setDepth: SetDepth): IsoBoxHandle {
    const entry = new BoxEntry(this, spec, setDepth);
    if (entry.id !== null) {
      if (this.boxById.has(entry.id)) throw new Error(`Коробка «${entry.id}» уже є в реєстрі глибини`);
      this.boxById.set(entry.id, entry);
    }
    this.boxes.push(entry);
    this.dirty = true;
    return entry;
  }

  /** Зареєструвати точку (схована, доки її не поставили). Id — унікальний у світі. */
  addPoint(setDepth: SetDepth, options: IsoPointOptions = {}): IsoPointHandle {
    const entry = new PointEntry(this, options, setDepth);
    if (entry.id !== null) {
      if (this.pointById.has(entry.id)) throw new Error(`Точка «${entry.id}» уже є в реєстрі глибини`);
      this.pointById.set(entry.id, entry);
    }
    this.points.push(entry);
    return entry;
  }

  /** Коробка за id, якщо вона є. */
  box(id: string): IsoBoxHandle | null {
    return this.boxById.get(id) ?? null;
  }

  /** Точка за id, якщо вона є. */
  point(id: string): IsoPointHandle | null {
    return this.pointById.get(id) ?? null;
  }

  /**
   * Розв'язати порядок і роздати глибини, якщо з минулого разу щось змінилося. Кличуть ізометричні частини наприкінці
   * `lateUpdate`; зайві виклики того самого кадру нічого не коштують.
   */
  solve(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const boxes = this.activeBoxes;
    boxes.length = 0;
    for (const box of this.boxes) {
      box.index = box.active ? boxes.length : -1;
      if (box.active) boxes.push(box);
    }
    const floor = this.floorPoints;
    const iso = this.isoPoints;
    floor.length = 0;
    iso.length = 0;
    for (const point of this.points) {
      if (point.mode !== "floor") continue;
      const p = point.iso;
      const base = point.on === null ? -1 : (this.boxById.get(point.on)?.index ?? -1);
      p.x = point.x;
      p.y = point.y;
      p.on = base;
      p.under = point.under;
      floor.push(point);
      iso.push(p);
    }
    const work = this.work;
    const order = isoOrder(boxes, iso, work);
    this.cycles = work.cycles;
    const nb = boxes.length;
    let previous = -Infinity;
    for (let k = 0; k < order.length; k++) {
      const id = order[k]!;
      // Своя середина на екрані (як `ISO.depthAt`), але не ближче за попереднього в порядку плюс його проміжок.
      const wanted = ISO_ORIGIN.y + work.key[id]! * HALF_H + work.tie[id]! * ISO_DEPTH_TIE;
      const depth = Math.min(ISO_DEPTH_MAX, Math.max(0, wanted, previous + ISO_DEPTH_SLOT));
      previous = depth;
      if (id < nb) apply(boxes[id]!, depth);
      else apply(floor[id - nb]!, depth);
    }
    for (const point of this.points) {
      if (point.mode !== "above") continue;
      const target = this.pointById.get(point.target) ?? this.boxById.get(point.target);
      if (!target) continue;
      const visible = target instanceof PointEntry ? target.mode !== "hidden" : target.active;
      if (visible && !Number.isNaN(target.depth)) apply(point, Math.min(ISO_DEPTH_MAX, target.depth + point.offset));
    }
  }

  /** Щось змінилося: наступний `solve` рахує заново. */
  changed(): void {
    this.dirty = true;
  }

  forgetBox(entry: BoxEntry): void {
    remove(this.boxes, entry);
    if (entry.id !== null && this.boxById.get(entry.id) === entry) this.boxById.delete(entry.id);
    this.dirty = true;
  }

  forgetPoint(entry: PointEntry): void {
    remove(this.points, entry);
    if (entry.id !== null && this.pointById.get(entry.id) === entry) this.pointById.delete(entry.id);
    if (entry.mode !== "hidden") this.dirty = true;
  }
}

function apply(entry: { depth: number; setDepth: SetDepth }, depth: number): void {
  if (entry.depth === depth) return;
  entry.depth = depth;
  entry.setDepth(depth);
}

function remove<T>(list: T[], item: T): void {
  const i = list.indexOf(item);
  if (i >= 0) list.splice(i, 1);
}

const REGISTRIES = new WeakMap<WorldQuery, IsoDepth>();

/** Реєстр глибини світу частини: один на світ, створюється з першим запитом. */
export function isoDepth(ctx: { readonly world: WorldQuery }): IsoDepth {
  let registry = REGISTRIES.get(ctx.world);
  if (!registry) {
    registry = new IsoDepth();
    REGISTRIES.set(ctx.world, registry);
  }
  return registry;
}
