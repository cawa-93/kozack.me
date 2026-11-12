// Картка кота (§9.7): живий портрет, ім'я зі знаком статі й те, що про кота відомо. Та сама і в знайомстві, і у вкладці «Коти»
// телефона: у знайомстві ім'я — поле (кота щойно назвали), у телефоні — заголовок, а поле — лише після малопомітного олівця.

import { NAME_MAX_LENGTH } from "../sim/config";
import type { Cat } from "../sim/types";
import { CAT_INTRO_TEXTS } from "../texts";
import { catNameEditor } from "./catname";
import { liveCatPortrait } from "./liveportrait";
import { element } from "./overlay";
import { portraitCanvas } from "./portrait";
import { chipRow, type TraitChip } from "./traits";

/** Сторона портрета, px CSS. */
const PORTRAIT_SIZE = 200;

/** Що показати про кота: вік, порода й стерилізація одним рядком, решта відомого й чипи помічених рис (§9.9). */
export interface CatFacts {
  head: string;
  lines: readonly string[];
  chips: readonly TraitChip[];
}

/** Поле імені (`catname.ts`): нове ім'я діє одразу, з кожною літерою; порожнє поле, коли з нього вийшли, повертає ім'я кота. */
function nameField(cat: Cat): HTMLInputElement {
  const input = element("input");
  input.type = "text";
  input.value = cat.name;
  input.maxLength = NAME_MAX_LENGTH;
  input.className = "button name-input";
  input.setAttribute("aria-label", CAT_INTRO_TEXTS.name);
  const editor = catNameEditor(cat);
  input.addEventListener("focus", () => editor.focus());
  input.addEventListener("input", () => editor.input(input.value));
  input.addEventListener("blur", () => {
    input.value = editor.blur();
  });
  return input;
}

/** Знак статі за ім'ям: великий і кольоровий — це важливо (гліф ♂ / ♀ малює `Overlay`, розмір — `.cat-sex` у CSS). */
function sexMark(cat: Cat): HTMLElement {
  const mark = element("span", `cat-sex ${cat.sex}`, cat.sex === "male" ? "♂" : "♀");
  mark.setAttribute("aria-hidden", "true");
  return mark;
}

/**
 * Ім'я заголовком (телефон): за ним знак статі й малопомітний олівець — він міняє заголовок на поле; вийшли з поля чи Enter —
 * знову заголовок з новим ім'ям. Перейменовують рідко, тож олівець ледь видно.
 */
function nameTitle(cat: Cat): HTMLElement {
  const title = element("p", "cat-profile-name", cat.name);
  const rename = element("button", "cat-rename", "✏");
  rename.title = CAT_INTRO_TEXTS.rename;
  rename.setAttribute("aria-label", CAT_INTRO_TEXTS.rename);
  const row = element("div", "cat-profile-title");
  row.append(title, sexMark(cat), rename);
  rename.addEventListener("click", () => {
    const input = nameField(cat);
    input.classList.add("cat-rename-input");
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") input.blur();
    });
    input.addEventListener("blur", () => {
      title.textContent = cat.name;
      input.replaceWith(title);
      rename.hidden = false;
    });
    title.replaceWith(input);
    rename.hidden = true;
    input.focus();
    input.select();
  });
  return row;
}

/**
 * `rename`: "field" — ім'я полем (знайомство), "title" — заголовком з олівцем (телефон). `action` — кнопка праворуч у рядку імені
 * (у телефоні — віддати в добрі руки), `extra` — що стоїть під фактами (у телефоні — дане оголошення).
 */
export function catProfile(
  cat: Cat,
  facts: CatFacts,
  more: { action?: HTMLElement | undefined; extra?: HTMLElement; rename?: "field" | "title" } = {},
): HTMLElement {
  const canvas = portraitCanvas(PORTRAIT_SIZE, PORTRAIT_SIZE);
  liveCatPortrait(canvas, cat);

  const about = element("div", "cat-profile-facts");
  about.append(element("p", "cat-profile-line cat-profile-head", facts.head));
  for (const line of facts.lines) about.append(element("p", "cat-profile-line", line));
  if (facts.chips.length > 0) about.append(chipRow(facts.chips));

  const side = element("div", "cat-profile-side");
  if (more.rename === "title") {
    const head = nameTitle(cat);
    if (more.action) head.append(more.action);
    side.append(head, about);
  } else {
    const name = element("div", "name-row");
    name.append(nameField(cat), sexMark(cat));
    if (more.action) name.append(more.action);
    side.append(element("span", "look-label", CAT_INTRO_TEXTS.name), name, about);
  }
  if (more.extra) side.append(more.extra);

  const profile = element("div", "cat-profile");
  profile.append(canvas, side);
  return profile;
}
