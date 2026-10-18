// Полігони світла й зору гравця на CPU (§7.2). Статичні джерела (світильники, пролом) кешуються,
// доки не змінився стан дверей; джерела гравця й полігон зору перераховуються щокадру.

import type { LightSource, World } from "../game/world";
import { pointInPolygon } from "../vision/geom";
import { visibilityPolygon } from "../vision/visibility";

export const WALL_PENETRATION = 0.25;

export interface LitPolygon {
  src: LightSource;
  poly: number[];
}

export interface VisionFrame {
  lights: LitPolygon[];
  los: number[];
}

export class Lighting {
  private cache = new Map<string, { version: number; poly: number[] }>();
  private world: World | null = null;
  frame: VisionFrame = { lights: [], los: [] };

  compute(world: World, viewCx: number, viewCy: number, viewHalf: number): VisionFrame {
    if (this.world !== world) {
      this.cache.clear();
      this.world = world;
    }
    const opaque = world.opaque;
    const partial = world.lightOccluders; // прути ґрат — лише для світла (§7.2.1)
    const penetrateAt = world.viewPenetration; // полотно зачинених дверей і завали (§7.2)
    const lights: LitPolygon[] = [];
    for (const src of world.collectLights()) {
      // Джерело поза екраном не дає нічого видимого.
      if (Math.abs(src.x - viewCx) > viewHalf + src.radius + 1 || Math.abs(src.y - viewCy) > viewHalf + src.radius + 1) continue;
      let poly: number[];
      if (src.cacheKey) {
        const c = this.cache.get(src.cacheKey);
        if (c && c.version === world.mapVersion) poly = c.poly;
        else {
          poly = visibilityPolygon(src.x, src.y, opaque, { extent: src.radius * 1.25 + 0.2, penetrate: WALL_PENETRATION, partial, penetrateAt });
          this.cache.set(src.cacheKey, { version: world.mapVersion, poly });
        }
      } else {
        poly = visibilityPolygon(src.x, src.y, opaque, {
          extent: src.radius + 0.1,
          sector: src.angle !== undefined ? { dir: src.dir ?? 0, angle: src.angle } : undefined,
          penetrate: WALL_PENETRATION,
          partial,
          penetrateAt,
        });
      }
      lights.push({ src, poly });
    }
    const p = world.player;
    const los = visibilityPolygon(p.x, p.y, opaque, { extent: viewHalf + 3, penetrate: WALL_PENETRATION, penetrateAt });
    this.frame = { lights, los };
    return this.frame;
  }

  /** Чи бачить гравець точку зараз: на лінії зору й хоча б в одному світлі (§7.6). */
  isVisible(x: number, y: number): boolean {
    const f = this.frame;
    if (f.los.length === 0 || !pointInPolygon(f.los, x, y)) return false;
    for (const l of f.lights) {
      if (Math.hypot(x - l.src.x, y - l.src.y) > l.src.radius) continue;
      if (pointInPolygon(l.poly, x, y)) return true;
    }
    return false;
  }
}
