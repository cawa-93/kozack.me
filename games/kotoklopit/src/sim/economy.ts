// Запаси, доставка й комунальні (§6.4).

import { spend } from "./character";
import {
  DELIVERY,
  DELIVERY_HOURS,
  WATER_CAPACITY,
  DELIVERY_NEXT_DAY_MINUTE,
  DELIVERED_TOY_AT,
  MINUTES_PER_HOUR,
  PRODUCTS,
  START_CLOTHES,
  STORAGE_LIMITS,
  START_SUPPLIES,
  THINGS,
  UTILITIES_BASE,
} from "./config";
import { emit, endGame } from "./events";
import { SLOTS, SURFACE_IDS } from "./home";
import { priceFactor } from "./modifiers";
import { absoluteMinute } from "./time";
import type { Appliance, Delivery, GameState, Home, HomeItem, Product, Quality, ThingKind, UtilitiesReport } from "./types";

/** Із запасів спершу береться дороге. */
const TAKE_ORDER: readonly Quality[] = ["premium", "cheap"];

/**
 * Квартира на старті: котячий куток уже є — дешева миска, миска з водою, дешевий лоток
 * з наповнювачем і іграшка (§9.12). `nextId` видає id речам.
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
    utilitiesDebt: 0,
    repairs: 0,
    carrier: null,
    appliances: { feeder: null, fountain: null, robot: null },
    fur: 0,
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

/** Нашийник і дзвіночок — штучні: що вони закінчилися, не підказують. */
const NO_HINT: readonly Product[] = ["collar", "bell"];

/**
 * Запас уперше закінчився, а в дорозі його немає (§6.4, правка автора 2026-10-23): кнопка телефону
 * пульсує з його іконкою, доки телефон не відкриють.
 */
function noteEmpty(state: GameState, product: Product): void {
  if (supplyCount(state, product) > 0 || NO_HINT.includes(product) || incoming(state, product) > 0) return;
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

/** Поповнити запас: покупка, доставка, стартовий пакет. Відтепер сховище його показує (§6.4). */
export function addSupply(state: GameState, product: Product, quality: Quality, amount: number): void {
  // Що не влазить у сховище, пропадає (§6.4).
  state.home.supplies[product][quality] += Math.max(0, Math.min(amount, STORAGE_LIMITS[product] - supplyCount(state, product)));
  if (!state.home.acquired.includes(product)) state.home.acquired.push(product);
}

export function returnSupply(state: GameState, product: Product, quality: Quality): void {
  if (supplyCount(state, product) < STORAGE_LIMITS[product]) state.home.supplies[product][quality] += 1;
}

/** Скільки запасу їде доставкою чи чекає під дверима. */
export function incoming(state: GameState, product: Product): number {
  return [...state.home.deliveries, ...state.home.porch].reduce(
    (sum, d) => sum + ("product" in d && d.product === product ? PRODUCTS[product].units[d.quality] : 0),
    0,
  );
}

/** Упаковка вміститься у сховище разом із тим, що вже є й що їде (§6.4). */
export function fitsStorage(state: GameState, product: Product, quality: Quality): boolean {
  return supplyCount(state, product) + incoming(state, product) + PRODUCTS[product].units[quality] <= STORAGE_LIMITS[product];
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

/** Замовити одну упаковку окремим замовленням; null, якщо не вистачає грошей чи місця у сховищі (§6.4). */
export function order(state: GameState, product: Product, quality: Quality): Delivery | null {
  if (!fitsStorage(state, product, quality)) return null;
  const base = productPrice(state, product, quality);
  return dispatch(state, { product }, quality, base + deliveryCost(state, base));
}

/** Відправити пакунок за вказану ціну: гроші списано, пакунок прибуде через 6 годин (§6.4). */
export function dispatch(state: GameState, goods: { product: Product } | { thing: ThingKind }, quality: Quality, price: number): Delivery | null {
  if (state.end !== null) return null;
  if (!spend(state, price)) return null;
  const delivery: Delivery = {
    id: state.nextId++,
    ...goods,
    quality,
    at: absoluteMinute(state.day, state.minute) + DELIVERY_HOURS * MINUTES_PER_HOUR,
  };
  state.home.deliveries.push(delivery);
  emit(state, { type: "ordered", delivery, price });
  return delivery;
}

/** Скільки ще речей цього типу вміститься: вільні місця мінус замовлені (§6.4). Іграшкам місце не потрібне. */
export function freeSlots(state: GameState, thing: ThingKind): number {
  if (thing === "toy") return Infinity;
  const home = state.home;
  if (thing === "carrier" || isAppliance(thing)) {
    const ordered = [...home.deliveries, ...home.porch].some((d) => "thing" in d && d.thing === thing);
    const owned = thing === "carrier" ? home.carrier !== null : home.appliances[thing] !== null;
    return !owned && !ordered ? 1 : 0;
  }
  const taken = new Set(home.items.map((i) => ("slot" in i ? i.slot : "")));
  const free = SLOTS.filter((s) => s.kind === thing && !taken.has(s.id)).length;
  const coming = [...home.deliveries, ...home.porch].filter((d) => "thing" in d && d.thing === thing).length;
  return free - coming;
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
    state.home.carrier = quality;
    return null;
  }
  if (isAppliance(thing)) {
    state.home.appliances[thing] = quality;
    return null;
  }
  const id = state.nextId++;
  if (thing === "toy") return { id, kind: "toy", quality, x: DELIVERED_TOY_AT.x, y: DELIVERED_TOY_AT.y, uses: 0 };
  const taken = new Set(state.home.items.map((i) => ("slot" in i ? i.slot : "")));
  const slot = SLOTS.find((s) => s.kind === thing && !taken.has(s.id))?.id;
  if (!slot) return null;
  switch (thing) {
    case "bowl":
      return { id, kind: "bowl", quality, slot, food: 0, foodQuality: null, sterile: false };
    case "water":
      return { id, kind: "water", quality, slot, water: WATER_CAPACITY };
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
  emit(state, { type: "discarded", item });
  return true;
}

/** Пакунки, час яких настав, кур'єр лишає під дверима й дзвонить. */
export function tickDeliveries(state: GameState): void {
  const now = absoluteMinute(state.day, state.minute);
  const home = state.home;
  for (const delivery of home.deliveries.filter((d) => d.at <= now)) {
    home.deliveries.splice(home.deliveries.indexOf(delivery), 1);
    home.porch.push(delivery);
    emit(state, { type: "doorbell", delivery });
  }
}

/** Відчинити двері й забрати пакунки: запаси одразу поповнюються. */
export function receivePackages(state: GameState): Delivery[] {
  const home = state.home;
  const received = home.porch.splice(0);
  for (const delivery of received) {
    if ("product" in delivery) addSupply(state, delivery.product, delivery.quality, PRODUCTS[delivery.product].units[delivery.quality]);
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
  const appliances = (Object.keys(home.appliances) as Appliance[]).filter((a) => home.appliances[a] !== null);
  return (
    UTILITIES_BASE +
    home.items.reduce((sum, i) => sum + THINGS[i.kind].utilities, 0) +
    appliances.reduce((sum, a) => sum + THINGS[a].utilities, 0) +
    home.repairs
  );
}

export const isAppliance = (thing: ThingKind): thing is Appliance => thing === "feeder" || thing === "fountain" || thing === "robot";

/**
 * Сплатити комунальні в ніч на понеділок (§6.4). Неоплачений тиждень — попередження;
 * з попередженням треба сплатити два тижні, хоча б один, інакше — виселення.
 */
export function payUtilities(state: GameState): UtilitiesReport {
  const home = state.home;
  // Перерахунок комунальних (§4.1) зменшує цей платіж.
  const due = Math.max(0, utilitiesDue(state) - state.today.utilitiesDiscount);
  state.today.utilitiesDiscount = 0;
  // Ремонт іде в цей платіж (чи в борг), далі рахується наново.
  home.repairs = 0;
  const debt = home.utilitiesDebt;
  if (debt === 0) {
    if (spend(state, due)) return { outcome: "paid", paid: due, nextDue: 0 };
    home.utilitiesDebt = due;
    return { outcome: "warning", paid: 0, nextDue: due + utilitiesDue(state) };
  }
  if (spend(state, debt + due)) {
    home.utilitiesDebt = 0;
    return { outcome: "cleared", paid: debt + due, nextDue: 0 };
  }
  if (spend(state, debt)) {
    home.utilitiesDebt = due;
    return { outcome: "partial", paid: debt, nextDue: due + utilitiesDue(state) };
  }
  endGame(state, "eviction");
  return { outcome: "evicted", paid: 0, nextDue: 0 };
}
