// Яка іконка в чого (§11.4): запаси, речі в руках і причини відмов. Без Phaser — щоб тести могли
// перевірити, що кожна відмова має свою іконку.

import type { GameEvent, HissCause, Need, Refusal } from "../sim/events";
import { movableItem } from "../sim/targets";
import type { Cat, Destination, Dish, GameState, Item, Product, StatName, ThingKind } from "../sim/types";
import type { IconName, Mark } from "./iconnames";
import type { DiseaseId, IllnessId } from "../sim/types";

/** Іконка кожного запасу: над сховищем, над персонажем і в ящиках (§6.4). */
export const PRODUCT_ICONS: Record<Product, IconName> = {
  food: "food",
  hygiene: "soap",
  catFood: "kibble",
  sterileFood: "kibble-sterile",
  litter: "litter",
  pills: "pills",
  drops: "drops",
  humanMeds: "human-meds",
  treats: "treats",
  collar: "collar",
  shampoo: "shampoo",
  detergent: "detergent",
  catnip: "catnip",
  momMeal: "mom-meal",
};

/**
 * Іконка кожної речі магазину (§11.4 «Іконка біля назви», рішення автора 2026-11-02): стоїть біля назви речі в магазині
 * (у телефоні й у поїздці, §6.4), щоб гравець вивчав мову іконок. Сама річ, як у грі (`item/<річ>/*`), а не стан чи потреба:
 * миска для корму — не корм (`kibble`), миска для води — не спрага (`drink`) і не порожня поїлка (`thirst`), лоток — не
 * наповнювач (`litter`) і не брудний лоток (`dirty`). Іграшка, замок і автогодівниця — ті самі іконки, що в баблах про них:
 * кіт хоче гратися саме вудочкою (`toy`), брязкає саме цей замок (`lock`), досипає корм саме автогодівниця (`kibble-pour`,
 * на малюнку — вона сама над мискою); групи одного значення — `tests/icons-unique.test.ts`.
 */
export const THING_ICONS: Record<ThingKind, IconName> = {
  bowl: "food-bowl",
  water: "water-bowl",
  litter: "litter-box",
  toy: "toy",
  house: "cat-house",
  scratcher: "scratcher",
  carrier: "carrier",
  feeder: "kibble-pour",
  fountain: "fountain",
  robot: "robot-vacuum",
  lock: "lock",
  vacuum: "vacuum",
};

/**
 * Іконка кожного пункту поїздки (§11.4 «Іконка біля назви», §8.5 «На місці — кадр парковки», рішення автора 2026-11-02): біля
 * назви пункту в «Куди поїхати?», у заголовку картки пункту, на кнопці знайди «Віднести в притулок» і на табличці на даху
 * будівлі біля парковки. Кожен пункт — свій малюнок, ні з чим іншим у грі не спільний: магазин — вітрина, а не кошик 🛒
 * (замовлення з телефона — інший випадок); ветеринар, лікар і притулок — не ліки, не аптечка й не котячий будиночок.
 */
export const DESTINATION_ICONS: Record<Destination, IconName> = {
  shop: "store",
  vet: "vet-clinic",
  doctor: "doctor-office",
  shelter: "shelter",
  breeder: "breeder",
  groomer: "groomer",
  office: "office",
  show: "cat-show",
};

/**
 * Іконки показників персонажа (§6, §11.4): на панелі й у думці персонажа, коли показник низький, — та сама іконка. Ситість і
 * гігієна — ті самі, що в запасів, які їх поповнюють (продукти, засоби гігієни): «одна річ — один символ».
 */
export const STAT_ICONS: Record<StatName, IconName> = {
  health: "heart",
  satiety: "food",
  hygiene: "soap",
  sanity: "mind",
};

/** Сердечка настрою кота (§9.12): не бабли, а зміна настрою — зелене вгору, червоне розбите вниз. */
export const MOOD_ICONS = { up: "mood-up", down: "mood-down" } as const satisfies Record<string, IconName>;

/**
 * Бабли стану (§11.4): що висить, поки триває, — над річчю вголос («річ каже про свій стан»), над персонажем — думка. Сцена
 * вирішує, коли який стан настав (`DayScene.updateStateBubbles`), а іконки — тут, щоб тест бачив усі відповідності «випадок →
 * іконка» (правило автора 2026-10-30 «Унікальна іконка на унікальний кейс»). Плита й стіл — іконкою страви (`stoveIcon`,
 * `itemIcon`), кіт, що просить, — `catAsk`.
 */
export const STATE_ICONS = {
  /**
   * Над комп'ютером (§8.6, §9.12): перегризений дріт, відеодзвінок по роботі, «Х» і «!» терпіння. Стану «немає інтернету» над ним
   * більше немає: у день без світла комп'ютер працює, а про відсутній інтернет думає персонаж (`personThought`; рішення автора
   * 2026-11-02, §4.1).
   */
  computer: { wireChewed: "wire", call: "camera", patienceOut: "cross", patienceWarning: "alert" },
  /** Персонаж у душовій кабіні — тече вода. */
  shower: "drop",
  /**
   * Персонаж у душовій кабіні в день без світла — тече холодна вода: бойлер не гріє (§4.1, рішення автора 2026-11-02). Інший випадок,
   * ніж «тече вода», — своя іконка замість краплі (`showerIcon`).
   */
  coldShower: "cold-water",
  /** Під дверима: кіт на сходах нявчить (його не видно) — важливіший за пакунок. */
  door: { stairs: "meow", porch: "box" },
  /**
   * Пральна машина пере чи чекає, щоб випране розвісили (§8.7); прання, запущене до відключення, стоїть без світла — машина каже
   * «немає світла», як і у відмові (§4.1, рішення автора 2026-11-02).
   */
  washer: { washing: "washer", done: "washed", noPower: "no-power" },
  /** Порожня миска для води — стан речі, не спрага кота. */
  waterEmpty: "thirst",
  /** Брудний лоток. */
  litterDirty: "dirty",
  /** Коти б'ються — один бабл над клубком (§9.4). */
  fight: "fight",
  /** Персонаж сонний — думка (§8.8). */
  drowsy: "zz",
} as const satisfies Record<string, IconName | Record<string, IconName>>;

/**
 * Що каже душова кабіна, поки в ній персонаж (§11.4, §8.7): тече вода. У день без світла душ холодний — над кабіною «холодна вода»
 * (§4.1, рішення автора 2026-11-02). Рішення виконавця 2026-11-02 за правилом «бабл — вголос чи думка»: це стан речі вголос, як і
 * «тече вода», а не думка персонажа — його в кабіні не видно й думки там вимкнено (`personThought`), а над річчю думки не буває
 * (`Thinker`); і замість краплі, а не разом з нею: над річчю — один стан. Купання кота — без змін (рішення виконавця за планом):
 * над кабіною та сама крапля. `power` — чи є світло (`!powerOut`).
 */
export function showerIcon(activity: GameState["character"]["activity"], power: boolean): IconName | null {
  if (activity?.kind !== "use" || activity.inside !== true) return null;
  return !power && activity.bath !== true ? STATE_ICONS.coldShower : STATE_ICONS.shower;
}

/** Іконка на кнопці перестановки (§10): річ у руках чи та, яку візьмуть; null — кнопки немає. */
export function carryIcon(state: GameState): IconName | null {
  const { held, activity } = state.character;
  if (held?.kind === "thing") return THING_ICONS[held.item.kind];
  if (held !== null || activity !== null) return null;
  const item = movableItem(state);
  return item ? THING_ICONS[item.kind] : null;
}

/** Іконка речі в руках чи на місці (§11.4): та сама, що скрізь у грі. */
export function itemIcon(item: Item): IconName {
  switch (item.kind) {
    case "raw":
      return "food";
    case "meal":
      // Мамин судочок — своя іконка (§6.4, рішення автора 2026-10-26).
      return item.mom === true ? "mom-meal" : "meal";
    case "burnt":
      return "smoke";
    case "catfood":
      return item.sterile ? "kibble-sterile" : "kibble";
    case "cat":
      return "cat";
    case "toy":
      return "toy";
    case "vacuum":
      // Вертикальний пилосос (§8.7, рішення автора 2026-11-02, «Пилосос у руках»): той самий, що стоїть у квартирі. Ні в відмову
      // «не сюди», ні на стіл чи плиту він не потрапляє — натискання з ним лише ставить його.
      return "vacuum";
    case "thing":
      return THING_ICONS[item.item.kind];
  }
}

/**
 * Що каже плита (§11.4): вариться, готово, підгоріло. Готова страва — іконкою речі: мамин судочок — своєю, як у руках (§6.4;
 * перевірка 2026-10-26: над ним була звичайна тарілка).
 */
export function stoveIcon(item: Dish | null): IconName | null {
  if (item === null) return null;
  return item.kind === "burnt" ? "smoke" : item.kind === "meal" ? itemIcon(item) : "pot";
}

/**
 * Що просить кіт, який просить (§11.4, §9.12; `beg`): пити — біля порожньої миски для води, на умивальнику (кран) чи там, де
 * миска стояла, коли мисок немає; на сходи — «Втікач» під дверима, своя іконка (кіт тягне лапу до дверей; не нявкання над дверима
 * кота, що вже втік, — рецензія 2026-10-30); інакше — їсти. Це чути — вголос; лише «Терплячий зранку» біля
 * ліжка чекає сніданку мовчки — думкою (рішення автора 2026-10-26). Спрага й голод — ті самі іконки, що й у думках про стан
 * (`thoughts.ts`): той самий випадок (правило автора 2026-10-30 «Унікальна іконка на унікальний кейс»).
 */
export function catAsk(state: GameState, cat: Cat): { kind: "say" | "think"; icon: IconName } {
  const target = cat.act.target;
  if (target === "bed") return { kind: "think", icon: "kibble" };
  const thirsty = target === "sink" || target === "water" || state.home.items.some((i) => i.kind === "water" && `item:${i.id}` === target);
  return { kind: "say", icon: thirsty ? "drink" : target === "door" ? "door-ask" : "kibble" };
}

/** Що треба мати (§11.4): іконка зі знаком питання. */
const NEED_ICONS: Record<Need, IconName> = {
  raw: "food",
  dish: "meal",
  catfood: "kibble",
  cat: "cat",
  item: "palms",
  "dirty-litter": "dirty",
};

/**
 * Бабл відмови (§11.4, правило автора 2026-10-25): кожна причина — своя іконка, а позначка каже, що з
 * нею: «0» — закінчилося, ✗ — сюди не можна чи не треба, ? — потрібно це, ✓ — це вже є.
 */
export function refusalBubble(refusal: Refusal): { icon: IconName; count?: number; mark?: Mark } {
  switch (refusal.reason) {
    // Руки зайняті (GAME_DESIGN §11.4: «долоня, перекреслена»; рецензія хвилі 3; ревізія іконок 2026-11-03, раунд 3) — руки
    // тримають стос коробок, верхня падає, з мазком «ні»: від box (одна коробка з наліпкою) відрізняють руки, нахил і падіння.
    case "hands-full":
      return { icon: "hands", mark: "no" };
    case "empty":
      return { icon: PRODUCT_ICONS[refusal.product], count: 0 };
    case "not-here":
      return { icon: itemIcon(refusal.item), mark: "no" };
    // Місце зайняте (§11.4; ревізія іконок 2026-11-03, раунд 3): страва на стільниці й поруч табличка «в'їзд заборонено» — без
    // позначки: з ✓ (раунд 2) іконку читали «готово / подано», а «!» (раунд 1) — «увага».
    case "occupied":
      return { icon: "taken" };
    case "full":
      return { icon: refusal.what === "bowl" ? "kibble" : "drop", mark: "ok" };
    case "clean":
      return { icon: "dirty", mark: "no" };
    case "mixed":
      return { icon: "mix", mark: "no" };
    case "need":
      return { icon: NEED_ICONS[refusal.need], mark: "ask" };
    case "too-early":
      return { icon: "moon" };
    case "washing":
      return { icon: "washer" };
    case "cat-on-computer":
      return { icon: "cat-laptop" };
    // Немає світла (§4.1, рішення автора 2026-11-02): пральна машина не працює — своя іконка, не перегризений дріт (`wire`), не
    // розряджена батарейка «без сил» (`battery-low`) і не «машина ще пере» (`washer`).
    case "no-power":
      return { icon: "no-power" };
    case "no-packages":
      return { icon: "box", count: 0 };
    case "healthy":
      return { icon: "human-meds", mark: "no" };
    case "dose-taken":
      return { icon: "human-meds", mark: "ok" };
    case "no-room":
      return { icon: "no-room" };
    case "no-place":
      return { icon: "no-place", mark: "no" };
    case "thing-busy":
      return { icon: "thing-busy" };
    case "kit-empty":
      return { icon: "kit", count: 0 };
    case "cat-in-box":
      return { icon: "cat-box" };
    case "trash-tipped":
      return { icon: "bin-tipped" };
    case "cat-up-high":
      return { icon: "cat-high" };
    case "wire-chewed":
      return { icon: "wire" };
    case "cat-bored":
      return { icon: "bored" };
    // Ривка немає (загальна ревізія 2026-10-29): застуджений — градусник, без сил — розряджена батарейка. Іконка застуди й
    // травми — та сама, що біля назви хвороби в лікаря (`ILLNESS_ICONS`, §11.4 «Іконка біля назви»). «Без сил» — здоров'я нижче
    // 25 (`dashRefusal`), а не хвороба: виснаження ривка не забирає, і в нього своя іконка (рецензія 2026-11-02).
    case "cold":
      return { icon: ILLNESS_ICONS.cold };
    case "weak":
      return { icon: "battery-low" };
    // Травмований (§6.5; рішення автора 2026-10-29, дрібні питання) — пластир навскіс (A11b), не градусник застуди.
    case "injured":
      return { icon: ILLNESS_ICONS.injury };
    // Чистого одягу досить (§8.7, загальна ревізія 2026-10-29): чиста футболка на стосі складеного з галочкою — не брудна
    // сорочка («Чистюля»), не мокра (прання готове) і не «повне сховище».
    case "clothes-clean":
      return { icon: "folded", mark: "ok" };
    // Новонароджене (§9.8, загальна ревізія 2026-10-29): кошеня клубочком у гнізді — не кіт нагорі й не кіт у коробці.
    case "newborn":
      return { icon: "nest" };
    // Кіт щойно попереджав чи вкусив під рукою (§9.12, рішення автора 2026-10-29, А8): притиснуті вуха й хвіст, що б'є, — те
    // саме попередження, яке гравець бачив на коті; не «Нудьгар» і не «Образливий», що дметься.
    case "cat-annoyed":
      return { icon: "cat-annoyed" };
  }
}

/**
 * Шипіння з причиною (§9.4 «Згода, охорона й сварки», рішення автора 2026-10-26, Р2; §11.4): злість і значок причини — кожна
 * причина своя.
 */
export const HISS_ICONS: Record<HissCause, IconName> = {
  bowl: "hiss-bowl",
  litter: "hiss-litter",
  window: "hiss-window",
  hand: "hiss-hand",
  kitten: "hiss-kitten",
};

/** Над ким бабл-думка (§11.4): лише над головою персонажа чи кота — речі не думають. */
export type Thinker = "person" | `cat:${number}`;

/**
 * Бабл події (§11.4, правка автора 2026-10-25): вголос — над тим, хто чи що звучить (персонаж, кіт чи річ —
 * ключ, як у `anchorOf` сцени), думка — лише над персонажем чи котом.
 */
export type EventBubble = { icon: IconName; count?: number; mark?: Mark } & ({ kind: "say"; at: string } | { kind: "think"; at: Thinker });

/**
 * Які бабли показує подія. Що відбувається вголос (нявкання, дзвінок, «ай», звук речі) — мовна хмаринка;
 * що персонаж чи кіт відчуває, хоче чи усвідомлює — думка. Запаси, що розлітаються з ящиків, сцена показує
 * сама (бабл — коли іконка долетіла).
 */
export function eventBubbles(event: GameEvent): EventBubble[] {
  const cat = (id: number): `cat:${number}` => `cat:${id}`;
  switch (event.type) {
    case "refused":
      // Відмова — думка персонажа: він зрозумів, що заважає (ціль і так видно рамкою).
      return [{ kind: "think", at: "person", ...refusalBubble(event) }];
    case "supply-used":
      // Витратив запас і подумав, скільки лишилося.
      return [{ kind: "think", at: "person", icon: PRODUCT_ICONS[event.product], count: event.left }];
    case "received":
      return [{ kind: "think", at: "person", icon: "box", count: event.deliveries.length }];
    case "glitch":
    case "tripped":
    case "slipped":
    case "knocked-down":
    case "ambushed":
      // Запаморочення персонаж відчуває; удар і так видно з трусіння камери.
      return [{ kind: "think", at: "person", icon: "dizzy" }];
    case "bite":
      return [{ kind: "say", at: "person", icon: "bite" }];
    case "clawed":
      // Кіт подряпав персонажа біля переноски (§9.12), у ванні (§8.7) чи «Ніндзя» в засідці: кігті — персонаж скрикує вголос (§11.4).
      return [{ kind: "say", at: "person", icon: "claws" }];
    case "picked-up":
      // Ображений кіт на руках шипить.
      return event.offended ? [{ kind: "say", at: cat(event.cat), icon: "angry" }] : [];
    case "sulked":
      // «Образливий» дметься (§9.12): його образа — думка.
      return [{ kind: "think", at: cat(event.cat), icon: "sulk" }];
    case "cat-left":
      // «Незалежний» не хоче пестощів і йде з-під руки (§9.12): «не треба рук» — його думка. Своя іконка: перекреслена долоня —
      // відмова «руки зайняті» (правило автора 2026-10-30 «Унікальна іконка на унікальний кейс», §11.4).
      return [{ kind: "think", at: cat(event.cat), icon: "aloof" }];
    case "cat-dodged":
      // Чистюля не йде на руки в брудному одязі — його думка.
      return [{ kind: "think", at: cat(event.cat), icon: "laundry" }];
    case "symptom": {
      // Чхання й крик болю чути, а свербіж і очі кіт відчуває. Іконка — хвороби, про яку кіт так сигналізує: та сама, що біля
      // її назви у ветеринара (`DISEASE_ICONS`, §11.4 «Іконка біля назви»).
      const icon = DISEASE_ICONS[SYMPTOM_DISEASE[event.symptom]];
      return [event.symptom === "sneeze" || event.symptom === "pain" ? { kind: "say", at: cat(event.cat), icon } : { kind: "think", at: cat(event.cat), icon }];
    }
    case "medicine-spat":
      // Кіт випльовує таблетку чи струшує краплі (§9.5, Х3): це видно й чути — уголос над котом.
      return [{ kind: "say", at: cat(event.cat), icon: event.medicine === "pills" ? "spit-pill" : "spit-drops" }];
    case "meow":
      // «Тихоня» нявкає беззвучно (§9.12): рот відкрито, як для нявкання, тож це мовна хмаринка, але без звуку.
      return [{ kind: "say", at: cat(event.cat), icon: event.silent === true ? "meow-silent" : "meow" }];
    case "hissed":
      // Шипить на іншого кота — уголос; причину видно значком поруч зі злістю (§9.4, Р2).
      return [{ kind: "say", at: cat(event.cat), icon: event.why ? HISS_ICONS[event.why] : "angry" }];
    case "knocked":
      // Кіт скинув страву (§9.12): тарілка розбилася — гуркіт над столом чи стільницею, як розбитий кухоль. Не злість: кіт не шипить
      // (правило автора 2026-10-30 «Унікальна іконка на унікальний кейс», §11.4).
      return [{ kind: "say", at: event.object, icon: "loud" }];
    case "stole":
      // Кіт вкрав страву чи сиру порцію (§9.12, «Злодійство»): хрумтить нею вголос — своя іконка крадіжки (кіт тікає з курячою ніжкою
      // в зубах, A12a) над ним. Не іконка страви: та каже, що страва готова на плиті чи столі, а продукти — запас і ситість (рецензія
      // 2026-10-30, правило автора «Унікальна іконка на унікальний кейс», §11.4).
      return [{ kind: "say", at: cat(event.cat), icon: "stolen" }];
    case "hissed-guests":
      // Шипить на гостей з-під дивана (§9.12 «Гості й дзвінок») — злість.
      return [{ kind: "say", at: cat(event.cat), icon: "angry" }];
    case "trinket-fell":
      // Дрібничка впала зі столу (§9.12): стук — звук речі, вголос над столом; кухоль розбився — гуркіт.
      return [{ kind: "say", at: event.object, icon: event.broken ? "loud" : event.trinket }];
    case "trinket-sniffed":
      // «Делікатний» обнюхав дрібничку й обходить її (§9.12): «не чіпати» — його думка.
      return [{ kind: "think", at: cat(event.cat), icon: event.trinket, mark: "no" }];
    case "keyboard":
      // Кіт сів на клавіатуру (§9.12 «Кіт і робота»): над комп'ютером — кіт на ноутбуці, як і відмова сісти за комп'ютер (той самий
      // випадок); нявкання — інший (правило автора 2026-10-30, §11.4).
      return [{ kind: "say", at: "computer", icon: "cat-laptop" }];
    case "escaped":
      return [{ kind: "say", at: "door", icon: "meow" }];
    case "laundry":
      // Віджим (§9.12): пральна машина гуркоче — звук речі, вголос.
      return event.stage === "spin" ? [{ kind: "say", at: "washer", icon: "loud" }] : [];
    case "scared":
      // Кіт злякався гучного звуку, дзвінка чи гостей і біжить ховатися (§9.12) — його переляк. Своя іконка, не «!»: «!» — попередження
      // терпіння над комп'ютером (правило автора 2026-10-30 «Унікальна іконка на унікальний кейс», §11.4).
      return [{ kind: "think", at: cat(event.cat), icon: "fright" }];
    case "cat-woke":
      // Кота розбудили шум чи кроки (§9.12): поспати не дали.
      return [{ kind: "think", at: cat(event.cat), icon: "zz", mark: "no" }];
    case "cabinet-pawed":
      // Кіт смикає дверцята шафки з кормом (§9.12, «Кмітливість у бешкеті»): клацнули й відчинилися чи брязкає замок —
      // звук речі, вголос над шафкою.
      return [{ kind: "say", at: "cat-cabinet", icon: event.opened ? "cabinet-open" : "lock" }];
    case "trash-tipped":
      // Смітник перекинувся (§9.12): гуркіт — звук речі.
      return [{ kind: "say", at: "trash", icon: "bin-tipped" }];
    case "chewing":
      // Кіт гризе (§9.12, «Гризіння»): хрумтить — уголос над котом.
      return [{ kind: "say", at: cat(event.cat), icon: event.what === "wire" ? "chew-wire" : "chew-bag" }];
    case "wire-chewed":
      // Дріт перегризено (§9.12): іскра й клацання — звук речі над комп'ютером.
      return [{ kind: "say", at: "computer", icon: "wire" }];
    case "sock-found":
      // Шкарпетка знайшлася (§9.12, «Подарунки й схованки»): персонаж зрозумів, куди вона поділася.
      return [{ kind: "think", at: "person", icon: "sock" }];
    case "fur-tuft":
      // Жмут шерсті на руці після пестощів (§9.12): персонаж помічає його — думка.
      return [{ kind: "think", at: "person", icon: "fur" }];
    case "coughing":
      // Кахикання перед грудкою (§9.12) — звук, вголос над котом.
      return [{ kind: "say", at: cat(event.cat), icon: "cough" }];
    case "litter-refused":
      // Чистюля понюхав брудний лоток (§9.12): «брудно» — його думка.
      return [{ kind: "think", at: cat(event.cat), icon: "dirty" }];
    case "cat-refused-food":
      // Перебірливий не хоче простого корму (§9.12): «не цей корм» — його думка. Своя іконка, а не перекреслений корм: той — відмова
      // персонажа «корм сюди не покласти» (правило автора 2026-10-30 «Унікальна іконка на унікальний кейс», §11.4).
      return [{ kind: "think", at: cat(event.cat), icon: "picky" }];
    case "catnip":
      // Котяча м'ята (§9.12): блаженство й «не діє» — думка кота; той, що шаленіє, верещить уголос.
      if (event.reaction === "frenzy") return [{ kind: "say", at: cat(event.cat), icon: "angry" }];
      return [{ kind: "think", at: cat(event.cat), icon: "catnip", ...(event.reaction === "sniff" ? { mark: "no" as const } : {}) }];
    case "cat-cuddled":
      // «Щедра душа» лягла поруч із тим, кого гладять (§9.12, «Ревнивість»): муркоче — тепло на душі, думка «приємно» (два сердечка:
      // одне — здоров'я персонажа, §11.4).
      return [{ kind: "think", at: cat(event.cat), icon: "pleasant" }];
    case "weather-felt":
      // Теплолюб мерзне, «Не мерзне» знемагає від спеки (§9.12, «Теплолюбність»): що кіт відчуває — думка.
      return [{ kind: "think", at: cat(event.cat), icon: event.feel === "cold" ? "chilly" : "hot" }];
    case "treat-snatched":
      // «Заздрісник» вихопив ласощі (§9.12, «Заздрісність»): хрумтить ними вголос, а той, кого пригощали, лишився ні з чим — його
      // думка.
      return [
        { kind: "say", at: cat(event.cat), icon: "treats" },
        { kind: "think", at: cat(event.from), icon: "treats", mark: "no" },
      ];
    case "groom-started":
      // Кота почав вилизувати друг (§9.4, рішення автора 2026-10-26, В1): йому приємно — думка «приємно» над тим, кого вилизують.
      return [{ kind: "think", at: cat(event.friend), icon: "pleasant" }];
    case "groom-refused":
      // Кіт не терпить, щоб його вилизували (§9.12, «Вилизування друзів»): «не треба» — його думка.
      return [{ kind: "think", at: cat(event.cat), icon: "lick", mark: "no" }];
    case "cat-remembered":
      // Кіт згадав «ні» (§9.12, «Слухняність»): заборонене місце, перекреслене, — його думка.
      return [{ kind: "think", at: cat(event.cat), icon: event.zone === "desk" ? "cat-laptop" : "table", mark: "no" }];
    case "chatter":
      // Кіт на підвіконні «кекає» на птахів (§9.12, «Вікно») — звук, уголос.
      return [{ kind: "say", at: cat(event.cat), icon: "bird" }];
    case "window-angry":
      // «Нудьгує біля вікна» злиться на птахів за склом — його злість.
      return [{ kind: "think", at: cat(event.cat), icon: "bird", mark: "no" }];
    case "nervous":
      // Нервовий кіт вилизується після неприємного (§9.12): його тривога.
      return [{ kind: "think", at: cat(event.cat), icon: "lick" }];
    case "doorbell":
      return [{ kind: "say", at: "door", icon: "bell" }];
    case "tap-opened":
      // Кран відкрили котові (§9.12): тече вода — звук речі, вголос над умивальником.
      return [{ kind: "say", at: "sink", icon: "drop" }];
    case "feeder":
      // Автогодівниця насипала (§8.7) — чути, як корм стукає в миску: гранули сиплються, а не корм голодного кота (§11.4).
      return event.bowls.map((bowl) => ({ kind: "say", at: `item:${bowl}`, icon: "kibble-pour" }));
    case "call-remark":
      // Колеги на дзвінку помітили брудний одяг.
      return [{ kind: "say", at: "computer", icon: "laundry" }];
    case "standup-started":
      return [{ kind: "say", at: "computer", icon: "camera" }];
    case "standup":
      return event.attended ? [] : [{ kind: "say", at: "computer", icon: "camera-missed" }];
    case "job-rejected":
      // Відмова з вакансії (§8.6) — резюме з червоним штампом; «Х» — терпіння над комп'ютером (§11.4).
      return [{ kind: "say", at: "computer", icon: "cv-rejected" }];
    case "modifier":
      return event.kind === "meeting-start" ? [{ kind: "say", at: "computer", icon: "camera" }] : [];
    default:
      return [];
  }
}

/**
 * Іконка біля назви хвороби кота в картці ветеринара (§11.4 «Іконка біля назви», рішення автора 2026-11-02; §8.5): картка вчить
 * мови баблів, тож іконка — та сама, що в баблі, яким кіт про хворобу сигналізує (подія `symptom`, бабл бере іконку звідси):
 * застуда — чхання, кон'юнктивіт — очі, сечокам'яна — крик болю, блохи й дерматит — «свербить» (обидві кіт показує однаково —
 * рішення автора 2026-10-27, §9.5: «свербить» — це блохи чи дерматит). Травма — пластир, як у травмованого персонажа
 * (`ILLNESS_ICONS`). Про решту кіт баблом не сигналізує: кожна має свою іконку, і її видно лише в картці.
 */
export const DISEASE_ICONS: Record<DiseaseId, IconName> = {
  cold: "sneeze",
  fleas: "itch",
  worms: "worms",
  stomach: "stomach",
  injury: "bandage",
  cystitis: "urine",
  conjunctivitis: "eyes",
  urolithiasis: "pain",
  dermatitis: "itch",
  obesity: "obese",
  heart: "cardio",
  joints: "joints",
  spine: "spine",
  breathing: "lungs",
  gingivitis: "gums",
};

/**
 * Іконка біля назви хвороби персонажа в лікаря (§11.4 «Іконка біля назви», §6.5). Застуда й травма забирають ривок, тож іконка
 * — та сама, що в його відмові (`refusalBubble` бере її звідси): градусник і пластир. Виснаження ривка не забирає — у нього своя
 * іконка, обличчя з мішками під очима, а не розряджена батарейка відмови «без сил» (здоров'я нижче 25; рецензія 2026-11-02).
 */
export const ILLNESS_ICONS: Record<IllnessId, IconName> = {
  cold: "thermometer",
  exhaustion: "exhausted",
  injury: "bandage",
};

/** Ознака хвороби, яку кіт показує баблом (подія `symptom`, §9.5). */
type Symptom = Extract<GameEvent, { type: "symptom" }>["symptom"];

/**
 * Про яку хворобу кіт сигналізує баблом-ознакою (§9.5: `showSymptoms` у `diseases.ts`; крик болю сечокам'яної в лотку —
 * `catai.ts`): бабл бере іконку цієї хвороби з `DISEASE_ICONS`, тож у баблі й у картці ветеринара вона одна. Свербить і від
 * бліх, і від дерматиту — іконка в них спільна (це перевіряє `tests/icons-unique.test.ts`).
 */
const SYMPTOM_DISEASE: Record<Symptom, DiseaseId> = { sneeze: "cold", itch: "fleas", eyes: "conjunctivitis", pain: "urolithiasis" };
