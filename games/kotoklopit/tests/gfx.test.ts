// Прапорець графіки (крок 16, хвиля 0): `?gfx=iso` вмикає ізометрію, `?gfx=legacy` повертає старий вигляд, і обидва
// запам'ятовуються під `kotoklopit:gfx`; без прапорця — збережене, типово — старий вигляд.

import { describe, expect, it } from "vitest";

import { chooseGfx, DEFAULT_GFX, GFX_KEY, parseGfx, type GfxStorage } from "../src/view/gfx";

function memory(items: Record<string, string> = {}): GfxStorage & { items: Record<string, string> } {
  return {
    items,
    getItem: (key) => items[key] ?? null,
    setItem: (key, value) => {
      items[key] = value;
    },
  };
}

describe("прапорець графіки", () => {
  it("розбирає лише дві назви", () => {
    expect(parseGfx("iso")).toBe("iso");
    expect(parseGfx("legacy")).toBe("legacy");
    expect(parseGfx("ISO")).toBeNull();
    expect(parseGfx("")).toBeNull();
    expect(parseGfx(null)).toBeNull();
    expect(parseGfx(undefined)).toBeNull();
  });

  it("типово — старий вигляд", () => {
    expect(DEFAULT_GFX).toBe("legacy");
    expect(chooseGfx("", memory())).toBe("legacy");
    expect(chooseGfx("", null)).toBe("legacy");
  });

  it("?gfx=iso вмикає ізометрію й запам'ятовує, наступна сторінка без прапорця — теж ізометрія", () => {
    const storage = memory();
    expect(chooseGfx("?gfx=iso", storage)).toBe("iso");
    expect(storage.items[GFX_KEY]).toBe("iso");
    expect(chooseGfx("", storage)).toBe("iso");
    expect(chooseGfx("?scenario=boxes", storage)).toBe("iso");
  });

  it("?gfx=legacy повертає старий вигляд і теж запам'ятовується", () => {
    const storage = memory({ [GFX_KEY]: "iso" });
    expect(chooseGfx("?scenario=boxes&gfx=legacy", storage)).toBe("legacy");
    expect(storage.items[GFX_KEY]).toBe("legacy");
    expect(chooseGfx("", storage)).toBe("legacy");
  });

  it("незнайоме слово не рахується й не перезаписує вибір", () => {
    const storage = memory({ [GFX_KEY]: "iso" });
    expect(chooseGfx("?gfx=3d", storage)).toBe("iso");
    expect(storage.items[GFX_KEY]).toBe("iso");
    expect(chooseGfx("", memory({ [GFX_KEY]: "щось" }))).toBe("legacy");
  });

  it("сховище, що кидає помилку, гри не ламає", () => {
    const broken: GfxStorage = {
      getItem: () => {
        throw new Error("приватний режим");
      },
      setItem: () => {
        throw new Error("приватний режим");
      },
    };
    expect(chooseGfx("?gfx=iso", broken)).toBe("iso");
    expect(chooseGfx("", broken)).toBe("legacy");
  });
});
