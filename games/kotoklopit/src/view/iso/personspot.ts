// Де видно персонажа нового вигляду й куди він дивиться (крок 16, T2): сим знає лише точку тіла (`body`) і напрям руху, а
// вигляд садить персонажа за стіл і комп'ютер, ставить перед річчю, якою він користується, і кладе біля ліжка — за даними
// `world/objects.ts` (`IsoObjectLook.use`: де персонаж стоїть чи сидить і куди дивиться). За справою з котом, лотком чи
// безладом — лицем до них; кота, якого гладить чи з яким грається, — там, де кота намальовано (`touchFacing`); лагодить
// перегризений дріт — на підлозі біля обриву (`wireFixSpot`). Плавний перехід між точкою тіла й місцем справи —
// `glideOffset`. Обличчя, коли воно головне (засинає, падає без сил: §8.8 «плавно заплющує очі»), видно: ракурс `back` ховає
// очі (`showFace`, `SLEEP_TURN`). Кота, якого купають, видно перед персонажем (`BATH_FACE`). Разові справи біля речі (узяв із
// холодильника, насипав корм, запустив пральку, забрав пакунки) — лицем до неї (`shotPlace`, `shotFace`). Без Phaser.
//
// Перевіряє `tests/isopersonspot.test.ts`.

import { itemPoint, OBJECTS, WIRE_TILE } from "../../sim/home";
import type { GameEvent } from "../../sim/events";
import type { GameState, Vec } from "../../sim/types";
import { PERSON_BY_PROGRESS, type PersonAnimId } from "../anim/ids";
import { isoTileDir } from "../anim/iso";
import type { RigFacing } from "../rig/types";
import { placedObjectLook, type IsoUse } from "../world/objects";
import type { Point } from "../world/part";
import { artOffset } from "./geometry";

/** Де видно персонажа: точка підлоги в клітинках і куди дивиться (напрям у клітинках; null — як каже `personAnim`). */
export interface PersonSpot {
  readonly at: Vec;
  readonly face: Vec | null;
  /** Персонаж сидить чи стоїть за справою біля речі (`IsoUse.pose`); null — не біля речі. */
  readonly pose: IsoUse["pose"] | null;
}

/** Ближче за це (клітинки) до цілі — напрям до неї не рахується (ціль під ногами). */
const MIN_FACE = 0.05;

/**
 * Персонаж, що гладить кота чи грається з ним вудочкою, дивиться на того кота, якого НАМАЛЬОВАНО (`touchFacing`), а не на
 * точку сима: кота під рукою юрба ставить обабіч персонажа (`catCrowds`), хоч сим тримає його в точці персонажа чи трохи
 * нижче, і лицем до точки сима персонаж гладив кота ліворуч від себе рукою за спину (знахідка «Відомі проблеми (після
 * хвилі 3)»). Одиниці арту (= px світу): кіт ближче за `side` по горизонталі — ліво й право як були (кіт під самими ногами);
 * корінь кота помітно вище за ноги (далі за `behind` — кіт за персонажем, на ліжку чи підвіконні) — ракурс `back`, лицем до
 * нього; інакше — `front` (кіт збоку чи перед ним — обличчя й руку видно). Ракурс `back` тримається, поки кіт вище за
 * `behind` − `hysteresis`. Кіт на дивані перед персонажем (сидіння ≈ 34) — корінь ≈ на висоті ніг, тож `front`.
 */
export const TOUCH_FACE = { side: 6, behind: 24, hysteresis: 8 } as const;

/**
 * Куди дивиться персонаж, що гладить кота чи грається з ним вудочкою (`TOUCH_FACE`): `feet` — його ноги на екрані, `cat` —
 * корінь скелета кота на екрані (`CatPoints.root`), `prev` — ракурс минулого кадру.
 */
export function touchFacing(feet: Readonly<Point>, cat: Readonly<Point>, prev: RigFacing | null): RigFacing {
  const dx = cat.x - feet.x;
  const dy = cat.y - feet.y;
  const flip = Math.abs(dx) < TOUCH_FACE.side ? (prev?.flip ?? false) : dx < 0;
  const behind = prev?.view === "back" ? TOUCH_FACE.behind - TOUCH_FACE.hysteresis : TOUCH_FACE.behind;
  return { view: dy < -behind ? "back" : "front", flip };
}

const OBJECT_IDS: ReadonlySet<string> = new Set(OBJECTS.map((o) => o.id));

/** Місце біля речі квартири `id`, якщо персонаж нею користується (`IsoObjectLook.use`), — там, де річ стоїть (§8.7). */
function useOf(state: GameState, id: string): PersonSpot | null {
  if (!OBJECT_IDS.has(id)) return null;
  const use = placedObjectLook(state, id).use;
  return use ? { at: use.at, face: use.facing, pose: use.pose } : null;
}

/**
 * Купає кота (§9.12, «Купання», рішення автора 2026-10-28: «стоїть біля душу з котом на руках»): біля душу боком до нього
 * (ракурс `front`) — кіт на руках перед персонажем, його видно. Лицем до душу (ракурс `back`) кіт був би за тулубом.
 */
export const BATH_FACE: Vec = { x: 1, y: 0 };

/**
 * Засинаючи в ліжку (§8.8, анімація `fallAsleep` за поступом): до цього поступу персонаж стоїть біля ліжка спиною до нього,
 * лицем до кімнати — позіхає, хилить голову й заплющує очі (`EYES.closed` у `personlook.ts` — раніше), а тоді обертається до
 * ліжка й падає на нього (анімація падає вперед). Ліжко в куті під стінами, тож лицем до нього — завжди ракурс `back`.
 */
export const SLEEP_TURN = 0.6;

/**
 * Лагодячи перегризений дріт (`fix`, §9.12 «Гризіння»), персонаж сидить на підлозі біля місця обриву — точки `cut` запису
 * `env/wire` (кадр у центрі клітинки `WIRE_TILE`; звідти ж сиплються іскри, `iso/fx.ts`), — спиною до камери, лицем до
 * дроту, а не посередині стола з комп'ютером (знахідка «Відомі проблеми (після хвилі 3)»). `hands` — де на екрані від ніг
 * (кореня скелета) точка підлоги під кистями анімації `fix` у ракурсі `back` (кисті ≈ (37; −31…−39), ≈ 16 над підлогою, ступні
 * — ≈ (42; −22)): уздовж осі −y сітки, тож обрив — під руками, біля ступень. Одиниці арту.
 */
export const FIX_AT_WIRE = { hands: { x: 36, y: -18 } } as const;

let fixSpot: PersonSpot | null = null;

/** Де сидить і куди дивиться персонаж, що лагодить дріт (`FIX_AT_WIRE`): рахується раз. */
export function wireFixSpot(): PersonSpot {
  if (fixSpot) return fixSpot;
  const cut = artOffset("env/wire", "cut") ?? { x: 0, y: 0 };
  const cutShift = isoTileDir(cut);
  const at = { x: WIRE_TILE.x + 0.5 + cutShift.x, y: WIRE_TILE.y + 0.5 + cutShift.y };
  const hands = isoTileDir(FIX_AT_WIRE.hands);
  fixSpot = { at: { x: at.x - hands.x, y: at.y - hands.y }, face: hands, pose: "sit" };
  return fixSpot;
}

/** Лицем до точки `to` з точки тіла. */
function toward(from: Vec, to: Vec | null): Vec | null {
  if (!to) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.hypot(dx, dy) < MIN_FACE ? null : { x: dx, y: dy };
}

/**
 * Де видно персонажа, що грає анімацію `anim` (`personAnim`; `progress` — поступ засинання): засинає в ліжку — біля ліжка,
 * спершу лицем до кімнати, з `SLEEP_TURN` — лицем до ліжка; працює — за комп'ютером; лагодить дріт — на підлозі біля обриву
 * (`wireFixSpot`); їсть — за столом; купає кота — біля душу боком (`BATH_FACE`); чистить лоток, прибирає безлад, гладить чи
 * грається з котом — там, де стоїть, лицем до цілі. Інакше — точка тіла, напрям — за рухом (з пилососом у руках теж: це не
 * справа біля речі, §8.7).
 */
export function personSpot(state: GameState, anim: PersonAnimId, progress: number | null = null): PersonSpot {
  const { body, activity } = state.character;
  const here: PersonSpot = { at: { x: body.x, y: body.y }, face: null, pose: null };
  if (anim === "fallAsleep") {
    const bed = useOf(state, "bed");
    if (!bed?.face || (progress ?? 0) >= SLEEP_TURN) return bed ?? here;
    return { ...bed, face: { x: -bed.face.x, y: -bed.face.y } };
  }
  if (activity?.kind === "work") return useOf(state, "computer") ?? here;
  if (activity?.kind === "use") {
    const target = activity.target;
    if (target === "computer") return wireFixSpot();
    const object = useOf(state, target);
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
/**
 * Темп переходу до місця справи, поки персонаж засинає (`progress` — поступ, null — не засинає): росте з поступом. Лягти можна
 * за кілька клітинок від місця біля ліжка, а в експоненти найбільший крок — перший: зі сталим темпом нерухома фігура зривалася б
 * з місця. До `SLEEP_TURN` перехід уже майже закінчено.
 */
export function glideRate(progress: number | null): number {
  return progress === null ? GLIDE_RATE : GLIDE_RATE * Math.min(1, progress * 2);
}

/** Далі за це (клітинки) — не перехід, а переставляння (сценарій, нова гра): одразу. */
export const GLIDE_JUMP = 3;

/**
 * Зсув вигляду від точки тіла до місця справи (`offset` → `target`, клітинки) за `seconds`: плавно, експонентою (`rate` —
 * частка відстані за секунду; стілець їде швидше, `SEAT_GLIDE_RATE`). Зсув, а не точка: без справи він згасає до нуля, тож
 * персонаж, що йде, не відстає від тіла. Пише новий зсув в `out` (може бути сам `offset`) і повертає його.
 */
export function glideOffset(offset: Vec, target: Vec, seconds: number, out: Vec = { x: 0, y: 0 }, rate: number = GLIDE_RATE): Vec {
  const dx = target.x - offset.x;
  const dy = target.y - offset.y;
  const gap = Math.hypot(dx, dy);
  const k = gap > GLIDE_JUMP || seconds >= 1 || gap < 1e-3 ? 1 : 1 - Math.exp(-rate * Math.max(0, seconds));
  out.x = k === 1 ? target.x : offset.x + dx * k;
  out.y = k === 1 ? target.y : offset.y + dy * k;
  return out;
}

/** Біля чого разова справа: річ квартири (`id` з `OBJECTS`) чи річ на підлозі (`item:<id>`: миска, годівниця). */
export type ShotPlace = { readonly object: string } | { readonly item: number };

/**
 * Біля чого разова справа від події (`personEventAnim`): узяв і поклав — річ, з якої взяв чи на яку поклав (холодильник,
 * плита, стіл, стільниця, шафка з кормом); викинув — смітник; насипав корм, налив води, спорожнив годівницю — миска чи
 * годівниця; відкрив кран котові, випив ліки й перев'язався — умивальник; пральна машина; розпакував ящики; двері (пакунки, кіт зі сходів,
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
    case "person-dressing":
      return { object: "sink" };
    case "laundry":
      return event.stage === "started" || event.stage === "hung" || event.stage === "cat" ? { object: "washer" } : null;
    case "coffee":
      return event.stage === "ready" ? null : { object: event.object };
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
  const look = placedObjectLook(state, place.object);
  const box = look.footprint;
  const center = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
  const face = look.use?.facing;
  if (face && (center.x - body.x) * face.x + (center.y - body.y) * face.y > 0) return face;
  return toward(body, center);
}
