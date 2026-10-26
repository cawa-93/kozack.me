// Етап «Новий бешкет» (§9.12 «Гра й бешкет», рішення автора 2026-10-25, `TRAITS_REVIEW.md`): групи, яких раніше в коді
// не було, — засідки, полювання, подарунки, кмітливість, лазіння й гризіння.

import { describe, expect, it } from "vitest";

import { nightlyCare } from "../src/sim/care";
import { createCat, idleAct } from "../src/sim/cat";
import { pickUpCat } from "../src/sim/actions";
import { ambushWeight, chewChance, climbWeight, decide, giftWeight, hideSpot, rollWeight, startAmbush, startCarry, startChew, tickCats, trashTipped, upHigh } from "../src/sim/catai";
import { AMBUSH, CHEWING, CLIMBING, CUNNING, GIFTS, HUNTING, PLAY_RELIEF, START_CLOTHES, STUN_PAUSE_MINUTES, TRIPS } from "../src/sim/config";
import { startWork } from "../src/sim/work";
import { addSupply, freeSlots, place, supplyCount } from "../src/sim/economy";
import { unavailable } from "../src/sim/shop";
import { advance, deserialize, interact, newGame, returnHome, serialize } from "../src/sim/game";
import { AMBUSH_SPOTS, BOX_SCRATCH, CABINET_PAW, HIGH_PLACES, hiddenTile, isSolid, itemTile, MAP_HEIGHT, MAP_WIDTH, objectById, PAPER_TRAIL, roomAt, ROLL_TILE, SPAWN, STASHES, TRASH_PAW, WIRE_TILE } from "../src/sim/home";
import { nightlyHousehold, vacuumed } from "../src/sim/household";
import { startTrip } from "../src/sim/trips";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Cat, Save, ToyItem, TraitLevel } from "../src/sim/types";
import { targetOf } from "../src/sim/targets";
import { holdUntilDone, hours, recordEvents, walkTo, withCatCorner } from "./helpers";

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

  it("стрибок із засідки знімає потребу гри раз — як гра наодинці (перевірка етапу 2026-10-26)", () => {
    const save = game();
    const cat = withCat(save, { ambush: 1 });
    lurking(cat);
    cat.needs.play = 90;
    Object.assign(save.current.character.body, { x: cat.x - 0.6, y: cat.y });
    tickCats(save.current, 0.01, { present: true });
    expect(cat.act.kind).toBe("zoomies");
    const before = cat.needs.play;
    for (let i = 0; i < 20 && cat.act.kind === "zoomies"; i++) tickCats(save.current, 0.1, { present: false });
    expect(cat.act.kind).not.toBe("zoomies");
    expect(90 - cat.needs.play).toBeGreaterThan(PLAY_RELIEF - 1);
    expect(90 - cat.needs.play).toBeLessThan(PLAY_RELIEF + 1);
    expect(before).toBeGreaterThan(cat.needs.play);
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
  it("вага розмотування: «−» — ніколи, кіт без риси — 0,05 (рішення автора 2026-10-26), «+» — більше, кошеня — удвічі; розмотаний рулон — до ранку", () => {
    const save = game();
    expect(rollWeight(save.current, withCat(save, { hunting: -1 }))).toBe(0);
    expect(rollWeight(save.current, withCat(save))).toBeCloseTo(0.05);
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

/** Іграшка-вудочка котячого кутка. */
function toyOf(save: Save): ToyItem {
  const toy = save.current.home.items.find((i) => i.kind === "toy");
  if (toy?.kind !== "toy") throw new Error("немає іграшки");
  return toy;
}

/** Кіт іде по річ і несе її: тікати, доки не донесе. */
function carryOut(save: Save, cat: Cat, present = true): void {
  for (let i = 0; i < 80 && cat.act.kind === "carry"; i++) tickCats(save.current, 0.25, { present });
}

describe("«Подарунки й схованки» (§9.12, рішення автора 2026-10-25)", () => {
  it("вага «понести річ»: «−» — ніколи, кіт без риси — 0,05, «+» — 0,15 × (1 + рівень)", () => {
    const save = game();
    expect(giftWeight(withCat(save, { gifts: -1 }))).toBe(0);
    expect(giftWeight(withCat(save))).toBeCloseTo(GIFTS.base);
    expect(giftWeight(withCat(save, { gifts: 1 }))).toBeCloseTo(2 * GIFTS.weight);
  });

  it("приносить іграшку до ніг і нявкає; пограєтеся з ним протягом 10 хвилин — любов +1", () => {
    const save = game();
    const toy = toyOf(save);
    Object.assign(toy, { x: 6.5, y: 8.5 });
    const cat = withCat(save, { gifts: 1 }, { x: 5.5, y: 8.5 });
    cat.act = { kind: "carry", target: `item:${toy.id}`, goal: itemTile(toy), minutes: GIFTS.pickMinutes, elapsed: 0, carry: "toy", dest: "feet" };
    const { events, stop } = recordEvents();
    for (let i = 0; i < 80 && cat.act.dropped !== true; i++) tickCats(save.current, 0.25, { present: true });
    stop();
    const body = save.current.character.body;
    expect(cat.act.dropped).toBe(true);
    expect(Math.hypot(toy.x - body.x, toy.y - body.y)).toBeLessThan(1.5);
    expect(events.some((e) => e.type === "meow" && e.cat === cat.id)).toBe(true);
    expect(cat.gift).toBeDefined();
    // Кіт із іграшкою в зубах на очах персонажа — прояв «+», раз за річ.
    expect(seen(cat, "gifts")).toBe(1);
    // Узяти вудку й пограти з котом поруч.
    cat.needs.play = 90;
    cat.act = idleAct(5);
    save.current.home.items = save.current.home.items.filter((i) => i !== toy);
    save.current.character.held = { kind: "toy", toy };
    Object.assign(body, { x: cat.x - 0.5, y: cat.y, facing: { x: 1, y: 0 } });
    const love = cat.love;
    advance(save, 0.25, { move: { x: 0, y: 0 }, hold: true });
    expect(cat.love).toBeGreaterThanOrEqual(love + GIFTS.thanksLove);
    expect(cat.gift).toBeUndefined();
  });

  it("заганяє іграшку під холодильник: видно краєчок, сам нею не грається, а дістали — знову звичайна", () => {
    const save = game();
    const toy = toyOf(save);
    Object.assign(toy, { x: 14.5, y: 3.5 });
    save.current.home.clothes = START_CLOTHES;
    const cat = withCat(save, { gifts: 2 }, { x: 15.5, y: 3.5 });
    cat.act = { kind: "carry", target: `item:${toy.id}`, goal: itemTile(toy), minutes: GIFTS.pickMinutes, elapsed: 0, carry: "toy", dest: "fridge" };
    carryOut(save, cat);
    expect(toy.hidden).toBe("fridge");
    expect(toy.x).toBeCloseTo(STASHES.fridge.at.x);
    // Іграшка під холодильником, а шкарпеток у кошику немає — нести нічого.
    cat.act = idleAct(1);
    startCarry(save.current, cat, createRng(2), true);
    expect(cat.act.kind).toBe("idle");
    // Кіт відійшов: з іграшкою в руках біля кота натискання нічого не робить (пір'їнка тепер збоку, біля кота).
    Object.assign(cat, { x: 9.5, y: 7.5 });
    // Персонаж дістає іграшку й кладе на підлогу — вона знову звичайна.
    walkTo(save, `item:${toy.id}`);
    interact(save);
    expect(save.current.character.held?.kind).toBe("toy");
    interact(save);
    const back = toyOf(save);
    expect(back.hidden).toBeUndefined();
  });

  it("іграшка під холодильником не заступає його: перед холодильником ціль — він, біля пір'їнки — іграшка (рішення автора 2026-10-26)", () => {
    const save = game();
    const toy = toyOf(save);
    Object.assign(toy, { x: STASHES.fridge.at.x, y: STASHES.fridge.at.y, hidden: "fridge" });
    const body = save.current.character.body;
    const targetAt = (x: number, y: number): string | undefined => {
      Object.assign(body, { x, y, facing: { x: 0, y: -1 } });
      return targetOf(save.current)?.id;
    };
    // Перед холодильником — і впритул, і на крок далі.
    for (const [x, y] of [[13.5, 2.3], [13.5, 2.5], [13.5, 2.7], [13.3, 2.4], [13.6, 2.4]] as const) expect(targetAt(x, y), `${x}, ${y}`).toBe("fridge");
    // Перед кухонною поверхнею праворуч — вона.
    expect(targetAt(14.6, 2.4)).toBe("counter-left");
    // Біля самої пір'їнки — іграшка.
    expect(targetAt(STASHES.fridge.at.x, 2.4)).toBe(`item:${toy.id}`);
  });

  it("шкарпетку з кошика білизни несе в схованку під диваном: найближчий виїзд довший на 10 хвилин", () => {
    const save = game();
    save.current.home.clothes = 2;
    const cat = withCat(save, { gifts: 1 }, { x: 9.5, y: 2.5 });
    save.current.home.items = save.current.home.items.filter((i) => i.kind !== "toy");
    startCarry(save.current, cat, createRng(2), true);
    expect(cat.act.carry).toBe("sock");
    carryOut(save, cat, false);
    expect(save.current.home.sock).toBe(true);
    save.current.cats = [];
    walkTo(save, "door");
    const { events, stop } = recordEvents();
    expect(startTrip(save.current, "shop")).toBe(true);
    stop();
    expect(events.some((e) => e.type === "sock-found" && e.where === "trip")).toBe(true);
    expect(save.current.home.sock).toBeUndefined();
    const before = save.current.minute;
    returnHome(save, TRIPS.shop.visit, TRIPS.shop.road);
    expect(save.current.minute - before).toBeCloseTo(TRIPS.shop.visit + GIFTS.sockSearch + TRIPS.shop.road);
  });

  it("пилосос знаходить шкарпетку сам", () => {
    const save = game();
    save.current.home.sock = true;
    const { events, stop } = recordEvents();
    vacuumed(save.current);
    stop();
    expect(save.current.home.sock).toBeUndefined();
    expect(events.some((e) => e.type === "sock-found" && e.where === "vacuum")).toBe(true);
  });

  it("гра наодинці біля дивана інколи заганяє іграшку під нього — у будь-якого кота", () => {
    const save = game();
    const toy = toyOf(save);
    const cat = withCat(save);
    let hidden = 0;
    for (let i = 0; i < 200; i++) {
      delete toy.hidden;
      Object.assign(toy, { x: 14.5, y: 8.5, uses: 0 });
      Object.assign(cat, { x: 14.5, y: 8.5 });
      cat.act = { kind: "toy", target: `item:${toy.id}`, goal: null, minutes: 0.05, elapsed: 0 };
      tickCats(save.current, 0.05, { present: false });
      if (toy.hidden === "sofa") hidden += 1;
    }
    expect(hidden).toBeGreaterThan(0);
    expect(hidden).toBeLessThan(25);
  });
});

/** Кухня з шафкою корму: персонаж на кухні бачить шафку й смітник. */
function kitchen(seed = 11): Save {
  const save = game(seed);
  addSupply(save.current, "catFood", "cheap", 6);
  Object.assign(save.current.character.body, { x: 15.5, y: 2.5 });
  return save;
}

/** Кіт біля шафки з кормом чи смітника: лапає їх. */
function raidAt(cat: Cat, target: "cabinet" | "trash"): void {
  const tile = target === "cabinet" ? CABINET_PAW : TRASH_PAW;
  Object.assign(cat, { x: tile.x + 0.5, y: tile.y + 0.5 });
  cat.act = { kind: "raid", target, goal: null, minutes: CUNNING.pawMinutes, elapsed: 0 };
}

describe("«Кмітливість у бешкеті» (§9.12, рішення автора 2026-10-25)", () => {
  it("голодний кіт лапою відчиняє шафку з кормом і з'їдає порцію із запасу; шафка лишається відчиненою", () => {
    const save = kitchen();
    const cat = withCat(save, { cunning: 1 });
    cat.needs.hunger = 90;
    raidAt(cat, "cabinet");
    const { events, stop } = recordEvents();
    tickCats(save.current, CUNNING.pawMinutes + 0.05, { present: true });
    expect(events.some((e) => e.type === "cabinet-pawed" && e.opened)).toBe(true);
    expect(save.current.home.cabinetOpen).toBe(true);
    expect(seen(cat, "cunning")).toBe(1);
    for (let i = 0; i < 40 && cat.act.kind === "raid"; i++) tickCats(save.current, 0.25, { present: true });
    stop();
    expect(supplyCount(save.current, "catFood")).toBe(5);
    expect(cat.needs.hunger).toBeLessThan(10);
    expect(events.some((e) => e.type === "cat-ate" && e.cat === cat.id)).toBe(true);
  });

  it("з відчиненої шафки їсть і голодний кіт без риси; персонаж, підійшовши до шафки, зачиняє її", () => {
    const save = kitchen();
    save.current.home.cabinetOpen = true;
    const cat = withCat(save);
    cat.needs.hunger = 90;
    decide(save.current, cat, createRng(1), { present: true });
    expect(cat.act.kind).toBe("raid");
    expect(cat.act.target).toBe("cabinet");
    // Шафка зачинена — кіт без риси її не відчинить і їсти звідти не піде.
    save.current.cats = [];
    walkTo(save, "cat-cabinet");
    interact(save);
    expect(save.current.home.cabinetOpen).toBeUndefined();
    save.current.cats = [cat];
    for (let seed = 1; seed <= 10; seed++) {
      cat.act = idleAct(1);
      decide(save.current, cat, createRng(seed), { present: true });
      expect(cat.act.kind).not.toBe("raid");
    }
  });

  it("замок на шафку: надійний не відчиняє ніхто, дешевий — лише «Зломник» і не завжди; спробу видно", () => {
    const save = kitchen();
    expect(freeSlots(save.current, "lock")).toBe(1);
    place(save.current, "lock", "premium");
    expect(save.current.home.lock).toBe("premium");
    expect(freeSlots(save.current, "lock")).toBe(0);
    expect(unavailable(save.current, { thing: "lock" })).toBe("owned");
    const cat = withCat(save, { cunning: 2 });
    cat.needs.hunger = 90;
    raidAt(cat, "cabinet");
    const { events, stop } = recordEvents();
    tickCats(save.current, CUNNING.pawMinutes + 0.05, { present: true });
    stop();
    expect(events.some((e) => e.type === "cabinet-pawed" && !e.opened)).toBe(true);
    expect(save.current.home.cabinetOpen).toBeUndefined();
    expect(supplyCount(save.current, "catFood")).toBe(6);
    expect(seen(cat, "cunning")).toBe(1);
    // Дешевий замок: «Відчиняє дверцята» (+1) — ніколи, «Зломник» (+2) — інколи.
    const opens = (level: TraitLevel): number => {
      let opened = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const s = kitchen(seed);
        s.current.home.lock = "cheap";
        const c = withCat(s, { cunning: level });
        c.needs.hunger = 90;
        raidAt(c, "cabinet");
        tickCats(s.current, CUNNING.pawMinutes + 0.05, { present: true });
        if (s.current.home.cabinetOpen === true) opened += 1;
      }
      return opened;
    };
    expect(opens(1)).toBe(0);
    const strong = opens(2);
    expect(strong).toBeGreaterThan(0);
    expect(strong).toBeLessThan(30);
  });

  it("дверцята на замку кіт смикає знову й знову — прояв не частіше ніж раз на пів години (перевірка етапу 2026-10-26)", () => {
    const save = kitchen();
    save.current.home.lock = "premium";
    const cat = withCat(save, { cunning: 2 });
    cat.needs.hunger = 90;
    const paw = (): void => {
      raidAt(cat, "cabinet");
      tickCats(save.current, CUNNING.pawMinutes + 0.05, { present: true });
    };
    paw();
    paw();
    paw();
    expect(seen(cat, "cunning")).toBe(1);
    save.current.minute += CUNNING.observeEvery + 1;
    paw();
    expect(seen(cat, "cunning")).toBe(2);
    // Відчинені дверцята (без замка) — окремий прояв одразу.
    delete save.current.home.lock;
    paw();
    expect(save.current.home.cabinetOpen).toBe(true);
    expect(seen(cat, "cunning")).toBe(3);
  });

  it("«Зломник» лізе в шафку й ситим — і тоді інколи зригує", () => {
    let vomits = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const save = kitchen(seed);
      save.current.home.cabinetOpen = true;
      const cat = withCat(save, { cunning: 2 });
      cat.needs.hunger = 0;
      raidAt(cat, "cabinet");
      cat.act.minutes = 1;
      for (let i = 0; i < 40 && cat.act.kind === "raid"; i++) tickCats(save.current, 0.25, { present: true });
      if (save.current.home.messes.some((m) => m.kind === "vomit")) vomits += 1;
    }
    expect(vomits).toBeGreaterThan(2);
    expect(vomits).toBeLessThan(20);
  });

  it("кіт перекидає смітник: гуркіт, сміття, викинути щось не вийде, доки сміття не прибрали", () => {
    const save = kitchen();
    const cat = withCat(save, { cunning: 1 });
    raidAt(cat, "trash");
    const { events, stop } = recordEvents();
    tickCats(save.current, CUNNING.pawMinutes + 0.05, { present: true });
    stop();
    expect(trashTipped(save.current)).toBe(true);
    expect(events.some((e) => e.type === "trash-tipped")).toBe(true);
    expect(seen(cat, "cunning")).toBe(1);
    save.current.cats = [];
    save.current.character.held = { kind: "burnt", quality: "cheap" };
    walkTo(save, "trash");
    const refusal = recordEvents();
    interact(save);
    refusal.stop();
    expect(refusal.events.find((e) => e.type === "refused")).toMatchObject({ reason: "trash-tipped" });
    save.current.character.held = null;
    const garbage = save.current.home.messes.find((m) => m.kind === "garbage");
    if (!garbage) throw new Error('немає сміття');
    Object.assign(save.current.character.body, { x: garbage.x - 0.9, y: garbage.y, facing: { x: 1, y: 0 } });
    holdUntilDone(save);
    expect(trashTipped(save.current)).toBe(false);
  });
});

/** Кіт вилазить нагору: іде спати на холодильник з сусідньої клітинки. */
function climbFridge(save: Save, cat: Cat): void {
  const fridge = objectById("fridge");
  Object.assign(cat, { x: fridge.x + 0.5, y: fridge.y + 1.5 });
  cat.act = { kind: "sleep", target: null, goal: { x: fridge.x, y: fridge.y }, minutes: 60, elapsed: 0 };
  for (let i = 0; i < 20 && cat.act.goal !== null; i++) tickCats(save.current, 0.1, { present: true });
}

describe("«Лазіння» (§9.12, рішення автора 2026-10-25)", () => {
  it("шафа в спальні не заступає дороги: кожну клітинку підлоги видно досяжною від ліжка", () => {
    const state = newGame({ sex: "female", difficulty: "normal", seed: 1 }).current;
    const start = { x: Math.floor(SPAWN.x), y: Math.floor(SPAWN.y) };
    const seen = new Set([`${start.x},${start.y}`]);
    const queue = [start];
    while (queue.length > 0) {
      const t = queue.shift()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const n = { x: t.x + dx, y: t.y + dy };
        if (isSolid(state, n.x, n.y) || seen.has(`${n.x},${n.y}`)) continue;
        seen.add(`${n.x},${n.y}`);
        queue.push(n);
      }
    }
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) if (!isSolid(state, x, y)) expect(seen.has(`${x},${y}`), `${x},${y}`).toBe(true);
    }
  });

  it("вага високого місця: «−» — ніколи, кіт без риси — 0,3, «+» — 1,5 × рівень; верхолаз ховається нагорі", () => {
    const save = game();
    expect(climbWeight(withCat(save, { climbing: -1 }))).toBe(0);
    expect(climbWeight(withCat(save))).toBeCloseTo(CLIMBING.base);
    const climber = withCat(save, { climbing: 2 });
    expect(climbWeight(climber)).toBeCloseTo(2 * CLIMBING.step);
    for (let seed = 1; seed <= 10; seed++) {
      const spot = hideSpot(save.current, createRng(seed), climber);
      expect(HIGH_PLACES.map((id) => `${objectById(id).x},${objectById(id).y}`)).toContain(`${spot.at.x},${spot.at.y}`);
    }
  });

  it("виліз на холодильник на очах персонажа — прояв «+»; нагорі на руки не взяти, на вудку злазить сам", () => {
    const save = game();
    Object.assign(save.current.character.body, { x: 14.5, y: 3.5 });
    const cat = withCat(save, { climbing: 1 });
    climbFridge(save, cat);
    expect(upHigh(save.current, cat)).toBe(true);
    expect(seen(cat, "climbing")).toBe(1);
    expect(cat.stuck).toBeUndefined();
    // Натиснути на кота на шафі — відмова «не дотягтися».
    const wardrobe = objectById("wardrobe");
    Object.assign(cat, { x: wardrobe.x + 0.5, y: wardrobe.y + 0.5 });
    Object.assign(save.current.character.body, { x: wardrobe.x + 0.5, y: wardrobe.y + 1.4, facing: { x: 0, y: -1 } });
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(events.find((e) => e.type === "refused")).toMatchObject({ reason: "cat-up-high" });
    expect(save.current.character.held).toBeNull();
    // Кіт не спить, а персонаж з вудкою поруч — злазить.
    Object.assign(cat, { x: 13.5, y: 1.5 });
    Object.assign(save.current.character.body, { x: 14.5, y: 3.5 });
    cat.act = idleAct(10);
    const toy = toyOf(save);
    save.current.home.items = save.current.home.items.filter((i) => i !== toy);
    save.current.character.held = { kind: "toy", toy };
    for (let i = 0; i < 20 && upHigh(save.current, cat); i++) tickCats(save.current, 0.25, { present: true });
    expect(upHigh(save.current, cat)).toBe(false);
  });

  it("кіт, що спить на холодильнику, не заступає самого холодильника: продукти взяти можна (перевірка етапу 2026-10-26)", () => {
    const save = game();
    addSupply(save.current, "food", "cheap", 2);
    Object.assign(save.current.character.body, { x: 14.5, y: 3.5 });
    const cat = withCat(save, { climbing: 1 });
    climbFridge(save, cat);
    expect(upHigh(save.current, cat)).toBe(true);
    Object.assign(save.current.character.body, { x: 13.5, y: 2.4, facing: { x: 0, y: -1 } });
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(events.some((e) => e.type === "refused")).toBe(false);
    expect(save.current.character.held).toMatchObject({ kind: "raw" });
    expect(cat.act.kind).toBe("sleep");
  });

  it("застрягле кошеня, втомившись кричати, засинає нагорі — і прокинувшись, кричить знову (перевірка етапу 2026-10-26)", () => {
    const save = game();
    Object.assign(save.current.character.body, { x: 14.5, y: 3.5 });
    const cat = withCat(save, {}, { x: 13.5, y: 2.5 }, 1);
    climbFridge(save, cat);
    cat.stuck = true;
    cat.act = { kind: "beg", target: "high", goal: null, minutes: 0.01, elapsed: 0 };
    cat.needs.fatigue = 100;
    tickCats(save.current, 0.1, { present: true });
    expect(cat.act.kind).toBe("sleep");
    expect(cat.stuck).toBe(true);
    expect(upHigh(save.current, cat)).toBe(true);
    // Виспалося — і знову кричить, а не злазить.
    cat.needs.fatigue = 0;
    cat.act.minutes = 0.01;
    tickCats(save.current, 0.1, { present: true });
    expect(cat.act.kind).toBe("beg");
    expect(cat.act.target).toBe("high");
    expect(cat.stuck).toBe(true);
  });

  it("стара гра: персонаж і речі там, де тепер шафа, після завантаження — поруч, і персонаж ходить (перевірка етапу 2026-10-26)", () => {
    const save = game();
    const wardrobe = objectById("wardrobe");
    Object.assign(save.current.character.body, { x: wardrobe.x + 0.4, y: wardrobe.y + 0.5 });
    const toy = toyOf(save);
    Object.assign(toy, { x: wardrobe.x + 0.5, y: wardrobe.y + 0.5 });
    save.current.home.messes.push({ id: 990, kind: "vomit", x: wardrobe.x + 0.3, y: wardrobe.y + 0.6, cat: null });
    const loaded = deserialize(serialize(save));
    const state = loaded.current;
    const body = state.character.body;
    expect(isSolid(state, Math.floor(body.x), Math.floor(body.y))).toBe(false);
    const loadedToy = state.home.items.find((i) => i.id === toy.id);
    expect(loadedToy?.kind === "toy" && isSolid(state, Math.floor(loadedToy.x), Math.floor(loadedToy.y))).toBe(false);
    const mess = state.home.messes.find((m) => m.id === 990)!;
    expect(isSolid(state, Math.floor(mess.x), Math.floor(mess.y))).toBe(false);
    // Персонаж рушає з місця.
    const from = { x: body.x, y: body.y };
    for (let i = 0; i < 10; i++) advance(loaded, 0.05, { move: { x: 0, y: 1 }, hold: false });
    expect(Math.hypot(body.x - from.x, body.y - from.y)).toBeGreaterThan(0.1);
  });

  it("кошеня застрягає нагорі: кричить, доки не знімуть (неприємне), а від нагального зістрибує саме", () => {
    let stuck: { save: Save; cat: Cat } | null = null;
    for (let seed = 1; seed <= 40 && !stuck; seed++) {
      const save = game(seed);
      Object.assign(save.current.character.body, { x: 14.5, y: 3.5 });
      const cat = withCat(save, {}, { x: 13.5, y: 2.5 }, 1);
      climbFridge(save, cat);
      if (cat.stuck === true) stuck = { save, cat };
    }
    if (!stuck) throw new Error("кошеня не застрягло жодного разу");
    const { save, cat } = stuck;
    // Сон скінчився — злізти не може: кричить.
    cat.act.minutes = 0.01;
    const meows = recordEvents();
    for (let i = 0; i < 20; i++) tickCats(save.current, 0.5, { present: true });
    meows.stop();
    expect(cat.act.kind).toBe("beg");
    expect(cat.act.target).toBe("high");
    expect(upHigh(save.current, cat)).toBe(true);
    expect(meows.events.some((e) => e.type === "meow" && e.cat === cat.id)).toBe(true);
    // Зняти кошеня — можна, і воно не ображається.
    Object.assign(save.current.character.body, { x: 13.5, y: 2.4, facing: { x: 0, y: -1 } });
    const sanity = save.current.character.stats.sanity;
    interact(save);
    expect(save.current.character.held).toMatchObject({ kind: "cat", cat: cat.id });
    expect(save.current.character.held?.kind === "cat" && save.current.character.held.offended).toBeFalsy();
    expect(cat.stuck).toBeUndefined();
    expect(save.current.character.stats.sanity).toBeLessThan(sanity);
    // Інше застрягле кошеня, якого ніхто не зняв: дуже захотіло в лоток — зістрибує саме.
    interact(save);
    climbFridge(save, cat);
    cat.stuck = true;
    cat.needs.toilet = CLIMBING.jumpNeed;
    cat.act.minutes = 0.01;
    tickCats(save.current, 0.5, { present: true });
    expect(cat.stuck).toBeUndefined();
    for (let i = 0; i < 20 && highPlaceOfCat(save, cat); i++) tickCats(save.current, 0.25, { present: true });
    expect(upHigh(save.current, cat)).toBe(false);
  });
});

/** Кіт на холодильнику чи шафі. */
function highPlaceOfCat(save: Save, cat: Cat): boolean {
  return HIGH_PLACES.some((id) => {
    const o = objectById(id);
    return Math.floor(cat.x) === o.x && Math.floor(cat.y) === o.y;
  }) && save.current.cats.includes(cat);
}

/** Кіт уже біля дроту комп'ютера чи коробок і гризе. */
function chewAt(cat: Cat, target: "wire" | "boxes"): void {
  const tile = target === "wire" ? WIRE_TILE : BOX_SCRATCH;
  Object.assign(cat, { x: tile.x + 0.5, y: tile.y + 0.5 });
  cat.act = { kind: "chew", target, goal: null, minutes: CHEWING.minMinutes, elapsed: 0 };
}

describe("«Гризіння» (§9.12, рішення автора 2026-10-25)", () => {
  it("шанс погризти: «−» і дорослий без риси — ніколи, кошеня без риси — 1% (зуби), «+» — 2% × рівень", () => {
    const save = game();
    expect(chewChance(withCat(save, { chewing: -1 }))).toBe(0);
    expect(chewChance(withCat(save))).toBe(0);
    expect(chewChance(withCat(save, {}, { x: 9.5, y: 7.5 }, 1))).toBeCloseTo(CHEWING.kitten);
    expect(chewChance(withCat(save, { chewing: 2 }))).toBeCloseTo(2 * CHEWING.decideStep);
  });

  it("дріт гризе, лише коли ніхто не працює; кошеня, яке забрали з рук, дроту не перегризе", () => {
    const save = game();
    const cat = withCat(save, { chewing: 1 });
    Object.assign(save.current.character.body, { x: 6.5, y: 7.4, facing: { x: 0, y: -1 } });
    startWork(save.current);
    expect(startChew(save.current, cat, createRng(1))).toBe(false);
    save.current.character.activity = null;
    expect(startChew(save.current, cat, createRng(1))).toBe(true);
    expect(cat.act.target).toBe("wire");
    // Забрали кота, поки гриз — дріт цілий, хоч би як довго після цього.
    for (let seed = 1; seed <= 20; seed++) {
      chewAt(cat, "wire");
      tickCats(save.current, 1, { present: true });
      pickUpCat(save.current, cat);
      save.current.character.held = null;
      tickCats(save.current, 3, { present: true });
    }
    expect(save.current.home.wireChewed).toBeUndefined();
  });

  it("кіт гризе дріт на очах персонажа — прояв «+»; перегриз — комп'ютер не працює, доки дріт не полагодять утриманням", () => {
    let found: { save: Save; cat: Cat } | null = null;
    for (let seed = 1; seed <= 60 && !found; seed++) {
      const save = game(seed);
      Object.assign(save.current.character.body, { x: 9.5, y: 8.5 });
      const cat = withCat(save, { chewing: 2 });
      chewAt(cat, "wire");
      const { events, stop } = recordEvents();
      tickCats(save.current, 0.5, { present: true });
      expect(events.some((e) => e.type === "chewing" && e.what === "wire")).toBe(true);
      expect(seen(cat, "chewing")).toBe(1);
      tickCats(save.current, CHEWING.minMinutes, { present: true });
      stop();
      if (save.current.home.wireChewed === true) found = { save, cat };
    }
    if (!found) throw new Error("дріт не перегризено жодного разу");
    const { save } = found;
    save.current.cats = [];
    walkTo(save, "computer");
    const refusal = recordEvents();
    interact(save);
    refusal.stop();
    expect(refusal.events.find((e) => e.type === "refused")).toMatchObject({ reason: "wire-chewed" });
    expect(save.current.character.activity).toBeNull();
    // Лагодити — утримати дію біля комп'ютера; тримати довше, ніж треба, — полагоджено один раз.
    const repairs = save.current.home.repairs;
    const fixed = recordEvents();
    for (let i = 0; i < 80; i++) advance(save, 0.5, { move: { x: 0, y: 0 }, hold: true });
    fixed.stop();
    expect(save.current.home.wireChewed).toBeUndefined();
    expect(fixed.events.filter((e) => e.type === "wire-fixed")).toHaveLength(1);
    expect(save.current.home.repairs).toBe(repairs + CHEWING.wireRepair);
    expect(save.current.character.activity).toBeNull();
    // Тепер працювати можна.
    advance(save, 0.1);
    interact(save);
    expect(save.current.character.activity?.kind).toBe("work");
  });

  it("гризе пакети в ящиках біля входу: одиниці запасу немає, а корм кіт з'їдає", () => {
    const save = game();
    save.current.home.boxes = { catFood: { cheap: 3, premium: 0 } };
    const cat = withCat(save, { chewing: 1 });
    cat.needs.hunger = 70;
    chewAt(cat, "boxes");
    const { events, stop } = recordEvents();
    tickCats(save.current, CHEWING.minMinutes + 0.1, { present: true });
    stop();
    expect(save.current.home.boxes?.catFood?.cheap).toBe(2);
    expect(events.some((e) => e.type === "bag-chewed" && e.product === "catFood")).toBe(true);
    expect(cat.needs.hunger).toBeLessThan(10);
  });
});
