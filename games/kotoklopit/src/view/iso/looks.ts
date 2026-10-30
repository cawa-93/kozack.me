// Який кадр маніфесту показує кожна річ ізометричної квартири й підлоги (крок 16, F3b): стан гри → id запису й стан кадру.
// Те саме джерело стану, що в старого вигляду (`legacy/apartmentview.ts`, `legacy/storagelook.ts`, `legacy/catcorner.ts`),
// лише кадрами атласу замість малюнків кодом. Чисті функції без Phaser: їх перевіряє `tests/isoworld.test.ts` (кожен стан —
// кадр, що є в маніфесті).

import { bowlEaten, isDirty, trashTipped } from "../../sim/catai";
import { BOWL_CAPACITY, FEEDER_CAPACITY, WATER_CAPACITY } from "../../sim/config";
import { objectAt } from "../../sim/home";
import { robotProgress } from "../../sim/household";
import { boxesShown, STORAGES, storageStages, type FillStage } from "../../sim/storage";
import type { BowlItem, Dish, Feeder, GameState, HomeItem, LitterItem, MessKind, Quality, TrinketKind, WaterItem } from "../../sim/types";
import { isWorking } from "../../sim/work";
import type { ArtId } from "../art/types";

/** Кадр: id запису маніфесту й стан (null — запис без станів). */
export interface IsoFrame {
  readonly id: ArtId;
  readonly state: string | null;
}

const frame = (id: ArtId, state: string | null = null): IsoFrame => ({ id, state });

/** Стан наповнення `full-0`…`full-4` (`FillStage`, §6.4) — так звуться стани сховищ у маніфесті. */
export function fullState(stage: FillStage): string {
  return `full-${stage}`;
}

/** Наповнення сховища `object` (§6.4): стан кожного запасу в порядку `STORAGES`, null — запасу ще не бувало вдома. */
export function stagesOf(state: GameState, object: string): (FillStage | null)[] {
  const storage = STORAGES.find((s) => s.object === object);
  return storage ? storageStages(state, storage) : [];
}

// --- Речі квартири --------------------------------------------------------------------------

/**
 * Холодильник (§6.4, як `storagelook.ts`): порожній — прочинений і темний; накладка продуктів — стан запасу; поки є мамині
 * судочки (рішення автора 2026-10-26), на ньому судочок, а порожнім він не буває. Продуктів ще не бувало — без накладки.
 */
export function fridgeLook(state: GameState): { body: IsoFrame; food: IsoFrame | null; mom: boolean } {
  const [food = null, mom = null] = stagesOf(state, "fridge");
  const meals = mom !== null && mom > 0;
  const stage: FillStage | null = meals && !food ? 1 : food;
  return {
    body: frame("env/fridge", stage === 0 ? "open" : "closed"),
    food: stage === null ? null : frame("env/fridge/food", fullState(stage)),
    mom: meals,
  };
}

/** Шафка з кормом (§6.4, §9.12 «Кмітливість у бешкеті»): відчинена котом, наповнення, замок і де він висить. */
export function cabinetLook(state: GameState): { body: IsoFrame; food: IsoFrame | null; lock: IsoFrame | null; lockPoint: "lock" | "lock-open" } {
  const [food = null] = stagesOf(state, "cat-cabinet");
  const open = state.home.cabinetOpen === true;
  const lock = state.home.lock;
  return {
    body: frame("env/cat-cabinet", open ? "open" : "closed"),
    food: food === null ? null : frame("env/cat-cabinet/cat-food", fullState(food)),
    lock: lock === undefined ? null : frame(`item/lock/${lock}`),
    lockPoint: open ? "lock-open" : "lock",
  };
}

/**
 * Плита (§8.7, `env/stove`): що на сковороді. Сире щойно поклали — `raw`, далі вариться (`cooking`), готове й мамин
 * судочок, що гріється, — `ready`, пригоріле — `burnt`.
 */
export function stoveState(state: GameState): string {
  const { item, minutes } = state.home.stove;
  if (!item) return "off";
  if (item.kind === "raw") return minutes < 1 ? "raw" : "cooking";
  return item.kind === "meal" ? "ready" : "burnt";
}

/** Страва на столі чи стільниці (§8.7): `item/dish/*` з якістю продуктів, мамин судочок — свій. */
export function dishFrame(dish: Dish): IsoFrame {
  if (dish.kind === "meal" && dish.mom === true) return frame("item/dish/mom");
  return frame(`item/dish/${dish.kind}`, dish.quality);
}

/** Душова кабіна (§8.7): тече вода, поки персонаж усередині чи купає кота; мокрий піддон, поки на ньому сидить кіт. */
export function showerState(state: GameState): string {
  const activity = state.character.activity;
  if (activity?.kind === "use" && activity.target === "shower") return "running";
  return state.cats.some((cat) => cat.away === null && objectAt(state, Math.floor(cat.x), Math.floor(cat.y))?.id === "shower") ? "wet" : "dry";
}

/** Умивальник (§9.12, «Пиття»): кран тече, поки кіт п'є з нього. */
export function sinkState(state: GameState): string {
  return state.cats.some((cat) => cat.away === null && cat.act.kind === "drink" && cat.act.target === "sink" && cat.act.goal === null) ? "running" : "off";
}

/** Монітор (§8.6): світиться, поки персонаж працює чи шукає роботу. */
export function computerState(state: GameState): string {
  return isWorking(state) ? "on" : "off";
}

/** Ліжко (§9.12, «Теплолюбність»): горбик ковдри, поки під нею спить кіт. */
export function bedState(state: GameState): string {
  return state.cats.some((cat) => cat.away === null && cat.act.kind === "sleep" && cat.act.blanket === true) ? "hump" : "made";
}

/** Шафа з пилососом (§8.7): відчинена й порожня, поки персонаж прибирає пилососом. */
export function vacuumState(state: GameState): string {
  const activity = state.character.activity;
  return activity?.kind === "use" && activity.target === "vacuum" ? "open" : "closed";
}

/** Смітник (§9.12): лежить на боці, поки сміття не прибрали. */
export function trashState(state: GameState): string {
  return trashTipped(state) ? "tipped" : "standing";
}

/** Купа ящиків біля входу (§6.4): 1–4 коробки за вмістом; 0 — ящиків немає (null). */
export function boxesState(state: GameState): string | null {
  const count = boxesShown(state);
  return count > 0 ? `pile-${count}` : null;
}

/** Накладки аптечки: ласощі, нашийник і м'ята — у порядку їхніх запасів у `STORAGES` (після таблеток і крапель). */
export const KIT_EXTRAS: readonly ArtId[] = ["env/cat-kit/treats", "env/cat-kit/collar", "env/cat-kit/catnip"];

/**
 * Котяча аптечка (§6.4, як `storagelook.ts`): стан — середнє наповнення її запасів; накладки `KIT_EXTRAS` — поки ці запаси
 * є (null — накладки немає); порожня аптечка відкрита й без них.
 */
export function kitLook(state: GameState): { body: IsoFrame; extras: (IsoFrame | null)[] } {
  const stages = stagesOf(state, "cat-kit");
  const known = stages.filter((s): s is FillStage => s !== null);
  const level = known.length > 0 ? known.reduce((sum: number, s) => sum + LEVEL[s], 0) / known.length : 0;
  const stage: FillStage = level <= 0 ? 0 : level >= 1 ? 4 : level < 0.45 ? 1 : level < 0.75 ? 2 : 3;
  const extras = KIT_EXTRAS.map((id, i) => (stage > 0 && (stages[2 + i] ?? 0) > 0 ? frame(id) : null));
  return { body: frame("env/cat-kit", fullState(stage)), extras };
}

/** Частка для рівня рідини чи корму, як у `storagelook.ts`. */
const LEVEL: Record<FillStage, number> = { 0: 0, 1: 0.3, 2: 0.6, 3: 0.9, 4: 1 };

/**
 * Сховища-фігури (мішок наповнювача, бак стерильного корму): їхня форма — наповнення, тож стан `full-N` — у самій речі;
 * запасу ще не бувало — як порожнє (річ однаково невидима, поки її немає вдома).
 */
export function shapedState(state: GameState, object: "litter-bag" | "sterile-bin"): string {
  return fullState(stagesOf(state, object)[0] ?? 0);
}

/** Сховища-меблі з накладками наповнення, накладки — у порядку їхніх запасів у `STORAGES`. */
export const STORAGE_OVERLAYS = {
  // Засоби гігієни й шампунь для котів — дві пляшечки на полиці душу.
  shower: ["env/shower/hygiene", "env/shower/shampoo"],
  sink: ["env/sink/human-meds"],
  washer: ["env/washer/detergent"],
} as const satisfies Record<string, readonly ArtId[]>;

/**
 * Накладки наповнення сховищ-меблів (§6.4) у порядку `STORAGE_OVERLAYS`: стан кожного запасу; запасу ще не бувало — null
 * (накладки немає).
 */
export function storageOverlays(state: GameState, object: keyof typeof STORAGE_OVERLAYS): (IsoFrame | null)[] {
  const stages = stagesOf(state, object);
  return STORAGE_OVERLAYS[object].map((id, i) => {
    const stage = stages[i] ?? null;
    return stage === null ? null : frame(id, fullState(stage));
  });
}

/** Дрібничка на столі (§9.12, «Скидання речей»): `standing` — на своєму місці, `fallen` — на підлозі. */
export function trinketFrame(kind: TrinketKind, fallen: boolean): IsoFrame {
  return frame(`mess/trinket/${kind}`, fallen ? "fallen" : "standing");
}

// --- Речі на підлозі --------------------------------------------------------------------------

/**
 * Миска (§9.12): корм меншає поступово — `eaten` з'їв кіт, що їсть зараз; надкльована половинка — менша купка. Стан —
 * `empty` чи `<корм>-<1|2>`: до порції — 1, понад порцію — 2 (`BOWL_CAPACITY`); для стерилізованих — свій.
 */
export function bowlFrame(item: BowlItem, eaten = 0): IsoFrame {
  const food = item.food - (item.half === true ? 0.5 : 0) - eaten;
  if (food <= 0.02) return frame(`item/bowl/${item.quality}`, "empty");
  const kind = item.sterile ? "sterile" : (item.foodQuality ?? "cheap");
  const level = food > BOWL_CAPACITY / 2 ? 2 : 1;
  return frame(`item/bowl/${item.quality}`, `${kind}-${level}`);
}

/** Миска з водою (§9.12): порожня, мало, половина, повна (`WATER_CAPACITY` ковтків). */
export function waterFrame(item: WaterItem): IsoFrame {
  const share = item.water / WATER_CAPACITY;
  const level = share <= 0 ? "empty" : share <= 1 / 3 ? "low" : share <= 2 / 3 ? "half" : "full";
  return frame(`item/water/${item.quality}`, level);
}

/** Лоток (§9.12): без наповнювача; чистий; з грудками (ним користувалися); брудний (`isDirty` — ще й запах). */
export function litterFrame(item: LitterItem): IsoFrame {
  if (item.litter === null) return frame(`item/litter/${item.quality}`, "empty");
  const use = isDirty(item) ? "-dirty" : item.uses > 0 ? "-used" : "";
  return frame(`item/litter/${item.quality}`, `${item.litter}${use}`);
}

/** Кадр речі котячого кутка; іграшка — на підлозі чи загнана під диван або холодильник (видно лише пір'їнку). */
export function itemFrame(state: GameState, item: HomeItem): IsoFrame {
  switch (item.kind) {
    case "bowl":
      return bowlFrame(item, bowlEaten(state, item) ?? 0);
    case "water":
      return waterFrame(item);
    case "litter":
      return litterFrame(item);
    case "toy":
      return frame(`item/toy/${item.quality}`, item.hidden !== undefined ? "hidden" : "floor");
    case "house":
      return frame(`item/house/${item.quality}`);
    case "scratcher":
      return frame(`item/scratcher/${item.quality}`);
  }
}

/** Автогодівниця (§9.12): що у віконці бункера — вид корму й мало/повно (до половини — `low`); порожня — `empty`. */
export function feederFrame(feeder: Feeder): IsoFrame {
  if (feeder.food <= 0) return frame(`item/feeder/${feeder.quality}`, "empty");
  const kind = feeder.sterile ? "sterile" : (feeder.foodQuality ?? "cheap");
  const level = feeder.food / FEEDER_CAPACITY[feeder.quality] > 0.5 ? "full" : "low";
  return frame(`item/feeder/${feeder.quality}`, `${kind}-${level}`);
}

/** Робот-пилосос (§8.7): на доку заряджається, у дорозі — прибирає. */
export function robotFrame(state: GameState, quality: Quality): IsoFrame {
  return frame(`item/robot/${quality}`, robotProgress(state) === null ? "charging" : "cleaning");
}

/**
 * Кошик білизни (§8.7): скільки днів одягу вже брудні — від порожнього (5 і більше чистих днів) до гірки; чистого не
 * лишилося — переповнений.
 */
export function basketState(clothes: number): string {
  if (clothes <= 0) return "overflow";
  // Як у старому вигляді: почата купка брудного — уже ще одна річ у кошику.
  return `load-${Math.ceil(Math.max(0, Math.min(5, 5 - clothes)) - 1e-9)}`;
}

/** Кіт спить у переносці (§9.12, «Сам лізе в переноску»): поверх нього — дверцята з ґратками. */
export function carrierOccupied(state: GameState): boolean {
  return state.cats.some((cat) => cat.away === null && cat.act.kind === "sleep" && cat.act.target === "carrier");
}

/** Безлад (§9.12): `mess/<вид>`. */
export function messFrame(kind: MessKind): IsoFrame {
  return frame(`mess/${kind}`);
}
