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
/** Страва на плиті підгорає: від того, як поставили сиру, за складністю (правка автора 2026-10-23: було +15 для всіх). */
export const BURN_MINUTES: Record<Difficulty, number> = { easy: COOK_MINUTES + 45, normal: COOK_MINUTES + 30, hard: COOK_MINUTES + 15 };
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
  // Котяча м'ята й мататабі (§9.12, «Котяча м'ята», 2026-10-26): по 5 разів.
  catnip: { units: { cheap: 5, premium: 5 }, price: { cheap: 15, premium: 30 } },
  // Мамині судочки (§4.1, §6.4, рішення автора 2026-10-26): пакет від мами — 2 судочки; не продаються (`UNSOLD`), ціни немає.
  momMeal: { units: { cheap: 2, premium: 2 }, price: { cheap: 0, premium: 0 } },
};
/** Запаси, яких немає в магазині (§6.4): мамині судочки — лише від мами (§4.1, рішення автора 2026-10-26). */
export const UNSOLD: readonly Product[] = ["momMeal"];
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
  catnip: { cheap: 0, premium: 0 },
  momMeal: { cheap: 0, premium: 0 },
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
  catnip: 10,
  // Мамині судочки в холодильнику (§6.4, рішення автора 2026-10-26).
  momMeal: 10,
};
/** Стартовий пакет кота з притулку (§9.12): порції дешевого корму й чистки дешевого наповнювача. */
export const SHELTER_STARTER_PACK = { catFood: 8, litter: 7 };
/**
 * Доставка (§6.4, правка автора 2026-10-23): ціни в каталозі базові, доставка — окремо: 10% бази
 * кожного товару й надбавка за замовлення, що залежить лише від складності.
 */
export const DELIVERY = { share: 0.1, fee: { easy: 8, normal: 10, hard: 12 } as Record<Difficulty, number> } as const;
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
  // Замок на шафку з кормом (§9.12, «Кмітливість у бешкеті»): дешевий «Зломник» інколи відчиняє, надійний — ні.
  lock: { price: { cheap: 15, premium: 40 }, utilities: 0 },
};
/** Скільки порцій уміщує автогодівниця (§9.12, правка автора 2026-10-23): дешева — ~4 дні одному коту, дорога — ~10. */
export const FEEDER_CAPACITY: Record<Quality, number> = { cheap: 8, premium: 20 };
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
/**
 * Пошук роботи після звільнення (§8.6, правка автора 2026-10-23): години за комп'ютером за складністю
 * (було 24 для всіх); здоровий глузд — частка від роботи на найнижчій посаді; етапів однієї вакансії.
 */
export const JOB_SEARCH = { hours: { easy: 16, normal: 20, hard: 24 } as Record<Difficulty, number>, sanityShare: 0.5, stages: 4 } as const;

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
  /** Правка автора 2026-10-23: було 10 — коти хотіли гратися надто рідко. */
  play: 15,
};
/** Кіт іде задовольняти потребу, щойно вона сягає порогу (§9.12). */
export const NEED_THRESHOLD = { hunger: 80, thirst: 60, toilet: 80, attention: 60, play: 70 } as const;
/** Сон знімає втому за годину; засинає від 40 + 40 × активність, прокидається на 10, сон щонайменше 30 хвилин. */
export const SLEEP_RECOVERY_PER_HOUR = 5;
export const SLEEP_START = { base: 40, activity: 40 } as const;
/**
 * «Енергійність» (рішення автора 2026-10-25, §9.12): засинає від 40 + 40 × активність × (1 + `sleepStep` × рівень),
 * не вище `maxThreshold` — енергійний майже не дрімає ввечері, спокійний дрімає й у години пік; сумарно сну стільки ж.
 * Задрімав у годину з активністю від `activeHour` на очах персонажа — прояв «−», раз на день. Енергійний, якому
 * потреба гри дійшла до 100, нудьгує: скидає речі й дере кігтями в `bored` раза охочіше.
 */
export const ENERGY = { sleepStep: 0.2, maxThreshold: 95, activeHour: 1, bored: 1.5 } as const;
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
 * Риси, що раніше лише проявлялися (ревізія 2026-10-22, `TRAITS.md`): «Жебракування» — після їди просить ще з шансом
 * 30% за одиницю; «Ветеринар» — втрата любові від огляду ∓50% за одиницю; «Мітки» — шанс мітити ±50% за одиницю, а
 * схильний мітить і від стресу (настрій нижче 30), навіть стерилізований. «Вимогливість» (рішення автора 2026-10-25,
 * §9.9): ходить слідом довше на `demandingStep`, нявчить частіше на `demandingMeowStep`, без уваги ображається
 * сильніше на `demandingIgnoredStep` — за одиницю. «Балакучість» — `TALKATIVE`.
 */
export const TRAIT_EFFECTS = {
  beggingChance: 0.3,
  vetStep: 0.5,
  markingStep: 0.5,
  demandingStep: 0.25,
  demandingMeowStep: 0.5,
  demandingIgnoredStep: 0.5,
} as const;
/**
 * «Хвостик» (рішення автора 2026-10-25, §9.12): тривалість походу по увагу — лише «Вимогливість», а «Хвостик» —
 * супровід. Персонаж перейшов у іншу кімнату — вільний кіт із «+», що був у тій кімнаті, іде слідом з шансом
 * `chanceStep` за одиницю й `minutes` хвилин тримається поруч (ближче `near` клітинки); зайшов у кімнату за
 * `seenWithin` хвилин — прояв (у нову кімнату, а не в ту, звідки пішов). «−» у поході по увагу доходить лише до
 * виходу зі своєї кімнати в бік персонажа й чекає там: персонаж повернувся, а кіт чекав щонайменше `waited` хвилин —
 * прояв.
 */
export const FOLLOWER = { chanceStep: 0.25, minutes: 5, near: 1.2, seenWithin: 2, waited: 2 } as const;
/**
 * «Балакучість» (§9.12, рішення автора 2026-10-25, `TRAITS_REVIEW.md`). Кіт, що просить, нявкає раз на `meowMinutes`
 * хвилин; «+» — частіше на `step` за одиницю, «Мовчазний» (−1) — `quiet` від звичайного, «Тихоня» (−2 і менше) так само
 * часто, але беззвучно: відкриває рота, а звуку немає. Прояви — за різницею з котом без риси: «+» — нявкнув уже на
 * `seenDifference` разів більше, ніж нявкнув би той за цей час, «−» — за `quietMinutes` хвилин прохання на стільки ж менше.
 * «+» ще й вітається вголос, коли персонаж заходить у кімнату, — з шансом `greet` за одиницю. Прояви кожного боку — не
 * частіше ніж раз на `observeEvery` хвилин: голодний кіт просить годинами. Нявкання ближче `workReach` клітинок до того, хто працює, заважає: здоровий глузд −`workSanity` за
 * одиницю, не більше `workMaxPerHour` за годину.
 */
export const TALKATIVE = {
  meowMinutes: 2,
  step: 0.5,
  quiet: 0.25,
  seenDifference: 2,
  quietMinutes: 10,
  greet: 0.3,
  observeEvery: 60,
  workReach: 3,
  workSanity: 0.15,
  workMaxPerHour: 2,
} as const;
/** «Вимогливість» видно за тривалістю походу (§9.9): довше чи коротше за звичайний на стільки хвилин. */
export const DEMANDING_SEEN_MINUTES = 0.5;
export const APPETITE_STEP = 0.15;
/**
 * «Апетит» (рішення автора 2026-10-25, `TRAITS_REVIEW.md`, §9.12 «Їжа й гігієна»): голод росте ±`APPETITE_STEP` за
 * одиницю; «+» іде їсти раніше — поріг голоду нижчий на `thresholdStep` за одиницю — і, доївши порцію, з'їдає й другу,
 * якщо в мисці ще є корм, з шансом `secondStep` × рівень, не більше `secondMax`. «−» клює: з шансом `halfStep` × |рівень|,
 * не більше `halfMax`, з'їдає пів порції (голод −`PORTION_HUNGER` / 2) і лишає в мисці половину — її доїсть наступний.
 * Стелі — бо британська й бомбейська породи вже мають «Апетит» +1.
 * Перекус (рішення автора 2026-10-26): «+», не голодний (голод від `snackHunger`, але нижче свого порогу), коли вдома в мисці є
 * корм, щоразу, як вирішує, що робити далі, з шансом `snackStep` × рівень іде до миски й з'їдає порцію — уся вона зайва («переїв»,
 * §9.12 «Схильність до повноти»). `snackStep` 0,07 (рішення автора 2026-10-26; було 0,1 — забагато для «інколи»).
 */
export const APPETITE = { thresholdStep: 10, secondStep: 0.1, secondMax: 0.4, halfStep: 0.3, halfMax: 0.8, snackHunger: 30, snackStep: 0.07 } as const;
/**
 * «Швидкість їжі» (рішення автора 2026-10-25, `TRAITS_REVIEW.md`): порція їсться `CAT_ACT_MINUTES.eat` × `factor`^рівень
 * хвилин, від `min` до `max`: «Пилосос» — за мить, «Їсть по зернятку» — довго сидить над мискою. «+» після їжі зригує з
 * шансом `VOMIT_STEP` × рівень, ×`crowded`, коли поруч (до `near` клітинок) їсть інший кіт, і ×`slowBowl` з керамічної
 * (дорогої) миски.
 */
export const GULPING = { factor: 0.7, min: 1.5, max: 6, crowded: 1.5, near: 3, slowBowl: 0.5 } as const;
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
/**
 * «Нічна активність» (рішення автора 2026-10-25, §9.12). «−» уночі обирає ліжко для сну в 1 + `bedStep` × |рівень|
 * раза охочіше; персонаж прокинувся, а кіт спить на ліжку й проспав на ньому щонайменше `bedShare` нічного сну
 * персонажа між `bedFrom` і `bedTo` годиною (а того сну — від `minNightMinutes`) — прояв «−». «+» гасає вночі: зумі й
 * бешкет у нічну годину на очах сови — прояв «+», не частіше ніж раз на `mischiefEvery` хвилин.
 */
export const NOCTURNAL = { bedStep: 0.5, bedShare: 5 / 6, bedFrom: 23, bedTo: 5, minNightMinutes: 180, mischiefEvery: 12 * 60 } as const;

/** Рух кота: клітинок за ігрову хвилину; меблі для кота «дорожчі» за підлогу. */
export const CAT_WALK_TILES_PER_MINUTE = 2.5;
export const FURNITURE_COST = 3;

/** Тривалість дій кота на місці, хвилини (§9.12). */
/** Кіт, що прийшов по увагу, задоволений і йде, щойно потреба уваги нижче цього (§9.12). */
export const ATTENTION_SATISFIED = 20;
export const CAT_ACT_MINUTES = { eat: 3, drink: 1, toilet: 2, beg: 15, attention: 20, idle: 10, wander: 8, hide: 30 } as const;
/** Порція корму знімає 100 голоду; ковток — усю спрагу (§9.12). */
export const PORTION_HUNGER = 100;
/** Кіт чує, як насипають корм (§9.12): з якого голоду біжить до миски; «Апетит» зсуває поріг на 10 за одиницю. */
export const FOOD_SOUND = { hunger: 50, appetiteStep: 10 } as const;
/**
 * «Пиття» (рішення автора 2026-10-25, `TRAITS_REVIEW.md`, §9.12 «Їжа й гігієна»). «+», спраглий і без фонтанчика вдома, з
 * шансом `sinkStep` × рівень сідає на умивальник і просить відкрити кран (до `CAT_ACT_MINUTES.beg` хвилин); відкрили — п'є
 * з крана (спрага 0, настрій +`tapMood`), ні — іде до миски, настрій `bowlMood`. З фонтанчика «+» п'є з радістю
 * (+`fountainMood`); +2 і більше без фонтанчика з шансом `spill` перекидає миску з водою — калюжа. «−» іде пити, щойно воду
 * долили, якщо спрага від `freshThirst`. Сечокам'яна від звичайного корму стерилізованому — × (1 + `stonesStep` × рівень):
 * «+» без фонтанчика п'є мало, «−» — багато; «+» з фонтанчиком — ×1.
 * [Пропозиція] (фінальна перевірка рис 2026-10-26, «П'є зі склянок»): «+» без фонтанчика, що не сів на умивальник, з шансом `mug`
 * п'є з вашого кухля на кухонному столі (кухоль стоїть, «ні» про кухню не пам'ятає): спрага 0, настрій +`mugMood`.
 */
export const DRINKING = { sinkStep: 0.4, tapMood: 2, bowlMood: -1, fountainMood: 1, spill: 0.25, freshThirst: 20, stonesStep: 0.25, mug: 0.5, mugMood: 1 } as const;
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
export const MESS_SANITY: Record<MessKind, number> = { surprise: -4, vomit: -4, hairball: -4, litter: -2, broken: -2, fur: -2, mark: -3, puddle: -1, paper: -1, garbage: -3 };

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
/**
 * «Перебірливість» (рішення автора 2026-10-25, `TRAITS_REVIEW.md`, §9.12 «Їжа й гігієна»): від голоду `starving` «+»
 * відмовляється від дешевого корму вдвічі рідше (×`starvingFactor`) — голод сильніший; перш ніж відійти, `buryMinutes`
 * хвилин «закопує» корм — гребе лапою біля миски. «−» радіє простому корму: настрій +`cheapJoy` × |рівень|.
 */
export const PICKY = { starving: 95, starvingFactor: 0.5, buryMinutes: 1, cheapJoy: 1 } as const;
/**
 * Кіт нюхає корм чи лоток, перш ніж відмовитися (§9.12 «Їжа й гігієна», перевірка етапу 2026-10-25): стільки хвилин
 * він стоїть біля миски чи лотка — видно, що лише понюхав, а не поїв і не сходив.
 */
export const SNIFF_MINUTES = 0.5;
/**
 * «Жебракування» (рішення автора 2026-10-25, `TRAITS_REVIEW.md`): після їди просить ще біля миски з шансом
 * `TRAIT_EFFECTS.beggingChance` × рівень + звичка. Звичка (§7): ласощі котові, що саме просить їсти, додають їй
 * `habitStep` (не більше `habitMax`), щоночі вона згасає на `habitDecay`; так жебраком стає й кіт без риси, а «Не
 * випрошує» (−2 і менше) — ніколи. «+» після ласощів з шансом `treatAsk` × рівень одразу нявчить, просячи ще. «−» після
 * їди `washMinutes` хвилини вмивається; голодний «Не випрошує» при порожній мисці чекає біля неї, а не йде до персонажа.
 */
export const BEGGING = { habitStep: 0.1, habitMax: 0.3, habitDecay: 0.05, treatAsk: 0.3, washMinutes: 2 } as const;
/** «Стресостійкість» змінює втрати настрою на 20% за одиницю (§9.12). */
export const STRESS_STEP = 0.2;
/**
 * Що щасливіший кіт, то менше йому дає приємне (§9.6, правка автора 2026-10-25): вище `from` кожне
 * підвищення настрою множиться на (100 − настрій) / (100 − from).
 */
export const MOOD_SATURATION = { from: 60 } as const;
/** Безлад біля лотка (§9.12): «сюрприз» деінде й розкиданий наповнювач. */
export const SURPRISE_CHANCE = { base: 0.15, step: 0.3 } as const;
/**
 * Брудний лоток (§9.12): любов за похід у брудний лоток; «Вибагливість до лотка» ±`pickyStep` за одиницю до штрафів (рішення
 * автора 2026-10-25: було ±25%, тепер ±50% — «Спартанець» (−2) не ображається зовсім). Від `earlyLevel` лоток для кота
 * брудний на одне відвідування раніше («Принц на горошині»).
 */
export const DIRTY_LITTER = { love: -1, pickyStep: 0.5, earlyLevel: 2 } as const;
/**
 * Кіт на руках (§9.12, «Коліна»): хто любить руки — настрій за хвилину за одиницю риси й менше потреби
 * в увазі; хто пручається — настрій за хвилину за одиницю «−», шанс укусу за хвилину (база й крок за
 * одиницю «−»), шанс вирватися й утекти після укусу. Прояви (рішення автора 2026-10-25): «+» `seenContent` хвилин
 * муркоче й топчеться на руках, «−» `seenStruggle` хвилин пручається саме через рису (не через образу чи нелюбов) чи
 * вкусив — раз за взяття на руки, але не частіше ніж раз на `observeEvery` хвилин (перевірка етапу 2026-10-25: кота, якого
 * брали й опускали раз у раз, «Коліна» відкривали за кілька хвилин).
 */
export const CARRY = { mood: 0.5, attention: 5, struggleMood: -0.5, bite: 0.1, biteStep: 0.1, escape: 0.25, seenContent: 1, seenStruggle: 0.5, observeEvery: 60 } as const;
/** Чистюлі («Вибагливість до лотка» від +1) не йдуть на руки в брудному одязі й відходять на кілька клітинок (§9.12). */
export const DIRTY_CLOTHES_CATS = { picky: 1, backAway: 3 } as const;
/**
 * Заздрісність (§9.12): настрій і стосунки за одиницю риси, коли іншому котові щось перепало; бачить за стільки клітинок.
 * Тригер (рішення автора 2026-10-25, `TRAITS_REVIEW.md`): дорогому корму не заздрить, коли такий корм є в домі (у
 * сховищі, мисці чи годівниці) або сам їв його за останні `premiumMinutes` хвилин; ласощам — коли й сам отримав ласощі
 * протягом `graceMinutes` хвилин до чи після: ласощі всім котам поруч заздрощів не викликають. Нашийнику — коли сам у
 * нашийнику. Видимі реакції (рішення автора 2026-10-25, зроблено 2026-10-26, §9.12 «Гра й стосунки котів»): заздрісник поруч (до `near`
 * клітинок) шипить на того, кому перепало, здалеку підходить і шипить зблизька; від `snatchLevel` з шансом `snatch` вихоплює
 * ласощі, коли він поруч із вами (до `snatchReach` клітинки); щиросердий сідає поруч і муркоче `cuddleMinutes` хвилин, стосунки
 * +`cuddleRelation`.
 */
export const ENVY = { mood: -2, relation: -4, glad: 1, sight: 5, premiumMinutes: 6 * 60, graceMinutes: 2, near: 2, snatch: 0.2, snatchLevel: 2, snatchReach: 1.5, cuddleMinutes: 5, cuddleRelation: 1 } as const;
/**
 * Вага кота й «Схильність до повноти» (§9.12 «Тіло й тепло», рішення автора 2026-10-25, `TRAITS_REVIEW.md`; зроблено 2026-10-26):
 * прихована вага 0–`max`, норма `norm`. Набір: порція, з'їдена при голоді h нижче `fullHunger` (звичайний поріг їжі), —
 * `portion` × min(1, (`fullHunger` − h) / `excessRange`), тобто повні `portion` від голоду 40 і нижче (пів порції — половина;
 * пропозиція розбору — `portion` нижче 60 і нічого вище, змінено на плавне: без стрибка між 59 і 61, і «Ласун», що їсть частіше,
 * трохи гладшає й від звичайних трапез),
 * ласощі — `treat`, крадена їжа (зі столу, із шафки, з прогризеного пакета корму; пакет ласощів — `treat`) — `stolen`; усе ×
 * max(0, 1 + `traitStep` × рівень), стерилізованим ще × `sterilized`, крім корму для стерилізованих — з миски чи прогризеного пакета (рішення автора 2026-10-26), а породі зі
 * схильністю «ожиріння» (британська короткошерста) — × (1 + `breedStep` за кожну таку половину): чистокровна ×1,25 (рішення автора
 * 2026-10-26). Втрата — лише до норми: `perHour` за годину й `playLoss` за
 * гру, зумі чи боротьбу (гра вудкою — за часткою `PLAY_RELIEF`). Від `obese` — «Ожиріння» (оборотне, §9.5): потреба гри ×
 * `obesePlay`, ходить × `obeseWalk`, нагору не лізе; минає нижче `cured`. Прояв «+» — вага від `visible` на очах персонажа, «−» —
 * переїв (зайвого до множників щонайменше `overate`: порція при голоді 60 і нижче, ласощі чи крадене; перевірка етапу
 * 2026-10-26), а вага нижче `slim`; раз на день. На малюнку кіт ширшає на `girthStep` × (вага − норма) / (max − норма).
 */
export const WEIGHT = {
  norm: 50,
  max: 100,
  fullHunger: 80,
  excessRange: 40,
  portion: 2,
  treat: 1,
  stolen: 2,
  traitStep: 0.5,
  sterilized: 1.3,
  breedStep: 0.125,
  perHour: 0.05,
  playLoss: 1,
  obese: 75,
  cured: 65,
  obesePlay: 0.7,
  obeseWalk: 0.85,
  visible: 60,
  slim: 55,
  overate: 1,
  girthStep: 0.6,
} as const;
/**
 * «Теплолюбність» (§9.12 «Тіло й тепло», рішення автора 2026-10-25, `TRAITS_REVIEW.md`; сюди злито «Чутливість до погоди», зроблено
 * 2026-10-26). Сонячна пляма — вага `sun` + рівень (не менше нуля); бонус «Холоду» до ліжка й комп'ютера (`MODIFIERS.coldWarmth`) —
 * × max(0, 1 + `coldStep` × рівень); на комп'ютері «−» спить рідше: × max(0, 1 + `coolStep` × рівень), −2 — ніколи. Прохолодна
 * плитка у ванній (`COOL_TILE`): вага `tileStep` × |рівень| для «−» і ще `heatTile` у «Спеку» для всіх. Під ковдрою спить «+» у
 * «Холод», а від `blanketLevel` — завжди. «+» у «Холод» і «−» у «Спеку», поки не гріються (не прохолоджуються), втрачають
 * `weatherMood` настрою за одиницю на добу, а не сплячи, раз на `feelEvery` хвилин показують це (думка); «−» у «Спеку» ще й п'є
 * більше: спрага × (1 + `heatThirstStep` × |рівень|). Прояв у теплому чи прохолодному місці — не частіше ніж раз на `observeEvery`
 * хвилин.
 * [Пропозиція] (фінальна перевірка рис 2026-10-26): підвіконня над батареєю — тепле місце сну «+»: вага `sillStep` × рівень, а в
 * «Холод» ще той самий бонус холоду, що й для ліжка та комп'ютера; на одному підвіконні — один кіт.
 */
export const WARMTH = { sun: 2, coldStep: 0.5, coolStep: 0.5, tileStep: 1.5, heatTile: 2, blanketLevel: 2, weatherMood: -1, feelEvery: 180, heatThirstStep: 0.25, observeEvery: 120, sillStep: 1 } as const;
/**
 * Мстивість (§9.12): скільки триває образа, шанс помсти за годину за одиницю, ласощі незлопам'ятним. Рішення автора
 * 2026-10-25 (`TRAITS_REVIEW.md`): мститься лише за неприємне від персонажа (`offend`) і стрес — бійку чи переноску, і
 * не обов'язково біля ліжка: речі з вашим запахом — ліжко чи кошик брудної білизни, якщо в ньому щось є.
 */
export const REVENGE = { minutes: 240, perHour: 0.1, refundStep: 0.25 } as const;
/**
 * «Образливість» (§9.12, рішення автора 2026-10-25). Після неприємного від персонажа кіт без риси `baseMinutes` хвилин
 * сам по ласку не приходить; «Образливий» дметься `sulkMinutes` × рівень хвилин: сам не приходить, а від персонажа ближче
 * `near` клітинки відходить і сідає спиною — не частіше ніж раз на `againMinutes` хвилин (перевірка етапу 2026-10-25:
 * кіт, що ще відходив чи забився в куток, «відходив» знову щокадру, і думка «дметься» вискакувала щокадру);
 * «Відхідливий» приходить по ласку одразу, а на руках через образу не пручається.
 */
export const TOUCHY = { baseMinutes: 15, sulkMinutes: 30, near: 1.5, againMinutes: 2 } as const;
/**
 * «Розкидання наповнювача» (рішення автора 2026-10-25, `TRAITS_REVIEW.md`, §9.12 «Їжа й гігієна»): після лотка — шанс
 * `base` × (1 + `step` × рівень): +1 — 35%, +2 — 50%, −1 — 5%, −2 — 0; із закритого лотка (високі борти) — ×`closedBox`.
 * «−» після лотка `buryMinutes` хвилин акуратно загрібає за собою.
 */
export const SCATTER_CHANCE = { base: 0.2, step: 0.75, closedBox: 0.5, buryMinutes: 1 } as const;

/** Любов (§7, §9.12): день без взаємодії; дрейф настрою за день — (любов − 50) × 6 / 100 (§9.6). */
export const LOVE = {
  noInteractionPerDay: -1,
  driftPerPoint: 6 / 100,
} as const;
/**
 * Любов змінює поведінку (§9.12, правка автора 2026-10-25): пестощі кіт терпить довше — на
 * `tolerancePerPoint` за кожне очко любові понад 50; від `devoted` — шанс лягти на коліна +`lapBonus`,
 * укус на руках × `biteFactor`; нижче `aloof` — сам по увагу не йде й на руках пручається сильніше.
 */
export const LOVE_BEHAVIOR = { aloof: 25, devoted: 75, tolerancePerPoint: 0.01, lapBonus: 0.25, biteFactor: 0.5 } as const;
/**
 * Стан думками (§11.4, правка автора 2026-10-25): з яких потреб кіт думає про корм (на `hungerLead` нижче за
 * поріг, з якого він іде їсти, — з «Апетитом» теж), воду, гру й увагу — із запасом до `NEED_THRESHOLD`, щоб
 * думку встигло бути видно навіть на важкій, перш ніж кіт піде сам; з якого настрою — сумує; персонаж — про
 * показник нижче `personLow`. Кожен кіт — раз на `catSeconds` реальних секунд гри, між думками різних котів —
 * щонайменше `catGapSeconds`; обидва ділить множник складності `frequency` (правка автора: ×1,25 / ×1 / ×0,8).
 * Персонаж — раз на `personSeconds`. Думки кота й персонажа — не разом, щонайменше `apartSeconds` між ними.
 * Розкид проміжків — ±`jitter`.
 */
export const THOUGHTS = {
  hungerLead: 20,
  thirst: 35,
  play: 45,
  attention: 40,
  sad: 35,
  personLow: 40,
  catSeconds: 60,
  catGapSeconds: 15,
  personSeconds: 60,
  apartSeconds: 2,
  jitter: 0.2,
  frequency: { easy: 1.25, normal: 1, hard: 0.8 } as Record<Difficulty, number>,
} as const;
/**
 * Настрій з поведінки (§11.4, рішення автора 2026-10-25): щасливий кіт (настрій від `blinkMood`), що
 * любить персонажа (від `LOVE_BEHAVIOR.devoted`), за `blinkDistance` клітинок повільно моргає до нього раз
 * на `blinkSeconds`; сумний (нижче `THOUGHTS.sad`) — сумна поза. Ласкавий кіт («Ласкавість» +), що прийшов по увагу й
 * сидить ближче `nudgeDistance` клітинки, бодається головою (рішення автора 2026-10-25) — лише анімація.
 */
export const MOOD_LOOK = { blinkMood: 70, blinkDistance: 4, blinkSeconds: 8, nudgeDistance: 1.2 } as const;
/** «Відданість» і «Образливість» змінюють зростання й втрати любові на 25% за одиницю (§9.12). */
export const LOVE_TRAIT_STEP = 0.25;
/**
 * «Відданість» (§9.12, рішення автора 2026-10-25, `TRAITS_REVIEW.md`). Персонаж повернувся з поїздки — кіт, що не спить і
 * нічим важливим не зайнятий, іде зустрічати до дверей з шансом `greetBase` + `greetStep` × рівень + `greetLove` × (любов −
 * 50) / 50, від 0 до `greetMax`; до персонажа він іде щонайбільше `greetMinutes` хвилин, а дійшовши, нявкає й крутиться
 * поруч `stayMinutes` хвилин. «+» повільно моргає до персонажа вже з любові 75 − `blinkStep` × рівень.
 */
export const DEVOTION = { greetBase: 0.2, greetStep: 0.2, greetLove: 0.4, greetMax: 0.9, greetMinutes: 6, stayMinutes: 2, blinkStep: 10 } as const;

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
  /** Правка автора 2026-10-23: було 10 — кіт «хотів» лише перші ~2 з 5 хвилин, які терпить. */
  attentionPerMinute: 4,
  toleranceMinutes: 5,
  toleranceStep: 0.5,
  minToleranceMinutes: 2,
  biteChancePerMinute: 0.3,
  /** Правка автора 2026-10-22: було −1. */
  biteHealth: -3,
  /** Узяли на руки, коли кіт не хотів (§9.12). */
  unwantedLove: -2,
} as const;
/**
 * «Ласкавість» (§9.12, рішення автора 2026-10-25, `TRAITS_REVIEW.md`): «−» не терпить пестощів, коли уваги не хоче
 * (увага нижче `PET.wantsAttention`), і відходить, щойно таких пестощів стало більше ніж `leaveAfter` − |рівень|
 * хвилин: «Незалежний» — за хвилину, «Відлюдник» — одразу. Без укусу: укус — «Терпимість до гладження». Прояв «−» — не
 * частіше ніж раз на `observeEvery` хвилин (перевірка етапу 2026-10-25: «Відлюдник» іде з-під руки миттєво, і кілька
 * натискань поспіль відкривали рису за кілька секунд).
 */
export const AFFECTION = { leaveAfter: 2, observeEvery: 60 } as const;
/**
 * «Терпимість до гладження» (§9.12, рішення автора 2026-10-25): за `warnMinutes` до кінця терпіння кожен кіт
 * попереджає — б'є хвостом і притискає вуха; «Пастка на животику» (−2 і менше) перевертається животом догори, коли
 * персонаж ближче `bellyDistance` клітинки.
 */
export const PETTING = { warnMinutes: 1, bellyDistance: 1.5 } as const;

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
  /** Не більше стількох побудок за ніч сумарно (§9.12, «Спільні механіки рис», рішення автора 2026-10-25). */
  maxPerNight: 2,
  /**
   * «Ранкова побудка» (рішення автора 2026-10-25): «+» будить і заради ритуалу — з кормом у мисці чи не голодний — з
   * шансом `ritual` від звичайного; «−» не будить ніколи, а голодний (від `waitHunger`) терпляче чекає біля ліжка.
   */
  ritual: 0.5,
  waitHunger: 60,
} as const;

// Гра й бешкет (§9.12, чернетка).
/** Іграшка: скільки ігор витримує; гра наодинці триває кілька хвилин. */
export const TOY = { durability: { cheap: 15, premium: 40 } as Record<Quality, number>, aloneMinutes: 4 } as const;
/** Гра з персонажем: за хвилину. Нижче `bored` потреби гри кіт іде. */
/** Правка автора 2026-10-23: здоровий глузд +4 за хвилину (було 2,5). */
export const PLAY = { sanity: 4, playfulStep: 0.25, mood: 1, love: 0.5, needPerMinute: 15, bored: 10 } as const;
/**
 * «Ігривість» (§9.12 «Гра й стосунки котів», рішення автора 2026-10-25, `TRAITS_REVIEW.md`; зроблено 2026-10-26): з «+» гра
 * вудкою триває довше — потреба гри знімається `PLAY.needPerMinute` / (1 + `lengthStep` × рівень) за хвилину, з «−» — коротше,
 * × (1 + `lengthStep` × |рівень|), і, награвшись, «−» іде геть. «Нудьгар» (від −`boredLevel`) з шансом `ignore` на вудку не
 * зважає — відмова. «+» кличе гратися: коли хоче гратися, персонаж удома й не працює, а іграшка лежить на підлозі, — з вагою
 * `inviteStep` × рівень несе її до ніг персонажа й до `inviteMinutes` хвилин чекає поруч (пограєтеся — любов, як за подарунок).
 */
export const PLAYFUL = { lengthStep: 0.25, boredLevel: 2, ignore: 0.3, inviteStep: 0.3, inviteMinutes: 10 } as const;
/**
 * «Котяча м'ята» (§9.12 «Гра й стосунки котів», рішення автора 2026-10-25, `TRAITS_REVIEW.md`; зроблено 2026-10-26): м'яту чи
 * мататабі дають котові на руках біля аптечки. Кіт без риси й «+» катаються по ній `rollMinutes[рівень]` хвилин — настрій
 * `mood[рівень]`, від `loveLevel` ще й любов `love`, гра знімається на `PLAY_RELIEF` — а «+» потім засинає там само. «Байдужий»
 * (−1) понюхає м'яту `sniffMinutes` хвилин і йде, а мататабі діє на нього, як на кота без риси. «Шаленіє від м'яти» (−2)
 * кусає руку, вистрибує й `frenzyMinutes` гасає (настрій `frenzyMood`), а тоді задирає кота, що не спить, поруч (до
 * `fightReach` клітинок). Після реакції `refractoryMinutes` хвилин м'ята не діє; кошенята не реагують зовсім.
 */
export const CATNIP = {
  rollMinutes: [5, 10, 15] as readonly number[],
  mood: [3, 6, 10] as readonly number[],
  love: 1,
  loveLevel: 2,
  sniffMinutes: 0.5,
  frenzyMinutes: 2,
  frenzyMood: -2,
  fightReach: 3,
  refractoryMinutes: 120,
} as const;
/**
 * «Вікно» (§9.12 «Гра й стосунки котів», рішення автора 2026-10-25, `TRAITS_REVIEW.md`; зроблено 2026-10-26): підвіконня в
 * спальні й вітальні — місця в квартирі (справжні вікна, світло й ніч — пізніше, разом із днем і ніччю). Удень (`from`–`to`
 * година) кіт без справ сідає на вільне підвіконня з вагою `weight` × (1 + `step` × рівень) серед спокійних варіантів (поруч:
 * побродити — 0,4, посидіти — 0,6) на `minMinutes`–`maxMinutes` хвилин; «Не дивиться у вікно» (−1) — ніколи, «Нудьгує біля
 * вікна» (−2) — як кіт без риси. Біля вікна потреба гри знімається на `playPerHour` × той самий множник за годину, настрій
 * +`moodPerHour` (від `strongLevel` — +`strongMood`); «+» «кекає» на птахів — у середньому раз на `chatterMinutes` хвилин.
 * «Нудьгує біля вікна» за `angerMinutes` хвилин злиться: шипить на кота, що не спить, поруч (до `redirectReach` клітинок;
 * стосунки `relation`) чи йде дерти диван, а тоді `angerPause` хвилин на підвіконня не йде (перевірка скриншотом 2026-10-26: він
 * вертався знову й знову). Прояви — не частіше ніж раз на `observeEvery` хвилин. Обидва підвіконня зайняті — з шансом `contest`
 * кіт підходить до найближчого подивитися й, якщо там досі сидять, `takenMinutes` хвилин постоїть і піде (там його може відігнати
 * «Охоронець», «Територіальність»; перевірка етапу 2026-10-26).
 */
export const WINDOW = {
  contest: 0.5,
  takenMinutes: 0.5,
  from: 7,
  to: 21,
  weight: 0.4,
  step: 0.5,
  minMinutes: 20,
  maxMinutes: 60,
  playPerHour: 8,
  moodPerHour: 1,
  strongMood: 2,
  strongLevel: 2,
  chatterMinutes: 15,
  angerMinutes: 4,
  redirectReach: 4,
  relation: -2,
  angerPause: 180,
  observeEvery: 60,
} as const;
/**
 * «Слухняність» (§9.12 «Гра й стосунки котів», рішення автора 2026-10-25, `TRAITS_REVIEW.md`; зроблено 2026-10-26): «ні» мовою
 * гри — зняти кота з забороненого місця: з комп'ютера (клавіатура чи сон на ньому) чи з кухонного столу, поверхні або плити
 * (крадіжка чи скидання скасовуються); ціна — як прогнати з місця (`SHOO`). Після цього кіт `minutes` × max(0, 1 + `step` ×
 * рівень) хвилин туди не лізе; «+» пам'ятає це видно — підходить, `rememberMinutes` дивиться й розвертається. «Анархіст» (від
 * −`comebackLevel`) з шансом `comeback` повертається туди за `comebackMinutes` хвилин (зайнятий довше за `comebackWindow` —
 * забуває). Прояви — не частіше ніж раз на `observeEvery` хвилин; думка «пам'ятає «ні»» — не частіше ніж раз на `thoughtEvery`
 * хвилин на кота (рішення автора 2026-10-26). Підійшовши, «+» `approachEvery` хвилин не підходить до того самого місця знову —
 * голодний натомість просить корм (рішення автора 2026-10-26).
 */
export const OBEDIENCE = { minutes: 120, step: 0.5, rememberMinutes: 1, comebackLevel: 2, comeback: 0.5, comebackMinutes: 10, comebackWindow: 30, observeEvery: 60, thoughtEvery: 30, approachEvery: 30 } as const;
/**
 * «Товариськість» (§9.4, §9.12 «Гра й стосунки котів», рішення автора 2026-10-25, `TRAITS_REVIEW.md`; зроблено 2026-10-26): «−»
 * шипить на кота, що не друг і проходить повз ближче `passDistance` клітинки, — з шансом `passStep` × |рівень| за зустріч
 * (наступна зустріч із тим самим котом — не раніше ніж за `passEvery` хвилин, а після шипіння — за `passPause`), стосунки
 * `passRelation`. «+» лягає спати й поруч із котом, що не друг і не ворог, — вага `pileStep` × рівень. Прояв «+» уві сні поруч —
 * не частіше ніж раз на `observeEvery` хвилин.
 */
export const SOCIABILITY = { passDistance: 1.5, passStep: 0.15, passEvery: 10, passPause: 120, passRelation: -1, pileStep: 1.5, observeEvery: 60 } as const;
/**
 * «Вилизування друзів» (§9.4, §9.12 «Гра й стосунки котів», рішення автора 2026-10-25, `TRAITS_REVIEW.md`; зроблено 2026-10-26):
 * друг прийшов вилизати «−», а той з шансом `refuseStep` × |рівень| відсторонюється (від −2 — ще й шипить): стосунки
 * `refuseRelation` замість +2, і `refusedMinutes` хвилин друзі його не чіпають. Купкою з другом «−» спить рідше — вага сну поруч ×
 * (1 + `pileStep` × рівень).
 */
export const GROOMING = { refuseStep: 0.4, refuseRelation: -1, pileStep: 0.25, refusedMinutes: 60 } as const;
/**
 * «Ревнивість» (§9.4, §9.12 «Гра й стосунки котів», рішення автора 2026-10-25, `TRAITS_REVIEW.md`; зроблено 2026-10-26): персонаж
 * гладить кота, грається з ним, той у нього на колінах чи на руках — ревнивець, що бачить (до `RELATIONS.jealousySight`),
 * шипить на щасливця (стосунки `RELATIONS.jealousy` × рівень — за кожен сеанс уваги, і коли шипіння на паузі, рішення автора
 * 2026-10-26). Поруч (до `near` клітинок) — одразу, і щасливець з шансом
 * `leave` іде: пестощі чи гра перериваються, з колін зганяють, а від `lapLevel` ревнивець ще й лягає на коліна сам; здалеку —
 * з шансом `comeStep` × рівень приходить шипіти зблизька (за `confrontMinutes` на місці), інакше шипить звідти. «−»: ви гладите
 * іншого кота — з шансом `cuddleStep` × |рівень| приходить, лягає поруч і муркоче (`cuddleMinutes`), стосунки +`cuddleRelation`.
 * Прийти — не частіше ніж раз на `pauseMinutes`.
 */
export const JEALOUSY = { near: 2, leave: 0.5, lapLevel: 2, comeStep: 0.25, confrontMinutes: 0.25, cuddleStep: 0.2, cuddleMinutes: 5, cuddleRelation: 1, pauseMinutes: 30 } as const;
/**
 * «Територіальність» (§9.4, §9.12 «Гра й стосунки котів», рішення автора 2026-10-25, `TRAITS_REVIEW.md`; зроблено 2026-10-26):
 * сварка за миску чи лоток, коли їх бракує, — дзеркально, 15% + 10% × рівень (`RELATIONS.resource`; «Комунар» не свариться).
 * «+» охороняє зайняту річ — миску, з якої їсть (від `guardLevel` — ще `guardMinutes` хвилин після їди вартує біля неї), лоток,
 * у якому сидить, підвіконня: інший кіт підходить ближче `guardReach` клітинок — з шансом `guardStep` × рівень «+» шипить, і
 * той відходить (потреба лишається), стосунки `guardRelation`; відганяти — не частіше ніж раз на `guardPause` хвилин. Відігнаний
 * від лотка з потребою від `surpriseNeed` з шансом `surpriseChance` не дотерпить. Кіт без риси й «+» обирають миску, з якої
 * ніхто не їсть, якщо така є з кормом; «−» їсть і разом — прояв «−», не частіше ніж раз на `shareEvery` хвилин.
 */
export const TERRITORY = { guardStep: 0.3, guardReach: 2, guardRelation: -3, guardPause: 30, guardLevel: 2, guardMinutes: 10, surpriseNeed: 95, surpriseChance: 0.3, shareEvery: 30 } as const;
/**
 * «Турбота про кошенят» (§9.4, §9.12 «Гра й стосунки котів», рішення автора 2026-10-25, `TRAITS_REVIEW.md`; зроблено 2026-10-26):
 * початкові стосунки дорослого з кошеням — `RELATIONS.kittenBonus` + `relationStep` × рівень дорослого. «+», нічим не зайнятий, з
 * шансом `groomStep` × рівень іде вилизати кошеня поруч (до `RELATIONS.groom.distance` клітинок): кошеняті настрій +`groomMood`,
 * стосунки +`groomRelation`; спить, обійнявши кошеня (вага `hugStep` × рівень), — поки обидва сплять поруч, кошеняті настрій
 * +`warmPerHour` за годину. Мати щоночі дає новонародженим `motherMood` настрою за знаком своєї риси. «−» шипить і б'є лапою
 * кошеня, що лізе до нього (ближче `swatReach`), з шансом `swatStep` × |рівень|: кошеняті настрій `swatMood`, на це кошеня —
 * `swatPause` хвилин спокою. Прояв «+» уві сні з кошеням — не частіше ніж раз на `observeEvery` хвилин.
 */
export const NURTURING = { relationStep: 10, groomStep: 0.2, groomMood: 2, groomRelation: 1, hugStep: 1.5, warmPerHour: 0.5, motherMood: 1, swatReach: 1.2, swatStep: 0.5, swatMood: -2, swatPause: 60, observeEvery: 60 } as const;
/** Ваги варіантів, коли кіт хоче гратися; риса додає 50% за одиницю. */
export const MISCHIEF = { zoomies: 0.3, knock: 0.3, steal: 0.2, toy: 0.5, wander: 0.5, scratch: 0.3, traitStep: 0.5 } as const;
/**
 * Дрібнички на столах (§9.12 «Гра й бешкет», рішення автора 2026-10-25, `TRAITS_REVIEW.md`): кіт, що хоче гратися, іде
 * скинути дрібничку з вагою `weight` × (1 + 0,5 × «Скидання речей»), «−» — з `weight`, але, дійшовши, з шансом `sniffStep` ×
 * |рівень| лише обнюхує її `sniffMinutes` хвилин і обходить. Кухоль розбивається з шансом `mugBreaks`: +`repair` до ремонту.
 * «+» скидає й заради уваги: персонаж працює чи `ignoredMinutes` хвилин його не гладить — з шансом `attentionStep` × рівень
 * за візит іде до дрібнички в кімнаті персонажа, не далі `reach` клітинок від себе.
 */
export const KNOCKING = { weight: 0.15, sniffStep: 0.5, sniffMinutes: 0.5, mugBreaks: 0.5, repair: 2, ignoredMinutes: 5, attentionStep: 0.2, reach: 6 } as const;
/**
 * «Допитливість» і нові речі (§9.12 «Гра й бешкет», рішення автора 2026-10-25, `TRAITS_REVIEW.md`): «+» спить у ящиках біля
 * входу з вагою `boxStep` × рівень; на нову річ «+» з шансом `sniffStep` × рівень іде обнюхати її й сидить поруч
 * `sniffMinutes`, «−» з шансом `sniffStep` × |рівень| обнюхує `shunMinutes` і відходить, а ще `shunHours` × |рівень| годин
 * обходить нову миску, воду, лоток чи кігтеточку, поки є стара. Нова річ лишається новою `freshHours` годин.
 */
export const CURIOSITY = { boxStep: 1, sniffStep: 0.5, sniffMinutes: 1, shunMinutes: 0.5, shunHours: 2, freshHours: 4 } as const;
/**
 * Кігтеточка чи диван (§9.12): шанс обрати кігтеточку, крок «Дряпання», тривалість, скільки гри знімає. Рішення автора
 * 2026-10-25 (`TRAITS_REVIEW.md`): вага `weight` × (1 + `frequencyStep` × рівень), не менше `minWeight`; без кігтеточки
 * «Любить кігтеточку» (−1) дере диван лише з шансом `calmSofa` (інакше килимок чи, з шансом `boxes`, коробки, коли вони є),
 * −2 — ніколи; «Руйнівник диванів» (+2) з шансом `doorframe` дере одвірок. Проспав від `afterSleepMinutes` — з шансом
 * `afterSleep` одразу точить кігті.
 */
export const SCRATCH = { premium: 0.9, cheap: 0.6, traitStep: 0.2, minutes: 2, relief: 30, mood: 1, weight: 0.3, frequencyStep: 0.25, minWeight: 0.15, calmSofa: 0.5, boxes: 0.5, doorframe: 0.3, afterSleep: 0.25, afterSleepMinutes: 60 } as const;
/**
 * «Мисливський інстинкт» (§9.12 «Гра й бешкет», рішення автора 2026-10-25, `TRAITS_REVIEW.md`; зроблено 2026-10-26): кіт, що
 * хоче гратися, розмотує рулон туалетного паперу у ванній з вагою `roll` × (1 + `rollStep` × рівень) (`roll` 0,05 — рішення автора
 * 2026-10-26, було 0,12), кошеня — ×`kitten`,
 * «−» — ніколи; лапає рулон `pawMinutes` хвилин і тягне паперову стрічку у вітальню. Гра наодинці знімає потребу гри
 * ×(1 + `soloStep` × рівень), не менше ×`soloMin`, а іграшка «+» зношується ×(1 + `wearStep` × рівень). Прояв — не частіше ніж
 * раз на `observeEvery` хвилин (лапає й тягне — один бешкет).
 */
export const HUNTING = { roll: 0.05, rollStep: 0.75, kitten: 2, pawMinutes: 1, soloStep: 0.25, soloMin: 0.5, wearStep: 0.5, observeEvery: 30 } as const;
/**
 * «Подарунки й схованки» (§9.12 «Гра й бешкет», рішення автора 2026-10-25, `TRAITS_REVIEW.md`; зроблено 2026-10-26): кіт, що
 * хоче гратися, несе річ з вагою `weight` × (1 + рівень), кіт без риси — `base`, «−» — ніколи. Іграшку з підлоги з шансом
 * `feet` приносить персонажу до ніг (тоді `waitMinutes` сидить поруч; пограєтеся вудкою протягом `thanksMinutes` хвилин — любов
 * +`thanksLove`), інакше заганяє під диван чи (з шансом `fridge`) під холодильник. Шкарпетку з кошика брудної білизни несе в
 * схованку під диваном: найближчий виїзд довший на `sockSearch` хвилин, поки її шукають, а пилосос знаходить її сам. Підняти
 * річ — `pickMinutes`. Гра наодинці заганяє іграшку під меблі (ближче `strayReach` клітинок) з шансом `stray` — кожен кіт.
 */
export const GIFTS = { weight: 0.15, base: 0.05, feet: 0.5, fridge: 0.5, pickMinutes: 0.3, waitMinutes: 2, thanksMinutes: 10, thanksLove: 1, sockSearch: 10, stray: 0.03, strayReach: 3 } as const;
/**
 * «Кмітливість у бешкеті» (§9.12 «Гра й бешкет», рішення автора 2026-10-25, `TRAITS_REVIEW.md`; зроблено 2026-10-26): голодний
 * кіт при порожніх мисках з шансом `openStep` × рівень (раніше, ніж красти зі столу) `pawMinutes` хвилин лапає дверцята шафки з
 * кормом, відчиняє їх і з'їдає порцію із запасу; шафка лишається відчиненою — з неї їсть кожен голодний кіт, доки персонаж її не
 * зачинить. Від `fullLevel` кіт лізе в шафку й ситим, коли хоче гратися (вага `fullWeight`), і тоді з шансом `fullVomit` зригує.
 * Перекидає смітник з вагою `trashStep` × рівень. Дешевий замок відчиняє лише кіт від `fullLevel`, з шансом `cheapLock`; надійний —
 * ніхто. Спроба на замку — прояв не частіше ніж раз на `observeEvery` хвилин (перевірка етапу 2026-10-26).
 */
export const CUNNING = { openStep: 0.15, pawMinutes: 1, fullLevel: 2, fullWeight: 0.1, fullVomit: 0.3, trashStep: 0.1, cheapLock: 0.3, observeEvery: 30 } as const;
/**
 * «Лазіння» (§9.12 «Гра й бешкет», рішення автора 2026-10-25, `TRAITS_REVIEW.md`; зроблено 2026-10-26): високі місця — верх
 * холодильника й шафи в спальні. Спить там кіт з вагою `step` × рівень, кіт без риси — `base`, «−» — ніколи; на теплому
 * холодильнику — ще `warmStep` × «Теплолюбність». Верхолаз ховається нагорі, а не під ліжком. Застрягає кошеня з шансом `kitten`,
 * кіт від `strongLevel` — `strong` за підйом. Кота нагорі на руки не взяти: злазить сам — на корм, на вудку (ближче `lureReach`)
 * чи прокинувшись; застряглий кричить, доки не знімуть (неприємне — `rescueSanity`), а від потреби `jumpNeed` зістрибує сам
 * (настрій `jumpMood`).
 */
export const CLIMBING = { base: 0.3, step: 1.5, warmStep: 0.5, kitten: 0.2, strong: 0.05, strongLevel: 2, lureReach: 2.5, rescueSanity: -1, jumpNeed: 95, jumpMood: -3 } as const;
/**
 * «Гризіння» (§9.12 «Гра й бешкет», рішення автора 2026-10-25, `TRAITS_REVIEW.md`; зроблено 2026-10-26): кіт гризе з шансом
 * `decideStep` × рівень за кожне спокійне рішення, кошеня без риси — `kitten` (міняються зуби), а коли хоче гратися — з вагою
 * `playWeight` × (1 + рівень); «−» — ніколи. Гризе `minMinutes`–`maxMinutes` хвилин дріт комп'ютера (коли ніхто не працює) чи
 * пакети в ящиках біля входу. Дріт, який гризли до кінця (кота не забрали), перегризено з шансом `wireChance`: комп'ютер не
 * працює, доки персонаж не полагодить дріт утриманням дії (`fixMinutes`, неприємне `fixSanity`, ремонт +`wireRepair` ₴ до
 * комунальних). Із пакета пропадає одиниця запасу; корм і ласощі кіт з'їдає.
 */
export const CHEWING = { decideStep: 0.02, kitten: 0.01, playWeight: 0.1, minMinutes: 2, maxMinutes: 3, wireChance: 0.15, fixMinutes: 15, fixSanity: -2, wireRepair: 5 } as const;
/**
 * «Засідки» (§9.12 «Гра й бешкет», рішення автора 2026-10-25, `TRAITS_REVIEW.md`; зроблено 2026-10-26): кіт, що хоче
 * гратися, сідає в засідку з вагою `step` × рівень (кіт без риси — `base`, кошеня — щонайменше `kitten`; «−» — ніколи),
 * ×`bored`, якщо сьогодні з ним ще не гралися вудкою `playedMinutes` хвилин, і ×`played`, якщо гралися. Чекає до `minutes`
 * хвилин у місці з `AMBUSH_SPOTS`; персонаж ближче `reach` клітинки — стрибок на ноги: оглушення (спільна пауза), від
 * `strongLevel` ще й подряпина (здоров'я `health`); тоді кіт `dashMinutes` мчить геть. Засідка без стрибка знімає `waitRelief`
 * від гри наодинці (`PLAY_RELIEF`), стрибок — цілу.
 */
export const AMBUSH = { step: 0.25, base: 0.04, kitten: 0.1, bored: 2, played: 0.5, playedMinutes: 5, minutes: 10, reach: 1, health: -1, strongLevel: 2, dashMinutes: 0.5, waitRelief: 0.5 } as const;
/** Хвороби прототипу (§9.5): безпечний термін, шкода за день, лікування, заразність. */
export const DISEASES: Record<
  DiseaseId,
  {
    safe: number;
    damage: number;
    cure: { kind: Medicine; doses: number } | { kind: "diet"; portions: number } | { kind: "calm"; days: number } | { kind: "vet" } | { kind: "control"; medicine: Medicine } | { kind: "weight" };
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
  // Ожиріння (§9.5, §9.12 «Тіло й тепло», 2026-10-26): оборотне — минає, щойно вага повернеться до норми (`WEIGHT.cured`).
  obesity: { safe: 7, damage: 1, cure: { kind: "weight" }, contagious: null },
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
/** Посадити кота в переноску (§8.5): настрій за якістю + `traitStep` × «Переноска», не більше нуля (2026-10-25). */
export const CARRIER_MOOD = { cheap: -5, premium: -2, traitStep: 3 } as const;
/**
 * Переноска вдома (§9.12 «Переноска й ветеринар», рішення автора 2026-10-25): «+» спить у ній з вагою `sleepStep` × рівень;
 * «−» на руках ближче `reach` клітинок до дверей, коли переноска є, щохвилини з шансом `scratchStep` × |рівень| дряпає
 * персонажа (здоров'я `health`), а після подряпини з шансом `escape` виривається й ховається.
 */
export const CARRIER_HOME = { sleepStep: 1.5, reach: 2, scratchStep: 0.1, health: -3, escape: 0.25 } as const;
/** Штраф за годину поїздки в робочий час (§8.6): кількість поїздок за 7 днів × репутація за годину / 3. */
export const TRIP_REPUTATION_DIVIDER = 3;
/**
 * Пункти призначення (§8.5). «Жах клініки» (−2) виривається й ховається під шафу: огляд чи грумінг довші на `hideMinutes`, а
 * вдома після ветеринарки він ховається `homeHideMinutes` (§9.12 «Переноска й ветеринар», 2026-10-25).
 */
export const VET = { exam: 40, cheap: 30, premium: 80, cheapWorks: 0.7, treatMinutes: 60, controlDays: 7, love: -3, hideMinutes: 15, homeHideMinutes: 30 } as const;
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
export const BATH = { catchSanity: -3, bathSanity: -3, minutes: 10, hairlessDays: 7, dermatitis: 0.3, hideMinutes: 30 } as const;
/**
 * Купання за «Любов'ю до води» (рішення автора 2026-10-25, `TRAITS_REVIEW.md`, §8.7, §9.12 «Їжа й гігієна») — дзеркально:
 * настрій, любов і шанс подряпати персонажа за рівнем (порода й характер разом, від −2 до +2). «Водобоязнь» (−2) після
 * купання ще й виривається з рук і `BATH.hideMinutes` хвилин ховається.
 */
export const BATH_FEEL: Record<-2 | -1 | 0 | 1 | 2, { mood: number; love: number; scratch: number }> = {
  2: { mood: 5, love: 1, scratch: 0 },
  1: { mood: 2, love: 0, scratch: 0 },
  0: { mood: -5, love: -2, scratch: 0 },
  [-1]: { mood: -7, love: -3, scratch: 0.15 },
  [-2]: { mood: -10, love: -4, scratch: 0.3 },
};
/**
 * «Любов до води» поза купанням (рішення автора 2026-10-25): після вашого душу «+» з шансом `dropsStep` × рівень приходить
 * у мокру кабіну ловити краплі (`dropsMinutes` хвилин); «−», що не спить у ванній, тікає звідти, щойно ввімкнули воду
 * (душ чи кран), — прояв не частіше ніж раз на `observeEvery` хвилин.
 */
export const WATER_PLAY = { dropsStep: 0.3, dropsMinutes: 5, observeEvery: 60 } as const;
/**
 * «Догляд за шерстю» (рішення автора 2026-10-25, `TRAITS_REVIEW.md`, §8.7, §9.12 «Їжа й гігієна»): після `tuftMinutes` хвилин
 * пестощів з руки злітає жмут шерсті — раз за пестощі, з шансом `tuft` × (1 + рівень) (довгошерстий — ×`longTuft`;
 * «−» і безшерстий — ніколи), і шерсті в квартирі +`tuftFur`. Пестощі й самі додають шерсті: × `petting` від того, що кіт
 * лишає за годину, за кожну хвилину. «+» після сну від `napMinutes` хвилин на ліжку, дивані чи комп'ютері лишає там клапоть
 * шерсті з шансом `patchStep` × рівень. Після грумера кіт линяє вдвічі менше (`groomed`).
 */
export const SHEDDING = { tuftMinutes: 2, tuft: 0.3, longTuft: 1.5, tuftFur: 1, petting: 10, napMinutes: 60, patchStep: 0.25, groomed: 0.5 } as const;
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
/** Скільки однакових іграшок можна взяти в кошик за раз (§6.4): місця їм не треба. */
export const SHOP_TOYS_PER_ORDER = 5;
/** Вікно ціни в магазині за складністю (§6.4). */
export const SHOP_WINDOW: Record<Difficulty, { min: number; max: number }> = {
  // Правка автора 2026-10-23: зсунуто на 10% у бік знижок, щоб поїздка була варта часу.
  easy: { min: -0.4, max: 0 },
  normal: { min: -0.3, max: 0.1 },
  hard: { min: -0.2, max: 0.2 },
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
  /**
   * «Мама привезла гостинців» (§4.1, рішення автора 2026-10-26): дзвонить у двері у випадкову хвилину `from`–`to`; персонажа
   * немає — приходить, щойно він повернувся, якщо до `until`, інакше лишає гостинці під дверима. Гостинці — пакет маминих
   * судочків (`PRODUCTS.momMeal`, §6.4).
   */
  mom: { from: 11 * 60, to: 18 * 60, until: 20 * 60 },
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
/** Свідок — у тій самій кімнаті; на цю відстань — лише коли хтось у проході між кімнатами, крізь стіну — ні (§9.9). */
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
  /** Приятелі — від `pal` до друзів: граються, але не вилизують і не сплять купкою (§9.4, рішення автора 2026-10-26, Г1). */
  pal: 20,
  enemy: -50,
  sociabilityStep: 10,
  kittenBonus: 20,
  motherKitten: 50,
  /** Брати й сестри — одразу друзі (рішення автора 2026-10-26, Г2: було 30). */
  siblings: 50,
  /**
   * Життя разом — щоночі (§9.4 «Хто з ким грається», рішення автора 2026-10-26 після блоку 2: +3; спершу, Г1, — +1 замість
   * 0,5). Мета — коти без рис приятелі на 4–7-й вечір, друзі на 10–14-й.
   */
  nightly: 3,
  /**
   * Новий дорослий кіт (§9.4 «Хто з ким грається», рішення автора 2026-10-26, Б5 а): з кожним котом удома починає з `start` і
   * ±`sociabilityStep` за одиницю «Товариськості» обох (−30…−10). Перші `days` дні дорослий кіт, що живе тут давно, шипить на
   * нього, коли той проходить ближче `distance` клітинок, — раз за зустріч з шансом `hiss` × (1 − `hissStep` × «Товариськість»
   * того, хто шипить); стосунки `relation`.
   */
  newcomer: { start: -20, sociabilityStep: 2.5, days: 2, distance: 2, hiss: 0.3, hissStep: 0.25, relation: -1 },
  /**
   * «Товариськість» обох — щоночі за одиницю (рішення автора 2026-10-25; ±1,5 замість ±0,5 — рішення автора 2026-10-26 після
   * блоку 2, щоб двоє «Задирак» і з нічними +3 віддалялися: 3 − 6 = −3 за ніч, двоє «Миротворців» — +9).
   */
  sociabilityNightly: 1.5,
  /**
   * Гра з другом: друг чекає ініціатора до `wait` хвилин, `minutes` — обом від зустрічі; пара — поки обидва ближче `reach` клітинки
   * (перевірка стосунків 2026-10-26). З приятелем — вага `palWeight`, удвічі менша (§9.4, рішення автора 2026-10-26, Г1); кошеня
   * кличе будь-кого, хто не ворог, з вагою `weight` × `kitten` — 1,5 (Г2). Старий кличе з вагою × `old`, «Ігривість» — × (1 +
   * `playfulStep` × рівень), не менше нуля (Г7).
   *
   * Гра фазами (§9.4, «Гру й вилизування видно», рішення автора 2026-10-26, Г3; було 3 хвилини «ходьби на місці»): `minutes` хвилин
   * (від і до) від зустрічі, по колу засідка `ambush` → погоня `chase` → боротьба `tussle` → пауза `pause` (тривалість кожної — від
   * і до; погоні й боротьби — чернетка). У засідці той, на кого чатують, відходить на `sneak` клітинок (від і до) підтюпцем — у
   * `trot` раза швидше за ходу; у погоні тікає
   * щонайменше на `run` клітинок у межах кімнати (з проходу — до `passage`), швидкістю зумі, а мисливець тримається за `behind`
   * клітинки позаду; у погоні й боротьбі ролі щохвилини міняються з шансом `swap`. Пара — поки обидва ближче `chaseReach`.
   * Погоня повз стіл скидає річ, як зумі (`ZOOMIES.knock`).
   */
  wrestle: {
    weight: 0.6,
    palWeight: 0.3,
    kitten: 2.5,
    old: 0.5,
    playfulStep: 0.5,
    minutes: [6, 8],
    play: 40,
    mood: 2,
    relation: 1,
    wait: 10,
    reach: 1.5,
    ambush: [0.5, 1],
    chase: [1, 2],
    tussle: [1, 2],
    pause: [0.3, 0.5],
    sneak: [1.5, 2.5],
    trot: 2,
    run: 2,
    passage: 3,
    behind: 1,
    swap: 0.5,
    chaseReach: 4,
  },
  /**
   * Вилизування (§9.4): `minutes` хвилин (від і до) від того, як кіт підійшов, — друг, що не спить, на цей час сидить на місці й
   * мружиться (рішення автора 2026-10-26, «Гру й вилизування видно», В1: було 3 хвилини, і друг ішов собі). Вилизує, поки друг
   * ближче `reach` клітинки; відійшов далі — вилизування скасовується (перевірка стосунків 2026-10-26).
   *
   * Коли (В2; було 30% за будь-яке спокійне рішення, друг до 3 клітинок): прокинувся після сну, а друг поруч (до
   * `sleepTogether.distance`), — `afterSleep`; прийшов лягти до сплячого друга — `beforeSleep`, спершу `beforeSleepMinutes`
   * вилизує; друг до `distance` клітинок за останні `upsetMinutes` хвилин пережив стрес (сховався від звуку — від того, як вийшов
   * зі схованки; перевірка блоку 3) — `afterStress`, і йому настрій
   * `upsetMood` замість `mood`; інакше — `other`, лише коли друг ближче `near` клітинок. «Вилизування друзів» множить кожен шанс на
   * 1 + `traitStep` × рівень. Стосунки: `relation` — [межа, приріст нижче неї], від останньої межі — `relationTop`.
   *
   * Взаємність (В3): друг, що не спить, з шансом `back` (× його «Вилизування друзів») `backMinutes` хвилин вилизує у відповідь.
   */
  groom: {
    distance: 3,
    minutes: [4, 6],
    mood: 1,
    reach: 1.5,
    afterSleep: 0.5,
    beforeSleep: 0.3,
    beforeSleepMinutes: [1, 2],
    afterStress: 0.3,
    upsetMinutes: 60,
    upsetMood: 2,
    other: 0.15,
    near: 2,
    traitStep: 0.5,
    relation: [
      [70, 2],
      [90, 1],
    ],
    relationTop: 0.5,
    back: 0.4,
    backMinutes: 1,
  },
  sleepTogether: { weight: 3, distance: 1, perHour: 0.5 },
  /** Кіт підійшов до іншого кота (гратися, вилизати, лягти купкою) — стає впритул збоку на стільки клітинки, а не на нього. */
  beside: 0.4,
  /**
   * Бійка ворогів (§9.4): `minutes` хвилин, обом настрій і стосунки; розборонити — `separateSanity`. Хто програє — менша
   * «Сміливість» + «Територіальність» + випадковість 0…`luck`; нерозборонена бійка травмує лише його — з шансом `injury`
   * (некастрованому самцю × `injuryIntact`), і він ховається на `hide` хвилин (від і до), а переможець сидить `winnerSits` хвилин;
   * пара `truce` хвилин (від і до) не б'ється (рішення автора 2026-10-26; було: травма кожному з шансом 25%). Коти стоять за
   * `gap` клітинки; бійка біля столу чи робочої поверхні (до `knockReach` клітинки) з шансом `knock` скидає з нього річ (Б4).
   */
  fight: { minutes: 2, mood: -3, relation: -5, injury: 0.1, injuryIntact: 2, separateSanity: -3, luck: 2, hide: [15, 30], winnerSits: 3, truce: [90, 120], gap: 0.6, knock: 0.15, knockReach: 0.8 },
  /**
   * Протистояння перед бійкою (§9.4, рішення автора 2026-10-26): вороги ближче `distance` клітинок щохвилини з шансом `perMinute`
   * сходяться — один підходить, другий чекає до `wait` хвилин; пара — поки обидва ближче `reach`. Від зустрічі — `minutes` хвилин
   * (від і до), щохвилини шипіння. Далі бійка з шансом `fight` + `territorialStep` за одиницю «Територіальності» обох (лише «+»),
   * некастрованим самцям × `BREEDING.fightFactor`; інакше той, хто програв би, відступає. Торкнутися — коти розходяться на `part`
   * клітинки, здоровий глузд `touchSanity`. `perMinute` підібрано замірами 2026-10-26 під мету — 3–5 протистоянь і ~1 бійка на
   * пару ворогів за день (з 10% їх було 14–75 і 2–10); 1% лишити, а `minutes` — 4–8 замість 2–4, щоб гравець встиг утрутитися
   * (рішення автора 2026-10-26 після блоку 1).
   */
  standoff: { distance: 3, perMinute: 0.01, wait: 3, reach: 1.5, minutes: [4, 8], fight: 0.4, territorialStep: 0.1, part: 2, touchSanity: -1 },
  /**
   * Вороги уникають одне одного (§9.4, рішення автора 2026-10-26): вільний кіт, до якого ворог ближче `distance` клітинок,
   * відходить від нього на `step`; по увагу до персонажа не йде, коли його ворог ближче `person` клітинок до персонажа.
   */
  avoid: { distance: 2, step: 3, person: 2 },
  enemyMoodPerHour: -0.5,
  /** Сварка за ресурс — лише з котом поруч (до `distance` клітинок). */
  resource: { chance: 0.15, territorialStep: 0.1, relation: -3, distance: 3 },
  /** Ревнує той, хто бачить (до `sight` клітинок). */
  jealousy: -1,
  jealousySight: 5,
} as const;
/** Вага будиночка як місця для сну (§9.12). */
export const HOUSE_SLEEP: Record<Quality, number> = { cheap: 2, premium: 4 };
/**
 * Зумі: утричі швидше 1–2 хвилини; після лотка — шанс 30%. Збиває персонажа на шляху. Забіг повз стіл чи кухонну
 * поверхню (ближче `knockReach` клітинки) скидає річ із шансом `knock` за прохід (2026-10-25).
 */
export const ZOOMIES = { speed: 3, minMinutes: 1, maxMinutes: 2, afterToilet: 0.3, hit: 0.5, knock: 0.15, knockReach: 0.8 } as const;
/** Скільки гри знімає забава наодинці. */
export const PLAY_RELIEF = 50;
/** Украдена страва знімає голод (§9.12). */
export const STEAL_HUNGER = 50;
/**
 * Голодний кіт із порожньою мискою краде їжу: 25% за одиницю «Злодійства», дуже голодний (від 95) — ще 15% ×
 * (1 + `starvingStep` × рівень): «Шляхетний» (−2) не краде й голодуючи (рішення автора 2026-10-25).
 */
export const HUNGRY_THEFT = { step: 0.25, base: 0.15, starving: 95, starvingStep: 0.5 } as const;
/**
 * «Злодійство» (рішення автора 2026-10-25, `TRAITS_REVIEW.md`, §9.12 «Їжа й гігієна»). «+» відтісняє іншого кота від
 * миски: той сів їсти, а злодій поруч (до `reach` клітинок), голодний від `hunger` і нічим важливим не зайнятий, з шансом
 * `pushStep` × рівень іде туди; дійшов, а той ще їсть — шипить на нього, і той відходить голодний: настрій `victimMood`,
 * стосунки `relation`; «Охоронець миски» («Територіальність» +) з шансом `guardFight` × рівень б'ється. «−» голодний, коли
 * миски порожні й крадіжка не вдалася, з шансом `waitChance` сідає біля їжі на столі чи плиті на `waitMinutes` хвилин і не
 * бере її.
 */
export const THIEF = { reach: 6, hunger: 30, pushStep: 0.2, victimMood: -2, relation: -3, guardFight: 0.3, waitChance: 0.5, waitMinutes: 3 } as const;
/** Кіт і робота: клавіатура, коліна (§9.12). */
export const WORK_CAT = {
  /** До того, хто працює, кіт іде вже з такою увагою, як для пестощів (правка автора 2026-10-23: було 60). */
  seekAttention: 40,
  /**
   * Клавіатура (рішення автора 2026-10-25, `TRAITS_REVIEW.md`): пробує майже кожен кіт — 10% + 30% за одиницю «Робочого
   * помічника»; «−» не сідає ніколи, а коли не лягає на коліна, лягає поруч зі столом на `besideMinutes` хвилин і не
   * заважає.
   */
  keyboardBase: 0.1,
  keyboardStep: 0.3,
  besideMinutes: 20,
  lapBase: 0.5,
  lapStep: 0.25,
  keyboardMinMinutes: 10,
  keyboardMaxMinutes: 20,
  lapSanity: 1,
  lapMood: 0.5,
  lapLove: 0.2,
  lapAttention: 5,
} as const;
/**
 * Кіт у полі зору (§8.2, §9.12, правка автора 2026-10-23): здоровий глузд за годину — спить чи не
 * спить і щось робить; кожен наступний кіт (від найкращого) дає 1/k свого.
 */
export const WATCH_SANITY = { asleep: 1, awake: 3 } as const;
/** Безлад у полі зору дратує (§9.12, правка автора 2026-10-23): здоровий глузд за годину за кожен і найбільше разом. */
export const MESS_ANNOYANCE = { perHour: -1, max: -4 } as const;
/**
 * Сон на комп'ютері: вага 1 + 2 × «Теплолюбність» + 2 × «Робочий помічник»; «Поважає роботу» (−1) — удвічі менша,
 * «Байдужий до техніки» (−2 і менше) на комп'ютері не спить (`helperStep` за одиницю «−», рішення автора 2026-10-25).
 */
export const COMPUTER_SLEEP = { base: 1, step: 2, helperStep: 0.5 } as const;
/** Прогнали з місця (§9.12). */
export const SHOO = { mood: -3, love: -2 } as const;
/**
 * Шерстяна грудка: раз на 3 дні, уночі вдвічі частіше, довгошерсті вдвічі частіше, риса ±50%, «Догляд за шерстю» ±`sheddingStep`
 * за одиницю. Рішення автора 2026-10-25 (`TRAITS_REVIEW.md`, §9.12 «Їжа й гігієна»): перед грудкою кіт `coughMinutes`
 * хвилин кахикає (чути); уночі кахикання будить персонажа з шансом `wakeBedroom`, якщо кіт у спальні, і `wakeElsewhere` —
 * деінде (спільна стеля нічних побудок).
 */
export const HAIRBALL = { perHour: 1 / 72, night: 2, longHair: 2, step: 0.5, sheddingStep: 0.25, coughMinutes: 1, wakeBedroom: 0.2, wakeElsewhere: 0.05 } as const;
/**
 * «Мітки» (рішення автора 2026-10-25, `TRAITS_REVIEW.md`, §9.8, §9.12 «Їжа й гігієна»): некастрований кіт мітить з шансом
 * `BREEDING.markPerHour` за годину; «+» (і стерилізований, і кішка) — від тригерів з шансом `triggerPerHour`, без них —
 * `calmPerHour`; усе × (1 + `TRAIT_EFFECTS.markingStep` × рівень). Тригери: настрій нижче `mood`, новий кіт удома (до
 * `newCatDays` днів), гості, від `crowd` котів, брудний лоток, у кішки — тічка. Мітка — коротка дія: кіт задкує до кута й
 * `minutes` хвилин тремтить піднятим хвостом.
 */
export const MARKING = { triggerPerHour: 1 / 48, calmPerHour: 1 / 144, mood: 50, newCatDays: 3, crowd: 4, minutes: 1 } as const;
/** Блювота після їжі: 20% за одиницю «Швидкості їжі». */
export const VOMIT_STEP = 0.2;
/** Оглушення: спіткнувся об кота, посковзнувся, збило зумі (§9.12). */
export const STUN_MINUTES = 0.5;
/** Спільна пауза між оглушеннями персонажа (§9.12, «Спільні механіки рис», рішення автора 2026-10-25): хвилин. */
export const STUN_PAUSE_MINUTES = 5;
/** Спільна пауза шипіння (§9.12, «Спільні механіки рис», рішення автора 2026-10-25): кіт шипить не частіше, хвилин. */
export const HISS_PAUSE_MINUTES = 20;
/**
 * Гучний звук (§9.12, «Спільні механіки рис», рішення автора 2026-10-25). Великі — пилосос, робот-пилосос, феєрверки:
 * кіт зі «Сміливістю» 0 і менше ховається на `big` хвилин. Дрібні — віджим, розбита річ, персонаж упав: ховається лише
 * полохливий, з шансом `smallStep` × |рівень| на `smallMinutes` × |рівень| хвилин. Схованка × max(`stressMin`,
 * 1 − `stressStep` × «Стресостійкість»). Чути в тій самій кімнаті (з проходу — до `reach` клітинок), пилосос і
 * феєрверки — у всій квартирі; робот-пилосос — лише там, де він зараз їде, і кожен кіт чує його раз за прибирання
 * (рішення автора 2026-10-26). Сплячий кіт прокидається з шансом `wake` × (1 − `wakeStep` × «Тривалість сну»), і
 * настрій −1. Сміливий кіт іде подивитися на пилосос (`watchMinutes`); «Безстрашний» з шансом `ride` катається на роботі:
 * підбігає й застрибує, коли той ближче `board` клітинки. Віджим — останні `spinMinutes` хвилин прання. Прояви від звуку
 * й кроків — не частіше ніж раз на `observeEvery` хвилин (перевірка 2026-10-25).
 */
export const NOISE = {
  big: { vacuum: 20, robot: 20, fireworks: 60 },
  smallStep: 0.5,
  smallMinutes: 10,
  stressStep: 0.25,
  stressMin: 0.25,
  reach: 3,
  wake: 0.5,
  wakeStep: 0.5,
  wokenMood: -1,
  watchMinutes: 5,
  ride: 0.3,
  board: 0.8,
  spinMinutes: 10,
  observeEvery: 60,
} as const;
/**
 * Кроки персонажа (§9.12, рішення автора 2026-10-25): підійшов ближче `distance` клітинки до сплячого кота з
 * «Тривалістю сну» −1 і менше — той прокидається з шансом `step` × |рівень|, раз за прохід.
 */
export const STEPS_WAKE = { distance: 1.5, step: 0.15 } as const;
/**
 * «Стресостійкість» видно з поведінки (§9.12 «Настрій», рішення автора 2026-10-25). Нервовий: втратив за раз `shaken`
 * настрою чи більше — щойно звільниться (до `waitMinutes`), з шансом `nervousStep` × |рівень| `groomMinutes` хвилин
 * вилизується, а тоді ховається на `hideStep` × |рівень| хвилин, не частіше ніж раз на `everyMinutes`. Спокійний:
 * розбудили чи прогнали на руки — коли опускають, з шансом `sleepStep` × рівень одразу спить далі.
 */
export const STRESS_EFFECTS = { shaken: 3, waitMinutes: 30, nervousStep: 0.25, groomMinutes: 2, hideStep: 10, everyMinutes: 60, sleepStep: 0.25 } as const;
/** Адаптація кота ззовні в новому домі (§9.6): 2 − 0,5 × «Сміливість» днів, від 1 до 3 (рішення автора 2026-10-25). */
export const ADAPTATION_BRAVERY = { step: 0.5, min: 1, max: 3 } as const;
export const SLIP_CHANCE = 0.5;
/**
 * Тертя об ноги (§9.12): кіт ближче `distance` клітинки — персонаж повільніший; щохвилини руху шанс спіткнутися
 * `tripBase` + `tripStep` за одиницю. Рішення автора 2026-10-25 (`TRAITS_REVIEW.md`): «+» крутиться «вісімкою» й тоді,
 * коли персонаж несе корм, а кіт голодний (від `hunger`) і бачить це, — `foodMinutes` хвилин іде слідом; пів хвилини
 * (`eightMinutes`) під ногами — прояв. «Тримає дистанцію» (−1) сідає за `keep[0]` клітинки від персонажа, «Обходить
 * стороною» (−2 і менше) — за `keep[1]` і раз за похід відступає, коли персонаж підходить ближче `backOff`. Персонаж
 * пройшов ближче `passBy` клітинки, а кіт по увагу під ноги не поліз, — прояв «−», раз на день.
 */
export const LEGS = {
  slow: 0.7,
  tripBase: 0.1,
  tripStep: 0.1,
  distance: 0.6,
  hunger: 50,
  foodMinutes: 5,
  eightMinutes: 0.5,
  keep: [1, 1.5],
  backOff: 0.8,
  passBy: 2,
} as const;
/**
 * Втеча в двері (§9.12): кіт ближче 4 клітинок, шанс 10% + 25% за одиницю «Втеч»; повертається о 22:00. Рішення автора
 * 2026-10-25 («Двері й гості»): «+» удень щогодини з шансом `callStep` × рівень (у тічці ще `heatCall`) `callMinutes` хвилин
 * кричить під дверима; «Боїться дверей» тікає від відчинених дверей з `fearReach` клітинок.
 */
export const ESCAPE = {
  distance: 4,
  base: 0.1,
  step: 0.25,
  returnMinute: 22 * MINUTES_PER_HOUR,
  returnMood: -10,
  catchSanity: -3,
  callStep: 0.04,
  heatCall: 0.04,
  callMinutes: { min: 5, max: 10 },
  fearReach: 6,
} as const;
/**
 * Дзвінок у двері (§9.12 «Двері й гості», рішення автора 2026-10-25): «+» `greetMinutes` хвилин сидить біля дверей, «−»
 * ховається на `hideStep` × |рівень| хвилин. Гості дзвонять за `ringLead` хвилини до того, як зайти; у день «Гості» кожен «+»
 * дає здоровий глузд `delight` (разом не більше `delightMax`), кожен −2 — `hissSanity`. На виставці бал + `showStep` × рівень.
 */
export const GUESTS = { greetMinutes: 5, hideStep: 30, ringLead: 2, delight: 3, delightMax: 6, hissSanity: -2, showStep: 0.05 } as const;
