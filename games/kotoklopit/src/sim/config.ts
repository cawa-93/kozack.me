// Числа гри. Біля кожного — розділ GAME_DESIGN.md, звідки воно взяте.
// Позначка «чернетка» — значення для балансування (§11.2).

import type { CatNeed, Chronotype, Destination, Difficulty, DiseaseId, IllnessId, Medicine, MessKind, Product, Quality, StatName, ThingKind } from "./types";

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
/** Уві сні здоров'я відновлюється на 1 за годину, якщо персонаж ліг ситим (від LOW_STAT) і не хворий (правка автора 2026-10-22). */
export const SLEEP_HEALTH_PER_HOUR = 1;
/** Здоров'я за кожну годину сну менше SLEEP_NEED_HOURS (правка автора 2026-10-22). */
export const SLEEP_DEBT_HEALTH_PER_HOUR = -2;
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
/** Ситість за один ривок — «біганина» (§6.3, правка автора 2026-10-22). */
export const DASH_SATIETY = -0.25;
/** Здоров'я за годину неспання, коли ситість нижче порогу (правка автора 2026-10-22: було −1 нижче 20). */
export const HUNGER_HEALTH_PER_HOUR = -2;
export const HUNGER_HEALTH_THRESHOLD = 25;

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
/** Нижче цього значення ввечері персонаж забирає кошеня з притулку (правка автора 2026-10-22: було 30). */
export const KITTEN_SANITY_THRESHOLD = 35;
/** Межа падіння: при втраті кота й у «Пригніченості». */
export const SANITY_FLOOR = 10;
/**
 * Невидимий захист першого тижня (§8.3, правка автора 2026-10-22): поки в домі ще не з'являвся кіт,
 * здоровий глузд не опускається нижче 1%. Перший кіт знімає захист назавжди.
 */
export const FIRST_WEEK_PROTECTION = { days: 7, floor: 1 };
/** Вік примусового кошеняти в тижнях (§6.2). */
export const KITTEN_AGE_WEEKS = 1;

/** Множники й ціни за складністю (§5.2). */
export const DIFFICULTY: Record<
  Difficulty,
  { earnings: number; catSanity: number; newCatSanity: number; lostCatSanity: number; givenCatSanity: number }
> = {
  easy: { earnings: 1.25, catSanity: 1.25, newCatSanity: 62, lostCatSanity: -20, givenCatSanity: -12 },
  normal: { earnings: 1, catSanity: 1, newCatSanity: 50, lostCatSanity: -25, givenCatSanity: -15 },
  hard: { earnings: 0.8, catSanity: 0.8, newCatSanity: 40, lostCatSanity: -31, givenCatSanity: -19 },
};
/** Віддати кота протягом 7 днів після появи — втратити весь бонус за нього (§9.8). */
export const GIVE_AWAY_GRACE_DAYS = 7;

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
export const MEAL_SATIETY: Record<Quality, number> = { cheap: 40, premium: 55 };
/** Гігієна за душ залежно від засобів гігієни (§6.4); none — без засобів. */
export const SHOWER_HYGIENE: Record<Quality | "none", number> = { none: 8, cheap: 60, premium: 80 };

// Економіка (§6.4, чернетка).
/** Запаси: скільки порцій чи душів в упаковці й скільки вона коштує в магазині. */
// Котячий корм — порції (мішок на 56, §6.4); наповнювач — чистки лотка (§9.12): дешевий пакет на 7 чисток,
// дорогий на 4, обидва — приблизно на кота на тиждень.
export const PRODUCTS: Record<Product, { units: Record<Quality, number>; price: Record<Quality, number> }> = {
  food: { units: { cheap: 21, premium: 21 }, price: { cheap: 40, premium: 80 } },
  hygiene: { units: { cheap: 14, premium: 14 }, price: { cheap: 15, premium: 35 } },
  catFood: { units: { cheap: 56, premium: 56 }, price: { cheap: 100, premium: 200 } },
  sterileFood: { units: { cheap: 56, premium: 56 }, price: { cheap: 120, premium: 220 } },
  litter: { units: { cheap: 7, premium: 4 }, price: { cheap: 8, premium: 15 } },
  pills: { units: { cheap: 5, premium: 5 }, price: { cheap: 15, premium: 35 } },
  drops: { units: { cheap: 3, premium: 3 }, price: { cheap: 12, premium: 30 } },
  humanMeds: { units: { cheap: 5, premium: 5 }, price: { cheap: 20, premium: 45 } },
  treats: { units: { cheap: 20, premium: 20 }, price: { cheap: 15, premium: 35 } },
  collar: { units: { cheap: 1, premium: 1 }, price: { cheap: 10, premium: 25 } },
  bell: { units: { cheap: 1, premium: 1 }, price: { cheap: 5, premium: 5 } },
  shampoo: { units: { cheap: 5, premium: 5 }, price: { cheap: 10, premium: 25 } },
  detergent: { units: { cheap: 4, premium: 4 }, price: { cheap: 10, premium: 25 } },
};
/** На старті вдома лише їжа й трохи засобів гігієни, без ліків (§6.4, правило автора 2026-10-20). */
export const START_SUPPLIES: Record<Product, Record<Quality, number>> = {
  food: { cheap: 6, premium: 0 },
  hygiene: { cheap: 3, premium: 0 },
  catFood: { cheap: 0, premium: 0 },
  sterileFood: { cheap: 0, premium: 0 },
  litter: { cheap: 0, premium: 0 },
  pills: { cheap: 0, premium: 0 },
  drops: { cheap: 0, premium: 0 },
  humanMeds: { cheap: 0, premium: 0 },
  treats: { cheap: 0, premium: 0 },
  collar: { cheap: 0, premium: 0 },
  bell: { cheap: 0, premium: 0 },
  shampoo: { cheap: 0, premium: 0 },
  detergent: { cheap: 0, premium: 0 },
};
/** Наповнення сховища (§6.4): межі часток для станів «мало», «половина», «багато»; порожньо — 0, ущерть — 1. */
export const FILL_STAGES = [0.45, 0.75, 1] as const;
/** Скільки кожного запасу вміщує його сховище (§6.4): кратно десяти, щонайменше 10. */
export const STORAGE_LIMITS: Record<Product, number> = {
  food: 40,
  hygiene: 30,
  catFood: 110,
  sterileFood: 110,
  litter: 20,
  pills: 10,
  drops: 10,
  humanMeds: 10,
  treats: 40,
  collar: 10,
  bell: 10,
  shampoo: 10,
  detergent: 10,
};
/** Стартовий пакет кота з притулку (§9.12): порції дешевого корму й чистки дешевого наповнювача. */
export const SHELTER_STARTER_PACK = { catFood: 8, litter: 7 };
/** Доставка коштує 110% від базової ціни. */
export const DELIVERY_PRICE = 1.1;
export const DELIVERY_HOURS = 6;
/** Якщо персонаж спатиме, коли прибуде пакунок, його привезуть о 09:00 наступного дня. */
export const DELIVERY_NEXT_DAY_MINUTE = 9 * MINUTES_PER_HOUR;
/** Комунальні за тиждень: базова сума без внеску речей; стартовий куток додає 6 (§6.4). */
export const UTILITIES_BASE = 34;
/** Речі для котів (§6.4): ціна в магазині й внесок у комунальні за тиждень. */
export const THINGS: Record<ThingKind, { price: Record<Quality, number>; utilities: number }> = {
  bowl: { price: { cheap: 10, premium: 25 }, utilities: 1 },
  water: { price: { cheap: 10, premium: 25 }, utilities: 1 },
  litter: { price: { cheap: 25, premium: 60 }, utilities: 4 },
  toy: { price: { cheap: 10, premium: 30 }, utilities: 0 },
  house: { price: { cheap: 60, premium: 150 }, utilities: 6 },
  scratcher: { price: { cheap: 60, premium: 150 }, utilities: 6 },
  carrier: { price: { cheap: 30, premium: 80 }, utilities: 0 },
  feeder: { price: { cheap: 120, premium: 250 }, utilities: 8 },
  fountain: { price: { cheap: 60, premium: 140 }, utilities: 6 },
  robot: { price: { cheap: 300, premium: 600 }, utilities: 10 },
};
/** Подертий диван: ремонт до найближчого платежу (§6.4). */
export const SOFA_REPAIR = 3;
/** Куди лягає привезена іграшка: на підлогу біля дверей. */
export const DELIVERED_TOY_AT = { x: 9.5, y: 9.3 } as const;

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
/** Пошук роботи — неприємне завдання (§8.1, §8.6): здоровий глузд за годину, як у стажера. */
export const WORK_SANITY_PER_HOUR = -6;
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
/** Брудний одяг на відеодзвінку (§5.1, §8.7): штраф у «годинах роботи»; на якій хвилині колеги це помічають. */
export const CALL_DIRTY_CLOTHES = { reputation: 0.5, noticeMinute: 5 } as const;
export const HIGH_HYGIENE = 75;
/** Після звільнення — 24 години пошуку роботи за комп'ютером (§8.6). */
export const JOB_SEARCH_HOURS = 24;

/** Посади від стажера до директора (§8.6, чернетка). Терпіння й здоровий глузд (робота — неприємне, §8.1) — за годину. */
export const POSITIONS: readonly {
  pay: number;
  patienceDecay: number;
  patienceRecovery: number;
  reputation: number;
  sanity: number;
}[] = [
  { pay: 10, patienceDecay: 25, patienceRecovery: 58, reputation: 3.09, sanity: -6 },
  { pay: 13, patienceDecay: 28, patienceRecovery: 52, reputation: 1.59, sanity: -6.5 },
  { pay: 17, patienceDecay: 31, patienceRecovery: 46, reputation: 0.99, sanity: -7 },
  { pay: 22, patienceDecay: 34, patienceRecovery: 42, reputation: 0.65, sanity: -7.5 },
  { pay: 28, patienceDecay: 37, patienceRecovery: 37, reputation: 0.46, sanity: -8 },
  { pay: 35, patienceDecay: 40, patienceRecovery: 33, reputation: 0.34, sanity: -8.5 },
  { pay: 43, patienceDecay: 43, patienceRecovery: 29, reputation: 0.25, sanity: -9 },
  { pay: 52, patienceDecay: 46, patienceRecovery: 25, reputation: 0.19, sanity: -9.5 },
  { pay: 62, patienceDecay: 49, patienceRecovery: 21, reputation: 0.14, sanity: -10 },
  { pay: 75, patienceDecay: 52, patienceRecovery: 17, reputation: 0.1, sanity: -10.5 },
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
/**
 * Риси, що раніше лише проявлялися (ревізія 2026-10-22, `TRAITS.md`): «Балакучість» — частота нявкання
 * ±50% за одиницю (−2 мовчить); «Хвостик» — «+» ходить слідом довше на 50% за одиницю, «−» не ходить
 * слідом; «Жебракування» — після їди просить ще з шансом 30% за одиницю; «Ветеринар» — втрата любові
 * від огляду ∓50% за одиницю; «Мітки» — шанс мітити ±50% за одиницю, а схильний мітить і від стресу
 * (настрій нижче 30), навіть стерилізований.
 */
export const TRAIT_EFFECTS = { talkativeStep: 0.5, followerStep: 0.5, beggingChance: 0.3, vetStep: 0.5, markingStep: 0.5, stressMarkMood: 30 } as const;
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
/** Кіт чує, як насипають корм (§9.12): з якого голоду біжить до миски; «Апетит» зсуває поріг на 10 за одиницю. */
export const FOOD_SOUND = { hunger: 50, appetiteStep: 10 } as const;
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
export const MESS_SANITY: Record<MessKind, number> = { surprise: -4, vomit: -4, hairball: -4, litter: -2, broken: -2, fur: -2, mark: -3 };

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
/** Брудний лоток (§9.12): любов за похід у брудний лоток; «Вибагливість до лотка» ±25% за одиницю до штрафів. */
export const DIRTY_LITTER = { love: -1, pickyStep: 0.25 } as const;
/**
 * Кіт на руках (§9.12, «Коліна»): хто любить руки — настрій за хвилину за одиницю риси й менше потреби
 * в увазі; хто пручається — настрій за хвилину за одиницю «−», шанс укусу за хвилину (база й крок за
 * одиницю «−»), шанс вирватися й утекти після укусу.
 */
export const CARRY = { mood: 0.5, attention: 5, struggleMood: -0.5, bite: 0.1, biteStep: 0.1, escape: 0.25 } as const;
/** Чистюлі («Вибагливість до лотка» від +1) не йдуть на руки в брудному одязі й відходять на кілька клітинок (§9.12). */
export const DIRTY_CLOTHES_CATS = { picky: 1, backAway: 3 } as const;
/** Заздрісність (§9.12): настрій і стосунки за одиницю риси, коли іншому котові щось перепало; бачить за стільки клітинок. */
export const ENVY = { mood: -2, relation: -4, glad: 1, sight: 5 } as const;
/** Мстивість (§9.12): скільки триває образа, шанс помсти за годину за одиницю, ласощі незлопам'ятним. */
export const REVENGE = { minutes: 240, perHour: 0.1, refundStep: 0.25 } as const;
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
  toleranceMinutes: 5,
  toleranceStep: 0.5,
  minToleranceMinutes: 2,
  biteChancePerMinute: 0.3,
  /** Правка автора 2026-10-22: було −1. */
  biteHealth: -3,
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
  /** Ранкова побудка ще в межах вікна сну чи до півночі — пів години сну, і персонаж засинає знову. */
  lostMinutes: 30,
  /** Нічна побудка — година сну, і персонаж засинає знову: день починає лише ранкова (правка автора 2026-10-22). */
  nightLostMinutes: 60,
} as const;

// Гра й бешкет (§9.12, чернетка).
/** Іграшка: скільки ігор витримує; гра наодинці триває кілька хвилин. */
export const TOY = { durability: { cheap: 15, premium: 40 } as Record<Quality, number>, aloneMinutes: 4 } as const;
/** Гра з персонажем: за хвилину. Нижче `bored` потреби гри кіт іде. */
export const PLAY = { sanity: 2.5, playfulStep: 0.25, mood: 1, love: 0.5, needPerMinute: 15, bored: 10 } as const;
/** Ваги варіантів, коли кіт хоче гратися; риса додає 50% за одиницю. */
export const MISCHIEF = { zoomies: 0.3, knock: 0.3, steal: 0.2, toy: 0.5, wander: 0.5, scratch: 0.3, traitStep: 0.5 } as const;
/** Кігтеточка чи диван (§9.12): шанс обрати кігтеточку, крок «Дряпання», тривалість, скільки гри знімає. */
export const SCRATCH = { premium: 0.9, cheap: 0.6, traitStep: 0.2, minutes: 2, relief: 30, mood: 1 } as const;
/** Хвороби прототипу (§9.5): безпечний термін, шкода за день, лікування, заразність. */
export const DISEASES: Record<
  DiseaseId,
  {
    safe: number;
    damage: number;
    cure: { kind: Medicine; doses: number } | { kind: "diet"; portions: number } | { kind: "calm"; days: number } | { kind: "vet" } | { kind: "control"; medicine: Medicine };
    contagious: "friends" | "litter" | null;
  }
> = {
  cold: { safe: 3, damage: 2, cure: { kind: "pills", doses: 4 }, contagious: "friends" },
  fleas: { safe: 5, damage: 1, cure: { kind: "drops", doses: 1 }, contagious: "friends" },
  worms: { safe: 5, damage: 2, cure: { kind: "pills", doses: 1 }, contagious: "litter" },
  stomach: { safe: 2, damage: 2, cure: { kind: "diet", portions: 4 }, contagious: null },
  injury: { safe: 3, damage: 1, cure: { kind: "vet" }, contagious: null },
  cystitis: { safe: 3, damage: 2, cure: { kind: "calm", days: 2 }, contagious: null },
  conjunctivitis: { safe: 4, damage: 1, cure: { kind: "drops", doses: 2 }, contagious: "friends" },
  senior: { safe: 0, damage: 1, cure: { kind: "control", medicine: "pills" }, contagious: null },
  urolithiasis: { safe: 1, damage: 6, cure: { kind: "vet" }, contagious: null },
  dermatitis: { safe: 5, damage: 1, cure: { kind: "vet" }, contagious: null },
};
/** Шанси захворіти (§9.5): за ніч, за подію чи за тиждень. */
export const ILLNESS = {
  cold: 1 / 60,
  conjunctivitis: 1 / 100,
  afterCold: 0.3,
  shelterFleas: 0.2,
  escapeFleas: 0.3,
  stolenWorms: 0.1,
  stolenStomach: 0.25,
  /** Стерилізований кіт на звичайному кормі (§9.8). */
  regularFoodStones: 0.03,
  cheapFoodStomach: 0.01,
  cystitisMood: 25,
  cystitis: 0.15,
  calmMood: 40,
  seniorPerWeek: 0.5,
  friendContagion: 0.2,
  otherContagion: 0.05,
  litterContagion: 0.1,
  hardinessStep: 0.1,
  difficulty: { easy: 0.8, normal: 1, hard: 1.25 } as Record<Difficulty, number>,
  moodPerDay: -3,
} as const;
/** Симптоми (§9.5): множники потреб і руху, шанси. */
export const SYMPTOMS = {
  tired: 1.3,
  fleasSleep: 0.8,
  wormsHunger: 1.3,
  cystitisToilet: 2,
  limp: 0.6,
  stomachVomit: 0.3,
  outsideLitter: 0.3,
  /** Скільки разів на годину видно чхання, свербіж, тертя очей. */
  showPerHour: 2,
} as const;
/** Ліки вдома (§9.5): дешева доза діє з шансом 70%; дати ліки — неприємне завдання, любов −1. */
export const MEDICINE = { cheapWorks: 0.7, sanity: -2, love: -1 } as const;
/** Поїздки (§8.5): дорога за звичайної швидкості й подія на місці, у хвилинах; котові — переноска. */
export const TRIPS: Record<Destination, { road: number; visit: number; cat: boolean }> = {
  breeder: { road: 120, visit: 60, cat: false },
  shop: { road: 45, visit: 30, cat: false },
  vet: { road: 60, visit: 60, cat: true },
  doctor: { road: 60, visit: 60, cat: false },
  shelter: { road: 75, visit: 60, cat: false },
  groomer: { road: 45, visit: 90, cat: true },
  cafe: { road: 30, visit: 60, cat: false },
  office: { road: 60, visit: 180, cat: false },
  show: { road: 90, visit: 180, cat: true },
};
/** Гонка (§8.5): швидкість, газ і гальмо, смуги, інші машини. */
export const RACE = {
  minSpeed: 0,
  maxSpeed: 10,
  startSpeed: 0,
  /** Газ: на скільки росте швидкість за ігрову хвилину. */
  acceleration: 0.5,
  /** Без газу швидкість поступово падає, гальмо — швидше (за ігрову хвилину). */
  coasting: 0.25,
  braking: 2,
  /** Найдовший крок перевірки зіткнень, в ігрових хвилинах: на ×10 машини не проскакують одна крізь одну. */
  step: 0.01,
  lanes: 3,
  /** Скільки смуг за ігрову хвилину перестроюється машина. */
  laneSpeed: 8,
  /** Інші машини їдуть зі швидкістю ×0,5 від звичайної. */
  carSpeed: 0.5,
  /** Середній проміжок між машинами на середній складності, у хвилинах дороги. */
  gap: 1.5,
  traffic: { easy: 0.8, normal: 1, hard: 1.25 } as Record<Difficulty, number>,
  /** Довжина машини: ближче — зіткнення. */
  carLength: 0.15,
  /** Наскільки далеко вперед видно машини. */
  view: 2.5,
} as const;
/** Аварія (§8.5): шанс кожної втрати й найбільше втрат за складністю, розмір втрат. */
export const ACCIDENT = {
  chance: { easy: 0.4, normal: 0.5, hard: 0.625 } as Record<Difficulty, number>,
  max: { easy: 2, normal: 3, hard: 4 } as Record<Difficulty, number>,
  repair: 60,
  health: -10,
  sanity: -10,
  catMood: -20,
  /** Поки день перемотується, показники не опускаються нижче цього. */
  floor: 5,
} as const;
/** Посадити кота в переноску (§8.5): настрій за якістю й «Переноску». */
export const CARRIER_MOOD = { cheap: -5, premium: -2, traitStep: 3 } as const;
/** Штраф за годину поїздки в робочий час (§8.6): кількість поїздок за 7 днів × репутація за годину / 3. */
export const TRIP_REPUTATION_DIVIDER = 3;
/** Пункти призначення (§8.5). */
export const VET = { exam: 40, cheap: 30, premium: 80, cheapWorks: 0.7, treatMinutes: 60, controlDays: 7, love: -3 } as const;
/** Побут (§8.7): шерсть, пилосос, прання, техніка, поломки. */
export const START_CLOTHES = 5;
export const HOUSEHOLD = {
  furPerCatHour: 0.5,
  longFur: 2,
  sheddingStep: 0.5,
  dirtyFur: 50,
  furHygiene: 1.2,
  noClothesHygiene: 2,
  /** Вище цієї гігієни персонаж у брудному одязі не стає навіть після душу. */
  noClothesHygieneCeiling: 60,
  vacuumMinutes: 10,
  vacuumSanity: -2,
  washMinutes: 60,
  clothesDays: { cheap: 7, premium: 8 } as Record<Quality, number>,
  feederMinutes: [8 * 60, 19 * 60],
  robotMinute: 12 * 60,
  /** Скільки хвилин робот-пилосос їздить квартирою: усі кімнати за годину. */
  robotMinutes: 60,
  breakPerUse: 1 / 150,
  applianceBreakPerDay: 0.02,
  difficulty: { easy: 0.8, normal: 1, hard: 1.25 } as Record<Difficulty, number>,
} as const;
/** Жіночий цикл (§4.1, `DAY_MODIFIERS.md`): 28 днів; менструація 1–5, приплив енергії 10–14. */
export const CYCLE = {
  days: 28,
  period: { from: 1, to: 5, move: 0.9, dash: 1.25, hygiene: 1.2 },
  energy: { from: 10, to: 14, move: 1.1, dash: 0.75 },
} as const;
/** Борода (§5.1): гоління — охайно 2 дні, борода відростає за 4; підрівнювання тримає вигляд 3 дні. */
export const BEARD = { neatAfterShave: 2, grows: 4, neatAfterTrim: 3, shaveMinutes: 10, trimMinutes: 5, impression: 0.5 } as const;
/** Ласощі (§7): настрій, любов, повернення втрати після неприємного, межа на день. */
export const TREATS = { mood: { cheap: 3, premium: 5 } as Record<Quality, number>, love: 2, hurtMinutes: 60, refund: 0.5, perDay: 2, stomach: 0.2 } as const;
/** Нашийник (§9.10): настрій за день, шанс загубити дешевий, дзвіночок дратує чутливих. */
export const COLLAR = { mood: { cheap: -0.5, premium: 0.5 } as Record<Quality, number>, lose: 0.05, bellMood: -1 } as const;
/** Купання (§8.7): неприємне ловити й купати; водолаз — радіє, решта — ні; безшерстим — щотижня. */
export const BATH = { catchSanity: -3, bathSanity: -3, minutes: 10, loverMood: 5, mood: -5, love: -2, scratch: 0.3, hairlessDays: 7, dermatitis: 0.3 } as const;
/** Розмноження (§9.8): вагітність, виводок, тічка, мітки, віддати кота. */
export const BREEDING = {
  pregnancy: 0.3,
  minAge: 2,
  friendWeight: 2,
  /** Розмір виводку 1–4: ваги. */
  litter: [0.25, 0.35, 0.25, 0.15],
  restDays: 14,
  nursingDays: 7,
  nursingHunger: 1.5,
  pregnantHunger: 1.5,
  symptomsFromDay: 3,
  heatDays: 3,
  heatEvery: 14,
  heatWake: 0.3,
  escapeBonus: 0.25,
  markPerHour: 1 / 72,
  fightFactor: 1.5,
} as const;
/** «Природа й виховання» (§9.8): шанс, що нова риса кошеняти — від батьків. */
export const INHERIT_TRAIT_CHANCE = 0.5;
/** Стерилізація (§9.8): ціна, операція, відновлення. */
export const STERILIZATION = { price: 120, minutes: 120, recoveryDays: 3, mood: -10, recoveryMoodPerDay: -2, recoveryFatigue: 1.5 } as const;
export const DOCTOR = { exam: 40 } as const;
export const SHELTER = {
  price: 50,
  cats: 3,
  minAge: 1,
  maxAge: 5,
  visibleTraits: { easy: 3, normal: 2, hard: 1 } as Record<Difficulty, number>,
  /** Від 3 тижнів кіт із притулку вже стерилізований з імовірністю 50% (§9.8). */
  sterilizedFromAge: 3,
  sterilized: 0.5,
  /** Порода: 10%, навпіл чистокровний і напівкровка (§8.5). */
  breed: 0.1,
} as const;
/** Розплідник (§9.11): 3 чистокровні кошенята однієї породи тижня, вік 2 тижні. */
export const BREEDER = { cats: 3, age: 2 } as const;
export const GROOMER = { price: { cheap: 40, premium: 90 } as Record<Quality, number>, days: { cheap: 7, premium: 14 } as Record<Quality, number>, mood: { cheap: -5, premium: -3 } as Record<Quality, number> } as const;
export const CAFE = { pricePerHour: 20, sanity: [12, 6, 3], jealousyMood: -5 } as const;
/** Вікно ціни в магазині за складністю (§6.4). */
/** Скільки однакових іграшок можна взяти в кошик за раз (§6.4): місця їм не треба. */
export const SHOP_TOYS_PER_ORDER = 5;
export const SHOP_WINDOW: Record<Difficulty, { min: number; max: number }> = {
  easy: { min: -0.3, max: 0.1 },
  normal: { min: -0.2, max: 0.2 },
  hard: { min: -0.1, max: 0.3 },
};
/** Модифікатори (§4.1, `DAY_MODIFIERS.md`): вибір і ефекти (чернетка). */
export const MODIFIERS = {
  noneShare: 1 / 3,
  hardShare: { easy: 0.4, normal: 0.5, hard: 0.6 } as Record<Difficulty, number>,
  weekShare: 0.5,
  foundling: 0.03,
  foundlingGapDays: 14,
  /** Віднести знайду в притулок — 2 години (§4.1). */
  foundlingShelterMinutes: 120,
  deadline: { decay: 2, reputation: 1.5 },
  lull: { decay: 0.5, reputation: 0.5 },
  meeting: { from: 14 * 60, minutes: 60, attended: 0.5, present: 1.5, absent: -5 },
  lunch: { from: 12 * 60, to: 14 * 60 },
  pay: { "pay-delay": 0.5, bonus: 1.5, "fast-internet": 1.25 } as Record<string, number>,
  reprimand: -3,
  praise: 3,
  fullMoonPlay: 1.5,
  rainFatigue: 1.3,
  festival: { minute: 21 * 60, hideMinutes: 60, mood: -5, wake: 0.3 },
  quietEvening: { minute: 20 * 60, mood: 2 },
  vaccineDays: 7,
  vaccineIllness: 1.5,
  homeVetMinute: 11 * 60,
  heat: { thirst: 1.5, fatigue: 1.2, hygiene: 1.2 },
  coldWarmth: 3,
  renovation: { unpleasant: 1.2, catMoodPerHour: -0.5 },
  neighborsAway: 0.8,
  outage: { from: 11 * 60, to: 15 * 60 },
  inspection: { minute: 15 * 60, mess: 5, litter: 5, fur: 10 },
  recalculation: 10,
  guests: { minute: 19 * 60, mess: -3, max: -15, hideMinutes: 120 },
  friend: { from: 10 * 60, to: 16 * 60 },
  noisyWake: { min: 60, max: 120 },
  vigor: 1.15,
  call: { from: 10 * 60, to: 20 * 60, minutes: 30, ignored: -5 },
  traffic: { traffic: 1.5, "empty-roads": 0.6 } as Record<string, number>,
  catFoodPrice: { "food-price-up": 1.3, "pet-sale": 0.7 } as Record<string, number>,
  show: { fee: 20, mood: -5, prizes: [{ score: 1, money: 300, sanity: 10 }, { score: 0.8, money: 150, sanity: 5 }, { score: 0.6, money: 60, sanity: 0 }] },
  officeAbsent: -5,
  week: {
    decay: { "deadline-week": 1.5, "quiet-week": 0.7 } as Record<string, number>,
    vacationPayHours: 3,
    vacationMinute: 18 * 60,
    catMarch: { heatEvery: 7, pregnancy: 0.5 },
    calmPregnancy: 0.1,
    catIllness: { "cat-flu": 1.5, "cat-prevention": 0.5 } as Record<string, number>,
    humanFlu: 0.1,
  },
} as const;
/** Фінал і статистика (§4.2): щасливі — від 60% середнього настрою, страждали — нижче 40%. */
export const HAPPY_LIFE = 60;
export const SUFFERED_LIFE = 40;
/** Спостереження (§9.9): скільки проявів риси треба побачити, щоб відкрити її; рівні — на кожній третині. */
export const OBSERVATIONS: Record<Difficulty, number> = { easy: 3, normal: 6, hard: 9 };
/** Свідок — у тій самій кімнаті або ближче цього (у проході між кімнатами). */
export const WITNESS_DISTANCE = 3;
/**
 * Хвороби персонажа (§6.5): безпечний термін, шкода, скільки днів із ліками лікує, за скільки днів
 * минає сама (null — лише відпочинок чи лікування), лікарняний.
 */
export const ILLNESSES: Record<IllnessId, { safe: number; damage: number; doses: number | null; recovers: number | null; sickLeave: number }> = {
  // Правка автора 2026-10-22: шкода з першої ночі (було 3 безпечні дні), застуда −4, травма −3, виснаження −5 (було −2, −1, −2);
  // застуда й травма минають самі за 7 і 10 днів (було — ніколи).
  cold: { safe: 0, damage: 4, doses: 3, recovers: 7, sickLeave: 2 },
  injury: { safe: 0, damage: 3, doses: 4, recovers: 10, sickLeave: 1 },
  exhaustion: { safe: 0, damage: 5, doses: null, recovers: null, sickLeave: 3 },
};
export const ILLNESS_EFFECTS = {
  /** Застуда й травма сповільнюють рух; травма з річчю в руках — ще більше. */
  slow: 0.8,
  carrySlow: 0.8,
  /** Правка автора 2026-10-22: було 10% — бот травмувався більшу частину часу. */
  injuryOnStun: 0.05,
  difficulty: { easy: 0.8, normal: 1, hard: 1.25 } as Record<Difficulty, number>,
  shortSleepHours: 7,
  shortNights: 3,
  restHours: 8,
  restNights: 2,
  medsWork: 0.7,
} as const;
/** Лікар (§6.5): лікування дешеве чи дороге, здоров'я після лікування. */
export const DOCTOR_TREAT = { cheap: 30, premium: 80, cheapWorks: 0.7, health: 10 } as const;
/** Смерть кота (§9.2, §9.5): нульове здоров'я ввечері — 60%; понад межу віку — 20% + 10% за тиждень − 5% за «Довголіття». */
export const DEATH = { zeroHealth: 0.6, ageBase: 0.2, ageStep: 0.1, longevityStep: 0.05 } as const;
/** Стосунки між котами (§9.4). */
export const RELATIONS = {
  friend: 50,
  enemy: -50,
  sociabilityStep: 10,
  kittenBonus: 20,
  motherKitten: 50,
  siblings: 30,
  nightly: 0.5,
  wrestle: { weight: 0.6, minutes: 3, play: 40, mood: 2, relation: 1 },
  groom: { chance: 0.3, step: 0.15, distance: 3, minutes: 3, mood: 1, relation: 2 },
  sleepTogether: { weight: 3, distance: 1, perHour: 0.5 },
  fight: { distance: 1.5, perMinute: 0.05, territorialStep: 0.025, minutes: 2, mood: -3, relation: -5, injury: 0.25, separateSanity: -3 },
  enemyMoodPerHour: -0.5,
  resource: { chance: 0.15, territorialStep: 0.1, relation: -3 },
  jealousy: -1,
} as const;
/** Вага будиночка як місця для сну (§9.12). */
export const HOUSE_SLEEP: Record<Quality, number> = { cheap: 2, premium: 4 };
/** Зумі: утричі швидше 1–2 хвилини; після лотка — шанс 30%. Збиває персонажа на шляху. */
export const ZOOMIES = { speed: 3, minMinutes: 1, maxMinutes: 2, afterToilet: 0.3, hit: 0.5 } as const;
/** Скільки гри знімає забава наодинці. */
export const PLAY_RELIEF = 50;
/** Украдена страва знімає голод (§9.12). */
export const STEAL_HUNGER = 50;
/** Голодний кіт із порожньою мискою краде їжу: 25% за одиницю «Злодійства», дуже голодний (від 95) — ще 15%. */
export const HUNGRY_THEFT = { step: 0.25, base: 0.15, starving: 95 } as const;
/** Кіт і робота: клавіатура, коліна (§9.12). */
export const WORK_CAT = {
  keyboardStep: 0.35,
  lapBase: 0.5,
  lapStep: 0.25,
  keyboardMinMinutes: 10,
  keyboardMaxMinutes: 20,
  lapSanity: 1,
  lapMood: 0.5,
  lapLove: 0.2,
  lapAttention: 5,
} as const;
/** Сон на комп'ютері: вага 1 + 2 × «Теплолюбність» + 2 × «Робочий помічник». */
export const COMPUTER_SLEEP = { base: 1, step: 2 } as const;
/** Прогнали з місця (§9.12). */
export const SHOO = { mood: -3, love: -2 } as const;
/** Шерстяна грудка: раз на 3 дні, уночі вдвічі частіше, довгошерсті вдвічі частіше, риса ±50%. */
export const HAIRBALL = { perHour: 1 / 72, night: 2, longHair: 2, step: 0.5 } as const;
/** Блювота після їжі: 20% за одиницю «Швидкості їжі». */
export const VOMIT_STEP = 0.2;
/** Оглушення: спіткнувся об кота, посковзнувся, збило зумі (§9.12). */
export const STUN_MINUTES = 0.5;
export const SLIP_CHANCE = 0.5;
/** Тертя об ноги: персонаж повільніший; щохвилини руху шанс спіткнутися 10% + 10% за одиницю. */
export const LEGS = { slow: 0.7, tripBase: 0.1, tripStep: 0.1, distance: 0.6 } as const;
/** Втеча в двері (§9.12): кіт ближче 4 клітинок, шанс 10% + 25% за одиницю «Втеч»; повертається о 22:00. */
export const ESCAPE = { distance: 4, base: 0.1, step: 0.25, returnMinute: 22 * MINUTES_PER_HOUR, returnMood: -10, catchSanity: -3 } as const;
