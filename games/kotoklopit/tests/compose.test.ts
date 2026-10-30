// Компонувальник шерсті й зовнішності (крок 16, GRAPHICS_PLAN.md: «Тонування й запікання»): рецепти кота й персонажа,
// порядок шарів і режимів компонувальника на фальшивому контексті, облік запечених кадрів (бюджет, LRU) і поведінка без
// браузера. Сам `bake.ts` імпортує Phaser, тож у Node перевіряються його чисті частини (`bakecache.ts`).

import { afterEach, describe, expect, it } from "vitest";

import { coatOf, type Coat } from "../src/sim/genetics";
import type { CatDisease, Genes, Look, Shape } from "../src/sim/types";
import { LOOK_OPTIONS } from "../src/ui/look";
import { BakeCache, BAKE_BUDGET } from "../src/view/art/bakecache";
import { composeFrame, composePortrait, cssColor, portraitHead, stubLayers, type Ctx2D, type LayerImage } from "../src/view/art/compose";
import {
  CAT_RECIPE_LAYERS,
  catRecipe,
  dullColor,
  EYE_COLORS,
  PERSON_RECIPE_LAYERS,
  personColors,
  personRecipe,
  tortieVariant,
  type CatAppearance,
  type CatRecipeOptions,
} from "../src/view/art/recipes";
import { artFrameState, artLayerSource, loadArtFrames, loadArtIndex, resetArtSources } from "../src/view/art/sources";
import { layerRank, type ArtLayer, type TintRecipe, type TintStep } from "../src/view/art/types";
import { PALETTE } from "../src/view/palette";

// --- Усі забарвлення, які дає генетика -----------------------------------------------------------

/** По одному представнику кожного фенотипу гена (решта пар дають те саме, що одна з цих). */
const PAIRS = {
  orange: [[false], [true], [false, false], [false, true], [true, true]],
  bool: [
    [true, true],
    [false, false],
  ],
  tabby: [
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
  ],
  white: [
    [0, 0],
    [1, 0],
    [1, 1],
    [2, 1],
  ],
} as const;
const FURS: readonly Shape["coat"][] = [null, "hairless", "curly"];

/** Усі різні `coatOf` для всіх комбінацій генів і породної шерсті. */
function allCoats(): { coat: Coat; fur: Shape["coat"] }[] {
  const seen = new Map<string, { coat: Coat; fur: Shape["coat"] }>();
  for (const orange of PAIRS.orange)
    for (const black of PAIRS.bool)
      for (const dense of PAIRS.bool)
        for (const agouti of PAIRS.bool)
          for (const tabby of PAIRS.tabby)
            for (const white of PAIRS.white)
              for (const full of PAIRS.bool)
                for (const short of PAIRS.bool)
                  for (const eyes of [0, 1, 2])
                    for (const fur of FURS) {
                      const genes: Genes = {
                        orange: [...orange],
                        black: [...black],
                        dense: [...dense],
                        agouti: [...agouti],
                        tabby: [...tabby],
                        white: [...white],
                        full: [...full],
                        short: [...short],
                        eyes,
                      };
                      const coat = coatOf(genes, { coat: fur });
                      seen.set(JSON.stringify({ coat, fur }), { coat, fur });
                    }
  return [...seen.values()];
}

const COATS = allCoats();
const OPTIONS: readonly CatRecipeOptions[] = [{}, { dull: true }, { bald: true, collar: true }, { dull: true, bald: true, collar: true }];
const MODES = new Set(["source-over", "source-atop", "multiply"]);

/** Порядок шарів кота: `layerRank`, але очі — після масок (щоб маски не лягали на райдужку). */
const catRank = (layer: ArtLayer): number => (layer === "fill-iris" ? 5.5 : layerRank(layer));

/** Що не так із кроком: дозволений шар, режим, колір 0xRRGGBB, непрозорість 0–1. */
function stepProblems(step: TintStep, allowed: readonly ArtLayer[]): string[] {
  const problems: string[] = [];
  if (!allowed.includes(step.layer)) problems.push(`шар ${step.layer}`);
  if (!MODES.has(step.put)) problems.push(`режим ${step.put}`);
  if (step.color !== null && !(Number.isInteger(step.color) && step.color >= 0 && step.color <= 0xffffff)) problems.push(`колір ${step.color}`);
  if (step.tint !== undefined && step.tint !== "source-atop" && step.tint !== "multiply") problems.push(`tint ${String(step.tint)}`);
  if (step.alpha !== undefined && !(step.alpha > 0 && step.alpha <= 1)) problems.push(`alpha ${step.alpha}`);
  return problems.map((p) => `${step.layer}: ${p}`);
}

describe("рецепт кота", () => {
  it("генетика дає багато різних забарвлень — усі перебрано", () => {
    // 6 пігментів, черепахові, 4 табі, білі 0–3, колорпойнт, довга шерсть, очі, безшерсті й кучеряві.
    expect(COATS.length).toBeGreaterThan(1000);
    expect(new Set(COATS.map(({ coat }) => coat.base)).size).toBe(6);
    expect(COATS.some(({ coat }) => coat.second !== null && coat.tabby !== null)).toBe(true);
  });

  it("кожен крок — дозволений шар, колір і режим; шари — як каже забарвлення", () => {
    const problems: string[] = [];
    for (const { coat, fur } of COATS) {
      for (const opts of OPTIONS) {
        const recipe = catRecipe({ coat, fur, seed: 7 }, opts);
        const fail = (what: string): void => {
          problems.push(`${recipe.key}: ${what}`);
        };
        for (const step of recipe.steps) for (const p of stepProblems(step, CAT_RECIPE_LAYERS)) fail(p);
        const layers = recipe.steps.map((s) => s.layer);
        const first = recipe.steps[0];
        if (first?.layer !== "fill" || first.put !== "source-over" || first.color === null) fail("перший крок — не заливка кольором");
        const long = coat.long && fur === null;
        if (layers.includes("fluff") !== long || layers.includes("fluff-ink") !== long) fail("fluff — лише в довгошерстих");
        if (layers.includes("point") !== coat.pointed) fail("point — лише в колорпойнтів");
        if (layers.some((l) => l.startsWith("tortie-")) !== (coat.second !== null)) fail("tortie — лише в черепахових");
        const tabbies = [...new Set(layers.filter((l) => l.startsWith("tabby-")))];
        if (tabbies.join() !== (coat.tabby ? `tabby-${coat.tabby}` : "")) fail(`табі ${tabbies.join()}`);
        if (layers.filter((l) => l.startsWith("white-")).join() !== ["white-1", "white-2", "white-3"].slice(0, coat.white).join()) fail("білі плями");
        if (recipe.steps.find((s) => s.layer === "fill-iris")?.color !== EYE_COLORS[coat.eyes]) fail("колір очей");
        if (layers.includes("extra-bald") !== (opts.bald === true)) fail("залисини");
        if (layers.includes("extra-collar") !== (opts.collar === true)) fail("нашийник");
        const shade = recipe.steps.find((s) => s.layer === "shade");
        if (shade?.put !== "multiply" || shade.tint !== "multiply") fail("тінь — множенням");
        const ink = recipe.steps.find((s) => s.layer === "ink");
        if (ink?.color !== null || ink.put !== "source-over") fail("контур — як є, поверх");
        // Маски шерсті лише обтинаються по силуету — не кладуться поверх нього.
        for (const step of recipe.steps) {
          if (/^(point|tortie-|tabby-|white-)/.test(step.layer) && step.put === "source-over") fail(`${step.layer} поверх силуету`);
        }
        // Порядок — знизу догори за `layerRank`; виняток — у черепахової табі смуги основного кольору йдуть до плям.
        const torbie = coat.second !== null && coat.tabby !== null && !coat.pointed && fur !== "hairless";
        const firstTabby = layers.findIndex((l) => l.startsWith("tabby-"));
        const ranks = recipe.steps.filter((_, i) => !(torbie && i === firstTabby)).map((s) => catRank(s.layer));
        if (ranks.some((r, i) => i > 0 && r < (ranks[i - 1] ?? r))) fail(`порядок ${layers.join()}`);
      }
    }
    expect(problems.slice(0, 20)).toEqual([]);
  });

  it("ключ стабільний, однаковий ключ — однакові кроки, різний вигляд — різний ключ", () => {
    const stepsByKey = new Map<string, string>();
    const keyByLook = new Map<string, string>();
    for (const { coat, fur } of COATS) {
      for (const opts of OPTIONS) {
        for (const seed of coat.second ? [1, 2, 3, 4, 5, 6] : [1, 2]) {
          const recipe = catRecipe({ coat, fur, seed }, opts);
          const steps = JSON.stringify(recipe.steps);
          const again = catRecipe({ coat, fur, seed }, opts);
          if (again.key !== recipe.key || JSON.stringify(again.steps) !== steps) expect(again).toEqual(recipe);
          expect(stepsByKey.get(recipe.key) ?? steps, recipe.key).toBe(steps);
          stepsByKey.set(recipe.key, steps);
          // Вигляд — усе, що бачить гравець: забарвлення (довга шерсть — лише без породної), шерсть, варіант плям, стани.
          const look = JSON.stringify({
            coat: { ...coat, long: coat.long && fur === null },
            fur,
            tortie: coat.second ? tortieVariant(seed) : null,
            dull: opts.dull === true,
            bald: opts.bald === true,
            collar: opts.collar === true,
          });
          expect(keyByLook.get(look) ?? recipe.key, look).toBe(recipe.key);
          keyByLook.set(look, recipe.key);
        }
      }
    }
    // Різні вигляди — різні ключі.
    expect(new Set(keyByLook.values()).size).toBe(keyByLook.size);
  });

  it("черепаховий варіант — стабільний для id і всі три трапляються", () => {
    const counts = new Map<string, number>();
    for (let id = 1; id <= 300; id++) {
      expect(tortieVariant(id)).toBe(tortieVariant(id));
      counts.set(tortieVariant(id), (counts.get(tortieVariant(id)) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual(["tortie-a", "tortie-b", "tortie-c"]);
    for (const n of counts.values()) expect(n).toBeGreaterThan(60);
    const tortie = COATS.find(({ coat, fur }) => coat.second !== null && fur === null)!;
    const variants = new Set(
      Array.from({ length: 30 }, (_, i) => i + 1).map((seed) => {
        const look: CatAppearance = { ...tortie, seed };
        return catRecipe(look).key;
      }),
    );
    expect(variants.size).toBe(3);
    // Без черепахових плям id на рецепт не впливає: однакові коти ділять запечені кадри.
    const plain = COATS.find(({ coat }) => coat.second === null)!;
    expect(catRecipe({ ...plain, seed: 1 }).key).toBe(catRecipe({ ...plain, seed: 99 }).key);
  });

  it("неагуті без рудого — без смуг; рудий — завжди зі смугами; колорпойнт світлий з темними кінчиками", () => {
    const solid = COATS.find(({ coat, fur }) => coat.base === "black" && coat.tabby === null && !coat.second && !coat.pointed && fur === null)!;
    expect(catRecipe({ ...solid, seed: 1 }).steps.some((s) => s.layer.startsWith("tabby-"))).toBe(false);
    for (const { coat } of COATS.filter(({ coat }) => coat.base === "orange" || coat.base === "cream")) expect(coat.tabby).not.toBeNull();
    const point = COATS.find(({ coat, fur }) => coat.pointed && coat.base === "black" && !coat.tabby && !coat.second && fur === null)!;
    const steps = catRecipe({ ...point, seed: 1 }).steps;
    const luma = (c: number): number => 0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255);
    const fill = steps.find((s) => s.layer === "fill")!.color!;
    const tips = steps.find((s) => s.layer === "point")!.color!;
    expect(luma(fill)).toBeGreaterThan(180);
    expect(luma(tips)).toBeLessThan(100);
  });

  it("тьмяна шерсть ненасичена, очі не тьмяніють", () => {
    const tabby = COATS.find(({ coat, fur }) => coat.base === "orange" && coat.tabby === "mackerel" && coat.white === 0 && fur === null && !coat.long)!;
    const healthy = catRecipe({ ...tabby, seed: 1 });
    const dull = catRecipe({ ...tabby, seed: 1 }, { dull: true });
    const sat = (c: number): number => {
      const ch = [(c >> 16) & 255, (c >> 8) & 255, c & 255];
      return Math.max(...ch) - Math.min(...ch);
    };
    const fill = (r: TintRecipe): number => r.steps.find((s) => s.layer === "fill")!.color!;
    expect(sat(fill(dull))).toBeLessThan(sat(fill(healthy)) * 0.6);
    expect(fill(dull)).toBe(dullColor(fill(healthy)));
    expect(dull.steps.find((s) => s.layer === "fill-iris")?.color).toBe(healthy.steps.find((s) => s.layer === "fill-iris")?.color);
    expect(dull.key).not.toBe(healthy.key);
  });

  it("з кота сима: глисти — тьмяна шерсть, дерматит — залисини, нашийник; opts перевизначають", () => {
    const disease = (id: CatDisease["id"]): CatDisease => ({ id, day: 1, doses: 0, diet: 0, calm: 0, controlled: null, known: false });
    const genes: Genes = {
      orange: [false],
      black: [true, true],
      dense: [true, true],
      agouti: [true, true],
      tabby: [1, 1],
      white: [0, 0],
      full: [true, true],
      short: [true, true],
      eyes: 0,
    };
    const shape: Shape = { muzzle: "normal", ears: "normal", tail: "long", build: "normal", legs: "normal", coat: null };
    const cat = { id: 5, genes, shape, diseases: [disease("worms"), disease("dermatitis")], collar: true };
    const recipe = catRecipe(cat);
    expect(recipe.key).toBe(catRecipe({ coat: coatOf(genes, shape), fur: null, seed: 5 }, { dull: true, bald: true, collar: true }).key);
    expect(recipe.key).toMatch(/\/dull\/bald\/collar$/);
    expect(catRecipe(cat, { dull: false }).key).not.toMatch(/dull/);
    expect(catRecipe({ ...cat, diseases: [], collar: false }).key).toBe("cat:black/mackerel/w0/green");
  });
});

// --- Персонаж ------------------------------------------------------------------------------------

describe("рецепт персонажа", () => {
  const base: Look = { face: 0, skin: 0, hair: 0, hairColor: 0, eyes: 0, build: 0, top: 0, bottom: 0, shoes: 0 };

  it("варіанти редактора — різні кольори палітри, як у портреті й старому вигляді", () => {
    const options = new Map(LOOK_OPTIONS.map((o) => [o.key, o.options.length]));
    const region = { skin: "skin", hairColor: "hair", eyes: "iris", top: "top", bottom: "bottom", shoes: "shoes" } as const;
    for (const [key, field] of Object.entries(region) as [keyof typeof region, (typeof region)[keyof typeof region]][]) {
      const n = options.get(key)!;
      const colors = Array.from({ length: n }, (_, i) => personColors({ ...base, [key]: i })[field]);
      expect(new Set(colors).size, key).toBe(n);
    }
    // Низ і взуття — зі зсувом 5 у палітрі одягу: «графітовий» першим.
    expect(personColors(base).bottom).toBe(PALETTE.clothes[5]);
    expect(personColors({ ...base, shoes: 1 }).shoes).toBe(PALETTE.clothes[6]);
    expect(personColors({ ...base, top: 3 }).top).toBe(PALETTE.clothes[3]);
  });

  it("усі комбінації кольорів Look: дозволені шари, різні ключі; форма, зачіска й статура рецепта не змінюють", () => {
    const n = (key: keyof Look): number => LOOK_OPTIONS.find((o) => o.key === key)!.options.length;
    const keys = new Set<string>();
    let count = 0;
    for (let skin = 0; skin < n("skin"); skin++)
      for (let hairColor = 0; hairColor < n("hairColor"); hairColor++)
        for (let eyes = 0; eyes < n("eyes"); eyes++)
          for (let top = 0; top < n("top"); top++)
            for (let bottom = 0; bottom < n("bottom"); bottom++)
              for (let shoes = 0; shoes < n("shoes"); shoes++) {
                const look = { ...base, skin, hairColor, eyes, top, bottom, shoes };
                const recipe = personRecipe(look);
                keys.add(recipe.key);
                count++;
                if (count % 97 === 0) {
                  expect(recipe.steps.flatMap((step) => stepProblems(step, PERSON_RECIPE_LAYERS)), recipe.key).toEqual([]);
                  expect(personRecipe(look)).toEqual(recipe);
                }
              }
    expect(keys.size).toBe(count);
    const look = { ...base, skin: 2, top: 4 };
    for (const face of [0, 1, 2]) for (const hair of [0, 1, 2, 3]) for (const build of [0, 1, 2]) {
      expect(personRecipe({ ...look, face, hair, build })).toEqual(personRecipe(look));
    }
  });

  it("плями на одязі — накладка в межах силуету, і ключ інший", () => {
    const clean = personRecipe(base);
    const stained = personRecipe(base, { stained: true });
    expect(clean.steps.some((s) => s.layer === "extra-stain")).toBe(false);
    expect(stained.steps.find((s) => s.layer === "extra-stain")).toEqual({ layer: "extra-stain", color: null, put: "source-atop" });
    expect(stained.key).not.toBe(clean.key);
    const colors = personColors(base);
    const color = (layer: ArtLayer): number | null | undefined => clean.steps.find((s) => s.layer === layer)?.color;
    expect([color("fill-skin"), color("fill-hair"), color("fill-iris"), color("fill-top"), color("fill-bottom"), color("fill-shoes")]).toEqual([
      colors.skin,
      colors.hair,
      colors.iris,
      colors.top,
      colors.bottom,
      colors.shoes,
    ]);
  });
});

// --- Компонувальник на фальшивому контексті ------------------------------------------------------

/** Що малюється: назва зображення, режим, непрозорість і колір заливки в мить виклику. */
interface Op {
  ctx: string;
  op: "clear" | "fill" | "draw";
  what?: string;
  gco: string;
  alpha: number;
  fillStyle?: string;
  dest?: number[];
}

/** Фальшивий контекст: записує виклики в спільний журнал; `save` / `restore` — зі стеком стану. */
function fakeCtx(name: string, log: Op[], w = 64, h = 32): Ctx2D {
  const canvas = { width: w, height: h, name } as unknown as HTMLCanvasElement;
  const stack: { gco: GlobalCompositeOperation; alpha: number; fill: string }[] = [];
  const ctx = {
    canvas,
    globalAlpha: 1,
    globalCompositeOperation: "source-over" as GlobalCompositeOperation,
    fillStyle: "#000000" as string | CanvasGradient | CanvasPattern,
    clearRect: () => log.push({ ctx: name, op: "clear", gco: ctx.globalCompositeOperation, alpha: ctx.globalAlpha }),
    fillRect: () =>
      log.push({ ctx: name, op: "fill", gco: ctx.globalCompositeOperation, alpha: ctx.globalAlpha, fillStyle: String(ctx.fillStyle) }),
    drawImage: (image: CanvasImageSource, ...args: number[]) =>
      log.push({ ctx: name, op: "draw", what: (image as unknown as { name: string }).name, gco: ctx.globalCompositeOperation, alpha: ctx.globalAlpha, dest: args.slice(4) }),
    save: () => stack.push({ gco: ctx.globalCompositeOperation, alpha: ctx.globalAlpha, fill: String(ctx.fillStyle) }),
    restore: () => {
      const top = stack.pop();
      if (top) {
        ctx.globalCompositeOperation = top.gco;
        ctx.globalAlpha = top.alpha;
        ctx.fillStyle = top.fill;
      }
    },
    setTransform: () => {},
  };
  return ctx;
}

const image = (name: string): CanvasImageSource => ({ name }) as unknown as CanvasImageSource;
const layerOf =
  (present: readonly string[], trim = { x: 0, y: 0 }) =>
  (layer: ArtLayer): LayerImage | null =>
    present.includes(layer) ? { image: image(layer), sx: 0, sy: 0, sw: 32, sh: 16, dx: trim.x, dy: trim.y } : null;

describe("компонувальник", () => {
  const recipe: TintRecipe = {
    key: "test",
    steps: [
      { layer: "fill", color: 0xd98a3e, put: "source-over" },
      { layer: "fluff", color: 0xd98a3e, put: "source-over" },
      { layer: "tabby-mackerel", color: 0xbd6a2a, put: "source-atop", alpha: 0.55 },
      { layer: "white-1", color: 0xf4f0e8, put: "source-atop" },
      { layer: "shade", color: 0xf2dccb, tint: "multiply", put: "multiply" },
      { layer: "ink", color: null, put: "source-over" },
    ],
  };

  it("шари — у порядку рецепта, кожен своїм режимом; маски й тінь — через допоміжне полотно", () => {
    const log: Op[] = [];
    const target = fakeCtx("frame", log);
    const scratch = fakeCtx("scratch", log, 128, 128);
    composeFrame(target, layerOf(["fill", "tabby-mackerel", "white-1", "shade", "ink"], { x: 5, y: 3 }), recipe, { w: 64, h: 32, scratch: () => scratch });
    const onFrame = log.filter((o) => o.ctx === "frame" && o.op === "draw").map((o) => `${o.what}@${o.gco}${o.alpha === 1 ? "" : `×${o.alpha}`}`);
    // fluff у кадрі немає — пропущено.
    expect(onFrame).toEqual(["fill@source-over", "scratch@source-atop×0.55", "scratch@source-atop", "scratch@multiply", "ink@source-over"]);
    // Перша заливка фарбується просто на кадрі: шар → колір `source-atop`.
    const first = log.slice(0, 3);
    expect(first.map((o) => [o.ctx, o.op, o.gco])).toEqual([
      ["frame", "clear", "source-over"],
      ["frame", "draw", "source-over"],
      ["frame", "fill", "source-atop"],
    ]);
    expect(first[2]?.fillStyle).toBe("#d98a3e");
    // Шар лягає на полотно кадру зі зсувом обрізки.
    expect(log[1]?.dest).toEqual([5, 3, 32, 16]);
    // Маска: на допоміжному полотні шар → колір `source-atop`.
    const tabbyAt = log.findIndex((o) => o.ctx === "scratch" && o.what === "tabby-mackerel");
    expect(log.slice(tabbyAt - 1, tabbyAt + 2).map((o) => [o.ctx, o.op, o.gco, o.fillStyle ?? ""])).toEqual([
      ["scratch", "clear", "source-over", ""],
      ["scratch", "draw", "source-over", ""],
      ["scratch", "fill", "source-atop", "#bd6a2a"],
    ]);
    // Тінь: множення кольором, повернення прозорості шару й обтинання по складеному кадру — потім множенням на кадр.
    const shadeAt = log.findIndex((o) => o.ctx === "scratch" && o.what === "shade");
    expect(log.slice(shadeAt, shadeAt + 5).map((o) => [o.op, o.what ?? "", o.gco])).toEqual([
      ["draw", "shade", "source-over"],
      ["fill", "", "multiply"],
      ["draw", "shade", "destination-in"],
      ["draw", "frame", "destination-in"],
      ["draw", "scratch", "multiply"],
    ]);
  });

  it("на порожньому полотні маски й множення пропускаються; стан контексту повертається", () => {
    const log: Op[] = [];
    const target = fakeCtx("frame", log);
    target.globalAlpha = 0.3;
    target.globalCompositeOperation = "lighter";
    composeFrame(target, layerOf(["tabby-mackerel", "shade", "ink"]), recipe, { w: 64, h: 32, scratch: () => fakeCtx("scratch", log) });
    expect(log.filter((o) => o.op === "draw").map((o) => o.what)).toEqual(["ink"]);
    expect(target.globalAlpha).toBe(0.3);
    expect(target.globalCompositeOperation).toBe("lighter");
  });

  it("крок з нульовою непрозорістю чи без шару нічого не малює; без очищення перша заливка — через допоміжне полотно", () => {
    const log: Op[] = [];
    const target = fakeCtx("frame", log);
    const steps: TintStep[] = [
      { layer: "fill", color: 0x112233, put: "source-over", alpha: 0 },
      { layer: "point", color: 0x445566, put: "source-over" },
      { layer: "fill-iris", color: 0x778899, put: "source-over" },
    ];
    composeFrame(target, layerOf(["fill", "fill-iris"]), { key: "t", steps }, { w: 64, h: 32, clear: false, scratch: () => fakeCtx("scratch", log) });
    expect(log.some((o) => o.op === "clear" && o.ctx === "frame")).toBe(false);
    expect(log.filter((o) => o.ctx === "frame" && o.op === "draw").map((o) => o.what)).toEqual(["scratch"]);
    expect(log.find((o) => o.ctx === "scratch" && o.op === "fill")?.fillStyle).toBe("#778899");
  });

  it("колір у CSS", () => {
    expect(cssColor(0x0a0b0c)).toBe("#0a0b0c");
    expect(cssColor(0xffffff)).toBe("#ffffff");
  });
});

// --- Без браузера ----------------------------------------------------------------------------------

describe("поза браузером", () => {
  afterEach(() => resetArtSources());

  it("атласу немає: індекс null, кадри «немає», шарів немає", async () => {
    expect(await loadArtIndex()).toBeNull();
    expect(artFrameState(["person/head/0/front"])).toBe("missing");
    expect(artLayerSource("person/head/0/front")).toBeNull();
    expect(await loadArtFrames(["person/head/0/front"])).toBe(false);
  });

  it("портрет повертає false і полотна не чіпає; заглушок немає", async () => {
    await loadArtIndex();
    let touched = false;
    const canvas = {
      width: 100,
      height: 100,
      getContext: () => {
        touched = true;
        return null;
      },
    } as unknown as HTMLCanvasElement;
    const look: Look = { face: 1, skin: 0, hair: 2, hairColor: 0, eyes: 0, build: 0, top: 0, bottom: 0, shoes: 0 };
    expect(composePortrait(canvas, look, { onReady: () => {} })).toBe(false);
    expect(touched).toBe(false);
    expect(stubLayers("cat/body/normal", { size: { w: 80, h: 50 }, pivot: { x: 40, y: 45 } })).toBeNull();
  });

  it("голова портрета — з вигляду, ракурс front, потилиця під обличчям, чубчик зверху", () => {
    const look: Look = { face: 4, skin: 0, hair: -1, hairColor: 0, eyes: 0, build: 0, top: 0, bottom: 0, shoes: 0 };
    expect(portraitHead(look).map((p) => [p.id, p.state ?? null])).toEqual([
      ["person/hair-back/3", null],
      ["person/head/1", null],
      ["person/eyes", "open"],
      ["person/hair-front/3", null],
    ]);
  });
});

// --- Облік запечених кадрів ------------------------------------------------------------------------

describe("облік запечених кадрів", () => {
  function setup(budget = { framesPerOwner: 3, pixelsPerOwner: 1_000, pixelsTotal: 10_000 }) {
    const destroyed: string[] = [];
    let made = 0;
    const cache = new BakeCache<string>((key) => destroyed.push(key), budget);
    const use = (owner: string, key: string, recipe = "r", pixels = 100): string =>
      cache.use(owner, key, recipe, () => {
        made++;
        return { value: key, pixels };
      });
    return { cache, use, destroyed, made: () => made };
  }

  it("ліниво: кадр запікається раз і ділиться між власниками", () => {
    const { cache, use, made } = setup();
    use("cat:1", "a");
    use("cat:1", "a");
    use("cat:2", "a");
    expect(made()).toBe(1);
    expect(cache.stats()).toEqual({ frames: 1, pixels: 100, owners: 2, shown: 0 });
  });

  it("понад бюджет кадрів власника — найдавніші; кадр, який показують, — ні", () => {
    const { cache, use, destroyed } = setup();
    for (const key of ["a", "b", "c"]) use("cat:1", key);
    cache.retain("a");
    use("cat:1", "b");
    use("cat:1", "d");
    // «a» найдавніший, але його показують; звільнено «c» — найдавніший з непоказаних.
    expect(destroyed).toEqual(["c"]);
    expect(cache.ownerKeys("cat:1")).toEqual(["a", "b", "d"]);
    use("cat:1", "e");
    expect(destroyed).toEqual(["c", "b"]);
    cache.release("a");
    expect(destroyed).toEqual(["c", "b"]);
  });

  it("бюджет пікселів власника й загальний", () => {
    const { use, destroyed, cache } = setup({ framesPerOwner: 100, pixelsPerOwner: 250, pixelsTotal: 400 });
    use("cat:1", "a");
    use("cat:1", "b");
    use("cat:1", "c");
    expect(destroyed).toEqual(["a"]);
    use("cat:2", "x");
    use("cat:2", "y", "r", 150);
    // Разом 100 + 100 + 100 + 150 = 450 > 400: звільнено найдавніший з усіх — «b».
    expect(destroyed).toEqual(["a", "b"]);
    expect(cache.stats().pixels).toBe(350);
  });

  it("спільний кадр живе, доки він потрібен комусь іще", () => {
    const { use, destroyed, cache } = setup();
    use("cat:1", "a");
    use("cat:2", "a");
    use("cat:1", "b");
    cache.dropOwner("cat:1");
    expect(destroyed).toEqual(["b"]);
    cache.retain("a");
    cache.dropOwner("cat:2");
    expect(destroyed).toEqual(["b"]);
    cache.release("a");
    expect(destroyed).toEqual(["b", "a"]);
    expect(cache.stats()).toEqual({ frames: 0, pixels: 0, owners: 0, shown: 0 });
  });

  it("новий рецепт власника — кадри старого звільняються, щойно їх не показують", () => {
    const { use, destroyed, cache } = setup();
    use("cat:1", "body@healthy", "healthy");
    use("cat:1", "head@healthy", "healthy");
    cache.retain("head@healthy");
    use("cat:1", "body@dull", "dull");
    expect(destroyed).toEqual(["body@healthy"]);
    cache.release("head@healthy");
    expect(destroyed).toEqual(["body@healthy", "head@healthy"]);
    expect(cache.ownerKeys("cat:1")).toEqual(["body@dull"]);
  });

  it("забутий кадр запікається знову", () => {
    const { use, cache, made } = setup();
    use("cat:1", "a");
    cache.forgetKey("a");
    use("cat:1", "a");
    expect(made()).toBe(2);
    expect(cache.stats().frames).toBe(1);
  });

  it("типовий бюджет — із запасом на кота з обома ракурсами й виразами", () => {
    expect(BAKE_BUDGET.framesPerOwner).toBeGreaterThanOrEqual(24);
    expect(BAKE_BUDGET.pixelsPerOwner).toBeGreaterThanOrEqual(150_000);
    expect(BAKE_BUDGET.pixelsTotal).toBeGreaterThanOrEqual(BAKE_BUDGET.pixelsPerOwner * 20);
  });
});
