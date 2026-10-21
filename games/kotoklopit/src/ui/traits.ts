// Риси кота в картках (§9.9): лише назви рис, без назв груп. Навести вказівник чи натиснути на
// рису — під рядком з'являється її короткий опис (`TRAIT_ABOUT`).

import { traitName } from "../sim/traits";
import type { Sex, Trait } from "../sim/types";
import { fill, TRAIT_ABOUT } from "../texts";
import { element } from "./overlay";

/** Опис риси: для «+» чи для «−», у формі за статтю кота. */
export function traitAbout(trait: Pick<Trait, "group" | "level">, sex: Sex): string {
  const about = TRAIT_ABOUT[trait.group];
  return about ? fill(about[trait.level > 0 ? 0 : 1], sex) : "";
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
    chip.addEventListener("click", () => show(chip, text));
    row.append(chip);
  }
  box.append(row, about);
  return box;
}
