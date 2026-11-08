// Звуки роботи (§8.6, §4.1; `SOUND_PLAN.md`, «Ефекти», рядок `work`): комп'ютер, летучка й нарада, кар'єра й пошук роботи,
// події дня про роботу й дзвінок мами.

import type { GameEvent, ModifierEvent } from "../../../sim/events";
import type { Cue, SoundGroup } from "../types";
import { workLoops } from "../work/loops";
import { Talk } from "../work/talk";
import { Typing } from "../work/typing";

const NONE: readonly Cue[] = [];
const typing = new Typing();
const talk = new Talk();
const atComputer = (sound: string): readonly Cue[] => [{ sound, at: "computer" }];
const anywhere = (sound: string): readonly Cue[] => [{ sound }];

const WORK_START = atComputer("work-start");
const CALL = atComputer("call");
const CALL_OK = atComputer("call-ok");
const REJECTED = atComputer("rejected");
const CAREER_UP = anywhere("career-up");
const CAREER_DOWN = anywhere("career-down");
const VACATION_PAY = anywhere("vacation-pay");

/** Події дня про роботу; решта подій дня — інших груп. «Мама дзвонить» звучить петлею, поки дзвінок чекає (`workLoops`). */
function modifierCues(kind: ModifierEvent): readonly Cue[] {
  switch (kind) {
    case "meeting-start":
      return CALL;
    case "meeting-attended":
      return CALL_OK;
    case "vacation-pay":
      return VACATION_PAY;
    default:
      return NONE;
  }
}

export const group: SoundGroup = {
  id: "work",
  // Гучність за найгучнішими 300 мс файлу: голоси колег — тло, клавіші — тихі клацання; виклик на дзвінок звучить і тоді,
  // коли персонаж далеко від комп'ютера: відстань його притишить (`SFX.floor`).
  sounds: {
    "work-start": { files: ["work-start"], gain: 0.15 },
    // Клавіша: одна, а набір складає `work/typing.ts`; розкид висоти й гучності — щоб клавіші звучали по-різному.
    key: { files: ["key-1"], gain: 0.3, pitch: 0.08, spread: 0.25, cooldownMs: 30, voices: 3 },
    mouse: { files: ["mouse-1", "mouse-2"], gain: 0.3, pitch: 0.04, spread: 0.15, cooldownMs: 0, voices: 2 },
    // Голоси колег: фраза за фразою (`work/talk.ts`), не одна на одну.
    talk: { files: ["talk-1", "talk-2", "talk-3", "talk-4", "talk-5", "talk-6"], gain: 0.25, pitch: 0.03, spread: 0.15, cooldownMs: 0, voices: 1 },
    // Дзвінок — сама картка «Мама дзвонить»: поки вона висить, час стоїть, а дзвінок не тихне.
    ring: { files: ["ring"], loop: true, gain: 0.4, ui: true },
    call: { files: ["call"], gain: 0.35, voices: 1 },
    "call-ok": { files: ["call-ok"], gain: 0.22, voices: 1 },
    rejected: { files: ["rejected"], gain: 0.45, voices: 1 },
    // Новини кар'єри й гроші від роботи приходять на телефон, і в поїздці теж (звільнили дорогою, відпускні).
    "career-up": { files: ["career-up"], gain: 0.33, voices: 1, ui: true },
    "career-down": { files: ["career-down"], gain: 0.37, voices: 1, ui: true },
    "vacation-pay": { files: ["vacation-pay"], gain: 0.9, voices: 1, ui: true },
  },

  onEvent(event: GameEvent): readonly Cue[] {
    switch (event.type) {
      case "work-started":
        return WORK_START;
      case "standup-started":
        return CALL;
      case "standup":
        return event.attended ? CALL_OK : NONE;
      case "career":
        return event.change === "promoted" || event.change === "hired" ? CAREER_UP : CAREER_DOWN;
      case "job-rejected":
        return REJECTED;
      case "modifier":
        return modifierCues(event.kind);
      default:
        return NONE;
    }
  },

  loops: workLoops,
  tick: (state, dtMs) => {
    // Друкує й на дзвінку — ніколи водночас (`isTyping`, `isOnCall`): звучить щонайбільше одне.
    const keys = typing.tick(state, dtMs);
    const voices = talk.tick(state, dtMs);
    return keys.length > 0 ? keys : voices;
  },
  reset: () => {
    typing.reset();
    talk.reset();
  },
};
