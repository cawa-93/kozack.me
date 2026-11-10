// Риси кота в картках (§9.9): чипи з назвами рис, без назв груп; ще не відкрита риса — чип «…?». Навести вказівник чи натиснути
// на чип — над ним бабл: опис (`TRAIT_ABOUT`), а в нерозкритої — розділ чи підказка без боку й сили (`TRAIT_AREAS`, `TRAIT_HINTS`).

import { visibility } from "../sim/knowledge";
import { traitGroup, traitName } from "../sim/traits";
import type { Cat, GameState, Sex, Trait } from "../sim/types";
import { fill, TRAIT_ABOUT, TRAIT_ABOUT_LEVEL, TRAIT_AREAS, TRAIT_HINTS } from "../texts";
import { hintBubble } from "./hintbubble";
import { element } from "./overlay";

/** Опис риси: для «+» чи для «−», у формі за статтю кота. */
export function traitAbout(trait: Pick<Trait, "group" | "level">, sex: Sex): string {
  // Немонотонна шкала (§9.9, «Котяча м'ята»): свій опис для окремого рівня.
  const level = TRAIT_ABOUT_LEVEL[trait.group]?.[trait.level];
  if (level !== undefined) return fill(level, sex);
  const about = TRAIT_ABOUT[trait.group];
  return about ? fill(about[trait.level > 0 ? 0 : 1], sex) : "";
}

/**
 * Підказка про рису (§9.9, рівень 2): «Здається, Мурка гостріше реагує на температуру.» — де шукати, без боку й сили; бік, якого
 * не видно в поведінці, — null. Без імені (`name` null) — для бабла телефона й чипа, де ім'я вже в заголовку.
 */
export function traitHint(cat: Pick<Cat, "name" | "sex">, trait: Pick<Trait, "group" | "level">, name: string | null = cat.name): string | null {
  const hint = TRAIT_HINTS[trait.group];
  if (!traitGroup(trait.group).shows?.[trait.level > 0 ? 0 : 1] || !hint) return null;
  return `Здається, ${name === null ? "" : `${name} `}${fill(hint, cat.sex)}.`;
}

/** Бабл першого рівня (§9.9): помічено щось дивне — і лише в якому розділі рис. */
export function traitArea(trait: Pick<Trait, "group">, sex: Sex): string {
  return fill(TRAIT_AREAS[traitGroup(trait.group).area], sex);
}

/** Чип риси: що на ньому й що в баблі над ним; `hidden` — риса ще не відкрита, на чипі «…?». */
export interface TraitChip {
  label: string;
  about: string;
  hidden?: true;
}

/** Напис на чипі нерозкритої риси. */
export const HIDDEN_TRAIT = "…?";

/** Що стало відомо про кота — для бабла телефона (§9.9, правка автора 2026-10-25). */
export interface TraitNews {
  /** Ім'я кота, а для відкритої риси — і її назва. */
  title: string;
  text: string;
}

/**
 * Новина про рису, щойно вона дійшла до рівня видимості `stage`: підказка (2) — «Здається, …», відкрита
 * риса (3) — назва й опис. Лише помічена (1) — новини немає.
 */
export function traitNews(state: GameState, catId: number, group: string, stage: number): TraitNews | null {
  const cat = state.cats.find((c) => c.id === catId);
  const trait = cat?.traits.find((t) => t.group === group);
  if (!cat || !trait) return null;
  if (stage >= 3) return { title: `${cat.name} — ${fill(traitName(trait), cat.sex)}`, text: traitAbout(trait, cat.sex) };
  if (stage !== 2) return null;
  const hint = traitHint(cat, trait, null);
  return hint === null ? null : { title: cat.name, text: hint };
}

/** Чипи відомих рис: назва й опис (альбом, прощання, притулок, розплідник). */
export function traitChips(traits: readonly Pick<Trait, "group" | "level">[], sex: Sex): HTMLElement {
  return chipRow(traits.map((trait) => ({ label: fill(traitName(trait), sex), about: traitAbout(trait, sex) })));
}

/**
 * Риси, як їх знає гравець (§9.9): відомі — назвою й описом, помічені — «…?» з підказкою чи лише розділом, решти не видно.
 * Однаково в картці кота, на прощанні й в альбомі: прощання рис не відкриває.
 */
export function knownTraitChips(state: GameState, cat: Pick<Cat, "name" | "sex" | "traits">): TraitChip[] {
  const chips: TraitChip[] = [];
  const hidden: TraitChip[] = [];
  for (const trait of cat.traits) {
    const seen = visibility(state, trait);
    if (seen === 3) chips.push({ label: fill(traitName(trait), cat.sex), about: traitAbout(trait, cat.sex) });
    else if (seen > 0) hidden.push({ label: HIDDEN_TRAIT, about: (seen === 2 ? traitHint(cat, trait, null) : null) ?? traitArea(trait, cat.sex), hidden: true });
  }
  return [...chips, ...hidden];
}

/** Рядок чипів із баблом над обраним (`hintBubble`): опис — баблом над рисою, під чипами його не помічали. */
export function chipRow(chips: readonly TraitChip[]): HTMLElement {
  const box = element("div", "traits");
  const row = element("div", "trait-row");
  const hints = hintBubble(box, "trait-about");
  for (const { label, about, hidden } of chips) {
    const chip = element("button", hidden ? "trait hidden" : "trait", label);
    chip.type = "button";
    hints.attach(chip, about);
    row.append(chip);
  }
  box.append(row, hints.bubble);
  return box;
}
