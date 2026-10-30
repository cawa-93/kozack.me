// Події симуляції. З них сцена показує бабли (§11.4) і ранкові повідомлення (§4),
// а режим розробки веде журнал прихованих змін (§11.5). Стан гри від підписників не залежить.

import type { AccidentLoss, AlbumEntry, Destination, Delivery, DiseaseId, Dish, ForbiddenZone, GameEnd, GameState, HomeItem, IllnessId, Item, Medicine, Mess, NightReport, Product, Quality, TraitLevel, TrinketKind } from "./types";

/** Рівень терпіння керівництва (§8.6): ok, «!» чи «Х». */
export type PatienceLevel = "ok" | "warning" | "out";

/** Події модифікаторів дня (§4.1): для баблів, карток і журналу. */
/** Як минув візит гостей (§9.12 «Двері й гості»): безлад, шипіння «Шипить на гостей», захват від «Душі компанії». */
export interface GuestsVisit {
  mess: boolean;
  hissed: boolean;
  delighted: boolean;
}

export type ModifierEvent =
  | "reputation"
  | "meeting-start"
  | "meeting-attended"
  | "meeting-missed"
  | "home-vet"
  | "fireworks"
  | "inspection"
  | "inspection-away"
  | "guests"
  | "guests-away"
  | "home-vet-away"
  | "office-missed"
  | "vacation-pay"
  | "mom-call"
  /** Мама занесла гостинці (`value` 1) чи лишила під дверима, а персонаж їх заніс (0) (§4.1). */
  | "mom-food";

/** Де кіт точить кігті (§9.12, «Дряпання»). */
export type ScratchSpot = "post" | "sofa" | "doorframe" | "rug" | "boxes";

/** Що треба мати в руках чи поруч, щоб дія вдалася (§11.4): продукти, страву, корм, кота, будь-що, брудний лоток. */
export type Need = "raw" | "dish" | "catfood" | "cat" | "item" | "dirty-litter";

/**
 * Чому дія не вдалася (§11.4, правило автора 2026-10-25): кожна причина — своя зрозуміла іконка, тож
 * причина каже, що саме заважає, а не загальне «не можна». Нова відмова — нова причина.
 */
export type Refusal =
  /** Руки зайняті. */
  | { reason: "hands-full" }
  /** Запасу немає: холодильник, шафка, порошок, шампунь, ліки, корм, коли насипають. */
  | { reason: "empty"; product: Product }
  /** Річ із рук сюди не покласти. */
  | { reason: "not-here"; item: Item }
  /** Місце зайняте: тут уже стоїть страва. */
  | { reason: "occupied" }
  /** Уже повне: миска з кормом (і годівниця), миска з водою. */
  | { reason: "full"; what: "bowl" | "water" }
  /** Лоток і так чистий. */
  | { reason: "clean" }
  /** Корми не змішують (§6.4). */
  | { reason: "mixed" }
  /** Потрібна річ у руках чи брудний лоток. */
  | { reason: "need"; need: Need }
  /** Спати ще рано (§8.1). */
  | { reason: "too-early" }
  /** Пральна машина ще пере. */
  | { reason: "washing" }
  /** На комп'ютері кіт (§9.12). */
  | { reason: "cat-on-computer" }
  /** Планове відключення інтернету (§4.1). */
  | { reason: "no-internet" }
  /** Під дверима пакунків немає. */
  | { reason: "no-packages" }
  /** Ліки не потрібні: хвороби, яку лікують ліками, немає (§6.5). */
  | { reason: "healthy" }
  /** Ліки на сьогодні вже випито (§6.5). */
  | { reason: "dose-taken" }
  /** Розкласти запаси з ящиків нікуди: сховища повні (§6.4). */
  | { reason: "no-room" }
  /** В аптечці нічого для цього кота (§8.7). */
  | { reason: "kit-empty" }
  /** У ящиках біля входу спить кіт: розпакувати їх не можна, поки його не забрали (§9.12, «Допитливість»). */
  | { reason: "cat-in-box" }
  /** Смітник перекинуто: спершу прибрати сміття (§9.12, «Кмітливість у бешкеті»). */
  | { reason: "trash-tipped" }
  /** Кіт нагорі — на холодильнику чи шафі: не дотягтися, злізе сам (§9.12, «Лазіння»). */
  | { reason: "cat-up-high" }
  /** «Нудьгар» не зважає на вудку й відвертається (§9.12, «Ігривість»). */
  | { reason: "cat-bored" }
  /** Дріт комп'ютера перегризено: спершу полагодити — утримати дію біля комп'ютера (§9.12, «Гризіння»). */
  | { reason: "wire-chewed" }
  /** Ривка немає: персонаж застуджений (§6.5; загальна ревізія 2026-10-29 — раніше ривок мовчки не спрацьовував). */
  | { reason: "cold" }
  /** Ривка немає: здоров'я нижче 25 — сил немає (§6.3; загальна ревізія 2026-10-29). */
  | { reason: "weak" }
  /** Ривка немає: персонаж травмований (§6.5; рішення автора 2026-10-29, `GENERAL_REVIEW.md`, дрібні питання — «Травма й ривок»). */
  | { reason: "injured" }
  /** Чистого одягу вже досить: прання нічого не додасть (§8.7; загальна ревізія 2026-10-29). */
  | { reason: "clothes-clean" }
  /** Новонародженого не гладять і з ним не граються: він спить біля мами (§9.8; загальна ревізія 2026-10-29). */
  | { reason: "newborn" }
  /**
   * Кіт щойно попереджав чи вкусив під рукою: 15 хвилин не дається гладити й іде з-під руки (§9.12, рішення автора 2026-10-29,
   * А8).
   */
  | { reason: "cat-annoyed" };

export type GameEvent =
  | { type: "night"; report: NightReport }
  | { type: "game-over"; end: GameEnd }
  | { type: "took"; object: string; item: Item }
  | { type: "put"; object: string; item: Item }
  /** Персонаж узяв чи витратив запас (§6.4): над ним виринає залишок. */
  | { type: "supply-used"; product: Product; left: number }
  /** Колеги на відеодзвінку помітили поганий вигляд (§5.1). */
  | { type: "call-remark"; issue: "clothes" }
  | { type: "trashed"; item: Item }
  | ({ type: "refused"; object: string } & Refusal)
  | { type: "cooked"; result: "ready" | "burnt" }
  | { type: "ate"; satiety: number; food: number }
  | { type: "showered"; hygiene: number; quality: Quality | null; left: number }
  | { type: "work-started" }
  | { type: "work-stopped"; minutes: number; money: number; reputation: number; sanity: number }
  | { type: "patience"; level: PatienceLevel }
  | { type: "standup-started" }
  | { type: "standup"; attended: boolean; reputation: number }
  | { type: "person-ill"; illness: IllnessId }
  | { type: "person-cured"; illness: IllnessId }
  | { type: "person-meds"; quality: Quality }
  | { type: "treat"; cat: number; quality: Quality }
  | { type: "collar"; cat: number }
  | { type: "bathed"; cat: number }
  /** Прання (§8.7): віджим — гучний звук (§9.12). */
  | { type: "laundry"; stage: "cat" | "started" | "spin" | "done" | "hung"; cat?: number }
  | { type: "vacuumed" }
  | { type: "robot" }
  | { type: "feeder"; bowls: number[] }
  /** Автогодівницю спорожнили (§9.12): корм повернувся в ці сховища. */
  | { type: "feeder-emptied"; item: number; products: Product[] }
  | { type: "broke"; what: string }
  /**
   * Подія дня (§4.1). `guests` — що сталося з гостями (§9.12 «Двері й гості»): безлад, шипіння з-під дивана, захват від котів;
   * з цього повідомлення дня й складає слова (перевірка етапу 2026-10-26).
   */
  | { type: "modifier"; kind: ModifierEvent; value: number; guests?: GuestsVisit; paid?: number }
  | { type: "career"; change: "promoted" | "demoted" | "fired" | "hired"; position: number }
  | { type: "ordered"; delivery: Delivery; price: number }
  /** Пошук роботи: вакансія закінчилася відмовою, далі — нова (§8.6). */
  | { type: "job-rejected"; vacancy: number }
  /** Ящики розпаковано (§6.4): що й скільки розлетілося по сховищах. */
  | { type: "unpacked"; moved: { product: Product; amount: number }[] }
  /** Дзвонять у двері (§9.12 «Двері й гості»): кур'єр із пакунком (`delivery`), гості, ОСББ чи мама. */
  | { type: "doorbell"; delivery?: Delivery }
  | { type: "received"; deliveries: Delivery[] }
  | { type: "dash" }
  | { type: "trip-started"; destination: Destination }
  | { type: "trip-arrived"; destination: Destination }
  | { type: "trip-crashed"; losses: AccidentLoss[] }
  | { type: "trip-ended"; destination: Destination }
  | { type: "bought"; goods: string; quality: Quality }
  | { type: "vet-exam"; cat: number }
  | { type: "sterilized"; cat: number }
  | { type: "heat"; cat: number }
  | { type: "pregnant"; cat: number }
  | { type: "birth"; cat: number; kittens: number }
  | { type: "glitch"; chance: number; angle: number }
  // Коти (§9.3, §9.6, §9.12). Приховані зміни бачить лише журнал режиму розробки.
  | { type: "cat-mood"; cat: number; delta: number; reason: string }
  /** Будь-яка зміна настрою кота, зокрема тривала й без причини в журналі: для сердечок. */
  | { type: "cat-felt"; cat: number; delta: number }
  | { type: "cat-love"; cat: number; delta: number; reason: string }
  | { type: "cat-day"; cat: number; mood: number; health: number; love: number }
  | { type: "cat-trait"; cat: number; group: string; level: TraitLevel; title: string }
  | { type: "trait-noticed"; cat: number; group: string; stage: 1 | 2 | 3 }
  | { type: "cat-arrived"; cat: number }
  | { type: "cat-gone"; entry: AlbumEntry }
  | { type: "cat-ill"; cat: number; disease: DiseaseId }
  | { type: "cat-cured"; cat: number; disease: DiseaseId }
  | { type: "symptom"; cat: number; symptom: "sneeze" | "itch" | "eyes" | "pain" }
  | { type: "medicine"; cat: number; medicine: Medicine; quality: Quality }
  /** Ліки дали раніше ніж за 6 годин після попередньої дози — кіт випльовує (§9.5, Х3). */
  | { type: "medicine-spat"; cat: number; medicine: Medicine }
  | { type: "cat-ate"; cat: number; quality: Quality }
  | { type: "cat-refused-food"; cat: number }
  /** Вибагливий понюхав брудний лоток і йде шукати інше місце (§9.12, «Вибагливість до лотка»). */
  | { type: "litter-refused"; cat: number }
  /** Кіт кахикає перед шерстяною грудкою (§9.12): це чути. */
  | { type: "coughing"; cat: number }
  /** Після пестощів з руки злетів жмут шерсті (§9.12, «Догляд за шерстю»): персонаж це помічає. */
  | { type: "fur-tuft"; cat: number }
  /** Кіт нявкнув; `silent` — «Тихоня» відкрила рота, а звуку немає (§9.12). */
  | { type: "meow"; cat: number; silent?: true }
  | { type: "mess"; mess: Mess }
  | { type: "cleaned"; what: "litter" | Mess["kind"]; sanity: number }
  | { type: "fed"; item: number; food: number }
  | { type: "watered"; item: number }
  /** Персонаж відкрив кран котові, що чекав на умивальнику (§9.12, «Пиття»): тече вода. */
  | { type: "tap-opened"; cat: number }
  | { type: "picked-up"; cat: number; offended: boolean }
  | { type: "cat-dodged"; cat: number; issue: "clothes" }
  | { type: "cat-broke-free"; cat: number }
  | { type: "put-down"; cat: number }
  | { type: "purr"; cat: number; enjoyed: boolean }
  /** «Образливий» дметься: персонаж підійшов, а кіт відійшов і сів спиною (§9.12). */
  | { type: "sulked"; cat: number }
  /** «Незалежний» не хотів пестощів і пішов з-під руки (§9.12, «Ласкавість»). */
  | { type: "cat-left"; cat: number }
  | { type: "bite"; cat: number }
  /**
   * Кіт подряпав персонажа (`CLAW`): пручаючись біля переноски (§9.12, «Переноска»), у ванні (§8.7; рішення автора 2026-10-29,
   * `GENERAL_REVIEW.md`, А5) чи «Ніндзя», стрибнувши із засідки (§9.12 «Засідки»; рішення автора 2026-10-30, `GENERAL_REVIEW.md`,
   * «Відкрите після рішень», п. 6) — одне правило для всіх подряпин.
   */
  | { type: "clawed"; cat: number; at: "carrier" | "bath" | "ambush" }
  | { type: "played"; cat: number; minutes: number }
  /**
   * Котові дали котячу м'яту (§9.12, «Котяча м'ята»): катається по ній, лише понюхав і пішов (байдужий, кошеня чи м'ята ще
   * не діє) або шаленіє.
   */
  | { type: "catnip"; cat: number; reaction: "roll" | "sniff" | "frenzy" }
  /** «Щедра душа» лягла поруч із котом, якого пестять, чи щиросердий — поруч із тим, кого пригостили, і муркоче (§9.12). */
  | { type: "cat-cuddled"; cat: number; with: number }
  /** Теплолюб мерзне в «Холод», а «Не мерзне» знемагає в «Спеку» (§9.12, «Теплолюбність»). */
  | { type: "weather-felt"; cat: number; feel: "cold" | "hot" }
  /** «Заздрісник» вихопив ласощі, які ви давали іншому котові, і з'їв сам (§9.12, «Заздрісність»). */
  | { type: "treat-snatched"; cat: number; from: number }
  /** Друг прийшов вилизати кота, а той відсторонюється (§9.12, «Вилизування друзів»). */
  | { type: "groom-refused"; cat: number; by: number }
  /** Кіт підійшов до забороненого місця, пам'ятає «ні» й розвертається (§9.12, «Слухняність»). */
  | { type: "cat-remembered"; cat: number; zone: ForbiddenZone }
  /** Кіт на підвіконні «кекає» на птахів за вікном (§9.12, «Вікно»). */
  | { type: "chatter"; cat: number }
  /** «Нудьгує біля вікна» злиться на підвіконні, сіпаючи хвостом (§9.12, «Вікно»). */
  | { type: "window-angry"; cat: number }
  | { type: "knocked"; cat: number; object: string; item: Dish }
  /** Кіт скинув дрібничку зі столу (§9.12, «Скидання речей»): стук, а кухоль може й розбитися. */
  | { type: "trinket-fell"; cat: number; trinket: TrinketKind; object: string; broken: boolean }
  /** «Делікатний» обнюхав дрібничку на столі й обійшов її (§9.12): його обережність — думка. */
  | { type: "trinket-sniffed"; cat: number; trinket: TrinketKind }
  | { type: "stole"; cat: number; object: string; item: Dish }
  | { type: "toy-broke"; toy: number }
  | { type: "discarded"; item: HomeItem }
  /** Кіт поточив кігті (§9.12, «Дряпання»): де саме — кігтеточка, диван, одвірок, килимок чи коробки. */
  | { type: "scratched"; cat: number; where: ScratchSpot }
  /** Кіт почав вилизувати друга чи кошеня, і той мружиться (§9.4, рішення автора 2026-10-26, В1): над тим, кого вилизують, — сердечко. */
  | { type: "groom-started"; cat: number; friend: number }
  | { type: "groomed"; cat: number; friend: number }
  | { type: "cat-fight"; cats: [number, number] }
  /** Двоє котів догралися — засідка, погоня, боротьба (§9.4, рішення автора 2026-10-26, Г3): без бабла, для журналу. */
  | { type: "cats-played"; cats: [number, number] }
  /**
   * Покликаний гратися кіт відмовився (§9.4 «Згода, охорона й сварки», Г5): лягає й сіпає хвостом; `sick` — хворий, ще й шипить.
   */
  | { type: "play-declined"; cat: number; by: number; sick: boolean }
  /**
   * Кіт шипить на іншого: ревнощі чи сварка за миску й лоток (§9.4). `why` — причина, яку видно значком (§9.4 «Згода, охорона й
   * сварки», рішення автора 2026-10-26, Р2); без неї — сама злість.
   */
  | { type: "hissed"; cat: number; at: number; why?: HissCause }
  /** «Шипить на гостей» шипить з-під дивана на дзвінок чи на гостей (§9.12, «Гості»). */
  | { type: "hissed-guests"; cat: number }
  | { type: "fight-stopped"; cat: number }
  /** Вороги сходяться в протистояння (§9.4, рішення автора 2026-10-26): перший підходить до другого. */
  | { type: "standoff"; cats: [number, number] }
  /** Гравець торкнувся кота в протистоянні — коти розходяться (§9.4). */
  | { type: "standoff-parted"; cat: number }
  /** Кіт відступив від ворога й ховається (§9.4): програв бійку чи протистояння. */
  | { type: "cat-retreated"; cat: number; from: number }
  | { type: "keyboard"; cat: number }
  | { type: "knocked-down"; cat: number }
  /** Кіт вистрибнув із засідки персонажу на ноги й збив його (§9.12, «Засідки»). */
  | { type: "ambushed"; cat: number }
  /**
   * Кіт лапою смикає дверцята шафки з кормом (§9.12, «Кмітливість у бешкеті»): відчинив (`opened`) чи вони тримаються на
   * замку.
   */
  | { type: "cabinet-pawed"; cat: number; opened: boolean }
  /** Кіт перекинув смітник (§9.12, «Кмітливість у бешкеті»): гуркіт і сміття на підлозі. */
  | { type: "trash-tipped"; cat: number }
  /** Кіт почав гризти дріт комп'ютера чи пакети біля входу — хрумтить (§9.12, «Гризіння»). */
  | { type: "chewing"; cat: number; what: "wire" | "boxes" }
  /** Дріт комп'ютера перегризено (§9.12, «Гризіння»): іскра, комп'ютер не працює. */
  | { type: "wire-chewed"; cat: number }
  /** Кіт прогриз пакет у ящиках біля входу (§9.12, «Гризіння»): одиниці запасу немає; корм і ласощі він з'їв. */
  | { type: "bag-chewed"; cat: number; product: Product }
  /** Персонаж полагодив перегризений дріт (§9.12, «Гризіння»). */
  | { type: "wire-fixed" }
  /** Знайшлася шкарпетка з котячої схованки (§9.12, «Подарунки й схованки»): шукали перед виїздом чи її витяг пилосос. */
  | { type: "sock-found"; where: "trip" | "vacuum" }
  | { type: "tripped"; cat: number }
  | { type: "slipped"; mess: number }
  | { type: "escaped"; cat: number }
  /** Кіт злякався гучного звуку й біжить ховатися (§9.12). */
  | { type: "scared"; cat: number }
  /** Кота розбудили шум чи кроки (§9.12). */
  | { type: "cat-woke"; cat: number }
  /** Нервовий кіт нервово вилизується після неприємного (§9.12). */
  | { type: "nervous"; cat: number }
  | { type: "cat-returned"; cat: number; caught: boolean };

/**
 * Причина шипіння, яку видно значком (§9.4 «Згода, охорона й сварки», Р2): миска чи лоток — сварка й охорона, вікно — охорона
 * підвіконня, рука — ревнощі, кошеня — «Сам ще кошеня» відганяє малого.
 */
export type HissCause = "bowl" | "litter" | "window" | "hand" | "kitten";

export type Listener = (event: GameEvent, state: GameState) => void;

const listeners = new Set<Listener>();

/** Підписатися на події; повертає функцію, що скасовує підписку. */
export function onEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emit(state: GameState, event: GameEvent): void {
  for (const listener of listeners) listener(event, state);
}

/** Закінчити гру (§6.1). Друга причина вже нічого не змінює. */
export function endGame(state: GameState, end: GameEnd): void {
  if (state.end !== null) return;
  state.end = end;
  emit(state, { type: "game-over", end });
}
