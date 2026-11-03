// Ізометрична квартира (крок 16, F3b, `GRAPHICS_PLAN.md`): плити кімнат (підлога й задні стіни), вікна, внутрішні стіни й
// передні плінтуси сегментами, поріг дверей, меблі `OBJECTS` зі станами, наповнення сховищ, ящики біля входу, страви на
// плиті й поверхнях, дрібнички на столах, туалетний папір, дріт комп'ютера, котячі сліди, павутина в кутах (§8.7), а також
// декор, якого сим не знає (§8.9, §4.1; `src/view/decor.ts`, стани — `decorlook.ts`): кухонне вікно, бра, настільна лампа,
// бойлер, зарядна станція й полички зі свічками дня відключення. Кадри — з маніфесту арту (`addArt`), тож поки арту немає, на
// їхньому місці заглушки потрібного розміру й pivot.
//
// Що показати — зі стану гри (`looks.ts`).
// Глибина: плити кімнат, вікна, павутина, папір, бра, полички й бойлер на задній стіні — під усім (`ISO_BACKDROP_DEPTH`);
// меблі й сегменти стін — коробки в реєстрі глибини (`iso/depth.ts`), а все, що лежить на речі (накладки наповнення, страва,
// настільна лампа, дрібничка, замок), — у її проміжку глибини; зарядна станція стоїть на підлозі перед стіною ряду 5 — коробка
// свого сліду в реєстрі, а дріт у її гнізді — одразу під нею. Котячий слід (§9.12, «Котячі сліди в квартирі») — накладка
// `env/trace/…` на своєму господарі (`TRACE_OVERLAYS`): у тій самій точці, одразу над ним (сліди на підлогах — над усіма
// плитами підлог і під стінами, шпалери — над стіною й під вікнами) і лише разом із ним; накладка на сегменті стіни згасає
// разом зі стіною. Внутрішня стіна, що закриває персонажа, кота, лоток чи безлад, напівпрозоро згасає. Стільці до стола з
// комп'ютером і кухонного стола (`personseat.ts`) — два шматки, сидіння й спинка, кожен — точка в реєстрі: персонаж, що
// сидить, між ними; засунутий під стіл — під коробкою стола (сидіння) і на ній (спинка), як частина стола.

import type Phaser from "phaser";

import { DUST_SPOTS, dustOf } from "../../sim/dust";
import { isPresent, objectById, OBJECTS, ROOMS, TOILET_ROLL, TRINKETS, WIRE_TILE, type HomeObject } from "../../sim/home";
import type { GameEvent } from "../../sim/events";
import type { Target } from "../../sim/targets";
import type { GameState, Vec } from "../../sim/types";
import { addArt, isArtStub, setArt } from "../art/atlas";
import { WALL_HEIGHT, WALL_SEGMENTS, type WallSegment } from "../art/manifest/lib/geometry";
import type { ArtId } from "../art/types";
import { BOILER, CANDLE_SHELVES, DESK_LAMP, PANES, POWER_STATION, POWER_STATION_BOX, POWER_STATION_ID, SCONCES } from "../decor";
import type { PartContext } from "../world/context";
import { isoObjectLook, type IsoFootprint, type IsoObjectLook } from "../world/objects";
import type { ApartmentPart, Point, WorldFrame } from "../world/part";
import { ISO } from "../world/projection";
import { decorLook, decorLookInit, type DecorLook } from "./decorlook";
import { ISO_BACKDROP_DEPTH, isoDepth, type IsoBoxHandle, type IsoDepth, type IsoPointHandle } from "./depth";
import { IsoFxView } from "./fx";
import { anchorLift, artOffset, BOXES_FRONT, DOOR_BOXES, objectAnchorAt, objectScreen, wallsToFade } from "./geometry";
import { PERSON_DEPTH } from "./personlook";
import { SEAT_GLIDE_RATE, SEATS, seatAt, seatMode, seatSpot, type Seat, type SeatSpot } from "./personseat";
import { glideOffset } from "./personspot";
import { IsoHighlight } from "./highlight";
import {
  bedState,
  boxesState,
  cabinetLook,
  cobwebLook,
  computerState,
  dishFrame,
  doorState,
  fridgeLook,
  KIT_EXTRAS,
  kitLook,
  opensDoor,
  shapedState,
  showerState,
  sinkState,
  stoveArtState,
  washerArtState,
  STORAGE_OVERLAYS,
  storageOverlays,
  TRACE_OVERLAYS,
  traceFrame,
  trashState,
  trinketFrame,
  wireState,
  type IsoFrame,
  type TraceHost,
  type TraceOverlay,
} from "./looks";

/**
 * Порядок шарів тла: підлога, котячі сліди на підлогах (над усіма плитами підлог), смуги сонця з вікон (§8.9, `iso/light.ts`:
 * на підлозі, під стінами й усім, що стоїть), задні стіни, подерті шпалери на стіні вітальні, вікна на стінах, павутина в
 * кутах (§8.7: висить на задній стіні — над нею, під усім, що стоїть у кімнаті), папір, бра, полички зі свічками й бойлер на
 * стінах (`decal`) і їхнє сяйво (`glow`).
 */
export const BACKDROP = {
  floor: ISO_BACKDROP_DEPTH,
  floorTrace: ISO_BACKDROP_DEPTH + 0.5,
  sun: ISO_BACKDROP_DEPTH + 0.75,
  wall: ISO_BACKDROP_DEPTH + 1,
  wallTrace: ISO_BACKDROP_DEPTH + 1.5,
  window: ISO_BACKDROP_DEPTH + 2,
  cobweb: ISO_BACKDROP_DEPTH + 2.5,
  decal: ISO_BACKDROP_DEPTH + 3,
  glow: ISO_BACKDROP_DEPTH + 3.1,
} as const;

/**
 * Глибина того, що лежить на речі, — над нею, у її проміжку (`ISO_DEPTH_SLOT` 0,01) і нижче за його половину: кіт, що
 * виліз на річ, — уже над усім цим (`IsoPointHandle.place(x, y, id)`). Котячий слід (`trace`) — одразу над річчю: під
 * накладками наповнення, замком і контуром підсвітки без WebGL (`OUTLINE_ABOVE` у `highlight.ts`), бо він — частина речі.
 */
const ON = { trace: 0.0002, overlay: 0.001, step: 0.0001, mom: 0.0015, dish: 0.002, lamp: 0.0022, trinket: 0.0025, lock: 0.003 } as const;

/** Дріт комп'ютера (`env/wire`): кадр і точка реєстру — у центрі клітинки `WIRE_TILE`. */
const WIRE_AT: Vec = { x: WIRE_TILE.x + 0.5, y: WIRE_TILE.y + 0.5 };

/** Коробка зарядної станції в реєстрі глибини: слід її корпусу (`POWER_STATION_BOX`). */
const STATION_BOX = { ...POWER_STATION_BOX, id: POWER_STATION_ID };

/** Півширина стільця на екрані, одиниці арту (`IsoPointOptions.half`): з ким його малюнок може перекритися. */
const CHAIR_HALF = 44;

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

/**
 * Стілець (`SEATS`): сидіння й спинка — шматки одного кадру на різних глибинах, де він зараз (центр, клітинки) і куди їде
 * (засувають, висувають, відкочують).
 */
interface Chair {
  seat: Seat;
  pieces: Record<"seat" | "backrest", { image: Phaser.GameObjects.Image; point: IsoPointHandle }>;
  center: Vec;
  target: Vec;
  /** Центр, у якому кадр поставлено, і чи на ньому сиділи (щоб не переставляти нерухомий стілець щокадру). */
  placed: Vec;
  sitting: boolean;
}

/** Сегмент внутрішньої стіни чи переднього плінтуса. */
interface Wall {
  segment: WallSegment;
  image: Phaser.GameObjects.Image;
  box: IsoBoxHandle;
  footprint: IsoFootprint;
  alpha: number;
  /** Котячі сліди на сегменті (подертий одвірок): згасають разом із ним. */
  marks: readonly TraceMark[];
}

/**
 * Накладка котячого сліду не на речі квартири (§9.12): на плиті підлоги чи стіни кімнати, сегменті стіни, прочиненому
 * полотні дверей чи передніх стінках ящиків. Зображення одне на весь час (сховане, поки сліду немає); глибину йому ставить
 * господар — у своєму проміжку, на `piece.offset` вище (`marksAt`).
 */
interface TraceMark {
  overlay: TraceOverlay;
  piece: Piece;
}

/** Накладка сліду на речі квартири (як решта того, що на речі, — `put`) і її зсув глибини над річчю. */
interface ObjectMark {
  overlay: TraceOverlay;
  object: string;
  offset: number;
}

/**
 * Відчинені вхідні двері (`DOOR_BOXES`): поріг із лівим стояком — тим самим зображенням речі `door`, але вужчою коробкою;
 * прочинене полотно й правий стояк — своїми зображеннями й коробками. Зачинені — звичайна річ зі своєю коробкою.
 */
interface OpenDoor {
  /** Річ `door`: її зображення — і зачинені двері, і поріг відчинених. */
  owner: Thing;
  body: IsoBoxHandle;
  leaf: Phaser.GameObjects.Image;
  leafBox: IsoBoxHandle;
  post: Phaser.GameObjects.Image;
  postBox: IsoBoxHandle;
  /** Чи двері зараз відчинені (що показано). */
  open: boolean;
  /** Коли двері відчинили востаннє (мс сцени; −∞ — ще не відчиняли). */
  openedAt: number;
}

export class IsoApartmentView implements ApartmentPart {
  private readonly depth: IsoDepth;
  private readonly things = new Map<string, Thing>();
  private readonly walls: Wall[] = [];
  /** Внутрішні стіни (лише вони згасають), їхні сліди для `wallsToFade` і що з них зараз щось закриває. */
  private readonly inner: Wall[] = [];
  private readonly innerBoxes: IsoFootprint[] = [];
  private readonly covered: boolean[] = [];
  private readonly backdrop: Phaser.GameObjects.Image[] = [];
  /** Павутина за місцем `DUST_SPOTS` (§8.7): зображення з першою появою, далі лише ховається й показується. */
  private readonly cobwebs = new Map<number, Phaser.GameObjects.Image>();
  private readonly toiletRoll: Piece;
  /** Бра й бойлер на задніх стінах (тло, як рулон паперу): стан — за світлом доби й електрикою (`decorLook`). */
  private readonly sconces: Piece[] = [];
  private readonly boiler: Piece;
  /** Полички зі свічками дня відключення на задніх стінах (`CANDLE_SHELVES`, тло, як бра): є лише без електрики. */
  private readonly shelves: Piece[] = [];
  /** Зарядна станція дня відключення: на підлозі під розеткою праворуч від стола з комп'ютером, коробка реєстру. */
  private readonly station: { image: Phaser.GameObjects.Image; box: IsoBoxHandle; shown: boolean };
  /** Настільна лампа на столі з комп'ютером (`DESK_LAMP`): зсув від pivot стола — центр основи на стільниці. */
  private readonly deskLamp: Point = (() => {
    const at = ISO.toScreen(DESK_LAMP.at);
    const host = objectScreen(objectById(DESK_LAMP.host));
    return { x: at.x - host.x, y: at.y - DESK_LAMP.z - host.y };
  })();
  private readonly decor: DecorLook = decorLookInit();
  private readonly wire: Piece;
  private readonly wirePoint: IsoPointHandle;
  private readonly glow: IsoHighlight;
  /** Ефекти над речами й котами (пара, дим, іскри, хропіння, задишка, чхання): квартира оновлюється після котів. */
  private readonly fx: IsoFxView;
  private readonly door: OpenDoor;
  /** Передні стінки верхньої коробки купи ящиків: точка на коробці `boxes`, після кота в ній. */
  private readonly boxesFront: { piece: Piece; point: IsoPointHandle };
  private readonly chairs: Chair[] = [];
  /** Накладки котячих слідів поза речами (`TraceMark`) і на речах (`ObjectMark`). */
  private readonly marks: TraceMark[] = [];
  private readonly objectMarks: readonly ObjectMark[] = objectMarkList();
  /** Куди стає шматок стільця в реєстрі глибини (`seatSpot`): один на всі, щоб не виділяти щокадру. */
  private readonly seatSpot: SeatSpot = { x: 0, y: 0, box: null, under: false, above: false };
  /** Час минулого кадру, мс: від нього — швидкість згасання стін. */
  private lastTime: number | null = null;

  constructor(private readonly ctx: PartContext) {
    const { scene, layer } = ctx;
    this.depth = isoDepth(ctx);
    this.glow = new IsoHighlight(scene, layer, ctx.world);
    this.fx = new IsoFxView(ctx);

    // Плити кімнат: підлога й задні стіни кожної — в одну точку, верхню вершину ромба першої клітинки кімнати. Котячі сліди
    // на них — у ту саму точку: на підлогах — над усіма плитами підлог і під стінами, на стіні — над нею й під вікнами.
    for (const room of ROOMS) {
      const at = ISO.toScreen({ x: room.x, y: room.y });
      this.backdrop.push(this.art(`env/room/${room.id}/floor`, at, BACKDROP.floor));
      this.backdrop.push(this.art(`env/room/${room.id}/wall`, at, BACKDROP.wall));
      this.marksOn((host) => host.kind === "floor" && host.room === room.id, at, BACKDROP.floorTrace);
      this.marksOn((host) => host.kind === "wall" && host.room === room.id, at, BACKDROP.wallTrace);
    }
    // Вікна — накладки на задню стіну в клітинці стіни (`PANES`: над підвіконнями й кухонне без підвіконня, §8.9).
    for (const pane of PANES) this.backdrop.push(this.art(`env/window/${pane.room}`, ISO.toScreen(pane.wall), BACKDROP.window));
    // Рулон паперу на задній стіні ванної, бра й бойлер: їх закриває все, що стоїть перед стіною.
    this.toiletRoll = { image: this.art("env/toilet-roll", ISO.toScreen(TOILET_ROLL), BACKDROP.decal), key: "", offset: 0 };
    this.backdrop.push(this.toiletRoll.image);
    for (const sconce of SCONCES) {
      const piece = { image: this.art(sconce.id, ISO.toScreen(sconce.at), BACKDROP.decal), key: "", offset: 0 };
      this.sconces.push(piece);
      this.backdrop.push(piece.image);
    }
    this.boiler = { image: this.art("env/boiler", ISO.toScreen(BOILER.at), BACKDROP.decal), key: "", offset: 0 };
    this.backdrop.push(this.boiler.image);
    // Полички зі свічками: pivot — лице стіни під серединою дошки на висоті верху дошки; поки є електрика, їх немає.
    for (const shelf of CANDLE_SHELVES) {
      const floor = ISO.toScreen(shelf.at);
      const piece = { image: this.art(shelf.id, { x: floor.x, y: floor.y - shelf.z }, BACKDROP.decal).setVisible(false), key: "", offset: 0 };
      this.shelves.push(piece);
      this.backdrop.push(piece.image);
    }
    // Зарядна станція стоїть на підлозі перед стіною ряду 5 під розеткою, праворуч від стола: коробка свого сліду в реєстрі
    // (стіна за нею, стіл ліворуч; коти й персонаж перед нею чи праворуч — перед нею), є лише в день відключення.
    const station = this.art("env/power-station", ISO.toScreen(POWER_STATION.at), 0).setVisible(false);
    const stationBox = this.depth.addBox(STATION_BOX, (d) => station.setDepth(d));
    stationBox.setActive(false);
    this.station = { image: station, box: stationBox, shown: false };

    // Внутрішні стіни й передні плінтуси — коробки: вони закривають тих, хто за ними. Слід на сегменті — тією самою коробкою.
    for (const segment of WALL_SEGMENTS) {
      const { rect } = segment;
      const at = ISO.toScreen(rect);
      const image = this.art(segment.id, at, 0);
      const marks = this.marksOn((host) => host.kind === "segment" && host.segment === segment.id, at);
      const footprint = { x0: rect.x, y0: rect.y, x1: rect.x + rect.w, y1: rect.y + rect.h };
      const box = this.depth.addBox(footprint, (d) => {
        image.setDepth(d);
        marksAt(marks, d);
      });
      const wall = { segment, image, box, footprint, alpha: 1, marks };
      this.walls.push(wall);
      if (segment.kind === "inner") {
        this.inner.push(wall);
        this.innerBoxes.push(footprint);
      }
    }

    // Дріт комп'ютера: по підлозі від стола до розетки на стіні ряду 5 — пласка річ перед стіною й столом; у день відключення
    // — до зарядної станції під розеткою і під нею (`drawDecor`).
    const wire = this.art("env/wire", ISO.toScreen(WIRE_AT), 0);
    this.wire = { image: wire, key: "", offset: 0 };
    this.wirePoint = this.depth.addPoint((d) => wire.setDepth(d), { flat: true });
    this.wirePoint.place(WIRE_AT.x, WIRE_AT.y);

    for (const object of OBJECTS) this.things.set(object.id, this.thing(object));
    this.door = this.openDoor(this.get("door"));
    const boxes = this.get("boxes");
    const front = this.art("env/boxes/front", boxes.at, 0).setVisible(false);
    // Сліди на передніх стінках — тією самою точкою, одразу над ними.
    const frontMarks = this.marksOn((host) => host.kind === "boxes-front", boxes.at);
    const frontPoint = this.depth.addPoint(
      (d) => {
        front.setDepth(d);
        marksAt(frontMarks, d);
      },
      { half: BOXES_FRONT.half },
    );
    this.boxesFront = { piece: { image: front, key: "", offset: 0 }, point: frontPoint };
    for (const seat of SEATS) this.chairs.push(this.chair(seat));
  }

  /** Стілець: два шматки кадру (сидіння, спинка), кожен — точка реєстру глибини; спершу — засунутий до стола. */
  private chair(seat: Seat): Chair {
    const piece = (state: "seat" | "backrest"): Chair["pieces"]["seat"] => {
      const image = addArt(this.ctx.scene, this.ctx.layer, seat.art, { state });
      return { image, point: this.depth.addPoint((d) => image.setDepth(d), { half: CHAIR_HALF }) };
    };
    const center = seatAt(seat, "tucked");
    return { seat, pieces: { seat: piece("seat"), backrest: piece("backrest") }, center, target: { ...center }, placed: { x: Number.NaN, y: Number.NaN }, sitting: false };
  }

  /**
   * Накладки котячих слідів (`TRACE_OVERLAYS`) на господарі, якого вибирає `match`, у точці `at`: сховані, доки сліду немає
   * (`drawTraces`). Глибина — `depth` (плити кімнат); господар із реєстру глибини ставить її сам (`marksAt`).
   */
  private marksOn(match: (host: TraceHost) => boolean, at: Point, depth = 0): TraceMark[] {
    const marks = TRACE_OVERLAYS.filter((overlay) => match(overlay.host)).map((overlay, i) => ({
      overlay,
      piece: { image: this.art(overlay.id, at, depth).setVisible(false), key: "", offset: ON.trace + i * ON.step },
    }));
    this.marks.push(...marks);
    return marks;
  }

  /** Шматки відчинених дверей (`OpenDoor`): поки двері зачинені, їхніх коробок у порядку немає. */
  private openDoor(door: Thing): OpenDoor {
    const leaf = this.art("env/door/leaf", door.at, 0).setVisible(false);
    const post = this.art("env/door/post", door.at, 0).setVisible(false);
    // Подряпини на внутрішньому боці полотна — тією самою коробкою, одразу над ним.
    const leafMarks = this.marksOn((host) => host.kind === "door-leaf", door.at);
    const view: OpenDoor = {
      owner: door,
      body: this.depth.addBox(DOOR_BOXES.body, (d) => {
        door.depth = d;
        door.body.image.setDepth(d);
      }),
      leaf,
      leafBox: this.depth.addBox(DOOR_BOXES.leaf, (d) => {
        leaf.setDepth(d);
        marksAt(leafMarks, d);
      }),
      post,
      postBox: this.depth.addBox(DOOR_BOXES.post, (d) => post.setDepth(d)),
      open: false,
      openedAt: Number.NEGATIVE_INFINITY,
    };
    for (const box of [view.body, view.leafBox, view.postBox]) box.setActive(false);
    return view;
  }

  /** Вхідні двері відчинені чи зачинені (`doorState`): кадр, коробки й шматки відчинених. */
  private drawDoor(state: GameState, time: number): void {
    const door = this.get("door");
    const open = doorState(state, time - this.door.openedAt) === "open";
    this.show(door, { id: "env/door", state: open ? "open" : "closed" });
    if (open === this.door.open) return;
    this.door.open = open;
    door.box.setActive(!open);
    for (const box of [this.door.body, this.door.leafBox, this.door.postBox]) box.setActive(open);
    this.door.leaf.setVisible(open);
    this.door.post.setVisible(open);
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
   * Показати щось на речі (накладку, страву, дрібничку, свічку, замок) під назвою `name`: кадр `frame` (null — сховати), у
   * точці кріплення `point` запису речі чи на зсуві `point` від її pivot (без нього — у pivot речі, як накладки того самого
   * полотна).
   */
  private put(thing: Thing, name: string, frame: IsoFrame | null, offset: number, point?: string | Point): void {
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
    const shift = typeof point === "string" ? (artOffset(`env/${thing.object.id}`, point) ?? { x: 0, y: 0 }) : (point ?? { x: 0, y: 0 });
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
      // Коробку дверей вмикає й вимикає `drawDoor`: у відчинених вона інша.
      if (thing !== this.door.owner) thing.box.setActive(present);
      if (!present) for (const piece of thing.extras.values()) piece.image.setVisible(false);
    }
    this.drawDoor(state, frame.time);
    this.drawStates(state);
    this.drawTraces(state);
    const decor = decorLook(state, frame.lightMinute, this.decor);
    this.drawSurfaces(state, decor);
    this.drawDecor(decor);
    this.drawCobwebs(state);
    // Розмотаний рулон (§9.12, «Мисливський інстинкт») і перегризений дріт (§9.12, «Гризіння»; у день відключення — у гнізді
    // зарядної станції, §4.1).
    setPiece(this.toiletRoll, { id: "env/toilet-roll", state: state.home.rollDown === true ? "unrolled" : "full" });
    setPiece(this.wire, { id: "env/wire", state: wireState(state) });
    const dt = this.lastTime === null ? 1 : Math.min(0.25, Math.max(0, (frame.time - this.lastTime) / 1000));
    this.moveChairs(state, dt);
    this.fadeWalls(state, frame.time);
    this.fx.update(state, frame.time);
  }

  onEvent(event: GameEvent, time: number): void {
    if (opensDoor(event)) this.door.openedAt = time;
    this.fx.onEvent(event, time);
  }

  /**
   * Стільці: засунуті до стола чи висунуті під того, хто сідає (`seatMode`), — їдуть туди плавно, удвічі швидше, ніж персонаж
   * переходить до місця справи (`SEAT_GLIDE_RATE`, `glideOffset`): стілець уже під ним, коли таз опускається. Спинка висунутого
   * стільця, на якому сидять, — над тим, хто сидить (`SeatSpot.above`).
   */
  private moveChairs(state: GameState, seconds: number): void {
    for (const chair of this.chairs) {
      const mode = seatMode(state, chair.seat);
      seatAt(chair.seat, mode, chair.target);
      glideOffset(chair.center, chair.target, seconds, chair.center, SEAT_GLIDE_RATE);
      const sitting = mode === "pulled";
      if (chair.center.x === chair.placed.x && chair.center.y === chair.placed.y && chair.sitting === sitting) continue;
      chair.placed.x = chair.center.x;
      chair.placed.y = chair.center.y;
      chair.sitting = sitting;
      const at = ISO.toScreen(chair.center);
      for (const part of ["seat", "backrest"] as const) {
        const piece = chair.pieces[part];
        piece.image.setPosition(at.x, at.y);
        const spot = seatSpot(chair.seat, chair.center, part, this.seatSpot, sitting);
        if (spot.above) piece.point.placeAbove("person", PERSON_DEPTH.backrest);
        else if (spot.box === null) piece.point.place(spot.x, spot.y);
        else if (spot.under) piece.point.placeUnder(spot.x, spot.y, spot.box);
        else piece.point.place(spot.x, spot.y, spot.box);
      }
    }
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

    this.show(this.get("stove"), { id: "env/stove", state: stoveArtState(state) });
    this.show(this.get("trash"), { id: "env/trash", state: trashState(state) });
    this.show(this.get("computer"), { id: "env/computer", state: computerState(state) });
    this.show(this.get("bed"), { id: "env/bed", state: bedState(state) });
    // Шафи з пилососом більше немає (§8.7, рішення автора 2026-11-02): пилосос стоїть на підлозі (`home.vacuumAt`) — його
    // малюватиме пакет вигляду.
    this.show(this.get("washer"), { id: "env/washer", state: washerArtState(state) });
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

    // Купа ящиків біля входу: 1–4 коробки; без покупок її немає (річ невидима — `isPresent`). Передні стінки верхньої
    // відкритої коробки — окремим кадром поверх кота, що в ній лежить (`BOXES_FRONT`).
    const pile = boxesState(state);
    if (pile) this.show(this.get("boxes"), { id: "env/boxes", state: pile });
    const front = this.boxesFront;
    if (pile) {
      setPiece(front.piece, { id: "env/boxes/front", state: pile });
      front.piece.image.setVisible(true);
      front.point.place(BOXES_FRONT.x, BOXES_FRONT.y, "boxes");
    } else {
      front.piece.image.setVisible(false);
      front.point.hide();
    }
  }

  /**
   * Котячі сліди (§9.12, «Котячі сліди в квартирі»; `traceFrame`): накладка є, поки є слід і видно господаря, — у стані
   * господаря (шафка відчинена чи зачинена, скільки коробок у купі); подряпини на дверях — лише разом із прочиненим
   * полотном. Слід з'явився посеред дня — накладка є з цього ж кадру. Зображень щокадру не створюємо: накладки поза речами
   * створено разом із квартирою, а на речах — з першою появою (`put`).
   */
  private drawTraces(state: GameState): void {
    for (const mark of this.objectMarks) this.put(this.get(mark.object), mark.overlay.id, traceFrame(state, mark.overlay), mark.offset);
    for (const mark of this.marks) {
      const look = traceFrame(state, mark.overlay);
      if (look) setPiece(mark.piece, look);
      // Накладки, якої ще не намальовано, не видно: маджентова заглушка на все полотно господаря закрила б його.
      const shown = look !== null && (mark.overlay.host.kind !== "door-leaf" || this.door.open) && !isArtStub(mark.piece.image);
      mark.piece.image.setVisible(shown);
    }
  }

  /**
   * Страви на поверхнях (плита показує свою сковороду сама), дрібнички на своїх місцях (§8.7, §9.12) і настільна лампа на столі
   * з комп'ютером (§8.9, `DESK_LAMP`) — під дрібничками, у проміжку стола: кіт, що виліз на стіл, — над лампою, а ручка, що
   * лежить перед нею, — теж.
   */
  private drawSurfaces(state: GameState, decor: DecorLook): void {
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
    this.put(this.get(DESK_LAMP.host), "desk-lamp", { id: "env/desk-lamp", state: decor.deskLamp }, ON.lamp, this.deskLamp);
  }

  /**
   * Декор на стінах і підлозі (§8.9, §4.1; `decorLook`): бра горять із лампами, індикатор бойлера — коли є електрика, полички
   * зі свічками на стінах і зарядна станція біля стола з комп'ютером є лише в день відключення.
   */
  private drawDecor(decor: DecorLook): void {
    SCONCES.forEach((sconce, i) => setPiece(this.sconces[i]!, { id: sconce.id, state: decor.sconce }));
    setPiece(this.boiler, { id: "env/boiler", state: decor.boiler });
    CANDLE_SHELVES.forEach((shelf, i) => {
      const piece = this.shelves[i]!;
      if (decor.candles) setPiece(piece, { id: shelf.id, state: decor.candles });
      piece.image.setVisible(decor.candles !== null);
    });
    const station = this.station;
    if (decor.station === station.shown) return;
    station.shown = decor.station;
    station.image.setVisible(decor.station);
    station.box.setActive(decor.station);
    // Дріт, що йде в гніздо станції (`wireState`), — одразу під нею, а відносно решти — як вона: шнур її вилки лягає поверх
    // кінця дроту (стик — `art/env/power-station.svg`), а хто стоїть перед станцією, той і перед дротом. Без станції — пласка
    // річ на підлозі, як завжди.
    if (decor.station) this.wirePoint.placeUnder(WIRE_AT.x, WIRE_AT.y, POWER_STATION_ID);
    else this.wirePoint.place(WIRE_AT.x, WIRE_AT.y);
  }

  /**
   * Павутина в кутах кімнат (§8.7, «Пил і павутина»): висить на задній стіні над місцем `DUST_SPOTS` (точка підлоги в куті) —
   * на тлі над стіною й вікнами, під усім, що стоїть у кімнаті (душова кабіна й холодильник закривають її низ), у стані й
   * напрямку за кутом (`cobwebLook`). Прибрали — ховається.
   */
  private drawCobwebs(state: GameState): void {
    const shown = new Set(dustOf(state));
    DUST_SPOTS.forEach((spot, index) => {
      if (spot.kind !== "cobweb") return;
      const look = shown.has(index) ? cobwebLook(spot) : null;
      let image = this.cobwebs.get(index);
      if (!look) {
        image?.setVisible(false);
        return;
      }
      if (!image) {
        image = this.art(look.frame.id, ISO.toScreen(spot), BACKDROP.cobweb);
        this.cobwebs.set(index, image);
        this.backdrop.push(image);
      }
      setArt(image, look.frame.id, { state: look.frame.state });
      // Віддзеркалення — знаком масштабу довкола pivot (кута на підлозі); `setArt` масштаб відносно базового зберігає.
      if (image.scaleX < 0 !== look.flip) image.setScale(-image.scaleX, image.scaleY);
      image.setVisible(true);
    });
  }

  /**
   * Внутрішня стіна, що закриває персонажа, кота, лоток чи безлад, напівпрозоро згасає (`GRAPHICS_PLAN.md`, «Контракти»;
   * хвиля 3 — `wallsToFade`): воно за нею й близько, на тій самій горизонталі екрана. Плінтуси низькі — не згасають.
   */
  private fadeWalls(state: GameState, time: number): void {
    const dt = this.lastTime === null ? 1 : Math.min(0.25, Math.max(0, (time - this.lastTime) / 1000));
    this.lastTime = time;
    wallsToFade(state, this.innerBoxes, WALL_HEIGHT.inner, this.covered);
    for (let i = 0; i < this.inner.length; i++) {
      const wall = this.inner[i]!;
      const target = this.covered[i] === true ? FADED_ALPHA : 1;
      wall.alpha += (target - wall.alpha) * Math.min(1, dt * FADE_RATE);
      if (Math.abs(wall.alpha - target) < 0.01) wall.alpha = target;
      wall.image.setAlpha(wall.alpha);
      // Слід на стіні — окреме зображення поверх неї, а групової прозорості немає: з тією самою альфою кут зі слідом згасав би до
      // 1 − (1 − 0,4)² = 0,64 замість 0,4 стіни й лишався щільною плямою (рецензія 2026-11-02). Квадрат альфи — наближення: пляма
      // ≈ 0,5, ближче до стіни, а незгасла стіна (1) — без змін.
      for (const mark of wall.marks) mark.piece.image.setAlpha(wall.alpha * wall.alpha);
    }
  }

  lateUpdate(): void {
    this.glow.apply();
    this.depth.solve();
  }

  reset(): void {
    this.lastTime = null;
    this.door.openedAt = Number.NEGATIVE_INFINITY;
    this.fx.reset();
    // День показують заново: стільці — одразу на своїх місцях, без переїзду.
    for (const chair of this.chairs) {
      seatAt(chair.seat, "tucked", chair.center);
      chair.placed.x = Number.NaN;
    }
  }

  destroy(): void {
    this.glow.destroy();
    this.fx.destroy();
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
    this.inner.length = 0;
    this.innerBoxes.length = 0;
    for (const box of [this.door.body, this.door.leafBox, this.door.postBox]) box.remove();
    this.door.leaf.destroy();
    this.door.post.destroy();
    this.boxesFront.point.remove();
    this.boxesFront.piece.image.destroy();
    for (const mark of this.marks) mark.piece.image.destroy();
    this.marks.length = 0;
    this.wirePoint.remove();
    this.wire.image.destroy();
    this.station.box.remove();
    this.station.image.destroy();
    for (const chair of this.chairs) {
      for (const piece of Object.values(chair.pieces)) {
        piece.point.remove();
        piece.image.destroy();
      }
    }
    this.chairs.length = 0;
    for (const image of this.backdrop) image.destroy();
    this.backdrop.length = 0;
    this.cobwebs.clear();
  }

  /**
   * Над річчю квартири, поки вона є (сховища з'являються після першого запасу, §6.4); над плитою з газовим пальником — над
   * піднятою сковородою (`anchorLift`).
   */
  anchor(id: string): Point | null {
    const thing = this.things.get(id);
    if (!thing) return null;
    const state = this.ctx.state();
    return isPresent(state, thing.object) ? objectAnchorAt(thing.object, anchorLift(state, id)) : null;
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

/** Накладки слідів на речах квартири: кожна — одразу над річчю, кілька на одній речі — по черзі (`ON.step`). */
function objectMarkList(): ObjectMark[] {
  const count = new Map<string, number>();
  const marks: ObjectMark[] = [];
  for (const overlay of TRACE_OVERLAYS) {
    if (overlay.host.kind !== "object") continue;
    const object = overlay.host.object;
    const i = count.get(object) ?? 0;
    count.set(object, i + 1);
    marks.push({ overlay, object, offset: ON.trace + i * ON.step });
  }
  return marks;
}

/** Глибина накладок слідів на господарі з глибиною `depth`: кожна — на свій зсув вище (`TraceMark`). */
function marksAt(marks: readonly TraceMark[], depth: number): void {
  for (const mark of marks) mark.piece.image.setDepth(depth + mark.piece.offset);
}

/** Показати кадр на частині речі, якщо він інший, ніж зараз. */
function setPiece(piece: Piece, frame: IsoFrame): void {
  const key = `${frame.id}|${frame.state ?? ""}`;
  if (piece.key === key) return;
  piece.key = key;
  setArt(piece.image, frame.id, { state: frame.state });
}
