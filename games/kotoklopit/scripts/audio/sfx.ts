// Кодує звуки гри (§11.4а) за рецептами `audio/sfx/<група>/sources.json`: вирізає шматок оригіналу з `sfx-library/<група>/`,
// вирівнює рівень, петлі замикає в коло, кодує моно MP3 і пише `encoded.json` поруч. Формат рецепта — `SOUND_PLAN.md`, «Ефекти».
//
//   npm run audio:sfx -w games/kotoklopit                 усі групи; незмінене не перекодовується
//   npm run audio:sfx -w games/kotoklopit -- cats ui      лише ці групи
//   --force                                               перекодувати все вибране
//
// Петля: кінець переходить у початок (`SFX.loopCrossfade`), а на краях файлу — запас по колу (`SFX.loopPad`). Декодер MP3 зсуває
// початок по-різному (без тегу LAME — ніхто не обрізає), але зсув менший за запас, тож відрізок `loop` — завжди повне коло.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { SAMPLE_RATE, SFX } from "../../src/audio/config.ts";
import { LICENSES, type Recipe, type Sources } from "../../src/audio/sfx/sourcetypes.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SOUNDS = path.join(ROOT, "audio/sfx");
const LIBRARY = path.join(ROOT, "sfx-library");
/** Межа всіх звуків разом, байт: вони в git і вантажаться гравцем на старті. */
const BUDGET = 6 * 1024 * 1024;
/** Версія обробки: змінилась — перекодувати все. */
const VERSION = 1;

interface Encoded {
  hash: string;
  seconds: number;
  loop?: { start: number; end: number };
}

const { values, positionals } = parseArgs({ options: { force: { type: "boolean" } }, allowPositionals: true });

function run(command: string, args: string[], input?: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`${command} ${code}: ${Buffer.concat(err).toString().slice(-600)}`))));
    child.stdin.end(input ?? Buffer.alloc(0));
  });
}

const sha256 = (data: Buffer | string): string => createHash("sha256").update(data).digest("hex");

async function decode(file: string, recipe: Recipe): Promise<Float32Array> {
  const args = ["-v", "error", "-i", file];
  if (recipe.start !== undefined) args.push("-ss", String(recipe.start));
  if (recipe.end !== undefined) args.push("-to", String(recipe.end));
  if (recipe.filter) args.push("-af", recipe.filter);
  args.push("-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "f32le", "pipe:1");
  const bytes = await run("ffmpeg", args);
  return new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 4)).slice();
}

const db = (level: number): number => 10 ** (level / 20);

function peak(data: Float32Array): number {
  let max = 0;
  for (const sample of data) max = Math.max(max, Math.abs(sample));
  return max;
}

function rms(data: Float32Array): number {
  let sum = 0;
  for (const sample of data) sum += sample * sample;
  return Math.sqrt(sum / Math.max(1, data.length));
}

function scale(data: Float32Array, factor: number): void {
  for (let i = 0; i < data.length; i++) data[i]! *= factor;
}

/** Разовий звук: плавні краї й пік на `level`. */
function oneShot(data: Float32Array, recipe: Recipe): Float32Array {
  const fadeIn = Math.round((recipe.fadeIn ?? 0.003) * SAMPLE_RATE);
  const fadeOut = Math.round((recipe.fadeOut ?? 0.02) * SAMPLE_RATE);
  for (let i = 0; i < Math.min(fadeIn, data.length); i++) data[i]! *= i / fadeIn;
  for (let i = 0; i < Math.min(fadeOut, data.length); i++) data[data.length - 1 - i]! *= i / fadeOut;
  const top = peak(data);
  if (top > 0) scale(data, db(recipe.level ?? -1) / top);
  return data;
}

/** Петля: кінець плавно переходить у початок; гучність за RMS. Повертає файл із запасом по колу й межі кола. */
function loop(data: Float32Array, recipe: Recipe): { samples: Float32Array; start: number; length: number } {
  const fade = Math.min(Math.round(SFX.loopCrossfade * SAMPLE_RATE), Math.floor(data.length / 4));
  const length = data.length - fade;
  const body = data.slice(0, length);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    body[i] = data[i]! * Math.sin((t * Math.PI) / 2) + data[length + i]! * Math.cos((t * Math.PI) / 2);
  }
  const level = rms(body);
  if (level > 0) scale(body, db(recipe.level ?? -20) / level);
  const top = peak(body);
  if (top > db(-1)) scale(body, db(-1) / top);
  const pad = Math.min(Math.round(SFX.loopPad * SAMPLE_RATE), length);
  const samples = new Float32Array(length + pad * 2);
  samples.set(body.subarray(length - pad), 0);
  samples.set(body, pad);
  samples.set(body.subarray(0, pad), pad + length);
  return { samples, start: pad, length };
}

async function encode(samples: Float32Array, out: string): Promise<void> {
  const input = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  await run("ffmpeg", ["-v", "error", "-y", "-f", "f32le", "-ar", String(SAMPLE_RATE), "-ac", "1", "-i", "pipe:0", "-c:a", "libmp3lame", "-b:a", `${SFX.bitrate}k`, "-reservoir", "0", "-write_xing", "0", "-id3v2_version", "0", "-map_metadata", "-1", out], input);
}

function readSources(group: string): Sources {
  return JSON.parse(readFileSync(path.join(SOUNDS, group, "sources.json"), "utf8")) as Sources;
}

function check(group: string, sources: Sources): void {
  for (const [key, original] of Object.entries(sources.originals)) {
    if (!LICENSES.includes(original.license)) throw new Error(`${group}/${key}: ліцензія ${original.license} не годиться (§2.1)`);
    for (const field of ["file", "url", "title", "author", "licenseUrl", "sha256"] as const) if (!original[field]) throw new Error(`${group}/${key}: немає ${field}`);
  }
  for (const [name, recipe] of Object.entries(sources.files)) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) throw new Error(`${group}/${name}: назва — латиниця, цифри й дефіси`);
    if (!sources.originals[recipe.from]) throw new Error(`${group}/${name}: немає оригіналу «${recipe.from}»`);
  }
}

async function encodeGroup(group: string): Promise<void> {
  const dir = path.join(SOUNDS, group);
  const sources = readSources(group);
  check(group, sources);
  const encodedPath = path.join(dir, "encoded.json");
  const before: Record<string, Encoded> = existsSync(encodedPath) ? (JSON.parse(readFileSync(encodedPath, "utf8")) as Record<string, Encoded>) : {};
  const after: Record<string, Encoded> = {};
  let made = 0;
  for (const [name, recipe] of Object.entries(sources.files)) {
    const original = sources.originals[recipe.from]!;
    const hash = sha256(JSON.stringify({ VERSION, bitrate: SFX.bitrate, pad: SFX.loopPad, crossfade: SFX.loopCrossfade, recipe, original: original.sha256 })).slice(0, 16);
    const out = path.join(dir, `${name}.mp3`);
    const old = before[name];
    if (!values.force && old?.hash === hash && existsSync(out)) {
      after[name] = old;
      continue;
    }
    const file = path.join(LIBRARY, group, original.file);
    if (!existsSync(file)) throw new Error(`${group}/${name}: немає оригіналу ${path.relative(ROOT, file)}`);
    if (sha256(readFileSync(file)) !== original.sha256) throw new Error(`${group}/${name}: оригінал ${original.file} змінився (sha256)`);
    const data = await decode(file, recipe);
    if (data.length < SAMPLE_RATE * 0.02) throw new Error(`${group}/${name}: відрізок порожній`);
    if (recipe.loop) {
      const { samples, start, length } = loop(data, recipe);
      await encode(samples, out);
      after[name] = { hash, seconds: round(length / SAMPLE_RATE), loop: { start: round(start / SAMPLE_RATE), end: round((start + length) / SAMPLE_RATE) } };
    } else {
      const samples = oneShot(data, recipe);
      await encode(samples, out);
      after[name] = { hash, seconds: round(samples.length / SAMPLE_RATE) };
    }
    made++;
  }
  // Файли, яких більше немає в рецептах, прибираємо: у теці лише те, що описано.
  for (const entry of readdirSync(dir)) if (entry.endsWith(".mp3") && !after[entry.slice(0, -4)]) rmSync(path.join(dir, entry));
  writeFileSync(encodedPath, `${JSON.stringify(after, null, 2)}\n`);
  const bytes = Object.keys(after).reduce((sum, name) => sum + statSync(path.join(dir, `${name}.mp3`)).size, 0);
  const seconds = Object.values(after).reduce((sum, file) => sum + file.seconds, 0);
  console.log(`${group}: ${Object.keys(after).length} файлів (${made} нових), ${(bytes / 1024).toFixed(0)} КБ, ${seconds.toFixed(1)} с`);
}

const round = (value: number): number => Math.round(value * 1e6) / 1e6;

function groups(): string[] {
  return readdirSync(SOUNDS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(SOUNDS, entry.name, "sources.json")))
    .map((entry) => entry.name);
}

{
  const all = existsSync(SOUNDS) ? groups() : [];
  const chosen = positionals.length > 0 ? positionals : all;
  for (const group of chosen) {
    if (!all.includes(group)) throw new Error(`Немає групи ${group} (audio/sfx/${group}/sources.json)`);
    await encodeGroup(group);
  }
  let total = 0;
  for (const group of all) for (const entry of readdirSync(path.join(SOUNDS, group))) if (entry.endsWith(".mp3")) total += statSync(path.join(SOUNDS, group, entry)).size;
  console.log(`Разом: ${(total / 1024).toFixed(0)} КБ з ${(BUDGET / 1024).toFixed(0)} КБ`);
  if (total > BUDGET) throw new Error("Звуки не вміщаються в межу: коротші відрізки чи менше варіантів");
}
