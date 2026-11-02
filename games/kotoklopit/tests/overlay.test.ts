// Картка на місці (GAME_DESIGN §8.5 «На місці — кадр парковки»): тло під карткою затемнене слабше (`.away`) — хоч би де стояла
// картка, а притиснута ліворуч вона (`.aside`) лише тоді, коли праворуч уміщається парковка. Обидва класи ставить день щокадру,
// а меню, титулка й кінець гри (`solid`) і закрита картка їх не мають. Годинник на місці — у підзаголовку картки пункту, і видно
// його лише з карткою посередині: коли вона ліворуч, час показує напис над парковкою.

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

  const card: Card = { kicker: "Поїздка", title: "Ветеринар", body: ["Бублик у переносці."], actions: [{ label: "Додому", primary: true, onSelect: () => {} }] };

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

  it("годинник на місці (awayClock) — у підзаголовку картки окремим елементом; без нього підзаголовок як був", () => {
    const { overlay, root } = setup();
    overlay.show({ ...card, awayClock: "10:45" });
    const panel = root.children[0] as FakeElement;
    const kicker = panel.children.find((c): c is FakeElement => c instanceof FakeElement && c.className === "card-kicker");
    expect(kicker?.textContent).toBe("Поїздка");
    const clock = kicker?.children[0] as FakeElement | undefined;
    expect(clock?.className).toBe("card-clock");
    expect(clock?.textContent).toBe(" · 10:45");

    overlay.show(card);
    const plain = (root.children[0] as FakeElement).children.find((c): c is FakeElement => c instanceof FakeElement && c.className === "card-kicker");
    expect(plain?.children).toEqual([]);
  });

  it("картка пункту — з годинником поїздки (час прибуття, як у написі над парковкою) у кожного пункту", () => {
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
      expect(shown.kicker, destination).toBe("Поїздка");
      expect(shown.awayClock, destination).toBe(formatClock(save.current.minute));
      expect(shown.awayClock, destination).toBe("10:45");
    }
  });

  it("CSS: годинник у підзаголовку видно лише на місці з карткою посередині (.away без .aside)", () => {
    expect(rule(".card-clock")).toContain("display: none;");
    expect(rule(".overlay.away:not(.aside) .card-clock")).toContain("display: inline;");
  });

  it("CSS: слабше тло — за .away, а .aside лише притискає картку ліворуч", () => {
    expect(rule(".overlay.away:not(.cinematic):not(.solid)")).toContain("background: var(--dim-away);");
    expect(rule(".overlay.aside:not(.cinematic):not(.solid)")).not.toContain("background");
    expect(rule(".overlay.aside:not(.cinematic):not(.solid)")).toContain("justify-content: flex-start;");
  });
});
