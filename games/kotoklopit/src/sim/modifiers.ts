// Модифікатори дня й тижня (§4.1, `DAY_MODIFIERS.md`): вибір, ранкові ефекти й події за часом.
// Числові ефекти інші модулі беруть через функції-множники звідси.

import { knownBreedHalves } from "./breeds";
import { asleep, changeMood, createCat, isAdapting, traitLevel } from "./cat";
import { openDoor, ringBell } from "./door";
import { addCat, applyMorningSanity } from "./night";
import { putDownCat, stopBath } from "./actions";
import { hideSpot, isCarried, isDirty, startAct } from "./catai";
import { visibleFloorNear } from "./catmove";
import { isNewborn } from "./reproduction";
import { vetManner } from "./destinations";
import { observe } from "./knowledge";
import { changeStat, earn, spend } from "./character";
import { DIFFICULTY, GUESTS, ILLNESS_EFFECTS, MODIFIERS, POSITIONS, PRODUCTS, VET, WATER_CAPACITY } from "./config";
import { addSupply, stash, takeSupply } from "./economy";
import { emit } from "./events";
import { fallIllPerson } from "./illness";
import { createRng, deriveSeed, stateRng, streamSeed, type Rng } from "./rng";
import { weekdayOf } from "./time";
import type { Cat, GameState } from "./types";
import { stockBowl } from "./household";
import { loudNoise } from "./noise";
import { callImpression, changeReputation, isWorkday, noticeCallLook, onSickLeave, stopWork } from "./work";

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
  // «Планове відключення» лишається й безробітному: зупиняє й пошук роботи (§8.6; перевірка модифікаторів 2026-10-28).
  pair("outage", "fast-internet", "home", "weekday", "workday"),
  pair("inspection", "recalculation", "home", "any"),
  // Друг приходить допомогти з котами — лише коли вони є (перевірка модифікаторів 2026-10-28).
  pair("guests", "friend-help", "home", "any", "cat"),
  // «Тиха ніч» — коти не будять: лише коли вони є, інакше день без модифікатора (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А14).
  pair("noisy-neighbors", "quiet-night", "personal", "any", "cat"),
  pair("sick", "vigor", "personal", "any"),
  pair("mom-call", "mom-food", "personal", "any"),
  pair("traffic", "empty-roads", "city", "any"),
  pair("food-price-up", "pet-sale", "city", "cat"),
];

/** Особливі модифікатори дня, без пари (`DAY_MODIFIERS.md`). */
const SPECIAL: readonly { id: string; when: When; group: Pair["group"] }[] = [
  { id: "show", when: "weekend-cat", group: "cats" },
  { id: "office", when: "workday", group: "work" },
];

/**
 * Пари модифікаторів тижня (`DAY_MODIFIERS.md`) і коли вони можливі: робочі — з роботою; котячі — коли є кіт (рішення автора
 * 2026-10-29, `GENERAL_REVIEW.md`, А14: без котів тиждень із ними був порожнім). «Хвиля спеки ↔ Похолодання» — тижневі «Спека» й
 * «Холод», а ті бувають лише з котом.
 */
export const WEEK_PAIRS: readonly { hard: string; easy: string; when: "any" | "work" | "cat" }[] = [
  { hard: "deadline-week", easy: "quiet-week", when: "work" },
  { hard: "crunch", easy: "vacation", when: "work" },
  { hard: "cat-march", easy: "calm-season", when: "cat" },
  { hard: "heat-wave", easy: "cold-snap", when: "cat" },
  { hard: "cat-flu", easy: "cat-prevention", when: "cat" },
  { hard: "human-flu", easy: "human-prevention", when: "any" },
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
  // Аврал: вихідних не буде — ні робочої суботи (вона й так робоча), ні вихідного посеред тижня; тиждень дедлайнів — не
  // «Затишшя», тихий тиждень — не «Дедлайн» (DAY_MODIFIERS.md; перевірка модифікаторів 2026-10-28).
  if (week === "crunch" && (id === "work-saturday" || id === "midweek-off")) return true;
  if (week === "deadline-week" && id === "lull") return true;
  if (week === "quiet-week" && id === "deadline") return true;
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

/** Перестановка Фішера–Єйтса номерів 0…n−1: кількість кидків залежить лише від n (§6.1). */
function shuffled(rng: Rng, n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

/**
 * Модифікатор тижня (§4.1): у половині тижнів; бік — із часткою за складністю; пара — перша в перестановці каталогу, що тижню
 * підходить: безробітному — неробоча (раніше робоча пара давала порожній тиждень; перевірка модифікаторів 2026-10-28), котяча —
 * лише коли є кіт (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А14). Як і в модифікатора дня, кидків завжди однаково, а стан
 * лише вирішує, який запис перестановки взяти (§6.1): котів не стало — не котячий модифікатор той самий.
 *
 * Стан — вечір неділі: ніч обирає модифікатор нового тижня раз, ще до своїх кроків (`runNight`), бо за нього вже рахується
 * тічка (§9.8), а коти за ніч можуть померти, народитися чи прийти з притулку.
 */
export function chooseWeekModifier(state: GameState, week: number): string | null {
  const rng = createRng(deriveSeed(state.seed, 4, week));
  if (!rng.chance(MODIFIERS.weekShare)) return null;
  const hard = rng.chance(MODIFIERS.hardShare[state.difficulty]);
  const order = shuffled(rng, WEEK_PAIRS.length);
  const fits = (when: (typeof WEEK_PAIRS)[number]["when"]): boolean => (when === "work" ? !state.job.unemployed : when === "cat" ? state.cats.length > 0 : true);
  const chosen = order.map((i) => WEEK_PAIRS[i]!).find((p) => fits(p.when));
  if (!chosen) return null;
  return hard ? chosen.hard : chosen.easy;
}

/** Повний каталог модифікаторів дня в сталому порядку: пари, потім особливі (у них обидва боки — той самий модифікатор). */
const DAY_CATALOG: readonly Pair[] = [...DAY_PAIRS, ...SPECIAL.map((s) => pair(s.id, s.id, s.group, s.when))];

/**
 * Модифікатор дня (§4.1): третина днів без нього; інакше випадкова пара, що підходить дню, і її бік.
 * Той самий модифікатор не повторюється два дні поспіль.
 *
 * Кидків завжди однаково — «без модифікатора», бік і перестановка всього каталогу, — а від стану залежить лише, який запис
 * перестановки взяти: перший, у якого бажаний бік сьогодні можливий (немає такого — перший із будь-яким можливим боком). Тож на
 * переграванні модифікатор дня той самий, якщо стан лише відсіяв інші варіанти: лікарняний, звільнення, котів стало менше (§6.1,
 * загальна ревізія 2026-10-29: раніше це зсувало вибір, і з вівторка модифікатори були інші). Коли можливих стало більше (з'явився
 * кіт, роботу зберегли, учора випав інший), раніший запис перестановки може витіснити попередній вибір, хоч той і досі можливий:
 * повної сталості вибір лише за сьогоднішнім станом не дає (§6.1, [Наслідок]). Перший придатний у випадковій перестановці
 * рівноймовірний серед придатних, тож частки й частоти ті самі, що й за вибору зі списку можливих.
 */
export function chooseDayModifier(state: GameState, day: number, rng: Rng): string | null {
  const none = rng.chance(MODIFIERS.noneShare);
  // Спершу бік за складністю, потім пара, у якої цей бік сьогодні можливий: інакше пара з одним можливим боком («Робоча субота»
  // лише в суботу) брала його за будь-якої складності, і частка важких була нижчою за 40/50/60% (перевірка модифікаторів 2026-10-28).
  const wantHard = rng.chance(MODIFIERS.hardShare[state.difficulty]);
  const order = shuffled(rng, DAY_CATALOG.length);
  if (none) return null;
  const previous = state.modifiers.day;
  const week = state.modifiers.week;
  // Робочі модифікатори — не на лікарняному: керівництво нічого не чекає (перевірка модифікаторів 2026-10-28: «Догана» знімала
  // репутацію, а нарада й обідня перерва були на титулці, хоч і не діяли). Збори в офісі — теж ні, і не у відпустку (перевірка
  // поїздок 2026-10-28: випадали, і поїздка туди платила зарплату).
  const sick = onSickLeave(state, day);
  const possible = (id: string, when: When, group: Pair["group"]): boolean =>
    !(group === "work" && sick) && fits(state, day, when) && !contradicts(week, id, group) && id !== previous;
  const sides = order.map((i) => {
    const p = DAY_CATALOG[i]!;
    return { hard: possible(p.hard, p.whenHard, p.group) ? p.hard : null, easy: possible(p.easy, p.whenEasy, p.group) ? p.easy : null };
  });
  const wanted = sides.find((s) => (wantHard ? s.hard : s.easy) !== null);
  if (wanted) return wantHard ? wanted.hard : wanted.easy;
  const any = sides.find((s) => s.hard !== null || s.easy !== null);
  return any ? (any.hard ?? any.easy) : null;
}

/** Ранок нового дня (§4.1): вибір модифікаторів і їхні ранкові ефекти. */
export function startModifiers(state: GameState, rng: Rng): void {
  // Модифікатор тижня ніч на понеділок уже обрала — за станом на вечір неділі (`runNight`; рішення автора 2026-10-29, А14).
  const today = state.today;
  // Пропущене вчора щеплення: тиждень коти хворіють частіше.
  // Ночі нового дня й наступних — разом 7 (перевірка модифікаторів 2026-10-28: було 8).
  if (state.modifiers.day === "vaccination" && !today.vaccinated) today.vaccineMissedUntil = state.day - 1 + MODIFIERS.vaccineDays;
  state.modifiers.day = chooseDayModifier(state, state.day, rng);
  today.callAt = null;
  // Дзвінок, на який до ночі так і не відповіли, минає без штрафу, як і картка, що не встигла показатися (§4.1).
  delete today.callPending;
  today.meetingMinutes = 0;
  today.vaccinated = false;
  today.officeDone = false;
  delete today.showDone;
  today.earlyWake = 0;
  delete today.mom;
  const perHour = POSITIONS[state.job.position]?.reputation ?? 1;
  switch (state.modifiers.day) {
    case "reprimand":
    case "praise":
    {
      const full = (state.modifiers.day === "praise" ? MODIFIERS.praise : MODIFIERS.reprimand) * perHour;
      // Посаду ранкова зміна сама не змінює (§4.1, загальна ревізія 2026-10-29): «Догана» не опускає репутацію нижче межі, а
      // «Похвала» не піднімає вище, щоб звільнення, пониження чи підвищення не приходило ще до першої дії гравця.
      const rep = state.job.reputation;
      const keep = MODIFIERS.reputationKeep;
      const delta = full < 0 ? Math.min(0, Math.max(full, keep.min - rep)) : Math.max(0, Math.min(full, keep.max - rep));
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
      // Два перерахунки за тиждень — дві знижки (перевірка модифікаторів 2026-10-28: друга нічого не давала).
      today.utilitiesDiscount += MODIFIERS.recalculation;
      break;
    case "noisy-neighbors":
      today.earlyWake = MODIFIERS.noisyWake.min + Math.floor(rng.next() * (MODIFIERS.noisyWake.max - MODIFIERS.noisyWake.min));
      break;
  }
  // Кидки грипу й знайди — зі свого зерна дня: скільки чисел узяв вибір модифікатора, залежить від стану (коти, робота), і на
  // переграванні тижня вони зсувалися (§6.1). Грип — за складністю, як і інші хвороби персонажа (§6.5; перевірка модифікаторів
  // 2026-10-28).
  const rolls = createRng(deriveSeed(streamSeed(state.seed, "conditions", state.day), ROLLS_SALT));
  if (state.modifiers.week === "human-flu" && rolls.chance(MODIFIERS.week.humanFlu * ILLNESS_EFFECTS.difficulty[state.difficulty])) fallIllPerson(state, "cold");
  // Знайда — рідко, у будь-який день (§8.5).
  if (state.day - today.lastFoundling >= MODIFIERS.foundlingGapDays && state.day > 0 && rolls.chance(MODIFIERS.foundling)) {
    today.foundling = true;
    today.lastFoundling = state.day;
  }
}

/** Кидки знайди — від дня, як і умови дня (§6.1): на переграванні те саме кошеня (перевірка розмноження 2026-10-28). */
export const foundlingRng = (state: GameState): Rng => createRng(deriveSeed(streamSeed(state.seed, "conditions", state.day), FOUNDLING_SALT));
/** Солі зерен: відрізняють кидки знайди й ранкові кидки (грип, поява знайди) від інших кидків умов дня. */
const FOUNDLING_SALT = 13;
const ROLLS_SALT = 17;

/** Знайда (§8.5): взяти кошеня (бонус за нового кота) чи віднести в притулок. */

export function decideFoundling(state: GameState, take: boolean, rng: Rng = foundlingRng(state)): Cat | null {
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

/**
 * Відповісти мамі (§4.1): пів години розмови — не робота: персонаж відходить від комп'ютера (перевірка модифікаторів 2026-10-28:
 * за комп'ютером дзвінок нічого не коштував). Лише на дзвінок, що чекає відповіді; false — його немає (уже вирішено).
 */
export function answerCall(state: GameState): boolean {
  if (state.today.callPending !== true) return false;
  delete state.today.callPending;
  stopWork(state);
  // Пестощі й гра закінчуються; почата тривала дія (прибирання, їжа) лише чекає, як і без кнопки (повторна перевірка модифікаторів 2026-10-28).
  const kind = state.character.activity?.kind;
  if (kind === "pet" || kind === "play") state.character.activity = null;
  // Кота з рук опускають поруч, як і засинаючи (загальна ревізія 2026-10-29: кіт, що пручається, усі 30 хвилин лишався на
  // руках і кусав, а опустити його гравець не міг). Інше з рук не змінюється з часом — лишається. Купання кота, якого опустили,
  // перервано (§8.7, `stopBath` у putDownCat).
  const held = state.character.held;
  if (held?.kind === "cat") putDownCat(state, held.cat);
  return true;
}

/** Не відповісти мамі (§4.1): здоровий глузд падає — раз, лише на дзвінок, що чекає відповіді. */
export function ignoreCall(state: GameState): boolean {
  if (state.today.callPending !== true) return false;
  delete state.today.callPending;
  changeStat(state, "sanity", MODIFIERS.call.ignored);
  return true;
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
  if (internetOut(state)) return 0;
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

/**
 * Планове відключення (§4.1): провайдер відключив інтернет — комп'ютер не працює. Решта техніки працює: світло є (рішення автора
 * 2026-10-29, `GENERAL_REVIEW.md`, А14; раніше титулка обіцяла, що вимкнуть світло).
 */
export function internetOut(state: GameState): boolean {
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
/** Персонаж у поїздці на збори в офіс і не потрапив дорогою в аварію: він уже на роботі (§8.5). */
export const toOffice = (state: GameState): boolean => state.trip?.destination === "office" && state.trip.phase !== "accident";

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
 * `GUESTS.ringLead` хвилин заходить — двері відчинено, судочки в холодильнику. Персонажа немає вдома — приходить, щойно він
 * повернувся, якщо до `MODIFIERS.mom.until`; інакше (чи він пішов між дзвінком і візитом) лишає пакет під дверима, без
 * дзвінка: коли персонаж повернувся, пакет у ящиках біля входу.
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

/**
 * Гостинці мами — пакет маминих судочків (§4.1, §6.4, рішення автора 2026-10-26; раніше — дві страви на кухонних поверхнях, а
 * коли обидві були зайняті, гостинців не було). Мама заходила — сама ставить судочки в холодильник (що не влізло — у ящики біля
 * входу); не застала — пакет у ящиках, як покупка: «Розпакувати» покладе судочки в холодильник.
 */
function momGifts(state: GameState, visited: boolean): void {
  const meals = PRODUCTS.momMeal.units.cheap;
  if (visited) addSupply(state, "momMeal", "cheap", meals);
  else stash(state, "momMeal", "cheap", meals);
  emit(state, { type: "modifier", kind: "mom-food", value: visited ? 1 : 0 });
}

/**
 * Ніч, а мама вже подзвонила чи лишила гостинці під дверима (§4.1, рішення автора 2026-10-26): персонаж ліг, не дочекавшись, поки
 * вона зайде, чи ніч застала його в поїздці — пакет однаково в ящиках біля входу, зранку, без повідомлення (перевірка 2026-10-26:
 * раніше судочки пропадали).
 */
export function momAtNight(state: GameState): void {
  const mom = state.today.mom;
  if (mom?.rang !== true && mom?.porch !== true) return;
  delete state.today.mom;
  stash(state, "momMeal", "cheap", PRODUCTS.momMeal.units.cheap);
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
  // Ветеринарка — візит, як гості й ОСББ: дзвонить за `GUESTS.ringLead` хвилин, заходить у відчинені двері (перевірка модифікаторів 2026-10-28: заходила без дзвінка й дверей; рішення автора 2026-10-29, А5: дзвінок — за 6 хвилин, щоб гравець встиг узяти кота на руки).
  if (day === "home-vet" && crossed(from, minutes, m.homeVetMinute - GUESTS.ringLead)) ringBell(state);
  if (day === "home-vet" && crossed(from, minutes, m.homeVetMinute) && state.trip === null) openDoor(state);
  // Як гості й ОСББ (нижче): поки персонаж у поїздці, ветеринарці ніхто не відчинить (перевірка поїздок 2026-10-28).
  if (day === "home-vet" && crossed(from, minutes, m.homeVetMinute) && state.trip !== null) emit(state, { type: "modifier", kind: "home-vet-away", value: 0 });
  if (day === "home-vet" && crossed(from, minutes, m.homeVetMinute) && state.trip === null) {
    // Ветеринари оглядають усіх доступних котів (рішення автора 2026-10-27, Х7): ветеринарка — всіх, хто вдома.
    const cats = state.cats.filter((c) => c.away === null);
    const rng = stateRng(state, "behavior");
    for (const cat of cats) {
      for (const d of cat.diseases) d.known = true;
      if (cat.pregnancy) cat.pregnancy.known = true;
      // Що бачить ветеринар, — як у клініці (vetExam, §9.9). Любові огляд удома не коштує: без переноски й дороги (§4.1).
      cat.sterilizedKnown = true;
      cat.breedKnown = [true, true];
      // Як кіт поводився на огляді (§9.12 «Переноска й ветеринар»): ветеринарка оглядає його при персонажі, тож це видно, де
      // б кіт не був, — якщо персонаж удома. «Жах клініки» вирвався й потім ховається.
      const manner = vetManner(cat);
      if (manner !== null) observe(state, cat, "vet", manner === "calm" ? 1 : -1, true);
      if (manner === "hid") {
        // Кіт на руках персонажа справді виривається з рук і стає на підлогу поруч, як «cat-broke-free» у catai: інакше
        // повідомлення казало «вирвався з рук і сховався», а кіт лишався на руках (загальна ревізія 2026-10-29).
        if (isCarried(state, cat)) {
          // Вирвався посеред купання — купання перервано (§8.7).
          stopBath(state);
          state.character.held = null;
          const at = visibleFloorNear(state, state.character.body);
          cat.x = at.x;
          cat.y = at.y;
          emit(state, { type: "cat-broke-free", cat: cat.id });
        }
        const spot = hideSpot(state, rng, cat);
        startAct(cat, "hide", spot.at, VET.homeHideMinutes, spot.target);
      }
    }
    if (cats.length > 0) emit(state, { type: "modifier", kind: "home-vet", value: cats.length });
  }
  // Феєрверки — гучний звук на всю квартиру (§9.12): несміливі ховаються й засмучуються.
  if (day === "festival" && crossed(from, minutes, m.festival.minute)) {
    loudNoise(state, "fireworks", null);
    emit(state, { type: "modifier", kind: "fireworks", value: 0 });
  }
  if (day === "quiet-evening" && crossed(from, minutes, m.quietEvening.minute)) for (const cat of state.cats) changeMood(state, cat, m.quietEvening.mood);
  if (day === "renovation") {
    for (const cat of state.cats) if (cat.away === null && !asleep(cat)) changeMood(state, cat, (m.renovation.catMoodPerHour * minutes) / 60);
  }
  if (day === "mom-food") tickMom(state, from, minutes);
  // Дзвонять за `GUESTS.ringLead` хвилин до оголошеного часу, коли заходять, — двері відчинено (§9.12 «Двері й гості»; рішення автора 2026-10-29, А5).
  if ((day === "inspection" && crossed(from, minutes, m.inspection.minute - GUESTS.ringLead)) || (day === "guests" && crossed(from, minutes, m.guests.minute - GUESTS.ringLead))) ringBell(state);
  // Персонажа немає вдома (поїздка, зокрема аварія) — подзвонили й пішли: двері ніхто не відчинив (перевірка поїздок 2026-10-28;
  // раніше гості «заходили» в порожню квартиру, а їхній сором під час перемотування після аварії міг закінчити гру).
  const away = state.trip !== null;
  if (away && day === "inspection" && crossed(from, minutes, m.inspection.minute)) emit(state, { type: "modifier", kind: "inspection-away", value: 0 });
  if (away && day === "guests" && crossed(from, minutes, m.guests.minute)) emit(state, { type: "modifier", kind: "guests-away", value: 0 });
  if (!away && day === "inspection" && crossed(from, minutes, m.inspection.minute)) {
    openDoor(state);
    const dirty = state.home.items.filter((i) => i.kind === "litter" && isDirty(i)).length;
    const fine = state.home.messes.length * m.inspection.mess + dirty * m.inspection.litter + (state.home.fur >= 50 ? m.inspection.fur : 0);
    const paid = Math.min(fine, Math.max(0, state.character.money));
    spend(state, paid, "other");
    // Скільки справді заплатили — картка каже й це (перевірка модифікаторів 2026-10-28: писала повний штраф, хоча знято лише те, що було).
    emit(state, { type: "modifier", kind: "inspection", value: fine, paid });
  }
  if (!away && day === "guests" && crossed(from, minutes, m.guests.minute)) {
    // «Душа компанії» тішить гостей (§9.12, «Гості») — рахується, поки двері ще не відчинено: та, що зустріла гостей під дверима
    // й вибігла на сходи, щойно їх відчинили, теж їх потішила (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А5; раніше двері
    // відчинялися раніше за підрахунок, і втеча забирала захват — саме в того кота, що через рису біг зустрічати).
    let delight = 0;
    for (const cat of state.cats) if (cat.away === null && traitLevel(cat, "guests") > 0 && !isAdapting(state, cat)) delight += GUESTS.delight;
    openDoor(state);
    const shame = Math.max(m.guests.max, state.home.messes.length * m.guests.mess);
    // «Шипить на гостей» шипить на них з-під дивана (§9.12, «Гості»); хто вибіг на сходи, той не вдома.
    let hissing = 0;
    const rng = stateRng(state, "behavior");
    for (const cat of state.cats) {
      if (cat.away !== null) continue;
      const level = traitLevel(cat, "guests");
      if (level >= 0) continue;
      // «−» ховається, як і від дзвінка: сплячого, кота на руках, новонародженого й того, що звикає, не чіпають; хто вже
      // сховався від дзвінка — сидить там довше (перевірка модифікаторів 2026-10-28: усіх силоміць гнало під ліжко, будило й рахувало шипіння).
      if (asleep(cat) || isCarried(state, cat) || isNewborn(cat) || isAdapting(state, cat)) continue;
      if (cat.act.kind === "hide") cat.act.minutes = Math.max(cat.act.minutes, cat.act.elapsed + m.guests.hideMinutes);
      else {
        const spot = hideSpot(state, rng, cat);
        startAct(cat, "hide", spot.at, m.guests.hideMinutes, spot.target);
      }
      if (level <= -2) {
        hissing += GUESTS.hissSanity;
        emit(state, { type: "hissed-guests", cat: cat.id });
      }
    }
    // Захват гостей — здоровий глузд від котів: множник складності, як на пестощі (§5.2, §9.12; загальна ревізія
    // 2026-10-29), межа — до множника. Сором і шипіння — втрати, їх множник не стосується.
    const total = shame + Math.min(GUESTS.delightMax, delight) * DIFFICULTY[state.difficulty].catSanity + hissing;
    changeStat(state, "sanity", total);
    emit(state, { type: "modifier", kind: "guests", value: total, guests: { mess: shame < 0, hissed: hissing < 0, delighted: delight > 0 } });
  }
  // Хто до 18:00 уже їде на збори, той поїхав (§4.1): раніше штраф наздоганяв його в дорозі (перевірка поїздок 2026-10-28).
  if (day === "office" && crossed(from, minutes, 18 * 60) && !today.officeDone && !toOffice(state) && isWorkday(state)) {
    const delta = m.officeAbsent * (POSITIONS[state.job.position]?.reputation ?? 1);
    changeReputation(state, delta);
    // Збори минули: поїхати після 18:00 уже нема на що (перевірка поїздок 2026-10-28: офіс лишався в списку й платив за збори).
    today.officeDone = true;
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
    // Дзвінок чекає, поки гравець вирішить: картка живе лише в сцені, і після перезавантаження сторінки дзвінок зникав без
    // жодної ціни (загальна ревізія 2026-10-29).
    today.callPending = true;
    emit(state, { type: "modifier", kind: "mom-call", value: 0 });
  }
}

/** Друг доглядає котів (§4.1): щогодини миски, вода й лотки — з наших запасів. */
function friendHelps(state: GameState, from: number, minutes: number): void {
  const m = MODIFIERS.friend;
  const minute = from % 1440;
  // Година, яку щойно перетнули: 10:00, 11:00 … 15:00 (перевірка модифікаторів 2026-10-28: перша допомога була об 11:00, хоча титулка каже «з 10:00»).
  if (Math.floor(minute / 60) === Math.floor((minute + minutes) / 60)) return;
  const hour = Math.floor((minute + minutes) / 60) * 60;
  if (hour < m.from || hour >= m.to) return;
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
