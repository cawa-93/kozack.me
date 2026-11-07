// Пошук і завантаження оригіналів звуків (§2.1, §11.4а) з джерел, що дозволяють автоматичний доступ. Лише дозволене їхнім
// robots.txt: Wikimedia Commons — сторінки `/wiki/` (не `/w/` і не `/api/`) і файли upload.wikimedia.org; Internet Archive —
// пошук, метадані й завантаження. Freesound, OpenGameArt, BigSoundBank (`/UPLOAD/`) ботам закриті: туди не ходимо.
//
//   node scripts/audio/find.ts commons-cat "Sounds of cats"          аудіо й підкатегорії категорії (лише перша сторінка)
//   node scripts/audio/find.ts commons-info "File:Meow.ogg"          ліцензія, автор, опис, тривалість
//   node scripts/audio/find.ts commons "File:Meow.ogg" cats meow     завантажити в sfx-library/cats/ і записати оригінал «meow»
//   node scripts/audio/find.ts ia-search "cat meow"                  предмети Internet Archive з ліцензіями CC0/PD/CC-BY
//   node scripts/audio/find.ts ia-files <identifier>                 ліцензія й аудіофайли предмета
//   node scripts/audio/find.ts ia <identifier> <файл> cats meow      завантажити й записати оригінал
//
// Записує лише `originals` у `audio/sfx/<група>/sources.json`; рецепти (`files`) — руками.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { LICENSES, type License, type Original, type Sources } from "../../src/audio/sfx/sourcetypes.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const UA = "kotoklopit-audio/1.0 (https://kozack.me; game sound research)";
const AUDIO = /\.(ogg|oga|wav|flac|mp3|opus|m4a|aif|aiff)$/i;
/** Пауза між запитами до одного сайту, мс: ввічливо й у межах їхніх правил. */
const PAUSE_MS = 1000;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
let lastRequest = 0;

async function get(url: string): Promise<Response> {
  const pause = lastRequest + PAUSE_MS - Date.now();
  if (pause > 0) await wait(pause);
  for (let attempt = 0; ; attempt++) {
    lastRequest = Date.now();
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA } });
      if (response.ok || response.status === 404 || attempt >= 2) return response;
    } catch (error) {
      if (attempt >= 2) throw error;
    }
    await wait(3000);
  }
}

const text = (html: string): string =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/** Ліцензія за адресою чи короткою назвою; не з дозволених — null. */
export function licenseOf(url: string, short = ""): License | null {
  if (/publicdomain\/zero\/1\.0/.test(url) || /^CC0/i.test(short)) return "CC0-1.0";
  if (/publicdomain\/mark/.test(url) || /^public domain$/i.test(short.trim())) return "PD";
  const by = /creativecommons\.org\/licenses\/by\/(2\.0|2\.5|3\.0|4\.0)/.exec(url);
  if (by) return `CC-BY-${by[1]}` as License;
  return null;
}

async function commonsPage(name: string): Promise<string> {
  const title = name.startsWith("File:") ? name : `File:${name}`;
  const response = await get(`https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`);
  if (!response.ok) throw new Error(`${response.status}: ${title}`);
  return response.text();
}

interface CommonsInfo {
  title: string;
  page: string;
  original: string;
  licenses: { short: string; url: string }[];
  license: License | null;
  author: string;
  description: string;
  length: string;
}

async function commonsInfo(name: string): Promise<CommonsInfo> {
  const html = await commonsPage(name);
  const title = (name.startsWith("File:") ? name : `File:${name}`).replace(/ /g, "_");
  const licenses = [...html.matchAll(/licensetpl&#95;link" style="display:none;">([^<]*)<\/span><span class="licensetpl&#95;short" style="display:none;">([^<]*)</g)].map((m) => ({ url: m[1]!, short: m[2]!.trim() }));
  // Кілька ліцензій на вибір (подвійне ліцензування) — беремо першу з дозволених.
  const license = licenses.map((l) => licenseOf(l.url, l.short)).find((l) => l !== null) ?? null;
  const field = (id: string): string => text(new RegExp(`id="fileinfotpl&#95;${id}"[^>]*>[\\s\\S]*?</td>\\s*<td[^>]*>([\\s\\S]*?)</td>`).exec(html)?.[1] ?? "");
  const original = /href="(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/[^"?]+)/.exec(html)?.[1] ?? "";
  return {
    title,
    page: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title).replace(/%3A/g, ":")}`,
    original,
    licenses,
    license,
    author: field("aut").slice(0, 200),
    description: field("desc").slice(0, 400),
    length: /length ([^,<]+)/.exec(html)?.[1] ?? "",
  };
}

async function commonsCategory(category: string): Promise<void> {
  const name = category.replace(/^Category:/, "").replace(/ /g, "_");
  const response = await get(`https://commons.wikimedia.org/wiki/Category:${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error(`${response.status}: Category:${name}`);
  const html = await response.text();
  const sub = html.split('id="mw-subcategories"')[1]?.split('id="mw-pages"')[0]?.split('id="mw-category-media"')[0] ?? "";
  const subcats = [...new Set([...sub.matchAll(/href="\/wiki\/Category:([^"#?]+)"/g)].map((m) => decodeURIComponent(m[1]!)))];
  const media = html.split('id="mw-category-media"')[1] ?? "";
  const files = [...new Set([...media.matchAll(/href="\/wiki\/File:([^"#?]+)"/g)].map((m) => decodeURIComponent(m[1]!)).filter((f) => AUDIO.test(f)))];
  console.log(`Підкатегорії (${subcats.length}):\n${subcats.map((s) => `  ${s}`).join("\n")}`);
  console.log(`Аудіо (${files.length}${/filefrom=/.test(media) ? ", є ще сторінки — їх robots.txt не дозволяє, шукайте вужчу категорію" : ""}):\n${files.map((f) => `  File:${f}`).join("\n")}`);
}

const sha256 = (data: Buffer): string => createHash("sha256").update(data).digest("hex");

function remember(group: string, key: string, original: Original): void {
  const file = path.join(ROOT, "audio/sfx", group, "sources.json");
  mkdirSync(path.dirname(file), { recursive: true });
  const sources: Sources = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Sources) : { originals: {}, files: {} };
  sources.originals[key] = original;
  writeFileSync(file, `${JSON.stringify(sources, null, 2)}\n`);
  console.log(`Записано оригінал «${key}» у audio/sfx/${group}/sources.json`);
}

async function download(url: string, group: string, folder: string, name: string): Promise<{ file: string; sha256: string }> {
  const response = await get(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const relative = `${folder}/${name.replace(/[^\p{L}\p{N}._()-]+/gu, "_")}`;
  const target = path.join(ROOT, "sfx-library", group, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  console.log(`Завантажено ${(bytes.length / 1024).toFixed(0)} КБ → sfx-library/${group}/${relative}`);
  return { file: relative, sha256: sha256(bytes) };
}

async function iaMetadata(id: string): Promise<{ metadata: Record<string, unknown>; files: { name: string; format?: string; length?: string; size?: string }[] }> {
  const response = await get(`https://archive.org/metadata/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error(`${response.status}: ${id}`);
  return (await response.json()) as { metadata: Record<string, unknown>; files: { name: string; format?: string; length?: string; size?: string }[] };
}

const first = (value: unknown): string => (Array.isArray(value) ? String(value[0] ?? "") : typeof value === "string" ? value : "");

const [command, ...args] = process.argv.slice(2);
switch (command) {
  case "commons-cat":
    await commonsCategory(args[0] ?? "");
    break;
  case "commons-info": {
    console.log(JSON.stringify(await commonsInfo(args[0] ?? ""), null, 2));
    break;
  }
  case "commons": {
    const [name, group, key] = args;
    if (!name || !group || !key) throw new Error("commons <File:…> <група> <ключ>");
    const info = await commonsInfo(name);
    if (!info.license) throw new Error(`Ліцензія не з дозволених (${LICENSES.join(", ")}): ${JSON.stringify(info.licenses)}`);
    if (!info.original) throw new Error("Не знайшов посилання на оригінал");
    const saved = await download(info.original, group, "commons", decodeURIComponent(info.original.split("/").at(-1)!));
    const licenseUrl = info.licenses.find((l) => licenseOf(l.url, l.short) === info.license)?.url ?? "";
    remember(group, key, { file: saved.file, url: info.page, title: info.title.replace(/^File:/, "").replace(/_/g, " ").replace(AUDIO, ""), author: info.author || "невідомо — перевірити", license: info.license, licenseUrl, sha256: saved.sha256 });
    console.log(`${info.license}; автор: ${info.author}; ${info.length}; ${info.description}`);
    break;
  }
  case "ia-search": {
    const query = `(${args.join(" ")}) AND mediatype:audio AND (licenseurl:*publicdomain* OR licenseurl:*licenses/by/*)`;
    const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=licenseurl&rows=60&output=json`;
    const response = await get(url);
    const found = ((await response.json()) as { response: { docs: Record<string, unknown>[] } }).response.docs;
    for (const doc of found) {
      const license = licenseOf(first(doc["licenseurl"]));
      if (license) console.log(`${first(doc["identifier"])} · ${license} · ${first(doc["creator"])} · ${first(doc["title"])}`);
    }
    break;
  }
  case "ia-files": {
    const { metadata, files } = await iaMetadata(args[0] ?? "");
    console.log(`${first(metadata["title"])} · ${first(metadata["creator"])} · ${first(metadata["licenseurl"])} → ${licenseOf(first(metadata["licenseurl"])) ?? "НЕ ГОДИТЬСЯ"}`);
    for (const file of files) if (AUDIO.test(file.name)) console.log(`  ${file.name} · ${file.length ?? "?"} с · ${file.size ?? "?"} Б`);
    break;
  }
  case "ia": {
    const [id, name, group, key] = args;
    if (!id || !name || !group || !key) throw new Error("ia <identifier> <файл> <група> <ключ>");
    const { metadata } = await iaMetadata(id);
    const licenseUrl = first(metadata["licenseurl"]);
    const license = licenseOf(licenseUrl);
    if (!license) throw new Error(`Ліцензія не з дозволених: ${licenseUrl || "не вказана"}`);
    const saved = await download(`https://archive.org/download/${encodeURIComponent(id)}/${name.split("/").map(encodeURIComponent).join("/")}`, group, `archive/${id}`, name.split("/").at(-1)!);
    remember(group, key, { file: saved.file, url: `https://archive.org/details/${id}`, title: `${first(metadata["title"])} — ${name}`, author: first(metadata["creator"]) || "невідомо — перевірити", license, licenseUrl, sha256: saved.sha256 });
    break;
  }
  default:
    console.log("Команди: commons-cat, commons-info, commons, ia-search, ia-files, ia (див. початок файлу)");
}
