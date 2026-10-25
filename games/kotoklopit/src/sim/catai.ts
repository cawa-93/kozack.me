// Поведінка котів (§9.3, §9.12): потреби, сутінковий ритм, вибір дії, гра, бешкет і кіт біля роботи.
// Рішення приймаються, коли дія закінчилася чи з'явилася нагальна потреба, тож десятки котів
// не навантажують кадр (§8.5).

import { stun } from "./body";
import { adaptsLonger, avoiding, changeLove, changeMood, forgive, grudgeAt, isAdapting, isKitten, isOld, recordMood, sinceOffense, stress, sulking, traitLevel } from "./cat";
import { lastTileWithin, randomFloor, tileAtDistance, tileOf, visibleFloorNear, walk } from "./catmove";
import { changeStat, unpleasantTask } from "./character";
import {
  ACTIVITY_BY_HOUR,
  ADAPTATION_HUNGER,
  APPETITE,
  APPETITE_STEP,
  ATTENTION_SATISFIED,
  BEGGING,
  BOWL_CAPACITY,
  BREEDING,
  CARRY,
  CAT_ACT_MINUTES,
  CAT_WALK_TILES_PER_MINUTE,
  COMPUTER_SLEEP,
  DIFFICULTY,
  DIRTY_CLOTHES_CATS,
  DEMANDING_SEEN_MINUTES,
  DEVOTION,
  DIRTY_LITTER,
  ENERGY,
  ENVY,
  ESCAPE,
  FOLLOWER,
  FOOD_SOUND,
  GULPING,
  HAIRBALL,
  HISS_PAUSE_MINUTES,
  HOUSE_SLEEP,
  HUNGRY_THEFT,
  ILLNESS,
  KITTEN_PLAY,
  LEGS,
  LITTER_CAPACITY,
  LOVE_BEHAVIOR,
  LOW_CAT_HEALTH,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  MIN_CAT_NAP_MINUTES,
  MISCHIEF,
  MOOD,
  MOOD_LOOK,
  NEED_PER_HOUR,
  NEED_THRESHOLD,
  NIGHT_ACTIVITY,
  NOCTURNAL,
  NOCTURNAL_STEP,
  NOISE,
  OLD_PLAY,
  PET,
  PETTING,
  PICKY,
  PICKY_REFUSAL_STEP,
  PLAY_RELIEF,
  PORTION_HUNGER,
  RELATIONS,
  REVENGE,
  SCATTER_CHANCE,
  SCRATCH,
  SLEEP_END,
  SLEEP_RECOVERY_PER_HOUR,
  SLEEP_START,
  SLEEP_TRAIT_STEP,
  SOFA_REPAIR,
  START_CLOTHES,
  STEAL_HUNGER,
  STERILIZATION,
  STRESS_EFFECTS,
  SURPRISE_CHANCE,
  TALKATIVE,
  TIRED_FATIGUE,
  TOUCHY,
  TOY,
  TRAIT_EFFECTS,
  TRAIT_NEED_STEP,
  VOMIT_STEP,
  WATCH_SANITY,
  WORK_CAT,
  ZOOMIES,
} from "./config";
import { afterMeal, afterTheft, fallIll, fatigueFactor, hungerFactor, maybeFallIll, missesLitter, showSymptoms, sleepFactor, toiletFactor, vomitsAfterMeal, walkFactor } from "./diseases";
import { emit } from "./events";
import { robotAt, robotProgress, wearOut } from "./household";
import { inView, observe, setWitnessing, witnesses } from "./knowledge";
import { loudNoise } from "./noise";
import { catFatigueFactor, playFactor, thirstFactor, warmthBonus } from "./modifiers";
import { distanceToRect, itemTile, LAUNDRY_BASKET, objectById, roomAt, ROOMS, slotById, SURFACE_IDS, type HomeObject } from "./home";
import { changeRelation, isEnemy, isFriend } from "./relations";
import { breedingHunger, escapeBonus, fightFactor, isNewborn, motherOf } from "./reproduction";
import { stateRng, type Rng } from "./rng";
import { absoluteMinute } from "./time";
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

/** Нічна година (23:00–04:00): поза сутінковим ритмом, коти сплять, а нічні гасають (§9.12). */
export function isNight(minute: number): boolean {
  const hour = hourOf(minute);
  return !ACTIVITY_BY_HOUR.some((s) => hour >= s.from && hour < s.to);
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
  n.hunger = clamp(n.hunger + NEED_PER_HOUR.hunger * hours * appetite * hungerFactor(cat) * breedingHunger(state, cat) * (isAdapting(state, cat) ? ADAPTATION_HUNGER : 1));
  n.thirst = clamp(n.thirst + NEED_PER_HOUR.thirst * hours * thirstFactor(state));
  n.toilet = clamp(n.toilet + NEED_PER_HOUR.toilet * hours * toiletFactor(cat));
  if (sleeping) {
    n.fatigue = clamp(n.fatigue - SLEEP_RECOVERY_PER_HOUR * hours * sleepFactor(cat) * Math.max(0.1, 1 - SLEEP_TRAIT_STEP * traitLevel(cat, "sleep")));
  } else {
    const tired = isOld(cat) || cat.health < LOW_CAT_HEALTH ? TIRED_FATIGUE : 1;
    const recovering = state.day <= cat.recoveryUntil ? STERILIZATION.recoveryFatigue : 1;
    n.fatigue = clamp(n.fatigue + NEED_PER_HOUR.fatigue * hours * tired * fatigueFactor(cat) * recovering * catFatigueFactor(state));
  }
  // Як часто кіт сам приходить по ласку — «Ласкавість»; як наполегливо вимагає — «Вимогливість» (§9.9).
  const attention = Math.max(0, 1 + TRAIT_NEED_STEP * traitLevel(cat, "affection"));
  n.attention = clamp(n.attention + NEED_PER_HOUR.attention * hours * attention);
  const age = isKitten(cat) ? KITTEN_PLAY : isOld(cat) ? OLD_PLAY : 1;
  n.play = clamp(n.play + NEED_PER_HOUR.play * hours * activityAt(cat, state.minute) * traitFactor(cat, "energy", TRAIT_NEED_STEP) * age * playFactor(state));
  // Шерстяна грудка: частіше вночі й у довгошерстих (§9.12).
  const hour = hourOf(state.minute);
  const night = hour >= 23 || hour < 5;
  const long = cat.shape.coat === null && !cat.genes.short[0] && !cat.genes.short[1];
  const rate = HAIRBALL.perHour * (night ? HAIRBALL.night : 1) * (long ? HAIRBALL.longHair : 1) * traitFactor(cat, "hairballs", HAIRBALL.step);
  // Нестерилізований кіт мітить територію (§9.8); схильний до міток — ще й від стресу, «Ніколи не мітить» — ніколи.
  const marking = traitLevel(cat, "marking");
  const intact = cat.sex === "male" && !cat.sterilized;
  const stressed = marking > 0 && cat.mood < TRAIT_EFFECTS.stressMarkMood;
  const markChance = BREEDING.markPerHour * hours * traitFactor(cat, "marking", TRAIT_EFFECTS.markingStep);
  if ((intact || stressed) && cat.ageWeeks >= BREEDING.minAge && !sleeping && rng.chance(markChance)) {
    addMess(state, "mark", visibleFloorNear(state, cat), cat.id);
    observe(state, cat, "marking");
  }
  if (state.day > cat.groomedUntil && rng.chance(rate * hours)) {
    addMess(state, "hairball", visibleFloorNear(state, cat), cat.id);
    observe(state, cat, "hairballs");
  }
}

/**
 * Потреби на межі псують настрій щогодини (§9.12). Без уваги кіт сумує, лише коли не спить: сплячий
 * нічого не просить (пошук багів 2026-10-25).
 */
function needsMood(state: GameState, cat: Cat, minutes: number, context: CatContext): void {
  const hours = minutes / MINUTES_PER_HOUR;
  if (cat.needs.hunger >= 100) changeMood(state, cat, MOOD.starvingPerHour * hours);
  if (cat.needs.thirst >= 100) changeMood(state, cat, MOOD.starvingPerHour * hours);
  if (context.present && !asleep(cat) && cat.needs.attention >= 100) {
    const demanding = Math.max(0, 1 + TRAIT_EFFECTS.demandingIgnoredStep * traitLevel(cat, "demanding"));
    changeMood(state, cat, MOOD.ignoredPerHour * hours * demanding);
  }
}

// --- Що є в квартирі ------------------------------------------------------------------------

function start(cat: Cat, kind: CatActKind, goal: Vec | null, minutes: number, target: string | null = null): void {
  cat.act = { kind, target, goal, minutes, elapsed: 0 };
}

/** Почати дію кота — для інших модулів симуляції (гучний звук, §9.12). */
export const startAct = start;

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

/** Кіт не любить персонажа (§9.12, правка автора 2026-10-25): сам по увагу не йде, на руках пручається сильніше. */
const aloof = (cat: Cat): boolean => cat.love < LOVE_BEHAVIOR.aloof;
/** Кіт дуже любить персонажа: частіше на коліна, рідше кусає на руках. */
const devoted = (cat: Cat): boolean => cat.love >= LOVE_BEHAVIOR.devoted;

/** Кіт удома й не на руках. */
function home(state: GameState, cat: Cat): boolean {
  return cat.away === null && !isCarried(state, cat);
}

const asleep = (cat: Cat): boolean => cat.act.kind === "sleep" && cat.act.goal === null;

const catById = (state: GameState, target: string | null): Cat | null =>
  target?.startsWith("cat:") ? (state.cats.find((c) => `cat:${c.id}` === target) ?? null) : null;

/** Ресурсів замало (§9.4): кіт сердиться на випадкового іншого кота вдома. */
/** Сварка за миску чи лоток (§9.4): лише з котом поруч — кіт шипить на нього, і це видно. */
function resourceConflict(state: GameState, cat: Cat, rng: Rng, enough: boolean): void {
  if (enough) return;
  const r = RELATIONS.resource;
  if (!rng.chance(r.chance + r.territorialStep * Math.max(0, traitLevel(cat, "territorial")))) return;
  const others = state.cats.filter((c) => c.id !== cat.id && home(state, c) && distance(c, cat) <= r.distance);
  const other = others[rng.int(0, others.length - 1)];
  if (!other || !hiss(state, cat, other)) return;
  changeRelation(state, cat, other, r.relation);
  observe(state, cat, "territorial");
}

/**
 * Кіт шипить на іншого (§9.4) — це видно й чути. Спільна пауза шипіння (§9.12): після попереднього минуло
 * менше 20 хвилин — кіт мовчить, і сварки теж немає (false).
 */
export function hiss(state: GameState, cat: Cat, at: Cat): boolean {
  const now = absoluteMinute(state.day, state.minute);
  if (cat.hissedAt !== undefined && now - cat.hissedAt < HISS_PAUSE_MINUTES) return false;
  cat.hissedAt = now;
  emit(state, { type: "hissed", cat: cat.id, at: at.id });
  return true;
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

/**
 * Кіт саме просить їсти (§7, §9.12): нявчить біля миски, біля ліжка зранку чи біля їжі на столі, або прийшов до персонажа,
 * бо голодний. Ласощі йому зараз привчають до жебракування.
 */
export function beggingFood(cat: Cat): boolean {
  return (cat.act.kind === "beg" && cat.act.target !== "sink") || (cat.act.kind === "attention" && cat.act.forFood === true);
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

/** Дії, яких кіт не кидає, навіть почувши корм: ховається, б'ється, уже їсть, у лотку. */
const BUSY_FOR_FOOD = new Set(["eat", "fight", "hide", "toilet"]);

/**
 * У миску насипали корм (§9.12): голодні коти чують це й біжать їсти — найближчі, скільки в мисці
 * порцій, — якщо це їм не суперечить: гурман не біжить на простий корм, соня не прокидається.
 */
export function hearFood(state: GameState, bowl: BowlItem): void {
  const listeners = state.cats.filter((cat) => {
    if (cat.away !== null || isCarried(state, cat) || BUSY_FOR_FOOD.has(cat.act.kind) || isAdapting(state, cat)) return false;
    if (cat.needs.hunger < FOOD_SOUND.hunger - FOOD_SOUND.appetiteStep * traitLevel(cat, "appetite")) return false;
    if (bowl.foodQuality === "cheap" && traitLevel(cat, "picky") > 0) return false;
    if (cat.act.kind === "sleep" && traitLevel(cat, "sleep") > 0) return false;
    return true;
  });
  const tile = itemTile(bowl);
  listeners.sort((a, b) => Math.hypot(a.x - tile.x, a.y - tile.y) - Math.hypot(b.x - tile.x, b.y - tile.y));
  for (const cat of listeners.slice(0, bowl.food)) {
    start(cat, "eat", tile, eatMinutes(cat), `item:${bowl.id}`);
    emit(state, { type: "meow", cat: cat.id });
  }
}

/** З якого голоду кіт іде їсти (§9.12): «Апетит» — раніше. */
export function hungerThreshold(cat: Cat): number {
  return NEED_THRESHOLD.hunger - APPETITE.thresholdStep * Math.max(0, traitLevel(cat, "appetite"));
}

/** Скільки хвилин кіт їсть порцію (§9.12, «Швидкість їжі»): 3 × 0,7^рівень, від 1,5 до 6. */
export function eatMinutes(cat: Cat): number {
  return clamp(CAT_ACT_MINUTES.eat * GULPING.factor ** traitLevel(cat, "gulping"), GULPING.min, GULPING.max);
}

/**
 * Яку частку порції кіт уже з'їв із миски (§9.12): корм меншає поступово, поки кіт їсть, — так видно, хто ковтає за
 * мить, а хто їсть по зернятку. null — з цієї миски зараз ніхто не їсть.
 */
export function bowlEaten(state: GameState, bowl: BowlItem): number | null {
  const eater = state.cats.find((c) => c.away === null && c.act.kind === "eat" && c.act.goal === null && c.act.target === `item:${bowl.id}` && c.act.nibble !== undefined);
  if (!eater) return null;
  const act = eater.act;
  const progress = Math.min(1, act.elapsed / Math.max(1e-9, act.elapsed + act.minutes));
  return progress * (act.nibble === true || bowl.half === true ? 0.5 : 1);
}

/**
 * З якої втоми кіт засинає (§9.12): що активніша година, то пізніше; «Енергійність» зсуває це для обох боків
 * (рішення автора 2026-10-25): енергійний майже не дрімає ввечері, спокійний дрімає й у години пік.
 */
function sleepThreshold(cat: Cat, minute: number): number {
  const energy = Math.max(0, 1 + ENERGY.sleepStep * traitLevel(cat, "energy"));
  return Math.min(ENERGY.maxThreshold, SLEEP_START.base + SLEEP_START.activity * activityAt(cat, minute) * energy);
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
  // «Нічний сплюх» уночі спить у персонажа в ногах (§9.12, рішення автора 2026-10-25).
  const owl = isNight(state.minute) ? 1 + NOCTURNAL.bedStep * Math.max(0, -traitLevel(cat, "nocturnal")) : 1;
  const options: { weight: number; value: Spot }[] = [
    { weight: (3 + warmthBonus(state)) * owl, value: at({ x: bed.x + rng.int(0, bed.w - 1), y: bed.y + rng.int(0, bed.h - 1) }) },
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
  // Відчинена пральна машина — затишний барабан для допитливих (§8.7).
  if (state.home.washer.state === "idle") {
    const washer = objectById("washer");
    options.push({ weight: 0.5 + Math.max(0, traitLevel(cat, "curiosity")), value: at({ x: washer.x, y: washer.y }) });
  }
  if (!isWorking(state) && !catOnComputer(state)) {
    const computer = objectById("computer");
    // «Поважає роботу» спить на комп'ютері вдвічі рідше, «Байдужий до техніки» — ніколи (рішення автора 2026-10-25).
    const helper = traitLevel(cat, "helper");
    const respect = Math.max(0, 1 + COMPUTER_SLEEP.helperStep * Math.min(0, helper));
    const weight = (COMPUTER_SLEEP.base + warmthBonus(state) + COMPUTER_SLEEP.step * (Math.max(0, traitLevel(cat, "warmth")) + Math.max(0, helper))) * respect;
    options.push({ weight, value: at({ x: computer.x + rng.int(0, computer.w - 1), y: computer.y }) });
  }
  return weightedPick(rng, options) ?? at(randomFloor(rng));
}

/** Сховатися під ліжком, диваном чи в будиночку (§9.6). */
export function hideSpot(state: GameState, rng: Rng): Spot {
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
    if (full) return start(cat, "eat", itemTile(full), eatMinutes(cat), `item:${full.id}`);
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
    // «Не випрошує» (−2) не йде просити до персонажа — чекає біля миски (§9.12, рішення автора 2026-10-25).
    if (context.present && !aloof(cat) && !avoiding(state, cat) && traitLevel(cat, "begging") > -2 && rng.chance(0.5)) return startAttention(state, cat, true);
    if (empty) return start(cat, "beg", itemTile(empty), CAT_ACT_MINUTES.beg, `item:${empty.id}`);
  }
  if (n.fatigue >= sleepThreshold(cat, state.minute)) {
    const spot = cat.health < 25 || isAdapting(state, cat) ? hideSpot(state, rng) : sleepSpot(state, cat, rng);
    return start(cat, "sleep", spot.at, 8 * MINUTES_PER_HOUR, spot.target);
  }
  if (isAdapting(state, cat)) {
    const spot = hideSpot(state, rng);
    start(cat, "hide", spot.at, CAT_ACT_MINUTES.hide, spot.target);
    // Полохливий звикає довше: ховається й тоді, коли кіт без риси вже звик би (§9.6, §9.12), — прояв раз на день.
    if (adaptsLonger(state, cat)) observe(state, cat, "bravery", -1, false, MINUTES_PER_DAY);
    return;
  }
  // До того, хто працює, кіт іде раніше — посидіти на колінах (§9.12).
  const seek = isWorking(state) ? WORK_CAT.seekAttention : NEED_THRESHOLD.attention;
  // Після неприємного від персонажа кіт якийсь час сам не приходить (§9.12, «Образливість»).
  if (context.present && n.attention >= seek && !aloof(cat) && !avoiding(state, cat)) return startAttention(state, cat);
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

/**
 * Кіт іде до персонажа по увагу й ходить слідом, нявкаючи (§9.12). Хто вже йде — не починає заново: інакше
 * голодний кіт щокроку «приходив» би знову (пошук багів 2026-10-25). Прояв рис — коли дійде (`tickCat`).
 */
function startAttention(state: GameState, cat: Cat, forFood = false): void {
  if (cat.act.kind === "attention" && cat.act.minutes > 0) return;
  // «Вимогливий» ходить слідом довше, «Скромний» — менше (§9.9); «Хвостик» тривалості не змінює (2026-10-25).
  const demanding = Math.max(0.25, 1 + TRAIT_EFFECTS.demandingStep * traitLevel(cat, "demanding"));
  start(cat, "attention", attentionGoal(state, cat), CAT_ACT_MINUTES.attention * demanding, "character");
  if (forFood) cat.act.forFood = true;
}

/**
 * Куди кіт іде по увагу: до персонажа; «Сам по собі» — лише до виходу зі своєї кімнати в бік персонажа, звідки
 * кличе й чекає (§9.12).
 */
function attentionGoal(state: GameState, cat: Cat): Vec {
  const body = tileOf(state.character.body);
  const own = ROOMS.find((r) => r.id === roomAt(cat));
  if (traitLevel(cat, "follower") >= 0 || !own) return body;
  return lastTileWithin(cat, body, own);
}

/**
 * Персонаж перейшов у іншу кімнату (§9.12): вільний «Хвостик», що був у тій кімнаті, іде слідом. Кімнату
 * пам'ятає `character.room`; прохід між кімнатами — ще не нова кімната.
 */
function noticeRoomChange(state: GameState, rng: Rng): void {
  const room = roomAt(state.character.body);
  if (room === null) return;
  const before = state.character.room;
  state.character.room = room;
  if (before === undefined || before === room) return;
  greetAloud(state, room, rng);
  for (const cat of state.cats) {
    if (!home(state, cat) || (cat.act.kind !== "idle" && cat.act.kind !== "wander") || roomAt(cat) !== before) continue;
    const level = traitLevel(cat, "follower");
    if (level > 0 && rng.chance(FOLLOWER.chanceStep * level)) {
      start(cat, "follow", tileOf(state.character.body), FOLLOWER.minutes, "character");
      cat.act.from = before;
    }
  }
}

/**
 * «Хвостик» іде за персонажем і тримається поруч (§9.12): час супроводу йде й тоді, коли кіт крокує. Зайшов за
 * персонажем у нову кімнату — прояв, раз за супровід. Персонаж сам повернувся в кімнату кота — це не прояв: кіт
 * нікуди не зайшов (перевірка 2026-10-25).
 */
function escort(state: GameState, cat: Cat, minutes: number, context: CatContext): number {
  const act = cat.act;
  const food = act.target === "food";
  // Корм насипали чи поклали — «вісімці» кінець (§9.12, «Тертя об ноги»).
  if (!context.present || (food && state.character.held?.kind !== "catfood")) {
    act.minutes = 0;
    return minutes;
  }
  const body = state.character.body;
  const used = Math.min(minutes, act.minutes);
  // Як і кіт, що просить уваги: відстав — іде туди, де персонаж, і крутиться під ногами (`rubbingCat`).
  if (distance(cat, body) > FOLLOWER.near + keepDistance(cat)) approach(state, cat);
  if (act.goal) walk(cat, used, CAT_WALK_TILES_PER_MINUTE * walkFactor(cat));
  act.minutes -= used;
  act.elapsed += used;
  if (act.target === "door") {
    // Дійшов до персонажа біля дверей: вітається — нявкає (як уміє) і ще трохи крутиться поруч; це прояв «Відданості +».
    if (act.seen !== true && distance(cat, body) <= ARRIVED + keepDistance(cat)) {
      act.seen = true;
      act.minutes = Math.min(act.minutes, DEVOTION.stayMinutes);
      emit(state, { type: "meow", cat: cat.id, ...(meowVoice(cat).silent ? { silent: true as const } : {}) });
      observe(state, cat, "devotion");
    }
    return minutes - used;
  }
  if (food) {
    // Пів хвилини «вісімкою» під ногами — прояв «Тертя об ноги +», не частіше ніж раз на годину (§9.9).
    if (distance(cat, body) < LEGS.distance) act.rubbed = (act.rubbed ?? 0) + used;
    if (act.seen !== true && (act.rubbed ?? 0) >= LEGS.eightMinutes) {
      act.seen = true;
      observe(state, cat, "legs", 1, false, MINUTES_PER_HOUR);
    }
    return minutes - used;
  }
  const room = roomAt(body);
  if (act.seen !== true && act.elapsed <= FOLLOWER.seenWithin && room !== null && room === roomAt(cat) && room !== act.from) {
    act.seen = true;
    observe(state, cat, "follower");
  }
  return minutes - used;
}

/** Звідки кіт іде зустрічати персонажа біля дверей: не спить і нічим важливим не зайнятий (§9.12). */
const GREET_FROM = new Set(["idle", "wander", "toy", "beg", "attention", "follow", "groom"]);

/**
 * Персонаж повернувся з поїздки (§9.12, рішення автора 2026-10-25): кожен кіт, що не спить, нічим важливим не зайнятий і
 * не ображений, іде зустрічати до дверей з шансом 0,2 + 0,2 × «Відданість» + 0,4 × (любов − 50) / 50, від 0 до 0,9.
 * Кіт, що їздив разом із персонажем, не зустрічає. Біля дверей він нявкає й треться об ноги («Балакучість», «Тертя об
 * ноги»), а кіт біля дверей може втекти, коли їх відчинять наступного разу («Втечі»).
 */
export function greetAtDoor(state: GameState, except: number | null): void {
  const rng = stateRng(state, "behavior");
  const d = DEVOTION;
  for (const cat of state.cats) {
    if (cat.id === except || !home(state, cat) || asleep(cat) || !GREET_FROM.has(cat.act.kind) || isAdapting(state, cat) || avoiding(state, cat)) continue;
    const chance = clamp(d.greetBase + d.greetStep * traitLevel(cat, "devotion") + (d.greetLove * (cat.love - 50)) / 50, 0, d.greetMax);
    if (rng.chance(chance)) start(cat, "follow", tileOf(state.character.body), d.greetMinutes, "door");
  }
}

/** З якої любові кіт повільно моргає до персонажа (§11.4): 75, а «Відданий» — на 10 нижче за одиницю (§9.12). */
export function blinkLove(cat: Cat): number {
  return LOVE_BEHAVIOR.devoted - DEVOTION.blinkStep * Math.max(0, traitLevel(cat, "devotion"));
}

/** Дії, з яких кіт моргає до персонажа: сидить, блукає, просить уваги (§11.4). */
const BLINK_ACTS = new Set(["idle", "wander", "attention"]);

/** Кіт вільний, на місці й на очах персонажа не далі `reach` клітинок (§9.12): так видно, як він поводиться поруч. */
function besidePerson(state: GameState, cat: Cat, reach: number): boolean {
  return cat.away === null && !isCarried(state, cat) && cat.act.goal === null && distance(cat, state.character.body) <= reach && inView(state, cat);
}

/**
 * «Пастка на животику» (−2 і менше) лежить животом догори, коли персонаж ближче 1,5 клітинки (§9.12, рішення автора
 * 2026-10-25): сидить на місці — зокрема й під рукою.
 */
export function bellyUp(state: GameState, cat: Cat): boolean {
  return cat.act.kind === "idle" && traitLevel(cat, "petting") <= -2 && besidePerson(state, cat, PETTING.bellyDistance);
}

/** Ласкавий кіт, що прийшов по увагу й сидить поруч, бодається головою в руку (§9.12) — лише анімація. */
export function headNudges(state: GameState, cat: Cat): boolean {
  return cat.act.kind === "attention" && cat.act.seen === true && traitLevel(cat, "affection") > 0 && besidePerson(state, cat, MOOD_LOOK.nudgeDistance);
}

/**
 * Кіт повільно моргає до персонажа (§11.4, правка автора 2026-10-25): щасливий (настрій від 70) і любить його, сидить
 * поруч (до 4 клітинок) на його очах, не грається, не на руках і не дметься. Хто лежить животом догори чи бодається
 * головою, не моргає — сцена показує саме це (перевірка етапу 2026-10-25: інакше «Відданість» відкривалася морганням,
 * якого не було видно).
 */
export function slowBlinks(state: GameState, cat: Cat): boolean {
  const act = cat.act;
  if (cat.mood < MOOD_LOOK.blinkMood || cat.love < blinkLove(cat)) return false;
  if (!BLINK_ACTS.has(act.kind) || (act.kind === "wander" && act.target === "play") || sulking(state, cat)) return false;
  return besidePerson(state, cat, MOOD_LOOK.blinkDistance) && !bellyUp(state, cat) && !headNudges(state, cat);
}

/**
 * «Відданий» повільно моргає до персонажа, коли кіт без риси з тією самою любов'ю ще не моргав би (любов нижче 75) —
 * прояв «Відданості +», раз на день (§9.9, рішення автора 2026-10-25).
 */
function devotedBlinks(state: GameState): void {
  for (const cat of state.cats) {
    if (cat.love < LOVE_BEHAVIOR.devoted && slowBlinks(state, cat)) observe(state, cat, "devotion", 1, false, MINUTES_PER_DAY);
  }
}

/** Кіт поруч із персонажем, коли до нього ближче цього (§9.9): прийшов по увагу. */
const ARRIVED = 1.2;

/** На якій відстані від персонажа тримається кіт (§9.12, «Тертя об ноги»): 0 — під ногами. */
function keepDistance(cat: Cat): number {
  const legs = traitLevel(cat, "legs");
  if (legs >= 0) return 0;
  return legs === -1 ? LEGS.keep[0] : LEGS.keep[1];
}

/**
 * Кіт іде до персонажа (§9.12): під ноги; «Тримає дистанцію» сідає за клітинку від нього, «Обходить стороною» — за
 * півтори й раз за похід відступає, коли персонаж підходить ближче (рішення автора 2026-10-25). Лише раз — інакше
 * його, що сам прийшов по увагу, не вдалося б погладити.
 */
function approach(state: GameState, cat: Cat): void {
  const body = state.character.body;
  const keep = keepDistance(cat);
  const gap = distance(cat, body);
  if (keep === 0) {
    if (gap > ARRIVED) cat.act.goal = tileOf(body);
    return;
  }
  if (gap > keep + ARRIVED) cat.act.goal = tileAtDistance(state, body, cat, keep);
  else if (keep >= LEGS.keep[1] && gap < LEGS.backOff && cat.act.kept !== true) {
    cat.act.kept = true;
    cat.act.goal = tileAtDistance(state, body, cat, keep + 0.5);
  }
}

/** Звідки голодний кіт кидає справи, щоб покрутитися під ногами того, хто несе корм (§9.12). */
const EIGHT_FROM = new Set(["idle", "wander", "beg"]);

/**
 * Персонаж несе корм (§9.12, рішення автора 2026-10-25): голодний кіт із «Тертям об ноги» +, що це бачить і нічим
 * важливим не зайнятий, іде слідом і крутиться «вісімкою» під ногами, поки корм не насиплють.
 */
function figureEight(state: GameState): void {
  if (state.character.held?.kind !== "catfood") return;
  for (const cat of state.cats) {
    if (!home(state, cat) || traitLevel(cat, "legs") <= 0 || cat.needs.hunger < LEGS.hunger) continue;
    if (!EIGHT_FROM.has(cat.act.kind) || isAdapting(state, cat) || !inView(state, cat)) continue;
    start(cat, "follow", tileOf(state.character.body), LEGS.foodMinutes, "food");
  }
}

function startZoomies(state: GameState, cat: Cat, rng: Rng): void {
  start(cat, "zoomies", randomFloor(rng), ZOOMIES.minMinutes + rng.next() * (ZOOMIES.maxMinutes - ZOOMIES.minMinutes));
  observe(state, cat, "zoomies");
}

/** Кіт хоче гратися (§9.12): зумі, скинути річ, украсти їжу, іграшка чи просто побродити. */
function choosePlay(state: GameState, cat: Cat, rng: Rng): void {
  type Choice = () => void;
  // Активна забава — прояв «Енергійності +»; просто побродити — ні: так поводиться будь-який кіт (§9.9).
  const active =
    (choice: Choice): Choice =>
    () => {
      observe(state, cat, "energy");
      nightMischief(state, cat);
      choice();
    };
  const options: { weight: number; value: Choice }[] = [
    { weight: MISCHIEF.zoomies * traitFactor(cat, "zoomies", MISCHIEF.traitStep) * activityAt(cat, state.minute), value: active(() => startZoomies(state, cat, rng)) },
    // Побродити заради гри — ціль «play»: лише така прогулянка знімає потребу гри.
    { weight: MISCHIEF.wander, value: () => start(cat, "wander", randomFloor(rng), CAT_ACT_MINUTES.wander, "play") },
  ];
  // Енергійний, з яким давно не гралися, нудьгує й бешкетує охочіше (§9.12, рішення автора 2026-10-25).
  const bored = traitLevel(cat, "energy") > 0 && cat.needs.play >= 100 ? ENERGY.bored : 1;
  const onSurfaces = dishes(state, false);
  const knock = onSurfaces[rng.int(0, onSurfaces.length - 1)];
  if (knock) options.push({ weight: MISCHIEF.knock * traitFactor(cat, "knocking", MISCHIEF.traitStep) * bored, value: active(() => start(cat, "knock", objectTile(knock.id), 0.5, knock.id)) });
  const food = dishes(state, true).filter((d) => d.dish.kind !== "burnt");
  const steal = food[rng.int(0, food.length - 1)];
  if (steal) {
    const hungry = cat.needs.hunger >= 60 ? 2 : 1;
    options.push({ weight: MISCHIEF.steal * traitFactor(cat, "thief", MISCHIEF.traitStep) * hungry, value: active(() => start(cat, "steal", objectTile(steal.id), 1, steal.id)) });
  }
  const toy = nearest(cat, itemsOf(state, "toy"));
  if (toy) options.push({ weight: MISCHIEF.toy, value: active(() => start(cat, "toy", itemTile(toy), TOY.aloneMinutes, `item:${toy.id}`)) });
  options.push({ weight: MISCHIEF.scratch * traitFactor(cat, "scratching", MISCHIEF.traitStep) * bored, value: active(() => startScratch(state, cat, rng)) });
  const mate = playmate(state, cat);
  if (mate) options.push({ weight: RELATIONS.wrestle.weight, value: active(() => startWrestle(state, cat, mate)) });
  (weightedPick(rng, options) ?? (() => start(cat, "idle", null, CAT_ACT_MINUTES.idle)))();
}

/**
 * Зумі чи бешкет у нічну годину (§9.12): сова, що ще не спить, бачить, як нічний кіт гасає, — прояв «Нічної
 * активності +», не частіше ніж раз за ніч (рішення автора 2026-10-25).
 */
function nightMischief(state: GameState, cat: Cat): void {
  if (isNight(state.minute)) observe(state, cat, "nocturnal", 1, false, NOCTURNAL.mischiefEvery);
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
function startWrestle(state: GameState, cat: Cat, mate: Cat): void {
  observe(state, cat, "sociability");
  const minutes = RELATIONS.wrestle.minutes;
  start(cat, "wrestle", tileOf(mate), minutes, `cat:${mate.id}`);
  start(mate, "wrestle", null, minutes + distance(cat, mate) / CAT_WALK_TILES_PER_MINUTE, `cat:${cat.id}`);
}

/** Точити кігті (§9.12): на кігтеточці, якщо вона є й кіт її обрав, інакше — на дивані. */
function startScratch(state: GameState, cat: Cat, rng: Rng): void {
  const level = traitLevel(cat, "scratching");
  const posts = itemsOf(state, "scratcher").filter((p) => rng.chance(clamp(SCRATCH[p.quality] - SCRATCH.traitStep * level, 0, 1)));
  const post = nearest(cat, posts);
  if (post) {
    // Дере кігтеточку, а не диван — прояв «Любить кігтеточку» (§9.9).
    observe(state, cat, "scratching", -1);
    return start(cat, "scratch", itemTile(post), SCRATCH.minutes, `item:${post.id}`);
  }
  const sofa = objectById("sofa");
  start(cat, "scratch", { x: sofa.x + rng.int(0, sofa.w - 1), y: sofa.y - 1 }, SCRATCH.minutes, "sofa");
  observe(state, cat, "scratching");
}

/** Шанс, що кіт ляже на коліна тому, хто працює (§9.12): «Коліна» й любов до персонажа. */
export function lapChance(cat: Cat): number {
  return WORK_CAT.lapBase + WORK_CAT.lapStep * traitLevel(cat, "lap") + (devoted(cat) ? LOVE_BEHAVIOR.lapBonus : 0);
}

/**
 * Кіт по увагу прийшов до персонажа, що працює (§9.12): сідає на клавіатуру, лягає на коліна
 * чи просто сидить поруч і нявчить. Клавіатуру пробує майже кожен кіт — 10% + 30% за одиницю «Робочого помічника»;
 * «Поважає роботу» на неї не сідає, а якщо не ліг на коліна — лягає поруч зі столом і не заважає (рішення автора
 * 2026-10-25): це прояв «−», раз на день.
 */
function arriveAtWork(state: GameState, cat: Cat, rng: Rng): void {
  cat.act.target = "asked";
  const helper = traitLevel(cat, "helper");
  const lap = traitLevel(cat, "lap");
  if (helper >= 0 && rng.chance(WORK_CAT.keyboardBase + WORK_CAT.keyboardStep * helper)) {
    const computer = objectById("computer");
    const minutes = WORK_CAT.keyboardMinMinutes + rng.next() * (WORK_CAT.keyboardMaxMinutes - WORK_CAT.keyboardMinMinutes);
    observe(state, cat, "helper");
    return start(cat, "keyboard", { x: computer.x, y: computer.y }, minutes, "computer");
  }
  if (lap >= 0 && rng.chance(lapChance(cat))) {
    start(cat, "lap", null, MINUTES_PER_HOUR * 4, "character");
    observe(state, cat, "lap");
    jealousy(state, cat);
    return;
  }
  if (helper < 0) {
    const computer = objectById("computer");
    const beside = visibleFloorNear(state, { x: computer.x + computer.w + 0.5, y: computer.y + 1.5 });
    start(cat, "idle", tileOf(beside), WORK_CAT.besideMinutes, "desk");
    observe(state, cat, "helper", -1, false, MINUTES_PER_DAY);
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
      // Перебірливий нюхає простий корм, гребе біля миски лапою — «закопує» — і відходить просити кращого; від голоду
      // 95 — удвічі рідше: голод сильніший (§9.12, рішення автора 2026-10-25).
      const picky = traitLevel(cat, "picky");
      const starving = cat.needs.hunger >= PICKY.starving ? PICKY.starvingFactor : 1;
      if (bowl.foodQuality === "cheap" && picky > 0 && rng.chance(PICKY_REFUSAL_STEP * picky * starving)) {
        changeMood(state, cat, MOOD.pickyRefusal, "відмовився від дешевого корму");
        emit(state, { type: "cat-refused-food", cat: cat.id });
        observe(state, cat, "picky");
        return start(cat, "bury", null, PICKY.buryMinutes, act.target);
      }
      // «Малоїжка» поклювала пів порції й лишила половину в мисці; половинку, що лишилася, доїдає наступний (§9.12).
      const nibble = act.nibble === true && bowl.half !== true;
      const portion = nibble || bowl.half === true ? 0.5 : 1;
      if (nibble) bowl.half = true;
      else {
        bowl.food -= 1;
        delete bowl.half;
      }
      wearOut(state, bowl, rng);
      const quality = bowl.foodQuality ?? "cheap";
      if (bowl.food <= 0) bowl.foodQuality = null;
      cat.needs.hunger = Math.max(0, cat.needs.hunger - PORTION_HUNGER * portion);
      changeMood(state, cat, quality === "premium" ? MOOD.premiumFood : MOOD.cheapFood, quality === "premium" ? "дорогий корм" : undefined);
      // «Їсть усе» наминає простий корм і тішиться ним, як дорогим, — прояв «Перебірливості −» (раз на годину).
      if (quality === "cheap" && picky < 0) {
        changeMood(state, cat, PICKY.cheapJoy * -picky, "радіє простому корму");
        observe(state, cat, "picky", -1, false, MINUTES_PER_HOUR);
      }
      itemMood(state, cat, bowl);
      if (quality === "premium") envy(state, cat);
      emit(state, { type: "cat-ate", cat: cat.id, quality });
      resourceConflict(state, cat, rng, itemsOf(state, "bowl").length >= state.cats.length);
      afterMeal(state, cat, quality === "premium", rng);
      // Стерилізованому — лише корм для стерилізованих (§9.8).
      if (cat.sterilized && !bowl.sterile) maybeFallIll(state, cat, "urolithiasis", ILLNESS.regularFoodStones, rng);
      // «Малоїжка» відходить, лишивши пів миски, — прояв «Апетиту −» (§9.9).
      if (nibble) observe(state, cat, "appetite", -1);
      // «Ненаситний» доїдає все: у мисці ще є ціла порція — з'їдає й її (рішення автора 2026-10-25). Зригує й просить ще
      // він уже після другої.
      const appetite = traitLevel(cat, "appetite");
      if (act.second !== true && appetite > 0 && bowl.food > 0 && bowl.half !== true && rng.chance(Math.min(APPETITE.secondMax, APPETITE.secondStep * appetite))) {
        start(cat, "eat", null, eatMinutes(cat), act.target);
        cat.act.nibble = false;
        cat.act.second = true;
        return;
      }
      // Спустошив дві порції за раз — прояв «Апетиту +».
      if (act.second === true) observe(state, cat, "appetite");
      // Як довго кіт їв — прояв «Швидкості їжі» (§9.9): «Пилосос» ковтає порцію за мить, «Їсть по зернятку» довго
      // сидить над мискою. Раз на годину: дві порції поспіль — одна трапеза.
      const gulping = traitLevel(cat, "gulping");
      if (gulping !== 0) observe(state, cat, "gulping", gulping > 0 ? 1 : -1, false, MINUTES_PER_HOUR);
      // Їсть надто швидко й одразу зригує (§9.3) — частіше, коли поруч їсть інший кіт, рідше з керамічної миски; чи
      // нездужає шлунком (§9.5).
      const crowded = state.cats.some((o) => o.id !== cat.id && home(state, o) && o.act.kind === "eat" && o.act.goal === null && distance(o, cat) <= GULPING.near);
      const vomit = VOMIT_STEP * Math.max(0, gulping) * (crowded ? GULPING.crowded : 1) * (bowl.quality === "premium" ? GULPING.slowBowl : 1);
      if (rng.chance(vomit) || vomitsAfterMeal(cat, rng)) addMess(state, "vomit", visibleFloorNear(state, { x: cat.x, y: cat.y + 0.6 }), cat.id);
      // «Жебракування»: щойно поїв — уже просить ще біля миски; звичка від ласощів — і в кота без риси (§7).
      const begging = traitLevel(cat, "begging");
      const asks = TRAIT_EFFECTS.beggingChance * Math.max(0, begging) + (begging <= -2 ? 0 : (cat.begHabit ?? 0));
      if (asks > 0 && rng.chance(asks)) {
        if (begging > 0) observe(state, cat, "begging");
        return start(cat, "beg", itemTile(bowl), CAT_ACT_MINUTES.beg, act.target);
      }
      // «Знає міру» поїв, умивається й іде відпочивати — прояв «−», раз на годину (рішення автора 2026-10-25).
      if (begging < 0) {
        start(cat, "groom", null, BEGGING.washMinutes, "wash");
        observe(state, cat, "begging", -1, false, MINUTES_PER_HOUR);
      }
      return;
    }
    case "bury": {
      // Закопав простий корм — тепер просить кращого біля миски (§9.12).
      const bowl = itemById<BowlItem>(state, act.target);
      if (bowl?.kind === "bowl") return start(cat, "beg", itemTile(bowl), CAT_ACT_MINUTES.beg, act.target);
      return;
    }
    case "drink": {
      const water = itemById<WaterItem>(state, act.target);
      if (!water || water.water <= 0) return;
      water.water -= 1;
      cat.needs.thirst = 0;
      itemMood(state, cat, water);
      wearOut(state, water, rng);
      return;
    }
    case "attention": {
      // Прийшов, ходив слідом і нявчив, а ласки так і не дочекався — прояв «Вимогливості» (§9.9): довше за
      // звичайний похід — «+», пішов раніше — «−» (рішення автора 2026-10-25).
      if (act.seen !== true || cat.needs.attention < ATTENTION_SATISFIED) return;
      const longer = act.elapsed - CAT_ACT_MINUTES.attention;
      if (Math.abs(longer) >= DEMANDING_SEEN_MINUTES) observe(state, cat, "demanding", longer > 0 ? 1 : -1);
      return;
    }
    case "revenge":
      // Дійшов до ліжка чи кошика з білизною: помста здійснилася, образа минає.
      addMess(state, "surprise", visibleFloorNear(state, cat), cat.id);
      cat.hurt = null;
      forgive(cat);
      return;
    case "toilet": {
      cat.needs.toilet = 0;
      const box = itemById<LitterItem>(state, act.target);
      // Хворий кіт не дотерпів до лотка (§9.5).
      if (box && missesLitter(cat, rng)) {
        addMess(state, "surprise", visibleFloorNear(state, cat), cat.id);
        return;
      }
      if (!box) {
        addMess(state, "surprise", visibleFloorNear(state, cat), cat.id);
        return;
      }
      if (isDirty(box)) {
        // Грязнулі ображаються менше й від брудного лотка не відмовляються; чистюлі — навпаки (§9.12).
        const picky = traitLevel(cat, "litterPicky");
        const factor = Math.max(0, 1 + DIRTY_LITTER.pickyStep * picky);
        changeMood(state, cat, MOOD.dirtyLitter * factor, "брудний лоток");
        if (picky >= 0 && rng.chance(SURPRISE_CHANCE.base + SURPRISE_CHANCE.step * picky)) {
          addMess(state, "surprise", surpriseSpot(rng), cat.id);
          observe(state, cat, "litterPicky");
          return;
        }
        changeLove(state, cat, DIRTY_LITTER.love * factor, "брудний лоток");
        // Спокійно сходив і в повний лоток — прояв «Спартанця» (§9.9).
        observe(state, cat, "litterPicky", -1);
      }
      box.uses += 1;
      itemMood(state, cat, box);
      wearOut(state, box, rng);
      resourceConflict(state, cat, rng, itemsOf(state, "litter").length >= state.cats.length + 1);
      if (rng.chance(SCATTER_CHANCE.base + SCATTER_CHANCE.step * traitLevel(cat, "scatter"))) {
        const slot = slotById(box.slot);
        addMess(state, "litter", { x: slot.x + 0.5 + (rng.next() - 0.5), y: slot.y + 0.7 + rng.next() * 0.2 }, cat.id);
        observe(state, cat, "scatter");
      } else observe(state, cat, "scatter", -1);
      // Після лотка — часто зумі (§9.3); «Статечний» спокійно йде геть — прояв «Зумі −», раз на день.
      if (rng.chance(ZOOMIES.afterToilet * traitFactor(cat, "zoomies", MISCHIEF.traitStep))) {
        startZoomies(state, cat, rng);
        nightMischief(state, cat);
      } else observe(state, cat, "zoomies", -1, false, MINUTES_PER_DAY);
      return;
    }
    case "sleep": {
      if (act.elapsed >= MIN_CAT_NAP_MINUTES) changeMood(state, cat, MOOD.restedSleep);
      const house = itemById(state, act.target);
      if (house && act.elapsed >= MIN_CAT_NAP_MINUTES) {
        itemMood(state, cat, house);
        wearOut(state, house, rng);
      }
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
      // Нервово вилизався — тепер ховається (§9.12).
      if (act.target === "nervous") {
        const spot = hideSpot(state, rng);
        return start(cat, "hide", spot.at, STRESS_EFFECTS.hideStep * Math.max(1, -traitLevel(cat, "stress")), spot.target);
      }
      const friend = catById(state, act.target);
      if (!friend || distance(cat, friend) > 1.5) return;
      changeMood(state, cat, RELATIONS.groom.mood);
      changeMood(state, friend, RELATIONS.groom.mood);
      changeRelation(state, cat, friend, RELATIONS.groom.relation);
      emit(state, { type: "groomed", cat: cat.id, friend: friend.id });
      observe(state, cat, "grooming");
      observe(state, cat, "sociability");
      return;
    }
    case "fight":
      // Нерозборонена бійка: можлива травма (§9.4).
      if (rng.chance(RELATIONS.fight.injury)) fallIll(state, cat, "injury");
      return;
    case "scratch": {
      cat.needs.play = Math.max(0, cat.needs.play - SCRATCH.relief);
      changeMood(state, cat, SCRATCH.mood);
      const post = itemById(state, act.target);
      if (post) {
        itemMood(state, cat, post);
        wearOut(state, post, rng);
      } else state.home.repairs += SOFA_REPAIR;
      emit(state, { type: "scratched", cat: cat.id, sofa: post === null });
      return;
    }
    case "wander":
      // Просто побродити без діла гри не знімає: інакше коти майже не гралися б самі, не бешкетували
      // й не влаштовували зумі (пошук багів 2026-10-25).
      if (act.target === "play") cat.needs.play = Math.max(0, cat.needs.play - PLAY_RELIEF * 0.8);
      return;
    case "zoomies":
      cat.needs.play = Math.max(0, cat.needs.play - PLAY_RELIEF);
      return;
    case "knock": {
      if (!act.target || !knockOff(state, cat, act.target)) return;
      changeMood(state, cat, 1);
      cat.needs.play = Math.max(0, cat.needs.play - PLAY_RELIEF);
      observe(state, cat, "knocking");
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
      afterTheft(state, cat, rng);
      observe(state, cat, "thief");
      emit(state, { type: "stole", cat: cat.id, object: act.target, item: dish });
      return;
    }
    case "toy": {
      const toy = itemById<ToyItem>(state, act.target);
      cat.needs.play = Math.max(0, cat.needs.play - PLAY_RELIEF);
      if (!toy) return;
      changeMood(state, cat, 1);
      // Іграшка відлітає трохи вбік і зношується.
      const moved = visibleFloorNear(state, { x: toy.x + (rng.next() - 0.5) * 1.2, y: toy.y + (rng.next() - 0.5) * 1.2 });
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

/** Кіт скинув річ зі столу чи кухонної поверхні (§9.12): страва пропадає, на підлозі уламки, і гуркіт. */
function knockOff(state: GameState, cat: Cat, id: string): Dish | null {
  const dish = state.home.surfaces[id];
  if (!dish) return null;
  takeDish(state, id);
  const o = objectById(id);
  const shards = visibleFloorNear(state, { x: o.x + o.w / 2, y: o.y + o.h + 0.5 });
  addMess(state, "broken", shards, cat.id);
  emit(state, { type: "knocked", cat: cat.id, object: id, item: dish });
  // Річ розбилася — гучний звук (§9.12).
  loudNoise(state, "broken", shards);
  return dish;
}

/** Щохвилинне на місці. */
function perform(state: GameState, cat: Cat, minutes: number, rng: Rng, context: CatContext): void {
  const act = cat.act;
  act.elapsed += minutes;
  switch (act.kind) {
    case "sleep": {
      const rested = cat.needs.fatigue <= SLEEP_END && act.elapsed >= MIN_CAT_NAP_MINUTES;
      // Прокидається від голоду, спраги чи туалету: інакше спав би годинами зі спрагою на 100 (пошук багів 2026-10-25).
      const woken = cat.needs.toilet >= 95 || cat.needs.hunger >= 95 || cat.needs.thirst >= 95;
      if (rested || woken) act.minutes = 0;
      return;
    }
    case "eat":
      // Сів до миски: «Малоїжка» вирішує, чи лише поклює (§9.12, «Апетит»). Половинку, що лишилася, доїдає цілком.
      if (act.nibble === undefined) {
        const appetite = traitLevel(cat, "appetite");
        act.nibble = appetite < 0 && rng.chance(Math.min(APPETITE.halfMax, APPETITE.halfStep * -appetite));
      }
      return;
    case "beg":
    case "attention":
      askAloud(state, cat, minutes);
      if (act.kind === "attention") {
        if (cat.needs.attention < ATTENTION_SATISFIED) act.minutes = 0;
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
      changeLove(state, cat, WORK_CAT.lapLove * minutes);
      cat.needs.attention = Math.max(0, cat.needs.attention - WORK_CAT.lapAttention * minutes);
      cat.interacted = true;
      return;
    }
    default:
      return;
  }
}

/**
 * Голос кота (§9.12, «Балакучість»): у скільки разів частіше за звичайне він нявкає, просячи, і чи чути це. «Тихоня»
 * (−2 і менше) відкриває рота так само часто, як «Мовчазний», але беззвучно.
 */
export function meowVoice(cat: Cat): { rate: number; silent: boolean } {
  const level = traitLevel(cat, "talkative");
  if (level >= 0) return { rate: 1 + TALKATIVE.step * level, silent: false };
  return { rate: TALKATIVE.quiet, silent: level <= -2 };
}

/**
 * Кіт просить — нявкає (§9.12): раз на 2 хвилини, «Балакучість» частішає чи рідшає це, «Вимогливий», що прийшов по
 * увагу, нявчить наполегливіше (§9.9). Прояв «Балакучості» — різниця з котом без риси з тією самою «Вимогливістю»:
 * нявкнув уже на 2 рази більше, ніж нявкнув би той, — «+»; за 10 хвилин прохання — на 2 рази менше — «−» (рішення
 * автора 2026-10-25), не частіше ніж раз на годину. Беззвучне нявкання «Тихоні» не рахується.
 */
function askAloud(state: GameState, cat: Cat, minutes: number): void {
  const act = cat.act;
  const demanding = act.kind === "attention" ? traitFactor(cat, "demanding", TRAIT_EFFECTS.demandingMeowStep) : 1;
  const plain = demanding / TALKATIVE.meowMinutes;
  const voice = meowVoice(cat);
  const rate = voice.rate * plain;
  if (Math.floor(act.elapsed * rate) !== Math.floor((act.elapsed - minutes) * rate)) {
    if (voice.silent) emit(state, { type: "meow", cat: cat.id, silent: true });
    else {
      emit(state, { type: "meow", cat: cat.id });
      act.meows = (act.meows ?? 0) + 1;
      if (act.voiced !== true && act.meows - Math.floor(act.elapsed * plain) >= TALKATIVE.seenDifference) {
        act.voiced = true;
        observe(state, cat, "talkative", 1, false, TALKATIVE.observeEvery);
      }
      noisyAtWork(state, cat);
    }
  }
  const quiet = TALKATIVE.quietMinutes;
  if (act.elapsed >= quiet && act.elapsed - minutes < quiet && Math.floor(quiet * plain) - (act.meows ?? 0) >= TALKATIVE.seenDifference) {
    observe(state, cat, "talkative", -1, false, TALKATIVE.observeEvery);
  }
}

/** Балакучий кіт нявчить поруч із тим, хто працює (§9.12): заважає — здоровий глузд, не більше −2 за годину. */
function noisyAtWork(state: GameState, cat: Cat): void {
  const level = traitLevel(cat, "talkative");
  if (level <= 0 || !isWorking(state) || distance(cat, state.character.body) > TALKATIVE.workReach) return;
  const hour = Math.floor(absoluteMinute(state.day, state.minute) / MINUTES_PER_HOUR);
  const noise = state.character.meowNoise?.hour === hour ? state.character.meowNoise : { hour, lost: 0 };
  const loss = Math.min(TALKATIVE.workSanity * level, TALKATIVE.workMaxPerHour - noise.lost);
  if (loss <= 0) return;
  noise.lost += loss;
  state.character.meowNoise = noise;
  changeStat(state, "sanity", -loss);
}

/**
 * Персонаж зайшов у кімнату (§9.12): балакучі коти, що там не сплять, вітаються вголос — з шансом 30% за одиницю. Це
 * прояв «Балакучості +», не частіше ніж раз на годину (як і нявкання в проханні).
 */
function greetAloud(state: GameState, room: string, rng: Rng): void {
  for (const cat of state.cats) {
    const level = traitLevel(cat, "talkative");
    if (level <= 0 || !home(state, cat) || asleep(cat) || roomAt(cat) !== room) continue;
    if (cat.act.kind === "hide" || cat.act.kind === "fight" || !rng.chance(TALKATIVE.greet * level)) continue;
    emit(state, { type: "meow", cat: cat.id });
    observe(state, cat, "talkative", 1, false, TALKATIVE.observeEvery);
  }
}

/** Зумі: кіт мчить утричі швидше від однієї точки до іншої й може збити персонажа (§9.12). */
function zoom(state: GameState, cat: Cat, minutes: number, rng: Rng, context: CatContext): number {
  // Забіг — саме ця дія: гуркіт (скинута річ, падіння персонажа) може налякати й самого бігуна, і тоді в кота вже
  // інша дія — схованка, яку забіг не чіпає (перевірка 2026-10-25).
  const act = cat.act;
  const used = Math.min(minutes, act.minutes);
  const from = { x: cat.x, y: cat.y };
  walk(cat, used, CAT_WALK_TILES_PER_MINUTE * ZOOMIES.speed);
  // Річ на шляху падає (§9.12): забіг повз стіл чи поверхню зі стравою, раз за прохід.
  for (const id of SURFACE_IDS) {
    if (!state.home.surfaces[id]) continue;
    const near = (p: Vec): boolean => distanceToRect(p, objectById(id)) <= ZOOMIES.knockReach;
    if (!near(from) && near(cat) && rng.chance(ZOOMIES.knock)) knockOff(state, cat, id);
  }
  act.minutes -= used;
  if (!act.goal && act.minutes > 0) act.goal = randomFloor(rng);
  if (cat.act !== act) return minutes - used;
  const body = state.character.body;
  // Спільна пауза між оглушеннями (§9.12): щойно оглушений персонаж не падає знову — кіт пробігає повз.
  // Падіння персонажа — гучний звук (§9.12): полохливий бігун сам може кинутися ховатися, тож позначка — на забігу.
  if (context.present && act.target === null && Math.hypot(body.x - cat.x, body.y - cat.y) < ZOOMIES.hit && stun(state)) {
    act.target = "hit";
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
  maybeFallIll(state, cat, "fleas", ILLNESS.escapeFleas, stateRng(state, "behavior"));
  emit(state, { type: "cat-returned", cat: cat.id, caught: false });
}

/** Що відчуває кіт на руках (§9.12, «Коліна»): любить руки, терпить чи пручається. */
export function carryFeeling(state: GameState, cat: Cat): "content" | "reluctant" | "struggling" {
  const held = state.character.held;
  const lap = traitLevel(cat, "lap");
  // Узяли проти волі — пручається; «Відхідливий» через образу не пручається (§9.12, рішення автора 2026-10-25).
  const offended = held?.kind === "cat" && held.offended === true && traitLevel(cat, "touchy") >= 0;
  // Хто не любить персонажа, пручається сильніше: терплячий — пручається, любитель рук — лише терпить.
  if (lap < 0 || offended || (aloof(cat) && lap === 0)) return "struggling";
  return lap > 0 && !aloof(cat) ? "content" : "reluctant";
}

/** Шанс укусу за хвилину на руках, коли кіт пручається (§9.12): хто дуже любить персонажа, кусає вдвічі рідше. */
export function carryBiteChance(cat: Cat): number {
  const dislike = Math.max(0, -traitLevel(cat, "lap"));
  return (CARRY.bite + CARRY.biteStep * dislike) * (devoted(cat) ? LOVE_BEHAVIOR.biteFactor : 1);
}

/**
 * Хвилини на руках (§9.12): хто любить руки — настрій і менше потреби в увазі; хто пручається —
 * настрій падає, кіт може вкусити, а після укусу — вирватися й утекти ховатися.
 */
function carried(state: GameState, cat: Cat, minutes: number, rng: Rng): void {
  const lap = traitLevel(cat, "lap");
  const feeling = carryFeeling(state, cat);
  const held = state.character.held;
  if (held?.kind !== "cat") return;
  held.minutes = (held.minutes ?? 0) + minutes;
  // Прояв «Колін» — раз за взяття на руки (рішення автора 2026-10-25, §9.9), але не частіше ніж раз на годину: кота, якого
  // брали й опускали раз у раз, інакше відкривали б за кілька хвилин (перевірка етапу 2026-10-25).
  const notice = (side: 1 | -1): void => {
    if (held.seen === true) return;
    held.seen = true;
    observe(state, cat, "lap", side, false, CARRY.observeEvery);
  };
  if (feeling === "content") {
    changeMood(state, cat, CARRY.mood * lap * minutes);
    cat.needs.attention = Math.max(0, cat.needs.attention - CARRY.attention * minutes);
    // Хвилину муркоче й топчеться на руках — так на руках не поводиться кіт без риси.
    if (held.minutes >= CARRY.seenContent && held.seen !== true) {
      emit(state, { type: "purr", cat: cat.id, enjoyed: true });
      notice(1);
    }
    return;
  }
  if (feeling === "reluctant") return;
  // Пручається саме через рису — не тому, що взяли проти волі чи кіт не любить персонажа.
  const byTrait = lap < 0 && held.offended !== true && !aloof(cat);
  if (byTrait && held.minutes >= CARRY.seenStruggle) notice(-1);
  const dislike = Math.max(0, -lap);
  changeMood(state, cat, CARRY.struggleMood * Math.max(1, dislike) * minutes);
  if (!rng.chance(1 - (1 - carryBiteChance(cat)) ** minutes)) return;
  changeStat(state, "health", PET.biteHealth);
  emit(state, { type: "bite", cat: cat.id });
  if (byTrait) notice(-1);
  if (!rng.chance(CARRY.escape)) return;
  state.character.held = null;
  const at = visibleFloorNear(state, state.character.body);
  cat.x = at.x;
  cat.y = at.y;
  const spot = hideSpot(state, rng);
  start(cat, "hide", spot.at, CAT_ACT_MINUTES.hide, spot.target);
  emit(state, { type: "cat-broke-free", cat: cat.id });
}

/** Хвилини життя одного кота. */
function tickCat(state: GameState, cat: Cat, minutes: number, rng: Rng, context: CatContext): void {
  grow(state, cat, minutes, rng);
  needsMood(state, cat, minutes, context);
  if (cat.away === null && cat.diseases.length > 0) showSymptoms(state, cat, minutes, rng);
  recordMood(cat, minutes);
  if (cat.away !== null) {
    if (cat.away === "stairs" && state.minute >= ESCAPE.returnMinute) returnFromStairs(state, cat);
    return;
  }
  if (isCarried(state, cat)) return carried(state, cat, minutes, rng);
  if (isNewborn(cat)) return nurse(state, cat);
  if (cat.act.target === "robot") ride(state, cat);
  nervous(state, cat, rng);
  revenge(state, cat, minutes, rng);
  if (context.present) sulk(state, cat);
  // Спокійну дію кіт кидає заради нагальної потреби.
  // «Вісімка» під ногами того, хто несе корм, — заради їжі, тож її голод не перериває (§9.12).
  const calm =
    cat.act.kind === "idle" ||
    cat.act.kind === "wander" ||
    cat.act.kind === "hide" ||
    cat.act.kind === "attention" ||
    cat.act.kind === "toy" ||
    (cat.act.kind === "follow" && cat.act.target !== "food");
  if (calm && urgent(state, cat)) decide(state, cat, rng, context);
  if (cat.act.kind === "attention") {
    if (!context.present) cat.act.minutes = 0;
    else {
      // Іти слідом за персонажем; «Сам по собі» не ходить слідом, а чекає, поки підійдуть.
      const body = state.character.body;
      const near = Math.hypot(body.x - cat.x, body.y - cat.y) <= ARRIVED + keepDistance(cat);
      // Прийшов і просить уваги — прояв, який персонаж бачить (§9.9), раз за похід.
      if (near && cat.act.seen !== true) {
        cat.act.seen = true;
        // Прийшов через голод, бо миски порожні, — це не «Ласкавість» (§9.9).
        if (cat.act.forFood !== true) observe(state, cat, "affection");
        // Кіт без риси після неприємного ще чверть години не прийшов би, а «Відхідливий» уже ластиться (§9.12).
        const since = sinceOffense(state, cat);
        if (cat.act.forFood !== true && since !== null && since < TOUCHY.baseMinutes && cat.offense?.seen !== true) {
          cat.offense = { ...cat.offense!, seen: true };
          observe(state, cat, "touchy", -1);
        }
        // «Сам по собі» не пішов слідом, а чекав, поки персонаж повернеться (§9.12).
        if (cat.act.goal === null && cat.act.elapsed >= FOLLOWER.waited) observe(state, cat, "follower", -1);
      }
      if (traitLevel(cat, "follower") >= 0) approach(state, cat);
    }
  }
  revengeSeen(state, cat);
  let left = minutes;
  for (let guard = 0; guard < 8 && left > 1e-9; guard++) {
    if (cat.act.kind === "follow") {
      left = escort(state, cat, left, context);
      if (cat.act.minutes <= 1e-9) decide(state, cat, rng, context);
      continue;
    }
    if (cat.act.kind === "zoomies") {
      left = zoom(state, cat, left, rng, context);
      if (cat.act.minutes <= 1e-9) {
        finish(state, cat, rng);
        decide(state, cat, rng, context);
      }
      continue;
    }
    if (cat.act.goal) {
      left = walk(cat, left, CAT_WALK_TILES_PER_MINUTE * walkFactor(cat));
      if (cat.act.goal) break;
      if (cat.act.kind === "sleep") fellAsleep(state, cat);
      continue;
    }
    const used = Math.min(left, Math.max(0, cat.act.minutes));
    perform(state, cat, used, rng, context);
    cat.act.minutes -= used;
    left -= used;
    if (cat.act.minutes <= 1e-9) {
      const done = cat.act;
      finish(state, cat, rng);
      // Дія, яку почала `finish` (зумі після лотка, прохання їсти, друга порція), лишається.
      if (cat.act === done || cat.act.minutes <= 1e-9) decide(state, cat, rng, context);
    }
  }
}

/** Звідки нервовий кіт кидає справи, щоб вилизатися: з тих, які не шкода кинути (§9.12). */
const NERVOUS_FROM = new Set(["idle", "wander", "attention", "beg", "toy", "follow"]);

/**
 * Нервовий кіт сильно засмутився (§9.12 «Настрій»): щойно звільниться — нічим важливим не зайнятий і його не гладять,
 * не пізніше ніж за 30 хвилин, — з шансом 25% × |рівень| 2 хвилини нервово вилизується, а тоді ховається. Не частіше
 * ніж раз на годину. Прояв «Стресостійкості −».
 */
function nervous(state: GameState, cat: Cat, rng: Rng): void {
  const shaken = cat.shaken;
  if (shaken === undefined) return;
  const e = STRESS_EFFECTS;
  const now = absoluteMinute(state.day, state.minute);
  const activity = state.character.activity;
  const touched = (activity?.kind === "pet" || activity?.kind === "play") && activity.cat === cat.id;
  if (!NERVOUS_FROM.has(cat.act.kind) || touched) {
    if (now - shaken > e.waitMinutes) delete cat.shaken;
    return;
  }
  delete cat.shaken;
  const level = traitLevel(cat, "stress");
  if (level >= 0 || (cat.nervousAt !== undefined && now - cat.nervousAt < e.everyMinutes)) return;
  if (!rng.chance(e.nervousStep * -level)) return;
  cat.nervousAt = now;
  start(cat, "groom", null, e.groomMinutes, "nervous");
  emit(state, { type: "nervous", cat: cat.id });
  observe(state, cat, "stress", -1);
}

/**
 * «Безстрашний» катається на роботі-пилососі (§8.7, §9.12): спершу підбігає до нього (о 12:00 робот ще на базі), а
 * застрибнувши (дія на місці вже йде, `elapsed` > 0), їде з ним; робот повернувся на базу — злазить. Перевірка
 * 2026-10-25: раніше кіт «злазив» у ту саму мить, коли робот рушав, і ніколи не катався.
 */
function ride(state: GameState, cat: Cat): void {
  const act = cat.act;
  const at = robotAt(state);
  if (act.elapsed > 0) {
    if (robotProgress(state) === null) act.minutes = 0;
    else {
      cat.x = at.x;
      cat.y = at.y;
    }
    return;
  }
  // Ще не на роботі — наздоганяє його.
  act.goal = Math.hypot(cat.x - at.x, cat.y - at.y) > NOISE.board ? tileOf(at) : null;
}

/**
 * Кіт дійшов до місця й заснув (§9.12): задрімав у годину пік на очах персонажа, коли кіт без риси ще не задрімав би
 * (втома нижча за звичайний поріг сну цієї години), — прояв «Енергійності −», раз на день (рішення автора 2026-10-25;
 * поріг — перевірка 2026-10-25: дуже втомлений дрімає в години пік і без риси).
 */
function fellAsleep(state: GameState, cat: Cat): void {
  const activity = activityAt(cat, state.minute);
  if (activity < ENERGY.activeHour || cat.needs.fatigue >= SLEEP_START.base + SLEEP_START.activity * activity) return;
  observe(state, cat, "energy", -1, false, MINUTES_PER_DAY);
}

/** Новонароджений лежить у гнізді біля матері й нічого не потребує сам (§9.8). */
function nurse(state: GameState, kitten: Cat): void {
  kitten.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 };
  const mother = motherOf(state, kitten);
  if (mother && mother.away === null && !isCarried(state, mother) && asleep(mother)) {
    kitten.x = mother.x + ((kitten.id % 3) - 1) * 0.25;
    kitten.y = mother.y + 0.15;
  }
  if (kitten.act.kind !== "sleep") start(kitten, "sleep", null, 600);
}

/** Хвилини життя всіх котів удома (§9.3). */
export function tickCats(state: GameState, minutes: number, context: CatContext): void {
  if (state.cats.length === 0) return;
  const rng = stateRng(state, "behavior");
  // Уночі персонаж спить і проявів не бачить (§9.9).
  setWitnessing(context.present);
  if (context.present) {
    noticeRoomChange(state, rng);
    figureEight(state);
    devotedBlinks(state);
  }
  for (const cat of state.cats) tickCat(state, cat, minutes, rng, context);
  if (state.cats.length > 1) tickRelations(state, minutes, rng);
  if (context.present) watchCats(state, minutes);
  setWitnessing(true);
}

/**
 * Кіт у полі зору (§8.2, §9.12): просто дивитися на кота трохи піднімає здоровий глузд — більше,
 * коли він не спить і щось робить. Більше котів — більше, але кожен наступний дає менше: від
 * найкращого k-й кіт дає 1/k свого. Схованого не видно, а з душової кабіни — нікого.
 */
export function watchCats(state: GameState, minutes: number): void {
  const activity = state.character.activity;
  if (activity?.kind === "use" && activity.inside) return;
  const rates = state.cats
    .filter((cat) => cat.act.kind !== "hide" && witnesses(state, cat))
    .map((cat) => (cat.act.kind === "sleep" ? WATCH_SANITY.asleep : WATCH_SANITY.awake))
    .sort((a, b) => b - a);
  const perHour = rates.reduce((sum, rate, i) => sum + rate / (i + 1), 0);
  if (perHour > 0) changeStat(state, "sanity", perHour * DIFFICULTY[state.difficulty].catSanity * (minutes / MINUTES_PER_HOUR));
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
      const hormones = Math.max(fightFactor(a), fightFactor(b));
      if (rng.chance((fight.perMinute + fight.territorialStep * territorial) * hormones * minutes)) startFight(state, a, b);
    }
  }
  for (const cat of cats) if (enemyNear.has(cat.id)) changeMood(state, cat, RELATIONS.enemyMoodPerHour * hours);
}

/** Бійка ворогів (§9.4): обидва зупиняються, летить шерсть. */
function startFight(state: GameState, a: Cat, b: Cat): void {
  const fight = RELATIONS.fight;
  stress(state, a);
  stress(state, b);
  start(a, "fight", null, fight.minutes, `cat:${b.id}`);
  start(b, "fight", null, fight.minutes, `cat:${a.id}`);
  changeMood(state, a, fight.mood, "бійка");
  changeMood(state, b, fight.mood, "бійка");
  changeRelation(state, a, b, fight.relation);
  addMess(state, "fur", visibleFloorNear(state, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), null);
  emit(state, { type: "cat-fight", cats: [a.id, b.id] });
  // Бійка — прояв лише «Товариськості»: «Територіальність» видно у сварці за миску чи лоток (§9.9).
  for (const cat of [a, b]) observe(state, cat, "sociability", -1);
}

/** Чистюля відходить від персонажа в брудному одязі (§9.12). */
export function backAway(state: GameState, cat: Cat, from: Vec): void {
  const dx = cat.x - from.x;
  const dy = cat.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const step = DIRTY_CLOTHES_CATS.backAway;
  const spot = visibleFloorNear(state, { x: cat.x + (dx / length) * step, y: cat.y + (dy / length) * step });
  start(cat, "wander", { x: Math.floor(spot.x), y: Math.floor(spot.y) }, CAT_ACT_MINUTES.wander);
}

/** Персонаж узяв на руки кота, що б'ється (§9.4): бійка закінчується, а розбороняти неприємно. */
export function separateFight(state: GameState, cat: Cat): void {
  if (cat.act.kind !== "fight") return;
  const other = catById(state, cat.act.target);
  if (other?.act.kind === "fight") start(other, "idle", null, 2);
  unpleasantTask(state, RELATIONS.fight.separateSanity);
  emit(state, { type: "fight-stopped", cat: cat.id });
}

/**
 * Іншому котові щось перепало — ласощі, нашийник, вишуканий корм (§9.12): заздрісні коти, що це
 * бачать, дмуться й сваряться з ним; ті, хто «радіє за інших», навпаки, тішаться.
 */
export function envy(state: GameState, lucky: Cat): void {
  for (const other of state.cats) {
    if (other.id === lucky.id || !home(state, other) || asleep(other) || distance(other, lucky) > ENVY.sight) continue;
    const level = traitLevel(other, "envy");
    if (level === 0) continue;
    if (level > 0) {
      changeMood(state, other, ENVY.mood * level, "заздрить");
      changeRelation(state, other, lucky, ENVY.relation * level);
    } else changeMood(state, other, ENVY.glad * -level, "радіє за іншого");
    observe(state, other, "envy", level > 0 ? 1 : -1);
  }
}

/**
 * Мстивий кіт після неприємного від персонажа чи стресу (бійка, переноска) може піти до речей із запахом персонажа — ліжка
 * чи кошика брудної білизни — і залишити там «сюрприз»; тоді образа минає (§9.12, рішення автора 2026-10-25). Іде лише
 * з дій, які не шкода кинути. Брудний лоток і день без уваги — не привід.
 */
const REVENGE_FROM = new Set(["idle", "wander", "attention", "toy", "follow"]);

function revenge(state: GameState, cat: Cat, minutes: number, rng: Rng): void {
  const level = traitLevel(cat, "vengeful");
  const grudge = grudgeAt(cat);
  if (level <= 0 || grudge === null || !REVENGE_FROM.has(cat.act.kind)) return;
  if (absoluteMinute(state.day, state.minute) - grudge > REVENGE.minutes) return;
  if (!rng.chance(1 - (1 - REVENGE.perHour * level) ** (minutes / MINUTES_PER_HOUR))) return;
  // Брудна білизна пахне персонажем так само, як ліжко.
  if (state.home.clothes < START_CLOTHES && rng.chance(0.5)) {
    return start(cat, "revenge", tileOf(LAUNDRY_BASKET), CAT_ACT_MINUTES.toilet, "laundry");
  }
  const bed = objectById("bed");
  start(cat, "revenge", { x: bed.x + bed.w, y: bed.y + bed.h - 1 }, CAT_ACT_MINUTES.toilet, "bed");
}

/**
 * Мстивий кіт іде мститися на очах персонажа — дорогою до ліжка чи кошика або вже там (§9.9, рішення автора
 * 2026-10-25): прояв «Мстивості +», раз за помсту.
 */
function revengeSeen(state: GameState, cat: Cat): void {
  if (cat.act.kind !== "revenge" || cat.act.seen === true || !witnesses(state, cat)) return;
  cat.act.seen = true;
  observe(state, cat, "vengeful");
}

/**
 * «Образливий» дметься після неприємного (§9.12, рішення автора 2026-10-25): персонаж підійшов ближче півтори клітинки —
 * кіт відходить на три й сідає спиною. Прояв «+», раз за образу. Відходить не частіше ніж раз на `TOUCHY.againMinutes`:
 * поки кіт іще йде геть (чи забився в куток і відійти нікуди), він не «відходить» знову щокадру (перевірка етапу
 * 2026-10-25).
 */
const SULK_FROM = new Set(["idle", "wander", "toy"]);

function sulk(state: GameState, cat: Cat): void {
  const offense = cat.offense;
  if (!offense || !sulking(state, cat) || !SULK_FROM.has(cat.act.kind) || distance(cat, state.character.body) >= TOUCHY.near) return;
  const now = absoluteMinute(state.day, state.minute);
  if (offense.turnedAt !== undefined && now - offense.turnedAt < TOUCHY.againMinutes) return;
  turnAway(state, cat);
}

/**
 * «Образливий» відходить від персонажа на три клітинки й сідає спиною, над ним — думка «дметься» (§9.12): так і тоді,
 * коли персонаж підійшов, і коли взявся його гладити. Прояв «+» — раз за образу.
 */
export function turnAway(state: GameState, cat: Cat): void {
  const offense = cat.offense;
  if (!offense) return;
  offense.turnedAt = absoluteMinute(state.day, state.minute);
  backAway(state, cat, state.character.body);
  emit(state, { type: "sulked", cat: cat.id });
  if (offense.seen !== true) {
    offense.seen = true;
    observe(state, cat, "touchy");
  }
}

/** Персонаж приділяє увагу коту: ревниві коти, що не сплять, сердяться на нього (§9.4). */
export function jealousy(state: GameState, cat: Cat): void {
  for (const other of state.cats) {
    if (other.id === cat.id || !home(state, other) || asleep(other) || distance(other, cat) > RELATIONS.jealousySight) continue;
    const level = traitLevel(other, "jealousy");
    // Ревнивий шипить на щасливця — це видно й чути (§9.4); щойно шипів — мовчить і не сердиться (§9.12).
    if (level <= 0 || !hiss(state, other, cat)) continue;
    changeRelation(state, other, cat, RELATIONS.jealousy * level);
    observe(state, other, "jealousy");
  }
}

/** Двері відчинили (§9.12): коти поруч можуть вибігти на сходи. */
export function rollEscapes(state: GameState): void {
  const rng = stateRng(state, "behavior");
  const door = { x: 11, y: 10.5 };
  for (const cat of state.cats) {
    if (cat.away !== null || isCarried(state, cat)) continue;
    if (Math.hypot(cat.x - door.x, cat.y - door.y) > ESCAPE.distance) continue;
    if (!rng.chance(clamp(ESCAPE.base + ESCAPE.step * traitLevel(cat, "escape") + escapeBonus(state, cat), 0, 1))) continue;
    // Персонаж бачить, як кіт вислизнув, — ще поки той біля дверей (§9.9).
    observe(state, cat, "escape");
    cat.away = "stairs";
    cat.x = door.x;
    cat.y = 10.9;
    start(cat, "idle", null, 0);
    emit(state, { type: "escaped", cat: cat.id });
  }
}
