// Титри (§2.1): складаються з файлів ліцензій — кожен оригінал звуку, з якого зроблено файл гри, кожен трек радіо, бібліотеки
// й шрифти; CC BY — з автором і ліцензією на виду. Посилання на титри — унизу вкладки «Гра» телефона.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import gamePackage from "../package.json";
import type { Sources } from "../src/audio/sfx/sourcetypes";
import { buildCredits, catalogTrack, OPEN_SOUND_ENTRIES, type CreditsInput, type SoundEntry } from "../src/credits/credits";
import { creditsInput, FONT_FILES, FONTS } from "../src/credits/input";
import { escapeHtml, licenseParagraphs, renderCredits } from "../src/credits/render";
import { newGame } from "../src/sim/game";
import { phoneCard, type PhoneHandlers } from "../src/ui/cards";
import { CREDITS_LINK, CREDITS_URL } from "../src/ui/creditslink";

const input = creditsInput();
const credits = buildCredits(input);
const html = renderCredits(credits);
const shown = credits.sounds.authors.flatMap((author) => author.entries.map((entry) => ({ ...entry, author: author.author, collapsed: author.collapsed })));
const linked = (text: string, url: string): string => `<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>`;

/** Найменші дані титрів: порожньо, крім того, що задано. */
function tiny(over: Partial<CreditsInput>): CreditsInput {
  return { sounds: {}, playlist: { tracks: {}, stations: [] }, catalog: { tracks: [], sources: {} }, libraries: [], fonts: [], tools: [], ...over };
}

const original = (author: string, title: string, license = "CC0-1.0"): Sources["originals"][string] => ({
  file: `${title}.wav`,
  url: `https://freesound.org/${encodeURIComponent(title)}/`,
  title,
  author,
  license: license as Sources["originals"][string]["license"],
  licenseUrl: "https://creativecommons.org/",
  sha256: "0".repeat(64),
});

describe("титри: звуки", () => {
  it("кожен оригінал, з якого закодовано файл гри, — у титрах: автор, назва посиланням, ліцензія", () => {
    let used = 0;
    for (const [group, sources] of Object.entries(input.sounds)) {
      for (const key of new Set(Object.values(sources.files).map((recipe) => recipe.from))) {
        const source = sources.originals[key]!;
        used++;
        const entry = shown.find((e) => e.author === source.author && e.title === source.title && e.url === source.url);
        expect(entry, `${group}/${key}`).toBeDefined();
        expect(entry?.license.id, `${group}/${key}`).toBe(source.license);
        expect(entry?.license.url, `${group}/${key}`).toBe(source.licenseUrl);
        expect(html, `${group}/${key}`).toContain(`${linked(source.title, source.url)} · ${linked(entry!.license.name, source.licenseUrl)}`);
      }
    }
    expect(used).toBeGreaterThan(0);
    expect(Object.keys(input.sounds).length).toBeGreaterThan(0);
  });

  it("CC BY — з автором і посиланням на ліцензію, і не згорнуто", () => {
    const attributed = shown.filter((e) => e.license.attribution);
    expect(attributed.length).toBeGreaterThan(0);
    for (const entry of attributed) {
      expect(entry.author.trim(), entry.title).not.toBe("");
      expect(entry.license.url, entry.title).toMatch(/^https?:\/\//);
      expect(entry.license.name, entry.title).toMatch(/^CC BY \d\.\d$/);
      expect(entry.collapsed, entry.title).toBe(false);
      expect(html).toContain(`<h3 class="credits-name">${escapeHtml(entry.author)}</h3><ul class="credits-entries">`);
    }
  });

  it("невжитий оригінал не показано; той самий оригінал у двох групах — один рядок", () => {
    const a = original("Аня", "Мяу");
    const b = original("Аня", "Шшш");
    const sounds: Record<string, Sources> = {
      cats: { originals: { a, b }, files: { "meow-1": { from: "a" } } },
      home: { originals: { a2: { ...a } }, files: { "meow-2": { from: "a2", start: 1 } } },
    };
    const built = buildCredits(tiny({ sounds }));
    expect(built.sounds.authors).toEqual([{ author: "Аня", entries: [{ title: "Мяу", url: a.url, license: expect.objectContaining({ id: "CC0-1.0" }) as SoundEntry["license"] }], collapsed: false }]);
    expect(built.sounds.entries).toBe(1);
    expect(built.sounds.changes).toEqual({ cut: true, filtered: false, looped: false });
    expect(renderCredits(built)).not.toContain("Шшш");
  });

  it("довгий перелік автора без CC BY згорнуто, з CC BY — ні", () => {
    const many = (author: string, license: string): Sources => {
      const originals = Object.fromEntries(Array.from({ length: OPEN_SOUND_ENTRIES + 1 }, (_, i) => [`k${i}`, original(author, `${author} ${i}`, i === 0 ? license : "CC0-1.0")]));
      return { originals, files: Object.fromEntries(Object.keys(originals).map((key) => [key, { from: key }])) };
    };
    const built = buildCredits(tiny({ sounds: { a: many("Free", "PD"), b: many("Named", "CC-BY-4.0") } }));
    expect(built.sounds.authors.map((a) => [a.author, a.collapsed])).toEqual([
      ["Free", true],
      ["Named", false],
    ]);
    const page = renderCredits(built);
    expect(page).toContain(`<details><summary><h3 class="credits-name">Free</h3> <span class="credits-meta">${OPEN_SOUND_ENTRIES + 1} записи · суспільне надбання, CC0 1.0</span>`);
  });

  it("рецепт без оригіналу — помилка збирання, а не тихий пропуск", () => {
    expect(() => buildCredits(tiny({ sounds: { ui: { originals: {}, files: { click: { from: "nope" } } } } }))).toThrow(/nope/);
  });
});

describe("титри: музика радіо", () => {
  const ids = [...new Set(input.playlist.stations.flatMap((station) => station.tracks))];

  it("кожен трек станцій — у каталозі й у титрах свого виконавця, з ліцензією й джерелом", () => {
    expect(ids.length).toBeGreaterThan(0);
    expect(credits.music.tracks).toBe(ids.length);
    expect(credits.music.artists.reduce((sum, artist) => sum + artist.titles.length, 0)).toBe(ids.length);
    for (const id of ids) {
      const track = catalogTrack(id, input.catalog.tracks);
      expect(track, id).not.toBeNull();
      expect({ artist: track?.artist, title: track?.title }, id).toEqual({ artist: input.playlist.tracks[id]?.artist, title: input.playlist.tracks[id]?.title });
      const artist = credits.music.artists.find((a) => a.artist === track?.artist);
      expect(artist?.titles, id).toContain(track?.title);
      expect(artist?.licenses.map((l) => l.id), id).toContain(track?.license);
      expect(html, id).toContain(`<li>${escapeHtml(track!.title)}</li>`);
    }
    expect(credits.music.sources.reduce((sum, source) => sum + source.tracks, 0)).toBe(ids.length);
    for (const source of credits.music.sources) expect(html).toContain(linked(source.name, source.url));
  });

  it("трек без запису в каталозі — помилка збирання", () => {
    const playlist = { tracks: { "0123456789ab-m48": { artist: "X", title: "Y" } }, stations: [{ tracks: ["0123456789ab-m48"] }] };
    expect(() => buildCredits(tiny({ playlist }))).toThrow(/0123456789ab-m48/);
  });
});

describe("титри: програми й шрифти", () => {
  it("кожна бібліотека гри — з версією, ліцензією, рядком Copyright і текстом ліцензії", () => {
    expect(credits.libraries.map((lib) => lib.name.toLowerCase())).toEqual(Object.keys(gamePackage.dependencies));
    const phaser = credits.libraries.find((lib) => lib.name === "Phaser");
    expect(phaser?.license.id).toBe("MIT");
    for (const lib of credits.libraries) {
      expect(lib.version, lib.name).toMatch(/^\d+\.\d+/);
      expect(lib.copyright, lib.name).toMatch(/^Copyright/);
      expect(lib.text, lib.name).toBeTruthy();
      expect(html).toContain(escapeHtml(lib.copyright!));
    }
  });

  it("кожен файл шрифту гри належить шрифту в титрах — з OFL, рядком Copyright і текстом ліцензії", () => {
    expect(FONT_FILES.length).toBeGreaterThan(0);
    for (const file of FONT_FILES) expect(FONTS.some((font) => file.startsWith(font.files)), file).toBe(true);
    for (const font of credits.fonts) {
      expect(font.license.name, font.family).toBe("SIL Open Font License 1.1");
      expect(font.copyright, font.family).toMatch(/^Copyright/);
      expect(html).toContain(escapeHtml(font.copyright!));
    }
  });

  it("текст ліцензії — абзацами, без рядків-прикрас, слово в слово", () => {
    expect(licenseParagraphs("A\nb\n\n-----\nC\r\n d\n")).toEqual(["A b", "C d"]);
    const words = (text: string): string[] => text.split(/\s+/).filter((word) => word !== "" && !/^[-=_*]+$/.test(word));
    for (const { text } of [...credits.libraries, ...credits.fonts]) expect(words(licenseParagraphs(text ?? "").join(" "))).toEqual(words(text ?? ""));
  });

  it("угорі — гра й автор, «Назад до гри» — на початку й наприкінці", () => {
    expect(html).toContain("<h1>Котоклопіт</h1>");
    expect(html).toContain('Автор гри — <a href="https://kozack.me/">Олександр Козак</a>');
    expect(html.match(/<a href="\.\/" data-back>/g)).toHaveLength(2);
  });
});

/** Найпростіший DOM для вкладки «Гра»: елемент пам'ятає клас, текст, дітей і властивості посилання. */
class FakeElement {
  className = "";
  textContent = "";
  href = "";
  target = "";
  rel = "";
  children: (FakeElement | string)[] = [];
  readonly style: Record<string, string> = {};
  readonly attributes: Record<string, string> = {};
  constructor(readonly tagName: string) {}
  append(...nodes: (FakeElement | string)[]): void {
    this.children.push(...nodes);
  }
  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }
  addEventListener(): void {}
  all(): FakeElement[] {
    const own = this.children.filter((c): c is FakeElement => typeof c !== "string");
    return own.flatMap((c) => [c, ...c.all()]);
  }
}

describe("посилання на титри", () => {
  beforeAll(() => {
    vi.stubGlobal("document", { createElement: (tag: string) => new FakeElement(tag) });
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
  });
  afterAll(() => vi.unstubAllGlobals());

  it("останнім у вкладці «Гра» телефона: титри в новій вкладці, гра лишається відкритою", () => {
    const noop = (): void => undefined;
    const phone: PhoneHandlers = { checkout: noop, payUtilities: noop, discard: noop, discardThing: noop, advertise: noop, cancelAd: noop, newGame: noop, exportSave: noop, importSave: noop, tab: noop, close: noop, effects: { volume: 1, set: noop } };
    const card = phoneCard(newGame({ address: "she", difficulty: "normal", seed: 8 }).current, "game", phone);
    const last = card.body.at(-1) as unknown as FakeElement;
    expect(last.className).toBe("game-credits");
    const link = last.all().find((el) => el.tagName === "a");
    expect(link).toMatchObject({ textContent: CREDITS_LINK, href: CREDITS_URL, target: "_blank", rel: "noopener" });
    expect(CREDITS_URL).toBe(`${import.meta.env.BASE_URL}credits.html`);
  });
});
