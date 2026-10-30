// Вага кота й «Схильність до повноти» (§9.12 «Тіло й тепло», рішення автора 2026-10-25, `TRAITS_REVIEW.md`): прихована вага 0–100,
// норма — 50. Кіт гладшає від їжі понад голод, ласощів і краденого, худне до норми від гри й з часом; від 75 — ожиріння (§9.5,
// `DISEASES.md`). Видно з малюнка: кіт ширшає поступово.

import { riskHalves } from "./breeds";
import { traitLevel, weightOf } from "./cat";
import { MINUTES_PER_DAY, MINUTES_PER_HOUR, WEIGHT } from "./config";
import { observe } from "./knowledge";
import type { Cat, GameState } from "./types";

/**
 * Кіт з'їв більше, ніж треба (§9.12): порцію, коли не був голодний, ласощі чи крадене. Набір × max(0, 1 + 0,5 × «Схильність до
 * повноти»), у стерилізованого ще × 1,3, крім корму для стерилізованих — з миски чи прогризеного пакета (`sterileFood`, рішення автора 2026-10-26), у
 * британської короткошерстої (схильність «ожиріння») ще × 1,25, у напівкровки — × 1,125 (рішення автора 2026-10-26). «Не товстіє» (−2) не гладшає зовсім. «−», що помітно переїв (зайвого до множників
 * щонайменше `WEIGHT.overate`: порція при голоді 60 і нижче, ласощі чи крадене), а вага нижче 55, — прояв «−»: не гладшає, хоч
 * скільки їсть (раз на день). Трапеза трохи раніше звичайного — не «переїв»: її не відрізнити від звичайної (перевірка етапу
 * 2026-10-26).
 */
export function gainWeight(state: GameState, cat: Cat, amount: number, sterileFood = false): void {
  const level = traitLevel(cat, "chubby");
  const breed = 1 + WEIGHT.breedStep * riskHalves(cat.breed, "ожиріння");
  const gain = amount * Math.max(0, 1 + WEIGHT.traitStep * level) * (cat.sterilized && !sterileFood ? WEIGHT.sterilized : 1) * breed;
  cat.weight = Math.min(WEIGHT.max, weightOf(cat) + gain);
  if (level < 0 && amount >= WEIGHT.overate && weightOf(cat) < WEIGHT.slim) observe(state, cat, "chubby", -1, false, MINUTES_PER_DAY);
}

/** Кіт награвся, нагасався чи поборовся (§9.12): худне на `playLoss` × частку гри, але не нижче норми. */
export function exercise(cat: Cat, share = 1): void {
  burn(cat, WEIGHT.playLoss * share);
}

/** З часом зайва вага потроху йде (§9.12): `perHour` за годину, але не нижче норми. */
export function settleWeight(cat: Cat, minutes: number): void {
  burn(cat, (WEIGHT.perHour * minutes) / MINUTES_PER_HOUR);
}

function burn(cat: Cat, amount: number): void {
  const weight = weightOf(cat);
  if (weight <= WEIGHT.norm || amount <= 0) return;
  const next = Math.max(WEIGHT.norm, weight - amount);
  if (next === WEIGHT.norm) delete cat.weight;
  else cat.weight = next;
}

/** «Пухкенький» помітно гладшає (§9.9): вага від 60, і кіт на очах персонажа — прояв «+», раз на день. */
export function weightSeen(state: GameState, cat: Cat): void {
  if (weightOf(cat) >= WEIGHT.visible) observe(state, cat, "chubby", 1, false, MINUTES_PER_DAY);
}

/** Наскільки кіт ширший за звичайного на малюнку (§9.12): 1 — норма й худіше, далі поступово. */
export function girthOf(cat: Cat): number {
  return 1 + WEIGHT.girthStep * Math.max(0, weightOf(cat) - WEIGHT.norm) / (WEIGHT.max - WEIGHT.norm);
}
