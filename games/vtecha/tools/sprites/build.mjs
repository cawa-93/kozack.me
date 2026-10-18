// Генератор піксельарт-атласу гри (§11.4): `npm run sprites`.
// Пише public/sprites/atlas.png і atlas.json (назва кадру → прямокутник). Кадри можна
// перемалювати вручну просто в PNG — назви в atlas.json лишаються контрактом із кодом.
// Параметр --preview <файл> додатково пише збільшений учетверо атлас для огляду.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Img, encodePng } from "./lib.mjs";
import { buildChars } from "./chars.mjs";
import { buildIcons, buildUi } from "./icons.mjs";
import { buildObjects } from "./objects.mjs";
import { buildTiles } from "./tiles.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = path.join(root, "public/sprites");

const frames = [];
const add = (name, img) => {
  if (frames.some((f) => f.name === name)) throw new Error(`Кадр «${name}» уже є`);
  frames.push({ name, img });
};
buildTiles(add);
buildObjects(add);
buildChars(add);
buildIcons(add);
buildUi(add);

// Пакування полицями за висотою, з відступом 1 піксель (щоб кадри не злипались при вибірці).
const ATLAS_W = 256;
const sorted = [...frames].sort((a, b) => b.img.h - a.img.h || a.name.localeCompare(b.name));
let x = 0;
let y = 0;
let rowH = 0;
const rects = {};
for (const f of sorted) {
  if (x + f.img.w > ATLAS_W) {
    x = 0;
    y += rowH + 1;
    rowH = 0;
  }
  rects[f.name] = { x, y, w: f.img.w, h: f.img.h };
  x += f.img.w + 1;
  rowH = Math.max(rowH, f.img.h);
}
const atlasH = y + rowH;
const atlas = new Img(ATLAS_W, atlasH);
for (const f of frames) atlas.blit(f.img, rects[f.name].x, rects[f.name].y);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "atlas.png"), encodePng(atlas));
const ordered = Object.fromEntries(Object.keys(rects).sort().map((k) => [k, rects[k]]));
fs.writeFileSync(path.join(outDir, "atlas.json"), JSON.stringify({ size: [ATLAS_W, atlasH], frames: ordered }, null, 1) + "\n");
console.log(`atlas.png ${ATLAS_W}×${atlasH}, кадрів: ${frames.length}`);

const pi = process.argv.indexOf("--preview");
if (pi > 0) {
  const k = 4;
  const big = new Img(ATLAS_W * k, atlasH * k);
  for (let yy = 0; yy < big.h; yy++)
    for (let xx = 0; xx < big.w; xx++) {
      const c = atlas.get(Math.floor(xx / k), Math.floor(yy / k));
      big.set(xx, yy, c === null ? ((xx >> 3) + (yy >> 3)) % 2 ? 0x303030 : 0x3a3a3a : c);
    }
  fs.writeFileSync(process.argv[pi + 1], encodePng(big));
}
