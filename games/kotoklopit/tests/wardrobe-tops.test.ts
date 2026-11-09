// Фасони верху (§5.1, `WARDROBE.md`, «Верх»): рукави-варіанти стоять як звичайна рука, накладки — на тазі торса, комбінезон
// забирає ряди низу, а руки в усіх позах тримають кота й речі там само, що в лонгсліві.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { LOOK_OFF, LOOK_OPTIONS } from "../src/ui/look";
import { artEntry } from "../src/view/art/manifest";
import { MANIFEST as TOPS, patch, TORSO_PELVIS } from "../src/view/art/manifest/a23-person-tops";
import type { ArtEntry, ArtId } from "../src/view/art/types";
import { framesOf } from "../src/view/art/types";
import { PERSON_FIT, PERSON_RIG, personProportions, personSkin } from "../src/view/rig/defs/person";
import { Rig } from "../src/view/rig/rigcore";
import type { RigAnim } from "../src/view/rig/types";
import { BUILDS } from "../src/view/wardrobe/body";
import { CLOTHES } from "../src/view/wardrobe/clothes";
import { wearOf } from "../src/view/wardrobe/index";
import { innerColor, TOP_CUTS, topSkin, topSteps } from "../src/view/wardrobe/tops";

const ART_DIR = path.join(fileURLToPath(new URL("..", import.meta.url)), "art");

function entry(id: ArtId): ArtEntry {
  const found = artEntry(id);
  if (!found) throw new Error(`немає запису «${id}»`);
  return found;
}

const LOOK = { face: 0, skin: 1, hair: 0, hairColor: 3, eyes: 1, build: 1, top: 1, bottom: 0, shoes: 1 } as const;
const VIEWS = ["front", "back"] as const;
const cutIndex = (name: string): number => TOP_CUTS.findIndex((cut) => cut.name === name);
const OVERLAY = /^person\/(top-front|top-hem|hood)\//;

type LooseAnim = RigAnim<string, string>;
const ANIM_MODULES = import.meta.glob<Record<string, unknown>>("../src/view/rig/anims/person/*.ts", { eager: true });
const ANIMS: [string, LooseAnim][] = Object.entries(ANIM_MODULES).flatMap(([file, module]) =>
  Object.values(module)
    .filter((group): group is Record<string, LooseAnim> => typeof group === "object" && group !== null)
    .flatMap((group) => Object.entries(group).map(([name, anim]) => [`${path.basename(file)}/${name}`, anim] as [string, LooseAnim])),
);

const rigOf = (topCut: number, build: number, view: "front" | "back", fitted = true) => {
  const look = { ...LOOK, build, topCut };
  return new Rig(PERSON_RIG, {
    ...(fitted ? { fit: PERSON_FIT, lookup: artEntry } : {}),
    skin: personSkin(look),
    proportions: personProportions(look),
    facing: { view },
  });
};

describe("фасони верху: реєстр", () => {
  it("кожен кадр фасону — у маніфесті обома ракурсами; нове арту верху — у своєму файлі маніфесту", () => {
    const own = new Set(TOPS.map((e) => e.id));
    for (const [i, cut] of TOP_CUTS.entries()) {
      const skin = topSkin(wearOf({ ...LOOK, topCut: i }));
      for (const id of Object.values(skin)) {
        if (!id) continue;
        expect(framesOf(entry(id)).map((f) => f.view).sort(), `${cut.name}: ${id}`).toEqual(["back", "front"]);
        if (i > 0) expect(own.has(id) || ["person/arm", "person/arm-far"].includes(id) || id.startsWith("person/torso/"), `${cut.name}: ${id}`).toBe(true);
      }
    }
  });

  it("рукав-варіант — полотно, pivot і точки hand, grip звичайної руки: кисть і все в ній стоять так само", () => {
    const arm = entry("person/arm");
    const arms = TOPS.filter((e) => e.id.startsWith("person/arm"));
    expect(arms.length).toBeGreaterThan(0);
    for (const e of arms) {
      expect(e.points?.["hand"], e.id).toBeDefined();
      expect(e.points?.["grip"], e.id).toBeDefined();
      // Точка манжета (`cuff`, принти) — лише в рукава, що має манжет; кисть — як у звичайної руки.
      const hands = (points: typeof arm.points) => ({ hand: points?.["hand"], grip: points?.["grip"] });
      expect({ size: e.size, pivot: e.pivot, points: hands(e.points) }, e.id).toEqual({ size: arm.size, pivot: arm.pivot, points: hands(arm.points) });
    }
    for (const cut of TOP_CUTS) expect(Boolean(cut.arm), cut.name).toBe(Boolean(cut.armFar));
  });

  it("накладки — на тазі звичайного торса: pivot — таз у координатах свого клаптика, на полотні", () => {
    const torso = entry("person/torso/1");
    expect(TORSO_PELVIS).toEqual(torso.pivot);
    expect(patch(15, 2, 29, 52).pivot).toEqual({ x: 14, y: 52 });
    const overlays = TOPS.filter((e) => OVERLAY.test(e.id));
    expect(overlays.length).toBeGreaterThan(0);
    for (const e of overlays) {
      // Зсув клаптика — цілий, а клаптик лежить на торсі (з запасом угору: комір водолазки вищий за шию).
      const x = TORSO_PELVIS.x - e.pivot.x;
      const y = TORSO_PELVIS.y - e.pivot.y;
      expect(Number.isInteger(x) && Number.isInteger(y), e.id).toBe(true);
      expect(x >= 0 && x + e.size.w <= torso.size.w && y >= -4 && y + e.size.h <= torso.size.h, e.id).toBe(true);
      expect(e.pivot.x >= 0 && e.pivot.x <= e.size.w && e.pivot.y >= 0 && e.pivot.y <= e.size.h, e.id).toBe(true);
    }
  });

  it("накладка лягає на торс там, де він намальований: повторені лінії торса — у тих самих точках", () => {
    // Край шиї спереду (22, 11.2) у майці й поділ торса (8, 49.6) спереду та (9.4, 49.4) ззаду в паску комбінезона.
    const has = (id: ArtId, view: string, x: number, y: number): boolean => {
      const e = entry(id);
      const svg = readFileSync(path.join(ART_DIR, id, `${view}.svg`), "utf8");
      const r = (v: number): number => Math.round(v * 100) / 100;
      return svg.includes(`M${r(x - (TORSO_PELVIS.x - e.pivot.x))} ${r(y - (TORSO_PELVIS.y - e.pivot.y))}`);
    };
    expect(has("person/top-front/tank", "front", 22, 11.2)).toBe(true);
    expect(has("person/top-hem/jumpsuit", "front", 8, 49.6)).toBe(true);
    expect(has("person/top-hem/jumpsuit", "back", 9.4, 49.4)).toBe(true);
  });

  it("верх із річчю під ним має її колір у рецепті; під верхом того самого кольору — протилежна за світлотою", () => {
    for (const [i, cut] of TOP_CUTS.entries()) {
      const steps = topSteps(wearOf({ ...LOOK, topCut: i }), 0x5a7fc0);
      expect(steps.some((s) => s.layer === "fill-inner"), cut.name).toBe(cut.inner !== undefined);
    }
    const white = CLOTHES[6] ?? 0;
    const graphite = CLOTHES[5] ?? 0;
    expect(innerColor(white, 0x5a7fc0)).toBe(white);
    expect(innerColor(white, white)).toBe(graphite);
    expect(innerColor(graphite, graphite)).toBe(white);
  });

  it("комбінезон: власний низ (suit) кольору верху, ряди низу неактивні, хоч би що обрано в Look", () => {
    const i = cutIndex("комбінезон");
    expect(i).toBeGreaterThan(0);
    for (const bottomCut of [0, 1, 5]) {
      const wear = wearOf({ ...LOOK, topCut: i, bottomCut, bottom: 3 });
      expect(wear.suit).toBe(true);
      expect(wear.bottomCut).toBe(TOP_CUTS[i]?.bottom);
      for (const key of ["bottomCut", "bottom", "bottomPattern"] as const) {
        expect(LOOK_OPTIONS.find((row) => row.key === key)?.off?.(wear) ?? null, key).toBe(LOOK_OFF.suit);
      }
    }
    for (const [j, cut] of TOP_CUTS.entries()) if (j !== i) expect(wearOf({ ...LOOK, topCut: j }).suit, cut.name).toBe(false);
  });
});

describe("фасони верху: скелет", () => {
  it("поза з точок кадрів — як без них (звичайна статура) і як у лонгсліві (будь-яка статура): фасон суглобів не зсуває", () => {
    for (let topCut = 0; topCut < TOP_CUTS.length; topCut++) {
      for (let build = 0; build < BUILDS.length; build++) {
        for (const view of VIEWS) {
          const art = rigOf(topCut, build, view).evaluate(0);
          // Запасні числа скелета — точки звичайної статури (`tests/rig.test.ts`); інші статури порівнюємо з лонгслівом.
          const plain = build === 1 ? rigOf(topCut, build, view, false).evaluate(0) : rigOf(0, build, view).evaluate(0);
          const where = `${TOP_CUTS[topCut]?.name} ${build} ${view}`;
          art.slots.forEach((s, i) => {
            const p = plain.slots[i]!;
            expect(Math.hypot(s.x - p.x, s.y - p.y), `${where}: слот ${s.id}`).toBeLessThan(0.05);
          });
          art.bones.forEach((b, i) => {
            const p = plain.bones[i]!;
            expect(Math.hypot(b.world.tx - p.world.tx, b.world.ty - p.world.ty), `${where}: кістка ${b.id}`).toBeLessThan(0.05);
          });
        }
      }
    }
  });

  it("у кожній анімації рук (кіт на руках, річ, пестощі, телефон) кисть і гнізда — там само, що в лонгсліві", () => {
    expect(ANIMS.length).toBeGreaterThan(10);
    for (let topCut = 1; topCut < TOP_CUTS.length; topCut++) {
      if (!TOP_CUTS[topCut]?.arm) continue;
      for (const view of VIEWS) {
        const base = rigOf(0, 1, view);
        const rig = rigOf(topCut, 1, view);
        for (const [name, anim] of ANIMS) {
          base.play(anim, 0, { blend: 0, restart: true });
          rig.play(anim, 0, { blend: 0, restart: true });
          for (const t of [0, anim.duration / 3, (anim.duration * 2) / 3]) {
            base.evaluate(t);
            rig.evaluate(t);
            const where = `${TOP_CUTS[topCut]?.name} ${view} ${name} @${Math.round(t)}`;
            for (const anchor of ["hands", "hands-far"] as const) {
              const a = rig.anchor(anchor);
              const b = base.anchor(anchor);
              expect(Math.hypot((a?.x ?? NaN) - (b?.x ?? NaN), (a?.y ?? NaN) - (b?.y ?? NaN)), `${where}: ${anchor}`).toBeLessThan(1e-6);
            }
            for (const socket of ["held", "rod", "arms"] as const) {
              const a = rig.socket(socket);
              const b = base.socket(socket);
              expect(Math.hypot((a?.x ?? NaN) - (b?.x ?? NaN), (a?.y ?? NaN) - (b?.y ?? NaN)), `${where}: ${socket}`).toBeLessThan(1e-6);
            }
          }
        }
      }
    }
  });
});

describe("фасони верху: атлас", () => {
  it("частка верху в бюджеті полотна атласу — не більше 0,6 млн пікселів", () => {
    let area = 0;
    for (const e of TOPS) area += framesOf(e).length * (e.layers?.length ?? 1) * e.size.w * 2 * e.size.h * 2;
    expect(TOPS.every((e) => (e.res ?? 2) === 2)).toBe(true);
    expect(area).toBeLessThanOrEqual(0.6e6);
  });
});
