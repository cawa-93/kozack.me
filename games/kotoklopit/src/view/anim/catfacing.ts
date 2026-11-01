// Куди дивиться кіт в ізометрії (крок 16, GRAPHICS_PLAN.md, «Вибір анімації»): ракурс скелета (`front` — ¾ спереду, `back` —
// ¾ ззаду) і віддзеркалення (`flip` — обличчям ліворуч), тобто 4 ізометричні ракурси. Сим про них не знає: у нього лише
// `facing` ±1, тож напрям вигляд бере з руху, з цілі дії чи з пари. Без Phaser.
//
// Напрям у клітинках стає напрямом на екрані за формулою ізометрії 2:1 (`iso.ts`): (x, y) → ((x − y)·TW/2, (x + y)·TH/2).
// Униз екраном — `front`, угору — `back`; ліворуч — `flip`. Межі між ракурсами — діагоналі сітки (рух уздовж x − y чи
// x + y), і щоб кіт на них не тремтів, ракурс змінюється, лише коли напрям відійшов від межі на `FACING_HYSTERESIS`.

import { WINDOWS } from "../../sim/home";
import type { Cat, GameState, Vec } from "../../sim/types";
import { interactionWith } from "../pose";
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

/**
 * Кіт іде переважно прямовисно на екрані (|ny| > `vertical`, рух уздовж діагоналі сітки): ліво чи право тоді — лише з
 * невеликого відхилення, а шлях сима йде відрізками трохи різного нахилу, і з гістерезисом 0,2 кіт, що йде майже прямо
 * вгору, віддзеркалювався кожні 0,3–0,5 с — голова й хвіст стрибали з боку на бік (рецензія хвилі 3). Тож у такому русі
 * віддзеркалення змінюється, лише коли напрям відійшов від прямовисної на `flip` (синус кута, ≈ 27°).
 */
export const FACING_VERTICAL = { vertical: 0.8, flip: 0.45 } as const;

/**
 * Ракурс кота, що йде (рецензія хвилі 3): напрям руху згладжується за `headingMs` (`smoothHeading`; з кроку одного кадру
 * ракурс смикався), а віддзеркалення в русі змінюється не частіше ніж раз на `flipMs` (`holdFlip`) — голова й хвіст не
 * перескакують з боку на бік. Крок, довший за `teleport` клітинок за кадр, — переставляння, а не рух.
 */
export const FACING_SMOOTH = { headingMs: 250, flipMs: 400, teleport: 1 } as const;

/**
 * Згладжена швидкість кота `heading` (клітинок за секунду; пише в той самий об'єкт): експоненційне середнє за
 * `FACING_SMOOTH.headingMs` з кроку `dx`, `dy` за `seconds`; переставленого кота (`teleport`) і кадр без часу не рахує.
 */
export function smoothHeading(heading: Vec, dx: number, dy: number, seconds: number): void {
  if (!(seconds > 0) || Math.hypot(dx, dy) > FACING_SMOOTH.teleport) return;
  const k = 1 - Math.exp((-seconds * 1000) / FACING_SMOOTH.headingMs);
  heading.x += (dx / seconds - heading.x) * k;
  heading.y += (dy / seconds - heading.y) * k;
}

/**
 * Кіт, що йде (`moving`), не віддзеркалюється частіше ніж раз на `FACING_SMOOTH.flipMs`: `sinceFlip` — скільки мс минуло від
 * минулого віддзеркалення, `was` — ракурс минулого кадру. Інакше — `facing` як є.
 */
export function holdFlip(facing: RigFacing, was: RigFacing | null, moving: boolean, sinceFlip: number): RigFacing {
  if (!moving || !was || facing.flip === was.flip || sinceFlip >= FACING_SMOOTH.flipMs) return facing;
  return { view: facing.view, flip: was.flip };
}

/** Під ковдрою — головою праворуч, до подушки (горбик ковдри намальовано так). */
const BLANKET_FACING: RigFacing = { view: "front", flip: false };

/** Коротший за це рух (у клітинках за кадр) — не рух: кіт стоїть, напрям не з руху. */
const MIN_STEP = 1e-4;
/** Довший за це «крок» за кадр — переставляння симом (стали поруч, повернули зі сходів), а не рух. */
const MAX_STEP = 1;
/** Повільніший за це згладжений рух (клітинок за секунду) — ще не напрям: кіт рушає чи зупиняється. */
const MIN_HEADING = 0.05;
/** Ціль ближча за це (у клітинках) — кіт на ній самій: напрям не з неї. */
const MIN_TARGET = 0.25;
/** Персонаж ліворуч чи праворуч, лише якщо по горизонталі екрана далі за це (одиниці арту); інакше — як було. */
const MIN_SIDE = 6;

/**
 * Ракурс за напрямом на екрані з гістерезисом: `prev` — ракурс минулого кадру (null — без нього, межа без запасу). Нульовий
 * напрям — `prev` чи null. `steady` — напрям руху: у майже прямовисному віддзеркалення тримається довше (`FACING_VERTICAL`).
 */
export function facingFromScreen(dir: Vec, prev: RigFacing | null, steady = false): RigFacing | null {
  const length = Math.hypot(dir.x, dir.y);
  if (length < 1e-9) return prev;
  const ny = dir.y / length;
  const nx = dir.x / length;
  const h = FACING_HYSTERESIS;
  const view = prev === null ? (ny < 0 ? "back" : "front") : prev.view === "front" ? (ny < -h ? "back" : "front") : ny > h ? "front" : "back";
  const hf = steady && Math.abs(ny) > FACING_VERTICAL.vertical ? FACING_VERTICAL.flip : h;
  const flip = prev === null ? nx < 0 : prev.flip ? nx < hf : nx < -hf;
  return { view, flip };
}

/** Ракурс за напрямом у клітинках (з гістерезисом; `steady` — напрям руху, див. `facingFromScreen`). */
export function facingFromTiles(dir: Vec, prev: RigFacing | null, steady = false): RigFacing | null {
  return facingFromScreen(isoScreenDir(dir), prev, steady);
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

/**
 * Кіт кудись іде: до клітинки `goal`, у грі з другом — до `act.run` (утікач у засідці й погоні, мисливець, що наздоганяє в
 * боротьбі) чи за утікачем (мисливець у погоні: сим веде його за утікачем без `goal` і `run`).
 */
export function catMoving(cat: Cat): boolean {
  const act = cat.act;
  return act.goal !== null || act.run !== undefined || (act.kind === "wrestle" && act.game?.phase === "chase");
}

/** Що ще знає `catFacing`, крім стану. */
export interface CatFacingOptions {
  /** Ракурс цього кота минулого кадру: гістерезис. */
  prev?: RigFacing | null;
  /** Місце в парі (`catPairs`), якщо вже пораховано для всіх котів; без поля — `pairOf`. */
  pair?: PairPlacement | null;
  /**
   * Згладжений напрям руху кота в клітинках (за кілька сотень мс, `iso/cats.ts`): з ним ракурс у русі не смикається, коли шлях
   * сима йде відрізками трохи різного нахилу; без поля (чи нульовий) — крок цього кадру.
   */
  heading?: Vec | null;
}

/**
 * Куди дивиться кіт (крок 16): `prevPos` — де кіт був минулого кадру (null — перший кадр).
 * - На руках і на колінах — туди ж, куди персонаж, але `flip` — відносно персонажа, тобто завжди false: такого кота
 *   прикріплено в гніздо скелета персонажа (`arms`, `lap`; `RigSprite.attach`), а вміст гнізда дзеркалить сам контейнер
 *   персонажа — `flip` коту поверх нього дзеркалив би вдруге, і кіт дивився б у протилежний бік. Ракурс — персонажа. Куди
 *   кіт дивиться у світі — `personFacing`.
 * - Під ковдрою — лицем до нас, головою праворуч, до подушки: видно лише вушка й кінчик хвоста над горбиком.
 * - У парі (протистояння, бійка, вилизування, гра, сон поруч) — обличчям до пари вздовж горизонталі екрана (`pairs.ts`).
 * - Іде — за рухом (згладжений напрям `heading`, без нього — різниця позицій; кадр без руху — як минулого кадру, а без нього
 *   — до `goal` чи `run`; майже прямовисно — віддзеркалення тримається довше, `FACING_VERTICAL`). Іде й той, у кого
 *   немає `goal`: у грі з другом утікач біжить до `act.run` (засідка, погоня), мисливець — до нього (погоня, боротьба).
 * - Стоїть: на підвіконні під вікном у задній стіні — спиною до нас, у вікно (сумний — до нас, щоб було видно смуток, як і в
 *   старому вигляді); «Образливий» дметься — спиною, від персонажа; «Пастка на животику» і кіт під рукою — головою від
 *   персонажа; відданий, що кліпає, і ласкавий, що бодається, — до персонажа; ті два — завжди лицем до нас, бо це про
 *   морду. Хто просить, іде по увагу чи слідом — до персонажа; далі — до цілі дії (річ, кіт-суперник, друг); інакше —
 *   `facing` сима: праворуч чи ліворуч, лицем до нас.
 */
export function catFacing(state: GameState, cat: Cat, prevPos: Vec | null, options: CatFacingOptions = {}): RigFacing {
  const prev = options.prev ?? null;
  const simSide = cat.facing < 0;
  const fallback: RigFacing = { view: "front", flip: simSide };
  const held = state.character.held;
  if ((held?.kind === "cat" && held.cat === cat.id) || cat.act.kind === "lap") return { view: personFacing(state, prev).view, flip: false };
  // Під ковдрою (§9.12) видно лише вушка й кінчик хвоста над горбиком: голова — до подушки, праворуч, як горбик і
  // намальовано (вигляд кладе вушка на його гребінь, `blanketOffset`).
  if (cat.act.kind === "sleep" && cat.act.blanket === true && cat.act.goal === null) return BLANKET_FACING;
  const pair = options.pair === undefined ? pairOf(state, cat) : options.pair;
  if (pair?.facing) return pair.facing;
  const act = cat.act;
  if (catMoving(cat)) {
    const heading = options.heading;
    if (heading && Math.hypot(heading.x, heading.y) >= MIN_HEADING) return facingFromTiles(heading, prev, true) ?? fallback;
    const step = prevPos === null ? null : { x: cat.x - prevPos.x, y: cat.y - prevPos.y };
    const length = step === null ? 0 : Math.hypot(step.x, step.y);
    if (step !== null && length >= MIN_STEP && length <= MAX_STEP) return facingFromTiles(step, prev, true) ?? fallback;
    if (prev !== null) return prev;
    const goal = act.goal ?? act.run;
    // Мисливець у погоні без руху цього кадру — далі, до цілі дії (утікача).
    if (goal) return facingFromTiles({ x: goal.x + 0.5 - cat.x, y: goal.y + 0.5 - cat.y }, null) ?? fallback;
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
  // Під рукою (§10, «Пестощі») — так само головою від персонажа: рука лягає на спинку з боку крупа, а не тягнеться через
  // голову, і вуха й морду видно — як змінюється вираз, зокрема вуха «літачком», коли кіт попереджає (рецензія хвилі 3).
  if (interactionWith(state, cat) === "pet") return { view: "front", flip: !sideTo(cat, person, null, !simSide) };
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
