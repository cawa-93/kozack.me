// Геометрія ізометричної квартири й підлоги (крок 16, F3b) — чисті розрахунки без Phaser: де стає кадр речі, де на ній
// точка кріплення з маніфесту, де бабл, чи стіна закриває персонажа, кота, лоток, безлад чи пилосос (тоді вона згасає) і контур
// підсвітки. Перевіряє `tests/isoworld.test.ts`.

import { carriedToy } from "../../sim/catai";
import { HIGH_PLACES, objectAt, slotById, TRINKETS, type Rect } from "../../sim/home";
import type { Cat, GameState, GameThing, TrinketKind, Vec } from "../../sim/types";
import { artEntry } from "../art/manifest";
import type { ArtId } from "../art/types";
import type { IsoBox } from "../world/isoorder";
import { isoCatPerch, isoItemLook, isoObjectLook } from "../world/objects";
import type { Point } from "../world/part";
import { ISO, ISO_TILE } from "../world/projection";
import { shapedStage, stoveArtState } from "./looks";

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

/**
 * Точка над річчю квартири для бабла й позначок (§11.4): над найвищою точкою, зі зсувом бабла (`IsoObjectLook.bubble`), і ще
 * на `lift` вище (`anchorLift`: сковорода на газовому пальнику).
 */
export function objectAnchorAt(object: Rect & { id: string }, lift = 0): Point {
  const look = isoObjectLook(object.id);
  const p = objectScreen(object);
  return { x: p.x + look.bubble.x, y: p.y - look.tall - ANCHOR_GAP + look.bubble.y - lift };
}

/**
 * На скільки газовий пальник дня відключення піднімає сковороду плити (`GAS_LIFT` маніфесту `a02-kitchen.ts`): від точки
 * `pan` (середина сковороди на конфорці) до `pan-gas` (на пальнику) кадру `env/stove`.
 */
export const STOVE_GAS_LIFT = (artOffset("env/stove", "pan")?.y ?? 0) - (artOffset("env/stove", "pan-gas")?.y ?? 0);

/**
 * На скільки бабл і позначки речі вищі за звичайні (`objectAnchorAt`): у день відключення (§4.1, рішення автора 2026-11-02)
 * сковорода плити стоїть на газовому пальнику (`gas-*`, `stoveArtState`) — на `STOVE_GAS_LIFT` вище, і бабл стану плити
 * піднімається разом із нею, щоб не закривати кришку (рішення автора 2026-11-03: «бабл має бути вище»).
 */
export function anchorLift(state: GameState, id: string): number {
  return id === "stove" && stoveArtState(state).startsWith("gas-") ? STOVE_GAS_LIFT : 0;
}

/**
 * Чи річ гри `thing` стоїть не там, де її бачили минулого разу (`seen` — клітинка зсуву, NaN — на своєму місці; §8.7, «Що
 * ставить гра»): так квартира щокадру дешево дізнається, що річ треба переставити. Якщо так — `seen` уже нове.
 */
export function placeChanged(state: Pick<GameState, "home">, thing: GameThing, seen: Vec): boolean {
  const at = state.home.displaced?.[thing];
  const x = at ? at.x : Number.NaN;
  const y = at ? at.y : Number.NaN;
  if (Object.is(x, seen.x) && Object.is(y, seen.y)) return false;
  seen.x = x;
  seen.y = y;
  return true;
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
 * Кіт для згасання стін (`wallsToFade`): тулуб без вух і хвоста — його гравець має бачити, а вушка, що визирають над
 * стіною, кота ще не показують. Півширина — лише середина тулуба.
 */
export const CAT_FIGURE: Figure = { height: 36, half: 18 };

/** Безлад і скинута дрібничка (`wallsToFade`): невисока пляма; стіна згасає, коли закриває її середину. */
export const SPOT_FIGURE: Figure = { height: 10, half: 16 };

/**
 * Яку частину півширини речі на підлозі (`isoItemLook().half` — пів полотна) має зачепити стіна, щоб згаснути: середину
 * малюнка, а не край — лоток у слоті `litter-1` (8, 3) краєм полотна торкається верху стіни ряду 5, але його видно.
 */
const ITEM_CORE = 0.5;

/**
 * Чи коробка (стіна чи меблі) заввишки `h` закриває на екрані хоч частину фігури, що стоїть у точці `p` (клітинки) за нею
 * (`isoOrder`: точка перед коробкою, якщо p.x ≥ x1 або p.y ≥ y1). Перед коробкою — ніколи. Лише ті, хто за коробкою й
 * близько: верх стіни на екрані — вище за ноги фігури, низ — нижче за її маківку, і вони на одній горизонталі екрана.
 * `lift` — на скільки фігура над підлогою (кіт на умивальнику чи на шафі), одиниці арту.
 */
export function boxCovers(box: IsoBox, h: number, p: Vec, figure: Figure, lift = 0): boolean {
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
  const feet = (p.x + p.y) * HALF_H - lift;
  // Ноги нижче за верх стіни (на екрані y росте донизу), маківка — вище за її низ.
  return feet > back * HALF_H - h && feet - figure.height < near * HALF_H;
}

/** Точка підлоги й фігура речі котячого кутка для `wallsToFade` — щоразу ті самі (без щокадрових об'єктів на кожну річ). */
const SPOT: Vec = { x: 0, y: 0 };
const ITEM: { height: number; half: number } = { height: 0, half: 0 };

/** Види дрібничок (`TRINKETS`): скинуті лежать у `home.trinkets` за видом. */
const TRINKET_KINDS: readonly TrinketKind[] = [...new Set(TRINKETS.map((t) => t.kind))];

/**
 * Котрі внутрішні стіни `walls` (заввишки `h`) зараз закривають те, що гравцеві треба бачити, — їх квартира напівпрозоро
 * гасить (`out[i]` — для `walls[i]`). Стіна заввишки 66 при плитці 128 × 64 закриває цілу клітинку за собою: ряд 4 під
 * стінами ряду 5 (туди сим безладу не кладе — `hiddenTile`) і стовпці x = 6 і x = 11 за стінами x = 7 і x = 12 (про них сим
 * не знає: там лотки `litter-3` і `litter-4`, безлад, коти). Тож стіна згасає не лише перед персонажем (як було), а й перед:
 * - котом, що не йде (`act.goal` null: сидить у лотку, спить, їсть, гризе), — тулуб `CAT_FIGURE`, на меблях — на висоті
 *   `perch`; хто лише проходить повз, стіну не блимає;
 * - річчю котячого кутка (лоток, миска, іграшка) — серединою малюнка (`ITEM_CORE`);
 * - безладом і скинутою дрібничкою (`SPOT_FIGURE`);
 * - вертикальним пилососом на підлозі (`home.vacuumAt`, §8.7) — серединою малюнка, як річ котячого кутка: його ставлять
 *   будь-де, зокрема в стовпцях x = 6 і x = 11 і біля проходів під стінами ряду 5, де стіна закривала щітку (рецензія
 *   пилососа 2026-11-02).
 * Жмути шерсті (`FUR_SPOTS`) лежать там, де стіни їх не закривають. Персонаж у душовій кабіні й у поїздці не рахується.
 */
export function wallsToFade(state: GameState, walls: readonly IsoBox[], h: number, out: boolean[]): void {
  out.length = walls.length;
  out.fill(false);
  const { character, home } = state;
  const activity = character.activity;
  const inside = state.trip !== null || (activity?.kind === "use" && activity.inside === true && activity.bath !== true);
  if (!inside) markWalls(walls, h, character.body, PERSON_FIGURE, out);

  const held = character.held?.kind === "cat" ? character.held.cat : null;
  for (const cat of state.cats) {
    if (cat.away !== null || cat.act.goal !== null || cat.act.kind === "lap" || cat.id === held) continue;
    // Висоту меблів, на яких кіт, питаємо лише тоді, коли стіна закриває його на підлозі (це рідко).
    let lift: number | null = null;
    for (let i = 0; i < walls.length; i++) {
      if (out[i] || !boxCovers(walls[i]!, h, cat, CAT_FIGURE)) continue;
      lift ??= catLift(state, cat);
      if (lift === 0 || boxCovers(walls[i]!, h, cat, CAT_FIGURE, lift)) out[i] = true;
    }
  }

  for (const item of home.items) {
    if (item.kind === "toy") {
      // Загнану під диван і ту, що в зубах у кота, малює не підлога.
      if (item.hidden !== undefined || carriedToy(state, item)) continue;
      SPOT.x = item.x;
      SPOT.y = item.y;
    } else {
      const slot = slotById(item.slot);
      SPOT.x = slot.x + 0.5;
      SPOT.y = slot.y + 0.5;
    }
    const look = isoItemLook(item.kind, item.quality);
    ITEM.height = look.height;
    ITEM.half = look.half * ITEM_CORE;
    markWalls(walls, h, SPOT, ITEM, out);
  }
  for (const mess of home.messes) markWalls(walls, h, mess, SPOT_FIGURE, out);
  if (home.vacuumAt) {
    const look = isoItemLook("vacuum");
    ITEM.height = look.height;
    ITEM.half = look.half * ITEM_CORE;
    markWalls(walls, h, home.vacuumAt, ITEM, out);
  }
  const fallen = home.trinkets;
  if (fallen) {
    for (const kind of TRINKET_KINDS) {
      const at = fallen[kind];
      if (at && at.broken !== true) markWalls(walls, h, at, SPOT_FIGURE, out);
    }
  }
}

/** Позначити стіни, що закривають фігуру `figure` у точці `p`. */
function markWalls(walls: readonly IsoBox[], h: number, p: Vec, figure: Figure, out: boolean[]): void {
  for (let i = 0; i < walls.length; i++) if (!out[i] && boxCovers(walls[i]!, h, p, figure)) out[i] = true;
}

/**
 * На якій висоті кіт, що стоїть на клітинці речі квартири (`isoCatPerch`): на підлозі — 0. Хто ховається під річчю (`hide`,
 * не нагорі холодильника чи шафи — `hidesUnder`), той на підлозі під нею, а не на її верху: інакше кіт під умивальником
 * «сидів» на 70 над підлогою, вище за стіну x = 12 (66), і стіна, що закриває тумбу й очі з-під неї, не згасала.
 */
function catLift(state: GameState, cat: Cat): number {
  const object = objectAt(state, Math.floor(cat.x), Math.floor(cat.y));
  if (!object || object.kind === "door") return 0;
  if (cat.act.kind === "hide" && !HIGH_PLACES.includes(object.id)) return 0;
  return isoCatPerch(object.id, cat, false, shapedStage(state, object.id)).lift;
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
 * Де видно схованку під диваном (§9.12, «Схованки»): шкарпетку й іграшку, загнані під диван (`STASHES.sofa`),
 * вигляд кладе трохи ближче до сидіння й лівіше. Диван стоїть спинкою до камери, і в точці сима (14,4; 9,42) річ лежала
 * цілком за спинкою, а праворуч її ще й закривала шафа з пилососом, що до 2026-11-02 стояла на (16, 10) (перевірка знімками
 * на дивані A4): тут манжет ховається під передній край сидіння, а п'ятка й носок визирають з-за спинки. Лише вигляд — сим
 * річ не переносить.
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
