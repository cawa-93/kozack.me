// Запікання кадрів скелета (`bake.ts`, `bakecache.ts`, `rigsprite.ts`): що запікається наперед і чи вміщує бюджет
// власника те, що він показує.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { Look, Shape } from "../src/sim/types";
import { BakeCache, BAKE_BUDGET, BAKE_MS_GUESS, FRAME_MS, frameLeft, IDLE_SPARE_MS, idleFits, nextBakeMs } from "../src/view/art/bakecache";
import { artEntry, DEFAULT_RES } from "../src/view/art/manifest";
import { ART_VIEWS, frameId, type ArtId, type ArtView } from "../src/view/art/types";
import { CAT_FAR_SLOTS, ISO_CAT_FIT, ISO_CAT_RIG, isoCatSkin } from "../src/view/iso/catrig";
import { CAT_ANIMS, PERSON_ANIMS } from "../src/view/rig/anims";
import { CAT_FIT, CAT_RIG } from "../src/view/rig/defs/cat";
import { PERSON_FAR_SLOTS, PERSON_FIT, PERSON_RIG, personSkin } from "../src/view/rig/defs/person";
import { Rig, slotViews } from "../src/view/rig/rigcore";
import type { RigAnim, RigDef } from "../src/view/rig/types";
import { BUILDS, FACES } from "../src/view/wardrobe/body";
import { BOTTOM_CUTS } from "../src/view/wardrobe/bottoms";
import { HAIR_STYLES } from "../src/view/wardrobe/hair";
import { SHOE_CUTS } from "../src/view/wardrobe/shoes";
import { TOP_CUTS } from "../src/view/wardrobe/tops";

type LooseDef = RigDef<string, string, string>;
type LooseAnim = RigAnim<string, string>;

describe("запікання наперед — лише в ракурсах, де слот видно (`slotViews`)", () => {
  it("ззаду морди, очей і рота кота, очей і чубчика персонажа не видно: запікати їх там нема для чого", () => {
    for (const def of [CAT_RIG, ISO_CAT_RIG] as unknown as LooseDef[]) {
      for (const slot of ["muzzle", "eyes", "mouth"]) expect(slotViews(def, slot), slot).toEqual(["front"]);
      for (const slot of ["head", "body", "tail", "ear-far"]) expect(slotViews(def, slot), slot).toEqual([...ART_VIEWS]);
    }
    const person = PERSON_RIG as unknown as LooseDef;
    for (const slot of ["eyes", "hair-front"]) expect(slotViews(person, slot), slot).toEqual(["front"]);
    for (const slot of ["head", "hair-back", "torso", "skirt"]) expect(slotViews(person, slot), slot).toEqual([...ART_VIEWS]);
  });

  it("жодна анімація не показує слота в ракурсі, якого немає в `slotViews`", () => {
    const cases: [LooseDef, unknown, readonly LooseAnim[]][] = [
      [CAT_RIG as unknown as LooseDef, CAT_FIT, Object.values(CAT_ANIMS) as LooseAnim[]],
      [ISO_CAT_RIG as unknown as LooseDef, ISO_CAT_FIT, Object.values(CAT_ANIMS) as LooseAnim[]],
      [PERSON_RIG as unknown as LooseDef, PERSON_FIT, Object.values(PERSON_ANIMS) as LooseAnim[]],
    ];
    for (const [def, fit, anims] of cases) {
      for (const view of ART_VIEWS) {
        const rig = new Rig(def, { fit: fit as never, lookup: artEntry, facing: { view } });
        const hidden = rig.slots.filter((slot) => !slotViews(def, slot.id).includes(view)).map((slot) => slot.id);
        for (const anim of anims) {
          rig.play(anim, 0, { blend: 0, restart: true });
          for (const k of [0, 0.25, 0.5, 0.75, 1]) {
            rig.evaluate(anim.duration * k);
            for (const id of hidden) expect(rig.slot(id).visible, `${def.id}/${view}/${id}`).toBe(false);
          }
        }
      }
    }
  });
});

describe("запечений кадр — звичайна текстура з полотна (`bake.ts`)", () => {
  const source = readFileSync(new URL("../src/view/art/bake.ts", import.meta.url), "utf8");

  it("не CanvasTexture: та одразу читає пікселі полотна (`getImageData`) і тримає їхню копію; полотну тоді не треба лишатися в пам'яті процесора", () => {
    expect(source).not.toMatch(/\.addCanvas\(/);
    expect(source).not.toMatch(/willReadFrequently:\s*true/);
    expect(source).toMatch(/\.textures\.create\(/);
  });

  it("полотно знищеного кадру обнуляється одразу, не чекаючи збирача сміття (iOS обмежує сумарну пам'ять полотен)", () => {
    expect(source).toMatch(/\.width = 0/);
    expect(source).toMatch(/\.height = 0/);
  });
});

describe("запікання у вільний час (`prebakeArt`)", () => {
  it("тривалість запікання — ковзне середнє замірів: спершу — як на повільному телефоні, далі — як на цьому", () => {
    expect(BAKE_MS_GUESS).toBeGreaterThanOrEqual(5);
    let avg = BAKE_MS_GUESS;
    for (let i = 0; i < 40; i++) avg = nextBakeMs(avg, 1.5);
    expect(avg).toBeCloseTo(1.5, 1);
    // Один довгий замір (перше звернення до сторінки атласу) середнього не перекидає.
    const spike = nextBakeMs(avg, 40);
    expect(spike).toBeGreaterThan(avg);
    expect(spike).toBeLessThan(20);
  });

  it("ще одне запікання — лише коли вільного часу більше, ніж воно зазвичай триває, і лишається запас браузерові", () => {
    // Телефон: запікання ≈ 7 мс — 5 мс вільного часу мало (раніше бралося, бо більше за 3).
    expect(idleFits(5, 7)).toBe(false);
    expect(idleFits(7 + IDLE_SPARE_MS, 7)).toBe(false);
    expect(idleFits(12, 7)).toBe(true);
    // Десктоп: ≈ 1,5 мс — вистачає й 5.
    expect(idleFits(5, 1.5)).toBe(true);
    expect(idleFits(IDLE_SPARE_MS, 0)).toBe(false);
  });

  it("без `requestIdleCallback` вільний час — те, що лишилося до наступного кадру гри", () => {
    expect(frameLeft(1000, 1000)).toBeCloseTo(FRAME_MS);
    expect(frameLeft(1012, 1000)).toBeCloseTo(FRAME_MS - 12);
    // Кадр гри затягнувся чи кадрів немає (вкладку сховано) — вільного часу немає.
    expect(frameLeft(1030, 1000)).toBeLessThan(0);
    expect(idleFits(frameLeft(1030, 1000), 1)).toBe(false);
  });
});

// --- Бюджет власника ---------------------------------------------------------------------------

type Skin = Readonly<Record<string, ArtId | null>>;

/** Пікселі запеченого кадру запису: полотно `size · res` (як `realWidth × realHeight` кадру атласу в `bake.ts`). */
function framePixels(art: ArtId): number {
  const entry = artEntry(art);
  if (!entry) return 0;
  const res = entry.res ?? DEFAULT_RES;
  return Math.round(entry.size.w * res) * Math.round(entry.size.h * res);
}

/** Що власник може показати за весь час: видимі в ракурсі слоти × усі стани їхніх записів. */
function demand(def: LooseDef, skin: Skin): { frames: number; pixels: number } {
  let frames = 0;
  let pixels = 0;
  for (const view of ART_VIEWS) {
    for (const slot of def.slots) {
      const art = skin[slot.id];
      if (!art || !slotViews(def, slot.id).includes(view)) continue;
      const states = artEntry(art)?.states?.length ?? 1;
      frames += states;
      pixels += states * framePixels(art);
    }
  }
  return { frames, pixels };
}

/**
 * Скелет, що повертається, як його показує `RigSprite`: у ракурсі кожен видимий слот по черзі показує всі стани свого запису
 * (кіт перебирає вирази, персонаж сідає й присідає) — кожна зміна кадру запікає його, якщо треба (`use`), і тримає, поки
 * показує (`retain` / `release`); і тієї ж миті просить той самий кадр в інших ракурсах, де слот видно (`prebakeArt`:
 * запікання у вільний час, якщо кадру ще немає). Скільки кадрів запечено за перше коло (обидва ракурси) і за `count`
 * поворотів після нього.
 */
function turns(def: LooseDef, skin: Skin, far: readonly string[], owner: string, count: number): { first: number; after: number } {
  const cache = new BakeCache<string>(() => {});
  let made = 0;
  const keyOf = (art: ArtId, state: string | null, view: ArtView, slot: string): string => {
    const v = artEntry(art)?.views?.includes(view) ? view : null;
    return `${frameId(art, state, v)}@${far.includes(slot) ? "far" : "near"}`;
  };
  const use = (key: string, art: ArtId): void => {
    // Ближні й дальні частини — той самий рід рецепта (`farRecipe`), як у `bake.ts`.
    cache.use(owner, key, "look", () => {
      made++;
      return { value: key, pixels: framePixels(art) };
    });
  };
  const shown = new Map<string, string>();
  const show = (view: ArtView): void => {
    for (const slot of def.slots) {
      const art = skin[slot.id];
      const views = slotViews(def, slot.id);
      if (!art || !views.includes(view)) continue;
      const entry = artEntry(art);
      for (const state of entry?.states ?? [null]) {
        const key = keyOf(art, state, view, slot.id);
        use(key, art);
        cache.retain(key);
        const prev = shown.get(slot.id);
        if (prev !== undefined) cache.release(prev);
        shown.set(slot.id, key);
        for (const other of views) {
          if (other === view || !entry?.views?.includes(other)) continue;
          const ahead = keyOf(art, state, other, slot.id);
          if (cache.peek(ahead) === undefined) use(ahead, art);
        }
      }
    }
  };
  show("front");
  show("back");
  const first = made;
  for (let i = 0; i < count; i++) show(i % 2 === 0 ? "front" : "back");
  return { first, after: made - first };
}

/** Значення форм кота: кожне — з типу (помилка в переліку — помилка типів). */
const TAILS: readonly Shape["tail"][] = ["long", "short", "fluffy", "bobtail", "none"];
const EARS: readonly Shape["ears"][] = ["normal", "large", "folded", "curled", "tufted"];
const MUZZLES: readonly Shape["muzzle"][] = ["normal", "flat", "long"];
const CAT_BUILDS: readonly Shape["build"][] = ["slim", "normal", "stocky"];
const CAT_LEGS: readonly Shape["legs"][] = ["normal", "short"];

/** Найважчий кіт за мірою: усі форми порід, вагітна (з животом). */
function heaviestCat(measure: (skin: Skin) => number): Skin {
  let best: Skin = {};
  let most = -1;
  for (const tail of TAILS)
    for (const ears of EARS)
      for (const muzzle of MUZZLES)
        for (const build of CAT_BUILDS)
          for (const legs of CAT_LEGS) {
            const skin = isoCatSkin({ tail, ears, muzzle, build, legs }, true);
            const m = measure(skin);
            if (m > most) [best, most] = [skin, m];
          }
  return best;
}

/**
 * Найважче вбрання персонажа за мірою: зачіска й обличчя мають свої слоти, тож найважчі з них — окремо; верх, низ і взуття
 * ділять слоти (спідниця, поділ штанини, халява), тож їх — перебором з кожною статурою.
 */
function heaviestPerson(measure: (skin: Skin) => number): Skin {
  const base: Look = { face: 0, skin: 0, hair: 0, hairColor: 0, eyes: 0, build: 1, top: 0, bottom: 0, shoes: 0 };
  const pick = (count: number, look: (i: number) => Look): Look => {
    let best = look(0);
    let most = -1;
    for (let i = 0; i < count; i++) {
      const m = measure(personSkin(look(i)));
      if (m > most) [best, most] = [look(i), m];
    }
    return best;
  };
  const hair = pick(HAIR_STYLES.length, (i) => ({ ...base, hair: i })).hair;
  const face = pick(FACES.length, (i) => ({ ...base, face: i })).face;
  const [b, t, w] = [BUILDS.length, TOP_CUTS.length, BOTTOM_CUTS.length];
  const look = pick(b * t * w * SHOE_CUTS.length, (i) => ({
    ...base,
    hair,
    face,
    build: i % b,
    topCut: Math.floor(i / b) % t,
    bottomCut: Math.floor(i / (b * t)) % w,
    shoeCut: Math.floor(i / (b * t * w)),
  }));
  return personSkin(look);
}

describe("бюджет запечених кадрів власника (`BAKE_BUDGET`)", () => {
  const person = PERSON_RIG as unknown as LooseDef;
  const cat = ISO_CAT_RIG as unknown as LooseDef;

  it("персонаж у найважчому вбранні: після першого кола повороти не запікають нічого", () => {
    for (const measure of [(s: Skin) => demand(person, s).frames, (s: Skin) => demand(person, s).pixels]) {
      const skin = heaviestPerson(measure);
      const { first, after } = turns(person, skin, PERSON_FAR_SLOTS, "person", 10);
      expect(after, JSON.stringify(skin)).toBe(0);
      expect(first).toBe(demand(person, skin).frames);
    }
  });

  it("кіт з усіма станами очей і рота: після першого кола повороти не запікають нічого", () => {
    for (const measure of [(s: Skin) => demand(cat, s).frames, (s: Skin) => demand(cat, s).pixels]) {
      const skin = heaviestCat(measure);
      const { first, after } = turns(cat, skin, CAT_FAR_SLOTS, "cat:1", 10);
      expect(after, JSON.stringify(skin)).toBe(0);
      expect(first).toBe(demand(cat, skin).frames);
    }
  });

  it("загальний бюджет вміщує найважчих персонажа й котів сценарію з найбільшою зграєю (`many-cats`)", () => {
    const scenario = JSON.parse(readFileSync(new URL("../scenarios/many-cats.json", import.meta.url), "utf8")) as { cats: unknown[] };
    const cats = scenario.cats.length;
    expect(cats).toBeGreaterThanOrEqual(20);
    const catPixels = demand(cat, heaviestCat((s) => demand(cat, s).pixels)).pixels;
    const personPixels = demand(person, heaviestPerson((s) => demand(person, s).pixels)).pixels;
    expect(cats * catPixels + personPixels).toBeLessThanOrEqual(BAKE_BUDGET.pixelsTotal);
  });
});
