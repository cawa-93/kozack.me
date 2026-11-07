// Де звучить звук квартири (§11.4а): гучність від відстані до персонажа й зсув уліво-вправо, як на ізометричному екрані.
// Чисті функції: перевіряє `tests/sfx-place.test.ts`.

import { objectById } from "../../sim/home";
import type { GameState } from "../../sim/types";
import { SFX } from "../config";
import type { SoundAt } from "./types";

export interface Point {
  x: number;
  y: number;
}

/** Точка звуку в клітинках; null — без місця (чи кота немає вдома, чи такої речі немає). */
export function soundPoint(state: GameState, at: SoundAt | undefined): Point | null {
  if (at === null || at === undefined) return null;
  if (typeof at !== "string") return at;
  if (at === "person") return state.character.body;
  if (at.startsWith("cat:")) {
    const cat = state.cats.find((c) => c.id === Number(at.slice(4)));
    return cat && cat.away === null ? cat : null;
  }
  try {
    const object = objectById(at);
    return { x: object.x + object.w / 2, y: object.y + object.h / 2 };
  } catch {
    return null;
  }
}

/** Гучність від відстані: на повну до `SFX.near`, далі плавно до `SFX.floor` на `SFX.far`. */
export function distanceGain(distance: number): number {
  if (distance <= SFX.near) return 1;
  if (distance >= SFX.far) return SFX.floor;
  const t = (distance - SFX.near) / (SFX.far - SFX.near);
  const smooth = t * t * (3 - 2 * t);
  return 1 - (1 - SFX.floor) * smooth;
}

/** Зсув −1…1: на екрані x росте з x − y клітинок. */
export function panOf(listener: Point, source: Point): number {
  const dx = source.x - source.y - (listener.x - listener.y);
  return Math.max(-1, Math.min(1, dx / SFX.panTiles)) * SFX.pan;
}

/** Гучність і зсув звуку для персонажа в `listener`; точки немає — посередині й на повну. */
export function placement(listener: Point | null, source: Point | null): { gain: number; pan: number } {
  if (!listener || !source) return { gain: 1, pan: 0 };
  return { gain: distanceGain(Math.hypot(source.x - listener.x, source.y - listener.y)), pan: panOf(listener, source) };
}
