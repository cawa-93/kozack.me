// Знімки змінних об'єктів для пам'яті про побачене (§7.6): двері, павутина, предмети, сірники,
// кайданки. Знімок оновлюється, коли об'єкт видно зараз, або одразу — після власної дії гравця.

import type { Graphics } from "pixi.js";
import type { World } from "../game/world";
import { drawDoor, drawItemAt, drawMatch, drawWeb, itemLook, webLook, type DoorView, type ItemLook, type WebLook } from "./art";
import type { Lighting } from "./lighting";

type Snapshot =
  | { kind: "door"; x: number; y: number; view: DoorView }
  | { kind: "web"; x: number; y: number; tx: number; ty: number; look: WebLook }
  | { kind: "item"; x: number; y: number; look: ItemLook; rot: number }
  | { kind: "match"; x: number; y: number; rot: number; burning: boolean }
  | { kind: "cuffs"; x: number; y: number; rot: number };

export function itemRotation(id: number): number {
  return ((Math.imul(id, 2654435761) >>> 0) / 4294967296) * Math.PI * 2;
}

export class Memory {
  private snaps = new Map<number, Snapshot>();
  dirty = true;

  reset(): void {
    this.snaps.clear();
    this.dirty = true;
  }

  update(world: World, lighting: Lighting): void {
    const live = new Map<number, Snapshot>();
    for (const d of world.doors) live.set(d.id, { kind: "door", x: d.tx + 0.5, y: d.ty + 0.5, view: { tx: d.tx, ty: d.ty, variant: d.variant, open: d.open } });
    for (const w of world.webs.values()) live.set(w.id, { kind: "web", x: w.tx + 0.5, y: w.ty + 0.5, tx: w.tx, ty: w.ty, look: webLook(w) });
    for (const fi of world.floorItems) live.set(fi.id, { kind: "item", x: fi.x, y: fi.y, look: itemLook(fi.item), rot: fi.item?.kind === "flashlight" ? fi.item.floorDir : 0 });
    for (const m of world.floorMatches) live.set(m.id, { kind: "match", x: m.x, y: m.y, rot: itemRotation(m.id), burning: true });
    for (const d of world.decor) {
      if (d.kind === "match") live.set(d.id, { kind: "match", x: d.x, y: d.y, rot: d.rot, burning: false });
      else if (d.kind === "handcuffs") live.set(d.id, { kind: "cuffs", x: d.x, y: d.y, rot: d.rot });
    }
    for (const [id, snap] of live) {
      if (!world.touched.has(id) && !lighting.isVisible(snap.x, snap.y)) continue;
      const old = this.snaps.get(id);
      if (!old || JSON.stringify(old) !== JSON.stringify(snap)) {
        this.snaps.set(id, snap);
        this.dirty = true;
      }
    }
    // Об'єкт зник: підібраний гравцем (дія гравця) або його місце видно зараз.
    for (const [id, snap] of this.snaps) {
      if (live.has(id)) continue;
      if (world.touched.has(id) || lighting.isVisible(snap.x, snap.y)) {
        this.snaps.delete(id);
        this.dirty = true;
      }
    }
    world.touched.clear();
  }

  draw(g: Graphics): void {
    g.clear();
    for (const s of this.snaps.values()) {
      switch (s.kind) {
        case "door":
          drawDoor(g, s.view, true);
          break;
        case "web":
          drawWeb(g, s.tx, s.ty, s.look, true);
          break;
        case "item":
          drawItemAt(g, s.look, s.x, s.y, s.rot, true);
          break;
        case "match":
          drawMatch(g, s.x, s.y, s.rot, false, true);
          break;
        case "cuffs":
          drawItemAt(g, { kind: "handcuffs", lit: false, exhausted: false }, s.x, s.y, s.rot, true);
          break;
      }
    }
    this.dirty = false;
  }
}
