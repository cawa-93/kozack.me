import { defineConfig } from "vitest/config";

// Продакшн-збірку публікує сайт kozack.me за адресою /games/vtecha/.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/games/vtecha/" : "/",
  server: { port: 5173 },
  build: {
    target: "es2022",
    sourcemap: true,
    outDir: "../../src/games/vtecha",
    emptyOutDir: true,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 120_000,
  },
}));
