// Як кадр арту стає на місце (крок 16, GRAPHICS_PLAN.md: «Шов хвилі 1»): назва кадру за id, станом, ракурсом і шаром;
// розмір і pivot (з маніфесту, запасні чи типові); origin і масштаб зображення; розмір і вигляд заглушки. Чисті функції
// без Phaser і DOM: їх кличе `atlas.ts`, а перевіряє `tests/artatlas.test.ts`; `stubSvg` і `STUB_LOOK` може взяти
// конвеєр, щоб його заглушки в атласі виглядали так само, як заглушки в рантаймі.

import { frameId, layerFrameName, type ArtEntry, type ArtId, type ArtPoint, type ArtSize, type ArtView, type FrameBox, type FrameLayer } from "./types";

/** Який кадр запису: стан, ракурс і шар. */
export interface ArtFrameOptions {
  /** Стан (`open`, `full-3`); не задано — перший стан запису, якщо він їх має; null — без стану. */
  state?: string | null | undefined;
  /** Ракурс; не задано — перший ракурс запису (`front`), якщо він їх має; null — без ракурсу. */
  view?: ArtView | null | undefined;
  /**
   * Шар; не задано — `all`, увесь SVG одним кадром (запис без `layers`). Запис із `layers` кадру `all` в атласі не має:
   * його шари складає компонувальник (`compose.ts`), а без `layer` тут буде заглушка.
   */
  layer?: FrameLayer | undefined;
}

/** Розмір і pivot кадру, якого немає в маніфесті, — для заглушки й розміщення. */
export interface ArtFallback {
  /** Розмір полотна, одиниці арту. */
  size: ArtSize;
  /** Точка опори від лівого верхнього кута полотна, одиниці арту. */
  pivot: ArtPoint;
}

/** Розмір і pivot, з якими кадр стає на місце. */
export type ArtGeometry = ArtFallback;

/** Кадр без запису маніфесту й без `fallback`: 64 × 64 одиниці з pivot посередині. */
export const DEFAULT_GEOMETRY: ArtGeometry = { size: { w: 64, h: 64 }, pivot: { x: 32, y: 32 } };

/**
 * Назва кадру Phaser в атласі (`ART_TEXTURE`): `layerFrameName(frameId(id, стан, ракурс), шар)`. Стан і ракурс, яких не
 * задано, — перші з запису (`entry`), шар — `all`.
 */
export function frameNameFor(id: ArtId, entry: ArtEntry | undefined, opts: ArtFrameOptions = {}): string {
  const state = opts.state === undefined ? (entry?.states?.[0] ?? null) : opts.state;
  const view = opts.view === undefined ? (entry?.views?.[0] ?? null) : opts.view;
  return layerFrameName(frameId(id, state, view), opts.layer ?? "all");
}

/**
 * Розмір і pivot кадру: із запису маніфесту; без нього — `fallback`; без нього — з самого кадру атласу (`frame`: його
 * розмір без обрізки в пікселях і роздільність; pivot — посередині); інакше — `DEFAULT_GEOMETRY`.
 */
export function artGeometry(
  entry: ArtEntry | undefined,
  fallback: ArtFallback | undefined,
  frame: { px: ArtSize; res: number } | null,
): ArtGeometry {
  if (entry) return { size: entry.size, pivot: entry.pivot };
  if (fallback) return fallback;
  if (frame) {
    const size = { w: frame.px.w / frame.res, h: frame.px.h / frame.res };
    return { size, pivot: { x: size.w / 2, y: size.h / 2 } };
  }
  return DEFAULT_GEOMETRY;
}

/**
 * Кадр накладок частини кота чи персонажа (F5: `cat/<частина>-extra/…`, `person/<частина>-extra…`): той самий кадр, лише
 * другий сегмент id — з «-extra» (`cat/body/normal/front` → `cat/body-extra/normal/front`, `person/leg/back` →
 * `person/leg-extra/back`). Шари `extra-*` (залисини, тьмяна шерсть, складки, завитки, нашийник, плями на одязі) лежать
 * там — у тому самому полотні й з тим самим pivot, що частина. null — це не частина кота чи персонажа.
 */
export function extraFrameOf(frame: string): string | null {
  const parts = frame.split("/");
  const part = parts[1];
  if ((parts[0] !== "cat" && parts[0] !== "person") || part === undefined || part.endsWith("-extra")) return null;
  parts[1] = `${part}-extra`;
  return parts.join("/");
}

/** Origin і масштаб зображення Phaser: origin — частки розміру, масштаб — одиниць арту (px світу) на піксель текстури. */
export interface ArtPlacement {
  originX: number;
  originY: number;
  scaleX: number;
  scaleY: number;
}

/**
 * Як поставити кадр: origin у pivot (`pivot / size`), а масштаб такий, щоб полотно запису займало у світі рівно `size`
 * одиниць (1 одиниця арту = 1 px світу). `framePx` — розмір кадру без обрізки, пікселі текстури (у Phaser —
 * `realWidth × realHeight`): для кадру атласу це `size · res`, тож масштаб — `1 / res`; заглушка має свою роздільність.
 */
export function artPlacement(geometry: ArtGeometry, framePx: ArtSize): ArtPlacement {
  const { size, pivot } = geometry;
  return {
    originX: pivot.x / size.w,
    originY: pivot.y / size.h,
    scaleX: size.w / framePx.w,
    scaleY: size.h / framePx.h,
  };
}

// --- Кадр на рамці вмісту -------------------------------------------------------------------------

/** Найменша рамка, що вміщує обидві. */
export function unionBox(a: FrameBox, b: FrameBox): FrameBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/**
 * Origin зображення, текстура якого — рамка `box` полотна кадру `framePx`, щоб точка кадру `point` (одиниці арту) стояла в
 * точці зображення. Точка буває поза рамкою (суглоб поза намальованим) — тоді origin поза 0–1, і Phaser це малює.
 */
export function boxOrigin(geometry: ArtGeometry, framePx: ArtSize, box: FrameBox, point: ArtPoint): ArtPoint {
  return { x: ((point.x * framePx.w) / geometry.size.w - box.x) / box.w, y: ((point.y * framePx.h) / geometry.size.h - box.y) / box.h };
}

/**
 * Як поставити кадр, від якого в текстурі лишили рамку вмісту `box` (пікселі полотна `framePx`): origin — у pivot, що тепер
 * відлічується від початку рамки, масштаб — як у повного полотна (`artPlacement`). Кожен піксель рамки стає на екрані там
 * само, де стояв би на повному полотні.
 */
export function boxPlacement(geometry: ArtGeometry, framePx: ArtSize, box: FrameBox): ArtPlacement {
  const full = artPlacement(geometry, framePx);
  if (box.x === 0 && box.y === 0 && box.w === framePx.w && box.h === framePx.h) return full;
  const origin = boxOrigin(geometry, framePx, box, geometry.pivot);
  return { originX: origin.x, originY: origin.y, scaleX: full.scaleX, scaleY: full.scaleY };
}

/**
 * Прямокутник обтинання `rect` (пікселі полотна кадру) у пікселях рамки `box`, обтятий нею: `Image.setCrop` рахує від
 * початку текстури й від'ємного початку сам не обтинає. Поза рамкою — нульовий розмір.
 */
export function boxCrop(box: FrameBox, rect: FrameBox): FrameBox {
  const x0 = Math.max(rect.x, box.x);
  const y0 = Math.max(rect.y, box.y);
  const x1 = Math.min(rect.x + rect.w, box.x + box.w);
  const y1 = Math.min(rect.y + rect.h, box.y + box.h);
  return { x: x0 - box.x, y: y0 - box.y, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

// --- Заглушка ---------------------------------------------------------------------------------

/** Початок ключа текстур-заглушок рантайму: за ним галерея відрізняє заглушку від намальованого. */
export const ART_STUB_PREFIX = "art-stub:";

/**
 * Чи кадр — заглушка: текстура-заглушка рантайму (ключ `ART_STUB_PREFIX…`, кадру в атласі немає) чи кадр атласу, який
 * конвеєр намалював заглушкою, бо SVG ще немає (`customData.stub` кадру, `stub: true` в `index.json`). Атлас є завжди (dev,
 * прев'ю, продакшн), тож заглушки конвеєра — звичайні кадри `ART_TEXTURE`, і за самим ключем текстури їх не відрізнити.
 */
export function isStubFrame(textureKey: string, customData: unknown): boolean {
  if (textureKey.startsWith(ART_STUB_PREFIX)) return true;
  return typeof customData === "object" && customData !== null && (customData as { stub?: unknown }).stub === true;
}


/** Пікселів текстури заглушки на одиницю арту — не більше за це. */
export const STUB_RES = 2;
/**
 * Найбільша сторона текстури заглушки, пікселі: заглушка — пласка штриховка, тож велика плита (вітальня ≈ 1472 одиниці
 * завширшки) не мусить займати мегабайти відеопам'яті — її просто розтягнуто.
 */
export const STUB_MAX_PX = 512;

/**
 * Як виглядає заглушка арту, якого ще немає (без тексту): напівпрозора маджента з косою штриховкою щільною маджентою,
 * темний контур по краю полотна й кружечок у pivot. Напівпрозора — бо в ізометрії рамки сусідніх кадрів перекриваються
 * (плити кімнат), і крізь заглушку видно, що під нею.
 * Товщини й крок — в одиницях арту.
 */
export const STUB_LOOK = {
  fill: "#ff00ff",
  fillAlpha: 0.45,
  hatch: "#ff00ff",
  hatchWidth: 3,
  hatchStep: 12,
  outline: "#1f1a24",
  outlineWidth: 2,
  pivotRadius: 4,
  pivotFill: "#ffffff",
} as const;

/** Розмір текстури заглушки, пікселі: `size · STUB_RES`, але не більше за `STUB_MAX_PX` по більшій стороні. */
export function stubPixels(size: ArtSize): ArtSize {
  const k = Math.min(STUB_RES, STUB_MAX_PX / Math.max(size.w, size.h));
  return { w: Math.max(1, Math.round(size.w * k)), h: Math.max(1, Math.round(size.h * k)) };
}

/** Похилі лінії штриховки «/» на полотні `w × h` з кроком `step`: від верхнього краю до нижнього (за край їх обріже полотно). */
export function stubHatch(w: number, h: number, step: number): { x0: number; y0: number; x1: number; y1: number }[] {
  const lines: { x0: number; y0: number; x1: number; y1: number }[] = [];
  for (let c = step / 2; c < w + h; c += step) lines.push({ x0: c, y0: 0, x1: c - h, y1: h });
  return lines;
}

/** Заглушка як SVG в одиницях арту (viewBox `0 0 w h`): для конвеєра, що растеризує її так само, як справжній SVG. */
export function stubSvg(geometry: ArtGeometry): string {
  const { size, pivot } = geometry;
  const look = STUB_LOOK;
  const n = (v: number): string => String(Math.round(v * 100) / 100);
  const hatch = stubHatch(size.w, size.h, look.hatchStep)
    .map((l) => `M${n(l.x0)} ${n(l.y0)}L${n(l.x1)} ${n(l.y1)}`)
    .join("");
  const w = n(size.w);
  const h = n(size.h);
  const inset = n(look.outlineWidth / 2);
  const inner = { w: n(Math.max(0, size.w - look.outlineWidth)), h: n(Math.max(0, size.h - look.outlineWidth)) };
  const outline = `stroke="${look.outline}" stroke-width="${look.outlineWidth}"`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<rect width="${w}" height="${h}" fill="${look.fill}" fill-opacity="${look.fillAlpha}"/>`,
    `<path d="${hatch}" stroke="${look.hatch}" stroke-width="${look.hatchWidth}" fill="none"/>`,
    `<rect x="${inset}" y="${inset}" width="${inner.w}" height="${inner.h}" fill="none" ${outline}/>`,
    `<circle cx="${n(pivot.x)}" cy="${n(pivot.y)}" r="${look.pivotRadius}" fill="${look.pivotFill}" ${outline}/>`,
    `</svg>`,
  ].join("");
}
