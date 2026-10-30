// Пози кота за його дією (§11.3, §9.4 «Пози стосунків»). Без Phaser — щоб тести могли перевірити.
//
// Тут два вибори пози. `poseOf` (24 пози, `CatPose`) — старого вигляду (`legacy/cat.ts`) і лишається таким, як був, поки
// старий вигляд живе (до хвилі 3 кроку 16). `catPose` і `catAnim` — нового (крок 16, GRAPHICS_PLAN.md, «Вибір анімації»):
// назва анімації скелета (`CatAnimId`, `anim/ids.ts`) з новими позами — присідання на лотку, симптоми хвороб, кульгання,
// незграбна й сумна хода, хропіння, буханець, нюхання; почуття під рукою й повільне кліпання — накладками. Куди кіт
// дивиться — `anim/catfacing.ts`, обличчя — `anim/catface.ts`, разові анімації від подій — `anim/catevents.ts`, пари —
// `anim/pairs.ts`.

import { catFeeling, petOver } from "../sim/actions";
import { hasDisease, walkFactor } from "../sim/diseases";
import { HIGH_PLACES, objectAt } from "../sim/home";
import type { Cat, GameState } from "../sim/types";
import type { CatAnimId } from "./anim/ids";
import { catLook } from "./thoughts";

export type CatPose =
  | "walk"
  | "sit"
  | "eat"
  | "sleep"
  | "hide"
  | "carried"
  | "belly"
  | "roll"
  | "bury"
  | "groom"
  | "mark"
  | "cough"
  | "scratch"
  | "stretch"
  | "carrier"
  | "crouch"
  | "blanket"
  | "sprawl"
  | "arch"
  | "brawl"
  | "lick"
  | "paw"
  | "kick"
  | "lie";

/** Поза за дією кота. */
export function poseOf(cat: Cat, carried: boolean): CatPose {
  const act = cat.act;
  // На колінах кіт спить клубочком; «Поважає роботу» так само лежить поруч зі столом, а «Щедра душа» — поруч із котом, якого
  // гладять (§9.12).
  if (act.kind === "lap" || (act.kind === "idle" && act.goal === null && (act.target === "desk" || act.target?.startsWith("cuddle:") === true))) return "sleep";
  if (carried) return "carried";
  // Протистояння й бійка (§9.4, рішення автора 2026-10-26): хто підходить до ворога — іде; хто чекає й хто вже зійшовся — «спина
  // дугою»; зійшлися в бійці — «клубок бійки». Заглушки до кроку 16 (графіка).
  if (act.goal === null && act.kind === "standoff") return "arch";
  if (act.goal === null && act.kind === "fight") return act.paired === true ? "brawl" : "arch";
  // Гра з другом фазами (§9.4, «Гру й вилизування видно», рішення автора 2026-10-26, Г3).
  if (act.kind === "wrestle") return playPose(cat);
  if (act.goal !== null || act.kind === "toy" || act.kind === "zoomies" || act.kind === "fight") return "walk";
  // Не хоче гратися з тим, хто кликав (§9.4, «Пози стосунків», 6; рішення автора 2026-10-26, Г5): лежить і сіпає хвостом.
  if (isDeclining(cat)) return "lie";
  // Спить у переносці (§9.12, «Переноска»): крізь дверцята видно клубочок шерсті.
  if (act.kind === "sleep" && act.target === "carrier") return "carrier";
  // Теплолюб під ковдрою, «Не мерзне» розпластався на прохолодній плитці (§9.12, «Теплолюбність»).
  if (act.kind === "sleep" && act.blanket === true) return "blanket";
  if (act.kind === "sleep" && act.target === "tile") return "sprawl";
  if (act.kind === "sleep") return "sleep";
  if (act.kind === "hide") return "hide";
  // У засідці (§9.12, «Засідки»): припав до підлоги й виляє задом.
  if (act.kind === "ambush") return "crouch";
  // Катається по котячій м'яті (§9.12): на спині, лапи догори, перевертається з боку на бік.
  if (act.kind === "catnip") return "roll";
  // Їсть, п'є, обнюхує дрібничку на столі чи нову річ (§9.12, «Скидання речей», «Допитливість»): голова донизу.
  // Нюхає котячу м'яту, на яку не зважає (§9.12, «Котяча м'ята»), — так само.
  const sniffing =
    (act.kind === "knock" && act.refused === true) || (act.kind === "idle" && (act.target === "catnip" || act.target?.startsWith("sniff:") === true || act.target?.startsWith("shun:") === true));
  // Гризе дріт чи пакет (§9.12, «Гризіння») — так само голова донизу.
  if (act.kind === "eat" || act.kind === "drink" || act.kind === "chew" || sniffing) return "eat";
  // Гребе лапою (§9.12): закопує корм біля миски.
  if (act.kind === "bury") return "bury";
  // Мітить: стоїть, задерши хвіст; кахикає: пригнувся й смикається (§9.12).
  if (act.kind === "mark") return "mark";
  if (act.kind === "cough") return "cough";
  // Точить кігті: стоїть на задніх лапах; на килимку — потягується, витягнувши лапи вперед (§9.12, «Дряпання»).
  if (act.kind === "scratch") return act.target === "rug" ? "stretch" : "scratch";
  // Лапає рулон туалетного паперу на стіні — так само на задніх лапах (§9.12, «Мисливський інстинкт»).
  if (act.kind === "unroll") return "scratch";
  // Вмивається сам — нервово чи після їди (§9.12): лапка біля рота.
  if (act.kind === "groom" && !act.target?.startsWith("cat:") && !act.target?.startsWith("kitten:")) return "groom";
  // Вилизує друга чи кошеня (§9.4, «Пози стосунків», 3): голова тягнеться до друга й погойдується.
  if (act.kind === "groom") return "lick";
  return "sit";
}

/**
 * Поза в грі з другом (§9.4, «Пози стосунків», 4–5; заглушки до кроку 16): хто біжить до друга — іде, друг чекає — сидить; у засідці
 * мисливець припав до підлоги, а той, на кого чатують, відходить і сідає; у погоні обидва біжать; у боротьбі той, кого наздогнали,
 * на спині дриґає лапами («kick»), а мисливець, підбігши, стоїть над ним із піднятою лапою («paw»); у паузі обидва сидять.
 */
function playPose(cat: Cat): CatPose {
  const act = cat.act;
  if (act.goal !== null) return "walk";
  const game = act.game;
  if (act.paired !== true || game === undefined) return "sit";
  const hunting = game.chaser === cat.id;
  switch (game.phase) {
    case "ambush":
      return hunting ? "crouch" : act.run ? "walk" : "sit";
    case "chase":
      return "walk";
    case "tussle":
      return !hunting ? "kick" : act.run ? "walk" : "paw";
    case "pause":
      return "sit";
  }
}

/** Кіт відмовився гратися (§9.4 «Згода, охорона й сварки», Г5): лежить обличчям до того, хто кликав, і сіпає хвостом. */
export const isDeclining = (cat: Cat): boolean => cat.act.kind === "idle" && cat.act.target?.startsWith("declined:") === true;

/** Кіт покликав гратися, а друг відмовився (§9.4, Г5): відходить від нього. */
const isRefused = (cat: Cat): boolean => cat.act.kind === "wander" && cat.act.target?.startsWith("refused:") === true;

/** Кота саме вилизує друг (§9.4, «Гру й вилизування видно», В1): сидить і мружиться, як під пестощами. */
export const isLicked = (cat: Cat): boolean => cat.act.kind === "idle" && cat.act.target?.startsWith("licked:") === true;

/**
 * Кіт зайнятий іншим котом — грається, вилизує чи його вилизують (§9.4): дивиться на друга, а не на персонажа, без сумної пози й
 * моргання до персонажа, як і перед ворогом.
 */
export const withFriend = (cat: Cat): boolean =>
  cat.act.kind === "wrestle" ||
  (cat.act.kind === "groom" && (cat.act.target?.startsWith("cat:") === true || cat.act.target?.startsWith("kitten:") === true)) ||
  isLicked(cat) ||
  isDeclining(cat) ||
  isRefused(cat);

/** Суперник у «клубку бійки» (§9.4): обидва вже зійшлися й б'ються саме одне з одним; інакше null. */
export function brawlFoe(state: GameState, cat: Cat): Cat | null {
  if (cat.act.kind !== "fight" || cat.act.paired !== true) return null;
  const foe = state.cats.find((c) => `cat:${c.id}` === cat.act.target);
  if (!foe || foe.away !== null || foe.act.kind !== "fight" || foe.act.paired !== true || foe.act.target !== `cat:${cat.id}`) return null;
  return foe;
}

/** Куля в «клубку бійки», менша за цю частку чужої, — помітно менша (кошеня проти дорослого). */
const BRAWL_SMALLER = 0.8;

/**
 * Чия куля в «клубку бійки» зараз спереду (§9.4, «Пози стосунків»): клубок крутиться, і кулі по черзі виринають наперед
 * (`phase` — кут оберту); помітно менша — завжди спереду, інакше більша ховала б її цілком пів оберту, і гравець не бачив би,
 * хто з ким б'ється (перевірка блоку 1 2026-10-26). `mine` і `theirs` — радіуси куль; `theirs` null — суперника не видно.
 */
export function brawlInFront(mine: number, theirs: number | null, phase: number): boolean {
  if (theirs !== null && mine < theirs * BRAWL_SMALLER) return true;
  if (theirs !== null && theirs < mine * BRAWL_SMALLER) return false;
  return Math.sin(phase) > 0;
}

/**
 * Бабл «бійка» (§9.4, «Пози стосунків»): над клубком — один на двох (його показує кіт із меншим номером), а нападник, що ще
 * біжить, і той, хто його чекає, — кожен свій.
 */
export function showsFightBubble(state: GameState, cat: Cat): boolean {
  if (cat.act.kind !== "fight" || cat.away !== null) return false;
  const foe = brawlFoe(state, cat);
  return foe === null || cat.id < foe.id;
}

// --- Нові пози (крок 16) -----------------------------------------------------------------------

/** Утома, з якої кіт без діла не сидить, а лягає буханцем (§9.3: втомлений більше лежить). Лише вигляд. */
const LOAF_FATIGUE = 60;

/** Кіт на руках у персонажа (§9.12). */
const inArms = (state: GameState, cat: Cat): boolean => {
  const held = state.character.held;
  return held?.kind === "cat" && held.cat === cat.id;
};

/** Персонаж саме гладить кота чи грається з ним вудкою (§8.2): що саме, або null. */
export function interactionWith(state: GameState, cat: Cat): "pet" | "play" | null {
  const activity = state.character.activity;
  if (activity?.kind === "pet" && activity.cat === cat.id && !petOver(activity)) return "pet";
  if (activity?.kind === "play" && activity.cat === cat.id && activity.done !== true) return "play";
  return null;
}

/** Спить: клубком, а з проблемами з диханням — хропе (§9.5, `DISEASES.md`, Д1). */
const sleepAnim = (cat: Cat): CatAnimId => (hasDisease(cat, "breathing") ? "snore" : "sleep");

/**
 * Хода кота, що кудись іде (§9.5, §11.4): травмований кульгає — і в бігу; з хворим хребтом — незграбна хода; сумний — сумна хода
 * з опущеними хвостом і головою, крім гри з другом. Інакше — зумі, іграшка й погоня в грі з другом бігом, кіт з іграшкою чи
 * шкарпеткою в зубах несе її, решта — ходить.
 */
function gaitOf(state: GameState, cat: Cat): CatAnimId {
  const act = cat.act;
  const running = act.kind === "zoomies" || act.kind === "toy" || (act.kind === "wrestle" && act.game?.phase === "chase");
  if (hasDisease(cat, "injury")) return "limp";
  if (running) return "run";
  if (hasDisease(cat, "spine")) return "clumsy";
  if (!withFriend(cat) && catLook(state, cat) === "sad") return "sadWalk";
  if (act.kind === "carry" && act.picked === true && act.dropped !== true) return "carry";
  return "walk";
}

/**
 * Гра з другом (§9.4, «Пози стосунків», 4–5, Г3), як `playPose` старого вигляду: у погоні обидва біжать, у засідці
 * мисливець припав до підлоги, у боротьбі той, кого наздогнали, на спині дриґає лапами, а мисливець стоїть над ним із
 * піднятою лапою; хто відбігає чи відходить — іде своєю ходою; у паузі й без пари — сидять.
 */
function wrestleAnim(state: GameState, cat: Cat): CatAnimId {
  const act = cat.act;
  if (act.goal !== null) return gaitOf(state, cat);
  const game = act.game;
  if (act.paired !== true || game === undefined) return "sit";
  const hunting = game.chaser === cat.id;
  switch (game.phase) {
    case "ambush":
      return hunting ? "crouch" : act.run ? gaitOf(state, cat) : "sit";
    case "chase":
      return gaitOf(state, cat);
    case "tussle":
      return !hunting ? "kick" : act.run ? gaitOf(state, cat) : "paw";
    case "pause":
      return "sit";
  }
}

/**
 * Поза нового вигляду (крок 16): основна анімація тіла за дією кота. Ті самі правила, що в `poseOf`, плюс нові пози: присідає
 * на лотку (і там, де лишає «сюрприз» мстивий), кульгає, незграбна й сумна хода, хропе, нюхає те, від чого відмовився,
 * буханцем лежить біля столу, поруч із тим, кого гладять, на холодильнику чи шафі та від утоми, «Образливий» сидить
 * спиною, ласкавий бодається, кіт просить, скидає лапою, сидить на клавіатурі чи біля вікна, стрибає за пером вудки.
 * Разові (чхання, чухання, тре очі, блює, стрибки) — від подій (`catEventAnims`, `catTransition`); почуття й повільне
 * кліпання — накладки (`catAnim`).
 */
export function catPose(state: GameState, cat: Cat): CatAnimId {
  const act = cat.act;
  // На колінах кіт спить клубочком (§9.12).
  if (act.kind === "lap") return sleepAnim(cat);
  if (inArms(state, cat)) return "carried";
  const look = catLook(state, cat);
  // «Пастка на животику» перевертається животом догори, щойно підійшли, — і під рукою теж (§9.12).
  if (look === "belly") return "belly";
  // Під рукою кіт сидить і муркоче; з вудкою — стрибає за пером (§8.2, §9.12).
  const interaction = interactionWith(state, cat);
  if (interaction === "pet") return "sit";
  if (interaction === "play") return "pounce";
  // «Поважає роботу» лежить поруч зі столом, «Щедра душа» — поруч із котом, якого гладять (§9.12): буханцем, не спить.
  if (act.kind === "idle" && act.goal === null && (act.target === "desk" || act.target?.startsWith("cuddle:") === true)) return "loaf";
  // Протистояння й бійка (§9.4): хто чекає й хто вже зійшовся — спина дугою, зійшлися в бійці — клубок.
  if (act.goal === null && act.kind === "standoff") return "arch";
  if (act.goal === null && act.kind === "fight") return act.paired === true ? "brawl" : "arch";
  if (act.kind === "wrestle") return wrestleAnim(state, cat);
  if (act.goal !== null) return gaitOf(state, cat);
  switch (act.kind) {
    case "zoomies":
      return hasDisease(cat, "injury") ? "limp" : "run";
    case "toy":
      // Б'є свою іграшку лапами, підстрибуючи (§9.12) — як за пером вудки.
      return "pounce";
    case "sleep":
      // У переносці — клубочок за дверцятами, під ковдрою — горбик, на прохолодній плитці — розпластався (§9.12).
      if (act.target === "carrier") return "carrier";
      if (act.blanket === true) return "blanket";
      if (act.target === "tile") return "sprawl";
      return sleepAnim(cat);
    case "hide":
      // Хто ховається нагорі — на холодильнику чи шафі (§9.12, «Лазіння»), — лежить там, а не визирає з-під низу.
      return HIGH_PLACES.includes(objectAt(state, Math.floor(cat.x), Math.floor(cat.y))?.id ?? "") ? "loaf" : "hide";
    case "ambush":
      return "crouch";
    case "catnip":
      return "roll";
    case "toilet":
      // На лотку присідає; чистюля, що відмовився від брудного, лише нюхає його (§9.12).
      return act.refused === true ? "sniff" : "squat";
    case "revenge":
      // Мстивий лишає «сюрприз» на ліжку чи в кошику з білизною — присідає там (§9.12).
      return "squat";
    case "eat":
      // Перебірливий понюхав простий корм і відходить (§9.12).
      return act.refused === true ? "sniff" : "eat";
    case "steal":
      return "eat";
    case "drink":
      return "drink";
    case "chew":
      return "chew";
    case "raid":
      // Лапає дверцята шафки чи перекидає смітник; з відчиненої шафки — їсть (§9.12, «Кмітливість у бешкеті»).
      return act.target === "cabinet" && state.home.cabinetOpen === true ? "eat" : "knock";
    case "bury":
      return "bury";
    case "mark":
      return "mark";
    case "cough":
      return "cough";
    case "scratch":
      return act.target === "rug" ? "stretch" : "scratch";
    case "unroll":
      return "scratch";
    case "groom":
      return act.target?.startsWith("cat:") === true || act.target?.startsWith("kitten:") === true ? "lick" : "groom";
    case "knock":
      // Обнюхав дрібничку й обійшов («Делікатний») — нюхає; інакше скидає лапою (§9.12, «Скидання речей»).
      return act.refused === true ? "sniff" : "knock";
    case "keyboard":
      return "keyboard";
    case "window":
      return "window";
    case "beg":
      return "beg";
    case "attention":
      return look === "nudge" ? "nudge" : "beg";
    default:
      break;
  }
  // Не хоче гратися з тим, хто кликав (§9.4, Г5): лежить буханцем і сіпає хвостом.
  if (isDeclining(cat)) return "decline";
  // Нюхає котячу м'яту, на яку не зважає, нову річ чи обходить її (§9.12).
  if (act.kind === "idle" && (act.target === "catnip" || act.target?.startsWith("sniff:") === true || act.target?.startsWith("shun:") === true)) return "sniff";
  if (look === "sulk") return "sulk";
  if (look === "nudge") return "nudge";
  if ((act.kind === "idle" || act.kind === "wander") && cat.needs.fatigue >= LOAF_FATIGUE && !isLicked(cat)) return "loaf";
  return "sit";
}

/** Що грати котові: основна анімація, накладка поверх неї й швидкість. */
export interface CatAnimChoice {
  anim: CatAnimId;
  /**
   * Накладка (`CAT_OVERLAYS`): «подобається» (мружиться й погойдується), «терпить» (б'є хвостом), «пручається»
   * (вертиться), повільне кліпання до персонажа; null — без накладки.
   */
  overlay: CatAnimId | null;
  /** Швидкість відтворення: хода — за швидкістю кота (травма, ожиріння, суглоби, хребет; §9.5), щоб лапи не ковзали. */
  speed: number;
}

/** Хода, швидкість якої — за швидкістю кота. */
const GAITS: ReadonlySet<CatAnimId> = new Set<CatAnimId>(["walk", "limp", "clumsy", "sadWalk", "carry"]);

/**
 * Анімація кота нового вигляду: поза (`catPose`) і накладка — що кіт відчуває під рукою, на руках, у ванні, біля вікна
 * (`catFeeling`, §9.12) чи коли його вилизує друг (§9.4, В1); інакше повільне кліпання відданого до персонажа (§11.4). Перед
 * ворогом, у бійці й з другом котові не до персонажа — без кліпання.
 */
export function catAnim(state: GameState, cat: Cat): CatAnimChoice {
  const anim = catPose(state, cat);
  const feeling = catFeeling(state, cat) ?? (isLicked(cat) ? "content" : null);
  const busy = anim === "arch" || anim === "brawl" || withFriend(cat);
  const overlay: CatAnimId | null =
    feeling === "content" ? "content" : feeling === "reluctant" ? "reluctant" : feeling === "struggling" ? "struggle" : !busy && catLook(state, cat) === "blink" ? "slowBlink" : null;
  return { anim, overlay, speed: GAITS.has(anim) ? walkFactor(cat) : 1 };
}
