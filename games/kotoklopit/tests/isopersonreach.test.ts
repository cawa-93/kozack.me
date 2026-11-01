// Чим персонаж нового вигляду дотягується до кота (крок 16, T2, `src/view/iso/personreach.ts`): рука, що гладить, — кадр
// ближньої руки, повернутий навколо плеча й ледь розтягнутий, щоб кисть лягла на спинку кота; вудочка під час гри — паличка
// в руці й пучок пір'я над котом з того самого кадру A5, волосінь між ними.

import { describe, expect, it } from "vitest";

import { artEntry } from "../src/view/art/manifest";
import {
  cropPixels,
  featherAt,
  FEATHER,
  featherRect,
  lineEnd,
  palmAt,
  reachArm,
  reachedPose,
  REACH_STRETCH,
  REACH_TURN,
  ROD_PLAY,
  STROKE,
  type PartPose,
} from "../src/view/iso/personreach";

const DEG = Math.PI / 180;

/** Точка кадру (`local`, одиниці від pivot) у системі кореня для пози кадру `pose` (як ставить Phaser: R(rot) · S(sx, sy)). */
function placed(pose: PartPose, local: { x: number; y: number }): { x: number; y: number } {
  const x = local.x * pose.sx;
  const y = local.y * pose.sy;
  const c = Math.cos(pose.rot * DEG);
  const s = Math.sin(pose.rot * DEG);
  return { x: pose.x + x * c - y * s, y: pose.y + x * s + y * c };
}

describe("рука, що гладить (§8.2)", () => {
  it("долоня ходить уздовж спинки туди-сюди", () => {
    const back = { x: 50, y: 80 };
    const xs = new Set<number>();
    for (let t = 0; t < 2000; t += 50) {
      const p = palmAt(back, t);
      expect(p.y).toBe(back.y);
      expect(Math.abs(p.x - back.x)).toBeLessThanOrEqual(STROKE.swing);
      xs.add(Math.round(p.x));
    }
    expect(xs.size).toBeGreaterThan(3);
  });

  it("рука повертається навколо плеча до цілі й розтягується в межах `REACH_STRETCH`", () => {
    const shoulder = { x: 0, y: 0 };
    const hand = { x: 0, y: 40 };
    const near = reachArm(shoulder, hand, { x: 30, y: 40 });
    expect(near.stretch).toBeCloseTo(1.25);
    expect(near.turn).toBeCloseTo(Math.atan2(40, 30) / DEG - 90);
    expect(near.palm.x).toBeCloseTo(30);
    expect(near.palm.y).toBeCloseTo(40);
    // Далеко — тягнеться, але не дістає: не довша за 1,3.
    const far = reachArm(shoulder, hand, { x: 0, y: 200 });
    expect(far.stretch).toBe(REACH_STRETCH.max);
    expect(far.turn).toBeCloseTo(0);
    expect(far.palm.y).toBeCloseTo(40 * REACH_STRETCH.max);
    // Кут — коротшим шляхом.
    const behind = reachArm(shoulder, hand, { x: -1, y: -40 });
    expect(Math.abs(behind.turn)).toBeLessThanOrEqual(180);
  });

  it("ціль під самим плечем (кіт за персонажем) — рука не крутиться за долонею, а вкорочується в напрямку анімації", () => {
    const shoulder = { x: 0, y: 0 };
    const hand = { x: 0, y: 40 };
    for (const target of [
      { x: 6, y: 2 },
      { x: -6, y: 2 },
      { x: 0, y: -8 },
    ]) {
      const reach = reachArm(shoulder, hand, target);
      expect(reach.turn).toBeCloseTo(0);
      expect(reach.stretch).toBe(REACH_STRETCH.min);
      expect(reach.palm.x).toBeCloseTo(0);
    }
    // Між `from` і `full` — повертається частково, далі — цілком.
    const mid = reachArm(shoulder, hand, { x: 40 * ((REACH_TURN.from + REACH_TURN.full) / 2), y: 0 });
    expect(Math.abs(mid.turn)).toBeGreaterThan(0);
    expect(Math.abs(mid.turn)).toBeLessThan(90);
    expect(reachArm(shoulder, hand, { x: 40 * REACH_TURN.full, y: 0 }).turn).toBeCloseTo(-90);
  });

  it("кадр руки в новій позі кладе кисть туди, куди вона дотягнулася, — за будь-якої пози анімації", () => {
    // Кадр руки звисає вздовж своєї осі y: від плеча (pivot) до хвату — 47 одиниць (як `person/arm`).
    const grip = { x: 1.2, y: 47 };
    for (const rot of [-80, -30, 0, 25, 60]) {
      for (const k of [0.88, 1, 1.15]) {
        const slot: PartPose = { x: 3, y: -100, rot, sx: k, sy: 1 };
        const shoulder = { x: slot.x, y: slot.y };
        const hand = placed(slot, grip);
        for (const target of [
          { x: 40, y: -40 },
          { x: -20, y: -60 },
          { x: 10, y: -10 },
        ]) {
          const reach = reachArm(shoulder, hand, target);
          const pose = reachedPose(slot, shoulder, hand, reach);
          // Хват ледь збоку від осі кадру (1,2 на 47), тож розтяг уздовж осі зсуває його на частки одиниці.
          const at = placed(pose, grip);
          expect(Math.hypot(at.x - reach.palm.x, at.y - reach.palm.y)).toBeLessThan(0.6);
          // Розтягнуто вздовж руки (вісь y кадру), а не впоперек.
          expect(pose.sx).toBe(slot.sx);
        }
      }
    }
  });
});

describe("вудочка під час гри (§8.2, кадр A5 `item/toy/*` [hand])", () => {
  it("пір'їнка кружляє над головою кота, у межах розмаху", () => {
    const head = { x: 200, y: 300 };
    for (let t = 0; t < 3000; t += 37) {
      const f = featherAt(head, t);
      expect(Math.abs(f.x - head.x)).toBeLessThanOrEqual(FEATHER.swingX + 1e-9);
      expect(f.y).toBeLessThan(head.y);
      expect(head.y - FEATHER.lift - f.y).toBeLessThanOrEqual(FEATHER.swingY + 1e-9);
    }
    expect(featherAt(head, 0)).not.toEqual(featherAt(head, 400));
  });

  it("паличка в руці — з хватом і кінчиком у межах полотна; пучок — навколо точки `feather`; волосінь — у верх пучка", () => {
    for (const id of ["item/toy/cheap", "item/toy/premium"] as const) {
      const entry = artEntry(id);
      expect(entry, id).toBeDefined();
      if (!entry) continue;
      const stick = ROD_PLAY.stick;
      const inside = (p: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }): boolean =>
        p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
      expect(stick.x + stick.w).toBeLessThanOrEqual(entry.size.w);
      expect(stick.y + stick.h).toBeLessThanOrEqual(entry.size.h);
      expect(inside(entry.pivot, stick), "хват у паличці").toBe(true);
      expect(inside(ROD_PLAY.tip, stick), "кінчик у паличці").toBe(true);
      const feather = entry.points?.["feather"];
      expect(feather, `${id}: точка feather`).toBeDefined();
      if (!feather) continue;
      const bunch = featherRect(feather);
      expect(inside(feather, bunch)).toBe(true);
      expect(bunch.x).toBeGreaterThanOrEqual(0);
      expect(bunch.y).toBeGreaterThanOrEqual(0);
      expect(bunch.x + bunch.w).toBeLessThanOrEqual(entry.size.w);
      expect(bunch.y + bunch.h).toBeLessThanOrEqual(entry.size.h);
      // Пучок — нижче за паличку (мотузка звисає з кінчика), тож обтята паличка пучка не має.
      expect(feather.y).toBeGreaterThan(stick.y + stick.h);
    }
    expect(lineEnd({ x: 10, y: 50 })).toEqual({ x: 10, y: 50 - ROD_PLAY.feather.top });
  });

  it("обтинання — у пікселях текстури: одиниці × роздільність кадру", () => {
    const rect = { x: 2, y: 3, w: 10, h: 20 };
    expect(cropPixels(rect, 256, 128)).toEqual({ x: 4, y: 6, w: 20, h: 40 });
    expect(cropPixels(rect, 128, 128)).toEqual(rect);
  });
});
