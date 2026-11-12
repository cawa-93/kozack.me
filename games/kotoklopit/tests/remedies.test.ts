// Від чого товар (§6.4): який витратний товар від яких хвороб і травм допомагає — за правилами гри, — і що «і» в картці магазину
// каже саме це, а перед тим — на скільки використань упаковка.

import { describe, expect, it } from "vitest";

import { bathe } from "../src/sim/care";
import { createCat } from "../src/sim/cat";
import { DISEASES, PRODUCTS, UNSOLD } from "../src/sim/config";
import { fallIll, hasDisease } from "../src/sim/diseases";
import { applyDressing } from "../src/sim/dressing";
import { newGame } from "../src/sim/game";
import { fallIllPerson, isIll } from "../src/sim/illness";
import { addCat } from "../src/sim/night";
import { helps, remedyOf, type Remedy } from "../src/sim/remedies";
import { createRng } from "../src/sim/rng";
import { catalog, variants } from "../src/sim/shop";
import type { DiseaseId, GameState, Product, Quality } from "../src/sim/types";
import { REMEDY_HINTS } from "../src/texts";
import { shopCatalog, variantTitle } from "../src/ui/shop";
import { PRODUCT_TITLES } from "../src/ui/titles";
import { fake, useFakeDom } from "./fakedom";

useFakeDom();

const PRODUCT_LIST = Object.keys(PRODUCTS) as Product[];
const QUALITIES: readonly Quality[] = ["cheap", "premium"];
const DISEASE_LIST = Object.keys(DISEASES) as DiseaseId[];

/** Ліки без порядку: важить, від чого, а не в якій послідовності. */
const sorted = (remedy: Remedy): Remedy => ({
  cures: [...remedy.cures].sort(),
  controls: [...remedy.controls].sort(),
  prevents: [...remedy.prevents].sort(),
  heals: [...remedy.heals].sort(),
  wounds: remedy.wounds,
});
const remedy = (part: Partial<Remedy>): Remedy => sorted({ cures: [], controls: [], prevents: [], heals: [], wounds: false, ...part });

describe("від чого товар (§6.4)", () => {
  it("ліки, корм, шампунь, пластир і бинт — від того, що кажуть правила гри; решта — ні від чого", () => {
    const expected: Partial<Record<Product, Partial<Record<Quality, Remedy>>>> = {
      pills: {
        cheap: remedy({ cures: ["cold", "worms"], controls: ["heart", "joints", "spine", "breathing"] }),
        premium: remedy({ cures: ["cold", "worms"], controls: ["heart", "joints", "spine", "breathing"] }),
      },
      drops: { cheap: remedy({ cures: ["fleas", "conjunctivitis"] }), premium: remedy({ cures: ["fleas", "conjunctivitis"] }) },
      shampoo: { cheap: remedy({ prevents: ["dermatitis"] }), premium: remedy({ cures: ["dermatitis", "fleas"], prevents: ["dermatitis"] }) },
      catFood: { premium: remedy({ cures: ["stomach"] }) },
      sterileFood: { cheap: remedy({ prevents: ["urolithiasis"] }), premium: remedy({ cures: ["stomach"], prevents: ["urolithiasis"] }) },
      humanMeds: { cheap: remedy({ heals: ["cold", "injury"] }), premium: remedy({ heals: ["cold", "injury"] }) },
      dressing: { cheap: remedy({ wounds: true }), premium: remedy({ heals: ["injury"], wounds: true }) },
    };
    for (const product of PRODUCT_LIST) {
      for (const quality of QUALITIES) {
        const want = expected[product]?.[quality] ?? remedy({});
        expect(sorted(remedyOf(product, quality)), `${product}:${quality}`).toEqual(want);
        expect(helps(remedyOf(product, quality)), `${product}:${quality}`).toBe(JSON.stringify(want) !== JSON.stringify(remedy({})));
      }
    }
  });

  it("купання дорогим шампунем лікує саме те, що каже його «і», дешевим — нічого", () => {
    for (const quality of QUALITIES) {
      for (const id of DISEASE_LIST) {
        const state = newGame({ address: "she", difficulty: "normal", seed: 3 }).current;
        const cat = createCat(state, createRng(2), { source: "shelter", ageWeeks: 20, at: { x: 5.5, y: 8.5 } });
        cat.traits = [];
        addCat(state, cat);
        fallIll(state, cat, id);
        state.home.supplies.shampoo = { cheap: 0, premium: 0, [quality]: 1 };
        state.character.held = { kind: "cat", cat: cat.id };
        bathe(state, createRng(1));
        expect(!hasDisease(cat, id), `${quality}: ${id}`).toBe(remedyOf("shampoo", quality).cures.includes(id));
      }
    }
  });

  it("травму знімає бинт, а не пластир — як каже «і»", () => {
    for (const quality of QUALITIES) {
      const state: GameState = newGame({ address: "she", difficulty: "normal", seed: 3 }).current;
      fallIllPerson(state, "injury");
      state.home.supplies.dressing = { cheap: 0, premium: 0, [quality]: 1 };
      applyDressing(state, quality);
      expect(!isIll(state, "injury"), quality).toBe(remedyOf("dressing", quality).heals.includes("injury"));
    }
  });
});

/** Як хвороба чи травма звучить у тексті «і» — основа слова, що не залежить від відмінка. */
const STEMS: Record<string, RegExp> = {
  cold: /застуд/u,
  worms: /глист/u,
  fleas: /бліх|блох/u,
  conjunctivitis: /кон'юнктивіт/u,
  heart: /серц/u,
  joints: /суглоб/u,
  spine: /хребт|хребет/u,
  breathing: /дихан/u,
  dermatitis: /дерматит/u,
  stomach: /шлунк/u,
  urolithiasis: /сечокам'ян/u,
  injury: /травм/u,
};

describe("«і» в картці товару (§6.4, `TEXTS.md` «Про товар»)", () => {
  it("текст є в кожного варіанта, що від чогось допомагає, і лише в нього; він називає кожну хворобу й травму", () => {
    for (const product of PRODUCT_LIST) {
      for (const quality of QUALITIES) {
        const cure = remedyOf(product, quality);
        const hint = REMEDY_HINTS[product]?.[quality];
        if (!helps(cure)) {
          expect(hint, `${product}:${quality}`).toBeUndefined();
          continue;
        }
        expect(hint, `${product}:${quality}`).toBeDefined();
        for (const id of [...cure.cures, ...cure.controls, ...cure.prevents, ...cure.heals]) {
          expect(STEMS[id], `основа слова для «${id}»`).toBeDefined();
          expect(hint, `${product}:${quality} — ${id}`).toMatch(STEMS[id] ?? /^$/u);
        }
        if (cure.wounds) expect(hint, `${product}:${quality}`).toMatch(/укус|подряпин/u);
      }
    }
  });

  it("у магазині «і» — у кожного запасу з упаковкою на кілька використань: бабл каже, на скільки вона, а тоді — від чого товар", () => {
    const state = newGame({ address: "she", difficulty: "normal", seed: 3 }).current;
    const cat = createCat(state, createRng(2), { source: "shelter", ageWeeks: 20, at: { x: 5.5, y: 8.5 } });
    cat.sterilized = true;
    addCat(state, cat);
    const list = fake(shopCatalog(state, "delivery", { checkout: () => undefined }).list);
    const cards = list.findAll("shop-item");
    const bubbles = new Map<string, string>();
    const silent: string[] = [];
    let things = 0;
    for (const goods of catalog(state, "delivery")) {
      for (const quality of variants(goods)) {
        const title = variantTitle(goods, quality);
        const card = cards.find((c) => c.find("shop-name").textContent.startsWith(title));
        expect(card, title).toBeDefined();
        const info = card?.findAll("shop-info") ?? [];
        const uses = "product" in goods ? PRODUCTS[goods.product].units[quality] : 0;
        if (!("product" in goods) || uses <= 1) {
          expect(info, title).toEqual([]);
          if ("product" in goods) silent.push(title);
          else things += 1;
          continue;
        }
        expect(info, title).toHaveLength(1);
        info[0]?.click();
        const bubble = card?.find("hint-bubble");
        expect(bubble?.hidden, title).toBe(false);
        const pack = `Упаковка на ${PRODUCT_TITLES[goods.product].unit(uses)}.`;
        const cure = REMEDY_HINTS[goods.product]?.[quality];
        expect(bubble?.textContent, title).toBe(cure === undefined ? pack : `${pack} ${cure}`);
        bubbles.set(title, bubble?.textContent ?? "");
      }
    }
    // Запас, що ні від чого не допомагає, каже лише про упаковку; число — у формі слова («4 чистки», а не «4 чисток»).
    expect(bubbles.get(variantTitle({ product: "food" }, "cheap"))).toBe("Упаковка на 20 порцій.");
    expect(bubbles.get(variantTitle({ product: "litter" }, "premium"))).toBe("Упаковка на 4 чистки лотка.");
    expect(bubbles.get(variantTitle({ product: "drops" }, "premium"))).toBe("Упаковка на 5 доз. Від бліх і кон'юнктивіту.");
    // Нашийник — штука, а не упаковка; речі — теж без «і».
    expect(silent).toEqual([variantTitle({ product: "collar" }, "cheap")]);
    expect(things).toBeGreaterThan(0);
    // Усі запаси каталогу, крім нашийника, — по два варіанти.
    expect(bubbles.size).toBe((PRODUCT_LIST.length - UNSOLD.length - 1) * 2);
  });
});
