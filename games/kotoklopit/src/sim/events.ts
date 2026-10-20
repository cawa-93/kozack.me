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

/** Чому дія не вдалася: порожньо, руки зайняті, місце зайняте, зарано, нічого робити, річ не підходить. */
export type Refusal = "empty" | "hands-full" | "occupied" | "too-early" | "nothing" | "wrong";

export type GameEvent =
  | { type: "night"; report: NightReport }
  | { type: "game-over"; end: GameEnd }
  | { type: "took"; object: string; item: Item }
  | { type: "put"; object: string; item: Item }
  /** Персонаж узяв чи витратив запас (§6.4): над ним виринає залишок. */
  | { type: "supply-used"; product: Product; left: number }
  | { type: "trashed"; item: Item }
  | { type: "refused"; object: string; reason: Refusal }
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
  | { type: "laundry"; stage: "cat" | "started" | "done" | "hung"; cat?: number }
  | { type: "vacuumed" }
  | { type: "robot" }
  | { type: "broke"; what: string }
  | { type: "beard"; kind: "shave" | "trim" }
  | { type: "modifier"; kind: ModifierEvent; value: number }
  | { type: "career"; change: "promoted" | "demoted" | "fired" | "hired"; position: number }
  | { type: "ordered"; delivery: Delivery; price: number }
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
  | { type: "put-down"; cat: number }
  | { type: "purr"; cat: number; enjoyed: boolean }
  | { type: "bite"; cat: number }
  | { type: "played"; cat: number; minutes: number }
  | { type: "knocked"; cat: number; object: string; item: Dish }
  | { type: "stole"; cat: number; object: string; item: Dish }
  | { type: "toy-broke"; toy: number }
  | { type: "discarded"; item: HomeItem }
  | { type: "scratched"; cat: number; sofa: boolean }
  | { type: "groomed"; cat: number; friend: number }
  | { type: "cat-fight"; cats: [number, number] }
  | { type: "fight-stopped"; cat: number }
  | { type: "keyboard"; cat: number }
  | { type: "knocked-down"; cat: number }
  | { type: "tripped"; cat: number }
  | { type: "slipped"; mess: number }
  | { type: "escaped"; cat: number }
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
