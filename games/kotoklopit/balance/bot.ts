// «Бот-гравець» для симуляції балансу (§11.2): проживає дні гри, як простий уважний гравець,
// справжнім рухом квартирою й тими самими діями, що й людина. Пріоритети — нагальне (кіт на
// клавіатурі, безлад, порожні миски) раніше за своє (їжа, душ) і роботу.

import { petTolerance } from "../src/sim/actions";
import { isMoving } from "../src/sim/body";
import { catOnComputer, isDirty, itemsOf } from "../src/sim/catai";
import { DISEASES, ILLNESSES, PRODUCTS, WATER_CAPACITY } from "../src/sim/config";
import { giveMedicine } from "../src/sim/diseases";
import { beardLook, groomBeard } from "../src/sim/grooming";
import { needsHumanMeds } from "../src/sim/illness";
import { stateRng } from "../src/sim/rng";
import { freeSlots, supplyCount } from "../src/sim/economy";
import { checkout, room, type CartLine } from "../src/sim/shop";
import { advance, goToSleep, interact } from "../src/sim/game";
import { distanceToRect, isSolid, isWall, MAP_HEIGHT, MAP_WIDTH, objectById, slotById, type Rect } from "../src/sim/home";
import { canGoToSleep, hoursUntilWake } from "../src/sim/sleep";
import { targetById, targetCenter, targetOf } from "../src/sim/targets";
import type { Cat, GameState, Medicine, NightReport, Product, Save, Vec } from "../src/sim/types";
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
  /** Від якої потреби уваги й гри бот іде до кота й без потреби в здоровому глузді. */
  careAttention: number;
  carePlay: number;
}

export const DEFAULT_POLICY: BotPolicy = { work: 1.3, sanityTarget: 65, careAttention: 60, carePlay: 70 };

/** Що бот робив: години за категоріями (для звіту). */
export interface BotLog {
  worked: number;
  petted: number;
  played: number;
  walked: number;
}

type Task = () => void;

/** Завдання з назвою: її бачить трасування. */
const named = (name: string, run: () => void): Task => Object.defineProperty(run, "name", { value: name });

export class Bot {
  readonly log: BotLog = { worked: 0, petted: 0, played: 0, walked: 0 };
  private workedToday = 0;
  /** Коли кожному коту востаннє давали ліки: хвилина від початку гри. */
  private readonly dosed = new Map<number, number>();
  /** Цілі, до яких не вдалося дійти: до якої хвилини дня їх пропускати. */
  private readonly skip = new Map<string, number>();

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
    this.skip.clear();
    const day = this.state.day;
    for (let guard = 0; guard < 50_000; guard++) {
      if (this.state.end !== null) return null;
      if (this.state.day !== day) return this.state.lastNight;
      if (hoursUntilWake(this.state) <= 8.05) return this.sleep();
      // Оглушений персонаж нічого не може (§9.12): дочекатися, а не повторювати дію без руху часу.
      const stun = this.state.character.body.stun;
      if (stun > 0) {
        this.wait(stun + 0.01);
        continue;
      }
      const task = this.next();
      this.trace?.(task?.name ?? "чекати");
      const before = this.state.minute;
      if (task) task();
      else this.wait(10);
      // Крок без руху часу повторився б нескінченно: перечекати хвилину.
      if (this.state.minute === before && this.state.day === day) this.wait(1);
    }
    return this.sleep();
  }

  // --- Рішення ------------------------------------------------------------------------------

  private next(): Task | null {
    const s = this.state;
    const ch = s.character;
    if (ch.held) return named("handleHeld", () => this.handleHeld());
    this.orderSupplies();
    const escaped = s.cats.find((c) => c.away !== null);
    if (escaped || s.home.porch.length > 0) return named("use", () => this.use("door"));
    const patient = this.patient();
    if (patient) return named("treat", () => this.treat(patient.cat, patient.medicine));
    // Хворий персонаж п'є ліки біля умивальника (§6.5): хвороба забирає здоров'я щоночі.
    if (needsHumanMeds(s) && supplyCount(s, "humanMeds") > 0 && !this.skipped("sink")) return named("meds", () => this.use("sink"));
    const fighter = s.cats.find((c) => c.act.kind === "fight" && c.away === null);
    if (fighter) return named("separate", () => this.separate(fighter));
    if (s.home.stove.item?.kind === "meal") return named("serveMeal", () => this.serveMeal());
    if (s.home.surfaces["table"]?.kind === "meal") return named("eat", () => this.eat());
    if (s.home.stove.item?.kind === "burnt") return named("trashBurnt", () => this.trashBurnt());
    if (this.wantsWork() && catOnComputer(s)) return named("shoo", () => this.shoo());
    // Безлад біля лотка заважає підійти до самого лотка, тож спершу безлад.
    const mess = this.nearestMess();
    if (mess) return named("clean", () => this.hold(mess));
    const dirty = itemsOf(s, "litter").find((b) => isDirty(b) && !this.skipped(`item:${b.id}`));
    if (dirty) return named("litter", () => this.hold(`item:${dirty.id}`));
    if (s.cats.length > 0) {
      const bowl = itemsOf(s, "bowl").find((b) => b.food < 2 && !this.skipped(`item:${b.id}`));
      if (bowl && supplyCount(s, "catFood") > 0) return named("feed", () => this.feed(bowl.id));
      const water = itemsOf(s, "water").find((w) => w.water < WATER_CAPACITY / 2 && !this.skipped(`item:${w.id}`));
      if (water) return named("use", () => this.use(`item:${water.id}`));
    }
    if (ch.stats.satiety < 60 && s.home.stove.item === null && supplyCount(s, "food") > 0 && !s.home.surfaces["table"]) {
      return named("cook", () => this.cook());
    }
    if (ch.stats.hygiene < 45) return named("shower", () => this.shower());
    // Борода (§5.1): привести до ладу до летучки.
    const look = ch.sex === "male" ? beardLook(s) : "clean";
    if ((look === "stubble" || look === "unkempt") && s.minute < 9.75 * 60 && !this.skipped("sink")) {
      return named("beard", () => {
        if (!this.goTo("sink")) return this.wait(1);
        const minutes = groomBeard(s, look === "unkempt" ? "trim" : "shave");
        this.wait(minutes ?? 1);
      });
    }
    // Побут (§8.7): випране — розвісити, одяг закінчується — прати, шерсті багато — пилососити.
    const washer = s.home.washer.state;
    if (washer === "done" || (washer === "idle" && s.home.clothes <= 1 && supplyCount(s, "detergent") > 0 && !this.skipped("washer"))) {
      return named("laundry", () => this.use("washer"));
    }
    if (s.home.fur >= 60 && !this.skipped("vacuum")) return named("vacuum", () => this.hold("vacuum"));
    if (s.cats.length > 0) {
      // Уважний гравець відповідає котові, який просить уваги чи гри (§9.12), і пестить для здорового глузду.
      const low = ch.stats.sanity < this.policy.sanityTarget;
      const cat = this.catFor("attention", low ? 40 : this.policy.careAttention);
      if (cat) return named("pet", () => this.pet(cat));
      const player = this.catFor("play", low ? 40 : this.policy.carePlay);
      if (player) return named("play", () => this.play(player));
    }
    if (this.wantsWork()) return named("work", () => this.work());
    return null;
  }

  private skipped(id: string): boolean {
    const until = this.skip.get(id);
    return until !== undefined && this.state.minute < until;
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

  private catFor(want: "attention" | "play", min: number): Cat | null {
    const s = this.state;
    const body = s.character.body;
    let best: Cat | null = null;
    let bestScore = -Infinity;
    for (const cat of s.cats) {
      if (cat.away !== null || cat.act.kind === "sleep" || cat.act.kind === "hide") continue;
      const need = want === "attention" ? cat.needs.attention : cat.needs.play;
      if (need < min) continue;
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
      if (this.skipped(`mess:${mess.id}`)) continue;
      const d = Math.hypot(mess.x - body.x, mess.y - body.y);
      if (d < bestDistance) {
        bestDistance = d;
        best = `mess:${mess.id}`;
      }
    }
    return best;
  }

  /**
   * Замовити доставкою, що закінчується (§6.4): з телефона, без ходьби, одним кошиком — доставка
   * з надбавкою береться раз на замовлення, тож заразом і те, що скоро закінчиться (менше вдвічі
   * від порогу). Не вистачає грошей на все — без найменш нагального.
   */
  private orderSupplies(): void {
    const s = this.state;
    const cats = s.cats.length;
    const cart: CartLine[] = [];
    const soon: CartLine[] = [];
    const coming = (product: Product): number =>
      [...s.home.deliveries, ...s.home.porch].filter((d) => "product" in d && d.product === product).reduce((sum, d) => sum + PRODUCTS[product].units[d.quality], 0);
    const need = (product: Product, below: number): void => {
      const have = supplyCount(s, product) + coming(product);
      if (have < below) cart.push({ goods: { product }, quality: "cheap", count: 1 });
      else if (have < below * 2) soon.push({ goods: { product }, quality: "cheap", count: 1 });
    };
    need("food", 7);
    need("hygiene", 3);
    need("detergent", 2);
    if (s.character.illnesses.some((i) => ILLNESSES[i.id].doses !== null)) need("humanMeds", 1);
    if (cats > 0) {
      const sick = (medicine: Medicine): boolean => s.cats.some((c) => c.diseases.some((d) => {
        const cure = DISEASES[d.id].cure;
        return cure.kind === medicine || (cure.kind === "control" && cure.medicine === medicine);
      }));
      if (sick("pills")) need("pills", 2);
      if (sick("drops")) need("drops", 1);
      need("catFood", cats * 4);
      need("litter", Math.max(2, cats));
    }
    // Речі за правилом «лотків на один більше» (§9.4), коли є запас грошей.
    // Зламана річ (§8.7), без якої котам не обійтися, — одразу, навіть без запасу грошей.
    const things = (kind: "litter" | "bowl" | "water" | "toy", want: number): void => {
      const have = s.home.items.filter((i) => i.kind === kind).length + [...s.home.deliveries, ...s.home.porch].filter((d) => "thing" in d && d.thing === kind).length;
      if (have < want && freeSlots(s, kind) > 0 && (s.character.money > 100 || have === 0)) cart.push({ goods: { thing: kind }, quality: "cheap", count: 1 });
    };
    if (cats > 0) {
      things("litter", cats + 1);
      things("bowl", cats);
      things("water", Math.ceil(cats / 3));
      things("toy", 1);
    }
    if (cart.length === 0) return;
    // Що скоро закінчиться — у той самий кошик, якщо влазить.
    for (const line of soon) if (room(s, cart, line.goods, line.quality) > 0) cart.push(line);
    while (cart.length > 0 && !checkout(s, cart, "delivery")) cart.pop();
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
        // До миски не підійти (кіт їсть) — повернути корм у шафку.
        const bowl = itemsOf(this.state, "bowl").find((b) => b.food < 2 && !this.skipped(`item:${b.id}`));
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

  /**
   * Хворий кіт, якому вже час дати ліки, і які саме (§9.5). Бот бачить хвороби напряму —
   * так він заміняє уважного гравця, що помічає симптоми.
   */
  private patient(): { cat: Cat; medicine: Medicine } | null {
    const s = this.state;
    const now = s.day * 1440 + s.minute;
    for (const cat of s.cats) {
      if (cat.away !== null || now - (this.dosed.get(cat.id) ?? -Infinity) < 6 * 60) continue;
      for (const d of cat.diseases) {
        const cure = DISEASES[d.id].cure;
        const medicine = cure.kind === "pills" || cure.kind === "drops" ? cure.kind : cure.kind === "control" ? cure.medicine : null;
        if (medicine && supplyCount(s, medicine) > 0) return { cat, medicine };
      }
    }
    return null;
  }

  private treat(cat: Cat, medicine: Medicine): void {
    const s = this.state;
    this.dosed.set(cat.id, s.day * 1440 + s.minute);
    if (!this.goTo(`cat:${cat.id}`)) return this.wait(1);
    interact(this.save);
    if (s.character.held?.kind !== "cat") return;
    if (this.goTo("cat-kit")) giveMedicine(s, medicine, stateRng(s, "behavior"));
    interact(this.save);
  }

  /** Розборонити бійку: узяти кота на руки й опустити (§9.4). */
  private separate(cat: Cat): void {
    if (!this.goTo(`cat:${cat.id}`)) return this.wait(1);
    interact(this.save);
    if (this.state.character.held?.kind === "cat") interact(this.save);
  }

  private work(): void {
    if (!this.goTo("computer")) return this.wait(5);
    interact(this.save);
    if (this.state.character.activity?.kind !== "work") return this.wait(2);
    // Сеанс до години, але з перервами на нагальне: перевірка щоп'ять хвилин, інакше страва
    // на плиті встигає підгоріти (готова за 20 хвилин, підгорає ще за 15, §8.7).
    for (let i = 0; i < 12; i++) {
      const before = this.state.minute;
      advance(this.save, 5);
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
    // Лягти можна лише у вікні сну (§8.8): дочекатися його.
    while (!canGoToSleep(this.state) && this.state.end === null) this.wait(10);
    if (this.state.end !== null) return null;
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
    // Клітинки, звідки ціль перехопило інше (кіт біля миски, іграшка біля води): підійти з іншого боку.
    const tried = new Set<string>();
    for (let attempt = 0; attempt < 3; attempt++) {
      const rect = this.rectOf(id);
      if (!rect) return false;
      const path = this.path(rect, tried);
      if (!path) break;
      for (const tile of path) this.walkToTile(tile);
      this.face(rect);
      let target = targetOf(this.state);
      if (target?.id === id) return true;
      // Кіт під ногами, а персонаж дивиться на річ поруч (комп'ютер): відвернутися від неї.
      if (target && id.startsWith("cat:")) {
        const body = this.state.character.body;
        const c = targetCenter(target);
        const length = Math.hypot(c.x - body.x, c.y - body.y);
        if (length > 1e-6) body.facing = { x: (body.x - c.x) / length, y: (body.y - c.y) / length };
        target = targetOf(this.state);
        if (target?.id === id) return true;
      }
      // Безлад заступає ціль (його прибирають порожніми руками): прибрати й підійти ще раз.
      if (target?.type === "mess" && this.state.character.held === null) {
        this.hold(target.id);
        continue;
      }
      // Іграшка заступає ціль (лежить перед плитою): підняти й покласти за спину.
      if (target?.type === "item" && target.item.kind === "toy" && this.state.character.held === null) {
        interact(this.save);
        const body = this.state.character.body;
        body.facing = { x: -body.facing.x, y: -body.facing.y };
        interact(this.save);
        continue;
      }
      const body = this.state.character.body;
      tried.add(`${Math.floor(body.x)},${Math.floor(body.y)}`);
    }
    // Не застрягати: пропустити цю ціль на пів години.
    this.skip.set(id, this.state.minute + 30);
    const body = this.state.character.body;
    this.trace?.(`не дійшов до ${id}: стою ${body.x.toFixed(2)},${body.y.toFixed(2)}, ціль — ${targetOf(this.state)?.id ?? "нічого"}`);
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
      const activity = this.state.character.activity;
      if (activity === null) break;
      // Кіт підійшов під руку: утримання стало пестощами — відпустити, а не гладити годину.
      if (activity.kind === "pet" && id !== `cat:${activity.cat}`) break;
    }
    advance(this.save, 0.01);
  }

  /** Душ (§8.7): натиснути біля кабіни й дочекатися, поки персонаж вийде. */
  private shower(): void {
    if (!this.goTo("shower")) return this.wait(1);
    interact(this.save);
    for (let spent = 0; spent < 60 && this.state.character.activity?.kind === "use"; spent += HOLD_STEP) advance(this.save, HOLD_STEP);
  }

  private holdFor(minutes: number): void {
    for (let spent = 0; spent < minutes; spent += HOLD_STEP) {
      advance(this.save, HOLD_STEP, { move: { x: 0, y: 0 }, hold: true });
      // Гра й пестощі, що закінчилися, чекають, поки кнопку відпустять (§9.12).
      const activity = this.state.character.activity;
      const over = activity === null || (activity.kind === "play" && activity.done === true) || (activity.kind === "pet" && activity.bitten === true);
      if (over && spent > 0) break;
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
  private path(rect: Rect, exclude: ReadonlySet<string> = new Set()): Vec[] | null {
    // Ставати поруч із ціллю, а не на неї: інакше ціллю може стати сусідня річ.
    const near = new Set<string>();
    const on = new Set<string>();
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (isSolid(this.state, x, y) || exclude.has(`${x},${y}`)) continue;
        // Запас на похибку округлення: кіт на меблях рівно за 0,7 клітинки.
        const distance = distanceToRect({ x: x + 0.5, y: y + 0.5 }, rect) - 1e-6;
        // Крізь стіну не дотягнутися: такі клітинки не годяться.
        if (distance <= 0.7 && !this.clearLine({ x: x + 0.5, y: y + 0.5 }, rect)) continue;
        if (distance <= 0) on.add(`${x},${y}`);
        else if (distance <= 0.7) near.add(`${x},${y}`);
      }
    }
    const goals = near.size > 0 ? near : on;
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
        if (isSolid(this.state, next.x, next.y) || previous.has(nextKey)) continue;
        previous.set(nextKey, key);
        queue.push(next);
      }
    }
    return null;
  }

  /** Між точкою й прямокутником немає стіни. */
  private clearLine(p: Vec, rect: Rect): boolean {
    const to = { x: Math.min(Math.max(p.x, rect.x), rect.x + rect.w), y: Math.min(Math.max(p.y, rect.y), rect.y + rect.h) };
    const steps = Math.ceil(Math.hypot(to.x - p.x, to.y - p.y) / 0.1);
    for (let i = 1; i < steps - 1; i++) {
      const t = i / steps;
      if (isWall(Math.floor(p.x + (to.x - p.x) * t), Math.floor(p.y + (to.y - p.y) * t))) return false;
    }
    return true;
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
