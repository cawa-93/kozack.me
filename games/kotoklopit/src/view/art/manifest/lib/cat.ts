// Полотна частин кота (крок 16, F5): спільні для основи (A7), варіантів і накладок (A8) — накладка лежить у тому самому
// полотні й з тим самим pivot, що частина, тож компонувальник складає їх піксель у піксель. Без Phaser і DOM.
//
// Кіт дивиться праворуч (ліворуч — віддзеркалення), дорослий стоїть ≈ 56 одиниць до кінчиків вух (контракт хвилі 1);
// голова велика — манера F1 («великі голови котів»). Pivot — суглоб, яким частина кріпиться до кістки (F4a): тулуб —
// середина таза, голова — шия, вухо — середина основи, морда — під носом, лапа — плече чи стегно, хвіст — корінь; очі —
// між очима, рот — під носом. Точки (`points`) — підказка скелету (`CAT_FIT`): де на частині кріпляться інші (`neck`,
// `neck-base`, `shoulder-far`/`-near`, `hip-far`/`-near`, `tail`, `back`; на голові — `ear-far`/`-near`, `eyes`, `muzzle`,
// `mouth`, `top`), `<назва>-back` — те саме місце в ракурсі back. Кошеня — ті самі кадри з поправками пропорцій скелета
// (`RigDef.proportions.kitten`), окремих кадрів немає.
//
// Звичайні частини (тулуб `normal`, голова, вуха й морда `normal`, очі, рот, лапи `normal`, довгий хвіст) — полотна
// еталонів F1b (`art/cat/…`, `art/STYLE.md`, розділ 13): арт головний, а `tests/art.test.ts` звіряє viewBox із записом.
// Решта варіантів поки орієнтовні: полотно еталона, розтягнуте від pivot у пропорціях форми (`scaled`), — пакет, що їх
// малює (A7, A8), уточнює числа разом із SVG.

import type { Shape } from "../../../../sim/types";
import type { ArtPoint } from "../../types";
import type { Geometry } from "./geometry";

/** Частина: полотно, pivot і точки кріплення. */
export interface Part extends Geometry {
  points?: Readonly<Record<string, ArtPoint>>;
}

const r = (v: number): number => Math.round(v * 2) / 2;

/**
 * Частина-варіант з еталона: відстані від pivot до країв полотна й до точок помножено на `k` (уздовж x і y), краї — до цілих
 * одиниць назовні, точки — до 0,5.
 */
function scaled(part: Part, k: { x: number; y: number }): Part {
  const { pivot, size } = part;
  const left = Math.ceil(pivot.x * k.x);
  const top = Math.ceil(pivot.y * k.y);
  const right = Math.ceil((size.w - pivot.x) * k.x);
  const bottom = Math.ceil((size.h - pivot.y) * k.y);
  const result: Part = { size: { w: left + right, h: top + bottom }, pivot: { x: left, y: top } };
  if (!part.points) return result;
  const points = Object.fromEntries(
    Object.entries(part.points).map(([name, p]) => [name, { x: r(left + (p.x - pivot.x) * k.x), y: r(top + (p.y - pivot.y) * k.y) }]),
  );
  return { ...result, points };
}

/** Тулуб звичайної статури — еталон F1b (`art/cat/body/normal/*.svg`); pivot — центр таза. */
const BODY_NORMAL: Part = {
  size: { w: 61, h: 39 },
  pivot: { x: 20, y: 24 },
  points: {
    neck: { x: 44, y: 15 },
    "neck-back": { x: 47, y: 12 },
    "neck-base": { x: 40, y: 17 },
    "neck-base-back": { x: 43, y: 14 },
    "shoulder-far": { x: 50, y: 22 },
    "shoulder-far-back": { x: 44.5, y: 22 },
    "shoulder-near": { x: 44.5, y: 25.5 },
    "shoulder-near-back": { x: 50, y: 25.5 },
    "hip-far": { x: 23.5, y: 22 },
    "hip-far-back": { x: 18, y: 22 },
    "hip-near": { x: 18, y: 25.5 },
    "hip-near-back": { x: 23.5, y: 25.5 },
    tail: { x: 12, y: 16 },
    "tail-back": { x: 13, y: 15 },
    back: { x: 32, y: 12 },
    "back-back": { x: 30, y: 10 },
  },
};

/** Довжина й висота тулуба статури відносно звичайної (§9.10): струнка довша й тонша, кремезна коротша й глибша. */
const BUILD: Record<Shape["build"], { x: number; y: number }> = {
  slim: { x: 30 / 32, y: 13 / 15 },
  normal: { x: 1, y: 1 },
  stocky: { x: 34 / 32, y: 18 / 15 },
};

/** Тулуб статури: звичайна — еталон, решта — він же в пропорціях статури (орієнтовно, до A7). */
export function catBody(build: Shape["build"]): Part {
  return build === "normal" ? BODY_NORMAL : scaled(BODY_NORMAL, BUILD[build]);
}

/** Голова — еталон F1b: pivot — шия; `top` — над вухами (вуха — окремі частини), тож навмисно поза полотном. */
export const CAT_HEAD: Part = {
  size: { w: 47, h: 38 },
  pivot: { x: 15, y: 27 },
  points: {
    "ear-far": { x: 29.5, y: 10 },
    "ear-far-back": { x: 14.5, y: 11 },
    "ear-near": { x: 14.5, y: 11.5 },
    "ear-near-back": { x: 29, y: 10.5 },
    eyes: { x: 26, y: 18.6 },
    muzzle: { x: 27.8, y: 24.4 },
    mouth: { x: 27.8, y: 25.8 },
    top: { x: 22, y: -6 },
  },
};

/** Звичайне вухо — еталон F1b; pivot — середина основи. */
const EAR_NORMAL: Part = { size: { w: 30, h: 27 }, pivot: { x: 15, y: 18 } };

/** Вуха (§9.10): звичайні, великі (орієнтальні), висловухі (складені вперед), керл (загнуті назад), з китичками. */
export const CAT_EARS: Record<Shape["ears"], Part> = {
  normal: EAR_NORMAL,
  large: scaled(EAR_NORMAL, { x: 28 / 24, y: 32 / 26 }),
  folded: scaled(EAR_NORMAL, { x: 1, y: 18 / 26 }),
  curled: scaled(EAR_NORMAL, { x: 26 / 24, y: 30 / 26 }),
  tufted: scaled(EAR_NORMAL, { x: 26 / 24, y: 34 / 26 }),
};

/** Звичайна морда — еталон F1b; pivot — під носом, `mouth` — куди стає рот. */
const MUZZLE_NORMAL: Part = { size: { w: 35, h: 16 }, pivot: { x: 17, y: 8 }, points: { mouth: { x: 17, y: 9.4 } } };

/** Морди (§9.10): звичайна, кирпата (перська), видовжена (сіамська). */
export const CAT_MUZZLES: Record<Shape["muzzle"], Part> = {
  normal: MUZZLE_NORMAL,
  flat: scaled(MUZZLE_NORMAL, { x: 22 / 26, y: 18 / 20 }),
  long: scaled(MUZZLE_NORMAL, { x: 32 / 26, y: 1 }),
};

/** Очі обидва разом (у ¾ видно обидва) — еталон F1b; pivot — між очима. */
export const CAT_EYES: Part = { size: { w: 30, h: 21 }, pivot: { x: 15, y: 10 } };
/** Рот — еталон F1b; pivot — під носом, полотно вміщує нявкання (і позіх, коли його намалюють). */
export const CAT_MOUTH: Part = { size: { w: 20, h: 20 }, pivot: { x: 10, y: 6 } };

/** Наскільки коротші лапи манчкіна: на стільки ж скелет опускає тіло (`short-legs`, F4a). */
const SHORT_LEGS = 7;

/** Передні лапи (§9.10): звичайні — еталон F1b, короткі (манчкін) — на `SHORT_LEGS` коротші; pivot — плече, `paw` — подушечка. */
export const CAT_FRONT_LEGS: Record<Shape["legs"], Part> = {
  normal: { size: { w: 27, h: 41 }, pivot: { x: 12, y: 14 }, points: { paw: { x: 14, y: 34.5 } } },
  short: { size: { w: 27, h: 41 - SHORT_LEGS }, pivot: { x: 12, y: 14 }, points: { paw: { x: 14, y: 34.5 - SHORT_LEGS } } },
};

/** Задні лапи зі стегном; pivot — стегно. */
export const CAT_BACK_LEGS: Record<Shape["legs"], Part> = {
  normal: { size: { w: 28, h: 42 }, pivot: { x: 13, y: 15 }, points: { paw: { x: 14, y: 35.5 } } },
  short: { size: { w: 28, h: 42 - SHORT_LEGS }, pivot: { x: 13, y: 15 }, points: { paw: { x: 14, y: 35.5 - SHORT_LEGS } } },
};

/** Довгий хвіст — еталон F1b: у вихідній позі дугою вгору від кореня (pivot), `tip` — кінчик. */
const TAIL_LONG: Part = {
  size: { w: 40, h: 49 },
  pivot: { x: 24, y: 37 },
  points: { tip: { x: 19.6, y: 10.6 }, "tip-back": { x: 29.8, y: 12.4 } },
};

/** Хвости (§9.10; «none» — слот порожній): довгий, короткий, пухнастий, бобтейл-помпон; pivot — корінь. */
export const CAT_TAILS: Record<Exclude<Shape["tail"], "none">, Part> = {
  long: TAIL_LONG,
  short: scaled(TAIL_LONG, { x: 0.85, y: 0.6 }),
  fluffy: scaled(TAIL_LONG, { x: 1.3, y: 1.1 }),
  bobtail: scaled(TAIL_LONG, { x: 0.55, y: 0.4 }),
};
