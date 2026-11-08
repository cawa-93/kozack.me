// Набір на клавіатурі (§8.6, §11.4а): клік за кліком, поки персонаж друкує (`isTyping`), — словами з короткими паузами, зрідка
// довша пауза «подумати», у якій він клацає мишею (буває, двічі). Тут лише відлік у `tick`: файл — один клік клавіші чи миші,
// висоту й гучність розкидає `SoundDef` групи.

import type { GameState } from "../../../sim/types";
import type { Cue } from "../types";
import { isTyping } from "./loops";

/**
 * Паузи, мс реального часу (від і до): між клавішами слова, між словами, «подумати»; слово — від і до клавіш; як часто думає;
 * коли в паузі клацає мишею (частка паузи), як часто двічі й з яким проміжком.
 */
export const TYPING = {
  key: [70, 150],
  word: [180, 380],
  think: [700, 1800],
  letters: [2, 7],
  thinkChance: 0.12,
  mouseAt: [0.3, 0.7],
  doubleClick: 0.3,
  doubleGapMs: 140,
} as const;

const NONE: readonly Cue[] = [];
const KEY: readonly Cue[] = [{ sound: "key", at: "computer" }];

export class Typing {
  /** Скільки ще чекати до наступної клавіші, мс. */
  private left = 0;
  /** Скільки клавіш лишилось у слові. */
  private letters = 0;

  constructor(private readonly random: () => number = Math.random) {}

  tick(state: GameState, dtMs: number): readonly Cue[] {
    if (!isTyping(state)) {
      this.reset();
      return NONE;
    }
    this.left -= dtMs;
    if (this.left > 0) return NONE;
    if (this.letters <= 0) this.letters = Math.round(this.between(TYPING.letters));
    this.letters--;
    if (this.letters > 0 || this.random() >= TYPING.thinkChance) {
      this.left = this.between(this.letters > 0 ? TYPING.key : TYPING.word);
      return KEY;
    }
    // Задумався: остання клавіша слова, а посеред паузи — клік миші. Новий масив — раз на кілька секунд, не щокадру.
    this.left = this.between(TYPING.think);
    const delayMs = Math.round(this.left * this.between(TYPING.mouseAt));
    const cues: Cue[] = [KEY[0]!, { sound: "mouse", at: "computer", delayMs }];
    if (this.random() < TYPING.doubleClick) cues.push({ sound: "mouse", at: "computer", delayMs: delayMs + TYPING.doubleGapMs });
    return cues;
  }

  reset(): void {
    this.left = 0;
    this.letters = 0;
  }

  private between([from, to]: readonly [number, number]): number {
    return from + this.random() * (to - from);
  }
}
