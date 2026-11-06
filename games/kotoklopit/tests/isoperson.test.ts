// Персонаж нового вигляду (крок 16, T2): правила без Phaser (`src/view/iso/personlook.ts`) — очі засинання й поправки вигляду,
// накладка рук, речі в руках і кадри для них у маніфесті, гніздо кота, порядок шматків у проміжку глибини й тінь.

import { describe, expect, it } from "vitest";

import type { Item, ToyItem } from "../src/sim/types";
import { PERSON_ANIM_IDS, PERSON_CONTACT_MS, PERSON_ONE_SHOT_MS } from "../src/view/anim/ids";
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
  GAIT_MIN_RATE,
  gaitRate,
  heldFrame,
  heldView,
  liftedCat,
  liftedRoot,
  liftWeights,
  movesHead,
  newPace,
  nextPace,
  PACE_TELEPORT,
  PHONE_HELD,
  shownHeld,
  OWN_ARMS,
  PERSON_DEPTH,
  personExtras,
  reachDepth,
  shadowScale,
  SHADOW_WIDTH,
  SLEEP_DROOP,
  VACUUM_HELD,
} from "../src/view/iso/personlook";
import { NO_EXTRAS } from "../src/view/iso/personmix";
import { PERSON_PICKUP_GRAB_MS, PERSON_PUTDOWN_RELEASE_MS, personGaitSpeed } from "../src/view/rig/anims/person/move";
import { PERSON_ANIMS } from "../src/view/rig/anims/index";
import { newGame } from "../src/sim/game";

const toy = (quality: "cheap" | "premium"): ToyItem => ({ id: 1, kind: "toy", quality, x: 3, y: 9, uses: 0 });

/** Стан гри: персонаж тримає вертикальний пилосос (§8.7, «Пилосос у руках»), нічим не зайнятий. */
function vacuuming() {
  const state = newGame({ address: "she", difficulty: "normal", seed: 1 }).current;
  state.home.vacuumAt = null;
  state.character.held = { kind: "vacuum", minutes: 0 };
  state.character.activity = null;
  return state;
}

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
    // Засинання N4b саме клює головою (`nod`), тож вигляд її не хилить; заглушка шва не хилила.
    expect(movesHead(PERSON_ANIMS.fallAsleep)).toBe(true);
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

  it("телефон біля вуха — лише з порожніми руками в анімації телефону: кадр стільниці A6 зі світним екраном, менший", () => {
    const phone = heldFrame(null, "phone");
    expect(phone?.socket).toBe("held");
    expect(phone?.frame).toEqual(PHONE_HELD.frame);
    expect(phone?.scale).toBeLessThan(1);
    const entry = artEntry(PHONE_HELD.frame.id);
    expect(entry && framesOf(entry).some((f) => f.state === PHONE_HELD.frame.state)).toBe(true);
    expect(heldFrame(null, "idle")).toBeNull();
    expect(heldFrame({ kind: "cat", cat: 3 }, "phone")).toBeNull();
    expect(heldFrame(items[0]!, "phone")?.frame.id).toBe("item/dish/raw");
    for (const item of items) expect(heldFrame(item)?.scale).toBe(1);
  });

  it("пилосос у руках — `item/vacuum` у гнізді `held` кадром ракурсу персонажа, накладка `holdVacuum` (§8.7)", () => {
    const state = vacuuming();
    const vacuum = heldFrame(state.character.held);
    expect(vacuum?.socket).toBe("held");
    expect(vacuum?.frame).toEqual(VACUUM_HELD.frame);
    expect(vacuum?.scale).toBe(1);
    // Кадр — з ракурсом персонажа: щітка на підлозі, а підлога попереду в ¾ спереду й ззаду на екрані різна.
    const entry = artEntry(VACUUM_HELD.frame.id);
    expect(entry?.views).toEqual(["front", "back"]);
    for (const view of ["front", "back"] as const) expect(heldView(entry?.views, view)).toBe(view);
    // Речі без ракурсів — один кадр на обидва.
    expect(heldView(artEntry("item/scoop")?.views, "back")).toBeNull();
    // Стоїть, іде, ривок, відмова — руки тримає накладка пилососа (ближня рука на ручці, щітка на підлозі).
    const still = personAnim(state, { moving: false, sleepiness: 0 });
    expect(still.anim).toBe("idle");
    expect(still.overlay).toBe("holdVacuum");
    expect(still.params.held).toBe("vacuum");
    expect(personAnim(state, { moving: true, sleepiness: 0 })).toMatchObject({ anim: "walk", overlay: "holdVacuum" });
    expect(armsOverlay("refuse", still.overlay)).toBe("holdVacuum");
    // Старої справи «пилососить» біля шафи (N4b `vacuum`) більше немає.
    expect(Object.keys(PERSON_ANIMS)).not.toContain("vacuum");
  });

  it("у разовій справі річ з'являється в руці й лишає її в мить дотику (`PERSON_CONTACT_MS`), а не з першого кадру", () => {
    const meal: Item = { kind: "meal", quality: "cheap" };
    const scoop: Item = { kind: "catfood", quality: "cheap", sterile: false };
    // Бере: до дотику рука порожня, з нього — з річчю.
    expect(shownHeld(null, meal, "take", 0)).toBeNull();
    expect(shownHeld(null, meal, "take", PERSON_CONTACT_MS.take - 1)).toBeNull();
    expect(shownHeld(null, meal, "take", PERSON_CONTACT_MS.take)).toBe(meal);
    // Кладе, викидає, насипає: до дотику річ ще в руці.
    expect(shownHeld(meal, null, "put", PERSON_CONTACT_MS.put - 1)).toBe(meal);
    expect(shownHeld(meal, null, "put", PERSON_CONTACT_MS.put)).toBeNull();
    expect(shownHeld(meal, null, "trash", PERSON_CONTACT_MS.trash - 1)).toBe(meal);
    expect(shownHeld(scoop, null, "bowl", PERSON_CONTACT_MS.bowl - 1)).toBe(scoop);
    expect(shownHeld(scoop, null, "bowl", PERSON_CONTACT_MS.bowl)).toBeNull();
    // Без разової чи в разовій без дотику — те, що в руках зараз.
    expect(shownHeld(meal, null, null, 0)).toBeNull();
    expect(shownHeld(null, meal, "trip", 0)).toBe(meal);
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

describe("кіт, якого беруть на руки й опускають, рухається з кистями (контракт N4a)", () => {
  const ms = PERSON_ONE_SHOT_MS.pickUp;

  it("який кіт: узяв на руки, опустив, зістрибнув від м'яти; інші події — ні", () => {
    expect(liftedCat({ type: "picked-up", cat: 3, offended: false })).toBe(3);
    expect(liftedCat({ type: "put-down", cat: 4 })).toBe(4);
    expect(liftedCat({ type: "catnip", cat: 5, reaction: "roll" })).toBe(5);
    expect(liftedCat({ type: "tap-opened", cat: 6 })).toBeNull();
  });

  it("бере: кіт підсувається під кисті до «підхопив» і йде вгору з руками; опускає — навпаки, і в кінці там, де стоятиме сам", () => {
    const at = (anim: "pickUp" | "putDown", t: number): { w: number; grip: number } => liftWeights(anim, t);
    expect(at("pickUp", 0)).toEqual({ w: 0, grip: 0 });
    expect(at("pickUp", PERSON_PICKUP_GRAB_MS)).toEqual({ w: 0, grip: 1 });
    expect(at("pickUp", ms)).toEqual({ w: 1, grip: 1 });
    expect(at("putDown", 0)).toEqual({ w: 1, grip: 1 });
    expect(at("putDown", PERSON_PUTDOWN_RELEASE_MS)).toEqual({ w: 0, grip: 1 });
    expect(at("putDown", ms)).toEqual({ w: 0, grip: 0 });
    // Плавно: без стрибків між сусідніми кадрами.
    for (const anim of ["pickUp", "putDown"] as const) {
      let prev = at(anim, 0);
      for (let t = 16; t <= ms; t += 16) {
        const now = at(anim, t);
        expect(Math.abs(now.w - prev.w), `${anim} @${t}`).toBeLessThan(0.15);
        expect(Math.abs(now.grip - prev.grip), `${anim} @${t}`).toBeLessThan(0.15);
        prev = now;
      }
    }
  });

  it("корінь кота: на підлозі — там, де стоїть сам, чи спинкою під кистями; у руках — у гнізді рук", () => {
    const own = { x: 100, y: 200 };
    const pet = { x: 2, y: -30 };
    const hands = { x: 150, y: 120 };
    const gripAt = { x: 130, y: 172 };
    const root = { x: 0, y: 0 };
    const ground = { x: 0, y: 0 };
    liftedRoot(own, { w: 0, grip: 0, at: gripAt }, pet, hands, root, ground);
    expect(root).toEqual(own);
    expect(ground).toEqual(own);
    liftedRoot(own, { w: 0, grip: 1, at: gripAt }, pet, hands, root, ground);
    expect({ x: root.x + pet.x, y: root.y + pet.y }).toEqual(gripAt);
    liftedRoot(own, { w: 1, grip: 1, at: gripAt }, pet, hands, root, ground);
    expect(root).toEqual(hands);
    expect(ground).toEqual({ x: gripAt.x - pet.x, y: gripAt.y - pet.y });
    liftedRoot(own, { w: 0.5, grip: 1, at: gripAt }, pet, hands, root, ground);
    expect(root.x).toBeCloseTo((gripAt.x - pet.x + hands.x) / 2);
    expect(root.y).toBeCloseTo((gripAt.y - pet.y + hands.y) / 2);
  });
});


describe("темп ходи (`gaitRate`, контракт N4a `personGaitSpeed`)", () => {
  /** Іде рівно `seconds` секунд кадрами по `frame` с зі швидкістю (`vx`, `vy`) одиниць арту за секунду. */
  function walk(vx: number, vy: number, seconds = 1, frame = 1 / 60) {
    const pace = newPace();
    let x = 100;
    let y = 50;
    nextPace(pace, x, y, 0);
    for (let t = 0; t < seconds; t += frame) {
      x += vx * frame;
      y += vy * frame;
      nextPace(pace, x, y, frame);
    }
    return pace;
  }

  it("ходою вбік екрана годинник іде швидше, ніж уздовж осі клітинки, — у такт `personGaitSpeed`; стопи не ковзають", () => {
    const side = walk(543, 0);
    const axis = walk(384, 192);
    expect(side.vx).toBeCloseTo(543, 0);
    expect(gaitRate("walk", true, side)).toBeCloseTo(personGaitSpeed("walk", 543, 0), 2);
    expect(gaitRate("walk", true, axis)).toBeCloseTo(personGaitSpeed("walk", 384, 192), 2);
    expect(gaitRate("walk", true, side) / gaitRate("walk", true, axis)).toBeCloseTo(543 / 384, 2);
    // Уздовж осі клітинки — номінальна швидкість циклу: темп ≈ 1.
    expect(gaitRate("walk", true, axis)).toBeGreaterThan(0.9);
    expect(gaitRate("walk", true, axis)).toBeLessThan(1.1);
    for (const gait of ["dash", "limp", "trudge", "dizzy"] as const) expect(gaitRate(gait, true, side)).toBeCloseTo(personGaitSpeed(gait, 543, 0), 2);
  });

  it("стоячи, у справах, оглушений на місці (кнопку руху не натиснуто) — темп 1; уперся в стіну — ноги переступають повільно", () => {
    const side = walk(362, 0);
    for (const anim of ["idle", "litter", "pet", "carry", "trip"] as const) expect(gaitRate(anim, true, side)).toBe(1);
    expect(gaitRate("dizzy", false, side)).toBe(1);
    expect(gaitRate("walk", false, side)).toBe(1);
    expect(gaitRate("walk", true, walk(0, 0))).toBe(GAIT_MIN_RATE);
  });

  it("згладжено: нерівні кадри й кроки сима не смикають темп; переставлений персонаж швидкості не змінює", () => {
    const pace = newPace();
    nextPace(pace, 0, 0, 0);
    // Сим крокує нерівно: то два кроки за кадр, то жодного — середня швидкість 300.
    let x = 0;
    const rates: number[] = [];
    for (let i = 0; i < 120; i++) {
      x += i % 2 === 0 ? 10 : 0;
      nextPace(pace, x, 0, 1 / 60);
      if (i > 60) rates.push(gaitRate("walk", true, pace));
    }
    expect(Math.max(...rates) / Math.min(...rates)).toBeLessThan(1.25);
    const before = pace.vx;
    nextPace(pace, x + PACE_TELEPORT + 1, 0, 1 / 60);
    expect(pace.vx).toBe(before);
    // Перший кадр (і після `reset`) — без минулої точки: стоїть.
    const fresh = newPace();
    nextPace(fresh, 500, 500, 1 / 60);
    expect([fresh.vx, fresh.vy]).toEqual([0, 0]);
  });
});
