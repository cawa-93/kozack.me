// Коти ізометричного вигляду (крок 16, T1, `src/view/iso/cat*.ts`): скелет кота в грі (вуха, обхват, живіт), розмір
// кошеняти й повнота, складання анімацій (основна + накладка + обличчя), де кіт (меблі, схованки, барабан, переноска,
// ковдра, робот, руки) і налаштування рендерера. Усе без Phaser.

import { describe, expect, it } from "vitest";

import { createCat, idleAct } from "../src/sim/cat";
import { WEIGHT } from "../src/sim/config";
import { advance, newGame } from "../src/sim/game";
import { CARRIER_SPOT, objectById } from "../src/sim/home";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Cat, CatAct, Save } from "../src/sim/types";
import { CAT_EARS } from "../src/view/anim/catface";
import { CAT_ANIM_IDS, CAT_ONE_SHOT_MS, CAT_OVERLAYS } from "../src/view/anim/ids";
import { artEntry } from "../src/view/art/manifest";
import { ART_VIEWS } from "../src/view/art/types";
import { CAT_ANIMS } from "../src/view/rig/anims";
import { CAT_FIT, CAT_RIG } from "../src/view/rig/defs/cat";
import { animProblems, fitProblems, Rig, rigProblems } from "../src/view/rig/rigcore";
import type { RigAnim, RigDef } from "../src/view/rig/types";
import { composeCatAnim, layerAnims, layeredTiming, MAX_PERIOD, withFace } from "../src/view/iso/catanim";
import { catPlay, JUMP, liftAt, nextLift, startShot } from "../src/view/iso/catplay";
import { catRenderConfig, isSoftwareRenderer } from "../src/view/iso/catrender";
import { catSize, EAR_BONES, EAR_POSES, fatWeight, ISO_CAT_FIT, ISO_CAT_RIG, isoCatProportions, isoCatSkin, KITTEN_SIZE } from "../src/view/iso/catrig";
import { CAT_PIECE, catSpot, SPOT_SCALE, underGrate } from "../src/view/iso/catspot";
import { artOffset, footprintCenter } from "../src/view/iso/geometry";
import { isoObjectLook } from "../src/view/world/objects";
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
    // Вуха — на своїх кістках (діти голови), тулуб і живіт — на обхваті; живіт — під тулубом.
    for (const ear of EAR_BONES) {
      expect(ISO_CAT_RIG.bones.find((b) => b.id === ear)?.parent).toBe("head");
      expect(ISO_CAT_RIG.slots.find((s) => s.id === ear)?.bone).toBe(ear);
    }
    const body = ISO_CAT_RIG.slots.find((s) => s.id === "body")!;
    const belly = ISO_CAT_RIG.slots.find((s) => s.id === "belly")!;
    expect(body.bone).toBe("girth");
    expect(belly.bone).toBe("girth");
    expect(belly.z).toBeLessThan(body.z);
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
    const under = catSpot(save.current, cat, "hide", null, SPOT);
    expect(under).toMatchObject({ kind: "under", show: "eyes", lift: 0, box: "bed" });
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
    expect(catSpot(save.current, cat, "blanket", null, SPOT)).toMatchObject({ kind: "blanket", show: "ears", box: "bed", offset: artOffset("env/bed", "blanket") });
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
  const choice = { anim: "walk", overlay: "content", speed: 0.6 } as const;
  const face = { eyes: "open", mouth: "closed", ears: "up" } as const;

  it("без разової — поза, накладка й швидкість з `catAnim`, обличчя з `catFace`", () => {
    expect(catPlay(choice, face, null, 0)).toEqual({ play: { anim: "walk", overlay: "content", speed: 0.6, restart: false, face }, shot: null });
  });

  it("разова тіла замінює позу (швидкість 1), накладка — накладку; перший кадр — з початку; минула — забута", () => {
    const itch = startShot("itch", { eyes: "squint" }, CAT_ONE_SHOT_MS.itch, 1000)!;
    const first = catPlay(choice, face, itch, 1000);
    expect(first.play).toEqual({ anim: "itch", overlay: "content", speed: 1, restart: true, face: { ...face, eyes: "squint" } });
    expect(catPlay(choice, face, first.shot, 1500).play.restart).toBe(false);
    expect(catPlay(choice, face, first.shot, 1000 + CAT_ONE_SHOT_MS.itch)).toEqual({ play: { anim: "walk", overlay: "content", speed: 0.6, restart: false, face }, shot: null });
    const sneeze = catPlay(choice, face, startShot("sneeze", null, CAT_ONE_SHOT_MS.sneeze, 0), 10).play;
    expect(sneeze).toMatchObject({ anim: "walk", overlay: "sneeze", speed: 0.6, restart: true });
    // Лише вираз — поза та сама, нічого не починається заново.
    const meow = catPlay(choice, face, startShot(null, { mouth: "meow" }, 500, 0), 10).play;
    expect(meow).toEqual({ anim: "walk", overlay: "content", speed: 0.6, restart: false, face: { ...face, mouth: "meow" } });
    expect(startShot("hiss", null, 0, 0)).toBeNull();
  });

  it("стрибок на меблі: висота йде дугою за час стрибка, на руки й у переноску — одразу", () => {
    let lift = nextLift(null, 0, true, 0);
    expect(lift.now).toBe(0);
    lift = nextLift(lift.lift, 62, true, 100);
    expect(lift.now).toBe(0);
    const middle = liftAt(lift.lift, 100 + JUMP.ms / 2);
    expect(middle).toBeGreaterThan(31);
    expect(middle).toBeLessThanOrEqual(31 + JUMP.arc + 1e-9);
    expect(liftAt(lift.lift, 100 + JUMP.ms)).toBe(62);
    expect(nextLift(lift.lift, 62, true, 100 + JUMP.ms).now).toBe(62);
    expect(nextLift(lift.lift, 0, false, 200).now).toBe(0);
  });
});

describe("рендерер (`catrender.ts`)", () => {
  it("одна текстура на пакет — лише в новій графіці на програмному WebGL", () => {
    expect(isSoftwareRenderer("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)")).toBe(true);
    expect(isSoftwareRenderer("llvmpipe (LLVM 15.0.7, 256 bits)")).toBe(true);
    expect(isSoftwareRenderer("ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe(false);
    expect(isSoftwareRenderer("Adreno (TM) 640")).toBe(false);
    expect(isSoftwareRenderer(null)).toBe(false);
    expect(catRenderConfig("iso", () => "SwiftShader")).toEqual({ maxTextures: 1 });
    expect(catRenderConfig("iso", () => "Apple GPU")).toBeNull();
    let asked = false;
    expect(
      catRenderConfig("legacy", () => {
        asked = true;
        return "SwiftShader";
      }),
    ).toBeNull();
    expect(asked).toBe(false);
  });
});
