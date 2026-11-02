// Ніч у гонці (§8.9 «День і ніч», рішення автора 2026-11-02 «Те саме + світло ліхтарів»; `src/view/racelight.ts`): вогні машин і
// куди вони світять, коли вмикаються фари, своя машина на парковці, плями вуличних ліхтарів, запас відсікання на промінь,
// на яку хвилину світло в поїздці, удень — нічого. Без Phaser.

import { describe, expect, it } from "vitest";

import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { DAYLIGHT, GIFTS, MODIFIERS, TRIPS } from "../src/sim/config";
import { carAt, NO_RACE_INPUT } from "../src/sim/race";
import { carryFoundling, drive, goHome } from "../src/sim/game";
import { gameMinutes } from "../src/sim/time";
import { roadMinutes, visitMinutes } from "../src/sim/trips";
import type { Save } from "../src/sim/types";
import { RACE_TILES } from "../src/view/art/manifest/a14-race";
import { CAR_REACH, HOME_ROAD, homeRoadFrame, TRAFFIC } from "../src/view/homeroad";
import { daylight } from "../src/view/light/daylight";
import { CAR_BODY, DEPARTURE, LOT_BOUNDS, lotInFrame } from "../src/view/parking";
import {
  arrivalLights,
  BEAM,
  beamAlpha,
  BEAM_SPREAD,
  CAR_LIGHTS,
  carLights,
  departureLightMinute,
  departureLights,
  DRIVING_LIGHTS,
  HEADLIGHTS,
  headlightsOn,
  headlightThreshold,
  LIGHT_REACH,
  lightFade,
  lookSeed,
  lotLights,
  lotPools,
  OWN_LIGHTS,
  PARKED_LIGHTS,
  poolAlpha,
  raceNight,
  signGlow,
  SIGN_AT,
  STREET_LAMPS,
  streetPools,
  TAIL,
  tripLightMinute,
  type CarKind,
} from "../src/view/racelight";
import { RACE_PLAYER_Y, racePixelsPerUnit, raceScale, TRAFFIC_COLORS, TRAFFIC_KINDS } from "../src/view/racelook";

const KINDS = Object.keys(CAR_LIGHTS) as CarKind[];

function scenario(id: string): Save {
  const found = FILE_SCENARIOS[id];
  if (!found) throw new Error(`немає сценарію ${id}`);
  return applyScenario(found);
}

describe("вогні машин", () => {
  it("фари й задні вогні — усередині кузова кожного виду (`CAR_BODY`): фари попереду, задні позаду, симетрично", () => {
    expect([...KINDS].sort()).toEqual(Object.keys(CAR_BODY).sort());
    for (const kind of KINDS) {
      const body = CAR_BODY[kind];
      const lights = carLights({ x: 0, y: 0, rotation: 0 }, kind);
      expect(lights).toHaveLength(4);
      for (const light of lights) {
        expect(Math.abs(light.x), kind).toBeLessThan(body.w / 2);
        expect(Math.abs(light.y), kind).toBeLessThan(body.h / 2);
      }
      const heads = lights.filter((l) => l.kind === "head");
      const tails = lights.filter((l) => l.kind === "tail");
      for (const head of heads) {
        expect(head.y, kind).toBeLessThan(0);
        expect(head.rotation).toBe(0);
      }
      for (const tail of tails) {
        expect(tail.y, kind).toBeGreaterThan(0);
        expect(tail.rotation).toBeCloseTo(Math.PI);
      }
      expect(heads.map((l) => l.x).sort((a, b) => a - b)).toEqual([-CAR_LIGHTS[kind].head.x, CAR_LIGHTS[kind].head.x]);
    }
  });

  it("поворот на π (дорога додому, носом донизу) переносить фари назад, униз, і вони світять донизу; задні — угору", () => {
    for (const kind of KINDS) {
      const up = carLights({ x: 100, y: 200, rotation: 0 }, kind);
      const down = carLights({ x: 100, y: 200, rotation: Math.PI }, kind);
      for (const [i, light] of down.entries()) {
        const before = up[i];
        if (!before) throw new Error("немає вогню");
        // Дзеркально відносно pivot.
        expect(light.x - 100).toBeCloseTo(-(before.x - 100));
        expect(light.y - 200).toBeCloseTo(-(before.y - 200));
        if (light.kind === "head") {
          expect(light.y).toBeGreaterThan(200);
          // Куди світить: уперед машини — (sin, −cos) повороту — донизу.
          expect(-Math.cos(light.rotation)).toBeCloseTo(1);
        } else {
          expect(light.y).toBeLessThan(200);
          expect(-Math.cos(light.rotation)).toBeCloseTo(-1);
        }
      }
    }
  });

  it("нахил під час перестроювання (±0,2) повертає вогні разом із кузовом навколо pivot; масштаб k множить відстані", () => {
    const flat = carLights({ x: 0, y: 0, rotation: 0 }, "player");
    const tilted = carLights({ x: 0, y: 0, rotation: 0.2 }, "player", 2);
    for (const [i, light] of tilted.entries()) {
      const before = flat[i];
      if (!before) throw new Error("немає вогню");
      expect(Math.hypot(light.x, light.y)).toBeCloseTo(2 * Math.hypot(before.x, before.y));
      expect(Math.atan2(light.y, light.x) - Math.atan2(before.y, before.x)).toBeCloseTo(0.2);
    }
    // Нахил праворуч — фари теж трохи праворуч.
    const heads = tilted.filter((l) => l.kind === "head");
    expect(heads.reduce((sum, l) => sum + l.x, 0)).toBeGreaterThan(0);
  });

  it("промінь: найясніше біля фари (крім вістря), гасне до кінчика, м'які краї до `BEAM_SPREAD`; плями — рівна середина, нуль на краю", () => {
    expect(beamAlpha(0, 0)).toBe(0);
    expect(beamAlpha(1, 0)).toBe(0);
    expect(beamAlpha(0.1, 0)).toBeGreaterThan(beamAlpha(0.5, 0));
    expect(beamAlpha(0.5, 0)).toBeGreaterThan(beamAlpha(0.9, 0));
    expect(beamAlpha(0.3, 0.5 * BEAM.half)).toBeCloseTo(beamAlpha(0.3, 0));
    expect(beamAlpha(0.3, BEAM.half)).toBeLessThan(beamAlpha(0.3, 0));
    expect(beamAlpha(0.3, BEAM_SPREAD)).toBe(0);
    expect(beamAlpha(0.3, -BEAM_SPREAD - 0.1)).toBe(0);
    expect(poolAlpha(0)).toBe(1);
    expect(poolAlpha(1)).toBe(0);
    expect(poolAlpha(0.5)).toBeGreaterThan(poolAlpha(0.8));
    expect(poolAlpha(0.4, 0.5)).toBe(1);
  });
});

describe("фари вмикаються", () => {
  const seeds = [...TRAFFIC_KINDS.flatMap((kind) => TRAFFIC_COLORS.map((_, color) => lookSeed({ kind, color }))), ...Array.from({ length: 50 }, (_, i) => i)];

  it("поріг — 0,25 ± 0,1 з розкидом між машинами; своя — рівно 0,25; зерна машин потоку з вигляду різні", () => {
    expect(headlightThreshold(null)).toBe(HEADLIGHTS.threshold);
    const thresholds = seeds.map(headlightThreshold);
    for (const t of thresholds) {
      expect(t).toBeGreaterThanOrEqual(HEADLIGHTS.threshold - HEADLIGHTS.spread);
      expect(t).toBeLessThanOrEqual(HEADLIGHTS.threshold + HEADLIGHTS.spread);
    }
    // Розкид справжній: є й ранні, й пізні.
    expect(Math.min(...thresholds)).toBeLessThan(HEADLIGHTS.threshold - HEADLIGHTS.spread / 2);
    expect(Math.max(...thresholds)).toBeGreaterThan(HEADLIGHTS.threshold + HEADLIGHTS.spread / 2);
    const looks = new Set(TRAFFIC_KINDS.flatMap((kind) => TRAFFIC_COLORS.map((_, color) => lookSeed({ kind, color }))));
    expect(looks.size).toBe(TRAFFIC_KINDS.length * TRAFFIC_COLORS.length);
  });

  it("поріг монотонний: з темрявою фари вмикаються раз і більше не гаснуть", () => {
    for (const seed of [null, ...seeds]) {
      let switches = 0;
      let prev = false;
      for (let level = 0; level <= 1.0001; level += 0.005) {
        const on = headlightsOn(level, seed);
        if (on !== prev) switches++;
        if (prev) expect(on).toBe(true);
        prev = on;
      }
      expect(switches).toBe(1);
    }
  });

  it("за вечір темрява лише росте, а за ранок лише спадає — тож за годинником фари теж вмикаються й гаснуть раз, без блимання", () => {
    let prev = 0;
    for (let m = DAYLIGHT.eveningStart; m <= 24 * 60; m += 1) {
      const dark = daylight(m, true)?.dark ?? 0;
      expect(dark).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = dark;
    }
    prev = 1;
    for (let m = 0; m < DAYLIGHT.morningEnd; m += 1) {
      const dark = daylight(m, true)?.dark ?? 0;
      expect(dark).toBeLessThanOrEqual(prev + 1e-12);
      prev = dark;
    }
    // Глухої ночі світять усі, о 18:00 — ніхто.
    const night = raceNight(daylight(22 * 60, true));
    const dusk = raceNight(daylight(DAYLIGHT.eveningStart, true));
    for (const seed of [null, ...seeds]) {
      expect(headlightsOn(night?.dark ?? 0, seed)).toBe(true);
      expect(headlightsOn(dusk?.dark ?? 0, seed)).toBe(false);
    }
  });
});

describe("своя машина на парковці", () => {
  it("на місці вогні вимкнено; прибуття гальмує й гасне до кінця; від'їзд — з вимкнених, задній хід лише поки задкує", () => {
    expect(PARKED_LIGHTS).toEqual({ head: 0, tail: 0, reverse: 0 });
    const total = 2100;
    expect(arrivalLights(0, total)).toEqual({ head: 1, tail: 1, reverse: 0 });
    // Кінець прибуття — той самий кадр, що на місці.
    expect(arrivalLights(total, total)).toEqual(PARKED_LIGHTS);
    expect(arrivalLights(total + 500, total)).toEqual(PARKED_LIGHTS);
    expect(arrivalLights(total - OWN_LIGHTS.offMs / 2, total).head).toBeGreaterThan(0);
    expect(arrivalLights(total - OWN_LIGHTS.offMs / 2, total).head).toBeLessThan(1);
    // Перший кадр від'їзду — той самий, що на місці.
    expect(departureLights(0)).toEqual(PARKED_LIGHTS);
    const reversing = departureLights((OWN_LIGHTS.onFrom + OWN_LIGHTS.onMs + DEPARTURE.reverse) / 2);
    expect(reversing.head).toBe(1);
    expect(reversing.reverse).toBe(1);
    const away = departureLights(DEPARTURE.reverse + OWN_LIGHTS.reverseOff);
    expect(away.reverse).toBe(0);
    expect(departureLights(DEPARTURE.ms)).toEqual(DRIVING_LIGHTS);
    expect(DRIVING_LIGHTS.tail).toBe(TAIL.running);
    // Монотонно: на прибутті лише гаснуть, на від'їзді фари лише розгоряються.
    for (let ms = 0; ms < total; ms += 10) expect(arrivalLights(ms + 10, total).head).toBeLessThanOrEqual(arrivalLights(ms, total).head);
    for (let ms = 0; ms < DEPARTURE.ms; ms += 10) expect(departureLights(ms + 10).head).toBeGreaterThanOrEqual(departureLights(ms).head);
  });
});

describe("запас відсікання", () => {
  it("`LIGHT_REACH` — не менше від середини машини до кінчика променя будь-якої машини, і більше за довжину машини", () => {
    for (const kind of KINDS) expect(LIGHT_REACH).toBeGreaterThanOrEqual(BEAM.length - CAR_LIGHTS[kind].head.y);
    expect(LIGHT_REACH).toBeGreaterThanOrEqual(BEAM.length);
    expect(LIGHT_REACH).toBeGreaterThan(CAR_REACH);
    // Світло задніх вогнів не сягає далі.
    for (const kind of KINDS) expect(CAR_LIGHTS[kind].tail.y + TAIL.glow * (1 + TAIL.behind)).toBeLessThan(LIGHT_REACH);
  });

  it("вогні гаснуть за краєм кадру до того, як машину відсікає сцена (довжина кадру машини) чи прибирає сим (1 одиниця дороги позаду)", () => {
    for (const height of [720, 390, 900]) {
      const k = raceScale(height);
      expect(lightFade(height / 2, height, k)).toBe(1);
      expect(lightFade(0, height, k)).toBe(1);
      expect(lightFade(height, height, k)).toBe(1);
      expect(lightFade(height + CAR_REACH * k, height, k)).toBeCloseTo(0, 9);
      expect(lightFade(-CAR_REACH * k, height, k)).toBeCloseTo(0, 9);
      expect(lightFade(height + (CAR_REACH * k) / 2, height, k)).toBeGreaterThan(0);
      // Сим прибирає машину позаду, коли вона на одиницю дороги за своєю: там її вогні вже згасли.
      const removed = height * RACE_PLAYER_Y + racePixelsPerUnit(height);
      expect(removed).toBeGreaterThanOrEqual(height + CAR_REACH * k);
      // Сцена гонки відсікає за довжиною кадру машини (84 одиниці арту).
      expect(lightFade(height + 84 * k, height, k)).toBe(0);
      // Дорога додому — з запасом на промінь: гасне за ним.
      expect(lightFade(-LIGHT_REACH * k, height, k, LIGHT_REACH)).toBeCloseTo(0, 9);
      expect(lightFade(-CAR_REACH * k, height, k, LIGHT_REACH)).toBeGreaterThan(0);
    }
  });

  it("дорога додому з запасом `margin` бачить і попутні за краями, чиї фари ще світять у кадр, а без нього — рівно як була", () => {
    const height = 720;
    const k = raceScale(height);
    // Як у сцені: запас понад довжину машини — до `LIGHT_REACH` від краю, де кінчик променя вже за краєм.
    const margin = (LIGHT_REACH - CAR_REACH) * k;
    const lag = (ms: number): number => (HOME_ROAD.camera - HOME_ROAD.traffic) * height * (ms / 1000);
    let extra = 0;
    for (let ms = 0; ms <= HOME_ROAD.ms; ms += 50) {
      const plain = homeRoadFrame(ms, height);
      expect(homeRoadFrame(ms, height, 0)).toEqual(plain);
      const wide = homeRoadFrame(ms, height, margin);
      expect(wide.car).toBe(plain.car);
      expect(wide.camera).toBe(plain.camera);
      expect(wide.dark).toBe(plain.dark);
      for (const car of plain.traffic) expect(wide.traffic).toContainEqual(car);
      for (const car of wide.traffic) expect(car.y).toBeGreaterThan(-LIGHT_REACH * k - 1e-9);
      extra += wide.traffic.length - plain.traffic.length;
      // Попутна над верхнім краєм світить фарами донизу: поки кінчик променя в кадрі, вона є в кадрі з запасом.
      for (const spot of TRAFFIC) {
        const y = spot.y * height - lag(ms);
        const tip = y + (BEAM.length - CAR_LIGHTS.sedan.head.y) * k;
        if (y < 0 && tip > 0) expect(wide.traffic.some((car) => car.lane === spot.lane && Math.abs(car.y - y) < 1e-6)).toBe(true);
      }
    }
    expect(extra).toBeGreaterThan(0);
  });
});

describe("вуличні ліхтарі й парковка", () => {
  const view = { height: 720, k: 1, cx: 640 };
  const period = RACE_TILES.road.period;

  it("плями їдуть разом із дорогою: зсув на крок ряду — ті самі плями, на трохи — ті самі, нижче на стільки ж", () => {
    for (const distance of [0, 37, 250, 1000.5]) {
      const pools = streetPools(distance, view, null);
      expect(pools.length).toBeGreaterThan(0);
      expect(streetPools(distance + period, view, null)).toEqual(pools.map((p) => expect.objectContaining({ x: p.x, y: expect.closeTo(p.y, 6) })));
      const moved = streetPools(distance + 10, view, null);
      const radius = STREET_LAMPS.radius;
      // Ті, що не біля країв (де плями з'являються й зникають), — нижче на 10.
      for (const pool of pools.filter((p) => p.y > -radius + 20 && p.y < view.height + radius - 20)) {
        expect(moved).toContainEqual(expect.objectContaining({ x: pool.x, y: expect.closeTo(pool.y + 10, 6) }));
      }
      for (const pool of pools) {
        expect(pool.y).toBeGreaterThanOrEqual(-radius);
        expect(pool.y).toBeLessThanOrEqual(view.height + radius);
        expect(Math.abs(pool.x - view.cx)).toBe(STREET_LAMPS.x);
      }
      // Обидва боки дороги.
      expect(pools.some((p) => p.x < view.cx)).toBe(true);
      expect(pools.some((p) => p.x > view.cx)).toBe(true);
    }
  });

  it("праворуч біля парковки вуличних немає — там ліхтарі парковки; ліворуч — як були; табличка — у точці `sign` будівлі", () => {
    const lotY = 400;
    for (let distance = 0; distance < period; distance += 31) {
      const free = streetPools(distance, view, null);
      const withLot = streetPools(distance, view, lotY);
      expect(withLot.filter((p) => p.x < view.cx)).toEqual(free.filter((p) => p.x < view.cx));
      for (const pool of withLot.filter((p) => p.x > view.cx)) {
        const inside = pool.y > lotY + LOT_BOUNDS.top && pool.y < lotY + LOT_BOUNDS.bottom;
        expect(inside).toBe(false);
      }
    }
    const pools = lotPools(lotY, view.cx, 1);
    expect(pools.length).toBeGreaterThan(0);
    for (const pool of pools) {
      expect(pool.x).toBeGreaterThan(view.cx);
      expect(pool.y).toBeGreaterThan(lotY + LOT_BOUNDS.top);
      expect(pool.y).toBeLessThan(lotY + LOT_BOUNDS.bottom);
    }
    const sign = signGlow(lotY, view.cx, 2);
    expect(sign.x).toBe(view.cx + SIGN_AT.x * 2);
    expect(sign.y).toBe(lotY + SIGN_AT.y * 2);
  });

  it("світло парковки — поки воно світить у кадр, а не поки в кадрі малюнок парковки: на верхньому краї кадру проступає плавно", () => {
    // Скільки світла парковки (плями ліхтарів і табличка, як їх кладе lightmap) на верхньому рядку кадру (y = 0) праворуч.
    const xs = Array.from({ length: 65 }, (_, i) => view.cx + i * 10);
    const row = (lotY: number): number[] => {
      const { pools, sign } = lotLights(lotY, view);
      return xs.map((x) => {
        let sum = 0;
        for (const pool of pools) sum += pool.alpha * poolAlpha(Math.hypot(x - pool.x, pool.y) / pool.radius);
        if (sign) sum += sign.alpha * poolAlpha(Math.hypot(x - sign.x, sign.y) / sign.radius, 0.5);
        return sum;
      });
    };
    let prev = row(-250);
    expect(Math.max(...prev)).toBe(0);
    let early = false;
    for (let lotY = -250; lotY <= 0; lotY += 0.25) {
      const next = row(lotY);
      for (const [i, value] of next.entries()) expect(Math.abs(value - (prev[i] ?? 0)), `lotY ${lotY}`).toBeLessThan(0.02);
      // Малюнка парковки в кадрі ще немає, а її світло вже лягає на верхній край.
      if (!lotInFrame(lotY, view.height) && Math.max(...next) > 0) early = true;
      prev = next;
    }
    expect(early).toBe(true);
    expect(Math.max(...prev)).toBeGreaterThan(0.3);
    // Далеко за краєм кадру й без парковки — нічого.
    expect(lotLights(-1000, view)).toEqual({ pools: [], sign: null });
    expect(lotLights(view.height + 1000, view)).toEqual({ pools: [], sign: null });
    expect(lotLights(null, view)).toEqual({ pools: [], sign: null });
    // У кадрі — усі плями й табличка.
    expect(lotLights(400, view)).toEqual({ pools: lotPools(400, view.cx, 1), sign: signGlow(400, view.cx, 1) });
  });
});

describe("ніч гонки", () => {
  it("удень (09:30–18:00) — нічого: світла доби немає, ніч гонки — null", () => {
    for (let m = DAYLIGHT.morningEnd; m < DAYLIGHT.eveningStart; m += 5) expect(raceNight(daylight(m, true))).toBeNull();
    expect(raceNight(null)).toBeNull();
  });

  it("на межах дня — як удень (білий тон, ліхтарі не горять), без стрибка; уночі — темний синювато-сірий, увечері — тепліший", () => {
    for (const m of [DAYLIGHT.eveningStart, DAYLIGHT.morningEnd - 1e-6]) {
      const level = raceNight(daylight(m, true));
      if (m === DAYLIGHT.eveningStart) expect(level?.tone).toBe(0xffffff);
      expect(level?.lamps ?? 1).toBeLessThan(0.01);
    }
    const channels = (tone: number): [number, number, number] => [(tone >> 16) & 0xff, (tone >> 8) & 0xff, tone & 0xff];
    const night = raceNight(daylight(23 * 60, true));
    expect(night?.lamps).toBe(1);
    const [r, g, b] = channels(night?.tone ?? 0xffffff);
    expect(b).toBeGreaterThan(r);
    expect(Math.max(r, g, b)).toBeLessThan(160);
    const evening = raceNight(daylight(19 * 60 + 40, true));
    const [er, , eb] = channels(evening?.tone ?? 0);
    expect(er).toBeGreaterThan(eb);
    expect(er).toBeGreaterThan(r);
    // Ліхтарі й табличка вже розгоряються в присмерку.
    expect(evening?.lamps).toBeGreaterThan(0);
    // Відключення електрики — лише в квартирі: дорога та сама.
    expect(raceNight(daylight(22 * 60, false))).toEqual(raceNight(daylight(22 * 60, true)));
  });
});

describe("на яку хвилину світло в поїздці (`tripLightMinute`)", () => {
  it("«Додому ввечері»: на місці — годинник гри; від'їзд — після покупок; дорога додому — частка дороги; кінець — час удома", () => {
    const save = scenario("evening-home-road");
    const state = save.current;
    const trip = state.trip;
    if (!trip) throw new Error("немає поїздки");
    expect(trip.phase).toBe("visit");
    expect(state.minute).toBe(19 * 60 + 50);
    const visit = visitMinutes(trip);
    const road = roadMinutes(state, trip.destination);
    expect(visit).toBe(TRIPS.shop.visit);
    expect(tripLightMinute(state, "drive")).toBe(state.minute);
    expect(tripLightMinute(state, "departure")).toBe(state.minute + visit);
    expect(tripLightMinute(state, "home", 0)).toBe(state.minute + visit);
    expect(tripLightMinute(state, "home", 0.5)).toBe(state.minute + visit + road / 2);
    expect(tripLightMinute(state, "home", 2)).toBe(state.minute + visit + road);
    // Від'їзд починається тим самим кадром, що на місці, і доганяє час після візиту плавно.
    expect(departureLightMinute(state, 0)).toBe(state.minute);
    expect(departureLightMinute(state, OWN_LIGHTS.catchUp)).toBeCloseTo(tripLightMinute(state, "home", OWN_LIGHTS.catchUp / HOME_ROAD.ms));
    let prev = departureLightMinute(state, 0);
    for (let ms = 10; ms <= HOME_ROAD.ms; ms += 10) {
      const minute = departureLightMinute(state, ms);
      expect(minute).toBeGreaterThanOrEqual(prev);
      prev = minute;
    }
    const end = departureLightMinute(state, HOME_ROAD.ms);
    expect(end).toBe(tripLightMinute(state, "home", 1));
    // Наприкінці дороги додому — та сама хвилина, що вдома: тон не стрибає.
    goHome(save);
    expect(save.current.trip).toBeNull();
    expect(save.current.minute).toBeCloseTo(end);
    expect(save.current.minute).toBe(21 * 60 + 5);
    // Удома вже темно, як і наприкінці дороги.
    expect(raceNight(daylight(end, true))?.dark).toBeGreaterThan(0.9);
  });

  it("у ветеринара без послуг — 15 хвилин на місці (`visitMinutes`); шкарпетку шукали — і цей час", () => {
    const save = scenario("vet-visit");
    const state = save.current;
    const trip = state.trip;
    if (!trip) throw new Error("немає поїздки");
    const road = roadMinutes(state, trip.destination);
    expect(tripLightMinute(state, "home", 1)).toBe(state.minute + visitMinutes(trip) + road);
    trip.search = GIFTS.sockSearch;
    expect(tripLightMinute(state, "departure")).toBe(state.minute + visitMinutes(trip) + GIFTS.sockSearch);
    const end = tripLightMinute(state, "home", 1);
    goHome(save);
    expect(save.current.minute).toBeCloseTo(end);
  });

  it("знайду відносять у притулок без поїздки: дорога додому — уже через дві години події", () => {
    const save = scenario("vet-trip");
    const state = save.current;
    state.today.foundling = true;
    state.character.held = null;
    expect(state.trip).toBeNull();
    const end = tripLightMinute(state, "home", 0.5);
    expect(end).toBe(state.minute + MODIFIERS.foundlingShelterMinutes);
    carryFoundling(save);
    expect(save.current.minute).toBeCloseTo(end);
  });
});

describe("сценарії ночі гонки", () => {
  it("«Нічна дорога» — гонка о 21:15 з потоком у сусідніх смугах: вогні світять, у своїй смузі попереду нікого, 2 с без газу — без аварії", () => {
    const save = scenario("night-drive");
    const trip = save.current.trip;
    if (!trip) throw new Error("немає поїздки");
    expect(trip.phase).toBe("drive");
    expect(save.current.minute).toBe(21 * 60 + 15);
    const race = trip.race;
    expect(race.cars.length).toBeGreaterThanOrEqual(4);
    for (const car of race.cars) {
      const ahead = carAt(race, car) - race.done;
      if (car.lane === race.lane) expect(ahead).toBeLessThan(0);
      expect(ahead).toBeGreaterThan(-1);
    }
    const level = raceNight(daylight(save.current.minute, true));
    expect(level?.lamps).toBe(1);
    expect(headlightsOn(level?.dark ?? 0, null)).toBe(true);
    for (let i = 0; i < 20; i++) expect(drive(save, gameMinutes(0.1), NO_RACE_INPUT).result).toBeNull();
    expect(save.current.trip?.phase).toBe("drive");
    expect(save.current.trip?.race.speed).toBeGreaterThan(0);
  });

  it("«Прибуття ввечері» — за мить до фінішу о 19:40: фари вже горять, ліхтарі розгоряються; без газу доїжджає на місце", () => {
    const save = scenario("evening-arrival");
    const trip = save.current.trip;
    if (!trip) throw new Error("немає поїздки");
    expect(trip.phase).toBe("drive");
    expect(trip.destination).toBe("vet");
    expect(save.current.minute).toBe(19 * 60 + 40);
    expect(trip.race.cars.length).toBeGreaterThan(0);
    const level = raceNight(daylight(save.current.minute, true));
    expect(level?.lamps).toBeGreaterThan(0);
    expect(level?.lamps).toBeLessThan(1);
    expect(headlightsOn(level?.dark ?? 0, null)).toBe(true);
    for (let i = 0; i < 200 && save.current.trip?.phase === "drive"; i++) drive(save, gameMinutes(0.05), NO_RACE_INPUT);
    expect(save.current.trip?.phase).toBe("visit");
  });
});
