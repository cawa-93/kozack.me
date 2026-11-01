// Коти ізометричного вигляду (крок 16, T1, `src/view/iso/cat*.ts`): скелет кота в грі (вуха, обхват, живіт), розмір
// кошеняти й повнота, складання анімацій (основна + накладка + обличчя), де кіт (меблі, схованки, барабан, переноска,
// ковдра, робот, руки) і налаштування рендерера. Усе без Phaser.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createCat, idleAct } from "../src/sim/cat";
import { WEIGHT } from "../src/sim/config";
import { advance, newGame } from "../src/sim/game";
import { CARRIER_SPOT, objectById, slotCenter } from "../src/sim/home";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Cat, CatAct, Feeder, HomeItem, Save } from "../src/sim/types";
import { CAT_EARS } from "../src/view/anim/catface";
import { catFacing } from "../src/view/anim/catfacing";
import { CAT_ANIM_IDS, CAT_ONE_SHOT_MS, CAT_OVERLAYS } from "../src/view/anim/ids";
import { artEntry } from "../src/view/art/manifest";
import { ART_VIEWS } from "../src/view/art/types";
import { CAT_ANIMS } from "../src/view/rig/anims";
import { catOverlayOn } from "../src/view/rig/anims/cat/feelings";
import { CAT_FIT, CAT_RIG } from "../src/view/rig/defs/cat";
import { animProblems, BLEND_MS, fitProblems, Rig, rigProblems } from "../src/view/rig/rigcore";
import type { RigAnim, RigDef } from "../src/view/rig/types";
import { composeCatAnim, layerAnims, layeredTiming, MAX_PERIOD, playBlend, withBelly, withFace } from "../src/view/iso/catanim";
import { catPlay, GAIT_TELEPORT, gaitRate, gaitSpeed, groundAt, JUMP, liftAt, nextGait, nextLift, startShot, type Lift } from "../src/view/iso/catplay";
import { catJumpLift, catLegLength, catPetPoint, catRunRate, catWalkRate } from "../src/view/rig/anims/cat/basic";
import { catBrawlTop } from "../src/view/rig/anims/cat/behavior";
import { catRenderConfig, isSoftwareRenderer } from "../src/view/iso/catrender";
import { BELLY_ABOVE, bonePoint, brawlTop, CAT_HALF_WIDTH, catSize, EAR_BONES, EAR_POSES, fatWeight, ISO_CAT_FIT, ISO_CAT_RIG, isoCatHalf, isoCatProportions, isoCatSkin, KITTEN_SIZE } from "../src/view/iso/catrig";
import { BLANKET_EARS, blanketOffset, BOWL_APPROACH, BOWL_BEHIND, bowlOf, bowlSeat, CAT_PIECE, catSpot, SPOT_SCALE, underGrate } from "../src/view/iso/catspot";
import { artOffset, footprintCenter } from "../src/view/iso/geometry";
import { catPose } from "../src/view/pose";
import { isoOrder } from "../src/view/world/isoorder";
import { isoObjectLook } from "../src/view/world/objects";
import { ISO } from "../src/view/world/projection";
import { withCatCorner } from "./helpers";

type LooseRig = RigDef<string, string, string>;
type LooseAnim = RigAnim<string, string>;

function game(): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 5 }));
  save.current.minute = 17 * 60;
  return save;
}

function withCat(save: Save, at = { x: 9.5, y: 8.5 }, ageWeeks = 20): Cat {
  const cat = createCat(save.current, createRng(save.current.cats.length + 7), { source: "shelter", ageWeeks, at });
  cat.arrivedDay = -10;
  cat.act = idleAct(30);
  addCat(save.current, cat);
  return cat;
}

const act = (kind: CatAct["kind"], extra: Partial<CatAct> = {}): CatAct => ({ kind, target: null, goal: null, minutes: 10, elapsed: 0, ...extra });

/** Ґратки переноски — як у `floor.ts` (`CARRIER_GRATE_DEPTH`; сам `floor.ts` тягне Phaser). */
const SPOT = { grate: 0.004 } as const;

describe("скелет кота в грі (`ISO_CAT_RIG`)", () => {
  it("правильний: без помилок визначення й точок арту, усі кістки й слоти `CAT_RIG` на місці", () => {
    expect(rigProblems(ISO_CAT_RIG as unknown as LooseRig)).toEqual([]);
    expect(fitProblems(ISO_CAT_RIG as unknown as LooseRig, ISO_CAT_FIT)).toEqual([]);
    const bones = ISO_CAT_RIG.bones.map((b) => b.id);
    for (const bone of CAT_RIG.bones) expect(bones).toContain(bone.id);
    expect(bones).toEqual(expect.arrayContaining(["girth", "ear-far", "ear-near"]));
    const slots = ISO_CAT_RIG.slots.map((s) => s.id);
    for (const slot of CAT_RIG.slots) expect(slots).toContain(slot.id);
    expect(slots).toContain("belly");
    // Вуха — на своїх кістках (діти голови), тулуб і живіт — на обхваті; живіт — над тулубом, під ближніми лапами в обох ракурсах.
    for (const ear of EAR_BONES) {
      expect(ISO_CAT_RIG.bones.find((b) => b.id === ear)?.parent).toBe("head");
      expect(ISO_CAT_RIG.slots.find((s) => s.id === ear)?.bone).toBe(ear);
    }
    const body = ISO_CAT_RIG.slots.find((s) => s.id === "body")!;
    const belly = ISO_CAT_RIG.slots.find((s) => s.id === "belly")!;
    expect(body.bone).toBe("girth");
    expect(belly.bone).toBe("girth");
    expect(belly.z).toBeGreaterThan(body.z);
    for (const view of ART_VIEWS) {
      const z = (id: string): number => {
        const slot = ISO_CAT_RIG.slots.find((s) => s.id === id)!;
        const over = ISO_CAT_RIG.views[view].slots?.[slot.id] as { z?: number } | undefined;
        return over?.z ?? slot.z;
      };
      for (const leg of ["leg-back-near", "leg-front-near"]) expect(z("belly")).toBeLessThan(z(leg));
      expect(z("belly")).toBeGreaterThan(z("body"));
    }
    expect(ISO_CAT_RIG.skin.belly).toBeNull();
  });

  it("у вихідній позі кожен слот стоїть там само, де в `CAT_RIG`, в обох ракурсах (з точками арту)", () => {
    for (const view of ART_VIEWS) {
      const base = new Rig(CAT_RIG, { fit: CAT_FIT, lookup: artEntry, facing: { view } }).evaluate(0);
      const iso = new Rig(ISO_CAT_RIG, { fit: ISO_CAT_FIT, lookup: artEntry, facing: { view } }).evaluate(0);
      for (const slot of base.slots) {
        const other = iso.slot(slot.id);
        expect(other.x, `${view} ${slot.id}.x`).toBeCloseTo(slot.x, 6);
        expect(other.y, `${view} ${slot.id}.y`).toBeCloseTo(slot.y, 6);
        expect(other.rot, `${view} ${slot.id}.rot`).toBeCloseTo(slot.rot, 6);
        expect(other.z, `${view} ${slot.id}.z`).toBe(slot.z);
        expect(other.visible, `${view} ${slot.id}.visible`).toBe(slot.visible);
      }
      expect(iso.anchor("head")).toEqual(base.anchor("head"));
    }
  });

  it("живіт вагітної — кадр статури кота; не вагітна — слота немає", () => {
    const shape = { muzzle: "normal", ears: "normal", tail: "long", build: "stocky", legs: "normal" } as const;
    expect(isoCatSkin(shape, true).belly).toBe("cat/belly/stocky");
    expect(artEntry("cat/belly/stocky")).toBeDefined();
    expect(isoCatSkin(shape, false).belly).toBeNull();
  });

  it("повний кіт ширшає тулубом (кістка обхвату), а голова й лапи — ті самі", () => {
    const thin = new Rig(ISO_CAT_RIG, { fit: ISO_CAT_FIT, lookup: artEntry }).evaluate(0);
    const fat = new Rig(ISO_CAT_RIG, { fit: ISO_CAT_FIT, lookup: artEntry, proportions: [{ name: "fat", weight: 1 }] }).evaluate(0);
    expect(fat.slot("body").sy).toBeCloseTo(1 + WEIGHT.girthStep * 0.8, 6);
    expect(fat.slot("body").sx).toBeGreaterThan(1);
    expect(fat.slot("belly").sy).toBeCloseTo(fat.slot("body").sy, 6);
    for (const slot of ["head", "leg-front-near", "leg-back-far", "tail", "eyes"] as const) {
      expect(fat.slot(slot).sx).toBeCloseTo(thin.slot(slot).sx, 6);
      expect(fat.slot(slot).x).toBeCloseTo(thin.slot(slot).x, 6);
    }
    expect(fatWeight(1)).toBe(0);
    expect(fatWeight(1 + WEIGHT.girthStep)).toBe(1);
    expect(fatWeight(1 + WEIGHT.girthStep / 2)).toBeCloseTo(0.5, 6);
  });

  it("вуха: «у боки» — те, що на екрані ліворуч, повертається проти годинникової, праворуч — за; притиснуті — назад і нижчі", () => {
    for (const view of ART_VIEWS) {
      const rig = new Rig(ISO_CAT_RIG, { fit: ISO_CAT_FIT, lookup: artEntry, facing: { view } }).evaluate(0);
      const [left, right] = [...EAR_BONES].sort((a, b) => rig.slot(a).x - rig.slot(b).x);
      expect(EAR_POSES.side[view][left!].rot).toBeLessThan(0);
      expect(EAR_POSES.side[view][right!].rot).toBeGreaterThan(0);
      expect(EAR_POSES.back[view][left!].rot).toBeLessThan(EAR_POSES.side[view][left!].rot);
      for (const ear of EAR_BONES) {
        expect(EAR_POSES.up[view][ear]).toEqual({ rot: 0, scale: 1 });
        expect(EAR_POSES.flat[view][ear].rot).toBeLessThan(0);
        expect(EAR_POSES.flat[view][ear].scale).toBeLessThan(1);
      }
    }
    for (const ears of CAT_EARS) expect(Object.keys(EAR_POSES[ears])).toEqual([...ART_VIEWS]);
  });
});

describe("розмір кота (`catSize`)", () => {
  it("кошеня — 0,4 / 0,55 / 0,65 дорослого (§9.4), з 3 тижнів — як дорослий; разом із коренем пропорцій `kitten` — саме стільки", () => {
    const root = CAT_RIG.proportions?.kitten?.root?.scale?.x ?? 1;
    KITTEN_SIZE.forEach((size, week) => {
      const s = catSize({ ageWeeks: week, traits: [], breed: ["mixed", "mixed"] });
      expect(s.relative).toBeCloseTo(size, 6);
      expect(s.kitten).toBeGreaterThan(0);
      expect(s.scale * (1 + (root - 1) * s.kitten)).toBeCloseTo(size, 6);
    });
    const adult = catSize({ ageWeeks: 3, traits: [], breed: ["mixed", "mixed"] });
    expect(adult).toEqual({ kitten: 0, scale: 1, relative: 1 });
    // Кошеня підростає: розмір росте, кошенячі пропорції слабшають.
    const sizes = [0, 1, 2].map((week) => catSize({ ageWeeks: week, traits: [], breed: ["mixed", "mixed"] }));
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]!.relative).toBeGreaterThan(sizes[i - 1]!.relative);
      expect(sizes[i]!.kitten).toBeLessThan(sizes[i - 1]!.kitten);
    }
  });

  it("півширина в реєстрі глибини — з запасом на дорослого й найповнішого: кошеня, що виросте й погладшає, не вужче за правду", () => {
    const plain = { traits: [], breed: ["mixed", "mixed"] } as Pick<Cat, "traits" | "breed">;
    const half = isoCatHalf(plain);
    // Новонароджене — та сама півширина, що й дорослий (кіт живе з тим самим виглядом, поки росте).
    expect(half).toBeCloseTo(CAT_HALF_WIDTH * (1 + WEIGHT.girthStep * 0.35), 9);
    expect(half).toBeGreaterThanOrEqual(CAT_HALF_WIDTH * catSize({ ageWeeks: 40, ...plain }).scale * 1.2);
    const big = { traits: [{ group: "size", level: 2, seen: 0, known: true }], breed: ["mixed", "mixed"] } as Pick<Cat, "traits" | "breed">;
    expect(isoCatHalf(big)).toBeCloseTo(half * 1.12, 9);
  });

  it("порода «Розмір +2» — на 12% більша; пропорції: короткі лапи, статура, кошеня й повнота", () => {
    const big = catSize({ ageWeeks: 30, traits: [{ group: "size", level: 2, seen: 0, known: true }], breed: ["mixed", "mixed"] });
    expect(big.scale).toBeCloseTo(1.12, 6);
    const save = game();
    const cat = withCat(save, { x: 9.5, y: 8.5 }, 1);
    cat.shape = { ...cat.shape, legs: "short", build: "stocky" };
    cat.weight = WEIGHT.max;
    const list = isoCatProportions(cat);
    expect(list).toContain("short-legs");
    expect(list).toContain("stocky");
    expect(list.some((p) => typeof p !== "string" && p.name === "kitten")).toBe(true);
    expect(list.some((p) => typeof p !== "string" && p.name === "fat" && p.weight === 1)).toBe(true);
  });
});

describe("складання анімації кота (`catanim.ts`)", () => {
  const base: LooseAnim = {
    duration: 600,
    loop: true,
    bones: { tail: { rot: [{ t: 0, v: 0 }, { t: 300, v: 10 }, { t: 600, v: 0 }] }, head: { rot: [{ t: 0, v: 2 }, { t: 600, v: 2 }] } },
    slots: { eyes: { frame: [{ t: 0, v: "open" }] } },
  };
  const overlay: LooseAnim = { duration: 400, loop: true, bones: { tail: { rot: [{ t: 0, v: 0 }, { t: 200, v: 20 }, { t: 400, v: 0 }] }, body: { pos: [{ t: 0, v: { x: 0, y: 0 } }, { t: 400, v: { x: 0, y: -2 } }] } } };

  it("період: обидві по колу — спільне кратне (не довше за межу); разова накладка — її час", () => {
    expect(layeredTiming(base, overlay)).toEqual({ duration: 1200, loop: true });
    expect(layeredTiming(base, { duration: 700, loop: false })).toEqual({ duration: 700, loop: false });
    expect(layeredTiming({ duration: 380, loop: false }, overlay)).toEqual({ duration: 380, loop: false });
    expect(layeredTiming({ duration: 997, loop: true }, { duration: 1009, loop: true }).duration).toBeLessThanOrEqual(MAX_PERIOD);
  });

  it("накладка додається: спільна доріжка — сума, решта — ключі повторено на весь період", () => {
    const anim = layerAnims(base, overlay);
    const rig = new Rig(ISO_CAT_RIG);
    const plain = new Rig(ISO_CAT_RIG);
    const over = new Rig(ISO_CAT_RIG);
    rig.play(anim as never, 0, { blend: 0 });
    plain.play(base as never, 0, { blend: 0 });
    over.play(overlay as never, 0, { blend: 0 });
    for (const t of [0, 150, 300, 450, 700, 900, 1150]) {
      rig.evaluate(t);
      plain.evaluate(t);
      over.evaluate(t);
      // Хвіст — сума обох (ключі обох — на кроках вибірки, тож точно); голова — лише з основної, тулуб — лише з накладки.
      expect(rig.slot("tail").rot).toBeCloseTo(plain.slot("tail").rot + over.slot("tail").rot, 3);
      expect(rig.slot("head").rot).toBeCloseTo(plain.slot("head").rot, 6);
      expect(rig.slot("body").y).toBeCloseTo(over.slot("body").y, 6);
      expect(rig.slot("eyes").state).toBe("open");
    }
    expect(animProblems(ISO_CAT_RIG as unknown as LooseRig, anim)).toEqual([]);
  });

  it("обличчя: стани очей і рота — сталими доріжками, якщо в анімації своїх немає; вуха — поворотом кісток", () => {
    const anim = withFace({ duration: 500, loop: true }, { eyes: "half", mouth: "tongue", ears: "flat" });
    const rig = new Rig(ISO_CAT_RIG, { fit: ISO_CAT_FIT, lookup: artEntry });
    const still = new Rig(ISO_CAT_RIG, { fit: ISO_CAT_FIT, lookup: artEntry }).evaluate(0);
    rig.play(anim as never, 0, { blend: 0 });
    rig.evaluate(100);
    expect(rig.slot("eyes").state).toBe("half");
    expect(rig.slot("mouth").state).toBe("tongue");
    expect(rig.slot("ear-near").rot).toBeCloseTo(still.slot("ear-near").rot + EAR_POSES.flat.front["ear-near"].rot, 6);
    // Чхання має свої очі — обличчя їх не перекриває.
    const sneeze = withFace({ duration: 800, loop: false, slots: { eyes: { frame: [{ t: 0, v: "closed" }] } } }, { eyes: "open", mouth: "closed", ears: "up" });
    rig.play(sneeze as never, 200, { blend: 0 });
    rig.evaluate(300);
    expect(rig.slot("eyes").state).toBe("closed");
  });

  it("кожна анімація кота з кожною накладкою й обличчям — правильна для скелета гри; та сама трійка — той самий об'єкт", () => {
    const loose = ISO_CAT_RIG as unknown as LooseRig;
    for (const id of CAT_ANIM_IDS) {
      for (const over of [null, ...CAT_OVERLAYS]) {
        const anim = composeCatAnim(CAT_ANIMS[id], over ? CAT_ANIMS[over] : null, { eyes: "squint", mouth: "closed", ears: "back" });
        expect(animProblems(loose, anim, `${id}+${over}`)).toEqual([]);
        if (over && !(id in CAT_ONE_SHOT_MS) && !(over in CAT_ONE_SHOT_MS)) expect(anim.loop).toBe(CAT_ANIMS[id].loop && CAT_ANIMS[over].loop);
      }
    }
    const face = { eyes: "open", mouth: "closed", ears: "up" } as const;
    expect(composeCatAnim(CAT_ANIMS.sit, CAT_ANIMS.content, face)).toBe(composeCatAnim(CAT_ANIMS.sit, CAT_ANIMS.content, { ...face }));
    expect(composeCatAnim(CAT_ANIMS.sit, null, face)).not.toBe(composeCatAnim(CAT_ANIMS.sit, null, { ...face, eyes: "half" }));
  });

  it("нове обличчя не складає основну з накладкою заново: доріжки тіла — ті самі масиви", () => {
    const a = composeCatAnim(base, overlay, { eyes: "open", mouth: "closed", ears: "up" });
    const b = composeCatAnim(base, overlay, { eyes: "closed", mouth: "meow", ears: "flat" });
    expect(a).not.toBe(b);
    expect(b.views?.front?.bones?.tail?.rot).toBe(a.views?.front?.bones?.tail?.rot);
    expect(b.views?.back?.bones?.body?.pos).toBe(a.views?.back?.bones?.body?.pos);
  });

  it("накладка почуттів — підігнана під основу (`catOverlayOn`, N3): та сама пара — те саме, що шар із підігнаною", () => {
    const face = { eyes: "open", mouth: "closed", ears: "up" } as const;
    for (const id of ["belly", "carried", "sit", "loaf"] as const) {
      for (const over of CAT_OVERLAYS) {
        const fitted = catOverlayOn(CAT_ANIMS[over], CAT_ANIMS[id]) as unknown as LooseAnim;
        expect(composeCatAnim(CAT_ANIMS[id], CAT_ANIMS[over], face)).toEqual(withFace(layerAnims(CAT_ANIMS[id], fitted), face));
      }
    }
  });

  it("«попереджає» на спині («Пастка на животику»): хвіст б'є над підлогою, а не крізь неї", () => {
    const anim = composeCatAnim(CAT_ANIMS.belly, CAT_ANIMS.warn, { eyes: "squint", mouth: "closed", ears: "back" });
    for (const view of ART_VIEWS) {
      let lowest = -Infinity;
      for (let t = 0; t < anim.duration; t += 20) {
        const rig = new Rig(ISO_CAT_RIG, { fit: ISO_CAT_FIT, lookup: artEntry, facing: { view } });
        rig.play(anim as never, 0, { blend: 0, from: t });
        rig.evaluate(0);
        const tail = rig.bone("tail");
        lowest = Math.max(lowest, tail.world.b * tail.len + tail.world.ty);
      }
      expect({ view, above: lowest < 0 }).toEqual({ view, above: true });
    }
  });
});

describe("змішування поз при зміні анімації (`playBlend`)", () => {
  const sit = { base: CAT_ANIMS.sit, overlay: null, ears: "up" } as const;

  it("інша основна — зі змішуванням; на спину й зі спини (`catBlendMs`, N1) — одним кадром, бо посередині кіт сплющився б і зник", () => {
    expect(playBlend(sit, { ...sit, base: CAT_ANIMS.loaf })).toBe(BLEND_MS);
    expect(playBlend(null, sit)).toBe(BLEND_MS);
    expect(playBlend(sit, { ...sit, base: CAT_ANIMS.belly })).toBe(0);
    expect(playBlend({ ...sit, base: CAT_ANIMS.roll }, sit)).toBe(0);
    expect(playBlend({ ...sit, base: CAT_ANIMS.belly }, { ...sit, base: CAT_ANIMS.roll })).toBe(BLEND_MS);
  });

  it("та сама основна й накладка: лише вуха — коротке змішування, решта обличчя — без", () => {
    expect(playBlend(sit, sit)).toBe(0);
    expect(playBlend(sit, { ...sit, ears: "back" })).toBe(BLEND_MS);
    expect(playBlend(sit, { ...sit, overlay: CAT_ANIMS.content })).toBe(BLEND_MS);
  });
});

describe("де кіт (`catSpot`)", () => {
  it("на підлозі — у своїй точці, з тінню; на меблях — на висоті їхнього верху, на їхній коробці", () => {
    const save = game();
    const cat = withCat(save, { x: 9.5, y: 8.5 });
    expect(catSpot(save.current, cat, "sit", null, SPOT)).toMatchObject({ kind: "floor", at: { x: 9.5, y: 8.5 }, lift: 0, box: null, shadow: true, show: "rig" });
    const sofa = objectById("sofa");
    cat.x = sofa.x + 0.5;
    cat.y = sofa.y + 0.5;
    expect(catSpot(save.current, cat, "sleep", null, SPOT)).toMatchObject({ kind: "furniture", lift: isoObjectLook("sofa").perch, box: "sofa", show: "rig" });
    const fridge = objectById("fridge");
    cat.x = fridge.x + 0.5;
    cat.y = fridge.y + 0.5;
    cat.act = act("hide");
    // Нагорі ховаються, лежачи на холодильнику (`catPose` — буханець), а не під ним.
    expect(catSpot(save.current, cat, "loaf", null, SPOT)).toMatchObject({ kind: "furniture", lift: 150, box: "fridge" });
  });

  it("під меблями — з-під ближчого краю видно очі й кінчик хвоста; у будиночку — очі у вході", () => {
    const save = game();
    const bed = objectById("bed");
    const cat = withCat(save, { x: bed.x + 0.5, y: bed.y + 1.2 });
    cat.act = act("hide", { target: "bed" });
    // Схований — буханець (`catPose`), якого не видно (`hidesUnder`): з-під краю — лише очі.
    expect(catPose(save.current, cat)).toBe("loaf");
    const under = catSpot(save.current, cat, "loaf", null, SPOT);
    expect(under).toMatchObject({ kind: "under", show: "eyes", lift: 0, box: "bed" });
    // Той самий буханець без схованки (утомився на ліжку) — на ліжку, на виду.
    cat.act = act("idle");
    expect(catSpot(save.current, cat, "loaf", null, SPOT)).toMatchObject({ kind: "furniture", box: "bed", show: "rig" });
    cat.act = act("hide", { target: "bed" });
    expect(under.at.x === bed.x + bed.w || under.at.y === bed.y + bed.h).toBe(true);
    save.current.home.items.push({ id: 900, kind: "house", quality: "premium", slot: "house-1" });
    cat.x = 1.5;
    cat.y = 9.5;
    cat.act = act("sleep", { target: "item:900" });
    expect(catSpot(save.current, cat, "sleep", null, SPOT)).toMatchObject({ kind: "house", show: "eyes", above: { id: "item:900" }, offset: artOffset("item/house/premium", "door") });
    // Ще йде до будиночка — на підлозі.
    cat.act = act("sleep", { target: "item:900", goal: { x: 1, y: 9 } });
    expect(catSpot(save.current, cat, "walk", null, SPOT).kind).toBe("floor");
  });

  it("переноска, барабан пральки, ковдра, робот — у точках їхніх кадрів, менший клубочок там, де тісно", () => {
    const save = game();
    const cat = withCat(save, { x: 8.5, y: 9.5 });
    save.current.home.carrier = "cheap";
    cat.act = act("sleep", { target: "carrier" });
    expect(catSpot(save.current, cat, "carrier", null, SPOT)).toMatchObject({
      kind: "carrier",
      at: CARRIER_SPOT,
      above: { id: "carrier" },
      scale: SPOT_SCALE.carrier,
      offset: artOffset("item/carrier/cheap", "inside"),
      show: "rig",
    });
    const washer = objectById("washer");
    cat.x = washer.x + 0.5;
    cat.y = washer.y + 0.5;
    cat.act = act("sleep", { target: "washer" });
    expect(catSpot(save.current, cat, "sleep", null, SPOT)).toMatchObject({ kind: "drum", at: footprintCenter(washer), box: "washer", scale: SPOT_SCALE.drum, offset: artOffset("env/washer", "drum") });
    const bed = objectById("bed");
    cat.x = bed.x + 0.5;
    cat.y = bed.y + 0.5;
    cat.act = act("sleep", { target: "bed", blanket: true });
    // Під ковдрою — скелет (анімація `blanket` лишає видимими вушка й кінчик хвоста), вушка — на гребені горбика.
    expect(catSpot(save.current, cat, "blanket", null, SPOT)).toMatchObject({ kind: "blanket", show: "rig", box: "bed", offset: blanketOffset(cat) });
    save.current.home.appliances.robot = "premium";
    cat.x = 12.5;
    cat.y = 7.5;
    cat.act = act("idle", { target: "robot", elapsed: 5 });
    expect(catSpot(save.current, cat, "sit", null, SPOT)).toMatchObject({ kind: "robot", above: { id: "robot" }, offset: artOffset("item/robot/premium", "top") });
    // Ще біжить до робота — на підлозі.
    cat.act = act("idle", { target: "robot", elapsed: 0, goal: { x: 13, y: 7 } });
    expect(catSpot(save.current, cat, "walk", null, SPOT).kind).toBe("floor");
  });

  it("на руках і на колінах — у персонажа; у поїздці — не видно; у парі — зсунутий", () => {
    const save = game();
    const cat = withCat(save, { x: 9.5, y: 8.5 });
    save.current.character.held = { kind: "cat", cat: cat.id };
    expect(catSpot(save.current, cat, "carried", null, SPOT).kind).toBe("hands");
    save.current.character.held = null;
    cat.act = act("lap");
    expect(catSpot(save.current, cat, "sleep", null, SPOT).kind).toBe("hands");
    cat.act = idleAct(10);
    cat.away = "trip";
    expect(catSpot(save.current, cat, "sit", null, SPOT)).toMatchObject({ kind: "away", show: "none" });
    cat.away = null;
    const pair = { kind: "groom" as const, with: 1, offset: { x: -15, y: 0 }, tile: { x: -0.1171875, y: 0.1171875 }, facing: null };
    expect(catSpot(save.current, cat, "sit", pair, SPOT).at).toEqual({ x: 9.5 + pair.tile.x, y: 8.5 + pair.tile.y });
  });

  it("їсть чи п'є з миски — сидить за нею: точка раніше за миску, корінь вище; з автогодівницею позаду — збоку; дорогою сідає плавно", () => {
    const save = game();
    const home = save.current.home;
    home.items = home.items.filter((i) => !("slot" in i) || (i.slot !== "bowl-1" && i.slot !== "water-1"));
    home.items.push({ id: 801, kind: "bowl", quality: "cheap", slot: "bowl-1", food: 3, foodQuality: "cheap" } as HomeItem);
    home.items.push({ id: 802, kind: "water", quality: "cheap", slot: "water-1" } as HomeItem);
    const bowl = slotCenter("bowl-1");
    const cat = withCat(save, bowl);
    for (const a of [act("eat", { target: "item:801" }), act("bury", { target: "item:801" }), act("steal", { target: "item:801" }), act("idle", { target: "sniff:801" })]) {
      cat.act = a;
      const spot = catSpot(save.current, cat, "eat", null, SPOT);
      expect(spot).toMatchObject({ kind: "floor", shadow: true, show: "rig" });
      expect(spot.at.x).toBeCloseTo(bowl.x - BOWL_BEHIND, 9);
      expect(spot.at.y).toBeCloseTo(bowl.y - BOWL_BEHIND, 9);
      // Порядок — кіт раніше за миску (вона закриває його лапи, а не він — корм); на екрані — вище за її pivot.
      const order = isoOrder([], [{ x: bowl.x, y: bowl.y, half: 24 }, { ...spot.at, half: isoCatHalf(cat) }]);
      expect([...order]).toEqual([1, 0]);
      expect(ISO.toScreen(spot.at).y).toBeLessThan(ISO.toScreen(bowl).y - 15);
      expect(ISO.toScreen(spot.at).x).toBeCloseTo(ISO.toScreen(bowl).x, 6);
    }
    // Вода — так само.
    const water = slotCenter("water-1");
    cat.x = water.x;
    cat.y = water.y;
    cat.act = act("drink", { target: "item:802" });
    expect(catSpot(save.current, cat, "drink", null, SPOT).at.y).toBeCloseTo(water.y - BOWL_BEHIND, 9);
    // Позаду миски автогодівниця — кіт збоку, з того боку, звідки дивиться на миску; у порядку — раніше за миску й пізніше
    // за годівницю.
    cat.x = bowl.x;
    cat.y = bowl.y;
    cat.act = act("eat", { target: "item:801" });
    home.feeders = [{ slot: "bowl-1", quality: "cheap" } as unknown as Feeder];
    for (const facing of [1, -1]) {
      cat.facing = facing;
      const side = catSpot(save.current, cat, "eat", null, SPOT).at;
      const dx = ISO.toScreen(side).x - ISO.toScreen(bowl).x;
      expect(Math.sign(dx)).toBe(-facing);
      expect(Math.abs(dx)).toBeGreaterThan(30);
      expect(side.x + side.y).toBeLessThan(bowl.x + bowl.y);
      expect(side.x + side.y).toBeGreaterThan(bowl.x + bowl.y - 0.6);
    }
    home.feeders = [];
    // Іде до миски: далеко — у своїй точці, ближче — уже трохи за нею.
    cat.act = act("eat", { target: "item:801", goal: { x: 17, y: 3 } });
    cat.x = bowl.x + 1.5;
    expect(catSpot(save.current, cat, "walk", null, SPOT).at).toEqual({ x: cat.x, y: cat.y });
    cat.x = bowl.x + BOWL_APPROACH / 2;
    const near = catSpot(save.current, cat, "walk", null, SPOT).at;
    expect(near.x).toBeCloseTo(cat.x - BOWL_BEHIND / 2, 9);
    expect(bowlSeat({ x: 0, y: 0 }, { x: 0, y: 0 }, false, true, true)).toEqual({ x: -BOWL_BEHIND, y: -BOWL_BEHIND });
    // Інша ціль (лоток, іграшка) — не миска.
    cat.act = act("toilet", { target: "item:801" });
    expect(bowlOf(save.current, cat)).toBeNull();
  });

  it("у переносці весь кіт — під ґратками: тінь і тулуб нижче за їхню глибину за будь-якої глибини переноски", () => {
    const save = game();
    const cat = withCat(save, { x: 8.5, y: 9.5 });
    save.current.home.carrier = "premium";
    cat.act = act("sleep", { target: "carrier" });
    const offset = catSpot(save.current, cat, "carrier", null, SPOT).above!.offset;
    expect(offset).toBe(underGrate(SPOT.grate));
    for (let i = 0; i < 2000; i++) {
      const depth = 1 + i * 0.4123 + (i % 7) * 1e-3;
      const grate = depth + SPOT.grate;
      expect(depth + offset + CAT_PIECE.body).toBeLessThan(grate);
      expect(depth + offset + CAT_PIECE.shadow).toBeLessThan(grate);
      expect(depth + offset + CAT_PIECE.shadow).toBeGreaterThan(depth);
    }
  });

  it("у ящиках біля входу — у верхній коробці, нижче за борт, без тіні (вона лягла б на передню стінку)", () => {
    const save = game();
    save.current.home.boxes = { food: { cheap: 4, premium: 0 } };
    const boxes = objectById("boxes");
    const cat = withCat(save, { x: boxes.x + 0.5, y: boxes.y + 0.5 });
    cat.act = act("sleep", { target: "boxes" });
    const look = isoObjectLook("boxes");
    expect(look.perch).toBeLessThan(look.top);
    expect(catSpot(save.current, cat, "sleep", null, SPOT)).toMatchObject({ kind: "furniture", box: "boxes", lift: look.perch, shadow: false });
    // На інших меблях — з тінню.
    const sofa = objectById("sofa");
    cat.x = sofa.x + 0.5;
    cat.y = sofa.y + 0.5;
    expect(catSpot(save.current, cat, "sleep", null, SPOT)).toMatchObject({ kind: "furniture", shadow: true });
  });

  it("на справжньому дні: кожен кіт удома має місце, і на меблях — на висоті їхнього верху", () => {
    const save = game();
    for (let i = 0; i < 6; i++) withCat(save, { x: 3.5 + i * 2, y: 8.5 }, i);
    for (let step = 0; step < 40; step++) {
      advance(save, 6, { move: { x: 0, y: 0 }, hold: false });
      for (const cat of save.current.cats) {
        const spot = catSpot(save.current, cat, "sit", null, SPOT);
        expect(spot.kind === "away").toBe(cat.away !== null);
        if (spot.kind === "furniture") expect(spot.lift).toBe(isoObjectLook(spot.box!).perch);
      }
    }
  });
});

describe("що грає кіт цього кадру (`catPlay`)", () => {
  const choice = { anim: "walk", overlay: "content" } as const;
  const face = { eyes: "open", mouth: "closed", ears: "up" } as const;

  it("без разової — поза й накладка з `catAnim`, обличчя з `catFace`", () => {
    expect(catPlay(choice, face, null, 0)).toEqual({ play: { anim: "walk", overlay: "content", restart: false, face }, shot: null });
  });

  it("разова тіла замінює позу, накладка — накладку; перший кадр — з початку; минула — забута", () => {
    const itch = startShot("itch", { eyes: "squint" }, CAT_ONE_SHOT_MS.itch, 1000)!;
    const first = catPlay(choice, face, itch, 1000);
    expect(first.play).toEqual({ anim: "itch", overlay: "content", restart: true, face: { ...face, eyes: "squint" } });
    expect(catPlay(choice, face, first.shot, 1500).play.restart).toBe(false);
    expect(catPlay(choice, face, first.shot, 1000 + CAT_ONE_SHOT_MS.itch)).toEqual({ play: { anim: "walk", overlay: "content", restart: false, face }, shot: null });
    const sneeze = catPlay(choice, face, startShot("sneeze", null, CAT_ONE_SHOT_MS.sneeze, 0), 10).play;
    expect(sneeze).toMatchObject({ anim: "walk", overlay: "sneeze", restart: true });
    // Лише вираз — поза та сама, нічого не починається заново.
    const meow = catPlay(choice, face, startShot(null, { mouth: "meow" }, 500, 0), 10).play;
    expect(meow).toEqual({ anim: "walk", overlay: "content", restart: false, face: { ...face, mouth: "meow" } });
    expect(startShot("hiss", null, 0, 0)).toBeNull();
  });

  it("тінь у стрибку не злітає з котом: поки кіт не долетів — на нижчій поверхні, далі — там, куди стрибає", () => {
    const up: Lift = { from: 0, to: 62, start: 1000 };
    expect(groundAt(up, 1000)).toBe(0);
    expect(groundAt(up, 1000 + JUMP.ms * 0.4)).toBe(0);
    expect(groundAt(up, 1000 + JUMP.ms * 0.9)).toBe(62);
    expect(groundAt(up, 1000 + JUMP.ms)).toBe(62);
    const down: Lift = { from: 62, to: 0, start: 0 };
    for (const t of [0, JUMP.ms * 0.3, JUMP.ms * 0.7, JUMP.ms * 2]) expect(groundAt(down, t)).toBe(0);
    // Тінь ніколи не вища за кота.
    for (let t = 1000; t <= 1000 + JUMP.ms; t += 10) expect(groundAt(up, t)).toBeLessThanOrEqual(liftAt(up, t) + 1e-9);
  });

  it("стрибок на меблі й з них — за ходом стрибка N1 (`catJumpLift`): до поштовху на місці, далі між висотами й нагорі", () => {
    let lift = nextLift(null, 0, true, 0);
    expect(lift.now).toBe(0);
    lift = nextLift(lift.lift, 62, true, 100);
    expect(lift.now).toBe(0);
    for (let t = 0; t <= JUMP.ms; t += 5) {
      expect(liftAt(lift.lift, 100 + t)).toBeCloseTo(62 * catJumpLift("jumpUp", t), 9);
      expect(liftAt(lift.lift, 100 + t)).toBeLessThanOrEqual(62 + 1e-9);
    }
    // Поки кіт збирається (анімація до поштовху), він ще на підлозі; після приземлення — нагорі.
    expect(liftAt(lift.lift, 150)).toBe(0);
    expect(liftAt(lift.lift, 100 + 250)).toBe(62);
    expect(nextLift(lift.lift, 62, true, 100 + JUMP.ms).now).toBe(62);
    // Униз — за `jumpDown`: повільно відривається від краю й розганяється донизу.
    const down: Lift = { from: 62, to: 0, start: 0 };
    for (let t = 0; t <= JUMP.ms; t += 5) expect(liftAt(down, t)).toBeCloseTo(62 * (1 - catJumpLift("jumpDown", t)), 9);
    expect(nextLift(lift.lift, 0, false, 200).now).toBe(0);
  });
});

describe("темп лап ходи й бігу (`gaitRate`)", () => {
  /** Клітинка вздовж осі x на екрані (2:1). */
  const TILE = { x: ISO.toScreen({ x: 1, y: 0 }).x - ISO.toScreen({ x: 0, y: 0 }).x, y: ISO.toScreen({ x: 1, y: 0 }).y - ISO.toScreen({ x: 0, y: 0 }).y };

  it("швидкість на екрані: уздовж осі клітинок — горизонтальна складова, прямовисно — вертикальна", () => {
    expect(TILE).toEqual({ x: 64, y: 32 });
    expect(gaitSpeed(TILE.x, TILE.y, 0.5)).toBe(128);
    expect(gaitSpeed(-TILE.x, TILE.y, 0.5)).toBe(128);
    expect(gaitSpeed(0, 64, 0.5)).toBe(128);
    expect(gaitSpeed(10, 0, 0)).toBe(0);
  });

  it("згладжена швидкість: перший кадр — стоїть, далі доходить до швидкості кота; переставленого кота не рахує", () => {
    let mem = nextGait(null, 0, 0, 1 / 60);
    expect(mem.speed).toBe(0);
    for (let i = 1; i <= 60; i++) mem = nextGait(mem, (200 * i) / 60, 0, 1 / 60);
    expect(mem.speed).toBeCloseTo(200, 1);
    const same = nextGait(mem, mem.x + GAIT_TELEPORT + 1, 0, 1 / 60);
    expect(same).toBe(mem);
    expect(same.speed).toBeCloseTo(200, 1);
    // Пауза (кадр без часу) темпу не міняє.
    expect(nextGait(mem, mem.x, 0, 0).speed).toBeCloseTo(200, 1);
  });

  it("ходять у такт усі ходи (кульгає, незграбна, сумна, несе в зубах), біг — своїм темпом; решта — 1", () => {
    expect(gaitRate("walk", 200, 0, false, 1)).toBe(catWalkRate(200, catLegLength()));
    for (const id of ["limp", "clumsy", "sadWalk", "carry"] as const) expect(gaitRate(id, 200, 0, false, 1)).toBe(gaitRate("walk", 200, 0, false, 1));
    expect(gaitRate("run", 600, 0, false, 1)).toBe(catRunRate(600, catLegLength()));
    expect(gaitRate("sit", 600, 0, false, 1)).toBe(1);
    expect(gaitRate("jumpUp", 600, 0, false, 1)).toBe(1);
    expect(gaitRate("walk", 0, 0, false, 1)).toBe(0);
    // Довші лапи (більша порода) — повільніший темп, коротші (манчкін, кошеня) — швидший.
    expect(gaitRate("walk", 150, 0, false, 1.12)).toBeLessThan(gaitRate("walk", 150, 0, false, 1));
    expect(gaitRate("walk", 150, 0, true, 1)).toBeGreaterThan(gaitRate("walk", 150, 0, false, 1));
    expect(gaitRate("walk", 60, 1, false, 0.65)).toBeGreaterThan(gaitRate("walk", 60, 0, false, 1));
  });

  /**
   * Кіт іде праворуч зі швидкістю `speed` (одиниці арту за секунду на екрані) з темпом `gaitRate`; скелет гри з масштабом
   * спрайта `scale`, пропорціями й лапами кота. Кожні 5 мс — подушечка кожної лапи у світі (корінь іде з котом). Повертає
   * медіану того, на скільки за крок зсувається відносно підлоги подушечка, що стоїть (не вище за 0,4 одиниці від свого
   * місця у вихідній позі), — частку зсуву кота: 0 — лапа стоїть, 1 — їде разом із котом.
   */
  function slip(anim: "walk" | "run" | "carry", speed: number, kitten: number, shortLegs: boolean, scale: number): number {
    const rate = gaitRate(anim, speed, kitten, shortLegs, scale);
    const proportions = [...(shortLegs ? ["short-legs"] : []), ...(kitten > 0 ? [{ name: "kitten", weight: kitten }] : [])];
    const skin = isoCatSkin({ muzzle: "normal", ears: "normal", tail: "long", build: "normal", legs: shortLegs ? "short" : "normal" }, false);
    const make = (): Rig<string, string, string> => new Rig(ISO_CAT_RIG, { fit: ISO_CAT_FIT, lookup: artEntry, proportions, skin }) as never;
    // Подушечка — у точці `paw` кадру лапи: коротка лапа манчкіна на стільки коротша за кістку, на скільки опущено таз.
    const reach = (rig: Rig<string, string, string>, leg: string): number => rig.bone(leg).len - (shortLegs ? (CAT_RIG.proportions?.["short-legs"]?.pelvis?.y ?? 0) : 0);
    const paw = (rig: Rig<string, string, string>, leg: string): { x: number; y: number } => {
      const w = rig.bone(leg).world;
      const len = reach(rig, leg);
      return { x: (w.a * len + w.tx) * scale, y: (w.b * len + w.ty) * scale };
    };
    const legs = ["leg-front-near", "leg-front-far", "leg-back-near", "leg-back-far"];
    const rest = make().evaluate(0);
    const floor = legs.map((leg) => paw(rest, leg).y);
    const rig = make();
    rig.play(CAT_ANIMS[anim] as never, 0, { blend: 0 });
    const STEP = 5;
    const slips: number[] = [];
    let prev: { x: number; y: number }[] | null = null;
    for (let t = 0; t <= 3000; t += STEP) {
      rig.evaluate(t * rate);
      const root = (speed * t) / 1000;
      const now = legs.map((leg) => {
        const p = paw(rig, leg);
        return { x: p.x + root, y: p.y };
      });
      if (prev) {
        for (let i = 0; i < legs.length; i++) {
          if (Math.abs(now[i]!.y - floor[i]!) > 0.4 * scale || Math.abs(prev[i]!.y - floor[i]!) > 0.4 * scale) continue;
          slips.push((now[i]!.x - prev[i]!.x) / ((speed * STEP) / 1000));
        }
      }
      prev = now;
    }
    expect(slips.length).toBeGreaterThan(100);
    return Math.abs(slips.sort((a, b) => a - b)[Math.floor(slips.length / 2)]!);
  }

  it("подушечка, що стоїть, нерухома відносно підлоги: дорослий, більша порода, манчкін, кошеня — хода й біг", () => {
    // Сим веде кота 2,5 клітинки за ігрову хвилину (0,75 с): уздовж осі клітинок горизонтальна складова — 64 на клітинку.
    const walk = (2.5 / 0.75) * TILE.x;
    for (const [kitten, short, scale] of [
      [0, false, 1],
      [0, false, 1.12],
      [0, true, 1],
    ] as const) {
      for (const anim of ["walk", "carry"] as const) expect(slip(anim, walk * 0.8, kitten, short, scale), `${anim} ${short} ${scale}`).toBeLessThan(0.05);
      expect(slip("run", walk * 1.6, kitten, short, scale), `run ${short} ${scale}`).toBeLessThan(0.08);
    }
    // Кошеня (передні коротші за задні, `catLegLength` — середня): ковзає не більше ніж на ≈ 6 %, як каже N1.
    expect(slip("walk", walk * 0.3, 1, false, 0.65)).toBeLessThan(0.1);
    // А з темпом за `walkFactor` (1 — за будь-якої швидкості кота) лапа їхала б.
    const fixed = gaitRate("walk", walk * 0.8, 0, false, 1);
    expect(Math.abs(fixed - 1)).toBeGreaterThan(0.1);
  });
});

describe("точки кота для інших частин (`bonePoint`)", () => {
  it("точка на кістці — у системі кореня: та сама, що якір скелета на тій кістці", () => {
    for (const view of ART_VIEWS) {
      const rig = new Rig(ISO_CAT_RIG, { facing: { view } });
      rig.play(CAT_ANIMS.walk as never, 0, { blend: 0 });
      rig.evaluate(120);
      const anchor = ISO_CAT_RIG.anchors.head!;
      const p = bonePoint(rig, anchor.bone, { x: anchor.x, y: anchor.y }, { x: 0, y: 0 });
      const a = rig.anchor("head", { x: 0, y: 0 }, false)!;
      expect(p.x).toBeCloseTo(a.x, 9);
      expect(p.y).toBeCloseTo(a.y, 9);
    }
  });

  it("на спині (`belly`, `roll`) рука лягає на живіт (`catPetPoint`, N1) — над котом, а не на спинку, що на підлозі", () => {
    for (const anim of ["belly", "roll"] as const) {
      const point = catPetPoint(anim)!;
      expect(point).not.toBeNull();
      for (const view of ART_VIEWS) {
        for (let t = 0; t < CAT_ANIMS[anim].duration; t += 100) {
          const rig = new Rig(ISO_CAT_RIG, { fit: ISO_CAT_FIT, lookup: artEntry, facing: { view } });
          rig.play(CAT_ANIMS[anim] as never, 0, { blend: 0 });
          rig.evaluate(t);
          const belly = bonePoint(rig, "body", point, { x: 0, y: 0 });
          const back = rig.socket("pet", undefined, false)!;
          expect(belly.y, `${anim} ${view} ${t}`).toBeLessThan(back.y - 8);
          expect(belly.y, `${anim} ${view} ${t}`).toBeLessThan(-8);
        }
      }
    }
    expect(catPetPoint("sit")).toBeNull();
  });

  it("бабл над клубком бійки (`catBrawlTop`, N2) — над кулею весь цикл, у кошеняти нижче (масштаб кореня), без підскоку", () => {
    expect(brawlTop(0, { x: 0, y: 0 })).toEqual(catBrawlTop());
    const kid = brawlTop(1, { x: 0, y: 0 });
    expect(kid.y).toBeCloseTo(catBrawlTop().y * (CAT_RIG.proportions?.kitten?.root?.scale?.y ?? 1), 9);
    for (const [kitten, proportions] of [
      [0, []],
      [1, [{ name: "kitten", weight: 1 }]],
    ] as const) {
      const top = brawlTop(kitten, { x: 0, y: 0 });
      for (const view of ART_VIEWS) {
        const rig = new Rig(ISO_CAT_RIG, { fit: ISO_CAT_FIT, lookup: artEntry, facing: { view }, proportions: [...proportions] });
        rig.play(CAT_ANIMS.brawl as never, 0, { blend: 0 });
        for (let t = 0; t < CAT_ANIMS.brawl.duration; t += 50) {
          rig.evaluate(t);
          // Тулуб-куля (pivot кадру) і схована голова — нижче за бабл.
          expect(rig.slot("body").y, `${kitten} ${view} ${t}`).toBeGreaterThan(top.y + 20 * (kitten ? 0.62 : 1));
          expect(rig.anchor("head", { x: 0, y: 0 }, false)!.y).toBeGreaterThan(top.y);
        }
      }
    }
  });
});

describe("кіт під ковдрою (`blanketOffset`, анімація `blanket`)", () => {
  /**
   * Верхній край горбика ковдри (`art/env/bed.svg`, стан `st-hump`, заливка горбика) від точки `blanket` ліжка: кінцеві точки
   * кривих верхнього контуру зліва направо, [dx, висота над ковдрою].
   */
  function humpProfile(): [number, number][] {
    const svg = readFileSync(new URL("../art/env/bed.svg", import.meta.url), "utf8");
    const group = svg.slice(svg.indexOf('class="st-hump"'));
    const d = [...group.matchAll(/<path d="([^"]+)"/g)][1]![1]!;
    const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const at = artOffset("env/bed", "blanket")!;
    const pivot = artEntry("env/bed")!.pivot;
    const bx = pivot.x + at.x;
    const by = pivot.y + at.y;
    const out: [number, number][] = [[nums[0]! - bx, by - nums[1]!]];
    // M x y, далі Q cx cy x y: кінцеві точки — кожна друга пара; верхній контур — доки x росте.
    for (let i = 4; i + 1 < nums.length; i += 4) {
      const x = nums[i]! - bx;
      if (x <= out[out.length - 1]![0]) break;
      out.push([x, by - nums[i + 1]!]);
    }
    return out;
  }
  const HUMP = humpProfile();
  const humpAt = (dx: number): number => {
    for (let i = 1; i < HUMP.length; i++) {
      const [x0, y0] = HUMP[i - 1]!;
      const [x1, y1] = HUMP[i]!;
      if (dx >= x0 && dx <= x1) return y0 + ((y1 - y0) * (dx - x0)) / (x1 - x0);
    }
    return 0;
  };

  /** Вушка й корінь хвоста кота під ковдрою: наскільки нижче за край горбика (від'ємне — висить над ним), одиниці арту. */
  function below(build: "slim" | "normal" | "stocky", legs: "normal" | "short", ageWeeks: number): { ears: number[]; tail: number } {
    const shape = { muzzle: "normal", ears: "normal", tail: "long", build, legs, coat: null } as const;
    const cat = { ageWeeks, traits: [], breed: ["mixed", "mixed"], shape } as unknown as Cat;
    const size = catSize(cat);
    const rig = new Rig(ISO_CAT_RIG, { fit: ISO_CAT_FIT, lookup: artEntry, skin: isoCatSkin(shape, false), proportions: isoCatProportions(cat, size) });
    rig.play(CAT_ANIMS.blanket as never, 0, { blend: 0 });
    rig.evaluate(0);
    const offset = blanketOffset(cat);
    const at = artOffset("env/bed", "blanket")!;
    const depth = (slot: "ear-near" | "ear-far" | "tail"): number => {
      const p = rig.slot(slot);
      const dx = offset.x - at.x + p.x * size.scale;
      const dy = offset.y - at.y + p.y * size.scale;
      return dy + humpAt(dx);
    };
    return { ears: [depth("ear-near"), depth("ear-far")], tail: depth("tail") };
  }

  it("горбик з арту — купол ≈ 25 над ковдрою, гребінь трохи праворуч від точки `blanket`", () => {
    const top = Math.max(...HUMP.map(([, h]) => h));
    expect(top).toBeGreaterThan(22);
    expect(top).toBeLessThan(28);
    expect(humpAt(BLANKET_EARS.x)).toBeGreaterThan(top - 2);
  });

  it("вушка ростуть із гребеня горбика (основи — на його контурі), а не висять над ним: будь-яка статура, короткі лапи, кошеня", () => {
    for (const build of ["slim", "normal", "stocky"] as const) {
      for (const legs of ["normal", "short"] as const) {
        for (const age of [40, 1, 2]) {
          for (const ear of below(build, legs, age).ears) {
            expect(ear, `${build} ${legs} ${age}`).toBeGreaterThan(0);
            expect(ear, `${build} ${legs} ${age}`).toBeLessThan(3.5);
          }
        }
      }
    }
  });

  it("корінь хвоста дорослого — на лівому схилі горбика (кінчик стирчить з-під ковдри збоку), не висить над ним", () => {
    for (const build of ["slim", "normal", "stocky"] as const) {
      const tail = below(build, "normal", 40).tail;
      expect(tail, build).toBeGreaterThan(-2.5);
      expect(tail, build).toBeLessThan(4.5);
    }
  });

  it("під ковдрою кіт завжди головою праворуч, до подушки (горбик так намальовано)", () => {
    const save = game();
    const bed = objectById("bed");
    const cat = withCat(save, { x: bed.x + 0.5, y: bed.y + 0.6 });
    for (const side of [1, -1] as const) {
      cat.facing = side;
      cat.act = act("sleep", { target: "bed", blanket: true, minutes: 300 });
      expect(catFacing(save.current, cat, null)).toEqual({ view: "front", flip: false });
    }
  });
});

describe("живіт вагітної (слот `belly`, `withBelly`)", () => {
  const face = { eyes: "closed", mouth: "closed", ears: "up" } as const;
  const shape = { muzzle: "normal", ears: "normal", tail: "long", build: "normal", legs: "normal" } as const;
  /** Скелет гри вагітної кішки, що грає складену анімацію `id` (без накладки), у момент `t`. */
  function pregnant(id: keyof typeof CAT_ANIMS, view: (typeof ART_VIEWS)[number], t = 0): Rig<string, string, string> {
    const rig = new Rig(ISO_CAT_RIG, { fit: ISO_CAT_FIT, lookup: artEntry, skin: isoCatSkin(shape, true), facing: { view } }) as unknown as Rig<string, string, string>;
    rig.play(composeCatAnim(CAT_ANIMS[id], null, face) as never, 0, { blend: 0 });
    rig.evaluate(t);
    return rig;
  }

  it("лежить над тулубом і під ближніми лапами (як задумав A8b), а хвіст клубка й буханця обгортає його спереду", () => {
    for (const view of ART_VIEWS) {
      for (const id of ["sit", "walk", "loaf", "sleep", "carried", "belly"] as const) {
        const rig = pregnant(id, view);
        const belly = rig.slot("belly");
        expect(belly.visible, `${id} ${view}`).toBe(true);
        expect(belly.z, `${id} ${view}`).toBeGreaterThan(rig.slot("body").z);
        for (const leg of ["leg-front-near", "leg-back-near"]) {
          const z = rig.slot(leg).z;
          if (z > rig.slot("body").z) expect(belly.z, `${id} ${view} ${leg}`).toBeLessThan(z);
        }
      }
      // Клубок і буханець: хвіст спереду поверх тулуба — і поверх живота.
      for (const id of ["sleep", "loaf"] as const) {
        const rig = pregnant(id, view);
        if (rig.slot("tail").z > rig.slot("body").z) expect(rig.slot("tail").z, `${id} ${view}`).toBeGreaterThan(rig.slot("belly").z);
      }
    }
  });

  it("анімація ховає тулуб (ковдра) — ховається й живіт; змінює z тулуба — живіт іде за ним; інші анімації — ті самі об'єкти", () => {
    for (const view of ART_VIEWS) {
      const rig = pregnant("blanket", view, 1000);
      expect(rig.slot("body").visible).toBe(false);
      expect(rig.slot("belly").visible).toBe(false);
    }
    const anim: LooseAnim = { duration: 400, loop: true, slots: { body: { z: [{ t: 0, v: 3 }, { t: 200, v: 9 }] } } };
    const rig = new Rig(ISO_CAT_RIG, { fit: ISO_CAT_FIT, lookup: artEntry, skin: isoCatSkin(shape, true) });
    rig.play(withBelly(anim) as never, 0, { blend: 0 });
    for (const t of [100, 300]) {
      rig.evaluate(t);
      expect(rig.slot("belly").z).toBeCloseTo(rig.slot("body").z + BELLY_ABOVE, 9);
    }
    for (const id of ["sit", "walk", "sleep", "brawl"] as const) expect(withBelly(CAT_ANIMS[id] as unknown as LooseAnim)).toBe(CAT_ANIMS[id]);
    expect(BELLY_ABOVE).toBeGreaterThan(0);
    expect(BELLY_ABOVE).toBeLessThan(0.5);
  });
});

describe("рендерер (`catrender.ts`)", () => {
  it("одна текстура на пакет — лише на програмному WebGL", () => {
    expect(isSoftwareRenderer("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)")).toBe(true);
    expect(isSoftwareRenderer("llvmpipe (LLVM 15.0.7, 256 bits)")).toBe(true);
    expect(isSoftwareRenderer("ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe(false);
    expect(isSoftwareRenderer("Adreno (TM) 640")).toBe(false);
    expect(isSoftwareRenderer(null)).toBe(false);
    expect(catRenderConfig(() => "SwiftShader")).toEqual({ maxTextures: 1 });
    expect(catRenderConfig(() => "Apple GPU")).toBeNull();
    expect(catRenderConfig(() => null)).toBeNull();
  });
});
