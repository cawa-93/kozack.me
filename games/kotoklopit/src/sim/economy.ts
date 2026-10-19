// Запаси, доставка й комунальні (§6.4).

import { spend } from "./character";
import {
  DELIVERY_HOURS,
  DELIVERY_NEXT_DAY_MINUTE,
  DELIVERY_PRICE,
  MINUTES_PER_HOUR,
  PRODUCTS,
  START_SUPPLIES,
  UTILITIES_BASE,
} from "./config";
import { emit, endGame } from "./events";
import { SURFACE_IDS } from "./home";
import { absoluteMinute } from "./time";
import type { Delivery, GameState, Home, Product, Quality, UtilitiesReport } from "./types";

/** Із запасів спершу береться дороге. */
const TAKE_ORDER: readonly Quality[] = ["premium", "cheap"];

export function newHome(): Home {
  return {
    supplies: structuredClone(START_SUPPLIES),
    stove: { item: null, minutes: 0 },
    surfaces: Object.fromEntries(SURFACE_IDS.map((id) => [id, null])),
    deliveries: [],
    porch: [],
    utilitiesDebt: 0,
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

/** Замовити доставку; null, якщо не вистачає грошей. Пакунок прибуде через 6 годин. */
export function order(state: GameState, product: Product, quality: Quality): Delivery | null {
  if (state.end !== null) return null;
  const price = deliveryPrice(product, quality);
  if (!spend(state, price)) return null;
  const delivery: Delivery = {
    id: state.nextId++,
    product,
    quality,
    at: absoluteMinute(state.day, state.minute) + DELIVERY_HOURS * MINUTES_PER_HOUR,
  };
  state.home.deliveries.push(delivery);
  emit(state, { type: "ordered", delivery, price });
  return delivery;
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
  for (const { product, quality } of received) home.supplies[product][quality] += PRODUCTS[product].units;
  if (received.length > 0) emit(state, { type: "received", deliveries: received });
  return received;
}

/** Персонаж ліг спати: пакунки, що мали прибути вночі, привезуть о 09:00 наступного дня. */
export function postponeDeliveries(state: GameState): void {
  const morning = absoluteMinute(state.day + 1, DELIVERY_NEXT_DAY_MINUTE);
  for (const delivery of state.home.deliveries) delivery.at = Math.max(delivery.at, morning);
}

/** Комунальні за тиждень: базова сума; внесок речей додасть крок 9 плану. */
export function utilitiesDue(_state: GameState): number {
  return UTILITIES_BASE;
}

/**
 * Сплатити комунальні в ніч на понеділок (§6.4). Неоплачений тиждень — попередження;
 * з попередженням треба сплатити два тижні, хоча б один, інакше — виселення.
 */
export function payUtilities(state: GameState): UtilitiesReport {
  const home = state.home;
  const due = utilitiesDue(state);
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
