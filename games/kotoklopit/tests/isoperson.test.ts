// Персонаж нового вигляду (крок 16, T2): правила без Phaser (`src/view/iso/personlook.ts`) — очі засинання й поправки вигляду,
// накладка рук, речі в руках і кадри для них у маніфесті, гніздо кота, порядок шматків у проміжку глибини й тінь.

import { describe, expect, it } from "vitest";

import type { Item, ToyItem } from "../src/sim/types";
import { PERSON_ANIM_IDS } from "../src/view/anim/ids";
import { personAnim } from "../src/view/anim/personanim";
import { artEntry } from "../src/view/art/manifest";
import { framesOf } from "../src/view/art/types";
import { ISO_DEPTH_SLOT } from "../src/view/iso/depth";
import {
  armsOverlay,
  CARGO_PIECES,
  cargoDepth,
  catSocket,
  EYES,
  eyesFrame,
  heldFrame,
  movesHead,
  OWN_ARMS,
  PERSON_DEPTH,
  personExtras,
  reachDepth,
  shadowScale,
  SHADOW_WIDTH,
  SLEEP_DROOP,
} from "../src/view/iso/personlook";
import { NO_EXTRAS } from "../src/view/iso/personmix";
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

  it("засинаючи, заплющує зовсім раніше, ніж обертається до ліжка (`SLEEP_TURN`); сонний і виснажений — напівзаплющені", () => {
    expect(EYES.closed).toBeLessThan(0.6);
    expect(EYES.closed).toBeGreaterThan(0.35);
  });

  it("поправки вигляду: ті самі входи — той самий незмінний об'єкт, без поправок — `NO_EXTRAS`", () => {
    expect(personExtras(null, false, false)).toBe(NO_EXTRAS);
    const a = personExtras("half", true, false);
    expect(personExtras("half", true, false)).toBe(a);
    expect(Object.isFrozen(a)).toBe(true);
    expect(a).toEqual({ frames: { eyes: "half" }, hidden: ["arm-near"] });
    expect(personExtras("closed", false, true)).toEqual({ frames: { eyes: "closed" }, ramp: { head: SLEEP_DROOP } });
    expect(personExtras(null, true, false)).not.toBe(a);
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

describe("накладка рук (несе річ, тримає кота)", () => {
  const cat = (): ReturnType<typeof newGame>["current"] => {
    const state = newGame({ address: "she", difficulty: "normal", seed: 1 }).current;
    state.character.held = { kind: "cat", cat: 1 };
    return state;
  };

  it("вудочка, бере й опускає кота, справи самі ведуть руки — без накладки, хоч у руках іграшка", () => {
    const state = newGame({ address: "she", difficulty: "normal", seed: 1 }).current;
    state.character.held = { kind: "toy", toy: toy("cheap") };
    const choice = personAnim(state, { moving: false, sleepiness: 0 });
    expect(choice.overlay).toBe("carry");
    expect(armsOverlay("rod", choice.overlay)).toBeNull();
    for (const id of OWN_ARMS) expect(armsOverlay(id, "holdCat")).toBeNull();
    for (const id of ["rod", "pickUp", "putDown", "take", "put", "door", "bath"] as const) expect(OWN_ARMS.has(id)).toBe(true);
  });

  it("з котом на руках разові (відмова, вкусили, спіткнувся, посковзнувся) і хода — з накладкою «тримає кота»", () => {
    const overlay = personAnim(cat(), { moving: true, sleepiness: 0 }).overlay;
    expect(overlay).toBe("holdCat");
    for (const id of ["refuse", "bitten", "trip", "slip", "walk", "dash", "idle"] as const) expect(armsOverlay(id, overlay)).toBe("holdCat");
    expect(armsOverlay("walk", null)).toBeNull();
  });
});

describe("тінь під ногами", () => {
  it("базовий масштаб кадру × статура: кадр із роздільністю 2 (базовий 0,5) не стає вдвічі більшим", () => {
    expect(shadowScale({ x: 1, y: 1 }, 1)).toEqual({ x: 1, y: 1 });
    expect(shadowScale({ x: 0.5, y: 0.5 }, 1)).toEqual({ x: 0.5, y: 0.5 });
    expect(shadowScale({ x: 0.5, y: 0.5 }, 2)).toEqual({ x: 0.5 * SHADOW_WIDTH[2], y: 0.5 });
    expect(shadowScale({ x: 0.5, y: 0.5 }, 0).x).toBeLessThan(0.5);
    const out = { x: 0, y: 0 };
    expect(shadowScale({ x: 0.5, y: 0.5 }, 1, out)).toBe(out);
  });
});

describe("глибина в проміжку персонажа", () => {
  it("рука, що гладить: над персонажем, а кіт перед ним — над котом, у верху його проміжку", () => {
    expect(reachDepth(100, null)).toBe(100 + PERSON_DEPTH.reach);
    expect(reachDepth(100, Number.NaN)).toBe(100 + PERSON_DEPTH.reach);
    // Кіт за персонажем — рука в проміжку персонажа.
    expect(reachDepth(100, 90)).toBe(100 + PERSON_DEPTH.reach);
    // Кіт перед персонажем — над котом, але нижче за наступний елемент реєстру.
    const over = reachDepth(100, 120);
    expect(over).toBeGreaterThan(120);
    expect(over).toBeLessThan(120 + ISO_DEPTH_SLOT);
  });

  it("тінь, кіт ззаду, персонаж, рука, кіт спереду, запах — по черзі й у межах проміжку; кіт через `placeAbove` — перед персонажем", () => {
    const order = [PERSON_DEPTH.shadow, PERSON_DEPTH.cargoBack, PERSON_DEPTH.body, PERSON_DEPTH.reach, PERSON_DEPTH.cargoFront, PERSON_DEPTH.smell];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(order[0]).toBeGreaterThan(0);
    expect(order.at(-1)).toBeLessThan(ISO_DEPTH_SLOT);
    // `placeAbove("person")` — пів проміжку.
    expect(ISO_DEPTH_SLOT / 2).toBeGreaterThan(PERSON_DEPTH.body);
    expect(ISO_DEPTH_SLOT / 2).toBeLessThan(PERSON_DEPTH.smell);
    expect(cargoDepth(100, true)).toBeLessThan(100 + PERSON_DEPTH.body);
    expect(cargoDepth(100, false)).toBeGreaterThan(100 + PERSON_DEPTH.body);
    // Шматки кота над його точкою (T1: до +0,003) не виходять зі свого місця: ззаду — під персонажем, спереду — під запахом.
    expect(PERSON_DEPTH.cargoBack + CARGO_PIECES).toBeLessThan(PERSON_DEPTH.body);
    expect(PERSON_DEPTH.cargoFront).toBeGreaterThan(PERSON_DEPTH.reach);
    expect(PERSON_DEPTH.cargoFront + CARGO_PIECES).toBeLessThan(PERSON_DEPTH.smell);
    expect(CARGO_PIECES).toBeGreaterThan(0.003);
  });
});
