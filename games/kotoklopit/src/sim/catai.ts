// Поведінка котів (§9.3, §9.12): потреби, сутінковий ритм, вибір дії, гра, бешкет і кіт біля роботи.
// Рішення приймаються, коли дія закінчилася чи з'явилася нагальна потреба, тож десятки котів
// не навантажують кадр (§8.5).

import { stun } from "./body";
import { adaptsLonger, avoiding, changeLove, changeMood, forgive, grudgeAt, isAdapting, isKitten, isOld, recordMood, sinceOffense, stress, sulking, traitLevel, upset } from "./cat";
import { lastTileWithin, randomFloor, stepTo, tileAtDistance, tileOf, visibleFloorNear, walk } from "./catmove";
import { changeStat, unpleasantTask } from "./character";
import {
  ACTIVITY_BY_HOUR,
  ADAPTATION_HUNGER,
  AMBUSH,
  APPETITE,
  APPETITE_STEP,
  ATTENTION_SATISFIED,
  BEGGING,
  BOWL_CAPACITY,
  BREEDING,
  CUNNING,
  CARRIER_HOME,
  CARRY,
  CATNIP,
  CAT_ACT_MINUTES,
  CHEWING,
  CLIMBING,
  CAT_WALK_TILES_PER_MINUTE,
  COMPUTER_SLEEP,
  CURIOSITY,
  DIFFICULTY,
  DIRTY_CLOTHES_CATS,
  DEMANDING_SEEN_MINUTES,
  DEVOTION,
  DIRTY_LITTER,
  DRINKING,
  ENERGY,
  ENVY,
  ESCAPE,
  FOLLOWER,
  FOOD_SOUND,
  GROOMING,
  GIFTS,
  GULPING,
  HAIRBALL,
  HISS_PAUSE_MINUTES,
  HOUSE_SLEEP,
  HUNGRY_THEFT,
  HUNTING,
  JEALOUSY,
  ILLNESS,
  KITTEN_PLAY,
  KNOCKING,
  LEGS,
  LITTER_CAPACITY,
  LOVE_BEHAVIOR,
  LOW_CAT_HEALTH,
  MARKING,
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
  NURTURING,
  OBEDIENCE,
  OLD_PLAY,
  PET,
  PETTING,
  PICKY,
  PICKY_REFUSAL_STEP,
  PLAY_RELIEF,
  PLAYFUL,
  PORTION_HUNGER,
  RELATIONS,
  REVENGE,
  SCATTER_CHANCE,
  SCRATCH,
  SHEDDING,
  SLEEP_END,
  SLEEP_RECOVERY_PER_HOUR,
  SLEEP_START,
  SLEEP_TRAIT_STEP,
  SNIFF_MINUTES,
  SOCIABILITY,
  SOFA_REPAIR,
  START_CLOTHES,
  STEAL_HUNGER,
  STERILIZATION,
  STRESS_EFFECTS,
  SURPRISE_CHANCE,
  TALKATIVE,
  TERRITORY,
  THIEF,
  TIRED_FATIGUE,
  TOUCHY,
  TOY,
  TRAIT_EFFECTS,
  TRAIT_NEED_STEP,
  VOMIT_STEP,
  WATCH_SANITY,
  WATER_PLAY,
  WEIGHT,
  WARMTH,
  WINDOW,
  WORK_CAT,
  ZOOMIES,
} from "./config";
import { afterMeal, afterTheft, fallIll, fatigueFactor, hungerFactor, isObese, isUnwell, maybeFallIll, missesLitter, showSymptoms, sleepFactor, toiletFactor, vomitsAfterMeal, walkFactor } from "./diseases";
import { takeSupply } from "./economy";
import { emit, type HissCause, type ScratchSpot } from "./events";
import { robotAt, robotProgress, wearOut } from "./household";
import { inView, observe, setWitnessing, witnesses } from "./knowledge";
import { loudNoise } from "./noise";
import { catFatigueFactor, isCold, isHot, playFactor, thirstFactor, warmthBonus } from "./modifiers";
import { WINDOWS, AMBUSH_SPOTS, BOX_SCRATCH, CABINET_PAW, CARRIER_TILE, COOL_TILE, HIGH_PLACES, isPresent, WIRE_TILE, PAPER_TRAIL, ROLL_TILE, STASHES, TRASH_PAW, distanceToRect, DOORFRAME, hasBoxes, hiddenTile, isSolid, itemPoint, itemTile, LAUNDRY_BASKET, objectAt, objectById, roomAt, ROOMS, RUG, slotById, SLOTS, SURFACE_IDS, TRINKETS, trinketTile, type HomeObject } from "./home";
import { changeRelation, isEnemy, isFriend, isNewcomer, isPal, noteStrife, relation } from "./relations";
import { DOOR, DOOR_TILE } from "./door";
import { breedingHunger, fightFactor, inHeat, isNewborn, motherOf } from "./reproduction";
import { stateRng, type Rng } from "./rng";
import { absoluteMinute } from "./time";
import type { BowlItem, Cat, CatAct, CatActKind, Dish, ForbiddenZone, GameState, HomeItem, LitterItem, MessKind, PlayPhase, Product, Quality, ToyItem, TrinketKind, Vec, WaterItem } from "./types";
import { exercise, gainWeight, settleWeight, weightSeen } from "./weight";
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
  n.thirst = clamp(n.thirst + NEED_PER_HOUR.thirst * hours * thirstFactor(state) * heatThirst(state, cat));
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
  // З ожирінням кіт менше грається (§9.12, «Схильність до повноти»).
  const heavy = isObese(cat) ? WEIGHT.obesePlay : 1;
  n.play = clamp(n.play + NEED_PER_HOUR.play * hours * activityAt(cat, state.minute) * traitFactor(cat, "energy", TRAIT_NEED_STEP) * age * playFactor(state) * heavy);
  // Зайва вага потроху йде (§9.12).
  settleWeight(cat, minutes);
  // Шерстяна грудка: частіше вночі, у довгошерстих і в тих, хто сильно линяє (§9.12).
  const hour = hourOf(state.minute);
  const night = hour >= 23 || hour < 5;
  const long = cat.shape.coat === null && !cat.genes.short[0] && !cat.genes.short[1];
  const rate =
    HAIRBALL.perHour * (night ? HAIRBALL.night : 1) * (long ? HAIRBALL.longHair : 1) * traitFactor(cat, "hairballs", HAIRBALL.step) * traitFactor(cat, "shedding", HAIRBALL.sheddingStep);
  // Мітить (§9.8): некастрований кіт; схильний до міток — і стерилізований, і кішка, від тригерів частіше; «Ніколи не
  // мітить» — ніколи (рішення автора 2026-10-25).
  const marking = traitLevel(cat, "marking");
  const intact = cat.sex === "male" && !cat.sterilized;
  let markRate = intact ? BREEDING.markPerHour : 0;
  if (marking > 0) markRate = Math.max(markRate, markTriggered(state, cat) ? MARKING.triggerPerHour : MARKING.calmPerHour);
  const markChance = markRate * hours * traitFactor(cat, "marking", TRAIT_EFFECTS.markingStep);
  const marks = (intact || marking > 0) && cat.ageWeeks >= BREEDING.minAge && !sleeping && rng.chance(markChance);
  const coughs = state.day > cat.groomedUntil && rng.chance(rate * hours);
  // Лише вдома, не на руках і коли кіт вільний: мітки й грудки лишаються в квартирі. Мітити кіт іде, сидячи чи блукаючи;
  // перед грудкою кахикає — і зі сну (§9.12).
  if (!home(state, cat) || isNewborn(cat)) return;
  if (marks && MARK_FROM.has(cat.act.kind)) {
    start(cat, "mark", markSpot(state, cat), MARKING.minutes);
    return;
  }
  if (coughs && COUGH_FROM.has(cat.act.kind)) {
    start(cat, "cough", null, HAIRBALL.coughMinutes);
    emit(state, { type: "coughing", cat: cat.id });
  }
}

/** Звідки кіт іде мітити: з дій, які не шкода кинути (§9.12). */
const MARK_FROM = new Set(["idle", "wander", "toy", "beg", "attention"]);
/** Звідки кіт починає кахикати перед грудкою: спить чи нічим важливим не зайнятий (§9.12). */
const COUGH_FROM = new Set(["idle", "wander", "toy", "sleep", "beg", "attention", "follow", "hide"]);

/**
 * Тригери міток (§9.12, рішення автора 2026-10-25): поганий настрій (нижче 50), новий кіт удома (до 3 днів), гості, від 4
 * котів, брудний лоток, у кішки — тічка.
 */
export function markTriggered(state: GameState, cat: Cat): boolean {
  if (cat.mood < MARKING.mood || state.modifiers.day === "guests") return true;
  if (cat.sex === "female" && inHeat(state, cat)) return true;
  const others = state.cats.filter((c) => c.id !== cat.id && c.away === null);
  if (others.length + 1 >= MARKING.crowd || others.some((c) => state.day - c.arrivedDay < MARKING.newCatDays)) return true;
  return itemsOf(state, "litter").some(isDirty);
}

/** Куди кіт задкує мітити (§9.12): у найближчий верхній кут своєї кімнати (нижні закриває передня стіна). */
function markSpot(state: GameState, cat: Cat): Vec {
  const room = ROOMS.find((r) => r.id === roomAt(cat)) ?? ROOMS[ROOMS.length - 1];
  if (!room) return tileOf(cat);
  const corners = [
    { x: room.x + 0.5, y: room.y + 0.5 },
    { x: room.x + room.w - 0.5, y: room.y + 0.5 },
  ].map((p) => visibleFloorNear(state, p));
  corners.sort((a, b) => distance(a, cat) - distance(b, cat));
  return tileOf(corners[0] ?? cat);
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
  weatherFeel(state, cat, minutes);
}

/** «Не мерзне» в «Спеку» п'є більше (§9.12, «Теплолюбність»; сюди злито «Чутливість до погоди»). */
function heatThirst(state: GameState, cat: Cat): number {
  const level = traitLevel(cat, "warmth");
  return level < 0 && isHot(state) ? 1 + WARMTH.heatThirstStep * -level : 1;
}

/**
 * Кіт гріється (§9.12, «Теплолюбність»): спить під ковдрою, на комп'ютері, на холодильнику, над батареєю на підвіконні, у будиночку,
 * у сонячній плямі чи купкою з іншим котом, лежить на колінах чи сидить на руках.
 */
function warming(state: GameState, cat: Cat): boolean {
  if (isCarried(state, cat) || cat.act.kind === "lap") return true;
  if (!asleep(cat)) return false;
  if (cat.act.blanket === true || cat.act.target?.startsWith("pile:") === true || cat.act.target?.startsWith("item:") === true) return true;
  const o = objectAt(state, Math.floor(cat.x), Math.floor(cat.y));
  if (o?.kind === "computer" || o?.kind === "fridge" || o?.kind === "windowsill") return true;
  const sun = sunSpot(state.minute);
  return sun !== null && Math.floor(cat.x) === sun.x && Math.floor(cat.y) === sun.y;
}

/**
 * Погода (§9.12, «Теплолюбність»; сюди злито «Чутливість до погоди», рішення автора 2026-10-25): «+» у «Холод» мерзне, «−» у «Спеку»
 * знемагає — поки не гріється (не лежить на прохолодній плитці), втрачає 1 настрою за одиницю на добу, а не сплячи, раз на 3 години
 * показує це (думка — сніжинка чи сонце). Кіт без риси спеки й холоду так не відчуває — це прояв.
 */
function weatherFeel(state: GameState, cat: Cat, minutes: number): void {
  const level = traitLevel(cat, "warmth");
  const feel = level > 0 && isCold(state) ? "cold" : level < 0 && isHot(state) ? "hot" : null;
  if (feel === null || cat.away !== null || isNewborn(cat)) return;
  if (feel === "cold" ? warming(state, cat) : asleep(cat) && cat.act.target === "tile") return;
  changeMood(state, cat, (WARMTH.weatherMood * Math.abs(level) * minutes) / MINUTES_PER_DAY);
  if (asleep(cat) || !home(state, cat)) return;
  const now = absoluteMinute(state.day, state.minute);
  if (cat.weatherAt !== undefined && now - cat.weatherAt < WARMTH.feelEvery) return;
  cat.weatherAt = now;
  emit(state, { type: "weather-felt", cat: cat.id, feel });
  observe(state, cat, "warmth", feel === "cold" ? 1 : -1);
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

/** Кого вилизують (§9.4): друга (`cat:<id>`) чи кошеня («Нянька», `kitten:<id>`); null — кіт вилизується сам. */
const groomee = (state: GameState, target: string | null): Cat | null =>
  target?.startsWith("kitten:") === true ? (state.cats.find((c) => `kitten:${c.id}` === target) ?? null) : catById(state, target);

/** Кота саме вилизує цей кіт (§9.4, рішення автора 2026-10-26, В1): сидить на місці й мружиться. */
const isLickedBy = (cat: Cat, by: Cat): boolean => cat.act.kind === "idle" && cat.act.target === `licked:${by.id}`;

/**
 * Друг, що не спить, на час вилизування сидить на місці обличчям до того, хто вилизує, і мружиться (§9.4, рішення автора
 * 2026-10-26, В1: раніше друг міг піти собі, і вилизування було 2,25 с сидіння поруч); той, що спить, спить далі.
 */
function holdStill(cat: Cat, by: Cat, minutes: number): void {
  if (asleep(cat)) return;
  start(cat, "idle", null, minutes + 1, `licked:${by.id}`);
  cat.facing = by.x > cat.x ? 1 : -1;
}

/**
 * Друг, якого можна вилизати (§9.4): відпочиває, до нього можна підійти, і він за останню годину не відсторонювався від вилизування
 * (§9.12, «Вилизування друзів»). Приятелів не вилизують (рішення автора 2026-10-26, Г1).
 */
function groomable(state: GameState, cat: Cat, other: Cat): boolean {
  const now = absoluteMinute(state.day, state.minute);
  return approachable(state, other) && resting(state, other) && isFriend(state, cat, other) && (other.untouchedAt === undefined || now - other.untouchedAt >= GROOMING.refusedMinutes);
}

/** Шанс вилизати друга в цій ситуації (§9.4, В2): «Вилизування друзів» множить його на 1 + 0,5 × рівень, «−2» — ніколи. */
const groomChance = (cat: Cat, chance: number): number => chance * traitFactor(cat, "grooming", RELATIONS.groom.traitStep);

/** Кіт іде вилизати друга (§9.4): 4–6 хвилин від того, як підійшов. */
function startGroom(cat: Cat, friend: Cat, rng: Rng): void {
  start(cat, "groom", tileOf(friend), between(RELATIONS.groom.minutes, rng), `cat:${friend.id}`);
}

/** Друг пережив стрес за останню годину — і не через цього кота (§9.4, В2). */
function upsetFor(state: GameState, friend: Cat, cat: Cat): boolean {
  const upset = friend.upset;
  return upset !== undefined && upset.by !== cat.id && absoluteMinute(state.day, state.minute) - upset.at <= RELATIONS.groom.upsetMinutes;
}

/**
 * Вільний кіт вилизує друга (§9.4, «Гру й вилизування видно», рішення автора 2026-10-26, В2): друга до 3 клітинок, що пережив
 * стрес, — з шансом 30% (і тому настрій більший), а нема такого — найближчого ближче 2 клітинок з шансом 15%. Раніше — 30% за
 * будь-яке спокійне рішення, друг до 3 клітинок: вилизували будь-коли й скрізь, у 8–10 разів частіше, ніж гралися.
 */
function groomWhenFree(state: GameState, cat: Cat, rng: Rng): boolean {
  const g = RELATIONS.groom;
  const upset = nearestCat(state, cat, (c) => groomable(state, cat, c) && distance(cat, c) <= g.distance && upsetFor(state, c, cat));
  if (upset) {
    if (!rng.chance(groomChance(cat, g.afterStress))) return false;
    startGroom(cat, upset, rng);
    cat.act.comfort = true;
    return true;
  }
  // Найближчого, хто відпочиває (перевірка стосунків 2026-10-26: раніше — першого в списку, хай що він робив).
  const friend = nearestCat(state, cat, (c) => groomable(state, cat, c) && distance(cat, c) <= g.near);
  if (!friend || !rng.chance(groomChance(cat, g.other))) return false;
  startGroom(cat, friend, rng);
  return true;
}

/** Прокинувся після сну купкою — друг поруч (§9.4, В2): з шансом 50% кіт його вилизує. */
function groomAfterSleep(state: GameState, cat: Cat, rng: Rng): boolean {
  const friend = nearestCat(state, cat, (c) => groomable(state, cat, c) && distance(cat, c) <= RELATIONS.sleepTogether.distance);
  if (!friend || !rng.chance(groomChance(cat, RELATIONS.groom.afterSleep))) return false;
  startGroom(cat, friend, rng);
  return true;
}

/**
 * Кіт прийшов лягти до сплячого друга (§9.4, В2): з шансом 30% спершу 1–2 хвилини вилизує його, а потім лягає поруч
 * (`lieDownAfterGroom`).
 */
function groomBeforeSleep(state: GameState, cat: Cat, rng: Rng): boolean {
  const target = cat.act.target;
  const other = target?.startsWith("pile:") === true ? state.cats.find((c) => `pile:${c.id}` === target) : undefined;
  if (!other || !asleep(other) || distance(cat, other) > RELATIONS.sleepTogether.distance || !groomable(state, cat, other)) return false;
  if (!rng.chance(groomChance(cat, RELATIONS.groom.beforeSleep))) return false;
  start(cat, "groom", null, between(RELATIONS.groom.beforeSleepMinutes, rng), `cat:${other.id}`);
  cat.act.beforeSleep = true;
  standBeside(cat, other);
  return true;
}

/** Вилизав друга, до якого прийшов спати (§9.4, В2), — тепер лягає поруч; друг уже прокинувся й пішов — спить, де є. */
function lieDownAfterGroom(state: GameState, cat: Cat, friend: Cat | null): void {
  const pile = friend !== null && home(state, friend) && asleep(friend) && distance(cat, friend) <= RELATIONS.sleepTogether.distance;
  start(cat, "sleep", null, 8 * MINUTES_PER_HOUR, pile ? `pile:${friend.id}` : null);
  fellAsleep(state, cat);
  sleptBeside(state, cat);
  sleptWarm(state, cat);
}

/** Приріст стосунків від вилизування (§9.4, В2): що міцніша дружба, то менше — +2 нижче 70, +1 до 90, +0,5 від 90. */
export function groomGain(value: number): number {
  for (const [below, gain] of RELATIONS.groom.relation) if (value < below) return gain;
  return RELATIONS.groom.relationTop;
}

/**
 * Сварка за миску чи лоток (§9.4): лише з котом поруч, що не спить, — кіт шипить на нього, і це видно. На сплячого й
 * новонародженого не шипить (перевірка стосунків 2026-10-26: раніше шипів на сусіда, що спав біля миски, — стосунки −3).
 */
function resourceConflict(state: GameState, cat: Cat, rng: Rng, enough: boolean, why: "bowl" | "litter"): void {
  if (enough) return;
  const r = RELATIONS.resource;
  // Дзеркально (§9.12, «Територіальність»): «Ділиться» свариться рідше, «Комунар» — ніколи.
  if (!rng.chance(Math.max(0, r.chance + r.territorialStep * traitLevel(cat, "territorial")))) return;
  const others = state.cats.filter((c) => c.id !== cat.id && home(state, c) && !asleep(c) && !isNewborn(c) && distance(c, cat) <= r.distance);
  const other = others[rng.int(0, others.length - 1)];
  if (!other || !hiss(state, cat, other, why)) return;
  changeRelation(state, cat, other, r.relation);
  noteStrife(state, cat, other, "quarrel");
  observe(state, cat, "territorial");
}

/**
 * Чи вистачає мисок чи лотків (§9.4 «Ресурси»; «Згода, охорона й сварки», рішення автора 2026-10-26, Р3 і Р4): котів рахують лише
 * тих, що вдома, без новонароджених; брудний лоток не рахується; лотків — на один більше, ніж котів, мисок — скільки котів, але
 * не більше, ніж є місць (для мисок — поширення виконавця, ухвалено — рішення автора 2026-10-26 після блоку 4). Раніше рахували всіх котів і всі лотки, і з 6 котами лотків не вистачало ніколи.
 */
export function enoughFor(state: GameState, kind: "bowl" | "litter"): boolean {
  const cats = state.cats.filter((c) => c.away === null && !isNewborn(c)).length;
  const places = SLOTS.filter((s) => s.kind === kind).length;
  if (kind === "bowl") return itemsOf(state, "bowl").length >= Math.min(cats, places);
  return itemsOf(state, "litter").filter((box) => !isDirty(box)).length >= Math.min(cats + 1, places);
}

/**
 * Кіт шипить на іншого (§9.4) — це видно й чути; причину (`why`) видно значком поруч зі злістю (§9.4 «Згода, охорона й сварки»,
 * рішення автора 2026-10-26, Р2). Спільна пауза шипіння (§9.12): після попереднього минуло менше 20 хвилин — кіт мовчить, і
 * сварки теж немає (false).
 */
export function hiss(state: GameState, cat: Cat, at: Cat, why?: HissCause): boolean {
  const now = absoluteMinute(state.day, state.minute);
  if (cat.hissedAt !== undefined && now - cat.hissedAt < HISS_PAUSE_MINUTES) return false;
  cat.hissedAt = now;
  emit(state, { type: "hissed", cat: cat.id, at: at.id, ...(why ? { why } : {}) });
  return true;
}

export function litterCapacity(box: LitterItem): number {
  return LITTER_CAPACITY[box.litter ?? "none"];
}

export function isDirty(box: LitterItem): boolean {
  return box.uses >= litterCapacity(box);
}

/** Лоток брудний для цього кота (§9.12): «Принц на горошині» вважає його брудним на одне відвідування раніше. */
export function dirtyFor(cat: Cat, box: LitterItem): boolean {
  const early = traitLevel(cat, "litterPicky") >= DIRTY_LITTER.earlyLevel ? 1 : 0;
  return box.uses >= Math.max(1, litterCapacity(box) - early);
}

/** Миска повна? Для персонажа: чи можна ще насипати (§9.12). */
export function bowlFull(bowl: BowlItem): boolean {
  return bowl.food >= BOWL_CAPACITY && bowl.half !== true;
}

/**
 * Кіт саме просить їсти (§7, §9.12): нявчить біля миски, біля ліжка зранку чи біля їжі на столі, або прийшов до персонажа,
 * бо голодний. Ласощі йому зараз привчають до жебракування. Біля порожньої миски для води він просить пити, а не їсти (§9.4
 * «Згода, охорона й сварки», рішення автора 2026-10-26, Р6).
 */
export function beggingFood(state: GameState, cat: Cat): boolean {
  const act = cat.act;
  if (act.kind === "attention") return act.forFood === true;
  if (act.kind !== "beg" || act.target === "sink" || act.target === "water" || act.target === "door" || act.target === "high") return false;
  return itemById<HomeItem>(state, act.target)?.kind !== "water";
}

/** Висока річ під котом — верх холодильника чи шафи (§9.12, «Лазіння»); null — не нагорі. */
export function highPlaceOf(state: GameState, p: Vec): HomeObject | null {
  const o = objectAt(state, Math.floor(p.x), Math.floor(p.y));
  return o && HIGH_PLACES.includes(o.id) ? o : null;
}

/** Кіт нагорі (§9.12, «Лазіння»): сидить чи спить на холодильнику чи шафі — на руки його не взяти, доки не злізе. */
export function upHigh(state: GameState, cat: Cat): boolean {
  return home(state, cat) && cat.act.goal === null && highPlaceOf(state, cat) !== null;
}

/** Вага високого місця для сну (§9.12, «Лазіння»): 1,5 × рівень, кіт без риси — 0,3, «−» — ніколи. */
export function climbWeight(cat: Cat): number {
  const level = traitLevel(cat, "climbing");
  // З ожирінням нагору не стрибнути (§9.12, «Схильність до повноти»).
  if (level < 0 || isObese(cat)) return 0;
  return level === 0 ? CLIMBING.base : CLIMBING.step * level;
}

/**
 * Кіт виліз нагору (§9.12, «Лазіння»): на очах персонажа — прояв «+». Кошеня застрягає з шансом 20%, «Альпініст» (від +2) — 5%:
 * злізти сам боїться й кричить.
 */
function climbed(state: GameState, cat: Cat, rng: Rng): void {
  if (highPlaceOf(state, cat) === null) return;
  observe(state, cat, "climbing");
  const level = traitLevel(cat, "climbing");
  const chance = isKitten(cat) ? CLIMBING.kitten : level >= CLIMBING.strongLevel ? CLIMBING.strong : 0;
  if (chance > 0 && rng.chance(chance)) cat.stuck = true;
}

/**
 * Кіт нагорі (§9.12, «Лазіння»): застряглий нікуди не йде, а кричить (крім нагального від 95 — тоді зістрибує сам); вільний
 * злазить на вудку в руках персонажа поруч.
 */
function onHigh(state: GameState, cat: Cat, context: CatContext): void {
  if (cat.stuck === true) {
    if (highPlaceOf(state, cat) === null) {
      delete cat.stuck;
      return;
    }
    // Куди б не зібрався — злізти не може: кричить (`decide`).
    if (cat.act.goal !== null) start(cat, "beg", null, CAT_ACT_MINUTES.beg, "high");
    return;
  }
  if (!upHigh(state, cat) || asleep(cat) || !context.present || state.character.held?.kind !== "toy") return;
  const body = state.character.body;
  if (distance(cat, body) <= CLIMBING.lureReach && cat.act.target !== "lured") start(cat, "idle", tileAtDistance(state, body, cat, 1), 2, "lured");
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

/** Дії, яких кіт не кидає, навіть почувши корм: ховається, б'ється чи стоїть у протистоянні, уже їсть, у лотку. */
const BUSY_FOR_FOOD = new Set(["eat", "fight", "standoff", "hide", "toilet"]);

/**
 * У миску насипали корм (§9.12): голодні коти чують це й біжать їсти — найближчі, скільки в мисці
 * порцій, — якщо це їм не суперечить: гурман не біжить на простий корм, соня не прокидається.
 */
export function hearFood(state: GameState, bowl: BowlItem): void {
  const listeners = state.cats.filter((cat) => {
    // Застряглий нагорі злізти не може й на корм (§9.12, «Лазіння»).
    if (cat.away !== null || isCarried(state, cat) || BUSY_FOR_FOOD.has(cat.act.kind) || isAdapting(state, cat) || cat.stuck === true) return false;
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

/**
 * Перебірливий понюхав простий корм і відмовляється (§9.12, рішення автора 2026-10-25): з шансом 40% за одиницю, від
 * голоду 95 — удвічі рідше (голод сильніший). Вирішується, щойно кіт сів до миски, — тож корму він не торкнувся
 * (перевірка етапу 2026-10-25: раніше він їв цілу трапезу, корм меншав, а тоді «відмовлявся», і корм з'являвся знову).
 */
function refusesFood(state: GameState, cat: Cat, rng: Rng): boolean {
  const picky = traitLevel(cat, "picky");
  const bowl = itemById<BowlItem>(state, cat.act.target);
  if (picky <= 0 || !bowl || bowl.food <= 0 || bowl.foodQuality !== "cheap") return false;
  const starving = cat.needs.hunger >= PICKY.starving ? PICKY.starvingFactor : 1;
  return rng.chance(PICKY_REFUSAL_STEP * picky * starving);
}

/**
 * Чистюля понюхав брудний лоток і йде лишити «сюрприз» деінде (§9.12): з шансом 15% + 30% за одиницю «Вибагливості до
 * лотка»; грязнулі не відмовляються. Вирішується, щойно кіт дійшов, — 2 хвилини в лотку він, не сходивши, не сидить
 * (перевірка етапу 2026-10-25).
 */
function refusesLitter(state: GameState, cat: Cat, rng: Rng): boolean {
  const picky = traitLevel(cat, "litterPicky");
  const box = itemById<LitterItem>(state, cat.act.target);
  if (picky < 0 || box?.kind !== "litter" || !dirtyFor(cat, box)) return false;
  return rng.chance(SURPRISE_CHANCE.base + SURPRISE_CHANCE.step * picky);
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
  const eater = state.cats.find(
    (c) => c.away === null && c.act.kind === "eat" && c.act.goal === null && c.act.target === `item:${bowl.id}` && c.act.nibble !== undefined && c.act.refused !== true,
  );
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

/**
 * До цього сплячого кота можна лягти купкою (§9.4): він спить на підлозі, ліжку чи дивані — не в будиночку, переносці,
 * коробках, пральній машині, на комп'ютері чи нагорі (перевірка етапу 2026-10-26: інакше кіт ліз би за іншим на холодильник
 * чи в переноску, хоч сам туди не лазить, а кошеня застрягало б нагорі).
 */
function pileable(state: GameState, other: Cat): boolean {
  if (other.act.goal !== null || (other.act.target !== null && !other.act.target.startsWith("pile:"))) return false;
  return onFloor(state, other);
}

/** Кіт на підлозі, ліжку чи дивані — туди за ним може прийти будь-який кіт (§9.4). */
function onFloor(state: GameState, cat: Cat): boolean {
  const o = objectAt(state, Math.floor(cat.x), Math.floor(cat.y));
  return o === null || o.kind === "bed" || o.kind === "sofa";
}

/**
 * До цього кота можна підійти погратися чи вилизати його (§9.4): він удома, на підлозі, ліжку чи дивані — не нагорі, не в
 * пральній машині, не на комп'ютері чи столі, — і персонаж зараз його не гладить, не грається з ним і не тримає (перевірка
 * стосунків 2026-10-26: кошеня лізло за другом на шафу й застрягало, а кота з-під руки забирали боротися — і ініціатор
 * «боровся» сам, бо пестощі одразу повертали друга до персонажа).
 */
function approachable(state: GameState, other: Cat): boolean {
  return home(state, other) && !getsAttention(state, other) && onFloor(state, other);
}

/**
 * Кіт відпочиває — його можна вилизати (§9.4): сидить чи стоїть без справ або спить там, куди можна лягти купкою. Того, хто
 * йде в лоток, їсть, гасає чи б'ється, не вилизують (перевірка стосунків 2026-10-26: друг ішов далі, а кіт 3 хвилини сидів сам).
 */
function resting(state: GameState, other: Cat): boolean {
  if (other.act.kind === "idle") return other.act.goal === null && other.act.target === null;
  return asleep(other) && pileable(state, other);
}

/** Найближчий інший кіт, що підходить (§9.4): кого вилизати чи з ким погратися. */
function nearestCat(state: GameState, cat: Cat, fits: (other: Cat) => boolean): Cat | null {
  let best: Cat | null = null;
  for (const other of state.cats) {
    if (other.id === cat.id || !fits(other)) continue;
    if (!best || distance(cat, other) < distance(cat, best)) best = other;
  }
  return best;
}

/** Місця для сну з вагою (§9.3, §9.12): ліжко, диван, сонячна пляма, комп'ютер, будиночки, будь-де на підлозі. */
function sleepSpot(state: GameState, cat: Cat, rng: Rng): Spot {
  const bed = objectById("bed");
  const sofa = objectById("sofa");
  const at = (p: Vec): Spot => ({ at: p, target: null });
  // «Нічний сплюх» уночі спить у персонажа в ногах (§9.12, рішення автора 2026-10-25).
  const owl = isNight(state.minute) ? 1 + NOCTURNAL.bedStep * Math.max(0, -traitLevel(cat, "nocturnal")) : 1;
  // «Теплолюбність» (§9.12): холод тягне теплолюбів до ліжка й комп'ютера сильніше, а «Холодостійкого» — ніяк.
  const warmth = traitLevel(cat, "warmth");
  const cold = warmthBonus(state) * Math.max(0, 1 + WARMTH.coldStep * warmth);
  const options: { weight: number; value: Spot }[] = [
    { weight: (3 + cold) * owl, value: at({ x: bed.x + rng.int(0, bed.w - 1), y: bed.y + rng.int(0, bed.h - 1) }) },
    { weight: 3, value: at({ x: sofa.x + rng.int(0, sofa.w - 1), y: sofa.y }) },
    { weight: 1, value: at(randomFloor(rng)) },
    ...houseSpots(state),
  ];
  // Сон купкою: до сплячого друга (§9.4); «Не терпить дотиків» — рідше (§9.12, «Вилизування друзів»). «Товариський» лягає й до
  // кота, що не друг і не ворог (§9.12, «Товариськість»), «Нянька» — до кошеняти: ціль — `pile:<id>`, так видно, до кого ліг.
  const touch = Math.max(0, 1 + GROOMING.pileStep * Math.min(0, traitLevel(cat, "grooming")));
  const social = traitLevel(cat, "sociability");
  const nurturing = traitLevel(cat, "nurturing");
  for (const other of state.cats) {
    if (other.id === cat.id || !home(state, other) || !asleep(other) || isNewborn(other) || !pileable(state, other)) continue;
    const friend = isFriend(state, cat, other);
    // «Нянька» спить, обійнявши кошеня (§9.12, «Турбота про кошенят»).
    const hug = nurturing > 0 && isKitten(other) && !isKitten(cat) ? NURTURING.hugStep * nurturing : 0;
    const weight = Math.max(hug, friend ? RELATIONS.sleepTogether.weight * touch : social > 0 && !isEnemy(state, cat, other) ? SOCIABILITY.pileStep * social : 0);
    if (weight <= 0) continue;
    // Ціль — клітинка того кота: шлях котів веде лише до клітинок (перевірка етапу 2026-10-26: точка між клітинками лишала кота
    // спати там, де стояв), а лягає поруч — `sleptBeside`.
    options.push({ weight, value: { at: tileOf(other), target: `pile:${other.id}` } });
  }
  const sun = sunSpot(state.minute);
  if (sun) options.push({ weight: Math.max(0, WARMTH.sun + warmth), value: at(sun) });
  // Прохолодна плитка у ванній: для «Не мерзне», а в «Спеку» — для всіх (§9.12, «Теплолюбність»).
  // Плитка одна: поки на ній спить кіт чи вже йде туди спати, інший її не обирає (перевірка етапу 2026-10-26: у спеку коти лягали
  // в ту саму точку, один в одного).
  const tile = WARMTH.tileStep * Math.max(0, -warmth) + (isHot(state) ? WARMTH.heatTile : 0);
  const tileTaken = state.cats.some((c) => c.id !== cat.id && home(state, c) && c.act.kind === "sleep" && c.act.target === "tile");
  if (tile > 0 && !tileTaken) options.push({ weight: tile, value: { at: { ...COOL_TILE }, target: "tile" } });
  // Підвіконня над батареєю — тепле місце теплолюба (фінальна перевірка рис 2026-10-26, «Живе на батареї»): найближче вільне,
  // а в «Холод» тягне ще сильніше. Ціль — id підвіконня: так його бачать зайнятим інші коти.
  const sill = warmth > 0 ? (freeSills(state, cat)[0] ?? null) : null;
  if (sill) options.push({ weight: WARMTH.sillStep * warmth + cold, value: { at: { x: sill.x, y: sill.y }, target: sill.id } });
  // Нагорі — на холодильнику (він теплий: вага й від «Теплолюбності») і на шафі в спальні (§9.12, «Лазіння»).
  const climb = climbWeight(cat);
  if (climb > 0) {
    const fridge = objectById("fridge");
    const wardrobe = objectById("wardrobe");
    options.push({ weight: climb + CLIMBING.warmStep * Math.max(0, traitLevel(cat, "warmth")), value: at({ x: fridge.x, y: fridge.y }) });
    options.push({ weight: climb, value: at({ x: wardrobe.x, y: wardrobe.y }) });
  }
  // Відчинена переноска біля дверей — будиночок для «Сам лізе в переноску» (§9.12, «Переноска»).
  // Поки переноска з котом у дорозі, у ній не поспиш (перевірка етапу 2026-10-26).
  const carrier = traitLevel(cat, "carrier");
  if (carrier > 0 && state.home.carrier !== null && (state.trip?.cat ?? null) === null) options.push({ weight: CARRIER_HOME.sleepStep * carrier, value: { at: { ...CARRIER_TILE }, target: "carrier" } });
  // Ящики біля входу з покупками — коробки для допитливих (§9.12, «Допитливість»).
  const curiosity = traitLevel(cat, "curiosity");
  if (curiosity > 0 && hasBoxes(state)) options.push({ weight: CURIOSITY.boxStep * curiosity, value: { at: objectTile("boxes"), target: "boxes" } });
  // Відчинена пральна машина — затишний барабан для допитливих (§8.7).
  if (state.home.washer.state === "idle") {
    const washer = objectById("washer");
    options.push({ weight: 0.5 + Math.max(0, traitLevel(cat, "curiosity")), value: at({ x: washer.x, y: washer.y }) });
  }
  // Пам'ятає «ні» про комп'ютер — там не спить (§9.12, «Слухняність»).
  if (!isWorking(state) && !catOnComputer(state) && noGo(state, cat, "desk") === "go") {
    const computer = objectById("computer");
    // «Поважає роботу» спить на комп'ютері вдвічі рідше, «Байдужий до техніки» — ніколи (рішення автора 2026-10-25).
    const helper = traitLevel(cat, "helper");
    const respect = Math.max(0, 1 + COMPUTER_SLEEP.helperStep * Math.min(0, helper));
    // «Не мерзне» на теплому комп'ютері спить рідше, «Холодостійкий» — ніколи (§9.12, «Теплолюбність»).
    const cool = Math.max(0, 1 + WARMTH.coolStep * Math.min(0, warmth));
    const weight = (COMPUTER_SLEEP.base + cold + COMPUTER_SLEEP.step * (Math.max(0, warmth) + Math.max(0, helper))) * respect * cool;
    options.push({ weight, value: at({ x: computer.x + rng.int(0, computer.w - 1), y: computer.y }) });
  }
  return weightedPick(rng, options) ?? at(randomFloor(rng));
}

/** Сховатися під ліжком, диваном чи в будиночку (§9.6); верхолаз ховається нагорі — на холодильнику чи шафі (§9.12, «Лазіння»). */
export function hideSpot(state: GameState, rng: Rng, cat?: Cat): Spot {
  if (cat && traitLevel(cat, "climbing") > 0 && !isObese(cat)) {
    const high = objectById(HIGH_PLACES[rng.int(0, HIGH_PLACES.length - 1)] ?? "fridge");
    return { at: { x: high.x, y: high.y }, target: null };
  }
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
  // Застряг нагорі (§9.12, «Лазіння»): кричить, доки не знімуть; від нагального (95) зістрибує сам, переляканий.
  if (cat.stuck === true && highPlaceOf(state, cat) !== null) {
    if (Math.max(n.hunger, n.thirst, n.toilet) < CLIMBING.jumpNeed) {
      // Утомилося кричати — засинає нагорі, а прокинувшись, кричить знову (перевірка етапу 2026-10-26).
      if (n.fatigue >= sleepThreshold(cat, state.minute)) return start(cat, "sleep", null, 8 * MINUTES_PER_HOUR);
      return start(cat, "beg", null, CAT_ACT_MINUTES.beg, "high");
    }
    changeMood(state, cat, CLIMBING.jumpMood, "зістрибнув сам");
  }
  delete cat.stuck;
  if (n.toilet >= NEED_THRESHOLD.toilet) {
    // «Байдужий до нового» обходить новий лоток, поки є старий, — навіть брудний (§9.12, «Допитливість»).
    const boxes = avoidNew(state, cat, itemsOf(state, "litter"));
    const box = nearest(cat, boxes.filter((b) => !dirtyFor(cat, b))) ?? nearest(cat, boxes);
    if (box) return start(cat, "toilet", itemTile(box), CAT_ACT_MINUTES.toilet, `item:${box.id}`);
    // Лотка немає: «сюрприз» деінде.
    return start(cat, "toilet", randomFloor(rng), CAT_ACT_MINUTES.toilet, null);
  }
  const hungry = n.hunger >= hungerThreshold(cat);
  if (hungry) {
    const bowls = avoidNew(state, cat, itemsOf(state, "bowl").filter((b) => b.food > 0));
    // Кіт без риси й «+» обирають миску, з якої ніхто не їсть, якщо така є; «Ділиться» їсть і разом (§9.12, «Територіальність»).
    const shares = traitLevel(cat, "territorial") < 0;
    const full = nearest(cat, shares ? bowls : bowls.filter((b) => !bowlTaken(state, cat, b))) ?? nearest(cat, bowls);
    if (full) return start(cat, "eat", itemTile(full), eatMinutes(cat), `item:${full.id}`);
  }
  // Спрага — раніше за прохання їсти: голодний кіт без корму все одно п'є.
  if (n.thirst >= NEED_THRESHOLD.thirst) {
    // «Фонтанолюб» без фонтанчика сідає на умивальник і чекає, щоб відкрили кран (§9.12, рішення автора 2026-10-25).
    const drinking = traitLevel(cat, "drinking");
    if (drinking > 0 && state.home.appliances.fountain === null && rng.chance(DRINKING.sinkStep * drinking)) {
      const sink = objectById("sink");
      return start(cat, "beg", { x: sink.x, y: sink.y }, CAT_ACT_MINUTES.beg, "sink");
    }
    // «+» п'є з вашого кухля на кухонному столі (фінальна перевірка рис 2026-10-26, «П'є зі склянок»): кухоль стоїть, а «ні» про
    // кухню кіт не пам'ятає. Шанс — останнім: кіт без риси rng тут не витрачає.
    if (drinking > 0 && state.home.appliances.fountain === null && !state.home.trinkets?.mug && noGo(state, cat, "kitchen") === "go" && rng.chance(DRINKING.mug)) {
      return start(cat, "drink", trinketTile("mug"), CAT_ACT_MINUTES.drink, "mug");
    }
    const waters = itemsOf(state, "water");
    const water = nearest(cat, avoidNew(state, cat, waters.filter((w) => w.water > 0))) ?? nearest(cat, waters);
    if (water) return start(cat, water.water > 0 ? "drink" : "beg", itemTile(water), water.water > 0 ? CAT_ACT_MINUTES.drink : CAT_ACT_MINUTES.beg, `item:${water.id}`);
    // Мисок для води немає зовсім (розбилися): кіт просить пити там, де вона стояла (§9.12, перевірка стосунків 2026-10-26: раніше
    // мовчки лягав спати й прокидався від спраги щохвилини).
    const slot = SLOTS.find((s) => s.kind === "water");
    if (slot) return start(cat, "beg", { x: slot.x, y: slot.y }, CAT_ACT_MINUTES.beg, "water");
  }
  if (hungry) {
    // Миски порожні: шафка з кормом відчинена — їсть звідти будь-хто, а кмітливий відчиняє її сам — раніше, ніж красти зі
    // столу (§9.12, «Кмітливість у бешкеті»).
    if (cabinetFood(state) && (state.home.cabinetOpen === true || rng.chance(CUNNING.openStep * Math.max(0, traitLevel(cat, "cunning"))))) return startRaid(state, cat, "cabinet");
    // Миски порожні: злодюжка краде людську їжу, а дуже голодний — будь-який кіт (§9.3).
    const food = dishes(state, true).filter((d) => d.dish.kind !== "burnt");
    const steal = food[rng.int(0, food.length - 1)];
    const thief = traitLevel(cat, "thief");
    const starving = n.hunger >= HUNGRY_THEFT.starving ? HUNGRY_THEFT.base * Math.max(0, 1 + HUNGRY_THEFT.starvingStep * thief) : 0;
    if (steal && rng.chance(HUNGRY_THEFT.step * Math.max(0, thief) + starving)) {
      // Пам'ятає «ні» про кухню — не краде; «+» підходить і розвертається (§9.12, «Слухняність»).
      const verdict = noGo(state, cat, "kitchen");
      if (verdict === "go") return start(cat, "steal", objectTile(steal.id), 1, steal.id);
      if (verdict === "remember") return startRemember(state, cat, "kitchen", steal.id);
    }
    // «Чесний» сідає біля їжі на столі й не чіпає її (§9.12, рішення автора 2026-10-25).
    if (steal && thief < 0 && rng.chance(THIEF.waitChance)) return start(cat, "beg", besideObject(state, objectById(steal.id)), THIEF.waitMinutes, steal.id);
    const empty = nearest(cat, itemsOf(state, "bowl"));
    // «Не випрошує» (−2) не йде просити до персонажа — чекає біля миски (§9.12, рішення автора 2026-10-25).
    // Біля персонажа ворог — до нього не йде (§9.4, рішення автора 2026-10-26).
    if (context.present && !aloof(cat) && !avoiding(state, cat) && traitLevel(cat, "begging") > -2 && !enemyAtPerson(state, cat) && rng.chance(0.5)) return startAttention(state, cat, true);
    if (empty) return start(cat, "beg", itemTile(empty), CAT_ACT_MINUTES.beg, `item:${empty.id}`);
  }
  if (n.fatigue >= sleepThreshold(cat, state.minute)) {
    const spot = cat.health < 25 || isAdapting(state, cat) ? hideSpot(state, rng, cat) : sleepSpot(state, cat, rng);
    return start(cat, "sleep", spot.at, 8 * MINUTES_PER_HOUR, spot.target);
  }
  if (isAdapting(state, cat)) {
    const spot = hideSpot(state, rng, cat);
    start(cat, "hide", spot.at, CAT_ACT_MINUTES.hide, spot.target);
    // Полохливий звикає довше: ховається й тоді, коли кіт без риси вже звик би (§9.6, §9.12), — прояв раз на день.
    if (adaptsLonger(state, cat)) observe(state, cat, "bravery", -1, false, MINUTES_PER_DAY);
    return;
  }
  if (startSnack(state, cat, rng)) return;
  // До того, хто працює, кіт іде раніше — посидіти на колінах (§9.12).
  const seek = isWorking(state) ? WORK_CAT.seekAttention : NEED_THRESHOLD.attention;
  // Після неприємного від персонажа кіт якийсь час сам не приходить (§9.12, «Образливість»).
  // Біля персонажа вже стоїть ворог — по увагу не йде (§9.4, рішення автора 2026-10-26: 76–79% бійок були біля ніг персонажа).
  if (context.present && n.attention >= seek && !aloof(cat) && !avoiding(state, cat) && !enemyAtPerson(state, cat)) return startAttention(state, cat);
  if (n.play >= NEED_THRESHOLD.play) return choosePlay(state, cat, rng, context);
  // «Нянька» вилизує кошеня поруч (§9.12, «Турбота про кошенят»).
  const nurturing = traitLevel(cat, "nurturing");
  if (nurturing > 0 && !isKitten(cat)) {
    const kitten = nearestCat(state, cat, (c) => isKitten(c) && approachable(state, c) && resting(state, c) && distance(cat, c) <= RELATIONS.groom.distance);
    if (kitten && rng.chance(NURTURING.groomStep * nurturing)) return start(cat, "groom", tileOf(kitten), between(RELATIONS.groom.minutes, rng), `kitten:${kitten.id}`);
  }
  // Вилизати друга поруч (§9.4, «Гру й вилизування видно», рішення автора 2026-10-26, В2): друга після стресу чи того, хто зовсім поруч.
  if (groomWhenFree(state, cat, rng)) return;
  // Погризти щось (§9.12, «Гризіння»): гризун — частіше, кошеня без риси — інколи (міняються зуби).
  if (rng.chance(chewChance(cat)) && startChew(state, cat, rng)) return;
  // Подивитися у вікно (§9.12, «Вікно»): удень, поруч зі спокійними варіантами — побродити (0,4) і посидіти (0,6).
  const sill = windowWeight(state, cat);
  if (sill > 0 && rng.chance(sill / (1 + sill)) && startWindow(state, cat, rng)) return;
  if (rng.chance(0.4)) return start(cat, "wander", randomFloor(rng), CAT_ACT_MINUTES.wander);
  start(cat, "idle", null, CAT_ACT_MINUTES.idle * (0.5 + rng.next()));
}

/**
 * «Апетит +» перекушує біля повної миски (§9.12, рішення автора 2026-10-26): не голодний (голод від `APPETITE.snackHunger`, але
 * нижче свого порогу), а в мисці вдома є корм — його насипав персонаж чи тримає автогодівниця. З шансом `snackStep` × рівень іде
 * до найближчої такої миски й з'їдає порцію; уся вона зайва — гладшає, як від порції без голоду. Миска — будь-яка вдома: не
 * голодний кіт рідко буває поруч із мискою (з умовою «до 3 клітинок» перекус траплявся раз на 10–20 днів). Гурман простого корму
 * не перекушує, миску, з якої вже їдять, не займає. Кіт без риси й «−» rng тут не витрачають.
 */
function startSnack(state: GameState, cat: Cat, rng: Rng): boolean {
  const appetite = traitLevel(cat, "appetite");
  if (appetite <= 0 || cat.needs.hunger < APPETITE.snackHunger || cat.needs.hunger >= hungerThreshold(cat)) return false;
  const picky = traitLevel(cat, "picky") > 0;
  const full = itemsOf(state, "bowl").filter((b) => b.food > 0 && !(picky && b.foodQuality === "cheap") && !bowlTaken(state, cat, b));
  const bowl = nearest(cat, avoidNew(state, cat, full));
  if (!bowl || !rng.chance(APPETITE.snackStep * appetite)) return false;
  start(cat, "eat", itemTile(bowl), eatMinutes(cat), `item:${bowl.id}`);
  cat.act.snack = true;
  return true;
}

/** Кіт голодний, а корму в мисках немає: по увагу він іде через голод (§9.9, «Ласкавість»). */
function wantsFood(state: GameState, cat: Cat): boolean {
  return cat.needs.hunger >= hungerThreshold(cat) && !itemsOf(state, "bowl").some((b) => b.food > 0);
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
    // Дійшов до персонажа біля дверей: вітається — нявкає (як уміє) і ще трохи крутиться поруч.
    if (act.done !== true && act.seen !== true && distance(cat, body) <= ARRIVED + keepDistance(cat)) {
      act.done = true;
      act.minutes = Math.min(act.minutes, DEVOTION.stayMinutes);
      emit(state, { type: "meow", cat: cat.id, ...(meowVoice(cat).silent ? { silent: true as const } : {}) });
    }
    // Привітання — прояв «Відданості +», щойно персонаж його бачить, а не лише в мить, коли кіт дійшов (рішення автора 2026-10-26:
    // `seen` ставився до `observe`, і прояв пропадав, якщо персонаж саме не бачив кота).
    if (act.done === true && act.seen !== true && witnesses(state, cat)) {
      act.seen = true;
      observe(state, cat, "devotion");
    }
    return minutes - used;
  }
  if (food) {
    // Пів хвилини «вісімкою» під ногами — прояв «Тертя об ноги +», не частіше ніж раз на годину (§9.9).
    if (distance(cat, body) < LEGS.distance) act.rubbed = (act.rubbed ?? 0) + used;
    if (act.seen !== true && (act.rubbed ?? 0) >= LEGS.eightMinutes && witnesses(state, cat)) {
      act.seen = true;
      observe(state, cat, "legs", 1, false, MINUTES_PER_HOUR);
    }
    return minutes - used;
  }
  const room = roomAt(body);
  if (act.seen !== true && act.elapsed <= FOLLOWER.seenWithin && room !== null && room === roomAt(cat) && room !== act.from && witnesses(state, cat)) {
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
  if (!BLINK_ACTS.has(act.kind) || (act.kind === "wander" && (act.target === "play" || act.target === "paper")) || sulking(state, cat)) return false;
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
function choosePlay(state: GameState, cat: Cat, rng: Rng, context: CatContext): void {
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
  // Заборонене місце, яке кіт ще пам'ятає (§9.12, «Слухняність»): «+» підходить і розвертається, решта туди не йде.
  const allowed = (zone: ForbiddenZone, id: string, weight: number, value: Choice): void => {
    const verdict = noGo(state, cat, zone);
    if (verdict === "go") options.push({ weight, value });
    else if (verdict === "remember") options.push({ weight, value: () => startRemember(state, cat, zone, id) });
  };
  if (knock) allowed("kitchen", knock.id, MISCHIEF.knock * traitFactor(cat, "knocking", MISCHIEF.traitStep) * bored, active(() => start(cat, "knock", objectTile(knock.id), 0.5, knock.id)));
  // Дрібничка на столі (§9.12, «Скидання речей»): «−» ходить столами так само часто, як кіт без риси, а дійшовши — може
  // лише обнюхати її й обійти.
  const standing = standingTrinkets(state);
  const trinket = standing[rng.int(0, standing.length - 1)];
  if (trinket) {
    const weight = KNOCKING.weight * Math.max(1, traitFactor(cat, "knocking", MISCHIEF.traitStep)) * bored;
    allowed(zoneOf(trinket.object), trinket.object, weight, active(() => start(cat, "knock", trinketTile(trinket.kind), KNOCKING.sniffMinutes, `trinket:${trinket.kind}`)));
  }
  const food = dishes(state, true).filter((d) => d.dish.kind !== "burnt");
  const steal = food[rng.int(0, food.length - 1)];
  if (steal) {
    const hungry = cat.needs.hunger >= 60 ? 2 : 1;
    allowed("kitchen", steal.id, MISCHIEF.steal * traitFactor(cat, "thief", MISCHIEF.traitStep) * hungry, active(() => start(cat, "steal", objectTile(steal.id), 1, steal.id)));
  }
  // Іграшку під меблями чи в зубах в іншого кота не поганяєш (§9.12, «Подарунки й схованки»).
  const toy = nearest(cat, looseToys(state));
  if (toy) options.push({ weight: MISCHIEF.toy, value: active(() => start(cat, "toy", itemTile(toy), TOY.aloneMinutes, `item:${toy.id}`)) });
  // Понести річ — до ніг персонажа чи в схованку (§9.12, «Подарунки й схованки»).
  const gift = giftWeight(cat);
  if (gift > 0 && (toy !== null || sockFree(state, cat))) options.push({ weight: gift, value: active(() => startCarry(state, cat, rng, context.present)) });
  // «Ігривість +» кличе гратися: несе іграшку до ніг того, хто вдома й не працює (§9.12, «Гра й стосунки котів»).
  const playful = traitLevel(cat, "playful");
  if (playful > 0 && toy !== null && context.present && !isWorking(state)) options.push({ weight: PLAYFUL.inviteStep * playful, value: active(() => startInvite(cat, toy)) });
  // Точити кігті — потреба кожного кота: «Дряпання» трохи змінює, як часто, а передусім — де (§9.12, 2026-10-25).
  const scratching = Math.max(SCRATCH.minWeight, SCRATCH.weight * (1 + SCRATCH.frequencyStep * traitLevel(cat, "scratching")));
  options.push({ weight: scratching * bored, value: active(() => startScratch(state, cat, rng)) });
  // Як часто кличе гратися іншого кота — за віком і «Ігривістю» (§9.4, рішення автора 2026-10-26, Г7). Хворий не кличе, як і не
  // погоджується (§9.4 «Згода, охорона й сварки», рішення автора 2026-10-26 після блоку 4): решта забав — як у здорового.
  const mate = isUnwell(cat) ? null : playmate(state, cat);
  const wrestle = RELATIONS.wrestle;
  const often = (isOld(cat) ? wrestle.old : 1) * traitFactor(cat, "playful", wrestle.playfulStep);
  if (mate && often > 0) options.push({ weight: mate.weight * often, value: active(() => startWrestle(state, cat, mate.cat)) });
  // Гризун гризе й заради гри (§9.12, «Гризіння»).
  const chewing = traitLevel(cat, "chewing");
  if (chewing > 0 && chewTarget(state) !== null) options.push({ weight: CHEWING.playWeight * (1 + chewing), value: active(() => startChew(state, cat, rng)) });
  // Кмітливий перекидає смітник, а «Зломник» лізе в шафку з кормом і ситим (§9.12, «Кмітливість у бешкеті»).
  const cunning = traitLevel(cat, "cunning");
  if (cunning > 0 && !trashTipped(state)) options.push({ weight: CUNNING.trashStep * cunning * bored, value: active(() => startRaid(state, cat, "trash")) });
  if (cunning >= CUNNING.fullLevel && cabinetFood(state)) options.push({ weight: CUNNING.fullWeight, value: active(() => startRaid(state, cat, "cabinet")) });
  // Рулон туалетного паперу у ванній (§9.12, «Мисливський інстинкт»): полювання лапою на річ, що рухається.
  const roll = rollWeight(state, cat);
  if (roll > 0) options.push({ weight: roll * bored, value: active(() => start(cat, "unroll", { ...ROLL_TILE }, HUNTING.pawMinutes, "roll")) });
  // Засідка на персонажа (§9.12, «Засідки»): лише коли є на кого чатувати.
  const ambush = ambushWeight(cat);
  if (ambush > 0 && context.present) options.push({ weight: ambush, value: active(() => startAmbush(cat, rng)) });
  (weightedPick(rng, options) ?? (() => start(cat, "idle", null, CAT_ACT_MINUTES.idle)))();
}

/**
 * Вага розмотування рулону, коли кіт хоче гратися (§9.12, рішення автора 2026-10-25; база — 2026-10-26): 0,05 × (1 + 0,75 × «Мисливський
 * інстинкт»), кошеня — удвічі більша; «−» не розмотує; розмотаний рулон до ранку не повісять новий.
 */
export function rollWeight(state: GameState, cat: Cat): number {
  const level = traitLevel(cat, "hunting");
  if (level < 0 || state.home.rollDown === true) return 0;
  return HUNTING.roll * (1 + HUNTING.rollStep * level) * (isKitten(cat) ? HUNTING.kitten : 1);
}

/** Шанс погризти щось за спокійне рішення (§9.12, «Гризіння»): 2% × рівень, кошеня без риси — 1%, «−» — ніколи. */
export function chewChance(cat: Cat): number {
  const level = traitLevel(cat, "chewing");
  if (level > 0) return CHEWING.decideStep * level;
  return level === 0 && isKitten(cat) ? CHEWING.kitten : 0;
}

/** Що погризти (§9.12, «Гризіння»): пакети в ящиках біля входу, коли вони є, а дріт — коли ніхто не працює й він ще цілий. */
function chewTarget(state: GameState, rng?: Rng): "wire" | "boxes" | null {
  const wire = !isWorking(state) && state.home.wireChewed !== true;
  const boxes = hasBoxes(state);
  if (wire && boxes) return rng?.chance(0.5) === true ? "boxes" : "wire";
  return wire ? "wire" : boxes ? "boxes" : null;
}

/** Кіт іде гризти дріт комп'ютера чи пакети біля входу (§9.12, «Гризіння»). false — гризти нічого. */
export function startChew(state: GameState, cat: Cat, rng: Rng): boolean {
  const target = chewTarget(state, rng);
  if (target === null) return false;
  const minutes = CHEWING.minMinutes + rng.next() * (CHEWING.maxMinutes - CHEWING.minMinutes);
  start(cat, "chew", { ...(target === "wire" ? WIRE_TILE : BOX_SCRATCH) }, minutes, target);
  return true;
}

/**
 * Кіт догриз (§9.12, «Гризіння»): кота так і не забрали — дріт перегризено з шансом 15% (комп'ютер не працює, доки його не
 * полагодять); з пакета в ящиках біля входу пропадає одиниця запасу, а корм і ласощі кіт з'їдає.
 */
function chewDone(state: GameState, cat: Cat, rng: Rng): void {
  const act = cat.act;
  if (act.target === "wire") {
    if (state.home.wireChewed === true || !rng.chance(CHEWING.wireChance)) return;
    state.home.wireChewed = true;
    stopWork(state);
    emit(state, { type: "wire-chewed", cat: cat.id });
    return;
  }
  const boxes = state.home.boxes ?? {};
  const bags = (Object.keys(boxes) as Product[]).flatMap((product) => (["cheap", "premium"] as const).filter((q) => (boxes[product]?.[q] ?? 0) > 0).map((quality) => ({ product, quality })));
  const bag = bags[rng.int(0, bags.length - 1)];
  const box = bag ? boxes[bag.product] : undefined;
  if (!bag || !box) return;
  box[bag.quality] -= 1;
  emit(state, { type: "bag-chewed", cat: cat.id, product: bag.product });
  if (bag.product === "catFood" || bag.product === "sterileFood" || bag.product === "treats") {
    cat.needs.hunger = Math.max(0, cat.needs.hunger - PORTION_HUNGER * (bag.product === "treats" ? 0.25 : 1));
    // Прогризене — теж крадене (§9.12, «Схильність до повноти»; перевірка етапу 2026-10-26: кіт з'їдав пакет, не гладшаючи). Корм
    // для стерилізованих і з пакета — без множника стерилізованого (рішення автора 2026-10-26).
    gainWeight(state, cat, bag.product === "treats" ? WEIGHT.treat : WEIGHT.stolen, bag.product === "sterileFood");
    changeMood(state, cat, 1);
  }
}

/** Кіт гризе на очах персонажа (§9.9): прояв «Гризіння +», раз за раз. */
function chewSeen(state: GameState, cat: Cat): void {
  const act = cat.act;
  if (act.kind !== "chew" || act.goal !== null || act.seen === true || !witnesses(state, cat)) return;
  act.seen = true;
  observe(state, cat, "chewing");
}

/** У шафці з кормом є корм (§9.12, «Кмітливість у бешкеті»): шафка стоїть удома, і в ній щось лишилося. */
function cabinetFood(state: GameState): boolean {
  return isPresent(state, objectById("cat-cabinet")) && state.home.supplies.catFood.cheap + state.home.supplies.catFood.premium > 0;
}

/** Смітник перекинуто, поки сміття не прибрали (§9.12, «Кмітливість у бешкеті»). */
export function trashTipped(state: GameState): boolean {
  return state.home.messes.some((m) => m.kind === "garbage");
}

/**
 * Кіт іде до шафки з кормом чи до смітника (§9.12, «Кмітливість у бешкеті»): зачинену шафку спершу лапає, з відчиненої одразу їсть.
 */
function startRaid(state: GameState, cat: Cat, target: "cabinet" | "trash"): void {
  const open = target === "cabinet" && state.home.cabinetOpen === true;
  start(cat, "raid", { ...(target === "cabinet" ? CABINET_PAW : TRASH_PAW) }, open ? eatMinutes(cat) : CUNNING.pawMinutes, target);
}

/** Чи піддадуться дверцята (§9.12): без замка — так; дешевий замок відчиняє лише «Зломник», і то не завжди; надійний — ніхто. */
function cabinetGives(state: GameState, cat: Cat, rng: Rng): boolean {
  const lock = state.home.lock;
  if (lock === undefined) return true;
  return lock === "cheap" && traitLevel(cat, "cunning") >= CUNNING.fullLevel && rng.chance(CUNNING.cheapLock);
}

/**
 * Кіт біля шафки чи смітника (§9.12, «Кмітливість у бешкеті»). Зачинену шафку лапає — відчинив і їсть, а на замку дверцята
 * лише брязкають; з відчиненої шафки з'їдає порцію запасу (ситий «Зломник» з шансом 30% зригує). Смітник перекидає: гуркіт і
 * сміття на підлозі. Прояв «+» — лапає дверцята чи перекидає смітник на очах персонажа.
 */
function raidDone(state: GameState, cat: Cat, rng: Rng): void {
  const act = cat.act;
  if (act.target === "trash") {
    if (trashTipped(state)) return;
    // Сміття висипається зліва спереду від смітника: просто перед ним клітинку закриває шафка з кормом (перевірка скриншотом).
    const at = visibleFloorNear(state, { x: TRASH_PAW.x + 0.6, y: TRASH_PAW.y + 0.4 });
    addMess(state, "garbage", at, cat.id);
    emit(state, { type: "trash-tipped", cat: cat.id });
    loudNoise(state, "broken", at);
    cat.needs.play = Math.max(0, cat.needs.play - PLAY_RELIEF);
    changeMood(state, cat, 1);
    observe(state, cat, "cunning");
    return;
  }
  if (!cabinetFood(state)) return;
  if (state.home.cabinetOpen !== true) {
    const opened = cabinetGives(state, cat, rng);
    emit(state, { type: "cabinet-pawed", cat: cat.id, opened });
    // Дверцята на замку голодний кіт смикає знову й знову — прояв не частіше ніж раз на пів години (перевірка етапу 2026-10-26).
    observe(state, cat, "cunning", 1, false, opened ? 0 : CUNNING.observeEvery);
    if (!opened) return;
    state.home.cabinetOpen = true;
    return start(cat, "raid", null, eatMinutes(cat), "cabinet");
  }
  const full = cat.needs.hunger < hungerThreshold(cat);
  const quality = takeSupply(state, "catFood");
  if (quality === null) return;
  cat.needs.hunger = Math.max(0, cat.needs.hunger - PORTION_HUNGER);
  // Крадене з шафки — понад порції (§9.12, «Схильність до повноти»).
  gainWeight(state, cat, WEIGHT.stolen);
  changeMood(state, cat, quality === "premium" ? MOOD.premiumFood : MOOD.cheapFood, "корм із шафки");
  emit(state, { type: "cat-ate", cat: cat.id, quality });
  // Стерилізованому — лише корм для стерилізованих (§9.8): у шафці — звичайний.
  if (cat.sterilized) maybeFallIll(state, cat, "urolithiasis", ILLNESS.regularFoodStones * stonesFactor(state, cat), rng);
  if (full && rng.chance(CUNNING.fullVomit)) addMess(state, "vomit", visibleFloorNear(state, { x: cat.x, y: cat.y + 0.6 }), cat.id);
}

/**
 * Вага «понести річ», коли кіт хоче гратися (§9.12, рішення автора 2026-10-25): 0,15 × (1 + «Подарунки й схованки»), кіт без
 * риси — 0,05, «−» — ніколи.
 */
export function giftWeight(cat: Cat): number {
  const level = traitLevel(cat, "gifts");
  if (level < 0) return 0;
  return level === 0 ? GIFTS.base : GIFTS.weight * (1 + level);
}

/** Кіт несе іграшку з цим id у зубах (§9.12): її малюють у нього в зубах, а не на підлозі. */
export function carriedToy(state: GameState, toy: ToyItem): Cat | null {
  return state.cats.find((c) => c.act.kind === "carry" && c.act.carry === "toy" && c.act.picked === true && c.act.dropped !== true && c.act.target === `item:${toy.id}`) ?? null;
}

/** Іграшки на підлозі, якими кіт може гратися чи які може понести: не під меблями й не в зубах в іншого кота (§9.12). */
function looseToys(state: GameState): ToyItem[] {
  const taken = new Set(state.cats.filter((c) => c.act.kind === "carry" && c.act.carry === "toy").map((c) => c.act.target));
  return itemsOf(state, "toy").filter((t) => t.hidden === undefined && !taken.has(`item:${t.id}`));
}

/** Шкарпетку можна взяти (§9.12): кошик брудної білизни не порожній, у схованці її ще немає й ніхто інший її не несе. */
function sockFree(state: GameState, cat: Cat): boolean {
  if (state.home.clothes >= START_CLOTHES || state.home.sock === true) return false;
  return !state.cats.some((c) => c.id !== cat.id && c.act.kind === "carry" && c.act.carry === "sock");
}

/**
 * Кіт іде по річ (§9.12, «Подарунки й схованки»): іграшку з підлоги чи вашу шкарпетку з кошика білизни — навпіл, коли є і те,
 * і те. Іграшку з шансом 50% несе до ваших ніг (коли ви вдома), інакше заганяє під диван чи холодильник; шкарпетку — у схованку
 * під диваном.
 */
export function startCarry(state: GameState, cat: Cat, rng: Rng, present: boolean): void {
  const toy = nearest(cat, looseToys(state));
  const sock = sockFree(state, cat);
  if (sock && (toy === null || rng.chance(0.5))) {
    start(cat, "carry", tileOf(LAUNDRY_BASKET), GIFTS.pickMinutes, "sock");
    cat.act.carry = "sock";
    cat.act.dest = "sofa";
    return;
  }
  if (!toy) return;
  start(cat, "carry", itemTile(toy), GIFTS.pickMinutes, `item:${toy.id}`);
  cat.act.carry = "toy";
  cat.act.dest = present && rng.chance(GIFTS.feet) ? "feet" : rng.chance(GIFTS.fridge) ? "fridge" : "sofa";
}

/**
 * «Ігривість +» кличе гратися (§9.12, «Гра й стосунки котів»): іде по іграшку й несе її до ніг персонажа — як подарунок, але
 * чекає поруч довше (`PLAYFUL.inviteMinutes`).
 */
function startInvite(cat: Cat, toy: ToyItem): void {
  start(cat, "carry", itemTile(toy), GIFTS.pickMinutes, `item:${toy.id}`);
  cat.act.carry = "toy";
  cat.act.dest = "feet";
  cat.act.invite = true;
}

/** Іграшка під диваном чи холодильником (§9.12): видно лише краєчок, поки її не дістануть. */
function hideToy(toy: ToyItem, where: "sofa" | "fridge"): void {
  toy.hidden = where;
  toy.x = STASHES[where].at.x;
  toy.y = STASHES[where].at.y;
}

/**
 * Кіт дійшов із річчю (§9.12): узяв у зуби — несе далі; у схованці — шкарпетка чи іграшка під диваном чи холодильником. Річ
 * забрали чи вже сховали — нести нічого.
 */
function carryDone(state: GameState, cat: Cat): void {
  const act = cat.act;
  const toy = act.carry === "toy" ? itemById<ToyItem>(state, act.target) : null;
  if (act.carry === "toy" && (toy?.kind !== "toy" || toy.hidden !== undefined)) return;
  if (act.carry === "sock" && !sockFree(state, cat)) return;
  const dest = act.dest ?? "sofa";
  if (act.picked !== true) {
    const goal = dest === "feet" ? tileOf(state.character.body) : { ...STASHES[dest].tile };
    const wait = act.invite === true ? PLAYFUL.inviteMinutes : GIFTS.waitMinutes;
    start(cat, "carry", goal, dest === "feet" ? wait : GIFTS.pickMinutes, act.target);
    Object.assign(cat.act, { carry: act.carry, dest, picked: true, ...(act.invite === true ? { invite: true } : {}) });
    return;
  }
  if (dest === "feet") return;
  if (act.carry === "sock") state.home.sock = true;
  else if (toy) hideToy(toy, dest);
}

/**
 * Кіт приніс іграшку до ніг персонажа (§9.12): кладе її, дивиться на нього й нявкає. Пограєтеся з ним вудкою протягом 10 хвилин —
 * любов +1 (`play` у `actions.ts`).
 */
function dropGift(state: GameState, cat: Cat): void {
  const act = cat.act;
  act.dropped = true;
  const toy = itemById<ToyItem>(state, act.target);
  if (toy?.kind !== "toy") return;
  const body = state.character.body;
  cat.facing = body.x >= cat.x ? 1 : -1;
  const at = visibleFloorNear(state, { x: (cat.x + body.x) / 2, y: (cat.y + body.y) / 2 + 0.2 });
  toy.x = at.x;
  toy.y = at.y;
  cat.gift = absoluteMinute(state.day, state.minute);
  emit(state, { type: "meow", cat: cat.id, ...(meowVoice(cat).silent ? { silent: true as const } : {}) });
  // Поклав іграшку й кличе гратися — прояв «Ігривості +» (§9.9).
  if (act.invite === true) observe(state, cat, "playful");
}

/**
 * Поки кіт несе річ (§9.12): іграшка в зубах їде разом із ним; до ніг персонажа він іде туди, де той зараз, а персонажа вдома
 * вже немає — несе в схованку під диваном. Іграшку забрали з зубів — нести нічого.
 */
function carryAlong(state: GameState, cat: Cat, context: CatContext): void {
  const act = cat.act;
  if (act.kind !== "carry" || act.picked !== true || act.dropped === true) return;
  if (act.dest === "feet") {
    if (!context.present) {
      act.dest = "sofa";
      act.goal = { ...STASHES.sofa.tile };
      act.minutes = GIFTS.pickMinutes;
    } else if (act.goal !== null && distance(cat, state.character.body) > ARRIVED) act.goal = tileOf(state.character.body);
  }
  if (act.carry !== "toy") return;
  const toy = itemById<ToyItem>(state, act.target);
  if (toy?.kind !== "toy") {
    act.goal = null;
    act.minutes = 0;
    return;
  }
  toy.x = cat.x;
  toy.y = cat.y;
}

/** Кіт несе річ у зубах на очах персонажа (§9.9): прояв «Подарунків +», раз за річ. */
function carrySeen(state: GameState, cat: Cat): void {
  const act = cat.act;
  if (act.kind !== "carry" || act.picked !== true || act.seen === true || !witnesses(state, cat)) return;
  act.seen = true;
  // Кличе гратися — це «Ігривість», а не «Подарунки» (прояв — коли поклав іграшку, `dropGift`).
  if (act.invite !== true) observe(state, cat, "gifts");
}

/**
 * Вага засідки, коли кіт хоче гратися (§9.12, рішення автора 2026-10-25): 0,25 × «Засідки», кіт без риси — 0,04, кошеня —
 * щонайменше 0,1, «−» — ніколи; ×2, якщо сьогодні з ним ще не гралися вудкою 5 хвилин, і ×0,5, якщо гралися.
 */
export function ambushWeight(cat: Cat): number {
  const level = traitLevel(cat, "ambush");
  if (level < 0) return 0;
  const base = Math.max(AMBUSH.step * level, level === 0 ? AMBUSH.base : 0, isKitten(cat) ? AMBUSH.kitten : 0);
  return base * ((cat.playedToday ?? 0) >= AMBUSH.playedMinutes ? AMBUSH.played : AMBUSH.bored);
}

/**
 * Кіт сідає в засідку (§9.12, «Засідки»): за диваном, біля ліжка чи в проході — в одне з двох найближчих до нього місць — і
 * чекає до 10 хвилин.
 */
export function startAmbush(cat: Cat, rng: Rng): void {
  const spots = [...AMBUSH_SPOTS].sort((a, b) => distance(a, cat) - distance(b, cat));
  const spot = spots[rng.int(0, Math.min(1, spots.length - 1))] ?? spots[0] ?? tileOf(cat);
  start(cat, "ambush", { ...spot }, AMBUSH.minutes);
}

/**
 * Персонаж пройшов повз кота в засідці (§9.12, «Засідки»): кіт кидається на ноги — пів хвилини оглушення (спільна пауза:
 * щойно оглушеного не валить знову), «Ніндзя» ще й дряпає, — і мчить геть. Прояв «+» — раз за засідку.
 */
function pounce(state: GameState, cat: Cat, rng: Rng): void {
  const seen = cat.act.seen === true;
  changeMood(state, cat, 1);
  // Кіт мчить геть і вже нікого не збиває (ціль «hit», як у зумі, що вже збили персонажа); домчавши, награвся — як після гри
  // наодинці (`finish` зумі знімає потребу гри; перевірка етапу 2026-10-26: тут вона знімалася ще раз, удвічі).
  start(cat, "zoomies", randomFloor(rng), AMBUSH.dashMinutes, "hit");
  if (!seen) observe(state, cat, "ambush");
  if (!stun(state)) return;
  emit(state, { type: "ambushed", cat: cat.id });
  if (traitLevel(cat, "ambush") >= AMBUSH.strongLevel) changeStat(state, "health", AMBUSH.health);
}

/**
 * Кіт у засідці (§9.12): персонаж поруч — стрибок; з вудкою в руках кіт на ноги не кидається — з ним можна гратися.
 * Кіт у засідці на очах персонажа (виляє задом) — прояв «Засідок +», раз за засідку.
 */
function lurk(state: GameState, cat: Cat, rng: Rng, context: CatContext): void {
  const act = cat.act;
  if (act.kind !== "ambush" || act.goal !== null || !context.present) return;
  const character = state.character;
  const inside = character.activity?.kind === "use" && character.activity.inside === true;
  if (!inside && character.held?.kind !== "toy" && distance(cat, character.body) < AMBUSH.reach) return pounce(state, cat, rng);
  if (act.seen !== true && witnesses(state, cat)) {
    act.seen = true;
    observe(state, cat, "ambush");
  }
}

/**
 * Зумі чи бешкет у нічну годину (§9.12): сова, що ще не спить, бачить, як нічний кіт гасає, — прояв «Нічної
 * активності +», не частіше ніж раз за ніч (рішення автора 2026-10-25).
 */
function nightMischief(state: GameState, cat: Cat): void {
  if (isNight(state.minute)) observe(state, cat, "nocturnal", 1, false, NOCTURNAL.mischiefEvery);
}

/**
 * З ким погратися й з якою вагою (§9.4): удома, не спить, нічим не зайнятий і до нього можна підійти (`approachable`). Найближчий
 * друг, а нема — найближчий приятель з удвічі меншою вагою (рішення автора 2026-10-26, Г1). Кошеня кличе й будь-кого, хто не
 * ворог, — і всіх з вагою друга × 2,5 (Г2). Дорослий з «Турботою про кошенят» «−» і кошеня, що не друзі, разом не граються: він
 * таких кошенят відганяє (`shoos`; перевірка блоку 2).
 */
function playmate(state: GameState, cat: Cat): { cat: Cat; weight: number } | null {
  const w = RELATIONS.wrestle;
  const kitten = isKitten(cat);
  const now = absoluteMinute(state.day, state.minute);
  // Щойно відмовився гратися — пів години його не кличуть (§9.4 «Згода, охорона й сварки», Г5).
  const declined = (other: Cat): boolean => other.playDeclinedAt !== undefined && now - other.playDeclinedAt < w.decline.pause;
  const free = (other: Cat): boolean =>
    callable(cat, other) &&
    approachable(state, other) &&
    !declined(other) &&
    !shoos(state, cat, other) &&
    !shoos(state, other, cat);
  const friend = nearestCat(state, cat, (other) => free(other) && isFriend(state, cat, other));
  if (friend) return { cat: friend, weight: w.weight * (kitten ? w.kitten : 1) };
  if (kitten) {
    const anyone = nearestCat(state, cat, (other) => free(other) && !isEnemy(state, cat, other));
    return anyone ? { cat: anyone, weight: w.weight * w.kitten } : null;
  }
  const pal = nearestCat(state, cat, (other) => free(other) && isPal(state, cat, other));
  return pal ? { cat: pal, weight: w.palWeight } : null;
}

/**
 * Кого можна кликати гратися (§9.4 «Згода, охорона й сварки», рішення автора 2026-10-26, Г6): лише поруч — у тій самій кімнаті чи
 * ближче 4 клітинок — і лише вільного: стоїть чи бродить без особливої цілі. Раніше кликали з будь-якої кімнати й зривали з
 * особливих станів (папір, коліно персонажа, вудка, вилизування).
 */
function callable(cat: Cat, other: Cat): boolean {
  const act = other.act;
  const free = (act.kind === "idle" && act.target === null) || (act.kind === "wander" && (act.target === null || act.target === "play"));
  if (!free) return false;
  const room = roomAt(cat);
  return (room !== null && room === roomAt(other)) || distance(cat, other) < RELATIONS.wrestle.call;
}

/**
 * Дорослий з «Турботою про кошенят» «−» відганяє це кошеня (§9.12): шипить і б'є лапою, коли воно лізе, — якщо вони не друзі
 * (`swatKitten`). Тож і гратися вони разом не кличуть (перевірка блоку 2, 2026-10-26: кошеня кликало «Сам ще кошеня», і той
 * слухняно грався).
 */
const shoos = (state: GameState, adult: Cat, kitten: Cat): boolean =>
  !isKitten(adult) && isKitten(kitten) && traitLevel(adult, "nurturing") < 0 && !isFriend(state, adult, kitten);

/**
 * Боротьба й погоня з другом (§9.4): друг чекає, поки кіт підбіжить (не довше `wait`), а хвилини гри йдуть обом від зустрічі
 * (`metMate`; перевірка стосунків 2026-10-26: друг чекав 3 хвилини плюс відстань по прямій, тож із сусідньої кімнати кіт
 * приходив до порожнього місця).
 */
function startWrestle(state: GameState, cat: Cat, mate: Cat): void {
  observe(state, cat, "sociability");
  const w = RELATIONS.wrestle;
  // Хвилини гри ініціатора відлічуються від зустрічі (`metMate`): доти він біжить до друга.
  start(cat, "wrestle", tileOf(mate), w.minutes[1], `cat:${mate.id}`);
  start(mate, "wrestle", null, w.wait, `cat:${cat.id}`);
}

/** Кіт зараз грається саме з цим другом (§9.4). */
const wrestlesWith = (cat: Cat, mate: Cat): boolean => cat.act.kind === "wrestle" && cat.act.target === `cat:${mate.id}`;

/**
 * Кіт підбіг до друга гратися (§9.4): друг дочекався — 6–8 хвилин гри йдуть обом від цієї миті, і гра йде фазами; веде їх той, хто
 * кликав, і першу засідку влаштовує він (рішення автора 2026-10-26, Г3). Друг не дочекався — гри немає.
 */
function metMate(state: GameState, cat: Cat, rng: Rng): void {
  const act = cat.act;
  const mate = catById(state, act.target);
  const w = RELATIONS.wrestle;
  if (!mate || !home(state, mate) || !wrestlesWith(mate, cat) || distance(cat, mate) > w.reach) {
    act.refused = true;
    act.minutes = 0;
    return;
  }
  // Друг може й не схотіти (§9.4 «Згода, охорона й сварки», рішення автора 2026-10-26, Г5).
  if (!rng.chance(playAcceptance(mate))) return declinePlay(state, mate, cat);
  const minutes = between(w.minutes, rng);
  act.paired = true;
  act.minutes = minutes;
  mate.act.paired = true;
  mate.act.minutes = minutes;
  standBeside(cat, mate);
  mate.facing = cat.x > mate.x ? 1 : -1;
  act.lead = true;
  enterPhase(state, cat, mate, "ambush", cat.id, rng);
}

/**
 * Шанс, що покликаний кіт погодиться гратися (§9.4 «Згода, охорона й сварки», рішення автора 2026-10-26, Г5): 0,3 + гра/100 −
 * втома/200 + 0,15 × «Ігривість», кошеня — +0,3, старий — −0,3, у межах 0,1…0,95; хворий — ніколи.
 */
export function playAcceptance(mate: Cat): number {
  const a = RELATIONS.wrestle.accept;
  if (isUnwell(mate)) return 0;
  const chance =
    a.base + a.play * mate.needs.play + a.fatigue * mate.needs.fatigue + a.playfulStep * traitLevel(mate, "playful") + (isKitten(mate) ? a.kitten : 0) + (isOld(mate) ? a.old : 0);
  return clamp(chance, a.min, a.max);
}

/**
 * Покликаний відмовився гратися (§9.4, Г5): лягає обличчям до того, хто кликав, і сіпає хвостом, хворий ще й шипить на нього; той
 * відходить (упритул двоє котів на телефоні зливалися в одну пляму). Гри немає нікому, і пів години цього кота не кличуть.
 */
function declinePlay(state: GameState, mate: Cat, cat: Cat): void {
  const d = RELATIONS.wrestle.decline;
  const sick = isUnwell(mate);
  // Обличчям до того, хто кликав; той, добігши, міг стати на ту саму точку — тоді назустріч йому.
  mate.facing = Math.abs(cat.x - mate.x) > 0.05 ? (cat.x > mate.x ? 1 : -1) : -cat.facing;
  start(mate, "idle", null, d.minutes, `declined:${cat.id}`);
  mate.playDeclinedAt = absoluteMinute(state.day, state.minute);
  stepAway(state, cat, mate, d.leave, `refused:${mate.id}`);
  emit(state, { type: "play-declined", cat: mate.id, by: cat.id, sick });
  if (sick) hiss(state, mate, cat);
}

// --- Гра двох котів фазами (§9.4, «Гру й вилизування видно», рішення автора 2026-10-26, Г3) --------

/** Яка фаза йде за якою: по колу, доки не скінчиться час гри. */
const NEXT_PHASE: Record<PlayPhase, PlayPhase> = { ambush: "chase", chase: "tussle", tussle: "pause", pause: "ambush" };

/** Повернути кота обличчям до іншого. */
function faceTo(cat: Cat, other: Vec): void {
  if (Math.abs(other.x - cat.x) > 0.01) cat.facing = other.x > cat.x ? 1 : -1;
}

/**
 * Куди бігти чи відходити в грі (§9.4, Г3): випадкова клітинка підлоги в кімнаті кота (у проході — до `passage` клітинок від
 * нього), яку видно й яка підходить (`fits` — за серединою клітинки). Немає такої — null.
 */
function playSpot(state: GameState, cat: Cat, rng: Rng, fits: (p: Vec) => boolean): Vec | null {
  const near = RELATIONS.wrestle.passage;
  const room = ROOMS.find((r) => r.id === roomAt(cat));
  const area = room ?? { x: Math.floor(cat.x) - near, y: Math.floor(cat.y) - near, w: 2 * near + 1, h: 2 * near + 1 };
  const tiles: Vec[] = [];
  for (let y = area.y; y < area.y + area.h; y++) {
    for (let x = area.x; x < area.x + area.w; x++) {
      if (!isSolid(state, x, y) && !hiddenTile(x, y) && fits({ x: x + 0.5, y: y + 0.5 })) tiles.push({ x, y });
    }
  }
  return tiles[rng.int(0, tiles.length - 1)] ?? null;
}

/** Утікач обирає, куди бігти (§9.4, Г3): щонайменше на `run` клітинок. */
function runFrom(state: GameState, cat: Cat, rng: Rng): void {
  const spot = playSpot(state, cat, rng, (p) => distance(cat, p) >= RELATIONS.wrestle.run);
  if (spot) cat.act.run = spot;
  else delete cat.act.run;
}

/**
 * Почати фазу гри (§9.4, Г3): її тривалість, мисливець (`chaser`) і що роблять обидва. Засідка — той, на кого чатують, відходить
 * на 1,5–2,5 клітинки; погоня — тікає; боротьба — мисливець наздоганяє й стає впритул; пауза — обидва сидять обличчям одне до
 * одного. Веде той, хто кликав (`lead`), а другому копіює фазу.
 */
function enterPhase(state: GameState, lead: Cat, mate: Cat, phase: PlayPhase, chaser: number, rng: Rng): void {
  const w = RELATIONS.wrestle;
  const hunter = chaser === lead.id ? lead : mate;
  const prey = hunter === lead ? mate : lead;
  lead.act.game = { phase, left: between(w[phase], rng), chaser, swap: 1 };
  delete hunter.act.run;
  delete prey.act.run;
  if (phase === "ambush") {
    const [near, far] = w.sneak;
    const spot = playSpot(state, prey, rng, (p) => distance(hunter, p) >= near && distance(hunter, p) <= far);
    if (spot) prey.act.run = spot;
    faceTo(hunter, prey);
  }
  if (phase === "chase") runFrom(state, prey, rng);
  if (phase === "tussle") hunter.act.run = tileOf(prey);
  if (phase === "pause") {
    faceTo(hunter, prey);
    faceTo(prey, hunter);
  }
  mate.act.game = { ...lead.act.game };
}

/**
 * Хвилини гри для того, хто веде (§9.4, Г3): у погоні й боротьбі щохвилини ролі міняються з шансом 50%; фаза скінчилася — наступна
 * (у засідку — будь-хто з двох мисливцем, 50%).
 */
function advanceGame(state: GameState, lead: Cat, mate: Cat, minutes: number, rng: Rng): void {
  const game = lead.act.game;
  if (!game) return;
  const w = RELATIONS.wrestle;
  game.left -= minutes;
  if (game.phase === "chase" || game.phase === "tussle") {
    game.swap -= minutes;
    if (game.swap <= 0) {
      game.swap += 1;
      if (rng.chance(w.swap)) {
        game.chaser = game.chaser === lead.id ? mate.id : lead.id;
        const hunter = game.chaser === lead.id ? lead : mate;
        const prey = hunter === lead ? mate : lead;
        // У погоні тепер тікає той, хто наздоганяв; у боротьбі той, хто був знизу, — зверху.
        delete hunter.act.run;
        if (game.phase === "chase") runFrom(state, prey, rng);
      }
    }
  }
  if (game.left > 0) {
    mate.act.game = { ...game };
    return;
  }
  const next = NEXT_PHASE[game.phase];
  const chaser = next === "ambush" ? (rng.chance(0.5) ? lead.id : mate.id) : game.chaser;
  enterPhase(state, lead, mate, next, chaser, rng);
}

/**
 * Рух обох котів у грі (§9.4, Г3) — за того, хто веде: спершу утікач, потім мисливець до його нового місця, тож і за довгий крок
 * часу (уночі — хвилина, коли утікач пробігає 7,5 клітинки) мисливець не відстає. У засідці мисливець припав до підлоги обличчям
 * до другого, а той підтюпцем відходить; у погоні утікач біжить кімнатою швидкістю зумі, а мисливець тримається за ним за
 * клітинку, і обидва можуть скинути річ зі столу, як зумі; у боротьбі мисливець наздоганяє й стає впритул збоку; у паузі обидва
 * сидять обличчям одне до одного.
 */
function playMoves(state: GameState, lead: Cat, mate: Cat, minutes: number, rng: Rng): void {
  const game = lead.act.game;
  if (!game) return;
  const w = RELATIONS.wrestle;
  const hunter = game.chaser === lead.id ? lead : mate;
  const prey = hunter === lead ? mate : lead;
  const fast = CAT_WALK_TILES_PER_MINUTE * ZOOMIES.speed;
  if (game.phase === "ambush") {
    faceTo(hunter, prey);
    const spot = prey.act.run;
    if (spot && stepTo(prey, spot, minutes, CAT_WALK_TILES_PER_MINUTE * w.trot * walkFactor(prey)).arrived) delete prey.act.run;
    return;
  }
  if (game.phase === "chase") {
    const preyFrom = { x: prey.x, y: prey.y };
    let left = minutes;
    for (let guard = 0; guard < 4 && left > 1e-9; guard++) {
      if (!prey.act.run) runFrom(state, prey, rng);
      const spot = prey.act.run;
      if (!spot) break;
      const step = stepTo(prey, spot, left, fast);
      left = step.left;
      if (step.arrived) delete prey.act.run;
    }
    knockInPassing(state, prey, preyFrom, rng);
    const hunterFrom = { x: hunter.x, y: hunter.y };
    const gap = distance(hunter, prey) - w.behind;
    if (gap > 0) stepTo(hunter, tileOf(prey), Math.min(minutes, gap / fast), fast);
    knockInPassing(state, hunter, hunterFrom, rng);
    return;
  }
  if (game.phase === "tussle" && hunter.act.run) {
    // Наздогнав — стає впритул збоку обличчям до того, хто вже лежить на спині.
    // Добіг до клітинки утікача (а той міг лягти й біля її краю) чи вже поруч — стає впритул.
    const gap = distance(hunter, prey) - RELATIONS.beside;
    const close = gap <= 0.3 || stepTo(hunter, tileOf(prey), Math.min(minutes, (gap - 0.25) / fast), fast).arrived || distance(hunter, prey) - RELATIONS.beside <= 0.3;
    if (close) {
      standBeside(hunter, prey);
      delete hunter.act.run;
    }
  }
  faceTo(hunter, prey);
  faceTo(prey, hunter);
}

/**
 * Кіт підійшов до іншого кота — стає впритул збоку й обличчям до нього, а не на нього (§9.4, перевірка стосунків 2026-10-26:
 * шлях веде в центр клітинки друга, і двох котів було видно як одного). Лишається на тій самій клітинці.
 */
function standBeside(cat: Cat, other: Cat): void {
  const gap = RELATIONS.beside;
  cat.x = other.x + (other.x - Math.floor(other.x) > 0.5 ? -gap : gap);
  cat.y = other.y;
  cat.facing = other.x > cat.x ? 1 : -1;
}

/** Кіт підійшов вилизати друга чи кошеня (§9.4): той ще поруч — стає впритул збоку; відійшов — вилизування скасує `perform`. */
function metGroomee(state: GameState, cat: Cat): void {
  const other = groomee(state, cat.act.target);
  if (other && home(state, other) && distance(cat, other) <= RELATIONS.groom.reach) standBeside(cat, other);
}

/** Гра з другом зарахована (§9.4): потреба гри, рух, настрій і стосунки. */
function wrestled(state: GameState, cat: Cat, mate: Cat): void {
  const w = RELATIONS.wrestle;
  cat.needs.play = Math.max(0, cat.needs.play - w.play);
  exercise(cat);
  changeMood(state, cat, w.mood);
  changeRelation(state, cat, mate, w.relation);
}

/**
 * Точити кігті (§9.12, рішення автора 2026-10-25): на кігтеточці, якщо вона є й кіт її обрав; інакше кіт без риси й «+» дере
 * диван («Руйнівник диванів» — інколи одвірок), «Любить кігтеточку» — диван лише через раз, а то потягується на килимку чи
 * дере коробки біля входу, «Бережливий» дивана не дере ніколи. Прояв — на місці (`finish`).
 */
export function startScratch(state: GameState, cat: Cat, rng: Rng): void {
  const level = traitLevel(cat, "scratching");
  const posts = avoidNew(state, cat, itemsOf(state, "scratcher")).filter((p) => rng.chance(clamp(SCRATCH[p.quality] - SCRATCH.traitStep * level, 0, 1)));
  const post = nearest(cat, posts);
  if (post) return start(cat, "scratch", itemTile(post), SCRATCH.minutes, `item:${post.id}`);
  if (level <= -2 || (level === -1 && !rng.chance(SCRATCH.calmSofa))) {
    // Коробки дере, стоячи поруч із купою, а не на ній (перевірка етапу 2026-10-26).
    if (hasBoxes(state) && rng.chance(SCRATCH.boxes)) return start(cat, "scratch", { ...BOX_SCRATCH }, SCRATCH.minutes, "boxes");
    return start(cat, "scratch", rugTile(state, rng), SCRATCH.minutes, "rug");
  }
  if (level >= 2 && rng.chance(SCRATCH.doorframe)) return start(cat, "scratch", { ...DOORFRAME }, SCRATCH.minutes, "doorframe");
  const sofa = objectById("sofa");
  start(cat, "scratch", { x: sofa.x + rng.int(0, sofa.w - 1), y: sofa.y - 1 }, SCRATCH.minutes, "sofa");
}

/**
 * Вільна клітинка килимка, де кіт потягується (§9.12, «Дряпання»): не під ящиками біля входу й не під річчю котячого кутка
 * (кігтеточка на килимку) — інакше він потягувався б на коробці згори чи на кігтеточці (перевірка етапу 2026-10-26).
 */
export function rugTile(state: GameState, rng: Rng): Vec {
  const taken = new Set(state.home.items.flatMap((i) => ("slot" in i ? [`${slotById(i.slot).x},${slotById(i.slot).y}`] : [])));
  const tiles: Vec[] = [];
  for (let y = RUG.y; y < RUG.y + RUG.h; y++) {
    for (let x = RUG.x; x < RUG.x + RUG.w; x++) if (objectAt(state, x, y) === null && !taken.has(`${x},${y}`)) tiles.push({ x, y });
  }
  return tiles[rng.int(0, tiles.length - 1)] ?? { x: RUG.x, y: RUG.y };
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
  // Пам'ятає «ні» про комп'ютер — на клавіатуру не сідає; «+» дивиться на неї й розвертається (§9.12, «Слухняність»).
  const desk = noGo(state, cat, "desk");
  if (desk === "remember") {
    rememberNo(state, cat, "desk");
    obeyed(state, cat);
  }
  if (helper >= 0 && desk === "go" && rng.chance(WORK_CAT.keyboardBase + WORK_CAT.keyboardStep * helper)) {
    const computer = objectById("computer");
    const minutes = WORK_CAT.keyboardMinMinutes + rng.next() * (WORK_CAT.keyboardMaxMinutes - WORK_CAT.keyboardMinMinutes);
    observe(state, cat, "helper");
    return start(cat, "keyboard", { x: computer.x, y: computer.y }, minutes, "computer");
  }
  if (lap >= 0 && rng.chance(lapChance(cat))) {
    start(cat, "lap", null, MINUTES_PER_HOUR * 4, "character");
    observe(state, cat, "lap");
    jealousy(state, cat, "lap");
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
      // Перебірливий понюхав простий корм (`refusesFood`), гребе біля миски лапою — «закопує» — і відходить просити
      // кращого (§9.12, рішення автора 2026-10-25).
      const picky = traitLevel(cat, "picky");
      if (act.refused === true) {
        changeMood(state, cat, MOOD.pickyRefusal, "відмовився від дешевого корму");
        emit(state, { type: "cat-refused-food", cat: cat.id });
        observe(state, cat, "picky");
        return start(cat, "bury", null, PICKY.buryMinutes, act.target);
      }
      // «Малоїжка» поклювала пів порції й лишила половину в мисці; половинку, що лишилася, доїдає наступний (§9.12).
      const nibble = act.nibble === true && bowl.half !== true;
      const portion = nibble || bowl.half === true ? 0.5 : 1;
      // Їв, не бувши голодним, — гладшає (§9.12, «Схильність до повноти»): що менший голод, то більше зайвого — друга порція
      // «Ненаситного», миска, до якої збіглися на звук корму, частіші трапези «Ласуна».
      // Перекус «Апетиту +» біля повної миски — увесь зайвий (рішення автора 2026-10-26).
      const excess = act.snack === true ? 1 : Math.min(1, Math.max(0, WEIGHT.fullHunger - cat.needs.hunger) / WEIGHT.excessRange);
      // Корм для стерилізованих тримає вагу стерилізованого: без його множника (рішення автора 2026-10-26).
      if (excess > 0) gainWeight(state, cat, WEIGHT.portion * portion * excess, bowl.sterile);
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
      if (quality === "premium") {
        cat.premiumAt = absoluteMinute(state.day, state.minute);
        envy(state, cat, "premium");
      }
      emit(state, { type: "cat-ate", cat: cat.id, quality });
      resourceConflict(state, cat, rng, enoughFor(state, "bowl"), "bowl");
      afterMeal(state, cat, quality === "premium", rng);
      // Стерилізованому — лише корм для стерилізованих (§9.8).
      if (cat.sterilized && !bowl.sterile) maybeFallIll(state, cat, "urolithiasis", ILLNESS.regularFoodStones * stonesFactor(state, cat), rng);
      // «Малоїжка» відходить, лишивши пів миски, — прояв «Апетиту −» (§9.9).
      if (nibble) observe(state, cat, "appetite", -1);
      // «Ненаситний» доїдає все: у мисці ще є ціла порція — з'їдає й її (рішення автора 2026-10-25). Зригує й просить ще
      // він уже після другої.
      const appetite = traitLevel(cat, "appetite");
      if (act.second !== true && act.snack !== true && appetite > 0 && bowl.food > 0 && bowl.half !== true && rng.chance(Math.min(APPETITE.secondMax, APPETITE.secondStep * appetite))) {
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
        return;
      }
      // «Господар території» після їди ще вартує біля миски (§9.12, «Територіальність»).
      if (traitLevel(cat, "territorial") >= TERRITORY.guardLevel && bowl.food > 0) start(cat, "idle", null, TERRITORY.guardMinutes, `guard:${act.target ?? ""}`);
      return;
    }
    case "beg": {
      // Кран так і не відкрили: «Фонтанолюб» іде пити з миски, хоч і без радості (§9.12).
      if (act.target === "sink") {
        if (cat.needs.thirst < NEED_THRESHOLD.thirst) return;
        changeMood(state, cat, DRINKING.bowlMood, "кран не відкрили");
        const water = nearest(cat, itemsOf(state, "water").filter((w) => w.water > 0));
        if (water) start(cat, "drink", itemTile(water), CAT_ACT_MINUTES.drink, `item:${water.id}`);
        return;
      }
      // Голодний «Чесний» посидів біля їжі на столі й не взяв її — прояв «Злодійства −» (§9.9), не частіше ніж раз на
      // годину: голодний, він сідає туди знову й знову.
      if (act.target === null || !(SURFACE_IDS.includes(act.target) || act.target === "stove")) return;
      const dish = act.target === "stove" ? state.home.stove.item : state.home.surfaces[act.target];
      if (dish && dish.kind !== "burnt" && cat.needs.hunger >= hungerThreshold(cat)) observe(state, cat, "thief", -1, false, MINUTES_PER_HOUR);
      return;
    }
    case "bury": {
      // Закопав простий корм — тепер просить кращого біля миски (§9.12); загріб за собою в лотку — далі, як після лотка.
      const item = itemById(state, act.target);
      if (item?.kind === "bowl") return start(cat, "beg", itemTile(item), CAT_ACT_MINUTES.beg, act.target);
      if (item?.kind === "litter") afterToilet(state, cat, rng);
      return;
    }
    case "drink": {
      // З крана — улюблене «Фонтанолюба» (§9.12).
      if (act.target === "sink") {
        cat.needs.thirst = 0;
        changeMood(state, cat, DRINKING.tapMood, "п'є з крана");
        return;
      }
      // З вашого кухля на кухонному столі (фінальна перевірка рис 2026-10-26, «П'є зі склянок»): кухоль скинули, поки кіт ішов, — не
      // напився.
      if (act.target === "mug") {
        if (state.home.trinkets?.mug) return;
        cat.needs.thirst = 0;
        changeMood(state, cat, DRINKING.mugMood, "п'є з кухля");
        observe(state, cat, "drinking");
        return;
      }
      const water = itemById<WaterItem>(state, act.target);
      if (!water || water.water <= 0) return;
      water.water -= 1;
      cat.needs.thirst = 0;
      itemMood(state, cat, water);
      wearOut(state, water, rng);
      const drinking = traitLevel(cat, "drinking");
      if (drinking > 0 && state.home.appliances.fountain !== null) changeMood(state, cat, DRINKING.fountainMood, "фонтанчик");
      // +2 перекидає миску з водою — калюжа (§9.12): так видно, що з миски він пити не любить.
      if (drinking >= 2 && state.home.appliances.fountain === null && water.water > 0 && rng.chance(DRINKING.spill)) {
        water.water = 0;
        const slot = slotById(water.slot);
        addMess(state, "puddle", visibleFloorNear(state, { x: slot.x + 0.5, y: slot.y + 1 }), cat.id);
        observe(state, cat, "drinking");
      }
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
    case "mark":
      // Мітка в кутку: кіт тремтів піднятим хвостом — і це видно (§9.12, прояв «Міток +»).
      addMess(state, "mark", visibleFloorNear(state, cat), cat.id);
      observe(state, cat, "marking");
      return;
    case "cough":
      // Відкахикався — шерстяна грудка на підлозі (§9.12, прояв «Шерстяних грудок +»).
      addMess(state, "hairball", visibleFloorNear(state, { x: cat.x, y: cat.y + 0.6 }), cat.id);
      observe(state, cat, "hairballs");
      return;
    case "revenge":
      // Дійшов до ліжка чи кошика з білизною: помста здійснилася, образа минає.
      addMess(state, "surprise", visibleFloorNear(state, cat), cat.id);
      cat.hurt = null;
      forgive(cat);
      return;
    case "toilet": {
      const box = itemById<LitterItem>(state, act.target);
      const dirty = box !== null && dirtyFor(cat, box);
      const picky = traitLevel(cat, "litterPicky");
      // Грязнулі ображаються менше (−2 — зовсім ні) й від брудного лотка не відмовляються; чистюлі — навпаки (§9.12).
      const factor = Math.max(0, 1 + DIRTY_LITTER.pickyStep * picky);
      if (dirty) changeMood(state, cat, MOOD.dirtyLitter * factor, "брудний лоток");
      // Чистюля понюхав брудний лоток (`refusesLitter`), постояв на борту й іде шукати інше місце — це видно біля лотка,
      // прояв «+» (рішення автора 2026-10-25). «Сюрприз» він лишить там, куди дійде.
      if (act.refused === true) {
        emit(state, { type: "litter-refused", cat: cat.id });
        observe(state, cat, "litterPicky");
        return start(cat, "toilet", tileOf(surpriseSpot(rng)), CAT_ACT_MINUTES.toilet, null);
      }
      cat.needs.toilet = 0;
      // Хворий кіт не дотерпів до лотка (§9.5).
      if (box && missesLitter(cat, rng)) {
        addMess(state, "surprise", visibleFloorNear(state, cat), cat.id);
        return;
      }
      if (!box) {
        addMess(state, "surprise", visibleFloorNear(state, cat), cat.id);
        return;
      }
      if (dirty) {
        changeLove(state, cat, DIRTY_LITTER.love * factor, "брудний лоток");
        // Спокійно сходив і в повний лоток — прояв «Спартанця» (§9.9).
        observe(state, cat, "litterPicky", -1);
      }
      box.uses += 1;
      itemMood(state, cat, box);
      wearOut(state, box, rng);
      resourceConflict(state, cat, rng, enoughFor(state, "litter"), "litter");
      // Розкидає наповнювач (§9.12): 20% × (1 + 0,75 × рівень), із закритого лотка — удвічі рідше.
      const scatter = traitLevel(cat, "scatter");
      const scatters = SCATTER_CHANCE.base * Math.max(0, 1 + SCATTER_CHANCE.step * scatter) * (box.quality === "premium" ? SCATTER_CHANCE.closedBox : 1);
      if (rng.chance(scatters)) {
        const slot = slotById(box.slot);
        addMess(state, "litter", { x: slot.x + 0.5 + (rng.next() - 0.5), y: slot.y + 0.7 + rng.next() * 0.2 }, cat.id);
        observe(state, cat, "scatter");
      } else if (scatter < 0) {
        // «Акуратний» ще хвилину загрібає за собою — довкола чисто: прояв «−» (рішення автора 2026-10-25).
        observe(state, cat, "scatter", -1);
        return start(cat, "bury", null, SCATTER_CHANCE.buryMinutes, act.target);
      }
      return afterToilet(state, cat, rng);
    }
    case "sleep": {
      if (act.elapsed >= MIN_CAT_NAP_MINUTES) changeMood(state, cat, MOOD.restedSleep);
      const house = itemById(state, act.target);
      if (house && act.elapsed >= MIN_CAT_NAP_MINUTES) {
        itemMood(state, cat, house);
        wearOut(state, house, rng);
      }
      // «Хмаринка шерсті» після довгого сну на ліжку, дивані чи комп'ютері лишає там клапоть шерсті (§9.12).
      const shedding = traitLevel(cat, "shedding");
      const furniture = objectAt(state, Math.floor(cat.x), Math.floor(cat.y))?.kind;
      if (shedding > 0 && act.elapsed >= SHEDDING.napMinutes && cat.shape.coat !== "hairless" && (furniture === "bed" || furniture === "sofa" || furniture === "computer") && rng.chance(SHEDDING.patchStep * shedding)) {
        addMess(state, "fur", visibleFloorNear(state, cat), cat.id);
        observe(state, cat, "shedding");
      }
      // Прокинувся поруч із другом після сну купкою — може вилизати його (§9.4, рішення автора 2026-10-26, В2). Як і кігтеточка
      // після сну, — якщо не треба в лоток: голодний чи спраглий після довгого сну кіт майже завжди, а поїсть і за 4–6 хвилин
      // (заміри блоку 3: з умовою «нічого нагального» вилизування після сну не траплялося ніколи).
      if (act.elapsed >= MIN_CAT_NAP_MINUTES && cat.needs.toilet < NEED_THRESHOLD.toilet && !isAdapting(state, cat) && groomAfterSleep(state, cat, rng)) return;
      // Проспав від години — прокинувшись, одразу точить кігті (§9.12, рішення автора 2026-10-25): їсти й пити можна й за
      // дві хвилини (після довгого сну кіт майже завжди голодний чи спраглий), а в лоток — ні.
      if (act.elapsed >= SCRATCH.afterSleepMinutes && cat.needs.toilet < NEED_THRESHOLD.toilet && !isAdapting(state, cat) && rng.chance(SCRATCH.afterSleep)) startScratch(state, cat, rng);
      return;
    }
    case "wrestle": {
      // Догралися разом (§9.4): наслідки обом дає той, хто закінчив першим. Друг не дочекався, пара розпалася чи гру вже
      // зараховано — нічого (перевірка стосунків 2026-10-26: раніше нагороду отримував кожен, навіть сам).
      if (act.refused === true || act.paired !== true || act.done === true) return;
      const mate = catById(state, act.target);
      if (!mate) return;
      wrestled(state, cat, mate);
      if (wrestlesWith(mate, cat)) {
        wrestled(state, mate, cat);
        mate.act.done = true;
        mate.act.minutes = 0;
      }
      // Гра мовчазна — без бабла, лише для журналу (§9.4, рішення автора 2026-10-26, Г3).
      emit(state, { type: "cats-played", cats: [cat.id, mate.id] });
      return;
    }
    case "groom": {
      // Нервово вилизався — тепер ховається (§9.12).
      if (act.target === "nervous") {
        const spot = hideSpot(state, rng, cat);
        return start(cat, "hide", spot.at, STRESS_EFFECTS.hideStep * Math.max(1, -traitLevel(cat, "stress")), spot.target);
      }
      // Вилизав кошеня (§9.12, «Турбота про кошенят»): малому приємно, а це видно — прояв «+».
      if (act.target?.startsWith("kitten:") === true) return groomedKitten(state, cat);
      const friend = catById(state, act.target);
      // Друг відсторонився (§9.12, «Вилизування друзів») чи пішов: ні радості, ні дружби.
      // Вилизування у відповідь окремих наслідків не дає: їх уже дало вилизування (§9.4, В3).
      if (friend && distance(cat, friend) <= RELATIONS.groom.reach && act.refused !== true && act.back !== true) groomedFriend(state, cat, friend, act, rng);
      // Прийшов спати до друга — тепер лягає поруч (§9.4, В2).
      if (act.beforeSleep === true) lieDownAfterGroom(state, cat, friend);
      return;
    }
    case "fight": {
      // Нерозборонена бійка (§9.4, рішення автора 2026-10-26): той, хто програв, може травмуватися й ховається, переможець сидить.
      if (act.refused === true || act.paired !== true) return;
      const f = RELATIONS.fight;
      if (act.lost !== true) return start(cat, "idle", null, f.winnerSits, "won");
      if (rng.chance(f.injury * (fightFactor(cat) > 1 ? f.injuryIntact : 1))) fallIll(state, cat, "injury");
      return hideFrom(state, cat, catById(state, act.target) ?? cat, rng);
    }
    case "standoff": {
      // Протистояння добігло кінця, ніхто не втрутився (§9.4): бійка чи відступ — раз на пару, тим, хто закінчив першим.
      if (act.refused === true || act.paired !== true) return;
      const foe = catById(state, act.target);
      if (!foe || !home(state, foe) || !facesOff(foe, cat)) return;
      return settleStandoff(state, cat, foe, rng);
    }
    case "scratch": {
      cat.needs.play = Math.max(0, cat.needs.play - SCRATCH.relief);
      changeMood(state, cat, SCRATCH.mood);
      const post = itemById(state, act.target);
      if (post) {
        itemMood(state, cat, post);
        wearOut(state, post, rng);
      } else if (act.target === "sofa" || act.target === "doorframe") state.home.repairs += SOFA_REPAIR;
      const where: ScratchSpot = post ? "post" : act.target === "doorframe" || act.target === "rug" || act.target === "boxes" ? act.target : "sofa";
      emit(state, { type: "scratched", cat: cat.id, where });
      // Прояв — на місці, на очах персонажа (§9.9): «+» дере диван чи одвірок, «−» — кігтеточку, килимок чи коробки.
      observe(state, cat, "scratching", where === "sofa" || where === "doorframe" ? 1 : -1);
      return;
    }
    case "idle": {
      // Понюхав котячу м'яту й не зреагував — іде геть (§9.12, «Котяча м'ята»).
      if (act.target === "catnip") return backAway(state, cat, state.character.body);
      // Обнюхав нову річ (§9.12, «Допитливість»): допитливий посидів поруч — прояв «+»; обачний відходить подалі — «−».
      const [kind, id] = act.target?.split(":") ?? [];
      if (kind !== "sniff" && kind !== "shun") return;
      const item = state.home.items.find((i) => i.id === Number(id));
      if (!item) return;
      if (kind === "sniff") return observe(state, cat, "curiosity");
      observe(state, cat, "curiosity", -1);
      return backAway(state, cat, itemPoint(item));
    }
    case "wander":
      // Просто побродити без діла гри не знімає: інакше коти майже не гралися б самі, не бешкетували
      // й не влаштовували зумі (пошук багів 2026-10-25).
      if (act.target === "play") {
        cat.needs.play = Math.max(0, cat.needs.play - PLAY_RELIEF * 0.8);
        exercise(cat, 0.8);
      }
      // Дотягнув паперову стрічку у вітальню — кінець стрічки лишається тут (§9.12, «Мисливський інстинкт»).
      if (act.target === "paper") {
        cat.needs.play = Math.max(0, cat.needs.play - PLAY_RELIEF * 0.5);
        addMess(state, "paper", visibleFloorNear(state, cat), cat.id);
      }
      return;
    case "unroll": {
      // Рулон уже розмотав інший кіт — лапати нічого (§9.12).
      if (state.home.rollDown === true) return;
      state.home.rollDown = true;
      cat.needs.play = Math.max(0, cat.needs.play - PLAY_RELIEF * 0.5);
      changeMood(state, cat, 1);
      addMess(state, "paper", visibleFloorNear(state, { x: cat.x, y: cat.y + 0.8 }), cat.id);
      // Тягне стрічку з ванної у вітальню.
      return start(cat, "wander", tileOf(PAPER_TRAIL), CAT_ACT_MINUTES.wander, "paper");
    }
    case "zoomies":
      cat.needs.play = Math.max(0, cat.needs.play - PLAY_RELIEF);
      exercise(cat);
      // Нагасався від м'яти — задирає кота поруч (§9.12, «Котяча м'ята»).
      if (act.target === "catnip") catnipFight(state, cat, rng);
      return;
    case "jealous":
      // Заздрісник дійшов до того, кому перепало (§9.12, «Заздрісність»); ревнивець — до суперника («Ревнивість»).
      if (act.envy === true) return enviousArrived(state, cat);
      return jealousArrived(state, cat, rng);
    case "window":
      // «Нудьгує біля вікна» зриває злість (§9.12, «Вікно»).
      if (act.refused === true) windowRage(state, cat, rng);
      return;
    case "catnip":
      // Накатався по м'яті: награвся, а «+» засинає просто тут (§9.12, «Котяча м'ята»).
      cat.needs.play = Math.max(0, cat.needs.play - PLAY_RELIEF);
      exercise(cat);
      if (traitLevel(cat, "catnip") > 0) start(cat, "sleep", null, 8 * MINUTES_PER_HOUR);
      return;
    case "carry":
      return carryDone(state, cat);
    case "raid":
      return raidDone(state, cat, rng);
    case "chew":
      return chewDone(state, cat, rng);
    case "ambush":
      // Просиділа засідку й ніхто не пройшов — теж трохи гра (§9.12, «Засідки»).
      cat.needs.play = Math.max(0, cat.needs.play - PLAY_RELIEF * AMBUSH.waitRelief);
      return;
    case "knock": {
      if (act.target?.startsWith("trinket:")) return trinketDone(state, cat, rng);
      if (!act.target || !knockOff(state, cat, act.target)) return;
      changeMood(state, cat, 1);
      cat.needs.play = Math.max(0, cat.needs.play - PLAY_RELIEF);
      observe(state, cat, "knocking");
      return;
    }
    case "steal": {
      if (!act.target) return;
      if (act.target.startsWith("item:")) return pushAway(state, cat, rng);
      const dish = act.target === "stove" ? state.home.stove.item : state.home.surfaces[act.target];
      if (!dish || dish.kind === "burnt") return;
      takeDish(state, act.target);
      cat.needs.hunger = Math.max(0, cat.needs.hunger - STEAL_HUNGER);
      // Людська їжа — понад порції (§9.12, «Схильність до повноти»).
      gainWeight(state, cat, WEIGHT.stolen);
      cat.needs.play = Math.max(0, cat.needs.play - PLAY_RELIEF);
      changeMood(state, cat, 2);
      afterTheft(state, cat, rng);
      observe(state, cat, "thief");
      emit(state, { type: "stole", cat: cat.id, object: act.target, item: dish });
      return;
    }
    case "toy": {
      const toy = itemById<ToyItem>(state, act.target);
      // Мисливець награється іграшкою досхочу, а «Пацифіст» — ледве (§9.12, «Мисливський інстинкт»).
      const hunting = traitLevel(cat, "hunting");
      cat.needs.play = Math.max(0, cat.needs.play - PLAY_RELIEF * Math.max(HUNTING.soloMin, 1 + HUNTING.soloStep * hunting));
      exercise(cat);
      if (!toy) return;
      changeMood(state, cat, 1);
      // Іграшка відлітає трохи вбік і зношується — у мисливця швидше.
      const moved = visibleFloorNear(state, { x: toy.x + (rng.next() - 0.5) * 1.2, y: toy.y + (rng.next() - 0.5) * 1.2 });
      toy.x = moved.x;
      toy.y = moved.y;
      toy.uses += 1 + HUNTING.wearStep * Math.max(0, hunting);
      if (toy.uses >= TOY.durability[toy.quality]) {
        state.home.items.splice(state.home.items.indexOf(toy), 1);
        emit(state, { type: "toy-broke", toy: toy.id });
        return;
      }
      // Іграшка, що відлетіла близько до дивана чи холодильника, інколи залітає під них — у кожного кота (§9.12, «Подарунки й
      // схованки»).
      const under = (["sofa", "fridge"] as const).find((where) => distance(toy, STASHES[where].at) <= GIFTS.strayReach);
      if (under && rng.chance(GIFTS.stray)) hideToy(toy, under);
      return;
    }
    default:
      return;
  }
}

/** Клітинка підлоги впритул до речі квартири, яку не закриває передня стіна: спереду, ззаду чи збоку. */
function besideObject(state: GameState, o: HomeObject): Vec {
  const around = [
    { x: o.x, y: o.y + o.h },
    { x: o.x, y: o.y - 1 },
    { x: o.x - 1, y: o.y },
    { x: o.x + o.w, y: o.y },
  ];
  return around.find((t) => !isSolid(state, t.x, t.y) && !hiddenTile(t.x, t.y)) ?? tileOf(visibleFloorNear(state, o));
}

/** Звідки злодій іде відтіснити іншого від миски: з дій, які не шкода кинути (§9.12). */
const THIEF_FROM = new Set(["idle", "wander", "beg", "toy"]);

/**
 * Інший кіт сів їсти (§9.12, рішення автора 2026-10-25): злодій поруч, голодний і нічим важливим не зайнятий, може піти
 * до цієї миски — відтіснити його. Кожен злодій — зі своїм шансом; іде лише один.
 */
function bowlThief(state: GameState, eater: Cat, rng: Rng): void {
  const target = eater.act.target;
  if (!target?.startsWith("item:")) return;
  for (const cat of state.cats) {
    const level = traitLevel(cat, "thief");
    if (cat.id === eater.id || level <= 0 || !home(state, cat) || !THIEF_FROM.has(cat.act.kind) || isAdapting(state, cat)) continue;
    if (cat.needs.hunger < THIEF.hunger || distance(cat, eater) > THIEF.reach || !rng.chance(THIEF.pushStep * level)) continue;
    start(cat, "steal", tileOf(eater), 0.05, target);
    cat.act.victim = eater.id;
    return;
  }
}

/**
 * Злодій дійшов до миски (§9.12): той ще їсть — злодій шипить і займає миску, а той відходить голодний (настрій −2,
 * стосунки −3); «Охоронець миски» може побитися. Це прояв «Злодійства +». Той уже поїв — злодій просто доїдає, що лишилося.
 */
function pushAway(state: GameState, thief: Cat, rng: Rng): void {
  const act = thief.act;
  const bowl = itemById<BowlItem>(state, act.target);
  if (bowl?.kind !== "bowl" || bowl.food <= 0) return;
  const victim = state.cats.find((c) => c.id === act.victim);
  const eating = victim && home(state, victim) && victim.act.kind === "eat" && victim.act.goal === null && victim.act.target === act.target;
  if (victim && eating) {
    hiss(state, thief, victim, "bowl");
    observe(state, thief, "thief");
    const guard = traitLevel(victim, "territorial");
    // З тим, з ким пара ще не відійшла від бійки, «Охоронець» не б'ється (§9.4, «Пауза пари»).
    if (guard > 0 && !truced(state, thief, victim) && rng.chance(THIEF.guardFight * guard)) return startFight(state, thief, victim, rng);
    changeMood(state, victim, THIEF.victimMood, "відігнали від миски");
    changeRelation(state, victim, thief, THIEF.relation);
    backAway(state, victim, thief);
  }
  start(thief, "eat", null, eatMinutes(thief), act.target);
}

/** Після лотка — часто зумі (§9.3); «Статечний» спокійно йде геть — прояв «Зумі −», раз на день. */
function afterToilet(state: GameState, cat: Cat, rng: Rng): void {
  if (rng.chance(ZOOMIES.afterToilet * traitFactor(cat, "zoomies", MISCHIEF.traitStep))) {
    startZoomies(state, cat, rng);
    nightMischief(state, cat);
  } else observe(state, cat, "zoomies", -1, false, MINUTES_PER_DAY);
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

/** Дрібнички, що стоять на своїх місцях (§9.12, «Скидання речей»): скинуті лежать на підлозі до ранку. */
export function standingTrinkets(state: GameState): (typeof TRINKETS)[number][] {
  return TRINKETS.filter((t) => !state.home.trinkets?.[t.kind]);
}

/**
 * Кіт скинув дрібничку (§9.12, «Скидання речей»): вона лежить на підлозі під столом до ранку; кухоль розбивається з шансом
 * 50% — уламки, гучний звук і ремонт.
 */
function knockTrinket(state: GameState, cat: Cat, kind: TrinketKind, rng: Rng): boolean {
  const home = state.home;
  const place = TRINKETS.find((t) => t.kind === kind);
  if (!place || home.trinkets?.[kind]) return false;
  // Падає на видне місце біля речі, а не за стіл чи передню стіну (перевірка етапу 2026-10-26).
  const spot = visibleFloorNear(state, place.fall);
  const broken = kind === "mug" && rng.chance(KNOCKING.mugBreaks);
  (home.trinkets ??= {})[kind] = broken ? { x: spot.x, y: spot.y, broken: true } : { x: spot.x, y: spot.y };
  emit(state, { type: "trinket-fell", cat: cat.id, trinket: kind, object: place.object, broken });
  if (broken) {
    addMess(state, "broken", spot, cat.id);
    home.repairs += KNOCKING.repair;
    loudNoise(state, "broken", spot);
  }
  return true;
}

/**
 * Кіт дійшов до дрібнички (§9.12): скинув — прояв «+» (ще й дивлячись на персонажа, коли це заради уваги); «−» лише
 * обнюхав її й обійшов — прояв «−».
 */
function trinketDone(state: GameState, cat: Cat, rng: Rng): void {
  const kind = cat.act.target?.slice("trinket:".length) as TrinketKind;
  // Дрібничку вже скинули (зумі чи інший кіт), поки цей ішов до неї: обнюхувати чи скидати нічого (перевірка етапу 2026-10-26).
  if (state.home.trinkets?.[kind]) return;
  if (cat.act.refused === true) {
    emit(state, { type: "trinket-sniffed", cat: cat.id, trinket: kind });
    observe(state, cat, "knocking", -1);
    return;
  }
  if (!knockTrinket(state, cat, kind, rng)) return;
  changeMood(state, cat, 1);
  cat.needs.play = Math.max(0, cat.needs.play - PLAY_RELIEF);
  observe(state, cat, "knocking");
}

/**
 * «Скидання речей +» прийшов по увагу (§9.12): персонаж працює чи вже 5 хвилин його не гладить — раз за візит, з шансом 20% ×
 * рівень, кіт іде до дрібнички в кімнаті персонажа (не далі 6 клітинок), дивиться на нього й зіштовхує її.
 */
function showOffKnock(state: GameState, cat: Cat, rng: Rng): void {
  const act = cat.act;
  const level = traitLevel(cat, "knocking");
  if (level <= 0 || act.seen !== true || act.knockTried === true) return;
  if (!isWorking(state) && act.elapsed < KNOCKING.ignoredMinutes) return;
  act.knockTried = true;
  if (!rng.chance(KNOCKING.attentionStep * level)) return;
  const room = roomAt(state.character.body);
  const near = standingTrinkets(state).filter((t) => roomAt(objectById(t.object)) === room && distance(trinketTile(t.kind), cat) <= KNOCKING.reach && noGo(state, cat, zoneOf(t.object)) === "go");
  near.sort((a, b) => distance(trinketTile(a.kind), cat) - distance(trinketTile(b.kind), cat));
  const trinket = near[0];
  if (!trinket) return;
  start(cat, "knock", trinketTile(trinket.kind), KNOCKING.sniffMinutes, `trinket:${trinket.kind}`);
  cat.act.showOff = true;
}

/**
 * Кіт біля дрібнички на столі (§9.12): сидить поруч, ліворуч від неї, обличчям до неї (`TRINKETS[].seat`), а не на ній — інакше
 * закривав собою кухоль, телефон чи ручку (рішення автора 2026-10-26).
 */
function sitBesideTrinket(cat: Cat, kind: TrinketKind): void {
  const seat = TRINKETS.find((t) => t.kind === kind)?.seat;
  if (!seat) return;
  cat.x = seat.x;
  cat.y = seat.y;
  cat.facing = 1;
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
      // Сів до миски: перебірливий нюхає корм і, якщо той простий, може відмовитися, не з'ївши ні крихти; «Малоїжка»
      // вирішує, чи лише поклює (§9.12, «Апетит»). Половинку, що лишилася, доїдає цілком.
      if (act.nibble === undefined) {
        if (refusesFood(state, cat, rng)) {
          act.refused = true;
          act.nibble = false;
          act.minutes = Math.min(act.minutes, SNIFF_MINUTES);
          return;
        }
        const appetite = traitLevel(cat, "appetite");
        act.nibble = appetite < 0 && rng.chance(Math.min(APPETITE.halfMax, APPETITE.halfStep * -appetite));
        // Кіт сів їсти — злодій поруч може піти відтіснити його (§9.12, «Злодійство»).
        bowlThief(state, cat, rng);
        // «Ділиться» їсть з однієї миски з іншим котом, хоч є й вільна, — прояв «Територіальності −» (§9.12).
        shareBowl(state, cat);
      }
      return;
    case "mark": {
      // Мітить задом до кута: піднятий хвіст — до стіни (§9.12; перевірка етапу 2026-10-25 — кіт дивився в кут, наче
      // нюхав його).
      const room = ROOMS.find((r) => r.id === roomAt(cat));
      if (room) cat.facing = cat.x < room.x + room.w / 2 ? 1 : -1;
      return;
    }
    case "toilet":
      // Дійшов до лотка: чистюля нюхає брудний і може піти шукати інше місце, не сходивши (§9.12).
      if (act.refused === undefined) {
        act.refused = refusesLitter(state, cat, rng);
        if (act.refused) act.minutes = Math.min(act.minutes, SNIFF_MINUTES);
      }
      return;
    case "beg":
    case "attention":
      // «Терплячий зранку» біля ліжка чекає мовчки, як і каже підказка (§9.12, рішення автора 2026-10-26).
      if (act.kind !== "beg" || act.target !== "bed") askAloud(state, cat, minutes);
      if (act.kind === "attention") {
        if (cat.needs.attention < ATTENTION_SATISFIED) act.minutes = 0;
        else if (act.target === "character" && context.present && isWorking(state)) arriveAtWork(state, cat, rng);
        // Не дочекався ласки — «Скидання речей +» може скинути дрібничку на очах персонажа (§9.12).
        if (cat.act === act && act.minutes > 0 && context.present) showOffKnock(state, cat, rng);
      }
      return;
    case "wrestle": {
      // Пара розпалася — друг пішов, його взяли на руки, погладили чи з ним гралися вудкою, ініціатора перебили, коти розбіглися:
      // гра скінчилася для обох без наслідків (§9.4).
      const mate = catById(state, act.target);
      const w = RELATIONS.wrestle;
      const reach = act.game ? w.chaseReach : w.reach;
      const broken = act.paired === true && (distance(cat, mate ?? cat) > reach || getsAttention(state, cat) || (mate !== null && getsAttention(state, mate)));
      if (!mate || !home(state, mate) || !wrestlesWith(mate, cat) || broken) {
        act.refused = true;
        act.minutes = 0;
        return;
      }
      if (act.paired !== true) return;
      // Гра фазами (§9.4, рішення автора 2026-10-26, Г3): фази й рух обох веде той, хто кликав.
      if (act.lead !== true) return;
      advanceGame(state, cat, mate, minutes, rng);
      playMoves(state, cat, mate, minutes, rng);
      return;
    }
    case "groom": {
      // Вмивається сам (нервово, після їди) — нікого не чекає.
      const other = groomee(state, act.target);
      if (other === null) {
        // Друга чи кошеняти більше немає (помер, віддали) — вилизування скасовується (перевірка блоку 3, 2026-10-26: кіт до
        // 6 хвилин вилизував порожнє місце).
        if (act.target?.startsWith("cat:") === true || act.target?.startsWith("kitten:") === true) {
          act.refused = true;
          act.minutes = 0;
        }
        return;
      }
      if (act.refused === undefined) {
        // Друг чи кошеня вже зайняті іншим (не відпочивають, їх гладять) — вилизування немає (§9.4).
        if (!home(state, other) || distance(cat, other) > RELATIONS.groom.reach || getsAttention(state, other) || !(resting(state, other) || asleep(other) || isLickedBy(other, cat))) {
          act.refused = true;
          act.minutes = 0;
          return;
        }
        // Друг прийшов вилизати «Не терпить дотиків» — той може відсторонитися (§9.12, «Вилизування друзів»).
        act.refused = act.target?.startsWith("cat:") === true && refusesGrooming(state, other, cat, rng);
        if (act.refused) {
          act.minutes = 0;
          return;
        }
        // Друг, що не спить, сидить на місці й мружиться, а над ним — думка-сердечко (§9.4, рішення автора 2026-10-26, В1).
        if (!isLickedBy(other, cat)) holdStill(other, cat, act.minutes);
        emit(state, { type: "groom-started", cat: cat.id, friend: other.id });
      }
      // Друг чи кошеня пішли (нагальна потреба, руки) чи відійшли — вилизування скасовується, а не сидіння самому (§9.4, перевірка
      // стосунків 2026-10-26). Так само, коли персонаж гладить чи грається з одним із двох, — як і гра (рішення автора 2026-10-26
      // після блоку 3).
      const touched = getsAttention(state, other) || getsAttention(state, cat);
      if (touched || !home(state, other) || distance(cat, other) > RELATIONS.groom.reach || !(asleep(other) || isLickedBy(other, cat))) {
        act.refused = true;
        act.minutes = 0;
      }
      return;
    }
    case "idle": {
      // Друга вилизують (§9.4, В1): сидить на місці обличчям до того, хто вилизує; той перестав — друг вільний.
      if (act.target?.startsWith("licked:") !== true) return;
      const by = state.cats.find((c) => `licked:${c.id}` === act.target) ?? null;
      if (by === null || !home(state, by) || by.act.kind !== "groom" || groomee(state, by.act.target) !== cat) act.minutes = 0;
      else cat.facing = by.x > cat.x ? 1 : -1;
      return;
    }
    case "fight": {
      // Нападник не добіг, а другий кіт уже не чекає (взяли на руки, налякав звук): бійки немає (§9.4). Коли обидва поруч,
      // бійку закінчує розборонити (`separateFight`) чи час — тоді переможець може закінчити на мить раніше.
      if (act.paired === true) return;
      const foe = catById(state, act.target);
      if (!foe || !home(state, foe) || foe.act.kind !== "fight" || foe.act.target !== `cat:${cat.id}`) {
        act.refused = true;
        act.minutes = 0;
      }
      return;
    }
    case "standoff": {
      // Пара розпалася — другого взяли на руки, налякав звук, він пішов: протистояння скінчилося без наслідків (§9.4).
      const foe = catById(state, act.target);
      if (!foe || !home(state, foe) || !facesOff(foe, cat)) {
        act.refused = true;
        act.minutes = 0;
        return;
      }
      // Щохвилини від зустрічі шипить (§9.4, рішення автора 2026-10-26); в останню мить — уже ні: далі бійка чи відступ.
      if (act.paired === true && Math.floor(act.elapsed) > Math.floor(act.elapsed - minutes) && act.minutes - minutes > 1e-9) standoffHiss(state, cat, foe);
      return;
    }
    case "chew":
      // Почав гризти — хрумтить (§9.12, «Гризіння»); дріт — обличчям до столу ліворуч, коробки — до купи ліворуч.
      cat.facing = -1;
      if (act.elapsed <= minutes) emit(state, { type: "chewing", cat: cat.id, what: act.target === "boxes" ? "boxes" : "wire" });
      return;
    case "window":
      return watchWindow(state, cat, minutes, rng);
    case "catnip": {
      // Катається по м'яті довше, ніж кіт без риси, — прояв «Котячої м'яти +» (§9.9).
      const plain = CATNIP.rollMinutes[0] ?? 0;
      if (act.elapsed >= plain && act.elapsed - minutes < plain && traitLevel(cat, "catnip") > 0) observe(state, cat, "catnip");
      return;
    }
    case "raid":
      // Лапає дверцята шафки чи смітник — обличчям до них, праворуч (§9.12, «Кмітливість у бешкеті»).
      cat.facing = 1;
      return;
    case "carry":
      // Приніс іграшку до ніг персонажа (§9.12, «Подарунки й схованки»): кладе її й чекає поруч.
      if (act.picked === true && act.dest === "feet" && act.dropped !== true) dropGift(state, cat);
      return;
    case "drink":
      // П'є з вашого кухля — сидить поруч із ним, а не на ньому (рішення автора 2026-10-26).
      if (act.target === "mug") sitBesideTrinket(cat, "mug");
      return;
    case "knock":
      // Дійшов до дрібнички (§9.12, «Скидання речей»): «−» з шансом 50% × |рівень| лише обнюхує її; хто скидає заради
      // уваги — дивиться на персонажа. Сидить поруч із дрібничкою, а не на ній (рішення автора 2026-10-26).
      if (act.target?.startsWith("trinket:")) sitBesideTrinket(cat, act.target.slice(8) as TrinketKind);
      if (act.refused === undefined && act.target?.startsWith("trinket:")) {
        const level = traitLevel(cat, "knocking");
        act.refused = level < 0 && rng.chance(KNOCKING.sniffStep * -level);
      }
      if (act.showOff === true) cat.facing = state.character.body.x >= cat.x ? 1 : -1;
      return;
    case "scratch":
      // Дере коробки чи одвірок — обличчям до них (§9.12, «Дряпання»; перевірка етапу 2026-10-26): купа ящиків ліворуч,
      // стіна одвірка праворуч.
      if (act.goal === null && act.target === "boxes") cat.facing = -1;
      if (act.goal === null && act.target === "doorframe") cat.facing = 1;
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
  knockInPassing(state, cat, from, rng);
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

/**
 * Кіт мчить повз стіл чи кухонну поверхню (ближче `ZOOMIES.knockReach`) — страва чи дрібничка на них падає з шансом `ZOOMIES.knock`,
 * раз за прохід (§9.12): забіг зумі й погоня в грі двох котів (§9.4, Г3).
 */
function knockInPassing(state: GameState, cat: Cat, from: Vec, rng: Rng): void {
  for (const id of SURFACE_IDS) {
    if (!state.home.surfaces[id]) continue;
    const near = (p: Vec): boolean => distanceToRect(p, objectById(id)) <= ZOOMIES.knockReach;
    if (!near(from) && near(cat) && rng.chance(ZOOMIES.knock)) knockOff(state, cat, id);
  }
  // Так само й дрібничка на столі (§9.12, «Скидання речей»).
  for (const trinket of standingTrinkets(state)) {
    const near = (p: Vec): boolean => distanceToRect(p, objectById(trinket.object)) <= ZOOMIES.knockReach;
    if (!near(from) && near(cat) && rng.chance(ZOOMIES.knock)) knockTrinket(state, cat, trinket.kind, rng);
  }
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

/**
 * Як сильно кіт на руках боїться переноски (§9.12, «Переноска»): «−» біля дверей (ближче 2 клітинок), коли вдома є переноска, —
 * |рівень|; інакше 0.
 */
export function carrierDread(state: GameState, cat: Cat): number {
  const level = traitLevel(cat, "carrier");
  if (level >= 0 || state.home.carrier === null || !isCarried(state, cat)) return 0;
  const body = state.character.body;
  return Math.hypot(body.x - DOOR.x, body.y - DOOR.y) <= CARRIER_HOME.reach ? -level : 0;
}

/** Що відчуває кіт на руках (§9.12, «Коліна»): любить руки, терпить чи пручається. */
export function carryFeeling(state: GameState, cat: Cat): "content" | "reluctant" | "struggling" {
  // Біля дверей «−» бачить переноску й пручається (§9.12, «Переноска»).
  if (carrierDread(state, cat) > 0) return "struggling";
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
  const dread = carrierDread(state, cat);
  if (dread > 0) return dreadCarrier(state, cat, dread, minutes, rng);
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
  const spot = hideSpot(state, rng, cat);
  start(cat, "hide", spot.at, CAT_ACT_MINUTES.hide, spot.target);
  emit(state, { type: "cat-broke-free", cat: cat.id });
}

/**
 * «−» на руках біля дверей бачить переноску (§9.12, «Переноска», рішення автора 2026-10-25): пручається — прояв «−», не
 * частіше ніж раз на годину, — і щохвилини з шансом 10% × |рівень| дряпає персонажа (здоров'я −3); після подряпини з шансом
 * 25% виривається з рук і ховається.
 */
function dreadCarrier(state: GameState, cat: Cat, dread: number, minutes: number, rng: Rng): void {
  changeMood(state, cat, CARRY.struggleMood * dread * minutes);
  observe(state, cat, "carrier", -1, false, CARRY.observeEvery);
  if (!rng.chance(1 - (1 - CARRIER_HOME.scratchStep * dread) ** minutes)) return;
  changeStat(state, "health", CARRIER_HOME.health);
  emit(state, { type: "clawed", cat: cat.id });
  if (!rng.chance(CARRIER_HOME.escape)) return;
  state.character.held = null;
  const at = visibleFloorNear(state, state.character.body);
  cat.x = at.x;
  cat.y = at.y;
  const spot = hideSpot(state, rng, cat);
  start(cat, "hide", spot.at, CAT_ACT_MINUTES.hide, spot.target);
  emit(state, { type: "cat-broke-free", cat: cat.id });
}

/** Хвилини життя одного кота. */
function tickCat(state: GameState, cat: Cat, minutes: number, rng: Rng, context: CatContext): void {
  grow(state, cat, minutes, rng);
  needsMood(state, cat, minutes, context);
  // Симптоми видно, поки кіт не спить: уві сні він не чхає й не чухається, а думка над сплячим була б дивною (§11.4).
  if (cat.away === null && cat.diseases.length > 0 && !asleep(cat)) showSymptoms(state, cat, minutes, rng);
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
  doorCall(state, cat, minutes, rng);
  comeBack(state, cat);
  if (context.present) sulk(state, cat);
  // Спокійну дію кіт кидає заради нагальної потреби.
  // «Вісімка» під ногами того, хто несе корм, — заради їжі, тож її голод не перериває (§9.12).
  // Голодний «Слухняний», що йде до столу згадати «ні», — не спокійна дія: інакше голод щокроку переривав би її, і кіт так і не
  // доходив би (перевірка етапу 2026-10-26).
  const calm =
    (cat.act.kind === "idle" && cat.act.target?.startsWith("no:") !== true) ||
    cat.act.kind === "wander" ||
    cat.act.kind === "hide" ||
    cat.act.kind === "attention" ||
    cat.act.kind === "toy" ||
    cat.act.kind === "ambush" ||
    cat.act.kind === "window" ||
    (cat.act.kind === "follow" && cat.act.target !== "food");
  // Кота під рукою — його пестять чи з ним грають — нагальне не перериває: інакше пестощі щокадру повертали б голодного кота на
  // місце, а він щокадру знову вирішував би, куди йти, витрачаючи rng (рішення автора 2026-10-26). Відпустили — вирішить сам.
  if (calm && urgent(state, cat) && !getsAttention(state, cat)) decide(state, cat, rng, context);
  if (cat.act.kind === "attention") {
    if (!context.present) cat.act.minutes = 0;
    else {
      // Іти слідом за персонажем; «Сам по собі» не ходить слідом, а чекає, поки підійдуть.
      const body = state.character.body;
      const near = Math.hypot(body.x - cat.x, body.y - cat.y) <= ARRIVED + keepDistance(cat);
      // Похід «через голод» — поки кіт голодний, а миски порожні: зголоднів дорогою — тепер через голод, наївся — вже ні (рішення
      // автора 2026-10-26: раніше це вирішувалося лише на початку походу).
      if (wantsFood(state, cat)) cat.act.forFood = true;
      else delete cat.act.forFood;
      // Прийшов і просить уваги — прояв, який персонаж бачить (§9.9), раз за похід. Поки персонаж кота не бачить (у душовій
      // кабіні), похід ще не «побачений»: інакше єдиний прояв за похід пропадав би (фінальна перевірка рис 2026-10-26).
      if (near && cat.act.seen !== true && witnesses(state, cat)) {
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
  lurk(state, cat, rng, context);
  onHigh(state, cat, context);
  approachGuarded(state, cat, rng);
  carryAlong(state, cat, context);
  paperSeen(state, cat);
  carrySeen(state, cat);
  chewSeen(state, cat);
  revengeSeen(state, cat);
  sinkSeen(state, cat);
  boxSeen(state, cat);
  weightSeen(state, cat);
  doorSeen(state, cat);
  dropsSeen(state, cat);
  rememberSeen(state, cat);
  cuddleSeen(state, cat);
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
        const done = cat.act;
        finish(state, cat, rng);
        // Бійка, яку почала `finish` (нагасався від м'яти), лишається.
        if (cat.act === done || cat.act.minutes <= 1e-9) decide(state, cat, rng, context);
      }
      continue;
    }
    if (cat.act.goal) {
      left = walk(cat, left, CAT_WALK_TILES_PER_MINUTE * walkFactor(cat));
      if (cat.act.goal) break;
      climbed(state, cat, rng);
      defied(state, cat);
      if (cat.act.kind === "wrestle") metMate(state, cat, rng);
      if (cat.act.kind === "groom") metGroomee(state, cat);
      if (cat.act.kind === "standoff" || cat.act.kind === "fight") metFoe(state, cat, rng);
      if (cat.act.kind === "sleep") {
        // Прийшов лягти до сплячого друга — може спершу вилизати його (§9.4, В2).
        if (groomBeforeSleep(state, cat, rng)) continue;
        fellAsleep(state, cat);
        sleptBeside(state, cat);
        sleptWarm(state, cat);
      }
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
  // Іграшка в зубах їде разом із котом (§9.12, «Подарунки й схованки»).
  carryAlong(state, cat, context);
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

/**
 * Кіт заснув у теплому чи прохолодному місці (§9.12, «Теплолюбність», рішення автора 2026-10-25): «+» на ліжку в «Холод» (а «Живе на
 * батареї» — завжди) залазить під ковдру; прояв «+» — заснув під ковдрою, на комп'ютері чи в сонячній плямі; «−» — розпластався на
 * прохолодній плитці у ванній, коли не спека (у спеку там лежать усі). Не частіше ніж раз на 2 години.
 */
function sleptWarm(state: GameState, cat: Cat): void {
  const level = traitLevel(cat, "warmth");
  // Над батареєю на підвіконні (фінальна перевірка рис 2026-10-26, «Живе на батареї»): клубочком на дошці біля скла — прояв «+»;
  // поки йшов, підвіконня зайняв інший кіт — спить на підлозі поруч.
  const pane = WINDOWS.find((w) => w.sill === cat.act.target);
  if (pane) {
    const sill = objectById(pane.sill);
    if (sillTaken(state, cat, sill)) return start(cat, "sleep", besideObject(state, sill), cat.act.minutes);
    cat.facing = pane.facing;
    cat.x = pane.seat.x;
    cat.y = pane.seat.y;
    if (level > 0) observe(state, cat, "warmth", 1, false, WARMTH.observeEvery);
    return;
  }
  if (cat.act.target === "tile") {
    // Лягає завжди головою праворуч, звідки б не прийшов (перевірка етапу 2026-10-26: біля стіни голову ховала стіна).
    cat.facing = 1;
    if (!isHot(state)) observe(state, cat, "warmth", -1, false, WARMTH.observeEvery);
    return;
  }
  const o = objectAt(state, Math.floor(cat.x), Math.floor(cat.y));
  if (level > 0 && o?.kind === "bed" && (isCold(state) || level >= WARMTH.blanketLevel)) cat.act.blanket = true;
  const sun = sunSpot(state.minute);
  const sunny = sun !== null && Math.floor(cat.x) === sun.x && Math.floor(cat.y) === sun.y;
  if (cat.act.blanket === true || o?.kind === "computer" || sunny) observe(state, cat, "warmth", 1, false, WARMTH.observeEvery);
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
    newThings(state, rng);
  }
  for (const cat of state.cats) tickCat(state, cat, minutes, rng, context);
  if (state.cats.length > 1) {
    tickRelations(state, minutes, rng);
    settleEnvy(state);
    warmKittens(state, minutes);
  }
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
  const standoff = RELATIONS.standoff;
  const cats = state.cats.filter((c) => home(state, c));
  const enemyNear = new Set<number>();
  for (let i = 0; i < cats.length; i++) {
    const a = cats[i];
    if (!a) continue;
    for (let j = i + 1; j < cats.length; j++) {
      const b = cats[j];
      if (!b) continue;
      // Сон поруч зближує (§9.4) — і тих, хто ще не друзі: «Товариський» лягає й до малознайомих (§9.12).
      const together = asleep(a) && asleep(b) && distance(a, b) <= RELATIONS.sleepTogether.distance;
      if (isFriend(state, a, b)) {
        if (together) changeRelation(state, a, b, RELATIONS.sleepTogether.perHour * hours);
        continue;
      }
      // Кошеня лізе до «Сам ще кошеня» — той шипить і б'є лапою (§9.12, «Турбота про кошенят»).
      swatKitten(state, a, b, rng);
      swatKitten(state, b, a, rng);
      // Новий дорослий кіт проходить повз — перші 2 дні на нього шиплять (§9.4, рішення автора 2026-10-26, Б5 а).
      hissAtNewcomer(state, a, b, rng);
      hissAtNewcomer(state, b, a, rng);
      // Не-друг проходить повз — «Конфліктний» може зашипіти (§9.12, «Товариськість»).
      snubPasser(state, a, b, rng);
      snubPasser(state, b, a, rng);
      if (!isEnemy(state, a, b)) {
        if (together) changeRelation(state, a, b, RELATIONS.sleepTogether.perHour * hours);
        continue;
      }
      if (!asleep(a)) enemyNear.add(a.id);
      if (!asleep(b)) enemyNear.add(b.id);
      // Вороги уникають одне одного (§9.4, рішення автора 2026-10-26): вільний кіт відходить від ворога, що ближче 2 клітинок.
      if (distance(a, b) < RELATIONS.avoid.distance) {
        if (freeToAvoid(state, a)) stepAway(state, a, b, RELATIONS.avoid.step, "avoid");
        if (freeToAvoid(state, b)) stepAway(state, b, a, RELATIONS.avoid.step, "avoid");
      }
      // Вороги поруч сходяться в протистояння, а не б'ються одразу.
      if (distance(a, b) > standoff.distance || !readyToFaceOff(state, a) || !readyToFaceOff(state, b)) continue;
      if (rng.chance(standoff.perMinute * minutes)) startStandoff(state, a, b);
    }
  }
  for (const cat of cats) if (enemyNear.has(cat.id)) changeMood(state, cat, RELATIONS.enemyMoodPerHour * hours);
}

// --- Протистояння ворогів (§9.4, рішення автора 2026-10-26) --------------------------------

/** Кіт у протистоянні саме з цим котом. */
const facesOff = (cat: Cat, foe: Cat): boolean => cat.act.kind === "standoff" && cat.act.target === `cat:${foe.id}`;

/** Кіт у протистоянні з ворогом (§9.4): натискання на нього — торкання, а не руки чи пестощі. */
export const inStandoff = (cat: Cat): boolean => cat.act.kind === "standoff";

/** Справи, з яких кіт може зійтися з ворогом у протистояння (§9.4): граються сам, просить, іде за персонажем чи по увагу. */
const STANDOFF_FROM = new Set(["toy", "attention", "beg", "follow"]);

/**
 * Кіт може зійтися з ворогом у протистояння (§9.4): не спить, нічим особливим не зайнятий, стоїть на підлозі, ліжку чи
 * дивані, і персонаж його не гладить, не грається з ним і не тримає.
 */
function readyToFaceOff(state: GameState, cat: Cat): boolean {
  const act = cat.act;
  const free = (act.kind === "idle" && act.target === null) || (act.kind === "wander" && (act.target === null || act.target === "play")) || STANDOFF_FROM.has(act.kind);
  return free && home(state, cat) && !isNewborn(cat) && !getsAttention(state, cat) && onFloor(state, cat);
}

/** Сміливість кота перед ворогом (§9.4): «Сміливість» + «Територіальність». */
const boldness = (cat: Cat): number => traitLevel(cat, "bravery") + traitLevel(cat, "territorial");

/**
 * Вороги сходяться в протистояння (§9.4): сміливіший підходить, другий чекає до `wait` хвилин; хвилини протистояння йдуть обом
 * від зустрічі (`metFoe`).
 */
function startStandoff(state: GameState, a: Cat, b: Cat): void {
  const [mover, other] = boldness(b) > boldness(a) ? [b, a] : [a, b];
  const s = RELATIONS.standoff;
  start(mover, "standoff", tileOf(other), s.wait, `cat:${other.id}`);
  start(other, "standoff", null, s.wait, `cat:${mover.id}`);
  other.facing = mover.x > other.x ? 1 : -1;
  emit(state, { type: "standoff", cats: [mover.id, other.id] });
}

/**
 * Двоє котів стають за `gap` клітинки обличчям одне до одного (§9.4, Б4) — обидва на клітинці того, хто чекав: на ній
 * точно можна стояти. Підійшов зліва — лишається зліва.
 */
function faceOff(cat: Cat, foe: Cat, gap: number): void {
  const tile = Math.floor(foe.x);
  const half = gap / 2;
  const mid = Math.min(tile + 1 - half - 0.01, Math.max(tile + half + 0.01, (cat.x + foe.x) / 2));
  const side = cat.x <= foe.x ? -1 : 1;
  cat.x = mid + side * half;
  foe.x = mid - side * half;
  cat.y = foe.y;
  cat.facing = -side;
  foe.facing = side;
}

/**
 * Кіт підійшов до ворога (§9.4): той ще чекає — обидва стають за 0,6 клітинки обличчям одне до одного, а хвилини протистояння
 * (2–4, щохвилини шипіння) чи бійки йдуть обом від цієї миті; не дочекався — нічого немає.
 */
function metFoe(state: GameState, cat: Cat, rng: Rng): void {
  const act = cat.act;
  const foe = catById(state, act.target);
  const s = RELATIONS.standoff;
  const waits = foe !== null && foe.act.kind === act.kind && foe.act.target === `cat:${cat.id}`;
  if (!foe || !home(state, foe) || !waits || distance(cat, foe) > s.reach) {
    act.refused = true;
    act.minutes = 0;
    return;
  }
  faceOff(cat, foe, RELATIONS.fight.gap);
  const minutes = act.kind === "standoff" ? between(s.minutes, rng) : RELATIONS.fight.minutes;
  for (const c of [cat, foe]) {
    c.act.paired = true;
    c.act.minutes = minutes;
    c.act.elapsed = 0;
  }
  // Бійка — стрес для обох: друг поруч може потім прийти вилизати (§9.4, «Гру й вилизування видно», В2).
  if (act.kind === "fight") {
    upset(state, cat, foe.id);
    upset(state, foe, cat.id);
  }
  if (act.kind !== "standoff") return;
  standoffHiss(state, cat, foe);
  standoffHiss(state, foe, cat);
}

/** Шипіння в протистоянні (§9.4): щохвилини, без спільної паузи шипіння (§9.12), але воно її запускає. */
function standoffHiss(state: GameState, cat: Cat, foe: Cat): void {
  cat.hissedAt = absoluteMinute(state.day, state.minute);
  emit(state, { type: "hissed", cat: cat.id, at: foe.id });
}

/**
 * Протистояння скінчилося само (§9.4): з шансом 40% (+10% за одиницю «Територіальності» обох, некастрованим самцям ×1,5) —
 * бійка, інакше той, хто програв би, відступає.
 */
function settleStandoff(state: GameState, a: Cat, b: Cat, rng: Rng): void {
  const s = RELATIONS.standoff;
  const territorial = Math.max(0, traitLevel(a, "territorial")) + Math.max(0, traitLevel(b, "territorial"));
  const hormones = Math.max(fightFactor(a), fightFactor(b));
  // Після бійки пара 90–120 хвилин не б'ється: протистояння закінчується відступом.
  if (!truced(state, a, b) && rng.chance((s.fight + s.territorialStep * territorial) * hormones)) return startFight(state, a, b, rng);
  const loser = loserOf(a, b, rng);
  retreat(state, loser, loser === a ? b : a, rng);
}

/** Хто програє бійку чи відступає (§9.4): у кого менша «Сміливість» + «Територіальність» + випадковість 0…`luck`. */
function loserOf(a: Cat, b: Cat, rng: Rng): Cat {
  const luck = RELATIONS.fight.luck;
  const scoreA = boldness(a) + rng.next() * luck;
  const scoreB = boldness(b) + rng.next() * luck;
  return scoreA < scoreB ? a : b;
}

/** Випадкове число хвилин від і до (§9.4). */
const between = ([shortest, longest]: readonly [number, number], rng: Rng): number => shortest + rng.next() * (longest - shortest);

/** Пара ще не відійшла від бійки (§9.4): 90–120 хвилин після неї не б'ється. */
function truced(state: GameState, a: Cat, b: Cat): boolean {
  const until = a.truce?.[b.id];
  return until !== undefined && absoluteMinute(state.day, state.minute) < until;
}

/** Той, хто програв бійку чи протистояння, відступає й ховається на 15–30 хвилин (§9.4). */
function hideFrom(state: GameState, loser: Cat, winner: Cat, rng: Rng): void {
  const spot = hideSpot(state, rng, loser);
  start(loser, "hide", spot.at, between(RELATIONS.fight.hide, rng), spot.target);
  emit(state, { type: "cat-retreated", cat: loser.id, from: winner.id });
}

/**
 * Протистояння без бійки (§9.4): той, хто програв би, відступає й ховається, а переможець сидить на місці (ціль «won»: від
 * ворога, що йде повз, він не відходить і нового протистояння не починає).
 */
function retreat(state: GameState, loser: Cat, winner: Cat, rng: Rng): void {
  hideFrom(state, loser, winner, rng);
  start(winner, "idle", null, RELATIONS.fight.winnerSits, "won");
}

/** Кіт може відійти від ворога (§9.4): не спить і стоїть чи бродить без мети, а персонаж його не гладить і не тримає. */
function freeToAvoid(state: GameState, cat: Cat): boolean {
  const act = cat.act;
  const free = (act.kind === "idle" && act.target === null && act.goal === null) || (act.kind === "wander" && act.target === null);
  return free && home(state, cat) && !isNewborn(cat) && !getsAttention(state, cat);
}

/** Біля персонажа вже стоїть ворог цього кота (§9.4, рішення автора 2026-10-26): по увагу кіт туди не йде. */
function enemyAtPerson(state: GameState, cat: Cat): boolean {
  const body = state.character.body;
  return state.cats.some(
    (other) => other.id !== cat.id && other.away === null && isEnemy(state, cat, other) && (isCarried(state, other) || Math.hypot(other.x - body.x, other.y - body.y) < RELATIONS.avoid.person),
  );
}

/** Бійка біля столу чи робочої поверхні (§9.4, Б4): з шансом 15% скидає з нього страву чи дрібничку, як зумі. */
function knockInFight(state: GameState, cat: Cat, at: Vec, rng: Rng): void {
  const f = RELATIONS.fight;
  const near = (id: string): boolean => distanceToRect(at, objectById(id)) <= f.knockReach;
  const dishes = SURFACE_IDS.filter((id) => state.home.surfaces[id] && near(id));
  const trinkets = standingTrinkets(state).filter((t) => near(t.object));
  const total = dishes.length + trinkets.length;
  if (total === 0 || !rng.chance(f.knock)) return;
  const pick = rng.int(0, total - 1);
  const dish = dishes[pick];
  if (dish !== undefined) {
    knockOff(state, cat, dish);
    return;
  }
  const trinket = trinkets[pick - dishes.length];
  if (trinket) knockTrinket(state, cat, trinket.kind, rng);
}

/** Кіт відходить на `step` клітинки від точки (§9.4, §9.12): ворога, персонажа в брудному одязі. */
function stepAway(state: GameState, cat: Cat, from: Vec, step: number, target: string | null): void {
  let dx = cat.x - from.x;
  let dy = cat.y - from.y;
  let length = Math.hypot(dx, dy);
  // Стоять в одній точці — назад, від того, куди дивиться.
  if (length < 1e-6) {
    dx = -cat.facing;
    dy = 0;
    length = 1;
  }
  const spot = visibleFloorNear(state, { x: cat.x + (dx / length) * step, y: cat.y + (dy / length) * step });
  start(cat, "wander", { x: Math.floor(spot.x), y: Math.floor(spot.y) }, CAT_ACT_MINUTES.wander, target);
}

/**
 * Гравець торкнувся кота в протистоянні (§9.4, рішення автора 2026-10-26): обидва розходяться — кожен на `part` клітинки від
 * іншого, — а персонажу це неприємне завдання. Одне натискання — одне торкання: доки кнопку не відпустили, пестощі біля
 * кота не почнуться (`holdSpent`). false — кіт не в протистоянні.
 */
export function touchStandoff(state: GameState, cat: Cat): boolean {
  if (cat.act.kind !== "standoff") return false;
  const foe = catById(state, cat.act.target);
  const s = RELATIONS.standoff;
  const at = { x: cat.x, y: cat.y };
  if (foe && facesOff(foe, cat)) stepAway(state, foe, at, s.part, "part");
  stepAway(state, cat, foe ?? at, s.part, "part");
  cat.interacted = true;
  unpleasantTask(state, s.touchSanity);
  state.character.holdSpent = true;
  emit(state, { type: "standoff-parted", cat: cat.id });
  return true;
}

/** Бійка ворогів (§9.4): обидва зупиняються, летить шерсть. */
function startFight(state: GameState, a: Cat, b: Cat, rng: Rng): void {
  const fight = RELATIONS.fight;
  stress(state, a);
  stress(state, b);
  // Коти зчіплюються за 0,6 клітинки обличчям одне до одного (§9.4, Б4): з протистояння вони вже поруч, а нападник (котяча м'ята,
  // «Охоронець») підбігає до другого, і той чекає (`metFoe`).
  const near = distance(a, b) <= fight.gap + 0.05;
  start(a, "fight", near ? null : tileOf(b), fight.minutes, `cat:${b.id}`);
  start(b, "fight", null, near ? fight.minutes : fight.minutes + RELATIONS.standoff.wait, `cat:${a.id}`);
  if (near) {
    faceOff(a, b, fight.gap);
    a.act.paired = true;
    b.act.paired = true;
    // Зчепилися одразу (з протистояння) — стрес для обох, як і в `metFoe` (§9.4, В2; перевірка блоку 3, 2026-10-26: бійка з
    // протистояння, тобто майже кожна бійка ворогів, стресом не була, і друга після неї не втішали).
    upset(state, a, b.id);
    upset(state, b, a.id);
  }
  const at = near ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: b.x, y: b.y };
  changeMood(state, a, fight.mood, "бійка");
  changeMood(state, b, fight.mood, "бійка");
  changeRelation(state, a, b, fight.relation);
  noteStrife(state, a, b, "fight");
  addMess(state, "fur", visibleFloorNear(state, at), null);
  emit(state, { type: "cat-fight", cats: [a.id, b.id] });
  // Хто програє, ясно з самого початку (§9.4): травма й схованка — йому, якщо бійку не розборонять.
  const loser = loserOf(a, b, rng);
  loser.act.lost = true;
  // Пауза пари (§9.4): 90–120 хвилин після бійки, і розбороненої, пара не б'ється.
  const until = absoluteMinute(state.day, state.minute) + between(fight.truce, rng);
  (a.truce ??= {})[b.id] = until;
  (b.truce ??= {})[a.id] = until;
  // Бійку чути (§9.4, §9.12): дрібний гучний звук для котів поруч — сплячі можуть прокинутися, полохливі сховатися; персонажа
  // не будить. Біля столу вона може скинути річ, як зумі.
  loudNoise(state, "fight", at);
  knockInFight(state, a, at, rng);
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

/** Дорогий корм є в домі: у сховищі, у мисці чи в годівниці (§9.12, «Заздрісність»). */
function premiumAtHome(state: GameState): boolean {
  const home = state.home;
  if (home.supplies.catFood.premium + home.supplies.sterileFood.premium > 0) return true;
  if (itemsOf(state, "bowl").some((b) => b.food > 0 && b.foodQuality === "premium")) return true;
  return (home.feeders ?? []).some((f) => f.food > 0 && f.foodQuality === "premium");
}

/**
 * Іншому котові щось перепало — ласощі, нашийник, вишуканий корм (§9.12): заздрісні коти, що це бачать, дмуться й
 * сваряться з ним; ті, хто «радіє за інших», навпаки, тішаться. Тригер (рішення автора 2026-10-25): дорогому корму не
 * заздрять, коли він є в домі чи заздрісник сам їв його за останні 6 годин; ласощам — коли й сам отримав ласощі протягом
 * 2 хвилин (тож заздрість до ласощів чекає 2 хвилини, `settleEnvy`); нашийнику — коли сам у нашийнику.
 */
export function envy(state: GameState, lucky: Cat, gift: "treat" | "collar" | "premium"): void {
  const now = absoluteMinute(state.day, state.minute);
  for (const other of state.cats) {
    if (other.id === lucky.id || !home(state, other) || asleep(other) || isNewborn(other) || distance(other, whereIs(state, lucky)) > ENVY.sight) continue;
    if (traitLevel(other, "envy") === 0) continue;
    if (gift === "premium" && (premiumAtHome(state) || (other.premiumAt !== undefined && now - other.premiumAt <= ENVY.premiumMinutes))) continue;
    if (gift === "collar" && other.collar !== null) continue;
    if (gift === "treat") {
      if (other.treatAt !== undefined && now - other.treatAt <= ENVY.graceMinutes) continue;
      other.envyOf = { cat: lucky.id, at: now };
      continue;
    }
    feelEnvy(state, other, lucky);
  }
}

/** Де кіт зараз: кота на руках персонаж несе з собою (його клітинка — та, де його взяли). */
const whereIs = (state: GameState, cat: Cat): Vec => (isCarried(state, cat) ? state.character.body : cat);

/**
 * Заздрість спрацювала (§9.12, «Заздрісність», рішення автора 2026-10-25): заздрісний дметься й свариться з тим, кому перепало, і
 * це видно — поруч (до 2 клітинок) шипить на нього одразу, а здалеку, нічим важливим не зайнятий, підходить і шипить зблизька (до
 * кота на руках не йде — шипить звідти); прояв «+» — шипіння. Щиросердий радіє за нього: підходить, сідає поруч і муркоче — прояв
 * «−». Самі настрій і стосунки змінюються й тоді, коли кіт не встиг ні зашипіти, ні підійти.
 */
function feelEnvy(state: GameState, other: Cat, lucky: Cat): void {
  const level = traitLevel(other, "envy");
  if (level === 0) return;
  const where = whereIs(state, lucky);
  const free = JEALOUS_FROM.has(other.act.kind);
  if (level > 0) {
    changeMood(state, other, ENVY.mood * level, "заздрить");
    changeRelation(state, other, lucky, ENVY.relation * level);
    if (distance(other, where) > ENVY.near && free && !isCarried(state, lucky)) {
      start(other, "jealous", tileOf(lucky), JEALOUSY.confrontMinutes, `cat:${lucky.id}`);
      other.act.envy = true;
      return;
    }
    if (hiss(state, other, lucky)) observe(state, other, "envy");
    return;
  }
  changeMood(state, other, ENVY.glad * -level, "радіє за іншого");
  if (!free) return;
  const side = other.x < where.x ? -0.9 : 0.9;
  start(other, "idle", tileOf(visibleFloorNear(state, { x: where.x + side, y: where.y })), ENVY.cuddleMinutes, `cuddle:${lucky.id}`);
  other.act.envy = true;
}

/** Заздрісник дійшов до того, кому перепало (§9.12, «Заздрісність»): той ще поруч — шипить зблизька, прояв «+». */
function enviousArrived(state: GameState, cat: Cat): void {
  const lucky = catById(state, cat.act.target);
  if (lucky && home(state, lucky) && distance(cat, whereIs(state, lucky)) <= ENVY.near && hiss(state, cat, lucky)) observe(state, cat, "envy");
}

/**
 * «Заздрісник» (+2) вихоплює ласощі (§9.12, «Заздрісність», рішення автора 2026-10-25): ви даєте ласощі котові на руках, а він
 * поруч з вами (до 1,5 клітинки), не спить і нічим важливим не зайнятий, — з шансом 20% вихоплює їх і з'їдає сам. Тоді ласощі
 * дістаються йому, а той, кого пригощали, лишається ні з чим. Прояв «+».
 */
export function snatchTreat(state: GameState, lucky: Cat, rng: Rng): Cat | null {
  const body = state.character.body;
  const thief = state.cats.find(
    (c) =>
      c.id !== lucky.id &&
      home(state, c) &&
      !asleep(c) &&
      !isNewborn(c) &&
      !isCarried(state, c) &&
      JEALOUS_FROM.has(c.act.kind) &&
      traitLevel(c, "envy") >= ENVY.snatchLevel &&
      Math.hypot(c.x - body.x, c.y - body.y) <= ENVY.snatchReach,
  );
  if (!thief || !rng.chance(ENVY.snatch)) return null;
  emit(state, { type: "treat-snatched", cat: thief.id, from: lucky.id });
  observe(state, thief, "envy");
  return thief;
}

/**
 * Заздрість до ласощів (§9.12): за 2 хвилини після того, як іншому дали ласощі, кіт, що ласощів так і не отримав,
 * заздрить (чи радіє); отримав — нічого.
 */
function settleEnvy(state: GameState): void {
  const now = absoluteMinute(state.day, state.minute);
  for (const cat of state.cats) {
    const pending = cat.envyOf;
    if (!pending || now - pending.at < ENVY.graceMinutes) continue;
    delete cat.envyOf;
    const lucky = state.cats.find((c) => c.id === pending.cat);
    const treated = cat.treatAt !== undefined && cat.treatAt >= pending.at;
    if (!lucky || treated || !home(state, cat) || asleep(cat)) continue;
    feelEnvy(state, cat, lucky);
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
 * Кіт лапає рулон чи тягне паперову стрічку на очах персонажа (§9.9): прояв «Мисливського інстинкту +» — раз за бешкет (лапає й
 * тягне — один бешкет, тож не частіше ніж раз на пів години).
 */
function paperSeen(state: GameState, cat: Cat): void {
  const act = cat.act;
  const paper = (act.kind === "unroll" && act.goal === null) || (act.kind === "wander" && act.target === "paper");
  if (!paper || act.seen === true || !witnesses(state, cat)) return;
  act.seen = true;
  observe(state, cat, "hunting", 1, false, HUNTING.observeEvery);
}

/** «Фонтанолюб» сидить на умивальнику й чекає, щоб відкрили кран, — на очах персонажа (§9.9): прояв «Пиття +», раз за раз. */
function sinkSeen(state: GameState, cat: Cat): void {
  const act = cat.act;
  if (act.kind !== "beg" || act.target !== "sink" || act.goal !== null || act.seen === true || !witnesses(state, cat)) return;
  act.seen = true;
  observe(state, cat, "drinking");
}

/**
 * «Водолаз» сидить у мокрій кабіні й ловить краплі на очах персонажа (§9.9): прояв «Любові до води +», раз за раз.
 */
function dropsSeen(state: GameState, cat: Cat): void {
  const act = cat.act;
  if (act.kind !== "idle" || act.target !== "drops" || act.goal !== null || act.seen === true || !witnesses(state, cat)) return;
  act.seen = true;
  observe(state, cat, "water");
}

/** Звідки кіт іде до води чи тікає від неї: не спить і нічим важливим не зайнятий (§9.12). */
const WATER_FROM = new Set(["idle", "wander", "toy", "beg", "attention", "follow", "groom"]);

/** Кіт поруч із водою вільний: удома, не спить, нічим важливим не зайнятий і не звикає до нового дому. */
const freeForWater = (state: GameState, cat: Cat): boolean =>
  home(state, cat) && !asleep(cat) && WATER_FROM.has(cat.act.kind) && !(cat.act.kind === "beg" && cat.act.target === "sink") && !isAdapting(state, cat);

/** Після вашого душу кабіна мокра (§9.12): «Водолаз» з шансом 30% за одиницю приходить ловити краплі. */
export function showerDrops(state: GameState): void {
  const rng = stateRng(state, "behavior");
  const shower = objectById("shower");
  for (const cat of state.cats) {
    const level = traitLevel(cat, "water");
    if (level <= 0 || !freeForWater(state, cat) || !rng.chance(WATER_PLAY.dropsStep * level)) continue;
    start(cat, "idle", { x: shower.x, y: shower.y }, WATER_PLAY.dropsMinutes, "drops");
  }
}

/**
 * Увімкнули воду — душ чи кран (§9.12): «Водобоязнь», що не спить у ванній, перелякано тікає з неї у вітальню — прояв
 * «Любові до води −» (раз на годину).
 */
export function waterFright(state: GameState): void {
  for (const cat of state.cats) {
    if (traitLevel(cat, "water") >= 0 || roomAt(cat) !== "bathroom" || !freeForWater(state, cat)) continue;
    start(cat, "wander", tileOf(visibleFloorNear(state, { x: 10.5, y: 7.5 })), CAT_ACT_MINUTES.wander, "flee");
    emit(state, { type: "scared", cat: cat.id });
    observe(state, cat, "water", -1, false, WATER_PLAY.observeEvery);
  }
}

/** Хвилина, коли річ з'явилася вдома, якщо вона ще нова (§9.12, «Допитливість»); null — річ уже звична. */
function freshAt(state: GameState, item: HomeItem): number | null {
  const entry = state.home.fresh?.find((f) => f.item === item.id);
  if (!entry || absoluteMinute(state.day, state.minute) - entry.at >= CURIOSITY.freshHours * MINUTES_PER_HOUR) return null;
  return entry.at;
}

/**
 * «Обачний» обходить нову річ (§9.12, «Допитливість», рішення автора 2026-10-25): 2 години × |рівень| не бере нової миски,
 * води, лотка чи кігтеточки, поки серед цих речей є стара. Немає старої — бере нову.
 */
function avoidNew<T extends HomeItem>(state: GameState, cat: Cat, items: T[]): T[] {
  const level = traitLevel(cat, "curiosity");
  if (level >= 0) return items;
  const now = absoluteMinute(state.day, state.minute);
  const shunned = (item: T): boolean => {
    const at = freshAt(state, item);
    return at !== null && now - at < CURIOSITY.shunHours * MINUTES_PER_HOUR * -level;
  };
  const old = items.filter((i) => !shunned(i));
  return old.length > 0 ? old : items;
}

/** Звідки кіт іде до нової речі: не спить і нічим важливим не зайнятий (§9.12). */
const SNIFF_FROM = new Set(["idle", "wander", "toy", "beg", "attention", "follow"]);

/**
 * Удома з'явилася нова річ, а персонаж удома й не спить (§9.12, «Допитливість»): кожен вільний кіт, що звик до дому, раз на
 * річ реагує — «+» з шансом 50% × рівень іде її обнюхати й сидить поруч, «−» з шансом 50% × |рівень| обнюхує й відходить.
 */
function newThings(state: GameState, rng: Rng): void {
  const fresh = state.home.fresh;
  if (!fresh) return;
  const now = absoluteMinute(state.day, state.minute);
  state.home.fresh = fresh.filter((f) => now - f.at < CURIOSITY.freshHours * MINUTES_PER_HOUR);
  for (const entry of state.home.fresh) {
    if (entry.noticed === true) continue;
    entry.noticed = true;
    const item = state.home.items.find((i) => i.id === entry.item);
    if (!item) continue;
    for (const cat of state.cats) {
      const level = traitLevel(cat, "curiosity");
      if (level === 0 || !home(state, cat) || asleep(cat) || !SNIFF_FROM.has(cat.act.kind) || isAdapting(state, cat)) continue;
      if (!rng.chance(CURIOSITY.sniffStep * Math.abs(level))) continue;
      if (level > 0) start(cat, "idle", itemTile(item), CURIOSITY.sniffMinutes, `sniff:${item.id}`);
      else start(cat, "idle", itemTile(item), CURIOSITY.shunMinutes, `shun:${item.id}`);
    }
  }
  if (state.home.fresh.length === 0) delete state.home.fresh;
}

/** Кіт спить у ящиках біля входу (§9.12, «Допитливість»): розпакувати їх не можна, поки його не забрали. */
export function catInBox(state: GameState): Cat | null {
  return state.cats.find((c) => home(state, c) && c.act.target === "boxes" && c.act.goal === null && c.act.kind === "sleep") ?? null;
}

/**
 * Спить у коробці, у барабані пральної машини чи в переносці на очах персонажа (§9.9): прояв «Допитливості +» чи «Переноски +», раз
 * за сон. Барабан — фінальна перевірка рис 2026-10-26: досі кота в ньому «помічали», лише натиснувши на пральну машину, хоча
 * клубочок у барабані видно й так.
 */
function boxSeen(state: GameState, cat: Cat): void {
  const act = cat.act;
  if (act.kind !== "sleep" || act.goal !== null || act.seen === true || !witnesses(state, cat)) return;
  const washer = objectById("washer");
  const drum = state.home.washer.state === "idle" && Math.floor(cat.x) === washer.x && Math.floor(cat.y) === washer.y;
  if (act.target !== "boxes" && act.target !== "carrier" && !drum) return;
  act.seen = true;
  if (act.target === "carrier") observe(state, cat, "carrier");
  else observe(state, cat, "curiosity");
}

/** Звідки «Втікач» іде кричати під двері: нічим важливим не зайнятий (§9.12). */
const DOOR_CALL_FROM = new Set(["idle", "wander", "toy"]);

/**
 * «Втікач» кричить під дверима (§9.12 «Двері й гості», рішення автора 2026-10-25): удень щогодини з шансом 4% × рівень (у
 * тічці ще +4%) 5–10 хвилин сидить під вхідними дверима й нявчить, як кіт, що просить.
 */
function doorCall(state: GameState, cat: Cat, minutes: number, rng: Rng): void {
  const level = traitLevel(cat, "escape");
  if (level <= 0 || isNight(state.minute) || !home(state, cat) || !DOOR_CALL_FROM.has(cat.act.kind) || isAdapting(state, cat) || isNewborn(cat)) return;
  const perHour = ESCAPE.callStep * level + (inHeat(state, cat) ? ESCAPE.heatCall : 0);
  if (!rng.chance(1 - (1 - perHour) ** (minutes / MINUTES_PER_HOUR))) return;
  const { min, max } = ESCAPE.callMinutes;
  start(cat, "beg", { ...DOOR_TILE }, min + rng.next() * (max - min), "door");
}

/**
 * Під дверима на очах персонажа (§9.9): «Втікач» кричить, просячись на сходи, — прояв «Втеч +»; «Душа компанії» прибігла
 * на дзвінок — прояв «Гостей +». Раз за раз.
 */
function doorSeen(state: GameState, cat: Cat): void {
  const act = cat.act;
  if (act.seen === true || !witnesses(state, cat)) return;
  if (act.kind === "beg" && act.target === "door" && act.goal === null) {
    act.seen = true;
    observe(state, cat, "escape");
  }
  if (act.kind === "idle" && act.target === "guest") {
    act.seen = true;
    observe(state, cat, "guests");
  }
}

/** Кіт, що сидить на умивальнику й чекає крана (§9.12, «Пиття»). */
export function catOnSink(state: GameState): Cat | null {
  return state.cats.find((c) => home(state, c) && c.act.kind === "beg" && c.act.target === "sink" && c.act.goal === null) ?? null;
}

/** Персонаж відкрив кран котові на умивальнику (§9.12): той п'є хвилину й задоволений. */
export function openTap(state: GameState, cat: Cat): void {
  start(cat, "drink", null, CAT_ACT_MINUTES.drink, "sink");
  emit(state, { type: "tap-opened", cat: cat.id });
  waterFright(state);
}

/**
 * Воду щойно долили (§9.12, рішення автора 2026-10-25): «Зразковий поїльник», що не спить і нічим важливим не зайнятий,
 * одразу йде пити, якщо хоч трохи спраглий, — прояв «Пиття −» (раз на годину).
 */
export function freshWater(state: GameState, water: WaterItem): void {
  for (const cat of state.cats) {
    if (traitLevel(cat, "drinking") >= 0 || !home(state, cat) || asleep(cat) || !FRESH_FROM.has(cat.act.kind) || isAdapting(state, cat)) continue;
    if (cat.needs.thirst < DRINKING.freshThirst) continue;
    start(cat, "drink", itemTile(water), CAT_ACT_MINUTES.drink, `item:${water.id}`);
    observe(state, cat, "drinking", -1, false, MINUTES_PER_HOUR);
  }
}

/** Звідки «Зразковий поїльник» іде до свіжої води: з дій, які не шкода кинути. */
const FRESH_FROM = new Set(["idle", "wander", "toy", "beg", "attention", "follow"]);

/**
 * Сечокам'яна від звичайного корму стерилізованому (§9.8, §9.12 «Пиття»): «Фонтанолюб» без фонтанчика п'є мало — ризик
 * вищий, «Зразковий поїльник» п'є багато — нижчий.
 */
export function stonesFactor(state: GameState, cat: Cat): number {
  const level = traitLevel(cat, "drinking");
  if (level > 0 && state.home.appliances.fountain !== null) return 1;
  return Math.max(0, 1 + DRINKING.stonesStep * level);
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
  if (offense.seen !== true && witnesses(state, cat)) {
    offense.seen = true;
    observe(state, cat, "touchy");
  }
}

/** Звідки ревнивець чи «Щедра душа» йде до кота, якого пестять: нічим важливим не зайнятий (§9.12). */
const JEALOUS_FROM = new Set(["idle", "wander", "toy", "beg", "attention", "follow", "window"]);

/**
 * Персонаж приділяє увагу коту — гладить, грається, кіт у нього на колінах чи на руках (§9.4, §9.12 «Ревнивість», рішення автора
 * 2026-10-25). Ревнивець, що бачить: поруч — шипить і може зігнати щасливця; здалеку — з шансом 25% × рівень приходить шипіти
 * зблизька, інакше шипить звідти. «Щедра душа» (−), коли ви гладите іншого, з шансом 20% × |рівень| приходить і лягає поруч.
 */
export function jealousy(state: GameState, lucky: Cat, why: "pet" | "play" | "lap" | "hands" = "pet"): void {
  const rng = stateRng(state, "behavior");
  const now = absoluteMinute(state.day, state.minute);
  for (const other of state.cats) {
    if (other.id === lucky.id || !home(state, other) || asleep(other) || isNewborn(other) || distance(other, lucky) > RELATIONS.jealousySight) continue;
    const level = traitLevel(other, "jealousy");
    if (level === 0) continue;
    const free = JEALOUS_FROM.has(other.act.kind) && (other.jealousAt === undefined || now - other.jealousAt >= JEALOUSY.pauseMinutes);
    if (level < 0) {
      if (why !== "pet" || !free || !rng.chance(JEALOUSY.cuddleStep * -level)) continue;
      other.jealousAt = now;
      const side = other.x < lucky.x ? -0.9 : 0.9;
      start(other, "idle", tileOf(visibleFloorNear(state, { x: lucky.x + side, y: lucky.y })), JEALOUSY.cuddleMinutes, `cuddle:${lucky.id}`);
      continue;
    }
    // Стосунки падають за кожен сеанс уваги до суперника, навіть коли шипіння ще на спільній паузі: пауза обмежує лише саме
    // шипіння (§9.12, рішення автора 2026-10-26; раніше без шипіння не було й сварки, і пауза ослаблювала рису).
    changeRelation(state, other, lucky, RELATIONS.jealousy * level);
    // Кота на руках персонаж несе далі, тож до нього не йдуть — шипить звідти (перевірка етапу 2026-10-26: ревнивець ішов туди,
    // де кота взяли, і, не заставши його, нічого не робив).
    if (why !== "hands" && distance(other, lucky) > JEALOUSY.near && free && rng.chance(JEALOUSY.comeStep * level)) {
      other.jealousAt = now;
      start(other, "jealous", tileOf(lucky), JEALOUSY.confrontMinutes, `cat:${lucky.id}`);
      continue;
    }
    confront(state, other, lucky, rng);
  }
}

/** Персонаж зараз приділяє увагу коту (§9.12, «Ревнивість»): гладить, грається, кіт на колінах чи на руках. */
function getsAttention(state: GameState, cat: Cat): boolean {
  const activity = state.character.activity;
  if (activity?.kind === "pet" && activity.cat === cat.id) return activity.bitten !== true && activity.left !== true;
  if (activity?.kind === "play" && activity.cat === cat.id) return activity.done !== true;
  return cat.act.kind === "lap" || isCarried(state, cat);
}

/**
 * Ревнивець шипить на щасливця — це видно й чути (§9.4); щойно шипів — мовчить (§9.12), а стосунки вже впали в `jealousy`.
 * Поруч (до 2 клітинок) щасливець з шансом 50% іде: пестощі чи гра перериваються, з колін зганяють; «Ревнивець» (+2) лягає
 * на коліна сам.
 */
function confront(state: GameState, cat: Cat, lucky: Cat, rng: Rng): void {
  if (!hiss(state, cat, lucky, "hand")) return;
  const level = traitLevel(cat, "jealousy");
  observe(state, cat, "jealousy");
  if (distance(cat, lucky) > JEALOUSY.near || !getsAttention(state, lucky) || isCarried(state, lucky) || !rng.chance(JEALOUSY.leave)) return;
  const activity = state.character.activity;
  const lap = lucky.act.kind === "lap";
  if (activity?.kind === "pet" && activity.cat === lucky.id) activity.left = true;
  if (activity?.kind === "play" && activity.cat === lucky.id) activity.done = true;
  backAway(state, lucky, cat);
  if (lap && level >= JEALOUSY.lapLevel && isWorking(state)) start(cat, "lap", null, MINUTES_PER_HOUR * 4, "character");
}

/** Ревнивець дійшов до кота, якого пестять (§9.12, «Ревнивість»): той ще під увагою — шипить зблизька. */
function jealousArrived(state: GameState, cat: Cat, rng: Rng): void {
  const lucky = catById(state, cat.act.target);
  if (lucky && home(state, lucky) && distance(cat, lucky) <= JEALOUSY.near && getsAttention(state, lucky)) confront(state, cat, lucky, rng);
}

/**
 * «Щедра душа» лягла поруч із котом, якого гладять (§9.12, «Ревнивість»): муркоче, і вони зближуються — прояв «−», раз за раз.
 */
function cuddleSeen(state: GameState, cat: Cat): void {
  const act = cat.act;
  if (act.kind !== "idle" || !act.target?.startsWith("cuddle:") || act.goal !== null || act.seen === true) return;
  if (act.done !== true) {
    act.done = true;
    const lucky = state.cats.find((c) => `cuddle:${c.id}` === act.target);
    // Того, до кого йшов, уже немає поруч — лягати й муркотіти нема до кого, і бачити нічого.
    if (!lucky || !home(state, lucky) || distance(cat, whereIs(state, lucky)) > JEALOUSY.near) {
      act.seen = true;
      return;
    }
    emit(state, { type: "cat-cuddled", cat: cat.id, with: lucky.id });
    // Щиросердий радіє за того, кого пригостили (§9.12, «Заздрісність»), — так само муркоче поруч, але це прояв іншої риси.
    changeRelation(state, cat, lucky, act.envy === true ? ENVY.cuddleRelation : JEALOUSY.cuddleRelation);
  }
  // Прояв — коли персонаж бачить, як кіт муркоче поруч, а не лише в мить, коли той ліг (рішення автора 2026-10-26).
  if (!witnesses(state, cat)) return;
  act.seen = true;
  if (act.envy === true) observe(state, cat, "envy", -1);
  else observe(state, cat, "jealousy", -1);
}

// --- Гра й стосунки котів (§9.12) -----------------------------------------------------------

/**
 * Котові на руках дали котячу м'яту (§9.12, «Котяча м'ята», рішення автора 2026-10-25). Кіт зістрибує на підлогу. Кошеня й кіт,
 * що реагував на м'яту менше ніж 2 години тому, лише понюхають її й підуть; «Байдужий» (−1) — так само (прояв «−»), а мататабі
 * діє на нього, як на кота без риси. «Шаленіє від м'яти» (−2) кусає руку, вистрибує й гасає, а тоді задирає кота поруч (прояв
 * «−»). Решта катається по ній — «+» довше, а потім засинає (прояв «+» — коли катається довше, ніж кіт без риси).
 */
export function catnipReaction(state: GameState, cat: Cat, quality: Quality, rng: Rng): "roll" | "sniff" | "frenzy" {
  const now = absoluteMinute(state.day, state.minute);
  const level = clamp(traitLevel(cat, "catnip"), -2, 2);
  const numb = isKitten(cat) || (cat.catnipAt !== undefined && now - cat.catnipAt < CATNIP.refractoryMinutes);
  state.character.held = null;
  const at = visibleFloorNear(state, state.character.body);
  cat.x = at.x;
  cat.y = at.y;
  const reaction = numb || (level === -1 && quality === "cheap") ? "sniff" : level <= -2 ? "frenzy" : "roll";
  emit(state, { type: "catnip", cat: cat.id, reaction });
  if (reaction === "sniff") {
    start(cat, "idle", null, CATNIP.sniffMinutes, "catnip");
    if (!numb) observe(state, cat, "catnip", -1);
    return reaction;
  }
  cat.catnipAt = now;
  if (reaction === "frenzy") {
    changeStat(state, "health", PET.biteHealth);
    emit(state, { type: "bite", cat: cat.id });
    changeMood(state, cat, CATNIP.frenzyMood, "шаленіє від м'яти");
    start(cat, "zoomies", randomFloor(rng), CATNIP.frenzyMinutes, "catnip");
    observe(state, cat, "catnip", -1);
    return reaction;
  }
  const effective = Math.max(0, level);
  changeMood(state, cat, CATNIP.mood[effective] ?? 0, "котяча м'ята");
  if (effective >= CATNIP.loveLevel) changeLove(state, cat, CATNIP.love, "котяча м'ята");
  start(cat, "catnip", null, CATNIP.rollMinutes[effective] ?? 0);
  return reaction;
}

/**
 * Нагасався від м'яти (§9.12, «Котяча м'ята»): шипить на найближчого кота, що не спить, і задирається з ним — лише з тим, до
 * кого можна підійти (перевірка блоку 1 «Бійки» 2026-10-26: нападник підбігає до другого й вилазив за ним на холодильник), і лише
 * з дорослим, що не друг: на кошеня й друга лише шипить (§9.4 «Згода, охорона й сварки», рішення автора 2026-10-26, Б7).
 */
function catnipFight(state: GameState, cat: Cat, rng: Rng): void {
  const others = state.cats.filter((c) => c.id !== cat.id && approachable(state, c) && !asleep(c) && !isNewborn(c) && c.act.kind !== "fight" && distance(c, cat) <= CATNIP.fightReach);
  others.sort((a, b) => distance(a, cat) - distance(b, cat));
  const other = others[0];
  if (!other || !hiss(state, cat, other)) return;
  // Пара ще не відійшла від бійки (§9.4, «Пауза пари»), кошеня чи друг — лише шипить.
  if (!truced(state, cat, other) && !isKitten(other) && !isFriend(state, cat, other)) startFight(state, cat, other, rng);
}

/**
 * Вага «подивитися у вікно» серед спокійних варіантів (§9.12, «Вікно», рішення автора 2026-10-25): удень 0,4 × (1 + 0,5 × рівень);
 * «Не дивиться у вікно» (−1) — ніколи, «Нудьгує біля вікна» (−2 і менше) — як кіт без риси; новонароджене — ніколи.
 */
export function windowWeight(state: GameState, cat: Cat): number {
  const hour = hourOf(state.minute);
  if (hour < WINDOW.from || hour >= WINDOW.to || isNewborn(cat)) return 0;
  const level = traitLevel(cat, "window");
  if (level === -1) return 0;
  // Щойно злився біля вікна — якийсь час туди не йде.
  if (cat.windowAngryAt !== undefined && absoluteMinute(state.day, state.minute) - cat.windowAngryAt < WINDOW.angerPause) return 0;
  return WINDOW.weight * (1 + WINDOW.step * Math.max(0, level));
}

/**
 * Підвіконня зайняте для цього кота (§9.12): там сидить чи спить інший кіт або вже йде туди — дивитися у вікно чи спати над
 * батареєю (фінальна перевірка рис 2026-10-26: на одному підвіконні — один кіт).
 */
function sillClaimed(state: GameState, cat: Cat, sill: HomeObject): boolean {
  return state.cats.some((c) => c.id !== cat.id && c.away === null && (inside(c, sill) || ((c.act.kind === "window" || c.act.kind === "sleep") && c.act.target === sill.id)));
}

/** Вільні підвіконня для сну над батареєю, найближче — першим (§9.12, «Теплолюбність»). */
function freeSills(state: GameState, cat: Cat): HomeObject[] {
  return WINDOWS.map((w) => objectById(w.sill))
    .filter((o) => !sillClaimed(state, cat, o))
    .sort((a, b) => distance(a, cat) - distance(b, cat));
}

/** На підвіконні вже сидить інший кіт (§9.12, «Вікно»). */
function sillTaken(state: GameState, cat: Cat, sill: HomeObject): boolean {
  return state.cats.some((c) => c.id !== cat.id && c.away === null && (inside(c, sill) || (c.act.kind === "window" && c.act.target === sill.id && c.act.goal === null)));
}

/**
 * Кіт іде на найближче вільне підвіконня (§9.12, «Вікно»): там нікого немає й ніхто туди не йде. Обидва зайняті — з шансом 50%
 * підходить до найближчого подивитися (там його може відігнати «Охоронець», «Територіальність»; перевірка етапу 2026-10-26: раніше
 * на зайняте підвіконня не йшли зовсім, і охороняти його не було від кого). false — нікуди не пішов.
 */
export function startWindow(state: GameState, cat: Cat, rng: Rng): boolean {
  // Туди, куди вже йде інший кіт — дивитися у вікно чи спати над батареєю, — не йде.
  const sills = WINDOWS.map((w) => objectById(w.sill)).filter(
    (o) => !state.cats.some((c) => c.id !== cat.id && c.away === null && (c.act.kind === "window" || c.act.kind === "sleep") && c.act.target === o.id && c.act.goal !== null),
  );
  sills.sort((a, b) => distance(a, cat) - distance(b, cat));
  const free = sills.find((o) => !sillTaken(state, cat, o));
  const sill = free ?? (rng.chance(WINDOW.contest) ? sills[0] : undefined);
  if (!sill) return false;
  // До зайнятого — на підлогу поруч: на чужу дошку не стрибає.
  start(cat, "window", free ? { x: sill.x, y: sill.y } : besideObject(state, sill), WINDOW.minMinutes + rng.next() * (WINDOW.maxMinutes - WINDOW.minMinutes), sill.id);
  return true;
}

/**
 * Кіт на підвіконні (§9.12, «Вікно»): дивиться у вікно — потреба гри потроху знімається, настрій росте, «+» «кекає» на птахів
 * (прояв «+»); «Нудьгує біля вікна» сіпає хвостом і за кілька хвилин злиться (прояв «−»), і дивитися у вікно йому кінець.
 */
function watchWindow(state: GameState, cat: Cat, minutes: number, rng: Rng): void {
  const act = cat.act;
  const pane = WINDOWS.find((w) => w.sill === act.target);
  // Підійшов, а підвіконня досі зайняте: постоїть, подивиться й піде (перевірка етапу 2026-10-26).
  if (pane && act.elapsed <= minutes + 1e-9 && sillTaken(state, cat, objectById(pane.sill))) {
    const sill = objectById(pane.sill);
    cat.facing = sill.x + 0.5 >= cat.x ? 1 : -1;
    start(cat, "idle", null, WINDOW.takenMinutes);
    return;
  }
  // Сідає на дошку підвіконня біля скла, обличчям до вікна.
  if (pane) {
    cat.facing = pane.facing;
    cat.x = pane.seat.x;
    cat.y = pane.seat.y;
  }
  const level = traitLevel(cat, "window");
  if (level <= -2) {
    if (act.elapsed < WINDOW.angerMinutes || act.refused === true) return;
    act.refused = true;
    act.minutes = 0;
    cat.windowAngryAt = absoluteMinute(state.day, state.minute);
    emit(state, { type: "window-angry", cat: cat.id });
    observe(state, cat, "window", -1, false, WINDOW.observeEvery);
    return;
  }
  const hours = minutes / MINUTES_PER_HOUR;
  cat.needs.play = Math.max(0, cat.needs.play - WINDOW.playPerHour * (1 + WINDOW.step * Math.max(0, level)) * hours);
  changeMood(state, cat, (level >= WINDOW.strongLevel ? WINDOW.strongMood : WINDOW.moodPerHour) * hours);
  if (level <= 0 || !rng.chance(1 - (1 - 1 / WINDOW.chatterMinutes) ** minutes)) return;
  emit(state, { type: "chatter", cat: cat.id });
  observe(state, cat, "window", 1, false, WINDOW.observeEvery);
}

/**
 * «Нудьгує біля вікна» зриває злість (§9.12, «Вікно»): перенаправлена агресія — шипить на найближчого кота, що не спить, поруч
 * (стосунки падають, той відходить), а нікого поруч — іде дерти диван.
 */
function windowRage(state: GameState, cat: Cat, rng: Rng): void {
  const others = state.cats.filter((c) => c.id !== cat.id && home(state, c) && !asleep(c) && !isNewborn(c) && c.act.kind !== "fight" && distance(c, cat) <= WINDOW.redirectReach);
  others.sort((a, b) => distance(a, cat) - distance(b, cat));
  const other = others[0];
  if (other && hiss(state, cat, other)) {
    changeRelation(state, cat, other, WINDOW.relation);
    backAway(state, other, cat);
    return;
  }
  // «Любить кігтеточку» й «Бережливий» і в злості деруть там, де завжди (§9.12, «Дряпання»; перевірка етапу 2026-10-26:
  // «Бережливий» дивана не дере ніколи).
  if (traitLevel(cat, "scratching") < 0) return startScratch(state, cat, rng);
  const sofa = objectById("sofa");
  start(cat, "scratch", { x: sofa.x + rng.int(0, sofa.w - 1), y: sofa.y - 1 }, SCRATCH.minutes, "sofa");
}

/** Заборонене місце, якому належить річ квартири (§9.12, «Слухняність»): комп'ютер — стіл із комп'ютером, решта — кухня. */
function zoneOf(objectId: string): ForbiddenZone {
  return objectById(objectId).kind === "computer" ? "desk" : "kitchen";
}

/** Заборонене місце, на якому кіт зараз сидить (§9.12, «Слухняність»): комп'ютер чи кухонний стіл, поверхня або плита; null — ні. */
export function forbiddenZoneAt(state: GameState, cat: Cat): ForbiddenZone | null {
  if (cat.act.goal !== null) return null;
  const o = objectAt(state, Math.floor(cat.x), Math.floor(cat.y));
  if (o?.kind === "computer") return "desk";
  return o?.kind === "table" || o?.kind === "counter" || o?.kind === "stove" ? "kitchen" : null;
}

/** Скільки хвилин кіт пам'ятає «ні» (§9.12, «Слухняність»): 2 години × max(0, 1 + 0,5 × рівень). */
export function noMemory(cat: Cat): number {
  return OBEDIENCE.minutes * Math.max(0, 1 + OBEDIENCE.step * traitLevel(cat, "obedience"));
}

/**
 * Чи піде кіт на заборонене місце (§9.12, «Слухняність»): «go» — «ні» не пам'ятає; «skip» — пам'ятає й туди не йде; «remember» —
 * пам'ятає, і це видно: «+» підходить, дивиться й розвертається. Підходив до цього місця менше ніж пів години тому — «skip»
 * (рішення автора 2026-10-26: голодний «Слухняний» без корму вертався до столу майже щохвилини).
 */
export function noGo(state: GameState, cat: Cat, zone: ForbiddenZone): "go" | "skip" | "remember" {
  const now = absoluteMinute(state.day, state.minute);
  const at = cat.toldNo?.[zone];
  if (at === undefined || now - at >= noMemory(cat)) return "go";
  if (traitLevel(cat, "obedience") <= 0) return "skip";
  const visited = cat.noVisitAt?.[zone];
  return visited !== undefined && now - visited < OBEDIENCE.approachEvery ? "skip" : "remember";
}

/**
 * «Ні» (§9.12, «Слухняність», рішення автора 2026-10-25): персонаж зняв кота з забороненого місця. Кіт запам'ятовує; «Анархіст» з
 * шансом 50% повернеться туди за 10 хвилин.
 */
export function sayNo(state: GameState, cat: Cat, zone: ForbiddenZone, rng: Rng): void {
  const now = absoluteMinute(state.day, state.minute);
  (cat.toldNo ??= {})[zone] = now;
  delete cat.comeback;
  if (traitLevel(cat, "obedience") <= -OBEDIENCE.comebackLevel && rng.chance(OBEDIENCE.comeback)) cat.comeback = { zone, at: now + OBEDIENCE.comebackMinutes };
}

/**
 * «+» іде до забороненого місця, щоб, підійшовши, згадати «ні» й розвернутися (§9.12, «Слухняність»); туди знову — не раніше ніж
 * за пів години від того, як дійшов (`rememberSeen`, `noGo`).
 */
function startRemember(state: GameState, cat: Cat, zone: ForbiddenZone, objectId: string): void {
  start(cat, "idle", besideObject(state, objectById(objectId)), OBEDIENCE.rememberMinutes, `no:${zone}`);
}

/**
 * Кіт згадав «ні» й розвертається — над ним думка, перекреслене місце (§9.12), не частіше ніж раз на 30 хвилин на кота (рішення
 * автора 2026-10-26: голодний «Слухняний» ходить до столу щокілька хвилин). Прояв «Слухняності +» — `obeyed`.
 */
function rememberNo(state: GameState, cat: Cat, zone: ForbiddenZone): void {
  const now = absoluteMinute(state.day, state.minute);
  if (cat.noThoughtAt === undefined || now - cat.noThoughtAt >= OBEDIENCE.thoughtEvery) {
    cat.noThoughtAt = now;
    emit(state, { type: "cat-remembered", cat: cat.id, zone });
  }
}

/** Кіт на очах персонажа згадав «ні» — прояв «Слухняності +», раз на годину (§9.9). */
const obeyed = (state: GameState, cat: Cat): void => observe(state, cat, "obedience", 1, false, OBEDIENCE.observeEvery);

/**
 * «+» підійшов до забороненого місця (§9.12): згадав «ні» — раз за підхід; прояв — коли персонаж бачить, як він стоїть біля місця,
 * а не лише в мить, коли кіт дійшов (рішення автора 2026-10-26).
 */
function rememberSeen(state: GameState, cat: Cat): void {
  const act = cat.act;
  if (act.kind !== "idle" || !act.target?.startsWith("no:") || act.goal !== null || act.seen === true) return;
  if (act.done !== true) {
    act.done = true;
    const zone = act.target.slice(3) as ForbiddenZone;
    // Відлік пів години — від того, як дійшов, а не як вирушив: дорога через квартиру — кілька хвилин (пошук багів 2026-10-26).
    (cat.noVisitAt ??= {})[zone] = absoluteMinute(state.day, state.minute);
    rememberNo(state, cat, zone);
  }
  if (!witnesses(state, cat)) return;
  act.seen = true;
  obeyed(state, cat);
}

/**
 * Кіт дійшов на заборонене місце, коли кіт без риси ще пам'ятав би «ні» (2 години), — прояв «Слухняності −» (§9.9): «Пропускає
 * повз вуха» повертається за годину, «Анархіст» — хоч одразу.
 */
function defied(state: GameState, cat: Cat): void {
  const zone = forbiddenZoneAt(state, cat);
  const at = zone === null ? undefined : cat.toldNo?.[zone];
  if (at === undefined || absoluteMinute(state.day, state.minute) - at >= OBEDIENCE.minutes) return;
  observe(state, cat, "obedience", -1, false, OBEDIENCE.observeEvery);
}

/** Звідки «Анархіст» повертається на заборонене місце: нічим важливим не зайнятий (§9.12). */
const COMEBACK_FROM = new Set(["idle", "wander", "toy", "attention", "follow"]);

/**
 * «Анархіст» повертається туди, звідки його зняли (§9.12, «Слухняність»): на клавіатуру чи на кухонний стіл. Зайнятий довше
 * за пів години — забуває.
 */
function comeBack(state: GameState, cat: Cat): void {
  const plan = cat.comeback;
  if (!plan) return;
  const now = absoluteMinute(state.day, state.minute);
  if (now < plan.at) return;
  if (now - plan.at > OBEDIENCE.comebackWindow) {
    delete cat.comeback;
    return;
  }
  if (!home(state, cat) || asleep(cat) || !COMEBACK_FROM.has(cat.act.kind)) return;
  delete cat.comeback;
  if (plan.zone === "desk") {
    const computer = objectById("computer");
    return start(cat, "keyboard", { x: computer.x, y: computer.y }, WORK_CAT.keyboardMinMinutes, "computer");
  }
  const table = objectById("table");
  start(cat, "idle", { x: table.x, y: table.y }, OBEDIENCE.comebackMinutes, "table");
}

/** Звідки «Конфліктний» шипить на кота, що проходить повз: не спить і нічим важливим не зайнятий (§9.12). */
const SNUB_FROM = new Set(["idle", "wander", "toy", "beg", "eat", "drink", "window"]);

/**
 * «Конфліктний» шипить на кота, що не друг і проходить повз ближче 1,5 клітинки (§9.12, «Товариськість», рішення автора
 * 2026-10-25): раз за зустріч, з шансом 15% × |рівень|; стосунки −1, а на цього кота — 2 години спокою. Прояв «−».
 */
function snubPasser(state: GameState, cat: Cat, other: Cat, rng: Rng): void {
  const level = traitLevel(cat, "sociability");
  if (level >= 0 || asleep(cat) || !SNUB_FROM.has(cat.act.kind) || other.act.goal === null || isNewborn(other) || distance(cat, other) > SOCIABILITY.passDistance) return;
  const now = absoluteMinute(state.day, state.minute);
  const next = cat.snubAt?.[other.id];
  if (next !== undefined && now < next) return;
  const hissed = rng.chance(SOCIABILITY.passStep * -level) && hiss(state, cat, other);
  (cat.snubAt ??= {})[other.id] = now + (hissed ? SOCIABILITY.passPause : SOCIABILITY.passEvery);
  if (!hissed) return;
  changeRelation(state, cat, other, SOCIABILITY.passRelation);
  observe(state, cat, "sociability", -1);
}

/**
 * Новий дорослий кіт проходить повз ближче 2 клітинок (§9.4 «Хто з ким грається», рішення автора 2026-10-26, Б5 а): перші 2 дні
 * дорослий кіт, що живе тут давно, не спить і нічим важливим не зайнятий, шипить на нього — раз за зустріч, з шансом 30% × (1 −
 * 0,25 × «Товариськість»); стосунки −1, без бійок.
 */
function hissAtNewcomer(state: GameState, cat: Cat, other: Cat, rng: Rng): void {
  const n = RELATIONS.newcomer;
  if (!isNewcomer(state, other) || isNewcomer(state, cat) || isKitten(cat) || asleep(cat) || !SNUB_FROM.has(cat.act.kind)) return;
  if (other.act.goal === null || distance(cat, other) >= n.distance) return;
  const now = absoluteMinute(state.day, state.minute);
  const next = cat.snubAt?.[other.id];
  if (next !== undefined && now < next) return;
  const hissed = rng.chance(n.hiss * Math.max(0, 1 - n.hissStep * traitLevel(cat, "sociability"))) && hiss(state, cat, other);
  (cat.snubAt ??= {})[other.id] = now + SOCIABILITY.passEvery;
  if (hissed) changeRelation(state, cat, other, n.relation);
}

/**
 * Кіт ліг спати поруч з іншим котом (§9.12): «Товариський» — купкою навіть із малознайомим, «Нянька» — обійнявши кошеня; прояви
 * «+», не частіше ніж раз на годину.
 */
function sleptBeside(state: GameState, cat: Cat): void {
  const other = cat.act.target?.startsWith("pile:") === true ? state.cats.find((c) => `pile:${c.id}` === cat.act.target) : undefined;
  if (!other || !asleep(other) || distance(cat, other) > RELATIONS.sleepTogether.distance) return;
  // Лягає впритул збоку, а не на того кота.
  cat.x = other.x + (other.x - Math.floor(other.x) > 0.5 ? -RELATIONS.beside : RELATIONS.beside);
  cat.y = other.y;
  // «Нянька» гріє кошеня (§9.12, «Турбота про кошенят»).
  if (isKitten(other) && !isKitten(cat) && traitLevel(cat, "nurturing") > 0) observe(state, cat, "nurturing", 1, false, NURTURING.observeEvery);
  if (!isFriend(state, cat, other)) observe(state, cat, "sociability", 1, false, SOCIABILITY.observeEvery);
}

/**
 * Друг прийшов вилизати кота, а той не терпить дотиків (§9.12, «Вилизування друзів», рішення автора 2026-10-25): з шансом 40% ×
 * |рівень| відсторонюється (від −2 — ще й шипить), стосунки −1. Прояв «−».
 */
function refusesGrooming(state: GameState, cat: Cat, by: Cat, rng: Rng): boolean {
  const level = traitLevel(cat, "grooming");
  if (level >= 0 || !home(state, cat) || asleep(cat) || distance(cat, by) > RELATIONS.groom.reach || !rng.chance(GROOMING.refuseStep * -level)) return false;
  emit(state, { type: "groom-refused", cat: cat.id, by: by.id });
  cat.untouchedAt = absoluteMinute(state.day, state.minute);
  if (level <= -2) hiss(state, cat, by);
  changeRelation(state, cat, by, GROOMING.refuseRelation);
  backAway(state, cat, by);
  observe(state, cat, "grooming", -1);
  return true;
}

/** З цієї миски вже їсть інший кіт чи її вартує «Господар території» (§9.12, «Територіальність»). */
function bowlTaken(state: GameState, cat: Cat, bowl: BowlItem): boolean {
  const target = `item:${bowl.id}`;
  return state.cats.some((o) => o.id !== cat.id && o.away === null && ((o.act.kind === "eat" && o.act.target === target) || o.act.target === `guard:${target}`));
}

/**
 * «Ділиться» сів їсти з миски, з якої вже їсть інший кіт, хоч є й вільна з кормом (§9.12, «Територіальність»): кіт без риси обрав
 * би вільну — прояв «−», не частіше ніж раз на пів години.
 */
function shareBowl(state: GameState, cat: Cat): void {
  const bowl = itemById<BowlItem>(state, cat.act.target);
  if (traitLevel(cat, "territorial") >= 0 || bowl?.kind !== "bowl" || !bowlTaken(state, cat, bowl)) return;
  if (!itemsOf(state, "bowl").some((b) => b.id !== bowl.id && b.food > 0 && !bowlTaken(state, cat, b))) return;
  observe(state, cat, "territorial", -1, false, TERRITORY.shareEvery);
}

/** До чого кіт іде, коли це може бути чиясь зайнята річ (§9.12, «Територіальність»): миска (їсти), лоток, підвіконня. */
function guardableTarget(cat: Cat): string | null {
  const act = cat.act;
  if (act.goal === null) return null;
  if ((act.kind === "eat" || act.kind === "toilet") && act.target?.startsWith("item:") === true) return act.target;
  return act.kind === "window" ? act.target : null;
}

/** Що охороняють (§9.4, Р2): миска, лоток чи підвіконня — значок у шипінні. */
function guardCause(state: GameState, target: string): HissCause {
  const item = itemById<HomeItem>(state, target);
  return item?.kind === "bowl" ? "bowl" : item?.kind === "litter" ? "litter" : "window";
}

/**
 * Кіт іде до миски, лотка чи підвіконня, де вже «Охоронець» (§9.12, «Територіальність», рішення автора 2026-10-25): той, щойно кіт
 * підійшов ближче 2 клітинок, з шансом 30% × рівень шипить, і кіт відходить — потреба лишається, стосунки −3. Відігнаний від лотка з
 * терміновою потребою може не дотерпіти (30%). Прояв «+». Від ворога так само охороняє й кіт без риси — як «Охоронець» +1 (§9.4
 * «Згода, охорона й сварки», рішення автора 2026-10-26, Б3).
 */
function approachGuarded(state: GameState, cat: Cat, rng: Rng): void {
  const target = guardableTarget(cat);
  if (target === null || cat.act.guarded === true) return;
  const guardLevel = (g: Cat): number => Math.max(traitLevel(g, "territorial"), isEnemy(state, g, cat) ? TERRITORY.enemyLevel : 0);
  const guard = state.cats.find(
    (g) =>
      g.id !== cat.id &&
      home(state, g) &&
      !asleep(g) &&
      guardLevel(g) > 0 &&
      g.act.goal === null &&
      (g.act.target === target || g.act.target === `guard:${target}`) &&
      distance(g, cat) <= TERRITORY.guardReach,
  );
  if (!guard) return;
  cat.act.guarded = true;
  const now = absoluteMinute(state.day, state.minute);
  if (guard.guardedAt !== undefined && now - guard.guardedAt < TERRITORY.guardPause) return;
  if (!rng.chance(TERRITORY.guardStep * guardLevel(guard)) || !hiss(state, guard, cat, guardCause(state, target))) return;
  guard.guardedAt = now;
  changeRelation(state, guard, cat, TERRITORY.guardRelation);
  // Охорона — теж сварка за ресурс (§9.4, Б6; ухвалено — рішення автора 2026-10-26 після блоку 4).
  noteStrife(state, guard, cat, "quarrel");
  // Прояв «Територіальності» — лише в «Охоронця»: ворог без риси охороняє через ворожнечу.
  if (traitLevel(guard, "territorial") > 0) observe(state, guard, "territorial");
  if (cat.act.kind === "toilet" && cat.needs.toilet >= TERRITORY.surpriseNeed && rng.chance(TERRITORY.surpriseChance)) {
    addMess(state, "surprise", visibleFloorNear(state, cat), cat.id);
    cat.needs.toilet = 0;
  }
  backAway(state, cat, guard);
}

/**
 * Вилизав друга (§9.4): обом настрій +1, а тому, кого вилизали після стресу, — +2, раз за стрес; стосунки — що міцніша дружба, то
 * менше (рішення автора 2026-10-26, В2: було +2 завжди, і друзі з +55 доходили до 100 за 4–5 днів).
 */
function groomedFriend(state: GameState, cat: Cat, friend: Cat, act: CatAct, rng: Rng): void {
  const g = RELATIONS.groom;
  changeMood(state, cat, g.mood);
  changeMood(state, friend, act.comfort === true ? g.upsetMood : g.mood);
  if (act.comfort === true) delete friend.upset;
  changeRelation(state, cat, friend, groomGain(relation(state, cat, friend)));
  emit(state, { type: "groomed", cat: cat.id, friend: friend.id });
  observe(state, cat, "grooming");
  observe(state, cat, "sociability");
  // Друг, що не спить і досі сидить поруч, з шансом 40% хвилину вилизує у відповідь — тепер мружиться перший (§9.4, В3).
  if (!isLickedBy(friend, cat) || !rng.chance(groomChance(friend, g.back))) return;
  start(friend, "groom", null, g.backMinutes, `cat:${cat.id}`);
  friend.act.back = true;
  holdStill(cat, friend, g.backMinutes);
}

/** «Нянька» вилизала кошеня (§9.12, «Турбота про кошенят»): малому приємно, вони зближуються — прояв «+». */
function groomedKitten(state: GameState, cat: Cat): void {
  const kitten = state.cats.find((c) => `kitten:${c.id}` === cat.act.target);
  if (!kitten || !home(state, kitten) || distance(cat, kitten) > RELATIONS.groom.reach || cat.act.refused === true) return;
  changeMood(state, kitten, NURTURING.groomMood);
  changeRelation(state, cat, kitten, NURTURING.groomRelation);
  emit(state, { type: "groomed", cat: cat.id, friend: kitten.id });
  observe(state, cat, "nurturing");
}

/** Поки «Нянька» спить, обійнявши кошеня, малому тепло (§9.12, «Турбота про кошенят»): настрій +0,5 за годину. */
function warmKittens(state: GameState, minutes: number): void {
  for (const kitten of state.cats) {
    if (!isKitten(kitten) || !home(state, kitten) || !asleep(kitten)) continue;
    const nanny = state.cats.some((c) => c.id !== kitten.id && !isKitten(c) && home(state, c) && asleep(c) && traitLevel(c, "nurturing") > 0 && distance(c, kitten) <= RELATIONS.sleepTogether.distance);
    if (nanny) changeMood(state, kitten, NURTURING.warmPerHour * (minutes / MINUTES_PER_HOUR));
  }
}

/**
 * Кошеня лізе до «Сам ще кошеня» (§9.12, «Турбота про кошенят», рішення автора 2026-10-25): той, не сплячи, з шансом 50% × |рівень|
 * шипить і б'є лапою — кошеняті настрій −2, і воно відскакує; на це кошеня — година спокою. Прояв «−».
 */
function swatKitten(state: GameState, cat: Cat, kitten: Cat, rng: Rng): void {
  const level = traitLevel(cat, "nurturing");
  if (level >= 0 || isKitten(cat) || !isKitten(kitten) || isNewborn(kitten) || asleep(cat) || asleep(kitten) || !SNUB_FROM.has(cat.act.kind)) return;
  if (distance(cat, kitten) > NURTURING.swatReach || (kitten.act.goal === null && kitten.act.kind !== "zoomies")) return;
  const now = absoluteMinute(state.day, state.minute);
  const next = cat.snubAt?.[kitten.id];
  if (next !== undefined && now < next) return;
  const hissed = rng.chance(NURTURING.swatStep * -level) && hiss(state, cat, kitten, "kitten");
  (cat.snubAt ??= {})[kitten.id] = now + (hissed ? NURTURING.swatPause : SOCIABILITY.passEvery);
  if (!hissed) return;
  changeMood(state, kitten, NURTURING.swatMood, "відігнали");
  backAway(state, kitten, cat);
  observe(state, cat, "nurturing", -1);
}
