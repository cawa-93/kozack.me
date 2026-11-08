import { beforeEach, describe, expect, it } from "vitest";

import { soundFile } from "../src/audio/sfx/files";
import { group } from "../src/audio/sfx/groups/person";
import { DROWSY_REPEAT_MS } from "../src/audio/sfx/person/drowsy";
import type { Cue, LoopCue } from "../src/audio/sfx/types";
import { DROWSY_HOURS_BEFORE_WAKE, MINUTES_PER_DAY, MINUTES_PER_HOUR } from "../src/sim/config";
import type { GameEvent } from "../src/sim/events";
import { newGame } from "../src/sim/game";
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
  { type: "showered", hygiene: 40, quality: null, left: 0 },
  { type: "showered", hygiene: 40, quality: "premium", left: 3, cold: true },
  { type: "fed", item: 1, food: 2 },
  { type: "watered", item: 2 },
  { type: "treat", cat: 1, quality: "cheap" },
  { type: "collar", cat: 1 },
  { type: "medicine", cat: 1, medicine: "pills", quality: "cheap" },
  { type: "person-ill", illness: "cold" },
  { type: "person-ill", illness: "injury" },
  { type: "person-ill", illness: "exhaustion" },
  { type: "person-meds", quality: "cheap" },
  { type: "person-dressing", quality: "cheap", cured: false },
  { type: "person-dressing", quality: "premium", cured: true },
];

/** Події групи без звуку (`SOUND_PLAN.md`, «Без звуку»); їжа й прибирання звучать під час дії, а не подією по завершенні. */
const SILENT: GameEvent[] = [
  { type: "ate", satiety: 30, food: 2 },
  { type: "cleaned", what: "litter", sanity: -3 },
  ...MESSES.map((what): GameEvent => ({ type: "cleaned", what, sanity: -2 })),
  { type: "medicine", cat: 1, medicine: "drops", quality: "premium" },
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

/**
 * Персонаж тримає тривалу дію з ціллю `target` `ms` мілісекунд кадрами по 16 мс; прогрес росте на `perFrame` ігрових хвилин за
 * кадр (0 — кнопку відпустили). `fresh` — дія щойно почалась. Звуки дії — по порядку.
 */
function hold(state: GameState, target: string, ms: number, perFrame: number, fresh = true): string[] {
  const current = state.character.activity;
  const activity = fresh || current?.kind !== "use" ? { kind: "use" as const, target, progress: 0 } : current;
  state.character.activity = activity;
  const heard: string[] = [];
  for (let t = 0; t < ms; t += 16) {
    for (const cue of group.tick!(state, 16)) if (!cue.sound.startsWith("yawn")) heard.push(cue.sound);
    activity.progress += perFrame;
  }
  if (fresh) state.character.activity = activity;
  return heard;
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
    for (const event of [{ type: "tripped", cat: 1 }, { type: "person-ill", illness: "cold" }, { type: "person-ill", illness: "injury" }] as GameEvent[]) {
      const a = group.onEvent!(event, he).map((cue) => cue.sound);
      const b = group.onEvent!(event, she).map((cue) => cue.sound);
      expect(a, event.type).not.toEqual(b);
    }
  });

  it("їжа й прибирання звучать під час дії, з першої миті: мокре витирають, сухе підмітають, лоток — совок і наповнювач", () => {
    const state = fresh();
    state.home.messes.push({ id: 91, kind: "vomit", x: 5, y: 5, cat: null }, { id: 92, kind: "fur", x: 6, y: 5, cat: null });
    state.home.items.push({ id: 95, kind: "litter", quality: "cheap", slot: "litter-1", litter: "cheap", uses: 2 });
    const wet = hold(state, "mess:91", 1000, 0.032);
    expect(wet[0]).toBe("wipe");
    expect(new Set(wet)).toEqual(new Set(["wipe"]));
    expect(hold(state, "mess:92", 1000, 0.032)).toContain("sweep");
    const litter = hold(state, "item:95", 1500, 0.032);
    expect(litter[0]).toBe("scoop");
    expect(litter.filter((sound) => sound === "litter-pour")).toHaveLength(1);
    const meal = hold(state, "table", 5000, 0.032);
    expect(meal[0]).toBe("plate");
    expect(meal).toContain("swallow");
  });

  it("відпустили кнопку — дія стоїть і мовчить; знову взяли — звучить одразу", () => {
    const state = fresh();
    state.home.messes.push({ id: 93, kind: "fur", x: 5, y: 5, cat: null });
    expect(hold(state, "mess:93", 100, 0.032)).toEqual(["sweep"]);
    expect(hold(state, "mess:93", 3000, 0, false)).toEqual([]);
    expect(hold(state, "mess:93", 100, 0.032, false)).toEqual(["sweep"]);
  });

  it("вода: у поїлку — свій звук; з простим фонтанчиком — більша ємність, бак", () => {
    const state = fresh();
    const sounds = (): string[] => group.onEvent!({ type: "watered", item: 2 }, state).map((cue) => cue.sound);
    expect(sounds()).toEqual(["water"]);
    state.home.appliances.fountain = "cheap";
    expect(sounds()).toEqual(["water-tank"]);
    state.home.appliances.fountain = "premium";
    expect(sounds()).toEqual(["water"]);
  });

  it("пластир і бинт звучать по-різному; зняв травму бинт чи ні — той самий звук", () => {
    const state = fresh();
    const sounds = (quality: "cheap" | "premium", cured: boolean): string[] =>
      group.onEvent!({ type: "person-dressing", quality, cured }, state).map((cue) => cue.sound);
    const plaster = sounds("cheap", false);
    const bandage = sounds("premium", true);
    expect(plaster).toEqual(["plaster"]);
    expect(bandage).toEqual(["bandage", "bandage-tear"]);
    expect(bandage.filter((sound) => plaster.includes(sound))).toEqual([]);
    expect(sounds("premium", false)).toEqual(bandage);
  });

  it("краплі котові, одужання й знайдена шкарпетка — без звуку", () => {
    const state = fresh();
    for (const event of SILENT) expect(group.onEvent!(event, state), JSON.stringify(event)).toEqual([]);
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

  it("щокадру без нових масивів: тиша — той самий порожній масив", () => {
    const state = fresh();
    const still = group.tick!(state, 16);
    expect(group.tick!(state, 16)).toBe(still);
  });
});
