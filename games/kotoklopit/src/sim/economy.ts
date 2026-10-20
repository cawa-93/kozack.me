// Запаси, доставка й комунальні (§6.4).

import { spend } from "./character";
import {
  DELIVERY_HOURS,
  WATER_CAPACITY,
  DELIVERY_NEXT_DAY_MINUTE,
  DELIVERED_TOY_AT,
  DELIVERY_PRICE,
  MINUTES_PER_HOUR,
  PRODUCTS,
  START_SUPPLIES,
  THINGS,
  UTILITIES_BASE,
} from "./config";
import { emit, endGame } from "./events";
import { SLOTS, SURFACE_IDS } from "./home";
import { absoluteMinute } from "./time";
import type { Delivery, GameState, Home, HomeItem, Product, Quality, ThingKind, UtilitiesReport } from "./types";

/** Із запасів спершу береться дороге. */
const TAKE_ORDER: readonly Quality[] = ["premium", "cheap"];

/**
 * Квартира на старті: котячий куток уже є — дешева миска, миска з водою, дешевий лоток
 * з наповнювачем і іграшка (§9.12). `nextId` видає id речам.
 */
export function newHome(nextId: () => number): Home {
  const items: HomeItem[] = [
    { id: nextId(), kind: "bowl", quality: "cheap", slot: "bowl-1", food: 0, foodQuality: null, sterile: false },
    { id: nextId(), kind: "water", quality: "cheap", slot: "water-1", water: WATER_CAPACITY },
    { id: nextId(), kind: "litter", quality: "cheap", slot: "litter-1", litter: "cheap", uses: 0 },
    // Дешева іграшка-вудочка у вітальні (§9.12).
    { id: nextId(), kind: "toy", quality: "cheap", x: 5.5, y: 8.5, uses: 0 },
  ];
  return {
    supplies: structuredClone(START_SUPPLIES),
    stove: { item: null, minutes: 0 },
    surfaces: Object.fromEntries(SURFACE_IDS.map((id) => [id, null])),
    items,
    messes: [],
    deliveries: [],
    porch: [],
    utilitiesDebt: 0,
    repairs: 0,
    carrier: null,
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
  if (quality !== null) supply[quality] -= 1;
  return quality;
}

export function returnSupply(state: GameState, product: Product, quality: Quality): void {
  state.home.supplies[product][quality] += 1;
}

/** Доставка коштує 110% від базової ціни, округлено до цілого. */
export function deliveryPrice(product: Product, quality: Quality): number {
  return Math.round(PRODUCTS[product].price[quality] * DELIVERY_PRICE);
}

export function thingDeliveryPrice(thing: ThingKind, quality: Quality): number {
  return Math.round(THINGS[thing].price[quality] * DELIVERY_PRICE);
}

/** Замовити доставку; null, якщо не вистачає грошей. Пакунок прибуде через 6 годин. */
export function order(state: GameState, product: Product, quality: Quality): Delivery | null {
  return send(state, { product }, quality, deliveryPrice(product, quality));
}

function send(state: GameState, goods: { product: Product } | { thing: ThingKind }, quality: Quality, price: number): Delivery | null {
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
  if (thing === "carrier") {
    const ordered = [...home.deliveries, ...home.porch].some((d) => "thing" in d && d.thing === "carrier");
    return home.carrier === null && !ordered ? 1 : 0;
  }
  const taken = new Set(home.items.map((i) => ("slot" in i ? i.slot : "")));
  const free = SLOTS.filter((s) => s.kind === thing && !taken.has(s.id)).length;
  const coming = [...home.deliveries, ...home.porch].filter((d) => "thing" in d && d.thing === thing).length;
  return free - coming;
}

/** Замовити річ для котів (§6.4); null, якщо немає місця чи грошей. */
export function orderThing(state: GameState, thing: ThingKind, quality: Quality): Delivery | null {
  if (freeSlots(state, thing) <= 0) return null;
  return send(state, { thing }, quality, thingDeliveryPrice(thing, quality));
}

/** Нова річ стає на вільне місце свого типу, іграшка — на підлогу біля дверей. */
export function place(state: GameState, thing: ThingKind, quality: Quality): HomeItem | null {
  if (thing === "carrier") {
    state.home.carrier = quality;
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
    if ("product" in delivery) home.supplies[delivery.product][delivery.quality] += PRODUCTS[delivery.product].units[delivery.quality];
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
  return UTILITIES_BASE + state.home.items.reduce((sum, i) => sum + THINGS[i.kind].utilities, 0) + state.home.repairs;
}

/**
 * Сплатити комунальні в ніч на понеділок (§6.4). Неоплачений тиждень — попередження;
 * з попередженням треба сплатити два тижні, хоча б один, інакше — виселення.
 */
export function payUtilities(state: GameState): UtilitiesReport {
  const home = state.home;
  const due = utilitiesDue(state);
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
