// Гонка в новій графіці (крок 16, пакет A14; §8.5): розкладка плиток дороги й узбіччя, смуги, вигляд машин потоку, смуга
// прогресу (`src/view/racelook.ts`) — і що самі плитки (`art/race/*.svg`) справді повторюються без шва з тим кроком, на який
// розраховує розкладка (`RACE_TILES`).

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { PALETTE } from "../art/palette";
import { RACE, TRIPS } from "../src/sim/config";
import { artEntry } from "../src/view/art/manifest";
import { RACE_TILES } from "../src/view/art/manifest/a14-race";
import {
  barMarkerY,
  barParts,
  DESTINATION_ROOFS,
  laneX,
  racePixelsPerUnit,
  raceScale,
  RACE_ART_HEIGHT,
  RACE_MARKER_SCALE,
  rowFlipped,
  scrollOffset,
  steerTilt,
  tileRows,
  TRAFFIC_COLORS,
  TRAFFIC_KINDS,
  trafficLook,
  vergeColumns,
} from "../src/view/racelook";

const ART_DIR = fileURLToPath(new URL("../art/", import.meta.url));

describe("масштаб гонки", () => {
  it("на полотні 720 арт — 1 px на одиницю, а дорога — як у старому вигляді (216 px на одиницю)", () => {
    expect(raceScale(RACE_ART_HEIGHT)).toBe(1);
    expect(racePixelsPerUnit(720)).toBeCloseTo(216);
    // Вище полотно збільшує арт і дорогу однаково: машина займає ту саму частку дороги, що й зіткнення.
    for (const height of [720, 960, 1080]) expect(racePixelsPerUnit(height) / raceScale(height)).toBeCloseTo(216);
    // Довжина зіткнення — кузов на малюнку (58 одиниць): машина не в'їжджає в іншу без аварії.
    expect(Math.abs(58 / racePixelsPerUnit(720) - RACE.carLength)).toBeLessThan(0.01);
  });
});

describe("плитки, що біжать донизу", () => {
  it("зсув — від 0 до кроку, і для від'ємної відстані", () => {
    expect(scrollOffset(0, 496)).toBe(0);
    expect(scrollOffset(500, 496)).toBe(4);
    expect(scrollOffset(-4, 496)).toBe(492);
    expect(scrollOffset(10, 0)).toBe(0);
  });

  it("ряди вкривають усю висоту, з кроком плитки, і зсуваються вниз, коли машина їде вперед", () => {
    for (const distance of [0, 37, 495, 496, 10_000.5, -20]) {
      const rows = tileRows(distance, 496, 720).map((row) => row.y);
      expect(rows[0]).toBeLessThanOrEqual(0);
      expect(rows.at(-1)! + 496).toBeGreaterThanOrEqual(720);
      for (let i = 1; i < rows.length; i++) expect(rows[i]! - rows[i - 1]!).toBeCloseTo(496);
    }
    expect(tileRows(10, 496, 720)[0]!.y - tileRows(0, 496, 720)[0]!.y).toBeCloseTo(10);
    expect(tileRows(0, 0, 720)).toEqual([]);
  });

  it("номер ряду їде разом з плиткою (і через межу кроку), а сусідні ряди віддзеркалені по-різному", () => {
    for (const [from, to] of [
      [0, 10],
      [490, 502],
      [991.5, 993],
      [-30, 40],
      [123_456.25, 123_700],
    ] as const) {
      const before = tileRows(from, 496, 720);
      const after = tileRows(to, 496, 720);
      for (const row of before) {
        const moved = after.find((other) => Math.abs(other.y - (row.y + to - from)) < 1e-6);
        if (moved) expect(moved.n, `${from} → ${to}, ряд ${row.y}`).toBe(row.n);
      }
      for (let i = 1; i < before.length; i++) {
        expect(before[i - 1]!.n - before[i]!.n).toBe(1);
        expect(rowFlipped(before[i]!.n)).not.toBe(rowFlipped(before[i - 1]!.n));
      }
    }
    expect([-2, -1, 0, 1, 2].map(rowFlipped)).toEqual([false, true, false, true, false]);
  });

  it("стовпці узбіччя вкривають полотно обабіч дороги, не заходять далеко під дорогу й перекриваються краями", () => {
    const { period, top, bottom } = RACE_TILES.verge;
    const half = (bottom - top) / 2;
    for (const [width, height] of [
      [1280, 720],
      [1558, 720],
      [1280, 960],
      [2560, 720],
    ] as const) {
      const k = raceScale(height);
      const cx = width / 2;
      const columns = vergeColumns(width, cx, k);
      for (const side of [-1, 1]) {
        const mine = columns.filter((c) => Math.sign(c.x - cx) === side).sort((a, b) => Math.abs(a.x - cx) - Math.abs(b.x - cx));
        expect(mine.length).toBeGreaterThan(0);
        // Перший стовпець — під самим бордюром (трава заходить під нього, а не під асфальт).
        const inner = Math.abs(mine[0]!.x - cx) - half * k;
        expect(inner).toBeLessThanOrEqual(RACE_TILES.road.curb * k);
        expect(inner).toBeGreaterThan((RACE_TILES.road.curb - 24) * k);
        // Сусідні — з кроком плитки (перекриття — смуга трави), останній доходить до краю полотна.
        for (let i = 1; i < mine.length; i++) expect(Math.abs(mine[i]!.x - mine[i - 1]!.x)).toBeCloseTo(period * k);
        const outer = Math.abs(mine.at(-1)!.x - cx) + half * k;
        expect(outer).toBeGreaterThanOrEqual(cx);
        for (const column of mine) expect(column.phase >= 0 && column.phase < 1).toBe(true);
      }
      // Сусідні стовпці віддзеркалені по-різному: поле не повторюється рядами.
      expect(new Set(columns.map((c) => c.flip)).size).toBe(2);
    }
  });
});

describe("машини", () => {
  it("смуги — по 96 одиниць від середини дороги, середня — посередині", () => {
    expect(laneX(640, 1, 1)).toBe(640);
    expect(laneX(640, 0, 1)).toBe(640 - RACE_TILES.road.lane);
    expect(laneX(640, 2, 1.5)).toBe(640 + RACE_TILES.road.lane * 1.5);
    expect(laneX(640, 1.5, 1)).toBe(640 + RACE_TILES.road.lane / 2);
  });

  it("своя машина нахиляється в бік смуги, куди перестроюється, а в смузі стоїть рівно", () => {
    expect(steerTilt(1, 1)).toBe(0);
    expect(steerTilt(1.2, 2)).toBeGreaterThan(0);
    expect(steerTilt(1.8, 1)).toBeLessThan(0);
    expect(Math.abs(steerTilt(0, 2))).toBe(Math.abs(steerTilt(0, 1)));
  });

  it("вигляд машини потоку — сталий для місця на дорозі, з усіх видів і кольорів", () => {
    const kinds = new Set<string>();
    const colors = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const start = 1 + i * 0.377;
      const look = trafficLook({ start });
      expect(trafficLook({ start })).toEqual(look);
      expect(TRAFFIC_KINDS).toContain(look.kind);
      expect(look.color >= 0 && look.color < TRAFFIC_COLORS.length).toBe(true);
      kinds.add(look.kind);
      colors.add(look.color);
    }
    expect(kinds.size).toBe(TRAFFIC_KINDS.length);
    expect(colors.size).toBe(TRAFFIC_COLORS.length);
    const negative = trafficLook({ start: -0.3 });
    expect(negative.color >= 0 && TRAFFIC_KINDS.includes(negative.kind)).toBe(true);
  });

  it("кольори потоку — з палітри арту, і серед них немає червоного своєї машини", () => {
    const palette = new Set(Object.values(PALETTE).map((hex) => Number.parseInt(hex.slice(1), 16)));
    for (const color of TRAFFIC_COLORS) expect(palette.has(color)).toBe(true);
    for (const red of [PALETTE.red, PALETTE.redHi, PALETTE.redLo]) expect(TRAFFIC_COLORS).not.toContain(Number.parseInt(red.slice(1), 16));
    expect(artEntry("race/car/traffic")?.states).toEqual([...TRAFFIC_KINDS]);
  });
});

describe("дах будівлі пункту (§8.5 «На місці — кадр парковки», STYLE §11 race)", () => {
  const hex = (color: string): number => Number.parseInt(color.slice(1), 16);

  it("кожен пункт — свій колір: дах разом з іконкою на табличці каже, куди приїхали", () => {
    expect(Object.keys(DESTINATION_ROOFS).sort()).toEqual(Object.keys(TRIPS).sort());
    const roofs = Object.values(DESTINATION_ROOFS);
    expect(new Set(roofs).size).toBe(roofs.length);
  });

  it("лише основні тони барвистих сімей і картону чи дерева — не green і не grey: дах не зливається з узбіччям і асфальтом", () => {
    const allowed = new Set([PALETTE.red, PALETTE.pink, PALETTE.orange, PALETTE.mustard, PALETTE.teal, PALETTE.blue, PALETTE.plum, PALETTE.cardboard, PALETTE.wood].map(hex));
    const forbidden = [PALETTE.green, PALETTE.greenHi, PALETTE.greenLo, PALETTE.grey, PALETTE.greyHi, PALETTE.greyLo, PALETTE.dark, PALETTE.carpet].map(hex);
    for (const [destination, roof] of Object.entries(DESTINATION_ROOFS)) {
      expect(allowed.has(roof), destination).toBe(true);
      expect(forbidden, destination).not.toContain(roof);
    }
  });
});

describe("смуга прогресу трьома частинами", () => {
  const frameH = 96;
  const slice = 22;

  it("краї — у масштабі арту, середина розтягнута рівно на решту висоти", () => {
    const { top, middle, bottom } = barParts(100, 500, 1, frameH, slice);
    expect(top).toEqual({ y: 100, scaleY: 1, cropY: 0, cropH: slice });
    expect(bottom.scaleY).toBe(1);
    expect(bottom.cropY).toBe(frameH - slice);
    // Низ кадру — рівно на низу смуги; верх нижнього краю — там, де кінчається середина.
    expect(bottom.y + frameH * bottom.scaleY).toBeCloseTo(600);
    expect(middle).not.toBeNull();
    expect(middle!.y + slice * middle!.scaleY).toBeCloseTo(100 + slice);
    expect(middle!.y + (frameH - slice) * middle!.scaleY).toBeCloseTo(600 - slice);
    expect(middle!.cropH).toBe(frameH - 2 * slice);
  });

  it("масштаб k збільшує краї; смуга, коротша за два краї, стискає їх навпіл і обходиться без середини", () => {
    const big = barParts(0, 600, 1.5, frameH, slice);
    expect(big.top.scaleY).toBe(1.5);
    expect(big.middle!.y + slice * big.middle!.scaleY).toBeCloseTo(slice * 1.5);
    const short = barParts(10, 30, 1, frameH, slice);
    expect(short.middle).toBeNull();
    expect(short.top.scaleY * slice).toBeCloseTo(15);
    expect(short.bottom.y + frameH * short.bottom.scaleY).toBeCloseTo(40);
    expect(short.bottom.y + (frameH - slice) * short.bottom.scaleY).toBeCloseTo(25);
  });

  it("своя машинка — на межі пройденого, а біля кінців смуги не виходить за заокруглення", () => {
    expect(barMarkerY(100, 500, 0.5, 1)).toBeCloseTo(350);
    expect(barMarkerY(100, 500, 0.3, 1)).toBeCloseTo(450);
    // Старт і фініш: машинка тримається за півмашинки від кінців (і так само для частки поза 0…1).
    const start = barMarkerY(100, 500, 0, 1);
    const finish = barMarkerY(100, 500, 1, 1);
    expect(start).toBeLessThan(600);
    expect(start).toBeGreaterThan(600 - 58 * RACE_MARKER_SCALE);
    expect(finish).toBeGreaterThan(100);
    expect(finish).toBeLessThan(100 + 58 * RACE_MARKER_SCALE);
    expect(barMarkerY(100, 500, -1, 1)).toBe(start);
    expect(barMarkerY(100, 500, 2, 1)).toBe(finish);
    // Чим далі проїхали, тим вище машинка; на дуже короткій смузі — посередині.
    expect(barMarkerY(100, 500, 0.6, 1)).toBeLessThan(barMarkerY(100, 500, 0.4, 1));
    expect(barMarkerY(100, 10, 0.9, 2)).toBeCloseTo(105);
  });

  it("точка `slice` кадру — межа верхнього краю, і середина кадру однакова по вертикалі", async () => {
    const entry = artEntry("race/progress");
    expect(entry?.size.h).toBe(frameH);
    expect(entry?.points?.["slice"]?.y).toBe(slice);
    for (const state of entry?.states ?? []) {
      const { data, info } = await raster("race/progress.svg", 4, state);
      // Кожен рядок середини (22…74) такий самий, як перший рядок середини.
      const row = (y: number): Buffer => data.subarray(y * info.width * 4, (y + 1) * info.width * 4);
      const first = row(slice * 4 + 1);
      for (let y = slice * 4 + 1; y < (frameH - slice) * 4 - 1; y++) expect(maxDelta(row(y), first), `${state}, рядок ${y / 4}`).toBeLessThanOrEqual(2);
    }
  });
});

/** Растр SVG з `art/` у `scale` пікселів на одиницю (стан — як у конвеєрі: решту `st-*` сховано). */
async function raster(file: string, scale: number, state?: string): Promise<{ data: Buffer; info: { width: number; height: number } }> {
  let text = readFileSync(path.join(ART_DIR, file), "utf8");
  if (state) text = text.replace(/<svg([^>]*)>/, `<svg$1><style>[class*="st-"]{display:none}.st-${state}{display:inline}</style>`);
  return sharp(Buffer.from(text), { density: 72 * scale }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

/** Найбільша різниця каналів двох однакових за розміром шматків растру. */
function maxDelta(a: Buffer, b: Buffer): number {
  let max = 0;
  for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs((a[i] ?? 0) - (b[i] ?? 0)));
  return max;
}

describe("плитки арту повторюються без шва (art/race/road.svg, verge.svg)", () => {
  it("вміст — рівно top…bottom, а смуга перекриття вгорі така сама, як унизу (зсув на крок)", async () => {
    for (const [file, tile] of [
      ["race/road.svg", RACE_TILES.road],
      ["race/verge.svg", RACE_TILES.verge],
    ] as const) {
      const scale = 2;
      const { data, info } = await raster(file, scale);
      const rowBytes = info.width * 4;
      const row = (y: number): Buffer => data.subarray(y * rowBytes, (y + 1) * rowBytes);
      const opaque = (y: number): boolean => {
        const r = row(y);
        for (let i = 3; i < r.length; i += 4) if ((r[i] ?? 0) > 8) return true;
        return false;
      };
      expect(opaque(tile.top * scale - 1), `${file}: над вмістом`).toBe(false);
      expect(opaque(tile.top * scale), `${file}: перший рядок вмісту`).toBe(true);
      expect(opaque(tile.bottom * scale - 1), `${file}: останній рядок вмісту`).toBe(true);
      expect(opaque(tile.bottom * scale), `${file}: під вмістом`).toBe(false);
      for (let y = tile.top * scale; y < tile.bottom * scale - tile.period * scale; y++) {
        expect(maxDelta(row(y), row(y + tile.period * scale)), `${file}: рядок ${y / scale} і ${y / scale + tile.period}`).toBeLessThanOrEqual(3);
      }
    }
  }, 30_000);

  it("смуги перекриття симетричні відносно середини (pivot): ряд плиток можна віддзеркалити без шва", async () => {
    for (const [file, id, tile] of [
      ["race/road.svg", "race/road", RACE_TILES.road],
      ["race/verge.svg", "race/verge", RACE_TILES.verge],
    ] as const) {
      const scale = 2;
      const { data, info } = await raster(file, scale);
      const cx = (artEntry(id)?.pivot.x ?? 0) * scale;
      let worst = 0;
      for (const y0 of [tile.top, tile.top + tile.period]) {
        for (let y = y0 * scale; y < (y0 + tile.bottom - tile.top - tile.period) * scale; y++) {
          for (let x = 0; x < info.width; x++) {
            const mirror = 2 * cx - 1 - x;
            if (mirror < 0 || mirror >= info.width) continue;
            for (let ch = 0; ch < 4; ch++) {
              worst = Math.max(worst, Math.abs((data[(y * info.width + x) * 4 + ch] ?? 0) - (data[(y * info.width + mirror) * 4 + ch] ?? 0)));
            }
          }
        }
      }
      expect(worst, file).toBeLessThanOrEqual(3);
    }
  });

  it("біля бокових країв узбіччя — лише трава: стовпці можна зсувати й віддзеркалювати", async () => {
    const scale = 2;
    const { data, info } = await raster("race/verge.svg", scale);
    const grass = [PALETTE.green.slice(1, 3), PALETTE.green.slice(3, 5), PALETTE.green.slice(5, 7)].map((h) => Number.parseInt(h, 16));
    const { top, bottom, edge } = RACE_TILES.verge;
    const W = artEntry("race/verge")?.size.w ?? 512;
    let bad = 0;
    for (let y = top * scale + 1; y < bottom * scale - 1; y++) {
      for (const [x0, x1] of [
        [top * scale + 1, edge * scale],
        [(W - edge) * scale, (W - top) * scale - 1],
      ] as const) {
        for (let x = x0; x < x1; x++) {
          const i = (y * info.width + x) * 4;
          if (grass.some((c, ch) => Math.abs((data[i + ch] ?? 0) - c) > 2)) bad++;
        }
      }
    }
    expect(bad).toBe(0);
  });

  it("узбіччя під парковкою (стан plain, §8.5 «На місці — кадр парковки») — та сама плитка без дерев, кущів і їхніх тіней: краї й смуги перекриття ті самі", async () => {
    expect(artEntry("race/verge")?.states).toEqual(["full", "plain"]);
    // Лише дерева з кущами й їхні тіні — у стані full; решта шматків (трава, пучки, квіти, камінці, кротовина) — в обох.
    const text = readFileSync(path.join(ART_DIR, "race/verge.svg"), "utf8");
    const pieces = [...text.matchAll(/<g id="(p-[a-z-]+)"([^>]*)>/g)].map(([, id, attrs]) => [id, /class="([^"]*)"/.exec(attrs ?? "")?.[1] ?? null] as const);
    expect(pieces.filter(([, cls]) => cls !== null)).toEqual([
      ["p-shadows", "st-full"],
      ["p-trees", "st-full"],
    ]);
    const scale = 2;
    const full = await raster("race/verge.svg", scale, "full");
    const plain = await raster("race/verge.svg", scale, "plain");
    const { top, bottom, period, edge } = RACE_TILES.verge;
    const width = full.info.width;
    const delta = (x: number, y: number): number => {
      const i = (y * width + x) * 4;
      let max = 0;
      for (let ch = 0; ch < 4; ch++) max = Math.max(max, Math.abs((full.data[i + ch] ?? 0) - (plain.data[i + ch] ?? 0)));
      return max;
    };
    // Краї (бокові смуги трави й смуги перекриття вгорі й унизу) — до пікселя ті самі: стани стикуються між собою без шва.
    let edges = 0;
    let inside = 0;
    for (let y = 0; y < full.info.height; y++) {
      for (let x = 0; x < width; x++) {
        const band = y < (top + bottom - period) * scale || y >= (top + period) * scale || x < edge * scale || x >= width - edge * scale;
        if (band) edges = Math.max(edges, delta(x, y));
        else if (delta(x, y) > 8) inside++;
      }
    }
    expect(edges).toBeLessThanOrEqual(3);
    // А всередині дерев і кущів справді немає: різниться чимала частина плитки.
    expect(inside / (width * full.info.height)).toBeGreaterThan(0.1);
  });
});
