// Звороти опису життя з характером (§9.7, `TEXTS.md`, «Опис життя з характером»): повнота й форма за розділами рис.

import { describe, expect, it } from "vitest";

import { TRAIT_GROUPS } from "../src/sim/traits";
import { fill, fillTense, LIFE_LEVELS } from "../src/texts";
import { TRAIT_LIFE_LINES } from "../src/traitlife";

const AREAS = [...new Set(TRAIT_GROUPS.map((g) => g.area))];
const SIDES = ["plus", "minus"] as const;
/** Розкритий зворот іде одразу після зачину «{кіт} прожив … життя»: кома, двокрапка, тире чи нове речення з великої. */
const START = /^(, \p{Ll}|: \p{Ll}|: [«"]| — \p{Ll}|\. \p{Lu}|\. [«"])/u;
const MAX = 170;

describe.each(AREAS)("звороти розділу «%s»", (area) => {
  const lines = TRAIT_LIFE_LINES[area];
  const groups = TRAIT_GROUPS.filter((g) => g.area === area);
  const all = (): { id: string; text: string }[] =>
    groups.flatMap((g) => SIDES.flatMap((side) => LIFE_LEVELS.map((level, i) => ({ id: `${g.id}.${side}.${i} (${level.title})`, text: lines[g.id]?.[side]?.[i] ?? "" }))));

  it("кожна група розділу — обидва боки, на кожен із десяти рівнів життя, і нічого зайвого", () => {
    expect(Object.keys(lines).sort()).toEqual(groups.map((g) => g.id).sort());
    for (const g of groups) for (const side of SIDES) expect(lines[g.id]?.[side], `${g.id}.${side}`).toHaveLength(LIFE_LEVELS.length);
    for (const { id, text } of all()) expect(text.trim(), id).not.toBe("");
  });

  it("форма: початок — розділовий знак, кінець — крапка, форми й час розкриваються, без цифр, коротко", () => {
    for (const { id, text } of all()) {
      expect(text, id).toMatch(/[.!…]$/);
      expect(text, id).not.toMatch(/\d/);
      expect(text, id).not.toMatch(/\{(?!кіт\})[^}]*\}/);
      for (const sex of ["male", "female"] as const) {
        for (const present of [false, true]) {
          const out = fill(fillTense(text, present), sex, { кіт: "Мурчик" });
          expect(out, `${id} ${sex} ${present ? "тепер" : "минуле"}`).not.toMatch(/[[\]<>|{}]/);
          expect(out, `${id} ${sex} ${present ? "тепер" : "минуле"}`).toMatch(START);
          expect(out.length, id).toBeLessThanOrEqual(MAX);
        }
      }
    }
  });

  it("звороти не повторюються: кожен рівень кожного боку — свій", () => {
    const texts = all().map((l) => l.text);
    expect(new Set(texts).size).toBe(texts.length);
  });
});

describe("час у тексті", () => {
  it("<минулий|теперішній> з формами всередині", () => {
    const text = ", і <[ніс|несла]|несе> лапку <гордо|гордо й досі>.";
    expect(fill(fillTense(text, false), "female")).toBe(", і несла лапку гордо.");
    expect(fill(fillTense(text, true), "male")).toBe(", і несе лапку гордо й досі.");
  });
});
