// Опис життя з характером (§9.7): зачин за рівнем життя + зворот за найстарішою відомою рисою в тоні рівня.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { lifeLevel } from "../src/sim/farewell";
import { newGame } from "../src/sim/game";
import { createRng } from "../src/sim/rng";
import { TRAIT_GROUPS } from "../src/sim/traits";
import type { AlbumEntry, Cat, GameState, Trait } from "../src/sim/types";
import { characterTrait, farewellText, fill, fillTense, LIFE_LEVELS, LIFE_LEVELS_GIVEN, LIFE_OPENINGS, lifeText, livingCatCaption, textVariant } from "../src/texts";
import { TRAIT_LIFE_LINES } from "../src/traitlife";

function setup(): { state: GameState; cat: Cat } {
  const state = newGame({ address: "she", difficulty: "normal", seed: 3 }).current;
  const cat = createCat(state, createRng(9), { source: "shelter", ageWeeks: 4, sex: "male", name: "Бублик" });
  return { state, cat };
}

const trait = (group: string, level: Trait["level"], known: boolean): Trait => ({ group, level, seen: 0, known });
const [first, second, third] = TRAIT_GROUPS;

/** Очікуваний опис: зачин долі й рівня + зворот групи й боку для того самого рівня. */
function expected(cat: Pick<Cat, "name" | "sex">, t: Trait, mood: number, fate: "died" | "given" | "living"): string {
  const group = TRAIT_GROUPS.find((g) => g.id === t.group)!;
  const clause = TRAIT_LIFE_LINES[group.area][group.id]?.[t.level > 0 ? "plus" : "minus"][lifeLevel(mood)] ?? "";
  return fill(fillTense(`${LIFE_OPENINGS[fate][lifeLevel(mood)]}${clause}`, fate === "living"), cat.sex, { кіт: cat.name });
}

describe("опис життя з характером: риса (§9.7)", () => {
  it("найстаріша з відомих гравцеві, навіть коли раніше є невідома", () => {
    const { state } = setup();
    const traits = [trait(first!.id, 1, false), trait(second!.id, -2, true), trait(third!.id, 1, true)];
    expect(characterTrait(state, traits)).toBe(traits[1]);
  });

  it("відомих немає — найстаріша взагалі; рис немає — жодної", () => {
    const { state } = setup();
    const traits = [trait(first!.id, -1, false), trait(second!.id, 2, false)];
    expect(characterTrait(state, traits)).toBe(traits[0]);
    expect(characterTrait(state, [])).toBeNull();
  });

  it("на кожен рівень життя — свій зворот: сусідні рівні того самого характеру звучать по-різному", () => {
    const { state, cat } = setup();
    cat.traits = [trait(first!.id, 2, true)];
    const texts = [5, 15, 25, 35, 45, 55, 65, 75, 85, 95].map((mood) => lifeText(state, cat, mood, "died"));
    for (const [i, mood] of [5, 15, 25, 35, 45, 55, 65, 75, 85, 95].entries()) expect(texts[i]).toBe(expected(cat, cat.traits[0]!, mood, "died"));
    const clauses = TRAIT_LIFE_LINES[first!.area][first!.id]!.plus;
    expect(new Set(clauses).size).toBe(10);
  });

  it("зачин — на кожен рівень і кожну долю: помер, віддали, живий", () => {
    for (const fate of ["died", "given", "living"] as const) {
      expect(LIFE_OPENINGS[fate]).toHaveLength(10);
      for (const opening of LIFE_OPENINGS[fate]) expect(opening.startsWith("{кіт} "), `${fate}: ${opening}`).toBe(true);
    }
    expect(LIFE_OPENINGS.living.every((o) => o.includes("живе"))).toBe(true);
    expect(LIFE_OPENINGS.given.every((o) => o.includes("у вас"))).toBe(true);
  });
});

describe("опис життя з характером: текст", () => {
  it("кіт із рисою: зачин рівня й зворот риси, минулий час — помер, теперішній — живий", () => {
    const { state, cat } = setup();
    cat.traits = [trait(first!.id, 2, true)];
    for (const mood of [95, 55, 15]) {
      expect(lifeText(state, cat, mood, "died")).toBe(expected(cat, cat.traits[0]!, mood, "died"));
      expect(lifeText(state, cat, mood, "living")).toBe(expected(cat, cat.traits[0]!, mood, "living"));
    }
  });

  it("бік риси — свій зворот: «+» і «−» тієї самої групи", () => {
    const { state, cat } = setup();
    cat.traits = [trait(first!.id, -1, true)];
    expect(lifeText(state, cat, 80, "given")).toBe(expected(cat, cat.traits[0]!, 80, "given"));
  });

  it("кіт без рис — повний текст рівня, як раніше", () => {
    const { state, cat } = setup();
    cat.traits = [];
    const level = lifeLevel(45);
    expect(lifeText(state, cat, 45, "died")).toBe(fill(textVariant(LIFE_LEVELS[level]!.text, cat.id, 1), cat.sex, { кіт: cat.name }));
    expect(lifeText(state, cat, 45, "given")).toBe(fill(LIFE_LEVELS_GIVEN[level] ?? textVariant(LIFE_LEVELS[level]!.text, cat.id, 1), cat.sex, { кіт: cat.name }));
  });
});

describe("опис життя з характером: де показано", () => {
  const entryOf = (cat: Cat, cause: AlbumEntry["cause"], lifeMood: number): AlbumEntry => ({
    id: cat.id,
    name: cat.name,
    sex: cat.sex,
    source: cat.source,
    ageWeeks: cat.ageWeeks,
    traits: cat.traits,
    breed: cat.breed,
    genes: cat.genes,
    shape: cat.shape,
    cause,
    lifeMood,
    days: 10,
    arrivedDay: 0,
    day: 20,
  });

  it("прощання й альбом: помер — минулий, віддали — «жив у вас»", () => {
    const { state, cat } = setup();
    cat.traits = [trait(second!.id, 1, true)];
    expect(farewellText(entryOf(cat, { kind: "old" }, 92), () => "", state).life).toBe(lifeText(state, cat, 92, "died"));
    expect(farewellText(entryOf(cat, { kind: "given" }, 62), () => "", state).life).toBe(lifeText(state, cat, 62, "given"));
  });

  it("живі коти в титрах — теперішній час за настроєм життя", () => {
    const { state, cat } = setup();
    cat.traits = [trait(third!.id, -2, true)];
    cat.moodHistory = [70, 80, 90];
    expect(livingCatCaption(cat, state)).toEqual({ title: "Бублик", text: lifeText(state, cat, 80, "living") });
  });
});
