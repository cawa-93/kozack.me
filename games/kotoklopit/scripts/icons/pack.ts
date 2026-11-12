// Пакет іконок карток (§2.1 «Малювання й завантаження»): усі малюнки, які картки показують як `<img>`, одним файлом
// «назва → текст SVG» — гра бере його одним запитом (`src/ui/artpack.ts`). Без Vite: його кличуть плагін і тести.
//
// Без імпортів сусідніх файлів: плагін (його завантажує сам Node) пише їх із розширенням `.ts`, а тести — без нього. Тому
// мініфікатор сюди передають.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Теки `art/`, з яких картки беруть малюнки окремими файлами: ті самі, що в `import.meta.glob` у `src/ui/icons.ts` і
 * `src/ui/glyphs.ts` (без підтек). Що пакет покриває кожну іконку, позначку й гліф, перевіряє `tests/artpack.test.ts`.
 */
export const PACK_DIRS: readonly string[] = ["icon", "icon/mark", "ui/glyph"];

/** Назва константи збирання з адресою пакета від теки збірки; гра читає її в `src/ui/artpack.ts`. */
export const PACK_DEFINE = "__CARD_ART_PACK__";

/** Малюнки пакета: назва (шлях від `art/` без розширення) → SVG, стиснутий `minify`. */
export function packSvgs(artDir: string, minify: (svg: string) => string): Map<string, string> {
  const svgs = new Map<string, string>();
  for (const dir of PACK_DIRS) {
    for (const entry of readdirSync(path.join(artDir, dir), { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".svg")) continue;
      svgs.set(`${dir}/${entry.name.slice(0, -".svg".length)}`, minify(readFileSync(path.join(artDir, dir, entry.name), "utf8")));
    }
  }
  return svgs;
}

/** Файл пакета. Назви — за абеткою: порядок файлів на диску не має міняти вміст, а з ним і хеш у назві. */
export function packJson(svgs: ReadonlyMap<string, string>): string {
  return JSON.stringify(Object.fromEntries([...svgs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))));
}
