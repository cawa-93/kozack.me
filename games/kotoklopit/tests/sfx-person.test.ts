import { beforeEach, describe, expect, it } from "vitest";

import { soundFile } from "../src/audio/sfx/files";
import { group } from "../src/audio/sfx/groups/person";
import { DROWSY_REPEAT_MS } from "../src/audio/sfx/person/drowsy";
import { floorAt } from "../src/audio/sfx/person/floor";
import type { Cue, LoopCue } from "../src/audio/sfx/types";
import { DROWSY_HOURS_BEFORE_WAKE, MINUTES_PER_DAY, MINUTES_PER_HOUR } from "../src/sim/config";
import type { GameEvent } from "../src/sim/events";
import { newGame } from "../src/sim/game";
import { RUG } from "../src/sim/home";
import { wakeMinute } from "../src/sim/sleep";
import type { Address, GameState, MessKind } from "../src/sim/types";

const fresh = (address: Address = "he"): GameState => newGame({ seed: 7, address, difficulty: "normal" }).current;

const MESSES: MessKind[] = ["surprise", "vomit", "hairball", "litter", "broken", "fur", "mark", "pee", "puddle", "paper", "garbage"];

/** Усі події групи `person` (`SOUND_PLAN.md`, «Хто що озвучує»), з кожним варіантом, що звучить інакше. */
const EVENTS: GameEvent[] = [
  { type: "dash" },
  { type: "tripped", cat: 1 },
  { type: "slipped", mess: 1 },
  { type: "knocked-down", cat: 1 },
  { type: "ambushed", cat: 1 },
  { type: "ate", satiety: 30, food: 2 },
  { type: "showered", hygiene: 40, quality: null, left: 0 },
  { type: "showered", hygiene: 40, quality: "premium", left: 3, cold: true },
  { type: "cleaned", what: "litter", sanity: -3 },
  ...MESSES.map((what): GameEvent => ({ type: "cleaned", what, sanity: -2 })),
  { type: "fed", item: 1, food: 2 },
  { type: "watered", item: 2 },
  { type: "treat", cat: 1, quality: "cheap" },
  { type: "collar", cat: 1 },
  { type: "medicine", cat: 1, medicine: "pills", quality: "cheap" },
  { type: "medicine", cat: 1, medicine: "drops", quality: "premium" },
  { type: "person-ill", illness: "cold" },
  { type: "person-ill", illness: "injury" },
  { type: "person-ill", illness: "exhaustion" },
  { type: "person-meds", quality: "cheap" },
  { type: "person-cured", illness: "cold" },
  { type: "sock-found", where: "vacuum" },
  { type: "sock-found", where: "trip" },
];

/** Кожен сигнал — звук групи з закодованими файлами, разовий для `Cue` і петля для `LoopCue`. */
function expectPlayable(cues: readonly (Cue | LoopCue)[], loop: boolean, where: string): void {
  for (const cue of cues) {
    const def = group.sounds[cue.sound];
    expect(def, `${where}: ${cue.sound}`).toBeDefined();
    expect(!!def?.loop, `${where}: ${cue.sound}`).toBe(loop);
    for (const file of def?.files ?? []) expect(soundFile("person", file), `${where}: ${file}`).not.toBeNull();
  }
}

/** Пройти `seconds` реальних секунд кадрами по `frameMs` зі швидкістю `vx`, `vy` клітинок за секунду; скільки кроків. */
function walk(state: GameState, seconds: number, vx: number, vy: number, frameMs = 16): Cue[] {
  const steps: Cue[] = [];
  const body = state.character.body;
  for (let t = 0; t < seconds * 1000; t += frameMs) {
    body.x += (vx * frameMs) / 1000;
    body.y += (vy * frameMs) / 1000;
    for (const cue of group.tick!(state, frameMs)) if (cue.sound.startsWith("step-")) steps.push(cue);
  }
  return steps;
}

/** Стати посеред вітальні, далеко від килима: довга пряма доріжка вздовж x. */
function inLiving(state: GameState): void {
  state.character.body.x = 1.5;
  state.character.body.y = 6.5;
}

beforeEach(() => group.reset!());

describe("звуки персонажа (§11.4а, SOUND_PLAN «Хто що озвучує»)", () => {
  it("група «person», файли — закодовані", () => {
    expect(group.id).toBe("person");
    expectPlayable(
      Object.keys(group.sounds).map((sound) => ({ sound })).filter((cue) => !group.sounds[cue.sound]?.loop),
      false,
      "звуки",
    );
  });

  it("кожна подія групи звучить, для «він» і «вона»", () => {
    for (const address of ["he", "she"] as const) {
      const state = fresh(address);
      for (const event of EVENTS) {
        const cues = group.onEvent!(event, state);
        const where = `${address} ${JSON.stringify(event)}`;
        expect(cues.length, where).toBeGreaterThan(0);
        expectPlayable(cues, false, where);
      }
    }
  });

  it("голос персонажа — свій для «він» і «вона»", () => {
    const he = fresh("he");
    const she = fresh("she");
    for (const event of [{ type: "tripped", cat: 1 }, { type: "person-ill", illness: "cold" }, { type: "person-cured", illness: "cold" }] as GameEvent[]) {
      const a = group.onEvent!(event, he).map((cue) => cue.sound);
      const b = group.onEvent!(event, she).map((cue) => cue.sound);
      expect(a, event.type).not.toEqual(b);
    }
  });

  it("прибирання: лоток — совок і наповнювач, мокре витирають, сухе підмітають", () => {
    const state = fresh();
    const sounds = (what: "litter" | MessKind): string[] => group.onEvent!({ type: "cleaned", what, sanity: 0 }, state).map((cue) => cue.sound);
    expect(sounds("litter")).toEqual(["scoop", "litter-pour"]);
    expect(sounds("vomit")).toEqual(["wipe"]);
    expect(sounds("fur")).toEqual(["sweep"]);
  });

  it("чужі події не звучать", () => {
    const state = fresh();
    const foreign: GameEvent[] = [
      { type: "meow", cat: 1 },
      { type: "cooked", result: "ready" },
      { type: "work-started" },
      { type: "bathed", cat: 1 },
      { type: "doorbell" },
      { type: "trashed", item: { kind: "dish", quality: "cheap", state: "ready" } as never },
    ];
    for (const event of foreign) expect(group.onEvent!(event, state), event.type).toEqual([]);
  });

  it("засинання й падіння без сил звучать, ранок і кінець гри — ні", () => {
    for (const address of ["he", "she"] as const) {
      const state = fresh(address);
      for (const moment of ["fall-asleep", "collapse"] as const) {
        const cues = group.onScene!(moment, state);
        expect(cues.length, moment).toBeGreaterThan(0);
        expectPlayable(cues, false, moment);
      }
      expect(group.onScene!("morning", state)).toEqual([]);
      expect(group.onScene!("end", state)).toEqual([]);
    }
  });

  it("душ шумить, поки персонаж у кабіні, купання — вода й плюскіт; потім тиша", () => {
    const state = fresh();
    expect(group.loops!(state)).toEqual([]);
    state.character.activity = { kind: "use", target: "shower", progress: 0, inside: true };
    const shower = group.loops!(state);
    expect(shower.map((cue) => cue.sound)).toEqual(["shower"]);
    expectPlayable(shower, true, "душ");
    state.character.activity = { kind: "use", target: "shower", progress: 0, inside: true, bath: true };
    const bath = group.loops!(state);
    expect(bath.map((cue) => cue.sound).sort()).toEqual(["shower", "splash"]);
    expectPlayable(bath, true, "купання");
    expect(new Set(bath.map((cue) => cue.key)).size).toBe(bath.length);
    state.character.activity = { kind: "use", target: "table", progress: 0 };
    expect(group.loops!(state)).toEqual([]);
    state.character.activity = null;
    expect(group.loops!(state)).toEqual([]);
  });

  it("підлога: плитка у ванній, дерево в спальні, вітальні й на кухні, килим на килимі", () => {
    expect(floorAt({ x: 9.5, y: 2.5 })).toBe("tile");
    expect(floorAt({ x: 10.5, y: 5.5 })).toBe("tile");
    expect(floorAt({ x: 2.5, y: 2.5 })).toBe("wood");
    expect(floorAt({ x: 15.5, y: 2.5 })).toBe("wood");
    expect(floorAt({ x: 3.5, y: 8.5 })).toBe("wood");
    expect(floorAt({ x: RUG.x + 0.5, y: RUG.y + 0.5 })).toBe("rug");
  });

  it("кроки: у русі — у такт ходи, на місці — тиша", () => {
    const state = fresh();
    inLiving(state);
    expect(walk(state, 3, 0, 0)).toEqual([]);
    group.reset!();
    // Ходьба вздовж клітинки — 4 клітинки за секунду: два кроки за цикл ходи (≈ 0,47 с).
    const steps = walk(state, 3, 4, 0);
    expect(steps.length / 3).toBeGreaterThan(3);
    expect(steps.length / 3).toBeLessThan(6);
    expect(steps.every((cue) => cue.sound === "step-wood" && cue.at === "person")).toBe(true);
    // Зупинився — кроки стихли.
    expect(walk(state, 2, 0, 0)).toEqual([]);
  });

  it("кроки: повільніше — рідше, ривком — частіше; перший крок — щойно рушив", () => {
    const slow = fresh();
    inLiving(slow);
    const slowSteps = walk(slow, 3, 2, 0).length;
    group.reset!();
    const normal = fresh();
    inLiving(normal);
    const normalSteps = walk(normal, 3, 4, 0).length;
    group.reset!();
    const dash = fresh();
    inLiving(dash);
    dash.character.body.dash = 1000;
    const dashSteps = walk(dash, 1.2, 12, 0).length;
    expect(slowSteps).toBeLessThan(normalSteps);
    expect(dashSteps / 1.2).toBeGreaterThan(normalSteps / 3);
    group.reset!();
    const start = fresh();
    inLiving(start);
    walk(start, 0.5, 0, 0);
    expect(walk(start, 0.15, 4, 0).length).toBeGreaterThan(0);
  });

  it("кроки: переставили далеко — не крок; у кабіні й оглушений — тиша", () => {
    const state = fresh();
    inLiving(state);
    walk(state, 0.5, 0, 0);
    const body = state.character.body;
    body.x = 16.5;
    body.y = 9.5;
    expect(group.tick!(state, 16)).toEqual([]);
    body.x = 2.5;
    body.y = 2.5;
    expect(group.tick!(state, 250)).toEqual([]);
    state.character.activity = { kind: "use", target: "shower", progress: 0, inside: true };
    expect(walk(state, 1, 4, 0)).toEqual([]);
    state.character.activity = null;
    group.reset!();
    inLiving(state);
    body.stun = 10;
    expect(walk(state, 1, 4, 0)).toEqual([]);
  });

  it("кроки звучать за підлогою під ногами", () => {
    const state = fresh();
    state.character.body.x = 8.5;
    state.character.body.y = 1.5;
    const tile = walk(state, 0.6, 0, 4);
    expect(tile.length).toBeGreaterThan(0);
    expect(tile.every((cue) => cue.sound === "step-tile")).toBe(true);
    group.reset!();
    state.character.body.x = RUG.x + 0.2;
    state.character.body.y = RUG.y + 1.5;
    const rug = walk(state, 0.8, 4, 0);
    expect(rug.length).toBeGreaterThan(0);
    expect(rug.every((cue) => cue.sound === "step-rug")).toBe(true);
  });

  it("«Сонливість»: позіх, щойно почалася, зрідка — поки триває; після нового показу дня — не одразу", () => {
    const state = fresh("she");
    const yawns = (ms: number, frameMs = 50): number => {
      let count = 0;
      for (let t = 0; t < ms; t += frameMs) for (const cue of group.tick!(state, frameMs)) if (cue.sound.startsWith("yawn-")) count++;
      return count;
    };
    state.minute = wakeMinute(state);
    expect(yawns(1000)).toBe(0);
    state.minute = wakeMinute(state) + MINUTES_PER_DAY - DROWSY_HOURS_BEFORE_WAKE * MINUTES_PER_HOUR + 5;
    expect(group.tick!(state, 16).map((cue) => cue.sound)).toEqual(["yawn-she"]);
    expect(yawns(DROWSY_REPEAT_MS - 1000)).toBe(0);
    expect(yawns(2000)).toBe(1);
    group.reset!();
    expect(yawns(1000)).toBe(0);
  });

  it("щокадру без нових масивів: стоїть — той самий порожній, крок тією самою підлогою — той самий", () => {
    const state = fresh();
    inLiving(state);
    const still = group.tick!(state, 16);
    expect(group.tick!(state, 16)).toBe(still);
    const steps = walk(state, 2, 4, 0);
    expect(steps.length).toBeGreaterThan(2);
    expect(steps[1]).toBe(steps[0]);
  });
});
