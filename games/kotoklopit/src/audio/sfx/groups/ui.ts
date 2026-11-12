// Звуки інтерфейсу (§11.4а; `audio/SOUND.md`, «Хто що озвучує», рядок `ui`): картки DOM (їх грає `src/ui/overlay.ts` через
// `uiSound`), відмови, збій керування, сповіщення телефона, покупки, титулка ранку, кінець гри й низькі шкали.

import type { GameEvent, Refusal } from "../../../sim/events";
import type { GameState } from "../../../sim/types";
import type { Cue, SceneMoment, SoundGroup } from "../types";
import { LowStats } from "../ui/lowstats";

const NONE: readonly Cue[] = [];
const cue = (sound: string): readonly Cue[] => [{ sound }];

const REFUSED = cue("refused");
const REFUSED_EMPTY = cue("refused-empty");
const NOTIFY = cue("notify");
const ORDERED = cue("ordered");
const BOUGHT = cue("bought");
const MORNING = cue("morning");
const END = cue("end");
const LOW = cue("low-stat");
const CREDITS: readonly string[] = ["credits"];
const NO_SOUNDS: readonly string[] = [];

/** Відмова — тихий «бум»; порожній запас чи аптечка — свій звук, стук по порожньому (§12.3 «Звук»: частим відмовам — свій). */
function refusalCues(reason: Refusal["reason"]): readonly Cue[] {
  return reason === "empty" || reason === "kit-empty" ? REFUSED_EMPTY : REFUSED;
}

const low = new LowStats();

export const group: SoundGroup = {
  id: "ui",
  // Гучність: картки й кнопки — ледь чутні (близько −30 дБ), відмови тихі, сповіщення й покупки — помітні, моменти сцени —
  // найгучніші в групі; виміряно за найгучнішими 300 мс файлу.
  sounds: {
    open: { files: ["open"], gain: 1, pitch: 0.02, ui: true },
    close: { files: ["close"], gain: 0.52, pitch: 0.02, ui: true },
    click: { files: ["click-1", "click-2", "click-3"], gain: 0.4, pitch: 0.04, cooldownMs: 40, ui: true },
    tab: { files: ["tab"], gain: 0.11, pitch: 0.03, cooldownMs: 40, ui: true },
    // Відмови бувають поспіль, коли гравець тисне знову й знову: пауза, щоб «бум» не тарабанив.
    refused: { files: ["refused-1", "refused-2"], gain: 0.28, pitch: 0.04, spread: 0.1, cooldownMs: 350, voices: 1, ui: true },
    "refused-empty": { files: ["empty-1", "empty-2"], gain: 0.6, pitch: 0.04, spread: 0.1, cooldownMs: 350, voices: 1, ui: true },
    notify: { files: ["notify"], gain: 0.43, cooldownMs: 600, voices: 1, ui: true },
    ordered: { files: ["ordered"], gain: 0.5, voices: 1, ui: true },
    bought: { files: ["bought"], gain: 0.72, pitch: 0.03, ui: true },
    morning: { files: ["morning-1", "morning-2", "morning-3"], gain: 0.5, voices: 1, ui: true },
    end: { files: ["end"], gain: 0.5, voices: 1, ui: true, warm: true },
    // Музика титрів життя (§4.2): вмикає й гасить сама стрічка (`sceneLoop`). Шина музики й рівень треків радіо (−16 LUFS) — тож
    // звучить, як радіо, під його повзунком; пауза картки її не приглушує. Найбільший файл, тож його тягнуть лише на екрані кінця
    // гри, коли це пенсія (`prepare`): поки звучить кінець гри, він встигає.
    credits: { files: ["credits"], loop: true, music: true, lazy: true },
    "low-stat": { files: ["low-stat"], gain: 0.4, cooldownMs: 5000, voices: 1, ui: true },
  },

  onEvent(event: GameEvent): readonly Cue[] {
    switch (event.type) {
      case "refused":
        return refusalCues(event.reason);
      case "trait-noticed":
        return NOTIFY;
      case "ordered":
        return ORDERED;
      // Сплачений рахунок за комунальні (§6.4) — той самий звук, що покупка на місці: гроші пішли одразу.
      case "bought":
      case "utilities-paid":
        return BOUGHT;
      default:
        return NONE;
    }
  },

  onScene(moment: SceneMoment, state: GameState): readonly Cue[] {
    if (moment === "morning") {
      low.sync(state);
      return MORNING;
    }
    if (moment === "end") return END;
    return NONE;
  },

  prepare(moment: SceneMoment, state: GameState): readonly string[] {
    return moment === "end" && state.end === "retirement" ? CREDITS : NO_SOUNDS;
  },

  tick(state: GameState): readonly Cue[] {
    return low.crossed(state) ? LOW : NONE;
  },

  reset(): void {
    low.reset();
  },
};
