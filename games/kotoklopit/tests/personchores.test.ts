// Анімації справ персонажа (крок 16, хвиля 2, пакет N4b; `src/view/rig/anims/person/chores.ts`): цикли без ривка на стику
// (ключі й поза перед кінцем); разові закінчуються вихідною позою, а там, де річ чи кіт у руках, — позами накладок (`carry`,
// `holdCat`); ступні стоять і не ковзають усередині циклу; руки не йдуть під підлогу; річ у руці рівно; щітка пилососа йде по
// підлозі й випереджає кулак; сидячи кіт на колінах — рівно над сидінням; купаючи, ближня рука на коті; засинаючи, персонаж
// лягає на ліжко; справи не беруть накладок рук (`PERSON_OWN_ARMS`), а телефон — лише з порожніми руками.

import { describe, expect, it } from "vitest";

import { createCat, idleAct } from "../src/sim/cat";
import { newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { PERSON_ANIM_GROUPS, PERSON_CONTACT_MS, PERSON_ONE_SHOT_MS, PERSON_OWN_ARMS, type PersonAnimId } from "../src/view/anim/ids";
import { personAnim, type PersonLocal } from "../src/view/anim/personanim";
import type { ArtView } from "../src/view/art/types";
import { PERSON_ANIMS } from "../src/view/rig/anims";
import { PERSON_CHORES, PERSON_SEAT } from "../src/view/rig/anims/person/chores";
import { levelHand, personArmsPose } from "../src/view/rig/anims/person/move";
import { SLEEP_TURN } from "../src/view/iso/personspot";
import { PERSON_RIG } from "../src/view/rig/defs/person";
import { Rig } from "../src/view/rig/rigcore";
import type { RigAnim } from "../src/view/rig/types";
import { isoObjectLook } from "../src/view/world/objects";
import { ISO_TILE } from "../src/view/world/projection";
import { withCatCorner } from "./helpers";

type Name = keyof typeof PERSON_CHORES;
type LooseAnim = RigAnim<string, string>;
type LooseRig = Rig<string, string, string>;
const ANIMS = PERSON_CHORES as unknown as Readonly<Record<Name, LooseAnim>>;
const NAMES = Object.keys(PERSON_CHORES) as Name[];
const VIEWS: readonly ArtView[] = ["front", "back"];
const BUILDS: readonly string[][] = [[], ["slim"], ["stocky"]];
const DEG = Math.PI / 180;
/** Найбільший крок голови за 10 мс анімації до розвороту до ліжка, одиниці арту: швидше читається як смикання. */
const HEAD_STEP_MAX = 3.5;

function rigFor(view: ArtView, proportions: string[] = []): LooseRig {
  return new Rig(PERSON_RIG, { facing: { view, flip: false }, proportions }) as unknown as LooseRig;
}

/** Початок кістки в системі кореня. */
function at(rig: LooseRig, id: string): { x: number; y: number } {
  const m = rig.bone(id).world;
  return { x: m.tx, y: m.ty };
}

/** Кут осі x кістки у світі, градуси. */
function angle(rig: LooseRig, id: string): number {
  const m = rig.bone(id).world;
  return Math.atan2(m.b, m.a) / DEG;
}

/** Світові перетворення всіх кісток (порівняти дві пози). */
function snapshot(rig: LooseRig): number[] {
  return rig.bones.flatMap((b) => [b.world.a, b.world.b, b.world.c, b.world.d, b.world.tx, b.world.ty]);
}

function gap(a: readonly number[], b: readonly number[]): number {
  return Math.max(...a.map((v, i) => Math.abs(v - (b[i] ?? 0))));
}

/** Поза скелета, що грає `anim` у момент `t` (без змішування). */
function poseAt(view: ArtView, anim: LooseAnim | null, t: number, proportions: string[] = []): LooseRig {
  const rig = rigFor(view, proportions);
  rig.play(anim, 0, { blend: 0 });
  rig.evaluate(t);
  return rig;
}

/** Моменти анімації з кроком. */
function times(anim: LooseAnim, n = 60): number[] {
  return Array.from({ length: n + 1 }, (_, i) => (anim.duration * i) / n);
}

/** Кінці кісток (початок і кінець кожної) у системі кореня: порівняти дві пози в одиницях арту. */
function ends(rig: LooseRig): number[] {
  return PERSON_RIG.bones.flatMap((def) => {
    const m = rig.bone(def.id).world;
    return [m.tx, m.ty, m.tx + m.a * def.len, m.ty + m.b * def.len];
  });
}

/** Де купаючи ближня рука намилює кота — точка кота від його кореня (як у `bath`, `chores.ts`). */
const BATH_SPOT: Readonly<Record<ArtView, { x: number; y: number }>> = { front: { x: 8, y: -14 }, back: { x: 26, y: -24 } };

/** Поза рук накладки (`move.ts`, N4a): кути, вкорочення, кисті — назад на кут руки з поправкою на вкорочення (`levelHand`). */
const CARRY = { front: personArmsPose("carry", "front"), back: personArmsPose("carry", "back") };
const HOLD = { front: personArmsPose("holdCat", "front"), back: personArmsPose("holdCat", "back") };

/** Анімація з нерухомою позою рук накладки (з вихідними тулубом і ногами). */
function armsAnim(a: { near: number; far: number; nearScale?: number; farScale?: number }): LooseAnim {
  const k = (v: number) => [{ t: 0, v }];
  const s = (x: number) => [{ t: 0, v: { x, y: 1 } }];
  return {
    duration: 100,
    loop: false,
    bones: {
      "arm-near": { rot: k(a.near), scale: s(a.nearScale ?? 1) },
      "hand-near": { rot: k(levelHand(a.near, a.nearScale)) },
      "arm-far": { rot: k(a.far), scale: s(a.farScale ?? 1) },
      "hand-far": { rot: k(levelHand(a.far, a.farScale)) },
    },
  };
}

/** Анімація накладки з реєстру, якщо вона вже не заглушка (з доріжками рук), — після зведення з N4a поза береться з неї. */
function overlayPose(id: "carry" | "holdCat", view: ArtView): LooseAnim {
  const real = PERSON_ANIMS[id] as LooseAnim;
  const tracks = view === "back" ? (real.views?.back?.bones ?? real.bones) : real.bones;
  if (tracks?.["arm-near"]?.rot) return real;
  return armsAnim(id === "carry" ? CARRY[view] : HOLD[view]);
}

describe("справи персонажа: стики", () => {
  it("по колу — без ривка на стику: перший і останній ключі кожної доріжки однакові (обидва ракурси), останній — на кінці", () => {
    for (const name of NAMES) {
      const anim = ANIMS[name];
      if (!anim.loop) continue;
      for (const [label, tracks] of [
        ["front", anim.bones],
        ["back", anim.views?.back?.bones],
      ] as const) {
        for (const [bone, track] of Object.entries(tracks ?? {})) {
          for (const prop of ["rot", "pos", "scale"] as const) {
            const keys = track?.[prop] as readonly { t: number; v: number | { x: number; y: number } }[] | undefined;
            if (!keys || keys.length < 2) continue;
            const at = `${name} ${label} ${bone}.${prop}`;
            const first = keys[0]!;
            const last = keys[keys.length - 1]!;
            expect(last.t, `${at}: останній ключ`).toBe(anim.duration);
            if (typeof first.v === "number" && typeof last.v === "number") {
              // Кут — по колу: 360° — той самий кут.
              const d = (((last.v - first.v) % 360) + 540) % 360 - 180;
              expect(Math.abs(d), at).toBeLessThan(1e-6);
            } else {
              expect(last.v, at).toEqual(first.v);
            }
          }
        }
      }
    }
  });

  it("по колу — поза за мить до кінця циклу збігається з позою на початку (кінці кісток, ≤ 0,5)", () => {
    // `Rig` загортає час циклу: поза в `duration` — це поза в 0, тож стик видно лише перед кінцем.
    for (const view of VIEWS) {
      for (const name of NAMES) {
        const anim = ANIMS[name];
        if (!anim.loop) continue;
        expect(gap(ends(poseAt(view, anim, anim.duration - 0.5)), ends(poseAt(view, anim, 0))), `${view} ${name}: стик`).toBeLessThan(0.5);
      }
    }
  });

  it("разові — вихідною позою, «бере» — позою «несе», «миски» — з рук коло себе, «доглядає кота» — «тримає кота»", () => {
    for (const view of VIEWS) {
      const rest = snapshot(poseAt(view, null, 0));
      for (const name of NAMES) {
        const anim = ANIMS[name];
        if (anim.loop) continue;
        const first = snapshot(poseAt(view, anim, 0));
        const last = snapshot(poseAt(view, anim, anim.duration));
        if (name === "fallAsleep" || name === "collapse") {
          expect(gap(first, rest), `${view} ${name}: початок`).toBeLessThan(1e-6);
          continue;
        }
        const carry = snapshot(poseAt(view, overlayPose("carry", view), 0));
        const hold = snapshot(poseAt(view, overlayPose("holdCat", view), 0));
        // «Миски»: посередині між вихідною позою й «несе» (`halfCarry`) — совок несуть, а воду й годівницю — ні.
        const c = CARRY[view];
        const half = snapshot(poseAt(view, armsAnim({ near: c.near / 2, far: c.far / 2, nearScale: (1 + (c.nearScale ?? 1)) / 2, farScale: (1 + (c.farScale ?? 1)) / 2 }), 0));
        const start = name === "put" || name === "trash" ? carry : name === "bowl" ? half : name === "tend" ? hold : rest;
        const end = name === "take" ? carry : name === "tend" ? hold : rest;
        expect(gap(first, start), `${view} ${name}: початок`).toBeLessThan(1e-3);
        expect(gap(last, end), `${view} ${name}: кінець`).toBeLessThan(1e-3);
      }
    }
  });

  it("мить дотику — ключ анімації всередині разової", () => {
    for (const [name, ms] of Object.entries(PERSON_CONTACT_MS)) {
      const anim = ANIMS[name as Name];
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThan(PERSON_ONE_SHOT_MS[name as keyof typeof PERSON_ONE_SHOT_MS]);
      const keys = anim.bones?.["arm-near"]?.rot?.map((k) => k.t) ?? [];
      expect(keys, name).toContain(ms);
    }
  });
});

describe("справи персонажа: ступні й руки", () => {
  it("ступні не ковзають усередині анімації (усі статури, обидва ракурси); у ¾ ззаду руки не нижче підлоги", () => {
    for (const view of VIEWS) {
      for (const proportions of BUILDS) {
        for (const name of NAMES) {
          const anim = ANIMS[name];
          const rig = rigFor(view, proportions);
          rig.play(anim, 0, { blend: 0 });
          rig.evaluate(0);
          const start = { near: at(rig, "foot-near"), far: at(rig, "foot-far") };
          for (const t of times(anim)) {
            rig.evaluate(t);
            for (const foot of ["near", "far"] as const) {
              const now = at(rig, `foot-${foot}`);
              const label = `${view} ${proportions.join() || "звичайна"} ${name} ${foot} @${Math.round(t)}`;
              expect(Math.hypot(now.x - start[foot].x, now.y - start[foot].y), `${label}: ковзає`).toBeLessThan(0.6);
            }
            // У ¾ ззаду підлога попереду вище на екрані, тож рука, нижча за лінію ступень, — під підлогою. (У ¾ спереду
            // підлога попереду нижча, і рука біля неї там на екрані нижче ступень.)
            if (view !== "back") continue;
            for (const hand of ["hand-near", "hand-far"]) expect(at(rig, hand).y, `${view} ${name} ${hand} @${Math.round(t)}`).toBeLessThan(1);
            expect(rig.anchor("hands")?.y ?? 0, `${view} ${name} кулак @${Math.round(t)}`).toBeLessThan(1);
          }
        }
      }
    }
  });

  it("стоячи ступні — на вихідних місцях (крім справ, де ступні розставлені: лоток, дріт, сидячи)", () => {
    const placed = new Set<Name>(["litter", "fix", "work", "meeting", "eat"]);
    for (const view of VIEWS) {
      const rest = poseAt(view, null, 0);
      for (const name of NAMES) {
        if (placed.has(name)) continue;
        const rig = poseAt(view, ANIMS[name], 0);
        for (const foot of ["foot-near", "foot-far"]) {
          const a = at(rig, foot);
          const b = at(rest, foot);
          expect(Math.hypot(a.x - b.x, a.y - b.y), `${view} ${name} ${foot}`).toBeLessThan(0.6);
        }
      }
    }
  });
});

describe("справи персонажа: річ у руці", () => {
  it("бере (від дотику), кладе (до дотику), викидає й насипає (до замаху): річ рівно", () => {
    const spans: [Name, number, number][] = [
      ["take", PERSON_CONTACT_MS.take, PERSON_ONE_SHOT_MS.take],
      ["put", 0, PERSON_CONTACT_MS.put],
      ["trash", 0, 150],
      ["bowl", 0, 230],
    ];
    for (const view of VIEWS) {
      for (const [name, from, to] of spans) {
        const rig = rigFor(view);
        rig.play(ANIMS[name], 0, { blend: 0 });
        for (let t = from; t <= to; t += (to - from) / 20) {
          rig.evaluate(t);
          expect(Math.abs(rig.socket("held")?.rot ?? 0), `${view} ${name} @${Math.round(t)}`).toBeLessThan(10);
        }
      }
    }
  });

  it("річ у руках спереду — на кулаці, поверх руки; телефон біля вуха кулак тримає поверх нього", () => {
    const order = (rig: LooseRig): string[] => rig.order.map((item) => item.id);
    for (const name of NAMES) {
      const rig = rigFor("front");
      rig.play(ANIMS[name], 0, { blend: 0 });
      const ids = order(rig.evaluate(0));
      const over = name === "phone";
      expect(ids.indexOf("arm-near") > ids.indexOf("held"), name).toBe(over);
    }
    // Ззаду річ і телефон — за тулубом, як і були.
    const back = rigFor("back");
    back.play(ANIMS.phone, 0, { blend: 0 });
    const ids = order(back.evaluate(0));
    expect(ids.indexOf("held")).toBeLessThan(ids.indexOf("torso"));
  });
});

describe("справи персонажа: сидить", () => {
  it("кіт на колінах (`lap`) — рівно, над сидінням, перед тазом; гомілка — до підлоги", () => {
    for (const name of ["work", "meeting", "eat"] as const) {
      for (const view of VIEWS) {
        for (const proportions of BUILDS) {
          const rest = poseAt(view, null, 0, proportions);
          const anim = ANIMS[name];
          const rig = rigFor(view, proportions);
          rig.play(anim, 0, { blend: 0 });
          for (const t of times(anim, 24)) {
            rig.evaluate(t);
            const lap = rig.socket("lap");
            if (!lap) throw new Error("немає гнізда lap");
            const label = `${name} ${view} ${proportions.join() || "звичайна"} @${Math.round(t)}`;
            expect(Math.abs(lap.rot), `${label}: кут`).toBeLessThanOrEqual(5);
            expect(-lap.y, `${label}: висота`).toBeGreaterThanOrEqual(PERSON_SEAT + 8);
            expect(-lap.y, `${label}: висота`).toBeLessThanOrEqual(PERSON_SEAT + 14);
            expect(lap.x, `${label}: уперед`).toBeGreaterThan(6);
            // Таз — на сидінні: низ таза (≈ 12 під центром) на висоті сидіння.
            expect(Math.abs(-at(rig, "pelvis").y - 12 - PERSON_SEAT), `${label}: таз`).toBeLessThan(0.5);
            // Ближнє стегно лежить рівно, гомілка (дальня нога) — від коліна до підлоги.
            expect(Math.abs(angle(rig, "leg-near")), `${label}: стегно`).toBeLessThan(1);
            expect(Math.abs(at(rig, "foot-far").y - at(rest, "foot-near").y), `${label}: черевик на підлозі`).toBeLessThan(0.6);
          }
          // Ближнього черевика сидячи не видно: ближня нога — лише стегно.
          expect(rig.slot("shoe-near").visible, `${name} ${view}`).toBe(false);
        }
      }
    }
  });
});

describe("справи персонажа: кіт на руках", () => {
  it("купає: дальня рука — у позі «тримає кота», ближня — на коті; нахил ≤ 18°", () => {
    for (const view of VIEWS) {
      const anim = ANIMS.bath;
      const rig = rigFor(view);
      rig.play(anim, 0, { blend: 0 });
      const hold = HOLD[view];
      for (const t of times(anim)) {
        rig.evaluate(t);
        const torso = angle(rig, "torso") + 90;
        expect(Math.abs(torso), `${view} нахил @${Math.round(t)}`).toBeLessThanOrEqual(18);
        // Дальня рука — відносно тулуба, як у «тримає кота».
        expect(angle(rig, "arm-far") - angle(rig, "torso") - 180 - hold.far, `${view} дальня @${Math.round(t)}`).toBeCloseTo(0, 0);
        // Кулак ближньої — на коті: біля точки, яку намилює (`BATH_SPOT` від кореня кота в гнізді `arms`).
        const cat = rig.socket("arms");
        const fist = rig.anchor("hands");
        if (!cat || !fist) throw new Error("немає гнізда arms чи якоря hands");
        const spot = BATH_SPOT[view];
        expect(Math.hypot(fist.x - (cat.x + spot.x), fist.y - (cat.y + spot.y)), `${view} кулак @${Math.round(t)}`).toBeLessThan(16);
      }
    }
  });

  it("доглядає кота: ближня рука підносить ліки до рота кота (≈ 21 уперед і 23 угору від його кореня)", () => {
    for (const view of VIEWS) {
      const anim = ANIMS.tend;
      const rig = rigFor(view);
      rig.play(anim, 0, { blend: 0 });
      rig.evaluate(380);
      const cat = rig.socket("arms");
      const fist = rig.anchor("hands");
      if (!cat || !fist) throw new Error("немає гнізда arms чи якоря hands");
      expect(Math.hypot(fist.x - (cat.x + 20), fist.y - (cat.y - 23)), view).toBeLessThan(12);
    }
  });
});

describe("справи персонажа: засинає", () => {
  it("лягає на ліжко: таз над краєм матраца, тулуб уздовж осі плитки, маківка над ліжком, ступні на підлозі", () => {
    const bed = isoObjectLook("bed");
    const use = bed.use;
    if (!use) throw new Error("біля ліжка немає місця персонажа");
    const tile = Math.hypot(ISO_TILE.width, ISO_TILE.height) / 2;
    const slope = Math.atan2(ISO_TILE.height, ISO_TILE.width) / DEG;
    // Персонаж стоїть збоку ліжка лицем до нього (−x): ближній край і стіна — уздовж осі плитки.
    const edge = (use.at.x - bed.footprint.x1) * tile;
    const far = (use.at.x - bed.footprint.x0) * tile;
    const rig = poseAt("back", ANIMS.fallAsleep, ANIMS.fallAsleep.duration);
    expect(angle(rig, "torso")).toBeCloseTo(-slope, 0);
    const pelvis = at(rig, "pelvis");
    const along = pelvis.x / Math.cos(slope * DEG);
    expect(along).toBeGreaterThan(edge * 0.6);
    expect(along).toBeLessThan(edge);
    // Таз — над матрацом (висота над підлогою під ним).
    expect(-pelvis.y - along * Math.sin(slope * DEG)).toBeGreaterThan(bed.top);
    const head = rig.anchor("head");
    if (!head) throw new Error("немає якоря head");
    const reach = head.x / Math.cos(slope * DEG);
    expect(reach).toBeGreaterThan(edge);
    expect(reach).toBeLessThan(far + 10);
  });

  it("обертається до ліжка у вихідній позі, а голова не смикається", () => {
    const anim = ANIMS.fallAsleep;
    const turn = SLEEP_TURN * anim.duration;
    // Ракурс міняється одним кадром і дзеркалить персонажа: нахил у цю мить перекинув би голову на другий бік.
    for (const view of VIEWS) {
      const rest = snapshot(poseAt(view, null, 0));
      for (const t of [turn - 20, turn, turn + 20]) expect(gap(snapshot(poseAt(view, anim, t)), rest), `${view} ${t}`).toBeLessThan(1e-3);
    }
    const headAt = (rig: LooseRig, t: number): { x: number; y: number } => {
      rig.evaluate(t);
      const head = rig.anchor("head");
      if (!head) throw new Error("немає якоря head");
      return { x: head.x, y: head.y };
    };
    // Лицем до кімнати голова рухається сонно: без різкого кроку.
    const front = rigFor("front");
    front.play(anim, 0, { blend: 0 });
    for (let t = 10; t <= turn; t += 10) {
      const was = headAt(front, t - 10);
      const now = headAt(front, t);
      expect(Math.hypot(now.x - was.x, now.y - was.y), `${t}`).toBeLessThan(HEAD_STEP_MAX);
    }
    // Падаючи, голова йде лише до ліжка: рух назад посеред падіння читався б як ривок.
    const back = rigFor("back");
    back.play(anim, 0, { blend: 0 });
    for (let t = turn + 10; t <= anim.duration; t += 10) expect(headAt(back, t).x, `${t}`).toBeGreaterThanOrEqual(headAt(back, t - 10).x);
  });
});

describe("справи персонажа: накладки рук (`PERSON_OWN_ARMS`) і телефон", () => {
  const still: PersonLocal = { moving: false, sleepiness: 0 };

  it("справи й вудочка ведуть руки самі: накладки рук не беруть", () => {
    for (const id of PERSON_ANIM_GROUPS.chores) expect(PERSON_OWN_ARMS.has(id), id).toBe(true);
    for (const id of ["rod", "pickUp", "putDown"] as const satisfies readonly PersonAnimId[]) expect(PERSON_OWN_ARMS.has(id), id).toBe(true);
    expect(PERSON_OWN_ARMS.has("idle")).toBe(false);
    expect(PERSON_OWN_ARMS.has("walk")).toBe(false);
  });

  it("`personAnim`: робота з річчю, купання й вудочка — без накладки; телефон — лише з порожніми руками", () => {
    const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 9 }));
    const state = save.current;
    state.character.body = { ...state.character.body, x: 9.5, y: 8.5, facing: { x: 1, y: 0 } };
    state.character.activity = { kind: "work", progress: 0 } as unknown as typeof state.character.activity;
    state.character.held = { kind: "meal", quality: "cheap" };
    const work = personAnim(state, still);
    expect(work.anim === "work" || work.anim === "meeting").toBe(true);
    expect(work.overlay).toBeNull();

    const cat = createCat(state, createRng(2), { source: "shelter", ageWeeks: 20, at: { x: 9.6, y: 8.5 } });
    cat.act = idleAct(30);
    addCat(state, cat);
    state.character.held = { kind: "cat", cat: cat.id };
    state.character.activity = { kind: "use", target: "shower", progress: 0, inside: true, bath: true };
    expect(personAnim(state, still)).toMatchObject({ anim: "bath", overlay: null });

    state.character.activity = null;
    state.character.held = { kind: "toy", toy: { id: 99, kind: "toy", quality: "cheap", x: 0, y: 0, uses: 0 } };
    state.character.activity = { kind: "play", cat: cat.id, progress: 0 } as unknown as typeof state.character.activity;
    const rod = personAnim(state, still);
    if (rod.anim === "rod") expect(rod.overlay).toBeNull();

    state.character.activity = null;
    state.today.callPending = true;
    state.character.held = null;
    expect(personAnim(state, still)).toMatchObject({ anim: "phone", overlay: null });
    state.character.held = { kind: "cat", cat: cat.id };
    expect(personAnim(state, still)).toMatchObject({ anim: "idle", overlay: "holdCat" });
    state.character.held = { kind: "meal", quality: "cheap" };
    expect(personAnim(state, still)).toMatchObject({ anim: "idle", overlay: "carry" });
  });
});
