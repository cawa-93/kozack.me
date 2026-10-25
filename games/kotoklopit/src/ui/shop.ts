// Універсальний магазин (§6.4): один каталог запасів і речей, кількість кнопками «−» і «+», разом
// до сплати й одна кнопка. Той самий компонент — у телефоні (доставка) і в поїздці (на місці).

import { FEEDER_CAPACITY, PRODUCTS } from "../sim/config";
import { shopModifier } from "../sim/destinations";
import { incoming, supplyCount } from "../sim/economy";
import { canCheckout, cartDelivery, cartTotal, GOODS, goodsKey, goodsTotal, room, unavailable, unitPrice, type CartLine, type Goods, type ShopMode, type Unavailable } from "../sim/shop";
import type { GameState, Quality } from "../sim/types";
import { drawGlyphs } from "./glyphs";
import { element } from "./overlay";
import { PRODUCT_TITLES, THING_TITLES, VARIANT_TITLES } from "./titles";


function goodsName(goods: Goods): string {
  return "product" in goods ? PRODUCT_TITLES[goods.product].name : THING_TITLES[goods.thing];
}

/**
 * Магазин відкривається поступово (§11.3а): корм для стерилізованих — коли є стерилізований кіт
 * чи такий корм уже бував удома, дзвіночок — коли є нашийник (на коті чи в запасі), котяча м'ята — коли вдома є кіт.
 */
function offered(state: GameState, goods: Goods): boolean {
  if (!("product" in goods)) return true;
  const acquired = state.home.acquired.includes(goods.product);
  if (goods.product === "sterileFood") return acquired || state.cats.some((c) => c.sterilized);
  if (goods.product === "bell") return acquired || supplyCount(state, "collar") > 0 || state.cats.some((c) => c.collar !== null);
  // Котяча м'ята — коли вдома вже є кіт (§9.12).
  if (goods.product === "catnip") return acquired || state.cats.length > 0;
  return true;
}

/** Чому товар не взяти — коротким підписом у рядку (§6.4). */
const UNAVAILABLE: Record<Unavailable, string> = {
  boxes: "у ящиках",
  "no-room": "немає місця",
  "no-bowl": "немає миски без годівниці",
  owned: "уже є",
  ordered: "уже їде",
};

/**
 * Під назвою товару (§6.4, правка автора 2026-10-23): скільки його вже їде (з тим, що чекає під
 * дверима), і чому його не взяти. Скільки вдома — не показуємо: це видно зі сховищ.
 */
function stockText(state: GameState, goods: Goods): string {
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
  const reason = unavailable(state, goods);
  // «Уже їде» дублював би 🚗.
  if (reason !== null && reason !== "ordered") parts.push(UNAVAILABLE[reason]);
  return parts.join(" · ");
}

/** Розмір упаковки для запасу («7 чисток лотка»), а для автогодівниці — скільки корму вміщує (§9.12). */
function packText(goods: Goods, quality: Quality): string {
  if ("thing" in goods && goods.thing === "feeder") return ` · ${PRODUCT_TITLES.catFood.unit(FEEDER_CAPACITY[quality])}`;
  if (!("product" in goods)) return "";
  const units = PRODUCTS[goods.product].units;
  return ` · ${PRODUCT_TITLES[goods.product].unit(units[quality])}`;
}

/**
 * Каталог із кошиком. `onCheckout` отримує кошик, лише коли його можна оплатити (§6.4): усе
 * вміщується вдома й грошей досить.
 */
export function shopCatalog(state: GameState, mode: ShopMode, onCheckout: (cart: CartLine[]) => void): HTMLElement {
  const cart: CartLine[] = [];
  const box = element("div", "shop");
  const updaters: (() => void)[] = [];
  const total = element("span", "shop-total");
  const verb = mode === "store" ? "Купити" : "Замовити";
  const pay = element("button", "button primary", verb);
  const update = (): void => {
    for (const u of updaters) u();
    const sum = cartTotal(state, cart, mode);
    // Ціни в каталозі базові; доставка — окремим підписом (§6.4): 10% бази й надбавка, раз на кошик.
    const filled = cart.filter((l) => l.count > 0);
    const delivery = mode === "delivery" ? ` · 🚗 доставка ${cartDelivery(state, filled, mode)} ₴` : "";
    total.textContent = `🛒 ${goodsTotal(state, filled, mode)} ₴${delivery} · 👛 ${Math.floor(state.character.money)} ₴`;
    drawGlyphs(total);
    pay.textContent = sum > 0 ? `${verb} · ${sum} ₴` : verb;
    total.classList.toggle("short", sum > state.character.money);
    pay.disabled = !canCheckout(state, cart, mode);
  };

  const section = (title: string, goods: readonly Goods[]): void => {
    box.append(element("p", "shop-section", title));
    for (const g of goods) {
      const row = element("div", "shop-item");
      const name = element("span", "shop-name", goodsName(g));
      const stock = [stockText(state, g)];
      if (mode === "store") {
        // Ціна сьогодні нижча чи вища — стрілкою, без слів «дешевше» й «дорожче» (§11.4); на скільки й чому — ні (§11.3а).
        const mod = shopModifier(state, g);
        if (Math.abs(mod) >= 0.005) stock.push(mod < 0 ? "₴↓" : "₴↑");
      }
      const text = stock.filter((s) => s !== "").join(" · ");
      if (text !== "") name.append(element("span", "shop-stock", text));
      row.append(name);
      for (const quality of ["cheap", "premium"] as const) {
        const line: CartLine = { goods: g, quality, count: 0 };
        cart.push(line);
        const price = unitPrice(state, g, quality, mode);
        const label = element("span", "shop-option", `${VARIANT_TITLES[goodsKey(g)]?.[quality] ?? quality}${packText(g, quality)} — ${price} ₴`);
        const minus = element("button", "button step", "−");
        const count = element("span", "shop-count", "0");
        const plus = element("button", "button step", "+");
        minus.addEventListener("click", () => {
          line.count = Math.max(0, line.count - 1);
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
          label.classList.toggle("muted", space === 0 && line.count === 0);
        });
        const option = element("div", "shop-line");
        option.append(label, minus, count, plus);
        row.append(option);
      }
      box.append(row);
    }
  };
  const shown = GOODS.filter((g) => offered(state, g));
  section("Запаси", shown.filter((g) => "product" in g));
  section("Речі", shown.filter((g) => "thing" in g));

  pay.addEventListener("click", () => {
    if (canCheckout(state, cart, mode)) onCheckout(cart.filter((l) => l.count > 0));
  });
  // Підсумок і оплата — угорі й закріплені: кнопки картки внизу не заступають їх на телефоні.
  const footer = element("div", "shop-footer");
  footer.append(total, pay);
  box.prepend(footer);
  update();
  return box;
}

