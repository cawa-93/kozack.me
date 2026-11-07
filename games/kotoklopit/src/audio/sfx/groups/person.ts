// Звуки персонажа (`SOUND_PLAN.md`, «Хто що озвучує», рядок `person`): кроки й ривок, падіння, їжа, душ і купання кота,
// догляд за котами руками персонажа, хвороби, «Сонливість», засинання й падіння без сил. Звідки файли — `audio/sfx/person/`.

import type { GameState } from "../../../sim/types";
import { personEventCues, personSceneCues, YAWN } from "../person/cues";
import { Drowsiness } from "../person/drowsy";
import type { Floor } from "../person/floor";
import { Steps } from "../person/steps";
import type { Cue, LoopCue, SoundDef, SoundGroup } from "../types";

const range = (name: string, count: number): string[] => Array.from({ length: count }, (_, i) => `${name}-${i + 1}`);

/** Голос персонажа: часті звуки — з легким розкидом, щоб не набридали. */
const voice = (file: string, gain: number): SoundDef => ({ files: [file], gain, pitch: 0.03, spread: 0.08, voices: 1, cooldownMs: 400 });

const sounds: Record<string, SoundDef> = {
  // Кроки тихі: вони звучать постійно. Плитка дзвінкіша, тож тихіша за дерево; килим глухий.
  "step-tile": { files: range("step-tile", 5), gain: 0.16, pitch: 0.06, spread: 0.15, cooldownMs: 70 },
  "step-wood": { files: range("step-wood", 4), gain: 0.2, pitch: 0.06, spread: 0.15, cooldownMs: 70 },
  "step-rug": { files: range("step-rug", 3), gain: 0.16, pitch: 0.05, spread: 0.15, cooldownMs: 70 },
  dash: { files: range("dash", 4), gain: 0.4, pitch: 0.06, spread: 0.1, voices: 1 },
  slide: { files: range("dash", 4), gain: 0.35, pitch: 0.04, voices: 1 },
  // Падіння — найгучніше в групі: його треба помітити.
  fall: { files: ["fall-1"], gain: 0.85, pitch: 0.06, spread: 0.08, voices: 1, cooldownMs: 300 },
  knock: { files: range("knock", 2), gain: 0.45, pitch: 0.05, voices: 1, cooldownMs: 300 },
  "gasp-he": { files: range("gasp-he", 3), gain: 0.4, pitch: 0.03, voices: 1, cooldownMs: 300 },
  "gasp-she": { files: range("gasp-she", 3), gain: 0.4, pitch: 0.03, voices: 1, cooldownMs: 300 },
  swallow: { files: ["swallow"], gain: 0.5, pitch: 0.04, voices: 1 },
  plate: { files: range("plate", 2), gain: 0.4, pitch: 0.04, voices: 1 },
  shower: { files: ["shower-loop"], gain: 0.4, loop: true },
  "shower-off": { files: ["shower-off"], gain: 0.5, voices: 1 },
  splash: { files: ["splash-loop"], gain: 0.45, loop: true },
  scoop: { files: range("scoop", 2), gain: 0.4, pitch: 0.05, voices: 1 },
  "litter-pour": { files: ["litter-pour"], gain: 0.3, pitch: 0.05, voices: 1 },
  wipe: { files: range("wipe", 2), gain: 0.35, pitch: 0.05, voices: 1 },
  sweep: { files: range("sweep", 2), gain: 0.4, pitch: 0.05, voices: 1 },
  kibble: { files: range("kibble", 2), gain: 0.45, pitch: 0.05, voices: 1 },
  water: { files: range("water", 2), gain: 0.4, pitch: 0.04, voices: 1 },
  treat: { files: range("treat", 2), gain: 0.5, pitch: 0.06, voices: 1 },
  buckle: { files: range("buckle", 2), gain: 0.45, pitch: 0.05, voices: 1 },
  bell: { files: ["bell"], gain: 0.3, pitch: 0.05, voices: 1 },
  pills: { files: range("pills", 2), gain: 0.4, pitch: 0.05, voices: 1 },
  drop: { files: ["drop-1", "drop-2"], gain: 0.35, pitch: 0.06, voices: 1 },
  "drop-again": { files: ["drop-3", "drop-4"], gain: 0.35, pitch: 0.06, voices: 1 },
  "sneeze-he": voice("sneeze-he", 0.5),
  "sneeze-she": voice("sneeze-she", 0.5),
  "pant-he": voice("pant-he", 0.4),
  "pant-she": voice("pant-she", 0.4),
  "relief-he": voice("relief-he", 0.4),
  "relief-she": voice("relief-she", 0.4),
  "yawn-he": voice("yawn-he", 0.4),
  "yawn-she": voice("yawn-she", 0.4),
  "sigh-he": voice("sigh-he", 0.4),
  "sigh-she": voice("sigh-she", 0.4),
  blanket: { files: range("blanket", 2), gain: 0.45, pitch: 0.05, voices: 1 },
  sock: { files: ["sock"], gain: 0.4, pitch: 0.06, voices: 1 },
};

// Відповіді `tick` і `loops` — сталі масиви: їх питають щокадру й кожні `SFX.loopMs`.
const NONE: readonly Cue[] = [];
const NO_LOOPS: readonly LoopCue[] = [];
/** Ривок — важчий крок, плентання виснаженого — легший. */
const STEP_GAIN = { dash: 1.4, trudge: 0.8 } as const;
const STEP_CUES: Readonly<Record<Floor, Readonly<Record<"normal" | keyof typeof STEP_GAIN, readonly Cue[]>>>> = {
  tile: stepCues("step-tile"),
  wood: stepCues("step-wood"),
  rug: stepCues("step-rug"),
};
function stepCues(sound: string): Readonly<Record<"normal" | keyof typeof STEP_GAIN, readonly Cue[]>> {
  return {
    normal: [{ sound, at: "person" }],
    dash: [{ sound, at: "person", gain: STEP_GAIN.dash }],
    trudge: [{ sound, at: "person", gain: STEP_GAIN.trudge }],
  };
}
// Поки персонаж у кабіні, вода шумить; купають кота — та сама вода тихіше й плюскіт (§8.7).
const SHOWER: readonly LoopCue[] = [{ key: "shower", sound: "shower", at: "shower" }];
const BATH: readonly LoopCue[] = [
  { key: "bath-water", sound: "shower", at: "shower", gain: 0.6 },
  { key: "bath-splash", sound: "splash", at: "shower" },
];

const steps = new Steps();
const drowsiness = new Drowsiness();

function loops(state: GameState): readonly LoopCue[] {
  const activity = state.character.activity;
  if (state.trip !== null || activity?.kind !== "use" || activity.target !== "shower" || activity.inside !== true) return NO_LOOPS;
  return activity.bath === true ? BATH : SHOWER;
}

function tick(state: GameState, dtMs: number): readonly Cue[] {
  const step = steps.update(state, dtMs);
  if (drowsiness.update(state, dtMs)) return YAWN[state.character.address];
  if (!step) return NONE;
  const kind = step.gait === "dash" || step.gait === "trudge" ? step.gait : "normal";
  return STEP_CUES[step.floor][kind];
}

export const group: SoundGroup = {
  id: "person",
  sounds,
  onEvent: personEventCues,
  onScene: personSceneCues,
  loops,
  tick,
  reset() {
    steps.reset();
    drowsiness.reset();
  },
};
