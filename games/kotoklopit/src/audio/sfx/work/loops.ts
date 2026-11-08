// Петлі роботи (§8.6, §4.1): дзвінок мами; і коли що звучить за комп'ютером — клавіатура (`typing.ts`) й голоси колег на
// дзвінку (`talk.ts`). Петлі кличуть кожні `SFX.loopMs`, тож щоразу повертається готовий набір, а не новий масив.

import type { GameState } from "../../../sim/types";
import { isWorking } from "../../../sim/work";
// «Зараз дзвінок» — те саме правило, що й поза персонажа та екран комп'ютера: звук не розходиться з картинкою.
import { inMeeting } from "../../../sim/work";
import type { LoopCue } from "../types";

const NONE: readonly LoopCue[] = [];
const RINGING: readonly LoopCue[] = [{ key: "phone", sound: "ring" }];

/**
 * Персонаж набирає на клавіатурі: працює чи шукає роботу (це теж набір), не на дзвінку, і мама не дзвонить. Клацання —
 * `typing.ts`.
 */
export function isTyping(state: GameState): boolean {
  return state.today.callPending !== true && isWorking(state) && !inMeeting(state);
}

/** Персонаж на летучці чи нараді за комп'ютером. Дзвінків у безробітного немає (`inMeeting` → `isWorkday`). */
export function isOnCall(state: GameState): boolean {
  return state.today.callPending !== true && isWorking(state) && inMeeting(state);
}

export function workLoops(state: GameState): readonly LoopCue[] {
  // Поки дзвонить мама, гра стоїть на картці дзвінка: чути лише телефон.
  return state.today.callPending === true ? RINGING : NONE;
}
