// Найпростіший DOM без браузера для тестів карток (`src/ui/`): класи, текст, діти, вимкненість, натискання й наведення вказівника.

import { afterAll, beforeAll, vi } from "vitest";

/** Подія, яку отримують слухачі фальшивого елемента: натискання не йде далі, вказівник — миша. */
interface FakeEvent {
  target: FakeElement;
  pointerType: "mouse";
  stopPropagation(): void;
}

export class FakeElement {
  className = "";
  disabled = false;
  title = "";
  hidden = false;
  type = "";
  readonly style: Record<string, unknown> & { setProperty(name: string, value: string): void } = {
    setProperty: (name: string, value: string): void => {
      this.style[name] = value;
    },
  };
  children: (FakeElement | string)[] = [];
  private readonly listeners = new Map<string, ((event: FakeEvent) => void)[]>();
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

  contains(node: unknown): boolean {
    return node === this || this.children.some((c) => typeof c !== "string" && c.contains(node));
  }

  addEventListener(type: string, listener: (event: FakeEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  /** Подія `type` на елементі: натискання — лише на ввімкненому. */
  dispatch(type: string): void {
    if (type === "click" && this.disabled) return;
    const event: FakeEvent = { target: this, pointerType: "mouse", stopPropagation: () => undefined };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  click(): void {
    this.dispatch("click");
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

export const fake = (el: HTMLElement | undefined): FakeElement => el as unknown as FakeElement;

/** Підмінити `document` фальшивим на час файлу тестів. */
export function useFakeDom(): void {
  beforeAll(() => {
    vi.stubGlobal("document", {
      createElement: (tag: string) => new FakeElement(tag),
      createTreeWalker: () => ({ nextNode: () => null }),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    vi.stubGlobal("NodeFilter", { SHOW_TEXT: 4 });
  });
  afterAll(() => vi.unstubAllGlobals());
}
