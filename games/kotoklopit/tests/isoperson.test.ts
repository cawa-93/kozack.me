// Персонаж нового вигляду (крок 16, T2): правила без Phaser (`src/view/iso/personlook.ts`, `personreach.ts`) — очі засинання,
// речі в руках і кадри для них у маніфесті, гніздо кота, порядок шматків у проміжку глибини, рука, що гладить, і пір'їнка.

import { describe, expect, it } from "vitest";

import type { Item, ToyItem } from "../src/sim/types";
import { PERSON_ANIM_IDS } from "../src/view/anim/ids";
import { personAnim } from "../src/view/anim/personanim";
import { artEntry } from "../src/view/art/manifest";
import { framesOf } from "../src/view/art/types";
import { ISO_DEPTH_SLOT } from "../src/view/iso/depth";
import { cargoDepth, catSocket, EYES, eyesFrame, heldFrame, movesHead, PERSON_DEPTH } from "../src/view/iso/personlook";
import { armSegment, featherAt, FEATHER, palmAt, STROKE } from "../src/view/iso/personreach";
import { PERSON_ANIMS } from "../src/view/rig/anims/index";
import { newGame } from "../src/sim/game";

const toy = (quality: "cheap" | "premium"): ToyItem => ({ id: 1, kind: "toy", quality, x: 3, y: 9, uses: 0 });

describe("очі засинання (§8.8)", () => {
  it("розплющені, напівзаплющені (сонний увечері, виснажений), заплющені — засинаючи", () => {
    expect(eyesFrame(0)).toBeNull();
    expect(eyesFrame(EYES.half - 0.01)).toBeNull();
    expect(eyesFrame(0.25)).toBe("half");
    expect(eyesFrame(0.35)).toBe("half");
    expect(eyesFrame(EYES.closed)).toBe("closed");
    expect(eyesFrame(1)).toBe("closed");
    // Засинання 0 → 1 проходить усі три кадри по черзі.
    const seen = new Set<string>();
    for (let s = 0; s <= 1; s += 0.05) seen.add(eyesFrame(s) ?? "open");
    expect([...seen]).toEqual(["open", "half", "closed"]);
    // Кадри — з маніфесту очей.
    expect(artEntry("person/eyes")?.states).toEqual(expect.arrayContaining(["open", "half", "closed"]));
  });

  it("засинаючи (`personAnim`) — заплющені, бадьорий — розплющені", () => {
    const state = newGame({ address: "she", difficulty: "normal", seed: 1 }).current;
    expect(eyesFrame(personAnim(state, { moving: false, sleepiness: 0 }).params.eyes)).toBeNull();
    expect(eyesFrame(personAnim(state, { moving: false, sleepiness: 0.9 }).params.eyes)).toBe("closed");
  });

  it("голову хилить вигляд, лише якщо анімація засинання сама її не хилить", () => {
    expect(movesHead(PERSON_ANIMS.fallAsleep)).toBe(false);
    expect(movesHead({ duration: 100, loop: false, bones: { neck: { rot: [{ t: 0, v: 0 }, { t: 100, v: 20 }] } } })).toBe(true);
    expect(movesHead({ duration: 100, loop: false, views: { back: { bones: { head: { rot: [{ t: 0, v: 10 }] } } } } })).toBe(true);
    expect(movesHead({ duration: 100, loop: false, bones: { head: { pos: [{ t: 0, v: { x: 1, y: 0 } }] } } })).toBe(false);
  });
});

describe("речі в руках (§8.4)", () => {
  const items: Item[] = [
    { kind: "raw", quality: "cheap" },
    { kind: "raw", quality: "premium" },
    { kind: "meal", quality: "cheap" },
    { kind: "meal", quality: "premium", mom: true },
    { kind: "burnt", quality: "cheap" },
    { kind: "catfood", quality: "cheap", sterile: false },
    { kind: "catfood", quality: "premium", sterile: false },
    { kind: "catfood", quality: "cheap", sterile: true },
    { kind: "toy", toy: toy("cheap") },
    { kind: "toy", toy: toy("premium") },
  ];

  it("кожна річ — кадр, що є в маніфесті; страви й совки — у гнізді рук, вудочка — у гнізді вудочки", () => {
    for (const item of items) {
      const held = heldFrame(item);
      expect(held, JSON.stringify(item)).not.toBeNull();
      if (!held) continue;
      const entry = artEntry(held.frame.id);
      expect(entry, held.frame.id).toBeDefined();
      if (!entry) continue;
      expect(framesOf(entry).some((f) => f.state === held.frame.state), `${held.frame.id} [${held.frame.state}]`).toBe(true);
      expect(held.socket).toBe(item.kind === "toy" ? "rod" : "held");
    }
    expect(heldFrame({ kind: "meal", quality: "premium", mom: true })?.frame).toEqual({ id: "item/dish/mom", state: null });
    expect(heldFrame({ kind: "catfood", quality: "premium", sterile: true })?.frame.state).toBe("sterile");
    expect(heldFrame({ kind: "toy", toy: toy("premium") })?.frame).toEqual({ id: "item/toy/premium", state: "hand" });
  });

  it("кіт і порожні руки — нічого: кота малює частина котів", () => {
    expect(heldFrame(null)).toBeNull();
    expect(heldFrame({ kind: "cat", cat: 3 })).toBeNull();
  });

  it("кіт сидячи — на колінах, інакше — на руках", () => {
    for (const id of PERSON_ANIM_IDS) expect(catSocket(id)).toBe(id === "work" || id === "meeting" || id === "eat" ? "lap" : "arms");
  });
});

describe("глибина в проміжку персонажа", () => {
  it("тінь, кіт ззаду, персонаж, кіт спереду, запах — по черзі й у межах проміжку; кіт через `placeAbove` — перед персонажем", () => {
    const order = [PERSON_DEPTH.shadow, PERSON_DEPTH.cargoBack, PERSON_DEPTH.body, PERSON_DEPTH.cargoFront, PERSON_DEPTH.smell];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(order[0]).toBeGreaterThan(0);
    expect(order.at(-1)).toBeLessThan(ISO_DEPTH_SLOT);
    // `placeAbove("person")` — пів проміжку.
    expect(ISO_DEPTH_SLOT / 2).toBeGreaterThan(PERSON_DEPTH.body);
    expect(ISO_DEPTH_SLOT / 2).toBeLessThan(PERSON_DEPTH.smell);
    expect(cargoDepth(100, true)).toBeLessThan(100 + PERSON_DEPTH.body);
    expect(cargoDepth(100, false)).toBeGreaterThan(100 + PERSON_DEPTH.body);
  });
});

describe("рука, що гладить, і пір'їнка вудочки (§8.2)", () => {
  it("пір'їнка кружляє над головою кота, у межах розмаху", () => {
    const head = { x: 200, y: 300 };
    for (let t = 0; t < 3000; t += 37) {
      const f = featherAt(head, t);
      expect(Math.abs(f.x - head.x)).toBeLessThanOrEqual(FEATHER.swingX + 1e-9);
      expect(f.y).toBeLessThan(head.y);
      expect(head.y - FEATHER.lift - f.y).toBeLessThanOrEqual(FEATHER.swingY + 1e-9);
    }
    expect(featherAt(head, 0)).not.toEqual(featherAt(head, 400));
  });

  it("долоня ходить уздовж спинки туди-сюди, рукав закінчується перед нею", () => {
    const back = { x: 50, y: 80 };
    const xs = new Set<number>();
    for (let t = 0; t < 2000; t += 50) {
      const p = palmAt(back, t);
      expect(p.y).toBe(back.y);
      expect(Math.abs(p.x - back.x)).toBeLessThanOrEqual(STROKE.swing);
      xs.add(Math.round(p.x));
    }
    expect(xs.size).toBeGreaterThan(3);
    const { from, to } = armSegment({ x: 0, y: 0 }, { x: 30, y: 40 });
    expect(from).toEqual({ x: 0, y: 0 });
    expect(Math.hypot(to.x, to.y)).toBeLessThan(50);
    expect(Math.hypot(to.x, to.y)).toBeGreaterThan(40);
  });
});
