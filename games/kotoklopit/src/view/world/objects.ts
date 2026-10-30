// Вигляд речей квартири (§8.4), спільний для частин світу: на яку висоту вилазить кіт, де стоїть персонаж, де бабл.
// Без Phaser. У кроці 16 сюди ж ляжуть дані ізометрії: де персонаж стоїть чи сидить біля речі, її слід, висота верху
// й зсув бульбашки.

import type { ObjectKind } from "../../sim/home";

/**
 * Видима висота речі на екрані старого вигляду (коса проєкція «три чверті»), px: на таку висоту вилазить кіт, така
 * лицьова грань меблів.
 */
const HEIGHT: Record<ObjectKind, number> = {
  bed: 22,
  shower: 52,
  sink: 30,
  fridge: 72,
  stove: 32,
  counter: 32,
  table: 26,
  trash: 30,
  computer: 30,
  sofa: 30,
  // Двері — у стіні: заввишки як стіна косої проєкції.
  door: 30,
  catCabinet: 46,
  washer: 48,
  vacuum: 60,
  litterBag: 42,
  sterileBin: 36,
  catKit: 40,
  boxes: 40,
  wardrobe: 64,
  windowsill: 22,
};

/** Видима висота речі (старий вигляд): на неї вилазить кіт. */
export function objectHeight(kind: ObjectKind): number {
  return HEIGHT[kind];
}
