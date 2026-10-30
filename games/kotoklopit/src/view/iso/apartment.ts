// Ізометрична квартира (крок 16, F3b, `GRAPHICS_PLAN.md`): плити кімнат (підлога й задні стіни), вікна, внутрішні стіни й
// передні плінтуси сегментами, поріг дверей, меблі `OBJECTS` зі станами, наповнення сховищ, ящики біля входу, страви на
// плиті й поверхнях, дрібнички на столах, туалетний папір, дріт комп'ютера. Кадри — з маніфесту арту (`addArt`), тож поки
// арту немає, на їхньому місці заглушки потрібного розміру й pivot.
//
// Те саме, що показує стара квартира (`legacy/apartmentview.ts`), з того самого стану (`looks.ts`), лише в ізометрії.
// Глибина: плити кімнат, вікна й папір на задній стіні — під усім (`ISO_BACKDROP_DEPTH`); меблі й сегменти стін — коробки в
// реєстрі глибини (`iso/depth.ts`), а все, що лежить на речі (накладки наповнення, страва, дрібничка, замок), — у її
// проміжку глибини. Внутрішня стіна, що закриває персонажа, напівпрозоро згасає.

import type Phaser from "phaser";

import { isPresent, objectById, OBJECTS, ROOMS, roomAt, TOILET_ROLL, TRINKETS, WINDOWS, WIRE_TILE, type HomeObject } from "../../sim/home";
import type { Target } from "../../sim/targets";
import type { GameState } from "../../sim/types";
import { addArt, isArtStub, setArt } from "../art/atlas";
import { WALL_HEIGHT, WALL_SEGMENTS, type WallSegment } from "../art/manifest/lib/geometry";
import type { ArtId } from "../art/types";
import type { PartContext } from "../world/context";
import { isoObjectLook, type IsoFootprint, type IsoObjectLook } from "../world/objects";
import type { ApartmentPart, Point, WorldFrame } from "../world/part";
import { ISO } from "../world/projection";
import { ISO_BACKDROP_DEPTH, isoDepth, type IsoBoxHandle, type IsoDepth, type IsoPointHandle } from "./depth";
import { artOffset, boxCovers, objectAnchorAt, objectScreen, PERSON_FIGURE } from "./geometry";
import { IsoHighlight } from "./highlight";
import {
  bedState,
  boxesState,
  cabinetLook,
  computerState,
  dishFrame,
  fridgeLook,
  KIT_EXTRAS,
  kitLook,
  shapedState,
  showerState,
  sinkState,
  stoveState,
  STORAGE_OVERLAYS,
  storageOverlays,
  trashState,
  trinketFrame,
  vacuumState,
  type IsoFrame,
} from "./looks";

/** Порядок шарів тла: підлога, задні стіни, вікна на них, папір на стіні ванної. */
const BACKDROP = { floor: ISO_BACKDROP_DEPTH, wall: ISO_BACKDROP_DEPTH + 1, window: ISO_BACKDROP_DEPTH + 2, decal: ISO_BACKDROP_DEPTH + 3 } as const;

/**
 * Глибина того, що лежить на речі, — над нею, у її проміжку (`ISO_DEPTH_SLOT` 0,01) і нижче за його половину: кіт, що
 * виліз на річ, — уже над усім цим (`IsoPointHandle.place(x, y, id)`).
 */
const ON = { overlay: 0.001, step: 0.0001, mom: 0.0015, dish: 0.002, trinket: 0.0025, lock: 0.003 } as const;

/** Наскільки прозора згасла стіна, і як швидко вона згасає й повертається (частка шляху за секунду). */
const FADED_ALPHA = 0.4;
const FADE_RATE = 8;

/** Частина зображення речі: кадр, що зараз показано, і зсув глибини від самої речі. */
interface Piece {
  image: Phaser.GameObjects.Image;
  key: string;
  offset: number;
}

/** Річ квартири: малюнок, усе, що на ній, і її коробка в реєстрі глибини. */
interface Thing {
  object: HomeObject;
  look: IsoObjectLook;
  /** Точка підлоги під центром сліду на екрані — pivot кадру. */
  at: Point;
  body: Piece;
  /** Накладки наповнення, страва, дрібничка, замок — за назвою. */
  extras: Map<string, Piece>;
  box: IsoBoxHandle;
  depth: number;
  present: boolean;
}

/** Сегмент внутрішньої стіни чи переднього плінтуса. */
interface Wall {
  segment: WallSegment;
  image: Phaser.GameObjects.Image;
  box: IsoBoxHandle;
  footprint: IsoFootprint;
  alpha: number;
}

export class IsoApartmentView implements ApartmentPart {
  private readonly depth: IsoDepth;
  private readonly things = new Map<string, Thing>();
  private readonly walls: Wall[] = [];
  private readonly backdrop: Phaser.GameObjects.Image[] = [];
  private readonly toiletRoll: Piece;
  private readonly wire: Piece;
  private readonly wirePoint: IsoPointHandle;
  private readonly glow: IsoHighlight;
  /** Час минулого кадру, мс: від нього — швидкість згасання стін. */
  private lastTime: number | null = null;

  constructor(private readonly ctx: PartContext) {
    const { scene, layer } = ctx;
    this.depth = isoDepth(ctx);
    this.glow = new IsoHighlight(scene, layer);

    // Плити кімнат: підлога й задні стіни кожної — в одну точку, верхню вершину ромба першої клітинки кімнати.
    for (const room of ROOMS) {
      const at = ISO.toScreen({ x: room.x, y: room.y });
      this.backdrop.push(this.art(`env/room/${room.id}/floor`, at, BACKDROP.floor));
      this.backdrop.push(this.art(`env/room/${room.id}/wall`, at, BACKDROP.wall));
    }
    // Вікна — накладки на задню стіну в клітинці стіни.
    for (const pane of WINDOWS) {
      this.backdrop.push(this.art(`env/window/${roomAt(objectById(pane.sill)) ?? "living"}`, ISO.toScreen(pane.wall), BACKDROP.window));
    }
    // Рулон паперу на задній стіні ванної: його закриває все, що стоїть перед стіною.
    this.toiletRoll = { image: this.art("env/toilet-roll", ISO.toScreen(TOILET_ROLL), BACKDROP.decal), key: "", offset: 0 };
    this.backdrop.push(this.toiletRoll.image);

    // Внутрішні стіни й передні плінтуси — коробки: вони закривають тих, хто за ними.
    for (const segment of WALL_SEGMENTS) {
      const { rect } = segment;
      const image = this.art(segment.id, ISO.toScreen(rect), 0);
      const footprint = { x0: rect.x, y0: rect.y, x1: rect.x + rect.w, y1: rect.y + rect.h };
      const box = this.depth.addBox(footprint, (d) => image.setDepth(d));
      this.walls.push({ segment, image, box, footprint, alpha: 1 });
    }

    // Дріт комп'ютера: по підлозі від стола до розетки на стіні ряду 5 — пласка річ перед стіною й столом.
    const wireAt = { x: WIRE_TILE.x + 0.5, y: WIRE_TILE.y + 0.5 };
    const wire = this.art("env/wire", ISO.toScreen(wireAt), 0);
    this.wire = { image: wire, key: "", offset: 0 };
    this.wirePoint = this.depth.addPoint((d) => wire.setDepth(d), { flat: true });
    this.wirePoint.place(wireAt.x, wireAt.y);

    for (const object of OBJECTS) this.things.set(object.id, this.thing(object));
  }

  /** Кадр запису в точці `at` на глибині `depth`. */
  private art(id: ArtId, at: Point, depth: number): Phaser.GameObjects.Image {
    return addArt(this.ctx.scene, this.ctx.layer, id).setPosition(at.x, at.y).setDepth(depth);
  }

  /** Річ квартири: кадр `env/<id>` у точці під центром сліду й коробка в реєстрі (id коробки — id речі). */
  private thing(object: HomeObject): Thing {
    const look = isoObjectLook(object.id);
    const at = objectScreen(object);
    const id: ArtId = `env/${object.id}`;
    const view = { object, look, at, body: { image: this.art(id, at, 0), key: "", offset: 0 }, extras: new Map<string, Piece>(), depth: 0, present: true };
    const box = this.depth.addBox({ ...look.footprint, id: object.id }, (d) => {
      view.depth = d;
      view.body.image.setDepth(d);
      for (const piece of view.extras.values()) piece.image.setDepth(d + piece.offset);
    });
    return Object.assign(view, { box });
  }

  private get(id: string): Thing {
    const thing = this.things.get(id);
    if (!thing) throw new Error(`Немає речі «${id}»`);
    return thing;
  }

  /** Показати кадр самої речі. */
  private show(thing: Thing, frame: IsoFrame): void {
    setPiece(thing.body, frame);
  }

  /**
   * Показати щось на речі (накладку, страву, дрібничку, замок) під назвою `name`: кадр `frame` (null — сховати), у точці
   * кріплення `point` запису речі (без неї — у pivot речі, як накладки того самого полотна).
   */
  private put(thing: Thing, name: string, frame: IsoFrame | null, offset: number, point?: string): void {
    let piece = thing.extras.get(name);
    if (!frame) {
      piece?.image.setVisible(false);
      return;
    }
    if (!piece) {
      piece = { image: addArt(this.ctx.scene, this.ctx.layer, frame.id, { state: frame.state }), key: "", offset };
      piece.image.setDepth(thing.depth + offset);
      thing.extras.set(name, piece);
    }
    setPiece(piece, frame);
    const shift = point ? (artOffset(`env/${thing.object.id}`, point) ?? { x: 0, y: 0 }) : { x: 0, y: 0 };
    // Накладки, якої ще не намальовано, на вже намальованій речі не видно: маджентова заглушка на все полотно речі закрила
    // б еталон (холодильник F1a під накладкою наповнення A2). Коли накладку намалюють, вона з'явиться сама.
    const hidden = isArtStub(piece.image) && !isArtStub(thing.body.image);
    piece.image.setPosition(thing.at.x + shift.x, thing.at.y + shift.y).setVisible(thing.present && !hidden);
  }

  update(state: GameState, frame: WorldFrame): void {
    this.glow.begin();
    // Сховища з'являються в квартирі після першого отримання запасу (§6.4), ящики — лише з покупками.
    for (const thing of this.things.values()) {
      const present = isPresent(state, thing.object);
      thing.present = present;
      thing.body.image.setVisible(present);
      thing.box.setActive(present);
      if (!present) for (const piece of thing.extras.values()) piece.image.setVisible(false);
    }
    this.drawStates(state);
    this.drawSurfaces(state);
    // Розмотаний рулон (§9.12, «Мисливський інстинкт») і перегризений дріт (§9.12, «Гризіння»).
    setPiece(this.toiletRoll, { id: "env/toilet-roll", state: state.home.rollDown === true ? "unrolled" : "full" });
    setPiece(this.wire, { id: "env/wire", state: state.home.wireChewed === true ? "chewed" : "whole" });
    this.fadeWalls(state, frame.time);
  }

  /** Стани речей і наповнення сховищ (§6.4, §8.7, §9.12). */
  private drawStates(state: GameState): void {
    const fridge = this.get("fridge");
    const cold = fridgeLook(state);
    this.show(fridge, cold.body);
    this.put(fridge, "food", cold.food, ON.overlay);
    this.put(fridge, "mom", cold.mom ? { id: "env/fridge/mom-meal", state: null } : null, ON.mom);

    const cabinet = this.get("cat-cabinet");
    const cupboard = cabinetLook(state);
    this.show(cabinet, cupboard.body);
    this.put(cabinet, "food", cupboard.food, ON.overlay);
    this.put(cabinet, "lock", cupboard.lock, ON.lock, cupboard.lockPoint);

    this.show(this.get("stove"), { id: "env/stove", state: stoveState(state) });
    this.show(this.get("trash"), { id: "env/trash", state: trashState(state) });
    this.show(this.get("computer"), { id: "env/computer", state: computerState(state) });
    this.show(this.get("bed"), { id: "env/bed", state: bedState(state) });
    this.show(this.get("vacuum"), { id: "env/vacuum", state: vacuumState(state) });
    this.show(this.get("washer"), { id: "env/washer", state: state.home.washer.state });
    this.show(this.get("shower"), { id: "env/shower", state: showerState(state) });
    this.show(this.get("sink"), { id: "env/sink", state: sinkState(state) });
    // Накладки одного сховища — по черзі над річчю (гель під шампунем).
    for (const id of ["shower", "sink", "washer"] as const) {
      const thing = this.get(id);
      storageOverlays(state, id).forEach((overlay, i) => this.put(thing, STORAGE_OVERLAYS[id][i]!, overlay, ON.overlay + i * ON.step));
    }
    for (const id of ["litter-bag", "sterile-bin"] as const) this.show(this.get(id), { id: `env/${id}`, state: shapedState(state, id) });

    const kit = this.get("cat-kit");
    const box = kitLook(state);
    this.show(kit, box.body);
    box.extras.forEach((extra, i) => this.put(kit, KIT_EXTRAS[i]!, extra, ON.overlay + i * ON.step));

    // Купа ящиків біля входу: 1–4 коробки; без покупок її немає (річ невидима — `isPresent`).
    const pile = boxesState(state);
    if (pile) this.show(this.get("boxes"), { id: "env/boxes", state: pile });
  }

  /** Страви на поверхнях (плита показує свою сковороду сама) і дрібнички на своїх місцях (§8.7, §9.12). */
  private drawSurfaces(state: GameState): void {
    const { home } = state;
    for (const id of Object.keys(home.surfaces)) {
      const thing = this.things.get(id);
      if (!thing) continue;
      const dish = home.surfaces[id];
      this.put(thing, "dish", dish ? dishFrame(dish) : null, ON.dish, "dish");
    }
    // Дрібнички стоять на своїх місцях, поки їх не скинули; скинуті лежать на підлозі (їх показує підлога).
    for (const trinket of TRINKETS) {
      const thing = this.get(trinket.object);
      this.put(thing, `trinket:${trinket.kind}`, home.trinkets?.[trinket.kind] ? null : trinketFrame(trinket.kind, false), ON.trinket, trinket.kind);
    }
  }

  /**
   * Внутрішня стіна, що закриває персонажа, напівпрозоро згасає (`GRAPHICS_PLAN.md`, «Контракти»): він за нею й близько, і
   * вона на тій самій горизонталі екрана. Плінтуси низькі — не згасають.
   */
  private fadeWalls(state: GameState, time: number): void {
    const dt = this.lastTime === null ? 1 : Math.min(0.25, Math.max(0, (time - this.lastTime) / 1000));
    this.lastTime = time;
    const activity = state.character.activity;
    const hidden = state.trip !== null || (activity?.kind === "use" && activity.inside === true && activity.bath !== true);
    const body = state.character.body;
    for (const wall of this.walls) {
      if (wall.segment.kind !== "inner") continue;
      const covers = !hidden && boxCovers(wall.footprint, WALL_HEIGHT.inner, body, PERSON_FIGURE);
      const target = covers ? FADED_ALPHA : 1;
      wall.alpha += (target - wall.alpha) * Math.min(1, dt * FADE_RATE);
      if (Math.abs(wall.alpha - target) < 0.01) wall.alpha = target;
      wall.image.setAlpha(wall.alpha);
    }
  }

  lateUpdate(): void {
    this.glow.apply();
    this.depth.solve();
  }

  reset(): void {
    this.lastTime = null;
  }

  destroy(): void {
    this.glow.destroy();
    for (const thing of this.things.values()) {
      thing.box.remove();
      thing.body.image.destroy();
      for (const piece of thing.extras.values()) piece.image.destroy();
    }
    this.things.clear();
    for (const wall of this.walls) {
      wall.box.remove();
      wall.image.destroy();
    }
    this.walls.length = 0;
    this.wirePoint.remove();
    this.wire.image.destroy();
    for (const image of this.backdrop) image.destroy();
    this.backdrop.length = 0;
  }

  /** Над річчю квартири, поки вона є (сховища з'являються після першого запасу, §6.4). */
  anchor(id: string): Point | null {
    const thing = this.things.get(id);
    if (!thing) return null;
    return isPresent(this.ctx.state(), thing.object) ? objectAnchorAt(thing.object) : null;
  }

  objectAnchor(id: string): Point | null {
    const thing = this.things.get(id);
    return thing ? objectAnchorAt(thing.object) : null;
  }

  /** Сяйво довкола малюнка речі (без WebGL — каркас її сліду). */
  highlight(target: Target, alpha: number): boolean {
    if (target.type !== "object") return false;
    const thing = this.things.get(target.id);
    if (!thing) return false;
    this.glow.request(thing.body.image, thing.look.footprint, thing.look.tall, alpha);
    return true;
  }
}

/** Показати кадр на частині речі, якщо він інший, ніж зараз. */
function setPiece(piece: Piece, frame: IsoFrame): void {
  const key = `${frame.id}|${frame.state ?? ""}`;
  if (piece.key === key) return;
  piece.key = key;
  setArt(piece.image, frame.id, { state: frame.state });
}
