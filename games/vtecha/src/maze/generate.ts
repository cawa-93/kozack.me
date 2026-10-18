// Генерація рівня: пайплайн §5.2 і розміщення об'єктів §6.
// Генерація повністю детермінована (§5.1): кожна спроба бере seed hash(runSeed, рівень, спроба).

import {
  BRAID_RATE,
  DOORS_PER_LEVEL,
  DOOR_MIN_SPACING,
  EXIT_MIN_DISTANCE_FACTOR,
  FINDABLE_ITEMS,
  HOLES_PER_SPIDER,
  ITEMS_PER_LEVEL,
  ITEM_MAX_PATH_FACTOR,
  ITEM_MIN_START_DISTANCE,
  MAZE_SIZE,
  PLACEMENT_ATTEMPTS,
  POINTER_WINDOWS,
  SPIDERS_PER_LEVEL,
  SPIDER_ANCHOR_LEVEL,
  SPIDER_MIN_START_DISTANCE,
  SPIDER_NEAR_EXIT,
  SPIDER_NEAR_START,
  START_CELL_PREFAB,
  WALL_LAMPS_PER_LEVEL,
  WALL_LAMP_MIN_SPACING,
  WEBS_PER_LEVEL,
  WEB_MIN_SPACING,
  WEB_MIN_START_DISTANCE,
} from "../config";
import { Rng, hashSeed } from "../core/rng";
import { CellGraph, edgeKey } from "./cellgraph";
import {
  DIRS,
  T,
  TileMap,
  cellTileX,
  cellTileY,
  cornerCell,
  cornerOfCell,
  type Corner,
  type DoorVariant,
} from "./grid";
import type { ItemSpawn, LampSpawn, LevelData, SpiderSpawn } from "./level";
import { placeShelves } from "./shelves";

/** Рядків префаба камери над лабіринтом на рівні 1 (§5.4): ряди −5..−1. */
const PREFAB_ROWS = 5;
const MAX_ATTEMPTS = 500;

class GenerationFailed extends Error {}

export function generateLevel(runSeed: number, levelIndex: number, startCorner: Corner | null): LevelData {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = new Rng(hashSeed(runSeed, levelIndex, attempt));
    try {
      return new LevelBuilder(rng, runSeed, levelIndex, attempt, startCorner).build();
    } catch (e) {
      if (!(e instanceof GenerationFailed)) throw e;
    }
  }
  throw new Error(`Не вдалося згенерувати рівень ${levelIndex + 1} за ${MAX_ATTEMPTS} спроб`);
}

export function doorVariantForLevel(levelIndex: number): DoorVariant {
  if (levelIndex === 0) return "wood";
  if (levelIndex <= 2) return "grate";
  return "rubble";
}

class LevelBuilder {
  private readonly w: number;
  private readonly h: number;
  private readonly map: TileMap;
  private readonly isTutorial: boolean;
  private startCell = 0;
  private exitCell = 0;
  private exitCorner: Corner = 0;
  private path: number[] = [];
  private readonly lamps: LampSpawn[] = [];
  private readonly webs: number[] = [];
  private readonly holes: { tx: number; ty: number }[] = [];
  private nextDoorId = 1;

  constructor(
    private readonly rng: Rng,
    private readonly runSeed: number,
    private readonly level: number,
    private readonly attempt: number,
    private readonly startCorner: Corner | null,
  ) {
    this.w = MAZE_SIZE[level];
    this.h = MAZE_SIZE[level];
    this.isTutorial = level === 0;
    const extra = this.isTutorial ? PREFAB_ROWS : 0;
    this.map = new TileMap(0, -extra, 2 * this.w + 1, 2 * this.h + 1 + extra);
    for (let ty = 0; ty < 2 * this.h + 1; ty++) {
      for (let tx = 0; tx < 2 * this.w + 1; tx++) this.map.set(tx, ty, T.Wall);
    }
    for (let cy = 0; cy < this.h; cy++) {
      for (let cx = 0; cx < this.w; cx++) this.map.set(cellTileX(cx), cellTileY(cy), T.Floor);
    }
  }

  build(): LevelData {
    this.carvePerfectMaze();
    this.braid();
    this.chooseStartAndExit();
    this.removeBridgesOnCriticalPath();
    this.verifyExitDistance(); // петлі кроку 3 могли скоротити шлях
    this.verifyTwoPaths();
    this.carveHoles();
    if (this.isTutorial) this.buildCameraPrefab();

    const pg = this.playerGraph();
    this.path = pg.shortestPath(this.startCell, this.exitCell)!;
    this.placePointerLamps(pg);
    this.placeOtherLamps(pg);
    this.placeWebs(pg);
    this.placeDoors(pg);
    const items = this.placeItems(pg);
    const spiders = this.placeSpiders();
    this.verifyWebBypass(); // крок 7 — фінальний gate
    // Рівень 1 — склад: частина перегородок стає полицями, останніми на кроці 6 (§5.7).
    if (this.isTutorial) placeShelves(this.map, this.w, this.h, this.lamps, this.rng);
    const breach = this.level === 4 ? this.carveBreach() : null;

    return {
      index: this.level,
      runSeed: this.runSeed,
      attempt: this.attempt,
      w: this.w,
      h: this.h,
      map: this.map,
      startCell: this.startCell,
      exitCell: this.exitCell,
      exitCorner: this.exitCorner,
      breach,
      shortestPath: this.path,
      spawn: this.spawnPoint(),
      webs: this.webs,
      lamps: this.lamps,
      holes: this.holes,
      items,
      spiders,
    };
  }

  // ---------- графи ----------

  /** Граф гравця: прохід — підлога або двері (гравець їх відчиняє). */
  private playerGraph(): CellGraph {
    return new CellGraph(this.w, this.h, (tx, ty) => {
      const t = this.map.get(tx, ty);
      return t === T.Floor || t === T.Door;
    });
  }

  /** Граф павука з усіма дверима відчиненими — найкоротші можливі шляхи павука. */
  private spiderGraphOpenDoors(): CellGraph {
    return new CellGraph(this.w, this.h, (tx, ty) => {
      const t = this.map.get(tx, ty);
      return t === T.Floor || t === T.Hole || t === T.Door;
    });
  }

  private cellId(cx: number, cy: number): number {
    return cy * this.w + cx;
  }

  private connectorTile(a: number, b: number): { tx: number; ty: number } {
    const ax = a % this.w;
    const ay = Math.floor(a / this.w);
    const bx = b % this.w;
    const by = Math.floor(b / this.w);
    return { tx: ax + bx + 1, ty: ay + by + 1 };
  }

  // ---------- крок 1: ідеальний лабіринт ----------

  private carvePerfectMaze(): void {
    const visited = new Uint8Array(this.w * this.h);
    const start = this.cellId(this.rng.int(0, this.w - 1), this.rng.int(0, this.h - 1));
    const stack = [start];
    visited[start] = 1;
    while (stack.length > 0) {
      const cur = stack[stack.length - 1];
      const cx = cur % this.w;
      const cy = Math.floor(cur / this.w);
      const options: number[] = [];
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
        if (!visited[this.cellId(nx, ny)]) options.push(this.cellId(nx, ny));
      }
      if (options.length === 0) {
        stack.pop();
        continue;
      }
      const next = this.rng.pick(options);
      const c = this.connectorTile(cur, next);
      this.map.set(c.tx, c.ty, T.Floor);
      visited[next] = 1;
      stack.push(next);
    }
  }

  // ---------- крок 2: брейдинг ----------

  private braid(): void {
    const rate = BRAID_RATE[this.level];
    const order = this.rng.shuffle([...Array(this.w * this.h).keys()]);
    for (const id of order) {
      if (this.openNeighbors(id).length !== 1) continue; // тупик
      if (!this.rng.chance(rate)) continue;
      const closed = this.closedNeighbors(id);
      if (closed.length === 0) continue;
      const other = this.rng.pick(closed);
      const c = this.connectorTile(id, other);
      this.map.set(c.tx, c.ty, T.Floor);
    }
  }

  private openNeighbors(id: number): number[] {
    return this.neighbors(id).filter((n) => {
      const c = this.connectorTile(id, n);
      return this.map.get(c.tx, c.ty) === T.Floor;
    });
  }

  private closedNeighbors(id: number): number[] {
    return this.neighbors(id).filter((n) => {
      const c = this.connectorTile(id, n);
      return this.map.get(c.tx, c.ty) === T.Wall;
    });
  }

  private neighbors(id: number): number[] {
    const cx = id % this.w;
    const cy = Math.floor(id / this.w);
    const out: number[] = [];
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && ny >= 0 && nx < this.w && ny < this.h) out.push(this.cellId(nx, ny));
    }
    return out;
  }

  // ---------- §5.3: старт і вихід ----------

  private chooseStartAndExit(): void {
    if (this.isTutorial) {
      this.startCell = this.cellId(Math.floor(this.w / 2), 0);
    } else {
      const c = cornerCell(this.startCorner ?? 0, this.w, this.h);
      this.startCell = this.cellId(c.cx, c.cy);
    }
    const startCornerHere = cornerOfCell(
      { cx: this.startCell % this.w, cy: Math.floor(this.startCell / this.w) },
      this.w,
      this.h,
    );
    const corners = this.rng.shuffle(([0, 1, 2, 3] as Corner[]).filter((c) => c !== startCornerHere));
    const dist = this.playerGraph().distances(this.startCell);
    const minDist = EXIT_MIN_DISTANCE_FACTOR * (this.w + this.h);
    for (const corner of corners) {
      const c = cornerCell(corner, this.w, this.h);
      const id = this.cellId(c.cx, c.cy);
      if (dist[id] >= minDist) {
        this.exitCell = id;
        this.exitCorner = corner;
        return;
      }
    }
    throw new GenerationFailed("exit too close");
  }

  // ---------- крок 3: примусові петлі на критичному шляху ----------

  private removeBridgesOnCriticalPath(): void {
    for (let guard = 0; guard < 400; guard++) {
      const g = this.playerGraph();
      const path = g.shortestPath(this.startCell, this.exitCell)!;
      const bridges = g.bridges();
      const n = g.size;
      let bridge: [number, number] | null = null;
      for (let i = 0; i + 1 < path.length; i++) {
        if (bridges.has(edgeKey(path[i], path[i + 1], n))) {
          bridge = [path[i], path[i + 1]];
          break;
        }
      }
      if (!bridge) return;
      // Компонента A — клітинки, досяжні з bridge[0] без ребра-мосту.
      const [u, v] = bridge;
      const inA = new Uint8Array(n);
      const queue = [u];
      inA[u] = 1;
      for (let h = 0; h < queue.length; h++) {
        const a = queue[h];
        for (const b of g.adj[a]) {
          if ((a === u && b === v) || (a === v && b === u) || inA[b]) continue;
          inA[b] = 1;
          queue.push(b);
        }
      }
      const candidates: { tx: number; ty: number }[] = [];
      for (let a = 0; a < n; a++) {
        if (!inA[a]) continue;
        for (const b of this.closedNeighbors(a)) {
          if (!inA[b]) candidates.push(this.connectorTile(a, b));
        }
      }
      if (candidates.length === 0) throw new GenerationFailed("no loop candidate");
      const c = this.rng.pick(candidates);
      this.map.set(c.tx, c.ty, T.Floor);
    }
    throw new GenerationFailed("bridge removal did not converge");
  }

  private verifyExitDistance(): void {
    const dist = this.playerGraph().distances(this.startCell);
    if (dist[this.exitCell] < EXIT_MIN_DISTANCE_FACTOR * (this.w + this.h)) throw new GenerationFailed("exit too close after loops");
  }

  // ---------- крок 4: два вершинно-незалежні шляхи ----------

  private verifyTwoPaths(): void {
    const g = this.playerGraph();
    if (g.vertexDisjointPaths(this.startCell, this.exitCell, 2) < 2) throw new GenerationFailed("less than two paths");
  }

  // ---------- крок 5: отвори ----------

  private carveHoles(): void {
    const count = SPIDERS_PER_LEVEL[this.level] * HOLES_PER_SPIDER;
    if (count === 0) return;
    const candidates: { tx: number; ty: number }[] = [];
    for (let a = 0; a < this.w * this.h; a++) {
      if (a === this.startCell) continue;
      for (const b of this.closedNeighbors(a)) {
        if (b < a || b === this.startCell) continue;
        candidates.push(this.connectorTile(a, b));
      }
    }
    this.rng.shuffle(candidates);
    if (candidates.length < count) throw new GenerationFailed("not enough hole candidates");
    for (const c of candidates.slice(0, count)) {
      this.map.set(c.tx, c.ty, T.Hole);
      this.holes.push(c);
    }
  }

  // ---------- §5.5: пролом назовні на рівні 5 ----------

  /** Тайл зовнішньої стіни, суміжний із кутовою клітинкою виходу по горизонталі, стає проломом. */
  private carveBreach(): { tx: number; ty: number } {
    const cx = this.exitCell % this.w;
    const cy = Math.floor(this.exitCell / this.w);
    const tx = cx === 0 ? 0 : 2 * this.w;
    const ty = cellTileY(cy);
    this.map.set(tx, ty, T.Breach);
    return { tx, ty };
  }

  // ---------- §5.4: префаб стартової камери ----------

  private buildCameraPrefab(): void {
    const c = cellTileX(this.startCell % this.w); // стовпець стартової клітинки й пролому
    const put = (tx: number, ty: number, t: (typeof T)[keyof typeof T]) => this.map.set(tx, ty, t);
    const half = Math.floor(START_CELL_PREFAB.corridorLength / 2); // 3
    // ряд −5: глуха кладка; ряд −4: коридор (декор) з кладкою на кінцях
    for (let x = c - half - 1; x <= c + half + 1; x++) put(x, -5, T.Wall);
    put(c - half - 1, -4, T.Wall);
    put(c + half + 1, -4, T.Wall);
    for (let x = c - half; x <= c + half; x++) put(x, -4, T.Floor);
    // ряд −3: ґрати на всю ширину камери, кладка з боків
    const halfCell = Math.floor(START_CELL_PREFAB.width / 2); // 1
    for (let x = c - half - 1; x <= c + half + 1; x++) {
      put(x, -3, Math.abs(x - c) <= halfCell ? T.Bars : T.Wall);
    }
    // ряди −2..−1: камера 3×2 з боковими стінами
    for (let y = -START_CELL_PREFAB.depth; y <= -1; y++) {
      put(c - halfCell - 1, y, T.Wall);
      put(c + halfCell + 1, y, T.Wall);
      for (let x = c - halfCell; x <= c + halfCell; x++) put(x, y, T.Floor);
    }
    // ряд 0: пролом у зовнішній стіні, закритий завалом
    this.addDoor(c, 0, "rubble", true);
  }

  private addDoor(tx: number, ty: number, variant: DoorVariant, isCameraRubble: boolean): void {
    this.map.set(tx, ty, T.Door);
    this.map.doors.set(this.map.key(tx, ty), {
      id: this.nextDoorId++,
      tx,
      ty,
      variant,
      open: false,
      isCameraRubble,
    });
  }

  // ---------- §6.1: світильники ----------

  private wallsOfCell(cell: number): { tx: number; ty: number; nx: number; ny: number }[] {
    const ctx = cellTileX(cell % this.w);
    const cty = cellTileY(Math.floor(cell / this.w));
    const out: { tx: number; ty: number; nx: number; ny: number }[] = [];
    for (const [dx, dy] of DIRS) {
      const tx = ctx + dx;
      const ty = cty + dy;
      if (this.map.get(tx, ty) !== T.Wall) continue;
      if (this.lamps.some((l) => l.tx === tx && l.ty === ty)) continue;
      out.push({ tx, ty, nx: -dx, ny: -dy });
    }
    return out;
  }

  private lampSpacingOk(pg: CellGraph, cell: number): boolean {
    const spacing = WALL_LAMP_MIN_SPACING[this.level];
    if (this.lamps.length === 0) return true;
    const dist = pg.distances(cell);
    return this.lamps.every((l) => dist[l.cell] >= spacing);
  }

  private addLamp(cell: number, wall: { tx: number; ty: number; nx: number; ny: number }, pointer: boolean): void {
    this.lamps.push({ ...wall, cell, pointer, lit: true });
  }

  private placePointerLamps(pg: CellGraph): void {
    const L = this.path.length - 1;
    for (const [a, b] of POINTER_WINDOWS) {
      const lo = Math.max(1, Math.ceil(a * L));
      const hi = Math.min(L - 1, Math.floor(b * L));
      const junctionCells: number[] = [];
      const plainCells: number[] = [];
      for (let j = lo; j <= hi; j++) {
        if (pg.degree(this.path[j]) >= 3 && j + 1 <= L) junctionCells.push(this.path[j + 1]);
        plainCells.push(this.path[j]);
      }
      const ordered = [...this.rng.shuffle(junctionCells), ...this.rng.shuffle(plainCells)];
      let placed = false;
      for (const cell of ordered.slice(0, PLACEMENT_ATTEMPTS)) {
        if (cell === this.exitCell || cell === this.startCell) continue;
        const walls = this.wallsOfCell(cell);
        if (walls.length === 0 || !this.lampSpacingOk(pg, cell)) continue;
        this.addLamp(cell, this.rng.pick(walls), true);
        placed = true;
        break;
      }
      if (!placed) throw new GenerationFailed("pointer lamp");
    }
  }

  private placeOtherLamps(pg: CellGraph): void {
    const total = WALL_LAMPS_PER_LEVEL[this.level];
    while (this.lamps.length < total) {
      let placed = false;
      for (let t = 0; t < PLACEMENT_ATTEMPTS; t++) {
        const cell = this.rng.int(0, this.w * this.h - 1);
        if (cell === this.exitCell) continue; // біля виходу окремого світильника немає
        const walls = this.wallsOfCell(cell);
        if (walls.length === 0 || !this.lampSpacingOk(pg, cell)) continue;
        this.addLamp(cell, this.rng.pick(walls), false);
        placed = true;
        break;
      }
      if (!placed) throw new GenerationFailed("lamp");
    }
    // Рівень 3: згаслі смолоскипи — декор поза лімітом (§11.2).
    if (this.level === 2) {
      for (let i = 0; i < total; i++) {
        const cell = this.rng.int(0, this.w * this.h - 1);
        const walls = this.wallsOfCell(cell);
        if (walls.length > 0) this.lamps.push({ ...this.rng.pick(walls), cell, pointer: false, lit: false });
      }
    }
  }

  // ---------- павутина й гарантований обхід (§6.2) ----------

  private bypassExists(pg: CellGraph, webs: number[]): boolean {
    const blocked = new Set(webs);
    return pg.shortestPath(this.startCell, this.exitCell, (id) => blocked.has(id)) !== null;
  }

  private placeWebs(pg: CellGraph): void {
    const count = WEBS_PER_LEVEL[this.level];
    if (count === 0) return;
    const dist = pg.distances(this.startCell);
    const onPath = new Set(this.path);
    const priority: number[] = [];
    const other: number[] = [];
    for (let id = 0; id < pg.size; id++) {
      if (id === this.startCell || id === this.exitCell) continue;
      if (dist[id] < WEB_MIN_START_DISTANCE) continue;
      (pg.degree(id) >= 3 || onPath.has(id) ? priority : other).push(id);
    }
    const candidates = [...this.rng.shuffle(priority), ...this.rng.shuffle(other)];
    for (let n = 0; n < count; n++) {
      let placed = false;
      let tries = 0;
      for (const cell of candidates) {
        if (this.webs.includes(cell)) continue;
        if (tries++ >= PLACEMENT_ATTEMPTS) break;
        const d = pg.distances(cell);
        if (this.webs.some((w) => d[w] < WEB_MIN_SPACING)) continue;
        if (!this.bypassExists(pg, [...this.webs, cell])) continue;
        this.webs.push(cell);
        placed = true;
        break;
      }
      if (!placed) throw new GenerationFailed("web");
    }
  }

  private verifyWebBypass(): void {
    if (!this.bypassExists(this.playerGraph(), this.webs)) throw new Error("Генератор порушив гарантію обходу павутини");
  }

  // ---------- двері (§5.6, §6) ----------

  private placeDoors(pg: CellGraph): void {
    const count = DOORS_PER_LEVEL[this.level];
    const variant = doorVariantForLevel(this.level);
    const hasSpiders = SPIDERS_PER_LEVEL[this.level] > 0;
    const webSet = new Set(this.webs);
    const doorCells: number[][] = [];

    type Cand = { a: number; b: number; tx: number; ty: number };
    const all: Cand[] = [];
    for (let a = 0; a < pg.size; a++) {
      for (const b of pg.adj[a]) {
        if (b < a) continue;
        const c = this.connectorTile(a, b);
        if (this.map.get(c.tx, c.ty) !== T.Floor) continue;
        all.push({ a, b, ...c });
      }
    }
    const isCorridor = (id: number) => pg.degree(id) === 2;
    const valid = (c: Cand, relaxCorridor: boolean): boolean => {
      if (!relaxCorridor && !(isCorridor(c.a) && isCorridor(c.b))) return false;
      if (webSet.has(c.a) || webSet.has(c.b)) return false;
      if (this.map.get(c.tx, c.ty) !== T.Floor) return false;
      if (doorCells.length > 0) {
        const da = pg.distances(c.a);
        const db = pg.distances(c.b);
        for (const [x, y] of doorCells) {
          if (Math.min(da[x], da[y], db[x], db[y]) < DOOR_MIN_SPACING) return false;
        }
      }
      if (hasSpiders) {
        // Граф павука з усіма дверима (разом із кандидатом) зачиненими має лишатися зв'язним.
        const g = new CellGraph(this.w, this.h, (tx, ty) => {
          if (tx === c.tx && ty === c.ty) return false;
          const t = this.map.get(tx, ty);
          return t === T.Floor || t === T.Hole;
        });
        if (!g.isConnected()) return false;
      }
      return true;
    };
    const place = (c: Cand) => {
      this.addDoor(c.tx, c.ty, variant, false);
      doorCells.push([c.a, c.b]);
    };

    // Рівень 1: одні двері гарантовано на найкоротшому шляху (§6).
    if (this.isTutorial) {
      const onPath: Cand[] = [];
      for (let j = 0; j + 1 < this.path.length; j++) {
        const a = Math.min(this.path[j], this.path[j + 1]);
        const b = Math.max(this.path[j], this.path[j + 1]);
        const cand = all.find((c) => c.a === a && c.b === b);
        if (cand) onPath.push(cand);
      }
      this.rng.shuffle(onPath);
      const pick = onPath.find((c) => valid(c, false)) ?? onPath.find((c) => valid(c, true));
      if (!pick) throw new GenerationFailed("tutorial door on path");
      place(pick);
    }

    this.rng.shuffle(all);
    while (doorCells.length < count) {
      let placed = false;
      let tries = 0;
      for (const c of all) {
        if (this.map.get(c.tx, c.ty) !== T.Floor) continue;
        if (tries++ >= PLACEMENT_ATTEMPTS) break;
        if (!valid(c, false)) continue;
        place(c);
        placed = true;
        break;
      }
      if (!placed) throw new GenerationFailed("door");
    }
  }

  // ---------- предмети й павуки ----------

  private cellCenter(id: number): { x: number; y: number } {
    return { x: cellTileX(id % this.w) + 0.5, y: cellTileY(Math.floor(id / this.w)) + 0.5 };
  }

  private placeItems(pg: CellGraph): ItemSpawn[] {
    const items: ItemSpawn[] = [];
    if (this.isTutorial) {
      // Динамо-ліхтар у камері (§5.4): не в лабіринті.
      const c = cellTileX(this.startCell % this.w);
      items.push({ type: "dynamo", x: c - 0.5 + 0.1, y: -1.55 });
      return items;
    }
    const dist = pg.distances(this.startCell);
    const maxDist = ITEM_MAX_PATH_FACTOR * (this.path.length - 1);
    const pickCell = (exclude: number[]): number => {
      for (let t = 0; t < PLACEMENT_ATTEMPTS * 4; t++) {
        const id = this.rng.int(0, pg.size - 1);
        if (id === this.startCell || id === this.exitCell || exclude.includes(id)) continue;
        if (dist[id] < ITEM_MIN_START_DISTANCE || dist[id] > maxDist) continue;
        return id;
      }
      throw new GenerationFailed("item");
    };
    // 2–3 предмети, кожен у своїй клітинці (§6, §7.3.4).
    const used: number[] = [];
    const count = this.rng.int(ITEMS_PER_LEVEL[0], ITEMS_PER_LEVEL[1]);
    for (let i = 0; i < count; i++) {
      const itemCell = pickCell(used);
      used.push(itemCell);
      items.push({ type: this.rng.pick(FINDABLE_ITEMS), ...this.cellCenter(itemCell) });
    }
    if (this.level === 1) {
      const antidoteCell = pickCell(used);
      items.push({ type: "antidote", ...this.cellCenter(antidoteCell) });
    }
    return items;
  }

  private placeSpiders(): SpiderSpawn[] {
    const count = SPIDERS_PER_LEVEL[this.level];
    if (count === 0) return [];
    const sg = this.spiderGraphOpenDoors();
    const dist = sg.distances(this.startCell);
    const candidates: number[] = [];
    for (let id = 0; id < sg.size; id++) {
      if (id === this.exitCell) continue;
      if (dist[id] >= SPIDER_MIN_START_DISTANCE) candidates.push(id);
    }
    if (candidates.length < count) throw new GenerationFailed("spiders");
    this.rng.shuffle(candidates);
    const chosen: number[] = [];
    if (this.level === SPIDER_ANCHOR_LEVEL) {
      // Рівень 5: один павук біля входу, один біля виходу (§6); відстані — за графом павука.
      const distExit = sg.distances(this.exitCell);
      const inRange = (d: number, [lo, hi]: number[]) => d >= lo && d <= hi;
      const nearStart = candidates.find((id) => inRange(dist[id], SPIDER_NEAR_START));
      const nearExit = candidates.find((id) => id !== nearStart && inRange(distExit[id], SPIDER_NEAR_EXIT));
      if (nearStart === undefined || nearExit === undefined) throw new GenerationFailed("anchored spiders");
      chosen.push(nearStart, nearExit);
    }
    for (const id of candidates) {
      if (chosen.length >= count) break;
      if (!chosen.includes(id)) chosen.push(id);
    }
    return chosen.map((id) => this.cellCenter(id));
  }

  // ---------- точка появи ----------

  private spawnPoint(): { x: number; y: number; facing: number } {
    if (this.isTutorial) {
      const c = cellTileX(this.startCell % this.w);
      // Центр камери, обличчям до ґрат (угору, §5.4.1).
      return { x: c + 0.5, y: -1.0, facing: -Math.PI / 2 };
    }
    const p = this.cellCenter(this.startCell);
    const open = this.openNeighbors(this.startCell);
    let facing = 0;
    if (open.length > 0) {
      const q = this.cellCenter(open[0]);
      facing = Math.atan2(q.y - p.y, q.x - p.x);
    }
    return { ...p, facing };
  }
}
