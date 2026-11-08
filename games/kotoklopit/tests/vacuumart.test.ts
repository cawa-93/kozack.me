// Арт пилососа (рішення автора 2026-11-02, GAME_DESIGN §8.7 «Пилосос у руках»; пакет «Арт пилососа»): вертикальний пилосос,
// що стоїть на підлозі (`env/vacuum`), пилосос у руках (`item/vacuum`, ракурси front і back) і накладка рук `holdVacuum`
// (`personWithArms`): кулак на ручці, щітка на підлозі попереду й не відривається від неї в ході; іконка `icon/vacuum`.

import { describe, expect, it } from "vitest";

import { ICON_NAMES } from "../src/view/iconnames";
import { PERSON_OVERLAYS } from "../src/view/anim/ids";
import { artEntry } from "../src/view/art/manifest";
import { newGame } from "../src/sim/game";
import { personAnim } from "../src/view/anim/personanim";
import { heldFrame, sweepDustState } from "../src/view/iso/personlook";
import type { ArtView } from "../src/view/art/types";
import { PERSON_ANIMS } from "../src/view/rig/anims";
import { PERSON_MOVE, personVacuumBrush, personWithArms } from "../src/view/rig/anims/person/move";
import { PERSON_FIT, PERSON_RIG } from "../src/view/rig/defs/person";
import { entryPoint, Rig } from "../src/view/rig/rigcore";
import type { RigAnim } from "../src/view/rig/types";

type LooseAnim = RigAnim<string, string>;
type LooseRig = Rig<string, string, string>;
type Name = keyof typeof PERSON_MOVE;

const VIEWS: readonly ArtView[] = ["front", "back"];
const DEG = Math.PI / 180;
/** Підлога попереду в умовному ¾ скелета (як у справах N4b і `move.ts`). */
const SLOPE = 0.3 / 0.85;

/** Скелет за числами визначення, як у `move.ts`, чи з точками арту, як у грі. */
function rigFor(view: ArtView, art: boolean, proportions: string[] = []): LooseRig {
  const opts = art ? { fit: PERSON_FIT, lookup: artEntry } : {};
  return new Rig(PERSON_RIG, { ...opts, facing: { view, flip: false }, proportions }) as unknown as LooseRig;
}

/** Щітка в системі кореня: гніздо `held` + точка щітки, повернута разом із гніздом. */
function brushAt(rig: LooseRig, view: ArtView): { x: number; y: number; rot: number; fist: { x: number; y: number } } {
  const s = rig.socket("held", undefined, false);
  if (!s) throw new Error("немає гнізда held");
  const b = personVacuumBrush(view);
  const c = Math.cos(s.rot * DEG);
  const sn = Math.sin(s.rot * DEG);
  return { x: s.x + b.x * c - b.y * sn, y: s.y + b.x * sn + b.y * c, rot: s.rot, fist: { x: s.x, y: s.y } };
}

describe("пилосос: кадри", () => {
  it("на підлозі — `env/vacuum` без станів, полотно сліду 1 × 1 і висоти 98, хват на ручці", () => {
    const e = artEntry("env/vacuum");
    expect(e?.states).toBeUndefined();
    expect(e?.size).toEqual({ w: 144, h: 178 });
    expect(e?.pivot).toEqual({ x: 72, y: 138 });
    const grip = e?.points?.["grip"];
    // Хват — угорі, на висоті ручки (≈ 90 над підлогою), ліворуч від середини щітки (ручка-петля відхилена назад).
    expect((e?.pivot.y ?? 0) - (grip?.y ?? 0)).toBeGreaterThan(85);
    expect(grip?.x ?? 0).toBeLessThan(e?.pivot.x ?? 0);
  });

  it("у руках — `item/vacuum` з ракурсами front і back, pivot — хват, щітка нижче й правіше; ззаду — вище, ніж спереду", () => {
    const e = artEntry("item/vacuum");
    expect(e?.views).toEqual(["front", "back"]);
    expect(e?.states).toBeUndefined();
    const front = entryPoint(e, "brush", "front");
    const back = entryPoint(e, "brush", "back");
    expect(front && back).toBeTruthy();
    for (const p of [front, back]) {
      expect((p?.x ?? 0) - (e?.pivot.x ?? 0)).toBeGreaterThan(40);
      expect((p?.y ?? 0) - (e?.pivot.y ?? 0)).toBeGreaterThan(25);
    }
    expect((back?.y ?? 0) + 20).toBeLessThan(front?.y ?? 0);
    expect(personVacuumBrush("front")).toEqual({ x: (front?.x ?? 0) - (e?.pivot.x ?? 0), y: (front?.y ?? 0) - (e?.pivot.y ?? 0) });
  });

  it("іконка `icon/vacuum` — назва в ICON_NAMES і запис у маніфесті", () => {
    expect(ICON_NAMES).toContain("vacuum");
    expect(artEntry("icon/vacuum")?.size).toEqual({ w: 64, h: 64 });
  });

  it("віник — той самий контракт, що в пилососа: накладка рук і нахил у кулаці спільні", () => {
    const broom = artEntry("item/broom");
    const vacuum = artEntry("item/vacuum");
    expect(broom?.size).toEqual(vacuum?.size);
    expect(broom?.pivot).toEqual(vacuum?.pivot);
    expect(broom?.points).toEqual(vacuum?.points);
    expect(broom?.views).toEqual(vacuum?.views);
    expect(artEntry("env/broom")?.size).toEqual(artEntry("env/vacuum")?.size);
    expect(artEntry("env/broom")?.pivot).toEqual(artEntry("env/vacuum")?.pivot);
  });

  it("у руках — кадр того інструмента, що зараз удома", () => {
    const held = { kind: "vacuum" } as const;
    expect(heldFrame(held, null, "broom")?.frame.id).toBe("item/broom");
    expect(heldFrame(held, null, "vacuum")?.frame.id).toBe("item/vacuum");
  });

  it("накладка за інструментом: віник підмітає, пилосос ні", () => {
    const state = newGame({ address: "she", difficulty: "normal", seed: 8 }).current;
    state.character.held = { kind: "vacuum", minutes: 0 };
    expect(personAnim(state, { moving: false, sleepiness: 0 }).overlay).toBe("holdBroom");
    state.home.appliances.vacuum = "cheap";
    expect(personAnim(state, { moving: false, sleepiness: 0 }).overlay).toBe("holdVacuum");
  });

  it("пил з-під віника йде по колу всіх кадрів `fx/sweep-dust`", () => {
    const frames = new Set(Array.from({ length: 30 }, (_, i) => sweepDustState(i * 60)));
    expect([...frames].sort()).toEqual(artEntry("fx/sweep-dust")?.states);
  });
});

describe("пилосос у руках: накладка `holdVacuum`", () => {
  // Стоїть і ходить (стопи на підлозі): щітка на лінії підлоги; разові (вкусили, відмова, спіткнувся, посковзнувся) —
  // лише нахил у межах (таз падає далі, ніж пилосос може нахилитися).
  const FLOOR: readonly Name[] = ["idle", "walk", "dash", "trudge", "limp", "exhausted", "sick", "dizzy"];
  const ONE_SHOTS: readonly Name[] = ["bitten", "refuse", "trip", "slip"];

  it("накладка — у переліку накладок і в реєстрі; для анімацій, що самі ведуть руки, — основна як є", () => {
    expect(PERSON_OVERLAYS.has("holdVacuum")).toBe(true);
    expect(PERSON_ANIMS.holdVacuum).toBe(PERSON_MOVE.holdVacuum);
    expect(personWithArms(PERSON_ANIMS.litter, "holdVacuum", "litter")).toBe(PERSON_ANIMS.litter);
    expect(personWithArms(PERSON_ANIMS.walk, "holdVacuum", "walk")).toBe(personWithArms(PERSON_ANIMS.walk, "holdVacuum", "walk"));
  });

  it("щітка на підлозі попереду: спереду нижче за ступні, ззаду вище; праворуч від кулака", () => {
    for (const view of VIEWS) {
      const rig = rigFor(view, true);
      rig.play(PERSON_MOVE.holdVacuum as unknown as LooseAnim, 0, { blend: 0 });
      rig.evaluate(0);
      const b = brushAt(rig, view);
      expect(b.x - b.fist.x, view).toBeGreaterThan(40);
      expect(b.x, view).toBeGreaterThan(55);
      // На підлозі на глибині щітки: спереду — на 4…40 нижче за лінію ступень, ззаду — на 4…40 вище.
      const depth = view === "front" ? b.y : -b.y;
      expect(depth, view).toBeGreaterThan(4);
      expect(depth, view).toBeLessThan(40);
      // Кулак — на рівні пояса (≈ 55–70 над підлогою).
      expect(-b.fist.y, view).toBeGreaterThan(52);
      expect(-b.fist.y, view).toBeLessThan(72);
    }
  });

  it("у ході й стоянні щітка не відривається від підлоги (±1,5 од. від лінії підлоги), пилосос хилиться не більше ніж на 28°", () => {
    for (const art of [false, true]) {
      for (const view of VIEWS) {
        const rest = rigFor(view, art);
        rest.play(PERSON_MOVE.holdVacuum as unknown as LooseAnim, 0, { blend: 0 });
        rest.evaluate(0);
        const r = brushAt(rest, view);
        const slope = view === "front" ? SLOPE : -SLOPE;
        for (const name of [...FLOOR, ...ONE_SHOTS]) {
          const made = personWithArms(PERSON_MOVE[name], "holdVacuum", name) as LooseAnim;
          const rig = rigFor(view, art);
          rig.play(made, 0, { blend: 0 });
          for (let t = 0; t <= made.duration; t += made.duration / 50) {
            rig.evaluate(t);
            const b = brushAt(rig, view);
            const label = `${name} ${view}${art ? " (арт)" : ""} @${Math.round(t)}`;
            expect(Math.abs(b.rot), label).toBeLessThanOrEqual(28.01);
            if (FLOOR.includes(name)) expect(Math.abs(b.y - (r.y + slope * (b.x - r.x))), label).toBeLessThan(name === "dash" ? 4 : 1.5);
          }
        }
      }
    }
  });

  it("стрункої й кремезної статури щітка теж на підлозі (товщину рук дає шкіра, кисть її не успадковує)", () => {
    for (const build of ["slim", "stocky"]) {
      for (const view of VIEWS) {
        const rest = rigFor(view, true, [build]);
        rest.play(PERSON_MOVE.holdVacuum as unknown as LooseAnim, 0, { blend: 0 });
        rest.evaluate(0);
        const r = brushAt(rest, view);
        const slope = view === "front" ? SLOPE : -SLOPE;
        const made = personWithArms(PERSON_MOVE.walk, "holdVacuum", "walk") as LooseAnim;
        const rig = rigFor(view, true, [build]);
        rig.play(made, 0, { blend: 0 });
        for (let t = 0; t <= made.duration; t += made.duration / 30) {
          rig.evaluate(t);
          const b = brushAt(rig, view);
          expect(Math.abs(b.y - (r.y + slope * (b.x - r.x))), `${build} ${view} @${Math.round(t)}`).toBeLessThan(1.5);
        }
      }
    }
  });

  it("кулак над ручкою: спереду ближня рука над гніздом `held`, ззаду пилосос за тулубом", () => {
    const order = (rig: LooseRig): string[] => rig.order.map((item) => item.id);
    const made = personWithArms(PERSON_MOVE.walk, "holdVacuum", "walk") as LooseAnim;
    const front = rigFor("front", true);
    front.play(made, 0, { blend: 0 });
    const f = order(front.evaluate(0));
    expect(f.indexOf("arm-near")).toBeGreaterThan(f.indexOf("held"));
    const back = rigFor("back", true);
    back.play(made, 0, { blend: 0 });
    const b = order(back.evaluate(0));
    expect(b.indexOf("held")).toBeLessThan(b.indexOf("torso"));
    expect(b.indexOf("arm-near")).toBeGreaterThan(b.indexOf("held"));
  });

  it("віник мете з боку в бік: кулак там само, де з пилососом, нахил у межах, петля не смикається", () => {
    for (const view of VIEWS) {
      for (const name of ["idle", "walk", "trudge", "limp"] as const) {
        const broom = personWithArms(PERSON_MOVE[name], "holdBroom", name) as LooseAnim;
        const vacuum = personWithArms(PERSON_MOVE[name], "holdVacuum", name) as LooseAnim;
        const a = rigFor(view, true);
        const b = rigFor(view, true);
        a.play(broom, 0, { blend: 0 });
        b.play(vacuum, 0, { blend: 0 });
        const xs: number[] = [];
        for (let i = 0; i <= 80; i++) {
          const t = (broom.duration * i) / 80;
          a.evaluate(t);
          b.evaluate(t);
          const swept = brushAt(a, view);
          const still = brushAt(b, view);
          const label = `${name} ${view} @${Math.round(t)}`;
          xs.push(swept.x - still.x);
          expect(Math.abs(swept.rot), label).toBeLessThanOrEqual(28.01);
          // Гніздо сидить у кисті трохи осторонь її оберту, тож ледь ворушиться разом із віником.
          expect(Math.hypot(swept.fist.x - still.fist.x, swept.fist.y - still.fist.y), label).toBeLessThan(1.5);
        }
        expect(Math.max(...xs) - Math.min(...xs), `${name} ${view}`).toBeGreaterThan(10);
        expect(Math.abs((xs[0] ?? 0) - (xs.at(-1) ?? 0)), `${name} ${view}`).toBeLessThan(1);
      }
    }
  });

  it("пилосос не підмітає: рука стоїть, щітка їде лише з ходою", () => {
    for (const view of VIEWS) {
      const made = personWithArms(PERSON_MOVE.idle, "holdVacuum", "idle") as LooseAnim;
      const rig = rigFor(view, true);
      rig.play(made, 0, { blend: 0 });
      const xs: number[] = [];
      for (let t = 0; t <= made.duration; t += made.duration / 60) {
        rig.evaluate(t);
        xs.push(brushAt(rig, view).x);
      }
      expect(Math.max(...xs) - Math.min(...xs), view).toBeLessThan(6);
    }
  });

  it("дальня рука — від основної: у ході махає, як без пилососа", () => {
    const walk = PERSON_MOVE.walk as unknown as LooseAnim;
    const made = personWithArms(PERSON_MOVE.walk, "holdVacuum", "walk") as LooseAnim;
    expect(made.bones?.["arm-far"]).toBe(walk.bones?.["arm-far"]);
    expect(made.views?.back?.bones?.["arm-far"]).toBe(walk.views?.back?.bones?.["arm-far"]);
  });
});
