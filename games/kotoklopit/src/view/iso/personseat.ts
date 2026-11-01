// Стільці, на які сідає персонаж (крок 16, хвиля 3, пакет «Стики персонажа»): офісне крісло до стола з комп'ютером і
// кухонний стілець до стола (`art/env/chair-*.svg`, маніфест `a15-seats.ts`). Сим про стільці не знає — це лише вигляд:
// персонаж працює й їсть сидячи (`work`, `meeting`, `eat` — N4b: таз на висоті `PERSON_SEAT`) у `use.at` стола
// (`world/objects.ts`), і стілець стоїть саме там, під тазом. Стілець — меблі: він у квартирі завжди; поки за столом ніхто
// не сидить, він засунутий до стола (`tucked`), щоб не стояти на дорозі тому, хто підходить до стола (пошук роботи — стоячи
// за стільцем) і котам; персонаж сідає — стілець висунутий (`pulled`); лагодить дріт, сівши на підлогу під столом, —
// крісло відкочене вбік (`aside`), щоб не стояти на ногах.
//
// Глибина: кадр стільця — два шматки (стани запису): сидіння (з ніжками й хрестовиною) — за тим, хто сидить, спинка — перед
// ним (сидять спиною до камери, обличчям до стола). Кожен шматок — точка в реєстрі глибини (`iso/depth.ts`) на своєму краю
// стільця (`SEAT_DEPTH`), тож той, хто сидить (точка в `use.at`), між ними, а коти й персонаж поруч — як із будь-якою
// річчю на підлозі. Без Phaser: перевіряє `tests/isopersonseat.test.ts`.

import type { GameState, Vec } from "../../sim/types";
import type { ArtId } from "../art/types";
import { isoObjectLook, type IsoUse } from "../world/objects";

/** Стілець: id, кадр, стіл, до якого він стоїть, і куди відкочується, коли під столом лагодять дріт. */
export interface Seat {
  readonly id: string;
  readonly art: ArtId;
  /** Річ квартири, за якою сидять (`use` у `world/objects.ts`, поза `sit`). */
  readonly object: string;
  /** Зсув від місця, де сидять, коли стілець відкочено вбік (клітинки); null — стілець не відкочується. */
  readonly aside: Vec | null;
}

export const SEATS: readonly Seat[] = [
  // Крісло на колесах: лагодячи дріт, персонаж сидить на підлозі під столом — крісло відкочене праворуч (на екрані — униз
  // праворуч) і трохи назад.
  { id: "chair-desk", art: "env/chair-desk", object: "computer", aside: { x: 0.62, y: 0.12 } },
  { id: "chair-kitchen", art: "env/chair-kitchen", object: "table", aside: null },
];

/** Де стілець: засунутий до стола, висунутий (на ньому сидять) чи відкочений убік. */
export type SeatMode = "tucked" | "pulled" | "aside";

/** На скільки клітинок засунутий стілець ближче до стола, ніж той, на якому сидять. */
export const SEAT_TUCK = 0.2;

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

/**
 * Де стілець зараз (`state` — стан гри): за комп'ютером працюють чи шукають роботу — висунутий, лагодять дріт — відкочений
 * убік (якщо може); за столом їдять — висунутий; інакше — засунутий. У поїздці персонажа немає — засунутий.
 */
export function seatMode(state: GameState, seat: Seat): SeatMode {
  const activity = state.character.activity;
  if (state.trip !== null || !activity) return "tucked";
  if (seat.object === "computer") {
    if (activity.kind === "work") return "pulled";
    if (activity.kind === "use" && activity.target === "computer") return seat.aside ? "aside" : "tucked";
    return "tucked";
  }
  if (activity.kind === "use" && activity.target === seat.object && activity.bath !== true) return "pulled";
  return "tucked";
}

/** Центр стільця (точка підлоги під серединою сидіння, клітинки) у положенні `mode`; пише в `out`. */
export function seatAt(seat: Seat, mode: SeatMode, out: Vec = { x: 0, y: 0 }): Vec {
  const { at, facing } = useOf(seat.object);
  const tuck = mode === "tucked" ? SEAT_TUCK : 0;
  const side = mode === "aside" ? seat.aside : null;
  out.x = at.x + facing.x * tuck + (side?.x ?? 0);
  out.y = at.y + facing.y * tuck + (side?.y ?? 0);
  return out;
}

/** Точка реєстру глибини шматка `part` стільця з центром `center` (клітинки); пише в `out`. */
export function seatDepthPoint(seat: Seat, center: Vec, part: keyof typeof SEAT_DEPTH, out: Vec = { x: 0, y: 0 }): Vec {
  const { facing } = useOf(seat.object);
  // Уздовж напрямку «від стола» (протилежного `use.facing`).
  out.x = center.x - facing.x * SEAT_DEPTH[part];
  out.y = center.y - facing.y * SEAT_DEPTH[part];
  return out;
}
