// Відмови (§11.4, правило автора 2026-10-25): кожна причина — своя зрозуміла іконка.

import { describe, expect, it } from "vitest";

import { PRODUCTS } from "../src/sim/config";
import type { Need, Refusal } from "../src/sim/events";
import { addSupply } from "../src/sim/economy";
import { interact, newGame } from "../src/sim/game";
import type { Item, Product, Save } from "../src/sim/types";
import { refusalBubble } from "../src/view/symbols";
import { recordEvents, walkTo, withCatCorner } from "./helpers";

const ITEMS: Item[] = [
  { kind: "raw", quality: "cheap" },
  { kind: "meal", quality: "cheap" },
  { kind: "burnt", quality: "cheap" },
  { kind: "catfood", quality: "cheap", sterile: false },
  { kind: "catfood", quality: "cheap", sterile: true },
  { kind: "cat", cat: 1 },
  { kind: "toy", toy: { id: 1, kind: "toy", quality: "cheap", x: 0, y: 0, uses: 0 } },
];
const NEEDS: Need[] = ["raw", "dish", "catfood", "cat", "item", "dirty-litter"];

/** Приклад кожної причини відмови з кожним можливим уточненням. */
const ALL: Refusal[] = [
  { reason: "hands-full" },
  ...(Object.keys(PRODUCTS) as Product[]).map((product): Refusal => ({ reason: "empty", product })),
  ...ITEMS.map((item): Refusal => ({ reason: "not-here", item })),
  { reason: "occupied" },
  { reason: "full", what: "bowl" },
  { reason: "full", what: "water" },
  { reason: "clean" },
  { reason: "mixed" },
  ...NEEDS.map((need): Refusal => ({ reason: "need", need })),
  { reason: "too-early" },
  { reason: "washing" },
  { reason: "cat-on-computer" },
  { reason: "no-power" },
  { reason: "no-packages" },
  { reason: "healthy" },
  { reason: "dose-taken" },
  { reason: "no-room" },
  { reason: "kit-empty" },
];

function game(): Save {
  const save = withCatCorner(newGame({ sex: "female", difficulty: "normal", seed: 5 }));
  save.current.modifiers.day = null;
  return save;
}

function refusalAt(save: Save, id: string): Refusal | undefined {
  walkTo(save, id);
  const { events, stop } = recordEvents();
  interact(save);
  stop();
  const event = events.find((e) => e.type === "refused");
  if (!event || event.type !== "refused") return undefined;
  const { type: _type, object: _object, ...refusal } = event;
  return refusal;
}

describe("відмови (§11.4, правило автора 2026-10-25)", () => {
  it("кожна причина відмови — своя іконка, ні з чим не сплутати", () => {
    const keys = ALL.map((r) => {
      const { icon, count, mark } = refusalBubble(r);
      return `${icon}|${count ?? ""}|${mark ?? ""}`;
    });
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("причина каже, що саме заважає", () => {
    const save = game();
    expect(refusalAt(save, "trash")).toEqual({ reason: "need", need: "item" });
    expect(refusalAt(save, "stove")).toEqual({ reason: "need", need: "raw" });
    expect(refusalAt(save, "door")).toEqual({ reason: "no-packages" });
    // Аптечку видно, коли в ній уже щось бувало.
    addSupply(save.current, "pills", "cheap", 1);
    expect(refusalAt(save, "cat-kit")).toEqual({ reason: "need", need: "cat" });
    expect(refusalAt(save, "sink")).toEqual({ reason: "healthy" });
    save.current.home.supplies.catFood = { cheap: 0, premium: 0 };
    addSupply(save.current, "catFood", "cheap", 0);
    expect(refusalAt(save, "cat-cabinet")).toEqual({ reason: "empty", product: "catFood" });
    save.current.home.washer = { state: "washing", minutes: 30, quality: "cheap" };
    expect(refusalAt(save, "washer")).toEqual({ reason: "washing" });
    const litter = save.current.home.items.find((i) => i.kind === "litter");
    if (litter?.kind !== "litter") throw new Error("немає лотка");
    Object.assign(litter, { uses: 0, litter: "cheap" });
    expect(refusalAt(save, `item:${litter.id}`)).toEqual({ reason: "clean" });
    const water = save.current.home.items.find((i) => i.kind === "water");
    expect(refusalAt(save, `item:${water?.id}`)).toEqual({ reason: "full", what: "water" });
  });
});
