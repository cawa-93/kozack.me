// Телефон — смартфон набік (GAME_DESIGN §6.4): своє оформлення картки (`skin: "phone"`, `phone.css`), угорі екрана — рядок стану
// з годинником гри; вкладки лишаються вкладками картки, хрестик — закриває, як Esc.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createCat } from "../src/sim/cat";
import { newGame } from "../src/sim/game";
import { fallIllPerson } from "../src/sim/illness";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { formatClock } from "../src/sim/time";
import type { GameState } from "../src/sim/types";
import { phoneCard, type PhoneHandlers, type PhoneTab } from "../src/ui/cards";
import { GLYPH_ART } from "../src/view/art/manifest/a12-icons";

// Живий портрет кота (вкладка «Коти») малює на полотні атласом арту — у DOM без браузера його немає.
vi.mock("../src/ui/liveportrait", () => ({ liveCatPortrait: () => undefined }));

/** Найпростіший DOM без браузера: елемент пам'ятає клас, текст, дітей і атрибути. */
class FakeElement {
  className = "";
  hidden = false;
  disabled = false;
  value = "";
  type = "";
  readonly style: Record<string, string> = {};
  readonly attributes: Record<string, string> = {};
  children: (FakeElement | string)[] = [];
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
  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }
  private readonly listeners: Record<string, () => void> = {};
  addEventListener(type: string, listener: () => void): void {
    this.listeners[type] = listener;
  }
  click(): void {
    this.listeners.click?.();
  }
  find(className: string): FakeElement | undefined {
    for (const child of this.children) {
      if (typeof child === "string") continue;
      if (child.className.split(" ").includes(className)) return child;
      const found = child.find(className);
      if (found) return found;
    }
    return undefined;
  }
}

const noop = (): void => undefined;
const handlers: PhoneHandlers = { checkout: noop, payUtilities: noop, discard: noop, discardThing: noop, advertise: noop, cancelAd: noop, newGame: noop, exportSave: noop, importSave: noop, tab: noop, close: noop, effects: { volume: 1, set: noop }, difficulty: noop };
const TABS: PhoneTab[] = ["shop", "home", "cats", "profile", "game"];

/** Гра з котом і записом в альбомі: у телефоні всі шість вкладок. */
function fullPhone(): GameState {
  const state = newGame({ address: "she", difficulty: "normal", seed: 8 }).current;
  const cat = createCat(state, createRng(3), { source: "shelter", ageWeeks: 20, at: { x: 9.5, y: 8.5 } });
  addCat(state, cat);
  const { id, name, sex, source, ageWeeks, traits, breed, genes, shape } = cat;
  state.album.push({ id: id + 1, name, sex, source, ageWeeks, traits, breed, genes, shape, cause: { kind: "old" }, lifeMood: 60, days: 10, arrivedDay: 0, day: 3 });
  return state;
}

beforeAll(() => {
  vi.stubGlobal("document", { createElement: (tag: string) => new FakeElement(tag), createTreeWalker: () => ({ nextNode: () => null }) });
  vi.stubGlobal("NodeFilter", { SHOW_TEXT: 4 });
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
});
afterAll(() => vi.unstubAllGlobals());

describe("рахунок за комунальні у «Домі» (§6.4)", () => {
  const bill = (state: GameState): FakeElement | undefined => {
    for (const part of phoneCard(state, "home", handlers).body) {
      if (typeof part === "string") continue;
      const node = part as unknown as FakeElement;
      if (node.className === "bill") return node;
    }
    return undefined;
  };

  it("сплачувати нічого — на місці рахунку «Усі рахунки сплачено»; під ним радіо, комп'ютер і віник, а з пилососом — без віника", () => {
    const state = newGame({ address: "she", difficulty: "normal", seed: 8 }).current;
    const parts = phoneCard(state, "home", handlers).body.filter((p): p is HTMLElement => typeof p !== "string") as unknown as FakeElement[];
    expect(parts.find((p) => p.className === "bill-empty")?.textContent).toBe("Усі рахунки сплачено");
    const names = (): string => (phoneCard(state, "home", handlers).body.map((p) => (typeof p === "string" ? p : (p as unknown as FakeElement).textContent)).join("|"));
    for (const name of ["Радіо", "Комп'ютер", "Віник із совком"]) expect(names()).toContain(name);
    state.home.appliances.vacuum = "cheap";
    expect(names()).not.toContain("Віник із совком");
    state.home.utilitiesBill = 61;
    expect(names()).not.toContain("Усі рахунки сплачено");
  });

  it("сплачувати нічого — рахунку немає; є рахунок — сума тижня й кнопка з нею; без грошей — неактивна", () => {
    const state = newGame({ address: "she", difficulty: "normal", seed: 8 }).current;
    expect(bill(state)).toBeUndefined();
    state.home.utilitiesBill = 61;
    state.character.money = 100;
    // День 0 — перший тиждень.
    expect(bill(state)?.find("bill-date")?.textContent).toBe("тиждень 1");
    expect(bill(state)?.find("bill-line")?.textContent).toBe("ОСББ");
    expect(bill(state)?.find("bill-sum")?.textContent).toBe("61 ₴");
    const pay = (): FakeElement | undefined => bill(state)?.find("bill-pay");
    expect([pay()?.textContent, pay()?.disabled]).toEqual(["Сплатити", false]);
    state.character.money = 60;
    expect([pay()?.textContent, pay()?.disabled]).toEqual(["Сплатити", true]);
  });
});

describe("профіль (§8.4, §6.5)", () => {
  const text = (state: GameState): string =>
    phoneCard(state, "profile", handlers)
      .body.map((part) => (typeof part === "string" ? part : (part as unknown as FakeElement).textContent))
      .join("|");

  it("посада, ставка й робочий час; безробітному — «Шукає роботу» без ставки", () => {
    const state = newGame({ address: "she", difficulty: "normal", seed: 8 }).current;
    expect(text(state)).toContain("Практикантка");
    expect(text(state)).toContain("₴ за годину");
    state.job.unemployed = true;
    expect(text(state)).toContain("Шукає роботу");
    expect(text(state)).not.toContain("за годину");
  });

  it("ліки — у рядку назви хвороби, лише коли їх сьогодні прийнято; «не прийнято» не пишуть", () => {
    const state = newGame({ address: "she", difficulty: "normal", seed: 8 }).current;
    expect(text(state)).toContain("Нічого особливого");
    fallIllPerson(state, "cold");
    fallIllPerson(state, "exhaustion");
    expect(text(state)).not.toContain("ліки");
    const cold = state.character.illnesses.find((i) => i.id === "cold");
    if (cold) cold.lastDose = state.day - 1;
    expect(text(state)).not.toContain("ліки");
    if (cold) cold.lastDose = state.day;
    expect(text(state)).toMatch(/Застуда · .*ліки сьогодні прийнято/);
    expect(text(state).match(/ліки сьогодні прийнято/g)).toHaveLength(1);
  });
});

describe("картка кота у вкладці «Коти» (§9.7, §9.8)", () => {
  const profile = (state: GameState): FakeElement => phoneCard(state, "cats", handlers).body.find((p) => typeof p !== "string" && (p as unknown as FakeElement).className === "cat-profile") as unknown as FakeElement;

  it("ім'я — заголовком, за ним знак статі й олівець «Змінити ім'я»; праворуч — «Віддати в добрі руки»; з оголошенням — «Зняти оголошення»", () => {
    const state = fullPhone();
    const cat = state.cats[0]!;
    const title = profile(state).find("cat-profile-title");
    expect(title?.find("cat-profile-name")?.textContent).toBe(cat.name);
    expect(title?.find("cat-sex")?.textContent).toBe(cat.sex === "male" ? "♂" : "♀");
    expect(title?.find("cat-rename")?.attributes["aria-label"]).toBe("Змінити ім'я");
    expect(profile(state).find("name-input")).toBeUndefined();
    const give = title?.find("give-away");
    expect(give?.attributes["aria-label"]).toBe("Віддати в добрі руки");
    expect(give?.textContent).toBe("");
    state.ads.push(cat.id);
    expect(profile(state).find("give-away")).toBeUndefined();
    expect(profile(state).textContent).toContain("Зняти оголошення");
  });

  it("вік, порода й стерилізація — одним рядком, без знака статі; невідоме — без нього", () => {
    const state = fullPhone();
    const cat = state.cats[0]!;
    cat.breedKnown = [false, false];
    cat.sterilized = false;
    const head = (): string => profile(state).find("cat-profile-head")?.textContent ?? "";
    expect(head()).toMatch(/^\d+ тиж\S*$/);
    cat.breedKnown = [true, true];
    cat.sterilized = true;
    cat.sterilizedKnown = true;
    expect(head()).toMatch(/^\d+ тиж\S* · \S.* · (кастрований|стерилізована)$/);
    expect(profile(state).textContent).not.toContain("Порода:");
    expect(head()).not.toMatch(/[♂♀]/);
  });
});

describe("телефон — смартфон набік", () => {
  it("на кожній вкладці — оформлення телефона, вкладки й хрестик", () => {
    const state = fullPhone();
    for (const tab of TABS) {
      const card = phoneCard(state, tab, handlers);
      expect(card.skin, tab).toBe("phone");
      expect(card.tabs?.find((t) => t.active)?.label, tab).toBeDefined();
      expect(card.closable, tab).toBe(true);
      expect(card.onDismiss, tab).toBe(handlers.close);
    }
  });

  it("рядок стану першим у тілі: годинник гри, значки зв'язку й батареї приховані від читача екрана", () => {
    const state = fullPhone();
    for (const minute of [9 * 60 + 5, 23 * 60 + 59]) {
      state.minute = minute;
      for (const tab of TABS) {
        const bar = phoneCard(state, tab, handlers).body[0] as unknown as FakeElement;
        expect(bar.className, tab).toBe("phone-status");
        expect(bar.find("phone-clock")?.textContent, tab).toBe(formatClock(minute));
        const icons = bar.find("phone-status-icons");
        expect(icons?.attributes["aria-hidden"]).toBe("true");
        expect(icons?.find("phone-signal")).toBeDefined();
        expect(icons?.find("phone-battery")).toBeDefined();
      }
    }
    expect(formatClock(9 * 60 + 5)).toBe("09:05");
  });

  // `phone.css` фарбує плитку вкладки за її місцем: Магазин і Речі — перші дві, Коти — третя з іконкою, Альбом — посередині без
  // іконки, Гра — остання без іконки; Профіль — за `data-tab`. Змінився порядок чи іконки — треба змінити й кольори там.
  it("порядок вкладок і їхні іконки — ті, на які спираються кольори плиток", () => {
    const glyphs = Object.keys(GLYPH_ART);
    const hasGlyph = (label: string): boolean => glyphs.some((g) => label.includes(g));
    const labels = (state: GameState): string[] => (phoneCard(state, "shop", handlers).tabs ?? []).map((t) => t.label);
    const full = labels(fullPhone());
    expect(full).toHaveLength(5);
    expect(full.map(hasGlyph)).toEqual([true, true, true, false, false]);
    expect(full.at(-2)).toContain("Профіль");
    expect(full.at(-1)).toContain("Гра");
    // Альбому немає (§8.4): коти, з якими попрощалися, вкладки не дають, хоч у стані вони є (`fullPhone`).
    expect((phoneCard(fullPhone(), "shop", handlers).tabs ?? []).map((t) => t.id)).toEqual(["shop", "home", "cats", "profile", "game"]);
    // Без котів — лише Магазин, Речі, Профіль і Гра.
    const fresh = labels(newGame({ address: "she", difficulty: "normal", seed: 8 }).current);
    expect(fresh).toEqual([full[0], full[1], full[3], full[4]]);
  });
});

describe("вкладка «Гра»: складність (§5.2)", () => {
  it("угорі — вибір складності, обрано поточну; вибір іншої передає її обробнику", () => {
    const state = newGame({ address: "she", difficulty: "hard", seed: 8 }).current;
    const chosen: string[] = [];
    const parts = phoneCard(state, "game", { ...handlers, difficulty: (d) => chosen.push(d) }).body.filter((p) => typeof p !== "string") as unknown as FakeElement[];
    // Перший елемент — рядок стану телефона, далі — вміст вкладки.
    expect(parts[1]?.className).toBe("game-difficulty");
    const group = parts[1]?.find("choices");
    const buttons = (group?.children ?? []) as FakeElement[];
    expect(group?.attributes.role).toBe("radiogroup");
    expect(buttons.map((b) => [b.textContent, b.attributes["aria-checked"]])).toEqual([
      ["Мамина царапка", "false"],
      ["Як у всіх", "false"],
      ["Реалістичний", "true"],
      ["Укро Кіт", "false"],
    ]);
    buttons[0]?.click();
    expect(chosen).toEqual(["easy"]);
  });
});
