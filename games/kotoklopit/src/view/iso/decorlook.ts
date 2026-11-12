// Що показати з декору квартири, якого сим не знає (§8.9 «День і ніч», §4.1 «Планове відключення»; рішення автора 2026-11-02
// і 2026-11-03): бра, настільну лампу чи свічку на столі, бойлер, зарядну станцію й полички зі свічками (місця —
// `src/view/decor.ts`, малює `iso/apartment.ts`). Чиста функція від стану гри й часу світла кадру (`WorldFrame.lightMinute`),
// без Phaser (`tests/decorlook.test.ts`).
//
// - Бра й настільна лампа вмикаються самі разом із лампами (`lampsOn`): у темний час, коли є електрика; удень — вимкнені.
// - Бойлер гріє, поки є електрика: індикатор горить; у відключення — згаслий.
// - Зарядна станція й полички зі свічками є лише в день відключення (увесь день); свічки горять у темний час замість ламп
//   (`candlesLit`), удень — погашені.
// - На столі з комп'ютером — настільна лампа, а в день відключення замість неї свічка (рішення автора 2026-11-03: «Під час
//   евенту відключення на столі замість лампи - свічка»): лампи цього дня на столі немає, свічка горить і гасне разом зі
//   свічками на поличках.
// - `lightMinute` null — світло доби вимкнене (режим розробки, `?light=off`): як удень — бра й лампа не горять, свічки
//   погашені, а бойлер, станція, полички й свічка на столі — за електрикою, як завжди.

import { powerOut } from "../../sim/modifiers";
import type { GameState } from "../../sim/types";
import { lampsAt, LIT_FROM } from "../light/daylight";

/** Стан кадру бра (`env/sconce/*`) і настільної лампи (`env/desk-lamp`). */
export type SconceState = "off" | "on";
/** Стан кадру бойлера (`env/boiler`). */
export type BoilerState = "on" | "off";
/** Стан кадру полички зі свічкою (`env/candle-shelf/*`) і свічки на столі (`env/desk-candle`). */
export type CandleState = "out" | "lit";

export interface DecorLook {
  sconce: SconceState;
  /** Настільна лампа на столі з комп'ютером: горить разом із бра; null — її немає (день відключення: на столі свічка). */
  deskLamp: SconceState | null;
  /** Свічка на столі з комп'ютером замість лампи: null — її немає (є електрика), інакше — як свічки на поличках. */
  deskCandle: CandleState | null;
  boiler: BoilerState;
  /** Чи стоїть зарядна станція біля комп'ютера. */
  station: boolean;
  /** Полички зі свічками: null — їх немає (є електрика). */
  candles: CandleState | null;
}

/** Вигляд декору до першого кадру: усе, що вмикається, вимкнене, електрика є. */
export const decorLookInit = (): DecorLook => ({ sconce: "off", deskLamp: "off", deskCandle: null, boiler: "on", station: false, candles: null });

/**
 * Вигляд декору в стані `state` о хвилині світла `lightMinute` (`WorldFrame.lightMinute`; null — світло доби вимкнене).
 * `out` — куди записати (щоб не виділяти щокадру).
 */
export function decorLook(state: GameState, lightMinute: number | null, out: DecorLook = decorLookInit()): DecorLook {
  const power = !powerOut(state);
  // Горять із половини шляху вмикання, як `lampsOn` і `candlesLit`: без електрики замість ламп — свічки (`daylight`), тож бра в
  // день відключення не вмикаються.
  const lit = lightMinute !== null && lampsAt(lightMinute) >= LIT_FROM;
  out.sconce = power && lit ? "on" : "off";
  out.boiler = power ? "on" : "off";
  out.station = !power;
  out.candles = power ? null : lit ? "lit" : "out";
  // На столі — лампа (горить із бра) чи, без електрики, свічка (горить зі свічками на поличках).
  out.deskLamp = power ? out.sconce : null;
  out.deskCandle = out.candles;
  return out;
}
