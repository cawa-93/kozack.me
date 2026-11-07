// Що вантажити зараз (§8.10). Чиста функція: станція, що грає, — трохи наперед; решта — лише поки радіо є ціллю дії.

import { RADIO } from "../config";
import { chunkKey, chunksAhead, type ChunkRef, type Station } from "./schedule";

export interface PrefetchState {
  stations: readonly Station[];
  /** Станція, що грає; null — радіо вимкнене. */
  listening: string | null;
  /** Скільки секунд радіо є ціллю дії чи відкрита картка; null — персонаж не біля нього. */
  nearSeconds: number | null;
  now: number;
}

/** Потрібні шматки за пріоритетом, без повторів. */
export function wantedChunks({ stations, listening, nearSeconds, now }: PrefetchState): ChunkRef[] {
  const wanted = new Map<string, ChunkRef>();
  const add = (station: Station, seconds: number): void => {
    for (const ref of chunksAhead(station, now, seconds)) wanted.set(chunkKey(ref), ref);
  };
  const playing = stations.find((station) => station.id === listening);
  if (playing) add(playing, RADIO.lookaheadSeconds);
  if (nearSeconds !== null && nearSeconds <= RADIO.standbyLimitSeconds) {
    for (const station of stations) if (station !== playing) add(station, RADIO.standbySeconds);
  }
  return [...wanted.values()];
}
