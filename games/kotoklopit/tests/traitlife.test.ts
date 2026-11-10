// Звороти опису життя з характером (§9.7, `TEXTS.md`, «Опис життя з характером»): повнота й форма за розділами рис.

import { describe, expect, it } from "vitest";

import { TRAIT_GROUPS } from "../src/sim/traits";
import { fill, fillTense } from "../src/texts";
import { TRAIT_LIFE_LINES } from "../src/traitlife";
import type { LifeTone } from "../src/traitlife/types";

const AREAS = [...new Set(TRAIT_GROUPS.map((g) => g.area))];
const SIDES = ["plus", "minus"] as const;
const TONES: readonly LifeTone[] = ["happy", "ordinary", "hard"];
/** Зворот іде одразу після зачину «{кіт} прожив … життя»: кома, двокрапка, тире чи нове речення з великої. */
const START = /^(, \p{Ll}|: \p{Ll}|: [«"]|: \[| — \p{Ll}| — \[|\. \p{Lu}|\. [«"]|\. \[)/u;
const MAX = 170;

describe.each(AREAS)("звороти розділу «%s»", (area) => {
  const lines = TRAIT_LIFE_LINES[area];
  const groups = TRAIT_GROUPS.filter((g) => g.area === area);
  const all = (): { id: string; text: string }[] =>
    groups.flatMap((g) => SIDES.flatMap((side) => TONES.map((tone) => ({ id: `${g.id}.${side}.${tone}`, text: lines[g.id]?.[side]?.[tone] ?? "" }))));

  it("кожна група розділу — обидва боки й три тони, і нічого зайвого", () => {
    expect(Object.keys(lines).sort()).toEqual(groups.map((g) => g.id).sort());
    for (const { id, text } of all()) expect(text.trim(), id).not.toBe("");
  });

  it("форма: початок — розділовий знак, кінець — крапка, форми й час розкриваються, без цифр, коротко", () => {
    for (const { id, text } of all()) {
      expect(text, id).toMatch(START);
      expect(text, id).toMatch(/[.!…]$/);
      expect(text, id).not.toMatch(/\d/);
      expect(text, id).not.toMatch(/\{(?!кіт\})[^}]*\}/);
      for (const sex of ["male", "female"] as const) {
        for (const present of [false, true]) {
          const out = fill(fillTense(text, present), sex, { кіт: "Мурчик" });
          expect(out, `${id} ${sex} ${present ? "тепер" : "минуле"}`).not.toMatch(/[[\]<>|{}]/);
          expect(out.length, id).toBeLessThanOrEqual(MAX);
        }
      }
    }
  });

  it("звороти не повторюються", () => {
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
