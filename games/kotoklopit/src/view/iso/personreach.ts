// Чим персонаж нового вигляду дотягується до кота (крок 16, T2): рука, що гладить (долоня ходить по спинці), і вудочка з
// волосінню до пір'їнки, що кружляє над котом (§8.2, §9.12) — як у старому вигляді (`legacy/personview.ts`), у масштабі
// ізометрії. Чисті розрахунки без Phaser: їх малює `iso/person.ts`, а перевіряє `tests/isopersonreach.test.ts`.

import { LINE_RIG } from "../../../art/palette";
import type { Point } from "../world/part";

/**
 * Пір'їнка над котом: кружляє над головою (точка `head` кота — над нею бабли). Старий вигляд — ±16 × ±8 px над котом
 * ≈ 30 px; дорослий кіт ізометрії ≈ 56 одиниць, тож ×1,6.
 */
export const FEATHER = { swingX: 26, swingY: 13, lift: 20, periodX: 220, periodY: 160 } as const;

/** Де пір'їнка в момент `time` (мс): над головою кота, кружляє. */
export function featherAt(head: Point, time: number): Point {
  return {
    x: head.x + Math.cos(time / FEATHER.periodX) * FEATHER.swingX,
    y: head.y - FEATHER.lift + Math.sin(time / FEATHER.periodY) * FEATHER.swingY,
  };
}

/** Долоня на спинці кота ходить уздовж спини туди-сюди, не закриваючи морди: ±8 одиниць, як ±5 px старого вигляду. */
export const STROKE = { swing: 8, period: 260 } as const;

/** Де долоня, що гладить, у момент `time` (мс): на спинці кота (`back`). */
export function palmAt(back: Point, time: number): Point {
  return { x: back.x + Math.sin(time / STROKE.period) * STROKE.swing, y: back.y };
}

/**
 * Рука, що гладить, — вигляд частин `person/arm` (рукав-«сосиска» й долоня-«рукавичка», `art/STYLE.md`): ширина рукава,
 * півосі долоні й контур, одиниці арту. Статура множить товщину (`personProportions`: руки тонші чи товщі).
 */
export const PET_ARM = { sleeve: 14, palm: { rx: 7.5, ry: 6 }, ink: LINE_RIG.outer, line: LINE_RIG.fine } as const;

/** Рука від плеча до долоні: де закінчується рукав (манжет) — трохи не доходячи до долоні, щоб її було видно. */
export function armSegment(shoulder: Point, palm: Point): { from: Point; to: Point } {
  const dx = palm.x - shoulder.x;
  const dy = palm.y - shoulder.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return { from: shoulder, to: palm };
  const back = Math.min(length, PET_ARM.palm.rx * 0.8) / length;
  return { from: shoulder, to: { x: palm.x - dx * back, y: palm.y - dy * back } };
}
