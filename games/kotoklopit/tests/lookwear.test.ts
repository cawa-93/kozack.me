// Гардероб персонажа (§5.1, `WARDROBE.md`): реєстри варіантів і вигляд, як його вдягнено (`wearOf`). Нові поля `Look`
// необов'язкові: старий вигляд без них — той самий вигляд, а з самими нулями редактор і «Випадково» — як до гардеробу.

import { describe, expect, it } from "vitest";

import { DEFAULT_LOOK } from "../src/sim/game";
import type { Look } from "../src/sim/types";
import { LOOK_OFF, LOOK_OPTIONS, LOOK_PAGE, LOOK_TABS, lookRng, pickChoice, randomLook, rowChoices, shownRow } from "../src/ui/look";
import { createRng } from "../src/sim/rng";
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

  it("не число — 0, поза реєстром — по колу, як завжди було з кольорами й формами", () => {
    const wear = wearOf({ ...OLD, face: FACES.length + 1, hair: -1, topCut: TOP_CUTS.length, shoeCut: Number.NaN, topPattern: PATTERNS.length + 0.5 });
    expect([wear.face, wear.hair, wear.topCut, wear.shoeCut, wear.topPattern]).toEqual([1, HAIR_STYLES.length - 1, 0, 0, 0]);
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

describe("ряди редактора: що доступне за вигляду", () => {
  it("кожен ряд пропонує лише варіанти свого реєстру, і серед них — те, що вдягнено", () => {
    for (const look of [DEFAULT_LOOK, OLD, ...Array.from({ length: 40 }, (_, seed) => randomLook(lookRng(seed)))]) {
      const wear = wearOf(look);
      for (const row of LOOK_OPTIONS) {
        const choices = rowChoices(row, wear);
        expect(choices, row.key).toContain(wear[row.key]);
        for (const i of choices) expect(row.options[i], `${row.key} ${i}`).toBeDefined();
      }
    }
  });

  it("акцент — лише в зачіски з маскою, низ — неактивний під верхом із власним низом", () => {
    const accent = LOOK_OPTIONS.find((row) => row.key === "hairAccent")!;
    for (let hair = 0; hair < HAIR_STYLES.length; hair++) {
      expect(accent.off?.(wearOf({ ...OLD, hair })) ?? null).toBe(HAIR_STYLES[hair]?.accent ? null : LOOK_OFF.accent);
    }
    for (const key of ["bottomCut", "bottom", "bottomPattern"] as const) {
      const row = LOOK_OPTIONS.find((r) => r.key === key)!;
      for (let topCut = 0; topCut < TOP_CUTS.length; topCut++) {
        const wear = wearOf({ ...OLD, topCut });
        expect(row.off?.(wear) ?? null, `${key}, верх ${topCut}`).toBe(wear.suit ? LOOK_OFF.suit : null);
      }
    }
  });

  it("«Випадково» не бере недоступного: вигляд, як його вдягнено, — той самий, що обрано", () => {
    for (let seed = 0; seed < 300; seed++) {
      const look = randomLook(lookRng(seed));
      const wear = wearOf(look);
      for (const row of LOOK_OPTIONS) if (!row.off?.(wear)) expect(look[row.key], `seed ${seed}: ${row.key}`).toBe(wear[row.key]);
    }
  });

  it("ваги (за номером варіанта): нульова ніколи, однакові серед доступних — той самий кидок, що й без ваг", () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) expect(pickChoice(rng, [0, 1, 2], [1, 0, 3])).not.toBe(1);
    const a = createRng(9);
    const b = createRng(9);
    for (let i = 0; i < 50; i++) expect(pickChoice(a, [0, 2, 5], [2, 9, 2, 9, 9, 2])).toBe([0, 2, 5][b.int(0, 2)]);
    const counts = [0, 0];
    const c = createRng(11);
    for (let i = 0; i < 4000; i++) counts[pickChoice(c, [0, 1], [1, 3])]!++;
    expect(counts[1]! / 4000).toBeGreaterThan(0.7);
    expect(counts[1]! / 4000).toBeLessThan(0.8);
  });

  it("вкладки: кожен ряд — на своїй, підписи різні й без вкладок, і на вкладці; на вкладці — не більше двох рядів сітки", () => {
    expect(LOOK_PAGE).toBe(9);
    expect(new Set(LOOK_OPTIONS.map((row) => row.label)).size).toBe(LOOK_OPTIONS.length);
    for (const tab of Object.keys(LOOK_TABS)) {
      const rows = LOOK_OPTIONS.filter((row) => row.tab === tab);
      expect(rows.length, tab).toBeGreaterThan(0);
      expect(rows.length, tab).toBeLessThanOrEqual(6);
      expect(new Set(rows.map((row) => row.short)).size, tab).toBe(rows.length);
    }
  });
});
