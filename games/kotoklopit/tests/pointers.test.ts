// Скільки дотиків гра чує одночасно (§10): стільки, скільки задає конфіг гри (`input.activePointers` у main.ts), — п'ять, як і
// було в квартирі (джойстик, дія, ривок, перестановка й запас). Сцени й сенсорне керування вказівників не додають: кожна гонка
// додавала б ще два (`addPointer`), аж до стелі Phaser у десять, і кожен з них Phaser перевіряє щокадру.

import { describe, expect, it } from "vitest";

const sources = import.meta.glob<string>("../src/**/*.ts", { query: "?raw", import: "default", eager: true });

describe("дотики (§10)", () => {
  it("вказівники задає лише конфіг гри: 5 дотиків", () => {
    const main = sources["../src/main.ts"] ?? "";
    expect(main).toMatch(/input: \{ activePointers: 5 \}/);
    for (const [file, source] of Object.entries(sources)) {
      if (file.includes("/src/dev/")) continue;
      expect(source, file).not.toMatch(/\baddPointer\s*\(/);
    }
  });
});
