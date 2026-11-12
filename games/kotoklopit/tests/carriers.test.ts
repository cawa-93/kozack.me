// Переноски (§8.5, §8.7): кілька на дім, посадити й випустити, поїздка з котами, чотири етапи кота під замком, смерть.

import { describe, expect, it } from "vitest";

import { addCarrier, cageStage, cagedCats, carrierOf, carrierRoom, discardCarrier, releaseCats, seatCat, tickCaged } from "../src/sim/carriers";
import { createCat, idleAct } from "../src/sim/cat";
import { ACCIDENT, CARRIER, CARRIER_MOOD, NEED_THRESHOLD, PET } from "../src/sim/config";
import { nextTripCat, nextTripRider, tripCat, tripCatPlace } from "../src/sim/destinations";
import { removeCat } from "../src/sim/farewell";
import { goToSleep, interact, newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { room } from "../src/sim/shop";
import { targetOf } from "../src/sim/targets";
import { endTrip, startTrip, tripBlocker } from "../src/sim/trips";
import type { Cat, CatNeed, GameState, Quality, Save, TraitLevel } from "../src/sim/types";
import { carrierLocked, carrierOccupied } from "../src/view/iso/looks";
import { eventBubbles } from "../src/view/symbols";
import { hours, recordEvents, standAt, withCatCorner } from "./helpers";

function game(...carriers: Quality[]): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 8 }));
  save.current.modifiers.day = null;
  save.current.modifiers.week = null;
  save.current.minute = hours(10);
  for (const quality of carriers) addCarrier(save.current.home, quality);
  return save;
}

function cat(save: Save, carrier: TraitLevel | 0 = 0): Cat {
  const made = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 30, at: { x: 6.5, y: 9.5 } });
  made.traits = carrier === 0 ? [] : [{ group: "carrier", level: carrier, seen: 0, known: false }];
  made.arrivedDay = -10;
  made.health = 100;
  made.act = idleAct(30);
  made.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 };
  addCat(save.current, made);
  return made;
}

/** Посадити кота, узявши його на руки. */
function seat(state: GameState, who: Cat): void {
  state.character.held = { kind: "cat", cat: who.id };
  expect(seatCat(state, who)).toBe(true);
}

/** Стати біля переносок обличчям до них. */
function nearCarrier(state: GameState): void {
  Object.assign(state.character.body, { x: 8.5, y: 8.9, facing: { x: 0, y: 1 } });
}

const rng = createRng(1);

/** Прожити під замком `minutes` хвилин: потреби лишаються такими, як є. */
function sit(state: GameState, cats: readonly Cat[], minutes: number, present = true): void {
  for (let i = 0; i < minutes; i++) for (const c of cats) if (c.away === "carrier") tickCaged(state, c, 1, rng, present);
}

/** Коли кіт дійде до етапу: хвилин від посадки. */
function reaches(state: GameState, who: Cat, stage: string, limit = 3000): number {
  for (let i = 0; i < limit; i++) {
    if (cageStage(who) === stage) return i;
    tickCaged(state, who, 1, rng, true);
  }
  return Infinity;
}

/** За скільки хвилин `cats` зламають переноску. */
function breakout(state: GameState, cats: readonly Cat[], limit = 4000): number {
  for (let i = 1; i < limit; i++) {
    sit(state, cats, 1);
    if (cats.every((c) => c.away === null)) return i;
  }
  return Infinity;
}

describe("кілька переносок (§8.7)", () => {
  it("дорогі завжди попереду, у кожну — двоє, ліміт росте без межі", () => {
    const { home } = game("cheap", "premium", "cheap").current;
    expect(home.carriers.map((c) => c.quality)).toEqual(["premium", "cheap", "cheap"]);
    expect(carrierRoom(home)).toBe(6);
    for (let i = 0; i < 5; i++) addCarrier(home, "cheap");
    expect(carrierRoom(home)).toBe(16);
  });

  it("у магазині їх можна брати скільки завгодно", () => {
    const { current: state } = game("cheap");
    expect(room(state, [], { thing: "carrier" }, "premium")).toBeGreaterThan(1);
  });
});

describe("посадити й випустити (§8.7)", () => {
  it("дія з котом на руках біля переносок садить його, а думка каже скільки", () => {
    const save = game("cheap");
    const state = save.current;
    const who = cat(save);
    nearCarrier(state);
    state.character.held = { kind: "cat", cat: who.id };
    expect(targetOf(state)?.id).toBe("carrier");
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(who.away).toBe("carrier");
    expect(state.character.held).toBeNull();
    const seated = events.find((e) => e.type === "cat-seated");
    expect(seated).toMatchObject({ seated: 1, room: 2 });
    expect(seated && eventBubbles(seated)[0]).toMatchObject({ kind: "think", at: "person", icon: "cat", count: "1/2" });
  });

  it("місця немає — відмова, кіт лишається на руках", () => {
    const save = game("cheap");
    const state = save.current;
    seat(state, cat(save));
    seat(state, cat(save));
    const third = cat(save);
    nearCarrier(state);
    state.character.held = { kind: "cat", cat: third.id };
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(events).toContainEqual({ type: "refused", object: "carrier", reason: "carrier-full" });
    expect(state.character.held).toMatchObject({ cat: third.id });
  });

  it("новонародженого не садять", () => {
    const save = game("cheap");
    const state = save.current;
    const kitten = cat(save);
    kitten.ageWeeks = 0;
    kitten.source = "born";
    nearCarrier(state);
    state.character.held = { kind: "cat", cat: kitten.id };
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(kitten.away).toBeNull();
    expect(events.some((e) => e.type === "refused" && e.reason === "newborn")).toBe(true);
  });

  it("порожніми руками дія випускає всіх, а порожні переноски — відмова «потрібен кіт»", () => {
    const save = game("cheap");
    const state = save.current;
    nearCarrier(state);
    const none = recordEvents();
    interact(save);
    none.stop();
    expect(none.events).toContainEqual({ type: "refused", object: "carrier", reason: "need", need: "cat" });
    const a = cat(save);
    const b = cat(save);
    seat(state, a);
    seat(state, b);
    interact(save);
    expect([a.away, b.away]).toEqual([null, null]);
    expect(state.home.caged).toEqual([]);
  });

  it("дорогі заповнюються першими, хоч би як садили; приклад автора", () => {
    const save = game("cheap", "premium");
    const state = save.current;
    const [a, b, c, d] = [cat(save), cat(save), cat(save), cat(save)];
    for (const who of [a, b, c]) seat(state, who as Cat);
    expect([a, b, c].map((who) => state.home.carriers[carrierOf(state, who as Cat)]?.quality)).toEqual(["premium", "premium", "cheap"]);
    state.character.held = { kind: "cat", cat: (d as Cat).id };
    Object.assign(state.character.body, { x: 10.5, y: 10.3, facing: { x: 0, y: 1 } });
    expect(startTrip(state, "vet")).toBe(true);
    expect(state.trip?.riders?.map((r) => r.place)).toEqual(["premium", "premium", "cheap", "hands"]);
  });

  it("викинули переноску — коти з неї виходять, решта лишається", () => {
    const save = game("premium", "cheap");
    const state = save.current;
    const [a, b, c] = [cat(save), cat(save), cat(save)];
    for (const who of [a, b, c]) seat(state, who as Cat);
    expect(discardCarrier(state, 0)).toBe(true);
    expect([a?.away, b?.away, c?.away]).toEqual([null, null, "carrier"]);
    expect(cagedCats(state).map((who) => who.id)).toEqual([c?.id]);
  });

  it("поставив кота, пестощі не почнуться, поки кнопку не відпустили", () => {
    const save = game("cheap");
    const state = save.current;
    const who = cat(save);
    nearCarrier(state);
    state.character.held = { kind: "cat", cat: who.id };
    interact(save);
    expect(state.character.holdSpent).toBe(true);
  });
});

describe("поїздка з котами (§8.5)", () => {
  const atDoor = (save: Save): void => standAt(save, "door");

  it("настрій — за місцем: на руках найгірше, у дорогій найлегше", () => {
    const loss = (quality: Quality | null): number => {
      const save = game(...(quality ? [quality] : []));
      const who = cat(save);
      who.mood = 60;
      atDoor(save);
      save.current.character.held = { kind: "cat", cat: who.id };
      if (quality) seatCat(save.current, who);
      expect(startTrip(save.current, "vet")).toBe(true);
      return 60 - who.mood;
    };
    expect(loss(null)).toBe(-CARRIER_MOOD.hands);
    expect(loss("cheap")).toBe(-CARRIER_MOOD.cheap);
    expect(loss("premium")).toBe(-CARRIER_MOOD.premium);
  });

  it("у магазин можна з котами, і після повернення всі вільні, годинника немає", () => {
    const save = game("cheap");
    const state = save.current;
    const who = cat(save);
    seat(state, who);
    sit(state, [who], 200);
    atDoor(save);
    expect(tripBlocker(state, "shop")).toBeNull();
    expect(startTrip(state, "shop")).toBe(true);
    expect(who.away).toBe("trip");
    expect(who.cage).toBeUndefined();
    endTrip(state);
    expect(who.away).toBeNull();
    expect(state.home.caged).toEqual([]);
  });

  it("новонародженого з рук не везуть", () => {
    const save = game("cheap");
    const kitten = cat(save);
    kitten.ageWeeks = 0;
    kitten.source = "born";
    save.current.character.held = { kind: "cat", cat: kitten.id };
    expect(tripBlocker(save.current, "vet")).toBe("newborn");
  });

  it("на місці коти йдуть по черзі, журнал кожного свій", () => {
    const save = game("cheap");
    const state = save.current;
    const [a, b] = [cat(save), cat(save)];
    seat(state, a as Cat);
    atDoor(save);
    state.character.held = { kind: "cat", cat: (b as Cat).id };
    startTrip(state, "vet");
    expect(tripCat(state)?.id).toBe(a?.id);
    expect(tripCatPlace(state)).toBe("cheap");
    state.trip!.log = { exam: { health: 1, mood: 1, weight: 1, manner: null }, done: ["x"] };
    expect(nextTripRider(state)?.id).toBe(b?.id);
    nextTripCat(state);
    expect(tripCat(state)?.id).toBe(b?.id);
    expect(tripCatPlace(state)).toBe("hands");
    expect(state.trip?.log).toEqual({ exam: null, done: [] });
    expect(nextTripRider(state)).toBeNull();
  });

  it("на виставці гравець обирає: черга ходить по колу", () => {
    const save = game("cheap");
    const state = save.current;
    const [a, b] = [cat(save), cat(save)];
    seat(state, a as Cat);
    seat(state, b as Cat);
    state.modifiers.day = "show";
    atDoor(save);
    startTrip(state, "show");
    nextTripCat(state);
    expect(nextTripRider(state)?.id).toBe(a?.id);
  });

  it("шанс травми: на руках найвищий, у дорогій удвічі менший за дешеву", () => {
    expect(ACCIDENT.catInjury.hands).toBeGreaterThan(ACCIDENT.catInjury.cheap);
    expect(ACCIDENT.catInjury.premium).toBe(ACCIDENT.catInjury.cheap / 2);
  });
});

describe("етапи під замком (§8.7)", () => {
  const CASES: readonly [TraitLevel | 0, number, number, number][] = [
    [1, 30, 240, 600],
    [0, 15, 120, 300],
    [-1, 9, 72, 180],
    [-2, 5, 36, 90],
  ];
  for (const [level, cry, stress, chew] of CASES) {
    it(`риса ${level}: мявчить із ${cry} хв, стресує з ${stress} хв, гризе з ${chew} хв`, () => {
      const save = game("premium", "premium");
      const state = save.current;
      for (const [stage, minute] of [["cry", cry], ["stress", stress], ["chew", chew]] as const) {
        const who = cat(save, level);
        seat(state, who);
        expect(reaches(state, who, stage)).toBe(minute);
        releaseCats(state);
      }
    });
  }

  it("«Сам лізе» ситий мовчить; щойно чогось захотів — іде таймінгами кота без риси", () => {
    const save = game("cheap");
    const state = save.current;
    const who = cat(save, 2);
    who.mood = 50;
    seat(state, who);
    sit(state, [who], 600);
    expect(cageStage(who)).toBe("calm");
    expect(who.mood).toBe(50);
    who.needs.hunger = NEED_THRESHOLD.hunger;
    tickCaged(state, who, 1, rng, true);
    expect(cageStage(who)).toBe("cry");
    expect(who.mood).toBeLessThan(50);
  });

  it("приклад автора: голодний кричить одразу й стресує приблизно з години, а не з двох", () => {
    const save = game("cheap");
    const state = save.current;
    const who = cat(save);
    seat(state, who);
    sit(state, [who], 5);
    expect(cageStage(who)).toBe("calm");
    who.needs.hunger = NEED_THRESHOLD.hunger;
    tickCaged(state, who, 1, rng, true);
    expect(cageStage(who)).toBe("cry");
    expect(reaches(state, who, "stress")).toBeLessThan(60);
    expect(reaches(state, who, "chew")).toBeLessThan(100);
  });

  it("низьке здоров'я теж не дає сидіти спокійно", () => {
    const save = game("cheap");
    const who = cat(save);
    who.health = CARRIER.alarmHealth;
    seat(save.current, who);
    tickCaged(save.current, who, 1, rng, true);
    expect(cageStage(who)).toBe("cry");
  });

  it("настрій падає за етапом і рисою, спокійний етап настрою не чіпає", () => {
    const drop = (level: TraitLevel | 0): number => {
      const save = game("premium");
      const who = cat(save, level);
      who.mood = 100;
      seat(save.current, who);
      who.cage = { clock: 100000, cry: 0 };
      sit(save.current, [who], 60);
      return 100 - who.mood;
    };
    expect(drop(0)).toBeCloseTo(5);
    expect(drop(1)).toBeCloseTo(2.5);
    expect(drop(-2)).toBeCloseTo(10);
  });

  it("кричить майже одразу й нагадує весь час", () => {
    const save = game("cheap");
    const who = cat(save);
    seat(save.current, who);
    const { events, stop } = recordEvents();
    sit(save.current, [who], 120);
    stop();
    expect(events.filter((e) => e.type === "carrier-cry").length).toBeGreaterThanOrEqual(5);
    const cry = events.find((e) => e.type === "carrier-cry");
    expect(cry && eventBubbles(cry)[0]).toMatchObject({ kind: "say", at: "carrier", icon: "meow" });
  });

  it("вийшовши після стресу, кіт ховається й ображається; після спокою — ні", () => {
    const save = game("cheap");
    const state = save.current;
    const calm = cat(save);
    seat(state, calm);
    releaseCats(state);
    expect(calm.act.kind).toBe("idle");
    const scared = cat(save);
    const love = scared.love;
    seat(state, scared);
    sit(state, [scared], 130);
    releaseCats(state);
    expect(scared.act.kind).toBe("hide");
    expect(scared.love).toBeLessThan(love);
  });

  it("кіт, що гризе, кусає того, хто підійшов відчинити чи посадити ще кота", () => {
    let bitten = 0;
    for (let i = 0; i < 30; i++) {
      const save = game("cheap", "cheap");
      save.current.rng.behavior = i;
      const who = cat(save);
      seat(save.current, who);
      who.cage = { clock: 100000, cry: 0 };
      const before = save.current.character.stats.health;
      releaseCats(save.current);
      if (save.current.character.stats.health < before) {
        bitten += 1;
        expect(save.current.character.stats.health).toBe(before + PET.biteHealth);
      }
    }
    expect(bitten).toBeGreaterThan(5);
    expect(bitten).toBeLessThan(25);
  });
});

describe("зламана переноска (§8.7)", () => {
  it("кіт без риси виламує дешеву за 12 годин, дорогу за 24", () => {
    for (const [quality, expected] of [["cheap", 720], ["premium", 1440]] as const) {
      const save = game(quality);
      const who = cat(save);
      seat(save.current, who);
      expect(Math.abs(breakout(save.current, [who]) - expected)).toBeLessThanOrEqual(1);
    }
  });

  it("двоє — вдвічі швидше: 6 годин із дешевої", () => {
    const save = game("cheap");
    const pair = [cat(save), cat(save)];
    for (const who of pair) seat(save.current, who);
    expect(Math.abs(breakout(save.current, pair) - 360)).toBeLessThanOrEqual(1);
  });

  it("зламана переноска зникає, лишає уламки, коти на волі ховаються", () => {
    const save = game("cheap");
    const state = save.current;
    const who = cat(save);
    seat(state, who);
    const { events, stop } = recordEvents();
    breakout(state, [who]);
    stop();
    expect(state.home.carriers).toEqual([]);
    expect(state.home.messes.some((m) => m.kind === "broken")).toBe(true);
    expect(events).toContainEqual({ type: "broke", what: "carrier" });
    expect(who.act.kind).toBe("hide");
  });

  it("уламки — тієї переноски, яку зламали", () => {
    for (const quality of ["cheap", "premium"] as const) {
      const save = game(quality);
      const state = save.current;
      const who = cat(save);
      seat(state, who);
      breakout(state, [who]);
      expect(state.home.messes.find((m) => m.kind === "broken")?.carrier).toBe(quality);
    }
  });

  it("кіт догриз переноску — запис титрів (§4.2): переноска тієї якості й кіт, що догриз", () => {
    for (const quality of ["cheap", "premium"] as const) {
      const save = game(quality);
      const state = save.current;
      const who = cat(save);
      seat(state, who);
      breakout(state, [who]);
      expect(state.story).toMatchObject([{ kind: "broke", thing: "carrier", quality, cat: who.id }]);
    }
  });

  it("випустили — міцність знову повна", () => {
    const save = game("cheap");
    const state = save.current;
    const who = cat(save);
    seat(state, who);
    who.cage = { clock: 100000, cry: 0 };
    sit(state, [who], 60);
    expect(state.home.carriers[0]?.wear).toBeGreaterThan(0);
    releaseCats(state);
    expect(state.home.carriers[0]?.wear).toBe(0);
  });
});

describe("смерть під замком (§8.7)", () => {
  const VITAL: readonly CatNeed[] = ["hunger", "thirst", "toilet"];

  for (const need of VITAL) {
    it(`${need} на максимумі забирає здоров'я`, () => {
      const save = game("premium");
      const who = cat(save);
      seat(save.current, who);
      who.needs[need] = CARRIER.vitalNeed;
      sit(save.current, [who], 60);
      expect(who.health).toBeCloseTo(100 - CARRIER.healthPerHour);
    });
  }

  for (const need of ["attention", "play", "fatigue"] as const) {
    it(`${need} здоров'я не забирає`, () => {
      const save = game("premium");
      const who = cat(save);
      seat(save.current, who);
      who.needs[need] = CARRIER.vitalNeed;
      sit(save.current, [who], 120);
      expect(who.health).toBe(100);
    });
  }

  it("нуль — смерть одразу, зі своєю причиною й утратою здорового глузду", () => {
    const save = game("premium");
    const state = save.current;
    const who = cat(save);
    seat(state, who);
    who.health = 1;
    who.needs.hunger = CARRIER.vitalNeed;
    const sanity = state.character.stats.sanity;
    sit(state, [who], 60);
    expect(state.cats).not.toContain(who);
    expect(state.album.at(-1)).toMatchObject({ id: who.id, cause: { kind: "carrier" } });
    expect(state.home.caged).toEqual([]);
    expect(state.character.stats.sanity).toBeLessThan(sanity);
  });

  it("кіт не дочекався ночі: ранок рахує його як утрату", () => {
    const save = game("premium");
    const state = save.current;
    const who = cat(save);
    seat(state, who);
    who.health = 1;
    who.needs.hunger = CARRIER.vitalNeed;
    state.minute = hours(23);
    const report = goToSleep(save);
    expect(report?.lostCats).toContain(who.id);
  });

  it("кіт, якого не стало інакше, місця в переносці не займає", () => {
    const save = game("cheap");
    const state = save.current;
    const who = cat(save);
    seat(state, who);
    removeCat(state, who, { kind: "given" }, state.day);
    expect(state.home.caged).toEqual([]);
  });

  it("уночі кричить лише той, хто ще під замком: кіт, що помер чи вже вийшов (переноска зламалася), не будить", () => {
    for (const ending of ["died", "freed"] as const) {
      for (let seed = 1; seed <= 12; seed++) {
        const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed }));
        const state = save.current;
        state.modifiers.day = null;
        state.modifiers.week = null;
        addCarrier(state.home, "cheap");
        const who = cat(save);
        seat(state, who);
        // Голодний і вже гризе — кричить і нагадує всю ніч (§8.7).
        who.needs.hunger = CARRIER.vitalNeed;
        who.cage!.clock = 400;
        expect(cageStage(who)).not.toBe("calm");
        if (ending === "died") who.health = 0.01;
        // Від міцності лишилося на хвилини: зламає на самому початку ночі.
        else state.home.carriers[0]!.wear = CARRIER.strength.cheap - 0.5;
        state.minute = hours(22);
        const report = goToSleep(save)!;
        expect(ending === "died" ? state.cats.includes(who) : who.away, `${ending}, seed ${seed}`).toBe(ending === "died" ? false : null);
        expect(report.wakeUps.map((wake) => wake.cat), `${ending}, seed ${seed}`).not.toContain(who.id);
      }
    }
  });

  it("уночі смерть не забирає глузду одразу: це рахує ранок", () => {
    const save = game("premium");
    const state = save.current;
    const who = cat(save);
    seat(state, who);
    who.health = 1;
    who.needs.hunger = CARRIER.vitalNeed;
    const sanity = state.character.stats.sanity;
    sit(state, [who], 60, false);
    expect(state.album.at(-1)?.id).toBe(who.id);
    expect(state.character.stats.sanity).toBe(sanity);
  });
});

describe("вигляд переноски (§8.7)", () => {
  it("з котом під замком вона зачинена, а порожня — ні", () => {
    const save = game("cheap", "cheap");
    const state = save.current;
    expect(carrierLocked(state, 0)).toBe(false);
    seat(state, cat(save));
    expect(carrierLocked(state, 0)).toBe(true);
    expect(carrierLocked(state, 1)).toBe(false);
  });

  it("кота, що заліз поспати сам, ніхто не зачиняв", () => {
    const save = game("cheap");
    cat(save).act = { kind: "sleep", target: "carrier", goal: null, minutes: 60, elapsed: 0 };
    expect(carrierOccupied(save.current)).toBe(true);
    expect(carrierLocked(save.current, 0)).toBe(false);
  });
});
