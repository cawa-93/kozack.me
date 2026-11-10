// Vite-плагін іконки гри (§2.1 «Іконка гри»): посилання на іконки в `<head>` кожної сторінки гри, а самі файли (`icons.ts`)
// — у dev з пам'яті, у збірці — поруч зі сторінками.
//
// Цей файл Node завантажує сам (vite.config.ts імпортує його за адресою): тут лише вбудовані модулі Node і `vite`, а
// `icons.ts` (імпорти без розширень) завантажує Vite (`runnerImport`), як і конвеєр арту.

import path from "node:path";

import { runnerImport, type Plugin, type ResolvedConfig } from "vite";

type Icons = typeof import("./icons.ts");

export function faviconPlugin(): Plugin {
  let config: ResolvedConfig | null = null;
  let icons: Icons | null = null;
  return {
    name: "kotoklopit-favicon",
    // Vitest бере vite.config.ts гри: тестам іконка не потрібна (її перевіряє tests/favicon.test.ts напряму).
    apply: () => !process.env["VITEST"],

    async configResolved(resolved) {
      config = resolved;
      ({ module: icons } = await runnerImport<Icons>(path.join(import.meta.dirname, "icons.ts"), { root: resolved.root, logLevel: "error" }));
    },

    configureServer(server) {
      const base = server.config.base;
      server.middlewares.use((req, res, next) => {
        const name = req.url?.startsWith(base) ? (req.url.slice(base.length).split("?")[0] ?? "") : "";
        const type = icons?.FAVICON_FILES[name];
        if (!icons || !type) return next();
        icons
          .faviconFiles(server.config.root)
          .then((files) => {
            res.setHeader("Content-Type", type);
            res.end(files.get(name));
          })
          .catch(next);
      });
    },

    transformIndexHtml() {
      return icons && config ? icons.faviconTags(config.base) : undefined;
    },

    async generateBundle() {
      if (config?.command !== "build" || !icons) return;
      for (const [fileName, source] of await icons.faviconFiles(config.root)) this.emitFile({ type: "asset", fileName, source });
    },
  };
}
