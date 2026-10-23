// Універсальний магазин (§6.4): один каталог запасів і речей, кількість кнопками «−» і «+», разом
// до сплати й одна кнопка. Той самий компонент — у телефоні (доставка) і в поїздці (на місці).

import { PRODUCTS } from "../sim/config";
import { shopModifier } from "../sim/destinations";
import { supplyCount } from "../sim/economy";
import { canCheckout, cartDelivery, cartTotal, GOODS, goodsKey, goodsTotal, room, unitPrice, type CartLine, type Goods, type ShopMode } from "../sim/shop";
import type { GameState, Quality } from "../sim/types";
import { drawGlyphs } from "./glyphs";
import { element } from "./overlay";
import { PRODUCT_TITLES, THING_TITLES, VARIANT_TITLES } from "./titles";


function goodsName(goods: Goods): string {
  return "product" in goods ? PRODUCT_TITLES[goods.product].name : THING_TITLES[goods.thing];
}

/**
 * Магазин відкривається поступово (§11.3а): корм для стерилізованих — коли є стерилізований кіт
 * чи такий корм уже бував удома, дзвіночок — коли є нашийник (на коті чи в запасі).
 */
function offered(state: GameState, goods: Goods): boolean {
  if (!("product" in goods)) return true;
  const acquired = state.home.acquired.includes(goods.product);
  if (goods.product === "sterileFood") return acquired || state.cats.some((c) => c.sterilized);
  if (goods.product === "bell") return acquired || supplyCount(state, "collar") > 0 || state.cats.some((c) => c.collar !== null);
  return true;
}

/** Що вже є вдома: запас — кількість і ліміт сховища видно в телефоні й так; річ — скільки штук. */
function stockText(state: GameState, goods: Goods): string {
  if ("product" in goods) return `🏠 ${PRODUCT_TITLES[goods.product].unit(supplyCount(state, goods.product))}`;
  const { thing } = goods;
  const home = state.home;
  const have = thing === "carrier" ? (home.carrier ? 1 : 0) : thing === "feeder" || thing === "fountain" || thing === "robot" ? (home.appliances[thing] ? 1 : 0) : home.items.filter((i) => i.kind === thing).length;
  return `🏠 ×${have}`;
}

/** Розмір упаковки для запасу, якщо дешева й дорога різні («7 чисток лотка»). */
function packText(goods: Goods, quality: Quality): string {
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
      let stock = stockText(state, g);
      if (mode === "store") {
        // Ціна сьогодні нижча чи вища — стрілкою, без слів «дешевше» й «дорожче» (§11.4); на скільки й чому — ні (§11.3а).
        const mod = shopModifier(state, g);
        if (Math.abs(mod) >= 0.005) stock += mod < 0 ? " · ₴↓" : " · ₴↑";
      }
      name.append(element("span", "shop-stock", stock));
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

