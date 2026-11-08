// Каталог звуків для сторінки `sounds.html`: групи звуків гри, їхні описи (`about/`), закодовані файли й джерела з
// `sources.json`. Чиста функція: дані збирає `main.ts`, перевіряє `tests/sounds-page.test.ts`.

import type { EncodedGroup } from "../../audio/sfx/files";
import type { Sources } from "../../audio/sfx/sourcetypes";
import type { SoundGroup } from "../../audio/sfx/types";
import type { AboutGroup } from "./about";
import { soundPrint } from "./review";

export interface CatalogSource {
  title: string;
  author: string;
  license: string;
  url: string;
}

export interface CatalogFile {
  name: string;
  /** Адреса закодованого файлу; не закодовано — null. */
  url: string | null;
  seconds: number | null;
  hash: string;
  loop: { start: number; end: number } | null;
  /** Що це за шматок — з рецепта. */
  note: string | null;
  source: CatalogSource | null;
  /** Інші звуки групи з цим самим файлом (назви). */
  shared: string[];
}

export interface CatalogSound {
  /** `група/звук` — ключ рішення. */
  key: string;
  group: string;
  name: string;
  title: string;
  when: string;
  gain: number;
  loop: boolean;
  ui: boolean;
  files: CatalogFile[];
  print: string;
}

export interface CatalogSection {
  title: string;
  sounds: CatalogSound[];
}

export interface CatalogGroup {
  id: string;
  title: string;
  sections: CatalogSection[];
}

export interface CatalogInput {
  groups: readonly SoundGroup[];
  about: Readonly<Record<string, AboutGroup>>;
  encoded: Readonly<Record<string, EncodedGroup>>;
  sources: Readonly<Record<string, Sources>>;
  /** Адреса файлу групи; немає — null. */
  url(group: string, file: string): string | null;
}

/** Розділ для звуків без опису: щоб сторінка показала все, що звучить, навіть коли опис ще не дописали. */
const UNDESCRIBED = "Без опису";

export function buildCatalog(input: CatalogInput): CatalogGroup[] {
  return input.groups.map((group) => {
    const about = input.about[group.id];
    const encoded = input.encoded[group.id] ?? {};
    const sources = input.sources[group.id];
    const titleOf = (name: string): string => findAbout(about, name)?.[0] ?? name;
    const usedBy = new Map<string, string[]>();
    for (const [name, def] of Object.entries(group.sounds)) {
      for (const file of def.files) usedBy.set(file, [...(usedBy.get(file) ?? []), name]);
    }

    const sound = (name: string): CatalogSound | null => {
      const def = group.sounds[name];
      if (!def) return null;
      const [title, when] = findAbout(about, name) ?? [name, "—"];
      const files = def.files.map((file): CatalogFile => {
        const info = encoded[file];
        const recipe = sources?.files[file];
        const original = recipe ? sources?.originals[recipe.from] : undefined;
        return {
          name: file,
          url: input.url(group.id, file),
          seconds: info?.seconds ?? null,
          hash: info?.hash ?? "",
          loop: info?.loop ?? null,
          note: recipe?.note ?? null,
          source: original ? { title: original.title, author: original.author, license: original.license, url: original.url } : null,
          shared: (usedBy.get(file) ?? []).filter((other) => other !== name).map(titleOf),
        };
      });
      const gain = def.gain ?? 1;
      return {
        key: `${group.id}/${name}`,
        group: group.id,
        name,
        title,
        when,
        gain,
        loop: def.loop === true,
        ui: def.ui === true,
        files,
        print: soundPrint({ gain, files: files.map((f) => ({ name: f.name, hash: f.hash })) }),
      };
    };

    const described = new Set<string>();
    const sections: CatalogSection[] = (about?.sections ?? []).map((section) => ({
      title: section.title,
      sounds: Object.keys(section.sounds).flatMap((name) => {
        described.add(name);
        const entry = sound(name);
        return entry ? [entry] : [];
      }),
    }));
    const rest = Object.keys(group.sounds).filter((name) => !described.has(name));
    if (rest.length > 0) sections.push({ title: UNDESCRIBED, sounds: rest.flatMap((name) => sound(name) ?? []) });
    return { id: group.id, title: about?.title ?? group.id, sections: sections.filter((s) => s.sounds.length > 0) };
  });
}

function findAbout(about: AboutGroup | undefined, name: string): readonly [string, string] | undefined {
  for (const section of about?.sections ?? []) {
    const entry = section.sounds[name];
    if (entry) return entry;
  }
  return undefined;
}

/** Звуки групи без опису й описи, яким немає звуку: для тесту. */
export function aboutMismatch(group: SoundGroup, about: AboutGroup | undefined): { missing: string[]; extra: string[]; repeated: string[] } {
  const described = (about?.sections ?? []).flatMap((section) => Object.keys(section.sounds));
  const seen = new Set<string>();
  const repeated = described.filter((name) => (seen.has(name) ? true : (seen.add(name), false)));
  return {
    missing: Object.keys(group.sounds).filter((name) => !seen.has(name)),
    extra: [...seen].filter((name) => !(name in group.sounds)),
    repeated,
  };
}
