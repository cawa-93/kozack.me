// Коти ізометричного вигляду (крок 16, T1, `src/view/iso/cat*.ts`): скелет кота в грі (вуха, обхват, живіт), розмір
// кошеняти й повнота, складання анімацій (основна + накладка + обличчя), де кіт (меблі, схованки, барабан, переноска,
// ковдра, робот, руки) і налаштування рендерера. Усе без Phaser.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createCat, idleAct } from "../src/sim/cat";
import { catOnComputer } from "../src/sim/catai";
import { WEIGHT } from "../src/sim/config";
import { advance, newGame } from "../src/sim/game";
import { CARRIER_SPOT, isWall, objectAt, objectById, slotCenter, TRINKETS } from "../src/sim/home";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { gameMinutes } from "../src/sim/time";
import type { Cat, CatAct, Feeder, HomeItem, Save, Vec } from "../src/sim/types";
import { CAT_EARS } from "../src/view/anim/catface";
import { catFacing } from "../src/view/anim/catfacing";
import { CAT_ANIM_IDS, CAT_ONE_SHOT_MS, CAT_OVERLAYS, PERSON_ONE_SHOT_MS } from "../src/view/anim/ids";
import { artEntry } from "../src/view/art/manifest";
import { ART_VIEWS } from "../src/view/art/types";
import { CAT_ANIMS } from "../src/view/rig/anims";
import { catOverlayOn } from "../src/view/rig/anims/cat/feelings";
import { CAT_FIT, CAT_RIG } from "../src/view/rig/defs/cat";
import { animProblems, BLEND_MS, fitProblems, Rig, rigProblems } from "../src/view/rig/rigcore";
import type { RigAnim, RigDef } from "../src/view/rig/types";
import { composeCatAnim, layerAnims, layeredTiming, MAX_PERIOD, playBlend, withBelly, withFace } from "../src/view/iso/catanim";
import { CATCH, catchUp, catJump, catPlay, catStep, crowdShift, GAIT_TELEPORT, gaitRate, gaitSpeed, groundAt, JUMP, liftAt, nextGait, nextLift, putDownGround, seatCatchUp, startShot, stillPutDown, type Lift, type PlaceMemory } from "../src/view/iso/catplay";
import { liftedRoot, liftWeights } from "../src/view/iso/personlook";
import { catJumpLift, catLegLength, catPetPoint, catRunRate, catWalkRate } from "../src/view/rig/anims/cat/basic";
import { catBrawlTop } from "../src/view/rig/anims/cat/behavior";
import { catRenderConfig, isSoftwareRenderer } from "../src/view/iso/catrender";
import { BELLY_ABOVE, bonePoint, brawlTop, CAT_HALF_WIDTH, catSize, EAR_BONES, EAR_POSES, fatWeight, ISO_CAT_FIT, ISO_CAT_RIG, isoCatHalf, isoCatProportions, isoCatSkin, KITTEN_SIZE } from "../src/view/iso/catrig";
import {
  BESIDE,
  BESIDE_KEYBOARD,
  besideSide,
  BLANKET_EARS,
  blanketOffset,
  BOWL_APPROACH,
  BOWL_BEHIND,
  bowlOf,
  bowlSeat,
  CAT_PIECE,
  catSpot,
  type CatSpot,
  deskSeat,
  IN_LITTER,
  LAP_SEAT,
  lapSeat,
  LITTER_SEAT,
  perchPlace,
  SOFA_HIDE,
  SPOT_SCALE,
  underGrate,
} from "../src/view/iso/catspot";
import { isoScreenDir } from "../src/view/anim/iso";
import { catPairs, PERCH, perchCrowds, perchMemory, type PerchMember } from "../src/view/anim/pairs";
import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { IsoDepth } from "../src/view/iso/depth";
import { artOffset, footprintCenter, objectScreen } from "../src/view/iso/geometry";
import { shapedStage } from "../src/view/iso/looks";
import { catAnim, catPose } from "../src/view/pose";
import { isoOrder, objectBox } from "../src/view/world/isoorder";
import { ISO_KEYBOARD, isoObjectLook } from "../src/view/world/objects";
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

/** Стіл із комп'ютером і висота стільниці — на ній клавіатура (`ISO_KEYBOARD`). */
const DESK = objectById("computer");
const DESK_TOP = isoObjectLook("computer").perch ?? 0;
/** Межі вздовж стола, між якими кіт уже на клавіатурі (`BESIDE_KEYBOARD`). */
const BESIDE_LEFT = ISO_KEYBOARD.frame.x0 - BESIDE_KEYBOARD;
const BESIDE_RIGHT = ISO_KEYBOARD.frame.x1 + BESIDE_KEYBOARD;

/** Корінь кота на столі на екрані (без дуги стрибка): точка стільниці під лапами, px світу. */
function deskRoot(at: Vec): Vec {
  const s = ISO.toScreen(at);
  return { x: s.x, y: s.y - DESK_TOP };
}

/** Чи точка екрана — на намальованій клавіатурі: у її рамці (`ISO_KEYBOARD.frame`) на стільниці — паралелограмі на екрані. */
function onKeyboard(p: Vec): boolean {
  const { x0, y0, x1, y1 } = ISO_KEYBOARD.frame;
  const corners = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ].map(deskRoot);
  let side = 0;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i]!;
    const b = corners[(i + 1) % corners.length]!;
    const cross = Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
    if (cross === 0) continue;
    if (side === 0) side = cross;
    else if (cross !== side) return false;
  }
  return true;
}

const inDesk = (p: Vec): boolean => p.x >= DESK.x && p.x <= DESK.x + DESK.w && p.y >= DESK.y && p.y <= DESK.y + DESK.h;

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
      // «Літачком» (попереджає, дуга) — помітно нижчі за просто притиснуті (терпить) і розведені ширше за «у боки».
      for (const ear of EAR_BONES) expect(EAR_POSES.back[view][ear].scale).toBeLessThanOrEqual(EAR_POSES.flat[view][ear].scale - 0.15);
      expect(EAR_POSES.back[view][right!].rot).toBeGreaterThan(EAR_POSES.side[view][right!].rot);
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
    expect(layeredTiming(base, overlay)).toEqual({ duration: 1200, loop: true, stretch: 1 });
    expect(layeredTiming(base, { duration: 700, loop: false })).toEqual({ duration: 700, loop: false, stretch: 1 });
    expect(layeredTiming({ duration: 380, loop: false }, overlay)).toEqual({ duration: 380, loop: false, stretch: 1 });
    expect(layeredTiming({ duration: 997, loop: true }, { duration: 1009, loop: true }).duration).toBeLessThanOrEqual(MAX_PERIOD);
  });

  it("спільне кратне задовге — основна в своєму темпі, а накладка трохи швидша чи повільніша: ціле число її циклів у періоді", () => {
    // «Пручається» (900 мс) на позі, що сидить (3200): спільне кратне — 28 800, а так — чотири ривки по 800 мс за цикл пози.
    const sit = layeredTiming({ duration: 3200, loop: true }, { duration: 900, loop: true });
    expect(sit.duration % 3200).toBe(0);
    expect(sit.duration).toBeLessThanOrEqual(MAX_PERIOD);
    const copies = sit.duration / (900 * sit.stretch);
    expect(Math.abs(copies - Math.round(copies))).toBeLessThan(1e-9);
    expect(Math.abs(sit.stretch - 1)).toBeLessThan(0.12);
    // Основна довша за межу — період дорівнює їй; основна коротка (хода) — кілька її циклів.
    expect(layeredTiming({ duration: 7000, loop: true }, { duration: 900, loop: true }).duration).toBe(7000);
    const walk = layeredTiming({ duration: 340, loop: true }, { duration: 2950, loop: true });
    expect(walk.duration % 340).toBe(0);
    expect(Math.abs(walk.stretch - 1)).toBeLessThan(0.05);
    // Спільне кратне в межі — без змін темпу.
    expect(layeredTiming({ duration: 3000, loop: true }, { duration: 1500, loop: true })).toEqual({ duration: 3000, loop: true, stretch: 1 });
  });

  it("складена анімація по колу — без стику: кінець періоду — та сама поза, що початок (кожна основа з кожною накладкою, обидва ракурси)", () => {
    const loops = CAT_ANIM_IDS.filter((id) => CAT_ANIMS[id].loop && !CAT_OVERLAYS.has(id));
    const overlays = [...CAT_OVERLAYS].filter((id) => CAT_ANIMS[id].loop);
    const face = { eyes: "open", mouth: "closed", ears: "up" } as const;
    for (const id of loops) {
      for (const over of overlays) {
        const anim = composeCatAnim(CAT_ANIMS[id], CAT_ANIMS[over], face);
        for (const view of ART_VIEWS) {
          const rig = new Rig(ISO_CAT_RIG, { facing: { view } });
          rig.play(anim as never, 0, { blend: 0 });
          rig.evaluate(0);
          const start = rig.slots.map((slot) => ({ x: slot.x, y: slot.y, rot: slot.rot }));
          rig.evaluate(anim.duration - 0.01);
          rig.slots.forEach((slot, i) => {
            const a = start[i]!;
            const where = `${id}+${over} ${view} ${slot.id}`;
            expect(Math.abs(slot.x - a.x), where).toBeLessThan(0.3);
            expect(Math.abs(slot.y - a.y), where).toBeLessThan(0.3);
            expect(Math.abs(((slot.rot - a.rot + 540) % 360) - 180), where).toBeLessThan(1.5);
          });
        }
      }
    }
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

  it("під диваном (спинкою до камери, між передньою стіною й шафою з пилососом) — очі з боку сидіння, над його краєм на екрані", () => {
    const save = game();
    const sofa = objectById("sofa");
    const cat = withCat(save, { x: sofa.x + 0.5, y: sofa.y + 0.5 });
    cat.act = act("hide");
    let last = -Infinity;
    for (let i = 0; i < sofa.w; i++) {
      cat.x = sofa.x + i + 0.5;
      const spot = catSpot(save.current, cat, "loaf", null, SPOT);
      // За коробкою дивана (край сидіння ховає щілину й низ очей), на лінії сидіння, у межах між ящиками й шафою.
      expect(spot).toMatchObject({ kind: "under", show: "eyes", box: "sofa", behind: true, at: { y: SOFA_HIDE.y } });
      expect(spot.at.x).toBeGreaterThanOrEqual(SOFA_HIDE.from);
      expect(spot.at.x).toBeLessThanOrEqual(SOFA_HIDE.to);
      // Хто правіше під диваном, той правіше й тут.
      expect(spot.at.x).toBeGreaterThan(last);
      last = spot.at.x;
      // Очі (на 7 над підлогою) — щонайменше на 8 вище за дальній край сидіння (верх 34) на екрані: край на тій самій
      // вертикалі екрана, що й очі, — у точці сидіння (x1, 10), де x1 − 10 = x − y.
      const edge = 64 * (sofa.y - spot.at.y) - isoObjectLook("sofa").top;
      expect(-7).toBeLessThan(edge - 8);
    }
  });

  it("схованка під ліжком і диваном — не в стіні й не в іншій речі; під ліжком — на ближньому краї, на коробці ліжка", () => {
    const save = game();
    for (const id of ["bed", "sofa"]) {
      const o = objectById(id);
      for (let x = o.x; x < o.x + o.w; x++) {
        for (let y = o.y; y < o.y + o.h; y++) {
          const cat = withCat(save, { x: x + 0.5, y: y + 0.5 });
          cat.act = act("hide");
          const spot = catSpot(save.current, cat, "loaf", null, SPOT);
          expect(spot.kind).toBe("under");
          const tx = Math.floor(spot.at.x);
          const ty = Math.floor(spot.at.y);
          expect(isWall(tx, ty)).toBe(false);
          const other = objectAt(save.current, tx, ty);
          expect(other === null || other.id === id).toBe(true);
          if (id === "bed") expect(spot.behind).toBe(false);
        }
      }
    }
  });

  it("у лотку — присідає на наповнювачі над лотком (у закритому — у відкритій частині); чистюля, що відмовився, нюхає збоку", () => {
    const save = game();
    const home = save.current.home;
    home.items = home.items.filter((i) => i.kind !== "litter");
    home.items.push({ id: 811, kind: "litter", quality: "cheap", slot: "litter-1", litter: "cheap", uses: 0 } as HomeItem);
    home.items.push({ id: 812, kind: "litter", quality: "premium", slot: "litter-2", litter: "cheap", uses: 0 } as HomeItem);
    const cheap = slotCenter("litter-1");
    const premium = slotCenter("litter-2");
    const cat = withCat(save, cheap);
    cat.act = act("toilet", { target: "item:811" });
    expect(catSpot(save.current, cat, "squat", null, SPOT)).toMatchObject({ kind: "litter", at: cheap, lift: LITTER_SEAT.lift, above: { id: "item:811", offset: IN_LITTER }, shadow: false });
    // Тулуб — нижче за хвилі запаху брудного лотка (`ON.fx` 0,003 у `floor.ts`), тож запах і над котом.
    expect(IN_LITTER + CAT_PIECE.body).toBeLessThan(0.003);
    cat.x = premium.x;
    cat.y = premium.y;
    cat.act = act("toilet", { target: "item:812" });
    expect(catSpot(save.current, cat, "squat", null, SPOT)).toMatchObject({ kind: "litter", at: { x: premium.x + LITTER_SEAT.premium, y: premium.y }, above: { id: "item:812" } });
    // Після туалету сим лишає кота в лотку (кричить від болю, §9.5, чи ще не пішов) — він і далі в лотку, а не за бортом.
    cat.act = act("idle");
    expect(catSpot(save.current, cat, "sit", null, SPOT)).toMatchObject({ kind: "litter", above: { id: "item:812" } });
    // Ще йде до лотка — на підлозі.
    cat.act = act("toilet", { target: "item:812", goal: { x: 9, y: 3 } });
    expect(catSpot(save.current, cat, "walk", null, SPOT).kind).toBe("floor");
    // Відмовився від брудного — стоїть збоку, ближче до камери, і дивиться на лоток.
    cat.act = act("toilet", { target: "item:812", refused: true });
    const sniff = catSpot(save.current, cat, "sniff", null, SPOT);
    expect(sniff).toMatchObject({ kind: "floor", shadow: true, faces: premium });
    const d = isoScreenDir({ x: sniff.at.x - premium.x, y: sniff.at.y - premium.y });
    expect(Math.abs(d.x)).toBeCloseTo(BESIDE.litter.along * 64, 6);
    expect(d.y).toBeGreaterThan(0);
  });

  it("дере кігтеточку — збоку від стовпчика, ближче до камери: у порядку малювання після неї, лапами до неї", () => {
    const save = game();
    const home = save.current.home;
    home.items.push({ id: 821, kind: "scratcher", quality: "premium", slot: "scratcher-3" } as HomeItem);
    const post = slotCenter("scratcher-3");
    const cat = withCat(save, post);
    cat.act = act("scratch", { target: "item:821" });
    for (const facing of [1, -1]) {
      cat.facing = facing;
      const spot = catSpot(save.current, cat, "scratch", null, SPOT);
      expect(spot).toMatchObject({ kind: "floor", faces: post });
      const d = isoScreenDir({ x: spot.at.x - post.x, y: spot.at.y - post.y });
      // Дивиться праворуч — стоїть ліворуч, і навпаки.
      expect(Math.sign(d.x)).toBe(-facing);
      expect(Math.abs(d.x)).toBeCloseTo(BESIDE.scratcher.along * 64, 6);
      const order = isoOrder([], [{ ...post, half: 38 }, { ...spot.at, half: isoCatHalf(cat) }]);
      expect([...order]).toEqual([0, 1]);
    }
    // Просто стоїть у точці кігтеточки — теж поруч із нею, а не за стовпчиком.
    cat.act = act("idle");
    expect(catSpot(save.current, cat, "sit", null, SPOT)).toMatchObject({ kind: "floor", faces: post });
    // Ще йде — далеко від кігтеточки у своїй точці.
    cat.act = act("scratch", { target: "item:821", goal: { x: 11, y: 9 } });
    cat.x = post.x + 1.5;
    expect(catSpot(save.current, cat, "walk", null, SPOT).at).toEqual({ x: cat.x, y: cat.y });
  });

  it("збоку від речі — з вільного боку: якщо там інша річ котячого кутка, то з другого", () => {
    const save = game();
    const home = save.current.home;
    home.items = home.items.filter((i) => i.kind !== "litter");
    const left = { id: 831, kind: "litter", quality: "cheap", slot: "litter-5", litter: "cheap", uses: 0 } as HomeItem;
    const right = { id: 832, kind: "litter", quality: "cheap", slot: "litter-6", litter: null, uses: 0 } as HomeItem;
    home.items.push(right);
    // Нікого поруч — з боку, звідки дивиться.
    expect(besideSide(save.current, right, true, BESIDE.litter.along, BESIDE.litter.front)).toBe(-1);
    expect(besideSide(save.current, right, false, BESIDE.litter.along, BESIDE.litter.front)).toBe(1);
    // Ліворуч на екрані (−x) — сусідній лоток (1, 6): стати праворуч.
    home.items.push(left);
    expect(besideSide(save.current, right, true, BESIDE.litter.along, BESIDE.litter.front)).toBe(1);
  });

  it("на мішку наповнювача — на висоті його форми: над порожнім зіжмаканим мішком кіт не висить (хвиля 3)", () => {
    const save = game();
    const home = save.current.home;
    if (!home.acquired.includes("litter")) home.acquired.push("litter");
    const bag = objectById("litter-bag");
    const cat = withCat(save, { x: bag.x + 0.5, y: bag.y + 0.5 });
    cat.act = act("sleep");
    const look = isoObjectLook("litter-bag");
    home.supplies.litter = { cheap: 0, premium: 0 };
    expect(catSpot(save.current, cat, "sleep", null, SPOT)).toMatchObject({ kind: "furniture", box: "litter-bag", lift: look.perchFull![0] });
    home.supplies.litter = { cheap: 100, premium: 0 };
    expect(catSpot(save.current, cat, "sleep", null, SPOT)).toMatchObject({ kind: "furniture", lift: look.perchFull![4] });
  });

  it("на справжньому дні: кожен кіт удома має місце, і на меблях — на висоті їхнього верху", () => {
    const save = game();
    for (let i = 0; i < 6; i++) withCat(save, { x: 3.5 + i * 2, y: 8.5 }, i);
    for (let step = 0; step < 40; step++) {
      advance(save, 6, { move: { x: 0, y: 0 }, hold: false });
      for (const cat of save.current.cats) {
        const spot = catSpot(save.current, cat, "sit", null, SPOT);
        expect(spot.kind === "away").toBe(cat.away !== null);
        if (spot.kind !== "furniture") continue;
        // На мішку наповнювача й баку стерильного корму — за наповненням (`perchFull`, хвиля 3).
        const look = isoObjectLook(spot.box!);
        const stage = shapedStage(save.current, spot.box!);
        expect(spot.lift).toBe(stage !== null && look.perchFull ? look.perchFull[stage] : look.perch);
      }
    }
  });
});

describe("кіт на колінах того, хто сидить спиною до камери (`lapSeat`)", () => {
  const seat = (back: boolean, flip: boolean, order: number, scale = 1) => lapSeat(back, flip, order, scale, { x: 0, y: 0, front: false });

  it("за комп'ютером (спиною до нас) кіт не в силуеті персонажа: перший — збоку, ближчому до камери, і поверх персонажа", () => {
    // Дивиться праворуч угору — ближчий до нас правий бік, праворуч на екрані; ліворуч угору — навпаки.
    const right = seat(true, false, 0);
    expect(right).toEqual({ x: LAP_SEAT.near, y: LAP_SEAT.drop, front: true });
    expect(seat(true, true, 0)).toEqual({ x: -LAP_SEAT.near, y: LAP_SEAT.drop, front: true });
    // Пів ширини кота-клубка (≈ 25) за краєм гнізда й нижче: тулуб персонажа не закриває кота.
    expect(Math.abs(right.x)).toBeGreaterThanOrEqual(30);
    // Кошеня — ближче, за своїм розміром.
    expect(seat(true, false, 0, 0.5).x).toBeCloseTo(LAP_SEAT.near * 0.5, 6);
  });

  it("другий кіт на колінах — з другого боку, за тулубом, а не в тій самій точці; третій — далі від першого", () => {
    const first = seat(true, false, 0);
    const second = seat(true, false, 1);
    expect(Math.sign(second.x)).toBe(-Math.sign(first.x));
    expect(second.front).toBe(false);
    expect(Math.abs(second.x - first.x)).toBeGreaterThan(60);
    const third = seat(true, false, 2);
    expect(third.front).toBe(true);
    expect(third.x).toBeGreaterThan(first.x);
    expect(seat(true, false, 3).x).toBeLessThan(second.x);
  });

  it("обличчям до камери — у самому гнізді колін і поверх персонажа (там кота й так видно)", () => {
    expect(seat(false, false, 0)).toEqual({ x: 0, y: 0, front: true });
    expect(seat(false, true, 1)).toEqual({ x: 0, y: 0, front: true });
  });

  it("на колінах — місце `hands`, як і на руках: частина котів ставить кота від гнізда персонажа", () => {
    const save = game();
    const cat = withCat(save, { x: 7, y: 7.65 });
    cat.act = act("lap", { target: "character", minutes: 240 });
    expect(catSpot(save.current, cat, "sleep", null, SPOT).kind).toBe("hands");
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

describe("кіт біля миски дивиться на неї (`CatSpot.faces`)", () => {
  it("дійшов до миски — `faces` у її точці (збоку — лицем до неї); ще йде — як каже `catFacing`", () => {
    const save = game();
    const bowl = save.current.home.items.find((i) => i.kind === "bowl")!;
    const p = slotCenter(bowl.slot);
    const cat = withCat(save, p);
    cat.act = act("eat", { target: `item:${bowl.id}` });
    expect(catSpot(save.current, cat, "eat", null, SPOT).faces).toEqual(p);
    cat.act = act("eat", { target: `item:${bowl.id}`, goal: { x: Math.floor(p.x), y: Math.floor(p.y) } });
    expect(catSpot(save.current, cat, "walk", null, SPOT).faces).toBeNull();
  });
});

describe("кіт, якого опустили, — там, де його поставили руки (`putDownGround`, `stillPutDown`)", () => {
  it("увесь `putDown` корінь кота — під кистями (не далі за 0,1 клітинки), а після «відпустив» не ковзає до точки сима", () => {
    // Кисті праворуч від персонажа (ракурс front), а сим поставив кота на 0,6 клітинки попереду — просто під персонажем.
    const gripAt = { x: 640, y: 660 };
    const pet = { x: 6, y: -32 };
    const hands = { x: 660, y: 600 };
    const sim = { x: 600, y: 700 };
    const own = putDownGround(gripAt, pet, { x: 0, y: 0 });
    const root = { x: 0, y: 0 };
    const ground = { x: 0, y: 0 };
    const tile = Math.hypot(64, 32);
    for (let t = 0; t <= PERSON_ONE_SHOT_MS.putDown; t += 20) {
      const lift = liftWeights("putDown", t);
      liftedRoot(own, { ...lift, at: gripAt }, pet, hands, root, ground);
      // Кіт на підлозі (вага рук 0) — спинкою під кистями; у руках — дорогою з гнізда рук під кисті.
      if (lift.w === 0) expect(Math.hypot(root.x + pet.x - gripAt.x, root.y + pet.y - gripAt.y), `@${t}`).toBeLessThan(0.1 * tile);
      expect(ground, `@${t}`).toEqual({ x: gripAt.x - pet.x, y: gripAt.y - pet.y });
    }
    // Наприкінці — не там, де сим (той був би на ≈ 0,4 клітинки ліворуч від рук).
    expect(Math.hypot(ground.x - sim.x, ground.y - sim.y)).toBeGreaterThan(0.4 * tile);
  });

  it("лишається там, поки його беруть чи опускають, а потім — поки не рушив, сим його не переставив і персонаж не відійшов", () => {
    const put = { cat: { x: 6.42, y: 9.42 }, person: { x: 6, y: 9 } };
    expect(stillPutDown(null, put.cat, put.person, false, false)).toBe(false);
    expect(stillPutDown(put, { x: 6.42, y: 9.42 }, { x: 6, y: 9 }, false, false)).toBe(true);
    // Руки саме опускають — хоч би де сим його вже поставив.
    expect(stillPutDown(put, { x: 7, y: 9 }, { x: 6, y: 9 }, false, true)).toBe(true);
    expect(stillPutDown(put, { x: 6.42, y: 9.42 }, { x: 6, y: 9 }, true, false)).toBe(false);
    expect(stillPutDown(put, { x: 6.5, y: 9.42 }, { x: 6, y: 9 }, false, false)).toBe(false);
    expect(stillPutDown(put, { x: 6.42, y: 9.42 }, { x: 5.9, y: 9 }, false, false)).toBe(false);
  });
});

describe("переставлений кіт доганяє своє місце (`catchUp`)", () => {
  const FRAME = 1 / 60;
  /** Кадри по 1/60 с: сим веде кота `sim(i)` (клітинки), зсув пари — `pair(i)`; повертає, де кота намальовано. */
  function drawn(frames: number, sim: (i: number) => Vec, pair: (i: number) => Vec = () => ({ x: 0, y: 0 })): Vec[] {
    const lag = { x: 0, y: 0 };
    const out: Vec[] = [];
    const step = catStep(gameMinutes(FRAME));
    for (let i = 0; i < frames; i++) {
      const now = sim(i);
      const p = pair(i);
      if (i > 0) {
        const was = sim(i - 1);
        const pw = pair(i - 1);
        const jump = catJump({ x: now.x - was.x, y: now.y - was.y }, { x: p.x - pw.x, y: p.y - pw.y }, step, { x: 0, y: 0 });
        catchUp(lag, jump, FRAME);
      }
      out.push({ x: now.x + p.x + lag.x, y: now.y + p.y + lag.y });
    }
    return out;
  }
  const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);

  it("мисливець, якого сим одним кроком поставив упритул до утікача (1,45 клітинки), добігає туди, а не перескакує", () => {
    // Біжить 10 клітинок за секунду (зумі, 7,5 за ігрову хвилину), на 20-му кадрі сим ставить його на 1,45 клітинки далі й зупиняє.
    const run = CATCH.speed / gameMinutes(1) / 60;
    const sim = (i: number): Vec => ({ x: 5 + run * Math.min(i, 20) + (i >= 20 ? 1.45 : 0), y: 9.3 });
    const path = drawn(60, sim);
    const step = catStep(gameMinutes(FRAME));
    for (let i = 1; i < path.length; i++) {
      // За кадр — не далі, ніж найшвидший біг сима чи вигляду: жодного перескоку.
      expect(dist(path[i]!, path[i - 1]!), `кадр ${i}`).toBeLessThanOrEqual(Math.max(step, CATCH.fast * FRAME) + 1e-9);
    }
    // Кадр переставлення: намальований кіт ще далеко позаду — і біжить туди (`CATCH.run`), а не ковзає в позі.
    expect(dist(path[20]!, sim(20))).toBeGreaterThan(1);
    expect(dist(path[20]!, sim(20))).toBeGreaterThan(CATCH.run);
    // Доганяє за ≤ 300 мс: далі вже там, де його поставив сим.
    expect(dist(path[20 + 18]!, sim(20 + 18))).toBeLessThan(0.01);
    // Біг рівний: без переставлення намальований кіт там само, де кіт сима.
    for (let i = 0; i < 20; i++) expect(dist(path[i]!, sim(i))).toBeLessThan(1e-12);
  });

  it("зсув пари (гра-боротьба: ≈ 0,19 клітинки) вмикається плавно, за ≈ 150–250 мс; переставляння далі за 2 клітинки — одразу", () => {
    const shift = { x: 0.133, y: -0.133 };
    const path = drawn(30, () => ({ x: 9, y: 9 }), (i) => (i >= 5 ? shift : { x: 0, y: 0 }));
    const target = { x: 9 + shift.x, y: 9 + shift.y };
    const full = Math.hypot(shift.x, shift.y);
    // Зсув пари (і бійки, що зійшлася з 0,6 клітинки: по 0,3 кожному) — коротке ковзання без бігу.
    expect(Math.max(full, 0.3)).toBeLessThan(CATCH.run);
    // Кадр, коли пара ввімкнулася: кіт ще майже там, де був.
    expect(dist(path[5]!, { x: 9, y: 9 })).toBeLessThan(full * 0.2);
    // За 100 мс — понад половину шляху, за 250 мс — на місці.
    expect(dist(path[5 + 6]!, target)).toBeLessThan(full * 0.5);
    expect(dist(path[5 + 15]!, target)).toBeLessThan(1e-9);
    // З поїздки, з рук (далі за `CATCH.max`) — одразу там.
    const far = drawn(3, (i) => (i >= 1 ? { x: 12, y: 9 } : { x: 9, y: 9 }));
    expect(dist(far[1]!, { x: 12, y: 9 })).toBe(0);
  });

  it("крок кадру — за ігровими хвилинами (і швидкістю гри режиму розробки); без попередньої хвилини — будь-який", () => {
    expect(catStep(gameMinutes(FRAME))).toBeCloseTo(CATCH.speed * gameMinutes(FRAME) * CATCH.slack + CATCH.eps, 9);
    expect(catStep(gameMinutes(FRAME) * 4)).toBeGreaterThan(catStep(gameMinutes(FRAME)) * 3);
    expect(catStep(Number.NaN)).toBe(Number.POSITIVE_INFINITY);
    expect(catStep(-1)).toBe(Number.POSITIVE_INFINITY);
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

describe("коти на тій самій речі (`perchPlace`, `perchCrowds`)", () => {
  /** Як перший прохід `IsoCatsView`: місце кожного кота й зсуви юрби на речах — точка, де його намалюють. */
  function placed(save: Save, sizes: (cat: Cat) => number = () => 1): Map<number, { kind: string; at: Vec; key: string | null }> {
    const state = save.current;
    const pairs = catPairs(state, sizes);
    const members: PerchMember[] = [];
    const spots = new Map<number, { kind: string; at: Vec; key: string | null }>();
    for (const cat of state.cats) {
      if (cat.away !== null) continue;
      const pair = pairs.get(cat.id) ?? null;
      const spot = catSpot(state, cat, catAnim(state, cat).anim, pair, SPOT);
      const place = cat.act.goal === null ? perchPlace(spot) : null;
      if (place) members.push({ id: cat.id, key: place.key, at: spot.at, size: sizes(cat), area: place.area, partner: pair?.with ?? null });
      spots.set(cat.id, { kind: spot.kind, at: spot.at, key: place?.key ?? null });
    }
    const out = perchCrowds(members, new Map(), perchMemory());
    for (const [id, s] of spots) {
      const shift = out.get(id);
      if (shift) spots.set(id, { ...s, at: { x: s.at.x + shift.x, y: s.at.y + shift.y } });
    }
    return spots;
  }
  const screenGap = (a: Vec, b: Vec): number => {
    const d = isoScreenDir({ x: a.x - b.x, y: a.y - b.y });
    return Math.hypot(d.x, d.y);
  };

  it("сценарій «Техніка» (`appliances`): двоє кошенят сплять на ліжку — рядком уздовж ліжка, обидва на ньому", () => {
    const save = applyScenario(FILE_SCENARIOS["appliances"]!);
    const named = (name: string): Cat => save.current.cats.find((c) => c.name === name)!;
    const size = (cat: Cat): number => catSize(cat).relative;
    const spots = placed(save, size);
    const a = spots.get(named("Тигрик").id)!;
    const b = spots.get(named("Пиріжок").id)!;
    expect(a.kind).toBe("furniture");
    expect(a.key).toBe("bed");
    expect(b.key).toBe("bed");
    // У сима — в одній точці; на екрані — на крок кошенят один від одного, уздовж довгого боку ліжка (y).
    expect(named("Тигрик").x).toBe(named("Пиріжок").x);
    expect(screenGap(a.at, b.at)).toBeCloseTo(PERCH.step * size(named("Тигрик")), 6);
    expect(a.at.x).toBeCloseTo(b.at.x, 9);
    const f = isoObjectLook("bed").footprint;
    for (const p of [a.at, b.at]) expect(p.x >= f.x0 && p.x <= f.x1 && p.y >= f.y0 && p.y <= f.y1).toBe(true);
  });

  it("двоє в одному будиночку — дві пари очей поруч уздовж входу; двоє під тим самим краєм ліжка — так само", () => {
    const save = game();
    save.current.home.items.push({ id: 900, kind: "house", quality: "premium", slot: "house-1" });
    const a = withCat(save, { x: 1.5, y: 9.5 });
    const b = withCat(save, { x: 1.5, y: 9.5 });
    a.act = act("sleep", { target: "item:900", minutes: 300 });
    b.act = act("sleep", { target: "item:900", minutes: 300 });
    let spots = placed(save);
    expect(spots.get(a.id)!.kind).toBe("house");
    // Уздовж входу на грані +x: x той самий, y — на крок очей.
    expect(spots.get(a.id)!.at.x).toBeCloseTo(spots.get(b.id)!.at.x, 9);
    expect(screenGap(spots.get(a.id)!.at, spots.get(b.id)!.at)).toBeCloseTo(PERCH.eyes, 6);
    for (const cat of [a, b]) expect(Math.abs(spots.get(cat.id)!.at.y - 9.5)).toBeLessThanOrEqual(PERCH.door + 1e-9);
    // Ховаються під ліжком у тій самій клітинці: очі з-під того самого краю — поруч, на тому самому краї.
    for (const cat of [a, b]) {
      cat.x = 1.5;
      cat.y = 2.5;
      cat.act = act("hide", { minutes: 20 });
    }
    spots = placed(save);
    const ea = spots.get(a.id)!;
    const eb = spots.get(b.id)!;
    expect(ea.kind).toBe("under");
    expect(ea.key).toBe(eb.key);
    expect(ea.at.x).toBeCloseTo(eb.at.x, 9);
    expect(screenGap(ea.at, eb.at)).toBeCloseTo(PERCH.eyes, 6);
  });

  it("на столі з комп'ютером: на клавіатурі — лише той, хто заважає роботі; решта — поруч, рядком обабіч неї, не на ній", () => {
    const save = game();
    const pen = TRINKETS.find((t) => t.kind === "pen")!;
    // Двоє прийшли на клавіатуру (сим садить обох на ліву половину стола), третій обнюхує ручку, четвертий лежить праворуч.
    const first = withCat(save, { x: 6.5, y: 6.5 });
    const second = withCat(save, { x: 6.5, y: 6.5 });
    const sniff = withCat(save, pen.seat);
    const lying = withCat(save, { x: 7.5, y: 6.5 });
    first.act = act("keyboard", { target: "computer", minutes: 30 });
    second.act = act("keyboard", { target: "computer", minutes: 30 });
    sniff.act = act("knock", { target: "trinket:pen", minutes: 5 });
    lying.act = act("idle", { minutes: 60 });
    expect(catOnComputer(save.current)).toBe(first);
    let spots = placed(save);
    expect(spots.get(first.id)!.at).toEqual(ISO_KEYBOARD.seat);
    expect(onKeyboard(deskRoot(spots.get(first.id)!.at))).toBe(true);
    const beside = [second, sniff, lying];
    for (const cat of beside) {
      const s = spots.get(cat.id)!;
      expect(s.kind, cat.name).toBe("furniture");
      expect(onKeyboard(deskRoot(s.at)), cat.name).toBe(false);
      expect(s.at.x <= BESIDE_LEFT + 1e-9 || s.at.x >= BESIDE_RIGHT - 1e-9, cat.name).toBe(true);
      expect(inDesk(s.at), cat.name).toBe(true);
      expect(s.key, cat.name).not.toBe(spots.get(first.id)!.key);
    }
    // Двоє праворуч — рядком на своїй частині стола, а не одне в одному.
    expect(spots.get(sniff.id)!.key).toBe(spots.get(lying.id)!.key);
    expect(screenGap(spots.get(sniff.id)!.at, spots.get(lying.id)!.at)).toBeGreaterThan(PERCH.step * PERCH.squeeze - 1e-6);
    // Першу забрали з клавіатури — тепер роботі заважає друга, і на клавіатурі вже вона; решта — де були.
    first.x = 7;
    first.y = 7.6;
    first.act = act("idle", { minutes: 5 });
    expect(catOnComputer(save.current)).toBe(second);
    const before = spots;
    spots = placed(save);
    expect(spots.get(second.id)!.at).toEqual(ISO_KEYBOARD.seat);
    for (const cat of [sniff, lying]) expect(spots.get(cat.id)!.at).toEqual(before.get(cat.id)!.at);
  });
});

describe("стіл із комп'ютером: на клавіатурі — той, хто заважає роботі (`deskSeat`, §9.12 «Сон на комп'ютері» [Уточнено])", () => {
  it("корінь кота в точці клавіатури — на екрані там, де `keyboard` кадру стола, посеред намальованої клавіатури", () => {
    const root = deskRoot(ISO_KEYBOARD.seat);
    expect(onKeyboard(root)).toBe(true);
    const point = artOffset("env/computer", "keyboard")!;
    const at = objectScreen(DESK);
    // Маніфест округлює точки до 0,5 одиниці.
    expect(Math.abs(root.x - (at.x + point.x))).toBeLessThanOrEqual(0.5);
    expect(Math.abs(root.y - (at.y + point.y))).toBeLessThanOrEqual(0.5);
  });

  it("кіт на клавіатурі — у точці `keyboard`, хоч сим і садить його на ліву половину стола; ще йде — там, де йде", () => {
    const save = game();
    const cat = withCat(save, { x: DESK.x + 0.5, y: DESK.y + 0.5 });
    cat.act = act("keyboard", { target: "computer", minutes: 30 });
    expect(catOnComputer(save.current)).toBe(cat);
    const spot = catSpot(save.current, cat, "keyboard", null, SPOT);
    expect(spot).toMatchObject({ kind: "furniture", box: "computer", lift: DESK_TOP, at: ISO_KEYBOARD.seat, shadow: true, show: "rig" });
    expect(onKeyboard(deskRoot(spot.at))).toBe(true);
    // Розбуджений на правій половині (сідає на клавіатуру, `wakeOnComputer`) — так само на ній.
    cat.x = DESK.x + 1.5;
    expect(catSpot(save.current, cat, "keyboard", null, SPOT).at).toEqual(ISO_KEYBOARD.seat);
    // Ще йде до клавіатури — роботі ще не заважає (`catOnComputer`), і він там, куди дійшов.
    cat.x = DESK.x + 0.3;
    cat.y = DESK.y + 0.9;
    cat.act = act("keyboard", { target: "computer", minutes: 30, goal: { x: DESK.x, y: DESK.y } });
    expect(catOnComputer(save.current)).toBeNull();
    expect(catSpot(save.current, cat, "walk", null, SPOT).at).toEqual({ x: cat.x, y: cat.y });
  });

  it("сплячий на комп'ютері — на клавіатурі, на якій половині стола не ліг би; у парі — теж на ній", () => {
    const save = game();
    const cat = withCat(save, { x: DESK.x + 0.5, y: DESK.y + 0.5 });
    for (const x of [DESK.x + 0.5, DESK.x + 1.5]) {
      cat.x = x;
      cat.act = act("sleep", { minutes: 120 });
      expect(catOnComputer(save.current)).toBe(cat);
      const anim = catAnim(save.current, cat).anim;
      expect(catSpot(save.current, cat, anim, null, SPOT)).toMatchObject({ kind: "furniture", box: "computer", lift: DESK_TOP, at: ISO_KEYBOARD.seat });
    }
    // Сон поруч із другом (пара зсуває обох уздовж екрана) — той, хто заважає, усе одно на клавіатурі.
    const pair = { kind: "pile" as const, with: 99, offset: { x: 15, y: 0 }, tile: { x: 0.1171875, y: -0.1171875 }, facing: null };
    expect(catSpot(save.current, cat, "sleep", pair, SPOT).at).toEqual(ISO_KEYBOARD.seat);
  });

  it("кіт на столі, що роботі не заважає, — поза рамкою клавіатури: де б не стояв уздовж стола, поруч із нею", () => {
    const save = game();
    const pen = TRINKETS.find((t) => t.kind === "pen")!;
    const cat = withCat(save, pen.seat);
    // Обнюхує ручку (сим садить його ліворуч від неї, впритул до клавіатури): поруч із клавіатурою, але досі ліворуч від ручки.
    cat.act = act("knock", { target: "trinket:pen", minutes: 5 });
    expect(catOnComputer(save.current)).toBeNull();
    const knock = catSpot(save.current, cat, "knock", null, SPOT);
    expect(knock.at.x).toBeCloseTo(BESIDE_RIGHT, 9);
    expect(knock.at.y).toBe(pen.seat.y);
    expect(onKeyboard(deskRoot(knock.at))).toBe(false);
    expect(knock.at.x).toBeLessThan(DESK.x + pen.at * DESK.w);
    // Сидить на лівій половині (там, де сим садить кота на клавіатуру) — там і лишається: це вже поруч.
    cat.x = DESK.x + 0.5;
    cat.act = act("idle", { minutes: 30 });
    expect(catSpot(save.current, cat, "sit", null, SPOT).at.x).toBeCloseTo(DESK.x + 0.5, 9);
    // Будь-де вздовж стола й поперек — не на клавіатурі.
    for (let x = DESK.x + 0.05; x < DESK.x + DESK.w; x += 0.05) {
      for (const y of [DESK.y + 0.2, DESK.y + 0.5, DESK.y + 0.8]) {
        cat.x = x;
        cat.y = y;
        const at = catSpot(save.current, cat, "sit", null, SPOT).at;
        expect(onKeyboard(deskRoot(at)), `${x.toFixed(2)}, ${y}`).toBe(false);
        expect(at.x <= BESIDE_LEFT + 1e-9 || at.x >= BESIDE_RIGHT - 1e-9).toBe(true);
        expect(at.y).toBe(y);
      }
    }
    // Іде столом — там, де йде, хоч би й через клавіатуру.
    cat.x = DESK.x + 1;
    cat.y = DESK.y + 0.5;
    cat.act = act("idle", { minutes: 30, goal: { x: DESK.x + 1, y: DESK.y } });
    expect(catSpot(save.current, cat, "walk", null, SPOT).at).toEqual({ x: DESK.x + 1, y: DESK.y + 0.5 });
    expect(deskSeat(save.current, cat, { x: cat.x, y: cat.y })).toEqual({ x: cat.x, y: cat.y });
  });

  it("на клавіатурі — над столом і над змістом екрана монітора, під персонажем, що сидить за столом", () => {
    const registry = new IsoDepth();
    const depth = { desk: Number.NaN, screen: Number.NaN, cat: Number.NaN, person: Number.NaN };
    registry.addBox({ ...objectBox(DESK), id: DESK.id }, (d) => (depth.desk = d));
    // Зміст екрана — як у `marks.ts` (`ON_THING_DEPTH`): над кадром стола, у його проміжку глибини.
    registry.addPoint((d) => (depth.screen = d)).placeAbove(DESK.id, 0.0012);
    registry.addPoint((d) => (depth.cat = d)).place(ISO_KEYBOARD.seat.x, ISO_KEYBOARD.seat.y, DESK.id);
    const use = isoObjectLook(DESK.id).use!;
    registry.addPoint((d) => (depth.person = d), { id: "person" }).place(use.at.x, use.at.y);
    registry.solve();
    expect(depth.cat + CAT_PIECE.shadow).toBeGreaterThan(depth.screen);
    expect(depth.cat).toBeGreaterThan(depth.desk);
    expect(depth.person).toBeGreaterThan(depth.cat + CAT_PIECE.peek);
  });

  it("сценарії: «Кіт на клавіатурі» — Клавіша на клавіатурі, робота стоїть, Подушка поруч; «Кіт спить на комп'ютері» — на клавіатурі", () => {
    let save = applyScenario(FILE_SCENARIOS["keyboard-cat"]!);
    advance(save, 1);
    const named = (name: string): Cat => save.current.cats.find((c) => c.name === name)!;
    const spot = (cat: Cat): CatSpot => catSpot(save.current, cat, catAnim(save.current, cat).anim, null, SPOT);
    expect(save.current.character.activity).toBeNull();
    expect(catOnComputer(save.current)).toBe(named("Клавіша"));
    expect(spot(named("Клавіша")).at).toEqual(ISO_KEYBOARD.seat);
    const pillow = spot(named("Подушка"));
    expect(pillow).toMatchObject({ kind: "furniture", box: "computer" });
    expect(catAnim(save.current, named("Подушка")).anim).toBe("loaf");
    expect(onKeyboard(deskRoot(pillow.at))).toBe(false);
    expect(pillow.at.x).toBeGreaterThanOrEqual(BESIDE_RIGHT);
    // Забрали Клавішу — комп'ютер вільний: Подушка роботі не заважає.
    named("Клавіша").act = act("idle", { minutes: 5 });
    expect(catOnComputer(save.current)).toBeNull();
    save = applyScenario(FILE_SCENARIOS["computer-sleep"]!);
    advance(save, 1);
    expect(catOnComputer(save.current)).toBe(named("Грілка"));
    expect(spot(named("Грілка")).at).toEqual(ISO_KEYBOARD.seat);
  });

  it("троє прийшли на клавіатуру, перша зійшла — друга з рядка обабіч доходить саме на клавіатуру, а не тримає зсув рядка", () => {
    // Рецензія пакета: друга стояла в рядку ліворуч від клавіатури (зсув уздовж y), а ставши на клавіатуру, тримала його
    // (`crowdShift`, `hold`: сим її не рухав) — і сиділа позаду клавіатури, між нею й монітором.
    const FRAME = 1 / 60;
    const step = catStep(gameMinutes(FRAME));
    const save = game();
    const [first, second, third] = [0, 1, 2].map(() => withCat(save, { x: DESK.x + 0.5, y: DESK.y + 0.5 }));
    for (const cat of [first!, second!, third!]) cat.act = act("keyboard", { target: "computer", minutes: 30 });
    // Як `IsoCatsView` для котів на речах, що стоять: місце (`catSpot`), рядок (`perchCrowds`), доганяння нового місця
    // (`seatCatchUp`) і зсув юрби, що тримається, поки кіт не рушить (`crowdShift`, `hold`).
    const places = new Map<number, PlaceMemory>();
    const rows = perchMemory();
    let frames = 0;
    const frame = (): Map<number, Vec> => {
      const state = save.current;
      const spots = new Map<number, CatSpot>();
      const members: PerchMember[] = [];
      for (const cat of state.cats) {
        const spot = catSpot(state, cat, catAnim(state, cat).anim, null, SPOT);
        spots.set(cat.id, spot);
        const place = spot.kind === "furniture" && cat.act.goal === null ? perchPlace(spot) : null;
        if (place) members.push({ id: cat.id, key: place.key, at: spot.at, size: 1, area: place.area, partner: null });
      }
      const shifts = perchCrowds(members, new Map(), rows);
      const drawn = new Map<number, Vec>();
      for (const [id, spot] of spots) {
        if (spot.kind !== "furniture") continue;
        let mem = places.get(id);
        const first = mem === undefined;
        mem ??= { crowd: { x: 0, y: 0 }, catchUp: { x: 0, y: 0 }, seatWas: null };
        places.set(id, mem);
        const lag = first ? mem.catchUp : seatCatchUp(mem, spot.box!, spot.at, frames > 0 ? step : Number.POSITIVE_INFINITY, FRAME);
        const shift = crowdShift(mem, shifts.get(id) ?? null, true, FRAME, first);
        drawn.set(id, { x: spot.at.x + shift.x + lag.x, y: spot.at.y + shift.y + lag.y });
      }
      frames++;
      return drawn;
    };
    let drawn = frame();
    for (let i = 0; i < 30; i++) drawn = frame();
    expect(catOnComputer(save.current)).toBe(first);
    expect(onKeyboard(deskRoot(drawn.get(first!.id)!))).toBe(true);
    // Друга й третя — рядком ліворуч від клавіатури, уздовж стола поперек (y), не на ній.
    for (const cat of [second!, third!]) {
      expect(onKeyboard(deskRoot(drawn.get(cat.id)!)), cat.name).toBe(false);
      expect(Math.abs(drawn.get(cat.id)!.y - (DESK.y + 0.5)), cat.name).toBeGreaterThan(0.1);
    }
    // Першу забрали на руки: тепер роботі заважає друга — і за пів секунди вона саме на клавіатурі, у її точці.
    first!.x = 7;
    first!.y = 7.6;
    first!.act = act("idle", { minutes: 5 });
    expect(catOnComputer(save.current)).toBe(second);
    let was = drawn.get(second!.id)!;
    for (let i = 0; i < 30; i++) {
      drawn = frame();
      const now = drawn.get(second!.id)!;
      // Крок по стільниці, а не перескок.
      expect(Math.hypot(now.x - was.x, now.y - was.y), `кадр ${i}`).toBeLessThanOrEqual(Math.max(step, CATCH.fast * FRAME) + 1e-9);
      was = now;
    }
    expect(onKeyboard(deskRoot(was))).toBe(true);
    expect(was.x).toBeCloseTo(ISO_KEYBOARD.seat.x, 6);
    expect(was.y).toBeCloseTo(ISO_KEYBOARD.seat.y, 6);
    // Третя лишилася поруч, де лежала (сусідка пішла — місця не перебігають), не на клавіатурі.
    expect(onKeyboard(deskRoot(drawn.get(third!.id)!))).toBe(false);
    expect(drawn.get(third!.id)!.x).toBeLessThanOrEqual(BESIDE_LEFT + 1e-9);
  });
});
