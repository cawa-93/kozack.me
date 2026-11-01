// Що показує персонаж нового вигляду (крок 16, T2) — чисті правила без Phaser для `iso/person.ts`: кадр очей за тим, наскільки
// вони заплющені, поправки вигляду поверх анімації, річ у гнізді рук (і коли вона там з'являється чи зникає в разовій справі),
// телефон біля вуха, чи анімація сама хилить голову, у якому гнізді кіт (на руках чи на колінах), чи брати накладку рук,
// порядок шматків персонажа в його проміжку глибини й масштаб тіні. Перевіряє
// `tests/isoperson.test.ts`.

import type { Item } from "../../sim/types";
import { PERSON_CONTACT_MS, PERSON_OWN_ARMS, type PersonAnimId } from "../anim/ids";
import { heldThing } from "../anim/personanim";
import type { PERSON_RIG } from "../rig/defs/person";
import type { AnimOf } from "../rig/types";
import { ISO_DEPTH_SLOT } from "./depth";
import { dishFrame, type IsoFrame } from "./looks";
import { NO_EXTRAS, type MixExtras } from "./personmix";

type PersonAnim = AnimOf<typeof PERSON_RIG>;

/**
 * Що в проміжку глибини персонажа (`ISO_DEPTH_SLOT` 0,01) над його точкою, знизу догори: тінь, кіт на руках у ракурсі `back`
 * (за тулубом), сам персонаж, рука, що гладить (коли кіт за персонажем), кіт на руках у ракурсі `front` (перед ним), запах.
 * Кіт на руках — точка кота в реєстрі над точкою персонажа (`placeAbove("person", hands.depth − глибина персонажа)`), а свої
 * шматки кіт кладе ще вище за неї, до `CARGO_PIECES` (T1: тінь +0,001, тіло +0,002, очі з-під меблів +0,003), тож проміжки
 * кота ззаду й спереду — від `cargoBack` і `cargoFront` на `CARGO_PIECES` угору. Старий кіт кладе себе через
 * `placeAbove("person")` (пів проміжку) — теж перед персонажем.
 */
export const PERSON_DEPTH = { shadow: 0.0002, cargoBack: 0.0004, body: 0.004, reach: 0.0045, cargoFront: 0.005, smell: 0.009 } as const;

/** Скільки глибини над своєю точкою займають шматки кота (`PERSON_DEPTH`). */
export const CARGO_PIECES = 0.0035;

/**
 * Глибина руки, що гладить (`iso/person.ts`): над персонажем, а кіт перед ним (ближче до камери) — над котом, у верху його
 * проміжку (`catDepth` — глибина точки кота в реєстрі; NaN чи null — кота в реєстрі немає). Так долоня лежить на спинці
 * кота, а не ховається під ним, і рука не лягає на меблі, що стоять перед обома.
 */
export function reachDepth(personDepth: number, catDepth: number | null): number {
  const over = catDepth !== null && Number.isFinite(catDepth) ? catDepth + ISO_DEPTH_SLOT * 0.95 : -Infinity;
  return Math.max(personDepth + PERSON_DEPTH.reach, over);
}

/**
 * Глибина точки кота на руках чи на колінах (`PersonPart.hands.depth`): за персонажем у ракурсі `back`, перед ним — у `front`
 * (шматки кота — до `CARGO_PIECES` над нею).
 */
export function cargoDepth(personDepth: number, back: boolean): number {
  return personDepth + (back ? PERSON_DEPTH.cargoBack : PERSON_DEPTH.cargoFront);
}

/**
 * Наскільки заплющені очі (`PersonAnimParams.eyes`) — напівзаплющені й заплющені (`person/eyes`: `half`, `closed`). Засинаючи
 * (очі — поступ засинання), заплющує зовсім раніше, ніж обертається до ліжка й падає на нього (`SLEEP_TURN` у
 * `personspot.ts`): заплющені очі видно, поки він ще лицем до кімнати.
 */
export const EYES = { half: 0.2, closed: 0.45 } as const;

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

/** Поправки вигляду за (очі, схована рука, голова хилиться): їх лише дванадцять. */
const EXTRAS = new Map<string, MixExtras>();

/**
 * Поправки вигляду поверх анімації (`mixAnims`): кадр очей (`eyesFrame`), схована ближня рука (її показує рука, що гладить) і
 * голова, що хилиться, засинаючи. Ті самі входи — той самий незмінний об'єкт (ключ кешу `mixAnims` рахується раз на об'єкт),
 * без поправок — `NO_EXTRAS`.
 */
export function personExtras(eyes: "half" | "closed" | null, hideNearArm: boolean, droop: boolean): MixExtras {
  if (eyes === null && !hideNearArm && !droop) return NO_EXTRAS;
  const key = `${eyes ?? ""}|${hideNearArm ? 1 : 0}|${droop ? 1 : 0}`;
  let extras = EXTRAS.get(key);
  if (!extras) {
    extras = Object.freeze({
      ...(eyes ? { frames: Object.freeze({ eyes }) } : {}),
      ...(hideNearArm ? { hidden: Object.freeze(["arm-near"]) } : {}),
      ...(droop ? { ramp: Object.freeze({ head: SLEEP_DROOP }) } : {}),
    });
    EXTRAS.set(key, extras);
  }
  return extras;
}

/**
 * Анімації, які самі ведуть руки, — накладки рук (`carry`, `holdCat`) не беруть: вудочка (іграшку в руці веде `rod`; з
 * накладкою «несе» рука з вудочкою злітала б над головою), бере й опускає кота (N4a) і всі справи (N4b: «бере» закінчується
 * позою «несе», «кладе» з неї починається, купаючи, кота тримає сама `bath`) — `PERSON_OWN_ARMS` з `anim/ids.ts`.
 */
export const OWN_ARMS: ReadonlySet<PersonAnimId> = PERSON_OWN_ARMS;

/**
 * Накладка рук до анімації `anim` — основної чи разової (відмова, вкусили, спіткнувся з котом чи річчю в руках: тіло реагує,
 * руки тримають): та, що дає `personAnim` за тим, що в руках, якщо анімація не веде руки сама (`OWN_ARMS`).
 */
export function armsOverlay(anim: PersonAnimId, overlay: PersonAnimId | null): PersonAnimId | null {
  return overlay !== null && !OWN_ARMS.has(anim) ? overlay : null;
}

/** Ширина тіні під ногами за статурою (`BUILDS`: струнка, звичайна, кремезна). */
export const SHADOW_WIDTH = [0.9, 1, 1.15] as const;

/**
 * Масштаб тіні під ногами (`fx/shadow/person`): базовий масштаб кадру (`addArt`: 1 одиниця арту = 1 px світу за будь-якої
 * роздільності кадру), ширший чи вужчий за статурою. Саме базовий × статура: кадр із роздільністю 2 має базовий 0,5, і тінь
 * без нього стала б удвічі більшою. Пише в `out` і повертає його.
 */
export function shadowScale(base: { x: number; y: number }, build: number, out = { x: 0, y: 0 }): { x: number; y: number } {
  const n = SHADOW_WIDTH.length;
  const k = SHADOW_WIDTH[((Math.trunc(build) % n) + n) % n] ?? 1;
  out.x = base.x * k;
  out.y = base.y;
  return out;
}

/** Анімації, у яких персонаж сидить (робота, нарада, їжа за столом): кіт тоді — на колінах. */
const SITTING: ReadonlySet<PersonAnimId> = new Set<PersonAnimId>(["work", "meeting", "eat"]);

/** Гніздо кота біля персонажа (`PersonPart.hands`): сидячи — коліна (`lap`), інакше — руки (`arms`). */
export function catSocket(anim: PersonAnimId): "lap" | "arms" {
  return SITTING.has(anim) ? "lap" : "arms";
}

/**
 * Телефон біля вуха (`phone`, N4b: дзвонить мама, руки порожні): кадр телефона з кухонної стільниці (A6
 * `mess/trinket/phone`), у стані `fallen` — навскіс і зі світним екраном, тож у руці його видно як телефон, а не як темну
 * плитку; удвічі менший (на стільниці його намальовано більшим, ніж у руці, щоб читався з кімнати).
 */
export const PHONE_HELD = { frame: { id: "mess/trinket/phone", state: "fallen" } as IsoFrame, scale: 0.5 } as const;

/** Що в гнізді рук: гніздо, кадр і масштаб відносно звичайного (1 — як намальовано). */
export interface HeldFrame {
  socket: "held" | "rod";
  frame: IsoFrame;
  scale: number;
}

/**
 * Річ у руках (`Item`, §8.4) — кадр і гніздо скелета: страва, мамин судочок, сира порція (`held`, кадри `item/dish/*`), совок
 * корму (`held`, `item/scoop` з видом корму), вудочка (`rod`, `item/toy/<якість>` у стані «в руці»); з порожніми руками в
 * анімації телефону (`anim` — `phone`) — телефон біля вуха (`PHONE_HELD`). Кіт і порожні руки — null: кота малює частина
 * котів (у точці `hands`).
 */
export function heldFrame(item: Item | null, anim: PersonAnimId | null = null): HeldFrame | null {
  if (item === null) return anim === "phone" ? { socket: "held", frame: PHONE_HELD.frame, scale: PHONE_HELD.scale } : null;
  if (heldThing(item) === "cat") return null;
  switch (item.kind) {
    case "toy":
      return { socket: "rod", frame: { id: `item/toy/${item.toy.quality}`, state: "hand" }, scale: 1 };
    case "catfood":
      return { socket: "held", frame: { id: "item/scoop", state: item.sterile ? "sterile" : item.quality }, scale: 1 };
    case "raw":
    case "meal":
    case "burnt":
      return { socket: "held", frame: dishFrame(item), scale: 1 };
    default:
      return null;
  }
}

/**
 * Що показати в руках у мить `elapsed` (мс від початку) разової справи `shot`: до миті дотику (`PERSON_CONTACT_MS`: рука
 * торкається речі — «бере» з полиці, «кладе» на стіл, «викидає», «миски» — висипав корм) — те, що було в руках до події
 * (`before`), з неї — те, що в руках зараз (`now`). Подія приходить на початку анімації, коли в стані гри річ уже взято чи
 * покладено: інакше рука тягнеться до полиці вже з річчю, а кладе — порожньою. Без разової з дотиком — `now`.
 */
export function shownHeld(before: Item | null, now: Item | null, shot: PersonAnimId | null, elapsed: number): Item | null {
  if (shot === null || !(shot in PERSON_CONTACT_MS)) return now;
  return elapsed < PERSON_CONTACT_MS[shot as keyof typeof PERSON_CONTACT_MS] ? before : now;
}
