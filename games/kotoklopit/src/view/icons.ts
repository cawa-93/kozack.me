// Іконки (§11.4) під ключами текстур `iconTexture(name)`: кадри атласу `icon/<назва>` (SVG пакетів A11 і A12, крок 16).
// Ключ — «вікно» на кадр атласу (`iso/iconalias.ts`), тож місця, що беруть іконку за ключем (індикатори сховищ, політ
// запасів), показують арт і нічого не знають про атлас. Бабли, панель і сердечка беруть кадри атласу прямо.

import type Phaser from "phaser";

import { artFrameName } from "./art/atlas";
import { ART_TEXTURE } from "./art/types";
import { ICON_NAMES, iconArt, iconTexture } from "./iconnames";
import { aliasArtFrame } from "./iso/iconalias";

/**
 * Текстури іконок — один раз на гру. На WebGL ключ — вікно на кадр атласу; у Canvas-режимі Phaser (браузер без WebGL)
 * вікна не буває, тож кадр копіюється на своє полотно. Атласу немає зовсім (не завантажився) — текстури немає, і Phaser
 * покаже свою «відсутню», як і решта світу без атласу.
 */
export function createIconTextures(scene: Phaser.Scene): void {
  for (const name of ICON_NAMES) {
    const key = iconTexture(name);
    if (scene.textures.exists(key)) continue;
    const frame = artFrameName(iconArt(name));
    if (!aliasArtFrame(scene.textures, key, frame)) copyArtFrame(scene.textures, key, frame);
  }
}

/** Кадр атласу `frameName` — на нове полотно `key` повного розміру кадру (з обрізкою на своєму місці). */
function copyArtFrame(textures: Phaser.Textures.TextureManager, key: string, frameName: string): void {
  if (!textures.exists(ART_TEXTURE)) return;
  const atlas = textures.get(ART_TEXTURE);
  if (!atlas.has(frameName)) return;
  const frame = atlas.get(frameName);
  textures.createCanvas(key, frame.realWidth, frame.realHeight)?.drawFrame(ART_TEXTURE, frameName, frame.x, frame.y);
}
