// Знайомство з новим котом (§9.7): кожен кіт, що вперше прийшов у дім, показує картку, звідки б він не взявся; ім'я можна змінити
// чи лишити згенероване. Портрет — частини скелета в позі «сидить».

import { describe, expect, it } from "vitest";

import { FILE_SCENARIOS } from "../src/dev/scenarios";
import { createCat, idleAct, meetCat, nextNewcomer, renameCat } from "../src/sim/cat";
import { adopt, shelterCats } from "../src/sim/destinations";
import { goHome, goToSleep, newGame } from "../src/sim/game";
import { decideFoundling } from "../src/sim/modifiers";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { startTrip } from "../src/sim/trips";
import type { Cat, Save } from "../src/sim/types";
import { artEntry } from "../src/view/art/manifest";
import { catPortraitParts, CatPoser } from "../src/view/iso/catportrait";
import { pickMove, PORTRAIT_MOVES, PORTRAIT_PAUSE, type PortraitMove } from "../src/view/iso/catportraitmoves";
import { driveSafely, hours, standAt, withCatCorner } from "./helpers";

const game = (): Save => withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 3 }));

function homeCat(save: Save, ageWeeks: number, sex: Cat["sex"] = "male"): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks, sex, at: { x: 6.5, y: 9.5 } });
  // Здоровий і вже звиклий: ніч не має забрати його раніше, ніж вона дійде до потрібного кроку.
  Object.assign(cat, { arrivedDay: -10, health: 100, act: idleAct(30), needs: { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 } });
  addCat(save.current, cat);
  return cat;
}

function sleepOn(save: Save, day: number, sanity: number): void {
  save.current.day = day;
  save.current.modifiers.day = null;
  save.current.character.stats.sanity = sanity;
  save.current.minute = hours(22);
  goToSleep(save);
}

/** Субота, притулок: перший кіт зі списку забрано. */
function adoptFirst(ageWeeks: number): { save: Save; chosen: Cat } {
  const save = game();
  save.current.day = 5;
  save.current.minute = hours(9);
  save.current.modifiers.day = null;
  save.current.character.money = 10_000;
  standAt(save, "door");
  expect(startTrip(save.current, "shelter")).toBe(true);
  driveSafely(save);
  const chosen = shelterCats(save.current)[0];
  if (!chosen) throw new Error("у притулку нікого");
  chosen.ageWeeks = ageWeeks;
  expect(adopt(save.current, chosen.id)).not.toBeNull();
  return { save, chosen };
}

describe("знайомство з новим котом (§9.7): кого показують", () => {
  it("кошеня від низького глузду", () => {
    const save = game();
    sleepOn(save, 2, 34);
    expect(nextNewcomer(save.current)?.source).toBe("shelter-forced");
  });

  it("усі кошенята виводку, а мати вже знайома", () => {
    const save = game();
    const mother = homeCat(save, 30, "female");
    mother.pregnancy = { father: null, due: 7, known: true };
    sleepOn(save, 6, 80);
    const kittens = save.current.cats.filter((c) => c.source === "born");
    expect(kittens.length).toBeGreaterThan(0);
    for (const kitten of kittens) expect(kitten.newcomer).toBe(true);
    expect(mother.newcomer).toBeUndefined();
  });

  it("знайда", () => {
    const save = game();
    save.current.today.foundling = true;
    const kitten = decideFoundling(save.current, true, createRng(2));
    expect(nextNewcomer(save.current)).toBe(kitten);
  });

  for (const [who, age] of [["кошеня", 1], ["дорослий кіт", 30]] as const) {
    it(`${who} з притулку: коли приїде додому, не раніше`, () => {
      const { save, chosen } = adoptFirst(age);
      expect(chosen.newcomer).toBe(true);
      expect(chosen.away).toBe("trip");
      expect(nextNewcomer(save.current)).toBeUndefined();
      goHome(save);
      expect(chosen.away).toBeNull();
      expect(nextNewcomer(save.current)).toBe(chosen);
    });
  }

  it("кіт, якого додали не грою (сценарій, старе збереження), картки не показує", () => {
    const save = game();
    homeCat(save, 30);
    expect(nextNewcomer(save.current)).toBeUndefined();
  });

  it("є сценарій картки", () => {
    expect(FILE_SCENARIOS["cat-intro"]?.cats?.[0]).toMatchObject({ newcomer: true });
  });
});

describe("картка кота (§9.7): ім'я", () => {
  const cat = (): Cat => homeCat(game(), 30);

  it("введене стає ім'ям, без пробілів довкола", () => {
    const who = cat();
    renameCat(who, "  Пухнастик ");
    expect(who.name).toBe("Пухнастик");
  });

  it("порожнє поле лишає те, що було", () => {
    const who = cat();
    const generated = who.name;
    renameCat(who, "   ");
    expect(who.name).toBe(generated);
  });

  it("після знайомства картка більше не з'являється, а ім'я лишається", () => {
    const save = game();
    const who = homeCat(save, 30);
    who.newcomer = true;
    renameCat(who, "Пухнастик");
    meetCat(who);
    expect(nextNewcomer(save.current)).toBeUndefined();
    expect(who.name).toBe("Пухнастик");
  });
});

describe("живий портрет кота (§9.7)", () => {
  const stateOf = (parts: ReturnType<typeof catPortraitParts>, id: string): string | null | undefined => parts.find((p) => p.id === id)?.state;

  /** Кіт із заданою послідовністю випадкових чисел: 0 — найкоротша пауза й перший рух зі списку. */
  const poser = (random: () => number = () => 0): CatPoser => new CatPoser(homeCat(game(), 30), random);

  it("у спокої кіт сидить із розплющеними очима, частини дальнього боку затінені", () => {
    const parts = catPortraitParts(homeCat(game(), 30));
    expect(parts.length).toBeGreaterThan(5);
    expect(stateOf(parts, "cat/eyes")).toBe("open");
    expect(parts.some((p) => p.far === true)).toBe(true);
  });

  it("кошеня теж складається з частин", () => {
    expect(catPortraitParts(homeCat(game(), 1)).length).toBeGreaterThan(5);
  });

  it("рухів десять, усі різні й без циклу: кіт повертається до спокою", () => {
    expect(PORTRAIT_MOVES).toHaveLength(10);
    expect(new Set(PORTRAIT_MOVES.map((m) => m.id)).size).toBe(10);
    for (const move of PORTRAIT_MOVES) expect(move.loop).toBe(false);
  });

  it("очі й рот у рухах — кадри, що справді є в арті", () => {
    const states = (id: string): readonly string[] => artEntry(id)?.states ?? [];
    for (const move of PORTRAIT_MOVES) {
      for (const key of move.slots?.eyes?.frame ?? []) expect(states("cat/eyes")).toContain(key.v);
      for (const key of move.slots?.mouth?.frame ?? []) expect(states("cat/mouth")).toContain(key.v);
    }
  });

  it("той самий рух двічі поспіль не буває", () => {
    const random = createRng(9);
    let last: PortraitMove | null = null;
    for (let i = 0; i < 300; i++) {
      const next = pickMove(() => random.next(), last);
      expect(next).not.toBe(last);
      last = next;
    }
  });

  it("усі рухи трапляються", () => {
    const random = createRng(5);
    const seen = new Set<string>();
    let last: PortraitMove | null = null;
    for (let i = 0; i < 500; i++) {
      last = pickMove(() => random.next(), last);
      seen.add(last.id);
    }
    expect(seen.size).toBe(PORTRAIT_MOVES.length);
  });

  it("спершу пауза, потім рух, потім знову пауза", () => {
    const cat = poser();
    cat.parts(0);
    expect(cat.moving).toBeNull();
    cat.parts(PORTRAIT_PAUSE.min - 1);
    expect(cat.moving).toBeNull();
    cat.parts(PORTRAIT_PAUSE.min);
    const move = cat.moving;
    expect(move).not.toBeNull();
    cat.parts(PORTRAIT_PAUSE.min + (move?.duration ?? 0));
    expect(cat.moving).toBeNull();
  });

  it("кліпання заплющує очі, а потім вони знову розплющені", () => {
    const cat = poser();
    expect(PORTRAIT_MOVES[0]?.id).toBe("blink");
    cat.parts(PORTRAIT_PAUSE.min);
    expect(stateOf(cat.parts(PORTRAIT_PAUSE.min + 50), "cat/eyes")).toBe("closed");
    expect(stateOf(cat.parts(PORTRAIT_PAUSE.min + 170), "cat/eyes")).toBe("open");
  });

  it("позіхання відкриває рот, а рух голови змінює її позу", () => {
    const yawn = PORTRAIT_MOVES.findIndex((m) => m.id === "yawn");
    // Перший кидок вибирає рух, далі паузи.
    const cat = poser(() => (yawn + 0.5) / PORTRAIT_MOVES.length);
    const rest = cat.parts(0);
    const start = 4000;
    cat.parts(start);
    expect(cat.moving?.id).toBe("yawn");
    const open = cat.parts(start + 700);
    expect(stateOf(open, "cat/mouth")).toBe("yawn");
    const head = (parts: typeof rest): number => parts.find((p) => p.id.startsWith("cat/head"))?.rot ?? 0;
    expect(head(open)).not.toBeCloseTo(head(rest), 1);
  });
});
