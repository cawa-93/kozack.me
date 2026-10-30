// Масштаб камери квартири (§8.4) — чиста частина `viewport.ts`, без Phaser, щоб її можна було перевіряти в Node.
//
// Зум — більший із двох: той, за якого видно всю квартиру, і той, за якого клітинка підлоги не нижча за мінімум у пікселях
// CSS (дрібніше на телефоні не розгледіти). Якщо за мінімуму квартира не вміщується, камера стежить за персонажем.

import type { Projection } from "./world/projection";

/** Полотно для екрана 16:9; на екрані іншої форми воно ширшає чи вищає (Phaser.Scale.EXPAND). */
export const BASE_WIDTH = 1280;
export const BASE_HEIGHT = 720;

/** Висота смуги інтерфейсу вгорі, без безпечної зони. */
export const HUD_HEIGHT = 76;

/**
 * Найменша висота клітинки підлоги на екрані, px CSS (§8.4). Коса проєкція старого вигляду — 44 (чернетка §8.4, як і
 * було). В ізометрії клітинка — ромб висотою 64 одиниці арту, а дорослий кіт — ≈ 56 одиниць: за 46 px CSS ромба кіт ≈ 40 px
 * CSS заввишки на телефоні 844 × 390 (§9.4).
 *
 * За 46 px квартиру на десктопі видно цілою лише за висоти області від ≈ 1000 px CSS, а на 1600 × 900 камера стежить, як на
 * телефоні. Так і задумано (§8.4 [Змінено пізніше], рішення автора 2026-10-30): квартира не мусить уміщуватися цілою й на
 * десктопі — мінімум головніший.
 */
export const MIN_TILE_CSS: Readonly<Record<Projection["kind"], number>> = { oblique: 44, iso: 46 };

/** Де камера показує квартиру. */
export interface ZoomView {
  /** Ширина й висота області квартири (під панеллю й безпечною зоною), px полотна Phaser. */
  width: number;
  height: number;
  /**
   * Скільки пікселів полотна в пікселі CSS по вертикалі (`scale.displayScale.y`). Щільність пікселів екрана (DPR) сюди
   * не входить: полотно Phaser рахується в пікселях CSS (`Phaser.Scale.EXPAND`).
   */
  cssScale: number;
}

/** Масштаб камери: усю квартиру видно, якщо клітинка при цьому не дрібніша за мінімум; інакше — мінімум. */
export function cameraZoom(view: ZoomView, projection: Pick<Projection, "kind" | "world" | "tile">): number {
  const bounds = projection.world;
  const fit = Math.min(view.width / bounds.width, view.height / bounds.height);
  const readable = (MIN_TILE_CSS[projection.kind] * view.cssScale) / projection.tile.height;
  return Math.max(fit, readable);
}

/** Квартиру видно цілою (камері немає за ким стежити), а не лише її частину навколо персонажа. */
export function fitsWhole(view: ZoomView, projection: Pick<Projection, "kind" | "world" | "tile">): boolean {
  const zoom = cameraZoom(view, projection);
  return projection.world.width * zoom <= view.width + 1e-9 && projection.world.height * zoom <= view.height + 1e-9;
}
