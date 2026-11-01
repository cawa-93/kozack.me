// Де видно персонажа нового вигляду й куди він дивиться (крок 16, T2): сим знає лише точку тіла (`body`) і напрям руху, а
// вигляд садить персонажа за стіл і комп'ютер, ставить перед річчю, якою він користується, і кладе біля ліжка — за даними
// `world/objects.ts` (`IsoObjectLook.use`: де персонаж стоїть чи сидить і куди дивиться). За справою з котом, лотком чи
// безладом — лицем до них. Плавний перехід між точкою тіла й місцем справи — `glideOffset`. Обличчя, коли воно головне
// (засинає, падає без сил: §8.8 «плавно заплющує очі»), видно: ракурс `back` ховає очі (`showFace`, `SLEEP_TURN`). Кота, якого
// купають, видно перед персонажем (`BATH_FACE`). Разові справи біля речі (узяв із холодильника, насипав корм, запустив
// пральку, забрав пакунки) — лицем до неї (`shotPlace`, `shotFace`). Без Phaser.
//
// Перевіряє `tests/isopersonspot.test.ts`.

import { itemPoint, OBJECTS } from "../../sim/home";
import type { GameEvent } from "../../sim/events";
import type { GameState, Vec } from "../../sim/types";
import { PERSON_BY_PROGRESS, type PersonAnimId } from "../anim/ids";
import type { RigFacing } from "../rig/types";
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

/**
 * Купає кота (§9.12, «Купання», рішення автора 2026-10-28: «стоїть біля душу з котом на руках»): біля душу боком до нього
 * (ракурс `front`) — кіт на руках перед персонажем, його видно. Лицем до душу (ракурс `back`) кіт був би за тулубом.
 */
export const BATH_FACE: Vec = { x: 1, y: 0 };

/**
 * Засинаючи в ліжку (§8.8, анімація `fallAsleep` за поступом): до цього поступу персонаж стоїть біля ліжка спиною до нього,
 * лицем до кімнати — позіхає, клює носом і заплющує очі (`EYES.closed` у `personlook.ts` — раніше), а тоді обертається до
 * ліжка й падає на нього (анімація падає вперед). Ліжко в куті під стінами, тож лицем до нього — завжди ракурс `back`.
 */
export const SLEEP_TURN = 0.6;

/** Лицем до точки `to` з точки тіла. */
function toward(from: Vec, to: Vec | null): Vec | null {
  if (!to) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.hypot(dx, dy) < MIN_FACE ? null : { x: dx, y: dy };
}

/**
 * Де видно персонажа, що грає анімацію `anim` (`personAnim`; `progress` — поступ засинання): засинає в ліжку — біля ліжка,
 * спершу лицем до кімнати, з `SLEEP_TURN` — лицем до ліжка; працює й лагодить дріт — за комп'ютером; їсть — за столом; купає
 * кота — біля душу боком (`BATH_FACE`); пилососить — перед шафою з пилососом; чистить лоток, прибирає безлад, гладить чи
 * грається з котом — там, де стоїть, лицем до цілі. Інакше — точка тіла, напрям — за рухом.
 */
export function personSpot(state: GameState, anim: PersonAnimId, progress: number | null = null): PersonSpot {
  const { body, activity } = state.character;
  const here: PersonSpot = { at: { x: body.x, y: body.y }, face: null, pose: null };
  if (anim === "fallAsleep") {
    const bed = useOf("bed");
    if (!bed?.face || (progress ?? 0) >= SLEEP_TURN) return bed ?? here;
    return { ...bed, face: { x: -bed.face.x, y: -bed.face.y } };
  }
  if (activity?.kind === "work") return useOf("computer") ?? here;
  if (activity?.kind === "use") {
    const target = activity.target;
    const object = useOf(target);
    if (object) return anim === "bath" ? { ...object, face: BATH_FACE } : object;
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

/**
 * Ракурс, у якому видно обличчя, коли воно головне: падаючи без сил (`collapse`, `PERSON_BY_PROGRESS`), персонаж заплющує
 * очі (§8.8), а камера наближається до нього — у ракурсі `back` очей не видно (`PERSON_RIG`: слот `eyes` схований), тож
 * тоді `front` з тим самим боком (сідає на підлогу й завалюється на спину — будь-куди). Засинаючи в ліжку, ракурс веде
 * `personSpot` (лицем до кімнати, а потім до ліжка, `SLEEP_TURN`). Решта — як є.
 */
export function showFace(anim: PersonAnimId, facing: RigFacing): RigFacing {
  return facing.view === "back" && anim !== "fallAsleep" && PERSON_BY_PROGRESS.has(anim) ? { view: "front", flip: facing.flip } : facing;
}

/** Як швидко вигляд переходить до місця справи й назад: частка відстані за секунду (експонента). */
export const GLIDE_RATE = 12;
/** Далі за це (клітинки) — не перехід, а переставляння (сценарій, нова гра): одразу. */
export const GLIDE_JUMP = 3;

/**
 * Зсув вигляду від точки тіла до місця справи (`offset` → `target`, клітинки) за `seconds`: плавно, експонентою. Зсув, а не
 * точка: без справи він згасає до нуля, тож персонаж, що йде, не відстає від тіла. Пише новий зсув в `out` (може бути сам
 * `offset`) і повертає його.
 */
export function glideOffset(offset: Vec, target: Vec, seconds: number, out: Vec = { x: 0, y: 0 }): Vec {
  const dx = target.x - offset.x;
  const dy = target.y - offset.y;
  const gap = Math.hypot(dx, dy);
  const k = gap > GLIDE_JUMP || seconds >= 1 || gap < 1e-3 ? 1 : 1 - Math.exp(-GLIDE_RATE * Math.max(0, seconds));
  out.x = k === 1 ? target.x : offset.x + dx * k;
  out.y = k === 1 ? target.y : offset.y + dy * k;
  return out;
}

/** Біля чого разова справа: річ квартири (`id` з `OBJECTS`) чи річ на підлозі (`item:<id>`: миска, годівниця). */
export type ShotPlace = { readonly object: string } | { readonly item: number };

/**
 * Біля чого разова справа від події (`personEventAnim`): узяв і поклав — річ, з якої взяв чи на яку поклав (холодильник,
 * плита, стіл, стільниця, шафка з кормом); викинув — смітник; насипав корм, налив води, спорожнив годівницю — миска чи
 * годівниця; відкрив кран котові й випив ліки — умивальник; пральна машина; розпакував ящики; двері (пакунки, кіт зі сходів,
 * мамині гостинці). null — подія не біля речі (кіт на руках, вкусили, спіткнувся).
 */
export function shotPlace(event: GameEvent): ShotPlace | null {
  switch (event.type) {
    case "took":
    case "put":
      return { object: event.object };
    case "trashed":
      return { object: "trash" };
    case "fed":
    case "watered":
    case "feeder-emptied":
      return { item: event.item };
    case "tap-opened":
    case "person-meds":
      return { object: "sink" };
    case "laundry":
      return event.stage === "started" || event.stage === "hung" || event.stage === "cat" ? { object: "washer" } : null;
    case "unpacked":
      return { object: "boxes" };
    case "received":
      return { object: "door" };
    case "cat-returned":
      return event.caught ? { object: "door" } : null;
    case "modifier":
      return event.kind === "mom-food" && event.value === 0 ? { object: "door" } : null;
    default:
      return null;
  }
}

/**
 * Куди дивиться персонаж, роблячи разову справу біля `place` (напрям у клітинках; null — як каже `personAnim`): до речі
 * квартири — за `use.facing` (`world/objects.ts`: лицем до холодильника, пральки, дверей), якщо річ перед ним у цьому
 * напрямі, інакше (обійшов стіл з іншого боку) — до середини її сліду; до миски чи годівниці — до неї.
 */
export function shotFace(state: GameState, place: ShotPlace): Vec | null {
  const body = state.character.body;
  if ("item" in place) {
    const item = state.home.items.find((i) => i.id === place.item);
    return toward(body, item ? itemPoint(item) : null);
  }
  if (!OBJECT_IDS.has(place.object)) return null;
  const look = isoObjectLook(place.object);
  const box = look.footprint;
  const center = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
  const face = look.use?.facing;
  if (face && (center.x - body.x) * face.x + (center.y - body.y) * face.y > 0) return face;
  return toward(body, center);
}
