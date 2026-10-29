// Вхідні двері (§9.12 «Двері й гості», рішення автора 2026-10-25, `TRAITS_REVIEW.md`): коли їх відчиняють, коти біля
// них вибігають на сходи чи відходять подалі («Втечі»); на дзвінок «Душа компанії» біжить зустрічати, а сором'язливий
// ховається («Гості»). Хто й коли відчиняє двері — пакунки, поїздки, гості, ОСББ, мама, знайда — вирішують інші модулі.

import { asleep, isAdapting, traitLevel } from "./cat";
import { backAway, hideSpot, isCarried, startAct } from "./catai";
import { tileOf, visibleFloorNear } from "./catmove";
import { CAT_ACT_MINUTES, ESCAPE, GUESTS } from "./config";
import { emit } from "./events";
import { observe } from "./knowledge";
import { escapeBonus, isNewborn } from "./reproduction";
import { stateRng } from "./rng";
import type { Cat, GameState, Vec } from "./types";

/** Вхідні двері: від цієї точки рахується, хто біля них (§9.12). */
export const DOOR: Vec = { x: 11, y: 10.5 };
/**
 * Клітинка перед дверима: тут «Втікач» кричить, просячись на сходи, а «Душа компанії» зустрічає гостей. Не впритул — ряд
 * під дверима закриває передня стіна (камера «три чверті»), і кота там майже не видно.
 */
export const DOOR_TILE: Vec = { x: 10, y: 9 };
/** Куди тікає від відчинених дверей «Боїться дверей»: углиб вітальні, подалі від передпокою. */
const AWAY_FROM_DOOR: Vec = { x: 4.5, y: 7.5 };

const nearDoor = (cat: Cat, reach: number): boolean => Math.hypot(cat.x - DOOR.x, cat.y - DOOR.y) <= reach;
const clamp = (value: number): number => Math.min(1, Math.max(0, value));

/** Звідки кіт реагує на дзвінок, а «−» — і на відчинені двері: не спить і нічим важливим не зайнятий (§9.12). */
const BELL_FROM = new Set(["idle", "wander", "toy", "beg", "attention", "follow", "groom", "scratch"]);

/**
 * Двері відчинили (§9.12): кіт ближче 4 клітинок вибігає на сходи з шансом 10% + 25% × «Втечі» (+25% нестерилізованим і
 * кішкам у тічці); «Домосід» нюхає поріг і відходить, «Боїться дверей» тікає з передпокою (до 6 клітинок). Хто спить, у
 * дверях не кидається, як і новонароджений; кота на руках (і `except` — тих, хто саме заходить разом із персонажем) не чіпає.
 */
export function openDoor(state: GameState, except: readonly number[] = []): void {
  const rng = stateRng(state, "behavior");
  for (const cat of state.cats) {
    if (except.includes(cat.id) || cat.away !== null || isCarried(state, cat) || asleep(cat) || isNewborn(cat)) continue;
    const level = traitLevel(cat, "escape");
    if (level < 0) {
      // Хто ховається, їсть чи в лотку, на двері не зважає (перевірка етапу 2026-10-26: кіт, що сховався під диван від
      // дзвінка, вилазив зі схованки, щойно гості заходили).
      if (!BELL_FROM.has(cat.act.kind) || !nearDoor(cat, level <= -2 ? ESCAPE.fearReach : ESCAPE.distance)) continue;
      // Відходить від відчинених дверей — прояв «−» (§9.9): «Домосід» — на кілька кроків, «Боїться дверей» — углиб квартири.
      if (level <= -2) {
        startAct(cat, "wander", tileOf(visibleFloorNear(state, AWAY_FROM_DOOR)), CAT_ACT_MINUTES.wander, "flee");
        emit(state, { type: "scared", cat: cat.id });
      } else backAway(state, cat, DOOR);
      observe(state, cat, "escape", -1);
      continue;
    }
    if (!nearDoor(cat, ESCAPE.distance)) continue;
    if (!rng.chance(clamp(ESCAPE.base + ESCAPE.step * level + escapeBonus(state, cat)))) continue;
    // Персонаж бачить, як кіт вислизнув, — ще поки той біля дверей (§9.9).
    observe(state, cat, "escape");
    cat.away = "stairs";
    cat.x = DOOR.x;
    cat.y = 10.9;
    startAct(cat, "idle", null, 0);
    emit(state, { type: "escaped", cat: cat.id });
  }
}

/** Чи хтось із котів зараз на сходах (§9.12): спершу його треба впіймати. */
export const catOnStairs = (state: GameState): boolean => state.cats.some((c) => c.away === "stairs");

/**
 * Дзвінок у двері (§9.12 «Двері й гості»): кур'єр, гості, ОСББ, мама, ветеринарка. Кіт, що не спить, звик до дому й нічим
 * важливим не зайнятий, реагує за «Гостями»: «+» біжить до дверей і 5 хвилин сидить там (прояв — `doorSeen` у `catai.ts`), «−»
 * ховається на 30 × |рівень| хвилин, а «Шипить на гостей» ще й шипить з-під дивана. `visitor` — дзвонить той, хто зайде сам
 * за `GUESTS.ringLead` хвилин: дзвінок чути (бабл над дверима), а «+» чекає під дверима, поки зайдуть, і ще 5 хвилин —
 * гравець встигає взяти його на руки (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А5). Кур'єр лише лишає пакунок: його
 * дзвінок показує сама доставка, а двері відчиняє гравець.
 */
export function ringBell(state: GameState, visitor = true): void {
  if (visitor) emit(state, { type: "doorbell" });
  const rng = stateRng(state, "behavior");
  for (const cat of state.cats) {
    const level = traitLevel(cat, "guests");
    if (level === 0 || cat.away !== null || isCarried(state, cat) || asleep(cat) || isNewborn(cat) || isAdapting(state, cat)) continue;
    if (!BELL_FROM.has(cat.act.kind)) continue;
    if (level > 0) {
      startAct(cat, "idle", { ...DOOR_TILE }, GUESTS.greetMinutes + (visitor ? GUESTS.ringLead : 0), "guest");
      continue;
    }
    const spot = hideSpot(state, rng, cat);
    startAct(cat, "hide", spot.at, GUESTS.hideStep * -level, spot.target);
    emit(state, { type: "scared", cat: cat.id });
    if (level <= -2) emit(state, { type: "hissed-guests", cat: cat.id });
    // Ховається, щойно задзвонили, — прояв «−» (§9.9).
    observe(state, cat, "guests", -1);
  }
}
