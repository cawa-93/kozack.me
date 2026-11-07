// Станції з `playlist.json`, який пише `scripts/audio/encode.ts`, і адреси шматків.

import data from "./playlist.json";
import type { ChunkRef, RadioTrack, Station } from "./schedule";

interface Playlist {
  tracks: Record<string, Omit<RadioTrack, "id">>;
  stations: { id: string; frequency: string; tracks: string[] }[];
}

const playlist: Playlist = data;

/**
 * ТИМЧАСОВО (`SOUND_PLAN.md`, блок 2): кілька треків лежать у `public/radio/` самої гри. Блок 3 перенесе їх на Cloudflare, і
 * тут стане адреса того хостингу. Запит шматка більше ніде не залежить від місця.
 */
const CHUNKS_URL = `${import.meta.env.BASE_URL}radio/`;

export const STATIONS: readonly Station[] = playlist.stations.map((station) => ({
  id: station.id,
  frequency: station.frequency,
  tracks: station.tracks.map((id) => ({ id, ...playlist.tracks[id]! })),
}));

export const chunkUrl = ({ track, chunk }: ChunkRef): string => `${CHUNKS_URL}${track.id}/${chunk}.mp3`;
