// Назви іконок і ключі текстур (крок 16, хвиля 0): одне місце, де іконка стає текстурою, — щоб потім
// підмінити малюнки кодом кадрами атласу, не чіпаючи ні баблів, ні панелі.

import { describe, expect, it } from "vitest";

import { bubbleTexture, ICON_NAMES, iconTexture, markTexture } from "../src/view/iconnames";
import { PRODUCT_ICONS, refusalBubble } from "../src/view/symbols";

describe("назви іконок", () => {
  it("кожна назва — одна, ключі текстур ті самі, що й раніше", () => {
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
    expect(iconTexture("food")).toBe("icon-food");
    expect(iconTexture("mood-up")).toBe("icon-mood-up");
    expect(markTexture("no")).toBe("mark-no");
    expect(bubbleTexture("say")).toBe("bubble-say");
    expect(bubbleTexture("think")).toBe("bubble-think");
  });

  it("іконки запасів і відмов — з переліку назв", () => {
    const names = new Set<string>(ICON_NAMES);
    for (const icon of Object.values(PRODUCT_ICONS)) expect(names.has(icon), icon).toBe(true);
    expect(names.has(refusalBubble({ reason: "no-room" }).icon)).toBe(true);
  });
});
