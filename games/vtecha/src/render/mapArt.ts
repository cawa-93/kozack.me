// Незмінна геометрія рівня в Canvas2D: живий шар — піксельарт зі спрайтів атласу, 16 пікселів
// на тайл (§11.4), і контурний шар пам'яті (§7.6).

import { ART_PX_PER_TILE } from "../config";
import { CELL_BAR_HALF, CELL_BAR_POS, T, type Shelf } from "../maze/grid";
import type { LevelData } from "../maze/level";
import type { Atlas } from "./sprites";
import { THEMES } from "./themes";

export interface MapCanvas {
  canvas: HTMLCanvasElement;
  /** Пікселів на тайл. */
  ppt: number;
  originX: number;
  originY: number;
  widthTiles: number;
  heightTiles: number;
}

function hash2(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const isSolid = (t: number) => t === T.Wall || t === T.Void;

/** Варіант підлоги: основний частіше, особливі (пляма, калюжа) рідше. */
function floorVariant(tx: number, ty: number): number {
  const h = hash2(tx, ty, 11);
  return h < 0.5 ? 0 : h < 0.72 ? 1 : h < 0.88 ? 3 : 2;
}

export function drawLiveMap(level: LevelData, atlas: Atlas): MapCanvas {
  const s = ART_PX_PER_TILE;
  const map = level.map;
  const ti = level.index;
  const theme = THEMES[ti];
  const canvas = document.createElement("canvas");
  canvas.width = map.width * s;
  canvas.height = map.height * s;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const ox = map.originX;
  const oy = map.originY;
  const px = (tx: number) => (tx - ox) * s;
  const py = (ty: number) => (ty - oy) * s;

  // Підлога під усім, що не стіна (двері, ґрати, отвори, полиці мають підлогу під собою).
  for (let ty = oy; ty < oy + map.height; ty++) {
    for (let tx = ox; tx < ox + map.width; tx++) {
      const t = map.get(tx, ty);
      if (t !== T.Void && t !== T.Wall) atlas.draw(ctx, `floor_${ti}_${floorVariant(tx, ty)}`, px(tx), py(ty));
    }
  }
  // Стіни й особливі тайли.
  for (let ty = oy; ty < oy + map.height; ty++) {
    for (let tx = ox; tx < ox + map.width; tx++) {
      const t = map.get(tx, ty);
      const x = px(tx);
      const y = py(ty);
      if (t === T.Wall) {
        // Варіант 1 — особливий (обсипана побілка, тріщина): рідше за інші.
        const hv = hash2(tx, ty, 12);
        atlas.draw(ctx, `wall_${ti}_${hv < 0.45 ? 0 : hv < 0.88 ? 2 : 1}`, x, y);
        // Освітлена грань до прохідного сусіда (§7.2, «Стіни на межі зору»).
        if (!isSolid(map.get(tx, ty - 1))) atlas.draw(ctx, `edge_${ti}_n`, x, y);
        if (!isSolid(map.get(tx + 1, ty))) atlas.draw(ctx, `edge_${ti}_e`, x, y);
        if (!isSolid(map.get(tx, ty + 1))) atlas.draw(ctx, `edge_${ti}_s`, x, y);
        if (!isSolid(map.get(tx - 1, ty))) atlas.draw(ctx, `edge_${ti}_w`, x, y);
      } else if (t === T.Hole) {
        const left = map.get(tx - 1, ty);
        atlas.draw(ctx, `hole_${ti}_${isSolid(left) || left === T.Hole ? "h" : "v"}`, x, y);
      } else if (t === T.Bars) atlas.draw(ctx, "bars", x, y);
      else if (t === T.Shelf) drawShelf(ctx, atlas, map.shelves.get(map.key(tx, ty))!, x, y);
      else if (t === T.Breach) atlas.draw(ctx, tx === 0 ? "breach_l" : "breach_r", x, y);
    }
  }
  // Вихід (§5.5): на рівнях 1–4 — у підлозі кутової клітинки; пролом рівня 5 — тайл стіни.
  if (!level.breach) {
    const ex = px(2 * (level.exitCell % level.w) + 1);
    const ey = py(2 * Math.floor(level.exitCell / level.w) + 1);
    const name = theme.exit === "hatch" ? "exit_hatch" : theme.exit === "stairs" ? `exit_stairs_${ti}` : "exit_crack";
    atlas.draw(ctx, name, ex, ey);
  }
  drawDecor(ctx, atlas, level, px, py);
  // Світильники (§7.4): спрайт кріпиться до грані стіни й «дивиться» в прохід.
  for (const l of level.lamps) {
    const name = theme.lampKind === "electric" ? "lamp_electric" : theme.lampKind === "torch" ? (l.lit ? "torch_lit" : "torch_dead") : `mushroom_${ti}`;
    const fx = px(l.tx) + s / 2 + l.nx * (s / 2);
    const fy = py(l.ty) + s / 2 + l.ny * (s / 2);
    atlas.drawRotated(ctx, name, fx, fy, Math.atan2(l.ny, l.nx) - Math.PI / 2, 0.5, 0.15);
  }
  return { canvas, ppt: s, originX: ox, originY: oy, widthTiles: map.width, heightTiles: map.height };
}

// Кольори речей на полицях (палітра генератора, tools/sprites/lib.mjs).
const SHELF_COLORS = {
  boxes: [0x7a5436, 0x5a3c28, 0x9c7249],
  sacks: [0xbf9a6a, 0xa8946e, 0x9c8a66],
  jars: [0x7a2420, 0xc2561e, 0x5a6e34],
  bottles: [0x2c5a38, 0x3f2a1e, 0x2f4658],
};

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

/**
 * Полиця складу (§5.7): рама зі спрайта, речі — піксельні прямокутники на тих самих місцях,
 * що й їхні тіні (§7.2.1).
 */
function drawShelf(ctx: CanvasRenderingContext2D, atlas: Atlas, shelf: Shelf, x: number, y: number): void {
  const s = ART_PX_PER_TILE;
  atlas.draw(ctx, shelf.along === "x" ? "shelf_x" : "shelf_y", x, y);
  for (const it of shelf.items) {
    const a0 = Math.round((it.a - it.len / 2) * s);
    const a1 = Math.max(a0 + 1, Math.round((it.a + it.len / 2) * s));
    const c0 = Math.round((0.5 + it.off - it.depth / 2) * s);
    const c1 = Math.max(c0 + 1, Math.round((0.5 + it.off + it.depth / 2) * s));
    const [rx, ry, rw, rh] = shelf.along === "x" ? [x + a0, y + c0, a1 - a0, c1 - c0] : [x + c0, y + a0, c1 - c0, a1 - a0];
    ctx.fillStyle = hex(SHELF_COLORS[shelf.kind][it.tone]);
    ctx.fillRect(rx, ry, rw, rh);
    if (shelf.kind === "boxes" && rw > 2 && rh > 2) {
      ctx.fillStyle = "#2b1d16";
      ctx.fillRect(rx, ry + rh - 1, rw, 1);
      ctx.fillRect(rx + rw - 1, ry, 1, rh);
      ctx.fillStyle = "#bf9a6a";
      ctx.fillRect(rx, ry, rw - 1, 1);
    } else if (shelf.kind === "sacks" && rw > 2 && rh > 2) {
      ctx.clearRect(rx, ry, 1, 1);
      ctx.clearRect(rx + rw - 1, ry, 1, 1);
      ctx.fillStyle = "#5a3c28";
      ctx.fillRect(rx + 1, ry + rh - 1, rw - 2, 1);
    } else if (shelf.kind === "jars") {
      ctx.fillStyle = "#8a8f98"; // кришка
      ctx.fillRect(rx + Math.floor(rw / 2), ry + Math.floor(rh / 2), 1, 1);
    } else {
      ctx.fillStyle = "#bcc1c8"; // відблиск скла
      ctx.fillRect(rx, ry, 1, 1);
    }
  }
}

/** Декор уздовж стін за темою (§11.2) і речі стартової камери (§5.4.1). Без колізії. */
function drawDecor(ctx: CanvasRenderingContext2D, atlas: Atlas, level: LevelData, px: (t: number) => number, py: (t: number) => number): void {
  const map = level.map;
  const ti = level.index;
  if (ti === 0) {
    // Камера: нари біля бокової стіни, відро, щербата миска, насічки на кладці.
    const c = 2 * (level.startCell % level.w) + 1;
    atlas.draw(ctx, "decor_bunk", px(c - 1) + 1, py(-2) + 2);
    atlas.draw(ctx, "decor_bucket", px(c + 1) + 8, py(-1) + 7);
    atlas.draw(ctx, "decor_bowl", px(c + 1) + 6, py(-2) + 5);
    atlas.draw(ctx, "decor_tally", px(c + 2) + 4, py(-2) + 4);
  }
  for (let ty = map.originY; ty < map.originY + map.height; ty++) {
    for (let tx = map.originX; tx < map.originX + map.width; tx++) {
      if (map.get(tx, ty) !== T.Floor) continue;
      const h = hash2(tx, ty, 300 + ti);
      if (h > 0.1) continue;
      const x = px(tx);
      const y = py(ty);
      const wallUp = map.get(tx, ty - 1) === T.Wall;
      const wallLeft = map.get(tx - 1, ty) === T.Wall;
      switch (ti) {
        case 0:
          // Склад: піддони з ящиками під стінами, павутиння в кутах.
          if (wallUp && ty > 0) {
            atlas.draw(ctx, "decor_pallet", x, y);
            atlas.draw(ctx, "decor_crate", x + 2 + Math.floor(h * 60), y);
          } else if (wallLeft) atlas.draw(ctx, "decor_cornerweb", x, y);
          break;
        case 1:
        case 2:
          // Ланцюги, кокони й хітин — передчуття (§11.2).
          if (wallUp) atlas.draw(ctx, "decor_chain", x + 7, y);
          else if (wallLeft) atlas.draw(ctx, "decor_cocoon", x + 1, y + 4);
          else atlas.draw(ctx, "decor_chitin", x + 5, y + 6);
          break;
        case 3:
          atlas.draw(ctx, "decor_stalagmite", x + (wallLeft ? 1 : 9), y + (wallUp ? 1 : 9));
          break;
        case 4:
          atlas.draw(ctx, "decor_bones", x + 4, y + 6);
          if (wallUp) atlas.draw(ctx, "decor_cornerweb", x, y);
          break;
      }
    }
  }
}

/** Контурна карта пам'яті (§7.6): лише межі стін, отвори, ґрати, вихід і світильники. */
export function drawMemoryMap(level: LevelData, ppt: number): MapCanvas {
  const map = level.map;
  const canvas = document.createElement("canvas");
  canvas.width = map.width * ppt;
  canvas.height = map.height * ppt;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const ox = map.originX;
  const oy = map.originY;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = Math.max(1.5, ppt * 0.08);
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let ty = oy; ty < oy + map.height; ty++) {
    for (let tx = ox; tx < ox + map.width; tx++) {
      if (map.get(tx, ty) !== T.Wall) continue;
      const x = (tx - ox) * ppt;
      const y = (ty - oy) * ppt;
      const open = (dx: number, dy: number) => {
        const t = map.get(tx + dx, ty + dy);
        return t !== T.Wall && t !== T.Void;
      };
      if (open(0, -1)) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + ppt, y);
      }
      if (open(0, 1)) {
        ctx.moveTo(x, y + ppt);
        ctx.lineTo(x + ppt, y + ppt);
      }
      if (open(-1, 0)) {
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + ppt);
      }
      if (open(1, 0)) {
        ctx.moveTo(x + ppt, y);
        ctx.lineTo(x + ppt, y + ppt);
      }
    }
  }
  ctx.stroke();
  ctx.lineWidth = Math.max(1, ppt * 0.05);
  for (let ty = oy; ty < oy + map.height; ty++) {
    for (let tx = ox; tx < ox + map.width; tx++) {
      const t = map.get(tx, ty);
      const x = (tx - ox) * ppt;
      const y = (ty - oy) * ppt;
      if (t === T.Shelf) {
        // Полиця — контур уздовж осі (§7.6).
        const along = map.shelves.get(map.key(tx, ty))!.along;
        if (along === "x") ctx.strokeRect(x + ppt * 0.02, y + ppt * 0.15, ppt * 0.96, ppt * 0.7);
        else ctx.strokeRect(x + ppt * 0.15, y + ppt * 0.02, ppt * 0.7, ppt * 0.96);
      } else if (t === T.Bars) {
        for (const p of CELL_BAR_POS) {
          ctx.beginPath();
          ctx.arc(x + ppt * p, y + ppt * 0.5, ppt * CELL_BAR_HALF, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (t === T.Hole) {
        ctx.setLineDash([ppt * 0.08, ppt * 0.08]);
        ctx.strokeRect(x + ppt * 0.3, y + ppt * 0.3, ppt * 0.4, ppt * 0.4);
        ctx.setLineDash([]);
      }
    }
  }
  if (level.breach) {
    // Пролом у стіні: розрив зовнішньої межі з рваними краями.
    const bx = (level.breach.tx - ox) * ppt;
    const by = (level.breach.ty - oy) * ppt;
    ctx.beginPath();
    ctx.moveTo(bx, by + ppt * 0.15);
    ctx.lineTo(bx + ppt * 0.5, by + ppt * 0.25);
    ctx.lineTo(bx + ppt, by + ppt * 0.12);
    ctx.moveTo(bx, by + ppt * 0.85);
    ctx.lineTo(bx + ppt * 0.5, by + ppt * 0.75);
    ctx.lineTo(bx + ppt, by + ppt * 0.88);
    ctx.stroke();
  } else {
    const ex = (2 * (level.exitCell % level.w) + 1 - ox) * ppt;
    const ey = (2 * Math.floor(level.exitCell / level.w) + 1 - oy) * ppt;
    ctx.strokeRect(ex + ppt * 0.15, ey + ppt * 0.15, ppt * 0.7, ppt * 0.7);
    ctx.strokeRect(ex + ppt * 0.3, ey + ppt * 0.3, ppt * 0.4, ppt * 0.4);
  }
  for (const l of level.lamps) {
    ctx.beginPath();
    ctx.arc((l.tx - ox) * ppt + ppt / 2 + l.nx * ppt * 0.5, (l.ty - oy) * ppt + ppt / 2 + l.ny * ppt * 0.5, ppt * 0.1, 0, Math.PI * 2);
    ctx.stroke();
  }
  return { canvas, ppt, originX: ox, originY: oy, widthTiles: map.width, heightTiles: map.height };
}
