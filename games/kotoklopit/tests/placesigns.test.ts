// Оформлення карток на місці (GAME_DESIGN §8.5 «Оформлення поїздок»): картка кожного пункту — зі своїм оформленням
// `place-<пункт>` (класи `.card-place` і `.card-place-<пункт>`), а картка аварії — без вивіски. Колір вивіски в `places.css` —
// дах пункту біля парковки (`DESTINATION_ROOFS`).

import { readFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createCat } from "../src/sim/cat";
import { TRIPS } from "../src/sim/config";
import { newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Destination, Trip } from "../src/sim/types";
import { Overlay, type Card } from "../src/ui/overlay";
import { accidentCard, visitCard, type VisitHandlers } from "../src/ui/trips";
import { DESTINATION_ROOFS } from "../src/view/racelook";

const css = readFileSync(new URL("../src/ui/places.css", import.meta.url), "utf8").split("\r\n").join("\n");

/** Найпростіший DOM для карток пунктів і `Overlay`: класи, діти, текст; решта — без дії. */
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

const destinations = Object.keys(TRIPS) as Destination[];
const noop = (): void => {};
const handlers: VisitHandlers = { checkout: noop, exam: noop, nextCat: noop, treat: noop, treatSelf: noop, adopt: noop, sterilize: noop, buyKitten: noop, groom: noop, show: noop, home: noop };

/** Персонаж на місці в пункті `destination` (з котом, якщо туди їздять із котом). */
function arrived(destination: Destination, phase: Trip["phase"] = "visit"): ReturnType<typeof newGame>["current"] {
  const save = newGame({ address: "she", difficulty: "normal", seed: 8 });
  save.current.modifiers.day = null;
  save.current.character.money = 400;
  const cat = createCat(save.current, createRng(3), { source: "shelter", ageWeeks: 20, at: { x: 9.5, y: 8.5 } });
  addCat(save.current, cat);
  save.current.trip = {
    destination,
    phase,
    cat: TRIPS[destination].cat ? cat.id : null,
    race: { road: 10, done: 10, minutes: 10, lane: 1, targetLane: 1, speed: 1, cars: [], spawned: 0, rng: 1 },
    losses: [],
    visit: 0,
    seed: 5,
  };
  return save.current;
}

describe("вивіска пункту на картці на місці (§8.5 «Оформлення поїздок»)", () => {
  const body = new FakeElement("body");

  beforeAll(() => {
    vi.stubGlobal("document", { body, createElement: (tag: string) => new FakeElement(tag), createTreeWalker: () => ({ nextNode: () => null }) });
    vi.stubGlobal("NodeFilter", { SHOW_TEXT: 4 });
    vi.stubGlobal("window", { addEventListener: (): void => {} });
  });
  afterAll(() => vi.unstubAllGlobals());

  /** Класи панелі картки, яку показав `Overlay`. */
  function panelClasses(card: Card): string[] {
    const overlay = new Overlay();
    const root = body.children.at(-1);
    if (!(root instanceof FakeElement)) throw new Error("корінь картки не додано");
    overlay.show(card);
    const panel = root.children[0];
    if (!(panel instanceof FakeElement)) throw new Error("панелі картки немає");
    return panel.className.split(" ");
  }

  it("картка кожного пункту — зі своїм оформленням place-<пункт> і класами .card-place, .card-place-<пункт>", () => {
    expect(destinations.length).toBe(8);
    for (const d of destinations) {
      const card = visitCard(arrived(d), { exam: null, done: [] }, handlers);
      expect(card.skin, d).toBe(`place-${d}`);
      const classes = panelClasses(card);
      expect(classes, d).toContain("card");
      expect(classes, d).toContain("card-place");
      expect(classes, d).toContain(`card-place-${d}`);
    }
  });

  it("картка аварії — без вивіски", () => {
    for (const d of destinations) {
      const card = accidentCard(arrived(d, "accident"), noop);
      expect(card.skin, d).toBeUndefined();
      expect(panelClasses(card), d).toEqual(["card"]);
    }
  });

  it("CSS: у кожного пункту своє правило з кольором вивіски — дахом пункту біля парковки", () => {
    for (const d of destinations) {
      const at = css.indexOf(`\n.card-place-${d} {`);
      expect(at, d).toBeGreaterThan(0);
      const rule = css.slice(at, css.indexOf("}", at));
      const roof = `#${DESTINATION_ROOFS[d].toString(16).padStart(6, "0")}`;
      expect(rule, d).toContain(`--place: ${roof};`);
    }
  });
});
