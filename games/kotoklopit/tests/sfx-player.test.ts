// Програвач звуків (§11.4а, `audio/SOUND.md`, «Ефекти»): запити з тайм-аутом, голоси — лише звукам, що справді звучать.

import { afterEach, describe, expect, it, vi } from "vitest";

import { SFX } from "../src/audio/config";
import { timeoutSignal } from "../src/audio/net";
import { soundFile } from "../src/audio/sfx/files";
import { Player } from "../src/audio/sfx/player";
import { GROUPS } from "../src/audio/sfx/registry";
import { Sounds } from "../src/audio/sfx/sounds";
import { AudioPrefs } from "../src/audio/settings";
import { fakeAudio, settle } from "./fakeaudio";

const prefs = (): AudioPrefs => new AudioPrefs(null, ["retro"]);
const bytes = (): Promise<Response> => Promise.resolve(new Response(new ArrayBuffer(16)));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("звуки: завислий запит не глушить решту (Н4)", () => {
  it("звук, чий файл ще не прийшов, не займає голосу: готовий звук звучить, хоч би скільки файлів зависло", async () => {
    const open = soundFile("ui", "open")!.url;
    vi.stubGlobal("fetch", vi.fn((url: string) => (url === open ? bytes() : new Promise<Response>(() => undefined))));
    const audio = fakeAudio();
    const sounds = new Sounds(audio.engine, prefs());
    let hung = 0;
    for (const group of GROUPS) {
      for (const [name, def] of Object.entries(group.sounds)) {
        if (def.loop || (group.id === "ui" && name === "open")) continue;
        sounds.play(group.id, name);
        hung++;
      }
    }
    expect(hung).toBeGreaterThan(SFX.voices);
    sounds.play("ui", "open");
    await settle();
    expect(audio.started()).toHaveLength(1);
  });

  it("звук, що прийшов, зважає на межу голосів у мить, коли справді зазвучав", async () => {
    vi.stubGlobal("fetch", vi.fn(bytes));
    const audio = fakeAudio({ hold: true });
    const sounds = new Sounds(audio.engine, prefs());
    // Різні звуки, кожен ще декодується: межа загальна, тож зазвучить не більше `SFX.voices`.
    let asked = 0;
    for (const group of GROUPS) {
      for (const [name, def] of Object.entries(group.sounds)) {
        if (def.loop) continue;
        sounds.play(group.id, name);
        asked++;
      }
    }
    expect(asked).toBeGreaterThan(SFX.voices);
    await settle();
    for (const decode of audio.decodes) decode.resolve();
    await settle();
    expect(audio.started().length).toBe(SFX.voices);
  });

  it("файл звуку просять із тайм-аутом", () => {
    const fetch = vi.fn((_url: string, _init?: RequestInit) => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetch);
    const player = new Player(fakeAudio().engine);
    void player.preload([soundFile("ui", "open")!]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("петля, чий файл не прийшов (збій, тайм-аут), пробує знову, поки її не вимкнули", async () => {
    vi.useFakeTimers();
    let fail = true;
    const fetch = vi.fn(() => (fail ? Promise.reject(new Error("тайм-аут")) : Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)) })));
    vi.stubGlobal("fetch", fetch);
    const audio = fakeAudio();
    const player = new Player(audio.engine);
    const voice = player.loop(soundFile("home", "stove-loop")!, { bus: "world", gain: 1, pan: 0 });
    expect(voice).not.toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    expect(audio.started()).toHaveLength(0);
    fail = false;
    await vi.advanceTimersByTimeAsync(SFX.retryMs);
    expect(audio.started()).toHaveLength(1);
    // Вимкнена петля, чий файл не прийшов, більше не просить.
    fail = true;
    const other = player.loop(soundFile("home", "vacuum-loop")!, { bus: "world", gain: 1, pan: 0 });
    await vi.advanceTimersByTimeAsync(0);
    other?.stop();
    const asked = fetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(SFX.retryMs * 3);
    expect(fetch.mock.calls.length).toBe(asked);
  });

  it("тайм-аут є й там, де браузер не знає `AbortSignal.timeout`", () => {
    vi.useFakeTimers();
    const native = AbortSignal.timeout;
    Object.defineProperty(AbortSignal, "timeout", { value: undefined, configurable: true, writable: true });
    try {
      const signal = timeoutSignal(1000);
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal?.aborted).toBe(false);
      vi.advanceTimersByTime(1001);
      expect(signal?.aborted).toBe(true);
    } finally {
      Object.defineProperty(AbortSignal, "timeout", { value: native, configurable: true, writable: true });
    }
  });
});
