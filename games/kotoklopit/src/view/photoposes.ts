// Пози фото титрів життя (§4.2): нерухомий кадр тих самих частин скелета, що в грі, — поза, вираз (очі, рот, вуха) і реквізит
// пози з кадрів квартири. Тут лише розрахунок частин і рецептів; малює `src/ui/photo.ts`. Без Phaser і DOM.

import { MIXED } from "../sim/breeds";
import { DEFAULT_LOOK } from "../sim/game";
import { WEIGHT } from "../sim/config";
import type { StoryCat } from "../sim/story";
import type { AlbumEntry, Cat, Look, Quality, StoryThing, Vec } from "../sim/types";
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
 * хвіст угору; задоволено — мружиться дужками, як під рукою; спокійно — просто сидить; ображено — насуплено, голова й хвіст
 * опущені (спиною сліпі глядачі бачили спокійного кота, а річ поруч — «нюхає»); хворий — буханцем, голова похилена, очі хворі
 * (без сльози хворого читали як сумного чи сонного). Годує — буханцем, а не на боці (`sprawl`): на боці мама з хвостом широка, і
 * кошенята віком 0 в полароїді — крихти.
 */
const CAT_STILLS: Readonly<Record<CatPhotoPose, CatStill>> = {
  curious: { base: "sit", overlay: tweak({ head: 16, tail: 95 }), at: 0, view: "front", face: face("round", "closed", "up") },
  wary: { base: "crouch", overlay: null, at: 0, view: "front", face: face("round", "closed", "flat") },
  nursing: { base: "loaf", overlay: null, at: 0, view: "front", face: face("arc", "closed", "up") },
  content: { base: "sit", overlay: CAT_ANIMS.content as Loose, at: 800, view: "front", face: face("arc", "closed", "up") },
  calm: { base: "sit", overlay: null, at: 0, view: "front", face: face("open", "closed", "up") },
  sulk: { base: "sit", overlay: tweak({ head: 12, tail: -30 }), at: 0, view: "front", face: face("half", "closed", "flat") },
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
 * Інший кіт знімка риси (`TraitCompanion`) — сірий з білим, завжди той самий, щоб не плутався з героєм; кошеня — того самого
 * вигляду. Для малюнка потрібні лише поля `PhotoCat`, решти полів кота в нього немає.
 */
const COMPANION = {
  id: 0,
  genes: { orange: [false], black: [true, true], dense: [false, false], agouti: [false, false], tabby: [1, 1], white: [1, 1], full: [true, true], short: [true, true], eyes: 2 },
  shape: { muzzle: "normal", ears: "normal", tail: "long", build: "normal", legs: "normal", coat: null },
  diseases: [],
  collar: false,
  traits: [],
  breed: [MIXED, MIXED],
  ageWeeks: 40,
} as unknown as Cat;
const COMPANION_RECIPE = catRecipeOf(COMPANION);
const COMPANION_FAR = farRecipe(COMPANION_RECIPE);
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
      const bubbles = (shot.bubbles ?? []).filter((bubble) => bubble.over === i).map(({ over: _over, ...bubble }) => bubble);
      return { idea: "", still: companion.still, ...(bubbles.length > 0 ? { bubbles } : {}) };
    });
    COMPANION_SHOTS.set(shot, list);
  }
  return list[index]!;
}

/**
 * Річ знімка риси: місце — від кореня кота за розміром кота (`CatSize.relative`), розмір — свій, а в речі «за котом» (`withCat`) —
 * теж за ним.
 */
function propPart(prop: TraitProp, scale: number): PortraitPart {
  const size = (prop.scale ?? 1) * (prop.withCat ? scale : 1);
  return { ...framePart(prop.art, prop.state), x: prop.x * scale, y: prop.y * scale, rot: prop.rot ?? 0, scaleX: prop.flip ? -size : size, scaleY: size };
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
  const look = isoBubbleLook(bubble.kind);
  const s = PHOTO_BUBBLE_SCALE;
  const tip = { x: head.x + dir * (BUBBLE_FROM_HEAD.x + (bubble.dx ?? 0)), y: head.y + BUBBLE_FROM_HEAD.y + (bubble.dy ?? 0) };
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
  const { parts, bubbles } = catPhotoPieces(story, pose, shot);
  return [...parts, ...bubbles];
}

/** Найбільший обхват (`girthOf` при найбільшій вазі): статура `fat` знімка. */
const FAT_GIRTH = 1 + WEIGHT.girthStep;

/**
 * Частини кота окремо від баблів над ним: на фото бабли — поверх усіх героїв. `breed` — множник розміру поверх власного (інший кіт
 * знімка — за породою героя).
 */
function catPhotoPieces(story: StoryCat, pose: CatPhotoPose, shot?: TraitShot, breed = 1): { parts: PortraitPart[]; bubbles: PortraitPart[] } {
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
  const body = [...(still.shadow === false ? [] : [shadow]), ...rigParts(rig, still.view, CAT_FAR, size.scale)];
  const props = shot?.props ?? [];
  const parts = [
    ...props.filter((prop) => !prop.front).map((prop) => propPart(prop, size.relative)),
    ...(still.flip ? body.map(mirrored) : body),
    ...props.filter((prop) => prop.front).map((prop) => propPart(prop, size.relative)),
  ];
  const ownBubbles = (shot?.bubbles ?? []).filter((bubble) => bubble.over === undefined);
  if (ownBubbles.length === 0) return { parts, bubbles: [] };
  const anchor = rig.anchor("head", { x: 0, y: 0 }, false) ?? { x: 0, y: 0 };
  const dir = still.flip ? -1 : 1;
  const head = { x: anchor.x * size.scale * dir, y: anchor.y * size.scale };
  return { parts, bubbles: ownBubbles.flatMap((bubble) => bubbleParts(bubble, head, dir)) };
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
const PERSON_IN_SHOT: Readonly<Record<TraitPerson["pose"], { anim: PersonAnimId; at: number; chair: boolean }>> = {
  stand: { anim: "idle", at: 0, chair: false },
  lap: { anim: "work", at: 0, chair: true },
  pet: { anim: "pet", at: 400, chair: false },
};

/** Частини персонажа знімка риси: ноги — у (0, 0), спереду, як у квартирі; крісло — під ним, позаду. */
function personShotParts(look: Look, pose: TraitPerson["pose"]): { part: PortraitPart; person: boolean }[] {
  const still = PERSON_IN_SHOT[pose];
  const rig = new Rig(PERSON_RIG, {
    fit: PERSON_FIT,
    lookup: artEntry,
    skin: personSkin(look),
    proportions: personProportions(look),
    facing: { view: "front", flip: false },
  }) as unknown as LooseRig;
  rig.play(PERSON_ANIMS[still.anim] as never, 0, { blend: 0 });
  rig.evaluate(still.at);
  const chair = SEATS.find((seat) => seat.object === "computer")?.art ?? "env/chair-desk";
  return [
    ...(still.chair ? [framePart(chair, "backrest"), framePart(chair, "seat")].map((part) => ({ part, person: false })) : []),
    ...rigParts(rig, "front", PERSON_FAR, 1).map((part) => ({ part, person: true })),
  ];
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
  }
}

// --- Скелет → частини ----------------------------------------------------------------------------

/**
 * Частини скелета знизу догори (як `personPortraitParts`): кадр — як у грі (`slotFrame`), дальні — затінені; `scale` — масштаб усього
 * скелета від кореня; `held` — річ у гнізді `held` на його місці в порядку малювання.
 */
function rigParts(rig: LooseRig, view: ArtView, far: ReadonlySet<string>, scale: number, held: PortraitPart | null = null): PortraitPart[] {
  const parts: PortraitPart[] = [];
  for (const item of rig.order) {
    if (item.kind === "socket") {
      if (held && item.id === "held") parts.push(held);
      continue;
    }
    const pose = rig.slots[item.index];
    if (!pose || !pose.visible || pose.art === null) continue;
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
      for (const part of hero.parts) pieces.push({ part: shifted(turn ? mirrored(part) : part, at), recipe: part.id.startsWith("cat/") ? (part.far ? far : recipe) : AS_IS });
      for (const part of hero.bubbles) bubbles.push({ part: shifted(part, at), recipe: AS_IS });
      // Інші коти знімка риси — окремими героями: свій вигляд, розмір за породою героя (не за його віком) і своє місце в черзі за
      // відстанню до камери.
      const size = catSize(photoCat(subject.cat.cat, subject.cat.ageWeeks));
      const shot = subject.shot;
      for (const [i, companion] of (shot?.companions ?? []).entries()) {
        const spot = { x: at.x + companion.x * size.relative, y: at.y + companion.y * size.relative };
        const other = catPhotoPieces({ cat: COMPANION, ageWeeks: companion.weeks ?? COMPANION_WEEKS[companion.age] }, "calm", companionShot(shot!, i), size.breed);
        groups.push({ y: spot.y, pieces: other.parts.map((part) => ({ part: shifted(part, spot), recipe: part.id.startsWith("cat/") ? (part.far ? COMPANION_FAR : COMPANION_RECIPE) : AS_IS })) });
        for (const part of other.bubbles) bubbles.push({ part: shifted(part, spot), recipe: AS_IS });
      }
      // Персонаж знімка — у вигляді гравця, поза рамкою фото: позаду всіх героїв чи поверх них.
      if (shot?.person) {
        const look = subject.look ?? DEFAULT_LOOK;
        const own = personRecipe(look);
        const ownFar = farRecipe(own);
        const spot = { x: at.x + shot.person.x * size.relative, y: at.y + shot.person.y * size.relative };
        const parts = personShotParts(look, shot.person.pose).map(({ part, person: body }): PhotoPiece => ({
          part: shifted(shot.person?.flip ? mirrored(part) : part, spot),
          recipe: body && part.id.startsWith("person/") ? (part.far ? ownFar : own) : AS_IS,
          bleed: true,
        }));
        groups.push({ y: shot.person.front ? Infinity : -Infinity, pieces: parts });
      }
      if (shot?.frame) frame = shot.frame;
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

/** Частина фігури, віддзеркалена довкола її початку: так фігура дивиться в інший бік (`partMatrix`: x, кут і `scaleX` — навпаки). */
function mirrored(part: PortraitPart): PortraitPart {
  return { ...part, x: -(part.x ?? 0), rot: -(part.rot ?? 0), scaleX: -(part.scaleX ?? 1) };
}

function shifted(part: PortraitPart, by: { x: number; y: number }): PortraitPart {
  if (by.x === 0 && by.y === 0) return part;
  return { ...part, x: (part.x ?? 0) + by.x, y: (part.y ?? 0) + by.y };
}
