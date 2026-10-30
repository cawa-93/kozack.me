// Порядок малювання ізометричного світу (крок 16, `GRAPHICS_PLAN.md`, «Проєкція і глибина»): що кого закриває. Меблі й
// сегменти внутрішніх і передніх стін — коробки на підлозі, персонаж, коти, речі на підлозі й бруд — точки. Меблі не
// ріжуться на смуги (смуги дають шви на дробовому зумі): порядок щокадру — топологічне сортування за правилами нижче.
// Задні стіни нічого не закривають — їх запікають у плити кімнат, тож у порядку їх немає. Без Phaser.
//
// Правила (координати в клітинках, слід коробки — [x0, x1) × [y0, y1)):
// - точка p перед коробкою, якщо p.x ≥ x1 або p.y ≥ y1, інакше — за нею;
// - коробка A перед коробкою B, якщо A.x0 ≥ B.x1 або A.y0 ≥ B.y1 (а B перед A — ні); сліди, що перекриваються, — за
//   серединою (x + y, потім x), стабільно;
// - точки між собою — за x + y, потім за x; пласка (бруд, слід паперу) — під тими, хто стоїть на ній чи перед нею;
// - точка на коробці (кіт на меблях) — одразу над нею, а відносно решти — як її коробка, але поверх неї; під коробкою
//   (кіт ховається під меблями) — так само, але одразу за нею.
//
// Порівнюються лише пари, чиї малюнки можуть перекритися на екрані: їхні проміжки x − y (горизонталь екрана) перетинаються.
// Для решти порядок не важить, а саме вони дали б цикли: кіт у кухні «перед» диваном (його x ≥ x1), але далі за x + y від
// кота за диваном. Для слідів, що не перетинаються, «перед» на площині з одним напрямом погляду циклів не має (опуклі
// фігури можна по черзі виносити в одному напрямку — Гібас і Яо); цикл можливий лише через ширину малюнків точок біля кутів
// чи перекриті сліди, і тоді розв'язувач бере з решти найдальшого (найменший x + y) і рахує, скільки разів так зробив.
//
// Пари шукає розгортка: елементи впорядковано за лівим краєм проміжку (сортування вставками — від кадру до кадру порядок
// майже той самий, тож це майже лінійно), а з кожним порівнюються лише ті, чиї проміжки ще не скінчилися: квадрат пар (усі з
// усіма) не рахується. Буфери — у `IsoWork`, що живе між кадрами, тож щокадру нових не виділяється. Коробки квартири (~30) і
// 40 точок — ~10 мкс на кадр. Цикли на квартирі з точками поза слідами меблів — рідкість (~0,4 % кадрів із 40 точками).

import type { Rect } from "../../sim/home";
import { ISO_TILE } from "./projection";

/** Коробка на підлозі: слід [x0, x1) × [y0, y1) у клітинках; `h` — висота в одиницях арту, для довідки (порядку не міняє). */
export interface IsoBox {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly h?: number;
}

/** Точка на підлозі в клітинках: ноги персонажа чи кота, річ на підлозі, бруд. */
export interface IsoPoint {
  readonly x: number;
  readonly y: number;
  /**
   * Індекс коробки (у тому самому виклику), на якій стоїть точка: кіт на меблях. Точка тоді одразу над коробкою, а відносно
   * решти — як вона. Немає чи −1 — на підлозі.
   */
  readonly on?: number;
  /**
   * Разом з `on`: точка під коробкою, а не на ній (кіт ховається під меблями, визираючи з-під краю) — одразу за коробкою,
   * а відносно решти — так само як вона.
   */
  readonly under?: boolean;
  /** Пласка річ на підлозі (бруд, слід паперу): під тими, хто стоїть на ній чи перед нею, хоч би де їхні ноги. */
  readonly flat?: boolean;
  /**
   * Півширина малюнка на екрані, одиниці арту (типово — `ISO_POINT_HALF`, пів ромба): з ким малюнок може перекритися. Ширший
   * за правду — лише зайві порівняння; вужчий — пари, що перекриваються, можуть стати як завгодно.
   */
  readonly half?: number;
}

/** Типова півширина малюнка точки на екрані, одиниці арту: пів ромба плитки (кіт боком, персонаж з розставленими руками). */
export const ISO_POINT_HALF = ISO_TILE.width / 2;
/**
 * Наскільки далі за пласку річ (у x + y) можуть стояти ноги того, хто її закриває: малюнок плями заходить за свою точку не
 * більше ніж на клітинку. Хто стоїть ще далі, з плямою не перекривається, і їхній порядок не важить.
 */
export const FLAT_REACH = 1;

/** Скільки одиниць арту на екрані в одиниці x − y (горизонталь): пів ширини ромба. */
const UNIT = ISO_TILE.width / 2;

const BOX = 0;
const POINT = 1;
const FLAT = 2;

/**
 * Буфери порядку між кадрами: щоб щокадру не виділялися нові (ростуть, лише коли елементів стало більше). Масив, що повертає
 * `isoOrder`, — вид у буфер цієї роботи: дійсний до наступного виклику з нею.
 */
export class IsoWork {
  /** Скільки разів останній порядок розривав цикл: 0 — усі правила виконано. */
  cycles = 0;
  /** Ключ кожного елемента останнього порядку (за його індексом): x + y середини коробки чи точки, у пласкої — мінус `FLAT_REACH`. */
  key = new Float64Array(0);
  /** Другий ключ: x середини чи точки. */
  tie = new Float64Array(0);

  private capacity = 0;
  private lastCount = -1;
  private lo = new Float64Array(0);
  private hi = new Float64Array(0);
  private x0 = new Float64Array(0);
  private y0 = new Float64Array(0);
  private x1 = new Float64Array(0);
  private y1 = new Float64Array(0);
  private kind = new Uint8Array(0);
  private base = new Int32Array(0);
  private under = new Uint8Array(0);
  private perm = new Int32Array(0);
  private active = new Int32Array(0);
  private indeg = new Int32Array(0);
  private start = new Int32Array(0);
  private cursor = new Int32Array(0);
  private heap = new Int32Array(0);
  private done = new Uint8Array(0);
  private out = new Int32Array(0);
  private edgeFrom = new Int32Array(64);
  private edgeTo = new Int32Array(64);
  private adj = new Int32Array(64);
  private edges = 0;

  /** Порядок від найдальшого до найближчого: див. `isoOrder`. */
  order(boxes: readonly IsoBox[], points: readonly IsoPoint[]): Int32Array {
    const nb = boxes.length;
    const n = nb + points.length;
    this.reserve(n);
    this.load(boxes, points);
    this.collectPairs(n);
    this.sort(n);
    return this.out.subarray(0, n);
  }

  private reserve(n: number): void {
    if (n > this.capacity) {
      const c = Math.max(n, this.capacity * 2, 16);
      this.capacity = c;
      this.key = new Float64Array(c);
      this.tie = new Float64Array(c);
      this.lo = new Float64Array(c);
      this.hi = new Float64Array(c);
      this.x0 = new Float64Array(c);
      this.y0 = new Float64Array(c);
      this.x1 = new Float64Array(c);
      this.y1 = new Float64Array(c);
      this.kind = new Uint8Array(c);
      this.base = new Int32Array(c);
      this.under = new Uint8Array(c);
      this.perm = new Int32Array(c);
      this.active = new Int32Array(c);
      this.indeg = new Int32Array(c);
      this.start = new Int32Array(c + 1);
      this.cursor = new Int32Array(c);
      this.heap = new Int32Array(c);
      this.done = new Uint8Array(c);
      this.out = new Int32Array(c);
      this.lastCount = -1;
    }
    // Інша кількість елементів — інші елементи: розгортка починає з порядку за індексом.
    if (n !== this.lastCount) {
      for (let i = 0; i < n; i++) this.perm[i] = i;
      this.lastCount = n;
    }
  }

  private load(boxes: readonly IsoBox[], points: readonly IsoPoint[]): void {
    const nb = boxes.length;
    for (let i = 0; i < nb; i++) {
      const b = boxes[i]!;
      this.x0[i] = b.x0;
      this.y0[i] = b.y0;
      this.x1[i] = b.x1;
      this.y1[i] = b.y1;
      this.lo[i] = b.x0 - b.y1;
      this.hi[i] = b.x1 - b.y0;
      this.key[i] = (b.x0 + b.x1 + b.y0 + b.y1) / 2;
      this.tie[i] = (b.x0 + b.x1) / 2;
      this.kind[i] = BOX;
      this.base[i] = -1;
      this.under[i] = 0;
    }
    for (let j = 0; j < points.length; j++) {
      const p = points[j]!;
      const i = nb + j;
      const flat = p.flat === true;
      const on = p.on !== undefined && Number.isInteger(p.on) && p.on >= 0 && p.on < nb ? p.on : -1;
      const u = p.x - p.y;
      const half = (p.half ?? ISO_POINT_HALF) / UNIT;
      this.x0[i] = this.x1[i] = p.x;
      this.y0[i] = this.y1[i] = p.y;
      // Точка на коробці порівнюється з тими самими, що й коробка.
      this.lo[i] = on >= 0 ? Math.min(u - half, this.lo[on]!) : u - half;
      this.hi[i] = on >= 0 ? Math.max(u + half, this.hi[on]!) : u + half;
      this.key[i] = p.x + p.y - (flat ? FLAT_REACH : 0);
      this.tie[i] = p.x;
      this.kind[i] = flat ? FLAT : POINT;
      this.base[i] = on;
      this.under[i] = on >= 0 && p.under === true ? 1 : 0;
    }
  }

  /** Розгортка за проміжками x − y: ребро «хто за ким» для кожної пари, що може перекритися на екрані. */
  private collectPairs(n: number): void {
    const { perm, lo, hi, active } = this;
    // Сортування вставками за лівим краєм (за однакового — за індексом): з минулого кадру порядок майже той самий.
    for (let i = 1; i < n; i++) {
      const v = perm[i]!;
      const l = lo[v]!;
      let k = i - 1;
      while (k >= 0) {
        const w = perm[k]!;
        const lw = lo[w]!;
        if (lw < l || (lw === l && w < v)) break;
        perm[k + 1] = w;
        k--;
      }
      perm[k + 1] = v;
    }
    this.edges = 0;
    let count = 0;
    for (let s = 0; s < n; s++) {
      const i = perm[s]!;
      const l = lo[i]!;
      // Ті, чиї проміжки скінчилися до цього лівого краю, далі ні з ким не перекриються.
      let kept = 0;
      for (let k = 0; k < count; k++) {
        const a = active[k]!;
        if (hi[a]! > l) active[kept++] = a;
      }
      count = kept;
      for (let k = 0; k < count; k++) {
        const a = active[k]!;
        const r = this.relation(i, a);
        if (r > 0) this.addEdge(a, i);
        else if (r < 0) this.addEdge(i, a);
      }
      active[count++] = i;
    }
  }

  private addEdge(from: number, to: number): void {
    if (this.edges === this.edgeFrom.length) {
      const grow = (old: Int32Array<ArrayBuffer>): Int32Array<ArrayBuffer> => {
        const next = new Int32Array(old.length * 2);
        next.set(old);
        return next;
      };
      this.edgeFrom = grow(this.edgeFrom);
      this.edgeTo = grow(this.edgeTo);
    }
    this.edgeFrom[this.edges] = from;
    this.edgeTo[this.edges] = to;
    this.edges++;
  }

  /** a ближче за b (+1), далі (−1) чи між ними правила немає (0). */
  private relation(a: number, b: number): number {
    const ka = this.kind[a]!;
    const kb = this.kind[b]!;
    if (ka === BOX && kb === BOX) return this.boxes(a, b);
    if (ka === BOX) return -this.relation(b, a);
    const on = this.base[a]!;
    if (kb === BOX) {
      if (on === b) return this.under[a] === 1 ? -1 : 1;
      if (on >= 0) {
        const r = this.boxes(on, b);
        if (r !== 0) return r;
      }
      return this.pointBox(a, b);
    }
    // Дві точки: на різних коробках — як коробки, одна на коробці — інша з цією коробкою.
    const other = this.base[b]!;
    if (on !== other) {
      if (on >= 0 && other >= 0) {
        const r = this.boxes(on, other);
        if (r !== 0) return r;
      } else if (on >= 0) {
        return -this.pointBox(b, on);
      } else {
        return this.pointBox(a, other);
      }
    }
    // На одній коробці: хто під нею — за тим, хто на ній.
    if (this.under[a] !== this.under[b]) return this.under[a] === 1 ? -1 : 1;
    // Обидві на підлозі (чи на одній коробці): пласка — під тим, хто стоїть на ній чи перед нею.
    if (ka !== kb) {
      if (ka === FLAT) return this.x0[b]! + this.y0[b]! >= this.x0[a]! + this.y0[a]! - FLAT_REACH ? -1 : 0;
      return this.x0[a]! + this.y0[a]! >= this.x0[b]! + this.y0[b]! - FLAT_REACH ? 1 : 0;
    }
    return this.before(a, b) ? -1 : 1;
  }

  /** Коробка a ближче за коробку b (+1), далі (−1); сліди розведено по діагоналі — правила немає (0). */
  private boxes(a: number, b: number): number {
    const { x0, y0, x1, y1 } = this;
    const front = x0[a]! >= x1[b]! || y0[a]! >= y1[b]!;
    const back = x0[b]! >= x1[a]! || y0[b]! >= y1[a]!;
    if (front !== back) return front ? 1 : -1;
    if (front) return 0;
    // Сліди перекриваються (ящики на килимі, двері в стіні): стабільно — за серединою.
    return this.before(a, b) ? -1 : 1;
  }

  /** Точка p перед коробкою b (+1), якщо p.x ≥ x1 або p.y ≥ y1, інакше — за нею (−1). */
  private pointBox(p: number, b: number): number {
    return this.x0[p]! >= this.x1[b]! || this.y0[p]! >= this.y1[b]! ? 1 : -1;
  }

  /** a малюється раніше за b, коли між ними немає правила: за ключем, потім за x, потім за індексом. */
  private before(a: number, b: number): boolean {
    const ka = this.key[a]!;
    const kb = this.key[b]!;
    if (ka !== kb) return ka < kb;
    const ta = this.tie[a]!;
    const tb = this.tie[b]!;
    if (ta !== tb) return ta < tb;
    return a < b;
  }

  /** Топологічне сортування (Кан): з готових — найдальший; цикл — розірвати на найдальшому з решти. */
  private sort(n: number): void {
    const { indeg, start, cursor, done, out, edgeFrom, edgeTo } = this;
    const m = this.edges;
    indeg.fill(0, 0, n);
    start.fill(0, 0, n + 1);
    done.fill(0, 0, n);
    for (let e = 0; e < m; e++) {
      const from = edgeFrom[e]! + 1;
      const to = edgeTo[e]!;
      start[from] = start[from]! + 1;
      indeg[to] = indeg[to]! + 1;
    }
    for (let i = 0; i < n; i++) start[i + 1] = start[i + 1]! + start[i]!;
    if (this.adj.length < m) this.adj = new Int32Array(Math.max(m, this.adj.length * 2));
    const adj = this.adj;
    for (let i = 0; i < n; i++) cursor[i] = start[i]!;
    for (let e = 0; e < m; e++) {
      const from = edgeFrom[e]!;
      adj[cursor[from]!] = edgeTo[e]!;
      cursor[from] = cursor[from]! + 1;
    }

    let size = 0;
    for (let i = 0; i < n; i++) if (indeg[i] === 0) size = this.push(size, i);
    let emitted = 0;
    this.cycles = 0;
    while (emitted < n) {
      let v: number;
      if (size > 0) {
        v = this.heap[0]!;
        size = this.pop(size);
      } else {
        // Цикл: жоден з решти не вільний. Береться найдальший — так, ніби правила, що його тримали, не було.
        v = -1;
        for (let i = 0; i < n; i++) if (done[i] === 0 && (v < 0 || this.before(i, v))) v = i;
        this.cycles++;
      }
      done[v] = 1;
      out[emitted++] = v;
      for (let e = start[v]!; e < start[v + 1]!; e++) {
        const w = adj[e]!;
        if (done[w] !== 0) continue;
        indeg[w] = indeg[w]! - 1;
        if (indeg[w] === 0) size = this.push(size, w);
      }
    }
  }

  private push(size: number, v: number): number {
    const heap = this.heap;
    let i = size;
    heap[i] = v;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.before(heap[i]!, heap[parent]!)) break;
      const t = heap[i]!;
      heap[i] = heap[parent]!;
      heap[parent] = t;
      i = parent;
    }
    return size + 1;
  }

  private pop(size: number): number {
    const heap = this.heap;
    const last = size - 1;
    heap[0] = heap[last]!;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let best = i;
      if (l < last && this.before(heap[l]!, heap[best]!)) best = l;
      if (r < last && this.before(heap[r]!, heap[best]!)) best = r;
      if (best === i) break;
      const t = heap[i]!;
      heap[i] = heap[best]!;
      heap[best] = t;
      i = best;
    }
    return last;
  }
}

/**
 * Порядок малювання від найдальшого до найближчого: індекси елементів, де `0…boxes.length − 1` — коробки, а
 * `boxes.length + j` — точка `points[j]`. З `work` масив — вид у її буфер (до наступного виклику) і нічого не виділяється;
 * без неї — новий щоразу (для тестів і разових розрахунків).
 */
export function isoOrder(boxes: readonly IsoBox[], points: readonly IsoPoint[], work: IsoWork = new IsoWork()): Int32Array {
  return work.order(boxes, points);
}

/** Слід речі квартири (`OBJECTS`, §8.4) коробкою. */
export function objectBox(r: Rect, h?: number): IsoBox {
  return { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h, ...(h === undefined ? {} : { h }) };
}
