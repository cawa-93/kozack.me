// Пробні анімації кота (крок 16, хвиля 1, F4): лише щоб перевірити скелет на заглушках; у хвилі 2 їх замінять пакети
// анімацій кота (N1–N3). Формат — `src/view/rig/types.ts`: доріжки відносно вихідної пози ракурсу.

import type { BoneTracks } from "../../types";
import { defineAnims } from "../../types";
import { CAT_RIG } from "../../defs/cat";

/** Крок ходьби, мс: цикл — дві пари лап по діагоналі (ближня передня з далекою задньою, далека передня з ближньою задньою). */
const T = 640;
const H = T / 2;
const Q = T / 4;

/**
 * Лапа пари A: опора 0 → H (лапа на підлозі, іде спереду назад рівно, тіло йде вперед), перенос H → T (піднята — трохи
 * коротша — і м'яко вперед). Додатний поворот лапи — назад.
 */
const PAIR_A: BoneTracks = {
  rot: [
    { t: 0, v: -20 },
    { t: H, v: 20, ease: "inOut" },
    { t: T, v: -20 },
  ],
  scale: [
    { t: 0, v: { x: 1, y: 1 } },
    { t: H, v: { x: 1, y: 1 }, ease: "inOut" },
    { t: H + Q, v: { x: 0.86, y: 1 }, ease: "inOut" },
    { t: T, v: { x: 1, y: 1 } },
  ],
};

/** Лапа пари B — та сама хода зі зсувом на пів циклу: спершу перенос, потім опора. */
const PAIR_B: BoneTracks = {
  rot: [
    { t: 0, v: 20, ease: "inOut" },
    { t: H, v: -20 },
    { t: T, v: 20 },
  ],
  scale: [
    { t: 0, v: { x: 1, y: 1 }, ease: "inOut" },
    { t: Q, v: { x: 0.86, y: 1 }, ease: "inOut" },
    { t: H, v: { x: 1, y: 1 } },
    { t: T, v: { x: 1, y: 1 } },
  ],
};

export const CAT_TRIAL = defineAnims(CAT_RIG, {
  /** Ходьба на місці: діагональні пари лап, тіло підстрибує двічі за цикл, голова киває, хвіст похитується. */
  walk: {
    duration: T,
    loop: true,
    bones: {
      // Тіло найвище, коли лапи опори вертикальні (середина опори), найнижче — на зміні пар.
      pelvis: {
        pos: [
          { t: 0, v: { x: 0, y: 0 }, ease: "inOut" },
          { t: Q, v: { x: 0, y: -1.5 }, ease: "inOut" },
          { t: H, v: { x: 0, y: 0 }, ease: "inOut" },
          { t: H + Q, v: { x: 0, y: -1.5 }, ease: "inOut" },
          { t: T, v: { x: 0, y: 0 } },
        ],
      },
      body: {
        rot: [
          { t: 0, v: 1, ease: "inOut" },
          { t: H, v: -1, ease: "inOut" },
          { t: T, v: 1 },
        ],
      },
      neck: {
        rot: [
          { t: 0, v: 0, ease: "inOut" },
          { t: Q, v: 3, ease: "inOut" },
          { t: H, v: 0, ease: "inOut" },
          { t: H + Q, v: 3, ease: "inOut" },
          { t: T, v: 0 },
        ],
      },
      // Голова частково гасить кивок шиї: морда лишається майже рівною.
      head: {
        rot: [
          { t: 0, v: 0, ease: "inOut" },
          { t: Q, v: -2, ease: "inOut" },
          { t: H, v: 0, ease: "inOut" },
          { t: H + Q, v: -2, ease: "inOut" },
          { t: T, v: 0 },
        ],
      },
      tail: {
        rot: [
          { t: 0, v: -6, ease: "inOut" },
          { t: H, v: 6, ease: "inOut" },
          { t: T, v: -6 },
        ],
      },
      "leg-front-near": PAIR_A,
      "leg-back-far": PAIR_A,
      "leg-front-far": PAIR_B,
      "leg-back-near": PAIR_B,
    },
    views: {
      // Ззаду хвіст найближче до камери — хай ходить ширше.
      back: {
        bones: {
          tail: {
            rot: [
              { t: 0, v: -10, ease: "inOut" },
              { t: H, v: 10, ease: "inOut" },
              { t: T, v: -10 },
            ],
          },
        },
      },
    },
  },
});
