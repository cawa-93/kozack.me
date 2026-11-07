// Де звучать речі дому (§11.4а): точки, яких немає серед речей квартири за id, — речі котячого кутка, сховища запасів, уламки.

import { CARRIER_SPOT, itemPoint, ROBOT_DOCK } from "../../../sim/home";
import { STORAGES } from "../../../sim/storage";
import type { GameState, Product } from "../../../sim/types";
import type { SoundAt } from "../types";

/** Річ котячого кутка за id; її вже немає — без місця. */
export function itemAt(state: GameState, id: number): SoundAt {
  const item = state.home.items.find((i) => i.id === id);
  return item ? itemPoint(item) : null;
}

/** Посередині між мисками: годівниці насипають разом, а другий такий самий звук у ту саму мить програвач пропустив би. */
export function bowlsAt(state: GameState, ids: readonly number[]): SoundAt {
  let x = 0;
  let y = 0;
  let count = 0;
  for (const item of state.home.items) {
    if (!ids.includes(item.id)) continue;
    const p = itemPoint(item);
    x += p.x;
    y += p.y;
    count++;
  }
  return count > 0 ? { x: x / count, y: y / count } : null;
}

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
  if (what === "robot") return ROBOT_DOCK;
  const messes = state.home.messes;
  for (let i = messes.length - 1; i >= 0; i--) {
    const mess = messes[i]!;
    if (mess.kind === "broken") return { x: mess.x, y: mess.y };
  }
  return null;
}
