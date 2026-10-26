// Пози кота за його дією (§11.3, §9.4 «Пози стосунків»). Без Phaser — щоб тести могли перевірити.

import type { Cat, GameState } from "../sim/types";

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

/** Кіт покликав гратися, а друг відмовився (§9.4, Г5): хвилину сидить поруч обличчям до нього. */
const isRefused = (cat: Cat): boolean => cat.act.kind === "idle" && cat.act.target?.startsWith("refused:") === true;

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
