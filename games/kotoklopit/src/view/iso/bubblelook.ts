// Бабли в новому вигляді (крок 16, пакет T3, `GRAPHICS_PLAN.md`): де в бабл лягають іконка, позначка й кількість і скільки
// місця він займає над тим, над ким виринув. Числа — з маніфесту (A12): фон `ui/bubble/say|think` з pivot у вістрі
// хвостика й точкою `icon` — центром поля іконки 64 × 64 (`art/STYLE.md`, «ui — бульбашки»). Без Phaser.
//
// Одиниці — одиниці арту світу (1 одиниця = 1 px світу ізометрії, ≈ 0,72 px CSS на телефоні й більшості десктопів). Увесь
// бабл зменшено в `ISO_BUBBLE_SCALE` разів — так він на екрані такий самий, як старий (мовна хмаринка ≈ 46 px CSS на
// телефоні, іконка ≈ 35 px), а не більший за кота: див. коментар до сталої.

import { artEntry } from "../art/manifest";
import type { ArtPoint } from "../art/types";
import { bubbleArt, type BubbleKind } from "../iconnames";

/**
 * Масштаб бабла в світі. Фон 86 одиниць (думка — 108 × 118) і іконка 64 намальовані з запасом під контур 6; без
 * зменшення мовна хмаринка на телефоні була б ≈ 62 px CSS (старий вигляд — ≈ 46) і більша за дорослого кота (≈ 40 px),
 * а думка займала б чверть висоти екрана 844 × 390. З 0,75 бабли на екрані такі самі, як у старому вигляді, а іконка —
 * 48 одиниць ≈ 35 px CSS (STYLE перевіряє іконки в 24, 32 і 64 px).
 */
export const ISO_BUBBLE_SCALE = 0.75;

/** Полотно іконки й позначки в атласі, одиниці арту (`ICON` маніфесту: 64 × 64, pivot — центр). */
export const ICON_ART_SIZE = 64;

/** Кількість у баблі (`EventBubble.count`): темна заокруглена плашка з паперовою обвідкою — у правому верхньому куті іконки. */
export const BUBBLE_COUNT = {
  /** Висота плашки й відступ тексту з боків, одиниці бабла (до `ISO_BUBBLE_SCALE`). */
  height: 32,
  pad: 16,
  /** Обвідка плашки. */
  outline: 3,
  /** Розмір шрифту, px. */
  font: 24,
} as const;

/** Наскільки вище за вістря бабл події виринає (як у старому вигляді: `y − 8` у `Bubbles.show`). */
const RISE = 8;
/** Запас над верхом бабла до панелі, одиниці світу. */
const MARGIN = 2;

/** Запасні розміри фону, якщо запису в маніфесті немає (A12 їх і задав: pivot — вістря, `icon` — центр поля іконки). */
const FALLBACK: Record<BubbleKind, { pivot: ArtPoint; icon: ArtPoint }> = {
  say: { pivot: { x: 43, y: 80 }, icon: { x: 43, y: 35 } },
  think: { pivot: { x: 51, y: 112 }, icon: { x: 54, y: 40 } },
};

/** Як бабл виду `kind` лежить у світі. */
export interface IsoBubbleLook {
  /** Масштаб усього бабла (фон, іконка, позначка, кількість). */
  scale: number;
  /** Центр іконки (і позначки) від вістря, одиниці фону (до `scale`). */
  icon: ArtPoint;
  /** Сторона іконки, одиниці фону (до `scale`). */
  iconSize: number;
  /** Центр плашки кількості від вістря, одиниці фону (до `scale`); довге число росте праворуч. */
  count: ArtPoint;
  /** Скільки місця над точкою бабла займає сам бабл разом із виринанням, одиниці світу (для `DayScene.belowHud`). */
  room: number;
}

/** Розміщення бабла за записом маніфесту `ui/bubble/<kind>`. */
export function isoBubbleLook(kind: BubbleKind): IsoBubbleLook {
  const entry = artEntry(bubbleArt(kind));
  const pivot = entry?.pivot ?? FALLBACK[kind].pivot;
  const center = entry?.points?.["icon"] ?? FALLBACK[kind].icon;
  const icon = { x: center.x - pivot.x, y: center.y - pivot.y };
  // Кількість — у правому верхньому куті поля іконки, на 6 одиниць усередину, як у старому вигляді (16 з 20 від центру).
  const corner = ICON_ART_SIZE / 2 - 6;
  return {
    scale: ISO_BUBBLE_SCALE,
    icon,
    iconSize: ICON_ART_SIZE,
    count: { x: icon.x + corner, y: icon.y - corner },
    room: Math.ceil(pivot.y * ISO_BUBBLE_SCALE) + RISE + MARGIN,
  };
}

/** Ширина плашки кількості за шириною тексту, одиниці фону: не вужча за висоту (кружечок для однієї цифри). */
export function countPillWidth(textWidth: number): number {
  return Math.max(BUBBLE_COUNT.height, textWidth + BUBBLE_COUNT.pad);
}
