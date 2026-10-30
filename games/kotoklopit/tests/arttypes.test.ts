// Типи арту, скелета й анімації (крок 16, GRAPHICS_PLAN.md, хвиля 0): контракти складаються — мінімальний скелет, анімація
// до нього, запис маніфесту й кадр index.json як TS-дані; помилковий id кістки чи слота — помилка типів (`@ts-expect-error`
// перевіряє `npm run typecheck`).

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
import { defineAnims, defineRig, type AnimOf, type BoneOf, type RigAnim, type SkinOf, type SlotOf, type SocketOf } from "../src/view/rig/types";

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

/** Мінімальний скелет: корінь, тулуб і хвіст; два слоти; одне гніздо. */
const RIG = defineRig({
  id: "test",
  bones: [
    { id: "root", parent: null, x: 0, y: 0, rot: 0, len: 0 },
    { id: "body", parent: "root", x: 0, y: -20, rot: 0, len: 30 },
    { id: "tail", parent: "body", x: -14, y: -4, rot: -120, len: 22 },
  ],
  slots: [
    { id: "torso", bone: "body", z: 1, frame: "stand" },
    { id: "tail", bone: "tail", z: 0, frame: null, x: 2, y: 0 },
  ],
  views: {
    front: {},
    back: { bones: { tail: { rot: -100 } }, slots: { tail: { z: 2 } }, sockets: { pet: { z: 3 } } },
  },
  anchors: { head: { bone: "body", x: 30, y: -24 } },
  sockets: { pet: { bone: "body", x: 12, y: -10, z: 1.5, cargo: ["hand"] } },
  skin: { torso: "cat/body/normal", tail: "cat/tail/long" },
  proportions: { kitten: { body: { scale: { x: 0.8, y: 0.8 } } } },
});

describe("типи скелета", () => {
  it("визначення скелета дає літеральні id кісток, слотів і гнізд", () => {
    expectTypeOf<BoneOf<typeof RIG>>().toEqualTypeOf<"root" | "body" | "tail">();
    expectTypeOf<SlotOf<typeof RIG>>().toEqualTypeOf<"torso" | "tail">();
    expectTypeOf<SocketOf<typeof RIG>>().toEqualTypeOf<"pet">();
    expect(RIG.bones.map((bone) => bone.id)).toEqual(["root", "body", "tail"]);
  });

  it("анімація для скелета приймає лише його id", () => {
    const walk: AnimOf<typeof RIG> = {
      duration: 600,
      loop: true,
      bones: {
        body: { pos: [{ t: 0, v: { x: 0, y: 0 } }, { t: 300, v: { x: 0, y: -2 }, ease: "inOut" }, { t: 600, v: { x: 0, y: 0 } }] },
        tail: { rot: [{ t: 0, v: 0 }, { t: 300, v: 12, ease: "out" }, { t: 600, v: 0 }], scale: [{ t: 0, v: { x: 1, y: 1 } }] },
      },
      slots: { torso: { frame: [{ t: 0, v: "walk" }], z: [{ t: 0, v: 1 }] }, tail: { visible: [{ t: 0, v: true }] } },
      views: { back: { bones: { tail: { rot: [{ t: 0, v: -6 }] } } } },
    };
    const group = defineAnims(RIG, {
      walk,
      wag: { duration: 400, loop: true, bones: { tail: { rot: [{ t: 0, v: -10 }, { t: 200, v: 10 }, { t: 400, v: -10 }] } } },
    });
    expectTypeOf(group.wag).toEqualTypeOf<RigAnim<"root" | "body" | "tail", "torso" | "tail">>();
    expect(Object.keys(group)).toEqual(["walk", "wag"]);
  });

  it("помилковий id — помилка типів", () => {
    const anim: AnimOf<typeof RIG> = {
      duration: 100,
      loop: false,
      bones: {
        // @ts-expect-error — кістки «tial» у скелеті немає.
        tial: { rot: [{ t: 0, v: 5 }] },
      },
      slots: {
        // @ts-expect-error — слота «head» у скелеті немає.
        head: { visible: [{ t: 0, v: false }] },
      },
    };
    defineAnims(RIG, {
      // @ts-expect-error — і в групі анімацій.
      sit: { duration: 100, loop: false, bones: { haed: {} } },
    });
    const broken = defineRig({
      id: "broken",
      bones: [
        { id: "root", parent: null, x: 0, y: 0, rot: 0, len: 0 },
        // @ts-expect-error — батька «rot» немає.
        { id: "leg", parent: "rot", x: 0, y: 0, rot: 90, len: 10 },
      ],
      // @ts-expect-error — слот на кістці, якої немає.
      slots: [{ id: "paw", bone: "lge", z: 0, frame: null }],
      views: { front: {}, back: {} },
      anchors: {},
      sockets: {},
      skin: { paw: null },
    });
    // @ts-expect-error — у скелета мусять бути обидва ракурси.
    defineRig({ id: "one-view", bones: [{ id: "root", parent: null, x: 0, y: 0, rot: 0, len: 0 }], slots: [], views: { front: {} }, anchors: {}, sockets: {}, skin: {} });
    const skin: SkinOf<typeof RIG> = { torso: "cat/body/stocky", tail: null };
    // @ts-expect-error — обвіс мусить назвати кожен слот.
    const partial: SkinOf<typeof RIG> = { torso: "cat/body/stocky" };
    expect([anim.duration, broken.id, skin.tail, partial.torso]).toEqual([100, "broken", null, "cat/body/stocky"]);
  });
});
