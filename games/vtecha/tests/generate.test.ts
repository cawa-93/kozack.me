import { describe, expect, it } from "vitest";
import {
  DOORS_PER_LEVEL,
  EXIT_MIN_DISTANCE_FACTOR,
  HOLES_PER_SPIDER,
  ITEMS_PER_LEVEL,
  ITEM_MAX_PATH_FACTOR,
  ITEM_MIN_START_DISTANCE,
  SPIDERS_PER_LEVEL,
  SPIDER_ANCHOR_LEVEL,
  SPIDER_MIN_START_DISTANCE,
  SPIDER_NEAR_EXIT,
  SPIDER_NEAR_START,
  WALL_LAMPS_PER_LEVEL,
  WEBS_PER_LEVEL,
  WEB_MIN_SPACING,
  WEB_MIN_START_DISTANCE,
} from "../src/config";
import { CellGraph } from "../src/maze/cellgraph";
import { generateLevel } from "../src/maze/generate";
import { T, cellTileX, cellTileY, type Corner } from "../src/maze/grid";
import type { LevelData } from "../src/maze/level";

// §5.2: «1000 згенерованих лабіринтів усіх 5 розмірів → 100 % проходження».
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const RUNS = Number(env.GEN_RUNS ?? 1000);

function playerGraph(level: LevelData): CellGraph {
  return new CellGraph(level.w, level.h, (tx, ty) => {
    const t = level.map.get(tx, ty);
    return t === T.Floor || t === T.Door;
  });
}

function spiderGraphClosedDoors(level: LevelData): CellGraph {
  return new CellGraph(level.w, level.h, (tx, ty) => {
    const t = level.map.get(tx, ty);
    return t === T.Floor || t === T.Hole;
  });
}

function cellOf(level: LevelData, x: number, y: number): number {
  return ((Math.floor(y) - 1) / 2) * level.w + (Math.floor(x) - 1) / 2;
}

function checkLevel(level: LevelData): void {
  const pg = playerGraph(level);
  // Крок 4: два вершинно-незалежні шляхи до виходу (§5.2).
  expect(pg.vertexDisjointPaths(level.startCell, level.exitCell, 2)).toBe(2);

  // §5.3: мінімальна відстань старт→вихід.
  const dist = pg.distances(level.startCell);
  expect(dist[level.exitCell]).toBeGreaterThanOrEqual(EXIT_MIN_DISTANCE_FACTOR * (level.w + level.h));

  // §6.2: шлях без павутини.
  const webs = new Set(level.webs);
  expect(pg.shortestPath(level.startCell, level.exitCell, (id) => webs.has(id))).not.toBeNull();

  // Павутина: кількість, відстані.
  expect(level.webs.length).toBe(WEBS_PER_LEVEL[level.index]);
  for (const w of level.webs) {
    expect(dist[w]).toBeGreaterThanOrEqual(WEB_MIN_START_DISTANCE);
    expect(w).not.toBe(level.exitCell);
    const dw = pg.distances(w);
    for (const other of level.webs) if (other !== w) expect(dw[other]).toBeGreaterThanOrEqual(WEB_MIN_SPACING);
  }

  // Світильники: рівно задана кількість працюючих, 2 вказівники.
  const lit = level.lamps.filter((l) => l.lit);
  expect(lit.length).toBe(WALL_LAMPS_PER_LEVEL[level.index]);
  expect(lit.filter((l) => l.pointer).length).toBe(2);
  for (const l of level.lamps) expect(level.map.get(l.tx, l.ty)).toBe(T.Wall);

  // Двері.
  const doors = [...level.map.doors.values()].filter((d) => !d.isCameraRubble);
  expect(doors.length).toBe(DOORS_PER_LEVEL[level.index]);
  for (const d of doors) expect(d.open).toBe(false);

  // Отвори.
  expect(level.holes.length).toBe(SPIDERS_PER_LEVEL[level.index] * HOLES_PER_SPIDER);

  // Гарантія для павуків: граф павука зв'язний навіть за всіх зачинених дверей.
  if (SPIDERS_PER_LEVEL[level.index] > 0) expect(spiderGraphClosedDoors(level).isConnected()).toBe(true);

  // Павуки: кількість і відстань від старту (за найкоротшим можливим шляхом павука).
  expect(level.spiders.length).toBe(SPIDERS_PER_LEVEL[level.index]);
  const sgOpen = new CellGraph(level.w, level.h, (tx, ty) => {
    const t = level.map.get(tx, ty);
    return t === T.Floor || t === T.Hole || t === T.Door;
  });
  const sd = sgOpen.distances(level.startCell);
  for (const s of level.spiders) expect(sd[cellOf(level, s.x, s.y)]).toBeGreaterThanOrEqual(SPIDER_MIN_START_DISTANCE);
  if (level.index === SPIDER_ANCHOR_LEVEL) {
    // Рівень 5: один павук біля входу, один біля виходу (§6).
    const se = sgOpen.distances(level.exitCell);
    const cells = level.spiders.map((s) => cellOf(level, s.x, s.y));
    expect(cells.some((c) => sd[c] >= SPIDER_NEAR_START[0] && sd[c] <= SPIDER_NEAR_START[1])).toBe(true);
    expect(cells.some((c) => se[c] >= SPIDER_NEAR_EXIT[0] && se[c] <= SPIDER_NEAR_EXIT[1])).toBe(true);
    expect(new Set(cells).size).toBe(cells.length);
  }

  // Предмети.
  if (level.index === 0) {
    expect(level.items.map((i) => i.type)).toEqual(["dynamo"]);
  } else {
    const found = level.items.filter((i) => i.type !== "antidote");
    expect(found.length).toBeGreaterThanOrEqual(ITEMS_PER_LEVEL[0]);
    expect(found.length).toBeLessThanOrEqual(ITEMS_PER_LEVEL[1]);
    // Кожен предмет (і протиотрута) — у своїй клітинці (§6).
    const cells = level.items.map((it) => cellOf(level, it.x, it.y));
    expect(new Set(cells).size).toBe(cells.length);
    expect(level.items.some((i) => i.type === "antidote")).toBe(level.index === 1);
    for (const it of level.items) {
      const c = cellOf(level, it.x, it.y);
      expect(dist[c]).toBeGreaterThanOrEqual(ITEM_MIN_START_DISTANCE);
      expect(dist[c]).toBeLessThanOrEqual(ITEM_MAX_PATH_FACTOR * (level.shortestPath.length - 1));
    }
  }
}

describe("генерація рівнів (§5.2, §6)", () => {
  for (let levelIndex = 0; levelIndex < 5; levelIndex++) {
    it(`рівень ${levelIndex + 1}: ${RUNS} лабіринтів проходять усі перевірки`, () => {
      let corner: Corner | null = levelIndex === 0 ? null : 0;
      for (let seed = 1; seed <= RUNS; seed++) {
        if (levelIndex > 0) corner = (seed % 4) as Corner;
        checkLevel(generateLevel(seed * 7919, levelIndex, corner));
      }
    });
  }

  it("рівень 1: камера за межами лабіринту, завал у проломі, одні двері на найкоротшому шляху", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const level = generateLevel(seed, 0, null);
      const c = cellTileX(level.startCell % level.w);
      expect(level.startCell).toBe(Math.floor(level.w / 2));
      expect(level.map.get(c, 0)).toBe(T.Door);
      const rubble = level.map.door(c, 0)!;
      expect(rubble.variant).toBe("rubble");
      expect(rubble.isCameraRubble).toBe(true);
      expect(level.map.get(c, -3)).toBe(T.Bars);
      expect(level.map.get(c, -1)).toBe(T.Floor);
      expect(level.spawn.y).toBeLessThan(0);
      // Одні двері — на найкоротшому шляху.
      const path = level.shortestPath;
      let onPath = false;
      for (let j = 0; j + 1 < path.length; j++) {
        const a = path[j];
        const b = path[j + 1];
        const tx = (a % level.w) + (b % level.w) + 1;
        const ty = Math.floor(a / level.w) + Math.floor(b / level.w) + 1;
        if (level.map.get(tx, ty) === T.Door) onPath = true;
      }
      expect(onPath).toBe(true);
      void cellTileY;
    }
  });

  it("відтворюваність за seed: той самий runSeed дає ті самі рівні (§5.1)", () => {
    for (let levelIndex = 0; levelIndex < 5; levelIndex++) {
      const a = generateLevel(123456, levelIndex, levelIndex === 0 ? null : 2);
      const b = generateLevel(123456, levelIndex, levelIndex === 0 ? null : 2);
      expect(Array.from(a.map.tiles)).toEqual(Array.from(b.map.tiles));
      expect(a.webs).toEqual(b.webs);
      expect(a.lamps).toEqual(b.lamps);
      expect(a.items).toEqual(b.items);
      expect(a.spiders).toEqual(b.spiders);
      expect(a.attempt).toBe(b.attempt);
      const c = generateLevel(654321, levelIndex, levelIndex === 0 ? null : 2);
      expect(Array.from(c.map.tiles)).not.toEqual(Array.from(a.map.tiles));
    }
  });

  it("рівень 5: пролом у зовнішній стіні поруч із кутовою клітинкою виходу (§5.5)", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const l5 = generateLevel(seed, 4, (seed % 4) as Corner);
      const b = l5.breach!;
      expect(b).not.toBeNull();
      expect(l5.map.get(b.tx, b.ty)).toBe(T.Breach);
      expect(b.tx === 0 || b.tx === 2 * l5.w).toBe(true);
      const ex = cellTileX(l5.exitCell % l5.w);
      const ey = cellTileY(Math.floor(l5.exitCell / l5.w));
      expect(Math.abs(b.tx - ex)).toBe(1);
      expect(b.ty).toBe(ey);
      expect(l5.map.walkablePlayer(b.tx, b.ty)).toBe(true);
      expect(l5.map.walkableSpider(b.tx, b.ty)).toBe(false);
      expect(l5.map.opaque(b.tx, b.ty)).toBe(false);
    }
    for (let lvl = 0; lvl < 4; lvl++) expect(generateLevel(7, lvl, lvl === 0 ? null : 1).breach).toBeNull();
  });

  it("старт наступного рівня — у куті виходу попереднього (§5.3)", () => {
    const l1 = generateLevel(42, 0, null);
    const l2 = generateLevel(42, 1, l1.exitCorner);
    const corner = l1.exitCorner;
    const expected = {
      cx: corner === 1 || corner === 3 ? l2.w - 1 : 0,
      cy: corner === 2 || corner === 3 ? l2.h - 1 : 0,
    };
    expect(l2.startCell).toBe(expected.cy * l2.w + expected.cx);
    expect(l2.exitCorner).not.toBe(corner);
  });
});

describe("предмети рівня (§7.3.4)", () => {
  it("на рівнях 2–5 трапляються і 2, і 3 предмети", () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) {
      for (let li = 1; li < 5; li++) counts.add(generateLevel(seed, li, 0).items.filter((i) => i.type !== "antidote").length);
    }
    expect([...counts].sort()).toEqual([2, 3]);
  });
});

describe("полиці складу рівня 1 (§5.7)", () => {
  it("частина перегородок — полиці; стіни зі світильниками й стовпи обабіч дверей — кладка", () => {
    let total = 0;
    let candidates = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const level = generateLevel(seed, 0, null);
      const map = level.map;
      const W = 2 * level.w;
      const H = 2 * level.h;
      const lamps = new Set(level.lamps.map((l) => map.key(l.tx, l.ty)));
      for (const l of level.lamps) expect(map.get(l.tx, l.ty)).toBe(T.Wall);
      for (const d of map.doors.values()) {
        // Стовпи, до яких кріпляться двері, — уздовж лінії дверей.
        const vertical = d.ty % 2 === 0;
        for (const s of [-1, 1]) {
          const t = vertical ? map.get(d.tx + s, d.ty) : map.get(d.tx, d.ty + s);
          expect(t === T.Wall || t === T.Void).toBe(true);
        }
      }
      for (let ty = 0; ty <= H; ty++) {
        for (let tx = 0; tx <= W; tx++) {
          const t = map.get(tx, ty);
          const partition = (tx % 2 === 0) !== (ty % 2 === 0);
          const inner = tx > 0 && ty > 0 && tx < W && ty < H;
          if (partition && inner && (t === T.Wall || t === T.Shelf) && !lamps.has(map.key(tx, ty))) candidates++;
          if (t !== T.Shelf) continue;
          total++;
          expect(inner).toBe(true);
          const shelf = map.shelves.get(map.key(tx, ty))!;
          expect(shelf.rects.length).toBeGreaterThan(4); // стояки + речі
          expect(map.opaque(tx, ty)).toBe(false);
          expect(map.walkablePlayer(tx, ty)).toBe(false);
          expect(map.walkableSpider(tx, ty)).toBe(false);
          expect(map.blocksProjectile(tx, ty)).toBe(true);
          expect(map.lightOccluders(tx, ty)).toBe(shelf.rects);
        }
      }
    }
    // Приблизно половина кандидатів (плюс стовпи між полицями).
    expect(total / candidates).toBeGreaterThan(0.4);
    expect(total / candidates).toBeLessThan(0.75);
  });

  it("на рівнях 2–5 полиць немає", () => {
    for (let li = 1; li < 5; li++) expect(generateLevel(3, li, 0).map.shelves.size).toBe(0);
  });
});
