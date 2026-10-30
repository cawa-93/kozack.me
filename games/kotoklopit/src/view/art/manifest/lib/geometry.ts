// Геометрія записів маніфесту (крок 16, F5, GRAPHICS_PLAN.md: «Контракти» → «Проєкція і глибина», «Арт, маніфест і
// атласи»): ізометрична плитка, полотна меблів і речей, плити кімнат, сегменти стін, спільні шари й ракурси частин.
// Без Phaser і DOM. Файл лежить у підкаталозі `lib/`, тож `import.meta.glob("./manifest/*.ts")` маніфесту його не
// підхоплює як модуль категорії; ним користуються всі файли категорій і `tests/manifest.test.ts`.
//
// Одиниця арту = 1 px світу ізометричної проєкції. Плитка — ромб TW 128 × TH 64; точка підлоги (x, y) у клітинках лягає
// в `iso(x, y)` = ((x − y)·64, (x + y)·32) від верхньої вершини ромба клітинки (0, 0); висота над підлогою віднімається
// від y. Тож розміри тут не вигадані, а виведені з мапи (`MAP`, `ROOMS`, `OBJECTS` у `src/sim/home.ts`): зміниться мапа —
// зміняться й полотна, а `tests/art.test.ts` покаже, які SVG перемалювати.

import { MAP, MAP_HEIGHT, MAP_WIDTH, OBJECTS, roomAt, type Rect, type RoomId } from "../../../../sim/home";
import type { Vec } from "../../../../sim/types";
import type { ArtId, ArtLayer, ArtPoint, ArtSize, ArtView } from "../../types";

// --- Плитка й висоти -------------------------------------------------------------------------

/** Ромб плитки підлоги, одиниці арту (контракт хвилі 0: TW 128 × TH 64). */
export const TW = 128;
export const TH = 64;

/** Запас полотна з кожного боку під чорнильний контур (≈ 6) і свідомо нерівні краї, одиниці арту. */
export const PAD = 8;

/**
 * Висоти стін (контракт хвилі 1): задні (ряд y = 0 і стовпець x = 0) — на повну висоту, внутрішні — ≈ ⅓ з верхньою
 * кришкою, передні (ряд y = 11 і стовпець x = 19) — лише плінтус.
 */
export const WALL_HEIGHT = { back: 200, inner: 66, front: 14 } as const;

/** Точка підлоги в клітинках → одиниці арту від верхньої вершини ромба клітинки (0, 0); `z` — висота над підлогою. */
export function iso(p: Vec, z = 0): ArtPoint {
  return { x: ((p.x - p.y) * TW) / 2, y: ((p.x + p.y) * TH) / 2 - z };
}

/** Округлення до 0,5 одиниці: точки в маніфесті читає людина, а дрібніше за пів одиниці ніхто не намалює. */
const half = (v: number): number => Math.round(v * 2) / 2;

/** Розмір і pivot запису. */
export interface Geometry {
  size: ArtSize;
  pivot: ArtPoint;
}

// --- Речі на підлозі ---------------------------------------------------------------------------

/** Запас полотна понад слід речі: для того, що виступає (відчинені дверцята, монітор, перекинутий смітник). */
export interface Pad {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

/** Меблі: слід `w × h` клітинок, висота верхньої поверхні `top`, найвища точка `tall` (за замовчуванням — `top`). */
export interface BoxSpec {
  top: number;
  tall?: number;
  pad?: Pad;
}

/**
 * Полотно речі на сліді `w × h` клітинок (контракт: pivot меблів — точка підлоги під центром сліду, `toScreen(x + w/2,
 * y + h/2)`). Полотно вміщує ромб сліду, річ заввишки `tall` над ним і запаси `PAD` (плюс `pad`, де щось виступає).
 */
export function box(footprint: { w: number; h: number }, spec: BoxSpec): Geometry {
  const span = footprint.w + footprint.h;
  const tall = spec.tall ?? spec.top;
  const left = PAD + (spec.pad?.left ?? 0);
  const right = PAD + (spec.pad?.right ?? 0);
  const top = PAD + (spec.pad?.top ?? 0);
  const bottom = PAD + (spec.pad?.bottom ?? 0);
  return {
    size: { w: (span * TW) / 2 + left + right, h: tall + (span * TH) / 2 + top + bottom },
    pivot: { x: left + (span * TW) / 4, y: top + tall + (span * TH) / 4 },
  };
}

/**
 * Точки на речі з полотном `geometry` (від `box`): `at(fx, fy, z)` — `fx`, `fy` — частки сліду вздовж x і y (0,5 / 0,5 —
 * центр), `z` — висота над підлогою; одиниці арту від лівого верхнього кута полотна.
 */
export function pointsOn(footprint: { w: number; h: number }, geometry: Geometry): (fx: number, fy: number, z: number) => ArtPoint {
  return (fx, fy, z) => {
    const p = iso({ x: (fx - 0.5) * footprint.w, y: (fy - 0.5) * footprint.h }, z);
    return { x: half(geometry.pivot.x + p.x), y: half(geometry.pivot.y + p.y) };
  };
}

/** Меблі: полотно (`box`) і точки на них (`pointsOn`). */
export interface Furniture {
  geometry: Geometry;
  at: (fx: number, fy: number, z: number) => ArtPoint;
}

export function furniture(footprint: { w: number; h: number }, spec: BoxSpec): Furniture {
  const geometry = box(footprint, spec);
  return { geometry, at: pointsOn(footprint, geometry) };
}

/** Частки сліду речі для `pointsOn` за точкою підлоги в клітинках (`WINDOWS[].seat`). */
export function fractionIn(rect: Rect, p: Vec): { fx: number; fy: number } {
  return { fx: (p.x - rect.x) / rect.w, fy: (p.y - rect.y) / rect.h };
}

/**
 * Невелика річ на підлозі (миска, лоток, бруд): полотно `w × h` одиниць, pivot — точка підлоги під центром сліду, на
 * `below` одиниць вище за низ полотна (половина висоти еліпса сліду й запас під контур).
 */
export function floorItem(w: number, h: number, below: number): Geometry {
  return { size: { w, h }, pivot: { x: w / 2, y: h - below } };
}

/** Полотно з pivot посередині (іконки, гліфи, ефекти без опори). */
export function centered(w: number, h = w): Geometry {
  return { size: { w, h }, pivot: { x: w / 2, y: h / 2 } };
}

/**
 * Полотно іконки (`icon/*`, позначки): 64 × 64 з pivot у центрі, вміст — у полі 4…60 (`art/STYLE.md`, еталони F1a
 * `icon/kibble`, `icon/heart`). Розмір на екрані задає код (бульбашка, HUD), а не полотно.
 */
export const ICON: Geometry = centered(64);

/**
 * Записи, намальовані з іншим полем, ніж дає `PAD` (еталони F1): та сама річ — те саме полотно й pivot, що в SVG, а точки
 * на ній — від цього полотна (`pointsOn`).
 */
export function drawn(footprint: { w: number; h: number }, geometry: Geometry): Furniture {
  return { geometry, at: pointsOn(footprint, geometry) };
}

// --- Плити кімнат і стіни ----------------------------------------------------------------------

/** Межі набору клітинок заввишки `height` на екрані, одиниці арту від верхньої вершини клітинки (0, 0). */
function cellBounds(cells: readonly Vec[], height: number): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of cells) {
    x0 = Math.min(x0, iso({ x: c.x, y: c.y + 1 }).x);
    x1 = Math.max(x1, iso({ x: c.x + 1, y: c.y }).x);
    y0 = Math.min(y0, iso(c).y - height);
    y1 = Math.max(y1, iso({ x: c.x + 1, y: c.y + 1 }).y);
  }
  return { x0, y0, x1, y1 };
}

/**
 * Плита з клітинок (підлога, задні стіни, сегмент стіни, вікно): полотно вміщує всі клітинки заввишки `height` і запас
 * `PAD`, pivot — верхня вершина ромба клітинки `origin` (контракт: для плит кімнат — клітинки (room.x, room.y), для
 * сегментів стін — їхньої першої клітинки, для вікон — клітинки стіни).
 */
export function slab(cells: readonly Vec[], origin: Vec, height: number): Geometry {
  const b = cellBounds(cells, height);
  const o = iso(origin);
  return {
    size: { w: b.x1 - b.x0 + 2 * PAD, h: b.y1 - b.y0 + 2 * PAD },
    pivot: { x: o.x - b.x0 + PAD, y: o.y - b.y0 + PAD },
  };
}

/** Клітинки прямокутника. */
export function rectCells(r: Rect): Vec[] {
  const cells: Vec[] = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cells.push({ x, y });
  return cells;
}

/** Клітинки стіни квартири: задня, внутрішня, передня (плінтус) чи вхідні двері. */
export type WallKind = "back" | "inner" | "front" | "door";

const DOOR = OBJECTS.find((o) => o.kind === "door");
const covers = (r: Rect, x: number, y: number): boolean => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/**
 * Що за стіна на клітинці (null — не стіна). Кутові клітинки, що належать і задній, і передній стіні ((19, 0) і (0, 11)), —
 * передні: задні стіни обриваються зрізом, як у розрізі лялькового будинку, і нічого не закривають.
 */
export function wallKind(x: number, y: number): WallKind | null {
  if (MAP[y]?.[x] !== "#") return null;
  if (DOOR && covers(DOOR, x, y)) return "door";
  if (y === MAP_HEIGHT - 1 || x === MAP_WIDTH - 1) return "front";
  if (y === 0 || x === 0) return "back";
  return "inner";
}

/**
 * Задні стіни, що прилягають до кімнати (контракт): ряд y = 0 над нею і/або стовпець x = 0 ліворуч, з кутовою клітинкою
 * (room.x − 1, room.y − 1), якщо вона задня. Плита `env/room/<id>/wall` — ці блоки, запечені разом.
 */
export function backWallCells(room: Rect): Vec[] {
  const cells: Vec[] = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (wallKind(x, y) !== "back") continue;
      const above = y === room.y - 1 && x >= room.x - 1 && x < room.x + room.w;
      const left = x === room.x - 1 && y >= room.y - 1 && y < room.y + room.h;
      if (above || left) cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * Клітинки підлоги кімнати для її плити: сама кімната й проходи ряду 5 під нею (клітинки підлоги поза кімнатами належать
 * кімнаті нижче — у вітальні, з якої в них заходять).
 */
export function floorCells(room: Rect & { id: RoomId }): Vec[] {
  const cells = rectCells(room);
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (MAP[y]?.[x] === "." && roomAt({ x, y }) === null && roomAt({ x, y: y + 1 }) === room.id) cells.push({ x, y });
    }
  }
  return cells;
}

/** Найдовший шматок переднього плінтуса, клітинок. */
export const FRONT_CHUNK = 4;

/** Сегмент внутрішньої чи передньої стіни: прямокутник клітинок — коробка для сортування глибини. */
export interface WallSegment {
  id: ArtId;
  kind: "inner" | "front";
  rect: Rect;
}

/**
 * Сегменти стін одного виду (контракт: сегменти визначає F5 за MAP). Спершу горизонтальні відрізки ряду (від двох
 * клітинок, а для переднього ряду — будь-які), решта клітинок — вертикальні відрізки стовпця. Довгі передні плінтуси
 * діляться на шматки до `FRONT_CHUNK` клітинок: діагональна смуга займає в атласі прямокутник, що росте з квадратом
 * довжини, а коротші коробки ще й простіше сортувати. Назва — звідки відрізок починається: `row<y>-x<x>` чи `col<x>-y<y>`.
 */
function segmentsOf(kind: "inner" | "front"): WallSegment[] {
  const taken = new Set<string>();
  const key = (x: number, y: number): string => `${x},${y}`;
  const is = (x: number, y: number): boolean => wallKind(x, y) === kind && !taken.has(key(x, y));
  const segments: WallSegment[] = [];
  /** Відрізок `from`…`from + length − 1` уздовж ряду чи стовпця, поділений на рівні шматки (передні — до `FRONT_CHUNK`). */
  const push = (horizontal: boolean, line: number, from: number, length: number): void => {
    const chunks = kind === "front" ? Math.ceil(length / FRONT_CHUNK) : 1;
    let start = from;
    for (let i = 0; i < chunks; i++) {
      const size = Math.ceil((from + length - start) / (chunks - i));
      const rect = horizontal ? { x: start, y: line, w: size, h: 1 } : { x: line, y: start, w: 1, h: size };
      const name = horizontal ? `row${line}-x${start}` : `col${line}-y${start}`;
      segments.push({ id: `env/wall/${kind}/${name}`, kind, rect });
      start += size;
    }
  };
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (!is(x, y)) continue;
      let end = x;
      while (is(end + 1, y)) end++;
      const run = end - x + 1;
      if (run < 2 && !(kind === "front" && y === MAP_HEIGHT - 1)) continue;
      for (let i = x; i <= end; i++) taken.add(key(i, y));
      push(true, y, x, run);
      x = end;
    }
  }
  for (let x = 0; x < MAP_WIDTH; x++) {
    for (let y = 0; y < MAP_HEIGHT; y++) {
      if (!is(x, y)) continue;
      let end = y;
      while (is(x, end + 1)) end++;
      for (let i = y; i <= end; i++) taken.add(key(x, i));
      push(false, x, y, end - y + 1);
      y = end;
    }
  }
  return segments;
}

/** Внутрішні стіни (x = 7, x = 12 у рядах 1–4, ряд 5 з проходами) і передні плінтуси — сегментами. */
export const WALL_SEGMENTS: readonly WallSegment[] = [...segmentsOf("inner"), ...segmentsOf("front")];


// --- Шари й ракурси частин ---------------------------------------------------------------------

/** Ракурси частин скелета (контракт): ¾ спереду й ¾ ззаду; ліворуч — віддзеркалення. */
export const PART_VIEWS: readonly ArtView[] = ["front", "back"];

/**
 * Шари шерсті кожної частини кота (контракт хвилі 1, у його порядку): заливка, маски табі, черепахові плями, білі плями
 * в анатомічному порядку, колорпойнт, тінь і контур. Маски малює пакет A9 у тих самих SVG, що й A7/A8, — окремих записів
 * у нього немає.
 */
export const CAT_COAT: readonly ArtLayer[] = [
  "fill",
  "tabby-classic",
  "tabby-mackerel",
  "tabby-spotted",
  "tabby-ticked",
  "tortie-a",
  "tortie-b",
  "tortie-c",
  "white-1",
  "white-2",
  "white-3",
  "point",
  "shade",
  "ink",
];

/** Довга шерсть (контракт): пасма й їхній контур — там, де вони є: тулуб, хвіст, голова. */
export const CAT_FLUFF: readonly ArtLayer[] = ["fluff", "fluff-ink"];

/**
 * Шерсть із деталями в готових кольорах (`detail`: ніс, подушечки лап, рожеве у вусі, язик) — як в еталонах F1b вух,
 * морди, рота й лап (`art/cat/…`); `detail` іде перед тінню й контуром.
 */
export const CAT_COAT_DETAIL: readonly ArtLayer[] = [...CAT_COAT.slice(0, -2), "detail", ...CAT_COAT.slice(-2)];

/** Очі кота (еталон F1b `art/cat/eyes`): райдужка, білки й відблиски (`detail`), тінь, контур — без шерсті й масок. */
export const CAT_EYE_LAYERS: readonly ArtLayer[] = ["fill-iris", "detail", "shade", "ink"];

/**
 * Накладки на шерсть у готових кольорах (§9.10, §9.5, `DISEASES.md`), окремими записами `cat/<частина>-extra/…` у тому ж
 * полотні й pivot, що частина: `extra-bald` — залисини (дерматит), `extra-dull` — тьмяна скуйовджена шерсть (глисти),
 * `extra-wrinkles` — складки шкіри безшерстих (`Shape.coat` «hairless»), `extra-curls` — завитки кучерявих («curly»),
 * `extra-collar` — нашийник із табличкою (`Cat.collar`). Окремо від основних записів, щоб еталони F1 і основа A7 не
 * мусили мати цих груп.
 */
export const CAT_EXTRAS = {
  body: ["extra-bald", "extra-dull", "extra-wrinkles", "extra-curls", "extra-collar"],
  head: ["extra-bald", "extra-dull", "extra-wrinkles", "extra-curls"],
  tail: ["extra-dull", "extra-curls"],
} as const satisfies Record<string, readonly ArtLayer[]>;
