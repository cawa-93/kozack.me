// Каталог кандидатів для радіо (§2.1, §8.10): заміряє файли з `audio-library/<джерело>/` і дописує нові в `audio/catalog.json`.
// Оригінали лежать поза git, тож у каталозі — усе, щоб їх знайти чи завантажити знову. Нове джерело спершу описати в `sources`:
// ліцензія з'являється лише звідти, а файл із невідомої теки — помилка, а не трек без ліцензії.
//
//   npm run audio:catalog -w games/kotoklopit

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const ROOT = path.resolve(import.meta.dirname, "../..");
const LIBRARY = path.join(ROOT, "audio-library");
const CATALOG = path.join(ROOT, "audio/catalog.json");
const AUDIO_FILE = /\.(mp3|ogg|wav|flac|m4a)$/i;
/** Коротше за це трек на станції звучить не треком, а вставкою, тож групувати його треба окремо. */
const STINGER_SECONDS = 15;
const SHORT_SECONDS = 45;
/** Заміри впираються в декодування, а не в диск. */
const WORKERS = 6;

const exec = promisify(execFile);

interface Source {
  name: string;
  license: string;
}

interface Track {
  id: string;
  title: string;
  artist: string;
  source: string;
  file: string;
  license: string;
  categories: string[];
  kind?: string;
  durationSec?: number;
  bpm?: number;
  key?: string;
  album?: string;
  genre?: string;
  year?: string;
  comment?: string;
  bitrateKbps?: number;
  sampleRate?: number;
  channels?: number;
  loudnessLufs?: number;
  loudnessRange?: number;
  truePeakDb?: number;
  sizeBytes?: number;
  sha256?: string;
  contentIdCheck: string;
  evidence?: string;
  confidence?: string;
  note?: string;
}

interface Catalog {
  about: string;
  sources: Record<string, Source>;
  tracks: Track[];
  pending: unknown[];
  rejected: unknown[];
}

interface Probe {
  format?: { duration?: string; bit_rate?: string; tags?: Record<string, string> };
  streams?: { sample_rate?: string; channels?: number }[];
}

const run = (command: string, args: string[]): Promise<{ stdout: string; stderr: string }> => exec(command, args, { encoding: "utf8", maxBuffer: 1 << 26 });

function audioFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return audioFiles(full);
    return AUDIO_FILE.test(entry.name) ? [full] : [];
  });
}

const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");

/** Теги в різних файлах пишуть різним регістром. */
function tag(tags: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(tags).find((k) => k.toLowerCase() === name);
  const value = key === undefined ? undefined : tags[key]?.trim();
  return value ? value : undefined;
}

/** Числа зі зведення фільтра ebur128: воно в кінці stderr. */
async function loudness(file: string): Promise<Pick<Track, "loudnessLufs" | "loudnessRange" | "truePeakDb">> {
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-filter_complex", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"]);
  const summary = stderr.slice(stderr.lastIndexOf("Summary:"));
  const number = (pattern: RegExp): number | undefined => {
    const match = pattern.exec(summary)?.[1];
    return match === undefined ? undefined : Number(match);
  };
  const lufs = number(/I:\s+(-?[\d.]+) LUFS/);
  const range = number(/LRA:\s+(-?[\d.]+) LU/);
  const peak = number(/Peak:\s+(-?[\d.]+) dBFS/);
  return { ...(lufs === undefined ? {} : { loudnessLufs: lufs }), ...(range === undefined ? {} : { loudnessRange: range }), ...(peak === undefined ? {} : { truePeakDb: peak }) };
}

async function measure(track: Track, file: string): Promise<void> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration,bit_rate:format_tags:stream=sample_rate,channels", "-of", "json", file]);
  const probe = JSON.parse(stdout) as Probe;
  const tags = probe.format?.tags ?? {};
  const stream = probe.streams?.[0];
  const duration = Number(probe.format?.duration ?? 0);
  const album = tag(tags, "album");
  const genre = tag(tags, "genre");
  const year = tag(tags, "date");
  const comment = tag(tags, "comment");
  Object.assign(track, {
    kind: duration < STINGER_SECONDS ? "стінгер" : duration < SHORT_SECONDS ? "короткий" : "трек",
    durationSec: Math.round(duration * 10) / 10,
    ...(album ? { album } : {}),
    ...(genre ? { genre } : {}),
    ...(year ? { year } : {}),
    ...(comment ? { comment } : {}),
    bitrateKbps: Math.round(Number(probe.format?.bit_rate ?? 0) / 1000),
    sampleRate: Number(stream?.sample_rate ?? 0),
    channels: stream?.channels ?? 0,
    ...(await loudness(file)),
    sizeBytes: statSync(file).size,
    sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
  });
}

async function newTrack(catalog: Catalog, relative: string, file: string): Promise<Track> {
  const sourceId = relative.split("/")[0] ?? "";
  const source = catalog.sources[sourceId];
  if (!source) throw new Error(`Джерело «${sourceId}» не описане в sources: ${relative}`);
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format_tags", "-of", "json", file]);
  const tags = (JSON.parse(stdout) as Probe).format?.tags ?? {};
  const title = tag(tags, "title") ?? path.basename(file).replace(AUDIO_FILE, "");
  const artist = tag(tags, "artist") ?? source.name;
  return { id: `${sourceId}/${slug(artist)}-${slug(title)}`, title, artist, source: sourceId, file: relative, license: source.license, categories: [], contentIdCheck: "не перевірено" };
}

const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as Catalog;
const known = new Map(catalog.tracks.map((track) => [track.file, track]));
const queue: { track: Track; file: string }[] = [];
for (const file of audioFiles(LIBRARY)) {
  const relative = path.relative(LIBRARY, file).split(path.sep).join("/");
  let track = known.get(relative);
  if (!track) {
    track = await newTrack(catalog, relative, file);
    catalog.tracks.push(track);
  }
  if (track.sha256 === undefined) queue.push({ track, file });
}
await Promise.all(
  Array.from({ length: WORKERS }, async () => {
    for (let item = queue.pop(); item; item = queue.pop()) await measure(item.track, item.file);
  }),
);
catalog.tracks.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(CATALOG, `${JSON.stringify(catalog, null, 2)}\n`);

for (const [source, { name }] of Object.entries(catalog.sources)) {
  const tracks = catalog.tracks.filter((track) => track.source === source);
  const minutes = tracks.reduce((sum, track) => sum + (track.durationSec ?? 0), 0) / 60;
  console.log(`${name}: ${tracks.length} треків, ${Math.round(minutes)} хв`);
}
