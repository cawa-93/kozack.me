// Універсальний магазин (§6.4): один каталог запасів і речей, кількість кнопками «−» і «+», а внизу картки — смуга кошика: сума,
// гроші, «Очистити» й одна головна кнопка (рішення автора 2026-11-03, «Бірка знижки й кошик унизу»). Той самий компонент — у
// телефоні (доставка) і на місці: у магазині, а ліки — у ветеринара й лікаря (§8.5).

import { FEEDER_CAPACITY, PRODUCTS } from "../sim/config";
import { incoming } from "../sim/economy";
import { canCheckout, cartDelivery, cartTotal, catalog, discount, fitCart, goodsKey, goodsTotal, room, unavailable, unitPrice, variants, type CartLine, type Goods, type ShopMode, type Unavailable } from "../sim/shop";
import type { GameState, Quality } from "../sim/types";
import type { IconName } from "../view/iconnames";
import { PRODUCT_ICONS, THING_ICONS } from "../view/symbols";
import { drawGlyphs } from "./glyphs";
import { named } from "./icons";
import { element } from "./overlay";
import { PRODUCT_TITLES, THING_TITLES, VARIANT_TITLES } from "./titles";


function goodsName(goods: Goods): string {
  return "product" in goods ? PRODUCT_TITLES[goods.product].name : THING_TITLES[goods.thing];
}

/**
 * Іконка товару біля його назви (§11.4 «Іконка біля назви», рішення автора 2026-11-02): запас — та сама, що над сховищем, у
 * думці персонажа й на кнопці телефона, коли запас скінчився (`PRODUCT_ICONS`), річ — іконка самої речі (`THING_ICONS`).
 */
export function goodsIcon(goods: Goods): IconName {
  return "product" in goods ? PRODUCT_ICONS[goods.product] : THING_ICONS[goods.thing];
}

/** Назва товару з іконкою перед нею — так, як її показує рядок магазину (`icons.ts`). */
export const goodsLabel = (goods: Goods): string => named(goodsIcon(goods), goodsName(goods));

/** Чому товар не взяти — коротким підписом у рядку (§6.4). */
const UNAVAILABLE: Record<Unavailable, string> = {
  boxes: "у ящиках",
  "no-room": "немає місця",
  "no-bowl": "немає миски без годівниці",
  owned: "уже є",
  ordered: "уже їде",
};

/** Кнопка «Очистити» — без тексту, лише іконка (гліф `⌫` → `ui/glyph/cart-clear`); назва — для підказки й читача екрана. */
export const CLEAR_CART = "Очистити кошик";

/**
 * Під назвою товару (§6.4, правка автора 2026-10-23): скільки його вже їде (з тим, що чекає під
 * дверима), і чому його не взяти — з урахуванням кошика (миска в кошику дає місце автогодівниці, §9.12).
 * Скільки вдома — не показуємо: це видно зі сховищ.
 */
function stockText(state: GameState, goods: Goods, cart: readonly CartLine[]): string {
  const parts: string[] = [];
  const home = state.home;
  const packages = [...home.deliveries, ...home.porch];
  if ("product" in goods) {
    const coming = incoming(state, goods.product);
    if (coming > 0) parts.push(`🚗 ${PRODUCT_TITLES[goods.product].unit(coming)}`);
  } else {
    const coming = packages.filter((d) => "thing" in d && d.thing === goods.thing).length;
    if (coming > 0) parts.push(`🚗 ×${coming}`);
  }
  const reason = unavailable(state, goods, cart);
  // «Уже їде» дублював би 🚗.
  if (reason !== null && reason !== "ordered") parts.push(UNAVAILABLE[reason]);
  return parts.join(" · ");
}

/**
 * Скільки в упаковці — «×15» (рішення автора 2026-11-03: «Замість "15 душів - 15 ₴" писати щось накшталт "х15 - 15 ₴"»); штучне
 * (нашийник) — нічого. Автогодівниця — скільки корму вміщує (§9.12): іконка корму й число, як індикатор сховища.
 */
export function packText(goods: Goods, quality: Quality): string {
  if ("thing" in goods) return goods.thing === "feeder" ? named(PRODUCT_ICONS.catFood, String(FEEDER_CAPACITY[quality])) : "";
  const units = PRODUCTS[goods.product].units[quality];
  return units > 1 ? `×${units}` : "";
}

/** Бірка знижки «−X%» (§6.4; рішення автора 2026-11-03): червоний цінник із отвором (`art/ui/tag.svg`), трохи навскіс. */
function priceTag(percent: number): HTMLElement {
  return element("span", "price-tag", `−${percent}%`);
}

/** Розділи каталогу: на місці у ветеринара й лікаря продають лише ліки (§8.5) — «Ліки», деінде — «Запаси» й «Речі». */
function sections(state: GameState, mode: ShopMode, goods: readonly Goods[]): { title: string; goods: Goods[] }[] {
  const supplies = goods.filter((g) => "product" in g);
  const medsOnly = mode === "store" && state.trip?.destination !== "shop";
  return [
    { title: medsOnly ? "Ліки" : "Запаси", goods: supplies },
    { title: "Речі", goods: goods.filter((g) => "thing" in g) },
  ];
}

export interface CatalogOptions {
  /** Оплатити кошик (§6.4): на місці — купити, у телефоні — замовити доставку. Отримує лише непорожні рядки й лише тоді, коли кошик можна оплатити. */
  checkout: (cart: CartLine[]) => void;
  /** На місці (§8.5): «Додому» — головна кнопка смуги, доки кошик порожній. У телефоні її немає. */
  home?: () => void;
  /**
   * Кошик, що переживає оновлення картки (`goodsKey:якість` → кількість): у ветеринара послуга (огляд, лікування) оновлює картку,
   * і покладене до неї в кошик не зникає (§8.5, рішення виконавця 2026-11-03).
   */
  kept?: Map<string, number>;
}

export interface Catalog {
  /** Розділи з товарами — у тіло картки. */
  list: HTMLElement;
  /** Смуга кошика — внизу картки (`Card.bar`). */
  bar: HTMLElement;
  /** Скільки товарів каталогу сьогодні з біркою знижки — для примітки біля заголовка (§8.5). */
  discounted: number;
}

const lineKey = (line: CartLine): string => `${goodsKey(line.goods)}:${line.quality}`;

/**
 * Каталог із кошиком (§6.4): товари — у `list`, смуга кошика — у `bar`. Головна кнопка смуги на місці — «Додому», доки кошик
 * порожній, і «Купити · N ₴», щойно в ньому щось є (рішення автора 2026-11-03); у телефоні — «Замовити». `checkout` отримує
 * кошик, лише коли його можна оплатити: усе вміщується вдома й грошей досить.
 */
export function shopCatalog(state: GameState, mode: ShopMode, options: CatalogOptions): Catalog {
  const cart: CartLine[] = [];
  const list = element("div", "shop");
  const updaters: (() => void)[] = [];
  const kept = options.kept;
  const remember = (): void => {
    if (!kept) return;
    kept.clear();
    for (const line of cart) if (line.count > 0) kept.set(lineKey(line), line.count);
  };

  const shown = catalog(state, mode);
  let discounted = 0;
  for (const section of sections(state, mode, shown)) {
    // До першого кота речей у магазині немає (§11.3а) — і заголовка без рядків теж.
    if (section.goods.length === 0) continue;
    list.append(element("p", "shop-section", section.title));
    for (const g of section.goods) {
      const item = element("div", "shop-item");
      const head = element("div", "shop-head");
      const name = element("span", "shop-name", goodsLabel(g));
      // Підпис оновлюється з кошиком: миска в кошику знімає «немає миски без годівниці» (§9.12).
      const stock = element("span", "shop-stock");
      name.append(stock);
      updaters.push(() => {
        const text = stockText(state, g, cart);
        stock.textContent = text;
        stock.style.display = text === "" ? "none" : "";
      });
      head.append(name);
      // Знижка — біркою праворуч від назви; подорожчання — нічим (рішення автора 2026-11-03).
      const off = discount(state, g, mode);
      if (off > 0) {
        head.append(priceTag(off));
        discounted += 1;
      }
      item.append(head);
      // Нашийник — один варіант (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А17), решта — два.
      for (const quality of variants(g)) {
        const line: CartLine = { goods: g, quality, count: kept?.get(`${goodsKey(g)}:${quality}`) ?? 0 };
        cart.push(line);
        const label = element("span", "shop-option", VARIANT_TITLES[goodsKey(g)]?.[quality] ?? quality);
        const pack = packText(g, quality);
        if (pack !== "") label.append(" ", element("span", "shop-pack", pack));
        const price = element("span", "shop-price", `${unitPrice(state, g, quality, mode)} ₴`);
        const minus = element("button", "button step", "−");
        const count = element("span", "shop-count", "0");
        const plus = element("button", "button step", "+");
        const option = element("div", "shop-line");
        option.append(label, price, minus, count, plus);
        minus.addEventListener("click", () => {
          line.count = Math.max(0, line.count - 1);
          // Забрали миску — автогодівниця, якій вона давала місце, теж виходить з кошика (§9.12).
          fitCart(state, cart);
          update();
        });
        plus.addEventListener("click", () => {
          if (line.count < room(state, cart, g, quality)) line.count += 1;
          update();
        });
        updaters.push(() => {
          const space = room(state, cart, g, quality);
          count.textContent = String(line.count);
          minus.disabled = line.count === 0;
          plus.disabled = line.count >= space || state.end !== null;
          option.classList.toggle("muted", space === 0 && line.count === 0);
          option.classList.toggle("chosen", line.count > 0);
        });
        item.append(option);
      }
      list.append(item);
    }
  }
  // Збережений кошик — лише те, що й досі вміщується (§6.4).
  fitCart(state, cart);

  // Смуга кошика внизу (рішення автора 2026-11-03): суми — у заглибленому віконці, праворуч «Очистити» й головна кнопка.
  const bar = element("div", "shop-bar");
  const sums = element("div", "shop-sums");
  const total = element("span", "shop-total");
  const money = element("span", "shop-money", `👛 ${Math.floor(state.character.money)} ₴`);
  drawGlyphs(money);
  sums.append(total, money);
  const clear = element("button", "button shop-clear", "⌫");
  clear.title = CLEAR_CART;
  clear.setAttribute("aria-label", CLEAR_CART);
  drawGlyphs(clear);
  const verb = mode === "store" ? "Купити" : "Замовити";
  const pay = element("button", "button primary shop-pay", verb);
  bar.append(sums, clear, pay);

  const filled = (): CartLine[] => cart.filter((l) => l.count > 0);
  function update(): void {
    for (const u of updaters) u();
    remember();
    const lines = filled();
    const sum = cartTotal(state, cart, mode);
    // Ціни в каталозі — без доставки; доставка — окремо в смузі (§6.4): 10% бази й надбавка, раз на кошик.
    const delivery = mode === "delivery" ? ` · 🚗 доставка ${cartDelivery(state, lines, mode)} ₴` : "";
    total.textContent = `🛒 ${goodsTotal(state, lines, mode)} ₴${delivery}`;
    drawGlyphs(total);
    total.classList.toggle("short", sum > state.character.money);
    clear.disabled = lines.length === 0;
    const home = lines.length === 0 && options.home !== undefined;
    // «Додому» — лише з порожнім кошиком; з непорожнім на її місці «Купити» (рішення автора 2026-11-03).
    pay.textContent = home ? "Додому" : sum > 0 ? `${verb} · ${sum} ₴` : verb;
    pay.disabled = !home && !canCheckout(state, cart, mode);
  }

  clear.addEventListener("click", () => {
    for (const line of cart) line.count = 0;
    update();
  });
  pay.addEventListener("click", () => {
    const lines = filled();
    if (lines.length === 0) options.home?.();
    else if (canCheckout(state, cart, mode)) options.checkout(lines);
  });
  update();
  return { list, bar, discounted };
}
