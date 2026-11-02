// Розміри картки в TS (`src/ui/cardsize.ts`) збігаються з CSS (`src/ui/overlay.css`): сцена дороги рахує за ними, де парковка
// (§8.5 «На місці — кадр парковки»), тож правка картки в CSS без правки тут розвела б їх.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { asideCardRight, CARD_CSS } from "../src/ui/cardsize";

const css = readFileSync(new URL("../src/ui/overlay.css", import.meta.url), "utf8").split("\r\n").join("\n");

/** Тіло першого правила `selector {` у тексті CSS (до першої закривної дужки). */
function rule(text: string, selector: string): string {
  const at = text.indexOf(`${selector} {`);
  if (at < 0) return "";
  return text.slice(at, text.indexOf("}", at));
}

describe("розміри картки", () => {
  it("ширина, поле й виступ рамки — як у CSS", () => {
    expect(rule(css, "\n.card")).toContain(`width: min(${CARD_CSS.width}px, 100%)`);
    expect(rule(css, "\n.card")).toMatch(new RegExp(`border-image: [^;]*/ ${CARD_CSS.outset}px stretch`));
    expect(rule(css, "\n.overlay")).toContain(`padding: ${CARD_CSS.pad}px;`);
  });

  it("низький екран — як у CSS", () => {
    const at = css.indexOf(`@media (max-height: ${CARD_CSS.low.maxHeight}px)`);
    expect(at).toBeGreaterThan(0);
    const media = css.slice(at);
    expect(rule(media, ".overlay")).toContain(`padding: ${CARD_CSS.low.pad}px;`);
    expect(rule(media, ".card")).toContain(`border-image-outset: ${CARD_CSS.low.outset}px;`);
  });

  it("правий край притиснутої ліворуч картки", () => {
    expect(asideCardRight({ width: 1280, height: 720 })).toBe(16 + 560 + 4);
    expect(asideCardRight({ width: 844, height: 390 })).toBe(8 + 560 + 3);
    // Виріз камери ліворуч ширший за поле — картка від нього.
    expect(asideCardRight({ width: 844, height: 390 }, 47, 47)).toBe(47 + 560 + 3);
    // Вузьке вікно — картка на всю ширину між полями.
    expect(asideCardRight({ width: 400, height: 800 })).toBe(16 + 368 + 4);
  });
});
