// Картка кота (§9.7): живий портрет, поле імені й те, що про кота відомо. Та сама і в знайомстві, і у вкладці «Коти» телефона.

import { renameCat } from "../sim/cat";
import { NAME_MAX_LENGTH } from "../sim/config";
import type { Cat, Trait } from "../sim/types";
import { CAT_INTRO_TEXTS } from "../texts";
import { liveCatPortrait } from "./liveportrait";
import { element } from "./overlay";
import { portraitCanvas } from "./portrait";
import { traitChips } from "./traits";

/** Сторона портрета, px CSS. */
const PORTRAIT_SIZE = 200;

/** Що показати про кота: стать і вік, решта відомого й риси, відомі цілком. */
export interface CatFacts {
  head: string;
  lines: readonly string[];
  known: readonly Trait[];
}

/** Поле імені: нове ім'я діє одразу, з кожною літерою; порожнє поле, коли з нього вийшли, повертає ім'я кота. */
function nameField(cat: Cat): HTMLInputElement {
  const input = element("input");
  input.type = "text";
  input.value = cat.name;
  input.maxLength = NAME_MAX_LENGTH;
  input.className = "button name-input";
  input.setAttribute("aria-label", CAT_INTRO_TEXTS.name);
  input.addEventListener("input", () => renameCat(cat, input.value));
  input.addEventListener("blur", () => {
    input.value = cat.name;
  });
  return input;
}

/** `extra` — що стоїть під фактами: у телефоні це оголошення. */
export function catProfile(cat: Cat, facts: CatFacts, extra?: HTMLElement): HTMLElement {
  const canvas = portraitCanvas(PORTRAIT_SIZE, PORTRAIT_SIZE);
  liveCatPortrait(canvas, cat);

  const about = element("div", "cat-profile-facts");
  about.append(element("p", "cat-profile-line cat-profile-head", facts.head));
  for (const line of facts.lines) about.append(element("p", "cat-profile-line", line));
  if (facts.known.length > 0) about.append(traitChips(facts.known, cat.sex));

  const side = element("div", "cat-profile-side");
  side.append(element("span", "look-label", CAT_INTRO_TEXTS.name), nameField(cat), about);
  if (extra) side.append(extra);

  const profile = element("div", "cat-profile");
  profile.append(canvas, side);
  return profile;
}
