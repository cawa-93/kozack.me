// Стан гри — звичайні дані без класів і посилань на графіку (§2.1):
// його можна зберегти в JSON, змінити й завантажити (§6.1, §11.5).

export type Sex = "female" | "male";
export type Chronotype = "lark" | "owl";
export type Difficulty = "easy" | "normal" | "hard";

/** Якість речей і запасів: дешеве чи дороге (§6.4). */
export type Quality = "cheap" | "premium";
/** Запаси, що поповнюються упаковками (§6.4). */
export type Product = "food" | "hygiene";

/** Показники персонажа, шкали 0–100 (§6). Голод зберігається як ситість. */
export type StatName = "health" | "satiety" | "hygiene" | "sanity";

/** Чому закінчилася гра (§6.1): показник на нулі, виселення або пенсія (§4.2). */
export type GameEnd = StatName | "eviction" | "retirement";

/** Потоки випадковості, що зберігаються в стані (§6.1). */
export type RngStream = "conditions" | "behavior";

export interface Vec {
  x: number;
  y: number;
}

/** Річ у руках чи на поверхні (§8.4): сира порція, готова страва або підгоріла. */
export interface Item {
  kind: "raw" | "meal" | "burnt";
  quality: Quality;
}

/** Положення персонажа в квартирі, у клітинках підлоги (§8.4). */
export interface Body {
  x: number;
  y: number;
  /** Куди дивиться персонаж: одиничний вектор. */
  facing: Vec;
  /** Скільки ігрових хвилин ще триває ривок. */
  dash: number;
  /** Скільки ігрових хвилин до наступного ривка. */
  dashCooldown: number;
  /** Збій керування від низького здорового глузду (§6.3): скільки ще триває й на який кут. */
  glitch: number;
  glitchAngle: number;
}

/** Робота за комп'ютером: підсумок сесії, щоб показати його, коли персонаж устане. */
export interface WorkActivity {
  kind: "work";
  minutes: number;
  money: number;
  reputation: number;
  sanity: number;
}

/** Тривала дія утриманням кнопки (§10): душ, їжа. */
export interface UseActivity {
  kind: "use";
  target: string;
  progress: number;
}

export type Activity = WorkActivity | UseActivity;

export interface Character {
  name: string;
  sex: Sex;
  chronotype: Chronotype;
  stats: Record<StatName, number>;
  money: number;
  /** Зміна швидкості дій на сьогодні від сну минулої ночі (§8.8): 0,1 — на 10% швидше. */
  sleepSpeed: number;
  body: Body;
  /** У руках лише одна річ (§8.4). */
  held: Item | null;
  activity: Activity | null;
}

/** Робота (§8.6). Репутація й терпіння — шкали 0–100. */
export interface Job {
  /** Посада: індекс у POSITIONS, 0 — стажер. */
  position: number;
  reputation: number;
  /** Приховане терпіння керівництва. */
  patience: number;
  /** Скільки хвилин сьогоднішньої летучки персонаж пробув за комп'ютером. */
  standupMinutes: number;
}

/** Пакунок доставки (§6.4): одне замовлення — один пакунок. */
export interface Delivery {
  id: number;
  product: Product;
  quality: Quality;
  /** Коли прибуде: хвилина від початку гри. */
  at: number;
}

/** Квартира: запаси, плита, поверхні й пакунки (§6.4, §8.7). */
export interface Home {
  /** Порції їжі й душі засобів гігієни. */
  supplies: Record<Product, Record<Quality, number>>;
  /** На плиті одна річ; хвилини — скільки вона там лежить. */
  stove: { item: Item | null; minutes: number };
  /** Що лежить на столі й робочих поверхнях: за id речі квартири. */
  surfaces: Record<string, Item | null>;
  /** Пакунки в дорозі. */
  deliveries: Delivery[];
  /** Пакунки під дверима. */
  porch: Delivery[];
  /** Неоплачений тиждень комунальних — попередження (§6.4); 0, якщо боргу немає. */
  utilitiesDebt: number;
}

/** Звідки кіт (§4.2). Решту джерел додасть модель кота (крок 6 плану). */
export type CatSource = "shelter-forced";

export interface Cat {
  id: number;
  name: string;
  sex: Sex;
  source: CatSource;
  ageWeeks: number;
  /** День, коли кіт з'явився в домі. */
  arrivedDay: number;
}

export type NightStep =
  | "sleep"
  | "cat-health"
  | "cat-death"
  | "cat-age"
  | "age-limit"
  | "births"
  | "pregnancies"
  | "utilities"
  | "week-modifier"
  | "kitten-check"
  | "morning"
  | "new-day";

/** Комунальні цієї ночі (§6.4). */
export interface UtilitiesReport {
  /** paid — сплачено; warning — не вистачило, попередження; partial — вистачило на один
   * тиждень із двох; cleared — борг погашено; evicted — виселення. */
  outcome: "paid" | "warning" | "partial" | "cleared" | "evicted";
  /** Скільки списано. */
  paid: number;
  /** Скільки треба сплатити наступного понеділка, якщо лишився борг; інакше 0. */
  nextDue: number;
}

/** Що сталося вночі: з цього будуються ранкові повідомлення (§4). */
export interface NightReport {
  /** День, що закінчився. */
  day: number;
  sleptHours: number;
  /** Персонаж не ліг сам, а впав без сил (§8.8). */
  collapsed: boolean;
  /** Ніч із неділі на понеділок. */
  weekly: boolean;
  /** Кроки ночі в порядку виконання. */
  steps: NightStep[];
  lostCats: number[];
  newCats: number[];
  utilities: UtilitiesReport | null;
  sanityEvening: number;
  sanityMorning: number;
}

export interface GameState {
  seed: number;
  /** Скільки разів гравець переграв день чи тиждень; змінює поведінку котів (§6.1). */
  replays: number;
  difficulty: Difficulty;
  /** День гри від 0; 0 — понеділок першого тижня. */
  day: number;
  /** Хвилина від 00:00 дати дня; після півночі більша за 1440, доки персонаж не ляже. */
  minute: number;
  character: Character;
  job: Job;
  home: Home;
  modifiers: { day: string | null; week: string | null };
  cats: Cat[];
  /** Наступний id для котів і пакунків. */
  nextId: number;
  rng: Record<RngStream, number>;
  lastNight: NightReport | null;
  end: GameEnd | null;
}

/** Збереження: поточний стан і знімки для перегравання (§6.1). */
export interface Save {
  version: number;
  current: GameState;
  dayStart: GameState;
  weekStart: GameState;
}
