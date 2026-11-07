// Іконки карток наперед (§2): порядок файлів і завантаження порціями.

import { describe, expect, it } from "vitest";

import { glyphUrls } from "../src/ui/glyphs";
import { iconUrl, iconUrls } from "../src/ui/icons";
import { cardArtUrls, warmImages } from "../src/ui/warmart";
import { DESTINATION_ICONS } from "../src/view/symbols";

describe("іконки карток наперед (§2)", () => {
  it("спершу гліфи й пункти поїздки, усі іконки — по одному разу", () => {
    const urls = cardArtUrls();
    expect(new Set(urls).size).toBe(urls.length);
    for (const url of iconUrls()) if (!url.startsWith("data:")) expect(urls).toContain(url);
    const first = urls.slice(0, glyphUrls().length + Object.keys(DESTINATION_ICONS).length);
    for (const icon of Object.values(DESTINATION_ICONS)) expect(first).toContain(iconUrl(icon));
  });

  it("вбудоване в код запиту не потребує", () => {
    expect(cardArtUrls().some((url) => url.startsWith("data:"))).toBe(false);
  });

  it("наступна порція — лише після попередньої, і файл, що не прийшов, не зупиняє решту", async () => {
    const urls = Array.from({ length: 13 }, (_, i) => `file-${i}`);
    let running = 0;
    let most = 0;
    const loaded: string[] = [];
    await warmImages(
      urls,
      async (url) => {
        running += 1;
        most = Math.max(most, running);
        await Promise.resolve();
        running -= 1;
        loaded.push(url);
        if (url === "file-2") throw new Error("немає мережі");
      },
      () => Promise.resolve(),
    );
    expect(loaded.sort()).toEqual([...urls].sort());
    expect(most).toBeLessThanOrEqual(6);
  });
});
