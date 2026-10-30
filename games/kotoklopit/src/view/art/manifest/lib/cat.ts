// Полотна частин кота (крок 16, F5): спільні для основи (A7), варіантів і накладок (A8) — накладка лежить у тому самому
// полотні й з тим самим pivot, що частина, тож компонувальник складає їх піксель у піксель. Без Phaser і DOM.
//
// Кіт дивиться праворуч (ліворуч — віддзеркалення), дорослий стоїть ≈ 56 одиниць до кінчиків вух (контракт хвилі 1);
// голова велика — манера F1 («великі голови котів»). Pivot — суглоб, яким частина кріпиться до кістки: тулуб — середина
// хребта (корінь скелета), голова — шия, вухо — основа, морда — де вона прилягає до голови, лапа — плече чи стегно,
// хвіст — корінь хвоста; очі й рот — свої центри на голові. Точки (`points`) — підказка скелету (F4): де на частині
// кріпляться інші (`neck`, `shoulder-far`/`-near`, `hip-far`/`-near`, `tail`; на голові — `ear-far`/`-near`, `eyes`,
// `muzzle`, `mouth`). Кошеня — ті самі кадри з поправками пропорцій скелета (`RigDef.proportions.kitten`), окремих
// кадрів немає.

import type { Shape } from "../../../../sim/types";
import type { ArtPoint } from "../../types";
import type { Geometry } from "./geometry";

/** Частина: полотно, pivot і точки кріплення. */
export interface Part extends Geometry {
  points?: Readonly<Record<string, ArtPoint>>;
}

const r = (v: number): number => Math.round(v * 2) / 2;

/** Пів довжини й пів висоти тулуба кожної статури (§9.10): струнка, звичайна, кремезна. */
const BUILD: Record<Shape["build"], { l: number; h: number }> = {
  slim: { l: 30, h: 13 },
  normal: { l: 32, h: 15 },
  stocky: { l: 34, h: 18 },
};

/** Тулуб: спільне полотно 96 × 64 для всіх статур, pivot — середина; точки — від статури. */
export function catBody(build: Shape["build"]): Part {
  const { l, h } = BUILD[build];
  const c = { x: 48, y: 32 };
  const at = (fx: number, fy: number): ArtPoint => ({ x: r(c.x + fx * l), y: r(c.y + fy * h) });
  return {
    size: { w: 96, h: 64 },
    pivot: c,
    points: {
      neck: at(0.8, -0.55),
      "shoulder-far": at(0.5, 0.55),
      "shoulder-near": at(0.62, 0.75),
      "hip-far": at(-0.55, 0.55),
      "hip-near": at(-0.42, 0.75),
      tail: at(-0.95, -0.35),
    },
  };
}

/** Голова: полотно 56 × 52, pivot — шия (низ потилиці). */
export const CAT_HEAD: Part = {
  size: { w: 56, h: 52 },
  pivot: { x: 22, y: 44 },
  points: {
    "ear-far": { x: 20, y: 10 },
    "ear-near": { x: 34, y: 8 },
    eyes: { x: 34, y: 24 },
    muzzle: { x: 38, y: 32 },
    mouth: { x: 40, y: 38 },
  },
};

/** Вуха (§9.10): звичайні, великі (орієнтальні), висловухі (складені вперед), керл (загнуті назад), з китичками. */
export const CAT_EARS: Record<Shape["ears"], Part> = {
  normal: { size: { w: 24, h: 26 }, pivot: { x: 12, y: 22 } },
  large: { size: { w: 28, h: 32 }, pivot: { x: 14, y: 28 } },
  folded: { size: { w: 24, h: 18 }, pivot: { x: 12, y: 14 } },
  curled: { size: { w: 26, h: 30 }, pivot: { x: 12, y: 26 } },
  tufted: { size: { w: 26, h: 34 }, pivot: { x: 13, y: 30 } },
};

/** Морди (§9.10): звичайна, кирпата (перська), видовжена (сіамська); `nose` — кінчик носа. */
export const CAT_MUZZLES: Record<Shape["muzzle"], Part> = {
  normal: { size: { w: 26, h: 20 }, pivot: { x: 6, y: 10 }, points: { nose: { x: 20, y: 6 } } },
  flat: { size: { w: 22, h: 18 }, pivot: { x: 6, y: 9 }, points: { nose: { x: 16, y: 5 } } },
  long: { size: { w: 32, h: 20 }, pivot: { x: 6, y: 10 }, points: { nose: { x: 26, y: 6 } } },
};

/** Очі обидва разом (у ¾ видно обидва), pivot — посередині. */
export const CAT_EYES: Part = { size: { w: 32, h: 18 }, pivot: { x: 16, y: 9 } };
/** Рот під носом, pivot — верх посередині (під носом); полотно вміщує позіх. */
export const CAT_MOUTH: Part = { size: { w: 24, h: 22 }, pivot: { x: 12, y: 4 } };

/** Передні лапи (§9.10): звичайні й короткі (манчкін); pivot — плече, `paw` — подушечка. */
export const CAT_FRONT_LEGS: Record<Shape["legs"], Part> = {
  normal: { size: { w: 20, h: 32 }, pivot: { x: 10, y: 5 }, points: { paw: { x: 10, y: 28 } } },
  short: { size: { w: 20, h: 22 }, pivot: { x: 10, y: 5 }, points: { paw: { x: 10, y: 18 } } },
};

/** Задні лапи зі стегном; pivot — кульшовий суглоб. */
export const CAT_BACK_LEGS: Record<Shape["legs"], Part> = {
  normal: { size: { w: 26, h: 34 }, pivot: { x: 13, y: 6 }, points: { paw: { x: 11, y: 30 } } },
  short: { size: { w: 26, h: 24 }, pivot: { x: 13, y: 6 }, points: { paw: { x: 11, y: 20 } } },
};

/** Хвости (§9.10; «none» — слот порожній): звичайний довгий, короткий, пухнастий, бобтейл-помпон; pivot — корінь (праворуч). */
export const CAT_TAILS: Record<Exclude<Shape["tail"], "none">, Part> = {
  long: { size: { w: 64, h: 36 }, pivot: { x: 56, y: 28 }, points: { tip: { x: 8, y: 6 } } },
  short: { size: { w: 40, h: 26 }, pivot: { x: 32, y: 18 }, points: { tip: { x: 8, y: 6 } } },
  fluffy: { size: { w: 72, h: 44 }, pivot: { x: 62, y: 34 }, points: { tip: { x: 10, y: 8 } } },
  bobtail: { size: { w: 22, h: 20 }, pivot: { x: 16, y: 12 }, points: { tip: { x: 6, y: 8 } } },
};
