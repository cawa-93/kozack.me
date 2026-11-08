// Дія утриманням (§10, §11.4а): звучить, поки йде, — з першої миті, а не по завершенні. Відпустили кнопку — дія стоїть
// (прогрес не росте) і мовчить. Група каже, що звучить для своєї цілі (`ChorePlan`); тут лише відлік у `tick`.

import { useProgress } from "../../sim/actions";
import type { GameState, UseActivity } from "../../sim/types";
import type { Cue } from "./types";

export interface ChorePlan {
  /** Перший удар дії; без нього — `stroke`. */
  first?: readonly Cue[];
  /** Удар дії: на початку й далі через `everyMs` (від і до, мс реального часу), поки прогрес росте. */
  stroke: readonly Cue[];
  everyMs: readonly [number, number];
  /** Раз, коли частка дії перейде `at`: свіжий наповнювач у лоток наприкінці прибирання. */
  late?: { at: number; cues: readonly Cue[] };
}

/** Скільки прогрес може не рости, мс, а дія ще йде: сцена кличе симуляцію не щокадру. */
export const CHORE_GRACE_MS = 200;

const NONE: readonly Cue[] = [];

export class Chores {
  private target: string | null = null;
  /** Що звучить для цілі: питаємо раз на дію — ціль за дію не змінюється. */
  private plan: ChorePlan | null = null;
  private progress = 0;
  /** Скільки мс прогрес не ріс. */
  private still = Infinity;
  /** До наступного удару, мс: час іде й під час паузи, тож знову взята дія звучить одразу, а часте «тримав — відпустив» не тарабанить. */
  private left = 0;
  private struck = false;
  private lateDone = false;

  constructor(
    private readonly planFor: (state: GameState, activity: UseActivity) => ChorePlan | null,
    private readonly random: () => number = Math.random,
  ) {}

  tick(state: GameState, dtMs: number): readonly Cue[] {
    const activity = state.character.activity;
    if (activity?.kind !== "use" || state.trip !== null) {
      if (this.target !== null) this.reset();
      return NONE;
    }
    if (activity.target !== this.target) {
      this.reset();
      this.target = activity.target;
      this.plan = this.planFor(state, activity);
      this.progress = activity.progress;
      return NONE;
    }
    const plan = this.plan;
    if (plan === null) return NONE;
    this.left -= dtMs;
    if (activity.progress > this.progress) {
      this.progress = activity.progress;
      this.still = 0;
    } else this.still += dtMs;
    if (this.still > CHORE_GRACE_MS) return NONE;
    const late = plan.late;
    if (late && !this.lateDone && (useProgress(state) ?? 0) >= late.at) {
      this.lateDone = true;
      return late.cues;
    }
    if (this.left > 0) return NONE;
    const [from, to] = plan.everyMs;
    this.left = from + this.random() * (to - from);
    const cues = !this.struck && plan.first ? plan.first : plan.stroke;
    this.struck = true;
    return cues;
  }

  reset(): void {
    this.target = null;
    this.plan = null;
    this.progress = 0;
    this.still = Infinity;
    this.left = 0;
    this.struck = false;
    this.lateDone = false;
  }
}
