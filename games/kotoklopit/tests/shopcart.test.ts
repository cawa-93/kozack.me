// Каталог і кошик унизу (GAME_DESIGN §6.4, «Бірка знижки й кошик унизу»; §8.5, «Ліки у ветеринара й лікаря» і «Картки поїздок
// без «Поїздка»»; рішення автора 2026-11-03): бірка «−X%» — лише на знижці, рядка зі стрілкою немає; головна кнопка смуги на
// місці — «Додому» з порожнім кошиком і «Купити» з непорожнім (сума — у віконці поруч); «Очистити» — іконкою, лише з непорожнім кошиком; гроші —
// рівно один раз у картці.

import { readFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createCat } from "../src/sim/cat";
import { STORE_GOODS, TRIPS } from "../src/sim/config";
import { newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { catalog, checkout, discount, goodsKey, unitPrice, variants, type CartLine, type Goods } from "../src/sim/shop";
import type { Destination, GameState } from "../src/sim/types";
import { phoneCard, type PhoneHandlers } from "../src/ui/cards";
import { splitIcons } from "../src/ui/icons";
import type { Card } from "../src/ui/overlay";
import { BOUGHT, BOUGHT_PAUSE_MS, CLEAR_CART, packText, shopCatalog, suppliesTitle } from "../src/ui/shop";
import { plural, STORE_SECTION_TITLES } from "../src/ui/titles";
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

describe("бірка знижки замість стрілки (§6.4)", () => {
  it("бірка «−X%» — лише на товарах зі знижкою (discount), подорожчання й «без змін» — нічого; стрілок «₴↓ / ₴↑» немає", () => {
    let tagged = 0;
    let untagged = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const state = at("shop", seed);
      const { list, shop } = open(state, "store");
      const lines = list.findAll("shop-line");
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

  it("у телефоні звичайного дня бірок немає, а в «Акцію в зоомагазині» — на корм", () => {
    const state = at(null);
    expect(open(state, "delivery", false).list.findAll("price-tag")).toEqual([]);
    state.modifiers.day = "pet-sale";
    const tags = open(state, "delivery", false).list.findAll("price-tag");
    // Знижка дня — на обидва варіанти корму.
    expect(tags.map((t) => t.textContent)).toEqual(["−30%", "−30%"]);
  });

  it("рядок варіанта: назва й «×15» замість «15 душів», ціна — окремим стовпцем", () => {
    expect(packText({ product: "hygiene" }, "cheap")).toBe("×15");
    expect(packText({ product: "catFood" }, "premium")).toBe("×55");
    // Нашийник — поштучно; речі — без упаковки; автогодівниця — іконка корму й скільки порцій уміщує.
    expect(packText({ product: "collar" }, "cheap")).toBe("");
    expect(packText({ thing: "bowl" }, "cheap")).toBe("");
    expect(plain(packText({ thing: "feeder" }, "premium"))).toBe("20");
    const state = at("shop", 2);
    const { list } = open(state, "store");
    const line = list.findAll("shop-line")[0];
    expect(line?.find("shop-option").textContent).toMatch(/×\d+/u);
    expect(line?.find("shop-option").textContent).not.toMatch(/порці|душ|₴/u);
    const goods = catalog(state, "store")[0];
    expect(line?.find("shop-price").textContent).toBe(`${goods ? unitPrice(state, goods, "cheap", "store") : 0} ₴`);
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

  it("варіант, якого не взяти («у ящиках»), — сірий: клас muted на рядку варіанта, і CSS фарбує саме його назву й ціну", () => {
    const state = at("shop", 3);
    const goods = catalog(state, "store")[0];
    if (!goods || !("product" in goods)) throw new Error("перший товар — запас");
    const before = open(state, "store").list.findAll("shop-line").slice(0, 2);
    expect(before.map((l) => l.classList.contains("muted"))).toEqual([false, false]);
    checkout(state, [{ goods, quality: "cheap", count: 1 }], "store");
    const after = open(state, "store").list.findAll("shop-item")[0];
    expect(after?.find("shop-stock").textContent).toContain("у ящиках");
    expect(after?.findAll("shop-line").map((l) => l.classList.contains("muted"))).toEqual([true, true]);
    const css = readFileSync(new URL("../src/ui/overlay.css", import.meta.url), "utf8");
    for (const part of ["shop-option", "shop-price"]) expect(css.includes(`.shop-line.muted .${part}`), part).toBe(true);
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
        exam: noop, treat: noop, treatSelf: noop, adopt: noop, sterilize: noop, buyKitten: noop, groom: noop, show: noop,
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
  const handlers: VisitHandlers = { checkout: noop, exam: noop, treat: noop, treatSelf: noop, adopt: noop, sterilize: noop, buyKitten: noop, groom: noop, show: noop, home: noop };
  /** Скільки разів гроші «👛» у картці: тіло, примітка, смуга. */
  const purses = (card: ReturnType<typeof visitCard>): number =>
    [...card.body.map((b) => (typeof b === "string" ? b : fake(b).textContent)), ...(card.aside ?? []), card.bar ? fake(card.bar).textContent : ""].join("|").split("👛").length - 1;

  it("ветеринар — ліки для котів (таблетки й краплі), лікар — ліки для себе: розділ «Ліки» й смуга кошика з «Додому»", () => {
    const vet = visitCard(at("vet"), { exam: null, done: [] }, handlers);
    const vetList = vet.body.map((b) => (typeof b === "string" ? null : fake(b))).filter((b): b is FakeElement => b !== null && b.findAll("shop-item").length > 0)[0];
    expect(vetList?.findAll("shop-section").map((s) => s.textContent)).toEqual(["Ліки"]);
    expect(vetList?.findAll("shop-name").map((n) => plain(n.textContent))).toEqual(["Таблетки для котів", "Краплі для котів"]);
    expect(vet.actions).toEqual([]);
    expect(vet.bar ? fake(vet.bar).find("shop-pay").textContent : "").toBe("Додому");

    // Лікар продає ліки й здоровому.
    const doctor = visitCard(at("doctor"), { exam: null, done: [] }, handlers);
    const docList = doctor.body.map((b) => (typeof b === "string" ? null : fake(b))).find((b) => b !== null && b.findAll("shop-item").length > 0);
    expect(docList?.findAll("shop-name").map((n) => plain(n.textContent))).toEqual(["Ліки для себе"]);
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

  it("«Куди поїхати?»: без «Поїздка»; праворуч від заголовка — «Пробки» чи «Порожні дороги» й гроші", () => {
    const state = at(null, 5, 250);
    const plainDay = destinationCard(state, noop, noop);
    expect(plainDay.kicker).toBeUndefined();
    expect(plainDay.aside).toEqual(["👛 250 ₴"]);
    state.modifiers.day = "traffic";
    expect(destinationCard(state, noop, noop).aside).toEqual(["Пробки", "👛 250 ₴"]);
    state.modifiers.day = "empty-roads";
    expect(destinationCard(state, noop, noop).aside).toEqual(["Порожні дороги", "👛 250 ₴"]);
    // Подія, що дороги не змінює, — не тут.
    state.modifiers.day = "pet-sale";
    expect(destinationCard(state, noop, noop).aside).toEqual(["👛 250 ₴"]);
  });

  it("телефон: смуга кошика — у картці внизу, лише на вкладці магазину", () => {
    const state = at(null);
    const phone: PhoneHandlers = { checkout: noop, discard: noop, discardThing: noop, advertise: noop, cancelAd: noop, newGame: noop, exportSave: noop, importSave: noop, tab: noop, close: noop };
    const shop = phoneCard(state, "shop", phone);
    expect(shop.bar ? fake(shop.bar).find("shop-pay").textContent : "").toBe("Замовити");
    expect(phoneCard(state, "mine", phone).bar).toBeUndefined();
  });
});
