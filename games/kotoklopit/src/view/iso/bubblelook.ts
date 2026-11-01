// Бабли в новому вигляді (крок 16, пакет T3, `GRAPHICS_PLAN.md`): де в бабл лягають іконка, позначка й кількість і скільки
// місця він займає над тим, над ким виринув. Числа — з маніфесту (A12): фон `ui/bubble/say|think` з pivot у вістрі
// хвостика й точкою `icon` — центром поля іконки 64 × 64 (`art/STYLE.md`, «ui — бульбашки»); і як два бабли над тим самим
// стають поруч (`besideDx`). Без Phaser.
//
// Одиниці — одиниці арту світу (1 одиниця = 1 px світу ізометрії, ≈ 0,72 px CSS на телефоні й більшості десктопів). Увесь
// бабл зменшено в `ISO_BUBBLE_SCALE` разів — так він на екрані такий самий, як старий (мовна хмаринка ≈ 46 px CSS на
// телефоні, іконка ≈ 35 px), а не більший за кота: див. коментар до сталої.

import type { ArtPoint } from "../art/types";
import { bubbleArt, type BubbleKind, type Mark } from "../iconnames";
import { uiEntry } from "./uilook";

/**
 * Масштаб бабла в світі. Фон ≈ 90 одиниць (думка ≈ 105 × 114) і іконка 64 намальовані з запасом під контур 6; без
 * зменшення мовна хмаринка на телефоні була б ≈ 62 px CSS (старий вигляд — ≈ 46) і більша за дорослого кота (≈ 40 px),
 * а думка займала б чверть висоти екрана 844 × 390. З 0,75 бабли на екрані такі самі, як у старому вигляді, а іконка —
 * 48 одиниць ≈ 35 px CSS (STYLE перевіряє іконки в 24, 32 і 64 px).
 */
export const ISO_BUBBLE_SCALE = 0.75;

/** Полотно іконки й позначки в атласі, одиниці арту (`ICON` маніфесту: 64 × 64, pivot — центр). */
export const ICON_ART_SIZE = 64;

/**
 * Кількість у баблі (`EventBubble.count`): темна заокруглена плашка з паперовою обвідкою — у правому верхньому куті іконки
 * (з позначкою — у лівому, `countSide`).
 */
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
/**
 * Запас над верхом бабла до панелі, одиниці світу. Чорнильний край смуги панелі лежить у межах панелі (`HUD_BAND`), тож
 * камера квартири починається одразу під ним і запасу вистачає невеликого.
 */
const MARGIN = 2;

/** Скільки бабл займає ліворуч і праворуч від своєї точки (вістря), одиниці світу. */
export interface BubbleSpan {
  left: number;
  right: number;
}

/**
 * Зазор між баблами подій, що стоять поруч (`besideDx`), одиниці світу. Полотна баблів уже мають поле (≥ 4 одиниці арту з
 * кожного боку, `art/STYLE.md` §2), тож між контурами видно ще й його.
 */
export const BESIDE_GAP = 2;

/** Як бабл виду `kind` лежить у світі. */
export interface IsoBubbleLook {
  /** Масштаб усього бабла (фон, іконка, позначка, кількість). */
  scale: number;
  /** Центр іконки (і позначки) від вістря, одиниці фону (до `scale`). */
  icon: ArtPoint;
  /** Сторона іконки, одиниці фону (до `scale`). */
  iconSize: number;
  /** Центр плашки кількості в правому куті від вістря, одиниці фону (до `scale`); довге число росте праворуч. */
  count: ArtPoint;
  /** Полотно фону ліворуч і праворуч від вістря, одиниці світу (вістря думки — не посередині: кружечки збоку). */
  span: BubbleSpan;
  /**
   * Скільки місця над точкою бабла займає сам бабл разом із виринанням, одиниці світу (для `DayScene.belowHud`): верх
   * фону чи плашки кількості, що вища (у мовній хмаринці плашка стирчить над фоном).
   */
  room: number;
}

/** Розміщення бабла за записом маніфесту `ui/bubble/<kind>`. */
export function isoBubbleLook(kind: BubbleKind): IsoBubbleLook {
  const { pivot, size, points } = uiEntry(bubbleArt(kind));
  const center = points?.["icon"];
  if (!center) throw new Error(`немає точки icon у «${bubbleArt(kind)}»`);
  const icon = { x: center.x - pivot.x, y: center.y - pivot.y };
  // Кількість — у правому верхньому куті поля іконки, на 6 одиниць усередину, як у старому вигляді (16 з 20 від центру).
  const corner = ICON_ART_SIZE / 2 - 6;
  const count = { x: icon.x + corner, y: icon.y - corner };
  const scale = ISO_BUBBLE_SCALE;
  const countTop = -(count.y - BUBBLE_COUNT.height / 2 - BUBBLE_COUNT.outline / 2);
  return {
    scale,
    icon,
    iconSize: ICON_ART_SIZE,
    count,
    span: { left: pivot.x * scale, right: (size.w - pivot.x) * scale },
    room: Math.ceil(Math.max(pivot.y, countTop) * scale) + RISE + MARGIN,
  };
}

/** Ширина плашки кількості за шириною тексту, одиниці фону: не вужча за висоту (кружечок для однієї цифри). */
export function countPillWidth(textWidth: number): number {
  return Math.max(BUBBLE_COUNT.height, textWidth + BUBBLE_COUNT.pad);
}

/** Бік іконки, де стоїть плашка кількості: 1 — правий верхній кут, −1 — лівий (дзеркально). */
export type CountSide = 1 | -1;

/**
 * Де плашка кількості, коли в баблі є позначка `mark`. Позначки A12 займають правий верхній кут іконки (бейдж «?» і «✓» —
 * коло r 12,5 з центром (45,2, 18,8) на полотні 64 у паперовому кільці; мазок «ні» туди ж і виходить), тож плашка з позначкою стає в лівий
 * верхній кут — інакше цифра закрила б позначку. Лівий верхній кут вільний і від мазка «ні»: той іде з лівого нижнього.
 */
export function countSide(mark: Mark | undefined): CountSide {
  return mark === undefined ? 1 : -1;
}

/**
 * Центр плашки кількості завширшки `width` (одиниці фону) з боку `side`: довге число росте назовні від кута іконки, а не на
 * неї.
 */
export function countPillCenter(look: IsoBubbleLook, width: number, side: CountSide = 1): ArtPoint {
  const corner = look.count.x - look.icon.x;
  return { x: look.icon.x + side * (corner + (width - BUBBLE_COUNT.height) / 2), y: look.count.y };
}

/**
 * Скільки займає бабл із плашкою кількості завширшки `pill` (одиниці фону; без кількості — `undefined`) з боку `side`,
 * одиниці світу.
 */
export function bubbleSpan(look: IsoBubbleLook, pill?: number, side: CountSide = 1): BubbleSpan {
  if (pill === undefined) return look.span;
  const center = countPillCenter(look, pill, side).x;
  const half = pill / 2 + BUBBLE_COUNT.outline / 2;
  return { left: Math.max(look.span.left, -(center - half) * look.scale), right: Math.max(look.span.right, (center + half) * look.scale) };
}

/**
 * Зсув нового бабла події від точки, коли над тим самим уже висять інші (`taken`: зсув і скільки кожен займає): найближче до
 * точки місце, де він не налазить ні на кого, — спершу праворуч, потім ліворуч (§11.4; рішення автора 2026-10-30,
 * «Відкрите після рішень», п. 6: «стоять поруч, а не один на одному»). Місця-кандидати — сама точка й упритул до кожного
 * зайнятого з обох боків із зазором `gap`; крайній праворуч підходить завжди.
 *
 * Однакові бабли (`left` = `right` = половина кроку, `gap` 0) стають у ряд із кроком: 0, +крок, −крок, +2 кроки… — так
 * розставляє старий вигляд.
 */
export function besideDx(taken: readonly { dx: number; span: BubbleSpan }[], span: BubbleSpan, gap: number): number {
  const eps = 1e-6;
  const fits = (dx: number): boolean =>
    taken.every((t) => dx - span.left >= t.dx + t.span.right + gap - eps || dx + span.right + gap <= t.dx - t.span.left + eps);
  const candidates = [0, ...taken.flatMap((t) => [t.dx + t.span.right + gap + span.left, t.dx - t.span.left - gap - span.right])];
  // Ближче до точки — раніше; на однаковій відстані — спершу праворуч.
  candidates.sort((a, b) => Math.abs(a) - Math.abs(b) || b - a);
  return candidates.find(fits) ?? 0;
}
