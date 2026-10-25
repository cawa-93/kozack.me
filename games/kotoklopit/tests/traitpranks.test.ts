// Етап «Новий бешкет» (§9.12 «Гра й бешкет», рішення автора 2026-10-25, `TRAITS_REVIEW.md`): групи, яких раніше в коді
// не було, — засідки, полювання, подарунки, кмітливість, лазіння й гризіння.

import { describe, expect, it } from "vitest";

import { nightlyCare } from "../src/sim/care";
import { createCat, idleAct } from "../src/sim/cat";
import { ambushWeight, rollWeight, startAmbush, tickCats } from "../src/sim/catai";
import { AMBUSH, HUNTING, PLAY_RELIEF, STUN_PAUSE_MINUTES } from "../src/sim/config";
import { advance, newGame } from "../src/sim/game";
import { AMBUSH_SPOTS, hiddenTile, isSolid, PAPER_TRAIL, roomAt, ROLL_TILE } from "../src/sim/home";
import { nightlyHousehold } from "../src/sim/household";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Cat, Save, TraitLevel } from "../src/sim/types";
import { hours, recordEvents, withCatCorner } from "./helpers";

function game(seed = 11): Save {
  const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed }));
  save.current.modifiers.day = null;
  save.current.minute = hours(12);
  Object.assign(save.current.character.body, { x: 9.5, y: 8.5 });
  return save;
}

function withCat(save: Save, traits: Record<string, TraitLevel> = {}, at = { x: 9.5, y: 7.5 }, ageWeeks = 10): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks, at });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.breed = ["mixed", "mixed"];
  cat.arrivedDay = -10;
  cat.love = 50;
  cat.act = idleAct(30);
  cat.needs = { hunger: 10, thirst: 10, toilet: 10, fatigue: 10, attention: 10, play: 10 };
  addCat(save.current, cat);
  return cat;
}

const seen = (cat: Cat, group: string): number => cat.traits.find((t) => t.group === group)?.seen ?? 0;

/** Кіт уже сидить у засідці на місці. */
function lurking(cat: Cat, spot = AMBUSH_SPOTS[0]!): void {
  cat.x = spot.x + 0.5;
  cat.y = spot.y + 0.5;
  cat.act = { kind: "ambush", target: null, goal: null, minutes: AMBUSH.minutes, elapsed: 0 };
}

describe("«Засідки» (§9.12, рішення автора 2026-10-25)", () => {
  it("місця засідки видно, і кіт може там сидіти", () => {
    for (const spot of AMBUSH_SPOTS) {
      expect(isSolid(newGame({ sex: "female", difficulty: "normal", seed: 1 }).current, spot.x, spot.y), `${spot.x},${spot.y}`).toBe(false);
      expect(hiddenTile(spot.x, spot.y), `${spot.x},${spot.y}`).toBe(false);
    }
  });

  it("вага засідки: «−» — ніколи, кіт без риси — рідко, кошеня й «+» — частіше; гра вудкою зменшує засідки", () => {
    const save = game();
    expect(ambushWeight(withCat(save, { ambush: -1 }))).toBe(0);
    expect(ambushWeight(withCat(save))).toBeCloseTo(AMBUSH.base * AMBUSH.bored);
    expect(ambushWeight(withCat(save, {}, { x: 9.5, y: 7.5 }, 1))).toBeCloseTo(AMBUSH.kitten * AMBUSH.bored);
    const ninja = withCat(save, { ambush: 2 });
    expect(ambushWeight(ninja)).toBeCloseTo(2 * AMBUSH.step * AMBUSH.bored);
    ninja.playedToday = AMBUSH.playedMinutes;
    expect(ambushWeight(ninja)).toBeCloseTo(2 * AMBUSH.step * AMBUSH.played);
    // Уранці рахунок гри вудкою починається знову.
    nightlyCare(save.current, createRng(1));
    expect(ninja.playedToday).toBeUndefined();
  });

  it("кіт іде в одне з місць засідки й чекає там до 10 хвилин", () => {
    const save = game();
    const cat = withCat(save, { ambush: 1 });
    startAmbush(cat, createRng(3));
    expect(cat.act.kind).toBe("ambush");
    expect(AMBUSH_SPOTS.some((s) => s.x === cat.act.goal?.x && s.y === cat.act.goal?.y)).toBe(true);
    expect(cat.act.minutes).toBe(AMBUSH.minutes);
  });

  it("персонаж проходить повз — кіт стрибає на ноги: оглушення, прояв «+» і кіт мчить геть", () => {
    const save = game();
    const cat = withCat(save, { ambush: 1 });
    lurking(cat);
    // Персонаж далеко: кіт у засідці на його очах — уже прояв, але без стрибка.
    Object.assign(save.current.character.body, { x: 12.5, y: 8.5 });
    tickCats(save.current, 0.1, { present: true });
    expect(cat.act.kind).toBe("ambush");
    expect(seen(cat, "ambush")).toBe(1);
    const health = save.current.character.stats.health;
    const { events, stop } = recordEvents();
    Object.assign(save.current.character.body, { x: cat.x - 0.6, y: cat.y });
    tickCats(save.current, 0.1, { present: true });
    stop();
    expect(events.some((e) => e.type === "ambushed")).toBe(true);
    expect(save.current.character.body.stun).toBeGreaterThan(0);
    expect(cat.act.kind).toBe("zoomies");
    // Прояв — раз за засідку, а «Засідник» (+1) не дряпає.
    expect(seen(cat, "ambush")).toBe(1);
    expect(save.current.character.stats.health).toBe(health);
  });

  it("«Ніндзя» (+2) ще й дряпає: здоров'я −1", () => {
    const save = game();
    const cat = withCat(save, { ambush: 2 });
    lurking(cat);
    const health = save.current.character.stats.health;
    Object.assign(save.current.character.body, { x: cat.x - 0.6, y: cat.y });
    tickCats(save.current, 0.1, { present: true });
    expect(save.current.character.stats.health).toBe(health + AMBUSH.health);
  });

  it("спільна пауза між оглушеннями: щойно оглушеного кіт не валить знову — лише відскакує", () => {
    const save = game();
    const first = withCat(save, { ambush: 1 });
    const second = withCat(save, { ambush: 1 }, { x: 4.5, y: 7.5 });
    lurking(first, AMBUSH_SPOTS[0]);
    Object.assign(save.current.character.body, { x: first.x - 0.6, y: first.y });
    tickCats(save.current, 0.1, { present: true });
    expect(save.current.character.body.stunAt).toBeDefined();
    advance(save, 1);
    lurking(second, AMBUSH_SPOTS[1]);
    const { events, stop } = recordEvents();
    Object.assign(save.current.character.body, { x: second.x + 0.6, y: second.y });
    tickCats(save.current, 0.1, { present: true });
    stop();
    expect(STUN_PAUSE_MINUTES).toBeGreaterThan(1);
    expect(second.act.kind).toBe("zoomies");
    expect(events.some((e) => e.type === "ambushed")).toBe(false);
  });

  it("з вудкою в руках кіт на ноги не кидається — з ним можна гратися, і це рахується за день", () => {
    const save = game();
    const cat = withCat(save, { ambush: 2 });
    const toy = save.current.home.items.find((i) => i.kind === "toy");
    if (toy?.kind !== "toy") throw new Error("немає іграшки");
    save.current.home.items = save.current.home.items.filter((i) => i !== toy);
    save.current.character.held = { kind: "toy", toy };
    lurking(cat);
    cat.needs.play = 90;
    Object.assign(save.current.character.body, { x: cat.x - 0.6, y: cat.y, facing: { x: 1, y: 0 } });
    tickCats(save.current, 0.1, { present: true });
    expect(cat.act.kind).toBe("ambush");
    expect(save.current.character.body.stun).toBe(0);
    for (let i = 0; i < 20; i++) advance(save, 0.25, { move: { x: 0, y: 0 }, hold: true });
    expect(cat.playedToday ?? 0).toBeGreaterThan(0);
  });
});

describe("«Мисливський інстинкт» (§9.12, рішення автора 2026-10-25)", () => {
  it("вага розмотування: «−» — ніколи, кіт без риси — 0,12, «+» — більше, кошеня — удвічі; розмотаний рулон — до ранку", () => {
    const save = game();
    expect(rollWeight(save.current, withCat(save, { hunting: -1 }))).toBe(0);
    expect(rollWeight(save.current, withCat(save))).toBeCloseTo(HUNTING.roll);
    expect(rollWeight(save.current, withCat(save, { hunting: 2 }))).toBeCloseTo(HUNTING.roll * (1 + 2 * HUNTING.rollStep));
    expect(rollWeight(save.current, withCat(save, {}, { x: 9.5, y: 7.5 }, 1))).toBeCloseTo(HUNTING.roll * HUNTING.kitten);
    save.current.home.rollDown = true;
    expect(rollWeight(save.current, withCat(save, { hunting: 2 }))).toBe(0);
    nightlyHousehold(save.current, createRng(1));
    expect(save.current.home.rollDown).toBeUndefined();
  });

  it("кіт лапає рулон у ванній і тягне стрічку у вітальню: два клапті паперу й прояв «+» раз за бешкет", () => {
    const save = game();
    // Персонаж у ванній: бачить, як кіт лапає рулон.
    Object.assign(save.current.character.body, { x: 10.5, y: 3.5 });
    const cat = withCat(save, { hunting: 1 }, { x: ROLL_TILE.x + 0.5, y: ROLL_TILE.y + 0.5 });
    cat.needs.play = 80;
    cat.act = { kind: "unroll", target: "roll", goal: null, minutes: HUNTING.pawMinutes, elapsed: 0 };
    tickCats(save.current, HUNTING.pawMinutes + 0.1, { present: true });
    expect(save.current.home.rollDown).toBe(true);
    expect(save.current.home.messes.filter((m) => m.kind === "paper")).toHaveLength(1);
    expect(cat.act.kind).toBe("wander");
    expect(cat.act.target).toBe("paper");
    expect(seen(cat, "hunting")).toBe(1);
    // Персонаж іде у вітальню слідом: кіт тягне стрічку на очах, але це той самий бешкет.
    Object.assign(save.current.character.body, { x: 10.5, y: 8.5 });
    for (let i = 0; i < 40 && cat.act.target === "paper"; i++) tickCats(save.current, 0.5, { present: true });
    const papers = save.current.home.messes.filter((m) => m.kind === "paper");
    expect(papers).toHaveLength(2);
    expect(roomAt(papers[1]!)).toBe("living");
    expect(Math.hypot(papers[1]!.x - PAPER_TRAIL.x, papers[1]!.y - PAPER_TRAIL.y)).toBeLessThan(1.5);
    expect(seen(cat, "hunting")).toBe(1);
  });

  it("гра наодинці: мисливцеві дає більше й зношує іграшку швидше, «Пацифістові» — менше", () => {
    const save = game();
    const toy = save.current.home.items.find((i) => i.kind === "toy");
    if (toy?.kind !== "toy") throw new Error("немає іграшки");
    const playAlone = (cat: Cat): { relief: number; wear: number } => {
      cat.x = toy.x;
      cat.y = toy.y;
      cat.needs.play = 100;
      const uses = toy.uses;
      cat.act = { kind: "toy", target: `item:${toy.id}`, goal: null, minutes: 0.1, elapsed: 0 };
      tickCats(save.current, 0.1, { present: false });
      return { relief: 100 - cat.needs.play, wear: toy.uses - uses };
    };
    const hunter = playAlone(withCat(save, { hunting: 2 }));
    expect(hunter.relief).toBeCloseTo(PLAY_RELIEF * (1 + 2 * HUNTING.soloStep), 0);
    expect(hunter.wear).toBeCloseTo(1 + 2 * HUNTING.wearStep);
    const pacifist = playAlone(withCat(save, { hunting: -2 }));
    expect(pacifist.relief).toBeCloseTo(PLAY_RELIEF * HUNTING.soloMin, 0);
    expect(pacifist.wear).toBe(1);
  });
});
