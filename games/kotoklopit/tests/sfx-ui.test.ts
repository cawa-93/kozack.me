// Звуки інтерфейсу (§11.4а; `audio/SOUND.md`, «Хто що озвучує», рядок `ui`): події, моменти сцени й низькі шкали звучать наявними
// звуками; низька шкала — раз на перетин `LOW_STAT`; картки DOM грають відкриття, закриття, кнопку й вкладку.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const played = vi.hoisted(() => [] as string[]);
vi.mock("../src/audio/sfx/sounds", () => ({ uiSound: (group: string, sound: string) => played.push(`${group}/${sound}`) }));

import { soundFile } from "../src/audio/sfx/files";
import { soundBus } from "../src/audio/sfx/bus";
import { group } from "../src/audio/sfx/groups/ui";
import type { Cue, SceneMoment } from "../src/audio/sfx/types";
import { LOW_STAT } from "../src/sim/config";
import type { GameEvent } from "../src/sim/events";
import { newGame } from "../src/sim/game";
import type { GameEnd, GameState } from "../src/sim/types";
import { Overlay, type Card } from "../src/ui/overlay";

const fresh = (): GameState => newGame({ address: "he", difficulty: "normal", seed: 2 }).current;
const names = (cues: readonly Cue[]): string[] => cues.map((c) => c.sound);
const onEvent = (event: GameEvent, state: GameState): readonly Cue[] => group.onEvent?.(event, state) ?? [];
const onScene = (moment: SceneMoment, state: GameState): readonly Cue[] => group.onScene?.(moment, state) ?? [];
const tick = (state: GameState): readonly Cue[] => group.tick?.(state, 16) ?? [];

/** Звук є в групі, закодований, разовий і на шині інтерфейсу (звучить і в поїздці). */
function expectPlayable(sound: string): void {
  const def = group.sounds[sound];
  expect(def, sound).toBeDefined();
  expect(def?.loop, sound).toBeUndefined();
  expect(def?.ui, sound).toBe(true);
  for (const file of def?.files ?? []) expect(soundFile("ui", file), `${sound}: ${file}`).not.toBeNull();
}

describe("звуки інтерфейсу: події й моменти", () => {
  const state = fresh();
  const cases: [GameEvent, string[]][] = [
    [{ type: "refused", object: "fridge", reason: "empty", product: "food" }, ["refused-empty"]],
    [{ type: "refused", object: "first-aid", reason: "kit-empty" }, ["refused-empty"]],
    [{ type: "refused", object: "bowl", reason: "hands-full" }, ["refused"]],
    [{ type: "refused", object: "bed", reason: "too-early" }, ["refused"]],
    [{ type: "refused", object: "washer", reason: "no-power" }, ["refused"]],
    [{ type: "glitch", chance: 0.2, angle: 1 }, []],
    [{ type: "trait-noticed", cat: 1, group: "talkative", stage: 1 }, ["notify"]],
    [{ type: "ordered", delivery: { id: 1, quality: "cheap", at: 100, product: "food" }, price: 50 }, ["ordered"]],
    [{ type: "utilities-paid", amount: 61 }, ["bought"]],
    [{ type: "bought", goods: "food", quality: "cheap", destination: "shop" }, ["bought"]],
    [{ type: "meow", cat: 1 }, []],
    [{ type: "work-started" }, []],
  ];

  it.each(cases)("%o → %o", (event, expected) => {
    const cues = onEvent(event, state);
    expect(names(cues)).toEqual(expected);
    for (const cue of cues) expectPlayable(cue.sound);
  });

  it("титулка ранку — свій сигнал; кінець гри — один звук і для програшу, і для пенсії; засинання й падіння — не цієї групи", () => {
    const s = fresh();
    expect(names(onScene("morning", s))).toEqual(["morning"]);
    const ends: GameEnd[] = ["health", "satiety", "hygiene", "sanity", "eviction", "retirement"];
    for (const end of ends) {
      s.end = end;
      expect(names(onScene("end", s)), end).toEqual(["end"]);
    }
    expect(onScene("fall-asleep", s)).toEqual([]);
    expect(onScene("collapse", s)).toEqual([]);
    for (const sound of ["morning", "end"]) expectPlayable(sound);
    expect(group.sounds["retired"]).toBeUndefined();
  });

  it("музика титрів життя (§4.2) — петля на шині музики: гучність — як у радіо (повзунок радіо), пауза картки її не приглушує", () => {
    const credits = group.sounds["credits"];
    expect(credits?.loop).toBe(true);
    expect(soundBus(credits!)).toBe("music");
    expect(soundBus(group.sounds["end"]!)).toBe("ui");
    expect(credits?.files.length).toBeGreaterThan(0);
    for (const file of credits?.files ?? []) expect(soundFile("ui", file), file).not.toBeNull();
  });
});

describe("низька шкала — раз на перетин LOW_STAT (§6, §11.4а)", () => {
  beforeEach(() => group.reset?.());

  it("звучить, коли шкала опустилась нижче межі, і лише раз, поки знову не піднялась", () => {
    const s = fresh();
    s.character.stats.satiety = LOW_STAT + 5;
    expect(tick(s)).toEqual([]);
    s.character.stats.satiety = LOW_STAT - 1;
    expect(names(tick(s))).toEqual(["low-stat"]);
    expectPlayable("low-stat");
    expect(tick(s)).toEqual([]);
    s.character.stats.satiety = LOW_STAT - 10;
    expect(tick(s)).toEqual([]);
    s.character.stats.satiety = LOW_STAT;
    expect(tick(s)).toEqual([]);
    s.character.stats.satiety = LOW_STAT - 0.5;
    expect(names(tick(s))).toEqual(["low-stat"]);
  });

  it("дві шкали разом — один сигнал; кожна шкала рахується окремо", () => {
    const s = fresh();
    s.character.stats.hygiene = 60;
    s.character.stats.sanity = 60;
    tick(s);
    s.character.stats.hygiene = LOW_STAT - 1;
    s.character.stats.sanity = LOW_STAT - 1;
    expect(names(tick(s))).toEqual(["low-stat"]);
    s.character.stats.health = LOW_STAT - 1;
    expect(names(tick(s))).toEqual(["low-stat"]);
  });

  it("день показують заново чи настав ранок — шкала, що вже низька, мовчить", () => {
    const s = fresh();
    s.character.stats.hygiene = 60;
    tick(s);
    // Уночі гігієна впала, а звуки мовчали: ранок починається з титулки, а не з тривоги.
    s.character.stats.hygiene = LOW_STAT - 3;
    onScene("morning", s);
    expect(tick(s)).toEqual([]);
    group.reset?.();
    expect(tick(s)).toEqual([]);
  });

  it("щокадру без змін — той самий порожній набір, без нових об'єктів", () => {
    const s = fresh();
    expect(tick(s)).toBe(tick(s));
  });
});

/** Найпростіший DOM для `Overlay`: класи, діти, слухачі й `closest` — лише для самої кнопки. */
class FakeElement {
  hidden = false;
  id = "";
  textContent = "";
  disabled = false;
  readonly style: Record<string, string> = {};
  children: (FakeElement | string)[] = [];
  readonly listeners: { type: string; fn: (event: unknown) => void; capture: boolean }[] = [];
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

  addEventListener(type: string, fn: (event: unknown) => void, capture?: boolean): void {
    this.listeners.push({ type, fn, capture: capture === true });
  }

  querySelector(): null {
    return null;
  }

  closest(selector: string): FakeElement | null {
    return selector === this.tagName ? this : null;
  }

  /** Усі нащадки з цим класом. */
  findAll(className: string): FakeElement[] {
    const own = this.children.filter((c): c is FakeElement => typeof c !== "string");
    return [...own.filter((c) => c.classList.contains(className)), ...own.flatMap((c) => c.findAll(className))];
  }

  /** Натискання, як у браузері: перехоплення на корені, тоді сама кнопка, тоді спливання на корінь. */
  click(root: FakeElement): void {
    const event = { target: this, stopPropagation: (): void => {} };
    for (const l of root.listeners) if (l.type === "click" && l.capture) l.fn(event);
    for (const l of this.listeners) if (l.type === "click") l.fn(event);
    for (const l of root.listeners) if (l.type === "click" && !l.capture) l.fn(event);
  }
}

describe("картки звучать (§11.4а): відкрилась, закрилась, кнопка, вкладка", () => {
  const body = new FakeElement("body");
  let keydown: ((event: unknown) => void) | null = null;

  beforeAll(() => {
    vi.stubGlobal("document", { body, createElement: (tag: string) => new FakeElement(tag), createTreeWalker: () => ({ nextNode: () => null }), activeElement: null });
    vi.stubGlobal("NodeFilter", { SHOW_TEXT: 4 });
    vi.stubGlobal("window", { addEventListener: (type: string, fn: (event: unknown) => void): void => void (type === "keydown" && (keydown = fn)) });
    for (const name of ["HTMLInputElement", "HTMLSelectElement", "HTMLTextAreaElement", "HTMLButtonElement"]) vi.stubGlobal(name, class {});
  });
  afterAll(() => vi.unstubAllGlobals());
  beforeEach(() => (played.length = 0));

  function setup(): { overlay: Overlay; root: FakeElement } {
    const overlay = new Overlay();
    const root = body.children.at(-1);
    if (!(root instanceof FakeElement)) throw new Error("корінь картки не додано");
    return { overlay, root };
  }

  const card = (overlay: Overlay, tabs = false): Card => ({
    title: "Телефон",
    body: ["Текст."],
    ...(tabs ? { tabs: [{ label: "Гра", active: true, onSelect: () => {} }, { label: "Магазин", onSelect: () => {} }] } : {}),
    actions: [
      { label: "Зрозуміло", primary: true, onSelect: () => overlay.close() },
      { label: "Ні", disabled: true, onSelect: () => {} },
    ],
  });

  it("відкриття — раз, коли картки не було; перемальовування тієї самої мовчить; закриття — раз", () => {
    const { overlay } = setup();
    overlay.show(card(overlay));
    overlay.show(card(overlay));
    expect(played).toEqual(["ui/open"]);
    overlay.close();
    overlay.close();
    expect(played).toEqual(["ui/open", "ui/close"]);
  });

  it("кнопка — клац перед закриттям, вкладка — свій звук, вимкнена кнопка мовчить", () => {
    const { overlay, root } = setup();
    overlay.show(card(overlay, true));
    played.length = 0;
    root.findAll("card-tab")[1]?.click(root);
    expect(played).toEqual(["ui/tab"]);
    played.length = 0;
    const [ok, no] = root.findAll("button").filter((b) => b.tagName === "button" && !b.classList.contains("card-tab"));
    no?.click(root);
    expect(played).toEqual([]);
    ok?.click(root);
    expect(played).toEqual(["ui/click", "ui/close"]);
  });

  it("Enter натискає головну дію з клацом; титулку гортають без клацу й без звуку закриття", () => {
    const { overlay } = setup();
    overlay.show(card(overlay));
    played.length = 0;
    keydown?.({ key: "Enter", repeat: false, preventDefault: () => {}, stopImmediatePropagation: () => {} });
    expect(played).toEqual(["ui/click", "ui/close"]);
    played.length = 0;
    overlay.title([{ heading: "Понеділок", blocks: [["Тиждень 1"]] }], () => {});
    overlay.close();
    expect(played).toEqual([]);
  });

  it("усе, що грають картки, є в групі ui", () => {
    for (const sound of ["open", "close", "click", "tab"]) expectPlayable(sound);
  });
});
