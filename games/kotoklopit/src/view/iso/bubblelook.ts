// Бабли в новому вигляді (крок 16, пакет T3, `GRAPHICS_PLAN.md`): де в бабл лягають іконка, позначка й кількість і скільки
// місця він займає над тим, над ким виринув. Числа — з маніфесту (A12): фон `ui/bubble/say|think` з pivot у вістрі
// хвостика й точкою `icon` — центром поля іконки 64 × 64 (`art/STYLE.md`, «ui — бульбашки»); і як бабли над тим самим і над
// сусідами стають поруч (`layoutBubbles`). Без Phaser.
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
 * Зазор між баблами подій, що стоять поруч (`layoutBubbles`), одиниці світу. Полотна баблів уже мають поле (≥ 4 одиниці арту з
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

/** Бабл не відходить від своєї точки далі, ніж на стільки своїх ширин (`layoutBubbles`): у тісноті він лишається біля власника. */
export const BESIDE_MAX_WIDTHS = 2;

/**
 * Бабл для розстановки (`layoutBubbles`): бабл події чи стану. Розстановка міняє лише `target`; решту бабли переписують
 * щокадру.
 */
export interface LaidBubble {
  /** Над ким (ключ, як у `Bubbles.setState`); без власника (напис «+N ₴») не стає поруч і нікому не заважає. */
  owner: string | undefined;
  icon: string | undefined;
  /** Точка цього кадру (вістря без зсуву, разом із виринанням), одиниці світу. */
  x: number;
  y: number;
  span: BubbleSpan;
  /** Скільки бабл займає над точкою (`IsoBubbleLook.room`): бабли, далі один від одного по вертикалі, не налазять. */
  height: number;
  /** Схований бабл (стану, поки над тим самим висить бабл події) не стає й не заважає. */
  visible: boolean;
  /** Зсув від точки, куди бабл стає (вихід). */
  target: number;
}

/** Видима частина світу по горизонталі, одиниці світу: ряд баблів, чиї точки в ній, не виходить за її край. */
export interface BubbleBounds {
  left: number;
  right: number;
}

const EPS = 1e-6;
/** Скільки разів за кадр зливати ряди, що налазять (у тісноті — не більше). */
const MAX_PASSES = 8;

// Робочі масиви розстановки — ті самі щокадру, щоб не виділяти пам'ять (22 коти): ряд (група) кожного бабла
// (union-find; −1 — не стає), «близнюк» — той самий бабл того самого власника раніше (−1 — немає), зсув і члени ряду.
const parent: number[] = [];
const twin: number[] = [];
const shift: number[] = [];
const members: number[] = [];

function find(i: number): number {
  let r = i;
  while (parent[r] !== r) r = parent[r]!;
  // Стиснути шлях.
  while (parent[i] !== r) {
    const next = parent[i]!;
    parent[i] = r;
    i = next;
  }
  return r;
}

const widthOf = (b: LaidBubble): number => b.span.left + b.span.right;

/**
 * Ставить бабли рядів `a` і `b` (`b` — −1, коли ряд один) в один ряд упритул із зазором `gap`: зліва направо, як їхні точки
 * (над тим самим — за порядком у списку, тобто хто виринув раніше, той лівіше), а сам ряд — так, щоб сума квадратів зсувів була
 * найменша (кожен відходить від своєї точки порівну), і не за краєм `bounds`, якщо точки всіх у ньому. Пише зсуви в `shift`;
 * повертає, чи жоден бабл не відійшов далі за `BESIDE_MAX_WIDTHS` своїх ширин.
 */
function layRow(list: readonly LaidBubble[], count: number, a: number, b: number, gap: number, bounds: BubbleBounds | undefined): boolean {
  let m = 0;
  for (let i = 0; i < count; i++) {
    if (parent[i] === -1) continue;
    const r = find(i);
    if (r !== a && r !== b) continue;
    const key = list[i]!.x;
    let k = m++;
    while (k > 0 && list[members[k - 1]!]!.x > key + EPS) {
      members[k] = members[k - 1]!;
      k--;
    }
    members[k] = i;
  }
  let p = 0;
  let sum = 0;
  let inside = true;
  for (let k = 0; k < m; k++) {
    const o = list[members[k]!]!;
    sum += o.x - o.span.left - p;
    if (bounds && (o.x < bounds.left || o.x > bounds.right)) inside = false;
    p += widthOf(o) + gap;
  }
  const total = p - gap;
  let start = sum / m;
  if (bounds && inside && total <= bounds.right - bounds.left) start = Math.min(Math.max(start, bounds.left), bounds.right - total);
  let ok = true;
  p = 0;
  for (let k = 0; k < m; k++) {
    const i = members[k]!;
    const o = list[i]!;
    const t = start + p - (o.x - o.span.left);
    shift[i] = t;
    if (Math.abs(t) > BESIDE_MAX_WIDTHS * widthOf(o) + EPS) ok = false;
    p += widthOf(o) + gap;
  }
  return ok;
}

/** Чи бабли `i` і `j` (з їхніми зсувами) налазять один на одного: на тій самій висоті й ближче, ніж `gap`, по горизонталі. */
function overlap(list: readonly LaidBubble[], i: number, j: number, gap: number): boolean {
  const a = list[i]!;
  const b = list[j]!;
  if (Math.abs(a.y - b.y) >= Math.max(a.height, b.height)) return false;
  const ax = a.x + shift[i]!;
  const bx = b.x + shift[j]!;
  return ax + a.span.right + gap > bx - b.span.left + EPS && bx + b.span.right + gap > ax - a.span.left + EPS;
}

/**
 * Куди стати баблам (`list[0…count)`; бабли подій — у тому порядку, як виринали, далі бабли стану): кожен — якнайближче до
 * своєї точки, але не на іншому баблі (§11.4; рішення автора 2026-10-30, «Відкрите після рішень», п. 6: «стоять поруч, а
 * не один на одному»). Рахувати щокадру: міняє лише `target`.
 *
 * - Бабли, що налазять один на одного (на тій самій висоті), стають в один ряд упритул із зазором `gap`: зліва направо —
 *   як їхні точки, тож кожен лишається над своїм боком; ряд стоїть посередині між точками — кожен відходить порівну
 *   (коти в протистоянні стоять ніс до носа, і їхні «шипить» лягали один на один — рецензія хвилі 3). Ряд, що налазить на
 *   інший бабл чи ряд, зливається з ним.
 * - Свої бабли (той самий власник) — завжди в одному ряду: два різні над тим самим стоять поруч по обидва боки точки, хто
 *   виринув раніше — ліворуч. Той самий бабл того самого власника (відмова, натиснута кілька разів поспіль; «шипить»
 *   щохвилини) стає туди ж, де попередній такий, а не поруч.
 * - Ряд не виходить за край видимої частини світу (`bounds`), якщо точки всіх у ньому видно: інакше бабл кота біля краю
 *   екрана, відійшовши вбік, ховався б за краєм.
 * - Бабл не відходить далі за `BESIDE_MAX_WIDTHS` своїх ширин: у тісноті (купа котів) ряди не зливаються, і бабл лишається
 *   біля свого власника.
 *
 * Розстановка щокадрова, бо власники ходять, і без пам'яті: зсуви неперервно залежать від точок (ряди зливаються саме тоді,
 * коли бабли торкаються), тож бабли не перескакують, поки коти переступають.
 */
export function layoutBubbles(list: readonly LaidBubble[], count: number, bounds?: BubbleBounds, gap = BESIDE_GAP): void {
  // Хто стає: видимі бабли з власником; близнюк іде за тим, хто виринув раніше.
  for (let i = 0; i < count; i++) {
    const b = list[i]!;
    parent[i] = -1;
    twin[i] = -1;
    shift[i] = 0;
    if (b.owner === undefined || !b.visible) continue;
    for (let j = 0; j < i && twin[i] === -1; j++) {
      const o = list[j]!;
      if (parent[j] !== -1 && o.owner === b.owner && o.icon === b.icon) twin[i] = j;
    }
    if (twin[i] !== -1) continue;
    parent[i] = i;
    // Свої — в одному ряду.
    for (let j = 0; j < i; j++) {
      if (parent[j] !== -1 && list[j]!.owner === b.owner) {
        parent[i] = find(j);
        break;
      }
    }
  }
  for (let i = 0; i < count; i++) if (parent[i] === i) layRow(list, count, i, -1, gap, bounds);
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let merged = false;
    for (let i = 0; i < count; i++) {
      if (parent[i] === -1) continue;
      for (let j = i + 1; j < count; j++) {
        if (parent[j] === -1) continue;
        const a = find(i);
        const b = find(j);
        if (a === b || !overlap(list, i, j, gap)) continue;
        if (layRow(list, count, a, b, gap, bounds)) {
          parent[b] = a;
          merged = true;
        } else {
          // Тіснота: кожен ряд — як був.
          layRow(list, count, a, -1, gap, bounds);
          layRow(list, count, b, -1, gap, bounds);
        }
      }
    }
    if (!merged) break;
  }
  for (let i = 0; i < count; i++) {
    const b = list[i]!;
    b.target = parent[i] !== -1 ? shift[i]! : twin[i] !== -1 ? shift[twin[i]!]! : 0;
  }
}
