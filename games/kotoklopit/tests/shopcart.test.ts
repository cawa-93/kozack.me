// Каталог і кошик унизу (GAME_DESIGN §6.4, «Бірка знижки й кошик унизу» і «Кожен товар у своїй картці»; §8.5, «Ліки у
// ветеринара й лікаря» і «Картки поїздок без «Поїздка»»; рішення автора 2026-11-03): кожен варіант — своя картка без назви
// товару й «×N»; бірка «−X%» — лише на знижці, на картці варіанта, рядка зі стрілкою немає; головна кнопка смуги на місці —
// «Додому» з порожнім кошиком і «Купити» з непорожнім (сума — у віконці поруч); «Очистити» — іконкою, лише з непорожнім кошиком;
// гроші — рівно один раз у картці.

import { readFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createCat } from "../src/sim/cat";
import { STORE_GOODS, TRIPS } from "../src/sim/config";
import { newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { catalog, checkout, discount, goodsKey, unitPrice, variants, type CartLine, type Goods } from "../src/sim/shop";
import { place } from "../src/sim/economy";
import type { Destination, GameState } from "../src/sim/types";
import { phoneCard, type PhoneHandlers } from "../src/ui/cards";
import { splitIcons } from "../src/ui/icons";
import type { Card } from "../src/ui/overlay";
import { BOUGHT, BOUGHT_PAUSE_MS, CLEAR_CART, goodsIcon, shopCatalog, suppliesTitle, variantLabel, variantTitle } from "../src/ui/shop";
import { PRODUCT_TITLES, plural, STORE_SECTION_TITLES } from "../src/ui/titles";
import { iconMark } from "../src/ui/icons";
import { destinationCard, visitCard, type VisitHandlers } from "../src/ui/trips";

/**
 * Найпростіший DOM без браузера: елемент пам'ятає клас, текст, дітей, атрибути й обробники натискання, а `click()` викликає
 * їх, як браузер (вимкнену кнопку — ні).
 */
class FakeElement {
  className = "";
  disabled = false;
  title = "";
  hidden = false;
  readonly style: Record<string, string> = {};
  children: (FakeElement | string)[] = [];
  readonly attributes: Record<string, string> = {};
  private readonly listeners: (() => void)[] = [];
  private text = "";
  readonly classList = {
    toggle: (name: string, force?: boolean): boolean => {
      const set = new Set(this.className.split(" ").filter(Boolean));
      const on = force ?? !set.has(name);
      if (on) set.add(name);
      else set.delete(name);
      this.className = [...set].join(" ");
      return on;
    },
    add: (name: string): void => void this.classList.toggle(name, true),
    remove: (name: string): void => void this.classList.toggle(name, false),
    contains: (name: string): boolean => this.className.split(" ").includes(name),
  };

  constructor(readonly tagName: string) {}

  get textContent(): string {
    return this.text + this.children.map((c) => (typeof c === "string" ? c : c.textContent)).join("");
  }

  set textContent(value: string) {
    this.text = value;
    this.children = [];
  }

  append(...nodes: (FakeElement | string)[]): void {
    this.children.push(...nodes);
  }

  prepend(...nodes: (FakeElement | string)[]): void {
    this.children.unshift(...nodes);
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  addEventListener(type: string, listener: () => void): void {
    if (type === "click") this.listeners.push(listener);
  }

  click(): void {
    if (!this.disabled) for (const l of this.listeners) l();
  }

  /** Усі нащадки з класом. */
  findAll(className: string): FakeElement[] {
    const own = this.children.filter((c): c is FakeElement => typeof c !== "string");
    return own.flatMap((c) => [...(c.classList.contains(className) ? [c] : []), ...c.findAll(className)]);
  }

  find(className: string): FakeElement {
    const found = this.findAll(className)[0];
    if (!found) throw new Error(`немає .${className}`);
    return found;
  }

  querySelector(selector: string): FakeElement | null {
    return this.findAll(selector.replace(/^\./, ""))[0] ?? null;
  }
}

const fake = (el: HTMLElement | undefined): FakeElement => el as unknown as FakeElement;
/** Текст без позначок іконок — те, що прочитає гравець. */
const plain = (text: string): string => splitIcons(text).map((p) => (typeof p === "string" ? p : p.word)).join("");

beforeAll(() => {
  vi.stubGlobal("document", { createElement: (tag: string) => new FakeElement(tag), createTreeWalker: () => ({ nextNode: () => null }) });
  vi.stubGlobal("NodeFilter", { SHOW_TEXT: 4 });
});
afterAll(() => vi.unstubAllGlobals());

/** Гра з котом (магазин показує й котяче, §11.3а) і персонаж на місці в пункті `destination` (null — удома). */
function at(destination: Destination | null, seed = 5, money = 1000): GameState {
  const state = newGame({ address: "she", difficulty: "normal", seed: 8 }).current;
  state.modifiers.day = null;
  state.character.money = money;
  const cat = createCat(state, createRng(3), { source: "shelter", ageWeeks: 20, at: { x: 9.5, y: 8.5 } });
  addCat(state, cat);
  if (destination !== null) {
    state.trip = {
      destination,
      phase: "visit",
      cat: TRIPS[destination].cat ? cat.id : null,
      race: { road: 10, done: 10, minutes: 10, lane: 1, targetLane: 1, speed: 1, cars: [], spawned: 0, rng: 1 },
      losses: [],
      visit: 0,
      seed,
    };
  }
  return state;
}

/** Варіанти товарів по порядку каталогу: товар за товаром, дешевий, тоді дорогий. */
const variantsOf = (goods: readonly Goods[]): { goods: Goods; quality: CartLine["quality"] }[] => goods.flatMap((g) => variants(g).map((quality) => ({ goods: g, quality })));

/** Каталог із кошиком і що отримали обробники. */
function open(state: GameState, mode: "store" | "delivery", withHome = true) {
  const bought: CartLine[][] = [];
  let home = 0;
  const kept = new Map<string, number>();
  const shop = shopCatalog(state, mode, { checkout: (cart) => bought.push(cart), ...(withHome ? { home: () => (home += 1) } : {}), kept });
  const list = fake(shop.list);
  const bar = fake(shop.bar);
  return { shop, list, bar, bought, homes: () => home, kept, pay: bar.find("shop-pay"), clear: bar.find("shop-clear") };
}

describe("кожен товар у своїй картці (§6.4; рішення автора 2026-11-03)", () => {
  it("кожен варіант — окрема картка, по порядку: товар за товаром, дешевий, тоді дорогий; у нашийника — одна картка", () => {
    for (const mode of ["store", "delivery"] as const) {
      const state = mode === "store" ? at("shop", 2) : at(null);
      const { list } = open(state, mode, mode === "store");
      const items = list.findAll("shop-item");
      const shown = variantsOf(catalog(state, mode));
      expect(items, mode).toHaveLength(shown.length);
      // Карток товарів із кількома варіантами всередині більше немає.
      expect(list.findAll("shop-head"), mode).toEqual([]);
      expect(list.findAll("shop-line"), mode).toEqual([]);
      shown.forEach(({ goods: g, quality: q }, i) => {
        const item = items[i];
        const what = `${mode} ${goodsKey(g)} ${q}`;
        // Одна картка — одна назва, одна ціна, «−», кількість і «+».
        expect(item?.findAll("shop-name"), what).toHaveLength(1);
        expect(item?.findAll("shop-price"), what).toHaveLength(1);
        expect(item?.findAll("step"), what).toHaveLength(2);
        expect(item?.findAll("shop-count"), what).toHaveLength(1);
        expect(item?.find("shop-price").textContent, what).toBe(`${unitPrice(state, g, q, mode)}\u00a0₴`);
        // Нашийник — одна картка (один варіант): у двох колонках наступний товар — з нового рядка (`.single`).
        expect(item?.classList.contains("single"), what).toBe(variants(g).length === 1);
      });
      expect(items.filter((i) => i.classList.contains("single")).length, mode).toBe(shown.filter(({ goods: g }) => variants(g).length === 1).length);
    }
  });

  it("у картці — іконка товару й назва варіанта, без назви товару й без «×N» (скільки в упаковці, місткість автогодівниці)", () => {
    const state = at(null);
    const { list } = open(state, "delivery", false);
    const items = list.findAll("shop-item");
    const shown = variantsOf(catalog(state, "delivery"));
    shown.forEach(({ goods: g, quality: q }, i) => {
      const item = items[i];
      const what = `${goodsKey(g)} ${q}`;
      // Іконка — та сама, що була біля назви товару (§11.4), окремим стовпцем.
      expect(item?.find("shop-icon").textContent, what).toBe(iconMark(goodsIcon(g)));
      const name = item?.find("shop-name");
      const stock = name?.find("shop-stock").textContent ?? "";
      expect(name?.textContent, what).toBe(variantTitle(g, q) + stock);
      // Назви товару («Продукти», «Засоби гігієни»…) у картці немає: крім назви варіанта, там лише іконка, ціна й кнопки.
      if ("product" in g) expect(item?.textContent.replace(name?.textContent ?? "", ""), what).not.toContain(PRODUCT_TITLES[g.product].name);
    });
    // «×15», «×55», «×20» (автогодівниця) — ніде в каталозі.
    expect(list.textContent).not.toMatch(/×\s?\d/u);
    expect(list.findAll("shop-pack")).toEqual([]);
  });

  it("назва у два рядки не рветься на дефісі: слово через дефіс — цілим (.nowrap), рядки збалансовані (рецензія 2026-11-03)", () => {
    const state = at(null);
    const { list } = open(state, "delivery", false);
    const names = list.findAll("shop-item").map((i) => i.find("shop-name"));
    const robot = names.find((n) => n.textContent.startsWith(variantTitle({ thing: "robot" }, "cheap")));
    expect(robot?.findAll("nowrap").map((n) => n.textContent)).toEqual(["робот-пилосос"]);
    // Кожне слово з дефісом у будь-якій назві — у своєму .nowrap, і лише такі слова.
    for (const name of names) {
      const words = name.children.filter((c): c is FakeElement => typeof c !== "string" && c.classList.contains("nowrap")).map((c) => c.textContent);
      const title = name.textContent.replace(name.find("shop-stock").textContent, "");
      expect(words, title).toEqual(title.split(" ").filter((w) => w.includes("-")));
    }
    const css = readFileSync(new URL("../src/ui/overlay.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.shop-item \.shop-name \{[^}]*text-wrap: balance;/u);
    expect(css).toMatch(/\.nowrap \{\s*white-space: nowrap;/u);
  });

  it("підпис «🚗 …» — під тим варіантом, що справді їде, а не під обома", () => {
    const state = at(null);
    const catFood = { product: "catFood" } as const;
    expect(checkout(state, [{ goods: catFood, quality: "premium", count: 1 }, { goods: { thing: "toy" }, quality: "cheap", count: 2 }], "delivery")).toBe(true);
    const { list } = open(state, "delivery", false);
    const shown = variantsOf(catalog(state, "delivery"));
    const stockOf = (key: string, q: string): string => list.findAll("shop-item")[shown.findIndex((v) => goodsKey(v.goods) === key && v.quality === q)]?.find("shop-stock").textContent ?? "";
    expect(stockOf("catFood", "premium")).toBe("🚗 55 порцій");
    expect(stockOf("catFood", "cheap")).toBe("");
    expect(stockOf("thing:toy", "cheap")).toBe("🚗 2 шт.");
    expect(stockOf("thing:toy", "premium")).toBe("");
  });

  it("замок їде — картка дешевої «🚗 1 шт.», а сіра картка дорогої пояснює чому: «уже їде»", () => {
    const state = at(null);
    expect(checkout(state, [{ goods: { thing: "lock" }, quality: "cheap", count: 1 }], "delivery")).toBe(true);
    const { list } = open(state, "delivery", false);
    const shown = variantsOf(catalog(state, "delivery"));
    const card = (q: string): FakeElement | undefined => list.findAll("shop-item")[shown.findIndex((v) => goodsKey(v.goods) === "thing:lock" && v.quality === q)];
    expect(card("cheap")?.find("shop-stock").textContent).toBe("🚗 1 шт.");
    expect(card("premium")?.find("shop-stock").textContent).toBe("уже їде");
    expect([card("cheap"), card("premium")].map((c) => c?.classList.contains("muted"))).toEqual([true, true]);
  });
});

describe("бірка знижки замість стрілки (§6.4)", () => {
  it("бірка «−X%» — лише на картках варіантів зі знижкою (discount), подорожчання й «без змін» — нічого; стрілок «₴↓ / ₴↑» немає", () => {
    let tagged = 0;
    let untagged = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const state = at("shop", seed);
      const { list, shop } = open(state, "store");
      const lines = list.findAll("shop-item");
      const shown = variantsOf(catalog(state, "store"));
      expect(lines).toHaveLength(shown.length);
      shown.forEach(({ goods: g, quality: q }, i) => {
        const tags = lines[i]?.findAll("price-tag") ?? [];
        const x = discount(state, g, q, "store");
        if (x > 0) {
          expect(tags.map((t) => t.textContent), `${goodsKey(g)} ${q}`).toEqual([`−${x}%`]);
          tagged += 1;
        } else {
          expect(tags, `${goodsKey(g)} ${q}`).toEqual([]);
          untagged += 1;
        }
      });
      expect(shop.discounted).toBe(shown.filter(({ goods: g, quality: q }) => discount(state, g, q, "store") > 0).length);
      expect(list.textContent).not.toMatch(/₴↓|₴↑/u);
    }
    expect(tagged).toBeGreaterThan(0);
    expect(untagged).toBeGreaterThan(0);
  });

  it("бірка — між назвою й ціною; знижки двох варіантів одного товару бувають різні (як у прикладі автора: −29% і −3%)", () => {
    const pills = { product: "pills" } as const;
    const both = (s: number): number[] => (["cheap", "premium"] as const).map((q) => discount(at("vet", s), pills, q, "store"));
    let seed = 1;
    while (!(both(seed).every((x) => x > 0) && both(seed)[0] !== both(seed)[1])) seed += 1;
    const [cheap, premium] = both(seed);
    const { list, shop } = open(at("vet", seed), "store");
    const items = list.findAll("shop-item").slice(0, 2);
    expect(items.map((i) => i.find("price-tag").textContent)).toEqual([`−${cheap}%`, `−${premium}%`]);
    // Бірка й ціна — разом, після назви: «… −29% 11 ₴».
    for (const item of items) expect(item.find("shop-cost").children.map((c) => (typeof c === "string" ? c : c.className))).toEqual(["price-tag", "shop-price"]);
    expect(items[0]?.children.map((c) => (typeof c === "string" ? c : c.className))).toEqual(["shop-icon", "shop-name", "shop-cost", "button step", "shop-count", "button step"]);
    expect(shop.discounted).toBe(list.findAll("price-tag").length);
  });

  it("у телефоні звичайного дня бірок немає, а в «Акцію в зоомагазині» — на корм", () => {
    const state = at(null);
    expect(open(state, "delivery", false).list.findAll("price-tag")).toEqual([]);
    state.modifiers.day = "pet-sale";
    const tags = open(state, "delivery", false).list.findAll("price-tag");
    // Знижка дня — на обидва варіанти корму.
    expect(tags.map((t) => t.textContent)).toEqual(["−30%", "−30%"]);
  });

});

describe("смуга кошика внизу (§6.4)", () => {
  it("на місці: порожній кошик — «Додому» (поїхати); щось у кошику — «Купити» (купити), «Додому» немає; сума — лише у віконці", () => {
    const state = at("shop", 3);
    const { list, bar, pay, bought, homes } = open(state, "store");
    expect(pay.textContent).toBe("Додому");
    expect(bar.find("shop-total").textContent).toBe("🛒 0 ₴");
    expect(pay.disabled).toBe(false);
    expect(pay.classList.contains("primary")).toBe(true);
    const plus = list.findAll("step")[1];
    plus?.click();
    const goods = catalog(state, "store")[0];
    const price = goods ? unitPrice(state, goods, "cheap", "store") : 0;
    expect(pay.textContent).toBe("Купити");
    // Сума кошика — один раз, у віконці; доставки на місці немає (рецензія 2026-11-03).
    expect(bar.find("shop-total").textContent).toBe(`🛒 ${price} ₴`);
    expect(bar.textContent.split(`${price} ₴`)).toHaveLength(2);
    pay.click();
    expect(homes()).toBe(0);
    expect(bought).toHaveLength(1);
    expect(bought[0]?.map((l) => [goodsKey(l.goods), l.quality, l.count])).toEqual([[goods ? goodsKey(goods) : "", "cheap", 1]]);
    // Купили — картку оновить день; поки ні, кошик той самий. Мінус — і знову «Додому».
    list.findAll("step")[0]?.click();
    expect(pay.textContent).toBe("Додому");
    pay.click();
    expect(homes()).toBe(1);
  });

  it("варіант, якого не взяти («у ящиках»), — сіра картка: клас muted на картці, підпис — у ній, і CSS фарбує назву, ціну й іконку", () => {
    const state = at("shop", 3);
    const goods = catalog(state, "store")[0];
    if (!goods || !("product" in goods)) throw new Error("перший товар — запас");
    const before = open(state, "store").list.findAll("shop-item").slice(0, 2);
    expect(before.map((l) => l.classList.contains("muted"))).toEqual([false, false]);
    checkout(state, [{ goods, quality: "cheap", count: 1 }], "store");
    // У ящиках — запас, тож не взяти жодного з двох варіантів: обидві картки сірі, і в кожній — чому.
    const after = open(state, "store").list.findAll("shop-item").slice(0, 2);
    expect(after.map((i) => i.find("shop-stock").textContent)).toEqual(["у ящиках", "у ящиках"]);
    expect(after.map((l) => l.classList.contains("muted"))).toEqual([true, true]);
    const css = readFileSync(new URL("../src/ui/overlay.css", import.meta.url), "utf8");
    for (const part of ["shop-name", "shop-price", "shop-icon", "price-tag"]) expect(css.includes(`.shop-item.muted .${part}`), part).toBe(true);
  });

  it("варіант, місце якого займає інший варіант у кошику, — не сірий: лише «+» неактивний (рецензія 2026-11-03)", () => {
    const state = at(null);
    expect(state.home.lock).toBeUndefined();
    const { list } = open(state, "delivery", false);
    const shown = variantsOf(catalog(state, "delivery"));
    const items = list.findAll("shop-item");
    const card = (thing: string, quality: string): FakeElement | undefined =>
      items[shown.findIndex((v) => "thing" in v.goods && v.goods.thing === thing && v.quality === quality)];
    const cheap = card("lock", "cheap");
    const premium = card("lock", "premium");
    cheap?.findAll("step")[1]?.click();
    expect(cheap?.find("shop-count").textContent).toBe("1");
    // Замок — один: дорожчу вже не взяти, але не через те, що вдома, — картка не сіра й без підпису, лише «+» неактивний.
    expect(premium?.findAll("step")[1]?.disabled).toBe(true);
    expect(premium?.classList.contains("muted")).toBe(false);
    expect(premium?.find("shop-stock").textContent).toBe("");
    // Забрали з кошика — «+» знову активний.
    cheap?.findAll("step")[0]?.click();
    expect(premium?.findAll("step")[1]?.disabled).toBe(false);
    // Іграшок — п'ять за раз: п'ять дешевих — і дорожча так само не сіра.
    const toy = card("toy", "cheap");
    for (let i = 0; i < 6; i++) toy?.findAll("step")[1]?.click();
    expect(toy?.find("shop-count").textContent).toBe("5");
    expect(card("toy", "premium")?.findAll("step")[1]?.disabled).toBe(true);
    expect(card("toy", "premium")?.classList.contains("muted")).toBe(false);
  });

  it("грошей не вистачає — сума кошика червона, «Купити» неактивна, а «Додому» не з'являється", () => {
    const state = at("shop", 3, 5);
    const { list, bar, pay, homes } = open(state, "store");
    list.findAll("step")[1]?.click();
    expect(bar.find("shop-total").classList.contains("short")).toBe(true);
    expect(pay.textContent).toBe("Купити");
    expect(pay.disabled).toBe(true);
    pay.click();
    expect(homes()).toBe(0);
  });

  it("«Очистити» — іконкою (без тексту, з назвою для підказки й читача екрана), лише з непорожнім кошиком (з порожнім її немає); очищає все", () => {
    const state = at("shop", 4);
    const { list, bar, clear, pay, kept } = open(state, "store");
    expect(clear.textContent).toBe("⌫");
    expect(clear.title).toBe(CLEAR_CART);
    expect(clear.attributes["aria-label"]).toBe(CLEAR_CART);
    expect(clear.hidden).toBe(true);
    // Ліворуч у смузі, перед сумами, — якнайдалі від головної кнопки (рецензія 2026-11-03).
    expect(bar.children.map((c) => (typeof c === "string" ? c : c.className))).toEqual(["button shop-clear", "shop-sums", "button primary shop-pay"]);
    const steps = list.findAll("step");
    steps[1]?.click();
    steps[3]?.click();
    steps[3]?.click();
    expect(clear.hidden).toBe(false);
    expect(clear.disabled).toBe(false);
    expect(kept.size).toBe(2);
    clear.click();
    expect(list.findAll("shop-count").map((c) => c.textContent)).toEqual(list.findAll("shop-count").map(() => "0"));
    expect(clear.hidden).toBe(true);
    expect(pay.textContent).toBe("Додому");
    expect(kept.size).toBe(0);
  });

  it("у телефоні — «Замовити · N ₴» (з порожнім кошиком неактивна «Замовити»), без «Додому»; доставка — словом і лише з непорожнім кошиком; гроші — у смузі", () => {
    const state = at(null, 5, 300);
    const { list, bar, pay } = open(state, "delivery", false);
    expect(pay.textContent).toBe("Замовити");
    expect(pay.disabled).toBe(true);
    // Порожній кошик нічого не везе — і плати за доставку не видно (рецензія 2026-11-03).
    expect(bar.find("shop-total").textContent).toBe("🛒 0 ₴");
    expect(bar.find("shop-money").textContent).toBe("👛 300 ₴");
    list.findAll("step")[1]?.click();
    const total = bar.find("shop-total").textContent.match(/^🛒 (\d+) ₴ · 🚗 доставка (\d+) ₴$/u);
    expect(total).not.toBeNull();
    expect(pay.textContent).toBe(`Замовити · ${Number(total?.[1]) + Number(total?.[2])} ₴`);
    expect(pay.disabled).toBe(false);
  });

  it("кошик, що пережив оновлення картки (послуга у ветеринара), — ті самі кількості, доки вміщується", () => {
    const state = at("vet", 6);
    const first = open(state, "store");
    first.list.findAll("step")[3]?.click();
    expect([...first.kept.entries()]).toEqual([["pills:premium", 1]]);
    const again = shopCatalog(state, "store", { checkout: () => {}, home: () => {}, kept: first.kept });
    expect(fake(again.list).findAll("shop-count").map((c) => c.textContent)).toEqual(["0", "1", "0", "0"]);
    expect(fake(again.bar).find("shop-pay").textContent).toBe("Купити");
  });
});

describe("подвійний дотик «Купити» не везе додому (§6.4; рецензія 2026-11-03)", () => {
  const noop = (): void => {};
  /**
   * Картка пункту так, як її показує день (`DayScene.showVisit`): покупка — сим, кошик порожній, і картка одразу перебудовується
   * з `bought`; «Додому» рахує, скільки разів поїхали.
   */
  function visit(destination: Destination) {
    const state = at(destination, 3);
    const kept = new Map<string, number>();
    let homes = 0;
    let card: Card | null = null;
    const show = (bought: boolean): void => {
      const handlers: VisitHandlers = {
        checkout: (cart) => {
          checkout(state, cart, "store");
          kept.clear();
          show(true);
        },
        exam: noop, nextCat: noop, treat: noop, treatSelf: noop, adopt: noop, sterilize: noop, buyKitten: noop, groom: noop, show: noop,
        home: () => (homes += 1),
      };
      card = visitCard(state, { exam: null, done: [] }, handlers, { kept, bought });
    };
    show(false);
    const current = (): FakeElement => {
      const bar = card?.bar;
      if (!bar) throw new Error("немає смуги кошика");
      return fake(bar);
    };
    const list = (): FakeElement => fake(card?.body.find((b): b is HTMLElement => typeof b !== "string" && fake(b).findAll("shop-item").length > 0));
    const step = (i: number): FakeElement | undefined => list().findAll("step")[i];
    return { state, homes: () => homes, pay: () => current().find("shop-pay"), plus: (i: number) => step(i * 2 + 1)?.click(), minus: (i: number) => step(i * 2)?.click() };
  }

  it("два натискання поспіль: перше купує, друге влучає в неактивну «✓ Куплено» — візит триває; після паузи — «Додому»", () => {
    vi.useFakeTimers();
    try {
      for (const destination of ["shop", "vet", "doctor"] as const) {
        const v = visit(destination);
        const money = v.state.character.money;
        v.plus(0);
        expect(v.pay().textContent, destination).toMatch(/^Купити/u);
        v.pay().click();
        v.pay().click();
        expect(v.state.character.money, destination).toBeLessThan(money);
        expect(v.homes(), destination).toBe(0);
        expect(v.state.trip?.phase, destination).toBe("visit");
        expect(v.pay().textContent, destination).toBe(BOUGHT);
        expect(v.pay().disabled, destination).toBe(true);
        vi.advanceTimersByTime(BOUGHT_PAUSE_MS - 1);
        v.pay().click();
        expect(v.homes(), destination).toBe(0);
        expect(v.pay().textContent, destination).toBe(BOUGHT);
        vi.advanceTimersByTime(1);
        expect(v.pay().textContent, destination).toBe("Додому");
        expect(v.pay().disabled, destination).toBe(false);
        v.pay().click();
        expect(v.homes(), destination).toBe(1);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("за паузу можна докласти в кошик — тоді одразу «Купити», а спорожнили до кінця паузи — знову «✓ Куплено»", () => {
    vi.useFakeTimers();
    try {
      const v = visit("shop");
      v.plus(0);
      v.pay().click();
      expect(v.pay().textContent).toBe(BOUGHT);
      // Продукти тепер у ящиках — кладемо засоби гігієни (третій рядок).
      v.plus(2);
      expect(v.pay().textContent).toMatch(/^Купити/u);
      expect(v.pay().disabled).toBe(false);
      v.minus(2);
      expect(v.pay().textContent).toBe(BOUGHT);
      v.plus(2);
      vi.advanceTimersByTime(BOUGHT_PAUSE_MS);
      expect(v.pay().textContent).toMatch(/^Купити/u);
      v.minus(2);
      expect(v.pay().textContent).toBe("Додому");
    } finally {
      vi.useRealTimers();
    }
  });

  it("пауза картки, яку вже перебудувала послуга, не переписує збереженого кошика нової картки", () => {
    vi.useFakeTimers();
    try {
      const state = at("vet", 3);
      const kept = new Map<string, number>();
      shopCatalog(state, "store", { checkout: noop, home: noop, kept, bought: true });
      // Нова картка (після огляду) — уже з іншим кошиком.
      kept.set("drops:cheap", 2);
      vi.advanceTimersByTime(BOUGHT_PAUSE_MS);
      expect([...kept.entries()]).toEqual([["drops:cheap", 2]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("перший показ картки й оновлення після послуги — одразу «Додому»; у телефоні паузи немає", () => {
    expect(visit("vet").pay().textContent).toBe("Додому");
    const phone = shopCatalog(at(null), "delivery", { checkout: noop, bought: true });
    expect(fake(phone.bar).find("shop-pay").textContent).toBe("Замовити");
  });
});

describe("картки поїздок (§8.5)", () => {
  const noop = (): void => {};
  const handlers: VisitHandlers = { checkout: noop, exam: noop, nextCat: noop, treat: noop, treatSelf: noop, adopt: noop, sterilize: noop, buyKitten: noop, groom: noop, show: noop, home: noop };
  /** Скільки разів гроші «👛» у картці: тіло, примітка, смуга. */
  const purses = (card: ReturnType<typeof visitCard>): number =>
    [...card.body.map((b) => (typeof b === "string" ? b : fake(b).textContent)), ...(card.aside ?? []), card.bar ? fake(card.bar).textContent : ""].join("|").split("👛").length - 1;

  it("кілька котів на місці: кнопка «Далі» кличе наступного, кіт на руках названий чесно", () => {
    const state = at("vet");
    const first = state.cats[0];
    const second = createCat(state, createRng(4), { source: "shelter", ageWeeks: 20, at: { x: 9.5, y: 8.5 } });
    addCat(state, second);
    if (!state.trip || !first) throw new Error("немає поїздки");
    state.trip.riders = [
      { cat: first.id, place: "cheap" },
      { cat: second.id, place: "hands" },
    ];
    let next = 0;
    const text = (card: ReturnType<typeof visitCard>): string => card.body.map((b) => (typeof b === "string" ? b : fake(b).textContent)).join(" ");
    const card = visitCard(state, { exam: null, done: [] }, { ...handlers, nextCat: () => (next += 1) });
    expect(text(card)).toContain(`${first.name} у переносці.`);
    expect(text(card)).toContain(`Наступний кіт: ${second.name}`);
    const row = card.body.map((b) => (typeof b === "string" ? null : fake(b))).find((b) => b?.textContent.includes("Наступний кіт") === true);
    row?.find("button").click();
    expect(next).toBe(1);
    state.trip.cat = second.id;
    const last = visitCard(state, { exam: null, done: [] }, handlers);
    expect(text(last)).toContain(`${second.name} на руках.`);
    expect(text(last)).not.toContain("Наступний кіт");
  });

  it("ветеринар без кота: лише ліки, карток кота немає", () => {
    const state = at("vet");
    if (!state.trip) throw new Error("немає поїздки");
    state.trip.cat = null;
    state.trip.riders = [];
    const card = visitCard(state, { exam: null, done: [] }, handlers);
    const text = card.body.map((b) => (typeof b === "string" ? b : fake(b).textContent)).join(" ");
    expect(text).not.toContain("Огляд");
    expect(text).toContain("Ліки");
  });

  it("ветеринар — ліки для котів (таблетки й краплі), лікар — ліки для себе, пластир і бинт: розділ «Ліки» й смуга кошика з «Додому»", () => {
    const vet = visitCard(at("vet"), { exam: null, done: [] }, handlers);
    const vetList = vet.body.map((b) => (typeof b === "string" ? null : fake(b))).filter((b): b is FakeElement => b !== null && b.findAll("shop-item").length > 0)[0];
    expect(vetList?.findAll("shop-section").map((s) => s.textContent)).toEqual(["Ліки"]);
    // Картка — варіант: назва варіанта, без назви товару (рішення автора 2026-11-03, «Кожен товар у своїй картці»).
    const names = (goods: Goods[]): string[] => goods.flatMap((g) => variants(g).map((q) => variantTitle(g, q)));
    expect(vetList?.findAll("shop-name").map((n) => plain(n.textContent))).toEqual(names([{ product: "pills" }, { product: "drops" }]));
    expect(vet.actions).toEqual([]);
    expect(vet.bar ? fake(vet.bar).find("shop-pay").textContent : "").toBe("Додому");

    // Лікар продає ліки, пластир і бинт і здоровому.
    const doctor = visitCard(at("doctor"), { exam: null, done: [] }, handlers);
    const docList = doctor.body.map((b) => (typeof b === "string" ? null : fake(b))).find((b) => b !== null && b.findAll("shop-item").length > 0);
    expect(docList?.findAll("shop-name").map((n) => plain(n.textContent))).toEqual(names([{ product: "humanMeds" }, { product: "dressing" }]));
    expect(doctor.bar ? fake(doctor.bar).find("shop-pay").textContent : "").toBe("Додому");
  });

  it("назва розділу запасів — з даних: пункт, що продає частину каталогу (STORE_GOODS), має свою назву; магазин і телефон — «Запаси»", () => {
    for (const d of Object.keys(TRIPS) as Destination[]) {
      const stock = STORE_GOODS[d];
      expect(STORE_SECTION_TITLES[d] !== undefined, d).toBe(stock !== undefined && stock !== "all");
    }
    expect(suppliesTitle(at("vet"), "store")).toBe("Ліки");
    expect(suppliesTitle(at("doctor"), "store")).toBe("Ліки");
    expect(suppliesTitle(at("shop"), "store")).toBe("Запаси");
    expect(suppliesTitle(at("vet"), "delivery")).toBe("Запаси");
    expect(suppliesTitle(at(null), "delivery")).toBe("Запаси");
  });

  it("підпису «Поїздка» немає; гроші — рівно один раз: у смузі кошика (магазин, ветеринар, лікар) чи в примітці біля заголовка", () => {
    for (const d of Object.keys(TRIPS) as Destination[]) {
      const card = visitCard(at(d), { exam: null, done: [] }, handlers);
      expect(card.kicker, d).toBeUndefined();
      // Без вкладок: ширший лише телефон (`.card:has(> .card-tabbar)`), картка пункту — 560 px, праворуч парковка.
      expect(card.tabs, d).toBeUndefined();
      expect(purses(card), d).toBe(1);
      const store = d === "shop" || d === "vet" || d === "doctor";
      expect(card.bar !== undefined, d).toBe(store);
      expect((card.aside ?? []).some((p) => p.includes("👛")), d).toBe(!store);
      // «Додому» — кнопкою внизу лише там, де смуги кошика немає, і теж праворуч, як головна кнопка смуги (рецензія 2026-11-03).
      expect(card.actions.map((a) => a.label), d).toEqual(store ? [] : ["Додому"]);
      expect(card.actionsEnd === true, d).toBe(!store);
    }
  });

  it("магазин: біля заголовка — подія дня, що змінює ціни того, що є в каталозі, і скільки знижок", () => {
    const state = at("shop", 2);
    const n = variantsOf(catalog(state, "store")).filter(({ goods: g, quality: q }) => discount(state, g, q, "store") > 0).length;
    expect(n).toBeGreaterThan(1);
    expect(visitCard(state, { exam: null, done: [] }, handlers).aside).toEqual([`${n} ${plural(n, "знижка", "знижки", "знижок")}`]);
    state.modifiers.day = "pet-sale";
    expect(visitCard(state, { exam: null, done: [] }, handlers).aside?.[0]).toBe("Акція в зоомагазині");
    // До першого кота корму в каталозі немає — і події про корм біля заголовка теж.
    const early = newGame({ address: "she", difficulty: "normal", seed: 8 }).current;
    early.modifiers.day = "pet-sale";
    early.trip = { ...state.trip!, seed: 2 };
    expect(visitCard(early, { exam: null, done: [] }, handlers).aside ?? []).not.toContain("Акція в зоомагазині");
  });

  it("ветеринар і лікар: біля заголовка — на що знижки («ліки: 1 знижка»), а не просто «1 знижка»", () => {
    for (const d of ["vet", "doctor"] as const) {
      let seen = 0;
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const state = at(d, seed);
        const n = variantsOf(catalog(state, "store")).filter(({ goods: g, quality: q }) => discount(state, g, q, "store") > 0).length;
        const aside = visitCard(state, { exam: null, done: [] }, handlers).aside ?? [];
        expect(aside.filter((p) => p.includes("знижк")), `${d} ${seed}`).toEqual(n > 0 ? [`ліки: ${n} ${plural(n, "знижка", "знижки", "знижок")}`] : []);
        seen += n;
      }
      expect(seen, d).toBeGreaterThan(0);
    }
  });

  it("«Куди поїхати?»: без «Поїздка»; праворуч від заголовка — «Затори» чи «Порожні дороги» й гроші", () => {
    const state = at(null, 5, 250);
    const plainDay = destinationCard(state, noop, noop);
    expect(plainDay.kicker).toBeUndefined();
    expect(plainDay.aside).toEqual(["👛 250 ₴"]);
    state.modifiers.day = "traffic";
    expect(destinationCard(state, noop, noop).aside).toEqual(["Затори", "👛 250 ₴"]);
    state.modifiers.day = "empty-roads";
    expect(destinationCard(state, noop, noop).aside).toEqual(["Порожні дороги", "👛 250 ₴"]);
    // Подія, що дороги не змінює, — не тут.
    state.modifiers.day = "pet-sale";
    expect(destinationCard(state, noop, noop).aside).toEqual(["👛 250 ₴"]);
  });

  it("телефон: смуга кошика — у картці внизу, лише на вкладці магазину", () => {
    const state = at(null);
    const phone: PhoneHandlers = { checkout: noop, discard: noop, discardThing: noop, advertise: noop, cancelAd: noop, newGame: noop, exportSave: noop, importSave: noop, tab: noop, close: noop, effects: { volume: 1, set: noop } };
    const shop = phoneCard(state, "shop", phone);
    expect(shop.bar ? fake(shop.bar).find("shop-pay").textContent : "").toBe("Замовити");
    expect(phoneCard(state, "mine", phone).bar).toBeUndefined();
  });

  it("«Мої речі»: рядок речі — її іконка й назва варіанта, та сама, що на картці магазину, без назви речі над нею; «Викинути» знає якість", () => {
    const state = at(null);
    state.home.carriers = [{ quality: "premium", wear: 0 }];
    const bowl = place(state, "bowl", "premium");
    if (bowl) state.home.items.push(bowl);
    const thrown: [string, string][] = [];
    const phone: PhoneHandlers = {
      checkout: noop, discard: (item) => thrown.push([item.kind, item.quality]), discardThing: (thing, quality) => thrown.push([JSON.stringify(thing), quality]),
      advertise: noop, cancelAd: noop, newGame: noop, exportSave: noop, importSave: noop, tab: noop, close: noop, effects: { volume: 1, set: noop },
    };
    const card = phoneCard(state, "mine", phone);
    const list = card.body.map((b) => (typeof b === "string" ? null : fake(b))).find((b) => b !== null && b.findAll("shop-row").length > 0);
    const rows = list?.findAll("shop-row") ?? [];
    const expected = [...state.home.items.map((i) => variantLabel({ thing: i.kind }, i.quality)), variantLabel({ thing: "carrier" }, "premium")];
    expect(expected.length).toBeGreaterThan(1);
    expect(rows.map((r) => r.find("shop-name").textContent)).toEqual(expected);
    expect(list?.findAll("shop-stock")).toEqual([]);
    rows.at(-1)?.find("button").click();
    expect(thrown).toEqual([[JSON.stringify({ carrier: 0 }), "premium"]]);
  });
});
