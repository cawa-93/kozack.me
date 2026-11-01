// Масштаб камери квартири (§8.4) — чиста частина `viewport.ts`, без Phaser, щоб її можна було перевіряти в Node.
//
// Зум — більший із двох: той, за якого видно всю квартиру, і той, за якого клітинка підлоги не нижча за мінімум у пікселях
// CSS (дрібніше на телефоні не розгледіти). Якщо за мінімуму квартира не вміщується, камера стежить за персонажем.

import type { Vec } from "../sim/types";
import type { Projection } from "./world/projection";

/**
 * Одиниці інтерфейсу: екран 16:9 — 1280 × 720 одиниць, на екрані іншої форми область ширшає чи вищає (як
 * `Phaser.Scale.EXPAND`). У них розкладено панель, сенсорні кнопки, картки гонки (`Frame`); полотно ж має пікселі
 * пристрою (`canvasFit`), а камера інтерфейсу масштабує одиниці в них.
 */
export const BASE_WIDTH = 1280;
export const BASE_HEIGHT = 720;

/** Висота смуги інтерфейсу вгорі, без безпечної зони. */
export const HUD_HEIGHT = 76;

/**
 * Найменша висота клітинки підлоги на екрані, px CSS (§8.4). Клітинка — ромб висотою 64 одиниці арту, а дорослий кіт —
 * ≈ 56 одиниць: за 46 px CSS ромба кіт ≈ 40 px CSS заввишки на телефоні 844 × 390 (§9.4).
 *
 * За 46 px квартиру на десктопі видно цілою лише за висоти області від ≈ 1000 px CSS, а на 1600 × 900 камера стежить, як на
 * телефоні. Так і задумано (§8.4 [Змінено пізніше], рішення автора 2026-10-30): квартира не мусить уміщуватися цілою й на
 * десктопі — мінімум головніший.
 */
export const MIN_TILE_CSS = 46;

/** Де камера показує квартиру. */
export interface ZoomView {
  /** Ширина й висота області квартири (під панеллю й безпечною зоною), px полотна Phaser. */
  width: number;
  height: number;
  /** Скільки пікселів полотна в пікселі CSS (`CanvasFit.density`). */
  cssScale: number;
}

/**
 * Найбільша щільність полотна, px полотна на px CSS. Телефони мають DPR до 3–3,5, а атлас — 2 пікселі на одиницю арту: за
 * мінімального зуму (46 px CSS на ромб 64 одиниці) це 0,72 одиниці на px CSS, тож за щільності 2,5 атлас іще не
 * збільшується (≈ 1,1 текселя на піксель), а полотно на телефоні 844 × 390 — ≈ 2 Мпікс замість 3 за DPR 3.
 */
export const MAX_DENSITY = 2.5;

/**
 * Найбільше пікселів полотна: великий монітор із дробовим DPR (4K за DPR 1,5 — 8,3 Мпікс) малює трохи грубіше за
 * пікселі пристрою, ніж заливати кожен кадр. 6 Мпікс уміщують 2880 × 1800 (ноутбук 1440 × 900 за DPR 2).
 */
export const MAX_CANVAS_PIXELS = 6_000_000;

/** Полотно гри для екрана: розмір, щільність і масштаб інтерфейсу. */
export interface CanvasFit {
  /** Розмір гри (полотна), px полотна. */
  width: number;
  height: number;
  /** Скільки px полотна в px CSS. */
  density: number;
  /** Скільки одиниць інтерфейсу (`BASE_WIDTH × BASE_HEIGHT`, що ширшає чи вищає) в px CSS. */
  unit: number;
  /** Скільки px полотна в одиниці інтерфейсу — зум камер інтерфейсу: `density / unit`. */
  ui: number;
}

/**
 * Полотно гри в пікселях пристрою (DPR, не більше `MAX_DENSITY` і `MAX_CANVAS_PIXELS`), щоб браузер не розтягував його й
 * контури та текст не розмивалися: раніше полотно завжди мало ≈ 720 px заввишки (`Phaser.Scale.EXPAND`), і на телефоні
 * 844 × 390 за DPR 3 браузер розтягував його в 1,6 раза, на моніторі 2560 × 1440 — удвічі.
 *
 * Не менше за одиниці інтерфейсу: на малому вікні з DPR 1 полотно, як і раніше, більше за екран (браузер зменшує його —
 * згладжування), а не дрібніше. Програмний WebGL (`software`: SwiftShader знімків, комп'ютери без прискорення) малює
 * кожен піксель процесором — там полотно саме таке, як було (`ui` = 1), і знімки не змінюються.
 *
 * `css` — розмір теки гри в px CSS; нульовий (тека ще не має розміру) — як вікно 1280 × 720.
 */
export function canvasFit(css: { width: number; height: number }, dpr: number, software: boolean): CanvasFit {
  const w = css.width > 0 ? css.width : BASE_WIDTH;
  const h = css.height > 0 ? css.height : BASE_HEIGHT;
  const unit = Math.max(BASE_WIDTH / w, BASE_HEIGHT / h);
  if (software || !(dpr > 0)) return { width: w * unit, height: h * unit, density: unit, unit, ui: 1 };
  const density = Math.max(unit, Math.min(dpr, MAX_DENSITY, Math.sqrt(MAX_CANVAS_PIXELS / (w * h))));
  // Ціла кількість пікселів: дробову браузер розтягнув би на частку пікселя, і все полотно трохи розмилося б.
  const width = Math.round(w * density);
  const height = Math.round(h * density);
  return { width, height, density: height / h, unit, ui: height / h / unit };
}

/** Масштаб камери: усю квартиру видно, якщо клітинка при цьому не дрібніша за мінімум; інакше — мінімум. */
export function cameraZoom(view: ZoomView, projection: Pick<Projection, "world" | "tile">): number {
  const bounds = projection.world;
  const fit = Math.min(view.width / bounds.width, view.height / bounds.height);
  const readable = (MIN_TILE_CSS * view.cssScale) / projection.tile.height;
  return Math.max(fit, readable);
}

/**
 * На скільки одиниць арту над ногами персонажа точка, яку камера тримає посередині (§8.4): середина тулуба (персонаж ≈ 140
 * заввишки). На телефоні 844 × 390 під ногами тоді ≈ 140 px CSS квартири (кіт біля ніг, меблі попереду), а голова з
 * баблом лишаються видимими — ≈ 110 px CSS під панеллю. Камера йшла за якорем бабла над головою (з пози скелета): ноги
 * стояли за 60–80 px від нижнього краю, а квартира гойдалася з кожним кроком і їхала вниз, коли персонаж сідав.
 */
export const FOLLOW_LIFT = 50;

/**
 * Куди дивиться камера: ноги персонажа за симуляцією (`character.body`, без анімації — камера не гойдається з кроком і не
 * сідає разом з ним) на `FOLLOW_LIFT` вище. Пише в `out` (щокадру — без нових об'єктів) і повертає його.
 */
export function followTarget(projection: Pick<Projection, "toScreen">, body: Vec, out: Vec): Vec {
  const feet = projection.toScreen(body);
  out.x = feet.x;
  out.y = feet.y - FOLLOW_LIFT;
  return out;
}

/** Квартиру видно цілою (камері немає за ким стежити), а не лише її частину навколо персонажа. */
export function fitsWhole(view: ZoomView, projection: Pick<Projection, "world" | "tile">): boolean {
  const zoom = cameraZoom(view, projection);
  return projection.world.width * zoom <= view.width + 1e-9 && projection.world.height * zoom <= view.height + 1e-9;
}
