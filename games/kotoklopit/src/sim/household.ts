// Побут (§8.7): шерсть і пилосос, прання, техніка (автогодівниця, фонтанчик, робот-пилосос), поломки.

import { traitLevel } from "./cat";
import { unpleasantTask } from "./character";
import { BOWL_CAPACITY, HOUSEHOLD, WATER_CAPACITY } from "./config";
import { takeSupply, useSupply } from "./economy";
import { emit } from "./events";
import { cycleHygiene } from "./grooming";
import { hygieneFactorMod } from "./modifiers";
import { addMess } from "./catai";
import { itemPoint, objectById } from "./home";
import type { Rng } from "./rng";
import type { BowlItem, Cat, GameState, HomeItem, Quality } from "./types";

/** Множник падіння гігієни (§8.7): без чистого одягу й у шерсті вона падає швидше. */
export function hygieneFactor(state: GameState): number {
  const home = state.home;
  return (home.clothes <= 0 ? HOUSEHOLD.noClothesHygiene : 1) * (home.fur >= HOUSEHOLD.dirtyFur ? HOUSEHOLD.furHygiene : 1) * cycleHygiene(state) * hygieneFactorMod(state);
}

/** Скільки шерсті кіт лишає за годину (§8.7). */
export function furPerHour(cat: Cat): number {
  if (cat.shape.coat === "hairless") return 0;
  const long = cat.shape.coat === null && !cat.genes.short[0] && !cat.genes.short[1];
  return HOUSEHOLD.furPerCatHour * (long ? HOUSEHOLD.longFur : 1) * Math.max(0, 1 + HOUSEHOLD.sheddingStep * traitLevel(cat, "shedding"));
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

/** Пилососити завершено (§8.7): шерсті немає, коти, що не сплять і не сміливі, ховаються. */
export function vacuumed(state: GameState): void {
  state.home.fur = 0;
  unpleasantTask(state, HOUSEHOLD.vacuumSanity);
  scareCats(state);
  emit(state, { type: "vacuumed" });
}

/** Коти бояться пилососа (§8.7): несміливі ховаються. */
function scareCats(state: GameState): void {
  for (const cat of state.cats) {
    if (cat.away !== null || (cat.act.kind === "sleep" && cat.act.goal === null) || traitLevel(cat, "bravery") > 0) continue;
    const bed = objectById("bed");
    cat.act = { kind: "hide", target: null, goal: { x: bed.x, y: bed.y }, minutes: 20, elapsed: 0 };
  }
}

/** Хвилини побуту вдень і вночі: шерсть, прання, техніка за розкладом. */
export function tickHousehold(state: GameState, from: number, minutes: number): void {
  const home = state.home;
  const hours = minutes / 60;
  for (const cat of state.cats) if (cat.away === null) home.fur = Math.min(100, home.fur + furPerHour(cat) * hours);
  if (home.washer.state === "washing") {
    home.washer.minutes -= minutes;
    if (home.washer.minutes <= 0) {
      home.washer.state = "done";
      emit(state, { type: "laundry", stage: "done" });
    }
  }
  const crossed = (minute: number): boolean => from % 1440 < minute && (from + minutes) % 1440 >= minute && minutes < 1440;
  if (home.appliances.feeder && HOUSEHOLD.feederMinutes.some(crossed)) {
    const bowls = feed(state);
    if (bowls.length > 0) emit(state, { type: "feeder", bowls });
  }
  if (home.appliances.fountain) for (const item of home.items) if (item.kind === "water") item.water = WATER_CAPACITY;
  if (home.appliances.robot && minutes < 1440) robotClean(state, from, minutes, crossed);
}

/**
 * Робот-пилосос (§8.7): о 12:00 вирушає з бази (несміливі коти ховаються) й годину їздить усією
 * квартирою; шерсть зникає поступово й до кінця прибирання — повністю.
 */
function robotClean(state: GameState, from: number, minutes: number, crossed: (minute: number) => boolean): void {
  const start = HOUSEHOLD.robotMinute;
  const end = start + HOUSEHOLD.robotMinutes;
  if (crossed(start)) scareCats(state);
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

/** Миски, які наповнює автогодівниця (§8.7): дешева — першу, дорога — кожну. */
export function feederBowls(state: GameState): BowlItem[] {
  const feeder = state.home.appliances.feeder;
  if (!feeder) return [];
  const bowls = state.home.items.filter((i): i is BowlItem => i.kind === "bowl");
  return feeder === "premium" ? bowls : bowls.slice(0, 1);
}

/**
 * Автогодівниця (§8.7): порція в порожні миски під нею (дешева — лише в першу). Коли вдома є
 * стерилізований кіт, сипле корм для стерилізованих, поки він є: звичайний йому шкодить (§9.8).
 */
function feed(state: GameState): number[] {
  const filled: number[] = [];
  for (const bowl of feederBowls(state)) {
    if (bowl.food > 0) continue;
    const food = takeBowlFood(state);
    if (food === null) break;
    bowl.food = Math.min(BOWL_CAPACITY, 1);
    bowl.foodQuality = food.quality;
    bowl.sterile = food.sterile;
    filled.push(bowl.id);
  }
  return filled;
}

/**
 * Порція в миску, яку насипає не персонаж (автогодівниця, друг, §4.1, §8.7): коли вдома є
 * стерилізований кіт — корм для стерилізованих, поки він є, бо звичайний йому шкодить (§9.8).
 */
export function takeBowlFood(state: GameState): { quality: Quality; sterile: boolean } | null {
  const sterile = state.cats.some((c) => c.sterilized && c.away === null);
  const special = sterile ? takeSupply(state, "sterileFood") : null;
  if (special !== null) return { quality: special, sterile: true };
  const quality = takeSupply(state, "catFood");
  return quality === null ? null : { quality, sterile: false };
}

/** Ранок (§8.7): мінус день чистого одягу; дешева техніка може зламатися. */
export function nightlyHousehold(state: GameState, rng: Rng): void {
  const home = state.home;
  home.clothes = Math.max(0, home.clothes - 1);
  const factor = HOUSEHOLD.difficulty[state.difficulty];
  for (const appliance of ["feeder", "fountain", "robot"] as const) {
    if (home.appliances[appliance] === "cheap" && rng.chance(HOUSEHOLD.applianceBreakPerDay * factor)) {
      home.appliances[appliance] = null;
      emit(state, { type: "broke", what: appliance });
    }
  }
}

/** Кіт скористався дешевою річчю: вона може зламатися (§6.4). */
export function wearOut(state: GameState, item: HomeItem, rng: Rng): void {
  if (item.quality !== "cheap" || item.kind === "toy") return;
  if (!rng.chance(HOUSEHOLD.breakPerUse * HOUSEHOLD.difficulty[state.difficulty])) return;
  state.home.items = state.home.items.filter((i) => i !== item);
  // Зламана річ лишає уламки на своєму місці: видно, куди вона поділася (§11.3а).
  addMess(state, "broken", itemPoint(item), null);
  emit(state, { type: "broke", what: item.kind });
}
