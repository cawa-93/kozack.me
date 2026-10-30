// Скелети (крок 16, GRAPHICS_PLAN.md: «Скелети й анімації»): перевірка визначень, ключі й ease, цикл і разова анімація,
// віддзеркалення, порядок z, якорі й гнізда в позі, пропорції, точки арту й змішування поз. `rigcore.ts` — без Phaser, тож
// усе в Node.

import { describe, expect, it } from "vitest";

import type { ArtEntry, ArtId } from "../src/view/art/types";
import { CAT_FIT, CAT_RIG, CAT_VARIANTS, catProportions, catSkin } from "../src/view/rig/defs/cat";
import { PERSON_FIT, PERSON_RIG, PERSON_VARIANTS, personProportions, personSkin } from "../src/view/rig/defs/person";
import {
  animProblems,
  animTime,
  BLEND_MS,
  easeValue,
  entryPoint,
  fitProblems,
  Rig,
  rigProblems,
  sampleNumber,
  sampleStep,
  sampleVec,
  slotFrame,
  type ArtLookup,
} from "../src/view/rig/rigcore";
import { defineAnims, defineRig, type RigAnim, type RigDef } from "../src/view/rig/types";

type LooseRig = RigDef<string, string, string>;
type LooseAnim = RigAnim<string, string>;

/** Усі групи анімацій `src/view/rig/anims/<скелет>/<група>.ts`: скелет → [назва, анімація]. */
const ANIM_MODULES = import.meta.glob<Record<string, unknown>>("../src/view/rig/anims/*/*.ts", { eager: true });
function animsOf(rig: string): [string, LooseAnim][] {
  const list: [string, LooseAnim][] = [];
  for (const [file, module] of Object.entries(ANIM_MODULES)) {
    if (file.split("/").at(-2) !== rig) continue;
    for (const group of Object.values(module)) {
      if (typeof group !== "object" || group === null) continue;
      for (const [name, anim] of Object.entries(group)) list.push([`${file.split("/").at(-1)}/${name}`, anim as LooseAnim]);
    }
  }
  return list;
}

const near = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) <= eps;

/** Кінець кістки в системі кореня. */
function tip(rig: Rig<string, string, string>, id: string): { x: number; y: number } {
  const bone = rig.bone(id);
  const w = bone.world;
  return { x: w.a * bone.len + w.tx, y: w.b * bone.len + w.ty };
}

/** Простий скелет для перевірок: корінь, плече вгору, рука праворуч; гніздо на кінці руки. */
const ARM = defineRig({
  id: "arm",
  bones: [
    { id: "root", parent: null, x: 0, y: 0, rot: 0, len: 0 },
    { id: "body", parent: "root", x: 0, y: -10, rot: -90, len: 20 },
    { id: "arm", parent: "body", x: 20, y: 0, rot: 90, len: 10 },
  ],
  slots: [
    { id: "body", bone: "body", z: 1, frame: null },
    { id: "arm", bone: "arm", z: 2, frame: "up", x: 0, y: 0 },
    { id: "badge", bone: "body", z: 3, frame: null, x: 10, y: 2 },
  ],
  views: {
    front: {},
    back: { slots: { arm: { z: 0 }, badge: { visible: false } }, sockets: { grip: { z: -1 } } },
  },
  anchors: { head: { bone: "body", x: 24, y: 0 }, hands: { bone: "arm", x: 10, y: 0 } },
  sockets: { grip: { bone: "arm", x: 10, y: 0, rot: 15, z: 2.5, cargo: ["held"] } },
  skin: { body: "cat/body/normal", arm: "cat/leg-front/normal", badge: "cat/eyes" },
  proportions: {
    big: { root: { scale: { x: 2, y: 2 } } },
    lift: { body: { y: -4 }, arm: { rot: -30 } },
  },
});

const ARM_ANIMS = defineAnims(ARM, {
  wave: {
    duration: 400,
    loop: true,
    bones: { arm: { rot: [{ t: 0, v: 0 }, { t: 200, v: -90 }, { t: 400, v: 0 }] } },
    slots: { arm: { frame: [{ t: 0, v: "up" }, { t: 200, v: "down" }] } },
    views: { back: { bones: { arm: { rot: [{ t: 0, v: 45 }] } } } },
  },
  reach: {
    duration: 300,
    loop: false,
    bones: { body: { pos: [{ t: 0, v: { x: 0, y: 0 } }, { t: 300, v: { x: 6, y: 0 } }] } },
    slots: { badge: { visible: [{ t: 0, v: true }, { t: 150, v: false }] }, body: { z: [{ t: 0, v: 1 }, { t: 150, v: 5 }] } },
  },
});

describe("визначення скелетів", () => {
  it("кіт і персонаж валідні, з точками арту й усіма пробними анімаціями", () => {
    expect(rigProblems(CAT_RIG as unknown as LooseRig)).toEqual([]);
    expect(rigProblems(PERSON_RIG as unknown as LooseRig)).toEqual([]);
    expect(fitProblems(CAT_RIG as unknown as LooseRig, CAT_FIT)).toEqual([]);
    expect(fitProblems(PERSON_RIG as unknown as LooseRig, PERSON_FIT)).toEqual([]);
    for (const [rig, def] of [
      ["cat", CAT_RIG],
      ["person", PERSON_RIG],
    ] as const) {
      const anims = animsOf(rig);
      expect(anims.map(([name]) => name)).toContain("trial.ts/walk");
      for (const [name, anim] of anims) expect(animProblems(def as unknown as LooseRig, anim, name)).toEqual([]);
    }
    // Конструктор перевіряє сам.
    expect(() => new Rig(CAT_RIG, { fit: CAT_FIT })).not.toThrow();
    expect(() => new Rig(PERSON_RIG, { fit: PERSON_FIT })).not.toThrow();
  });

  it("обвіс за замовчуванням — за контрактом id, варіанти — за формами кота й виглядом персонажа", () => {
    expect(CAT_RIG.skin.body).toBe("cat/body/normal");
    expect(CAT_RIG.skin["ear-far"]).toBe(CAT_RIG.skin["ear-near"]);
    for (const [slot, art] of Object.entries(CAT_RIG.skin)) expect(CAT_VARIANTS[slot as keyof typeof CAT_VARIANTS]).toContain(art);
    for (const [slot, art] of Object.entries(PERSON_RIG.skin)) expect(PERSON_VARIANTS[slot as keyof typeof PERSON_VARIANTS]).toContain(art);
    const shape = { muzzle: "flat", ears: "folded", tail: "none", build: "stocky", legs: "short" } as const;
    const skin = catSkin(shape);
    expect(skin.tail).toBeNull();
    expect([skin["ear-far"], skin["ear-near"], skin.muzzle, skin.body, skin["leg-back-near"]]).toEqual([
      "cat/ear/folded",
      "cat/ear/folded",
      "cat/muzzle/flat",
      "cat/body/stocky",
      "cat/leg-back/short",
    ]);
    for (const [slot, art] of Object.entries(skin)) expect(CAT_VARIANTS[slot as keyof typeof CAT_VARIANTS]).toContain(art);
    expect(catProportions(shape, 0.5)).toEqual(["short-legs", "stocky", { name: "kitten", weight: 0.5 }]);
    expect(catProportions({ build: "normal", legs: "normal" })).toEqual([]);
    const look = { face: 2, hair: 3, build: 0 };
    expect(personSkin(look)).toMatchObject({ head: "person/head/2", "hair-back": "person/hair-back/3", "hair-front": "person/hair-front/3", torso: "person/torso/0" });
    expect(personProportions(look)).toEqual(["slim"]);
    expect(personProportions({ build: 1 })).toEqual([]);
    for (const name of [...catProportions(shape, 1), ...personProportions({ build: 2 })]) {
      const key = typeof name === "string" ? name : name.name;
      expect(Object.keys({ ...CAT_RIG.proportions, ...PERSON_RIG.proportions })).toContain(key);
    }
  });

  it("помилки визначення, яких не ловлять типи", () => {
    const base = ARM as unknown as LooseRig;
    expect(rigProblems(base)).toEqual([]);
    const broken: LooseRig = {
      ...base,
      bones: [
        { id: "root", parent: null, x: 0, y: 0, rot: 0, len: 0 },
        { id: "arm", parent: "body", x: 0, y: 0, rot: 0, len: 1 },
        { id: "body", parent: "root", x: 0, y: 0, rot: 0, len: -1 },
        { id: "body", parent: "root", x: Number.NaN, y: 0, rot: 0, len: 1 },
      ],
      slots: [...base.slots, { id: "arm", bone: "leg", z: 0, frame: null }],
      skin: { body: "cat/body/normal", arm: "cat/leg-front/normal" },
      proportions: { big: { tail: { scale: { x: 0, y: 1 } } } },
    };
    const problems = rigProblems(broken).join("\n");
    expect(problems).toMatch(/«arm»: батько «body» має стояти раніше/);
    expect(problems).toMatch(/кістка «body»: id повторюється/);
    expect(problems).toMatch(/len не може бути від'ємною/);
    expect(problems).toMatch(/x, y, rot і len мають бути числами/);
    expect(problems).toMatch(/слот «arm»: id повторюється/);
    expect(problems).toMatch(/кістки «leg» немає/);
    expect(problems).toMatch(/обвіс не має слота «badge»/);
    expect(problems).toMatch(/пропорції «big», кістка «tail»: кістки немає/);
    const noBack = { ...base, views: { front: {} } } as unknown as LooseRig;
    expect(rigProblems(noBack).join("\n")).toMatch(/ракурс «back»: немає вихідної пози/);
    expect(() => new Rig(broken)).toThrow(/Скелет/);
  });

  it("точки арту посилаються лише на вже пораховані кадри", () => {
    const base = ARM as unknown as LooseRig;
    expect(fitProblems(base, { bones: { arm: { slot: "body", point: "shoulder" } }, slots: { badge: { slot: "body", point: "chest" } } })).toEqual([]);
    const problems = fitProblems(base, {
      bones: { body: { slot: "arm", point: "elbow" }, leg: { slot: "body", point: "hip" } },
      slots: { body: { slot: "badge", point: "x" } },
      sockets: { grip: { slot: "nose", point: "Bad_Name" } },
    }).join("\n");
    expect(problems).toMatch(/кістка «body»: кадр слота «arm» ще не пораховано/);
    expect(problems).toMatch(/кістка «leg»: кістки немає/);
    expect(problems).toMatch(/слот «body»: кадр слота «badge» ще не пораховано/);
    expect(problems).toMatch(/слота «nose» немає/);
    expect(problems).toMatch(/точка «Bad_Name»/);
  });

  it("помилки анімації: невідомі id, ключі не за часом чи поза тривалістю", () => {
    const base = ARM as unknown as LooseRig;
    const bad = {
      duration: 100,
      loop: false,
      bones: { leg: { rot: [{ t: 0, v: 1 }] }, arm: { rot: [{ t: 50, v: 1 }, { t: 20, v: 2 }, { t: 200, v: 3 }], pos: [] } },
      slots: { arm: { frame: [{ t: 0, v: "Up" }] } },
      views: { side: {} },
    } as unknown as LooseAnim;
    const problems = animProblems(base, bad).join("\n");
    expect(problems).toMatch(/кістки «leg» немає/);
    expect(problems).toMatch(/ключі мають іти за часом/);
    expect(problems).toMatch(/час ключа 2 — від 0 до тривалості/);
    expect(problems).toMatch(/порожня доріжка/);
    expect(problems).toMatch(/неправильне значення ключа 0/);
    expect(problems).toMatch(/невідомий ракурс «side»/);
    expect(animProblems(base, ARM_ANIMS.wave)).toEqual([]);
  });
});

describe("ключі й час", () => {
  it("ease: краї 0 і 1, step тримає початок, in / out / inOut — синусоїда", () => {
    for (const ease of ["linear", "in", "out", "inOut"] as const) {
      expect(near(easeValue(ease, 0), 0)).toBe(true);
      expect(near(easeValue(ease, 1), 1)).toBe(true);
    }
    expect(easeValue("linear", 0.25)).toBe(0.25);
    expect(easeValue(undefined, 0.25)).toBe(0.25);
    expect(easeValue("step", 0.99)).toBe(0);
    expect(easeValue("in", 0.5)).toBeLessThan(0.5);
    expect(easeValue("out", 0.5)).toBeGreaterThan(0.5);
    expect(easeValue("inOut", 0.5)).toBeCloseTo(0.5, 9);
    expect(easeValue("inOut", 0.25)).toBeLessThan(0.25);
  });

  it("інтерполяція: до першого ключа — перший, після останнього — останній, між ними — за ease першого", () => {
    const keys = [
      { t: 100, v: 10 },
      { t: 200, v: 20, ease: "step" as const },
      { t: 300, v: 0 },
    ];
    expect(sampleNumber(keys, 0)).toBe(10);
    expect(sampleNumber(keys, 150)).toBe(15);
    expect(sampleNumber(keys, 250)).toBe(20);
    expect(sampleNumber(keys, 300)).toBe(0);
    expect(sampleNumber(keys, 999)).toBe(0);
    expect(sampleNumber([{ t: 0, v: 7 }], 50)).toBe(7);
    const out = { x: 0, y: 0 };
    sampleVec(
      [
        { t: 0, v: { x: 0, y: 0 } },
        { t: 100, v: { x: 10, y: -4 } },
      ],
      25,
      out,
    );
    expect(out).toEqual({ x: 2.5, y: -1 });
    const steps = [
      { t: 0, v: "a" },
      { t: 100, v: "b" },
    ];
    expect([sampleStep(steps, -5), sampleStep(steps, 99), sampleStep(steps, 100), sampleStep(steps, 500)]).toEqual(["a", "a", "b", "b"]);
  });

  it("по колу — за модулем тривалості, разова тримає останній кадр", () => {
    expect(animTime(400, true, 900)).toBe(100);
    expect(animTime(400, true, -100)).toBe(300);
    expect(animTime(400, false, 900)).toBe(400);
    expect(animTime(400, false, -100)).toBe(0);

    const rig = new Rig(ARM);
    rig.play(ARM_ANIMS.wave, 1000);
    expect(rig.time(1500)).toBe(100);
    expect(rig.done(99999)).toBe(false);
    rig.play(ARM_ANIMS.reach, 2000, { blend: 0 });
    expect(rig.done(2299)).toBe(false);
    expect(rig.done(2300)).toBe(true);
    rig.evaluate(5000);
    // Разова наприкінці: тулуб зсунуто на 6 уздовж батька (корінь), значок сховано, z тулуба — 5.
    expect(rig.bone("body").world.tx).toBeCloseTo(6, 9);
    expect(rig.slot("badge").visible).toBe(false);
    expect(rig.slot("body").z).toBe(5);
    // З `from` — з середини; loop можна перевизначити.
    rig.play(ARM_ANIMS.reach, 0, { from: 150, loop: true, blend: 0 });
    expect(rig.time(0)).toBe(150);
    expect(rig.time(200)).toBe(50);
  });

  it("та сама анімація не починається знову, якщо не restart", () => {
    const rig = new Rig(ARM);
    expect(rig.play(ARM_ANIMS.wave, 0)).toBe(true);
    expect(rig.play(ARM_ANIMS.wave, 100)).toBe(false);
    expect(rig.time(300)).toBe(300);
    expect(rig.play(ARM_ANIMS.wave, 100, { restart: true })).toBe(true);
    expect(rig.time(300)).toBe(200);
    expect(rig.play(ARM_ANIMS.wave, 100, { loop: false })).toBe(true);
    expect(rig.play(null, 100)).toBe(true);
    expect(rig.anim).toBeNull();
    expect(rig.done(0)).toBe(true);
  });
});

describe("поза", () => {
  it("у вихідній позі кадри стоять як намальовані, pivot — у точці слота", () => {
    for (const rig of [new Rig(CAT_RIG), new Rig(PERSON_RIG), new Rig(ARM)]) {
      for (const view of ["front", "back"] as const) {
        rig.setFacing({ view });
        rig.evaluate(0);
        for (const slot of rig.slots) {
          expect(near(slot.rot, 0) && near(slot.sx, 1) && near(slot.sy, 1), `${rig.def.id}/${view}/${slot.id}`).toBe(true);
        }
      }
    }
    const rig = new Rig(ARM).evaluate(0);
    // Тулуб угору від (0, −10): значок на (10, 2) у його системі → (2, −20) у корені.
    expect(rig.slot("badge").x).toBeCloseTo(2, 9);
    expect(rig.slot("badge").y).toBeCloseTo(-20, 9);
    expect(tip(rig as never, "arm")).toEqual({ x: expect.closeTo(10, 9), y: expect.closeTo(-30, 9) });
  });

  it("кадр, гніздо й якір ідуть за кісткою", () => {
    const rig = new Rig(ARM);
    rig.play(ARM_ANIMS.wave, 0, { blend: 0 });
    rig.evaluate(200);
    // Рука повернута на −90 (проти годинникової): дивиться вгору з кінця тулуба (0, −30).
    const arm = rig.slot("arm");
    expect([arm.x, arm.y, arm.rot]).toEqual([expect.closeTo(0, 9), expect.closeTo(-30, 9), expect.closeTo(-90, 9)]);
    expect(arm.state).toBe("down");
    const hands = rig.anchor("hands");
    expect(hands).toEqual({ x: expect.closeTo(0, 9), y: expect.closeTo(-40, 9) });
    const grip = rig.socket("grip");
    expect(grip).toMatchObject({ x: expect.closeTo(0, 9), y: expect.closeTo(-40, 9), rot: expect.closeTo(-75, 9), z: 2.5 });
    expect(rig.anchor("mouth")).toBeNull();
    // Посередині між ключами — посередині (linear).
    rig.evaluate(100);
    expect(rig.slot("arm").rot).toBeCloseTo(-45, 9);
    expect(rig.slot("arm").state).toBe("up");
  });

  it("доріжка ракурсу замінює ту саму доріжку основної анімації", () => {
    const rig = new Rig(ARM, { facing: { view: "back" } });
    rig.play(ARM_ANIMS.wave, 0, { blend: 0 });
    rig.evaluate(200);
    expect(rig.slot("arm").rot).toBeCloseTo(45, 9);
    // Доріжки слотів без перевизначення — від основної.
    expect(rig.slot("arm").state).toBe("down");

    const cat = new Rig(CAT_RIG);
    const walk = animsOf("cat").find(([name]) => name === "trial.ts/walk")?.[1];
    expect(walk).toBeDefined();
    cat.play(walk as never, 0, { blend: 0 });
    const swing = (view: "front" | "back"): number => {
      cat.setFacing({ view });
      let lo = Infinity;
      let hi = -Infinity;
      for (let t = 0; t < 640; t += 10) {
        const rot = cat.evaluate(t).slot("tail").rot;
        lo = Math.min(lo, rot);
        hi = Math.max(hi, rot);
      }
      return hi - lo;
    };
    // Тулуб гойдається в протифазі до хвоста (±1°), тож кадр хвоста ходить на 2 × (6 − 1) спереду і 2 × (10 − 1) ззаду.
    expect(swing("front")).toBeCloseTo(10, 1);
    expect(swing("back")).toBeCloseTo(18, 1);
  });

  it("віддзеркалення: якорі й гнізда — дзеркально по x навколо кореня, кути навпаки, z той самий", () => {
    const right = new Rig(PERSON_RIG).evaluate(0);
    const left = new Rig(PERSON_RIG, { facing: { flip: true } }).evaluate(0);
    expect(left.facing).toEqual({ view: "front", flip: true });
    for (const name of right.anchorNames()) {
      const a = right.anchor(name);
      const b = left.anchor(name);
      expect(b?.x).toBeCloseTo(-(a?.x ?? 0), 9);
      expect(b?.y).toBeCloseTo(a?.y ?? 0, 9);
      // Без віддзеркалення на вимогу — те саме, що праворуч (так його бере rigsprite: дзеркалить контейнер).
      expect(left.anchor(name, undefined, false)).toEqual(a);
    }
    const arm = new Rig(ARM);
    arm.play(ARM_ANIMS.wave, 0, { blend: 0 });
    arm.evaluate(100);
    const r = arm.socket("grip");
    arm.setFacing({ flip: true });
    arm.evaluate(100);
    const l = arm.socket("grip");
    expect(l).toEqual({ x: -(r?.x ?? 0), y: r?.y, rot: -(r?.rot ?? 0), sx: -(r?.sx ?? 0), sy: r?.sy, z: r?.z });
    expect(left.order.map((item) => item.id)).toEqual(right.order.map((item) => item.id));
  });

  it("порядок z: спереду хвіст за тулубом, а голова поверх; ззаду навпаки; гнізда — між слотами", () => {
    const order = (rig: Rig<string, string, string>): string[] => rig.order.map((item) => item.id);
    const cat = new Rig(CAT_RIG).evaluate(0);
    const front = order(cat as never);
    expect(front.indexOf("tail")).toBeLessThan(front.indexOf("body"));
    expect(front.indexOf("head")).toBeGreaterThan(front.indexOf("body"));
    expect(front.indexOf("leg-front-far")).toBeLessThan(front.indexOf("body"));
    expect(front.indexOf("leg-front-near")).toBeGreaterThan(front.indexOf("body"));
    expect(front.indexOf("eyes")).toBeGreaterThan(front.indexOf("head"));
    const version = cat.orderVersion;
    cat.evaluate(16);
    expect(cat.orderVersion).toBe(version);
    cat.setFacing({ view: "back" });
    cat.evaluate(32);
    expect(cat.orderVersion).toBeGreaterThan(version);
    const back = order(cat as never);
    expect(back.indexOf("tail")).toBeGreaterThan(back.indexOf("body"));
    expect(back.indexOf("head")).toBeLessThan(back.indexOf("body"));
    expect(back.indexOf("leg-front-near")).toBeGreaterThan(back.indexOf("body"));
    expect(["muzzle", "eyes", "mouth"].map((id) => cat.slot(id as never).visible)).toEqual([false, false, false]);
    expect(cat.slot("ear-far").visible).toBe(true);

    const person = new Rig(PERSON_RIG).evaluate(0);
    const pf = order(person as never);
    expect(pf[0]).toBe("hair-back");
    expect(pf.indexOf("arms")).toBeGreaterThan(pf.indexOf("torso"));
    expect(pf.indexOf("arms")).toBeLessThan(pf.indexOf("arm-near"));
    expect(pf.at(-1)).toBe("arm-near");
    person.setFacing({ view: "back" });
    person.evaluate(0);
    const pb = order(person as never);
    expect(pb.indexOf("hair-back")).toBeGreaterThan(pb.indexOf("head"));
    expect(pb.indexOf("arms")).toBeLessThan(pb.indexOf("torso"));
    expect(person.slot("hair-front").visible).toBe(false);
    // Ззаду ближня рука — праворуч від тулуба, спереду — ліворуч.
    expect(person.slot("arm-near").x).toBeGreaterThan(person.slot("arm-far").x);
    person.setFacing({ view: "front" });
    expect(person.evaluate(0).slot("arm-near").x).toBeLessThan(person.slot("arm-far").x);

    // Слота без обвісу немає: безхвостий кіт.
    const manx = new Rig(CAT_RIG, { skin: { tail: null } }).evaluate(0);
    expect(manx.slot("tail").visible).toBe(false);
    expect(manx.slot("tail").art).toBeNull();
  });

  it("висоти: кіт ≈ 56 до вух, персонаж ≈ 140 до маківки, лапи й ступні на підлозі", () => {
    const cat = new Rig(CAT_RIG).evaluate(0);
    expect(cat.anchor("head")?.y).toBeGreaterThan(-62);
    expect(cat.anchor("head")?.y).toBeLessThan(-50);
    const person = new Rig(PERSON_RIG).evaluate(0);
    expect(person.anchor("head")?.y).toBeGreaterThan(-155);
    expect(person.anchor("head")?.y).toBeLessThan(-138);
    for (const leg of ["leg-front-far", "leg-front-near", "leg-back-far", "leg-back-near"]) {
      expect(Math.abs(tip(cat as never, leg).y), leg).toBeLessThanOrEqual(3);
    }
    for (const foot of ["foot-far", "foot-near"]) expect(Math.abs(person.bone(foot as never).world.ty + 8), foot).toBeLessThanOrEqual(3);
  });

  it("пробна ходьба: лапи й ступні не провалюються крізь підлогу й не злітають, обидва ракурси", () => {
    const walkOf = (rig: string): LooseAnim => animsOf(rig).find(([name]) => name === "trial.ts/walk")?.[1] as LooseAnim;
    for (const view of ["front", "back"] as const) {
      const cat = new Rig(CAT_RIG, { facing: { view } });
      cat.play(walkOf("cat") as never, 0, { blend: 0 });
      for (let t = 0; t < 640; t += 20) {
        cat.evaluate(t);
        for (const leg of ["leg-front-far", "leg-front-near", "leg-back-far", "leg-back-near"]) {
          const y = tip(cat as never, leg).y;
          expect(y, `${view} ${leg} ${t}`).toBeLessThan(4);
          expect(y, `${view} ${leg} ${t}`).toBeGreaterThan(-8);
        }
      }
      const person = new Rig(PERSON_RIG, { facing: { view } });
      person.play(walkOf("person") as never, 0, { blend: 0 });
      for (let t = 0; t < 700; t += 20) {
        person.evaluate(t);
        for (const foot of ["foot-far", "foot-near"]) {
          const y = person.bone(foot as never).world.ty;
          expect(y, `${view} ${foot} ${t}`).toBeLessThan(0);
          expect(y, `${view} ${foot} ${t}`).toBeGreaterThan(-20);
        }
      }
    }
  });
});

describe("пропорції", () => {
  it("кошеня: усе менше, голова відносно більша; з вагою — між дорослим і кошеням", () => {
    const adult = new Rig(CAT_RIG).evaluate(0);
    const kitten = new Rig(CAT_RIG, { proportions: ["kitten"] }).evaluate(0);
    const half = new Rig(CAT_RIG, { proportions: [{ name: "kitten", weight: 0.5 }] }).evaluate(0);
    const height = (rig: Rig<string, string, string>): number => -(rig.anchor("head")?.y ?? 0);
    expect(height(kitten as never)).toBeLessThan(height(adult as never) * 0.8);
    expect(height(half as never)).toBeLessThan(height(adult as never));
    expect(height(half as never)).toBeGreaterThan(height(kitten as never));
    const ratio = (rig: Rig<string, string, string>): number => rig.slot("head").sx / rig.slot("body").sx;
    expect(ratio(kitten as never)).toBeGreaterThan(1.25);
    expect(ratio(adult as never)).toBe(1);
    // Лапи коротші, але на підлозі.
    for (const leg of ["leg-front-near", "leg-back-far"]) expect(Math.abs(tip(kitten as never, leg).y), leg).toBeLessThanOrEqual(3);
    // Кадри лап коротші вздовж лапи (вертикально), а не вужчі.
    expect(kitten.slot("leg-front-near").sy / kitten.slot("body").sy).toBeLessThan(0.9);
  });

  it("короткі лапи опускають тіло; поправки складаються, невідомі назви пропускаються", () => {
    const adult = new Rig(CAT_RIG).evaluate(0);
    const short = new Rig(CAT_RIG, { proportions: ["short-legs", "nonsense"] }).evaluate(0);
    expect(short.bone("pelvis").world.ty - adult.bone("pelvis").world.ty).toBeCloseTo(7, 9);
    expect(short.slot("head").y - adult.slot("head").y).toBeCloseTo(7, 9);

    const rig = new Rig(ARM, { proportions: ["big", "lift"] }).evaluate(0);
    // Тулуб: (0, −10) + (0, −4), усе вдвічі більше; рука піднята на 30°.
    expect(rig.bone("body").world.ty).toBeCloseTo(-28, 9);
    expect(rig.slot("arm").rot).toBeCloseTo(-30, 9);
    expect(rig.slot("arm").sx).toBeCloseTo(2, 9);
    rig.setProportions([]);
    expect(rig.evaluate(0).bone("body").world.ty).toBeCloseTo(-10, 9);
    expect(rig.proportions).toEqual([]);
  });
});

describe("точки арту", () => {
  /** Маніфест для перевірки: тулуб з точками плеча (і окремою для ракурсу ззаду), рука без точок. */
  const ENTRIES: Record<string, ArtEntry> = {
    "cat/body/normal": {
      id: "cat/body/normal",
      size: { w: 40, h: 60 },
      pivot: { x: 20, y: 50 },
      points: { shoulder: { x: 30, y: 12 }, "shoulder-back": { x: 10, y: 12 }, chest: { x: 26, y: 30 } },
      views: ["front", "back"],
    },
    "cat/leg-front/normal": { id: "cat/leg-front/normal", size: { w: 10, h: 20 }, pivot: { x: 5, y: 2 }, views: ["front", "back"], states: ["up", "down"] },
  };
  const lookup: ArtLookup = (id: ArtId) => ENTRIES[id];
  const FIT = { bones: { arm: { slot: "body", point: "shoulder" } }, slots: { badge: [{ slot: "body", point: "none" }, { slot: "body", point: "chest" }] } } as const;

  it("кістка починається в точці кадру, слот стоїть у точці; немає точки — число визначення", () => {
    const rig = new Rig(ARM, { fit: FIT, lookup }).evaluate(0);
    // Pivot тулуба — у (0, −10); плече на 10 правіше й на 38 вище за pivot.
    expect(tip(rig as never, "body")).toEqual({ x: expect.closeTo(0, 9), y: expect.closeTo(-30, 9) });
    expect(rig.slot("arm").x).toBeCloseTo(10, 9);
    expect(rig.slot("arm").y).toBeCloseTo(-48, 9);
    // Значок — друга точка за пріоритетом (у руки точки «none» немає).
    expect(rig.slot("badge").x).toBeCloseTo(6, 9);
    expect(rig.slot("badge").y).toBeCloseTo(-30, 9);
    expect(rig.boneSetup("arm")).toMatchObject({ x: expect.closeTo(38, 9), y: expect.closeTo(10, 9) });
    // Точка лише ракурсу ззаду.
    rig.setFacing({ view: "back" });
    expect(rig.evaluate(0).slot("arm").x).toBeCloseTo(-10, 9);
    // Без маніфесту — числа визначення.
    const plain = new Rig(ARM, { fit: FIT }).evaluate(0);
    expect(plain.slot("arm").x).toBeCloseTo(0, 9);
    expect(plain.slot("arm").y).toBeCloseTo(-30, 9);
    // Інший тулуб без запису — теж числа визначення (обвіс міняє точки).
    rig.setFacing({ view: "front" });
    rig.setSkin({ body: "cat/body/stocky" });
    expect(rig.evaluate(0).slot("arm").y).toBeCloseTo(-30, 9);
  });

  it("кадр слота: стан і ракурс — лише ті, що має запис", () => {
    const leg = ENTRIES["cat/leg-front/normal"];
    expect(slotFrame("cat/leg-front/normal", leg, "down", "back").frame).toBe("cat/leg-front/normal/down/back");
    expect(slotFrame("cat/leg-front/normal", leg, "nope", "front")).toMatchObject({ state: "up", frame: "cat/leg-front/normal/up/front" });
    expect(slotFrame("cat/leg-front/normal", leg, null, "front").state).toBe("up");
    const body = ENTRIES["cat/body/normal"];
    expect(slotFrame("cat/body/normal", body, "up", "back")).toEqual({ art: "cat/body/normal", state: null, view: "back", frame: "cat/body/normal/back" });
    expect(slotFrame("cat/eyes", undefined, "open", "front").frame).toBe("cat/eyes/open/front");
    expect(entryPoint(body, "shoulder", "back")).toEqual({ x: 10, y: 12 });
    expect(entryPoint(body, "shoulder", "front")).toEqual({ x: 30, y: 12 });
    expect(entryPoint(body, "hip", "front")).toBeUndefined();
  });
});

describe("змішування поз", () => {
  it("після play поза ≈ BLEND_MS плавно йде від попередньої до нової", () => {
    const rig = new Rig(ARM);
    rig.play(ARM_ANIMS.wave, 0, { blend: 0 });
    const old = rig.evaluate(200).slot("arm").rot;
    expect(old).toBeCloseTo(-90, 9);
    rig.play(null, 200);
    expect(rig.evaluate(200).slot("arm").rot).toBeCloseTo(-90, 9);
    const mid = rig.evaluate(200 + BLEND_MS / 2).slot("arm").rot;
    expect(mid).toBeGreaterThan(-90);
    expect(mid).toBeLessThan(0);
    expect(mid).toBeCloseTo(-45, 6);
    expect(rig.evaluate(200 + BLEND_MS).slot("arm").rot).toBeCloseTo(0, 9);
    // Без змішування — одразу.
    rig.play(ARM_ANIMS.wave, 1000, { blend: 0, from: 200 });
    expect(rig.evaluate(1000).slot("arm").rot).toBeCloseTo(-90, 9);
    // Зміна ракурсу — нова вихідна поза, без змішування.
    rig.play(null, 2000);
    rig.setFacing({ view: "back" });
    expect(rig.evaluate(2000).slot("arm").rot).toBeCloseTo(0, 9);
    // Час пішов назад (повзунок галереї) — змішування скасовано, одразу нова поза.
    rig.setFacing({ view: "front" });
    rig.play(ARM_ANIMS.wave, 3000, { blend: 0, from: 200 });
    rig.evaluate(3000);
    rig.play(null, 3000);
    expect(rig.evaluate(2900).slot("arm").rot).toBeCloseTo(0, 9);
  });
});
