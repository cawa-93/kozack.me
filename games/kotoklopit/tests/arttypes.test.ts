// Типи арту (крок 16, GRAPHICS_PLAN.md, хвиля 0): контракти складаються — запис маніфесту, кадр index.json і рецепт
// тонування як TS-дані; помилкова категорія чи шар — помилка типів (`@ts-expect-error` перевіряє `npm run typecheck`).

import { describe, expect, expectTypeOf, it } from "vitest";

import {
  ART_LAYERS,
  ART_SEGMENT,
  frameId,
  framesOf,
  isArtLayer,
  layerFrameName,
  layerRank,
  svgPath,
  type ArtEntry,
  type ArtIndex,
  type ArtLayer,
  type ExtraLayer,
  type ManifestModule,
  type TintRecipe,
} from "../src/view/art/types";

/** Записи маніфесту трьох видів: стани, ракурси з шарами, іконка без шарів. */
const FRIDGE: ArtEntry = {
  id: "env/fridge",
  size: { w: 140, h: 260 },
  pivot: { x: 70, y: 228 },
  points: { "shelf-1": { x: 70, y: 120 } },
  states: ["closed", "open"],
};
const HEAD: ArtEntry = {
  id: "cat/head/normal",
  src: "cat/head-normal",
  size: { w: 64, h: 60 },
  pivot: { x: 30, y: 50 },
  points: { mouth: { x: 44, y: 40 } },
  layers: ["fill", "tabby-mackerel", "tortie-a", "white-2", "point", "fluff", "detail", "shade", "ink", "fluff-ink"],
  views: ["front", "back"],
};
const THIRST: ArtEntry = { id: "icon/thirst", size: { w: 40, h: 40 }, pivot: { x: 20, y: 20 } };
const MODULE: ManifestModule = { MANIFEST: [FRIDGE, HEAD, THIRST] };

describe("типи арту", () => {
  it("кадри запису — стани × ракурси", () => {
    expect(framesOf(FRIDGE)).toEqual([
      { frame: "env/fridge/closed", state: "closed", view: null, svg: "env/fridge.svg" },
      { frame: "env/fridge/open", state: "open", view: null, svg: "env/fridge.svg" },
    ]);
    expect(framesOf(HEAD).map((ref) => [ref.frame, ref.svg])).toEqual([
      ["cat/head/normal/front", "cat/head-normal/front.svg"],
      ["cat/head/normal/back", "cat/head-normal/back.svg"],
    ]);
    expect(framesOf(THIRST)).toEqual([{ frame: "icon/thirst", state: null, view: null, svg: "icon/thirst.svg" }]);
    expect(frameId("cat/eyes", "blink", "front")).toBe("cat/eyes/blink/front");
    expect(svgPath(HEAD, "back")).toBe("cat/head-normal/back.svg");
    expect(MODULE.MANIFEST.flatMap(framesOf)).toHaveLength(5);
  });

  it("id і шари перевіряються", () => {
    // @ts-expect-error — категорії «furniture» немає.
    const wrong: ArtEntry = { id: "furniture/sofa", size: { w: 1, h: 1 }, pivot: { x: 0, y: 0 } };
    // @ts-expect-error — шару «tabby-swirl» немає.
    const layer: ArtLayer = "tabby-swirl";
    expect([wrong.id, layer]).toEqual(["furniture/sofa", "tabby-swirl"]);
    for (const seg of ["fridge", "full-3", "hiss-bowl"]) expect(ART_SEGMENT.test(seg), seg).toBe(true);
    for (const seg of ["Open", "full_3", "a--b", "-a", ""]) expect(ART_SEGMENT.test(seg), seg).toBe(false);
    // Перелік шарів повний: кожен шар, крім вільних накладок `extra-*`.
    expectTypeOf<(typeof ART_LAYERS)[number]>().toEqualTypeOf<Exclude<ArtLayer, ExtraLayer>>();
    expect(new Set(ART_LAYERS).size).toBe(ART_LAYERS.length);
    for (const name of HEAD.layers ?? []) expect(isArtLayer(name), name).toBe(true);
    for (const name of ["extra-stain", "fill-skin", "white-3", "tabby-ticked"]) expect(isArtLayer(name), name).toBe(true);
    for (const name of ["fill-fur", "tabby-swirl", "white-4", "tortie-d", "extra-", "Ink", "shadow"]) expect(isArtLayer(name), name).toBe(false);
  });

  it("типовий порядок шарів: заливка → маски → тінь → контур", () => {
    // ART_LAYERS уже в цьому порядку.
    expect([...ART_LAYERS].sort((a, b) => layerRank(a) - layerRank(b))).toEqual([...ART_LAYERS]);
    const shuffled: ArtLayer[] = ["ink", "shade", "white-1", "fill", "fluff-ink", "detail", "tabby-classic", "point", "extra-bald", "tortie-b", "fluff"];
    expect([...shuffled].sort((a, b) => layerRank(a) - layerRank(b))).toEqual([
      "fill",
      "fluff",
      "point",
      "tortie-b",
      "tabby-classic",
      "white-1",
      "detail",
      "extra-bald",
      "shade",
      "ink",
      "fluff-ink",
    ]);
  });

  it("кадр index.json і рецепт тонування складаються", () => {
    const index: ArtIndex = {
      version: 1,
      pages: [{ file: "page-0.3f9a2c1b.webp", w: 2048, h: 2048 }],
      frames: {
        "cat/head/normal/front": {
          size: HEAD.size,
          res: 1,
          pivot: HEAD.pivot,
          points: { mouth: { x: 44, y: 40 } },
          trim: { x: 2, y: 3 },
          layers: { fill: { page: 0, x: 0, y: 0, w: 60, h: 56 }, ink: { page: 0, x: 62, y: 0, w: 60, h: 56 } },
        },
        "icon/thirst": { size: THIRST.size, res: 2, pivot: THIRST.pivot, trim: { x: 0, y: 0 }, layers: { all: { page: 0, x: 0, y: 60, w: 80, h: 80 } }, stub: true },
      },
    };
    const recipe: TintRecipe = {
      key: "black|mackerel|w2",
      steps: [
        { layer: "fill", color: 0x2b2627, put: "source-over" },
        { layer: "tabby-mackerel", color: 0x1f1b1c, put: "source-atop", alpha: 0.85 },
        { layer: "white-1", color: 0xf4f0e8, tint: "source-atop", put: "source-atop" },
        { layer: "shade", color: null, put: "multiply" },
        { layer: "ink", color: null, put: "source-over" },
      ],
    };
    expect(Object.keys(index.frames)).toEqual(["cat/head/normal/front", "icon/thirst"]);
    expect(layerFrameName("cat/head/normal/front", "ink")).toBe("cat/head/normal/front#ink");
    expect(layerFrameName("icon/thirst", "all")).toBe("icon/thirst");
    expect(recipe.steps.map((step) => layerRank(step.layer))).toEqual([0, 4, 5, 8, 9]);
  });
});
