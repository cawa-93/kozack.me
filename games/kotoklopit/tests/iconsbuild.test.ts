// SVG інтерфейсу в збірці (§2.1 «Малювання й завантаження»): назва файлу з хешем вмісту, адреса `data:` малого файлу й те, які
// імпорти SVG збірка бере на себе.

import { describe, expect, it } from "vitest";

import { hashedName, svgDataUrl, svgImport } from "../scripts/icons/assets";

describe("SVG інтерфейсу в збірці: файли (§2.1)", () => {
  it("хеш у назві — з вмісту: той самий вміст — та сама назва, інший — інша", () => {
    const name = hashedName("kibble", "svg", "<svg/>");
    expect(name).toMatch(/^kibble-[A-Za-z0-9_-]{8}\.svg$/);
    expect(hashedName("kibble", "svg", "<svg/>")).toBe(name);
    expect(hashedName("kibble", "svg", "<svg></svg>")).not.toBe(name);
  });

  it("адреса data: — той самий SVG, без символів, які обривають адресу", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><path d="M1 2L3 4" fill="#6c84a3" opacity="50%"/></svg>`;
    const url = svgDataUrl(svg);
    expect(url.startsWith("data:image/svg+xml,")).toBe(true);
    expect(url).not.toMatch(/[<>#"\s]/);
    expect(decodeURIComponent(url.slice("data:image/svg+xml,".length))).toBe(svg.replaceAll('"', "'"));
  });

  it("адреса data: для SVG з текстом чи лапками в лапках — base64, без переписування лапок", () => {
    for (const svg of [`<svg><text>Кіт "Мурчик"</text></svg>`, `<svg><g style="font-family: 'A B'"/></svg>`]) {
      const url = svgDataUrl(svg);
      expect(url.startsWith("data:image/svg+xml;base64,"), svg).toBe(true);
      expect(Buffer.from(url.slice("data:image/svg+xml;base64,".length), "base64").toString("utf8"), svg).toBe(svg);
    }
  });

  it("збірка бере SVG теки art/, імпортовані текстом чи адресою; решту лишає Vite", () => {
    const art = "D:/game/art";
    expect(svgImport("D:/game/art/icon/kibble.svg?no-inline", art)).toEqual({ file: "D:/game/art/icon/kibble.svg", as: "file" });
    expect(svgImport("D:/game/art/ui/glyph/cart.svg?url", art)).toEqual({ file: "D:/game/art/ui/glyph/cart.svg", as: "url" });
    expect(svgImport("D:/game/art/ui/touch/dash.svg?raw", art)).toEqual({ file: "D:/game/art/ui/touch/dash.svg", as: "raw" });
    expect(svgImport("D:\\game\\art\\icon\\kibble.svg?no-inline", art)?.as).toBe("file");
    expect(svgImport("D:/game/art/icon/kibble.svg", art)).toBeNull();
    expect(svgImport("D:/game/art/palette.ts?url", art)).toBeNull();
    expect(svgImport("D:/game/favicon/tab.svg?url", art)).toBeNull();
    expect(svgImport("D:/game/artful/x.svg?url", art)).toBeNull();
  });
});
