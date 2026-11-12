// Живий портрет кота в картці (§9.7, `ui/liveportrait.ts`): картка за краєм прокрутки портрета не складає; перший кадр — поза
// спокою, щойно картку видно, а кіт, уже складений раніше (картку відкривали чи телефон її перебудував), — одразу, без порожнього
// кадру. Компонувальник підмінено: тут важливо, коли й що портрет просить намалювати.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCat } from "../src/sim/cat";
import { newGame } from "../src/sim/game";
import { createRng } from "../src/sim/rng";
import type { Cat } from "../src/sim/types";
import type { PortraitPart } from "../src/view/art/compose";
import { catPortraitParts } from "../src/view/iso/catportrait";

const h = vi.hoisted(() => ({
  draws: [] as { cachedOnly: boolean; parts: readonly unknown[] }[],
  /** Що відповідає «лише з кешу»: чи все для цієї пози вже складено. */
  cached: false,
}));

vi.mock("../src/view/art/compose", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/view/art/compose")>();
  class FigureCanvas {
    draw(parts: readonly PortraitPart[], opts: { cachedOnly?: boolean } = {}): boolean {
      h.draws.push({ cachedOnly: opts.cachedOnly === true, parts });
      return opts.cachedOnly === true ? h.cached : true;
    }
  }
  return { ...real, FigureCanvas };
});

class FakeObserver {
  static last: FakeObserver | null = null;
  readonly observed = new Set<Element>();
  constructor(readonly callback: IntersectionObserverCallback) {
    FakeObserver.last = this;
  }
  observe(target: Element): void {
    this.observed.add(target);
  }
  unobserve(target: Element): void {
    this.observed.delete(target);
  }
  disconnect(): void {
    this.observed.clear();
  }
}

/** Спостерігач каже, що полотно з'явилося на екрані чи зникло з нього. */
function show(canvas: HTMLCanvasElement, visible: boolean): void {
  const observer = FakeObserver.last;
  if (!observer) throw new Error("спостерігача немає");
  observer.callback([{ target: canvas, isIntersecting: visible } as unknown as IntersectionObserverEntry], observer as unknown as IntersectionObserver);
}

let frames: FrameRequestCallback[] = [];
/** Кадр циклу портретів у мить `at` мс від створення. */
function frame(at: number): void {
  const now = frames;
  frames = [];
  for (const callback of now) callback(performance.now() + at);
}

function cat(): Cat {
  const save = newGame({ address: "she", difficulty: "normal", seed: 3 });
  return createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 30, sex: "male", at: { x: 6.5, y: 9.5 } });
}

async function live(): Promise<typeof import("../src/ui/liveportrait")> {
  vi.resetModules();
  return import("../src/ui/liveportrait");
}

beforeEach(() => {
  h.draws = [];
  h.cached = false;
  frames = [];
  FakeObserver.last = null;
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
});
afterEach(() => vi.unstubAllGlobals());

describe("живий портрет: перший кадр — коли видно", () => {
  it("картка за краєм не складає портрета; щойно її видно — кадр спокою, далі — цикл", async () => {
    const { liveCatPortrait } = await live();
    const kitty = cat();
    const rest = catPortraitParts(kitty);
    const canvas = { isConnected: true } as unknown as HTMLCanvasElement;
    liveCatPortrait(canvas, kitty);
    // Лише спроба з уже складеного: складати нічого не можна, поки картки не видно.
    expect(h.draws).toEqual([{ cachedOnly: true, parts: rest }]);
    show(canvas, false);
    frame(100);
    expect(h.draws).toHaveLength(1);

    show(canvas, true);
    expect(h.draws.slice(1)).toEqual([{ cachedOnly: false, parts: rest }]);
    // Перший кадр уже є: далі малює цикл, а не кожна поява на екрані.
    show(canvas, false);
    show(canvas, true);
    expect(h.draws).toHaveLength(2);
    frame(200);
    expect(h.draws.slice(2).map((d) => d.cachedOnly)).toEqual([false]);
  });

  it("кіт, уже складений раніше, — одразу, без порожнього кадру й без другого першого кадру", async () => {
    const { liveCatPortrait } = await live();
    h.cached = true;
    const canvas = { isConnected: true } as unknown as HTMLCanvasElement;
    liveCatPortrait(canvas, cat());
    expect(h.draws.map((d) => d.cachedOnly)).toEqual([true]);
    show(canvas, true);
    expect(h.draws).toHaveLength(1);
  });
});
