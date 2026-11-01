// Назви іконок і ключі текстур (крок 16, хвиля 0): одне місце, де іконка стає текстурою чи кадром атласу.

import { describe, expect, it } from "vitest";

import { bubbleArt, ICON_NAMES, iconArt, iconTexture, markArt } from "../src/view/iconnames";
import { PRODUCT_ICONS, refusalBubble } from "../src/view/symbols";

describe("назви іконок", () => {
  it("кожна назва — одна; ключ текстури й кадри атласу — за назвою", () => {
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
    expect(iconTexture("food")).toBe("icon-food");
    expect(iconTexture("mood-up")).toBe("icon-mood-up");
    expect(iconArt("food")).toBe("icon/food");
    expect(markArt("no")).toBe("icon/mark/no");
    expect(bubbleArt("say")).toBe("ui/bubble/say");
    expect(bubbleArt("think")).toBe("ui/bubble/think");
  });

  it("іконки запасів і відмов — з переліку назв", () => {
    const names = new Set<string>(ICON_NAMES);
    for (const icon of Object.values(PRODUCT_ICONS)) expect(names.has(icon), icon).toBe(true);
    expect(names.has(refusalBubble({ reason: "no-room" }).icon)).toBe(true);
  });
});
