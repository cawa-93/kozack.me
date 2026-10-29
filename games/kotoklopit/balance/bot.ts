// «Бот-гравець» для симуляції балансу (§11.2): проживає дні гри, як простий уважний гравець,
// справжнім рухом квартирою й тими самими діями, що й людина. Пріоритети — нагальне (кіт на
// клавіатурі, безлад, порожні миски) раніше за своє (їжа, душ) і роботу.

import { petOver, petTolerance } from "../src/sim/actions";
import { isMoving } from "../src/sim/body";
import { petResting, traitLevel } from "../src/sim/cat";
import { catOnComputer, isDirty, itemsOf, trashTipped } from "../src/sim/catai";
import { DISEASES, ILLNESSES, MEDICINE, MINUTES_PER_DAY, PETTING, PRODUCTS, SHELTER, VET, WATER_CAPACITY } from "../src/sim/config";
import { giveMedicine, isControlled } from "../src/sim/diseases";
import { needsHumanMeds } from "../src/sim/illness";
import { furVisible } from "../src/sim/household";
import { stateRng } from "../src/sim/rng";
import { boxCount, canUnpack, freeSlots, supplyCount, utilitiesDue } from "../src/sim/economy";
import { checkout, room, type CartLine } from "../src/sim/shop";
import { advance, drive, goHome, goToSleep, interact, rewindAccident } from "../src/sim/game";
import { adopt, shelterCats, tripCat, vetExam, vetTreat } from "../src/sim/destinations";
import { canLeave, startTrip } from "../src/sim/trips";
import { distanceToRect, isSolid, isWall, MAP_HEIGHT, MAP_WIDTH, objectById, slotById, type Rect } from "../src/sim/home";
import { canGoToSleep, hoursUntilWake } from "../src/sim/sleep";
import { targetById, targetCenter, targetOf } from "../src/sim/targets";
import type { BowlItem, Cat, GameState, Medicine, NightReport, Product, Save, Trip, Vec } from "../src/sim/types";
import { isWorkday, isWorkTime, positionOf } from "../src/sim/work";
import { POSITIONS, WORK_END_MINUTE, WORK_START_MINUTE } from "../src/sim/config";

/** Скільки ігрових хвилин один крок ходьби. */
const WALK_STEP = 0.1;
/** Скільки кроків поспіль без наближення до клітинки — і бот вважає, що дорогу заступлено. */
const WALK_STUCK_STEPS = 10;
const HOLD_STEP = 0.5;
/** Нижче цього здорового глузду бот рятується: пестить будь-якого кота й працює лише від «Х». */
const CRISIS_SANITY = 30;
/** Нижче цього здорового глузду бот не працює зовсім (і роботи не шукає): ще година — і кінець гри. */
const STOP_SANITY = 15;
/**
 * За скільки годин до пробудження бот іде спати: дорога до ліжка забирає кілька хвилин, а сон коротший за 8 годин не
 * відновлює (§8.8) і не лікує виснаження (§6.5). Хворий лягає раніше: так він висипається й після нічних побудок
 * (баланс 2026-10-26: з 8,05 бот спав ~7,8 години, і виснаження не минало ніколи — 5 з 17 програшів від здоров'я).
 */
const BEDTIME_HOURS = 8.4;
const BEDTIME_ILL_HOURS = 9.5;
/** Скільки годин на день бот шукає роботу після звільнення (§8.6). */
const SEARCH_HOURS_PER_DAY = 6;
/** Коли бот вирушає до ветеринара: поїздка з лікуванням ~5 годин (обережна гонка ~2,4 год, §8.5) і має закінчитися до вечора. */
const VET_TRIP_HOURS = { from: 8, to: 15 };
/**
 * Швидкість у гонці, вище якої бот не тисне газ: машини їдуть ×0,5 (`RACE.carSpeed`), тож повільніший їх не наздожене й не
 * вріжеться; з розгоном за крок — ~×0,4–0,45.
 */
const SAFE_SPEED = 0.4;
/** Коли бот вирушає до притулку: поїздка ~5 годин (обережна гонка ~3 год, §8.5) має закінчитися до вечора. */
const SHELTER_TRIP_HOURS = { from: 7, to: 15 };
/** Запас понад два тижні комунальних, нижче якого бот вважає, що грошей бракує, і працює більше. */
const POOR_MONEY = 100;
/** Скільки хвилин чекати, поки кіт, якому час ліків, прокинеться й захоче уваги, — далі брати й так. */
const PATIENCE_MINUTES = 12 * 60;
/** Кіт піде на руки без образи (§9.12): не спить і хоче уваги чи любить руки — як `unwilling` у грі, навпаки. */
const willingToHold = (cat: Cat): boolean => cat.act.kind !== "sleep" && (cat.needs.attention >= 40 || traitLevel(cat, "lap") > 0);
/** Скільки хвилин не підходити до кота, до якого бот не дійшов. */
const UNREACHABLE_CAT_MINUTES = 30;
/** Скільки грошей лишити після необов'язкової покупки (дорогий корм-дієта, ветеринар): на корм і комунальні. */
const SPARE_MONEY = 300;

export interface BotPolicy {
  /**
   * У скільки разів більше працювати, ніж вимагає посада (частка присутності × 9 годин). Це вимога на довгому відрізку: денний
   * мінімум без «Х» менший, бо вранці терпіння повне (§8.6; загальна ревізія 2026-10-29), — тож `work: 1` уже з запасом.
   */
  work: number;
  /** Те саме, коли грошей бракує: менше, ніж на два тижні комунальних, борг і `POOR_MONEY`. */
  poorWork: number;
  /** Нижче цього здорового глузду бот іде пестити котів. */
  sanityTarget: number;
  /** Від якої потреби уваги й гри бот іде до кота й без потреби в здоровому глузді. */
  careAttention: number;
  carePlay: number;
}

export const DEFAULT_POLICY: BotPolicy = { work: 1.3, poorWork: 2, sanityTarget: 65, careAttention: 60, carePlay: 70 };

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
  /** З якої хвилини кіт чекає ліків: бот чекає, поки кіт захоче на руки, але не довше за `PATIENCE_MINUTES`. */
  private readonly overdue = new Map<number, number>();
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
      if (hoursUntilWake(this.state) <= this.bedtime()) return this.sleep();
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

  /** За скільки годин до пробудження лягати (див. `BEDTIME_HOURS`). */
  private bedtime(): number {
    return this.state.character.illnesses.length > 0 ? BEDTIME_ILL_HOURS : BEDTIME_HOURS;
  }

  // --- Рішення ------------------------------------------------------------------------------

  private next(): Task | null {
    const s = this.state;
    const ch = s.character;
    if (ch.held) return named("handleHeld", () => this.handleHeld());
    this.orderSupplies();
    const escaped = s.cats.find((c) => c.away !== null);
    if (escaped || s.home.porch.length > 0) return named("use", () => this.use("door"));
    // Ящики біля входу (§6.4): розкласти запаси по сховищах, коли є куди.
    if (canUnpack(s) && !this.skipped("boxes")) return named("unpack", () => this.use("boxes"));
    const patient = this.patient();
    if (patient) return named("treat", () => this.treat(patient.cat, patient.medicine));
    // Те, що вдома не вилікувати (травма, сечокам'яна, дерматит), — до ветеринара (рішення автора 2026-10-27).
    const vetCase = this.vetCase();
    if (vetCase) return named("vet", () => this.vetTrip(vetCase));
    // Котів не лишилося — до притулку по нового (§6.2: «Відсутність котів — не пастка»).
    if (this.wantsShelter()) return named("shelter", () => this.shelterTrip());
    // Хворий персонаж п'є ліки біля умивальника (§6.5): хвороба забирає здоров'я щоночі.
    if (needsHumanMeds(s) && supplyCount(s, "humanMeds") > 0 && !this.skipped("sink")) return named("meds", () => this.use("sink"));
    // Бійку розбороняє, а протистояння розводить — торкнувшись кота (§9.4).
    const fighter = s.cats.find((c) => (c.act.kind === "fight" || c.act.kind === "standoff") && c.away === null);
    if (fighter) return named("separate", () => this.separate(fighter));
    if (s.home.stove.item?.kind === "meal") return named("serveMeal", () => this.serveMeal());
    if (s.home.surfaces["table"]?.kind === "meal") return named("eat", () => this.eat());
    const garbage = s.home.messes.find((m) => m.kind === "garbage");
    if (garbage && s.home.stove.item?.kind === "burnt") return named("clean", () => this.hold(`mess:${garbage.id}`));
    if (s.home.stove.item?.kind === "burnt") return named("trashBurnt", () => this.trashBurnt());
    if (this.wantsWork() && catOnComputer(s)) return named("shoo", () => this.shoo());
    // Безлад біля лотка заважає підійти до самого лотка, тож спершу безлад.
    const mess = this.nearestMess();
    if (mess) return named("clean", () => this.hold(mess));
    const dirty = itemsOf(s, "litter").find((b) => isDirty(b) && !this.skipped(`item:${b.id}`));
    if (dirty) return named("litter", () => this.hold(`item:${dirty.id}`));
    if (s.cats.length > 0) {
      const bowl = this.bowlToFeed();
      if (bowl) return named("feed", () => this.feed(bowl.id));
      const water = itemsOf(s, "water").find((w) => w.water < WATER_CAPACITY / 2 && !this.skipped(`item:${w.id}`));
      if (water) return named("use", () => this.use(`item:${water.id}`));
    }
    // Мамині судочки (§6.4, рішення автора 2026-10-26): готові — з холодильника одразу на стіл, без плити. Холодильник і так
    // видає їх першими.
    if (ch.stats.satiety < 60 && supplyCount(s, "momMeal") > 0 && !s.home.surfaces["table"]) return named("momMeal", () => this.momMeal());
    if (ch.stats.satiety < 60 && s.home.stove.item === null && supplyCount(s, "food") > 0 && !s.home.surfaces["table"]) {
      return named("cook", () => this.cook());
    }
    if (ch.stats.hygiene < 45) return named("shower", () => this.shower());
    // Побут (§8.7): випране — розвісити, одяг закінчується — прати, шерсті багато — пилососити.
    const washer = s.home.washer.state;
    if (washer === "done" || (washer === "idle" && s.home.clothes <= 1 && supplyCount(s, "detergent") > 0 && !this.skipped("washer"))) {
      return named("laundry", () => this.use("washer"));
    }
    // Шерсть стало видно — вона дратує, як безлад (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А17): пилососити одразу, а не з 60.
    if (furVisible(s) && !this.skipped("vacuum")) return named("vacuum", () => this.hold("vacuum"));
    if (s.cats.length > 0) {
      // Уважний гравець відповідає котові, який просить уваги чи гри (§9.12), і пестить для здорового глузду.
      const low = ch.stats.sanity < this.policy.sanityTarget;
      const cat = this.catFor("attention", low ? 40 : this.policy.careAttention);
      if (cat) return named("pet", () => this.pet(cat));
      const player = this.catFor("play", low ? 40 : this.policy.carePlay);
      if (player) return named("play", () => this.play(player));
      // Здоровий глузд на межі: пестити будь-якого кота, що не спить, — навіть без прохання (+1 за хвилину).
      const any = ch.stats.sanity < CRISIS_SANITY ? this.catFor("attention", 0) : null;
      if (any) return named("pet", () => this.pet(any));
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
    const s = this.state;
    const position = positionOf(s);
    const share = position.patienceDecay / (position.patienceDecay + position.patienceRecovery);
    // Грошей менше, ніж на комунальні з запасом, — розважливий гравець працює більше (перевірка економіки 2026-10-27).
    const poor = s.character.money < utilitiesDue(s) * 2 + s.home.utilitiesDebt + POOR_MONEY;
    return share * 9 * (poor ? this.policy.poorWork : this.policy.work);
  }

  private wantsWork(): boolean {
    const s = this.state;
    // Безробітний шукає роботу щодня в робочі години, як і працював би (§8.6).
    // Здоровий глузд майже на нулі — не працювати зовсім: краще «Х» і пониження, ніж кінець гри (§6.1).
    if (s.character.stats.sanity < STOP_SANITY) return false;
    if (s.job.unemployed) {
      const minute = s.minute % 1440;
      return minute >= WORK_START_MINUTE && minute < WORK_END_MINUTE && this.workedToday < SEARCH_HOURS_PER_DAY;
    }
    if (!isWorkday(s) || !isWorkTime(s)) return false;
    // Терпіння не можна доводити до «Х»; летучка о 10:00.
    const standup = s.minute >= 9.9 * 60 && s.minute < 10.25 * 60;
    // Здоровий глузд на межі: працювати лише щоб не дійшло до «Х» — краще втратити трохи репутації, ніж розум.
    if (s.character.stats.sanity < CRISIS_SANITY) return s.job.patience < 15;
    return standup || s.job.patience < 60 || this.workedToday < this.workTarget();
  }

  private catFor(want: "attention" | "play", min: number): Cat | null {
    const s = this.state;
    const body = s.character.body;
    let best: Cat | null = null;
    let bestScore = -Infinity;
    for (const cat of s.cats) {
      if (cat.away !== null || cat.act.kind === "sleep" || cat.act.kind === "hide" || this.skipped(`cat:${cat.id}`)) continue;
      const need = want === "attention" ? cat.needs.attention : cat.needs.play;
      if (need < min) continue;
      // Кіт, що щойно попереджав чи вкусив, гладити себе не дає (А8): до нього не йти.
      if (want === "attention" && petResting(s, cat)) continue;
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
      // Що в ящиках біля входу — уже вдома; поки воно там, такий запас і не замовити.
      const have = supplyCount(s, product) + coming(product) + boxCount(s, product);
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
      // Кіт блює й ходить повз лоток (розлад шлунка) — дорогий корм як дієта (§9.5), коли грошей удосталь: розлад і так
      // минає за 4 дні, а пакунок коштує 200 (баланс 2026-10-27: без запасу грошей — виселення на «Реалістичному»).
      const premium = s.home.supplies.catFood.premium + [...s.home.deliveries, ...s.home.porch].filter((d) => "product" in d && d.product === "catFood" && d.quality === "premium").length;
      const stomach = s.cats.some((c) => c.diseases.some((d) => d.id === "stomach"));
      if (premium === 0 && stomach && s.character.money > PRODUCTS.catFood.price.premium + SPARE_MONEY) cart.push({ goods: { product: "catFood" }, quality: "premium", count: 1 });
      // Переноска — щойно є з чим їхати до ветеринара.
      const carrier = [...s.home.deliveries, ...s.home.porch].some((d) => "thing" in d && d.thing === "carrier");
      if (s.home.carrier === null && !carrier && s.character.money > VET.exam + VET.premium + SPARE_MONEY && s.cats.some((c) => this.needsVet(c))) {
        cart.push({ goods: { thing: "carrier" }, quality: "cheap", count: 1 });
      }
      need("litter", Math.max(2, cats));
    }
    // Речі за правилом «лотків на один більше» (§9.4), коли є запас грошей.
    // Зламана річ (§8.7), без якої котам не обійтися, — одразу, навіть без запасу грошей.
    const things = (kind: "litter" | "bowl" | "water" | "toy" | "scratcher", want: number): void => {
      const have = s.home.items.filter((i) => i.kind === kind).length + [...s.home.deliveries, ...s.home.porch].filter((d) => "thing" in d && d.thing === kind).length;
      if (have < want && freeSlots(s, kind) > 0 && (s.character.money > 100 || have === 0)) cart.push({ goods: { thing: kind }, quality: "cheap", count: 1 });
    };
    if (cats > 0) {
      things("litter", cats + 1);
      things("bowl", cats);
      things("water", Math.ceil(cats / 3));
      things("toy", 1);
      // Кігтеточка — коли грошей удосталь: інакше кожен кіт дере диван, а ремонт росте щотижня (§9.12, «Дряпання»,
      // 2026-10-25); на бідному старті вона з'їла б гроші на комунальні.
      if (s.character.money > 250) things("scratcher", 1);
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
        interact(this.save);
        return;
      case "toy":
        // Біля кота натискання з іграшкою нічого не робить (утримання почало б гру, §8.2):
        // відійти до дверей і покласти там, інакше бот так і стоїть з іграшкою годинами.
        if (targetOf(this.state)?.type === "cat") this.goTo("door");
        interact(this.save);
        if (this.state.character.held?.kind === "toy") this.wait(1);
        return;
      case "catfood": {
        // До миски не підійти (кіт їсть) чи в ній інший корм — повернути корм у шафку.
        const bowl = this.bowlToFeed();
        this.use(bowl ? `item:${bowl.id}` : "cat-cabinet");
        return;
      }
      case "raw":
        this.use(this.state.home.stove.item === null ? "stove" : "fridge");
        return;
      case "meal":
        // Мамин судочок, коли стіл зайнятий, — назад у холодильник (§6.4).
        if (held.mom === true && this.state.home.surfaces["table"]) this.use("fridge");
        else this.use(this.state.home.surfaces["table"] ? "counter-left" : "table");
        return;
      case "burnt":
        // Смітник перекинув кіт (§9.12, «Кмітливість у бешкеті»): страву — назад на плиту, спершу прибрати сміття.
        this.use(trashTipped(this.state) ? "stove" : "trash");
        return;
    }
  }

  /** Миска, яку є чим досипати: порожня — будь-яким кормом, з кормом — тим самим, корми не змішують (§6.4). */
  private bowlToFeed(): BowlItem | undefined {
    const supply = this.state.home.supplies.catFood;
    const stocked = (b: BowlItem): boolean => (b.food === 0 ? supply.cheap + supply.premium > 0 : !b.sterile && b.foodQuality !== null && supply[b.foodQuality] > 0);
    return itemsOf(this.state, "bowl").find((b) => b.food < 2 && stocked(b) && !this.skipped(`item:${b.id}`));
  }

  private feed(bowl: number): void {
    this.use("cat-cabinet");
    if (this.state.character.held?.kind === "catfood") this.use(`item:${bowl}`);
  }

  private cook(): void {
    this.use("fridge");
    if (this.state.character.held?.kind === "raw") this.use("stove");
  }

  private momMeal(): void {
    this.use("fridge");
    if (this.state.character.held?.kind === "meal") this.use("table");
    this.eat();
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
      // Та сама доза раніше ніж за 6 годин — кіт випльовує (рішення автора 2026-10-27).
      if (cat.away !== null || now - (this.dosed.get(cat.id) ?? -Infinity) < MEDICINE.doseMinutes) continue;
      for (const d of cat.diseases) {
        const cure = DISEASES[d.id].cure;
        // Хронічна вже під контролем (таблетка сьогодні чи ветеринар): уважний гравець не дає зайвих доз (перевірка 2026-10-28:
        // бот давав таблетку кожні 6 годин, і з новими хронічними хворобами це занижувало здоровий глузд у звіті).
        if (isControlled(s, d)) continue;
        const medicine = cure.kind === "pills" || cure.kind === "drops" ? cure.kind : cure.kind === "control" ? cure.medicine : null;
        if (!medicine || supplyCount(s, medicine) === 0) continue;
        // Уважний гравець дає ліки, коли кіт не спить і сам іде по увагу: так він не пручається й рідше кусає. Такої миті
        // немає півдня — однаково (перевірка персонажа 2026-10-27: бот брав сплячих котів, і 2 з 3 укусів були від ліків).
        const since = this.overdue.get(cat.id) ?? now;
        this.overdue.set(cat.id, since);
        if (willingToHold(cat) || now - since >= PATIENCE_MINUTES) return { cat, medicine };
      }
    }
    return null;
  }

  /** Хвороба, яку вдома не вилікувати: лише ветеринар (§9.5). Бот бачить хвороби напряму, як уважний гравець — симптоми. */
  private needsVet(cat: Cat): boolean {
    return cat.diseases.some((d) => DISEASES[d.id].cure.kind === "vet");
  }

  /**
   * Кого везти до ветеринара: удома, є переноска й гроші на огляд і дороге лікування, не робочий час, і поїздка (~4 год)
   * закінчиться до вечора. Раз на день.
   */
  private vetCase(): Cat | null {
    const s = this.state;
    if (s.home.carrier === null || this.skipped("vet") || isWorkTime(s) || !canLeave(s)) return null;
    if (s.minute < VET_TRIP_HOURS.from * 60 || s.minute > VET_TRIP_HOURS.to * 60) return null;
    if (s.character.money < VET.exam + VET.premium + SPARE_MONEY) return null;
    return s.cats.find((c) => c.away === null && this.needsVet(c)) ?? null;
  }

  /**
   * Поїздка до ветеринара (§8.5): кота на руки, до дверей, гонка обережно, огляд і дороге лікування того, що лікує лише
   * ветеринар; решту бот лікує вдома (перевірка 2026-10-28: лікування всього знайденого, по годині на хворобу, з новими
   * хронічними тягнулося до вечора, і голодний бот помирав від голоду).
   */
  private vetTrip(cat: Cat): void {
    this.skip.set("vet", MINUTES_PER_DAY);
    if (!this.goTo(`cat:${cat.id}`)) return this.wait(1);
    interact(this.save);
    if (this.state.character.held?.kind !== "cat") return;
    if (!this.goTo("door") || !startTrip(this.state, "vet")) return;
    const trip = this.driveThere();
    if (!trip) return;
    vetExam(this.state);
    const rng = stateRng(this.state, "behavior");
    for (const d of [...(tripCat(this.state)?.diseases ?? [])]) {
      if (d.known && DISEASES[d.id].cure.kind === "vet") vetTreat(this.state, d.id, "premium", rng);
    }
    goHome(this.save);
  }

  /** Гонка обережно (§8.5): повільніше за інші машини. Повертає поїздку на місці або null (аварія, ніч). */
  private driveThere(): Trip | null {
    for (let i = 0; i < 100_000 && this.state.trip?.phase === "drive"; i++) {
      const speed = this.state.trip.race.speed;
      drive(this.save, 0.1, { steer: 0, throttle: speed < SAFE_SPEED ? 1 : 0 });
    }
    const trip = this.state.trip;
    if (trip?.phase === "accident") {
      rewindAccident(this.save);
      return null;
    }
    return trip?.phase === "visit" ? trip : null;
  }

  /**
   * До притулку: коти були, але не лишилося жодного (на початку гри перше кошеня приходить само, §8.3), є гроші на кота, і
   * поїздка (~5 год) закінчиться до вечора. Раз на день.
   */
  private wantsShelter(): boolean {
    const s = this.state;
    if (s.cats.length > 0 || s.album.length === 0 || this.skipped("shelter") || !canLeave(s)) return false;
    if (s.minute < SHELTER_TRIP_HOURS.from * 60 || s.minute > SHELTER_TRIP_HOURS.to * 60) return false;
    return s.character.money >= SHELTER.price;
  }

  /** Поїздка до притулку (§8.5): наймолодший із котів тижня — проживе довше. */
  private shelterTrip(): void {
    this.skip.set("shelter", MINUTES_PER_DAY);
    if (!this.goTo("door") || !startTrip(this.state, "shelter")) return;
    const trip = this.driveThere();
    if (!trip) return;
    const youngest = [...shelterCats(this.state)].sort((a, b) => a.ageWeeks - b.ageWeeks)[0];
    if (youngest) adopt(this.state, youngest.id);
    goHome(this.save);
  }

  private treat(cat: Cat, medicine: Medicine): void {
    const s = this.state;
    this.dosed.set(cat.id, s.day * 1440 + s.minute);
    if (!this.goTo(`cat:${cat.id}`)) return this.wait(1);
    interact(this.save);
    if (s.character.held?.kind !== "cat") return;
    // Відлік до наступної дози — від того, як кіт проковтнув: дорога до кота й аптечки буває різна.
    if (this.goTo("cat-kit") && giveMedicine(s, medicine, stateRng(s, "behavior"))) {
      this.dosed.set(cat.id, s.day * 1440 + s.minute);
      this.overdue.delete(cat.id);
    }
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
    // Кіт перегриз дріт (§9.12, «Гризіння»): спершу полагодити.
    if (this.state.home.wireChewed === true) this.hold("computer");
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

  /**
   * До кота не дійти (сидить біля шафки, за іншим котом): пів години його не чіпати. Інакше бот пробував би знову щокроку й
   * не працював цілий день (перевірка економіки 2026-10-27: так бота звільняли й виселяли на «Реалістичному»).
   */
  private unreachable(cat: Cat): void {
    this.skip.set(`cat:${cat.id}`, this.state.minute + UNREACHABLE_CAT_MINUTES);
    this.wait(3);
  }

  private pet(cat: Cat): void {
    if (!this.goTo(`cat:${cat.id}`)) return this.unreachable(cat);
    // Поки йшов, кіт заснув: не будити (пестощі сплячого — мінус настрій).
    if (cat.act.kind === "sleep") return;
    // Гладити, доки кіт не попередив (б'є хвостом): після попередження він чверть години не дається гладити (§9.12, рішення
    // автора 2026-10-29, А8). Уважний гравець відпускає раніше — з запасом на крок утримання.
    const tolerance = Math.max(HOLD_STEP, petTolerance(cat) - PETTING.warnMinutes - HOLD_STEP);
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
    if (!this.goTo(`cat:${cat.id}`)) return this.unreachable(cat);
    if (cat.act.kind === "sleep") return this.wait(3);
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
      const over = activity === null || (activity.kind === "play" && activity.done === true) || (activity.kind === "pet" && petOver(activity));
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
    let best = Infinity;
    let stuck = 0;
    for (let i = 0; i < 80; i++) {
      const body = this.state.character.body;
      if (this.state.end !== null) return;
      const dx = goal.x - body.x;
      const dy = goal.y - body.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 0.08) return;
      // Персонаж не наближається (щось заступає дорогу) — не тупцювати на місці: інакше бот міг годинами «йти» до безладу,
      // і голод доводив до кінця гри (перевірка персонажа 2026-10-27).
      if (distance < best - 0.01) {
        best = distance;
        stuck = 0;
      } else if (++stuck >= WALK_STUCK_STEPS) return;
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
