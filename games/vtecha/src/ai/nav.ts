// Навігаційний граф павука (§9.2): клітинки лабіринту; ребро між сусідніми клітинками відкрите,
// якщо тайл між ними — підлога, отвір або двері, які павук ВВАЖАЄ відчиненими (knownDoorStates).

import { T, type TileMap } from "../maze/grid";

export interface NavGrid {
  readonly w: number;
  readonly h: number;
  readonly map: TileMap;
}

/** Тайл між клітинками a і b (сусідніми). */
export function edgeTile(g: NavGrid, a: number, b: number): { tx: number; ty: number } {
  const ax = a % g.w;
  const ay = Math.floor(a / g.w);
  const bx = b % g.w;
  const by = Math.floor(b / g.w);
  return { tx: ax + bx + 1, ty: ay + by + 1 };
}

export function cellCenter(g: NavGrid, id: number): { x: number; y: number } {
  return { x: 2 * (id % g.w) + 1.5, y: 2 * Math.floor(id / g.w) + 1.5 };
}

/** Клітинка, до якої належить точка (прохід між клітинками відходить до лівої/верхньої). */
export function cellAt(g: NavGrid, x: number, y: number): number {
  const cx = Math.max(0, Math.min(g.w - 1, Math.floor((x - 1) / 2)));
  const cy = Math.max(0, Math.min(g.h - 1, Math.floor((y - 1) / 2)));
  return cy * g.w + cx;
}

/** Чи є точка на карті лабіринту (не в префабі камери, §5.4). */
export function inMaze(g: NavGrid, x: number, y: number): boolean {
  return x >= 1 && y >= 1 && x < 2 * g.w && y < 2 * g.h;
}

export type DoorKnowledge = (tx: number, ty: number) => boolean;

/** Сусіди клітинки, відкриті для павука за його знанням про двері. */
export function spiderNeighbors(g: NavGrid, id: number, doorOpen: DoorKnowledge): number[] {
  const cx = id % g.w;
  const cy = Math.floor(id / g.w);
  const out: number[] = [];
  const dirs = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  for (const [dx, dy] of dirs) {
    const nx = cx + dx;
    const ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
    const tx = 2 * cx + 1 + dx;
    const ty = 2 * cy + 1 + dy;
    const t = g.map.get(tx, ty);
    if (t === T.Floor || t === T.Hole || (t === T.Door && doorOpen(tx, ty))) out.push(ny * g.w + nx);
  }
  return out;
}

/** A* по клітинках з octile-евристикою (§9.2). Повертає послідовність клітинок або null. */
export function astar(g: NavGrid, from: number, to: number, doorOpen: DoorKnowledge): number[] | null {
  if (from === to) return [from];
  const n = g.w * g.h;
  const gScore = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const tx = to % g.w;
  const ty = Math.floor(to / g.w);
  const hfn = (id: number) => {
    const dx = Math.abs((id % g.w) - tx);
    const dy = Math.abs(Math.floor(id / g.w) - ty);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  const heap = new MinHeap();
  gScore[from] = 0;
  heap.push(from, hfn(from));
  while (heap.size > 0) {
    const cur = heap.pop();
    if (cur === to) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    for (const nb of spiderNeighbors(g, cur, doorOpen)) {
      const tentative = gScore[cur] + 1;
      if (tentative < gScore[nb]) {
        gScore[nb] = tentative;
        came[nb] = cur;
        heap.push(nb, tentative + hfn(nb));
      }
    }
  }
  if (came[to] < 0) return null;
  const path = [to];
  let c = to;
  while (c !== from) {
    c = came[c];
    path.push(c);
  }
  return path.reverse();
}

/** BFS-відстані від клітинки (у клітинках) за графом павука. */
export function spiderDistances(g: NavGrid, from: number, doorOpen: DoorKnowledge): Int32Array {
  const dist = new Int32Array(g.w * g.h).fill(-1);
  dist[from] = 0;
  const q = [from];
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    for (const nb of spiderNeighbors(g, c, doorOpen)) {
      if (dist[nb] >= 0) continue;
      dist[nb] = dist[c] + 1;
      q.push(nb);
    }
  }
  return dist;
}

class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size(): number {
    return this.ids.length;
  }
  push(id: number, key: number): void {
    const ids = this.ids;
    const keys = this.keys;
    let i = ids.length;
    ids.push(id);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= keys[i]) break;
      [ids[p], ids[i]] = [ids[i], ids[p]];
      [keys[p], keys[i]] = [keys[i], keys[p]];
      i = p;
    }
  }
  pop(): number {
    const ids = this.ids;
    const keys = this.keys;
    const top = ids[0];
    const lastId = ids.pop()!;
    const lastKey = keys.pop()!;
    if (ids.length > 0) {
      ids[0] = lastId;
      keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < ids.length && keys[l] < keys[m]) m = l;
        if (r < ids.length && keys[r] < keys[m]) m = r;
        if (m === i) break;
        [ids[m], ids[i]] = [ids[i], ids[m]];
        [keys[m], keys[i]] = [keys[i], keys[m]];
        i = m;
      }
    }
    return top;
  }
}
