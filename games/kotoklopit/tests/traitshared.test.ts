// Спільні механіки рис (§9.12, рішення автора 2026-10-25, `TRAITS_REVIEW.md`): пауза між оглушеннями,
// пауза шипіння, не більше двох нічних побудок, гучний звук і кроки; групи етапу «Енергія й сон».

import { describe, expect, it } from "vitest";

import { pickUpCat, putDownCat } from "../src/sim/actions";
import { stun } from "../src/sim/body";
import { changeMood, createCat, idleAct, isAdapting } from "../src/sim/cat";
import { decide, jealousy, tickCats } from "../src/sim/catai";
import { HISS_PAUSE_MINUTES, HOUSEHOLD, MODIFIERS, NOISE, RELATIONS, STRESS_EFFECTS, STUN_PAUSE_MINUTES, TALKATIVE, WAKE_UP } from "../src/sim/config";
import { advance, goToSleep, newGame } from "../src/sim/game";
import { itemTile, roomAt } from "../src/sim/home";
import { robotAt, tapWasher, tickHousehold } from "../src/sim/household";
import { tickModifiers } from "../src/sim/modifiers";
import { addCat } from "../src/sim/night";
import { hearSteps, loudNoise } from "../src/sim/noise";
import { relation } from "../src/sim/relations";
import { createRng } from "../src/sim/rng";
import type { Cat, Save, TraitLevel } from "../src/sim/types";
import { hours, recordEvents, standAt, withCatCorner } from "./helpers";

function game(seed = 11): Save {
  const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed }));
  save.current.modifiers.day = null;
  save.current.minute = hours(12);
  save.current.character.body.x = 9.5;
  save.current.character.body.y = 8.5;
  return save;
}

function withCat(save: Save, traits: Record<string, TraitLevel> = {}, at = { x: 5.5, y: 8.5 }): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 10, at });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.arrivedDay = -10;
  addCat(save.current, cat);
  return cat;
}

/** Кіт не спить і нічим не зайнятий ще пів години; потреби низькі — нікуди не поспішає. */
function awake(cat: Cat): Cat {
  cat.act = idleAct(30);
  cat.needs = { hunger: 10, thirst: 10, toilet: 10, fatigue: 10, attention: 10, play: 10 };
  return cat;
}

function asleep(cat: Cat): Cat {
  awake(cat);
  cat.act = { kind: "sleep", target: null, goal: null, minutes: 300, elapsed: 0 };
  cat.needs.fatigue = 60;
  return cat;
}

describe("спільні паузи (§9.12, рішення автора 2026-10-25)", () => {
  it("персонажа оглушує не частіше ніж раз на 5 хвилин", () => {
    const save = game();
    const state = save.current;
    expect(stun(state)).toBe(true);
    expect(state.character.body.stun).toBeGreaterThan(0);
    state.character.body.stun = 0;
    state.minute += STUN_PAUSE_MINUTES - 1;
    expect(stun(state)).toBe(false);
    expect(state.character.body.stun).toBe(0);
    state.minute += 1;
    expect(stun(state)).toBe(true);
  });

  it("кіт шипить не частіше ніж раз на 20 хвилин, а ревнивець сердиться за кожен сеанс уваги й без шипіння (рішення автора 2026-10-26)", () => {
    const save = game();
    const lucky = withCat(save, {}, { x: 9.5, y: 8.5 });
    const jealous = withCat(save, { jealousy: 2 }, { x: 7.5, y: 8.5 });
    const before = relation(save.current, jealous, lucky);
    const { events, stop } = recordEvents();
    jealousy(save.current, lucky);
    jealousy(save.current, lucky);
    const hissed = (): number => events.filter((e) => e.type === "hissed").length;
    expect(hissed()).toBe(1);
    expect(jealous.traits[0]?.seen).toBe(1);
    // Шипіння на паузі, але друге пестощі суперника теж коштують стосунків.
    expect(relation(save.current, jealous, lucky)).toBe(before + 2 * 2 * RELATIONS.jealousy);
    save.current.minute += HISS_PAUSE_MINUTES;
    jealousy(save.current, lucky);
    stop();
    expect(hissed()).toBe(2);
  });

  it("за ніч будять не більше двох котів", () => {
    let capped = 0;
    for (let seed = 0; seed < 30; seed++) {
      const save = game(seed);
      for (let i = 0; i < 6; i++) withCat(save, { nocturnal: 2 }, { x: 3.5 + i, y: 8.5 });
      for (const bowl of save.current.home.items) if (bowl.kind === "bowl") bowl.food = 2;
      save.current.minute = hours(22);
      const report = goToSleep(save);
      const wakes = report?.wakeUps.length ?? 0;
      expect(wakes).toBeLessThanOrEqual(WAKE_UP.maxPerNight);
      if (wakes === WAKE_UP.maxPerNight) capped += 1;
    }
    expect(capped).toBeGreaterThan(0);
  });
});

describe("гучний звук (§9.12, рішення автора 2026-10-25)", () => {
  it("пилосос загудів: несміливий ховається, сміливий іде подивитися — обидва прояви видно", () => {
    const save = game();
    standAt(save, "vacuum");
    const plain = awake(withCat(save, {}, { x: 14.5, y: 8.5 }));
    const brave = awake(withCat(save, { bravery: 1 }, { x: 12.5, y: 8.5 }));
    const timid = awake(withCat(save, { bravery: -1 }, { x: 10.5, y: 8.5 }));
    const { events, stop } = recordEvents();
    advance(save, 0.5, { move: { x: 0, y: 0 }, hold: true });
    stop();
    expect(save.current.character.activity?.kind).toBe("use");
    expect(plain.act.kind).toBe("hide");
    expect(timid.act.kind).toBe("hide");
    expect(timid.traits[0]?.seen).toBe(1);
    expect(brave.act).toMatchObject({ kind: "wander", target: "watch" });
    expect(brave.traits[0]?.seen).toBe(1);
    expect(events.flatMap((e) => (e.type === "scared" ? [e.cat] : []))).toEqual([plain.id, timid.id]);
  });

  it("соня спить далі, а чуйний прокидається й втрачає 1 настрою — прояви «Тривалості сну»", () => {
    const save = game();
    const sound = asleep(withCat(save, { sleep: 2 }, { x: 7.5, y: 8.5 }));
    const light = asleep(withCat(save, { sleep: -2, bravery: 1 }, { x: 8.5, y: 8.5 }));
    light.mood = 50;
    const { events, stop } = recordEvents();
    loudNoise(save.current, "vacuum", null);
    stop();
    expect(sound.act.kind).toBe("sleep");
    expect(sound.traits[0]?.seen).toBe(1);
    expect(light.act.kind).not.toBe("sleep");
    expect(light.mood).toBeCloseTo(50 + NOISE.wokenMood);
    expect(light.traits[0]?.seen).toBe(1);
    expect(events.some((e) => e.type === "cat-woke" && e.cat === light.id)).toBe(true);
  });

  it("дрібний звук чути лише в тій самій кімнаті, і ховається від нього лише полохливий", () => {
    const save = game();
    const timid = awake(withCat(save, { bravery: -2 }, { x: 7.5, y: 8.5 }));
    const plain = awake(withCat(save, {}, { x: 8.5, y: 8.5 }));
    const away = awake(withCat(save, { bravery: -2 }, { x: 16.5, y: 2.5 }));
    loudNoise(save.current, "broken", { x: 9.5, y: 9.5 });
    expect(timid.act.kind).toBe("hide");
    expect(timid.act.minutes).toBeCloseTo(NOISE.smallMinutes * 2);
    expect(plain.act.kind).toBe("idle");
    expect(away.act.kind).toBe("idle");
  });

  it("як довго ховатися — «Стресостійкість»", () => {
    const save = game();
    const nervous = awake(withCat(save, { stress: -2 }, { x: 7.5, y: 8.5 }));
    const calm = awake(withCat(save, { stress: 2 }, { x: 8.5, y: 8.5 }));
    loudNoise(save.current, "robot", null);
    expect(nervous.act.minutes).toBeCloseTo(NOISE.big.robot * 1.5);
    expect(calm.act.minutes).toBeCloseTo(NOISE.big.robot * 0.5);
  });

  it("персонаж упав, віджим — дрібні гучні звуки", () => {
    const save = game();
    const timid = awake(withCat(save, { bravery: -2 }, { x: 8.5, y: 8.5 }));
    expect(stun(save.current)).toBe(true);
    expect(timid.act.kind).toBe("hide");
    const bath = awake(withCat(save, { bravery: -2 }, { x: 9.5, y: 2.5 }));
    save.current.home.supplies.detergent.cheap = 2;
    expect(tapWasher(save.current)).toBe("started");
    const { events, stop } = recordEvents();
    tickHousehold(save.current, hours(12), HOUSEHOLD.washMinutes - NOISE.spinMinutes - 1);
    expect(bath.act.kind).toBe("idle");
    tickHousehold(save.current, hours(13), 2);
    stop();
    expect(events.some((e) => e.type === "laundry" && e.stage === "spin")).toBe(true);
    expect(bath.act.kind).toBe("hide");
  });

  it("феєрверки: несміливі ховаються й засмучуються, сміливі — ні", () => {
    const save = game();
    save.current.modifiers.day = "festival";
    const plain = awake(withCat(save, {}, { x: 7.5, y: 8.5 }));
    const brave = awake(withCat(save, { bravery: 2 }, { x: 8.5, y: 8.5 }));
    plain.mood = 50;
    brave.mood = 50;
    tickModifiers(save.current, MODIFIERS.festival.minute - 1, 2, false);
    expect(plain.act.kind).toBe("hide");
    expect(plain.mood).toBeCloseTo(50 + MODIFIERS.festival.mood);
    expect(brave.act.kind).toBe("idle");
    expect(brave.mood).toBe(50);
  });

  it("«Безстрашний» підбігає до робота-пилососа й катається на ньому, поки той їде; «Сміливий» — ні", () => {
    // Кадрами гри (перевірка 2026-10-25): робот рушає посеред кадру, і кіт не мав «злазити» тієї ж миті.
    const save = game();
    save.current.minute = HOUSEHOLD.robotMinute - 0.5;
    save.current.home.appliances.robot = "cheap";
    const fearless = Array.from({ length: 8 }, (_, i) => awake(withCat(save, { bravery: 2 }, { x: 2.5 + i, y: 8.5 })));
    const brave = Array.from({ length: 8 }, (_, i) => awake(withCat(save, { bravery: 1 }, { x: 2.5 + i, y: 9.5 })));
    for (const cat of [...fearless, ...brave]) cat.act.minutes = 120;
    advance(save, 1);
    const riders = fearless.filter((c) => c.act.target === "robot");
    expect(riders.length).toBeGreaterThan(0);
    expect(brave.some((c) => c.act.target === "robot")).toBe(false);
    for (let i = 0; i < 20 * 20; i++) advance(save, 0.05);
    const at = robotAt(save.current);
    const rider = riders[0] as Cat;
    expect(rider.act.target).toBe("robot");
    // Кіт на роботі: на кадр позаду (робот їде й під час кадру).
    expect(Math.hypot(rider.x - at.x, rider.y - at.y)).toBeLessThan(0.2);
    // Робот повернувся на базу — кіт злазить.
    advance(save, HOUSEHOLD.robotMinutes - 20);
    advance(save, 1);
    expect(rider.act.target).not.toBe("robot");
  });

  it("робот-пилосос чути лише в кімнаті, де він їде, і кожен кіт чує його раз за прибирання (рішення автора 2026-10-26)", () => {
    const save = game();
    save.current.minute = HOUSEHOLD.robotMinute - 0.5;
    save.current.home.appliances.robot = "cheap";
    const living = awake(withCat(save, {}, { x: 5.5, y: 8.5 }));
    // Подалі від дверного прорізу: з проходу робота чути до `NOISE.reach` клітинок.
    const timid = awake(withCat(save, { bravery: -1 }, { x: 1.5, y: 1.5 }));
    const light = asleep(withCat(save, { sleep: -2, bravery: 1 }, { x: 5.5, y: 1.5 }));
    for (const cat of [living, timid]) cat.act.minutes = 120;
    const { events, stop } = recordEvents();
    const woke = (): boolean => events.some((e) => e.type === "cat-woke" && e.cat === light.id);
    advance(save, 1);
    // О 12:00 робот рушає з бази у вітальні: там його чути, а в спальні — ні.
    expect(living.act.kind).toBe("hide");
    expect(timid.act.kind).toBe("idle");
    expect(woke()).toBe(false);
    for (let minutes = 0; minutes < HOUSEHOLD.robotMinutes; minutes += 0.5) {
      advance(save, 0.5);
      if (roomAt(robotAt(save.current)) === "bedroom") break;
      expect(timid.act.kind).toBe("idle");
      expect(woke()).toBe(false);
    }
    // Робот у спальні — несміливий ховається, чуйний прокидається.
    expect(timid.act.kind).toBe("hide");
    expect(woke()).toBe(true);
    advance(save, HOUSEHOLD.robotMinutes);
    stop();
    // Робот вертався у вітальню ще не раз, але кіт там злякався лише раз.
    expect(events.filter((e) => e.type === "scared" && e.cat === living.id)).toHaveLength(1);
    expect(save.current.home.robotHeard).toBeUndefined();
  });

  it("пилосос, який вмикають раз у раз, відкриває риси не частіше ніж раз на годину", () => {
    const save = game();
    standAt(save, "vacuum");
    const brave = awake(withCat(save, { bravery: 1 }, { x: 14.5, y: 8.5 }));
    save.current.home.fur = 50;
    const tap = (): void => {
      advance(save, 0.1, { move: { x: 0, y: 0 }, hold: true });
      advance(save, 0.02, { move: { x: 1, y: 0 }, hold: false });
      standAt(save, "vacuum");
    };
    for (let i = 0; i < 10; i++) tap();
    expect(brave.traits[0]?.seen).toBe(1);
    advance(save, NOISE.observeEvery);
    awake(brave);
    brave.x = 14.5;
    brave.y = 8.5;
    tap();
    expect(brave.traits[0]?.seen).toBe(2);
  });

  it("кіт, чий сон саме скінчився, від тріску вже не «прокидається»", () => {
    const save = game();
    const cat = asleep(withCat(save, { sleep: 2 }, { x: 7.5, y: 8.5 }));
    cat.act.minutes = 0;
    const { events, stop } = recordEvents();
    loudNoise(save.current, "broken", { x: 7.5, y: 8.5 });
    stop();
    expect(events.some((e) => e.type === "cat-woke")).toBe(false);
    expect(cat.traits[0]?.seen).toBe(0);
  });

  it("полохливий бігун, що скинув річ і злякався, ховається повністю й нікого не збиває", () => {
    let scared = 0;
    for (let seed = 0; seed < 60; seed++) {
      const save = game(seed);
      const state = save.current;
      state.home.surfaces["table"] = { kind: "meal", quality: "cheap" };
      const cat = awake(withCat(save, { bravery: -2 }, { x: 17.5, y: 3.5 }));
      cat.act = { kind: "zoomies", target: null, goal: { x: 15, y: 3 }, minutes: 2, elapsed: 0 };
      // Персонаж — на шляху бігуна.
      state.character.body.x = 15.5;
      state.character.body.y = 4.2;
      for (let i = 0; i < 6 && cat.act.kind === "zoomies"; i++) tickCats(state, 0.05, { present: true });
      if (state.home.surfaces["table"] !== null || cat.act.kind !== "hide") continue;
      scared += 1;
      expect(cat.act.minutes).toBeCloseTo(NOISE.smallMinutes * 2);
      expect(cat.act.target).not.toBe("hit");
    }
    expect(scared).toBeGreaterThan(0);
  });

  it("кроки будять лише чуйного кота, раз за прохід", () => {
    const wakes = (level: TraitLevel | 0): number => {
      const save = game();
      const cat = withCat(save, level === 0 ? {} : { sleep: level }, { x: 6.5, y: 8.5 });
      let woken = 0;
      for (let pass = 0; pass < 40; pass++) {
        asleep(cat);
        save.current.character.body.x = 7.5;
        hearSteps(save.current, { x: 9.5, y: 8.5 });
        // Персонаж уже поруч: це той самий прохід, кроки вже не будять.
        hearSteps(save.current, { x: 7.6, y: 8.5 });
        if (cat.act.kind !== "sleep") woken += 1;
      }
      return woken;
    };
    expect(wakes(0)).toBe(0);
    expect(wakes(1)).toBe(0);
    expect(wakes(-2)).toBeGreaterThan(0);
    expect(wakes(-2)).toBeLessThan(40);
  });

  it("полохливий, що ховається в новому домі, — прояв лише тоді, коли кіт без риси вже звик би", () => {
    const save = game();
    const state = save.current;
    const cat = withCat(save, { bravery: -1 }, { x: 8.5, y: 8.5 });
    cat.arrivedDay = state.day;
    const hideAt = (day: number, hour: number): void => {
      state.day = cat.arrivedDay + day;
      state.minute = hours(hour);
      awake(cat);
      cat.x = 8.5;
      cat.y = 8.5;
      decide(state, cat, createRng(day * 24 + hour), { present: true });
      expect(cat.act.kind).toBe("hide");
    };
    for (const day of [0, 1]) for (const hour of [8, 12, 20]) hideAt(day, hour);
    expect(cat.traits[0]?.seen).toBe(0);
    hideAt(2, 8);
    expect(cat.traits[0]?.seen).toBe(1);
  });

  it("сміливий звикає до нового дому за день, полохливий — за три (§9.6)", () => {
    const save = game();
    const days = (level: TraitLevel | 0): number => {
      const cat = withCat(save, level === 0 ? {} : { bravery: level });
      cat.arrivedDay = 5;
      let day = 0;
      for (; day < 5; day++) {
        save.current.day = cat.arrivedDay + day;
        save.current.minute = hours(23.9);
        if (!isAdapting(save.current, cat)) break;
      }
      return day;
    };
    expect(days(2)).toBe(1);
    expect(days(0)).toBe(2);
    expect(days(-2)).toBe(3);
  });
});

describe("«Стресостійкість» видно з поведінки (§9.12, рішення автора 2026-10-25)", () => {
  it("нервовий після неприємного вилизується, а тоді ховається — не частіше ніж раз на годину", () => {
    const save = game();
    const state = save.current;
    const nervous = Array.from({ length: 10 }, (_, i) => awake(withCat(save, { stress: -2 }, { x: 3.5 + i, y: 8.5 })));
    const plain = awake(withCat(save, {}, { x: 14.5, y: 8.5 }));
    const { events, stop } = recordEvents();
    for (const cat of [...nervous, plain]) changeMood(state, cat, -STRESS_EFFECTS.shaken);
    tickCats(state, 0.1, { present: true });
    const groomers = nervous.filter((c) => c.act.kind === "groom" && c.act.target === "nervous");
    expect(groomers.length).toBeGreaterThan(0);
    expect(groomers.length).toBeLessThan(10);
    expect(plain.act.kind).toBe("idle");
    expect(events.filter((e) => e.type === "nervous")).toHaveLength(groomers.length);
    const first = groomers[0] as Cat;
    expect(first.traits[0]?.seen).toBe(1);
    tickCats(state, STRESS_EFFECTS.groomMinutes + 0.1, { present: true });
    expect(first.act.kind).toBe("hide");
    expect(first.act.minutes).toBeGreaterThan(STRESS_EFFECTS.hideStep * 2 - 1);
    // За пів години знову засмутився — та година ще не минула: без вилизування.
    state.minute += 30;
    awake(first);
    changeMood(state, first, -STRESS_EFFECTS.shaken);
    tickCats(state, 0.1, { present: true });
    stop();
    expect(first.act.kind).toBe("idle");
  });

  it("сплячого чи того, кого тримають на руках, неприємне так не зачіпає", () => {
    const save = game();
    const sleeping = asleep(withCat(save, { stress: -2 }, { x: 7.5, y: 8.5 }));
    changeMood(save.current, sleeping, -STRESS_EFFECTS.shaken);
    expect(sleeping.shaken).toBeUndefined();
    const held = awake(withCat(save, { stress: -2 }, { x: 8.5, y: 8.5 }));
    save.current.character.held = { kind: "cat", cat: held.id };
    changeMood(save.current, held, -STRESS_EFFECTS.shaken);
    expect(held.shaken).toBeUndefined();
  });

  it("спокійного розбудили на руки — опущений, одразу спить далі", () => {
    const sleepers = (level: TraitLevel | 0): Cat[] => {
      const save = game();
      const cats = Array.from({ length: 10 }, (_, i) => asleep(withCat(save, level === 0 ? {} : { stress: level }, { x: 3.5 + i, y: 8.5 })));
      for (const cat of cats) {
        pickUpCat(save.current, cat);
        putDownCat(save.current, cat.id);
      }
      return cats.filter((c) => c.act.kind === "sleep");
    };
    const calm = sleepers(2);
    expect(calm.length).toBeGreaterThan(0);
    expect(calm.length).toBeLessThan(10);
    expect(calm[0]?.traits[0]?.seen).toBe(1);
    expect(sleepers(0)).toHaveLength(0);
    expect(sleepers(-2)).toHaveLength(0);
  });
});

describe("«Енергійність» і «Зумі» (§9.12, рішення автора 2026-10-25)", () => {
  it("енергійний увечері не дрімає, спокійний дрімає й у години пік", () => {
    const naps = (level: TraitLevel | 0): boolean => {
      const save = game();
      save.current.minute = hours(20);
      const cat = awake(withCat(save, level === 0 ? {} : { energy: level }));
      cat.needs.fatigue = 70;
      decide(save.current, cat, createRng(1), { present: true });
      return cat.act.kind === "sleep";
    };
    expect(naps(-2)).toBe(true);
    expect(naps(0)).toBe(false);
    expect(naps(2)).toBe(false);
  });

  it("задрімав у годину пік на очах персонажа — прояв «Енергійності −», раз на день", () => {
    const save = game();
    const state = save.current;
    state.minute = hours(20);
    const cat = awake(withCat(save, { energy: -1 }, { x: 4.5, y: 8.5 }));
    const nap = (): void => {
      cat.act = { kind: "sleep", target: null, goal: { x: 6, y: 8 }, minutes: 480, elapsed: 0 };
      cat.x = 4.5;
      tickCats(state, 1, { present: true });
    };
    nap();
    expect(cat.act).toMatchObject({ kind: "sleep", goal: null });
    expect(cat.traits[0]?.seen).toBe(1);
    nap();
    expect(cat.traits[0]?.seen).toBe(1);
    state.day += 1;
    nap();
    expect(cat.traits[0]?.seen).toBe(2);
    // Дуже втомлений задрімав би й без риси — це не прояв (перевірка 2026-10-25).
    state.day += 1;
    cat.needs.fatigue = 85;
    nap();
    expect(cat.traits[0]?.seen).toBe(2);
  });

  it("енергійний, з яким давно не гралися, бешкетує охочіше", () => {
    const mischief = (play: number): number => {
      const save = game();
      save.current.home.surfaces["table"] = { kind: "meal", quality: "cheap" };
      const cat = awake(withCat(save, { energy: 2 }));
      let count = 0;
      const rng = createRng(3);
      for (let i = 0; i < 300; i++) {
        cat.needs.play = play;
        decide(save.current, cat, rng, { present: false });
        if (cat.act.kind === "knock" || cat.act.kind === "scratch") count += 1;
      }
      return count;
    };
    expect(mischief(100)).toBeGreaterThan(mischief(80));
  });

  it("«Статечний» після лотка спокійно йде геть — прояв «Зумі −», раз на день", () => {
    const save = game();
    const state = save.current;
    const box = state.home.items.find((i) => i.kind === "litter");
    if (!box) throw new Error("немає лотка");
    const tile = itemTile(box);
    const cat = awake(withCat(save, { zoomies: -2 }, { x: tile.x + 0.5, y: tile.y + 0.5 }));
    state.character.body.x = tile.x + 1.5;
    state.character.body.y = tile.y + 0.5;
    const toilet = (): void => {
      cat.act = { kind: "toilet", target: `item:${box.id}`, goal: null, minutes: 0.05, elapsed: 0 };
      tickCats(state, 0.1, { present: true });
    };
    toilet();
    expect(cat.act.kind).not.toBe("zoomies");
    expect(cat.traits[0]?.seen).toBe(1);
    toilet();
    expect(cat.traits[0]?.seen).toBe(1);
  });

  it("зумі: річ зі столу на шляху падає — не щоразу", () => {
    let knocked = 0;
    for (let seed = 0; seed < 40; seed++) {
      const save = game(seed);
      const state = save.current;
      state.character.body.x = 2.5;
      state.character.body.y = 2.5;
      state.home.surfaces["table"] = { kind: "meal", quality: "cheap" };
      const cat = awake(withCat(save, {}, { x: 17.5, y: 3.5 }));
      cat.act = { kind: "zoomies", target: null, goal: { x: 15, y: 3 }, minutes: 2, elapsed: 0 };
      for (let i = 0; i < 6 && cat.act.goal?.x === 15; i++) tickCats(state, 0.05, { present: false });
      if (state.home.surfaces["table"] === null) knocked += 1;
    }
    expect(knocked).toBeGreaterThan(0);
    expect(knocked).toBeLessThan(40);
  });
});

describe("«Нічна активність» і «Ранкова побудка» (§9.12, рішення автора 2026-10-25)", () => {
  it("«Нічний сплюх» уночі частіше обирає для сну ліжко", () => {
    const onBed = (level: TraitLevel | 0): number => {
      const save = game();
      save.current.minute = hours(23.5);
      const cat = awake(withCat(save, level === 0 ? {} : { nocturnal: level }));
      const rng = createRng(5);
      let count = 0;
      for (let i = 0; i < 300; i++) {
        cat.needs.fatigue = 90;
        decide(save.current, cat, rng, { present: false });
        if (cat.act.kind === "sleep" && cat.act.goal?.x === 1) count += 1;
      }
      return count;
    };
    expect(onBed(-2)).toBeGreaterThan(onBed(0));
  });

  it("персонаж прокинувся, а «Нічний сплюх» проспав усю ніч у нього на ліжку — прояв «−»", () => {
    const seen = (onBed: boolean): number => {
      const save = game();
      const cat = withCat(save, { nocturnal: -1 }, onBed ? { x: 1.5, y: 1.5 } : { x: 5.5, y: 3.5 });
      asleep(cat).act.minutes = 10 * 60;
      cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 100, attention: 0, play: 0 };
      save.current.minute = hours(23);
      goToSleep(save);
      return cat.traits[0]?.seen ?? 0;
    };
    expect(seen(true)).toBe(1);
    expect(seen(false)).toBe(0);
  });

  it("сова бачить, як «Нічний розбишака» гасає вночі, — прояв «+», раз за ніч", () => {
    const save = game();
    const state = save.current;
    state.minute = hours(23.5);
    const cat = awake(withCat(save, { nocturnal: 2 }, { x: 8.5, y: 8.5 }));
    const rng = createRng(7);
    const play = (): void => {
      for (let i = 0; i < 40; i++) {
        cat.needs.play = 90;
        decide(state, cat, rng, { present: true });
      }
    };
    play();
    expect(cat.traits[0]?.seen).toBe(1);
    state.day += 1;
    play();
    expect(cat.traits[0]?.seen).toBe(2);
    // Увечері, до нічної години, бешкет — не прояв нічної активності.
    state.day += 1;
    state.minute = hours(20);
    play();
    expect(cat.traits[0]?.seen).toBe(2);
  });

  it("«Живий будильник» будить і з повною мискою, «Терплячий зранку» — ніколи", () => {
    const mornings = (level: TraitLevel, full: boolean): number => {
      let woke = 0;
      for (let seed = 0; seed < 30; seed++) {
        const save = game(seed);
        const cat = withCat(save, { morning: level });
        cat.needs.hunger = 70;
        for (const bowl of save.current.home.items) if (bowl.kind === "bowl") bowl.food = full ? 2 : 0;
        save.current.minute = hours(22);
        const report = goToSleep(save);
        if (report?.wakeUps.some((w) => w.reason === "morning")) woke += 1;
      }
      return woke;
    };
    expect(mornings(2, true)).toBeGreaterThan(0);
    expect(mornings(-2, false)).toBe(0);
  });

  it("голодний «Терплячий зранку» чекає біля ліжка, поки персонаж прокинеться, — прояв «−»", () => {
    const save = game();
    const patient = withCat(save, { morning: -1 });
    const plain = withCat(save, {}, { x: 7.5, y: 8.5 });
    for (const cat of [patient, plain]) cat.needs = { hunger: 30, thirst: 0, toilet: 0, fatigue: 20, attention: 0, play: 0 };
    for (const bowl of save.current.home.items) if (bowl.kind === "bowl") bowl.food = 0;
    save.current.minute = hours(22);
    goToSleep(save);
    expect(patient.act).toMatchObject({ kind: "beg", target: "bed" });
    expect(patient.traits[0]?.seen).toBe(1);
    expect(Math.hypot(patient.x - save.current.character.body.x, patient.y - save.current.character.body.y)).toBeLessThan(1.5);
    // Попереду персонажа (камера «три чверті»): позаду його кота не видно.
    expect(patient.y).toBeGreaterThan(save.current.character.body.y);
    expect(plain.act.target).not.toBe("bed");
    // Чекає мовчки, як каже підказка (рішення автора 2026-10-26): за кілька хвилин біля ліжка — жодного нявкання.
    const { events, stop } = recordEvents();
    for (let i = 0; i < 20 && patient.act.target === "bed"; i++) {
      save.current.minute += 0.25;
      tickCats(save.current, 0.25, { present: true });
    }
    stop();
    expect(patient.act.elapsed).toBeGreaterThan(TALKATIVE.meowMinutes);
    expect(events.some((e) => e.type === "meow" && e.cat === patient.id)).toBe(false);
  });
});
