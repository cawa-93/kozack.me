import { defineConfig } from "vitest/config";

// Продакшн-збірку публікує сайт kozack.me за адресою /games/kotoklopit/.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/games/kotoklopit/" : "/",
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
