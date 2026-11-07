// Пробні анімації персонажа (крок 16, хвиля 1, F4): лише щоб перевірити скелет на заглушках; у хвилі 2 їх замінять
// пакети анімацій персонажа (N4a, N4b). Формат — `src/view/rig/types.ts`: доріжки відносно вихідної пози ракурсу.

import type { BoneTracks } from "../../types";
import { defineAnims } from "../../types";
import { PERSON_RIG } from "../../defs/person";

/** Крок ходьби, мс: за цикл — по кроку кожною ногою. */
const T = 700;
const H = T / 2;
const Q = T / 4;

/**
 * Ближня нога: опора 0 → H (п'ятка спереду, нога рівно йде назад), перенос H → T (піднята — трохи коротша — і вперед).
 * Додатний поворот ноги — назад.
 */
const LEG_NEAR: BoneTracks = {
  rot: [
    { t: 0, v: -22 },
    { t: H, v: 22, ease: "inOut" },
    { t: T, v: -22 },
  ],
  scale: [
    { t: 0, v: { x: 1, y: 1 } },
    { t: H, v: { x: 1, y: 1 }, ease: "inOut" },
    { t: H + Q, v: { x: 0.92, y: 1 }, ease: "inOut" },
    { t: T, v: { x: 1, y: 1 } },
  ],
};

/** Далека нога — зі зсувом на пів циклу. */
const LEG_FAR: BoneTracks = {
  rot: [
    { t: 0, v: 22, ease: "inOut" },
    { t: H, v: -22 },
    { t: T, v: 22 },
  ],
  scale: [
    { t: 0, v: { x: 1, y: 1 }, ease: "inOut" },
    { t: Q, v: { x: 0.92, y: 1 }, ease: "inOut" },
    { t: H, v: { x: 1, y: 1 } },
    { t: T, v: { x: 1, y: 1 } },
  ],
};

/**
 * Стопа ближньої ноги — відносно ноги: на опорі майже гасить її поворот (стопа рівно на підлозі), на п'ятці носок трохи
 * вгору, на поштовху — п'ятка вгору.
 */
const FOOT_NEAR: BoneTracks = {
  rot: [
    { t: 0, v: 12, ease: "inOut" },
    { t: Q, v: 0, ease: "inOut" },
    { t: H, v: -7, ease: "inOut" },
    { t: H + Q, v: -5, ease: "inOut" },
    { t: T, v: 12 },
  ],
};

const FOOT_FAR: BoneTracks = {
  rot: [
    { t: 0, v: -7, ease: "inOut" },
    { t: Q, v: -5, ease: "inOut" },
    { t: H, v: 12, ease: "inOut" },
    { t: H + Q, v: 0, ease: "inOut" },
    { t: T, v: -7 },
  ],
};

/** Руки — навхрест із ногами: ближня рука назад, коли ближня нога спереду. */
const ARM_NEAR: BoneTracks = {
  rot: [
    { t: 0, v: 16, ease: "inOut" },
    { t: H, v: -16, ease: "inOut" },
    { t: T, v: 16 },
  ],
};

const ARM_FAR: BoneTracks = {
  rot: [
    { t: 0, v: -16, ease: "inOut" },
    { t: H, v: 16, ease: "inOut" },
    { t: T, v: -16 },
  ],
};

export const PERSON_TRIAL = defineAnims(PERSON_RIG, {
  /** Ходьба на місці: руки й ноги навхрест, легке підстрибування двічі за цикл, тулуб трохи нахилений уперед. */
  walk: {
    duration: T,
    loop: true,
    bones: {
      // Найвище — посередині опори (нога вертикальна), найнижче — коли обидві ноги на підлозі.
      pelvis: {
        pos: [
          { t: 0, v: { x: 0, y: 0 }, ease: "inOut" },
          { t: Q, v: { x: 0, y: -2.5 }, ease: "inOut" },
          { t: H, v: { x: 0, y: 0 }, ease: "inOut" },
          { t: H + Q, v: { x: 0, y: -2.5 }, ease: "inOut" },
          { t: T, v: { x: 0, y: 0 } },
        ],
      },
      torso: {
        rot: [
          { t: 0, v: 3, ease: "inOut" },
          { t: Q, v: 4, ease: "inOut" },
          { t: H, v: 3, ease: "inOut" },
          { t: H + Q, v: 4, ease: "inOut" },
          { t: T, v: 3 },
        ],
      },
      // Голова тримається рівно попри нахил тулуба.
      head: { rot: [{ t: 0, v: -3 }] },
      "leg-near": LEG_NEAR,
      "leg-far": LEG_FAR,
      "foot-near": FOOT_NEAR,
      "foot-far": FOOT_FAR,
      "arm-near": ARM_NEAR,
      "arm-far": ARM_FAR,
    },
  },
});
