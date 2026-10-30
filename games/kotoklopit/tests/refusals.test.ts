// Відмови (§11.4, правило автора 2026-10-25): кожна причина — своя зрозуміла іконка.

import { describe, expect, it } from "vitest";

import type { Refusal } from "../src/sim/events";
import { addSupply } from "../src/sim/economy";
import { interact, newGame } from "../src/sim/game";
import type { Save } from "../src/sim/types";
import { refusalBubble } from "../src/view/symbols";
import { REFUSALS } from "./bubblecases";
import { recordEvents, walkTo, withCatCorner } from "./helpers";

function game(): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 5 }));
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
    const keys = REFUSALS.map((r) => {
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
