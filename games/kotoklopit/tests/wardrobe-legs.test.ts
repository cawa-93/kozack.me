// Гардероб, низ і взуття (§5.1, `WARDROBE.md`, «Низ», «Взуття»; правила арту — `art/STYLE.md`, «person»): поділ спідниці й верху
// не опускається нижче підлоги в жодній анімації; сидячи сховано те, чого на стегні й гомілці не видно, а будь-який поділ зі
// станами — у стані `sit`, присівши чи зігнувшись — `squat`; взуття стоїть на тій самій підошві й не вище за кісточку (стопи не
// ковзають); поєднання: чоботи ховають низ заправленої штанини, кльош і широкі — халяву, черевики під довгими штанами — лише
// стопа, над голою стопою — край штанини, гола нога — без плям і зі шкарпеткою під низьким взуттям; у спідниці-олівці — хода
// дрібним кроком, і ноги в кроці не прорізають її боки.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { Look } from "../src/sim/types";
import { artEntry } from "../src/view/art/manifest";
import { svgPath, type ArtId, type ArtView } from "../src/view/art/types";
import { PERSON_ANIMS } from "../src/view/rig/anims";
import {
  PERSON_HOBBLE,
  PERSON_MOVE,
  PERSON_PICKUP_GRAB_MS,
  PERSON_PUTDOWN_RELEASE_MS,
  personCutAnim,
  personGait,
  personGaitSpeed,
  type PersonGait,
} from "../src/view/rig/anims/person/move";
import { PERSON_FIT, PERSON_RIG, personSkin, personVariants } from "../src/view/rig/defs/person";
import { Rig, slotFrame } from "../src/view/rig/rigcore";
import type { RigAnim } from "../src/view/rig/types";
import { BOTTOM_CUTS, EDGE } from "../src/view/wardrobe/bottoms";
import { partExtraFrame, wearOf } from "../src/view/wardrobe/index";
import { SHOE_CUTS, shoeSkin } from "../src/view/wardrobe/shoes";

type LooseRig = Rig<string, string, string>;
type LooseAnim = RigAnim<string, string>;
type Pt = readonly [number, number];

const ART_DIR = path.join(fileURLToPath(new URL("..", import.meta.url)), "art");
const VIEWS: readonly ArtView[] = ["front", "back"];
const BUILDS: readonly string[][] = [[], ["slim"], ["stocky"]];
const ANIMS = PERSON_ANIMS as unknown as Readonly<Record<string, LooseAnim>>;
const BASE: Look = { face: 0, skin: 0, hair: 0, hairColor: 0, eyes: 0, build: 1, top: 0, bottom: 0, shoes: 0 };
const HEM_STATES = ["stand", "sit", "squat"];

/** Усі анімації персонажа з усіх груп (`anims/person/*.ts`), і ті, що не в реєстрі назв (хода дрібним кроком). */
const GROUPS = import.meta.glob<Record<string, unknown>>("../src/view/rig/anims/person/*.ts", { eager: true });
const ALL_ANIMS: [string, LooseAnim][] = Object.entries(GROUPS).flatMap(([file, module]) =>
  Object.values(module)
    .filter((group): group is Record<string, LooseAnim> => typeof group === "object" && group !== null)
    .flatMap((group) => Object.entries(group).map(([name, anim]) => [`${path.basename(file)}/${name}`, anim] as [string, LooseAnim])),
);

const cutOf = (pick: (c: (typeof BOTTOM_CUTS)[number]) => boolean): number => BOTTOM_CUTS.findIndex(pick);
const shoeOf = (name: string): number => SHOE_CUTS.findIndex((c) => c.name === name);

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

const FILLS = new Map<string, Pt[][]>();

/**
 * Обриси заливок `fill-*` кадру в стані `state` (елементи з класом іншого стану — пропущено; без класу — є в усіх станах), у
 * координатах полотна: кожна форма — окремий обрис. Кешовано: перевірки питають тисячі разів.
 */
function fillShapes(id: ArtId, view: ArtView, state: string | null): Pt[][] {
  const key = `${id}|${view}|${state}`;
  const known = FILLS.get(key);
  if (known) return known;
  const entry = artEntry(id);
  if (!entry) throw new Error(`немає запису ${id}`);
  const svg = readFileSync(path.join(ART_DIR, svgPath(entry, view)), "utf8");
  const defs = new Map<string, string>();
  for (const m of svg.matchAll(/<path id="([^"]+)" d="([^"]+)"/g)) defs.set(m[1]!, m[2]!);
  const shapes: Pt[][] = [];
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
    for (const part of d.split(/(?=M)/)) shapes.push(pathPoints(part));
  }
  FILLS.set(key, shapes);
  return shapes;
}

/** Найвища й найнижча точка заливок кадру, y полотна. */
function extent(id: ArtId, view: ArtView, state: string | null = null): { top: number; bottom: number } {
  const ys = fillShapes(id, view, state).flat().map((p) => p[1]);
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

/** Обриси заливок кадру слота в позі, що зараз на скелеті, у системі кореня. */
function worldShapes(rig: LooseRig, slot: string, view: ArtView): Pt[][] {
  const pose = rig.slot(slot);
  if (!pose.visible || !pose.art) return [];
  const entry = artEntry(pose.art);
  if (!entry) throw new Error(`немає запису ${pose.art}`);
  const r = (pose.rot * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return fillShapes(pose.art, view, stateOf(rig, slot, view)).map((shape) =>
    shape.map(([px, py]) => {
      const x = pose.sx * (px - entry.pivot.x);
      const y = pose.sy * (py - entry.pivot.y);
      return [pose.x + x * cos - y * sin, pose.y + x * sin + y * cos] as Pt;
    }),
  );
}

/** Найнижча точка (y кореня) заливок кадру слота в позі, що зараз на скелеті. */
function lowest(rig: LooseRig, slot: string, view: ArtView): number {
  const pose = rig.slot(slot);
  if (!pose.visible || !pose.art) return -Infinity;
  const shapes = worldShapes(rig, slot, view);
  // Накладка самими лініями (планка, кишеня поділу верху) заливки не має й до підлоги не дістає.
  const lines = !(artEntry(pose.art)?.layers ?? []).some((layer) => layer.startsWith("fill"));
  if (shapes.length === 0 && !lines) throw new Error(`${slot}: у ${pose.art} немає заливки в стані ${stateOf(rig, slot, view)}`);
  return Math.max(-Infinity, ...shapes.flat().map((p) => p[1]));
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

  it("є що перевіряти: спідниці низу зі станами; будь-який поділ зі станами — рівно stand, sit, squat", () => {
    for (const art of ["person/skirt/mini", "person/skirt/midi", "person/skirt/pleated", "person/skirt/pencil"]) expect(hems.map((h) => h.art)).toContain(art);
    for (const { art } of hems) {
      const states = artEntry(art)?.states;
      if (states) expect(states, art).toEqual(HEM_STATES);
    }
  });

  it("поділ не нижче підлоги в жодній анімації (хіба що лежить на ній разом із тулубом)", () => {
    const problems: string[] = [];
    for (const { slot, art } of hems) {
      for (const [name, anim] of ALL_ANIMS) {
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

  it("стоячи: міні — до середини стегна, олівець — до коліна, міді й плісе — нижче колін", () => {
    const hipToFoot = 49.2;
    const at = (art: string, view: ArtView): number => {
      const rig = rigWith({ bottomCut: cutOf((c) => c.skirt === art) }, view);
      rig.evaluate(0);
      return lowest(rig, "skirt", view) - rig.bone("leg-near").world.ty;
    };
    for (const view of VIEWS) {
      expect(at("person/skirt/mini", view), view).toBeGreaterThan(10);
      expect(at("person/skirt/mini", view), view).toBeLessThan(25);
      expect(at("person/skirt/pencil", view), view).toBeGreaterThan(hipToFoot * 0.45);
      expect(at("person/skirt/pencil", view), view).toBeLessThan(hipToFoot * 0.6);
      for (const art of ["person/skirt/midi", "person/skirt/pleated"]) {
        expect(at(art, view), `${art} ${view}`).toBeGreaterThan(hipToFoot * 0.6);
        expect(at(art, view), `${art} ${view}`).toBeLessThan(hipToFoot * 0.85);
      }
    }
  });
});

describe("гардероб, низ: сидячи й присівши", () => {
  const look = { bottomCut: cutOf((c) => c.legwear === "person/legwear/jeans"), shoeCut: 0 };
  /** Будь-який кадр поділу зі станами (спідниця низу, поділ верху) — тут міні й міді. */
  const skin = { skirt: "person/skirt/mini" as ArtId, "top-hem": "person/skirt/midi" as ArtId, "shaft-near": "person/shaft/sock" as ArtId, "shaft-far": "person/shaft/sock" as ArtId };

  const at = (name: string, t: number, view: ArtView): string | null => {
    const rig = rigWith({}, view, [], skin);
    rig.play(ANIMS[name]!, 0, { blend: 0 });
    rig.evaluate(t);
    expect(stateOf(rig, "top-hem", view), `${name} ${view} @${t}`).toBe(stateOf(rig, "skirt", view));
    return stateOf(rig, "skirt", view);
  };

  it("сидячи (робота, летючка, їжа): ближня нога — лише стегно, без взуття, халяви й низу штанини; на гомілці — без накладки; поділ — sit", () => {
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

  it("присівши (гладить, бере й опускає кота) поділ — squat, а випроставшись — stand", () => {
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

  it("справи: стан поділу — за згином у стегні (присів над лотком — squat, глибоко зігнувся чи сів на підлогу — sit, лежить — stand)", () => {
    for (const view of VIEWS) {
      expect(at("litter", 0, view), `litter ${view}`).toBe("squat");
      expect(at("clean", 0, view), `clean ${view}`).toBe("sit");
      expect(at("fix", 0, view), `fix ${view}`).toBe("sit");
      expect(at("collapse", 700, view), `collapse ${view}`).toBe("sit");
      expect(at("collapse", ANIMS["collapse"]!.duration, view), `collapse ${view}`).toBe("stand");
      expect(at("collapse", 0, view), `collapse ${view}`).toBe("stand");
      for (const name of ["phone", "meds", "door"]) expect(at(name, 0, view), `${name} ${view}`).toBe("stand");
    }
  });
});

describe("гардероб, взуття", () => {
  const shoes = [...new Set(SHOE_CUTS.map((cut) => cut.shoe ?? "person/shoe"))] as ArtId[];

  it("взуття — полотно й pivot кросівок, підошва на тій самій висоті, верх не вище 2 над кісточкою (стопа в ході повертається)", () => {
    const base = artEntry("person/shoe");
    expect(shoes.length).toBeGreaterThanOrEqual(10);
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

  it("підбор човників — щонайменше 3: п'ята над підлогою, носок на ній", () => {
    for (const view of VIEWS) {
      const svg = readFileSync(path.join(ART_DIR, "person/shoe/pumps", `${view}.svg`), "utf8");
      const heel = /<g id="detail">\s*<path d="([^"]+)"/.exec(svg)?.[1];
      expect(heel, view).toBeDefined();
      const ys = pathPoints(heel ?? "").map((p) => p[1]);
      expect(Math.max(...ys) - Math.min(...ys), view).toBeGreaterThanOrEqual(3);
    }
  });

  it("стопи стоять: кісточка взуття на кінці ноги (точка foot) кожного фасону низу — там само відносно стегна", () => {
    const ref = artEntry("person/leg");
    const foot = (id: ArtId): { x: number; y: number } => {
      const e = artEntry(id);
      const p = e?.points?.["foot"];
      return { x: (p?.x ?? NaN) - (e?.pivot.x ?? 0), y: (p?.y ?? NaN) - (e?.pivot.y ?? 0) };
    };
    for (const cut of BOTTOM_CUTS) expect(foot(cut.leg ?? "person/leg"), cut.name).toEqual(foot("person/leg"));
    expect(ref).toBeDefined();
  });

  it("халява й низ штанини — на кістці ноги в кісточці (точка foot), в обох ракурсах", () => {
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

  it("гола стопа (босоніж, сандалі, човники) — шкірою (fill-skin): тим самим тоном, що й нога", () => {
    for (const cut of SHOE_CUTS.filter((c) => c.open)) expect(artEntry(cut.shoe ?? "person/shoe")?.layers, cut.name).toContain("fill-skin");
  });
});

describe("гардероб: поєднання низу й взуття", () => {
  const skinOf = (bottomCut: number, shoeCut: number) => personSkin({ ...BASE, bottomCut, shoeCut });
  const long = (i: number): boolean => BOTTOM_CUTS[i]?.bare !== true;

  it("заправлене взуття (чоботи, черевики, високі кеди, гумові): низу довгої штанини не видно; кльош і широкі — поверх халяви", () => {
    const tucked = SHOE_CUTS.map((c, i) => (c.tuck ? i : -1)).filter((i) => i >= 0);
    expect(tucked.map((i) => SHOE_CUTS[i]?.name)).toEqual(["чоботи", "черевики", "високі кеди", "гумові чоботи"]);
    for (const j of tucked) {
      const shoe = SHOE_CUTS[j]!;
      BOTTOM_CUTS.forEach((cut, i) => {
        const skin = skinOf(i, j);
        const what = `${cut.name} + ${shoe.name}`;
        if (cut.over) {
          expect([skin["shaft-near"], skin["shaft-far"]], what).toEqual([null, null]);
          expect(skin["hem-near"], what).toBe(cut.hem ?? null);
        } else if (cut.bare) {
          expect(skin["shaft-near"], what).toBe(shoe.shaft);
          expect(skin["hem-near"], what).toBe(cut.hem ?? null);
        } else {
          expect([skin["hem-near"], skin["hem-far"]], what).toEqual([null, null]);
          // Черевики й високі кеди під довгою штаниною — лише стопа; чоботи — халява поверх заправленої штанини.
          expect(skin["shaft-near"], what).toBe(shoe.ankle ? null : shoe.shaft);
        }
      });
    }
    // Без заправленого взуття підкат джинсів на місці.
    expect(skinOf(cutOf((c) => c.hem === "person/hem/cuff"), 0)["hem-near"]).toBe("person/hem/cuff");
  });

  it("гола нога: шкарпетка під низьким взуттям (кросівки, кеди); на босу ногу в капцях, туфлях, човниках, сандалях і босоніж", () => {
    BOTTOM_CUTS.forEach((cut, i) => {
      SHOE_CUTS.forEach((shoe, j) => {
        if (shoe.shaft) return;
        expect(skinOf(i, j)["shaft-near"], `${cut.name} + ${shoe.name}`).toBe(cut.bare && !shoe.sockless ? "person/shaft/sock" : null);
      });
    });
    for (const name of ["капці", "туфлі", "човники", "сандалі", "босоніж"]) expect(SHOE_CUTS[shoeOf(name)]?.sockless, name).toBe(true);
    // Правило — у самому взутті: його слоти малюються над штаниною.
    expect(shoeSkin(wearOf({ ...BASE, bottomCut: cutOf((c) => c.bare === true), shoeCut: 0 }))["shaft-far"]).toBe("person/shaft/sock");
  });

  it("відкрита стопа під довгою штаниною без свого низу — край штанини (вузький у легінсів), зі своїм низом — він; гола нога — нічого", () => {
    const open = SHOE_CUTS.map((c, i) => (c.open ? i : -1)).filter((i) => i >= 0);
    expect(open.map((i) => SHOE_CUTS[i]?.name)).toEqual(["човники", "сандалі", "босоніж"]);
    for (const j of open) {
      BOTTOM_CUTS.forEach((cut, i) => {
        const what = `${cut.name} + ${SHOE_CUTS[j]?.name}`;
        const hem = skinOf(i, j)["hem-near"];
        if (!long(i)) expect(hem, what).toBe(cut.hem ?? null);
        else expect(hem, what).toBe(cut.hem ?? cut.edge ?? EDGE);
      });
    }
    expect(BOTTOM_CUTS[cutOf((c) => c.name === "легінси")]?.edge).toBe("person/hem/edge-narrow");
    // Під закритим взуттям краю штанини немає.
    expect(skinOf(0, 0)["hem-near"]).toBeNull();
  });

  it("гола нога — шкіра (fill-skin) без плям; бриджі, шорти й спідниці — без плям, легінси й вузькі джинси — з плямами штанини", () => {
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
    // Широка штанина — свої плями з її полотном і pivot.
    expect(partExtraFrame("person/leg/wide/front")).toBe("person/leg-extra/wide/front");
    const wide = artEntry("person/leg/wide");
    const stains = artEntry("person/leg-extra/wide");
    expect({ size: stains?.size, pivot: stains?.pivot }).toEqual({ size: wide?.size, pivot: wide?.pivot });
  });
});

describe("гардероб: хода у спідниці-олівці", () => {
  const pencil = cutOf((c) => c.hobble === true);
  const GAITS: readonly PersonGait[] = ["walk", "dash", "limp", "trudge", "dizzy"];
  const HOBBLE = PERSON_HOBBLE as unknown as Readonly<Record<string, LooseAnim>>;
  const MOVE = PERSON_MOVE as unknown as Readonly<Record<string, LooseAnim>>;

  it("дрібним кроком — лише у вузькій спідниці (олівець) і лише ходи", () => {
    expect(BOTTOM_CUTS.filter((c) => c.hobble).map((c) => c.name)).toEqual(["спідниця-олівець"]);
    const look = { ...BASE, bottomCut: pencil };
    for (const gait of GAITS) {
      expect(personCutAnim(PERSON_MOVE[gait], look), gait).toBe(PERSON_HOBBLE[`${gait}Hobble`]);
      expect(personCutAnim(PERSON_MOVE[gait], { ...BASE, bottomCut: cutOf((c) => c.skirt === "person/skirt/midi") }), gait).toBe(PERSON_MOVE[gait]);
      expect(personCutAnim(PERSON_MOVE[gait], null), gait).toBe(PERSON_MOVE[gait]);
    }
    for (const name of ["idle", "pet", "trip"] as const) expect(personCutAnim(PERSON_MOVE[name], look), name).toBe(PERSON_MOVE[name]);
  });

  /** Найбільший кут ноги від вертикалі за анімацію (у ракурсі front). */
  const swing = (anim: LooseAnim): number => {
    const rig = rigWith({}, "front");
    rig.play(anim, 0, { blend: 0 });
    let most = 0;
    for (let i = 0; i <= 96; i++) {
      rig.evaluate((anim.duration * i) / 96);
      for (const leg of ["leg-near", "leg-far"]) {
        const m = rig.bone(leg).world;
        most = Math.max(most, Math.abs(90 - Math.atan2(m.b, m.a) / (Math.PI / 180)));
      }
    }
    return most;
  };

  it("розмах ноги — щонайбільше 13° (у звичайній ході — ≈ 30°), а темп за `personGaitSpeed` той самий: стопи не ковзають", () => {
    for (const gait of GAITS) {
      const hob = HOBBLE[`${gait}Hobble`]!;
      expect(swing(hob), gait).toBeLessThan(13.6);
      expect(swing(MOVE[gait]!), gait).toBeGreaterThan(25);
      // Крок і тривалість менші в одній пропорції: швидкість ходи на екрані за того самого темпу відтворення — та сама.
      const base = personGait(gait);
      const own = personGait(gait, true);
      expect(own.ms).toBe(hob.duration);
      expect(Math.abs(own.stride / own.ms / (base.stride / base.ms) - 1), gait).toBeLessThan(0.01);
      expect(personGaitSpeed(gait, 362, 0)).toBeGreaterThan(0);
    }
  });

  it("опорна стопа дрібного кроку йде назад рівно з кроком і не йде під підлогу", () => {
    for (const gait of GAITS) {
      const anim = HOBBLE[`${gait}Hobble`]!;
      const info = personGait(gait, true);
      const cycle = anim.duration / info.cycles;
      for (const view of VIEWS) {
        const rig = new Rig(PERSON_RIG, { facing: { view, flip: false } }) as unknown as LooseRig;
        rig.evaluate(0);
        const ankle = (id: string): Pt => [rig.bone(id).world.tx, rig.bone(id).world.ty];
        const ground = { near: ankle("foot-near"), far: ankle("foot-far") };
        rig.play(anim, 0, { blend: 0 });
        const speed = info.stride / anim.duration;
        for (const leg of ["near", "far"] as const) {
          const [from, to] = info[leg];
          const a = (from + 0.04) * cycle;
          const b = (to - 0.04) * cycle;
          rig.evaluate(a);
          const start = ankle(`foot-${leg}`);
          for (let t = a; t <= b; t += (b - a) / 12) {
            rig.evaluate(t);
            const now = ankle(`foot-${leg}`);
            expect(Math.abs(now[0] - (start[0] - speed * (t - a))), `${gait} ${view} ${leg} x @${t}`).toBeLessThan(0.6);
            expect(Math.abs(now[1] - ground[leg][1]), `${gait} ${view} ${leg} y @${t}`).toBeLessThan(0.6);
          }
        }
      }
    }
  });

  /** Чи точка в многокутнику (парність перетинів) або ближче до його краю, ніж `pad`. */
  const near = (p: Pt, poly: readonly Pt[], pad: number): boolean => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]!;
      const [xj, yj] = poly[j]!;
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
      const dx = xj - xi;
      const dy = yj - yi;
      const k = Math.max(0, Math.min(1, ((p[0] - xi) * dx + (p[1] - yi) * dy) / (dx * dx + dy * dy || 1)));
      if (Math.hypot(p[0] - xi - k * dx, p[1] - yi - k * dy) <= pad) return true;
    }
    return inside;
  };

  /**
   * Скільки точок обрису ніг між стегнами торса (вище ноги ховаються під ним) і подолом виходить за боки спідниці (за контур —
   * половину лінії).
   */
  const cuts = (anim: LooseAnim, view: ArtView, proportions: string[]): number => {
    const rig = rigWith({ bottomCut: pencil }, view, proportions);
    rig.play(anim, 0, { blend: 0 });
    let out = 0;
    for (let i = 0; i <= 48; i++) {
      rig.evaluate((anim.duration * i) / 48);
      const skirt = worldShapes(rig, "skirt", view)[0] ?? [];
      const hem = Math.max(...skirt.map((p) => p[1]));
      const hips = lowest(rig, "torso", view);
      for (const leg of ["leg-near", "leg-far"]) {
        for (const shape of worldShapes(rig, leg, view)) for (const p of shape) if (p[1] > hips && p[1] < hem - 2 && !near(p, skirt, 1.8)) out++;
      }
    }
    return out;
  };

  it("у ході дрібним кроком ноги не прорізають боки олівця (звичайна хода — прорізала б)", () => {
    for (const view of VIEWS) {
      for (const proportions of BUILDS) {
        const what = `${view} ${proportions.join() || "звичайна"}`;
        expect(cuts(HOBBLE["walkHobble"]!, view, proportions), what).toBe(0);
      }
      expect(cuts(MOVE["walk"]!, view, []), view).toBeGreaterThan(0);
    }
  });
});
