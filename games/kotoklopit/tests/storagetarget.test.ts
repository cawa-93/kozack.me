// Індикатори сховищ (§6.4) питають ціль дії персонажа — кожне сховище й ящики біля входу. День рахує її раз за кадр і передає
// всім (`storageIndicator`, `boxesIndicator` з `target`), а не кличе `targetOf` для кожного з дев'яти.

import { describe, expect, it } from "vitest";

import { newGame } from "../src/sim/game";
import { boxesIndicator, STORAGES, storageIndicator } from "../src/sim/storage";
import { targetById, targetOf } from "../src/sim/targets";
import { walkTo } from "./helpers";

const storage = (object: string) => STORAGES.find((s) => s.object === object)!;

describe("індикатори сховищ — з ціллю кадру (§6.4)", () => {
  it("передана ціль — та, за якою видно вміст: персонаж деінде, а ціль кадру — холодильник", () => {
    const save = newGame({ address: "she", difficulty: "normal", seed: 3 });
    const state = save.current;
    state.home.supplies.food = { cheap: 0, premium: 0 };
    expect(targetOf(state)?.id).not.toBe("fridge");
    expect(storageIndicator(state, storage("fridge"))).toEqual([]);
    const fridge = targetById(state, "fridge");
    expect(fridge?.id).toBe("fridge");
    expect(storageIndicator(state, storage("fridge"), fridge)).toEqual([{ product: "food", count: 0, limit: 40 }]);

    // Біля холодильника, а ціль кадру — жодна: нічого.
    walkTo(save, "fridge");
    expect(storageIndicator(state, storage("fridge"))).toEqual([{ product: "food", count: 0, limit: 40 }]);
    expect(storageIndicator(state, storage("fridge"), null)).toEqual([]);
    // Та сама ціль, що й `targetOf`, — те саме, що без неї.
    for (const s of STORAGES) expect(storageIndicator(state, s, targetOf(state)), s.object).toEqual(storageIndicator(state, s));
  });

  it("ящики біля входу — так само", () => {
    const save = newGame({ address: "she", difficulty: "normal", seed: 3 });
    const state = save.current;
    state.home.boxes = { hygiene: { cheap: 15, premium: 0 } };
    expect(targetOf(state)?.id).not.toBe("boxes");
    expect(boxesIndicator(state)).toEqual([]);
    const boxes = targetById(state, "boxes");
    expect(boxes?.id).toBe("boxes");
    expect(boxesIndicator(state, boxes)).toEqual([{ product: "hygiene", count: 15 }]);
    expect(boxesIndicator(state, null)).toEqual([]);
  });
});
