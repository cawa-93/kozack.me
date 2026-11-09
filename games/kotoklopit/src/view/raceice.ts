// Ожеледиця в гонці (§8.5, модифікатор тижня «Ожеледиця», `DAY_MODIFIERS.md`): поверх асфальту й бордюрів — холодна плівка з
// блисками навскіс, щоб гравець бачив, чому машина гірше гальмує й перестроюється. Тут — вигляд і розрахунки, без Phaser; шар
// у сцені — `raceicelayer.ts`.

import { PALETTE } from "../../art/palette";
import type { GameState } from "../sim/types";
import { RACE_TILES } from "./art/manifest/a14-race";
import { scrollOffset } from "./racelook";

/**
 * Плитка льоду, одиниці арту: завширшки від бордюру до бордюру (`RACE_TILES.road.curb`), заввишки — крок плитки дороги, тож
 * біжить донизу разом із дорогою. Плівка — на всю плитку; блиски — смуги навскіс (`slant` — зсув праворуч на одиницю вгору):
 * нижній кінець (x, y), довжина вгору й товщина; усі всередині плитки, щоб на її стику не обривалися.
 */
export const RACE_ICE = {
  width: 2 * RACE_TILES.road.curb,
  height: RACE_TILES.road.period,
  film: { color: PALETTE.gasHi, alpha: 0.35 },
  glint: { color: PALETTE.paper, alpha: 0.5 },
  slant: 0.55,
  glints: [
    { x: 26, y: 130, length: 90, width: 8 },
    { x: 46, y: 124, length: 44, width: 4 },
    { x: 196, y: 84, length: 70, width: 6 },
    { x: 112, y: 262, length: 100, width: 9 },
    { x: 134, y: 254, length: 50, width: 4 },
    { x: 232, y: 352, length: 80, width: 7 },
    { x: 48, y: 440, length: 72, width: 6 },
    { x: 66, y: 434, length: 34, width: 4 },
    { x: 172, y: 488, length: 90, width: 7 },
  ],
} as const;

/** Дорога гонки крижана: увесь тиждень «Ожеледиці». */
export const icyRoad = (state: GameState): boolean => state.modifiers.week === "ice";

/** Лід у кадрі, px: від бордюру до бордюру навколо середини дороги `cx`, на всю висоту кадру. */
export function iceRect(cx: number, k: number, height: number): { x: number; y: number; width: number; height: number } {
  const half = (RACE_ICE.width / 2) * k;
  return { x: cx - half, y: 0, width: 2 * half, height };
}

/**
 * Зсув текстури льоду (`tilePositionY`, одиниці арту), коли проїхано `distance` px при масштабі `k`: як у плиток дороги
 * (`tileRows`), що більше проїхано, то нижче малюнок; у межах однієї плитки, щоб число не росло за довгу дорогу.
 */
export function iceScroll(distance: number, k: number): number {
  return -scrollOffset(distance / k, RACE_ICE.height);
}
