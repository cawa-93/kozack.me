// Речі, які ставить гра (§8.7, «Що ставить гра»): сховище, ящики біля входу, переноска, велика коробка й база нового робота стають
// на своє місце, а зайняте — на найближчу вільну клітинку; уночі ящики й коробка вертаються, якщо місце звільнилося. Сховища й
// переноски гравець переставляє сам (`moving.ts`): куди їх можна поставити, каже `fitsThing`.

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
import type { CarryThing, GameState, GameThing, Vec } from "./types";

/** Ящики й велика коробка: їх гравець не переносить — зсунуті вертаються вранці, а зниклі забувають зсув (§8.7). */
const GAME_ONLY: ReadonlySet<GameThing> = new Set<GameThing>(["boxes", "big-box"]);

/** Тверді для персонажа речі гри: не перекривати ними прохід і підступ до меблів. Переноска — ні. */
const SOLID: ReadonlySet<GameThing> = new Set<GameThing>(["cat-cabinet", "litter-bag", "sterile-bin", "cat-kit", "boxes", "big-box"]);

/**
 * Де стоїть персонаж, користуючись річчю, — клітинка відносно неї (як `use` у `view/world/objects.ts`). Велика коробка — лише для
 * котів.
 */
const FRONT: Partial<Record<GameThing, Vec>> = {
  "cat-cabinet": { x: 0, y: 1 },
  "litter-bag": { x: 0, y: 1 },
  "cat-kit": { x: 0, y: 1 },
  "sterile-bin": { x: -1, y: 0 },
  boxes: { x: 0, y: 1 },
};

/** Боки, з яких персонаж підходить до речі (§8.7, «Сховища й переноски»): спершу перед нею, потім збоку, нарешті ззаду. */
const SIDES: Partial<Record<GameThing, readonly Vec[]>> = Object.fromEntries(
  Object.entries(FRONT).map(([thing, f]) => [thing, [f, { x: f.y, y: f.x }, { x: -f.y, y: -f.x }, { x: -f.x, y: -f.y }]]),
);

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

/** Поставити річ гри на клітинку `tile` (null чи своя клітинка — на своє місце). */
export function put(state: GameState, thing: GameThing, tile: Vec | null): void {
  const home = thingHome(thing);
  if (tile !== null && (tile.x !== home.x || tile.y !== home.y)) {
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
  // До самої речі й до кожної іншої, біля якої стає персонаж, можна підійти бодай з одного боку.
  for (const other of GAME_THINGS) {
    const sides = SIDES[other];
    if (!sides || (other !== thing && !thingPresent(state, other))) continue;
    const t = other === thing ? at : standing(state, other);
    if (!sides.some((d) => after.has(key(t.x + d.x, t.y + d.y)))) return false;
  }
  const side = SIDE[thing];
  if (side && (isWall(at.x + side.x, at.y + side.y) || isSolid(state, at.x + side.x, at.y + side.y))) return false;
  if (!strict) return true;
  const center = { x: at.x + 0.5, y: at.y + 0.5 };
  return !objectsOf(state).some((o) => o.interactive && o.id !== thing && distanceToRect(center, o) <= 0.5);
}

/**
 * Звідки персонаж користується річчю гри (§8.7): бік від її клітинки — перед нею, а коли там стіна чи щось тверде, то збоку чи
 * ззаду; null — у речі немає місця персонажа (переноска, велика коробка).
 */
export function useSide(state: Pick<GameState, "home" | "modifiers" | "today">, thing: GameThing): Vec | null {
  const sides = SIDES[thing];
  if (!sides) return null;
  const at = standing(state, thing);
  return sides.find((d) => !isWall(at.x + d.x, at.y + d.y) && !blocksPerson(state, at.x + d.x, at.y + d.y)) ?? sides[0] ?? null;
}

/** Клітинка, де річ гри стоїть: зсунута чи своя. */
function standing(state: Pick<GameState, "home">, thing: GameThing): Vec {
  const home = thingHome(thing);
  const shift = thingShift(state, thing);
  return { x: home.x + shift.x, y: home.y + shift.y };
}

/** Найближча до того, де річ гри стоїть, вільна клітинка, яку видно, де вона нікому не заважає; null — такої немає. */
function spotFor(state: GameState, thing: GameThing): Vec | null {
  const from = standing(state, thing);
  const original = state.home.displaced?.[thing] ?? null;
  const candidates = PLACES.filter((p) => !hiddenTile(p.x, p.y) && (p.x !== from.x || p.y !== from.y) && placeFree(state, p, thing)).sort(
    (a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y),
  );
  if (!SOLID.has(thing)) return candidates[0] ?? null;
  const before = reachable(state);
  // Спершу — не впритул до меблів; ніде так не можна — бодай не перекривши проходу.
  for (const strict of [true, false]) {
    const found = candidates.find((p) => keepsWay(state, thing, p, before, strict));
    put(state, thing, original);
    if (found) return { x: found.x, y: found.y };
  }
  return null;
}

/**
 * Сховище з рук на клітинці `tile` нікому не заважає (§8.7, «Сховища й переноски»): не перекриває проходу, перед ним можна
 * стати, а збоку від шафки — підлога для кота. Переноска не тверда — їй годиться будь-яка вільна клітинка.
 */
export function fitsThing(state: GameState, thing: CarryThing, tile: Vec): boolean {
  if (!SOLID.has(thing)) return true;
  const carried = state.home.thingCarried;
  const original = state.home.displaced?.[thing] ?? null;
  const before = reachable(state);
  // Перевіряємо так, наче річ уже стоїть там: у руках її для квартири немає.
  delete state.home.thingCarried;
  const fits = keepsWay(state, thing, tile, before, false);
  if (carried !== undefined) state.home.thingCarried = carried;
  put(state, thing, original);
  return fits;
}

/** Своє місце речі гри — клітинка для речей (усі такі); якщо ні — вважаємо вільним. */
function homePlace(thing: GameThing): Place | null {
  const home = thingHome(thing);
  return placeAt(home.x, home.y);
}

/**
 * Щокроку: щойно поставлене гра ставить на вільне місце; зниклі ящики й коробка забувають зсув, а переноски, яких не лишилося, —
 * ні: нові з'являться там, де стояли. Місце «зайняте» лише тим, що туди ставить гравець чи гра (річ котячого кутка,
 * автогодівниця, база робота, пилосос, інша річ гри): поки річ стоїть, туди нічого такого не поставити, тож зайнятим воно буває
 * лише тоді, коли річ щойно з'явилася. Іграшка чи безлад на речі її не зсувають.
 */
export function settleThings(state: GameState): void {
  for (const thing of GAME_THINGS) {
    if (!thingPresent(state, thing)) {
      // У руках річ теж «немає», але своє місце вона пам'ятає.
      if (GAME_ONLY.has(thing)) put(state, thing, null);
      continue;
    }
    const at = standing(state, thing);
    const place = placeAt(at.x, at.y);
    if (place === null || !occupied(state, place, thing)) continue;
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

/** Уранці: зсунуті ящики й велика коробка повертаються на своє місце, якщо воно вільне й річ там нікому не заважатиме. */
export function restoreThings(state: GameState): void {
  for (const thing of GAME_THINGS) {
    const current = state.home.displaced?.[thing];
    if (!current || !GAME_ONLY.has(thing)) continue;
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
