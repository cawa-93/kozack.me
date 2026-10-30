// Типи арту (крок 16, GRAPHICS_PLAN.md: «Арт, маніфест і атласи», «Тонування й запікання»): запис маніфесту, формат
// `public/art/index.json` для PreloadScene і рецепт тонування для `compose.ts`. Лише типи й крихітні чисті хелпери, без
// Phaser і DOM: файл імпортують Node-тести й Vite-плагін конвеєра (`scripts/art/plugin.ts`).
//
// Одиниці арту — одиниці полотна SVG (viewBox): плитка підлоги — 128 × 64 (TW × TH), вісь y — донизу. Пікселі атласу —
// одиниці арту × роздільність `res`.
//
// Як SVG пов'язаний із записом:
// - один SVG на запис (частину чи об'єкт): `art/<src>.svg`, а з ракурсами — `art/<src>/<ракурс>.svg` (`svgPath`);
// - кожен шар — `<g id="<шар>">` верхнього рівня (`fill`, `tabby-classic`, `shade`, `ink`…); спільна геометрія — у `<defs>`;
//   без `<text>`;
// - стан — окремий кадр із того самого SVG: елементи, що є лише в деяких станах, мають класи `st-<стан>` (кілька — через
//   пробіл); елементи без класу `st-*` є в усіх станах;
// - кадр — стан × ракурс; його id — `frameId` (`env/fridge/open`, `cat/head/normal/front`, `icon/thirst`).

import type { TabbyPattern } from "../../sim/genetics";

/** Точка в одиницях арту (або пікселях — де сказано). */
export interface ArtPoint {
  x: number;
  y: number;
}

/** Розмір в одиницях арту. */
export interface ArtSize {
  w: number;
  h: number;
}

/**
 * Категорія арту — перший сегмент id:
 * - `env` — будова й меблі квартири: плити кімнат, стіни, двері, меблі й прилади з їхніми станами запасів;
 * - `item` — речі котів і речі в руках: миски, лотки, будиночки, іграшки, вудочки, переноска, тарілки, совки, пакунки;
 * - `mess` — бруд і дрібниці на підлозі: калюжі, клаптики шерсті, дрібнички й скалки, шкарпетка, сміття;
 * - `fx` — ефекти поверх світу: пил бійки, клапті шерсті в польоті, хвилі запаху, сопіння;
 * - `cat` — частини кота для скелета;
 * - `person` — частини персонажа для скелета;
 * - `icon` — іконки бульбашок і HUD, позначки «ні/?/✓», фони бульбашок, гліфи DOM;
 * - `ui` — оформлення DOM-інтерфейсу (рамки, кнопки, вкладки);
 * - `race` — гонка (вигляд згори, без ізометрії).
 */
export type ArtCategory = "env" | "item" | "mess" | "fx" | "cat" | "person" | "icon" | "ui" | "race";

/**
 * Id запису маніфесту: `<категорія>/<назва>[/<варіант>…]` (`env/fridge`, `cat/head/normal`, `icon/thirst`). Сегменти — малі
 * латинські літери, цифри й дефіс (`ART_SEGMENT`).
 */
export type ArtId = `${ArtCategory}/${string}`;

/** Id кадру атласу: id запису, далі стан і ракурс, якщо запис їх має (`frameId`). */
export type FrameId = ArtId;

/** Сегмент id, назва стану чи шару: малі латинські літери, цифри, дефіс між ними. */
export const ART_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Ракурс (§2.1, крок 16): `front` — ¾ спереду (до камери), `back` — ¾ ззаду (від камери). Частини й скелети малюються
 * обличчям праворуч; ліворуч — віддзеркалення.
 */
export type ArtView = "front" | "back";
export const ART_VIEWS: readonly ArtView[] = ["front", "back"];

// --- Шари --------------------------------------------------------------------------------------

/** Ділянки, які компонувальник фарбує в колір вигляду персонажа (§5.1) чи очей. Шерсть кота — шар `fill` без ділянки. */
export type FillRegion = "iris" | "skin" | "hair" | "top" | "bottom" | "shoes";

/**
 * Заливка — білий силует (#fff), який фарбує компонувальник: `fill` — шерсть кота (основний колір `coatOf`, у колорпойнта —
 * світле тіло), `fill-iris` — райдужка (4 кольори очей кота, 4 — персонажа), `fill-skin`, `fill-hair`, `fill-top`,
 * `fill-bottom`, `fill-shoes` — шкіра, волосся й одяг персонажа (палітри `palette.ts`).
 */
export type FillLayer = "fill" | `fill-${FillRegion}`;

/** Маска табі (§9.10): смуги чи плями одного типу на все тіло; фарбується темнішим відтінком основного кольору. */
export type TabbyLayer = `tabby-${TabbyPattern}`;

/** Маска черепахових плям другого кольору (§9.10): три варіанти розкладу, варіант — за хешем кота. */
export type TortieLayer = "tortie-a" | "tortie-b" | "tortie-c";

/**
 * Маска білих плям в анатомічному порядку (§9.10): `white-1` — лапки, груди й живіт; `white-2` — додає морду (біколор);
 * `white-3` — додає спину (ван). Маски накопичуються: кіт з `Coat.white` = N показує `white-1`…`white-N`.
 */
export type WhiteLayer = "white-1" | "white-2" | "white-3";

/**
 * Маски шерсті кота. Окрім перелічених:
 * - `point` — «кінчики» колорпойнта (морда, вуха, лапи, хвіст) кольором пігменту поверх світлого тіла;
 * - `fluff` — довга шерсть: білі пасма за краєм і поверх `fill`; фарбується, як `fill`, і лежить під іншими масками, тож
 *   плями й смуги лягають і на пасма;
 * - `fluff-ink` — контур пасом довгої шерсті; малюється поверх `ink` лише в довгошерстих.
 * Маски малюються лише в межах частини: компонувальник обтинає їх по вже намальованій заливці.
 */
export type CoatLayer = TabbyLayer | TortieLayer | WhiteLayer | "point" | "fluff" | "fluff-ink";

/**
 * Необов'язкова накладка, яку компонувальник вмикає за станом, у готових кольорах: `extra-stain` — плями на одязі, коли
 * чистого немає (§8.7), `extra-bald` — залисини, `extra-collar` — нашийник тощо. Перелік накладок кожної частини — у її
 * записі маніфесту.
 */
export type ExtraLayer = `extra-${string}`;

/**
 * Шар SVG, що растеризується окремо:
 * - заливки й маски (вище) — білі, їх фарбує компонувальник;
 * - `detail` — деталі в готових кольорах палітри, завжди видимі (ніс, подушечки лап, ґудзики);
 * - `shade` — тінь: сірі тони, що кладуться множенням (світло спереду-згори: верх найсвітліший, боки затінені однаково);
 * - `ink` — чорнильний контур і лінії в готовому кольорі, найвищий шар.
 */
export type ArtLayer = FillLayer | CoatLayer | ExtraLayer | "detail" | "shade" | "ink";

/** Усі шари, крім накладок `extra-*` (їх назви вільні); що перелік повний, перевіряє `tests/arttypes.test.ts`. */
export const ART_LAYERS = [
  "fill",
  "fill-iris",
  "fill-skin",
  "fill-hair",
  "fill-top",
  "fill-bottom",
  "fill-shoes",
  "fluff",
  "point",
  "tortie-a",
  "tortie-b",
  "tortie-c",
  "tabby-classic",
  "tabby-mackerel",
  "tabby-spotted",
  "tabby-ticked",
  "white-1",
  "white-2",
  "white-3",
  "detail",
  "shade",
  "ink",
  "fluff-ink",
] as const satisfies readonly Exclude<ArtLayer, ExtraLayer>[];

/** Чи ця назва `<g id>` — шар арту (для конвеєра й `tests/art.test.ts`). */
export function isArtLayer(name: string): name is ArtLayer {
  if ((ART_LAYERS as readonly string[]).includes(name)) return true;
  return name.startsWith("extra-") && ART_SEGMENT.test(name.slice("extra-".length));
}

/**
 * Типовий порядок шарів знизу догори (крок 16: заливка → маски → тінь → контур): заливки, `fluff`, `point`, `tortie-*`,
 * `tabby-*`, `white-*`, `detail`, `extra-*`, `shade`, `ink`, `fluff-ink`. Компонувальник може мати свій рецепт, але
 * без причини від цього порядку не відходить.
 */
export function layerRank(layer: ArtLayer): number {
  if (layer === "fill" || layer.startsWith("fill-")) return 0;
  if (layer === "fluff") return 1;
  if (layer === "point") return 2;
  if (layer.startsWith("tortie-")) return 3;
  if (layer.startsWith("tabby-")) return 4;
  if (layer.startsWith("white-")) return 5;
  if (layer === "detail") return 6;
  if (layer.startsWith("extra-")) return 7;
  if (layer === "shade") return 8;
  if (layer === "ink") return 9;
  // fluff-ink — контур довгої шерсті поверх усього.
  return 10;
}

// --- Маніфест ----------------------------------------------------------------------------------

/** Запис маніфесту: одна частина чи об'єкт, тобто один SVG (з ракурсами — по SVG на ракурс). */
export interface ArtEntry {
  /** Id запису; кадри — `frameId(id, стан, ракурс)`, і кадри всіх записів різні. */
  id: ArtId;
  /** Шлях до SVG відносно `art/` без `.svg` (з ракурсами — каталог із `<ракурс>.svg`); за замовчуванням — `id`. */
  src?: string;
  /** Розмір полотна SVG — його viewBox `0 0 w h`; одиниці арту. Спільний для всіх станів і ракурсів запису. */
  size: ArtSize;
  /**
   * Точка опори в полотні, одиниці арту від лівого верхнього кута: у речей на підлозі — точка підлоги під центром сліду, у
   * плит кімнат — верхня вершина ромба першої плитки кімнати, у частин скелета — суглоб, яким кадр кріпиться до кістки, в іконок —
   * центр.
   */
  pivot: ArtPoint;
  /**
   * Точки кріплення в полотні, одиниці арту від лівого верхнього кута: назва (сегмент `ART_SEGMENT`) → точка. Для того, що
   * належить самому малюнку: полиця холодильника, екран монітора, конфорка. У Phaser — `customData` кадру.
   */
  points?: Readonly<Record<string, ArtPoint>>;
  /**
   * Шари, які растеризуються окремо й тонуються (`<g id>` кожного обов'язковий у SVG). Не задано — увесь SVG одним кадром
   * у готових кольорах (оточення, іконки): у `index.json` у нього один шар `all`.
   */
  layers?: readonly ArtLayer[];
  /** Ракурси; кожен — свій SVG і свій кадр. Не задано — один ракурс без суфікса (речі, іконки). */
  views?: readonly ArtView[];
  /**
   * Стани (`closed`, `open`, `full-0`…`full-4`, `burnt`; сегменти `ART_SEGMENT`, не `front` і не `back`), кожен — свій кадр
   * із того самого SVG (класи `st-<стан>`). Не задано — без станів.
   */
  states?: readonly string[];
  /** Роздільність растеризації, пікселів атласу на одиницю арту; за замовчуванням — спільна з конвеєра. */
  res?: number;
}

/**
 * Модуль категорії `src/view/art/manifest/<файл>.ts`: експортує `MANIFEST`. Модулі знаходить
 * `import.meta.glob("./manifest/*.ts", { import: "MANIFEST", eager: true })`, тож спільного реєстру немає; за кожен файл
 * відповідає рівно один пакет робіт.
 */
export interface ManifestModule {
  MANIFEST: readonly ArtEntry[];
}

/** Один кадр запису: його id, стан і ракурс (null — запис їх не має) і SVG відносно `art/`. */
export interface ArtFrameRef {
  frame: FrameId;
  state: string | null;
  view: ArtView | null;
  svg: string;
}

/** Id кадру: id запису, далі стан і ракурс, якщо є (`env/fridge` + `open` → `env/fridge/open`). */
export function frameId(id: ArtId, state?: string | null, view?: ArtView | null): FrameId {
  let frame: FrameId = id;
  if (state) frame = `${frame}/${state}`;
  if (view) frame = `${frame}/${view}`;
  return frame;
}

/** SVG запису відносно `art/`: `<src>.svg`, а з ракурсом — `<src>/<ракурс>.svg`. */
export function svgPath(entry: Pick<ArtEntry, "id" | "src">, view?: ArtView | null): string {
  const src = entry.src ?? entry.id;
  return view ? `${src}/${view}.svg` : `${src}.svg`;
}

/** Усі кадри запису — стани × ракурси, стани зовні. */
export function framesOf(entry: ArtEntry): ArtFrameRef[] {
  const states: readonly (string | null)[] = entry.states ?? [null];
  const views: readonly (ArtView | null)[] = entry.views ?? [null];
  return states.flatMap((state) => views.map((view) => ({ frame: frameId(entry.id, state, view), state, view, svg: svgPath(entry, view) })));
}

// --- index.json --------------------------------------------------------------------------------

/** Каталог атласів у `public/` і в адресі (від `import.meta.env.BASE_URL`): `art/index.json`, `art/<сторінка>.webp`. */
export const ART_DIR = "art";
export const ART_INDEX_FILE = "index.json";
/** Версія формату `index.json`: несумісна зміна формату — нова версія. */
export const ART_INDEX_VERSION = 1;
/** Ключ текстури Phaser з усіма сторінками атласу (сторінка — джерело текстури з тим самим номером). */
export const ART_TEXTURE = "art";

/** Шар кадру в `index.json`: шар SVG або `all` — увесь SVG разом (запис без `layers`). */
export type FrameLayer = ArtLayer | "all";

/** Назва кадру Phaser для шару: `all` — сам id кадру, інший шар — `<кадр>#<шар>`. */
export function layerFrameName(frame: FrameId, layer: FrameLayer): string {
  return layer === "all" ? frame : `${frame}#${layer}`;
}

/** Сторінка атласу. */
export interface AtlasPage {
  /** Назва файлу з хешем вмісту, відносно `art/` (`page-0.3f9a2c1b.webp`). */
  file: string;
  /** Розмір сторінки, пікселі (не більше 2048 × 2048). */
  w: number;
  h: number;
}

/** Прямокутник шару на сторінці атласу: номер сторінки (індекс у `ArtIndex.pages`) і місце на ній, пікселі. */
export interface AtlasRect {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Кадр у `index.json`. Шари одного кадру растеризуються окремо й обрізаються спільною рамкою, тож усі вони одного розміру
 * `w × h` і накладаються піксель у піксель.
 */
export interface IndexFrame {
  /** Розмір полотна SVG, одиниці арту (з маніфесту). */
  size: ArtSize;
  /** Пікселів атласу на одиницю арту: полотно в пікселях — `size × res`. */
  res: number;
  /** Точка опори, одиниці арту від лівого верхнього кута полотна (з маніфесту). */
  pivot: ArtPoint;
  /** Точки кріплення, одиниці арту від лівого верхнього кута полотна (з маніфесту). */
  points?: Readonly<Record<string, ArtPoint>>;
  /** Де в полотні починається спільна рамка обрізки: зсув від лівого верхнього кута, пікселі атласу. */
  trim: ArtPoint;
  /** Шари кадру: де кожен лежить в атласі; запис без `layers` має єдиний шар `all`. */
  layers: Readonly<Partial<Record<FrameLayer, AtlasRect>>>;
  /** SVG ще немає — кадр є маджентовою заглушкою потрібного розміру й pivot. */
  stub?: true;
}

/** `public/art/index.json`: усе, що потрібно PreloadScene, галереї й компонувальнику. */
export interface ArtIndex {
  version: typeof ART_INDEX_VERSION;
  /** Сторінки атласу; `AtlasRect.page` — індекс тут. */
  pages: readonly AtlasPage[];
  /** Кадри за id. */
  frames: Readonly<Record<FrameId, IndexFrame>>;
}

// --- Рецепт тонування (compose.ts) ------------------------------------------------------------

/**
 * Як перефарбувати шар у колір кроку (на окремому полотні, до накладання): `source-atop` — колір заливає все, що намальовано
 * шаром, прозорість лишається (білі заливки й маски); `multiply` — множення: білий стає кольором, сірі й темні місця лишаються
 * темнішими (шар із напівтонами).
 */
export type TintMode = "source-atop" | "multiply";

/**
 * Як класти шар на вже складене (`globalCompositeOperation` Canvas2D): `source-over` — поверх (заливка, `fluff`, деталі,
 * контур); `source-atop` — лише там, де вже намальовано (маски обтинаються по заливці частини); `multiply` — множенням
 * (`shade`).
 */
export type PutMode = "source-over" | "source-atop" | "multiply";

/** Крок рецепта: один шар кадру. Шар, якого в кадрі немає, пропускається. */
export interface TintStep {
  layer: ArtLayer;
  /** Колір 0xRRGGBB; null — шар як є, у своїх кольорах (`detail`, `extra-*`, `shade`, `ink`). */
  color: number | null;
  /** Як перефарбувати шар; за замовчуванням `source-atop`. Без кольору не діє. */
  tint?: TintMode;
  /** Як класти шар на складене. */
  put: PutMode;
  /** Непрозорість шару 0–1; за замовчуванням 1 (блідий тікований табі — менше). */
  alpha?: number;
}

/**
 * Рецепт тонування кадру частини: кроки по черзі знизу догори, зазвичай у порядку `layerRank`. Кіт: `fill` кольором шерсті
 * (`coatOf`), маски шерсті з обтинанням (`put: source-atop`), `shade` множенням, `ink` поверх. Той самий рецепт — той самий
 * вигляд, тож запечений кадр шукають за `key`.
 */
export interface TintRecipe {
  /** Короткий ключ вигляду для кешу запікання: однакові рецепти — однаковий ключ. */
  key: string;
  steps: readonly TintStep[];
}
