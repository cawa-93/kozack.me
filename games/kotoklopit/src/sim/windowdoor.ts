// Модифікатори дня за вікном і в під'їзді (§4.1, `DAY_MODIFIERS.md`, «Коти»): «Чужий кіт під вікном» ↔ «Голуби на карнизі»
// міняють, як кіт сидить на підвіконні (§9.12 «Вікно»), «Валер'янка в під'їзді» ↔ «Пес на сходах» — як він тягнеться до вхідних
// дверей (§9.12 «Втечі»). Поведінка — у `catai.ts` і `door.ts`; тут лише те, чи діє день для цього кота й з якою силою.

import { traitLevel } from "./cat";
import { MINUTES_PER_DAY, MINUTES_PER_HOUR, MODIFIERS, WINDOW } from "./config";
import type { Cat, GameState } from "./types";

/** Години, коли коти дивляться у вікно (§9.12): `WINDOW.from`–`WINDOW.to`. */
function sillHours(minute: number): boolean {
  const hour = (((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY) / MINUTES_PER_HOUR;
  return hour >= WINDOW.from && hour < WINDOW.to;
}

/** Під вікном зараз чужий кіт (§4.1): «Чужий кіт під вікном», удень. */
export const strayAtWindow = (state: GameState): boolean => state.modifiers.day === "stray-cat" && sillHours(state.minute);

/** На карнизі зараз голуби (§4.1): «Голуби на карнизі», удень. */
export const pigeonsAtWindow = (state: GameState): boolean => state.modifiers.day === "pigeons" && sillHours(state.minute);

/**
 * Кіт на підвіконні злиться, а не тішиться (§9.12 «Вікно»): «Злиться на вікно» — завжди, решта — коли під вікном чужий кіт.
 * «Не дивиться у вікно» туди не йде, тож і не злиться.
 */
export function angryAtWindow(state: GameState, cat: Cat): boolean {
  const level = traitLevel(cat, "window");
  return level <= -2 || (level >= 0 && strayAtWindow(state));
}

/**
 * Множник голубів (§4.1): вага підвіконня, скільки кіт там сидить, настрій і гра там — для «Вікна» від 0; «Злиться на вікно»
 * лишається собою, тож йому — 1.
 */
export function pigeonsFactor(state: GameState, cat: Cat, key: "weight" | "minutes" | "mood" | "play"): number {
  return traitLevel(cat, "window") >= 0 && pigeonsAtWindow(state) ? MODIFIERS.pigeons[key] : 1;
}

/** Настрій за спалах злості на чужого кота (`MODIFIERS.strayCat`). */
export const strayMood = (): number => MODIFIERS.strayCat.mood;

/** Кіт «кекає» на птахів (§9.12): «+», а коли на карнизі голуби, — і кіт без риси. */
export function chatters(state: GameState, cat: Cat): boolean {
  const level = traitLevel(cat, "window");
  return level > 0 || (level === 0 && pigeonsAtWindow(state));
}

/**
 * Тяга до вхідних дверей (§4.1, «Валер'янка в під'їзді»): 1 + `MODIFIERS.valerian.catnipStep` × сила реакції на м'яту.
 * Шкала м'яти немонотонна (§9.12): «Шаленіє від м'яти» реагує сильно, як «Фанат», а «Байдужий» — слабше. 0 — не тягне: інший
 * день чи «Боїться дверей».
 */
export function valerianPull(state: GameState, cat: Cat): number {
  if (state.modifiers.day !== "valerian" || traitLevel(cat, "escape") <= -2) return 0;
  const level = traitLevel(cat, "catnip");
  return 1 + MODIFIERS.valerian.catnipStep * (level === -2 ? 2 : level);
}

/** Добавка до шансу вибігти у відчинені двері (§4.1, «Валер'янка в під'їзді»). */
export const valerianEscape = (state: GameState, cat: Cat): number => MODIFIERS.valerian.escape * valerianPull(state, cat);

/** Шанс за годину вдень сісти під двері й нявчати (§4.1, «Валер'янка в під'їзді»): будь-якому коту, не лише «Втікачу». */
export const valerianCallPerHour = (state: GameState, cat: Cat): number => MODIFIERS.valerian.callPerHour * valerianPull(state, cat);

/** «Пес на сходах» (§4.1): коти тримаються від дверей подалі — не тікають і не кричать під ними. */
export const dogOnStairs = (state: GameState): boolean => state.modifiers.day === "stair-dog";
