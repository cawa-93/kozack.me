// Маска скла вікон (`env/window/<кімната>/glass`, §8.9): білий кадр атласу, який світло доби тонує кольором скла (WebGL), — замість
// многокутників `Graphics`, що їх Phaser розбиває на трикутники щокадру всю ніч. Маска — ті самі многокутники `paneGlass`, якими
// скло заливає запасний Canvas: SVG генерується з них (`GLASS_RECORD=1 npx vitest run tests/glassmask.test.ts`) і мусить із ними
// збігатися — змінилося скло в `decor.ts`, а маску не перегенерували — тест падає.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PALETTE } from "../art/palette";
import { artEntry } from "../src/view/art/manifest";
import { glassMask } from "../src/view/art/manifest/a27-window-glass";
import { svgPath } from "../src/view/art/types";
import { PANES, type Pane } from "../src/view/decor";
import { paneGlass } from "../src/view/light/lightmap";
import { ISO } from "../src/view/world/projection";

const ART_DIR = fileURLToPath(new URL("../art/", import.meta.url));
/** Поле полотна (`art/STYLE.md` §2). */
const FIELD = 4;

const round = (v: number): number => Math.round(v * 1000) / 1000;

/** Многокутники скла вікна в одиницях полотна маски: ті самі точки, якими скло заливає `iso/light.ts`. */
function polys(pane: Pane): { x: number; y: number }[][] {
  const { origin } = glassMask(pane);
  const wall = ISO.toScreen(pane.wall);
  return paneGlass(pane).map((poly) => poly.map((p) => ({ x: round(p.x - wall.x - origin.x), y: round(p.y - wall.y - origin.y) })));
}

/** SVG маски вікна. */
function maskSvg(pane: Pane): string {
  const { id, size } = glassMask(pane);
  const shapes = polys(pane).map((poly) => `<polygon points="${poly.map((p) => `${p.x},${p.y}`).join(" ")}" fill="${PALETTE.fill}"/>`);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size.w} ${size.h}" width="${size.w}" height="${size.h}">`,
    `<!-- ${id} — маска видимого скла вікна env/window/${pane.room}: світло доби (src/view/iso/light.ts) тонує її кольором скла й`,
    `кладе над вікном множенням і додаванням. size ${size.w}×${size.h}; pivot (0, 0) — лівий верхній кут; де він відносно pivot вікна —`,
    `glassMask (src/view/art/manifest/a27-window-glass.ts). Біла, без контуру; не малюється руками: генерується з Pane.glass`,
    `(src/view/decor.ts) — GLASS_RECORD=1 npx vitest run tests/glassmask.test.ts.`,
    `-->`,
    `<g id="p-glass">`,
    ...shapes,
    `</g>`,
    `</svg>`,
    ``,
  ].join("\n");
}

describe("маска скла вікон (§8.9)", () => {
  for (const pane of PANES) {
    const mask = glassMask(pane);
    const file = ART_DIR + svgPath({ id: mask.id });

    it(`${pane.room}: запис маніфесту вміщує все скло з полем, pivot — лівий верхній кут полотна`, () => {
      const entry = artEntry(mask.id);
      expect(entry).toBeDefined();
      expect(entry?.size).toEqual(mask.size);
      expect(entry?.pivot).toEqual({ x: 0, y: 0 });
      // Полотно на цілих одиницях від pivot вікна: пікселі маски лягають на пікселі малюнка вікна.
      expect([mask.origin.x, mask.origin.y, mask.size.w, mask.size.h].every(Number.isInteger)).toBe(true);
      const points = polys(pane).flat();
      expect(points.length).toBeGreaterThan(0);
      for (const p of points) {
        expect(p.x).toBeGreaterThanOrEqual(FIELD);
        expect(p.y).toBeGreaterThanOrEqual(FIELD);
        expect(p.x).toBeLessThanOrEqual(mask.size.w - FIELD);
        expect(p.y).toBeLessThanOrEqual(mask.size.h - FIELD);
      }
      // Полотно — без зайвого: поле менше ніж на одиницю більше за найменше.
      expect(Math.min(...points.map((p) => p.x))).toBeLessThan(FIELD + 1);
      expect(Math.min(...points.map((p) => p.y))).toBeLessThan(FIELD + 1);
      expect(Math.max(...points.map((p) => p.x))).toBeGreaterThan(mask.size.w - FIELD - 1);
      expect(Math.max(...points.map((p) => p.y))).toBeGreaterThan(mask.size.h - FIELD - 1);
    });

    it(`${pane.room}: SVG маски — многокутники paneGlass, точка в точку`, () => {
      const want = maskSvg(pane);
      if (process.env["GLASS_RECORD"]) writeFileSync(file, want);
      expect(existsSync(file), `немає ${file}: GLASS_RECORD=1 npx vitest run tests/glassmask.test.ts`).toBe(true);
      expect(readFileSync(file, "utf8").replace(/\r\n/g, "\n")).toBe(want);
    });
  }

  it("маски — по одній на вікно, що його показує світло доби", () => {
    expect(new Set(PANES.map((pane) => glassMask(pane).id)).size).toBe(PANES.length);
    for (const pane of PANES) expect(artEntry(`env/window/${pane.room}`), pane.room).toBeDefined();
  });
});
