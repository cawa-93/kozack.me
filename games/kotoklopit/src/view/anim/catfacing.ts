// Куди дивиться кіт в ізометрії (крок 16, GRAPHICS_PLAN.md, «Вибір анімації»): ракурс скелета (`front` — ¾ спереду, `back` —
// ¾ ззаду) і віддзеркалення (`flip` — обличчям ліворуч), тобто 4 ізометричні ракурси. Сим про них не знає: у нього лише
// `facing` ±1, тож напрям вигляд бере з руху, з цілі дії чи з пари. Без Phaser.
//
// Напрям у клітинках стає напрямом на екрані за формулою ізометрії 2:1 (`iso.ts`): (x, y) → ((x − y)·TW/2, (x + y)·TH/2).
// Униз екраном — `front`, угору — `back`; ліворуч — `flip`. Межі між ракурсами — діагоналі сітки (рух уздовж x − y чи
// x + y), і щоб кіт на них не тремтів, ракурс змінюється, лише коли напрям відійшов від межі на `FACING_HYSTERESIS`.

import { WINDOWS } from "../../sim/home";
import type { Cat, GameState, Vec } from "../../sim/types";
import { catLook } from "../thoughts";
import type { RigFacing } from "../rig/types";
import { isoScreenDir } from "./iso";
import { pairOf, type PairPlacement } from "./pairs";
import { actTargetPoint } from "./targets";

/**
 * На скільки (частка довжини напряму, тобто синус кута) напрям має відійти від межі ракурсів, щоб ракурс змінився: ≈ 12°.
 * Рух уздовж осі сітки відходить від обох меж на 27° і більше, тож завжди однозначний; поблизу діагоналі ракурс тримається.
 */
export const FACING_HYSTERESIS = 0.2;

/** Коротший за це рух (у клітинках за кадр) — не рух: кіт стоїть, напрям не з руху. */
const MIN_STEP = 1e-4;
/** Довший за це «крок» за кадр — переставляння симом (стали поруч, повернули зі сходів), а не рух. */
const MAX_STEP = 1;
/** Ціль ближча за це (у клітинках) — кіт на ній самій: напрям не з неї. */
const MIN_TARGET = 0.25;
/** Персонаж ліворуч чи праворуч, лише якщо по горизонталі екрана далі за це (одиниці арту); інакше — як було. */
const MIN_SIDE = 6;

/**
 * Ракурс за напрямом на екрані з гістерезисом: `prev` — ракурс минулого кадру (null — без нього, межа без запасу). Нульовий
 * напрям — `prev` чи null.
 */
export function facingFromScreen(dir: Vec, prev: RigFacing | null): RigFacing | null {
  const length = Math.hypot(dir.x, dir.y);
  if (length < 1e-9) return prev;
  const ny = dir.y / length;
  const nx = dir.x / length;
  const h = FACING_HYSTERESIS;
  const view = prev === null ? (ny < 0 ? "back" : "front") : prev.view === "front" ? (ny < -h ? "back" : "front") : ny > h ? "front" : "back";
  const flip = prev === null ? nx < 0 : prev.flip ? nx < h : nx < -h;
  return { view, flip };
}

/** Ракурс за напрямом у клітинках (з гістерезисом). */
export function facingFromTiles(dir: Vec, prev: RigFacing | null): RigFacing | null {
  return facingFromScreen(isoScreenDir(dir), prev);
}

/** Ліворуч чи праворуч (`flip`) від точки до точки в клітинках, з мертвою зоною `MIN_SIDE`: зона — `prev` чи `fallback`. */
function sideTo(from: Vec, to: Vec, prev: RigFacing | null, fallback: boolean): boolean {
  const dx = isoScreenDir({ x: to.x - from.x, y: to.y - from.y }).x;
  if (Math.abs(dx) < MIN_SIDE) return prev?.flip ?? fallback;
  return dx < 0;
}

/** Ракурс персонажа за його `body.facing` (вектор у клітинках), з гістерезисом. */
export function personFacing(state: GameState, prev: RigFacing | null = null): RigFacing {
  return facingFromTiles(state.character.body.facing, prev) ?? prev ?? { view: "front", flip: false };
}

/** Що ще знає `catFacing`, крім стану. */
export interface CatFacingOptions {
  /** Ракурс цього кота минулого кадру: гістерезис. */
  prev?: RigFacing | null;
  /** Місце в парі (`catPairs`), якщо вже пораховано для всіх котів; без поля — `pairOf`. */
  pair?: PairPlacement | null;
}

/**
 * Куди дивиться кіт (крок 16): `prevPos` — де кіт був минулого кадру (null — перший кадр).
 * - На руках і на колінах — туди ж, куди персонаж, але `flip` — відносно персонажа, тобто завжди false: такого кота
 *   прикріплено в гніздо скелета персонажа (`arms`, `lap`; `RigSprite.attach`), а вміст гнізда дзеркалить сам контейнер
 *   персонажа — `flip` коту поверх нього дзеркалив би вдруге, і кіт дивився б у протилежний бік. Ракурс — персонажа. Куди
 *   кіт дивиться у світі — `personFacing`.
 * - У парі (протистояння, бійка, вилизування, гра, сон поруч) — обличчям до пари вздовж горизонталі екрана (`pairs.ts`).
 * - Іде — за рухом (різниця позицій; кадр без руху — як минулого кадру, а без нього — до `goal`).
 * - Стоїть: на підвіконні під вікном у задній стіні — спиною до нас, у вікно (сумний — до нас, щоб було видно смуток, як і в
 *   старому вигляді); «Образливий» дметься — спиною, від персонажа; «Пастка на животику» — головою від персонажа; відданий,
 *   що кліпає, і ласкавий, що бодається, — до персонажа; ті два — завжди лицем до нас, бо це про морду. Хто просить, іде по
 *   увагу чи слідом — до персонажа; далі — до цілі дії (річ, кіт-суперник, друг); інакше — `facing` сима: праворуч чи
 *   ліворуч, лицем до нас.
 */
export function catFacing(state: GameState, cat: Cat, prevPos: Vec | null, options: CatFacingOptions = {}): RigFacing {
  const prev = options.prev ?? null;
  const simSide = cat.facing < 0;
  const fallback: RigFacing = { view: "front", flip: simSide };
  const held = state.character.held;
  if ((held?.kind === "cat" && held.cat === cat.id) || cat.act.kind === "lap") return { view: personFacing(state, prev).view, flip: false };
  const pair = options.pair === undefined ? pairOf(state, cat) : options.pair;
  if (pair?.facing) return pair.facing;
  const act = cat.act;
  if (act.goal !== null) {
    const step = prevPos === null ? null : { x: cat.x - prevPos.x, y: cat.y - prevPos.y };
    const length = step === null ? 0 : Math.hypot(step.x, step.y);
    if (step !== null && length >= MIN_STEP && length <= MAX_STEP) return facingFromTiles(step, prev) ?? fallback;
    if (prev !== null) return prev;
    return facingFromTiles({ x: act.goal.x + 0.5 - cat.x, y: act.goal.y + 0.5 - cat.y }, null) ?? fallback;
  }
  const person = state.character.body;
  const look = catLook(state, cat);
  // Кіт на підвіконні дивиться у вікно (§9.12, «Вікно»): обидва вікна — у задніх стінах ізометрії.
  if (act.kind === "window" && look !== "sad") {
    const pane = WINDOWS.find((w) => w.sill === act.target);
    if (pane) return facingFromTiles({ x: pane.wall.x + 0.5 - cat.x, y: pane.wall.y + 0.5 - cat.y }, prev) ?? { view: "back", flip: simSide };
  }
  if (look === "sulk") return { view: "back", flip: !sideTo(cat, person, null, !simSide) };
  if (look === "belly") return { view: "front", flip: !sideTo(cat, person, null, !simSide) };
  if (look === "blink" || look === "nudge") return { view: "front", flip: sideTo(cat, person, prev, simSide) };
  if (act.kind === "attention" || act.kind === "follow" || act.target === "character" || act.target === "food" || act.target === "feet") {
    return facingFromTiles({ x: person.x - cat.x, y: person.y - cat.y }, prev) ?? fallback;
  }
  const target = actTargetPoint(state, cat);
  if (target !== null && Math.hypot(target.x - cat.x, target.y - cat.y) >= MIN_TARGET) {
    return facingFromTiles({ x: target.x - cat.x, y: target.y - cat.y }, prev) ?? fallback;
  }
  return fallback;
}
