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
  { type: "bite", cat: 1 },
  { type: "clawed", cat: 1 },
  { type: "picked-up", cat: 1, offended: true },
  { type: "cat-dodged", cat: 1, issue: "clothes" },
  { type: "cat-left", cat: 1 },
  { type: "sulked", cat: 1 },
  { type: "symptom", cat: 1, symptom: "sneeze" },
  { type: "symptom", cat: 1, symptom: "itch" },
  { type: "symptom", cat: 1, symptom: "eyes" },
  { type: "meow", cat: 1 },
  { type: "meow", cat: 1, silent: true },
  { type: "knocked", cat: 1, object: "table", item: { kind: "meal", quality: "cheap" } },
  { type: "stole", cat: 1, object: "stove", item: { kind: "meal", quality: "cheap" } },
  { type: "trinket-fell", cat: 1, trinket: "mug", object: "table", broken: true },
  { type: "trinket-fell", cat: 1, trinket: "pen", object: "computer", broken: false },
  { type: "trinket-sniffed", cat: 1, trinket: "phone" },
  { type: "hissed", cat: 1, at: 2 },
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
    expect(only({ type: "meow", cat: 7 })).toMatchObject({ kind: "say", at: "cat:7" });
  });

  it("чхання чути, а свербіж і очі кіт відчуває", () => {
    expect(only({ type: "symptom", cat: 2, symptom: "sneeze" }).kind).toBe("say");
    expect(only({ type: "symptom", cat: 2, symptom: "itch" })).toMatchObject({ kind: "think", at: "cat:2" });
    expect(only({ type: "symptom", cat: 2, symptom: "eyes" })).toMatchObject({ kind: "think", at: "cat:2" });
  });

  it("автогодівниця досипала кілька мисок — над кожною вголос", () => {
    expect(eventBubbles({ type: "feeder", bowls: [3, 4] })).toEqual([
      { kind: "say", at: "item:3", icon: "kibble" },
      { kind: "say", at: "item:4", icon: "kibble" },
    ]);
  });

  it("пропущеної летучки немає — бабла немає", () => {
    expect(eventBubbles({ type: "standup", attended: true, reputation: 2 })).toEqual([]);
    expect(eventBubbles({ type: "modifier", kind: "reputation", value: 3 })).toEqual([]);
  });
});
