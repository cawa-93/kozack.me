// Гардероб персонажа (§5.1, `WARDROBE.md`): реєстри варіантів і вигляд, як його вдягнено (`wearOf`). Нові поля `Look`
// необов'язкові: старий вигляд без них — той самий вигляд, а з самими нулями редактор і «Випадково» — як до гардеробу.

import { describe, expect, it } from "vitest";

import { DEFAULT_LOOK } from "../src/sim/game";
import type { Look } from "../src/sim/types";
import { LOOK_OPTIONS, lookRng, randomLook, shownRow } from "../src/ui/look";
import { HAIR_ACCENTS } from "../src/view/wardrobe/accents";
import { BUILDS, FACES, IRIS_COLORS, SKIN_TONES } from "../src/view/wardrobe/body";
import { BOTTOM_CUTS } from "../src/view/wardrobe/bottoms";
import { BOTTOM_COLORS, SHOE_COLORS, TOP_COLORS } from "../src/view/wardrobe/clothes";
import { HAIR_COLORS, HAIR_STYLES } from "../src/view/wardrobe/hair";
import { LOOK_KEYS, sameLook, wearOf } from "../src/view/wardrobe/index";
import { PATTERNS, patternFits } from "../src/view/wardrobe/patterns";
import { SHOE_CUTS } from "../src/view/wardrobe/shoes";
import { TOP_CUTS } from "../src/view/wardrobe/tops";
import type { WardrobeEntry } from "../src/view/wardrobe/types";

/** Вигляд зі збереження до гардеробу: лише дев'ять старих полів. */
const OLD: Look = { face: 2, skin: 4, hair: 3, hairColor: 5, eyes: 3, build: 2, top: 6, bottom: 6, shoes: 6 };

const REGISTRIES: Readonly<Record<string, readonly WardrobeEntry[]>> = {
  FACES,
  BUILDS,
  SKIN_TONES,
  IRIS_COLORS,
  HAIR_STYLES,
  HAIR_COLORS,
  HAIR_ACCENTS,
  TOP_CUTS,
  BOTTOM_CUTS,
  SHOE_CUTS,
  PATTERNS,
  TOP_COLORS,
  BOTTOM_COLORS,
  SHOE_COLORS,
};

describe("реєстри гардеробу", () => {
  it("кожен має варіант 0, назви різні й не порожні, ваги — невід'ємні", () => {
    for (const [name, entries] of Object.entries(REGISTRIES)) {
      expect(entries.length, name).toBeGreaterThan(0);
      expect(new Set(entries.map((e) => e.name)).size, name).toBe(entries.length);
      for (const e of entries) {
        expect(e.name.trim().length, name).toBeGreaterThan(0);
        expect(e.weight ?? 1, `${name}: ${e.name}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("варіант 0 — нинішній вигляд: лонгслів, класичні штани, кросівки, однотонний, без акценту, чотири зачіски", () => {
    expect(TOP_CUTS[0]).toEqual({ name: "лонгслів", group: "повсякденне" });
    expect(BOTTOM_CUTS[0]).toEqual({ name: "класичні штани", group: "довгі штани" });
    expect(SHOE_CUTS[0]).toEqual({ name: "кросівки" });
    expect(PATTERNS[0]).toMatchObject({ name: "однотонний", tile: null });
    expect(HAIR_ACCENTS[0]).toEqual({ name: "немає", color: null });
    expect(HAIR_STYLES.slice(0, 4).map((s) => [s.name, s.back, s.front])).toEqual([
      ["коротка", "person/hair-back/0", "person/hair-front/0"],
      ["довга", "person/hair-back/1", "person/hair-front/1"],
      ["хвостик", "person/hair-back/2", "person/hair-front/2"],
      ["кучері", "person/hair-back/3", "person/hair-front/3"],
    ]);
  });

  it("верх із власним низом задає наявний фасон низу; однотонний лягає на все", () => {
    for (const cut of TOP_CUTS) if (cut.bottom !== undefined) expect(BOTTOM_CUTS[cut.bottom], cut.name).toBeDefined();
    for (let cut = 0; cut < TOP_CUTS.length; cut++) expect(patternFits(0, "top", cut)).toBe(true);
    for (let cut = 0; cut < BOTTOM_CUTS.length; cut++) expect(patternFits(0, "bottom", cut)).toBe(true);
  });
});

describe("вигляд, як його вдягнено (wearOf)", () => {
  it("старий вигляд без нових полів — у фасоні 0, однотонне, без акценту; решта — як обрано", () => {
    const wear = wearOf(OLD);
    expect(wear).toEqual({ ...OLD, topCut: 0, topPattern: 0, bottomCut: 0, bottomPattern: 0, shoeCut: 0, hairAccent: 0, suit: false });
    expect(sameLook(OLD, { ...OLD, topCut: 0, topPattern: 0, bottomCut: 0, bottomPattern: 0, shoeCut: 0, hairAccent: 0 })).toBe(true);
    expect(sameLook(OLD, { ...OLD, hair: 0 })).toBe(false);
  });

  it("за замовчуванням — усі поля, і всі нові — нулі", () => {
    expect(Object.keys(DEFAULT_LOOK).sort()).toEqual([...LOOK_KEYS].sort());
    for (const key of ["topCut", "topPattern", "bottomCut", "bottomPattern", "shoeCut", "hairAccent"] as const) expect(DEFAULT_LOOK[key], key).toBe(0);
  });

  it("зіпсоване число чи варіант поза реєстром — 0", () => {
    const wear = wearOf({ ...OLD, face: 99, hair: -1, topCut: 1.5, shoeCut: Number.NaN, topPattern: PATTERNS.length, hairAccent: 7 });
    expect([wear.face, wear.hair, wear.topCut, wear.shoeCut, wear.topPattern, wear.hairAccent]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("порівнює кожне поле: інакше нове поле не перезапекло б персонажа", () => {
    for (const key of LOOK_KEYS) expect(sameLook(DEFAULT_LOOK, { ...DEFAULT_LOOK, [key]: (DEFAULT_LOOK[key] ?? 0) + 1 }), key).toBe(false);
  });
});

describe("редактор із самими нулями гардеробу", () => {
  it("ряд з одним варіантом сховано; «Випадково» його не тягне й дає ту саму зовнішність, що до гардеробу", () => {
    for (const row of LOOK_OPTIONS) expect(shownRow(row), row.key).toBe(row.options.length > 1);
    // Ті самі seed — ті самі вигляди, що до нових рядів (знято до змін).
    const before = [
      [2, 1, 2, 0, 3, 1, 2, 3, 1],
      [1, 3, 3, 5, 1, 1, 4, 1, 1],
      [2, 2, 2, 3, 2, 2, 6, 1, 6],
      [1, 0, 0, 4, 2, 0, 6, 0, 3],
      [1, 4, 1, 5, 0, 1, 1, 2, 6],
      [0, 3, 0, 4, 1, 1, 5, 6, 6],
    ];
    // Поки треки гардеробу не додали варіантів: з ними «Випадково» тягне й нові ряди.
    if (LOOK_OPTIONS.filter(shownRow).length !== 9) return;
    before.forEach((values, seed) => {
      const look = randomLook(lookRng(seed));
      expect([look.face, look.skin, look.hair, look.hairColor, look.eyes, look.build, look.top, look.bottom, look.shoes], `seed ${seed}`).toEqual(values);
    });
  });
});
