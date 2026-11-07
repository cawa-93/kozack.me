import { existsSync, readFileSync, statSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { RADIO, SAMPLE_RATE } from "../src/audio/config";
import { STATIONS } from "../src/audio/radio/playlist";
import { DEFAULT_AUDIO, loadAudioSettings, saveAudioSettings } from "../src/audio/settings";
import { tap } from "../src/sim/actions";
import { onEvent } from "../src/sim/events";
import { newGame } from "../src/sim/game";
import { isSolid, objectById } from "../src/sim/home";
import { targetOf } from "../src/sim/targets";
import type { GameState } from "../src/sim/types";
import { RADIO_STATIONS } from "../src/texts";

/** Персонаж стоїть перед радіо, обличчям до нього. */
function atRadio(): GameState {
  const state = newGame({ address: "she", difficulty: "normal", seed: 1 }).current;
  Object.assign(state.character.body, { x: 2.35, y: 7.5, facing: { x: -1, y: 0 } });
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

  it("шматки кожного треку лежать на місці й мають кадри на сітці", () => {
    for (const station of STATIONS) {
      for (const track of station.tracks) {
        const chunks = Math.ceil(track.frames / RADIO.chunkFrames);
        const bitrate = Number(track.id.split("-")[1]);
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
