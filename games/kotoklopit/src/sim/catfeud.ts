// «Котячі розбірки ↔ Мир у зграї» (§4.1, DAY_MODIFIERS.md): множники для стосунків котів (§9.4) на цей день.
// Самі правила стосунків — у `catai.ts` і `relations.ts`; тут лише те, як їх змінює день.

import { MODIFIERS, RELATIONS } from "./config";
import { isFriend } from "./relations";
import { isNewborn } from "./reproduction";
import type { Cat, GameState } from "./types";

const feudDay = (state: GameState): boolean => state.modifiers.day === "cat-feud";
const peaceDay = (state: GameState): boolean => state.modifiers.day === "cat-peace";

/** Кішка з новонародженими (§9.8): вона й малі поза розбірками — гніздо не має ставати полем бою. */
function nursesNewborns(state: GameState, cat: Cat): boolean {
  for (const kitten of state.cats) if (kitten.parents.mother === cat.id && isNewborn(kitten)) return true;
  return false;
}

const inFeud = (state: GameState, cat: Cat): boolean => !isNewborn(cat) && !nursesNewborns(state, cat);

/** Розбірки діють між цими котами: сьогодні «Котячі розбірки», вони не друзі, і жоден не з гнізда. */
export function feuding(state: GameState, a: Cat, b: Cat): boolean {
  return feudDay(state) && !isFriend(state, a, b) && inFeud(state, a) && inFeud(state, b);
}

/** Множник спільної паузи шипіння (§9.12) кота `cat` на `at`: розбірки — коротша між не-друзями, мир — довша для всіх. */
export function hissPauseFactor(state: GameState, cat: Cat, at: Cat): number {
  if (peaceDay(state)) return MODIFIERS.catPeace.hissPause;
  return feuding(state, cat, at) ? MODIFIERS.catFeud.hissPause : 1;
}

/** Множник шансу бійки (§9.4): у розбірки — між не-друзями. */
export const feudFightFactor = (state: GameState, a: Cat, b: Cat): number => (feuding(state, a, b) ? MODIFIERS.catFeud.fight : 1);

/** Рівень «Охоронця», з яким `guard` охороняє миску, лоток чи підвіконня від `cat` (§9.4 «Вороги охороняють ресурси»): розбірки дають щонайменше `level`. */
export const feudGuardLevel = (state: GameState, guard: Cat, cat: Cat, level: number): number =>
  feuding(state, guard, cat) ? Math.max(level, MODIFIERS.catFeud.level) : level;

/** Рівень «Товариськості», з яким `cat` зустрічає перехожого `other` (§9.12): у розбірки — щонайбільше «Конфліктний». */
export const feudPassLevel = (state: GameState, cat: Cat, other: Cat, level: number): number =>
  feuding(state, cat, other) ? Math.min(level, -MODIFIERS.catFeud.level) : level;

/** Множник вилизування друзів і сну купкою (§9.4): «Мир у зграї». */
export const peaceGroomFactor = (state: GameState): number => (peaceDay(state) ? MODIFIERS.catPeace.groom : 1);

/** Шанс згоди на гру з другом (§9.4 «Друг може відмовитися»): «Мир у зграї» множить його, але відмова лишається можливою (`max`). */
export const peaceAccept = (state: GameState, chance: number): number =>
  peaceDay(state) ? Math.min(RELATIONS.wrestle.accept.max, chance * MODIFIERS.catPeace.accept) : chance;

/** Множник нічного зближення (`RELATIONS.nightly`, §9.4): «Мир у зграї» — цієї ночі (модифікатор дня діє до пробудження, §4.1). */
export const peaceNightlyFactor = (state: GameState): number => (peaceDay(state) ? MODIFIERS.catPeace.nightly : 1);

/**
 * Падіння стосунків пари `pair` (ключ `relations`) у день розбірок: сумарно за день не більше `MODIFIERS.catFeud.maxDrop`, щоб
 * з одного дня сварок друзі не ставали ворогами назавжди. Лічильник — за номером дня: скидати його не треба.
 */
export function feudDrop(state: GameState, pair: string, delta: number): number {
  if (delta >= 0 || !feudDay(state)) return delta;
  let log = state.feudDrop;
  if (log?.day !== state.day) log = state.feudDrop = { day: state.day, drop: {} };
  const dropped = log.drop[pair] ?? 0;
  const allowed = Math.max(delta, dropped - MODIFIERS.catFeud.maxDrop);
  log.drop[pair] = dropped - allowed;
  return Math.min(0, allowed);
}
