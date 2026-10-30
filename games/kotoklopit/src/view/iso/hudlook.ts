// Панель і сенсорне керування в новому вигляді (крок 16, пакет T3, `GRAPHICS_PLAN.md`): які кадри атласу (A13, `ui/hud/*` і
// `ui/touch/*`, полотна в пікселях полотна гри 1280 × 720) і як смуга панелі тягнеться вшир. Без Phaser.
//
// Розклад панелі (де годинник, шкали, гроші, телефон) — той самий, що в старому вигляді (`hud.ts`): змінюється лише
// вигляд, тож на телефоні нічого не з'їжджає й не ховається під виріз камери.

import { PALETTE } from "../../../art/palette";
import type { StatName } from "../../sim/types";
import type { ArtId } from "../art/types";
import { hex } from "./uilook";

/** Кадри панелі (`a13-ui.ts`) і їхні стани. */
export const HUD_ART = {
  /**
   * Смуга панелі: темний папір заввишки з панель і чорнильний край під нею (полотно 256 × 80 — 76 і 4); кути з боків
   * (`points.slice` запису) не тягнуться, решта — на всю ширину екрана (`stretchSlices`).
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
 * Шкала показника: рамка `ui/hud/bar` лягає по центру старої шкали (116 × 12), а заливку код малює в рамці з відступом
 * `inset` від краю — під її контуром.
 */
export const HUD_BAR = { inset: 3, radius: 5 } as const;

/** Кольори шкал показників — з палітри арту: здоров'я червоне, ситість помаранчева, гігієна синя, глузд сливовий. */
export const STAT_FILL: Readonly<Record<StatName, number>> = {
  health: hex(PALETTE.red),
  satiety: hex(PALETTE.orange),
  hygiene: hex(PALETTE.blueHi),
  sanity: hex(PALETTE.plumHi),
};

/** Блимання показника нижче межі (§11.4): паперовим. */
export const STAT_BLINK = hex(PALETTE.paper);

/** Шматок кадру, розтягнутий по ширині: звідки (`src`, `srcW`) і куди (`x`, `w`) уздовж горизонталі, одиниці кадру. */
export interface StretchSlice {
  src: number;
  srcW: number;
  x: number;
  w: number;
}

/**
 * «Три частини» кадру шириною `frameW` на ширину `width`: лівий і правий кути по `cap` — без розтягування, середина —
 * розтягнута. Вужча за два кути смуга — самі кути, стиснуті навпіл. Порожніх шматків немає.
 */
export function stretchSlices(frameW: number, cap: number, width: number): StretchSlice[] {
  const side = Math.min(cap, width / 2);
  const middle = width - 2 * side;
  const slices: StretchSlice[] = [{ src: 0, srcW: cap, x: 0, w: side }];
  if (middle > 0) slices.push({ src: cap, srcW: frameW - 2 * cap, x: side, w: middle });
  slices.push({ src: frameW - cap, srcW: cap, x: width - side, w: side });
  return slices.filter((s) => s.w > 0 && s.srcW > 0);
}
