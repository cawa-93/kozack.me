// Пластир і бинт біля умивальника (§6.5): здоров'я одразу, бинт ще й знімає травму; порядок дій і відмови.

import { afterEach, describe, expect, it } from "vitest";

import { DRESSING, STAT_MAX } from "../src/sim/config";
import type { GameEvent } from "../src/sim/events";
import { newGame } from "../src/sim/game";
import { fallIllPerson, isIll } from "../src/sim/illness";
import type { Save } from "../src/sim/types";
import { interact, recordEvents, standAt } from "./helpers";

const game = (): Save => newGame({ address: "she", difficulty: "normal", seed: 5 });

let stop: (() => void) | null = null;
afterEach(() => stop?.());

/** Персонаж біля умивальника з таким запасом перев'язок і здоров'ям; події — з цієї миті. */
function atSink(dressing: { cheap: number; premium: number }, health: number): { save: Save; events: GameEvent[] } {
  const save = game();
  save.current.home.supplies.dressing = { ...dressing };
  save.current.character.stats.health = health;
  standAt(save, "sink");
  const recorder = recordEvents();
  stop = recorder.stop;
  return { save, events: recorder.events };
}

const refusals = (events: GameEvent[]) => events.filter((e) => e.type === "refused");

describe("пластир і бинт (§6.5)", () => {
  it("пластир одразу додає здоров'я, бинт — більше", () => {
    expect(DRESSING.health.premium).toBeGreaterThan(DRESSING.health.cheap);
    const plaster = atSink({ cheap: 1, premium: 0 }, 50);
    interact(plaster.save);
    expect(plaster.save.current.character.stats.health).toBe(50 + DRESSING.health.cheap);
    expect(plaster.save.current.home.supplies.dressing.cheap).toBe(0);
    expect(plaster.events).toContainEqual({ type: "person-dressing", quality: "cheap", cured: false });

    const bandage = atSink({ cheap: 0, premium: 1 }, 50);
    interact(bandage.save);
    expect(bandage.save.current.character.stats.health).toBe(50 + DRESSING.health.premium);
  });

  it("здоров'я не вище верху шкали", () => {
    const { save } = atSink({ cheap: 0, premium: 1 }, STAT_MAX - 1);
    interact(save);
    expect(save.current.character.stats.health).toBe(STAT_MAX);
  });

  it("бинт одразу знімає травму, а з нею — кульгання й заборону ривка", () => {
    const { save, events } = atSink({ cheap: 3, premium: 1 }, 70);
    fallIllPerson(save.current, "injury");
    interact(save);
    expect(isIll(save.current, "injury")).toBe(false);
    // З травмою береться бинт, хоч пластирі є.
    expect(save.current.home.supplies.dressing).toEqual({ cheap: 3, premium: 0 });
    expect(events).toContainEqual({ type: "person-cured", illness: "injury" });
    expect(events).toContainEqual({ type: "person-dressing", quality: "premium", cured: true });
  });

  it("пластир травму не знімає", () => {
    const { save } = atSink({ cheap: 1, premium: 0 }, 70);
    fallIllPerson(save.current, "injury");
    interact(save);
    expect(save.current.home.supplies.dressing.cheap).toBe(0);
    expect(isIll(save.current, "injury")).toBe(true);
  });

  it("бинт знімає травму й за повного здоров'я", () => {
    const { save } = atSink({ cheap: 0, premium: 1 }, STAT_MAX);
    fallIllPerson(save.current, "injury");
    interact(save);
    expect(isIll(save.current, "injury")).toBe(false);
  });

  it("без травми спершу пластир — бинт лишається на травму", () => {
    const { save } = atSink({ cheap: 1, premium: 1 }, 60);
    interact(save);
    expect(save.current.home.supplies.dressing).toEqual({ cheap: 0, premium: 1 });
    interact(save);
    expect(save.current.home.supplies.dressing).toEqual({ cheap: 0, premium: 0 });
  });

  it("бинт від травми — раніше за ліки; ліки — раніше за пластир", () => {
    const injured = atSink({ cheap: 1, premium: 1 }, 60);
    injured.save.current.home.supplies.humanMeds = { cheap: 0, premium: 5 };
    fallIllPerson(injured.save.current, "injury");
    interact(injured.save);
    expect(injured.save.current.home.supplies.humanMeds.premium).toBe(5);
    expect(injured.save.current.home.supplies.dressing.premium).toBe(0);

    const cold = atSink({ cheap: 1, premium: 1 }, 60);
    cold.save.current.home.supplies.humanMeds = { cheap: 0, premium: 5 };
    fallIllPerson(cold.save.current, "cold");
    interact(cold.save);
    expect(cold.save.current.home.supplies.humanMeds.premium).toBe(4);
    expect(cold.save.current.home.supplies.dressing).toEqual({ cheap: 1, premium: 1 });
    // Дозу на сьогодні випито — наступне натискання перев'язує.
    interact(cold.save);
    expect(cold.save.current.home.supplies.dressing).toEqual({ cheap: 0, premium: 1 });
  });

  it("за повного здоров'я без травми перев'язку не марнують — «лікувати нічого»", () => {
    const { save, events } = atSink({ cheap: 2, premium: 2 }, STAT_MAX);
    interact(save);
    expect(save.current.home.supplies.dressing).toEqual({ cheap: 2, premium: 2 });
    expect(refusals(events)).toMatchObject([{ reason: "healthy" }]);
  });

  it("здоров'я неповне, а перев'язок немає — відмова «перев'язки скінчилися»", () => {
    const { save, events } = atSink({ cheap: 0, premium: 0 }, 80);
    interact(save);
    expect(refusals(events)).toMatchObject([{ reason: "empty", product: "dressing" }]);
  });

  it("відмови за першою причиною: ліки потрібні, а їх немає; дозу вже випито", () => {
    const noMeds = atSink({ cheap: 0, premium: 0 }, 80);
    fallIllPerson(noMeds.save.current, "cold");
    interact(noMeds.save);
    expect(refusals(noMeds.events)).toMatchObject([{ reason: "empty", product: "humanMeds" }]);

    const dosed = atSink({ cheap: 0, premium: 0 }, 80);
    dosed.save.current.home.supplies.humanMeds = { cheap: 0, premium: 5 };
    fallIllPerson(dosed.save.current, "cold");
    interact(dosed.save);
    interact(dosed.save);
    expect(refusals(dosed.events)).toMatchObject([{ reason: "dose-taken" }]);
  });

  it("ліміту на день немає: кожне натискання — нова перев'язка", () => {
    const { save } = atSink({ cheap: 3, premium: 0 }, 50);
    for (let i = 0; i < 3; i++) interact(save);
    expect(save.current.character.stats.health).toBe(50 + 3 * DRESSING.health.cheap);
    expect(save.current.home.supplies.dressing.cheap).toBe(0);
  });
});
