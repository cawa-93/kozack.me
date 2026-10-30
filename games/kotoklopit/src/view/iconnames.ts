// Назви іконок, позначок і баблів (§11.4) і ключі їхніх текстур. Без Phaser: назви потрібні й симуляційним тестам
// (`symbols.ts`, `thoughts.ts`), і маніфесту арту (крок 16). Малюнки — в `icons.ts`; щоб іконки стали кадрами атласу,
// досить змінити ключі тут.

/** Усі іконки баблів, панелі й індикаторів: одна назва — один малюнок. */
export const ICON_NAMES = [
  "mood-up",
  "mood-down",
  "alert",
  "cross",
  "camera",
  "camera-missed",
  "pot",
  "meal",
  "smoke",
  "empty",
  "food",
  "soap",
  "bell",
  "box",
  "moon",
  "hands",
  "drop",
  "zz",
  "dizzy",
  "meow",
  "meow-silent",
  "sulk",
  "heart",
  "angry",
  "dirty",
  "thirst",
  "bite",
  "kibble",
  "fight",
  "sneeze",
  "itch",
  "eyes",
  "pain",
  "spit-pill",
  "spit-drops",
  "kibble-sterile",
  "litter",
  "shampoo",
  "detergent",
  "human-meds",
  "pills",
  "drops",
  "treats",
  "collar",
  "mind",
  "laundry",
  "washed",
  "cat",
  "cat-laptop",
  "no-internet",
  "washer",
  "mix",
  "no-room",
  "kit",
  "palms",
  "toy",
  "taken",
  "sad",
  "loud",
  "lick",
  "cough",
  "fur",
  "mug",
  "phone",
  "pen",
  "cat-box",
  "claws",
  "sock",
  "bin-tipped",
  "cabinet-open",
  "lock",
  "cat-high",
  "wire",
  "chew-wire",
  "chew-bag",
  "bored",
  "catnip",
  "bird",
  "table",
  "chilly",
  "hot",
  "mom-meal",
  "hiss-bowl",
  "hiss-litter",
  "hiss-window",
  "hiss-hand",
  "hiss-kitten",
  "thermometer",
  "battery-low",
  "bandage",
  "folded",
  "nest",
  "cat-annoyed",
  "fright",
  "drink",
  "attention",
  "pleasant",
  "aloof",
  "cv-rejected",
  "kibble-pour",
  "picky",
  "stolen",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/**
 * Позначка поверх іконки (§11.4, правило автора 2026-10-25): «no» — перекреслено (сюди не можна,
 * не потрібно), «ask» — знак питання (потрібно це), «ok» — галочка (це вже є).
 */
export type Mark = "no" | "ask" | "ok";

/**
 * Вид бабла (§11.4, правка автора 2026-10-25): «say» — вголос (нявкання, дзвінок, річ «каже» про свій стан),
 * «think» — думка персонажа чи кота (що відчуває, хоче чи усвідомлює). Думка — лише над головою того, хто думає.
 */
export type BubbleKind = "say" | "think";

/** Ключ текстури іконки. */
export function iconTexture(name: IconName): string {
  return `icon-${name}`;
}

/** Ключ текстури позначки поверх іконки. */
export function markTexture(mark: Mark): string {
  return `mark-${mark}`;
}

/** Ключ текстури тла бабла: мовна хмаринка чи думка. */
export function bubbleTexture(kind: BubbleKind): string {
  return `bubble-${kind}`;
}
