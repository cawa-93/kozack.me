// Картка на місці (GAME_DESIGN §8.5 «На місці — кадр парковки»): тло під карткою затемнене слабше (`.away`) — хоч би де стояла
// картка, а притиснута ліворуч вона (`.aside`) лише тоді, коли праворуч уміщається парковка. Обидва класи ставить день щокадру,
// а меню, титулка й кінець гри (`solid`) і закрита картка їх не мають.

import { readFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { Overlay, type Card } from "../src/ui/overlay";

const css = readFileSync(new URL("../src/ui/overlay.css", import.meta.url), "utf8").split("\r\n").join("\n");

/** Тіло правила CSS, що починається селектором `selector` (перше входження). */
function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`немає правила ${selector}`);
  return css.slice(start, css.indexOf("}", start));
}

/** Найпростіший DOM для `Overlay`: елемент пам'ятає класи (`className` і `classList` — те саме), дітей і `hidden`. */
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

  it("CSS: слабше тло — за .away, а .aside лише притискає картку ліворуч", () => {
    expect(rule(".overlay.away:not(.cinematic):not(.solid)")).toContain("background: var(--dim-away);");
    expect(rule(".overlay.aside:not(.cinematic):not(.solid)")).not.toContain("background");
    expect(rule(".overlay.aside:not(.cinematic):not(.solid)")).toContain("justify-content: flex-start;");
  });
});
