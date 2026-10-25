// Яка іконка в чого (§11.4): запаси, речі в руках і причини відмов. Без Phaser — щоб тести могли
// перевірити, що кожна відмова має свою іконку.

import type { Need, Refusal } from "../sim/events";
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
