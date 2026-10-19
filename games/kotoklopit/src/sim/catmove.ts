// Рух котів квартирою (§9.3): шляхи сіткою клітинок, меблі, на які можна застрибнути,
// і місця на підлозі, які видно гравцеві.

import { FURNITURE_COST } from "./config";
import { hiddenTile, isSolid, isWall, MAP_HEIGHT, MAP_WIDTH } from "./home";
import type { Rng } from "./rng";
import type { Cat, Vec } from "./types";

const FIELDS = new Map<number, Float32Array>();

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/** Ціна входу в клітинку для кота: підлога 1, меблі — дорожче, стіни — неможливо. */
function tileCost(x: number, y: number): number {
  if (isWall(x, y)) return Infinity;
  return isSolid(x, y) ? FURNITURE_COST : 1;
}

/**
 * Відстань до клітинки-цілі від кожної клітинки (Дейкстра на сітці 20×12, кешується).
 * Кіт платить ціну клітинки, у яку входить: тож шлях обходить меблі, але може на них закінчитися.
 */
function fieldTo(goal: Vec): Float32Array {
  const key = goal.y * MAP_WIDTH + goal.x;
  const cached = FIELDS.get(key);
  if (cached) return cached;
  const size = MAP_WIDTH * MAP_HEIGHT;
  const dist = new Float32Array(size).fill(Infinity);
  const done = new Uint8Array(size);
  dist[key] = 0;
  for (;;) {
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < size; i++) {
      const d = dist[i] ?? Infinity;
      if (!done[i] && d < bestDist) {
        best = i;
        bestDist = d;
      }
    }
    if (best < 0) break;
    done[best] = 1;
    const bx = best % MAP_WIDTH;
    const by = Math.floor(best / MAP_WIDTH);
    const enter = tileCost(bx, by);
    if (enter === Infinity) continue;
    for (const [dx, dy] of NEIGHBORS) {
      const nx = bx + dx;
      const ny = by + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT || isWall(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (isWall(bx + dx, by) || isWall(bx, by + dy))) continue;
      const next = ny * MAP_WIDTH + nx;
      const candidate = bestDist + (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1) * enter;
      if (candidate < (dist[next] ?? Infinity)) dist[next] = candidate;
    }
  }
  FIELDS.set(key, dist);
  return dist;
}

/** Наступна клітинка на шляху до цілі. */
function nextTile(x: number, y: number, field: Float32Array): Vec | null {
  let best: Vec | null = null;
  let bestDist = field[y * MAP_WIDTH + x] ?? Infinity;
  for (const [dx, dy] of NEIGHBORS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT || isWall(nx, ny)) continue;
    if (dx !== 0 && dy !== 0 && (isWall(x + dx, y) || isWall(x, y + dy))) continue;
    const d = field[ny * MAP_WIDTH + nx] ?? Infinity;
    if (d < bestDist) {
      bestDist = d;
      best = { x: nx, y: ny };
    }
  }
  return best;
}

/** Іти до цілі дії зі швидкістю (клітинок за хвилину). Повертає хвилини, що лишилися після прибуття. */
export function walk(cat: Cat, minutes: number, speed: number): number {
  const goal = cat.act.goal;
  if (!goal) return minutes;
  const field = fieldTo(goal);
  let budget = speed * minutes;
  for (let guard = 0; guard < 64 && budget > 1e-9 && cat.act.goal; guard++) {
    const tx = Math.floor(cat.x);
    const ty = Math.floor(cat.y);
    let target: Vec;
    if (tx === goal.x && ty === goal.y) {
      target = { x: goal.x + 0.5, y: goal.y + 0.5 };
    } else {
      const next = nextTile(tx, ty, field);
      if (!next) {
        // Шляху немає: кіт лишається, де є.
        cat.act.goal = null;
        break;
      }
      target = { x: next.x + 0.5, y: next.y + 0.5 };
    }
    const dx = target.x - cat.x;
    const dy = target.y - cat.y;
    const distance = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.01) cat.facing = Math.sign(dx);
    if (distance <= budget) {
      cat.x = target.x;
      cat.y = target.y;
      budget -= distance;
      if (tx === goal.x && ty === goal.y) cat.act.goal = null;
    } else {
      cat.x += (dx / distance) * budget;
      cat.y += (dy / distance) * budget;
      budget = 0;
    }
  }
  return budget / speed;
}

export const tileOf = (p: Vec): Vec => ({ x: Math.floor(p.x), y: Math.floor(p.y) });

/** Випадкова прохідна клітинка квартири, яку не закриває передня стіна. */
export function randomFloor(rng: Rng): Vec {
  for (let i = 0; i < 50; i++) {
    const x = rng.int(1, MAP_WIDTH - 2);
    const y = rng.int(1, MAP_HEIGHT - 2);
    if (!isSolid(x, y) && !hiddenTile(x, y)) return { x, y };
  }
  return { x: 3, y: 7 };
}

/** Найближча до точки видима клітинка підлоги: туди падає безлад. */
export function visibleFloorNear(p: Vec): Vec {
  const tx = Math.floor(p.x);
  const ty = Math.floor(p.y);
  if (!isSolid(tx, ty) && !hiddenTile(tx, ty)) return p;
  for (let r = 1; r < 4; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = tx + dx;
        const y = ty + dy;
        if (!isSolid(x, y) && !hiddenTile(x, y)) return { x: x + 0.5, y: y + 0.5 };
      }
    }
  }
  return { x: 3.5, y: 7.5 };
}
