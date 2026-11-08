// Сторінка титрів (§2.1, тексти — `TEXTS.md`, «Титри») — HTML-рядком: її збирає `scripts/credits/plugin.ts` у
// `credits.html`, тож сторінка готова без JS і без даних, з яких її складено.

import { plural } from "../ui/titles";
import type { Credits, License, SoundAuthor } from "./credits";

export const CREDITS_TEXTS = {
  kicker: "Титри",
  game: "Котоклопіт",
  author: "Автор гри — ",
  authorName: "Олександр Козак",
  authorUrl: "https://kozack.me/",
  back: "← Назад до гри",
  music: "Музика радіо",
  sounds: "Звуки",
  software: "Програми й шрифти",
  font: "Шрифт ",
  licenseText: "Текст ліцензії",
  tools: "Зроблено за допомогою ",
} as const;

const ESCAPES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

const link = (text: string, url: string | null): string => (url ? `<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>` : escapeHtml(text));
const licenseLink = (license: License): string => link(license.name, license.url);
const count = (n: number, one: string, few: string, many: string): string => `${n} ${plural(n, one, few, many)}`;
/** «a, b і c». */
const listing = (items: readonly string[]): string => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} і ${items.at(-1)}`);

function music({ music }: Credits): string {
  const sources = music.sources.map((source) => `${link(source.name, source.url)} (${licenseLink(source.license)})`);
  const artists = music.artists.map((artist) => {
    const meta = `${count(artist.titles.length, "трек", "треки", "треків")} · ${artist.licenses.map((l) => escapeHtml(l.name)).join(", ")}`;
    const titles = artist.titles.map((title) => `<li>${escapeHtml(title)}</li>`).join("");
    return `<li class="credits-item"><details><summary><h3 class="credits-name">${escapeHtml(artist.artist)}</h3> <span class="credits-meta">${meta}</span></summary><ul class="credits-titles">${titles}</ul></details></li>`;
  });
  return [
    `<section class="credits-section" aria-labelledby="credits-music"><h2 id="credits-music">${CREDITS_TEXTS.music}</h2>`,
    `<p class="credits-lead">${count(music.tracks, "трек", "треки", "треків")} · ${count(music.artists.length, "виконавець", "виконавці", "виконавців")}. ${sources.length > 1 ? "Джерела" : "Джерело"} — ${listing(sources)}.</p>`,
    `<ul class="credits-list">${artists.join("")}</ul></section>`,
  ].join("");
}

function soundAuthor(author: SoundAuthor): string {
  const entries = author.entries.map((entry) => `<li>${link(entry.title, entry.url)} · ${licenseLink(entry.license)}</li>`).join("");
  const name = `<h3 class="credits-name">${escapeHtml(author.author)}</h3>`;
  if (!author.collapsed) return `<li class="credits-item">${name}<ul class="credits-entries">${entries}</ul></li>`;
  const licenses = [...new Set(author.entries.map((entry) => entry.license.name))].map(escapeHtml).join(", ");
  const meta = `${count(author.entries.length, "запис", "записи", "записів")} · ${licenses}`;
  return `<li class="credits-item"><details><summary>${name} <span class="credits-meta">${meta}</span></summary><ul class="credits-entries">${entries}</ul></details></li>`;
}

function sounds({ sounds }: Credits): string {
  const done = [...(sounds.changes.cut ? ["обрізано"] : []), "вирівняно за гучністю"];
  const some = [...(sounds.changes.filtered ? ["відфільтровано"] : []), ...(sounds.changes.looped ? ["закільцьовано"] : [])];
  const changes = `Для гри записи ${done.join(" й ")}${some.length > 0 ? `, частину — ${some.join(" й ")}` : ""}.`;
  return [
    `<section class="credits-section" aria-labelledby="credits-sounds"><h2 id="credits-sounds">${CREDITS_TEXTS.sounds}</h2>`,
    `<p class="credits-lead">${count(sounds.entries, "запис", "записи", "записів")} · ${count(sounds.authors.length, "автор", "автори", "авторів")}. ${changes}</p>`,
    `<ul class="credits-list">${sounds.authors.map(soundAuthor).join("")}</ul></section>`,
  ].join("");
}

const licenseText = (text: string | null): string =>
  text ? `<details class="credits-license"><summary>${CREDITS_TEXTS.licenseText}</summary><pre>${escapeHtml(text.replace(/\r\n/g, "\n"))}</pre></details>` : "";

function software({ libraries, fonts, tools }: Credits): string {
  const items = [
    ...libraries.map((lib) => {
      const line = [lib.copyright ? escapeHtml(lib.copyright) : null, licenseLink(lib.license)].filter((part) => part !== null).join(" · ");
      return `<li class="credits-item"><h3 class="credits-name">${link(lib.name, lib.url)} ${escapeHtml(lib.version)}</h3><p class="credits-entry">${line}</p>${licenseText(lib.text)}</li>`;
    }),
    ...fonts.map((font) => {
      const line = [escapeHtml(font.designer), font.copyright ? escapeHtml(font.copyright) : null, licenseLink(font.license)].filter((part) => part !== null).join(" · ");
      return `<li class="credits-item"><h3 class="credits-name">${CREDITS_TEXTS.font}${link(font.family, font.url)}</h3><p class="credits-entry">${line}</p>${licenseText(font.text)}</li>`;
    }),
  ];
  return [
    `<section class="credits-section" aria-labelledby="credits-software"><h2 id="credits-software">${CREDITS_TEXTS.software}</h2>`,
    `<ul class="credits-list">${items.join("")}</ul>`,
    tools.length > 0 ? `<p class="credits-tools">${CREDITS_TEXTS.tools}${listing(tools.map((tool) => link(tool.name, tool.url)))}.</p>` : "",
    `</section>`,
  ].join("");
}

/** «Назад до гри»: `data-back` — посилання, яке закриває вкладку титрів, якщо її відкрила гра (`back.ts`). */
const back = `<p class="credits-back"><a href="./" data-back>${CREDITS_TEXTS.back}</a></p>`;

/** Вміст сторінки титрів. */
export function renderCredits(credits: Credits): string {
  const head = [
    `<header class="credits-head"><p class="credits-kicker">${CREDITS_TEXTS.kicker}</p><h1>${CREDITS_TEXTS.game}</h1>`,
    `<p class="credits-by">${CREDITS_TEXTS.author}${link(CREDITS_TEXTS.authorName, CREDITS_TEXTS.authorUrl)}</p></header>`,
  ].join("");
  return [back, head, music(credits), sounds(credits), software(credits), back].join("\n");
}
