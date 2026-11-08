// Легкі рухи живого портрета кота (§9.7). Кіт сидить (`sit` сам дихає й ледь ворушить хвостом), а рух — разова накладка: її доріжки
// кісток додаються до `sit`, кадри очей і рота — замість звичайних. Лише дані, без Phaser і DOM.

import type { Key, RigAnim } from "../rig/types";

/** Рух портрета; `id` — щоб не повторювати той самий двічі поспіль. */
export type PortraitMove = RigAnim<string, string> & { readonly id: string };

/** Пауза між рухами, мс. */
export const PORTRAIT_PAUSE = { min: 1200, max: 4200 } as const;

/** Ключі кута за частками тривалості: `[частка, градуси]`, плавно між ними. */
const swing = (ms: number, points: readonly (readonly [number, number])[]): Key<number>[] =>
  points.map(([share, v]) => ({ t: share * ms, v, ease: "inOut" }));

/** Кадри слота за часом: `[мс, стан]`. */
const frames = (points: readonly (readonly [number, string])[]): Key<string>[] => points.map(([t, v]) => ({ t, v }));

const BLINK_MS = 200;
const SLOW_BLINK_MS = 1200;
const EAR_MS = 420;
const FLICK_MS = 650;
const SWAY_MS = 2200;
const LOOK_MS = 2000;
const TILT_MS = 1600;
const YAWN_MS = 1500;
const LICK_MS = 850;
const SIGH_MS = 1800;

export const PORTRAIT_MOVES: readonly PortraitMove[] = [
  // Кліпає.
  { id: "blink", duration: BLINK_MS, loop: false, slots: { eyes: { frame: frames([[0, "closed"], [130, "open"]]) } } },
  // Повільно заплющує очі й трохи схиляє голову: довіра.
  {
    id: "slow-blink",
    duration: SLOW_BLINK_MS,
    loop: false,
    bones: { head: { rot: swing(SLOW_BLINK_MS, [[0, 0], [0.4, 3], [0.7, 3], [1, 0]]) } },
    slots: { eyes: { frame: frames([[0, "half"], [260, "closed"], [760, "half"], [1000, "open"]]) } },
  },
  // Сіпає вухом.
  { id: "ear-twitch", duration: EAR_MS, loop: false, bones: { "ear-near": { rot: swing(EAR_MS, [[0, 0], [0.25, -26], [0.5, 4], [0.75, -17], [1, 0]]) } } },
  // Смикає кінчиком хвоста.
  { id: "tail-flick", duration: FLICK_MS, loop: false, bones: { tail: { rot: swing(FLICK_MS, [[0, 0], [0.3, 16], [0.6, -8], [0.8, 5], [1, 0]]) } } },
  // Повільно водить хвостом.
  { id: "tail-sway", duration: SWAY_MS, loop: false, bones: { tail: { rot: swing(SWAY_MS, [[0, 0], [0.3, 12], [0.7, -12], [1, 0]]) } } },
  // Озирається туди й сюди.
  { id: "look-around", duration: LOOK_MS, loop: false, bones: { head: { rot: swing(LOOK_MS, [[0, 0], [0.2, -9], [0.45, -9], [0.65, 7], [0.85, 7], [1, 0]]) } } },
  // Нахиляє голову, ніби щось почув.
  { id: "head-tilt", duration: TILT_MS, loop: false, bones: { head: { rot: swing(TILT_MS, [[0, 0], [0.25, 11], [0.7, 11], [1, 0]]) } } },
  // Позіхає.
  {
    id: "yawn",
    duration: YAWN_MS,
    loop: false,
    bones: { head: { rot: swing(YAWN_MS, [[0, 0], [0.3, -9], [0.7, -9], [1, 0]]) } },
    slots: { eyes: { frame: frames([[150, "closed"], [1200, "open"]]) }, mouth: { frame: frames([[150, "yawn"], [1200, "closed"]]) } },
  },
  // Облизується.
  { id: "lick", duration: LICK_MS, loop: false, bones: { head: { rot: swing(LICK_MS, [[0, 0], [0.4, 3], [1, 0]]) } }, slots: { mouth: { frame: frames([[100, "tongue"], [650, "closed"]]) } } },
  // Глибоко зітхає: тулуб помітніше піднімається й опускається, ніж у звичайному диханні.
  {
    id: "sigh",
    duration: SIGH_MS,
    loop: false,
    bones: { body: { scale: [{ t: 0, v: { x: 1, y: 1 }, ease: "inOut" }, { t: SIGH_MS * 0.45, v: { x: 1.02, y: 1.05 }, ease: "inOut" }, { t: SIGH_MS, v: { x: 1, y: 1 } }] } },
  },
];

/** Наступний рух: випадковий, але не той самий, що щойно був. */
export function pickMove(random: () => number, last: PortraitMove | null): PortraitMove {
  const choices = PORTRAIT_MOVES.filter((move) => move !== last);
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))] ?? PORTRAIT_MOVES[0]!;
}

/** Скільки чекати до наступного руху, мс. */
export function pickPause(random: () => number): number {
  return PORTRAIT_PAUSE.min + random() * (PORTRAIT_PAUSE.max - PORTRAIT_PAUSE.min);
}
