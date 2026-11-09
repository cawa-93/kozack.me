// Пестощі двох котів одразу (§9.12, «Двох одразу»): коли уваги просять щонайменше двоє, утримання гладить двох — не більше.

import { describe, expect, it } from "vitest";

import { petDone } from "../src/sim/actions";
import { createCat } from "../src/sim/cat";
import { PET, PETTING } from "../src/sim/config";
import { advance, newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { secondToPet } from "../src/sim/petpair";
import { createRng } from "../src/sim/rng";
import type { Cat, PetActivity, Save, Vec } from "../src/sim/types";
import { isoScreenDir } from "../src/view/anim/iso";
import { catCrowds, CROWD, crowdMemory, type CrowdMember } from "../src/view/anim/pairs";
import { REACH_TURN, reachArm } from "../src/view/iso/personreach";
import { bodyMinutes, recordEvents, withCatCorner } from "./helpers";

const HOLD = { move: { x: 0, y: 0 }, hold: true } as const;

function game(): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 11 }));
  save.current.modifiers.day = null;
  save.current.day = 8;
  save.current.minute = 14 * 60;
  Object.assign(save.current.character.body, { x: 9.5, y: 8.5, facing: { x: 0, y: -1 } });
  return save;
}

/** Кіт без рис; `asks` — прийшов по ласку й просить уваги. */
function withCat(save: Save, at: Vec, asks: boolean): Cat {
  const cat = createCat(save.current, createRng(4 + save.current.cats.length), { source: "shelter", ageWeeks: 30, at });
  cat.traits = [];
  cat.arrivedDay = -10;
  addCat(save.current, cat);
  cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: asks ? 70 : 0, play: 0 };
  if (asks) cat.act = { kind: "attention", target: "character", goal: null, minutes: 30, elapsed: 0, seen: true };
  return cat;
}

/** Перед персонажем (ціль утримання) і обабіч нього. */
const FRONT = { x: 9.5, y: 7.9 };
const SIDE = { x: 10.3, y: 8.6 };
const FAR_SIDE = { x: 8.6, y: 8.9 };

function pets(save: Save): PetActivity | null {
  const activity = save.current.character.activity;
  return activity?.kind === "pet" ? activity : null;
}

describe("пестощі двох котів одразу (§9.12)", () => {
  it("двоє просять уваги — утримання гладить обох: і здоровий глузд, і увага — від кожного", () => {
    const save = game();
    const a = withCat(save, FRONT, true);
    const b = withCat(save, SIDE, true);
    const sanity = (save.current.character.stats.sanity = 40);
    advance(save, bodyMinutes(0.5), HOLD);
    const activity = pets(save);
    expect(activity?.cat).toBe(a.id);
    expect(activity?.second?.cat).toBe(b.id);
    for (let i = 0; i < 3; i++) advance(save, bodyMinutes(0.5), HOLD);
    expect(a.needs.attention).toBeLessThan(70);
    expect(b.needs.attention).toBeLessThan(70);
    expect(pets(save)?.second?.minutes).toBeGreaterThan(1.5);
    // Два коти, що хочуть уваги, — удвічі більше, ніж від одного.
    const minutes = pets(save)!.minutes;
    expect(save.current.character.stats.sanity - sanity).toBeGreaterThan(2 * PET.sanity * minutes * 0.9);
  });

  it("просить лише той, кого гладять, — другий кіт поруч, що не просить, під руку не йде", () => {
    const save = game();
    withCat(save, FRONT, true);
    withCat(save, SIDE, false);
    advance(save, bodyMinutes(0.5), HOLD);
    expect(pets(save)?.second).toBeUndefined();
  });

  it("не більше двох: з трьох, що просять, другим — найближчий", () => {
    const save = game();
    const a = withCat(save, FRONT, true);
    const near = withCat(save, SIDE, true);
    withCat(save, { x: 8.3, y: 9.2 }, true);
    const second = secondToPet(save.current, a);
    expect(second?.id).toBe(near.id);
    advance(save, bodyMinutes(0.5), HOLD);
    expect(pets(save)?.second?.cat).toBe(near.id);
  });

  it("гладять кота, що не просить, а двоє інших просять — другим іде найближчий із них", () => {
    const save = game();
    const target = withCat(save, FRONT, false);
    const asking = withCat(save, SIDE, true);
    withCat(save, FAR_SIDE, true);
    expect(secondToPet(save.current, target)?.id).toBe(asking.id);
  });

  it("далі за `PETTING.stayReach` другого не беруть", () => {
    const save = game();
    const a = withCat(save, FRONT, true);
    withCat(save, { x: 9.5 + PETTING.stayReach + 0.3, y: 8.5 }, true);
    expect(secondToPet(save.current, a)).toBeNull();
  });

  it("один пішов з-під руки — другого гладять далі; пішов зовсім — він лишається під рукою сам", () => {
    const save = game();
    const a = withCat(save, FRONT, true);
    const b = withCat(save, SIDE, true);
    advance(save, bodyMinutes(0.5), HOLD);
    const activity = pets(save)!;
    activity.left = true;
    const before = activity.second!.minutes;
    advance(save, bodyMinutes(0.5), HOLD);
    expect(pets(save)?.second?.minutes).toBeGreaterThan(before);
    expect(petDone(pets(save)!)).toBe(false);
    // Перший кіт відійшов далеко: під рукою тепер другий, і пестощі не обірвалися.
    Object.assign(a, { x: 3.5, y: 8.5 });
    advance(save, bodyMinutes(0.5), HOLD);
    expect(pets(save)?.cat).toBe(b.id);
    expect(pets(save)?.second).toBeUndefined();
  });

  it("обидва пішли з-під руки — пестощі скінчено, поки кнопку не відпустили; відпустили — рук немає", () => {
    const save = game();
    withCat(save, FRONT, true);
    withCat(save, SIDE, true);
    advance(save, bodyMinutes(0.5), HOLD);
    const activity = pets(save)!;
    activity.left = true;
    activity.second!.left = true;
    expect(petDone(activity)).toBe(true);
    advance(save, bodyMinutes(0.5), { move: { x: 0, y: 0 }, hold: false });
    expect(save.current.character.activity).toBeNull();
  });

  it("кого гладять другою рукою, той не ревнує до першого", () => {
    const save = game();
    withCat(save, FRONT, true);
    const b = withCat(save, SIDE, true);
    b.traits = [{ group: "jealousy", level: 2, seen: 0 }] as never;
    const { events, stop } = recordEvents();
    advance(save, bodyMinutes(0.5), HOLD);
    advance(save, bodyMinutes(0.5), HOLD);
    stop();
    expect(events.some((e) => e.type === "hissed" && e.cat === b.id)).toBe(false);
  });
});

describe("пестощі двох котів — вигляд (§10)", () => {
  it("двоє під руками — поруч на одному боці персонажа: обабіч дальня рука до другого не дістала б", () => {
    const person = { x: 4.5, y: 8.5 };
    const memory = crowdMemory();
    const member = (id: number, at: Vec, touched = false): CrowdMember => ({ id, at, size: 1, toPerson: true, touched });
    const left = { x: 4.3, y: 9.1 };
    const right = { x: 5.1, y: 8.4 };
    // Спершу просять обабіч персонажа, потім обох гладять.
    catCrowds([member(1, right), member(2, left)], person, () => false, new Map(), memory);
    const touched = [member(1, right, true), member(2, left, true)];
    const out = catCrowds(touched, person, () => false, new Map(), memory);
    const ps = isoScreenDir(person);
    const xs = touched.map((m) => {
      const shift = out.get(m.id) ?? { x: 0, y: 0 };
      return isoScreenDir({ x: m.at.x + shift.x, y: m.at.y + shift.y }).x - ps.x;
    });
    expect(Math.sign(xs[0]!)).toBe(Math.sign(xs[1]!));
    // Перший — на `beside`, другий — одразу за ним.
    expect(xs.map(Math.abs).sort((a, b) => a - b)).toEqual([CROWD.beside, CROWD.beside + CROWD.step].map((x) => expect.closeTo(x, 6)));
  });

  it("дальня рука повертається до другого кота й зблизька: анімація пестощів її туди не веде", () => {
    const shoulder = { x: 0, y: 0 };
    const hand = { x: 0, y: 40 };
    // Ціль ближче за `REACH_TURN.from` руки: ближня лише вкорочується, дальня — повертається цілком.
    const target = { x: 10, y: 0 };
    expect(Math.hypot(target.x, target.y) / 40).toBeLessThan(REACH_TURN.from);
    expect(reachArm(shoulder, hand, target).turn).toBeCloseTo(0, 6);
    expect(reachArm(shoulder, hand, target, true).turn).toBeCloseTo(-90, 6);
  });
});
