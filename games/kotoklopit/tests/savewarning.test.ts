// Гра не зберігається в браузері (§4.2): картка каже про це й радить зберегти гру файлом — тут-таки кнопкою.

import { describe, expect, it } from "vitest";

import { SAVE_FAILED } from "../src/texts";
import { saveFailedCard } from "../src/ui/savewarning";

describe("картка «Гра не зберігається»", () => {
  it("каже, що браузер не зберігає гру, і радить зберегти її файлом", () => {
    const card = saveFailedCard(() => undefined, () => undefined);
    expect(card.kicker).toBe(SAVE_FAILED.kicker);
    expect(card.title).toBe(SAVE_FAILED.title);
    expect(card.body).toEqual([SAVE_FAILED.body]);
    expect(SAVE_FAILED.body).toMatch(/файлом/);
  });

  it("«Зрозуміло» ліворуч, «Зберегти файлом» — головна, праворуч: зберігає й закриває картку", () => {
    const calls: string[] = [];
    const card = saveFailedCard(
      () => calls.push("save"),
      () => calls.push("close"),
    );
    expect(card.steps).toBe(true);
    expect(card.actions.map((action) => action.label)).toEqual([SAVE_FAILED.ok, SAVE_FAILED.save]);
    expect(card.actions.map((action) => action.primary === true)).toEqual([false, true]);
    card.actions[1]?.onSelect();
    expect(calls).toEqual(["save", "close"]);
    card.actions[0]?.onSelect();
    card.onDismiss?.();
    expect(calls).toEqual(["save", "close", "close", "close"]);
  });
});
