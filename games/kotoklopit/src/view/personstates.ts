// Стани персонажа (§8.4): що зараз показує панель — іконками — і профіль телефона — іконкою, назвою й описом. Чиста функція без
// Phaser і DOM: одна для обох, щоб панель і профіль не розходилися.

import { stinks, wearsDirtyClothes } from "../sim/character";
import { LOW_STAT, SLEEP_SPEED_MAX_BONUS } from "../sim/config";
import { furVisible, messesInSight } from "../sim/household";
import { isIll } from "../sim/illness";
import { hygieneFactorMod, moveFactor, powerOut, unpleasantFactor, workSanityFactor } from "../sim/modifiers";
import { isDrowsy } from "../sim/sleep";
import { absoluteMinute } from "../sim/time";
import type { GameState, IllnessId, StatName } from "../sim/types";
import { meowsAtWork, onSickLeave } from "../sim/work";

export type PersonStateId =
  | "weak"
  | "hungry"
  | "stench"
  | "dizzy"
  | IllnessId
  | "depressed"
  | "dirtyClothes"
  | "drowsy"
  | "sleepDebt"
  | "mess"
  | "fur"
  | "meowing"
  | "noPower"
  | "heat"
  | "renovation"
  | "quarterlyReport"
  | "jobSearch"
  | "sickLeave"
  | "wellRested"
  | "rested"
  | "vigor"
  | "chill"
  | "neighborsAway"
  | "interestingProject";

type Acts = (state: GameState) => boolean;

const low =
  (stat: StatName): Acts =>
  (state) =>
    state.character.stats[stat] < LOW_STAT;
const ill =
  (id: IllnessId): Acts =>
  (state) =>
    isIll(state, id);
const employed: Acts = (state) => !state.job.unemployed;

/**
 * Усі стани в порядку панелі (§8.4) — спершу те, що шкодить найбільше, — і коли кожен діє. Умова — та сама функція симуляції,
 * що й сам ефект: стан не розходиться з тим, що відбувається. Новий ефект на персонажа — новий рядок тут
 * (`tests/personstates.test.ts`: «невидимих ефектів немає»).
 */
const STATES: readonly (readonly [PersonStateId, Acts])[] = [
  ["weak", low("health")],
  ["hungry", low("satiety")],
  ["stench", stinks],
  ["dizzy", low("sanity")],
  ["cold", ill("cold")],
  ["injury", ill("injury")],
  ["exhaustion", ill("exhaustion")],
  ["depressed", (state) => state.character.depressed],
  ["dirtyClothes", wearsDirtyClothes],
  ["drowsy", isDrowsy],
  ["sleepDebt", (state) => state.character.sleepSpeed < 0],
  ["mess", (state) => messesInSight(state) > 0],
  ["fur", furVisible],
  ["meowing", meowsAtWork],
  ["noPower", powerOut],
  ["heat", (state) => hygieneFactorMod(state) > 1],
  ["renovation", (state) => unpleasantFactor(state) > 1],
  ["quarterlyReport", (state) => employed(state) && workSanityFactor(state) > 1],
  ["jobSearch", (state) => state.job.unemployed],
  ["sickLeave", onSickLeave],
  ["wellRested", (state) => state.character.sleepSpeed > 0 && state.character.sleepSpeed >= SLEEP_SPEED_MAX_BONUS],
  ["rested", (state) => state.character.sleepSpeed > 0 && state.character.sleepSpeed < SLEEP_SPEED_MAX_BONUS],
  ["vigor", (state) => moveFactor(state) > 1],
  ["chill", (state) => hygieneFactorMod(state) < 1],
  ["neighborsAway", (state) => unpleasantFactor(state) < 1],
  ["interestingProject", (state) => employed(state) && workSanityFactor(state) < 1],
];

/** Стани, що діють зараз, у порядку панелі. */
export function personStates(state: GameState): PersonStateId[] {
  return STATES.filter(([, acts]) => acts(state)).map(([id]) => id);
}

/** Скільки кружечків станів уміщує панель (§8.4). */
export const PANEL_STATE_SLOTS = 8;

/** Що показує панель: усі стани, а коли їх більше, ніж місць, — перші, і в останньому кружечку — скільки ще. */
export function panelStates(ids: readonly PersonStateId[], slots = PANEL_STATE_SLOTS): { shown: PersonStateId[]; more: number } {
  if (ids.length <= slots) return { shown: [...ids], more: 0 };
  return { shown: ids.slice(0, slots - 1), more: ids.length - (slots - 1) };
}

export type PanelStates = ReturnType<typeof panelStates>;

/**
 * Стани для панелі, яка питає їх щокадру. Серед умов — обхід безладу, пилу й жмутів, тож перелік рахується раз на ігрову
 * хвилину (і одразу для іншої гри), а між ними й поки нічого не змінилося повертається той самий об'єкт: панель порівнює
 * його з попереднім і не перемальовує.
 */
export function panelStatesReader(): (state: GameState) => PanelStates {
  let game: GameState | null = null;
  let minute = -1;
  let key = "";
  let last: PanelStates = { shown: [], more: 0 };
  return (state) => {
    const now = Math.floor(absoluteMinute(state.day, state.minute));
    if (state === game && now === minute) return last;
    game = state;
    minute = now;
    const next = panelStates(personStates(state));
    const nextKey = `${next.shown.join(",")}+${next.more}`;
    if (nextKey !== key) {
      key = nextKey;
      last = next;
    }
    return last;
  };
}
