// Модифікатори дороги й роботи (§4.1, `DAY_MODIFIERS.md`): «Ожеледиця ↔ Новий асфальт» — гальмо й перестроювання в гонці ×
// зчеплення, довжина дороги та сама, дорога в «Ожеледицю» крижана; «Рекрутери мовчать ↔ Ярмарок вакансій» — пошук роботи ×, лише
// безробітному; «Квартальний звіт ↔ Цікавий проєкт» — здоровий глузд за годину роботи ×, пошуку роботи не стосується.

import { describe, expect, it } from "vitest";

import { JOB_SEARCH, MODIFIERS, POSITIONS, RACE, TRIPS } from "../src/sim/config";
import { drive, newGame } from "../src/sim/game";
import { chooseDayModifier, chooseWeekModifier, gripFactor, searchFactor, workSanityFactor } from "../src/sim/modifiers";
import { driveRace, newRace, startSide, type RaceInput } from "../src/sim/race";
import { createRng } from "../src/sim/rng";
import { raceMinutes } from "../src/sim/time";
import { roadMinutes } from "../src/sim/trips";
import type { Destination, Difficulty, Race, Save } from "../src/sim/types";
import { startWork, tickWork } from "../src/sim/work";
import { RACE_TILES } from "../src/view/art/manifest/a14-race";
import { homeDepartureStart } from "../src/view/parking";
import { iceRect, iceScroll, icyRoad, RACE_ICE } from "../src/view/raceice";
import { hours } from "./helpers";

const GAS: RaceInput = { steer: 0, throttle: 1 };
const COAST: RaceInput = { steer: 0, throttle: 0 };
const BRAKE: RaceInput = { steer: 0, throttle: -1 };
const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];

const ICE = MODIFIERS.week.grip["ice"] ?? 1;
const ASPHALT = MODIFIERS.week.grip["new-asphalt"] ?? 1;
/** Тиждень і його зчеплення: звичайний, «Ожеледиця», «Новий асфальт». */
const WEEKS: readonly [string | null, number][] = [
  [null, 1],
  ["ice", ICE],
  ["new-asphalt", ASPHALT],
];

function game(week: string | null = null, day: string | null = null): Save {
  const save = newGame({ address: "she", difficulty: "normal", seed: 5 });
  save.current.modifiers.week = week;
  save.current.modifiers.day = day;
  return save;
}

/** Порожня дорога: машин немає й нові не з'являються. */
function emptyRace(): Race {
  const race = newRace(1000, 1);
  race.spawned = Infinity;
  return race;
}

describe("«Ожеледиця» ↔ «Новий асфальт»: зчеплення в гонці (§8.5)", () => {
  it("зчеплення — з тижня: на льоду гірше (але гальмо є), на новому асфальті краще, в інші тижні ×1", () => {
    expect(ICE).toBeGreaterThan(0);
    expect(ICE).toBeLessThan(1);
    expect(ASPHALT).toBeGreaterThan(1);
    for (const [week, grip] of WEEKS) expect(gripFactor(game(week).current)).toBe(grip);
    expect(gripFactor(game("crunch").current)).toBe(1);
  });

  it("гальмо × зчеплення; газ і накат без газу — як завжди", () => {
    for (const [, grip] of WEEKS) {
      const race = emptyRace();
      race.speed = 8;
      driveRace(race, 1, BRAKE, "normal", 1, grip);
      expect(race.speed).toBeCloseTo(8 - RACE.braking * grip);
      const braked = race.speed;
      driveRace(race, 1, COAST, "normal", 1, grip);
      expect(race.speed).toBeCloseTo(braked - RACE.coasting);
      driveRace(race, 1, GAS, "normal", 1, grip);
      expect(race.speed).toBeCloseTo(braked - RACE.coasting + RACE.acceleration);
    }
  });

  it("гальмівний шлях з ×10 до зупинки: на льоду довший, на новому асфальті коротший", () => {
    const stop = (grip: number): number => {
      const race = emptyRace();
      race.speed = RACE.maxSpeed;
      driveRace(race, 30, BRAKE, "normal", 1, grip);
      expect(race.speed).toBe(0);
      return race.done;
    };
    // Шлях — v² / (2 × гальмо × зчеплення) з похибкою дрібних кроків (`RACE.step`).
    for (const [, grip] of WEEKS) expect(stop(grip)).toBeCloseTo(RACE.maxSpeed ** 2 / (2 * RACE.braking * grip), 0);
    expect(stop(ICE)).toBeGreaterThan(stop(1));
    expect(stop(ASPHALT)).toBeLessThan(stop(1));
  });

  it("перестроювання на сусідню смугу × зчеплення: на льоду довше, на новому асфальті швидше", () => {
    const shift = (grip: number): number => {
      const race = emptyRace();
      driveRace(race, 0, { steer: -1, throttle: 0 }, "normal", 1, grip);
      let minutes = 0;
      while (race.lane !== race.targetLane) {
        driveRace(race, RACE.step, COAST, "normal", 1, grip);
        minutes += RACE.step;
      }
      return minutes;
    };
    for (const [, grip] of WEEKS) expect(shift(grip)).toBeCloseTo(1 / (RACE.laneSpeed * grip), 1);
    expect(shift(ICE)).toBeGreaterThan(shift(1));
    expect(shift(ASPHALT)).toBeLessThan(shift(1));
  });

  it("довжина дороги та сама: і в звичайний день, і в «Затори» — зчеплення її не змінює", () => {
    for (const day of [null, "traffic", "empty-roads"]) {
      for (const destination of Object.keys(TRIPS) as Destination[]) {
        const road = roadMinutes(game(null, day).current, destination);
        for (const [week] of WEEKS) expect(roadMinutes(game(week, day).current, destination)).toBe(road);
      }
    }
  });

  it("поїздка бере зчеплення свого тижня: гальмо в гонці поїздки × зчеплення, дорога — та сама", () => {
    for (const [week, grip] of WEEKS) {
      const save = game(week);
      const state = save.current;
      state.minute = hours(10);
      state.trip = { destination: "shop", phase: "drive", cat: null, race: newRace(roadMinutes(state, "shop"), 1), losses: [], visit: 0, seed: 1 };
      state.trip.race.spawned = Infinity;
      state.trip.race.speed = 8;
      drive(save, 1, BRAKE);
      const race = save.current.trip?.race;
      expect(race?.speed).toBeCloseTo(8 - RACE.braking * grip);
      expect(race?.road).toBe(TRIPS.shop.road);
    }
  });

  it("на старті сусідні смуги на льоду вільні далі — на довший гальмівний шлях: секунда реакції лишається", () => {
    const t = raceMinutes(RACE.startReaction);
    const coast = (RACE.startSpeed - RACE.carSpeed) * t - (RACE.coasting * t * t) / 2;
    const react = RACE.startSpeed - RACE.coasting * t;
    for (const [, grip] of WEEKS) {
      const brake = (react - RACE.carSpeed) ** 2 / (2 * RACE.braking * grip);
      expect(startSide(grip)).toBeGreaterThanOrEqual(coast + brake + RACE.carLength);
      expect(startSide(grip)).toBeLessThan(RACE.startClear);
    }
    expect(startSide(1)).toBe(RACE.startSide);
    expect(startSide(ASPHALT)).toBe(RACE.startSide);
    expect(startSide(ICE)).toBeGreaterThan(RACE.startSide);
  });

  it("перестроїлися першою дією на льоду чи новому асфальті: за секунду реакції без аварії, і гальмо чи повернення рятують", () => {
    const frame = raceMinutes(1 / 60);
    const reaction = raceMinutes(RACE.startReaction);
    const run = (steer: -1 | 1, after: { throttle: number; back: boolean }, difficulty: Difficulty, grip: number, seed: number): number | null => {
      const race = newRace(1000, seed);
      let back = false;
      for (let t = 0; t < 12; t += frame) {
        const reacted = t >= reaction;
        const turn: -1 | 0 | 1 = t === 0 ? steer : reacted && after.back && !back ? (steer === 1 ? -1 : 1) : 0;
        if (turn !== 0 && t > 0) back = true;
        if (driveRace(race, frame, { steer: turn, throttle: reacted ? after.throttle : 0 }, difficulty, 1, grip) === "crash") return t;
      }
      return null;
    };
    for (const grip of [ICE, ASPHALT]) {
      for (const difficulty of DIFFICULTIES) {
        for (let seed = 1; seed <= 40; seed++) {
          for (const steer of [-1, 1] as const) {
            const label = `зерно ${seed}, ${difficulty}, зчеплення ×${grip}, смуга ${steer}`;
            const coasting = run(steer, { throttle: 0, back: false }, difficulty, grip, seed);
            if (coasting !== null) expect(coasting, label).toBeGreaterThan(reaction);
            expect(run(steer, { throttle: -1, back: false }, difficulty, grip, seed), label).toBeNull();
            expect(run(steer, { throttle: 0, back: true }, difficulty, grip, seed), label).toBeNull();
          }
        }
      }
    }
  });

  it("від'їзд від дому на льоду показує ті самі машини старту, що поставить гонка, — усі за межею вільних смуг", () => {
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 12; seed++) {
        const race = newRace(40, seed);
        const start = homeDepartureStart(race, seed, difficulty, 1, ICE);
        const after = structuredClone(race);
        driveRace(after, RACE.step, COAST, difficulty, 1, ICE);
        expect(start.cars.map((car) => car.lane)).toEqual(after.cars.map((car) => car.lane));
        for (const car of start.cars) expect(car.ahead).toBeGreaterThanOrEqual(startSide(ICE));
      }
    }
  });

  it("обережна їзда повільніше за потік, без гальма й перестроювань (як бот балансу), доїжджає й на льоду — за той самий час", () => {
    const cautious = (grip: number, difficulty: Difficulty, seed: number): { result: string | null; minutes: number } => {
      const race = newRace(TRIPS.shop.road, seed);
      let result: string | null = null;
      for (let i = 0; i < 10_000 && result === null; i++) {
        result = driveRace(race, 0.1, { steer: 0, throttle: race.speed < RACE.carSpeed * 0.8 ? 1 : 0 }, difficulty, 1, grip);
      }
      return { result, minutes: race.minutes };
    };
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 10; seed++) {
        const usual = cautious(1, difficulty, seed);
        const icy = cautious(ICE, difficulty, seed);
        expect(icy.result, `зерно ${seed}, ${difficulty}`).toBe("arrived");
        expect(icy.minutes).toBeCloseTo(usual.minutes, 6);
      }
    }
  });

  it("дорога в «Ожеледицю» крижана: плівка від бордюру до бордюру на всю висоту кадру; в інші тижні — ні", () => {
    expect(icyRoad(game("ice").current)).toBe(true);
    expect(icyRoad(game("new-asphalt").current)).toBe(false);
    expect(icyRoad(game(null, "traffic").current)).toBe(false);
    const k = 1.5;
    expect(iceRect(640, k, 1080)).toEqual({ x: 640 - RACE_TILES.road.curb * k, y: 0, width: 2 * RACE_TILES.road.curb * k, height: 1080 });
  });

  it("лід біжить разом із дорогою: зсув повторюється з кроком плитки дороги, блиски — всередині плитки", () => {
    expect(RACE_ICE.height).toBe(RACE_TILES.road.period);
    const k = 0.75;
    for (const distance of [0, 37, 500, 12_345]) {
      const scroll = iceScroll(distance, k);
      expect(scroll).toBeLessThanOrEqual(0);
      expect(scroll).toBeGreaterThan(-RACE_ICE.height);
      expect(iceScroll(distance + RACE_TILES.road.period * k, k)).toBeCloseTo(scroll, 6);
    }
    // Проїхали трохи — малюнок нижче (зсув текстури менший), як і плитки дороги (`tileRows`).
    expect(iceScroll(10 * k, k)).toBeCloseTo(-10, 6);
    for (const g of RACE_ICE.glints) {
      expect(g.y).toBeLessThanOrEqual(RACE_ICE.height);
      expect(g.y - g.length).toBeGreaterThanOrEqual(0);
      expect(g.x).toBeGreaterThanOrEqual(0);
      expect(g.x + g.width + g.length * RACE_ICE.slant).toBeLessThanOrEqual(RACE_ICE.width);
    }
  });
});

describe("«Рекрутери мовчать» ↔ «Ярмарок вакансій»: пошук роботи (§8.6)", () => {
  const FREEZE = MODIFIERS.search["hiring-freeze"] ?? 1;
  const FAIR = MODIFIERS.search["job-fair"] ?? 1;

  /** Безробітний персонаж за комп'ютером шукає роботу з нуля; день — `day`. */
  function searching(day: string | null): Save {
    const save = game(null, day);
    save.current.job.unemployed = true;
    save.current.job.searchHours = 0;
    startWork(save.current);
    return save;
  }

  it("година пошуку зараховується × `MODIFIERS.search`: у «Рекрутери мовчать» — менше, на «Ярмарку вакансій» — більше", () => {
    expect(FREEZE).toBeLessThan(1);
    expect(FAIR).toBeGreaterThan(1);
    for (const [day, factor] of [
      [null, 1],
      ["hiring-freeze", FREEZE],
      ["job-fair", FAIR],
    ] as const) {
      const save = searching(day);
      expect(searchFactor(save.current)).toBe(factor);
      tickWork(save.current, hours(10), hours(1));
      expect(save.current.job.searchHours).toBeCloseTo(factor);
    }
  });

  it("на «Ярмарку вакансій» роботу знаходять за `JOB_SEARCH.hours` / множник; у «Рекрутери мовчать» за стільки годин — ще ні", () => {
    const need = JOB_SEARCH.hours.normal;
    const fair = searching("job-fair");
    let spent = 0;
    while (fair.current.job.unemployed && spent < need) {
      tickWork(fair.current, hours(9) + spent * 60, hours(1));
      spent += 1;
    }
    expect(fair.current.job.unemployed).toBe(false);
    expect(spent).toBe(Math.ceil(need / FAIR));
    const freeze = searching("hiring-freeze");
    for (let h = 0; h < need; h++) tickWork(freeze.current, hours(9), hours(1));
    expect(freeze.current.job.unemployed).toBe(true);
    expect(freeze.current.job.searchHours).toBeCloseTo(need * FREEZE);
  });

  it("множник не зачіпає роботи: найнятого посеред дня «Ярмарок вакансій» не прискорює й не сповільнює", () => {
    const hour = (day: string | null): { money: number; sanity: number } => {
      const save = game(null, day);
      startWork(save.current);
      tickWork(save.current, hours(10), hours(1));
      const activity = save.current.character.activity;
      return activity?.kind === "work" ? { money: activity.money, sanity: activity.sanity } : { money: NaN, sanity: NaN };
    };
    const usual = hour(null);
    for (const day of ["hiring-freeze", "job-fair"]) expect(hour(day)).toEqual(usual);
  });

  it("випадає лише безробітному", () => {
    const days = (unemployed: boolean): Set<string | null> => {
      const save = game();
      save.current.job.unemployed = unemployed;
      const out = new Set<string | null>();
      for (let seed = 1; seed <= 3000; seed++) out.add(chooseDayModifier(save.current, 2, createRng(seed)));
      return out;
    };
    const employed = days(false);
    const jobless = days(true);
    for (const id of ["hiring-freeze", "job-fair"]) {
      expect(employed.has(id), id).toBe(false);
      expect(jobless.has(id), id).toBe(true);
    }
  });
});

describe("«Квартальний звіт» ↔ «Цікавий проєкт»: здоровий глузд за годину роботи (§8.6)", () => {
  const REPORT = MODIFIERS.week.workSanity["quarterly-report"] ?? 1;
  const FUN = MODIFIERS.week.workSanity["fun-project"] ?? 1;

  /** Година за комп'ютером тижня `week`: що забрала й дала (`unemployed` — пошук роботи). */
  function hour(week: string | null, unemployed = false): { sanity: number; money: number; reputation: number; searchHours: number } {
    const save = game(week);
    const state = save.current;
    state.job.unemployed = unemployed;
    state.character.stats.sanity = 80;
    startWork(state);
    const reputation = state.job.reputation;
    tickWork(state, hours(10), hours(1));
    const activity = state.character.activity;
    if (activity?.kind !== "work") throw new Error("персонаж не за комп'ютером");
    return { sanity: activity.sanity, money: activity.money, reputation: state.job.reputation - reputation, searchHours: state.job.searchHours };
  }

  it("година роботи забирає глузду × `MODIFIERS.week.workSanity`; гроші й репутація — як завжди", () => {
    expect(REPORT).toBeGreaterThan(1);
    expect(FUN).toBeLessThan(1);
    const usual = hour(null);
    expect(usual.sanity).toBeCloseTo(POSITIONS[0]?.sanity ?? 0);
    for (const [week, factor] of [
      ["quarterly-report", REPORT],
      ["fun-project", FUN],
    ] as const) {
      expect(workSanityFactor(game(week).current)).toBe(factor);
      const shifted = hour(week);
      expect(shifted.sanity).toBeCloseTo(usual.sanity * factor);
      expect(shifted.money).toBeCloseTo(usual.money);
      expect(shifted.reputation).toBeCloseTo(usual.reputation);
    }
    expect(workSanityFactor(game("crunch").current)).toBe(1);
  });

  it("пошуку роботи не стосується: безробітний шукає з тією самою ціною в глузді", () => {
    const usual = hour(null, true);
    for (const week of ["quarterly-report", "fun-project"]) {
      const shifted = hour(week, true);
      expect(shifted.sanity).toBeCloseTo(usual.sanity);
      expect(shifted.searchHours).toBeCloseTo(usual.searchHours);
    }
  });

  it("лише з роботою: безробітному тиждень не випадає", () => {
    const weeks = (unemployed: boolean): Set<string | null> => {
      const save = game();
      save.current.job.unemployed = unemployed;
      const out = new Set<string | null>();
      for (let week = 1; week <= 3000; week++) out.add(chooseWeekModifier(save.current, week));
      return out;
    };
    const employed = weeks(false);
    const jobless = weeks(true);
    for (const id of ["quarterly-report", "fun-project"]) {
      expect(employed.has(id), id).toBe(true);
      expect(jobless.has(id), id).toBe(false);
    }
  });
});
