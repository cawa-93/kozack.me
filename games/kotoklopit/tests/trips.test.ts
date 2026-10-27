// Поїздки (§8.5, §8.6): вирушити, гонка, аварія з перемотуванням, події на місці, штраф у робочий час.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { TRIPS } from "../src/sim/config";
import { adopt, buyAtShop, cafe, enterShow, giveToShelter, officeMeeting, shelterCats, shopPrice, tripCat, vetExam, vetTreat } from "../src/sim/destinations";
import { fallIll } from "../src/sim/diseases";
import { advance, deserialize, drive, newGame, returnHome, rewindAccident, serialize } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { NO_RACE_INPUT } from "../src/sim/race";
import { createRng } from "../src/sim/rng";
import { canLeave, HOME_DOOR, startTrip, tripBlocker } from "../src/sim/trips";
import type { Cat, Save, TraitLevel } from "../src/sim/types";
import { driveSafely, recordEvents, standAt, withCatCorner } from "./helpers";

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

  it("ветеринар: дешеве лікування не скорочує контролю, уже купленого дорогим (перевірка поїздок 2026-10-28)", () => {
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
    expect(vetTreat(save.current, "senior", "cheap", createRng(1))).toBe("controlled");
    expect(disease.controlled).toBe(save.current.day + 10);
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
    expect(save.current.home.supplies.catFood.cheap).toBe(8);
    returnHome(save, save.current.trip?.visit ?? 0, TRIPS.shelter.road);
    expect(save.current.cats[0]?.away).toBeNull();
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
