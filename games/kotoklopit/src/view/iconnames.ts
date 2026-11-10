// Назви іконок, позначок і баблів (§11.4), їхні кадри атласу (`iconArt` тощо, крок 16) і ключ текстури іконки
// (`iconTexture`, `icons.ts`). Без Phaser: назви потрібні й симуляційним тестам (`symbols.ts`, `thoughts.ts`), і маніфесту
// арту.

import type { ArtId } from "./art/types";

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
  "spoiled",
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
  // Хвороби кота без бабла (§11.4 «Іконка біля назви»): їх видно лише біля назви хвороби у ветеринара.
  "worms",
  "stomach",
  "urine",
  "obese",
  "cardio",
  "joints",
  "spine",
  "lungs",
  "gums",
  "spit-pill",
  "spit-drops",
  "kibble-sterile",
  "litter",
  "shampoo",
  "detergent",
  "human-meds",
  "dressing",
  "plaster",
  "pills",
  "drops",
  "treats",
  "collar",
  "mind",
  "utilities",
  "laundry",
  "washed",
  "cat",
  "cat-laptop",
  "no-internet",
  "washer",
  "vacuum",
  "mix",
  "no-room",
  "no-place",
  "thing-busy",
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
  "food-bowl",
  "water-bowl",
  "litter-box",
  "cat-house",
  "scratcher",
  "carrier",
  "fountain",
  "robot-vacuum",
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
  "exhausted",
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
  "door-ask",
  // Пункти поїздок (§11.4 «Іконка біля назви», §8.5 «На місці — кадр парковки»): біля назви пункту в картках і на табличці на
  // даху будівлі біля парковки (`DESTINATION_ICONS`).
  "store",
  "vet-clinic",
  "doctor-office",
  "shelter",
  "breeder",
  "groomer",
  "office",
  "cat-show",
  // День відключення електрики (§4.1, §11.4, рішення автора 2026-11-02): відмова «немає світла» (пральна машина) і бабл
  // «холодна вода» в душі.
  "no-power",
  "cold-water",
  // Стани персонажа на панелі й у профілі телефона (§8.4, §8.8, §8.6, §6.5): недосип, виспався (з ✓ — добре), пошук роботи,
  // лікарняний.
  "alarm",
  "rested",
  "job-search",
  "sick-leave",
  // Речі квартири, що є завжди, у вкладці «Дім» телефона (§8.4): радіо, комп'ютер, віник із совком.
  "radio",
  "computer",
  "broom",
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

/** Кадр атласу іконки (крок 16): `icon/<назва>` — та сама назва, що в коді (маніфест A11, A12). */
export function iconArt(name: IconName): ArtId {
  return `icon/${name}`;
}

/** Кадр атласу позначки поверх іконки: `icon/mark/<позначка>` (A12). */
export function markArt(mark: Mark): ArtId {
  return `icon/mark/${mark}`;
}

/** Кадр атласу тла бабла: `ui/bubble/say|think` (A12); pivot — вістря хвостика, точка `icon` — центр іконки. */
export function bubbleArt(kind: BubbleKind): ArtId {
  return `ui/bubble/${kind}`;
}
