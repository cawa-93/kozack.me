// Ніч — обробка між днями, поки персонаж спить (§4). Кроки йдуть строго в порядку §4.

import { dropEverything, tickStove } from "./actions";
import { newBody } from "./body";
import { knownBreedHalves } from "./breeds";
import { observe } from "./knowledge";
import { ageCat, ageDue, closeCatDay, createCat, traitLevel } from "./cat";
import { hourOf, isCarried, tickCats } from "./catai";
import { changeStat, closeLedger, passSleepTime } from "./character";
import {
  BREEDING,
  DIFFICULTY,
  HAIRBALL,
  MODIFIERS,
  ILLNESS,
  KITTEN_AGE_WEEKS,
  KITTEN_SANITY_THRESHOLD,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  SANITY_FLOOR,
  SHELTER_STARTER_PACK,
  WAKE_UP,
  COLLAPSE_HOURS_BEFORE_WAKE,
  NOCTURNAL,
  CAT_ACT_MINUTES,
} from "./config";
import { addSupply, payUtilities, place, postponeDeliveries } from "./economy";
import { emit } from "./events";
import { agingDiseases, isHurting, maybeFallIll, nightlyDiseases } from "./diseases";
import { nightlyIllness } from "./illness";
import { nightlyCare } from "./care";
import { nightlyHousehold, tickHousehold } from "./household";
import { collectAds, oldAgeDeaths, zeroHealthDeaths } from "./farewell";
import { objectById, roomAt } from "./home";
import { initRelations, nightlyRelations } from "./relations";
import { conceive, giveBirth, inHeat, isNewborn, nightlyStates } from "./reproduction";
import { chooseWeekModifier, startModifiers } from "./modifiers";
import { createRng, deriveSeed, seedDay, stateRng, streamSeed, type Rng } from "./rng";
import { sleepSpeedAfter, wakeMinute } from "./sleep";
import { isSunday, weekOf } from "./time";
import type { Cat, GameState, NightReport, NightStep } from "./types";
import { morningJob } from "./work";

interface Night {
  state: GameState;
  report: NightReport;
  /** Нічні кидки: на переграванні ті самі (§6.1). */
  rng: Rng;
}

interface Step {
  id: NightStep;
  /** Лише в ніч із неділі на понеділок. */
  weekly?: true;
  run(night: Night): void;
}

const STEPS: readonly Step[] = [
  { id: "sleep", run: sleep },
  // 1. Здоров'я котів від настрою (§9.6) і хвороб (§9.5 — крок 10 плану).
  { id: "cat-health", run: catHealth },
  // 2. Смерть від нульового здоров'я (§9.5).
  { id: "cat-death", run: catDeath },
  // 3. Коти, яким минає ще тиждень відтоді, як з'явилися вдома (§9.1, рішення автора 2026-10-27): вік і межа віку.
  { id: "cat-age", run: ageCats },
  { id: "age-limit", run: ageLimit }, // §9.2
  // 4. Ніч із неділі на понеділок.
  { id: "births", weekly: true, run: births }, // §9.8
  { id: "pregnancies", weekly: true, run: pregnancies }, // §9.8
  { id: "utilities", weekly: true, run: utilities },
  { id: "week-modifier", weekly: true, run: weekModifier }, // §4.1
  // 4. Поріг 35% за здоровим глуздом увечері.
  { id: "kitten-check", run: kittenCheck },
  // 5. Ранок: персонаж бачить, що сталося вночі.
  { id: "morning", run: morning },
  // 6. Новий день.
  { id: "new-day", run: newDay },
];

/** Проспати ніч і почати новий день. */
export function runNight(state: GameState, collapsed: boolean): NightReport {
  const sanity = state.character.stats.sanity;
  const report: NightReport = {
    day: state.day,
    sleptHours: 0,
    collapsed,
    weekly: isSunday(state.day),
    wakeUps: [],
    wokeMinute: wakeMinute(state),
    steps: [],
    lostCats: [],
    givenCats: [],
    newCats: [],
    utilities: null,
    ledger: null,
    sanityEvening: sanity,
    sanityMorning: sanity,
  };
  const base = streamSeed(state.seed, "night", state.day);
  const night: Night = { state, report, rng: createRng(base) };
  for (const [index, step] of STEPS.entries()) {
    if (step.weekly && !report.weekly) continue;
    // Кожен крок — своє зерно від дня: скільки чисел узяли сон і хвороби, залежить від поведінки за день, і раніше це
    // перекидало на переграванні смерть кота, виводок, зачаття й примусове кошеня (§6.1; перевірка розмноження 2026-10-28).
    night.rng = createRng(deriveSeed(base, index + 1));
    step.run(night);
    report.steps.push(step.id);
    // Виселення закінчує гру: решта ночі вже не обробляється (§6.4).
    if (state.end !== null) break;
  }
  state.lastNight = report;
  return report;
}

/**
 * Уранці здоровий глузд змінюється спершу за втрачених котів (не нижче 10%),
 * потім за нових (не вище 100) (§4, §6.2).
 */
export function applyMorningSanity(state: GameState, lost: number, gained: number): void {
  const { lostCatSanity, newCatSanity } = DIFFICULTY[state.difficulty];
  for (let i = 0; i < lost; i++) changeStat(state, "sanity", lostCatSanity, SANITY_FLOOR);
  for (let i = 0; i < gained; i++) changeStat(state, "sanity", newCatSanity);
}

/** Побудка, яку кіт планує цієї ночі; `ritual` — «Живий будильник» будить і без голоду чи з кормом у мисці. */
interface PlannedWake {
  cat: Cat;
  minute: number;
  reason: "morning" | "night";
  trait?: "nocturnal" | "morning";
  ritual?: boolean;
}

/** Хто й коли будитиме персонажа цієї ночі (§9.12): ранкова побудка й нічні пісні. */
function plannedWakeUps(state: GameState, rng: Rng, from: number, to: number): PlannedWake[] {
  const wakes: PlannedWake[] = [];
  const dawn = MINUTES_PER_DAY + WAKE_UP.morningMinute;
  for (const cat of state.cats) {
    if (cat.away !== null) continue;
    // Тиха ніч: коти не будять (§4.1).
    if (state.modifiers.day === "quiet-night" || state.modifiers.day === "quiet-evening") continue;
    // Після феєрверків коти неспокійні.
    if (state.modifiers.day === "festival" && rng.chance(MODIFIERS.festival.wake)) wakes.push({ cat, minute: from + Math.floor(rng.next() * (to - from)), reason: "night" });
    const nocturnal = traitLevel(cat, "nocturnal");
    // Кішка в тічці кричить уночі (§9.8).
    if (inHeat(state, cat) && rng.chance(BREEDING.heatWake)) wakes.push({ cat, minute: from + Math.floor(rng.next() * (to - from)), reason: "night" });
    if (nocturnal > 0 && rng.chance(WAKE_UP.nightStep * nocturnal)) {
      wakes.push({ cat, minute: from + Math.floor(rng.next() * (to - from)), reason: "night", trait: "nocturnal" });
    }
    // Чи кіт справді будить, вирішиться о 05:00: якщо він голодний, а миски порожні. «Живий будильник» будить і
    // заради ритуалу — удвічі рідше; «Терплячий зранку» не будить ніколи (рішення автора 2026-10-25).
    const morning = traitLevel(cat, "morning");
    const chance = morning < 0 ? 0 : WAKE_UP.morningBase + WAKE_UP.morningStep * morning;
    if (dawn > from && dawn < to && rng.chance(chance)) {
      wakes.push({ cat, minute: dawn, reason: "morning", trait: "morning", ...(morning > 0 && rng.chance(WAKE_UP.ritual) ? { ritual: true } : {}) });
    }
  }
  return wakes.sort((a, b) => a.minute - b.minute);
}

/**
 * Сон (§8.8, §9.12): коти живуть ніч, поки персонаж спить, і можуть його розбудити.
 * Нічна побудка — година сну, і персонаж засинає знову. Ранкова в межах вікна сну — пів години;
 * пізніше — день починається одразу.
 */
function sleep({ state, report, rng }: Night): void {
  dropEverything(state);
  const start = state.minute;
  // Галасливі сусіди будять раніше (§4.1).
  const planned = wakeMinute(state) + MINUTES_PER_DAY - state.today.earlyWake;
  const wakes = plannedWakeUps(state, rng, start, planned);
  let lost = 0;
  let woke = planned;
  let minute = start;
  // Хто скільки нічного сну персонажа проспав у нього на ліжку (§9.12): прояв «Нічної активності −».
  const bed = objectById("bed");
  const onBed = new Map<number, number>();
  let nightMinutes = 0;
  while (minute < planned) {
    const nextWake = wakes[0];
    const until = Math.min(planned, nextWake ? nextWake.minute : planned);
    // Коти живуть ніч похвилинно: безлад, порожні миски, брудний лоток (§4).
    while (minute < until) {
      const step = Math.min(1, until - minute);
      tickHousehold(state, minute, step);
      const since = state.nextId;
      tickCats(state, step, { present: false });
      lost += coughWakes(state, report, rng, since);
      minute += step;
      state.minute = minute;
      const hour = hourOf(minute);
      if (hour >= NOCTURNAL.bedFrom || hour < NOCTURNAL.bedTo) {
        nightMinutes += step;
        for (const cat of state.cats) if (sleepsOnBed(cat, bed)) onBed.set(cat.id, (onBed.get(cat.id) ?? 0) + step);
      }
    }
    if (!nextWake || minute >= planned) break;
    wakes.shift();
    // Не більше двох побудок за ніч сумарно (§9.12, «Спільні механіки рис»): третій кіт уже не будить.
    if (report.wakeUps.length >= WAKE_UP.maxPerNight) continue;
    const { cat, reason } = nextWake;
    // Ранкова побудка — лише якщо кіт голодний і миски порожні, а «Живий будильник» — і заради ритуалу.
    const hungry = cat.needs.hunger >= WAKE_UP.hungry && !state.home.items.some((i) => i.kind === "bowl" && i.food > 0);
    if (reason === "morning" && !hungry && nextWake.ritual !== true) continue;
    report.wakeUps.push({ cat: cat.id, reason });
    // Розбудив — прояв «Нічної активності» чи «Ранкової побудки» (§9.9). Групи — рядками: так тест повноти рис
    // бачить, що прояв є.
    if (nextWake.trait === "nocturnal") observe(state, cat, "nocturnal", 1, true);
    if (nextWake.trait === "morning") observe(state, cat, "morning", 1, true);
    if (reason === "night") {
      lost += WAKE_UP.nightLostMinutes;
      continue;
    }
    // До півночі день не починається: персонаж засинає знову (з «Галасливими сусідами» вікно зсувається).
    if ((planned - minute) / MINUTES_PER_HOUR >= COLLAPSE_HOURS_BEFORE_WAKE || minute < MINUTES_PER_DAY) {
      lost += WAKE_UP.lostMinutes;
    } else {
      woke = minute;
      break;
    }
  }
  const slept = Math.max(0, woke - start - lost) / MINUTES_PER_HOUR;
  report.sleptHours = slept;
  wakingSight(state, bed, onBed, nightMinutes);
  report.wokeMinute = woke - MINUTES_PER_DAY;
  // Плита вночі не вимикається: страва, що лишилася на ній, підгорає (§8.7).
  tickStove(state, woke - start);
  postponeDeliveries(state);
  passSleepTime(state, slept);
  state.character.sleepSpeed = sleepSpeedAfter(slept);
  nightlyIllness(state, slept);
}

/**
 * Кахикання перед шерстяною грудкою будить персонажа (§9.12, рішення автора 2026-10-25): з шансом 20%, якщо кіт у спальні,
 * і 5% — деінде; це звичайна нічна побудка (спільна стеля) і прояв «Шерстяних грудок» — персонаж прокинувся саме від цього
 * кота. `since` — грудки з id від цього з'явилися щойно. Повертає, скільки хвилин сну втрачено.
 */
export function coughWakes(state: GameState, report: NightReport, rng: Rng, since: number): number {
  let lost = 0;
  for (const mess of state.home.messes) {
    if (mess.kind !== "hairball" || mess.id < since || mess.cat === null || report.wakeUps.length >= WAKE_UP.maxPerNight) continue;
    const cat = state.cats.find((c) => c.id === mess.cat);
    if (!cat || !rng.chance(roomAt(cat) === "bedroom" ? HAIRBALL.wakeBedroom : HAIRBALL.wakeElsewhere)) continue;
    report.wakeUps.push({ cat: cat.id, reason: "hairball" });
    observe(state, cat, "hairballs", 1, true);
    lost += WAKE_UP.nightLostMinutes;
  }
  return lost;
}

/** Кіт спить на ліжку персонажа (§9.12). */
function sleepsOnBed(cat: Cat, bed: { x: number; y: number; w: number; h: number }): boolean {
  return cat.away === null && cat.act.kind === "sleep" && cat.act.goal === null && cat.x >= bed.x && cat.x < bed.x + bed.w && cat.y >= bed.y && cat.y < bed.y + bed.h;
}

/**
 * Що персонаж бачить, щойно прокинувся (§9.12, рішення автора 2026-10-25): «Нічний сплюх» спить у нього на ліжку,
 * проспавши там майже всю ніч, — прояв «Нічної активності −»; голодний «Терплячий зранку» сидить біля ліжка й чекає
 * сніданку (дія «просить» біля ліжка) — прояв «Ранкової побудки −». Раз за ранок.
 */
function wakingSight(state: GameState, bed: { x: number; y: number; w: number; h: number }, onBed: Map<number, number>, nightMinutes: number): void {
  for (const cat of state.cats) {
    if (cat.away !== null || isCarried(state, cat)) continue;
    const slept = onBed.get(cat.id) ?? 0;
    if (nightMinutes >= NOCTURNAL.minNightMinutes && slept >= NOCTURNAL.bedShare * nightMinutes && sleepsOnBed(cat, bed)) {
      observe(state, cat, "nocturnal", -1, true);
    }
    const busy = cat.act.kind === "eat" || cat.act.kind === "toilet" || cat.act.kind === "fight" || cat.act.kind === "hide";
    if (traitLevel(cat, "morning") >= 0 || cat.needs.hunger < WAKE_UP.waitHunger || busy || isNewborn(cat)) continue;
    // Біля ліжка, попереду й праворуч від персонажа, що встає (`SPAWN`), обличчям до нього: за ним кота не видно було б.
    cat.x = bed.x + bed.w + 1.3;
    cat.y = bed.y + bed.h + 0.2;
    cat.facing = -1;
    cat.act = { kind: "beg", target: "bed", goal: null, minutes: CAT_ACT_MINUTES.beg, elapsed: 0 };
    observe(state, cat, "morning", -1, true);
  }
}

/** Здоров'я котів змінюється від середнього настрою за день (§9.6). */
function catHealth({ state, rng }: Night): void {
  // Поки хвороба шкодить, гарний настрій здоров'я не відновлює (§9.5, Х5).
  for (const cat of state.cats) closeCatDay(state, cat, !isHurting(state, cat));
  // Хвороби — після підсумку дня, бо цистит залежить від середнього настрою дня (§9.5).
  nightlyDiseases(state, rng);
  nightlyStates(state, rng);
  nightlyCare(state, rng);
  // Підсумок дня для пар: життя разом зближує (§9.4).
  nightlyRelations(state);
}

function catDeath({ state, report, rng }: Night): void {
  for (const entry of zeroHealthDeaths(state, rng)) report.lostCats.push(entry.id);
}

function ageLimit({ state, report, rng }: Night): void {
  for (const entry of oldAgeDeaths(state, rng)) report.lostCats.push(entry.id);
}

function births({ state, report, rng }: Night): void {
  for (const kitten of giveBirth(state, rng)) {
    addCat(state, kitten);
    report.newCats.push(kitten.id);
  }
}

function pregnancies({ state, rng }: Night): void {
  conceive(state, rng);
}

function weekModifier({ state }: Night): void {
  state.modifiers.week = chooseWeekModifier(state, weekOf(state.day + 1));
}

/** Коти старшають у свою ніч — раз на 7 днів від дня появи (§9.1): вік, нова риса, старечі болячки. */
function ageCats({ state, rng }: Night): void {
  for (const cat of state.cats) {
    if (!ageDue(state, cat)) continue;
    ageCat(state, cat, rng);
    agingDiseases(state, cat, rng);
  }
}

function utilities({ state, report }: Night): void {
  report.utilities = payUtilities(state);
  // Гроші тижня разом із платежем комунальних — у звіт ночі; новий тиждень рахується з нуля (§6.4, «Куди йдуть гроші»).
  report.ledger = closeLedger(state);
}

/**
 * Здоровий глузд увечері нижче 35% — персонаж забирає кошеня з притулку (§6.2).
 * Кошеня випадкове: 1 тиждень, 1 риса, жодної відомої; приходить зі стартовим пакетом (§9.12).
 */
function kittenCheck({ state, report, rng }: Night): void {
  // «Пригніченість» тримає здоровий глузд не вище порогу — рівно 35 (котокафе) не мало забирати кошеня й захист без кота
  // (перевірка розмноження 2026-10-28): пригнічений без кота забирає кошеня й тоді.
  if (report.sanityEvening >= KITTEN_SANITY_THRESHOLD && !state.character.depressed) return;
  const cat = createCat(state, rng, { source: "shelter-forced", ageWeeks: KITTEN_AGE_WEEKS });
  // Що видно про породу — як у притулку (§9.11; пошук багів 2026-10-25: було невідомо навіть на легкій).
  cat.breedKnown = knownBreedHalves(state, cat.breed, rng);
  cat.arrivedDay = state.day + 1;
  addCat(state, cat);
  // Притулок: блохи (§9.5).
  maybeFallIll(state, cat, "fleas", ILLNESS.shelterFleas, rng);
  giveStarterPack(state);
  report.newCats.push(cat.id);
}

/** Новий кіт у домі: «Пригніченість» знімається (§6.2). */
export function addCat(state: GameState, cat: Cat): void {
  initRelations(state, cat);
  state.stats.raised[cat.source] += 1;
  state.cats.push(cat);
  state.character.depressed = false;
  emit(state, { type: "cat-arrived", cat: cat.id });
}

/** Стартовий пакет кота з притулку: корм, наповнювач і, якщо вдома немає, дешеві миска, вода й лоток (§9.12). */
export function giveStarterPack(state: GameState): void {
  addSupply(state, "catFood", "cheap", SHELTER_STARTER_PACK.catFood);
  addSupply(state, "litter", "cheap", SHELTER_STARTER_PACK.litter);
  // Без мисок і лотка кіт не проживе й ночі: притулок дає найпростіші, якщо вдома їх немає.
  for (const thing of ["bowl", "water", "litter"] as const) {
    if (state.home.items.some((i) => i.kind === thing)) continue;
    const item = place(state, thing, "cheap");
    if (item) state.home.items.push(item);
  }
}

/** Ранок: здоровий глузд від нічних подій; без котів і нижче 35% — «Пригніченість» (§6.2). */
function morning({ state, report, rng }: Night): void {
  nightlyHousehold(state, rng);
  // Нові господарі приїжджають по котів за оголошеннями (§9.8) — це втрата, тож раніше за бонус нових котів (§4: спершу втрати).
  for (const entry of collectAds(state)) report.givenCats.push(entry.id);
  applyMorningSanity(state, report.lostCats.length, report.newCats.length);
  const character = state.character;
  character.depressed = character.stats.sanity < KITTEN_SANITY_THRESHOLD && state.cats.length === 0;
  report.sanityMorning = character.stats.sanity;
}

function newDay({ state, report }: Night): void {
  state.day += 1;
  state.minute = report.wokeMinute;
  state.dayStartMinute = report.wokeMinute;
  state.character.body = newBody();
  morningJob(state);
  seedDay(state);
  // Модифікатор дня й тижня (§4.1): з потоку умов дня, тож на переграванні той самий.
  startModifiers(state, stateRng(state, "conditions"));
}
