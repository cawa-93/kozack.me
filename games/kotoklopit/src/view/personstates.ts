// Стани персонажа (§8.4): що зараз показує панель — іконками — і профіль телефона — іконкою, назвою й описом. Чиста функція без
// Phaser і DOM: одна для обох, щоб панель і профіль не розходилися.

import { SLEEP_SPEED_MAX_BONUS } from "../sim/config";
import { powerOut } from "../sim/modifiers";
import { isDrowsy } from "../sim/sleep";
import type { GameState, IllnessId } from "../sim/types";
import { onSickLeave } from "../sim/work";

export type PersonStateId = "drowsy" | "sleepDebt" | "rested" | "wellRested" | "jobSearch" | "sickLeave" | "noPower" | IllnessId;

/**
 * Стани, що діють зараз, у порядку панелі. Знесилення й голод видно з самих шкал (вони блимають, §11.4), тож їх тут немає; день
 * без світла — тут, бо в розкладі його немає (§4.1).
 */
export function personStates(state: GameState): PersonStateId[] {
  const out: PersonStateId[] = [];
  if (isDrowsy(state)) out.push("drowsy");
  const speed = state.character.sleepSpeed;
  if (speed < 0) out.push("sleepDebt");
  if (speed > 0) out.push(speed >= SLEEP_SPEED_MAX_BONUS ? "wellRested" : "rested");
  if (state.job.unemployed) out.push("jobSearch");
  if (onSickLeave(state)) out.push("sickLeave");
  if (powerOut(state)) out.push("noPower");
  for (const illness of state.character.illnesses) out.push(illness.id);
  return out;
}
