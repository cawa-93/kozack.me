// Гліфи DOM (§11.4, крок 16, пакет T3): символ-позначка в тексті картки стає SVG-файлом пакета A12
// (`art/ui/glyph/<назва>.svg`).

import { describe, expect, it } from "vitest";

import { glyphUrl } from "../src/ui/glyphs";
import { GLYPH_ART } from "../src/view/art/manifest/a12-icons";

describe("гліфи DOM", () => {
  const symbols = Object.keys(GLYPH_ART);
  const file = (name: string): Record<string, string> => ({ [`../../art/ui/glyph/${name}.svg`]: `/assets/${name}.svg` });

  it("кожен символ — свій SVG-файл A12", () => {
    for (const symbol of symbols) {
      const name = GLYPH_ART[symbol] ?? "";
      expect(glyphUrl(symbol, file(name)), symbol).toBe(`/assets/${name}.svg`);
    }
  });

  it("файли гліфів справді є (ті, що бере гра; малий SVG Vite вбудовує адресою data:)", () => {
    for (const symbol of symbols) expect(glyphUrl(symbol), symbol).toMatch(/\.svg|^data:image\/svg/);
  });

  it("не гліф чи чужий файл — символ лишається як є", () => {
    // Чужий файл не підходить: «cat.svg» не «car.svg».
    expect(glyphUrl("🚗", file("cat"))).toBeNull();
    expect(glyphUrl("🚗", {})).toBeNull();
    expect(glyphUrl("так", file("cat"))).toBeNull();
  });
});
