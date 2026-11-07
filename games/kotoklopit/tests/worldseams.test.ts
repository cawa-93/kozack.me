// Шви світу (крок 16, хвиля 0): модулі, на які спираються ізометричні частини світу, тести й маніфест арту, — без Phaser,
// щоб їх можна було перевіряти в Node.

import { describe, expect, it } from "vitest";

const seams = import.meta.glob<string>(
  [
    "../src/view/world/part.ts",
    "../src/view/world/world.ts",
    "../src/view/world/projection.ts",
    "../src/view/world/objects.ts",
    "../src/view/world/layers.ts",
    "../src/view/iconnames.ts",
    "../src/view/colors.ts",
  ],
  { query: "?raw", import: "default", eager: true },
);

describe("шви нової графіки", () => {
  it("без Phaser", () => {
    expect(Object.keys(seams)).toHaveLength(7);
    for (const [file, source] of Object.entries(seams)) {
      expect(source, file).not.toMatch(/from\s+["']phaser["']/);
    }
  });
});
