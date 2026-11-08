// Звуки персонажа (`audio/SOUND.md`, «Хто що озвучує», рядок `person`): ривок, падіння, їжа й прибирання під час дії, душ
// і купання кота, догляд за котами руками персонажа, хвороби, «Сонливість», засинання й падіння без сил. Звідки файли —
// `audio/sfx/person/`.

import type { GameState } from "../../../sim/types";
import { Chores } from "../chores";
import { personChore } from "../person/chores";
import { personEventCues, personSceneCues, YAWN } from "../person/cues";
import { Drowsiness } from "../person/drowsy";
import type { Cue, LoopCue, SoundDef, SoundGroup } from "../types";

const range = (name: string, count: number): string[] => Array.from({ length: count }, (_, i) => `${name}-${i + 1}`);

/** Голос персонажа: часті звуки — з легким розкидом, щоб не набридали. */
const voice = (file: string, gain: number, files: readonly string[] = [file]): SoundDef => ({ files, gain, pitch: 0.03, spread: 0.08, voices: 1, cooldownMs: 400 });

const sounds: Record<string, SoundDef> = {
  dash: { files: range("dash", 4), gain: 0.4, pitch: 0.06, spread: 0.1, voices: 1 },
  slide: { files: range("dash", 4), gain: 0.35, pitch: 0.04, voices: 1 },
  // Падіння — найгучніше в групі: його треба помітити.
  fall: { files: ["fall-1", "fall-2"], gain: 1.5, pitch: 0.06, spread: 0.08, voices: 1, cooldownMs: 300 },
  knock: { files: ["knock-1"], gain: 0.45, pitch: 0.06, voices: 1, cooldownMs: 300 },
  "gasp-he": { files: range("gasp-he", 3), gain: 0.4, pitch: 0.03, voices: 1, cooldownMs: 300 },
  "gasp-she": { files: range("gasp-she", 3), gain: 0.4, pitch: 0.03, voices: 1, cooldownMs: 300 },
  swallow: { files: ["swallow"], gain: 0.5, pitch: 0.04, voices: 1 },
  plate: { files: range("plate", 2), gain: 0.4, pitch: 0.04, voices: 1 },
  shower: { files: ["shower-loop"], gain: 0.4, loop: true },
  "shower-off": { files: ["shower-off"], gain: 0.5, voices: 1 },
  splash: { files: ["splash-loop"], gain: 0.6, loop: true },
  "litter-pour": { files: ["litter-pour"], gain: 0.17, pitch: 0.05, voices: 1 },
  sweep: { files: range("sweep", 2), gain: 0.4, pitch: 0.05, voices: 1 },
  kibble: { files: ["kibble-1"], gain: 0.5, pitch: 0.05, voices: 1 },
  water: { files: ["water-1"], gain: 0.42, pitch: 0.04, voices: 1 },
  // Бак простого фонтанчика наповнюють разом із поїлкою (§8.7): більша ємність — довше й гучніше ллється.
  "water-tank": { files: ["water-tank"], gain: 0.58, pitch: 0.04, voices: 1 },
  buckle: { files: range("buckle", 2), gain: 0.45, pitch: 0.05, voices: 1 },
  bell: { files: ["bell"], gain: 0.9, pitch: 0.05, voices: 1 },
  pills: { files: range("pills", 2), gain: 0.4, pitch: 0.05, voices: 1 },
  // Тріск клею пікуватий, тихий за середнім рівнем: множник більший, ніж у шелесту бинта.
  plaster: { files: ["plaster-1"], gain: 0.9, pitch: 0.06, voices: 1 },
  bandage: { files: ["bandage-1"], gain: 0.3, pitch: 0.05, voices: 1 },
  "bandage-tear": { files: range("bandage-tear", 2), gain: 0.4, pitch: 0.05, voices: 1 },
  "sneeze-he": voice("sneeze-he", 0.5),
  "sneeze-she": voice("sneeze-she", 0.5),
  "yawn-he": voice("yawn-he", 0.28, range("yawn-he", 1)),
  "yawn-she": voice("yawn-she", 0.28, range("yawn-she", 3)),
  "sigh-he": voice("sigh-he", 0.4),
  "sigh-she": voice("sigh-she", 0.4),
  blanket: { files: range("blanket", 2), gain: 0.45, pitch: 0.05, voices: 1 },
};

// Відповіді `tick` і `loops` — сталі масиви: їх питають щокадру й кожні `SFX.loopMs`.
const NONE: readonly Cue[] = [];
const NO_LOOPS: readonly LoopCue[] = [];
// Поки персонаж у кабіні, вода шумить; купають кота — та сама вода тихіше й плюскіт (§8.7).
const SHOWER: readonly LoopCue[] = [{ key: "shower", sound: "shower", at: "shower" }];
const BATH: readonly LoopCue[] = [
  { key: "bath-water", sound: "shower", at: "shower", gain: 0.6 },
  { key: "bath-splash", sound: "splash", at: "shower" },
];

const drowsiness = new Drowsiness();
const chores = new Chores(personChore);

function loops(state: GameState): readonly LoopCue[] {
  const activity = state.character.activity;
  if (state.trip !== null || activity?.kind !== "use" || activity.target !== "shower" || activity.inside !== true) return NO_LOOPS;
  return activity.bath === true ? BATH : SHOWER;
}

function tick(state: GameState, dtMs: number): readonly Cue[] {
  const chore = chores.tick(state, dtMs);
  const yawn = drowsiness.update(state, dtMs) ? YAWN[state.character.address] : NONE;
  // Обидва в одному кадрі — рідко: новий масив лише тоді.
  return yawn.length === 0 ? chore : chore.length === 0 ? yawn : [...chore, ...yawn];
}

export const group: SoundGroup = {
  id: "person",
  sounds,
  onEvent: personEventCues,
  onScene: personSceneCues,
  loops,
  tick,
  reset() {
    drowsiness.reset();
    chores.reset();
  },
};
