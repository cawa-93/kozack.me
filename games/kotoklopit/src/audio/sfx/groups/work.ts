// Звуки роботи (§8.6, §4.1; `SOUND_PLAN.md`, «Ефекти», рядок `work`): комп'ютер, гроші, терпіння керівництва, летучка й
// нарада, кар'єра й пошук роботи, події дня про роботу й дзвінок мами.

import type { GameEvent, ModifierEvent } from "../../../sim/events";
import type { GameState } from "../../../sim/types";
import { isWorking } from "../../../sim/work";
import type { Cue, SoundGroup } from "../types";
import { workLoops } from "../work/loops";
import { Typing } from "../work/typing";

const NONE: readonly Cue[] = [];
const typing = new Typing();
const atComputer = (sound: string): readonly Cue[] => [{ sound, at: "computer" }];
const anywhere = (sound: string): readonly Cue[] => [{ sound }];

const WORK_START = atComputer("work-start");
const COIN = anywhere("coin");
const PATIENCE_WARNING = atComputer("patience-warning");
const PATIENCE_OUT = atComputer("patience-out");
const CALL = atComputer("call");
const CALL_OK = atComputer("call-ok");
const CALL_MISSED = atComputer("call-missed");
const REJECTED = atComputer("rejected");
const REMARK = atComputer("remark");
const CAREER_UP = anywhere("career-up");
const CAREER_DOWN = anywhere("career-down");
const MESSAGE = anywhere("message");
const OFFICE_MISSED = anywhere("call-missed");
const VACATION_PAY = anywhere("vacation-pay");

/** Події дня про роботу; решта подій дня — інших груп. «Мама дзвонить» звучить петлею, поки дзвінок чекає (`workLoops`). */
function modifierCues(kind: ModifierEvent): readonly Cue[] {
  switch (kind) {
    case "reputation":
      return MESSAGE;
    case "meeting-start":
      return CALL;
    case "meeting-attended":
      return CALL_OK;
    case "meeting-missed":
      return CALL_MISSED;
    case "office-missed":
      return OFFICE_MISSED;
    case "vacation-pay":
      return VACATION_PAY;
    default:
      return NONE;
  }
}

export const group: SoundGroup = {
  id: "work",
  // Гучність за найгучнішими 300 мс файлу: гамір — тло (близько −32 дБ), клавіші — тихі клацання; «!», «Х» і виклик на дзвінок
  // звучать,
  // коли персонаж далеко від комп'ютера, тож гучніші за решту: відстань їх притишить (`SFX.floor`).
  sounds: {
    "work-start": { files: ["work-start"], gain: 0.15 },
    // Клавіша: одна, а набір складає `work/typing.ts`; розкид висоти й гучності — щоб клавіші звучали по-різному.
    key: { files: ["key-1"], gain: 0.3, pitch: 0.08, spread: 0.25, cooldownMs: 30, voices: 3 },
    murmur: { files: ["murmur"], loop: true, gain: 0.28 },
    // Дзвінок — сама картка «Мама дзвонить»: поки вона висить, час стоїть, а дзвінок не тихне.
    ring: { files: ["ring"], loop: true, gain: 0.4, ui: true },
    coin: { files: ["coin"], gain: 0.75, pitch: 0.03 },
    "patience-warning": { files: ["patience-warning"], gain: 0.8, voices: 1 },
    "patience-out": { files: ["patience-out"], gain: 1, voices: 1 },
    call: { files: ["call"], gain: 0.35, voices: 1 },
    "call-ok": { files: ["call-ok"], gain: 0.22, voices: 1 },
    // Пропущене чути й у поїздці: летучку чи збори пропускають саме тоді.
    "call-missed": { files: ["call-missed"], gain: 0.4, voices: 1, ui: true },
    rejected: { files: ["rejected"], gain: 0.45, voices: 1 },
    remark: { files: ["remark"], gain: 0.5, voices: 1 },
    // Новини кар'єри й гроші від роботи приходять на телефон, і в поїздці теж (звільнили дорогою, відпускні).
    "career-up": { files: ["career-up"], gain: 0.33, voices: 1, ui: true },
    "career-down": { files: ["career-down"], gain: 0.37, voices: 1, ui: true },
    message: { files: ["message"], gain: 0.27, voices: 1, ui: true },
    "vacation-pay": { files: ["vacation-pay"], gain: 0.9, voices: 1, ui: true },
  },

  onEvent(event: GameEvent, state: GameState): readonly Cue[] {
    switch (event.type) {
      case "work-started":
        return WORK_START;
      case "work-stopped":
        // Пошук роботи й коротка сесія без заробітку — без монет.
        return event.money > 0 ? COIN : NONE;
      case "patience":
        // Рівень змінюється й угору, коли персонаж повернувся за комп'ютер: тоді не тривожимо.
        if (event.level === "ok" || isWorking(state)) return NONE;
        return event.level === "out" ? PATIENCE_OUT : PATIENCE_WARNING;
      case "standup-started":
        return CALL;
      case "standup":
        return event.attended ? CALL_OK : CALL_MISSED;
      case "career":
        return event.change === "promoted" || event.change === "hired" ? CAREER_UP : CAREER_DOWN;
      case "job-rejected":
        return REJECTED;
      case "call-remark":
        return REMARK;
      case "modifier":
        return modifierCues(event.kind);
      default:
        return NONE;
    }
  },

  loops: workLoops,
  tick: (state, dtMs) => typing.tick(state, dtMs),
  reset: () => typing.reset(),
};
