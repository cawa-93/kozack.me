// Який кадр маніфесту показує кожна річ ізометричної квартири й підлоги (крок 16, F3b): стан гри → id запису й стан кадру.
// Те саме джерело стану, що в старого вигляду (малюнків кодом до кроку 16), лише кадрами атласу. Чисті функції без Phaser:
// їх перевіряє `tests/isoworld.test.ts` (кожен стан — кадр, що є в маніфесті).

import { cageStage, cagedCats, carrierOf } from "../../sim/carriers";
import { bowlEaten, isDirty, trashTipped } from "../../sim/catai";
import { BOWL_CAPACITY, FEEDER_CAPACITY } from "../../sim/config";
import { DUST_SPOTS } from "../../sim/dust";
import type { GameEvent } from "../../sim/events";
import { objectAt, type RoomId } from "../../sim/home";
import { robotProgress } from "../../sim/household";
import { powerOut } from "../../sim/modifiers";
import { fountainWorks, waterCapacity } from "../../sim/resources";
import { boxesShown, STORAGES, storageStages, type FillStage } from "../../sim/storage";
import { CAT_TRACES, hasTrace } from "../../sim/traces";
import type { BowlItem, CatTrace, Dish, Feeder, GameState, HomeItem, LitterItem, Mess, PlacedItem, Quality, TrinketKind, Vec, WaterItem } from "../../sim/types";
import { isWorking } from "../../sim/work";
import { cobwebState, type CobwebState } from "../art/manifest/a20-dust";
import { wallKind } from "../art/manifest/lib/geometry";
import type { ArtId } from "../art/types";
import type { Point } from "../world/part";

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
 * Холодильник (§6.4, як `storagelook.ts`): порожній — прочинений і темний; накладка продуктів — стан запасу (нагорі стільки
 * продуктів, скільки запасу: банка, хлібина, пакет молока); поки є мамині судочки (рішення автора 2026-10-26), на ньому
 * судочок, а порожнім він не буває: без продуктів — зачинений, з самим судочком нагорі (банка «мало» сказала б, що продукти
 * є). Продуктів ще не бувало — без накладки.
 */
export function fridgeLook(state: GameState): { body: IsoFrame; food: IsoFrame | null; mom: boolean } {
  const [food = null, mom = null] = stagesOf(state, "fridge");
  const meals = mom !== null && mom > 0;
  const stage: FillStage | null = meals && !food ? null : food;
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

/**
 * Кадр плити (`env/stove`): що на сковороді (`stoveState`), а в день відключення світла (§4.1, рішення автора 2026-11-02) —
 * те саме на туристичному газовому пальнику (`gas-<стан>`: сковорода піднята, полум'я синє, вогник панелі погас). Пару й
 * дим (`stoveFx`) рахує базовий `stoveState`, тож від пальника вони не залежать; звідки вони йдуть — `stovePuffPoint`.
 */
export function stoveArtState(state: GameState): string {
  const look = stoveState(state);
  return powerOut(state) ? `gas-${look}` : look;
}

/**
 * Кадр пральної машини (§8.7): її стан, а прання, що стало на паузу без світла (§4.1, рішення автора 2026-11-02; запущене до
 * відключення — `household.ts`), — як машина, що стоїть: барабан не крутиться, вогник погас.
 */
/** Кадрів хвиль на екрані радіо (`env/radio/waves`, §8.10) і скільки мс кожен: хвилі йдуть по колу. */
const RADIO_WAVE = { frames: 6, ms: 130 } as const;

/** Де екран відносно опорної точки радіо, одиниці арту. */
export const RADIO_WAVES_AT = { x: 2, y: -54 } as const;

/** Хвилі на екрані: лише поки радіо грає. */
export function radioWaves(on: boolean, time: number): IsoFrame | null {
  return on ? { id: "env/radio/waves", state: `wave-${Math.floor(time / RADIO_WAVE.ms) % RADIO_WAVE.frames}` } : null;
}

export function washerArtState(state: GameState): string {
  const washer = state.home.washer.state;
  return washer === "washing" && powerOut(state) ? "idle" : washer;
}

/** Страва на столі чи стільниці (§8.7): `item/dish/*` з якістю продуктів, мамин судочок — свій. */
export function dishFrame(dish: Dish): IsoFrame {
  if (dish.kind === "meal" && dish.mom === true) return frame("item/dish/mom");
  return frame(`item/dish/${dish.kind}`, dish.quality);
}

/**
 * Душова кабіна (§8.7): тече вода, поки персонаж усередині чи купає кота; мокрий піддон, поки на ньому сидить кіт. У день
 * відключення світла (§4.1, рішення автора 2026-11-02) бойлер не гріє — вода холодна: душ персонажа без пари й запітнілого
 * скла. Купання кота у відключення — без змін (§4.1): вода тече як завжди (`running`).
 */
export function showerState(state: GameState): string {
  const activity = state.character.activity;
  if (activity?.kind === "use" && activity.target === "shower") return powerOut(state) && activity.bath !== true ? "running-cold" : "running";
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

/**
 * Дріт комп'ютера (`env/wire`, §9.12 «Гризіння»): перегризений — `chewed`, доки не полагодять. У день відключення (§4.1
 * «Біля комп'ютера», рішення автора 2026-11-03: «кабель повинен вставлятись в неї, а не в розетку») під розеткою стоїть
 * зарядна станція (`decorLook.station` — та сама умова), і дріт іде в її гніздо: `station`, перегризений — `station-chewed`.
 */
export function wireState(state: GameState): string {
  const chewed = state.home.wireChewed === true;
  if (powerOut(state)) return chewed ? "station-chewed" : "station";
  return chewed ? "chewed" : "whole";
}

/** Ліжко (§9.12, «Теплолюбність»): горбик ковдри, поки під нею спить кіт. */
export function bedState(state: GameState): string {
  return state.cats.some((cat) => cat.away === null && cat.act.kind === "sleep" && cat.act.blanket === true) ? "hump" : "made";
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

/**
 * Скільки вхідні двері стоять прочинені після того, як їх відчинили, мс сцени: сим відчиняє їх миттю (`openDoor`), а вигляд
 * показує відчинені, щоб це було видно.
 */
export const DOOR_OPEN_MS = 1600;

/**
 * Подія, з якою відчиняють вхідні двері (§9.12, «Двері й гості»; `openDoor` у `sim/door.ts`): забрали пакунки, кіт вибіг на
 * сходи чи повернувся з них (упіймали або сам), вирушили в поїздку чи повернулися, зайшли мама, гості, ОСББ, ветеринарка чи
 * прибиральниця.
 */
export function opensDoor(event: GameEvent): boolean {
  switch (event.type) {
    case "received":
    case "escaped":
    case "cat-returned":
    case "trip-started":
    case "trip-ended":
      return true;
    case "modifier":
      // Прибиральниці (§4.1) двері відчиняє персонаж, коли він удома; без нього вона заходить своїми ключами — цього ніхто не бачить.
      return event.kind === "mom-food" || event.kind === "guests" || event.kind === "inspection" || event.kind === "home-vet" || event.kind === "cleaner";
    default:
      return false;
  }
}

/**
 * Вхідні двері (§8.4, §9.12): прочинені, поки кіт на сходах (видно, куди він подівся, — його ловлять біля дверей), і ще
 * `DOOR_OPEN_MS` після того, як їх відчинили (`sinceOpened` — мс від останньої такої події; від'ємне — подій не було).
 */
export function doorState(state: GameState, sinceOpened: number): "closed" | "open" {
  if (state.cats.some((cat) => cat.away === "stairs")) return "open";
  return sinceOpened >= 0 && sinceOpened < DOOR_OPEN_MS ? "open" : "closed";
}

// --- Котячі сліди -----------------------------------------------------------------------------

/**
 * На чому лежить накладка котячого сліду (§9.12, «Котячі сліди в квартирі»): плита підлоги кімнати, задня стіна кімнати,
 * сегмент внутрішньої стіни (`WALL_SEGMENTS`), річ квартири (`OBJECTS`), прочинене полотно вхідних дверей (`DOOR_BOXES.leaf`)
 * чи передні стінки верхньої коробки купи ящиків (`BOXES_FRONT`). Вигляд ставить накладку в ту саму точку, що й господаря,
 * тією самою глибиною трохи над ним і показує лише разом із ним.
 */
export type TraceHost =
  | { readonly kind: "floor"; readonly room: RoomId }
  | { readonly kind: "wall"; readonly room: RoomId }
  | { readonly kind: "segment"; readonly segment: ArtId }
  | { readonly kind: "object"; readonly object: string }
  | { readonly kind: "door-leaf" }
  | { readonly kind: "boxes-front" };

/** Накладка сліду: запис маніфесту `env/trace/…` і її господар. */
export interface TraceOverlay {
  readonly trace: CatTrace;
  readonly id: ArtId;
  readonly host: TraceHost;
}

/**
 * Накладки кожного сліду (запис на кожне значення `CatTrace` — тип не дасть забути новий). Слід, що лежить на кількох кадрах,
 * — кілька накладок: сліди на коробках — і на купі, і на передніх стінках верхньої коробки поверх кота в ній.
 */
const OVERLAYS: Record<CatTrace, readonly Omit<TraceOverlay, "trace">[]> = {
  sofa: [{ id: "env/trace/sofa", host: { kind: "object", object: "sofa" } }],
  doorframe: [{ id: "env/trace/doorframe", host: { kind: "segment", segment: "env/wall/inner/row5-x17" } }],
  rug: [{ id: "env/trace/rug", host: { kind: "floor", room: "living" } }],
  cabinet: [{ id: "env/trace/cabinet", host: { kind: "object", object: "cat-cabinet" } }],
  door: [{ id: "env/trace/door", host: { kind: "door-leaf" } }],
  wardrobe: [{ id: "env/trace/wardrobe", host: { kind: "object", object: "wardrobe" } }],
  "boxes-claws": [
    { id: "env/trace/boxes-claws", host: { kind: "object", object: "boxes" } },
    { id: "env/trace/boxes-claws/front", host: { kind: "boxes-front" } },
  ],
  "boxes-chewed": [
    { id: "env/trace/boxes-chewed", host: { kind: "object", object: "boxes" } },
    { id: "env/trace/boxes-chewed/front", host: { kind: "boxes-front" } },
  ],
  "bath-mat": [{ id: "env/trace/bath-mat", host: { kind: "floor", room: "bathroom" } }],
  "bedroom-rug": [{ id: "env/trace/bedroom-rug", host: { kind: "floor", room: "bedroom" } }],
  wallpaper: [{ id: "env/trace/wallpaper", host: { kind: "wall", room: "living" } }],
  lino: [{ id: "env/trace/lino", host: { kind: "floor", room: "kitchen" } }],
};

/** Усі накладки котячих слідів (§9.12) у порядку `CAT_TRACES`. */
export const TRACE_OVERLAYS: readonly TraceOverlay[] = CAT_TRACES.flatMap((trace) => OVERLAYS[trace].map((overlay) => ({ trace, ...overlay })));

/** Кадр-господар накладки: з нього маніфест бере полотно, pivot, роздільність і стани накладки. */
export function traceHostArt(host: TraceHost): ArtId {
  switch (host.kind) {
    case "floor":
    case "wall":
      return `env/room/${host.room}/${host.kind}`;
    case "segment":
      return host.segment;
    case "object":
      return `env/${host.object}`;
    case "door-leaf":
      return "env/door/leaf";
    case "boxes-front":
      return "env/boxes/front";
  }
}

/**
 * Стан господаря, який повторює накладка: шафка з кормом відчинена чи зачинена (`cabinetLook`), купа ящиків — скільки коробок
 * (`boxesState`); решта господарів станів не має (null). Купи немає — undefined: господаря не видно, накладки теж.
 */
function hostState(state: GameState, host: TraceHost): string | null | undefined {
  if (host.kind === "boxes-front" || (host.kind === "object" && host.object === "boxes")) return boxesState(state) ?? undefined;
  if (host.kind === "object" && host.object === "cat-cabinet") return cabinetLook(state).body.state;
  return null;
}

/**
 * Кадр накладки сліду (§9.12, «Котячі сліди в квартирі»): сліду ще немає (`traces`) чи не видно купи ящиків, на якій він
 * лежить, — null (накладки не видно); інакше — той самий стан, що в господаря. З'явився слід посеред дня — наступного ж
 * кадру накладка є, без анімації. Прочинене полотно дверей видно лише тоді, коли двері відчинені (`doorState`): накладку на
 * ньому вигляд показує разом із полотном.
 */
export function traceFrame(state: GameState, overlay: TraceOverlay): IsoFrame | null {
  if (!hasTrace(state, overlay.trace)) return null;
  const hosted = hostState(state, overlay.host);
  return hosted === undefined ? null : frame(overlay.id, hosted);
}

/** Накладки аптечки: ласощі, нашийник і м'ята — у порядку їхніх запасів у `STORAGES` (після таблеток і крапель). */
export const KIT_EXTRAS: readonly ArtId[] =["env/cat-kit/treats", "env/cat-kit/collar", "env/cat-kit/catnip"];

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

/** Сховища-фігури: їхня форма (і висота, на яку стає кіт, — `perchFull`) — наповнення. */
const SHAPED = ["litter-bag", "sterile-bin"] as const;

/**
 * Наповнення сховища-фігури `object` (мішок наповнювача, бак стерильного корму), від якого залежать його форма й висота;
 * запасу ще не бувало — як порожнє (річ однаково невидима, поки її немає вдома). Інші речі — null.
 */
export function shapedStage(state: GameState, object: string): FillStage | null {
  if (!(SHAPED as readonly string[]).includes(object)) return null;
  return stagesOf(state, object)[0] ?? 0;
}

/** Кадри миття силуету в кабіні (§8.7) і скільки мс стоїть кожен. */
export const SHOWER_WASH = { frames: ["wash-1", "wash-2", "wash-3", "wash-4"], ms: 380 } as const;

/**
 * Силует персонажа в кабіні (§8.7), `time` — час сцени, мс: кадр миття й накладка над ним — пара, а в холодному душі, де пари
 * немає, — решта тіла. null — персонаж не миється; купаючи кота, він стоїть перед кабіною.
 */
export function showerFigure(state: GameState, time: number): { wash: IsoFrame; over: IsoFrame } | null {
  const activity = state.character.activity;
  if (activity?.kind !== "use" || activity.target !== "shower" || activity.bath === true) return null;
  const { frames, ms } = SHOWER_WASH;
  const wash = frames[Math.floor(time / ms) % frames.length] ?? frames[0];
  return { wash: frame("env/shower/figure", wash), over: frame("env/shower/figure", powerOut(state) ? "legs" : "steam") };
}

/** Сховища-фігури (мішок наповнювача, бак стерильного корму): їхня форма — наповнення, тож стан `full-N` — у самій речі. */
export function shapedState(state: GameState, object: (typeof SHAPED)[number]): string {
  return fullState(shapedStage(state, object) ?? 0);
}

/** Сховища-меблі з накладками наповнення, накладки — у порядку їхніх запасів у `STORAGES`. */
export const STORAGE_OVERLAYS = {
  // Засоби гігієни й шампунь для котів — дві пляшечки на полиці душу.
  shower: ["env/shower/hygiene", "env/shower/shampoo"],
  // Ліки для себе — праворуч від крана, пластир і бинт — ліворуч.
  sink: ["env/sink/human-meds", "env/sink/dressing"],
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
  const kind = foodLook(item.sterile, item.foodQuality);
  const level = food > BOWL_CAPACITY / 2 ? 2 : 1;
  return frame(`item/bowl/${item.quality}`, `${kind}-${level}`);
}

/**
 * Вигляд корму в мисці, годівниці й совку: кожна якість — своя, і для стерилізованих теж (`art/item/bowl/*.svg`).
 */
export function foodLook(sterile: boolean, quality: Quality | null): "cheap" | "premium" | "sterile" | "sterile-premium" {
  if (sterile) return quality === "premium" ? "sterile-premium" : "sterile";
  return quality ?? "cheap";
}

/** Миска з водою (§9.12): порожня, мало, половина, повна (`WATER_CAPACITY` ковтків). */
export function waterFrame(item: WaterItem): IsoFrame {
  const share = item.water / waterCapacity(item);
  const level = share <= 0 ? "empty" : share <= 1 / 3 ? "low" : share <= 2 / 3 ? "half" : "full";
  return frame(`item/water/${item.quality}`, level);
}

/**
 * Лоток (§9.12): без наповнювача (чистий чи вже брудний — без наповнювача досить одного відвідування); чистий; з грудками
 * (ним користувалися); брудний (`isDirty` — ще й запах: `-dirty` у назві стану).
 */
export function litterFrame(item: LitterItem): IsoFrame {
  if (item.litter === null) return frame(`item/litter/${item.quality}`, isDirty(item) ? "empty-dirty" : "empty");
  const use = isDirty(item) ? "-dirty" : item.uses > 0 ? "-used" : "";
  return frame(`item/litter/${item.quality}`, `${item.litter}${use}`);
}

/** Фонтанчик на поїлці (§8.7): вода йде, поки він працює й поїлка не порожня. */
export function fountainFrame(state: Pick<GameState, "home">, fountain: Quality, water: WaterItem): IsoFrame {
  return frame(`item/fountain/${fountain}`, fountainWorks(state) && water.water > 0 ? "on" : "dry");
}

/** Брудний лоток пахне (§9.12); закритий тримає запах у собі. */
export const litterSmells = (item: LitterItem): boolean => item.quality === "cheap" && isDirty(item);

/** Кадр речі на клітинці, коли нею ніхто не користується (§8.7): у руках персонажа й на місці, куди вона стане. */
export function placedFrame(item: PlacedItem): IsoFrame {
  switch (item.kind) {
    case "bowl":
      return bowlFrame(item);
    case "water":
      return waterFrame(item);
    case "litter":
      return litterFrame(item);
    case "house":
      return frame(`item/house/${item.quality}`);
    case "scratcher":
      return frame(`item/scratcher/${item.quality}`);
  }
}

/** Кадр речі котячого кутка; іграшка — на підлозі чи загнана під диван або холодильник (видно лише пір'їнку). */
export function itemFrame(state: GameState, item: HomeItem): IsoFrame {
  if (item.kind === "toy") return frame(`item/toy/${item.quality}`, item.hidden !== undefined ? "hidden" : "floor");
  return item.kind === "bowl" ? bowlFrame(item, bowlEaten(state, item) ?? 0) : placedFrame(item);
}

/** Автогодівниця (§9.12): що у віконці бункера — вид корму й мало/повно (до половини — `low`); порожня — `empty`. */
export function feederFrame(feeder: Feeder): IsoFrame {
  if (feeder.food <= 0) return frame(`item/feeder/${feeder.quality}`, "empty");
  const kind = foodLook(feeder.sterile, feeder.foodQuality);
  const level = feeder.food / FEEDER_CAPACITY[feeder.quality] > 0.5 ? "full" : "low";
  return frame(`item/feeder/${feeder.quality}`, `${kind}-${level}`);
}

/**
 * Робот-пилосос (§8.7): на доку заряджається, у дорозі — прибирає. У день відключення світла (§4.1, рішення автора
 * 2026-11-02) він не виїжджає (це вирішує сим) і стоїть на доку без заряду: вогник погас.
 */
export function robotFrame(state: GameState, quality: Quality): IsoFrame {
  if (powerOut(state)) return frame(`item/robot/${quality}`, "off");
  return frame(`item/robot/${quality}`, robotProgress(state) === null ? "charging" : "cleaning");
}

/** Док робота (§8.7): зелений вогник живлення горить, а в день відключення світла (§4.1) погас. */
export function dockFrame(state: GameState): IsoFrame {
  return frame("item/robot-dock", powerOut(state) ? "off" : "on");
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

/** Кіт спить у переносці (§9.12, «Пасажир першого класу»): поверх нього — дверцята з ґратками. */
export function carrierOccupied(state: GameState): boolean {
  return state.cats.some((cat) => cat.away === null && cat.act.kind === "sleep" && cat.act.target === "carrier");
}

/** Де стоїть переноска `index` із `count` видимих (§8.7), одиниці арту від `CARRIER_SPOT`: купа, як ящики. */
const CARRIER_PILE: readonly (readonly Point[])[] = [
  [{ x: 0, y: 0 }],
  [{ x: 0, y: 0 }, { x: 0, y: -46 }],
  [{ x: -32, y: 0 }, { x: 32, y: 0 }, { x: 0, y: -46 }],
  [{ x: -32, y: 0 }, { x: 32, y: 0 }, { x: -32, y: -46 }, { x: 32, y: -46 }],
];

export function carrierSlot(count: number, index: number): Point {
  return CARRIER_PILE[count - 1]?.[index] ?? { x: 0, y: 0 };
}

/** У видимій переносці `index` кіт під замком (§8.7): її дверцята зачинено. Хто заліз поспати сам, сидить за відчиненими. */
export function carrierLocked(state: GameState, index: number): boolean {
  return cagedCats(state).some((cat) => carrierOf(state, cat) === index);
}

/** Кіт у переносці `index` гризе її (§8.7): вона смикається. */
export function carrierShakes(state: GameState, index: number): boolean {
  return cagedCats(state).some((cat) => carrierOf(state, cat) === index && cageStage(cat) === "chew");
}

/** Безлад (§9.12): `mess/<вид>`. */
export function messFrame(mess: Pick<Mess, "kind" | "carrier">): IsoFrame {
  return frame(mess.carrier ? `mess/carrier/${mess.carrier}` : `mess/${mess.kind}`);
}

// --- Пил і павутина (§8.7) ---------------------------------------------------------------------------

/** Клубки пилу на відкритій підлозі (`mess/dust/floor`): три різні, по черзі за номером місця — сусідні різняться. */
const FLOOR_DUST = ["a", "b", "c"] as const;

/**
 * Пил на підлозі (§8.7, «Пил і павутина», рішення автора 2026-11-02) на місці `DUST_SPOTS[index]`: купка в куті
 * (`mess/dust/corner`), смужка вздовж плінтуса — уздовж осі стіни (`wall-x` — стіна y = const, `wall-y` — x = const),
 * клубок на підлозі (`mess/dust/floor`, стан за номером місця). Павутина висить на стіні — `cobwebLook`; null — її та
 * невідоме місце.
 */
export function dustFrame(index: number): IsoFrame | null {
  const spot = DUST_SPOTS[index];
  switch (spot?.kind) {
    case "corner":
      return frame("mess/dust/corner");
    case "wall":
      return frame(spot.along === "y" ? "mess/dust/wall-y" : "mess/dust/wall-x");
    case "floor":
      return frame("mess/dust/floor", FLOOR_DUST[index % FLOOR_DUST.length]!);
    default:
      return null;
  }
}

/** Павутина: кадр `mess/cobweb` і чи віддзеркалити його (`flip` — по горизонталі довкола pivot, кута на підлозі). */
export interface CobwebLook {
  frame: IsoFrame;
  flip: boolean;
}

/**
 * Павутина в куті з точкою підлоги `corner` (§8.7; місце `DUST_SPOTS` виду `cobweb`). Малюнок `mess/cobweb` розраховано на
 * верхню вершину ромба кімнати (`cobwebState`: обидві задні стіни, лише y = 0 праворуч від кута чи лише x = 0 ліворуч). Сим
 * ставить павутину й у правий кут кімнати — ванна, (12, 1) над умивальником, бо лівий закриває душова кабіна: там задня
 * стіна y = 0 підходить до кута зліва, а праворуч — низька внутрішня стіна (66), над якою павутині нема на чому висіти. Тоді —
 * чверть павутини на стіні вздовж осі x (`wall-x`), віддзеркалена: вершина — над лінією кута праворуч, павутина — на
 * задній стіні кімнати ліворуч від неї. Лівий кут (дзеркально: x = 0 підходить згори, знизу внутрішня стіна) — так само з
 * `wall-y`. Задньої стіни біля кута немає — null.
 */
export function cobwebLook(corner: Vec): CobwebLook | null {
  const x = Math.floor(corner.x);
  const y = Math.floor(corner.y);
  const back = (cx: number, cy: number): boolean => wallKind(cx, cy) === "back";
  const floor = (cx: number, cy: number): boolean => wallKind(cx, cy) === null;
  if (back(x - 1, y - 1) && floor(x - 1, y) && !floor(x, y) && !back(x, y)) return cobweb("wall-x", true);
  if (back(x - 1, y - 1) && floor(x, y - 1) && !floor(x, y) && !back(x, y)) return cobweb("wall-y", true);
  const state = cobwebState(corner);
  return state ? cobweb(state, false) : null;
}

const cobweb = (state: CobwebState, flip: boolean): CobwebLook => ({ frame: frame("mess/cobweb", state), flip });
