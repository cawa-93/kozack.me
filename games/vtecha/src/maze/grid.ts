// Тайлова модель світу (§4). Лабіринт — cell-grid W×H, розгорнутий у tile-grid (2W+1)×(2H+1).
// Клітинка (cx, cy) лежить у тайлі (2cx+1, 2cy+1); стіни й проходи між клітинками — окремі тайли.
// Світ рівня 1 додатково містить префаб камери над лабіринтом (§5.4), тому карта має зсув origin.

export const T = {
  /** Поза світом: непрозоре, непрохідне, не малюється. */
  Void: 0,
  Wall: 1,
  Floor: 2,
  /** Отвір павука (§5.2, крок 5): прозорий, прохідний лише для павуків. */
  Hole: 3,
  /** Двері будь-якого типу (§5.6); варіант і стан — у DoorState. */
  Door: 4,
  /** Нерухомі ґрати стартової камери (§5.4.1): прозорі, непрохідні. */
  Bars: 5,
  /** Пролом назовні у зовнішній стіні рівня 5 (§5.5): прохідний для гравця, прозорий, для павуків — стіна. */
  Breach: 6,
  /** Полиця складу рівня 1 (§5.7): стіна для руху, прозора для погляду, часткова перешкода для світла. */
  Shelf: 7,
} as const;
export type TileType = (typeof T)[keyof typeof T];

export type DoorVariant = "wood" | "grate" | "rubble";

/** Прямокутник у локальних координатах тайла (0..1). */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// Прути ґрат (§7.2.1): положення вздовж лінії ґрат (частки тайла) і півширина квадрата прута.
// Ці ж числа малюють ґрати (render/art.ts, render/mapArt.ts), тож тінь збігається з малюнком.
export const GRATE_BAR_POS = [0.1, 0.3, 0.5, 0.7, 0.9];
export const GRATE_BAR_HALF = 0.055;
export const CELL_BAR_POS = [0.12, 0.37, 0.62, 0.87];
export const CELL_BAR_HALF = 0.07;

/** Квадрати прутів уздовж лінії через центр тайла: along = "x" — лінія горизонтальна. */
function barRects(pos: number[], half: number, along: "x" | "y"): Rect[] {
  return pos.map((p) =>
    along === "x" ? { x0: p - half, y0: 0.5 - half, x1: p + half, y1: 0.5 + half } : { x0: 0.5 - half, y0: p - half, x1: 0.5 + half, y1: p + half },
  );
}

/** Вид вмісту полиці складу (§5.7). */
export type ShelfKind = "boxes" | "sacks" | "jars" | "bottles";

/** Річ на полиці: центр і довжина вздовж полиці, глибина й зсув поперек, відтінок (0..2). */
export interface ShelfItem {
  a: number;
  len: number;
  depth: number;
  off: number;
  tone: number;
}

export interface Shelf {
  tx: number;
  ty: number;
  /** Вісь, уздовж якої тягнеться полиця. */
  along: "x" | "y";
  kind: ShelfKind;
  items: ShelfItem[];
  /** Часткові перешкоди світла: стояки й речі (§7.2.1). */
  rects: Rect[];
}

const GRATE_RECTS = { x: barRects(GRATE_BAR_POS, GRATE_BAR_HALF, "x"), y: barRects(GRATE_BAR_POS, GRATE_BAR_HALF, "y") };
const CELL_BAR_RECTS = barRects(CELL_BAR_POS, CELL_BAR_HALF, "x");

export interface DoorState {
  id: number;
  tx: number;
  ty: number;
  variant: DoorVariant;
  open: boolean;
  /** Завал стартової камери рівня 1 (§5.4) — понад ліміт дверей рівня. */
  isCameraRubble: boolean;
}

export class TileMap {
  readonly tiles: Uint8Array;
  /** Двері за ключем тайла. */
  readonly doors = new Map<number, DoorState>();
  /** Полиці складу за ключем тайла (§5.7). */
  readonly shelves = new Map<number, Shelf>();

  constructor(
    readonly originX: number,
    readonly originY: number,
    readonly width: number,
    readonly height: number,
  ) {
    this.tiles = new Uint8Array(width * height);
  }

  inBounds(tx: number, ty: number): boolean {
    const x = tx - this.originX;
    const y = ty - this.originY;
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  key(tx: number, ty: number): number {
    return (ty - this.originY) * this.width + (tx - this.originX);
  }

  get(tx: number, ty: number): TileType {
    if (!this.inBounds(tx, ty)) return T.Void;
    return this.tiles[this.key(tx, ty)] as TileType;
  }

  set(tx: number, ty: number, type: TileType): void {
    if (!this.inBounds(tx, ty)) throw new Error(`TileMap.set out of bounds: ${tx},${ty}`);
    this.tiles[this.key(tx, ty)] = type;
  }

  door(tx: number, ty: number): DoorState | undefined {
    return this.inBounds(tx, ty) ? this.doors.get(this.key(tx, ty)) : undefined;
  }

  /** Прохідність для гравця: підлога, пролом назовні й відчинені двері. */
  walkablePlayer(tx: number, ty: number): boolean {
    const t = this.get(tx, ty);
    if (t === T.Floor || t === T.Breach) return true;
    if (t === T.Door) return this.door(tx, ty)!.open;
    return false;
  }

  /** Прохідність для павука: підлога, отвори й відчинені двері. */
  walkableSpider(tx: number, ty: number): boolean {
    const t = this.get(tx, ty);
    if (t === T.Floor || t === T.Hole) return true;
    if (t === T.Door) return this.door(tx, ty)!.open;
    return false;
  }

  /**
   * Непрозорість — однакова для світла, зору гравця й LOS павука (§13):
   * стіни, зачинені дерев'яні двері й нерозібрані завали непрозорі; отвори, ґрати, ґрати-двері й полиці — ні
   * (ґрати й полиці лише відкидають тіні, §7.2.1).
   */
  opaque(tx: number, ty: number): boolean {
    const t = this.get(tx, ty);
    if (t === T.Wall || t === T.Void) return true;
    if (t === T.Door) {
      const d = this.door(tx, ty)!;
      return !d.open && d.variant !== "grate";
    }
    return false;
  }

  /**
   * Часткові перешкоди для світла (§7.2.1): прути зачинених ґрат-дверей і ґрат камери, речі на полицях.
   * На погляд гравця й LOS павука не впливають — лише на полігони світла.
   */
  lightOccluders(tx: number, ty: number): readonly Rect[] | null {
    const t = this.get(tx, ty);
    if (t === T.Bars) return CELL_BAR_RECTS;
    if (t === T.Shelf) return this.shelves.get(this.key(tx, ty))!.rects;
    if (t === T.Door) {
      const d = this.door(tx, ty)!;
      if (d.variant !== "grate" || d.open) return null;
      // Прохід вертикальний (ty парний) — лінія дверей горизонтальна (§5.6).
      return ((ty % 2) + 2) % 2 === 0 ? GRATE_RECTS.x : GRATE_RECTS.y;
    }
    return null;
  }

  /** Блокує політ плювка й кинутої шашки: стіни, ґрати, полиці й зачинені двері будь-якого типу (§5.6, §9.4). */
  blocksProjectile(tx: number, ty: number): boolean {
    const t = this.get(tx, ty);
    if (t === T.Wall || t === T.Void || t === T.Bars || t === T.Shelf) return true;
    if (t === T.Door) return !this.door(tx, ty)!.open;
    return false;
  }
}

// ---- Клітинки ----

export interface Cell {
  cx: number;
  cy: number;
}

export const cellTileX = (cx: number): number => 2 * cx + 1;
export const cellTileY = (cy: number): number => 2 * cy + 1;

/** Напрямки між клітинками: зсув у клітинках. */
export const DIRS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export type Corner = 0 | 1 | 2 | 3; // 0 — верхній лівий, 1 — верхній правий, 2 — нижній лівий, 3 — нижній правий

export function cornerCell(corner: Corner, w: number, h: number): Cell {
  return {
    cx: corner === 1 || corner === 3 ? w - 1 : 0,
    cy: corner === 2 || corner === 3 ? h - 1 : 0,
  };
}

export function cornerOfCell(c: Cell, w: number, h: number): Corner | null {
  for (const corner of [0, 1, 2, 3] as Corner[]) {
    const cc = cornerCell(corner, w, h);
    if (cc.cx === c.cx && cc.cy === c.cy) return corner;
  }
  return null;
}
