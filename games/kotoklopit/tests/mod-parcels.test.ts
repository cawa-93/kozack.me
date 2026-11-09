// «Сусідські посилки» (§4.1, `DAY_MODIFIERS.md`): кур'єр зранку лишає біля входу сусідські коробки — не розпакувати, але коти
// гризуть і деруть їх, як свої ящики; увечері сусідка забирає посилки й бере компенсацію за пошкоджені. Обоє — гості, що
// заходять самі (§9.12 «Двері й гості»): дзвонять, за `GUESTS.ringLead` хвилин заходять, а дія біля дверей відчиняє раніше.

import { describe, expect, it } from "vitest";

import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { createCat, idleAct } from "../src/sim/cat";
import { startChew, startScratch, tickCats } from "../src/sim/catai";
import { CHEWING, GUESTS, MODIFIERS, SCRATCH } from "../src/sim/config";
import { guestAtDoor } from "../src/sim/door";
import { canUnpack, stash, unpack } from "../src/sim/economy";
import type { GameEvent } from "../src/sim/events";
import { advance, goToSleep, interact, newGame } from "../src/sim/game";
import { BOX_SCRATCH, hasBoxes, isPresent, objectById } from "../src/sim/home";
import { addCat } from "../src/sim/night";
import { startParcels } from "../src/sim/parcels";
import { createRng } from "../src/sim/rng";
import { boxesShown } from "../src/sim/storage";
import { targetOf } from "../src/sim/targets";
import { formatClock } from "../src/sim/time";
import { traces } from "../src/sim/traces";
import { canLeave } from "../src/sim/trips";
import type { Cat, CatAct, GameState, Save, TraitLevel, Trip } from "../src/sim/types";
import { PARCELS_TEXTS, parcelsCourierText, parcelsPickupText } from "../src/texts";
import { dayTitle } from "../src/ui/cards";
import { scheduleOf } from "../src/view/schedule";
import { hours, recordEvents, standAt, withCatCorner } from "./helpers";

const P = MODIFIERS.parcels;
const COURIER_LINE = `${formatClock(P.arrive)} посилки`;
const NEIGHBOR_LINE = `${formatClock(P.pickup)} сусідка`;

/** Субота (без роботи), день «Сусідські посилки» о `minute`; персонаж біля дверей. `stage` — чий візит попереду. */
function game(minute: number, stage: "courier" | "neighbor" = "courier", seed = 31): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed }));
  const state = save.current;
  state.day = 5;
  state.minute = minute;
  state.modifiers.day = "neighbor-parcels";
  state.today.parcels = { stage };
  state.character.money = 1000;
  if (stage === "neighbor") state.home.parcels = { count: P.count, damaged: 0 };
  standAt(save, "door");
  return save;
}

/** Дожити до хвилини дня. */
const until = (save: Save, minute: number): void => {
  advance(save, minute - save.current.minute);
};

const TRIP = { destination: "shop", phase: "visit", cat: null } as unknown as Trip;

const modifier = (events: GameEvent[], kind: string): GameEvent[] => events.filter((e) => e.type === "modifier" && e.kind === kind);
const bells = (events: GameEvent[]): number => events.filter((e) => e.type === "doorbell").length;
const damages = (events: GameEvent[], how?: "chewed" | "scratched"): number =>
  events.filter((e) => e.type === "parcel-damaged" && (how === undefined || e.how === how)).length;

function withCat(save: Save, traits: Record<string, TraitLevel> = {}): Cat {
  const cat = createCat(save.current, createRng(save.current.cats.length + 7), { source: "shelter", ageWeeks: 30, at: { x: 5.5, y: 8.5 } });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: true }));
  cat.arrivedDay = -10;
  cat.sterilized = true;
  cat.act = idleAct(30);
  cat.needs = { hunger: 10, thirst: 10, toilet: 10, fatigue: 10, attention: 10, play: 10 };
  addCat(save.current, cat);
  return cat;
}

/** Кіт уже біля купи ящиків і зараз закінчить дію (як у `tests/traces.test.ts`). */
function atBoxes(save: Save, cat: Cat, act: Pick<CatAct, "kind" | "target" | "minutes">): void {
  cat.needs.hunger = 10;
  Object.assign(cat, { x: BOX_SCRATCH.x + 0.5, y: BOX_SCRATCH.y + 0.5 });
  cat.act = { ...act, goal: null, elapsed: 0 };
  tickCats(save.current, act.minutes + 0.1, { present: true });
}

const chew = (save: Save, cat: Cat): void => atBoxes(save, cat, { kind: "chew", target: "boxes", minutes: CHEWING.minMinutes });
const scratch = (save: Save, cat: Cat): void => atBoxes(save, cat, { kind: "scratch", target: "boxes", minutes: SCRATCH.minutes });

describe("кур'єр із посилками (§4.1)", () => {
  it("о `arrive` дзвонить, за `GUESTS.ringLead` заходить: двері, коробки біля входу, картка; поки під дверима — поїхати не можна", () => {
    const save = game(P.arrive - 10);
    const state = save.current;
    expect(scheduleOf(state)).toEqual([COURIER_LINE, NEIGHBOR_LINE]);
    const { events, stop } = recordEvents();
    until(save, P.arrive + 1);
    expect(bells(events)).toBe(1);
    expect(guestAtDoor(state)).toBe("parcels");
    expect(canLeave(state)).toBe(false);
    expect(state.home.parcels).toBeUndefined();
    until(save, P.arrive + GUESTS.ringLead + 1);
    stop();
    expect(state.home.parcels).toEqual({ count: P.count, damaged: 0 });
    expect(modifier(events, "parcels")).toEqual([{ type: "modifier", kind: "parcels", value: P.count }]);
    expect(guestAtDoor(state)).toBeNull();
    expect(state.today.guest).toBeUndefined();
    expect(state.today.parcels).toEqual({ stage: "neighbor" });
    expect(canLeave(state)).toBe(true);
    // Для котів — ящики біля входу (§6.4): купа стоїть, по коробці на посилку.
    expect(hasBoxes(state)).toBe(true);
    expect(isPresent(state, objectById("boxes"))).toBe(true);
    expect(boxesShown(state)).toBe(Math.min(4, P.count));
    expect(scheduleOf(state)).toEqual([NEIGHBOR_LINE]);
    expect(parcelsCourierText(P.count)).toBe(`Кур'єр лишив біля входу ${P.count} коробки для сусідки.`);
  });

  it("подзвонив — дія біля дверей відчиняє одразу, а у свою хвилину він уже не приходить (§9.12)", () => {
    const save = game(P.arrive - 10);
    const state = save.current;
    const { events, stop } = recordEvents();
    until(save, P.arrive + 1);
    interact(save);
    expect(modifier(events, "parcels")).toHaveLength(1);
    expect(state.home.parcels).toEqual({ count: P.count, damaged: 0 });
    expect(state.trip).toBeNull();
    // Кому відчинили раніше, того в розкладі вже немає.
    expect(scheduleOf(state)).toEqual([NEIGHBOR_LINE]);
    until(save, P.arrive + 30);
    stop();
    expect(modifier(events, "parcels")).toHaveLength(1);
    expect(bells(events)).toBe(1);
    expect(state.today.guest).toBeUndefined();
    expect(state.today.parcels).toEqual({ stage: "neighbor" });
  });

  it("персонажа немає вдома — кур'єр дзвонить, щойно він повернувся, а заходить за `GUESTS.ringLead`", () => {
    const save = game(P.arrive - 10);
    const state = save.current;
    state.trip = { ...TRIP };
    const { events, stop } = recordEvents();
    until(save, hours(12));
    expect(bells(events)).toBe(0);
    expect(state.home.parcels).toBeUndefined();
    // Поки не прийшов — рядок у розкладі лишається: персонаж знає, що посилки ще будуть.
    expect(scheduleOf(state)).toContain(COURIER_LINE);
    state.trip = null;
    advance(save, 1);
    expect(bells(events)).toBe(1);
    expect(guestAtDoor(state)).toBe("parcels");
    advance(save, GUESTS.ringLead);
    stop();
    expect(state.home.parcels).toEqual({ count: P.count, damaged: 0 });
  });

  it("повернувся після сусідки — посилок не було: ні дзвінка, ні коробок, ні сусідки, і вночі нічого", () => {
    const save = game(P.arrive - 10);
    const state = save.current;
    state.trip = { ...TRIP };
    const { events, stop } = recordEvents();
    until(save, P.pickup + 30);
    state.trip = null;
    until(save, P.pickup + 90);
    expect(bells(events)).toBe(0);
    expect(state.today.parcels).toBeUndefined();
    expect(state.home.parcels).toBeUndefined();
    expect(scheduleOf(state)).toEqual([]);
    state.minute = hours(23);
    const night = goToSleep(save);
    stop();
    expect(night?.parcels).toBeUndefined();
    expect(events.some((e) => e.type === "modifier" && e.kind.startsWith("parcels"))).toBe(false);
  });
});

describe("посилки біля входу: не розпаковуються (§4.1)", () => {
  it("купа лише з посилок — не ціль дії: розпаковувати нічого, і відмови «немає місця» немає", () => {
    const save = game(hours(12), "neighbor");
    const state = save.current;
    expect(canUnpack(state)).toBe(false);
    expect(unpack(state)).toEqual([]);
    expect(state.home.parcels).toEqual({ count: P.count, damaged: 0 });
    standAt(save, "boxes");
    expect(targetOf(state)?.id).not.toBe("boxes");
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(events.some((e) => e.type === "refused" && e.object === "boxes")).toBe(false);
    expect(state.home.parcels).toEqual({ count: P.count, damaged: 0 });
  });

  it("з покупками купа — ціль, як завжди: розпаковуються лише покупки, посилки лишаються в купі", () => {
    const save = game(hours(12), "neighbor");
    const state = save.current;
    stash(state, "litter", "cheap", 3);
    standAt(save, "boxes");
    expect(targetOf(state)?.id).toBe("boxes");
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(events.some((e) => e.type === "unpacked")).toBe(true);
    expect(state.home.boxes?.litter).toBeUndefined();
    expect(state.home.parcels).toEqual({ count: P.count, damaged: 0 });
    expect(hasBoxes(state)).toBe(true);
    expect(boxesShown(state)).toBe(Math.min(4, P.count));
    // Тепер купа знову лише з посилок — не ціль.
    expect(targetOf(state)?.id).not.toBe("boxes");
  });

  it("покупки й посилки — коробок у купі за обома, не більше чотирьох", () => {
    const state = game(hours(12), "neighbor").current;
    stash(state, "litter", "cheap", 3);
    expect(boxesShown(state)).toBe(Math.min(4, P.count + 1));
  });
});

describe("коти й посилки: гризіння й дряпання (§4.1, §9.12)", () => {
  it("гризе купу лише з посилок — щоразу одна ціла пошкоджена, кожна раз; погризений клапан", () => {
    const save = game(hours(12), "neighbor");
    const cat = withCat(save, { chewing: 2 });
    const { events, stop } = recordEvents();
    for (let i = 0; i < P.count + 2; i++) chew(save, cat);
    stop();
    expect(save.current.home.parcels).toEqual({ count: P.count, damaged: P.count });
    expect(damages(events, "chewed")).toBe(P.count);
    expect(events.some((e) => e.type === "bag-chewed")).toBe(false);
    expect(traces(save.current)).toContain("boxes-chewed");
  });

  it("гризіння обирає між своїми пакетами й цілими посилками; пошкоджену вдруге не рахують", () => {
    const save = game(hours(12), "neighbor");
    save.current.home.boxes = { catFood: { cheap: 20, premium: 0 } };
    const cat = withCat(save, { chewing: 2 });
    const { events, stop } = recordEvents();
    const tries = 12;
    for (let i = 0; i < tries; i++) chew(save, cat);
    stop();
    const bags = events.filter((e) => e.type === "bag-chewed").length;
    expect(damages(events, "chewed")).toBeGreaterThan(0);
    expect(damages(events, "chewed")).toBeLessThanOrEqual(P.count);
    expect(bags).toBeGreaterThan(0);
    expect(bags + damages(events)).toBe(tries);
    expect(save.current.home.boxes?.catFood?.cheap).toBe(20 - bags);
    expect(save.current.home.parcels?.damaged).toBe(damages(events));
  });

  it("дере купу — одна ціла посилка пошкоджена, кожна раз; сліди кігтів", () => {
    const save = game(hours(12), "neighbor");
    const cat = withCat(save, { scratching: -2 });
    const { events, stop } = recordEvents();
    for (let i = 0; i < P.count + 1; i++) scratch(save, cat);
    stop();
    expect(save.current.home.parcels).toEqual({ count: P.count, damaged: P.count });
    expect(damages(events, "scratched")).toBe(P.count);
    expect(traces(save.current)).toContain("boxes-claws");
  });

  it("погризена й подерта — та сама посилка не пошкоджується двічі: пошкоджених не більше, ніж посилок", () => {
    const save = game(hours(12), "neighbor");
    const cat = withCat(save, { chewing: 2, scratching: -2 });
    for (let i = 0; i < P.count; i++) {
      chew(save, cat);
      scratch(save, cat);
    }
    expect(save.current.home.parcels?.damaged).toBe(P.count);
  });

  it("купа лише з посилок — для котів ті самі ящики: «Гризіння» йде гризти їх, «Дряпання −2» — дерти (`SCRATCH.boxes`)", () => {
    const save = game(hours(12), "neighbor");
    const state = save.current;
    // Дріт уже перегризено: гризти лишається тільки купу.
    state.home.wireChewed = true;
    const chewer = withCat(save, { chewing: 2 });
    const scratcher = withCat(save, { scratching: -2 });
    const rng = createRng(5);
    expect(startChew(state, chewer, rng)).toBe(true);
    expect(chewer.act.target).toBe("boxes");
    const spots = new Set<string | null>();
    for (let i = 0; i < 40; i++) {
      startScratch(state, scratcher, rng);
      spots.add(scratcher.act.target);
    }
    expect(spots.has("boxes")).toBe(true);
    // Посилок немає — купи немає, і дерти її теж.
    delete state.home.parcels;
    spots.clear();
    for (let i = 0; i < 40; i++) {
      startScratch(state, scratcher, rng);
      spots.add(scratcher.act.target);
    }
    expect(spots.has("boxes")).toBe(false);
  });
});

describe("сусідка ввечері (§4.1)", () => {
  it("о `pickup` дзвонить, за `GUESTS.ringLead` забирає посилки; усі цілі — «дякую», гроші ті самі; купа й сліди на ній зникають", () => {
    const save = game(P.pickup - 10, "neighbor");
    const state = save.current;
    state.home.traces = ["sofa", "boxes-claws"];
    expect(scheduleOf(state)).toEqual([NEIGHBOR_LINE]);
    const { events, stop } = recordEvents();
    until(save, P.pickup + 1);
    expect(bells(events)).toBe(1);
    expect(guestAtDoor(state)).toBe("neighbor");
    until(save, P.pickup + GUESTS.ringLead + 1);
    stop();
    const taken = modifier(events, "parcels-taken");
    expect(taken).toHaveLength(1);
    expect(taken[0]).toMatchObject({ value: 0, paid: 0, parcels: { count: P.count, damaged: 0, fine: 0, paid: 0 } });
    expect(state.character.money).toBe(1000);
    expect(state.home.parcels).toBeUndefined();
    expect(hasBoxes(state)).toBe(false);
    expect(traces(state)).toEqual(["sofa"]);
    expect(state.today.parcels).toBeUndefined();
    expect(state.today.guest).toBeUndefined();
    expect(scheduleOf(state)).toEqual([]);
    expect(parcelsPickupText({ count: P.count, damaged: 0, fine: 0, paid: 0 }, false)).toBe(PARCELS_TEXTS.thanks);
  });

  it("за кожну пошкоджену — `MODIFIERS.parcels.fine`, тією ж статтею витрат, що й штраф ОСББ", () => {
    const save = game(P.pickup - 10, "neighbor");
    const state = save.current;
    state.home.parcels = { count: P.count, damaged: 2 };
    const other = state.ledger?.spent.other ?? 0;
    const { events, stop } = recordEvents();
    until(save, P.pickup + GUESTS.ringLead + 1);
    stop();
    const pickup = { count: P.count, damaged: 2, fine: 2 * P.fine, paid: 2 * P.fine };
    expect(modifier(events, "parcels-taken")[0]).toMatchObject({ value: 2 * P.fine, paid: 2 * P.fine, parcels: pickup });
    expect(state.character.money).toBe(1000 - 2 * P.fine);
    expect(state.ledger?.spent.other).toBe(other + 2 * P.fine);
    expect(parcelsPickupText(pickup, false)).toBe(`Сусідка забрала посилки й помітила, що коти до них добралися. Компенсація за 2 посилки: ${2 * P.fine} ₴.`);
  });

  it("грошей бракує — сплачено, скільки було; нема чим — картка каже й це", () => {
    const short = game(P.pickup - 10, "neighbor");
    short.current.home.parcels = { count: P.count, damaged: 2 };
    short.current.character.money = P.fine;
    const { events, stop } = recordEvents();
    until(short, P.pickup + GUESTS.ringLead + 1);
    expect(short.current.character.money).toBe(0);
    const paid = modifier(events, "parcels-taken")[0];
    expect(paid).toMatchObject({ value: 2 * P.fine, paid: P.fine });
    if (paid?.type !== "modifier" || !paid.parcels) throw new Error("немає картки");
    expect(parcelsPickupText(paid.parcels, false)).toContain(`Компенсація за 2 посилки: ${2 * P.fine} ₴. Заплатили ${P.fine} ₴ — усе, що було.`);

    const broke = game(P.pickup - 10, "neighbor");
    broke.current.home.parcels = { count: P.count, damaged: 1 };
    broke.current.character.money = 0;
    events.length = 0;
    until(broke, P.pickup + GUESTS.ringLead + 1);
    stop();
    const none = modifier(events, "parcels-taken")[0];
    if (none?.type !== "modifier" || !none.parcels) throw new Error("немає картки");
    expect(none.parcels).toEqual({ count: P.count, damaged: 1, fine: P.fine, paid: 0 });
    expect(parcelsPickupText(none.parcels, false)).toBe(`Сусідка забрала посилки й помітила, що коти до них добралися. Компенсація за 1 посилку: ${P.fine} ₴. Заплатити не було чим.`);
  });

  it("персонажа немає вдома — сусідка дзвонить, щойно він повернувся", () => {
    const save = game(P.pickup - 10, "neighbor");
    const state = save.current;
    state.trip = { ...TRIP };
    const { events, stop } = recordEvents();
    until(save, hours(21));
    expect(bells(events)).toBe(0);
    expect(state.home.parcels).toEqual({ count: P.count, damaged: 0 });
    state.trip = null;
    advance(save, 1);
    expect(guestAtDoor(state)).toBe("neighbor");
    advance(save, GUESTS.ringLead);
    stop();
    expect(modifier(events, "parcels-taken")).toHaveLength(1);
    expect(state.home.parcels).toBeUndefined();
  });

  it("подзвонила — дія біля дверей відчиняє одразу; у свою хвилину не повторюється", () => {
    const save = game(P.pickup - 10, "neighbor");
    const state = save.current;
    state.home.parcels = { count: P.count, damaged: 1 };
    const { events, stop } = recordEvents();
    until(save, P.pickup + 1);
    interact(save);
    expect(modifier(events, "parcels-taken")).toHaveLength(1);
    expect(state.character.money).toBe(1000 - P.fine);
    expect(scheduleOf(state)).toEqual([]);
    until(save, P.pickup + 30);
    stop();
    expect(modifier(events, "parcels-taken")).toHaveLength(1);
    expect(state.character.money).toBe(1000 - P.fine);
    expect(state.today.parcels).toBeUndefined();
  });
});

describe("ліг, не дочекавшись сусідки (§4.1)", () => {
  /** Вечір, посилки вдома; час перескакує на 23:00 без ходу, тож сусідка ще не приходила. */
  function lateEvening(damaged: number, day = 5): Save {
    const save = game(P.pickup - 30, "neighbor");
    save.current.day = day;
    save.current.home.parcels = { count: P.count, damaged };
    save.current.minute = hours(23);
    return save;
  }

  it("сусідка забирає вранці: компенсація та сама — у звіті ночі й рядком на титулці", () => {
    const save = lateEvening(1);
    const night = goToSleep(save);
    const state = save.current;
    expect(night?.parcels).toEqual({ count: P.count, damaged: 1, fine: P.fine, paid: P.fine });
    expect(state.lastNight?.parcels).toEqual(night?.parcels);
    expect(state.character.money).toBe(1000 - P.fine);
    expect(state.home.parcels).toBeUndefined();
    expect(state.today.parcels).toBeUndefined();
    expect(hasBoxes(state)).toBe(false);
    const lines = dayTitle(state, night).flatMap((s) => s.blocks.flat());
    expect(lines).toContain(`Зранку сусідка забрала посилки й помітила, що коти до них добралися. Компенсація за 1 посилку: ${P.fine} ₴.`);
  });

  it("усі цілі — титулка каже «дякую», гроші ті самі", () => {
    const save = lateEvening(0);
    const night = goToSleep(save);
    expect(save.current.character.money).toBe(1000);
    const lines = dayTitle(save.current, night).flatMap((s) => s.blocks.flat());
    expect(lines).toContain(PARCELS_TEXTS.thanksMorning);
  });

  it("сусідка подзвонила, а персонаж ліг — забирає теж уранці, і під дверима вранці нікого", () => {
    const save = game(P.pickup - 10, "neighbor");
    until(save, P.pickup + 1);
    expect(guestAtDoor(save.current)).toBe("neighbor");
    save.current.minute = hours(23);
    const night = goToSleep(save);
    expect(night?.parcels?.count).toBe(P.count);
    expect(save.current.today.guest).toBeUndefined();
    expect(guestAtDoor(save.current)).toBeNull();
  });

  it("у ніч на понеділок компенсація — уже з нового тижня: у звіті тижня, що минув, її немає", () => {
    const save = lateEvening(2, 6);
    const night = goToSleep(save);
    expect(night?.weekly).toBe(true);
    expect(night?.parcels?.paid).toBe(2 * P.fine);
    expect(night?.ledger?.spent.other ?? 0).toBe(0);
    expect(save.current.ledger?.spent.other).toBe(2 * P.fine);
  });
});

describe("ранок і розклад (§4.1, §8.4)", () => {
  it("ранок: у день «Сусідські посилки» попереду кур'єр, в інший день запису немає", () => {
    const state = newGame({ address: "she", difficulty: "normal", seed: 3 }).current;
    state.modifiers.day = "neighbor-parcels";
    startParcels(state);
    expect(state.today.parcels).toEqual({ stage: "courier" });
    state.modifiers.day = "guests";
    startParcels(state);
    expect(state.today.parcels).toBeUndefined();
  });

  it("розклад: обидва візити — поки не прийшли; в інший день і без запису — нічого", () => {
    const save = game(hours(8));
    const state: GameState = save.current;
    expect(scheduleOf(state)).toEqual([COURIER_LINE, NEIGHBOR_LINE]);
    state.modifiers.day = null;
    expect(scheduleOf(state)).toEqual([]);
    state.modifiers.day = "neighbor-parcels";
    delete state.today.parcels;
    expect(scheduleOf(state)).toEqual([]);
  });
});

describe("сценарії «Сусідські посилки» (режим розробки)", () => {
  it("зранку: після дзвінка дія біля дверей — посилки одразу; купа лише з них — для котів ящики", () => {
    const scenario = FILE_SCENARIOS["neighbor-parcels"];
    if (!scenario) throw new Error("немає сценарію");
    const save = applyScenario(scenario);
    const { events, stop } = recordEvents();
    until(save, P.arrive + 1);
    expect(bells(events)).toBe(1);
    expect(targetOf(save.current)?.id).toBe("door");
    interact(save);
    stop();
    expect(modifier(events, "parcels")).toHaveLength(1);
    expect(hasBoxes(save.current)).toBe(true);
  });

  it("увечері: сусідка забирає посилки, грошей не на всю компенсацію", () => {
    const scenario = FILE_SCENARIOS["neighbor-parcels-evening"];
    if (!scenario) throw new Error("немає сценарію");
    const save = applyScenario(scenario);
    const money = save.current.character.money;
    const { events, stop } = recordEvents();
    until(save, P.pickup + GUESTS.ringLead + 1);
    stop();
    expect(modifier(events, "parcels-taken")[0]).toMatchObject({ value: 2 * P.fine, paid: Math.min(money, 2 * P.fine) });
    expect(save.current.home.parcels).toBeUndefined();
  });
});
