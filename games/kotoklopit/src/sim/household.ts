// Побут (§8.7): шерсть і пилосос, прання, техніка (автогодівниця, фонтанчик, робот-пилосос), поломки.

import { traitLevel } from "./cat";
import { changeStat, unpleasantTask } from "./character";
import { BOWL_CAPACITY, HOUSEHOLD, MESS_ANNOYANCE, MINUTES_PER_HOUR, NOISE, SHEDDING, WATER_CAPACITY } from "./config";
import { inView, observe } from "./knowledge";
import { addSupply, takeSupplies, topQuality, useSupply } from "./economy";
import { emit } from "./events";
import { cycleHygiene } from "./grooming";
import { hygieneFactorMod } from "./modifiers";
import { addMess } from "./catai";
import { itemPoint, objectById, slotCenter } from "./home";
import { loudNoise } from "./noise";
import type { Rng } from "./rng";
import type { BowlItem, Cat, Feeder, GameState, HomeItem, Product, Quality, Vec } from "./types";

/** Множник падіння гігієни (§8.7): без чистого одягу й у шерсті вона падає швидше. */
export function hygieneFactor(state: GameState): number {
  const home = state.home;
  return (home.clothes <= 0 ? HOUSEHOLD.noClothesHygiene : 1) * (home.fur >= HOUSEHOLD.dirtyFur ? HOUSEHOLD.furHygiene : 1) * cycleHygiene(state) * hygieneFactorMod(state);
}

/**
 * Безлад дратує (§9.12, правка автора 2026-10-23): кожен, що в полі зору персонажа, — здоровий
 * глузд за годину, разом не більше межі. З душової кабіни безладу не видно. Лише вдень, удома.
 */
export function annoyingMesses(state: GameState, minutes: number): void {
  const activity = state.character.activity;
  if (state.trip !== null || (activity?.kind === "use" && activity.inside)) return;
  const seen = state.home.messes.filter((m) => inView(state, m)).length;
  if (seen === 0) return;
  const perHour = Math.max(MESS_ANNOYANCE.max, seen * MESS_ANNOYANCE.perHour);
  changeStat(state, "sanity", perHour * (minutes / MINUTES_PER_HOUR));
}

/** Скільки шерсті кіт лишає за годину (§8.7): після грумера — удвічі менше (рішення автора 2026-10-25). */
export function furPerHour(state: GameState, cat: Cat): number {
  if (cat.shape.coat === "hairless") return 0;
  const long = cat.shape.coat === null && !cat.genes.short[0] && !cat.genes.short[1];
  const groomed = state.day <= cat.groomedUntil ? SHEDDING.groomed : 1;
  return HOUSEHOLD.furPerCatHour * (long ? HOUSEHOLD.longFur : 1) * Math.max(0, 1 + HOUSEHOLD.sheddingStep * traitLevel(cat, "shedding")) * groomed;
}

/** Кіт у барабані відчиненої пральної машини (§8.7). */
export function catInWasher(state: GameState): Cat | null {
  const washer = objectById("washer");
  return state.cats.find((c) => c.away === null && c.act.goal === null && Math.floor(c.x) === washer.x && Math.floor(c.y) === washer.y) ?? null;
}

/**
 * Дія біля пральної машини (§8.7): спершу вигнати кота з барабана, потім запустити прання з пральним
 * засобом, а випране — розвісити. Повертає, що сталося, або причину відмови.
 */
export function tapWasher(state: GameState): "cat" | "started" | "hung" | "empty" | "busy" {
  const washer = state.home.washer;
  if (washer.state === "washing") return "busy";
  if (washer.state === "done") {
    state.home.clothes = HOUSEHOLD.clothesDays[washer.quality];
    washer.state = "idle";
    emit(state, { type: "laundry", stage: "hung" });
    return "hung";
  }
  const cat = catInWasher(state);
  if (cat) {
    // Застали кота в барабані — прояв «Допитливості» (§9.9).
    observe(state, cat, "curiosity");
    cat.y += 1;
    cat.act = { kind: "idle", target: null, goal: null, minutes: 2, elapsed: 0 };
    emit(state, { type: "laundry", stage: "cat", cat: cat.id });
    return "cat";
  }
  const quality = useSupply(state, "detergent");
  if (quality === null) return "empty";
  state.home.washer = { state: "washing", minutes: HOUSEHOLD.washMinutes, quality };
  emit(state, { type: "laundry", stage: "started" });
  return "started";
}

/**
 * Пилососити завершено (§8.7): шерсті немає. Котів лякає сам гул пилососа — гучний звук, щойно він загудів
 * (`holdTick`, §9.12).
 */
export function vacuumed(state: GameState): void {
  state.home.fur = 0;
  unpleasantTask(state, HOUSEHOLD.vacuumSanity);
  emit(state, { type: "vacuumed" });
}

/** Хвилини побуту вдень і вночі: шерсть, прання, техніка за розкладом. */
export function tickHousehold(state: GameState, from: number, minutes: number): void {
  const home = state.home;
  const hours = minutes / 60;
  for (const cat of state.cats) if (cat.away === null) home.fur = Math.min(100, home.fur + furPerHour(state, cat) * hours);
  if (home.washer.state === "washing") {
    const before = home.washer.minutes;
    home.washer.minutes -= minutes;
    // Віджим — останні хвилини прання: машина гуркоче на всю ванну (§9.12).
    if (before > NOISE.spinMinutes && home.washer.minutes <= NOISE.spinMinutes) {
      emit(state, { type: "laundry", stage: "spin" });
      const washer = objectById("washer");
      loudNoise(state, "spin", { x: washer.x + 0.5, y: washer.y + 0.5 });
    }
    if (home.washer.minutes <= 0) {
      home.washer.state = "done";
      emit(state, { type: "laundry", stage: "done" });
    }
  }
  const crossed = (minute: number): boolean => from % 1440 < minute && (from + minutes) % 1440 >= minute && minutes < 1440;
  const fed = feed(state);
  if (fed.length > 0) emit(state, { type: "feeder", bowls: fed });
  if (home.appliances.fountain) for (const item of home.items) if (item.kind === "water") item.water = WATER_CAPACITY;
  if (home.appliances.robot && minutes < 1440) robotClean(state, from, minutes, crossed);
}

/**
 * Робот-пилосос (§8.7): о 12:00 вирушає з бази — гучний звук на всю квартиру (§9.12) — і годину їздить усією
 * квартирою; шерсть зникає поступово й до кінця прибирання — повністю.
 */
function robotClean(state: GameState, from: number, minutes: number, crossed: (minute: number) => boolean): void {
  const start = HOUSEHOLD.robotMinute;
  const end = start + HOUSEHOLD.robotMinutes;
  if (crossed(start)) loudNoise(state, "robot", null);
  const a = from % 1440;
  const lo = Math.max(a, start);
  const hi = Math.min(a + minutes, end);
  if (hi <= lo) return;
  if (hi >= end) {
    state.home.fur = 0;
    emit(state, { type: "robot" });
    return;
  }
  state.home.fur *= 1 - (hi - lo) / (end - lo);
}

/** Скільки проїхав робот-пилосос: 0–1 під час прибирання, null — стоїть на базі чи його немає (§8.7). */
export function robotProgress(state: GameState): number | null {
  if (!state.home.appliances.robot) return null;
  const minute = state.minute % 1440;
  const start = HOUSEHOLD.robotMinute;
  if (minute < start || minute >= start + HOUSEHOLD.robotMinutes) return null;
  return (minute - start) / HOUSEHOLD.robotMinutes;
}

/**
 * База робота-пилососа у вітальні й маршрут прибирання всією квартирою (§8.7): кухня, ванна, спальня — крізь
 * дверні прорізи (x 16, 11 і 4), потім уся вітальня й назад на базу. У симуляції — бо на роботі катається кіт (§9.12).
 */
export const ROBOT_DOCK: Vec = { x: 17.6, y: 8.2 };
const ROBOT_ROUTE: readonly Vec[] = [
  ROBOT_DOCK,
  { x: 16, y: 7 },
  // Кухня.
  { x: 16, y: 4.3 },
  { x: 18.4, y: 4.3 },
  { x: 13.5, y: 4.3 },
  { x: 16, y: 4.3 },
  { x: 16, y: 7 },
  // Ванна.
  { x: 11, y: 7 },
  { x: 11, y: 4.3 },
  { x: 8.6, y: 4.3 },
  { x: 8.6, y: 3.4 },
  { x: 11.4, y: 3.4 },
  { x: 11, y: 4.3 },
  { x: 11, y: 7 },
  // Спальня.
  { x: 4, y: 7 },
  { x: 4, y: 4.3 },
  { x: 1.6, y: 4.3 },
  { x: 1.6, y: 2.8 },
  { x: 6.4, y: 2.8 },
  { x: 6.4, y: 4.3 },
  { x: 4, y: 4.3 },
  { x: 4, y: 7 },
  // Вітальня — двома смугами.
  { x: 1.6, y: 7 },
  { x: 1.6, y: 9.2 },
  { x: 17, y: 9.2 },
  ROBOT_DOCK,
];

/** Точка на маршруті за часткою пройденого шляху 0–1. */
function along(route: readonly Vec[], progress: number): Vec {
  const lengths = route.slice(1).map((p, i) => Math.hypot(p.x - (route[i]?.x ?? 0), p.y - (route[i]?.y ?? 0)));
  let left = progress * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i] ?? 0;
    const a = route[i] ?? ROBOT_DOCK;
    const b = route[i + 1] ?? ROBOT_DOCK;
    if (left <= length) return { x: a.x + ((b.x - a.x) * left) / length, y: a.y + ((b.y - a.y) * left) / length };
    left -= length;
  }
  return route[route.length - 1] ?? ROBOT_DOCK;
}

/** Де робот-пилосос: у дорозі — на маршруті, інакше — на базі (§8.7). */
export function robotAt(state: GameState): Vec {
  const progress = robotProgress(state);
  return progress === null ? ROBOT_DOCK : along(ROBOT_ROUTE, progress);
}

/**
 * Спорожнити автогодівницю (§9.12, правка автора 2026-10-25): корм із неї й з миски під нею — назад у
 * сховище, а що не влазить — у ящики біля входу. Повертає, які запаси поповнилися.
 */
export function emptyFeeder(state: GameState, bowl: BowlItem, feeder: Feeder): Product[] {
  const products: Product[] = [];
  // Надкльовану половинку порції (§9.12, «Апетит») назад у сховище не кладуть — її викидають.
  const nibbled = bowl.half === true ? 1 : 0;
  delete bowl.half;
  for (const holder of [feeder, bowl]) {
    const food = holder.food - (holder === bowl ? nibbled : 0);
    if (food > 0 && holder.foodQuality !== null) {
      const product = holder.sterile ? "sterileFood" : "catFood";
      addSupply(state, product, holder.foodQuality, food);
      if (!products.includes(product)) products.push(product);
    }
    holder.food = 0;
    holder.foodQuality = null;
    holder.sterile = false;
  }
  if (products.length > 0) emit(state, { type: "feeder-emptied", item: bowl.id, products });
  return products;
}

/** Корм у мисці й у годівниці однаковий: корми не змішують (§6.4, §9.12). */
export function sameFood(a: { food: number; foodQuality: Quality | null; sterile: boolean }, quality: Quality, sterile: boolean): boolean {
  return a.food === 0 || (a.foodQuality === quality && a.sterile === sterile);
}

/**
 * Автогодівниці (§9.12, правка автора 2026-10-23) не за годинами, а завжди тримають миску під собою
 * повною, доки в бункері є корм; мисці з іншим кормом не досипають. Повертає миски, куди насипали.
 */
function feed(state: GameState): number[] {
  const filled: number[] = [];
  for (const feeder of state.home.feeders ?? []) {
    if (feeder.food <= 0 || feeder.foodQuality === null) continue;
    const bowl = state.home.items.find((i): i is BowlItem => i.kind === "bowl" && i.slot === feeder.slot);
    if (!bowl || bowl.food >= BOWL_CAPACITY || !sameFood(bowl, feeder.foodQuality, feeder.sterile)) continue;
    const poured = Math.min(feeder.food, BOWL_CAPACITY - bowl.food);
    feeder.food -= poured;
    bowl.food += poured;
    bowl.foodQuality = feeder.foodQuality;
    bowl.sterile = feeder.sterile;
    filled.push(bowl.id);
  }
  return filled;
}

/**
 * Яким кормом насипати порожню миску не персонажу (автогодівниця, друг, §4.1, §8.7): коли вдома є
 * стерилізований кіт — кормом для стерилізованих, поки він є, бо звичайний йому шкодить (§9.8).
 */
function bowlFoodKind(state: GameState): { quality: Quality; sterile: boolean } | null {
  if (state.cats.some((c) => c.sterilized && c.away === null)) {
    const quality = topQuality(state, "sterileFood");
    if (quality !== null) return { quality, sterile: true };
  }
  const quality = topQuality(state, "catFood");
  return quality === null ? null : { quality, sterile: false };
}

/**
 * Досипати миску зі сховища до `upTo` порцій (§6.4): тим самим кормом, що вже в ній, — корми не
 * змішують; порожню — за bowlFoodKind. Повертає, скільки насипано.
 */
export function stockBowl(state: GameState, bowl: BowlItem, upTo = BOWL_CAPACITY): number {
  const kind = bowl.food > 0 && bowl.foodQuality !== null ? { quality: bowl.foodQuality, sterile: bowl.sterile } : bowlFoodKind(state);
  if (kind === null || bowl.food >= upTo) return 0;
  const poured = takeSupplies(state, kind.sterile ? "sterileFood" : "catFood", kind.quality, upTo - bowl.food);
  if (poured === 0) return 0;
  bowl.food += poured;
  bowl.foodQuality = kind.quality;
  bowl.sterile = kind.sterile;
  return poured;
}

/**
 * Старе збереження (до правки автора 2026-10-23): одна автогодівниця на дім, у `appliances.feeder`.
 * Вона стає порожньою годівницею тієї ж якості над першою миской.
 */
export function upgradeFeeder(state: GameState): void {
  const appliances = state.home.appliances as Partial<Record<string, Quality | null>>;
  const quality = appliances["feeder"];
  delete appliances["feeder"];
  const feeders = (state.home.feeders ??= []);
  const bowl = state.home.items.find((i) => i.kind === "bowl");
  if (quality && bowl && "slot" in bowl && feeders.length === 0) feeders.push({ slot: bowl.slot, quality, food: 0, foodQuality: null, sterile: false });
}

/** Ранок (§8.7): мінус день чистого одягу; дешева техніка може зламатися. */
export function nightlyHousehold(state: GameState, rng: Rng): void {
  const home = state.home;
  home.clothes = Math.max(0, home.clothes - 1);
  // Скинуті дрібнички вранці знову на столах, а розбитий кухоль — уже новий (§9.12, «Скидання речей»).
  delete home.trinkets;
  // Розмотаний рулон туалетного паперу вранці замінено новим (§9.12, «Мисливський інстинкт»).
  delete home.rollDown;
  const factor = HOUSEHOLD.difficulty[state.difficulty];
  for (const appliance of ["fountain", "robot"] as const) {
    if (home.appliances[appliance] === "cheap" && rng.chance(HOUSEHOLD.applianceBreakPerDay * factor)) {
      home.appliances[appliance] = null;
      emit(state, { type: "broke", what: appliance });
    }
  }
  // Дешева автогодівниця ламається разом із кормом у бункері й лишає уламки над миской (§9.12).
  for (const feeder of [...(home.feeders ?? [])]) {
    if (feeder.quality !== "cheap" || !rng.chance(HOUSEHOLD.applianceBreakPerDay * factor)) continue;
    home.feeders = (home.feeders ?? []).filter((f) => f !== feeder);
    addMess(state, "broken", slotCenter(feeder.slot), null);
    emit(state, { type: "broke", what: "feeder" });
  }
}

/** Кіт скористався дешевою річчю: вона може зламатися (§6.4). */
export function wearOut(state: GameState, item: HomeItem, rng: Rng): void {
  if (item.quality !== "cheap" || item.kind === "toy") return;
  if (!rng.chance(HOUSEHOLD.breakPerUse * HOUSEHOLD.difficulty[state.difficulty])) return;
  state.home.items = state.home.items.filter((i) => i !== item);
  // Зламана річ лишає уламки на своєму місці: видно, куди вона поділася (§11.3а). Тріск — гучний звук (§9.12).
  addMess(state, "broken", itemPoint(item), null);
  emit(state, { type: "broke", what: item.kind });
  loudNoise(state, "broken", itemPoint(item));
}
