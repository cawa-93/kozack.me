// Темп тіла (§8): день коротший, але те, що тіло робить на очах у гравця, триває стільки ж реальних секунд, хоч би яким був темп дня.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import {
  BODY_PACE,
  BODY_SECONDS_PER_GAME_HOUR,
  CAT_WALK_TILES_PER_MINUTE,
  MINUTES_PER_HOUR,
  NEED_PER_HOUR,
  REAL_SECONDS_PER_GAME_HOUR,
  WALK_TILES_PER_MINUTE,
} from "../src/sim/config";
import { advance, newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { gameMinutes } from "../src/sim/time";
import type { Cat, Save } from "../src/sim/types";
import { hours, withCatCorner } from "./helpers";

const game = (): Save => {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 7 }));
  save.current.modifiers.day = null;
  save.current.modifiers.week = null;
  save.current.minute = hours(10);
  return save;
};

function cat(save: Save): Cat {
  const state = save.current;
  const made = createCat(state, createRng(state.nextId), { source: "shelter", ageWeeks: 30, at: { x: 3.5, y: 8.5 } });
  made.traits = [];
  made.arrivedDay = -10;
  addCat(state, made);
  return made;
}

/** Прожити стільки реальних секунд дрібними кроками, як кадри гри. */
function live(save: Save, seconds: number, input?: Parameters<typeof advance>[2]): void {
  const frame = 1 / 60;
  for (let t = 0; t < seconds - 1e-9; t += frame) advance(save, gameMinutes(frame), input);
}

describe("темп тіла (§8)", () => {
  it("темп тіла повільніший за темп дня, а `BODY_PACE` — їхнє відношення", () => {
    expect(BODY_SECONDS_PER_GAME_HOUR).toBeGreaterThan(REAL_SECONDS_PER_GAME_HOUR);
    expect(BODY_PACE).toBeCloseTo(BODY_SECONDS_PER_GAME_HOUR / REAL_SECONDS_PER_GAME_HOUR, 9);
  });

  it("персонаж за реальну секунду проходить стільки клітинок, скільки задає темп тіла, а не темп дня", () => {
    const save = game();
    const body = save.current.character.body;
    body.x = 2.5;
    body.y = 8.5;
    const from = body.x;
    live(save, 0.5, { move: { x: 1, y: 0 }, hold: false });
    const perSecond = (body.x - from) / 0.5;
    expect(perSecond).toBeCloseTo(WALK_TILES_PER_MINUTE / (BODY_SECONDS_PER_GAME_HOUR / MINUTES_PER_HOUR), 1);
  });

  it("дія персонажа йде в темпі тіла: душ за реальну секунду просувається, як і до скорочення дня", () => {
    const save = game();
    save.current.character.activity = { kind: "use", target: "shower", progress: 0, inside: true };
    live(save, 1.5);
    expect(save.current.character.activity?.kind).toBe("use");
    const activity = save.current.character.activity;
    if (activity?.kind !== "use") throw new Error("душ скінчився");
    expect(activity.progress).toBeCloseTo(1.5 / (BODY_SECONDS_PER_GAME_HOUR / MINUTES_PER_HOUR), 1);
  });

  it("кіт за реальну секунду проходить стільки клітинок, скільки задає темп тіла", () => {
    const save = game();
    const walker = cat(save);
    walker.needs.hunger = 0;
    walker.needs.thirst = 0;
    walker.needs.toilet = 0;
    walker.needs.attention = 0;
    walker.needs.play = 0;
    walker.needs.fatigue = 0;
    walker.act = { kind: "wander", target: null, goal: { x: 15, y: 8 }, minutes: 100, elapsed: 0 };
    const from = { x: walker.x, y: walker.y };
    live(save, 0.5);
    const perSecond = Math.hypot(walker.x - from.x, walker.y - from.y) / 0.5;
    expect(perSecond).toBeCloseTo(CAT_WALK_TILES_PER_MINUTE / (BODY_SECONDS_PER_GAME_HOUR / MINUTES_PER_HOUR), 0);
  });

  it("дія кота триває в ігрових хвилинах у `BODY_PACE` раза довше", () => {
    const save = game();
    const sitter = cat(save);
    sitter.needs.hunger = 0;
    sitter.needs.thirst = 0;
    sitter.needs.toilet = 0;
    sitter.act = { kind: "idle", target: null, goal: null, minutes: 10, elapsed: 0 };
    advance(save, 3);
    expect(sitter.act.kind).toBe("idle");
    expect(sitter.act.elapsed).toBeCloseTo(3 / BODY_PACE, 6);
    expect(sitter.act.minutes).toBeCloseTo(10 - 3 / BODY_PACE, 6);
  });

  it("сон кота йде за годинником, а не в темпі тіла", () => {
    const save = game();
    const sleeper = cat(save);
    sleeper.needs.fatigue = 100;
    sleeper.needs.hunger = 0;
    sleeper.needs.thirst = 0;
    sleeper.needs.toilet = 0;
    sleeper.act = { kind: "sleep", target: null, goal: null, minutes: 120, elapsed: 0 };
    advance(save, 6);
    expect(sleeper.act.kind).toBe("sleep");
    expect(sleeper.act.elapsed).toBeCloseTo(6, 6);
    expect(sleeper.act.minutes).toBeCloseTo(114, 6);
  });

  it("схованка кота йде за годинником: гості чи бійка не тримають його вдвічі довше за задане", () => {
    const save = game();
    const hiding = cat(save);
    hiding.needs.hunger = 0;
    hiding.needs.thirst = 0;
    hiding.needs.toilet = 0;
    hiding.act = { kind: "hide", target: null, goal: null, minutes: 60, elapsed: 0 };
    advance(save, 6);
    expect(hiding.act.kind).toBe("hide");
    expect(hiding.act.minutes).toBeCloseTo(54, 6);
  });

  it("потреби кота ростуть за годинником, а не в темпі тіла", () => {
    const save = game();
    const hungry = cat(save);
    hungry.needs.hunger = 0;
    hungry.act = { kind: "idle", target: null, goal: null, minutes: 100, elapsed: 0 };
    advance(save, hours(1));
    expect(hungry.needs.hunger).toBeGreaterThanOrEqual(NEED_PER_HOUR.hunger * 0.5);
  });
});
