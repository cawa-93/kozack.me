// Пози фото титрів життя (§4.2): нерухомий кадр тих самих частин скелета, що в грі, — поза, вираз (очі, рот, вуха) і реквізит
// пози з кадрів квартири. Тут лише розрахунок частин і рецептів; малює `src/ui/photo.ts`. Без Phaser і DOM.

import { MIXED } from "../sim/breeds";
import { DEFAULT_LOOK } from "../sim/game";
import { WEIGHT } from "../sim/config";
import type { StoryCat } from "../sim/story";
import type { AlbumEntry, Cat, Genes, Look, Quality, StoryThing, Vec } from "../sim/types";
import { girthOf } from "../sim/weight";
import type { CatAnimId, PersonAnimId } from "./anim/ids";
import type { PortraitPart } from "./art/compose";
import { artEntry } from "./art/manifest";
import { catRecipeOf, farRecipe, personRecipe } from "./art/recipes";
import type { ArtId, ArtLayer, ArtView, TintRecipe } from "./art/types";
import { composeCatAnim, type FaceFrames } from "./iso/catanim";
import { catSize, CAT_FAR_SLOTS, fatStep, ISO_CAT_FIT, ISO_CAT_RIG, isoCatSkin, proportionsOf } from "./iso/catrig";
import { PHONE_HELD, shadowScale } from "./iso/personlook";
import { SEATS } from "./iso/personseat";
import { bubbleArt } from "./iconnames";
import { isoBubbleLook } from "./iso/bubblelook";
import type { CatPhotoPose, PersonPhotoPose, Photo } from "./photo";
import { COAT_ICONS, iconCoat } from "./photocoat";
import type { TraitBubble, TraitPerson, TraitProp, TraitShot } from "./traitphoto/types";
import { CAT_ANIMS, PERSON_ANIMS } from "./rig/anims";
import { PERSON_FAR_SLOTS, PERSON_FIT, PERSON_RIG, personProportions, personSkin } from "./rig/defs/person";
import { Rig, slotFrame } from "./rig/rigcore";
import type { RigAnim } from "./rig/types";
import { isoObjectLook } from "./world/objects";
import { ISO_TILE } from "./world/projection";

type Loose = RigAnim<string, string>;
type LooseRig = Rig<string, string, string>;

// --- Кіт -----------------------------------------------------------------------------------------

/** Кіт для фото: поля, з яких рецепт шерсті й розмір. */
export type PhotoCat = Pick<Cat, "id" | "genes" | "shape" | "diseases" | "collar" | "traits" | "breed" | "ageWeeks" | "weight">;

/** Вигляд кота з альбому: хвороб і нашийника альбом не пам'ятає. Один об'єкт на запис — рецепт кешується за ним (`catRecipeOf`). */
const ALBUM_LOOKS = new WeakMap<AlbumEntry, Pick<Cat, "id" | "genes" | "shape" | "diseases" | "collar">>();

function lookOf(cat: Cat | AlbumEntry): Pick<Cat, "id" | "genes" | "shape" | "diseases" | "collar"> {
  if ("diseases" in cat) return cat;
  let look = ALBUM_LOOKS.get(cat);
  if (!look) {
    look = { id: cat.id, genes: cat.genes, shape: cat.shape, diseases: [], collar: false };
    ALBUM_LOOKS.set(cat, look);
  }
  return look;
}

/** Живий кіт чи запис альбому — у віці `ageWeeks` (кошеня на фото приїзду — мале). */
export function photoCat(cat: Cat | AlbumEntry, ageWeeks: number): PhotoCat {
  const look = lookOf(cat);
  const weight = "weight" in cat ? cat.weight : undefined;
  return { ...look, traits: cat.traits, breed: cat.breed, ageWeeks, ...(weight === undefined ? {} : { weight }) };
}

/** Нерухомий кадр кота: основа, накладка (null — без неї), мить, ракурс, обличчя й чи дивиться ліворуч. */
interface CatStill {
  base: CatAnimId;
  overlay: Loose | null;
  at: number;
  view: ArtView;
  face: FaceFrames;
  flip?: boolean;
  figure?: "fat" | "slim";
  shadow?: false;
}

const face = (eyes: string, mouth: string, ears: FaceFrames["ears"]): FaceFrames => ({ eyes, mouth, ears });

/** Стала поправка кутів кісток поверх основи (градуси; голова: «+» — носом донизу, хвіст: «+» — угору): кадр нерухомий. */
const tweak = (bones: Readonly<Record<string, number>>): Loose => ({
  duration: 1000,
  loop: false,
  bones: Object.fromEntries(Object.entries(bones).map(([id, rot]) => [id, { rot: [{ t: 0, v: rot }] }])),
});

/**
 * Пози кота (§4.2) — підібрані за знімками галереї (вкладка «Фото титрів»), щоб у ≈ 200 px не плутались: цікаво — голова набік і
 * хвіст угору; задоволено — мружиться дужками, як під рукою; спокійно — просто сидить; ображено — насуплено, вуха назад, голова
 * й хвіст опущені (спиною сліпі глядачі бачили спокійного кота); хворий — буханцем, голова похилена, очі хворі. Знаків біля
 * морди (градусник, пара від носа) немає: настрій каже вираз. Годує — буханцем, а не на боці (`sprawl`): на боці мама з хвостом
 * широка, і кошенята віком 0 в полароїді — крихти.
 */
const CAT_STILLS: Readonly<Record<CatPhotoPose, CatStill>> = {
  curious: { base: "sit", overlay: tweak({ head: 16, tail: 95 }), at: 0, view: "front", face: face("round", "closed", "up") },
  wary: { base: "crouch", overlay: null, at: 0, view: "front", face: face("round", "closed", "flat") },
  nursing: { base: "loaf", overlay: null, at: 0, view: "front", face: face("arc", "closed", "up") },
  content: { base: "sit", overlay: CAT_ANIMS.content as Loose, at: 800, view: "front", face: face("arc", "closed", "up") },
  calm: { base: "sit", overlay: null, at: 0, view: "front", face: face("open", "closed", "up") },
  sulk: { base: "sit", overlay: tweak({ head: 18, tail: -40 }), at: 0, view: "front", face: face("squint", "closed", "back") },
  ill: { base: "loaf", overlay: tweak({ neck: 10, head: 14 }), at: 0, view: "front", face: face("sick", "closed", "side") },
};

/** Новонароджене при мамі — спить клубочком. */
const KITTEN_NURSING: CatStill = { base: "sleep", overlay: null, at: 0, view: "front", face: face("closed", "closed", "up") };

const CAT_FAR: ReadonlySet<string> = new Set<string>(CAT_FAR_SLOTS);

function catStill(cat: PhotoCat, pose: CatPhotoPose): CatStill {
  return pose === "nursing" && catSize(cat).kitten > 0 && cat.ageWeeks < 1 ? KITTEN_NURSING : CAT_STILLS[pose];
}

/** Кадри знімків рис — раз на знімок і позу рівня: накладка зі сталих кутів — новий об'єкт, а `composeCatAnim` кешує за ним. */
const SHOT_STILLS = new WeakMap<TraitShot, Map<CatStill, CatStill>>();

/** Поза рівня `life` зі змінами знімка риси (`TraitStill`). */
function withShot(life: CatStill, shot: TraitShot | undefined): CatStill {
  const change = shot?.still;
  if (!shot || !change) return life;
  let byLife = SHOT_STILLS.get(shot);
  if (!byLife) {
    byLife = new Map();
    SHOT_STILLS.set(shot, byLife);
  }
  const have = byLife.get(life);
  if (have) return have;
  const newBase = change.base !== undefined && change.base !== life.base;
  const overlay = change.bones
    ? tweak(change.bones)
    : change.overlay !== undefined
      ? change.overlay === null
        ? null
        : (CAT_ANIMS[change.overlay] as Loose)
      : newBase
        ? null
        : life.overlay;
  const still: CatStill = {
    base: change.base ?? life.base,
    overlay,
    at: change.at ?? (newBase ? 0 : life.at),
    view: change.view ?? life.view,
    face: face(change.eyes ?? life.face.eyes, change.mouth ?? life.face.mouth, change.ears ?? life.face.ears),
    flip: change.flip ?? false,
    ...(change.figure ? { figure: change.figure } : {}),
    ...(change.shadow === false ? { shadow: false as const } : {}),
  };
  byLife.set(life, still);
  return still;
}

/**
 * Інший кіт знімка риси (`TraitCompanion`) — рудий з білим, а біля героя з рудим у шерсті (рудий, кремовий, черепаховий) — сірий
 * з білим, щоб не плутався з героєм; кошеня — того самого вигляду. Для малюнка потрібні лише поля `PhotoCat`, решти полів кота в
 * нього немає.
 */
function companionLook(genes: Pick<Genes, "orange" | "dense">): { cat: Cat; recipe: TintRecipe; far: TintRecipe } {
  const cat = {
    id: 0,
    genes: { ...genes, black: [true, true], agouti: [false, false], tabby: [1, 1], white: [1, 1], full: [true, true], short: [true, true], eyes: 2 },
    shape: { muzzle: "normal", ears: "normal", tail: "long", build: "normal", legs: "normal", coat: null },
    diseases: [],
    collar: false,
    traits: [],
    breed: [MIXED, MIXED],
    ageWeeks: 40,
  } as unknown as Cat;
  const recipe = catRecipeOf(cat);
  return { cat, recipe, far: farRecipe(recipe) };
}
const COMPANION_GINGER = companionLook({ orange: [true], dense: [true, true] });
const COMPANION_GREY = companionLook({ orange: [false], dense: [false, false] });
const companionFor = (hero: Pick<Cat, "genes">) => (hero.genes.orange.some(Boolean) ? COMPANION_GREY : COMPANION_GINGER);
/** Вік іншого кота на фото: дорослий і кошеня, ще кошенячих пропорцій. */
const COMPANION_WEEKS = { adult: 40, kitten: 1 } as const;

/**
 * Пози інших котів як знімки — раз на знімок і кота (`withShot` пам'ятає кадр за знімком): з позою іншого кота й баблами над ним.
 * Той самий кіт-стала може стояти в кількох знімках з різними баблами, тож ключ — знімок героя.
 */
const COMPANION_SHOTS = new WeakMap<TraitShot, TraitShot[]>();

function companionShot(shot: TraitShot, index: number): TraitShot {
  let list = COMPANION_SHOTS.get(shot);
  if (!list) {
    list = (shot.companions ?? []).map((companion, i) => {
      // Над іншим котом бабл — його власний: без `over`.
      const bubbles = (shot.bubbles ?? []).filter((bubble) => bubble.over === i && !bubble.at).map(({ over: _over, ...bubble }) => bubble);
      return { idea: "", still: companion.still, ...(bubbles.length > 0 ? { bubbles } : {}) };
    });
    COMPANION_SHOTS.set(shot, list);
  }
  return list[index]!;
}

/** Розмір речей квартири на фото відносно кота: 1 — як у грі. */
export const PHOTO_PROP_SCALE = 1;

/** Річ квартири (меблі, котячі речі, безлад, взуття персонажа) — на відміну від знака: іконки, ефекту, хмарки. */
const worldProp = (prop: TraitProp): boolean => !prop.sign && /^(env|item|mess|person)\//.test(prop.art);

/**
 * Розмір речі на фото й у скільки разів масштаб гри більший за той, для якого підібрано її місце (`TraitProp.scale`): річ квартири
 * — у масштабі гри (`size` — ще більша, але місця не зсуває), знак — як задано.
 */
function propSize(prop: TraitProp): { size: number; grow: number } {
  const own = prop.scale ?? 1;
  return worldProp(prop) ? { size: PHOTO_PROP_SCALE * (prop.size ?? 1), grow: PHOTO_PROP_SCALE / own } : { size: own, grow: 1 };
}

/** Кадр речі в заданому розмірі (`TraitProp.scale`) там, де вона стоїть: з віддзеркаленням і поворотом. */
function propBox(prop: TraitProp): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const entry = artEntry(prop.art);
  if (!entry) return null;
  const own = prop.scale ?? 1;
  const rad = ((prop.rot ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [cx, cy] of [
    [0, 0],
    [entry.size.w, 0],
    [entry.size.w, entry.size.h],
    [0, entry.size.h],
  ] as const) {
    const dx = (cx - entry.pivot.x) * own * (prop.flip ? -1 : 1);
    const dy = (cy - entry.pivot.y) * own;
    const x = prop.x + dx * cos - dy * sin;
    const y = prop.y + dx * sin + dy * cos;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

/** На скільки ширший кадр більшої речі, коли шукаємо, що на ній стоїть: шкарпетка визирає з-під самого краю дивана. */
const RIDE_MARGIN = 8;
/** У скільки разів більший (за площею кадру) той, із ким річ їде. */
const RIDE_BIGGER = 1.5;

/**
 * Місця pivot речей знімка. Річ квартири, збільшена до масштабу гри, росте від найближчої до кореня кота точки свого кадру (кіт
 * стоїть на ній — від самого кореня): під котом лишається та сама точка дивана чи стільниці, миска — біля морди, а шафа поруч не
 * налазить на кота й не від'їжджає від нього. Річ, що стоїть у межах кадру більшої (тарілка на столі, шкарпетки під диваном), їде
 * разом із нею. Знак — де задано.
 */
function propPlaces(props: readonly TraitProp[]): Map<TraitProp, { x: number; y: number }> {
  const grown = props.flatMap((prop) => {
    const box = worldProp(prop) ? propBox(prop) : null;
    if (!box) return [];
    // Найближча до кореня кота точка кадру.
    const anchor = { x: Math.min(box.maxX, Math.max(box.minX, 0)), y: Math.min(box.maxY, Math.max(box.minY, 0)) };
    return [{ prop, box, anchor, grow: propSize(prop).grow, area: (box.maxX - box.minX) * (box.maxY - box.minY) }];
  });
  const places = new Map<TraitProp, { x: number; y: number }>();
  for (const prop of props) {
    const own = grown.find((item) => item.prop === prop);
    if (!own) {
      places.set(prop, { x: prop.x, y: prop.y });
      continue;
    }
    const base = grown
      .filter(
        (item) =>
          item.area > own.area * RIDE_BIGGER &&
          prop.x >= item.box.minX - RIDE_MARGIN &&
          prop.x <= item.box.maxX + RIDE_MARGIN &&
          prop.y >= item.box.minY - RIDE_MARGIN &&
          prop.y <= item.box.maxY + RIDE_MARGIN,
      )
      .sort((a, b) => b.area - a.area)[0];
    const by = base ?? own;
    places.set(prop, { x: by.anchor.x + (prop.x - by.anchor.x) * by.grow, y: by.anchor.y + (prop.y - by.anchor.y) * by.grow });
  }
  return places;
}

/** Річ знімка риси на місці `at`: воно однакове для кота будь-якого розміру. */
function propPart(prop: TraitProp, at: { x: number; y: number }): PortraitPart {
  const { size } = propSize(prop);
  return { ...framePart(prop.art, prop.state), ...at, rot: prop.rot ?? 0, scaleX: prop.flip ? -size : size, scaleY: size };
}

/**
 * Розмір бабла на фото. У грі бабл (`ISO_BUBBLE_SCALE`) — над котом у квартирі, де той займає кілька відсотків екрана; на фото
 * кіт — на весь полароїд, тож бабл менший, щоб не закривав кота й речі.
 */
export const PHOTO_BUBBLE_SCALE = 0.5;

/** Вістря бабла від якоря `head` скелета (над вухами), одиниці фото: трохи вперед і вгору. */
const BUBBLE_FROM_HEAD = { x: 8, y: -6 } as const;

/** Бабл гри (`TraitBubble`) над точкою `head` (якір голови, уже з віддзеркаленням); `dir` — куди дивиться кіт (1 — праворуч). */
function bubbleParts(bubble: TraitBubble, head: { x: number; y: number }, dir: 1 | -1): PortraitPart[] {
  return bubbleAt(bubble, { x: head.x + dir * (BUBBLE_FROM_HEAD.x + (bubble.dx ?? 0)), y: head.y + BUBBLE_FROM_HEAD.y + (bubble.dy ?? 0) });
}

/** Бабл гри вістрям у точці `tip`. */
function bubbleAt(bubble: TraitBubble, tip: { x: number; y: number }): PortraitPart[] {
  const look = isoBubbleLook(bubble.kind);
  const s = PHOTO_BUBBLE_SCALE;
  const icon = { x: tip.x + look.icon.x * s, y: tip.y + look.icon.y * s, scaleX: s, scaleY: s };
  return [
    { ...framePart(bubbleArt(bubble.kind), null), ...tip, scaleX: s, scaleY: s },
    { ...framePart(`icon/${bubble.icon}`, null), ...icon },
    ...(bubble.mark ? [{ ...framePart(`icon/mark/${bubble.mark}`, null), ...icon }] : []),
  ];
}

/**
 * Частини кота в позі фото: корінь — у (0, 0), масштаб — як у грі (кошеня менше, порода — свій розмір), тінь під ним — як у грі
 * (`catview.ts`: ширша на обхват). Знімок риси `shot` змінює позу й ставить речі: позаду кота — до нього, поверх — після.
 */
export function catPhotoParts(story: StoryCat, pose: CatPhotoPose, shot?: TraitShot): PortraitPart[] {
  const { behind, body, front, bubbles } = catPhotoPieces(story, pose, shot);
  return [...behind.map((piece) => piece.part), ...body, ...front.map((piece) => piece.part), ...bubbles];
}

/** Річ знімка на фото: `soft` — річ квартири (край фото її обрізає), інакше знак, що в кадрі завжди цілком. */
interface PropPiece {
  part: PortraitPart;
  soft: boolean;
}

/** Кіт фото частинами: речі позаду, сам кіт (з тінню й речами на ньому), речі поверх і бабли над ним. */
interface CatPieces {
  behind: PropPiece[];
  body: PortraitPart[];
  front: PropPiece[];
  bubbles: PortraitPart[];
}

/** Найбільший обхват (`girthOf` при найбільшій вазі): статура `fat` знімка. */
const FAT_GIRTH = 1 + WEIGHT.girthStep;

/**
 * Частини кота окремо від баблів над ним: на фото бабли — поверх усіх героїв. `breed` — множник розміру поверх власного (інший кіт
 * знімка — за породою героя).
 */
function catPhotoPieces(story: StoryCat, pose: CatPhotoPose, shot?: TraitShot, breed = 1): CatPieces {
  const cat = photoCat(story.cat, story.ageWeeks);
  const still = withShot(catStill(cat, pose), shot);
  const own = catSize(cat);
  const size = { ...own, scale: own.scale * breed, relative: own.relative * breed };
  const shape = still.figure === "slim" ? { ...cat.shape, build: "slim" as const } : cat.shape;
  // Повнота — за вагою; у запису альбому ваги немає — звичайна.
  const girth = still.figure === "fat" ? FAT_GIRTH : still.figure === "slim" ? 1 : girthOf(cat as Cat);
  const rig = new Rig(ISO_CAT_RIG, {
    fit: ISO_CAT_FIT,
    lookup: artEntry,
    skin: isoCatSkin(shape, false),
    proportions: proportionsOf(shape, size.kitten, fatStep(girth)),
    facing: { view: still.view, flip: false },
  }) as unknown as LooseRig;
  rig.play(composeCatAnim(CAT_ANIMS[still.base] as Loose, still.overlay, still.face) as never, 0, { blend: 0 });
  rig.evaluate(still.at);
  const shadow: PortraitPart = { ...framePart("fx/shadow/cat", null), x: 0, y: 0, scaleX: size.scale * girth, scaleY: size.scale };
  const all = shot?.props ?? [];
  // Річ на коті (у зубах, на маківці) — його частина: з ним віддзеркалюється. Знак меншає з кошеням, річ квартири — ні.
  const carried = all.flatMap((prop): PortraitPart[] => {
    if (!prop.socket) return [];
    const at = prop.socket === "head" ? rig.anchor("head", { x: 0, y: 0 }, false) : (rig.socket("teeth", undefined, false) ?? rig.anchor("mouth", { x: 0, y: 0 }, false));
    if (!at) return [];
    const { size: drawn, grow } = propSize(prop);
    const world = worldProp(prop);
    const s = world ? drawn : drawn * size.scale;
    const shift = world ? grow : size.scale;
    return [{ ...framePart(prop.art, prop.state), x: at.x * size.scale + prop.x * shift, y: at.y * size.scale + prop.y * shift, rot: prop.rot ?? 0, scaleX: prop.flip ? -s : s, scaleY: s }];
  });
  const self = [...(still.shadow === false ? [] : [shadow]), ...rigParts(rig, still.view, CAT_FAR, size.scale), ...carried];
  const props = all.filter((prop) => !prop.socket);
  const places = propPlaces(props);
  const placed = (prop: TraitProp): PropPiece => ({ part: propPart(prop, places.get(prop) ?? prop), soft: worldProp(prop) });
  const behind = props.filter((prop) => !prop.front).map(placed);
  const body = still.flip ? self.map(mirrored) : self;
  const front = props.filter((prop) => prop.front).map(placed);
  const ownBubbles = (shot?.bubbles ?? []).filter((bubble) => bubble.over === undefined && !bubble.at);
  if (ownBubbles.length === 0) return { behind, body, front, bubbles: [] };
  const anchor = rig.anchor("head", { x: 0, y: 0 }, false) ?? { x: 0, y: 0 };
  const dir = still.flip ? -1 : 1;
  const head = { x: anchor.x * size.scale * dir, y: anchor.y * size.scale };
  return { behind, body, front, bubbles: ownBubbles.flatMap((bubble) => bubbleParts(bubble, head, dir)) };
}

// --- Персонаж ------------------------------------------------------------------------------------

/** Нерухомий кадр персонажа: анімація, мить, ракурс і реквізит. */
interface PersonStill {
  anim: PersonAnimId;
  at: number;
  view: ArtView;
  props: Prop | null;
  phone: boolean;
  /** Стан очей замість того, що дає анімація; null — як у анімації. */
  eyes: string | null;
}

/** Реквізит пози — кадри квартири там, де вони стоять відносно персонажа (`world/objects.ts`), і що з них перед ним. */
interface Prop {
  behind: PortraitPart[];
  front: PortraitPart[];
}

/** Точка підлоги `p` (клітинки) відносно `from` — на екрані, одиниці арту (ізометрія 2:1, `world/projection.ts`). */
function screenOffset(p: Vec, from: Vec): { x: number; y: number } {
  const dx = p.x - from.x;
  const dy = p.y - from.y;
  return { x: ((dx - dy) * ISO_TILE.width) / 2, y: ((dx + dy) * ISO_TILE.height) / 2 };
}

/** Річ квартири `object` кадром `id` (стан `state`), відносно того, хто нею користується (`use.at`). */
function objectPart(object: string, id: ArtId, state: string | null): PortraitPart {
  const look = isoObjectLook(object);
  const f = look.footprint;
  const at = screenOffset({ x: (f.x0 + f.x1) / 2, y: (f.y0 + f.y1) / 2 }, look.use?.at ?? { x: 0, y: 0 });
  return { ...framePart(id, state), ...at };
}

function framePart(id: ArtId, state: string | null): PortraitPart {
  const frame = slotFrame(id, artEntry(id), state, "front");
  return { id, state: frame.state, view: frame.view };
}

/** Стіл із комп'ютером і висунуте крісло, як у квартирі (`iso/personseat.ts`): крісло — під тим, хто сидить, у `use.at`. */
function deskProps(): Prop {
  const chair = SEATS.find((seat) => seat.object === "computer")?.art ?? "env/chair-desk";
  return { behind: [objectPart("computer", "env/computer", "on"), framePart(chair, "seat")], front: [framePart(chair, "backrest")] };
}

/** Купа ящиків, з якої розпаковують речі. */
function boxesProps(): Prop {
  return { behind: [objectPart("boxes", "env/boxes", "pile-3")], front: [] };
}

/**
 * Пози персонажа (§4.2). Розпаковує — над ящиками, як біля них у квартирі (спиною до камери); за столом — за комп'ютером, як у
 * квартирі (спиною до камери: крісло з квартири видно лише ззаду); понуро — стоїть знесилено, голова й плечі опущені, очі долу;
 * телефон — біля вуха.
 */
const PERSON_STILLS: Readonly<Record<PersonPhotoPose, PersonStill>> = {
  unpack: { anim: "unpack", at: 420, view: "back", props: boxesProps(), phone: false, eyes: null },
  desk: { anim: "work", at: 0, view: "back", props: deskProps(), phone: false, eyes: null },
  gloomy: { anim: "exhausted", at: 0, view: "front", props: null, phone: false, eyes: "half" },
  phone: { anim: "phone", at: 0, view: "front", props: null, phone: true, eyes: null },
  proud: { anim: "idle", at: 0, view: "front", props: null, phone: false, eyes: null },
};

const PERSON_FAR: ReadonlySet<string> = new Set<string>(PERSON_FAR_SLOTS);

/** Частини персонажа в позі фото з реквізитом: ноги — у (0, 0). */
export function personPhotoParts(look: Look, pose: PersonPhotoPose): PortraitPart[] {
  const still = PERSON_STILLS[pose];
  const rig = new Rig(PERSON_RIG, {
    fit: PERSON_FIT,
    lookup: artEntry,
    skin: personSkin(look),
    proportions: personProportions(look),
    facing: { view: still.view, flip: false },
  }) as unknown as LooseRig;
  rig.play(PERSON_ANIMS[still.anim] as never, 0, { blend: 0 });
  rig.evaluate(still.at);
  const held = still.phone ? phonePart(rig) : null;
  const parts = rigParts(rig, still.view, PERSON_FAR, 1, held);
  const eyes = still.eyes;
  const shown = eyes === null ? parts : parts.map((part) => (part.id === "person/eyes" ? { ...part, state: eyes } : part));
  // Тінь під ногами — як у грі (`iso/person.ts`): ширша за статурою.
  const scale = shadowScale({ x: 1, y: 1 }, look.build);
  const shadow: PortraitPart = { ...framePart("fx/shadow/person", null), x: 0, y: 0, scaleX: scale.x, scaleY: scale.y };
  return [...(still.props?.behind ?? []), shadow, ...shown, ...(still.props?.front ?? [])];
}

/** Телефон біля вуха в гнізді `held`, як у грі (`PHONE_HELD`): у гнізді — не pivot кадру, а точка `shift` від нього. */
function phonePart(rig: LooseRig): PortraitPart | null {
  const socket = rig.socket("held");
  if (!socket) return null;
  const rad = (socket.rot * Math.PI) / 180;
  const sx = PHONE_HELD.shift.x * PHONE_HELD.scale;
  const sy = PHONE_HELD.shift.y * PHONE_HELD.scale;
  return {
    ...framePart(PHONE_HELD.frame.id, PHONE_HELD.frame.state ?? null),
    x: socket.x - (Math.cos(rad) * sx - Math.sin(rad) * sy),
    y: socket.y - (Math.sin(rad) * sx + Math.cos(rad) * sy),
    rot: socket.rot,
    scaleX: PHONE_HELD.scale,
    scaleY: PHONE_HELD.scale,
  };
}

/** Персонаж у кадрі знімка риси (`TraitPerson`): анімація, мить і реквізит під ним (крісло, у якому він сидить). */
const PERSON_IN_SHOT: Readonly<Record<Exclude<TraitPerson["pose"], "bed">, { anim: PersonAnimId; at: number; chair: boolean }>> = {
  stand: { anim: "idle", at: 0, chair: false },
  walk: { anim: "walk", at: 150, chair: false },
  lap: { anim: "work", at: 0, chair: true },
  pet: { anim: "pet", at: 400, chair: false },
  bitten: { anim: "bitten", at: 90, chair: false },
};

function personShotRig(look: Look, pose: TraitPerson["pose"]): LooseRig {
  const still = PERSON_IN_SHOT[pose === "bed" ? "stand" : pose];
  const rig = new Rig(PERSON_RIG, {
    fit: PERSON_FIT,
    lookup: artEntry,
    skin: personSkin(look),
    proportions: personProportions(look),
    facing: { view: "front", flip: false },
  }) as unknown as LooseRig;
  rig.play(PERSON_ANIMS[still.anim] as never, 0, { blend: 0 });
  rig.evaluate(still.at);
  return rig;
}

/** Чим персонаж знімка торкається кота: стоїть — ногами, сидить — колінами, гладить — долонею. */
const PERSON_CONTACT: Readonly<Record<TraitPerson["pose"], "lap" | "hands" | null>> = { stand: null, walk: null, lap: "lap", pet: "hands", bitten: "hands", bed: null };

/**
 * Точка дотику персонажа знімка риси (`TraitPerson`) від його ніг, одиниці фото: коліна (`lap`), долоня (`pet`); стоїть — самі
 * ноги. Біля меншого кота разом із котом зсувається вона, а не ноги: інакше кошеня не на колінах, а рука — не над ним.
 */
export function personShotContact(look: Look, person: Pick<TraitPerson, "pose" | "flip">): { x: number; y: number } {
  const anchor = PERSON_CONTACT[person.pose];
  const at = anchor ? personShotRig(look, person.pose).anchor(anchor, { x: 0, y: 0 }, false) : null;
  if (!at) return { x: 0, y: 0 };
  return { x: person.flip ? -at.x : at.x, y: at.y };
}

/** Частини персонажа знімка риси: ноги — у (0, 0), спереду, як у квартирі; крісло — під ним, позаду; `head` — якір над головою. */
function personShotParts(look: Look, pose: TraitPerson["pose"]): { parts: { part: PortraitPart; person: boolean }[]; head: { x: number; y: number } } {
  if (pose === "bed") return { parts: sleeperHead(look).map((part) => ({ part, person: true })), head: { x: 0, y: -SLEEPER.face } };
  const still = PERSON_IN_SHOT[pose];
  const rig = personShotRig(look, pose);
  const head = rig.anchor("head", { x: 0, y: 0 }, false) ?? { x: 0, y: 0 };
  const chair = SEATS.find((seat) => seat.object === "computer")?.art ?? "env/chair-desk";
  return {
    parts: [
      ...(still.chair ? [framePart(chair, "backrest"), framePart(chair, "seat")].map((part) => ({ part, person: false })) : []),
      ...rigParts(rig, "front", PERSON_FAR, 1).map((part) => ({ part, person: true })),
    ],
    head,
  };
}

/** Слоти голови персонажа: лише їх видно з-під ковдри. */
const HEAD_SLOTS: ReadonlySet<string> = new Set(["hair-back", "head", "eyes", "hair-front"]);
/**
 * Голова на подушці ліжка `env/bed`: тіло лежить уздовж ліжка, від подушки до ковдри, — на фото це вниз і ліворуч, тож голова
 * нахилена на `rot` за годинниковою стрілкою; `face` — від шиї (pivot голови) до середини обличчя, одиниці арту.
 */
const SLEEPER = { rot: 60, face: 20 } as const;

/** Голова персонажа, що спить під ковдрою: очі заплющені; (0, 0) — середина обличчя. */
function sleeperHead(look: Look): PortraitPart[] {
  const rig = personShotRig(look, "stand");
  const parts = rigParts(rig, "front", PERSON_FAR, 1, null, HEAD_SLOTS);
  const neck = parts.find((part) => part.id.startsWith("person/head/")) ?? { x: 0, y: 0 };
  const rad = (SLEEPER.rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return parts.map((part) => {
    // Від шиї, а шия — на `face` нижче середини обличчя (до повороту).
    const x = (part.x ?? 0) - (neck.x ?? 0);
    const y = (part.y ?? 0) - (neck.y ?? 0) + SLEEPER.face;
    return { ...part, ...(part.id === "person/eyes" ? { state: "closed" } : {}), x: x * cos - y * sin, y: x * sin + y * cos, rot: (part.rot ?? 0) + SLEEPER.rot };
  });
}

// --- Річ -----------------------------------------------------------------------------------------

/**
 * Річ на фото — працює й повна, як у квартирі: робот прибирає; фонтанчик — накладка на миску з водою (той самий pivot), годівниця
 * — бункер позаду миски з кормом (миску гра малює перед ним).
 */
export function thingPhotoParts(thing: StoryThing, quality: Quality): PortraitPart[] {
  switch (thing) {
    case "robot":
      return [framePart(`item/robot/${quality}`, "cleaning")];
    case "fountain":
      return [framePart(`item/water/${quality}`, "full"), framePart(`item/fountain/${quality}`, "on")];
    case "feeder":
      return [framePart(`item/feeder/${quality}`, `${quality}-full`), framePart(`item/bowl/${quality}`, `${quality}-2`)];
    // Кавомашина — без якостей; варить каву: чашка під носиком, у точці `cup` машини.
    case "coffee": {
      const machine = artEntry("item/coffee");
      const cup = machine?.points?.["cup"];
      const at = machine && cup ? { x: cup.x - machine.pivot.x, y: cup.y - machine.pivot.y } : { x: 0, y: 0 };
      return [framePart("item/coffee", null), { ...framePart("item/coffee/cup", null), ...at }];
    }
  }
}

// --- Скелет → частини ----------------------------------------------------------------------------

/**
 * Частини скелета знизу догори (як `personPortraitParts`): кадр — як у грі (`slotFrame`), дальні — затінені; `scale` — масштаб усього
 * скелета від кореня; `held` — річ у гнізді `held` на його місці в порядку малювання.
 */
function rigParts(rig: LooseRig, view: ArtView, far: ReadonlySet<string>, scale: number, held: PortraitPart | null = null, only: ReadonlySet<string> | null = null): PortraitPart[] {
  const parts: PortraitPart[] = [];
  for (const item of rig.order) {
    if (item.kind === "socket") {
      if (held && item.id === "held") parts.push(held);
      continue;
    }
    const pose = rig.slots[item.index];
    if (!pose || !pose.visible || pose.art === null || (only && !only.has(pose.id))) continue;
    const frame = slotFrame(pose.art, artEntry(pose.art), pose.state, view);
    parts.push({
      id: pose.art,
      state: frame.state,
      view: frame.view,
      x: pose.x * scale,
      y: pose.y * scale,
      rot: pose.rot,
      scaleX: pose.sx * scale,
      scaleY: pose.sy * scale,
      ...(far.has(pose.id) ? { far: true } : {}),
    });
  }
  return parts;
}

// --- Розклад фото --------------------------------------------------------------------------------

/** Частина фото з рецептом, яким її фарбують (дальні частини — уже затіненим). */
export interface PhotoPiece {
  part: PortraitPart;
  recipe: TintRecipe;
  /** Не входить у рамку фото: виходить за край (персонаж у знімку риси — видно лише те, що поруч із котом). */
  bleed?: true;
  /** Річ квартири в знімку: у рамку входить лише доки та не завелика — кадр задають герої й знаки (`layoutFrame`). */
  soft?: true;
  /** Колір шерсті замість рудого кота іконки (`recolorCoat`). */
  coat?: number;
}

export interface PhotoLayout {
  /** Частини всіх героїв знизу догори. */
  pieces: PhotoPiece[];
  /**
   * Найменша рамка фото, одиниці арту: менший за неї герой не розтягується на все фото — кошеня лишається малим, а річ — річчю,
   * а не на весь полароїд.
   */
  span: { w: number; h: number };
}

/** Рамка фото кота — дорослий кіт, що сидить, з полем; речі — трохи менша, щоб робот не був завбільшки з кота. */
const CAT_SPAN = { w: 100, h: 100 } as const;
const THING_SPAN = { w: 84, h: 84 } as const;
const NO_SPAN = { w: 0, h: 0 } as const;

/** Кадри без шарів (речі, тіні, реквізит) — шар `all` як є. */
const AS_IS: TintRecipe = { key: "photo/as-is", steps: [{ layer: "all" as ArtLayer, color: null, put: "source-over" }] };

/**
 * Де кошенята при мамі, що лежить на боці (одиниці арту від її кореня): уздовж живота, ближче до камери, від середини в боки; без
 * мами — рядком з кроком `KITTEN_STEP`.
 */
const KITTEN_SPOTS: readonly { x: number; y: number }[] = [
  { x: -2, y: 12 },
  { x: -22, y: 9 },
  { x: 18, y: 9 },
];
const KITTEN_STEP = 26;
/** Коти дому на фото пенсії — обабіч персонажа, третій — далі праворуч; так, щоб хвости не лягали на ноги персонажа. */
const BESIDE_SPOTS: readonly { x: number; y: number }[] = [
  { x: 50, y: 8 },
  { x: -50, y: 10 },
  { x: 92, y: 3 },
];

/** Хто й де на фото: частини всіх героїв і рецепти; хто ближче до камери (більший y місця) — пізніше. */
export function photoLayout(photo: Photo): PhotoLayout {
  const groups: { y: number; pieces: PhotoPiece[] }[] = [];
  /** Бабли — поверх усіх героїв. */
  const bubbles: PhotoPiece[] = [];
  let span: { w: number; h: number } = NO_SPAN;
  let frame: { w: number; h: number } | null = null;
  const cats = photo.subjects.filter((s) => s.kind === "cat");
  const mother = cats.find((s) => s.pose === "nursing" && catSize(photoCat(s.cat.cat, s.cat.ageWeeks)).kitten === 0);
  const young = cats.filter((s) => s !== mother);
  const person = photo.subjects.some((s) => s.kind === "person");
  for (const subject of photo.subjects) {
    const pieces: PhotoPiece[] = [];
    let y = 0;
    if (subject.kind === "cat") {
      span = CAT_SPAN;
      const recipe = catRecipeOf(lookOf(subject.cat.cat));
      const far = farRecipe(recipe);
      const i = young.indexOf(subject);
      const at = person
        ? (BESIDE_SPOTS[i % BESIDE_SPOTS.length] ?? { x: 0, y: 0 })
        : !mother || i < 0
          ? { x: young.length > 1 && i >= 0 ? (i - (young.length - 1) / 2) * KITTEN_STEP : 0, y: 0 }
          : (KITTEN_SPOTS[i % KITTEN_SPOTS.length] ?? { x: 0, y: 0 });
      y = at.y;
      // На фото пенсії коти дивляться на персонажа: кіт праворуч від нього — віддзеркалений (кадри кота дивляться праворуч).
      const turn = person && at.x > 0;
      const hero = catPhotoPieces(subject.cat, subject.pose, subject.shot);
      // Речі персонажа в знімку (капці) — у вигляді гравця, як і він сам.
      const worn = subject.shot?.props?.some((prop) => prop.art.startsWith("person/")) ? personRecipe(subject.look ?? DEFAULT_LOOK) : AS_IS;
      const piece = (part: PortraitPart, soft: boolean): PhotoPiece => {
        const tint = part.id.startsWith("cat/") ? (part.far ? far : recipe) : part.id.startsWith("person/") ? worn : AS_IS;
        return { part: shifted(turn ? mirrored(part) : part, at), recipe: tint, ...(soft ? { soft: true as const } : {}) };
      };
      const sleeper: PhotoPiece[] = [];
      for (const { part, soft } of hero.behind) pieces.push(piece(part, soft));
      // Голова персонажа, що спить у ліжку, — поверх ліжка (речі позаду), під котом.
      const bedAt = pieces.length;
      for (const part of hero.body) pieces.push(piece(part, false));
      for (const { part, soft } of hero.front) pieces.push(piece(part, soft));
      const ownCoat = iconCoat(lookOf(subject.cat.cat));
      for (const part of hero.bubbles) bubbles.push(bubblePiece(shifted(part, at), ownCoat));
      // Бабл речі (дзвінок у двері) — у своїй точці, без шерсті героя: каже не кіт.
      for (const bubble of subject.shot?.bubbles ?? []) {
        if (bubble.at) for (const part of bubbleAt(bubble, bubble.at)) bubbles.push({ part: shifted(part, at), recipe: AS_IS });
      }
      // Інші коти знімка риси — окремими героями: свій вигляд, розмір за породою героя (не за його віком) і своє місце в черзі за
      // відстанню до камери.
      const size = catSize(photoCat(subject.cat.cat, subject.cat.ageWeeks));
      const shot = subject.shot;
      const mate = companionFor(lookOf(subject.cat.cat));
      for (const [i, companion] of (shot?.companions ?? []).entries()) {
        const spot = { x: at.x + companion.x * size.relative, y: at.y + companion.y * size.relative };
        const other = catPhotoPieces({ cat: mate.cat, ageWeeks: companion.weeks ?? COMPANION_WEEKS[companion.age] }, "calm", companionShot(shot!, i), size.breed);
        groups.push({ y: spot.y, pieces: other.body.map((part) => ({ part: shifted(part, spot), recipe: part.id.startsWith("cat/") ? (part.far ? mate.far : mate.recipe) : AS_IS })) });
        for (const part of other.bubbles) bubbles.push(bubblePiece(shifted(part, spot), iconCoat(mate.cat)));
      }
      // Персонаж знімка — у вигляді гравця, поза рамкою фото: позаду всіх героїв чи поверх них.
      if (shot?.person) {
        const look = subject.look ?? DEFAULT_LOOK;
        const own = personRecipe(look);
        const ownFar = farRecipe(own);
        const contact = personShotContact(look, shot.person);
        const spot = {
          x: at.x + (shot.person.x + contact.x) * size.relative - contact.x,
          y: at.y + (shot.person.y + contact.y) * size.relative - contact.y,
        };
        const figure = personShotParts(look, shot.person.pose);
        const parts = figure.parts.map(({ part, person: body }): PhotoPiece => ({
          part: shifted(shot.person?.flip ? mirrored(part) : part, spot),
          recipe: body && part.id.startsWith("person/") ? (part.far ? ownFar : own) : AS_IS,
          bleed: true,
        }));
        if (shot.person.pose === "bed") sleeper.push(...parts);
        else groups.push({ y: shot.person.front ? Infinity : -Infinity, pieces: parts });
        const dir = shot.person.flip ? -1 : 1;
        const head = { x: spot.x + figure.head.x * dir, y: spot.y + figure.head.y };
        for (const bubble of shot.bubbles ?? []) {
          if (bubble.over === "person" && !bubble.at) for (const part of bubbleParts(bubble, head, dir)) bubbles.push({ part, recipe: AS_IS });
        }
      }
      if (shot?.frame) frame = shot.frame;
      pieces.splice(bedAt, 0, ...sleeper);
    } else if (subject.kind === "person") {
      const recipe = personRecipe(subject.look);
      const far = farRecipe(recipe);
      for (const part of personPhotoParts(subject.look, subject.pose)) pieces.push({ part, recipe: part.id.startsWith("person/") ? (part.far ? far : recipe) : AS_IS });
    } else {
      span = THING_SPAN;
      for (const part of thingPhotoParts(subject.thing, subject.quality)) pieces.push({ part, recipe: AS_IS });
    }
    groups.push({ y, pieces });
  }
  groups.sort((a, b) => a.y - b.y);
  // З персонажем фото вписується за силуетом: рамка кота стиснула б персонажа.
  return { pieces: [...groups.flatMap((group) => group.pieces), ...bubbles], span: person ? NO_SPAN : (frame ?? span) };
}

/** Частина бабла; кіт в іконці — шерстю того, над ким бабл (`photocoat.ts`). */
function bubblePiece(part: PortraitPart, coat: number | undefined): PhotoPiece {
  const cat = coat !== undefined && part.id.startsWith("icon/") && COAT_ICONS.has(part.id.slice(5));
  return { part, recipe: AS_IS, ...(cat ? { coat } : {}) };
}

/** Частина фігури, віддзеркалена довкола її початку: так фігура дивиться в інший бік (`partMatrix`: x, кут і `scaleX` — навпаки). */
function mirrored(part: PortraitPart): PortraitPart {
  return { ...part, x: -(part.x ?? 0), rot: -(part.rot ?? 0), scaleX: -(part.scaleX ?? 1) };
}

function shifted(part: PortraitPart, by: { x: number; y: number }): PortraitPart {
  if (by.x === 0 && by.y === 0) return part;
  return { ...part, x: (part.x ?? 0) + by.x, y: (part.y ?? 0) + by.y };
}
