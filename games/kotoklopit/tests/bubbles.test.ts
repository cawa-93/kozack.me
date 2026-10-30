// Бабли вголос і думки (§11.4, правка автора 2026-10-25): думка — лише над головою персонажа чи кота,
// над річчю — завжди вголос; відмова — думка персонажа.

import { describe, expect, it } from "vitest";

import type { GameEvent } from "../src/sim/events";
import type { Delivery } from "../src/sim/types";
import { eventBubbles, type EventBubble } from "../src/view/symbols";

const delivery: Delivery = { id: 1, quality: "cheap", at: 0, product: "food" };

/** Приклад кожної події, що показує бабл. */
const EVENTS: GameEvent[] = [
  { type: "refused", object: "fridge", reason: "empty", product: "food" },
  { type: "refused", object: "bed", reason: "too-early" },
  { type: "refused", object: "computer", reason: "cat-on-computer" },
  { type: "supply-used", product: "hygiene", left: 3 },
  { type: "received", deliveries: [delivery, { ...delivery, id: 2 }] },
  { type: "glitch", chance: 0.1, angle: 30 },
  { type: "tripped", cat: 1 },
  { type: "slipped", mess: 1 },
  { type: "knocked-down", cat: 1 },
  { type: "ambushed", cat: 1 },
  { type: "sock-found", where: "trip" },
  { type: "sock-found", where: "vacuum" },
  { type: "cabinet-pawed", cat: 1, opened: true },
  { type: "cabinet-pawed", cat: 1, opened: false },
  { type: "trash-tipped", cat: 1 },
  { type: "chewing", cat: 1, what: "wire" },
  { type: "chewing", cat: 1, what: "boxes" },
  { type: "wire-chewed", cat: 1 },
  { type: "catnip", cat: 1, reaction: "roll" },
  { type: "catnip", cat: 1, reaction: "sniff" },
  { type: "catnip", cat: 1, reaction: "frenzy" },
  { type: "chatter", cat: 1 },
  { type: "groom-refused", cat: 1, by: 2 },
  { type: "cat-cuddled", cat: 1, with: 2 },
  { type: "window-angry", cat: 1 },
  { type: "cat-remembered", cat: 1, zone: "desk" },
  { type: "cat-remembered", cat: 1, zone: "kitchen" },
  { type: "bite", cat: 1 },
  { type: "clawed", cat: 1, at: "carrier" },
  { type: "clawed", cat: 1, at: "bath" },
  { type: "clawed", cat: 1, at: "ambush" },
  { type: "picked-up", cat: 1, offended: true },
  { type: "cat-dodged", cat: 1, issue: "clothes" },
  { type: "cat-left", cat: 1 },
  { type: "sulked", cat: 1 },
  { type: "symptom", cat: 1, symptom: "sneeze" },
  { type: "symptom", cat: 1, symptom: "itch" },
  { type: "symptom", cat: 1, symptom: "eyes" },
  { type: "symptom", cat: 1, symptom: "pain" },
  { type: "medicine-spat", cat: 1, medicine: "pills" },
  { type: "medicine-spat", cat: 1, medicine: "drops" },
  { type: "meow", cat: 1 },
  { type: "meow", cat: 1, silent: true },
  { type: "knocked", cat: 1, object: "table", item: { kind: "meal", quality: "cheap" } },
  { type: "stole", cat: 1, object: "stove", item: { kind: "meal", quality: "cheap" } },
  { type: "trinket-fell", cat: 1, trinket: "mug", object: "table", broken: true },
  { type: "trinket-fell", cat: 1, trinket: "pen", object: "computer", broken: false },
  { type: "trinket-sniffed", cat: 1, trinket: "phone" },
  { type: "hissed", cat: 1, at: 2 },
  { type: "hissed", cat: 1, at: 2, why: "bowl" },
  { type: "hissed", cat: 1, at: 2, why: "litter" },
  { type: "hissed", cat: 1, at: 2, why: "window" },
  { type: "hissed", cat: 1, at: 2, why: "hand" },
  { type: "hissed", cat: 1, at: 2, why: "kitten" },
  { type: "keyboard", cat: 1 },
  { type: "escaped", cat: 1 },
  { type: "laundry", stage: "spin" },
  { type: "scared", cat: 1 },
  { type: "cat-woke", cat: 1 },
  { type: "nervous", cat: 1 },
  { type: "cat-refused-food", cat: 1 },
  { type: "tap-opened", cat: 1 },
  { type: "litter-refused", cat: 1 },
  { type: "coughing", cat: 1 },
  { type: "fur-tuft", cat: 1 },
  { type: "doorbell", delivery },
  { type: "doorbell" },
  { type: "hissed-guests", cat: 1 },
  { type: "feeder", bowls: [3, 4] },
  { type: "call-remark", issue: "clothes" },
  { type: "standup-started" },
  { type: "standup", attended: false, reputation: -5 },
  { type: "job-rejected", vacancy: 1 },
  { type: "modifier", kind: "meeting-start", value: 0 },
];

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
      { kind: "say", at: "item:3", icon: "kibble" },
      { kind: "say", at: "item:4", icon: "kibble" },
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

  it("пропущеної летучки немає — бабла немає", () => {
    expect(eventBubbles({ type: "standup", attended: true, reputation: 2 })).toEqual([]);
    expect(eventBubbles({ type: "modifier", kind: "reputation", value: 3 })).toEqual([]);
  });
});
