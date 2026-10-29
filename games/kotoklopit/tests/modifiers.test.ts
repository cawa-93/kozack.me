// Модифікатори дня й тижня (§4.1, `DAY_MODIFIERS.md`): вибір, обмеження й ефекти.

import { describe, expect, it } from "vitest";

import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { pickUpCat } from "../src/sim/actions";
import { createCat } from "../src/sim/cat";
import { GUESTS, MODIFIERS, PRODUCTS, STORAGE_LIMITS } from "../src/sim/config";
import { unpack } from "../src/sim/economy";
import { advance, carryFoundling, deserialize, goToSleep, interact, newGame, serialize } from "../src/sim/game";
import { active, answerCall, chooseDayModifier, chooseWeekModifier, decideFoundling, ignoreCall, patienceDecayFactor, startModifiers, tickModifiers } from "../src/sim/modifiers";
import { coughWakes } from "../src/sim/night";
import { nightlyStates } from "../src/sim/reproduction";
import { scheduleOf } from "../src/view/schedule";
import { objectById } from "../src/sim/home";
import { fallIll } from "../src/sim/diseases";
import { addCat, giveStarterPack } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { boxesShown } from "../src/sim/storage";
import type { Save } from "../src/sim/types";
import { weekdayOf } from "../src/sim/time";
import { callImpression, isWorkday, startWork, tickWork } from "../src/sim/work";
import { hours, recordEvents, standAt, walkTo } from "./helpers";

const game = (): Save => newGame({ sex: "female", difficulty: "normal", seed: 14 });

describe("вибір модифікаторів: перевірка модифікаторів 2026-10-28", () => {
  const seen = (setup: (save: Save) => void, day = 2, n = 1500): Set<string | null> => {
    const save = game();
    setup(save);
    const out = new Set<string | null>();
    for (let seed = 0; seed < n; seed++) {
      save.current.modifiers.day = null;
      out.add(chooseDayModifier(save.current, day, createRng(seed)));
    }
    return out;
  };

  it("безробітному «Планове відключення» буває, «Швидкий інтернет» — ні; на лікарняному робочих немає; суперечливі з тижнем не випадають", () => {
    const jobless = seen((save) => (save.current.job.unemployed = true));
    expect(jobless.has("outage")).toBe(true);
    expect(jobless.has("fast-internet")).toBe(false);
    const sick = seen((save) => {
      save.current.job.sickLeaveFrom = 2;
      save.current.job.sickLeaveUntil = 2;
    });
    for (const id of ["reprimand", "praise", "meeting", "lunch", "deadline", "lull", "bonus", "pay-delay", "midweek-off"]) expect(sick.has(id)).toBe(false);
    expect(seen((save) => (save.current.modifiers.week = "crunch"), 5).has("work-saturday")).toBe(false);
    expect(seen((save) => (save.current.modifiers.week = "deadline-week")).has("lull")).toBe(false);
    expect(seen((save) => (save.current.modifiers.week = "quiet-week")).has("deadline")).toBe(false);
    // Без котів друг не приходить допомагати з котами.
    expect(seen((save) => (save.current.cats = [])).has("friend-help")).toBe(false);
  });

  it("частка важкого боку — за складністю й тоді, коли в пари сьогодні можливий лише один бік", () => {
    const save = newGame({ sex: "female", difficulty: "hard", seed: 14 });
    const hard = new Set(["deadline", "meeting", "pay-delay", "reprimand", "work-saturday", "outage", "inspection", "guests", "noisy-neighbors", "sick", "mom-call", "traffic", "renovation", "food-price-up", "full-moon", "festival", "vaccination", "heat"]);
    let hardCount = 0;
    let total = 0;
    for (let seed = 0; seed < 3000; seed++) {
      save.current.modifiers.day = null;
      const id = chooseDayModifier(save.current, 5, createRng(seed));
      if (id === null || id === "office" || id === "show") continue;
      total += 1;
      if (hard.has(id)) hardCount += 1;
    }
    expect(hardCount / total).toBeGreaterThan(0.56);
    expect(hardCount / total).toBeLessThan(0.64);
  });

  it("безробітному модифікатор тижня — приблизно в половині тижнів; щеплення — 7 днів; перерахунки додаються", () => {
    const save = game();
    save.current.job.unemployed = true;
    let some = 0;
    for (let week = 1; week <= 400; week++) if (chooseWeekModifier(save.current, week)) some += 1;
    expect(some / 400).toBeGreaterThan(0.4);
    const vaccine = game();
    vaccine.current.day = 2;
    vaccine.current.modifiers.day = "vaccination";
    startModifiers(vaccine.current, createRng(1));
    expect(vaccine.current.today.vaccineMissedUntil).toBe(8);
    const recalc = game();
    recalc.current.today.utilitiesDiscount = 10;
    recalc.current.day = 3;
    for (let seed = 0; seed < 5000 && recalc.current.today.utilitiesDiscount === 10; seed++) {
      recalc.current.modifiers.day = null;
      startModifiers(recalc.current, createRng(seed));
      if (recalc.current.modifiers.day !== "recalculation") recalc.current.today.utilitiesDiscount = 10;
    }
    expect(recalc.current.today.utilitiesDiscount).toBe(20);
  });
});

describe("події модифікаторів: перевірка модифікаторів 2026-10-28", () => {
  const withCat = (save: Save, traits: Record<string, -2 | -1 | 1 | 2> = {}, sex: "male" | "female" = "female") => {
    const cat = createCat(save.current, createRng(save.current.cats.length + 3), { source: "shelter", ageWeeks: 4, sex, at: { x: 5.5, y: 8.5 } });
    cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
    cat.arrivedDay = -10;
    addCat(save.current, cat);
    return cat;
  };

  it("«Котячий березень» — частіші тічки вже в сам тиждень; «Спокійний сезон» обриває тічку", () => {
    const save = game();
    const cat = withCat(save);
    cat.sterilized = false;
    save.current.day = 10;
    save.current.modifiers.week = "cat-march";
    // Остання тічка почалася в ніч на 4-й день, наступна за звичайним розкладом — аж на 17-й.
    cat.heatUntil = 6;
    cat.nextHeat = 17;
    nightlyStates(save.current, createRng(1));
    expect(cat.heatUntil).toBe(13);
    save.current.modifiers.week = "calm-season";
    nightlyStates(save.current, createRng(1));
    expect(cat.heatUntil).toBeLessThanOrEqual(save.current.day);
  });

  it("«Тиха ніч» — і кахикання не будить; новонароджені не будять; феєрверки гримлять і тоді, коли персонаж уже спить", () => {
    const quiet = game();
    quiet.current.modifiers.day = "quiet-night";
    const report = { wakeUps: [] } as unknown as Parameters<typeof coughWakes>[1];
    expect(coughWakes(quiet.current, report, { ...createRng(1), chance: () => true }, 0)).toBe(0);

    for (let seed = 0; seed < 10; seed++) {
      const fest = newGame({ sex: "female", difficulty: "normal", seed: seed + 50 });
      fest.current.modifiers.day = "festival";
      fest.current.day = 2;
      fest.current.minute = 20 * 60 + 30;
      const kitten = createCat(fest.current, createRng(seed), { source: "born", ageWeeks: 0 });
      addCat(fest.current, kitten);
      const shy = withCat(fest, { bravery: -2 });
      shy.act = { kind: "idle", target: null, goal: null, minutes: 600, elapsed: 0 };
      const { events, stop } = recordEvents();
      goToSleep(fest);
      stop();
      expect(fest.current.lastNight?.wakeUps.some((w) => w.cat === kitten.id)).toBe(false);
      expect(events).toContainEqual(expect.objectContaining({ type: "scared", cat: shy.id }));
    }
  });

  it("феєрверки вночі: персонаж спить і проявів «Сміливості» не бачить (повторна перевірка 2026-10-28)", () => {
    const save = game();
    save.current.modifiers.day = "festival";
    save.current.day = 2;
    save.current.minute = 20 * 60 + 30;
    const shy = withCat(save, { bravery: -2 });
    const bed = objectById("bed");
    if (!bed) throw new Error("немає ліжка");
    shy.x = bed.x + 2.5;
    shy.y = bed.y + 0.5;
    shy.act = { kind: "idle", target: null, goal: null, minutes: 600, elapsed: 0 };
    goToSleep(save);
    expect(shy.traits[0]?.seen).toBe(0);
  });

  it("гості: сплячого «−» кота не чіпають; друг допомагає вже о 10:00; ОСББ каже, скільки заплатили; ветеринарка дзвонить", () => {
    const save = game();
    save.current.modifiers.day = "guests";
    const sleeper = withCat(save, { guests: -2 });
    sleeper.act = { kind: "sleep", target: null, goal: null, minutes: 600, elapsed: 0 };
    const sanity = save.current.character.stats.sanity;
    tickModifiers(save.current, 19 * 60 - 1, 2, false);
    expect(sleeper.act.kind).toBe("sleep");
    expect(save.current.character.stats.sanity).toBe(sanity);

    const friend = game();
    const pal = withCat(friend);
    friend.current.modifiers.day = "friend-help";
    giveStarterPack(friend.current, pal);
    const water = friend.current.home.items.find((i) => i.kind === "water");
    if (water?.kind !== "water") throw new Error("немає поїлки");
    water.water = 0;
    tickModifiers(friend.current, 10 * 60 - 1, 2, false);
    expect(water.water).toBeGreaterThan(0);

    const osbb = game();
    osbb.current.modifiers.day = "inspection";
    osbb.current.character.money = 4;
    osbb.current.home.messes.push({ id: 900, kind: "vomit", x: 5, y: 8, cat: null }, { id: 901, kind: "vomit", x: 6, y: 8, cat: null });
    const fine = recordEvents();
    tickModifiers(osbb.current, 15 * 60 - 1, 2, false);
    fine.stop();
    expect(fine.events).toContainEqual(expect.objectContaining({ type: "modifier", kind: "inspection", value: 10, paid: 4 }));

    const vet = game();
    withCat(vet);
    vet.current.modifiers.day = "home-vet";
    const bell = recordEvents();
    tickModifiers(vet.current, 11 * 60 - GUESTS.ringLead - 1, GUESTS.ringLead + 2, false);
    bell.stop();
    expect(bell.events.some((e) => e.type === "doorbell")).toBe(true);
  });

  it("кіт у кадрі (на колінах) враження на відеодзвінку не псує (рішення автора 2026-10-28)", () => {
    const save = game();
    const before = callImpression(save.current);
    const cat = withCat(save);
    cat.act = { kind: "lap", target: null, goal: null, minutes: 30, elapsed: 0 };
    expect(callImpression(save.current)).toBe(before);
  });

  it("відповісти мамі за комп'ютером — не робота; поїздка в обідню перерву не штрафується; офісу в розкладі після зборів немає", () => {
    const save = game();
    save.current.day = 1;
    save.current.minute = 11 * 60;
    startWork(save.current);
    save.current.today.callPending = true;
    expect(answerCall(save.current)).toBe(true);
    expect(save.current.character.activity).toBeNull();

    const lunch = game();
    lunch.current.day = 1;
    lunch.current.modifiers.day = "lunch";
    lunch.current.minute = 12 * 60 + 30;
    lunch.current.trip = { destination: "shop", phase: "visit", cat: null } as unknown as NonNullable<Save["current"]["trip"]>;
    const reputation = lunch.current.job.reputation;
    tickWork(lunch.current, 12 * 60 + 30, 30);
    expect(lunch.current.job.reputation).toBe(reputation);
    expect(lunch.current.job.tripDays).toEqual([]);

    const office = game();
    office.current.day = 1;
    office.current.modifiers.day = "office";
    office.current.minute = 15 * 60;
    office.current.today.officeDone = true;
    expect(scheduleOf(office.current).some((line) => line.includes("офіс"))).toBe(false);
  });

  it("відповідаючи мамі, кота з рук опускають поруч: пів години розмови він не пручається й не кусає (загальна ревізія 2026-10-29)", () => {
    const save = game();
    save.current.minute = 11 * 60;
    const cat = withCat(save, { lap: -1 });
    Object.assign(save.current.character.body, { x: cat.x + 0.5, y: cat.y });
    pickUpCat(save.current, cat);
    expect(save.current.character.held).toMatchObject({ kind: "cat", cat: cat.id });
    const { events, stop } = recordEvents();
    save.current.today.callPending = true;
    answerCall(save.current);
    advance(save, MODIFIERS.call.minutes);
    stop();
    expect(save.current.character.held).toBeNull();
    expect(events.some((e) => (e.type === "bite" || e.type === "clawed") && e.cat === cat.id)).toBe(false);
  });

  it("мама дзвонить посеред купання: кота опускають, купання перервано — шампунь цілий, персонаж не стоїть у кабіні вхолосту (загальна ревізія 2026-10-29)", () => {
    const save = game();
    save.current.minute = 11 * 60;
    const cat = withCat(save);
    save.current.home.supplies.shampoo = { cheap: 5, premium: 0 };
    save.current.character.held = { kind: "cat", cat: cat.id };
    standAt(save, "shower");
    interact(save);
    expect(save.current.character.activity).toMatchObject({ kind: "use", inside: true, bath: true });
    const { events, stop } = recordEvents();
    save.current.today.callPending = true;
    expect(answerCall(save.current)).toBe(true);
    expect(save.current.character.activity).toBeNull();
    advance(save, MODIFIERS.call.minutes);
    stop();
    expect(save.current.character.held).toBeNull();
    expect(events.some((e) => e.type === "bathed")).toBe(false);
    expect(save.current.home.supplies.shampoo.cheap).toBe(5);
  });

  it("дзвінок мами чекає відповіді й після перезавантаження: «не відповідати» — −5 раз, відповісти після цього не можна, ніч скидає без штрафу (загальна ревізія 2026-10-29)", () => {
    /** День «Мама дзвонить»: дзвінок пролунав, гру збережено й відкрито знову. */
    const rang = (): Save => {
      const save = game();
      save.current.modifiers.day = "mom-call";
      save.current.minute = 11 * 60;
      save.current.today.callAt = 11 * 60 + 5;
      save.current.character.stats.sanity = 50;
      advance(save, 10);
      expect(save.current.today.callAt).toBeNull();
      return deserialize(serialize(save));
    };
    const ignored = rang();
    expect(ignored.current.today.callPending).toBe(true);
    const sanity = ignored.current.character.stats.sanity;
    expect(ignoreCall(ignored.current)).toBe(true);
    expect(ignored.current.character.stats.sanity).toBeCloseTo(sanity + MODIFIERS.call.ignored);
    expect(ignored.current.today.callPending).toBeUndefined();
    // Друге натискання нічого не знімає, і відповісти вже не можна.
    expect(ignoreCall(ignored.current)).toBe(false);
    expect(answerCall(ignored.current)).toBe(false);
    expect(ignored.current.character.stats.sanity).toBeCloseTo(sanity + MODIFIERS.call.ignored);
    // Не відповіли до ночі — уранці дзвінок минув без штрафу.
    const night = rang();
    const before = night.current.character.stats.sanity;
    startModifiers(night.current, createRng(1));
    expect(night.current.today.callPending).toBeUndefined();
    expect(ignoreCall(night.current)).toBe(false);
    expect(night.current.character.stats.sanity).toBe(before);
    // Старе збереження без поля: дзвінок не чекає.
    const old = rang();
    delete old.current.today.callPending;
    const copy = deserialize(serialize(old));
    expect(answerCall(copy.current)).toBe(false);
  });
});

describe("вибір модифікаторів (§4.1)", () => {
  it("приблизно третина днів без модифікатора; котячі — лише коли є кіт", () => {
    const save = game();
    let none = 0;
    const seen = new Set<string>();
    for (let seed = 0; seed < 600; seed++) {
      save.current.modifiers.day = null;
      const id = chooseDayModifier(save.current, 2, createRng(seed));
      if (id === null) none += 1;
      else seen.add(id);
    }
    expect(none / 600).toBeGreaterThan(0.25);
    expect(none / 600).toBeLessThan(0.42);
    for (const catOnly of ["full-moon", "rain", "heat", "festival", "food-price-up"]) expect(seen.has(catOnly)).toBe(false);
  });

  it("той самий модифікатор не повторюється два дні поспіль", () => {
    const save = game();
    for (let seed = 0; seed < 300; seed++) {
      save.current.modifiers.day = "deadline";
      expect(chooseDayModifier(save.current, 2, createRng(seed))).not.toBe("deadline");
    }
  });

  it("модифікатор тижня — приблизно в половині тижнів; у відпустку робочих модифікаторів немає", () => {
    const save = game();
    let some = 0;
    for (let week = 1; week <= 200; week++) if (chooseWeekModifier(save.current, week)) some += 1;
    expect(some / 200).toBeGreaterThan(0.38);
    expect(some / 200).toBeLessThan(0.62);
    save.current.modifiers.week = "vacation";
    for (let seed = 0; seed < 300; seed++) {
      save.current.modifiers.day = null;
      const id = chooseDayModifier(save.current, 2, createRng(seed));
      // «Збори в офісі» — теж (перевірка поїздок 2026-10-28), і на лікарняному.
      expect(["deadline", "lull", "meeting", "lunch", "bonus", "pay-delay", "reprimand", "praise", "office"]).not.toContain(id);
    }
    save.current.modifiers.week = null;
    save.current.job.sickLeaveFrom = 2;
    save.current.job.sickLeaveUntil = 2;
    for (let seed = 0; seed < 300; seed++) expect(chooseDayModifier(save.current, 2, createRng(seed))).not.toBe("office");
  });

  it("на переграванні модифікатор дня той самий, якщо стан лише відсіяв інші варіанти: лікарняний, звільнення, менше котів і вчорашній не зсувають вибору (§6.1, загальна ревізія 2026-10-29)", () => {
    const work = new Set(["deadline", "lull", "meeting", "lunch", "pay-delay", "bonus", "reprimand", "praise", "work-saturday", "midweek-off", "office"]);
    const catOnly = new Set(["full-moon", "rain", "festival", "quiet-evening", "vaccination", "home-vet", "heat", "cold", "friend-help", "food-price-up", "pet-sale", "show"]);
    /** Гра з котом (усі модифікатори можливі), потім зміна стану. */
    const pick = (seed: number, setup: (save: Save) => void = () => {}): string | null => {
      const save = game();
      addCat(save.current, createCat(save.current, createRng(3), { source: "shelter", ageWeeks: 4, at: { x: 5.5, y: 8.5 } }));
      setup(save);
      return chooseDayModifier(save.current, 2, createRng(seed));
    };
    let checked = 0;
    for (let seed = 0; seed < 600; seed++) {
      const base = pick(seed, (save) => (save.current.modifiers.day = null));
      if (base === null || work.has(base)) continue;
      checked += 1;
      const sick = pick(seed, (save) => {
        save.current.modifiers.day = null;
        save.current.job.sickLeaveFrom = 2;
        save.current.job.sickLeaveUntil = 2;
      });
      expect(sick).toBe(base);
      // Учора був інший модифікатор — сьогоднішній не змінюється.
      const other = base === "rain" ? "renovation" : "rain";
      expect(pick(seed, (save) => (save.current.modifiers.day = other))).toBe(base);
      // Безробітному «Швидкий інтернет» неможливий (лише в робочий день) — решта та сама.
      if (base !== "fast-internet") expect(pick(seed, (save) => ((save.current.modifiers.day = null), (save.current.job.unemployed = true)))).toBe(base);
      // Котів не стало — не котячий модифікатор той самий.
      if (!catOnly.has(base)) expect(pick(seed, (save) => ((save.current.modifiers.day = null), (save.current.cats = [])))).toBe(base);
    }
    expect(checked).toBeGreaterThan(200);
  });

  it("щоночі обирається модифікатор нового дня", () => {
    const save = game();
    save.current.minute = 22 * 60;
    goToSleep(save);
    expect(save.current.modifiers.day).not.toBe("first-day");
  });
});

describe("ефекти (§4.1)", () => {
  it("дедлайн — терпіння спадає вдвічі швидше; обідня перерва — не спадає", () => {
    const save = game();
    save.current.modifiers.day = "deadline";
    expect(patienceDecayFactor(save.current)).toBe(2);
    save.current.modifiers.day = "lunch";
    save.current.minute = 12.5 * 60;
    expect(patienceDecayFactor(save.current)).toBe(0);
  });

  it("«Догана» й «Похвала» посади самі не змінюють: репутація лишається в межах 1–99 (загальна ревізія 2026-10-29)", () => {
    /** Ранок робочого дня з потрібним модифікатором і заданою репутацією стажера. */
    const morning = (kind: "reprimand" | "praise", reputation: number) => {
      const save = game();
      save.current.day = 2;
      for (let seed = 0; seed < 5000 && save.current.modifiers.day !== kind; seed++) {
        save.current.modifiers.day = null;
        save.current.job.position = 0;
        save.current.job.reputation = reputation;
        const { events, stop } = recordEvents();
        startModifiers(save.current, createRng(seed));
        stop();
        if (save.current.modifiers.day === kind) return { save, events };
      }
      throw new Error(`немає дня «${kind}»`);
    };
    const reprimand = morning("reprimand", 8);
    expect(reprimand.save.current.job.unemployed).toBe(false);
    expect(reprimand.save.current.job.reputation).toBeCloseTo(MODIFIERS.reputationKeep.min);
    expect(reprimand.events.some((e) => e.type === "career")).toBe(false);
    expect(reprimand.events.find((e) => e.type === "modifier" && e.kind === "reputation")).toMatchObject({ value: -7 });
    const praise = morning("praise", 95);
    expect(praise.save.current.job.position).toBe(0);
    expect(praise.save.current.job.reputation).toBeCloseTo(MODIFIERS.reputationKeep.max);
    expect(praise.events.some((e) => e.type === "career")).toBe(false);
    // Далеко від меж — повні ∓3 години репутації.
    expect(morning("reprimand", 50).save.current.job.reputation).toBeCloseTo(50 - 3 * 3.09);
    // Уже біля межі — «Догана» не піднімає репутацію.
    expect(morning("reprimand", 0.5).save.current.job.reputation).toBeCloseTo(0.5);
  });

  it("робоча субота й вихідний посеред тижня змінюють робочий день", () => {
    const save = game();
    save.current.day = 5;
    expect(isWorkday(save.current)).toBe(false);
    save.current.modifiers.day = "work-saturday";
    expect(isWorkday(save.current)).toBe(true);
    save.current.day = 2;
    save.current.modifiers.day = "midweek-off";
    expect(isWorkday(save.current)).toBe(false);
  });

  it("важлива нарада: відсутність б'є по репутації", () => {
    const save = game();
    save.current.day = 1;
    save.current.modifiers.day = "meeting";
    const reputation = save.current.job.reputation;
    tickModifiers(save.current, 14 * 60 - 1, 62, false);
    expect(save.current.job.reputation).toBeLessThan(reputation);
  });

  it("гості: безлад — сором", () => {
    const save = game();
    save.current.modifiers.day = "guests";
    save.current.home.messes.push({ id: 900, kind: "vomit", x: 5, y: 8, cat: null }, { id: 901, kind: "hairball", x: 6, y: 8, cat: null });
    const sanity = save.current.character.stats.sanity;
    tickModifiers(save.current, 19 * 60 - 1, 2, false);
    expect(save.current.character.stats.sanity).toBe(sanity - 6);
  });

  it("спека — тижнева теж; знайда — нове кошеня", () => {
    const save = game();
    save.current.modifiers.week = "heat-wave";
    expect(active(save.current, "heat")).toBe(true);
    const cat = createCat(save.current, createRng(1), { source: "shelter", ageWeeks: 3 });
    addCat(save.current, cat);
    save.current.today.foundling = true;
    const kitten = decideFoundling(save.current, true, createRng(2));
    expect(kitten?.source).toBe("foundling");
    expect(save.current.cats).toHaveLength(2);
  });

  it("знайда — умова дня: на переграванні те саме кошеня; віднести в притулок — дві години поза домом (перевірка розмноження 2026-10-28)", () => {
    // Перегравання: поведінка котів інша (інше зерно behavior), а знайда та сама.
    const take = (behavior: number): string => {
      const save = game();
      save.current.today.foundling = true;
      save.current.rng.behavior = behavior;
      const kitten = decideFoundling(save.current, true);
      return `${kitten?.name} ${kitten?.sex} ${kitten?.traits.map((t) => t.group + t.level).join()}`;
    };
    expect(take(111)).toBe(take(222));
    const save = game();
    save.current.today.foundling = true;
    save.current.minute = 7 * 60;
    decideFoundling(save.current, false);
    const { events, stop } = recordEvents();
    carryFoundling(save);
    stop();
    expect(save.current.minute).toBe(9 * 60);
    expect(save.current.trip).toBeNull();
    expect(events).toContainEqual(expect.objectContaining({ type: "trip-ended", destination: "shelter" }));
  });

  it("сова відносить знайду о 08:00 у будній день: штраф як за першу поїздку тижня, до лічильника поїздок не додається (загальна ревізія 2026-10-29)", () => {
    const save = game();
    save.current.day = 2;
    save.current.modifiers.day = null;
    save.current.minute = 8 * 60;
    // Учора вже була поїздка в робочий час: звичайна поїздка сьогодні штрафувалася б удвічі.
    save.current.job.tripDays = [1];
    save.current.job.reputation = 50;
    save.current.today.foundling = true;
    decideFoundling(save.current, false);
    carryFoundling(save);
    expect(save.current.minute).toBe(10 * 60);
    expect(save.current.job.tripDays).toEqual([1]);
    // Година в робочий час (09:00–10:00) — як перша поїздка тижня: репутація за годину стажера / 3.
    expect(save.current.job.reputation).toBeCloseTo(50 - 3.09 / 3);
  });

  it("нічні кидки кроку не залежать від того, скільки чисел узяли раніші кроки: примусове кошеня те саме (перевірка розмноження 2026-10-28)", () => {
    const kitten = (sick: boolean): string => {
      const save = game();
      save.current.day = 2;
      save.current.minute = 22 * 60;
      save.current.character.stats.sanity = 20;
      const cat = createCat(save.current, createRng(7), { source: "shelter", ageWeeks: 3 });
      cat.arrivedDay = -10;
      addCat(save.current, cat);
      if (sick) fallIll(save.current, cat, "cold");
      goToSleep(save);
      const forced = save.current.cats.find((c) => c.source === "shelter-forced");
      return `${forced?.name} ${forced?.sex} ${forced?.traits.map((t) => t.group + t.level).join()}`;
    };
    expect(kitten(true)).toBe(kitten(false));
  });

  /** День «Мамині гостинці» з порожніми кухонними поверхнями; повертає, коли мама подзвонить. */
  function momDay(save: Save): number {
    save.current.day = 3;
    for (let seed = 0; seed < 2000; seed++) {
      save.current.modifiers.day = null;
      save.current.home.surfaces["counter-left"] = null;
      save.current.home.surfaces["counter-right"] = null;
      startModifiers(save.current, createRng(seed));
      if (save.current.modifiers.day === "mom-food") break;
    }
    expect(save.current.modifiers.day).toBe("mom-food");
    return save.current.today.mom?.at ?? -1;
  }
  /** Мамині судочки (§6.4, рішення автора 2026-10-26): скільки в холодильнику й скільки в ящиках біля входу. */
  const inFridge = (save: Save): number => save.current.home.supplies.momMeal.cheap;
  const inBoxes = (save: Save): number => save.current.home.boxes?.momMeal?.cheap ?? 0;
  const away = (save: Save): void => {
    save.current.trip = { destination: "shop" } as unknown as NonNullable<Save["current"]["trip"]>;
  };

  it("«Мамині гостинці» — удень дзвонить у двері, за `ringLead` хвилин заходить і ставить два судочки в холодильник (рішення автора 2026-10-26; 2026-10-29, А5 — за 6 хвилин)", () => {
    const save = game();
    const at = momDay(save);
    // Зранку ще нічого: мама приїде вдень.
    expect(at).toBeGreaterThanOrEqual(MODIFIERS.mom.from);
    expect(at).toBeLessThan(MODIFIERS.mom.to);
    expect(inFridge(save)).toBe(0);
    const { events, stop } = recordEvents();
    tickModifiers(save.current, at - 0.5, 1, false);
    expect(events.some((e) => e.type === "doorbell")).toBe(true);
    expect(inFridge(save)).toBe(0);
    // За хвилину до візиту мама ще під дверима.
    tickModifiers(save.current, at + 0.5, GUESTS.ringLead - 1.5, false);
    expect(inFridge(save)).toBe(0);
    tickModifiers(save.current, at + GUESTS.ringLead - 1, 1.5, false);
    stop();
    expect(inFridge(save)).toBe(PRODUCTS.momMeal.units.cheap);
    expect(inFridge(save)).toBe(2);
    expect(inBoxes(save)).toBe(0);
    // На кухні — нічого: судочки в холодильнику, і холодильник їх показує.
    expect(save.current.home.surfaces["counter-left"]).toBeNull();
    expect(save.current.home.acquired).toContain("momMeal");
    expect(events.some((e) => e.type === "modifier" && e.kind === "mom-food" && e.value === 1)).toBe(true);
    expect(save.current.today.mom).toBeUndefined();
  });

  it("обидві кухонні поверхні зайняті — судочки однаково є: вони в холодильнику (раніше їх не було зовсім)", () => {
    const save = game();
    const at = momDay(save);
    const dish = { kind: "raw", quality: "cheap" } as const;
    save.current.home.surfaces["counter-left"] = { ...dish };
    save.current.home.surfaces["counter-right"] = { ...dish };
    tickModifiers(save.current, at - 0.5, 1, false);
    tickModifiers(save.current, at + 0.5, GUESTS.ringLead, false);
    expect(inFridge(save)).toBe(2);
    expect(save.current.home.surfaces["counter-left"]).toEqual(dish);
  });

  it("холодильник повний — що не влізло, мама лишає в ящиках біля входу, нічого не пропадає", () => {
    const save = game();
    const at = momDay(save);
    save.current.home.supplies.momMeal.cheap = STORAGE_LIMITS.momMeal - 1;
    tickModifiers(save.current, at - 0.5, 1, false);
    tickModifiers(save.current, at + 0.5, GUESTS.ringLead, false);
    expect(inFridge(save)).toBe(STORAGE_LIMITS.momMeal);
    expect(inBoxes(save)).toBe(1);
  });

  it("персонажа немає — мама приходить, щойно він повернувся (до 20:00), а пізніше лишає пакет під дверима: він у ящиках біля входу", () => {
    const back = game();
    const at = momDay(back);
    away(back);
    const { events, stop } = recordEvents();
    tickModifiers(back.current, at - 0.5, 1, false);
    expect(events.some((e) => e.type === "doorbell")).toBe(false);
    back.current.trip = null;
    tickModifiers(back.current, hours(19), 0.5, false);
    expect(events.some((e) => e.type === "doorbell")).toBe(true);
    tickModifiers(back.current, hours(19) + 0.5, GUESTS.ringLead, false);
    expect(inFridge(back)).toBe(2);
    events.length = 0;

    const late = game();
    momDay(late);
    away(late);
    tickModifiers(late.current, MODIFIERS.mom.until - 0.5, 1, false);
    expect(late.current.today.mom?.porch).toBe(true);
    expect(inBoxes(late)).toBe(0);
    late.current.trip = null;
    tickModifiers(late.current, hours(21), 0.5, false);
    stop();
    // Пакет — у ящиках, як покупка; у холодильник судочки кладе «Розпакувати».
    expect(inBoxes(late)).toBe(2);
    expect(inFridge(late)).toBe(0);
    expect(boxesShown(late.current)).toBe(1);
    expect(events.some((e) => e.type === "doorbell")).toBe(false);
    expect(events.some((e) => e.type === "modifier" && e.kind === "mom-food" && e.value === 0)).toBe(true);
    unpack(late.current);
    expect(inFridge(late)).toBe(2);
    expect(inBoxes(late)).toBe(0);
  });

  it("ніч застала персонажа в поїздці чи він ліг, не дочекавшись мами після дзвінка, — пакет однаково в ящиках біля входу зранку (перевірка 2026-10-26)", () => {
    for (const rang of [false, true]) {
      const save = game();
      const at = momDay(save);
      if (rang) tickModifiers(save.current, at - 0.5, 1, false);
      else {
        away(save);
        tickModifiers(save.current, MODIFIERS.mom.until - 0.5, 1, false);
      }
      expect(save.current.today.mom?.[rang ? "rang" : "porch"], `rang ${rang}`).toBe(true);
      save.current.minute = hours(23);
      goToSleep(save);
      expect(inBoxes(save), `rang ${rang}`).toBe(2);
      expect(inFridge(save), `rang ${rang}`).toBe(0);
    }
  });

  it("сценарій «Мама з гостинцями»: о 12:03 дзвінок — «Душа компанії» біжить до дверей і чекає, сором'язлива ховається; за 6 хвилин судочки в холодильнику", () => {
    const scenario = FILE_SCENARIOS["mom-visit"];
    if (!scenario) throw new Error("немає сценарію");
    const save = applyScenario(scenario);
    expect(weekdayOf(save.current.day)).toBe(5);
    const [host, shy] = save.current.cats;
    const { events, stop } = recordEvents();
    advance(save, 4);
    expect(events.some((e) => e.type === "doorbell")).toBe(true);
    expect(host?.act.target).toBe("guest");
    expect(shy?.act.kind).toBe("hide");
    expect(inFridge(save)).toBe(0);
    advance(save, GUESTS.ringLead - 2);
    expect(inFridge(save)).toBe(0);
    expect(host?.act.target).toBe("guest");
    advance(save, 2);
    stop();
    expect(inFridge(save)).toBe(2);
    expect(events.some((e) => e.type === "modifier" && e.kind === "mom-food" && e.value === 1)).toBe(true);
    // Першим із холодильника — судочок (§6.4).
    walkTo(save, "fridge");
    interact(save);
    expect(save.current.character.held).toEqual({ kind: "meal", quality: "cheap", mom: true });
  });

  it("сценарій «Гостинці від мами під дверима»: пакет одразу в ящиках біля входу, «Розпакувати» — судочки в холодильнику", () => {
    const scenario = FILE_SCENARIOS["mom-porch"];
    if (!scenario) throw new Error("немає сценарію");
    const save = applyScenario(scenario);
    expect(weekdayOf(save.current.day)).toBe(5);
    expect(save.current.cats[0]?.traits).toContainEqual(expect.objectContaining({ group: "chewing", level: 2 }));
    const { events, stop } = recordEvents();
    advance(save, 0.1);
    stop();
    expect(events.some((e) => e.type === "modifier" && e.kind === "mom-food" && e.value === 0)).toBe(true);
    expect(events.some((e) => e.type === "doorbell")).toBe(false);
    expect(inBoxes(save)).toBe(2);
    expect(inFridge(save)).toBe(0);
    save.current.cats = [];
    walkTo(save, "boxes");
    interact(save);
    expect(inFridge(save)).toBe(2);
    expect(inBoxes(save)).toBe(0);
  });
});
