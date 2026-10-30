import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

// Конвеєр атласу арту (крок 16): плагін імпортується за адресою файлу, а не статично — тоді Node завантажує його сам, а
// збирач конфігу Vite не тягне в конфіг код гри (у ньому імпорти без розширень, яких майбутній завантажувач конфігу не
// прийме). Що в плагіні, перевіряє tsc зі scripts/tsconfig.json.
const { artPlugin } = (await import(new URL("./scripts/art/plugin.ts", import.meta.url).href)) as { artPlugin(): Plugin };

/**
 * Режим розробки (§11.5) потрібен і на прев'ю-деплоях Netlify, щоб тестувати гру з телефона.
 * Netlify задає CONTEXT: production, deploy-preview чи branch-deploy.
 */
const PREVIEW_CONTEXTS = ["deploy-preview", "branch-deploy"];

// Продакшн-збірку публікує сайт kozack.me за адресою /games/kotoklopit/.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/games/kotoklopit/" : "/",
  // Атлас арту з SVG теки art/: у dev — з пам'яті за адресою art/…, у збірці — файли art/ у теці збірки.
  plugins: [artPlugin()],
  define: {
    __DEV_TOOLS__: JSON.stringify(command === "serve" || PREVIEW_CONTEXTS.includes(process.env["CONTEXT"] ?? "")),
  },
  build: {
    target: "es2022",
    outDir: "../../public/games/kotoklopit",
    emptyOutDir: true,
    // Phaser сам по собі важить близько 1,4 МБ.
    chunkSizeWarningLimit: 1600,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Статистичні тести (сотні бійок, днів чи котів) окремо йдуть 1,5–3 с, але в повному прогоні на навантаженому
    // комп'ютері впиралися в типові 5 с.
    testTimeout: 20_000,
  },
}));
