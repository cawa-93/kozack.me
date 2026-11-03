// Вигляд світла доби (§8.9 «День і ніч», рішення автора 2026-11-02): ніч синьо-сіра й не фіолетова (фіолетовий — серпанок
// низького глузду), база ≈ 0,55 яскравості, у відключення темніше (≈ 0,42); під лампою ≈ 0,95 тепла; свічка тьмяніша за лампу
// й світить ближче, але не цяткою (рішення виконавця 2026-11-03); смуги сонця не яскравіші за 0,35; скло вночі темно-синє. На межах дня план карти світла — тотожність (без стрибка в день), а скло виходить рівно свого
// кольору. Силует квартири охоплює всю підлогу й задні стіни.

import { describe, expect, it } from "vitest";

import { DAYLIGHT } from "../src/sim/config";
import { MAP, MAP_HEIGHT, MAP_WIDTH, OBJECTS, ROOMS } from "../src/sim/home";
import { newGame } from "../src/sim/game";
import type { Vec } from "../src/sim/types";
import { CANDLE_SHELVES, CEILING_LAMPS, PANES } from "../src/view/decor";
import { daylight, type Daylight } from "../src/view/light/daylight";
import { PALETTE } from "../art/palette";
import { CANDLE_LIGHT, CEILING_LIGHT, GLASS, HIGHLIGHT_DARK, luma, POOL_LIFT, POOL_ROUND, rgb, SUN, TONE, type Rgb } from "../src/view/light/lightlook";
import {
  apartmentOutline,
  CELL_RX,
  expandConvex,
  glassLayers,
  glassOf,
  highlightBoost,
  lightAt,
  lightmapKey,
  lightmapPlan,
  paneQuad,
  poolAlphaAt,
  toneOf,
  whitened,
} from "../src/view/light/lightmap";
import { lightSources } from "../src/view/light/sources";
import { isoObjectLook } from "../src/view/world/objects";
import type { Point } from "../src/view/world/part";
import { ISO, ISO_WALLS } from "../src/view/world/projection";

const d = (minute: number, power = true): Daylight => {
  const light = daylight(minute, power);
  if (!light) throw new Error(`о ${minute} світло доби є`);
  return light;
};

const near = (a: Rgb, b: Rgb, eps = 0.01): boolean => Math.abs(a.r - b.r) < eps && Math.abs(a.g - b.g) < eps && Math.abs(a.b - b.b) < eps;

/** Точка всередині опуклого многокутника (обхід — будь-який). */
function inside(points: readonly Point[], p: Point): boolean {
  let sign = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(cross) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

describe("вигляд світла доби", () => {
  it("ніч синьо-сіра, не фіолетова: синій ≥ зелений ≥ червоний; база ≈ 0,55, у відключення ≈ 0,42", () => {
    for (const tone of [TONE.night, TONE.outage]) {
      expect(tone.b).toBeGreaterThanOrEqual(tone.g);
      expect(tone.g).toBeGreaterThanOrEqual(tone.r);
    }
    expect(luma(TONE.night)).toBeGreaterThan(0.5);
    expect(luma(TONE.night)).toBeLessThan(0.6);
    expect(luma(TONE.outage)).toBeGreaterThan(0.38);
    expect(luma(TONE.outage)).toBeLessThan(0.46);
    expect(near(toneOf(d(23 * 60)), TONE.night)).toBe(true);
    expect(near(toneOf(d(23 * 60, false)), TONE.outage)).toBe(true);
  });

  it("під лампою ≈ 0,95, тепло (червоний ≥ зелений ≥ синій); смуги сонця — не більше 0,35", () => {
    const lamp = rgb(CEILING_LIGHT.color);
    expect(luma(lamp)).toBeGreaterThan(0.92);
    expect(luma(lamp)).toBeLessThan(0.98);
    expect(lamp.r).toBeGreaterThanOrEqual(lamp.g);
    expect(lamp.g).toBeGreaterThanOrEqual(lamp.b);
    expect(SUN.add).toBeLessThanOrEqual(0.35);
  });

  it("свічка тьмяніша за лампу й світить ближче, але не цяткою; мерехтить спокійно (рішення виконавця 2026-11-03)", () => {
    // Відключення помітно темніше за ніч при лампах.
    expect(luma(TONE.night) - luma(TONE.outage)).toBeGreaterThan(0.1);
    const candle = rgb(CANDLE_LIGHT.color);
    expect(luma(candle)).toBeLessThan(luma(rgb(CEILING_LIGHT.color)));
    // Тепла, як полум'я: червоний ≥ зелений ≥ синій; світліша за тон відключення, тож біля свічки світлішає.
    expect(candle.r).toBeGreaterThanOrEqual(candle.g);
    expect(candle.g).toBeGreaterThanOrEqual(candle.b);
    expect(luma(candle)).toBeGreaterThan(luma(TONE.outage) + 0.3);
    // Пляма свічки менша за пляму найменшої лампи, але сягає сусідніх клітинок (господар, стіна за ним, підлога поруч).
    const lampReach = Math.min(...CEILING_LAMPS.map((lamp) => lamp.radius * CEILING_LIGHT.spread));
    expect(CANDLE_LIGHT.radius).toBeLessThan(lampReach);
    expect(CANDLE_LIGHT.radius).toBeGreaterThanOrEqual(1.8);
    expect(CANDLE_LIGHT.poolCore).toBeLessThanOrEqual(CEILING_LIGHT.core);
    // Мерехтіння: яскравість спадає щонайбільше на 10 % (від 1 до 1 − flicker, `candleFlicker`) і не частіше ≈ 4 разів на секунду.
    expect(CANDLE_LIGHT.flicker).toBeLessThanOrEqual(0.1);
    expect(CANDLE_LIGHT.flickerStep).toBeGreaterThanOrEqual(250);
  });

  it("відключення зі свічкою на поличці в кожній кімнаті — темніше за ніч із лампами: у кожній кімнаті й у квартирі загалом", () => {
    // Середня яскравість карти світла на підлозі (центри клітинок кімнати) о 23:00: зі світлом — стельові лампи, бра й
    // настільна лампа, у відключення — свічки на поличках (рішення автора 2026-11-03: по одній у кожній кімнаті) і свічка на
    // столі з комп'ютером замість лампи.
    const s = newGame({ address: "she", difficulty: "normal", seed: 1 }).current;
    const mean = (outage: boolean, room: (typeof ROOMS)[number] | null): number => {
      s.modifiers.day = outage ? "outage" : null;
      const light = d(23 * 60, !outage);
      const plan = lightmapPlan(light, lightSources(s, light), PANES, 0);
      let sum = 0;
      let n = 0;
      for (const r of room ? [room] : ROOMS) {
        for (let x = r.x; x < r.x + r.w; x++) {
          for (let y = r.y; y < r.y + r.h; y++) {
            sum += luma(lightAt(plan, ISO.toScreen({ x: x + 0.5, y: y + 0.5 })));
            n++;
          }
        }
      }
      return sum / n;
    };
    for (const room of ROOMS) expect(mean(false, room) - mean(true, room), room.id).toBeGreaterThan(0.2);
    expect(mean(false, null) - mean(true, null)).toBeGreaterThan(0.2);
    // Але біля свічки світліше, ніж у темряві тону відключення: на стіні під поличкою й на підлозі перед нею тепло.
    s.modifiers.day = "outage";
    const dark = d(23 * 60, false);
    const plan = lightmapPlan(dark, lightSources(s, dark), PANES, 0);
    for (const shelf of CANDLE_SHELVES) {
      const out = (o: number): Vec => (shelf.face === "y" ? { x: shelf.at.x, y: 1 + o } : { x: 1 + o, y: shelf.at.y });
      const wall = ISO.toScreen(shelf.at);
      expect(luma(lightAt(plan, { x: wall.x, y: wall.y - shelf.z + 40 })), `${shelf.room}: стіна під поличкою`).toBeGreaterThan(luma(TONE.outage) + 0.2);
      expect(luma(lightAt(plan, ISO.toScreen(out(0.5)))), `${shelf.room}: підлога перед поличкою`).toBeGreaterThan(luma(TONE.outage) + 0.08);
    }
  });

  it("свічка світить лише у своїй кімнаті: на видимих підлозі й задніх стінах інших кімнат — щонайбільше ≈ 0,03 яскравості (рецензія 2026-11-03)", () => {
    // Карта світла плям за кімнатами не обрізає, а внутрішні стіни на екрані — лише заввишки 66: пляма свічки біля сусідньої
    // кімнати лягала на її стіну (поличка спальні за 0,65 клітинки від стіни ряду 5 — ліва стіна вітальні світлішала на 0,11–0,21,
    // хоч бра вітальні у відключення погашені). Свічка на столі з комп'ютером (рішення автора 2026-11-03: на столі замість
    // лампи) стоїть біля стіни ряду 5, за якою спальня й ванна, — теж (її пляма тягнеться до підлоги перед столом,
    // `DESK_CANDLE.pool`). Перевіряємо кожну свічку окремо, о 23:00 (повна сила), лише там, де поверхню видно: від точки до
    // камери (x + t, y + t, z + 64t) не заступає ні внутрішня чи передня стіна, ні річ квартири (сховища, що з'являються не
    // завжди, і ящики — не заступають: так перевіряється більше точок).
    const s = newGame({ address: "she", difficulty: "normal", seed: 1 }).current;
    s.modifiers.day = "outage";
    const dark = d(23 * 60, false);
    const boxes: { x0: number; y0: number; x1: number; y1: number; h: number }[] = [];
    MAP.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c !== "#" || y === 0 || x === 0) return;
        const front = y === MAP_HEIGHT - 1 || x === MAP_WIDTH - 1;
        boxes.push({ x0: x, y0: y, x1: x + 1, y1: y + 1, h: front ? ISO_WALLS.plinth : ISO_WALLS.inner });
      }),
    );
    for (const o of OBJECTS) {
      if (o.requires || o.walkable) continue;
      const look = isoObjectLook(o.id);
      boxes.push({ ...look.footprint, h: look.tall });
    }
    /** Промінь до камери з точки (x, y, z) не входить у жодну з коробок (t > 0). */
    const visible = (x: number, y: number, z: number): boolean =>
      boxes.every((b) => {
        const t0 = Math.max(1e-6, b.x0 - x, b.y0 - y);
        const t1 = Math.min(b.x1 - x, b.y1 - y, (b.h - z) / 64);
        return t0 >= t1;
      });
    const sources = lightSources(s, dark).filter((source) => source.kind === "candle");
    expect(sources).toHaveLength(CANDLE_SHELVES.length + 1);
    for (const source of sources) {
      const plan = lightmapPlan(dark, [source], PANES, 0);
      const base = luma(plan.tone);
      let worst = { add: 0, where: "" };
      const probe = (room: string, at: Vec, z: number): void => {
        if (!visible(at.x, at.y, z)) return;
        const p = ISO.toScreen(at);
        const add = luma(lightAt(plan, { x: p.x, y: p.y - z })) - base;
        if (add > worst.add) worst = { add, where: `${room} (${at.x.toFixed(2)}; ${at.y.toFixed(2)}), z ${z}` };
      };
      for (const r of ROOMS) {
        if (r.id === source.room) continue;
        for (let i = 0; i <= r.w * 10; i++) for (let j = 0; j <= r.h * 10; j++) probe(`підлога ${r.id}`, { x: r.x + i / 10, y: r.y + j / 10 }, 0);
        for (let z = 0; z <= ISO_WALLS.back; z += 5) {
          if (r.y === 1) for (let i = 0; i <= r.w * 20; i++) probe(`задня стіна ${r.id}`, { x: r.x + i / 20, y: 1 }, z);
          if (r.x === 1) for (let j = 0; j <= r.h * 20; j++) probe(`ліва стіна ${r.id}`, { x: 1, y: r.y + j / 20 }, z);
        }
      }
      expect(worst.add, `${source.id} (${source.room}): ${worst.where}`).toBeLessThanOrEqual(0.03);
    }
  });

  it("пляма свічки на карті — радіуса `CANDLE_LIGHT.radius`, з повним світлом до `poolCore`, кругліша й між підлогою та полум'ям", () => {
    const s = newGame({ address: "she", difficulty: "normal", seed: 1 }).current;
    s.modifiers.day = "outage";
    const dark = d(23 * 60, false);
    const sources = lightSources(s, dark).filter((source) => source.kind === "candle");
    expect(sources.length).toBeGreaterThan(0);
    const plan = lightmapPlan(dark, sources, PANES, 0);
    // Тепла пляма свічки — її кольору (мала пляма полум'я — `coreColor`), не за ядром: ядро можна підбирати, а 0,3 — це вже
    // ядро плями полум'я.
    const warm = rgb(CANDLE_LIGHT.color);
    const pools = plan.pools.filter((pool) => near(pool.color, warm, 1e-9));
    expect(pools).toHaveLength(sources.length);
    for (const source of sources) {
      // Центр — на `POOL_LIFT` шляху від точки підлоги під свічкою до полум'я: тепло й на господареві, і на підлозі.
      const floor = ISO.toScreen(source.at);
      const x = floor.x + (source.screen.x - floor.x) * POOL_LIFT;
      const y = floor.y + (source.screen.y - floor.y) * POOL_LIFT;
      const pool = pools.find((p) => Math.hypot(p.x - x, p.y - y) < 1e-6);
      expect(pool, source.id).toBeDefined();
      if (!pool) continue;
      expect(pool.rx, source.id).toBeCloseTo(CANDLE_LIGHT.radius * CELL_RX, 6);
      expect(pool.ry / pool.rx, source.id).toBeCloseTo(POOL_ROUND.raised, 6);
      expect(pool.core, source.id).toBe(CANDLE_LIGHT.poolCore);
    }
    // Піднята пляма кругліша за пляму на підлозі.
    expect(POOL_ROUND.raised).toBeGreaterThan(POOL_ROUND.floor);
  });

  it("яскравість карти в точці (`lightAt`) — як її малюють: повна в ядрі плями, спадає за `POOL_FALLOFF`, за краєм — тон", () => {
    const pool = { x: 100, y: 50, rx: 40, ry: 20, core: 0.3, color: rgb(0xfff0d6), alpha: 0.8 };
    expect(poolAlphaAt(pool, { x: 100, y: 50 })).toBeCloseTo(0.8, 9);
    expect(poolAlphaAt(pool, { x: 100 + 40 * 0.3, y: 50 })).toBeCloseTo(0.8, 9);
    // Посередині спаду (0,3 + 0,7 · 0,5 радіуса) — 0,4 від `alpha`; по вертикалі — у ry.
    expect(poolAlphaAt(pool, { x: 100 + 40 * 0.65, y: 50 })).toBeCloseTo(0.8 * 0.4, 9);
    expect(poolAlphaAt(pool, { x: 100, y: 50 + 20 * 0.65 })).toBeCloseTo(0.8 * 0.4, 9);
    expect(poolAlphaAt(pool, { x: 140, y: 50 })).toBe(0);
    const tone = TONE.outage;
    const plan = { tone, pools: [pool], strips: [] };
    expect(near(lightAt(plan, { x: 300, y: 50 }), tone, 1e-9)).toBe(true);
    // У ядрі — тон, ближчий до кольору плями на її `alpha` (`lighten`: світлішає лише те, що темніше за пляму).
    const center = lightAt(plan, { x: 100, y: 50 });
    for (const ch of ["r", "g", "b"] as const) expect(center[ch]).toBeCloseTo(tone[ch] + 0.8 * (Math.max(tone[ch], pool.color[ch]) - tone[ch]), 9);
  });

  it("підсвітка цілі в темряві сильніша й світліша за яскравістю карти на ній; удень і під лампою — без змін (рецензія 2026-11-03)", () => {
    const s = newGame({ address: "she", difficulty: "normal", seed: 1 }).current;
    const lit = d(23 * 60);
    const night = lightmapPlan(lit, lightSources(s, lit), PANES, 0);
    // Посередині плями лампи — майже повне світло: сяйво як удень.
    const lamp = CEILING_LAMPS[3]!;
    const under = highlightBoost(luma(lightAt(night, ISO.toScreen(lamp.at))));
    expect(under.strength).toBeLessThan(1.1);
    expect(highlightBoost(1)).toEqual({ strength: 1, whiten: 0 });
    expect(whitened(0xf3d27a, 0)).toBe(0xf3d27a);
    // Поза лампами вночі — ×1,8, у відключення — ×2,4 і найсвітліше (`HIGHLIGHT_DARK`).
    const corner = highlightBoost(luma(TONE.night));
    expect(corner.strength).toBeCloseTo(1 / luma(TONE.night), 6);
    expect(corner.strength).toBeGreaterThan(1.7);
    const outage = highlightBoost(luma(TONE.outage));
    expect(outage.strength).toBeCloseTo(Math.min(HIGHLIGHT_DARK.boost, 1 / luma(TONE.outage)), 6);
    expect(outage.strength).toBeGreaterThan(2.3);
    expect(outage.whiten).toBeGreaterThan(corner.whiten);
    expect(outage.whiten).toBeLessThanOrEqual(HIGHLIGHT_DARK.whiten);
    expect(highlightBoost(0.1)).toEqual(highlightBoost(0));
    // Під множенням на тон відключення світліше сяйво яскравіше за жовте.
    const t = TONE.outage;
    const glow = (color: number): number => {
      const c = rgb(color);
      return luma({ r: c.r * t.r, g: c.g * t.g, b: c.b * t.b });
    };
    const yellow = Number.parseInt(PALETTE.highlight.slice(1), 16);
    expect(glow(whitened(yellow, outage.whiten))).toBeGreaterThan(glow(yellow) * 1.1);
  });

  it("світанок і вечір — різні відтінки: вечір помаранчевіший", () => {
    const sat = (c: Rgb): number => c.r - c.b;
    expect(sat(TONE.evening)).toBeGreaterThan(sat(TONE.morning));
  });

  it("на межах дня карта — тотожність: тон і скло білі, плям і смуг немає", () => {
    const white = { r: 1, g: 1, b: 1 };
    for (const minute of [DAYLIGHT.eveningStart, DAYLIGHT.morningEnd - 0.01]) {
      const light = d(minute);
      expect(near(toneOf(light), white, 0.005), String(minute)).toBe(true);
      expect(near(glassOf(light), white, 0.005), String(minute)).toBe(true);
      const plan = lightmapPlan(light, lightSources(newGame({ address: "she", difficulty: "normal", seed: 1 }).current, light), PANES, 0);
      expect(plan.pools, String(minute)).toEqual([]);
      for (const strip of plan.strips) expect(strip.alpha, String(minute)).toBeLessThan(0.01);
    }
  });

  it("скло вночі темно-синє; на світанку тепле; шар скла під картою (лише тон) дає шибці рівно колір скла", () => {
    const night = glassOf(d(23 * 60));
    expect(night.b).toBeGreaterThan(night.r);
    expect(luma(night)).toBeLessThan(0.3);
    expect(near(night, GLASS.night)).toBe(true);
    const dawn = glassOf(d(7 * 60));
    expect(dawn.r).toBeGreaterThan(dawn.b);
    let warmer = 0;
    for (const minute of [23 * 60, 5 * 60 + 10, 6 * 60 + 30, 7 * 60, 8 * 60, 19 * 60, 19 * 60 + 30, 20 * 60 + 30]) {
      for (const power of [true, false]) {
        const light = d(minute, power);
        const tone = toneOf(light);
        const glass = glassOf(light);
        const { mul, add } = glassLayers(tone, glass);
        for (const ch of ["r", "g", "b"] as const) {
          expect(mul[ch]).toBeLessThanOrEqual(1);
          expect(add[ch]).toBeGreaterThanOrEqual(0);
          expect(add[ch]).toBeLessThanOrEqual(1);
          // Додаток — лише там, де множник не темнить: одне з двох.
          if (add[ch] > 0) expect(mul[ch]).toBe(1);
          // Шибка на малюнку (`GLASS.art`): шар скла, потім карта (тон) — рівно шибка × скло.
          expect(tone[ch] * (GLASS.art[ch] * mul[ch] + add[ch]), `${minute} ${ch}`).toBeCloseTo(GLASS.art[ch] * glass[ch], 6);
        }
        if (add.r + add.g + add.b > 0) warmer++;
      }
    }
    // На світанку й увечері тепле скло світліше за тон кімнати — тоді шар скла додає світло.
    expect(warmer).toBeGreaterThan(0);
  });

  it("у карті світла немає скла: над вікном (і над котом на підвіконні перед ним) — лише тон", () => {
    const s = newGame({ address: "she", difficulty: "normal", seed: 1 }).current;
    const light = d(19 * 60 + 30);
    const plan = lightmapPlan(light, lightSources(s, light), PANES, 0);
    expect(Object.keys(plan).sort()).toEqual(["pools", "strips", "tone"]);
    // Смуги сонця в карті лише трохи світлішають те, що в них стоїть (видиму смугу на підлозі дає додавання під меблями).
    expect(SUN.lift).toBeLessThanOrEqual(0.4);
    for (const strip of plan.strips) expect(strip.alpha).toBeLessThanOrEqual(SUN.lift);
  });

  it("силует квартири охоплює підлогу й задні стіни, з полем; отвори вікон — усередині", () => {
    const outline = apartmentOutline();
    const h = ISO_WALLS.back;
    for (const [x, y, z] of [
      [0, 0, h],
      [MAP_WIDTH, 0, h],
      [MAP_WIDTH, MAP_HEIGHT, 0],
      [0, MAP_HEIGHT, 0],
      [0, MAP_HEIGHT, h],
      [10, 6, 0],
    ] as const) {
      const p = ISO.toScreen({ x, y });
      expect(inside(outline, { x: p.x, y: p.y - z }), `${x},${y},${z}`).toBe(true);
    }
    for (const pane of PANES) for (const p of paneQuad(pane)) expect(inside(outline, p), pane.room).toBe(true);
    // Далеко за межами — ні.
    expect(inside(outline, { x: 0, y: 0 })).toBe(false);
  });

  it("розширення опуклого многокутника: квадрат 2 × 2 з полем 1 — квадрат 4 × 4", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];
    for (const points of [square, [...square].reverse()]) {
      const grown = expandConvex(points, 1);
      const xs = grown.map((p) => p.x);
      const ys = grown.map((p) => p.y);
      expect(Math.min(...xs)).toBeCloseTo(-1);
      expect(Math.max(...xs)).toBeCloseTo(3);
      expect(Math.min(...ys)).toBeCloseTo(-1);
      expect(Math.max(...ys)).toBeCloseTo(3);
    }
  });

  it("ключ карти: той самий кадр — той самий ключ; свічки мерехтять кроками, лампи — ні", () => {
    const s = newGame({ address: "she", difficulty: "normal", seed: 1 }).current;
    const lit = d(23 * 60);
    const sources = lightSources(s, lit);
    expect(lightmapKey(lit, sources, 0)).toBe(lightmapKey(lit, sources, 10_000));
    s.modifiers.day = "outage";
    const dark = d(23 * 60, false);
    const candles = lightSources(s, dark);
    expect(lightmapKey(dark, candles, 0)).toBe(lightmapKey(dark, candles, 100));
    expect(lightmapKey(dark, candles, 0)).not.toBe(lightmapKey(dark, candles, 300));
  });
});
