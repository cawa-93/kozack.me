// Картка знайомства з новим котом (§9.7): великий портрет, лише те, що про кота вже відомо, і поле імені. У полі — згенероване ім'я,
// його й лишає порожнє поле чи Esc.

import { isKitten } from "../sim/cat";
import { NAME_MAX_LENGTH } from "../sim/config";
import type { Cat, GameState } from "../sim/types";
import { CAT_INTRO_TEXTS } from "../texts";
import { catFacts, weeks } from "./cards";
import { element, type Card } from "./overlay";
import { drawCatPortrait, portraitCanvas } from "./portrait";
import { traitChips } from "./traits";

/** Сторона портрета, px CSS. */
const PORTRAIT_SIZE = 220;

export function catIntroCard(state: GameState, cat: Cat, onDone: (name: string) => void): Card {
  const canvas = portraitCanvas(PORTRAIT_SIZE, PORTRAIT_SIZE);
  drawCatPortrait(canvas, cat);

  const input = element("input");
  input.type = "text";
  input.value = cat.name;
  input.maxLength = NAME_MAX_LENGTH;
  input.className = "button name-input";
  input.setAttribute("aria-label", CAT_INTRO_TEXTS.name);

  const facts = element("div", "cat-intro-facts");
  const { lines, known } = catFacts(state, cat);
  facts.append(element("p", "cat-intro-line cat-intro-head", `${cat.sex === "male" ? "♂" : "♀"} · ${weeks(cat.ageWeeks)}`));
  for (const line of lines) facts.append(element("p", "cat-intro-line", line));
  if (known.length > 0) facts.append(traitChips(known, cat.sex));

  const side = element("div", "cat-intro-side");
  side.append(element("span", "look-label", CAT_INTRO_TEXTS.name), input, facts);
  const intro = element("div", "cat-intro");
  intro.append(canvas, side);

  const done = (): void => onDone(input.value);
  return {
    kicker: isKitten(cat) ? CAT_INTRO_TEXTS.kitten : CAT_INTRO_TEXTS[cat.sex],
    title: CAT_INTRO_TEXTS.title,
    body: [intro],
    actions: [{ label: CAT_INTRO_TEXTS.done, primary: true, onSelect: done }],
    onDismiss: done,
  };
}
