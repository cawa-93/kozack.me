// Де видно персонажа нового вигляду й куди він дивиться (крок 16, T2): сим знає лише точку тіла (`body`) і напрям руху, а
// вигляд садить персонажа за стіл і комп'ютер, ставить перед річчю, якою він користується, і кладе біля ліжка — за даними
// `world/objects.ts` (`IsoObjectLook.use`: де персонаж стоїть чи сидить і куди дивиться). За справою з котом, лотком чи
// безладом — лицем до них. Плавний перехід між точкою тіла й місцем справи — `glideOffset`. Без Phaser.
//
// Перевіряє `tests/isopersonspot.test.ts`.

import { itemPoint, OBJECTS } from "../../sim/home";
import type { GameState, Vec } from "../../sim/types";
import type { PersonAnimId } from "../anim/ids";
import { isoObjectLook, type IsoUse } from "../world/objects";

/** Де видно персонажа: точка підлоги в клітинках і куди дивиться (напрям у клітинках; null — як каже `personAnim`). */
export interface PersonSpot {
  readonly at: Vec;
  readonly face: Vec | null;
  /** Персонаж сидить чи стоїть за справою біля речі (`IsoUse.pose`); null — не біля речі. */
  readonly pose: IsoUse["pose"] | null;
}

/** Ближче за це (клітинки) до цілі — напрям до неї не рахується (ціль під ногами). */
const MIN_FACE = 0.05;

const OBJECT_IDS: ReadonlySet<string> = new Set(OBJECTS.map((o) => o.id));

/** Місце біля речі квартири `id`, якщо персонаж нею користується (`IsoObjectLook.use`). */
function useOf(id: string): PersonSpot | null {
  if (!OBJECT_IDS.has(id)) return null;
  const use = isoObjectLook(id).use;
  return use ? { at: use.at, face: use.facing, pose: use.pose } : null;
}

/** Лицем до точки `to` з точки тіла. */
function toward(from: Vec, to: Vec | null): Vec | null {
  if (!to) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.hypot(dx, dy) < MIN_FACE ? null : { x: dx, y: dy };
}

/**
 * Де видно персонажа, що грає анімацію `anim` (`personAnim`): засинає в ліжку — біля ліжка; працює й лагодить дріт — за
 * комп'ютером; їсть — за столом; купає кота й пилососить — перед душем і шафою з пилососом; чистить лоток, прибирає безлад,
 * гладить чи грається з котом — там, де стоїть, лицем до цілі. Інакше — точка тіла, напрям — за рухом.
 */
export function personSpot(state: GameState, anim: PersonAnimId): PersonSpot {
  const { body, activity } = state.character;
  const here: PersonSpot = { at: { x: body.x, y: body.y }, face: null, pose: null };
  if (anim === "fallAsleep") return useOf("bed") ?? here;
  if (activity?.kind === "work") return useOf("computer") ?? here;
  if (activity?.kind === "use") {
    const target = activity.target;
    const object = useOf(target);
    if (object) return object;
    const [kind, raw] = target.split(":");
    const id = Number(raw);
    if (kind === "item") {
      const item = state.home.items.find((i) => i.id === id);
      return { ...here, face: toward(body, item ? itemPoint(item) : null) };
    }
    if (kind === "mess") {
      const mess = state.home.messes.find((m) => m.id === id);
      return { ...here, face: toward(body, mess ?? null) };
    }
    return here;
  }
  if ((activity?.kind === "pet" || activity?.kind === "play") && (anim === "pet" || anim === "rod")) {
    const cat = state.cats.find((c) => c.id === activity.cat);
    return { ...here, face: toward(body, cat ?? null) };
  }
  return here;
}

/** Як швидко вигляд переходить до місця справи й назад: частка відстані за секунду (експонента). */
export const GLIDE_RATE = 12;
/** Далі за це (клітинки) — не перехід, а переставляння (сценарій, нова гра): одразу. */
export const GLIDE_JUMP = 3;

/**
 * Зсув вигляду від точки тіла до місця справи (`offset` → `target`, клітинки) за `seconds`: плавно, експонентою. Зсув, а не
 * точка: без справи він згасає до нуля, тож персонаж, що йде, не відстає від тіла. Повертає новий зсув.
 */
export function glideOffset(offset: Vec, target: Vec, seconds: number): Vec {
  const dx = target.x - offset.x;
  const dy = target.y - offset.y;
  const gap = Math.hypot(dx, dy);
  if (gap > GLIDE_JUMP || seconds >= 1) return { x: target.x, y: target.y };
  if (gap < 1e-3) return { x: target.x, y: target.y };
  const k = 1 - Math.exp(-GLIDE_RATE * Math.max(0, seconds));
  return { x: offset.x + dx * k, y: offset.y + dy * k };
}
