// Що звучить, поки персонаж їсть і прибирає (§11.4а; відлік — `../chores.ts`): тарілку ставлять і далі ковтають; у лотку
// ближче до кінця сиплеться свіжий наповнювач; сухий безлад підмітають, мокрий витирають беззвучно.

import { targetById } from "../../../sim/targets";
import type { GameState, MessKind, UseActivity } from "../../../sim/types";
import type { ChorePlan } from "../chores";

const at = "person";

const EAT: ChorePlan = { first: [{ sound: "plate", at }], stroke: [{ sound: "swallow", at, gain: 0.8 }], everyMs: [1400, 2000] };
const LITTER: ChorePlan = { stroke: [], everyMs: [1100, 1400], late: { at: 0.55, cues: [{ sound: "litter-pour", at }] } };
const SWEEP: ChorePlan = { stroke: [{ sound: "sweep", at }], everyMs: [850, 1050] };

/** Мокрий безлад витирають беззвучно, сухий — підмітають. */
const WET: Readonly<Record<MessKind, boolean>> = {
  surprise: true,
  vomit: true,
  hairball: true,
  mark: true,
  pee: true,
  puddle: true,
  litter: false,
  broken: false,
  fur: false,
  paper: false,
  garbage: false,
};

/** Дія групи `person`; душ звучить петлею (`loops`), дріт — група `home`. */
export function personChore(state: GameState, activity: UseActivity): ChorePlan | null {
  const target = targetById(state, activity.target);
  if (target?.type === "item") return target.item.kind === "litter" ? LITTER : null;
  if (target?.type === "mess") return WET[target.mess.kind] ? null : SWEEP;
  if (target?.type === "object" && target.object.kind === "table") return EAT;
  return null;
}
