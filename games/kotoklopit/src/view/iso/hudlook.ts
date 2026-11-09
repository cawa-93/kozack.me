// Панель і сенсорне керування в новому вигляді (крок 16, пакет T3, `GRAPHICS_PLAN.md`): які кадри атласу (A13, `ui/hud/*` і
// `ui/touch/*`, полотна в пікселях полотна гри 1280 × 720) і як смуга панелі тягнеться вшир. Без Phaser.

import { PALETTE } from "../../../art/palette";
import type { StatName } from "../../sim/types";
import type { ArtId, ArtSize } from "../art/types";
import { hex } from "./uilook";

/** Кадри панелі (`a13-ui.ts`) і їхні стани. */
export const HUD_ART = {
  /**
   * Смуга панелі: темний папір із чорнильним краєм унизу (полотно 256 × 80; куди лягає — `HUD_BAND`, `bandRect`); кути з
   * боків (`points.slice` запису) не тягнуться, решта — на всю ширину екрана (`stretchSlices`).
   */
  band: "ui/hud/band",
  /** Паперовий кружечок під іконкою показника на темній панелі (і під іконкою запасу на телефоні). */
  stat: "ui/hud/stat",
  /** Рамка шкали показника; заливку малює код. */
  bar: "ui/hud/bar",
  /** Настільний годинник: корпус із тьмяними сегментами, точки запису — де стоять цифри й двокрапка. */
  clock: "ui/hud/clock",
  /** Цифра годинника, що світиться: стани `d0`…`d9` і `colon`. */
  clockDigit: "ui/hud/clock-digit",
  /** Відривний календарик: точки запису — де стоять написи. */
  calendar: "ui/hud/calendar",
  /** Гаманець біля грошей: той самий малюнок, що в картках (`👛`). */
  purse: "ui/glyph/purse",
  /** Кнопка телефону: `idle` і `hint` (запас уперше закінчився). */
  phone: "ui/hud/phone",
  /** Кнопка повного екрана: `enter` і `exit`. */
  fullscreen: "ui/hud/fullscreen",
} as const satisfies Record<string, ArtId>;

/** Стани кадрів панелі й сенсорних кнопок, якими користується код (перевіряє `tests/isohud.test.ts`). */
export const HUD_STATES = {
  phone: { idle: "idle", hint: "hint" },
  fullscreen: { enter: "enter", exit: "exit" },
  action: { idle: "idle", held: "held" },
  dash: { ready: "ready", cooldown: "cooldown" },
} as const;

/** Кадри сенсорного керування (`a13-ui.ts`). */
export const TOUCH_ART = {
  /** Основа джойстика (радіус 70) під лівим пальцем. */
  base: "ui/touch/stick-base",
  /** Ручка джойстика (радіус 30). */
  knob: "ui/touch/stick-knob",
  /** Кнопка дії (радіус 66): `idle` і `held`. */
  action: "ui/touch/action",
  /** Кнопка ривка (радіус 46): `ready` і `cooldown`. */
  dash: "ui/touch/dash",
  /** Кнопка перестановки речі (радіус 46): порожній диск під іконкою речі. */
  carry: "ui/touch/carry",
} as const satisfies Record<string, ArtId>;

// Числа, зняті з SVG A13 (`HUD_BAND`, `HUD_BAR_ART`, `HUD_STAT_ART`): у маніфесті їх немає, а код кладе кадри за
// намальованим, не за полотном. Щойно SVG є, `tests/isohud.test.ts` звіряє їх з артом — правка арту не зсуне панель тихо.

/**
 * Смуга панелі `ui/hud/band`, одиниці кадру. A13 малює її непрозорою, без контуру зверху: намальоване починається за `top`
 * від верху полотна (поле), і це поле — за екраном. Низ чорнильного краю (`edge`: хвиля 62,6–66,6 і лінія 5) — на межі
 * панелі, звідки починається камера квартири: край не закриває ні бабли, ні речі під панеллю, на світ лягає лише м'яка тінь
 * під ним. З боків край заокруглено вгору (x 4,6–13), і на екрані ці загини стирчали чорнильними рисками біля країв — тож
 * за екран винесено й їх: `side` — звідки край рівний. Прозорість — як у старому вигляді.
 */
export const HUD_BAND = { top: 4.6, edge: 69, side: 13, alpha: 0.92 } as const;

/**
 * Рамка шкали `ui/hud/bar` (A13, полотно 120 × 20; дев'ять частин, середина прозора), одиниці кадру від краю полотна:
 * намальоване (паперовий обідок — силует на темній смузі) починається за `margin`, чорнильне кільце — за `ink`, просвіт, у
 * якому видно заливку, — за `gap` (з кожного боку). Заливку код малює до середини чорнильного кільця: її край ховає чорнило,
 * а за папір вона не виходить.
 */
export const HUD_BAR_ART = { margin: 4.2, ink: 5.8, gap: 7.8 } as const;

/**
 * Шкала показника на місці старої (116 × 12): лівий край на `shift` правіше (між кружечком показника й рамкою —
 * проміжок), а `height` — висота намальованої рамки, px панелі. У полотні просвіт — лише 4 з 11,6 намальованих: у рідному
 * розмірі це ≈ 2,2 px CSS на телефоні, тож рамку збільшено: просвіт ≈ 7 px (≈ 3,7 px CSS). Шкала (y 16–36) уміщується між
 * верхом панелі й рядком станів (y 44), поруч із кружечком показника.
 */
export const HUD_BAR = { shift: 2, height: 20 } as const;

/**
 * Кружечок показника `ui/hud/stat` (A13, полотно 36), частки полотна: зовнішній край чорнильного кільця (`ink`, ≈ 26,5) і
 * папір у ньому (`paper`, ≈ 20,3: кільце товсте, низ ще товщий). Звіряє з SVG `tests/isohud.test.ts`, щойно він є.
 */
export const HUD_STAT_ART = { ink: 26.5 / 36, paper: 20.3 / 36 } as const;

/** Яку частку полотна іконки займає її малюнок: поле 4…60 з 64 (`art/STYLE.md`, «icon»). */
export const ICON_DRAWN = 56 / 64;

/**
 * Яку частку діаметра паперу кружечка займає малюнок іконки на ньому. Іконка намальована чорнилом для світлого бабла: на
 * темній панелі її читабельною робить папір довкола, тож між контуром іконки й кільцем має лишатися видимий просвіт
 * (≈ 3 px полотна з кожного боку). Більша іконка контуром зливається з чорнильним кільцем, і від паперу лишаються серпики.
 */
export const HUD_STAT_FILL = 0.8;

/** Кружечок показника (чи підказки на телефоні) нового вигляду: сторона полотна кільця й іконки, px полотна гри. */
export interface StatDisc {
  ring: number;
  icon: number;
}

/**
 * Кружечок нового вигляду на місці старого завширшки `outer` (з контуром), px: чорнильне кільце завбільшки як старий
 * кружечок, а іконка — частка `fill` паперу в ньому (типово `HUD_STAT_FILL`). Розклад панелі не змінюється: кружечок не
 * налазить ні на шкалу, ні на рядок станів під ним.
 */
export function statDisc(outer: number, fill: number = HUD_STAT_FILL): StatDisc {
  const ring = Math.round(outer / HUD_STAT_ART.ink);
  return { ring, icon: Math.round((ring * HUD_STAT_ART.paper * fill) / ICON_DRAWN) };
}

/** Точки цифр на корпусі годинника, по порядку в «ГГ:ХХ» (двокрапка — своя, `colon`). */
export const CLOCK_DIGIT_SLOTS = ["d0", "d1", "d2", "d3"] as const;
/** Половина такту двокрапки, мс: раз на секунду, як у справжнього годинника. */
export const CLOCK_BLINK_MS = 500;

/**
 * На скільки календарик вище за середину смуги, одиниці кадру: його обідок (9,2–79,6) довший донизу, ніж корпус годинника
 * (9,4–72,6), і з тим самим центром кадру календарик звисав нижче. Так середини обох обідків — на одній лінії.
 */
export const CALENDAR_LIFT = 3.4;

/** Написи календарика, одиниці кадру: розмір шрифту в шапці й на аркуші та найбільша ширина. */
export const CALENDAR_TEXT = { week: 22, day: 24, width: 86 } as const;

/** Кадри цифр для часу «ГГ:ХХ», без двокрапки: стани `ui/hud/clock-digit`. */
export function clockDigitStates(clock: string): string[] {
  return [...clock.replace(":", "")].map((digit) => `d${digit}`);
}

/** Найменший розмір дрібних написів панелі на екрані, px CSS (підпис квитанції, стани, розклад, бабл телефона). */
export const HUD_SMALL_TEXT_CSS = 12;
/** Найдрібніший з цих написів, одиниць інтерфейсу (підпис квитанції й бабл телефона — 17). */
export const HUD_SMALL_TEXT = 17;
/** Більше збільшувати не можна: смуга панелі тієї самої висоти (`HUD_HEIGHT`), і написи вилізли б за неї. */
export const HUD_TEXT_MAX = 1.35;

/**
 * У скільки разів збільшити дрібні написи панелі й підказку на телефоні, коли інтерфейс на екрані зменшений (`cssPerUnit` — px
 * CSS на одиницю інтерфейсу, `1 / CanvasFit.unit`): на телефоні 844 × 390 це ≈ 0,54, і написи 17–18 одиниць ставали
 * ≈ 9–10 px CSS, а іконка підказки ≈ 9 px (рецензія хвилі 3). Дрібний напис — не менше `HUD_SMALL_TEXT_CSS`, але не більше
 * `HUD_TEXT_MAX`; на десктопі (інтерфейс не зменшений) — 1, як було. Щільність полотна (DPR) тут ні до чого: вона лише
 * робить ті самі px CSS чіткішими.
 */
export function hudTextScale(cssPerUnit: number): number {
  const want = HUD_SMALL_TEXT_CSS / (HUD_SMALL_TEXT * cssPerUnit);
  return Math.min(HUD_TEXT_MAX, Math.max(1, want));
}

/**
 * Розклад панелі (`hud.ts`), одиниці інтерфейсу. Показник `i` починається на `stats + i · крок` (крок — `hudColumns`), його
 * кружечок і шкала — від цього початку.
 */
export interface HudLayout {
  /** Висота смуги без безпечної зони (`Viewport` ставить камеру квартири під неї). */
  height: number;
  /** Годинник: центр по горизонталі й масштаб кадру; по вертикалі він посередині смуги. */
  clock: { x: number; scale: number };
  /** Центр календарика по горизонталі; масштаб — той самий, що в годинника. */
  calendarX: number;
  /** Де починається перший показник. */
  stats: number;
  /** Скільки місця лишити праворуч від шкал: гроші, квитанція й розклад (`hudColumns`). */
  reserve: { money: number; bill: number; schedule: number };
  /**
   * Кружечок показника: зовнішній діаметр чорнильного кільця з контуром (`statDisc`), частка паперу під малюнком іконки й
   * центр — від початку показника й від верху смуги.
   */
  disc: { outer: number; fill: number; x: number; y: number };
  /** Місце шкали від початку показника за найбільшого кроку (рамку й заливку в ньому розкладає `isoBarRects`). */
  bar: Rect;
  /** Верх рядка станів («Пошук роботи», «Застуда»). */
  effectsY: number;
}

/**
 * Два розклади панелі.
 *
 * - `desktop` — як був: смуга 76 (`HUD_HEIGHT`), кружечок 36 біля шкали 116 × 12, рядок станів під ними.
 * - `phone` — низький екран (телефон набік, там, де `hudTextScale` збільшує написи): на 844 × 390 одиниця інтерфейсу —
 *   ≈ 0,54 px CSS, і в кружечку 36 іконка показника була ≈ 12 px CSS (рецензія хвилі 3, `ui-r1-9`). Кружечок 52 з тим самим
 *   просвітом паперу довкола іконки (2,8, тому частка 0,86, а не 0,8) — іконка ≈ 18,5 px CSS на 844 × 390 (≈ 17 на 740 × 360);
 *   шкала — праворуч від нього, коротша (100 замість 116), з тим самим кінцем. Рядок станів мусить лишитися під кружечками
 *   (довгий — «Сонливість · Недосип» — іде під сусідніми показниками), тож смуга вища на 12 одиниць (≈ 6,5 px CSS — квартира
 *   нижча на ≈ 2 %). Без вищої смуги більші кружечки лягли б на
 *   рядок станів, а перенести його нікуди: праворуч стоять гроші й розклад, а на телефоні 16:9 смуга не ширша за десктоп.
 *
 * Годинник і календарик намальовано під смугу телефона; на десктопі вони менші, щоб лишалися в нижчій смузі.
 */
export const HUD_LAYOUT: { readonly desktop: HudLayout; readonly phone: HudLayout } = {
  desktop: {
    height: 76,
    clock: { x: 65, scale: 0.84 },
    calendarX: 170,
    stats: 222,
    reserve: { money: 108, bill: 134, schedule: 190 },
    disc: { outer: 36, fill: HUD_STAT_FILL, x: 15, y: 26 },
    bar: { x: 34, y: 20, w: 116, h: 12 },
    effectsY: 44,
  },
  phone: {
    height: 88,
    clock: { x: 72, scale: 1 },
    calendarX: 200,
    stats: 266,
    reserve: { money: 124, bill: 170, schedule: 224 },
    disc: { outer: 52, fill: 0.86, x: 23, y: 30 },
    bar: { x: 50, y: 24, w: 100, h: 12 },
    effectsY: 55,
  },
};

/** Крок показників: найбільший — шкали повні; найменший — коротші вже не прочитати; просвіт — від шкали до наступного кружечка. */
export const HUD_STEP = { max: 158, min: 104, gap: 8 } as const;

/** Де на панелі що стоїть за шириною смуги. */
export interface HudColumns {
  /** Від початку одного показника до початку наступного. */
  step: number;
  /** Ширина шкали. */
  bar: number;
  /** Лівий край грошей. */
  money: number;
  /** Лівий край розкладу. */
  schedule: number;
}

/**
 * Панель шириною `room` (від лівого краю безпечної зони до телефона): гроші, квитанція й розклад займають своє, решту ділять
 * показники, тож на вузькій панелі коротшають шкали, а написи не налазять один на одного. На широкій — шкали повні, а зайве
 * місце лишається перед телефоном.
 */
export function hudColumns(layout: HudLayout, room: number): HudColumns {
  const { reserve } = layout;
  const free = room - layout.stats - reserve.money - reserve.bill - reserve.schedule;
  const step = Math.min(HUD_STEP.max, Math.max(HUD_STEP.min, Math.floor(free / 4)));
  const money = layout.stats + 4 * step;
  return { step, bar: step - layout.bar.x - HUD_STEP.gap, money, schedule: money + reserve.money + reserve.bill };
}

/** Розклад панелі для екрана, де одиниця інтерфейсу займає `cssPerUnit` px CSS (`1 / CanvasFit.unit`). */
export function hudLayout(cssPerUnit: number): HudLayout {
  return hudTextScale(cssPerUnit) > 1 ? HUD_LAYOUT.phone : HUD_LAYOUT.desktop;
}

/** Висота смуги панелі без безпечної зони (`hudLayout`): камера квартири — під нею. */
export function hudHeight(cssPerUnit: number): number {
  return hudLayout(cssPerUnit).height;
}

/**
 * Сенсорні кнопки: A13 малює їх непрозорими (папір із чорнильним контуром), а прозорість задає код — як у старому вигляді,
 * квартиру під пальцем має бути видно. Кнопка, яку тиснуть чи яка готова, — щільніша; основа джойстика — ледь помітна.
 */
export const TOUCH_ALPHA = {
  base: 0.35,
  knob: 0.6,
  action: { idle: 0.55, held: 0.85 },
  dash: { ready: 0.55, cooldown: 0.35 },
  carry: 0.75,
} as const;

/** Кольори шкал показників — з палітри арту: здоров'я червоне, ситість помаранчева, гігієна синя, глузд сливовий. */
export const STAT_FILL: Readonly<Record<StatName, number>> = {
  health: hex(PALETTE.red),
  satiety: hex(PALETTE.orange),
  hygiene: hex(PALETTE.blueHi),
  sanity: hex(PALETTE.plumHi),
};

/** Блимання показника нижче межі (§11.4): паперовим. */
export const STAT_BLINK = hex(PALETTE.paper);

/** Прямокутник на екрані, px полотна гри. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Намальована частина полотна кадру: межі від його лівого верхнього кута, одиниці кадру. */
export interface Drawn {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Намальоване на полотні `frame` — усе, крім поля `margin` з кожного боку. */
export function drawnInside(frame: ArtSize, margin: number): Drawn {
  return { left: margin, top: margin, right: frame.w - margin, bottom: frame.h - margin };
}

/**
 * Куди покласти полотно кадру `frame` («три частини», `StretchArt`), щоб його намальована частина `drawn` лягла рівно на
 * `target`: масштаб — за висотою (кути не сплющуються), ширину добирає розтягнута середина.
 */
export function stretchRect(target: Rect, frame: ArtSize, drawn: Drawn): Rect {
  const k = target.h / (drawn.bottom - drawn.top);
  return {
    x: target.x - drawn.left * k,
    y: target.y - drawn.top * k,
    w: target.w + (drawn.left + frame.w - drawn.right) * k,
    h: frame.h * k,
  };
}

/** Смуга панелі завширшки `width` і заввишки `height` (з безпечною зоною), px: де її полотно (`HUD_BAND`). */
export function bandRect(frame: ArtSize, width: number, height: number): Rect {
  const drawn = { left: HUD_BAND.side, top: HUD_BAND.top, right: frame.w - HUD_BAND.side, bottom: HUD_BAND.edge };
  return stretchRect({ x: 0, y: 0, w: width, h: height }, frame, drawn);
}

/**
 * Шкала нового вигляду на місці старої `old`: полотно рамки `frame` (намальоване — `HUD_BAR`) і заливка під нею, px панелі.
 * Кути рамки — у масштабі висоти, тож чорнильне кільце однаково далеко від зовнішнього краю і вгорі, і на кінцях: заливка
 * відступає від нього скрізь на те саме — до середини кільця (`HUD_BAR_ART`).
 */
export function isoBarRects(old: Rect, frame: ArtSize): { frame: Rect; fill: Rect } {
  const art = HUD_BAR_ART;
  const outer = { x: old.x + HUD_BAR.shift, y: old.y + old.h / 2 - HUD_BAR.height / 2, w: old.w - HUD_BAR.shift, h: HUD_BAR.height };
  const k = HUD_BAR.height / (frame.h - 2 * art.margin);
  const inset = ((art.ink + art.gap) / 2 - art.margin) * k;
  return {
    frame: stretchRect(outer, frame, drawnInside(frame, art.margin)),
    fill: { x: outer.x + inset, y: outer.y + inset, w: outer.w - 2 * inset, h: outer.h - 2 * inset },
  };
}

/** Шматок кадру, розтягнутий по ширині: звідки (`src`, `srcW`) і куди (`x`, `w`) уздовж горизонталі, одиниці кадру. */
export interface StretchSlice {
  src: number;
  srcW: number;
  x: number;
  w: number;
}

/**
 * «Три частини» кадру шириною `frameW` на ширину `width`: лівий і правий кути по `cap` — у масштабі `capScale` (той самий,
 * що й по висоті, — кути не сплющуються), середина — розтягнута. Вужча за два кути смуга — самі кути, стиснуті навпіл.
 * Порожніх шматків немає.
 */
export function stretchSlices(frameW: number, cap: number, width: number, capScale = 1): StretchSlice[] {
  const side = Math.min(cap * capScale, width / 2);
  const middle = width - 2 * side;
  const slices: StretchSlice[] = [{ src: 0, srcW: cap, x: 0, w: side }];
  if (middle > 0) slices.push({ src: cap, srcW: frameW - 2 * cap, x: side, w: middle });
  slices.push({ src: frameW - cap, srcW: cap, x: width - side, w: side });
  return slices.filter((s) => s.w > 0 && s.srcW > 0);
}
