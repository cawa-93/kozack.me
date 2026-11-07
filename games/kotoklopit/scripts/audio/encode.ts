// Готує музику радіо (§8.10): треки станцій із `audio/catalog.json` обрізає від тиші по краях, вирівнює за гучністю, кодує й ріже
// на файли-шматки. Чому формат саме такий — `SOUND_PLAN.md`, «Як працює радіо».
//
//   npm run audio:encode -w games/kotoklopit                         усе для хостингу: cloudflare-music/public/music/ і cloudflare-music/playlist.json
//   npm run audio:encode -w games/kotoklopit -- --sample             два найкоротші треки станції в public/radio/ (перевірка в грі)
//   --bitrate 48 --channels 1                                        профіль кодування (типово — моно, 48 кбіт/с)
//
// Готовий трек не кодується вдруге: тека треку вже є. Назва теки — хеш оригіналу й профіль, тож шматок ніколи не змінюється.

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs, promisify } from "node:util";

import { RADIO, SAMPLE_RATE } from "../../src/audio/config.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const LIBRARY = path.join(ROOT, "audio-library");
const CATALOG = path.join(ROOT, "audio/catalog.json");
const GAME_PLAYLIST = path.join(ROOT, "src/audio/radio/playlist.json");
/** Цільова гучність: станції не мають стрибати одна відносно одної. */
const LOUDNESS = "I=-16:TP=-1.5:LRA=11";
/** Тиша на краях: не тихий вступ, а справжня порожнеча. */
const SILENCE = "silenceremove=start_periods=1:start_threshold=-60dB:detection=peak";
/** Статичний хостинг Cloudflare приймає до 20 000 файлів на версію; запас — на `_headers` і майбутні треки. */
const FILE_LIMIT = 19_000;
const WORKERS = 6;

const exec = promisify(execFile);

interface CatalogTrack {
  title: string;
  artist: string;
  file: string;
  durationSec: number;
  sha256: string;
  stations: string[];
}

interface Catalog {
  stations: { id: string; frequency: string }[];
  tracks: CatalogTrack[];
}

interface Playlist {
  /** Адреса хостингу шматків; null — тека `radio/` самої гри. */
  base: string | null;
  tracks: Record<string, { artist: string; title: string; frames: number }>;
  stations: { id: string; frequency: string; tracks: string[] }[];
}

const { values } = parseArgs({ options: { sample: { type: "boolean" }, bitrate: { type: "string" }, channels: { type: "string" } } });
const bitrate = Number(values.bitrate ?? 48);
const channels = Number(values.channels ?? 1);
if (channels !== 1 && channels !== 2) throw new Error("--channels: 1 чи 2");
/** Байтів у кадрі MP3 на 48 кГц: ціле число без бітів вирівнювання, тож кадри лежать рівною сіткою. */
const frameBytes = (144 * bitrate * 1000) / SAMPLE_RATE;
if (!Number.isInteger(frameBytes)) throw new Error(`Бітрейт ${bitrate} не дає рівної сітки кадрів`);
const profile = `${channels === 1 ? "m" : "s"}${bitrate}`;

/** Повний набір — для хостингу (`cloudflare-music/`, поза git, крім конфігу й заголовків); зразки — у власну теку гри. */
const full = !values.sample;
const assets = full ? path.join(ROOT, "cloudflare-music/public/music") : path.join(ROOT, "public/radio");
const playlistFile = full ? path.join(ROOT, "cloudflare-music/playlist.json") : GAME_PLAYLIST;

const filters = (): string => `${SILENCE},areverse,${SILENCE},areverse,aformat=channel_layouts=${channels === 1 ? "mono" : "stereo"}`;

/** Перший прохід `loudnorm`: заміри, з якими другий вирівнює лінійно, не чіпаючи динаміки. */
async function measure(file: string): Promise<Record<string, string>> {
  const { stderr } = await exec("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", `${filters()},loudnorm=${LOUDNESS}:print_format=json`, "-f", "null", "-"], { maxBuffer: 1 << 26 });
  return JSON.parse(stderr.slice(stderr.lastIndexOf("{"), stderr.lastIndexOf("}") + 1)) as Record<string, string>;
}

async function encode(track: CatalogTrack): Promise<Buffer> {
  const file = path.join(LIBRARY, track.file);
  const m = await measure(file);
  const loudnorm = `loudnorm=${LOUDNESS}:measured_I=${m["input_i"]}:measured_TP=${m["input_tp"]}:measured_LRA=${m["input_lra"]}:measured_thresh=${m["input_thresh"]}:offset=${m["target_offset"]}:linear=true:print_format=none`;
  const { stdout } = await exec(
    "ffmpeg",
    ["-v", "error", "-i", file, "-map_metadata", "-1", "-vn", "-af", `${filters()},${loudnorm}`, "-ar", String(SAMPLE_RATE), "-ac", String(channels), "-c:a", "libmp3lame", "-b:a", `${bitrate}k`, "-abr", "0", "-reservoir", "0", "-write_xing", "0", "-id3v2_version", "0", "-f", "mp3", "-"],
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
const known = existsSync(playlistFile) ? (JSON.parse(readFileSync(playlistFile, "utf8")) as Playlist).tracks : {};
const trackId = (track: CatalogTrack): string => `${track.sha256.slice(0, 12)}-${profile}`;
const members = (station: string): CatalogTrack[] => {
  const tracks = catalog.tracks.filter((track) => track.stations.includes(station));
  return values.sample ? tracks.sort((a, b) => a.durationSec - b.durationSec).slice(0, 2) : tracks;
};

const chosen = new Map(catalog.stations.flatMap(({ id }) => members(id)).map((track) => [trackId(track), track]));
const frames = new Map<string, number>();
const queue = [...chosen.entries()];
let done = 0;
await Promise.all(
  Array.from({ length: WORKERS }, async () => {
    for (let item = queue.pop(); item; item = queue.pop()) {
      const [id, track] = item;
      const dir = path.join(assets, id);
      const ready = known[id]?.frames;
      frames.set(id, ready !== undefined && existsSync(dir) ? ready : cut(await encode(track), dir));
      if (++done % 25 === 0) console.log(`${done} з ${chosen.size}`);
    }
  }),
);

const playlist: Playlist = {
  base: null,
  tracks: Object.fromEntries([...chosen].map(([id, track]) => [id, { artist: track.artist, title: track.title, frames: frames.get(id)! }])),
  stations: catalog.stations.map(({ id, frequency }) => ({ id, frequency, tracks: members(id).map(trackId) })),
};
writeFileSync(playlistFile, `${JSON.stringify(playlist, null, 2)}\n`);

if (full) {
  const files = [...chosen.keys()].reduce((sum, id) => sum + readdirSync(path.join(assets, id)).length, 0);
  const bytes = [...chosen.keys()].reduce((sum, id) => sum + readdirSync(path.join(assets, id)).reduce((s, f) => s + statSync(path.join(assets, id, f)).size, 0), 0);
  const hours = [...frames.values()].reduce((sum, f) => sum + f, 0) * (RADIO.frameSamples / SAMPLE_RATE) / 3600;
  console.log(`Профіль ${profile}: треків ${chosen.size}, ${hours.toFixed(1)} год, ${(bytes / 1e6).toFixed(0)} МБ, файлів ${files} (середній шматок ${(bytes / files / 1024).toFixed(0)} КБ)`);
  if (files > FILE_LIMIT) throw new Error(`Файлів ${files}: більше за ${FILE_LIMIT}, Cloudflare стільки не прийме`);
} else console.log(`Профіль ${profile}: треків ${chosen.size} → ${assets}`);
