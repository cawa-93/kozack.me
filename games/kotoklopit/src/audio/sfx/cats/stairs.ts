// Кіт на сходах нявчить з-за дверей, поки його не впустять (§9.12, «Втікач»; над дверима — сталий бабл нявкання, §11.4):
// подій для цього немає, тож відлік — у `tick`.

import type { GameState } from "../../../sim/types";
import type { Cue } from "../types";

/** Пауза між нявканнями з-за дверей, мс: від і до. Перше — за `first` після того, як кіт вийшов. */
export const STAIRS_MEOW = { first: 2500, from: 5000, to: 9000 } as const;

const NONE: readonly Cue[] = [];
const CUE: readonly Cue[] = [{ sound: "meow-door", at: "door" }];

export class StairsMeow {
  private left: number = STAIRS_MEOW.first;

  tick(state: GameState, dtMs: number): readonly Cue[] {
    let outside = false;
    for (const cat of state.cats) {
      if (cat.away === "stairs") {
        outside = true;
        break;
      }
    }
    if (!outside) {
      this.left = STAIRS_MEOW.first;
      return NONE;
    }
    this.left -= dtMs;
    if (this.left > 0) return NONE;
    this.left = STAIRS_MEOW.from + Math.random() * (STAIRS_MEOW.to - STAIRS_MEOW.from);
    return CUE;
  }

  reset(): void {
    this.left = STAIRS_MEOW.first;
  }
}
