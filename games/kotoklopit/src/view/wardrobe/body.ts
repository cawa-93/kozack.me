// Тіло персонажа (§5.1): обличчя, статура, шкіра й очі — варіанти редактора; номер у `Look` — індекс тут. Обличчя — кадр
// `person/head/<номер>`, статура — `person/torso/<номер>` і пропорції скелета (`personProportions`).

import type { WardrobeColor, WardrobeEntry } from "./types";

export const FACES: readonly WardrobeEntry[] = [{ name: "кругле" }, { name: "овальне" }, { name: "широке" }];

export const BUILDS: readonly WardrobeEntry[] = [{ name: "струнка" }, { name: "звичайна" }, { name: "кремезна" }];

export const SKIN_TONES: readonly WardrobeColor[] = [
  { name: "світла", color: 0xf2d4b6 },
  { name: "бежева", color: 0xe8c39e },
  { name: "смаглява", color: 0xc99a6e },
  { name: "темна", color: 0x9a6b45 },
  { name: "дуже темна", color: 0x6b4630 },
];

/** Очі; карі на темній шкірі компонувальник темнить (`personColors`). */
export const IRIS_COLORS: readonly WardrobeColor[] = [
  { name: "темні", color: 0x1f1a24 },
  { name: "блакитні", color: 0x4f7fb3 },
  { name: "зелені", color: 0x5a8a3a },
  { name: "карі", color: 0x7a5230 },
];
