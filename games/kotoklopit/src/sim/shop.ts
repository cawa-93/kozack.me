// Універсальний магазин (§6.4): один каталог запасів і речей, кошик із кількістю, оплата цілком.
// Той самий кошик — доставкою з телефона чи на місці в поїздці.

import { PRODUCTS, SHOP_TOYS_PER_ORDER, STORAGE_LIMITS } from "./config";
import { buyAtShop, GOODS, goodsKey, shopPrice, type Goods } from "./destinations";
import { deliveryPrice, freeSlots, incoming, order, orderThing, supplyCount, thingDeliveryPrice } from "./economy";
import { priceFactor } from "./modifiers";
import type { GameState, Quality } from "./types";

export { GOODS, goodsKey, type Goods };

/** Доставка з телефона чи покупка на місці. */
export type ShopMode = "delivery" | "store";

export interface CartLine {
  goods: Goods;
  quality: Quality;
  count: number;
}

export function unitPrice(state: GameState, goods: Goods, quality: Quality, mode: ShopMode): number {
  if (mode === "store") return shopPrice(state, goods, quality);
  return "product" in goods ? deliveryPrice(goods.product, quality, priceFactor(state, goods.product)) : thingDeliveryPrice(goods.thing, quality);
}

const same = (a: Goods, b: Goods): boolean => goodsKey(a) === goodsKey(b);

/**
 * Скільки ще штук цього товару й якості влізе вдома, з урахуванням решти кошика: запаси — у ліміт
 * сховища (і з тим, що вже їде), речі — на вільні місця.
 */
export function room(state: GameState, cart: readonly CartLine[], goods: Goods, quality: Quality): number {
  const others = cart.filter((l) => same(l.goods, goods) && l.quality !== quality);
  if ("product" in goods) {
    const { product } = goods;
    const units = PRODUCTS[product].units;
    const taken = supplyCount(state, product) + incoming(state, product) + others.reduce((sum, l) => sum + l.count * units[l.quality], 0);
    return Math.max(0, Math.floor((STORAGE_LIMITS[product] - taken) / units[quality]));
  }
  const used = others.reduce((sum, l) => sum + l.count, 0);
  const free = goods.thing === "toy" ? SHOP_TOYS_PER_ORDER : freeSlots(state, goods.thing);
  return Math.max(0, free - used);
}

export function cartTotal(state: GameState, cart: readonly CartLine[], mode: ShopMode): number {
  return cart.reduce((sum, l) => sum + l.count * unitPrice(state, l.goods, l.quality, mode), 0);
}

/** Кошик можна оплатити: усе вміщується й грошей досить. */
export function canCheckout(state: GameState, cart: readonly CartLine[], mode: ShopMode): boolean {
  if (state.end !== null || (mode === "store" && state.trip?.destination !== "shop")) return false;
  const lines = cart.filter((l) => l.count > 0);
  if (lines.length === 0) return false;
  if (lines.some((l) => l.count > room(state, cart, l.goods, l.quality))) return false;
  return cartTotal(state, lines, mode) <= state.character.money;
}

/** Оплатити кошик цілком: доставкою — окремими пакунками, у магазині — одразу вдома. */
export function checkout(state: GameState, cart: readonly CartLine[], mode: ShopMode): boolean {
  if (!canCheckout(state, cart, mode)) return false;
  for (const line of cart) {
    for (let i = 0; i < line.count; i++) {
      if (mode === "store") buyAtShop(state, line.goods, line.quality);
      else if ("product" in line.goods) order(state, line.goods.product, line.quality);
      else orderThing(state, line.goods.thing, line.quality);
    }
  }
  return true;
}
