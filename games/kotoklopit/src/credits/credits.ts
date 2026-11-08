// Титри (§2.1): хто й за якою ліцензією зробив музику радіо, звуки, програми й шрифти гри. Чиста функція: дані з файлів
// ліцензій збирає `input.ts`, сторінку малює `render.ts`, перевіряє `tests/credits.test.ts`.

import type { Sources } from "../audio/sfx/sourcetypes";

/** Трек каталогу музики (`audio/catalog.json`, `tracks`) — лише те, що потрібне титрам. */
export interface CatalogTrack {
  title: string;
  artist: string;
  source: string;
  license: string;
  sha256: string;
}

/** Джерело музики (`audio/catalog.json`, `sources`). */
export interface CatalogSource {
  name: string;
  license: string;
  page: string;
}

/** Плейлист радіо гри (`src/audio/radio/playlist.json`): що справді грає на станціях. */
export interface PlaylistInput {
  tracks: Readonly<Record<string, { artist: string; title: string }>>;
  stations: readonly { tracks: readonly string[] }[];
}

/** Пакет npm: назва, версія й ліцензія з його `package.json`, текст — з його файлу ліцензії. */
export interface PackageInput {
  name: string;
  version: string;
  license: string;
  homepage: string | null;
  licenseText: string | null;
}

export interface FontInput {
  family: string;
  designer: string;
  /** SPDX-ідентифікатор ліцензії. */
  license: string;
  licenseText: string;
}

export interface ToolInput {
  name: string;
  url: string | null;
}

export interface CreditsInput {
  /** `audio/sfx/<група>/sources.json` за назвою групи. */
  sounds: Readonly<Record<string, Sources>>;
  playlist: PlaylistInput;
  catalog: { tracks: readonly CatalogTrack[]; sources: Readonly<Record<string, CatalogSource>> };
  /** Бібліотеки, які потрапляють у гру (`dependencies` гри). */
  libraries: readonly PackageInput[];
  fonts: readonly FontInput[];
  /** Інструменти розробки (`devDependencies` гри й не з npm). */
  tools: readonly ToolInput[];
}

export interface License {
  id: string;
  name: string;
  url: string | null;
  /** CC BY: автора треба назвати в титрах (вимога ліцензії). */
  attribution: boolean;
}

export interface MusicSource {
  name: string;
  url: string;
  license: License;
  tracks: number;
}

export interface MusicArtist {
  artist: string;
  licenses: License[];
  titles: string[];
}

export interface SoundEntry {
  title: string;
  url: string;
  license: License;
}

export interface SoundAuthor {
  author: string;
  entries: SoundEntry[];
  /** Довгий перелік без CC BY — згорнутим; записи CC BY завжди на виду. */
  collapsed: boolean;
}

/** Як звуки змінено для гри (CC BY вимагає сказати, що матеріал змінено). */
export interface SoundChanges {
  cut: boolean;
  filtered: boolean;
  looped: boolean;
}

export interface Library {
  name: string;
  version: string;
  license: License;
  copyright: string | null;
  url: string | null;
  text: string | null;
}

export interface Font {
  family: string;
  designer: string;
  license: License;
  copyright: string | null;
  url: string | null;
  text: string;
}

export interface Credits {
  music: { sources: MusicSource[]; artists: MusicArtist[]; tracks: number };
  sounds: { authors: SoundAuthor[]; entries: number; changes: SoundChanges };
  libraries: Library[];
  fonts: Font[];
  tools: ToolInput[];
}

/** Скільки записів автора без CC BY показувати відкрито; довший перелік — згорнутим. */
export const OPEN_SOUND_ENTRIES = 3;

const LICENSE_NAMES: Readonly<Record<string, string>> = { "CC0-1.0": "CC0 1.0", PD: "суспільне надбання", "OFL-1.1": "SIL Open Font License 1.1" };
const LICENSE_URLS: Readonly<Record<string, string>> = {
  "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
  PD: "https://creativecommons.org/publicdomain/mark/1.0/",
  MIT: "https://opensource.org/license/mit",
  "OFL-1.1": "https://openfontlicense.org/open-font-license-official-text/",
};
const CC_BY = /^CC-BY-(\d\.\d)$/;

/** Ліцензія за SPDX-ідентифікатором; `url` — посилання з файлу ліцензій, якщо воно там є. */
export function license(id: string, url?: string): License {
  const version = CC_BY.exec(id)?.[1];
  const known = version ? `https://creativecommons.org/licenses/by/${version}/` : (LICENSE_URLS[id] ?? null);
  return { id, name: LICENSE_NAMES[id] ?? id.replace(/^CC-BY-/, "CC BY "), url: url ?? known, attribution: version !== undefined };
}

// Без регістру, а символи на початку імені («*imp*») не рахуються.
const collator = new Intl.Collator("uk", { sensitivity: "base", numeric: true });
const sortKey = (name: string): string => name.replace(/^[^\p{L}\p{N}]+/u, "");
const byName = (a: string, b: string): number => collator.compare(sortKey(a), sortKey(b)) || (a < b ? -1 : a > b ? 1 : 0);

/** Рядок «Copyright …» з тексту ліцензії й перше посилання в ньому. */
export function copyrightOf(text: string | null): { copyright: string | null; url: string | null } {
  const line = text?.split(/\r?\n/).find((l) => /^\s*Copyright\b/i.test(l))?.trim() ?? null;
  return { copyright: line, url: line?.match(/https?:\/\/[^\s)]+/)?.[0] ?? null };
}

/** Трек плейлиста — у каталозі: id плейлиста — перші 12 знаків sha256 оригіналу й профіль кодування (`scripts/audio/encode.ts`). */
export function catalogTrack(id: string, tracks: readonly CatalogTrack[]): CatalogTrack | null {
  const hash = id.split("-")[0] ?? "";
  if (hash.length < 12) return null;
  return tracks.find((track) => track.sha256.startsWith(hash)) ?? null;
}

function music(input: CreditsInput): Credits["music"] {
  const ids = [...new Set(input.playlist.stations.flatMap((station) => station.tracks))];
  const artists = new Map<string, { licenses: Map<string, License>; titles: string[] }>();
  const sources = new Map<string, number>();
  for (const id of ids) {
    const track = catalogTrack(id, input.catalog.tracks);
    if (!track) throw new Error(`Трек плейлиста ${id} не знайдено в audio/catalog.json`);
    const artist = artists.get(track.artist) ?? { licenses: new Map<string, License>(), titles: [] as string[] };
    artist.licenses.set(track.license, license(track.license));
    artist.titles.push(track.title);
    artists.set(track.artist, artist);
    sources.set(track.source, (sources.get(track.source) ?? 0) + 1);
  }
  return {
    tracks: ids.length,
    sources: [...sources].map(([id, tracks]) => {
      const source = input.catalog.sources[id];
      if (!source) throw new Error(`Джерела музики ${id} немає в audio/catalog.json`);
      return { name: source.name, url: source.page, license: license(source.license), tracks };
    }),
    artists: [...artists]
      .map(([artist, { licenses, titles }]) => ({ artist, licenses: [...licenses.values()], titles: titles.sort(byName) }))
      .sort((a, b) => byName(a.artist, b.artist)),
  };
}

function sounds(input: CreditsInput): Credits["sounds"] {
  const authors = new Map<string, Map<string, SoundEntry>>();
  const changes: SoundChanges = { cut: false, filtered: false, looped: false };
  for (const group of Object.keys(input.sounds).sort()) {
    const { originals, files } = input.sounds[group]!;
    const recipes = Object.values(files);
    for (const recipe of recipes) {
      if (recipe.start !== undefined || recipe.end !== undefined) changes.cut = true;
      if (recipe.filter) changes.filtered = true;
      if (recipe.loop) changes.looped = true;
    }
    // Лише оригінали, з яких закодовано хоч один файл гри.
    for (const key of new Set(recipes.map((recipe) => recipe.from))) {
      const original = originals[key];
      if (!original) throw new Error(`Рецепт групи ${group} посилається на невідомий оригінал ${key}`);
      const entries = authors.get(original.author) ?? new Map<string, SoundEntry>();
      // Той самий оригінал у двох групах — один рядок.
      entries.set(`${original.url}\n${original.title}`, { title: original.title, url: original.url, license: license(original.license, original.licenseUrl) });
      authors.set(original.author, entries);
    }
  }
  const list = [...authors]
    .map(([author, entries]) => {
      const sorted = [...entries.values()].sort((a, b) => byName(a.title, b.title));
      return { author, entries: sorted, collapsed: sorted.length > OPEN_SOUND_ENTRIES && !sorted.some((entry) => entry.license.attribution) };
    })
    .sort((a, b) => byName(a.author, b.author));
  return { authors: list, entries: list.reduce((sum, author) => sum + author.entries.length, 0), changes };
}

/** Титри гри з файлів ліцензій. Трек плейлиста без запису в каталозі чи рецепт без оригіналу — помилка збирання. */
export function buildCredits(input: CreditsInput): Credits {
  return {
    music: music(input),
    sounds: sounds(input),
    libraries: input.libraries.map((pkg) => {
      const { copyright } = copyrightOf(pkg.licenseText);
      return { name: pkg.name, version: pkg.version, license: license(pkg.license), copyright, url: pkg.homepage, text: pkg.licenseText };
    }),
    fonts: input.fonts.map((font) => ({ family: font.family, designer: font.designer, license: license(font.license), ...copyrightOf(font.licenseText), text: font.licenseText })),
    tools: [...input.tools],
  };
}
