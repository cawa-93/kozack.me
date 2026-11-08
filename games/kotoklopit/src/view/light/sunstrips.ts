// Смуги сонця з вікон (§8.9 «День і ніч», рішення автора 2026-11-02: «тепле ранкове світло зі смугами з вікон»): отвір вікна
// (`PANES`: `span` уздовж стіни × `z` по висоті), спроєктований уздовж сонячного променя на підлогу кімнати й обрізаний її
// прямокутником (`ROOMS`). Уранці сонце світить у вікна стіни y = 0 (спальня, кухня), увечері — у вікно стіни x = 0
// (вітальня). Низьке сонце — довгі смуги далеко від вікна, високе — короткі біля нього. Рама 2 × 2 лишає на смузі тінь
// хрестовини. Чиста геометрія в клітинках, без Phaser і DOM (`tests/sunstrips.test.ts`).

import { ROOMS, type Rect } from "../../sim/home";
import type { Vec } from "../../sim/types";
import type { Pane } from "../decor";
import type { Sun } from "./daylight";
import { SUN } from "./lightlook";

/** Пляма сонця від однієї шибки на підлозі. */
export interface SunStrip {
  /** Опуклий многокутник на підлозі, клітинки, уже обрізаний кімнатою вікна. */
  readonly points: readonly Vec[];
  /** Середина краю плями від низу отвору (ближче до вікна) і від верху (далі) — до обрізання: напрям градієнта смуги. */
  readonly near: Vec;
  readonly far: Vec;
}

/** Промінь сонця на підлозі: одиничний напрям від стіни вглиб кімнати й скільки клітинок на одиницю висоти арту. */
export interface SunRay {
  readonly dir: Vec;
  readonly perZ: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Промінь сонця за його висотою (`Sun.elevation`) і стіною, у вікна якої воно світить (`Sun.wall`). */
export function sunRay(sun: Sun): SunRay {
  const e = Math.min(1, Math.max(0, sun.elevation));
  const altitude = (lerp(SUN.altitude.low, SUN.altitude.high, e) * Math.PI) / 180;
  const slant = sun.wall === "y" ? SUN.slant.morning : SUN.slant.evening;
  const s = lerp(slant.low, slant.high, e);
  const length = Math.hypot(1, s);
  const dir = sun.wall === "y" ? { x: s / length, y: 1 / length } : { x: 1 / length, y: s / length };
  return { dir, perZ: 1 / (SUN.cellZ * Math.tan(altitude)) };
}

/**
 * Обрізати опуклий многокутник прямокутником (Сазерленд — Ходжман): що лишилося всередині, у тому самому обході. Порожньо —
 * [].
 */
export function clipToRect(points: readonly Vec[], rect: Rect): Vec[] {
  type Edge = { inside: (p: Vec) => boolean; cross: (a: Vec, b: Vec) => Vec };
  const x0 = rect.x;
  const x1 = rect.x + rect.w;
  const y0 = rect.y;
  const y1 = rect.y + rect.h;
  const atX = (a: Vec, b: Vec, x: number): Vec => ({ x, y: a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x) });
  const atY = (a: Vec, b: Vec, y: number): Vec => ({ x: a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y), y });
  const edges: Edge[] = [
    { inside: (p) => p.x >= x0, cross: (a, b) => atX(a, b, x0) },
    { inside: (p) => p.x <= x1, cross: (a, b) => atX(a, b, x1) },
    { inside: (p) => p.y >= y0, cross: (a, b) => atY(a, b, y0) },
    { inside: (p) => p.y <= y1, cross: (a, b) => atY(a, b, y1) },
  ];
  let poly: Vec[] = [...points];
  for (const edge of edges) {
    if (poly.length === 0) break;
    const next: Vec[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      const ina = edge.inside(a);
      const inb = edge.inside(b);
      if (ina) next.push(a);
      if (ina !== inb) next.push(edge.cross(a, b));
    }
    poly = next;
  }
  return poly;
}

/** Площа многокутника (модуль), клітинки². */
export function polygonArea(points: readonly Vec[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** Менші за це клаптики (клітинки²) — не смуга, а крихта на краю кімнати. */
const MIN_AREA = 0.01;

/**
 * Смуги сонця від вікна `pane` за сонця `sun`: по одній на шибку рами (`SUN.grid`), обрізані кімнатою вікна. Сонця немає чи
 * воно світить в іншу стіну — [].
 */
export function sunStrips(pane: Pane, sun: Sun | null): SunStrip[] {
  if (!sun || sun.strength <= 0 || sun.wall !== pane.face) return [];
  const room = ROOMS.find((r) => r.id === pane.room);
  if (!room) return [];
  const { dir, perZ } = sunRay(sun);
  // Лице стіни: ряд y = 0 — площина y = 1, стовпець x = 0 — площина x = 1.
  const plane = pane.face === "y" ? pane.wall.y + 1 : pane.wall.x + 1;
  const floor = (u: number, z: number): Vec => {
    const base = pane.face === "y" ? { x: u, y: plane } : { x: plane, y: u };
    return { x: base.x + dir.x * z * perZ, y: base.y + dir.y * z * perZ };
  };
  const [ua, ub] = pane.span;
  const [za, zb] = pane.z;
  const mid = (ua + ub) / 2;
  const near = floor(mid, za);
  const far = floor(mid, zb);
  const { cols, rows, bar } = SUN.grid;
  const cellU = (1 - bar * (cols - 1)) / cols;
  const cellZ = (1 - bar * (rows - 1)) / rows;
  const strips: SunStrip[] = [];
  for (let c = 0; c < cols; c++) {
    const u0 = lerp(ua, ub, c * (cellU + bar));
    const u1 = lerp(ua, ub, c * (cellU + bar) + cellU);
    for (let r = 0; r < rows; r++) {
      const z0 = lerp(za, zb, r * (cellZ + bar));
      const z1 = lerp(za, zb, r * (cellZ + bar) + cellZ);
      const points = clipToRect([floor(u0, z0), floor(u1, z0), floor(u1, z1), floor(u0, z1)], room);
      if (points.length >= 3 && polygonArea(points) >= MIN_AREA) strips.push({ points, near, far });
    }
  }
  return strips;
}
