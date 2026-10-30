// Яка іконка в чого (§11.4): запаси, речі в руках і причини відмов. Без Phaser — щоб тести могли
// перевірити, що кожна відмова має свою іконку.

import type { GameEvent, HissCause, Need, Refusal } from "../sim/events";
import type { Dish, Item, Product } from "../sim/types";
import type { IconName, Mark } from "./iconnames";

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
    case "hands-full":
      return { icon: "hands" };
    case "empty":
      return { icon: PRODUCT_ICONS[refusal.product], count: 0 };
    case "not-here":
      return { icon: itemIcon(refusal.item), mark: "no" };
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
    case "no-internet":
      return { icon: "no-internet" };
    case "no-packages":
      return { icon: "box", count: 0 };
    case "healthy":
      return { icon: "human-meds", mark: "no" };
    case "dose-taken":
      return { icon: "human-meds", mark: "ok" };
    case "no-room":
      return { icon: "no-room" };
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
    // Ривка немає (загальна ревізія 2026-10-29): застуджений — градусник, без сил — розряджена батарейка.
    case "cold":
      return { icon: "thermometer" };
    case "weak":
      return { icon: "battery-low" };
    // Травмований (§6.5; рішення автора 2026-10-29, дрібні питання) — пластир навхрест, не градусник застуди.
    case "injured":
      return { icon: "bandage" };
    // Чистого одягу досить (§8.7, загальна ревізія 2026-10-29): стос складених сорочок із галочкою — не брудна сорочка
    // («Чистюля»), не мокра (прання готове) і не «повне сховище».
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
      // «Незалежний» не хоче пестощів і йде з-під руки (§9.12): «не треба рук» — його думка.
      return [{ kind: "think", at: cat(event.cat), icon: "hands" }];
    case "cat-dodged":
      // Чистюля не йде на руки в брудному одязі — його думка.
      return [{ kind: "think", at: cat(event.cat), icon: "laundry" }];
    case "symptom":
      // Чхання й крик болю чути, а свербіж і очі кіт відчуває.
      return [event.symptom === "sneeze" || event.symptom === "pain" ? { kind: "say", at: cat(event.cat), icon: event.symptom } : { kind: "think", at: cat(event.cat), icon: event.symptom }];
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
    case "stole":
    case "hissed-guests":
      return [{ kind: "say", at: cat(event.cat), icon: "angry" }];
    case "trinket-fell":
      // Дрібничка впала зі столу (§9.12): стук — звук речі, вголос над столом; кухоль розбився — гуркіт.
      return [{ kind: "say", at: event.object, icon: event.broken ? "loud" : event.trinket }];
    case "trinket-sniffed":
      // «Делікатний» обнюхав дрібничку й обходить її (§9.12): «не чіпати» — його думка.
      return [{ kind: "think", at: cat(event.cat), icon: event.trinket, mark: "no" }];
    case "keyboard":
      return [{ kind: "say", at: "computer", icon: "meow" }];
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
      // Перебірливий не хоче простого корму (§9.12): «не цей корм» — його думка.
      return [{ kind: "think", at: cat(event.cat), icon: "kibble", mark: "no" }];
    case "catnip":
      // Котяча м'ята (§9.12): блаженство й «не діє» — думка кота; той, що шаленіє, верещить уголос.
      if (event.reaction === "frenzy") return [{ kind: "say", at: cat(event.cat), icon: "angry" }];
      return [{ kind: "think", at: cat(event.cat), icon: "catnip", ...(event.reaction === "sniff" ? { mark: "no" as const } : {}) }];
    case "cat-cuddled":
      // «Щедра душа» лягла поруч із тим, кого гладять (§9.12, «Ревнивість»): муркоче — тепло на душі, думка.
      return [{ kind: "think", at: cat(event.cat), icon: "heart" }];
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
      // Кота почав вилизувати друг (§9.4, рішення автора 2026-10-26, В1): йому приємно — думка-сердечко над тим, кого вилизують.
      return [{ kind: "think", at: cat(event.friend), icon: "heart" }];
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
      // Автогодівниця насипала (§8.7) — чути, як корм стукає в миску.
      return event.bowls.map((bowl) => ({ kind: "say", at: `item:${bowl}`, icon: "kibble" }));
    case "call-remark":
      // Колеги на дзвінку помітили брудний одяг.
      return [{ kind: "say", at: "computer", icon: "laundry" }];
    case "standup-started":
      return [{ kind: "say", at: "computer", icon: "camera" }];
    case "standup":
      return event.attended ? [] : [{ kind: "say", at: "computer", icon: "camera-missed" }];
    case "job-rejected":
      return [{ kind: "say", at: "computer", icon: "cross" }];
    case "modifier":
      return event.kind === "meeting-start" ? [{ kind: "say", at: "computer", icon: "camera" }] : [];
    default:
      return [];
  }
}
