// Котячі ресурси квартири (§9.4 «Ресурси»): речі одного виду, брудний лоток і чи вистачає мисок і лотків. Окремо від
// поведінки котів (`catai.ts`), щоб ту саму межу «вистачає» брали й сварки, й зараження через лоток (`diseases.ts`) без
// циклічного імпорту diseases ↔ catai (загальна ревізія 2026-10-29).

import { LITTER_CAPACITY } from "./config";
import { SLOTS } from "./home";
import { isNewborn } from "./reproduction";
import type { GameState, HomeItem, LitterItem } from "./types";

export const itemsOf = <K extends HomeItem["kind"]>(state: GameState, kind: K): Extract<HomeItem, { kind: K }>[] =>
  state.home.items.filter((i): i is Extract<HomeItem, { kind: K }> => i.kind === kind);

export function litterCapacity(box: LitterItem): number {
  return LITTER_CAPACITY[box.litter ?? "none"];
}

export function isDirty(box: LitterItem): boolean {
  return box.uses >= litterCapacity(box);
}

/**
 * Чи вистачає мисок чи лотків (§9.4 «Ресурси»; «Згода, охорона й сварки», рішення автора 2026-10-26, Р3 і Р4): котів рахують лише
 * тих, що вдома, без новонароджених; брудний лоток не рахується; лотків — на один більше, ніж котів, мисок — скільки котів, але
 * не більше, ніж є місць (для мисок — поширення виконавця, ухвалено — рішення автора 2026-10-26 після блоку 4). Раніше рахували всіх котів і всі лотки, і з 6 котами лотків не вистачало ніколи.
 * Та сама межа — для глистів через лоток (§9.5, загальна ревізія 2026-10-29).
 */
export function enoughFor(state: GameState, kind: "bowl" | "litter"): boolean {
  const cats = state.cats.filter((c) => c.away === null && !isNewborn(c)).length;
  const places = SLOTS.filter((s) => s.kind === kind).length;
  if (kind === "bowl") return itemsOf(state, "bowl").length >= Math.min(cats, places);
  return itemsOf(state, "litter").filter((box) => !isDirty(box)).length >= Math.min(cats + 1, places);
}
