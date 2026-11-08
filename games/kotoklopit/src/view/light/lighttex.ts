// Текстури м'якого світла (§8.9, `art/STYLE.md` §4): пляма, сяйво й конус-промінь, кожна — свого кольору. Малюються один раз на
// Canvas2D (`createRadialGradient`, `createLinearGradient`) і лягають у менеджер текстур (`textures.createCanvas`), тож їх беруть
// звичайні зображення — і в WebGL, і в запасному Canvas (tint і фільтри Phaser у Canvas не діють, тому колір запечено в
// текстуру). Під час гри, а не файлами, свідомо: кожна коштує мілісекунди раз за гру, а файл на кожен колір — зайві запити й
// байти. Спільні для обох сцен (квартира — `iso/light.ts`; гонка може взяти ті самі), від квартири не залежать. Єдиний модуль
// `light/*` з Phaser і DOM.

import type Phaser from "phaser";

/** Пляма (м'який круг, що рівно спадає), сяйво (яскраве ядро й довгий хвіст), конус від стелі до підлоги. */
export type SoftShape = "pool" | "glow" | "cone";

/** Розмір текстури, px: світло м'яке, тож більшого не треба — його розтягують. */
const SIZE: Record<SoftShape, { w: number; h: number }> = {
  pool: { w: 128, h: 128 },
  glow: { w: 128, h: 128 },
  cone: { w: 192, h: 256 },
};

/**
 * Конус: вершина — посередині верхнього краю, основа на підлозі (середина плями під світильником) — на цій частці висоти,
 * нижче — нижня половина еліпса плями. Зображення конуса ставлять origin (0,5; 0) у вершину й розтягують так, щоб основа
 * лягла на підлогу.
 */
export const CONE_BASE = 0.75;
/** Півширина вершини конуса — частка півширини основи. */
const CONE_TOP = 0.16;

/** Профілі радіальних градієнтів: [частка радіуса, непрозорість]. */
const PROFILE: Record<"pool" | "glow", readonly (readonly [number, number])[]> = {
  pool: [
    [0, 1],
    [0.25, 0.82],
    [0.5, 0.46],
    [0.75, 0.15],
    [1, 0],
  ],
  glow: [
    [0, 1],
    [0.1, 0.78],
    [0.3, 0.36],
    [0.6, 0.1],
    [1, 0],
  ],
};

const smooth = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

function rgba(color: number, alpha: number): string {
  return `rgba(${(color >> 16) & 255}, ${(color >> 8) & 255}, ${color & 255}, ${Math.min(1, Math.max(0, alpha))})`;
}

/** Ключ текстури форми `shape` кольору `color` (0xrrggbb). */
export function softKey(shape: SoftShape, color: number): string {
  return `light/${shape}/${color.toString(16).padStart(6, "0")}`;
}

/**
 * Текстура м'якого світла форми `shape` кольору `color`: створюється з першим запитом і далі береться з менеджера текстур
 * (між сценами й перезапусками — та сама). Повертає ключ текстури.
 */
export function softTexture(scene: Phaser.Scene, shape: SoftShape, color: number): string {
  const key = softKey(shape, color);
  if (scene.textures.exists(key)) return key;
  const { w, h } = SIZE[shape];
  const texture = scene.textures.createCanvas(key, w, h);
  if (!texture) return key;
  const ctx = texture.context;
  ctx.clearRect(0, 0, w, h);
  if (shape === "cone") drawCone(ctx, w, h, color);
  else {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) / 2);
    for (const [at, alpha] of PROFILE[shape]) gradient.addColorStop(at, rgba(color, alpha));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }
  texture.refresh();
  return key;
}

/**
 * Конус-промінь: рядок за рядком — горизонтальний градієнт, рівний усередині й із м'якими, але помітними краями (щоб читався
 * саме конус, а не туман), ширина від вершини до основи росте; яскравість з'являється одразу під стелею (вершина не
 * обривається), найбільша вгорі й спадає до підлоги; нижче основи — нижня половина еліпса плями, що згасає.
 */
function drawCone(ctx: CanvasRenderingContext2D, w: number, h: number, color: number): void {
  const cx = w / 2;
  for (let y = 0; y < h; y++) {
    const t = (y + 0.5) / h;
    let half: number;
    let v: number;
    if (t <= CONE_BASE) {
      const s = t / CONE_BASE;
      half = (CONE_TOP + (1 - CONE_TOP) * s) * (w / 2);
      v = smooth(s / 0.1) * (1 - 0.58 * s);
    } else {
      const e = (t - CONE_BASE) / (1 - CONE_BASE);
      half = (w / 2) * Math.sqrt(Math.max(0, 1 - e * e));
      v = 0.42 * (1 - smooth(e));
    }
    if (half < 0.5 || v <= 0) continue;
    const gradient = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
    gradient.addColorStop(0, rgba(color, 0));
    gradient.addColorStop(0.1, rgba(color, v * 0.55));
    gradient.addColorStop(0.24, rgba(color, v * 0.8));
    gradient.addColorStop(0.5, rgba(color, v));
    gradient.addColorStop(0.76, rgba(color, v * 0.8));
    gradient.addColorStop(0.9, rgba(color, v * 0.55));
    gradient.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(cx - half, y, half * 2, 1);
  }
}
