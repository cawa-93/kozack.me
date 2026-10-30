// Обличчя кота нового вигляду (крок 16, GRAPHICS_PLAN.md, «Вибір анімації»): вирази — це підміна кадрів очей, рота й вух
// (§11.4, §9.12; «Показуй, а не розказуй», §11.3а). Які стани кадрів — з того, що кіт відчуває (`catFeeling`), з настрою з
// поведінки (`catLook`) і з пози (`catPose`). Без Phaser.
//
// Стани кадрів (контракт маніфесту F5): очі `cat/eyes` — `open`, `half` (напівзаплющені), `closed`, `arc` (мружиться
// дужками), `squint` (сердито примружені), `round` (широко розплющені), `sick` (кон'юнктивіт: червоні, сльозяться); рот
// `cat/mouth` — `closed`, `meow`, `hiss` (з іклами), `yawn`, `eat`, `tongue`. Вуха — `up` (звичайні), `flat` (притиснуті:
// терпить, пручається, страх), `side` (опущені вбік: сум), `back` (притиснуті вбік і назад: дуга, шипіння); у висловухого
// стан вух не видно. Разові анімації (`catevents.ts`) на свій час перекривають ці кадри.

import { catFeeling } from "../../sim/actions";
import { hasDisease } from "../../sim/diseases";
import { absoluteMinute } from "../../sim/time";
import type { Cat, GameState } from "../../sim/types";
import { catPose, interactionWith, isLicked, withFriend } from "../pose";
import { blinkAmount, catLook } from "../thoughts";
import type { CatAnimId } from "./ids";

export type CatEyes = "open" | "half" | "closed" | "arc" | "squint" | "round" | "sick";
export type CatMouth = "closed" | "meow" | "hiss" | "yawn" | "eat" | "tongue";
export type CatEars = "up" | "flat" | "side" | "back";

export const CAT_EYES: readonly CatEyes[] = ["open", "half", "closed", "arc", "squint", "round", "sick"];
export const CAT_MOUTHS: readonly CatMouth[] = ["closed", "meow", "hiss", "yawn", "eat", "tongue"];
export const CAT_EARS: readonly CatEars[] = ["up", "flat", "side", "back"];

/** Кадри обличчя кота. */
export interface CatFace {
  eyes: CatEyes;
  mouth: CatMouth;
  ears: CatEars;
}

/** Скільки ігрових хвилин після шипіння рот відкритий (§9.4, «Спина дугою»), як у старому вигляді (`legacy/cat.ts`). */
export const HISS_OPEN_MINUTES = 0.8;

/** Пози, у яких кіт спить: очі заплющені. */
const SLEEPING: ReadonlySet<CatAnimId> = new Set<CatAnimId>(["sleep", "snore", "blanket", "carrier", "sprawl"]);
/** Пози азарту — засідка, гра, біг: очі круглі. */
const EAGER: ReadonlySet<CatAnimId> = new Set<CatAnimId>(["crouch", "paw", "kick", "run", "pounce"]);

const face = (eyes: CatEyes, mouth: CatMouth = "closed", ears: CatEars = "up"): CatFace => ({ eyes, mouth, ears });

/** Очі повільного кліпання (§11.4) за часом: розплющені → напівзаплющені → заплющені й назад (`blinkAmount`). */
export function blinkEyes(time: number, catId: number): CatEyes {
  const amount = blinkAmount(time, catId);
  return amount >= 0.75 ? "closed" : amount >= 0.25 ? "half" : "open";
}

/** Кіт щойно шипів (§9.4, §9.12): рот відкритий ще `HISS_OPEN_MINUTES` ігрових хвилин. */
export function isHissing(state: GameState, cat: Cat): boolean {
  return cat.hissedAt !== undefined && absoluteMinute(state.day, state.minute) - cat.hissedAt < HISS_OPEN_MINUTES;
}

/** Обличчя без хвороби очей. */
function baseFace(state: GameState, cat: Cat, time: number, pose: CatAnimId): CatFace {
  if (SLEEPING.has(pose)) return face("closed");
  // Щойно шипів: перед ворогом, на того, хто кличе гратися, на кошеня чи гостей — рот з іклами, вуха назад.
  if (isHissing(state, cat)) return face("round", "hiss", "back");
  // Спина дугою й клубок бійки (§9.4): очі широко розплющені, вуха притиснуті вбік і назад.
  if (pose === "arch" || pose === "brawl") return face("round", "closed", "back");
  // З-під меблів видно лише очі (§9.12): насторожені.
  if (pose === "hide") return face("open", "closed", "flat");
  // Під рукою, на руках, у ванні, біля вікна, коли вилизує друг (§9.12, §9.4 В1): мружиться, терпить, пручається.
  const feeling = catFeeling(state, cat) ?? (isLicked(cat) ? "content" : null);
  // З вудкою кіт азартний: очі круглі (хоч і задоволений).
  if (interactionWith(state, cat) === "play") return face("round");
  if (feeling === "content") return face("arc");
  if (feeling === "reluctant") return face("squint", "closed", "flat");
  // Попереджає (§10, рішення автора 2026-10-30, п. 4): вуха притиснуті «літачком», як перед ворогом, очі сердито звужені.
  if (feeling === "warning") return face("squint", "closed", "back");
  if (feeling === "struggling") return face("round", "closed", "flat");
  switch (pose) {
    case "lick":
    case "groom":
      // Вилизує друга чи себе (§9.4, §9.12): очі напівзаплющені, видно язичок.
      return face("half", "tongue");
    case "drink":
      return face("half", "tongue");
    case "eat":
    case "chew":
      return face("open", "eat");
    case "sniff":
    case "squat":
    case "loaf":
      return face("half");
    case "decline":
      // Не хоче гратися (§9.4, Г5): дивиться на того, хто кликав, вуха вбік.
      return face("open", "closed", "side");
    default:
      break;
  }
  if (EAGER.has(pose)) return face("round");
  // Перед ворогом, у бійці й з другом котові не до персонажа (§9.4): без смутку й кліпання.
  const look = withFriend(cat) ? null : catLook(state, cat);
  if (look === "sad") return face("half", "closed", "side");
  if (look === "blink") return face(blinkEyes(time, cat.id));
  if (look === "nudge") return face("arc");
  if (look === "sulk") return face("half", "closed", "side");
  return face("open");
}

/**
 * Обличчя кота (крок 16): `time` — час сцени, мс (повільне кліпання). Кон'юнктивіт (§9.5) — кіт мружиться: розплющені й
 * напівзаплющені очі стають `sick`.
 */
export function catFace(state: GameState, cat: Cat, time: number): CatFace {
  const result = baseFace(state, cat, time, catPose(state, cat));
  if ((result.eyes === "open" || result.eyes === "half") && hasDisease(cat, "conjunctivitis")) return { ...result, eyes: "sick" };
  return result;
}
