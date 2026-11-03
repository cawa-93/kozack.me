// Гість подзвонив — двері відчиняють йому (§9.12 «Подзвонили — двері гостю», рішення автора 2026-11-03): поки той, хто заходить
// сам, подзвонив і ще не зайшов, дія біля дверей впускає його одразу, а не відкриває «Куди поїхати?»; у свою хвилину візит не
// повторюється. Кур'єр і знайда — як і раніше: двері забирають пакунки, а картка знайди без рішення не закривається.

import { describe, expect, it } from "vitest";

import { createCat, idleAct } from "../src/sim/cat";
import { tickCats } from "../src/sim/catai";
import { GUESTS, MODIFIERS } from "../src/sim/config";
import { courierNow, jumpTo, setTime } from "../src/dev/commands";
import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { fallIll } from "../src/sim/diseases";
import { DOOR_TILE, GUEST_DAY, guestAtDoor } from "../src/sim/door";
import type { GameEvent } from "../src/sim/events";
import { advance, deserialize, goToSleep, interact, newGame, serialize } from "../src/sim/game";
import { DAY_PAIRS } from "../src/sim/modifiers";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { targetOf } from "../src/sim/targets";
import { canLeave } from "../src/sim/trips";
import type { Cat, DoorGuest, GameState, Save, TraitLevel } from "../src/sim/types";
import { foundlingCard } from "../src/ui/cards";
import { scheduleOf } from "../src/view/schedule";
import { hours, recordEvents, standAt } from "./helpers";

/** Мама дзвонить о цій хвилині (сценарій дня «Мамині гостинці» кидає її випадково, §4.1). */
const MOM_AT = hours(12);

/** Хто заходить сам (§4.1): день, хвилина входу, подія дня й наслідок візиту — щоб перевірити, що він той самий. */
interface Guest {
  who: DoorGuest;
  day: string;
  /** Коли заходить сам; дзвонить за `GUESTS.ringLead` хвилин до цього. */
  minute: number;
  /** Подія дня, з якої сцена показує картку. */
  kind: string;
  /** Підготувати те, що візит змінить. */
  prepare: (state: GameState, cat: Cat) => void;
  /** Що змінює візит (судочки, відомі хвороби, гроші, здоровий глузд, безлад) — і на скільки (`delta`). */
  effect: (state: GameState, cat: Cat) => number;
  delta: number;
}

const MESS = { id: 990, kind: "surprise", x: 3.5, y: 8.5, cat: null } as const;

const GUESTS_BY_DOOR: Guest[] = [
  {
    who: "mom",
    day: "mom-food",
    minute: MOM_AT + GUESTS.ringLead,
    kind: "mom-food",
    prepare: (state) => {
      state.today.mom = { at: MOM_AT };
    },
    effect: (state) => state.home.supplies.momMeal.cheap,
    delta: 2,
  },
  {
    who: "home-vet",
    day: "home-vet",
    minute: MODIFIERS.homeVetMinute,
    kind: "home-vet",
    prepare: (state, cat) => fallIll(state, cat, "cold"),
    effect: (_, cat) => cat.diseases.filter((d) => d.known).length,
    delta: 1,
  },
  {
    who: "inspection",
    day: "inspection",
    minute: MODIFIERS.inspection.minute,
    kind: "inspection",
    prepare: (state) => {
      state.home.messes.push({ ...MESS });
    },
    effect: (state) => state.character.money,
    delta: -MODIFIERS.inspection.mess,
  },
  {
    who: "guests",
    day: "guests",
    minute: MODIFIERS.guests.minute,
    kind: "guests",
    prepare: (state) => {
      state.home.messes.push({ ...MESS });
    },
    effect: (state) => state.character.stats.sanity,
    delta: MODIFIERS.guests.mess,
  },
  {
    who: "cleaner",
    day: "cleaner",
    minute: MODIFIERS.cleaner.minute,
    kind: "cleaner",
    prepare: (state) => {
      state.home.messes.push({ ...MESS });
    },
    effect: (state) => state.home.messes.length,
    delta: -1,
  },
];

/**
 * Субота (без роботи), день гостя, 8 хвилин до дзвінка; персонаж біля дверей, з порожніми руками. Удома — кіт без рис, що спить
 * далеко від дверей: не вибіжить, коли їх відчинять, а ветеринарці є кого оглянути.
 */
function game(guest: Guest, seed = 21): { save: Save; cat: Cat } {
  const save = newGame({ address: "she", difficulty: "normal", seed });
  const state = save.current;
  state.day = 5;
  state.minute = guest.minute - GUESTS.ringLead - 8;
  state.modifiers.day = guest.day;
  state.character.money = 1000;
  state.character.stats.sanity = 70;
  const cat = withCat(save, {}, { x: 5.5, y: 8.5 });
  cat.act = { kind: "sleep", target: null, goal: null, minutes: 600, elapsed: 0 };
  guest.prepare(state, cat);
  standAt(save, "door");
  return { save, cat };
}

function withCat(save: Save, traits: Record<string, TraitLevel>, at: { x: number; y: number }): Cat {
  const cat = createCat(save.current, createRng(save.current.cats.length + 4), { source: "shelter", ageWeeks: 30, at });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: true }));
  cat.arrivedDay = -10;
  cat.sterilized = true;
  cat.act = idleAct(30);
  cat.needs = { hunger: 10, thirst: 10, toilet: 10, fatigue: 10, attention: 10, play: 10 };
  addCat(save.current, cat);
  return cat;
}

const visitsOf = (events: GameEvent[], kind: string): GameEvent[] => events.filter((e) => e.type === "modifier" && e.kind === kind);
const bells = (events: GameEvent[]): number => events.filter((e) => e.type === "doorbell").length;

/** Дожити до дзвінка (ще хвилина, щоб і мама встигла подзвонити): гість під дверима. */
function untilRing(save: Save, guest: Guest): void {
  advance(save, guest.minute - GUESTS.ringLead + 1 - save.current.minute);
}

/** Повз призначену хвилину гостя — ще пів години. */
function pastVisit(save: Save, guest: Guest): void {
  advance(save, guest.minute + 30 - save.current.minute);
}

describe("гість подзвонив — дія біля дверей відчиняє йому (§9.12, рішення автора 2026-11-03)", () => {
  it("кожен гість — подія свого дня з переліку модифікаторів (§4.1), явно, а не збігом назв; тут перевірено кожного", () => {
    const days = new Set(DAY_PAIRS.flatMap((p) => [p.hard, p.easy]));
    for (const [who, day] of Object.entries(GUEST_DAY)) {
      expect(days.has(day), who).toBe(true);
      expect(GUESTS_BY_DOOR.find((g) => g.who === who)?.day, who).toBe(day);
    }
    expect(GUESTS_BY_DOOR).toHaveLength(Object.keys(GUEST_DAY).length);
    // Мама — день «Мамині гостинці»: назва гостя й назва дня різні.
    expect(GUEST_DAY.mom).toBe("mom-food");
  });

  for (const guest of GUESTS_BY_DOOR) {
    it(`${guest.who}: дзвінок → двері → подія одразу, без поїздки; у свою хвилину візит не повторюється`, () => {
      const { save, cat } = game(guest);
      const state = save.current;
      const { events, stop } = recordEvents();
      untilRing(save, guest);
      expect(bells(events)).toBe(1);
      expect(guestAtDoor(state)).toBe(guest.who);
      // Під дверима чекає гість — «Куди поїхати?» не відкривається (сцена відкриває її лише тоді, коли `canLeave`).
      expect(canLeave(state)).toBe(false);
      expect(visitsOf(events, guest.kind)).toHaveLength(0);

      // Натискання не забирає часу: наслідок візиту — рівно той, що й у свою хвилину.
      const before = guest.effect(state, cat);
      interact(save);
      expect(visitsOf(events, guest.kind)).toHaveLength(1);
      expect(guest.effect(state, cat) - before).toBeCloseTo(guest.delta);
      expect(state.trip).toBeNull();
      expect(guestAtDoor(state)).toBeNull();
      // Гість зайшов — під дверима знову нікого: можна й поїхати.
      expect(canLeave(state)).toBe(true);

      pastVisit(save, guest);
      stop();
      expect(visitsOf(events, guest.kind)).toHaveLength(1);
      expect(bells(events)).toBe(1);
      // Запис про гостя знято у свою хвилину; мамин — уранці (її хвилини вже немає).
      if (guest.who !== "mom") expect(state.today.guest).toBeUndefined();
    });

    it(`${guest.who}: не відчинили — як і раніше: між дзвінком і входом поїхати не можна, заходить у свою хвилину й раз`, () => {
      const { save, cat } = game(guest);
      const state = save.current;
      const { events, stop } = recordEvents();
      untilRing(save, guest);
      while (state.minute < guest.minute - 0.5) {
        expect(canLeave(state), `${state.minute}`).toBe(false);
        expect(guestAtDoor(state)).toBe(guest.who);
        advance(save, 0.5);
      }
      expect(visitsOf(events, guest.kind)).toHaveLength(0);
      // Хвилина, за яку гість заходить: наслідок той самий (за хвилину інше майже не змінюється).
      const before = guest.effect(state, cat);
      advance(save, 1);
      expect(visitsOf(events, guest.kind)).toHaveLength(1);
      expect(guest.effect(state, cat) - before).toBeCloseTo(guest.delta, 0);
      pastVisit(save, guest);
      stop();
      expect(visitsOf(events, guest.kind)).toHaveLength(1);
      expect(guestAtDoor(state)).toBeNull();
      expect(state.today.guest).toBeUndefined();
      expect(canLeave(state)).toBe(true);
    });
  }

  it("кота на руках, відчиняючи гостю, не опускають — його й узяли, щоб не вибіг", () => {
    const guest = GUESTS_BY_DOOR.find((g) => g.who === "guests");
    if (!guest) throw new Error("немає гостей");
    const { save } = game(guest);
    const state = save.current;
    const held = withCat(save, { guests: 2, escape: 2 }, { x: 9.5, y: 9.5 });
    untilRing(save, guest);
    state.character.held = { kind: "cat", cat: held.id };
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(visitsOf(events, "guests")).toHaveLength(1);
    expect(state.character.held).toEqual({ kind: "cat", cat: held.id });
    expect(held.away).toBeNull();
    // Без гостя під дверима кота з рук, як і раніше, опускають.
    interact(save);
    expect(state.character.held).toBeNull();
  });

  it("«+», що чекав під дверима, зустрічає ще рівно 5 хвилин від того, як впустили, а не від 19:00 (рецензія 2026-11-03)", () => {
    const guest = GUESTS_BY_DOOR.find((g) => g.who === "guests");
    if (!guest) throw new Error("немає гостей");
    // «+» сидить під дверима, тож, коли їх відчиняють, може вибігти на сходи (10%): тоді зустрічати вже нікому — беремо перший
    // seed, де він лишився вдома. Перевірка безумовна: такий seed має знайтися.
    let checked = false;
    for (let seed = 21; seed < 41 && !checked; seed++) {
      const { save } = game(guest, seed);
      const host = withCat(save, { guests: 1 }, { x: 9.5, y: 8.5 });
      untilRing(save, guest);
      // Ще 3 хвилини під дверима — дія вже йде: `minutes` — лишок, `elapsed` — скільки минуло.
      advance(save, 3);
      expect(host.act.target).toBe("guest");
      expect(host.act.goal).toBeNull();
      expect(host.act.elapsed).toBeGreaterThan(2);
      interact(save);
      if (host.away !== null) continue;
      checked = true;
      expect(host.act.target).toBe("guest");
      expect(host.act.minutes).toBeCloseTo(GUESTS.greetMinutes, 9);
      advance(save, GUESTS.greetMinutes - 0.1);
      expect(host.act.target).toBe("guest");
      advance(save, 0.2);
      expect(host.act.target).not.toBe("guest");
    }
    expect(checked).toBe(true);
  });

  it("«−», що сховався від дзвінка, сидить у схованці ще рівно 2 години від того, як гості зайшли (рецензія 2026-11-03)", () => {
    const guest = GUESTS_BY_DOOR.find((g) => g.who === "guests");
    if (!guest) throw new Error("немає гостей");
    const { save } = game(guest);
    const shy = withCat(save, { guests: -1 }, { x: 4.5, y: 8.5 });
    untilRing(save, guest);
    advance(save, 3);
    expect(shy.act.kind).toBe("hide");
    expect(shy.act.goal).toBeNull();
    expect(shy.act.elapsed).toBeGreaterThan(0);
    interact(save);
    expect(shy.away).toBeNull();
    expect(shy.act.kind).toBe("hide");
    expect(shy.act.minutes).toBeCloseTo(MODIFIERS.guests.hideMinutes, 9);
  });

  it("з іншою річчю в руках — «руки зайняті», і гість чекає далі", () => {
    const guest = GUESTS_BY_DOOR.find((g) => g.who === "inspection");
    if (!guest) throw new Error("немає ОСББ");
    const { save } = game(guest);
    const state = save.current;
    untilRing(save, guest);
    state.character.held = { kind: "raw", quality: "cheap" };
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(events).toContainEqual({ type: "refused", object: "door", reason: "hands-full" });
    expect(visitsOf(events, "inspection")).toHaveLength(0);
    expect(guestAtDoor(state)).toBe("inspection");
  });

  it("порядок біля дверей: спершу кіт на сходах, тоді гість, тоді пакунки", () => {
    const guest = GUESTS_BY_DOOR.find((g) => g.who === "home-vet");
    if (!guest) throw new Error("немає ветеринарки");
    const { save } = game(guest);
    const state = save.current;
    const runaway = withCat(save, {}, { x: 5.5, y: 7.5 });
    untilRing(save, guest);
    runaway.away = "stairs";
    state.home.porch.push({ id: 900, product: "food", quality: "cheap", at: 0 });
    const { events, stop } = recordEvents();
    interact(save);
    expect(runaway.away).toBeNull();
    expect(events.some((e) => e.type === "cat-returned")).toBe(true);
    expect(guestAtDoor(state)).toBe("home-vet");
    interact(save);
    expect(visitsOf(events, "home-vet")).toHaveLength(1);
    expect(state.home.porch).toHaveLength(1);
    expect(canLeave(state)).toBe(false);
    interact(save);
    stop();
    expect(state.home.porch).toHaveLength(0);
    expect(events.some((e) => e.type === "received")).toBe(true);
    expect(canLeave(state)).toBe(true);
  });

  it("персонаж повернувся з поїздки між дзвінком і візитом — теж може відчинити одразу; не повернувся — подзвонили й пішли", () => {
    const guest = GUESTS_BY_DOOR.find((g) => g.who === "guests");
    if (!guest) throw new Error("немає гостей");
    const trip = { destination: "shop", phase: "visit", cat: null } as unknown as NonNullable<GameState["trip"]>;

    const back = game(guest).save;
    back.current.trip = trip;
    const { events, stop } = recordEvents();
    untilRing(back, guest);
    expect(guestAtDoor(back.current)).toBe("guests");
    back.current.trip = null;
    standAt(back, "door");
    expect(canLeave(back.current)).toBe(false);
    interact(back);
    expect(visitsOf(events, "guests")).toHaveLength(1);

    const away = game(guest).save;
    away.current.trip = { ...trip };
    untilRing(away, guest);
    events.length = 0;
    pastVisit(away, guest);
    stop();
    expect(visitsOf(events, "guests-away")).toHaveLength(1);
    expect(visitsOf(events, "guests")).toHaveLength(0);
    expect(away.current.today.guest).toBeUndefined();
  });

  it("запис про гостя під дверима — у збереженні (JSON); ліг, не дочекавшись мами, — уранці під дверима нікого", () => {
    const guest = GUESTS_BY_DOOR.find((g) => g.who === "mom");
    if (!guest) throw new Error("немає мами");
    const { save } = game(guest);
    untilRing(save, guest);
    const loaded = deserialize(serialize(save));
    expect(guestAtDoor(loaded.current)).toBe("mom");
    save.current.minute = hours(23);
    goToSleep(save);
    expect(save.current.today.guest).toBeUndefined();
    expect(guestAtDoor(save.current)).toBeNull();
  });

  it("гостя впустили раніше — у розкладі його вже немає", () => {
    const guest = GUESTS_BY_DOOR.find((g) => g.who === "guests");
    if (!guest) throw new Error("немає гостей");
    const { save } = game(guest);
    untilRing(save, guest);
    expect(scheduleOf(save.current)).toContain("19:00 гості");
    interact(save);
    expect(scheduleOf(save.current).some((line) => line.includes("гості"))).toBe(false);
  });

  it("«+» на дзвінок біжить до дверей, «−» ховається — як і раніше; гостя впустили — вони не повторюють реакцію", () => {
    const guest = GUESTS_BY_DOOR.find((g) => g.who === "cleaner");
    if (!guest) throw new Error("немає прибиральниці");
    const { save } = game(guest);
    const host = withCat(save, { guests: 2 }, { x: 8.5, y: 8.5 });
    const shy = withCat(save, { guests: -1 }, { x: 4.5, y: 8.5 });
    untilRing(save, guest);
    expect(host.act.target).toBe("guest");
    expect(Math.hypot(host.x - DOOR_TILE.x, host.y - DOOR_TILE.y)).toBeLessThan(1.5);
    expect(shy.act.kind).toBe("hide");
    const { events, stop } = recordEvents();
    interact(save);
    for (let i = 0; i < 8; i++) tickCats(save.current, 0.25, { present: true });
    pastVisit(save, guest);
    stop();
    expect(bells(events)).toBe(0);
    expect(visitsOf(events, "cleaner")).toHaveLength(1);
  });
});

describe("перехід у час режиму розробки (§11.5) і гість під дверима (рецензія 2026-11-03)", () => {
  it("«Вечір» після дзвінка, повз хвилину візиту: під дверима нікого — можна поїхати, а двері не впускають гостя через години", () => {
    const guest = GUESTS_BY_DOOR.find((g) => g.who === "home-vet");
    if (!guest) throw new Error("немає ветеринарки");
    const { save } = game(guest);
    const state = save.current;
    untilRing(save, guest);
    expect(guestAtDoor(state)).toBe("home-vet");
    jumpTo(save, "evening");
    expect(guestAtDoor(state)).toBeNull();
    expect(canLeave(state)).toBe(true);
    const { events, stop } = recordEvents();
    interact(save);
    advance(save, 30);
    stop();
    expect(visitsOf(events, "home-vet")).toHaveLength(0);
  });

  it("день і година: гостя, що подзвонив учора, в інший день під дверима немає — і штрафу ОСББ у звичайний день теж", () => {
    const guest = GUESTS_BY_DOOR.find((g) => g.who === "inspection");
    if (!guest) throw new Error("немає ОСББ");
    const { save } = game(guest);
    const state = save.current;
    untilRing(save, guest);
    const money = state.character.money;
    setTime(save, state.day + 1, 12);
    standAt(save, "door");
    expect(guestAtDoor(state)).toBeNull();
    expect(canLeave(state)).toBe(true);
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(visitsOf(events, "inspection")).toHaveLength(0);
    expect(state.character.money).toBe(money);
  });

  it("стрибок у межах дня до хвилини візиту: дзвінка вже не чули — гість заходить у свою хвилину, як і без запису", () => {
    const guest = GUESTS_BY_DOOR.find((g) => g.who === "guests");
    if (!guest) throw new Error("немає гостей");
    const { save } = game(guest);
    const state = save.current;
    untilRing(save, guest);
    setTime(save, state.day, (guest.minute - 2) / 60);
    expect(guestAtDoor(state)).toBeNull();
    const { events, stop } = recordEvents();
    pastVisit(save, guest);
    stop();
    expect(visitsOf(events, "guests")).toHaveLength(1);
  });

  it("запис гостя не того дня (подія дня інша) — під дверима нікого: двері його не впускають", () => {
    const guest = GUESTS_BY_DOOR.find((g) => g.who === "guests");
    if (!guest) throw new Error("немає гостей");
    const { save } = game(guest);
    const state = save.current;
    state.today.guest = { who: "inspection" };
    expect(guestAtDoor(state)).toBeNull();
    expect(canLeave(state)).toBe(true);
  });
});

describe("сценарій «Ветеринарка вдома» (режим розробки)", () => {
  it("персонаж біля дверей: після дзвінка дія біля них — огляд одразу, а об 11:00 ветеринарка вже не приходить", () => {
    const scenario = FILE_SCENARIOS["home-vet"];
    if (!scenario) throw new Error("немає сценарію");
    const save = applyScenario(scenario);
    const { events, stop } = recordEvents();
    advance(save, 2);
    expect(bells(events)).toBe(1);
    expect(targetOf(save.current)?.id).toBe("door");
    expect(canLeave(save.current)).toBe(false);
    interact(save);
    expect(visitsOf(events, "home-vet")).toHaveLength(1);
    expect(save.current.cats.find((c) => c.name === "Мурка")?.diseases[0]?.known).toBe(true);
    advance(save, 10);
    stop();
    expect(visitsOf(events, "home-vet")).toHaveLength(1);
  });
});

describe("кур'єр і знайда біля дверей (§9.12, §8.5)", () => {
  it("кур'єр лише лишає пакунок: гостя під дверима немає, а дія біля дверей забирає пакунки, а не веде в поїздку", () => {
    const save = newGame({ address: "she", difficulty: "normal", seed: 21 });
    const state = save.current;
    state.modifiers.day = null;
    state.minute = hours(12);
    standAt(save, "door");
    expect(canLeave(state)).toBe(true);
    state.home.deliveries.push({ id: 901, product: "food", quality: "cheap", at: 0 });
    const { events, stop } = recordEvents();
    // Як і в грі: кур'єр приїздить у хід часу; режим розробки кличе його так само (`courierNow`).
    advance(save, 1);
    expect(state.home.porch).toHaveLength(1);
    expect(events.some((e) => e.type === "doorbell" && e.delivery !== undefined)).toBe(true);
    expect(guestAtDoor(state)).toBeNull();
    expect(canLeave(state)).toBe(false);
    interact(save);
    stop();
    expect(state.home.porch).toHaveLength(0);
    expect(events.some((e) => e.type === "received")).toBe(true);
    expect(state.trip).toBeNull();
    expect(canLeave(state)).toBe(true);

    state.home.deliveries.push({ id: 902, product: "food", quality: "cheap", at: Number.MAX_SAFE_INTEGER });
    courierNow(state);
    expect(state.home.porch).toHaveLength(1);
    expect(guestAtDoor(state)).toBeNull();
  });

  it("знайда: картку вибору без рішення не закрити — час стоїть, і до дверей, поки кошеня під ними, не дійти", () => {
    const noop = (): void => {};
    const card = foundlingCard(noop, noop);
    expect(card.onDismiss).toBeUndefined();
    expect(card.closable).toBeFalsy();
    expect(card.actions).toHaveLength(2);
  });
});
