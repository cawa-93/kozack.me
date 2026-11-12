// Бабл телефона на панелі (§9.9, `Hud.say`): дотик по самому баблу ховає його, а дотик поруч — ні (там квитанція, стани й
// гроші: вони відкривають телефон). Контейнер бабла стоїть у правому верхньому куті бабла, а Phaser перевіряє зону дотику
// контейнера від його центру (`displayOrigin` — половина розміру). Перевірка — тим самим розрахунком, що й Phaser
// (`InputManager.hitTest` → `TransformXY` → `pointWithinHitArea` → `Rectangle.Contains`), з його ж модулів.

import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { newsHitArea } from "../src/view/hudnews";

const require = createRequire(import.meta.url);
/** Модулі вихідного коду Phaser (без вікна браузера): пакет їх не експортує, тож — за шляхом від його `package.json`. */
const root = path.dirname(require.resolve("phaser/package.json"));
const phaser = (file: string): unknown => require(path.join(root, file.replace(/^phaser\//, "")));
type Point = { x: number; y: number };
const TransformXY = phaser("phaser/src/math/TransformXY.js") as (x: number, y: number, px: number, py: number, rotation: number, sx: number, sy: number, out: Point) => Point;
const Rectangle = phaser("phaser/src/geom/rectangle/Rectangle.js") as new (x: number, y: number, w: number, h: number) => object;
const Contains = phaser("phaser/src/geom/rectangle/Contains.js") as (rect: object, x: number, y: number) => boolean;

/** Чи влучає дотик у точку (`px`, `py`) у бабл, чий контейнер стоїть у (`cx`, `cy`) з масштабом `scale` (так, як рахує Phaser). */
function hits(width: number, height: number, cx: number, cy: number, scale: number, px: number, py: number): boolean {
  const { size, area } = newsHitArea(width, height);
  const point = TransformXY(px, py, cx, cy, 0, scale, scale, { x: 0, y: 0 });
  // Контейнер Phaser: `displayOriginX/Y` — завжди половина його розміру (`setSize`).
  const x = point.x + size.width * 0.5;
  const y = point.y + size.height * 0.5;
  return Contains(new Rectangle(area.x, area.y, area.width, area.height), x, y);
}

describe("бабл телефона: дотик по ньому ховає його (§9.9)", () => {
  // Бабл 300 × 100 під телефоном праворуч: контейнер — у правому верхньому куті бабла, бабл — ліворуч і нижче.
  const w = 300;
  const h = 100;
  const cx = 1000;
  const cy = 100;

  it("дотик по баблу — влучає, і в кутах теж", () => {
    for (const scale of [1, 0.85]) {
      const at = (fx: number, fy: number): boolean => hits(w, h, cx, cy, scale, cx - fx * w * scale, cy + fy * h * scale);
      expect(at(0.5, 0.5), `центр, ×${scale}`).toBe(true);
      expect(at(0.98, 0.98), `лівий нижній кут, ×${scale}`).toBe(true);
      expect(at(0.02, 0.02), `правий верхній кут, ×${scale}`).toBe(true);
      expect(at(0.98, 0.02), `лівий верхній кут, ×${scale}`).toBe(true);
    }
  });

  it("дотик поруч із баблом — не влучає: ліворуч-угорі (смуга панелі), праворуч, нижче", () => {
    expect(hits(w, h, cx, cy, 1, cx - 1.5 * w, cy - h / 2)).toBe(false);
    expect(hits(w, h, cx, cy, 1, cx - w / 2, cy - h / 2)).toBe(false);
    expect(hits(w, h, cx, cy, 1, cx + 20, cy + h / 2)).toBe(false);
    expect(hits(w, h, cx, cy, 1, cx - w / 2, cy + h + 20)).toBe(false);
  });

  it("бабл іншого розміру — зона за ним (новий бабл не лишає зони старого)", () => {
    expect(hits(120, 60, cx, cy, 1, cx - 100, cy + 50)).toBe(true);
    expect(hits(120, 60, cx, cy, 1, cx - 200, cy + 50)).toBe(false);
  });
});
