// Набір на клавіатурі (§8.6, §11.4а): клік за кліком, поки персонаж друкує (`isTyping`), — словами з короткими паузами, зрідка
// довша пауза «подумати». Тут лише відлік у `tick`: файл — один клік, висоту й гучність розкидає `SoundDef` групи.

import type { GameState } from "../../../sim/types";
import type { Cue } from "../types";
import { isTyping } from "./loops";

/** Паузи, мс реального часу (від і до): між клавішами слова, між словами, «подумати»; слово — від і до клавіш; як часто думає. */
export const TYPING = {
  key: [70, 150],
  word: [180, 380],
  think: [700, 1800],
  letters: [2, 7],
  thinkChance: 0.12,
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
    this.left = this.between(this.letters > 0 ? TYPING.key : this.random() < TYPING.thinkChance ? TYPING.think : TYPING.word);
    return KEY;
  }

  reset(): void {
    this.left = 0;
    this.letters = 0;
  }

  private between([from, to]: readonly [number, number]): number {
    return from + this.random() * (to - from);
  }
}
