// Числа гри — лише тут: GAME_DESIGN.md посилається на константи за назвою, правила — у § біля константи.
// Одиниці, якщо не сказано іншого: час — ігрові хвилини (`*Hours`, `*Days`, `*Weeks` — години, дні, тижні; `*Seconds` —
// реальні секунди; `*Minute` — хвилина доби); відстань — клітинки підлоги; гроші — ₴; шанс і частка — від 0 до 1; показники,
// настрій, любов, потреби кота — шкала 0–100, стосунки — −100…+100.
// Рівень — рівень риси («+», «−» — його знак); `*Step` — крок за одиницю рівня; вага — варіанта, коли кіт обирає, що робити;
// `observeEvery` — прояв риси (§9.9) не частіше; `[a, b]` — від і до.

import type { RoomId } from "./home";
import type { CatNeed, CatTrace, CleaningTool, Destination, Difficulty, DiseaseId, IllnessId, Medicine, MessKind, Product, Quality, StatName, ThingKind } from "./types";

// Час (§8).
export const REAL_SECONDS_PER_GAME_HOUR = 30;
/** Темп дороги свій (§8.5), тож час на реакцію не залежить від темпу дня. */
export const RACE_SECONDS_PER_GAME_HOUR = 45;
/** Темп тіла (§8): числа руху й дій персонажа й котів задані для нього, тож у реальних секундах вони не залежать від темпу дня. */
export const BODY_SECONDS_PER_GAME_HOUR = 45;
/** Скільки ігрових хвилин триває хвилина тіла. */
export const BODY_PACE = BODY_SECONDS_PER_GAME_HOUR / REAL_SECONDS_PER_GAME_HOUR;
/** Розгін часу за комп'ютером (§8): від ×1 до ×`max` за `rampSeconds`. */
export const WORK_BOOST = { max: 10, rampSeconds: 40 } as const;

export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
export const DAYS_PER_WEEK = 7;

/** Тривалість гри (§4.2). */
export const TOTAL_WEEKS = 20;
export const TOTAL_DAYS = TOTAL_WEEKS * DAYS_PER_WEEK;

/** День і ніч (§8.9), хвилини доби. Лише вигляд: сим від них не залежить; `lampShift` — зсув світильників кімнати. */
export const DAYLIGHT = {
  dawn: 5 * 60,
  sunrise: 7 * 60,
  morningEnd: 9 * 60 + 30,
  eveningStart: 18 * 60,
  sunset: 19 * 60 + 30,
  night: 21 * 60,
  /** Частка нічної темряви на `sunrise` і `sunset`. */
  twilight: 0.35,
  warmMorning: { from: 6 * 60, to: 8 * 60 },
  warmEvening: { from: 19 * 60, to: 20 * 60 },
  lampsOn: 20 * 60,
  lampsOff: 6 * 60 + 30,
  lampFade: 20,
  lampShift: { living: 0, kitchen: 4, bedroom: -3, bathroom: 7 } satisfies Record<RoomId, number>,
  sunMorning: { from: 6 * 60, to: 9 * 60 + 30 },
  sunEvening: { from: 18 * 60, to: 20 * 60 + 15 },
} as const;

// Сон (§8.8). Вікна — години до наступного пробудження.
export const SLEEP_NEED_HOURS = 8;
export const BEDTIME_EARLIEST_HOURS_BEFORE_WAKE = 10;
/** Менше — «Сонливість». */
export const DROWSY_HOURS_BEFORE_WAKE = SLEEP_NEED_HOURS;
export const COLLAPSE_HOURS_BEFORE_WAKE = 6;
/** Швидкість наступного дня за годину сну понад норму чи менше; стеля — `SLEEP_SPEED_MAX_BONUS`. */
export const SLEEP_SPEED_PER_HOUR = 0.05;
export const SLEEP_SPEED_MAX_BONUS = 0.1;
/** «Сонливість»: множник швидкості дій і руху. */
export const DROWSY_SPEED = 0.8;
/** Уві сні голод і гігієна падають у стільки разів повільніше. */
export const SLEEP_DECAY_DIVIDER = 4;
/** Якщо персонаж ліг ситим (від `LOW_STAT`) і не хворий. */
export const SLEEP_HEALTH_PER_HOUR = 1;
/** За кожну годину менше `SLEEP_NEED_HOURS`. */
export const SLEEP_DEBT_HEALTH_PER_HOUR = -2;
export const SLEEP_STAT_FLOOR = 5;

/** Хвилина пробудження за хронотипом (§5.1). */
export const WAKE_MINUTE = {
  lark: 6 * MINUTES_PER_HOUR,
  owl: 8 * MINUTES_PER_HOUR,
} as const;

// Показники (§6, §6.3).
export const STAT_MAX = 100;
export const START_STATS: Record<StatName, number> = {
  health: 100,
  satiety: 70,
  hygiene: 80,
  sanity: 40,
};
export const START_MONEY = 450;
/** Ситість і гігієна за годину неспання. */
export const SATIETY_PER_HOUR = -4;
export const HYGIENE_PER_HOUR = -3;
export const DASH_SATIETY = -0.25;
/** Коли ситість нижче `HUNGER_HEALTH_THRESHOLD`. */
export const HUNGER_HEALTH_PER_HOUR = -2;
export const HUNGER_HEALTH_THRESHOLD = 25;

// Низькі показники (§6.3).
export const LOW_STAT = 25;
/** Множник руху за низького здоров'я чи ситості, кожне окремо. */
export const LOW_STAT_SPEED = 0.8;
/** Шанс збою керування за хвилину руху при здоровому глузді 0. */
export const GLITCH_MAX_CHANCE_PER_MINUTE = 0.4;
export const GLITCH_MINUTES = 0.5;
/** Зсув напрямку під час збою, градуси. */
export const GLITCH_ANGLE_MIN = 60;
export const GLITCH_ANGLE_MAX = 150;

/** Модифікатор першого дня (§4.1, §8.3). */
export const FIRST_DAY_MODIFIER = "first-day";

// Здоровий глузд (§6.2, §8.3).
/** Нижче — ввечері кошеня з притулку. */
export const KITTEN_SANITY_THRESHOLD = 35;
/** Межа падіння при втраті кота й у «Пригніченості». */
export const SANITY_FLOOR = 10;
/** Невидимий захист (§8.3, §8.6): `floor` — здоровий глузд, поки вдома не було кота; `reputation` — перші `days` днів. */
export const FIRST_WEEK_PROTECTION = { days: 7, floor: 1, reputation: 1 };
export const KITTEN_AGE_WEEKS = 1;
/** Найдовше ім'я, яке можна ввести: персонажа й кошеняти. */
export const NAME_MAX_LENGTH = 20;

/** Складність (§5.2): `earnings`, `catSanity` — множники, решта — здоровий глузд за кота. */
export const DIFFICULTY: Record<
  Difficulty,
  { earnings: number; catSanity: number; newCatSanity: number; lostCatSanity: number; givenCatSanity: number }
> = {
  easy: { earnings: 1.25, catSanity: 1.25, newCatSanity: 62, lostCatSanity: -20, givenCatSanity: -12 },
  normal: { earnings: 1, catSanity: 1, newCatSanity: 50, lostCatSanity: -25, givenCatSanity: -15 },
  hard: { earnings: 0.8, catSanity: 0.8, newCatSanity: 40, lostCatSanity: -31, givenCatSanity: -19 },
};
/** Частка `lostCatSanity` за другу й наступні смерті тієї самої ночі (§6.2): старий виводок відходить разом. */
export const LOST_CAT_REPEAT = 0.5;
/** Віддати кота раніше — втратити весь бонус за нього (§9.8). */
export const GIVE_AWAY_GRACE_DAYS = 7;

/** «Пригніченість»: без котів здоровий глузд не вище цього. */
export const DEPRESSION_CEILING = KITTEN_SANITY_THRESHOLD;

// Рух (§8.4), клітинки підлоги.
export const WALK_TILES_PER_MINUTE = 3;
/** Ривок: множник швидкості, тривалість, пауза. */
export const DASH_SPEED = 3;
export const DASH_MINUTES = 0.25;
export const DASH_COOLDOWN_MINUTES = 1.5;
export const BODY_RADIUS = 0.3;
/** Відстань взаємодії з річчю. */
export const REACH = 0.75;
/** Наскільки річ, на яку дивиться персонаж, важливіша за ближчу. */
export const FACING_PRIORITY = 0.5;
export const INPUT_DEADZONE = 0.15;

// Побут (§8.7).
export const COOK_MINUTES = 20;
/** Від того, як поставили сиру. */
export const BURN_MINUTES: Record<Difficulty, number> = { easy: COOK_MINUTES + 45, normal: COOK_MINUTES + 30, hard: COOK_MINUTES + 15 };
export const EAT_MINUTES = 10;
export const SHOWER_MINUTES = 10;
export const MEAL_SATIETY: Record<Quality, number> = { cheap: 40, premium: 55 };
/** `none` — без засобів. */
export const SHOWER_HYGIENE: Record<Quality | "none", number> = { none: 8, cheap: 60, premium: 80 };

// Економіка (§6.4).
/**
 * Запаси: `units` — порцій, чисток, доз в упаковці. Ліміт сховища ділиться на упаковку: закупівля «до повного» не лишає 1–2
 * одиниці.
 */
export const PRODUCTS: Record<Product, { units: Record<Quality, number>; price: Record<Quality, number> }> = {
  food: { units: { cheap: 20, premium: 20 }, price: { cheap: 60, premium: 180 } },
  hygiene: { units: { cheap: 15, premium: 15 }, price: { cheap: 23, premium: 75 } },
  catFood: { units: { cheap: 55, premium: 55 }, price: { cheap: 150, premium: 450 } },
  sterileFood: { units: { cheap: 55, premium: 55 }, price: { cheap: 180, premium: 495 } },
  litter: { units: { cheap: 10, premium: 4 }, price: { cheap: 17, premium: 33 } },
  pills: { units: { cheap: 5, premium: 5 }, price: { cheap: 23, premium: 75 } },
  drops: { units: { cheap: 5, premium: 5 }, price: { cheap: 30, premium: 113 } },
  humanMeds: { units: { cheap: 5, premium: 5 }, price: { cheap: 30, premium: 98 } },
  treats: { units: { cheap: 20, premium: 20 }, price: { cheap: 23, premium: 75 } },
  // Без якостей: `SINGLE_VARIANT`.
  collar: { units: { cheap: 1, premium: 1 }, price: { cheap: 23, premium: 23 } },
  shampoo: { units: { cheap: 5, premium: 5 }, price: { cheap: 15, premium: 60 } },
  detergent: { units: { cheap: 5, premium: 5 }, price: { cheap: 18, premium: 68 } },
  catnip: { units: { cheap: 5, premium: 5 }, price: { cheap: 23, premium: 68 } },
  // Не продаються (`UNSOLD`), ціни немає.
  momMeal: { units: { cheap: 2, premium: 2 }, price: { cheap: 0, premium: 0 } },
};
/** Немає в магазині: мамині судочки — лише від мами (§4.1). */
export const UNSOLD: readonly Product[] = ["momMeal"];
/** З одним варіантом (§9.10): магазин продає лише «дешевий». */
export const SINGLE_VARIANT: readonly Product[] = ["collar"];
/** Речі з одним варіантом: магазин теж продає лише «дешевий». */
export const SINGLE_VARIANT_THINGS: readonly ThingKind[] = ["vacuum"];
/** Для себе (§11.3а): лише їх магазин показує, поки вдома не було кота. */
export const SELF_PRODUCTS: readonly Product[] = ["food", "hygiene", "humanMeds", "detergent"];
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
  shampoo: { cheap: 0, premium: 0 },
  detergent: { cheap: 0, premium: 0 },
  catnip: { cheap: 0, premium: 0 },
  momMeal: { cheap: 0, premium: 0 },
};
/** Межі часток станів сховища: «мало», «половина», «багато». */
export const FILL_STAGES = [0.45, 0.75, 1] as const;
/** Місткість сховища: кратна десяти, щонайменше 10, ділиться на упаковку (`PRODUCTS`). */
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
  shampoo: 10,
  detergent: 10,
  catnip: 10,
  momMeal: 10,
};
/** Стартовий пакет кота з притулку (§9.12). */
export const SHELTER_STARTER_PACK = { catFood: 8, litter: PRODUCTS.litter.units.cheap };
/** Доставка: `share` — частка ціни кожного товару, `fee` — надбавка за замовлення. */
export const DELIVERY = { share: 0.1, fee: { easy: 12, normal: 15, hard: 18 } as Record<Difficulty, number> } as const;
export const DELIVERY_HOURS = 6;
/** Якщо персонаж спить, привезуть у цю хвилину наступного дня. */
export const DELIVERY_NEXT_DAY_MINUTE = 9 * MINUTES_PER_HOUR;
/** Комунальні за тиждень без внеску речей. */
export const UTILITIES_BASE = 51;
/** Речі для котів: ціна й внесок у комунальні за тиждень. */
export const THINGS: Record<ThingKind, { price: Record<Quality, number>; utilities: number }> = {
  bowl: { price: { cheap: 20, premium: 120 }, utilities: 2 },
  water: { price: { cheap: 20, premium: 120 }, utilities: 2 },
  litter: { price: { cheap: 50, premium: 300 }, utilities: 6 },
  // Дорога міцніша (`TOY.durability`) і з дзвіночком (`TOY.bell`).
  toy: { price: { cheap: 20, premium: 120 }, utilities: 0 },
  house: { price: { cheap: 120, premium: 700 }, utilities: 9 },
  scratcher: { price: { cheap: 120, premium: 700 }, utilities: 9 },
  carrier: { price: { cheap: 60, premium: 300 }, utilities: 0 },
  feeder: { price: { cheap: 2000, premium: 4000 }, utilities: 12 },
  fountain: { price: { cheap: 2400, premium: 4800 }, utilities: 9 },
  robot: { price: { cheap: 3000, premium: 6000 }, utilities: 15 },
  // Замок на шафку з кормом (`CUNNING.cheapLock`).
  lock: { price: { cheap: 30, premium: 120 }, utilities: 0 },
  // Замінює віник (§8.7). Новий запис — лише в кінець: місце в `GOODS` задає ціну магазину.
  vacuum: { price: { cheap: 1600, premium: 1600 }, utilities: 6 },
};
/** Порції (§9.12). */
export const FEEDER_CAPACITY: Record<Quality, number> = { cheap: 8, premium: 20 };
/** Ремонт дивана до найближчого платежу. */
export const SOFA_REPAIR = 5;
export const DELIVERED_TOY_AT = { x: 9.5, y: 9.3 } as const;

// Робота (§8.6).
export const WORK_START_MINUTE = 9 * MINUTES_PER_HOUR;
export const WORK_END_MINUTE = 18 * MINUTES_PER_HOUR;
export const WORKDAYS_PER_WEEK = 5;
export const PATIENCE_MAX = 100;
/** Нижче — «!» над комп'ютером. */
export const PATIENCE_WARNING = 50;
export const START_REPUTATION = 50;
export const REPUTATION_MAX = 100;
/** Стан «Х»: × репутація за годину посади. */
export const ABSENCE_REPUTATION = -3;
export const STANDUP_MINUTE = 10 * MINUTES_PER_HOUR;
export const STANDUP_MINUTES = 60;
/** Летучку зараховано від такої частки часу. */
export const STANDUP_ATTENDANCE = 0.5;
/** × репутація за годину посади. */
export const STANDUP_MISSED_REPUTATION = -1;
/** Нижче `LOW_STAT` — штраф, від `HIGH_HYGIENE` — бонус (× репутація за годину). */
export const CALL_HYGIENE_REPUTATION = 0.5;
/** `reputation` — штраф у годинах роботи (§5.1, §8.7). */
export const CALL_DIRTY_CLOTHES = { reputation: 0.5, noticeMinute: 5 } as const;
export const HIGH_HYGIENE = 75;
/** Пошук роботи: `sanityShare` — частка від найнижчої посади; `stages` — етапів вакансії. */
export const JOB_SEARCH = { hours: { easy: 16, normal: 20, hard: 24 } as Record<Difficulty, number>, sanityShare: 0.5, stages: 4 } as const;

/** Множник `POSITIONS.reputation` за години роботи: кар'єра вміщується в гру; штрафи й події — без нього. */
export const CAREER_PACE = 2.5;
/**
 * Посади: `pay` — ₴, решта теж за годину. Репутацію підібрано, щоб сумлінний гравець ставав директором ближче до кінця гри.
 */
export const POSITIONS: readonly {
  pay: number;
  patienceDecay: number;
  patienceRecovery: number;
  reputation: number;
  sanity: number;
}[] = [
  { pay: 10, patienceDecay: 25, patienceRecovery: 58, reputation: 3.09, sanity: -6 },
  { pay: 13, patienceDecay: 27, patienceRecovery: 54, reputation: 2.36, sanity: -6.3 },
  { pay: 15, patienceDecay: 29, patienceRecovery: 51, reputation: 1.79, sanity: -6.6 },
  { pay: 16, patienceDecay: 31, patienceRecovery: 47, reputation: 1.37, sanity: -7 },
  { pay: 17, patienceDecay: 33, patienceRecovery: 44, reputation: 1.08, sanity: -7.3 },
  { pay: 18, patienceDecay: 35, patienceRecovery: 41, reputation: 0.85, sanity: -7.6 },
  { pay: 19, patienceDecay: 37, patienceRecovery: 38, reputation: 0.68, sanity: -7.9 },
  { pay: 20, patienceDecay: 38, patienceRecovery: 34, reputation: 0.55, sanity: -8.2 },
  { pay: 22, patienceDecay: 40, patienceRecovery: 32, reputation: 0.45, sanity: -8.6 },
  { pay: 24, patienceDecay: 42, patienceRecovery: 29, reputation: 0.37, sanity: -8.9 },
  { pay: 26, patienceDecay: 44, patienceRecovery: 27, reputation: 0.31, sanity: -9.2 },
  { pay: 29, patienceDecay: 46, patienceRecovery: 24, reputation: 0.26, sanity: -9.5 },
  { pay: 33, patienceDecay: 48, patienceRecovery: 22, reputation: 0.22, sanity: -9.9 },
  { pay: 38, patienceDecay: 50, patienceRecovery: 20, reputation: 0.19, sanity: -10.2 },
  { pay: 45, patienceDecay: 52, patienceRecovery: 17, reputation: 0.16, sanity: -10.5 },
];

/** Оплата посад старих збережень: така посада стає посадою `POSITIONS` із найближчою оплатою. */
export const LEGACY_POSITION_PAY: readonly number[] = [10, 13, 17, 22, 28, 35, 43, 52, 62, 75];

// Коти (§9.1–9.6, §9.12).
export const CAT_AGE_LIMIT = 5;
/** Без «Довголіття» (§9.1). */
export const MAX_TRAITS = 12;
/** Шанс сильної (±2) нової риси (§9.1). */
export const STRONG_TRAIT_CHANCE = 0.3;
export const CAT_START = {
  outside: { mood: 40, love: 25 },
  born: { mood: 60, love: 50 },
} as const;
/** Адаптація кота ззовні (§9.6): дні й множник голоду. */
export const ADAPTATION_DAYS = 2;
export const ADAPTATION_HUNGER = 0.5;

/** Ріст потреб за годину, × активність години. */
export const NEED_PER_HOUR: Record<CatNeed, number> = {
  hunger: 8,
  thirst: 12,
  toilet: 12,
  fatigue: 7,
  attention: 8,
  play: 15,
};
/** Пороги, з яких кіт іде до потреби. */
export const NEED_THRESHOLD = { hunger: 80, thirst: 60, toilet: 80, attention: 60, play: 70 } as const;
/** Мінус втома за годину сну кота; `SLEEP_START` — поріг засинання: `base` + `activity` × активність години. */
export const SLEEP_RECOVERY_PER_HOUR = 5;
export const SLEEP_START = { base: 40, activity: 40 } as const;
/** «Енергійність» (§9.12): `activeHour` — активність години для прояву «−»; `bored` — множник бешкету. */
export const ENERGY = { sleepStep: 0.2, maxThreshold: 95, activeHour: 1, bored: 1.5 } as const;
/** Кіт прокидається на цій утомі. */
export const SLEEP_END = 10;
export const MIN_CAT_NAP_MINUTES = 30;
/** Множник утоми понад межу віку чи зі здоров'ям нижче `LOW_HEALTH.low`. */
export const TIRED_FATIGUE = 1.3;
/** Низьке здоров'я кота (§9.5): пороги й множники потреби гри. */
export const LOW_HEALTH = { low: 50, lowPlay: 0.7, weak: 25, weakPlay: 0.3 } as const;
/** Множники потреби гри (§9.3): кошенята до `KITTEN_MAX_AGE` тижнів, старі коти. */
export const KITTEN_PLAY = 1.5;
export const OLD_PLAY = 0.6;
export const KITTEN_MAX_AGE = 2;
/** Кроки рис: потреби, апетит (`APPETITE_STEP`), сон (`SLEEP_TRAIT_STEP`, зі зворотним знаком). */
export const TRAIT_NEED_STEP = 0.25;
/** Кроки рис (§9.9, `TRAITS.md`): `beggingChance` — шанс просити ще; `demanding*` — «Вимогливість». */
export const TRAIT_EFFECTS = {
  beggingChance: 0.3,
  vetStep: 0.5,
  markingStep: 0.5,
  demandingStep: 0.25,
  demandingMeowStep: 0.5,
  demandingIgnoredStep: 0.5,
} as const;
/** «Хвостик» (§9.12). */
export const FOLLOWER = { chanceStep: 0.25, minutes: 5, near: 1.2, seenWithin: 2, waited: 2 } as const;
/** «Балакучість» (§9.12): `quiet` — частота «Мовчазного»; `seenDifference` — разів; `work*` — біля того, хто працює. */
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
/** Різниця тривалості походу для прояву (§9.9). */
export const DEMANDING_SEEN_MINUTES = 0.5;
export const APPETITE_STEP = 0.15;
/** «Апетит» (§9.12). Стелі шансів — бо породи вже мають «Апетит» +1. */
export const APPETITE = { thresholdStep: 10, secondStep: 0.1, secondMax: 0.4, halfStep: 0.3, halfMax: 0.8, snackHunger: 30, snackStep: 0.07 } as const;
/** «Швидкість їжі» (§9.12): час порції — `CAT_ACT_MINUTES.eat` × `factor`^рівень, від `min` до `max`. */
export const GULPING = { factor: 0.7, min: 1.5, max: 6, crowded: 1.5, near: 3, slowBowl: 0.5 } as const;
export const SLEEP_TRAIT_STEP = 0.15;

/** Активність за годиною доби — сутінковий ритм (§9.3); `from`, `to` — години. */
export const ACTIVITY_BY_HOUR: readonly { from: number; to: number; activity: number }[] = [
  { from: 4, to: 8, activity: 1 },
  { from: 8, to: 11, activity: 0.6 },
  { from: 11, to: 16, activity: 0.25 },
  { from: 16, to: 18, activity: 0.6 },
  { from: 18, to: 23, activity: 1 },
];
/** Активність уночі; `NOCTURNAL_STEP` — додаток «Нічної активності». */
export const NIGHT_ACTIVITY = 0.3;
export const NOCTURNAL_STEP = 0.2;
/** «Нічна активність» (§9.12); `bedFrom`, `bedTo` — години. */
export const NOCTURNAL = { bedStep: 0.5, bedShare: 5 / 6, bedFrom: 23, bedTo: 5, minNightMinutes: 180, mischiefEvery: 12 * 60 } as const;

/** Рух кота, клітинки за хвилину; `FURNITURE_COST` — у скільки разів меблі «дорожчі» за підлогу. */
export const CAT_WALK_TILES_PER_MINUTE = 2.5;
export const FURNITURE_COST = 3;

/** Кіт іде, щойно потреба уваги нижче цього. */
export const ATTENTION_SATISFIED = 20;
/** Тривалість дій кота на місці. */
export const CAT_ACT_MINUTES = { eat: 3, drink: 1, toilet: 2, beg: 15, attention: 20, idle: 10, wander: 8, hide: 30 } as const;
/** Скільки голоду знімає порція. */
export const PORTION_HUNGER = 100;
/** Кіт чує, як насипають корм: голод, з якого біжить. */
export const FOOD_SOUND = { hunger: 50, appetiteStep: 10 } as const;
/** «Пиття» (§9.12): `stonesStep` — шанс сечокам'яної. */
export const DRINKING = { sinkStep: 0.4, tapMood: 2, bowlMood: -1, fountainMood: 1, spill: 0.25, cheapSpill: 0.05, freshThirst: 20, stonesStep: 0.25, premiumStones: 0.5, mug: 0.5, mugMood: 1 } as const;
/** Місткість: порції й ковтки. */
export const BOWL_CAPACITY = 2;
export const WATER_CAPACITY: Record<Quality, number> = { cheap: 8, premium: 12 };
/** Бак простого фонтанчика, ковтки (§8.7): один на всі поїлки, кіт п'є приблизно 5 разів на добу. */
export const FOUNTAIN = { tank: 40 } as const;
/** Лоток брудний після стількох відвідин. */
export const LITTER_CAPACITY: Record<Quality | "none", number> = { none: 1, cheap: 3, premium: 5 };
/** Закритий лоток із наповнювачем служить на стільки походів довше (§9.12). */
export const CLOSED_LITTER_USES = 1;
/** Шанс промаху повз відкритий лоток (§9.12): × (1 + `SCATTER_CHANCE.step` × «Розкидання наповнювача»). */
export const LITTER_MISS = 0.1;
export const CLEAN_LITTER_MINUTES = 3;
export const CLEAN_MESS_MINUTES = 2;
/** Неприємні завдання (§8.1), здоровий глузд за раз. */
export const LITTER_SANITY = -3;
export const MESS_SANITY: Record<MessKind, number> = { surprise: -4, vomit: -4, hairball: -4, litter: -2, broken: -2, fur: -2, mark: -3, pee: -3, puddle: -1, paper: -1, garbage: -3 };

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
  // Якість речі: за кожне використання (§6.4).
  premiumItem: 0.25,
  cheapItem: -0.25,
} as const;
/** Шанс відмовитися від дешевого корму за одиницю. */
export const PICKY_REFUSAL_STEP = 0.4;
/** «Перебірливість» (§9.12). */
export const PICKY = { starving: 95, starvingFactor: 0.5, buryMinutes: 1, cheapJoy: 1 } as const;
/** Кіт нюхає корм чи лоток, перш ніж відмовитися (§9.12 «Їжа й гігієна»). */
export const SNIFF_MINUTES = 0.5;
/** «Жебракування» (§7, §9.12): `habit*` — звичка, додаток до шансу. */
export const BEGGING = { habitStep: 0.1, habitMax: 0.3, habitDecay: 0.05, treatAsk: 0.3, washMinutes: 2 } as const;
/** Зміна втрат настрою за одиницю «Стресостійкості». */
export const STRESS_STEP = 0.2;
/** Вище `from` підвищення настрою × (100 − настрій) / (100 − `from`) (§9.6). */
export const MOOD_SATURATION = { from: 50 } as const;
/** Шанс «сюрпризу» поза лотком; `step` — за рівень «Вибагливості до лотка». */
export const SURPRISE_CHANCE = { base: 0.15, step: 0.3 } as const;
/** Брудний лоток; `pickyStep` — «Вибагливість до лотка». */
export const DIRTY_LITTER = { love: -1, pickyStep: 0.5, earlyLevel: 2 } as const;
/** Кіт на руках (§9.12): `mood`, `attention`, `struggleMood` — за хвилину; `seen*` — хвилин до прояву. */
export const CARRY = { mood: 0.5, attention: 5, struggleMood: -0.5, bite: 0.1, biteStep: 0.1, escape: 0.25, seenContent: 1, seenStruggle: 0.5, observeEvery: 60 } as const;
/** Нижче цієї потреби уваги кіт без любові до рук іде на них проти волі. */
export const UNWILLING_ATTENTION = 40;
/** Чистюлі й брудний одяг: `picky` — рівень «Вибагливості до лотка». */
export const DIRTY_CLOTHES_CATS = { picky: 1, backAway: 3, observeEvery: 60 } as const;
/** Заздрісність (§9.12): `mood`, `relation`, `glad` — за одиницю; `cuddle*` — щиросердий. */
export const ENVY = { mood: -2, relation: -4, glad: 1, sight: 5, graceMinutes: 2, near: 2, snatch: 0.2, snatchLevel: 2, snatchReach: 1.5, cuddleMinutes: 5, cuddleRelation: 1 } as const;
/**
 * Вага кота (§9.5, §9.12 «Тіло й тепло»): `portion`, `treat`, `stolen` — набір; `perHour`, `playLoss` — втрата; `obese`,
 * `cured` — межі «Ожиріння»; `girthStep` — ширина на малюнку.
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
/** «Теплолюбність» (§9.12): `tileStep`, `heatTile` — вага прохолодної плитки; `sillStep` — підвіконня над батареєю. */
export const WARMTH = { sun: 2, coldStep: 0.5, coolStep: 0.5, tileStep: 1.5, heatTile: 2, blanketLevel: 2, feelEvery: 180, heatThirstStep: 0.25, observeEvery: 120, sillStep: 1 } as const;
/** Мстивість (§9.12): `perHour` — шанс за одиницю; `refundStep` — додаток до `TREATS.refund`. */
export const REVENGE = { minutes: 240, perHour: 0.1, refundStep: 0.25 } as const;
/** «Образливість» (§9.12). `againMinutes` — інакше думка вискакувала б щокадру. */
export const TOUCHY = { baseMinutes: 15, sulkMinutes: 30, near: 1.5, againMinutes: 2 } as const;
/** «Розкидання наповнювача» (§9.12): `closedBox` — множник закритого лотка. */
export const SCATTER_CHANCE = { base: 0.2, step: 0.75, closedBox: 0.5, buryMinutes: 1 } as const;

/** Любов (§7, §9.6): день без взаємодії; дрейф настрою за день на очко понад 50. */
export const LOVE = {
  noInteractionPerDay: -1,
  driftPerPoint: 6 / 100,
} as const;
/** Любов у поведінці (§9.12): `tolerancePerPoint` — частка терпіння за очко понад 50. */
export const LOVE_BEHAVIOR = { aloof: 25, devoted: 75, tolerancePerPoint: 0.01, lapBonus: 0.25, biteFactor: 0.5 } as const;
/** Думки-бабли (§11.4): пороги — із запасом до `NEED_THRESHOLD`, щоб думку встигло бути видно й на важкій. */
export const THOUGHTS = {
  hungerLead: 20,
  thirst: 35,
  play: 45,
  attention: 40,
  sad: 35,
  personLow: 40,
  catSeconds: 40,
  catGapSeconds: 10,
  personSeconds: 40,
  apartSeconds: 2,
  jitter: 0.2,
  frequency: { easy: 1.25, normal: 1, hard: 0.8 } as Record<Difficulty, number>,
} as const;
/** Настрій з поведінки (§11.4). */
export const MOOD_LOOK = { blinkMood: 70, blinkDistance: 4, blinkSeconds: 8, nudgeDistance: 1.2 } as const;
/** Зміна зростання й втрат любові за одиницю «Відданості» й «Образливості». */
export const LOVE_TRAIT_STEP = 0.25;
/** «Відданість» (§9.12). */
export const DEVOTION = { greetBase: 0.2, greetStep: 0.2, greetLove: 0.4, greetMax: 0.9, greetMinutes: 6, stayMinutes: 2, blinkStep: 10 } as const;

/** Здоров'я кота за день від середнього настрою (§9.6); між таблицями — 0. */
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
/** Множники відновлення здоров'я (§9.5); `RECOVERY_TRAIT_STEP` — «Витривалість». */
export const RECOVERY_BY_AGE = { young: 1.5, adult: 1, old: 0.5 } as const;
export const RECOVERY_TRAIT_STEP = 0.2;

/** Пестощі (§8.2, §9.12), за хвилину. */
export const PET = {
  sanity: 2,
  unwantedSanity: 1,
  mood: 1,
  unwantedMood: -1,
  love: 0.5,
  tooLongMood: -2,
  wantsAttention: 40,
  attentionPerMinute: 4,
  toleranceMinutes: 5,
  toleranceStep: 0.5,
  minToleranceMinutes: 2,
  biteChancePerMinute: 0.3,
  biteHealth: -3,
  /** Узяли на руки, коли кіт не хотів. */
  unwantedLove: -2,
} as const;
/** «Ласкавість» (§9.12). */
export const AFFECTION = { leaveAfter: 2, observeEvery: 60 } as const;
/** «Терпимість до гладження» (§9.12). */
export const PETTING = { warnMinutes: 1, bellyDistance: 1.5, restMinutes: 15 } as const;

/** Котячі побудки (§8.8, §9.12). */
export const WAKE_UP = {
  morningMinute: 5 * MINUTES_PER_HOUR,
  morningBase: 0.1,
  morningStep: 0.25,
  nightStep: 0.15,
  /** Ранкова — лише з такого голоду. */
  hungry: 80,
  /** Ранкова побудка вночі: втрата сну, персонаж засинає знову. */
  lostMinutes: 30,
  /** Нічна побудка; день починає лише ранкова. */
  nightLostMinutes: 60,
  /** Усіх побудок за ніч (§9.12). */
  maxPerNight: 2,
  /** «Ранкова побудка»: `ritual` — частка шансу заради ритуалу. */
  ritual: 0.5,
  waitHunger: 60,
} as const;

// Гра й бешкет (§9.12).
/** Іграшка: `durability` — ігор. */
export const TOY = {
  durability: { cheap: 15, premium: 40 } as Record<Quality, number>,
  aloneMinutes: 4,
  /** Дзвіночок на дорогій (§6.4): шанс, що «Нудьгар» не зважає, далекість зманювання з висоти, швидкість, з якою кіт награється. */
  bell: { ignore: 0.5, lure: 1.6, drain: 1.5 },
} as const;
/** Гра з персонажем, за хвилину; нижче `bored` потреби гри кіт іде. */
export const PLAY = { sanity: 4, playfulStep: 0.25, mood: 1, love: 0.5, needPerMinute: 15, bored: 10 } as const;
/** «Ігривість» (§9.12): `boredLevel`, `ignore` — «Нудьгар». */
export const PLAYFUL = { lengthStep: 0.25, boredLevel: 2, ignore: 0.3, inviteStep: 0.3, inviteMinutes: 10, thanksMinutes: 10, thanksLove: 1, observeEvery: 60 } as const;
/** «Котяча м'ята» (§9.12): масиви — за рівнем 0, +1, +2. */
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
/** «Вікно» (§9.12): `from`, `to` — години; `anger*` — «Нудьгує біля вікна»; `contest` — обидва підвіконня зайняті. */
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
/** «Слухняність» (§9.12): `comeback*` — «Анархіст». */
export const OBEDIENCE = { minutes: 120, step: 0.5, rememberMinutes: 1, comebackLevel: 2, comeback: 0.5, comebackMinutes: 10, comebackWindow: 30, observeEvery: 60, thoughtEvery: 30, approachEvery: 30 } as const;
/** «Товариськість» (§9.4, §9.12): `pass*` — «−» шипить на перехожого. */
export const SOCIABILITY = { passDistance: 1.5, passStep: 0.15, passEvery: 10, passPause: 120, passRelation: -1, pileStep: 1.5, observeEvery: 60 } as const;
/** «Вилизування друзів» (§9.4, §9.12). */
export const GROOMING = { refuseStep: 0.4, refuseRelation: -1, pileStep: 0.25, refusedMinutes: 60 } as const;
/** «Ревнивість» (§9.4, §9.12); стосунки й поле зору — `RELATIONS.jealousy*`. */
export const JEALOUSY = { near: 2, leave: 0.5, lapLevel: 2, comeStep: 0.25, confrontMinutes: 0.25, cuddleStep: 0.2, cuddleMinutes: 5, cuddleRelation: 1, pauseMinutes: 30 } as const;
/** «Територіальність» (§9.4, §9.12): `enemyLevel` — від ворога охороняє кожен кіт, щонайменше так. */
export const TERRITORY = { enemyLevel: 1, guardStep: 0.3, guardReach: 2, guardRelation: -3, guardPause: 30, guardLevel: 2, guardMinutes: 10, surpriseNeed: 95, surpriseChance: 0.3, shareEvery: 30 } as const;
/** «Турбота про кошенят» (§9.4, §9.12). */
export const NURTURING = { relationStep: 10, groomStep: 0.2, groomMood: 2, groomRelation: 1, hugStep: 1.5, warmPerHour: 0.5, motherMood: 1, swatReach: 1.2, swatStep: 0.5, swatMood: -2, swatPause: 60, observeEvery: 60 } as const;
/** Ваги варіантів, коли кіт хоче гратися; `traitStep` — риса; від голоду `hungryFrom` вага крадіжки × `hungrySteal`. */
export const MISCHIEF = { zoomies: 0.3, knock: 0.3, steal: 0.2, toy: 0.5, wander: 0.5, scratch: 0.3, traitStep: 0.5, hungryFrom: 60, hungrySteal: 2 } as const;
/** Дрібнички на столах (§9.12): `repair` — до ремонту. */
export const KNOCKING = { weight: 0.15, sniffStep: 0.5, sniffMinutes: 0.5, mugBreaks: 0.5, repair: 3, ignoredMinutes: 5, attentionStep: 0.2, reach: 6 } as const;
/** «Допитливість» (§9.12). */
export const CURIOSITY = { boxStep: 1, sniffStep: 0.5, sniffMinutes: 1, shunMinutes: 0.5, shunHours: 2, freshHours: 4 } as const;
/** Кігтеточка чи диван (§9.12): `premium`, `cheap` — шанс обрати кігтеточку; `relief` — скільки гри знімає. */
export const SCRATCH = { premium: 0.9, cheap: 0.6, traitStep: 0.2, minutes: 2, relief: 30, mood: 1, weight: 0.3, frequencyStep: 0.25, minWeight: 0.15, calmSofa: 0.5, boxes: 0.5, doorframe: 0.3, afterSleep: 0.25, afterSleepMinutes: 60 } as const;
/** Котячі сліди (§9.12 «Гра й бешкет»): поріг котоднів — щоночі плюс котів удома. */
export const TRACE_CAT_DAYS: readonly { trace: CatTrace; catDays: number }[] = [
  { trace: "bath-mat", catDays: 2 },
  { trace: "bedroom-rug", catDays: 5 },
  { trace: "wallpaper", catDays: 9 },
  { trace: "lino", catDays: 14 },
];
/** «Мисливський інстинкт» (§9.12): `solo*` — множник гри наодинці. */
export const HUNTING = { roll: 0.05, rollStep: 0.75, kitten: 2, pawMinutes: 1, soloStep: 0.25, soloMin: 0.5, wearStep: 0.5, observeEvery: 30 } as const;
/** «Подарунки й схованки» (§9.12): `sockSearch` — на скільки довший виїзд. */
export const GIFTS = { weight: 0.15, base: 0.05, fridge: 0.5, pickMinutes: 0.3, sockSearch: 10, stray: 0.03, strayReach: 3 } as const;
/** «Кмітливість у бешкеті» (§9.12): `full*` — лізе в шафку ситим. */
export const CUNNING = { openStep: 0.15, pawMinutes: 1, fullLevel: 2, fullWeight: 0.1, fullVomit: 0.3, trashStep: 0.1, cheapLock: 0.3, observeEvery: 30 } as const;
/** «Лазіння» (§9.12): `kitten`, `strong` — шанс застрягти. */
export const CLIMBING = { base: 0.3, step: 1.5, warmStep: 0.5, kitten: 0.2, strong: 0.05, strongLevel: 2, lureReach: 2.5, rescueSanity: -1, jumpNeed: 95, jumpMood: -3, jumpInjury: 0.2 } as const;
/** «Гризіння» (§9.12): `decideStep` — шанс за спокійне рішення. */
export const CHEWING = { decideStep: 0.02, kitten: 0.01, playWeight: 0.1, minMinutes: 2, maxMinutes: 3, wireChance: 0.15, fixMinutes: 15, fixSanity: -2, wireRepair: 8 } as const;
/** «Засідки» (§9.12): `waitRelief` — частка `PLAY_RELIEF` без стрибка. */
export const AMBUSH = { step: 0.25, base: 0.04, kitten: 0.1, bored: 2, played: 0.5, playedMinutes: 5, minutes: 10, reach: 1, strongLevel: 2, dashMinutes: 0.5, waitRelief: 0.5 } as const;
/**
 * Хвороби котів (§9.5): `safe` — безпечні дні; `damage` — шкода за день; `recovers` — днів до самолікування (null — лише
 * лікування).
 */
export const DISEASES: Record<
  DiseaseId,
  {
    safe: number;
    damage: number;
    recovers: number | null;
    cure: { kind: Medicine; doses: number } | { kind: "diet"; portions: number } | { kind: "calm"; days: number } | { kind: "vet" } | { kind: "control"; medicine: Medicine } | { kind: "weight" };
    contagious: "friends" | "litter" | null;
  }
> = {
  cold: { safe: 3, damage: 2, recovers: 10, cure: { kind: "pills", doses: 4 }, contagious: "friends" },
  fleas: { safe: 5, damage: 1, recovers: null, cure: { kind: "drops", doses: 1 }, contagious: "friends" },
  worms: { safe: 5, damage: 2, recovers: null, cure: { kind: "pills", doses: 1 }, contagious: "litter" },
  stomach: { safe: 2, damage: 2, recovers: 4, cure: { kind: "diet", portions: 4 }, contagious: null },
  injury: { safe: 3, damage: 1, recovers: 14, cure: { kind: "vet" }, contagious: null },
  cystitis: { safe: 3, damage: 2, recovers: null, cure: { kind: "calm", days: 2 }, contagious: null },
  conjunctivitis: { safe: 4, damage: 1, recovers: 10, cure: { kind: "drops", doses: 2 }, contagious: "friends" },
  urolithiasis: { safe: 1, damage: 6, recovers: null, cure: { kind: "vet" }, contagious: null },
  dermatitis: { safe: 5, damage: 1, recovers: null, cure: { kind: "vet" }, contagious: null },
  // Минає, щойно вага повернеться (`WEIGHT.cured`).
  obesity: { safe: 7, damage: 1, recovers: null, cure: { kind: "weight" }, contagious: null },
  // Хронічні — під контролем таблеток чи ветеринара.
  heart: { safe: 3, damage: 2, recovers: null, cure: { kind: "control", medicine: "pills" }, contagious: null },
  joints: { safe: 3, damage: 1, recovers: null, cure: { kind: "control", medicine: "pills" }, contagious: null },
  spine: { safe: 3, damage: 1, recovers: null, cure: { kind: "control", medicine: "pills" }, contagious: null },
  breathing: { safe: 3, damage: 1, recovers: null, cure: { kind: "control", medicine: "pills" }, contagious: null },
  gingivitis: { safe: 7, damage: 1, recovers: null, cure: { kind: "vet" }, contagious: null },
};
/** Схильність породи (§9.5, `BREEDS.md`): `step` — за половину породи; «ожиріння» — через `WEIGHT.breedStep`. */
export const BREED_RISK = {
  step: 0.5,
  diseases: { conjunctivitis: "очі", dermatitis: "шкіра", heart: "серце", joints: "суглоби", spine: "хребет", breathing: "дихання", gingivitis: "зуби" } as Partial<Record<DiseaseId, string>>,
} as const;
/** Шанси котячих хвороб (§9.5): за ніч, за подію чи за тиждень; `cystitisMood`, `calmMood` — настрій дня. */
export const ILLNESS = {
  cold: 1 / 60,
  conjunctivitis: 1 / 100,
  afterCold: 0.3,
  shelterFleas: 0.2,
  /** Множник застуди в «Холод» і «Похолодання» (§4.1). */
  coldWeather: 1.5,
  /** `*Days` — день бліх, з якого. */
  fleasWorms: 0.05,
  fleasWormsDays: 3,
  fleasDermatitis: 0.1,
  fleasDermatitisDays: 5,
  escapeFleas: 0.3,
  stolenWorms: 0.1,
  stolenStomach: 0.25,
  /** Стерилізований кіт на звичайному кормі (§9.8). */
  regularFoodStones: 0.03,
  cheapFoodStomach: 0.01,
  /** Керамічна миска легше миється (§6.4): множник до `cheapFoodStomach`. */
  ceramicStomach: 0.5,
  cystitisMood: 25,
  cystitis: 0.15,
  calmMood: 40,
  /** Тижневі шанси — у ніч, коли дорослий кіт старшає; `breedOnlyPerWeek` — лише схильні породи. */
  heartPerWeek: 0.03,
  heartOld: 2,
  jointsOldPerWeek: 0.1,
  jointsObese: 0.02,
  breedOnlyPerWeek: 0.06,
  gingivitisPerWeek: 0.04,
  breathingHeat: 2,
  /** Щоночі лише на друга; глисти — через лоток, коли лотків бракує. */
  friendContagion: 0.2,
  litterContagion: 0.1,
  hardinessStep: 0.1,
  difficulty: { easy: 0.8, normal: 1, hard: 1.25 } as Record<Difficulty, number>,
  moodPerDay: -3,
} as const;
/** Симптоми (§9.5): множники потреб, сну й ходи; шанси. */
export const SYMPTOMS = {
  tired: 1.3,
  fleasSleep: 0.8,
  wormsHunger: 1.3,
  cystitisToilet: 2,
  limp: 0.6,
  jointsWalk: 0.85,
  spineWalk: 0.9,
  gingivitisEat: 1.5,
  stomachVomit: 0.3,
  outsideLitter: 0.3,
  /** Симптом видно стільки разів на годину. */
  showPerHour: 2,
} as const;
/** Ліки вдома (§9.5): `doseMinutes` — раніше кіт випльовує. */
export const MEDICINE = { cheapWorks: 0.7, sanity: -2, love: -1, doseMinutes: 360 } as const;
/**
 * Поїздки (§8.5): `road`, `visit` — дорога й час на місці; `cat` — котові переноска; `service` — час іде лише за послугу.
 */
export const TRIPS: Record<Destination, { road: number; visit: number; cat: boolean; service: boolean }> = {
  breeder: { road: 120, visit: 60, cat: false, service: true },
  shop: { road: 45, visit: 30, cat: false, service: false },
  vet: { road: 60, visit: 60, cat: true, service: true },
  doctor: { road: 60, visit: 60, cat: false, service: true },
  shelter: { road: 75, visit: 60, cat: false, service: true },
  groomer: { road: 45, visit: 90, cat: true, service: true },
  office: { road: 60, visit: 180, cat: false, service: false },
  show: { road: 90, visit: 180, cat: true, service: true },
};
/** Час на місці без жодної послуги (§8.5). */
export const TRIP_IDLE_MINUTES = 15;
/** Гонка (§8.5): швидкість — множник звичайної, відстань — одиниці дороги. */
export const RACE = {
  minSpeed: 0,
  maxSpeed: 10,
  /** З нею машина виїжджає з двору (`HOME_DEPARTURE.lotSpeed`), тож до старту їде рівно, не гальмуючи. */
  startSpeed: 2,
  /**
   * Своя смуга вільна від старту, щоб без натискань не наздогнати потік: (`startSpeed` − `carSpeed`)² / (2 × `coasting`) +
   * `carLength` + запас.
   */
  startClear: 4.7,
  /**
   * Сусідні смуги вільні, щоб перестроювання першою дією давало `startReaction`; більше — й машин на старті не лишилося б
   * (`racePixelsPerUnit`).
   */
  startSide: 2.3,
  /** Реальні секунди. */
  startReaction: 1,
  /** Приріст швидкості за хвилину. */
  acceleration: 0.5,
  /** Спад без газу й від гальма, за хвилину. */
  coasting: 0.25,
  braking: 2,
  /** Найдовший крок перевірки зіткнень: на `maxSpeed` машини не проскакують одна крізь одну. */
  step: 0.01,
  lanes: 3,
  /** Смуг за хвилину. */
  laneSpeed: 8,
  carSpeed: 0.5,
  /** Середній проміжок між машинами, хвилини дороги; `traffic` — множник густоти. */
  gap: 1.5,
  traffic: { easy: 0.8, normal: 1, hard: 1.25 } as Record<Difficulty, number>,
  carLength: 0.15,
  view: 2.5,
} as const;
/** Аварія (§8.5): `chance` — шанс кожної втрати, `max` — найбільше втрат. */
export const ACCIDENT = {
  chance: { easy: 0.4, normal: 0.5, hard: 0.625 } as Record<Difficulty, number>,
  max: { easy: 2, normal: 3, hard: 4 } as Record<Difficulty, number>,
  /** Шанс травми кота за місцем (§8.5): `maybeFallIll` кладе поверх складність. */
  catInjury: { hands: 0.4, cheap: 0.2, premium: 0.1 },
  /** Ремонт і години аварії: × `scale` × множник швидкості (§5.2). */
  repair: 90,
  hours: 10,
  scale: { easy: 0.8, normal: 1, hard: 1.25 } as Record<Difficulty, number>,
  /** Множник швидкості: `speedBase` + швидкість × `speedStep`, до `speedMax`. */
  speedBase: 0.5,
  speedStep: 0.25,
  speedMax: 2,
  /** Години — кратно стільком: швидкість будь-яка, і картка писала б «13 год 26 хв». */
  roundMinutes: 15,
  /** Для старого збереження: швидкості воно не пам'ятає, ремонт уже сплачено. */
  legacySpeed: 2,
  health: -10,
  sanity: -10,
  catMood: -20,
  /** Поки день перемотується, показники не нижче цього. */
  floor: 5,
  /** Те саме для ситості: уранці персонаж має кілька годин, щоб поїсти. */
  satietyFloor: 25,
} as const;
/** Посадка в переноску (§8.5): `traitStep` — «Переноска»; не більше нуля. */
export const CARRIER_MOOD = { hands: -8, cheap: -5, premium: -2, traitStep: 3 } as const;
/** Подряпина кота (§8.7, §9.12): одне правило для переноски, ванни й «Ніндзя»; без «Травми». */
export const CLAW = { health: -3 } as const;
/** Переноска вдома (§9.12): `premium` — множник шансів із дорогою. */
export const CARRIER_HOME = { sleepStep: 1.5, reach: 2, scratchStep: 0.1, escape: 0.25, premium: 0.5, none: 1.5 } as const;
/**
 * Переноски й кіт під замком (§8.7), хвилини: `stages` — межі етапів кота без риси; `strength` — скільки гризіння витримує; `trait` — за
 * рисою «Переноска»: `stages` множить межі, `chew` — швидкість гризіння, `mood` — падіння настрою, `bite` — шанс укусу.
 */
export const CARRIER = {
  cats: 2,
  shown: 4,
  stages: { cry: 15, stress: 120, chew: 300 },
  moodPerHour: { calm: 0, cry: -1, stress: -3, chew: -5 },
  cryEvery: { calm: Infinity, cry: 20, stress: 10, chew: 10 },
  strength: { cheap: 420, premium: 1140 } as Record<Quality, number>,
  trait: {
    2: { stages: Infinity, chew: 1, mood: 0, bite: 1 },
    1: { stages: 2, chew: 0.5, mood: 0.5, bite: 1 },
    0: { stages: 1, chew: 1, mood: 1, bite: 1 },
    [-1]: { stages: 0.6, chew: 1.5, mood: 1.5, bite: 1 },
    [-2]: { stages: 0.3, chew: 2, mood: 2, bite: 2 },
  },
  alarmHealth: 30,
  needPace: 2,
  pairPace: 2,
  bite: 0.5,
  offense: -3,
  vitalNeed: 100,
  healthPerHour: 2,
} as const;
/** Поїздка в робочий час (§8.6): поїздок за 7 днів × репутація за годину / стільки. */
export const TRIP_REPUTATION_DIVIDER = 3;
/** Ветеринар (§8.5): `exam`, `cheap`, `premium` — ціни; `hideMinutes`, `homeHideMinutes` — «Жах клініки». */
export const VET = {
  exam: 60,
  cheap: 45,
  premium: 120,
  cheapWorks: 0.7,
  treatMinutes: 60,
  /** Контроль хронічної, дні. */
  controlDays: { cheap: 7, premium: 14 } as Record<Quality, number>,
  love: -3,
  hideMinutes: 15,
  homeHideMinutes: 30,
} as const;
/** Чистого одягу на старті, дні (§8.7). */
export const START_CLOTHES = 5;
/** Побут (§8.7): `dirtyFur` — поріг видимої шерсті; `*Hygiene` — множники падіння гігієни; `difficulty` — поломки. */
export const HOUSEHOLD = {
  furPerCatHour: 0.5,
  longFur: 2,
  sheddingStep: 0.5,
  dirtyFur: 50,
  /** Жмути лягають поступово, а не всі разом. */
  tuftEveryMinutes: 10,
  furHygiene: 1.2,
  noClothesHygiene: 2,
  /** Вище гігієна в брудному одязі не стає й після душу. */
  noClothesHygieneCeiling: 60,
  washMinutes: 60,
  clothesDays: { cheap: 7, premium: 12 } as Record<Quality, number>,
  robotMinute: 12 * 60,
  robotMinutes: 64 * BODY_PACE,
  breakPerUse: 1 / 150,
  applianceBreakPerDay: 0.02,
  difficulty: { easy: 0.8, normal: 1, hard: 1.25 } as Record<Difficulty, number>,
} as const;
/**
 * Перестановка речей (§8.7), клітинки: `take` — до краю речі, яку беруть; `ahead` — точка перед персонажем, біля якої шукають вільну
 * клітинку; `reach` — найдальший центр такої клітинки. `take` дістає сусідню клітинку навскіс: щойно поставлену річ можна взяти знову.
 */
export const MOVING = { take: 1, ahead: 0.9, reach: 1.6 } as const;
/** Пилосос у руках (§8.1, §8.7). */
export const VACUUM = { sanityPerMinute: -0.2, noiseEvery: 10 } as const;
/**
 * Робот-пилосос за якістю (§8.7): `reach` — досяжність із маршруту, клітинки; `starts` — коли виїжджає, хвилини доби; `messes` —
 * чи бере сухий безлад; `loud` — чи лякає й будить котів. Між двома `reach` лежать усі кути й смужки біля стін
 * (`tests/robot.test.ts`).
 */
export const ROBOT: Record<Quality, { reach: number; starts: readonly number[]; messes: boolean; loud: boolean }> = {
  cheap: { reach: 0.82, starts: [HOUSEHOLD.robotMinute], messes: false, loud: true },
  premium: { reach: 1, starts: [HOUSEHOLD.robotMinute, 18 * 60], messes: true, loud: false },
};
/**
 * Досяжність інструмента в руках (§8.7), клітинки. `web` — до павутини: у віника більша за `floor`, бо до павутин за ліжком,
 * умивальником і холодильником ближче як на 1,33 не підійти, а персонаж у кут упирається не ідеально (`tests/dust.test.ts`).
 */
export const TOOL_REACH: Record<CleaningTool, { floor: number; web: number }> = {
  broom: { floor: 1, web: 1.45 },
  vacuum: { floor: 2, web: 2 },
};
/** Пил (§8.7): кімнати — по черзі, на чверть `everyMinutes` одна від одної. */
export const DUST = { everyMinutes: 36 * 60 } as const;
/** Ласощі (§7): `refund` — частка втрати в межах `hurtMinutes`; понад `perDay` — шанс «Шлунка» `stomach`. */
export const TREATS = { mood: { cheap: 3, premium: 5 } as Record<Quality, number>, love: 2, hurtMinutes: 60, refund: 0.5, perDay: 2, stomach: 0.2 } as const;
/** Купання (§8.7): «Боїться води» ×(1 + `fearStep`), «Водобоязнь» ×(1 + 2 × `fearStep`). */
export const BATH = { catchSanity: -3, bathSanity: -3, minutes: 10, fearStep: 0.5, hairlessDays: 7, dermatitis: 0.3, hideMinutes: 30 } as const;
/** Купання за «Любов'ю до води» (§8.7), за рівнем; `scratch` — шанс `CLAW`. */
export const BATH_FEEL: Record<-2 | -1 | 0 | 1 | 2, { mood: number; love: number; scratch: number }> = {
  2: { mood: 5, love: 1, scratch: 0 },
  1: { mood: 2, love: 0, scratch: 0 },
  0: { mood: -5, love: -2, scratch: 0 },
  [-1]: { mood: -7, love: -3, scratch: 0.15 },
  [-2]: { mood: -10, love: -4, scratch: 0.3 },
};
/** «Любов до води» поза купанням (§9.12). */
export const WATER_PLAY = { dropsStep: 0.3, dropsMinutes: 5, observeEvery: 60 } as const;
/** «Догляд за шерстю» (§8.7, §9.12): `petting` — шерсть за хвилину пестощів, × годинна норма кота. */
export const SHEDDING = { tuftMinutes: 2, tuft: 0.3, longTuft: 1.5, tuftFur: 1, petting: 10, napMinutes: 60, patchStep: 0.25, groomed: 0.5 } as const;
/** Розмноження (§9.8): `minAge` — тижні; `escapeBonus` — додаток до шансу втечі. */
export const BREEDING = {
  pregnancy: 0.3,
  minAge: 2,
  friendWeight: 2,
  /** Ваги розміру виводку, від одного кошеняти. */
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
/** Шанс, що нова риса кошеняти — від батьків (§9.8). */
export const INHERIT_TRAIT_CHANCE = 0.5;
/** Шанс двох X (§9.10): лише такий кіт буває черепаховим чи калико. */
export const XXY_MALE = 1 / 3000;
/** Стерилізація (§9.8): `minAge` — тижні, щоб кошеня не завагітніло раніше, ніж його можна прооперувати. */
export const STERILIZATION = { price: 180, minutes: 120, recoveryDays: 3, mood: -10, recoveryMoodPerDay: -2, recoveryFatigue: 1.5, minAge: 1 } as const;
/** Притулок (§8.5, §9.8): вік — тижні; `visibleTraits` — відомих рис. */
export const SHELTER = {
  price: 75,
  cats: 3,
  minAge: 1,
  maxAge: 5,
  visibleTraits: { easy: 3, normal: 2, hard: 1 } as Record<Difficulty, number>,
  /** З цього віку (тижні) — стерилізований із шансом `sterilized`. */
  sterilizedFromAge: 3,
  sterilized: 0.5,
  /** Шанс породи, навпіл чистокровний і напівкровка. */
  breed: 0.1,
} as const;
/** Розплідник (§9.11): `age` — тижні; ціна — за рідкісністю породи. */
export const BREEDER = { cats: 3, age: 2, price: { wild: 1200, unusual: 1050, colorpoint: 900, large: 825, common: 675 } } as const;
/** Грумер (§8.5): `days` — скільки кіт линяє менше. */
export const GROOMER = { price: { cheap: 60, premium: 135 } as Record<Quality, number>, days: { cheap: 7, premium: 14 } as Record<Quality, number>, mood: { cheap: -5, premium: -3 } as Record<Quality, number> } as const;
/** Однакових іграшок у кошику за раз (§6.4). */
export const SHOP_TOYS_PER_ORDER = 5;
/** Що продається на місці (§8.5); ціни — `SHOP_WINDOW`. */
export const STORE_GOODS: Partial<Record<Destination, readonly Product[] | "all">> = {
  shop: "all",
  vet: ["pills", "drops"],
  doctor: ["humanMeds"],
};
/** Вікно ціни, частка від базової (§6.4): поїздка в середньому дешевша за доставку, але знижка є не на все. */
export const SHOP_WINDOW: Record<Difficulty, { min: number; max: number }> = {
  easy: { min: -0.35, max: 0.05 },
  normal: { min: -0.25, max: 0.15 },
  hard: { min: -0.15, max: 0.25 },
};
/** Модифікатори (§4.1, `DAY_MODIFIERS.md`): спершу шанси вибору, далі ефекти; `decay` — множник спаду терпіння. */
export const MODIFIERS = {
  noneShare: 1 / 6,
  hardShare: { easy: 0.4, normal: 0.5, hard: 0.6 } as Record<Difficulty, number>,
  weekShare: 1,
  foundling: 0.03,
  foundlingGapDays: 14,
  foundlingShelterMinutes: 120,
  deadline: { decay: 2, reputation: 1.5 },
  lull: { decay: 0.5, reputation: 0.5 },
  /** `present`, `absent` — × репутація за годину посади. */
  meeting: { from: 14 * 60, minutes: 60, attended: 0.5, present: 1.5, absent: -5 },
  lunch: { from: 12 * 60, to: 14 * 60 },
  /** Множник зарплати дня; `outage` — без світла персонаж працює з телефона. */
  pay: { "pay-delay": 0.5, bonus: 1.5, "fast-internet": 1.25, outage: 0.75 } as Record<string, number>,
  /** × репутація за годину посади. */
  reprimand: -3,
  praise: 3,
  /** «Догана» й «Похвала» посади не змінюють: межі репутації після них. */
  reputationKeep: { min: 1, max: 99 },
  fullMoonPlay: 1.5,
  rainFatigue: 1.3,
  festival: { minute: 21 * 60, hideMinutes: 60, mood: -5, wake: 0.3 },
  quietEvening: { minute: 20 * 60, mood: 2 },
  homeVetMinute: 11 * 60,
  heat: { thirst: 1.5, fatigue: 1.2, hygiene: 1.2 },
  coldWarmth: 3,
  renovation: { unpleasant: 1.2, catMoodPerHour: -0.5 },
  neighborsAway: 0.8,
  /** «Планове відключення»: множники. */
  outage: { reputation: 0.75, search: 0.75, cook: 1.25, showerHygiene: 0.8, showerMinutes: 0.5 },
  /** Штрафи за безлад, лоток, шерсть. */
  inspection: { minute: 15 * 60, mess: 8, litter: 8, fur: 15 },
  /** Знижка комунальних. */
  recalculation: 10,
  guests: { minute: 19 * 60, mess: -3, max: -15, hideMinutes: 120 },
  /** «Прибиральниця»: дзвонить за `GUESTS.ringLead` до `minute` (`src/sim/cleaner.ts`). */
  cleaner: { minute: 13 * 60 },
  /** «Будівельний пил»: кімнати по черзі (§8.7). */
  constructionDust: { from: 10 * 60, every: 30, rooms: ["living", "bathroom", "kitchen", "bedroom"] as readonly RoomId[] },
  friend: { from: 10 * 60, to: 16 * 60 },
  noisyWake: { min: 60, max: 120 },
  vigor: 1.15,
  call: { from: 10 * 60, to: 20 * 60, minutes: 30, ignored: -5 },
  /** «Мамині гостинці»: `until` — прийде, щойно персонаж повернувся, якщо до цього. */
  mom: { from: 11 * 60, to: 18 * 60, until: 20 * 60 },
  /** Множник густоти машин у гонці (§8.5). */
  traffic: { traffic: 1.5, "empty-roads": 0.6 } as Record<string, number>,
  /** Множник довжини дороги: інакше обережний водій їхав би так само довго. */
  road: { traffic: 1.3, "empty-roads": 0.8 } as Record<string, number>,
  catFoodPrice: { "food-price-up": 1.3, "pet-sale": 0.7 } as Record<string, number>,
  /** Виставка: `pedigree` і `luck` (випадково, до цього числа) — у бал; здоровий глузд призу × `DIFFICULTY.catSanity` (§6.2), гроші — ні. */
  show: { fee: 30, mood: -5, pedigree: { pure: 0.5, half: 0.25 }, luck: 0.3, prizes: [{ score: 1, money: 300, sanity: 10 }, { score: 0.8, money: 150, sanity: 5 }, { score: 0.6, money: 60, sanity: 0 }] },
  /** × репутація за годину посади. */
  officeAbsent: -5,
  /** Модифікатори тижня; `vacationPayHours` — годин оплати. */
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
/** Середній настрій щасливого кота; кота, що страждав, — нижче `SUFFERED_LIFE` (§4.2). */
export const HAPPY_LIFE = 85;
export const SUFFERED_LIFE = 70;
/** Кар'єра на пенсії (§4.2): посада (від 1), нижче `middle` — низька. */
export const CAREER_AXIS = { middle: 9, high: 15 } as const;
/** Проявів риси, щоб відкрити її (§9.9). */
export const OBSERVATIONS: Record<Difficulty, number> = { easy: 3, normal: 6, hard: 9 };
/** Свідок у проході між кімнатами (§9.9). */
export const WITNESS_DISTANCE = 3;
/** Хвороби персонажа (§6.5): як `DISEASES`; `doses` — днів із ліками; `sickLeave` — днів лікарняного. */
export const ILLNESSES: Record<IllnessId, { safe: number; damage: number; doses: number | null; recovers: number | null; sickLeave: number }> = {
  cold: { safe: 0, damage: 4, doses: 3, recovers: 7, sickLeave: 2 },
  injury: { safe: 0, damage: 3, doses: 4, recovers: 10, sickLeave: 1 },
  exhaustion: { safe: 0, damage: 5, doses: null, recovers: null, sickLeave: 3 },
};
/** Вплив хвороб персонажа (§6.5): `difficulty` — множник шансів; `medsWork` — шанс дешевих ліків. */
export const ILLNESS_EFFECTS = {
  /** Множники руху: застуда й травма; травма з річчю в руках. */
  slow: 0.8,
  carrySlow: 0.8,
  injuryOnStun: 0.05,
  difficulty: { easy: 0.8, normal: 1, hard: 1.25 } as Record<Difficulty, number>,
  // Виснаження (§6.5, §8.8): короткі ночі поспіль; `rest*` — минає.
  shortSleepHours: 6,
  shortNights: 3,
  restHours: 8,
  restNights: 2,
  medsWork: 0.7,
} as const;
/** Лікар (§6.5): `health` — після лікування. */
export const DOCTOR_TREAT = { cheap: 45, premium: 120, cheapWorks: 0.7, health: 10 } as const;
/** Смерть кота (§9.2, §9.5): `zeroHealth` — за нульового здоров'я ввечері; решта — понад межу віку. */
export const DEATH = { zeroHealth: 0.6, ageBase: 0.2, ageStep: 0.1, longevityStep: 0.05 } as const;
/** Стосунки між котами (§9.4): `sociabilityStep` — за рівень обох; `kittenBonus` — дорослий із кошеням. */
export const RELATIONS = {
  friend: 50,
  /** Поріг приятелів. */
  pal: 20,
  enemy: -50,
  sociabilityStep: 10,
  kittenBonus: 20,
  motherKitten: 50,
  siblings: 50,
  /** Щоночі разом. Мета — коти без рис приятелі на 4–7-й вечір, друзі на 10–14-й. */
  nightly: 3,
  /** Новий дорослий кіт; `hiss` — шанс шипіння старожила за зустріч. */
  newcomer: { start: -20, sociabilityStep: 2.5, days: 2, distance: 2, hiss: 0.3, hissStep: 0.25, relation: -1 },
  /** За одиницю обох щоночі: двоє «Задирак» віддаляються й попри `nightly`. */
  sociabilityNightly: 1.5,
  /** Гра з другом: фази `ambush` → `chase` → `tussle` → `pause`, разом `minutes`; `accept` — шанс згоди. */
  wrestle: {
    weight: 3,
    palWeight: 1.5,
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
    accept: { base: 0.3, play: 0.01, fatigue: -0.005, playfulStep: 0.15, kitten: 0.3, old: -0.3, min: 0.1, max: 0.95 },
    decline: { minutes: 3, leave: 1.5, pause: 30 },
    /** Кличе раніше за поріг забав з шансом `chance`; `kitten` — лише у вазі забави, не тут. */
    social: { from: 40, kittenFrom: 20, chance: 0.5 },
    /** У тій самій кімнаті чи ближче цього. */
    call: 4,
  },
  /** Вилизування: `relation` — `[межа, приріст нижче неї]`, від останньої — `relationTop`. */
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
    other: 0.3,
    near: 3,
    traitStep: 0.5,
    relation: [
      [70, 2],
      [90, 1],
    ],
    relationTop: 0.5,
    back: 0.4,
    backMinutes: 1,
  },
  /** Вага, відстань, стосунки за годину. */
  sleepTogether: { weight: 3, distance: 1, perHour: 0.5 },
  /** Кіт стає впритул збоку на стільки, а не на іншого кота. */
  beside: 0.4,
  /** Бійка ворогів: `luck` — випадковість до програшу; того дня пара без `nightly`. */
  fight: { minutes: 2, mood: -3, relation: -5, injury: 0.1, injuryIntact: 2, separateSanity: -3, luck: 2, hide: [15, 30], winnerSits: 3, truce: [90, 120], gap: 0.6, knock: 0.15, knockReach: 0.8 },
  /** Протистояння: `perMinute` — під 3–5 на пару за день і ~1 бійку; `minutes` — щоб гравець встиг утрутитися. */
  standoff: { distance: 3, perMinute: 0.01, wait: 3, reach: 1.5, minutes: [4, 8], fight: 0.4, territorialStep: 0.1, part: 2, touchSanity: -1 },
  /** Вороги уникають одне одного; `person` — не йде по увагу, коли ворог ближче до персонажа. */
  avoid: { distance: 2, step: 3, person: 2 },
  /** Коли ворог поруч. */
  enemyMoodPerHour: -0.5,
  /** Сварка за ресурс; того дня пара без `nightly`. */
  resource: { chance: 0.15, territorialStep: 0.1, relation: -5, distance: 3 },
  /** Уночі, якщо пара за день ані билася, ані сварилася. */
  enemyCalm: 3.5,
  /** За одиницю; бачить у тій самій кімнаті (`jealousySight`). */
  jealousy: -1,
  jealousySight: 5,
} as const;
/** Вага сну в будиночку. */
export const HOUSE_SLEEP: Record<Quality, number> = { cheap: 2, premium: 4 };
/** У скільки разів швидше кіт заспокоюється в дорогому будиночку (§9.12). */
export const HOUSE_CALM = 2;
/** Лежанка дорогої кігтеточки (§9.12): вага сну — `climbWeight` × `weight`; поки вона вільна, вага високих місць × `high`. */
export const LOUNGER = { weight: 2, high: 0.5 } as const;
/** Зумі (§9.12): `speed` — множник; `hit` — збиває персонажа ближче цього. */
export const ZOOMIES = { speed: 3, minMinutes: 1, maxMinutes: 2, afterToilet: 0.3, hit: 0.5, knock: 0.15, knockReach: 0.8 } as const;
/** Скільки гри знімає забава наодинці. */
export const PLAY_RELIEF = 50;
/** Мінус голод за украдену страву. */
export const STEAL_HUNGER = 50;
/** Голодний кіт краде їжу (§9.12): `step` — «Злодійство»; від `starving` ще `base`. */
export const HUNGRY_THEFT = { step: 0.25, base: 0.15, starving: 95, starvingStep: 0.5 } as const;
/** «Злодійство» (§9.12): `wait*` — «−» сидить біля їжі й не бере. */
export const THIEF = { reach: 6, hunger: 30, pushStep: 0.2, victimMood: -2, relation: -3, guardFight: 0.3, waitChance: 0.5, waitMinutes: 3 } as const;
/** Кіт і робота (§9.12). */
export const WORK_CAT = {
  /** Поріг уваги, як для пестощів. */
  seekAttention: 40,
  /** Клавіатура: шанс; `besideMinutes` — «−» лежить поруч. */
  keyboardBase: 0.1,
  keyboardStep: 0.3,
  besideMinutes: 20,
  /** Коліна: шанс; решта — за хвилину. */
  lapBase: 0.5,
  lapStep: 0.25,
  /** Найменше — і в розбудженого дотиком на комп'ютері, і в «Анархіста», що повернувся. */
  keyboardMinMinutes: 10,
  keyboardMaxMinutes: 20,
  lapSanity: 1,
  lapMood: 0.5,
  lapLove: 0.2,
  lapAttention: 5,
} as const;
/** Кіт у полі зору (§8.2), за годину; кожен наступний дає 1/k свого. */
export const WATCH_SANITY = { asleep: 1, awake: 3 } as const;
/** Безлад у полі зору (§9.12), за годину; видимі жмути — ще один безлад. */
export const MESS_ANNOYANCE = { perHour: -1, max: -4 } as const;
/** Сон на комп'ютері (§9.12): `helperStep` — частка за одиницю «−». */
export const COMPUTER_SLEEP = { base: 1, step: 2, helperStep: 0.5 } as const;
/** Прогнали з місця (§9.12). */
export const SHOO = { mood: -3, love: -2 } as const;
/** Шерстяна грудка (§9.12): `perHour` — шанс; `night` — множник уночі (`isNight`); `wake*` — у спільній стелі нічних побудок. */
export const HAIRBALL = { perHour: 1 / 72, night: 2, longHair: 2, step: 0.5, sheddingStep: 0.25, coughMinutes: 1, wakeBedroom: 0.2, wakeElsewhere: 0.05 } as const;
/** «Мітки» (§9.8, §9.12): `mood`, `crowd`, `newCatDays` — тригери. */
export const MARKING = { triggerPerHour: 1 / 48, calmPerHour: 1 / 144, mood: 50, newCatDays: 3, crowd: 4, minutes: 1 } as const;
/** Шанс блювоти за одиницю «Швидкості їжі». */
export const VOMIT_STEP = 0.2;
/** Оглушення персонажа (§9.12). */
export const STUN_MINUTES = 0.5;
/** Спільні паузи (§9.12): оглушення персонажа, шипіння кота. */
export const STUN_PAUSE_MINUTES = 5;
export const HISS_PAUSE_MINUTES = 20;
/** Гучний звук (§9.12): `big` — хвилини схованки; `reach` — чути з проходу. */
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
/** Кроки персонажа будять сплячого кота (§9.12). */
export const STEPS_WAKE = { distance: 1.5, step: 0.15 } as const;
/** «Стресостійкість» у поведінці (§9.12): `shaken` — втрата настрою за раз. */
export const STRESS_EFFECTS = { shaken: 3, waitMinutes: 30, nervousStep: 0.25, groomMinutes: 2, hideStep: 10, everyMinutes: 60, sleepStep: 0.25 } as const;
/** Адаптація за «Сміливістю» (§9.6), дні. */
export const ADAPTATION_BRAVERY = { step: 0.5, min: 1, max: 3 } as const;
/** Шанс посковзнутися на шерстяній грудці чи калюжі. */
export const SLIP_CHANCE = 0.5;
/** Тертя об ноги (§9.12): `slow` — множник руху; `keep` — дистанція −1 і −2. */
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
/** Втеча в двері (§9.12): `call*`, `heatCall` — «+» кричить під дверима. */
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
 * Дзвінок у двері (§9.12): `ringLead` — дзвонять до того, як зайти; `delight`, `delightMax`, `hissSanity` — день «Гості».
 */
export const GUESTS = { greetMinutes: 5, hideStep: 30, ringLead: 8, delight: 3, delightMax: 6, hissSanity: -2, showStep: 0.05 } as const;
