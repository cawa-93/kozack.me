// Що показати з декору квартири, якого сим не знає (§8.9 «День і ніч», §4.1 «Планове відключення»; рішення автора 2026-11-02
// і 2026-11-03): бра, бойлер, зарядну станцію й полички зі свічками (місця — `src/view/decor.ts`, малює
// `iso/apartment.ts`). Чиста функція від стану гри й часу світла кадру (`WorldFrame.lightMinute`), без Phaser
// (`tests/decorlook.test.ts`).
//
// - Бра вмикаються самі разом із лампами (`lampsOn`): у темний час, коли є електрика; удень і в день відключення —
//   вимкнені.
// - Бойлер гріє, поки є електрика: індикатор горить; у відключення — згаслий.
// - Зарядна станція й полички зі свічками є лише в день відключення (увесь день); свічки горять у темний час замість ламп
//   (`candlesLit`), удень — погашені.
// - `lightMinute` null — світло доби вимкнене (режим розробки, `?light=off`): як удень — бра не горять, свічки
//   погашені, а бойлер, станція й полички — за електрикою, як завжди.

import { powerOut } from "../../sim/modifiers";
import type { GameState } from "../../sim/types";
import { candlesLit, daylight, lampsOn } from "../light/daylight";

/** Стан кадру бра (`env/sconce/*`). */
export type SconceState = "off" | "on";
/** Стан кадру бойлера (`env/boiler`). */
export type BoilerState = "on" | "off";
/** Стан кадру полички зі свічкою (`env/candle-shelf/*`). */
export type CandleState = "out" | "lit";

export interface DecorLook {
  sconce: SconceState;
  boiler: BoilerState;
  /** Чи стоїть зарядна станція біля комп'ютера. */
  station: boolean;
  /** Полички зі свічками: null — їх немає (є електрика). */
  candles: CandleState | null;
}

/** Вигляд декору до першого кадру: усе, що вмикається, вимкнене, електрика є. */
export const decorLookInit = (): DecorLook => ({ sconce: "off", boiler: "on", station: false, candles: null });

/**
 * Вигляд декору в стані `state` о хвилині світла `lightMinute` (`WorldFrame.lightMinute`; null — світло доби вимкнене).
 * `out` — куди записати (щоб не виділяти щокадру).
 */
export function decorLook(state: GameState, lightMinute: number | null, out: DecorLook = decorLookInit()): DecorLook {
  const power = !powerOut(state);
  const light = lightMinute === null ? null : daylight(lightMinute, power);
  // Без електрики лампи доби — 0 (`daylight`), тож бра в день відключення не вмикаються.
  out.sconce = lampsOn(light) ? "on" : "off";
  out.boiler = power ? "on" : "off";
  out.station = !power;
  out.candles = power ? null : candlesLit(light) ? "lit" : "out";
  return out;
}
