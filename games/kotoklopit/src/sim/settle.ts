// Речі, які ставить гра (§8.7, «Що ставить гра»): сховище, ящики біля входу, переноска, велика коробка й база нового робота стають
// на своє місце, а зайняте — на найближчу вільну клітинку; уночі зсунуте вертається, якщо місце звільнилося.

import {
  BIG_BOX,
  BIG_BOX_SCRATCH,
  blocksPerson,
  BOX_SCRATCH,
  CABINET_PAW,
  distanceToRect,
  GAME_THINGS,
  hiddenTile,
  isSolid,
  isWall,
  itemPoint,
  MAP_HEIGHT,
  MAP_WIDTH,
  nearestFreePlace,
  objectsOf,
  occupied,
  PLACES,
  placeAt,
  placeFree,
  robotDockAt,
  robotDocked,
  SPAWN,
  thingHome,
  thingPresent,
  thingShift,
  type Place,
} from "./home";
import type { GameState, GameThing, Vec } from "./types";

/** Тверді для персонажа речі гри: не перекривати ними прохід і підступ до меблів. Переноска — ні. */
const SOLID: ReadonlySet<GameThing> = new Set<GameThing>(["cat-cabinet", "litter-bag", "sterile-bin", "cat-kit", "boxes", "big-box"]);

/**
 * Де стоїть персонаж, користуючись річчю, — клітинка відносно неї (як `use` у `view/world/objects.ts`; збіг перевіряє
 * `tests/gamethings.test.ts`). Велика коробка — лише для котів.
 */
const FRONT: Partial<Record<GameThing, Vec>> = {
  "cat-cabinet": { x: 0, y: 1 },
  "litter-bag": { x: 0, y: 1 },
  "cat-kit": { x: 0, y: 1 },
  "sterile-bin": { x: -1, y: 0 },
  boxes: { x: 0, y: 1 },
};

/**
 * Звідки кіт лапає шафку чи дере ящики й велику коробку (`CABINET_PAW`, `BOX_SCRATCH`, `BIG_BOX_SCRATCH`) — клітинка відносно
 * речі: там має бути прохідна підлога, інакше кіт туди не дійде.
 */
const SIDE: Partial<Record<GameThing, Vec>> = {
  "cat-cabinet": { x: CABINET_PAW.x - thingHome("cat-cabinet").x, y: CABINET_PAW.y - thingHome("cat-cabinet").y },
  boxes: { x: BOX_SCRATCH.x - thingHome("boxes").x, y: BOX_SCRATCH.y - thingHome("boxes").y },
  "big-box": { x: BIG_BOX_SCRATCH.x - BIG_BOX.x, y: BIG_BOX_SCRATCH.y - BIG_BOX.y },
};

const key = (x: number, y: number): string => `${x},${y}`;

/** Клітинки, куди персонаж дійде від ліжка. */
function reachable(state: GameState): Set<string> {
  const start = { x: Math.floor(SPAWN.x), y: Math.floor(SPAWN.y) };
  const seen = new Set([key(start.x, start.y)]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const t = queue[head]!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = t.x + dx;
      const y = t.y + dy;
      if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT || seen.has(key(x, y)) || blocksPerson(state, x, y)) continue;
      seen.add(key(x, y));
      queue.push({ x, y });
    }
  }
  return seen;
}

/** Поставити річ гри на клітинку `tile` (null — на своє місце). */
function put(state: GameState, thing: GameThing, tile: Vec | null): void {
  if (tile !== null) {
    (state.home.displaced ??= {})[thing] = { x: tile.x, y: tile.y };
    return;
  }
  const displaced = state.home.displaced;
  if (!displaced?.[thing]) return;
  delete displaced[thing];
  if (Object.keys(displaced).length === 0) delete state.home.displaced;
}

/**
 * Тверда річ гри, поставлена на `tile` (null — на своє місце), не заважає персонажу (§8.7): усе, куди він доходив до цього
 * (`before`), — досяжне й далі, крім самої клітинки; перед річчю можна стати; а `strict` — ще й не впритул до меблів, якими він
 * користується. Річ лишається там, куди її перевіряли, — хто викликав, ставить її, куди треба.
 */
function keepsWay(state: GameState, thing: GameThing, tile: Vec | null, before: Set<string>, strict: boolean): boolean {
  put(state, thing, tile);
  const at = tile ?? thingHome(thing);
  const after = reachable(state);
  for (const t of before) if (t !== key(at.x, at.y) && !after.has(t)) return false;
  const front = FRONT[thing];
  if (front && !after.has(key(at.x + front.x, at.y + front.y))) return false;
  const side = SIDE[thing];
  if (side && (isWall(at.x + side.x, at.y + side.y) || isSolid(state, at.x + side.x, at.y + side.y))) return false;
  if (!strict) return true;
  const center = { x: at.x + 0.5, y: at.y + 0.5 };
  return !objectsOf(state).some((o) => o.interactive && o.id !== thing && distanceToRect(center, o) <= 0.5);
}

/** Найближча до свого місця вільна клітинка, яку видно, де річ гри нікому не заважає; null — такої немає. */
function spotFor(state: GameState, thing: GameThing): Vec | null {
  const home = thingHome(thing);
  const candidates = PLACES.filter((p) => !hiddenTile(p.x, p.y) && (p.x !== home.x || p.y !== home.y) && placeFree(state, p, thing)).sort(
    (a, b) => Math.hypot(a.x - home.x, a.y - home.y) - Math.hypot(b.x - home.x, b.y - home.y),
  );
  if (!SOLID.has(thing)) return candidates[0] ?? null;
  const before = reachable(state);
  // Спершу — не впритул до меблів; ніде так не можна — бодай не перекривши проходу.
  for (const strict of [true, false]) {
    const found = candidates.find((p) => keepsWay(state, thing, p, before, strict));
    put(state, thing, null);
    if (found) return { x: found.x, y: found.y };
  }
  return null;
}

/** Своє місце речі гри — клітинка для речей (усі такі); якщо ні — вважаємо вільним. */
function homePlace(thing: GameThing): Place | null {
  const home = thingHome(thing);
  return placeAt(home.x, home.y);
}

/**
 * Щокроку: щойно поставлене гра ставить на вільне місце, а зникле забуває зсув. Своє місце «зайняте» лише тим, що туди ставить
 * гравець чи гра (річ котячого кутка, автогодівниця, база робота, пилосос, інша річ гри): іграшка чи безлад, що опинилися на речі,
 * яка вже стоїть, її не зсувають.
 */
export function settleThings(state: GameState): void {
  for (const thing of GAME_THINGS) {
    if (!thingPresent(state, thing)) {
      put(state, thing, null);
      continue;
    }
    if (state.home.displaced?.[thing]) continue;
    const home = homePlace(thing);
    if (home === null || !occupied(state, home, thing)) continue;
    const spot = spotFor(state, thing);
    if (spot) put(state, thing, spot);
  }
  settleRobot(state);
  freeToys(state);
}

/** База робота, що опинилася на зайнятій клітинці (новий робот на старому місці бази), — на найближчу вільну, яку видно. */
function settleRobot(state: GameState): void {
  if (!robotDocked(state)) return;
  const dock = robotDockAt(state);
  const place = placeAt(Math.floor(dock.x), Math.floor(dock.y));
  if (place === null || !occupied(state, place, "robot")) return;
  const free = nearestFreePlace(state, { x: place.x + 0.5, y: place.y + 0.5 }, (c) => !hiddenTile(Math.floor(c.x), Math.floor(c.y)));
  if (free) state.home.robotDock = { x: free.x + 0.5, y: free.y + 0.5 };
}

/** Іграшка всередині твердої речі гри (сховище, велика коробка) — на найближчу вільну клітинку: інакше її не дістати. */
function freeToys(state: GameState): void {
  for (const item of state.home.items) {
    if (item.kind !== "toy" || item.hidden !== undefined) continue;
    const at = itemPoint(item);
    const tile = { x: Math.floor(at.x), y: Math.floor(at.y) };
    if (!GAME_THINGS.some((t) => SOLID.has(t) && t !== "boxes" && standsOn(state, t, tile))) continue;
    const place = nearestFreePlace(state, at);
    if (!place) continue;
    item.x = place.x + 0.5;
    item.y = place.y + 0.5;
  }
}

function standsOn(state: GameState, thing: GameThing, tile: Vec): boolean {
  if (!thingPresent(state, thing)) return false;
  const home = thingHome(thing);
  const shift = thingShift(state, thing);
  return home.x + shift.x === tile.x && home.y + shift.y === tile.y;
}

/** Уранці: зсунуте повертається на своє місце, якщо воно вільне й річ там нікому не заважатиме. */
export function restoreThings(state: GameState): void {
  for (const thing of GAME_THINGS) {
    const current = state.home.displaced?.[thing];
    if (!current) continue;
    if (!thingPresent(state, thing)) {
      put(state, thing, null);
      continue;
    }
    const home = homePlace(thing);
    if (home !== null && !placeFree(state, home, thing)) continue;
    if (SOLID.has(thing)) {
      const before = reachable(state);
      if (!keepsWay(state, thing, null, before, false)) {
        put(state, thing, current);
        continue;
      }
    } else put(state, thing, null);
    carryCats(state, current, thingHome(thing));
  }
}

/** Хто спить у речі чи сидить на ній (клітинка `from`), переїжджає разом із нею на `to` — і туди, куди йшов на ній. */
function carryCats(state: GameState, from: Vec, to: Vec): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const on = (p: Vec): boolean => Math.floor(p.x) === from.x && Math.floor(p.y) === from.y;
  for (const cat of state.cats) {
    if (cat.away !== null) continue;
    if (on(cat)) {
      cat.x += dx;
      cat.y += dy;
    }
    const goal = cat.act.goal;
    if (goal && on(goal)) cat.act.goal = { x: goal.x + dx, y: goal.y + dy };
  }
}
