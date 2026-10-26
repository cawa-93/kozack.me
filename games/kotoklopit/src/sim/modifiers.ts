// Модифікатори дня й тижня (§4.1, `DAY_MODIFIERS.md`): вибір, ранкові ефекти й події за часом.
// Числові ефекти інші модулі беруть через функції-множники звідси.

import { knownBreedHalves } from "./breeds";
import { changeMood, createCat, isAdapting, traitLevel } from "./cat";
import { openDoor, ringBell } from "./door";
import { addCat, applyMorningSanity } from "./night";
import { hideSpot, isDirty, startAct } from "./catai";
import { vetManner } from "./destinations";
import { observe } from "./knowledge";
import { changeStat, earn, spend } from "./character";
import { DIFFICULTY, GUESTS, MODIFIERS, POSITIONS, VET, WATER_CAPACITY } from "./config";
import { takeSupply } from "./economy";
import { emit } from "./events";
import { fallIllPerson } from "./illness";
import { createRng, deriveSeed, stateRng, type Rng } from "./rng";
import { weekdayOf, weekOf } from "./time";
import type { Cat, GameState } from "./types";
import { stockBowl } from "./household";
import { loudNoise } from "./noise";
import { callImpression, changeReputation, isWorkday, noticeCallLook } from "./work";

type When = "any" | "weekday" | "saturday" | "cat" | "work" | "workday" | "weekend-cat";

interface Pair {
  hard: string;
  easy: string;
  whenHard: When;
  whenEasy: When;
  group: "work" | "cats" | "home" | "personal" | "city";
}

const pair = (hard: string, easy: string, group: Pair["group"], whenHard: When, whenEasy: When = whenHard): Pair => ({ hard, easy, group, whenHard, whenEasy });

/** Пари модифікаторів дня (`DAY_MODIFIERS.md`). */
export const DAY_PAIRS: readonly Pair[] = [
  pair("deadline", "lull", "work", "workday"),
  pair("meeting", "lunch", "work", "workday"),
  pair("pay-delay", "bonus", "work", "workday"),
  pair("reprimand", "praise", "work", "workday"),
  pair("work-saturday", "midweek-off", "work", "saturday", "workday"),
  pair("full-moon", "rain", "cats", "cat"),
  pair("festival", "quiet-evening", "cats", "cat"),
  pair("vaccination", "home-vet", "cats", "cat"),
  pair("heat", "cold", "cats", "cat"),
  pair("renovation", "neighbors-away", "home", "any"),
  pair("outage", "fast-internet", "home", "workday"),
  pair("inspection", "recalculation", "home", "any"),
  pair("guests", "friend-help", "home", "any"),
  pair("noisy-neighbors", "quiet-night", "personal", "any"),
  pair("sick", "vigor", "personal", "any"),
  pair("mom-call", "mom-food", "personal", "any"),
  pair("traffic", "empty-roads", "city", "any"),
  pair("food-price-up", "pet-sale", "city", "cat"),
];

/** Особливі модифікатори дня, без пари (`DAY_MODIFIERS.md`). */
const SPECIAL: readonly { id: string; when: When }[] = [
  { id: "show", when: "weekend-cat" },
  { id: "office", when: "workday" },
];

export const WEEK_PAIRS: readonly [string, string][] = [
  ["deadline-week", "quiet-week"],
  ["crunch", "vacation"],
  ["cat-march", "calm-season"],
  ["heat-wave", "cold-snap"],
  ["cat-flu", "cat-prevention"],
  ["human-flu", "human-prevention"],
];

/** Чи діє модифікатор: дня чи тижня (тижневі «Спека» й «Холод» — цілий тиждень). */
export function active(state: GameState, id: string): boolean {
  const { day, week } = state.modifiers;
  if (day === id || week === id) return true;
  return (id === "heat" && week === "heat-wave") || (id === "cold" && week === "cold-snap");
}

/** Модифікатор дня, що суперечить модифікатору тижня, не випадає (§4.1). */
function contradicts(week: string | null, id: string, group: Pair["group"]): boolean {
  if (week === "vacation" && group === "work") return true;
  if (week === "human-prevention" && id === "sick") return true;
  if ((week === "heat-wave" || week === "cold-snap") && (id === "heat" || id === "cold")) return true;
  return false;
}

/** Чи підходить модифікатор цьому дню (наступному після ночі). */
function fits(state: GameState, day: number, when: When): boolean {
  const weekday = weekdayOf(day);
  const weekend = weekday >= 5;
  const cats = state.cats.length > 0;
  const working = !state.job.unemployed;
  switch (when) {
    case "any":
      return true;
    case "weekday":
      return !weekend;
    case "saturday":
      return weekday === 5 && working;
    case "cat":
      return cats;
    case "work":
      return working;
    case "workday":
      return !weekend && working;
    case "weekend-cat":
      return weekend && cats;
  }
}

/** Модифікатор тижня (§4.1): у половині тижнів; важкий бік — із часткою за складністю. */
export function chooseWeekModifier(state: GameState, week: number): string | null {
  const rng = createRng(deriveSeed(state.seed, 4, week));
  if (!rng.chance(MODIFIERS.weekShare)) return null;
  const chosen = WEEK_PAIRS[rng.int(0, WEEK_PAIRS.length - 1)];
  if (!chosen) return null;
  const [hard, easy] = chosen;
  if (state.job.unemployed && (hard === "crunch" || hard === "deadline-week")) return null;
  return rng.chance(MODIFIERS.hardShare[state.difficulty]) ? hard : easy;
}

/**
 * Модифікатор дня (§4.1): третина днів без нього; інакше випадкова пара, що підходить дню, і її бік.
 * Той самий модифікатор не повторюється два дні поспіль.
 */
export function chooseDayModifier(state: GameState, day: number, rng: Rng): string | null {
  const previous = state.modifiers.day;
  const week = state.modifiers.week;
  const options: { hard: string | null; easy: string | null }[] = [];
  for (const p of DAY_PAIRS) {
    const hard = fits(state, day, p.whenHard) && !contradicts(week, p.hard, p.group) && p.hard !== previous ? p.hard : null;
    const easy = fits(state, day, p.whenEasy) && !contradicts(week, p.easy, p.group) && p.easy !== previous ? p.easy : null;
    if (hard || easy) options.push({ hard, easy });
  }
  for (const s of SPECIAL) if (fits(state, day, s.when) && s.id !== previous) options.push({ hard: s.id, easy: s.id });
  if (options.length === 0 || rng.chance(MODIFIERS.noneShare)) return null;
  const chosen = options[rng.int(0, options.length - 1)];
  if (!chosen) return null;
  const wantHard = rng.chance(MODIFIERS.hardShare[state.difficulty]);
  return (wantHard ? (chosen.hard ?? chosen.easy) : (chosen.easy ?? chosen.hard)) ?? null;
}

/** Ранок нового дня (§4.1): вибір модифікаторів і їхні ранкові ефекти. */
export function startModifiers(state: GameState, rng: Rng): void {
  if (weekdayOf(state.day) === 0) state.modifiers.week = chooseWeekModifier(state, weekOf(state.day));
  const today = state.today;
  // Пропущене вчора щеплення: тиждень коти хворіють частіше.
  if (state.modifiers.day === "vaccination" && !today.vaccinated) today.vaccineMissedUntil = state.day + MODIFIERS.vaccineDays;
  state.modifiers.day = chooseDayModifier(state, state.day, rng);
  today.callAt = null;
  today.meetingMinutes = 0;
  today.vaccinated = false;
  today.officeDone = false;
  today.earlyWake = 0;
  delete today.mom;
  const perHour = POSITIONS[state.job.position]?.reputation ?? 1;
  switch (state.modifiers.day) {
    case "reprimand":
    case "praise":
    {
      const delta = (state.modifiers.day === "praise" ? MODIFIERS.praise : MODIFIERS.reprimand) * perHour;
      changeReputation(state, delta);
      emit(state, { type: "modifier", kind: "reputation", value: delta });
    }
      break;
    case "sick":
      fallIllPerson(state, "cold");
      break;
    case "mom-call":
      today.callAt = MODIFIERS.call.from + Math.floor(rng.next() * (MODIFIERS.call.to - MODIFIERS.call.from));
      break;
    case "mom-food":
      // Мама заходить з гостинцями вдень, а не зранку (§4.1, рішення автора 2026-10-26) — `tickMom`.
      today.mom = { at: MODIFIERS.mom.from + Math.floor(rng.next() * (MODIFIERS.mom.to - MODIFIERS.mom.from)) };
      break;
    case "recalculation":
      today.utilitiesDiscount = MODIFIERS.recalculation;
      break;
    case "noisy-neighbors":
      today.earlyWake = MODIFIERS.noisyWake.min + Math.floor(rng.next() * (MODIFIERS.noisyWake.max - MODIFIERS.noisyWake.min));
      break;
  }
  if (state.modifiers.week === "human-flu" && rng.chance(MODIFIERS.week.humanFlu)) fallIllPerson(state, "cold");
  // Знайда — рідко, у будь-який день (§8.5).
  if (state.day - today.lastFoundling >= MODIFIERS.foundlingGapDays && state.day > 0 && rng.chance(MODIFIERS.foundling)) {
    today.foundling = true;
    today.lastFoundling = state.day;
  }
}

/** Знайда (§8.5): взяти кошеня (бонус за нового кота) чи віднести в притулок. */
export function decideFoundling(state: GameState, take: boolean, rng: Rng): Cat | null {
  if (!state.today.foundling) return null;
  state.today.foundling = false;
  // Персонаж відчиняє двері знайді (§9.12 «Двері й гості»): і коли бере її, і коли відносить у притулок.
  openDoor(state);
  if (!take) return null;
  const cat = createCat(state, rng, { source: "foundling", ageWeeks: 1, at: { x: 10.5, y: 10.2 } });
  // Що видно про породу — як у притулку (§9.11).
  cat.breedKnown = knownBreedHalves(state, cat.breed, rng);
  addCat(state, cat);
  applyMorningSanity(state, 0, 1);
  return cat;
}

/** Не відповісти мамі (§4.1): здоровий глузд падає. */
export function ignoreCall(state: GameState): void {
  changeStat(state, "sanity", MODIFIERS.call.ignored);
}

// --- Множники для інших модулів ---------------------------------------------------------------

/** Спад терпіння (§8.6): дедлайн, затишшя, тижневі. */
export function patienceDecayFactor(state: GameState): number {
  let factor = 1;
  if (active(state, "deadline")) factor *= MODIFIERS.deadline.decay;
  if (active(state, "lull")) factor *= MODIFIERS.lull.decay;
  factor *= MODIFIERS.week.decay[state.modifiers.week ?? ""] ?? 1;
  const minute = state.minute % 1440;
  if (active(state, "lunch") && minute >= MODIFIERS.lunch.from && minute < MODIFIERS.lunch.to) return 0;
  if (powerOut(state)) return 0;
  return factor;
}

export function reputationFactor(state: GameState): number {
  if (active(state, "deadline")) return MODIFIERS.deadline.reputation;
  if (active(state, "lull")) return MODIFIERS.lull.reputation;
  return 1;
}

export function payFactor(state: GameState): number {
  return MODIFIERS.pay[state.modifiers.day ?? ""] ?? 1;
}

/** Робочий день із модифікаторами: робоча субота й аврал додають, вихідний і відпустка — забирають. */
export function workdayOverride(state: GameState): boolean | null {
  const weekend = weekdayOf(state.day) >= 5;
  if (state.modifiers.week === "vacation" || active(state, "midweek-off")) return false;
  if (weekend && (active(state, "work-saturday") || state.modifiers.week === "crunch")) return true;
  return null;
}

/** Вимкнули світло (§4.1): комп'ютер не працює. */
export function powerOut(state: GameState): boolean {
  const minute = state.minute % 1440;
  return active(state, "outage") && minute >= MODIFIERS.outage.from && minute < MODIFIERS.outage.to;
}

/** Неприємні справи (§8.1): ремонт у сусідів — дорожче, сусіди у відпустці — дешевше. */
export function unpleasantFactor(state: GameState): number {
  if (active(state, "renovation")) return MODIFIERS.renovation.unpleasant;
  if (active(state, "neighbors-away")) return MODIFIERS.neighborsAway;
  return 1;
}

export const moveFactor = (state: GameState): number => (active(state, "vigor") ? MODIFIERS.vigor : 1);
export const hygieneFactorMod = (state: GameState): number => (active(state, "heat") ? MODIFIERS.heat.hygiene : 1);
export const playFactor = (state: GameState): number => (active(state, "full-moon") ? MODIFIERS.fullMoonPlay : 1);
export function catFatigueFactor(state: GameState): number {
  return (active(state, "rain") ? MODIFIERS.rainFatigue : 1) * (active(state, "heat") ? MODIFIERS.heat.fatigue : 1);
}
export const thirstFactor = (state: GameState): number => (active(state, "heat") ? MODIFIERS.heat.thirst : 1);
export const warmthBonus = (state: GameState): number => (active(state, "cold") ? MODIFIERS.coldWarmth : 0);
/** «Холод» і «Спека» (§4.1) — дня чи тижня: від них залежить «Теплолюбність» (§9.12). */
export const isCold = (state: GameState): boolean => active(state, "cold");
export const isHot = (state: GameState): boolean => active(state, "heat");
export const trafficFactor = (state: GameState): number => MODIFIERS.traffic[state.modifiers.day ?? ""] ?? 1;
export function priceFactor(state: GameState, product: string): number {
  return product === "catFood" || product === "sterileFood" ? (MODIFIERS.catFoodPrice[state.modifiers.day ?? ""] ?? 1) : 1;
}

/** Шанс хвороб котів (§9.5): пропущене щеплення, котячий грип чи профілактика. */
export function catIllnessFactor(state: GameState): number {
  const vaccine = state.day <= state.today.vaccineMissedUntil ? MODIFIERS.vaccineIllness : 1;
  return vaccine * (MODIFIERS.week.catIllness[state.modifiers.week ?? ""] ?? 1);
}

// --- Події за часом -------------------------------------------------------------------------

const crossed = (from: number, minutes: number, at: number): boolean => from % 1440 < at && (from % 1440) + minutes >= at;

/**
 * Мама з гостинцями (§4.1, рішення автора 2026-10-26): удень дзвонить у двері (коти реагують за «Гостями», §9.12), за
 * `GUESTS.ringLead` хвилин заходить — двері відчинено, страви на кухні. Персонажа немає вдома — приходить, щойно він
 * повернувся, якщо до `MODIFIERS.mom.until`; інакше (чи він пішов між дзвінком і візитом) лишає гостинці під дверима, без
 * дзвінка: на кухні вони з'являються, коли персонаж повернувся.
 */
function tickMom(state: GameState, from: number, minutes: number): void {
  const mom = state.today.mom;
  if (!mom) return;
  const end = from + minutes;
  const home = state.trip === null;
  if (mom.porch) {
    if (!home) return;
    delete state.today.mom;
    return momGifts(state, false);
  }
  if (end < mom.at) return;
  if (!home) {
    if (mom.rang || end >= MODIFIERS.mom.until) state.today.mom = { at: mom.at, porch: true };
    return;
  }
  if (!mom.rang) {
    if (from >= MODIFIERS.mom.until) {
      state.today.mom = { at: mom.at, porch: true };
      return;
    }
    // Персонаж удома (чи щойно повернувся) — мама дзвонить.
    mom.at = Math.max(mom.at, from);
    mom.rang = true;
    ringBell(state);
    return;
  }
  if (end < mom.at + GUESTS.ringLead) return;
  delete state.today.mom;
  openDoor(state);
  momGifts(state, true);
}

/** Гостинці мами — дві готові страви на вільних кухонних поверхнях (§4.1). */
function momGifts(state: GameState, visited: boolean): void {
  placeMomFood(state);
  emit(state, { type: "modifier", kind: "mom-food", value: visited ? 1 : 0 });
}

function placeMomFood(state: GameState): void {
  for (const id of ["counter-left", "counter-right"]) if (!state.home.surfaces[id]) state.home.surfaces[id] = { kind: "meal", quality: "cheap" };
}

/**
 * Ніч, а мама вже подзвонила чи лишила гостинці під дверима (§4.1, рішення автора 2026-10-26): персонаж ліг, не дочекавшись, поки
 * вона зайде, чи ніч застала його в поїздці — судочки однаково на кухні, зранку, без повідомлення (перевірка 2026-10-26: раніше
 * вони пропадали).
 */
export function momAtNight(state: GameState): void {
  const mom = state.today.mom;
  if (mom?.rang !== true && mom?.porch !== true) return;
  delete state.today.mom;
  placeMomFood(state);
}

/** Хвилини дня: нарада, ветеринар удома, феєрверки, тихий вечір, перевірка, гості, друг, відпускні. */
export function tickModifiers(state: GameState, from: number, minutes: number, working: boolean): void {
  const today = state.today;
  const m = MODIFIERS;
  const day = state.modifiers.day;
  // Нарада й збори в офісі — лише в робочий день: на лікарняному й у відпустці їх немає (§6.5, §4.1).
  if (day === "meeting" && isWorkday(state)) {
    const start = m.meeting.from;
    const end = start + m.meeting.minutes;
    const minute = from % 1440;
    if (crossed(from, minutes, start)) emit(state, { type: "modifier", kind: "meeting-start", value: 0 });
    if (working && minute >= start && minute < end) today.meetingMinutes += minutes;
    noticeCallLook(state, minute, minute + minutes, start);
    if (crossed(from, minutes, end)) {
      const perHour = POSITIONS[state.job.position]?.reputation ?? 1;
      const attended = today.meetingMinutes >= m.meeting.minutes * m.meeting.attended;
      // Присутність — бонус і враження відеодзвінка (§8.6), відсутність — великий штраф.
      const delta = attended ? (m.meeting.present + callImpression(state)) * perHour : m.meeting.absent * perHour;
      changeReputation(state, delta);
      emit(state, { type: "modifier", kind: attended ? "meeting-attended" : "meeting-missed", value: delta });
    }
  }
  if (day === "home-vet" && crossed(from, minutes, m.homeVetMinute)) {
    const cat = state.cats.find((c) => c.away === null);
    if (cat) {
      for (const d of cat.diseases) d.known = true;
      if (cat.pregnancy) cat.pregnancy.known = true;
      cat.breedKnown = [true, true];
      // Як кіт поводився на огляді (§9.12 «Переноска й ветеринар»): ветеринарка оглядає його при персонажі, тож це видно, де
      // б кіт не був, — якщо персонаж удома. «Жах клініки» вирвався й потім ховається.
      const manner = vetManner(cat);
      if (manner !== null && state.trip === null) observe(state, cat, "vet", manner === "calm" ? 1 : -1, true);
      if (manner === "hid") {
        const spot = hideSpot(state, stateRng(state, "behavior"), cat);
        startAct(cat, "hide", spot.at, VET.homeHideMinutes, spot.target);
      }
      emit(state, { type: "modifier", kind: "home-vet", value: cat.id });
    }
  }
  // Феєрверки — гучний звук на всю квартиру (§9.12): несміливі ховаються й засмучуються.
  if (day === "festival" && crossed(from, minutes, m.festival.minute)) {
    loudNoise(state, "fireworks", null);
    emit(state, { type: "modifier", kind: "fireworks", value: 0 });
  }
  if (day === "quiet-evening" && crossed(from, minutes, m.quietEvening.minute)) for (const cat of state.cats) changeMood(state, cat, m.quietEvening.mood);
  if (day === "renovation") {
    for (const cat of state.cats) if (cat.away === null && cat.act.kind !== "sleep") changeMood(state, cat, (m.renovation.catMoodPerHour * minutes) / 60);
  }
  if (day === "mom-food") tickMom(state, from, minutes);
  // Дзвонять за 2 хвилини до того, як зайти; заходять — двері відчинено (§9.12 «Двері й гості»).
  if ((day === "inspection" && crossed(from, minutes, m.inspection.minute - GUESTS.ringLead)) || (day === "guests" && crossed(from, minutes, m.guests.minute - GUESTS.ringLead))) ringBell(state);
  if (day === "inspection" && crossed(from, minutes, m.inspection.minute)) {
    openDoor(state);
    const dirty = state.home.items.filter((i) => i.kind === "litter" && isDirty(i)).length;
    const fine = state.home.messes.length * m.inspection.mess + dirty * m.inspection.litter + (state.home.fur >= 50 ? m.inspection.fur : 0);
    spend(state, Math.min(fine, state.character.money));
    emit(state, { type: "modifier", kind: "inspection", value: fine });
  }
  if (day === "guests" && crossed(from, minutes, m.guests.minute)) {
    openDoor(state);
    const shame = Math.max(m.guests.max, state.home.messes.length * m.guests.mess);
    // «Душа компанії» тішить гостей, «Шипить на гостей» шипить на них з-під дивана (§9.12, «Гості»).
    let delight = 0;
    let hissing = 0;
    for (const cat of state.cats) {
      if (cat.away !== null) continue;
      const level = traitLevel(cat, "guests");
      if (level > 0 && !isAdapting(state, cat)) delight += GUESTS.delight;
      if (level >= 0) continue;
      cat.act = { kind: "hide", target: null, goal: { x: 1, y: 2 }, minutes: m.guests.hideMinutes, elapsed: 0 };
      if (level <= -2) {
        hissing += GUESTS.hissSanity;
        emit(state, { type: "hissed-guests", cat: cat.id });
      }
    }
    const total = shame + Math.min(GUESTS.delightMax, delight) + hissing;
    changeStat(state, "sanity", total);
    emit(state, { type: "modifier", kind: "guests", value: total, guests: { mess: shame < 0, hissed: hissing < 0, delighted: delight > 0 } });
  }
  if (day === "office" && crossed(from, minutes, 18 * 60) && !today.officeDone && isWorkday(state)) {
    const delta = m.officeAbsent * (POSITIONS[state.job.position]?.reputation ?? 1);
    changeReputation(state, delta);
    emit(state, { type: "modifier", kind: "office-missed", value: delta });
  }
  if (state.modifiers.week === "vacation" && crossed(from, minutes, m.week.vacationMinute) && !state.job.unemployed) {
    const pay = m.week.vacationPayHours * (POSITIONS[state.job.position]?.pay ?? 0) * DIFFICULTY[state.difficulty].earnings;
    earn(state, pay);
    emit(state, { type: "modifier", kind: "vacation-pay", value: pay });
  }
  if (day === "friend-help") friendHelps(state, from, minutes);
  if (today.callAt !== null && crossed(from, minutes, today.callAt)) {
    today.callAt = null;
    emit(state, { type: "modifier", kind: "mom-call", value: 0 });
  }
}

/** Друг доглядає котів (§4.1): щогодини миски, вода й лотки — з наших запасів. */
function friendHelps(state: GameState, from: number, minutes: number): void {
  const m = MODIFIERS.friend;
  const minute = from % 1440;
  if (minute < m.from || minute >= m.to || Math.floor(minute / 60) === Math.floor((minute + minutes) / 60)) return;
  for (const item of state.home.items) {
    if (item.kind === "bowl") stockBowl(state, item);
    if (item.kind === "water") item.water = WATER_CAPACITY;
    if (item.kind === "litter" && item.uses > 0) {
      const litter = takeSupply(state, "litter");
      if (litter !== null) {
        item.uses = 0;
        item.litter = litter;
      }
    }
  }
}
