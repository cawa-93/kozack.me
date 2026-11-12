import { afterEach, describe, expect, it, vi } from "vitest";

import { RADIO, SAMPLE_RATE } from "../src/audio/config";
import type { AudioEngine } from "../src/audio/engine";
import { ChunkStore } from "../src/audio/radio/chunks";
import { STATIONS as REAL_STATIONS } from "../src/audio/radio/playlist";
import { wantedChunks } from "../src/audio/radio/prefetch";
import { Radio } from "../src/audio/radio/radio";
import { chunkKey, type ChunkRef, type RadioTrack, type Station } from "../src/audio/radio/schedule";
import { AudioPrefs } from "../src/audio/settings";

const track = (id: string, seconds: number): RadioTrack => ({ id, artist: "a", title: id, frames: Math.round((seconds * SAMPLE_RATE) / RADIO.frameSamples) });
const station = (id: string): Station => ({ id, frequency: "90,0", tracks: [track(`${id}-a`, 180), track(`${id}-b`, 200), track(`${id}-c`, 220)] });
const STATIONS = [station("one"), station("two"), station("three")];
const NOW = 1_800_000_000;
const tracksOf = (refs: ChunkRef[]): Set<string> => new Set(refs.map((ref) => ref.track.id.split("-")[0]!));

describe("що вантажити (§8.10)", () => {
  it("вимкнене радіо далеко від персонажа не вантажить нічого", () => {
    expect(wantedChunks({ stations: STATIONS, listening: null, nearSeconds: null, now: NOW })).toEqual([]);
  });

  it("станція, що грає, вантажиться наперед, решта — ні", () => {
    const refs = wantedChunks({ stations: STATIONS, listening: "two", nearSeconds: null, now: NOW });
    expect(tracksOf(refs)).toEqual(new Set(["two"]));
    expect(refs.length).toBeGreaterThanOrEqual(3);
  });

  it("біля радіо напоготові всі станції, але станція, що грає, — першою", () => {
    const refs = wantedChunks({ stations: STATIONS, listening: "two", nearSeconds: 1, now: NOW });
    expect(tracksOf(refs)).toEqual(new Set(["one", "two", "three"]));
    expect(refs[0]?.track.id.startsWith("two")).toBe(true);
  });

  it("біля вимкненого радіо напоготові всі станції", () => {
    expect(tracksOf(wantedChunks({ stations: STATIONS, listening: null, nearSeconds: 1, now: NOW }))).toEqual(new Set(["one", "two", "three"]));
  });

  it("забута відкрита картка не тягне всі станції вічно", () => {
    const refs = wantedChunks({ stations: STATIONS, listening: "two", nearSeconds: RADIO.standbyLimitSeconds + 1, now: NOW });
    expect(tracksOf(refs)).toEqual(new Set(["two"]));
  });

  it("шматки не повторюються", () => {
    const refs = wantedChunks({ stations: STATIONS, listening: "one", nearSeconds: 1, now: NOW });
    expect(new Set(refs.map(chunkKey)).size).toBe(refs.length);
  });
});

const ref = (id: string, chunk: number): ChunkRef => ({ track: track(id, 100), chunk });
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("шматки в пам'яті (§8.10)", () => {
  const store = (fetchBytes = vi.fn(async () => new ArrayBuffer(100)), limit = 1000, clock = (): number => 0) => ({ fetchBytes, chunks: new ChunkStore((r) => chunkKey(r), fetchBytes, clock, limit) });

  it("той самий шматок запитує один раз", async () => {
    const { chunks, fetchBytes } = store();
    chunks.want([ref("a", 0)]);
    chunks.want([ref("a", 0)]);
    await settle();
    chunks.want([ref("a", 0)]);
    expect(fetchBytes).toHaveBeenCalledTimes(1);
    expect(chunks.copy(ref("a", 0))?.byteLength).toBe(100);
  });

  it("не перевищує числа одночасних запитів, а першими йдуть перші в списку", () => {
    const { chunks, fetchBytes } = store(vi.fn(() => new Promise<ArrayBuffer>(() => {})));
    chunks.want(Array.from({ length: 10 }, (_, i) => ref("a", i)));
    expect(fetchBytes).toHaveBeenCalledTimes(RADIO.parallelRequests);
    expect(fetchBytes.mock.calls.at(0)?.at(0)).toBe("a/0");
  });

  it("витісняє найдавніші, а щойно потрібний лишає", async () => {
    const { chunks } = store(undefined, 300);
    chunks.want([ref("a", 0), ref("a", 1), ref("a", 2)]);
    await settle();
    chunks.want([ref("a", 0)]);
    chunks.want([ref("a", 3)]);
    await settle();
    expect(chunks.copy(ref("a", 1))).toBeNull();
    expect(chunks.copy(ref("a", 0))).not.toBeNull();
    expect(chunks.size).toBeLessThanOrEqual(300);
  });

  it("копія не забирає байти: `decodeAudioData` віддає буфер собі", async () => {
    const { chunks } = store();
    chunks.want([ref("a", 0)]);
    await settle();
    expect(chunks.copy(ref("a", 0))).not.toBe(chunks.copy(ref("a", 0)));
  });

  it("завислий запит за `RADIO.requestTimeoutMs` звільняє місце: решта шматків не чекає вічно (Н4)", () => {
    let now = 0;
    const { chunks, fetchBytes } = store(vi.fn(() => new Promise<ArrayBuffer>(() => {})), 1000, () => now);
    const refs = Array.from({ length: 10 }, (_, i) => ref("a", i));
    chunks.want(refs);
    expect(fetchBytes).toHaveBeenCalledTimes(RADIO.parallelRequests);
    now = RADIO.requestTimeoutMs - 1;
    chunks.want(refs);
    expect(fetchBytes).toHaveBeenCalledTimes(RADIO.parallelRequests);
    now = RADIO.requestTimeoutMs + 1;
    chunks.want(refs);
    // Завислі вважаються невдалими: їх попросять знову лише через `retryMs`, а місця дістаються наступним.
    expect(fetchBytes).toHaveBeenCalledTimes(RADIO.parallelRequests * 2);
    expect(fetchBytes.mock.calls.slice(RADIO.parallelRequests).map((call) => call.at(0))).toEqual(["a/3", "a/4", "a/5"]);
  });

  it("запізнілий шматок після тайм-ауту не ламає нового запиту того самого шматка", async () => {
    let now = 0;
    const late: ((data: ArrayBuffer) => void)[] = [];
    const fetchBytes = vi.fn(() => new Promise<ArrayBuffer>((resolve) => late.push(resolve)));
    const { chunks } = store(fetchBytes, 1000, () => now);
    chunks.want([ref("a", 0)]);
    now = RADIO.requestTimeoutMs + RADIO.retryMs + 2;
    chunks.want([ref("a", 0)]);
    expect(fetchBytes).toHaveBeenCalledTimes(2);
    late[0]?.(new ArrayBuffer(100));
    await settle();
    expect(chunks.copy(ref("a", 0))?.byteLength).toBe(100);
    // Новий запит ще йде: той самий шматок удруге не просять, а його відповідь не рахується двічі.
    chunks.want([ref("a", 0)]);
    expect(fetchBytes).toHaveBeenCalledTimes(2);
    late[1]?.(new ArrayBuffer(100));
    await settle();
    expect(chunks.size).toBe(100);
  });

  it("шматок, що не прийшов, просить знову лише згодом", async () => {
    let now = 0;
    const fetchBytes = vi.fn(async () => {
      throw new Error("немає мережі");
    });
    const { chunks } = store(fetchBytes as never, 1000, () => now);
    chunks.want([ref("a", 0)]);
    await settle();
    chunks.want([ref("a", 0)]);
    expect(fetchBytes).toHaveBeenCalledTimes(1);
    now = RADIO.retryMs + 1;
    chunks.want([ref("a", 0)]);
    expect(fetchBytes).toHaveBeenCalledTimes(2);
  });
});

describe("запит шматка з мережі (Н4)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("радіо просить шматок із тайм-аутом: завислий запит не тримає місце вічно", async () => {
    const fetch = vi.fn((_url: string, _init?: RequestInit) => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetch);
    const silent = { context: null, music: null, onRunning: () => undefined } as unknown as AudioEngine;
    const prefs = new AudioPrefs(null, REAL_STATIONS.map((s) => s.id));
    prefs.update({ radioOn: true });
    new Radio(silent, prefs).standby();
    await settle();
    expect(fetch).toHaveBeenCalled();
    for (const call of fetch.mock.calls) expect(call[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});
