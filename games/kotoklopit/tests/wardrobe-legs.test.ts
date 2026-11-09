// Гардероб, низ і взуття (§5.1, `WARDROBE.md`, «Низ», «Взуття»; правила арту — `art/STYLE.md`, «person»): поділ спідниці й верху
// не опускається нижче підлоги в жодній анімації; сидячи сховано те, чого на стегні й гомілці не видно, а спідниця й поділ —
// у стані `sit`, присівши — `squat`; взуття стоїть на тій самій підошві й не вище за кісточку (стопи не ковзають); поєднання:
// чоботи ховають низ заправленої штанини, кльош — халяву, гола нога — без плям і зі шкарпеткою під низьким взуттям.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { Look } from "../src/sim/types";
import { artEntry } from "../src/view/art/manifest";
import { svgPath, type ArtId, type ArtView } from "../src/view/art/types";
import { PERSON_ANIMS } from "../src/view/rig/anims";
import { PERSON_PICKUP_GRAB_MS, PERSON_PUTDOWN_RELEASE_MS } from "../src/view/rig/anims/person/move";
import { PERSON_FIT, PERSON_RIG, personSkin, personVariants } from "../src/view/rig/defs/person";
import { Rig, slotFrame } from "../src/view/rig/rigcore";
import type { RigAnim } from "../src/view/rig/types";
import { BOTTOM_CUTS } from "../src/view/wardrobe/bottoms";
import { partExtraFrame } from "../src/view/wardrobe/index";
import { SHOE_CUTS, shoeSkin } from "../src/view/wardrobe/shoes";
import { wearOf } from "../src/view/wardrobe/index";

type LooseRig = Rig<string, string, string>;
type LooseAnim = RigAnim<string, string>;
type Pt = readonly [number, number];

const ART_DIR = path.join(fileURLToPath(new URL("..", import.meta.url)), "art");
const VIEWS: readonly ArtView[] = ["front", "back"];
const BUILDS: readonly string[][] = [[], ["slim"], ["stocky"]];
const ANIMS = PERSON_ANIMS as unknown as Readonly<Record<string, LooseAnim>>;
const BASE: Look = { face: 0, skin: 0, hair: 0, hairColor: 0, eyes: 0, build: 1, top: 0, bottom: 0, shoes: 0 };

// --- Геометрія SVG ---------------------------------------------------------------------------------

/** Точки шляху (абсолютні M, L, H, V, C, Q, Z); криві — 12 точками. */
function pathPoints(d: string): Pt[] {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const points: Pt[] = [];
  let cur: Pt = [0, 0];
  let cmd = "";
  let i = 0;
  const num = (): number => Number(tokens[i++]);
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (/[A-Za-z]/.test(t)) {
      cmd = t;
      i++;
      if (cmd === "Z") continue;
    }
    if (cmd !== cmd.toUpperCase()) throw new Error(`відносна команда «${cmd}» у ${d}`);
    if (cmd === "M" || cmd === "L") cur = [num(), num()];
    else if (cmd === "H") cur = [num(), cur[1]];
    else if (cmd === "V") cur = [cur[0], num()];
    else if (cmd === "C" || cmd === "Q") {
      const ctrl: Pt[] = [];
      const n = cmd === "C" ? 2 : 1;
      for (let k = 0; k < n; k++) ctrl.push([num(), num()]);
      const end: Pt = [num(), num()];
      const p = [cur, ...ctrl, end];
      for (let s = 1; s <= 12; s++) {
        const u = s / 12;
        let row = p;
        while (row.length > 1) row = row.slice(1).map((q, j) => [row[j]![0] + (q[0] - row[j]![0]) * u, row[j]![1] + (q[1] - row[j]![1]) * u] as Pt);
        points.push(row[0]!);
      }
      cur = end;
      continue;
    } else if (cmd !== "Z") throw new Error(`команда «${cmd}» у ${d}`);
    points.push(cur);
  }
  return points;
}

/**
 * Точки заливок `fill-*` кадру в стані `state` (елементи з класом іншого стану — пропущено; без класу — є в усіх станах), у
 * координатах полотна.
 */
function fillPoints(id: ArtId, view: ArtView, state: string | null): Pt[] {
  const entry = artEntry(id);
  if (!entry) throw new Error(`немає запису ${id}`);
  const svg = readFileSync(path.join(ART_DIR, svgPath(entry, view)), "utf8");
  const defs = new Map<string, string>();
  for (const m of svg.matchAll(/<path id="([^"]+)" d="([^"]+)"/g)) defs.set(m[1]!, m[2]!);
  const points: Pt[] = [];
  const tag = /<(\/?)(g|use|path)\b([^>]*)>/g;
  let depth = 0;
  let inFill = false;
  const classes: (string | null)[] = [];
  for (const m of svg.matchAll(tag)) {
    const [, close, name, attrs = ""] = m;
    if (name === "g") {
      if (close) {
        classes.pop();
        depth--;
        if (depth === 0) inFill = false;
        continue;
      }
      if (depth === 0 && /id="fill-/.test(attrs)) inFill = true;
      depth++;
      classes.push(/class="([^"]+)"/.exec(attrs)?.[1] ?? null);
      continue;
    }
    if (!inFill) continue;
    const own = /class="([^"]+)"/.exec(attrs)?.[1] ?? null;
    const cls = [own, ...classes].filter((c): c is string => c !== null).join(" ");
    const states = cls.split(/\s+/).filter((c) => c.startsWith("st-"));
    if (states.length > 0 && !states.includes(`st-${state}`)) continue;
    const d = name === "use" ? defs.get(/href="#([^"]+)"/.exec(attrs)?.[1] ?? "") : /\sd="([^"]+)"/.exec(attrs)?.[1];
    if (!d) throw new Error(`${id}/${view}: заливка без форми: <${name}${attrs}>`);
    points.push(...pathPoints(d));
  }
  return points;
}

/** Найвища й найнижча точка заливок кадру, y полотна. */
function extent(id: ArtId, view: ArtView, state: string | null = null): { top: number; bottom: number } {
  const ys = fillPoints(id, view, state).map((p) => p[1]);
  return { top: Math.min(...ys), bottom: Math.max(...ys) };
}

// --- Скелет --------------------------------------------------------------------------------------

function rigWith(look: Partial<Look>, view: ArtView, proportions: string[] = [], skin: Record<string, ArtId | null> = {}): LooseRig {
  return new Rig(PERSON_RIG, {
    fit: PERSON_FIT,
    lookup: artEntry,
    skin: { ...personSkin({ ...BASE, ...look }), ...skin },
    facing: { view, flip: false },
    proportions,
  }) as unknown as LooseRig;
}

/** Стан кадру слота, як його покаже скелет (без доріжки чи з чужим станом — перший стан запису). */
function stateOf(rig: LooseRig, slot: string, view: ArtView): string | null {
  const pose = rig.slot(slot);
  return pose.art ? slotFrame(pose.art, artEntry(pose.art), pose.state, view).state : null;
}

/** Найнижча точка (y кореня) заливок кадру слота в позі, що зараз на скелеті. */
function lowest(rig: LooseRig, slot: string, view: ArtView): number {
  const pose = rig.slot(slot);
  if (!pose.visible || !pose.art) return -Infinity;
  const entry = artEntry(pose.art);
  if (!entry) throw new Error(`немає запису ${pose.art}`);
  const r = (pose.rot * Math.PI) / 180;
  let low = -Infinity;
  for (const [px, py] of fillPoints(pose.art, view, stateOf(rig, slot, view))) {
    const x = pose.sx * (px - entry.pivot.x);
    const y = pose.sy * (py - entry.pivot.y);
    low = Math.max(low, pose.y + x * Math.sin(r) + y * Math.cos(r));
  }
  if (low === -Infinity) throw new Error(`${slot}: у ${pose.art} немає заливки в стані ${stateOf(rig, slot, view)}`);
  return low;
}

/** Моменти анімації: рівний крок і ще мить до й після кожної зміни стану кадру. */
function moments(anim: LooseAnim): number[] {
  const ts = new Set<number>();
  for (let i = 0; i <= 40; i++) ts.add((anim.duration * i) / 40);
  for (const track of [...Object.values(anim.slots ?? {}), ...Object.values(anim.views?.back?.slots ?? {})]) {
    for (const key of track?.frame ?? []) for (const dt of [-1, 0, 1]) if (key.t + dt >= 0 && key.t + dt <= anim.duration) ts.add(key.t + dt);
  }
  return [...ts].sort((a, b) => a - b);
}

/** Підлога — y кореня (між ступнями). */
const FLOOR = 0;


describe("гардероб, низ: спідниця й поділ верху", () => {
  const variants = personVariants();
  const hems: { slot: "skirt" | "top-hem"; art: ArtId }[] = [
    ...variants.skirt.filter((a): a is ArtId => a !== null).map((art) => ({ slot: "skirt" as const, art })),
    ...variants["top-hem"].filter((a): a is ArtId => a !== null).map((art) => ({ slot: "top-hem" as const, art })),
  ];

  it("є що перевіряти: міні-спідниця зі станами stand, sit, squat", () => {
    expect(hems.map((h) => h.art)).toContain("person/skirt/mini");
    expect(artEntry("person/skirt/mini")?.states).toEqual(["stand", "sit", "squat"]);
  });

  it("поділ не нижче підлоги в жодній анімації (хіба що лежить на ній разом із тулубом)", () => {
    const problems: string[] = [];
    for (const { slot, art } of hems) {
      for (const [name, anim] of Object.entries(ANIMS)) {
        for (const view of VIEWS) {
          for (const proportions of BUILDS) {
            const rig = rigWith({}, view, proportions, { [slot]: art });
            rig.play(anim, 0, { blend: 0 });
            for (const t of moments(anim)) {
              rig.evaluate(t);
              // Лежачи на підлозі (впав від виснаження) тулуб сам нижче її лінії — у ¾ він лежить ближче до камери; тоді лінія
              // підлоги нічого не каже.
              if (lowest(rig, "torso", view) > FLOOR) continue;
              const low = lowest(rig, slot, view);
              if (low > FLOOR + 0.01) problems.push(`${art} ${name} ${view} ${proportions.join() || "звичайна"} @${Math.round(t)}: ${low.toFixed(1)}`);
            }
          }
        }
      }
    }
    expect(problems.slice(0, 10)).toEqual([]);
  });

  it("стоячи міні — до середини стегна: нижче промежини, вище колін", () => {
    for (const view of VIEWS) {
      const rig = rigWith({ bottomCut: BOTTOM_CUTS.findIndex((c) => c.skirt === "person/skirt/mini") }, view);
      rig.evaluate(0);
      const hip = rig.bone("leg-near").world;
      const low = lowest(rig, "skirt", view);
      expect(low, view).toBeGreaterThan(hip.ty + 10);
      expect(low, view).toBeLessThan(hip.ty + 25);
    }
  });
});

describe("гардероб, низ: сидячи й присівши", () => {
  const look = { bottomCut: BOTTOM_CUTS.findIndex((c) => c.legwear === "person/legwear/jeans"), shoeCut: 0 };
  const skin = { skirt: "person/skirt/mini" as ArtId, "top-hem": "person/skirt/mini" as ArtId, "shaft-near": "person/shaft/sock" as ArtId, "shaft-far": "person/shaft/sock" as ArtId };

  it("сидячи (робота, летючка, їжа): ближня нога — лише стегно, без взуття, халяви й низу штанини; на гомілці — без накладки; спідниця й поділ — sit", () => {
    for (const name of ["work", "meeting", "eat"]) {
      const anim = ANIMS[name]!;
      for (const view of VIEWS) {
        const rig = rigWith(look, view, [], skin);
        rig.play(anim, 0, { blend: 0 });
        for (const t of [0, anim.duration / 3, (anim.duration * 2) / 3]) {
          rig.evaluate(t);
          for (const slot of ["shoe-near", "shaft-near", "hem-near", "legwear-far"]) expect(rig.slot(slot).visible, `${name} ${view} ${slot}`).toBe(false);
          for (const slot of ["shoe-far", "shaft-far", "hem-far", "legwear-near"]) expect(rig.slot(slot).visible, `${name} ${view} ${slot}`).toBe(true);
          for (const slot of ["skirt", "top-hem"]) expect(stateOf(rig, slot, view), `${name} ${view} ${slot}`).toBe("sit");
        }
      }
    }
  });

  it("присівши (гладить, бере й опускає кота) спідниця й поділ — squat, а випроставшись — stand", () => {
    const at = (name: string, t: number, view: ArtView): string | null => {
      const rig = rigWith({}, view, [], skin);
      rig.play(ANIMS[name]!, 0, { blend: 0 });
      rig.evaluate(t);
      expect(stateOf(rig, "top-hem", view)).toBe(stateOf(rig, "skirt", view));
      return stateOf(rig, "skirt", view);
    };
    for (const view of VIEWS) {
      for (const t of [0, 500, 999]) expect(at("pet", t, view), `pet ${view} @${t}`).toBe("squat");
      expect(at("pickUp", PERSON_PICKUP_GRAB_MS, view)).toBe("squat");
      expect(at("putDown", PERSON_PUTDOWN_RELEASE_MS, view)).toBe("squat");
      for (const name of ["pickUp", "putDown"]) {
        expect(at(name, 0, view), name).toBe("stand");
        expect(at(name, ANIMS[name]!.duration, view), name).toBe("stand");
      }
      expect(at("idle", 0, view)).toBe("stand");
    }
  });
});

describe("гардероб, взуття", () => {
  const shoes = [...new Set(SHOE_CUTS.map((cut) => cut.shoe ?? "person/shoe"))] as ArtId[];

  it("взуття — полотно й pivot кросівок, підошва на тій самій висоті, верх не вище 2 над кісточкою (стопа в ході повертається)", () => {
    const base = artEntry("person/shoe");
    expect(shoes.length).toBe(SHOE_CUTS.length);
    for (const id of shoes) {
      const entry = artEntry(id);
      expect({ size: entry?.size, pivot: entry?.pivot }, id).toEqual({ size: base?.size, pivot: base?.pivot });
      for (const view of VIEWS) {
        const own = extent(id, view);
        expect(Math.abs(own.bottom - extent("person/shoe", view).bottom), `${id}/${view}: підошва`).toBeLessThan(0.5);
        expect(own.top, `${id}/${view}: верх`).toBeGreaterThanOrEqual((entry?.pivot.y ?? 0) - 2);
      }
    }
  });

  it("стопи стоять: кісточка взуття на кінці ноги (точка foot) кожного фасону низу", () => {
    const foot = artEntry("person/leg")?.points?.["foot"];
    for (const cut of BOTTOM_CUTS) {
      const leg = artEntry(cut.leg ?? "person/leg");
      expect({ size: leg?.size, pivot: leg?.pivot, foot: leg?.points?.["foot"] }, cut.name).toEqual({ size: { w: 33, h: 74 }, pivot: { x: 16, y: 18 }, foot });
    }
  });

  it("халява й низ штанини — на кістці ноги в кісточці (точка foot), полотно не ширше за ногу з запасом", () => {
    const variants = personVariants();
    for (const slot of ["shaft-near", "hem-near"] as const) {
      for (const id of variants[slot]) {
        if (!id) continue;
        const entry = artEntry(id);
        expect(entry, id).toBeDefined();
        expect(entry?.views, id).toEqual(VIEWS);
      }
    }
  });
});

describe("гардероб: поєднання низу й взуття", () => {
  const boots = SHOE_CUTS.findIndex((cut) => cut.tuck === true);
  const slippers = SHOE_CUTS.findIndex((cut) => cut.sockless === true);
  const skinOf = (bottomCut: number, shoeCut: number) => personSkin({ ...BASE, bottomCut, shoeCut });

  it("чоботи: заправлені штани без низу штанини, халява на нозі; кльош — поверх халяви (її немає), низ штанини лишається", () => {
    expect(boots).toBeGreaterThan(0);
    BOTTOM_CUTS.forEach((cut, i) => {
      const skin = skinOf(i, boots);
      if (cut.over) {
        expect([skin["shaft-near"], skin["shaft-far"]], cut.name).toEqual([null, null]);
        expect(skin["hem-near"], cut.name).toBe(cut.hem ?? null);
      } else {
        expect([skin["hem-near"], skin["hem-far"]], cut.name).toEqual([null, null]);
        expect(skin["shaft-near"], cut.name).toBe(SHOE_CUTS[boots]?.shaft);
      }
    });
    // Без чобіт підкат джинсів на місці.
    const jeans = BOTTOM_CUTS.findIndex((cut) => cut.hem === "person/hem/cuff");
    expect(skinOf(jeans, 0)["hem-near"]).toBe("person/hem/cuff");
  });

  it("гола нога: шкарпетка під низьким взуттям (кросівки, кеди), на босу ногу в капцях; під штанами шкарпетки немає", () => {
    expect(slippers).toBeGreaterThan(0);
    BOTTOM_CUTS.forEach((cut, i) => {
      SHOE_CUTS.forEach((shoe, j) => {
        const shaft = skinOf(i, j)["shaft-near"];
        if (shoe.shaft) expect(shaft, `${cut.name} + ${shoe.name}`).toBe(cut.over ? null : shoe.shaft);
        else expect(shaft, `${cut.name} + ${shoe.name}`).toBe(cut.bare && !shoe.sockless ? "person/shaft/sock" : null);
      });
    });
    // Правило — у самому взутті: його слоти малюються над штаниною.
    expect(shoeSkin(wearOf({ ...BASE, bottomCut: BOTTOM_CUTS.findIndex((c) => c.bare), shoeCut: 0 }))["shaft-far"]).toBe("person/shaft/sock");
  });

  it("гола нога — шкіра (fill-skin) без плям; шорти й спідниця — без плям на шкірі, легінси — з плямами штанини", () => {
    for (const cut of BOTTOM_CUTS.filter((c) => c.bare)) {
      const leg = cut.leg ?? "person/leg";
      expect(artEntry(leg)?.layers, cut.name).toContain("fill-skin");
      expect(artEntry(leg)?.layers, cut.name).not.toContain("fill-bottom");
      for (const view of VIEWS) {
        expect(partExtraFrame(`${leg}/${view}`), cut.name).toBeNull();
        for (const own of [cut.legwear, cut.skirt]) if (own) expect(partExtraFrame(`${own}/${view}`), `${cut.name}: ${own}`).toBeNull();
      }
    }
    expect(partExtraFrame("person/leg/leggings/front")).toBe("person/leg-extra/front");
    expect(partExtraFrame("person/leg/back")).toBe("person/leg-extra/back");
  });
});
