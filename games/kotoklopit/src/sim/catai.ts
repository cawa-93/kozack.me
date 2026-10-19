// Поведінка котів (§9.3, §9.12): потреби, сутінковий ритм, рух квартирою й дії котів.
// Рішення приймаються, коли дія закінчилася чи з'явилася нагальна потреба, тож десятки котів
// не навантажують кадр (§8.5).

import { changeMood, isAdapting, isKitten, isOld, recordMood, traitLevel } from "./cat";
import {
  ACTIVITY_BY_HOUR,
  ADAPTATION_HUNGER,
  APPETITE_STEP,
  BOWL_CAPACITY,
  CAT_ACT_MINUTES,
  CAT_WALK_TILES_PER_MINUTE,
  FURNITURE_COST,
  KITTEN_PLAY,
  LITTER_CAPACITY,
  LOW_CAT_HEALTH,
  MIN_CAT_NAP_MINUTES,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  MOOD,
  NEED_PER_HOUR,
  NEED_THRESHOLD,
  NIGHT_ACTIVITY,
  NOCTURNAL_STEP,
  OLD_PLAY,
  PICKY_REFUSAL_STEP,
  PORTION_HUNGER,
  SCATTER_CHANCE,
  SLEEP_END,
  SLEEP_RECOVERY_PER_HOUR,
  SLEEP_START,
  SLEEP_TRAIT_STEP,
  SURPRISE_CHANCE,
  TIRED_FATIGUE,
  TRAIT_NEED_STEP,
} from "./config";
import { emit } from "./events";
import { hiddenTile, isSolid, isWall, MAP_HEIGHT, MAP_WIDTH, objectById, slotById } from "./home";
import { stateRng, type Rng } from "./rng";
import type { BowlItem, Cat, CatActKind, GameState, HomeItem, LitterItem, MessKind, Vec, WaterItem } from "./types";

/** Хто є поруч із котами: персонаж удома й не спить — до нього можна піти по увагу. */
export interface CatContext {
  present: boolean;
}

const clamp = (value: number, min = 0, max = 100): number => Math.min(max, Math.max(min, value));

/** Година доби 0–24 для хвилини дня. */
export function hourOf(minute: number): number {
  return (((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY) / MINUTES_PER_HOUR;
}

/** Активність кота о цій годині — сутінковий ритм (§9.12). */
export function activityAt(cat: Cat, minute: number): number {
  const hour = hourOf(minute);
  const slot = ACTIVITY_BY_HOUR.find((s) => hour >= s.from && hour < s.to);
  if (slot) return slot.activity;
  return clamp(NIGHT_ACTIVITY + NOCTURNAL_STEP * traitLevel(cat, "nocturnal"), 0, 1);
}

// --- Рух -----------------------------------------------------------------------------------

const FIELDS = new Map<number, Float32Array>();

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

/** Чи дійде кіт до клітинки. */
export function reachable(from: Vec, goal: Vec): boolean {
  const field = fieldTo(goal);
  return (field[Math.floor(from.y) * MAP_WIDTH + Math.floor(from.x)] ?? Infinity) !== Infinity;
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

/** Іти до цілі дії. Повертає хвилини, що лишилися після прибуття. */
function walk(cat: Cat, minutes: number, speed: number): number {
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

// --- Потреби --------------------------------------------------------------------------------

function grow(state: GameState, cat: Cat, minutes: number): void {
  const hours = minutes / MINUTES_PER_HOUR;
  const n = cat.needs;
  const sleeping = cat.act.kind === "sleep" && cat.act.goal === null;
  const appetite = Math.max(0, 1 + APPETITE_STEP * traitLevel(cat, "appetite"));
  n.hunger = clamp(n.hunger + NEED_PER_HOUR.hunger * hours * appetite * (isAdapting(state, cat) ? ADAPTATION_HUNGER : 1));
  n.thirst = clamp(n.thirst + NEED_PER_HOUR.thirst * hours);
  n.toilet = clamp(n.toilet + NEED_PER_HOUR.toilet * hours);
  if (sleeping) {
    n.fatigue = clamp(n.fatigue - SLEEP_RECOVERY_PER_HOUR * hours * Math.max(0.1, 1 - SLEEP_TRAIT_STEP * traitLevel(cat, "sleep")));
  } else {
    const tired = isOld(cat) || cat.health < LOW_CAT_HEALTH ? TIRED_FATIGUE : 1;
    n.fatigue = clamp(n.fatigue + NEED_PER_HOUR.fatigue * hours * tired);
  }
  const attention = Math.max(0, 1 + TRAIT_NEED_STEP * (traitLevel(cat, "affection") + traitLevel(cat, "demanding")));
  n.attention = clamp(n.attention + NEED_PER_HOUR.attention * hours * attention);
  const age = isKitten(cat) ? KITTEN_PLAY : isOld(cat) ? OLD_PLAY : 1;
  const energy = Math.max(0, 1 + TRAIT_NEED_STEP * traitLevel(cat, "energy"));
  n.play = clamp(n.play + NEED_PER_HOUR.play * hours * activityAt(cat, state.minute) * energy * age);
}

/** Потреби на межі псують настрій щогодини (§9.12). */
function needsMood(state: GameState, cat: Cat, minutes: number, context: CatContext): void {
  const hours = minutes / MINUTES_PER_HOUR;
  if (cat.needs.hunger >= 100) changeMood(state, cat, MOOD.starvingPerHour * hours);
  if (cat.needs.thirst >= 100) changeMood(state, cat, MOOD.starvingPerHour * hours);
  if (context.present && cat.needs.attention >= 100) changeMood(state, cat, MOOD.ignoredPerHour * hours);
}

// --- Рішення --------------------------------------------------------------------------------

function start(cat: Cat, kind: CatActKind, goal: Vec | null, minutes: number, target: string | null = null): void {
  cat.act = { kind, target, goal, minutes, elapsed: 0 };
}

const tileOf = (p: Vec): Vec => ({ x: Math.floor(p.x), y: Math.floor(p.y) });

function itemTile(item: HomeItem): Vec {
  const slot = slotById(item.slot);
  return { x: slot.x, y: slot.y };
}

function nearest<T extends HomeItem>(cat: Cat, items: readonly T[]): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const item of items) {
    const tile = itemTile(item);
    const distance = Math.hypot(tile.x + 0.5 - cat.x, tile.y + 0.5 - cat.y);
    if (distance < bestDistance) {
      best = item;
      bestDistance = distance;
    }
  }
  return best;
}

const itemsOf = <K extends HomeItem["kind"]>(state: GameState, kind: K): Extract<HomeItem, { kind: K }>[] =>
  state.home.items.filter((i): i is Extract<HomeItem, { kind: K }> => i.kind === kind);

export function litterCapacity(box: LitterItem): number {
  return LITTER_CAPACITY[box.litter ?? "none"];
}

export function isDirty(box: LitterItem): boolean {
  return box.uses >= litterCapacity(box);
}

/** Поріг голоду: «Апетит» змушує їсти раніше (§9.12). */
function hungerThreshold(cat: Cat): number {
  return NEED_THRESHOLD.hunger - 10 * Math.max(0, traitLevel(cat, "appetite"));
}

function sleepThreshold(cat: Cat, minute: number): number {
  return SLEEP_START.base + SLEEP_START.activity * activityAt(cat, minute);
}

/** Чи є нагальна потреба, заради якої варто кинути спокійну дію. */
function urgent(state: GameState, cat: Cat): boolean {
  const n = cat.needs;
  return n.toilet >= NEED_THRESHOLD.toilet || n.hunger >= hungerThreshold(cat) || n.thirst >= NEED_THRESHOLD.thirst || n.fatigue >= sleepThreshold(cat, state.minute);
}

/** Випадкова прохідна клітинка квартири, яку не закриває передня стіна. */
export function randomFloor(rng: Rng): Vec {
  for (let i = 0; i < 50; i++) {
    const x = rng.int(1, MAP_WIDTH - 2);
    const y = rng.int(1, MAP_HEIGHT - 2);
    if (!isSolid(x, y) && !hiddenTile(x, y)) return { x, y };
  }
  return { x: 3, y: 7 };
}

/** Сонячна пляма у вітальні мандрує за годиною (§9.3). */
export function sunSpot(minute: number): Vec | null {
  const hour = hourOf(minute);
  if (hour >= 8 && hour < 11) return { x: 3, y: 9 };
  if (hour >= 11 && hour < 15) return { x: 8, y: 9 };
  if (hour >= 15 && hour < 18) return { x: 16, y: 8 };
  return null;
}

/** Місця для сну з вагою (§9.3): ліжко, диван, сонячна пляма, будь-де на підлозі. */
function sleepSpot(state: GameState, cat: Cat, rng: Rng): Vec {
  const bed = objectById("bed");
  const sofa = objectById("sofa");
  const options: { tile: Vec; weight: number }[] = [
    { tile: { x: bed.x + rng.int(0, bed.w - 1), y: bed.y + rng.int(0, bed.h - 1) }, weight: 3 },
    { tile: { x: sofa.x + rng.int(0, sofa.w - 1), y: sofa.y }, weight: 3 },
    { tile: randomFloor(rng), weight: 1 },
  ];
  const sun = sunSpot(state.minute);
  if (sun) options.push({ tile: sun, weight: 2 + Math.max(0, traitLevel(cat, "warmth")) });
  let roll = rng.next() * options.reduce((s, o) => s + o.weight, 0);
  for (const option of options) {
    roll -= option.weight;
    if (roll < 0) return option.tile;
  }
  return options[0]?.tile ?? randomFloor(rng);
}

/** Сховатися під ліжком чи диваном (§9.6). */
function hideSpot(rng: Rng): Vec {
  const spot = objectById(rng.chance(0.5) ? "bed" : "sofa");
  return { x: spot.x + rng.int(0, spot.w - 1), y: spot.y + rng.int(0, spot.h - 1) };
}

/** Обрати наступну дію (§9.12): туалет, їжа, вода, сон, адаптація, увага, гра, відпочинок. */
export function decide(state: GameState, cat: Cat, rng: Rng, context: CatContext): void {
  const n = cat.needs;
  if (n.toilet >= NEED_THRESHOLD.toilet) {
    const boxes = itemsOf(state, "litter");
    const box = nearest(cat, boxes.filter((b) => !isDirty(b))) ?? nearest(cat, boxes);
    if (box) return start(cat, "toilet", itemTile(box), CAT_ACT_MINUTES.toilet, `item:${box.id}`);
    // Лотка немає: «сюрприз» деінде.
    return start(cat, "toilet", randomFloor(rng), CAT_ACT_MINUTES.toilet, null);
  }
  if (n.hunger >= hungerThreshold(cat)) {
    const bowls = itemsOf(state, "bowl");
    const full = nearest(cat, bowls.filter((b) => b.food > 0));
    if (full) return start(cat, "eat", itemTile(full), CAT_ACT_MINUTES.eat, `item:${full.id}`);
    const empty = nearest(cat, bowls);
    if (context.present && rng.chance(0.5)) return startAttention(state, cat);
    if (empty) return start(cat, "beg", itemTile(empty), CAT_ACT_MINUTES.beg, `item:${empty.id}`);
  }
  if (n.thirst >= NEED_THRESHOLD.thirst) {
    const waters = itemsOf(state, "water");
    const water = nearest(cat, waters.filter((w) => w.water > 0)) ?? nearest(cat, waters);
    if (water) return start(cat, water.water > 0 ? "drink" : "beg", itemTile(water), water.water > 0 ? CAT_ACT_MINUTES.drink : CAT_ACT_MINUTES.beg, `item:${water.id}`);
  }
  if (n.fatigue >= sleepThreshold(cat, state.minute)) {
    const spot = cat.health < 25 || isAdapting(state, cat) ? hideSpot(rng) : sleepSpot(state, cat, rng);
    return start(cat, "sleep", spot, 8 * MINUTES_PER_HOUR);
  }
  if (isAdapting(state, cat)) return start(cat, "hide", hideSpot(rng), CAT_ACT_MINUTES.hide);
  if (context.present && n.attention >= NEED_THRESHOLD.attention) return startAttention(state, cat);
  if (n.play >= NEED_THRESHOLD.play) return start(cat, "wander", randomFloor(rng), CAT_ACT_MINUTES.wander);
  if (rng.chance(0.4)) return start(cat, "wander", randomFloor(rng), CAT_ACT_MINUTES.wander);
  start(cat, "idle", null, CAT_ACT_MINUTES.idle * (0.5 + rng.next()));
}

/** Кіт іде до персонажа по увагу й ходить слідом, нявкаючи (§9.12). */
function startAttention(state: GameState, cat: Cat): void {
  start(cat, "attention", tileOf(state.character.body), CAT_ACT_MINUTES.attention, "character");
}

// --- Дії на місці ---------------------------------------------------------------------------

function itemById<T extends HomeItem>(state: GameState, target: string | null): T | null {
  if (!target?.startsWith("item:")) return null;
  const id = Number(target.slice(5));
  return (state.home.items.find((i) => i.id === id) as T | undefined) ?? null;
}

/** Річ дорога — настрій трохи краще, дешева — трохи гірше (§6.4, §9.12). */
function itemMood(state: GameState, cat: Cat, item: HomeItem): void {
  changeMood(state, cat, item.quality === "premium" ? MOOD.premiumItem : MOOD.cheapItem);
}

/** Безлад на клітинці поруч із котом. */
export function addMess(state: GameState, kind: MessKind, at: Vec, cat: number | null): void {
  const mess = { id: state.nextId++, kind, x: at.x, y: at.y, cat };
  state.home.messes.push(mess);
  emit(state, { type: "mess", mess });
}

/** Місця для «сюрпризу», коли лоток брудний (§9.12): біля ліжка, у кутку вітальні, на кухні. */
function surpriseSpot(rng: Rng): Vec {
  const spots: Vec[] = [
    { x: 3.5, y: 1.6 },
    { x: 1.5, y: 7.5 },
    { x: 18.5, y: 7.5 },
    { x: 5.5, y: 3.5 },
  ];
  const spot = spots[rng.int(0, spots.length - 1)] ?? { x: 1.5, y: 7.5 };
  return { x: spot.x + (rng.next() - 0.5) * 0.4, y: spot.y + (rng.next() - 0.5) * 0.4 };
}

/** Дія закінчилася на місці: що змінилося для кота й квартири. */
function finish(state: GameState, cat: Cat, rng: Rng): void {
  const act = cat.act;
  switch (act.kind) {
    case "eat": {
      const bowl = itemById<BowlItem>(state, act.target);
      if (!bowl || bowl.food <= 0) return;
      const picky = traitLevel(cat, "picky");
      if (bowl.foodQuality === "cheap" && picky > 0 && rng.chance(PICKY_REFUSAL_STEP * picky)) {
        changeMood(state, cat, MOOD.pickyRefusal, "відмовився від дешевого корму");
        emit(state, { type: "cat-refused-food", cat: cat.id });
        return start(cat, "beg", itemTile(bowl), CAT_ACT_MINUTES.beg, act.target);
      }
      bowl.food -= 1;
      const quality = bowl.foodQuality ?? "cheap";
      if (bowl.food <= 0) bowl.foodQuality = null;
      cat.needs.hunger = Math.max(0, cat.needs.hunger - PORTION_HUNGER);
      changeMood(state, cat, quality === "premium" ? MOOD.premiumFood : MOOD.cheapFood, quality === "premium" ? "дорогий корм" : undefined);
      itemMood(state, cat, bowl);
      emit(state, { type: "cat-ate", cat: cat.id, quality });
      return;
    }
    case "drink": {
      const water = itemById<WaterItem>(state, act.target);
      if (!water || water.water <= 0) return;
      water.water -= 1;
      cat.needs.thirst = 0;
      itemMood(state, cat, water);
      return;
    }
    case "toilet": {
      cat.needs.toilet = 0;
      const box = itemById<LitterItem>(state, act.target);
      if (!box) {
        addMess(state, "surprise", { x: cat.x, y: cat.y }, cat.id);
        return;
      }
      if (isDirty(box)) {
        changeMood(state, cat, MOOD.dirtyLitter, "брудний лоток");
        const picky = traitLevel(cat, "litterPicky");
        if (rng.chance(SURPRISE_CHANCE.base + SURPRISE_CHANCE.step * Math.max(0, picky))) {
          addMess(state, "surprise", surpriseSpot(rng), cat.id);
          return;
        }
      }
      box.uses += 1;
      itemMood(state, cat, box);
      const scatter = traitLevel(cat, "scatter");
      if (rng.chance(SCATTER_CHANCE.base + SCATTER_CHANCE.step * scatter)) {
        const slot = slotById(box.slot);
        addMess(state, "litter", { x: slot.x + 0.5 + (rng.next() - 0.5), y: slot.y + 0.5 + rng.next() * 0.4 }, cat.id);
      }
      return;
    }
    case "sleep":
      if (act.elapsed >= MIN_CAT_NAP_MINUTES) changeMood(state, cat, MOOD.restedSleep);
      return;
    case "wander":
      cat.needs.play = Math.max(0, cat.needs.play - 40);
      return;
    default:
      return;
  }
}

/** Щохвилинне на місці: сон до відпочинку, нявкання біля порожньої миски. */
function perform(state: GameState, cat: Cat, minutes: number): void {
  const act = cat.act;
  act.elapsed += minutes;
  if (act.kind === "sleep") {
    const rested = cat.needs.fatigue <= SLEEP_END && act.elapsed >= MIN_CAT_NAP_MINUTES;
    const woken = cat.needs.toilet >= 95 || cat.needs.hunger >= 95;
    if (rested || woken) act.minutes = 0;
  }
  if ((act.kind === "beg" || act.kind === "attention") && Math.floor(act.elapsed / 2) !== Math.floor((act.elapsed - minutes) / 2)) {
    emit(state, { type: "meow", cat: cat.id });
  }
  if (act.kind === "attention" && cat.needs.attention < 20) act.minutes = 0;
}

const SPEED: Partial<Record<CatActKind, number>> = {};

/** Кіт на руках персонажа: стоїть на місці, але потреби ростуть. */
export function isCarried(state: GameState, cat: Cat): boolean {
  const held = state.character.held;
  return held?.kind === "cat" && held.cat === cat.id;
}

/** Хвилини життя одного кота. */
function tickCat(state: GameState, cat: Cat, minutes: number, rng: Rng, context: CatContext): void {
  grow(state, cat, minutes);
  needsMood(state, cat, minutes, context);
  recordMood(cat, minutes);
  if (cat.away !== null || isCarried(state, cat)) return;
  // Спокійну дію кіт кидає заради нагальної потреби.
  const calm = cat.act.kind === "idle" || cat.act.kind === "wander" || cat.act.kind === "hide" || cat.act.kind === "attention";
  if (calm && urgent(state, cat)) decide(state, cat, rng, context);
  if (cat.act.kind === "attention") {
    if (!context.present) cat.act.minutes = 0;
    else {
      // Іти слідом за персонажем.
      const body = state.character.body;
      if (Math.hypot(body.x - cat.x, body.y - cat.y) > 1.2) cat.act.goal = tileOf(body);
    }
  }
  let left = minutes;
  for (let guard = 0; guard < 8 && left > 1e-9; guard++) {
    if (cat.act.goal) {
      left = walk(cat, left, CAT_WALK_TILES_PER_MINUTE * (SPEED[cat.act.kind] ?? 1));
      if (cat.act.goal) break;
      continue;
    }
    const used = Math.min(left, Math.max(0, cat.act.minutes));
    perform(state, cat, used);
    cat.act.minutes -= used;
    left -= used;
    if (cat.act.minutes <= 1e-9) {
      finish(state, cat, rng);
      if (cat.act.minutes <= 1e-9 || cat.act.kind === "idle") decide(state, cat, rng, context);
    }
  }
}

/** Хвилини життя всіх котів удома (§9.3). */
export function tickCats(state: GameState, minutes: number, context: CatContext): void {
  if (state.cats.length === 0) return;
  const rng = stateRng(state, "behavior");
  for (const cat of state.cats) tickCat(state, cat, minutes, rng, context);
}

/** Миска повна? Для персонажа: чи можна ще насипати (§9.12). */
export function bowlFull(bowl: BowlItem): boolean {
  return bowl.food >= BOWL_CAPACITY;
}

