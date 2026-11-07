import { existsSync, readFileSync, statSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { RADIO, SAMPLE_RATE } from "../src/audio/config";
import { STATIONS } from "../src/audio/radio/playlist";
import playlist from "../src/audio/radio/playlist.json";
import { DEFAULT_AUDIO, loadAudioSettings, saveAudioSettings } from "../src/audio/settings";
import { setRadioOn, tap } from "../src/sim/actions";
import { createCat } from "../src/sim/cat";
import { radioSleepWeight } from "../src/sim/catai";
import { RADIO_SLEEP } from "../src/sim/config";
import { onEvent } from "../src/sim/events";
import { newGame } from "../src/sim/game";
import { isSolid, objectById } from "../src/sim/home";
import { targetOf } from "../src/sim/targets";
import { createRng } from "../src/sim/rng";
import type { Cat, GameState, TraitLevel } from "../src/sim/types";
import { RADIO_STATIONS } from "../src/texts";

/** Персонаж стоїть перед радіо, обличчям до нього. */
function atRadio(): GameState {
  const state = newGame({ address: "she", difficulty: "normal", seed: 1 }).current;
  Object.assign(state.character.body, { x: 2.35, y: 6.5, facing: { x: -1, y: 0 } });
  return state;
}

describe("радіо в квартирі (§8.10)", () => {
  it("стоїть на своїй клітинці й не дає пройти", () => {
    const radio = objectById("radio");
    expect(radio.interactive).toBe(true);
    expect(isSolid(atRadio(), radio.x + 0.5, radio.y + 0.5)).toBe(true);
  });

  it("стає ціллю дії", () => {
    expect(targetOf(atRadio())?.id).toBe("radio");
  });

  it("порожніми руками нічого в грі не змінює: картку відкриває сцена", () => {
    const state = atRadio();
    const events: string[] = [];
    const off = onEvent((event) => events.push(event.type));
    expect(tap(state)).toBeNull();
    off();
    expect(events).toEqual([]);
  });

  it("з повними руками — відмова", () => {
    const state = atRadio();
    state.character.held = { kind: "raw", quality: "cheap" };
    const events: unknown[] = [];
    const off = onEvent((event) => events.push(event));
    tap(state);
    off();
    expect(events).toContainEqual({ type: "refused", object: "radio", reason: "hands-full" });
  });
});

describe("сон на радіо (§8.10)", () => {
  /** Кіт із цією «Теплолюбністю». */
  function catWith(warmth: TraitLevel | 0): { state: GameState; cat: Cat } {
    const state = atRadio();
    const cat = createCat(state, createRng(4), { source: "shelter", ageWeeks: 10, at: { x: 5.5, y: 8.5 } });
    cat.traits = warmth === 0 ? [] : [{ group: "warmth", level: warmth, seen: 0, known: false }];
    return { state, cat };
  }

  it("вимкнене — звичайне місце для сну, байдуже до тепла", () => {
    for (const warmth of [-2, 0, 2] as const) {
      const { state, cat } = catWith(warmth);
      expect(radioSleepWeight(state, cat)).toBe(RADIO_SLEEP.base);
    }
  });

  it("увімкнене гріє: теплолюба тягне сильніше", () => {
    const { state, cat } = catWith(2);
    setRadioOn(state, true);
    expect(radioSleepWeight(state, cat)).toBeGreaterThan(RADIO_SLEEP.base);
  });

  it("тому, хто не мерзне, увімкнене радіо гірше за вимкнене", () => {
    const { state, cat } = catWith(-1);
    setRadioOn(state, true);
    expect(radioSleepWeight(state, cat)).toBeLessThan(RADIO_SLEEP.base);
  });

  it("вимикач лишає в стані лише поле увімкненого радіо", () => {
    const state = atRadio();
    setRadioOn(state, true);
    expect(state.home.radioOn).toBe(true);
    setRadioOn(state, false);
    expect("radioOn" in state.home).toBe(false);
  });
});

describe("вподобання (§8.10)", () => {
  const IDS = ["mur", "retro"];
  const memory = (saved: string | null): Pick<Storage, "getItem" | "setItem"> & { value: string | null } => ({
    value: saved,
    getItem() {
      return this.value;
    },
    setItem(_key, value) {
      this.value = value;
    },
  });

  it("типово радіо вимкнене", () => {
    expect(DEFAULT_AUDIO.radioOn).toBe(false);
  });

  it("без збереженого — типові", () => {
    expect(loadAudioSettings(memory(null), IDS)).toEqual(DEFAULT_AUDIO);
    expect(loadAudioSettings(null, IDS)).toEqual(DEFAULT_AUDIO);
  });

  it("зберігає й читає", () => {
    const storage = memory(null);
    saveAudioSettings(storage, { radioOn: false, station: "mur", volume: 0.25 });
    expect(loadAudioSettings(storage, IDS)).toEqual({ radioOn: false, station: "mur", volume: 0.25 });
  });

  it("зіпсоване значення дає типове, а гучність лишається в межах", () => {
    expect(loadAudioSettings(memory("не json"), IDS)).toEqual(DEFAULT_AUDIO);
    expect(loadAudioSettings(memory('{"station":"немає такої","volume":7,"radioOn":"так"}'), IDS)).toEqual({ ...DEFAULT_AUDIO, volume: 1 });
  });

  it("сховище, що кидає помилку, не ламає гру", () => {
    const broken = { getItem: () => null, setItem: () => { throw new Error("повне"); } };
    expect(() => saveAudioSettings(broken, DEFAULT_AUDIO)).not.toThrow();
  });
});

describe("файли радіо (§8.10)", () => {
  it("у кожної станції є назва, гасло й щонайменше два треки", () => {
    expect(STATIONS.length).toBe(5);
    for (const station of STATIONS) {
      expect(RADIO_STATIONS[station.id], station.id).toBeDefined();
      expect(station.tracks.length, station.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("типова станція існує", () => {
    expect(STATIONS.some((station) => station.id === DEFAULT_AUDIO.station)).toBe(true);
  });

  /** Поки хостингу немає, гра бере кілька тимчасових треків із власної теки `public/radio/`. */
  const base = (playlist as { base?: string | null }).base ?? null;

  it.runIf(base !== null)("адреса хостингу — https зі скісною рискою в кінці", () => {
    expect(base).toMatch(/^https:\/\/.+\/$/);
  });

  it.runIf(base === null)("шматки кожного треку лежать на місці й мають кадри на сітці", () => {
    for (const station of STATIONS) {
      for (const track of station.tracks) {
        const chunks = Math.ceil(track.frames / RADIO.chunkFrames);
        // Профіль у назві теки: «96» (стерео, старі зразки), «m48», «s64».
        const bitrate = Number(/(\d+)$/.exec(track.id)?.[1]);
        const frameBytes = (144 * bitrate * 1000) / SAMPLE_RATE;
        for (let chunk = 0; chunk < chunks; chunk++) {
          const file = `public/radio/${track.id}/${chunk}.mp3`;
          expect(existsSync(file), file).toBe(true);
          const first = Math.max(0, chunk * RADIO.chunkFrames - RADIO.preFrames);
          const last = Math.min(track.frames, (chunk + 1) * RADIO.chunkFrames + RADIO.postFrames);
          expect(statSync(file).size, file).toBe((last - first) * frameBytes);
        }
        expect(existsSync(`public/radio/${track.id}/${chunks}.mp3`), "зайвий шматок").toBe(false);
        const head = readFileSync(`public/radio/${track.id}/0.mp3`).subarray(0, 2);
        expect(head[0]).toBe(0xff);
      }
    }
  });
});
