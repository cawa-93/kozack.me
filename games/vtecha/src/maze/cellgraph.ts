// Граф клітинок лабіринту. Ребро між сусідніми клітинками існує, якщо тайл-прохід між ними
// задовольняє предикат (підлога, двері, отвір — залежно від того, для кого будується граф).

import { DIRS, cellTileX, cellTileY } from "./grid";

export type EdgePredicate = (tx: number, ty: number) => boolean;

export class CellGraph {
  /** adj[i] — індекси сусідніх клітинок. */
  readonly adj: number[][];

  constructor(
    readonly w: number,
    readonly h: number,
    edgeOpen: EdgePredicate,
  ) {
    this.adj = new Array(w * h);
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const list: number[] = [];
        for (const [dx, dy] of DIRS) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const tx = cellTileX(cx) + dx;
          const ty = cellTileY(cy) + dy;
          if (edgeOpen(tx, ty)) list.push(ny * w + nx);
        }
        this.adj[cy * w + cx] = list;
      }
    }
  }

  get size(): number {
    return this.w * this.h;
  }

  id(cx: number, cy: number): number {
    return cy * this.w + cx;
  }

  cx(id: number): number {
    return id % this.w;
  }

  cy(id: number): number {
    return Math.floor(id / this.w);
  }

  degree(id: number): number {
    return this.adj[id].length;
  }

  /** BFS-відстані від start; -1 — недосяжно. blocked — клітинки, крізь які не можна пройти. */
  distances(start: number, blocked?: (id: number) => boolean): Int32Array {
    const dist = new Int32Array(this.size).fill(-1);
    if (blocked?.(start)) return dist;
    const queue = new Int32Array(this.size);
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    dist[start] = 0;
    while (head < tail) {
      const u = queue[head++];
      for (const v of this.adj[u]) {
        if (dist[v] !== -1) continue;
        if (blocked?.(v)) continue;
        dist[v] = dist[u] + 1;
        queue[tail++] = v;
      }
    }
    return dist;
  }

  /** Найкоротший шлях як список клітинок від start до goal включно; null, якщо недосяжно. */
  shortestPath(start: number, goal: number, blocked?: (id: number) => boolean): number[] | null {
    const prev = new Int32Array(this.size).fill(-1);
    const seen = new Uint8Array(this.size);
    const queue = new Int32Array(this.size);
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    while (head < tail) {
      const u = queue[head++];
      if (u === goal) break;
      for (const v of this.adj[u]) {
        if (seen[v] || blocked?.(v)) continue;
        seen[v] = 1;
        prev[v] = u;
        queue[tail++] = v;
      }
    }
    if (!seen[goal]) return null;
    const path: number[] = [];
    for (let v = goal; v !== -1; v = prev[v]) path.push(v);
    return path.reverse();
  }

  /** Чи всі клітинки досяжні одна з одної. */
  isConnected(): boolean {
    const d = this.distances(0);
    for (let i = 0; i < d.length; i++) if (d[i] < 0) return false;
    return true;
  }

  /** Мости графа (Тар'ян, ітеративно). Ключ ребра — min*size+max. */
  bridges(): Set<number> {
    const n = this.size;
    const disc = new Int32Array(n).fill(-1);
    const low = new Int32Array(n);
    const parent = new Int32Array(n).fill(-1);
    const iter = new Int32Array(n);
    const result = new Set<number>();
    let time = 0;
    const stack: number[] = [];
    for (let root = 0; root < n; root++) {
      if (disc[root] !== -1) continue;
      stack.push(root);
      disc[root] = low[root] = time++;
      while (stack.length > 0) {
        const u = stack[stack.length - 1];
        if (iter[u] < this.adj[u].length) {
          const v = this.adj[u][iter[u]++];
          if (disc[v] === -1) {
            parent[v] = u;
            disc[v] = low[v] = time++;
            stack.push(v);
          } else if (v !== parent[u]) {
            low[u] = Math.min(low[u], disc[v]);
          }
        } else {
          stack.pop();
          const p = parent[u];
          if (p !== -1) {
            low[p] = Math.min(low[p], low[u]);
            if (low[u] > disc[p]) result.add(edgeKey(p, u, n));
          }
        }
      }
    }
    return result;
  }

  /**
   * Кількість вершинно-незалежних шляхів start→goal (max-flow з розщепленням вершин, §5.2 крок 4).
   * Рахує до limit і зупиняється — для перевірки «≥ 2» більше не потрібно.
   */
  vertexDisjointPaths(start: number, goal: number, limit = 2): number {
    if (start === goal) return limit;
    const n = this.size;
    // Вузли: in(v) = 2v, out(v) = 2v+1. Ребра зберігаємо як мапу залишкових ємностей.
    const cap = new Map<number, number>();
    const nodes = 2 * n;
    const key = (a: number, b: number) => a * nodes + b;
    const addCap = (a: number, b: number, c: number) => cap.set(key(a, b), (cap.get(key(a, b)) ?? 0) + c);
    const neighbors: number[][] = Array.from({ length: nodes }, () => []);
    const link = (a: number, b: number, c: number) => {
      addCap(a, b, c);
      if (!cap.has(key(b, a))) cap.set(key(b, a), 0);
      neighbors[a].push(b);
      neighbors[b].push(a);
    };
    for (let v = 0; v < n; v++) {
      const inner = v === start || v === goal ? limit : 1;
      link(2 * v, 2 * v + 1, inner);
      for (const u of this.adj[v]) link(2 * v + 1, 2 * u, 1);
    }
    const source = 2 * start;
    const sink = 2 * goal + 1;
    let flow = 0;
    const prev = new Int32Array(nodes);
    while (flow < limit) {
      prev.fill(-1);
      prev[source] = source;
      const queue = [source];
      for (let h = 0; h < queue.length && prev[sink] === -1; h++) {
        const u = queue[h];
        for (const v of neighbors[u]) {
          if (prev[v] === -1 && (cap.get(key(u, v)) ?? 0) > 0) {
            prev[v] = u;
            queue.push(v);
          }
        }
      }
      if (prev[sink] === -1) break;
      for (let v = sink; v !== source; v = prev[v]) {
        const u = prev[v];
        cap.set(key(u, v), cap.get(key(u, v))! - 1);
        cap.set(key(v, u), cap.get(key(v, u))! + 1);
      }
      flow++;
    }
    return flow;
  }
}

export function edgeKey(a: number, b: number, n: number): number {
  return a < b ? a * n + b : b * n + a;
}
