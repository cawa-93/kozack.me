// Перемикає гру на музику з хостингу (§8.10, `SOUND_PLAN.md`, блок 3): список треків із `audio-out/playlist.json` стає списком гри
// з адресою хостингу, а тимчасові шматки `public/radio/` більше не потрібні.
//
//   npm run audio:publish -w games/kotoklopit -- --base https://kotoklopit-radio.<піддомен>.workers.dev/
//
// Спершу — `npm run audio:deploy -w games/kotoklopit`: адресу друкує він.

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SOURCE = path.join(ROOT, "audio-out/playlist.json");
const GAME_PLAYLIST = path.join(ROOT, "src/audio/radio/playlist.json");
const SAMPLE = path.join(ROOT, "public/radio");

const { values } = parseArgs({ options: { base: { type: "string" } } });
const base = values.base;
if (!base || !/^https:\/\/.+\/$/.test(base)) throw new Error("Вкажіть --base https://…/ (зі скісною рискою в кінці)");
if (!existsSync(SOURCE)) throw new Error("Немає audio-out/playlist.json: спершу npm run audio:encode -- --out audio-out");

const playlist = JSON.parse(readFileSync(SOURCE, "utf8")) as { base: string | null };
writeFileSync(GAME_PLAYLIST, `${JSON.stringify({ ...playlist, base }, null, 2)}\n`);
rmSync(SAMPLE, { recursive: true, force: true });
console.log(`Гра бере музику з ${base}; тимчасові шматки public/radio/ прибрано.`);
