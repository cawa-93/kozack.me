// Числа гри. Біля кожного — розділ GAME_DESIGN.md, звідки воно взяте.
// Позначка «чернетка» — значення для балансування (§11.2).

import type { CatNeed, Chronotype, Difficulty, MessKind, Product, Quality, StatName } from "./types";

/** Реальних секунд на одну ігрову годину (§8). */
export const REAL_SECONDS_PER_GAME_HOUR = 45;

export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
export const DAYS_PER_WEEK = 7;

/** Гра триває 50 тижнів (§4.2). */
export const TOTAL_WEEKS = 50;
export const TOTAL_DAYS = TOTAL_WEEKS * DAYS_PER_WEEK;

// Сон (§8.8). Усі вікна — у годинах до наступного пробудження.
export const SLEEP_NEED_HOURS = 8;
/** Лягти можна, коли до пробудження лишається 10 годин або менше. */
export const BEDTIME_EARLIEST_HOURS_BEFORE_WAKE = 10;
/** Менше 8 годин до пробудження — «Сонливість». */
export const DROWSY_HOURS_BEFORE_WAKE = SLEEP_NEED_HOURS;
/** За 6 годин до пробудження персонаж падає без сил. */
export const COLLAPSE_HOURS_BEFORE_WAKE = 6;
/** Зміна швидкості наступного дня за кожну годину сну понад чи менше 8 (чернетка). */
export const SLEEP_SPEED_PER_HOUR = 0.05;
export const SLEEP_SPEED_MAX_BONUS = 0.1;
/** «Сонливість»: дії й пересування повільніші на 20% (чернетка). */
export const DROWSY_SPEED = 0.8;
/** Уві сні голод і гігієна падають учетверо повільніше. */
export const SLEEP_DECAY_DIVIDER = 4;
/** Уві сні здоров'я відновлюється на 1 за годину. */
export const SLEEP_HEALTH_PER_HOUR = 1;
/** Уві сні показники не опускаються нижче 5. */
export const SLEEP_STAT_FLOOR = 5;

/** Хвилина пробудження від 00:00 за хронотипом (§5.1, §8.8). */
export const WAKE_MINUTE = {
  lark: 6 * MINUTES_PER_HOUR,
  owl: 8 * MINUTES_PER_HOUR,
} as const;

// Показники (§6, §6.3; стартові числа — чернетка).
export const STAT_MAX = 100;
export const START_STATS: Record<StatName, number> = {
  health: 100,
  satiety: 70,
  hygiene: 80,
  sanity: 40,
};
export const START_MONEY = 150;
/** Ситість за годину неспання. */
export const SATIETY_PER_HOUR = -4;
/** Чоловічий персонаж: ситість спадає на 10% швидше (§5.1). */
export const MALE_METABOLISM = 1.1;
/** Гігієна за годину неспання. */
export const HYGIENE_PER_HOUR = -3;
/** Здоров'я за годину неспання, коли ситість нижче порогу. */
export const HUNGER_HEALTH_PER_HOUR = -1;
export const HUNGER_HEALTH_THRESHOLD = 20;

// Низькі показники (§6.3, чернетка).
/** Нижче цього значення показник вважається низьким. */
export const LOW_STAT = 25;
/** Низьке здоров'я чи ситість: рух і фізичні дії повільніші (кожне окремо). */
export const LOW_STAT_SPEED = 0.8;
/** Найбільший шанс збою керування за ігрову хвилину руху — при здоровому глузді 0. */
export const GLITCH_MAX_CHANCE_PER_MINUTE = 0.4;
/** Скільки ігрових хвилин триває збій керування. */
export const GLITCH_MINUTES = 0.5;
/** На скільки градусів збій зсуває напрямок руху. */
export const GLITCH_ANGLE_MIN = 60;
export const GLITCH_ANGLE_MAX = 150;

/** Модифікатор першого дня гри (§4.1, §8.3). */
export const FIRST_DAY_MODIFIER = "first-day";

// Здоровий глузд (§6.2, §8.3).
/** Нижче цього значення ввечері персонаж забирає кошеня з притулку. */
export const KITTEN_SANITY_THRESHOLD = 30;
/** Межа падіння: у «Перший день» і при втраті кота. */
export const SANITY_FLOOR = 10;
/** Вік примусового кошеняти в тижнях (§6.2). */
export const KITTEN_AGE_WEEKS = 1;

/** Множники й ціни за складністю (§5.2). */
export const DIFFICULTY: Record<
  Difficulty,
  { earnings: number; catSanity: number; newCatSanity: number; lostCatSanity: number }
> = {
  easy: { earnings: 1.25, catSanity: 1.25, newCatSanity: 62, lostCatSanity: -20 },
  normal: { earnings: 1, catSanity: 1, newCatSanity: 50, lostCatSanity: -25 },
  hard: { earnings: 0.8, catSanity: 0.8, newCatSanity: 40, lostCatSanity: -31 },
};

/** «Пригніченість» (§6.2): без котів здоровий глузд не вище порогу кошеняти. */
export const DEPRESSION_CEILING = KITTEN_SANITY_THRESHOLD;

// Рух (§8.4, чернетка). Відстані — у клітинках підлоги.
export const WALK_TILES_PER_MINUTE = 3;
export const DASH_SPEED = 3;
export const DASH_MINUTES = 0.25;
export const DASH_COOLDOWN_MINUTES = 1.5;
/** Половина ширини персонажа. */
export const BODY_RADIUS = 0.3;
/** На якій відстані від речі персонаж може з нею взаємодіяти. */
export const REACH = 0.75;
/** Наскільки річ, на яку дивиться персонаж, важливіша за ближчу (у клітинках). */
export const FACING_PRIORITY = 0.5;
/** Відхилення джойстика, менше за це, — не рух. */
export const INPUT_DEADZONE = 0.15;

// Побут (§8.7, чернетка). Час — в ігрових хвилинах.
/** Страва на плиті готова. */
export const COOK_MINUTES = 20;
/** Страва на плиті підгорає. */
export const BURN_MINUTES = COOK_MINUTES + 15;
export const EAT_MINUTES = 10;
export const SHOWER_MINUTES = 10;
/** Ситість за порцію (§6.4). */
export const MEAL_SATIETY: Record<Quality, number> = { cheap: 24, premium: 32 };
/** Гігієна за душ залежно від засобів гігієни (§6.4); none — без засобів. */
export const SHOWER_HYGIENE: Record<Quality | "none", number> = { none: 20, cheap: 45, premium: 60 };

// Економіка (§6.4, чернетка).
/** Запаси: скільки порцій чи душів в упаковці й скільки вона коштує в магазині. */
// Котячий корм — порції (мішок на 56, §6.4); наповнювач — чистки лотка (§9.12): дешевий пакет на 7 чисток,
// дорогий на 4, обидва — приблизно на кота на тиждень.
export const PRODUCTS: Record<Product, { units: Record<Quality, number>; price: Record<Quality, number> }> = {
  food: { units: { cheap: 21, premium: 21 }, price: { cheap: 40, premium: 80 } },
  hygiene: { units: { cheap: 14, premium: 14 }, price: { cheap: 15, premium: 35 } },
  catFood: { units: { cheap: 56, premium: 56 }, price: { cheap: 100, premium: 200 } },
  litter: { units: { cheap: 7, premium: 4 }, price: { cheap: 8, premium: 15 } },
};
export const START_SUPPLIES: Record<Product, Record<Quality, number>> = {
  food: { cheap: 6, premium: 0 },
  hygiene: { cheap: 7, premium: 0 },
  catFood: { cheap: 0, premium: 0 },
  litter: { cheap: 0, premium: 0 },
};
/** Стартовий пакет кота з притулку (§9.12): порції дешевого корму й чистки дешевого наповнювача. */
export const SHELTER_STARTER_PACK = { catFood: 8, litter: 7 };
/** Доставка коштує 110% від базової ціни. */
export const DELIVERY_PRICE = 1.1;
export const DELIVERY_HOURS = 6;
/** Якщо персонаж спатиме, коли прибуде пакунок, його привезуть о 09:00 наступного дня. */
export const DELIVERY_NEXT_DAY_MINUTE = 9 * MINUTES_PER_HOUR;
/** Комунальні за тиждень: базова сума (без внеску речей). */
export const UTILITIES_BASE = 40;

// Робота (§8.6).
export const WORK_START_MINUTE = 9 * MINUTES_PER_HOUR;
export const WORK_END_MINUTE = 18 * MINUTES_PER_HOUR;
/** Будні — понеділок–п'ятниця. */
export const WORKDAYS_PER_WEEK = 5;
export const PATIENCE_MAX = 100;
/** Терпіння нижче цього — «!» над комп'ютером. */
export const PATIENCE_WARNING = 50;
export const START_REPUTATION = 50;
export const REPUTATION_MAX = 100;
/** Робота — неприємне завдання (§8.1): здоровий глузд за годину. */
export const WORK_SANITY_PER_HOUR = -5;
/** Стан «Х»: репутація за годину — стільки × (репутація за годину посади). */
export const ABSENCE_REPUTATION = -3;
export const STANDUP_MINUTE = 10 * MINUTES_PER_HOUR;
export const STANDUP_MINUTES = 15;
/** Летучку зараховано, якщо персонаж пробув на ній щонайменше таку частку часу. */
export const STANDUP_ATTENDANCE = 0.5;
/** Пропущена летучка: × (репутація за годину посади). */
export const STANDUP_MISSED_REPUTATION = -1;
/** Гігієна на відеодзвінку: нижче LOW_STAT — штраф, від HIGH_HYGIENE — бонус (× репутація за годину). */
export const CALL_HYGIENE_REPUTATION = 0.5;
export const HIGH_HYGIENE = 75;

/** Посади від стажера до директора (§8.6, чернетка). Терпіння — за годину. */
export const POSITIONS: readonly {
  pay: number;
  patienceDecay: number;
  patienceRecovery: number;
  reputation: number;
}[] = [
  { pay: 10, patienceDecay: 25, patienceRecovery: 58, reputation: 3.09 },
  { pay: 13, patienceDecay: 28, patienceRecovery: 52, reputation: 1.59 },
  { pay: 17, patienceDecay: 31, patienceRecovery: 46, reputation: 0.99 },
  { pay: 22, patienceDecay: 34, patienceRecovery: 42, reputation: 0.65 },
  { pay: 28, patienceDecay: 37, patienceRecovery: 37, reputation: 0.46 },
  { pay: 35, patienceDecay: 40, patienceRecovery: 33, reputation: 0.34 },
  { pay: 43, patienceDecay: 43, patienceRecovery: 29, reputation: 0.25 },
  { pay: 52, patienceDecay: 46, patienceRecovery: 25, reputation: 0.19 },
  { pay: 62, patienceDecay: 49, patienceRecovery: 21, reputation: 0.14 },
  { pay: 75, patienceDecay: 52, patienceRecovery: 17, reputation: 0.1 },
];

/**
 * Хронотип (§5.1): у ці години неприємні завдання забирають на 10% менше
 * (множник 0,9) чи більше (1,1) здорового глузду. Години — від 00:00.
 */
export const CHRONOTYPE_WINDOWS: Record<Chronotype, readonly { from: number; to: number; factor: number }[]> = {
  lark: [
    { from: 7, to: 12, factor: 0.9 },
    { from: 15, to: 19, factor: 1.1 },
  ],
  owl: [
    { from: 7, to: 12, factor: 1.1 },
    { from: 15, to: 20, factor: 0.9 },
  ],
};

// Коти (§9.1–9.6, §9.12; чернетка).
/** Межа віку кота в тижнях (§9.2). */
export const CAT_AGE_LIMIT = 5;
/** Найбільше рис за віком без «Довголіття» (§9.1). */
export const MAX_TRAITS = 12;
/** Нова риса випадає сильною (±2) з цією ймовірністю (§9.1). */
export const STRONG_TRAIT_CHANCE = 0.3;
/** Стартові настрій і любов: кіт ззовні й народжений удома (§9.6, §7). */
export const CAT_START = {
  outside: { mood: 40, love: 25 },
  born: { mood: 60, love: 50 },
} as const;
/** Кіт ззовні перші дні адаптується: голод росте повільніше, кіт ховається (§9.6, §9.12). */
export const ADAPTATION_DAYS = 2;
export const ADAPTATION_HUNGER = 0.5;

/** Ріст потреб за годину (§9.12). Гра множиться ще й на активність години. */
export const NEED_PER_HOUR: Record<CatNeed, number> = {
  hunger: 8,
  thirst: 12,
  toilet: 12,
  fatigue: 7,
  attention: 8,
  play: 10,
};
/** Кіт іде задовольняти потребу, щойно вона сягає порогу (§9.12). */
export const NEED_THRESHOLD = { hunger: 80, thirst: 60, toilet: 80, attention: 60, play: 70 } as const;
/** Сон знімає втому за годину; засинає від 40 + 40 × активність, прокидається на 10, сон щонайменше 30 хвилин. */
export const SLEEP_RECOVERY_PER_HOUR = 5;
export const SLEEP_START = { base: 40, activity: 40 } as const;
export const SLEEP_END = 10;
export const MIN_CAT_NAP_MINUTES = 30;
/** Втома росте швидше понад межу віку чи зі здоров'ям нижче 50 (§9.12). */
export const TIRED_FATIGUE = 1.3;
export const LOW_CAT_HEALTH = 50;
/** Гра: кошенята 1–2 тижні гіперактивні, старі коти грають менше (§9.3, §9.12). */
export const KITTEN_PLAY = 1.5;
export const OLD_PLAY = 0.6;
export const KITTEN_MAX_AGE = 2;
/** Сила риси на одиницю: потреби ±25%, апетит ±15%, сон ∓15% (§9.12). */
export const TRAIT_NEED_STEP = 0.25;
export const APPETITE_STEP = 0.15;
export const SLEEP_TRAIT_STEP = 0.15;

/** Активність за годиною доби — сутінковий ритм (§9.3, §9.12). */
export const ACTIVITY_BY_HOUR: readonly { from: number; to: number; activity: number }[] = [
  { from: 4, to: 8, activity: 1 },
  { from: 8, to: 11, activity: 0.6 },
  { from: 11, to: 16, activity: 0.25 },
  { from: 16, to: 18, activity: 0.6 },
  { from: 18, to: 23, activity: 1 },
];
/** Уночі (23:00–04:00); «Нічна активність» +0,2 за одиницю. */
export const NIGHT_ACTIVITY = 0.3;
export const NOCTURNAL_STEP = 0.2;

/** Рух кота: клітинок за ігрову хвилину; меблі для кота «дорожчі» за підлогу. */
export const CAT_WALK_TILES_PER_MINUTE = 2.5;
export const FURNITURE_COST = 3;

/** Тривалість дій кота на місці, хвилини (§9.12). */
export const CAT_ACT_MINUTES = { eat: 3, drink: 1, toilet: 2, beg: 15, attention: 20, idle: 10, wander: 8, hide: 30 } as const;
/** Порція корму знімає 100 голоду; ковток — усю спрагу (§9.12). */
export const PORTION_HUNGER = 100;
/** Миска вміщує 2 порції; миска для води — 8 ковтків (§9.12). */
export const BOWL_CAPACITY = 2;
export const WATER_CAPACITY = 8;
/** Лоток брудний після стількох відвідин; без наповнювача — після першого (§9.12). */
export const LITTER_CAPACITY: Record<Quality | "none", number> = { none: 1, cheap: 3, premium: 5 };
/** Тривалість прибирання, хвилини (§9.12). */
export const CLEAN_LITTER_MINUTES = 3;
export const CLEAN_MESS_MINUTES = 2;
/** Неприємні завдання (§8.1): здоровий глузд за раз. */
export const LITTER_SANITY = -3;
export const MESS_SANITY: Record<MessKind, number> = { surprise: -4, vomit: -4, hairball: -4, litter: -2, broken: -2 };

/** Настрій кота від подій (§9.12). */
export const MOOD = {
  premiumFood: 3,
  cheapFood: 0,
  pickyRefusal: -2,
  dirtyLitter: -3,
  starvingPerHour: -2,
  restedSleep: 2,
  woken: -4,
  ignoredPerHour: -1,
  premiumItem: 0.5,
  cheapItem: -0.5,
  sickPerDay: -3,
} as const;
/** «Перебірливість»: шанс відмовитися від дешевого корму за одиницю (§9.12). */
export const PICKY_REFUSAL_STEP = 0.4;
/** «Стресостійкість» змінює втрати настрою на 20% за одиницю (§9.12). */
export const STRESS_STEP = 0.2;
/** Безлад біля лотка (§9.12): «сюрприз» деінде й розкиданий наповнювач. */
export const SURPRISE_CHANCE = { base: 0.15, step: 0.3 } as const;
export const SCATTER_CHANCE = { base: 0.2, step: 0.2 } as const;

/** Любов (§7, §9.12): день без взаємодії; дрейф настрою за день — (любов − 50) × 6 / 100 (§9.6). */
export const LOVE = {
  noInteractionPerDay: -1,
  driftPerPoint: 6 / 100,
} as const;
/** «Відданість» і «Образливість» змінюють зростання й втрати любові на 25% за одиницю (§9.12). */
export const LOVE_TRAIT_STEP = 0.25;

/** Здоров'я кота за день від середнього настрою (§9.6): поріг — зміна; між 25 і 75 — 0. */
export const MOOD_HEALTH_DAMAGE: readonly { atMost: number; health: number }[] = [
  { atMost: 0, health: -10 },
  { atMost: 5, health: -5 },
  { atMost: 10, health: -4 },
  { atMost: 15, health: -3 },
  { atMost: 20, health: -2 },
  { atMost: 25, health: -1 },
];
export const MOOD_HEALTH_RECOVERY: readonly { atLeast: number; health: number }[] = [
  { atLeast: 100, health: 10 },
  { atLeast: 95, health: 5 },
  { atLeast: 90, health: 4 },
  { atLeast: 85, health: 3 },
  { atLeast: 80, health: 2 },
  { atLeast: 75, health: 1 },
];
/** Множники відновлення здоров'я (§9.5): вік і «Одужання» ±20% за одиницю. */
export const RECOVERY_BY_AGE = { young: 1.5, adult: 1, old: 0.5 } as const;
export const RECOVERY_TRAIT_STEP = 0.2;

/** Пестощі (§8.2, §9.12): здоровий глузд, настрій і любов за хвилину; терпіння й укус. */
export const PET = {
  sanity: 2,
  unwantedSanity: 1,
  mood: 1,
  unwantedMood: -1,
  love: 0.5,
  tooLongMood: -2,
  /** Кіт хоче уваги, якщо увага від 40. */
  wantsAttention: 40,
  attentionPerMinute: 10,
  toleranceMinutes: 3,
  toleranceStep: 0.5,
  minToleranceMinutes: 1,
  biteChancePerMinute: 0.3,
  biteHealth: -1,
  /** Узяли на руки, коли кіт не хотів (§9.12). */
  unwantedLove: -2,
} as const;

/** Котячі побудки (§8.8, §9.12): ранкова о 05:00 і нічні пісні; у вікні сну втрачено 30 хвилин. */
export const WAKE_UP = {
  morningMinute: 5 * MINUTES_PER_HOUR,
  morningBase: 0.1,
  morningStep: 0.25,
  nightStep: 0.15,
  /** Ранкова побудка — лише коли кіт голодний. */
  hungry: 80,
  lostMinutes: 30,
} as const;
