// Ізометрична квартира й підлога (крок 16, F3b): чисті частини без Phaser — дані речей (`world/objects.ts`), які кадри
// маніфесту показує стан гри (`iso/looks.ts`) і геометрія (`iso/geometry.ts`): де кадр, де бабл, чи стіна закриває
// персонажа. Кожен стан, який може показати квартира чи підлога, — кадр, що є в маніфесті.

import { describe, expect, it } from "vitest";

import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { BOWL_CAPACITY, FEEDER_CAPACITY, STORAGE_LIMITS, WATER_CAPACITY } from "../src/sim/config";
import { DUST_SPOTS, dustOf } from "../src/sim/dust";
import { STORAGES, storageStages } from "../src/sim/storage";
import { MAP, MAP_HEIGHT, MAP_WIDTH, objectById, OBJECTS, roomAt, TRINKETS, WINDOWS } from "../src/sim/home";
import type { BowlItem, Dish, Feeder, GameState, LitterItem, MessKind, Quality, WaterItem } from "../src/sim/types";
import { artEntry } from "../src/view/art/manifest";
import { pointsOn, WALL_HEIGHT, WALL_SEGMENTS, wallKind } from "../src/view/art/manifest/lib/geometry";
import { frameId, type ArtId } from "../src/view/art/types";
import { BOILER, CANDLES, PANES, POWER_STATION, SCONCES } from "../src/view/decor";
import { decorLook } from "../src/view/iso/decorlook";
import { IsoDepth } from "../src/view/iso/depth";
import { ANCHOR_GAP, artOffset, boxCovers, floorAnchorAt, footprintCorners, objectAnchorAt, objectScreen, PERSON_FIGURE, wallsToFade } from "../src/view/iso/geometry";
import {
  basketState,
  bedState,
  bowlFrame,
  boxesState,
  cabinetLook,
  cobwebLook,
  computerState,
  dishFrame,
  dustFrame,
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
  TRACE_OVERLAYS,
  traceFrame,
  trashState,
  trinketFrame,
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
  for (const overlay of TRACE_OVERLAYS) {
    const trace = traceFrame(state, overlay);
    if (trace) frames.push(trace);
  }
  // Декор, якого сим не знає (§8.9, §4.1): вікна, бра, бойлер; станція й свічки дня відключення — о хвилині стану.
  for (const pane of PANES) frames.push({ id: `env/window/${pane.room}`, state: null });
  const decor = decorLook(state, state.minute);
  for (const sconce of SCONCES) frames.push({ id: sconce.id, state: decor.sconce });
  frames.push({ id: "env/boiler", state: decor.boiler });
  if (decor.station) frames.push({ id: "env/power-station", state: null });
  if (decor.candles) frames.push({ id: "env/candle", state: decor.candles });
  // Вертикальний пилосос на підлозі, пил і павутина (§8.7).
  if (state.home.vacuumAt) frames.push({ id: "env/vacuum", state: null });
  for (const index of dustOf(state)) {
    const spot = DUST_SPOTS[index]!;
    const look = spot.kind === "cobweb" ? (cobwebLook(spot)?.frame ?? null) : dustFrame(index);
    if (!look) throw new Error(`пил на місці ${index}: кадру немає`);
    frames.push(look);
  }
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
      // pivot.y = поле полотна + найвища точка + чверть висоти ромба сліду (`lib/geometry.ts`, `box`); поле — `PAD` 8, а в
      // еталонах F1 — не менше 4 (`art/STYLE.md`: «поле полотна»).
      const margin = entry.pivot.y - ((object.w + object.h) * 64) / 4 - isoObjectLook(object.id).tall;
      expect(margin >= 4 && margin <= 8, `${object.id}: поле над найвищою точкою — ${margin}`).toBe(true);
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
    // Підвіконня: кіт сидить на дошці на висоті верху — там, куди його садовить ізометричний вигляд.
    for (const pane of WINDOWS) {
      const object = objectById(pane.sill);
      const entry = artEntry(`env/${pane.sill}`);
      if (!entry) throw new Error(pane.sill);
      const perch = isoCatPerch(pane.sill, pane.seat, false);
      const at = pointsOn(object, entry)((perch.at.x - object.x) / object.w, (perch.at.y - object.y) / object.h, perch.lift);
      expect(at, pane.sill).toEqual(entry.points?.["seat"]);
    }
  });

  it("кіт на речі — над своєю точкою на висоті верху; у душі — на піддоні біля входу; під річчю — з-під ближчого краю", () => {
    expect(isoCatPerch("fridge", { x: 13.5, y: 1.5 }, false)).toEqual({ at: { x: 13.5, y: 1.5 }, lift: 150 });
    expect(isoCatPerch("wardrobe", { x: 6.4, y: 1.6 }, false)).toEqual({ at: { x: 6.4, y: 1.6 }, lift: 170 });
    expect(isoCatPerch("sofa", { x: 14.5, y: 10.5 }, false).lift).toBe(34);
    expect(isoCatPerch("boxes", { x: 12.5, y: 9.5 }, false).lift).toBe(48);
    expect(isoCatPerch("shower", { x: 8.2, y: 1.3 }, false)).toEqual({ at: { x: 8.5, y: 1.85 }, lift: 6 });
    // Підвіконня — дзеркальні: в обох кімнатах кіт посередині дошки на 0,12 від стіни з вікном, хоч у симуляції у вітальні
    // він на 0,3 від стіни (`WINDOWS`), на самому краї дошки.
    expect(isoCatPerch("sill-bedroom", { x: 4.5, y: 1.12 }, false)).toEqual({ at: { x: 4.5, y: 1.12 }, lift: 70 });
    expect(isoCatPerch("sill-living", { x: 1.3, y: 8.5 }, false)).toEqual({ at: { x: 1.12, y: 8.5 }, lift: 70 });
    // Під ліжком (1 × 2): ближчий до камери край — правий (x = 2) для кота біля нього, нижній (y = 3) — для кота в ногах.
    expect(isoCatPerch("bed", { x: 1.8, y: 1.5 }, true)).toEqual({ at: { x: 2, y: 1.5 }, lift: 0 });
    expect(isoCatPerch("bed", { x: 1.3, y: 2.8 }, true)).toEqual({ at: { x: 1.3, y: 3 }, lift: 0 });
    // На кожну річ, крім дверей, кіт може вилізти, і стоїть не вище за її найвищу точку.
    for (const object of OBJECTS) {
      const perch = isoCatPerch(object.id, { x: object.x + 0.5, y: object.y + 0.5 }, false);
      expect(perch.lift, object.id).toBeLessThanOrEqual(isoObjectLook(object.id).tall);
    }
  });

  it("на мішку наповнювача й баку стерильного корму кіт стоїть на висоті їхньої форми за наповненням (perchFull)", () => {
    for (const id of ["litter-bag", "sterile-bin"]) {
      const object = objectById(id);
      const at = { x: object.x + 0.5, y: object.y + 0.5 };
      const entry = artEntry(`env/${id}`);
      if (!entry) throw new Error(id);
      const lifts = ([0, 1, 2, 3, 4] as const).map((stage) => isoCatPerch(id, at, false, stage).lift);
      // Що повніше, то вище (мішок росте, на баку кришка лягає на гірку корму), і в межах полотна запису.
      for (let i = 1; i < lifts.length; i++) expect(lifts[i], `${id} full-${i}`).toBeGreaterThanOrEqual(lifts[i - 1]!);
      for (const lift of lifts) expect(lift, id).toBeLessThan(entry.pivot.y);
      // Без наповнення — стала висота `perch`; під річчю — на підлозі за будь-якого наповнення.
      expect(isoCatPerch(id, at, false).lift).toBe(isoObjectLook(id).perch);
      expect(isoCatPerch(id, at, true, 4).lift).toBe(0);
    }
    // Порожній мішок зіжмаканий на підлозі: кіт на ньому — майже на підлозі, а не на висоті повного (рецензія хвилі 3).
    const bag = objectById("litter-bag");
    const on = { x: bag.x + 0.5, y: bag.y + 0.5 };
    expect(isoCatPerch("litter-bag", on, false, 0).lift).toBeLessThanOrEqual(6);
    expect(isoCatPerch("litter-bag", on, false, 1).lift).toBeLessThan(isoObjectLook("litter-bag").top / 2);
    // Інші речі від наповнення не залежать.
    expect(isoCatPerch("fridge", { x: 13.5, y: 1.5 }, false, 0).lift).toBe(150);
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
      ["vacuum", () => "env/vacuum"],
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

describe("пил і павутина (iso/looks.ts, §8.7)", () => {
  it("кожне місце пилу — свій кадр: купка в куті, смужка вздовж осі стіни, клубки на підлозі різняться з сусідами", () => {
    DUST_SPOTS.forEach((spot, index) => {
      const look = spot.kind === "cobweb" ? (cobwebLook(spot)?.frame ?? null) : dustFrame(index);
      expect(look, `місце ${index}`).not.toBeNull();
      if (spot.kind === "cobweb") expect(dustFrame(index)).toBeNull();
      if (spot.kind === "wall") expect(look?.id).toBe(spot.along === "y" ? "mess/dust/wall-y" : "mess/dust/wall-x");
      if (spot.kind === "corner") expect(look?.id).toBe("mess/dust/corner");
    });
    // Сусідні клубки на підлозі однієї кімнати — різні.
    DUST_SPOTS.forEach((spot, index) => {
      const next = DUST_SPOTS[index + 1];
      if (spot.kind === "floor" && next?.kind === "floor" && next.room === spot.room) expect(dustFrame(index)?.state).not.toBe(dustFrame(index + 1)?.state);
    });
  });

  it("павутина — на задній стіні свого кута: верхня вершина кімнати — за мапою стін, правий кут ванної — віддзеркалена чверть", () => {
    const cobwebs = DUST_SPOTS.filter((spot) => spot.kind === "cobweb");
    expect(cobwebs.map((spot) => spot.room)).toEqual(["bedroom", "bathroom", "kitchen", "living"]);
    const looks = Object.fromEntries(cobwebs.map((spot) => [spot.room, cobwebLook(spot)]));
    expect(looks["bedroom"]).toEqual({ frame: { id: "mess/cobweb", state: "corner" }, flip: false });
    expect(looks["kitchen"]).toEqual({ frame: { id: "mess/cobweb", state: "wall-x" }, flip: false });
    expect(looks["living"]).toEqual({ frame: { id: "mess/cobweb", state: "wall-y" }, flip: false });
    // Ванна (12, 1): задня стіна y = 0 підходить до кута зліва, праворуч — низька внутрішня стіна; рівний край — праворуч.
    expect(looks["bathroom"]).toEqual({ frame: { id: "mess/cobweb", state: "wall-x" }, flip: true });
    // Лівий кут кімнати (дзеркально) і середина кімнати.
    expect(cobwebLook({ x: 1, y: 5 })).toEqual({ frame: { id: "mess/cobweb", state: "wall-y" }, flip: true });
    expect(cobwebLook({ x: 4, y: 3 })).toBeNull();
  });
});

describe("декор квартири (decor.ts, §8.9 «День і ніч», §4.1 «Планове відключення»)", () => {
  /** Клітинка задньої стіни за лицем: лице y — ряд 0 над `along`, лице x — стовпець 0 ліворуч від `along`. */
  const backWall = (face: "y" | "x", along: number): string | null =>
    face === "y" ? wallKind(Math.floor(along), 0) : wallKind(0, Math.floor(along));
  /** Кімната перед лицем стіни. */
  const roomBy = (face: "y" | "x", along: number): string | null => roomAt(face === "y" ? { x: along, y: 1.5 } : { x: 1.5, y: along });

  it("вікна — у задніх стінах своєї кімнати: над підвіконнями — ті самі, що WINDOWS, кухонне (16, 0) — без підвіконня", () => {
    expect(PANES.filter((p) => p.sill).map((p) => ({ sill: p.sill, wall: p.wall }))).toEqual(WINDOWS.map((w) => ({ sill: w.sill, wall: w.wall })));
    for (const pane of PANES) {
      const along = pane.face === "y" ? pane.wall.x : pane.wall.y;
      expect(pane.face === "y" ? pane.wall.y : pane.wall.x, pane.room).toBe(0);
      expect(backWall(pane.face, along), pane.room).toBe("back");
      expect(roomBy(pane.face, (pane.span[0] + pane.span[1]) / 2), pane.room).toBe(pane.room);
      // Отвір — у межах клітинки стіни й нижче за кришку стіни.
      expect(pane.span[0] >= along && pane.span[1] <= along + 1, pane.room).toBe(true);
      expect(pane.z[0] > 0 && pane.z[1] < ISO_WALLS.back, pane.room).toBe(true);
    }
    const kitchen = PANES.find((p) => p.room === "kitchen");
    expect(kitchen?.sill).toBeUndefined();
    // Над кахельним фартухом кухні (z до 118) і над стільницею під ним.
    expect(kitchen?.z[0]).toBeGreaterThan(118);
    expect(kitchen && isoObjectLook("counter-right").tall).toBeLessThan(kitchen?.z[0] ?? 0);
  });

  it("бра й бойлер — на лиці задньої стіни своєї кімнати, нижче за кришку стіни й обабіч вікон (не на фіранках)", () => {
    for (const sconce of SCONCES) {
      const along = sconce.face === "y" ? sconce.at.x : sconce.at.y;
      expect(sconce.face === "y" ? sconce.at.y : sconce.at.x, sconce.id).toBe(1);
      expect(backWall(sconce.face, along), `${sconce.id} (${along})`).toBe("back");
      expect(roomBy(sconce.face, along), `${sconce.id} (${along})`).toBe(sconce.room);
      expect(sconce.lamp > 100 && sconce.lamp < ISO_WALLS.back - 30, sconce.id).toBe(true);
      // Фіранки виходять за отвір на ≈ 0,4 клітинки з кожного боку; абажур — ≈ 0,17 від осі.
      for (const pane of PANES) {
        if (pane.face !== sconce.face) continue;
        expect(along < pane.span[0] - 0.4 - 0.17 || along > pane.span[1] + 0.4 + 0.17, `${sconce.id} (${along}) біля вікна ${pane.room}`).toBe(true);
      }
    }
    expect(SCONCES.map((s) => s.room).sort()).toEqual(["bedroom", "living", "living"]);
    // Бойлер — у ванній над пральною машиною: вище за неї й нижче за кришку стіни.
    expect(BOILER.at.y).toBe(1);
    expect(backWall("y", BOILER.at.x)).toBe("back");
    expect(roomBy("y", BOILER.at.x)).toBe("bathroom");
    const washer = objectById("washer");
    expect(BOILER.at.x > washer.x && BOILER.at.x < washer.x + washer.w).toBe(true);
    expect(BOILER.z[0]).toBeGreaterThan(isoObjectLook("washer").tall);
    expect(BOILER.z[1]).toBeLessThan(ISO_WALLS.back);
    expect(BOILER.led > BOILER.z[0] && BOILER.led < BOILER.z[1]).toBe(true);
  });

  it("свічки — над своїми господарями: у сліді з блюдцем, на висоті верху, не на страві й не на дрібничці", () => {
    /** Півдіаметр блюдця, клітинки (`art/env/candle.svg`). */
    const SAUCER = 0.125;
    for (const candle of CANDLES) {
      const object = objectById(candle.host);
      const look = isoObjectLook(candle.host);
      const f = look.footprint;
      const { x, y } = candle.at;
      expect(x - SAUCER >= f.x0 && x + SAUCER <= f.x1 && y - SAUCER >= f.y0 && y + SAUCER <= f.y1, `${candle.host}: (${x}, ${y}) у сліді`).toBe(true);
      expect(candle.z, candle.host).toBe(look.top);
      // Не на страві й не на дрібничці господаря: точки кадру господаря (одиниці арту) далі за пів блюдця й пів дрібнички.
      const entry = artEntry(`env/${candle.host}`);
      if (!entry) throw new Error(candle.host);
      const at = pointsOn(object, entry)((x - object.x) / object.w, (y - object.y) / object.h, candle.z);
      const busy = ["dish", ...TRINKETS.filter((t) => t.object === candle.host).map((t) => t.kind)];
      for (const name of busy) {
        const p = entry.points?.[name];
        if (p) expect(Math.hypot(p.x - at.x, p.y - at.y), `${candle.host}: свічка біля «${name}»`).toBeGreaterThan(20);
      }
    }
    // На кожній речі — не більше однієї свічки, і всі господарі різні.
    expect(new Set(CANDLES.map((c) => c.host)).size).toBe(CANDLES.length);
  });

  it("зарядна станція — на вільній підлозі праворуч від стола з комп'ютером, перед стіною ряду 5 і лівіше за розетку дроту", () => {
    const { x, y } = POWER_STATION.at;
    /** Півслід станції (`art/env/power-station.svg`): 0,46 × 0,3 клітинки. */
    const half = { x: 0.23, y: 0.15 };
    const box = { x0: x - half.x, y0: y - half.y, x1: x + half.x, y1: y + half.y };
    expect(MAP[Math.floor(y)]?.[Math.floor(x)]).toBe(".");
    for (const object of OBJECTS) {
      const f = isoObjectLook(object.id).footprint;
      const overlaps = box.x0 < f.x1 && box.x1 > f.x0 && box.y0 < f.y1 && box.y1 > f.y0;
      expect(overlaps, `станція на ${object.id}`).toBe(false);
    }
    const desk = isoObjectLook("computer").footprint;
    expect(box.x0).toBeGreaterThanOrEqual(desk.x1);
    expect(box.y0).toBeGreaterThan(6);
    expect(box.y1).toBeLessThan(desk.y1);
    // Розетка дроту — над (8,75; 6): станція її не закриває.
    expect(box.x1).toBeLessThan(8.75 - 0.1);
    expect(POWER_STATION.display).toBeGreaterThan(0);
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
      // Без наповнювача лоток брудний після першого ж відвідування (`LITTER_CAPACITY.none`): видно, і є запах.
      expect(litterFrame(litter(null, 1)).state).toBe("empty-dirty");
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

  it("холодильник: кожен рівень продуктів — свій кадр, з самими маминими судочками — зачинений без продуктів нагорі", () => {
    const state = applyScenario(FILE_SCENARIOS["empty-supplies"]!).current;
    state.home.acquired = [...new Set([...state.home.acquired, "food" as const])];
    const fridge = STORAGES.find((s) => s.object === "fridge")!;
    const seen = new Set<string>();
    for (let count = 0; count <= STORAGE_LIMITS.food; count++) {
      state.home.supplies.food = { cheap: count, premium: 0 };
      state.home.supplies.momMeal = { cheap: 0, premium: 0 };
      const look = fridgeLook(state);
      const stage = storageStages(state, fridge)[0]!;
      expect(look.body.state).toBe(stage === 0 ? "open" : "closed");
      expect(look.food).toEqual({ id: "env/fridge/food", state: `full-${stage}` });
      expect(look.mom).toBe(false);
      seen.add(look.food!.state!);
    }
    expect([...seen].sort()).toEqual(["full-0", "full-1", "full-2", "full-3", "full-4"]);
    // Продуктів немає, а мамині судочки є: зачинений, нагорі — лише судочок (не банка «мало»).
    state.home.acquired = [...new Set([...state.home.acquired, "momMeal" as const])];
    state.home.supplies.food = { cheap: 0, premium: 0 };
    state.home.supplies.momMeal = { cheap: 1, premium: 0 };
    expect(fridgeLook(state)).toEqual({ body: { id: "env/fridge", state: "closed" }, food: null, mom: true });
    // Продукти й судочки разом — рівень продуктів.
    state.home.supplies.food = { cheap: STORAGE_LIMITS.food, premium: 0 };
    expect(fridgeLook(state).food?.state).toBe("full-4");
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

describe("згасання внутрішніх стін (iso/geometry.ts, wallsToFade)", () => {
  const inner = WALL_SEGMENTS.filter((s) => s.kind === "inner");
  const boxes = inner.map((s) => ({ x0: s.rect.x, y0: s.rect.y, x1: s.rect.x + s.rect.w, y1: s.rect.y + s.rect.h }));
  const h = ISO_WALLS.inner;

  /** Стан без речей котячого кутка й безладу, усі коти сплять у вітальні, персонаж — посеред вітальні. */
  function quiet(): GameState {
    const state = applyScenario(FILE_SCENARIOS["food-hygiene"]!).current;
    state.home.items = [];
    state.home.messes = [];
    state.home.trinkets = {};
    state.cats.forEach((cat, i) => {
      cat.away = null;
      cat.x = 2.5 + i * 0.7;
      cat.y = 9.5;
      cat.act = { kind: "sleep", target: null, goal: null, minutes: 600, elapsed: 5 };
    });
    state.character.body.x = 4.5;
    state.character.body.y = 8.5;
    state.character.activity = null;
    state.character.held = null;
    return state;
  }

  /** Назви стін, що згасають. */
  function faded(state: GameState): string[] {
    const out: boolean[] = [];
    wallsToFade(state, boxes, h, out);
    return inner.filter((_, i) => out[i]).map((s) => s.id.replace("env/wall/inner/", ""));
  }

  const litter = (id: number, slot: string): LitterItem => ({ id, kind: "litter", quality: "cheap", slot, litter: "cheap", uses: 9 });

  it("нічого за стінами — жодна не згасає", () => {
    expect(faded(quiet())).toEqual([]);
  });

  it("лотки в слотах litter-3 і litter-4 за стіною x = 12 гасять її; litter-1 і litter-2 видно й так", () => {
    const state = quiet();
    state.home.items = [litter(801, "litter-1"), litter(802, "litter-2")];
    expect(faded(state)).toEqual([]);
    state.home.items = [litter(803, "litter-3")];
    expect(faded(state)).toEqual(["col12-y1"]);
    state.home.items = [litter(804, "litter-4")];
    expect(faded(state)).toEqual(["col12-y1"]);
  });

  it("безлад у стовпцях x = 6 і x = 11 гасить стіну перед ним; трохи далі від стіни — ні", () => {
    const state = quiet();
    state.home.messes = [{ id: 951, kind: "vomit", x: 6.5, y: 2.6, cat: null }];
    expect(faded(state)).toEqual(["col7-y1"]);
    state.home.messes = [{ id: 952, kind: "surprise", x: 11.4, y: 2.5, cat: null }];
    expect(faded(state)).toEqual(["col12-y1"]);
    state.home.messes = [{ id: 953, kind: "surprise", x: 5.5, y: 2.5, cat: null }];
    expect(faded(state)).toEqual([]);
  });

  it("пилосос на підлозі за стіною гасить її — у стовпцях x = 6 і x = 11 і біля проходу під стіною ряду 5; далі від стіни — ні (рецензія 2026-11-02)", () => {
    const state = quiet();
    expect(state.home.vacuumAt).not.toBeNull();
    state.home.vacuumAt = { x: 6.5, y: 3.5 };
    expect(faded(state)).toEqual(["col7-y1"]);
    state.home.vacuumAt = { x: 11.5, y: 2.5 };
    expect(faded(state)).toEqual(["col12-y1"]);
    state.home.vacuumAt = { x: 16.5, y: 4.5 };
    expect(faded(state)).toEqual(["row5-x17"]);
    state.home.vacuumAt = { x: 5.5, y: 2.5 };
    expect(faded(state)).toEqual([]);
    state.home.vacuumAt = null;
    expect(faded(state)).toEqual([]);
  });

  it("кіт, що сидить за стіною, гасить її; той, що лише йде повз, на руках чи високо на шафі, — ні", () => {
    const state = quiet();
    const cat = state.cats[0]!;
    cat.x = 11.5;
    cat.y = 3.5;
    expect(faded(state)).toEqual(["col12-y1"]);
    cat.act.goal = { x: 9, y: 3 };
    expect(faded(state)).toEqual([]);
    cat.act.goal = null;
    state.character.held = { kind: "cat", cat: cat.id };
    expect(faded(state)).toEqual([]);
    state.character.held = null;
    // Шафа (6, 1) у стовпці за стіною x = 7: кіт нагорі (170) — над стіною, його видно.
    cat.x = 6.5;
    cat.y = 1.5;
    expect(faded(state)).toEqual([]);
  });

  it("умивальник (11, 1) за стіною x = 12: кіт на ньому видно й так, а той, що сховався під ним, — на підлозі й гасить стіну", () => {
    const state = quiet();
    const cat = state.cats[0]!;
    cat.x = 11.5;
    cat.y = 1.5;
    // П'є з крана на стільниці (70) — над стіною (66): стіна стоїть, тумбу закриває, як і задумано (A3).
    cat.act = { kind: "drink", target: "sink", goal: null, minutes: 5, elapsed: 1 };
    expect(faded(state)).toEqual([]);
    // Ховається під умивальником — визирає з-під тумби на підлозі, яку закриває стіна: стіна згасає.
    cat.act = { kind: "hide", target: null, goal: null, minutes: 20, elapsed: 1 };
    expect(faded(state)).toEqual(["col12-y1"]);
    // Нагорі шафи (6, 1; за стіною x = 7) кіт ховається на виду — на верху (170), стіна його не закриває.
    cat.x = 6.5;
    expect(faded(state)).toEqual([]);
  });

  it("персонаж за стіною гасить її, як і раніше; у душовій кабіні — ні", () => {
    const state = quiet();
    state.character.body.x = 6.5;
    state.character.body.y = 3.5;
    expect(faded(state)).toEqual(["col7-y1"]);
    state.character.body.x = 8.5;
    state.character.body.y = 4.5;
    expect(faded(state)).toContain("row5-x5");
    state.character.activity = { kind: "use", target: "shower", progress: 0, inside: true };
    expect(faded(state)).toEqual([]);
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
