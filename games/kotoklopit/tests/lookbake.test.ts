// Гардероб (§5.1, `WARDROBE.md`): вигляд із самими нулями гардеробу запікається так само, як до нього, — той самий обвіс,
// ті самі кроки й ключ рецепта (отже ті самі запечені кадри), та сама голова й фігура портрета; а старий `look` без нових полів
// — той самий, що з нулями. Знято з коду до гардеробу.

import { describe, expect, it } from "vitest";

import { DEFAULT_LOOK } from "../src/sim/game";
import type { Look } from "../src/sim/types";
import { portraitHead } from "../src/view/art/compose";
import { farRecipe, personRecipe, SHADE_TINT, FAR_TINT } from "../src/view/art/recipes";
import type { TintStep } from "../src/view/art/types";
import { personPortraitParts } from "../src/view/iso/personportrait";
import { PERSON_RIG, personSkin } from "../src/view/rig/defs/person";
import { personLooks } from "../src/view/wardrobe/index";

/** Вигляд зі збереження до гардеробу. */
const OLD: Look = { face: 2, skin: 4, hair: 3, hairColor: 5, eyes: 3, build: 2, top: 6, bottom: 6, shoes: 6 };
const ZEROS = { topCut: 0, topPattern: 0, bottomCut: 0, bottomPattern: 0, shoeCut: 0, hairAccent: 0 } as const;

const fill = (layer: TintStep["layer"], color: number): TintStep => ({ layer, color, put: "source-over" });
const TAIL: readonly TintStep[] = [
  { layer: "shade", color: SHADE_TINT, tint: "multiply", put: "multiply" },
  { layer: "ink", color: null, put: "source-over" },
];
/** Кроки рецепта до гардеробу: шкіра, верх, низ, взуття, волосся, очі, деталі, [плями], тінь, контур. */
const steps = (c: readonly number[], stained = false): TintStep[] => [
  fill("fill-skin", c[0]!),
  fill("fill-top", c[1]!),
  fill("fill-bottom", c[2]!),
  fill("fill-shoes", c[3]!),
  fill("fill-hair", c[4]!),
  fill("fill-iris", c[5]!),
  { layer: "detail", color: null, put: "source-over" },
  ...(stained ? [{ layer: "extra-stain", color: null, put: "source-atop" } as const] : []),
  ...TAIL,
];

describe("вигляд без гардеробу запікається як до нього", () => {
  it("рецепт: ті самі кроки й ключ (тож ті самі запечені кадри), з плямами й дальній — теж", () => {
    const zero = personRecipe(DEFAULT_LOOK);
    expect(zero.key).toBe("person:e8c39e.5a2216.1f1a24.c0675a.3a3440.3a3440");
    expect(zero.steps).toEqual(steps([0xe8c39e, 0xc0675a, 0x3a3440, 0x3a3440, 0x5a2216, 0x1f1a24]));
    const stained = personRecipe(DEFAULT_LOOK, { stained: true });
    expect(stained.key).toBe("person:e8c39e.5a2216.1f1a24.c0675a.3a3440.3a3440/stain");
    expect(stained.steps).toEqual(steps([0xe8c39e, 0xc0675a, 0x3a3440, 0x3a3440, 0x5a2216, 0x1f1a24], true));
    const far = farRecipe(zero);
    expect(far.key).toBe(`${zero.key}/far`);
    const dim = ["fill", "fill-skin", "fill-top", "fill-bottom", "fill-shoes", "fill-hair"].map((layer) => ({ layer, color: FAR_TINT, put: "multiply" }));
    expect(far.steps).toEqual([...zero.steps.slice(0, -1), ...dim, zero.steps.at(-1)]);
    const old = personRecipe(OLD);
    expect(old.key).toBe("person:6b4630.9aa3ab.341808.e9e6df.8e4a6a.8e4a6a");
    expect(old.steps).toEqual(steps([0x6b4630, 0xe9e6df, 0x8e4a6a, 0x8e4a6a, 0x9aa3ab, 0x341808]));
  });

  it("обвіс: ті самі кадри в старих слотах, нові слоти порожні", () => {
    const before = {
      "hair-back": "person/hair-back/3",
      "arm-far": "person/arm-far",
      "leg-far": "person/leg",
      "shoe-far": "person/shoe",
      "leg-near": "person/leg",
      "shoe-near": "person/shoe",
      torso: "person/torso/2",
      head: "person/head/2",
      eyes: "person/eyes",
      "hair-front": "person/hair-front/3",
      "arm-near": "person/arm",
    };
    const skin = personSkin(OLD);
    expect(skin).toMatchObject(before);
    for (const slot of PERSON_RIG.slots) if (!(slot.id in before)) expect(skin[slot.id], slot.id).toBeNull();
  });

  it("портрет: та сама голова й фігура (місця частин, дальні — затінені)", () => {
    expect(portraitHead(DEFAULT_LOOK)).toEqual([
      { id: "person/hair-back/1" },
      { id: "person/head/0" },
      { id: "person/eyes", state: "open", x: 37.3 - 32, y: 32.1 - 46 },
      { id: "person/hair-front/1" },
    ]);
    const round = (v: number | undefined): number => Math.round((v ?? 0) * 100) / 100;
    expect(personPortraitParts(DEFAULT_LOOK).map((p) => [p.id, p.state ?? null, round(p.x), round(p.y), p.far === true])).toEqual([
      ["person/hair-back/1", null, 1.5, -109.5, false],
      ["person/arm-far", null, 15, -102.4, true],
      ["person/leg", null, 6, -61.4, true],
      ["person/shoe", null, 6.6, -12.2, true],
      ["person/leg", null, -6.5, -59, false],
      ["person/shoe", null, -5.9, -9.8, false],
      ["person/torso/1", null, 0, -64, false],
      ["person/head/0", null, 1.5, -109.5, false],
      ["person/eyes", "open", 6.8, -123.4, false],
      ["person/hair-front/1", null, 1.5, -109.5, false],
      ["person/arm", null, -17, -100.4, false],
    ]);
  });

  it("дальня частина затінює й заливки гардеробу — коли рецепт їх фарбує", () => {
    const recipe = { key: "k", steps: [fill("fill-top", 1), fill("fill-inner", 2), fill("fill-accent", 3), ...TAIL] };
    const dimmed = farRecipe(recipe).steps.filter((s) => s.color === FAR_TINT).map((s) => s.layer);
    expect(dimmed).toEqual(expect.arrayContaining(["fill-top", "fill-inner", "fill-accent"]));
    expect(farRecipe(personRecipe(DEFAULT_LOOK)).steps.some((s) => s.layer === "fill-inner" || s.layer === "fill-accent")).toBe(false);
  });

  it("старий look без нових полів — той самий вигляд, що з нулями: обвіс, рецепт, портрет", () => {
    for (const wear of personLooks()) {
      const old: Look = { face: wear.face, skin: wear.skin, hair: wear.hair, hairColor: wear.hairColor, eyes: wear.eyes, build: wear.build, top: wear.top, bottom: wear.bottom, shoes: wear.shoes };
      if (Object.entries(ZEROS).some(([key, zero]) => wear[key as keyof typeof ZEROS] !== zero)) continue;
      expect(personSkin(old)).toEqual(personSkin({ ...old, ...ZEROS }));
      expect(personRecipe(old)).toEqual(personRecipe({ ...old, ...ZEROS }));
      expect(portraitHead(old)).toEqual(portraitHead({ ...old, ...ZEROS }));
    }
  });
});
