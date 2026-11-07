// Заливка одягу не виходить на тло без контуру (art/STYLE.md, «Суглоб»): край рукава без контуру дозволено лише там, де він
// лежить на сорочці, а край штанів на тазі обведений увесь — нога в кроці його відкриває. Геометрія SVG, без браузера.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { artEntry } from "../src/view/art/manifest";
import { BUILDS } from "../src/view/palette";
import { PERSON_RIG } from "../src/view/rig/defs/person";
import type { ArtEntry, ArtId, ArtPoint } from "../src/view/art/types";

const ART_DIR = path.join(fileURLToPath(new URL("..", import.meta.url)), "art");
const VIEWS = ["front", "back"] as const;
type View = (typeof VIEWS)[number];
type Pt = readonly [number, number];

/** Товщина контуру частин (`LINE_RIG`), зовнішнього й внутрішнього: заливка лягає по середині лінії. */
const OUTER = 3.6;
const INNER = 2.2;
/** Рукав нижче цього — манжета, її веде своя лінія. */
const CUFF_Y = 52;
/** Товщина рук за статурою: `proportions` скелета (`slim`, звичайна, `stocky`). */
const limb = (name: "slim" | "stocky"): number => PERSON_RIG.proportions?.[name]?.["arm-near-skin"]?.scale?.y ?? 1;
const LIMB_SCALE = [limb("slim"), 1, limb("stocky")];

const svgOf = (id: string, view: View): string => readFileSync(path.join(ART_DIR, id, `${view}.svg`), "utf8");

/** Точки шляху з команд M, C, Z. */
function flatten(d: string): Pt[] {
  const numbers = [...d.matchAll(/-?\d*\.?\d+/g)].map((m) => Number(m[0]));
  let cur: Pt = [numbers[0]!, numbers[1]!];
  const points: Pt[] = [cur];
  for (let i = 2; i + 5 < numbers.length; i += 6) {
    const [ax, ay, bx, by, cx, cy] = numbers.slice(i, i + 6) as [number, number, number, number, number, number];
    for (let step = 1; step <= 24; step++) {
      const u = step / 24;
      const v = 1 - u;
      points.push([
        v * v * v * cur[0] + 3 * v * v * u * ax + 3 * v * u * u * bx + u * u * u * cx,
        v * v * v * cur[1] + 3 * v * v * u * ay + 3 * v * u * u * by + u * u * u * cy,
      ]);
    }
    cur = [cx, cy];
  }
  return points;
}

const shape = (svg: string, name: string): Pt[] => {
  const d = new RegExp(`id="[^"]*-${name}" d="([^"]+)"`).exec(svg)?.[1];
  if (!d) throw new Error(`немає форми ${name}`);
  return flatten(d);
};

/** Точки ліній контуру цієї товщини, крім долоні (вона — через `<use>`). */
const inkLines = (svg: string, width: number): Pt[] =>
  [...svg.matchAll(new RegExp(`<path d="([^"]+)" fill="none" stroke="#2e1f29" stroke-width="${width}"`, "g"))].flatMap((m) => flatten(m[1]!));

function inside(p: Pt, polygon: readonly Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, ay] = polygon[i]!;
    const [bx, by] = polygon[j]!;
    if (ay > p[1] !== by > p[1] && p[0] < ((bx - ax) * (p[1] - ay)) / (by - ay) + ax) hit = !hit;
  }
  return hit;
}

const inked = (p: Pt, ink: readonly Pt[], width = OUTER): boolean => ink.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) <= width / 2);

function shoulder(entry: ArtEntry, view: View): ArtPoint {
  const points = entry.points as Record<string, ArtPoint>;
  const point = points[view === "back" ? "shoulder-near-back" : "shoulder-near"];
  if (!point) throw new Error("немає плеча");
  return point;
}

describe("контур рукава персонажа", () => {
  it.each(VIEWS)("дальня рука (%s): контур замкнений по всьому рукаву", (view) => {
    const svg = svgOf("person/arm-far", view);
    const ink = inkLines(svg, OUTER);
    const open = shape(svg, "sleeve").filter((p) => p[1] < CUFF_Y && !inked(p, ink));
    expect(open).toEqual([]);
  });

  it.each(VIEWS)("ближня рука (%s): край рукава поза сорочкою в кожній статурі — під контуром", (view) => {
    const arm = svgOf("person/arm", view);
    const pivot = artEntry("person/arm" as ArtId)!.pivot;
    const ink = inkLines(arm, OUTER);
    for (const [build] of BUILDS.entries()) {
      const id = `person/torso/${build}`;
      const torso = svgOf(id, view);
      const shirt = shape(torso, "shirt");
      const at = shoulder(artEntry(id as ArtId)!, view);
      const k = LIMB_SCALE[build]!;
      const open = shape(arm, "sleeve").filter((p) => {
        const onTorso: Pt = [at.x + k * (p[0] - pivot.x), at.y + (p[1] - pivot.y)];
        return p[1] < CUFF_Y && !inside(onTorso, shirt) && !inked(p, ink);
      });
      expect(open, `статура ${build}`).toEqual([]);
    }
  });

  it.each(VIEWS)("штани на тазі (%s): увесь край заливки під контуром у кожній статурі", (view) => {
    for (const [build] of BUILDS.entries()) {
      const torso = svgOf(`person/torso/${build}`, view);
      const outer = inkLines(torso, OUTER);
      const inner = inkLines(torso, INNER);
      const open = shape(torso, "hips").filter((p) => !inked(p, outer) && !inked(p, inner, INNER));
      expect(open, `статура ${build}`).toEqual([]);
    }
  });
});
