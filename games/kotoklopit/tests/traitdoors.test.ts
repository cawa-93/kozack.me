// Етап «Столи, двері, переноска» — двері (§9.12 «Двері й гості», рішення автора 2026-10-25, `TRAITS_REVIEW.md`): коли
// відчиняються двері й дзвонять у них, «Втечі» й «Гості» видно з поведінки.

import { describe, expect, it } from "vitest";

import { createCat, idleAct } from "../src/sim/cat";
import { carrierDread, carryFeeling, decide, tickCats } from "../src/sim/catai";
import { CARRIER_HOME, ESCAPE, GUESTS, MODIFIERS, VET } from "../src/sim/config";
import { groom, vetExam, vetManner } from "../src/sim/destinations";
import { fallIll } from "../src/sim/diseases";
import { DOOR_TILE, openDoor, ringBell } from "../src/sim/door";
import { dispatch } from "../src/sim/economy";
import { advance, interact, newGame } from "../src/sim/game";
import { decideFoundling, startModifiers, tickModifiers } from "../src/sim/modifiers";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { startTrip } from "../src/sim/trips";
import type { GuestsVisit } from "../src/sim/events";
import type { Cat, Save, TraitLevel } from "../src/sim/types";
import { guestsText, homeVetText } from "../src/texts";
import { driveSafely, hours, recordEvents, standAt, withCatCorner } from "./helpers";

function game(seed = 11): Save {
  const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed }));
  save.current.modifiers.day = null;
  save.current.minute = hours(12);
  // Персонаж у вітальні біля входу: бачить двері.
  Object.assign(save.current.character.body, { x: 9.5, y: 8.5 });
  return save;
}

function withCat(save: Save, traits: Record<string, TraitLevel> = {}, at = { x: 10.5, y: 9.5 }): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 10, at });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.arrivedDay = -10;
  cat.sterilized = true;
  cat.love = 50;
  cat.act = idleAct(30);
  cat.needs = { hunger: 10, thirst: 10, toilet: 10, fatigue: 10, attention: 10, play: 10 };
  addCat(save.current, cat);
  return cat;
}

const seen = (cat: Cat, group: string): number => cat.traits.find((t) => t.group === group)?.seen ?? 0;

describe("«Втечі»: відчинені двері (§9.12, рішення автора 2026-10-25)", () => {
  it("сплячий кіт біля дверей у них не кидається, а той, що не спить, — вибігає", () => {
    let awake = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const save = game(seed);
      const sleeper = withCat(save, { escape: 2 });
      sleeper.act = { kind: "sleep", target: null, goal: null, minutes: 300, elapsed: 0 };
      const runner = withCat(save, { escape: 2 }, { x: 11.5, y: 9.5 });
      openDoor(save.current);
      expect(sleeper.away).toBeNull();
      if (runner.away === "stairs") awake += 1;
    }
    // 10% + 50% у «Втікача».
    expect(awake).toBeGreaterThan(10);
  });

  it("«Домосід» відходить від відчинених дверей, «Боїться дверей» тікає й із передпокою — прояв «−»", () => {
    const save = game();
    const homebody = withCat(save, { escape: -1 });
    const afraid = withCat(save, { escape: -2 }, { x: 7.5, y: 8.5 });
    const { events, stop } = recordEvents();
    openDoor(save.current);
    stop();
    expect(homebody.away).toBeNull();
    expect(homebody.act.kind).toBe("wander");
    expect(afraid.act.target).toBe("flee");
    expect(events.some((e) => e.type === "scared" && e.cat === afraid.id)).toBe(true);
    expect(seen(homebody, "escape")).toBe(1);
    expect(seen(afraid, "escape")).toBe(1);
  });

  it("«−», що ховається, їсть чи в лотку, на відчинені двері не зважає (перевірка етапу 2026-10-26)", () => {
    const save = game();
    // Сховався під диван від дзвінка — гості заходять, а він лишається в схованці.
    const hiding = withCat(save, { escape: -2 }, { x: 13.5, y: 10.5 });
    hiding.act = { kind: "hide", target: null, goal: null, minutes: 60, elapsed: 5 };
    const eating = withCat(save, { escape: -1 }, { x: 10.5, y: 9.5 });
    eating.act = { kind: "eat", target: null, goal: null, minutes: 3, elapsed: 1 };
    openDoor(save.current);
    expect(hiding.act.kind).toBe("hide");
    expect(eating.act.kind).toBe("eat");
    expect(seen(hiding, "escape")).toBe(0);
    expect(seen(eating, "escape")).toBe(0);
  });

  it("кіт утік, коли персонаж вирушав, — поїздка не починається, доки його не впіймали", () => {
    let checked = 0;
    for (let seed = 1; seed <= 20 && checked < 3; seed++) {
      const save = game(seed);
      standAt(save, "door");
      const cat = withCat(save, { escape: 2 }, { x: 10.5, y: 9.5 });
      expect(startTrip(save.current, "shop") || cat.away === "stairs").toBe(true);
      if (cat.away !== "stairs") continue;
      checked += 1;
      expect(save.current.trip).toBeNull();
      expect(startTrip(save.current, "shop")).toBe(false);
      // Упіймати кота — дія біля дверей; тепер можна їхати (кіт спить — у двері не кинеться).
      interact(save);
      expect(cat.away).toBeNull();
      cat.act = { kind: "sleep", target: null, goal: null, minutes: 300, elapsed: 0 };
      expect(startTrip(save.current, "shop")).toBe(true);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("«Втікач» удень кричить під дверима (прояв «+»), уночі — ні", () => {
    let calls = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const save = game(seed);
      const cat = withCat(save, { escape: 2 }, { x: 8.5, y: 9.5 });
      for (let i = 0; i < 60 && cat.act.target !== "door"; i++) tickCats(save.current, 1, { present: true });
      if (cat.act.target !== "door") continue;
      calls += 1;
      expect(cat.act.kind).toBe("beg");
      for (let i = 0; i < 30 && cat.act.goal !== null; i++) tickCats(save.current, 0.25, { present: true });
      tickCats(save.current, 0.25, { present: true });
      expect(seen(cat, "escape")).toBeGreaterThan(0);
    }
    // 8% за годину.
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThan(12);
    for (let seed = 1; seed <= 20; seed++) {
      const save = game(seed);
      save.current.minute = hours(26);
      const cat = withCat(save, { escape: 2 }, { x: 8.5, y: 9.5 });
      for (let i = 0; i < 60; i++) tickCats(save.current, 1, { present: false });
      expect(cat.act.target).not.toBe("door");
    }
  });

  it("крик під дверима — не прохання їсти: ласощі не привчають жебракувати", async () => {
    const { beggingFood } = await import("../src/sim/catai");
    const save = game();
    const cat = withCat(save, { escape: 1 });
    cat.act = { kind: "beg", target: "door", goal: null, minutes: 5, elapsed: 0 };
    expect(beggingFood(save.current, cat)).toBe(false);
    expect(ESCAPE.callStep).toBeGreaterThan(0);
  });
});

describe("«Гості»: дзвінок у двері (§9.12, рішення автора 2026-10-25)", () => {
  it("на дзвінок «+» біжить до дверей (прояв «+»), «−» ховається (прояв «−»), −2 ще й шипить", () => {
    const save = game();
    const host = withCat(save, { guests: 2 }, { x: 8.5, y: 8.5 });
    const shy = withCat(save, { guests: -1 }, { x: 7.5, y: 8.5 });
    const hisser = withCat(save, { guests: -2 }, { x: 6.5, y: 8.5 });
    const plain = withCat(save, {}, { x: 9.5, y: 7.5 });
    const { events, stop } = recordEvents();
    ringBell(save.current);
    stop();
    expect(events.some((e) => e.type === "doorbell")).toBe(true);
    expect(host.act.target).toBe("guest");
    expect(host.act.goal).toEqual(DOOR_TILE);
    expect(shy.act.kind).toBe("hide");
    expect(shy.act.minutes).toBe(GUESTS.hideStep);
    expect(hisser.act.minutes).toBe(GUESTS.hideStep * 2);
    expect(events.filter((e) => e.type === "hissed-guests").map((e) => (e.type === "hissed-guests" ? e.cat : 0))).toEqual([hisser.id]);
    expect(plain.act.kind).toBe("idle");
    expect(plain.act.target).toBeNull();
    expect(seen(shy, "guests")).toBe(1);
    tickCats(save.current, 0.25, { present: true });
    expect(seen(host, "guests")).toBe(1);
  });

  it("кур'єр привіз пакунок — дзвінок, і «Душа компанії» біжить зустрічати", () => {
    const save = game();
    const host = withCat(save, { guests: 1 }, { x: 8.5, y: 8.5 });
    save.current.character.money = 1000;
    dispatch(save.current, { product: "food" }, "cheap", 10);
    advance(save, hours(6) - 1);
    expect(save.current.home.porch).toHaveLength(0);
    host.act = idleAct(30);
    host.needs = { hunger: 10, thirst: 10, toilet: 10, fatigue: 10, attention: 10, play: 10 };
    Object.assign(host, { x: 8.5, y: 8.5 });
    advance(save, 2);
    expect(save.current.home.porch).toHaveLength(1);
    expect(host.act.target).toBe("guest");
  });

  it("день «Гості»: «+» тішить гостей (+3, разом до +6), −2 шипить (−2), безлад — сором", () => {
    const sanityAfter = (traits: Record<string, TraitLevel>[]): number => {
      const save = game();
      save.current.modifiers.day = "guests";
      traits.forEach((t, i) => withCat(save, t, { x: 3.5 + i, y: 8.5 }));
      save.current.character.stats.sanity = 50;
      tickModifiers(save.current, MODIFIERS.guests.minute - 1, 2, false);
      return save.current.character.stats.sanity;
    };
    expect(sanityAfter([])).toBe(50);
    expect(sanityAfter([{ guests: 1 }])).toBe(50 + GUESTS.delight);
    expect(sanityAfter([{ guests: 1 }, { guests: 2 }, { guests: 1 }])).toBe(50 + GUESTS.delightMax);
    expect(sanityAfter([{ guests: -2 }])).toBe(50 + GUESTS.hissSanity);
  });

  it("повідомлення дня каже, що бачили гості: шипіння в чистій квартирі — не «безлад» (перевірка етапу 2026-10-26)", () => {
    const visit = (traits: Record<string, TraitLevel>[], messes = 0): GuestsVisit | undefined => {
      const save = game();
      save.current.modifiers.day = "guests";
      traits.forEach((t, i) => withCat(save, t, { x: 3.5 + i, y: 8.5 }));
      for (let i = 0; i < messes; i++) save.current.home.messes.push({ id: 900 + i, kind: "vomit", x: 5.5, y: 7.5, cat: null });
      const { events, stop } = recordEvents();
      tickModifiers(save.current, MODIFIERS.guests.minute - 1, 2, false);
      stop();
      const event = events.find((e) => e.type === "modifier" && e.kind === "guests");
      return event?.type === "modifier" ? event.guests : undefined;
    };
    expect(visit([{ guests: -2 }])).toEqual({ mess: false, hissed: true, delighted: false });
    expect(guestsText(visit([{ guests: -2 }]))).not.toContain("безлад");
    expect(visit([{ guests: 1 }], 1)).toEqual({ mess: true, hissed: false, delighted: true });
    // Без котів гості в захваті хіба що від чистоти.
    expect(guestsText(visit([]))).not.toContain("кот");
  });

  it("мама з гостинцями дзвонить і заходить, знайді двері відчиняють — коти це помічають (перевірка етапу 2026-10-26)", () => {
    const save = game();
    save.current.day = 3;
    const host = withCat(save, { guests: 2 }, { x: 5.5, y: 8.5 });
    for (let seed = 0; seed < 2000; seed++) {
      host.act = idleAct(30);
      save.current.modifiers.day = null;
      startModifiers(save.current, createRng(seed));
      if (save.current.modifiers.day === "mom-food") break;
    }
    expect(save.current.modifiers.day).toBe("mom-food");
    // Мама дзвонить удень (рішення автора 2026-10-26).
    const at = save.current.today.mom?.at ?? -1;
    tickModifiers(save.current, at - 0.5, 1, false);
    expect(host.act.target).toBe("guest");
    // Знайду відносять у притулок — двері однаково відчиняють: «Домосід» біля них відходить.
    const homebody = withCat(save, { escape: -1 });
    save.current.today.foundling = true;
    decideFoundling(save.current, false, createRng(1));
    expect(homebody.act.kind).toBe("wander");
  });

  it("гості дзвонять за 2 хвилини, а заходять — двері відчинено: «Душа компанії» біля дверей може й вибігти", () => {
    let escaped = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const save = game(seed);
      save.current.modifiers.day = "guests";
      const host = withCat(save, { guests: 2, escape: 1 }, { x: 9.5, y: 9.5 });
      const minute = MODIFIERS.guests.minute;
      tickModifiers(save.current, minute - GUESTS.ringLead - 0.5, 1, false);
      expect(host.act.target).toBe("guest");
      save.current.minute = minute - 1;
      for (let i = 0; i < 8; i++) tickCats(save.current, 0.25, { present: true });
      tickModifiers(save.current, minute - 0.5, 1, false);
      if (host.away === "stairs") escaped += 1;
    }
    expect(escaped).toBeGreaterThan(3);
  });
});

/** Персонаж біля дверей з котом на руках, удома дешева переноска. */
function atDoorWith(save: Save, cat: Cat): void {
  standAt(save, "door");
  save.current.home.carrier = "cheap";
  save.current.character.held = { kind: "cat", cat: cat.id };
}

describe("«Переноска» (§9.12 «Переноска й ветеринар», рішення автора 2026-10-25)", () => {
  it("дзеркально: «Спокійний у переносці» втрачає менше, «Сам лізе в переноску» — нічого", () => {
    const loss = (level: TraitLevel | 0): number => {
      const save = game();
      const cat = withCat(save, level === 0 ? {} : { carrier: level }, { x: 5.5, y: 8.5 });
      atDoorWith(save, cat);
      cat.mood = 60;
      expect(startTrip(save.current, "vet")).toBe(true);
      return 60 - cat.mood;
    };
    expect(loss(0)).toBe(5);
    expect(loss(1)).toBe(2);
    expect(loss(2)).toBe(0);
    expect(loss(-1)).toBe(8);
  });

  it("«+» спить у переносці, як у будиночку (прояв «+»), — коли вона є; кіт без риси туди не лягає", () => {
    let inside = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (const level of [0, 2] as const) {
        const save = game(seed);
        save.current.home.carrier = "cheap";
        const cat = withCat(save, level === 0 ? {} : { carrier: level }, { x: 5.5, y: 8.5 });
        cat.needs.fatigue = 90;
        decide(save.current, cat, createRng(seed), { present: true });
        if (cat.act.target === "carrier") {
          expect(level).toBe(2);
          inside += 1;
        }
      }
    }
    expect(inside).toBeGreaterThan(5);
    const save = game();
    const cat = withCat(save, { carrier: 2 }, { x: 5.5, y: 8.5 });
    cat.needs.fatigue = 90;
    for (let seed = 1; seed <= 30; seed++) {
      decide(save.current, cat, createRng(seed), { present: true });
      expect(cat.act.target).not.toBe("carrier");
    }
    save.current.home.carrier = "cheap";
    cat.act = { kind: "sleep", target: "carrier", goal: null, minutes: 300, elapsed: 0 };
    Object.assign(cat, { x: 8.5, y: 9.5 });
    tickCats(save.current, 0.25, { present: true });
    expect(seen(cat, "carrier")).toBe(1);
  });

  it("переноску беруть у дорогу: хто в ній спав, вилазить, а поки вона з котом у дорозі, у ній не сплять (перевірка етапу 2026-10-26)", () => {
    const save = game();
    const sleeper = withCat(save, { carrier: 2 }, { x: 8.5, y: 9.5 });
    sleeper.act = { kind: "sleep", target: "carrier", goal: null, minutes: 300, elapsed: 10 };
    const passenger = withCat(save, {}, { x: 5.5, y: 8.5 });
    atDoorWith(save, passenger);
    expect(startTrip(save.current, "vet")).toBe(true);
    expect(sleeper.act.kind).not.toBe("sleep");
    sleeper.needs.fatigue = 90;
    for (let seed = 1; seed <= 40; seed++) {
      decide(save.current, sleeper, createRng(seed), { present: false });
      expect(sleeper.act.target).not.toBe("carrier");
    }
  });

  it("«−» на руках біля дверей пручається (прояв «−»), дряпається й може вирватися; без переноски — ні", () => {
    let clawed = 0;
    let freed = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const save = game(seed);
      const cat = withCat(save, { carrier: -2 }, { x: 5.5, y: 8.5 });
      atDoorWith(save, cat);
      expect(carryFeeling(save.current, cat)).toBe("struggling");
      const health = save.current.character.stats.health;
      const { events, stop } = recordEvents();
      for (let i = 0; i < 5 && save.current.character.held !== null; i++) tickCats(save.current, 1, { present: true });
      stop();
      expect(seen(cat, "carrier")).toBe(1);
      const scratches = events.filter((e) => e.type === "clawed").length;
      clawed += scratches;
      expect(save.current.character.stats.health).toBeCloseTo(health + scratches * CARRIER_HOME.health);
      if (save.current.character.held === null) {
        freed += 1;
        expect(cat.act.kind).toBe("hide");
      }
    }
    // 20% за хвилину в −2, вирвався — чверть подряпин.
    expect(clawed).toBeGreaterThan(10);
    expect(freed).toBeGreaterThan(0);
    const save = game();
    const cat = withCat(save, { carrier: -2 }, { x: 5.5, y: 8.5 });
    atDoorWith(save, cat);
    save.current.home.carrier = null;
    expect(carrierDread(save.current, cat)).toBe(0);
  });
});

describe("«Ветеринар»: рядок у картці огляду (§9.12, рішення автора 2026-10-25)", () => {
  it("«+» спокійний, −1 шипить, −2 вирвався й забився під шафу — огляд довший на 15 хвилин", () => {
    // Кіт без риси (і без породної) — без рядка.
    const plain = withCat(game(), {});
    plain.breed = ["mixed", "mixed"];
    expect(vetManner(plain)).toBeNull();
    const exam = (level: TraitLevel): { manner: string | null; extra: number } => {
      const save = game();
      save.current.character.money = 1000;
      const cat = withCat(save, { vet: level }, { x: 5.5, y: 8.5 });
      atDoorWith(save, cat);
      expect(startTrip(save.current, "vet")).toBe(true);
      driveSafely(save);
      const visit = save.current.trip?.visit ?? 0;
      const result = vetExam(save.current);
      expect(seen(cat, "vet")).toBe(1);
      return { manner: result?.manner ?? null, extra: (save.current.trip?.visit ?? 0) - visit };
    };
    expect(exam(1)).toEqual({ manner: "calm", extra: 0 });
    expect(exam(-1)).toEqual({ manner: "hiss", extra: 0 });
    expect(exam(-2)).toEqual({ manner: "hid", extra: VET.hideMinutes });
  });

  it("у грумера так само: «Жах клініки» затягує грумінг на 15 хвилин, «Терпить огляд» — ні; обидва — прояв (перевірка етапу 2026-10-26)", () => {
    const groomed = (traits: Record<string, TraitLevel>): { extra: number; seen: number } => {
      const save = game();
      save.current.character.money = 1000;
      const cat = withCat(save, traits, { x: 5.5, y: 8.5 });
      atDoorWith(save, cat);
      expect(startTrip(save.current, "groomer")).toBe(true);
      driveSafely(save);
      const visit = save.current.trip?.visit ?? 0;
      expect(groom(save.current, "cheap")).toBe(true);
      return { extra: (save.current.trip?.visit ?? 0) - visit, seen: seen(cat, "vet") };
    };
    expect(groomed({ vet: -2 })).toEqual({ extra: VET.hideMinutes, seen: 1 });
    expect(groomed({ vet: 1 })).toEqual({ extra: 0, seen: 1 });
  });

  it("ветеринарка вдома оглядає всіх котів, що вдома, — і повідомлення про кожного (рішення автора 2026-10-27, Х7)", () => {
    const save = game();
    save.current.modifiers.day = "home-vet";
    const healthy = withCat(save, { vet: 1 }, { x: 5.5, y: 8.5 });
    const sick = withCat(save, {}, { x: 6.5, y: 8.5 });
    const away = withCat(save, {}, { x: 7.5, y: 8.5 });
    fallIll(save.current, sick, "cold");
    fallIll(save.current, away, "fleas");
    away.away = "stairs";
    const { events, stop } = recordEvents();
    tickModifiers(save.current, MODIFIERS.homeVetMinute - 1, 2, false);
    stop();
    expect(sick.diseases[0]?.known).toBe(true);
    expect(away.diseases[0]?.known).toBe(false);
    expect(healthy.breedKnown).toEqual([true, true]);
    expect(events).toContainEqual({ type: "modifier", kind: "home-vet", value: 2 });
    const text = homeVetText([
      { name: healthy.name, sex: healthy.sex, diseases: [], manner: vetManner(healthy) },
      { name: sick.name, sex: sick.sex, diseases: ["Застуда"], manner: null },
    ]);
    expect(text).toContain(`${sick.name} — застуда`);
    expect(text).toContain("Решта здорові.");
    expect(text).toContain(healthy.name);
  });

  it("ветеринарка вдома: «Жах клініки» потім ховається, а прояв видно, якщо персонаж удома", () => {
    const save = game();
    save.current.modifiers.day = "home-vet";
    const cat = withCat(save, { vet: -2 }, { x: 5.5, y: 8.5 });
    tickModifiers(save.current, MODIFIERS.homeVetMinute - 1, 2, false);
    expect(cat.act.kind).toBe("hide");
    expect(seen(cat, "vet")).toBe(1);
  });
});
