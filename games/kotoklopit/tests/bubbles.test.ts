// Бабли вголос і думки (§11.4, правка автора 2026-10-25): думка — лише над головою персонажа чи кота,
// над річчю — завжди вголос; відмова — думка персонажа.

import { describe, expect, it } from "vitest";

import type { GameEvent } from "../src/sim/events";
import { eventBubbles, stoveIcon, type EventBubble } from "../src/view/symbols";
import { EVENTS } from "./bubblecases";

const only = (event: GameEvent): EventBubble => {
  const bubbles = eventBubbles(event);
  expect(bubbles).toHaveLength(1);
  return bubbles[0] as EventBubble;
};

describe("бабли вголос і думки (§11.4, правка автора 2026-10-25)", () => {
  it("кожна з подій показує бабл", () => {
    for (const event of EVENTS) expect(eventBubbles(event).length, event.type).toBeGreaterThan(0);
  });

  it("думка — лише над головою персонажа чи кота, речі не думають", () => {
    for (const bubble of EVENTS.flatMap(eventBubbles)) {
      if (bubble.kind === "think") expect(bubble.at === "person" || bubble.at.startsWith("cat:"), bubble.icon).toBe(true);
    }
  });

  it("відмова — думка персонажа, з іконкою причини", () => {
    expect(only({ type: "refused", object: "fridge", reason: "empty", product: "food" })).toEqual({ kind: "think", at: "person", icon: "food", count: 0 });
    expect(only({ type: "refused", object: "washer", reason: "washing" })).toMatchObject({ kind: "think", at: "person", icon: "washer" });
  });

  it("витратив запас — подумав, скільки лишилося", () => {
    expect(only({ type: "supply-used", product: "hygiene", left: 3 })).toEqual({ kind: "think", at: "person", icon: "soap", count: 3 });
  });

  it("вголос — над тим, хто звучить: ображений кіт шипить над собою, а не над персонажем", () => {
    expect(only({ type: "picked-up", cat: 7, offended: true })).toMatchObject({ kind: "say", at: "cat:7" });
    expect(eventBubbles({ type: "picked-up", cat: 7, offended: false })).toEqual([]);
    expect(only({ type: "bite", cat: 7 })).toMatchObject({ kind: "say", at: "person" });
    // Подряпина у ванні — той самий бабл «кігті», що й біля переноски (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А5).
    expect(only({ type: "clawed", cat: 7, at: "bath" })).toEqual(only({ type: "clawed", cat: 7, at: "carrier" }));
    expect(only({ type: "clawed", cat: 7, at: "bath" })).toMatchObject({ kind: "say", at: "person", icon: "claws" });
    // І в засідці «Ніндзя» — той самий бабл (рішення автора 2026-10-30, «Відкрите після рішень», п. 6).
    expect(only({ type: "clawed", cat: 7, at: "ambush" })).toEqual(only({ type: "clawed", cat: 7, at: "carrier" }));
    expect(only({ type: "meow", cat: 7 })).toMatchObject({ kind: "say", at: "cat:7" });
  });

  it("чхання й крик болю чути, а свербіж і очі кіт відчуває", () => {
    expect(only({ type: "symptom", cat: 2, symptom: "sneeze" }).kind).toBe("say");
    expect(only({ type: "symptom", cat: 2, symptom: "pain" })).toMatchObject({ kind: "say", at: "cat:2", icon: "pain" });
    expect(only({ type: "symptom", cat: 2, symptom: "itch" })).toMatchObject({ kind: "think", at: "cat:2" });
    expect(only({ type: "symptom", cat: 2, symptom: "eyes" })).toMatchObject({ kind: "think", at: "cat:2" });
  });

  it("автогодівниця досипала кілька мисок — над кожною вголос", () => {
    expect(eventBubbles({ type: "feeder", bowls: [3, 4] })).toEqual([
      { kind: "say", at: "item:3", icon: "kibble-pour" },
      { kind: "say", at: "item:4", icon: "kibble-pour" },
    ]);
  });

  it("шипіння з причиною — вголос над тим, хто шипить, і кожна причина — своя іконка, не така, як без причини (§9.4, Р2)", () => {
    const causes = ["bowl", "litter", "window", "hand", "kitten"] as const;
    const icons = causes.map((why) => {
      const bubble = only({ type: "hissed", cat: 1, at: 2, why });
      expect(bubble.kind).toBe("say");
      expect(bubble.at).toBe("cat:1");
      return bubble.icon;
    });
    const plain = only({ type: "hissed", cat: 1, at: 2 }).icon;
    expect(plain).toBe("angry");
    expect(new Set([...icons, plain]).size).toBe(causes.length + 1);
  });

  it("переляк кота — своя думка, не «!» терпіння над комп'ютером (правило автора 2026-10-30, §11.4)", () => {
    expect(only({ type: "scared", cat: 3 })).toEqual({ kind: "think", at: "cat:3", icon: "fright" });
  });

  it("скинута страва — гуркіт над столом, вкрадена — своя іконка крадіжки над котом, кіт на клавіатурі — кіт на ноутбуці (правило автора 2026-10-30, §11.4)", () => {
    const meal = { kind: "meal", quality: "cheap" } as const;
    expect(only({ type: "knocked", cat: 1, object: "table", item: meal })).toEqual({ kind: "say", at: "table", icon: "loud" });
    // Вкрадена — не іконка страви (готова на плиті чи столі) і не продукти (запас і ситість), хоч би що кіт украв (рецензія 2026-10-30).
    expect(only({ type: "stole", cat: 1, object: "stove", item: meal })).toEqual({ kind: "say", at: "cat:1", icon: "stolen" });
    expect(only({ type: "stole", cat: 1, object: "table", item: { kind: "raw", quality: "cheap" } }).icon).toBe("stolen");
    expect(only({ type: "stole", cat: 1, object: "stove", item: meal }).icon).not.toBe(stoveIcon(meal));
    expect(only({ type: "keyboard", cat: 1 })).toEqual({ kind: "say", at: "computer", icon: "cat-laptop" });
    expect(only({ type: "keyboard", cat: 1 }).icon).toBe(only({ type: "refused", object: "computer", reason: "cat-on-computer" }).icon);
  });

  it("пропущеної летучки немає — бабла немає", () => {
    expect(eventBubbles({ type: "standup", attended: true, reputation: 2 })).toEqual([]);
    expect(eventBubbles({ type: "modifier", kind: "reputation", value: 3 })).toEqual([]);
  });
});
