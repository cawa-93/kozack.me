// Видиме скло вікон (`Pane.glass` у `src/view/decor.ts`, §8.9 «День і ніч»: «вікна вночі — лише темне скло»): уночі темніє й
// на світанку теплішає лише скло стулок, а не весь отвір разом із рамою, укосами, ручками, фіранками й рулонною шторою — інакше
// по межі отвору видно шов. Многокутники скла звіряються з малюнком вікна (`art/env/window/<room>.svg`, растр через sharp):
// усередині них — лише скло (блакитне з відблисками), і вони вкривають майже все скло, яке видно.

import { readFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { artEntry } from "../src/view/art/manifest";
import { PANES, type Pane } from "../src/view/decor";
import { paneGlass, paneQuad } from "../src/view/light/lightmap";
import type { Point } from "../src/view/world/part";
import { ISO } from "../src/view/world/projection";

/** Растр SVG — у стільки разів більший за одиниці арту. */
const SCALE = 4;
/** Скло на малюнку (палітра `art/palette.ts`): шибка й відблиск на ній; між ними — згладжені краї відблисків. */
const rgb = (hex: number): readonly [number, number, number] => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const PANE = rgb(0xa8c4c4);
const SHINE = rgb(0xd4e3dc);
const GLASS = [PANE, SHINE];
/** Пікселі ближче за це до краю многокутника (одиниці арту) — згладжений край чорнила, їх не перевіряємо. */
const EDGE = 0.6;

interface Raster {
  readonly w: number;
  readonly h: number;
  readonly data: Buffer;
}

async function raster(room: string): Promise<Raster> {
  const text = readFileSync(path.join(import.meta.dirname, "..", "art", "env", "window", `${room}.svg`));
  const { data, info } = await sharp(text, { density: 72 * SCALE }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height, data };
}

/** Колір пікселя — скло: непрозорий і на відрізку між кольором шибки й відблиску (з допуском згладжування). */
function glassy(r: Raster, x: number, y: number): boolean {
  const i = (y * r.w + x) * 4;
  const [cr, cg, cb, ca] = [r.data[i]!, r.data[i + 1]!, r.data[i + 2]!, r.data[i + 3]!];
  if (ca < 250) return false;
  const a = PANE;
  const d = [SHINE[0] - a[0], SHINE[1] - a[1], SHINE[2] - a[2]] as const;
  const t = Math.min(1, Math.max(0, ((cr - a[0]) * d[0] + (cg - a[1]) * d[1] + (cb - a[2]) * d[2]) / (d[0] ** 2 + d[1] ** 2 + d[2] ** 2)));
  return [cr, cg, cb].every((c, k) => Math.abs(c - (a[k]! + d[k]! * t)) <= 6);
}

/** Точно колір шибки чи відблиску (не згладжений край): таке скло мусить бути під многокутниками. */
function pureGlass(r: Raster, x: number, y: number): boolean {
  const i = (y * r.w + x) * 4;
  if (r.data[i + 3]! < 255) return false;
  return GLASS.some((c) => Math.abs(r.data[i]! - c[0]) <= 1 && Math.abs(r.data[i + 1]! - c[1]) <= 1 && Math.abs(r.data[i + 2]! - c[2]) <= 1);
}

function inside(poly: readonly Point[], p: Point): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

function edgeDistance(poly: readonly Point[], p: Point): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)));
  }
  return best;
}

/** Многокутники скла вікна в одиницях полотна його кадру (pivot кадру стоїть у верхній вершині ромба клітинки стіни). */
function local(pane: Pane): { glass: Point[][]; hole: Point[] } {
  const entry = artEntry(`env/window/${pane.room}`);
  if (!entry) throw new Error(pane.room);
  const origin = ISO.toScreen(pane.wall);
  const to = (p: Point): Point => ({ x: p.x - origin.x + entry.pivot.x, y: p.y - origin.y + entry.pivot.y });
  return { glass: paneGlass(pane).map((poly) => poly.map(to)), hole: paneQuad(pane).map(to) };
}

describe("видиме скло вікон (Pane.glass)", () => {
  for (const pane of PANES) {
    it(`${pane.room}: многокутники — лише на склі й укривають майже все видне скло`, async () => {
      const r = await raster(pane.room);
      const { glass, hole } = local(pane);
      expect(glass.length, pane.room).toBeGreaterThan(0);
      let checked = 0;
      let covered = 0;
      let total = 0;
      for (let y = 0; y < r.h; y++) {
        for (let x = 0; x < r.w; x++) {
          const p = { x: (x + 0.5) / SCALE, y: (y + 0.5) / SCALE };
          const poly = glass.find((g) => inside(g, p));
          if (poly) {
            // Скло — у межах отвору.
            expect(inside(hole, p), `${pane.room}: (${p.x}, ${p.y}) поза отвором`).toBe(true);
            if (edgeDistance(poly, p) >= EDGE) {
              checked++;
              if (!glassy(r, x, y)) expect.fail(`${pane.room}: під склом не скло — (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) одиниць полотна`);
            }
          }
          if (pureGlass(r, x, y)) {
            total++;
            if (poly) covered++;
          }
        }
      }
      expect(checked, pane.room).toBeGreaterThan(1000);
      // Поза многокутниками лишається хіба смужка скла між рамкою кватирки й рамою та скло під згладженими краями.
      expect(covered / total, `${pane.room}: укрито ${covered} з ${total}`).toBeGreaterThan(0.9);
    });
  }
});
