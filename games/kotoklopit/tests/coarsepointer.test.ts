// Сенсорний екран (§10, `isCoarsePointer`): гонка питає це щокадру (підказка старту), тож запит до браузера — один на гру, а
// відповідь — жива: телефон, до якого під'єднали мишу, перестає бути сенсорним без перезавантаження.

import { afterEach, describe, expect, it, vi } from "vitest";

describe("сенсорний екран (§10)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("один запит `matchMedia` на гру, відповідь — щоразу поточна", async () => {
    const query = { matches: true };
    const matchMedia = vi.fn((text: string) => (text === "(pointer: coarse)" ? query : { matches: false }));
    vi.stubGlobal("window", { matchMedia });
    const { isCoarsePointer } = await import("../src/screen");
    expect(isCoarsePointer()).toBe(true);
    expect(isCoarsePointer()).toBe(true);
    query.matches = false;
    expect(isCoarsePointer()).toBe(false);
    expect(matchMedia).toHaveBeenCalledTimes(1);
  });
});
