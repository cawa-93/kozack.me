// Іконка біля назви (§11.4 «Іконка біля назви», рішення автора 2026-11-02): картки вчать мови іконок — біля назви запасу,
// речі чи хвороби стоїть той самий малюнок, що й у грі (у баблі — без хмаринки), а не емодзі. Так гравець поступово
// запам'ятовує, що каже бабл чи телефон, коли чогось бракує.
//
// Іконка — `<img>` із SVG `art/icon/<назва>.svg`: з того самого файлу конвеєр арту робить кадр атласу `icon/<назва>`, а в
// картці браузер малює SVG сам, тож іконка чітка на будь-якій щільності екрана. Файли бере Vite: `?no-inline` — окремим
// файлом, а не адресою data: у коді гри (іконок понад сотню, а картка показує кілька за раз).
//
// У тексті картки іконку ставить позначка `iconMark` (`named` — назва з іконкою перед нею): `drawIcons` (Overlay — у кожній
// картці, на титулці й на екрані кінця гри) замінює позначку малюнком, як `drawGlyphs` — символи-позначки. Тож назва з
// іконкою лишається рядком: її так само передають у тексти (`homeVetText`, `farewellText`) і кнопки. Позначка — символи
// приватної області Unicode й назва іконки малими латинськими, тож `toLowerCase` (назва посеред речення) її не змінює.

import { ILLNESS_TITLES, diseaseTitle } from "../texts";
import type { IllnessId, ThingKind } from "../sim/types";
import { ICON_NAMES, type IconName } from "../view/iconnames";
import { DISEASE_ICONS, ILLNESS_ICONS, THING_ICONS } from "../view/symbols";
import { THING_TITLES } from "./titles";

/** Тека SVG іконок (`art/icon/`) — так, як її ключі дає `import.meta.glob` із цього файлу. */
const ICON_DIR = "../../art/icon/";

/** SVG іконок (`art/icon/<назва>.svg`) → адреса файлу. */
const ICON_FILES = import.meta.glob<string>("../../art/icon/*.svg", { query: "?no-inline", import: "default", eager: true });

/**
 * Адреса SVG іконки: файл `icon/<назва>` серед `files` (шлях → адреса, як дає `import.meta.glob`); файлу немає — null.
 * Чистий розрахунок без DOM.
 */
export function iconUrl(name: IconName, files: Readonly<Record<string, string>> = ICON_FILES): string | null {
  return files[`${ICON_DIR}${name}.svg`] ?? null;
}

const OPEN = "\u{E000}";
const CLOSE = "\u{E001}";
const KNOWN = new Set<string>(ICON_NAMES);
/** Позначка й слово за нею: іконку не відривають від назви переносом рядка. */
const MARK = new RegExp(`${OPEN}([a-z0-9-]+)${CLOSE}(\\S*)`, "gu");

/** Позначка іконки в тексті картки: на екрані її замінює малюнок (`drawIcons`). */
export const iconMark = (icon: IconName): string => `${OPEN}${icon}${CLOSE}`;

/** Назва з іконкою перед нею (§11.4 «Іконка біля назви»). */
export const named = (icon: IconName, title: string): string => `${iconMark(icon)}${title}`;

/**
 * Назва хвороби кота з іконкою (§11.4, §8.5): та сама іконка, що в баблі, яким кіт про хворобу сигналізує (`DISEASE_ICONS`).
 * Назва невідомої хвороби — без іконки, як `diseaseTitle`.
 */
export function diseaseLabel(id: string): string {
  const icon = (DISEASE_ICONS as Partial<Record<string, IconName>>)[id];
  return icon === undefined ? diseaseTitle(id) : named(icon, diseaseTitle(id));
}

/**
 * Назва хвороби персонажа з іконкою (§11.4, §6.5; `ILLNESS_ICONS`): у застуди й травми — та сама, що в його відмові ривка, у
 * виснаження — своя (ривка воно не забирає).
 */
export const illnessLabel = (id: IllnessId): string => named(ILLNESS_ICONS[id], ILLNESS_TITLES[id]);

/** Назва речі з іконкою (§11.4): та сама, що біля неї в магазині (`THING_ICONS`), — і в «Моїх речах» телефона. */
export const thingLabel = (kind: ThingKind): string => named(THING_ICONS[kind], THING_TITLES[kind]);

/** Шматок тексту: звичайний текст чи іконка зі словом за нею. */
export type IconPart = string | { icon: IconName; word: string };

/**
 * Текст на шматки: позначки іконок — окремо, разом зі словом за ними (до пробілу), решта — як є. Позначка невідомої іконки
 * зникає, слово лишається. Чистий розрахунок без DOM.
 */
export function splitIcons(text: string): IconPart[] {
  const parts: IconPart[] = [];
  let last = 0;
  for (const match of text.matchAll(MARK)) {
    const [whole, icon = "", word = ""] = match;
    const at = match.index;
    if (at > last) parts.push(text.slice(last, at));
    if (KNOWN.has(icon)) parts.push({ icon: icon as IconName, word });
    else if (word) parts.push(word);
    last = at + whole.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  // Сусідні шматки тексту — одним рядком.
  return parts.reduce<IconPart[]>((all, part) => {
    const prev = all[all.length - 1];
    if (typeof part === "string" && typeof prev === "string") all[all.length - 1] = prev + part;
    else all.push(part);
    return all;
  }, []);
}

/** `<img>` іконки біля назви: alt порожній — назва й так поруч; розмір — у CSS (`.name-icon`, в em, з текстом). */
export function iconImage(icon: IconName): HTMLImageElement | null {
  const url = iconUrl(icon);
  if (url === null) return null;
  const img = document.createElement("img");
  img.className = "name-icon";
  img.src = url;
  img.alt = "";
  img.draggable = false;
  img.setAttribute("aria-hidden", "true");
  return img;
}

/** Замінити позначки іконок у тексті вузла малюнками: іконка й слово за нею — один нерозривний шматок (`.named`). */
export function drawIcons(root: Node): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n.nodeValue ?? "").includes(OPEN)) nodes.push(n as Text);
  for (const node of nodes) {
    const fragment = document.createDocumentFragment();
    for (const part of splitIcons(node.nodeValue ?? "")) {
      if (typeof part === "string") {
        fragment.append(part);
        continue;
      }
      const span = document.createElement("span");
      span.className = "named";
      const img = iconImage(part.icon);
      if (img) span.append(img);
      span.append(part.word);
      fragment.append(span);
    }
    node.replaceWith(fragment);
  }
}
