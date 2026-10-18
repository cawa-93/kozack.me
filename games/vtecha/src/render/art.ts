// Змінні об'єкти й сутності живого шару (§11.4): піксельарт-спрайти з атласу; пам'ять (§7.6) —
// векторні контури. Одиниці — світові пікселі (TILE = 48 на тайл, §4).

import type { Graphics } from "pixi.js";
import { ART_PX_PER_TILE, TILE } from "../config";
import type { Spider } from "../ai/spider";
import type { Item, ItemKind } from "../game/items";
import { GRATE_BAR_HALF, GRATE_BAR_POS, type DoorVariant } from "../maze/grid";
import type { Atlas } from "./sprites";

const S = TILE;

export interface DoorView {
  tx: number;
  ty: number;
  variant: DoorVariant;
  open: boolean;
}

/** Прохід між клітинками тягнеться вертикально (двері — горизонтальна панель). */
const verticalPassage = (ty: number) => ((ty % 2) + 2) % 2 === 0;

// Локальні перетворення як у Canvas2D: transform() додає матрицю справа (append), тож кожен наступний
// зсув чи поворот діє в уже перетвореній системі координат. translateTransform/rotateTransform у Pixi v8
// множать зліва — порядок був би оберненим.
function tr(g: Graphics, x: number, y: number): void {
  g.transform(1, 0, 0, 1, x, y);
}

function rot(g: Graphics, a: number): void {
  const c = Math.cos(a);
  const s = Math.sin(a);
  g.transform(c, s, -s, c, 0, 0);
}

function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ======================= піксельарт-спрайти (§11.4) =======================

let atlas: Atlas | null = null;

/** Атлас спрайтів для живого шару; задається рендерером після завантаження. */
export function setArtAtlas(a: Atlas): void {
  atlas = a;
}

/** Світових пікселів на піксель арту. */
const PX = TILE / ART_PX_PER_TILE;

/** Кадр атласу з опорною точкою (ax, ay) у локальному (0, 0) поточного перетворення. */
function sprite(g: Graphics, name: string, ax = 0.5, ay = 0.5): void {
  const t = atlas!.tex(name);
  const w = t.frame.width * PX;
  const h = t.frame.height * PX;
  g.texture(t, 0xffffff, -Math.round(t.frame.width * ax) * PX, -Math.round(t.frame.height * ay) * PX, w, h);
}

// ======================= двері (§5.6) =======================

export function drawDoor(g: Graphics, d: DoorView, memory = false): void {
  const x = d.tx * S;
  const y = d.ty * S;
  const vert = verticalPassage(d.ty);
  g.save();
  tr(g, x + S / 2, y + S / 2);
  if (!vert) rot(g, Math.PI / 2);
  // Локально: прохід іде вздовж y, панель лежить уздовж x (від стіни до стіни).
  if (!memory) {
    sprite(g, `door_${d.variant}_${d.open ? "open" : "closed"}`);
    g.restore();
    return;
  }
  // Пам'ять (§7.6) — контури.
  const line = { width: 3, color: 0xffffff };
  switch (d.variant) {
    case "wood":
      if (!d.open) g.rect(-S / 2, -S * 0.14, S, S * 0.28).stroke(line);
      else g.rect(-S / 2, -S / 2, S * 0.16, S).stroke(line);
      break;
    case "grate":
      if (!d.open) {
        g.moveTo(-S / 2, 0).lineTo(S / 2, 0).stroke(line);
        for (const p of GRATE_BAR_POS) g.circle(-S / 2 + S * p, 0, S * GRATE_BAR_HALF).stroke(line);
      } else g.moveTo(-S * 0.44, -S / 2).lineTo(-S * 0.44, S / 2).stroke(line);
      break;
    case "rubble":
      if (!d.open) g.poly([-S / 2, S * 0.35, -S * 0.2, -S * 0.4, S * 0.25, -S * 0.35, S / 2, S * 0.3]).stroke(line);
      break;
  }
  g.restore();
}

// ======================= павутина (§10) =======================

/** Стан павутинного тайла для малювання (§10, §10.0.2, §10.4). */
export type WebLook = "intact" | "worn" | "torn" | "burnt";

export const webLook = (w: { torn: boolean; burnt: boolean; passes: number }): WebLook =>
  w.burnt ? "burnt" : w.torn ? "torn" : w.passes > 0 ? "worn" : "intact";

export function drawWeb(g: Graphics, tx: number, ty: number, look: WebLook, memory = false): void {
  const cx = tx * S + S / 2;
  const cy = ty * S + S / 2;
  if (!memory) {
    g.save();
    tr(g, cx, cy);
    sprite(g, `web_${look}`);
    g.restore();
    return;
  }
  // Пам'ять (§7.6): спрощені контури стадії.
  const line = { width: 1.5, color: 0xffffff };
  if (look === "burnt") {
    g.circle(cx, cy, S * 0.3).stroke(line);
    return;
  }
  const spokes = look === "intact" ? 10 : look === "worn" ? 7 : 4;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + hash(tx * 3 + ty) * 0.5;
    const r = look === "torn" ? S * 0.35 : S * 0.6;
    g.moveTo(cx, cy).lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.stroke(line);
  if (look !== "torn") g.circle(cx, cy, S * 0.35).stroke(line);
}

// ======================= предмети (§7.3) =======================

export interface ItemLook {
  kind: ItemKind | "antidote";
  lit: boolean;
  exhausted: boolean;
}

export function itemLook(item: Item | null): ItemLook {
  if (!item) return { kind: "antidote", lit: false, exhausted: false };
  return { kind: item.kind, lit: item.emitsLight, exhausted: item.exhausted };
}

/** Кадр предмета: увімкнений і вичерпаний вигляд, якщо такий кадр є (§7.3.4.0). */
export function itemFrame(look: ItemLook): string {
  const base = `item_${look.kind}`;
  if (look.lit && atlas?.has(`${base}_lit`)) return `${base}_lit`;
  if (look.exhausted && atlas?.has(`${base}_spent`)) return `${base}_spent`;
  return base;
}

/** Предмет у локальних координатах (центр 0,0, «уперед» — +x). */
export function drawItemShape(g: Graphics, look: ItemLook, memory = false): void {
  if (!memory) {
    sprite(g, itemFrame(look));
    return;
  }
  // Пам'ять (§7.6): контур за габаритами кадру.
  const f = atlas?.has(itemFrame(look)) ? atlas.frame(itemFrame(look)) : { w: 6, h: 4 };
  g.rect((-f.w / 2) * PX, (-f.h / 2) * PX, f.w * PX, f.h * PX).stroke({ width: 2, color: 0xffffff });
}

export function drawItemAt(g: Graphics, look: ItemLook, x: number, y: number, angle: number, memory = false): void {
  g.save();
  tr(g, x * S, y * S);
  rot(g, angle);
  drawItemShape(g, look, memory);
  g.restore();
}

export function drawMatch(g: Graphics, x: number, y: number, angle: number, burning: boolean, memory = false): void {
  g.save();
  tr(g, x * S, y * S);
  rot(g, angle);
  if (memory) g.moveTo(-6, 0).lineTo(6, 0).stroke({ width: 2, color: 0xffffff });
  else sprite(g, burning ? "match_burning" : "match_burnt");
  g.restore();
}

/** Пляма плювка (§9.4): згасає розрідженням пікселів, а не прозорістю. */
export function drawSpitDecal(g: Graphics, x: number, y: number, angle: number, alpha: number): void {
  g.save();
  tr(g, x * S, y * S);
  rot(g, Math.round(angle / (Math.PI / 2)) * (Math.PI / 2));
  sprite(g, `spit_decal_${alpha > 0.66 ? 0 : alpha > 0.33 ? 1 : 2}`);
  g.restore();
}

// ======================= гравець (§8) =======================

export interface PlayerLook {
  x: number;
  y: number;
  facing: number;
  hand: ItemLook | null;
  handcuffed: boolean;
  stunned: boolean;
  struggling: boolean;
  walkPhase: number;
  /** Гравець зараз рухається — кадри ходьби, інакше стоїть. */
  moving: boolean;
}

export function drawPlayer(g: Graphics, p: PlayerLook): void {
  g.save();
  tr(g, p.x * S, p.y * S);
  rot(g, p.facing);
  // Кадр: кайданки, предмет у руці, крок ходьби або спокій (§11.4).
  let frame = "player_idle";
  if (p.handcuffed) frame = "player_cuffed";
  else if (p.hand) frame = "player_hold";
  else if (p.moving) frame = Math.sin(p.walkPhase) >= 0 ? "player_walk1" : "player_walk2";
  sprite(g, frame);
  if (p.hand && !p.handcuffed) {
    // Предмет у витягнутій кисті (кадр player_hold: кисть на 4 пікселі вперед і 2 вбік).
    g.save();
    tr(g, 5 * PX, -2 * PX);
    drawItemShape(g, p.hand);
    g.restore();
  }
  if (p.stunned || p.struggling) sprite(g, "player_webbed");
  g.restore();
}

// ======================= павук (§15) =======================

export function drawSpider(g: Graphics, s: Spider, t: number, arachnophobia: boolean): void {
  const cx = s.x * S;
  const cy = s.y * S;
  const f = s.facing + (s.twitch > 0 ? Math.sin(t * 90) * 0.12 : 0);
  if (arachnophobia) {
    // Абстрактна темна пляма з тим самим ритмом (§15): пульсує в такт крокам ніг.
    const pulse = s.legs.some((l) => l.t >= 0) ? 1.08 : 1;
    g.save();
    tr(g, cx, cy);
    rot(g, f);
    g.transform(pulse * (1 + 0.04 * Math.sin(t * 5)), 0, 0, pulse, 0, 0);
    sprite(g, "spider_blob");
    g.restore();
    return;
  }
  const c = Math.cos(f);
  const sn = Math.sin(f);
  const toW = (lx: number, ly: number) => [cx + (lx * c - ly * sn) * S, cy + (lx * sn + ly * c) * S] as const;
  const crouch = s.windup > 0 ? 0.85 : 1;
  // Ноги: стегно → коліно → стопа, 2-кісткова IK з коліном назовні; кінчик — третій сегмент.
  const L1 = 0.42;
  const L2 = 0.46;
  for (const leg of s.legs) {
    const hipLocalX = 0.08 - leg.index * 0.05;
    const hipLocalY = leg.side * 0.1;
    const [hx, hy] = toW(hipLocalX, hipLocalY);
    let fx = leg.footX * S;
    let fy = leg.footY * S;
    if (s.windup > 0 && leg.index === 0) {
      // Поза windup: передні лапи здіймаються над головою (§15).
      [fx, fy] = toW(0.55, leg.side * 0.18);
    }
    const dx = fx - hx;
    const dy = fy - hy;
    let d = Math.hypot(dx, dy);
    const maxD = (L1 + L2) * S * 0.98;
    if (d > maxD) {
      fx = hx + (dx / d) * maxD;
      fy = hy + (dy / d) * maxD;
      d = maxD;
    }
    const a = ((L1 * S) ** 2 - (L2 * S) ** 2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, (L1 * S) ** 2 - a * a));
    const mx = hx + (dx / d) * a;
    const my = hy + (dy / d) * a;
    // Коліно — назовні від осі тіла.
    const nx = -dy / d;
    const ny = dx / d;
    const outward = (nx * -sn + ny * c) * leg.side > 0 ? 1 : -1;
    const kx = mx + nx * h * outward;
    const ky = my + ny * h * outward;
    const lift = leg.t >= 0 ? Math.sin(leg.t * Math.PI) : 0;
      // Піксельні лінії (§11.4): стегно товще, гомілка — у піксель арту, кінчик темний.
    const w1 = PX * (1.4 + lift * 0.4) * crouch;
    g.moveTo(hx, hy).lineTo(kx, ky).stroke({ width: w1, color: 0x3b2c24 });
    g.moveTo(kx, ky).lineTo(fx, fy).stroke({ width: PX, color: 0x2e211b });
    g.moveTo(fx, fy).lineTo(fx + (fx - kx) * 0.2, fy + (fy - ky) * 0.2).stroke({ width: PX, color: 0x0b0a0c });
    // Суглоб — світліший піксель.
    g.rect(kx - PX / 2, ky - PX / 2, PX, PX).fill(0x5a4234);
  }
  // Тіло — спрайт (черевце, головогруди, хеліцери); у windup присідає, стискаючись уздовж (§15).
  g.save();
  tr(g, cx, cy);
  rot(g, f);
  g.transform(crouch, 0, 0, 1, 0, 0);
  sprite(g, "spider_body");
  g.restore();
  // Очі: кластер відблисків по пікселю (§15) — те, що першим ловить світло.
  for (const [lx, ly, bright] of [
    [0.27, -0.04, true],
    [0.27, 0.04, true],
    [0.23, -0.09, false],
    [0.23, 0.09, false],
  ] as const) {
    const [ex, ey] = toW(lx, ly);
    g.rect(ex - PX / 2, ey - PX / 2, PX, PX).fill(bright ? 0xfff6e4 : 0xd8cfb8);
  }
}

export function drawSpit(g: Graphics, x: number, y: number, dx: number, dy: number): void {
  // Слід у польоті — два тьмяні пікселі позаду згустка.
  g.save();
  tr(g, (x - dx * 0.2) * S, (y - dy * 0.2) * S);
  sprite(g, "spit_decal_2");
  g.restore();
  g.save();
  tr(g, x * S, y * S);
  sprite(g, "spit");
  g.restore();
}
