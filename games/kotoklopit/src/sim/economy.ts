// Запаси, доставка й комунальні (§6.4).

import { addCarrier } from "./carriers";
import { spend } from "./character";
import {
  DELIVERY,
  DELIVERY_HOURS,
  WATER_CAPACITY,
  DELIVERY_NEXT_DAY_MINUTE,
  DELIVERED_TOY_AT,
  MINUTES_PER_HOUR,
  PRODUCTS,
  REAL_SECONDS_PER_GAME_HOUR,
  START_CLOTHES,
  STORAGE_LIMITS,
  START_SUPPLIES,
  SUPPLY_FLIGHT,
  THINGS,
  UNSOLD,
  UTILITIES_BASE,
} from "./config";
import { emit, endGame } from "./events";
import { nearestFreePlace, SLOTS, slotTaken, SURFACE_IDS, VACUUM_HOME } from "./home";
import { priceFactor } from "./modifiers";
import { absoluteMinute } from "./time";
import { tidyBoxTraces } from "./traces";
import type { Appliance, BowlItem, Delivery, Feeder, GameState, Home, HomeItem, Product, Quality, Spending, ThingKind, UtilitiesReport } from "./types";

/** Із запасів спершу береться дороге. */
const TAKE_ORDER: readonly Quality[] = ["premium", "cheap"];

/**
 * Квартира на старті (§9.12, правка автора 2026-10-20): котячих речей немає — дешеві миску, воду й лоток приносить стартовий
 * пакет першого кошеняти з притулку (`giveStarterPack`, night.ts), решту купує гравець. `nextId` видає id речам.
 */
export function newHome(): Home {
  // На старті котячих речей немає: миски, лотки й іграшки купує гравець (§9.12, правка автора 2026-10-20).
  const items: HomeItem[] = [];
  return {
    supplies: structuredClone(START_SUPPLIES),
    acquired: (Object.keys(START_SUPPLIES) as Product[]).filter((p) => START_SUPPLIES[p].cheap + START_SUPPLIES[p].premium > 0),
    ranOut: [],
    phoneHints: [],
    stove: { item: null, minutes: 0 },
    surfaces: Object.fromEntries(SURFACE_IDS.map((id) => [id, null])),
    items,
    messes: [],
    deliveries: [],
    porch: [],
    utilitiesBill: 0,
    repairs: 0,
    carriers: [],
    appliances: { fountain: null, robot: null, vacuum: null },
    feeders: [],
    fur: 0,
    tufts: [],
    // Квартира на старті чиста (§8.7, «Пил і павутина»): пил набирається з часом.
    dust: [],
    dustClock: 0,
    vacuumAt: { ...VACUUM_HOME },
    clothes: START_CLOTHES,
    washer: { state: "idle", minutes: 0, quality: "cheap" },
  };
}

export function supplyCount(state: GameState, product: Product): number {
  const supply = state.home.supplies[product];
  return supply.cheap + supply.premium;
}

/** Узяти одну порцію чи один душ. Повертає якість або null, якщо запаси скінчилися. */
export function takeSupply(state: GameState, product: Product): Quality | null {
  const supply = state.home.supplies[product];
  const quality = TAKE_ORDER.find((q) => supply[q] > 0) ?? null;
  if (quality !== null) {
    supply[quality] -= 1;
    noteEmpty(state, product);
  }
  return quality;
}

/**
 * Нашийник — штучний, котяча м'ята — не щоденна (§9.12), мамині судочки не замовити (§6.4): що вони закінчилися, не
 * підказують.
 */
const NO_HINT: readonly Product[] = ["collar", "catnip", ...UNSOLD];

/**
 * Запас уперше закінчився, а в дорозі його немає (§6.4, правка автора 2026-10-23): кнопка телефону
 * пульсує з його іконкою, доки телефон не відкриють.
 */
function noteEmpty(state: GameState, product: Product): void {
  if (supplyCount(state, product) > 0 || NO_HINT.includes(product) || incoming(state, product) > 0 || boxCount(state, product) > 0 || flyingCount(state, product) > 0) return;
  const home = state.home;
  const ranOut = (home.ranOut ??= []);
  if (ranOut.includes(product)) return;
  ranOut.push(product);
  (home.phoneHints ??= []).push(product);
}

/** Телефон відкрили: підказки побачено. */
export function seePhoneHints(state: GameState): void {
  state.home.phoneHints = [];
}

/**
 * Персонаж узяв чи витратив запас (§6.4): над ним виринає іконка із залишком. Без якості береться
 * як завжди — спершу дорожчий; з якістю — саме вона. Повертає якість або null, якщо запасу немає.
 */
export function useSupply(state: GameState, product: Product, quality?: Quality): Quality | null {
  let taken: Quality | null;
  if (quality === undefined) taken = takeSupply(state, product);
  else if (state.home.supplies[product][quality] > 0) {
    state.home.supplies[product][quality] -= 1;
    taken = quality;
    noteEmpty(state, product);
  } else taken = null;
  if (taken !== null) emit(state, { type: "supply-used", product, left: supplyCount(state, product) });
  return taken;
}

/** Якість, яку зі сховища беруть першою (спершу дорожча), або null, якщо запасу немає. */
export function topQuality(state: GameState, product: Product): Quality | null {
  const supply = state.home.supplies[product];
  return TAKE_ORDER.find((q) => supply[q] > 0) ?? null;
}

/** Узяти кілька порцій саме цієї якості: стільки, скільки просять, або все, що лишилося. Повертає взяте. */
export function takeSupplies(state: GameState, product: Product, quality: Quality, amount: number): number {
  const supply = state.home.supplies[product];
  const taken = Math.max(0, Math.min(amount, supply[quality]));
  if (taken > 0) {
    supply[quality] -= taken;
    noteEmpty(state, product);
  }
  return taken;
}

/** Те саме, що takeSupplies, але персонаж бачить, скільки лишилося (§6.4). */
export function useSupplies(state: GameState, product: Product, quality: Quality, amount: number): number {
  const taken = takeSupplies(state, product, quality, amount);
  if (taken > 0) emit(state, { type: "supply-used", product, left: supplyCount(state, product) });
  return taken;
}

/** Запас уже бував удома: відтепер сховище його показує (§6.4). */
function acquire(state: GameState, product: Product): void {
  if (!state.home.acquired.includes(product)) state.home.acquired.push(product);
}

/** Поклати запас просто в сховище (стартовий пакет кошеняти); що не влазить, чекає в ящиках біля входу (§6.4). */
export function addSupply(state: GameState, product: Product, quality: Quality, amount: number): void {
  const fits = Math.min(amount, storageRoom(state, product));
  state.home.supplies[product][quality] += fits;
  acquire(state, product);
  stash(state, product, quality, amount - fits);
}

/** Повернути взяте назад у сховище; переповнене — у ящики, нічого не пропадає. */
export function returnSupply(state: GameState, product: Product, quality: Quality): void {
  addSupply(state, product, quality, 1);
}

/** Скільки запасу летить у сховище (§6.4). */
function flyingCount(state: GameState, product: Product): number {
  return (state.home.flying ?? []).reduce((sum, f) => (f.product === product ? sum + f.amounts.cheap + f.amounts.premium : sum), 0);
}

/** Вільне місце у сховищі: запас, що вже летить сюди, своє місце зайняв (§6.4). */
function storageRoom(state: GameState, product: Product): number {
  return Math.max(0, STORAGE_LIMITS[product] - supplyCount(state, product) - flyingCount(state, product));
}

/** Скільки запасу лежить у ящиках біля входу (§6.4). */
export function boxCount(state: GameState, product: Product): number {
  const box = state.home.boxes?.[product];
  return box ? box.cheap + box.premium : 0;
}

/** Поклати запас у ящики біля входу (§6.4): безлімітне сховище, з якого нічого не беруть. */
export function stash(state: GameState, product: Product, quality: Quality, amount: number): void {
  if (amount <= 0) return;
  const boxes = (state.home.boxes ??= {});
  const box = (boxes[product] ??= { cheap: 0, premium: 0 });
  box[quality] += amount;
}

/** У ящиках є запас, для якого є місце у сховищі: розпакувати є що. */
export function canUnpack(state: GameState): boolean {
  return (Object.keys(state.home.boxes ?? {}) as Product[]).some((p) => boxCount(state, p) > 0 && storageRoom(state, p) > 0);
}

/**
 * Запас вилітає у своє сховище (§6.4), скільки влазить, — спершу дорожчий; решта одразу в ящиках біля входу. `order` — котрим
 * по черзі вилітає. Ляже, коли долетить (`tickFlying`). Повертає, скільки вилетіло.
 */
export function flySupply(state: GameState, product: Product, amounts: Readonly<Record<Quality, number>>, order: number): number {
  const room = storageRoom(state, product);
  const flying: Record<Quality, number> = { cheap: 0, premium: 0 };
  let sent = 0;
  for (const quality of TAKE_ORDER) {
    const fits = Math.min(amounts[quality], room - sent);
    flying[quality] = fits;
    sent += fits;
    stash(state, product, quality, amounts[quality] - fits);
  }
  if (sent > 0) (state.home.flying ??= []).push({ product, amounts: flying, minutes: flightMinutes(order) });
  return sent;
}

/** Розпакувати ящики (§6.4): запаси вилітають у свої сховища, що не влізло, лишається в ящиках. Повертає, що й скільки вилетіло. */
export function unpack(state: GameState): { product: Product; amount: number }[] {
  const boxes = state.home.boxes ?? {};
  const moved: { product: Product; amount: number }[] = [];
  for (const product of Object.keys(boxes) as Product[]) {
    const box = boxes[product];
    if (!box) continue;
    // Що не влізе, `flySupply` покладе назад.
    delete boxes[product];
    const amount = flySupply(state, product, box, moved.length);
    if (amount > 0) moved.push({ product, amount });
  }
  // Усе розпаковано — коробки зникають разом із котячими слідами на них (§9.12, «Котячі сліди в квартирі»).
  tidyBoxTraces(state);
  if (moved.length > 0) emit(state, { type: "unpacked", moved });
  return moved;
}

/** Скільки ігрових хвилин летить запас, що вилітає `order`-м по черзі (`SUPPLY_FLIGHT`). */
function flightMinutes(order: number): number {
  return ((SUPPLY_FLIGHT.ms + order * SUPPLY_FLIGHT.staggerMs) / 1000 / REAL_SECONDS_PER_GAME_HOUR) * MINUTES_PER_HOUR;
}

/** Минуло `minutes` хвилин: запас, що долетів, лягає у сховище (§6.4). */
export function tickFlying(state: GameState, minutes: number): void {
  const flying = state.home.flying;
  if (!flying) return;
  for (const flight of flying) flight.minutes -= minutes;
  const landed = flying.filter((flight) => flight.minutes <= 0);
  if (landed.length === 0) return;
  const left = flying.filter((flight) => flight.minutes > 0);
  if (left.length > 0) state.home.flying = left;
  else delete state.home.flying;
  for (const { product, amounts } of landed) {
    for (const quality of TAKE_ORDER) state.home.supplies[product][quality] += amounts[quality];
    acquire(state, product);
    emit(state, { type: "supply-landed", product });
  }
}

/** Настала ніч: запас, що ще летів, уже в сховищі (§6.4). */
export function landFlying(state: GameState): void {
  tickFlying(state, Infinity);
}

/** Запас можна замовити чи купити, поки його немає в ящиках біля входу (§6.4); мамині судочки не продаються. */
export function canOrderProduct(state: GameState, product: Product): boolean {
  return !UNSOLD.includes(product) && boxCount(state, product) === 0;
}

/** Скільки запасу їде доставкою чи чекає під дверима. */
export function incoming(state: GameState, product: Product): number {
  return [...state.home.deliveries, ...state.home.porch].reduce(
    (sum, d) => sum + ("product" in d && d.product === product ? PRODUCTS[product].units[d.quality] : 0),
    0,
  );
}

/** Базова ціна запасу (§6.4): модифікатор дня змінює ціну корму. */
export function productPrice(state: GameState, product: Product, quality: Quality): number {
  return Math.round(PRODUCTS[product].price[quality] * priceFactor(state, product));
}

/**
 * Вартість доставки замовлення (§6.4): 10% бази його товарів, округлено, і надбавка за складністю
 * один раз на замовлення.
 */
export function deliveryCost(state: GameState, base: number): number {
  return Math.round(base * DELIVERY.share) + DELIVERY.fee[state.difficulty];
}

/** Замовити одну упаковку окремим замовленням; null, якщо не вистачає грошей чи запас ще в ящиках (§6.4). */
export function order(state: GameState, product: Product, quality: Quality): Delivery | null {
  if (!canOrderProduct(state, product)) return null;
  const base = productPrice(state, product, quality);
  return dispatch(state, { product }, quality, base, deliveryCost(state, base));
}

/** Куди йде покупка в грошах тижня (§6.4, «Куди йдуть гроші»): запаси — «корм і запаси», решта — «речі». */
export const spendingOf = (goods: { product: Product } | { thing: ThingKind }): Spending => ("product" in goods ? "supplies" : "things");

/**
 * Відправити пакунок за вказану ціну й доставку окремим замовленням: гроші списано, пакунок прибуде через 6 годин (§6.4).
 * Доставку кошика списує кошик (`checkout`), тож тут вона 0.
 */
export function dispatch(state: GameState, goods: { product: Product } | { thing: ThingKind }, quality: Quality, price: number, shipping = 0): Delivery | null {
  if (state.end !== null || state.character.money < price + shipping) return null;
  spend(state, price, spendingOf(goods));
  spend(state, shipping, "delivery");
  const delivery: Delivery = {
    id: state.nextId++,
    ...goods,
    quality,
    at: absoluteMinute(state.day, state.minute) + DELIVERY_HOURS * MINUTES_PER_HOUR,
  };
  state.home.deliveries.push(delivery);
  emit(state, { type: "ordered", delivery, price: price + shipping });
  return delivery;
}

/** Речі котячого кутка разом із тією, що в руках (§8.7): вона лише перейшла з підлоги в руки. */
export function ownedItems(state: GameState): readonly HomeItem[] {
  const held = state.character.held;
  return held?.kind === "thing" ? [...state.home.items, held.item] : state.home.items;
}

/** Скільки ще речей цього типу вміститься: межа виду мінус ті, що вже є й що їдуть (§6.4, §8.7). Іграшкам місце не потрібне. */
export function freeSlots(state: GameState, thing: ThingKind): number {
  if (thing === "toy" || thing === "carrier") return Infinity;
  const home = state.home;
  if (thing === "lock" || isAppliance(thing)) {
    const ordered = [...home.deliveries, ...home.porch].some((d) => "thing" in d && d.thing === thing);
    return !ownsThing(state, thing) && !ordered ? 1 : 0;
  }
  if (thing === "feeder") return feederRoom(state);
  const limit = SLOTS.filter((s) => s.kind === thing).length;
  return limit - ownedItems(state).filter((i) => i.kind === thing).length - packagesOf(state, thing);
}

/** Скільки речей цього типу їде доставкою чи чекає під дверима. */
function packagesOf(state: GameState, thing: ThingKind): number {
  return [...state.home.deliveries, ...state.home.porch].filter((d) => "thing" in d && d.thing === thing).length;
}

/**
 * Скільки ще автогодівниць уміститься (§9.12): одна на миску — над кожною миской без годівниці, і тими, що вдома, і тими,
 * що вже їдуть, а в магазині ще й над мисками з того самого кошика (`cartBowls`). Нова миска стає спершу під годівницю, що
 * чекає миску над порожнім місцем, — тоді місця для ще однієї вона не дає. Мінус годівниці, що вже їдуть. Загальна ревізія
 * 2026-10-29: раніше рахувалися лише миски, що вже стоять, тож миску й годівницю доводилося замовляти двома замовленнями.
 */
export function feederRoom(state: GameState, cartBowls = 0): number {
  const newBowls = Math.max(0, packagesOf(state, "bowl") + cartBowls - waitingFeeders(state).length);
  return Math.max(0, bowlsWithoutFeeder(state).length + newBowls - packagesOf(state, "feeder"));
}

/** Річ без місця вже є вдома: замок на шафці чи техніка (§6.4). */
export function ownsThing(state: GameState, thing: "lock" | Appliance): boolean {
  const home = state.home;
  if (thing === "lock") return home.lock !== undefined;
  return home.appliances[thing] !== null;
}

/** Автогодівниця над місцем миски (§9.12) або null. */
export function feederAt(state: GameState, slot: string): Feeder | null {
  return state.home.feeders?.find((f) => f.slot === slot) ?? null;
}

/** Миски, над якими ще немає автогодівниці (§9.12). */
function bowlsWithoutFeeder(state: GameState): BowlItem[] {
  return state.home.items.filter((i): i is BowlItem => i.kind === "bowl" && feederAt(state, i.slot) === null);
}

/** Автогодівниці над порожнім місцем, під якими немає миски (§9.12). */
function waitingFeeders(state: GameState): Feeder[] {
  const home = state.home;
  return (home.feeders ?? []).filter((f) => !home.items.some((i) => i.kind === "bowl" && i.slot === f.slot));
}

/**
 * Годівниця без миски переходить до миски без годівниці (§9.12). Це правило стану, а не реакція на викидання: миска зникає й
 * ламанням, а збереження вже могло дійти сюди з розведеними годівницею й миской, тож його тримає `tickHousehold`.
 */
export function settleFeeders(state: GameState): void {
  for (const feeder of waitingFeeders(state)) {
    const bowl = bowlsWithoutFeeder(state)[0];
    if (!bowl) return;
    feeder.slot = bowl.slot;
  }
}

/** Вільне місце виду `thing`, а зайняті всі (речі переставили) — найближча до них вільна клітинка (§8.7). */
function spareSlot(state: GameState, thing: ThingKind): string | undefined {
  const own = SLOTS.filter((s) => s.kind === thing);
  const free = own.find((s) => !slotTaken(state, s.id) && feederAt(state, s.id) === null);
  if (free) return free.id;
  const first = own[0];
  return first ? nearestFreePlace(state, first)?.id : undefined;
}

/**
 * Привезена автогодівниця стає над миской без годівниці; якщо такої вже немає (миска зламалася,
 * поки годівниця їхала) — над вільним місцем миски й чекає нову (§9.12).
 */
function placeFeeder(state: GameState, quality: Quality): void {
  const slot = bowlsWithoutFeeder(state)[0]?.slot ?? spareSlot(state, "bowl");
  if (slot === undefined) return;
  (state.home.feeders ??= []).push({ slot, quality, food: 0, foodQuality: null, sterile: false });
}

/** Замовити річ для котів окремим замовленням (§6.4); null, якщо немає місця чи грошей. */
export function orderThing(state: GameState, thing: ThingKind, quality: Quality): Delivery | null {
  if (freeSlots(state, thing) <= 0) return null;
  const base = THINGS[thing].price[quality];
  return dispatch(state, { thing }, quality, base + deliveryCost(state, base));
}

/** Нова річ стає на вільне місце свого типу, іграшка — на підлогу біля дверей. */
export function place(state: GameState, thing: ThingKind, quality: Quality): HomeItem | null {
  if (thing === "carrier") {
    addCarrier(state.home, quality);
    return null;
  }
  // Замок — на шафку з кормом (§9.12, «Кмітливість у бешкеті»).
  if (thing === "lock") {
    state.home.lock = quality;
    return null;
  }
  if (isAppliance(thing)) {
    state.home.appliances[thing] = quality;
    // Бак новий: вода з поламаного чи викинутого не переходить (§8.7).
    if (thing === "fountain") state.home.fountainTank = 0;
    return null;
  }
  if (thing === "feeder") {
    placeFeeder(state, quality);
    return null;
  }
  const id = state.nextId++;
  // Нова річ (§9.12, «Допитливість»): допитливі підуть її обнюхати, обачні якийсь час обходитимуть.
  (state.home.fresh ??= []).push({ item: id, at: absoluteMinute(state.day, state.minute) });
  if (thing === "toy") return { id, kind: "toy", quality, x: DELIVERED_TOY_AT.x, y: DELIVERED_TOY_AT.y, uses: 0 };
  // Нова миска — спершу під автогодівницю, що чекає миску (§9.12).
  const slot = (thing === "bowl" ? waitingFeeders(state)[0]?.slot : undefined) ?? spareSlot(state, thing);
  if (!slot) return null;
  switch (thing) {
    case "bowl":
      return { id, kind: "bowl", quality, slot, food: 0, foodQuality: null, sterile: false };
    case "water":
      return { id, kind: "water", quality, slot, water: WATER_CAPACITY[quality] };
    case "litter":
      return { id, kind: "litter", quality, slot, litter: null, uses: 0 };
    case "house":
      return { id, kind: "house", quality, slot };
    case "scratcher":
      return { id, kind: "scratcher", quality, slot };
  }
}

/** Викинути річ (§6.4, §8.7): комунальні зменшуються. */
export function discard(state: GameState, itemId: number): boolean {
  const items = state.home.items;
  const index = items.findIndex((i) => i.id === itemId);
  const item = items[index];
  if (!item) return false;
  items.splice(index, 1);
  // Одразу, а не з наступним тіком: телефон ще відкритий, і магазин не має показати місце для годівниці, яка вже переходить.
  settleFeeders(state);
  emit(state, { type: "discarded", item });
  return true;
}

/**
 * Викинути техніку (§8.7): комунальні зменшуються, а викинуту можна купити знову — зокрема дорожчу (перевірка побуту
 * 2026-10-28: техніку не можна було викинути, тож її комунальні лишалися назавжди, а дешеву не замінити дорогою).
 */
export function discardAppliance(state: GameState, appliance: Appliance): boolean {
  if (state.home.appliances[appliance] === null) return false;
  state.home.appliances[appliance] = null;
  return true;
}

/** Викинути замок із шафки з кормом (§8.7), як техніку: потім можна купити знову, зокрема надійний (загальна ревізія 2026-10-29). */
export function discardLock(state: GameState): boolean {
  if (state.home.lock === undefined) return false;
  delete state.home.lock;
  return true;
}

/** Пакунки, час яких настав, кур'єр лишає під дверима й дзвонить. Повертає, скільки пакунків привіз. */
export function tickDeliveries(state: GameState): number {
  const now = absoluteMinute(state.day, state.minute);
  const home = state.home;
  const arrived = home.deliveries.filter((d) => d.at <= now);
  for (const delivery of arrived) {
    home.deliveries.splice(home.deliveries.indexOf(delivery), 1);
    home.porch.push(delivery);
    emit(state, { type: "doorbell", delivery });
  }
  return arrived.length;
}

/** Відчинити двері й забрати пакунки: запаси — у ящики біля входу, речі — на свої місця (§6.4). */
export function receivePackages(state: GameState): Delivery[] {
  const home = state.home;
  const received = home.porch.splice(0);
  for (const delivery of received) {
    // Сховище з'явиться, коли запас розпакують.
    if ("product" in delivery) stash(state, delivery.product, delivery.quality, PRODUCTS[delivery.product].units[delivery.quality]);
    else {
      const item = place(state, delivery.thing, delivery.quality);
      if (item) home.items.push(item);
    }
  }
  if (received.length > 0) emit(state, { type: "received", deliveries: received });
  return received;
}

/** Персонаж ліг спати: пакунки, що мали прибути вночі, привезуть о 09:00 наступного дня. */
export function postponeDeliveries(state: GameState): void {
  const morning = absoluteMinute(state.day + 1, DELIVERY_NEXT_DAY_MINUTE);
  for (const delivery of state.home.deliveries) delivery.at = Math.max(delivery.at, morning);
}

/** Комунальні за тиждень (§6.4): базова сума, внесок кожної речі й ремонт меблів. */
export function utilitiesDue(state: GameState): number {
  const home = state.home;
  const carried = state.character.held;
  const appliances = (Object.keys(home.appliances) as Appliance[]).filter((a) => home.appliances[a] !== null);
  return (
    UTILITIES_BASE +
    ownedItems(state).reduce((sum, i) => sum + THINGS[i.kind].utilities, 0) +
    appliances.reduce((sum, a) => sum + THINGS[a].utilities, 0) +
    ((home.feeders?.length ?? 0) + (carried?.kind === "thing" && carried.feeder ? 1 : 0)) * THINGS.feeder.utilities +
    home.repairs
  );
}

/** Рахунок цього тижня (§6.4): комунальні мінус знижка перерахунку. */
const utilitiesThisWeek = (state: GameState): number => Math.max(0, utilitiesDue(state) - state.today.utilitiesDiscount);

/** Несплачений рахунок цього тижня (§6.4). */
export const utilitiesBill = (state: GameState): number => state.home.utilitiesBill ?? 0;

/** Чи є несплачений рахунок (§6.4): червона квитанція на панелі й рахунок у «Домі». */
export const hasUnpaidUtilities = (state: GameState): boolean => utilitiesBill(state) > 0;

/** Сплатити рахунок у телефоні (§6.4): лише всю суму; false — сплачувати нічого чи бракує грошей. */
export function payUtilities(state: GameState): boolean {
  const amount = utilitiesBill(state);
  if (amount === 0 || !spend(state, amount, "utilities")) return false;
  state.home.utilitiesBill = 0;
  emit(state, { type: "utilities-paid", amount });
  return true;
}

export const isAppliance = (thing: ThingKind): thing is Appliance => thing === "fountain" || thing === "robot" || thing === "vacuum";

/** Нарахувати комунальні в ніч на понеділок (§6.4): гроші не знімаються, приходить рахунок; старий ще не сплачено — виселення. */
export function billUtilities(state: GameState): UtilitiesReport {
  if (hasUnpaidUtilities(state)) {
    endGame(state, "eviction");
    return { outcome: "evicted", bill: 0 };
  }
  // Перерахунок комунальних (§4.1) зменшує цей рахунок — і титулка це каже.
  const bill = utilitiesThisWeek(state);
  const recalculated = state.today.utilitiesDiscount > 0;
  state.today.utilitiesDiscount = 0;
  // Ремонт іде в цей рахунок, далі рахується наново.
  state.home.repairs = 0;
  state.home.utilitiesBill = bill;
  return { outcome: "billed", bill, ...(recalculated ? { recalculated: true } : {}) };
}
