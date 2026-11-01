// Панель і сенсорне керування в новому вигляді (крок 16, пакет T3, `GRAPHICS_PLAN.md`): які кадри атласу (A13, `ui/hud/*` і
// `ui/touch/*`, полотна в пікселях полотна гри 1280 × 720) і як смуга панелі тягнеться вшир. Без Phaser.
//
// Розклад панелі (де годинник, шкали, гроші, телефон) — той самий, що в старому вигляді (`hud.ts`): змінюється лише
// вигляд, тож на телефоні нічого не з'їжджає й не ховається під виріз камери.

import { PALETTE } from "../../../art/palette";
import type { StatName } from "../../sim/types";
import type { ArtId, ArtSize } from "../art/types";
import { hex } from "./uilook";

/** Кадри панелі (`a13-ui.ts`) і їхні стани. */
export const HUD_ART = {
  /**
   * Смуга панелі: темний папір із чорнильним краєм унизу (полотно 256 × 80; куди лягає — `HUD_BAND`, `bandRect`); кути з
   * боків (`points.slice` запису) не тягнуться, решта — на всю ширину екрана (`stretchSlices`).
   */
  band: "ui/hud/band",
  /** Паперовий кружечок під іконкою показника на темній панелі (і під іконкою запасу на телефоні). */
  stat: "ui/hud/stat",
  /** Рамка шкали показника; заливку малює код. */
  bar: "ui/hud/bar",
  /** Кнопка телефону: `idle` і `hint` (запас уперше закінчився). */
  phone: "ui/hud/phone",
  /** Кнопка повного екрана: `enter` і `exit`. */
  fullscreen: "ui/hud/fullscreen",
} as const satisfies Record<string, ArtId>;

/** Стани кадрів панелі й сенсорних кнопок, якими користується код (перевіряє `tests/isohud.test.ts`). */
export const HUD_STATES = {
  phone: { idle: "idle", hint: "hint" },
  fullscreen: { enter: "enter", exit: "exit" },
  action: { idle: "idle", held: "held" },
  dash: { ready: "ready", cooldown: "cooldown" },
} as const;

/** Кадри сенсорного керування (`a13-ui.ts`). */
export const TOUCH_ART = {
  /** Основа джойстика (радіус 70) під лівим пальцем. */
  base: "ui/touch/stick-base",
  /** Ручка джойстика (радіус 30). */
  knob: "ui/touch/stick-knob",
  /** Кнопка дії (радіус 66): `idle` і `held`. */
  action: "ui/touch/action",
  /** Кнопка ривка (радіус 46): `ready` і `cooldown`. */
  dash: "ui/touch/dash",
} as const satisfies Record<string, ArtId>;

/**
 * Поле полотна кадрів панелі A13, одиниці кадру: намальоване починається за стільки від краю (`art/STYLE.md` §2 — щонайменше
 * 4; A13 — 4,6). Код кладе кадр так, щоб на місце лягла намальована частина, а не полотно.
 */
export const HUD_ART_MARGIN = 4.6;

/**
 * Смуга панелі `ui/hud/band`. A13 малює її непрозорою, без контуру зверху; поле полотна зверху — за екраном. Низ
 * чорнильного краю (`edge`, одиниці кадру: хвиля 62,6–66,6 і лінія 5) — на межі панелі, звідки починається камера квартири:
 * край не закриває ні бабли, ні речі під панеллю, на світ лягає лише м'яка тінь під ним. З боків край заокруглено вгору
 * (x 4,6–13), і на екрані ці загини стирчали чорнильними рисками біля країв — тож за екран винесено й їх: `side` —
 * звідки край рівний. Прозорість — як у старому вигляді.
 */
export const HUD_BAND = { edge: 69, side: 13, alpha: 0.92 } as const;

/**
 * Шкала показника: рамка `ui/hud/bar` (A13 — дев'ять частин, середина прозора) — на місці старої шкали (116 × 12), але
 * лівий край на `shift` правіше (між кружечком показника й рамкою — проміжок) і вища: `height` — висота намальованої рамки,
 * px панелі. На полотні 120 × 20 намальована рамка — 10,8 заввишки з просвітом 4,8: на телефоні це ≈ 2,6 px CSS, тож рамку
 * збільшено (просвіт ≈ 7). Заливку код малює під рамкою з відступом `inset` від її зовнішнього краю — край заливки ховає
 * чорнильне кільце (≈ 3,8 px).
 */
export const HUD_BAR = { shift: 2, height: 16, inset: 2 } as const;

/**
 * Кружечок показника `ui/hud/stat` — у стільки разів більший за іконку на ньому. У кадрі A13 (36) коло займає ≈ 0,74
 * полотна, а папір у кільці — ≈ 0,57, тоді як малюнок іконки — до 0,875 її полотна (поле 4 з 64). З 1,55 іконка лягає в
 * папір, а кільце завбільшки як у старому вигляді (r ≈ 17 під іконкою 28).
 */
export const HUD_STAT_PER_ICON = 1.55;

/**
 * Сенсорні кнопки: A13 малює їх непрозорими (папір із чорнильним контуром), а прозорість задає код — як у старому вигляді,
 * квартиру під пальцем має бути видно. Кнопка, яку тиснуть чи яка готова, — щільніша; основа джойстика — ледь помітна.
 */
export const TOUCH_ALPHA = {
  base: 0.35,
  knob: 0.6,
  action: { idle: 0.55, held: 0.85 },
  dash: { ready: 0.55, cooldown: 0.35 },
} as const;

/** Кольори шкал показників — з палітри арту: здоров'я червоне, ситість помаранчева, гігієна синя, глузд сливовий. */
export const STAT_FILL: Readonly<Record<StatName, number>> = {
  health: hex(PALETTE.red),
  satiety: hex(PALETTE.orange),
  hygiene: hex(PALETTE.blueHi),
  sanity: hex(PALETTE.plumHi),
};

/** Блимання показника нижче межі (§11.4): паперовим. */
export const STAT_BLINK = hex(PALETTE.paper);

/** Прямокутник на екрані, px полотна гри. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Намальована частина полотна кадру: межі від його лівого верхнього кута, одиниці кадру. */
export interface Drawn {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Намальоване на полотні `frame` — усе, крім поля `HUD_ART_MARGIN` з кожного боку. */
export function drawnInside(frame: ArtSize, margin = HUD_ART_MARGIN): Drawn {
  return { left: margin, top: margin, right: frame.w - margin, bottom: frame.h - margin };
}

/**
 * Куди покласти полотно кадру `frame` («три частини», `StretchArt`), щоб його намальована частина `drawn` лягла рівно на
 * `target`: масштаб — за висотою (кути не сплющуються), ширину добирає розтягнута середина.
 */
export function stretchRect(target: Rect, frame: ArtSize, drawn: Drawn): Rect {
  const k = target.h / (drawn.bottom - drawn.top);
  return {
    x: target.x - drawn.left * k,
    y: target.y - drawn.top * k,
    w: target.w + (drawn.left + frame.w - drawn.right) * k,
    h: frame.h * k,
  };
}

/** Смуга панелі завширшки `width` і заввишки `height` (з безпечною зоною), px: де її полотно (`HUD_BAND`). */
export function bandRect(frame: ArtSize, width: number, height: number): Rect {
  const drawn = { left: HUD_BAND.side, top: HUD_ART_MARGIN, right: frame.w - HUD_BAND.side, bottom: HUD_BAND.edge };
  return stretchRect({ x: 0, y: 0, w: width, h: height }, frame, drawn);
}

/** Шкала нового вигляду на місці старої `old`: полотно рамки `frame` і заливка під нею (`HUD_BAR`), px панелі. */
export function isoBarRects(old: Rect, frame: ArtSize): { frame: Rect; fill: Rect } {
  const outer = { x: old.x + HUD_BAR.shift, y: old.y + old.h / 2 - HUD_BAR.height / 2, w: old.w - HUD_BAR.shift, h: HUD_BAR.height };
  const inset = HUD_BAR.inset;
  return {
    frame: stretchRect(outer, frame, drawnInside(frame)),
    fill: { x: outer.x + inset, y: outer.y + inset, w: outer.w - 2 * inset, h: outer.h - 2 * inset },
  };
}

/** Шматок кадру, розтягнутий по ширині: звідки (`src`, `srcW`) і куди (`x`, `w`) уздовж горизонталі, одиниці кадру. */
export interface StretchSlice {
  src: number;
  srcW: number;
  x: number;
  w: number;
}

/**
 * «Три частини» кадру шириною `frameW` на ширину `width`: лівий і правий кути по `cap` — у масштабі `capScale` (той самий,
 * що й по висоті, — кути не сплющуються), середина — розтягнута. Вужча за два кути смуга — самі кути, стиснуті навпіл.
 * Порожніх шматків немає.
 */
export function stretchSlices(frameW: number, cap: number, width: number, capScale = 1): StretchSlice[] {
  const side = Math.min(cap * capScale, width / 2);
  const middle = width - 2 * side;
  const slices: StretchSlice[] = [{ src: 0, srcW: cap, x: 0, w: side }];
  if (middle > 0) slices.push({ src: cap, srcW: frameW - 2 * cap, x: side, w: middle });
  slices.push({ src: frameW - cap, srcW: cap, x: width - side, w: side });
  return slices.filter((s) => s.w > 0 && s.srcW > 0);
}
