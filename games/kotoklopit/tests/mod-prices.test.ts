// Модифікатори цін і доставки (GAME_DESIGN §4.1 «Ефекти тижня», §6.4, §8.5; DAY_MODIFIERS.md): «Нові ціни у ветклініці ↔ Програма
// стерилізації», «Кур'єри не встигають ↔ Безкоштовна доставка», «Ціни ростуть ↔ Чорна п'ятниця». Ціна на кнопці й у кошику —
// та, що списується; час прибуття й ціна фіксуються в мить замовлення.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createCat } from "../src/sim/cat";
import { DELIVERY, DELIVERY_HOURS, DOCTOR_TREAT, MINUTES_PER_HOUR, MODIFIERS, PRODUCTS, STERILIZATION, THINGS, TRIPS, VET } from "../src/sim/config";
import { goodsPriceFactor, shopModifier, sterilizePrice, vetExam, vetExamPrice, vetSterilize, vetTreat, vetTreatPrice } from "../src/sim/destinations";
import { fallIll } from "../src/sim/diseases";
import { deliveryCost, order, orderThing, productPrice, receivePackages, thingPrice, tickDeliveries, utilitiesDue } from "../src/sim/economy";
import { newGame } from "../src/sim/game";
import { doctorTreat, fallIllPerson } from "../src/sim/illness";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { cartDelivery, cartTotal, catalog, checkout, discount, goodsKey, regularPrice, unitPrice, variants, type CartLine, type Goods } from "../src/sim/shop";
import { absoluteMinute } from "../src/sim/time";
import type { Cat, Destination, GameState } from "../src/sim/types";
import { shopCatalog } from "../src/ui/shop";
import { visitCard, type VisitHandlers } from "../src/ui/trips";
import { scheduleOf } from "../src/view/schedule";

/** Найпростіший DOM без браузера: класи, текст, діти, вимкненість і натискання. */
class FakeElement {
  className = "";
  disabled = false;
  title = "";
  hidden = false;
  readonly style: Record<string, string> = {};
  children: (FakeElement | string)[] = [];
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

  setAttribute(): void {}

  addEventListener(type: string, listener: () => void): void {
    if (type === "click") this.listeners.push(listener);
  }

  click(): void {
    if (!this.disabled) for (const l of this.listeners) l();
  }

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

beforeAll(() => {
  vi.stubGlobal("document", { createElement: (tag: string) => new FakeElement(tag), createTreeWalker: () => ({ nextNode: () => null }) });
  vi.stubGlobal("NodeFilter", { SHOW_TEXT: 4 });
});
afterAll(() => vi.unstubAllGlobals());

const noop = (): void => {};
const handlers: VisitHandlers = { checkout: noop, exam: noop, nextCat: noop, treat: noop, treatSelf: noop, adopt: noop, sterilize: noop, buyKitten: noop, groom: noop, show: noop, home: noop };

/** Гра з дорослою нестерилізованою кішкою; персонаж на місці в `destination` (null — удома), без модифікаторів. */
function at(destination: Destination | null, seed = 5, money = 5000): { state: GameState; cat: Cat } {
  const state = newGame({ address: "she", difficulty: "normal", seed: 8 }).current;
  state.modifiers.day = null;
  state.modifiers.week = null;
  state.character.money = money;
  const cat = createCat(state, createRng(3), { source: "shelter", ageWeeks: 20, sex: "female", at: { x: 9.5, y: 8.5 } });
  cat.sterilized = false;
  cat.pregnancy = null;
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
  return { state, cat };
}

/** Скільки списала дія. */
function spent(state: GameState, act: () => unknown): number {
  const before = state.character.money;
  act();
  return before - state.character.money;
}

/** Кнопки з ціною в тілі картки пункту: текст і сама кнопка. */
function priceButtons(card: ReturnType<typeof visitCard>): FakeElement[] {
  return card.body.flatMap((b) => (typeof b === "string" ? [] : [fake(b), ...fake(b).findAll("button")])).filter((b) => b.tagName === "button" && b.textContent.includes("₴"));
}

/** Число з підпису кнопки «… · 78 ₴» чи «78 ₴». */
const priceOf = (button: FakeElement | undefined): number => Number(button?.textContent.match(/(\d+) ₴$/u)?.[1]);

const variantsOf = (goods: readonly Goods[]): { goods: Goods; quality: CartLine["quality"] }[] => goods.flatMap((g) => variants(g).map((quality) => ({ goods: g, quality })));

describe("ветклініка тижня (§8.5): «Нові ціни у ветклініці» ↔ «Програма стерилізації»", () => {
  it("множники послуг: «Нові ціни» — огляд, лікування й операція; «Програма» — огляд і операція, лікування за звичайною ціною", () => {
    const { state } = at("vet");
    expect([vetExamPrice(state), vetTreatPrice(state, "cheap"), vetTreatPrice(state, "premium"), sterilizePrice(state)]).toEqual([VET.exam, VET.cheap, VET.premium, STERILIZATION.price]);
    state.modifiers.week = "vet-prices";
    const up = MODIFIERS.week.vet["vet-prices"] ?? 1;
    expect(up).toBeGreaterThan(1);
    expect(vetExamPrice(state)).toBe(Math.round(VET.exam * up));
    expect(vetTreatPrice(state, "cheap")).toBe(Math.round(VET.cheap * up));
    expect(vetTreatPrice(state, "premium")).toBe(Math.round(VET.premium * up));
    expect(sterilizePrice(state)).toBe(Math.round(STERILIZATION.price * up));
    state.modifiers.week = "spay-program";
    const down = MODIFIERS.week.vet["spay-program"] ?? 1;
    expect(down).toBeLessThan(1);
    expect(vetExamPrice(state)).toBe(Math.round(VET.exam * down));
    expect(sterilizePrice(state)).toBe(Math.round(STERILIZATION.price * down));
    expect([vetTreatPrice(state, "cheap"), vetTreatPrice(state, "premium")]).toEqual([VET.cheap, VET.premium]);
  });

  for (const week of [null, "vet-prices", "spay-program"] as const) {
    it(`${week ?? "звичайний тиждень"}: огляд, лікування й операція списують рівно те, що на кнопці картки`, () => {
      const { state, cat } = at("vet");
      state.modifiers.week = week;
      fallIll(state, cat, "injury");
      // До огляду: кнопки огляду й операції (огляд у ціні).
      const [exam, sterilize] = priceButtons(visitCard(state, { exam: null, done: [] }, handlers));
      expect(priceOf(exam)).toBe(vetExamPrice(state));
      expect(priceOf(sterilize)).toBe(sterilizePrice(state));
      expect(spent(state, () => vetExam(state))).toBe(priceOf(exam));
      // Після огляду: лікування знайденої хвороби й операція без огляду.
      const after = priceButtons(visitCard(state, state.trip?.log ?? { exam: null, done: [] }, handlers));
      const shown = Object.fromEntries(after.map((b) => [b.textContent.includes("·") ? (b.textContent.startsWith("Звичайне") ? "cheap" : "premium") : "sterilize", priceOf(b)]));
      expect(Object.keys(shown).sort()).toEqual(["cheap", "premium", "sterilize"]);
      expect(spent(state, () => vetTreat(state, "injury", "premium", createRng(1)))).toBe(shown.premium);
      expect(shown.cheap).toBe(vetTreatPrice(state, "cheap"));
      expect(spent(state, () => expect(vetSterilize(state)).toBe(true))).toBe(shown.sterilize);
    });
  }

  it("операція без окремого огляду — одна ціна з оглядом у ціні, як і в звичайний тиждень", () => {
    for (const week of ["vet-prices", "spay-program"]) {
      const { state } = at("vet");
      state.modifiers.week = week;
      const price = sterilizePrice(state);
      expect(priceOf(priceButtons(visitCard(state, { exam: null, done: [] }, handlers))[1]), week).toBe(price);
      expect(spent(state, () => expect(vetSterilize(state)).toBe(true)), week).toBe(price);
    }
  });

  it("ліки у ветеринара — за звичайною ціною; лікар, грумер — без змін", () => {
    const { state } = at("vet", 3);
    const pills = { product: "pills" } as const;
    const plain = (["cheap", "premium"] as const).map((q) => unitPrice(state, pills, q, "store"));
    for (const week of ["vet-prices", "spay-program"]) {
      state.modifiers.week = week;
      expect((["cheap", "premium"] as const).map((q) => unitPrice(state, pills, q, "store")), week).toEqual(plain);
    }
    const doctor = at("doctor").state;
    doctor.modifiers.week = "vet-prices";
    fallIllPerson(doctor, "cold");
    expect(spent(doctor, () => doctorTreat(doctor, "cold", "premium", createRng(1)))).toBe(DOCTOR_TREAT.premium);
  });
});

describe("доставка дня (§6.4): «Кур'єри не встигають» ↔ «Безкоштовна доставка»", () => {
  it("«Кур'єри не встигають»: замовлене сьогодні їде × `MODIFIERS.delivery`, і розклад показує цей час", () => {
    const { state } = at(null);
    state.minute = 9 * MINUTES_PER_HOUR;
    const now = absoluteMinute(state.day, state.minute);
    expect(order(state, "food", "cheap")?.at).toBe(now + DELIVERY_HOURS * MINUTES_PER_HOUR);
    state.home.deliveries = [];
    state.modifiers.day = "courier-delay";
    const slow = MODIFIERS.delivery["courier-delay"] ?? 1;
    expect(slow).toBeGreaterThan(1);
    expect(order(state, "food", "cheap")?.at).toBe(now + DELIVERY_HOURS * slow * MINUTES_PER_HOUR);
    // Кошиком — так само.
    expect(checkout(state, [{ goods: { thing: "toy" }, quality: "cheap", count: 1 }], "delivery")).toBe(true);
    expect(state.home.deliveries.map((d) => d.at)).toEqual([now + DELIVERY_HOURS * slow * MINUTES_PER_HOUR, now + DELIVERY_HOURS * slow * MINUTES_PER_HOUR]);
    const arrives = 9 + DELIVERY_HOURS * slow;
    expect(scheduleOf(state)).toContain(`≈${String(arrives % 24).padStart(2, "0")}:00 кур'єр`);
  });

  it("час прибуття фіксується в мить замовлення: на вчорашні замовлення «Кур'єри не встигають» не діють, і навпаки", () => {
    const { state } = at(null);
    const earlier = order(state, "food", "cheap");
    const before = earlier?.at;
    state.modifiers.day = "courier-delay";
    const slow = order(state, "hygiene", "cheap");
    const slowAt = slow?.at;
    expect(state.home.deliveries.find((d) => d.id === earlier?.id)?.at).toBe(before);
    state.modifiers.day = null;
    expect(state.home.deliveries.find((d) => d.id === slow?.id)?.at).toBe(slowAt);
  });

  it("«Безкоштовна доставка»: вартість доставки 0 — у смузі кошика телефона, на кнопці й у списаному", () => {
    const { state } = at(null);
    state.modifiers.day = "free-delivery";
    expect(deliveryCost(state, 500)).toBe(0);
    const bought: CartLine[][] = [];
    const shop = shopCatalog(state, "delivery", { checkout: (cart) => bought.push(cart) });
    const list = fake(shop.list);
    const bar = fake(shop.bar);
    const steps = list.findAll("step");
    steps[1]?.click();
    steps[3]?.click();
    const total = bar.find("shop-total").textContent.match(/^🛒 (\d+) ₴ · 🚗 доставка (\d+) ₴$/u);
    expect(total?.[2]).toBe("0");
    const pay = bar.find("shop-pay");
    expect(pay.textContent).toBe(`Замовити · ${total?.[1]} ₴`);
    pay.click();
    const cart = bought[0] ?? [];
    expect(cartDelivery(state, cart, "delivery")).toBe(0);
    expect(spent(state, () => expect(checkout(state, cart, "delivery")).toBe(true))).toBe(Number(total?.[1]));
  });

  it("звичайний день — доставка як завжди: частка бази й надбавка", () => {
    const { state } = at(null);
    expect(deliveryCost(state, 500)).toBe(Math.round(500 * DELIVERY.share) + DELIVERY.fee.normal);
    state.modifiers.day = "courier-delay";
    // Кур'єри повільніші, але ціна доставки та сама.
    expect(deliveryCost(state, 500)).toBe(Math.round(500 * DELIVERY.share) + DELIVERY.fee.normal);
  });
});

describe("ціни тижня (§6.4): «Ціни ростуть» ↔ «Чорна п'ятниця»", () => {
  it("запаси й речі — × `MODIFIERS.week.prices` у телефоні й на місці", () => {
    for (const week of ["price-rise", "black-friday"]) {
      const factor = MODIFIERS.week.prices[week] ?? 1;
      const phone = at(null).state;
      phone.modifiers.week = week;
      const shop = at("shop", 4).state;
      shop.modifiers.week = week;
      for (const { goods: g, quality: q } of variantsOf(catalog(phone, "delivery"))) {
        const what = `${week} ${goodsKey(g)} ${q}`;
        const regular = regularPrice(g, q);
        expect(unitPrice(phone, g, q, "delivery"), what).toBe(Math.round(regular * factor));
        expect(unitPrice(shop, g, q, "store"), what).toBe(Math.round(regular * factor * (1 + shopModifier(shop, g, q))));
      }
      expect(productPrice(phone, "food", "cheap")).toBe(Math.round(PRODUCTS.food.price.cheap * factor));
      expect(thingPrice(phone, "robot", "premium")).toBe(Math.round(THINGS.robot.price.premium * factor));
    }
  });

  it("окреме замовлення речі й запасу списує ціну тижня й доставку з неї; пізніша зміна тижня нічого не перераховує", () => {
    const { state } = at(null);
    state.modifiers.week = "black-friday";
    const price = thingPrice(state, "scratcher", "premium");
    expect(price).toBeLessThan(THINGS.scratcher.price.premium);
    expect(spent(state, () => orderThing(state, "scratcher", "premium"))).toBe(price + deliveryCost(state, price));
    const food = productPrice(state, "food", "premium");
    expect(spent(state, () => order(state, "food", "premium"))).toBe(food + deliveryCost(state, food));
    state.modifiers.week = "price-rise";
    state.minute += DELIVERY_HOURS * MINUTES_PER_HOUR;
    expect(spent(state, () => {
      tickDeliveries(state);
      receivePackages(state);
    })).toBe(0);
  });

  for (const [week, destination] of [["price-rise", null], ["black-friday", null], ["price-rise", "shop"], ["black-friday", "shop"]] as const) {
    it(`${week}, ${destination ?? "телефон"}: сума кошика на кнопці — та, що списується`, () => {
      const { state } = at(destination, 6);
      state.modifiers.week = week;
      const bought: CartLine[][] = [];
      const shop = shopCatalog(state, destination === null ? "delivery" : "store", { checkout: (cart) => bought.push(cart), ...(destination === null ? {} : { home: noop }) });
      const steps = fake(shop.list).findAll("step");
      // Перший запас і перша річ.
      const things = variantsOf(catalog(state, destination === null ? "delivery" : "store")).findIndex((v) => "thing" in v.goods);
      steps[1]?.click();
      steps[things * 2 + 1]?.click();
      const bar = fake(shop.bar);
      const mode = destination === null ? "delivery" : "store";
      const sum = Number(bar.find("shop-total").textContent.match(/^🛒 (\d+) ₴/u)?.[1]);
      bar.find("shop-pay").click();
      const cart = bought[0] ?? [];
      expect(cart).toHaveLength(2);
      const due = cartTotal(state, cart, mode);
      if (mode === "delivery") expect(bar.find("shop-pay").textContent).toBe(`Замовити · ${due} ₴`);
      else expect(due).toBe(sum);
      expect(spent(state, () => expect(checkout(state, cart, mode)).toBe(true))).toBe(due);
    });
  }

  it("«Чорна п'ятниця»: у телефоні бірка «−X%» — на кожній картці товару, однакова на обох варіантах; «Ціни ростуть» — без бірок", () => {
    const { state } = at(null);
    state.modifiers.week = "black-friday";
    const off = Math.round((1 - (MODIFIERS.week.prices["black-friday"] ?? 1)) * 100);
    const shown = variantsOf(catalog(state, "delivery"));
    const shop = shopCatalog(state, "delivery", { checkout: noop });
    const items = fake(shop.list).findAll("shop-item");
    expect(items).toHaveLength(shown.length);
    shown.forEach(({ goods: g, quality: q }, i) => {
      expect(discount(state, g, q, "delivery"), `${goodsKey(g)} ${q}`).toBe(off);
      expect(items[i]?.findAll("price-tag").map((t) => t.textContent), `${goodsKey(g)} ${q}`).toEqual([`−${off}%`]);
    });
    expect(shop.discounted).toBe(shown.length);
    state.modifiers.week = "price-rise";
    expect(fake(shopCatalog(state, "delivery", { checkout: noop }).list).findAll("price-tag")).toEqual([]);
  });

  it("«Чорна п'ятниця» з «Акцією на корм»: на корм — спільна знижка обох; на місці бірка — з модифікатором поїздки", () => {
    const { state } = at(null);
    state.modifiers.week = "black-friday";
    state.modifiers.day = "pet-sale";
    const both = (MODIFIERS.week.prices["black-friday"] ?? 1) * (MODIFIERS.catFoodPrice["pet-sale"] ?? 1);
    expect(discount(state, { product: "catFood" }, "cheap", "delivery")).toBe(Math.round((1 - both) * 100));
    expect(discount(state, { product: "catFood" }, "premium", "delivery")).toBe(Math.round((1 - both) * 100));
    const shop = at("shop", 2).state;
    shop.modifiers.week = "black-friday";
    for (const { goods: g, quality: q } of variantsOf(catalog(shop, "store"))) {
      const x = Math.round((1 - goodsPriceFactor(shop, g) * (1 + shopModifier(shop, g, q))) * 100);
      const expected = x >= 1 && unitPrice(shop, g, q, "store") < regularPrice(g, q) ? x : 0;
      expect(discount(shop, g, q, "store"), `${goodsKey(g)} ${q}`).toBe(expected);
    }
  });

  it("тиждень цін не подія дня: біля заголовка магазину — подія дня лише тоді, коли вона сама змінює ціни", () => {
    const { state } = at("shop", 2);
    state.modifiers.week = "price-rise";
    state.modifiers.day = "traffic";
    expect(visitCard(state, { exam: null, done: [] }, handlers).aside ?? []).not.toContain("Затори");
    state.modifiers.week = "black-friday";
    state.modifiers.day = "pet-sale";
    expect(visitCard(state, { exam: null, done: [] }, handlers).aside?.[0]).toBe("Акція на корм");
  });

  it("послуги ветеринара й лікаря та комунальні — без змін", () => {
    const vet = at("vet").state;
    const doctor = at("doctor").state;
    const plain = { exam: vetExamPrice(vet), treat: vetTreatPrice(vet, "premium"), sterilize: sterilizePrice(vet), utilities: utilitiesDue(vet) };
    for (const week of ["price-rise", "black-friday"]) {
      vet.modifiers.week = week;
      expect({ exam: vetExamPrice(vet), treat: vetTreatPrice(vet, "premium"), sterilize: sterilizePrice(vet), utilities: utilitiesDue(vet) }, week).toEqual(plain);
      doctor.modifiers.week = week;
      doctor.character.illnesses = [];
      fallIllPerson(doctor, "cold");
      if (doctor.trip) doctor.trip.log = { exam: null, done: [] };
      expect(spent(doctor, () => doctorTreat(doctor, "cold", "premium", createRng(1))), week).toBe(DOCTOR_TREAT.premium);
    }
  });
});
