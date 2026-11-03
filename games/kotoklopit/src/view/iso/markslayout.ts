// Позначки ізометричного світу (крок 16, T4) — чисті розрахунки без Phaser: що зараз на екрані комп'ютера й де цей екран на
// моніторі, де висять смуги прогресу дії й плити та смужка пошуку роботи, пульс підсвітки цілі (§8.2, §8.6) і дуга, якою
// летять запаси з ящиків (§6.4). Малює це `marks.ts` (і `marksflight.ts`); перевіряє `tests/isomarks.test.ts`.

import { useProgress } from "../../sim/actions";
import { catOnComputer } from "../../sim/catai";
import { BURN_MINUTES, COOK_MINUTES, JOB_SEARCH } from "../../sim/config";
import { objectById, SURFACE_IDS, WIRE_TILE } from "../../sim/home";
import { targetOf, type Target } from "../../sim/targets";
import type { GameState } from "../../sim/types";
import { isWorking, searchProgress } from "../../sim/work";
import { inMeeting } from "../anim/personanim";
import type { BubbleKind } from "../iconnames";
import { isoObjectLook } from "../world/objects";
import type { Point } from "../world/part";
import { ISO, ISO_TILE } from "../world/projection";
import { BUBBLE_BELOW } from "./bubblelook";
import { ANCHOR_GAP, artOffset, objectScreen } from "./geometry";
import { wireFixSpot } from "./personspot";

// --- Підсвітка цілі (§8.2) ---------------------------------------------------------------------------

/**
 * Ціль, яку підсвічують цього кадру: та, з якою персонаж зараз щось зробить (`targetOf`), — лише поки він нічим не зайнятий
 * і гра не стоїть (як у старому вигляді). З пилососом у руках натискання лише ставить його на підлогу (§8.7, «Пилосос у
 * руках»), хоч би що було перед персонажем, — тож і підсвічувати нічого: інакше світився б кіт, що прийшов подивитися.
 */
export function highlightTarget(state: GameState, blocked: boolean): Target | null {
  if (blocked || state.character.activity !== null || state.character.held?.kind === "vacuum") return null;
  return targetOf(state);
}

/** Пульс підсвітки 0,2–0,9 — той самий, що в старому вигляді: частини світу роблять з нього яскравість сяйва чи контуру. */
export function highlightPulse(time: number): number {
  return 0.55 + 0.35 * Math.sin(time / 180);
}

// --- Екран комп'ютера (§8.6) ---------------------------------------------------------------------------

/**
 * Що на екрані: `work` — робота (документ, що пишеться), `meeting` — летучка чи нарада (відеодзвінок), `search` — пошук
 * роботи (вакансії), `keyboard` — кіт сидить на клавіатурі (рядки однієї літери), `off` — нічого (монітор погашений, кадр
 * `env/computer` у стані `off`).
 */
export type ScreenShow = "off" | "work" | "meeting" | "search" | "keyboard";

/**
 * Що зараз на екрані. З перегризеним дротом комп'ютер мертвий до ремонту (§9.12, «Гризіння») — і кіт на клавіатурі його не
 * розбудить. Інакше кіт на клавіатурі — понад усе: він зупиняє роботу (§9.12, «Кіт і робота»), а екран від його лап
 * прокидається й друкує одну літеру. Сплячий на комп'ютері кіт екрана не вмикає. Летучка й нарада дня — те саме правило
 * «зараз дзвінок», що й поза персонажа (`inMeeting`).
 */
export function screenShow(state: GameState): ScreenShow {
  if (state.home.wireChewed === true) return "off";
  if (catOnComputer(state)?.act.kind === "keyboard") return "keyboard";
  if (!isWorking(state)) return "off";
  if (state.job.unemployed) return "search";
  return inMeeting(state) ? "meeting" : "work";
}

/**
 * Крок, з яким змінюється зміст екрана, мс: літера документа й кота (70), кивок мовця (60), гортання вакансій (2,4 с).
 * Між кроками зміст той самий — його не перемальовують.
 */
const SCREEN_STEP: Record<Exclude<ScreenShow, "off">, number> = { work: 70, meeting: 60, search: 2400, keyboard: 70 };

/** Час, за яким малюють зміст екрана: час сцени, округлений до кроку змісту (погашений екран — сталий). */
export function screenTime(show: ScreenShow, time: number): number {
  if (show === "off") return 0;
  const step = SCREEN_STEP[show];
  return Math.floor(time / step) * step;
}

/**
 * Екран на моніторі: площина лицьової грані монітора (y = стала, бо стіл стоїть під стіною ряду 5 і дивиться в кімнату), тож
 * його горизонталь іде вздовж осі x — на екрані гри праворуч-униз, а вертикаль — угору.
 */
export interface ScreenQuad {
  /** Середина екрана (точка `screen` запису `env/computer`), px світу. */
  readonly center: Point;
  /** Півширина: від середини до правого краю вздовж горизонталі монітора, px світу. */
  readonly u: Point;
  /** Піввисота: від середини до верхнього краю, px світу. */
  readonly v: Point;
}

/**
 * Запасний розмір скла, поки в маніфесті немає його кутів: півширина в клітинках уздовж x і піввисота в одиницях арту
 * (монітор — від стільниці 54 до 112, скло ≈ 0,6 клітинки × 32 з серединою на висоті 86); трохи менший за скло.
 */
export const SCREEN_HALF = { cells: 0.27, height: 15 } as const;
/** На стільки зміст відступає від кутів скла: половина чорнильної лінії довкола скла (2,5) лишається видною. */
export const GLASS_INSET = 1.5;
/** Кути скла в маніфесті (`env/computer`, A4): лівий і правий верхні, лівий і правий нижні. */
const GLASS_CORNERS = ["screen-tl", "screen-tr", "screen-bl", "screen-br"] as const;

/**
 * Скло екрана монітора: за кутами `screen-tl`/`-tr`/`-bl`/`-br` запису `env/computer` (зсув від pivot речі), відступивши на
 * `GLASS_INSET`, а поки їх немає — довкола точки `screen` (без неї — над серединою стола на висоті 86) розміру `SCREEN_HALF`.
 */
export function computerScreen(): ScreenQuad {
  const at = objectScreen(objectById("computer"));
  const corners = GLASS_CORNERS.map((name) => artOffset("env/computer", name));
  const [tl, tr, bl, br] = corners;
  if (tl && tr && bl && br) {
    const u = { x: (tr.x - tl.x + br.x - bl.x) / 4, y: (tr.y - tl.y + br.y - bl.y) / 4 };
    const v = { x: (tl.x - bl.x + tr.x - br.x) / 4, y: (tl.y - bl.y + tr.y - br.y) / 4 };
    return {
      center: { x: at.x + (tl.x + tr.x + bl.x + br.x) / 4, y: at.y + (tl.y + tr.y + bl.y + br.y) / 4 },
      u: shorter(u, GLASS_INSET),
      v: shorter(v, GLASS_INSET),
    };
  }
  const offset = artOffset("env/computer", "screen") ?? { x: 0, y: -86 };
  const half = SCREEN_HALF.cells;
  return {
    center: { x: at.x + offset.x, y: at.y + offset.y },
    u: { x: (half * ISO_TILE.width) / 2, y: (half * ISO_TILE.height) / 2 },
    v: { x: 0, y: -SCREEN_HALF.height },
  };
}

/** Той самий вектор, коротший на `by`. */
function shorter(p: Point, by: number): Point {
  const length = Math.hypot(p.x, p.y);
  const k = length > by ? (length - by) / length : 0;
  return { x: p.x * k, y: p.y * k };
}

/**
 * Куток скла, який зміст лишає порожнім: у лівому верхньому куті монітора (A4) приліплена записка, що заходить на скло, —
 * зміст її не закриває (координати екрана: ліворуч від `s`, вище за `t`).
 */
export const NOTE_CORNER = { s: -0.6, t: 0.66 } as const;

/** Точка на екрані за координатами (−1…1 праворуч, −1…1 угору від середини). */
export function onScreen(quad: ScreenQuad, s: number, t: number): Point {
  return { x: quad.center.x + quad.u.x * s + quad.v.x * t, y: quad.center.y + quad.u.y * s + quad.v.y * t };
}

// --- Смуги (§8.2, §8.6, §8.7) --------------------------------------------------------------------------------

/**
 * Смуга прогресу, одиниці арту: ширина й висота заливки, товщина чорнильної рамки (`LINE.inner`). На масштабі гри ≈ 0,72 px
 * CSS на одиницю — ≈ 52 × 10 px, як смуга старого вигляду на телефоні.
 */
export const BAR = { width: 72, height: 10, ink: 3.5 } as const;
/** Смужка пошуку роботи: ширша, з кружечками етапів на межах. */
export const SEARCH_BAR = { width: 132, height: 10, ink: 3.5, stage: 7 } as const;
/** Падаюча тінь смуг: на стільки нижче за саму смугу (світло спереду-згори). */
export const BAR_DROP = 3;
/** Скільки триває червона смужка відмови в пошуку роботи (§8.6), мс. */
export const REJECTION_MS = 1500;

/**
 * Скільки місця над якорем речі займає її бабл нового вигляду, одиниці арту: мовна хмаринка `ui/bubble/say` (A12) у масштабі
 * бабла 0,75 разом із плашкою кількості, виринанням 8 і запасом 2 — T3 рахує це як `isoBubbleLook("say").room` (≈ 77–78).
 * Бабли малюються поверх позначок, тож у цій смузі над якорем позначкам не місце.
 */
export const BUBBLE_ROOM = 78;
/**
 * На стільки бабл події, згасаючи, ще підіймається над своїм місцем (`Bubbles.float` у `bubbles.ts`: −34 за останні 0,5 с):
 * без цього запасу в останні 0,4 с згасання він заходив на смужку пошуку над комп'ютером (знімки хвилі 3).
 */
export const EVENT_RISE = 34;
/** Півширина бабла над річчю (мовна хмаринка 90 у масштабі 0,75 — 34) із запасом: збоку від неї — смужка пошуку, що не влізла угору. */
export const BUBBLE_HALF = 36;
/** Проміжок між смужкою пошуку й зоною бабла комп'ютера та між нею й верхнім краєм видимого світу. */
export const STACK_GAP = 4;
/**
 * На стільки чорнильний верх смуги дії вищий за якір: вістря хвостика бабла стану (воно в якорі) лише торкається рамки, а не
 * заливки, тож бабл не закриває, скільки зроблено.
 */
export const BAR_RISE = 4;

/** Прямокутник смуги на екрані, px світу: x, y — лівий верхній кут заливки. */
export interface BarBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Скільки смуги видно над і під серединою заливки (рамка й тінь), одиниці арту. */
function barReach(size: { height: number; ink: number }): { up: number; down: number } {
  return { up: size.height / 2 + size.ink, down: size.height / 2 + size.ink + BAR_DROP };
}

/** Смужка пошуку: кружечок відмови з рамкою (7 + 2 + 3,5) виступає за смугу з рамкою й тінню. */
const SEARCH_REACH = SEARCH_BAR.stage + 2 + SEARCH_BAR.ink;

/** Скільки смуга займає над і під серединою (для смужки пошуку — з кружечками етапів). */
export function barExtent(box: BarBox, search: boolean): { top: number; bottom: number } {
  const middle = box.y + box.h / 2;
  const reach = search ? { up: SEARCH_REACH, down: SEARCH_REACH } : barReach(BAR);
  return { top: middle - reach.up, bottom: middle + reach.down };
}

/**
 * Смуга дії над річчю (§8.2): по центру якоря, чорнильний верх — на `BAR_RISE` вище за нього. Бабл стану над річчю (вода
 * над душем, брудний лоток, порожня поїлка, пралька — вони висять і під час дії) — над смугою, а смуга лягає на верх речі
 * лише краєм: якір на `ANCHOR_GAP` над найвищою точкою.
 */
export function barBox(anchor: Point): BarBox {
  return { x: anchor.x - BAR.width / 2, y: anchor.y - BAR_RISE + BAR.ink, w: BAR.width, h: BAR.height };
}

/**
 * Над поверхнею (стіл, стільниці кухні) смуга дії висить на стільки вище за якір: якір — одразу над стільницею, а на ній
 * стоять страва й кухоль (до ≈ 22), і смуга лягала на стіл, як ще одна річ на ньому (персонаж їсть за столом, знімки хвилі 3).
 * З цим запасом вона й над головою персонажа, що сидить перед столом спиною до камери, — висить над річчю, як над рештою.
 */
export const SURFACE_CLEAR = 50;

/** Де смуга дії над річчю `target` (якір `anchor`): над поверхнею — вище за те, що на ній стоїть. */
export function actionBarAnchor(target: string, anchor: Point): Point {
  return SURFACE_IDS.includes(target) ? { x: anchor.x, y: anchor.y - SURFACE_CLEAR } : anchor;
}

/**
 * Маківка персонажа, що сидить на підлозі й лагодить дріт (анімація `fix` у ракурсі `back`, місце — `wireFixSpot`), над
 * ногами, одиниці арту: найвища за цикл анімації серед усіх виглядів — ≈ 91,3 у кучерів (`HAIR_STYLES[3]`; решта зачісок —
 * ≈ 89,5): персонаж тягне дріт до себе й трохи випростується. Якір `head` у грі — точка `top` кадру зачіски на скелеті з
 * `PERSON_FIT`, тож рахується за ним, а не за голим скелетом (рецензія пакета «wire», 2026-11-03). Поки голова хитається
 * нижче, бабл персонажа однаково не заходить у заливку (`personBubbleAnchor`).
 */
export const FIX_HEAD = 92;

/** Точка смуги лагодження: дріт і місце персонажа не рухаються — рахується раз. */
let wireBar: Point | null = null;

/**
 * Смуга лагодження перегризеного дроту (§9.12, «Гризіння»; рішення автора 2026-11-03: «прогресбар десь далеко, і гравець
 * його не помічає») — над місцем обриву, де персонаж лагодить дріт, а не над комп'ютером: по центру точки `cut` запису
 * `env/wire` (звідти ж сиплються іскри, `iso/fx.ts`), на висоті бабла персонажа, що сидить біля обриву (`FIX_HEAD`). Як
 * смуга дії над ціллю (`barBox`): персонаж нахилився до дроту, тож його маківка — майже над обривом, і смуга лягає на неї
 * лише краєм, як на верх речі; бабл персонажа (думка) — над смугою, вістрям у її рамку. Бабл перегризеного дроту лишається
 * над комп'ютером — вище й лівіше, смуги не торкається.
 */
export function wireBarAnchor(): Point {
  if (wireBar) return wireBar;
  const wire = ISO.toScreen({ x: WIRE_TILE.x + 0.5, y: WIRE_TILE.y + 0.5 });
  const cut = artOffset("env/wire", "cut") ?? { x: 0, y: 0 };
  const feet = ISO.toScreen(wireFixSpot().at);
  wireBar = { x: wire.x + cut.x, y: feet.y - FIX_HEAD - ANCHOR_GAP };
  return wireBar;
}

/**
 * Якір бабла виду `kind` над персонажем (думка, бабли подій; `head` — точка над маківкою, уже на `ANCHOR_GAP` вище за неї).
 * Поки він лагодить дріт, бабл не опускається нижче за смугу лагодження (`wireBarAnchor`): маківка в анімації `fix` хитається
 * нижче за найвищу точку, під яку поставлено смугу, і вістря бабла заходило в заливку — закривало саме те, скільки зроблено
 * (рецензія пакета «wire», 2026-11-03). Найнижча точка бабла — вістря вголос чи низ найменшого кружечка думки (`BUBBLE_BELOW`)
 * — тоді не нижча за якір смуги: на рамці, як вістря бабла над річчю (`BAR_RISE`). Інакше — сама точка над маківкою.
 */
export function personBubbleAnchor(state: GameState, head: Point, kind: BubbleKind): Point {
  if (actionBar(state)?.target !== "computer") return { x: head.x, y: head.y };
  return { x: head.x, y: Math.min(head.y, wireBarAnchor().y - BUBBLE_BELOW[kind]) };
}

/**
 * Де смуга тривалої дії з ціллю `target` (§8.2): лагодження дроту (утримання біля комп'ютера — інших тривалих дій із ним
 * немає) — над обривом (`wireBarAnchor`); решта — над ціллю (`actionBarAnchor`), якір якої дає `world` (null — ціль зараз
 * не видно, смуги немає).
 */
export function actionBarPoint(target: string, world: { anchor(id: string): Point | null }): Point | null {
  if (target === "computer") return wireBarAnchor();
  const anchor = world.anchor(target);
  return anchor ? actionBarAnchor(target, anchor) : null;
}

/**
 * Смужка пошуку роботи над комп'ютером (§8.6) — над зоною його бабла (`BUBBLE_ROOM` і ще `EVENT_RISE`, куди підіймається
 * бабл події, згасаючи). Бабли комп'ютера висять часто й довго: дріт перегризено (і весь час, поки його лагодять), дзвінок,
 * терпіння, відмова з вакансії, — а малюються поверх позначок, тож під ними смужка втратила б саме те, що мала показати:
 * етап, де вакансія зірвалася. Монітор, записку на ньому й скло вона не закриває. Смуга лагодження дроту — не тут, а над
 * обривом (`wireBarAnchor`), тож смужка стоїть на тому самому місці, лагодять дріт чи ні.
 *
 * `top` — верхній край видимого світу (під панеллю, `Viewport.worldTop`). Коли комп'ютер біля нього (телефон: камера стежить
 * за персонажем за столом), смужка вгорі сховалася б під панель: тоді вона стає ліворуч від бабла (його притискає під панель
 * `DayScene.belowHud`), низом урівень із вістрям бабла, а якщо й так не влазить — опускається, щоб верх був видно.
 */
export function searchBarBox(anchor: Point, top = Number.NEGATIVE_INFINITY): BarBox {
  const above = searchFrom(anchor.x, anchor.y - BUBBLE_ROOM - EVENT_RISE - STACK_GAP);
  if (barExtent(above, true).top >= top + STACK_GAP) return above;
  // Ліворуч від бабла: він сам — не вище за `top + BUBBLE_ROOM` (вістря), смужка — низом урівень із вістрям.
  const x = anchor.x - BUBBLE_HALF - STACK_GAP - SEARCH_BAR.width / 2;
  const side = searchFrom(x, Math.max(anchor.y, top + BUBBLE_ROOM));
  const short = top + STACK_GAP - barExtent(side, true).top;
  return short > 0 ? searchFrom(x, Math.max(anchor.y, top + BUBBLE_ROOM) + short) : side;
}

/** Смужка пошуку над точкою: `x` — середина, `bottom` — низ кружечків етапів. */
function searchFrom(x: number, bottom: number): BarBox {
  const middle = bottom - SEARCH_REACH;
  return { x: x - SEARCH_BAR.width / 2, y: middle - SEARCH_BAR.height / 2, w: SEARCH_BAR.width, h: SEARCH_BAR.height };
}

/**
 * Смуга в площині вертикальної грані речі (смуга плити): заливка — паралелограм, довгі боки йдуть уздовж грані, короткі —
 * вертикально, кінці — заокруглені в площині грані.
 */
export interface FaceBar {
  /** Лівий верхній кут заливки, px світу. */
  readonly origin: Point;
  /** Одиничний вектор уздовж грані (праворуч-униз на екрані). */
  readonly u: Point;
  /** Довжина заливки вздовж грані й висота (вертикально), px світу. */
  readonly length: number;
  readonly height: number;
}

/**
 * Смуга плити: довжина заливки в клітинках уздовж грані (з рамкою й облямівкою — до 0,8 клітинки: не заходить на сусідні
 * шафки), висота й на скільки середина нижча за верх грані — посередині грані заввишки 62 (на дверцятах духовки, як табло
 * таймера). Рамка (`ink`) і світла облямівка довкола неї (`rim`), одиниці арту: темна доріжка в рамці — на кремовій емалі
 * плити, а облямівка відділяє рамку від чорнильних ліній дверцят (рецензія хвилі 3: паперова доріжка зливалася з емаллю, і
 * на телефоні було видно лише пляму заливки).
 */
export const STOVE_BAR = { cells: 0.68, height: 13, drop: 31, ink: 2.5, rim: 1.5 } as const;

/**
 * Смуга плити (§8.7) — намальована на лицьовій грані плити (y = y1 сліду, дивиться в кімнату), у її площині: над плитою
 * висить бабл страви, а сама страва (A2) — на конфорці, тож над плитою смузі місця немає. Як частина плити, смуга лежить у
 * проміжку глибини плити: персонаж, що стоїть перед плитою, її закриває (стан страви однаково видно з бабла), а не носить
 * на грудях, як шкалу здоров'я.
 */
export function stoveFaceBar(stove: { id: string }): FaceBar {
  const look = isoObjectLook(stove.id);
  const f = look.footprint;
  const middle = (f.x0 + f.x1) / 2;
  const left = ISO.toScreen({ x: middle - STOVE_BAR.cells / 2, y: f.y1 });
  const right = ISO.toScreen({ x: middle + STOVE_BAR.cells / 2, y: f.y1 });
  const length = Math.hypot(right.x - left.x, right.y - left.y);
  return {
    origin: { x: left.x, y: left.y - look.top + STOVE_BAR.drop - STOVE_BAR.height / 2 },
    u: { x: (right.x - left.x) / length, y: (right.y - left.y) / length },
    length,
    height: STOVE_BAR.height,
  };
}

/** Точка смуги на грані: `a` — уздовж грані від лівого кінця заливки, `b` — униз від її верху, px світу. */
export function onFace(face: FaceBar, a: number, b: number): Point {
  return { x: face.origin.x + face.u.x * a, y: face.origin.y + face.u.y * a + b };
}

/** Смуга тривалої дії (§8.2): над її ціллю, скільки зроблено (0–1). */
export function actionBar(state: GameState): { target: string; value: number } | null {
  const progress = useProgress(state);
  const activity = state.character.activity;
  if (progress === null || activity?.kind !== "use") return null;
  return { target: activity.target, value: progress };
}

/**
 * Смуга плити (§8.7): поки страва готується — зелена, скільки зварилося; готова — червона, скільки лишилося до «підгоріло».
 * Підгоріла чи порожня — смуги немає.
 */
export function stoveBar(state: GameState): { value: number; danger: boolean } | null {
  const stove = state.home.stove;
  if (!stove.item || stove.item.kind === "burnt") return null;
  const cooking = stove.item.kind === "raw";
  const value = cooking ? stove.minutes / COOK_MINUTES : (stove.minutes - COOK_MINUTES) / (BURN_MINUTES[state.difficulty] - COOK_MINUTES);
  return { value: clamp01(value), danger: !cooking };
}

/** Остання відмова в пошуку роботи: коли (мс сцени) і на якому місці смужки (0–1). */
export interface Rejection {
  at: number;
  end: number;
}

/**
 * Смужка пошуку роботи (§8.6): етапи поточної вакансії; півтори секунди після відмови — червона, до місця, де все
 * скінчилося. Лише для безробітного.
 */
export function searchBar(state: GameState, rejection: Rejection | null, time: number): { value: number; stages: number; rejected: boolean } | null {
  if (!state.job.unemployed) return null;
  const rejected = rejection !== null && time - rejection.at < REJECTION_MS;
  const value = rejected ? rejection.end : searchProgress(state).progress;
  return { value: clamp01(value), stages: JOB_SEARCH.stages, rejected };
}

/** Відмова з вакансії `vacancy` (подія `job-rejected`): смужка червона до кінця k-го етапу (k-та вакансія — k етапів). */
export function rejectionAt(vacancy: number, time: number): Rejection {
  return { at: time, end: vacancy / JOB_SEARCH.stages };
}

/** Кружечок етапу `i` (1…stages): пройдений, де скінчилася відмова, чи ще попереду. */
export function stageMark(value: number, stages: number, i: number, rejected: boolean): "passed" | "failed" | "ahead" {
  const mark = i / stages;
  if (rejected && Math.abs(value - mark) < 1e-6) return "failed";
  return value >= mark - 1e-6 ? "passed" : "ahead";
}

// --- Політ запасів (§6.4, §9.12) ---------------------------------------------------------------------------

/** Політ іконки запасу: розмір іконки (одиниці арту), тривалість (мс) і найменша та найбільша висота дуги. */
export const FLIGHT = { icon: 56, ms: 900, arcMin: 120, arcMax: 260, arcShare: 0.35 } as const;

/**
 * Висота дуги між точками: пропорційна відстані (в ізометрії квартира вдвічі більша за старий вигляд, і стала дуга була б
 * пласкою), але в межах `arcMin…arcMax`.
 */
export function flightArc(from: Point, to: Point): number {
  return Math.min(FLIGHT.arcMax, Math.max(FLIGHT.arcMin, Math.hypot(to.x - from.x, to.y - from.y) * FLIGHT.arcShare));
}

/** Де іконка на частці шляху `t` (0–1): прямо від `from` до `to` і вгору дугою `arc`. */
export function flightPoint(from: Point, to: Point, t: number, arc = flightArc(from, to)): Point {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * arc };
}

/**
 * Масштаб іконки в польоті: вискакує з ящика (0,6 → 1 за першу п'яту шляху) і пірнає у сховище (1 → 0,55 за останню п'яту).
 */
export function flightScale(t: number): number {
  const edge = 0.2;
  if (t < edge) return 0.6 + 0.4 * easeOut(t / edge);
  if (t > 1 - edge) return 1 - 0.45 * easeIn((t - (1 - edge)) / edge);
  return 1;
}

/** Нахил іконки в польоті, радіани: хитається, як кинута річ, і приземляється рівно. */
export function flightTilt(t: number): number {
  return Math.sin(t * Math.PI * 2) * 0.18 * (1 - t);
}

// --- Допоміжне ---------------------------------------------------------------------------------------------

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
const easeIn = (t: number): number => t * t;
