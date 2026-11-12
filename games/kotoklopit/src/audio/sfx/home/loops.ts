// Петлі дому зі стану (§11.4а): плита, пральна, пилосос у руках, робот-пилосос, мухи над брудним лотком, зіпсованою стравою й «сюрпризом». Кличуть кожні
// `SFX.loopMs`, тож записи петель і масив — спільні й перезаписуються, а не створюються щоразу; програвач їх не зберігає.

import { NOISE, ROBOT } from "../../../sim/config";
import { cleaningTool, robotAt, robotProgress } from "../../../sim/household";
import { centerOf, itemPoint, objectById, SURFACE_IDS } from "../../../sim/home";
import { powerOut } from "../../../sim/modifiers";
import { isDirty } from "../../../sim/resources";
import type { GameState } from "../../../sim/types";
import type { LoopCue } from "../types";

const stove: LoopCue = { key: "stove", sound: "stove-loop", at: "stove" };
const washer: LoopCue = { key: "washer", sound: "wash-loop", at: "washer" };
const vacuum: LoopCue = { key: "vacuum", sound: "vacuum-loop", at: "person" };
const robot: LoopCue = { key: "robot", sound: "robot-loop", at: null, gain: 1 };
const flies: LoopCue = { key: "flies", sound: "flies-loop", at: null, gain: 1 };
const out: LoopCue[] = [];

/** Тихий дорогий робот (§8.7, `ROBOT.loud`) звучить тихіше за дешевий. */
const QUIET_ROBOT = 0.6;
/** Закритий лоток тримає запах (§9.12): мух над ним менше. */
const CLOSED_LITTER = 0.5;

export function homeLoops(state: GameState): readonly LoopCue[] {
  out.length = 0;
  const home = state.home;
  // Страва на вогні — і сира, і вже готова: готова ще може підгоріти (§8.7); підгоріла вже не булькає.
  const dish = home.stove.item;
  if (dish !== null && dish.kind !== "burnt") out.push(stove);
  // Без світла прання стоїть (§4.1); останні хвилини — віджим (§9.12).
  if (home.washer.state === "washing" && !powerOut(state)) {
    washer.sound = home.washer.minutes <= NOISE.spinMinutes ? "spin-loop" : "wash-loop";
    out.push(washer);
  }
  // Віник у руках тихий: гуде лише пилосос (§8.7).
  if (state.character.held?.kind === "vacuum" && cleaningTool(state) === "vacuum") out.push(vacuum);
  const robotQuality = home.appliances.robot;
  if (robotQuality && robotProgress(state) !== null) {
    robot.at = robotAt(state);
    robot.gain = ROBOT[robotQuality].loud ? 1 : QUIET_ROBOT;
    out.push(robot);
  }
  if (placeFlies(state)) out.push(flies);
  return out;
}

/**
 * Мухи — одна петля над найближчим до персонажа брудним лотком, зіпсованою стравою на кухні (§8.7) чи «сюрпризом» (§9.12):
 * кілька однакових гудінь злилися б у шум. Ставить місце й гучність у `flies`; нічого з цього немає — false.
 */
function placeFlies(state: GameState): boolean {
  const { x, y } = state.character.body;
  let bestDistance = Infinity;
  for (const item of state.home.items) {
    if (item.kind !== "litter" || !isDirty(item)) continue;
    const p = itemPoint(item);
    const distance = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (distance >= bestDistance) continue;
    bestDistance = distance;
    flies.at = p;
    flies.gain = item.quality === "premium" ? CLOSED_LITTER : 1;
  }
  for (const id of SURFACE_IDS) {
    if (state.home.surfaces[id]?.kind !== "spoiled") continue;
    const p = centerOf(objectById(id));
    const distance = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (distance >= bestDistance) continue;
    bestDistance = distance;
    flies.at = p;
    flies.gain = 1;
  }
  for (const mess of state.home.messes) {
    if (mess.kind !== "surprise") continue;
    const distance = (mess.x - x) ** 2 + (mess.y - y) ** 2;
    if (distance >= bestDistance) continue;
    bestDistance = distance;
    flies.at = { x: mess.x, y: mess.y };
    flies.gain = 1;
  }
  return bestDistance < Infinity;
}
