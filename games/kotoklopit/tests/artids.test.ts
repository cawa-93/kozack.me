// Id арту в коді нового вигляду — у маніфесті (крок 16, зведення хвилі 1): обвіс і варіанти скелетів (F4a), точки кадрів,
// з яких скелети беруть суглоби (`CAT_FIT`, `PERSON_FIT`), стани виразів (F4c), портрет і рецепти (F4b), кадри накладок
// `-extra` (F5). Кадри квартири й котячого кутка (F3b) перевіряє `isoworld.test.ts`.

import { describe, expect, it } from "vitest";

import { BUILDS, FACES, HAIR_STYLES } from "../src/view/palette";
import { CAT_EYES, CAT_MOUTHS } from "../src/view/anim/catface";
import { portraitHead } from "../src/view/art/compose";
import { artEntries, artEntry } from "../src/view/art/manifest";
import { extraFrameOf } from "../src/view/art/placement";
import { CAT_RECIPE_LAYERS, PERSON_RECIPE_LAYERS } from "../src/view/art/recipes";
import { ART_VIEWS, framesOf, type ArtId } from "../src/view/art/types";
import { CAT_FIT, CAT_RIG, CAT_VARIANTS, catSkin } from "../src/view/rig/defs/cat";
import { PERSON_FIT, PERSON_RIG, PERSON_VARIANTS, personSkin } from "../src/view/rig/defs/person";
import { entryPoint, type PointRefs, type RigFit } from "../src/view/rig/rigcore";
import type { Shape } from "../src/sim/types";

const entry = (id: ArtId) => {
  const found = artEntry(id);
  expect(found, id).toBeDefined();
  return found!;
};

/** Усі обвіси кота за формами (`Shape`): кожна форма кожної частини хоч раз. */
function catSkins(): Record<string, ArtId | null>[] {
  const ears: Shape["ears"][] = ["normal", "large", "folded", "curled", "tufted"];
  const tails: Shape["tail"][] = ["long", "short", "fluffy", "bobtail", "none"];
  const muzzles: Shape["muzzle"][] = ["normal", "flat", "long"];
  const builds: Shape["build"][] = ["slim", "normal", "stocky"];
  const legs: Shape["legs"][] = ["normal", "short"];
  const skins: Record<string, ArtId | null>[] = [];
  for (const build of builds) for (const leg of legs) for (let i = 0; i < 5; i++) {
    skins.push(catSkin({ build, legs: leg, ears: ears[i]!, tail: tails[i]!, muzzle: muzzles[i % muzzles.length]! }));
  }
  return skins;
}

/** Усі обвіси персонажа за виглядом (`Look`: обличчя, зачіска, статура). */
function personSkins(): Record<string, ArtId | null>[] {
  const skins: Record<string, ArtId | null>[] = [];
  for (let face = 0; face < FACES.length; face++) {
    for (let hair = 0; hair < HAIR_STYLES.length; hair++) for (let build = 0; build < BUILDS.length; build++) skins.push(personSkin({ face, hair, build }));
  }
  return skins;
}

/** Точки, на які спирається `fit`, яких немає в кадрах обвісу (для кожного ракурсу; зі списку досить першої знайденої). */
function missingPoints(fit: RigFit<string, string, string>, skin: Record<string, ArtId | null>): string[] {
  const missing: string[] = [];
  const refs = (value: PointRefs<string>) => (Array.isArray(value) ? value : [value]) as readonly { slot: string; point: string }[];
  for (const group of [fit.bones, fit.slots, fit.anchors, fit.sockets]) {
    for (const [what, value] of Object.entries(group ?? {}) as [string, PointRefs<string>][]) {
      for (const view of ART_VIEWS) {
        const list = refs(value).filter((ref) => skin[ref.slot]);
        if (list.length === 0) continue;
        const found = list.some((ref) => entryPoint(artEntry(skin[ref.slot]!), ref.point, view) !== undefined);
        if (!found) missing.push(`${what} (${view}): ${list.map((ref) => `${skin[ref.slot]}.${ref.point}`).join(" | ")}`);
      }
    }
  }
  return missing;
}

describe("скелети (F4a) — у маніфесті", () => {
  it("обвіс за замовчуванням і всі варіанти слотів — записи з обома ракурсами", () => {
    const ids = [
      ...Object.values(CAT_RIG.skin),
      ...Object.values(CAT_VARIANTS).flat(),
      ...Object.values(PERSON_RIG.skin),
      ...Object.values(PERSON_VARIANTS).flat(),
    ].filter((id): id is ArtId => id !== null);
    for (const id of new Set(ids)) expect(entry(id).views, id).toEqual(ART_VIEWS);
  });

  it("обвіс кожної форми кота й кожного вигляду персонажа — записи маніфесту", () => {
    for (const skin of [...catSkins(), ...personSkins()]) for (const id of Object.values(skin)) if (id !== null) entry(id);
  });

  it("стани слотів за замовчуванням — стани записів", () => {
    for (const rig of [CAT_RIG, PERSON_RIG]) {
      for (const slot of rig.slots) {
        const id = (rig.skin as Record<string, ArtId | null>)[slot.id];
        if (!id || slot.frame === null) continue;
        expect(entry(id).states, `${rig.id}.${slot.id}`).toContain(slot.frame);
      }
    }
  });

  it("точки, з яких скелети беруть суглоби, якорі й гнізда, — є в кадрах кожного обвісу", () => {
    const missing = [
      ...catSkins().flatMap((skin) => missingPoints(CAT_FIT, skin)),
      ...personSkins().flatMap((skin) => missingPoints(PERSON_FIT, skin)),
    ];
    expect([...new Set(missing)]).toEqual([]);
  });
});

describe("вирази (F4c) і компонувальник (F4b) — у маніфесті", () => {
  it("кожен вираз очей і рота кота — стан кадру; очі персонажа — розплющені, напівзаплющені, заплющені", () => {
    expect(entry("cat/eyes").states).toEqual(expect.arrayContaining([...CAT_EYES]));
    expect(entry("cat/mouth").states).toEqual(expect.arrayContaining([...CAT_MOUTHS]));
    expect(entry("person/eyes").states).toEqual(["open", "half", "closed"]);
  });

  it("портрет у редакторі — частини маніфесту для кожного обличчя й зачіски", () => {
    for (let face = 0; face < FACES.length; face++) {
      for (let hair = 0; hair < HAIR_STYLES.length; hair++) {
        const look = { face, hair, skin: 0, hairColor: 0, eyes: 0, build: 1, top: 0, bottom: 0, shoes: 0 };
        for (const part of portraitHead(look)) {
          const e = entry(part.id);
          if (part.state) expect(e.states, part.id).toContain(part.state);
        }
      }
    }
  });

  it("шари частин кота й персонажа — ті, які тонує рецепт (інакше шар не потрапить у запечений кадр)", () => {
    for (const e of artEntries()) {
      const known = e.id.startsWith("cat/") ? CAT_RECIPE_LAYERS : e.id.startsWith("person/") ? PERSON_RECIPE_LAYERS : null;
      if (!known) continue;
      for (const layer of e.layers ?? []) expect(known, `${e.id}: ${layer}`).toContain(layer);
    }
  });

  it("накладки -extra — у тих самих кадрах, що частина: запікання знаходить їх за `extraFrameOf`", () => {
    const extras = artEntries().filter((e) => /^(cat|person)\/[a-z-]+-extra(\/|$)/.test(e.id));
    expect(extras.length).toBeGreaterThan(0);
    for (const extra of extras) {
      const part = entry(extra.id.replace(/-extra(\/|$)/, "$1") as ArtId);
      expect({ size: extra.size, pivot: extra.pivot, res: extra.res }, extra.id).toEqual({ size: part.size, pivot: part.pivot, res: part.res });
      const frames = new Set(framesOf(extra).map((f) => f.frame));
      for (const f of framesOf(part)) expect(frames.has(extraFrameOf(f.frame) as never), `${f.frame} → ${extraFrameOf(f.frame)}`).toBe(true);
      for (const layer of extra.layers ?? []) expect(layer.startsWith("extra-"), `${extra.id}: ${layer}`).toBe(true);
    }
    expect(extraFrameOf("cat/body/normal/front")).toBe("cat/body-extra/normal/front");
    expect(extraFrameOf("person/leg/back")).toBe("person/leg-extra/back");
    expect(extraFrameOf("cat/body-extra/normal/front")).toBeNull();
    expect(extraFrameOf("env/fridge/open")).toBeNull();
  });
});
