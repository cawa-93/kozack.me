// Поїздки (§8.5, §8.6): вирушити, гонка, аварія з перемотуванням, події на місці, штраф у робочий час.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { nightlyCare } from "../src/sim/care";
import { ACCIDENT, BATH, START_CLOTHES, STERILIZATION, TRIPS, VET } from "../src/sim/config";
import {
  adopt,
  breederCats,
  buyAtShop,
  buyFromBreeder,
  cafe,
  enterShow,
  giveToShelter,
  knownSterilizeBlocker,
  officeMeeting,
  shelterCats,
  shopPrice,
  sterilizePrice,
  tripCat,
  vetExam,
  vetSterilize,
  vetTreat,
} from "../src/sim/destinations";
import { fallIll, hasDisease } from "../src/sim/diseases";
import { advance, deserialize, drive, newGame, replayDay, replayWeek, returnHome, rewindAccident, serialize } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { NO_RACE_INPUT } from "../src/sim/race";
import { createRng } from "../src/sim/rng";
import { accidentBedtime, canLeave, HOME_DOOR, startTrip, tripBlocker } from "../src/sim/trips";
import type { Cat, GameState, Save, TraitLevel } from "../src/sim/types";
import { driveSafely, hours, liveDay, recordEvents, standAt, withCatCorner } from "./helpers";

function game(minute = 19 * 60): Save {
  const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed: 6 }));
  save.current.modifiers.day = null;
  save.current.minute = minute;
  save.current.character.money = 1000;
  standAt(save, "door");
  return save;
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

  it("до ветеринара — лише з котом на руках і переноскою", () => {
    const save = game();
    const cat = withCat(save);
    expect(tripBlocker(save.current, "vet")).toBe("cat");
    save.current.character.held = { kind: "cat", cat: cat.id };
    expect(tripBlocker(save.current, "vet")).toBe("carrier");
    save.current.home.carrier = "cheap";
    expect(tripBlocker(save.current, "vet")).toBeNull();
    expect(tripBlocker(save.current, "shop")).toBe("no-cat");
    expect(startTrip(save.current, "vet")).toBe(true);
    expect(cat.away).toBe("trip");
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

  it("аварія: втрати не більше 3, решта дня минає, персонаж засинає вдома", () => {
    const save = game(12 * 60);
    save.current.day = 5;
    startTrip(save.current, "shop");
    const trip = save.current.trip;
    if (!trip) throw new Error("немає поїздки");
    trip.race.cars.push({ lane: 1, start: 0.05 });
    drive(save, 0.1, NO_RACE_INPUT);
    expect(save.current.trip?.phase).toBe("accident");
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
  /** Прожити день найпростішим гравцем; він не пере, тож чистий одяг — щоранку, інакше гігієна закінчує гру. */
  const live = (save: Save): void => {
    save.current.home.clothes = START_CLOTHES;
    liveDay(save);
  };

  /** Прожити дні до `day`, о 12:00 цього дня потрапити в аварію й перемотати день; повертає й ранок дня аварії. */
  const crashOn = (day: number): { save: Save; morning: GameState } => {
    const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed: 6 }));
    while (save.current.day < day) live(save);
    const morning = structuredClone(save.current);
    advance(save, 12 * 60 - save.current.minute);
    standAt(save, "door");
    expect(startTrip(save.current, "shop")).toBe(true);
    save.current.trip?.race.cars.push({ lane: 1, start: 0.05 });
    drive(save, 0.1, NO_RACE_INPUT);
    expect(save.current.trip?.phase).toBe("accident");
    rewindAccident(save);
    expect(save.current.end).toBeNull();
    expect(save.current.day).toBe(day + 1);
    return { save, morning };
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

  it("наступна звичайна ніч оновлює знімки як завжди: день — щоранку, тиждень — у ніч на понеділок", () => {
    const weekday = crashOn(2).save;
    live(weekday);
    expect(weekday.dayStart.day).toBe(4);
    expect(weekday.weekStart.day).toBe(0);

    // Після аварії в неділю знімок тижня лишається понеділком тижня аварії до наступної ночі на понеділок.
    const sunday = crashOn(6).save;
    live(sunday);
    expect(sunday.dayStart.day).toBe(8);
    expect(sunday.weekStart.day).toBe(0);
    while (sunday.current.day < 14) live(sunday);
    expect(sunday.weekStart.day).toBe(14);
    expect(sunday.dayStart.day).toBe(14);
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

  it("на зборах в офісі летучку не пропущено", () => {
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

  it("збори: виїхав до 18:00 — у дорозі штрафу немає; аварія дорогою — летучку не зараховано, а збори пропущено (перевірка поїздок 2026-10-28)", () => {
    const save = game(17 * 60 + 30);
    save.current.day = 1;
    save.current.modifiers.day = "office";
    const late = recordEvents();
    expect(startTrip(save.current, "office")).toBe(true);
    driveSafely(save);
    late.stop();
    expect(save.current.minute).toBeGreaterThan(18 * 60);
    expect(late.events).not.toContainEqual(expect.objectContaining({ type: "modifier", kind: "office-missed" }));

    const crashed = game(9 * 60 + 30);
    crashed.current.day = 1;
    crashed.current.modifiers.day = "office";
    startTrip(crashed.current, "office");
    crashed.current.trip?.race.cars.push({ lane: 1, start: 0.05 });
    drive(crashed, 0.1, NO_RACE_INPUT);
    expect(crashed.current.trip?.phase).toBe("accident");
    const rewind = recordEvents();
    rewindAccident(crashed);
    rewind.stop();
    expect(rewind.events).toContainEqual(expect.objectContaining({ type: "standup", attended: false }));
    expect(rewind.events).toContainEqual(expect.objectContaining({ type: "modifier", kind: "office-missed" }));
  });

  it("гості й ОСББ, поки персонаж у поїздці, не заходять: сором гостей після аварії не закінчує гру (перевірка поїздок 2026-10-28)", () => {
    const save = game(12 * 60);
    save.current.day = 5;
    save.current.modifiers.day = "guests";
    save.current.character.stats.sanity = 12;
    for (let i = 0; i < 6; i++) save.current.home.messes.push({ id: 100 + i, kind: "vomit", x: 5.5 + i * 0.5, y: 8.5, cat: null });
    startTrip(save.current, "shop");
    save.current.trip?.race.cars.push({ lane: 1, start: 0.05 });
    drive(save, 0.1, NO_RACE_INPUT);
    expect(save.current.trip?.phase).toBe("accident");
    const { events, stop } = recordEvents();
    rewindAccident(save);
    stop();
    expect(save.current.end).toBeNull();
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
    fallIll(vet.current, cat, "senior");
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
    save.current.home.carrier = "cheap";
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
    expect(price).toBeGreaterThanOrEqual(70);
    expect(price).toBeLessThanOrEqual(110);
    buyAtShop(save.current, { product: "litter" }, "cheap");
    buyAtShop(save.current, { thing: "litter" }, "cheap");
    // Запас — у ящиках біля входу, річ — одразу на місці (§6.4).
    expect(save.current.home.boxes?.litter?.cheap).toBe(7);
    expect(save.current.home.items.filter((i) => i.kind === "litter")).toHaveLength(2);
    returnHome(save, save.current.trip?.visit ?? 0, TRIPS.shop.road);
    expect(save.current.trip).toBeNull();
    expect(save.current.character.body.x).toBeCloseTo(HOME_DOOR.x);
  });

  it("«Ветеринар»: улюбленець не ображається на огляд, «Жах клініки» — удвічі більше (§9.12)", () => {
    const loss = (level: TraitLevel | 0): number => {
      const save = game(9 * 60);
      save.current.day = 5;
      const cat = withCat(save);
      if (level !== 0) cat.traits.push({ group: "vet", level, seen: 0, known: false });
      save.current.home.carrier = "premium";
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
    save.current.home.carrier = "premium";
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
      fallIll(save.current, cat, "senior");
      save.current.home.carrier = "premium";
      save.current.character.held = { kind: "cat", cat: cat.id };
      arrive(save, "vet");
      vetExam(save.current);
      expect(vetTreat(save.current, "senior", quality, createRng(1))).toBe("controlled");
      return (cat.diseases[0]?.controlled ?? 0) - save.current.day;
    };
    expect(controlled("cheap")).toBe(7);
    expect(controlled("premium")).toBe(14);
  });

  it("ветеринар: лікування, що не подовжить контролю, не продається — дешеве не скорочує купленого дорогим (перевірка поїздок 2026-10-28)", () => {
    const save = game(9 * 60);
    save.current.day = 5;
    const cat = withCat(save);
    fallIll(save.current, cat, "senior");
    const disease = cat.diseases[0];
    if (!disease) throw new Error("немає хвороби");
    disease.controlled = save.current.day + 10;
    save.current.home.carrier = "premium";
    save.current.character.held = { kind: "cat", cat: cat.id };
    arrive(save, "vet");
    vetExam(save.current);
    const money = save.current.character.money;
    const visit = save.current.trip?.visit;
    expect(vetTreat(save.current, "senior", "cheap", createRng(1))).toBeNull();
    expect(disease.controlled).toBe(save.current.day + 10);
    expect(save.current.character.money).toBe(money);
    expect(save.current.trip?.visit).toBe(visit);
    expect(vetTreat(save.current, "senior", "premium", createRng(1))).toBe("controlled");
    expect(disease.controlled).toBe(save.current.day + 14);
  });

  it("ветеринар: ожиріння бачить і каже про зайву вагу, але грошима не лікує — лише дієта й ігри (§9.12)", () => {
    const save = game(9 * 60);
    save.current.day = 5;
    const cat = withCat(save);
    cat.weight = 80;
    fallIll(save.current, cat, "obesity");
    save.current.home.carrier = "premium";
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
      save.current.home.carrier = "premium";
      save.current.character.held = { kind: "cat", cat: cat.id };
      arrive(save, "vet");
      return { save, state: save.current, cat };
    }

    it("без огляду — одна дія: ветеринар оглядає й оперує, разом 120; хвороби, порода й щеплення — як на огляді", () => {
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
      expect(state.today.vaccinated).toBe(true);
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

  it("притулок: узяті коти їдуть додому разом із персонажем, а «Віддати» — лише кіт, з яким приїхали (перевірка поїздок 2026-10-28)", () => {
    const save = game(9 * 60);
    save.current.day = 5;
    const own = withCat(save);
    save.current.home.carrier = "cheap";
    save.current.character.held = { kind: "cat", cat: own.id };
    arrive(save, "shelter");
    const [a, b] = shelterCats(save.current);
    if (!a || !b) throw new Error("немає котів");
    adopt(save.current, a.id);
    adopt(save.current, b.id);
    // Раніше другий кіт опинявся вдома одразу, а перший займав переноску — і картка пропонувала віддати його назад.
    expect([a.away, b.away]).toEqual(["trip", "trip"]);
    expect(tripCat(save.current)).toBe(own);
    expect(giveToShelter(save.current)).toBe(true);
    expect(tripCat(save.current)).toBeNull();
    returnHome(save, save.current.trip?.visit ?? 0, TRIPS.shelter.road);
    expect(save.current.cats.map((c) => [c.id, c.away])).toEqual([
      [a.id, null],
      [b.id, null],
    ]);
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

  it("котокафе: здоровий глузд слабшає з кожною годиною, ревниві коти ображаються", () => {
    const save = game(9 * 60);
    save.current.day = 5;
    const cat = withCat(save);
    cat.traits = [{ group: "jealousy", level: 1, seen: 0, known: false }];
    const mood = cat.mood;
    save.current.character.stats.sanity = 40;
    arrive(save, "cafe");
    expect(cafe(save.current, 3)).toBe(true);
    expect(save.current.character.stats.sanity).toBe(61);
    expect(cat.mood).toBeLessThan(mood);
  });
});
