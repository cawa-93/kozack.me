// Vite-плагін SVG інтерфейсу (§2.1 «Малювання й завантаження»): іконки карток, позначки, гліфи й кнопки екрана йдуть у
// збірку мініфікованими (`minify.ts`) — вихідні файли `art/` з нотатками художника не змінюються. Лише у `vite build`: у dev
// гра бере сирі файли, як і без плагіна.
//
// Імпорт SVG плагін віддає сам, не доходячи до Vite: той читає файл із диска, і підмінити вміст перед ним нічим. Тому й
// назву файлу з хешем (з мініфікованого вмісту) та адресу `data:` малого файлу складає плагін (`assets.ts`).
//
// Іконки, позначки й гліфи карток плагін ще й складає в один файл-пакет (`pack.ts`): гра бере його одним запитом, а окремі
// файли лишаються запасним шляхом. Адресу пакета гра отримує константою збирання, тож пакет складається ще до збирання коду.
//
// Цей файл Node завантажує сам (vite.config.ts імпортує його за адресою): тут лише вбудовані модулі Node, `vite` і сусідні
// файли без імпортів коду гри.

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Plugin, ResolvedConfig } from "vite";

import { hashedName, svgDataUrl, svgImport } from "./assets.ts";
import { minifySvg } from "./minify.ts";
import { PACK_DEFINE, packJson, packSvgs } from "./pack.ts";

/** Межа Vite, якщо в конфігу вона не число: файл, менший за неї, імпорт `?url` вбудовує в код адресою `data:`. */
const INLINE_LIMIT = 4096;

export function iconsPlugin(): Plugin {
  let config: ResolvedConfig | null = null;
  const emitted = new Set<string>();
  let pack: { fileName: string; source: string } | null = null;
  return {
    name: "kotoklopit-icons",
    enforce: "pre",
    // Vitest бере vite.config.ts гри: тести читають SVG як є.
    apply: (_, env) => env.command === "build" && !process.env["VITEST"],

    config(user) {
      const source = packJson(packSvgs(path.resolve(user.root ?? process.cwd(), "art"), minifySvg));
      pack = { fileName: path.posix.join(user.build?.assetsDir ?? "assets", hashedName("card-art", "json", source)), source };
      return { define: { [PACK_DEFINE]: JSON.stringify(pack.fileName) } };
    },

    configResolved(resolved) {
      config = resolved;
    },

    buildStart() {
      emitted.clear();
    },

    async load(id) {
      // Адресу файлу плагін складає від `base`; з відносним `base` її знає лише Vite — тоді SVG лишаються йому.
      if (!config || !config.base.startsWith("/")) return null;
      const found = svgImport(id, path.join(config.root, "art"));
      if (!found) return null;
      const svg = minifySvg(await readFile(found.file, "utf8"));
      if (found.as === "raw") return `export default ${JSON.stringify(svg)}`;
      const limit = typeof config.build.assetsInlineLimit === "number" ? config.build.assetsInlineLimit : INLINE_LIMIT;
      if (found.as === "url" && Buffer.byteLength(svg) < limit) return `export default ${JSON.stringify(svgDataUrl(svg))}`;
      const fileName = path.posix.join(config.build.assetsDir, hashedName(path.basename(found.file, ".svg"), "svg", svg));
      if (!emitted.has(fileName)) {
        emitted.add(fileName);
        this.emitFile({ type: "asset", fileName, source: svg });
      }
      return `export default ${JSON.stringify(config.base + fileName)}`;
    },

    generateBundle() {
      if (pack) this.emitFile({ type: "asset", fileName: pack.fileName, source: pack.source });
    },
  };
}
