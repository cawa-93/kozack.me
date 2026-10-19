// «Бот-гравець» для симуляції балансу (§11.2): проживає дні гри, як простий уважний гравець,
// справжнім рухом квартирою й тими самими діями, що й людина. Пріоритети — нагальне (кіт на
// клавіатурі, безлад, порожні миски) раніше за своє (їжа, душ) і роботу.

import { petTolerance } from "../src/sim/actions";
import { isMoving } from "../src/sim/body";
import { catOnComputer, isDirty, itemsOf } from "../src/sim/catai";
import { PRODUCTS, WATER_CAPACITY } from "../src/sim/config";
import { order, supplyCount } from "../src/sim/economy";
import { advance, goToSleep, interact } from "../src/sim/game";
import { distanceToRect, isSolid, MAP_HEIGHT, MAP_WIDTH, objectById, slotById, type Rect } from "../src/sim/home";
import { hoursUntilWake } from "../src/sim/sleep";
import { targetById, targetOf } from "../src/sim/targets";
import type { Cat, GameState, NightReport, Product, Save, Vec } from "../src/sim/types";
import { isWorkday, isWorkTime, positionOf } from "../src/sim/work";
import { POSITIONS } from "../src/sim/config";

/** Скільки ігрових хвилин один крок ходьби. */
const WALK_STEP = 0.1;
const HOLD_STEP = 0.5;

export interface BotPolicy {
  /** У скільки разів більше працювати, ніж вимагає посада (частка присутності × 9 годин). */
  work: number;
  /** Нижче цього здорового глузду бот іде пестити котів. */
  sanityTarget: number;
}

export const DEFAULT_POLICY: BotPolicy = { work: 1.3, sanityTarget: 65 };

/** Що бот робив: години за категоріями (для звіту). */
export interface BotLog {
  worked: number;
  petted: number;
  played: number;
  walked: number;
}

type Task = () => void;

export class Bot {
  readonly log: BotLog = { worked: 0, petted: 0, played: 0, walked: 0 };
  private workedToday = 0;

  constructor(
    readonly save: Save,
    readonly policy: BotPolicy = DEFAULT_POLICY,
    /** Трасування для налагодження: назва кожного кроку. */
    private readonly trace: ((task: string) => void) | null = null,
  ) {}

  private get state(): GameState {
    return this.save.current;
  }

  /** Прожити день до сну. Повертає звіт ночі або null, якщо гра закінчилася. */
  day(): NightReport | null {
    this.workedToday = 0;
    const day = this.state.day;
    for (let guard = 0; guard < 3000; guard++) {
      if (this.state.end !== null) return null;
      if (this.state.day !== day) return this.state.lastNight;
      if (hoursUntilWake(this.state) <= 8.05) return this.sleep();
      const task = this.next();
      this.trace?.(task?.name ?? "чекати");
      if (task) task();
      else this.wait(10);
    }
    return this.sleep();
  }

  // --- Рішення ------------------------------------------------------------------------------

  private next(): Task | null {
    const s = this.state;
    const ch = s.character;
    if (ch.held) return () => this.handleHeld();
    this.orderSupplies();
    const escaped = s.cats.find((c) => c.away !== null);
    if (escaped || s.home.porch.length > 0) return () => this.use("door");
    if (s.home.stove.item?.kind === "meal") return () => this.serveMeal();
    if (s.home.surfaces["table"]?.kind === "meal") return () => this.eat();
    if (s.home.stove.item?.kind === "burnt") return () => this.trashBurnt();
    if (this.wantsWork() && catOnComputer(s)) return () => this.shoo();
    const dirty = itemsOf(s, "litter").find((b) => isDirty(b));
    if (dirty) return () => this.hold(`item:${dirty.id}`);
    const mess = this.nearestMess();
    if (mess) return () => this.hold(mess);
    if (s.cats.length > 0) {
      const bowl = itemsOf(s, "bowl").find((b) => b.food < 2);
      if (bowl && supplyCount(s, "catFood") > 0) return () => this.feed(bowl.id);
      const water = itemsOf(s, "water").find((w) => w.water < WATER_CAPACITY / 2);
      if (water) return () => this.use(`item:${water.id}`);
    }
    if (ch.stats.satiety < 60 && s.home.stove.item === null && supplyCount(s, "food") > 0 && !s.home.surfaces["table"]) {
      return () => this.cook();
    }
    if (ch.stats.hygiene < 45) return () => this.hold("shower");
    if (ch.stats.sanity < this.policy.sanityTarget && s.cats.length > 0) {
      const cat = this.catFor("attention");
      if (cat) return () => this.pet(cat);
      const player = this.catFor("play");
      if (player) return () => this.play(player);
    }
    if (this.wantsWork()) return () => this.work();
    return null;
  }

  /** Скільки годин сьогодні працювати: вимога посади з запасом (§8.6). */
  private workTarget(): number {
    const position = positionOf(this.state);
    const share = position.patienceDecay / (position.patienceDecay + position.patienceRecovery);
    return share * 9 * this.policy.work;
  }

  private wantsWork(): boolean {
    const s = this.state;
    if (!isWorkday(s) || !isWorkTime(s)) return false;
    // Терпіння не можна доводити до «Х»; летучка о 10:00.
    const standup = s.minute >= 9.9 * 60 && s.minute < 10.25 * 60;
    return standup || s.job.patience < 60 || this.workedToday < this.workTarget();
  }

  private catFor(want: "attention" | "play"): Cat | null {
    const s = this.state;
    const body = s.character.body;
    let best: Cat | null = null;
    let bestScore = -Infinity;
    for (const cat of s.cats) {
      if (cat.away !== null || cat.act.kind === "sleep" || cat.act.kind === "hide") continue;
      const need = want === "attention" ? cat.needs.attention : cat.needs.play;
      if (need < 40) continue;
      if (want === "play" && !this.hasToy()) continue;
      const score = need - Math.hypot(cat.x - body.x, cat.y - body.y) * 3;
      if (score > bestScore) {
        best = cat;
        bestScore = score;
      }
    }
    return best;
  }

  private hasToy(): boolean {
    return this.state.home.items.some((i) => i.kind === "toy") || this.state.character.held?.kind === "toy";
  }

  private nearestMess(): string | null {
    const s = this.state;
    const body = s.character.body;
    let best: string | null = null;
    let bestDistance = Infinity;
    for (const mess of s.home.messes) {
      const d = Math.hypot(mess.x - body.x, mess.y - body.y);
      if (d < bestDistance) {
        bestDistance = d;
        best = `mess:${mess.id}`;
      }
    }
    return best;
  }

  /** Замовити доставкою, що закінчується (§6.4): з телефона, без ходьби. */
  private orderSupplies(): void {
    const s = this.state;
    const cats = s.cats.length;
    const coming = (product: Product): number =>
      [...s.home.deliveries, ...s.home.porch].filter((d) => d.product === product).reduce((sum, d) => sum + PRODUCTS[product].units[d.quality], 0);
    const need = (product: Product, below: number): void => {
      if (supplyCount(s, product) + coming(product) < below) order(s, product, "cheap");
    };
    need("food", 7);
    need("hygiene", 3);
    if (cats > 0) {
      need("catFood", cats * 4);
      need("litter", Math.max(2, cats));
    }
  }

  // --- Дії ----------------------------------------------------------------------------------

  private handleHeld(): void {
    const held = this.state.character.held;
    if (!held) return;
    switch (held.kind) {
      case "cat":
      case "toy":
        interact(this.save);
        return;
      case "catfood": {
        const bowl = itemsOf(this.state, "bowl").find((b) => b.food < 2);
        this.use(bowl ? `item:${bowl.id}` : "cat-cabinet");
        return;
      }
      case "raw":
        this.use(this.state.home.stove.item === null ? "stove" : "fridge");
        return;
      case "meal":
        this.use(this.state.home.surfaces["table"] ? "counter-left" : "table");
        return;
      case "burnt":
        this.use("trash");
        return;
    }
  }

  private feed(bowl: number): void {
    this.use("cat-cabinet");
    if (this.state.character.held?.kind === "catfood") this.use(`item:${bowl}`);
  }

  private cook(): void {
    this.use("fridge");
    if (this.state.character.held?.kind === "raw") this.use("stove");
  }

  private serveMeal(): void {
    this.use("stove");
    if (this.state.character.held?.kind === "meal") this.use("table");
    this.eat();
  }

  private eat(): void {
    this.hold("table");
  }

  private trashBurnt(): void {
    this.use("stove");
    this.use("trash");
  }

  private shoo(): void {
    const cat = catOnComputer(this.state);
    if (!cat) return;
    if (!this.goTo(`cat:${cat.id}`)) return this.wait(5);
    interact(this.save);
    // Віднести кота трохи вбік і опустити.
    this.walkToTile({ x: 4, y: 8 });
    interact(this.save);
  }

  private work(): void {
    if (!this.goTo("computer")) return this.wait(5);
    interact(this.save);
    if (this.state.character.activity?.kind !== "work") return this.wait(2);
    // Сеанс до години, але з перервами на нагальне.
    for (let i = 0; i < 4; i++) {
      const before = this.state.minute;
      advance(this.save, 15);
      const spent = (this.state.minute - before) / 60;
      if (this.state.character.activity?.kind !== "work") break;
      this.workedToday += spent;
      this.log.worked += spent;
      if (this.urgent()) break;
    }
    if (this.state.character.activity?.kind === "work") interact(this.save);
  }

  /** Чи є нагальне, заради чого варто встати з-за комп'ютера. */
  private urgent(): boolean {
    const s = this.state;
    return (
      s.home.porch.length > 0 ||
      s.cats.some((c) => c.away !== null) ||
      s.home.messes.length > 0 ||
      itemsOf(s, "litter").some(isDirty) ||
      s.home.stove.item?.kind === "meal" ||
      s.character.stats.satiety < 40 ||
      (s.character.stats.sanity < this.policy.sanityTarget - 15 && s.cats.length > 0) ||
      (!this.wantsWork() && this.workedToday >= this.workTarget())
    );
  }

  private pet(cat: Cat): void {
    if (!this.goTo(`cat:${cat.id}`)) return this.wait(3);
    // Гладити трохи менше, ніж кіт терпить.
    const tolerance = Math.max(0.5, petTolerance(cat) - 0.5);
    const before = this.state.minute;
    this.holdFor(tolerance);
    this.log.petted += (this.state.minute - before) / 60;
  }

  private play(cat: Cat): void {
    if (this.state.character.held?.kind !== "toy") {
      const toy = itemsOf(this.state, "toy")[0];
      if (!toy || !this.goTo(`item:${toy.id}`)) return this.wait(3);
      interact(this.save);
    }
    if (!this.goTo(`cat:${cat.id}`)) return this.wait(3);
    const before = this.state.minute;
    this.holdFor(6);
    this.log.played += (this.state.minute - before) / 60;
    // Покласти іграшку назад на підлогу.
    if (this.state.character.held?.kind === "toy") interact(this.save);
  }

  private sleep(): NightReport | null {
    if (this.state.character.held) this.handleHeld();
    if (this.goTo("bed")) {
      const report = interact(this.save);
      if (report) return report;
    }
    if (this.state.end !== null) return null;
    return goToSleep(this.save);
  }

  private wait(minutes: number): void {
    advance(this.save, minutes);
  }

  // --- Рух ----------------------------------------------------------------------------------

  /** Дійти до цілі й повернутися до неї; true, якщо вона стала ціллю дії. */
  private goTo(id: string): boolean {
    for (let attempt = 0; attempt < 3; attempt++) {
      const rect = this.rectOf(id);
      if (!rect) return false;
      const path = this.path(rect);
      if (!path) return false;
      for (const tile of path) this.walkToTile(tile);
      this.face(rect);
      if (targetOf(this.state)?.id === id) return true;
      // Ціль утекла (кіт): спробувати ще раз.
    }
    return false;
  }

  private use(id: string): void {
    if (this.goTo(id)) interact(this.save);
    else this.wait(1);
  }

  private hold(id: string): void {
    if (!this.goTo(id)) return this.wait(1);
    for (let spent = 0; spent < 60; spent += HOLD_STEP) {
      advance(this.save, HOLD_STEP, { move: { x: 0, y: 0 }, hold: true });
      if (this.state.character.activity === null) break;
    }
    advance(this.save, 0.01);
  }

  private holdFor(minutes: number): void {
    for (let spent = 0; spent < minutes; spent += HOLD_STEP) {
      advance(this.save, HOLD_STEP, { move: { x: 0, y: 0 }, hold: true });
      if (this.state.character.activity === null && spent > 0) break;
    }
    advance(this.save, 0.01);
  }

  private rectOf(id: string): Rect | null {
    const s = this.state;
    if (!id.includes(":")) return objectById(id);
    const target = targetById(s, id);
    if (!target) return null;
    if (target.type === "item") {
      if (target.item.kind === "toy") return { x: target.item.x - 0.3, y: target.item.y - 0.3, w: 0.6, h: 0.6 };
      const slot = slotById(target.item.slot);
      return { x: slot.x + 0.15, y: slot.y + 0.15, w: 0.7, h: 0.7 };
    }
    const p: Vec | null = target.type === "mess" ? target.mess : target.type === "cat" ? target.cat : null;
    return p ? { x: p.x - 0.3, y: p.y - 0.3, w: 0.6, h: 0.6 } : null;
  }

  /** Найкоротший шлях клітинками до місця, звідки ціль на відстані дії. */
  private path(rect: Rect): Vec[] | null {
    const goals = new Set<string>();
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (!isSolid(x, y) && distanceToRect({ x: x + 0.5, y: y + 0.5 }, rect) <= 0.55) goals.add(`${x},${y}`);
      }
    }
    const body = this.state.character.body;
    const start = { x: Math.floor(body.x), y: Math.floor(body.y) };
    const previous = new Map<string, string | null>([[`${start.x},${start.y}`, null]]);
    const queue: Vec[] = [start];
    for (let head = 0; head < queue.length; head++) {
      const tile = queue[head];
      if (!tile) break;
      const key = `${tile.x},${tile.y}`;
      if (goals.has(key)) {
        const result: Vec[] = [];
        for (let k: string | null = key; k !== null; k = previous.get(k) ?? null) {
          const [x = 0, y = 0] = k.split(",").map(Number);
          result.unshift({ x, y });
        }
        return result;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const next = { x: tile.x + dx, y: tile.y + dy };
        const nextKey = `${next.x},${next.y}`;
        if (isSolid(next.x, next.y) || previous.has(nextKey)) continue;
        previous.set(nextKey, key);
        queue.push(next);
      }
    }
    return null;
  }

  private walkToTile(tile: Vec): void {
    const goal = { x: tile.x + 0.5, y: tile.y + 0.5 };
    for (let i = 0; i < 80; i++) {
      const body = this.state.character.body;
      if (this.state.end !== null) return;
      const dx = goal.x - body.x;
      const dy = goal.y - body.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 0.08) return;
      const before = this.state.minute;
      // Оглушений персонаж просто чекає.
      if (body.stun > 0) {
        advance(this.save, body.stun + 0.01);
        continue;
      }
      const step = Math.min(WALK_STEP, distance / 3 + 0.005);
      const move = { x: dx / distance, y: dy / distance };
      if (!isMoving(move)) return;
      advance(this.save, step, { move, hold: false });
      this.log.walked += (this.state.minute - before) / 60;
    }
  }

  private face(rect: Rect): void {
    const body = this.state.character.body;
    const cx = Math.min(Math.max(body.x, rect.x), rect.x + rect.w) - body.x;
    const cy = Math.min(Math.max(body.y, rect.y), rect.y + rect.h) - body.y;
    const length = Math.hypot(cx, cy);
    if (length > 1e-6) body.facing = { x: cx / length, y: cy / length };
  }
}

/** Скільки посад у драбині (для звіту). */
export const TOP_POSITION = POSITIONS.length - 1;
