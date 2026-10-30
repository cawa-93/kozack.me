// Гліфи DOM (§11.4, крок 16, пакет T3): у старому вигляді — малюнок кодом, як і був; у новому — SVG-файл пакета A12
// (`art/ui/glyph/<назва>.svg`), коли він є, інакше той самий малюнок кодом; «❓» стає гліфом лише в новому вигляді.

import { describe, expect, it } from "vitest";

import { glyphLook } from "../src/ui/glyphs";
import { GLYPH_ART } from "../src/view/art/manifest/a12-icons";

describe("гліфи DOM", () => {
  const symbols = Object.keys(GLYPH_ART).filter((s) => s !== "❓");
  const file = (name: string): Record<string, string> => ({ [`../../art/ui/glyph/${name}.svg`]: `/assets/${name}.svg` });

  it("старий вигляд — малюнок кодом, як і був; «❓» лишається символом", () => {
    for (const symbol of symbols) expect(glyphLook(symbol, false, {}), symbol).toHaveProperty("svg");
    for (const symbol of symbols) expect(glyphLook(symbol, false, file(GLYPH_ART[symbol] ?? "")), symbol).toHaveProperty("svg");
    expect(glyphLook("❓", false, file("question"))).toBeNull();
    expect(glyphLook("так", false, {})).toBeNull();
  });

  it("новий вигляд — SVG-файл A12, коли він є, інакше малюнок кодом; «❓» — теж гліф", () => {
    for (const symbol of [...symbols, "❓"]) {
      const name = GLYPH_ART[symbol] ?? "";
      expect(glyphLook(symbol, true, file(name)), symbol).toEqual({ img: `/assets/${name}.svg` });
      expect(glyphLook(symbol, true, {}), symbol).toHaveProperty("svg");
    }
    // Чужий файл не підходить: «cat.svg» не «car.svg».
    expect(glyphLook("🚗", true, file("cat"))).toHaveProperty("svg");
    expect(glyphLook("так", true, file("cat"))).toBeNull();
  });
});
