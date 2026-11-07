// Полички зі свічками дня відключення, настільна лампа й свічка на столі замість неї (§4.1 «Планове відключення», §8.9 «День і
// ніч»; рішення автора 2026-11-03: «кіт клубком на підвіконні вітальні лежить поверх свічки — пересунь свічки так, щоб вони не
// пересікались» → «Настінні полички»; «Додати лампу на робочий стіл»; «Під час евенту відключення на столі замість лампи -
// свічка»).
//
// Полички висять на задніх стінах на тлі (`BACKDROP.decal`): усе, що стоїть перед стіною, малюється поверх них. Тож на екрані
// малюнок полички зі свічкою (з полум'ям) не має перетинатися з малюнком кота в жодній позі на жодному місці, де кіт сидить,
// лежить чи спить на меблях, — поодинці, поруч з іншим котом і рядком (`perchCrowds`); кіт на підлозі під поличкою не дістає
// до неї. І поличка не налазить на вікна з фіранками, бра, бойлер, павутину, сліди котів на стінах, рулон паперу, знос
// шпалер і на меблі перед стіною (її видно цілою) і висить подалі від холодильника й шафи.
//
// Рамки — видимий вміст кадрів арту: SVG, растеризований конвеєром атласу (`scripts/art/raster.ts`), обрізаний за альфою —
// те саме, що `trim` кадру в `index.json`. Кіт — скелет `ISO_CAT_RIG` у позі (`composeCatAnim`): об'єднання рамок усіх
// видимих частин, повернутих і масштабованих, як їх ставить `rigsprite.ts`, за весь час анімації, у ракурсах `front` і `back`,
// для різних форм (хвіст, вуха, статура, повнота, живіт вагітної) і найбільшої породи; дивиться праворуч чи ліворуч — окремо.
// Машинерію рамок кота взято з тесту свічок на меблях (попередня спроба, 2026-11-03), який показав, що на меблях свічці місця
// немає.

import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { rasterFrame } from "../scripts/art/raster";
import { topLevelLayers } from "../scripts/art/svg";
import { RELATIONS } from "../src/sim/config";
import { DUST_SPOTS } from "../src/sim/dust";
import { HIGH_PLACES, MAP, objectById, OBJECTS, ROOMS, SURFACE_IDS, TOILET_ROLL, TRINKETS, trinketTile, WINDOWS } from "../src/sim/home";
import type { Shape, Vec } from "../src/sim/types";
import { CAT_OVERLAYS, type CatAnimId } from "../src/view/anim/ids";
import { perchCrowds, type PerchMember } from "../src/view/anim/pairs";
import { LIGHT_ART } from "../src/view/art/manifest/a21-light";
import { WALL_SEGMENTS } from "../src/view/art/manifest/lib/geometry";
import { artEntry } from "../src/view/art/manifest";
import { ART_VIEWS, svgPath, type ArtView } from "../src/view/art/types";
import { BOILER, CANDLE_SHELVES, DESK_CANDLE, DESK_LAMP, PANES, SCONCES, type CandleShelf } from "../src/view/decor";
import { composeCatAnim } from "../src/view/iso/catanim";
import { catSize, ISO_CAT_FIT, ISO_CAT_RIG, isoCatSkin } from "../src/view/iso/catrig";
import { perchPlace, type CatSpot } from "../src/view/iso/catspot";
import { objectScreen } from "../src/view/iso/geometry";
import { cobwebLook, TRACE_OVERLAYS } from "../src/view/iso/looks";
import { deskCandlePivot, deskLampPivot, shelfPivot } from "../src/view/light/sources";
import { CAT_ANIMS } from "../src/view/rig/anims";
import { Rig, slotFrame } from "../src/view/rig/rigcore";
import { ISO_KEYBOARD, isoCatPerch, isoObjectLook } from "../src/view/world/objects";
import { ISO, ISO_WALLS } from "../src/view/world/projection";

/** Прямокутник на екрані чи відносно pivot кадру, одиниці арту. */
interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const unite = (a: Box, b: Box): Box => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
const shifted = (b: Box, x: number, y: number): Box => ({ x0: b.x0 + x, y0: b.y0 + y, x1: b.x1 + x, y1: b.y1 + y });
const flipped = (b: Box): Box => ({ x0: -b.x1, y0: b.y0, x1: -b.x0, y1: b.y1 });
/** Наскільки прямокутники розходяться: > 0 — між ними щілина, ≤ 0 — перетинаються. */
const gapOf = (a: Box, b: Box): number => Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);
const fmt = (b: Box): string => `(${b.x0.toFixed(0)}; ${b.y0.toFixed(0)})–(${b.x1.toFixed(0)}; ${b.y1.toFixed(0)})`;

// --- Видимий вміст кадрів -----------------------------------------------------------------------

/** Роздільність растра для рамок: як у атласі (`DEFAULT_RES`). */
const RES = 2;
const CONTENT = new Map<string, Box | null>();

/** Видимий вміст кадру (запис, стан, ракурс) відносно його pivot, одиниці арту; запису чи вмісту немає — null. */
async function contentBox(id: string, state: string | null, view: ArtView | null): Promise<Box | null> {
  const entry = artEntry(id);
  if (!entry) return null;
  const frame = slotFrame(entry.id, entry, state, view ?? "front");
  const cached = CONTENT.get(frame.frame);
  if (cached !== undefined) return cached;
  const svg = readFileSync(path.join(import.meta.dirname, "..", "art", ...svgPath(entry, frame.view).split("/")), "utf8");
  const r = await rasterFrame({ svg, size: entry.size, res: RES, layers: entry.layers ?? null, fileLayers: topLevelLayers(svg), state: frame.state, states: entry.states ?? [] });
  const box = r.w <= 1 && r.h <= 1 ? null : { x0: r.trim.x / RES - entry.pivot.x, y0: r.trim.y / RES - entry.pivot.y, x1: (r.trim.x + r.w) / RES - entry.pivot.x, y1: (r.trim.y + r.h) / RES - entry.pivot.y };
  CONTENT.set(frame.frame, box);
  return box;
}

/** Вміст усіх станів запису разом. */
async function allStates(id: string): Promise<Box | null> {
  const entry = artEntry(id);
  if (!entry) return null;
  let box: Box | null = null;
  for (const state of entry.states ?? [null]) {
    const b = await contentBox(id, state, null);
    if (b) box = box ? unite(box, b) : b;
  }
  return box;
}

/** Непрозорі пікселі кадру однокадрового запису: рамка обрізки відносно pivot (пікселі `RES`) і альфа. */
interface Mask {
  x0: number;
  y0: number;
  w: number;
  h: number;
  alpha: (i: number, j: number) => number;
}

async function maskOf(id: string, state: string | null): Promise<Mask> {
  const entry = artEntry(id);
  if (!entry) throw new Error(id);
  const svg = readFileSync(path.join(import.meta.dirname, "..", "art", ...svgPath(entry, null).split("/")), "utf8");
  const r = await rasterFrame({ svg, size: entry.size, res: RES, layers: null, fileLayers: topLevelLayers(svg), state, states: entry.states ?? [] });
  const layer = r.layers[0]!;
  return { x0: r.trim.x - entry.pivot.x * RES, y0: r.trim.y - entry.pivot.y * RES, w: r.w, h: r.h, alpha: (i, j) => layer.data[(j * layer.w + i) * 4 + 3]! };
}

/** Чи перетинаються непрозорі пікселі двох кадрів, поставлених pivot-ами в точки `at` (одиниці арту на екрані). */
async function masksTouch(a: { id: string; state: string | null; at: Vec }, b: { id: string; state: string | null; at: Vec }): Promise<boolean> {
  const ma = await maskOf(a.id, a.state);
  const mb = await maskOf(b.id, b.state);
  // Зсув b відносно a у пікселях.
  const dx = Math.round((b.at.x - a.at.x) * RES) + mb.x0 - ma.x0;
  const dy = Math.round((b.at.y - a.at.y) * RES) + mb.y0 - ma.y0;
  for (let j = Math.max(0, dy); j < Math.min(ma.h, dy + mb.h); j++) {
    for (let i = Math.max(0, dx); i < Math.min(ma.w, dx + mb.w); i++) {
      if (ma.alpha(i, j) > 0 && mb.alpha(i - dx, j - dy) > 0) return true;
    }
  }
  return false;
}

// --- Кіт у позах ------------------------------------------------------------------------------

/**
 * Пози, у яких кіт стоїть, сидить чи лежить на речі (`catPose` у `src/view/pose.ts`): усе, крім ходи й бігу, стрибків і поз
 * підлоги (лоток, закопування, килим, кігтеточка, засідка, гра з другом і пером, м'ята, переноска, ковдра, прохолодна плитка,
 * на руках, бійка). Накладки почуттів (`CAT_OVERLAYS`, крім «пручається» на руках) — поверх кожної.
 */
const PERCH_POSES: readonly CatAnimId[] = [
  "sit", "loaf", "sleep", "snore", "groom", "lick", "eat", "drink", "chew", "knock", "sniff", "beg", "window", "keyboard",
  "sulk", "decline", "belly", "arch", "nudge", "cough", "itch", "rubEyes", "sneeze", "vomit",
];
/**
 * Вигнута спина (`arch`: протистояння й бійка, `pose.ts`) — лише там, де сим зводить ворогів: на підлозі, ліжку й дивані
 * (`readyToFaceOff` → `onFloor` у `src/sim/catai.ts`). На решті меблів кіт так не стоїть.
 */
const ARCH_HOSTS: ReadonlySet<string> = new Set(["bed", "sofa"]);
const OVERLAYS: readonly (CatAnimId | null)[] = [null, ...[...CAT_OVERLAYS].filter((id) => id !== "struggle")];

/** Форми кота: звичайна, найбільша (мейн-кун: пухнастий хвіст, вуха з китичками, кремезний; повний, вагітний) і найдовша. */
const SHAPES: readonly { shape: Pick<Shape, "muzzle" | "ears" | "tail" | "build" | "legs">; fat: number; pregnant: boolean }[] = [
  { shape: { muzzle: "normal", ears: "normal", tail: "long", build: "normal", legs: "normal" }, fat: 0, pregnant: false },
  { shape: { muzzle: "flat", ears: "tufted", tail: "fluffy", build: "stocky", legs: "normal" }, fat: 1, pregnant: true },
  { shape: { muzzle: "long", ears: "large", tail: "long", build: "slim", legs: "normal" }, fat: 0, pregnant: false },
];
/** Найбільша порода (дві половини «Розмір» +, `catSize`). */
const BIGGEST = catSize({ ageWeeks: 104, traits: [], breed: ["meinkun", "meinkun"] }).scale;
/** Скільки кадрів анімації брати. */
const SAMPLES = 12;

/** Кадр частини, вмісту якого ще немає: що растеризувати. */
type Missing = Map<string, { art: string; state: string | null; view: ArtView }>;

/**
 * Рамка кота в позі `pose` (дивиться праворуч) відносно точки під ним, × найбільша порода: усі видимі частини скелета (рамка
 * вмісту кадру, повернута й масштабована, як її ставить `rigsprite.ts`) у ракурсах `front` і `back`, у різних формах, з
 * кожною накладкою почуттів `overlays`, у кадрах анімації. Кадри, вмісту яких ще немає (`CONTENT`), записує в `missing`.
 * `parts` — куди скласти рамку кожної частини окремо (у тих самих одиницях): тонше за рамку всієї пози.
 */
function poseBox(pose: CatAnimId, missing: Missing, parts?: Box[], overlays: readonly (CatAnimId | null)[] = OVERLAYS): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const view of ART_VIEWS) {
    for (const { shape, fat, pregnant } of SHAPES) {
      const rig = new Rig(ISO_CAT_RIG, { fit: ISO_CAT_FIT, lookup: artEntry, facing: { view }, skin: isoCatSkin(shape, pregnant), proportions: fat ? [{ name: "fat", weight: fat }] : [] });
      for (const overlay of overlays) {
        const anim = composeCatAnim(CAT_ANIMS[pose], overlay === null ? null : CAT_ANIMS[overlay], { eyes: "open", mouth: "hiss", ears: "up" });
        for (let k = 0; k <= SAMPLES; k++) {
          rig.play(anim as never, 0, { blend: 0, from: (anim.duration * k) / SAMPLES, restart: true });
          rig.evaluate(0);
          for (const slot of rig.slots) {
            if (!slot.visible || slot.art === null) continue;
            const entry = artEntry(slot.art);
            if (!entry) continue;
            const frame = slotFrame(entry.id, entry, slot.state, view).frame;
            const part = CONTENT.get(frame);
            if (part === undefined) {
              missing.set(frame, { art: slot.art, state: slot.state, view });
              continue;
            }
            if (part === null) continue;
            const cos = Math.cos((slot.rot * Math.PI) / 180);
            const sin = Math.sin((slot.rot * Math.PI) / 180);
            const one = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
            for (const [px, py] of [[part.x0, part.y0], [part.x1, part.y0], [part.x0, part.y1], [part.x1, part.y1]] as const) {
              const lx = px * slot.sx;
              const ly = py * slot.sy;
              const x = slot.x + lx * cos - ly * sin;
              const y = slot.y + lx * sin + ly * cos;
              one.x0 = Math.min(one.x0, x);
              one.x1 = Math.max(one.x1, x);
              one.y0 = Math.min(one.y0, y);
              one.y1 = Math.max(one.y1, y);
            }
            x0 = Math.min(x0, one.x0);
            x1 = Math.max(x1, one.x1);
            y0 = Math.min(y0, one.y0);
            y1 = Math.max(y1, one.y1);
            parts?.push({ x0: one.x0 * BIGGEST, y0: one.y0 * BIGGEST, x1: one.x1 * BIGGEST, y1: one.y1 * BIGGEST });
          }
        }
      }
    }
  }
  return { x0: x0 * BIGGEST, y0: y0 * BIGGEST, x1: x1 * BIGGEST, y1: y1 * BIGGEST };
}

// --- Де коти сидять на речах ----------------------------------------------------------------------

const center = (p: Vec): Vec => ({ x: p.x + 0.5, y: p.y + 0.5 });
const tilesOf = (id: string): Vec[] => {
  const o = objectById(id);
  const out: Vec[] = [];
  for (let x = o.x; x < o.x + o.w; x++) for (let y = o.y; y < o.y + o.h; y++) out.push({ x: x + 0.5, y: y + 0.5 });
  return out;
};

/**
 * Де сим лишає кота на речі (`src/sim/catai.ts`; шлях кота закінчується посередині клітинки — `catmove.ts`): річ → точки сима.
 * Решти речей (смітник, шафка з кормом, мішок наповнювача, бак, аптечка, двері) коти не займають: туди сим їх не веде.
 */
function restPoints(): Map<string, Vec[]> {
  const rest = new Map<string, Vec[]>();
  const add = (id: string, ...points: Vec[]): void => void rest.set(id, [...(rest.get(id) ?? []), ...points]);
  // Сон (`sleepSpot`): ліжко й диван — будь-яка клітинка, комп'ютер — будь-яка клітинка ряду; ховаються під ними (не нагорі).
  for (const id of ["bed", "sofa", "computer"]) add(id, ...tilesOf(id));
  // Крадіжка страви (`steal`): перша клітинка поверхні чи плити (`objectTile`); повернення до столу після «ні» — туди ж.
  for (const id of [...SURFACE_IDS, "stove"]) add(id, center(objectById(id)));
  // Дрібнички (`knock`, кухоль — `drink`): клітинка дрібнички (`trinketTile`), а дійшовши — поруч, ліворуч від неї (`seat`).
  for (const t of TRINKETS) add(t.object, center(trinketTile(t.kind)), t.seat);
  // Кран («Фонтанолюб», `beg`), барабан пральки (прокинувся — сидить нагорі), душова кабіна (краплі), ящики біля входу,
  // нагорі холодильника й шафи («Лазіння»).
  for (const id of ["sink", "washer", "shower", "boxes", ...HIGH_PLACES]) add(id, center(objectById(id)));
  // Підвіконня («Вікно», сон теплолюба): місце сима — `WINDOWS[].seat` (вигляд ставить кота посередині дошки, `isoCatPerch`).
  for (const w of WINDOWS) add(w.sill, w.seat);
  return rest;
}

/** Поруч з іншим котом (`standBeside`, `sleptBeside`): на `RELATIONS.beside` у бік середини його клітинки. */
const beside = (p: Vec): Vec => ({ x: p.x + (p.x - Math.floor(p.x) > 0.5 ? -RELATIONS.beside : RELATIONS.beside), y: p.y });

/** Кіт на речі: на якій, точка підлоги під ним (клітинки) і на екрані (з висотою речі). */
interface CatRoot {
  host: string;
  at: Vec;
  root: Vec;
}

/** Точки під котами на меблях: на кожному місці сима — поодинці, поруч з іншим котом, двоє й троє рядком (`perchCrowds`). */
function catRoots(): CatRoot[] {
  const roots: CatRoot[] = [];
  for (const [host, points] of restPoints()) {
    for (const p of points) {
      const b = beside(p);
      for (const group of [[p], [b], [p, b], [p, p], [p, p, p], [p, b, p]]) {
        const perches = group.map((q) => isoCatPerch(host, q, false));
        const members: PerchMember[] = perches.map((perch, i) => {
          const place = perchPlace({ kind: "furniture", at: perch.at, box: host } as CatSpot);
          if (!place) throw new Error(host);
          return { id: i + 1, key: place.key, at: perch.at, size: BIGGEST, area: place.area, partner: null };
        });
        const shifts = perchCrowds(members, new Map());
        members.forEach((m, i) => {
          const s = shifts.get(m.id) ?? { x: 0, y: 0 };
          const at = { x: m.at.x + s.x, y: m.at.y + s.y };
          const screen = ISO.toScreen(at);
          roots.push({ host, at, root: { x: screen.x, y: screen.y - perches[i]!.lift } });
        });
      }
    }
  }
  return roots;
}

// --- Полички ------------------------------------------------------------------------------------

const POSE_BOXES: { pose: CatAnimId; box: Box }[] = [];
let ROOTS: CatRoot[] = [];
const SHELF_BOX = new Map<string, Box>();

/** Малюнок полички на екрані (усі стани разом). */
const shelfBox = (shelf: CandleShelf): Box => {
  const p = shelfPivot(shelf);
  const b = SHELF_BOX.get(shelf.id);
  if (!b) throw new Error(shelf.id);
  return shifted(b, p.x, p.y);
};
const where = (shelf: CandleShelf): string => `поличка ${shelf.room} (${shelf.at.x}; ${shelf.at.y}), z ${shelf.z}`;
/** Щонайменша щілина між рамками на екрані, одиниці арту (≈ 2 px у масштабі гри 0,72): не впритул. */
const MARGIN = 3;

beforeAll(async () => {
  // Спершу — які кадри частин бувають у позах, тоді їх растр (конвеєр — паралельно), тоді рамки поз.
  const missing: Missing = new Map();
  for (const pose of PERCH_POSES) poseBox(pose, missing);
  await Promise.all([...missing.values()].map((f) => contentBox(f.art, f.state, f.view)));
  missing.clear();
  for (const pose of PERCH_POSES) {
    const box = poseBox(pose, missing);
    POSE_BOXES.push({ pose, box }, { pose, box: flipped(box) });
  }
  if (missing.size > 0) throw new Error(`кадри без растра: ${[...missing.keys()].join(", ")}`);
  for (const id of new Set(CANDLE_SHELVES.map((s) => s.id))) {
    const box = await allStates(id);
    if (!box) throw new Error(id);
    SHELF_BOX.set(id, box);
  }
  ROOTS = catRoots();
}, 120_000);

/** Найближчий до полички кіт на меблях: щілина між рамками (≤ 0 — перетинаються), де він і в якій позі. */
function nearestCat(box: Box): { gap: number; who: string } {
  let nearest = { gap: Infinity, who: "" };
  for (const { host, root } of ROOTS) {
    for (const { pose, box: cat } of POSE_BOXES) {
      if (pose === "arch" && !ARCH_HOSTS.has(host)) continue;
      const gap = gapOf(box, shifted(cat, root.x, root.y));
      if (gap < nearest.gap) nearest = { gap, who: `кіт на «${host}» (${root.x.toFixed(0)}; ${root.y.toFixed(0)}), поза «${pose}»` };
    }
  }
  return nearest;
}

/** Уздовж стіни (x для лиця y, y для лиця x). */
const along = (shelf: Pick<CandleShelf, "at" | "face">): number => (shelf.face === "y" ? shelf.at.x : shelf.at.y);
/** Точка лиця задньої стіни на висоті z, на екрані. */
const facePoint = (face: "x" | "y", u: number, z: number): Vec => {
  const p = ISO.toScreen(face === "y" ? { x: u, y: 1 } : { x: 1, y: u });
  return { x: p.x, y: p.y - z };
};
/** Рамка на екрані ділянки лиця задньої стіни: уздовж `u0`–`u1`, висота `z0`–`z1`, з полем `pad` (пів штриха). */
const faceBox = (face: "x" | "y", u0: number, u1: number, z0: number, z1: number, pad: number): Box => {
  const pts = [facePoint(face, u0, z0), facePoint(face, u1, z0), facePoint(face, u0, z1), facePoint(face, u1, z1)];
  return { x0: Math.min(...pts.map((p) => p.x)) - pad, y0: Math.min(...pts.map((p) => p.y)) - pad, x1: Math.max(...pts.map((p) => p.x)) + pad, y1: Math.max(...pts.map((p) => p.y)) + pad };
};

/**
 * Знос на плитах стін (частина кадру стіни, окремо не растеризується): рамки з координат SVG. Кухня — відклеєний кутик шпалер
 * угорі праворуч (`art/env/room/kitchen/wall.svg`: шлях x 413,9–435,7, y 244–283,8 полотна з pivot (76, 272) у
 * `toScreen(13, 1)`, контур 2,5); спальня — затік під стелею (x ≈ 2,45–3,05, z 158–200); ванна — тріснута кахлина над
 * пральною машиною (≈ 10,35; z 90–105).
 */
function wallWear(): { name: string; box: Box }[] {
  const kitchen = ISO.toScreen({ x: 13, y: 1 });
  const dx = kitchen.x - 76;
  const dy = kitchen.y - 272;
  return [
    { name: "відклеєний кутик шпалер кухні", box: { x0: 413.9 + dx - 1.25, y0: 244 + dy - 1.25, x1: 435.7 + dx + 1.25, y1: 283.8 + dy + 1.25 } },
    { name: "затік у спальні", box: faceBox("y", 2.45, 3.05, 158, 200, 1.5) },
    { name: "тріснута кахлина ванної", box: faceBox("y", 10.22, 10.5, 90, 105, 1.5) },
  ];
}

describe("полички зі свічками дня відключення (§4.1, рішення автора 2026-11-03: «Настінні полички»)", () => {
  it("по одній у кожній кімнаті — на лиці задньої стіни своєї кімнати, нижче за кришку стіни; свічок на меблях немає", () => {
    expect(CANDLE_SHELVES.map((s) => s.room).sort()).toEqual(ROOMS.map((r) => r.id).sort());
    for (const shelf of CANDLE_SHELVES) {
      // Лице задньої стіни: ряд y = 0 (лице y = 1) чи стовпець x = 0 (лице x = 1), і за ним справді задня стіна.
      expect(shelf.face === "y" ? shelf.at.y : shelf.at.x, where(shelf)).toBe(1);
      expect(shelf.id, where(shelf)).toBe(shelf.face === "y" ? "env/candle-shelf/back" : "env/candle-shelf/left");
      const u = along(shelf);
      const cell = shelf.face === "y" ? MAP[0]?.[Math.floor(u)] : MAP[Math.floor(u)]?.[0];
      expect(cell, where(shelf)).toBe("#");
      // У межах кімнати вздовж стіни, з запасом на пів полички.
      const room = ROOMS.find((r) => r.id === shelf.room)!;
      const [r0, r1] = shelf.face === "y" ? [room.x, room.x + room.w] : [room.y, room.y + room.h];
      expect(u - 0.2 >= r0 && u + 0.2 <= r1, where(shelf)).toBe(true);
      // Висота: полум'я — як у кадрі; уся поличка нижче за кришку стіни (z 200) з полем.
      expect(shelf.flame - shelf.z, where(shelf)).toBe(LIGHT_ART.shelf[shelf.id].flame);
      const wallTop = facePoint(shelf.face, u, ISO_WALLS.back).y;
      expect(shelfBox(shelf).y0 - wallTop, where(shelf)).toBeGreaterThan(3);
    }
  });

  it("кіт на речі — найбільший, у будь-якій позі — завширшки з клітинку: рамка поз не вироджена", () => {
    const sit = POSE_BOXES.find((b) => b.pose === "sit")!.box;
    expect(sit.x1 - sit.x0).toBeGreaterThan(60);
    expect(-sit.y0).toBeGreaterThan(60);
  });

  it("на екрані поличку не закриває жоден кіт на меблях: поодинці, поруч, рядком, у будь-якій позі", () => {
    for (const shelf of CANDLE_SHELVES) {
      const { gap, who } = nearestCat(shelfBox(shelf));
      expect(gap, `${where(shelf)}: ${who}`).toBeGreaterThan(MARGIN);
    }
  });

  it("кіт на підлозі під поличкою — у будь-якій позі, найбільший — до неї не дістає (поличка вище за голову кота)", () => {
    for (const shelf of CANDLE_SHELVES) {
      const box = shelfBox(shelf);
      // Найближча до стіни вільна підлога під поличкою: від 0,3 від лиця вглиб, поки не підлога (смітник у кухні).
      let out = 0.3;
      const floorAt = (o: number): Vec => (shelf.face === "y" ? { x: shelf.at.x, y: 1 + o } : { x: 1 + o, y: shelf.at.y });
      while (OBJECTS.some((o) => !o.walkable && floorAt(out).x >= o.x && floorAt(out).x < o.x + o.w && floorAt(out).y >= o.y && floorAt(out).y < o.y + o.h)) out += 0.1;
      const root = ISO.toScreen(floorAt(out));
      for (const { pose, box: cat } of POSE_BOXES) {
        const top = root.y + cat.y0;
        expect(box.y1, `${where(shelf)}: кіт на підлозі (${floorAt(out).x.toFixed(2)}; ${floorAt(out).y.toFixed(2)}), поза «${pose}»`).toBeLessThan(top);
      }
    }
  });

  it("не налазить на вікна з фіранками, бра, бойлер, рулон паперу, павутину, сліди котів на стінах і знос шпалер", async () => {
    const decor: { name: string; box: Box }[] = [];
    const add = async (name: string, id: string, at: Vec, flip = false): Promise<void> => {
      const b = await allStates(id);
      if (!b) throw new Error(id);
      decor.push({ name, box: shifted(flip ? flipped(b) : b, at.x, at.y) });
    };
    for (const pane of PANES) await add(`вікно ${pane.room}`, `env/window/${pane.room}`, ISO.toScreen(pane.wall));
    for (const sconce of SCONCES) await add(`бра (${sconce.at.x}; ${sconce.at.y})`, sconce.id, ISO.toScreen(sconce.at));
    await add("бойлер", "env/boiler", ISO.toScreen(BOILER.at));
    await add("рулон паперу", "env/toilet-roll", ISO.toScreen(TOILET_ROLL));
    for (const spot of DUST_SPOTS) {
      if (spot.kind !== "cobweb") continue;
      const look = cobwebLook(spot);
      if (!look) continue;
      const b = await contentBox(look.frame.id, look.frame.state, null);
      if (!b) throw new Error(`павутина ${spot.room}`);
      const at = ISO.toScreen(spot);
      decor.push({ name: `павутина ${spot.room}`, box: shifted(look.flip ? flipped(b) : b, at.x, at.y) });
    }
    // Сліди котів на стінах: на плиті стіни кімнати (pivot — верхня вершина ромба першої клітинки) і на сегментах стін.
    for (const overlay of TRACE_OVERLAYS) {
      const host = overlay.host;
      if (host.kind === "wall") {
        const room = ROOMS.find((r) => r.id === host.room)!;
        await add(overlay.id, overlay.id, ISO.toScreen({ x: room.x, y: room.y }));
      }
      if (host.kind === "segment") {
        const segment = WALL_SEGMENTS.find((s) => s.id === host.segment)!;
        await add(overlay.id, overlay.id, ISO.toScreen(segment.rect));
      }
    }
    decor.push(...wallWear());
    for (const shelf of CANDLE_SHELVES) {
      const box = shelfBox(shelf);
      for (const thing of decor) expect(gapOf(box, thing.box), `${where(shelf)} і ${thing.name} ${fmt(thing.box)}`).toBeGreaterThan(MARGIN);
    }
  });

  it("видно цілою: меблі перед стіною її не закривають, і вона подалі від холодильника й шафи, куди вилазять коти", async () => {
    for (const object of OBJECTS) {
      const b = await allStates(`env/${object.id}`);
      if (!b) continue;
      const at = objectScreen(object);
      const furniture = shifted(b, at.x, at.y);
      for (const shelf of CANDLE_SHELVES) expect(gapOf(shelfBox(shelf), furniture), `${where(shelf)} і ${object.id}`).toBeGreaterThan(MARGIN);
    }
    for (const id of HIGH_PLACES) {
      const o = objectById(id);
      for (const shelf of CANDLE_SHELVES) {
        if (shelf.face !== "y") continue;
        // Уздовж стіни — щонайменше клітинка від краю холодильника чи шафи.
        expect(Math.max(o.x - shelf.at.x, shelf.at.x - (o.x + o.w)), `${where(shelf)} біля ${id}`).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe("настільна лампа на столі з комп'ютером (§8.9, рішення автора 2026-11-03: «Додати лампу на робочий стіл»)", () => {
  const desk = objectById(DESK_LAMP.host);
  const deskArt = artEntry(`env/${DESK_LAMP.host}`);
  if (!deskArt) throw new Error(DESK_LAMP.host);
  /** Точка кадру стола на екрані. */
  const deskPoint = (name: string): Vec => {
    const p = deskArt.points?.[name];
    if (!p) throw new Error(name);
    const at = objectScreen(desk);
    return { x: at.x + p.x - deskArt.pivot.x, y: at.y + p.y - deskArt.pivot.y };
  };

  it("стоїть на стільниці (у сліді стола, на висоті верху), у задньому куті біля стіни", () => {
    const f = isoObjectLook(DESK_LAMP.host).footprint;
    /** Пів основи, клітинки (`art/env/desk-lamp.svg`: Ø 0,18). */
    const BASE = 0.09;
    const { x, y } = DESK_LAMP.at;
    expect(x - BASE >= f.x0 && x + BASE <= f.x1 && y - BASE >= f.y0 && y + BASE <= f.y1).toBe(true);
    expect(DESK_LAMP.z).toBe(isoObjectLook(DESK_LAMP.host).top);
    expect(DESK_LAMP.lamp - DESK_LAMP.z).toBe(LIGHT_ART.deskLamp.lamp);
    // Біля стіни ряду 5 (задній край стола — y = 6) і в правому куті.
    expect(y - f.y0).toBeLessThan(0.25);
    expect(f.x1 - x).toBeLessThan(0.3);
  });

  it("не заступає монітор, клавіатуру й ручку", async () => {
    const lamp = await allStates("env/desk-lamp");
    if (!lamp) throw new Error("env/desk-lamp");
    const p = deskLampPivot();
    const box = shifted(lamp, p.x, p.y);
    // Монітор: кути скла (`screen-*`) з рамкою (≈ 6 довкола скла).
    const glass = ["screen-tl", "screen-tr", "screen-bl", "screen-br"].map(deskPoint);
    const monitor = { x0: Math.min(...glass.map((g) => g.x)) - 6, y0: Math.min(...glass.map((g) => g.y)) - 6, x1: Math.max(...glass.map((g) => g.x)) + 6, y1: Math.max(...glass.map((g) => g.y)) + 6 };
    expect(gapOf(box, monitor), `лампа ${fmt(box)} і монітор ${fmt(monitor)}`).toBeGreaterThan(0);
    // Клавіатура: ≈ 0,5 × 0,2 клітинки довкола точки `keyboard` — на екрані ≈ ±22 × ±12.
    const k = deskPoint("keyboard");
    expect(gapOf(box, { x0: k.x - 22, y0: k.y - 12, x1: k.x + 22, y1: k.y + 12 }), "клавіатура").toBeGreaterThan(0);
    // Ручка на столі (`pen`), поки її не скинули: лежить перед лампою, ліворуч від основи, нижче за абажур — рамки кадрів
    // перетинаються, тож порівнюємо самі пікселі (ручка на стільниці, абажур — над нею).
    const at = deskPoint("pen");
    for (const state of ["off", "on"]) {
      expect(await masksTouch({ id: "env/desk-lamp", state, at: p }, { id: "mess/trinket/pen", state: "standing", at }), `ручка, лампа ${state}`).toBe(false);
    }
  });

  it("кіт на столі — перед лампою (ближче до кімнати): лампа в задньому куті біля стіни, кіт поверх неї стоїть перед нею", async () => {
    // Кіт на столі — над усім, що на ньому (у проміжку глибини стола, `ON` в `iso/apartment.ts`), як над дрібничкою: лампа
    // котів не закриває ніколи. Місця котів на столі — посередині його глибини (y 6,5), а лампа — біля стіни, тож кожен кіт, чий
    // малюнок перекриває лампу, ближчий до кімнати, ніж її основа й абажур (абажур дивиться вперед на ≈ 0,15 клітинки):
    // перекриває її, як і має. Кіт ліворуч від лампи дістає абажура лише витягнутою лапою чи хвостом у крайній позі.
    const lamp = await allStates("env/desk-lamp");
    if (!lamp) throw new Error("env/desk-lamp");
    const p = deskLampPivot();
    const box = shifted(lamp, p.x, p.y);
    let overlapping = 0;
    for (const { host, at, root } of ROOTS) {
      if (host !== DESK_LAMP.host) continue;
      const covers = POSE_BOXES.some(({ box: cat }) => gapOf(box, shifted(cat, root.x, root.y)) <= 0);
      if (!covers) continue;
      overlapping++;
      expect(at.y, `кіт на столі (${at.x.toFixed(2)}; ${at.y.toFixed(2)}) поверх лампи`).toBeGreaterThan(DESK_LAMP.at.y + 0.25);
    }
    // Коти справді бувають поруч із лампою (правий край стола) — перевірка не порожня.
    expect(overlapping).toBeGreaterThan(0);
  });
});

describe("свічка на столі з комп'ютером у день відключення (§4.1, рішення автора 2026-11-03: «Під час евенту відключення на столі замість лампи - свічка»)", () => {
  const desk = objectById(DESK_CANDLE.host);
  const deskArt = artEntry(`env/${DESK_CANDLE.host}`);
  if (!deskArt) throw new Error(DESK_CANDLE.host);
  /** Точка кадру стола на екрані. */
  const deskPoint = (name: string): Vec => {
    const p = deskArt.points?.[name];
    if (!p) throw new Error(name);
    const at = objectScreen(desk);
    return { x: at.x + p.x - deskArt.pivot.x, y: at.y + p.y - deskArt.pivot.y };
  };
  /** Малюнок свічки на екрані: обидва стани разом (з полум'ям). */
  const candleBox = async (): Promise<Box> => {
    const b = await allStates("env/desk-candle");
    if (!b) throw new Error("env/desk-candle");
    const p = deskCandlePivot();
    return shifted(b, p.x, p.y);
  };

  it("стоїть на місці лампи — на стільниці в задньому правому куті біля стіни; полум'я — на `flame` над стільницею", () => {
    expect(DESK_CANDLE.host).toBe(DESK_LAMP.host);
    expect(DESK_CANDLE.at).toEqual(DESK_LAMP.at);
    expect(DESK_CANDLE.z).toBe(isoObjectLook(DESK_CANDLE.host).top);
    expect(DESK_CANDLE.flame - DESK_CANDLE.z).toBe(LIGHT_ART.deskCandle.flame);
  });

  it("не заступає монітор, клавіатуру й ручку", async () => {
    const box = await candleBox();
    const glass = ["screen-tl", "screen-tr", "screen-bl", "screen-br"].map(deskPoint);
    const monitor = { x0: Math.min(...glass.map((g) => g.x)) - 6, y0: Math.min(...glass.map((g) => g.y)) - 6, x1: Math.max(...glass.map((g) => g.x)) + 6, y1: Math.max(...glass.map((g) => g.y)) + 6 };
    expect(gapOf(box, monitor), `свічка ${fmt(box)} і монітор ${fmt(monitor)}`).toBeGreaterThan(0);
    const k = deskPoint("keyboard");
    expect(gapOf(box, { x0: k.x - 22, y0: k.y - 12, x1: k.x + 22, y1: k.y + 12 }), "клавіатура").toBeGreaterThan(0);
    // Ручка лежить перед свічкою, ліворуч від підсвічника: пікселі не перетинаються.
    const at = deskPoint("pen");
    for (const state of ["out", "lit"]) {
      expect(await masksTouch({ id: "env/desk-candle", state, at: deskCandlePivot() }, { id: "mess/trinket/pen", state: "standing", at }), `ручка, свічка ${state}`).toBe(false);
    }
  });

  it("кіт на клавіатурі (сидить на ній — «Кіт і робота», спить — «Сон на комп'ютері») полум'я свічки не закриває", async () => {
    // Кіт, що заважає роботі, — на клавіатурі (`catOnComputer`, `deskSeat`): поза `keyboard` чи сон (`sleep`, з хворобою
    // дихання — `snore`), у різних формах, найбільший, обличчям у будь-який бік, з накладками почуттів. Рамка всієї пози для
    // цього завелика (хвіст на стільниці праворуч і голова вгорі ліворуч дають рамку, що накриває полум'я), тож порівнюємо
    // рамку кожної частини скелета окремо. Хвіст чи лапа перед підсвічником — можна: кіт ближчий до кімнати. Виняток —
    // накладка «попереджає» (`warn`, перед укусом, коли гладять): хвіст б'є, і в мейн-куна, що дивиться ліворуч, кінчик
    // пухнастого хвоста на мить може зайти перед полум'я (рамка повернутої частини — на ≈ 6 одиниць), — кіт і тоді перед свічкою.
    const overlays = OVERLAYS.filter((overlay) => overlay !== "warn");
    const entry = artEntry("env/desk-candle");
    const flame = entry?.points?.["flame"];
    const lit = await contentBox("env/desk-candle", "lit", null);
    if (!entry || !flame || !lit) throw new Error("env/desk-candle#flame");
    // Полум'я з контуром: від верху кадру `lit` до верху свічки (середина полум'я + ≈ 6), на ±6 від осі.
    const p = deskCandlePivot();
    const fx = flame.x - entry.pivot.x;
    const fire = shifted({ x0: fx - 6, y0: lit.y0, x1: fx + 6, y1: flame.y - entry.pivot.y + 6 }, p.x, p.y);
    const seat = isoCatPerch(DESK_CANDLE.host, ISO_KEYBOARD.seat, false);
    const screen = ISO.toScreen(seat.at);
    const root = { x: screen.x, y: screen.y - seat.lift };
    for (const pose of ["keyboard", "sleep", "snore"] as const) {
      const parts: Box[] = [];
      const missing: Missing = new Map();
      poseBox(pose, missing, parts, overlays);
      expect(missing.size, pose).toBe(0);
      expect(parts.length, pose).toBeGreaterThan(0);
      let gap = Infinity;
      for (const part of parts) for (const b of [part, flipped(part)]) gap = Math.min(gap, gapOf(fire, shifted(b, root.x, root.y)));
      expect(gap, `кіт на клавіатурі, поза «${pose}», полум'я ${fmt(fire)}`).toBeGreaterThan(0);
    }
  });

  it("полум'я закриває лише кіт на правому кінці стола, що стоїть перед свічкою; лівий кінець стола — ніколи (відоме, рецензія 2026-11-03)", async () => {
    // Усі місця котів на столі (`ROOTS`: сон на будь-якій клітинці, скидання ручки, поруч з іншим котом, рядком), усі пози на
    // речі, усі накладки почуттів, крім `warn` (вище), найбільший кіт у різних формах, обличчям у будь-який бік; рамки частин
    // скелета окремо. Місця на стільниці, де полум'я не закриває жоден із них, немає: коти бувають уздовж усього стола (x 6,47–
    // 7,9 посередині глибини), і кожен у позі «сидить» — ±73 одиниці арту вшир і до 107 угору, а стіл на екрані — 192 вшир.
    // Свічка на місці лампи (рішення автора: «на столі замість лампи») — у задньому правому куті, тож полум'я закривають лише
    // коти на правому кінці стола (x від ≈ 6,87; найбільше — на ≈ 48 одиниць, жебракує на (7,9; 6,5)), і кожен із них —
    // перед свічкою, ближче до кімнати: закриває її, як закрив би справжній кіт, а не стоїть «за» нею. Відоме для автора
    // (`GRAPHICS_PLAN.md`, «Відомі проблеми», 2; `GAME_DESIGN.md` §4.1). Кіт на лівому кінці (сон на лівій клітинці, крадіжка
    // страви) — ніколи.
    const overlays = OVERLAYS.filter((overlay) => overlay !== "warn");
    const entry = artEntry("env/desk-candle");
    const flame = entry?.points?.["flame"];
    const lit = await contentBox("env/desk-candle", "lit", null);
    if (!entry || !flame || !lit) throw new Error("env/desk-candle#flame");
    const p = deskCandlePivot();
    const fx = flame.x - entry.pivot.x;
    const fire = shifted({ x0: fx - 6, y0: lit.y0, x1: fx + 6, y1: flame.y - entry.pivot.y + 6 }, p.x, p.y);
    const parts = new Map<CatAnimId, Box[]>();
    for (const pose of PERCH_POSES) {
      if (pose === "arch" && !ARCH_HOSTS.has(DESK_CANDLE.host)) continue;
      const list: Box[] = [];
      const missing: Missing = new Map();
      poseBox(pose, missing, list, overlays);
      expect(missing.size, pose).toBe(0);
      parts.set(pose, list);
    }
    let covering = 0;
    let left = 0;
    for (const { host, at, root } of ROOTS) {
      if (host !== DESK_CANDLE.host) continue;
      let gap = Infinity;
      let worst = "";
      for (const [pose, list] of parts) {
        for (const part of list) {
          for (const b of [part, flipped(part)]) {
            const g = gapOf(fire, shifted(b, root.x, root.y));
            if (g < gap) [gap, worst] = [g, pose];
          }
        }
      }
      const where = `кіт на столі (${at.x.toFixed(2)}; ${at.y.toFixed(2)}), поза «${worst}», полум'я ${fmt(fire)}`;
      if (at.x <= 6.7) {
        left++;
        expect(gap, where).toBeGreaterThan(MARGIN);
      }
      if (gap > 0) continue;
      covering++;
      // Закриває — лише той, хто справді перед свічкою.
      expect(at.y, where).toBeGreaterThan(DESK_CANDLE.at.y + 0.25);
      expect(at.x, where).toBeGreaterThan(6.8);
    }
    expect(left).toBeGreaterThan(0);
    // Відоме: коти на правому кінці полум'я закривають (якщо колись перестануть — оновити опис у GRAPHICS_PLAN і GAME_DESIGN).
    expect(covering).toBeGreaterThan(0);
  });

  it("кіт на столі — перед свічкою (ближче до кімнати): свічка в задньому куті біля стіни, кіт поверх неї стоїть перед нею", async () => {
    // Як і лампа: свічка — частина стола (у його проміжку глибини), кіт на столі — над нею. Місця котів на столі — посередині
    // його глибини (y 6,5), а свічка — біля стіни, тож кіт, чий малюнок перекриває свічку чи полум'я, ближчий до кімнати й
    // справді стоїть перед нею.
    const box = await candleBox();
    let overlapping = 0;
    for (const { host, at, root } of ROOTS) {
      if (host !== DESK_CANDLE.host) continue;
      const covers = POSE_BOXES.some(({ box: cat }) => gapOf(box, shifted(cat, root.x, root.y)) <= 0);
      if (!covers) continue;
      overlapping++;
      expect(at.y, `кіт на столі (${at.x.toFixed(2)}; ${at.y.toFixed(2)}) поверх свічки`).toBeGreaterThan(DESK_CANDLE.at.y + 0.25);
    }
    expect(overlapping).toBeGreaterThan(0);
  });
});
