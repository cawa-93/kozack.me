// Підпис ряду знімків рис у вкладці «Фото титрів»: опис боку групи для редактора — той самий, що гравець бачить у картці кота
// (§9.9). Без DOM.

import type { TraitGroup } from "../../sim/traits";
import type { Sex } from "../../sim/types";
import { traitAbout } from "../../texts";

/** Перша форма з розмітки за статтю: `[він|вона]` → «він». */
export const firstForm = (name: string): string => name.replace(/\[([^|\]]*)\|[^\]]*\]/g, "$1");

/**
 * Опис боку групи рис: один рядок, коли обидва рівні боку описано однаково; інакше — рядок на рівень із його назвою, спершу
 * слабший.
 */
export function traitRowNote(group: TraitGroup, side: "plus" | "minus", sex: Sex): string[] {
  // `names` — рівні +2, +1, −1, −2.
  const levels = side === "plus" ? ([[1, group.names[1]], [2, group.names[0]]] as const) : ([[-1, group.names[2]], [-2, group.names[3]]] as const);
  const texts = levels.map(([level]) => traitAbout({ group: group.id, level }, sex));
  if (texts[0] === texts[1]) return texts[0] ? [texts[0]] : [];
  return levels.map(([, name], i) => `${firstForm(name)}: ${texts[i] ?? ""}`);
}
