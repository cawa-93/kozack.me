// Стільці, на які сідає персонаж (крок 16, хвиля 3, пакет «Стики персонажа»): офісне крісло до стола з комп'ютером і
// кухонний стілець до стола (`art/env/chair-*.svg`, маніфест `a15-seats.ts`). Сим про стільці не знає — це лише вигляд:
// персонаж працює й їсть сидячи (`work`, `meeting`, `eat` — N4b: таз на висоті `PERSON_SEAT`) у `use.at` стола
// (`world/objects.ts`), і стілець стоїть саме там, під тазом. Стілець — меблі: він у квартирі завжди; поки за столом ніхто
// не сидить, він засунутий під стіл (`tucked`): сидіння під стільницею, спинка — впритул до краю стола (обидві спинки вищі за
// стільницю, тож далі не засунеш). Так він не стоїть на дорозі тому, хто підходить до стола чи йде вздовж нього (сим тримає
// тіло персонажа на `BODY_RADIUS` 0,3 від краю), і котам; персонаж сідає — стілець висунутий (`pulled`). Лагодить дріт
// персонаж на підлозі біля обриву, праворуч від стола (`wireFixSpot` у `personspot.ts`), — крісло лишається засунутим.
//
// Глибина: кадр стільця — два шматки (стани запису): сидіння (з ніжками й хрестовиною) — за тим, хто сидить, спинка — перед
// ним (сидять спиною до камери, обличчям до стола). Кожен шматок — точка в реєстрі глибини (`iso/depth.ts`) на своєму краю
// стільця (`SEAT_DEPTH`), тож той, хто сидить (точка в `use.at`), між ними, а коти й персонаж поруч — як із будь-якою
// річчю на підлозі. Засунутий стілець — частина стола (`seatSpot`): сидіння під стільницею — під коробкою стола (стільниця й
// ніжки перед ним), спинка біля краю — на коробці стола (перед ним і всім, що на ньому); з рештою обидва — як сам стіл, тож
// той, хто йде вздовж стола, — перед стільцем, хоч би де стояв ліворуч чи праворуч. Без Phaser: перевіряє
// `tests/isopersonseat.test.ts`.

import type { GameState, Vec } from "../../sim/types";
import type { ArtId } from "../art/types";
import { isoObjectLook, type IsoUse } from "../world/objects";

/** Стілець: id, кадр, стіл, до якого він стоїть, і де його спинка. */
export interface Seat {
  readonly id: string;
  readonly art: ArtId;
  /** Річ квартири, за якою сидять (`use` у `world/objects.ts`, поза `sit`). */
  readonly object: string;
  /**
   * На скільки спинка далі від стола, ніж центр сидіння, на висоті стільниці (клітинки, за малюнком `art/env/<id>.svg`): так
   * глибоко засунутий стілець і заходить під стіл (`seatTuck`).
   */
  readonly back: number;
}

export const SEATS: readonly Seat[] = [
  // Крісло на колесах. Спинка (z 42–75) нахилена назад: низ — на 0,23 від центру сидіння, на висоті стільниці (54) — ≈ 0,24.
  { id: "chair-desk", art: "env/chair-desk", object: "computer", back: 0.24 },
  // Стояки спинки (до 80) — на 0,15 від центру сидіння.
  { id: "chair-kitchen", art: "env/chair-kitchen", object: "table", back: 0.15 },
];

/** Де стілець: засунутий до стола чи висунутий (на ньому сидять). */
export type SeatMode = "tucked" | "pulled";

/** На скільки клітинок спинка засунутого стільця перед краєм стола (щоб не врізалася в стільницю). */
export const SEAT_TUCK_GAP = 0.03;

/**
 * Спинка ближче за це до краю стола (клітинки) — стоїть біля нього: у порядку глибини вона на коробці стола (`seatSpot`).
 * Більше, ніж `SEAT_TUCK_GAP`, і менше, ніж до будь-кого, хто стоїть перед столом (персонаж — на `BODY_RADIUS` 0,3 від краю).
 */
export const SEAT_AT_EDGE = 0.1;

/**
 * Точки реєстру глибини шматків стільця від його центру (клітинки, уздовж напрямку «від стола»): сидіння — трохи ближче до
 * стола за центр (той, хто сидить у центрі, — перед ним), спинка — на задньому краю (перед тим, хто сидить).
 */
export const SEAT_DEPTH = { seat: -0.05, backrest: 0.22 } as const;

/** Де сидять за річчю `object`: `use.at` і напрям до стола (`use.facing`) — дані `world/objects.ts`, без копій. */
function useOf(object: string): IsoUse {
  const use = isoObjectLook(object).use;
  if (!use) throw new Error(`За «${object}» не сидять: немає use`);
  return use;
}

/** Відстань від місця, де сидять (`use.at`), до краю стола — грані його сліду, до якої дивляться (`use.facing`), клітинки. */
export function seatEdge(seat: Seat): number {
  const { at, facing } = useOf(seat.object);
  const f = isoObjectLook(seat.object).footprint;
  if (facing.y < 0) return at.y - f.y1;
  if (facing.y > 0) return f.y0 - at.y;
  if (facing.x < 0) return at.x - f.x1;
  return f.x0 - at.x;
}

/** На скільки клітинок засунутий стілець ближче до стола, ніж висунутий: спинка — на `SEAT_TUCK_GAP` перед краєм стола. */
export function seatTuck(seat: Seat): number {
  return seatEdge(seat) + seat.back - SEAT_TUCK_GAP;
}

/**
 * Де стілець зараз (`state` — стан гри): за комп'ютером працюють чи шукають роботу — висунутий (лагодять дріт — на підлозі
 * біля обриву, крісло засунуте); за столом їдять — висунутий; інакше — засунутий. У поїздці персонажа немає — засунутий.
 */
export function seatMode(state: GameState, seat: Seat): SeatMode {
  const activity = state.character.activity;
  if (state.trip !== null || !activity) return "tucked";
  if (seat.object === "computer") return activity.kind === "work" ? "pulled" : "tucked";
  if (activity.kind === "use" && activity.target === seat.object && activity.bath !== true) return "pulled";
  return "tucked";
}

/** Центр стільця (точка підлоги під серединою сидіння, клітинки) у положенні `mode`; пише в `out`. */
export function seatAt(seat: Seat, mode: SeatMode, out: Vec = { x: 0, y: 0 }): Vec {
  const { at, facing } = useOf(seat.object);
  const tuck = mode === "tucked" ? seatTuck(seat) : 0;
  out.x = at.x + facing.x * tuck;
  out.y = at.y + facing.y * tuck;
  return out;
}

/**
 * Де шматок стільця в реєстрі глибини: точка (клітинки) і стіл, під яким (`under`) чи на якому вона стоїть (`box`; null — на
 * підлозі, як будь-яка річ).
 */
export interface SeatSpot {
  x: number;
  y: number;
  box: string | null;
  under: boolean;
}

/**
 * Куди в реєстрі глибини стає шматок `part` стільця з центром `center` (клітинки); пише в `out`. Точка — на краю стільця
 * (`SEAT_DEPTH`). Сидіння, чия точка під стільницею, — під коробкою стола (`placeUnder`: одразу за ним, стільниця й ніжки
 * перед ним); спинка біля краю стола (`SEAT_AT_EDGE`) — на коробці стола (`place(…, box)`: одразу над ним і над усім, що на
 * ньому). Обидва тоді з рештою — як сам стіл: хто стоїть перед столом, той і перед засунутим стільцем. Висунутий стілець і
 * той, що їде, поки не дістався краю, — на підлозі.
 */
export function seatSpot(seat: Seat, center: Vec, part: keyof typeof SEAT_DEPTH, out: SeatSpot): SeatSpot {
  const { at, facing } = useOf(seat.object);
  // Уздовж напрямку «від стола» (протилежного `use.facing`).
  out.x = center.x - facing.x * SEAT_DEPTH[part];
  out.y = center.y - facing.y * SEAT_DEPTH[part];
  // Наскільки центр стільця перед краєм стола (від'ємне — під стільницею).
  const front = seatEdge(seat) - ((center.x - at.x) * facing.x + (center.y - at.y) * facing.y);
  const table = part === "seat" ? front + SEAT_DEPTH.seat < 0 : front + seat.back <= SEAT_AT_EDGE;
  out.box = table ? seat.object : null;
  out.under = table && part === "seat";
  return out;
}
