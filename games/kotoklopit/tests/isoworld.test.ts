// Ізометрична квартира й підлога (крок 16, F3b): чисті частини без Phaser — дані речей (`world/objects.ts`), які кадри
// маніфесту показує стан гри (`iso/looks.ts`) і геометрія (`iso/geometry.ts`): де кадр, де бабл, чи стіна закриває
// персонажа. Кожен стан, який може показати квартира чи підлога, — кадр, що є в маніфесті.

import { describe, expect, it } from "vitest";

import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { BOWL_CAPACITY, FEEDER_CAPACITY, WATER_CAPACITY } from "../src/sim/config";
import { MAP, MAP_HEIGHT, MAP_WIDTH, objectById, OBJECTS, TRINKETS, WINDOWS } from "../src/sim/home";
import type { BowlItem, Dish, Feeder, GameState, LitterItem, MessKind, Quality, WaterItem } from "../src/sim/types";
import { artEntry } from "../src/view/art/manifest";
import { pointsOn, WALL_HEIGHT, WALL_SEGMENTS } from "../src/view/art/manifest/lib/geometry";
import { frameId, type ArtId } from "../src/view/art/types";
import { IsoDepth } from "../src/view/iso/depth";
import { ANCHOR_GAP, artOffset, boxCovers, floorAnchorAt, footprintCorners, objectAnchorAt, objectScreen, PERSON_FIGURE } from "../src/view/iso/geometry";
import {
  basketState,
  bedState,
  bowlFrame,
  boxesState,
  cabinetLook,
  computerState,
  dishFrame,
  feederFrame,
  fridgeLook,
  itemFrame,
  kitLook,
  litterFrame,
  messFrame,
  robotFrame,
  shapedState,
  showerState,
  sinkState,
  stoveState,
  storageOverlays,
  trashState,
  trinketFrame,
  vacuumState,
  waterFrame,
  type IsoFrame,
} from "../src/view/iso/looks";
import { isoCatPerch, isoItemLook, isoObjectLook } from "../src/view/world/objects";
import { ISO, ISO_WALLS } from "../src/view/world/projection";

const QUALITIES: readonly Quality[] = ["cheap", "premium"];

/** Кадр є в маніфесті: запис з таким id, і стан — один з його станів (без станів — null). */
function expectFrame(frame: IsoFrame): void {
  const entry = artEntry(frame.id);
  expect(entry, frame.id).toBeDefined();
  if (frame.state === null) expect(entry?.states, `${frame.id}: без стану`).toBeUndefined();
  else expect(entry?.states ?? [], frameId(frame.id, frame.state)).toContain(frame.state);
}

/** Усі кадри, які квартира й підлога показали б для цього стану. */
function framesOf(state: GameState): IsoFrame[] {
  const frames: IsoFrame[] = [];
  const fridge = fridgeLook(state);
  frames.push(fridge.body, ...(fridge.food ? [fridge.food] : []));
  if (fridge.mom) frames.push({ id: "env/fridge/mom-meal", state: null });
  const cabinet = cabinetLook(state);
  frames.push(cabinet.body, ...(cabinet.food ? [cabinet.food] : []), ...(cabinet.lock ? [cabinet.lock] : []));
  frames.push(
    { id: "env/stove", state: stoveState(state) },
    { id: "env/trash", state: trashState(state) },
    { id: "env/computer", state: computerState(state) },
    { id: "env/bed", state: bedState(state) },
    { id: "env/vacuum", state: vacuumState(state) },
    { id: "env/washer", state: state.home.washer.state },
    { id: "env/shower", state: showerState(state) },
    { id: "env/sink", state: sinkState(state) },
    { id: "env/litter-bag", state: shapedState(state, "litter-bag") },
    { id: "env/sterile-bin", state: shapedState(state, "sterile-bin") },
    { id: "env/laundry-basket", state: basketState(state.home.clothes) },
  );
  for (const id of ["shower", "sink", "washer"] as const) for (const overlay of storageOverlays(state, id)) if (overlay) frames.push(overlay);
  const kit = kitLook(state);
  frames.push(kit.body, ...kit.extras.filter((e): e is IsoFrame => e !== null));
  const pile = boxesState(state);
  if (pile) frames.push({ id: "env/boxes", state: pile });
  for (const dish of Object.values(state.home.surfaces)) if (dish) frames.push(dishFrame(dish));
  for (const item of state.home.items) frames.push(itemFrame(state, item));
  for (const feeder of state.home.feeders ?? []) frames.push(feederFrame(feeder));
  if (state.home.appliances.robot) frames.push(robotFrame(state, state.home.appliances.robot));
  for (const mess of state.home.messes) frames.push(messFrame(mess.kind));
  for (const t of TRINKETS) frames.push(trinketFrame(t.kind, state.home.trinkets?.[t.kind] !== undefined));
  return frames;
}

describe("ізометричні дані речей (world/objects.ts)", () => {
  it("кожна річ квартири має слід у своїх клітинках, верх не вищий за найвищу точку, а кіт сидить не вище за неї", () => {
    for (const object of OBJECTS) {
      const look = isoObjectLook(object.id);
      const f = look.footprint;
      expect(f.x0 >= object.x && f.y0 >= object.y && f.x1 <= object.x + object.w && f.y1 <= object.y + object.h, object.id).toBe(true);
      expect(f.x1 > f.x0 && f.y1 > f.y0, object.id).toBe(true);
      expect(look.top, object.id).toBeLessThanOrEqual(look.tall);
      if (look.perch !== null) expect(look.perch, object.id).toBeLessThanOrEqual(look.tall);
    }
    expect(() => isoObjectLook("nope")).toThrow();
  });

  it("висоти ті самі, з якими маніфест рахує полотна: найвища точка — у висоті полотна над слідом", () => {
    for (const object of OBJECTS) {
      // Двері мають запас полотна вгору під відчинене полотно — їхня найвища точка не з висоти полотна.
      if (object.id === "door") continue;
      const entry = artEntry(`env/${object.id}`);
      if (!entry) throw new Error(object.id);
      // pivot.y = запас 8 + найвища точка + чверть висоти ромба сліду (`lib/geometry.ts`, `box`).
      expect(entry.pivot.y - 8 - ((object.w + object.h) * 64) / 4, object.id).toBe(isoObjectLook(object.id).tall);
    }
  });

  it("верх речей і де сидить кіт — ті самі, що точки маніфесту (полиця, страва, клавіатура, сидіння, піддон)", () => {
    const cases: [id: string, point: string, fx: number, fy: number, field: "top" | "perch"][] = [
      ["fridge", "top", 0.5, 0.5, "top"],
      ["wardrobe", "top", 0.5, 0.5, "top"],
      ["cat-cabinet", "top", 0.5, 0.5, "top"],
      ["washer", "top", 0.5, 0.5, "top"],
      ["sink", "edge", 0.5, 0.5, "top"],
      ["stove", "pan", 0.5, 0.5, "top"],
      ["counter-left", "dish", 0.4, 0.5, "top"],
      ["counter-right", "dish", 0.5, 0.5, "top"],
      ["table", "dish", 0.4, 0.5, "top"],
      ["computer", "keyboard", 0.5, 0.6, "top"],
      ["bed", "blanket", 0.5, 0.6, "top"],
      ["sofa", "seat", 0.5, 0.4, "top"],
      ["boxes", "top", 0.5, 0.5, "perch"],
      ["shower", "tray", 0.5, 0.85, "perch"],
    ];
    for (const [id, point, fx, fy, field] of cases) {
      const entry = artEntry(`env/${id}`);
      if (!entry) throw new Error(id);
      const height = isoObjectLook(id)[field];
      if (height === null) throw new Error(id);
      expect(pointsOn(objectById(id), entry)(fx, fy, height), `${id}.${point}`).toEqual(entry.points?.[point]);
    }
    // Підвіконня: кіт сидить на дошці на висоті верху.
    for (const pane of WINDOWS) {
      const object = objectById(pane.sill);
      const entry = artEntry(`env/${pane.sill}`);
      if (!entry) throw new Error(pane.sill);
      const at = pointsOn(object, entry)((pane.seat.x - object.x) / object.w, (pane.seat.y - object.y) / object.h, isoObjectLook(pane.sill).perch ?? 0);
      expect(at, pane.sill).toEqual(entry.points?.["seat"]);
    }
  });

  it("кіт на речі — над своєю точкою на висоті верху; у душі — на піддоні біля входу; під річчю — з-під ближчого краю", () => {
    expect(isoCatPerch("fridge", { x: 13.5, y: 1.5 }, false)).toEqual({ at: { x: 13.5, y: 1.5 }, lift: 150 });
    expect(isoCatPerch("wardrobe", { x: 6.4, y: 1.6 }, false)).toEqual({ at: { x: 6.4, y: 1.6 }, lift: 170 });
    expect(isoCatPerch("sofa", { x: 14.5, y: 10.5 }, false).lift).toBe(34);
    expect(isoCatPerch("boxes", { x: 12.5, y: 9.5 }, false).lift).toBe(48);
    expect(isoCatPerch("shower", { x: 8.2, y: 1.3 }, false)).toEqual({ at: { x: 8.5, y: 1.85 }, lift: 6 });
    // Під ліжком (1 × 2): ближчий до камери край — правий (x = 2) для кота біля нього, нижній (y = 3) — для кота в ногах.
    expect(isoCatPerch("bed", { x: 1.8, y: 1.5 }, true)).toEqual({ at: { x: 2, y: 1.5 }, lift: 0 });
    expect(isoCatPerch("bed", { x: 1.3, y: 2.8 }, true)).toEqual({ at: { x: 1.3, y: 3 }, lift: 0 });
    // На кожну річ, крім дверей, кіт може вилізти, і стоїть не вище за її найвищу точку.
    for (const object of OBJECTS) {
      const perch = isoCatPerch(object.id, { x: object.x + 0.5, y: object.y + 0.5 }, false);
      expect(perch.lift, object.id).toBeLessThanOrEqual(isoObjectLook(object.id).tall);
    }
  });

  it("персонаж користується річчю на підлозі квартири, поза слідом самої речі", () => {
    for (const object of OBJECTS) {
      const use = isoObjectLook(object.id).use;
      if (!use) continue;
      expect(MAP[Math.floor(use.at.y)]?.[Math.floor(use.at.x)], object.id).toBe(".");
      const f = isoObjectLook(object.id).footprint;
      expect(use.at.x >= f.x0 && use.at.x < f.x1 && use.at.y >= f.y0 && use.at.y < f.y1, object.id).toBe(false);
      expect(Math.hypot(use.facing.x, use.facing.y), object.id).toBeCloseTo(1);
    }
  });

  it("речі на підлозі не вищі за свої полотна в маніфесті", () => {
    const cases: [kind: Parameters<typeof isoItemLook>[0], id: (q: Quality) => ArtId][] = [
      ["bowl", (q) => `item/bowl/${q}`],
      ["water", (q) => `item/water/${q}`],
      ["litter", (q) => `item/litter/${q}`],
      ["toy", (q) => `item/toy/${q}`],
      ["house", (q) => `item/house/${q}`],
      ["scratcher", (q) => `item/scratcher/${q}`],
      ["feeder", (q) => `item/feeder/${q}`],
      ["robot", (q) => `item/robot/${q}`],
      ["carrier", (q) => `item/carrier/${q}`],
      ["basket", () => "env/laundry-basket"],
    ];
    for (const [kind, id] of cases) {
      for (const q of QUALITIES) {
        const entry = artEntry(id(q));
        if (!entry) throw new Error(id(q));
        const look = isoItemLook(kind, q);
        expect(look.height, id(q)).toBeLessThanOrEqual(entry.pivot.y);
        expect(look.half * 2, id(q)).toBeLessThanOrEqual(entry.size.w);
      }
    }
  });
});

describe("кадри квартири й підлоги (iso/looks.ts)", () => {
  it("у кожному сценарії кожна річ — кадр, що є в маніфесті", () => {
    const names = Object.keys(FILE_SCENARIOS);
    expect(names.length).toBeGreaterThan(20);
    for (const name of names) {
      const state = applyScenario(FILE_SCENARIOS[name]!).current;
      for (const frame of framesOf(state)) expectFrame(frame);
    }
  });

  it("миска: порожня, до порції й повна — за кормом, з'їденим і надкльованим; стерильний — свій", () => {
    const bowl = (food: number, foodQuality: Quality | null, extra: Partial<BowlItem> = {}): BowlItem => ({
      id: 1,
      kind: "bowl",
      quality: "premium",
      slot: "bowl-1",
      food,
      foodQuality,
      sterile: false,
      ...extra,
    });
    expect(bowlFrame(bowl(0, null))).toEqual({ id: "item/bowl/premium", state: "empty" });
    expect(bowlFrame(bowl(BOWL_CAPACITY, "cheap")).state).toBe("cheap-2");
    expect(bowlFrame(bowl(1, "premium")).state).toBe("premium-1");
    expect(bowlFrame(bowl(2, "premium"), 1.5).state).toBe("premium-1");
    expect(bowlFrame(bowl(1, "premium", { half: true }), 0.5).state).toBe("empty");
    expect(bowlFrame(bowl(2, "cheap", { sterile: true })).state).toBe("sterile-2");
    for (const q of QUALITIES) {
      for (let food = 0; food <= BOWL_CAPACITY; food += 0.25) {
        for (const kind of [null, "cheap", "premium"] as const) {
          for (const sterile of [false, true]) expectFrame(bowlFrame({ ...bowl(food, kind, { sterile }), quality: q }));
        }
      }
    }
  });

  it("вода, лоток, автогодівниця: кожен рівень — кадр маніфесту", () => {
    for (const q of QUALITIES) {
      const water = (w: number): WaterItem => ({ id: 1, kind: "water", quality: q, slot: "water-1", water: w });
      expect(waterFrame(water(0)).state).toBe("empty");
      expect(waterFrame(water(WATER_CAPACITY)).state).toBe("full");
      for (let w = 0; w <= WATER_CAPACITY; w++) expectFrame(waterFrame(water(w)));

      const litter = (fill: Quality | null, uses: number): LitterItem => ({ id: 1, kind: "litter", quality: q, slot: "litter-1", litter: fill, uses });
      expect(litterFrame(litter(null, 0)).state).toBe("empty");
      expect(litterFrame(litter("premium", 0)).state).toBe("premium");
      expect(litterFrame(litter("cheap", 1)).state).toBe("cheap-used");
      expect(litterFrame(litter("cheap", 99)).state).toBe("cheap-dirty");
      for (const fill of [null, "cheap", "premium"] as const) for (let uses = 0; uses < 12; uses++) expectFrame(litterFrame(litter(fill, uses)));

      const feeder = (food: number, foodQuality: Quality | null, sterile = false): Feeder => ({ slot: "bowl-1", quality: q, food, foodQuality, sterile });
      expect(feederFrame(feeder(0, null)).state).toBe("empty");
      expect(feederFrame(feeder(FEEDER_CAPACITY[q], "premium")).state).toBe("premium-full");
      expect(feederFrame(feeder(1, "cheap")).state).toBe("cheap-low");
      for (let food = 0; food <= FEEDER_CAPACITY[q]; food++) {
        for (const kind of [null, "cheap", "premium"] as const) for (const sterile of [false, true]) expectFrame(feederFrame(feeder(food, kind, sterile)));
      }
    }
  });

  it("страви, безлад, дрібнички й кошик білизни — кадри маніфесту", () => {
    const dishes: Dish[] = [
      { kind: "raw", quality: "cheap" },
      { kind: "meal", quality: "premium" },
      { kind: "burnt", quality: "cheap" },
      { kind: "meal", quality: "cheap", mom: true },
    ];
    for (const dish of dishes) expectFrame(dishFrame(dish));
    expect(dishFrame(dishes[3]!)).toEqual({ id: "item/dish/mom", state: null });
    const messes: MessKind[] = ["surprise", "vomit", "hairball", "litter", "broken", "fur", "mark", "puddle", "paper", "garbage"];
    for (const kind of messes) expectFrame(messFrame(kind));
    for (const t of TRINKETS) for (const fallen of [false, true]) expectFrame(trinketFrame(t.kind, fallen));
    expect(basketState(5)).toBe("load-0");
    expect(basketState(9)).toBe("load-0");
    expect(basketState(3)).toBe("load-2");
    expect(basketState(2.5)).toBe("load-3");
    expect(basketState(0)).toBe("overflow");
    for (let clothes = -1; clothes <= 8; clothes += 0.5) expectFrame({ id: "env/laundry-basket", state: basketState(clothes) });
  });
});

describe("геометрія ізометричної квартири (iso/geometry.ts)", () => {
  it("кадр речі — у точці підлоги під центром сліду; бабл — над найвищою точкою", () => {
    const fridge = objectById("fridge");
    expect(objectScreen(fridge)).toEqual(ISO.toScreen({ x: 13.5, y: 1.5 }));
    expect(objectAnchorAt(fridge)).toEqual({ x: objectScreen(fridge).x, y: objectScreen(fridge).y - 150 - ANCHOR_GAP });
    const computer = objectById("computer");
    const look = isoObjectLook("computer");
    expect(objectAnchorAt(computer).y).toBe(objectScreen(computer).y - look.tall - ANCHOR_GAP + look.bubble.y);
    expect(floorAnchorAt({ x: 3, y: 4 }, 10)).toEqual({ x: ISO.toScreen({ x: 3, y: 4 }).x, y: ISO.toScreen({ x: 3, y: 4 }).y - 10 - ANCHOR_GAP });
  });

  it("точки кріплення — зсув від pivot за маніфестом; немає — null", () => {
    const table = artEntry("env/table");
    const dish = table?.points?.["dish"];
    if (!table || !dish) throw new Error("env/table.dish");
    expect(artOffset("env/table", "dish")).toEqual({ x: dish.x - table.pivot.x, y: dish.y - table.pivot.y });
    // Страва на столі — над серединою його сліду, на висоті стільниці.
    const at = artOffset("env/table", "dish");
    expect(at?.y).toBeLessThan(-isoObjectLook("table").top + 20);
    expect(artOffset("env/table", "nope")).toBeNull();
    expect(artOffset("env/nope", "dish")).toBeNull();
    // Кожна дрібничка має своє місце на своїй речі.
    for (const t of TRINKETS) expect(artOffset(`env/${t.object}`, t.kind), t.kind).not.toBeNull();
    for (const id of ["table", "counter-left", "counter-right"]) expect(artOffset(`env/${id}`, "dish"), id).not.toBeNull();
  });

  it("кути сліду: верхній, правий, нижній, лівий", () => {
    const [top, right, bottom, left] = footprintCorners({ x0: 2, y0: 3, x1: 4, y1: 4 });
    expect(top).toEqual(ISO.toScreen({ x: 2, y: 3 }));
    expect(right).toEqual(ISO.toScreen({ x: 4, y: 3 }));
    expect(bottom).toEqual(ISO.toScreen({ x: 4, y: 4 }));
    expect(left).toEqual(ISO.toScreen({ x: 2, y: 4 }));
  });

  it("внутрішня стіна закриває персонажа, що стоїть одразу за нею, — і не закриває того, хто перед нею, далеко чи збоку", () => {
    const row5 = WALL_SEGMENTS.find((s) => s.id === "env/wall/inner/row5-x5");
    if (!row5) throw new Error("row5-x5");
    const box = { x0: row5.rect.x, y0: row5.rect.y, x1: row5.rect.x + row5.rect.w, y1: row5.rect.y + row5.rect.h };
    const h = ISO_WALLS.inner;
    // У ванній біля стіни ряду 5 і в спальні біля неї — за стіною, близько.
    expect(boxCovers(box, h, { x: 8.5, y: 4.5 }, PERSON_FIGURE)).toBe(true);
    expect(boxCovers(box, h, { x: 5.5, y: 4.5 }, PERSON_FIGURE)).toBe(true);
    // Перед стіною (у вітальні) — ніколи.
    expect(boxCovers(box, h, { x: 8.5, y: 6.5 }, PERSON_FIGURE)).toBe(false);
    // Далеко за стіною: ноги вище за верх стіни на екрані.
    expect(boxCovers(box, h, { x: 5.5, y: 1.5 }, PERSON_FIGURE)).toBe(false);
    // Збоку: на іншій горизонталі екрана.
    expect(boxCovers(box, h, { x: 11.5, y: 2.5 }, PERSON_FIGURE)).toBe(false);
    // Стовпець x = 7 між спальнею й ванною: зі спальні біля нього — за ним, з ванної — перед ним.
    const col7 = WALL_SEGMENTS.find((s) => s.id === "env/wall/inner/col7-y1");
    if (!col7) throw new Error("col7-y1");
    const wall = { x0: col7.rect.x, y0: col7.rect.y, x1: col7.rect.x + col7.rect.w, y1: col7.rect.y + col7.rect.h };
    expect(boxCovers(wall, h, { x: 6.5, y: 3.5 }, PERSON_FIGURE)).toBe(true);
    expect(boxCovers(wall, h, { x: 8.5, y: 3.5 }, PERSON_FIGURE)).toBe(false);
  });
});

describe("уся ізометрична квартира в реєстрі глибини", () => {
  it("меблі (сліди з objects.ts) і сегменти стін (WALL_SEGMENTS) з точкою на кожній вільній клітинці — без циклів", () => {
    const registry = new IsoDepth();
    const depths = new Map<string, number>();
    for (const object of OBJECTS) registry.addBox({ ...isoObjectLook(object.id).footprint, id: object.id }, (d) => depths.set(object.id, d));
    for (const segment of WALL_SEGMENTS) {
      const r = segment.rect;
      registry.addBox({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h }, (d) => depths.set(segment.id, d));
    }
    const points: { x: number; y: number; depth: () => number }[] = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (MAP[y]?.[x] !== "." || OBJECTS.some((o) => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h)) continue;
        let depth = Number.NaN;
        registry.addPoint((d) => (depth = d)).place(x + 0.5, y + 0.5);
        points.push({ x: x + 0.5, y: y + 0.5, depth: () => depth });
      }
    }
    registry.solve();
    expect(registry.cycles).toBe(0);
    // Біля дивана, ліжка й столу — за правилом: перед річчю, якщо p.x ≥ x1 або p.y ≥ y1. Лише ті, чий малюнок (пів ромба
    // завширшки) може перекрити річ на екрані: для решти порядок не важить.
    for (const id of ["sofa", "bed", "table", "computer"]) {
      const f = isoObjectLook(id).footprint;
      const box = depths.get(id) ?? Number.NaN;
      let checked = 0;
      for (const p of points) {
        const u = p.x - p.y;
        if (u <= f.x0 - f.y1 - 1 || u >= f.x1 - f.y0 + 1) continue;
        if (Math.abs(p.x - (f.x0 + f.x1) / 2) > 2.5 || Math.abs(p.y - (f.y0 + f.y1) / 2) > 2.5) continue;
        checked++;
        const inFront = p.x >= f.x1 || p.y >= f.y1;
        expect(p.depth() > box, `${id} і (${p.x}, ${p.y})`).toBe(inFront);
      }
      expect(checked, id).toBeGreaterThan(3);
    }
    // Внутрішні стіни заввишки, як у проєкції.
    expect(WALL_HEIGHT.inner).toBe(ISO_WALLS.inner);
  });
});
