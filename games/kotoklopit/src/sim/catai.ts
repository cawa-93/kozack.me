// Поведінка котів (§9.3, §9.12): потреби, сутінковий ритм, вибір дії, гра, бешкет і кіт біля роботи.
// Рішення приймаються, коли дія закінчилася чи з'явилася нагальна потреба, тож десятки котів
// не навантажують кадр (§8.5).

import { stun } from "./body";
import { changeHealth, changeMood, isAdapting, isKitten, isOld, recordMood, traitLevel } from "./cat";
import { randomFloor, tileOf, visibleFloorNear, walk } from "./catmove";
import { changeStat, unpleasantTask } from "./character";
import {
  ACTIVITY_BY_HOUR,
  ADAPTATION_HUNGER,
  APPETITE_STEP,
  BOWL_CAPACITY,
  CAT_ACT_MINUTES,
  CAT_WALK_TILES_PER_MINUTE,
  COMPUTER_SLEEP,
  DIFFICULTY,
  ESCAPE,
  HAIRBALL,
  HOUSE_SLEEP,
  HUNGRY_THEFT,
  KITTEN_PLAY,
  LITTER_CAPACITY,
  LOW_CAT_HEALTH,
  MIN_CAT_NAP_MINUTES,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  MISCHIEF,
  MOOD,
  NEED_PER_HOUR,
  NEED_THRESHOLD,
  NIGHT_ACTIVITY,
  NOCTURNAL_STEP,
  OLD_PLAY,
  PICKY_REFUSAL_STEP,
  PLAY_RELIEF,
  PORTION_HUNGER,
  RELATIONS,
  SCATTER_CHANCE,
  SCRATCH,
  SOFA_REPAIR,
  SLEEP_END,
  SLEEP_RECOVERY_PER_HOUR,
  SLEEP_START,
  SLEEP_TRAIT_STEP,
  STEAL_HUNGER,
  SURPRISE_CHANCE,
  TIRED_FATIGUE,
  TOY,
  TRAIT_NEED_STEP,
  VOMIT_STEP,
  WORK_CAT,
  ZOOMIES,
} from "./config";
import { emit } from "./events";
import { itemTile, objectById, slotById, type HomeObject } from "./home";
import { changeRelation, isEnemy, isFriend } from "./relations";
import { stateRng, type Rng } from "./rng";
import type { BowlItem, Cat, CatActKind, Dish, GameState, HomeItem, LitterItem, MessKind, ToyItem, Vec, WaterItem } from "./types";
import { isWorking, stopWork } from "./work";

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

/** Множник риси: 1 + крок × рівень, але не менше нуля. */
const traitFactor = (cat: Cat, group: string, step: number): number => Math.max(0, 1 + step * traitLevel(cat, group));

// --- Потреби --------------------------------------------------------------------------------

function grow(state: GameState, cat: Cat, minutes: number, rng: Rng): void {
  const hours = minutes / MINUTES_PER_HOUR;
  const n = cat.needs;
  const sleeping = cat.act.kind === "sleep" && cat.act.goal === null;
  const appetite = traitFactor(cat, "appetite", APPETITE_STEP);
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
  n.play = clamp(n.play + NEED_PER_HOUR.play * hours * activityAt(cat, state.minute) * traitFactor(cat, "energy", TRAIT_NEED_STEP) * age);
  // Шерстяна грудка: частіше вночі й у довгошерстих (§9.12).
  const hour = hourOf(state.minute);
  const night = hour >= 23 || hour < 5;
  const long = cat.shape.coat === null && !cat.genes.short[0] && !cat.genes.short[1];
  const rate = HAIRBALL.perHour * (night ? HAIRBALL.night : 1) * (long ? HAIRBALL.longHair : 1) * traitFactor(cat, "hairballs", HAIRBALL.step);
  if (rng.chance(rate * hours)) addMess(state, "hairball", visibleFloorNear(cat), cat.id);
}

/** Потреби на межі псують настрій щогодини (§9.12). */
function needsMood(state: GameState, cat: Cat, minutes: number, context: CatContext): void {
  const hours = minutes / MINUTES_PER_HOUR;
  if (cat.needs.hunger >= 100) changeMood(state, cat, MOOD.starvingPerHour * hours);
  if (cat.needs.thirst >= 100) changeMood(state, cat, MOOD.starvingPerHour * hours);
  if (context.present && cat.needs.attention >= 100) changeMood(state, cat, MOOD.ignoredPerHour * hours);
}

// --- Що є в квартирі ------------------------------------------------------------------------

function start(cat: Cat, kind: CatActKind, goal: Vec | null, minutes: number, target: string | null = null): void {
  cat.act = { kind, target, goal, minutes, elapsed: 0 };
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

export const itemsOf = <K extends HomeItem["kind"]>(state: GameState, kind: K): Extract<HomeItem, { kind: K }>[] =>
  state.home.items.filter((i): i is Extract<HomeItem, { kind: K }> => i.kind === kind);

const distance = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Кіт удома й не на руках. */
function home(state: GameState, cat: Cat): boolean {
  return cat.away === null && !isCarried(state, cat);
}

const asleep = (cat: Cat): boolean => cat.act.kind === "sleep" && cat.act.goal === null;

const catById = (state: GameState, target: string | null): Cat | null =>
  target?.startsWith("cat:") ? (state.cats.find((c) => `cat:${c.id}` === target) ?? null) : null;

/** Ресурсів замало (§9.4): кіт сердиться на випадкового іншого кота вдома. */
function resourceConflict(state: GameState, cat: Cat, rng: Rng, enough: boolean): void {
  if (enough) return;
  const r = RELATIONS.resource;
  if (!rng.chance(r.chance + r.territorialStep * Math.max(0, traitLevel(cat, "territorial")))) return;
  const others = state.cats.filter((c) => c.id !== cat.id && c.away === null);
  const other = others[rng.int(0, others.length - 1)];
  if (other) changeRelation(state, cat, other, r.relation);
}

export function litterCapacity(box: LitterItem): number {
  return LITTER_CAPACITY[box.litter ?? "none"];
}

export function isDirty(box: LitterItem): boolean {
  return box.uses >= litterCapacity(box);
}

/** Миска повна? Для персонажа: чи можна ще насипати (§9.12). */
export function bowlFull(bowl: BowlItem): boolean {
  return bowl.food >= BOWL_CAPACITY;
}

/** Кіт на руках персонажа: стоїть на місці, але потреби ростуть. */
export function isCarried(state: GameState, cat: Cat): boolean {
  const held = state.character.held;
  return held?.kind === "cat" && held.cat === cat.id;
}

const inside = (p: Vec, o: HomeObject): boolean => p.x >= o.x && p.x < o.x + o.w && p.y >= o.y && p.y < o.y + o.h;

/** Кіт займає комп'ютер: спить на ньому чи сидить на клавіатурі (§9.12). */
export function catOnComputer(state: GameState): Cat | null {
  const computer = objectById("computer");
  return (
    state.cats.find(
      (c) => c.away === null && c.act.goal === null && (c.act.kind === "sleep" || c.act.kind === "keyboard") && inside(c, computer),
    ) ?? null
  );
}

/** Місця, де лежить людська їжа: стіл, поверхні й плита. Ключ — id речі квартири. */
function dishes(state: GameState, withStove: boolean): { id: string; dish: Dish }[] {
  const found: { id: string; dish: Dish }[] = [];
  for (const [id, dish] of Object.entries(state.home.surfaces)) if (dish) found.push({ id, dish });
  if (withStove && state.home.stove.item) found.push({ id: "stove", dish: state.home.stove.item });
  return found;
}

const objectTile = (id: string): Vec => {
  const o = objectById(id);
  return { x: o.x, y: o.y };
};

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

/** Сонячна пляма у вітальні мандрує за годиною (§9.3). */
export function sunSpot(minute: number): Vec | null {
  const hour = hourOf(minute);
  if (hour >= 8 && hour < 11) return { x: 3, y: 9 };
  if (hour >= 11 && hour < 15) return { x: 8, y: 9 };
  if (hour >= 15 && hour < 18) return { x: 16, y: 8 };
  return null;
}

function weightedPick<T>(rng: Rng, options: readonly { weight: number; value: T }[]): T | null {
  const total = options.reduce((s, o) => s + Math.max(0, o.weight), 0);
  if (total <= 0) return null;
  let roll = rng.next() * total;
  for (const option of options) {
    roll -= Math.max(0, option.weight);
    if (roll < 0) return option.value;
  }
  return options[options.length - 1]?.value ?? null;
}

/** Місце для сну чи схованки; target — будиночок, якщо кіт обрав його. */
interface Spot {
  at: Vec;
  target: string | null;
}

const houseSpots = (state: GameState): { weight: number; value: Spot }[] =>
  itemsOf(state, "house").map((h) => ({ weight: HOUSE_SLEEP[h.quality], value: { at: itemTile(h), target: `item:${h.id}` } }));

/** Місця для сну з вагою (§9.3, §9.12): ліжко, диван, сонячна пляма, комп'ютер, будиночки, будь-де на підлозі. */
function sleepSpot(state: GameState, cat: Cat, rng: Rng): Spot {
  const bed = objectById("bed");
  const sofa = objectById("sofa");
  const at = (p: Vec): Spot => ({ at: p, target: null });
  const options: { weight: number; value: Spot }[] = [
    { weight: 3, value: at({ x: bed.x + rng.int(0, bed.w - 1), y: bed.y + rng.int(0, bed.h - 1) }) },
    { weight: 3, value: at({ x: sofa.x + rng.int(0, sofa.w - 1), y: sofa.y }) },
    { weight: 1, value: at(randomFloor(rng)) },
    ...houseSpots(state),
  ];
  // Сон купкою: до сплячого друга (§9.4).
  for (const friend of state.cats) {
    if (friend.id === cat.id || !home(state, friend) || !asleep(friend) || !isFriend(state, cat, friend)) continue;
    options.push({ weight: RELATIONS.sleepTogether.weight, value: at({ x: friend.x - 0.5 + (rng.next() - 0.5) * 0.6, y: friend.y - 0.5 }) });
  }
  const sun = sunSpot(state.minute);
  if (sun) options.push({ weight: 2 + Math.max(0, traitLevel(cat, "warmth")), value: at(sun) });
  if (!isWorking(state) && !catOnComputer(state)) {
    const computer = objectById("computer");
    const weight = COMPUTER_SLEEP.base + COMPUTER_SLEEP.step * (Math.max(0, traitLevel(cat, "warmth")) + Math.max(0, traitLevel(cat, "helper")));
    options.push({ weight, value: at({ x: computer.x + rng.int(0, computer.w - 1), y: computer.y }) });
  }
  return weightedPick(rng, options) ?? at(randomFloor(rng));
}

/** Сховатися під ліжком, диваном чи в будиночку (§9.6). */
function hideSpot(state: GameState, rng: Rng): Spot {
  const options: { weight: number; value: Spot }[] = houseSpots(state);
  for (const id of ["bed", "sofa"]) {
    const o = objectById(id);
    options.push({ weight: 2, value: { at: { x: o.x + rng.int(0, o.w - 1), y: o.y + rng.int(0, o.h - 1) }, target: null } });
  }
  return weightedPick(rng, options) ?? { at: randomFloor(rng), target: null };
}

// --- Рішення --------------------------------------------------------------------------------

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
  const hungry = n.hunger >= hungerThreshold(cat);
  if (hungry) {
    const bowls = itemsOf(state, "bowl");
    const full = nearest(cat, bowls.filter((b) => b.food > 0));
    if (full) return start(cat, "eat", itemTile(full), CAT_ACT_MINUTES.eat, `item:${full.id}`);
  }
  // Спрага — раніше за прохання їсти: голодний кіт без корму все одно п'є.
  if (n.thirst >= NEED_THRESHOLD.thirst) {
    const waters = itemsOf(state, "water");
    const water = nearest(cat, waters.filter((w) => w.water > 0)) ?? nearest(cat, waters);
    if (water) return start(cat, water.water > 0 ? "drink" : "beg", itemTile(water), water.water > 0 ? CAT_ACT_MINUTES.drink : CAT_ACT_MINUTES.beg, `item:${water.id}`);
  }
  if (hungry) {
    // Миски порожні: злодюжка краде людську їжу, а дуже голодний — будь-який кіт (§9.3).
    const food = dishes(state, true).filter((d) => d.dish.kind !== "burnt");
    const steal = food[rng.int(0, food.length - 1)];
    const thief = Math.max(0, traitLevel(cat, "thief"));
    if (steal && rng.chance(HUNGRY_THEFT.step * thief + (n.hunger >= HUNGRY_THEFT.starving ? HUNGRY_THEFT.base : 0))) {
      return start(cat, "steal", objectTile(steal.id), 1, steal.id);
    }
    const empty = nearest(cat, itemsOf(state, "bowl"));
    if (context.present && rng.chance(0.5)) return startAttention(state, cat);
    if (empty) return start(cat, "beg", itemTile(empty), CAT_ACT_MINUTES.beg, `item:${empty.id}`);
  }
  if (n.fatigue >= sleepThreshold(cat, state.minute)) {
    const spot = cat.health < 25 || isAdapting(state, cat) ? hideSpot(state, rng) : sleepSpot(state, cat, rng);
    return start(cat, "sleep", spot.at, 8 * MINUTES_PER_HOUR, spot.target);
  }
  if (isAdapting(state, cat)) {
    const spot = hideSpot(state, rng);
    return start(cat, "hide", spot.at, CAT_ACT_MINUTES.hide, spot.target);
  }
  if (context.present && n.attention >= NEED_THRESHOLD.attention) return startAttention(state, cat);
  if (n.play >= NEED_THRESHOLD.play) return choosePlay(state, cat, rng);
  // Вилизати друга поруч (§9.4).
  const groom = RELATIONS.groom;
  const friend = state.cats.find((c) => c.id !== cat.id && home(state, c) && isFriend(state, cat, c) && distance(cat, c) <= groom.distance);
  if (friend && rng.chance(groom.chance + groom.step * traitLevel(cat, "grooming"))) {
    return start(cat, "groom", tileOf(friend), groom.minutes, `cat:${friend.id}`);
  }
  if (rng.chance(0.4)) return start(cat, "wander", randomFloor(rng), CAT_ACT_MINUTES.wander);
  start(cat, "idle", null, CAT_ACT_MINUTES.idle * (0.5 + rng.next()));
}

/** Кіт іде до персонажа по увагу й ходить слідом, нявкаючи (§9.12). */
function startAttention(state: GameState, cat: Cat): void {
  start(cat, "attention", tileOf(state.character.body), CAT_ACT_MINUTES.attention, "character");
}

function startZoomies(cat: Cat, rng: Rng): void {
  start(cat, "zoomies", randomFloor(rng), ZOOMIES.minMinutes + rng.next() * (ZOOMIES.maxMinutes - ZOOMIES.minMinutes));
}

/** Кіт хоче гратися (§9.12): зумі, скинути річ, украсти їжу, іграшка чи просто побродити. */
function choosePlay(state: GameState, cat: Cat, rng: Rng): void {
  type Choice = () => void;
  const options: { weight: number; value: Choice }[] = [
    { weight: MISCHIEF.zoomies * traitFactor(cat, "zoomies", MISCHIEF.traitStep) * activityAt(cat, state.minute), value: () => startZoomies(cat, rng) },
    { weight: MISCHIEF.wander, value: () => start(cat, "wander", randomFloor(rng), CAT_ACT_MINUTES.wander) },
  ];
  const onSurfaces = dishes(state, false);
  const knock = onSurfaces[rng.int(0, onSurfaces.length - 1)];
  if (knock) options.push({ weight: MISCHIEF.knock * traitFactor(cat, "knocking", MISCHIEF.traitStep), value: () => start(cat, "knock", objectTile(knock.id), 0.5, knock.id) });
  const food = dishes(state, true).filter((d) => d.dish.kind !== "burnt");
  const steal = food[rng.int(0, food.length - 1)];
  if (steal) {
    const hungry = cat.needs.hunger >= 60 ? 2 : 1;
    options.push({ weight: MISCHIEF.steal * traitFactor(cat, "thief", MISCHIEF.traitStep) * hungry, value: () => start(cat, "steal", objectTile(steal.id), 1, steal.id) });
  }
  const toy = nearest(cat, itemsOf(state, "toy"));
  if (toy) options.push({ weight: MISCHIEF.toy, value: () => start(cat, "toy", itemTile(toy), TOY.aloneMinutes, `item:${toy.id}`) });
  options.push({ weight: MISCHIEF.scratch * traitFactor(cat, "scratching", MISCHIEF.traitStep), value: () => startScratch(state, cat, rng) });
  const mate = playmate(state, cat);
  if (mate) options.push({ weight: RELATIONS.wrestle.weight, value: () => startWrestle(cat, mate) });
  (weightedPick(rng, options) ?? (() => start(cat, "idle", null, CAT_ACT_MINUTES.idle)))();
}

/** Друг, з яким можна погратися: удома, не спить і нічим не зайнятий (§9.4). */
function playmate(state: GameState, cat: Cat): Cat | null {
  let best: Cat | null = null;
  for (const other of state.cats) {
    if (other.id === cat.id || !home(state, other) || !isFriend(state, cat, other)) continue;
    if (other.act.kind !== "idle" && other.act.kind !== "wander" && other.act.kind !== "toy") continue;
    if (!best || distance(cat, other) < distance(cat, best)) best = other;
  }
  return best;
}

/** Боротьба й погоня з другом (§9.4): друг чекає, поки кіт підбіжить. */
function startWrestle(cat: Cat, mate: Cat): void {
  const minutes = RELATIONS.wrestle.minutes;
  start(cat, "wrestle", tileOf(mate), minutes, `cat:${mate.id}`);
  start(mate, "wrestle", null, minutes + distance(cat, mate) / CAT_WALK_TILES_PER_MINUTE, `cat:${cat.id}`);
}

/** Точити кігті (§9.12): на кігтеточці, якщо вона є й кіт її обрав, інакше — на дивані. */
function startScratch(state: GameState, cat: Cat, rng: Rng): void {
  const level = traitLevel(cat, "scratching");
  const posts = itemsOf(state, "scratcher").filter((p) => rng.chance(clamp(SCRATCH[p.quality] - SCRATCH.traitStep * level, 0, 1)));
  const post = nearest(cat, posts);
  if (post) return start(cat, "scratch", itemTile(post), SCRATCH.minutes, `item:${post.id}`);
  const sofa = objectById("sofa");
  start(cat, "scratch", { x: sofa.x + rng.int(0, sofa.w - 1), y: sofa.y - 1 }, SCRATCH.minutes, "sofa");
}

/**
 * Кіт по увагу прийшов до персонажа, що працює (§9.12): сідає на клавіатуру, лягає на коліна
 * чи просто сидить поруч і нявчить.
 */
function arriveAtWork(state: GameState, cat: Cat, rng: Rng): void {
  cat.act.target = "asked";
  const helper = traitLevel(cat, "helper");
  const lap = traitLevel(cat, "lap");
  if (helper > 0 && rng.chance(WORK_CAT.keyboardStep * helper)) {
    const computer = objectById("computer");
    const minutes = WORK_CAT.keyboardMinMinutes + rng.next() * (WORK_CAT.keyboardMaxMinutes - WORK_CAT.keyboardMinMinutes);
    return start(cat, "keyboard", { x: computer.x, y: computer.y }, minutes, "computer");
  }
  if (lap >= 0 && rng.chance(WORK_CAT.lapBase + WORK_CAT.lapStep * lap)) {
    start(cat, "lap", null, MINUTES_PER_HOUR * 4, "character");
    jealousy(state, cat);
  }
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

/** Безлад на підлозі. */
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

/** Людська їжа з місця: зі столу, поверхні чи плити. */
function takeDish(state: GameState, id: string): Dish | null {
  if (id === "stove") {
    const item = state.home.stove.item;
    state.home.stove.item = null;
    state.home.stove.minutes = 0;
    return item;
  }
  const item = state.home.surfaces[id] ?? null;
  state.home.surfaces[id] = null;
  return item;
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
      resourceConflict(state, cat, rng, itemsOf(state, "bowl").length >= state.cats.length);
      // Їсть надто швидко й одразу зригує (§9.3).
      const gulping = traitLevel(cat, "gulping");
      if (gulping > 0 && rng.chance(VOMIT_STEP * gulping)) addMess(state, "vomit", visibleFloorNear({ x: cat.x, y: cat.y + 0.6 }), cat.id);
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
        addMess(state, "surprise", visibleFloorNear(cat), cat.id);
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
      resourceConflict(state, cat, rng, itemsOf(state, "litter").length >= state.cats.length + 1);
      if (rng.chance(SCATTER_CHANCE.base + SCATTER_CHANCE.step * traitLevel(cat, "scatter"))) {
        const slot = slotById(box.slot);
        addMess(state, "litter", { x: slot.x + 0.5 + (rng.next() - 0.5), y: slot.y + 0.7 + rng.next() * 0.2 }, cat.id);
      }
      // Після лотка — часто зумі (§9.3).
      if (rng.chance(ZOOMIES.afterToilet * traitFactor(cat, "zoomies", MISCHIEF.traitStep))) startZoomies(cat, rng);
      return;
    }
    case "sleep": {
      if (act.elapsed >= MIN_CAT_NAP_MINUTES) changeMood(state, cat, MOOD.restedSleep);
      const house = itemById(state, act.target);
      if (house && act.elapsed >= MIN_CAT_NAP_MINUTES) itemMood(state, cat, house);
      return;
    }
    case "wrestle": {
      const w = RELATIONS.wrestle;
      cat.needs.play = Math.max(0, cat.needs.play - w.play);
      changeMood(state, cat, w.mood);
      const mate = catById(state, act.target);
      if (mate) changeRelation(state, cat, mate, w.relation);
      return;
    }
    case "groom": {
      const friend = catById(state, act.target);
      if (!friend || distance(cat, friend) > 1.5) return;
      changeMood(state, cat, RELATIONS.groom.mood);
      changeMood(state, friend, RELATIONS.groom.mood);
      changeRelation(state, cat, friend, RELATIONS.groom.relation);
      emit(state, { type: "groomed", cat: cat.id, friend: friend.id });
      return;
    }
    case "fight":
      // Нерозборонена бійка: можлива травма (§9.4).
      if (rng.chance(RELATIONS.fight.injury)) changeHealth(state, cat, RELATIONS.fight.health, "disease:injury");
      return;
    case "scratch": {
      cat.needs.play = Math.max(0, cat.needs.play - SCRATCH.relief);
      changeMood(state, cat, SCRATCH.mood);
      const post = itemById(state, act.target);
      if (post) itemMood(state, cat, post);
      else state.home.repairs += SOFA_REPAIR;
      emit(state, { type: "scratched", cat: cat.id, sofa: post === null });
      return;
    }
    case "wander":
      cat.needs.play = Math.max(0, cat.needs.play - PLAY_RELIEF * 0.8);
      return;
    case "zoomies":
      cat.needs.play = Math.max(0, cat.needs.play - PLAY_RELIEF);
      return;
    case "knock": {
      if (!act.target) return;
      const dish = state.home.surfaces[act.target];
      if (!dish) return;
      takeDish(state, act.target);
      const o = objectById(act.target);
      addMess(state, "broken", visibleFloorNear({ x: o.x + o.w / 2, y: o.y + o.h + 0.5 }), cat.id);
      changeMood(state, cat, 1);
      cat.needs.play = Math.max(0, cat.needs.play - PLAY_RELIEF);
      emit(state, { type: "knocked", cat: cat.id, object: act.target, item: dish });
      return;
    }
    case "steal": {
      if (!act.target) return;
      const dish = act.target === "stove" ? state.home.stove.item : state.home.surfaces[act.target];
      if (!dish || dish.kind === "burnt") return;
      takeDish(state, act.target);
      cat.needs.hunger = Math.max(0, cat.needs.hunger - STEAL_HUNGER);
      cat.needs.play = Math.max(0, cat.needs.play - PLAY_RELIEF);
      changeMood(state, cat, 2);
      emit(state, { type: "stole", cat: cat.id, object: act.target, item: dish });
      return;
    }
    case "toy": {
      const toy = itemById<ToyItem>(state, act.target);
      cat.needs.play = Math.max(0, cat.needs.play - PLAY_RELIEF);
      if (!toy) return;
      changeMood(state, cat, 1);
      // Іграшка відлітає трохи вбік і зношується.
      const moved = visibleFloorNear({ x: toy.x + (rng.next() - 0.5) * 1.2, y: toy.y + (rng.next() - 0.5) * 1.2 });
      toy.x = moved.x;
      toy.y = moved.y;
      toy.uses += 1;
      if (toy.uses >= TOY.durability[toy.quality]) {
        state.home.items.splice(state.home.items.indexOf(toy), 1);
        emit(state, { type: "toy-broke", toy: toy.id });
      }
      return;
    }
    default:
      return;
  }
}

/** Щохвилинне на місці. */
function perform(state: GameState, cat: Cat, minutes: number, rng: Rng, context: CatContext): void {
  const act = cat.act;
  act.elapsed += minutes;
  switch (act.kind) {
    case "sleep": {
      const rested = cat.needs.fatigue <= SLEEP_END && act.elapsed >= MIN_CAT_NAP_MINUTES;
      const woken = cat.needs.toilet >= 95 || cat.needs.hunger >= 95;
      if (rested || woken) act.minutes = 0;
      return;
    }
    case "beg":
    case "attention":
      if (Math.floor(act.elapsed / 2) !== Math.floor((act.elapsed - minutes) / 2)) emit(state, { type: "meow", cat: cat.id });
      if (act.kind === "attention") {
        if (cat.needs.attention < 20) act.minutes = 0;
        else if (act.target === "character" && context.present && isWorking(state)) arriveAtWork(state, cat, rng);
      }
      return;
    case "keyboard":
      // Кіт на клавіатурі: працювати не вийде (§9.12).
      if (isWorking(state)) {
        stopWork(state);
        emit(state, { type: "keyboard", cat: cat.id });
      }
      return;
    case "lap": {
      const body = state.character.body;
      if (!context.present || !isWorking(state) || cat.needs.attention < 1) {
        act.minutes = 0;
        return;
      }
      cat.x = body.x;
      cat.y = body.y + 0.05;
      changeStat(state, "sanity", WORK_CAT.lapSanity * DIFFICULTY[state.difficulty].catSanity * minutes);
      changeMood(state, cat, WORK_CAT.lapMood * minutes);
      cat.love = clamp(cat.love + WORK_CAT.lapLove * minutes);
      cat.needs.attention = Math.max(0, cat.needs.attention - WORK_CAT.lapAttention * minutes);
      cat.interacted = true;
      return;
    }
    default:
      return;
  }
}

/** Зумі: кіт мчить утричі швидше від однієї точки до іншої й може збити персонажа (§9.12). */
function zoom(state: GameState, cat: Cat, minutes: number, rng: Rng, context: CatContext): number {
  const used = Math.min(minutes, cat.act.minutes);
  walk(cat, used, CAT_WALK_TILES_PER_MINUTE * ZOOMIES.speed);
  cat.act.minutes -= used;
  if (!cat.act.goal && cat.act.minutes > 0) cat.act.goal = randomFloor(rng);
  const body = state.character.body;
  if (context.present && cat.act.target === null && Math.hypot(body.x - cat.x, body.y - cat.y) < ZOOMIES.hit) {
    cat.act.target = "hit";
    stun(state);
    emit(state, { type: "knocked-down", cat: cat.id });
  }
  return minutes - used;
}

/** Кіт повертається зі сходів сам о 22:00 (§9.12). */
function returnFromStairs(state: GameState, cat: Cat): void {
  cat.away = null;
  cat.x = 10.5;
  cat.y = 10.3;
  start(cat, "idle", null, 5);
  changeMood(state, cat, ESCAPE.returnMood, "повернувся сам зі сходів");
  emit(state, { type: "cat-returned", cat: cat.id, caught: false });
}

/** Хвилини життя одного кота. */
function tickCat(state: GameState, cat: Cat, minutes: number, rng: Rng, context: CatContext): void {
  grow(state, cat, minutes, rng);
  needsMood(state, cat, minutes, context);
  recordMood(cat, minutes);
  if (cat.away !== null) {
    if (state.minute >= ESCAPE.returnMinute) returnFromStairs(state, cat);
    return;
  }
  if (isCarried(state, cat)) return;
  // Спокійну дію кіт кидає заради нагальної потреби.
  const calm = cat.act.kind === "idle" || cat.act.kind === "wander" || cat.act.kind === "hide" || cat.act.kind === "attention" || cat.act.kind === "toy";
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
    if (cat.act.kind === "zoomies") {
      left = zoom(state, cat, left, rng, context);
      if (cat.act.minutes <= 1e-9) {
        finish(state, cat, rng);
        decide(state, cat, rng, context);
      }
      continue;
    }
    if (cat.act.goal) {
      left = walk(cat, left, CAT_WALK_TILES_PER_MINUTE);
      if (cat.act.goal) break;
      continue;
    }
    const used = Math.min(left, Math.max(0, cat.act.minutes));
    perform(state, cat, used, rng, context);
    cat.act.minutes -= used;
    left -= used;
    if (cat.act.minutes <= 1e-9) {
      const kind = cat.act.kind;
      finish(state, cat, rng);
      // Дія, яку почала `finish` (зумі після лотка, прохання їсти), лишається.
      if (cat.act.kind === kind || cat.act.minutes <= 1e-9) decide(state, cat, rng, context);
    }
  }
}

/** Хвилини життя всіх котів удома (§9.3). */
export function tickCats(state: GameState, minutes: number, context: CatContext): void {
  if (state.cats.length === 0) return;
  const rng = stateRng(state, "behavior");
  for (const cat of state.cats) tickCat(state, cat, minutes, rng, context);
  if (state.cats.length > 1) tickRelations(state, minutes, rng);
}

/** Між котами (§9.4): сон купкою, бійки ворогів, сусідство з ворогом. */
function tickRelations(state: GameState, minutes: number, rng: Rng): void {
  const hours = minutes / MINUTES_PER_HOUR;
  const fight = RELATIONS.fight;
  const cats = state.cats.filter((c) => home(state, c));
  const enemyNear = new Set<number>();
  for (let i = 0; i < cats.length; i++) {
    const a = cats[i];
    if (!a) continue;
    for (let j = i + 1; j < cats.length; j++) {
      const b = cats[j];
      if (!b) continue;
      if (isFriend(state, a, b)) {
        if (asleep(a) && asleep(b) && distance(a, b) <= RELATIONS.sleepTogether.distance) changeRelation(state, a, b, RELATIONS.sleepTogether.perHour * hours);
        continue;
      }
      if (!isEnemy(state, a, b)) continue;
      if (!asleep(a)) enemyNear.add(a.id);
      if (!asleep(b)) enemyNear.add(b.id);
      if (asleep(a) || asleep(b) || a.act.kind === "fight" || b.act.kind === "fight") continue;
      if (distance(a, b) > fight.distance) continue;
      const territorial = Math.max(0, traitLevel(a, "territorial")) + Math.max(0, traitLevel(b, "territorial"));
      if (rng.chance((fight.perMinute + fight.territorialStep * territorial) * minutes)) startFight(state, a, b);
    }
  }
  for (const cat of cats) if (enemyNear.has(cat.id)) changeMood(state, cat, RELATIONS.enemyMoodPerHour * hours);
}

/** Бійка ворогів (§9.4): обидва зупиняються, летить шерсть. */
function startFight(state: GameState, a: Cat, b: Cat): void {
  const fight = RELATIONS.fight;
  start(a, "fight", null, fight.minutes, `cat:${b.id}`);
  start(b, "fight", null, fight.minutes, `cat:${a.id}`);
  changeMood(state, a, fight.mood, "бійка");
  changeMood(state, b, fight.mood, "бійка");
  changeRelation(state, a, b, fight.relation);
  addMess(state, "fur", visibleFloorNear({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), null);
  emit(state, { type: "cat-fight", cats: [a.id, b.id] });
}

/** Персонаж узяв на руки кота, що б'ється (§9.4): бійка закінчується, а розбороняти неприємно. */
export function separateFight(state: GameState, cat: Cat): void {
  if (cat.act.kind !== "fight") return;
  const other = catById(state, cat.act.target);
  if (other?.act.kind === "fight") start(other, "idle", null, 2);
  unpleasantTask(state, RELATIONS.fight.separateSanity);
  emit(state, { type: "fight-stopped", cat: cat.id });
}

/** Персонаж приділяє увагу коту: ревниві коти, що не сплять, сердяться на нього (§9.4). */
export function jealousy(state: GameState, cat: Cat): void {
  for (const other of state.cats) {
    if (other.id === cat.id || !home(state, other) || asleep(other)) continue;
    const level = traitLevel(other, "jealousy");
    if (level > 0) changeRelation(state, other, cat, RELATIONS.jealousy * level);
  }
}

/** Двері відчинили (§9.12): коти поруч можуть вибігти на сходи. */
export function rollEscapes(state: GameState): void {
  const rng = stateRng(state, "behavior");
  const door = { x: 11, y: 10.5 };
  for (const cat of state.cats) {
    if (cat.away !== null || isCarried(state, cat)) continue;
    if (Math.hypot(cat.x - door.x, cat.y - door.y) > ESCAPE.distance) continue;
    if (!rng.chance(clamp(ESCAPE.base + ESCAPE.step * traitLevel(cat, "escape"), 0, 1))) continue;
    cat.away = "stairs";
    cat.x = door.x;
    cat.y = 10.9;
    start(cat, "idle", null, 0);
    emit(state, { type: "escaped", cat: cat.id });
  }
}
