// Голоси колег на дзвінку (§8.6, §4.1): поки персонаж на летучці чи нараді (`isOnCall`), колеги щось кажуть — безсловесні
// фрази з паузами, кожна одним із кількох голосів (висота). Відлік у `tick`, як і клавіатура (`typing.ts`).

import type { GameState } from "../../../sim/types";
import type { Cue } from "../types";
import { isOnCall } from "./loops";

/** Від початку однієї фрази до наступної, мс реального часу (довше за найдовшу фразу); голоси колег — висота фрази. */
export const TALK = {
  next: [1000, 2600],
  voices: [0.86, 1, 1.14, 1.3],
} as const;

const NONE: readonly Cue[] = [];
const PHRASES: readonly (readonly Cue[])[] = TALK.voices.map((rate) => [{ sound: "talk", at: "computer", rate }]);

export class Talk {
  /** Скільки ще до наступної фрази, мс. */
  private left = 0;

  constructor(private readonly random: () => number = Math.random) {}

  tick(state: GameState, dtMs: number): readonly Cue[] {
    if (!isOnCall(state)) {
      this.reset();
      return NONE;
    }
    this.left -= dtMs;
    if (this.left > 0) return NONE;
    const [from, to] = TALK.next;
    this.left = from + this.random() * (to - from);
    return PHRASES[Math.floor(this.random() * PHRASES.length)] ?? NONE;
  }

  reset(): void {
    this.left = 0;
  }
}
