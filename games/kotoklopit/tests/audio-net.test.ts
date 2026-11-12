// Запити звуків і шматків радіо (§8.10, §11.4а, `src/audio/net.ts`): скасовується лише запит, що застиг, — довго не прийшло
// ні заголовків, ні нового байта. Повільна, але жива лінія докачує скільки завгодно довго: у гри багато гравців із повільним
// мобільним інтернетом.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RADIO, SFX } from "../src/audio/config";
import type { AudioEngine } from "../src/audio/engine";
import { ChunkStore } from "../src/audio/radio/chunks";
import { STATIONS } from "../src/audio/radio/playlist";
import { Radio } from "../src/audio/radio/radio";
import type { SoundFile } from "../src/audio/sfx/files";
import { Player } from "../src/audio/sfx/player";
import { AudioPrefs } from "../src/audio/settings";
import { fakeAudio } from "./fakeaudio";

interface Trickle {
  /** Шматків тіла по 1000 байтів. */
  count: number;
  /** Пауза перед кожним шматком, мс. */
  everyMs: number;
  /** Після останнього шматка — тиша назавжди, а не кінець тіла. */
  hang?: boolean;
  /** Заголовків немає взагалі. */
  noHeaders?: boolean;
}

/**
 * `fetch`, чия відповідь іде шматками на фальшивому годиннику. Скасування запиту обриває і очікування заголовків, і потік
 * тіла, як у браузері. `signals` — сигнали кожного запиту.
 */
function trickle(options: Trickle): { fetch: ReturnType<typeof vi.fn>; signals: (AbortSignal | undefined)[] } {
  const signals: (AbortSignal | undefined)[] = [];
  const fetch = vi.fn((_url: string, init?: RequestInit) => {
    const signal = init?.signal ?? undefined;
    signals.push(signal);
    return new Promise<Response>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let sent = 0;
      let control: ReadableStreamDefaultController<Uint8Array> | null = null;
      const stream = new ReadableStream<Uint8Array>({
        start: (controller) => {
          control = controller;
        },
        pull: (controller) => {
          if (sent >= options.count) {
            if (options.hang) return new Promise<void>(() => undefined);
            controller.close();
            return;
          }
          return new Promise<void>((done) => {
            timer = setTimeout(() => {
              sent++;
              controller.enqueue(new Uint8Array(1000));
              done();
            }, options.everyMs);
          });
        },
      });
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        const error = new DOMException("скасовано", "AbortError");
        control?.error(error);
        reject(error);
      });
      if (!options.noHeaders) resolve(new Response(stream));
    });
  });
  return { fetch, signals };
}

const LOOP: SoundFile = { key: "test/slow", url: "slow.mp3", loop: { start: 0.1, end: 8.1 } };

const native = AbortSignal.timeout;

beforeEach(() => {
  vi.useFakeTimers();
  // Тайм-аут сигналу браузера — на тому самому фальшивому годиннику, що й мережа.
  Object.defineProperty(AbortSignal, "timeout", {
    configurable: true,
    writable: true,
    value: (ms: number): AbortSignal => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("тайм-аут", "TimeoutError")), ms);
      return controller.signal;
    },
  });
});

afterEach(() => {
  Object.defineProperty(AbortSignal, "timeout", { configurable: true, writable: true, value: native });
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("звуки: скасовується лише запит, що застиг (§11.4а)", () => {
  it("повільна, але жива лінія докачує: байти йдуть рідко, проте без пауз, довших за поріг, — запит не скасовується", async () => {
    // 45 шматків, по одному на секунду: разом довше за будь-який розумний тайм-аут на весь запит.
    const { fetch, signals } = trickle({ count: 45, everyMs: 1000 });
    vi.stubGlobal("fetch", fetch);
    const audio = fakeAudio();
    player(audio).loop(LOOP, { bus: "music", gain: 1, pan: 0 });
    await vi.advanceTimersByTimeAsync(46_000);
    expect(signals[0]?.aborted).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(audio.started()).toHaveLength(1);
  });

  it("потік, що завис, скасовується за `SFX.stallMs` від останнього байта, і петля пробує знову", async () => {
    const { fetch, signals } = trickle({ count: 3, everyMs: 1000, hang: true });
    vi.stubGlobal("fetch", fetch);
    player(fakeAudio()).loop(LOOP, { bus: "music", gain: 1, pan: 0 });
    await vi.advanceTimersByTimeAsync(3000 + SFX.stallMs - 100);
    expect(signals[0]?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(signals[0]?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(SFX.retryMs);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("заголовки не прийшли за `SFX.stallMs` — запит скасовано", async () => {
    const { fetch, signals } = trickle({ count: 0, everyMs: 0, noHeaders: true });
    vi.stubGlobal("fetch", fetch);
    player(fakeAudio()).loop(LOOP, { bus: "music", gain: 1, pan: 0 });
    await vi.advanceTimersByTimeAsync(SFX.stallMs - 100);
    expect(signals[0]?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(signals[0]?.aborted).toBe(true);
  });

  it("браузер без потокового тіла: тайм-аут лише до заголовків, а тіло докачується скільки завгодно", async () => {
    const signals: (AbortSignal | undefined)[] = [];
    const fetch = vi.fn((_url: string, init?: RequestInit) => {
      signals.push(init?.signal ?? undefined);
      const body = new Promise<ArrayBuffer>((resolve) => setTimeout(() => resolve(new ArrayBuffer(16)), 60_000));
      return Promise.resolve({ ok: true, status: 200, body: null, arrayBuffer: () => body } as unknown as Response);
    });
    vi.stubGlobal("fetch", fetch);
    const audio = fakeAudio();
    player(audio).loop(LOOP, { bus: "music", gain: 1, pan: 0 });
    await vi.advanceTimersByTimeAsync(61_000);
    expect(signals[0]?.aborted).toBe(false);
    expect(audio.started()).toHaveLength(1);
  });
});

describe("радіо: скасовується лише запит шматка, що застиг (§8.10)", () => {
  it("шматок на повільній лінії докачується, і того самого шматка вдруге не просять", async () => {
    // 30 шматків по секунді: шматок радіо приходить за пів хвилини.
    const { fetch, signals } = trickle({ count: 30, everyMs: 1000 });
    vi.stubGlobal("fetch", fetch);
    const silent = { context: null, music: null, onRunning: () => undefined } as unknown as AudioEngine;
    const prefs = new AudioPrefs(null, STATIONS.map((s) => s.id));
    prefs.update({ radioOn: true });
    const radio = new Radio(silent, prefs);
    // Радіо питає чергу щопівсекунди (`RADIO.tickMs`).
    for (let t = 0; t < 32_000; t += RADIO.tickMs) {
      radio.standby();
      await vi.advanceTimersByTimeAsync(RADIO.tickMs);
    }
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((signal) => signal?.aborted === false)).toBe(true);
    const urls = fetch.mock.calls.map((call) => call[0]);
    expect(new Set(urls).size).toBe(urls.length);
    expect((radio as unknown as { store: ChunkStore }).store.size).toBeGreaterThanOrEqual(30_000);
  });
});

function player(audio: ReturnType<typeof fakeAudio>): Player {
  return new Player(audio.engine);
}
