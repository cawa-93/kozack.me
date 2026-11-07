// Станції з `playlist.json`, який пише `scripts/audio/encode.ts`, і адреси шматків.

import data from "./playlist.json";
import type { ChunkRef, RadioTrack, Station } from "./schedule";

interface Playlist {
  /** Адреса хостингу шматків (`scripts/audio/publish.ts`); null — тека `radio/` самої гри. */
  base?: string | null;
  tracks: Record<string, Omit<RadioTrack, "id">>;
  stations: { id: string; frequency: string; tracks: string[] }[];
}

const playlist: Playlist = data;

/** Звідки брати шматки: хостинг зі списку чи, поки його немає, кілька тимчасових треків у `public/radio/` самої гри. */
const CHUNKS_URL = playlist.base ?? `${import.meta.env.BASE_URL}radio/`;

export const STATIONS: readonly Station[] = playlist.stations.map((station) => ({
  id: station.id,
  frequency: station.frequency,
  tracks: station.tracks.map((id) => ({ id, ...playlist.tracks[id]! })),
}));

export const chunkUrl = ({ track, chunk }: ChunkRef): string => `${CHUNKS_URL}${track.id}/${chunk}.mp3`;
