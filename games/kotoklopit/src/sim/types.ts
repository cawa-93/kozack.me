// Стан гри — звичайні дані без класів і посилань на графіку (§2.1):
// його можна зберегти в JSON, змінити й завантажити (§6.1, §11.5).

export type Sex = "female" | "male";
export type Chronotype = "lark" | "owl";
export type Difficulty = "easy" | "normal" | "hard";

/** Якість речей і запасів: дешеве чи дороге (§6.4). */
export type Quality = "cheap" | "premium";
/** Запаси, що поповнюються упаковками (§6.4): людська їжа, засоби гігієни, котячий корм, наповнювач. */
export type Product = "food" | "hygiene" | "catFood" | "sterileFood" | "litter" | "pills" | "drops" | "humanMeds" | "treats" | "collar" | "bell" | "shampoo" | "detergent";
/** Ліки вдома (§9.5). */
export type Medicine = "pills" | "drops";

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

/** Людська їжа на плиті чи поверхні (§8.7): сира порція, готова страва або підгоріла. */
export interface Dish {
  kind: "raw" | "meal" | "burnt";
  quality: Quality;
}

/** Порція котячого корму, яку несуть до миски (§9.12). */
export interface CatFoodScoop {
  kind: "catfood";
  quality: Quality;
  /** Корм для стерилізованих (§9.8). */
  sterile: boolean;
}

/** Кіт на руках (§9.12). */
export interface CarriedCat {
  kind: "cat";
  cat: number;
  /** Узяли проти волі: кіт пручається, поки на руках (§9.12). */
  offended?: boolean;
}

/** Іграшка в руках: з нею граються з котом (§9.12). */
export interface HeldToy {
  kind: "toy";
  toy: ToyItem;
}

/** Річ у руках (§8.4): у руках лише одна. */
export type Item = Dish | CatFoodScoop | CarriedCat | HeldToy;

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
  /** Скільки ігрових хвилин персонаж ще оглушений: спіткнувся об кота, посковзнувся (§9.12). */
  stun: number;
}

/** Робота за комп'ютером: підсумок сесії, щоб показати його, коли персонаж устане. */
export interface WorkActivity {
  kind: "work";
  minutes: number;
  money: number;
  reputation: number;
  sanity: number;
}

/** Тривала дія утриманням кнопки (§10): душ, їжа, прибирання. Ціль — id з `targetId`. */
export interface UseActivity {
  kind: "use";
  target: string;
  progress: number;
  /** Персонаж усередині (душова кабіна, §8.7): не виходить, доки дія не скінчиться. */
  inside?: boolean;
}

/** Пестощі кота утриманням дії (§9.12). */
export interface PetActivity {
  kind: "pet";
  cat: number;
  /** Скільки хвилин кота пестять поспіль. */
  minutes: number;
  /** Кіт вкусив і відходить: пестощі не почнуться знову, поки кнопку не відпустили (§9.12). */
  bitten?: boolean;
}

/** Гра з котом: іграшка в руках і утримання дії (§9.12). */
export interface PlayActivity {
  kind: "play";
  cat: number;
  minutes: number;
  /**
   * Кіт награвся чи не хоче гратися: гра не почнеться знову, поки кнопку не відпустили (§9.12).
   * Інакше утримання щокадру починало гру наново й щоразу будило кота.
   */
  done?: boolean;
}

export type Activity = WorkActivity | UseActivity | PetActivity | PlayActivity;

/** Зовнішність персонажа (§5.1): суто косметична; числа — номери варіантів у палітрах графіки. */
export interface Look {
  face: number;
  skin: number;
  hair: number;
  hairColor: number;
  eyes: number;
  build: number;
  top: number;
  bottom: number;
  shoes: number;
}

export interface Character {
  name: string;
  look: Look;
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
  /**
   * Тривала дія закінчилася, а кнопку ще тримають: нова не почнеться, поки її не відпустили (§10).
   * Інакше утримання щокадру починало б ту саму дію знову.
   */
  holdSpent?: boolean;
  /** «Пригніченість» (§6.2): без котів здоровий глузд між 10 і 30. */
  depressed: boolean;
  /** Остання кімната, де коти бачили персонажа (§9.12): перейшов у іншу — «Хвостик» іде слідом. */
  room?: string;
  /** Хвороби персонажа (§6.5). */
  illnesses: Illness[];
  /** Скільки ночей поспіль персонаж недоспав, і скільки — добре виспався (§6.5). */
  shortNights: number;
  restedNights: number;
  /** Жіночий цикл (§4.1): з якого дня гри почався поточний 28-денний цикл. */
  cycleStart: number;
  /** Борода (§5.1): день останнього гоління й підрівнювання. */
  beard: { shaved: number; trimmed: number };
}

/** Хвороби персонажа (§6.5). */
export type IllnessId = "cold" | "injury" | "exhaustion";

export interface Illness {
  id: IllnessId;
  day: number;
  /** Дні з ліками, що подіяли. */
  doses: number;
  /** Останній день, коли персонаж пив ліки. */
  lastDose: number;
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
  /** Дні поїздок у робочий час: штраф за годину росте з кожною за 7 днів (§8.6). */
  tripDays: number[];
  /** Персонажа звільнили: години за комп'ютером — пошук роботи (§8.6). */
  unemployed: boolean;
  searchHours: number;
  /** Лікарняний до цього дня включно (§6.5): керівництво нічого не чекає, зарплати немає. */
  sickLeaveUntil: number;
}

/** Пакунок доставки (§6.4): одне замовлення — один пакунок із запасами чи річчю для котів. */
export type Delivery = {
  id: number;
  quality: Quality;
  /** Коли прибуде: хвилина від початку гри. */
  at: number;
} & ({ product: Product } | { thing: ThingKind });

/** Миска для корму (§9.12). */
export interface BowlItem {
  id: number;
  kind: "bowl";
  quality: Quality;
  slot: string;
  /** Порції корму в мисці. */
  food: number;
  foodQuality: Quality | null;
  /** У мисці корм для стерилізованих (§9.8). */
  sterile: boolean;
}

/** Миска для води (§9.12). */
export interface WaterItem {
  id: number;
  kind: "water";
  quality: Quality;
  slot: string;
  /** Ковтки води. */
  water: number;
}

/** Лоток (§9.12). */
export interface LitterItem {
  id: number;
  kind: "litter";
  quality: Quality;
  slot: string;
  /** Наповнювач у лотку; null — порожній. */
  litter: Quality | null;
  /** Скільки разів котом користувалися після чистки. */
  uses: number;
}

/** Іграшка (§9.12): лежить будь-де на підлозі, кіт ганяє її, поки не зламає. */
export interface ToyItem {
  id: number;
  kind: "toy";
  quality: Quality;
  x: number;
  y: number;
  /** Скільки ігор іграшка вже витримала. */
  uses: number;
}

/** Будиночок для сну й схованки (§9.12). */
export interface HouseItem {
  id: number;
  kind: "house";
  quality: Quality;
  slot: string;
}

/** Кігтеточка (§9.12). */
export interface ScratcherItem {
  id: number;
  kind: "scratcher";
  quality: Quality;
  slot: string;
}

/** Речі для котів (§9.12): миски, лотки, будиночки й кігтеточки — на своїх місцях, іграшки — будь-де на підлозі. */
export type HomeItem = BowlItem | WaterItem | LitterItem | ToyItem | HouseItem | ScratcherItem;
/** Річ для котів, яку можна купити (§6.4); переноска не стоїть на місці в квартирі. */
export type ThingKind = HomeItem["kind"] | "carrier" | "feeder" | Appliance;
/** Побутова техніка (§8.7): одна кожного виду, без місця в квартирі. Автогодівниці — окремо, на мисках. */
export type Appliance = "fountain" | "robot";

/**
 * Автогодівниця (§9.12, правка автора 2026-10-23): стоїть над місцем миски й тримає її повною, доки
 * в ній є корм. Миска зламалася чи її викинули — годівниця лишається й чекає нову.
 */
export interface Feeder {
  /** Місце миски, над яким стоїть годівниця. */
  slot: string;
  quality: Quality;
  /** Порції корму в бункері. */
  food: number;
  foodQuality: Quality | null;
  sterile: boolean;
}

/** Куди можна поїхати (§8.5). Розплідник і виставку додасть крок 12. */
export type Destination = "shop" | "vet" | "doctor" | "shelter" | "breeder" | "groomer" | "cafe" | "office" | "show";

/** Інша машина в гонці (§8.5): смуга й місце на дорозі на початку гонки (у хвилинах дороги). */
export interface RaceCar {
  lane: number;
  start: number;
}

/** Гонка дорогою (§8.5). Відстані — у хвилинах дороги за звичайної швидкості. */
export interface Race {
  /** Довжина дороги. */
  road: number;
  /** Скільки проїхано. */
  done: number;
  /** Скільки ігрових хвилин триває гонка. */
  minutes: number;
  /** Смуга, у якій персонаж (дробова, поки перестроюється), і та, куди він їде. */
  lane: number;
  targetLane: number;
  /** Швидкість: від 0,5 до 2 звичайної. */
  speed: number;
  cars: RaceCar[];
  /** До якого місця дороги машини вже згенеровано. */
  spawned: number;
  /** Стан генератора машин: на переграванні дорога та сама. */
  rng: number;
}

/** Поїздка (§8.5): гонка туди, подія на місці, повернення без гонки; аварія — перемотування. */
export interface Trip {
  destination: Destination;
  phase: "drive" | "visit" | "accident";
  /** Кіт у переносці. */
  cat: number | null;
  race: Race;
  /** Втрати після аварії (§8.5). */
  losses: AccidentLoss[];
  /** Скільки хвилин забрала подія на місці. */
  visit: number;
  /** Зерно поїздки: знижки в магазині (§6.4). */
  seed: number;
  /** Поїздка вже зарахована як поїздка в робочий час (§8.6). У старих збереженнях немає. */
  workTrip?: boolean;
}

export type AccidentLoss = "repair" | "health" | "sanity" | "cat";

/** Котячий безлад на підлозі (§9.12). */
export type MessKind = "surprise" | "vomit" | "hairball" | "litter" | "broken" | "fur" | "mark";

export interface Mess {
  id: number;
  kind: MessKind;
  /** Де лежить, у клітинках підлоги. */
  x: number;
  y: number;
  /** Чий це безлад: для спостереження за рисами (§9.9). */
  cat: number | null;
}

/** Квартира: запаси, плита, поверхні, речі для котів, безлад і пакунки (§6.4, §8.7, §9.12). */
export interface Home {
  /** Порції їжі й корму, душі засобів гігієни, чистки наповнювача. */
  supplies: Record<Product, Record<Quality, number>>;
  /** Запаси, які вже бували вдома: лише їх показує сховище (§6.4). */
  acquired: Product[];
  /**
   * Ящики біля входу (§6.4, правка автора 2026-10-23): куплені запаси, ще не розкладені по сховищах.
   * Безлімітні, брати з них не можна — лише розпакувати. У старих збереженнях немає.
   */
  boxes?: Partial<Record<Product, Record<Quality, number>>>;
  /** Запаси, що вже хоч раз закінчувалися (§6.4): підказка телефоном — лише вперше. У старих збереженнях немає. */
  ranOut?: Product[];
  /** Запаси, що вперше закінчилися, а телефон відтоді не відкривали: кнопка телефону пульсує з їхньою іконкою. */
  phoneHints?: Product[];
  /** На плиті одна страва; хвилини — скільки вона там лежить. */
  stove: { item: Dish | null; minutes: number };
  /** Що лежить на столі й робочих поверхнях: за id речі квартири. */
  surfaces: Record<string, Dish | null>;
  /** Речі для котів на своїх місцях. */
  items: HomeItem[];
  messes: Mess[];
  /** Пакунки в дорозі. */
  deliveries: Delivery[];
  /** Пакунки під дверима. */
  porch: Delivery[];
  /** Неоплачений тиждень комунальних — попередження (§6.4); 0, якщо боргу немає. */
  utilitiesDebt: number;
  /** Ремонт меблів (подертий диван) до найближчого платежу комунальних (§6.4). */
  repairs: number;
  /** Переноска для котів (§8.5): одна на дім; null — немає. */
  carrier: Quality | null;
  /** Техніка (§8.7): якість кожної, null — немає. */
  appliances: Record<Appliance, Quality | null>;
  /** Автогодівниці над мисками (§9.12). У старих збереженнях немає. */
  feeders?: Feeder[];
  /** Шерсть на меблях 0–100 (§8.7). */
  fur: number;
  /** На скільки днів лишилося чистого одягу (§8.7). */
  clothes: number;
  /** Пральна машина: стоїть, пере (хвилини до кінця) чи випрала — треба розвісити. */
  washer: { state: "idle" | "washing" | "done"; minutes: number; quality: Quality };
}

/** Звідки кіт (§4.2): притулок, примусове кошеня, народився вдома, розплідник, знайда. */
export type CatSource = "shelter" | "shelter-forced" | "born" | "breeder" | "foundling";

/** Рівень риси (§9.1). */
export type TraitLevel = -2 | -1 | 1 | 2;

/** Риса характеру кота (§9.1, `TRAITS.md`). */
export interface Trait {
  /** Група рис: id з `TRAIT_GROUPS`. */
  group: string;
  level: TraitLevel;
  /** Скільки проявів риси бачив персонаж (§9.9). */
  seen: number;
  /** Риса відома: її показали під час вибору кота (§9.9). */
  known: boolean;
}

/** Гени забарвлення (§9.10): кожен ген — пара алелів; рудий у кота — один, у кішки — два. */
export interface Genes {
  /** Рудий, зчеплений зі статтю: true — рудий алель. */
  orange: boolean[];
  /** Колір пігменту: true — чорний (домінантний), false — шоколадний. */
  black: [boolean, boolean];
  /** Освітлення: true — насичений (домінантний), false — освітлений. */
  dense: [boolean, boolean];
  /** Агуті: true — видно табі-малюнок (домінантний). */
  agouti: [boolean, boolean];
  /** Тип табі: 0 — мармуровий, 1 — смугастий, 2 — плямистий, 3 — тікований; більший домінує. */
  tabby: [number, number];
  /** Білі плями: 0 — немає, 1 — трохи, 2 — багато; сума задає, скільки білого. */
  white: [number, number];
  /** Колорпойнт: true — звичайний (домінантний), false — сіамський. */
  full: [boolean, boolean];
  /** Довжина шерсті: true — коротка (домінантна), false — довга. */
  short: [boolean, boolean];
  /** Відтінок очей, якщо вони не блакитні: 0 — зелені, 1 — жовті, 2 — мідні. */
  eyes: number;
}

/** Форми частин тіла (§9.10). */
export interface Shape {
  muzzle: "normal" | "flat" | "long";
  ears: "normal" | "large" | "folded" | "curled" | "tufted";
  tail: "long" | "short" | "fluffy" | "bobtail" | "none";
  build: "slim" | "normal" | "stocky";
  legs: "normal" | "short";
  /** Шерсть від породи: безшерста чи кучерява; null — за генами. */
  coat: "hairless" | "curly" | null;
}

/** Потреби кота 0–100 (§9.12). */
export type CatNeed = "hunger" | "thirst" | "toilet" | "fatigue" | "attention" | "play";

/** Що кіт робить зараз (§9.3, §9.12). */
export type CatActKind =
  | "idle"
  | "wander"
  | "eat"
  | "drink"
  | "toilet"
  | "sleep"
  | "beg"
  | "attention"
  | "hide"
  | "zoomies"
  | "knock"
  | "steal"
  | "toy"
  | "keyboard"
  | "lap"
  | "scratch"
  | "wrestle"
  | "groom"
  | "fight"
  /** Мстивий кіт іде до ліжка персонажа, щоб залишити там «сюрприз» (§9.12). */
  | "revenge"
  /** «Хвостик» супроводжує персонажа з кімнати в кімнату (§9.12). */
  | "follow";

export interface CatAct {
  kind: CatActKind;
  /** Ціль дії: id предмета, речі квартири чи місця; null — без цілі. */
  target: string | null;
  /** Клітинка, куди йде кіт; null — уже на місці. */
  goal: Vec | null;
  /** Скільки хвилин дія ще триває на місці. */
  minutes: number;
  /** Скільки хвилин дія вже триває на місці. */
  elapsed: number;
  /** Кіт прийшов по увагу, і персонаж це побачив (§9.9): прояв зараховано, раз за похід. */
  seen?: boolean;
  /** Кіт іде до персонажа, бо голодний, а миски порожні: такий похід не прояв «Ласкавості» (§9.9). */
  forFood?: boolean;
}

/** Хвороби прототипу (§9.5, `DISEASES.md`). */
export type DiseaseId = "cold" | "fleas" | "worms" | "stomach" | "injury" | "cystitis" | "conjunctivitis" | "senior" | "urolithiasis" | "dermatitis";

/** Хвороба кота: коли почалася й скільки лікування вже було. */
export interface CatDisease {
  id: DiseaseId;
  /** День, коли кіт захворів. */
  day: number;
  /** Дози ліків, що подіяли. */
  doses: number;
  /** Порції дорогого корму на дієті (розлад шлунка). */
  diet: number;
  /** Днів поспіль у доброму настрої (цистит від стресу). */
  calm: number;
  /** До якого дня (включно) хронічну хворобу контролюють ліки чи ветеринар. */
  controlled: number | null;
  /** Діагноз відомий: його поставив ветеринар (§9.9). */
  known: boolean;
}

export interface Cat {
  id: number;
  name: string;
  sex: Sex;
  source: CatSource;
  ageWeeks: number;
  /** День, коли кіт з'явився в домі. */
  arrivedDay: number;
  traits: Trait[];
  /** Порода (§9.11): дві однакові — чистокровний; "mixed" — безпородний. */
  breed: [string, string];
  genes: Genes;
  shape: Shape;
  /** Приховані шкали 0–100 (§9.5–9.6, §7). */
  health: number;
  mood: number;
  love: number;
  needs: Record<CatNeed, number>;
  /** Середній настрій за кожен прожитий день (§9.7). */
  moodHistory: number[];
  /** Настрій за поточну добу: сума «настрій × хвилини» і хвилини (§9.6). */
  moodToday: { sum: number; minutes: number };
  /** Чи взаємодіяв персонаж із котом сьогодні (§7). */
  interacted: boolean;
  diseases: CatDisease[];
  /** До якого дня кіт після грумера не зригує шерстяних грудок (§8.5). */
  groomedUntil: number;
  /** Фізіологічні стани (§9.8). */
  sterilized: boolean;
  /** Про стерилізацію персонаж знає: возив до ветеринара чи сказав притулок (§9.9). */
  sterilizedKnown: boolean;
  /** До якого дня кіт відновлюється після операції. */
  recoveryUntil: number;
  /** Тічка триває до цього дня (включно); наступна — з дня `nextHeat`. */
  heatUntil: number;
  nextHeat: number;
  /** Вагітність: батько й день пологів (ніч перед ним). */
  pregnancy: { father: number | null; due: number; known: boolean } | null;
  /** Скільки виводків уже було: перший — на одне кошеня менший. */
  litters: number;
  /** До якого дня кішка відпочиває після пологів і не вагітніє. */
  restUntil: number;
  /** Які половини породи знає персонаж (§9.11). */
  breedKnown: [boolean, boolean];
  /** Нашийник (§9.10): якість і дзвіночок; null — без нашийника. */
  collar: { quality: Quality; bell: boolean } | null;
  /** Ласощі за сьогодні (§7). */
  treatsToday: number;
  /** Остання втрата любові від неприємного: коли (хвилина від початку гри) і скільки (§7). */
  hurt: { at: number; amount: number } | null;
  /** Останній день, коли кота купали (§8.7). */
  bathedDay: number;
  /** Втрати здоров'я з джерелом за останній тиждень: з них — причина смерті (§9.7). */
  healthLog: { day: number; source: string; amount: number }[];
  /** Де кіт, у клітинках підлоги; facing — куди дивиться: −1 ліворуч, 1 праворуч. */
  x: number;
  y: number;
  facing: number;
  act: CatAct;
  /** Кіт поза квартирою: утік на сходи (§9.12); null — удома. */
  away: "stairs" | "trip" | null;
  parents: { mother: number | null; father: number | null };
}

/** Чому кота не стало (§9.7): старість, хвороба, туга (поганий настрій) чи віддали в добрі руки. */
export type FarewellCause = { kind: "old" } | { kind: "disease"; disease: string } | { kind: "sorrow" } | { kind: "given" };

/** Запис «Альбому пам'яті» (§9.7): усе про кота, якого більше немає вдома. */
export interface AlbumEntry {
  id: number;
  name: string;
  sex: Sex;
  source: CatSource;
  ageWeeks: number;
  /** Повний характер: на прощанні альбом показує всі риси (§9.9). */
  traits: Trait[];
  breed: [string, string];
  genes: Genes;
  shape: Shape;
  cause: FarewellCause;
  /** Середній настрій за все життя (§9.7). */
  lifeMood: number;
  arrivedDay: number;
  /** Ніч, коли кота не стало: день, що закінчився. */
  day: number;
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
  /** Хто будив персонажа вночі (§8.8). */
  wakeUps: { cat: number; reason: "morning" | "night" }[];
  /** Хвилина нового дня, коли персонаж прокинувся. */
  wokeMinute: number;
  /** Кроки ночі в порядку виконання. */
  steps: NightStep[];
  lostCats: number[];
  /** Коти, яких забрали нові господарі (§9.8). */
  givenCats: number[];
  newCats: number[];
  utilities: UtilitiesReport | null;
  sanityEvening: number;
  sanityMorning: number;
}

/** Статистика гри (§4.2). */
export interface GameStats {
  /** Хвилини: робота (й пошук роботи), коти, собі, «метушня» — ходіння між справами. */
  minutes: { work: number; cats: number; self: number; bustle: number };
  /** Скільки котів виростив персонаж, за тим, звідки вони. */
  raised: Record<CatSource, number>;
}

/** Що сьогодні відбувається за модифікатором (§4.1). */
export interface ModifierDay {
  /** Коли подзвонить мама; null — дзвінка немає чи вже був. */
  callAt: number | null;
  /** Хвилини за комп'ютером на важливій нараді. */
  meetingMinutes: number;
  /** Сьогодні вже возили кота до ветеринара (щеплення). */
  vaccinated: boolean;
  /** До якого дня коти хворіють частіше: щеплення пропущено. */
  vaccineMissedUntil: number;
  /** Сьогодні вже були в офісі. */
  officeDone: boolean;
  /** Під дверима знайда, рішення ще не ухвалено. */
  foundling: boolean;
  /** Коли востаннє була знайда. */
  lastFoundling: number;
  /** Знижка на найближчі комунальні (перерахунок). */
  utilitiesDiscount: number;
  /** Хвилина пробудження цієї ночі раніше на стільки (галасливі сусіди). */
  earlyWake: number;
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
  /** Хвилина, з якої почався день: пробудження чи побудка котами (§8.8). */
  dayStartMinute: number;
  character: Character;
  /** Поїздка, якщо персонаж зараз поза домом (§8.5). */
  trip: Trip | null;
  /** Котів притулку й розплідника цього тижня (§8.5): вибір фіксований на тиждень. */
  shelter: { week: number; cats: Cat[] } | null;
  breeder: { week: number; breed: string; cats: Cat[] } | null;
  /** Коти, яких завтра заберуть за оголошенням (§9.8). */
  ads: number[];
  job: Job;
  home: Home;
  modifiers: { day: string | null; week: string | null };
  /** Статистика для екрана кінця гри (§4.2): хвилини за категоріями й виховані коти. */
  stats: GameStats;
  /** Стан модифікаторів дня (§4.1): дзвінок, нарада, щеплення, знайда тощо. */
  today: ModifierDay;
  cats: Cat[];
  /** «Альбом пам'яті» (§9.7): коти, яких більше немає. */
  album: AlbumEntry[];
  /** Стосунки пар котів −100…+100 (§9.4): ключ — `id-id`, менший id першим. */
  relations: Record<string, number>;
  /** Наступний id для котів, речей, безладу й пакунків. */
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
