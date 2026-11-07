// Петлі роботи (§8.6, §4.1): клавіатура за комп'ютером, гамір колег на летучці чи нараді, дзвінок мами. Кличуть кожні
// `SFX.loopMs`, тож щоразу повертається один із готових наборів, а не новий масив.

import type { GameState } from "../../../sim/types";
import { isWorking } from "../../../sim/work";
// «Зараз дзвінок» — те саме правило, що й поза персонажа та екран комп'ютера: звук не розходиться з картинкою.
import { inMeeting } from "../../../sim/work";
import type { LoopCue } from "../types";

const KEYBOARD: LoopCue = { key: "keyboard", sound: "keyboard", at: "computer" };
const MURMUR: LoopCue = { key: "call", sound: "murmur", at: "computer" };
const RING: LoopCue = { key: "phone", sound: "ring" };

const NONE: readonly LoopCue[] = [];
const TYPING: readonly LoopCue[] = [KEYBOARD];
const ON_CALL: readonly LoopCue[] = [MURMUR];
const RINGING: readonly LoopCue[] = [RING];

export function workLoops(state: GameState): readonly LoopCue[] {
  // Поки дзвонить мама, гра стоїть на картці дзвінка: чути лише телефон.
  if (state.today.callPending === true) return RINGING;
  if (!isWorking(state)) return NONE;
  // Пошук роботи — теж набір на клавіатурі; дзвінків у безробітного немає (`inMeeting` → `isWorkday`).
  return inMeeting(state) ? ON_CALL : TYPING;
}
