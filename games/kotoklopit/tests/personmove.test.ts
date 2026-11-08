// Анімації руху персонажа (крок 16, хвиля 2, пакет N4a; `src/view/rig/anims/person/move.ts`): стопи стоять на підлозі й не
// ковзають — у ході опорна стопа йде назад рівно з кроком (`personGait`), у стоянні не зсувається; темп ходи
// (`personGaitSpeed`) — зі швидкості на екрані, і виснажений чи травмований не дрібочить частіше за здорового; цикли без
// ривка на стику; разові закінчуються вихідною позою (бере кота — позою «тримає кота»); накладки рук заміняють руки основної
// (`personWithArms`): річ рівно, кіт у руках не підстрибує; присівши, взуття рівно; ззаду руки «в боки» — дзеркально.

import { describe, expect, it } from "vitest";

import { ILLNESS_EFFECTS } from "../src/sim/config";
import { PERSON_ANIM_GROUPS, PERSON_OVERLAYS, PERSON_OWN_ARMS } from "../src/view/anim/ids";
import { PERSON_ANIMS } from "../src/view/rig/anims/index";
import { CAT_RIG } from "../src/view/rig/defs/cat";
import { PERSON_RIG } from "../src/view/rig/defs/person";
import {
  PERSON_MOVE,
  PERSON_PICKUP_GRAB_MS,
  PERSON_PUTDOWN_RELEASE_MS,
  personCatGrip,
  personCatLift,
  personGait,
  personGaitSpeed,
  personWithArms,
  type PersonGait,
} from "../src/view/rig/anims/person/move";
import { Rig, animProblems, sampleNumber, sampleVec } from "../src/view/rig/rigcore";
import type { ArtView } from "../src/view/art/types";
import type { BoneTracks, RigAnim, RigDef } from "../src/view/rig/types";

type LooseAnim = RigAnim<string, string>;
type Name = keyof typeof PERSON_MOVE;
type PersonAnim = (typeof PERSON_MOVE)[Name];
const ANIMS = PERSON_MOVE as unknown as Readonly<Record<Name, LooseAnim>>;
const VIEWS: readonly ArtView[] = ["front", "back"];
type LooseRig = Rig<string, string, string>;

/** Кісточки (початок кістки стопи) у системі кореня. */
function ankles(rig: LooseRig): { near: { x: number; y: number }; far: { x: number; y: number } } {
  const at = (id: string): { x: number; y: number } => {
    const m = rig.bone(id).world;
    return { x: m.tx, y: m.ty };
  };
  return { near: at("foot-near"), far: at("foot-far") };
}

function rigFor(view: ArtView, proportions: string[] = []): LooseRig {
  return new Rig(PERSON_RIG, { facing: { view, flip: false }, proportions }) as unknown as LooseRig;
}

/** Кут осі x кістки у світі, градуси, і перекіс її осей (відхилення кута між ними від 90°). */
function axes(rig: LooseRig, id: string): { rot: number; skew: number } {
  const m = rig.bone(id).world;
  const rot = Math.atan2(m.b, m.a) / (Math.PI / 180);
  const skew = Math.abs(Math.acos((m.a * m.c + m.b * m.d) / (Math.hypot(m.a, m.b) * Math.hypot(m.c, m.d))) / (Math.PI / 180) - 90);
  return { rot, skew };
}

const GAITS: readonly PersonGait[] = ["walk", "dash", "limp", "trudge", "dizzy"];

/** Кіт у вихідній позі (кошеня — з вагою `kitten`): скелет і його гніздо `pet` (спинка) у системі кореня кота. */
function catAt(kitten: number): { rig: LooseRig; pet: { x: number; y: number } } {
  const rig = new Rig(CAT_RIG, { facing: { view: "front", flip: false }, proportions: kitten > 0 ? [{ name: "kitten", weight: kitten }] : [] }) as unknown as LooseRig;
  rig.evaluate(0);
  const pet = rig.socket("pet", undefined, false);
  return { rig, pet: { x: pet?.x ?? NaN, y: pet?.y ?? NaN } };
}
const catPet = (kitten: number): { x: number; y: number } => catAt(kitten).pet;

/** Стоїть на місці: обидві стопи не рухаються. */
const STANDING: readonly Name[] = ["idle", "pet", "rod", "sick", "exhausted", "refuse", "pickUp", "putDown"];

describe("рух персонажа: стопи", () => {
  for (const gait of GAITS) {
    it(`${gait}: опорна стопа на підлозі йде назад рівно з кроком (не ковзає), жодна не йде під підлогу`, () => {
      const anim = ANIMS[gait];
      const info = personGait(gait);
      expect(info.ms).toBe(anim.duration);
      const cycle = anim.duration / info.cycles;
      for (const view of VIEWS) {
        const rig = rigFor(view);
        rig.evaluate(0);
        const ground = ankles(rig);
        rig.play(anim, 0, { blend: 0 });
        const speed = info.stride / anim.duration;
        for (const leg of ["near", "far"] as const) {
          const [from, to] = info[leg];
          // Усередині опори першого циклу (без країв, де стопа стає й відривається).
          const a = (from + 0.04) * cycle;
          const b = (to - 0.04) * cycle;
          rig.evaluate(a);
          const start = ankles(rig)[leg];
          for (let t = a; t <= b; t += (b - a) / 12) {
            rig.evaluate(t);
            const ankle = ankles(rig)[leg];
            expect(Math.abs(ankle.x - (start.x - speed * (t - a))), `${view} ${leg} x @${t}`).toBeLessThan(0.6);
            expect(Math.abs(ankle.y - ground[leg].y), `${view} ${leg} y @${t}`).toBeLessThan(0.6);
          }
        }
        for (let t = 0; t < anim.duration; t += anim.duration / (50 * info.cycles)) {
          rig.evaluate(t);
          const now = ankles(rig);
          expect(now.near.y - ground.near.y).toBeLessThan(0.6);
          expect(now.far.y - ground.far.y).toBeLessThan(0.6);
        }
      }
    });
  }

  it("стоячи (стоїть, гладить, вудочка, хворий, виснажений, відмова, бере й опускає кота) стопи не зсуваються й не йдуть під підлогу", () => {
    for (const name of STANDING) {
      const anim = ANIMS[name];
      for (const view of VIEWS) {
        for (const proportions of [[], ["stocky"], ["slim"]]) {
          const rig = rigFor(view, proportions);
          rig.evaluate(0);
          const ground = ankles(rig);
          rig.play(anim, 0, { blend: 0 });
          for (let t = 0; t <= anim.duration; t += anim.duration / 40) {
            rig.evaluate(t);
            const now = ankles(rig);
            for (const leg of ["near", "far"] as const) {
              expect(Math.abs(now[leg].x - ground[leg].x), `${name} ${view} ${leg} x @${t}`).toBeLessThan(0.8);
              expect(Math.abs(now[leg].y - ground[leg].y), `${name} ${view} ${leg} y @${t}`).toBeLessThan(0.8);
            }
          }
        }
      }
    }
  });

  it("присівши (гладить, бере й опускає кота) взуття стоїть рівно, без перекосу", () => {
    for (const name of ["pet", "pickUp", "putDown"] as const) {
      const anim = ANIMS[name];
      for (const view of VIEWS) {
        const rig = rigFor(view);
        rig.play(anim, 0, { blend: 0 });
        for (let t = 0; t <= anim.duration; t += anim.duration / 20) {
          rig.evaluate(t);
          for (const foot of ["foot-near", "foot-far"]) {
            const { rot, skew } = axes(rig, foot);
            expect(Math.abs(rot), `${name} ${view} ${foot} кут @${t}`).toBeLessThan(1);
            expect(skew, `${name} ${view} ${foot} перекіс @${t}`).toBeLessThan(1);
          }
        }
      }
    }
  });
});

describe("рух персонажа: темп ходи", () => {
  /** Швидкість кореня на екрані за швидкості відтворення `speed`, одиниць арту за секунду. */
  const rootSpeed = (gait: PersonGait, speed: number): number => (speed * personGait(gait).stride * 1000) / personGait(gait).ms;

  it("по горизонталі стопи не ковзають: хода проходить рівно стільки, скільки персонаж по екрану", () => {
    for (const gait of GAITS) {
      expect(rootSpeed(gait, personGaitSpeed(gait, 362, 0))).toBeCloseTo(362, 6);
      expect(rootSpeed(gait, personGaitSpeed(gait, -362, 0))).toBeCloseTo(362, 6);
      // Уздовж осі клітинки: 4 клітинки за секунду — 256 по горизонталі й 128 по вертикалі.
      expect(rootSpeed(gait, personGaitSpeed(gait, 256, 128))).toBeCloseTo(256, 6);
      expect(rootSpeed(gait, personGaitSpeed(gait, -256, -128))).toBeCloseTo(256, 6);
      expect(personGaitSpeed(gait, 0, 0)).toBe(0);
    }
  });

  it("угору й униз екрана ноги не стоять: темп — 0,7 від швидкості по підлозі (вертикаль ромба стиснута вдвічі)", () => {
    for (const gait of GAITS) {
      expect(rootSpeed(gait, personGaitSpeed(gait, 0, -181))).toBeCloseTo(0.7 * 362, 6);
      expect(rootSpeed(gait, personGaitSpeed(gait, 0, 181))).toBeCloseTo(0.7 * 362, 6);
      // Навскіс між віссю клітинки й вертикаллю — не повільніше.
      expect(rootSpeed(gait, personGaitSpeed(gait, 100, -160))).toBeGreaterThanOrEqual(0.7 * Math.hypot(100, 320) - 1e-9);
    }
  });

  it("за швидкості 1 ходьба — номінальна швидкість сима вздовж осі клітинки (≈ 256 од./с по горизонталі)", () => {
    expect(rootSpeed("walk", 1)).toBeGreaterThan(250);
    expect(rootSpeed("walk", 1)).toBeLessThan(262);
    expect(rootSpeed("trudge", 1)).toBeCloseTo(rootSpeed("walk", 1), -1);
    expect(rootSpeed("limp", 1)).toBeCloseTo(rootSpeed("walk", 1) * ILLNESS_EFFECTS.slow, -1);
  });

  it("плететься (виснаження не сповільнює) і кульгає (травма — ×0,8) не дрібніше за ходьбу: кроків за секунду не більше", () => {
    const walk = personGait("walk").stride / personGait("walk").cycles;
    expect(personGait("trudge").stride).toBeGreaterThanOrEqual(walk);
    expect(personGait("limp").stride).toBeGreaterThanOrEqual(ILLNESS_EFFECTS.slow * walk);
    // Паморочиться — та сама хода, що й ходьба.
    expect(personGait("dizzy").stride / personGait("dizzy").ms).toBeCloseTo(personGait("walk").stride / personGait("walk").ms, 3);
    // Ходьба — довгий крок: за 4 клітинки за секунду вправо (362 од./с) — не більше 6,5 кроку за секунду.
    expect((362 / walk) * 2).toBeLessThan(6.5);
  });
});

/** Значення доріжки кістки на початку й наприкінці. */
function ends(track: BoneTracks, duration: number): { first: number[]; last: number[] } {
  const v = { x: 0, y: 0 };
  const pick = (t: number): number[] => [
    track.rot ? sampleNumber(track.rot, t) : 0,
    ...(track.pos ? Object.values(sampleVec(track.pos, t, v)) : [0, 0]),
    ...(track.scale ? Object.values(sampleVec(track.scale, t, v)) : [1, 1]),
  ];
  return { first: pick(0), last: pick(duration) };
}

function allTracks(anim: LooseAnim): [string, BoneTracks][] {
  const list: [string, BoneTracks][] = Object.entries(anim.bones ?? {}).map(([id, t]) => [id, t ?? {}]);
  for (const [view, set] of Object.entries(anim.views ?? {})) for (const [id, t] of Object.entries(set?.bones ?? {})) list.push([`${view}:${id}`, t ?? {}]);
  return list;
}

const roundAll = (values: number[]): number[] => values.map((v) => Math.round(v * 100) / 100 + 0);

describe("рух персонажа: цикли, разові й накладки", () => {
  it("по колу — без ривка на стику: кожна доріжка починається й закінчується тим самим", () => {
    for (const [name, anim] of Object.entries(ANIMS)) {
      if (!anim.loop) continue;
      for (const [id, track] of allTracks(anim)) {
        const { first, last } = ends(track, anim.duration);
        expect(last, `${name} ${id}`).toEqual(first);
      }
    }
  });

  it("разові закінчуються вихідною позою (з неї м'яко повертається основна), а «бере кота» — позою «тримає кота»", () => {
    const hold = ANIMS.holdCat;
    for (const [name, anim] of Object.entries(ANIMS)) {
      if (anim.loop) continue;
      for (const [id, track] of allTracks(anim)) {
        const { last } = ends(track, anim.duration);
        const bone = id.replace(/^\w+:/, "");
        const view = id.includes(":") ? id.split(":")[0] : "front";
        if (name === "pickUp" && /^(arm|hand)-/.test(bone)) {
          const holdTrack = (view === "back" ? hold.views?.back?.bones?.[bone] : undefined) ?? hold.bones?.[bone] ?? {};
          const want = ends(holdTrack, hold.duration).first;
          // Рука: кут і масштаб уздовж (pos у накладці — нуль, у разовій його немає).
          expect([roundAll(last)[0], roundAll(last)[3]], `${name} ${id}`).toEqual([roundAll(want)[0], roundAll(want)[3]]);
          continue;
        }
        expect(roundAll(last), `${name} ${id}`).toEqual([0, 0, 0, 1, 1]);
      }
    }
  });

  it("накладки рук (несе річ, тримає кота) мають лише руки й кисті", () => {
    for (const name of PERSON_OVERLAYS) {
      const anim = ANIMS[name as Name];
      for (const [id] of allTracks(anim)) expect(id.replace(/^\w+:/, "")).toMatch(/^(arm|hand)-(near|far)$/);
    }
  });

  it("ззаду руки «в боки» (відмова, посковзнувся) — дзеркально: ближня рука не йде навскіс через спину", () => {
    for (const name of ["refuse", "slip"] as const) {
      const anim = ANIMS[name];
      for (const id of ["arm-near", "arm-far"]) {
        const front = anim.bones?.[id]?.rot ?? [];
        const back = anim.views?.back?.bones?.[id]?.rot ?? [];
        expect(back.map((key) => key.v + 0), `${name} ${id}`).toEqual(front.map((key) => -key.v + 0));
      }
    }
  });

  it("вкусили й застуда ззаду: ближня рука не йде через спину (кисть правіше за середину тулуба) і не тягнеться до кота", () => {
    for (const name of ["bitten", "sick"] as const) {
      const anim = ANIMS[name];
      for (const proportions of [[], ["stocky"], ["slim"]]) {
        const rig = rigFor("back", proportions);
        rig.evaluate(0);
        const rest = rig.anchor("hands", { x: 0, y: 0 }, false);
        rig.play(anim, 0, { blend: 0 });
        for (let t = 0; t <= anim.duration; t += anim.duration / 40) {
          rig.evaluate(t);
          const hand = rig.anchor("hands", { x: 0, y: 0 }, false);
          const torso = rig.bone("torso").world;
          const shoulder = rig.bone("arm-near").world;
          // Середина тулуба — на 20 од. угору вздовж нього від таза.
          const mid = torso.a * 20 + torso.tx;
          expect(hand?.x ?? 0, `${name} ${proportions.join()} @${t}`).toBeGreaterThan(mid + 10);
          // Не далі вперед, ніж на пів руки від вихідної (не тицяє в кота перед собою), і нижче за плече.
          expect(hand?.x ?? 0, `${name} ${proportions.join()} @${t}`).toBeLessThan((rest?.x ?? 0) + 27);
          expect(hand?.y ?? 0, `${name} ${proportions.join()} @${t}`).toBeGreaterThan(shoulder.ty);
        }
      }
    }
  });

  it("застуда спереду: ближня рука навхрест грудей (обхопив себе), а не на животі; витирає ніс — кисть біля обличчя", () => {
    const rig = rigFor("front");
    rig.play(ANIMS.sick, 0, { blend: 0 });
    for (let t = 0; t <= ANIMS.sick.duration; t += 50) {
      rig.evaluate(t);
      const hand = rig.anchor("hands", { x: 0, y: 0 }, false);
      const torso = rig.bone("torso").world;
      // Кисть вище за середину тулуба (груди, а не живіт) і по той бік середини від плеча (навхрест).
      expect(hand?.y ?? 0, `@${t}`).toBeLessThan(torso.b * 20 + torso.ty);
      expect(hand?.x ?? 0, `@${t}`).toBeGreaterThan(torso.a * 20 + torso.tx + 8);
    }
    // Посеред витирання (wipe — 0,6…0,7 циклу) кисть на рівні обличчя: вище за основу шиї.
    rig.evaluate(0.65 * ANIMS.sick.duration);
    const neck = rig.bone("neck").world;
    expect(rig.anchor("hands", { x: 0, y: 0 }, false)?.y ?? 0).toBeLessThan(neck.ty);
  });

  it("несе річ ззаду: річ перед тулубом на рівні грудей, як спереду (а не збоку на рівні стегна)", () => {
    const at = (view: ArtView): { x: number; y: number } => {
      const rig = rigFor(view);
      rig.play(ANIMS.carry, 0, { blend: 0 });
      rig.evaluate(0);
      const held = rig.socket("held", undefined, false);
      return { x: held?.x ?? NaN, y: held?.y ?? NaN };
    };
    const front = at("front");
    const back = at("back");
    expect(Math.abs(back.y - front.y)).toBeLessThan(4);
    // Ззаду — визирає з-за правого краю тулуба (тулуб — ≈ ±18 од.), а не на відстані руки збоку.
    expect(back.x).toBeGreaterThan(18);
    expect(back.x).toBeLessThan(36);
  });

  it("несе річ ззаду (рука вкорочена): річ рівно, тулуб нахиляється — рука тримає кут", () => {
    for (const name of ["idle", "walk", "dash", "trudge", "trip", "slip"] as const) {
      const made = personWithArms(PERSON_MOVE[name], "carry", name) as LooseAnim;
      const rig = rigFor("back");
      rig.play(made, 0, { blend: 0 });
      for (let t = 0; t <= made.duration; t += made.duration / 30) {
        rig.evaluate(t);
        expect(Math.abs(rig.socket("held", undefined, false)?.rot ?? NaN), `${name} @${t}`).toBeLessThan(0.5);
      }
    }
  });

  it("паморочиться: характерне — у перших 0,35 с (збій керування короткий): руки розведені з першого кадру, голова хилитається", () => {
    const anim = ANIMS.dizzy;
    const near = anim.bones?.["arm-near"]?.rot ?? [];
    const far = anim.bones?.["arm-far"]?.rot ?? [];
    expect(sampleNumber(near, 0) - sampleNumber(far, 0)).toBeGreaterThan(40);
    const head = anim.bones?.head?.rot ?? [];
    const torso = anim.bones?.torso?.rot ?? [];
    const world: number[] = [];
    for (let t = 0; t <= 350; t += 10) world.push(sampleNumber(head, t) + sampleNumber(torso, t));
    // Голова у світі: униз і знову вгору — щонайменше 15° туди й назад.
    const low = world.indexOf(Math.max(...world));
    expect(Math.max(...world) - world[0]!).toBeGreaterThan(15);
    expect(Math.max(...world) - Math.min(...world.slice(low))).toBeGreaterThan(15);
  });

  it("гладить: кисть низько — і дорослий кіт, і кошеня під нею стоять на підлозі майже поруч із персонажем, а не висять", () => {
    for (const view of VIEWS) {
      const rig = rigFor(view);
      rig.play(ANIMS.pet, 0, { blend: 0 });
      for (const kitten of [0, 0.5, 1]) {
        const pet = catPet(kitten);
        for (let t = 0; t <= ANIMS.pet.duration; t += 50) {
          rig.evaluate(t);
          const hand = rig.anchor("hands", { x: 0, y: 0 }, false);
          // Корінь кота, чиє гніздо pet — у кисті (контракт `pet`).
          const root = (hand?.y ?? NaN) - pet.y;
          if (view === "front") expect(Math.abs(root), `${view} кошеня ${kitten} @${t}`).toBeLessThan(12);
          // Ззаду кіт перед персонажем — від камери: вище на екрані, але не далі за ≈ 0,35 клітинки.
          else expect(root, `${view} кошеня ${kitten} @${t}`).toBeGreaterThan(-24);
          if (view === "back") expect(root, `${view} кошеня ${kitten} @${t}`).toBeLessThan(0);
        }
      }
    }
  });

  it("бере кота: у присіді обидві кисті внизу біля підлоги перед собою, наприкінці — там, де тримає кота", () => {
    const rig = rigFor("front");
    rig.play(ANIMS.pickUp, 0, { blend: 0 });
    rig.evaluate(150);
    const low = rig.anchor("hands", { x: 0, y: 0 }, false);
    expect(low?.x ?? 0).toBeGreaterThan(20);
    expect(low?.y ?? 0).toBeGreaterThan(-45);
    for (const view of VIEWS) {
      const pick = rigFor(view);
      pick.play(ANIMS.pickUp, 0, { blend: 0 });
      pick.evaluate(ANIMS.pickUp.duration);
      const end = pick.anchor("hands", { x: 0, y: 0 }, false);
      const hold = rigFor(view);
      hold.play(ANIMS.holdCat, 0, { blend: 0 });
      hold.evaluate(0);
      const held = hold.anchor("hands", { x: 0, y: 0 }, false);
      expect(end?.x, view).toBeCloseTo(held?.x ?? NaN, 1);
      expect(end?.y, view).toBeCloseTo(held?.y ?? NaN, 1);
    }
  });
});

describe("рух персонажа: основна з накладкою рук (personWithArms)", () => {
  const BASES: readonly Name[] = ["idle", "walk", "dash", "trudge", "limp", "exhausted", "sick", "dizzy", "bitten", "refuse", "trip", "slip"];
  const anim = (name: Name): PersonAnim => PERSON_MOVE[name];

  it("та сама пара — той самий об'єкт; без накладки й для анімацій, що самі ведуть руки, — основна як є", () => {
    expect(personWithArms(anim("walk"), "carry", "walk")).toBe(personWithArms(anim("walk"), "carry", "walk"));
    expect(personWithArms(anim("walk"), "carry", "walk")).not.toBe(personWithArms(anim("walk"), "holdCat", "walk"));
    expect(personWithArms(anim("walk"), null, "walk")).toBe(anim("walk"));
    // Набір — той самий, що в `anim/ids.ts` (локальної копії в move.ts немає): N4a і всі справи N4b.
    for (const id of ["rod", "pickUp", "putDown", ...PERSON_ANIM_GROUPS.chores] as const) expect(PERSON_OWN_ARMS.has(id), id).toBe(true);
    for (const own of PERSON_OWN_ARMS) for (const overlay of PERSON_OVERLAYS) expect(personWithArms(PERSON_ANIMS[own], overlay, own)).toBe(PERSON_ANIMS[own]);
  });

  it("решта доріжок — від основної, тривалість і повтор — її; доріжки за скелетом", () => {
    for (const name of BASES) {
      for (const overlay of PERSON_OVERLAYS) {
        const base = ANIMS[name];
        const made = personWithArms(anim(name), overlay, name) as LooseAnim;
        expect({ duration: made.duration, loop: made.loop }).toEqual({ duration: base.duration, loop: base.loop });
        for (const [id, track] of Object.entries(base.bones ?? {})) if (!/^(arm|hand)-/.test(id)) expect(made.bones?.[id], `${name} ${id}`).toBe(track);
        // З пилососом дальня рука — від основної, а кулак ближньої — над ручкою (z слота `arm-near`).
        if (overlay === "holdVacuum" || overlay === "holdBroom") {
          for (const id of ["arm-far", "hand-far"]) expect(made.bones?.[id], `${name} ${id}`).toBe(base.bones?.[id]);
          expect(made.slots).toEqual({ ...base.slots, "arm-near": { ...base.slots?.["arm-near"], z: [{ t: 0, v: 13 }] } });
        } else expect(made.slots).toBe(base.slots);
        expect(animProblems(PERSON_RIG as unknown as RigDef<string, string, string>, made, `${name}+${overlay}`)).toEqual([]);
      }
    }
  });

  it("несе річ: річ у руці рівно (кут гнізда held у світі ≈ 0) за будь-якої основної й ракурсу", () => {
    for (const name of BASES) {
      const made = personWithArms(anim(name), "carry", name) as LooseAnim;
      for (const view of VIEWS) {
        const rig = rigFor(view);
        rig.play(made, 0, { blend: 0 });
        for (let t = 0; t <= made.duration; t += made.duration / 40) {
          rig.evaluate(t);
          expect(Math.abs(rig.socket("held", undefined, false)?.rot ?? NaN), `${name} ${view} @${t}`).toBeLessThan(0.5);
        }
      }
    }
  });

  it("несе річ: річ рівно й у стрункої та кремезної статури — товщину рук дає шкіра руки, кисть її не успадковує", () => {
    for (const build of ["slim", "stocky"]) {
      for (const name of BASES) {
        const made = personWithArms(anim(name), "carry", name) as LooseAnim;
        for (const view of VIEWS) {
          const rig = rigFor(view, [build]);
          rig.play(made, 0, { blend: 0 });
          for (let t = 0; t <= made.duration; t += made.duration / 20) {
            rig.evaluate(t);
            expect(Math.abs(rig.socket("held", undefined, false)?.rot ?? NaN), `${build} ${name} ${view} @${t}`).toBeLessThan(0.5);
          }
        }
      }
    }
  });

  it("несе річ: розмах рук ходи й ривка річ не підкидає — кисть нерухома відносно плеча", () => {
    for (const name of BASES) {
      const made = personWithArms(anim(name), "carry", name) as LooseAnim;
      for (const view of VIEWS) {
        const rig = rigFor(view);
        rig.play(made, 0, { blend: 0 });
        const offsets: { x: number; y: number }[] = [];
        for (let t = 0; t <= made.duration; t += made.duration / 40) {
          rig.evaluate(t);
          const hand = rig.anchor("hands", { x: 0, y: 0 }, false);
          const shoulder = rig.bone("arm-near").world;
          offsets.push({ x: (hand?.x ?? 0) - shoulder.tx, y: (hand?.y ?? 0) - shoulder.ty });
        }
        const spread = (pick: (o: { x: number; y: number }) => number): number => Math.max(...offsets.map(pick)) - Math.min(...offsets.map(pick));
        expect(spread((o) => o.x), `${name} ${view} x`).toBeLessThan(0.5);
        expect(spread((o) => o.y), `${name} ${view} y`).toBeLessThan(0.5);
      }
    }
  });

  it("тримає кота: кисті нерухомі відносно кота в гнізді arms (не тицяють і не проходять крізь нього)", () => {
    for (const name of BASES) {
      const made = personWithArms(anim(name), "holdCat", name) as LooseAnim;
      for (const view of VIEWS) {
        const rig = rigFor(view);
        rig.play(made, 0, { blend: 0 });
        let first: { x: number; y: number } | null = null;
        for (let t = 0; t <= made.duration; t += made.duration / 40) {
          rig.evaluate(t);
          const arms = rig.socket("arms", undefined, false);
          const hand = rig.anchor("hands", { x: 0, y: 0 }, false);
          if (!arms || !hand) throw new Error("немає гнізда чи якоря");
          // Кисть у системі гнізда (він повертається з тулубом).
          const a = (-arms.rot * Math.PI) / 180;
          const dx = hand.x - arms.x;
          const dy = hand.y - arms.y;
          const local = { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
          first ??= local;
          expect(Math.hypot(local.x - first.x, local.y - first.y), `${name} ${view} @${t}`).toBeLessThan(0.5);
        }
      }
    }
  });
});

describe("рух персонажа: бере й опускає кота — кіт іде в руки, а не стрибає в гніздо (контракт personCatLift)", () => {
  it("personCatLift: pickUp — 0 до «підхопив», далі плавно до 1; putDown — з 1 плавно до 0 у «відпустив»", () => {
    let prev = 0;
    for (let t = 0; t <= ANIMS.pickUp.duration; t += 5) {
      const w = personCatLift("pickUp", t);
      if (t <= PERSON_PICKUP_GRAB_MS) expect(w, `pickUp @${t}`).toBe(0);
      expect(w, `pickUp @${t}`).toBeGreaterThanOrEqual(prev);
      // Плавно: за 5 мс — не більше ніж на 0,05.
      expect(w - prev, `pickUp @${t}`).toBeLessThan(0.05);
      prev = w;
    }
    expect(personCatLift("pickUp", ANIMS.pickUp.duration)).toBe(1);
    prev = 1;
    for (let t = 0; t <= ANIMS.putDown.duration; t += 5) {
      const w = personCatLift("putDown", t);
      if (t >= PERSON_PUTDOWN_RELEASE_MS) expect(w, `putDown @${t}`).toBe(0);
      expect(w, `putDown @${t}`).toBeLessThanOrEqual(prev);
      expect(prev - w, `putDown @${t}`).toBeLessThan(0.05);
      prev = w;
    }
    expect(personCatLift("putDown", 0)).toBe(1);
  });

  it("personCatGrip — якір hands у мить «підхопив»; у putDown «відпустив» — та сама поза", () => {
    for (const view of VIEWS) {
      for (const proportions of [[], ["stocky"]]) {
        const grip = personCatGrip(view, proportions);
        for (const [name, t] of [["pickUp", PERSON_PICKUP_GRAB_MS], ["putDown", PERSON_PUTDOWN_RELEASE_MS]] as const) {
          const rig = rigFor(view, proportions);
          rig.play(ANIMS[name], 0, { blend: 0 });
          rig.evaluate(t);
          const hand = rig.anchor("hands", { x: 0, y: 0 }, false);
          expect(Math.hypot((hand?.x ?? NaN) - grip.x, (hand?.y ?? NaN) - grip.y), `${name} ${view} ${proportions.join()}`).toBeLessThan(0.1);
        }
      }
    }
  });

  it("кіт за контрактом не стрибає й не висить носом донизу, кисті весь час на ньому; у мить «підхопив» обидві кисті на коті", () => {
    for (const view of VIEWS) {
      for (const kitten of [0, 1]) {
        const cat = catAt(kitten);
        const body = cat.rig.bone("body");
        const points = [
          cat.pet,
          { x: body.world.tx, y: body.world.ty },
          { x: body.world.a * body.len + body.world.tx, y: body.world.b * body.len + body.world.ty },
          { x: 0, y: 0 },
        ];
        const grip = personCatGrip(view);
        // Місце кота на підлозі: гніздо pet — у точці, де кисті підхоплюють.
        const floor = { x: grip.x - cat.pet.x, y: grip.y - cat.pet.y };
        for (const name of ["pickUp", "putDown"] as const) {
          const rig = rigFor(view);
          rig.play(ANIMS[name], 0, { blend: 0 });
          let prev: { x: number; y: number } | null = null;
          for (let t = 0; t <= ANIMS[name].duration; t += 10) {
            rig.evaluate(t);
            const w = personCatLift(name, t);
            const arms = rig.socket("arms", undefined, false);
            if (!arms) throw new Error("немає гнізда arms");
            const root = { x: floor.x + (arms.x - floor.x) * w, y: floor.y + (arms.y - floor.y) * w };
            const rot = w * arms.rot;
            const label = `${name} ${view} кошеня ${kitten} @${t}`;
            // Не стрибає: за 10 мс — не більше ніж на 8 од. (≈ 13 од. за кадр), і не висить носом донизу.
            if (prev) expect(Math.hypot(root.x - prev.x, root.y - prev.y), label).toBeLessThan(8);
            prev = root;
            expect(Math.abs(rot), label).toBeLessThan(12);
            const c = Math.cos((rot * Math.PI) / 180);
            const s = Math.sin((rot * Math.PI) / 180);
            const near = (p: { x: number; y: number }): number =>
              Math.min(...points.map((q) => Math.hypot(p.x - (root.x + q.x * c - q.y * s), p.y - (root.y + q.x * s + q.y * c))));
            const hand = rig.anchor("hands", { x: 0, y: 0 }, false) ?? { x: NaN, y: NaN };
            const held = name === "pickUp" ? t >= PERSON_PICKUP_GRAB_MS : t <= PERSON_PUTDOWN_RELEASE_MS;
            // Поки кіт у руках чи йде в них — ближня кисть на ньому.
            if (held) expect(near(hand), label).toBeLessThan(18);
            const grab = name === "pickUp" ? PERSON_PICKUP_GRAB_MS : PERSON_PUTDOWN_RELEASE_MS;
            if (t === grab) {
              // «Підхопив» / «відпустив»: кіт ще на підлозі (жодного стрибка), ближня кисть — на спинці, дальня (спереду її
              // видно) — під грудьми кота.
              expect(Math.hypot(root.x - floor.x, root.y - floor.y), label).toBeLessThan(0.01);
              expect(near(hand), label).toBeLessThan(1);
              const far = rig.bone("hand-far");
              if (view === "front") expect(near({ x: far.world.a * far.len + far.world.tx, y: far.world.b * far.len + far.world.ty }), label).toBeLessThan(18);
            }
          }
        }
      }
    }
  });
});
