// Події симуляції. З них сцена показує бабли (§11.4) і ранкові повідомлення (§4),
// а режим розробки веде журнал прихованих змін (§11.5). Стан гри від підписників не залежить.

import type { AccidentLoss, AlbumEntry, Destination, Delivery, DiseaseId, Dish, GameEnd, GameState, HomeItem, IllnessId, Item, Medicine, Mess, NightReport, Product, Quality, TraitLevel } from "./types";

/** Рівень терпіння керівництва (§8.6): ok, «!» чи «Х». */
export type PatienceLevel = "ok" | "warning" | "out";

/** Події модифікаторів дня (§4.1): для баблів, карток і журналу. */
export type ModifierEvent =
  | "reputation"
  | "meeting-start"
  | "meeting-attended"
  | "meeting-missed"
  | "home-vet"
  | "fireworks"
  | "inspection"
  | "guests"
  | "office-missed"
  | "vacation-pay"
  | "mom-call";

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
  /** Вимкнули світло (§4.1). */
  | { reason: "no-power" }
  /** Під дверима пакунків немає. */
  | { reason: "no-packages" }
  /** Ліки не потрібні: хвороби, яку лікують ліками, немає (§6.5). */
  | { reason: "healthy" }
  /** Ліки на сьогодні вже випито (§6.5). */
  | { reason: "dose-taken" }
  /** Розкласти запаси з ящиків нікуди: сховища повні (§6.4). */
  | { reason: "no-room" }
  /** В аптечці нічого для цього кота (§8.7). */
  | { reason: "kit-empty" };

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
  | { type: "collar-lost"; cat: number }
  | { type: "bathed"; cat: number }
  /** Прання (§8.7): віджим — гучний звук (§9.12). */
  | { type: "laundry"; stage: "cat" | "started" | "spin" | "done" | "hung"; cat?: number }
  | { type: "vacuumed" }
  | { type: "robot" }
  | { type: "feeder"; bowls: number[] }
  /** Автогодівницю спорожнили (§9.12): корм повернувся в ці сховища. */
  | { type: "feeder-emptied"; item: number; products: Product[] }
  | { type: "broke"; what: string }
  | { type: "beard"; kind: "shave" | "trim" }
  | { type: "modifier"; kind: ModifierEvent; value: number }
  | { type: "career"; change: "promoted" | "demoted" | "fired" | "hired"; position: number }
  | { type: "ordered"; delivery: Delivery; price: number }
  /** Пошук роботи: вакансія закінчилася відмовою, далі — нова (§8.6). */
  | { type: "job-rejected"; vacancy: number }
  /** Ящики розпаковано (§6.4): що й скільки розлетілося по сховищах. */
  | { type: "unpacked"; moved: { product: Product; amount: number }[] }
  | { type: "doorbell"; delivery: Delivery }
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
  | { type: "symptom"; cat: number; symptom: "sneeze" | "itch" | "eyes" }
  | { type: "medicine"; cat: number; medicine: Medicine; quality: Quality }
  | { type: "cat-ate"; cat: number; quality: Quality }
  | { type: "cat-refused-food"; cat: number }
  | { type: "meow"; cat: number }
  | { type: "mess"; mess: Mess }
  | { type: "cleaned"; what: "litter" | Mess["kind"]; sanity: number }
  | { type: "fed"; item: number; food: number }
  | { type: "watered"; item: number }
  | { type: "picked-up"; cat: number; offended: boolean }
  | { type: "cat-dodged"; cat: number; issue: "clothes" }
  | { type: "cat-broke-free"; cat: number }
  | { type: "put-down"; cat: number }
  | { type: "purr"; cat: number; enjoyed: boolean }
  /** «Незалежний» не хотів пестощів і пішов з-під руки (§9.12, «Ласкавість»). */
  | { type: "cat-left"; cat: number }
  | { type: "bite"; cat: number }
  | { type: "played"; cat: number; minutes: number }
  | { type: "knocked"; cat: number; object: string; item: Dish }
  | { type: "stole"; cat: number; object: string; item: Dish }
  | { type: "toy-broke"; toy: number }
  | { type: "discarded"; item: HomeItem }
  | { type: "scratched"; cat: number; sofa: boolean }
  | { type: "groomed"; cat: number; friend: number }
  | { type: "cat-fight"; cats: [number, number] }
  /** Кіт шипить на іншого: ревнощі чи сварка за миску й лоток (§9.4). */
  | { type: "hissed"; cat: number; at: number }
  | { type: "fight-stopped"; cat: number }
  | { type: "keyboard"; cat: number }
  | { type: "knocked-down"; cat: number }
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
