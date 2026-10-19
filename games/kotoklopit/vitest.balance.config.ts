import { defineConfig } from "vitest/config";

// Симуляція балансу (§11.2): довгий прогін бота, окремо від звичайних тестів.
export default defineConfig({
  test: {
    include: ["balance/**/*.balance.ts"],
    testTimeout: 60 * 60 * 1000,
  },
});
