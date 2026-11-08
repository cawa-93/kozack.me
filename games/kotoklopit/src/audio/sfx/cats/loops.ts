// Тривале в котів петлями (§11.4а): мурчання під рукою, пиття, лоток, дряпання, зумі, бійка, гризіння. Протистояння
// петлі не має: симуляція й так шипить щохвилини гри (подія `hissed`). Петлі перечитують кожні `SFX.loopMs`: перелік
// перебудовується, лише коли в якогось кота змінилося, що звучить.

import { petTolerance } from "../../../sim/actions";
import { PET, PETTING } from "../../../sim/config";
import type { Cat, GameState } from "../../../sim/types";
import type { LoopCue } from "../types";

/** Що звучить у кота петлею; 0 — нічого. Номер — індекс у `KINDS`. */
const KINDS = [
  null,
  { sound: "purr-loop", key: "purr", gain: 1 },
  { sound: "purr-loop", key: "purr", gain: 0.7 },
  { sound: "lap-loop", key: "drink", gain: 1 },
  { sound: "lap-loop", key: "groom", gain: 0.5 },
  { sound: "dig-loop", key: "dig", gain: 1 },
  { sound: "scratch-loop", key: "scratch", gain: 1 },
  { sound: "zoom-loop", key: "zoom", gain: 1 },
  { sound: "fight-loop", key: "fight", gain: 1 },
  { sound: "chew-loop", key: "chew", gain: 1 },
] as const;

const PET_PURR = 1;
const CALM_PURR = 2;
const DRINK = 3;
const GROOM = 4;
const DIG = 5;
const SCRATCH = 6;
const ZOOM = 7;
const FIGHT = 8;
const CHEW = 9;

/** Скільки однакових петель водночас: кілька котів біля мисок — це не кілька однакових записів у фазі. */
const SAME_LIMIT = 2;
/** Код у числі: вид петлі й, для пари, id меншого кота — щоб пара звучала однією петлею. */
const PAIR = 1 << 16;

/** id кота з цілі дії `cat:<id>`; немає — -1. */
function targetCat(cat: Cat): number {
  const target = cat.act.target;
  return target !== null && target.startsWith("cat:") ? Number(target.slice(4)) : -1;
}

/**
 * Муркоче під рукою, лише поки хоче ласки й ще терпить (§9.12): замовк — уже б'є хвостом, далі можна й укус. Тиша під рукою
 * попереджає гравця.
 */
function purrs(cat: Cat, minutes: number, over: boolean): boolean {
  return !over && cat.needs.attention >= PET.wantsAttention && minutes <= petTolerance(cat) - PETTING.warnMinutes;
}

/** Що звучить у кота петлею зараз (код: вид і, для пари, хто в ній менший). */
export function loopCode(state: GameState, cat: Cat): number {
  if (cat.away !== null) return 0;
  const activity = state.character.activity;
  if (activity?.kind === "pet" && activity.cat === cat.id) return purrs(cat, activity.minutes, activity.bitten === true || activity.left === true) ? PET_PURR : 0;
  const act = cat.act;
  const there = act.goal === null;
  switch (act.kind) {
    case "lap":
    case "catnip":
      return there ? CALM_PURR : 0;
    case "idle":
      // «Щедра душа» лягла поруч із тим, кого пестять, і муркоче (§9.12).
      return there && act.target?.startsWith("cuddle:") === true ? CALM_PURR : 0;
    case "drink":
      return there && act.refused !== true ? DRINK : 0;
    case "groom":
      return there ? GROOM : 0;
    case "toilet":
      return there && act.refused !== true ? DIG : 0;
    case "bury":
      return there ? DIG : 0;
    case "scratch":
      return there ? SCRATCH : 0;
    case "zoomies":
      return there ? 0 : ZOOM;
    case "chew":
      return there ? CHEW : 0;
    case "fight":
      return act.paired === true ? FIGHT * PAIR + Math.max(0, Math.min(cat.id, targetCat(cat))) : 0;
    default:
      return 0;
  }
}

/** Пам'ять петель котів між викликами: група тримає одну на гру. */
export class CatLoops {
  private readonly codes = new Map<number, number>();
  private cached: readonly LoopCue[] = [];

  /** Петлі зі стану; той самий масив, поки нічого не змінилося. */
  read(state: GameState): readonly LoopCue[] {
    let changed = this.codes.size !== state.cats.length;
    for (const cat of state.cats) {
      const code = loopCode(state, cat);
      if (this.codes.get(cat.id) !== code) {
        this.codes.set(cat.id, code);
        changed = true;
      }
    }
    if (!changed) return this.cached;
    if (this.codes.size !== state.cats.length) {
      for (const id of this.codes.keys()) if (!state.cats.some((c) => c.id === id)) this.codes.delete(id);
    }
    this.cached = this.build(state);
    return this.cached;
  }

  reset(): void {
    this.codes.clear();
    this.cached = [];
  }

  private build(state: GameState): LoopCue[] {
    const cues: LoopCue[] = [];
    const count = new Map<string, number>();
    for (const cat of state.cats) {
      const code = this.codes.get(cat.id) ?? 0;
      if (code === 0) continue;
      const kind = KINDS[code >= PAIR ? Math.floor(code / PAIR) : code];
      if (!kind) continue;
      // Пара звучить один раз — від меншого кота.
      const owner = code >= PAIR ? code % PAIR : cat.id;
      if (owner !== cat.id && state.cats.some((c) => c.id === owner && (this.codes.get(owner) ?? 0) === code)) continue;
      const same = count.get(kind.sound) ?? 0;
      if (same >= SAME_LIMIT) continue;
      count.set(kind.sound, same + 1);
      cues.push({ key: `${kind.key}:${owner}`, sound: kind.sound, at: `cat:${cat.id}`, gain: kind.gain });
    }
    return cues;
  }
}
