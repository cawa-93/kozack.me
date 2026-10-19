// Квартира прототипу (§8.4): стіни, кімнати й речі на сітці клітинок підлоги.
// Розкладка не змінюється під час гри, тож вона не входить у стан гри.

import type { Vec } from "./types";

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
  | "sofa";

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

const object = (id: string, kind: ObjectKind, x: number, y: number, w = 1, h = 1): HomeObject => ({
  id,
  kind,
  x,
  y,
  w,
  h,
  interactive: kind !== "sink" && kind !== "sofa",
});

export const OBJECTS: readonly HomeObject[] = [
  object("bed", "bed", 1, 1, 2, 3),
  object("shower", "shower", 8, 1, 2, 2),
  object("sink", "sink", 11, 1),
  object("fridge", "fridge", 13, 1),
  object("counter-left", "counter", 14, 1),
  object("stove", "stove", 15, 1),
  object("counter-right", "counter", 16, 1, 2, 1),
  object("trash", "trash", 18, 1),
  object("table", "table", 13, 3, 2, 1),
  object("computer", "computer", 6, 6, 2, 1),
  object("sofa", "sofa", 13, 10, 3, 1),
  object("door", "door", 10, 11, 2, 1),
];

/** Поверхні, на які можна покласти річ: стіл і робочі поверхні кухні. */
export const SURFACE_IDS: readonly string[] = OBJECTS.filter(
  (o) => o.kind === "table" || o.kind === "counter",
).map((o) => o.id);

/** Де персонаж прокидається: біля ліжка (§8.7). */
export const SPAWN: Vec = { x: 3.5, y: 2.5 };

const BY_ID = new Map(OBJECTS.map((o) => [o.id, o]));

export function objectById(id: string): HomeObject {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Немає речі «${id}»`);
  return found;
}

// Сітка непрохідних клітинок: стіни й речі.
const SOLID: boolean[][] = MAP.map((row) => [...row].map((cell) => cell === "#"));
for (const o of OBJECTS) {
  for (let y = o.y; y < o.y + o.h; y++) {
    for (let x = o.x; x < o.x + o.w; x++) {
      const row = SOLID[y];
      if (row) row[x] = true;
    }
  }
}

/** Клітинка непрохідна; усе за межами карти — теж. */
export function isSolid(x: number, y: number): boolean {
  return SOLID[y]?.[x] ?? true;
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
