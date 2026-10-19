import { defineConfig } from "vitest/config";

/**
 * Режим розробки (§11.5) потрібен і на прев'ю-деплоях Netlify, щоб тестувати гру з телефона.
 * Netlify задає CONTEXT: production, deploy-preview чи branch-deploy.
 */
const PREVIEW_CONTEXTS = ["deploy-preview", "branch-deploy"];

// Продакшн-збірку публікує сайт kozack.me за адресою /games/kotoklopit/.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/games/kotoklopit/" : "/",
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
  },
}));
