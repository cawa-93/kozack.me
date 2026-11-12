// Маніфест масок скла вікон (§8.9 «День і ніч»): білий силует видимого скла кожного вікна (`Pane.glass` у `src/view/decor.ts`),
// який світло доби тонує кольором скла (`src/view/iso/light.ts`, WebGL). Полотно — лише довкола скла, а не полотно вікна: площа
// маски йде в бюджет атласу. SVG не малюються руками: `tests/glassmask.test.ts` генерує їх із тих самих многокутників і звіряє.

import { GLASS_RECESS, PANES, type Pane } from "../../decor";
import type { ArtEntry, ArtId, ArtPoint, ArtSize } from "../types";
import { iso } from "./lib/geometry";

/** Поле полотна (`art/STYLE.md` §2). */
const FIELD = 4;

/** Маска скла вікна: запис, його полотно й де лівий верхній кут полотна відносно pivot вікна `env/window/<кімната>`. */
export interface GlassMask {
  id: ArtId;
  size: ArtSize;
  origin: ArtPoint;
}

/** Скло вікна від pivot його кадру (верхня вершина ромба клітинки стіни) — те саме, що `paneGlass` на екрані. */
function glassPoints(pane: Pane): ArtPoint[] {
  const depth = 1 - GLASS_RECESS;
  return pane.glass.flatMap((poly) => poly.map(([u, z]) => (pane.face === "y" ? iso({ x: u - pane.wall.x, y: depth }, z) : iso({ x: depth, y: u - pane.wall.y }, z))));
}

/** Маска скла вікна `pane`: полотно на цілих одиницях довкола скла з полем. */
export function glassMask(pane: Pane): GlassMask {
  const points = glassPoints(pane);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const origin = { x: Math.floor(Math.min(...xs)) - FIELD, y: Math.floor(Math.min(...ys)) - FIELD };
  const size = { w: Math.ceil(Math.max(...xs)) + FIELD - origin.x, h: Math.ceil(Math.max(...ys)) + FIELD - origin.y };
  return { id: `env/window/${pane.room}/glass`, size, origin };
}

export const MANIFEST: readonly ArtEntry[] = PANES.map((pane): ArtEntry => {
  const { id, size } = glassMask(pane);
  return { id, size, pivot: { x: 0, y: 0 } };
});
