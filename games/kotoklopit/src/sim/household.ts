// Побут (§8.7): шерсть і пилосос, прання, техніка (автогодівниця, фонтанчик, робот-пилосос), поломки.

import { asleep, traitLevel } from "./cat";
import { changeStat, unpleasantTask } from "./character";
import { BOWL_CAPACITY, FOUNTAIN, HOUSEHOLD, MESS_ANNOYANCE, MINUTES_PER_HOUR, NOISE, ROBOT, SHEDDING, TOOL_REACH, VACUUM } from "./config";
import { DUST_SPOTS, dustOf, floorDust, removeDust, tickDust } from "./dust";
import { inView, observe } from "./knowledge";
import { addSupply, flySupply, settleFeeders, takeSupplies, topQuality, useSupply } from "./economy";
import { emit } from "./events";
import { hygieneFactorMod, powerOut, sheddingFactor } from "./modifiers";
import { addMess, whereIs } from "./catai";
import { CARRIER_TILE, hiddenTile, isSolid, isWall, itemPoint, itemTile, LAUNDRY_BASKET, objectAt, objectById, ROBOT_DOCK, roomAt, slotCenter, STASHES } from "./home";
import { loudNoise, quietRobot } from "./noise";
import { waterCapacity } from "./resources";
import type { Rng } from "./rng";
import { absoluteMinute } from "./time";
import type { BowlItem, Cat, CleaningTool, Feeder, GameState, HomeItem, Mess, MessKind, Product, Quality, Vec } from "./types";

/** Шкала шерсті квартири (§8.7): 0–100. */
const FUR_MAX = 100;

/**
 * Де лежать жмути шерсті (§8.7): сталі місця по квартирі — у вітальні, спальні, на кухні й у ванній; що більше шерсті, то більше
 * їх з'являється. Новий лягає на вільне місце, найближче до кота вдома (`shedTuft`, [Змінено пізніше], рішення автора
 * 2026-11-03). Порядок тут — лише коли котів удома немає і коли жмути докладаються за шкалою одразу (`topUpTufts`): спершу у
 * вітальні, потім у спальні, на кухні й у ванній, а далі знову у вітальні.
 */
export const FUR_SPOTS: readonly Vec[] = [
  { x: 2.3, y: 7.4 }, { x: 5.2, y: 9.1 }, { x: 8.7, y: 7.8 }, { x: 12.4, y: 8.6 }, { x: 15.6, y: 7.2 }, { x: 17.4, y: 9.3 },
  { x: 4.1, y: 2.6 }, { x: 14.6, y: 2.4 }, { x: 9.6, y: 3.6 }, { x: 6.8, y: 8.9 }, { x: 11.2, y: 7.1 }, { x: 3.4, y: 9.6 },
];

/** Скільки шерсті — один жмут (§8.7): прибраний жмут знімає зі шкали свою частку, 1/12. */
const TUFT_FUR = FUR_MAX / FUR_SPOTS.length;

/** Жмути шерсті на підлозі (§8.7): індекси `FUR_SPOTS` у порядку появи. */
export function tuftsOf(state: Pick<GameState, "home">): readonly number[] {
  return state.home.tufts ?? [];
}

/**
 * Видимі жмути шерсті (§8.7): безлад на своїх місцях (рішення автора 2026-11-02, «Пилосос у руках»). Від 50 шерсті вони
 * з'являються по одному біля котів (`shedTuft`) і лежать, доки їх не прибере пилосос у руках чи робот-пилосос. Вони
 * дратують, як безлад (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А17), прискорюють падіння гігієни й тягнуть на штраф ОСББ
 * (`furVisible`): що видно, те й шкодить.
 */
export function furTufts(state: Pick<GameState, "home">): readonly Vec[] {
  return tuftsOf(state).flatMap((i) => {
    const spot = FUR_SPOTS[i];
    return spot ? [spot] : [];
  });
}

/**
 * Шерсть видно (§8.7): на підлозі лежить хоч один жмут. Жмути з'являються лише від `HOUSEHOLD.dirtyFur` (50), а прибирають їх по
 * одному, тож у недопилососеній квартирі шерсті може бути вже менше 50, а жмути ще лежать — і шкодять, доки лежать (рішення
 * виконавця 2026-11-02: «Шерсть видно лише від 50» — про появу жмутів, «видима шерсть шкодить» — про жмути, що лежать).
 */
export const furVisible = (state: Pick<GameState, "home">): boolean => tuftsOf(state).length > 0;

/** Скільки жмутів лежить за шкалою шерсті (§8.7): від 50 — частка шкали × 12 (на 50 — шість), менше 50 нових немає. */
function tuftTarget(fur: number): number {
  return fur >= HOUSEHOLD.dirtyFur ? Math.min(FUR_SPOTS.length, Math.floor((fur / FUR_MAX) * FUR_SPOTS.length)) : 0;
}

/**
 * Скільки жмутів ще ляже за шкалою (§8.7, [Змінено пізніше]): шерсть на них уже набралася, а вони з'являються по одному
 * (`shedTuft`). Нуль — на підлозі всі, скільки за шкалою.
 */
export function pendingTufts(state: Pick<GameState, "home">): number {
  return Math.max(0, tuftTarget(state.home.fur) - tuftsOf(state).length);
}

/**
 * Жмути шерсті за шкалою одразу (§8.7): на перші вільні місця `FUR_SPOTS`, доки їх не стане стільки, скільки за шкалою
 * (`tuftTarget`). Так вони лягають там, де їхньої появи не видно: вранці, якщо за коротку ніч не всі встигли з'явитися
 * (`nightlyHousehold`). Протягом дня й ночі вони з'являються по одному (`shedTuft`). Ті, що лежать, лишаються, хоч би скільки шерсті було: їх прибирають.
 */
export function topUpTufts(state: GameState): void {
  const tufts = (state.home.tufts ??= []);
  const target = tuftTarget(state.home.fur);
  const before = tufts.length;
  for (let i = 0; i < FUR_SPOTS.length && tufts.length < target; i++) if (!tufts.includes(i)) tufts.push(i);
  if (tufts.length > before) state.home.tuftAt = absoluteMinute(state.day, state.minute);
}

/** Кіт удома, що лишає шерсть (§8.7), і де він зараз. */
interface Shedder {
  cat: Cat;
  at: Vec;
}

/**
 * Коти вдома, що лишають шерсть (§8.7): кіт у поїздці чи на сходах тут не линяє, безшерстий — не линяє зовсім. Кота на руках
 * персонаж несе з собою (`whereIs`): його шерсть лягає біля персонажа, а не там, де кота взяли, — клітинка кота на руках
 * стоїть на місці до `putDownCat`.
 */
function shedders(state: GameState): Shedder[] {
  return state.cats.flatMap((cat) => (cat.away === null && furPerHour(state, cat) > 0 ? [{ cat, at: whereIs(state, cat) }] : []));
}

/** Як далеко кіт від місця жмута (§8.7): відстань, клітинки, і чи між ними немає стіни (`clearPath`). */
interface TuftReach {
  distance: number;
  clear: boolean;
}

/** Ближче для жмута: без стіни між котом і місцем — завжди ближче, ніж крізь стіну, а далі — за відстанню. */
const closer = (a: TuftReach, b: TuftReach | null): boolean => b === null || (a.clear !== b.clear ? a.clear : a.distance < b.distance);

/**
 * Хто з котів `cats` найближчий до місця `spot` (§8.7, `closer`): жмут із-під кота не опиняється за стіною в іншій кімнаті, коли
 * поруч є місце без стіни. Котів немає — null.
 */
function nearestShedder(cats: readonly Shedder[], spot: Vec): (TuftReach & { cat: Cat }) | null {
  let best: (TuftReach & { cat: Cat }) | null = null;
  for (const { cat, at } of cats) {
    const reach = { cat, distance: Math.hypot(spot.x - at.x, spot.y - at.y), clear: clearPath(at, spot) };
    if (closer(reach, best)) best = reach;
  }
  return best;
}

/**
 * Де ляже новий жмут (§8.7, «Жмути шерсті» [Змінено пізніше], рішення автора 2026-11-03): на вільному місці `FUR_SPOTS`,
 * найближчому до кота вдома (`nearestShedder`); котів удома немає — на першому вільному, як і раніше. Вільних місць немає — null.
 */
function nextTuftSpot(state: GameState): number | null {
  const tufts = tuftsOf(state);
  const free = FUR_SPOTS.flatMap((_, i) => (tufts.includes(i) ? [] : [i]));
  const cats = shedders(state);
  let best: (TuftReach & { index: number }) | null = null;
  for (const index of free) {
    const near = nearestShedder(cats, FUR_SPOTS[index]!);
    if (near && closer(near, best)) best = { index, distance: near.distance, clear: near.clear };
  }
  return best?.index ?? free[0] ?? null;
}

/**
 * З-під якого кота вдома викотився жмут на місці `index` (§8.7, [Змінено пізніше]): найближчого до нього, від кого до місця
 * немає стіни; такого немає (котів удома немає чи всі за стіною) — null. Для вигляду: звідки жмут котиться на своє місце.
 */
export function tuftCat(state: GameState, index: number): Cat | null {
  const spot = FUR_SPOTS[index];
  if (!spot) return null;
  const near = nearestShedder(shedders(state), spot);
  return near?.clear === true ? near.cat : null;
}

/**
 * Новий жмут шерсті за хвилини побуту (§8.7, «Жмути шерсті» [Змінено пізніше], рішення автора 2026-11-03: «котяча шерсть на
 * підлозі з'являється посеред дня миттєво, що псує враження»): жмутів менше, ніж за шкалою (`tuftTarget`), — лягає один, біля
 * кота вдома (`nextTuftSpot`), і не раніше ніж за `HOUSEHOLD.tuftEveryMinutes` після попереднього (`home.tuftAt`). Так на 50
 * шерсті шість жмутів з'являються один за одним, а не всі разом; уночі — так само, і до ранку їх стільки, скільки за шкалою.
 * Шкодять (`furVisible`) лише ті, що вже лежать.
 */
export function shedTuft(state: GameState): void {
  const home = state.home;
  const tufts = (home.tufts ??= []);
  if (tufts.length >= tuftTarget(home.fur)) return;
  const now = absoluteMinute(state.day, state.minute);
  // Годинник пішов назад (режим розробки) — чекати не на що.
  if (home.tuftAt !== undefined && now >= home.tuftAt && now - home.tuftAt < HOUSEHOLD.tuftEveryMinutes) return;
  const index = nextTuftSpot(state);
  if (index === null) return;
  tufts.push(index);
  home.tuftAt = now;
}

/** Множник падіння гігієни (§8.7): без чистого одягу й у шерсті вона падає швидше. */
export function hygieneFactor(state: GameState): number {
  const home = state.home;
  return (home.clothes <= 0 ? HOUSEHOLD.noClothesHygiene : 1) * (furVisible(state) ? HOUSEHOLD.furHygiene : 1) * hygieneFactorMod(state);
}

/**
 * Безлад дратує (§9.12, правка автора 2026-10-23): кожен, що в полі зору персонажа, — здоровий
 * глузд за годину, разом не більше межі. З душової кабіни безладу не видно. Лише вдень, удома.
 * Видимі жмути шерсті — ще один безлад, скільки б їх не було на очах (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А17). Пил
 * на відкритій підлозі — теж безлад, кожен клубок (§8.7, «Пил і павутина», рішення автора 2026-11-02); пил у кутах і біля стін і
 * павутина — лише вигляд.
 */
export function annoyingMesses(state: GameState, minutes: number): void {
  const activity = state.character.activity;
  if (state.trip !== null || (activity?.kind === "use" && activity.inside)) return;
  const fur = furTufts(state).some((p) => inView(state, p)) ? 1 : 0;
  const dust = floorDust(state).filter((p) => inView(state, p)).length;
  const seen = state.home.messes.filter((m) => inView(state, m)).length + fur + dust;
  if (seen === 0) return;
  const perHour = Math.max(MESS_ANNOYANCE.max, seen * MESS_ANNOYANCE.perHour);
  changeStat(state, "sanity", perHour * (minutes / MINUTES_PER_HOUR));
}

/**
 * Скільки шерсті кіт лишає за годину (§8.7). Шерсть від пестощів — частка від цього ж (`shedOnHands`), тож грумер і «Линька» /
 * «Зимове хутро» діють і на неї; жмут із руки — прояв риси, його шанс від них не залежить.
 */
export function furPerHour(state: GameState, cat: Cat): number {
  if (cat.shape.coat === "hairless") return 0;
  const long = cat.shape.coat === null && !cat.genes.short[0] && !cat.genes.short[1];
  const groomed = state.day <= cat.groomedUntil ? SHEDDING.groomed : 1;
  return HOUSEHOLD.furPerCatHour * (long ? HOUSEHOLD.longFur : 1) * Math.max(0, 1 + HOUSEHOLD.sheddingStep * traitLevel(cat, "shedding")) * groomed * sheddingFactor(state);
}

/** Кіт у барабані відчиненої пральної машини (§8.7). */
export function catInWasher(state: GameState): Cat | null {
  const washer = objectById("washer");
  return state.cats.find((c) => c.away === null && c.act.goal === null && Math.floor(c.x) === washer.x && Math.floor(c.y) === washer.y) ?? null;
}

/**
 * Дія біля пральної машини (§8.7): спершу вигнати кота з барабана, потім запустити прання з пральним
 * засобом, а випране — розвісити. Повертає, що сталося, або причину відмови. Без світла («Планове відключення», §4.1, рішення
 * автора 2026-11-02) машина не працює: розвісити випране й вигнати кота можна — для цього струм не потрібен, — а запустити прання
 * ні; прання, запущене до відключення, стоїть, і машина каже саме це, а не «ще пере».
 */
export function tapWasher(state: GameState): "cat" | "started" | "hung" | "empty" | "busy" | "clean" | "no-power" {
  const washer = state.home.washer;
  if (washer.state === "washing") return powerOut(state) ? "no-power" : "busy";
  if (washer.state === "done") {
    // Чистого одягу — не менше, ніж було: прання з повною шафою не зменшує запасу (перевірка побуту 2026-10-28).
    state.home.clothes = Math.max(state.home.clothes, HOUSEHOLD.clothesDays[washer.quality]);
    washer.state = "idle";
    emit(state, { type: "laundry", stage: "hung" });
    return "hung";
  }
  const cat = catInWasher(state);
  if (cat) {
    // Застали кота в барабані — прояв «Допитливості» (§9.9), якщо сон у барабані ще не помітили (повторна перевірка розмноження й побуту 2026-10-28: зараховувався двічі).
    if (!asleep(cat) || cat.act.seen !== true) observe(state, cat, "curiosity");
    cat.y += 1;
    cat.act = { kind: "idle", target: null, goal: null, minutes: 2, elapsed: 0 };
    emit(state, { type: "laundry", stage: "cat", cat: cat.id });
    return "cat";
  }
  // Без світла не запустити: ні засіб, ні чистий одяг тут уже нічого не змінюють (§4.1).
  if (powerOut(state)) return "no-power";
  // Чистого одягу вже не менше, ніж дасть засіб, що візьметься першим (спершу дорожчий): прання нічого не додасть — машина не
  // запускається, засіб лишається, як і в душі на межі (§8.7; загальна ревізія 2026-10-29: засіб витрачався, а гучний віджим
  // даремно лякав і будив котів).
  const top = topQuality(state, "detergent");
  if (top !== null && state.home.clothes >= HOUSEHOLD.clothesDays[top]) return "clean";
  const quality = useSupply(state, "detergent");
  if (quality === null) return "empty";
  state.home.washer = { state: "washing", minutes: HOUSEHOLD.washMinutes, quality };
  emit(state, { type: "laundry", stage: "started" });
  return "started";
}

/**
 * Сухе сміття (§8.7, «Пилосос у руках»): його бере пилосос — клапті шерсті після бійки, розсипаний наповнювач, папір, сміття з
 * перекинутого смітника, уламки. Мокре й органічне — калюжі, блювоту, «сюрприз», шерстяну грудку, мітку — лише руками.
 */
const DRY: Record<MessKind, boolean> = {
  surprise: false,
  vomit: false,
  hairball: false,
  litter: true,
  broken: true,
  fur: true,
  mark: false,
  pee: false,
  puddle: false,
  paper: true,
  garbage: true,
};

/** Безлад сухий: його прибирає пилосос (§8.7). */
export const isDryMess = (kind: MessKind): boolean => DRY[kind];

/** Між точками немає стіни: пилосос крізь стіну не дістає, як і рука (§10, `targets.ts`); біля самої стіни — дістає. */
export function clearPath(a: Vec, b: Vec): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.1);
  for (let i = 1; i < steps - 1; i++) {
    const t = i / steps;
    if (isWall(Math.floor(a.x + (b.x - a.x) * t), Math.floor(a.y + (b.y - a.y) * t))) return false;
  }
  return true;
}

/** Що прибрав пилосос за раз (§8.7): місця жмутів шерсті й пилу і який безлад. */
interface Swept {
  tufts: number[];
  dust: number[];
  messes: Pick<Mess, "id" | "kind">[];
}

/**
 * Прибрати довкола точки `at` (§8.7): жмути шерсті (кожен знімає зі шкали свою частку) і пил у `reach.floor`, павутину в
 * `reach.web`, сухий безлад (`messes`); крізь стіну — ні. Прибране здорового глузду окремо не забирає (його забирає сам
 * інструмент). Додає прибране до `out`.
 */
function sweep(state: GameState, at: Vec, reach: { floor: number; web: number }, messes: boolean, out: Swept): void {
  const home = state.home;
  const near = (p: Vec, radius = reach.floor): boolean => Math.hypot(p.x - at.x, p.y - at.y) <= radius && clearPath(at, p);
  const tufts = tuftsOf(state).filter((i) => {
    const spot = FUR_SPOTS[i];
    return spot !== undefined && near(spot);
  });
  if (tufts.length > 0) {
    home.tufts = tuftsOf(state).filter((i) => !tufts.includes(i));
    home.fur = Math.max(0, home.fur - tufts.length * TUFT_FUR);
    out.tufts.push(...tufts);
  }
  for (const index of dustOf(state)) {
    const spot = DUST_SPOTS[index];
    if (!spot || !near(spot, spot.kind === "cobweb" ? reach.web : reach.floor)) continue;
    removeDust(state, index);
    out.dust.push(index);
  }
  if (!messes) return;
  const dry = home.messes.filter((m) => isDryMess(m.kind) && near(m));
  if (dry.length === 0) return;
  home.messes = home.messes.filter((m) => !dry.includes(m));
  out.messes.push(...dry.map((m) => ({ id: m.id, kind: m.kind })));
}

/** Пилосос щось прибрав (§8.7): подія для журналу. */
function reportSwept(state: GameState, by: "person" | "robot", swept: Swept): void {
  if (swept.tufts.length + swept.dust.length + swept.messes.length === 0) return;
  emit(state, { type: "vacuumed", by, ...swept });
}

/** Чим прибирає персонаж (§8.7): пилосос, коли його купили й є світло, інакше віник. Місце й руки в них спільні. */
export function cleaningTool(state: GameState): CleaningTool {
  return state.home.appliances.vacuum && !powerOut(state) ? "vacuum" : "broom";
}

/**
 * Узяти інструмент у руки (§8.7): коротким натисканням біля нього, як іграшку. Пилосос загудів — гучний звук на всю квартиру
 * (§9.12): коти, що не сплять, лякаються й ховаються, сміливі — ні. Віник тихий.
 */
export function takeVacuum(state: GameState): void {
  state.home.vacuumAt = null;
  state.character.held = { kind: "vacuum", minutes: 0 };
  emit(state, { type: "vacuum", stage: "taken" });
  if (cleaningTool(state) === "vacuum") loudNoise(state, "vacuum", null);
}

/**
 * Чи можна поставити пилосос на клітинку: видна підлога (`hiddenTile`) без речі — лотка, миски, будиночка, іграшки, ящиків біля
 * входу, переноски, бази робота-пилососа, кошика білизни. Поставлений на річ, він був би на одній клітинці з нею, і ціллю біля
 * них ставала б річ, а пилосос — не взяти (баланс 2026-11-02: бот, що поставив пилосос на лоток, більше його не брав); на
 * переносці, базі й кошику він ще й стояв би в них (рецензія пилососа 2026-11-02).
 */
function vacuumFits(state: GameState, x: number, y: number): boolean {
  if (isSolid(state, x, y) || hiddenTile(x, y) || objectAt(state, x, y) !== null) return false;
  const home = state.home;
  const on = (p: Vec): boolean => Math.floor(p.x) === x && Math.floor(p.y) === y;
  if (on(LAUNDRY_BASKET) || (home.carriers.length > 0 && on(CARRIER_TILE)) || (home.appliances.robot && on(ROBOT_DOCK))) return false;
  return !home.items.some((item) => on(itemTile(item)));
}

/** Куди ставлять пилосос: на стільки клітинок перед персонажем (§8.7). */
const VACUUM_PUT = 0.5;
/** Ближче за це до персонажа поставлений пилосос стояв би в нього під ногами, клітинки. */
const VACUUM_UNDERFOOT = 0.45;
/** Пилосос, поставлений на іншу клітинку, — не ближче за це до її країв, клітинки. */
const VACUUM_MARGIN = 0.2;

/** Точка клітинки (`x`, `y`), найближча до `p`, — не ближче `VACUUM_MARGIN` до країв. */
function inTile(p: Vec, x: number, y: number): Vec {
  return {
    x: Math.min(Math.max(p.x, x + VACUUM_MARGIN), x + 1 - VACUUM_MARGIN),
    y: Math.min(Math.max(p.y, y + VACUUM_MARGIN), y + 1 - VACUUM_MARGIN),
  };
}

/** Точки в одній кімнаті: прохід між кімнатами (`roomAt` null) — спільний для обох (§8.7). */
const sameRoom = (a: Vec, b: Vec): boolean => {
  const ra = roomAt(a);
  const rb = roomAt(b);
  return ra === null || rb === null || ra === rb;
};

/**
 * Де стане поставлений пилосос (§8.7, [Уточнено]): у точці перед персонажем, якщо там можна (`vacuumFits`), інакше — у найближчій
 * до неї точці сусідньої клітинки, де можна, тієї самої кімнати, без стіни між нею й персонажем (як і прибирає він не крізь
 * стіну) і не під ногами (`VACUUM_UNDERFOOT`). Раніше запасна клітинка бралася лише за відстанню, і від стіни ванної пилосос
 * опинявся за нею в спальні (рецензія пилососа 2026-11-02). Такої клітинки немає зовсім — у клітинці персонажа, якомога ближче
 * до точки перед ним.
 */
function vacuumSpot(state: GameState, body: Vec, facing: Vec): Vec {
  const p = { x: body.x + facing.x * VACUUM_PUT, y: body.y + facing.y * VACUUM_PUT };
  const allowed = (x: number, y: number, at: Vec): boolean => vacuumFits(state, x, y) && sameRoom(body, at) && clearPath(body, at);
  const tx = Math.floor(p.x);
  const ty = Math.floor(p.y);
  if (allowed(tx, ty, p)) return p;
  for (let r = 1; r < 4; r++) {
    let best: Vec | null = null;
    let bestDistance = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const at = inTile(p, tx + dx, ty + dy);
        const distance = Math.hypot(at.x - p.x, at.y - p.y);
        if (distance >= bestDistance || Math.hypot(at.x - body.x, at.y - body.y) < VACUUM_UNDERFOOT || !allowed(tx + dx, ty + dy, at)) continue;
        best = at;
        bestDistance = distance;
      }
    }
    if (best) return best;
  }
  return inTile(p, Math.floor(body.x), Math.floor(body.y));
}

/** Поставити пилосос (§8.7): будь-де на підлогу, як іграшку, — на видну підлогу перед персонажем; поставлений лишається там. */
export function putVacuumDown(state: GameState): void {
  if (state.character.held?.kind !== "vacuum") return;
  const body = state.character.body;
  state.home.vacuumAt = vacuumSpot(state, body, body.facing);
  state.character.held = null;
  emit(state, { type: "vacuum", stage: "put" });
}

/**
 * Інструмент у руках за хвилини (§8.7): пилосос гуде — гучний звук щоразу через `VACUUM.noiseEvery` хвилин (§9.12); неприємне —
 * здоровий глузд `VACUUM.sanityPerMinute` за хвилину (§8.1); прибирає сухе сміття навколо персонажа (`TOOL_REACH`); біля дивана
 * витягає шкарпетку з котячої схованки (§9.12, «Схованки»).
 */
export function tickVacuum(state: GameState, minutes: number): void {
  const held = state.character.held;
  if (held?.kind !== "vacuum") return;
  const before = held.minutes ?? 0;
  held.minutes = before + minutes;
  const tool = cleaningTool(state);
  if (tool === "vacuum" && Math.floor(held.minutes / VACUUM.noiseEvery) > Math.floor(before / VACUUM.noiseEvery)) loudNoise(state, "vacuum", null);
  unpleasantTask(state, VACUUM.sanityPerMinute * minutes);
  const body = state.character.body;
  const swept: Swept = { tufts: [], dust: [], messes: [] };
  const reach = TOOL_REACH[tool];
  sweep(state, body, reach, true, swept);
  reportSwept(state, "person", swept);
  const stash = STASHES.sofa.at;
  if (state.home.sock === true && Math.hypot(stash.x - body.x, stash.y - body.y) <= reach.floor) {
    delete state.home.sock;
    emit(state, { type: "sock-found", where: "vacuum" });
  }
}

/** Фонтанчик доливає поїлки (§8.7): простий — із бака, поки в ньому є вода, дорогий — без міри. */
function topUpWater(state: GameState): void {
  const { home } = state;
  const fountain = home.appliances.fountain;
  if (!fountain) return;
  for (const item of home.items) {
    if (item.kind !== "water") continue;
    const gap = waterCapacity(item) - item.water;
    const poured = fountain === "premium" ? gap : Math.min(gap, home.fountainTank ?? 0);
    if (poured <= 0) continue;
    item.water += poured;
    if (fountain === "cheap") home.fountainTank = (home.fountainTank ?? 0) - poured;
  }
}

/** Наповнити бак простого фонтанчика (§8.7). false — бака немає чи він і так повний. */
export function fillFountainTank(state: GameState): boolean {
  const { home } = state;
  if (home.appliances.fountain !== "cheap" || (home.fountainTank ?? 0) >= FOUNTAIN.tank) return false;
  home.fountainTank = FOUNTAIN.tank;
  return true;
}

/** Хвилини побуту вдень і вночі: шерсть і жмути, пил, прання, техніка за розкладом. */
export function tickHousehold(state: GameState, from: number, minutes: number): void {
  const home = state.home;
  const hours = minutes / 60;
  for (const cat of state.cats) if (cat.away === null) home.fur = Math.min(FUR_MAX, home.fur + furPerHour(state, cat) * hours);
  shedTuft(state);
  tickDust(state, minutes);
  // Без світла прання, запущене до відключення, стоїть на паузі й допереться, щойно світло буде (§4.1; рішення виконавця
  // 2026-11-02: не губить засіб і не дає випраного без струму; буває лише з панелі розробки — запустити
  // прання в день відключення не можна, а вчорашнє допирається вночі).
  if (home.washer.state === "washing" && !powerOut(state)) {
    const before = home.washer.minutes;
    home.washer.minutes -= minutes;
    // Віджим — останні хвилини прання: машина гуркоче на всю ванну (§9.12).
    if (before > NOISE.spinMinutes && home.washer.minutes <= NOISE.spinMinutes) {
      emit(state, { type: "laundry", stage: "spin" });
      const washer = objectById("washer");
      loudNoise(state, "spin", { x: washer.x + 0.5, y: washer.y + 0.5 });
    }
    if (home.washer.minutes <= 0) {
      home.washer.state = "done";
      emit(state, { type: "laundry", stage: "done" });
    }
  }
  const crossed = (minute: number): boolean => from % 1440 < minute && (from + minutes) % 1440 >= minute && minutes < 1440;
  settleFeeders(state);
  const fed = feed(state);
  if (fed.length > 0) emit(state, { type: "feeder", bowls: fed });
  topUpWater(state);
  // Без світла робот-пилосос не виїжджає з бази (§4.1): ні прибирання, ні шуму, ні котів на ньому.
  const robot = home.appliances.robot;
  if (robot && minutes < 1440 && !powerOut(state)) for (const start of ROBOT[robot].starts) robotClean(state, robot, start, from, minutes, crossed);
}

/**
 * Виїзд робота-пилососа від хвилини `start` (§8.7), його частина за цей крок часу. Кожен кіт чує робота раз за прибирання — коли
 * той проїжджає повз (§9.12).
 */
function robotClean(state: GameState, quality: Quality, start: number, from: number, minutes: number, crossed: (minute: number) => boolean): void {
  const end = start + HOUSEHOLD.robotMinutes;
  if (crossed(start)) state.home.robotHeard = [];
  const a = from % 1440;
  const lo = Math.max(a, start);
  const hi = Math.min(a + minutes, end);
  if (hi <= lo) return;
  robotSweep(state, quality, (lo - start) / HOUSEHOLD.robotMinutes, (hi - start) / HOUSEHOLD.robotMinutes);
  if (hi >= end) {
    delete state.home.robotHeard;
    emit(state, { type: "robot" });
    return;
  }
  const heard = (state.home.robotHeard ??= []);
  const at = along(ROBOT_ROUTE, (hi - start) / HOUSEHOLD.robotMinutes);
  const fresh = (cat: Cat): boolean => !heard.includes(cat.id);
  heard.push(...(ROBOT[quality].loud ? loudNoise(state, "robot", at, fresh) : quietRobot(state, at, fresh)));
}

/**
 * Крок, яким робот-пилосос «проходить» свій шлях за крок часу, клітинки: щоб не проскочити жмут чи пил між точками. Дрібний, бо
 * дорогий дістає кути лише з самого повороту маршруту, а крок часу цю точку зазвичай минає.
 */
const ROBOT_SWEEP_STEP = 0.05;

/** Робот-пилосос проїхав маршрутом від частки `from` до `to` (0–1): прибрати, повз що він проїхав (§8.7). Павутини не дістає. */
function robotSweep(state: GameState, quality: Quality, from: number, to: number): void {
  const { reach, messes } = ROBOT[quality];
  const steps = Math.max(1, Math.ceil(((to - from) * ROUTE_LENGTH) / ROBOT_SWEEP_STEP));
  const swept: Swept = { tufts: [], dust: [], messes: [] };
  for (let k = 0; k <= steps; k++) sweep(state, along(ROBOT_ROUTE, from + ((to - from) * k) / steps), { floor: reach, web: 0 }, messes, swept);
  reportSwept(state, "robot", swept);
}

/**
 * Скільки проїхав робот-пилосос: 0–1 під час прибирання, null — стоїть на базі чи його немає (§8.7). Без світла він стоїть на базі
 * весь день (§4.1): з null вигляд показує його на базі, а кіт, що на ньому катався, злазить.
 */
export function robotProgress(state: GameState): number | null {
  const quality = state.home.appliances.robot;
  if (!quality || powerOut(state)) return null;
  const minute = state.minute % 1440;
  const start = ROBOT[quality].starts.find((s) => minute >= s && minute < s + HOUSEHOLD.robotMinutes);
  return start === undefined ? null : (minute - start) / HOUSEHOLD.robotMinutes;
}

/**
 * База робота-пилососа у вітальні й маршрут прибирання всією квартирою (§8.7): кухня, ванна, спальня — крізь дверні прорізи,
 * потім уся вітальня й назад на базу. У симуляції — бо на роботі катається кіт (§9.12). Точки підібрано під досяжність `ROBOT`:
 * кути й смужки біля стін лежать далі за дешевого й ближче за дорогого, а до кожної клітинки видної підлоги дорогий дістає, тож
 * зсув на десяту клітинки може це зламати (`tests/robot.test.ts`). Посеред ряду 8 вітальні й стовпця 15 кухні — бо там рідше стоять
 * речі, а ряду 9 заважають ящики біля входу.
 */
const ROBOT_ROUTE: readonly Vec[] = [
  ROBOT_DOCK,
  { x: 17.7, y: 7.4 },
  { x: 16, y: 7.05 },
  // Кухня.
  { x: 16, y: 4.4 },
  { x: 15.4, y: 4.4 },
  { x: 15.4, y: 2.55 },
  { x: 17.8, y: 2.55 },
  { x: 14.2, y: 2.45 },
  { x: 15.4, y: 2.55 },
  { x: 15.4, y: 4.4 },
  { x: 16, y: 4.4 },
  { x: 16, y: 7.05 },
  // Ванна.
  { x: 11, y: 7.05 },
  { x: 10.9, y: 4.4 },
  { x: 9, y: 4.3 },
  { x: 10.7, y: 3.6 },
  { x: 10.7, y: 2.5 },
  { x: 9, y: 2.4 },
  { x: 10.7, y: 2.5 },
  { x: 10.7, y: 3.6 },
  { x: 10.9, y: 4.4 },
  { x: 11, y: 7.05 },
  // Спальня.
  { x: 4, y: 7.05 },
  { x: 4, y: 3.4 },
  { x: 2.05, y: 3.4 },
  { x: 2.4, y: 2.05 },
  { x: 3.6, y: 2.05 },
  { x: 5.6, y: 2.4 },
  { x: 5.6, y: 3.4 },
  { x: 4, y: 3.4 },
  { x: 4, y: 7.05 },
  // Вітальня: ліва стіна й довкола підвіконня, потім ряд 8 до дверей, ряд 10 під плінтусом назад до лівої стіни (тут стоять речі,
  // §8.7) і ряд 9 знову до дверей — повз ящики біля входу (12, 9) не їде; далі ряд 8 до бази й ряд 10 праворуч від дивана.
  { x: 2.6, y: 7.05 },
  { x: 2.1, y: 6.9 },
  { x: 2.4, y: 7.4 },
  { x: 2.3, y: 9.2 },
  { x: 3.6, y: 8.8 },
  { x: 11.6, y: 8.8 },
  { x: 11.6, y: 10.3 },
  { x: 1.8, y: 10.3 },
  { x: 2.1, y: 9.45 },
  { x: 11.6, y: 9.45 },
  { x: 11.6, y: 8.8 },
  { x: 17, y: 8.8 },
  { x: 16.4, y: 10.3 },
  { x: 18.3, y: 10.3 },
  { x: 17.8, y: 9.1 },
  ROBOT_DOCK,
];

/** Довжини відрізків маршруту робота-пилососа й увесь маршрут, клітинки. */
const ROUTE_LENGTHS: readonly number[] = ROBOT_ROUTE.slice(1).map((p, i) => Math.hypot(p.x - (ROBOT_ROUTE[i]?.x ?? 0), p.y - (ROBOT_ROUTE[i]?.y ?? 0)));
const ROUTE_LENGTH = ROUTE_LENGTHS.reduce((a, b) => a + b, 0);

/** Точка на маршруті за часткою пройденого шляху 0–1. */
function along(route: readonly Vec[], progress: number): Vec {
  const lengths = route === ROBOT_ROUTE ? ROUTE_LENGTHS : route.slice(1).map((p, i) => Math.hypot(p.x - (route[i]?.x ?? 0), p.y - (route[i]?.y ?? 0)));
  let left = progress * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i] ?? 0;
    const a = route[i] ?? ROBOT_DOCK;
    const b = route[i + 1] ?? ROBOT_DOCK;
    if (left <= length) return { x: a.x + ((b.x - a.x) * left) / length, y: a.y + ((b.y - a.y) * left) / length };
    left -= length;
  }
  return route[route.length - 1] ?? ROBOT_DOCK;
}

/** Де робот-пилосос: у дорозі — на маршруті, інакше — на базі (§8.7). */
export function robotAt(state: GameState): Vec {
  const progress = robotProgress(state);
  return progress === null ? ROBOT_DOCK : along(ROBOT_ROUTE, progress);
}

/**
 * Спорожнити автогодівницю (§9.12): корм із неї й з миски під нею летить назад у сховище, а що не влазить — у ящики біля входу.
 * Повертає, які запаси повернулися.
 */
export function emptyFeeder(state: GameState, bowl: BowlItem, feeder: Feeder): Product[] {
  // Повертати нічого, лише надкльована половинка в мисці — миску не чіпають (перевірка побуту 2026-10-28: половинка зникала, а
  // персонаж бачив відмову, ніби нічого не сталося).
  if (feeder.food <= 0 && bowl.food - (bowl.half === true ? 1 : 0) <= 0) return [];
  // Надкльовану половинку порції (§9.12, «Апетит») назад у сховище не кладуть — її викидають.
  const nibbled = bowl.half === true ? 1 : 0;
  delete bowl.half;
  // Годівниця й миска — один запас: два польоти дали б два бабли з кількістю над сховищем.
  const back = new Map<Product, Record<Quality, number>>();
  for (const holder of [feeder, bowl]) {
    const food = holder.food - (holder === bowl ? nibbled : 0);
    if (food > 0 && holder.foodQuality !== null) {
      const product = holder.sterile ? "sterileFood" : "catFood";
      const amounts = back.get(product) ?? { cheap: 0, premium: 0 };
      amounts[holder.foodQuality] += food;
      back.set(product, amounts);
    }
    holder.food = 0;
    holder.foodQuality = null;
    holder.sterile = false;
  }
  const flown: Product[] = [];
  for (const [product, amounts] of back) if (flySupply(state, product, amounts, flown.length) > 0) flown.push(product);
  if (back.size > 0) emit(state, { type: "feeder-emptied", item: bowl.id, products: flown });
  return [...back.keys()];
}

/** Викинути автогодівницю (§8.7): корм із бункера — назад у сховище, як «спорожнити»; миска під нею лишається. */
export function discardFeeder(state: GameState, slot: string): boolean {
  const feeders = state.home.feeders ?? [];
  const feeder = feeders.find((f) => f.slot === slot);
  if (!feeder) return false;
  if (feeder.food > 0 && feeder.foodQuality !== null) addSupply(state, feeder.sterile ? "sterileFood" : "catFood", feeder.foodQuality, feeder.food);
  state.home.feeders = feeders.filter((f) => f !== feeder);
  return true;
}

/** Корм у мисці й у годівниці однаковий: корми не змішують (§6.4, §9.12). */
export function sameFood(a: { food: number; foodQuality: Quality | null; sterile: boolean }, quality: Quality, sterile: boolean): boolean {
  return a.food === 0 || (a.foodQuality === quality && a.sterile === sterile);
}

/**
 * Автогодівниці (§9.12, правка автора 2026-10-23) не за годинами, а завжди тримають миску під собою
 * повною, доки в бункері є корм; мисці з іншим кормом не досипають. Повертає миски, куди насипали.
 */
function feed(state: GameState): number[] {
  const filled: number[] = [];
  for (const feeder of state.home.feeders ?? []) {
    if (feeder.food <= 0 || feeder.foodQuality === null) continue;
    const bowl = state.home.items.find((i): i is BowlItem => i.kind === "bowl" && i.slot === feeder.slot);
    if (!bowl || bowl.food >= BOWL_CAPACITY || !sameFood(bowl, feeder.foodQuality, feeder.sterile)) continue;
    const poured = Math.min(feeder.food, BOWL_CAPACITY - bowl.food);
    feeder.food -= poured;
    bowl.food += poured;
    bowl.foodQuality = feeder.foodQuality;
    bowl.sterile = feeder.sterile;
    filled.push(bowl.id);
  }
  return filled;
}

/** Як насипати миску не персонажу (`stockBowl`). */
export interface StockOptions {
  /**
   * Корм для стерилізованих — коли в домі живе стерилізований кіт, хоч би де він зараз був (у поїздці, на сходах), а не лише
   * коли він у квартирі. Так насипає прибиральниця (§4.1, рецензія пакета 2026-11-03): вона приходить і тоді, коли кота повезли
   * до ветеринара, а коли двері їй відчиняє персонаж, кіт міг саме вибігти на сходи.
   */
  includeAway?: boolean;
}

/**
 * Яким кормом насипати порожню миску не персонажу (автогодівниця, друг, прибиральниця, §4.1, §8.7): коли вдома є
 * стерилізований кіт — кормом для стерилізованих, поки він є, бо звичайний йому шкодить (§9.8); з `includeAway` — і коли він
 * не вдома.
 */
function bowlFoodKind(state: GameState, options: StockOptions = {}): { quality: Quality; sterile: boolean } | null {
  if (state.cats.some((c) => c.sterilized && (options.includeAway === true || c.away === null))) {
    const quality = topQuality(state, "sterileFood");
    if (quality !== null) return { quality, sterile: true };
  }
  const quality = topQuality(state, "catFood");
  if (quality !== null) return { quality, sterile: false };
  // Звичайного корму немає — корм для стерилізованих: він нікому не шкодить (загальна ревізія 2026-10-29: друг лишав миски
  // порожніми, коли вдома був лише він, а стерилізованого кота вдома не було).
  const sterile = topQuality(state, "sterileFood");
  return sterile === null ? null : { quality: sterile, sterile: true };
}

/**
 * Досипати миску зі сховища до `upTo` порцій (§6.4): тим самим кормом, що вже в ній, — корми не
 * змішують; порожню — за bowlFoodKind. Повертає, скільки насипано.
 */
export function stockBowl(state: GameState, bowl: BowlItem, upTo = BOWL_CAPACITY, options: StockOptions = {}): number {
  const kind = bowl.food > 0 && bowl.foodQuality !== null ? { quality: bowl.foodQuality, sterile: bowl.sterile } : bowlFoodKind(state, options);
  if (kind === null || bowl.food >= upTo) return 0;
  const poured = takeSupplies(state, kind.sterile ? "sterileFood" : "catFood", kind.quality, upTo - bowl.food);
  if (poured === 0) return 0;
  bowl.food += poured;
  bowl.foodQuality = kind.quality;
  bowl.sterile = kind.sterile;
  return poured;
}

/**
 * Ранок (§8.7): мінус день чистого одягу; дешева техніка може зламатися. Жмутів шерсті вранці стільки, скільки за шкалою: уночі
 * вони з'являються по одному (`shedTuft`), а якщо за коротку ніч не всі встигли — решта лягає зараз, поки гравець не бачить.
 */
export function nightlyHousehold(state: GameState, rng: Rng): void {
  const home = state.home;
  topUpTufts(state);
  home.clothes = Math.max(0, home.clothes - 1);
  // Скинуті дрібнички вранці знову на столах, а розбитий кухоль — уже новий (§9.12, «Скидання речей»).
  delete home.trinkets;
  // Розмотаний рулон туалетного паперу вранці замінено новим (§9.12, «Мисливський інстинкт»).
  delete home.rollDown;
  const factor = HOUSEHOLD.difficulty[state.difficulty];
  for (const appliance of ["fountain", "robot"] as const) {
    if (home.appliances[appliance] === "cheap" && rng.chance(HOUSEHOLD.applianceBreakPerDay * factor)) {
      home.appliances[appliance] = null;
      emit(state, { type: "broke", what: appliance });
    }
  }
  // Дешева автогодівниця ламається разом із кормом у бункері й лишає уламки над миской (§9.12).
  for (const feeder of [...(home.feeders ?? [])]) {
    if (feeder.quality !== "cheap" || !rng.chance(HOUSEHOLD.applianceBreakPerDay * factor)) continue;
    home.feeders = (home.feeders ?? []).filter((f) => f !== feeder);
    addMess(state, "broken", slotCenter(feeder.slot), null);
    emit(state, { type: "broke", what: "feeder" });
  }
}

/** Кіт скористався дешевою річчю: вона може зламатися (§6.4). */
export function wearOut(state: GameState, item: HomeItem, rng: Rng): void {
  if (item.quality !== "cheap" || item.kind === "toy") return;
  if (!rng.chance(HOUSEHOLD.breakPerUse * HOUSEHOLD.difficulty[state.difficulty])) return;
  state.home.items = state.home.items.filter((i) => i !== item);
  // Зламана річ лишає уламки на своєму місці: видно, куди вона поділася (§11.3а). Тріск — гучний звук (§9.12).
  addMess(state, "broken", itemPoint(item), null);
  emit(state, { type: "broke", what: item.kind });
  loudNoise(state, "broken", itemPoint(item));
}
