// Контрольні константи гри. Дзеркало §16 GAME_DESIGN.md — єдиного місця правди.
// Змінюючи значення тут, онови §16 (і навпаки).

export const TILE = 48;

// Рівні (індекс 0 = рівень 1), §4, §5.2, §7.5, §11.1
export const MAZE_SIZE = [9, 17, 21, 25, 29];               // клітинок по стороні; рівень 1 навчальний
export const LIGHT_MULTIPLIER = [3.0, 1.5, 1.0, 0.8, 0.5];
export const SPIDERS_PER_LEVEL = [0, 0, 2, 3, 4];
export const WEBS_PER_LEVEL = [0, 3, 6, 8, 10]; // на рівні 2 — без павуків, урок (§10)
export const WALL_LAMPS_PER_LEVEL = [6, 8, 6, 4, 2];         // включно з 2 вказівниками
export const BRAID_RATE = [0.35, 0.30, 0.30, 0.25, 0.25];
export const FOG_DENSITY = [0, 0, 0, 0.06, 0.14];
export const CAMERA_LERP = 0.12;
export const CAMERA_LOOK_OFFSET_MAX = 1.5;  // тайлів зсуву камери в бік прицілу, §4 (було 2 при 16 × 16)
export const VOLUME_DEFAULTS = { master: 0.8, effects: 1.0, ambient: 1.0 }; // повзунки меню налаштувань, §12.6
export const VIEWPORT_TILES = 12;           // видима область світу: 12 × 12 тайлів (було 32 → 16 → 12), §4
export const ART_PX_PER_TILE = 16;          // пікселів арту на тайл; сцена 192 × 192, збільшення без згладжування, §11.4
export const LEVEL_TRANSITION_TIME = 1.2;   // с, таймер іде

// Генерація й розміщення, §5.3, §6
export const EXIT_MIN_DISTANCE_FACTOR = 0.6;  // × (W + H) клітинок за шляхом
export const SPIDER_MIN_START_DISTANCE = 10;  // клітинок за шляхом від стартової клітинки
export const SPIDER_ANCHOR_LEVEL = 4;        // індекс рівня 5: один павук біля входу, один біля виходу, §6
export const SPIDER_NEAR_START = [10, 14];  // клітинок від стартової (граф павука); не ближче за SPIDER_MIN_START_DISTANCE
export const SPIDER_NEAR_EXIT = [8, 15];    // клітинок від клітинки виходу
export const WEB_MIN_START_DISTANCE = 6;
export const WEB_MIN_SPACING = 4;
export const WALL_LAMP_MIN_SPACING = [3, 5, 5, 5, 5]; // клітинок; на крихітному рівні 1 менше
export const PLACEMENT_ATTEMPTS = 50;         // спроб на кожен об'єкт, далі регенерація рівня, §6
export const DOOR_MIN_SPACING = 4;
export const POINTER_LAMPS = 2;               // світильники-вказівники на найкоротшому шляху, §6.1
export const POINTER_WINDOWS = [[0.25, 0.42], [0.58, 0.75]]; // частки довжини шляху
export const ITEM_MIN_START_DISTANCE = 5;
export const ITEM_MAX_PATH_FACTOR = 1.4;      // × найкоротший шлях старт→вихід
export const START_CELL_PREFAB = { width: 3, depth: 2, corridorLength: 7 }; // камера рівня 1, §5.4
export const SHELF_SHARE = 0.5;               // частка внутрішніх стін-перегородок рівня 1, що стають полицями, §5.7

export const SPIDER_HUNT_SPEED = 3.84;      // тайлів/сек; ОПОРНА швидкість гри, §9.1
export const PLAYER_WALK_MULT = 0.65;       // ЖОРСТКА ВИМОГА: ходьба < SPIDER_HUNT_SPEED (було 0.8)
export const PLAYER_SPRINT_MULT = 1.5;      // ЖОРСТКА ВИМОГА: біг > SPIDER_HUNT_SPEED
export const PLAYER_WALK_SPEED = PLAYER_WALK_MULT * SPIDER_HUNT_SPEED;     // ≈ 2.50
export const PLAYER_SPRINT_SPEED = PLAYER_SPRINT_MULT * SPIDER_HUNT_SPEED; // = 5.76
export const STAMINA_DRAIN = 0.25;          // /сек бігу; повний запас = 4 с, §8.2
export const STAMINA_REGEN_IDLE = 0.2;      // /сек на місці; від 0 до повного = 5 с (поворот погляду не рахується рухом)
export const STAMINA_REGEN_WALK = 0.1;      // /сек під час ходьби; від 0 до повного = 10 с
export const STAMINA_REGEN_DELAY = 0.75;    // с після припинення бігу
export const STAMINA_EXHAUST_RECOVER = 0.5; // виснаження триває, доки запас < 50 %
export const PLAYER_RADIUS = 0.34;
export const MOUSE_DEADZONE = 0.5;          // тайлів від центру гравця до прицілу, §8.1
export const MOUSE_RETICLE_MAX = 4;         // тайлів; далі віртуальний приціл не відходить (Pointer Lock)
export const MOUSE_TURN_SPEED = Infinity;   // град/сек; миттєвий поворот, важіль балансу §8.1

export const SPIDER_CALM_MULT = 0.25;       // ЖОРСТКА ВИМОГА: 0.25 × SPIDER_HUNT_SPEED = 0.96
export const SPIDER_RADIUS = 0.34;
export const SPIDER_VISION_RANGE = 14;
export const SPIDER_HEARING_RANGE = 3;      // тайлів, евклідово, з будь-якого напрямку й крізь стіни → INVESTIGATE, §9.1.1
export const SPIDER_VISION_ANGLE = 70 * Math.PI / 180;
export const SPIDER_TURN_SPEED_HUNT = 360;  // град/сек
export const SPIDER_TURN_SPEED_CALM = 180;
export const PATH_REPLAN_THROTTLE = 0.25;   // с на павука, §9.2

export const SPIT_RANGE = 2.25;             // ЖОРСТКА ВИМОГА; було 3.0, зменшено на чверть після плейтесту (2026-09-23)
export const SPIT_WINDUP = 0.5;             // ЖОРСТКА ВИМОГА
export const WEB_STUN_DURATION = 1.0;       // с знерухомлення від плювка, §8 (було 2.0)
export const SPIDER_REACTION_TIME = 0.5;    // с нерухомості після входу в HUNT до першої дії, §9.3
export const WEB_STUN_PRESS_REDUCTION = 0.1; // с за кожне нове натискання клавіші (без автоповтору)
export const WEB_STUN_MIN = 0.5;            // с, нижче таймер не опускається
export const WEB_TILE_SLOW = 1 / 3;         // множник швидкості гравця на цілій павутині (утричі повільніше), §10
export const WEB_TEAR_PASSES = 2;           // проходів до розриву: після першого провисає, після другого рветься; кожен — тривога, §10.0.1
export const WEB_STINGER_COOLDOWN = 10;     // с; лише стингер/шейк, не сам тригер, §10
export const HUNT_CRY_COOLDOWN = 3;         // с на павука; крик на кожен вхід у HUNT, §14.2
export const SPIT_PROJECTILE_SPEED = 12.0;  // без упередження: по прямій крізь точку, де гравець був у момент пострілу
export const SPIT_MAX_FLIGHT = 16.0;         // тайлів польоту: досить, щоб наздогнати гравця, що біжить (§9.4)
export const SPIT_COOLDOWN = 2.5;

export const SEARCH_MAX_TURNS = 2;          // ЖОРСТКА ВИМОГА
export const SEARCH_JUNCTION_SCAN = 0.4;    // с короткого SCAN на кожному перехресті в SEARCH
export const CALM_IDLE_PAUSE = [1, 3];      // с паузи після прибуття в CALM
export const SPIT_MISS_DECAL_TIME = 5;      // с, косметична плямка
export const SCAN_DURATION = 1.5;
export const SCAN_DWELL_PER_DIRECTION = 0.25;

export const MIN_PATHS_TO_EXIT = 2;         // ЖОРСТКА ВИМОГА (антисофтлок)

export const HOLES_PER_SPIDER = 3;          // holeCount = spiderCount * 3

export const MEMORY_STRENGTH = [0.22, 0.18, 0.14, 0.09, 0.0]; // за рівнями; L5 = 0
export const MEMORY_TEXTURE_PX_PER_TILE = 8;
export const SEEN_THRESHOLD = 0.05;         // поріг маски видимого, вище якого піксель вважається побаченим, §7.6

// Атомарні дії зі спорядженням (§7.3.1). Усе інше - їхні суми.
export const PICKUP_TIME = 1.0;             // ЖОРСТКА ВИМОГА
export const DOOR_TOGGLE_TIME = PICKUP_TIME; // відчинити/зачинити/розібрати завал, утримання E, §5.6
export const DOOR_REACH = 1.0;              // тайлів до дверей
export const DOOR_CLOSE_CLEARANCE = 0.3;    // тайлів: центр гравця/павука ближче до лінії дверей — прохід зайнятий, §5.6
export const DOOR_AIM_HALF_ANGLE = 60;      // град; двері мають бути в конусі погляду
export const DOORS_PER_LEVEL = [3, 4, 5, 5, 6]; // L1 дерево, L2–3 ґрати, L4–5 завали (непрозорі); завал камери L1 — понад ліміт
export const DROP_TIME = 1.0;               // ЖОРСТКА ВИМОГА
export const UNEQUIP_TIME = 1.5;            // ЖОРСТКА ВИМОГА
export const EQUIP_TIME = 1.5;              // ЖОРСТКА ВИМОГА
// Похідні: зміна приладу = UNEQUIP + EQUIP = 3.0; зміна палаючої шашки = DROP + EQUIP = 2.5
// PICKUP кладе в порожню руку, інакше в рюкзак; рука зайнята + рюкзак повний = провал після 1.0 с.
// UNEQUIP (X) при повному рюкзаку або палаючій шашці замінюється на DROP (1.0).
// Зміна приладу (1-3) при повному рюкзаку — неподільний обмін місцями SWAP_TIME = DROP + EQUIP = 2.5 (§7.3.1).
export const SWAP_TIME = DROP_TIME + EQUIP_TIME;
// Підібрати палаючу шашку зайнятою рукою = UNEQUIP + PICKUP = 2.5
// Усі дії з часом - лише поки клавіша утримується; відпускання скасовує поточний етап (§7.3.1.1).
export const ACTION_BAR_OFFSET = 0.6;       // тайлів над центром персонажа, §7.3.1.2
export const ACTION_BAR_WIDTH = 0.7;        // тайлів
export const ACTION_BAR_CANCEL_FADE = 0.15; // с, спадання бару при скасуванні
export const ACTION_FAIL_FLASH = 0.3;        // с, червоне блимання бару при провалі дії, §7.3.1.3
export const PICKUP_REACH = 0.6;            // тайлів від центру гравця до предмета, §7.3.4
export const ITEM_MIN_SEPARATION = 0.4;     // тайлів між предметами на підлозі, §7.3.4.0
export const ITEM_SCATTER_RADIUS = 0.8;     // тайлів, куди предмет може відкотитися
export const ITEM_SCATTER_TIME = 0.2;       // с анімації відкочування

// Затримки згасання немає: джерело гасне на першому кадрі дії. Узятий у руки предмет
// не світить до активації Space (§7.3.0); виняток - динамо-ліхтар, що світить одразу.
// Прибирання в рюкзак (UNEQUIP) гасить ліхтарик/газову лампу; викидання (DROP) нічого не гасить:
// увімкнений предмет світить із підлоги й витрачає ресурс. Шашку й сірник погасити неможливо.

export const FLARE_RADIUS = 8.0;            // ЖОРСТКА ВИМОГА
export const FLARE_BURN_TIME = 60;          // горить безперервно, погасити неможливо
export const FLARE_THROW_HOLD = DROP_TIME;  // утримання Space для кидка = часу викидання, §7.3.2
export const FLARE_THROW_DISTANCE = 6;      // тайлів, без lightMultiplier
export const FLARE_THROW_SPEED = 12;        // тайлів/сек у польоті
export const FLARE_THROW_LOCKOUT = 1.0;     // с після запалювання, коли кидок не починається, §7.3.2

export const NIGHTVISION_RADIUS = 1.0;      // ЖОРСТКА ВИМОГА
export const NIGHTVISION_ANGLE = 120 * Math.PI / 180;  // ЖОРСТКА ВИМОГА: направлений
export const NIGHTVISION_BRIGHTNESS = 0.15; // частка повної яскравості: лише обриси, без кольору, §7.3.5
export const LIGHT_MIN_RADIUS = NIGHTVISION_RADIUS; // ефективний радіус будь-якого джерела не менший, §7.3
export const NIGHTVISION_RAMP = 1.0;        // радіус росте 0 -> NIGHTVISION_RADIUS за 1 c;
                                            // зір вмикається одразу, плавним є саме радіус

export const DYNAMO_DRAIN = 0.125;          // заряду за секунду (від повного до нуля 8 с): у руці, рюкзаку й на підлозі; у камері до першого підбирання - 0
export const DYNAMO_CHARGE_PER_PRESS = 0.15;
export const DYNAMO_START_CHARGE = 0.5;     // заряд ліхтаря в стартовій камері, §7.3.6
export const DYNAMO_RADIUS_MIN = 0.8;       // при charge -> 0+; при charge = 0 світла немає взагалі
export const DYNAMO_RADIUS_MAX = 3.0;       // при charge = 1
export const GAS_LAMP_RADIUS = 5.5;
export const FLASHLIGHT_RADIUS = 9.0;
export const FLASHLIGHT_ANGLE = 42 * Math.PI / 180;
export const FLASHLIGHT_HALO_RADIUS = 1.0;  // ореол навколо гравця, не тьмяніший за нічний зір, §7.2
export const FLASHLIGHT_BATTERY = 60;       // сек, лише поки увімкнений; сама не відновлюється, батарейка — до повної (§7.3.7)
export const GAS_LAMP_FUEL = 120;           // сек, тікає лише поки горить (Space вмикає/гасить); пальне — до повної (§7.3.7)
export const RELOAD_TIME = EQUIP_TIME;      // утримання Space з батарейкою/пальним у руці: перезарядка ліхтарика/газової лампи, §7.3.7
export const MATCHBOOK_SIZE = 10;
export const MATCH_BURN_TIME = 8;
export const MATCH_RADIUS = 1.6;
export const LIGHTER_RADIUS = MATCH_RADIUS;  // запальничка світить як сірник, §7.3.8
export const LIGHTER_FUEL = MATCHBOOK_SIZE * MATCH_BURN_TIME; // 80 с бензину = повна пачка; лише поки горить
export const WALL_LAMP_RADIUS = 4.5;
export const DOOR_VIEW_PENETRATION = 0.66;  // тайла: світло й зір доходять до полотна зачинених дверей і завалів, §7.2
export const WALL_LAMP_ARC = 180;           // град, від площини стіни
export const TUTORIAL_HINT_SPACE_DELAY = 10; // с з розрядженим динамо в руці до іконки Space, лише рівень 1, §11.2.1
export const TUTORIAL_HINT_E_DELAY = 3;      // с з ціллю для E в досяжності до іконки E
export const HAND_SLOTS = 1;                // рука: предмет у руці слота рюкзака не займає, §7.3
export const BACKPACK_SLOTS = 3;            // слоти без прив'язки до типів, дублікати дозволені, обміну немає
// Разом 4 місця. Порядок заповнення при підбиранні: рука (якщо порожня) -> найменший вільний слот рюкзака.

export const EXIT_BREACH_RADIUS = 6.0;      // пролом назовні на рівні 5; lightMultiplier не діє
export const EXIT_TIME = PICKUP_TIME;       // утримання E біля виходу: перехід на наступний рівень / вихід назовні, §5.5
export const EXIT_REACH = DOOR_REACH;       // тайлів до виходу; вибір виходу — як дверей (конус ±60°), §5.5
export const FOG_VEIL = [0, 0, 0, 0.35, 0.6];    // сила світлої пелени туману (частка в найгустішому пасмі), §7.5
export const FOG_GLOW_RADIUS = [0, 0, 0, 0.6, 1.0]; // тайлів: ореол світла в тумані за межами полігона, §7.5

export const SPIDER_AUDIBLE_CALM = 22;      // тайлів за шляхом, не евклідово (було 16)
export const SPIDER_AUDIBLE_HUNT = 30;      // навмисно > SPIDER_VISION_RANGE (14); було 22
export const SPIDER_NOISE_BY_LEVEL = [1, 1, 1, 0.8, 0.6]; // множник дальності й гучності павуків за рівнем, §14.2 (крик — ні)
export const AUDIO_BFS_INTERVAL = 0.2;      // сек між перерахунками поля відстаней
export const AMBIENT_DUCK_DISTANCE = 8;     // тайлів за шляхом лабіринтом, з якої дистанції павук глушить ембієнт

export const ANTIDOTE_LEVEL = 2;            // ЖОРСТКА ВИМОГА: рівень перед першим павуком
export const STRUGGLE_PRESSES = 5;          // ЖОРСТКА ВИМОГА: ривків, щоб вирватись
export const BLACKOUT_DURATION = 4.0;       // чорнота перед пробудженням
export const RESPAWN_MIN_SPIDER_DISTANCE = 12;  // ЖОРСТКА ВИМОГА: клітинок за шляхом
export const RESPAWN_PLACEMENT_ATTEMPTS = 50;

// ЖОРСТКА ВИМОГА (§9.6): павуки заморожені до першого кроку гравця - на початку рівня
// і після пробудження від протиотрути. Знімається лише рухом, не діями зі спорядженням.
// Стан: runState.spidersReleased, лічильник: runState.distanceTravelled
export const RELEASE_DISTANCE = 1.0;        // ЖОРСТКА ВИМОГА: повний тайл накопиченого руху,
                                            // а не будь-яке зміщення і не перехід у сусідній тайл

export const ITEMS_PER_LEVEL = [2, 3];      // від і до, рівноймовірно, на рівнях 2-5; 0 на рівні 1 (§7.3.4)
export const FINDABLE_ITEMS = ['flashlight', 'gasLamp', 'flare', 'matchbook', 'lighter', 'battery', 'fuel'] as const; // рівноймовірно, §7.3.4
// ЖОРСТКА ВИМОГА: динамо-ліхтар у цьому списку відсутній — знайти його неможливо
