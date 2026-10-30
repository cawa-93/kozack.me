// Спільне для шелла галереї й вкладок (крок 16): масштаб, щільність пікселів і атлас, які задає шелл, і дрібниці для
// вкладок — підписи й позначки сталого розміру на екрані за будь-якого масштабу. Вкладкам цього файлу не треба (їм досить
// `GalleryContext` з `tab.ts`), але з ним підписи й хрестики в усіх вкладках однакові.

import Phaser from "phaser";

import type { ArtIndex } from "../../view/art/types";

export interface GalleryViewState {
  /** Масштаб: CSS px на одиницю арту (1 одиниця арту = 1 px світу галереї). */
  zoom: number;
  /** Пікселів полотна на CSS px (щільність екрана, не більше 3): камера галереї має масштаб `zoom · dpr`. */
  dpr: number;
  /** `index.json` завантаженого атласу; null — атласу немає, усе малюють заглушки. */
  index: ArtIndex | null;
}

const state: GalleryViewState = { zoom: 1, dpr: 1, index: null };
const listeners = new Set<(view: Readonly<GalleryViewState>) => void>();

/** Масштаб, щільність і атлас галереї зараз. */
export function galleryView(): Readonly<GalleryViewState> {
  return state;
}

/** Підписатися на зміну масштабу (чи атласу); повертає відписку. Одразу не кличеться. */
export function onGalleryView(listener: (view: Readonly<GalleryViewState>) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Для шелла: змінити й повідомити підписників. */
export function setGalleryView(changes: Partial<GalleryViewState>): void {
  Object.assign(state, changes);
  for (const listener of [...listeners]) listener(state);
}

/** Одиниць арту на CSS px: відступ у `n` CSS px — це `n · unit()` одиниць. */
export function unit(): number {
  return 1 / state.zoom;
}

/** Видимий прямокутник світу галереї (одиниці арту) для камери: `worldView` Phaser рахує, наче origin камери — середина. */
export function viewRect(camera: Phaser.Cameras.Scene2D.Camera): { x: number; y: number; w: number; h: number } {
  const ox = camera.width * camera.originX;
  const oy = camera.height * camera.originY;
  // Екран = origin + zoom · (світ − scroll − origin) (Camera.preRender), тож лівий верхній кут екрана — це:
  return {
    x: camera.scrollX + ox - ox / camera.zoomX,
    y: camera.scrollY + oy - oy / camera.zoomY,
    w: camera.width / camera.zoomX,
    h: camera.height / camera.zoomY,
  };
}

// --- Підписи й позначки -----------------------------------------------------------------------

/** Кольори позначок: pivot, точки кріплення, рамка полотна, облямівка, щоб позначку було видно на будь-якому тлі. */
export const MARK_COLORS = {
  pivot: 0x1f1a24,
  point: 0x168a45,
  box: 0x3d6fd6,
  halo: 0xffffff,
  stub: 0xc0158f,
} as const;

export const INK = "#1f1a24";
export const PAPER = "rgba(243, 233, 220, 0.88)";
export const STUB_TEXT = "#b0127f";

export interface LabelStyle {
  /** Розмір шрифту, CSS px; за замовчуванням 11. */
  size?: number;
  color?: string;
  bold?: boolean;
  /** Тло підпису; null — без тла. За замовчуванням — напівпрозорий папір, щоб читалося на будь-якому тлі. */
  background?: string | null;
}

/**
 * Підпис у світі галереї зі сталим розміром на екрані: Text, масштабований на `1 / zoom`, з роздільністю екрана. Лівий
 * верхній кут — у точці (x, y) світу. Масштаб змінився — підпис треба створити знову (вкладка перекладає сітку).
 */
export function addLabel(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Layer,
  x: number,
  y: number,
  text: string,
  style: LabelStyle = {},
): Phaser.GameObjects.Text {
  const background = style.background === undefined ? PAPER : style.background;
  const label = new Phaser.GameObjects.Text(scene, x, y, text, {
    fontFamily: "system-ui, 'Segoe UI', sans-serif",
    fontSize: `${style.size ?? 11}px`,
    fontStyle: style.bold ? "bold" : "normal",
    color: style.color ?? INK,
    ...(background === null ? {} : { backgroundColor: background }),
    padding: { x: 3, y: 1 },
    resolution: state.dpr,
  });
  label.setScale(unit());
  layer.add(label);
  return label;
}

/** Хрестик сталого розміру на екрані (`r` CSS px) з білою облямівкою — pivot чи точка кріплення. */
export function drawCross(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number, r = 6): void {
  const u = unit();
  const d = r * u;
  for (const [width, tone] of [
    [3.5 * u, MARK_COLORS.halo],
    [1.5 * u, color],
  ] as const) {
    g.lineStyle(width, tone, 1);
    g.lineBetween(x - d, y, x + d, y);
    g.lineBetween(x, y - d, x, y + d);
  }
  g.fillStyle(color, 1);
  g.fillCircle(x, y, 1.5 * u);
}

/** Рамка сталої товщини (1 CSS px) — полотно запису. */
export function drawBox(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number): void {
  g.lineStyle(unit(), color, 0.9);
  g.strokeRect(x, y, w, h);
}
