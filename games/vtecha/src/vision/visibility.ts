// Полігон видимості (§7.2). Промені пускаються в кути непрозорих тайлів (±ε, щоб «прослизати»
// за ріг) і в кути обмежувального квадрата; кожен промінь проходить тайловою сіткою (DDA,
// Amanatides–Woo) до першого непрозорого тайла. Результат — точки, відсортовані за кутом.

import type { Rect } from "../maze/grid";

export type OpaqueFn = (tx: number, ty: number) => boolean;
/** Часткові перешкоди тайла (прути ґрат, §7.2.1) у локальних координатах або null. */
export type OccluderFn = (tx: number, ty: number) => readonly Rect[] | null;

const EPS = 0.0001;
/** Заглиблення променя в прут, щоб сам прут був освітлений спереду (§7.2.1). */
const PARTIAL_PENETRATION = 0.05;

/** Куди влучив останній castRay: непрозорий тайл, часткова перешкода чи межа квадрата. */
let lastHit: "opaque" | "partial" | "none" = "none";
/** Тайл, у який влучив останній castRay. */
let lastTx = 0;
let lastTy = 0;

export interface VisibilityOptions {
  /** Півширина обмежувального квадрата (тайли). Промінь, що нічого не зустрів, закінчується на ньому. */
  extent: number;
  /** Сектор: центральний кут і повний кут розкриття. Без сектора — 360°. */
  sector?: { dir: number; angle: number };
  /**
   * Заглиблення в непрозорий тайл уздовж променя (§7.2, «Стіни на межі зору»): грань стіни,
   * що обмежує полігон, лишається видимою.
   */
  penetrate?: number;
  /** Часткові перешкоди — лише для полігонів світла, не для зору (§7.2.1). */
  partial?: OccluderFn;
  /** Власне заглиблення для окремих непрозорих тайлів (двері й завали, §7.2) або null — загальне. */
  penetrateAt?: (tx: number, ty: number) => number | null;
}

/** Повертає плаский масив [x0, y0, x1, y1, ...] у тайлових координатах. */
export function visibilityPolygon(ox: number, oy: number, opaque: OpaqueFn, opts: VisibilityOptions): number[] {
  const ext = opts.extent;
  const minX = Math.floor(ox - ext);
  const maxX = Math.ceil(ox + ext);
  const minY = Math.floor(oy - ext);
  const maxY = Math.ceil(oy + ext);

  const angles: number[] = [];
  const pushCorner = (px: number, py: number) => {
    const a = Math.atan2(py - oy, px - ox);
    angles.push(a - EPS, a, a + EPS);
  };

  // Кути непрозорих тайлів, що межують із прозорими.
  const seen = new Set<number>();
  const rowStride = maxX - minX + 2;
  const partial = opts.partial;
  for (let ty = minY; ty < maxY; ty++) {
    for (let tx = minX; tx < maxX; tx++) {
      if (!opaque(tx, ty)) {
        const rects = partial?.(tx, ty);
        if (rects) for (const r of rects) for (const [cx, cy] of [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]]) pushCorner(tx + cx, ty + cy);
        continue;
      }
      if (opaque(tx - 1, ty) && opaque(tx + 1, ty) && opaque(tx, ty - 1) && opaque(tx, ty + 1)) continue;
      for (const [cx, cy] of [
        [tx, ty],
        [tx + 1, ty],
        [tx, ty + 1],
        [tx + 1, ty + 1],
      ]) {
        const key = (cy - minY) * rowStride + (cx - minX);
        if (seen.has(key)) continue;
        seen.add(key);
        pushCorner(cx, cy);
      }
    }
  }
  // Кути обмежувального квадрата.
  pushCorner(ox - ext, oy - ext);
  pushCorner(ox + ext, oy - ext);
  pushCorner(ox - ext, oy + ext);
  pushCorner(ox + ext, oy + ext);

  let list = angles;
  let sectorStart = -Math.PI;
  if (opts.sector) {
    const half = opts.sector.angle / 2;
    sectorStart = opts.sector.dir - half;
    const inSector: number[] = [];
    for (const a of angles) {
      const rel = normalizeAngle(a - sectorStart);
      if (rel <= opts.sector.angle) inSector.push(sectorStart + rel);
    }
    inSector.push(sectorStart, sectorStart + opts.sector.angle);
    list = inSector;
  } else {
    for (let i = 0; i < 16; i++) list.push(-Math.PI + (i / 16) * Math.PI * 2);
  }

  list.sort((a, b) => a - b);

  const out: number[] = [];
  if (opts.sector) out.push(ox, oy);
  let lastA = Number.NaN;
  const pen = opts.penetrate ?? 0;
  for (const a of list) {
    if (a === lastA) continue;
    lastA = a;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const [hx, hy] = castRay(ox, oy, dx, dy, opaque, ox - ext, oy - ext, ox + ext, oy + ext, partial);
    const p = lastHit === "opaque" ? (opts.penetrateAt?.(lastTx, lastTy) ?? pen) : lastHit === "partial" ? PARTIAL_PENETRATION : 0;
    out.push(hx + dx * p, hy + dy * p);
  }
  return out;
}

/** Кут у [0, 2π). */
function normalizeAngle(a: number): number {
  const t = a % (Math.PI * 2);
  return t < 0 ? t + Math.PI * 2 : t;
}

/**
 * Промінь від (ox, oy) у напрямку (dx, dy) до першого непрозорого тайла або межі квадрата.
 * Повертає точку влучання.
 */
export function castRay(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  opaque: OpaqueFn,
  bx0: number,
  by0: number,
  bx1: number,
  by1: number,
  partial?: OccluderFn,
): [number, number] {
  // Відстань до межі квадрата.
  let tMax = Infinity;
  if (dx > 0) tMax = Math.min(tMax, (bx1 - ox) / dx);
  else if (dx < 0) tMax = Math.min(tMax, (bx0 - ox) / dx);
  if (dy > 0) tMax = Math.min(tMax, (by1 - oy) / dy);
  else if (dy < 0) tMax = Math.min(tMax, (by0 - oy) / dy);

  let tx = Math.floor(ox);
  let ty = Math.floor(oy);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tNextX = dx > 0 ? (tx + 1 - ox) * tDeltaX : dx < 0 ? (ox - tx) * tDeltaX : Infinity;
  let tNextY = dy > 0 ? (ty + 1 - oy) * tDeltaY : dy < 0 ? (oy - ty) * tDeltaY : Infinity;

  lastHit = "opaque";
  lastTx = tx;
  lastTy = ty;
  if (opaque(tx, ty)) return [ox, oy];
  // Перетин із прутами поточного тайла (§7.2.1): найближчий прямокутник на промені до tLimit.
  const hitPartial = (tLimit: number): number => {
    const rects = partial?.(tx, ty);
    if (!rects) return Infinity;
    let best = Infinity;
    for (const r of rects) {
      const t = rayRect(ox - tx, oy - ty, dx, dy, r);
      if (t < best) best = t;
    }
    return best <= tLimit ? best : Infinity;
  };
  {
    const tp = hitPartial(tMax);
    if (tp < Infinity) {
      lastHit = "partial";
      return [ox + dx * tp, oy + dy * tp];
    }
  }
  for (let guard = 0; guard < 4096; guard++) {
    let t: number;
    if (tNextX < tNextY) {
      t = tNextX;
      tx += stepX;
      tNextX += tDeltaX;
    } else {
      t = tNextY;
      ty += stepY;
      tNextY += tDeltaY;
    }
    if (t >= tMax) {
      lastHit = "none";
      return [ox + dx * tMax, oy + dy * tMax];
    }
    if (opaque(tx, ty)) {
      lastTx = tx;
      lastTy = ty;
      return [ox + dx * t, oy + dy * t];
    }
    if (partial) {
      const tp = hitPartial(tMax);
      if (tp < Infinity) {
        lastHit = "partial";
        return [ox + dx * tp, oy + dy * tp];
      }
    }
  }
  lastHit = "none";
  return [ox + dx * tMax, oy + dy * tMax];
}

/**
 * Перший перетин променя (початок у локальних координатах тайла) з прямокутником, t ≥ 0 (slab-метод).
 * Промінь, що починається всередині прямокутника, його не бачить — Infinity.
 */
function rayRect(ox: number, oy: number, dx: number, dy: number, r: Rect): number {
  let tNear = -Infinity;
  let tFar = Infinity;
  if (dx !== 0) {
    const a = (r.x0 - ox) / dx;
    const b = (r.x1 - ox) / dx;
    tNear = Math.max(tNear, Math.min(a, b));
    tFar = Math.min(tFar, Math.max(a, b));
  } else if (ox < r.x0 || ox > r.x1) return Infinity;
  if (dy !== 0) {
    const a = (r.y0 - oy) / dy;
    const b = (r.y1 - oy) / dy;
    tNear = Math.max(tNear, Math.min(a, b));
    tFar = Math.min(tFar, Math.max(a, b));
  } else if (oy < r.y0 || oy > r.y1) return Infinity;
  if (tNear > tFar || tFar < 0 || tNear < 0) return Infinity;
  return tNear;
}
