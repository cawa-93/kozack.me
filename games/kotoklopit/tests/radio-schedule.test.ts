import { describe, expect, it } from "vitest";

import { CHUNK_SECONDS, RADIO, SAMPLE_RATE } from "../src/audio/config";
import { chunkOf, chunkSamples, chunkStart, chunksAhead, nextSlot, onAir, slotAt, trackSamples, trackSeconds, type RadioTrack, type Station } from "../src/audio/radio/schedule";

/** Трек із кількістю секунд, округленою до кадрів. */
const track = (id: string, seconds: number): RadioTrack => ({ id, artist: "a", title: id, frames: Math.round((seconds * SAMPLE_RATE) / RADIO.frameSamples) });
const station = (id: string, ...seconds: number[]): Station => ({ id, frequency: "90,0", tracks: seconds.map((s, i) => track(`${id}-${i}`, s)) });

const FIVE = station("five", 130, 200, 95, 170, 240);
/** Великий реальний час: на ньому й трапляються похибки округлення. */
const NOW = 1_800_000_000;

describe("розклад станції (§8.10)", () => {
  it("через п'ять секунд той самий трек на п'ять секунд далі", () => {
    const start = slotAt(FIVE, NOW).start;
    const at = start + 20;
    const before = onAir(FIVE, at);
    const after = onAir(FIVE, at + 5);
    expect(after.track).toBe(before.track);
    expect(after.offset - before.offset).toBeCloseTo(5, 5);
  });

  it("не залежить від того, що спитали раніше: інша станція й інші миті нічого не зсувають", () => {
    const other = station("other", 100, 150, 120);
    const before = onAir(FIVE, NOW);
    onAir(other, NOW + 3);
    onAir(FIVE, NOW + 900_000);
    onAir(other, NOW - 777);
    expect(onAir(FIVE, NOW)).toEqual(before);
  });

  it("між треками — пауза", () => {
    const slot = slotAt(FIVE, NOW);
    const end = slot.start + trackSeconds(slot.track);
    expect(onAir(FIVE, end + RADIO.gapSeconds / 2).track).toBeNull();
    expect(slotAt(FIVE, end + RADIO.gapSeconds / 2).start).toBeCloseTo(end + RADIO.gapSeconds, 5);
    expect(onAir(FIVE, end + RADIO.gapSeconds + 0.01).track).not.toBeNull();
  });

  it("коло грає кожен трек рівно раз", () => {
    let slot = slotAt(FIVE, 0);
    while (slot.index !== 0) slot = nextSlot(FIVE, slot);
    const seen = new Set<string>();
    for (let i = 0; i < FIVE.tracks.length; i++) {
      seen.add(slot.track.id);
      slot = nextSlot(FIVE, slot);
    }
    expect(seen.size).toBe(FIVE.tracks.length);
  });

  it("на стику кіл трек не повторюється", () => {
    for (const tested of [station("three", 100, 110, 120), FIVE, station("nine", 100, 110, 120, 130, 140, 150, 160, 170, 180)]) {
      let slot = slotAt(tested, NOW);
      for (let i = 0; i < 2000; i++) {
        const next = nextSlot(tested, slot);
        expect(next.track.id).not.toBe(slot.track.id);
        slot = next;
      }
    }
  });

  it("різні кола перемішані по-різному, а те саме коло — однаково", () => {
    const first = (cycle: number): string[] => {
      const length = FIVE.tracks.reduce((sum, t) => sum + trackSeconds(t) + RADIO.gapSeconds, 0);
      let slot = slotAt(FIVE, cycle * length + 0.01);
      const order: string[] = [];
      for (let i = 0; i < FIVE.tracks.length; i++) {
        order.push(slot.track.id);
        slot = nextSlot(FIVE, slot);
      }
      return order;
    };
    expect(first(100)).toEqual(first(100));
    const orders = new Set(Array.from({ length: 20 }, (_, i) => first(100 + i).join()));
    expect(orders.size).toBeGreaterThan(3);
  });

  it("станція з двох треків чергує їх", () => {
    const two = station("two", 100, 120);
    const slot = slotAt(two, NOW);
    expect(nextSlot(two, slot).track.id).not.toBe(slot.track.id);
    expect(nextSlot(two, nextSlot(two, slot)).track.id).toBe(slot.track.id);
  });
});

describe("шматки (§8.10)", () => {
  it("сітка шматків покриває трек без дір", () => {
    const t = track("t", 130);
    let sum = 0;
    for (let chunk = 0; chunkStart(chunk) < trackSamples(t); chunk++) {
      expect(chunkStart(chunk)).toBe(sum);
      sum += chunkSamples(t, chunk);
    }
    expect(sum).toBe(trackSamples(t));
    expect(chunkOf(trackSamples(t) - 1)).toBe(Math.ceil(t.frames / RADIO.chunkFrames) - 1);
  });

  it("шматок має рівно стільки семплів, скільки кадрів", () => {
    expect(CHUNK_SECONDS).toBeCloseTo(8.064, 6);
    expect(chunkSamples(track("t", 100), 0)).toBe(RADIO.chunkFrames * RADIO.frameSamples);
  });

  it("шматки наперед ідуть підряд і переходять на наступний трек", () => {
    const slot = slotAt(FIVE, NOW);
    const nearEnd = slot.start + trackSeconds(slot.track) - 3;
    const refs = chunksAhead(FIVE, nearEnd, 12);
    expect(refs[0]?.track).toBe(slot.track);
    expect(refs[0]?.chunk).toBe(chunkOf((trackSeconds(slot.track) - 3) * SAMPLE_RATE));
    expect(refs.at(-1)?.track).toBe(nextSlot(FIVE, slot).track);
    expect(refs.at(-1)?.chunk).toBe(0);
  });

  it("на реальному часі шматки закінчуються за скінченне число кроків", () => {
    expect(chunksAhead(FIVE, NOW, 600).length).toBeGreaterThan(50);
  });
});
