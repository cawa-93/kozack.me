// Картка на місці (GAME_DESIGN §8.5 «На місці — кадр парковки»): тло під карткою затемнене слабше (`.away`) — хоч би де стояла
// картка, а притиснута ліворуч вона (`.aside`) лише тоді, коли праворуч уміщається парковка. Обидва класи ставить день щокадру,
// а меню, титулка й кінець гри (`solid`) і закрита картка їх не мають. Годинник на місці — у примітці праворуч від заголовка
// картки пункту (рішення автора 2026-11-03: підпису «Поїздка» немає), і видно його лише з карткою посередині: коли вона
// ліворуч, час показує напис над парковкою.

import { readFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { TRIPS } from "../src/sim/config";
import { newGame } from "../src/sim/game";
import { formatClock } from "../src/sim/time";
import type { Destination } from "../src/sim/types";
import { Overlay, type Card } from "../src/ui/overlay";
import { visitCard, type VisitHandlers } from "../src/ui/trips";

const css = readFileSync(new URL("../src/ui/overlay.css", import.meta.url), "utf8").split("\r\n").join("\n");

/** Тіло правила CSS, що починається селектором `selector` (перше входження). */
function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`немає правила ${selector}`);
  return css.slice(start, css.indexOf("}", start));
}

/**
 * Найпростіший DOM для `Overlay` і карток пунктів: елемент пам'ятає класи (`className` і `classList` — те саме), текст, дітей і
 * `hidden`; решта — те, що вони викликають, без дії.
 */
class FakeElement {
  hidden = false;
  id = "";
  textContent = "";
  disabled = false;
  readonly style: Record<string, string> = {};
  children: (FakeElement | string)[] = [];
  private readonly classes = new Set<string>();
  readonly classList = {
    add: (...names: string[]): void => names.forEach((n) => this.classes.add(n)),
    remove: (...names: string[]): void => names.forEach((n) => this.classes.delete(n)),
    toggle: (name: string, force?: boolean): boolean => {
      const on = force ?? !this.classes.has(name);
      if (on) this.classes.add(name);
      else this.classes.delete(name);
      return on;
    },
    contains: (name: string): boolean => this.classes.has(name),
  };

  constructor(readonly tagName: string) {}

  get className(): string {
    return [...this.classes].join(" ");
  }

  set className(value: string) {
    this.classes.clear();
    for (const name of value.split(/\s+/)) if (name) this.classes.add(name);
  }

  append(...nodes: (FakeElement | string)[]): void {
    this.children.push(...nodes);
  }

  prepend(...nodes: (FakeElement | string)[]): void {
    this.children.unshift(...nodes);
  }

  replaceChildren(...nodes: (FakeElement | string)[]): void {
    this.children = nodes;
  }

  setAttribute(): void {}

  addEventListener(): void {}

  querySelector(): null {
    return null;
  }
}

describe("картка на місці: тло й положення (§8.5 «На місці — кадр парковки»)", () => {
  const body = new FakeElement("body");

  beforeAll(() => {
    vi.stubGlobal("document", { body, createElement: (tag: string) => new FakeElement(tag), createTreeWalker: () => ({ nextNode: () => null }) });
    vi.stubGlobal("NodeFilter", { SHOW_TEXT: 4 });
    vi.stubGlobal("window", { addEventListener: (): void => {} });
  });
  afterAll(() => vi.unstubAllGlobals());

  /** Нова картка й її корінь (`.overlay`). */
  function setup(): { overlay: Overlay; root: FakeElement } {
    const overlay = new Overlay();
    const root = body.children.at(-1);
    if (!(root instanceof FakeElement)) throw new Error("корінь картки не додано");
    return { overlay, root };
  }

  const card: Card = { title: "Ветеринар", body: ["Бублик у переносці."], actions: [{ label: "Додому", primary: true, onSelect: () => {} }] };
  /** Дитина-елемент панелі з цим класом. */
  const child = (parent: FakeElement | undefined, className: string): FakeElement | undefined =>
    parent?.children.find((c): c is FakeElement => c instanceof FakeElement && c.className === className);

  it("слабше тло (.away) і картка ліворуч (.aside) — окремо: посередині тло теж слабше", () => {
    const { overlay, root } = setup();
    overlay.show(card);
    overlay.setAway(true);
    overlay.setAside(false);
    expect(root.classList.contains("away")).toBe(true);
    expect(root.classList.contains("aside")).toBe(false);
    overlay.setAside(true);
    expect(root.classList.contains("aside")).toBe(true);
    // Нова картка поверх парковки (картки з черги, той самий пункт після послуги) — класи лишаються: їх знімає день.
    overlay.show(card);
    expect(root.classList.contains("away")).toBe(true);
    expect(root.classList.contains("aside")).toBe(true);
    overlay.setAway(false);
    overlay.setAside(false);
    expect(root.classList.contains("away")).toBe(false);
    expect(root.classList.contains("aside")).toBe(false);
  });

  it("меню (solid) і закрита картка — без них", () => {
    const { overlay, root } = setup();
    overlay.show(card);
    overlay.setAway(true);
    overlay.setAside(true);
    overlay.show({ ...card, solid: true });
    expect(root.classList.contains("solid")).toBe(true);
    expect(root.classList.contains("away")).toBe(false);
    expect(root.classList.contains("aside")).toBe(false);

    overlay.show(card);
    overlay.setAway(true);
    overlay.setAside(true);
    overlay.close();
    expect(root.hidden).toBe(true);
    expect(root.classList.contains("away")).toBe(false);
    expect(root.classList.contains("aside")).toBe(false);
  });

  it("годинник на місці (awayClock) — останнім у примітці праворуч від заголовка (рішення автора 2026-11-03); без примітки заголовок як був", () => {
    const { overlay, root } = setup();
    overlay.show({ ...card, awayClock: "10:45" });
    const panel = root.children[0] as FakeElement;
    const head = child(panel, "card-head");
    expect(child(head, "card-title")?.textContent).toBe("Ветеринар");
    const note = child(head, "card-aside");
    const clock = note?.children.at(-1) as FakeElement | undefined;
    expect(clock?.className).toBe("card-aside-part card-clock");
    expect(clock?.textContent).toBe("🕐 10:45");
    // Підзаголовка немає, якщо його не передали.
    expect(child(panel, "card-kicker")).toBeUndefined();

    // Примітка — частини по черзі, годинник — останнім.
    overlay.show({ ...card, aside: ["Пробки", "👛 300 ₴"], awayClock: "10:45" });
    const parts = child(child(root.children[0] as FakeElement, "card-head"), "card-aside")?.children as FakeElement[];
    expect(parts.map((p) => p.textContent)).toEqual(["Пробки", "👛 300 ₴", "🕐 10:45"]);
    expect(parts.map((p) => p.className)).toEqual(["card-aside-part", "card-aside-part", "card-aside-part card-clock"]);

    // Іншим карткам нічого не змінюється: заголовок — прямо в картці, без рядка з приміткою.
    overlay.show({ ...card, kicker: "Подія дня" });
    const plain = root.children[0] as FakeElement;
    expect(child(plain, "card-head")).toBeUndefined();
    expect(child(plain, "card-title")?.textContent).toBe("Ветеринар");
    expect(child(plain, "card-kicker")?.children).toEqual([]);
  });

  it("смуга (bar) — після тіла картки й перед кнопками дій; без кнопок дій їхнього рядка немає", () => {
    const { overlay, root } = setup();
    const bar = new FakeElement("div");
    bar.className = "shop-bar";
    overlay.show({ ...card, bar: bar as unknown as HTMLElement, actions: [] });
    const panel = root.children[0] as FakeElement;
    expect(panel.children.at(-1)).toBe(bar);
    expect(child(panel, "card-actions")).toBeUndefined();
    overlay.show({ ...card, bar: bar as unknown as HTMLElement });
    const both = root.children[0] as FakeElement;
    expect(both.children.at(-2)).toBe(bar);
    expect((both.children.at(-1) as FakeElement).className).toBe("card-actions");
  });

  it("картка пункту — з годинником поїздки (час прибуття, як у написі над парковкою) у кожного пункту, без підпису «Поїздка»", () => {
    const noop = (): void => {};
    const handlers: VisitHandlers = { checkout: noop, exam: noop, treat: noop, treatSelf: noop, adopt: noop, sterilize: noop, buyKitten: noop, groom: noop, show: noop, home: noop };
    for (const destination of Object.keys(TRIPS) as Destination[]) {
      const save = newGame({ address: "she", difficulty: "normal", seed: 8 });
      save.current.minute = 10 * 60 + 45;
      save.current.trip = {
        destination,
        phase: "visit",
        cat: null,
        race: { road: 10, done: 10, minutes: 10, lane: 1, targetLane: 1, speed: 1, cars: [], spawned: 0, rng: 1 },
        losses: [],
        visit: 0,
        seed: 5,
      };
      const shown = visitCard(save.current, { exam: null, done: [] }, handlers);
      expect(shown.kicker, destination).toBeUndefined();
      expect(shown.awayClock, destination).toBe(formatClock(save.current.minute));
      expect(shown.awayClock, destination).toBe("10:45");
    }
  });

  it("CSS: частини примітки біля заголовка переносяться між собою (вузька картка), кожна ціла", () => {
    expect(rule(".card-aside")).toContain("flex-wrap: wrap;");
    expect(rule(".card-aside-part")).toContain("white-space: nowrap;");
  });

  it("CSS: годинник у підзаголовку видно лише на місці з карткою посередині (.away без .aside)", () => {
    expect(rule(".card-clock")).toContain("display: none;");
    expect(rule(".overlay.away:not(.aside) .card-clock")).toContain("display: inline;");
  });

  it("CSS: назва рядка — рукописна, а підпис під нею й опис риси (притулок, розплідник) — звичайним шрифтом", () => {
    expect(rule(".shop-name")).toContain("var(--hand)");
    expect(rule(".shop-stock")).toContain("system-ui");
    expect(rule(".shop-name .trait-about")).toContain("system-ui");
  });

  it("кнопки дій праворуч — лише за actionsEnd (картка пункту), решта карток — як були", () => {
    const { overlay, root } = setup();
    const actions = (): FakeElement | undefined => (root.children[0] as FakeElement).children.find((c): c is FakeElement => c instanceof FakeElement && c.classList.contains("card-actions"));
    overlay.show({ ...card, actionsEnd: true });
    expect(actions()?.className).toBe("card-actions end");
    overlay.show(card);
    expect(actions()?.className).toBe("card-actions");
    expect(rule(".card-actions.end")).toContain("justify-content: flex-end;");
  });

  it("CSS: каталог — контейнер карток варіантів; у двох колонках (і вузькому списку) бірка над ціною; ширший (820 px) лише телефон — картка з вкладками", () => {
    expect(rule(".shop:has(> .shop-item)")).toContain("container: catalog / inline-size;");
    expect(rule(".shop:has(> .shop-item)")).toContain("repeat(auto-fill, minmax(min(340px, 100%), 1fr))");
    expect(css).toContain("@container catalog (min-width: 690px) or (max-width: 459px) {");
    // Картка в один рядок: іконка, назва, бірка з ціною, «−», кількість, «+»; кнопки — не менші за 40 px.
    expect(rule(".shop-item")).toContain("grid-template-columns: 30px minmax(0, 1fr) auto 40px 2.2ch 40px;");
    expect(rule(".button.step,\n.button.step:active:not(:disabled),\n.button.step:disabled")).toContain("width: 40px;");
    // На вигляд 40 px, а дотик — у зоні 44 × 44 px, як затверджені раніше 44 px під палець (рецензія 2026-11-03).
    expect(rule(".button.step")).toContain("position: relative;");
    expect(rule(".button.step::after")).toContain("inset: -2px;");
    // Після товару з однією карткою (нашийник) у двох колонках наступний — з нового рядка.
    expect(rule(".shop-item.single + .shop-item")).toContain("grid-column-start: 1;");
    expect(rule(".card:has(> .card-tabbar)")).toContain("width: min(820px, 100%);");
    // Картка пункту на місці — без вкладок: її ширина лишається 560 px (парковка праворуч, `cardsize.ts`).
    expect(rule(".card")).toContain("width: min(560px, 100%);");
  });

  it("CSS: слабше тло — за .away, а .aside лише притискає картку ліворуч", () => {
    expect(rule(".overlay.away:not(.cinematic):not(.solid)")).toContain("background: var(--dim-away);");
    expect(rule(".overlay.aside:not(.cinematic):not(.solid)")).not.toContain("background");
    expect(rule(".overlay.aside:not(.cinematic):not(.solid)")).toContain("justify-content: flex-start;");
  });
});
