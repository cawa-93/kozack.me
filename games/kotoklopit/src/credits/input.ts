// Дані титрів (§2.1) — з тих самих файлів, з яких збирається гра: ліцензії звуків, каталог і плейлист музики, пакети npm і
// шрифти. Модуль для Node — збирання сторінки (`scripts/credits/plugin.ts`) і тести: пакети читає з диска, бо файл ліцензії
// пакет зазвичай не експортує.

import { readdirSync, readFileSync } from "node:fs";
import { findPackageJSON } from "node:module";
import path from "node:path";

import gamePackage from "../../package.json";
import playlist from "../audio/radio/playlist.json";
import type { Sources } from "../audio/sfx/sourcetypes";
import caveatLicense from "../ui/fonts/OFL-caveat.txt?raw";
import pangolinLicense from "../ui/fonts/OFL.txt?raw";
import type { CatalogSource, CatalogTrack, CreditsInput, FontInput, PackageInput, ToolInput } from "./credits";

const SOURCES = import.meta.glob<Sources>("/audio/sfx/*/sources.json", { import: "default", eager: true });
// Через glob, а не імпортом: так tsc не виводить тип із майже мегабайтного JSON.
const CATALOG = import.meta.glob<{ tracks: CatalogTrack[]; sources: Record<string, CatalogSource> }>("/audio/catalog.json", { import: "default", eager: true });
/** Файли шрифтів гри: кожен має належати шрифту з `FONTS` (перевіряє тест). */
export const FONT_FILES = Object.keys(import.meta.glob("/src/ui/fonts/*.woff2", { query: "?url", import: "default", eager: true })).map((file) => path.posix.basename(file));

/** Шрифти гри (`src/ui/theme.css`); `files` — початок назв їхніх файлів у `src/ui/fonts/`. */
export const FONTS: readonly (FontInput & { files: string })[] = [
  { family: "Pangolin", designer: "Kevin Burke", license: "OFL-1.1", licenseText: pangolinLicense, files: "pangolin-" },
  { family: "Caveat", designer: "Pablo Impallari", license: "OFL-1.1", licenseText: caveatLicense, files: "caveat-" },
];

/** Як назвати пакет у титрах; без запису — як у npm. */
const PACKAGE_NAMES: Readonly<Record<string, string>> = {
  phaser: "Phaser",
  typescript: "TypeScript",
  vite: "Vite",
  vitest: "Vitest",
  "playwright-core": "Playwright",
};
/** Інструменти не з npm: FFmpeg кодує звуки й музику (`scripts/audio/`). */
const OTHER_TOOLS: readonly ToolInput[] = [{ name: "FFmpeg", url: "https://ffmpeg.org" }];

interface PackageJson {
  name: string;
  version: string;
  license?: string;
  homepage?: string;
}

function readPackage(name: string): PackageInput {
  const file = findPackageJSON(name, import.meta.url);
  if (!file) throw new Error(`Пакет ${name} не знайдено`);
  const pkg = JSON.parse(readFileSync(file, "utf8")) as PackageJson;
  const dir = path.dirname(file);
  const licenseFile = readdirSync(dir).find((entry) => /^licen[cs]e(\.(md|txt))?$/i.test(entry));
  return {
    name: PACKAGE_NAMES[name] ?? name,
    version: pkg.version,
    license: pkg.license ?? "",
    homepage: pkg.homepage ?? null,
    licenseText: licenseFile ? readFileSync(path.join(dir, licenseFile), "utf8").trim() : null,
  };
}

export function creditsInput(): CreditsInput {
  const catalog = CATALOG["/audio/catalog.json"];
  if (!catalog) throw new Error("Немає audio/catalog.json");
  return {
    sounds: Object.fromEntries(Object.entries(SOURCES).map(([file, sources]) => [file.split("/").at(-2)!, sources])),
    playlist,
    catalog,
    libraries: Object.keys(gamePackage.dependencies).map(readPackage),
    fonts: FONTS.map(({ family, designer, license, licenseText }) => ({ family, designer, license, licenseText: licenseText.trim() })),
    tools: [
      ...Object.keys(gamePackage.devDependencies).map((name) => {
        const pkg = readPackage(name);
        return { name: pkg.name, url: pkg.homepage };
      }),
      ...OTHER_TOOLS,
    ],
  };
}
