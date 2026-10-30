// Порядок малювання ізометричного світу (крок 16, `GRAPHICS_PLAN.md`, «Проєкція і глибина»): точка перед коробкою, якщо
// p.x ≥ x1 або p.y ≥ y1; коробка перед коробкою, якщо A.x0 ≥ B.x1 або A.y0 ≥ B.y1; точки між собою — за x + y, потім x;
// кіт на меблях — над ними; бруд — під тим, хто на ньому стоїть. Без циклів на всій квартирі.

import { describe, expect, it } from "vitest";

import { isFixedSolid, MAP_HEIGHT, MAP_WIDTH, OBJECTS, objectById } from "../src/sim/home";
import { FLAT_REACH, ISO_POINT_HALF, IsoWork, isoOrder, objectBox, wallBoxes, type IsoBox, type IsoPoint } from "../src/view/world/isoorder";

/** Місце кожного елемента в порядку (0 — найдальший). */
function ranks(order: Int32Array): number[] {
  const rank: number[] = [];
  order.forEach((id, place) => (rank[id] = place));
  return rank;
}

/** Порядок коробок і точок; `point(j)` — індекс точки j серед елементів. */
function solve(boxes: readonly IsoBox[], points: readonly IsoPoint[]): { rank: number[]; point: (j: number) => number; cycles: number } {
  const work = new IsoWork();
  const order = isoOrder(boxes, points, work);
  return { rank: ranks(order), point: (j) => boxes.length + j, cycles: work.cycles };
}

const SOFA = objectBox(objectById("sofa"));
const TABLE = objectBox(objectById("table"));

describe("isoOrder: персонаж і меблі", () => {
  it("персонаж праворуч від дивана — перед ним, за диваном — за ним, перед диваном — перед ним", () => {
    expect(SOFA).toEqual({ x0: 13, y0: 10, x1: 16, y1: 11 });
    for (const [where, p, front] of [
      ["праворуч", { x: 16.4, y: 10.5 }, true],
      ["за диваном", { x: 14.5, y: 9.5 }, false],
      ["за правим краєм дивана", { x: 15.8, y: 9.6 }, false],
      ["перед диваном", { x: 14.5, y: 11.3 }, true],
      ["ліворуч від дивана (його лівий край закриває)", { x: 12.6, y: 10.5 }, false],
    ] as const) {
      const { rank, point, cycles } = solve([SOFA], [p]);
      expect(cycles, where).toBe(0);
      expect(rank[point(0)]! > rank[0]!, where).toBe(front);
    }
  });

  it("кіт на столі — над столом; персонаж перед столом — перед котом, за столом — за котом", () => {
    const counter = objectBox(objectById("counter-left"));
    const boxes = [TABLE, counter];
    const cat: IsoPoint = { x: 13.5, y: 3.5, on: 0 };
    const front: IsoPoint = { x: 14, y: 4.5 };
    const back: IsoPoint = { x: 14, y: 2.6 };
    const { rank, point, cycles } = solve(boxes, [cat, front, back]);
    expect(cycles).toBe(0);
    expect(rank[point(0)]).toBeGreaterThan(rank[0]!);
    expect(rank[point(1)]).toBeGreaterThan(rank[point(0)]!);
    expect(rank[point(2)]).toBeLessThan(rank[0]!);
    expect(rank[point(2)]).toBeLessThan(rank[point(0)]!);
    // Кухонна поверхня за столом — і за котом на ньому.
    expect(rank[1]).toBeLessThan(rank[point(0)]!);
  });

  it("кіт на коробці відносно інших коробок — як його коробка, хоч би де його власна точка", () => {
    // Кіт на холодильнику сидить на краю, ближче до стільниці праворуч, але стільниця перед холодильником — і перед котом.
    const fridge = objectBox(objectById("fridge"));
    const table = TABLE;
    const cat: IsoPoint = { x: 13.95, y: 1.9, on: 0 };
    const { rank, point } = solve([fridge, table], [cat]);
    expect(rank[point(0)]).toBeGreaterThan(rank[0]!);
    expect(rank[point(0)]).toBeLessThan(rank[1]!);
  });

  it("кіт під столом — одразу за столом, але перед тим, що за столом; кіт на столі — над столом", () => {
    const fridge = objectBox(objectById("fridge"));
    const under: IsoPoint = { x: 14.2, y: 3.8, on: 0, under: true };
    const on: IsoPoint = { x: 13.6, y: 3.4, on: 0 };
    const person: IsoPoint = { x: 14, y: 4.5 };
    const { rank, point, cycles } = solve([TABLE, fridge], [under, on, person]);
    expect(cycles).toBe(0);
    expect(rank[point(0)]).toBeLessThan(rank[0]!);
    expect(rank[point(0)]).toBeGreaterThan(rank[1]!);
    expect(rank[point(1)]).toBeGreaterThan(rank[0]!);
    expect(rank[point(2)]).toBeGreaterThan(rank[point(1)]!);
    // `under` без `on` нічого не значить: точка на підлозі за звичайним правилом.
    const alone = solve([TABLE], [{ x: 14, y: 4.5, under: true }]);
    expect(alone.rank[alone.point(0)]).toBeGreaterThan(alone.rank[0]!);
  });

  it("два коти на одних меблях — між собою за x + y; на різних — як їхні меблі", () => {
    const sofa: IsoPoint = { x: 15.5, y: 10.5, on: 0 };
    const sofa2: IsoPoint = { x: 13.5, y: 10.5, on: 0 };
    const { rank, point } = solve([SOFA], [sofa, sofa2]);
    expect(rank[point(1)]).toBeLessThan(rank[point(0)]!);
    // Висока шафка [2, 3) × [0, 3) — перед лавою [0, 2) × [2, 3) (її x0 ≥ x1 лави): кіт на шафці ближчий за кота на лаві,
    // хоч його x + y менший.
    const cabinet: IsoBox = { x0: 2, y0: 0, x1: 3, y1: 3 };
    const bench: IsoBox = { x0: 0, y0: 2, x1: 2, y1: 3 };
    const two = solve([cabinet, bench], [{ x: 1.9, y: 2.9, on: 1 }, { x: 2.1, y: 0.2, on: 0 }]);
    expect(two.cycles).toBe(0);
    expect(two.rank[two.point(1)]).toBeGreaterThan(two.rank[two.point(0)]!);
  });
});

describe("isoOrder: точки між собою", () => {
  it("два коти по діагоналі — ближчий той, у кого більше x + y", () => {
    const { rank, point } = solve([], [{ x: 6.2, y: 8.1 }, { x: 5.5, y: 7.5 }]);
    expect(rank[point(0)]).toBeGreaterThan(rank[point(1)]!);
    const other = solve([], [{ x: 5.5, y: 7.5 }, { x: 6.2, y: 8.1 }]);
    expect(other.rank[other.point(1)]).toBeGreaterThan(other.rank[other.point(0)]!);
  });

  it("за однакового x + y ближчий той, у кого більший x", () => {
    const { rank, point } = solve([], [{ x: 6, y: 7.5 }, { x: 5.6, y: 7.9 }]);
    expect(rank[point(0)]).toBeGreaterThan(rank[point(1)]!);
  });

  it("порядок точок не залежить від їхнього порядку у вхідних даних", () => {
    const points: IsoPoint[] = [
      { x: 3.2, y: 7.7 },
      { x: 3.9, y: 7.1 },
      { x: 4.4, y: 8.2 },
      { x: 2.5, y: 8.5 },
    ];
    const ids = (pts: IsoPoint[]): string[] => [...isoOrder([], pts)].map((i) => `${pts[i]!.x},${pts[i]!.y}`);
    expect(ids([...points].reverse())).toEqual(ids(points));
  });

  it("бруд — під котом, що стоїть на ньому, хоч кіт трохи далі; під котом далеко позаду — без правила", () => {
    const puddle: IsoPoint = { x: 5.5, y: 7.5, flat: true };
    const { rank, point } = solve([], [puddle, { x: 5.3, y: 7.3 }]);
    expect(rank[point(1)]).toBeGreaterThan(rank[point(0)]!);
    // Кіт перед калюжею — тим паче над нею.
    const ahead = solve([], [{ x: 5.8, y: 7.9 }, puddle]);
    expect(ahead.rank[ahead.point(0)]).toBeGreaterThan(ahead.rank[ahead.point(1)]!);
    // Кіт далеко позаду (ноги далі за FLAT_REACH): з калюжею не перекривається, тож він просто далі.
    const far = solve([], [puddle, { x: 5.5 - FLAT_REACH, y: 7.5 - FLAT_REACH }]);
    expect(far.rank[far.point(1)]).toBeLessThan(far.rank[far.point(0)]!);
  });

  it("бруд перед меблями — над ними, за меблями — під ними", () => {
    const bag = objectBox(objectById("litter-bag"));
    const { rank, point } = solve([bag], [{ x: 5.5, y: 7.3, flat: true }, { x: 5.5, y: 5.6, flat: true }]);
    expect(rank[point(0)]).toBeGreaterThan(rank[0]!);
    expect(rank[point(1)]).toBeLessThan(rank[0]!);
  });
});

describe("isoOrder: коробки", () => {
  it("коробка праворуч (A.x0 ≥ B.x1) чи нижче (A.y0 ≥ B.y1) — ближча", () => {
    const a: IsoBox = { x0: 3, y0: 3, x1: 4, y1: 4 };
    const right: IsoBox = { x0: 4, y0: 3, x1: 5, y1: 4 };
    const below: IsoBox = { x0: 3, y0: 4, x1: 5, y1: 5 };
    const { rank } = solve([right, a, below], []);
    expect(rank[0]).toBeGreaterThan(rank[1]!);
    expect(rank[2]).toBeGreaterThan(rank[1]!);
  });

  it("довга стіна й шафа за нею: стіна ближча, хоч її середина далі за x + y", () => {
    // Ряд y=5 між спальнею й вітальнею проти шафи в спальні: середина стіни (7,5; 5,5), шафи (6,5; 1,5).
    const [wall] = wallBoxes().filter((w) => w.x0 === 5 && w.y0 === 5);
    expect(wall).toBeDefined();
    const wardrobe = objectBox(objectById("wardrobe"));
    const { rank } = solve([wall!, wardrobe], []);
    expect(rank[0]).toBeGreaterThan(rank[1]!);
  });

  it("сліди, що перекриваються, — стабільно, за серединою: від порядку у вхідних даних не залежить", () => {
    const rug: IsoBox = { x0: 9, y0: 7, x1: 13, y1: 10 };
    const pile = objectBox(objectById("boxes"));
    const one = solve([rug, pile], []);
    const two = solve([pile, rug], []);
    expect(one.rank[1]! > one.rank[0]!).toBe(two.rank[0]! > two.rank[1]!);
    expect(one.rank[1]).toBeGreaterThan(one.rank[0]!);
  });
});

describe("isoOrder: стіни й кошеня", () => {
  it("стіни для порядку — внутрішні й передні сегменти за мапою; задніх і дверей немає", () => {
    const walls = wallBoxes().map((w) => `${w.kind} ${w.x0},${w.y0}–${w.x1},${w.y1} h${w.h}`);
    expect(walls.sort()).toEqual(
      [
        "inner 1,5–3,6 h66",
        "inner 5,5–10,6 h66",
        "inner 12,5–15,6 h66",
        "inner 17,5–19,6 h66",
        "inner 7,1–8,5 h66",
        "inner 12,1–13,5 h66",
        "front 1,11–10,12 h14",
        "front 12,11–20,12 h14",
        "front 19,1–20,11 h14",
      ].sort(),
    );
  });

  it("кошеня біля стіни: праворуч від стовпця й нижче за ряд — перед стіною, ліворуч і вище — за нею", () => {
    const walls = wallBoxes();
    const column = walls.findIndex((w) => w.x0 === 7 && w.y0 === 1);
    const row = walls.findIndex((w) => w.x0 === 5 && w.y0 === 5);
    const left = walls.findIndex((w) => w.x0 === 1 && w.y0 === 5);
    const kittens: IsoPoint[] = [
      { x: 8.3, y: 3.5, half: 30 },
      { x: 6.6, y: 3.5, half: 30 },
      { x: 6.5, y: 6.2, half: 30 },
      { x: 6.5, y: 4.6, half: 30 },
      // У проході між спальнею й вітальнею: лівий кінець ряду [5, 10) закриває його праву частину, а ряд [1, 3) — позаду.
      { x: 4.5, y: 5.5, half: 30 },
    ];
    const { rank, point, cycles } = solve(walls, kittens);
    expect(cycles).toBe(0);
    expect(rank[point(0)]).toBeGreaterThan(rank[column]!);
    expect(rank[point(1)]).toBeLessThan(rank[column]!);
    expect(rank[point(2)]).toBeGreaterThan(rank[row]!);
    expect(rank[point(3)]).toBeLessThan(rank[row]!);
    expect(rank[point(4)]).toBeLessThan(rank[row]!);
    expect(rank[point(4)]).toBeGreaterThan(rank[left]!);
  });
});

/** Елемент для перевірки правил незалежно від розв'язувача: коробка чи точка (на коробці — з її індексом). */
type Item = { box: IsoBox } | { point: IsoPoint };

/** Інтервал x − y на екрані. */
function span(items: readonly Item[], i: number): [number, number] {
  const item = items[i]!;
  if ("box" in item) return [item.box.x0 - item.box.y1, item.box.x1 - item.box.y0];
  const p = item.point;
  const half = (p.half ?? ISO_POINT_HALF) / 64;
  const own: [number, number] = [p.x - p.y - half, p.x - p.y + half];
  if (p.on === undefined || p.on < 0) return own;
  const base = span(items, p.on);
  return [Math.min(own[0], base[0]), Math.max(own[1], base[1])];
}

/** Що кажуть правила про пару: +1 — a ближче, −1 — b ближче, 0 — правила немає (або воно лише «стабільне»). */
function rule(items: readonly Item[], a: number, b: number): number {
  const A = items[a]!;
  const B = items[b]!;
  const boxes = (p: IsoBox, q: IsoBox): number => {
    const front = p.x0 >= q.x1 || p.y0 >= q.y1;
    const back = q.x0 >= p.x1 || q.y0 >= p.y1;
    return front === back ? 0 : front ? 1 : -1;
  };
  const pointBox = (p: IsoPoint, q: IsoBox): number => (p.x >= q.x1 || p.y >= q.y1 ? 1 : -1);
  const boxOf = (p: IsoPoint): IsoBox | null => {
    const base = p.on === undefined || p.on < 0 ? null : items[p.on];
    return base && "box" in base ? base.box : null;
  };
  if ("box" in A && "box" in B) return boxes(A.box, B.box);
  if ("box" in A) return -rule(items, b, a);
  if (!("point" in A)) return 0;
  const p = A.point;
  if ("box" in B) {
    if (p.on === b) return p.under && boxOf(p) ? -1 : 1;
    const own = boxOf(p);
    const r = own ? boxes(own, B.box) : 0;
    return r !== 0 ? r : pointBox(p, B.box);
  }
  const q = B.point;
  const pb = boxOf(p);
  const qb = boxOf(q);
  if (p.on !== q.on) {
    if (pb && qb) {
      const r = boxes(pb, qb);
      if (r !== 0) return r;
    } else if (pb) return -pointBox(q, pb);
    else if (qb) return pointBox(p, qb);
  }
  const pu = pb !== null && p.under === true;
  const qu = qb !== null && q.under === true;
  if (pu !== qu) return pu ? -1 : 1;
  if ((p.flat ?? false) !== (q.flat ?? false)) {
    if (p.flat) return q.x + q.y >= p.x + p.y - FLAT_REACH ? -1 : 0;
    return p.x + p.y >= q.x + q.y - FLAT_REACH ? 1 : 0;
  }
  const d = p.x + p.y - (q.x + q.y);
  return d !== 0 ? Math.sign(d) : Math.sign(p.x - q.x);
}

/** Пари, що можуть перекритися на екрані, і правило між ними не виконано. */
function broken(items: readonly Item[], order: Int32Array): string[] {
  const rank = ranks(order);
  const problems: string[] = [];
  for (let a = 0; a < items.length; a++) {
    for (let b = a + 1; b < items.length; b++) {
      const [la, ha] = span(items, a);
      const [lb, hb] = span(items, b);
      if (!(la < hb && lb < ha)) continue;
      const r = rule(items, a, b);
      if (r !== 0 && rank[a]! > rank[b]! !== r > 0) problems.push(`${JSON.stringify(items[a])} / ${JSON.stringify(items[b])}`);
    }
  }
  return problems;
}

/** Уся квартира коробками: меблі й сховища (усі, ніби вже з'явилися) і стіни. */
function apartment(): IsoBox[] {
  return [...OBJECTS.map((o) => objectBox(o)), ...wallBoxes()];
}

describe("isoOrder: уся квартира", () => {
  it("коробки меблів і стін з home.ts і MAP — без циклів, кожне правило виконано", () => {
    const boxes = apartment();
    const work = new IsoWork();
    const order = isoOrder(boxes, [], work);
    expect(work.cycles).toBe(0);
    expect([...order].sort((a, b) => a - b)).toEqual(boxes.map((_, i) => i));
    expect(broken(boxes.map((box) => ({ box })), order)).toEqual([]);
  });

  it("коробки й точка на кожній вільній клітинці підлоги, коти на кожній речі й під нею — без циклів, кожне правило виконано", () => {
    const boxes = apartment();
    const points: IsoPoint[] = [];
    for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) if (!isFixedSolid(x, y)) points.push({ x: x + 0.5, y: y + 0.5 });
    OBJECTS.forEach((o, i) => points.push({ x: o.x + o.w / 2, y: o.y + o.h / 2, on: i, half: 40 }, { x: o.x + o.w * 0.3, y: o.y + o.h * 0.7, on: i, under: true, half: 30 }));
    const work = new IsoWork();
    const order = isoOrder(boxes, points, work);
    expect(work.cycles).toBe(0);
    expect(order).toHaveLength(boxes.length + points.length);
    const items: Item[] = [...boxes.map((box) => ({ box })), ...points.map((point) => ({ point }))];
    expect(broken(items, order)).toEqual([]);
  });

  it("клітинка під передньою стіною — за нею; кіт на шафі — над шафою й під стіною ряду y=5", () => {
    const boxes = apartment();
    const front = boxes.findIndex((b) => b.x0 === 12 && b.y0 === 11);
    const row = boxes.findIndex((b) => b.x0 === 5 && b.y0 === 5 && b.y1 === 6);
    const wardrobe = OBJECTS.findIndex((o) => o.id === "wardrobe");
    const { rank, point, cycles } = solve(boxes, [{ x: 14.5, y: 10.8 }, { x: 6.5, y: 1.5, on: wardrobe }]);
    expect(cycles).toBe(0);
    expect(rank[point(0)]).toBeLessThan(rank[front]!);
    expect(rank[point(1)]).toBeGreaterThan(rank[wardrobe]!);
    expect(rank[point(1)]).toBeLessThan(rank[row]!);
  });
});

describe("isoOrder: розв'язувач", () => {
  /** Псевдовипадкові числа зі сталим зерном. */
  function random(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  }

  function scene(seed: number, count: number): { boxes: IsoBox[]; points: IsoPoint[] } {
    const rnd = random(seed);
    const boxes = apartment();
    const points: IsoPoint[] = [];
    for (let i = 0; i < count; i++) {
      const kind = rnd();
      const p = { x: 1 + rnd() * 18, y: 1 + rnd() * 10 };
      if (kind < 0.2) points.push({ ...p, flat: true, half: 20 + rnd() * 40 });
      else if (kind < 0.35) points.push({ ...p, on: Math.floor(rnd() * OBJECTS.length) });
      else points.push({ ...p, half: 20 + rnd() * 60 });
    }
    return { boxes, points };
  }

  it("на будь-яких точках — перестановка всіх елементів, однакова для того самого входу", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { boxes, points } = scene(seed, 40);
      const order = isoOrder(boxes, points);
      expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: boxes.length + points.length }, (_, i) => i));
      expect([...isoOrder(boxes, points)]).toEqual([...order]);
    }
  });

  it("робота між кадрами дає той самий порядок, що й нова, і пише в той самий буфер", () => {
    const work = new IsoWork();
    let buffer: ArrayBufferLike | null = null;
    for (let seed = 1; seed <= 20; seed++) {
      // Кадри з тими самими коробками й трохи іншими точками — як щокадру.
      const { boxes, points } = scene(seed % 3, 30);
      const moved = points.map((p, i) => ({ ...p, x: p.x + ((seed * 0.07 + i * 0.01) % 0.3) }));
      const order = isoOrder(boxes, moved, work);
      expect([...order]).toEqual([...isoOrder(boxes, moved)]);
      if (seed > 1) expect(order.buffer).toBe(buffer);
      buffer = order.buffer;
    }
  });

  it("цикл (ширина малюнків біля кута коробки) розривається на найдальшому, і порядок однаково повний", () => {
    // P за коробкою (x < x1, y < y1), Q перед нею (x ≥ x1), але Q далі за x + y, ніж P, і їхні малюнки перекриваються.
    const box: IsoBox = { x0: 0, y0: 0, x1: 1, y1: 1 };
    const work = new IsoWork();
    const order = isoOrder([box], [{ x: 0.9, y: -0.3 }, { x: 1, y: -0.45 }], work);
    expect(work.cycles).toBe(1);
    expect([...order].sort()).toEqual([0, 1, 2]);
  });

  it("порожньо — порожній порядок", () => {
    expect(isoOrder([], [])).toHaveLength(0);
  });
});
