// Разові анімації кота нового вигляду (крок 16, GRAPHICS_PLAN.md, «Вибір анімації»): симптоми хвороб, блювання, шипіння,
// нявкання, задишка після гри, стрибки на меблі й позіхання. Сим не тримає «кіт саме чхає» в стані — це подія (`symptom`,
// `mess`, `meow`, `hissed`…; §9.5: «симптом — лише бабл, сам кіт при цьому не рухається; пози — крок 16»), тож вигляд
// отримує подію (`WorldPart.onEvent`) і грає разову анімацію поверх пози. Без Phaser.

import { asleep } from "../../sim/cat";
import { hasDisease } from "../../sim/diseases";
import type { GameEvent } from "../../sim/events";
import { HIGH_PLACES, objectAt } from "../../sim/home";
import type { Cat, GameState, Vec } from "../../sim/types";
import { catPose } from "../pose";
import type { CatFace } from "./catface";
import { CAT_ONE_SHOT_MS, CAT_OVERLAYS, type CatAnimId, type CatOneShotId } from "./ids";

/**
 * Разова анімація кота: `anim` — анімація тіла чи накладка (`CAT_ONE_SHOT_MS`; null — лише обличчя); `face` — кадри обличчя на
 * цей час, поверх `catFace` (null — від `catFace`); `ms` — скільки триває.
 */
export interface CatOneShot {
  cat: number;
  anim: CatOneShotId | null;
  face: Partial<CatFace> | null;
  ms: number;
}

/** Скільки тримаються вирази без анімації тіла, мс. */
export const CAT_FACE_MS = {
  /** Нявкнув (і «Тихоня», що відкрила рота без звуку). */
  meow: 500,
  /** Кричить у лотку від болю (сечокам'яна, §9.5). */
  pain: 1200,
  /** «Кекає» на птахів за вікном (§9.12, «Вікно»). */
  chatter: 900,
  /** Позіхає, прокинувшись. */
  yawn: 1300,
  /** Злякався гучного звуку чи прокинувся від шуму (§9.12). */
  startle: 500,
  /** Проковтнув ліки (§9.5): кривиться. */
  swallow: 600,
  /** Випльовує таблетку (§9.5, Х3). */
  spit: 600,
  /** Жує ласощі (§7). */
  treat: 800,
} as const;

const shot = (cat: number, anim: CatOneShotId | null, face: Partial<CatFace> | null, ms?: number): CatOneShot => ({
  cat,
  anim,
  face,
  ms: ms ?? (anim === null ? 0 : CAT_ONE_SHOT_MS[anim]),
});

/** Задишка після гри (§9.5, Д1): у кота з проблемами з диханням чи хворим серцем — обидва швидко втомлюються. */
function panting(state: GameState, ids: readonly number[]): CatOneShot[] {
  return state.cats.filter((c) => ids.includes(c.id) && (hasDisease(c, "breathing") || hasDisease(c, "heart"))).map((c) => shot(c.id, "pant", null));
}

/**
 * Пози, у яких разової анімації всього тіла (чухання, тертя очей, блювання) не зіграти: кіт під меблями, у переносці, під
 * ковдрою, у клубку бійки, на руках чи на колінах. Тоді лишається обличчя (і накладки — чхання, шипіння, задишка).
 */
const NO_BODY_SHOTS: ReadonlySet<CatAnimId> = new Set<CatAnimId>(["hide", "carrier", "blanket", "brawl", "carried", "sleep", "snore"]);

/** Разова анімація тіла, що не лягає на теперішню позу кота, — лише обличчям. */
function fitted(state: GameState, shots: CatOneShot[]): CatOneShot[] {
  return shots.map((s) => {
    if (s.anim === null || CAT_OVERLAYS.has(s.anim)) return s;
    const cat = state.cats.find((c) => c.id === s.cat);
    return cat && NO_BODY_SHOTS.has(catPose(state, cat)) ? { ...s, anim: null } : s;
  });
}

/**
 * Разові анімації котів від події (крок 16): чхання (застуда), чухання задньою лапою (блохи, дерматит), тертя очей
 * (кон'юнктивіт), крик у лотку (сечокам'яна), блювання (розлад шлунка, ковтає надто швидко, переїв з шафки) і шерстяна
 * грудка, задишка після гри з вудкою чи з другом, шипіння (і на гостей з-під дивана), укус і подряпина, нявкання й «кекання»
 * біля вікна, переляк, ліки й ласощі. Подія не про кота — порожньо. Анімація тіла, що не лягає на позу (`NO_BODY_SHOTS`), —
 * лише обличчям, тієї самої тривалості.
 */
export function catEventAnims(event: GameEvent, state: GameState): CatOneShot[] {
  return fitted(state, eventShots(event, state));
}

function eventShots(event: GameEvent, state: GameState): CatOneShot[] {
  switch (event.type) {
    case "symptom":
      switch (event.symptom) {
        case "sneeze":
          return [shot(event.cat, "sneeze", { eyes: "closed", mouth: "meow" })];
        case "itch":
          return [shot(event.cat, "itch", { eyes: "squint" })];
        case "eyes":
          return [shot(event.cat, "rubEyes", { eyes: "closed" })];
        case "pain":
          return [shot(event.cat, null, { eyes: "squint", mouth: "meow", ears: "flat" }, CAT_FACE_MS.pain)];
      }
      return [];
    case "mess":
      // Блює чи зригує шерстяну грудку туди, де вона лягла, — перед собою (§9.3, §9.5, §9.12).
      return (event.mess.kind === "vomit" || event.mess.kind === "hairball") && event.mess.cat !== null
        ? [shot(event.mess.cat, "vomit", { eyes: "squint", mouth: "meow", ears: "flat" })]
        : [];
    case "played":
      return panting(state, [event.cat]);
    case "cats-played":
      return panting(state, event.cats);
    case "hissed":
      return [shot(event.cat, "hiss", { eyes: "round", mouth: "hiss", ears: "back" })];
    case "hissed-guests":
      return [shot(event.cat, null, { eyes: "round", mouth: "hiss", ears: "back" }, CAT_ONE_SHOT_MS.hiss)];
    case "bite":
    case "clawed":
      // Кусає чи дряпає й відсахується (§9.12): кидок голови, як у шипінні.
      return [shot(event.cat, "hiss", { eyes: "round", mouth: "hiss", ears: "flat" })];
    case "meow":
      return [shot(event.cat, null, { mouth: "meow" }, CAT_FACE_MS.meow)];
    case "chatter":
      return [shot(event.cat, null, { eyes: "round", mouth: "meow" }, CAT_FACE_MS.chatter)];
    case "scared":
    case "cat-woke":
      return [shot(event.cat, null, { eyes: "round", ears: "flat" }, CAT_FACE_MS.startle)];
    case "medicine":
      return [shot(event.cat, null, { eyes: "squint", ears: "flat" }, CAT_FACE_MS.swallow)];
    case "medicine-spat":
      return [shot(event.cat, null, { eyes: "squint", mouth: "tongue" }, CAT_FACE_MS.spit)];
    case "treat":
      return [shot(event.cat, null, { eyes: "arc", mouth: "eat" }, CAT_FACE_MS.treat)];
    default:
      return [];
  }
}

/** Що вигляд пам'ятає про кота з минулого кадру для `catTransition` (і `catFacing` — `x`, `y`). */
export interface CatMemory {
  x: number;
  y: number;
  /** Спав — на місці чи на колінах. */
  asleep: boolean;
}

const sleeping = (cat: Cat): boolean => asleep(cat) || cat.act.kind === "lap";

/** Запам'ятати кота на цей кадр: наступного кадру це `prev` для `catTransition`. */
export const catMemory = (cat: Cat): CatMemory => ({ x: cat.x, y: cat.y, asleep: sleeping(cat) });

/** Далі за це (клітинки) за кадр — сим переставив кота (на руки, з рук, зі сходів), а не стрибок. */
const TELEPORT = 0.75;

/**
 * Чи кіт на меблях у точці `p` (§8.4, §9.12): на ліжку, дивані, столі, холодильнику, підвіконні тощо — не на дверях і не в
 * ящиках біля входу (крізь них переступають). Хто ховається — під меблями, а не на них, крім високих місць: туди
 * вилазять.
 */
function onFurniture(state: GameState, cat: Cat, p: Vec): boolean {
  const object = objectAt(state, Math.floor(p.x), Math.floor(p.y));
  if (object === null || object.kind === "door" || object.walkable === true) return false;
  if (cat.act.kind === "hide" && !HIGH_PLACES.includes(object.id)) return false;
  return true;
}

/**
 * Разова анімація від зміни між кадрами (крок 16): кіт ступив з підлоги на меблі — стрибок угору, з меблів на підлогу —
 * униз; прокинувся (на місці, на колінах, і коли розбудили) — позіхає. `prev` — що було минулого кадру (null — перший кадр).
 */
export function catTransition(state: GameState, cat: Cat, prev: CatMemory | null): CatOneShot | null {
  if (prev === null || cat.away !== null) return null;
  if (prev.asleep && !sleeping(cat)) {
    return shot(cat.id, null, { eyes: "closed", mouth: "yawn" }, CAT_FACE_MS.yawn);
  }
  if (Math.hypot(cat.x - prev.x, cat.y - prev.y) > TELEPORT) return null;
  const was = onFurniture(state, cat, prev);
  const now = onFurniture(state, cat, cat);
  if (!was && now) return shot(cat.id, "jumpUp", null);
  if (was && !now) return shot(cat.id, "jumpDown", null);
  return null;
}
