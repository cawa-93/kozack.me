// Повзунки гучності (§8.10, §11.4а): гучність змінюється плавно, без клацу на кожен крок, а вподобання пишуться в сховище,
// коли повзунок зупинився, а не на кожну подію `input`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SFX, VOLUME_GLIDE } from "../src/audio/config";
import { STATIONS } from "../src/audio/radio/playlist";
import { Radio } from "../src/audio/radio/radio";
import { Sounds } from "../src/audio/sfx/sounds";
import { AudioPrefs, DEFAULT_AUDIO } from "../src/audio/settings";
import { fakeAudio } from "./fakeaudio";

const IDS = STATIONS.map((s) => s.id);
const memory = (): Pick<Storage, "getItem" | "setItem"> & { saved: string[] } => {
  const saved: string[] = [];
  return { saved, getItem: () => saved.at(-1) ?? null, setItem: (_key, value) => void saved.push(value) };
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("повзунки гучності: плавно (§8.10, §11.4а)", () => {
  it("звуки: шини світу й інтерфейсу йдуть до нової гучності плавно, а не стрибком", () => {
    const audio = fakeAudio();
    audio.context.currentTime = 3;
    const sounds = new Sounds(audio.engine, new AudioPrefs(null, IDS));
    sounds.setVolume(0.5);
    expect(audio.buses.world.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.5 * SFX.worldLevel, 3, VOLUME_GLIDE);
    expect(audio.buses.ui.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.5 * SFX.uiLevel, 3, VOLUME_GLIDE);
    expect(audio.buses.world.gain.value).toBe(1);
  });

  it("звук щойно запустився — гучність одразу така, як у повзунку: перший звук не гучніший, хоч шина й починає з повної", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    vi.stubGlobal("window", { addEventListener: () => undefined, setInterval: () => 0 });
    const audio = fakeAudio();
    (audio.engine as { onRunning(listener: () => void): void }).onRunning = (listener) => listener();
    const prefs = new AudioPrefs(null, IDS);
    prefs.update({ effects: 0, volume: 0 });
    new Sounds(audio.engine, prefs).start();
    new Radio(audio.engine, prefs).start();
    expect(audio.buses.world.gain.value).toBe(0);
    expect(audio.buses.ui.gain.value).toBe(0);
    expect(audio.buses.music.gain.value).toBe(0);
  });

  it("радіо: шина музики — так само", () => {
    const audio = fakeAudio();
    audio.context.currentTime = 2;
    const radio = new Radio(audio.engine, new AudioPrefs(null, IDS));
    radio.setVolume(0.25);
    expect(audio.buses.music.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.25, 2, VOLUME_GLIDE);
    expect(audio.buses.music.gain.value).toBe(1);
  });
});

describe("повзунки гучності: вподобання — коли повзунок зупинився (§8.10)", () => {
  it("кроки повзунка не пишуть сховище щоразу: раз, після паузи, з останнім значенням; у пам'яті — одразу", () => {
    const storage = memory();
    const prefs = new AudioPrefs(storage, IDS);
    const radio = new Radio(fakeAudio().engine, prefs);
    for (let step = 1; step <= 20; step++) radio.setVolume(step / 100);
    expect(radio.volume).toBe(0.2);
    expect(storage.saved).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(storage.saved.map((value) => JSON.parse(value).volume)).toEqual([0.2]);
  });

  it("повзунок звуків — так само", () => {
    const storage = memory();
    const sounds = new Sounds(fakeAudio().engine, new AudioPrefs(storage, IDS));
    for (let step = 1; step <= 10; step++) sounds.setVolume(step / 10);
    expect(storage.saved).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(storage.saved.map((value) => JSON.parse(value).effects)).toEqual([1]);
  });

  it("вимикач і станція пишуться одразу — разом із гучністю, що ще чекала", () => {
    const storage = memory();
    const prefs = new AudioPrefs(storage, IDS);
    const radio = new Radio(fakeAudio().engine, prefs);
    radio.setVolume(0.3);
    radio.toggle();
    expect(storage.saved.map((value) => JSON.parse(value))).toEqual([{ ...DEFAULT_AUDIO, radioOn: true, volume: 0.3 }]);
    vi.advanceTimersByTime(1000);
    expect(storage.saved).toHaveLength(1);
  });

  it("сторінку закривають, поки повзунок ще не зупинився, — гучність усе одно записано", () => {
    const listeners = new Map<string, () => void>();
    vi.stubGlobal("window", { addEventListener: (type: string, fn: () => void) => listeners.set(type, fn) });
    const storage = memory();
    const prefs = new AudioPrefs(storage, IDS);
    new Radio(fakeAudio().engine, prefs).setVolume(0.45);
    listeners.get("pagehide")?.();
    expect(storage.saved.map((value) => JSON.parse(value).volume)).toEqual([0.45]);
  });
});
