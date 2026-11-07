// Голос кота (§11.3, §11.4а): яке нявкання звучить — за віком і тим, що кіт саме робить. Чисті функції: перевіряє
// `tests/sfx-cats.test.ts`.

import { isKitten, isOld } from "../../../sim/cat";
import { THOUGHTS } from "../../../sim/config";
import type { Cat } from "../../../sim/types";

/** Ситуація нявкання: просить, радіє (чує корм, вітається, кличе гратися), сумне, кричить (застряг нагорі) чи просто. */
export type MeowMood = "ask" | "happy" | "sad" | "cry" | "plain";

/** Що каже кіт цим нявканням: подія `meow` ситуації не несе, тож її видно з поточної дії кота. */
export function meowMood(cat: Cat): MeowMood {
  const act = cat.act;
  if (act.kind === "beg") return act.target === "high" ? "cry" : "ask";
  if (act.kind === "attention") return "ask";
  // Почув корм і біжить до миски, вітає біля дверей, приніс іграшку до ніг — радісне.
  if ((act.kind === "eat" && act.goal !== null) || (act.kind === "follow" && act.target === "door") || act.kind === "carry") return "happy";
  return cat.mood < THOUGHTS.sad ? "sad" : "plain";
}

/** Звук нявкання групи `cats` для кота й ситуації. Кошеня пищить завжди, старий — хрипкіше й нижче. */
export function meowSound(cat: Cat, mood: MeowMood): string {
  if (isKitten(cat)) return "meow-kitten";
  if (mood === "cry") return "cry";
  if (isOld(cat)) return mood === "happy" ? "meow-happy" : "meow-old";
  switch (mood) {
    case "ask":
      return "meow-ask";
    case "happy":
      return "meow-happy";
    case "sad":
      return "meow-sad";
    default:
      return "meow";
  }
}

/**
 * Висота голосу цього кота: стала для кожного (той самий кіт — той самий голос, §11.3), різна між котами, нижча в старого.
 * Розкид у межах кількох відсотків, щоб записи лишалися природними.
 */
export function voiceRate(cat: Cat): number {
  const own = 1 + ((((cat.id * 7919) % 11) + 11) % 11 - 5) * 0.012;
  return isOld(cat) ? own * 0.92 : own;
}
