// Котячі сліди в квартирі (§9.12 «Гра й бешкет» — «Котячі сліди в квартирі», рішення автора 2026-11-02; §8.3). Гра
// починається в цілій квартирі: слід з'являється, щойно кіт уперше зробив своє (подер диван, полапав шафку з кормом), чи
// з «котоднями», і лишається до кінця гри. Сліди на коробках біля входу зникають разом із коробками. Сліди — лише вигляд: на
// гроші, показники й поведінку котів не впливають, тож випадковості тут немає.

import { TRACE_CAT_DAYS } from "./config";
import { emit, type ScratchSpot } from "./events";
import { hasBoxes } from "./home";
import type { CatTrace, GameState } from "./types";

/** Кожен слід (§9.12): запис на кожне значення `CatTrace` — тип не дасть забути новий. */
const ALL: Record<CatTrace, true> = {
  sofa: true,
  doorframe: true,
  rug: true,
  cabinet: true,
  door: true,
  wardrobe: true,
  "boxes-claws": true,
  "boxes-chewed": true,
  "bath-mat": true,
  "bedroom-rug": true,
  wallpaper: true,
  lino: true,
};

/** Усі сліди (§9.12). */
export const CAT_TRACES = Object.keys(ALL) as readonly CatTrace[];

/** Сліди на коробках біля входу (§9.12): коробки тимчасові — коли все розпаковано, їхні сліди зникають. */
export const BOX_TRACES: readonly CatTrace[] = ["boxes-claws", "boxes-chewed"];

/** Слід від того, де кіт точив кігті (§9.12, «Дряпання»): диван, одвірок, килим вітальні, коробки; кігтеточка — нічого. */
export const SCRATCH_TRACES: Readonly<Partial<Record<ScratchSpot, CatTrace>>> = { sofa: "sofa", doorframe: "doorframe", rug: "rug", boxes: "boxes-claws" };

/** Сліди, що вже з'явилися, у порядку появи. На старті, у старих збереженнях і сценаріях без поля — жодного. */
export function traces(state: Pick<GameState, "home">): readonly CatTrace[] {
  return state.home.traces ?? [];
}

/** «Котодні» (§9.12): скільки котів прожило вдома, ніч за ніччю. Без поля — 0. */
export function catDays(state: Pick<GameState, "home">): number {
  return state.home.catDays ?? 0;
}

export function hasTrace(state: Pick<GameState, "home">, trace: CatTrace): boolean {
  return traces(state).includes(trace);
}

/**
 * Лишити слід (§9.12): уперше — у кінець переліку й подія для журналу режиму розробки (бабла немає: показуй, а не розказуй,
 * §11.4); удруге — нічого. Слід на коробках — лише поки коробки є (кіт міг дерти купу, яку тим часом розпакували): інакше
 * нова доставка прийшла б уже подертою. Повертає, чи слід з'явився.
 */
export function addTrace(state: GameState, trace: CatTrace): boolean {
  if (hasTrace(state, trace) || (BOX_TRACES.includes(trace) && !hasBoxes(state))) return false;
  (state.home.traces ??= []).push(trace);
  emit(state, { type: "trace", trace });
  return true;
}

/**
 * Ящики біля входу могли спорожніти — розпакували чи кіт догриз останній пакет (§9.12): коробок не лишилося — зникають і сліди
 * на них, без події (коробки зникають разом зі слідами). Нова доставка приходить у цілих.
 */
export function tidyBoxTraces(state: GameState): void {
  if (hasBoxes(state) || !state.home.traces?.some((t) => BOX_TRACES.includes(t))) return;
  state.home.traces = state.home.traces.filter((t) => !BOX_TRACES.includes(t));
}

/** Сліди від котоднів (§9.12): кожен поріг, якого вже досягли, — по черзі. */
function catDayTraces(state: GameState): void {
  for (const step of TRACE_CAT_DAYS) if (catDays(state) >= step.catDays) addTrace(state, step.trace);
}

/**
 * Ще одна ніч (§9.12): до котоднів додається, скільки котів живе вдома (`state.cats`), — кошенята теж, і ті, хто цього дня
 * втікав на сходи чи їздив із персонажем (до ветеринара, щойно взятий у притулку): живуть вони тут, а вночі всі вдома. Коти в
 * притулку й розпліднику, яких не взяли, — не вдома.
 */
export function nightlyTraces(state: GameState): void {
  if (state.cats.length > 0) state.home.catDays = catDays(state) + state.cats.length;
  catDayTraces(state);
}

/**
 * Сліди зі збереження чи сценарію (§9.12): невідомі й повторені відкидаються, сліди коробок без коробок — теж; котодні — невід'ємне
 * число, а сліди їхніх досягнутих порогів є (сценарій може задати лише котодні). Без події: це не нова поява сліду.
 */
export function upgradeTraces(state: GameState): void {
  const home = state.home;
  const days: unknown = home.catDays;
  if (days !== undefined && (typeof days !== "number" || !Number.isFinite(days) || days < 0)) Reflect.deleteProperty(home, "catDays");
  const saved: unknown = home.traces;
  if (saved !== undefined) {
    const list: unknown[] = Array.isArray(saved) ? saved : [];
    const valid = list.filter((t, i): t is CatTrace => CAT_TRACES.includes(t as CatTrace) && list.indexOf(t) === i);
    home.traces = hasBoxes(state) ? valid : valid.filter((t) => !BOX_TRACES.includes(t));
  }
  fillCatDayTraces(state);
}

/** Досягнуті пороги котоднів без їхніх слідів — дописати мовчки (`upgradeTraces`). */
function fillCatDayTraces(state: GameState): void {
  for (const step of TRACE_CAT_DAYS) {
    if (catDays(state) < step.catDays || hasTrace(state, step.trace)) continue;
    (state.home.traces ??= []).push(step.trace);
  }
}
