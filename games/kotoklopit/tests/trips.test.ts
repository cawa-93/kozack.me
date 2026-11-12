// Поїздки (§8.5, §8.6): вирушити, гонка, аварія з перемотуванням, події на місці, штраф у робочий час.

import { describe, expect, it } from "vitest";

import { seatCat } from "../src/sim/carriers";
import { createCat } from "../src/sim/cat";
import { nightlyCare } from "../src/sim/care";
import { ACCIDENT, BATH, DOCTOR_TREAT, GIFTS, GROOMER, MINUTES_PER_DAY, MODIFIERS, RACE, START_CLOTHES, STERILIZATION, TOTAL_DAYS, TRIP_IDLE_MINUTES, TRIPS, VET } from "../src/sim/config";
import {
  adopt,
  breederCats,
  buyAtShop,
  buyFromBreeder,
  enterShow,
  groom,
  groomerWashes,
  knownSterilizeBlocker,
  officeMeeting,
  shelterCats,
  shopPrice,
  sterilizeMinutes,
  sterilizePrice,
  tripCat,
  vetExam,
  vetSterilize,
  vetTreat,
} from "../src/sim/destinations";
import { fallIll, hasDisease } from "../src/sim/diseases";
import { payUtilities } from "../src/sim/economy";
import { MIXED } from "../src/sim/breeds";
import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { advance, deserialize, drive, goHome, goToSleep, newGame, replayDay, replayWeek, returnHome, rewindAccident, serialize } from "../src/sim/game";
import { doctorTreat, fallIllPerson, isIll } from "../src/sim/illness";
import { answerCall } from "../src/sim/modifiers";
import type { GameEvent } from "../src/sim/events";
import { addCat } from "../src/sim/night";
import { NO_RACE_INPUT } from "../src/sim/race";
import { createRng } from "../src/sim/rng";
import { accidentBedtime, accidentCost, accidentHome, canLeave, crashSpeedFactor, HOME_DOOR, startTrip, tripBlocker } from "../src/sim/trips";
import type { Cat, Difficulty, GameState, Save, TraitLevel } from "../src/sim/types";
import { ACCIDENT_TEXTS, accidentLines, fill, GROOMED, VET_MANNER } from "../src/texts";
import { driveSafely, hours, liveDay, recordEvents, standAt, withCatCorner } from "./helpers";

function game(minute = 19 * 60): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 6 }));
  save.current.modifiers.day = null;
  save.current.minute = minute;
  save.current.character.money = 1000;
  standAt(save, "door");
  return save;
}

/**
 * Аварія на цій швидкості (§8.5): машина просто попереду, і наступний крок гонки в неї врізається. За крок персонаж проїжджає
 * `швидкість × RACE.step`, тож машина трохи далі — щоб на ×10 він у неї врізався, а не проскочив. Години й ремонт аварії
 * залежать від швидкості (рішення автора 2026-11-02): за крок без газу вона падає лише на 0,0025.
 */
function crashAt(save: Save, speed = 0): void {
  const race = save.current.trip?.race;
  if (!race) throw new Error("немає поїздки");
  race.speed = speed;
  race.cars.push({ lane: Math.round(race.lane), start: race.done - RACE.carSpeed * race.minutes + 0.1 + speed * RACE.step });
  drive(save, RACE.step, NO_RACE_INPUT);
  expect(save.current.trip?.phase).toBe("accident");
}

function withCat(save: Save): Cat {
  const cat = createCat(save.current, createRng(5), { source: "shelter", ageWeeks: 3, at: { x: 5.5, y: 8.5 } });
  cat.traits = [];
  cat.arrivedDay = -10;
  addCat(save.current, cat);
  return cat;
}

describe("вирушити (§8.5)", () => {
  it("від дверей, коли під ними нічого не чекає", () => {
    const save = game();
    expect(canLeave(save.current)).toBe(true);
    save.current.home.porch.push({ id: 900, product: "food", quality: "cheap", at: 0 });
    expect(canLeave(save.current)).toBe(false);
  });

  it("до ветеринара можна й без кота, а з котом на руках — куди завгодно й без переноски", () => {
    const save = game();
    const cat = withCat(save);
    expect(tripBlocker(save.current, "vet")).toBeNull();
    save.current.character.held = { kind: "cat", cat: cat.id };
    expect(tripBlocker(save.current, "vet")).toBeNull();
    expect(tripBlocker(save.current, "shop")).toBeNull();
    expect(startTrip(save.current, "vet")).toBe(true);
    expect(cat.away).toBe("trip");
    expect(save.current.trip?.riders).toEqual([{ cat: cat.id, place: "hands" }]);
    expect(save.current.character.held).toBeNull();
  });
});

describe("гонка (§8.5)", () => {
  it("повільніше за інші машини їх не наздогнати, але дорога довша вдвічі й більше", () => {
    const save = game(10 * 60);
    save.current.day = 5; // субота: без штрафу роботи
    startTrip(save.current, "shop");
    const from = save.current.minute;
    driveSafely(save);
    expect(save.current.trip?.phase).toBe("visit");
    expect(save.current.minute - from).toBeGreaterThan(TRIPS.shop.road * 2 - 3);
  });

  it("«Затори» подовжують дорогу (×1,3), «Порожні дороги» скорочують (×0,8): і гонку туди, і повернення без гонки (рішення автора 2026-10-29, А14)", () => {
    const trip = (modifier: string | null): { race: number; back: number } => {
      const save = game(10 * 60);
      save.current.day = 5; // субота: без штрафу роботи
      save.current.modifiers.day = modifier;
      startTrip(save.current, "shop");
      const race = save.current.trip?.race.road ?? -1;
      driveSafely(save);
      expect(save.current.trip?.phase).toBe("visit");
      const from = save.current.minute;
      goHome(save);
      expect(save.current.trip).toBeNull();
      return { race, back: save.current.minute - from - TRIPS.shop.visit };
    };
    expect(trip(null)).toEqual({ race: TRIPS.shop.road, back: TRIPS.shop.road });
    const jam = Math.round(TRIPS.shop.road * MODIFIERS.road.traffic!);
    expect(jam).toBeGreaterThan(TRIPS.shop.road);
    expect(trip("traffic").race).toBe(jam);
    expect(trip("traffic").back).toBeCloseTo(jam);
    const empty = Math.round(TRIPS.shop.road * MODIFIERS.road["empty-roads"]!);
    expect(empty).toBeLessThan(TRIPS.shop.road);
    expect(trip("empty-roads").race).toBe(empty);
    expect(trip("empty-roads").back).toBeCloseTo(empty);
  });

  it("аварія: втрати не більше 3; на ×6 опівдні 20 годин доходять до сну — решта дня минає, персонаж засинає вдома", () => {
    const save = game(12 * 60);
    save.current.day = 5;
    startTrip(save.current, "shop");
    crashAt(save, 6);
    expect(save.current.trip?.losses.length).toBeLessThanOrEqual(3);
    const night = rewindAccident(save);
    expect(night).not.toBeNull();
    expect(save.current.trip).toBeNull();
    expect(night?.sleptHours).toBeCloseTo(8, 0);
  });

  it("аварія: поки день перемотується, ситість не нижче 25 і голод не забирає здоров'я — уранці є час поїсти (рішення автора 2026-10-29, А1)", () => {
    // Порожній холодильник, аварія опівдні; втрати аварії випадкові, тож показники задано вже після неї.
    const crashed = (satiety: number): Save => {
      const save = game(12 * 60);
      save.current.day = 5;
      save.current.home.supplies.food = { cheap: 0, premium: 0 };
      save.current.home.supplies.momMeal = { cheap: 0, premium: 0 };
      startTrip(save.current, "shop");
      save.current.trip?.race.cars.push({ lane: 1, start: 0.05 });
      drive(save, 0.1, NO_RACE_INPUT);
      expect(save.current.trip?.phase).toBe("accident");
      save.current.character.stats.satiety = satiety;
      save.current.character.stats.health = 10;
      save.current.character.illnesses = [];
      return save;
    };

    // Ситий: ситість спиняється на 25, здоров'я не падає; раніше вона падала до 5, а голод з'їдав здоров'я до 5.
    const fed = crashed(50);
    advance(fed, accidentBedtime(fed.current) - fed.current.minute - 1);
    expect(fed.current.character.stats.satiety).toBe(ACCIDENT.satietyFloor);
    expect(fed.current.character.stats.health).toBe(10);
    rewindAccident(fed);
    expect(fed.current.end).toBeNull();
    expect(fed.current.trip).toBeNull();
    // Уночі все як завжди: уранці персонаж голодний, але не виснажений.
    expect(fed.current.character.stats.satiety).toBeGreaterThanOrEqual(12);
    expect(fed.current.character.stats.satiety).toBeLessThan(ACCIDENT.satietyFloor);
    advance(fed, hours(2));
    expect(fed.current.end).toBeNull();

    // Ситість нижче 25 ще до аварії: далі не падає, а голод здоров'я не забирає.
    const hungry = crashed(15);
    advance(hungry, accidentBedtime(hungry.current) - hungry.current.minute - 1);
    expect(hungry.current.character.stats.satiety).toBe(15);
    expect(hungry.current.character.stats.health).toBe(10);
  });

  it("аварія: час перемотування до сну не рахується в статистику фіналу, гонка — за пунктом призначення (загальна ревізія 2026-10-29)", () => {
    const save = game(8 * 60 + 30);
    save.current.day = 1;
    save.current.modifiers.day = "office";
    const before = { ...save.current.stats.minutes };
    startTrip(save.current, "office");
    save.current.trip?.race.cars.push({ lane: 1, start: 0.05 });
    drive(save, 0.1, NO_RACE_INPUT);
    expect(save.current.trip?.phase).toBe("accident");
    const raced = save.current.stats.minutes.work - before.work;
    expect(raced).toBeGreaterThan(0);
    rewindAccident(save);
    const after = save.current.stats.minutes;
    // Раніше сюди потрапляли ~13,5 години до сну жайворонка.
    expect(after.work - before.work).toBeCloseTo(raced);
    expect(after.cats).toBe(before.cats);
    expect(after.self).toBe(before.self);
    expect(after.bustle).toBe(before.bustle);
  });

  it("аварія: ремонт, коли грошей менше 60, — усе, що було, і поїздка пам'ятає скільки (перевірка поїздок 2026-10-28)", () => {
    for (let seed = 1; seed < 40; seed++) {
      const save = game(12 * 60);
      save.current.day = 5;
      save.current.character.money = 25;
      startTrip(save.current, "shop");
      const trip = save.current.trip;
      if (!trip) throw new Error("немає поїздки");
      save.current.rng.behavior = seed;
      trip.race.cars.push({ lane: 1, start: 0.05 });
      drive(save, 0.1, NO_RACE_INPUT);
      if (!trip.losses.includes("repair")) continue;
      expect(trip.repaired).toBe(25);
      expect(save.current.character.money).toBe(0);
      return;
    }
    throw new Error("ремонт не випав");
  });

  it("поїздка в робочий час — штраф до репутації, а терпіння не падає", () => {
    const save = game(11 * 60);
    save.current.day = 1;
    const reputation = save.current.job.reputation;
    const patience = save.current.job.patience;
    startTrip(save.current, "shop");
    driveSafely(save);
    expect(save.current.job.patience).toBe(patience);
    expect(save.current.job.reputation).toBeLessThan(reputation);
  });
});

describe("знімки після аварії (§6.1, §8.5; рішення автора 2026-10-29, А1)", () => {
  /**
   * Прожити день найпростішим гравцем; він не пере, не пилососить і котів не доглядає, тож чистий одяг, здоровий глузд і чиста від
   * пилу підлога — щоранку, інакше гігієна чи здоровий глузд закінчує гру. Раніше на другому тижні гру тут рятувало примусове
   * кошеня (§4, здоровий глузд нижче 35), і то лише тому, що жмути шерсті лежали на очах (поява жмутів біля котів, §8.7 [Змінено
   * пізніше], 2026-11-03, це змінила); пил на підлозі після «Будівельного пилу» (§4.1) дратував би його весь день.
   */
  const live = (save: Save): void => {
    save.current.home.clothes = START_CLOTHES;
    save.current.character.stats.sanity = 100;
    save.current.home.dust = [];
    // Рахунок за комунальні — одразу (§6.4): несплачений до нового виселяє, а тут перевіряють лише знімки.
    payUtilities(save.current);
    liveDay(save);
  };

  /**
   * З ранку поточного дня о 12:00 потрапити в аварію на ×10 (20 годин — до сну, рішення автора 2026-11-02) й перемотати день;
   * повертає ранок дня аварії.
   */
  const crash = (save: Save): GameState => {
    const morning = structuredClone(save.current);
    const day = save.current.day;
    // До полудня без їжі й душу: ранок після аварії голодний (§8.5), а тут перевіряють лише знімки.
    const stats = save.current.character.stats;
    stats.satiety = Math.max(stats.satiety, 60);
    stats.hygiene = Math.max(stats.hygiene, 60);
    advance(save, 12 * 60 - save.current.minute);
    standAt(save, "door");
    expect(startTrip(save.current, "shop")).toBe(true);
    crashAt(save, RACE.maxSpeed);
    rewindAccident(save);
    expect(save.current.end).toBeNull();
    expect(save.current.day).toBe(day + 1);
    return morning;
  };

  /** Прожити дні до `day`, о 12:00 цього дня потрапити в аварію й перемотати день; повертає й ранок дня аварії. */
  const crashOn = (day: number): { save: Save; morning: GameState } => {
    const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 6 }));
    while (save.current.day < day) live(save);
    return { save, morning: crash(save) };
  };

  it("аварія в неділю: «Переграти день» — ранок неділі, «Переграти тиждень» — понеділок того тижня; раніше обидва знімки ставали понеділком після аварії", () => {
    const { save, morning } = crashOn(6);
    expect(save.dayStart.day).toBe(6);
    expect(save.weekStart.day).toBe(0);
    replayDay(save);
    expect(save.current.day).toBe(6);
    expect(save.current.minute).toBe(morning.minute);
    expect(save.current.character).toEqual(morning.character);
    replayWeek(save);
    expect(save.current.day).toBe(0);
  });

  it("аварія в будень: «Переграти день» — ранок дня аварії", () => {
    const { save, morning } = crashOn(2);
    expect(save.dayStart.day).toBe(2);
    replayDay(save);
    expect(save.current.day).toBe(2);
    expect(save.current.minute).toBe(morning.minute);
    expect(save.current.character).toEqual(morning.character);
  });

  it("наступна звичайна ніч оновлює знімки: день — щоранку, тиждень — у ніч на понеділок", () => {
    const weekday = crashOn(2).save;
    live(weekday);
    expect(weekday.dayStart.day).toBe(4);
    expect(weekday.weekStart.day).toBe(0);
    expect(weekday.morning).toBeNull();

    const sunday = crashOn(6).save;
    while (sunday.current.day < 14) live(sunday);
    expect(sunday.weekStart.day).toBe(14);
    expect(sunday.dayStart.day).toBe(14);
  });

  it("після аварії в неділю перша звичайна ніч робить знімком тижня понеділок після аварії: «Переграти тиждень» — з понеділка тижня, на якому гра закінчилась (рецензія реалізації А1)", () => {
    const { save } = crashOn(6);
    const monday = structuredClone(save.current);
    live(save);
    expect(save.dayStart.day).toBe(8);
    // Раніше знімок тижня лишався днем 0 до ночі на 14-й день: «Переграти тиждень» відкидав на тиждень назад.
    expect(save.weekStart.day).toBe(7);
    replayWeek(save);
    expect(save.current.day).toBe(7);
    expect(save.current.minute).toBe(monday.minute);
    expect(save.current.character).toEqual(monday.character);
  });

  it("аварії кілька днів поспіль: «Переграти день» — ранок дня останньої аварії, а не першої (рецензія реалізації А1)", () => {
    const { save } = crashOn(2);
    crash(save);
    const morning = crash(save);
    expect(save.current.day).toBe(5);
    // Раніше знімок дня «застрягав» на дні 2.
    expect(save.dayStart.day).toBe(4);
    expect(save.weekStart.day).toBe(0);
    // Ранок дня після аварії переживає й збереження.
    const loaded = deserialize(serialize(save));
    expect(loaded.morning?.day).toBe(5);
    replayDay(loaded);
    expect(loaded.current.day).toBe(4);
    expect(loaded.current.minute).toBe(morning.minute);
    expect(loaded.current.character).toEqual(morning.character);
    expect(loaded.morning).toBeNull();
  });

  it("аварії в неділю і в понеділок після неї: обидва знімки — понеділок після першої аварії (рецензія реалізації А1)", () => {
    const { save } = crashOn(6);
    const monday = crash(save);
    expect(save.dayStart.day).toBe(7);
    expect(save.weekStart.day).toBe(7);
    replayWeek(save);
    expect(save.current.day).toBe(7);
    expect(save.current.character).toEqual(monday.character);
  });

  it("аварії в неділю два тижні поспіль: «Переграти тиждень» — понеділок тижня останньої аварії (рецензія реалізації А1)", () => {
    const { save } = crashOn(6);
    while (save.current.day < 13) live(save);
    crash(save);
    expect(save.dayStart.day).toBe(13);
    // Раніше знімок тижня «застрягав» на дні 0: понеділка 7-го дня гра не запам'ятала.
    expect(save.weekStart.day).toBe(7);
    replayWeek(save);
    expect(save.current.day).toBe(7);
  });

  describe("аварія, після якої день триває (рішення автора 2026-11-02): знімків не змінює, а ніч після неї — звичайна", () => {
    /** Прожити дні до `day`, о 9:00 цього дня потрапити в аварію на ×1 (7,5 години — додому о 16:30); повертає ранок дня аварії. */
    const crashMorning = (day: number): { save: Save; morning: GameState } => {
      const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 6 }));
      while (save.current.day < day) live(save);
      const morning = structuredClone(save.current);
      advance(save, 9 * 60 - save.current.minute);
      standAt(save, "door");
      expect(startTrip(save.current, "shop")).toBe(true);
      crashAt(save, 1);
      expect(rewindAccident(save)).toBeNull();
      expect(save.current.trip).toBeNull();
      expect(save.current.day).toBe(day);
      return { save, morning };
    };
    /** Решту дня — до часу сну, а тоді лягти: звичайна ніч. */
    const finishDay = (save: Save): void => {
      save.current.home.clothes = START_CLOTHES;
      const stats = save.current.character.stats;
      stats.satiety = Math.max(stats.satiety, 60);
      stats.hygiene = Math.max(stats.hygiene, 60);
      advance(save, accidentBedtime(save.current) - save.current.minute);
      goToSleep(save);
    };

    it("у будень: «Переграти день» — ранок цього ж дня; наступна ніч робить знімком новий ранок", () => {
      const { save, morning } = crashMorning(2);
      expect(save.dayStart.day).toBe(2);
      expect(save.morning).toBeNull();
      finishDay(save);
      expect(save.current.day).toBe(3);
      expect(save.dayStart.day).toBe(3);
      expect(save.weekStart.day).toBe(0);
      expect(save.morning).toBeNull();

      const again = crashMorning(2);
      replayDay(again.save);
      expect(again.save.current.day).toBe(2);
      expect(again.save.current.minute).toBe(morning.minute);
      expect(again.save.current.character).toEqual(morning.character);
    });

    it("у неділю: ніч на понеділок, як завжди, робить знімком тижня понеділок", () => {
      const { save } = crashMorning(6);
      finishDay(save);
      expect(save.current.day).toBe(7);
      expect(save.dayStart.day).toBe(7);
      expect(save.weekStart.day).toBe(7);
      replayWeek(save);
      expect(save.current.day).toBe(7);
    });
  });
});

describe("аварія забирає години, а не день (§8.5, §5.2; рішення автора 2026-11-02)", () => {
  /** Субота (без роботи) о цій хвилині, без модифікатора дня й з грошима, персонаж біля дверей. */
  function saturday(minute: number, difficulty: Difficulty = "normal"): Save {
    const save = withCatCorner(newGame({ address: "she", difficulty, seed: 6 }));
    save.current.modifiers.day = null;
    save.current.day = 5;
    save.current.minute = minute;
    save.current.character.money = 1000;
    standAt(save, "door");
    return save;
  }

  /** О цій хвилині суботи вирушити в магазин і потрапити в аварію на цій швидкості. */
  function crashed(minute: number, speed: number, difficulty: Difficulty = "normal"): Save {
    const save = saturday(minute, difficulty);
    expect(startTrip(save.current, "shop")).toBe(true);
    crashAt(save, speed);
    return save;
  }

  it("години й ремонт: 10 год і 60 ₴ × складність (×0,8 / ×1 / ×1,25) × швидкість (0,5 + швидкість / 4, не більше 2)", () => {
    expect([0, 1, 2, 4, 6, 10].map((speed) => crashSpeedFactor(speed))).toEqual([0.5, 0.75, 1, 1.5, 2, 2]);
    const cost = (difficulty: Difficulty, speed: number): [number, number] => {
      const { minutes, repair } = accidentCost(difficulty, speed);
      return [minutes / 60, repair];
    };
    // Середня (§8.5): ×1 — 7,5 години й 68 ₴, ×2 — 10 і 90, ×4 — 15 і 135, від ×6 — 20 і 180.
    expect([1, 2, 4, 6, 10].map((speed) => cost("normal", speed))).toEqual([
      [7.5, 68],
      [10, 90],
      [15, 135],
      [20, 180],
      [20, 180],
    ]);
    // §5.2: на ×2 — 8 годин і 72 ₴ на легкій, 12,5 і 113 — на важкій.
    expect(cost("easy", 2)).toEqual([8, 72]);
    expect(cost("hard", 2)).toEqual([12.5, 113]);
    expect(cost("hard", 10)).toEqual([25, 225]);
    // Години — цілими чвертями години: на важкій ×1 — 9 год 22,5 хв, тобто 9 год 30 хв; ремонт — до гривні (84,375 — 84).
    expect(cost("hard", 1)).toEqual([9.5, 84]);
    expect(accidentCost("normal", 3.37).minutes % ACCIDENT.roundMinutes).toBe(0);
  });

  it("поїздка пам'ятає швидкість у мить аварії, години й ціну ремонту — і після перезавантаження сторінки посеред аварії", () => {
    const save = crashed(9 * 60, 3);
    const accident = save.current.trip?.accident;
    expect(accident?.speed).toBeCloseTo(3, 2);
    expect(accident?.minutes).toBe(12.5 * 60);
    expect(accident?.repair).toBe(112);
    const home = accidentHome(save.current);
    expect(home).toBeCloseTo(save.current.minute + 12.5 * 60);
    const loaded = deserialize(serialize(save));
    expect(loaded.current.trip?.phase).toBe("accident");
    expect(loaded.current.trip?.accident).toEqual(accident);
    expect(accidentHome(loaded.current)).toBe(home);
    rewindAccident(loaded);
    expect(loaded.current.trip).toBeNull();
    expect(loaded.current.minute).toBeCloseTo(home ?? -1);
  });

  it("ремонт — за швидкістю: на ×6 — 120 ₴, а коли грошей менше — усе, що було; картка каже скільки", () => {
    for (const money of [1000, 100]) {
      let found = false;
      for (let seed = 1; seed < 40 && !found; seed++) {
        const save = saturday(9 * 60);
        save.current.character.money = money;
        save.current.rng.behavior = seed;
        startTrip(save.current, "shop");
        crashAt(save, 6);
        const trip = save.current.trip;
        if (!trip?.losses.includes("repair")) continue;
        found = true;
        expect(trip.repaired).toBe(Math.min(money, 180));
        expect(save.current.character.money).toBe(money - Math.min(money, 180));
        const line = money >= 180 ? fill(ACCIDENT_TEXTS.repair, "she", { сума: 180 }) : fill(ACCIDENT_TEXTS.repairAll, "she", { сума: money });
        expect(accidentLines(save.current)).toContain(line);
      }
      expect(found, `ремонт не випав (${money} ₴)`).toBe(true);
    }
  });

  it("аварія вранці: години минають без персонажа, а тоді він удома біля дверей, як після поїздки, і день триває; показники не нижче порогів", () => {
    const save = saturday(9 * 60);
    const cat = withCat(save);
    save.current.home.carriers = [{ quality: "cheap", wear: 0 }];
    save.current.character.held = { kind: "cat", cat: cat.id };
    expect(startTrip(save.current, "vet")).toBe(true);
    crashAt(save, 1);
    // Ситість нижче 25 ще до аварії, гігієна й здоров'я — на межі (втрати аварії випадкові, тож показники — уже після неї).
    const stats = save.current.character.stats;
    Object.assign(stats, { satiety: 20, hygiene: 6, health: 30, sanity: 6 });
    save.current.character.illnesses = [];
    const minutes = { ...save.current.stats.minutes };
    const from = save.current.minute;
    const { events, stop } = recordEvents();
    const night = rewindAccident(save);
    stop();
    expect(night).toBeNull();
    expect(save.current.end).toBeNull();
    expect(save.current.trip).toBeNull();
    expect(save.current.day).toBe(5);
    expect(save.current.minute).toBeCloseTo(from + 7.5 * 60);
    // Удома біля дверей, кіт із переноски — поруч, як після звичайної поїздки (`returnHome`).
    expect(save.current.character.body).toMatchObject({ x: HOME_DOOR.x, y: HOME_DOOR.y });
    expect(cat.away).toBeNull();
    expect(events).toContainEqual(expect.objectContaining({ type: "trip-ended", destination: "vet" }));
    expect(events).not.toContainEqual(expect.objectContaining({ type: "night" }));
    // Перемотування — як і раніше (§8.5, А1): ситість не падає нижче, ніж була, голод не забирає здоров'я, решта — не нижче 5.
    expect(stats.satiety).toBe(20);
    expect(stats.health).toBe(30);
    expect(stats.hygiene).toBeGreaterThanOrEqual(ACCIDENT.floor);
    expect(stats.sanity).toBeGreaterThanOrEqual(ACCIDENT.floor);
    // Час перемотування в статистику фіналу не рахується (§4.2).
    expect(save.current.stats.minutes).toEqual(minutes);
    // Далі — звичайний день: голод знову забирає здоров'я.
    advance(save, 60);
    expect(stats.health).toBeLessThan(30);
  });

  it("аварія ввечері: години доходять до оптимального часу сну — ніч, як раніше: персонаж спить 8 годин, а ніч знімків не оновлює", () => {
    const save = crashed(19 * 60, 1);
    expect(accidentHome(save.current)).toBeNull();
    const dayStart = save.dayStart.day;
    const night = rewindAccident(save);
    expect(night?.sleptHours).toBeCloseTo(8, 0);
    expect(save.current.trip).toBeNull();
    expect(save.current.day).toBe(6);
    expect(save.dayStart.day).toBe(dayStart);
    expect(save.morning?.day).toBe(6);
  });

  it("межа — оптимальний час сну: години, що закінчуються рівно в нього, — уже ніч; на хвилину раніше — день триває", () => {
    const save = crashed(9 * 60, 1);
    const state = save.current;
    state.minute = accidentBedtime(state) - 7.5 * 60;
    expect(accidentHome(state)).toBeNull();
    state.minute -= 1;
    expect(accidentHome(state)).toBe(accidentBedtime(state) - 1);
  });

  it("складність: та сама аварія на ×1 о 8:00 — додому о 14:00 на легкій, о 15:30 на середній і о 17:30 на важкій", () => {
    const home = (difficulty: Difficulty): number => {
      // Трохи понад ×1: за крок гонки без газу швидкість падає, а 9 год 22,5 хв важкої — якраз між чвертями години.
      const save = crashed(8 * 60, 1.01, difficulty);
      const from = save.current.minute;
      rewindAccident(save);
      expect(save.current.trip).toBeNull();
      return Math.round(save.current.minute - from);
    };
    expect([home("easy"), home("normal"), home("hard")]).toEqual([6 * 60, 7.5 * 60, 9.5 * 60]);
  });

  it("«Затори» й «Порожні дороги» змінюють дорогу, а не години аварії", () => {
    for (const modifier of ["traffic", "empty-roads"]) {
      const save = saturday(9 * 60);
      save.current.modifiers.day = modifier;
      startTrip(save.current, "shop");
      crashAt(save, 2);
      expect(save.current.trip?.accident?.minutes, modifier).toBe(10 * 60);
    }
  });

  it("шкарпетку шукали перед виїздом — ці 10 хвилин минають і після аварії, як після поїздки", () => {
    const save = saturday(9 * 60);
    save.current.home.sock = true;
    startTrip(save.current, "shop");
    expect(save.current.trip?.search).toBe(GIFTS.sockSearch);
    crashAt(save, 1);
    const from = save.current.minute;
    rewindAccident(save);
    expect(save.current.minute).toBeCloseTo(from + 7.5 * 60 + GIFTS.sockSearch);
  });

  it("картку закрили двічі — вдруге нічого не перемотується", () => {
    const save = crashed(9 * 60, 1);
    rewindAccident(save);
    const after = structuredClone(save.current);
    expect(rewindAccident(save)).toBeNull();
    expect(save.current).toEqual(after);
  });

  it("дзвінок мами під час перемотування чекає відповіді, а персонаж уже вдома й може відповісти", () => {
    const save = saturday(9 * 60);
    save.current.today.callAt = 12 * 60;
    startTrip(save.current, "shop");
    crashAt(save, 1);
    const { events, stop } = recordEvents();
    rewindAccident(save);
    stop();
    expect(events).toContainEqual(expect.objectContaining({ type: "modifier", kind: "mom-call" }));
    expect(save.current.trip).toBeNull();
    expect(save.current.today.callPending).toBe(true);
    expect(answerCall(save.current)).toBe(true);
  });

  it("мама з гостинцями: прийшла, поки перемотувався день, — подзвонить, щойно персонаж удома, а після 20:00 лишить пакет, як після поїздки", () => {
    const visit = (minute: number, speed: number): GameEvent[] => {
      const save = saturday(minute);
      save.current.modifiers.day = "mom-food";
      save.current.today.mom = { at: minute + 60 };
      startTrip(save.current, "shop");
      crashAt(save, speed);
      const { events, stop } = recordEvents();
      rewindAccident(save);
      expect(save.current.trip).toBeNull();
      advance(save, 15);
      stop();
      return events;
    };
    // О 9:00 на ×1 — удома о 16:30: мама дзвонить і заходить.
    expect(visit(9 * 60, 1)).toContainEqual(expect.objectContaining({ type: "modifier", kind: "mom-food", value: 1 }));
    // Об 11:00 на ×2 — удома о 21:00: мама вже пішла, пакет у ящиках біля входу.
    expect(visit(11 * 60, 2)).toContainEqual(expect.objectContaining({ type: "modifier", kind: "mom-food", value: 0 }));
  });

  it("останній день гри: аварія ввечері — ніч і пенсія, як і раніше; аварія вранці — день триває", () => {
    const evening = crashed(19 * 60, 1);
    evening.current.day = TOTAL_DAYS - 1;
    rewindAccident(evening);
    expect(evening.current.end).toBe("retirement");

    const morning = crashed(9 * 60, 1);
    morning.current.day = TOTAL_DAYS - 1;
    rewindAccident(morning);
    expect(morning.current.end).toBeNull();
    expect(morning.current.trip).toBeNull();
  });

  it("гра не закінчується під час перемотування, хоч би всі показники були на межі", () => {
    const save = crashed(9 * 60, 1);
    Object.assign(save.current.character.stats, { satiety: 6, hygiene: 6, health: 6, sanity: 6 });
    rewindAccident(save);
    expect(save.current.end).toBeNull();
    expect(save.current.trip).toBeNull();
    for (const value of Object.values(save.current.character.stats)) expect(value).toBeGreaterThanOrEqual(ACCIDENT.floor);
  });

  describe("картка аварії (TEXTS.md, «Аварія»)", () => {
    const lines = (save: Save): string[] => {
      const trip = save.current.trip;
      if (trip) trip.losses = [];
      const result = accidentLines(save.current);
      for (const line of result) expect(line).not.toMatch(/[{}[\]|]/);
      return result;
    };
    const hm = (text: string): string => text.replace(/ /g, "\u00a0");

    it("день триває: скільки забрали документи й ремонт і о котрій персонаж удома", () => {
      expect(lines(crashed(9 * 60, 1))).toEqual([fill(ACCIDENT_TEXTS.day, "she", { тривалість: hm("7 год 30 хв"), час: "о 16:30" }), ACCIDENT_TEXTS.none]);
      // Перед одинадцятою — «об».
      expect(lines(crashed(6 * 60, 0))[0]).toBe(fill(ACCIDENT_TEXTS.day, "she", { тривалість: hm("5 год"), час: "об 11:00" }));
    });

    it("години дійшли до часу сну — решта дня до нього й ніч; аварія вже після часу сну — лише ніч", () => {
      expect(lines(crashed(19 * 60, 1))[0]).toBe(fill(ACCIDENT_TEXTS.night, "she", { тривалість: hm("3 год") }));
      expect(lines(crashed(22 * 60 + 30, 1))[0]).toBe(ACCIDENT_TEXTS.late);
    });

    it("кіт у переносці: удень — «усі ці години», уночі — «до ночі»", () => {
      const withCarrier = (minute: number): string[] => {
        const save = saturday(minute);
        const cat = withCat(save);
        cat.name = "Мурка";
        cat.sex = "female";
        save.current.home.carriers = [{ quality: "cheap", wear: 0 }];
        save.current.character.held = { kind: "cat", cat: cat.id };
        seatCat(save.current, cat);
        expect(startTrip(save.current, "vet")).toBe(true);
        crashAt(save, 1);
        return lines(save);
      };
      expect(withCarrier(9 * 60)).toContain(fill(ACCIDENT_TEXTS.carrierDay, "female", { кіт: "Мурка" }));
      expect(withCarrier(19 * 60)).toContain(fill(ACCIDENT_TEXTS.carrierNight, "female", { кіт: "Мурка" }));
      expect(fill(ACCIDENT_TEXTS.carrierDay, "male", { кіт: "Барсик" })).toBe("Барсик усі ці години просидів у переносці.");
    });
  });
});

describe("поїздки й робота (§8.6)", () => {
  it("поїздка, що почалася до 09:00, теж зараховується поїздкою в робочий час", () => {
    const save = game(8 * 60 + 50);
    save.current.day = 1;
    expect(startTrip(save.current, "shop")).toBe(true);
    expect(save.current.job.tripDays).toEqual([]);
    driveSafely(save);
    expect(save.current.job.tripDays).toEqual([1]);
  });

  it("на зборах в офісі летючку не пропущено", () => {
    const save = game(8 * 60 + 50);
    save.current.day = 1;
    save.current.modifiers.day = "office";
    const { events, stop } = recordEvents();
    expect(startTrip(save.current, "office")).toBe(true);
    driveSafely(save);
    advance(save, 60);
    stop();
    expect(events).toContainEqual(expect.objectContaining({ type: "standup", attended: true }));
    expect(save.current.job.tripDays).toEqual([]);
  });

  it("збори в офісі зараховуються раз, і журнал візиту зберігається з грою (перевірка циклу гри 2026-10-27)", () => {
    const save = game(8 * 60 + 50);
    save.current.day = 1;
    save.current.modifiers.day = "office";
    expect(startTrip(save.current, "office")).toBe(true);
    driveSafely(save);
    officeMeeting(save.current);
    const money = save.current.character.money;
    const reputation = save.current.job.reputation;
    // Сторінку перезавантажили посеред зборів — сцена кличе їх знову.
    officeMeeting(save.current);
    expect(save.current.character.money).toBe(money);
    expect(save.current.job.reputation).toBe(reputation);
    const trip = save.current.trip;
    if (!trip) throw new Error("немає поїздки");
    trip.log = { exam: { health: 90, mood: 70, weight: 50, manner: null }, done: ["office"] };
    expect(deserialize(serialize(save)).current.trip?.log).toEqual(trip.log);
  });

  it("після зборів офіс більше не пропонується: друга поїздка забрала б години й нічого не дала (перевірка циклу гри 2026-10-27)", () => {
    const save = game(8 * 60 + 50);
    save.current.day = 1;
    save.current.modifiers.day = "office";
    expect(tripBlocker(save.current, "office")).toBeNull();
    save.current.today.officeDone = true;
    expect(tripBlocker(save.current, "office")).toBe("office");
    expect(startTrip(save.current, "office")).toBe(false);
  });

  it("збори: виїхав до 18:00 — у дорозі штрафу немає; аварія дорогою — летючку не зараховано, а збори пропущено (перевірка поїздок 2026-10-28)", () => {
    const save = game(17 * 60 + 30);
    save.current.day = 1;
    save.current.modifiers.day = "office";
    const late = recordEvents();
    expect(startTrip(save.current, "office")).toBe(true);
    driveSafely(save);
    late.stop();
    expect(save.current.minute).toBeGreaterThan(18 * 60);
    expect(late.events).not.toContainEqual(expect.objectContaining({ type: "modifier", kind: "office-missed" }));

    // Аварія на ×2 о 9:30 забирає 10 годин (рішення автора 2026-11-02): персонаж удома о 19:30, і день триває.
    const crashed = game(9 * 60 + 30);
    crashed.current.day = 1;
    crashed.current.modifiers.day = "office";
    startTrip(crashed.current, "office");
    crashAt(crashed, 2);
    const rewind = recordEvents();
    rewindAccident(crashed);
    rewind.stop();
    expect(rewind.events).toContainEqual(expect.objectContaining({ type: "standup", attended: false }));
    expect(rewind.events).toContainEqual(expect.objectContaining({ type: "modifier", kind: "office-missed" }));
    expect(crashed.current.trip).toBeNull();
    expect(crashed.current.day).toBe(1);
    // Збори минули: удруге в офіс не поїхати.
    expect(tripBlocker(crashed.current, "office")).toBe("office");
  });

  it("після аварії решта робочого часу того дня — попереджена відсутність: терпіння не падає, «!» і «Х» немає", () => {
    // Аварія на ×0 о 08:00 забирає кілька годин: удома персонаж ще в робочий час і за комп'ютер не сідає.
    const save = game(8 * 60);
    save.current.day = 8;
    save.current.job.reputation = 50;
    expect(startTrip(save.current, "shop")).toBe(true);
    crashAt(save, 0);
    rewindAccident(save);
    expect(save.current.trip).toBeNull();
    expect(save.current.minute).toBeLessThan(17 * 60);
    const patience = save.current.job.patience;
    const reputation = save.current.job.reputation;
    const { events, stop } = recordEvents();
    advance(save, 18 * 60 - save.current.minute);
    stop();
    expect(save.current.job.patience).toBe(patience);
    expect(events).not.toContainEqual(expect.objectContaining({ type: "patience" }));
    // Штраф — як за поїздку в робочий час: менший, ніж за «Х».
    expect(save.current.job.reputation).toBeLessThan(reputation);
  });

  it("аварія дорогою в офіс — теж попереджена відсутність, як і дорогою деінде: збори цієї поїздки пропущено (§4.1)", () => {
    const reputation = (destination: "office" | "shop"): number => {
      const save = game(9 * 60 + 5);
      save.current.day = 8;
      save.current.modifiers.day = "office";
      save.current.job.reputation = 50;
      expect(startTrip(save.current, destination)).toBe(true);
      crashAt(save, 0);
      rewindAccident(save);
      return save.current.job.reputation;
    };
    // Різниця — лише крок дороги до аварії: дорога в офіс — ще робота.
    expect(reputation("office")).toBeCloseTo(reputation("shop"), 2);
  });

  it("гості й ОСББ, поки персонаж у поїздці, не заходять: сором гостей після аварії не закінчує гру (перевірка поїздок 2026-10-28)", () => {
    // Гості о 19:00, а аварія на ×2 об 11:00 забирає 10 годин (рішення автора 2026-11-02): удома персонаж о 21:00, і день триває.
    const save = game(11 * 60);
    save.current.day = 5;
    save.current.modifiers.day = "guests";
    save.current.character.stats.sanity = 12;
    for (let i = 0; i < 6; i++) save.current.home.messes.push({ id: 100 + i, kind: "vomit", x: 5.5 + i * 0.5, y: 8.5, cat: null });
    startTrip(save.current, "shop");
    crashAt(save, 2);
    const { events, stop } = recordEvents();
    rewindAccident(save);
    stop();
    expect(save.current.end).toBeNull();
    expect(save.current.trip).toBeNull();
    expect(save.current.day).toBe(5);
    expect(events).toContainEqual(expect.objectContaining({ type: "modifier", kind: "guests-away" }));
    expect(events).not.toContainEqual(expect.objectContaining({ type: "modifier", kind: "guests" }));

    const inspected = game(14 * 60 + 30);
    inspected.current.day = 2;
    inspected.current.modifiers.day = "inspection";
    inspected.current.home.messes.push({ id: 100, kind: "vomit", x: 5.5, y: 8.5, cat: null });
    const money = inspected.current.character.money;
    startTrip(inspected.current, "shop");
    driveSafely(inspected);
    expect(inspected.current.character.money).toBe(money);

    // Ветеринарка вдома теж не заходить: хвороби котів лишаються невідомими.
    const vet = game(10 * 60 + 30);
    vet.current.day = 2;
    vet.current.modifiers.day = "home-vet";
    const cat = withCat(vet);
    fallIll(vet.current, cat, "heart");
    const visit = recordEvents();
    startTrip(vet.current, "shop");
    driveSafely(vet);
    visit.stop();
    expect(cat.diseases[0]?.known).toBe(false);
    expect(visit.events).toContainEqual(expect.objectContaining({ type: "modifier", kind: "home-vet-away" }));
  });

  it("виставка — раз на день: після участі її немає в списку, і приз удруге не дають (перевірка поїздок 2026-10-28)", () => {
    const save = game(9 * 60);
    save.current.day = 6;
    save.current.modifiers.day = "show";
    const cat = withCat(save);
    save.current.home.carriers = [{ quality: "cheap", wear: 0 }];
    save.current.character.held = { kind: "cat", cat: cat.id };
    expect(startTrip(save.current, "show")).toBe(true);
    driveSafely(save);
    expect(enterShow(save.current, createRng(1))).not.toBeNull();
    expect(enterShow(save.current, createRng(1))).toBeNull();
    returnHome(save, save.current.trip?.visit ?? 0, TRIPS.show.road);
    save.current.character.held = { kind: "cat", cat: cat.id };
    standAt(save, "door");
    expect(tripBlocker(save.current, "show")).toBe("show");
  });

  it("участь у виставці — запис титрів життя: кіт, хвилина й місце; без призу — без місця (§4.2)", () => {
    // Бал — настрій / 100: безпорідний кіт без рис і без удачі.
    const entered = (mood: number, pure = false): GameState => {
      const save = game(9 * 60);
      save.current.day = 6;
      save.current.modifiers.day = "show";
      const cat = withCat(save);
      cat.breed = pure ? ["perska", "perska"] : [MIXED, MIXED];
      save.current.home.carriers = [{ quality: "cheap", wear: 0 }];
      save.current.character.held = { kind: "cat", cat: cat.id };
      expect(startTrip(save.current, "show")).toBe(true);
      driveSafely(save);
      // Настрій — уже на місці: посадка в переноску й дорога його змінюють.
      cat.mood = mood;
      expect(save.current.story ?? []).toEqual([]);
      expect(enterShow(save.current, { ...createRng(1), next: () => 0 })).not.toBeNull();
      // Друга спроба того самого дня нічого не додає.
      expect(enterShow(save.current, createRng(1))).toBeNull();
      return save.current;
    };
    const entry = (state: GameState) => ({ kind: "show", day: 6, minute: state.minute, cat: state.cats[0]?.id });
    const first = entered(100, true);
    expect(first.story).toEqual([{ ...entry(first), place: 1 }]);
    const second = entered(80);
    expect(second.story).toEqual([{ ...entry(second), place: 2 }]);
    const third = entered(60);
    expect(third.story).toEqual([{ ...entry(third), place: 3 }]);
    const none = entered(30);
    expect(none.story).toEqual([entry(none)]);
  });

  it("здоровий глузд призу виставки — з множником «Здоровий глузд від котів», а гроші — сталі (рішення автора 2026-10-29, дрібні питання)", () => {
    const prize = (difficulty: Difficulty): { sanity: number; money: number } => {
      const save = withCatCorner(newGame({ address: "she", difficulty, seed: 6 }));
      save.current.modifiers.day = "show";
      save.current.day = 6;
      save.current.minute = 9 * 60;
      save.current.character.money = 1000;
      // Захисту першого тижня вже немає (кіт удома), а глузд далеко від меж 0 і 100.
      save.current.character.stats.sanity = 50;
      standAt(save, "door");
      const cat = withCat(save);
      // Головний приз: настрій 100 і чистокровний — бал понад 1 за будь-якого випадку.
      cat.mood = 100;
      cat.breed = ["perska", "perska"];
      save.current.home.carriers = [{ quality: "cheap", wear: 0 }];
      save.current.character.held = { kind: "cat", cat: cat.id };
      expect(startTrip(save.current, "show")).toBe(true);
      driveSafely(save);
      const sanity = save.current.character.stats.sanity;
      const money = save.current.character.money;
      expect(enterShow(save.current, createRng(1))).toBe(300);
      return { sanity: save.current.character.stats.sanity - sanity, money: save.current.character.money - money };
    };
    expect(prize("normal").sanity).toBeCloseTo(10);
    expect(prize("easy").sanity).toBeCloseTo(12.5);
    expect(prize("hard").sanity).toBeCloseTo(8);
    // Гроші — сталі: 300 мінус участь 30 на будь-якій складності.
    for (const difficulty of ["easy", "normal", "hard"] as const) expect(prize(difficulty).money).toBe(270);
  });

  it("після пропущених о 18:00 зборів офісу немає в списку; на лікарняному — теж; звільнили дорогою — зборів немає (перевірка поїздок 2026-10-28)", () => {
    const missed = game(17 * 60 + 50);
    missed.current.day = 1;
    missed.current.modifiers.day = "office";
    advance(missed, 20);
    expect(missed.current.today.officeDone).toBe(true);
    expect(tripBlocker(missed.current, "office")).toBe("office");

    const sick = game(9 * 60);
    sick.current.day = 1;
    sick.current.modifiers.day = "office";
    sick.current.job.sickLeaveFrom = 1;
    sick.current.job.sickLeaveUntil = 1;
    expect(tripBlocker(sick.current, "office")).toBe("office");

    const fired = game(9 * 60);
    fired.current.day = 1;
    fired.current.modifiers.day = "office";
    expect(startTrip(fired.current, "office")).toBe(true);
    driveSafely(fired);
    fired.current.job.unemployed = true;
    const money = fired.current.character.money;
    officeMeeting(fired.current);
    expect(fired.current.character.money).toBe(money);
    expect(fired.current.trip?.visit).toBe(0);
  });

  it("офіс не пропонується з котом на руках у звичайний день і безробітному (перевірка поїздок 2026-10-28)", () => {
    const save = game(9 * 60);
    save.current.day = 1;
    const cat = withCat(save);
    save.current.character.held = { kind: "cat", cat: cat.id };
    expect(tripBlocker(save.current, "office")).toBe("office");
    save.current.character.held = null;
    save.current.modifiers.day = "office";
    save.current.job.unemployed = true;
    expect(tripBlocker(save.current, "office")).toBe("office");
  });
});

describe("пункти призначення (§8.5)", () => {
  function arrive(save: Save, destination: Parameters<typeof startTrip>[1]): void {
    expect(startTrip(save.current, destination)).toBe(true);
    driveSafely(save);
    expect(save.current.trip?.phase).toBe("visit");
  }

  it("магазин: ціна в межах вікна, наповнювач і лоток — різні товари", () => {
    const save = game(9 * 60);
    save.current.day = 5;
    arrive(save, "shop");
    const price = shopPrice(save.current, { product: "catFood" }, "cheap");
    // Середня складність: від −30% до +10% (правка 2026-10-23).
    expect(price).toBeGreaterThanOrEqual(105);
    expect(price).toBeLessThanOrEqual(165);
    buyAtShop(save.current, { product: "litter" }, "cheap");
    buyAtShop(save.current, { thing: "litter" }, "cheap");
    // Запас — у ящиках біля входу, річ — одразу на місці (§6.4).
    expect(save.current.home.boxes?.litter?.cheap).toBe(10);
    expect(save.current.home.items.filter((i) => i.kind === "litter")).toHaveLength(2);
    returnHome(save, save.current.trip?.visit ?? 0, TRIPS.shop.road);
    expect(save.current.trip).toBeNull();
    expect(save.current.character.body.x).toBeCloseTo(HOME_DOOR.x);
  });

  it("«Ветеринар»: улюбленець не ображається на огляд, «Кошмар ветеринара» — удвічі більше (§9.12)", () => {
    const loss = (level: TraitLevel | 0): number => {
      const save = game(9 * 60);
      save.current.day = 5;
      const cat = withCat(save);
      if (level !== 0) cat.traits.push({ group: "vet", level, seen: 0, known: false });
      save.current.home.carriers = [{ quality: "premium", wear: 0 }];
      save.current.character.held = { kind: "cat", cat: cat.id };
      arrive(save, "vet");
      const love = cat.love;
      vetExam(save.current);
      return love - cat.love;
    };
    expect(loss(2)).toBe(0);
    expect(loss(-2)).toBeCloseTo(loss(0) * 2);
  });

  it("ветеринар: огляд відкриває хворобу, дороге лікування її лікує", () => {
    const save = game(9 * 60);
    save.current.day = 5;
    const cat = withCat(save);
    fallIll(save.current, cat, "injury");
    save.current.home.carriers = [{ quality: "premium", wear: 0 }];
    save.current.character.held = { kind: "cat", cat: cat.id };
    arrive(save, "vet");
    expect(cat.diseases[0]?.known).toBe(false);
    expect(vetExam(save.current)).not.toBeNull();
    expect(cat.diseases[0]?.known).toBe(true);
    expect(vetTreat(save.current, "injury", "premium", createRng(1))).toBe("cured");
    expect(cat.diseases).toHaveLength(0);
    returnHome(save, save.current.trip?.visit ?? 0, TRIPS.vet.road);
    expect(cat.away).toBeNull();
  });

  it("ветеринар: хронічну дешеве лікування бере під контроль на 7 днів, дороге — на 14 (рішення автора 2026-10-27, Х8)", () => {
    const controlled = (quality: "cheap" | "premium"): number => {
      const save = game(9 * 60);
      save.current.day = 5;
      const cat = withCat(save);
      fallIll(save.current, cat, "heart");
      save.current.home.carriers = [{ quality: "premium", wear: 0 }];
      save.current.character.held = { kind: "cat", cat: cat.id };
      arrive(save, "vet");
      vetExam(save.current);
      expect(vetTreat(save.current, "heart", quality, createRng(1))).toBe("controlled");
      return (cat.diseases[0]?.controlled ?? 0) - save.current.day;
    };
    expect(controlled("cheap")).toBe(7);
    expect(controlled("premium")).toBe(14);
  });

  it("ветеринар: лікування, що не подовжить контролю, не продається — дешеве не скорочує купленого дорогим (перевірка поїздок 2026-10-28)", () => {
    const save = game(9 * 60);
    save.current.day = 5;
    const cat = withCat(save);
    fallIll(save.current, cat, "heart");
    const disease = cat.diseases[0];
    if (!disease) throw new Error("немає хвороби");
    disease.controlled = save.current.day + 10;
    save.current.home.carriers = [{ quality: "premium", wear: 0 }];
    save.current.character.held = { kind: "cat", cat: cat.id };
    arrive(save, "vet");
    vetExam(save.current);
    const money = save.current.character.money;
    const visit = save.current.trip?.visit;
    expect(vetTreat(save.current, "heart", "cheap", createRng(1))).toBeNull();
    expect(disease.controlled).toBe(save.current.day + 10);
    expect(save.current.character.money).toBe(money);
    expect(save.current.trip?.visit).toBe(visit);
    expect(vetTreat(save.current, "heart", "premium", createRng(1))).toBe("controlled");
    expect(disease.controlled).toBe(save.current.day + 14);
  });

  it("ветеринар: ожиріння бачить і каже про зайву вагу, але грошима не лікує — лише дієта й ігри (§9.12)", () => {
    const save = game(9 * 60);
    save.current.day = 5;
    const cat = withCat(save);
    cat.weight = 80;
    fallIll(save.current, cat, "obesity");
    save.current.home.carriers = [{ quality: "premium", wear: 0 }];
    save.current.character.held = { kind: "cat", cat: cat.id };
    arrive(save, "vet");
    // Дорогою зайва вага трохи йде.
    expect(vetExam(save.current)?.weight).toBeCloseTo(80, 0);
    expect(cat.diseases[0]?.known).toBe(true);
    const money = save.current.character.money;
    expect(vetTreat(save.current, "obesity", "premium", createRng(1))).toBeNull();
    expect(cat.diseases).toHaveLength(1);
    expect(save.current.character.money).toBe(money);
  });

  describe("огляд у ціні операції (§9.8; рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А3)", () => {
    /** Доросла нестерилізована кішка вже у ветеринара, огляду ще не було. */
    function femaleAtVet(): { save: Save; state: GameState; cat: Cat } {
      const save = game(9 * 60);
      save.current.day = 5;
      const cat = createCat(save.current, createRng(5), { source: "shelter", ageWeeks: 3, sex: "female", at: { x: 5.5, y: 8.5 } });
      cat.traits = [];
      cat.arrivedDay = -10;
      addCat(save.current, cat);
      save.current.home.carriers = [{ quality: "premium", wear: 0 }];
      save.current.character.held = { kind: "cat", cat: cat.id };
      arrive(save, "vet");
      return { save, state: save.current, cat };
    }

    it("без огляду — одна дія: ветеринар оглядає й оперує, разом 120; хвороби й порода — як на огляді", () => {
      const { state, cat } = femaleAtVet();
      fallIll(state, cat, "cold");
      expect(cat.diseases[0]?.known).toBe(false);
      expect(knownSterilizeBlocker(state, cat)).toBeNull();
      expect(sterilizePrice(state)).toBe(STERILIZATION.price);
      const money = state.character.money;
      expect(vetSterilize(state)).toBe(true);
      expect(cat.sterilized).toBe(true);
      expect(state.character.money).toBe(money - STERILIZATION.price);
      expect(cat.diseases[0]?.known).toBe(true);
      expect(cat.breedKnown).toEqual([true, true]);
      // Картка показує результати огляду: знімок — у журналі поїздки.
      expect(state.trip?.log?.exam).toBeTruthy();
      expect(state.trip?.visit).toBe(TRIPS.vet.visit + STERILIZATION.minutes);
    });

    it("прихована вагітність: картка її не розкриває, а натискання — лише огляд за 40, без операції", () => {
      const { state, cat } = femaleAtVet();
      cat.pregnancy = { father: null, due: state.day + 3, known: false };
      expect(knownSterilizeBlocker(state, cat)).toBeNull();
      const money = state.character.money;
      expect(vetSterilize(state)).toBe(false);
      expect(cat.sterilized).toBe(false);
      expect(cat.pregnancy?.known).toBe(true);
      expect(state.character.money).toBe(money - VET.exam);
      expect(knownSterilizeBlocker(state, cat)).toBe("pregnant");
      expect(state.trip?.log?.exam).toBeTruthy();
      expect(state.trip?.visit).toBe(TRIPS.vet.visit);
      // Друге натискання вже нічого не коштує.
      expect(vetSterilize(state)).toBe(false);
      expect(state.character.money).toBe(money - VET.exam);
    });

    it("час операції в підписі — увесь час, що мине на місці: до огляду — з годиною огляду, після окремого огляду — без неї (рецензія реалізації А6)", () => {
      const first = femaleAtVet().state;
      const before = sterilizeMinutes(first);
      expect(before).toBe(STERILIZATION.minutes + TRIPS.vet.visit);
      expect(vetSterilize(first)).toBe(true);
      expect(first.trip?.visit).toBe(before);

      const second = femaleAtVet().state;
      expect(vetExam(second)).not.toBeNull();
      const visit = second.trip?.visit ?? 0;
      const after = sterilizeMinutes(second);
      expect(after).toBe(STERILIZATION.minutes);
      expect(vetSterilize(second)).toBe(true);
      expect((second.trip?.visit ?? 0) - visit).toBe(after);
    });

    it("огляд окремо — 40, потім операція — ще 80", () => {
      const { state, cat } = femaleAtVet();
      const money = state.character.money;
      expect(vetExam(state)).not.toBeNull();
      expect(state.character.money).toBe(money - VET.exam);
      expect(sterilizePrice(state)).toBe(STERILIZATION.price - VET.exam);
      expect(vetSterilize(state)).toBe(true);
      expect(cat.sterilized).toBe(true);
      expect(state.character.money).toBe(money - STERILIZATION.price);
    });

    it("уже стерилізована, про що не знали: 40 за огляд, без операції, тепер відомо", () => {
      const { state, cat } = femaleAtVet();
      cat.sterilized = true;
      cat.sterilizedKnown = false;
      expect(knownSterilizeBlocker(state, cat)).toBeNull();
      const money = state.character.money;
      const mood = cat.mood;
      expect(vetSterilize(state)).toBe(false);
      expect(state.character.money).toBe(money - VET.exam);
      expect(cat.sterilizedKnown).toBe(true);
      expect(knownSterilizeBlocker(state, cat)).toBe("sterilized");
      expect(cat.mood).toBe(mood);
      expect(state.trip?.visit).toBe(TRIPS.vet.visit);
    });

    it("відома перешкода чи брак грошей на операцію — нічого не відбувається, і огляду теж", () => {
      const { state, cat } = femaleAtVet();
      cat.pregnancy = { father: null, due: state.day + 3, known: true };
      const money = state.character.money;
      expect(vetSterilize(state)).toBe(false);
      expect(state.character.money).toBe(money);
      cat.pregnancy = null;
      state.character.money = STERILIZATION.price - 1;
      expect(vetSterilize(state)).toBe(false);
      expect(state.character.money).toBe(STERILIZATION.price - 1);
      expect(state.trip?.log?.exam ?? null).toBeNull();
      expect(cat.breedKnown).toEqual([false, false]);
      state.character.money = STERILIZATION.price;
      expect(vetSterilize(state)).toBe(true);
      expect(state.character.money).toBe(0);
    });
  });

  it("притулок: три коти на тиждень; новий кіт — зі стартовим пакетом і бонусом", () => {
    const save = game(9 * 60);
    save.current.day = 5;
    save.current.character.stats.sanity = 40;
    arrive(save, "shelter");
    const cats = shelterCats(save.current);
    expect(cats).toHaveLength(3);
    expect(shelterCats(save.current)).toBe(cats);
    const chosen = cats[0];
    if (!chosen) throw new Error("немає котів");
    expect(adopt(save.current, chosen.id)).not.toBeNull();
    expect(save.current.cats).toHaveLength(1);
    expect(save.current.character.stats.sanity).toBe(90);
    expect(save.current.home.supplies[chosen.sterilized ? "sterileFood" : "catFood"].cheap).toBe(8);
    returnHome(save, save.current.trip?.visit ?? 0, TRIPS.shelter.road);
    expect(save.current.cats[0]?.away).toBeNull();
  });

  it("загальна ревізія 2026-10-29: стерилізований кіт з притулку приходить із кормом для стерилізованих, а не зі звичайним", () => {
    const pack = (sterilized: boolean): { catFood: number; sterileFood: number } => {
      const save = game(9 * 60);
      save.current.day = 5;
      arrive(save, "shelter");
      const chosen = shelterCats(save.current)[0];
      if (!chosen) throw new Error("немає котів");
      chosen.sterilized = sterilized;
      expect(adopt(save.current, chosen.id)).not.toBeNull();
      const supplies = save.current.home.supplies;
      return { catFood: supplies.catFood.cheap, sterileFood: supplies.sterileFood.cheap };
    };
    expect(pack(true)).toEqual({ catFood: 0, sterileFood: 8 });
    expect(pack(false)).toEqual({ catFood: 8, sterileFood: 0 });
  });

  it("притулок: узяті коти їдуть додому разом із персонажем, а не опиняються вдома раніше за нього (перевірка поїздок 2026-10-28)", () => {
    const save = game(9 * 60);
    save.current.day = 5;
    arrive(save, "shelter");
    const [a, b] = shelterCats(save.current);
    if (!a || !b) throw new Error("немає котів");
    adopt(save.current, a.id);
    adopt(save.current, b.id);
    // Раніше другий кіт опинявся вдома одразу, а перший займав переноску.
    expect([a.away, b.away]).toEqual(["trip", "trip"]);
    expect(tripCat(save.current)).toBeNull();
    returnHome(save, save.current.trip?.visit ?? 0, TRIPS.shelter.road);
    expect(save.current.cats.map((c) => [c.id, c.away])).toEqual([
      [a.id, null],
      [b.id, null],
    ]);
  });

  describe("притулок лише дає котів, віддають через оголошення (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А15)", () => {
    it("з котом на руках у притулок їхати можна: це помилка гравця, яку гра дозволяє", () => {
      const save = game(9 * 60);
      save.current.day = 5;
      const own = withCat(save);
      save.current.home.carriers = [{ quality: "cheap", wear: 0 }];
      save.current.character.held = { kind: "cat", cat: own.id };
      expect(tripBlocker(save.current, "shelter")).toBeNull();
    });
  });

  it("кіт, якого взяли в притулку, буває з блохами, як і примусове кошеня (крок 17)", () => {
    let fleas = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const save = game(9 * 60);
      save.current.day = 5;
      save.current.rng.behavior = seed;
      arrive(save, "shelter");
      const cat = shelterCats(save.current)[0];
      if (!cat) throw new Error("немає котів");
      adopt(save.current, cat.id);
      if (cat.diseases.some((d) => d.id === "fleas")) fleas += 1;
    }
    expect(fleas).toBeGreaterThan(3);
    expect(fleas).toBeLessThan(25);
  });

  it("купання — відлік від дня, коли кота взяли, а не від першого візиту тижня: безшерстий із розплідника не хворіє на дерматит раніше за 7 днів (загальна ревізія 2026-10-29)", () => {
    const save = game(9 * 60);
    save.current.day = 0;
    // Перший візит тижня — у понеділок: список розплідника створено цього дня.
    const kitten = breederCats(save.current).cats[0];
    if (!kitten) throw new Error("немає кошенят");
    kitten.shape.coat = "hairless";
    save.current.day = 6;
    arrive(save, "breeder");
    expect(buyFromBreeder(save.current, kitten.id)).toBe(kitten);
    expect(kitten.bathedDay).toBe(6);
    returnHome(save, save.current.trip?.visit ?? 0, TRIPS.breeder.road);
    const always = { ...createRng(1), chance: () => true };
    for (let day = 6; day < 6 + BATH.hairlessDays; day++) {
      save.current.day = day;
      nightlyCare(save.current, always);
      expect(hasDisease(kitten, "dermatitis"), `день ${day}`).toBe(false);
    }
    save.current.day = 6 + BATH.hairlessDays;
    nightlyCare(save.current, always);
    expect(hasDisease(kitten, "dermatitis")).toBe(true);
  });

  describe("безшерстого грумер миє (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А15)", () => {
    /** Кіт, якого давно не купали, у грумера. */
    function atGroomer(coat: Cat["shape"]["coat"]): { save: Save; cat: Cat } {
      const save = game(9 * 60);
      save.current.day = 20;
      const cat = withCat(save);
      cat.shape.coat = coat;
      cat.bathedDay = 0;
      save.current.home.carriers = [{ quality: "cheap", wear: 0 }];
      save.current.character.held = { kind: "cat", cat: cat.id };
      arrive(save, "groomer");
      return { save, cat };
    }

    it("як купання вдома: відлік до дерматиту — з дня грумера, тож 7 ночей безшерстий не хворіє", () => {
      for (const quality of ["cheap", "premium"] as const) {
        const { save, cat } = atGroomer("hairless");
        expect(groomerWashes(cat)).toBe(true);
        expect(groom(save.current, quality, createRng(1))).toBe(true);
        expect(cat.bathedDay, quality).toBe(20);
        returnHome(save, save.current.trip?.visit ?? 0, TRIPS.groomer.road);
        const always = { ...createRng(1), chance: () => true };
        for (let day = 20; day < 20 + BATH.hairlessDays; day++) {
          save.current.day = day;
          nightlyCare(save.current, always);
          expect(hasDisease(cat, "dermatitis"), `${quality}, день ${day}`).toBe(false);
        }
      }
    });

    it("дорогий грумер, як і дорогий шампунь удома, ще й лікує дерматит безшерстого, а дешевий — ні (рецензія реалізації А15)", () => {
      for (const quality of ["cheap", "premium"] as const) {
        const { save, cat } = atGroomer("hairless");
        fallIll(save.current, cat, "dermatitis");
        expect(groom(save.current, quality, createRng(1))).toBe(true);
        expect(hasDisease(cat, "dermatitis"), quality).toBe(quality === "cheap");
      }
    });

    it("вилікуваний дерматит картка називає, лише якщо про нього знали з огляду, як у ветеринара", () => {
      for (const known of [false, true]) {
        const { save, cat } = atGroomer("hairless");
        fallIll(save.current, cat, "dermatitis");
        const disease = cat.diseases.find((d) => d.id === "dermatitis");
        if (disease) disease.known = known;
        expect(groom(save.current, "premium", createRng(1))).toBe(true);
        expect(hasDisease(cat, "dermatitis")).toBe(false);
        expect(save.current.trip?.log?.done.includes("dermatitis:cured"), String(known)).toBe(known);
      }
    });

    it("кота з шерстю грумер не миє — і дорогий грумер дерматиту не лікує", () => {
      const { save, cat } = atGroomer(null);
      fallIll(save.current, cat, "dermatitis");
      expect(groom(save.current, "premium", createRng(1))).toBe(true);
      expect(hasDisease(cat, "dermatitis")).toBe(true);
    });

    it("кота з шерстю грумер вичісує: відлік купання не змінюється", () => {
      const { save, cat } = atGroomer(null);
      expect(groomerWashes(cat)).toBe(false);
      expect(groom(save.current, "cheap", createRng(1))).toBe(true);
      expect(cat.bathedDay).toBe(0);
    });

    it("картка каже «вимитий», а не «вичесаний і пухнастий»", () => {
      expect(fill(GROOMED.hairless, "female", { кіт: "Мурка" })).toBe("Мурка вимита, хоч і трохи ображена.");
      expect(fill(GROOMED.hairless, "male", { кіт: "Барсик" })).toBe("Барсик вимитий, хоч і трохи ображений.");
      for (const text of [GROOMED.hairless, ...Object.values(VET_MANNER.wash)]) expect(text).not.toMatch(/вичес|вичіс|пухнаст|грумінг/);
    });
  });

  describe("котокафе прибрано (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А15)", () => {
    it("у списку поїздок котокафе немає", () => {
      expect(Object.keys(TRIPS)).not.toContain("cafe");
    });
  });
});

describe("час на місці — лише за отриману послугу (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А6)", () => {
  /** Субота, 9:00: кіт без рис і без породи (без «Жаху клініки») на руках біля дверей, переноска є. */
  function withCatAtDoor(): { save: Save; cat: Cat } {
    const save = game(9 * 60);
    save.current.day = 5;
    const cat = withCat(save);
    cat.breed = [MIXED, MIXED];
    save.current.home.carriers = [{ quality: "cheap", wear: 0 }];
    save.current.character.held = { kind: "cat", cat: cat.id };
    return { save, cat };
  }

  /** Доїхати й повернутися кнопкою «Додому»; між ними — що зробили на місці. Повертає хвилини від приїзду до дому без дороги. */
  function onSite(save: Save, destination: Parameters<typeof startTrip>[1], act: (state: GameState) => void = () => undefined): number {
    expect(startTrip(save.current, destination)).toBe(true);
    driveSafely(save);
    expect(save.current.trip?.phase).toBe("visit");
    act(save.current);
    const at = save.current.day * MINUTES_PER_DAY + save.current.minute;
    goHome(save);
    expect(save.current.trip).toBeNull();
    return save.current.day * MINUTES_PER_DAY + save.current.minute - at - TRIPS[destination].road;
  }

  it("без жодної послуги — 15 хвилин: ветеринар без огляду, грумер і виставка без грошей, лікар здоровому", () => {
    expect(onSite(withCatAtDoor().save, "vet")).toBeCloseTo(TRIP_IDLE_MINUTES);

    const poor = withCatAtDoor().save;
    poor.current.character.money = GROOMER.price.cheap - 1;
    expect(onSite(poor, "groomer", (state) => expect(groom(state, "cheap", createRng(1))).toBe(false))).toBeCloseTo(TRIP_IDLE_MINUTES);

    // Виставка без внеску: раніше 3 години на місці, разом із дорогою — близько 6 годин без результату (знахідка 43).
    const show = withCatAtDoor().save;
    show.current.day = 6;
    show.current.modifiers.day = "show";
    show.current.character.money = MODIFIERS.show.fee - 1;
    expect(onSite(show, "show", (state) => expect(enterShow(state, createRng(1))).toBeNull())).toBeCloseTo(TRIP_IDLE_MINUTES);

    const healthy = game(9 * 60);
    healthy.current.day = 5;
    expect(onSite(healthy, "doctor")).toBeCloseTo(TRIP_IDLE_MINUTES);

    // Хворий, але на лікування не вистачило грошей, — теж нічого не отримав.
    const broke = game(9 * 60);
    broke.current.day = 5;
    broke.current.character.money = DOCTOR_TREAT.cheap - 1;
    fallIllPerson(broke.current, "cold");
    expect(onSite(broke, "doctor", (state) => expect(doctorTreat(state, "cold", "cheap", createRng(1))).toBeNull())).toBeCloseTo(TRIP_IDLE_MINUTES);
  });

  it("з послугою — її час: огляд 1 год, грумінг 1,5, участь у виставці 3, прийом у лікаря 1 год на всі хвороби", () => {
    expect(onSite(withCatAtDoor().save, "vet", (state) => expect(vetExam(state)).not.toBeNull())).toBeCloseTo(TRIPS.vet.visit);
    expect(onSite(withCatAtDoor().save, "groomer", (state) => expect(groom(state, "cheap", createRng(1))).toBe(true))).toBeCloseTo(TRIPS.groomer.visit);

    const show = withCatAtDoor().save;
    show.current.day = 6;
    show.current.modifiers.day = "show";
    expect(onSite(show, "show", (state) => expect(enterShow(state, createRng(1))).not.toBeNull())).toBeCloseTo(TRIPS.show.visit);

    // Дві хвороби — один прийом.
    const sick = game(9 * 60);
    sick.current.day = 5;
    fallIllPerson(sick.current, "cold");
    fallIllPerson(sick.current, "injury");
    const treatBoth = (state: GameState): void => {
      expect(doctorTreat(state, "cold", "premium", createRng(1))).toBe("cured");
      expect(doctorTreat(state, "injury", "premium", createRng(1))).toBe("cured");
    };
    expect(onSite(sick, "doctor", treatBoth)).toBeCloseTo(TRIPS.doctor.visit);

    // Невдале лікування — теж послуга: заплатили, і година минула.
    const unlucky = game(9 * 60);
    unlucky.current.day = 5;
    fallIllPerson(unlucky.current, "cold");
    const never = { ...createRng(1), chance: () => false };
    expect(onSite(unlucky, "doctor", (state) => expect(doctorTreat(state, "cold", "cheap", never)).toBe("failed"))).toBeCloseTo(TRIPS.doctor.visit);
  });

  it("у магазині час покупок минає й без покупки", () => {
    const save = game(9 * 60);
    save.current.day = 5;
    expect(onSite(save, "shop")).toBeCloseTo(TRIPS.shop.visit);
  });

  it("притулок і розплідник — теж пункти з послугою: без кота — 15 хвилин, з котом — година, скільки б котів не взяли (рецензія реалізації А6)", () => {
    // Ціну кошеняти розплідника видно лише на місці: не вистачило — не 4 години дороги й ще година, а дорога й 15 хвилин.
    const poor = game(9 * 60);
    poor.current.day = 5;
    poor.current.character.money = 300;
    const noKitten = (state: GameState): void => {
      const [kitten] = breederCats(state).cats;
      if (!kitten) throw new Error("немає кошенят");
      expect(buyFromBreeder(state, kitten.id)).toBeNull();
    };
    expect(onSite(poor, "breeder", noKitten)).toBeCloseTo(TRIP_IDLE_MINUTES);

    const broke = game(9 * 60);
    broke.current.day = 5;
    broke.current.character.money = 0;
    const noCat = (state: GameState): void => {
      const [cat] = shelterCats(state);
      if (!cat) throw new Error("немає котів");
      expect(adopt(state, cat.id)).toBeNull();
    };
    expect(onSite(broke, "shelter", noCat)).toBeCloseTo(TRIP_IDLE_MINUTES);

    // Просто подивилися на котів тижня й поїхали — так само.
    const looked = game(9 * 60);
    looked.current.day = 5;
    expect(onSite(looked, "shelter", (state) => void shelterCats(state))).toBeCloseTo(TRIP_IDLE_MINUTES);

    // Двоє котів — одна година; узятих картка бачить у журналі візиту.
    const two = game(9 * 60);
    two.current.day = 5;
    two.current.character.money = 1000;
    let names: string[] = [];
    const adoptTwo = (state: GameState): void => {
      const [a, b] = shelterCats(state);
      if (!a || !b) throw new Error("немає котів");
      expect(adopt(state, a.id)).not.toBeNull();
      expect(adopt(state, b.id)).not.toBeNull();
      names = [a.name, b.name];
      expect(state.trip?.log?.done).toEqual(names);
    };
    expect(onSite(two, "shelter", adoptTwo)).toBeCloseTo(TRIPS.shelter.visit);
    expect(names).toHaveLength(2);

    const rich = game(9 * 60);
    rich.current.day = 5;
    rich.current.character.money = 1000;
    const buyOne = (state: GameState): void => {
      const [kitten] = breederCats(state).cats;
      if (!kitten) throw new Error("немає кошенят");
      expect(buyFromBreeder(state, kitten.id)).not.toBeNull();
      expect(state.trip?.log?.done).toEqual([kitten.name]);
    };
    expect(onSite(rich, "breeder", buyOne)).toBeCloseTo(TRIPS.breeder.visit);
  });
});

describe("невдале дешеве лікування не повторюють у ту саму поїздку (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А6)", () => {
  const never = (): ReturnType<typeof createRng> => ({ ...createRng(1), chance: () => false });

  it("у ветеринара: хворобу, якій дешеве не допомогло, цієї поїздки вже не лікують — ні дешевим, ні дорогим; іншу — лікують", () => {
    const save = game(9 * 60);
    save.current.day = 5;
    const cat = withCat(save);
    fallIll(save.current, cat, "injury");
    fallIll(save.current, cat, "fleas");
    save.current.home.carriers = [{ quality: "cheap", wear: 0 }];
    save.current.character.held = { kind: "cat", cat: cat.id };
    expect(startTrip(save.current, "vet")).toBe(true);
    driveSafely(save);
    vetExam(save.current);
    expect(vetTreat(save.current, "injury", "cheap", never())).toBe("failed");
    const money = save.current.character.money;
    const visit = save.current.trip?.visit;
    expect(vetTreat(save.current, "injury", "cheap", createRng(1))).toBeNull();
    expect(vetTreat(save.current, "injury", "premium", createRng(1))).toBeNull();
    expect(save.current.character.money).toBe(money);
    expect(save.current.trip?.visit).toBe(visit);
    expect(hasDisease(cat, "injury")).toBe(true);
    expect(vetTreat(save.current, "fleas", "premium", createRng(1))).toBe("cured");

    // Наступна поїздка — знову можна.
    goHome(save);
    standAt(save, "door");
    save.current.character.held = { kind: "cat", cat: cat.id };
    expect(startTrip(save.current, "vet")).toBe(true);
    driveSafely(save);
    vetExam(save.current);
    expect(vetTreat(save.current, "injury", "premium", createRng(1))).toBe("cured");
  });

  it("у лікаря так само: після невдалого дешевого цю хворобу не лікують, а гроші не беруть; наступного разу — лікують", () => {
    const save = game(9 * 60);
    save.current.day = 5;
    fallIllPerson(save.current, "cold");
    fallIllPerson(save.current, "injury");
    expect(startTrip(save.current, "doctor")).toBe(true);
    driveSafely(save);
    expect(doctorTreat(save.current, "cold", "cheap", never())).toBe("failed");
    const money = save.current.character.money;
    expect(doctorTreat(save.current, "cold", "cheap", createRng(1))).toBeNull();
    expect(doctorTreat(save.current, "cold", "premium", createRng(1))).toBeNull();
    expect(save.current.character.money).toBe(money);
    expect(isIll(save.current, "cold")).toBe(true);
    expect(doctorTreat(save.current, "injury", "premium", createRng(1))).toBe("cured");

    goHome(save);
    standAt(save, "door");
    expect(startTrip(save.current, "doctor")).toBe(true);
    driveSafely(save);
    expect(doctorTreat(save.current, "cold", "premium", createRng(1))).toBe("cured");
  });
});

describe("сценарій «До лікаря» (`scenarios/doctor-trip.json`, рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А6)", () => {
  it("персонажка з застудою й травмою біля дверей: до лікаря можна, а «Додому» без лікування — 15 хвилин на місці", () => {
    const scenario = FILE_SCENARIOS["doctor-trip"];
    if (!scenario) throw new Error("немає сценарію");
    const save = applyScenario(scenario);
    expect(save.current.character.illnesses.map((i) => i.id)).toEqual(["cold", "injury"]);
    expect(canLeave(save.current)).toBe(true);
    expect(startTrip(save.current, "doctor")).toBe(true);
    driveSafely(save);
    const at = save.current.minute;
    goHome(save);
    expect(save.current.minute - at).toBeCloseTo(TRIP_IDLE_MINUTES + TRIPS.doctor.road);
  });
});
