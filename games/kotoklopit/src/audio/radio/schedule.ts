// Розклад станції (§8.10): що звучить у цю мить, випливає лише з часу, тож трансляція йде й тоді, коли її ніхто не слухає.
// Чисті функції без браузера; час — секунди реального годинника.

import { RADIO, SAMPLE_RATE } from "../config";

export interface RadioTrack {
  /** Назва теки зі шматками. */
  id: string;
  artist: string;
  title: string;
  /** Кадрів MP3 у треку. */
  frames: number;
}

export interface Station {
  id: string;
  frequency: string;
  tracks: readonly RadioTrack[];
}

export interface ChunkRef {
  track: RadioTrack;
  chunk: number;
}

/** Місце треку в ефірі: коло, номер у колі й мить початку. */
export interface Slot {
  cycle: number;
  index: number;
  track: RadioTrack;
  start: number;
}

/** Що звучить: `track` — null у паузі між треками; `offset` — секунда треку. */
export interface OnAir {
  track: RadioTrack | null;
  offset: number;
}

const CHUNK_SAMPLES = RADIO.chunkFrames * RADIO.frameSamples;

export const chunkKey = (ref: ChunkRef): string => `${ref.track.id}/${ref.chunk}`;

export const trackSamples = (track: RadioTrack): number => track.frames * RADIO.frameSamples;

export const trackSeconds = (track: RadioTrack): number => trackSamples(track) / SAMPLE_RATE;

/** Номер шматка, у якому лежить цей семпл треку. */
export const chunkOf = (sample: number): number => Math.floor(sample / CHUNK_SAMPLES);

/** Перший семпл шматка в треку. */
export const chunkStart = (chunk: number): number => chunk * CHUNK_SAMPLES;

/** Семплів у шматку: останній коротший. */
export const chunkSamples = (track: RadioTrack, chunk: number): number => Math.min(CHUNK_SAMPLES, trackSamples(track) - chunkStart(chunk));

/** Тривалість кола станції: усі треки з паузами. */
function cycleSeconds(station: Station): number {
  return station.tracks.reduce((sum, track) => sum + trackSeconds(track) + RADIO.gapSeconds, 0);
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Перемішане коло: той самий результат для тієї самої станції й кола на будь-якому пристрої. */
function shuffled(station: Station, cycle: number): number[] {
  let seed = (hash(station.id) ^ Math.imul(cycle, 0x9e3779b1)) >>> 0;
  const random = (): number => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const order = station.tracks.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

/** Порядок кола. Останній трек минулого кола не повторюється першим; для двох треків коло стале, інакше повтору не уникнути. */
function cycleOrder(station: Station, cycle: number): number[] {
  const count = station.tracks.length;
  if (count < 3) return station.tracks.map((_, i) => i);
  const order = shuffled(station, cycle);
  if (order[0] === shuffled(station, cycle - 1)[count - 1]) [order[0], order[1]] = [order[1]!, order[0]!];
  return order;
}

/** Останній порахований порядок кола кожної станції: коло триває годинами. */
const lastOrder = new Map<Station, { cycle: number; order: number[] }>();

function orderOf(station: Station, cycle: number): number[] {
  const known = lastOrder.get(station);
  if (known?.cycle === cycle) return known.order;
  const order = cycleOrder(station, cycle);
  lastOrder.set(station, { cycle, order });
  return order;
}

function slot(station: Station, cycle: number, index: number, start: number): Slot {
  return { cycle, index, track: station.tracks[orderOf(station, cycle)[index]!]!, start };
}

/** Трек, що йде за цим. */
export function nextSlot(station: Station, current: Slot): Slot {
  const start = current.start + trackSeconds(current.track) + RADIO.gapSeconds;
  return current.index + 1 < station.tracks.length ? slot(station, current.cycle, current.index + 1, start) : slot(station, current.cycle + 1, 0, start);
}

/** Трек, що грає в цю мить; у паузі між треками — той, що почнеться наступним (`start` тоді пізніше за `now`). */
export function slotAt(station: Station, now: number): Slot {
  const cycle = Math.floor(now / cycleSeconds(station));
  let current = slot(station, cycle, 0, cycle * cycleSeconds(station));
  while (now >= current.start + trackSeconds(current.track)) current = nextSlot(station, current);
  return current;
}

export function onAir(station: Station, now: number): OnAir {
  const current = slotAt(station, now);
  return now < current.start ? { track: null, offset: 0 } : { track: current.track, offset: now - current.start };
}

/** Шматки ефіру на `seconds` наперед, за порядком. */
export function chunksAhead(station: Station, from: number, seconds: number): ChunkRef[] {
  const refs: ChunkRef[] = [];
  let current = slotAt(station, from);
  let chunk = chunkOf(Math.max(0, from - current.start) * SAMPLE_RATE);
  while (current.start + chunkStart(chunk) / SAMPLE_RATE < from + seconds) {
    refs.push({ track: current.track, chunk });
    chunk++;
    if (chunkStart(chunk) >= trackSamples(current.track)) {
      current = nextSlot(station, current);
      chunk = 0;
    }
  }
  return refs;
}
