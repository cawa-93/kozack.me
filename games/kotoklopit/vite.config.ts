import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

// Конвеєр атласу арту (крок 16): плагін імпортується за адресою файлу, а не статично — тоді Node завантажує його сам, а
// збирач конфігу Vite не тягне в конфіг код гри (у ньому імпорти без розширень, яких майбутній завантажувач конфігу не
// прийме). Що в плагіні, перевіряє tsc зі scripts/tsconfig.json.
const { artPlugin } = (await import(new URL("./scripts/art/plugin.ts", import.meta.url).href)) as { artPlugin(): Plugin };
// Рішення сторінки звуків (`sounds.html`) dev-сервер пише у файл — так само за адресою файлу.
const { soundReviewPlugin } = (await import(new URL("./scripts/audio/reviewplugin.ts", import.meta.url).href)) as { soundReviewPlugin(): Plugin };
// Сторінку титрів (`credits.html`, §2.1) з файлів ліцензій складає плагін — так само за адресою файлу.
const { creditsPlugin } = (await import(new URL("./scripts/credits/plugin.ts", import.meta.url).href)) as { creditsPlugin(): Plugin };
// Іконку гри для браузера (§2.1) з `favicon/tab.svg` робить плагін — так само за адресою файлу.
const { faviconPlugin } = (await import(new URL("./scripts/favicon/plugin.ts", import.meta.url).href)) as { faviconPlugin(): Plugin };
// Доріжки анімацій скелетів (§2.1) у збірці — готовими даними: їх рахує плагін — так само за адресою файлу.
const { animsPlugin } = (await import(new URL("./scripts/anims/plugin.ts", import.meta.url).href)) as { animsPlugin(): Plugin };

/**
 * Режим розробки (§11.5) потрібен і на прев'ю-деплоях Netlify, щоб тестувати гру з телефона.
 * Netlify задає CONTEXT: production, deploy-preview чи branch-deploy.
 */
const PREVIEW_CONTEXTS = ["deploy-preview", "branch-deploy"];
/** Чи вмикати режим розробки (`__DEV_TOOLS__`), галерею арту (`gallery.html`, крок 16) і каталог звуків (`sounds.html`): `npm run dev` і прев'ю. */
const devTools = (command: string): boolean => command === "serve" || PREVIEW_CONTEXTS.includes(process.env["CONTEXT"] ?? "");
/** Сторінка в теці гри — абсолютним шляхом, щоб не залежати від теки, з якої запустили збирання. */
const page = (file: string): string => fileURLToPath(new URL(file, import.meta.url));

// Продакшн-збірку публікує сайт kozack.me за адресою /games/kotoklopit/.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/games/kotoklopit/" : "/",
  // Атлас арту з SVG теки art/: у dev — з пам'яті за адресою art/…, у збірці — файли art/ у теці збірки.
  plugins: [artPlugin(), soundReviewPlugin(), creditsPlugin(), faviconPlugin(), animsPlugin()],
  server: {
    // Сирі бібліотеки звуків і вивантаження музики (поза git, їх беруть лише скрипти `scripts/audio/`) — понад 10 тисяч
    // файлів, а наглядач Vite ставить `fs.watch` на кожен: на Windows це блокує dev-сервер на хвилини (і завантаження
    // маніфесту атласу падає з таймаутом).
    watch: { ignored: ["**/audio-library/**", "**/sfx-library/**", "**/cloudflare-music/**", "**/.wrangler/**"] },
  },
  define: {
    __DEV_TOOLS__: JSON.stringify(devTools(command)),
  },
  build: {
    target: "es2022",
    outDir: "../../public/games/kotoklopit",
    emptyOutDir: true,
    // Phaser окремим файлом важить близько 1,4 МБ.
    chunkSizeWarningLimit: 1600,
    // Титри — у кожній збірці; галерея арту й каталог звуків — лише разом із режимом розробки: у продакшн-збірці їх немає.
    rolldownOptions: {
      // Phaser — окремим файлом: хеш коду гри змінюється з кожним деплоєм, а Phaser — лише з оновленням бібліотеки, тож
      // гравець, що повертається, не качає його знову.
      output: { codeSplitting: { groups: [{ name: "phaser", test: /node_modules[\\/]phaser[\\/]/ }] } },
      input: {
        index: page("index.html"),
        credits: page("credits.html"),
        ...(devTools(command) ? { gallery: page("gallery.html"), sounds: page("sounds.html") } : {}),
      },
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Статистичні тести (сотні бійок, днів чи котів) окремо йдуть 1,5–3 с, але в повному прогоні на навантаженому
    // комп'ютері впиралися в типові 5 с.
    testTimeout: 20_000,
  },
}));
