// Vite-плагін титрів (§2.1): ставить у `credits.html` на місце позначки сторінку, складену з файлів ліцензій
// (`src/credits/page.ts`). У збірці — раз, у dev — на кожен запит, тож зміни `sources.json` чи каталогу видно після
// перезавантаження сторінки.
//
// Цей файл Node завантажує сам (vite.config.ts імпортує його за адресою): тут лише вбудовані модулі Node і `vite`, а код
// титрів (з імпортами без розширень, JSON і `import.meta.glob`) завантажує Vite (`runnerImport`), як і конвеєр арту.

import path from "node:path";

import { runnerImport, type Plugin } from "vite";

/** Позначка в `credits.html`, на місце якої стає вміст. */
export const CREDITS_SLOT = "<!-- титри -->";

interface CreditsPage {
  creditsHtml(): string;
}

export function creditsPlugin(): Plugin {
  let root = process.cwd();
  return {
    name: "kotoklopit-credits",
    configResolved(config) {
      root = config.root;
    },
    async transformIndexHtml(html, context) {
      if (path.basename(context.filename) !== "credits.html") return;
      if (!html.includes(CREDITS_SLOT)) throw new Error(`credits.html: немає позначки ${CREDITS_SLOT}`);
      const { module } = await runnerImport<CreditsPage>(path.join(root, "src", "credits", "page.ts"), { root, logLevel: "error" });
      return html.replace(CREDITS_SLOT, () => module.creditsHtml());
    },
  };
}
