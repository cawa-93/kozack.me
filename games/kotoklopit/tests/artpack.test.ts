// Пакет іконок карток (§2.1 «Малювання й завантаження»): збірка складає всі іконки, позначки й гліфи в один файл, гра бере
// його одним запитом і далі дає карткам адреси з пакета; пакета немає — адреси окремих файлів.

import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { minifySvg } from "../scripts/icons/minify";
import { packJson, packSvgs } from "../scripts/icons/pack";
import { adoptPack, artKey, artUrl, parsePack, retried } from "../src/ui/artpack";
import { glyphUrl } from "../src/ui/glyphs";
import { iconUrl } from "../src/ui/icons";
import { cardArtUrls } from "../src/ui/warmart";
import { GLYPH_ART } from "../src/view/art/manifest/a12-icons";
import { ICON_NAMES } from "../src/view/iconnames";
import { DESTINATION_ICONS } from "../src/view/symbols";

const ART_DIR = fileURLToPath(new URL("../art", import.meta.url));

describe("пакет іконок карток: збірка (§2.1)", () => {
  const svgs = packSvgs(ART_DIR, minifySvg);

  it("у пакеті — кожна іконка, позначка й гліф, і лише вони", () => {
    const expected = [...ICON_NAMES.map((name) => `icon/${name}`), ...["no", "ask", "ok"].map((mark) => `icon/mark/${mark}`), ...new Set(Object.values(GLYPH_ART).map((name) => `ui/glyph/${name}`))];
    for (const key of expected) expect(svgs.has(key), key).toBe(true);
    for (const key of svgs.keys()) expect(key).toMatch(/^(icon|icon\/mark|ui\/glyph)\/[a-z0-9-]+$/);
  });

  it("малюнки в пакеті — мініфіковані", () => {
    for (const [key, svg] of svgs) {
      expect(svg.startsWith("<svg"), key).toBe(true);
      expect(minifySvg(svg), key).toBe(svg);
      expect(svg, key).not.toContain("<!--");
    }
  });

  it("файл пакета гра розбирає в ті самі малюнки; порядок файлів на диску на нього не впливає", () => {
    const json = packJson(svgs);
    expect(parsePack(json)).toEqual(svgs);
    expect(packJson(new Map([...svgs].reverse()))).toBe(json);
  });
});

describe("пакет іконок карток: розбір (§2.1)", () => {
  it("пакет — «назва → текст SVG»", () => {
    expect(parsePack('{"icon/kibble":"<svg a=\\"1\\"/>","ui/glyph/cart":"<svg/>"}')).toEqual(
      new Map([
        ["icon/kibble", '<svg a="1"/>'],
        ["ui/glyph/cart", "<svg/>"],
      ]),
    );
  });

  it("не пакет (сторінка помилки, обірваний файл, інший вміст) — null", () => {
    for (const text of ["", "<!doctype html><html></html>", '{"icon/kibble":"<svg', "null", "[]", '"<svg/>"', "{}", '{"icon/kibble":1}', '{"icon/kibble":"<html>"}']) {
      expect(parsePack(text), text).toBeNull();
    }
  });
});

describe("пакет іконок карток: адреса малюнка (§2.1)", () => {
  const files = { "../../art/icon/kibble.svg": "/assets/kibble-1.svg", "../../art/icon/mark/no.svg": "/assets/no-1.svg" };

  it("назва малюнка в пакеті — шлях від теки art/ без розширення", () => {
    expect(artKey("../../art/icon/kibble.svg")).toBe("icon/kibble");
    expect(artKey("../../art/icon/mark/no.svg")).toBe("icon/mark/no");
    expect(artKey("../../art/ui/glyph/cart.svg")).toBe("ui/glyph/cart");
  });

  it("малюнок є в пакеті — адреса з пакета; пакета немає чи малюнка в ньому немає — адреса файлу", () => {
    const pack = new Map([["icon/kibble", "blob:kibble"]]);
    expect(artUrl("../../art/icon/kibble.svg", files, pack)).toBe("blob:kibble");
    expect(artUrl("../../art/icon/mark/no.svg", files, pack)).toBe("/assets/no-1.svg");
    expect(artUrl("../../art/icon/kibble.svg", files, new Map())).toBe("/assets/kibble-1.svg");
  });

  it("файлу немає — малюнка немає, хоч би що було в пакеті", () => {
    expect(artUrl("../../art/icon/litter.svg", files, new Map([["icon/litter", "blob:litter"]]))).toBeNull();
  });
});

describe("пакет іконок карток: повторні спроби (§2.1)", () => {
  it("вдалося одразу — без пауз", async () => {
    const waits: number[] = [];
    expect(await retried(() => Promise.resolve("ok"), [10, 20], async (ms) => void waits.push(ms))).toBe("ok");
    expect(waits).toEqual([]);
  });

  it("не вдалося — ще раз після паузи, і так для кожної паузи", async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await retried(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error("немає мережі");
        return calls;
      },
      [10, 20],
      async (ms) => void waits.push(ms),
    );
    expect(result).toBe(3);
    expect(waits).toEqual([10, 20]);
  });

  it("не вдалося й після останньої паузи — null, без винятку", async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await retried(
      async () => {
        calls += 1;
        throw new Error("немає мережі");
      },
      [10, 20],
      async (ms) => void waits.push(ms),
    );
    expect(result).toBeNull();
    expect(calls).toBe(3);
    expect(waits).toEqual([10, 20]);
  });
});

// Останнім: пакет лишається у грі до кінця сторінки, тож і тут — до кінця файлу.
describe("пакет іконок карток: у грі (§2.1)", () => {
  it("поки пакета немає — адреси файлів; пакет прийшов — картки беруть адреси з нього", () => {
    const fileKibble = iconUrl("kibble");
    const fileCar = glyphUrl("🚗");
    expect(fileKibble).toMatch(/kibble\.svg/);

    const made: string[] = [];
    adoptPack(
      new Map([
        ["icon/kibble", "<svg id='kibble'/>"],
        [`icon/${DESTINATION_ICONS.vet}`, "<svg id='vet'/>"],
        [`ui/glyph/${GLYPH_ART["🚗"]}`, "<svg id='car'/>"],
      ]),
      (svg) => {
        made.push(svg);
        return `blob:${made.length}`;
      },
    );
    expect(made).toEqual(["<svg id='kibble'/>", "<svg id='vet'/>", "<svg id='car'/>"]);
    expect(iconUrl("kibble")).toBe("blob:1");
    expect(iconUrl(DESTINATION_ICONS.vet)).toBe("blob:2");
    expect(glyphUrl("🚗")).toBe("blob:3");
    // Чого в пакеті немає — далі файлом.
    expect(iconUrl("litter")).toMatch(/litter\.svg/);

    // Наперед гра готує ті самі адреси, які отримає картка.
    const urls = cardArtUrls();
    expect(urls).toEqual(expect.arrayContaining(["blob:1", "blob:2", "blob:3"]));
    expect(urls).not.toContain(fileKibble);
    if (fileCar !== null) expect(urls).not.toContain(fileCar);
  });
});
