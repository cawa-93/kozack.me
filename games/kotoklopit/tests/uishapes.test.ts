// Нерухомі фігури інтерфейсу — кадри атласу (`a27-ui-shapes.ts`), а не `Graphics`, який Phaser розбиває на трикутники щокадру:
// плашка кількості в баблі, плашка індикатора сховища, доріжка, заливка й штрихування шкал панелі. Кольори запечено в кадри
// (tint у запасному Canvas не діє), тож тут звіряється, що кадри намальовані тими самими числами й кольорами, які має код.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseSvg, type SvgNode } from "../scripts/art/svg";
import { svgPath, type ArtId } from "../src/view/art/types";
import { hatchCrop } from "../src/view/hudbars";
import { BUBBLE_COUNT, COUNT_ART, countPillWidth } from "../src/view/iso/bubblelook";
import { BAR_FILL_STATES, barFillState, HUD_ART, HUD_LAYOUT, HUD_STEP, isoBarRects, STAT_BLINK, STAT_FILL } from "../src/view/iso/hudlook";
import { hex, UI_FILL, uiEntry } from "../src/view/iso/uilook";
import { slice3Frame } from "../src/view/slice3";
import { STORAGE_LOOK, STORAGE_PLATE_ART } from "../src/view/storage";
import type { StatName } from "../src/sim/types";

const ART_DIR = fileURLToPath(new URL("../art/", import.meta.url));
const SRC_DIR = fileURLToPath(new URL("../src/view/", import.meta.url));

const nodes = (id: ArtId): readonly SvgNode[] => parseSvg(readFileSync(ART_DIR + svgPath(uiEntry(id)), "utf8")).nodes;
const num = (node: SvgNode | undefined, attr: string): number => Number(node?.attrs[attr]);
const color = (node: SvgNode | undefined, attr: string): number => hex(node?.attrs[attr] ?? "#000000");
/** Прямокутник SVG: місце й заокруглення. */
const box = (node: SvgNode | undefined): { left: number; top: number; right: number; bottom: number; rx: number } => ({
  left: num(node, "x"),
  top: num(node, "y"),
  right: num(node, "x") + num(node, "width"),
  bottom: num(node, "y") + num(node, "height"),
  rx: num(node, "rx"),
});
/** Чи стоїть елемент у групі стану `state` (клас `st-<стан>` на ньому чи на батьках). */
const inState = (node: SvgNode, state: string): boolean => {
  for (let at: SvgNode | null = node; at; at = at.parent) if ((at.attrs["class"] ?? "").split(/\s+/).includes(`st-${state}`)) return true;
  return false;
};

describe("плашка кількості в баблі (ui/count)", () => {
  const frame = slice3Frame(uiEntry(COUNT_ART));

  it("кадр — за числами BUBBLE_COUNT: висота, півкруглі краї, обвідка в краях", () => {
    expect(frame.body.bottom - frame.body.top).toBe(BUBBLE_COUNT.height);
    expect(frame.cap).toBe(BUBBLE_COUNT.height / 2);
    expect(frame.bleed).toBeGreaterThanOrEqual(BUBBLE_COUNT.outline / 2);
    // Найвужча плашка (одна цифра) — кружечок із двох країв: краї не стискаються.
    expect(countPillWidth(0)).toBeGreaterThanOrEqual(2 * frame.cap);
    // Середина — рівна ділянка між краями.
    expect(frame.body.right - frame.body.left).toBeGreaterThan(2 * frame.cap);
  });

  it("SVG: чорнильна плашка з паперовою обвідкою — тіло кадру", () => {
    const rects = nodes(COUNT_ART).filter((n) => n.name === "rect");
    expect(rects).toHaveLength(1);
    expect(box(rects[0])).toEqual({ ...frame.body, rx: frame.cap });
    expect(color(rects[0], "fill")).toBe(UI_FILL.ink);
    expect(color(rects[0], "stroke")).toBe(UI_FILL.paper);
    expect(num(rects[0], "stroke-width")).toBe(BUBBLE_COUNT.outline);
  });
});

describe("плашка індикатора сховища (ui/storage)", () => {
  const look = STORAGE_LOOK;
  const entry = uiEntry(STORAGE_PLATE_ART);
  const frame = slice3Frame(entry);

  it("кадр — за числами STORAGE_LOOK: висота плашки, заокруглення, рамка й тінь у полотні", () => {
    expect(frame.body.bottom - frame.body.top).toBe(look.icon + 2 * look.pad);
    expect(frame.cap).toBe(look.radius);
    expect(frame.bleed).toBeGreaterThanOrEqual(look.line / 2);
    expect(entry.size.h - frame.body.bottom).toBeGreaterThanOrEqual(look.drop + 4);
    // Найвужча плашка — одна фішка: краї не стискаються.
    expect(look.chip + look.pad).toBeGreaterThan(2 * frame.cap);
  });

  it("SVG: папір у чорнильній рамці, під ним — тінь, зсунута вниз", () => {
    const rects = nodes(STORAGE_PLATE_ART).filter((n) => n.name === "rect");
    expect(rects).toHaveLength(2);
    const [shadow, plate] = rects;
    expect(box(plate)).toEqual({ ...frame.body, rx: look.radius });
    expect(color(plate, "fill")).toBe(look.fill);
    expect(color(plate, "stroke")).toBe(look.lineColor);
    expect(num(plate, "stroke-width")).toBe(look.line);
    expect(box(shadow)).toEqual({ ...frame.body, top: frame.body.top + look.drop, bottom: frame.body.bottom + look.drop, rx: look.radius });
    expect(color(shadow, "fill")).toBe(look.dropColor);
    expect(num(shadow, "fill-opacity")).toBe(look.dropAlpha);
    // Непрозорість тла й рамки запечено повною.
    expect([look.fillAlpha, look.lineAlpha]).toEqual([1, 1]);
  });
});

describe("шкали показників (ui/hud/bar-fill, ui/hud/bar-hatch)", () => {
  const STATS: Record<StatName, true> = { health: true, sanity: true, satiety: true, hygiene: true };
  const stats = Object.keys(STATS) as StatName[];
  const entry = uiEntry(HUD_ART.barFill);
  const frame = slice3Frame(entry);

  it("кадр на кожен колір: доріжка, кожен показник, блимання", () => {
    expect([...(entry.states ?? [])].sort()).toEqual([BAR_FILL_STATES.trough, BAR_FILL_STATES.blink, ...stats].sort());
    for (const stat of stats) {
      expect(barFillState(stat, false)).toBe(stat);
      expect(barFillState(stat, true)).toBe(BAR_FILL_STATES.blink);
    }
  });

  it("SVG: кожен стан — та сама пігулка без обвідки свого кольору палітри", () => {
    const want: Record<string, number> = { [BAR_FILL_STATES.trough]: UI_FILL.trough, [BAR_FILL_STATES.blink]: STAT_BLINK, ...STAT_FILL };
    const rects = nodes(HUD_ART.barFill).filter((n) => n.name === "rect");
    expect(rects).toHaveLength(Object.keys(want).length);
    expect(frame.bleed).toBe(0);
    expect(frame.cap).toBe((frame.body.bottom - frame.body.top) / 2);
    for (const [state, fill] of Object.entries(want)) {
      const mine = rects.filter((r) => inState(r, state));
      expect(mine, state).toHaveLength(1);
      expect(box(mine[0]), state).toEqual({ ...frame.body, rx: frame.cap });
      expect(color(mine[0], "fill"), state).toBe(fill);
      expect(mine[0]?.attrs["stroke"], state).toBeUndefined();
    }
  });

  it("штрихування: смужки кольору hatch, кадр укриває найдовшу шкалу", () => {
    const hatch = slice3Frame(uiEntry(HUD_ART.barHatch));
    const lines = nodes(HUD_ART.barHatch).filter((n) => n.name === "path" && n.attrs["stroke"] !== undefined);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(color(line, "stroke")).toBe(UI_FILL.hatch);
    const size = uiEntry(HUD_ART.bar).size;
    for (const layout of [HUD_LAYOUT.desktop, HUD_LAYOUT.phone]) {
      const widest = HUD_STEP.max - layout.bar.x - HUD_STEP.gap;
      const { fill } = isoBarRects({ x: 0, y: 0, w: widest, h: layout.bar.h }, size);
      const k = fill.h / (hatch.body.bottom - hatch.body.top);
      expect((hatch.body.right - hatch.body.left) * k).toBeGreaterThanOrEqual(fill.w);
    }
  });

  it("штрихування — вікно кадру від межі до кінця шкали, смужки стоять на місці", () => {
    const hatch = { size: { w: 160, h: 20 }, body: { left: 4, top: 4, right: 156, bottom: 16 }, cap: 0, bleed: 0 };
    // Шкала заввишки 6 — кадр удвічі менший; тіло кадру починається в лівому краї шкали.
    const bar = { x: 100, y: 20, w: 60, h: 6 };
    expect(hatchCrop(hatch, bar, 0)).toEqual({ x: 98, y: 18, scale: 0.5, src: 4, srcW: 120 });
    expect(hatchCrop(hatch, bar, 45)).toEqual({ x: 98, y: 18, scale: 0.5, src: 94, srcW: 30 });
    // Шкала, довша за кадр, — штрихування до кінця кадру; межа за кінцем шкали — нічого.
    expect(hatchCrop(hatch, { ...bar, w: 100 }, 50)).toEqual({ x: 98, y: 18, scale: 0.5, src: 104, srcW: 52 });
    expect(hatchCrop(hatch, bar, 60)).toBeNull();
  });
});

describe("ці фігури код більше не малює", () => {
  const source = (file: string): string => readFileSync(SRC_DIR + file, "utf8");
  const graphics = (file: string): number => source(file).match(/\.graphics\(/g)?.length ?? 0;

  it("бабли й індикатори сховищ — без Graphics; на панелі — лише тло новини телефона", () => {
    expect(graphics("bubbles.ts")).toBe(0);
    expect(graphics("storage.ts")).toBe(0);
    expect(graphics("hud.ts")).toBe(1);
    expect(source("hud.ts")).toMatch(/newsBg = scene\.add\.graphics\(\)/);
  });
});
