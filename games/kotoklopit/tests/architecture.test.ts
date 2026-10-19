import { describe, expect, it } from "vitest";

const sources = import.meta.glob<string>("../src/sim/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("симуляція", () => {
  it("не залежить від Phaser і DOM (§2.1)", () => {
    const files = Object.entries(sources);
    expect(files.length).toBeGreaterThan(0);
    for (const [file, source] of files) {
      expect(source, file).not.toMatch(/from\s+["']phaser["']/);
      // Звернення до браузера (`window.`, `localStorage[`), а не слово в рядку: є риса з id "window".
      expect(source, file).not.toMatch(/\b(window|document|localStorage)\s*[.[]/);
    }
  });

  it("не використовує Math.random поза seed нової гри (§6.1)", () => {
    for (const [file, source] of Object.entries(sources)) {
      const uses = source.match(/Math\.random/g) ?? [];
      expect(uses.length, file).toBe(file.endsWith("/game.ts") ? 1 : 0);
    }
  });
});

const app = import.meta.glob<string>("../src/**/*.ts", { query: "?raw", import: "default", eager: true });

describe("режим розробки", () => {
  it("підключається лише динамічно з main.ts під __DEV_TOOLS__ (§11.5)", () => {
    for (const [file, source] of Object.entries(app)) {
      if (file.includes("/src/dev/")) continue;
      const imports = source.match(/from\s+["'][^"']*\/dev(\/[^"']*)?["']|import\(["'][^"']*\/dev(\/[^"']*)?["']\)/g) ?? [];
      if (file.endsWith("/src/main.ts")) {
        expect(imports, file).toEqual(['import("./dev")']);
        expect(source).toMatch(/if \(__DEV_TOOLS__\)/);
      } else {
        expect(imports, file).toEqual([]);
      }
    }
  });
});
