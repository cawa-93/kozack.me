// Звуки роботи (§8.6, §4.1, §11.4а; `audio/SOUND.md`, «Хто що озвучує», рядок `work`): кожна подія роботи звучить наявним звуком,
// тривога терпіння — лише коли воно падає, клавіші клацають, поки персонаж друкує, колеги кажуть — поки він на дзвінку,
// телефон — поки дзвінок мами чекає відповіді.

import { describe, expect, it } from "vitest";

import { soundFile } from "../src/audio/sfx/files";
import { group } from "../src/audio/sfx/groups/work";
import type { Cue, LoopCue } from "../src/audio/sfx/types";
import { isOnCall, isTyping } from "../src/audio/sfx/work/loops";
import { Talk } from "../src/audio/sfx/work/talk";
import { Typing, TYPING } from "../src/audio/sfx/work/typing";
import { MODIFIERS, STANDUP_MINUTE, STANDUP_MINUTES } from "../src/sim/config";
import type { GameEvent, ModifierEvent } from "../src/sim/events";
import { advance, newGame } from "../src/sim/game";
import type { GameState, Save } from "../src/sim/types";
import { isWorkday, standupToday, startWork, stopWork } from "../src/sim/work";
import { recordEvents } from "./helpers";

/** Будній день без модифікаторів: летючка, робота й нарада — лише з того, що задав тест. */
function game(): Save {
  const save = newGame({ address: "she", difficulty: "normal", seed: 5 });
  save.current.modifiers.day = null;
  save.current.modifiers.week = null;
  return save;
}

const names = (cues: readonly (Cue | LoopCue)[]): string[] => cues.map((c) => c.sound);
const onEvent = (event: GameEvent, state: GameState): readonly Cue[] => group.onEvent?.(event, state) ?? [];
const loops = (state: GameState): readonly LoopCue[] => group.loops?.(state) ?? [];

/** Кожен звук — у групі й закодований, петля — петлею. */
function expectPlayable(cues: readonly (Cue | LoopCue)[], loop: boolean): void {
  for (const cue of cues) {
    const def = group.sounds[cue.sound];
    expect(def, cue.sound).toBeDefined();
    expect(!!def?.loop, `${cue.sound}: петля`).toBe(loop);
    for (const file of def?.files ?? []) expect(soundFile("work", file), `${cue.sound}: ${file}`).not.toBeNull();
  }
}

describe("звуки роботи: події (§8.6, §4.1)", () => {
  const state = game().current;
  const modifier = (kind: ModifierEvent): GameEvent => ({ type: "modifier", kind, value: 0 });
  const cases: [GameEvent, string[]][] = [
    [{ type: "work-started" }, ["work-start"]],
    [{ type: "work-stopped", minutes: 60, money: 120, reputation: 1, sanity: -1 }, []],
    [{ type: "patience", level: "warning" }, []],
    [{ type: "patience", level: "out" }, []],
    [{ type: "standup-started" }, ["call"]],
    [{ type: "standup", attended: true, reputation: 0 }, ["call-ok"]],
    [{ type: "standup", attended: false, reputation: -1 }, []],
    [{ type: "career", change: "promoted", position: 1 }, ["career-up"]],
    [{ type: "career", change: "hired", position: 0 }, ["career-up"]],
    [{ type: "career", change: "demoted", position: 0 }, ["career-down"]],
    [{ type: "career", change: "fired", position: 0 }, ["career-down"]],
    [{ type: "job-rejected", vacancy: 1 }, ["rejected"]],
    [{ type: "call-remark", issue: "clothes" }, []],
    [modifier("reputation"), []],
    [modifier("meeting-start"), ["call"]],
    [modifier("meeting-attended"), ["call-ok"]],
    [modifier("meeting-missed"), []],
    [modifier("office-missed"), []],
    [modifier("vacation-pay"), ["vacation-pay"]],
    // Дзвінок мами — петлею, поки чекає (нижче); події дня інших груп і чужі події — без звуку цієї групи.
    [modifier("mom-call"), []],
    [modifier("guests"), []],
    [{ type: "meow", cat: 1 }, []],
  ];

  it.each(cases)("%o → %o", (event, expected) => {
    const cues = onEvent(event, state);
    expect(names(cues)).toEqual(expected);
    expectPlayable(cues, false);
  });

  it("звуки комп'ютера — з комп'ютера, новини й гроші — без місця", () => {
    expect(onEvent({ type: "work-started" }, state)[0]?.at).toBe("computer");
    expect(onEvent({ type: "standup-started" }, state)[0]?.at).toBe("computer");
    expect(onEvent({ type: "career", change: "fired", position: 0 }, state)[0]?.at).toBeUndefined();
    // Новини кар'єри чути й у поїздці (шина інтерфейсу), а клавіатуру — ні.
    expect(group.sounds["career-down"]?.ui).toBe(true);
    expect(group.sounds["key"]?.ui).toBeUndefined();
  });
});

describe("звуки роботи: петлі зі стану (§8.6, §4.1)", () => {
  it("клавіші клацають, поки персонаж друкує, словами з паузами, і замовкають, коли встав", () => {
    const state = game().current;
    state.minute = 15 * 60;
    const typing = new Typing(() => 0.5);
    const clicks = (ms: number): Cue[] => {
      const heard: Cue[] = [];
      for (let t = 0; t < ms; t += 16) heard.push(...typing.tick(state, 16));
      return heard;
    };
    expect(clicks(1000)).toEqual([]);
    startWork(state);
    expect(isTyping(state)).toBe(true);
    expect(loops(state)).toEqual([]);
    const heard = clicks(3000);
    // Середні паузи: слово з 4–5 клавіш по ~110 мс і ~280 мс між словами — 7–10 клавіш за секунду не буває.
    const perSecond = heard.length / 3;
    expect(perSecond).toBeGreaterThan(1000 / (TYPING.word[1] + TYPING.key[1]));
    expect(perSecond).toBeLessThan(1000 / TYPING.key[0]);
    expectPlayable(heard, false);
    expect(heard[0]?.at).toBe("computer");
    stopWork(state);
    expect(isTyping(state)).toBe(false);
    expect(clicks(1000)).toEqual([]);
  });

  it("задумавшись, персонаж клацає мишею посеред паузи", () => {
    const state = game().current;
    state.minute = 15 * 60;
    startWork(state);
    const pensive = new Typing(() => 0.05);
    const heard: Cue[] = [];
    for (let t = 0; t < 5000; t += 16) heard.push(...pensive.tick(state, 16));
    const mouse = heard.filter((cue) => cue.sound === "mouse");
    expect(mouse.length).toBeGreaterThan(0);
    for (const cue of mouse) expect(cue.delayMs).toBeGreaterThanOrEqual(TYPING.think[0] * TYPING.mouseAt[0]);
    expectPlayable(heard, false);
    // Задумується лише зрідка: за середніх випадковостей миші немає.
    const busy = new Typing(() => 0.5);
    const typed: Cue[] = [];
    for (let t = 0; t < 5000; t += 16) typed.push(...busy.tick(state, 16));
    expect(typed.some((cue) => cue.sound === "mouse")).toBe(false);
  });

  it("летючка з симуляції: гудок виклику, голоси колег замість клавіатури, потім знову клавіатура", () => {
    const save = game();
    const state = save.current;
    expect(isWorkday(state) && standupToday(state)).toBe(true);
    state.minute = STANDUP_MINUTE - 5;
    startWork(state);
    expect(isTyping(state)).toBe(true);
    const { events, stop } = recordEvents();
    try {
      advance(save, 10);
      expect(isOnCall(state)).toBe(true);
      expect(isTyping(state)).toBe(false);
      expect(loops(state)).toEqual([]);
      const talk = new Talk(() => 0.5);
      const heard: Cue[] = [];
      for (let t = 0; t < 6000; t += 16) heard.push(...talk.tick(state, 16));
      expect(new Set(names(heard))).toEqual(new Set(["talk"]));
      // Фраза — щосекунди-дві, не одна на одну.
      expect(heard.length).toBeGreaterThanOrEqual(2);
      expect(heard.length).toBeLessThanOrEqual(6);
      expectPlayable(heard, false);
      advance(save, STANDUP_MINUTES);
    } finally {
      stop();
    }
    expect(loops(state)).toEqual([]);
    expect(isTyping(state)).toBe(true);
    expect(isOnCall(state)).toBe(false);
    const heard = events.flatMap((e) => names(onEvent(e, state)));
    expect(heard).toContain("call");
    expect(heard).toContain("call-ok");
    for (const event of events) expectPlayable(onEvent(event, state), false);
  });

  it("важлива нарада дня — теж голоси колег; безробітний шукає роботу, клацаючи клавішами, навіть о летучці", () => {
    const state = game().current;
    state.modifiers.day = "meeting";
    state.minute = MODIFIERS.meeting.from + 1;
    startWork(state);
    expect(isOnCall(state)).toBe(true);

    const jobless = game().current;
    jobless.job.unemployed = true;
    jobless.minute = STANDUP_MINUTE + 1;
    startWork(jobless);
    expect(loops(jobless)).toEqual([]);
    expect(isTyping(jobless)).toBe(true);
  });

  it("дзвінок мами — телефон петлею, поки чекає відповіді; клавіші на цей час стихають", () => {
    const state = game().current;
    startWork(state);
    state.today.callPending = true;
    expect(names(loops(state))).toEqual(["ring"]);
    expect(loops(state)[0]?.at).toBeUndefined();
    expectPlayable(loops(state), true);
    expect(isTyping(state)).toBe(false);
    delete state.today.callPending;
    expect(loops(state)).toEqual([]);
    expect(isTyping(state)).toBe(true);
  });
});
