// Дані згенерованого рівня — вхід для ігрового світу.

import type { Corner, TileMap } from "./grid";

export type ItemType = "dynamo" | "flashlight" | "gasLamp" | "flare" | "matchbook" | "lighter" | "battery" | "fuel" | "antidote";

export interface LampSpawn {
  /** Тайл стіни, на якому висить світильник. */
  tx: number;
  ty: number;
  /** Одиничний напрямок зі стіни в прохід (сектор світла — 180° навколо нього). */
  nx: number;
  ny: number;
  /** Клітинка, до якої прикріплений світильник. */
  cell: number;
  pointer: boolean;
  /** false — згаслий смолоскип рівня 3, суто декор (§11.2). */
  lit: boolean;
}

export interface ItemSpawn {
  type: ItemType;
  x: number;
  y: number;
}

export interface SpiderSpawn {
  x: number;
  y: number;
}

export interface LevelData {
  /** 0..4 (рівень 1..5). */
  index: number;
  runSeed: number;
  /** Номер спроби генерації, що вдалася (§5.1). */
  attempt: number;
  w: number;
  h: number;
  map: TileMap;
  startCell: number;
  exitCell: number;
  exitCorner: Corner;
  /** Рівень 5: тайл пролому у зовнішній стіні біля кутової клітинки виходу (§5.5); інакше null. */
  breach: { tx: number; ty: number } | null;
  /** Найкоротший шлях старт→вихід (клітинки), §6.1. */
  shortestPath: number[];
  spawn: { x: number; y: number; facing: number };
  webs: number[];
  lamps: LampSpawn[];
  holes: { tx: number; ty: number }[];
  items: ItemSpawn[];
  spiders: SpiderSpawn[];
}
