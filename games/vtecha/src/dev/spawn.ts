// Додавання об'єктів поруч із гравцем для панелі розробника (§12.7). Лише режим розробки.
// Об'єкти з'являються так, ніби були там від початку; гарантії генератора (§5.2, §6) на них не діють.

import { PLAYER_RADIUS, SPIDER_RADIUS } from "../config";
import { cellAt, cellCenter, inMaze, spiderDistances } from "../ai/nav";
import { Spider } from "../ai/spider";
import type { Item } from "../game/items";
import { circleOverlapsTile } from "../game/physics";
import type { FloorItem, Web, World } from "../game/world";
import { T, type DoorState, type DoorVariant } from "../maze/grid";
import { angleDiff } from "../vision/geom";

/** Предмет (або протиотрута, якщо null) на підлозі за ≈ 0.4 тайла в напрямку погляду. */
export function spawnItem(w: World, item: Item | null): void {
  const p = w.player;
  let x = p.x + Math.cos(p.facing) * 0.4;
  let y = p.y + Math.sin(p.facing) * 0.4;
  if (!w.map.walkablePlayer(Math.floor(x), Math.floor(y))) {
    x = p.x;
    y = p.y;
  }
  if (item) {
    if (item.kind === "flashlight") item.floorDir = p.facing;
    w.placeOnFloor(item, x, y);
    return;
  }
  const spot = w.findSpot(x, y);
  const fi: FloorItem = { id: w.newObjectId(), item: null, x: spot.x, y: spot.y, fromX: x, fromY: y, roll: 0 };
  w.floorItems.push(fi);
  w.touched.add(fi.id);
}

/** Сусідня з гравцем клітинка (через прохід чи двері), найближча до напрямку погляду. */
function cellAhead(w: World, filter: (cell: number) => boolean): number | null {
  const p = w.player;
  if (!inMaze(w.nav, p.x, p.y)) return null;
  const here = cellAt(w.nav, p.x, p.y);
  const dist = spiderDistances(w.nav, here, () => true);
  let best: number | null = null;
  let bestAng = Infinity;
  for (let c = 0; c < w.nav.w * w.nav.h; c++) {
    if (dist[c] !== 1 || !filter(c)) continue;
    const cc = cellCenter(w.nav, c);
    const ang = Math.abs(angleDiff(Math.atan2(cc.y - p.y, cc.x - p.x), p.facing));
    if (ang < bestAng) {
      best = c;
      bestAng = ang;
    }
  }
  return best;
}

/** Нова ціла павутина в сусідній клітинці в напрямку погляду (не під гравцем). */
export function spawnWeb(w: World): boolean {
  const cell = cellAhead(w, (c) => {
    const cc = cellCenter(w.nav, c);
    return c !== w.level.exitCell && !w.webs.has(w.map.key(Math.floor(cc.x), Math.floor(cc.y)));
  });
  if (cell === null) return false;
  const tx = 2 * (cell % w.nav.w) + 1;
  const ty = 2 * Math.floor(cell / w.nav.w) + 1;
  const web: Web = { id: w.newObjectId(), cell, tx, ty, passes: 0, torn: false, burnt: false, stingerReadyAt: 0 };
  w.webs.set(w.map.key(tx, ty), web);
  w.touched.add(web.id);
  return true;
}

function levelDoorVariant(w: World): DoorVariant {
  const existing = w.doors.find((d) => !d.isCameraRubble);
  if (existing) return existing.variant;
  return w.index === 0 ? "wood" : w.index <= 2 ? "grate" : "rubble";
}

/** Зачинені двері варіанта рівня на найближчому вільному тайлі-проході поруч (§5.6). */
export function spawnDoor(w: World): boolean {
  const p = w.player;
  let best: { tx: number; ty: number } | null = null;
  let bestScore = Infinity;
  for (let ty = Math.floor(p.y) - 3; ty <= Math.floor(p.y) + 3; ty++) {
    for (let tx = Math.floor(p.x) - 3; tx <= Math.floor(p.x) + 3; tx++) {
      // Прохід між двома клітинками: рівно одна координата тайла парна, усередині лабіринту.
      if ((tx % 2 === 0) === (ty % 2 === 0) || !inMaze(w.nav, tx + 0.5, ty + 0.5)) continue;
      if (w.map.get(tx, ty) !== T.Floor) continue;
      if (circleOverlapsTile(p.x, p.y, PLAYER_RADIUS, tx, ty)) continue;
      if (w.floorItems.some((fi) => Math.floor(fi.x) === tx && Math.floor(fi.y) === ty)) continue;
      if (w.spiders.some((s) => circleOverlapsTile(s.x, s.y, SPIDER_RADIUS, tx, ty))) continue;
      const d = Math.hypot(tx + 0.5 - p.x, ty + 0.5 - p.y);
      const ang = Math.abs(angleDiff(Math.atan2(ty + 0.5 - p.y, tx + 0.5 - p.x), p.facing));
      if (d + ang < bestScore) {
        bestScore = d + ang;
        best = { tx, ty };
      }
    }
  }
  if (!best) return false;
  const door: DoorState = {
    id: Math.max(0, ...w.doors.map((d) => d.id)) + 1,
    tx: best.tx,
    ty: best.ty,
    variant: levelDoorVariant(w),
    open: false,
    isCameraRubble: false,
  };
  const key = w.map.key(best.tx, best.ty);
  w.map.set(best.tx, best.ty, T.Door);
  w.map.doors.set(key, door);
  w.doors.push(door);
  for (const s of w.spiders) s.known.set(key, false);
  w.mapVersion++;
  w.touched.add(door.id);
  return true;
}

/** Новий павук за 2–3 клітинки від гравця (за графом павука), у спокої. */
export function spawnSpider(w: World): boolean {
  const p = w.player;
  if (!inMaze(w.nav, p.x, p.y)) return false;
  const here = cellAt(w.nav, p.x, p.y);
  const dist = spiderDistances(w.nav, here, (tx, ty) => w.map.door(tx, ty)?.open ?? false);
  let best = -1;
  let bestScore = Infinity;
  for (let c = 0; c < w.nav.w * w.nav.h; c++) {
    if (dist[c] < 1) continue;
    const cc = cellCenter(w.nav, c);
    const ang = Math.abs(angleDiff(Math.atan2(cc.y - p.y, cc.x - p.x), p.facing));
    const score = Math.abs(dist[c] - 2.5) * 2 + ang;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (best < 0) return false;
  const cc = cellCenter(w.nav, best);
  const s = new Spider(cc.x, cc.y, w.rng);
  s.facing = Math.atan2(p.y - cc.y, p.x - cc.x);
  for (const leg of s.legs) {
    const c = Math.cos(s.facing);
    const sn = Math.sin(s.facing);
    leg.footX = s.x + leg.restX * c - leg.restY * sn;
    leg.footY = s.y + leg.restX * sn + leg.restY * c;
  }
  s.syncDoors(w.map);
  w.spiders.push(s);
  return true;
}
