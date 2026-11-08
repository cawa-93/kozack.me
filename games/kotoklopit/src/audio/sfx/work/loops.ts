// Петлі роботи (§8.6, §4.1): гамір колег на летучці чи нараді, дзвінок мами; клавіатура — клік за кліком (`typing.ts`). Кличуть кожні
// `SFX.loopMs`, тож щоразу повертається один із готових наборів, а не новий масив.

import type { GameState } from "../../../sim/types";
import { isWorking } from "../../../sim/work";
// «Зараз дзвінок» — те саме правило, що й поза персонажа та екран комп'ютера: звук не розходиться з картинкою.
import { inMeeting } from "../../../sim/work";
import type { LoopCue } from "../types";

const MURMUR: LoopCue = { key: "call", sound: "murmur", at: "computer" };
const RING: LoopCue = { key: "phone", sound: "ring" };

const NONE: readonly LoopCue[] = [];
const ON_CALL: readonly LoopCue[] = [MURMUR];
const RINGING: readonly LoopCue[] = [RING];

/**
 * Персонаж набирає на клавіатурі: працює чи шукає роботу (це теж набір), не на дзвінку, і мама не дзвонить. Клацання —
 * `typing.ts`.
 */
export function isTyping(state: GameState): boolean {
  return state.today.callPending !== true && isWorking(state) && !inMeeting(state);
}

export function workLoops(state: GameState): readonly LoopCue[] {
  // Поки дзвонить мама, гра стоїть на картці дзвінка: чути лише телефон.
  if (state.today.callPending === true) return RINGING;
  // Дзвінків у безробітного немає (`inMeeting` → `isWorkday`).
  return isWorking(state) && inMeeting(state) ? ON_CALL : NONE;
}
