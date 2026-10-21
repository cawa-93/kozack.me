// Котячий куток і безлад на підлозі (§9.12): миски з кормом і водою, лотки, «сюрпризи», блювота,
// шерстяні грудки. Усе пласке й лежить на підлозі, тож малюється одним шаром під котами й персонажем.

import Phaser from "phaser";

import { isDirty } from "../sim/catai";
import { supplyCount } from "../sim/economy";
import { feederBowls, robotProgress } from "../sim/household";
import { BOWL_CAPACITY, WATER_CAPACITY } from "../sim/config";
import { itemPoint } from "../sim/home";
import type { GameState, HomeItem, Mess, Vec } from "../sim/types";
import { COLORS, TILE_H, TILE_W, toScreen } from "./geometry";

const BOWL = { cheap: 0x9aa3ab, premium: 0x4f7fb3 } as const;
const KIBBLE = { cheap: 0x8a5a33, premium: 0x6e2f22 } as const;
const LITTER = { cheap: 0xd6c6a2, premium: 0xece4d2 } as const;

/** Центр речі на екрані. */
export function itemScreen(item: HomeItem): { x: number; y: number } {
  const p = itemPoint(item);
  return toScreen({ x: p.x, y: p.y + (item.kind === "toy" ? 0 : 0.05) });
}

/** Іграшка-вудочка: паличка з пір'ям; дорога — яскравіша. */
export function drawToy(g: Phaser.GameObjects.Graphics, quality: "cheap" | "premium", x: number, y: number, scale = 1): void {
  const s = scale;
  g.lineStyle(2.5 * s, 0x8b5e3c).lineBetween(x - 12 * s, y, x + 6 * s, y - 10 * s);
  g.lineStyle(1.5 * s, COLORS.ink, 0.7).lineBetween(x + 6 * s, y - 10 * s, x + 10 * s, y - 2 * s);
  const feather = quality === "premium" ? 0xd9455f : 0x6fae6a;
  g.fillStyle(feather).fillEllipse(x + 11 * s, y + 1 * s, 6 * s, 10 * s).fillEllipse(x + 14 * s, y + 2 * s, 5 * s, 8 * s);
}

/** Де лежать клапті шерсті, коли її багато (§8.7): сталі місця по квартирі. */
const FUR_SPOTS: readonly { x: number; y: number }[] = [
  { x: 2.3, y: 7.4 }, { x: 5.2, y: 9.1 }, { x: 8.7, y: 7.8 }, { x: 12.4, y: 8.6 }, { x: 15.6, y: 7.2 }, { x: 17.4, y: 9.3 },
  { x: 4.1, y: 2.6 }, { x: 14.6, y: 2.4 }, { x: 9.6, y: 3.6 }, { x: 6.8, y: 8.9 }, { x: 11.2, y: 7.1 }, { x: 3.4, y: 9.6 },
];

export function drawCatCorner(g: Phaser.GameObjects.Graphics, state: GameState): void {
  g.clear();
  // Шерсть: що більше, то більше клаптів.
  const tufts = Math.floor((state.home.fur / 100) * FUR_SPOTS.length);
  for (const spot of FUR_SPOTS.slice(0, tufts)) {
    const { x, y } = toScreen(spot);
    g.fillStyle(0xcfc6bd, 0.75).fillEllipse(x, y, 10, 5).fillEllipse(x + 5, y - 2, 7, 4);
  }
  for (const item of state.home.items) drawHomeItem(g, item, state.home.appliances.fountain !== null);
  for (const mess of state.home.messes) drawMess(g, mess);
  drawAppliances(g, state);
}

/**
 * База робота-пилососа у вітальні й маршрут прибирання всією квартирою (§8.7): кухня, ванна,
 * спальня — крізь дверні прорізи (x 16, 11 і 4), потім уся вітальня й назад на базу.
 */
const ROBOT_DOCK: Vec = { x: 17.6, y: 8.2 };
const ROBOT_ROUTE: readonly Vec[] = [
  ROBOT_DOCK,
  { x: 16, y: 7 },
  // Кухня.
  { x: 16, y: 4.3 },
  { x: 18.4, y: 4.3 },
  { x: 13.5, y: 4.3 },
  { x: 16, y: 4.3 },
  { x: 16, y: 7 },
  // Ванна.
  { x: 11, y: 7 },
  { x: 11, y: 4.3 },
  { x: 8.6, y: 4.3 },
  { x: 8.6, y: 3.4 },
  { x: 11.4, y: 3.4 },
  { x: 11, y: 4.3 },
  { x: 11, y: 7 },
  // Спальня.
  { x: 4, y: 7 },
  { x: 4, y: 4.3 },
  { x: 1.6, y: 4.3 },
  { x: 1.6, y: 2.8 },
  { x: 6.4, y: 2.8 },
  { x: 6.4, y: 4.3 },
  { x: 4, y: 4.3 },
  { x: 4, y: 7 },
  // Вітальня — двома смугами.
  { x: 1.6, y: 7 },
  { x: 1.6, y: 9.2 },
  { x: 17, y: 9.2 },
  ROBOT_DOCK,
];

/** Точка на маршруті за часткою пройденого шляху 0–1. */
function along(route: readonly Vec[], progress: number): Vec {
  const lengths = route.slice(1).map((p, i) => Math.hypot(p.x - (route[i]?.x ?? 0), p.y - (route[i]?.y ?? 0)));
  let left = progress * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i] ?? 0;
    const a = route[i] ?? ROBOT_DOCK;
    const b = route[i + 1] ?? ROBOT_DOCK;
    if (left <= length) return { x: a.x + ((b.x - a.x) * left) / length, y: a.y + ((b.y - a.y) * left) / length };
    left -= length;
  }
  return route[route.length - 1] ?? ROBOT_DOCK;
}

/**
 * Техніка (§8.7) — видно, що вона є й що робить: бункер автогодівниці над мискою (у віконці — корм,
 * поки він є в запасі), робот-пилосос на базі чи в дорозі. Фонтанчики малює сама миска з водою.
 */
function drawAppliances(g: Phaser.GameObjects.Graphics, state: GameState): void {
  const appliances = state.home.appliances;
  const stocked = supplyCount(state, "catFood") > 0;
  for (const bowl of feederBowls(state)) {
    const { x, y } = itemScreen(bowl);
    const top = y - 46;
    g.fillStyle(appliances.feeder === "premium" ? 0xe9e4da : 0xc9ccd0).fillRoundedRect(x - 11, top, 22, 34, 5);
    g.fillStyle(0x2b2530, 0.25).fillRoundedRect(x - 7, top + 6, 14, 16, 3);
    if (stocked) g.fillStyle(KIBBLE.cheap).fillRoundedRect(x - 7, top + 12, 14, 10, 3);
    g.fillStyle(0x8c9aa6).fillRect(x - 3, top + 34, 6, 6);
    g.lineStyle(2, COLORS.ink).strokeRoundedRect(x - 11, top, 22, 34, 5).strokeRect(x - 3, top + 34, 6, 6);
  }
  if (appliances.robot) {
    const dock = toScreen(ROBOT_DOCK);
    g.fillStyle(0x4a4448).fillRoundedRect(dock.x - 16, dock.y + 4, 32, 8, 3);
    const progress = robotProgress(state);
    const { x, y } = toScreen(progress === null ? ROBOT_DOCK : along(ROBOT_ROUTE, progress));
    g.fillStyle(appliances.robot === "premium" ? 0x2f2f36 : 0x8c9aa6).fillEllipse(x, y, 30, 15);
    g.fillStyle(0xd8d4cc).fillEllipse(x, y - 3, 20, 9);
    // Вогник: зелений — їде, синій — заряджається на базі.
    g.fillStyle(progress === null ? 0x5fa8d3 : 0x5cbf5a).fillCircle(x, y - 4, 2.5);
    g.lineStyle(2, COLORS.ink).strokeEllipse(x, y, 30, 15);
  }
}

function drawHomeItem(g: Phaser.GameObjects.Graphics, item: HomeItem, fountain: boolean): void {
  const { x, y } = itemScreen(item);
  switch (item.kind) {
    case "bowl": {
      g.fillStyle(BOWL[item.quality]).fillEllipse(x, y, 30, 13);
      g.lineStyle(2, COLORS.ink).strokeEllipse(x, y, 30, 13);
      if (item.quality === "premium") g.lineStyle(1.5, 0xe8b93a).strokeEllipse(x, y - 1, 26, 10);
      if (item.food > 0) {
        // Корм для стерилізованих — зеленуватий, щоб миски не плутати (§9.8).
        const kibble = item.sterile ? 0x6f8a3a : KIBBLE[item.foodQuality ?? "cheap"];
        const size = 0.6 + (0.4 * item.food) / BOWL_CAPACITY;
        g.fillStyle(kibble).fillEllipse(x, y - 2 * size, 20 * size, 8 * size);
      }
      return;
    }
    case "water": {
      g.fillStyle(BOWL[item.quality]).fillEllipse(x, y, 28, 12);
      g.lineStyle(2, COLORS.ink).strokeEllipse(x, y, 28, 12);
      if (item.water > 0) g.fillStyle(0x6fb3d6, 0.9).fillEllipse(x, y - 1, 22 * (0.5 + (0.5 * item.water) / WATER_CAPACITY), 7);
      if (fountain) {
        // Фонтанчик (§8.7): білий купол посередині й струмінь, що дугою падає у воду.
        g.fillStyle(0xf3efe6).fillEllipse(x, y - 4, 12, 10);
        g.lineStyle(1.5, COLORS.ink).strokeEllipse(x, y - 4, 12, 10);
        g.lineStyle(2, 0x9fd0ea).beginPath().arc(x + 6, y - 8, 6, Math.PI, Math.PI * 1.9).strokePath();
        g.beginPath().arc(x - 6, y - 8, 6, Math.PI * 1.1, 0).strokePath();
      }
      return;
    }
    case "toy":
      drawToy(g, item.quality, x, y);
      return;
    case "litter": {
      const w = TILE_W * 0.78;
      const h = TILE_H * 0.62;
      g.fillStyle(item.quality === "premium" ? 0x6f8f8a : 0x8c9aa6).fillRoundedRect(x - w / 2, y - h / 2, w, h, 6);
      g.fillStyle(item.litter ? LITTER[item.litter] : 0x4a4448).fillRoundedRect(x - w / 2 + 4, y - h / 2 + 4, w - 8, h - 8, 4);
      g.lineStyle(2, COLORS.ink).strokeRoundedRect(x - w / 2, y - h / 2, w, h, 6);
      g.fillStyle(0x6b4a2b);
      for (let i = 0; i < Math.min(item.uses, 6); i++) g.fillCircle(x - w / 3 + ((i * 11) % (w * 0.66)), y - 3 + ((i * 7) % 9), 3.2);
      if (isDirty(item)) g.lineStyle(2, 0x7a8a3a, 0.8).lineBetween(x - 8, y - h / 2 - 2, x - 5, y - h / 2 - 12).lineBetween(x + 4, y - h / 2 - 2, x + 7, y - h / 2 - 12);
      return;
    }
    case "house": {
      // Будиночок: коробка з дахом і круглим входом; дорогий — м'який і яскравіший.
      const w = TILE_W * 0.7;
      const h = TILE_H * 0.55;
      const wall = item.quality === "premium" ? 0xc77d9a : 0xb59a72;
      g.fillStyle(wall).fillRect(x - w / 2, y - h, w, h);
      g.fillStyle(item.quality === "premium" ? 0x8e4a6a : 0x8a6e48).fillTriangle(x - w / 2 - 4, y - h, x + w / 2 + 4, y - h, x, y - h - 18);
      g.fillStyle(0x2b2530).fillEllipse(x, y - h * 0.38, w * 0.42, h * 0.62);
      g.lineStyle(2, COLORS.ink).strokeRect(x - w / 2, y - h, w, h).strokeTriangle(x - w / 2 - 4, y - h, x + w / 2 + 4, y - h, x, y - h - 18);
      return;
    }
    case "scratcher": {
      // Кігтеточка: стовпчик, обмотаний мотузкою, на підставці.
      g.fillStyle(0x8b6a4a).fillEllipse(x, y, 30, 12);
      g.fillStyle(item.quality === "premium" ? 0xe0c48a : 0xc8b08a).fillRect(x - 6, y - 40, 12, 40);
      g.lineStyle(1.5, 0x8a7350);
      for (let i = 1; i < 8; i++) g.lineBetween(x - 6, y - 40 + i * 5, x + 6, y - 38 + i * 5);
      if (item.quality === "premium") g.fillStyle(0xd9455f).fillEllipse(x, y - 44, 20, 8);
      g.lineStyle(2, COLORS.ink).strokeRect(x - 6, y - 40, 12, 40).strokeEllipse(x, y, 30, 12);
      return;
    }
  }
}

function drawMess(g: Phaser.GameObjects.Graphics, mess: Mess): void {
  const { x, y } = toScreen(mess);
  switch (mess.kind) {
    case "surprise":
      g.fillStyle(0x6b4a2b).fillEllipse(x, y, 16, 8).fillEllipse(x + 1, y - 4, 11, 6).fillEllipse(x, y - 7, 6, 4);
      g.lineStyle(1.5, COLORS.ink, 0.7).strokeEllipse(x, y, 16, 8);
      return;
    case "vomit":
      g.fillStyle(0xb5ad4a, 0.9).fillEllipse(x, y, 22, 10).fillEllipse(x + 8, y + 2, 9, 6).fillEllipse(x - 9, y - 1, 7, 5);
      return;
    case "hairball":
      g.fillStyle(0x8a7a68).fillEllipse(x, y - 2, 14, 9);
      g.lineStyle(1.5, 0x5a4c40).lineBetween(x - 6, y - 3, x + 5, y - 1).lineBetween(x - 4, y, x + 6, y - 4);
      return;
    case "litter":
      g.fillStyle(LITTER.cheap);
      for (const [dx, dy] of [[-10, 0], [-4, 3], [3, -2], [9, 2], [0, 5], [-7, -3], [6, 6]] as const) g.fillCircle(x + dx, y + dy, 2.2);
      return;
    case "mark":
      g.fillStyle(0xd6c94a, 0.55).fillEllipse(x, y, 26, 10);
      g.lineStyle(1.5, 0xa89a2a, 0.7).strokeEllipse(x, y, 26, 10);
      return;
    case "fur":
      g.fillStyle(0xcfc6bd, 0.95).fillEllipse(x - 6, y, 12, 7).fillEllipse(x + 5, y - 2, 10, 6).fillEllipse(x + 1, y + 4, 9, 5);
      g.lineStyle(1, 0x8a7a68).lineBetween(x - 10, y, x - 2, y - 1).lineBetween(x + 1, y - 3, x + 9, y - 1);
      return;
    case "broken":
      g.fillStyle(0xf3efe6).fillTriangle(x - 10, y, x - 4, y - 6, x - 2, y + 2).fillTriangle(x + 2, y + 1, x + 9, y - 4, x + 10, y + 4);
      g.lineStyle(1.5, COLORS.ink).strokeTriangle(x - 10, y, x - 4, y - 6, x - 2, y + 2).strokeTriangle(x + 2, y + 1, x + 9, y - 4, x + 10, y + 4);
      return;
  }
}
