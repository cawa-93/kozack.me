// Квартира на екрані: підлога, стіни «три чверті» й речі-заглушки (§2.1, §8.4).
// Поки що все малюється кодом; ШІ-графіка прийде в кроці 16 плану.

import Phaser from "phaser";

import { MAP, MAP_HEIGHT, MAP_WIDTH, OBJECTS, ROOMS, RUG, WINDOWS, type HomeObject, type ObjectKind } from "../../sim/home";
import type { Item } from "../../sim/types";
import { drawToy } from "./catcorner";
import { drawMomMeal } from "../icons";
import { SHAPED_STORAGES } from "./storagelook";
import { objectHeight } from "../world/objects";
import { COLORS } from "../colors";
import type { ObliqueProjection } from "../world/projection";

/** Стіни: верхня грань і лицьова. */
const WALL_TOP = 0x3b3340;
const WALL_FACE = 0x6b5d6e;
/** Підлога кімнат. */
const FLOORS = {
  bedroom: 0x8f7a66,
  bathroom: 0x7f8f94,
  kitchen: 0x9a8c74,
  living: 0x86725f,
} as const;

const FILL: Record<ObjectKind, number> = {
  bed: 0x6f4e37,
  shower: 0xa9c4cc,
  sink: 0xd9d4cc,
  fridge: 0xd9d4cc,
  stove: 0x4a4448,
  counter: 0xa08a70,
  table: 0x8b5e3c,
  trash: 0x707a70,
  computer: 0x5d4b3f,
  sofa: 0x7a5c6e,
  door: 0x6e4a32,
  catCabinet: 0xb08a5a,
  washer: 0xe9e6df,
  vacuum: 0x8a7a6a,
  litterBag: 0xcdb98f,
  sterileBin: 0x8fb3c4,
  catKit: 0xf0ece4,
  boxes: 0xc49a62,
  wardrobe: 0x8a6e48,
  windowsill: 0xeeeae2,
};

/** Де на екрані верх речі: над ним висять бабли, на ньому лежать речі. */
export interface ObjectView {
  object: HomeObject;
  /** Верхня грань речі. */
  top: { x: number; y: number; w: number; h: number };
  /** Точка над річчю для бабла. */
  anchor: { x: number; y: number };
  /**
   * Що обводить підсвітка цілі, якщо не верхню грань: сховища-фігури (мішок, бак, аптечка) стоять
   * на підлозі, і рамка по «верхній грані» висіла б на стіні над ними.
   */
  outline?: { x: number; y: number; w: number; h: number };
  depth: number;
  /** Малюнок речі: сховище ховається, поки його немає в квартирі (§6.4). */
  graphics: Phaser.GameObjects.Graphics;
}

function shade(color: number, amount: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  const k = 1 + amount;
  return Phaser.Display.Color.GetColor(
    Math.min(255, Math.round(c.red * k)),
    Math.min(255, Math.round(c.green * k)),
    Math.min(255, Math.round(c.blue * k)),
  );
}

export function drawApartment(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, proj: ObliqueProjection): Map<string, ObjectView> {
  drawFloor(scene, layer, proj);
  drawWalls(scene, layer, proj);
  drawWindows(scene, layer, proj);
  drawWire(scene, layer, proj);
  const views = new Map<string, ObjectView>();
  for (const object of OBJECTS) views.set(object.id, drawObject(scene, layer, proj, object));
  return views;
}

function drawFloor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, proj: ObliqueProjection): void {
  const g = scene.add.graphics().setDepth(-1).addToDisplayList(layer);
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (MAP[y]?.[x] !== ".") continue;
      const room = ROOMS.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
      const base = FLOORS[room?.id ?? "living"];
      // Легка шахівниця, щоб було видно клітинки й відстані.
      const color = (x + y) % 2 === 0 ? base : shade(base, -0.05);
      const p = proj.toScreen({ x, y });
      g.fillStyle(color).fillRect(p.x, p.y, proj.tile.width, proj.tile.height);
    }
  }
  // Килим у вітальні.
  const rug = proj.rectToScreen(RUG);
  g.fillStyle(0x9a5f55, 0.55).fillRoundedRect(rug.x, rug.y, rug.w, rug.h, 10);
}

// Стіни малюються рядами: кожен ряд перекриває те, що стоїть за ним.
function drawWalls(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, proj: ObliqueProjection): void {
  for (let y = 0; y < MAP_HEIGHT; y++) {
    const g = scene.add
      .graphics()
      .setDepth(proj.depthOf(proj.toScreen({ x: 0, y: y + 1 }).y))
      .addToDisplayList(layer);
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (MAP[y]?.[x] !== "#") continue;
      const p = proj.toScreen({ x, y });
      g.fillStyle(WALL_TOP).fillRect(p.x, p.y - proj.wallRise, proj.tile.width, proj.tile.height);
      const below = y + 1 < MAP_HEIGHT && MAP[y + 1]?.[x] === ".";
      if (below) {
        g.fillStyle(WALL_FACE).fillRect(p.x, p.y + proj.tile.height - proj.wallRise, proj.tile.width, proj.wallRise);
        g.lineStyle(2, COLORS.ink, 0.6).lineBetween(p.x, p.y + proj.tile.height - proj.wallRise, p.x + proj.tile.width, p.y + proj.tile.height - proj.wallRise);
      }
    }
    // Чорнильний контур верхньої грані стін ряду.
    g.lineStyle(2, COLORS.ink, 0.9);
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (MAP[y]?.[x] !== "#") continue;
      const p = proj.toScreen({ x, y });
      if (!isWall(x, y - 1)) g.lineBetween(p.x, p.y - proj.wallRise, p.x + proj.tile.width, p.y - proj.wallRise);
      if (!isWall(x - 1, y)) g.lineBetween(p.x, p.y - proj.wallRise, p.x, p.y + proj.tile.height - (isWall(x, y + 1) ? proj.wallRise : 0));
      if (!isWall(x + 1, y)) g.lineBetween(p.x + proj.tile.width, p.y - proj.wallRise, p.x + proj.tile.width, p.y + proj.tile.height - (isWall(x, y + 1) ? proj.wallRise : 0));
    }
  }
}

function isWall(x: number, y: number): boolean {
  return MAP[y]?.[x] === "#";
}

/**
 * Дріт комп'ютера (§9.12, «Гризіння»; заглушка, рішення автора 2026-10-26): з правого боку комп'ютерного стола по підлозі, з
 * прогином, до розетки на задній стіні — там, де кіт його гризе (`WIRE_TILE`), щоб було видно, що гризе він саме дріт.
 */
function drawWire(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, proj: ObliqueProjection): void {
  const desk = OBJECTS.find((o) => o.kind === "computer");
  if (!desk) return;
  const right = desk.x + desk.w;
  const socketX = right + 0.75;
  // По підлозі: від стола квадратичною кривою з прогином до підніжжя стіни під розеткою.
  const from = proj.toScreen({ x: right, y: desk.y + 0.45 });
  const bend = proj.toScreen({ x: right + 0.25, y: desk.y + 0.8 });
  const to = proj.toScreen({ x: socketX, y: desk.y + 0.08 });
  const points: Phaser.Math.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const u = 1 - t;
    points.push(new Phaser.Math.Vector2(u * u * from.x + 2 * u * t * bend.x + t * t * to.x, u * u * from.y + 2 * u * t * bend.y + t * t * to.y));
  }
  const floor = scene.add.graphics().setDepth(-0.5).addToDisplayList(layer);
  floor.lineStyle(3, COLORS.ink, 0.9).strokePoints(points);
  // Розетка на лицьовій грані задньої стіни, над підлогою, і дріт угору до неї — поверх стіни.
  const base = proj.toScreen({ x: socketX, y: desk.y });
  const wall = scene.add.graphics().setDepth(proj.depthOf(base.y) + 0.02).addToDisplayList(layer);
  wall.lineStyle(3, COLORS.ink, 0.9).lineBetween(to.x, to.y, base.x, base.y - 9);
  wall.fillStyle(COLORS.paper).fillRoundedRect(base.x - 7, base.y - 20, 14, 12, 2);
  wall.lineStyle(1.5, COLORS.ink, 0.9).strokeRoundedRect(base.x - 7, base.y - 20, 14, 12, 2);
  wall.fillStyle(COLORS.ink).fillCircle(base.x - 3, base.y - 14, 1.3).fillCircle(base.x + 3, base.y - 14, 1.3);
}

/** Скло вікна: світле, з відблиском неба. */
const GLASS = 0xbfe0ef;

/**
 * Вікна над підвіконнями (§9.12, «Вікно»): скло в товщі стіни, як на плані квартири, а у вікні задньої стіни — ще й шибка на її
 * лицьовій грані. Світла й ночі вікна поки не змінюють — це прийде разом із днем і ніччю.
 */
function drawWindows(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, proj: ObliqueProjection): void {
  for (const pane of WINDOWS) {
    const { x, y } = pane.wall;
    const p = proj.toScreen(pane.wall);
    const g = scene.add
      .graphics()
      .setDepth(proj.depthOf(proj.toScreen({ x: 0, y: y + 1 }).y) + 0.01)
      .addToDisplayList(layer);
    const top = p.y - proj.wallRise;
    const cx = p.x + proj.tile.width / 2;
    g.lineStyle(2, COLORS.ink, 0.9);
    if (MAP[y + 1]?.[x] === ".") {
      // Задня стіна: скло вздовж неї в товщі стіни й шибка з рамою на лицьовій грані.
      g.fillStyle(GLASS).fillRect(p.x + 6, top + proj.tile.height / 2 - 6, proj.tile.width - 12, 12);
      g.strokeRect(p.x + 6, top + proj.tile.height / 2 - 6, proj.tile.width - 12, 12);
      const face = p.y + proj.tile.height - proj.wallRise;
      g.fillStyle(GLASS).fillRect(p.x + 8, face + 3, proj.tile.width - 16, proj.wallRise - 6);
      g.fillStyle(0xffffff, 0.6).fillTriangle(p.x + 12, face + 5, p.x + 22, face + 5, p.x + 12, face + 14);
      g.strokeRect(p.x + 8, face + 3, proj.tile.width - 16, proj.wallRise - 6).lineBetween(cx, face + 3, cx, face + proj.wallRise - 3);
    } else {
      // Бічна стіна: скло смугою вздовж стіни в її товщі.
      g.fillStyle(GLASS).fillRect(cx - 6, top + 4, 12, proj.tile.height - 8);
      g.fillStyle(0xffffff, 0.6).fillRect(cx - 4, top + 7, 3, 12);
      g.strokeRect(cx - 6, top + 4, 12, proj.tile.height - 8).lineBetween(cx - 6, top + proj.tile.height / 2, cx + 6, top + proj.tile.height / 2);
    }
  }
}

function drawObject(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, proj: ObliqueProjection, object: HomeObject): ObjectView {
  const r = proj.rectToScreen(object);
  const height = objectHeight(object.kind);
  const bottom = r.y + r.h;
  const depth = proj.depthOf(bottom);
  const g = scene.add.graphics().setDepth(depth).addToDisplayList(layer);

  if (object.kind === "door") {
    // Двері — у стіні: прямокутник на лицьовій грані з ручкою.
    const top = r.y - proj.wallRise;
    g.fillStyle(FILL.door).fillRect(r.x + 8, top + 4, r.w - 16, proj.tile.height + proj.wallRise - 8);
    g.lineStyle(3, COLORS.ink).strokeRect(r.x + 8, top + 4, r.w - 16, proj.tile.height + proj.wallRise - 8);
    g.lineBetween(r.x + r.w / 2, top + 4, r.x + r.w / 2, top + proj.tile.height + proj.wallRise - 4);
    g.fillStyle(0xe8b93a).fillCircle(r.x + r.w / 2 - 8, top + 40, 3).fillCircle(r.x + r.w / 2 + 8, top + 40, 3);
    return {
      object,
      top: { x: r.x + 8, y: top, w: r.w - 16, h: proj.tile.height + proj.wallRise },
      anchor: { x: r.x + r.w / 2, y: top - 4 },
      depth: depth + 1,
      graphics: g,
    };
  }

  const inset = 4;
  const top = { x: r.x + inset, y: r.y - height + inset, w: r.w - inset * 2, h: r.h - inset * 2 };
  if (object.kind === "boxes") return boxesView(g, object, top, height, depth);
  if (object.kind === "windowsill") return sillView(g, object, r, height, depth);
  // Мішок, бак і аптечку цілком малює `storagelook.ts`: їхня форма залежить від наповнення.
  if (SHAPED_STORAGES.has(object.kind)) {
    // Фігура стоїть на підлозі клітинки: від її низу на висоту речі (ручка чи горловина — трохи вище).
    const floor = top.y + top.h + height;
    const outline = { x: top.x, y: floor - height - 8, w: top.w, h: height + 8 };
    return { object, top, anchor: { x: top.x + top.w / 2, y: outline.y - 4 }, depth, graphics: g, outline };
  }
  const fill = FILL[object.kind];
  // Лицьова грань і верхня грань.
  g.fillStyle(shade(fill, -0.25)).fillRect(top.x, top.y + top.h, top.w, height);
  g.fillStyle(fill).fillRect(top.x, top.y, top.w, top.h);
  g.lineStyle(3, COLORS.ink).strokeRect(top.x, top.y, top.w, top.h + height);
  g.lineStyle(2, COLORS.ink, 0.7).lineBetween(top.x, top.y + top.h, top.x + top.w, top.y + top.h);
  decorate(g, object.kind, top, height);
  return { object, top, anchor: { x: top.x + top.w / 2, y: top.y - 4 }, depth, graphics: g };
}

/**
 * Підвіконня (§9.12, «Вікно»): вузька біла дошка вздовж стіни з вікном, а під нею — батарея з ребрами. Решта клітинки — підлога
 * перед батареєю; кіт сидить на дошці (`WINDOWS[].seat`).
 */
function sillView(g: Phaser.GameObjects.Graphics, object: HomeObject, r: { x: number; y: number; w: number; h: number }, height: number, depth: number): ObjectView {
  const back = WINDOWS.find((w) => w.sill === object.id)?.wall.y !== object.y;
  // Слід на підлозі: смуга біля задньої стіни чи біля лівої.
  const x0 = r.x + (back ? 4 : 2);
  const x1 = back ? r.x + r.w - 4 : r.x + 24;
  const y0 = r.y + 2;
  const y1 = back ? r.y + 20 : r.y + r.h - 2;
  // Батарея — лицьова грань з ребрами.
  g.fillStyle(0xc9ccd1).fillRect(x0, y1 - height, x1 - x0, height);
  g.lineStyle(1.5, COLORS.ink, 0.55);
  const fins = Math.max(3, Math.round((x1 - x0) / 7));
  for (let i = 1; i < fins; i++) g.lineBetween(x0 + ((x1 - x0) * i) / fins, y1 - height + 3, x0 + ((x1 - x0) * i) / fins, y1 - 2);
  g.lineStyle(2.5, COLORS.ink).strokeRect(x0, y1 - height, x1 - x0, height);
  // Дошка підвіконня згори, трохи нависла над батареєю.
  const top = { x: x0 - 2, y: y0 - height, w: x1 - x0 + 4, h: y1 - y0 };
  g.fillStyle(FILL.windowsill).fillRect(top.x, top.y, top.w, top.h);
  g.lineStyle(2.5, COLORS.ink).strokeRect(top.x, top.y, top.w, top.h);
  return { object, top, anchor: { x: top.x + top.w / 2, y: top.y - 4 }, depth, graphics: g };
}

/** Ящики біля входу (§6.4): купа коробок на підлозі клітинки; рамка цілі обводить саму купу. */
function boxesView(
  g: Phaser.GameObjects.Graphics,
  object: HomeObject,
  top: { x: number; y: number; w: number; h: number },
  height: number,
  depth: number,
): ObjectView {
  const floor = top.y + top.h + height;
  drawBoxPile(g, top, height, 2);
  const outline = { x: top.x, y: floor - height - 2, w: top.w, h: height + 2 };
  return { object, top, anchor: { x: top.x + top.w / 2, y: outline.y - 4 }, depth, graphics: g, outline };
}

/**
 * Купа ящиків (§6.4, правка автора 2026-10-23): 1–4 картонні коробки зі скотчем — що більше
 * упаковок усередині, то більше коробок. Одна — велика; дві — менша на більшій; три — дві внизу й
 * одна зверху; чотири — по дві внизу й зверху.
 */
export function drawBoxPile(g: Phaser.GameObjects.Graphics, top: { x: number; y: number; w: number; h: number }, height: number, count: number): void {
  g.clear();
  const floor = top.y + top.h + height;
  const box = (x: number, y: number, w: number, h: number): void => {
    // Кришка (верхня грань) і бік коробки.
    g.fillStyle(shade(FILL.boxes, -0.2)).fillRect(x, y + 7, w, h - 7);
    g.fillStyle(FILL.boxes).fillRect(x, y, w, 7);
    g.lineStyle(2.5, COLORS.ink).strokeRect(x, y, w, h);
    g.lineStyle(1.5, COLORS.ink, 0.6).lineBetween(x, y + 7, x + w, y + 7);
    // Скотч через кришку й бік.
    g.fillStyle(0xe8d9b0).fillRect(x + w / 2 - 3, y, 6, h);
    g.lineStyle(1, COLORS.ink, 0.4).strokeRect(x + w / 2 - 3, y, 6, h);
  };
  const { x, w } = top;
  const half = w / 2 - 1;
  if (count <= 0) return;
  if (count <= 2) box(x, floor - 24, w, 24);
  else {
    box(x - 4, floor - 22, half + 2, 22);
    box(x + w / 2 + 3, floor - 22, half + 2, 22);
  }
  if (count === 2) box(x + 8, floor - 24 - 16, w - 22, 16);
  if (count === 3) box(x + w * 0.2, floor - 22 - 17, w * 0.6, 17);
  if (count >= 4) {
    box(x + 2, floor - 22 - 16, half - 4, 16);
    box(x + w / 2 + 3, floor - 22 - 16, half - 4, 16);
  }
}

/** Деталі, з яких річ упізнавано. */
function decorate(
  g: Phaser.GameObjects.Graphics,
  kind: ObjectKind,
  t: { x: number; y: number; w: number; h: number },
  height: number,
): void {
  const cx = t.x + t.w / 2;
  switch (kind) {
    case "bed":
      g.fillStyle(0x6c7fa3).fillRect(t.x + 4, t.y + t.h * 0.3, t.w - 8, t.h * 0.7 - 4);
      g.fillStyle(0xe8e2d6).fillRoundedRect(t.x + 8, t.y + 6, t.w - 16, t.h * 0.22, 6);
      g.lineStyle(2, COLORS.ink).strokeRoundedRect(t.x + 8, t.y + 6, t.w - 16, t.h * 0.22, 6);
      break;
    case "shower":
      g.fillStyle(0xdde9ec).fillRect(t.x + 6, t.y + 6, t.w - 12, t.h - 12);
      g.fillStyle(COLORS.ink).fillCircle(cx, t.y + t.h / 2, 4);
      g.lineStyle(2, 0xffffff, 0.6).lineBetween(t.x + 10, t.y + t.h + 6, t.x + 22, t.y + t.h + height - 8);
      break;
    case "sink":
      g.fillStyle(0xffffff).fillEllipse(cx, t.y + t.h / 2, t.w - 14, t.h - 12);
      g.lineStyle(2, COLORS.ink).strokeEllipse(cx, t.y + t.h / 2, t.w - 14, t.h - 12);
      break;
    case "fridge":
      g.lineStyle(2, COLORS.ink).lineBetween(t.x, t.y + t.h + height * 0.4, t.x + t.w, t.y + t.h + height * 0.4);
      g.fillStyle(COLORS.ink).fillRect(t.x + t.w - 10, t.y + t.h + 8, 3, 14).fillRect(t.x + t.w - 10, t.y + t.h + height * 0.4 + 8, 3, 14);
      break;
    case "stove":
      for (const [dx, dy] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.72], [0.7, 0.72]] as const) {
        g.lineStyle(2.5, 0x2a2428).strokeCircle(t.x + t.w * dx, t.y + t.h * dy, 7);
      }
      break;
    case "counter":
      g.lineStyle(2, COLORS.ink, 0.5).lineBetween(t.x + 4, t.y + t.h + height / 2, t.x + t.w - 4, t.y + t.h + height / 2);
      break;
    case "table":
      g.fillStyle(shade(FILL.table, -0.35)).fillRect(t.x + 4, t.y + t.h + height, 5, 6).fillRect(t.x + t.w - 9, t.y + t.h + height, 5, 6);
      break;
    case "trash":
      g.fillStyle(shade(FILL.trash, -0.3)).fillRect(t.x + 6, t.y + 4, t.w - 12, t.h - 8);
      break;
    case "computer":
      // Монітор на столі.
      g.fillStyle(0x222026).fillRect(cx - 22, t.y - 26, 44, 28);
      g.lineStyle(2, COLORS.ink).strokeRect(cx - 22, t.y - 26, 44, 28);
      g.fillStyle(0x222026).fillRect(cx - 3, t.y + 2, 6, 6);
      g.fillStyle(0x3a3440).fillRect(cx - 18, t.y + t.h - 14, 36, 8);
      break;
    case "sofa":
      g.fillStyle(shade(FILL.sofa, 0.15)).fillRoundedRect(t.x + 6, t.y + 4, t.w - 12, t.h - 6, 6);
      break;
    case "catCabinet":
      // Шафка з котячим кормом: дверцята з відбитком лапки.
      g.lineStyle(2, COLORS.ink, 0.7).lineBetween(cx, t.y + t.h + 4, cx, t.y + t.h + height - 4);
      g.fillStyle(0x6b4a2b).fillCircle(cx - 7, t.y + t.h + height / 2 + 3, 3.5).fillCircle(cx - 10, t.y + t.h + height / 2 - 3, 1.6).fillCircle(cx - 5, t.y + t.h + height / 2 - 4, 1.6).fillCircle(cx - 2, t.y + t.h + height / 2 - 1, 1.6);
      break;
    case "washer":
      // Пральна машина: кругле віконце барабана.
      g.fillStyle(0x9ab3c4).fillCircle(cx, t.y + t.h + height / 2 + 2, 13);
      g.lineStyle(3, COLORS.ink).strokeCircle(cx, t.y + t.h + height / 2 + 2, 13);
      g.fillStyle(COLORS.ink).fillRect(t.x + 6, t.y + t.h + 4, 10, 3);
      break;
    case "vacuum":
      // Шафа з пилососом: дверцята й ручка.
      g.lineStyle(2, COLORS.ink, 0.7).strokeRect(t.x + 6, t.y + t.h + 4, t.w - 12, height - 8);
      g.fillStyle(COLORS.ink).fillCircle(t.x + t.w - 14, t.y + t.h + height / 2, 2.5);
      break;
    case "wardrobe":
      // Шафа (§9.12, «Лазіння»): дві стулки з ручками.
      g.lineStyle(2, COLORS.ink, 0.7).lineBetween(cx, t.y + t.h + 4, cx, t.y + t.h + height - 6);
      g.fillStyle(COLORS.ink).fillCircle(cx - 5, t.y + t.h + height / 2, 2).fillCircle(cx + 5, t.y + t.h + height / 2, 2);
      break;
    case "door":
      break;
  }
}

/** Як виглядає річ у руках чи на поверхні. Кота на руках малює вигляд кота. */
export function drawItem(g: Phaser.GameObjects.Graphics, item: Item, x: number, y: number, scale = 1): void {
  const s = scale;
  if (item.kind === "cat") return;
  if (item.kind === "toy") {
    drawToy(g, item.toy.quality, x, y - 6 * s, s);
    return;
  }
  if (item.kind === "catfood") {
    // Совочок корму.
    g.fillStyle(0xc9ccd1).fillRoundedRect(x - 10 * s, y - 8 * s, 20 * s, 9 * s, 3 * s);
    g.lineStyle(2, COLORS.ink).strokeRoundedRect(x - 10 * s, y - 8 * s, 20 * s, 9 * s, 3 * s);
    g.fillStyle(item.quality === "premium" ? 0x6e2f22 : 0x8a5a33).fillEllipse(x, y - 9 * s, 16 * s, 6 * s);
    return;
  }
  if (item.kind === "meal" && item.mom === true) {
    // Мамин судочок (§6.4, рішення автора 2026-10-26).
    drawMomMeal(g, x, y + 1 * s, s);
    return;
  }
  if (item.kind === "raw") {
    // Сира порція — паперовий пакунок із зеленню.
    g.fillStyle(0xd9b98a).fillRoundedRect(x - 9 * s, y - 14 * s, 18 * s, 16 * s, 3 * s);
    g.fillStyle(0x6fae6a).fillCircle(x - 3 * s, y - 15 * s, 4 * s).fillCircle(x + 4 * s, y - 16 * s, 3.5 * s);
    g.lineStyle(2, COLORS.ink).strokeRoundedRect(x - 9 * s, y - 14 * s, 18 * s, 16 * s, 3 * s);
  } else {
    const food = item.kind === "meal" ? 0xe0893a : 0x2a2224;
    g.fillStyle(0xffffff).fillEllipse(x, y - 2 * s, 26 * s, 10 * s);
    g.lineStyle(2, COLORS.ink).strokeEllipse(x, y - 2 * s, 26 * s, 10 * s);
    g.fillStyle(food).fillEllipse(x, y - 6 * s, 15 * s, 9 * s);
  }
  if (item.quality === "premium") g.fillStyle(0xe8b93a).fillCircle(x + 11 * s, y - 12 * s, 3 * s);
}
