// Екран титрів життя (§4.2, `src/ui/lifecredits.ts`) без браузера: коли малюються фото, як перераховується розмітка в такт,
// що лишається після кінця стрічки й від чого рахуються долі музики.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CreditsBlock } from "../src/ui/creditsplan";
import { beatPx, CREDITS_INTRO, rollSpeed } from "../src/ui/rollmath";

const plan = vi.hoisted(() => ({ blocks: [] as unknown[] }));
const music = vi.hoisted(() => ({ heard: null as number | null }));
vi.mock("../src/ui/creditsplan", () => ({ creditsPlan: () => plan.blocks }));
vi.mock("../src/ui/photo", () => ({ drawPhoto: vi.fn() }));
vi.mock("../src/ui/cards", () => ({ timeBar: () => null }));
vi.mock("../src/ui/icons", () => ({ iconImage: () => null }));
vi.mock("../src/audio/sfx/sounds", () => ({ uiSound: () => undefined, sceneLoop: () => ({ set: () => undefined, startedAt: () => music.heard, stop: () => undefined }) }));

import { drawPhoto } from "../src/ui/photo";
import { lifeCredits } from "../src/ui/lifecredits";
import type { GameState } from "../src/sim/types";

/** Що читали й писали в розмітці, по черзі: `read` — висоти, `write <властивість>` — стилі. */
let log: string[] = [];

class El {
  className = "";
  textContent = "";
  isConnected = false;
  scrollTop = 0;
  width = 0;
  height = 0;
  /** Висота блоку, px; екран — `clientHeight`. */
  box = 40;
  view = 0;
  children: El[] = [];
  readonly listeners = new Map<string, ((event: unknown) => void)[]>();
  private readonly classes = new Set<string>();
  readonly classList = {
    add: (name: string): void => void this.classes.add(name),
    remove: (name: string): void => void this.classes.delete(name),
    contains: (name: string): boolean => this.classes.has(name),
  };
  readonly style: Record<string, unknown> = new Proxy({ setProperty: () => undefined } as Record<string, unknown>, {
    set: (target, prop, value): boolean => {
      log.push(`write ${String(prop)}`);
      target[prop as string] = value;
      return true;
    },
  });

  constructor(readonly tagName: string) {}

  get offsetHeight(): number {
    log.push("read");
    return this.box;
  }

  get clientHeight(): number {
    log.push("read");
    return this.view;
  }

  get firstElementChild(): El | null {
    return this.children[0] ?? null;
  }

  get childElementCount(): number {
    return this.children.length;
  }

  append(...nodes: El[]): void {
    this.children.push(...nodes);
  }

  setAttribute(): void {}

  addEventListener(type: string, fn: (event: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }

  closest(): null {
    return null;
  }

  all(tag: string): El[] {
    return this.children.flatMap((child) => [...(child.tagName === tag ? [child] : []), ...child.all(tag)]);
  }
}

class FakeObserver {
  static all: FakeObserver[] = [];
  readonly targets = new Set<El>();
  disconnected = false;

  constructor(
    readonly callback: (entries: { target: El; isIntersecting: boolean }[]) => void,
    readonly options: IntersectionObserverInit,
  ) {
    FakeObserver.all.push(this);
  }

  observe(target: El): void {
    this.targets.add(target);
  }

  unobserve(target: El): void {
    this.targets.delete(target);
  }

  disconnect(): void {
    this.disconnected = true;
    this.targets.clear();
  }

  /** Ці полотна підійшли до екрана. */
  show(targets: El[]): void {
    this.callback(targets.map((target) => ({ target, isIntersecting: true })));
  }
}

let queue: ((now: number) => void)[] = [];
let windowListeners: { type: string; fn: unknown }[] = [];
let reduced = false;

/** Кадри від `from` до `to` мс кроком 16 мс; повертає мить останнього. */
function frames(from: number, to: number): number {
  let now = from;
  for (; now <= to; now += 16) {
    const run = queue;
    queue = [];
    for (const callback of run) callback(now);
  }
  return now - 16;
}

const polaroid = (n: number): CreditsBlock => ({ kind: "polaroid", caption: { title: `Фото ${n}` }, photo: {} as never });

/** Титри на екрані висотою `view` px: титул, тиждень і три полароїди; `track` — висота стрічки. */
function show({ view = 800, track = 4000 } = {}): { screen: El; track: El; canvases: El[]; observer: FakeObserver } {
  plan.blocks = [{ kind: "title", name: "Соломія", weeks: "20 тижнів", finale: "Фінал" }, { kind: "week", label: "Тиждень 1" }, polaroid(1), polaroid(2), polaroid(3)];
  const { screen } = lifeCredits({} as GameState, () => undefined);
  const el = screen as unknown as El;
  el.view = view;
  el.isConnected = true;
  const trackEl = el.children[0]!;
  trackEl.box = track;
  return { screen: el, track: trackEl, canvases: el.all("canvas"), observer: FakeObserver.all.at(-1)! };
}

beforeEach(() => {
  log = [];
  queue = [];
  windowListeners = [];
  reduced = false;
  music.heard = null;
  FakeObserver.all = [];
  vi.mocked(drawPhoto).mockClear();
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  vi.stubGlobal("document", { createElement: (tag: string) => new El(tag) });
  vi.stubGlobal("window", {
    innerWidth: 400,
    innerHeight: 800,
    addEventListener: (type: string, fn: unknown) => windowListeners.push({ type, fn }),
    removeEventListener: (type: string, fn: unknown) => (windowListeners = windowListeners.filter((l) => l.type !== type || l.fn !== fn)),
  });
  vi.stubGlobal("requestAnimationFrame", (callback: (now: number) => void) => queue.push(callback));
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
  vi.stubGlobal("devicePixelRatio", 2);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("титри життя: долі — від миті, коли музику справді стало чути (§4.2)", () => {
  it("музика декодувалась і вступила пізніше, ніж її попросили: стрічка йде за її долями", () => {
    const view = 800;
    const { track } = show({ view });
    const begin = 1000;
    frames(begin, begin);
    // Музику просять, щойно стихає кінець гри, а чути її стає за 300 мс (декодування й затримка виходу).
    music.heard = begin + CREDITS_INTRO.endMs + 300;
    const last = frames(begin + 16, begin + CREDITS_INTRO.endMs + 12_000);
    const offset = -Number(/translate3d\(0, (-?[\d.]+)px/.exec(String(track.style["transform"]))?.[1]);
    const beat = beatPx(view);
    const e = (((offset - rollSpeed(view) * (last - music.heard)) % beat) + beat) % beat;
    expect(Math.min(e, beat - e)).toBeLessThan(0.6);
  });
});
