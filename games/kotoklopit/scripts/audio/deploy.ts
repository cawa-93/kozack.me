// Публікує музику радіо на статичному хостингу Cloudflare й перемикає на неї гру (§8.10, `audio/SOUND.md`, «Хостинг музики»).
//
//   npm run audio:deploy -w games/kotoklopit
//       перевірити ліміти, вивантажити cloudflare-music/public/, перевірити заголовки шматка й перемкнути гру
//   npm run audio:deploy -w games/kotoklopit -- --url https://kotoklopit-music.<піддомен>.workers.dev
//       лише перевірити й перемкнути гру: вивантаження вже було
//
// Вхід один раз: `npx wrangler@4.152.0 login`. Вивантаження обірвалось — запустити ще раз: довантажаться лише відсутні файли.

import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const ROOT = path.resolve(import.meta.dirname, "../..");
const HOSTING = path.join(ROOT, "cloudflare-music");
const CONFIG = path.join(HOSTING, "wrangler.jsonc");
const MUSIC = path.join(HOSTING, "public/music");
const SOURCE = path.join(HOSTING, "playlist.json");
const GAME_PLAYLIST = path.join(ROOT, "src/audio/radio/playlist.json");
const SAMPLE = path.join(ROOT, "public/radio");
const WRANGLER = "wrangler@4.152.0";
/** Ліміти статичного хостингу Cloudflare на безкоштовному тарифі. */
const LIMITS = { files: 20_000, bytes: 25 * 1024 * 1024 };
/** Звідки гра просить шматки: перевіряємо, що хостинг пускає інший домен. */
const GAME_ORIGIN = "https://kozack.me";

interface Playlist {
  base: string | null;
  tracks: Record<string, unknown>;
}

function checkLimits(): void {
  let files = 0;
  for (const dir of readdirSync(MUSIC)) {
    for (const file of readdirSync(path.join(MUSIC, dir))) {
      files++;
      const size = statSync(path.join(MUSIC, dir, file)).size;
      if (size > LIMITS.bytes) throw new Error(`${dir}/${file}: ${size} байт, більше за ліміт Cloudflare`);
    }
  }
  if (files > LIMITS.files) throw new Error(`Файлів ${files}: більше за ліміт Cloudflare ${LIMITS.files}`);
  console.log(`Ліміти: файлів ${files} з ${LIMITS.files}, кожен менший за 25 МіБ.`);
}

/** Вивантажити й повернути адресу з виводу wrangler. Ввід лишається за людиною: wrangler може про щось спитати. */
function deploy(): Promise<string> {
  return new Promise((resolve, reject) => {
    // `npx` у workspace запускає команду з кореня пакета, а не з поточної теки, тож конфіг — абсолютним шляхом.
    const child = spawn(`npx --yes ${WRANGLER} deploy --config "${CONFIG}"`, { shell: true, stdio: ["inherit", "pipe", "inherit"], env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
    let output = "";
    child.stdout.on("data", (data: Buffer) => {
      process.stdout.write(data);
      output += data.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`wrangler завершився з кодом ${code}`));
      const url = /https:\/\/kotoklopit-music\.[\w-]+\.workers\.dev/.exec(output)?.[0];
      if (url) resolve(url);
      else reject(new Error("Не знайшов адреси у виводі wrangler: передайте її через --url"));
    });
  });
}

/** Справжній шматок із хостингу: є, дозволений іншому домену, кешується назавжди. */
async function verify(base: string, playlist: Playlist): Promise<void> {
  const id = Object.keys(playlist.tracks)[0];
  if (!id) throw new Error("Список треків порожній");
  const url = `${base}${id}/0.mp3`;
  const response = await fetch(url, { headers: { Origin: GAME_ORIGIN } });
  // Тіло не потрібне, але незакрита відповідь тримає з'єднання, і скрипт не завершується.
  await response.body?.cancel();
  const problems = [
    response.ok ? null : `статус ${response.status}`,
    response.headers.get("access-control-allow-origin") === "*" ? null : `Access-Control-Allow-Origin: ${response.headers.get("access-control-allow-origin")}`,
    response.headers.get("cache-control")?.includes("immutable") ? null : `Cache-Control: ${response.headers.get("cache-control")}`,
    response.headers.get("content-type")?.startsWith("audio/mpeg") ? null : `Content-Type: ${response.headers.get("content-type")}`,
  ].filter((problem) => problem !== null);
  if (problems.length > 0) throw new Error(`${url}: ${problems.join("; ")}`);
  console.log(`Перевірено ${url}: 200, CORS, кеш і тип на місці.`);
}

const { values } = parseArgs({ options: { url: { type: "string" } } });
if (!existsSync(SOURCE)) throw new Error("Немає cloudflare-music/playlist.json: спершу npm run audio:encode -w games/kotoklopit");
const playlist = JSON.parse(readFileSync(SOURCE, "utf8")) as Playlist;
checkLimits();
const host = (values.url ?? (await deploy())).replace(/\/+$/, "");
const base = `${host}/music/`;
await verify(base, playlist);
writeFileSync(GAME_PLAYLIST, `${JSON.stringify({ ...playlist, base }, null, 2)}\n`);
rmSync(SAMPLE, { recursive: true, force: true });
console.log(`Гра бере музику з ${base}; тимчасові шматки public/radio/ прибрано.`);
