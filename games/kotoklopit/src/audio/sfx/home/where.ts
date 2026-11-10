// Де звучать речі дому (§11.4а): точки, яких немає серед речей квартири за id, — сховища запасів, уламки.

import { CARRIER_SPOT, robotDockAt } from "../../../sim/home";
import { STORAGES } from "../../../sim/storage";
import type { GameState, Product } from "../../../sim/types";
import type { SoundAt } from "../types";

/** Сховище, куди ліг запас (§6.4). */
export function storageAt(product: Product): SoundAt {
  return STORAGES.find((s) => s.products.includes(product))?.object ?? null;
}

/**
 * Що зламалося (подія `broke`): переноска — біля дверей, робот — на базі, річ котячого кутка й годівниця — там, де щойно лягли
 * уламки (подія не каже місця, а уламки вже на підлозі). Фонтанчик ламається вночі, коли квартири не чути.
 */
export function brokeAt(state: GameState, what: string): SoundAt {
  if (what === "carrier") return CARRIER_SPOT;
  if (what === "robot") return robotDockAt(state);
  const messes = state.home.messes;
  for (let i = messes.length - 1; i >= 0; i--) {
    const mess = messes[i]!;
    if (mess.kind === "broken") return { x: mess.x, y: mess.y };
  }
  return null;
}
