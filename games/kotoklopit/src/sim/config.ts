// Числа гри. Біля кожного — розділ GAME_DESIGN.md, звідки воно взяте.
// Позначка «чернетка» — значення для балансування (§11.2).

import type { Chronotype, Difficulty, Product, Quality, StatName } from "./types";

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
  { earnings: number; newCatSanity: number; lostCatSanity: number }
> = {
  easy: { earnings: 1.25, newCatSanity: 62, lostCatSanity: -20 },
  normal: { earnings: 1, newCatSanity: 50, lostCatSanity: -25 },
  hard: { earnings: 0.8, newCatSanity: 40, lostCatSanity: -31 },
};

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
export const PRODUCTS: Record<Product, { units: number; price: Record<Quality, number> }> = {
  food: { units: 21, price: { cheap: 40, premium: 80 } },
  hygiene: { units: 14, price: { cheap: 15, premium: 35 } },
};
export const START_SUPPLIES: Record<Product, Record<Quality, number>> = {
  food: { cheap: 6, premium: 0 },
  hygiene: { cheap: 7, premium: 0 },
};
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
