// Квартира прототипу (§8.4): стіни, кімнати й речі на сітці клітинок підлоги, а також
// місця для речей котячого кутка (§9.12). Розкладка не змінюється під час гри, тож вона не входить у стан гри.

import type { GameState, HomeItem, Product, Vec } from "./types";

export type RoomId = "bedroom" | "bathroom" | "kitchen" | "living";

export type ObjectKind =
  | "bed"
  | "shower"
  | "sink"
  | "fridge"
  | "stove"
  | "counter"
  | "table"
  | "trash"
  | "computer"
  | "door"
  | "sofa"
  | "catCabinet"
  | "washer"
  | "vacuum"
  | "litterBag"
  | "sterileBin"
  | "catKit"
  | "boxes";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HomeObject extends Rect {
  id: string;
  kind: ObjectKind;
  /** З річчю можна взаємодіяти; решта — обстановка. */
  interactive: boolean;
  /** Сховище, що з'являється вдома лише після першого отримання одного з цих запасів (§6.4). */
  requires?: readonly Product[];
  /** Крізь річ можна пройти: вона не заступає дорогу (ящики біля входу). */
  walkable?: true;
}

/** `#` — стіна, `.` — підлога. */
export const MAP: readonly string[] = [
  "####################",
  "#......#....#......#",
  "#......#....#......#",
  "#......#....#......#",
  "#......#....#......#",
  "###..#####..###..###",
  "#..................#",
  "#..................#",
  "#..................#",
  "#..................#",
  "#..................#",
  "####################",
];

export const MAP_WIDTH = MAP[0]?.length ?? 0;
export const MAP_HEIGHT = MAP.length;

export const ROOMS: readonly (Rect & { id: RoomId })[] = [
  { id: "bedroom", x: 1, y: 1, w: 6, h: 4 },
  { id: "bathroom", x: 8, y: 1, w: 4, h: 4 },
  { id: "kitchen", x: 13, y: 1, w: 6, h: 4 },
  { id: "living", x: 1, y: 6, w: 18, h: 5 },
];

/** Кімната, у якій точка; у проході між кімнатами — null (§9.9, §9.12). */
export function roomAt(p: Vec): RoomId | null {
  return ROOMS.find((r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h)?.id ?? null;
}

const object = (id: string, kind: ObjectKind, x: number, y: number, w = 1, h = 1, requires?: readonly Product[]): HomeObject => ({
  id,
  kind,
  x,
  y,
  w,
  h,
  interactive: kind !== "sofa",
  ...(requires ? { requires } : {}),
});

export const OBJECTS: readonly HomeObject[] = [
  // Меблі в масштабі персонажа: ліжко 1×2, душова кабіна 1×1 (§8.4).
  object("bed", "bed", 1, 1, 1, 2),
  object("shower", "shower", 8, 1),
  object("sink", "sink", 11, 1),
  object("fridge", "fridge", 13, 1),
  object("counter-left", "counter", 14, 1),
  object("stove", "stove", 15, 1),
  object("counter-right", "counter", 16, 1, 2, 1),
  object("trash", "trash", 18, 1),
  object("table", "table", 13, 3, 2, 1),
  // Сховища котячих запасів з'являються, коли запас уперше потрапив додому (§6.4).
  object("cat-cabinet", "catCabinet", 18, 3, 1, 1, ["catFood"]),
  object("computer", "computer", 6, 6, 2, 1),
  object("sofa", "sofa", 13, 10, 3, 1),
  object("door", "door", 10, 11, 2, 1),
  // Побут (§8.7): пральна машина у ванній і шафа з пилососом у вітальні.
  object("washer", "washer", 10, 1),
  object("vacuum", "vacuum", 16, 10),
  // Сховища запасів (§6.4): мішок наповнювача, бак корму для стерилізованих і котяча аптечка.
  object("litter-bag", "litterBag", 5, 6, 1, 1, ["litter"]),
  object("sterile-bin", "sterileBin", 18, 6, 1, 1, ["sterileFood"]),
  object("cat-kit", "catKit", 13, 6, 1, 1, ["pills", "drops", "treats", "collar", "bell"]),
  // Ящики біля входу (§6.4): стоять, поки в них є куплені запаси; невисокі — через них переступають.
  // Не в ряду біля дверей: його закриває передня стіна (камера «три чверті»).
  { ...object("boxes", "boxes", 12, 9), walkable: true },
];

/** У ящиках біля входу щось є (§6.4). */
export function hasBoxes(state: Pick<GameState, "home">): boolean {
  return Object.values(state.home.boxes ?? {}).some((box) => box.cheap + box.premium > 0);
}

/** Річ є в квартирі: меблі — завжди, сховище — після першого отримання свого запасу (§6.4). */
export function isPresent(state: Pick<GameState, "home">, object: HomeObject): boolean {
  if (object.kind === "boxes") return hasBoxes(state);
  return !object.requires || object.requires.some((p) => state.home.acquired.includes(p));
}

/** Речі, які зараз є в квартирі. */
export function objectsOf(state: Pick<GameState, "home">): HomeObject[] {
  return OBJECTS.filter((o) => isPresent(state, o));
}

/** Поверхні, на які можна покласти річ: стіл і робочі поверхні кухні. */
export const SURFACE_IDS: readonly string[] = OBJECTS.filter(
  (o) => o.kind === "table" || o.kind === "counter",
).map((o) => o.id);

/** Де персонаж прокидається: біля ліжка (§8.7). */
export const SPAWN: Vec = { x: 2.5, y: 2.5 };

/** Місце на підлозі для речі котячого кутка (§9.12). Речі на підлозі не тверді. */
export interface Slot {
  id: string;
  kind: HomeItem["kind"];
  x: number;
  y: number;
}

// Нижній ряд кімнат закриває передня стіна (камера «три чверті», §2.1), тож речі стоять вище.
export const SLOTS: readonly Slot[] = [
  { id: "bowl-1", kind: "bowl", x: 17, y: 3 },
  { id: "bowl-2", kind: "bowl", x: 16, y: 3 },
  { id: "bowl-3", kind: "bowl", x: 15, y: 3 },
  { id: "bowl-4", kind: "bowl", x: 17, y: 2 },
  { id: "water-1", kind: "water", x: 17, y: 6 },
  { id: "water-2", kind: "water", x: 14, y: 6 },
  { id: "litter-1", kind: "litter", x: 8, y: 3 },
  { id: "litter-2", kind: "litter", x: 9, y: 3 },
  { id: "litter-3", kind: "litter", x: 11, y: 3 },
  { id: "litter-4", kind: "litter", x: 11, y: 2 },
  // Купівельні місця (§6.4): ще миски й лотки, будиночки й кігтеточки у вітальні.
  { id: "bowl-5", kind: "bowl", x: 18, y: 7 },
  { id: "bowl-6", kind: "bowl", x: 18, y: 8 },
  { id: "water-3", kind: "water", x: 9, y: 6 },
  { id: "litter-5", kind: "litter", x: 1, y: 6 },
  { id: "litter-6", kind: "litter", x: 2, y: 6 },
  { id: "house-1", kind: "house", x: 1, y: 9 },
  { id: "house-2", kind: "house", x: 18, y: 9 },
  { id: "house-3", kind: "house", x: 5, y: 9 },
  { id: "scratcher-1", kind: "scratcher", x: 4, y: 6 },
  { id: "scratcher-2", kind: "scratcher", x: 12, y: 6 },
  { id: "scratcher-3", kind: "scratcher", x: 11, y: 9 },
];

const SLOT_BY_ID = new Map(SLOTS.map((s) => [s.id, s]));

export function slotById(id: string): Slot {
  const found = SLOT_BY_ID.get(id);
  if (!found) throw new Error(`Немає місця «${id}»`);
  return found;
}

/** Центр клітинки місця речі. */
export function slotCenter(id: string): Vec {
  const slot = slotById(id);
  return { x: slot.x + 0.5, y: slot.y + 0.5 };
}

/** Де річ котячого кутка: центр її місця, а іграшка — там, де лежить. */
export function itemPoint(item: HomeItem): Vec {
  return item.kind === "toy" ? { x: item.x, y: item.y } : slotCenter(item.slot);
}

/** Клітинка речі. */
export function itemTile(item: HomeItem): Vec {
  const p = itemPoint(item);
  return { x: Math.floor(p.x), y: Math.floor(p.y) };
}

const BY_ID = new Map(OBJECTS.map((o) => [o.id, o]));

export function objectById(id: string): HomeObject {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Немає речі «${id}»`);
  return found;
}

// Сітка непрохідних клітинок: стіни й постійні речі. Сховища, що з'являються, — окремо.
const SOLID: boolean[][] = MAP.map((row) => [...row].map((cell) => cell === "#"));
const OPTIONAL = OBJECTS.filter((o) => o.requires);
for (const o of OBJECTS) {
  if (o.requires || o.walkable) continue;
  for (let y = o.y; y < o.y + o.h; y++) {
    for (let x = o.x; x < o.x + o.w; x++) {
      const row = SOLID[y];
      if (row) row[x] = true;
    }
  }
}

/** Стіна чи постійні меблі: без сховищ, що з'являються. Для шляхів котів, які й так лазять меблями. */
export function isFixedSolid(x: number, y: number): boolean {
  return SOLID[y]?.[x] ?? true;
}

const covers = (o: Rect, x: number, y: number): boolean => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h;

/** Клітинка непрохідна; усе за межами карти — теж. */
export function isSolid(state: Pick<GameState, "home">, x: number, y: number): boolean {
  return (SOLID[y]?.[x] ?? true) || OPTIONAL.some((o) => covers(o, x, y) && isPresent(state, o));
}

/** Річ квартири на клітинці, якщо вона там є: на меблях коти сплять і ховаються. */
export function objectAt(state: Pick<GameState, "home">, x: number, y: number): HomeObject | null {
  return OBJECTS.find((o) => covers(o, x, y) && isPresent(state, o)) ?? null;
}

/** Клітинку закриває передня стіна (камера «три чверті»): безлад туди не кладемо, щоб його було видно. */
export function hiddenTile(x: number, y: number): boolean {
  return MAP[y + 1]?.[x] === "#";
}

/** Стіна чи межа карти: крізь неї не пройде навіть кіт. */
export function isWall(x: number, y: number): boolean {
  return MAP[y]?.[x] !== ".";
}

/** Відстань від точки до прямокутника речі (0 — усередині). */
export function distanceToRect(p: Vec, r: Rect): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

export function centerOf(r: Rect): Vec {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}
