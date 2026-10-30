// Шви для нової графіки (крок 16, хвиля 0): модулі, на які спиратимуться ізометричні частини світу, тести й маніфест
// арту, — без Phaser і без старого вигляду, щоб їх можна було перевіряти в Node і щоб legacy можна було просто видалити.

import { describe, expect, it } from "vitest";

const seams = import.meta.glob<string>(
  [
    "../src/view/world/part.ts",
    "../src/view/world/world.ts",
    "../src/view/world/projection.ts",
    "../src/view/world/objects.ts",
    "../src/view/world/layers.ts",
    "../src/view/iconnames.ts",
    "../src/view/gfx.ts",
    "../src/view/colors.ts",
  ],
  { query: "?raw", import: "default", eager: true },
);

describe("шви нової графіки", () => {
  it("без Phaser і без старого вигляду", () => {
    expect(Object.keys(seams)).toHaveLength(8);
    for (const [file, source] of Object.entries(seams)) {
      expect(source, file).not.toMatch(/from\s+["']phaser["']/);
      expect(source, file).not.toMatch(/from\s+["'][^"']*legacy\//);
    }
  });
});
