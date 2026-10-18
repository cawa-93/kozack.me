// Спорядження: рука й рюкзак на 3 слоти (§7.3). Кайданки займають усе одразу (§11.2.1).

import { BACKPACK_SLOTS } from "../config";
import { RELOAD_TARGET, type Item } from "./items";

export class Inventory {
  hand: Item | null = null;
  readonly backpack: (Item | null)[] = new Array(BACKPACK_SLOTS).fill(null);

  /** Кайданки в руці займають і руку, і весь рюкзак. */
  get handcuffed(): boolean {
    return this.hand?.kind === "handcuffs";
  }

  get backpackFull(): boolean {
    return this.handcuffed || this.backpack.every((s) => s !== null);
  }

  /** Вільний слот із найменшим номером або -1. */
  firstFreeSlot(): number {
    if (this.handcuffed) return -1;
    return this.backpack.findIndex((s) => s === null);
  }

  /** Чи вміщається підібраний предмет (§7.3): у порожню руку, інакше в рюкзак. */
  canPickUp(item: Item): boolean {
    if (this.hand === null) return true;
    if (item.isBurningFlare) return false; // зайнята рука — спершу треба її звільнити
    return this.firstFreeSlot() >= 0;
  }

  /**
   * Прилад, який перезарядить витратний матеріал (§7.3.7): відповідного типу, з найменшим зарядом,
   * за рівності — рука, потім слот із меншим номером. null — нічого перезаряджати (провал).
   */
  reloadTarget(consumable: Item): Item | null {
    const kind = RELOAD_TARGET[consumable.kind];
    if (!kind) return null;
    let best: Item | null = null;
    for (const it of this.all()) {
      if (it === consumable || it.kind !== kind) continue;
      if (!best || it.reloadLevel < best.reloadLevel) best = it;
    }
    return best;
  }

  all(): Item[] {
    const out: Item[] = [];
    if (this.hand) out.push(this.hand);
    for (const s of this.backpack) if (s) out.push(s);
    return out;
  }

  clear(): Item[] {
    const items = this.all();
    this.hand = null;
    this.backpack.fill(null);
    return items;
  }
}
