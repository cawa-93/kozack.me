// Панель і сенсорне керування нового вигляду (крок 16, пакет T3, `GRAPHICS_PLAN.md`): кадри й стани, які бере код, є в
// маніфесті (A13), смуга панелі тягнеться «трьома частинами» без зазорів, іконка показника лежить на папері кружечка, а
// числа, зняті з SVG A13, збігаються з артом.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseSvg, type SvgNode } from "../scripts/art/svg";
import { artEntry } from "../src/view/art/manifest";
import { svgPath, type ArtEntry, type ArtId } from "../src/view/art/types";
import {
  bandRect,
  drawnInside,
  HUD_ART,
  HUD_BAND,
  HUD_BAR,
  HUD_BAR_ART,
  HUD_STAT_ART,
  HUD_STAT_FILL,
  HUD_SMALL_TEXT,
  HUD_SMALL_TEXT_CSS,
  HUD_STATES,
  HUD_TEXT_MAX,
  hudTextScale,
  ICON_DRAWN,
  isoBarRects,
  statDisc,
  stretchRect,
  stretchSlices,
  TOUCH_ART,
} from "../src/view/iso/hudlook";
import { isoPopColor, uiEntry } from "../src/view/iso/uilook";
import { canvasFit, HUD_HEIGHT } from "../src/view/zoom";

function entry(id: string): ArtEntry {
  const found = artEntry(id);
  if (!found) throw new Error(`немає запису «${id}»`);
  return found;
}

describe("панель і сенсорні кнопки нового вигляду", () => {
  it("кадри й стани, які бере код, є в маніфесті (A13)", () => {
    for (const id of [...Object.values(HUD_ART), ...Object.values(TOUCH_ART)]) entry(id);
    const has = (id: string, states: Record<string, string>): void => {
      for (const state of Object.values(states)) expect(entry(id).states, `${id}: ${state}`).toContain(state);
    };
    has(HUD_ART.phone, HUD_STATES.phone);
    has(HUD_ART.fullscreen, HUD_STATES.fullscreen);
    has(TOUCH_ART.action, HUD_STATES.action);
    has(TOUCH_ART.dash, HUD_STATES.dash);
  });

  it("смуга панелі не нижча за панель і має кути, що не тягнуться", () => {
    const band = entry(HUD_ART.band);
    expect(band.size.h).toBeGreaterThanOrEqual(HUD_HEIGHT);
    const cap = band.points?.["slice"]?.x ?? 0;
    expect(cap).toBeGreaterThan(0);
    expect(cap * 2).toBeLessThan(band.size.w);
  });

  it("три частини смуги вкривають усю ширину без зазорів, кути не тягнуться", () => {
    for (const width of [1280, 1558, 1600, 300]) {
      const slices = stretchSlices(256, 24, width);
      expect(slices).toHaveLength(3);
      let x = 0;
      for (const s of slices) {
        expect(s.x).toBeCloseTo(x);
        x += s.w;
      }
      expect(x).toBeCloseTo(width);
      expect(slices[0]).toEqual({ src: 0, srcW: 24, x: 0, w: 24 });
      expect(slices[2]).toEqual({ src: 232, srcW: 24, x: width - 24, w: 24 });
      expect(slices[1]?.srcW).toBe(208);
    }
  });

  it("смуга вужча за два кути — самі кути, стиснуті навпіл", () => {
    expect(stretchSlices(256, 24, 30)).toEqual([
      { src: 0, srcW: 24, x: 0, w: 15 },
      { src: 232, srcW: 24, x: 15, w: 15 },
    ]);
    expect(stretchSlices(256, 24, 0)).toEqual([]);
  });
});

describe("кадри панелі нового вигляду на місці", () => {
  it("кути «трьох частин» — у масштабі висоти, середина добирає ширину", () => {
    const slices = stretchSlices(120, 10, 200, 1.5);
    expect(slices[0]).toEqual({ src: 0, srcW: 10, x: 0, w: 15 });
    expect(slices[1]).toEqual({ src: 10, srcW: 100, x: 15, w: 170 });
    expect(slices[2]).toEqual({ src: 110, srcW: 10, x: 185, w: 15 });
  });

  it("намальована частина полотна лягає рівно на ціль, масштаб — за висотою", () => {
    const frame = { w: 120, h: 20 };
    const drawn = drawnInside(frame, 4.2);
    expect(drawn).toEqual({ left: 4.2, top: 4.2, right: 120 - 4.2, bottom: 20 - 4.2 });
    const target = { x: 100, y: 10, w: 114, h: 16 };
    const rect = stretchRect(target, frame, drawn);
    const k = rect.h / frame.h;
    expect(k).toBeCloseTo(target.h / (drawn.bottom - drawn.top));
    expect(rect.x + drawn.left * k).toBeCloseTo(target.x);
    expect(rect.y + drawn.top * k).toBeCloseTo(target.y);
    // Справа поле полотна — у масштабі висоти, як і кут.
    expect(rect.x + rect.w - (frame.w - drawn.right) * k).toBeCloseTo(target.x + target.w);
  });

  it("смуга: верх намальованого — край екрана, низ чорнильного краю — межа панелі, загини з боків — за екраном", () => {
    const frame = uiEntry(HUD_ART.band).size;
    for (const height of [76, 100]) {
      const rect = bandRect(frame, 1280, height);
      const k = rect.h / frame.h;
      expect(rect.y + HUD_BAND.top * k).toBeCloseTo(0);
      expect(rect.y + HUD_BAND.edge * k).toBeCloseTo(height);
      // Загини краю з боків — за екраном.
      expect(rect.x + HUD_BAND.side * k).toBeCloseTo(0);
      expect(rect.x + rect.w - HUD_BAND.side * k).toBeCloseTo(1280);
    }
    expect(HUD_BAND.edge).toBeLessThanOrEqual(frame.h);
  });

  it("шкала: заливка — під рамкою, усередині старої шкали по ширині й по центру по висоті", () => {
    const old = { x: 200, y: 26, w: 116, h: 12 };
    const size = uiEntry(HUD_ART.bar).size;
    const { frame, fill } = isoBarRects(old, size);
    expect(fill.x).toBeGreaterThan(old.x);
    expect(fill.x + fill.w).toBeLessThan(old.x + old.w);
    expect(fill.y + fill.h / 2).toBeCloseTo(old.y + old.h / 2);
    // Край заливки — під чорнильним кільцем (між його зовнішнім краєм і просвітом), і вгорі, і на кінцях.
    const k = frame.h / size.h;
    const art = HUD_BAR_ART;
    for (const [edge, start] of [
      [fill.y, frame.y],
      [fill.x, frame.x],
    ] as const) {
      expect(edge).toBeGreaterThan(start + art.ink * k);
      expect(edge).toBeLessThan(start + art.gap * k);
    }
    expect(fill.y + fill.h).toBeLessThan(frame.y + (size.h - art.ink) * k);
    expect(fill.y + fill.h).toBeGreaterThan(frame.y + (size.h - art.gap) * k);
    // Намальована рамка заввишки HUD_BAR.height, просвіт із заливкою — ≈ 7 px.
    expect((size.h - 2 * art.margin) * k).toBeCloseTo(HUD_BAR.height);
    expect((size.h - 2 * art.gap) * k).toBeGreaterThan(6.5);
    // Полотно рамки ширше й вище за заливку.
    expect(frame.x).toBeLessThan(fill.x);
    expect(frame.y).toBeLessThan(fill.y);
    expect(frame.x + frame.w).toBeGreaterThan(fill.x + fill.w);
    expect(frame.y + frame.h).toBeGreaterThan(fill.y + fill.h);
  });

  it("запис, без якого інтерфейс не складеться, — помилка, а не запасні числа", () => {
    expect(() => uiEntry("ui/hud/немає")).toThrow();
  });

  it("напис над світом: зелений грошей — токен палітри, невідомий колір — як є", () => {
    expect(isoPopColor("#8fdc7a")).not.toBe("#8fdc7a");
    expect(isoPopColor("#8FDC7A")).toBe(isoPopColor("#8fdc7a"));
    expect(isoPopColor("#123456")).toBe("#123456");
  });
});

describe("кружечок показника нового вигляду", () => {
  // Старі кружечки з контуром 2: показника (радіус 17) і підказки на телефоні (радіус 15).
  for (const outer of [36, 32]) {
    it(`на місці старого завширшки ${outer}: кільце того самого розміру, іконка — на папері з просвітом`, () => {
      const { ring, icon } = statDisc(outer);
      // Чорнильне кільце — як старий кружечок: розклад панелі не змінюється.
      expect(Math.abs(ring * HUD_STAT_ART.ink - outer)).toBeLessThanOrEqual(1);
      // Малюнок іконки — ≈ 0,8 діаметра паперу: між контуром іконки й кільцем видно папір.
      const share = (icon * ICON_DRAWN) / (ring * HUD_STAT_ART.paper);
      expect(share).toBeGreaterThan(HUD_STAT_FILL - 0.05);
      expect(share).toBeLessThan(HUD_STAT_FILL + 0.05);
    });
  }
});

// --- Числа, зняті з SVG A13 -----------------------------------------------------------------------
// Код кладе кадри панелі за намальованим (край смуги, поле, папір кружечка), а цих чисел у маніфесті немає. Поки SVG пакета
// A13 немає, перевірки пропускаються; щойно він є — стережуть, щоб правка арту не зсунула панель непомітно.

const ART_DIR = fileURLToPath(new URL("../art/", import.meta.url));

interface Pt {
  x: number;
  y: number;
}

/** Підконтур: кінці відрізків (точки на самій кривій) і всі точки разом із керувальними. */
interface SubPath {
  ends: Pt[];
  all: Pt[];
}

/** Контур шару: підконтури й половина товщини лінії (0 — залитий). */
interface LayerPath {
  subpaths: SubPath[];
  halfStroke: number;
}

/** Межі намальованого. */
interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** SVG запису `id` (без станів і ракурсів у шляху); файлу ще немає — null. */
function artSvg(id: ArtId): string | null {
  const file = ART_DIR + svgPath(uiEntry(id));
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

/**
 * Підконтури атрибута `d`. Лише абсолютні M, L, H, V, C, Q і Z — так малює A13; інша команда — помилка: перевірку тоді треба
 * доповнити, а не мовчки пропустити. Межі кривих — за керувальними точками (у дугах A13 вони лежать на дотичних).
 */
function subpaths(d: string): SubPath[] {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const out: SubPath[] = [];
  let current: SubPath | null = null;
  let cmd = "";
  let last: Pt = { x: 0, y: 0 };
  let i = 0;
  const take = (): number => {
    const value = Number(tokens[i++]);
    if (Number.isNaN(value)) throw new Error(`у контурі «${d}» бракує числа`);
    return value;
  };
  const point = (): Pt => ({ x: take(), y: take() });
  while (i < tokens.length) {
    const token = tokens[i] ?? "";
    if (/^[A-Za-z]$/.test(token)) {
      cmd = token;
      i++;
      if (!"MLHVCQZ".includes(cmd)) throw new Error(`команди контуру «${cmd}» перевірка не знає`);
      if (cmd === "Z") continue;
    }
    if (cmd === "M") {
      last = point();
      current = { ends: [last], all: [last] };
      out.push(current);
      // Числа після M без команди — відрізки L.
      cmd = "L";
      continue;
    }
    if (!current) throw new Error(`контур «${d}» не починається з M`);
    const points: Pt[] =
      cmd === "L" ? [point()]
      : cmd === "H" ? [{ x: take(), y: last.y }]
      : cmd === "V" ? [{ x: last.x, y: take() }]
      : cmd === "C" ? [point(), point(), point()]
      : cmd === "Q" ? [point(), point()]
      : [];
    if (points.length === 0) throw new Error(`числа без команди в контурі «${d}»`);
    last = points[points.length - 1] ?? last;
    current.all.push(...points);
    current.ends.push(last);
  }
  return out;
}

/** Контури (`<path>`) шару `<g id="…">`. */
function layerPaths(svg: string, layer: string): LayerPath[] {
  const group = parseSvg(svg).nodes.find((node) => node.name === "g" && node.attrs["id"] === layer);
  if (!group) throw new Error(`немає шару ${layer}`);
  const paths: SvgNode[] = [];
  const walk = (node: SvgNode): void => {
    for (const child of node.children) {
      if (child.name === "path") paths.push(child);
      walk(child);
    }
  };
  walk(group);
  return paths.map((path) => {
    const stroked = (path.attrs["stroke"] ?? "none") !== "none";
    return { subpaths: subpaths(path.attrs["d"] ?? ""), halfStroke: stroked ? Number(path.attrs["stroke-width"] ?? 1) / 2 : 0 };
  });
}

/** Межі точок, розширені на `pad` (половину лінії). */
function boxOf(points: readonly Pt[], pad = 0): Box {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { left: Math.min(...xs) - pad, top: Math.min(...ys) - pad, right: Math.max(...xs) + pad, bottom: Math.max(...ys) + pad };
}

/** Межі всього шару разом із лініями. */
function layerBox(paths: readonly LayerPath[]): Box {
  const boxes = paths.flatMap((p) => p.subpaths.map((s) => boxOf(s.all, p.halfStroke)));
  return boxOf(boxes.flatMap((b) => [{ x: b.left, y: b.top }, { x: b.right, y: b.bottom }]));
}

describe("числа кадрів панелі збігаються з SVG A13", () => {
  const band = artSvg(HUD_ART.band);
  it.skipIf(band === null)("смуга: верх — поле, низ чорнильного краю — HUD_BAND.edge, рівний край — від HUD_BAND.side", () => {
    const svg = band ?? "";
    const size = uiEntry(HUD_ART.band).size;
    expect(layerBox(layerPaths(svg, "p-body")).top).toBeCloseTo(HUD_BAND.top, 1);
    const ink = layerPaths(svg, "p-ink");
    expect(layerBox(ink).bottom).toBeCloseTo(HUD_BAND.edge, 0);
    // Рівень краю — найвища точка хвилі посередині смуги; загини з боків — там, де край до нього ще не опустився.
    const ends = ink.flatMap((p) => p.subpaths.flatMap((s) => s.ends));
    const level = Math.min(...ends.filter((p) => p.x > size.w * 0.1 && p.x < size.w * 0.9).map((p) => p.y));
    const low = ends.filter((p) => p.y >= level - 1e-6).map((p) => p.x);
    expect(Math.min(...low)).toBeCloseTo(HUD_BAND.side, 0);
    expect(size.w - Math.max(...low)).toBeCloseTo(HUD_BAND.side, 0);
  });

  const bar = artSvg(HUD_ART.bar);
  it.skipIf(bar === null)("рамка шкали: поле, чорнильне кільце й просвіт — HUD_BAR_ART, з кожного боку", () => {
    const svg = bar ?? "";
    const size = uiEntry(HUD_ART.bar).size;
    const ink = layerPaths(svg, "p-ink");
    // Намальоване — чорнильне кільце й паперовий обідок довкола нього, якщо є (тінь обрізана кільцем).
    const drawn = layerBox([...ink, ...(svg.includes('id="p-paper"') ? layerPaths(svg, "p-paper") : [])]);
    // Кільце — два підконтури (evenodd): зовнішній край і просвіт.
    const rings = ink.flatMap((p) => p.subpaths.map((s) => boxOf(s.all, p.halfStroke))).sort((a, b) => a.left - b.left);
    expect(rings).toHaveLength(2);
    const sides = (box: Box): number[] => [box.left, box.top, size.w - box.right, size.h - box.bottom];
    for (const [i, side] of sides(drawn).entries()) expect(side, `поле, бік ${i}`).toBeCloseTo(HUD_BAR_ART.margin, 1);
    for (const [i, side] of sides(rings[0] ?? drawn).entries()) expect(side, `кільце, бік ${i}`).toBeCloseTo(HUD_BAR_ART.ink, 0);
    for (const [i, side] of sides(rings[1] ?? drawn).entries()) expect(side, `просвіт, бік ${i}`).toBeCloseTo(HUD_BAR_ART.gap, 0);
  });

  const stat = artSvg(HUD_ART.stat);
  it.skipIf(stat === null)("кружечок показника: зовнішній край кільця й папір у ньому — HUD_STAT_ART", () => {
    const size = uiEntry(HUD_ART.stat).size;
    // Кільце — два підконтури (evenodd): зовнішній край і межа паперу.
    const widths = layerPaths(stat ?? "", "p-ink")
      .flatMap((p) => p.subpaths.map((s) => boxOf(s.all, p.halfStroke)))
      .map((b) => (b.right - b.left + b.bottom - b.top) / 2)
      .sort((a, b) => a - b);
    expect(widths).toHaveLength(2);
    expect(widths[1]).toBeCloseTo(HUD_STAT_ART.ink * size.w, 0);
    expect(widths[0]).toBeCloseTo(HUD_STAT_ART.paper * size.w, 0);
  });
});

describe("дрібні написи панелі на зменшеному полотні (hudTextScale; рецензія хвилі 3)", () => {
  it("десктоп (полотно не зменшене) — як було; телефон 844 × 390 — дрібний напис ≈ 12 px CSS, але не більше межі", () => {
    expect(hudTextScale(1)).toBe(1);
    expect(hudTextScale(0.8)).toBe(1);
    // 844 × 390: полотно 720 заввишки — 390 px CSS.
    const phone = hudTextScale(390 / 720);
    expect(phone).toBeGreaterThan(1);
    expect(HUD_SMALL_TEXT * phone * (390 / 720)).toBeCloseTo(HUD_SMALL_TEXT_CSS, 5);
    // Дуже низький екран — не більше межі (смуга панелі тієї самої висоти).
    expect(hudTextScale(0.3)).toBe(HUD_TEXT_MAX);
  });

  it("щільність полотна (DPR) написів не збільшує: масштаб — за px CSS на одиницю інтерфейсу (`CanvasFit.unit`)", () => {
    // Десктоп 1280 × 720 за DPR 2: полотно вдвічі щільніше, а інтерфейс не зменшений — написи як були.
    expect(hudTextScale(1 / canvasFit({ width: 1280, height: 720 }, 2, false).unit)).toBe(1);
    // Телефон 844 × 390 за DPR 3 — так само, як на програмному WebGL (знімки).
    const gpu = hudTextScale(1 / canvasFit({ width: 844, height: 390 }, 3, false).unit);
    expect(gpu).toBe(hudTextScale(1 / canvasFit({ width: 844, height: 390 }, 3, true).unit));
    expect(gpu).toBeCloseTo(hudTextScale(390 / 720), 9);
  });

  it("найбільші написи вміщуються в смугу панелі: дата над годинником і два рядки розкладу", () => {
    // Дата (17 × k) від y 5, годинник 36 опускається на стільки ж; розклад — два рядки 18 × k від y 4 (висота рядка ≈ 1,25).
    const k = HUD_TEXT_MAX;
    expect(26 + Math.round(17 * k) - 17 + 36 * 1.2).toBeLessThanOrEqual(HUD_HEIGHT);
    expect(4 + 2 * Math.round(18 * k) * 1.25).toBeLessThanOrEqual(HUD_HEIGHT);
  });
});
