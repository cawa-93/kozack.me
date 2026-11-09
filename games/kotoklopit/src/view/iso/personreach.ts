// Чим персонаж нового вигляду дотягується до кота (крок 16, T2): рука, що гладить (долоня ходить по спинці), і вудочка з
// волосінню до пір'їнки, що кружляє над котом (§8.2, §9.12) — як у старому вигляді (до кроку 16), у масштабі
// ізометрії. Рука — та сама частина скелета (`person/arm`), повернута навколо плеча й ледь розтягнута, щоб кисть лягла на
// спинку; вудочка — кадр A5 у руці, обтятий до палички, і пучок пір'я з того самого кадру над котом. Чисті розрахунки без
// Phaser: їх малює `iso/person.ts`, а перевіряє `tests/isopersonreach.test.ts`.

import { LINE_RIG } from "../../../art/palette";
import type { Point } from "../world/part";

/**
 * Пір'їнка над котом: кружляє над головою (точка `head` кота — над нею бабли). Старий вигляд — ±16 × ±8 px над котом
 * ≈ 30 px; дорослий кіт ізометрії ≈ 56 одиниць, тож ×1,6.
 */
export const FEATHER = { swingX: 26, swingY: 13, lift: 20, periodX: 220, periodY: 160 } as const;

/** Де пір'їнка (середина пучка, точка `feather` кадру вудочки) в момент `time` (мс): над головою кота, кружляє. */
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
 * У скільки разів рука, що гладить, може стати довшою чи коротшою, щоб кисть лягла на спинку кота (кадр `person/arm`
 * розтягується вздовж руки). Довша за `max` — рука тягнеться до кота, але не дістає: присідає й нахиляється до нього анімація
 * `pet`. Коротша — рука йде вглиб чи до камери (у ракурсі ¾ вона так і коротшає, як у справах N4b): кіт за персонажем на
 * екрані майже під плечем.
 */
export const REACH_STRETCH = { min: 0.45, max: 1.3 } as const;

/**
 * Ціль ближча за `from` (частка руки від плеча) — рука лише вкорочується в напрямку анімації (напрям до цілі під самим плечем
 * скакав би від кожного руху долоні); далі за `full` — повертається до цілі цілком; між ними — плавно.
 */
export const REACH_TURN = { from: 0.35, full: 0.8 } as const;

/** Як повернути й розтягнути руку від плеча, щоб кисть дістала до цілі: кут повороту (градуси), розтяг і де стане кисть. */
export interface ArmReach {
  turn: number;
  stretch: number;
  palm: Point;
}

const DEG = Math.PI / 180;

/**
 * Рука від плеча `shoulder` з кистю в `hand` (поза анімації) тягнеться до `target`: повертається навколо плеча на `turn`
 * (`REACH_TURN`; `always` — до цілі завжди цілком: дальня рука до другого кота, якого анімація не знає) і видовжується чи
 * вкорочується в межах `REACH_STRETCH`. Усе — в одній системі координат (корінь скелета).
 */
export function reachArm(shoulder: Point, hand: Point, target: Point, always = false): ArmReach {
  const ax = hand.x - shoulder.x;
  const ay = hand.y - shoulder.y;
  const bx = target.x - shoulder.x;
  const by = target.y - shoulder.y;
  const arm = Math.hypot(ax, ay);
  const want = Math.hypot(bx, by);
  if (arm < 1e-6) return { turn: 0, stretch: 1, palm: { x: hand.x, y: hand.y } };
  const d = want / arm;
  let full = (Math.atan2(by, bx) - Math.atan2(ay, ax)) / DEG;
  full -= 360 * Math.round(full / 360);
  const u = always ? 1 : Math.min(1, Math.max(0, (d - REACH_TURN.from) / (REACH_TURN.full - REACH_TURN.from)));
  const turn = full * u * u * (3 - 2 * u);
  const stretch = Math.min(REACH_STRETCH.max, Math.max(REACH_STRETCH.min, d));
  const rad = turn * DEG;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { turn, stretch, palm: { x: shoulder.x + (ax * cos - ay * sin) * stretch, y: shoulder.y + (ax * sin + ay * cos) * stretch } };
}

/** Місце, кут (градуси) і масштаб кадру частини — як `SlotPose` скелета. */
export interface PartPose {
  x: number;
  y: number;
  rot: number;
  sx: number;
  sy: number;
}

/**
 * Поза кадру руки (`slot` — поза слота в анімації), що тягнеться (`reach`): поворот навколо плеча, а розтяг — уздовж тієї
 * осі кадру, що йде вздовж руки (від плеча до кисті `hand`).
 */
export function reachedPose(slot: PartPose, shoulder: Point, hand: Point, reach: ArmReach): PartPose {
  const rad = reach.turn * DEG;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = slot.x - shoulder.x;
  const dy = slot.y - shoulder.y;
  const along = Math.atan2(hand.y - shoulder.y, hand.x - shoulder.x) - slot.rot * DEG;
  const alongX = Math.abs(Math.cos(along)) >= Math.abs(Math.sin(along));
  return {
    x: shoulder.x + dx * cos - dy * sin,
    y: shoulder.y + dx * sin + dy * cos,
    rot: slot.rot + reach.turn,
    sx: slot.sx * (alongX ? reach.stretch : 1),
    sy: slot.sy * (alongX ? 1 : reach.stretch),
  };
}

/**
 * Вудочка під час гри (§8.2) з кадру `item/toy/<якість>` [`hand`] пакета A5: у ньому з кінчика палички звисає мотузка з
 * пір'ям, а в грі пір'їнка кружляє над котом. Тож кадр показано двічі, обтятим (`setCrop`, одиниці кадру): паличка в руці
 * без мотузки й пір'я (`stick`, кінчик — `tip`) і пучок пір'я з вузликом (у дорогої — з дзвоником) над котом — прямокутник
 * навколо точки `feather`, від `feather` угору на `top`. Межі — з малюнка A5 (паличка від хвату вперед-угору до (108, 32),
 * мотузка звисає праворуч від x ≈ 105, пучок ≈ 20 навколо `feather`); окремі стани для гри (лише паличка з точкою `tip`,
 * лише пір'їнка) — пропозиція A5 на хвилю 3. Волосінь — від `tip` до верху пучка.
 */
export const ROD_PLAY = {
  stick: { x: 0, y: 0, w: 105, h: 80 },
  tip: { x: 105, y: 34.7 },
  feather: { left: 14, top: 21, w: 28, h: 31 },
  /** Товщина волосіні. */
  line: LINE_RIG.fine,
} as const;

/** Прямокутник у кадрі, одиниці арту (від лівого верхнього кута полотна). */
export interface UnitRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Пучок пір'я над котом: прямокутник обтинання кадру вудочки навколо його точки `feather` (одиниці полотна). */
export function featherRect(feather: Point): UnitRect {
  const f = ROD_PLAY.feather;
  return { x: feather.x - f.left, y: feather.y - f.top, w: f.w, h: f.h };
}

/** Куди волосінь входить у пучок над котом (`feather` — де на екрані його точка `feather`): верх обтятого пучка. */
export function lineEnd(feather: Point): Point {
  return { x: feather.x, y: feather.y - ROD_PLAY.feather.top };
}

/**
 * Прямокутник обтинання в пікселях текстури (`Image.setCrop`): одиниці арту × роздільність кадру (`px` — ширина полотна
 * кадру в пікселях, `w` — в одиницях; атлас 2, заглушка 1).
 */
export function cropPixels(rect: UnitRect, px: number, w: number): UnitRect {
  const res = w > 0 ? px / w : 1;
  return { x: rect.x * res, y: rect.y * res, w: rect.w * res, h: rect.h * res };
}
