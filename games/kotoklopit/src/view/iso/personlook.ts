// Що показує персонаж нового вигляду (крок 16, T2) — чисті правила без Phaser для `iso/person.ts`: кадр очей за тим, наскільки
// вони заплющені, річ у гнізді рук, чи анімація сама хилить голову, у якому гнізді кіт (на руках чи на колінах) і порядок
// шматків персонажа в його проміжку глибини. Перевіряє `tests/isoperson.test.ts`.

import type { Item } from "../../sim/types";
import type { PersonAnimId } from "../anim/ids";
import { heldThing } from "../anim/personanim";
import type { PERSON_RIG } from "../rig/defs/person";
import type { AnimOf } from "../rig/types";
import { dishFrame, type IsoFrame } from "./looks";

type PersonAnim = AnimOf<typeof PERSON_RIG>;

/**
 * Що в проміжку глибини персонажа (`ISO_DEPTH_SLOT` 0,01) над його точкою, знизу догори: тінь, кіт на руках у ракурсі `back`
 * (за тулубом), сам персонаж, кіт на руках у ракурсі `front` (перед ним), запах. Кіт, якого частина котів кладе через
 * `placeAbove("person")` (пів проміжку), — теж перед персонажем, між ним і запахом.
 */
export const PERSON_DEPTH = { shadow: 0.0005, cargoBack: 0.002, body: 0.004, cargoFront: 0.006, smell: 0.008 } as const;

/** Глибина кота на руках чи на колінах (`PersonPart.hands.depth`): за персонажем у ракурсі `back`, перед ним — у `front`. */
export function cargoDepth(personDepth: number, back: boolean): number {
  return personDepth + (back ? PERSON_DEPTH.cargoBack : PERSON_DEPTH.cargoFront);
}

/** Наскільки заплющені очі (`PersonAnimParams.eyes`) — напівзаплющені й заплющені (`person/eyes`: `half`, `closed`). */
export const EYES = { half: 0.2, closed: 0.72 } as const;

/**
 * Кадр очей за тим, наскільки вони заплющені (0–1: засинання, сонний увечері, виснажений; §8.8, §6.5); null — як в анімації
 * (розплющені). Сонний увечері (0,35) і виснажений (0,25) — напівзаплющені, засинаючи — заплющує зовсім.
 */
export function eyesFrame(eyes: number): "half" | "closed" | null {
  if (eyes >= EYES.closed) return "closed";
  if (eyes >= EYES.half) return "half";
  return null;
}

/** Голова хилиться, засинаючи (§8.8): градуси вперед наприкінці засинання, якщо анімація сама її не хилить. */
export const SLEEP_DROOP = 18;

/** Чи анімація сама хилить голову: є поворот голови чи шиї в будь-якому ракурсі. */
export function movesHead(anim: PersonAnim): boolean {
  const bones = [anim.bones, anim.views?.front?.bones, anim.views?.back?.bones];
  return bones.some((b) => Boolean(b?.head?.rot?.length) || Boolean(b?.neck?.rot?.length));
}

/** Анімації, у яких персонаж сидить (робота, нарада, їжа за столом): кіт тоді — на колінах. */
const SITTING: ReadonlySet<PersonAnimId> = new Set<PersonAnimId>(["work", "meeting", "eat"]);

/** Гніздо кота біля персонажа (`PersonPart.hands`): сидячи — коліна (`lap`), інакше — руки (`arms`). */
export function catSocket(anim: PersonAnimId): "lap" | "arms" {
  return SITTING.has(anim) ? "lap" : "arms";
}

/**
 * Річ у руках (`Item`, §8.4) — кадр і гніздо скелета: страва, мамин судочок, сира порція (`held`, кадри `item/dish/*`), совок
 * корму (`held`, `item/scoop` з видом корму), вудочка (`rod`, `item/toy/<якість>` у стані «в руці»). Кіт і порожні руки — null:
 * кота малює частина котів (у точці `hands`).
 */
export function heldFrame(item: Item | null): { socket: "held" | "rod"; frame: IsoFrame } | null {
  if (item === null || heldThing(item) === "cat") return null;
  switch (item.kind) {
    case "toy":
      return { socket: "rod", frame: { id: `item/toy/${item.toy.quality}`, state: "hand" } };
    case "catfood":
      return { socket: "held", frame: { id: "item/scoop", state: item.sterile ? "sterile" : item.quality } };
    case "raw":
    case "meal":
    case "burnt":
      return { socket: "held", frame: dishFrame(item) };
    default:
      return null;
  }
}
