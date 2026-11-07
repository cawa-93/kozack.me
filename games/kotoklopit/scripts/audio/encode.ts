// Готує музику радіо (§8.10): треки станцій із `audio/catalog.json` вирівнює за гучністю, кодує й ріже на файли-шматки, а список
// пише в `src/audio/radio/playlist.json`. Чому формат саме такий — `SOUND_PLAN.md`, «Як працює радіо».
//
//   npm run audio:encode -w games/kotoklopit -- --sample   два найкоротші треки кожної станції в `public/radio/` (перевірка)
//   npm run audio:encode -w games/kotoklopit -- --out <тека>   усі треки: тека для хостингу, поза git
//
// Готовий трек не кодується вдруге: тека треку вже є.

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { promisify } from "node:util";

import { RADIO, SAMPLE_RATE } from "../../src/audio/config.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const LIBRARY = path.join(ROOT, "audio-library");
const CATALOG = path.join(ROOT, "audio/catalog.json");
const PLAYLIST = path.join(ROOT, "src/audio/radio/playlist.json");
/** Цільова гучність: станції не мають стрибати одна відносно одної. */
const TARGET_LUFS = -16;
const WORKERS = 6;

const exec = promisify(execFile);

interface CatalogTrack {
  title: string;
  artist: string;
  file: string;
  durationSec: number;
  loudnessLufs: number;
  sha256: string;
  stations: string[];
}

interface Catalog {
  stations: { id: string; frequency: string }[];
  tracks: CatalogTrack[];
}

const { values } = parseArgs({ options: { sample: { type: "boolean" }, out: { type: "string" }, bitrate: { type: "string" } } });
const bitrate = Number(values.bitrate ?? 96);
const out = values.out ? path.resolve(values.out) : path.join(ROOT, "public/radio");
if (!values.sample && !values.out) throw new Error("Вкажіть --sample чи --out <тека>");

/** Байтів у кадрі: на 48 кГц ціле число без бітів вирівнювання, тож кадри лежать рівною сіткою. */
const frameBytes = (144 * bitrate * 1000) / SAMPLE_RATE;
if (!Number.isInteger(frameBytes)) throw new Error(`Бітрейт ${bitrate} не дає рівної сітки кадрів`);

async function encode(track: CatalogTrack): Promise<Buffer> {
  // Лінійне підсилення за заміром каталогу не чіпає динаміку треку, а обмежувач ловить піки тихих треків.
  const gain = TARGET_LUFS - track.loudnessLufs;
  const { stdout } = await exec(
    "ffmpeg",
    ["-v", "error", "-i", path.join(LIBRARY, track.file), "-map_metadata", "-1", "-vn", "-af", `volume=${gain.toFixed(2)}dB,alimiter=limit=0.89:level=false`, "-ar", String(SAMPLE_RATE), "-ac", "2", "-c:a", "libmp3lame", "-b:a", `${bitrate}k`, "-abr", "0", "-reservoir", "0", "-write_xing", "0", "-id3v2_version", "0", "-f", "mp3", "-"],
    { encoding: "buffer", maxBuffer: 1 << 28 },
  );
  return stdout;
}

/** Шматки на диск; повертає кількість кадрів треку. */
function cut(mp3: Buffer, dir: string): number {
  if (mp3.length % frameBytes !== 0) throw new Error(`${dir}: довжина не ділиться на кадр`);
  const frames = mp3.length / frameBytes;
  for (let i = 0; i < frames; i++) {
    const at = i * frameBytes;
    if (mp3[at] !== 0xff || (mp3[at + 1]! & 0xe0) !== 0xe0) throw new Error(`${dir}: кадр ${i} не на сітці`);
  }
  mkdirSync(dir, { recursive: true });
  for (let chunk = 0; chunk * RADIO.chunkFrames < frames; chunk++) {
    const from = Math.max(0, chunk * RADIO.chunkFrames - RADIO.preFrames);
    const to = Math.min(frames, (chunk + 1) * RADIO.chunkFrames + RADIO.postFrames);
    writeFileSync(path.join(dir, `${chunk}.mp3`), mp3.subarray(from * frameBytes, to * frameBytes));
  }
  return frames;
}

const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as Catalog;
const known = existsSync(PLAYLIST) ? (JSON.parse(readFileSync(PLAYLIST, "utf8")) as { tracks: Record<string, { frames: number }> }).tracks : {};

/** Хеш оригіналу й бітрейт у назві теки: заміна треку чи якості не підсуне незмінний кеш браузера. */
const trackId = (track: CatalogTrack): string => `${track.sha256.slice(0, 12)}-${bitrate}`;

const members = (station: string): CatalogTrack[] => {
  const tracks = catalog.tracks.filter((track) => track.stations.includes(station));
  return values.sample ? tracks.sort((a, b) => a.durationSec - b.durationSec).slice(0, 2) : tracks;
};

const chosen = new Map(catalog.stations.flatMap(({ id }) => members(id)).map((track) => [trackId(track), track]));
const frames = new Map<string, number>();
const queue = [...chosen.entries()];
await Promise.all(
  Array.from({ length: WORKERS }, async () => {
    for (let item = queue.pop(); item; item = queue.pop()) {
      const [id, track] = item;
      const dir = path.join(out, id);
      const ready = known[id]?.frames;
      if (ready !== undefined && existsSync(dir)) frames.set(id, ready);
      else frames.set(id, cut(await encode(track), dir));
    }
  }),
);

const tracks = Object.fromEntries([...chosen].map(([id, track]) => [id, { artist: track.artist, title: track.title, frames: frames.get(id)! }]));
const stations = catalog.stations.map(({ id, frequency }) => ({ id, frequency, tracks: members(id).map(trackId) }));
writeFileSync(PLAYLIST, `${JSON.stringify({ tracks, stations }, null, 2)}\n`);
// Шматки незмінні, а гра бере їх з іншого домену.
if (values.out) writeFileSync(path.join(out, "_headers"), "/*\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=31536000, immutable\n");
console.log(`Станцій ${stations.length}, треків ${chosen.size}, ${bitrate} кбіт/с → ${out}`);
