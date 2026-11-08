// Звуки котів (§11.4а, `SOUND_PLAN.md`, «Ефекти», рядок `cats`): голоси за віком і ситуацією, мурчання, шипіння, бійка, їжа,
// лоток і бешкет. Події — `../cats/events.ts`, петлі — `../cats/loops.ts`, кіт на сходах — `../cats/stairs.ts`.

import { catEvent } from "../cats/events";
import { CatLoops } from "../cats/loops";
import { StairsMeow } from "../cats/stairs";
import type { SoundDef, SoundGroup } from "../types";

const files = (name: string, count: number): string[] => Array.from({ length: count }, (_, i) => `${name}-${i + 1}`);

/**
 * Гучність вирівнено за середнім рівнем файлів (разові нормовано за піком, петлі — за RMS): голоси — середньо, мурчання — тихо,
 * бійка й розбите — гучніше. Розкид висоти — щоб те саме не набридало. Пауза в голосів довша: кіт, що просить, нявкає щохвилини
 * гри, а це щосекунди реального часу.
 */
const SOUNDS: Record<string, SoundDef> = {
  meow: { files: files("meow", 3), gain: 0.7, pitch: 0.05, spread: 0.1, cooldownMs: 600 },
  // Просить — і голосом старшої кішки (`meow-old-1`): за вибором автора.
  "meow-ask": { files: ["meow-ask-1", "meow-old-1"], gain: 0.7, pitch: 0.04, spread: 0.1, cooldownMs: 600 },
  "meow-happy": { files: ["meow-happy-1"], gain: 0.65, pitch: 0.05, spread: 0.1, cooldownMs: 400 },
  "meow-sad": { files: ["meow-sad-1"], gain: 0.6, pitch: 0.03, spread: 0.08, cooldownMs: 800 },
  "meow-old": { files: files("meow-old", 2), gain: 0.65, pitch: 0.03, spread: 0.08, cooldownMs: 700 },
  "meow-kitten": { files: files("meow-kitten", 8), gain: 0.55, pitch: 0.06, spread: 0.1, cooldownMs: 300 },
  "meow-angry": { files: files("meow-angry", 2), gain: 0.75, pitch: 0.04, spread: 0.08, cooldownMs: 500 },
  "meow-door": { files: ["meow-door-1"], gain: 0.8, pitch: 0.04, spread: 0.1, cooldownMs: 1500, voices: 1 },
  cry: { files: files("cry", 2), gain: 0.85, pitch: 0.03, spread: 0.08, cooldownMs: 900 },
  "cry-kitten": { files: ["cry-kitten-1"], gain: 0.6, pitch: 0.04, spread: 0.08, cooldownMs: 900 },
  squeak: { files: files("squeak", 2), gain: 0.45, pitch: 0.06, voices: 1, cooldownMs: 1000 },
  chatter: { files: files("chatter", 3), gain: 0.85, pitch: 0.05, cooldownMs: 1500, voices: 1 },
  hiss: { files: files("hiss", 4), gain: 0.75, pitch: 0.06, spread: 0.1, cooldownMs: 700 },
  "hiss-soft": { files: ["hiss-soft-1"], gain: 0.6, pitch: 0.06, spread: 0.1, cooldownMs: 700 },
  growl: { files: files("growl", 2), gain: 0.7, pitch: 0.04, cooldownMs: 800 },
  fight: { files: files("fight", 2), gain: 1, pitch: 0.04, cooldownMs: 800, voices: 1 },
  bite: { files: ["bite-1"], gain: 0.85, pitch: 0.05, cooldownMs: 400 },
  claw: { files: ["claw-1"], gain: 1, pitch: 0.06, cooldownMs: 400 },
  purr: { files: files("purr", 3), gain: 0.5, pitch: 0.04, cooldownMs: 2500, voices: 1 },
  yawn: { files: ["yawn-1"], gain: 0.8, pitch: 0.06, cooldownMs: 1500 },
  land: { files: ["land-2"], gain: 0.5, pitch: 0.08, cooldownMs: 200 },
  scamper: { files: files("scamper", 2), gain: 0.6, pitch: 0.06, spread: 0.1, cooldownMs: 300 },
  sneeze: { files: ["sneeze-1"], gain: 0.45, pitch: 0.06, cooldownMs: 500 },
  spit: { files: ["spit-1"], gain: 0.6, pitch: 0.05, cooldownMs: 500 },
  lick: { files: ["lick-1"], gain: 0.9, pitch: 0.06, cooldownMs: 1200 },
  dig: { files: ["dig-1"], gain: 0.6, pitch: 0.06, cooldownMs: 600 },
  "chew-wire": { files: ["chew-wire-1"], gain: 0.6, pitch: 0.06, cooldownMs: 600 },
  "chew-box": { files: ["chew-box-1"], gain: 0.8, pitch: 0.06, cooldownMs: 600 },
  "bag-rip": { files: ["bag-rip-1"], gain: 0.9, pitch: 0.05, cooldownMs: 600 },
  paper: { files: ["paper-1"], gain: 0.6, pitch: 0.06, cooldownMs: 600 },
  smash: { files: ["smash-1"], gain: 1, pitch: 0.05, cooldownMs: 300 },
  "mug-break": { files: ["mug-break-1"], gain: 1, pitch: 0.05, cooldownMs: 300 },
  "mug-drop": { files: ["mug-drop-1"], gain: 0.8, pitch: 0.06, cooldownMs: 300 },
  "phone-drop": { files: ["phone-drop-1"], gain: 0.7, pitch: 0.05, cooldownMs: 300 },
  "pen-drop": { files: ["pen-drop-1"], gain: 0.9, pitch: 0.08, cooldownMs: 300 },
  // Лапи на клавіатурі — серія кліків з однієї події: без паузи між ними.
  keys: { files: ["keys-1"], gain: 0.6, pitch: 0.06, spread: 0.2, cooldownMs: 0, voices: 3 },
  spark: { files: ["spark-1"], gain: 0.3, pitch: 0.04, cooldownMs: 800 },
  "cabinet-open": { files: ["cabinet-open-1"], gain: 0.75, pitch: 0.04, cooldownMs: 600 },
  "cabinet-lock": { files: ["cabinet-lock-1"], gain: 0.75, pitch: 0.06, cooldownMs: 600 },
  tap: { files: ["tap-1"], gain: 0.6, cooldownMs: 1000, voices: 1 },
  "purr-loop": { files: ["purr-loop"], gain: 0.4, loop: true },
  "lap-loop": { files: ["lap-loop"], gain: 0.55, loop: true },
  "dig-loop": { files: ["dig-loop"], gain: 0.6, loop: true },
  "scratch-loop": { files: ["scratch-loop"], gain: 0.55, loop: true },
  "zoom-loop": { files: ["zoom-loop"], gain: 0.55, loop: true },
  "fight-loop": { files: ["fight-loop"], gain: 0.8, loop: true },
  "chew-loop": { files: ["chew-loop"], gain: 0.7, loop: true },
};

const loops = new CatLoops();
const stairs = new StairsMeow();

export const group: SoundGroup = {
  id: "cats",
  sounds: SOUNDS,
  onEvent: catEvent,
  loops: (state) => loops.read(state),
  tick: (state, dtMs) => stairs.tick(state, dtMs),
  reset: () => {
    loops.reset();
    stairs.reset();
  },
};
