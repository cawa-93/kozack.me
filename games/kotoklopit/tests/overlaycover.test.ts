// Непрозора картка закриває гру (§2.1 «Малювання й завантаження»): титулка, екран кінця гри й титри (`.cinematic`, поки не
// почався світанок `.dawn`), меню й вибір персонажа (`.solid`). Під такою карткою день не малює квартири (`Overlay.covers`).
// Тло `.cinematic` проявляється за 0,9 с (`transition` у overlay.css): поверх напівпрозорої картки воно непрозоре лише потім.

import { readFileSync } from "node:fs";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { Overlay, type Card } from "../src/ui/overlay";

const css = readFileSync(new URL("../src/ui/overlay.css", import.meta.url), "utf8").split("\r\n").join("\n");

/** Найпростіший DOM для `Overlay`: класи, діти, `hidden`, стиль і слухачі подій (їх можна викликати — `fire`). */
class FakeElement {
  hidden = false;
  id = "";
  textContent = "";
  disabled = false;
  readonly style: Record<string, string> = {};
  children: (FakeElement | string)[] = [];
  private readonly classes = new Set<string>();
  private readonly listeners = new Map<string, (() => void)[]>();
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

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  fire(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  querySelector(): null {
    return null;
  }
}

describe("непрозора картка закриває гру (§2.1)", () => {
  const body = new FakeElement("body");

  beforeAll(() => {
    vi.stubGlobal("document", { body, createElement: (tag: string) => new FakeElement(tag), createTreeWalker: () => ({ nextNode: () => null }) });
    vi.stubGlobal("NodeFilter", { SHOW_TEXT: 4 });
    vi.stubGlobal("window", { addEventListener: (): void => {} });
  });
  afterAll(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  });
  afterEach(() => vi.useRealTimers());

  function setup(): { overlay: Overlay; root: FakeElement } {
    const overlay = new Overlay();
    const root = body.children.at(-1);
    if (!(root instanceof FakeElement)) throw new Error("корінь картки не додано");
    return { overlay, root };
  }

  const card: Card = { title: "Подія дня", body: ["Прийшли гості."], actions: [{ label: "Зрозуміло", primary: true, onSelect: () => {} }] };
  const part = (): HTMLElement => new FakeElement("p") as unknown as HTMLElement;

  it("звичайна картка гри не закриває (квартиру під нею видно), меню й вибір персонажа (solid) — закривають", () => {
    const { overlay } = setup();
    expect(overlay.covers).toBe(false);
    overlay.show(card);
    expect(overlay.covers).toBe(false);
    overlay.setAway(true);
    expect(overlay.covers).toBe(false);
    overlay.show({ ...card, solid: true });
    expect(overlay.covers).toBe(true);
    overlay.show(card);
    expect(overlay.covers).toBe(false);
    overlay.show({ ...card, solid: true });
    overlay.close();
    expect(overlay.covers).toBe(false);
  });

  it("титулка: тиждень з ефектами, день з ефектами й решта — три групи з більшим відступом між ними (.section-start)", () => {
    const { overlay, root } = setup();
    overlay.title(
      [
        { heading: "Тиждень 2", blocks: [["Чорна п'ятниця", "Усе дешевше"]] },
        { heading: "Вівторок", blocks: [["Планове відключення", "Світла немає"], ["Завтра виставка"]] },
        { blocks: [["Мурка будила вночі"], ["Прийшов рахунок"]] },
      ],
      () => {},
    );
    const screen = root.children[0] as FakeElement;
    const starts = screen.children.map((child) => (child as FakeElement).classList.contains("section-start"));
    // Заголовок тижня, його блок; заголовок дня — початок групи, два його блоки; перша подія — початок групи, друга; підказка.
    expect(starts).toEqual([false, false, true, false, false, true, false, false]);
    // Відступ групи більший за звичайний відступ заголовка (1.5vh) і замінює його.
    expect(css).toMatch(/\.title-heading \{\s*margin: 1\.5vh 0 0;/);
    expect(css).toMatch(/\.title-screen > \.section-start \{\s*margin-top: 3vh;/);
  });

  it("титулка: тиждень без модифікатора — лише заголовок; день однаково починає нову групу", () => {
    const { overlay, root } = setup();
    overlay.title([{ heading: "Тиждень 1", blocks: [] }, { heading: "Понеділок", blocks: [] }], () => {});
    const screen = root.children[0] as FakeElement;
    expect(screen.children.map((child) => (child as FakeElement).classList.contains("section-start"))).toEqual([false, true, false]);
  });

  it("титулка закриває гру одразу, а з початком світанку (.dawn) — уже ні: квартира проступає", () => {
    const { overlay, root } = setup();
    const done = vi.fn();
    overlay.title([{ heading: "Тиждень 1", blocks: [["Понеділок"]] }], done);
    expect(overlay.covers).toBe(true);
    const screen = root.children[0] as FakeElement;
    // Перше натискання до кінця показу відкриває все, друге — вихід: текст гасне (0,6 с), потім світанок (0,9 с).
    screen.fire("click");
    screen.fire("click");
    expect(overlay.covers).toBe(true);
    vi.advanceTimersByTime(600);
    expect(root.classList.contains("dawn")).toBe(true);
    expect(overlay.covers).toBe(false);
    vi.advanceTimersByTime(900);
    expect(done).toHaveBeenCalledOnce();
    expect(overlay.covers).toBe(false);
  });

  it("екран кінця гри й титри закривають гру", () => {
    const { overlay } = setup();
    overlay.ending([part()], [{ label: "Нова гра", primary: true, onSelect: () => {} }]);
    expect(overlay.covers).toBe(true);
    overlay.credits(part(), []);
    expect(overlay.covers).toBe(true);
    overlay.close();
    expect(overlay.covers).toBe(false);
  });

  it("поверх напівпрозорої картки тло титулки чи кінця гри непрозоре лише після проявлення (0,9 с); поверх меню — одразу", () => {
    const { overlay } = setup();
    overlay.show(card);
    overlay.ending([part()], []);
    expect(overlay.covers).toBe(false);
    vi.advanceTimersByTime(899);
    expect(overlay.covers).toBe(false);
    vi.advanceTimersByTime(1);
    expect(overlay.covers).toBe(true);

    overlay.show(card);
    overlay.title([{ blocks: [["Понеділок"]] }], () => {});
    expect(overlay.covers).toBe(false);
    vi.advanceTimersByTime(900);
    expect(overlay.covers).toBe(true);

    // Меню — те саме чорнило, що й тло титулки: непрозоре весь час.
    overlay.show({ ...card, solid: true });
    overlay.title([{ blocks: [["Понеділок"]] }], () => {});
    expect(overlay.covers).toBe(true);
  });

  it("CSS: тло титулки проявляється за 0,9 с, меню — тим самим чорнилом", () => {
    const rule = (selector: string): string => {
      const start = css.indexOf(`\n${selector} {`);
      if (start < 0) throw new Error(`немає правила ${selector}`);
      return css.slice(start, css.indexOf("}", start));
    };
    expect(rule(".overlay.cinematic")).toContain("transition: background-color 0.9s ease;");
    expect(rule(".overlay.cinematic")).toContain("background: var(--ink);");
    expect(rule(".overlay.solid:not(.cinematic)")).toContain("background: var(--dim-solid);");
    const theme = readFileSync(new URL("../src/ui/theme.css", import.meta.url), "utf8");
    expect(theme).toContain("--ink: #2e1f29;");
    expect(theme).toContain("--dim-solid: rgb(46 31 41);");
  });
});
