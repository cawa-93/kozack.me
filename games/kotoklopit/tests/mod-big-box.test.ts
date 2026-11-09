// «Велика коробка» (§4.1, `DAY_MODIFIERS.md`): коробка у вітальні лише цього дня й до ночі; коти сплять, ховаються й граються
// в ній, частка дряпання дивана йде в неї; гніздом вона не стає, а кіт, що спав у ній, уночі лишається на підлозі.

import { describe, expect, it } from "vitest";

import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { BIG_BOX_TARGET, binBigBox } from "../src/sim/bigbox";
import { createCat, idleAct } from "../src/sim/cat";
import { decide, hideSpot, startScratch, tickCats } from "../src/sim/catai";
import { MODIFIERS, PLAY_RELIEF, TOY } from "../src/sim/config";
import { goToSleep, newGame } from "../src/sim/game";
import { BIG_BOX, BIG_BOX_SCRATCH, hasBigBox, hiddenTile, isFixedSolid, isSolid, PLACES, roomAt } from "../src/sim/home";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { hasTrace } from "../src/sim/traces";
import type { Cat, Save } from "../src/sim/types";
import { BIG_BOX_FOOTPRINT, BIG_BOX_ID } from "../src/view/iso/bigboxlook";
import { catSpot, perchPlace } from "../src/view/iso/catspot";
import { hours, recordEvents, withCatCorner } from "./helpers";

function game(day: string | null = "big-box", corner = true): Save {
  const base = newGame({ address: "she", difficulty: "normal", seed: 17 });
  const save = corner ? withCatCorner(base) : base;
  save.current.modifiers.day = day;
  save.current.modifiers.week = null;
  save.current.day = 9;
  save.current.minute = hours(14);
  return save;
}

function withCat(save: Save, at = { x: 4.5, y: 8.5 }): Cat {
  const cat = createCat(save.current, createRng(save.current.cats.length + 4), { source: "shelter", ageWeeks: 30, at });
  cat.traits = [];
  cat.arrivedDay = -10;
  cat.act = idleAct(30);
  addCat(save.current, cat);
  cat.needs = { hunger: 10, thirst: 10, toilet: 10, fatigue: 10, attention: 10, play: 10 };
  return cat;
}

/** Кіт лежить у коробці: спить чи ховається. */
function inBox(cat: Cat, kind: "sleep" | "hide" = "sleep"): void {
  cat.x = BIG_BOX.x + 0.5;
  cat.y = BIG_BOX.y + 0.5;
  cat.act = { kind, target: BIG_BOX_TARGET, goal: null, minutes: 240, elapsed: 0 };
}

/** Частка рішень `pick` (за різних кидків), що ведуть у коробку. */
function boxShare(trials: number, pick: (seed: number) => string | null): number {
  let box = 0;
  for (let seed = 1; seed <= trials; seed++) if (pick(seed) === BIG_BOX_TARGET) box++;
  return box / trials;
}

describe("«Велика коробка»: де й коли (§4.1)", () => {
  it("коробка стоїть лише цього дня: персонажу заступає дорогу, а місць речей і шляхів котів не займає", () => {
    expect(hasBigBox(game(null).current)).toBe(false);
    expect(isSolid(game(null).current, BIG_BOX.x, BIG_BOX.y)).toBe(false);
    const state = game().current;
    expect(hasBigBox(state)).toBe(true);
    expect(isSolid(state, BIG_BOX.x, BIG_BOX.y)).toBe(true);
    for (const tile of [BIG_BOX, BIG_BOX_SCRATCH]) {
      expect(roomAt(tile)).toBe("living");
      expect(hiddenTile(tile.x, tile.y)).toBe(false);
      expect(isFixedSolid(tile.x, tile.y)).toBe(false);
      expect(PLACES.some((p) => p.x === tile.x && p.y === tile.y)).toBe(false);
    }
    expect(isSolid(state, BIG_BOX_SCRATCH.x, BIG_BOX_SCRATCH.y)).toBe(false);
  });

  it("уночі коробки немає, а зранку прапорець знято: наступна «Велика коробка» знову з коробкою", () => {
    const save = game();
    save.current.minute = hours(23);
    goToSleep(save);
    expect(save.current.today.bigBoxGone).toBeUndefined();
    expect(save.current.modifiers.day).not.toBe("big-box");
    expect(hasBigBox(save.current)).toBe(false);
    save.current.modifiers.day = "big-box";
    expect(hasBigBox(save.current)).toBe(true);
  });

  it("кіт, що спав у коробці, уночі спить на підлозі там само, а не в повітрі; хто ховався чи грався — вирішує заново", () => {
    const save = game();
    const sleeper = withCat(save);
    const hider = withCat(save);
    inBox(sleeper);
    hider.act = { kind: "toy", target: BIG_BOX_TARGET, goal: { ...BIG_BOX }, minutes: TOY.aloneMinutes, elapsed: 0 };
    expect(catSpot(save.current, sleeper, "sleep", null, { grate: 0 })).toMatchObject({ kind: "furniture", box: BIG_BOX_ID });
    binBigBox(save.current);
    expect(hasBigBox(save.current)).toBe(false);
    expect(save.current.modifiers.day).toBe("big-box");
    expect(sleeper.act).toMatchObject({ kind: "sleep", target: null, goal: null });
    expect({ x: sleeper.x, y: sleeper.y }).toEqual({ x: BIG_BOX.x + 0.5, y: BIG_BOX.y + 0.5 });
    expect(catSpot(save.current, sleeper, "sleep", null, { grate: 0 })).toMatchObject({ kind: "floor", lift: 0 });
    expect(hider.act).toMatchObject({ kind: "idle", target: null });
  });

  it("сценарій `scenarios/big-box.json`: коробка є, Коробочка спить у ній, Дряпка дере її збоку", () => {
    const scenario = FILE_SCENARIOS["big-box"];
    expect(scenario).toBeDefined();
    const save = applyScenario(scenario!);
    expect(hasBigBox(save.current)).toBe(true);
    const [sleeper, scratcher] = save.current.cats.slice(-3);
    const spot = catSpot(save.current, sleeper!, "sleep", null, { grate: 0 });
    expect(spot).toMatchObject({ kind: "furniture", box: BIG_BOX_ID, shadow: false });
    expect(spot.lift).toBeGreaterThan(0);
    // Кілька котів у коробці розсуває юрба на речах — у межах її сліду.
    expect(perchPlace(spot)?.area).toMatchObject(BIG_BOX_FOOTPRINT);
    expect(catSpot(save.current, scratcher!, "scratch", null, { grate: 0 }).kind).toBe("floor");
  });
});

describe("«Велика коробка»: коти в ній (§4.1, §9.12)", () => {
  it("утомлений кіт інколи лягає спати в коробку; у звичайний день — ніколи", () => {
    const share = (day: string | null): number =>
      boxShare(400, (seed) => {
        const save = game(day);
        const cat = withCat(save);
        cat.needs.fatigue = 100;
        decide(save.current, cat, createRng(seed), { present: true });
        expect(cat.act.kind).toBe("sleep");
        return cat.act.target;
      });
    expect(share("big-box")).toBeGreaterThan(0.03);
    expect(share(null)).toBe(0);
  });

  it("ховається в коробці, як у будиночку; поки в ній інший кіт — ні", () => {
    const save = game();
    const cat = withCat(save);
    expect(boxShare(400, (seed) => hideSpot(save.current, createRng(seed), cat).target)).toBeGreaterThan(0.1);
    inBox(withCat(save));
    expect(boxShare(400, (seed) => hideSpot(save.current, createRng(seed), cat).target)).toBe(0);
  });

  it("грається в ній, як з іграшкою наодинці: знімає `PLAY_RELIEF` гри", () => {
    const share = boxShare(400, (seed) => {
      const save = game();
      const cat = withCat(save);
      cat.needs.play = 100;
      decide(save.current, cat, createRng(seed), { present: false });
      return cat.act.kind === "toy" ? cat.act.target : null;
    });
    expect(share).toBeGreaterThan(0.03);

    const save = game();
    const cat = withCat(save);
    cat.x = BIG_BOX.x + 0.5;
    cat.y = BIG_BOX.y + 0.5;
    cat.needs.play = 90;
    cat.act = { kind: "toy", target: BIG_BOX_TARGET, goal: null, minutes: TOY.aloneMinutes, elapsed: 0 };
    let before = cat.needs.play;
    for (let t = 0; t < TOY.aloneMinutes + 1 && cat.act.target === BIG_BOX_TARGET; t += 0.25) {
      before = cat.needs.play;
      tickCats(save.current, 0.25, { present: false });
    }
    expect(cat.act.target).not.toBe(BIG_BOX_TARGET);
    expect(before - cat.needs.play).toBeCloseTo(PLAY_RELIEF, 0);
  });

  it("дряпання, що пішло б у диван, з часткою `MODIFIERS.bigBox.scratch` іде в коробку; у звичайний день — у диван", () => {
    const targets = (day: string | null): Map<string | null, number> => {
      const save = game(day);
      const cat = withCat(save);
      const count = new Map<string | null, number>();
      for (let seed = 1; seed <= 2000; seed++) {
        startScratch(save.current, cat, createRng(seed));
        count.set(cat.act.target, (count.get(cat.act.target) ?? 0) + 1);
      }
      return count;
    };
    expect(targets(null)).toEqual(new Map([["sofa", 2000]]));
    const box = targets("big-box");
    expect((box.get(BIG_BOX_TARGET) ?? 0) / 2000).toBeCloseTo(MODIFIERS.bigBox.scratch, 1);
    expect((box.get(BIG_BOX_TARGET) ?? 0) + (box.get("sofa") ?? 0)).toBe(2000);
  });

  it("подерта коробка — без ремонту дивана, сліду й прояву «Дряпання»: дере збоку, обличчям до неї", () => {
    const save = game();
    const body = save.current.character.body;
    body.x = 9.5;
    body.y = 9.5;
    const cat = withCat(save);
    // «Любить кігтеточку»: на очах персонажа килимок чи ящики біля входу відкрили б її, а коробка — ні.
    cat.traits = [{ group: "scratching", level: -1, seen: 0, known: false }];
    cat.x = BIG_BOX_SCRATCH.x + 0.5;
    cat.y = BIG_BOX_SCRATCH.y + 0.5;
    cat.needs.play = 60;
    cat.act = { kind: "scratch", target: BIG_BOX_TARGET, goal: { ...BIG_BOX_SCRATCH }, minutes: 1, elapsed: 0 };
    const repairs = save.current.home.repairs;
    const log = recordEvents();
    tickCats(save.current, 0.25, { present: true });
    expect(cat.act.goal).toBeNull();
    expect(cat.facing).toBe(-1);
    for (let t = 0; t < 2; t += 0.25) tickCats(save.current, 0.25, { present: true });
    log.stop();
    expect(log.events).toContainEqual({ type: "scratched", cat: cat.id, where: "big-box" });
    expect(save.current.home.repairs).toBe(repairs);
    expect(hasTrace(save.current, "sofa")).toBe(false);
    expect(cat.traits[0]?.seen).toBe(0);
  });

  it("вагітна кішка, що ввечері спала в коробці, не народжує в ній: уночі коробки вже немає, гніздо — лише будиночок", () => {
    const save = game("big-box", false);
    // Неділя: пологи — цієї ночі (§9.8).
    save.current.day = 13;
    save.current.minute = hours(23);
    const father = withCat(save, { x: 3.5, y: 8.5 });
    father.sex = "male";
    const mother = withCat(save);
    mother.sex = "female";
    mother.pregnancy = { father: father.id, due: save.current.day + 1, known: false };
    inBox(mother);
    const before = save.current.cats.length;
    goToSleep(save);
    const kittens = save.current.cats.slice(before);
    expect(kittens.length).toBeGreaterThan(0);
    for (const kitten of kittens) expect(kitten.nest).toBeUndefined();
    expect(mother.act.target).not.toBe(BIG_BOX_TARGET);
    expect(hasBigBox(save.current)).toBe(false);
  });
});
