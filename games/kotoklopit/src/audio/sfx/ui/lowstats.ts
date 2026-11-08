// Низькі шкали персонажа (§6, §11.4а): сигнал, коли шкала опустилась нижче `LOW_STAT`, — раз на перетин. Кличуть щокадру,
// тож лише чотири числа й жодних нових об'єктів.

import { LOW_STAT } from "../../../sim/config";
import type { GameState, StatName } from "../../../sim/types";

const STATS: readonly StatName[] = ["health", "satiety", "hygiene", "sanity"];

export class LowStats {
  /** Шкала вище межі й може спрацювати; спрацювала — чекає, поки знову підніметься до межі. */
  private readonly armed: boolean[] = STATS.map(() => false);
  private known = false;

  /** Чи якась шкала щойно перетнула межу згори вниз. Перший кадр після `reset` лише запам'ятовує стан. */
  crossed(state: GameState): boolean {
    const stats = state.character.stats;
    let crossed = false;
    for (let i = 0; i < STATS.length; i++) {
      const high = stats[STATS[i]!] >= LOW_STAT;
      if (this.known && this.armed[i] && !high) crossed = true;
      this.armed[i] = high;
    }
    this.known = true;
    return crossed;
  }

  /** Запам'ятати стан без сигналу: шкали, що впали за ніч, видно на ранку, і титулка не має починатися з тривоги. */
  sync(state: GameState): void {
    this.known = false;
    this.crossed(state);
  }

  reset(): void {
    this.known = false;
  }
}
