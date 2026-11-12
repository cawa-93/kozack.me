// Web Audio без браузера для тестів звуку (`src/audio/`): вузли лише запам'ятовують, що з ними робили, а декодування можна
// притримати, щоб перевірити, що буває, поки файл ще не готовий.

import { vi } from "vitest";

import type { AudioEngine } from "../src/audio/engine";

export interface FakeParam {
  value: number;
  setTargetAtTime: ReturnType<typeof vi.fn>;
  cancelScheduledValues: ReturnType<typeof vi.fn>;
}

const param = (value: number): FakeParam => ({ value, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() });

export interface FakeSource {
  buffer: unknown;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  playbackRate: FakeParam;
  /** Аргументи `start`: коли, з якого місця, скільки. */
  started: number[] | null;
  onended: (() => void) | null;
  connect(node: unknown): unknown;
  start(...args: number[]): void;
  stop(): void;
  addEventListener(): void;
}

export interface FakeAudio {
  engine: AudioEngine;
  context: {
    state: AudioContextState;
    currentTime: number;
    getOutputTimestamp?: () => AudioTimestamp;
  };
  /** Усі створені джерела, у порядку створення. */
  sources: FakeSource[];
  /** Джерела, яким сказали `start`. */
  started(): FakeSource[];
  /** Декодування, що ще чекають: `release()` їх відпускає. */
  decodes: { bytes: ArrayBuffer; resolve(): void }[];
  buses: { music: { gain: FakeParam }; world: { gain: FakeParam }; ui: { gain: FakeParam } };
}

/** Декодований звук: `seconds` тривалості, з першого ж семпла не тиша. */
export function fakeBuffer(seconds = 1): AudioBuffer {
  const length = Math.round(seconds * 48_000);
  const data = new Float32Array(Math.min(length, 4800));
  data.fill(0.5);
  return { length, duration: seconds, numberOfChannels: 1, sampleRate: 48_000, getChannelData: () => data } as unknown as AudioBuffer;
}

/** Рушій із запущеним контекстом; `hold` — декодування чекає, поки його не відпустять. */
export function fakeAudio(options: { hold?: boolean; seconds?: number } = {}): FakeAudio {
  const sources: FakeSource[] = [];
  const decodes: FakeAudio["decodes"] = [];
  const node = <T extends object>(extra: T): T & { connect(next: unknown): unknown; disconnect(): void } => ({
    ...extra,
    connect: (next: unknown) => next,
    disconnect: () => undefined,
  });
  const context = {
    state: "running" as AudioContextState,
    currentTime: 0,
    sampleRate: 48_000,
    destination: node({}),
    createGain: () => node({ gain: param(1) }),
    createStereoPanner: () => node({ pan: param(0) }),
    createBiquadFilter: () => node({ type: "", frequency: param(0), gain: param(0) }),
    createBufferSource: (): FakeSource => {
      const source: FakeSource = {
        buffer: null,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        playbackRate: param(1),
        started: null,
        onended: null,
        connect: (next) => next,
        start: (...args) => void (source.started = args),
        stop: () => undefined,
        addEventListener: () => undefined,
      };
      sources.push(source);
      return source;
    },
    decodeAudioData: (bytes: ArrayBuffer): Promise<AudioBuffer> => {
      const buffer = fakeBuffer(options.seconds);
      if (!options.hold) return Promise.resolve(buffer);
      return new Promise((resolve) => decodes.push({ bytes, resolve: () => resolve(buffer) }));
    },
  };
  const buses = { music: node({ gain: param(1) }), world: node({ gain: param(1) }), ui: node({ gain: param(1) }) };
  const engine = {
    context,
    buses,
    get music() {
      return buses.music;
    },
    onRunning: () => undefined,
  } as unknown as AudioEngine;
  return { engine, context, sources, started: () => sources.filter((s) => s.started !== null), decodes, buses };
}

/** Дочекатися всіх обіцянок, що вже готові (fetch, декодування). */
export const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};
