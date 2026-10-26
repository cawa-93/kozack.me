// Етап «Гра й стосунки котів» (§9.12 «Гра й стосунки котів», рішення автора 2026-10-25, `TRAITS_REVIEW.md`): ігривість,
// котяча м'ята, вікно, слухняність і риси між котами — як кіт грається, на що дивиться й як живе з іншими котами.

import { describe, expect, it } from "vitest";

import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { pickUpCat, playDrain } from "../src/sim/actions";
import { giveCatnip, nightlyCare } from "../src/sim/care";
import { createCat, idleAct } from "../src/sim/cat";
import { decide, forbiddenZoneAt, jealousy, noGo, noMemory, sayNo, startWindow, tickCats, windowWeight } from "../src/sim/catai";
import { CATNIP, GIFTS, GROOMING, JEALOUSY, NURTURING, OBEDIENCE, PET, PLAY, PLAYFUL, PRODUCTS, RELATIONS, SHOO, SOCIABILITY, SOFA_REPAIR, TERRITORY, WINDOW } from "../src/sim/config";
import { addSupply, place, supplyCount } from "../src/sim/economy";
import { advance, deserialize, newGame, serialize } from "../src/sim/game";
import { hiddenTile, isSolid, itemTile, MAP_HEIGHT, MAP_WIDTH, objectById, SPAWN, WINDOWS } from "../src/sim/home";
import { addCat } from "../src/sim/night";
import { isEnemy, nightlyRelations, relation } from "../src/sim/relations";
import { createRng } from "../src/sim/rng";
import { GOODS } from "../src/sim/shop";
import { absoluteMinute } from "../src/sim/time";
import type { BowlItem, Cat, LitterItem, Save, ToyItem, TraitLevel } from "../src/sim/types";
import { startWork } from "../src/sim/work";
import { careCard } from "../src/ui/cards";
import { traitAbout, traitHint } from "../src/ui/traits";
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

/** Іграшка-вудочка котячого кутка. */
function toyOf(save: Save): ToyItem {
  const toy = save.current.home.items.find((i) => i.kind === "toy");
  if (toy?.kind !== "toy") throw new Error("немає іграшки");
  return toy;
}

/** Узяти вудку й стати поруч із котом, обличчям до нього. */
function toyInHands(save: Save, cat: Cat): void {
  const toy = toyOf(save);
  save.current.home.items = save.current.home.items.filter((i) => i !== toy);
  save.current.character.held = { kind: "toy", toy };
  Object.assign(save.current.character.body, { x: cat.x - 0.5, y: cat.y, facing: { x: 1, y: 0 } });
}

/** Гратися вудкою, тримаючи кнопку, скільки хвилин; повертає, скільки тривала гра, доки кіт не награвся (0 — не награвся). */
function playFor(save: Save, minutes: number): number {
  const { events, stop } = recordEvents();
  for (let t = 0; t < minutes; t += 0.25) advance(save, 0.25, { move: { x: 0, y: 0 }, hold: true });
  stop();
  const played = events.find((e) => e.type === "played");
  return played?.type === "played" ? played.minutes : 0;
}

describe("«Ігривість» (§9.12, рішення автора 2026-10-25)", () => {
  it("гра вудкою: «+» грається довше, «−» — коротше", () => {
    const save = game();
    expect(playDrain(withCat(save))).toBeCloseTo(PLAY.needPerMinute);
    expect(playDrain(withCat(save, { playful: 2 }))).toBeCloseTo(PLAY.needPerMinute / (1 + 2 * PLAYFUL.lengthStep));
    expect(playDrain(withCat(save, { playful: -2 }))).toBeCloseTo(PLAY.needPerMinute * (1 + 2 * PLAYFUL.lengthStep));
  });

  it("сеанс «+» довший, ніж із котом без риси, — прояв «+»; «−» награється раніше й іде геть — прояв «−»", () => {
    const lengths: Record<string, number> = {};
    for (const level of [0, 2, -1] as const) {
      const save = game();
      const cat = withCat(save, level === 0 ? {} : { playful: level });
      cat.needs.play = 90;
      toyInHands(save, cat);
      lengths[level] = playFor(save, 15);
      expect(lengths[level], `рівень ${level}`).toBeGreaterThan(0);
      if (level === 2) expect(seen(cat, "playful")).toBe(1);
      if (level === -1) {
        expect(seen(cat, "playful")).toBe(1);
        // Награвшись, «−» ліниво йде геть.
        const body = save.current.character.body;
        expect(Math.hypot(cat.x - body.x, cat.y - body.y)).toBeGreaterThan(1.5);
      }
    }
    expect(lengths[2]).toBeGreaterThan(lengths[0]!);
    expect(lengths[-1]).toBeLessThan(lengths[0]!);
  });

  it("«Нудьгар» інколи відвертається від вудки — відмова зі своєю іконкою, раз за утримання", () => {
    let ignored = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const save = game(seed);
      const cat = withCat(save, { playful: -2 });
      cat.needs.play = 90;
      toyInHands(save, cat);
      const { events, stop } = recordEvents();
      playFor(save, 3);
      stop();
      const refusals = events.filter((e) => e.type === "refused" && e.reason === "cat-bored");
      expect(refusals.length).toBeLessThanOrEqual(1);
      if (refusals.length === 0) continue;
      ignored += 1;
      expect(refusals[0]).toMatchObject({ object: `cat:${cat.id}` });
      // Потреба гри лишилася: кіт не грався.
      expect(cat.needs.play).toBeGreaterThan(80);
      expect(seen(cat, "playful")).toBe(1);
    }
    expect(ignored).toBeGreaterThan(3);
    expect(ignored).toBeLessThan(20);
  });

  it("«+» кличе гратися: несе іграшку до ніг того, хто вдома й не працює; кіт без риси так не кличе", () => {
    const invites = (traits: Record<string, TraitLevel>, working = false): number => {
      let count = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const save = game(seed);
        if (working) {
          Object.assign(save.current.character.body, { x: 7.5, y: 7.5, facing: { x: 0, y: -1 } });
          startWork(save.current);
        }
        const cat = withCat(save, traits);
        cat.needs.play = 90;
        decide(save.current, cat, createRng(seed), { present: true });
        if (cat.act.kind === "carry" && cat.act.invite === true) count += 1;
      }
      return count;
    };
    expect(invites({ playful: 2 })).toBeGreaterThan(5);
    expect(invites({})).toBe(0);
    expect(invites({ playful: 2 }, true)).toBe(0);
  });

  it("поклав іграшку до ніг і чекає 10 хвилин — прояв «Ігривості +», а не «Подарунків»", () => {
    const save = game();
    const toy = toyOf(save);
    Object.assign(toy, { x: 6.5, y: 8.5 });
    const cat = withCat(save, { playful: 1, gifts: 1 }, { x: 5.5, y: 8.5 });
    cat.act = { kind: "carry", target: `item:${toy.id}`, goal: itemTile(toy), minutes: GIFTS.pickMinutes, elapsed: 0, carry: "toy", dest: "feet", invite: true };
    for (let i = 0; i < 80 && cat.act.dropped !== true; i++) tickCats(save.current, 0.25, { present: true });
    expect(cat.act.dropped).toBe(true);
    expect(cat.act.minutes).toBeGreaterThan(PLAYFUL.inviteMinutes - 1);
    expect(seen(cat, "playful")).toBe(1);
    expect(seen(cat, "gifts")).toBe(0);
    expect(cat.gift).toBeDefined();
  });
});

/** Кіт на руках біля аптечки з м'ятою в запасі. */
function catnipCat(save: Save, traits: Record<string, TraitLevel> = {}, ageWeeks = 10): Cat {
  const cat = withCat(save, traits, { x: 9.5, y: 7.5 }, ageWeeks);
  addSupply(save.current, "catnip", "cheap", 5);
  addSupply(save.current, "catnip", "premium", 5);
  pickUpCat(save.current, cat);
  return cat;
}

/** Хвилини життя котів (персонаж удома й бачить); годинник іде. */
function live(save: Save, minutes: number): void {
  for (let t = 0; t < minutes; t += 0.25) {
    save.current.minute += 0.25;
    tickCats(save.current, 0.25, { present: true });
  }
}

describe("«Котяча м'ята» (§9.12, рішення автора 2026-10-25)", () => {
  it("м'ята й мататабі — у магазині по 5 разів; у картці догляду — коли є в аптечці", () => {
    expect(GOODS.some((g) => "product" in g && g.product === "catnip")).toBe(true);
    expect(PRODUCTS.catnip.units).toEqual({ cheap: 5, premium: 5 });
    const save = game();
    const cat = catnipCat(save);
    const labels = careCard(save.current, cat, () => {}, () => {}).actions.map((a) => a.label);
    expect(labels).toContain("Мататабі ×5");
    expect(labels).toContain("Сушена м'ята ×5");
  });

  it("кіт без риси катається 5 хвилин і тішиться; «+» — довше, а тоді засинає: прояв «+»", () => {
    for (const level of [0, 2] as const) {
      const save = game();
      const cat = catnipCat(save, level === 0 ? {} : { catnip: level });
      cat.mood = 40;
      const { events, stop } = recordEvents();
      expect(giveCatnip(save.current, "cheap", createRng(1))).toBe(true);
      stop();
      expect(save.current.character.held).toBeNull();
      expect(supplyCount(save.current, "catnip")).toBe(9);
      expect(events.some((e) => e.type === "catnip" && e.reaction === "roll")).toBe(true);
      expect(cat.act.kind).toBe("catnip");
      expect(cat.act.minutes).toBe(CATNIP.rollMinutes[level]);
      expect(cat.mood).toBeGreaterThan(40);
      live(save, (CATNIP.rollMinutes[level] ?? 0) + 0.5);
      if (level > 0) expect(cat.act.kind).toBe("sleep");
      else expect(["catnip", "sleep"]).not.toContain(cat.act.kind);
      expect(seen(cat, "catnip")).toBe(level > 0 ? 1 : 0);
    }
  });

  it("«Байдужий» понюхає м'яту й іде — прояв «−»; мататабі діє на нього, як на кота без риси", () => {
    const save = game();
    const cat = catnipCat(save, { catnip: -1 });
    giveCatnip(save.current, "cheap", createRng(1));
    expect(cat.act.kind).toBe("idle");
    expect(cat.act.target).toBe("catnip");
    expect(seen(cat, "catnip")).toBe(1);
    live(save, 1);
    expect(cat.act.kind).toBe("wander");
    const other = game();
    const indifferent = catnipCat(other, { catnip: -1 });
    giveCatnip(other.current, "premium", createRng(1));
    expect(indifferent.act.kind).toBe("catnip");
    expect(indifferent.act.minutes).toBe(CATNIP.rollMinutes[0]);
  });

  it("«Шаленіє від м'яти» кусає руку, гасає, а тоді задирає кота поруч — прояв «−»", () => {
    const save = game();
    const cat = catnipCat(save, { catnip: -2 });
    const other = withCat(save, {}, { x: 10.5, y: 7.5 });
    other.act = idleAct(60);
    const health = save.current.character.stats.health;
    const { events, stop } = recordEvents();
    giveCatnip(save.current, "cheap", createRng(1));
    expect(save.current.character.stats.health).toBe(health + PET.biteHealth);
    expect(events.some((e) => e.type === "bite" && e.cat === cat.id)).toBe(true);
    expect(cat.act.kind).toBe("zoomies");
    expect(seen(cat, "catnip")).toBe(1);
    // Догасав поруч з іншим котом.
    Object.assign(cat, { x: 9.6, y: 8.4 });
    cat.act.minutes = 0.1;
    live(save, 0.5);
    stop();
    expect(events.some((e) => e.type === "hissed" && e.cat === cat.id)).toBe(true);
    expect(cat.act.kind).toBe("fight");
    expect(relation(save.current, cat, other)).toBeLessThan(0);
  });

  it("кошеня не реагує; після реакції 2 години м'ята не діє — це не прояви", () => {
    const save = game();
    const kitten = catnipCat(save, { catnip: 2 }, 1);
    giveCatnip(save.current, "cheap", createRng(1));
    expect(kitten.act.target).toBe("catnip");
    expect(seen(kitten, "catnip")).toBe(0);
    const other = game();
    const cat = catnipCat(other, { catnip: -1 });
    giveCatnip(other.current, "premium", createRng(1));
    expect(cat.act.kind).toBe("catnip");
    other.current.minute += 60;
    pickUpCat(other.current, cat);
    giveCatnip(other.current, "cheap", createRng(1));
    expect(cat.act.target).toBe("catnip");
    expect(seen(cat, "catnip")).toBe(0);
  });

  it("підказки й описи — за рівнем: «Байдужий» і «Шаленіє від м'яти» різні", () => {
    const cat = { name: "Мурка", sex: "female" as const };
    expect(traitHint(cat, { group: "catnip", level: -1 })).not.toBe(traitHint(cat, { group: "catnip", level: -2 }));
    expect(traitAbout({ group: "catnip", level: -1 }, "female")).not.toBe(traitAbout({ group: "catnip", level: -2 }, "female"));
    expect(traitHint(cat, { group: "catnip", level: -1 })).toContain("байдужа");
  });

  it("старе збереження без м'яти в запасах завантажується", () => {
    const save = game();
    const data = JSON.parse(serialize(save)) as { current: { home: { supplies: Record<string, unknown> } } };
    delete data.current.home.supplies.catnip;
    const loaded = deserialize(JSON.stringify(data));
    expect(loaded.current.home.supplies.catnip).toEqual({ cheap: 0, premium: 0 });
  });
});

/** Кіт уже на підвіконні й дивиться у вікно. */
function atWindow(cat: Cat, sill = WINDOWS[0]!.sill, minutes = 60): void {
  const o = objectById(sill);
  Object.assign(cat, { x: o.x + 0.5, y: o.y + 0.5 });
  cat.act = { kind: "window", target: sill, goal: null, minutes, elapsed: 0 };
}

describe("«Вікно» (§9.12, рішення автора 2026-10-25)", () => {
  it("підвіконня в спальні й вітальні видно, вони — меблі, а квартира лишається прохідною", () => {
    const state = game().current;
    expect(WINDOWS.map((w) => objectById(w.sill).kind)).toEqual(["windowsill", "windowsill"]);
    for (const { sill } of WINDOWS) {
      const o = objectById(sill);
      expect(isSolid(state, o.x, o.y)).toBe(true);
      expect(hiddenTile(o.x, o.y)).toBe(false);
    }
    // З місця пробудження дійти можна до кожної вільної клітинки підлоги.
    const seen = new Set<string>([`${Math.floor(SPAWN.x)},${Math.floor(SPAWN.y)}`]);
    const queue = [{ x: Math.floor(SPAWN.x), y: Math.floor(SPAWN.y) }];
    for (let tile = queue.shift(); tile; tile = queue.shift()) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const next = { x: tile.x + dx, y: tile.y + dy };
        if (isSolid(state, next.x, next.y) || seen.has(`${next.x},${next.y}`)) continue;
        seen.add(`${next.x},${next.y}`);
        queue.push(next);
      }
    }
    for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) if (!isSolid(state, x, y)) expect(seen.has(`${x},${y}`), `${x},${y}`).toBe(true);
  });

  it("вага вікна: удень 0,4 × (1 + 0,5 × рівень); «Не дивиться у вікно» — ніколи, уночі — ніхто", () => {
    const save = game();
    expect(windowWeight(save.current, withCat(save))).toBeCloseTo(WINDOW.weight);
    expect(windowWeight(save.current, withCat(save, { window: 2 }))).toBeCloseTo(WINDOW.weight * 2);
    expect(windowWeight(save.current, withCat(save, { window: -1 }))).toBe(0);
    expect(windowWeight(save.current, withCat(save, { window: -2 }))).toBeCloseTo(WINDOW.weight);
    save.current.minute = hours(23);
    expect(windowWeight(save.current, withCat(save, { window: 2 }))).toBe(0);
  });

  it("кіт без справ удень інколи йде на підвіконня, «+» — частіше; на одному підвіконні — один кіт", () => {
    const count = (traits: Record<string, TraitLevel>): number => {
      let n = 0;
      for (let seed = 1; seed <= 80; seed++) {
        const save = game(seed);
        const cat = withCat(save, traits);
        decide(save.current, cat, createRng(seed), { present: true });
        if (cat.act.kind === "window") n += 1;
      }
      return n;
    };
    const plain = count({});
    expect(plain).toBeGreaterThan(5);
    expect(count({ window: 2 })).toBeGreaterThan(plain);
    expect(count({ window: -1 })).toBe(0);
    const save = game();
    const [a, b, c] = [withCat(save), withCat(save), withCat(save)];
    expect(startWindow(save.current, a!, createRng(1))).toBe(true);
    expect(startWindow(save.current, b!, createRng(1))).toBe(true);
    expect(b!.act.target).not.toBe(a!.act.target);
    expect(startWindow(save.current, c!, createRng(1))).toBe(false);
  });

  it("на підвіконні: гра знімається, настрій росте; «+» «кекає» на птахів — прояв «+», не частіше разу на годину", () => {
    const save = game();
    Object.assign(save.current.character.body, { x: 4.5, y: 2.5 });
    const plain = withCat(save);
    const lover = withCat(save, { window: 2 });
    for (const cat of [plain, lover]) Object.assign(cat, { mood: 50, needs: { ...cat.needs, play: 60 } });
    atWindow(plain, WINDOWS[0]!.sill);
    atWindow(lover, WINDOWS[1]!.sill);
    // Персонаж у спальні бачить «+» на підвіконні спальні.
    atWindow(lover, WINDOWS[0]!.sill);
    atWindow(plain, WINDOWS[1]!.sill);
    const { events, stop } = recordEvents();
    live(save, 50);
    stop();
    for (const cat of [plain, lover]) {
      expect(cat.needs.play).toBeLessThan(60);
      expect(cat.mood).toBeGreaterThan(50);
    }
    expect(lover.needs.play).toBeLessThan(plain.needs.play);
    expect(events.filter((e) => e.type === "chatter" && e.cat === lover.id).length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === "chatter" && e.cat === plain.id)).toBe(false);
    expect(seen(lover, "window")).toBe(1);
  });

  it("«Нудьгує біля вікна» злиться — прояв «−» — і шипить на кота поруч, а сам — дере диван", () => {
    const save = game();
    Object.assign(save.current.character.body, { x: 2.5, y: 8.5 });
    const angry = withCat(save, { window: -2 });
    const other = withCat(save, {}, { x: 2.5, y: 7.5 });
    other.act = idleAct(60);
    atWindow(angry, WINDOWS[1]!.sill);
    const { events, stop } = recordEvents();
    live(save, WINDOW.angerMinutes + 0.5);
    stop();
    expect(events.some((e) => e.type === "window-angry" && e.cat === angry.id)).toBe(true);
    expect(events.some((e) => e.type === "hissed" && e.cat === angry.id && e.at === other.id)).toBe(true);
    expect(relation(save.current, angry, other)).toBeLessThan(0);
    expect(seen(angry, "window")).toBe(1);
    // Нікого поруч — іде дерти диван (ремонт).
    const alone = game();
    const cat = withCat(alone, { window: -2 });
    atWindow(cat, WINDOWS[1]!.sill);
    const repairs = alone.current.home.repairs;
    live(alone, WINDOW.angerMinutes + 10);
    expect(alone.current.home.repairs).toBe(repairs + SOFA_REPAIR);
  });

  it("обидва підвіконня зайняті — кіт інколи підходить подивитися й іде, а «Охоронець» на підвіконні відганяє його — прояв «+»", () => {
    let came = 0;
    let guarded = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const save = game(seed);
      Object.assign(save.current.character.body, { x: 4.5, y: 9.5 });
      const guard = withCat(save, { territorial: 2 });
      const plain = withCat(save);
      atWindow(guard, WINDOWS[1]!.sill);
      atWindow(plain, WINDOWS[0]!.sill);
      live(save, 0.25);
      const visitor = withCat(save, {}, { x: 5.5, y: 8.5 });
      if (!startWindow(save.current, visitor, createRng(seed))) continue;
      came += 1;
      const sill = objectById(WINDOWS[1]!.sill);
      expect(visitor.act.target).toBe(sill.id);
      // До зайнятого — на підлогу поруч, а не на чужу дошку.
      expect(visitor.act.goal).not.toEqual({ x: sill.x, y: sill.y });
      const { events, stop } = recordEvents();
      for (let i = 0; i < 60 && visitor.act.kind === "window"; i++) {
        save.current.minute += 0.25;
        tickCats(save.current, 0.25, { present: true });
      }
      stop();
      expect(visitor.act.kind).not.toBe("window");
      expect(Math.floor(visitor.x) === sill.x && Math.floor(visitor.y) === sill.y).toBe(false);
      expect(guard.act.kind).toBe("window");
      if (events.some((e) => e.type === "hissed" && e.cat === guard.id && e.at === visitor.id)) {
        guarded += 1;
        expect(seen(guard, "territorial")).toBe(1);
        expect(visitor.act.kind).toBe("wander");
      }
    }
    expect(came).toBeGreaterThan(10);
    expect(came).toBeLessThan(30);
    expect(guarded).toBeGreaterThan(3);
    expect(guarded).toBeLessThan(came);
  });

  it("«Бережливий» і в злості біля вікна дивана не дере", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const save = game(seed);
      const cat = withCat(save, { window: -2, scratching: -2 });
      atWindow(cat, WINDOWS[1]!.sill);
      const repairs = save.current.home.repairs;
      const { events, stop } = recordEvents();
      live(save, WINDOW.angerMinutes + 10);
      stop();
      expect(events.some((e) => e.type === "window-angry")).toBe(true);
      expect(events.some((e) => e.type === "scratched" && e.cat === cat.id && e.where === "sofa")).toBe(false);
      expect(save.current.home.repairs).toBe(repairs);
    }
  });

  it("описи: «Не дивиться у вікно» й «Нудьгує біля вікна» різні", () => {
    expect(traitAbout({ group: "window", level: -1 }, "male")).not.toBe(traitAbout({ group: "window", level: -2 }, "male"));
    expect(traitAbout({ group: "window", level: -2 }, "male")).toContain("злиться");
  });

  it("стара гра: персонаж там, де тепер підвіконня, після завантаження — поруч", () => {
    const save = game();
    const sill = objectById(WINDOWS[0]!.sill);
    Object.assign(save.current.character.body, { x: sill.x + 0.5, y: sill.y + 0.5 });
    const body = deserialize(serialize(save)).current.character.body;
    expect(isSolid(save.current, Math.floor(body.x), Math.floor(body.y))).toBe(false);
  });
});

/** Кіт хоче гратися, а на кухонному столі — страва: що він обере (ціль дії). */
function playChoice(save: Save, cat: Cat, seed: number): string | null {
  save.current.home.surfaces["table"] = { kind: "meal", quality: "cheap" };
  cat.needs.play = 90;
  cat.act = idleAct(0);
  decide(save.current, cat, createRng(seed), { present: true });
  return cat.act.target;
}

/** Ціль на кухні: страва чи дрібничка на кухонному столі чи поверхні. */
const kitchenTarget = (target: string | null): boolean => target === "table" || target === "stove" || target?.startsWith("counter") === true || target === "trinket:mug" || target === "trinket:phone";

describe("«Слухняність» (§9.12, рішення автора 2026-10-25)", () => {
  it("«ні» — зняти кота з кухонного столу чи комп'ютера: як прогнати з місця, і кіт це пам'ятає", () => {
    const save = game();
    const cat = withCat(save);
    const table = objectById("table");
    Object.assign(cat, { x: table.x + 0.5, y: table.y + 0.5, mood: 60, love: 60 });
    cat.act = { kind: "steal", target: "table", goal: null, minutes: 1, elapsed: 0 };
    expect(forbiddenZoneAt(save.current, cat)).toBe("kitchen");
    pickUpCat(save.current, cat);
    expect(cat.toldNo?.kitchen).toBeDefined();
    expect(cat.mood).toBeLessThan(60);
    expect(cat.love).toBeCloseTo(60 + SHOO.love);
    // Кіт на підлозі — це не «ні».
    const other = withCat(save);
    pickUpCat(save.current, other);
    expect(other.toldNo).toBeUndefined();
  });

  it("скільки пам'ятає: 2 години × (1 + 0,5 × рівень) — «Анархіст» не пам'ятає зовсім", () => {
    const save = game();
    expect(noMemory(withCat(save))).toBe(OBEDIENCE.minutes);
    expect(noMemory(withCat(save, { obedience: 2 }))).toBe(2 * OBEDIENCE.minutes);
    expect(noMemory(withCat(save, { obedience: -1 }))).toBe(OBEDIENCE.minutes / 2);
    expect(noMemory(withCat(save, { obedience: -2 }))).toBe(0);
  });

  it("кіт без риси 2 години не лізе на кухню, а тоді — знову", () => {
    let before = 0;
    let after = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const save = game(seed);
      const cat = withCat(save);
      sayNo(save.current, cat, "kitchen", createRng(seed));
      if (kitchenTarget(playChoice(save, cat, seed))) before += 1;
      save.current.minute += OBEDIENCE.minutes + 1;
      if (kitchenTarget(playChoice(save, cat, seed))) after += 1;
    }
    expect(before).toBe(0);
    expect(after).toBeGreaterThan(5);
  });

  it("«+» підходить до забороненого місця, дивиться й розвертається — думка й прояв «+»", () => {
    let shown = false;
    for (let seed = 1; seed <= 60 && !shown; seed++) {
      const save = game(seed);
      Object.assign(save.current.character.body, { x: 15.5, y: 2.5 });
      const cat = withCat(save, { obedience: 2 }, { x: 15.5, y: 4.5 });
      sayNo(save.current, cat, "kitchen", createRng(seed));
      save.current.minute += OBEDIENCE.minutes + 30;
      expect(noGo(save.current, cat, "kitchen")).toBe("remember");
      if (playChoice(save, cat, seed) !== "no:kitchen") continue;
      const { events, stop } = recordEvents();
      live(save, 2);
      stop();
      expect(events.some((e) => e.type === "cat-remembered" && e.cat === cat.id && e.zone === "kitchen")).toBe(true);
      expect(seen(cat, "obedience")).toBe(1);
      expect(forbiddenZoneAt(save.current, cat)).toBeNull();
      shown = true;
    }
    expect(shown).toBe(true);
  });

  it("прояв «ні» — коли персонаж бачить кота біля місця, а не лише в мить, коли той дійшов; думка — раз за підхід (рішення автора 2026-10-26)", () => {
    const save = game();
    // Персонаж у спальні: кухні крізь стіну не видно.
    Object.assign(save.current.character.body, { x: 2.5, y: 2.5 });
    const cat = withCat(save, { obedience: 2 }, { x: 15.5, y: 4.5 });
    sayNo(save.current, cat, "kitchen", createRng(1));
    save.current.minute += OBEDIENCE.minutes + 30;
    cat.act = { kind: "idle", target: "no:kitchen", goal: null, minutes: OBEDIENCE.rememberMinutes, elapsed: 0 };
    const { events, stop } = recordEvents();
    live(save, 0.25);
    expect(events.filter((e) => e.type === "cat-remembered" && e.cat === cat.id)).toHaveLength(1);
    expect(seen(cat, "obedience")).toBe(0);
    // Персонаж зайшов на кухню, поки кіт ще стоїть біля столу, — побачив.
    Object.assign(save.current.character.body, { x: 15.5, y: 2.5 });
    live(save, 0.25);
    stop();
    expect(cat.act.target).toBe("no:kitchen");
    expect(seen(cat, "obedience")).toBe(1);
    expect(events.filter((e) => e.type === "cat-remembered" && e.cat === cat.id)).toHaveLength(1);
  });

  it("голодний «Слухняний» злодій доходить до столу, згадує «ні» й не краде (перевірка етапу: голод переривав його щокроку)", () => {
    const save = game();
    Object.assign(save.current.character.body, { x: 15.5, y: 2.5 });
    const cat = withCat(save, { obedience: 2, thief: 2 }, { x: 15.5, y: 4.5 });
    for (const item of save.current.home.items) if (item.kind === "bowl") item.food = 0;
    save.current.home.surfaces["table"] = { kind: "meal", quality: "cheap" };
    cat.needs.hunger = 80;
    sayNo(save.current, cat, "kitchen", createRng(1));
    const { events, stop } = recordEvents();
    for (let t = 0; t < 60; t += 0.25) {
      cat.needs.fatigue = 0;
      save.current.minute += 0.25;
      tickCats(save.current, 0.25, { present: true });
    }
    stop();
    expect(events.some((e) => e.type === "cat-remembered" && e.cat === cat.id && e.zone === "kitchen")).toBe(true);
    expect(events.some((e) => e.type === "stole" && e.cat === cat.id)).toBe(false);
    expect(seen(cat, "obedience")).toBe(1);
  });

  it("голодний «Слухняний» без корму підходить до столу не частіше ніж раз на 30 хв, а між підходами просить корм; думка — теж раз на 30 хв (рішення автора 2026-10-26)", () => {
    const save = game();
    Object.assign(save.current.character.body, { x: 15.5, y: 2.5 });
    const cat = withCat(save, { obedience: 2, thief: 2 }, { x: 15.5, y: 4.5 });
    for (const item of save.current.home.items) if (item.kind === "bowl") item.food = 0;
    save.current.home.surfaces["table"] = { kind: "meal", quality: "cheap" };
    cat.needs.hunger = 80;
    sayNo(save.current, cat, "kitchen", createRng(1));
    const { events, stop } = recordEvents();
    const thoughts: number[] = [];
    const approaches: number[] = [];
    let begs = 0;
    let before = "";
    for (let t = 0; t < 120; t += 0.25) {
      cat.needs.fatigue = 0;
      const seen = events.length;
      save.current.minute += 0.25;
      tickCats(save.current, 0.25, { present: true });
      if (events.slice(seen).some((e) => e.type === "cat-remembered" && e.cat === cat.id)) thoughts.push(t);
      const now = `${cat.act.kind}:${cat.act.target}`;
      if (now !== before && cat.act.target === "no:kitchen") approaches.push(t);
      if (now !== before && (cat.act.kind === "beg" || (cat.act.kind === "attention" && cat.act.forFood === true))) begs += 1;
      before = now;
    }
    stop();
    expect(approaches.length).toBeGreaterThan(1);
    for (let i = 1; i < approaches.length; i++) expect((approaches[i] ?? 0) - (approaches[i - 1] ?? 0)).toBeGreaterThanOrEqual(OBEDIENCE.approachEvery);
    expect(begs).toBeGreaterThan(approaches.length);
    expect(thoughts.length).toBeGreaterThan(1);
    for (let i = 1; i < thoughts.length; i++) expect((thoughts[i] ?? 0) - (thoughts[i - 1] ?? 0)).toBeGreaterThanOrEqual(OBEDIENCE.thoughtEvery);
    expect(events.some((e) => e.type === "stole" && e.cat === cat.id)).toBe(false);
  });

  it("підійшовши до забороненого місця, «+» пів години туди не йде — до іншого місця може (рішення автора 2026-10-26)", () => {
    const save = game();
    const cat = withCat(save, { obedience: 2 }, { x: 15.5, y: 4.5 });
    sayNo(save.current, cat, "kitchen", createRng(1));
    sayNo(save.current, cat, "desk", createRng(1));
    cat.noVisitAt = { kitchen: absoluteMinute(save.current.day, save.current.minute) };
    expect(noGo(save.current, cat, "kitchen")).toBe("skip");
    expect(noGo(save.current, cat, "desk")).toBe("remember");
    save.current.minute += OBEDIENCE.approachEvery;
    expect(noGo(save.current, cat, "kitchen")).toBe("remember");
  });

  it("пів години відлічуються від того, як «+» дійшов до забороненого місця, а не як вирушив (пошук багів 2026-10-26)", () => {
    const save = game();
    // Кіт далеко від кухні: до столу — кілька хвилин дороги.
    const cat = withCat(save, { obedience: 2, thief: 2 }, { x: 3.5, y: 8.5 });
    for (const item of save.current.home.items) if (item.kind === "bowl") item.food = 0;
    save.current.home.surfaces["table"] = { kind: "meal", quality: "cheap" };
    cat.needs.hunger = 80;
    sayNo(save.current, cat, "kitchen", createRng(1));
    let left: number | null = null;
    let arrived: number | null = null;
    for (let t = 0; t < 120 && arrived === null; t += 0.25) {
      cat.needs.fatigue = 0;
      save.current.minute += 0.25;
      tickCats(save.current, 0.25, { present: true });
      const now = absoluteMinute(save.current.day, save.current.minute);
      if (cat.act.target === "no:kitchen" && left === null) left = now;
      if (cat.act.target === "no:kitchen" && cat.act.goal === null) arrived = now;
    }
    if (left === null || arrived === null) throw new Error("кіт не підійшов до столу");
    expect(arrived - left).toBeGreaterThanOrEqual(1);
    // Дійшов — згадує «ні» на наступному кроці симуляції.
    save.current.minute += 0.25;
    tickCats(save.current, 0.25, { present: true });
    expect(cat.act.target).toBe("no:kitchen");
    const at = save.current.minute;
    save.current.minute = at + OBEDIENCE.approachEvery - 0.5;
    expect(noGo(save.current, cat, "kitchen")).toBe("skip");
    save.current.minute = at + OBEDIENCE.approachEvery;
    expect(noGo(save.current, cat, "kitchen")).toBe("remember");
  });

  it("«Анархіст» інколи повертається на кухонний стіл за 10 хвилин — прояв «−»; «Пропускає повз вуха» — за годину", () => {
    let back = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const save = game(seed);
      Object.assign(save.current.character.body, { x: 15.5, y: 2.5 });
      const cat = withCat(save, { obedience: -2 }, { x: 15.5, y: 4.5 });
      sayNo(save.current, cat, "kitchen", createRng(seed));
      if (!cat.comeback) continue;
      live(save, OBEDIENCE.comebackMinutes + 3);
      expect(forbiddenZoneAt(save.current, cat)).toBe("kitchen");
      expect(seen(cat, "obedience")).toBe(1);
      back += 1;
    }
    expect(back).toBeGreaterThan(3);
    expect(back).toBeLessThan(17);
    const save = game();
    const cat = withCat(save, { obedience: -1 });
    sayNo(save.current, cat, "kitchen", createRng(1));
    save.current.minute += OBEDIENCE.minutes / 2 + 1;
    expect(noGo(save.current, cat, "kitchen")).toBe("go");
  });

  it("«+», що пам'ятає «ні» про комп'ютер, приходить до того, хто працює, і на клавіатуру не сідає", () => {
    const save = game();
    Object.assign(save.current.character.body, { x: 7.5, y: 7.5, facing: { x: 0, y: -1 } });
    startWork(save.current);
    let keyboard = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const cat = withCat(save, { obedience: 1, helper: 2 }, { x: 7.5, y: 7.8 });
      sayNo(save.current, cat, "desk", createRng(seed));
      cat.needs.attention = 90;
      cat.act = { kind: "attention", target: "character", goal: null, minutes: 20, elapsed: 0, seen: true };
      const { events, stop } = recordEvents();
      tickCats(save.current, 0.25, { present: true });
      stop();
      if (cat.act.kind === "keyboard") keyboard += 1;
      expect(events.some((e) => e.type === "cat-remembered" && e.cat === cat.id)).toBe(true);
      save.current.cats = save.current.cats.filter((c) => c.id !== cat.id);
    }
    expect(keyboard).toBe(0);
  });
});

const setRelation = (save: Save, a: Cat, b: Cat, value: number): void => {
  save.current.relations[a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`] = value;
};

describe("«Товариськість» і «Вилизування друзів» (§9.4, §9.12, рішення автора 2026-10-25)", () => {
  it("двоє «Задирак» стають ворогами приблизно за тиждень — так і задумано", () => {
    const save = game();
    const a = withCat(save, { sociability: -2 });
    const b = withCat(save, { sociability: -2 });
    expect(relation(save.current, a, b)).toBe(-4 * RELATIONS.sociabilityStep);
    for (let night = 1; night <= 6; night++) nightlyRelations(save.current);
    expect(isEnemy(save.current, a, b)).toBe(false);
    nightlyRelations(save.current);
    expect(isEnemy(save.current, a, b)).toBe(true);
  });

  it("«Конфліктний» шипить на кота, що не друг і проходить повз, — раз за зустріч; прояв «−»", () => {
    let hissed = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const save = game(seed);
      const grumpy = withCat(save, { sociability: -2 }, { x: 9.5, y: 7.5 });
      grumpy.act = idleAct(60);
      const other = withCat(save, {}, { x: 7.5, y: 7.5 });
      setRelation(save, grumpy, other, 0);
      // Інший кіт іде повз — через клітинку від «Задираки».
      other.act = { kind: "wander", target: null, goal: { x: 12, y: 7 }, minutes: 8, elapsed: 0 };
      const { events, stop } = recordEvents();
      live(save, 2);
      stop();
      const hisses = events.filter((e) => e.type === "hissed" && e.cat === grumpy.id);
      expect(hisses.length).toBeLessThanOrEqual(1);
      if (hisses.length === 0) continue;
      hissed += 1;
      expect(relation(save.current, grumpy, other)).toBe(SOCIABILITY.passRelation);
      expect(seen(grumpy, "sociability")).toBe(1);
    }
    expect(hissed).toBeGreaterThan(3);
    expect(hissed).toBeLessThan(20);
  });

  it("«Товариський» лягає спати й поруч із малознайомим котом — прояв «+»; кіт без риси — лише до друга", () => {
    const piles = (traits: Record<string, TraitLevel>): number => {
      let n = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const save = game(seed);
        const sleeper = withCat(save, {}, { x: 5.5, y: 8.5 });
        sleeper.act = { kind: "sleep", target: null, goal: null, minutes: 480, elapsed: 30 };
        const cat = withCat(save, traits, { x: 9.5, y: 8.5 });
        setRelation(save, cat, sleeper, 10);
        cat.needs.fatigue = 99;
        decide(save.current, cat, createRng(seed), { present: true });
        if (cat.act.kind === "sleep" && cat.act.target === `pile:${sleeper.id}`) n += 1;
      }
      return n;
    };
    expect(piles({ sociability: 2 })).toBeGreaterThan(5);
    expect(piles({})).toBe(0);
    const save = game();
    Object.assign(save.current.character.body, { x: 6.5, y: 8.5 });
    const sleeper = withCat(save, {}, { x: 5.5, y: 8.5 });
    sleeper.act = { kind: "sleep", target: null, goal: null, minutes: 480, elapsed: 30 };
    const cat = withCat(save, { sociability: 1 }, { x: 8.5, y: 8.5 });
    // Обидва втомлені — сплять довго.
    sleeper.needs.fatigue = 90;
    cat.needs.fatigue = 90;
    setRelation(save, cat, sleeper, 10);
    cat.act = { kind: "sleep", target: `pile:${sleeper.id}`, goal: { x: 5, y: 8 }, minutes: 480, elapsed: 0 };
    live(save, 2);
    expect(seen(cat, "sociability")).toBe(1);
    // Сон поруч зближує й малознайомих (§9.4).
    live(save, 60);
    expect(relation(save.current, cat, sleeper)).toBeGreaterThan(10);
  });

  it("купкою — лише до кота на підлозі, ліжку чи дивані: за другом на холодильник чи на комп'ютер не лізуть (перевірка етапу)", () => {
    const piles = (where: "floor" | "fridge" | "computer" | "house"): number => {
      let n = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const save = game(seed);
        const sleeper = withCat(save, {}, { x: 5.5, y: 8.5 });
        sleeper.act = { kind: "sleep", target: null, goal: null, minutes: 480, elapsed: 30 };
        if (where === "fridge" || where === "computer") {
          const o = objectById(where);
          Object.assign(sleeper, { x: o.x + 0.5, y: o.y + 0.5 });
        }
        if (where === "house") sleeper.act.target = "item:999";
        const cat = withCat(save, { climbing: -2 }, { x: 9.5, y: 8.5 });
        setRelation(save, cat, sleeper, 80);
        cat.needs.fatigue = 99;
        decide(save.current, cat, createRng(seed), { present: true });
        if (cat.act.kind === "sleep" && cat.act.target === `pile:${sleeper.id}`) n += 1;
      }
      return n;
    };
    expect(piles("floor")).toBeGreaterThan(10);
    expect(piles("fridge")).toBe(0);
    expect(piles("computer")).toBe(0);
    expect(piles("house")).toBe(0);
  });

  it("«Не терпить дотиків» відсторонюється, коли друг прийшов його вилизати: стосунки −1 замість +2, прояв «−»", () => {
    let refused = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const save = game(seed);
      const prickly = withCat(save, { grooming: -2 }, { x: 9.5, y: 7.5 });
      prickly.act = idleAct(60);
      const groomer = withCat(save, {}, { x: 10.3, y: 7.5 });
      setRelation(save, prickly, groomer, 60);
      groomer.act = { kind: "groom", target: `cat:${prickly.id}`, goal: null, minutes: RELATIONS.groom.minutes, elapsed: 0 };
      // Відсторонюється чи ні — вирішується, щойно друг підійшов.
      const { events, stop } = recordEvents();
      live(save, 0.5);
      stop();
      const before = 60;
      if (!events.some((e) => e.type === "groom-refused" && e.cat === prickly.id)) {
        expect(groomer.act.kind).toBe("groom");
        continue;
      }
      refused += 1;
      expect(relation(save.current, prickly, groomer)).toBe(before + GROOMING.refuseRelation);
      expect(events.some((e) => e.type === "groomed")).toBe(false);
      expect(seen(prickly, "grooming")).toBe(1);
    }
    expect(refused).toBeGreaterThan(15);
    expect(refused).toBeLessThan(30);
  });
});

/** Персонаж гладить кота: пестощі вже тривають. */
function petting(save: Save, cat: Cat): void {
  cat.act = idleAct(5);
  save.current.character.activity = { kind: "pet", cat: cat.id, minutes: 1 };
}

describe("«Ревнивість» (§9.4, §9.12, рішення автора 2026-10-25)", () => {
  it("ревнивець поруч шипить на того, кого гладять, і інколи зганяє його — пестощі перериваються", () => {
    let left = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const save = game(seed);
      const lucky = withCat(save, {}, { x: 9.5, y: 8.5 });
      const rival = withCat(save, { jealousy: 2 }, { x: 8.5, y: 8.5 });
      petting(save, lucky);
      const before = relation(save.current, rival, lucky);
      const { events, stop } = recordEvents();
      jealousy(save.current, lucky, "pet");
      stop();
      expect(events.filter((e) => e.type === "hissed" && e.cat === rival.id && e.at === lucky.id)).toHaveLength(1);
      expect(relation(save.current, rival, lucky)).toBe(before + 2 * RELATIONS.jealousy);
      expect(seen(rival, "jealousy")).toBe(1);
      const activity = save.current.character.activity;
      if (activity?.kind === "pet" && activity.left === true) {
        left += 1;
        expect(lucky.act.kind).toBe("wander");
      }
    }
    expect(left).toBeGreaterThan(5);
    expect(left).toBeLessThan(25);
  });

  it("ревнивець здалеку інколи приходить і шипить зблизька — не частіше ніж раз на пів години", () => {
    let came = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const save = game(seed);
      Object.assign(save.current.character.body, { x: 10.5, y: 8.5 });
      const lucky = withCat(save, {}, { x: 9.5, y: 8.5 });
      const rival = withCat(save, { jealousy: 2 }, { x: 5.5, y: 8.5 });
      petting(save, lucky);
      const { events, stop } = recordEvents();
      jealousy(save.current, lucky, "pet");
      if (rival.act.kind !== "jealous") {
        stop();
        // Не прийшов — шипить звідти.
        expect(events.some((e) => e.type === "hissed" && e.cat === rival.id)).toBe(true);
        continue;
      }
      came += 1;
      expect(events.some((e) => e.type === "hissed")).toBe(false);
      for (let i = 0; i < 20 && rival.act.kind === "jealous"; i++) {
        save.current.minute += 0.25;
        tickCats(save.current, 0.25, { present: true });
      }
      stop();
      expect(events.some((e) => e.type === "hissed" && e.cat === rival.id && e.at === lucky.id)).toBe(true);
      // Ще раз за хвилину — уже не йде.
      rival.act = idleAct(10);
      save.current.minute += JEALOUSY.pauseMinutes - 5;
      Object.assign(rival, { x: 5.5, y: 8.5 });
      delete rival.hissedAt;
      jealousy(save.current, lucky, "pet");
      expect(rival.act.kind).not.toBe("jealous");
    }
    expect(came).toBeGreaterThan(5);
    expect(came).toBeLessThan(25);
  });

  it("«Ревнивець» (+2) зганяє суперника з колін і лягає сам", () => {
    let took = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const save = game(seed);
      Object.assign(save.current.character.body, { x: 7.5, y: 7.5, facing: { x: 0, y: -1 } });
      startWork(save.current);
      const lucky = withCat(save, {}, { x: 7.5, y: 7.55 });
      lucky.act = { kind: "lap", target: "character", goal: null, minutes: 240, elapsed: 0 };
      lucky.needs.attention = 80;
      const rival = withCat(save, { jealousy: 2 }, { x: 8.5, y: 7.5 });
      jealousy(save.current, lucky, "lap");
      if (rival.act.kind !== "lap") continue;
      took += 1;
      expect(lucky.act.kind).toBe("wander");
    }
    expect(took).toBeGreaterThan(3);
  });

  it("«Щедра душа» ліг муркотіти, коли персонаж не бачив, — прояв зараховується, щойно побачить, а муркотіння й стосунки — раз (рішення автора 2026-10-26)", () => {
    const save = game();
    const lucky = withCat(save, {}, { x: 9.5, y: 8.5 });
    const kind = withCat(save, { jealousy: -2 }, { x: 8.6, y: 8.5 });
    lucky.act = idleAct(30);
    kind.act = { kind: "idle", target: `cuddle:${lucky.id}`, goal: null, minutes: JEALOUSY.cuddleMinutes, elapsed: 0 };
    // Персонаж у спальні: вітальні крізь стіну не видно.
    Object.assign(save.current.character.body, { x: 2.5, y: 2.5 });
    const before = relation(save.current, kind, lucky);
    const { events, stop } = recordEvents();
    tickCats(save.current, 0.25, { present: true });
    const cuddled = (): number => events.filter((e) => e.type === "cat-cuddled" && e.cat === kind.id).length;
    expect(cuddled()).toBe(1);
    expect(seen(kind, "jealousy")).toBe(0);
    Object.assign(save.current.character.body, { x: 10.5, y: 7.5 });
    tickCats(save.current, 0.25, { present: true });
    stop();
    expect(kind.act.target).toBe(`cuddle:${lucky.id}`);
    expect(seen(kind, "jealousy")).toBe(1);
    expect(cuddled()).toBe(1);
    expect(relation(save.current, kind, lucky)).toBe(before + JEALOUSY.cuddleRelation);
  });

  it("«Щедра душа» приходить, лягає поруч із тим, кого гладять, і муркоче — прояв «−»; гра так не діє", () => {
    let cuddled = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const save = game(seed);
      Object.assign(save.current.character.body, { x: 10.5, y: 8.5 });
      const lucky = withCat(save, {}, { x: 9.5, y: 8.5 });
      const kind = withCat(save, { jealousy: -2 }, { x: 6.5, y: 8.5 });
      petting(save, lucky);
      const before = relation(save.current, kind, lucky);
      jealousy(save.current, lucky, "pet");
      if (kind.act.target !== `cuddle:${lucky.id}`) continue;
      cuddled += 1;
      const { events, stop } = recordEvents();
      for (let i = 0; i < 12 && kind.act.goal !== null; i++) {
        save.current.minute += 0.25;
        tickCats(save.current, 0.25, { present: true });
      }
      tickCats(save.current, 0.01, { present: true });
      stop();
      expect(events.some((e) => e.type === "cat-cuddled" && e.cat === kind.id)).toBe(true);
      expect(relation(save.current, kind, lucky)).toBe(before + JEALOUSY.cuddleRelation);
      expect(seen(kind, "jealousy")).toBe(1);
    }
    expect(cuddled).toBeGreaterThan(5);
    const save = game();
    const lucky = withCat(save, {}, { x: 9.5, y: 8.5 });
    const kind = withCat(save, { jealousy: -2 }, { x: 6.5, y: 8.5 });
    for (let i = 0; i < 10; i++) jealousy(save.current, lucky, "play");
    expect(kind.act.target?.startsWith("cuddle:")).not.toBe(true);
  });

  it("ревнують, лише коли гра справді почалася: на кота, що на вудку не зважає, не шипить (перевірка етапу)", () => {
    const save = game();
    const lucky = withCat(save, {}, { x: 9.5, y: 8.5 });
    const rival = withCat(save, { jealousy: 2 }, { x: 9.5, y: 7.5 });
    rival.act = idleAct(60);
    toyInHands(save, lucky);
    lucky.needs.play = 0;
    const { events, stop } = recordEvents();
    for (let t = 0; t < 1; t += 0.25) advance(save, 0.25, { move: { x: 0, y: 0 }, hold: true });
    expect(events.some((e) => e.type === "hissed" && e.cat === rival.id)).toBe(false);
    // Кнопку відпустили, кіт захотів гратися — тепер ревнивець бачить гру.
    advance(save, 0.25, { move: { x: 0, y: 0 }, hold: false });
    lucky.needs.play = 90;
    for (let t = 0; t < 1; t += 0.25) advance(save, 0.25, { move: { x: 0, y: 0 }, hold: true });
    stop();
    expect(events.some((e) => e.type === "hissed" && e.cat === rival.id && e.at === lucky.id)).toBe(true);
  });

  it("ревнують і тоді, коли іншого кота беруть на руки", () => {
    const save = game();
    const lucky = withCat(save, {}, { x: 9.5, y: 8.5 });
    const rival = withCat(save, { jealousy: 1 }, { x: 8.5, y: 8.5 });
    Object.assign(save.current.character.body, { x: 9.5, y: 9.1 });
    const { events, stop } = recordEvents();
    pickUpCat(save.current, lucky);
    stop();
    expect(events.some((e) => e.type === "hissed" && e.cat === rival.id && e.at === lucky.id)).toBe(true);
    // Здалеку до кота на руках не йдуть — його несуть далі; шипить звідти (перевірка етапу).
    for (let seed = 1; seed <= 20; seed++) {
      const s = game(seed);
      const held = withCat(s, {}, { x: 9.5, y: 8.5 });
      const far = withCat(s, { jealousy: 2 }, { x: 5.5, y: 8.5 });
      Object.assign(s.current.character.body, { x: 9.5, y: 9.1 });
      const log = recordEvents();
      pickUpCat(s.current, held);
      log.stop();
      expect(far.act.kind).not.toBe("jealous");
      expect(log.events.some((e) => e.type === "hissed" && e.cat === far.id && e.at === held.id)).toBe(true);
    }
  });
});

/** Миска котячого кутка з кормом. */
function fullBowl(save: Save): BowlItem {
  const bowl = save.current.home.items.find((i): i is BowlItem => i.kind === "bowl");
  if (!bowl) throw new Error("немає миски");
  Object.assign(bowl, { food: 2, foodQuality: "cheap" });
  return bowl;
}

/** Кіт уже їсть із миски. */
function eating(cat: Cat, bowl: BowlItem): void {
  const tile = itemTile(bowl);
  Object.assign(cat, { x: tile.x + 0.5, y: tile.y + 0.5 });
  cat.act = { kind: "eat", target: `item:${bowl.id}`, goal: null, minutes: 3, elapsed: 0.5, nibble: false };
}

describe("«Територіальність» (§9.4, §9.12, рішення автора 2026-10-25)", () => {
  it("«Охоронець миски» відганяє кота, що йде до його миски: шипить, той відходить голодний — прояв «+»", () => {
    let guarded = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const save = game(seed);
      Object.assign(save.current.character.body, { x: 15.5, y: 3.5 });
      const bowl = fullBowl(save);
      const guard = withCat(save, { territorial: 2 });
      eating(guard, bowl);
      guard.act.minutes = 10;
      const hungry = withCat(save, {}, { x: 13.5, y: 4.5 });
      hungry.needs.hunger = 90;
      const before = relation(save.current, guard, hungry);
      decide(save.current, hungry, createRng(seed), { present: true });
      expect(hungry.act.kind).toBe("eat");
      const { events, stop } = recordEvents();
      for (let i = 0; i < 8 && hungry.act.kind === "eat" && hungry.act.goal !== null; i++) {
        save.current.minute += 0.25;
        tickCats(save.current, 0.25, { present: true });
      }
      stop();
      const hisses = events.filter((e) => e.type === "hissed" && e.cat === guard.id && e.at === hungry.id);
      expect(hisses.length).toBeLessThanOrEqual(1);
      if (hisses.length === 0) continue;
      guarded += 1;
      expect(hungry.act.kind).toBe("wander");
      expect(hungry.needs.hunger).toBeGreaterThanOrEqual(90);
      expect(relation(save.current, guard, hungry)).toBe(before + TERRITORY.guardRelation);
      expect(seen(guard, "territorial")).toBe(1);
    }
    expect(guarded).toBeGreaterThan(8);
    expect(guarded).toBeLessThan(28);
  });

  it("«Господар території» після їди ще 10 хвилин вартує біля миски", () => {
    const save = game();
    const bowl = fullBowl(save);
    const guard = withCat(save, { territorial: 2 });
    eating(guard, bowl);
    guard.act.minutes = 0.1;
    guard.needs.hunger = 90;
    live(save, 0.25);
    expect(guard.act.kind).toBe("idle");
    expect(guard.act.target).toBe(`guard:item:${bowl.id}`);
    expect(guard.act.minutes).toBeGreaterThan(TERRITORY.guardMinutes - 1);
  });

  it("кіт без риси обирає вільну миску, «Ділиться» їсть разом з іншим — прояв «−»", () => {
    const save = game();
    Object.assign(save.current.character.body, { x: 16.5, y: 4.5 });
    const first = fullBowl(save);
    const second = place(save.current, "bowl", "cheap") as BowlItem;
    Object.assign(second, { food: 2, foodQuality: "cheap" });
    save.current.home.items.push(second);
    const eater = withCat(save);
    eating(eater, first);
    eater.act.minutes = 10;
    const plain = withCat(save, {}, { x: 17.5, y: 4.5 });
    plain.needs.hunger = 90;
    // Кіт без риси стоїть ближче до зайнятої миски, а йде до вільної.
    Object.assign(plain, { x: itemTile(first).x + 0.5, y: itemTile(first).y + 1.5 });
    decide(save.current, plain, createRng(1), { present: true });
    expect(plain.act.target).toBe(`item:${second.id}`);
    // Друга миска знову вільна: кіт без риси пішов гуляти.
    plain.act = idleAct(30);
    plain.needs.hunger = 0;
    const sharer = withCat(save, { territorial: -1 }, { x: itemTile(first).x + 0.5, y: itemTile(first).y + 1.5 });
    sharer.needs.hunger = 90;
    decide(save.current, sharer, createRng(1), { present: true });
    expect(sharer.act.target).toBe(`item:${first.id}`);
    for (let i = 0; i < 12 && sharer.act.nibble === undefined; i++) {
      save.current.minute += 0.25;
      tickCats(save.current, 0.25, { present: true });
    }
    expect(seen(sharer, "territorial")).toBe(1);
  });

  it("сварка за лоток дзеркальна: «Комунар» не свариться ніколи", () => {
    const save = game();
    const litter = save.current.home.items.find((i): i is LitterItem => i.kind === "litter")!;
    const calm = withCat(save, { territorial: -2 });
    const other = withCat(save);
    const { events, stop } = recordEvents();
    for (let i = 0; i < 40; i++) {
      Object.assign(other, { x: itemTile(litter).x + 1.5, y: itemTile(litter).y + 0.5, act: idleAct(30) });
      calm.needs.toilet = 100;
      decide(save.current, calm, createRng(i), { present: false });
      for (let t = 0; t < 20 && calm.act.kind === "toilet"; t++) tickCats(save.current, 1, { present: false });
      litter.uses = 0;
    }
    stop();
    expect(events.some((e) => e.type === "hissed" && e.cat === calm.id)).toBe(false);
  });
});

describe("«Турбота про кошенят» (§9.4, §9.12, рішення автора 2026-10-25)", () => {
  it("початкові стосунки з кошеням: 20 + 10 × рівень дорослого", () => {
    const save = game();
    const nanny = withCat(save, { nurturing: 2 });
    const grump = withCat(save, { nurturing: -2 });
    const kitten = withCat(save, {}, { x: 9.5, y: 7.5 }, 1);
    expect(relation(save.current, nanny, kitten)).toBe(RELATIONS.kittenBonus + 2 * NURTURING.relationStep);
    expect(relation(save.current, grump, kitten)).toBe(RELATIONS.kittenBonus - 2 * NURTURING.relationStep);
  });

  it("«Нянька» вилизує кошеня поруч — малому приємно, прояв «+»; кіт без риси — ні", () => {
    const grooms = (traits: Record<string, TraitLevel>): Cat | null => {
      for (let seed = 1; seed <= 60; seed++) {
        const save = game(seed);
        const kitten = withCat(save, {}, { x: 10.5, y: 7.5 }, 1);
        const adult = withCat(save, traits, { x: 9.5, y: 7.5 });
        setRelation(save, adult, kitten, 0);
        decide(save.current, adult, createRng(seed), { present: true });
        if (adult.act.kind !== "groom" || adult.act.target !== `kitten:${kitten.id}`) continue;
        kitten.mood = 50;
        kitten.act = idleAct(10);
        live(save, RELATIONS.groom.minutes + 1);
        expect(kitten.mood).toBeGreaterThan(50);
        expect(seen(adult, "nurturing")).toBe(1);
        return adult;
      }
      return null;
    };
    expect(grooms({ nurturing: 2 })).not.toBeNull();
    expect(grooms({})).toBeNull();
  });

  it("«Нянька» спить, обійнявши кошеня, — малому тепло; прояв «+»", () => {
    const save = game();
    Object.assign(save.current.character.body, { x: 7.5, y: 8.5 });
    const kitten = withCat(save, {}, { x: 5.5, y: 8.5 }, 1);
    kitten.act = { kind: "sleep", target: null, goal: null, minutes: 480, elapsed: 30 };
    kitten.needs.fatigue = 90;
    kitten.mood = 50;
    const nanny = withCat(save, { nurturing: 1 }, { x: 8.5, y: 8.5 });
    nanny.needs.fatigue = 99;
    let hugged = false;
    for (let seed = 1; seed <= 40 && !hugged; seed++) {
      decide(save.current, nanny, createRng(seed), { present: true });
      hugged = nanny.act.kind === "sleep" && nanny.act.target === `pile:${kitten.id}`;
    }
    expect(hugged).toBe(true);
    live(save, 62);
    expect(seen(nanny, "nurturing")).toBe(1);
    expect(kitten.mood).toBeGreaterThan(50);
  });

  it("мати щоночі тішить новонароджених, «Сам ще кошеня» — засмучує", () => {
    for (const level of [1, -1] as const) {
      const save = game();
      const mother = withCat(save, { nurturing: level });
      const baby = createCat(save.current, createRng(9), { source: "born", ageWeeks: 0, at: { x: 9.5, y: 7.5 } });
      baby.parents = { mother: mother.id, father: null };
      baby.traits = [];
      baby.mood = 50;
      addCat(save.current, baby);
      nightlyCare(save.current, createRng(1));
      expect(Math.sign(baby.mood - 50)).toBe(level);
    }
  });

  it("«Сам ще кошеня» шипить і б'є лапою кошеня, що лізе до нього, — прояв «−»", () => {
    let swatted = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const save = game(seed);
      const grump = withCat(save, { nurturing: -1 }, { x: 9.5, y: 7.5 });
      grump.act = idleAct(60);
      const kitten = withCat(save, {}, { x: 7.5, y: 7.5 }, 1);
      kitten.mood = 50;
      kitten.act = { kind: "wander", target: "play", goal: { x: 12, y: 7 }, minutes: 8, elapsed: 0 };
      const { events, stop } = recordEvents();
      live(save, 2);
      stop();
      if (!events.some((e) => e.type === "hissed" && e.cat === grump.id && e.at === kitten.id)) continue;
      swatted += 1;
      expect(kitten.mood).toBeLessThan(50);
      expect(seen(grump, "nurturing")).toBe(1);
    }
    expect(swatted).toBeGreaterThan(5);
    expect(swatted).toBeLessThan(28);
  });
});

describe("сценарій «Гра й стосунки котів» (`scenarios/play-social.json`)", () => {
  it("«Орнітолог» «кекає» на підвіконні, «Нудьгує біля вікна» злиться й шипить, «Фанат м'яти» накатався й спить", () => {
    const scenario = FILE_SCENARIOS["play-social"];
    if (!scenario) throw new Error("немає сценарію");
    const save = applyScenario(scenario);
    const byName = (name: string): Cat => save.current.cats.find((c) => c.name === name)!;
    const { events, stop } = recordEvents();
    advance(save, 40);
    stop();
    const of = (name: string, type: string): boolean => events.some((e) => e.type === type && "cat" in e && e.cat === byName(name).id);
    expect(of("Пташка", "chatter")).toBe(true);
    expect(of("Буркотун", "window-angry")).toBe(true);
    expect(of("Буркотун", "hissed")).toBe(true);
    expect(byName("М'ятка").act.kind).toBe("sleep");
  });
});
