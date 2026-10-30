// Рецепти тонування (крок 16, GRAPHICS_PLAN.md: «Тонування й запікання»): який колір дістається кожному шару частини кота
// чи персонажа. Кіт — з забарвлення генів (`coatOf`, §9.10) і видимих станів (тьмяна шерсть від глистів, залисини від
// дерматиту, нашийник); персонаж — з вигляду `Look` (§5.1) і плям на одязі, коли чистого немає (§8.7). Чисті функції без
// Phaser і DOM: рецепт складає `compose.ts`, запікає `bake.ts`, а перевіряє `tests/compose.test.ts`.
//
// Один рецепт на істоту: у ньому кроки для всіх шарів усіх її частин, а шари, яких у кадрі немає, компонувальник
// пропускає. Тож тулуб, голова й очі кота тонуються тим самим рецептом.
//
// Кольори шерсті тут, а не в `art/palette.ts`: палітра арту — кольори, якими малюють SVG, а це кольори, якими компонувальник
// фарбує білі заливки й маски під час гри. Узгоджені зі старим виглядом (`src/view/legacy/cat.ts`) — приглушені, теплі.

import { coatOf, type Coat, type EyeColor, type Pigment, type TabbyPattern } from "../../sim/genetics";
import type { Cat, Look, Shape } from "../../sim/types";
import { PALETTE as LOOK_PALETTE } from "../palette";
import type { ArtLayer, PutMode, TintRecipe, TintStep, TortieLayer, WhiteLayer } from "./types";

// --- Кольори -----------------------------------------------------------------------------------

/**
 * Як виглядає пігмент на шерсті (§9.10):
 * - `solid` — суцільний колір неагуті-кота (чорний, шоколадний, блакитний, бузковий; рудий і кремовий — плями черепахових
 *   без малюнка);
 * - `ground` — тло табі (агуті): світліше й тепліше за пігмент;
 * - `stripe` — смуги й плями табі: темніший відтінок того самого кольору;
 * - `pointBody`, `point` — світле тіло й темні «кінчики» колорпойнта (сил-, шоколад-, блю-, лайлак-, ред- і крем-пойнт);
 * - `skin` — шкіра безшерстого кота цього пігменту.
 */
export interface PigmentLook {
  solid: number;
  ground: number;
  stripe: number;
  pointBody: number;
  point: number;
  skin: number;
}

export const PIGMENT_LOOK: Readonly<Record<Pigment, PigmentLook>> = {
  // Чорний — не чорнильний: контур (#1f1a24) мусить читатися й на чорному коті.
  black: { solid: 0x3a3437, ground: 0x8f7458, stripe: 0x3a3437, pointBody: 0xece0cb, point: 0x54433a, skin: 0x8e8389 },
  chocolate: { solid: 0x6a4532, ground: 0xa88566, stripe: 0x5e3b2a, pointBody: 0xf1e6d4, point: 0x7d5a45, skin: 0xa58779 },
  blue: { solid: 0x7f8b97, ground: 0xb3b5b4, stripe: 0x6f7a87, pointBody: 0xe8e6e2, point: 0x828b98, skin: 0xa59fa8 },
  lilac: { solid: 0xb7a7b0, ground: 0xd4c7c4, stripe: 0xa29299, pointBody: 0xf1ebe7, point: 0xb6a7ad, skin: 0xc8b6ba },
  orange: { solid: 0xd98a3e, ground: 0xe3a15e, stripe: 0xbd6a2a, pointBody: 0xf4e7d6, point: 0xdc9558, skin: 0xe6b592 },
  cream: { solid: 0xe9c995, ground: 0xefd4aa, stripe: 0xd6aa72, pointBody: 0xf6eee2, point: 0xe5c79c, skin: 0xedd1b6 },
};

/** Білі плями (теплий білий, як у старому вигляді). */
export const COAT_WHITE = 0xf4f0e8;
/** «Білі» плями безшерстого — рожева шкіра. */
export const HAIRLESS_WHITE = 0xf0cfc4;
/** Світле тіло безшерстого колорпойнта. */
export const HAIRLESS_POINT_BODY = 0xf0d8cc;
/** Очі кота (§9.10): ті самі 4 кольори, що в старому вигляді. */
export const EYE_COLORS: Readonly<Record<EyeColor, number>> = { blue: 0x6fb3e0, green: 0x7fbf5a, yellow: 0xe0c040, copper: 0xd2803a };

/**
 * Тінь (`shade`) — сірі тони арту, що кладуться множенням; компонувальник ще й домножує їх на цей теплий колір (`tint:
 * multiply`), щоб тінь була теплою, а не сизою: білий в арті стає цим кольором, сірий — темнішим. Підбирає F1 разом із
 * сірими тінями в `art/STYLE.md`.
 */
export const SHADE_TINT = 0xf2dccb;

/**
 * Множник смуг табі там, де смуги кладуться множенням (колорпойнт, безшерстий): «темніший відтінок того, що під ними».
 * 0.72 — як у старому вигляді (`legacy/cat.ts`).
 */
const TABBY_DARKEN = 0.72;

/** Непрозорість маски табі: тікований — блідий (лише тікінг), у колорпойнта — ледь видно на світлому тілі, у безшерстого — на шкірі. */
const TABBY_ALPHA = { ticked: 0.55, pointed: 0.6, pointedTicked: 0.35, hairless: 0.4 } as const;
/** Черепахові плями колорпойнта кладуться множенням: на світлому тілі — персикові, на темних «кінчиках» — рудуваті. */
const POINTED_TORTIE_ALPHA = 0.55;

/** Тьмяна шерсть (глисти, DISEASES.md; §9.5): наскільки колір шерсті втрачає насиченість і темнішає. */
const DULL = { desaturate: 0.5, darken: 0.92 } as const;

// --- Кіт ---------------------------------------------------------------------------------------

/** Шари, які тонує рецепт кота (у кадрі може бути лише частина з них). */
export const CAT_RECIPE_LAYERS: readonly ArtLayer[] = [
  "fill",
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
  "fill-iris",
  "detail",
  "extra-wrinkles",
  "extra-curls",
  "extra-dull",
  "extra-bald",
  "extra-collar",
  "shade",
  "ink",
  "fluff-ink",
];

/** Вигляд кота без самого кота (галерея, тести): забарвлення, шерсть від породи й число для варіанта черепахових плям. */
export interface CatAppearance {
  coat: Coat;
  /** Шерсть від породи (`Shape.coat`): безшерста, кучерява чи null — за генами. */
  fur: Shape["coat"];
  /** Стабільне число кота (його id): з нього — варіант черепахових плям `tortie-a/b/c`. */
  seed: number;
}

/** Видимі стани кота, що змінюють шерсть. */
export interface CatRecipeOptions {
  /** Тьмяна шерсть — видима ознака глистів (DISEASES.md, §9.5): шерсть ненасичена й трохи темніша. */
  dull?: boolean;
  /** Залисини — дерматит (DISEASES.md: «лисі плями»): шар `extra-bald`. */
  bald?: boolean;
  /** Нашийник із табличкою (§9.10): шар `extra-collar`. */
  collar?: boolean;
}

/** Видимі стани кота з сима: глисти → тьмяна шерсть, дерматит → залисини, нашийник. */
export function catRecipeOptions(cat: Pick<Cat, "diseases" | "collar">): Required<CatRecipeOptions> {
  return {
    dull: cat.diseases.some((d) => d.id === "worms"),
    bald: cat.diseases.some((d) => d.id === "dermatitis"),
    collar: cat.collar,
  };
}

/** Вигляд кота з сима: `coatOf` генів, шерсть від породи, id. */
export function catAppearance(cat: Pick<Cat, "id" | "genes" | "shape">): CatAppearance {
  return { coat: coatOf(cat.genes, cat.shape), fur: cat.shape.coat, seed: cat.id };
}

/** Варіант черепахових плям за стабільним хешем числа кота (Knuth): той самий кіт — той самий розклад плям. */
export function tortieVariant(seed: number): TortieLayer {
  const hash = Math.imul(Math.trunc(seed) | 0, 0x9e3779b1) >>> 0;
  return (["tortie-a", "tortie-b", "tortie-c"] as const)[(hash >>> 16) % 3] ?? "tortie-a";
}

/**
 * Рецепт кота: кіт із сима (тоді видимі стани — з нього ж, `catRecipeOptions`, а `opts` їх перевизначають) або його вигляд
 * (`CatAppearance`, стани — лише з `opts`).
 *
 * Кроки знизу догори:
 * - `fill` — основний колір: суцільний пігмент, тло табі (агуті й руді), світле тіло колорпойнта чи шкіра безшерстого;
 * - `fluff` — довга шерсть тим самим кольором, під масками, тож плями й смуги лягають і на пасма;
 * - `point` — «кінчики» колорпойнта кольором пігменту;
 * - `tabby-<візерунок>` — смуги темнішим відтінком того самого кольору (у неагуті-кота смуг немає, як у `coatOf`; у рудих
 *   є завжди); у черепахових табі смуги кладуться ще раз множенням поверх рудих плям, тож у плямах вони руді;
 * - `tortie-<a|b|c>` — плями другого кольору (рудий чи кремовий), варіант — за хешем id;
 * - `white-1…N` — білі плями в анатомічному порядку;
 * - `fill-iris` — очі; після масок, щоб білі плями й смуги морди не лягали на райдужку;
 * - `detail`, `extra-wrinkles` (складки безшерстих), `extra-curls` (завитки кучерявих), `extra-dull` (скуйовджена тьмяна
 *   шерсть), `extra-bald` (залисини), `extra-collar` (нашийник) — у своїх кольорах; накладки `extra-*` лежать у кадрі
 *   `cat/<частина>-extra/…` (F5), і запікання бере їх звідти (`extraFrameOf`);
 * - `shade` — множенням, теплим; `ink` — контур; `fluff-ink` — контур пасом довгої шерсті.
 * Маски кладуться `source-atop` чи множенням — компонувальник обтинає їх по вже намальованому силуету.
 */
export function catRecipe(cat: Pick<Cat, "id" | "genes" | "shape" | "diseases" | "collar"> | CatAppearance, opts: CatRecipeOptions = {}): TintRecipe {
  const look = "genes" in cat ? catAppearance(cat) : cat;
  const state: Required<CatRecipeOptions> = {
    ...("genes" in cat ? catRecipeOptions(cat) : { dull: false, bald: false, collar: false }),
    ...definedOnly(opts),
  };
  return buildCatRecipe(normalizeAppearance(look), state);
}

/** Рецепти котів сима: рецепт і стани, з якими його складено. */
const recipeMemo = new WeakMap<object, { states: string; recipe: TintRecipe }>();

/**
 * Рецепт кота сима, якого можна просити щокадру для кожного слота: складається знову, лише коли змінилися видимі стани
 * (глисти, дерматит, нашийник), тож ні сміття, ні зайвих `coatOf`. Гени й форми того самого об'єкта кота вважаються
 * незмінними (вони й не змінюються: кошеня отримує їх при народженні; новий об'єкт після завантаження — новий рецепт).
 */
export function catRecipeOf(cat: Pick<Cat, "id" | "genes" | "shape" | "diseases" | "collar">): TintRecipe {
  const opts = catRecipeOptions(cat);
  const states = `${opts.dull ? 1 : 0}${opts.bald ? 1 : 0}${opts.collar ? 1 : 0}`;
  const have = recipeMemo.get(cat);
  if (have && have.states === states) return have.recipe;
  const recipe = buildCatRecipe(normalizeAppearance(catAppearance(cat)), opts);
  recipeMemo.set(cat, { states, recipe });
  return recipe;
}

/** Вигляд, у якому однакове на малюнку записано однаково: довга шерсть лише без породної, варіант плям — лише в черепахових. */
interface CatLookKey {
  coat: Coat;
  fur: Shape["coat"];
  tortie: TortieLayer | null;
}

function normalizeAppearance(look: CatAppearance): CatLookKey {
  const coat: Coat = { ...look.coat, long: look.coat.long && look.fur === null, white: clampInt(look.coat.white, 0, 3) };
  return { coat, fur: look.fur, tortie: coat.second ? tortieVariant(look.seed) : null };
}

function buildCatRecipe(look: CatLookKey, state: Required<CatRecipeOptions>): TintRecipe {
  const { coat, fur, tortie } = look;
  const hairless = fur === "hairless";
  const base = PIGMENT_LOOK[coat.base];
  const second = coat.second ? PIGMENT_LOOK[coat.second] : null;
  const furColor = (color: number): number => (state.dull ? dullColor(color) : color);
  const steps: TintStep[] = [];
  const paint = (layer: ArtLayer, color: number, put: PutMode, alpha = 1): void => {
    steps.push(alpha === 1 ? { layer, color, put } : { layer, color, put, alpha });
  };
  const asIs = (layer: ArtLayer, put: PutMode): void => {
    steps.push({ layer, color: null, put });
  };

  // Основний колір.
  const body = coat.pointed ? (hairless ? HAIRLESS_POINT_BODY : base.pointBody) : hairless ? base.skin : coat.tabby ? base.ground : base.solid;
  paint("fill", furColor(body), "source-over");
  if (coat.long) paint("fluff", furColor(body), "source-over");
  if (coat.pointed) paint("point", furColor(hairless ? base.skin : base.point), "source-atop");

  const tabby = coat.tabby ? (`tabby-${coat.tabby}` as const) : null;
  const tabbyAlpha = tabbyOpacity(coat.tabby, coat.pointed, hairless);
  // Смуги кладуться множенням там, де під ними не один колір: на світлому тілі й темних «кінчиках» колорпойнта, на шкірі.
  const tabbyMultiply = coat.pointed || hairless;
  const darken = gray(TABBY_DARKEN);

  if (second && tortie) {
    const patch = coat.pointed ? second.point : hairless ? second.skin : coat.tabby ? second.ground : second.solid;
    if (tabby && !tabbyMultiply) {
      // Черепахова табі: смуги основного кольору, поверх — руді плями, а в плямах — руді смуги (множенням: на тлі плями
      // стають кольором смуг, а смуги основного кольору лише трохи темнішають).
      paint(tabby, furColor(base.stripe), "source-atop", tabbyAlpha);
      paint(tortie, furColor(patch), "source-atop");
      paint(tabby, ratio(furColor(second.stripe), furColor(second.ground)), "multiply", tabbyAlpha);
    } else {
      if (coat.pointed) paint(tortie, furColor(patch), "multiply", POINTED_TORTIE_ALPHA);
      else paint(tortie, furColor(patch), "source-atop");
      if (tabby) paint(tabby, darken, "multiply", tabbyAlpha);
    }
  } else if (tabby) {
    if (tabbyMultiply) paint(tabby, darken, "multiply", tabbyAlpha);
    else paint(tabby, furColor(base.stripe), "source-atop", tabbyAlpha);
  }

  for (let i = 1; i <= coat.white; i++) paint(`white-${i}` as WhiteLayer, furColor(hairless ? HAIRLESS_WHITE : COAT_WHITE), "source-atop");
  paint("fill-iris", EYE_COLORS[coat.eyes], "source-over");
  asIs("detail", "source-over");
  if (hairless) asIs("extra-wrinkles", "source-atop");
  if (fur === "curly") asIs("extra-curls", "source-over");
  if (state.dull) asIs("extra-dull", "source-atop");
  if (state.bald) asIs("extra-bald", "source-atop");
  if (state.collar) asIs("extra-collar", "source-over");
  steps.push({ layer: "shade", color: SHADE_TINT, tint: "multiply", put: "multiply" });
  asIs("ink", "source-over");
  if (coat.long) asIs("fluff-ink", "source-over");
  return { key: catKey(look, state), steps };
}

function tabbyOpacity(pattern: TabbyPattern | null, pointed: boolean, hairless: boolean): number {
  if (hairless) return TABBY_ALPHA.hairless;
  if (pointed) return pattern === "ticked" ? TABBY_ALPHA.pointedTicked : TABBY_ALPHA.pointed;
  return pattern === "ticked" ? TABBY_ALPHA.ticked : 1;
}

/**
 * Ключ вигляду кота: усе, від чого залежать кроки, і нічого більше (тож однакові коти ділять запечені кадри). Напр.
 * `cat:black+orange/mackerel/w2/green/tortie-b`, `cat:blue/w0/pt/long/blue/dull/collar`.
 */
function catKey(look: CatLookKey, state: Required<CatRecipeOptions>): string {
  const { coat, fur, tortie } = look;
  const parts = [`cat:${coat.base}${coat.second ? `+${coat.second}` : ""}`];
  if (coat.tabby) parts.push(coat.tabby);
  parts.push(`w${coat.white}`);
  if (coat.pointed) parts.push("pt");
  if (coat.long) parts.push("long");
  parts.push(coat.eyes);
  if (fur) parts.push(fur);
  if (tortie) parts.push(tortie);
  if (state.dull) parts.push("dull");
  if (state.bald) parts.push("bald");
  if (state.collar) parts.push("collar");
  return parts.join("/");
}

// --- Персонаж ----------------------------------------------------------------------------------

/** Шари, які тонує рецепт персонажа. */
export const PERSON_RECIPE_LAYERS: readonly ArtLayer[] = [
  "fill-skin",
  "fill-top",
  "fill-bottom",
  "fill-shoes",
  "fill-hair",
  "fill-iris",
  "detail",
  "extra-stain",
  "shade",
  "ink",
];

export interface PersonRecipeOptions {
  /** Плями на одязі, коли чистого немає (§8.7, `home.clothes <= 0`): шар `extra-stain`. */
  stained?: boolean;
}

/** Кольори вигляду персонажа з палітр `view/palette.ts` за індексами `Look` — так само, як у старому вигляді й портреті. */
export function personColors(look: Look): { skin: number; hair: number; iris: number; top: number; bottom: number; shoes: number } {
  return {
    skin: pick(LOOK_PALETTE.skin, look.skin),
    hair: pick(LOOK_PALETTE.hairColor, look.hairColor),
    iris: pick(LOOK_PALETTE.eyes, look.eyes),
    top: pick(LOOK_PALETTE.clothes, look.top),
    // Низ і взуття починаються з графітового (`ui/look.ts`): зсув 5 у спільній палітрі одягу, як у `legacy/person.ts`.
    bottom: pick(LOOK_PALETTE.clothes, look.bottom + 5),
    shoes: pick(LOOK_PALETTE.clothes, look.shoes + 5),
  };
}

/**
 * Рецепт персонажа: шкіра, волосся, верх, низ, взуття й очі — білі заливки `fill-*` кольорами вигляду; плями на одязі
 * (`extra-stain`, у своїх кольорах, у межах силуету); тінь множенням; контур. Форма обличчя, зачіска й статура — це
 * вибір кадрів (`person/head/<обличчя>`…), не рецепт.
 */
export function personRecipe(look: Look, opts: PersonRecipeOptions = {}): TintRecipe {
  const colors = personColors(look);
  const steps: TintStep[] = [
    { layer: "fill-skin", color: colors.skin, put: "source-over" },
    { layer: "fill-top", color: colors.top, put: "source-over" },
    { layer: "fill-bottom", color: colors.bottom, put: "source-over" },
    { layer: "fill-shoes", color: colors.shoes, put: "source-over" },
    { layer: "fill-hair", color: colors.hair, put: "source-over" },
    { layer: "fill-iris", color: colors.iris, put: "source-over" },
    { layer: "detail", color: null, put: "source-over" },
  ];
  if (opts.stained) steps.push({ layer: "extra-stain", color: null, put: "source-atop" });
  steps.push({ layer: "shade", color: SHADE_TINT, tint: "multiply", put: "multiply" }, { layer: "ink", color: null, put: "source-over" });
  const hex = (color: number): string => color.toString(16).padStart(6, "0");
  const key = `person:${[colors.skin, colors.hair, colors.iris, colors.top, colors.bottom, colors.shoes].map(hex).join(".")}${opts.stained ? "/stain" : ""}`;
  return { key, steps };
}

// --- Дальні частини ----------------------------------------------------------------------------

/**
 * Затінення дальніх частин (дальні лапи й вухо кота, дальні рука, нога й черевик персонажа; `CAT_FAR_SLOTS`,
 * `PERSON_FAR_SLOTS`): множник тіні арту `shade` (#3f2541) з непрозорістю `SHADE.base` 0,3 — пропозиція F1b (лист
 * `sheet-chars`), щоб ближній бік читався першим, а лапи не зливалися в одну пляму.
 */
export const FAR_TINT = 0xc5bec6;

/** Заливки, по яких кладеться затінення дальньої частини: увесь силует частини, без контуру. */
const FAR_FILLS: readonly ArtLayer[] = ["fill", "fill-skin", "fill-top", "fill-bottom", "fill-shoes", "fill-hair"];

/**
 * Рецепт дальньої частини: той самий, а перед контуром — увесь силует (заливки) множенням на `FAR_TINT`, тож маски, деталі
 * й тінь темнішають, а контур лишається чорнильним (як на листі F1b). Ключ — з `/far`: дальні кадри запікаються окремо.
 */
export function farRecipe(recipe: TintRecipe, tint = FAR_TINT): TintRecipe {
  const dim: TintStep[] = FAR_FILLS.map((layer) => ({ layer, color: tint, put: "multiply" }));
  const ink = recipe.steps.findIndex((step) => step.layer === "ink");
  const at = ink < 0 ? recipe.steps.length : ink;
  return { key: `${recipe.key}/far`, family: recipe.family ?? recipe.key, steps: [...recipe.steps.slice(0, at), ...dim, ...recipe.steps.slice(at)] };
}

// --- Кольори: обчислення -------------------------------------------------------------------------

const channels = (color: number): [number, number, number] => [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
const pack = (r: number, g: number, b: number): number => (clampInt(r, 0, 255) << 16) | (clampInt(g, 0, 255) << 8) | clampInt(b, 0, 255);

/** Сірий множник: `k` = 0…1 у кожному каналі. */
function gray(k: number): number {
  const v = Math.round(k * 255);
  return pack(v, v, v);
}

/** Множник, що робить `from` кольором `to` (поканально `to / from`, не більше 1): для смуг, що кладуться множенням. */
function ratio(to: number, from: number): number {
  const [tr, tg, tb] = channels(to);
  const [fr, fg, fb] = channels(from);
  const k = (t: number, f: number): number => (f === 0 ? 255 : Math.min(255, Math.round((t / f) * 255)));
  return pack(k(tr, fr), k(tg, fg), k(tb, fb));
}

/** Тьмяна шерсть: колір наполовину сіріє до своєї яскравості й трохи темнішає. */
export function dullColor(color: number): number {
  const [r, g, b] = channels(color);
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  const fade = (c: number): number => Math.round((c + (luma - c) * DULL.desaturate) * DULL.darken);
  return pack(fade(r), fade(g), fade(b));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function pick(list: readonly number[], i: number): number {
  return list[((Math.trunc(i) % list.length) + list.length) % list.length] ?? 0;
}

/** Лише задані поля: `{ dull: undefined }` не затирає стан, узятий із кота. */
function definedOnly(opts: CatRecipeOptions): CatRecipeOptions {
  const out: CatRecipeOptions = {};
  if (opts.dull !== undefined) out.dull = opts.dull;
  if (opts.bald !== undefined) out.bald = opts.bald;
  if (opts.collar !== undefined) out.collar = opts.collar;
  return out;
}
