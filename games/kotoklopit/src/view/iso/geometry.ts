// Геометрія ізометричної квартири й підлоги (крок 16, F3b) — чисті розрахунки без Phaser: де стає кадр речі, де на ній
// точка кріплення з маніфесту, де бабл, чи стіна закриває персонажа (тоді вона згасає) і контур підсвітки. Перевіряє
// `tests/isoworld.test.ts`.

import type { Rect } from "../../sim/home";
import type { Vec } from "../../sim/types";
import { artEntry } from "../art/manifest";
import type { ArtId } from "../art/types";
import type { IsoBox } from "../world/isoorder";
import { isoObjectLook } from "../world/objects";
import type { Point } from "../world/part";
import { ISO, ISO_TILE } from "../world/projection";

/** Пів ширини й пів висоти ромба плитки: на стільки зсувається екран з кожною клітинкою x − y і x + y. */
const HALF_W = ISO_TILE.width / 2;
const HALF_H = ISO_TILE.height / 2;

/** Наскільки над найвищою точкою речі її бабл, одиниці арту (як у старому вигляді — 4 px над верхньою гранню). */
export const ANCHOR_GAP = 6;

/** Точка підлоги під центром сліду речі (контракт pivot меблів: `toScreen(x + w/2, y + h/2)`). */
export function footprintCenter(r: Rect): Vec {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Де на екрані кадр речі квартири: pivot — точка підлоги під центром сліду. */
export function objectScreen(r: Rect): Point {
  return ISO.toScreen(footprintCenter(r));
}

/**
 * Точка кріплення `name` запису `id` (маніфест: «полиця», «екран», «dish») — зсув від pivot, одиниці арту (= px світу);
 * немає такого запису чи точки — null.
 */
export function artOffset(id: ArtId, name: string): Point | null {
  const entry = artEntry(id);
  const point = entry?.points?.[name];
  if (!entry || !point) return null;
  return { x: point.x - entry.pivot.x, y: point.y - entry.pivot.y };
}

/** Точка над річчю квартири для бабла й позначок (§11.4): над найвищою точкою, зі зсувом бабла (`IsoObjectLook.bubble`). */
export function objectAnchorAt(object: Rect & { id: string }): Point {
  const look = isoObjectLook(object.id);
  const p = objectScreen(object);
  return { x: p.x + look.bubble.x, y: p.y - look.tall - ANCHOR_GAP + look.bubble.y };
}

/** Точка над річчю на підлозі заввишки `height` у точці `p` (клітинки). */
export function floorAnchorAt(p: Vec, height: number): Point {
  const s = ISO.toScreen(p);
  return { x: s.x, y: s.y - height - ANCHOR_GAP };
}

/** Фігура, яку може закрити стіна: висота й півширина малюнка на екрані, одиниці арту. */
export interface Figure {
  readonly height: number;
  readonly half: number;
}

/** Персонаж (контракт хвилі 1: ≈ 140 до маківки) з розставленими ліктями. */
export const PERSON_FIGURE: Figure = { height: 140, half: 26 };

/**
 * Чи коробка (стіна чи меблі) заввишки `h` закриває на екрані хоч частину фігури, що стоїть у точці `p` (клітинки) за нею
 * (`isoOrder`: точка перед коробкою, якщо p.x ≥ x1 або p.y ≥ y1). Перед коробкою — ніколи. Лише ті, хто за коробкою й
 * близько: верх стіни на екрані — вище за ноги фігури, низ — нижче за її маківку, і вони на одній горизонталі екрана.
 */
export function boxCovers(box: IsoBox, h: number, p: Vec, figure: Figure): boolean {
  if (p.x >= box.x1 || p.y >= box.y1) return false;
  const u = p.x - p.y;
  const reach = figure.half / HALF_W;
  // Проміжок горизонталі екрана (у клітинках x − y), де і фігура, і коробка.
  const lo = Math.max(u - reach, box.x0 - box.y1);
  const hi = Math.min(u + reach, box.x1 - box.y0);
  if (lo >= hi) return false;
  // Верхній край сліду (найдальший x + y) — V з вершиною в куті (x0, y0), нижній — Λ з вершиною в куті (x1, y1).
  const topCorner = box.x0 - box.y0;
  const bottomCorner = box.x1 - box.y1;
  const nearestTop = Math.min(Math.max(topCorner, lo), hi);
  const nearestBottom = Math.min(Math.max(bottomCorner, lo), hi);
  const back = box.x0 + box.y0 + Math.abs(nearestTop - topCorner);
  const near = box.x1 + box.y1 - Math.abs(nearestBottom - bottomCorner);
  const feet = p.x + p.y;
  // Ноги нижче за верх стіни (на екрані y росте донизу), маківка — вище за її низ.
  return feet * HALF_H > back * HALF_H - h && feet * HALF_H - figure.height < near * HALF_H;
}

/**
 * Коробки глибини відчинених вхідних дверей (`env/door` у стані `open`, `env/door/leaf`, `env/door/post`; двері — клітинки
 * (10–11, 11)). Зачинені двері — одна коробка свого сліду. Відчинені — три, бо прочинене на 72° полотно стоїть у кімнаті:
 * - `body` — поріг і лівий стояк: слід лише до x 11,2, тож хто стоїть у кімнаті праворуч (біля полотна), — не за порогом;
 * - `leaf` — полотно (на підлозі від завіс (11,82; 11,38) до краю (11,29; 9,73)): коробка — смуга посередині його нахилу,
 *   тож кіт праворуч від полотна (≈ (11,8; 10,2), «Втікач» під дверима) — перед ним, а персонаж біля дверей (11; 10,5) — за
 *   ним; поріг — під полотном (полотно перед порогом за x);
 * - `post` — правий стояк (x 11,9–12, y 11–11,65): перед полотном (закриває завіси) і перед усім у кімнаті.
 */
export const DOOR_BOXES = {
  body: { x0: 10, y0: 11, x1: 11.2, y1: 12 },
  leaf: { x0: 11.24, y0: 9.7, x1: 11.5, y1: 11.4 },
  post: { x0: 11.88, y0: 11, x1: 12, y1: 11.66 },
} as const satisfies Record<string, IsoBox>;

/**
 * Передні стінки верхньої коробки купи ящиків (`env/boxes/front`, клітинка (12, 9)): точка реєстру глибини на коробці
 * `boxes` у її передньому куті — серед точок на тій самій коробці вона найближча (x + y), тож лягає над котом, що лежить у
 * верхній коробці (його точка — теж на \`boxes\`, у межах клітинки), а відносно решти — як сама купа. Півширина — полотна купи.
 */
export const BOXES_FRONT = { x: 12.99, y: 9.99, half: 46 } as const;

/**
 * Де видно схованку під диваном (§9.12, «Подарунки й схованки»): шкарпетку й іграшку, загнані під диван (`STASHES.sofa`),
 * вигляд кладе трохи ближче до сидіння й лівіше. Диван стоїть спинкою до камери, і в точці сима (14,4; 9,42) річ лежала
 * цілком за спинкою, а праворуч її ще й закривала шафа з пилососом (перевірка знімками на дивані A4): тут манжет ховається
 * під передній край сидіння, а п'ятка й носок визирають з-за спинки. Лише вигляд — сим річ не переносить.
 */
export const SOFA_PEEK: Vec = { x: 14.05, y: 9.5 };

/** Точка підлоги, де показати річ у схованці `under` (під диваном — `SOFA_PEEK`; під холодильником — як у сима). */
export function stashPoint(at: Vec, under: "sofa" | "fridge" | undefined): Vec {
  return under === "sofa" ? SOFA_PEEK : at;
}

/**
 * Де вигляд ставить кошик білизни (§8.7; у сима — `LAUNDRY_BASKET` (9,5; 1,75)): на 0,17 клітинки лівіше, ближче до душової
 * кабіни. Між кабіною й пральною машиною на екрані немає місця на кошик: у точці сима на нього налазили відчинені дверцята
 * пральної машини (стан `idle`), а тепер дверцята (A3, відчинені на 70°) його не торкаються; праву частину піддона душу,
 * яку кошик закриває, калюжа стану `wet` не займає. Лише вигляд — кіт іде до точки сима.
 */
export const BASKET_AT: Vec = { x: 9.33, y: 1.75 };

/** Кути сліду на підлозі (екран, px світу) — від верхнього за годинниковою стрілкою: верхній, правий, нижній, лівий. */
export function footprintCorners(f: { x0: number; y0: number; x1: number; y1: number }): Point[] {
  return [
    ISO.toScreen({ x: f.x0, y: f.y0 }),
    ISO.toScreen({ x: f.x1, y: f.y0 }),
    ISO.toScreen({ x: f.x1, y: f.y1 }),
    ISO.toScreen({ x: f.x0, y: f.y1 }),
  ];
}
