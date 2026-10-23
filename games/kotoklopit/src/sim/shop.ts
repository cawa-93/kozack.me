// Універсальний магазин (§6.4): один каталог запасів і речей, кошик із кількістю, оплата цілком.
// Той самий кошик — доставкою з телефона чи на місці в поїздці.

import { spend } from "./character";
import { PRODUCTS, SHOP_TOYS_PER_ORDER, STORAGE_LIMITS, THINGS } from "./config";
import { buyAtShop, GOODS, goodsKey, shopPrice, type Goods } from "./destinations";
import { deliveryCost, dispatch, freeSlots, incoming, productPrice, supplyCount } from "./economy";
import type { GameState, Quality } from "./types";

export { GOODS, goodsKey, type Goods };

/** Доставка з телефона чи покупка на місці. */
export type ShopMode = "delivery" | "store";

export interface CartLine {
  goods: Goods;
  quality: Quality;
  count: number;
}

/** Ціна штуки: у магазині — сьогоднішня, у телефоні — базова; доставка рахується окремо (§6.4). */
export function unitPrice(state: GameState, goods: Goods, quality: Quality, mode: ShopMode): number {
  if (mode === "store") return shopPrice(state, goods, quality);
  return "product" in goods ? productPrice(state, goods.product, quality) : THINGS[goods.thing].price[quality];
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

/** Скільки коштують товари кошика, без доставки. */
export function goodsTotal(state: GameState, cart: readonly CartLine[], mode: ShopMode): number {
  return cart.reduce((sum, l) => sum + l.count * unitPrice(state, l.goods, l.quality, mode), 0);
}

/** Вартість доставки кошика (§6.4): у магазині її немає; порожній кошик — лише надбавка. */
export function cartDelivery(state: GameState, cart: readonly CartLine[], mode: ShopMode): number {
  return mode === "delivery" ? deliveryCost(state, goodsTotal(state, cart, mode)) : 0;
}

/** Разом до сплати: товари й доставка. */
export function cartTotal(state: GameState, cart: readonly CartLine[], mode: ShopMode): number {
  const lines = cart.filter((l) => l.count > 0);
  return lines.length === 0 ? 0 : goodsTotal(state, lines, mode) + cartDelivery(state, lines, mode);
}

/** Кошик можна оплатити: усе вміщується й грошей досить. */
export function canCheckout(state: GameState, cart: readonly CartLine[], mode: ShopMode): boolean {
  if (state.end !== null || (mode === "store" && state.trip?.destination !== "shop")) return false;
  const lines = cart.filter((l) => l.count > 0);
  if (lines.length === 0) return false;
  if (lines.some((l) => l.count > room(state, cart, l.goods, l.quality))) return false;
  return cartTotal(state, lines, mode) <= state.character.money;
}

/**
 * Оплатити кошик цілком: доставкою — одне замовлення (доставка — раз на весь кошик) окремими
 * пакунками, у магазині — одразу вдома.
 */
export function checkout(state: GameState, cart: readonly CartLine[], mode: ShopMode): boolean {
  if (!canCheckout(state, cart, mode)) return false;
  if (mode === "delivery" && !spend(state, cartDelivery(state, cart.filter((l) => l.count > 0), mode))) return false;
  for (const line of cart) {
    for (let i = 0; i < line.count; i++) {
      if (mode === "store") buyAtShop(state, line.goods, line.quality);
      else dispatch(state, line.goods, line.quality, unitPrice(state, line.goods, line.quality, mode));
    }
  }
  return true;
}
