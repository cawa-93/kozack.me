// Риси кота в картках (§9.9): лише назви рис, без назв груп. Навести вказівник чи натиснути на
// рису — під рядком з'являється її короткий опис (`TRAIT_ABOUT`).

import { traitGroup, traitName } from "../sim/traits";
import type { Cat, GameState, Sex, Trait } from "../sim/types";
import { fill, TRAIT_ABOUT, TRAIT_ABOUT_LEVEL } from "../texts";
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
 * Підказка про рису (§9.9, рівень 2): «Здається, Мурка сама застрибує на коліна.»; без прояву — null. Без
 * імені (`name` null) — для бабла телефона, де ім'я вже в заголовку.
 */
export function traitHint(cat: Pick<Cat, "name" | "sex">, trait: Pick<Trait, "group" | "level">, name: string | null = cat.name): string | null {
  const group = traitGroup(trait.group);
  const sign = group.levelSigns?.[trait.level] ?? group.signs?.[trait.level > 0 ? 0 : 1];
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
  // Опис — баблом над рисою: під чипами його не помічали. Мишею — поки над рисою; натиснута риса (і дотик) бабл закріплює — до
  // натискання ще раз чи поза рисами.
  const about = element("p", "trait-about");
  about.hidden = true;
  let active: HTMLElement | null = null;
  let pinned = false;
  const outside = (event: Event): void => {
    if (!box.contains(event.target as Node)) hide();
  };
  const hide = (): void => {
    active?.classList.remove("active");
    active = null;
    pinned = false;
    about.hidden = true;
    document.removeEventListener("pointerdown", outside, true);
  };
  const show = (chip: HTMLElement, text: string): void => {
    active?.classList.remove("active");
    active = chip;
    chip.classList.add("active");
    about.textContent = text;
    about.hidden = false;
    placeBubble(box, chip, about);
    document.addEventListener("pointerdown", outside, true);
  };
  for (const trait of traits) {
    const chip = element("button", "trait", fill(traitName(trait), sex));
    chip.type = "button";
    const text = traitAbout(trait, sex);
    chip.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "mouse" && !pinned) show(chip, text);
    });
    chip.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "mouse" && active === chip && !pinned) hide();
    });
    // Натискання не йде далі: на титулці воно інакше закрило б її.
    chip.addEventListener("click", (event) => {
      event.stopPropagation();
      if (active === chip && pinned) hide();
      else {
        show(chip, text);
        pinned = true;
      }
    });
    row.append(chip);
  }
  box.append(row, about);
  return box;
}

/** Бабл над рисою: хвостиком до її середини, але не за краями рядка рис — тоді зсувається сам бабл, а хвостик лишається над рисою. */
function placeBubble(box: HTMLElement, chip: HTMLElement, bubble: HTMLElement): void {
  const center = chip.offsetLeft + chip.offsetWidth / 2;
  const width = bubble.offsetWidth;
  const left = Math.max(0, Math.min(box.clientWidth - width, center - width / 2));
  bubble.style.left = `${left}px`;
  bubble.style.top = `${chip.offsetTop}px`;
  bubble.style.setProperty("--tail", `${center - left}px`);
}
