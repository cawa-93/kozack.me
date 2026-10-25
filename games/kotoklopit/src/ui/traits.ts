// Риси кота в картках (§9.9): лише назви рис, без назв груп. Навести вказівник чи натиснути на
// рису — під рядком з'являється її короткий опис (`TRAIT_ABOUT`).

import { traitGroup, traitName } from "../sim/traits";
import type { Cat, GameState, Sex, Trait } from "../sim/types";
import { fill, TRAIT_ABOUT } from "../texts";
import { element } from "./overlay";

/** Опис риси: для «+» чи для «−», у формі за статтю кота. */
export function traitAbout(trait: Pick<Trait, "group" | "level">, sex: Sex): string {
  const about = TRAIT_ABOUT[trait.group];
  return about ? fill(about[trait.level > 0 ? 0 : 1], sex) : "";
}

/**
 * Підказка про рису (§9.9, рівень 2): «Здається, Мурка сама застрибує на коліна.»; без прояву — null. Без
 * імені (`name` null) — для бабла телефона, де ім'я вже в заголовку.
 */
export function traitHint(cat: Pick<Cat, "name" | "sex">, trait: Pick<Trait, "group" | "level">, name: string | null = cat.name): string | null {
  const sign = traitGroup(trait.group).signs?.[trait.level > 0 ? 0 : 1];
  if (!sign) return null;
  return `Здається, ${name === null ? "" : `${name} `}${fill(sign, cat.sex)}.`;
}

/** Що стало відомо про кота — для бабла телефона (§9.9, правка автора 2026-10-25). */
export interface TraitNews {
  /** Ім'я кота, а для відкритої риси — і її назва. */
  title: string;
  text: string;
}

/**
 * Новина про рису, щойно вона дійшла до рівня видимості `stage`: підказка (2) — «Здається, …», відкрита
 * риса (3) — назва й опис. «❓» (1) — ще нічого не відомо, новини немає.
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

export function traitChips(traits: readonly Pick<Trait, "group" | "level">[], sex: Sex): HTMLElement {
  const box = element("div", "traits");
  const row = element("div", "trait-row");
  const about = element("p", "trait-about");
  let active: HTMLElement | null = null;
  const show = (chip: HTMLElement, text: string): void => {
    active?.classList.remove("active");
    active = chip;
    chip.classList.add("active");
    about.textContent = text;
  };
  for (const trait of traits) {
    const chip = element("button", "trait", fill(traitName(trait), sex));
    chip.type = "button";
    const text = traitAbout(trait, sex);
    chip.addEventListener("mouseenter", () => show(chip, text));
    // Натискання не йде далі: на титулці воно інакше закрило б її.
    chip.addEventListener("click", (event) => {
      event.stopPropagation();
      show(chip, text);
    });
    row.append(chip);
  }
  box.append(row, about);
  return box;
}
