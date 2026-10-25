// Яка іконка в чого (§11.4): запаси, речі в руках і причини відмов. Без Phaser — щоб тести могли
// перевірити, що кожна відмова має свою іконку.

import type { GameEvent, Need, Refusal } from "../sim/events";
import type { Item, Product } from "../sim/types";
import type { IconName, Mark } from "./icons";

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
  bell: "bell",
  shampoo: "shampoo",
  detergent: "detergent",
};

/** Іконка речі в руках чи на місці (§11.4): та сама, що скрізь у грі. */
export function itemIcon(item: Item): IconName {
  switch (item.kind) {
    case "raw":
      return "food";
    case "meal":
      return "meal";
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
    case "kit-empty":
      return { icon: "kit", count: 0 };
  }
}

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
      // Запаморочення персонаж відчуває; удар і так видно з трусіння камери.
      return [{ kind: "think", at: "person", icon: "dizzy" }];
    case "bite":
      return [{ kind: "say", at: "person", icon: "bite" }];
    case "picked-up":
      // Ображений кіт на руках шипить.
      return event.offended ? [{ kind: "say", at: cat(event.cat), icon: "angry" }] : [];
    case "cat-dodged":
      // Чистюля не йде на руки в брудному одязі — його думка.
      return [{ kind: "think", at: cat(event.cat), icon: "laundry" }];
    case "symptom":
      // Чхання чути, а свербіж і очі кіт відчуває.
      return [event.symptom === "sneeze" ? { kind: "say", at: cat(event.cat), icon: "sneeze" } : { kind: "think", at: cat(event.cat), icon: event.symptom }];
    case "meow":
      return [{ kind: "say", at: cat(event.cat), icon: "meow" }];
    case "knocked":
    case "stole":
    case "hissed":
      return [{ kind: "say", at: cat(event.cat), icon: "angry" }];
    case "keyboard":
      return [{ kind: "say", at: "computer", icon: "meow" }];
    case "escaped":
      return [{ kind: "say", at: "door", icon: "meow" }];
    case "laundry":
      // Віджим (§9.12): пральна машина гуркоче — звук речі, вголос.
      return event.stage === "spin" ? [{ kind: "say", at: "washer", icon: "loud" }] : [];
    case "scared":
      // Кіт злякався гучного звуку й біжить ховатися (§9.12) — його переляк.
      return [{ kind: "think", at: cat(event.cat), icon: "alert" }];
    case "cat-woke":
      // Кота розбудили шум чи кроки (§9.12): поспати не дали.
      return [{ kind: "think", at: cat(event.cat), icon: "zz", mark: "no" }];
    case "doorbell":
      return [{ kind: "say", at: "door", icon: "bell" }];
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
