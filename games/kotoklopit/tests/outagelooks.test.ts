// Вигляд дня відключення світла (§4.1 «Планове відключення», рішення автора 2026-11-02; пакет «Арт відключення»): які
// кадри показують плита, душ, робот-пилосос і його док, коли світла немає (`powerOut`), — і що кожен такий кадр є в
// маніфесті. Чисті функції `src/view/iso/looks.ts`; сим відключення (робот не виїжджає, холодний душ коротший) — інший пакет.

import { describe, expect, it } from "vitest";

import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { HOUSEHOLD } from "../src/sim/config";
import { powerOut } from "../src/sim/modifiers";
import type { GameState } from "../src/sim/types";
import { artEntry } from "../src/view/art/manifest";
import type { ArtId } from "../src/view/art/types";
import { dockFrame, robotFrame, showerState, stoveArtState, stoveState, type IsoFrame } from "../src/view/iso/looks";

/** Стан сценарію (свіжа копія). */
function scenario(name: string): GameState {
  const file = FILE_SCENARIOS[name];
  if (!file) throw new Error(`Немає сценарію «${name}»`);
  return applyScenario(file).current;
}

/** Той самий стан у звичайний день і в день відключення світла. */
function bothDays(name: string): { usual: GameState; outage: GameState } {
  const usual = scenario(name);
  usual.modifiers.day = null;
  const outage = scenario(name);
  outage.modifiers.day = "outage";
  expect(powerOut(usual)).toBe(false);
  expect(powerOut(outage)).toBe(true);
  return { usual, outage };
}

/** Кадр є в маніфесті: запис з таким id і стан — один з його станів. */
function expectFrame(frame: IsoFrame): void {
  const entry = artEntry(frame.id as ArtId);
  expect(entry, frame.id).toBeDefined();
  expect(entry?.states ?? [], `${frame.id}#${frame.state}`).toContain(frame.state);
}

describe("плита в день відключення (§8.7, §4.1): туристичний газовий пальник", () => {
  it("кадр плити — той самий вміст сковороди на пальнику (gas-<стан>), а stoveState лишається базовим", () => {
    const { usual, outage } = bothDays("appliances");
    const dishes: GameState["home"]["stove"][] = [
      { item: null, minutes: 0 },
      { item: { kind: "raw", quality: "cheap" }, minutes: 0 },
      { item: { kind: "raw", quality: "premium" }, minutes: 5 },
      { item: { kind: "meal", quality: "cheap" }, minutes: 40 },
      { item: { kind: "burnt", quality: "cheap" }, minutes: 90 },
    ];
    const seen = new Set<string>();
    for (const stove of dishes) {
      usual.home.stove = structuredClone(stove);
      outage.home.stove = structuredClone(stove);
      const base = stoveState(usual);
      expect(stoveState(outage), JSON.stringify(stove)).toBe(base);
      expect(stoveArtState(usual)).toBe(base);
      expect(stoveArtState(outage)).toBe(`gas-${base}`);
      expectFrame({ id: "env/stove", state: stoveArtState(usual) });
      expectFrame({ id: "env/stove", state: stoveArtState(outage) });
      seen.add(base);
    }
    // Перебрали всі стани плити: на кожен є газовий.
    expect([...seen].sort()).toEqual(["burnt", "cooking", "off", "raw", "ready"]);
  });
});

describe("душ у день відключення (§8.7, §4.1): вода холодна", () => {
  it("поки персонаж у душі, вода тече: звичайного дня — гаряча (running), у відключення — холодна (running-cold)", () => {
    const { usual, outage } = bothDays("appliances");
    for (const state of [usual, outage]) state.character.activity = { kind: "use", target: "shower", progress: 0.2, inside: true };
    expect(showerState(usual)).toBe("running");
    expect(showerState(outage)).toBe("running-cold");
    expectFrame({ id: "env/shower", state: showerState(outage) });
  });

  it("купання кота у відключення — без змін (§4.1): вода тече як завжди (running), холодна — лише душ персонажа", () => {
    const { usual, outage } = bothDays("appliances");
    for (const state of [usual, outage]) state.character.activity = { kind: "use", target: "shower", progress: 0.2, inside: true, bath: true };
    expect(showerState(usual)).toBe("running");
    expect(showerState(outage)).toBe("running");
  });

  it("без води — так само, як звичайного дня: сухо чи мокрий піддон", () => {
    const { usual, outage } = bothDays("appliances");
    usual.character.activity = null;
    outage.character.activity = null;
    expect(showerState(outage)).toBe(showerState(usual));
    expect(["dry", "wet"]).toContain(showerState(outage));
  });
});

describe("робот-пилосос і док у день відключення (§8.7, §4.1)", () => {
  it("звичайного дня — заряджається на доку й прибирає; у відключення — вимкнений (off), і на доку, і в дорозі", () => {
    const { usual, outage } = bothDays("appliances");
    for (const quality of ["cheap", "premium"] as const) {
      for (const minute of [HOUSEHOLD.robotMinute - 5, HOUSEHOLD.robotMinute + 10]) {
        usual.minute = minute;
        outage.minute = minute;
        const day = robotFrame(usual, quality);
        expect(day).toEqual({ id: `item/robot/${quality}`, state: minute < HOUSEHOLD.robotMinute ? "charging" : "cleaning" });
        const off = robotFrame(outage, quality);
        expect(off).toEqual({ id: `item/robot/${quality}`, state: "off" });
        expectFrame(day);
        expectFrame(off);
      }
    }
  });

  it("док: вогник живлення горить (on), а у відключення погас (off)", () => {
    const { usual, outage } = bothDays("appliances");
    expect(dockFrame(usual)).toEqual({ id: "item/robot-dock", state: "on" });
    expect(dockFrame(outage)).toEqual({ id: "item/robot-dock", state: "off" });
    expectFrame(dockFrame(usual));
    expectFrame(dockFrame(outage));
  });
});
