// Псування страви (§8.7): готова страва й мамин судочок поза холодильником за `SPOIL_MINUTES` від готовності псуються; зіпсовану
// не їдять ні персонаж, ні коти — її лише викидають. Сира порція не псується, а сама собою страва нікуди не зникає.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { tickCats } from "../src/sim/catai";
import { COOK_MINUTES, EAT_MINUTES, SPOIL_MINUTES } from "../src/sim/config";
import { addSupply } from "../src/sim/economy";
import { advance, deserialize, goToSleep, newGame, serialize } from "../src/sim/game";
import { objectById } from "../src/sim/home";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { canGoToSleep, hoursUntilWake } from "../src/sim/sleep";
import { targetOf } from "../src/sim/targets";
import { absoluteMinute } from "../src/sim/time";
import type { Dish, GameState, Save } from "../src/sim/types";
import { group } from "../src/audio/sfx/groups/home";
import { soundPoint } from "../src/audio/sfx/place";
import { ICON_NAMES } from "../src/view/iconnames";
import { itemIcon } from "../src/view/symbols";
import { dishFrame, dishSmells } from "../src/view/iso/looks";
import { bodyMinutes, interact, recordEvents, standAt } from "./helpers";

const game = (): Save => {
  const save = newGame({ address: "she", difficulty: "normal", seed: 1 });
  save.current.modifiers.day = null;
  save.current.modifiers.week = null;
  return save;
};

const now = (state: GameState): number => absoluteMinute(state.day, state.minute);
const onTable = (save: Save): Dish | null => save.current.home.surfaces["table"] ?? null;

/** Зварити страву, як гравець: з холодильника на плиту, а готову — на стіл. */
function cookToTable(save: Save): void {
  standAt(save, "fridge");
  interact(save);
  standAt(save, "stove");
  interact(save);
  advance(save, COOK_MINUTES + 0.01);
  interact(save);
  standAt(save, "table");
  interact(save);
}

/**
 * Прожити стільки ігрових хвилин, як гравець, що лягає вчасно й не голодує: щогодини (і після ночі) — `check` з тим, скільки
 * минуло. Персонаж стоїть посеред вітальні, нічого не робить.
 */
function live(save: Save, minutes: number, check: (elapsed: number) => void = () => undefined): void {
  expect(Number.isFinite(minutes)).toBe(true);
  const start = now(save.current);
  while (now(save.current) - start < minutes) {
    const { stats } = save.current.character;
    stats.satiety = 100;
    stats.hygiene = 100;
    stats.health = 100;
    stats.sanity = 100;
    save.current.modifiers.day = null;
    if (canGoToSleep(save.current) && hoursUntilWake(save.current) <= 8) goToSleep(save);
    else advance(save, 60);
    expect(save.current.end).toBeNull();
    check(now(save.current) - start);
  }
}

/** Зварена страва на столі, що вже зіпсувалася, — як у грі, а не з підставленого стану. */
function spoiledOnTable(save: Save): void {
  cookToTable(save);
  live(save, SPOIL_MINUTES + 60);
  expect(onTable(save)?.kind).toBe("spoiled");
}

describe("псування (§8.7)", () => {
  it("готова страва на столі псується за SPOIL_MINUTES від готовності — і вдень, і вночі", () => {
    const save = game();
    cookToTable(save);
    expect(onTable(save)?.kind).toBe("meal");
    live(save, SPOIL_MINUTES + 120, (elapsed) => {
      if (Math.abs(elapsed - SPOIL_MINUTES) < 2) return;
      expect(onTable(save)?.kind, `минуло ${elapsed} хв`).toBe(elapsed < SPOIL_MINUTES ? "meal" : "spoiled");
    });
    expect(onTable(save)?.kind).toBe("spoiled");
  });

  it("мамин судочок псується, щойно його дістали з холодильника; у холодильнику — ні", () => {
    const save = game();
    addSupply(save.current, "momMeal", "cheap", 2);
    standAt(save, "fridge");
    interact(save);
    standAt(save, "table");
    interact(save);
    live(save, SPOIL_MINUTES + 60);
    expect(onTable(save)).toMatchObject({ kind: "spoiled", mom: true });
    standAt(save, "fridge");
    interact(save);
    expect(save.current.character.held).toMatchObject({ kind: "meal", mom: true });
  });

  it("сира порція не псується", () => {
    const save = game();
    standAt(save, "fridge");
    interact(save);
    standAt(save, "table");
    interact(save);
    live(save, SPOIL_MINUTES * 2);
    expect(onTable(save)?.kind).toBe("raw");
  });

  it("зіпсовану не їдять: утримання біля стола нічого не дає, а натискання бере її в руки", () => {
    const save = game();
    spoiledOnTable(save);
    standAt(save, "table");
    const satiety = (save.current.character.stats.satiety = 50);
    advance(save, bodyMinutes(EAT_MINUTES * 2), { move: { x: 0, y: 0 }, hold: true });
    expect(save.current.character.stats.satiety).toBeLessThanOrEqual(satiety);
    expect(onTable(save)?.kind).toBe("spoiled");
    interact(save);
    expect(save.current.character.held?.kind).toBe("spoiled");
    expect(onTable(save)).toBeNull();
  });

  it("зіпсовану лише викидають: плита, стіл, стільниця й холодильник — не ціль, смітник — так", () => {
    const save = game();
    spoiledOnTable(save);
    standAt(save, "table");
    interact(save);
    for (const id of ["stove", "table", "counter-left", "fridge"]) {
      standAt(save, id);
      expect(targetOf(save.current)?.id, id).not.toBe(id);
      interact(save);
      expect(save.current.character.held?.kind, id).toBe("spoiled");
    }
    standAt(save, "trash");
    expect(targetOf(save.current)?.id).toBe("trash");
    interact(save);
    expect(save.current.character.held).toBeNull();
  });

  it("голодний злодюжка зіпсованої не краде — ні сам, ні дійшовши до неї", () => {
    const save = game();
    spoiledOnTable(save);
    const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 30, at: { x: 13.5, y: 4.5 } });
    cat.traits = [{ group: "thief", level: 2, seen: 0, known: false }];
    cat.arrivedDay = -10;
    addCat(save.current, cat);
    const table = objectById("table");
    cat.act = { kind: "steal", target: "table", goal: { x: table.x, y: table.y }, minutes: 1, elapsed: 0 };
    const { events, stop } = recordEvents();
    for (let i = 0; i < 6 * 60; i++) {
      cat.needs.hunger = 90;
      tickCats(save.current, 1, { present: true });
      save.current.minute += 1;
    }
    stop();
    expect(events.some((e) => e.type === "stole")).toBe(false);
    expect(onTable(save)?.kind).toBe("spoiled");
  });

  it("страва з рук, коли лягають, а всі поверхні зайняті, не зникає", () => {
    const save = game();
    const { surfaces } = save.current.home;
    for (const id of Object.keys(surfaces)) surfaces[id] = { kind: "raw", quality: "cheap" };
    const dishes = (state: GameState): number =>
      Object.values(state.home.surfaces).filter((d) => d !== null).length + (state.home.stove.item ? 1 : 0) + (state.character.held ? 1 : 0);
    save.current.character.held = { kind: "meal", quality: "cheap" };
    const before = dishes(save.current);
    live(save, 24 * 60);
    expect(dishes(save.current)).toBe(before);
  });

  it("страва зі збереження, де псування ще не було, не псується одразу після завантаження, а за SPOIL_MINUTES від нього", () => {
    const save = game();
    // Так страва лежала в збереженнях випущеної версії: без жодного відліку.
    save.current.home.surfaces["table"] = { kind: "meal", quality: "cheap" };
    const loaded = deserialize(serialize(save));
    live(loaded, 60);
    expect(onTable(loaded)?.kind).toBe("meal");
    live(loaded, SPOIL_MINUTES);
    expect(onTable(loaded)?.kind).toBe("spoiled");
  });
});

describe("як видно й чути зіпсовану страву (§8.7)", () => {
  const spoiled: Dish = { kind: "spoiled", quality: "cheap" };

  it("на столі — своя тарілка, а мамин судочок — той самий; над нею запах, над свіжою — ні", () => {
    expect(dishFrame(spoiled).id).toBe("item/dish/spoiled");
    expect(dishFrame({ ...spoiled, mom: true }).id).toBe("item/dish/mom");
    expect(dishSmells(spoiled)).toBe(true);
    expect(dishSmells({ kind: "meal", quality: "cheap" })).toBe(false);
    expect(dishSmells(null)).toBe(false);
  });

  it("у руках і в баблах — своя іконка, не свіжої страви", () => {
    expect(ICON_NAMES).toContain(itemIcon(spoiled));
    expect(itemIcon(spoiled)).not.toBe(itemIcon({ kind: "meal", quality: "cheap" }));
    expect(itemIcon({ ...spoiled, mom: true })).toBe(itemIcon(spoiled));
  });

  it("над зіпсованою стравою на столі гудуть мухи", () => {
    const state = game().current;
    state.home.surfaces["table"] = spoiled;
    const flies = (group.loops?.(state) ?? []).find((loop) => loop.sound === "flies-loop");
    const at = soundPoint(state, flies?.at);
    const table = objectById("table");
    expect(at?.x).toBeGreaterThanOrEqual(table.x);
    expect(at?.x).toBeLessThanOrEqual(table.x + table.w);
  });
});
