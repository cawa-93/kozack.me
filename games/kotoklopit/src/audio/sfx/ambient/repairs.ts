// Ремонт уривками (§11.4а, «Тло»): «Ремонт у сусідів» — дриль і молоток за стіною вітальні в робочі години сусідів,
// «Будівельний пил» — стукіт у під'їзді з боку вхідних дверей, поки пил осідає. Проміжки — реальний час (`AMBIENT`).

import { AMBIENT } from "../../config";
import { constructionDustHours } from "../../../sim/cleaner";
import { active } from "../../../sim/modifiers";
import type { GameState } from "../../../sim/types";
import type { Cue } from "../types";

const NONE: readonly Cue[] = [];
const DRILL: readonly Cue[] = [{ sound: "drill", at: AMBIENT.neighbors }];
const HAMMER: readonly Cue[] = [{ sound: "hammer", at: AMBIENT.neighbors }];
const STAIRWELL: readonly Cue[] = [{ sound: "stairwell", at: "door" }];
const DUST = constructionDustHours();

export const renovating = (state: GameState): boolean =>
  active(state, "renovation") && state.minute >= AMBIENT.renovation.from && state.minute < AMBIENT.renovation.to;

export const stairwellWork = (state: GameState): boolean => active(state, "construction-dust") && state.minute >= DUST.from && state.minute < DUST.to;

/** Відлік до наступного уривка; null — ремонт зараз не йде, і перший уривок після початку теж чекає свій проміжок. */
class Bursts {
  private left: number | null = null;

  constructor(
    private readonly everyMs: readonly [number, number],
    private readonly random: () => number,
  ) {}

  /** Чи настав уривок цього кадру. */
  due(on: boolean, dtMs: number): boolean {
    if (!on) {
      this.left = null;
      return false;
    }
    this.left = (this.left ?? this.next()) - dtMs;
    if (this.left > 0) return false;
    this.left = this.next();
    return true;
  }

  reset(): void {
    this.left = null;
  }

  private next(): number {
    const [from, to] = this.everyMs;
    return from + (to - from) * this.random();
  }
}

export class Repairs {
  private readonly neighbors: Bursts;
  private readonly stairwell: Bursts;

  constructor(private readonly random: () => number = Math.random) {
    this.neighbors = new Bursts(AMBIENT.renovation.everyMs, random);
    this.stairwell = new Bursts(AMBIENT.stairwell.everyMs, random);
  }

  tick(state: GameState, dtMs: number): readonly Cue[] {
    if (this.neighbors.due(renovating(state), dtMs)) return this.random() < 0.5 ? DRILL : HAMMER;
    return this.stairwell.due(stairwellWork(state), dtMs) ? STAIRWELL : NONE;
  }

  reset(): void {
    this.neighbors.reset();
    this.stairwell.reset();
  }
}
