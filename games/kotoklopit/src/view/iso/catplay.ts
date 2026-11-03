// Що грає кіт ізометричного вигляду цього кадру (крок 16, T1): поза й накладка з `catAnim`, поверх — разова анімація чи
// вираз (`catEventAnims`, `catTransition`), поки вона триває; з якою швидкістю грати ходу й біг, щоб лапи не ковзали; і
// висота стрибка на меблі й з них. Чисті розрахунки без Phaser (`tests/isocats.test.ts`), їх кличе частина котів
// (`cats.ts`).

import type { CatFace } from "../anim/catface";
import { CAT_ONE_SHOT_MS, CAT_OVERLAYS, type CatAnimId, type CatOneShotId } from "../anim/ids";
import { CAT_WALK_TILES_PER_MINUTE, ZOOMIES } from "../../sim/config";
import type { Vec } from "../../sim/types";
import type { CatAnimChoice } from "../pose";
import { catJumpLift, catLegLength, catRunRate, catWalkRate } from "../rig/anims/cat/basic";

/** Разова анімація чи вираз кота, що зараз грає. */
export interface CatShot {
  /** Анімація тіла чи накладка (`CAT_ONE_SHOT_MS`); null — лише вираз. */
  anim: CatOneShotId | null;
  /** Кадри обличчя поверх `catFace`; null — від `catFace`. */
  face: Partial<CatFace> | null;
  /** До якого часу сцени, мс. */
  until: number;
  /** Уже почалася (перший кадр її грає з початку). */
  started: boolean;
}

/** Разова від цього моменту на `ms` мс; нульова — нічого. */
export function startShot(anim: CatOneShotId | null, face: Partial<CatFace> | null, ms: number, time: number): CatShot | null {
  return ms > 0 ? { anim, face, until: time + ms, started: false } : null;
}

/** Що грати котові цього кадру (швидкість — `gaitRate`: хода й біг — за тим, як кіт іде на екрані, решта — 1). */
export interface CatPlay {
  anim: CatAnimId;
  overlay: CatAnimId | null;
  /** Разова щойно почалася: грати з початку, навіть якщо та сама вже грала. */
  restart: boolean;
  face: CatFace;
}

/**
 * Поза й накладка (`catAnim`) з обличчям (`catFace`), а поверх — разова, поки триває: анімація тіла (чухання, стрибок) замінює
 * позу, накладка (чхання, шипіння, задишка) — накладку пози; вираз — кадри обличчя. Повертає, що грати, і разову, що лишилася
 * (null — скінчилася).
 */
export function catPlay(choice: CatAnimChoice, face: CatFace, shot: CatShot | null, time: number): { play: CatPlay; shot: CatShot | null } {
  const play: CatPlay = { anim: choice.anim, overlay: choice.overlay, restart: false, face };
  if (!shot || time >= shot.until) return { play, shot: null };
  if (shot.anim !== null) {
    if (CAT_OVERLAYS.has(shot.anim)) play.overlay = shot.anim;
    else play.anim = shot.anim;
    play.restart = !shot.started;
  }
  if (shot.face) play.face = { ...face, ...shot.face };
  shot.started = true;
  return { play, shot };
}

// --- Хода й біг ----------------------------------------------------------------------------------
//
// Лапи стоять на підлозі, лише коли анімація ходи йде в такт тому, як кіт пересувається на екрані (N1: `catWalkRate`,
// `catRunRate`): швидкість відтворення — з його швидкості на екрані й довжини лап (`catLegLength` × масштаб кота: кошеня,
// порода, клубочок). Повільніша хода хворого чи повного (§9.5) — уже в тому, як повільно сим веде кота.

/**
 * Анімації ходи, у яких той самий цикл і крок, що в `walk` (рись N1): кульгає, незграбна й сумна хода (N3), несе в зубах
 * (N2) — тож і швидкість відтворення та сама, `catWalkRate`.
 */
export const WALK_GAITS: ReadonlySet<CatAnimId> = new Set<CatAnimId>(["walk", "limp", "clumsy", "sadWalk", "carry"]);

/**
 * Далі за це (одиниці арту) за кадр — кота переставили (на руки, з рук, у пару), а не він пройшов: такий кадр швидкості не
 * змінює. Найшвидший кіт (зумі, ≈ 640 одиниць за секунду) за кадр 60 Гц проходить ≈ 11.
 */
export const GAIT_TELEPORT = 60;
/** За скільки мс згладжена швидкість доходить до нової на ≈ 63 %: кадри нерівні, і темп лап не має смикатися. */
export const GAIT_SMOOTH_MS = 80;

/**
 * Швидкість, з якою кіт іде на екрані для лап (одиниці арту за секунду; `dx`, `dy` — зсув точки підлоги під ним за `seconds`):
 * горизонтальна складова — лапи ходять уздовж кота, а на екрані він профілем; коли кіт іде майже прямовисно (вглиб чи до
 * камери), — вертикальна, інакше він плив би на нерухомих лапах. У сітці 2:1 уздовж осі клітинок горизонтальна вдвічі
 * більша за вертикальну, тож там це рівно «горизонтальна складова» `catWalkRate`.
 */
export function gaitSpeed(dx: number, dy: number, seconds: number): number {
  if (!(seconds > 0)) return 0;
  return Math.max(Math.abs(dx), Math.abs(dy)) / seconds;
}

/** Що частина котів пам'ятає між кадрами для темпу лап: де була точка підлоги під котом і згладжена швидкість. */
export interface GaitMemory {
  x: number;
  y: number;
  speed: number;
}

/**
 * Згладжена швидкість кота на екрані цього кадру (`GAIT_SMOOTH_MS`) з пам'яттю `mem` (null — перший кадр: стоїть). Нову
 * точку підлоги `x`, `y` записує в `mem` (той самий об'єкт — щокадру нічого не створюється); переставлений кіт
 * (`GAIT_TELEPORT`) швидкості не міняє.
 */
export function nextGait(mem: GaitMemory | null, x: number, y: number, seconds: number): GaitMemory {
  if (mem === null) return { x, y, speed: 0 };
  const dx = x - mem.x;
  const dy = y - mem.y;
  mem.x = x;
  mem.y = y;
  if (!(seconds > 0) || Math.hypot(dx, dy) > GAIT_TELEPORT) return mem;
  const k = 1 - Math.exp((-seconds * 1000) / GAIT_SMOOTH_MS);
  mem.speed += (gaitSpeed(dx, dy, seconds) - mem.speed) * k;
  return mem;
}

/**
 * Швидкість відтворення анімації кота: хода (`WALK_GAITS`) і біг — за швидкістю на екрані `speed` (одиниці арту за секунду)
 * і довжиною лап (`catLegLength(kitten, shortLegs)` × `scale` — масштаб спрайта кота), щоб лапи не ковзали; решта — 1.
 */
export function gaitRate(anim: CatAnimId, speed: number, kitten: number, shortLegs: boolean, scale: number): number {
  if (anim !== "run" && !WALK_GAITS.has(anim)) return 1;
  const leg = catLegLength(kitten, shortLegs) * scale;
  return anim === "run" ? catRunRate(speed, leg) : catWalkRate(speed, leg);
}

// --- Переставлений кіт доганяє своє місце ----------------------------------------------------------

/**
 * Кіт, якого сим переставив на підлозі (рецензія хвилі 3): мисливець у грі-боротьбі, добігши до клітинки утікача, за один крок
 * стає впритул збоку (`standBeside` сима) — до ≈ 1,5 клітинки за кадр, — а пара (`catPairs`) вмикає й знімає свій зсув одразу.
 * Вигляд не перескакує туди за кадр, а доганяє нове місце. `speed` — найшвидший кіт сима (зумі й погоня, клітинок за ігрову
 * хвилину): що понад нього (із запасом `slack` і `eps` на нерівні кадри) кіт «пройшов» за кадр, те переставлення. Доганяє не
 * швидше за `fast` (клітинок за секунду, ≈ біг сима за звичайної швидкості гри), наближаючись на ≈ 63 % за `ms`, і не
 * повільніше за `slow` — без довгого доповзання. Позаду далі за `run` клітинки — біжить (`run`), а не ковзає в позі: так
 * доганяє переставлений симом, а зсув пари (до ≈ 0,3 клітинки: бійка зійшлася чи розійшлася) — коротким ковзанням без
 * зміни пози (з 0,3 переможений бійки на мить спалахував бігом). Стрибок, довший за `max` клітинки, — переставляння (з
 * поїздки, з рук): одразу, як і раніше.
 */
export const CATCH = { speed: CAT_WALK_TILES_PER_MINUTE * ZOOMIES.speed, slack: 1.25, eps: 0.02, fast: 12, ms: 70, slow: 2.5, run: 0.45, max: 2 } as const;

/** Скільки клітинок найшвидший кіт міг пробігти за кадр, що тривав `minutes` ігрових хвилин (немає чи від'ємне — скільки завгодно). */
export function catStep(minutes: number): number {
  return minutes >= 0 ? CATCH.speed * minutes * CATCH.slack + CATCH.eps : Number.POSITIVE_INFINITY;
}

/**
 * Стрибок місця кота на підлозі за кадр, клітинки (пише в `out`): зміна зсуву пари `pair` і те, на скільки сим переставив кота
 * (`moved`) понад `step` (`catStep`) — у напрямку переставлення.
 */
export function catJump(moved: Vec, pair: Vec, step: number, out: Vec): Vec {
  out.x = pair.x;
  out.y = pair.y;
  const d = Math.hypot(moved.x, moved.y);
  if (d > step) {
    const k = 1 - step / d;
    out.x += moved.x * k;
    out.y += moved.y * k;
  }
  return out;
}

/**
 * На скільки намальований кіт позаду свого місця (клітинки, `lag` — переписується): що лишилося з минулих кадрів, ближче на
 * крок цього кадру за `seconds` (`CATCH`), і мінус стрибок цього кадру `jump` (`catJump`) — намальований кіт лишається, де був.
 * Стрибок чи відставання, довші за `CATCH.max`, — переставляння: одразу на місці.
 */
export function catchUp(lag: Vec, jump: Vec | null, seconds: number): Vec {
  const left = Math.hypot(lag.x, lag.y);
  if (left > 0) {
    const ease = seconds > 0 ? 1 - Math.exp((-seconds * 1000) / CATCH.ms) : 0;
    const step = seconds > 0 ? Math.max(Math.min(left * ease, CATCH.fast * seconds), CATCH.slow * seconds) : 0;
    const k = step >= left ? 0 : (left - step) / left;
    lag.x *= k;
    lag.y *= k;
  }
  if (jump && (jump.x !== 0 || jump.y !== 0)) {
    lag.x -= jump.x;
    lag.y -= jump.y;
    if (Math.hypot(jump.x, jump.y) > CATCH.max || Math.hypot(lag.x, lag.y) > CATCH.max) {
      lag.x = 0;
      lag.y = 0;
    }
  }
  return lag;
}

// --- Місце в юрбі й на речі між кадрами ------------------------------------------------------------

/**
 * За скільки мс кіт доходить до свого місця в юрбі (`catCrowds`, `perchCrowds`) на ≈ 63 %: прийшовши до персонажа чи до миски,
 * він відступає вбік кроком, а не перескакує.
 */
export const CROWD_EASE_MS = 140;

/** Що вигляд котів (`iso/cats.ts`) пам'ятає між кадрами про те, де кіт намальований щодо свого місця. */
export interface PlaceMemory {
  /** Зсув кота в юрбі зараз, клітинки: плавно йде до того, що кажуть `catCrowds` і `perchCrowds` (`crowdShift`). */
  crowd: Vec;
  /** На скільки намальований кіт ще позаду свого місця на підлозі чи на речі (клітинки): доганяє його (`CATCH`). */
  catchUp: Vec;
  /** Минулого кадру кіт був на меблях (`furniture`): на якій речі й де на ній (`CatSpot.at`, клітинки); null — не на меблях. */
  seatWas: { box: string; x: number; y: number } | null;
}

/**
 * Зсув кота в юрбі цього кадру (`PlaceMemory.crowd`, пише туди ж і повертає): плавно до `target` (null — без зсуву); кадр без
 * часу — як був; `first` — перший кадр кота, одразу на місці. Вийшов із юрби, а стоїть, де стояв (`hold`: персонаж відійшов,
 * кота перестали гладити, сусід на речі пішов), — лишається там, де його намалювали, а не ковзає в точку сима (у ноги
 * персонажа): зсув знімається, коли кіт рушить. Місце на речі стрибнуло — зсув уже не тримається (`seatCatchUp`).
 */
export function crowdShift(mem: Pick<PlaceMemory, "crowd">, target: Vec | null, hold: boolean, seconds: number, first: boolean): Vec {
  const crowd = mem.crowd;
  if (target === null && hold) return crowd;
  const tx = target?.x ?? 0;
  const ty = target?.y ?? 0;
  const k = first ? 1 : seconds > 0 ? 1 - Math.exp((-seconds * 1000) / CROWD_EASE_MS) : 0;
  crowd.x += (tx - crowd.x) * k;
  crowd.y += (ty - crowd.y) * k;
  if (Math.abs(crowd.x) < 1e-4 && Math.abs(crowd.y) < 1e-4) {
    crowd.x = 0;
    crowd.y = 0;
  }
  return crowd;
}

/** Буфери `seatCatchUp`: щокадру не створювати нових. */
const SEAT_MOVED: Vec = { x: 0, y: 0 };
const SEAT_NO_PAIR: Vec = { x: 0, y: 0 };
const SEAT_JUMP: Vec = { x: 0, y: 0 };

/**
 * Місце кота на меблях (`CatSpot.at` на речі `box`) за кадр стрибнуло далі, ніж кіт пробіг би (`step`, `catStep`): на столі з
 * комп'ютером той, хто став заважати роботі, переходить на клавіатуру, а той, хто перестав, — з неї поруч (`deskSeat`); пара
 * на меблях увімкнула чи зняла зсув. Кіт доганяє нове місце (`CATCH`, без бігу — це крок по стільниці), а не перескакує
 * (`PlaceMemory.catchUp` — пише туди ж і повертає). Ходою по речі місце змінюється не швидше за кота, тож там нічого не
 * доганяє; щойно виліз на річ чи переліз на іншу — теж (там стрибок, `nextLift`).
 *
 * Зсув юрби, який кіт тримав від старого місця (`crowdShift`, `hold`: стояв у рядку обабіч клавіатури, а сусід пішов), — до
 * нового місця вже не стосується: він переходить у доганяння, і намальований кіт лишається, де був, а доходить саме в нове
 * місце (рецензія пакета «кіт на клавіатурі»: друга з рядка, ставши на клавіатуру, тримала зсув рядка й сиділа позаду
 * клавіатури, між нею й монітором). Новий рядок, якщо він є, зсуне кота вже від нового місця.
 */
export function seatCatchUp(mem: PlaceMemory, box: string, at: Vec, step: number, seconds: number): Vec {
  const lag = mem.catchUp;
  const seat = mem.seatWas;
  if (seat === null || seat.box !== box) {
    lag.x = 0;
    lag.y = 0;
    mem.seatWas = { box, x: at.x, y: at.y };
    return lag;
  }
  SEAT_MOVED.x = at.x - seat.x;
  SEAT_MOVED.y = at.y - seat.y;
  seat.x = at.x;
  seat.y = at.y;
  const jump = catJump(SEAT_MOVED, SEAT_NO_PAIR, step, SEAT_JUMP);
  // Спершу — ближче на крок цього кадру (що лишилося з минулих), потім стрибок разом зі старим зсувом юрби: цього кадру
  // намальований кіт іде не далі, ніж без зсуву.
  catchUp(lag, null, seconds);
  if (jump.x !== 0 || jump.y !== 0) {
    lag.x += mem.crowd.x;
    lag.y += mem.crowd.y;
    mem.crowd.x = 0;
    mem.crowd.y = 0;
  }
  return catchUp(lag, jump, 0);
}

// --- Опустили на підлогу -----------------------------------------------------------------------

/**
 * Кіт, якого персонаж опустив (`putDown`; рецензія хвилі 3, person-r3-1): сим ставить його на 0,6 клітинки попереду
 * персонажа за напрямом сима, а кисті (`personCatGrip`) — збоку на екрані, і кіт, відпущений на підлогу під кистями, ковзав
 * у позі «сидить» на ≈ 0,4 клітинки вбік, поки руки ще торкалися порожньої підлоги (а з юрбою біля персонажа — ще й туди, бо
 * кота за мить натискання встигали погладити, і він ставав «під рукою»). Тепер кіт стоїть там, де його поставили руки: під
 * кистями (`at` мінус спинка від кореня `pet`, px світу) — і з миті «відпустив», і після разової, поки не рушить, сим не
 * переставить його чи персонаж не відійде (`stillPutDown`); юрба біля персонажа його не зсуває. Пише в `out` і повертає його.
 */
export function putDownGround(at: Vec, pet: Vec, out: Vec): Vec {
  out.x = at.x - pet.x;
  out.y = at.y - pet.y;
  return out;
}

/** Де сим поставив кота, якого опустили (клітинки), і де тоді стояв персонаж: поки обидва там, кіт лишається під кистями. */
export interface PutDown {
  cat: Vec;
  person: Vec;
}

/**
 * Кіт, якого опустили (`put`; null — ні), ще стоїть там, де його поставили руки (`putDownGround`): його саме беруть чи
 * опускають (`lifting`), або сим його не переставив, він не йде (`moving`) і персонаж не відійшов. Інакше — звичайне місце
 * на підлозі (й у юрбі): зсув знімається, коли кіт рушить, а коли пішов персонаж — лишається, де стоїть (`hold`).
 */
export function stillPutDown(put: PutDown | null, cat: Vec, person: Vec, moving: boolean, lifting: boolean): boolean {
  if (put === null) return false;
  if (lifting) return true;
  return !moving && put.cat.x === cat.x && put.cat.y === cat.y && put.person.x === person.x && put.person.y === person.y;
}

// --- Стрибок -----------------------------------------------------------------------------------

/** Стрибок на меблі й з них (`jumpUp`, `jumpDown`): скільки триває. */
export const JUMP = { ms: Math.max(CAT_ONE_SHOT_MS.jumpUp, CAT_ONE_SHOT_MS.jumpDown) } as const;

/** Висота кота над підлогою, що змінюється стрибком: звідки, куди й коли почалося. */
export interface Lift {
  from: number;
  to: number;
  start: number;
}

/**
 * Висота в момент `time`: від `from` до `to` за ходом стрибка N1 (`catJumpLift`: угору — як `jumpUp`, униз — як `jumpDown`;
 * анімація стрибка лише показує форму, а з висоти на висоту кота веде вигляд); після стрибка — `to`.
 */
export function liftAt(lift: Lift, time: number): number {
  if (lift.from === lift.to || time - lift.start >= JUMP.ms) return lift.to;
  const u = catJumpLift(lift.to > lift.from ? "jumpUp" : "jumpDown", Math.max(0, time - lift.start));
  return lift.from + (lift.to - lift.from) * u;
}

/**
 * Висота поверхні під котом у момент `time` — там його тінь: у стрибку тінь не злітає з котом, а лишається на підлозі чи на
 * верху меблів. На меблі тінь лишається на підлозі, поки кіт не долетів до їхнього верху, і тоді перескакує нагору; з меблів —
 * одразу на підлозі, куди кіт стрибає. Тінь ніколи не вища за кота.
 */
export function groundAt(lift: Lift, time: number): number {
  if (lift.to > lift.from && liftAt(lift, time) < lift.to) return lift.from;
  return lift.to;
}

/**
 * Нова висота кота: `target` — де він тепер (верх меблів чи підлога); `jumping` — між підлогою й меблями стрибають (на руки,
 * у переноску тощо — одразу). Повертає стан стрибка на наступний кадр і висоту зараз.
 */
export function nextLift(prev: Lift | null, target: number, jumping: boolean, time: number): { lift: Lift; now: number } {
  if (!jumping || prev === null) return { lift: { from: target, to: target, start: time - JUMP.ms }, now: target };
  if (prev.to === target) return { lift: prev, now: liftAt(prev, time) };
  const lift = { from: liftAt(prev, time), to: target, start: time };
  return { lift, now: liftAt(lift, time) };
}
