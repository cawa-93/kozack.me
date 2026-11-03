// Універсальний магазин (§6.4): один каталог запасів і речей, кошик із кількістю, оплата цілком.
// Той самий кошик — доставкою з телефона чи на місці в поїздці: у магазині, а ліки — у ветеринара й лікаря (§8.5).

import { hadCat, spend } from "./character";
import { PRODUCTS, SELF_PRODUCTS, SHOP_TOYS_PER_ORDER, SINGLE_VARIANT, THINGS } from "./config";
import { GOODS, goodsKey, purchase, shopModifier, shopPrice, soldHere, type Goods } from "./destinations";
import { canOrderProduct, deliveryCost, dispatch, feederRoom, freeSlots, isAppliance, ownsThing, productPrice } from "./economy";
import { priceFactor } from "./modifiers";
import type { GameState, Quality, ThingKind } from "./types";

export { GOODS, goodsKey, type Goods };

/**
 * Чи показує магазин товар (§11.3а, гра відкривається поступово). Поки в домі ще жодного разу не було кота, — лише запаси для себе
 * (`SELF_PRODUCTS`): котячих запасів і речей не видно (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, дрібні питання — «Котячі
 * товари»; раніше до першого кота ховалися лише м'ята, дзвіночок і корм для стерилізованих). Далі ховається лише марне без умови:
 * корм для стерилізованих — доки немає стерилізованого кота (дзвіночка, що ховався до першого нашийника, більше немає — рішення
 * автора 2026-10-29, `GENERAL_REVIEW.md`, А17). Запас, що вже бував удома, лишається в магазині назавжди.
 */
export function offered(state: GameState, goods: Goods): boolean {
  if (!("product" in goods)) return hadCat(state);
  const { product } = goods;
  if (state.home.acquired.includes(product) || SELF_PRODUCTS.includes(product)) return true;
  if (!hadCat(state)) return false;
  if (product === "sterileFood") return state.cats.some((c) => c.sterilized);
  return true;
}

/**
 * Варіанти товару (§6.4): здебільшого два — дешевий і дорогий; нашийник один, без якостей (рішення автора 2026-10-29,
 * `GENERAL_REVIEW.md`, А17) — у магазині лише «дешевий».
 */
export function variants(goods: Goods): readonly Quality[] {
  return "product" in goods && SINGLE_VARIANT.includes(goods.product) ? ["cheap"] : ["cheap", "premium"];
}

/** Доставка з телефона чи покупка на місці. */
export type ShopMode = "delivery" | "store";

export interface CartLine {
  goods: Goods;
  quality: Quality;
  count: number;
}

/**
 * Що показує каталог (§6.4, §8.5): у телефоні — усе, що магазин уже показує (`offered`); на місці — лише те з цього, що
 * продають там, куди поїхали (`soldHere`: у ветеринара — ліки для котів, у лікаря — ліки для себе).
 */
export function catalog(state: GameState, mode: ShopMode): Goods[] {
  return GOODS.filter((g) => offered(state, g) && (mode === "delivery" || soldHere(state, g)));
}

/** Ціна штуки: у магазині — сьогоднішня, у телефоні — базова; доставка рахується окремо (§6.4). */
export function unitPrice(state: GameState, goods: Goods, quality: Quality, mode: ShopMode): number {
  if (mode === "store") return shopPrice(state, goods, quality);
  return "product" in goods ? productPrice(state, goods.product, quality) : THINGS[goods.thing].price[quality];
}

/** Звичайна ціна штуки (§6.4, таблиця «Ціни»): без модифікатора поїздки й без подій дня. */
export function regularPrice(goods: Goods, quality: Quality): number {
  return "product" in goods ? PRODUCTS[goods.product].price[quality] : THINGS[goods.thing].price[quality];
}

/**
 * Знижка варіанта товару сьогодні, у відсотках, — для бірки «−X%» на його картці (§6.4, «Бірка знижки й кошик унизу» і «Кожен
 * товар у своїй картці»; рішення автора 2026-11-03, правило — рішення виконавця): на скільки сьогоднішня ціна цього варіанта тут
 * нижча за звичайну (`regularPrice`), округлено до відсотка. У сьогоднішню ціну входять подія дня, що змінює ціну корму
 * (`priceFactor`), і на місці — модифікатор поїздки цього варіанта (`shopModifier`); у телефоні модифікатора поїздки немає. 0 —
 * бірки немає: подорожчання, знижка менше 1% чи ціна, округлена до гривні, не дешевша за звичайну. Якості, якої товар не має, —
 * теж 0.
 */
export function discount(state: GameState, goods: Goods, quality: Quality, mode: ShopMode): number {
  if (!variants(goods).includes(quality)) return 0;
  const day = "product" in goods ? priceFactor(state, goods.product) : 1;
  const factor = day * (mode === "store" ? 1 + shopModifier(state, goods, quality) : 1);
  const percent = Math.round((1 - factor) * 100);
  if (percent < 1) return 0;
  return unitPrice(state, goods, quality, mode) < regularPrice(goods, quality) ? percent : 0;
}

const same = (a: Goods, b: Goods): boolean => goodsKey(a) === goodsKey(b);

/** Скільки мисок (будь-якої якості) у кошику. */
const cartBowls = (cart: readonly CartLine[]): number => cart.reduce((sum, l) => sum + ("thing" in l.goods && l.goods.thing === "bowl" ? l.count : 0), 0);

/** Скільки речей цього типу вміститься разом із кошиком: автогодівниць — ще й над мисками з кошика (§9.12). */
function thingRoom(state: GameState, cart: readonly CartLine[], thing: ThingKind): number {
  if (thing === "toy") return SHOP_TOYS_PER_ORDER;
  return thing === "feeder" ? feederRoom(state, cartBowls(cart)) : freeSlots(state, thing);
}

/**
 * Скільки ще штук цього товару й якості можна взяти, з урахуванням решти кошика (§6.4): запасів —
 * скільки завгодно (зайве чекає в ящиках біля входу), але не того, що ще лежить у ящиках; речей —
 * не більше вільних місць (автогодівниць — і над мисками з цього кошика, §9.12). Якості, якої товар не має, — жодної.
 */
export function room(state: GameState, cart: readonly CartLine[], goods: Goods, quality: Quality): number {
  if (!variants(goods).includes(quality)) return 0;
  const others = cart.filter((l) => same(l.goods, goods) && l.quality !== quality);
  if ("product" in goods) return canOrderProduct(state, goods.product) ? Infinity : 0;
  const used = others.reduce((sum, l) => sum + l.count, 0);
  return Math.max(0, thingRoom(state, cart, goods.thing) - used);
}

/**
 * Кошик після зміни: штук, на які вже немає місця, менше (§6.4) — забрали з кошика миску, і автогодівниця над нею теж
 * виходить з кошика, а не лишає його неоплатним без пояснення (§9.12).
 */
export function fitCart(state: GameState, cart: CartLine[]): void {
  for (const line of cart) line.count = Math.min(line.count, room(state, cart, line.goods, line.quality));
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
/** Чому товар зараз не взяти (§6.4): запас ще в ящиках, немає місця, річ уже є чи вже їде; null — можна. */
export type Unavailable = "boxes" | "no-room" | "no-bowl" | "owned" | "ordered";

export function unavailable(state: GameState, goods: Goods, cart: readonly CartLine[] = []): Unavailable | null {
  if ("product" in goods) return canOrderProduct(state, goods.product) ? null : "boxes";
  const { thing } = goods;
  // Автогодівниці — з урахуванням мисок у кошику (§9.12).
  if (thingRoom(state, cart, thing) > 0) return null;
  if (thing === "carrier" || thing === "lock" || isAppliance(thing)) return ownsThing(state, thing) ? "owned" : "ordered";
  // Автогодівниця — одна на миску (§9.12).
  return thing === "feeder" ? "no-bowl" : "no-room";
}

export function cartTotal(state: GameState, cart: readonly CartLine[], mode: ShopMode): number {
  const lines = cart.filter((l) => l.count > 0);
  return lines.length === 0 ? 0 : goodsTotal(state, lines, mode) + cartDelivery(state, lines, mode);
}

/**
 * Кошик можна оплатити: усе вміщується й грошей досить. На місці — лише те, що тут продають (`soldHere`, §8.5): у магазині —
 * усе, у ветеринара — ліки для котів, у лікаря — ліки для себе.
 */
export function canCheckout(state: GameState, cart: readonly CartLine[], mode: ShopMode): boolean {
  if (state.end !== null) return false;
  const lines = cart.filter((l) => l.count > 0);
  if (lines.length === 0) return false;
  if (mode === "store" && lines.some((l) => !soldHere(state, l.goods))) return false;
  if (lines.some((l) => l.count > room(state, cart, l.goods, l.quality))) return false;
  return cartTotal(state, lines, mode) <= state.character.money;
}

/**
 * Оплатити кошик цілком: доставкою — одне замовлення (доставка — раз на весь кошик) окремими
 * пакунками, у магазині — одразу вдома.
 */
export function checkout(state: GameState, cart: readonly CartLine[], mode: ShopMode): boolean {
  if (!canCheckout(state, cart, mode)) return false;
  if (mode === "delivery" && !spend(state, cartDelivery(state, cart.filter((l) => l.count > 0), mode), "delivery")) return false;
  // Автогодівниці — після мисок: на місці годівниця стає над миской з цього ж кошика (§9.12).
  const feederLast = (l: CartLine): number => Number("thing" in l.goods && l.goods.thing === "feeder");
  for (const line of [...cart].sort((a, b) => feederLast(a) - feederLast(b))) {
    for (let i = 0; i < line.count; i++) {
      // Кошик уже перевірено: кілька упаковок одного запасу — усі в ящики.
      if (mode === "store") purchase(state, line.goods, line.quality);
      else dispatch(state, line.goods, line.quality, unitPrice(state, line.goods, line.quality, mode));
    }
  }
  return true;
}
