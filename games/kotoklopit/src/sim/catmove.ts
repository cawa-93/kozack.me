// Рух котів квартирою (§9.3): шляхи сіткою клітинок, меблі, на які можна застрибнути,
// і місця на підлозі, які видно гравцеві.

import { FURNITURE_COST } from "./config";
import { hiddenTile, isFixedSolid, isSolid, isWall, MAP_HEIGHT, MAP_WIDTH, type Rect } from "./home";
import type { Rng } from "./rng";
import type { Cat, GameState, Vec } from "./types";

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
  return isFixedSolid(x, y) ? FURNITURE_COST : 1;
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
  const { left, arrived } = stepTo(cat, goal, minutes, speed);
  if (arrived) cat.act.goal = null;
  return left;
}

/**
 * Іти до клітинки `goal` шляхом сіткою зі швидкістю (клітинок за хвилину) — не чіпаючи цілі дії: так коти бігають у грі (§9.4,
 * «Гру й вилизування видно»). `arrived` — дійшов до середини клітинки (або шляху немає, і кіт лишився, де є); `left` — хвилини, що
 * лишилися.
 */
export function stepTo(cat: Cat, goal: Vec, minutes: number, speed: number): { left: number; arrived: boolean } {
  const field = fieldTo(goal);
  let budget = speed * minutes;
  let arrived = false;
  for (let guard = 0; guard < 64 && budget > 1e-9 && !arrived; guard++) {
    const tx = Math.floor(cat.x);
    const ty = Math.floor(cat.y);
    let target: Vec;
    if (tx === goal.x && ty === goal.y) {
      target = { x: goal.x + 0.5, y: goal.y + 0.5 };
    } else {
      const next = nextTile(tx, ty, field);
      if (!next) {
        // Шляху немає: кіт лишається, де є.
        arrived = true;
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
      if (tx === goal.x && ty === goal.y) arrived = true;
    } else {
      cat.x += (dx / distance) * budget;
      cat.y += (dy / distance) * budget;
      budget = 0;
    }
  }
  return { left: budget / speed, arrived };
}

export const tileOf = (p: Vec): Vec => ({ x: Math.floor(p.x), y: Math.floor(p.y) });

/**
 * Остання клітинка шляху до цілі, що ще лежить у прямокутнику (§9.12): «Сам по собі» доходить лише до виходу зі
 * своєї кімнати в бік персонажа й чекає там — біля дверей, а не біля найближчої до персонажа стіни (перевірка
 * 2026-10-25). Шляху немає — кіт лишається, де є.
 */
export function lastTileWithin(from: Vec, goal: Vec, area: Rect): Vec {
  const field = fieldTo(goal);
  let tile = tileOf(from);
  for (let guard = 0; guard < MAP_WIDTH * MAP_HEIGHT; guard++) {
    const next = nextTile(tile.x, tile.y, field);
    if (!next || next.x < area.x || next.x >= area.x + area.w || next.y < area.y || next.y >= area.y + area.h) return tile;
    tile = next;
  }
  return tile;
}

/**
 * Клітинка підлоги, центр якої приблизно за `keep` клітинок від `center`, — з боку `from` (§9.12, «Тертя об ноги»): кіт,
 * що тримає дистанцію, сідає не під ноги, а поруч. Серед видимих вільних клітинок довкола — найближча до цієї відстані,
 * а з рівних — ближча до кота.
 */
export function tileAtDistance(state: GameState, center: Vec, from: Vec, keep: number): Vec {
  let best: Vec = tileOf(from);
  let bestScore = Infinity;
  const reach = Math.ceil(keep) + 2;
  for (let y = Math.floor(center.y) - reach; y <= Math.floor(center.y) + reach; y++) {
    for (let x = Math.floor(center.x) - reach; x <= Math.floor(center.x) + reach; x++) {
      if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT || isSolid(state, x, y) || hiddenTile(x, y)) continue;
      const gap = Math.hypot(x + 0.5 - center.x, y + 0.5 - center.y);
      const score = Math.abs(gap - keep) * 2 + Math.hypot(x + 0.5 - from.x, y + 0.5 - from.y) * 0.3;
      if (score < bestScore) {
        best = { x, y };
        bestScore = score;
      }
    }
  }
  return best;
}

/** Випадкова прохідна клітинка квартири, яку не закриває передня стіна. */
export function randomFloor(rng: Rng): Vec {
  for (let i = 0; i < 50; i++) {
    const x = rng.int(1, MAP_WIDTH - 2);
    const y = rng.int(1, MAP_HEIGHT - 2);
    if (!isFixedSolid(x, y) && !hiddenTile(x, y)) return { x, y };
  }
  return { x: 3, y: 7 };
}

/** Найближча до точки видима клітинка підлоги: туди падає безлад. */
export function visibleFloorNear(state: GameState, p: Vec): Vec {
  const tx = Math.floor(p.x);
  const ty = Math.floor(p.y);
  if (!isSolid(state, tx, ty) && !hiddenTile(tx, ty)) return p;
  for (let r = 1; r < 4; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = tx + dx;
        const y = ty + dy;
        if (!isSolid(state, x, y) && !hiddenTile(x, y)) return { x: x + 0.5, y: y + 0.5 };
      }
    }
  }
  return { x: 3.5, y: 7.5 };
}
