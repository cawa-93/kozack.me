import Phaser from "phaser";

import { IDLE, type Input } from "../sim/actions";
import { canDash, dash, isMoving } from "../sim/body";
import { inStandoff, isDirty } from "../sim/catai";
import { LOW_STAT, MODIFIERS, STANDUP_MINUTE, STANDUP_MINUTES } from "../sim/config";
import { discard, discardAppliance, discardCarrier, discardLock, seePhoneHints, supplyCount } from "../sim/economy";
import { checkout } from "../sim/shop";
import { onEvent, type GameEvent, type GuestsVisit, type ModifierEvent } from "../sim/events";
import { advance, carryFoundling, goHome, interact, newGame, newSeed, replayDay, replayWeek, rewindAccident } from "../sim/game";
import { doctorTreat } from "../sim/illness";
import { adopt, buyFromBreeder, enterShow, groom, officeMeeting, vetExam, vetManner, vetSterilize, vetTreat } from "../sim/destinations";
import { canLeave, startTrip } from "../sim/trips";
import { advertise, cancelAd, recentlyArrived } from "../sim/farewell";
import { exportSave, exportUnreadable, importSave } from "../ui/files";
import { accidentCard, destinationCard, visitCard } from "../ui/trips";
import { objectById } from "../sim/home";
import { canGoToSleep, collapseMinute, isDrowsy } from "../sim/sleep";
import { targetOf } from "../sim/targets";
import { gameMinutes, weekOf } from "../sim/time";
import type { Address, Chronotype, Difficulty, GameState, HomeItem, Look, Product, Save, ThingKind } from "../sim/types";
import { isWorking, isWorkday, isWorkTime, patienceLevel } from "../sim/work";
import type { Session } from "../session";
import { callCard, careCard, chronotypeCard, difficultyCard, titleCard, endScreen, foundlingCard, hasCareSupplies, lookCard, dayTitle, nameCard, phoneCard, addressCard, startName, type EnteredName, type PhoneTab } from "../ui/cards";
import { lookRng, randomLook } from "../ui/look";
import { answerCall, decideFoundling, ignoreCall, internetOut } from "../sim/modifiers";
import { giveCatnip, giveTreat, putCollar } from "../sim/care";
import { giveMedicine, medicineCat } from "../sim/diseases";
import { stateRng } from "../sim/rng";
import { Overlay, type Card } from "../ui/overlay";
import { CAREER_MESSAGES, DIFFICULTY_TITLES, fill, GIVE_AWAY_LATER, GIVE_AWAY_RECENT, guestsText, homeVetText, IMPORT_SAVE, MOM_FOOD_TEXTS, POSITION_TITLES, UNREADABLE_SAVE } from "../texts";
import { canUse } from "../sim/actions";
import { type Anchor, Bubbles, THOUGHT_HOLD_MS } from "../view/bubbles";
import { StorageIndicators } from "../view/storage";
import { boxesIndicator, STORAGES, storageIndicator } from "../sim/storage";
import { showsFightBubble } from "../view/pose";
import { Hud } from "../view/hud";
import { iconTexture, type BubbleKind, type IconName } from "../view/iconnames";
import { createIconTextures } from "../view/icons";
import { eventBubbles, itemIcon, PRODUCT_ICONS, stoveIcon } from "../view/symbols";
import { ThoughtClock } from "../view/thoughts";
import { type TraitNews, traitNews } from "../ui/traits";
import { discardFeeder } from "../sim/household";
import { THING_TITLES } from "../ui/titles";
import { LegacyApartmentView } from "../view/legacy/apartmentview";
import { LegacyCatsView } from "../view/legacy/catsview";
import { LegacyFloorView } from "../view/legacy/floorview";
import { LegacyMarksView } from "../view/legacy/marksview";
import { LegacyPen } from "../view/legacy/pen";
import { LegacyPersonView } from "../view/legacy/personview";
import { MoodHearts } from "../view/moodhearts";
import { TouchControls } from "../view/touch";
import { isRotateNoticeShown, onRotateNotice } from "../screen";
import { Viewport } from "../view/viewport";
import { UI_LAYERS, WORLD_LAYERS } from "../view/world/layers";
import { OBLIQUE } from "../view/world/projection";
import type { PartContext } from "../view/world/context";
import type { WorldFrame } from "../view/world/part";
import { World } from "../view/world/world";

/** Довгий кадр (вкладка у фоні) не перемотує день: найбільше 0,1 секунди за кадр. */
const MAX_FRAME_SECONDS = 0.1;
/** Коротше за це (мс) — натискання біля кота бере його на руки, довше — пестощі. */
const CAT_TAP_MS = 250;
/**
 * Засинання (§8.8): за `eyes` мс очі заплющуються, з `darkFrom` до `total` екран темніє, камера
 * наїжджає на `zoom`; потім ніч. Падіння без сил починається за `lead` ігрових хвилин до межі.
 */
const FALL_ASLEEP = { eyes: 1300, darkFrom: 1000, total: 2300, zoom: 0.5, lead: 0.01 } as const;


type Keys = Record<
  "up" | "down" | "left" | "right" | "up2" | "down2" | "left2" | "right2" | "action" | "action2",
  Phaser.Input.Keyboard.Key
>;

/** Чи друкує зараз гравець у полі вводу (панель розробника): тоді клавіші не керують грою. */
function isTyping(): boolean {
  const active = document.activeElement;
  return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
}

// Рівень — один день (§4): квартира, персонаж, коти, бабли й інтерфейс. Сцена лише показує стан
// і передає дії гравця в симуляцію; правил гри тут немає.
/** Як часто виринає «+N ₴» над персонажем, мс. */
const EARNINGS_POP_MS = 3000;
/** Скільки місця над точкою бабла займає сам бабл разом із виринанням, px: мовна хмаринка й думка (§11.4). */
const BUBBLE_ROOM: Record<BubbleKind, number> = { say: 62, think: 82 };

export class DayScene extends Phaser.Scene {
  private readonly overlay = new Overlay();
  /** Квартира, котячий куточок, коти, персонаж і позначки (крок 16): сцена лише кличе їх щокадру й питає, де що. */
  private world!: World;
  /** Коти, яких світ малював минулого кадру: зниклому з дому прибрати бабл стану. */
  private readonly catsShown = new Set<number>();
  private viewport!: Viewport;
  /** Як квартира лягає на екран (§8.4). */
  private readonly projection = OBLIQUE;
  private gloom!: Phaser.GameObjects.Rectangle;
  /** Темрява засинання — над усім, і над інтерфейсом. */
  private dark!: Phaser.GameObjects.Rectangle;
  /** Персонаж засинає (§8.8): коли почав (мс) і чи падає без сил. */
  private asleep: { started: number; collapsed: boolean } | null = null;
  private bubbles!: Bubbles;
  private hearts!: MoodHearts;
  /** Хто й коли думає про свій стан (§11.4). */
  private thoughts = new ThoughtClock();
  /** Що стало відомо про котів: телефон каже це по черзі, поки не відкрита картка (§9.9). */
  private readonly news: TraitNews[] = [];
  private storage!: StorageIndicators;
  private hud!: Hud;
  private touch!: TouchControls;
  private keys!: Keys;
  private moving = false;
  /**
   * Натискання біля кота з порожніми руками: що це — коротке натискання (взяти на руки) чи утримання
   * (пестощі), стає ясно лише після відпускання. Час натискання в мс або null.
   */
  private catPress: number | null = null;
  private readonly cleanup: (() => void)[] = [];

  constructor(private readonly session: Session) {
    super("day");
  }

  private get state(): GameState {
    return this.session.save.current;
  }

  create(): void {
    createIconTextures(this);
    this.viewport = new Viewport(this, this.projection);
    const { world: layer, ui } = this.viewport;
    this.world = new World(this.projection);
    const ctx: PartContext = { scene: this, layer, projection: this.projection, state: () => this.state, world: this.world };
    // Порядок створення — порядок у списку відображення: персонаж — після квартири, щоб на тій самій глибині бути поверх меблів.
    const pen = new LegacyPen(this, layer);
    const apartment = new LegacyApartmentView(ctx, pen);
    const floor = new LegacyFloorView(ctx, pen);
    const marks = new LegacyMarksView(ctx, pen);
    const person = new LegacyPersonView(ctx);
    const cats = new LegacyCatsView(ctx, pen);
    this.world.attach({ apartment, floor, marks, person, cats });
    this.bubbles = new Bubbles(this, layer);
    this.hearts = new MoodHearts(this, layer, (cat) => this.world.anchor(`cat:${cat}`));
    this.storage = new StorageIndicators(this, layer);
    // Серпанок над квартирою, але під інтерфейсом.
    this.gloom = this.add.rectangle(0, 0, 1, 1, 0x5b3a7a, 0).setOrigin(0).setDepth(UI_LAYERS.gloom).addToDisplayList(ui);
    this.hud = new Hud(this, ui, () => this.openPhone());
    this.dark = this.add.rectangle(0, 0, 1, 1, 0x000000, 0).setOrigin(0).setDepth(UI_LAYERS.dark).addToDisplayList(ui);
    this.touch = new TouchControls(
      this,
      ui,
      () => this.act(),
      () => this.dash(),
    );
    this.viewport.onLayout((frame) => {
      this.gloom.setSize(frame.width, frame.height);
      this.dark.setSize(frame.width, frame.height);
      this.hud.layout(frame);
      this.touch.layout(frame);
    });
    this.setupKeyboard();

    this.cleanup.push(onEvent((event) => this.onGameEvent(event)));
    this.cleanup.push(this.session.onReset(() => this.restart()));
    // Телефон повернули вертикально — гра на паузі (§10), а утримання дії й джойстик скидаються: інакше після повороту
    // дія тривала б сама, бо палець відпустили вже під заглушкою.
    this.cleanup.push(
      onRotateNotice((shown) => {
        if (!shown) return;
        this.touch.reset();
        this.catPress = null;
      }),
    );
    this.cleanup.push(() => this.world.destroy());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup.forEach((stop) => stop()));
    this.restart();
    // Меню на старті (§4.2): лише для справжньої збереженої гри, не для сценаріїв режиму розробки.
    const state = this.state;
    if (this.session.persistent && state.end === null) {
      // Зовсім нова гра — одразу вибір персонажа (§5.1); збережена — меню.
      const start = (): void => {
        if (state.day === 0 && state.minute === state.dayStartMinute) this.chooseNewGame();
        else this.overlay.show(titleCard(state, () => this.restart(), () => this.chooseNewGame()));
      };
      // Збереження не вдалося відкрити — спершу запропонувати зберегти його файлом (§4.2, Ц3).
      const unreadable = this.session.unreadable;
      if (unreadable === null) start();
      else this.showUnreadableSave(unreadable, start);
    }
  }

  private setupKeyboard(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    const K = Phaser.Input.Keyboard.KeyCodes;
    // Без перехоплення клавіш: інакше в полях панелі розробника не надрукувати літер.
    this.keys = keyboard.addKeys(
      {
        up: K.W,
        down: K.S,
        left: K.A,
        right: K.D,
        up2: K.UP,
        down2: K.DOWN,
        left2: K.LEFT,
        right2: K.RIGHT,
        action: K.SPACE,
        action2: K.E,
      },
      false,
    ) as Keys;
    const on = (key: string, handler: () => void): void => {
      keyboard.on(`keydown-${key}`, (event: KeyboardEvent) => {
        if (event.repeat || isTyping() || this.overlay.isOpen) return;
        event.preventDefault();
        handler();
      });
    };
    on("SPACE", () => this.act());
    on("E", () => this.act());
    on("SHIFT", () => this.dash());
    on("Q", () => this.openPhone());
  }

  /** Показати день заново: після нової гри, перегравання чи сценарію. */
  private restart(): void {
    this.overlay.close();
    this.queued.length = 0;
    this.wakeUp();
    this.bubbles.clear();
    this.hearts.clear();
    this.thoughts = new ThoughtClock();
    this.news.length = 0;
    this.storage.clear();
    this.moneySeen = null;
    this.earned = 0;
    this.touch.reset();
    this.viewport.jump();
    // Коти нового стану — нові об'єкти, навіть якщо id ті самі.
    this.world.reset();
    this.catsShown.clear();
    const state = this.state;
    if (state.end !== null) {
      this.showEnd();
      return;
    }
    // Титулка, якщо день щойно почався.
    if (state.minute === state.dayStartMinute) {
      const night = state.lastNight?.day === state.day - 1 ? state.lastNight : null;
      this.showMorning(night);
    }
    // Мама подзвонила, а гравець ще не вирішив (оновив сторінку чи телефон вивантажив вкладку) — картка знову (§4.1).
    if (state.today.callPending === true) this.showCall();
  }

  private act(): void {
    if (this.blocked()) return;
    const { held, activity } = this.state.character;
    const target = targetOf(this.state);
    // Кота в протистоянні торкаються одразу, натисканням (§9.4): відпустивши кнопку, його не беруть на руки.
    if (held === null && activity === null && target?.type === "cat" && !inStandoff(target.cat)) {
      this.catPress = this.time.now;
      return;
    }
    // Біля дверей нічого не чекає: поїздка (§8.5).
    if (canLeave(this.state)) {
      this.overlay.show(
        destinationCard(
          this.state,
          (destination) => {
            this.overlay.close();
            startTrip(this.state, destination);
          },
          () => this.overlay.close(),
        ),
      );
      return;
    }
    // Кіт на руках біля аптечки: догляд (§8.7) — ліки, ласощі, нашийник.
    const cat = medicineCat(this.state);
    if (cat && targetOf(this.state)?.id === "cat-kit" && hasCareSupplies(this.state, cat)) {
      this.overlay.show(
        careCard(
          this.state,
          cat,
          (choice) => {
            const rng = stateRng(this.state, "behavior");
            if (choice === "collar") putCollar(this.state);
            else if ("medicine" in choice) giveMedicine(this.state, choice.medicine, rng);
            else if ("treat" in choice) giveTreat(this.state, choice.treat, rng);
            else giveCatnip(this.state, choice.catnip, rng);
            this.overlay.close();
          },
          () => this.overlay.close(),
        ),
      );
      return;
    }
    // Ліжко у вікні сну: персонаж засинає не миттєво (§8.8).
    if (this.state.character.held === null && targetOf(this.state)?.id === "bed" && canGoToSleep(this.state)) {
      this.fallAsleep(false);
      return;
    }
    interact(this.session.save);
  }

  /** Почати засинання: очі заплющуються, екран темніє, потім ніч (§8.8). */
  private fallAsleep(collapsed: boolean): void {
    this.asleep = { started: this.time.now, collapsed };
    this.moving = false;
  }

  /** Засинання триває; коли екран уже темний — ніч (у ліжку чи там, де впав без сил). */
  private tickAsleep(time: number): void {
    const asleep = this.asleep;
    if (!asleep || time - asleep.started < FALL_ASLEEP.total) return;
    this.asleep = null;
    const save = this.session.save;
    // До межі лишалися частки хвилини; більше — стан змінився, і перемотувати день не можна.
    if (asleep.collapsed) advance(save, Math.min(1, Math.max(0, collapseMinute(save.current) - save.current.minute)));
    else interact(save);
    // Темряву прибрати, коли екран уже закрила титулка чи екран кінця гри; без них — одразу.
    const covered = this.overlay.isOpen || this.state.end !== null;
    this.time.delayedCall(covered ? 1000 : 0, () => this.wakeUp());
  }

  /** Прибрати засинання: очі, наїзд і темряву. */
  private wakeUp(): void {
    this.asleep = null;
    this.dark.setFillStyle(0x000000, 0);
    this.viewport.focus(1);
  }

  private dash(): void {
    if (this.blocked()) return;
    dash(this.state);
  }

  /** Гра стоїть: картка, пауза розробника, кінець гри, засинання чи заглушка «Поверніть телефон» (§10). */
  private blocked(): boolean {
    return this.overlay.isOpen || this.session.paused || this.state.end !== null || this.asleep !== null || isRotateNoticeShown();
  }

  private readInput(): Input {
    if (isTyping()) return IDLE;
    const k = this.keys;
    let x = 0;
    let y = 0;
    if (k) {
      if (k.left.isDown || k.left2.isDown) x -= 1;
      if (k.right.isDown || k.right2.isDown) x += 1;
      if (k.up.isDown || k.up2.isDown) y -= 1;
      if (k.down.isDown || k.down2.isDown) y += 1;
    }
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    x += this.touch.move.x;
    y += this.touch.move.y;
    const hold = (k?.action.isDown ?? false) || (k?.action2.isDown ?? false) || this.touch.holding;
    return { move: { x, y }, hold };
  }

  /** Поїздка (§8.5): гонку веде своя сцена, подію на місці й аварію — картки. */
  private updateTrip(): boolean {
    const trip = this.state.trip;
    if (trip === null || this.state.end !== null) return false;
    if (trip.phase === "drive") {
      // Поки відкрита картка (меню після перезавантаження сторінки посеред гонки), гонка не йде: перевірка поїздок 2026-10-28.
      if (!this.overlay.isOpen && !this.scene.isActive("race")) {
        this.scene.launch("race");
        this.scene.sleep();
      }
      return true;
    }
    if (this.overlay.isOpen) return true;
    if (trip.phase === "accident") {
      this.overlay.show(
        accidentCard(this.state, () => {
          this.overlay.close();
          rewindAccident(this.session.save);
        }),
      );
      return true;
    }
    this.showVisit();
    return true;
  }

  private showVisit(): void {
    const state = this.state;
    const trip = state.trip;
    if (!trip) return;
    // Журнал візиту — у стані поїздки: переживає перезавантаження сторінки (перевірка циклу гри 2026-10-27).
    const log = (trip.log ??= { exam: null, done: [] });
    // Перший показ візиту, а не оновлення картки після дії на місці.
    const arrived = !this.overlay.isOpen;
    if (trip.destination === "office" && !log.done.includes("office")) {
      officeMeeting(state);
      log.done.push("office");
    }
    const again = (): void => this.showVisit();
    const rng = stateRng(state, "behavior");
    const card = visitCard(state, log, {
      checkout: (cart) => {
        checkout(state, cart, "store");
        again();
      },
      // Знімок огляду симуляція сама кладе в журнал поїздки: огляд входить і в операцію (рішення автора 2026-10-29, А3).
      exam: () => {
        vetExam(state);
        again();
      },
      // Що дали послуги, симуляція сама пише в журнал поїздки (§8.5): картка показує це в рядках.
      treat: (disease, quality) => {
        vetTreat(state, disease, quality, rng);
        again();
      },
      treatSelf: (illness, quality) => {
        doctorTreat(state, illness, quality, rng);
        again();
      },
      // Узятого кота симуляція сама пише в журнал візиту: картка каже, хто їде додому (рецензія реалізації А6).
      adopt: (id) => {
        adopt(state, id);
        again();
      },
      sterilize: () => {
        vetSterilize(state);
        again();
      },
      buyKitten: (id) => {
        buyFromBreeder(state, id);
        again();
      },
      groom: (quality) => {
        groom(state, quality, rng);
        again();
      },
      show: () => {
        enterShow(state, rng);
        again();
      },
      // Час на місці — лише за отримані послуги, без жодної — 15 хвилин (§8.5; рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А6).
      home: () => {
        this.overlay.close();
        goHome(this.session.save);
        this.viewport.jump();
      },
    });
    // На зборах підвищили — спершу картка кар'єри, а візит після неї (раніше візит її затирав).
    if (arrived && this.overlay.isOpen) this.queued.unshift(card);
    else this.overlay.show(card);
  }

  /** Відпустили швидко — взяти кота на руки; тримають довше — це пестощі, їх веде симуляція (§8.2). */
  private resolveCatPress(hold: boolean): void {
    if (this.catPress === null) return;
    const elapsed = this.time.now - this.catPress;
    if (hold && elapsed < CAT_TAP_MS) return;
    this.catPress = null;
    if (!hold && elapsed < CAT_TAP_MS) interact(this.session.save);
  }

  /**
   * Картка, що чекає своєї черги: подія сталася, поки відкрита титулка чи інша картка. Раніше
   * нова картка заміняла відкриту — і титулка ранку, картка знайди чи телефон зникали.
   */
  private readonly queued: Card[] = [];
  /** Картки, що мають сенс лише свого дня (дзвінок мами): уночі пропущені, вони не чекають ранку. */
  private readonly todayOnly = new WeakSet<Card>();

  private queueCard(card: Card): void {
    // Гонку картки не перебивають (§8.5): чекають, доки персонаж доїде чи потрапить в аварію. Раніше картка вискакувала
    // поверх дороги, а машина без керування врізалася (перевірка поїздок 2026-10-28).
    if (this.overlay.isOpen || this.state.trip?.phase === "drive") this.queued.push(card);
    else this.overlay.show(card);
  }

  override update(time: number, delta: number): void {
    const next = this.overlay.isOpen ? undefined : this.queued.shift();
    if (next) this.overlay.show(next);
    if (this.updateTrip()) {
      this.render(time, 0);
      return;
    }
    const seconds = Math.min(delta / 1000, MAX_FRAME_SECONDS);
    this.tickAsleep(time);
    if (!this.blocked()) {
      const input = this.readInput();
      // Натискання біля кота ще не вирішене (до CAT_TAP_MS): це може бути «узяти на руки», тож симуляція кнопки поки не бачить —
      // пестощі почнуться, лише коли її тримають довше (§9.12; загальна ревізія 2026-10-29: за мить натискання кота встигали
      // погладити — сплячого будили пестощами й брали на руки без образи, а «Відлюдник» устигав піти з-під руки).
      const pending = this.catPress !== null && this.time.now - this.catPress < CAT_TAP_MS;
      const simInput: Input = pending ? { ...input, hold: false } : input;
      this.moving = this.state.character.activity === null && this.state.character.body.stun <= 0 && isMoving(input.move);
      const minutes = gameMinutes(seconds) * this.session.speed;
      // Пора падати без сил (§8.8): зупинитися перед межею й засинати анімацією, а не миттєво.
      const untilCollapse = collapseMinute(this.state) - this.state.minute - FALL_ASLEEP.lead;
      if (minutes >= untilCollapse) {
        const night = advance(this.session.save, Math.max(0, untilCollapse), simInput);
        if (night === null && this.state.end === null) this.fallAsleep(true);
      } else {
        advance(this.session.save, minutes, simInput);
      }
      this.resolveCatPress(input.hold);
      // Стан думками (§11.4): час думок іде лише разом із грою.
      if (!this.blocked()) {
        const taken = (owner: string): boolean => this.bubbles.busy(owner) || this.bubbles.hasState(owner);
        for (const thought of this.thoughts.tick(this.state, seconds, taken)) this.bubbles.show(thought, this.anchorFn(thought.at, "think"), THOUGHT_HOLD_MS);
      }
    } else {
      this.moving = false;
    }
    this.render(time, seconds);
  }

  /** Скільки грошей бачила сцена: приріст показується над персонажем (§11.4). */
  private moneySeen: number | null = null;
  private earned = 0;
  private earnedShownAt = 0;

  /** Гроші прийшли (робота, премія, приз) — над персонажем виринає зелене «+N ₴», не частіше ніж раз на 3 секунди. */
  private showEarnings(time: number): void {
    const money = this.state.character.money;
    if (this.moneySeen !== null && money > this.moneySeen) this.earned += money - this.moneySeen;
    this.moneySeen = money;
    if (this.earned >= 1 && time - this.earnedShownAt >= EARNINGS_POP_MS && this.state.trip === null) {
      const shown = Math.floor(this.earned);
      this.earned -= shown;
      this.earnedShownAt = time;
      this.bubbles.popText(`+${shown} ₴`, this.personAnchor, "#8fdc7a");
    }
  }

  private render(time: number, seconds: number): void {
    const state = this.state;
    const frame: WorldFrame = { time, seconds, moving: this.moving, sleepiness: this.sleepiness(time), blocked: this.blocked(), showHidden: this.session.showHidden };
    this.hud.update(state, time);
    if (!this.overlay.isOpen && !this.hud.saying) {
      const news = this.news.shift();
      if (news) this.hud.say(news.title, news.text, time);
    }
    this.world.update(state, frame);
    this.forgetGoneCats(state);
    this.showEarnings(time);
    this.bubbles.update();
    this.hearts.update();
    this.viewport.follow(this.world.person.head, seconds);
    this.updateStateBubbles();
    this.touch.draw(canDash(state));
    this.drawFallingAsleep(time);
    // Низький здоровий глузд — світ трохи пливе (§6.3).
    const sanity = state.character.stats.sanity;
    this.gloom.setFillStyle(0x5b3a7a, sanity < LOW_STAT ? ((LOW_STAT - sanity) / LOW_STAT) * 0.22 : 0);
  }

  /** Наскільки заплющені очі під час засинання: 0–1 (§8.8). */
  private sleepiness(time: number): number {
    if (!this.asleep) return 0;
    const t = Math.min(1, (time - this.asleep.started) / FALL_ASLEEP.eyes);
    // Повіки опускаються повільно й нерівно, як коли засинаєш.
    return t * t * (3 - 2 * t);
  }

  /** Засинання: камера наїжджає на персонажа, екран поступово темніє до чорного титулки (§8.8). */
  private drawFallingAsleep(time: number): void {
    if (!this.asleep) return;
    const t = time - this.asleep.started;
    const eyes = this.sleepiness(time);
    this.viewport.focus(1 + FALL_ASLEEP.zoom * eyes);
    const dark = Phaser.Math.Clamp((t - FALL_ASLEEP.darkFrom) / (FALL_ASLEEP.total - FALL_ASLEEP.darkFrom), 0, 1);
    this.dark.setFillStyle(0x000000, dark);
  }

  /** Кіт зник із дому (віддали, помер): його бабла стану більше немає. */
  private forgetGoneCats(state: GameState): void {
    const alive = new Set(state.cats.map((cat) => cat.id));
    for (const id of this.catsShown) if (!alive.has(id)) this.bubbles.setState(`cat:${id}`, "say", null, 0, 0);
    this.catsShown.clear();
    for (const id of alive) this.catsShown.add(id);
  }

  /** Бабли стану (§11.4): що висить, поки триває. Над речами й котами — вголос, над персонажем — думка. */
  private updateStateBubbles(): void {
    const state = this.state;
    const set = (id: string, icon: IconName | null): void => {
      const anchor = this.belowHud(this.world.anchor(id), "say");
      if (anchor) this.bubbles.setState(id, "say", icon, anchor.x, anchor.y);
      else this.bubbles.setState(id, "say", null, 0, 0);
    };
    const working = isWorking(state);
    const standup = isWorkday(state) && state.minute >= STANDUP_MINUTE && state.minute < STANDUP_MINUTE + STANDUP_MINUTES;
    let computer: IconName | null = null;
    const day = state.minute % 1440;
    // Нарада — лише в робочий день: звільненого чи на лікарняному камера не чекає (перевірка модифікаторів 2026-10-28).
    const meeting = state.modifiers.day === "meeting" && isWorkday(state) && day >= MODIFIERS.meeting.from && day < MODIFIERS.meeting.from + MODIFIERS.meeting.minutes;
    // Дріт перегризено (§9.12, «Гризіння»): над комп'ютером — перегризений дріт, доки його не полагодять.
    if (state.home.wireChewed === true) computer = "wire";
    else if (!working && (standup || meeting)) computer = "camera";
    else if (internetOut(state)) computer = "no-internet";
    else if (!working && isWorkTime(state)) {
      const level = patienceLevel(state);
      computer = level === "out" ? "cross" : level === "warning" ? "alert" : null;
    }
    set("computer", computer);

    // Персонаж у душовій кабіні — над нею вода.
    const activity = state.character.activity;
    set("shower", activity?.kind === "use" && activity.inside ? "drop" : null);
    set("stove", stoveIcon(state.home.stove.item));
    // Кіт на сходах важливіший за пакунок (§9.12).
    set("door", state.cats.some((c) => c.away === "stairs") ? "meow" : state.home.porch.length > 0 ? "box" : null);
    const table = objectById("table");
    const target = targetOf(state);
    // Страва на столі — її іконкою: мамин судочок — своєю (§6.4).
    const onTable = state.home.surfaces["table"] ?? null;
    set("table", onTable !== null && state.character.activity === null && canUse(state, { type: "object", id: "table", object: table }) && target?.id !== "table" ? itemIcon(onTable) : null);
    // Побут (§8.7): пральна машина пере чи чекає, щоб випране розвісили; одяг скінчився.
    const washer = state.home.washer.state;
    set("washer", washer === "washing" ? "washer" : washer === "done" ? "washed" : null);

    // Котячий куток: без води, брудний лоток. Порожню миску показує кіт, що просить їсти.
    for (const thing of state.home.items) {
      const id = `item:${thing.id}`;
      if (thing.kind === "water") set(id, thing.water === 0 ? "thirst" : null);
      else if (thing.kind === "litter") set(id, isDirty(thing) ? "dirty" : null);
    }
    // Кіт просить їсти (на умивальнику — пити з крана, §9.12 «Пиття») чи б'ється — це чути. Дзвіночка, що видавав схованого кота,
    // більше немає (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А17).
    for (const cat of state.cats) {
      // Застряглий нагорі (§9.12, «Лазіння») кричить баблами нявкання: сталий бабл над ним, притиснутий під панель, закривав би
      // самого кота (перевірка скриншотом 2026-10-26).
      const asking = cat.act.kind === "beg" && cat.act.goal === null && cat.act.target !== "high";
      const fighting = cat.act.kind === "fight";
      // Пити просить і біля порожньої миски для води, і там, де вона стояла, коли мисок немає (перевірка стосунків 2026-10-26:
      // біля порожньої миски для води над котом був корм).
      const thirsty = cat.act.target === "sink" || cat.act.target === "water" || state.home.items.some((i) => i.kind === "water" && `item:${i.id}` === cat.act.target);
      // «Втікач» під дверима просить на сходи — кричить (§9.12 «Двері й гості»).
      const ask: IconName = thirsty ? "thirst" : cat.act.target === "door" ? "meow" : "kibble";
      // «Терплячий зранку» біля ліжка чекає мовчки (§9.12, рішення автора 2026-10-26): хоче їсти — думка, а не нявкання.
      const key = `cat:${cat.id}` as const;
      if (cat.away === null && !fighting && asking && cat.act.target === "bed") {
        const anchor = this.belowHud(this.world.anchor(key), "think");
        if (anchor) this.bubbles.setState(key, "think", "kibble", anchor.x, anchor.y);
        else this.bubbles.setState(key, "think", null, 0, 0);
        continue;
      }
      // Бабл «бійка» над клубком — один на двох (§9.4, «Пози стосунків»).
      set(key, cat.away !== null ? null : fighting ? (showsFightBubble(state, cat) ? "fight" : null) : asking ? ask : null);
    }
    // Вміст сховищ (§6.4): над баблом стану, якщо він є, але не вище задньої стіни — над високим
    // холодильником індикатор лягає на його лицьову грань. Поки над персонажем (він стоїть перед сховищем)
    // чи над самим сховищем бабл події, індикатор схований: бабл і так каже, скільки лишилося.
    const highest = this.projection.toScreen({ x: 0, y: 1 }).y - this.projection.wallRise + 40;
    const personBusy = this.bubbles.busy("person");
    for (const storage of STORAGES) {
      const anchor = this.world.anchor(storage.object);
      if (!anchor) continue;
      const lift = this.bubbles.hasState(storage.object) ? 56 : 0;
      const lines = personBusy || this.bubbles.busy(storage.object) ? [] : storageIndicator(state, storage);
      this.storage.set(storage.object, lines, anchor.x, Math.max(highest, anchor.y - lift));
    }
    // Ящики біля входу (§6.4): зблизька видно, що в них лежить.
    const boxes = this.world.anchor("boxes");
    this.storage.set("boxes", boxes && !personBusy ? boxesIndicator(state) : [], boxes?.x ?? 0, boxes?.y ?? 0);
    // Сонливість — думка персонажа.
    const head = this.belowHud(this.world.person.head, "think") ?? this.world.person.head;
    this.bubbles.setState("person", "think", isDrowsy(state) ? "zz" : null, head.x, head.y);
  }

  /** Іконка летить дугою від однієї точки до іншої: запаси з ящиків і корм із годівниці — у сховища (§6.4, §9.12). */
  private flyIcon(icon: IconName, from: { x: number; y: number }, to: { x: number; y: number }, delay: number, onArrive: () => void): void {
    const image = this.add.image(from.x, from.y, iconTexture(icon)).setDisplaySize(48, 48).setDepth(WORLD_LAYERS.flying).setVisible(false).addToDisplayList(this.viewport.world);
    const flight = { t: 0 };
    this.tweens.add({
      targets: flight,
      t: 1,
      delay,
      duration: 900,
      ease: "Sine.easeInOut",
      onStart: () => image.setVisible(true),
      onUpdate: () => {
        const t = flight.t;
        image.setPosition(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * 120);
      },
      onComplete: () => {
        image.destroy();
        onArrive();
      },
    });
  }

  /** Над головою персонажа: бабли подій летять за ним, коли він іде. */
  private readonly personAnchor = (): { x: number; y: number } => ({ x: this.world.person.head.x, y: this.world.person.head.y });

  /**
   * Де бабл події: над персонажем, котом чи річчю — і летить за ним. Не вище видимого краю квартири: інакше
   * над котом на шафі чи над верхнім рядом бабл ховається під панеллю.
   */
  private anchorFn(id: string, kind: BubbleKind): Anchor {
    return () => this.belowHud(id === "person" ? this.personAnchor() : this.world.anchor(id), kind);
  }

  /** Точка бабла, опущена так, щоб увесь бабл лишався під панеллю (§11.4). */
  private belowHud(p: { x: number; y: number } | null, kind: BubbleKind): { x: number; y: number } | null {
    if (!p) return null;
    return { x: p.x, y: Math.max(p.y, this.viewport.worldTop + BUBBLE_ROOM[kind]) };
  }

  /** Бабли подій (вголос чи думка — `eventBubbles`, §11.4) і картки. */
  private onGameEvent(event: GameEvent): void {
    // Частини світу дізнаються про подію першими: червона смужка відмови, разові анімації.
    this.world.onEvent(event, this.time.now);
    for (const bubble of eventBubbles(event)) this.bubbles.show(bubble, this.anchorFn(bubble.at, bubble.kind));
    // Над сховищем, куди долетів запас, — вголос, скільки в ньому тепер (§6.4).
    const landed = (storage: string, product: Product): void => {
      this.bubbles.show({ kind: "say", at: storage, icon: PRODUCT_ICONS[product], count: supplyCount(this.state, product) }, this.anchorFn(storage, "say"));
    };
    switch (event.type) {
      case "unpacked": {
        // Запаси розлітаються з ящиків по своїх сховищах (§6.4).
        const from = this.world.objectAnchor("boxes");
        if (!from) break;
        event.moved.forEach((moved, i) => {
          const storage = STORAGES.find((s) => s.products.includes(moved.product));
          const to = storage ? this.world.anchor(storage.object) : null;
          if (!storage || !to) return;
          this.flyIcon(PRODUCT_ICONS[moved.product], from, to, i * 140, () => landed(storage.object, moved.product));
        });
        break;
      }
      case "feeder-emptied": {
        // Корм із годівниці летить назад у своє сховище (§9.12).
        const from = this.world.anchor(`item:${event.item}`);
        if (!from) break;
        event.products.forEach((product, i) => {
          const storage = STORAGES.find((s) => s.products.includes(product));
          const to = storage ? this.world.anchor(storage.object) : null;
          if (!storage || !to) return;
          this.flyIcon(PRODUCT_ICONS[product], from, to, i * 140, () => landed(storage.object, product));
        });
        break;
      }
      case "glitch":
        this.cameras.main.shake(180, 0.004);
        break;
      case "cat-felt":
        // Настрій кота — сердечками, а не баблами (§9.12).
        this.hearts.add(event.cat, event.delta);
        break;
      case "bite":
        this.cameras.main.shake(140, 0.003);
        break;
      case "tripped":
      case "slipped":
      case "knocked-down":
      case "ambushed":
        this.cameras.main.shake(160, 0.004);
        break;
      case "cat-fight":
        this.cameras.main.shake(120, 0.002);
        break;
      case "trait-noticed": {
        // Про кота щось стало відомо — телефон скаже (§9.9, правка автора 2026-10-25).
        const news = traitNews(this.state, event.cat, event.group, event.stage);
        if (news) this.news.push(news);
        break;
      }
      case "night":
        if (this.state.end === null) {
          this.cameras.main.fadeIn(500, 20, 16, 24);
          this.showMorning(event.report);
        }
        break;
      case "modifier":
        this.onModifier(event.kind, event.value, event.guests, event.paid);
        break;
      case "career": {
        const message = CAREER_MESSAGES[event.change];
        const { name, address } = this.state.character;
        const title = fill(POSITION_TITLES[event.position] ?? "", address);
        const position = event.change === "demoted" ? title : title.toLowerCase();
        this.queueCard({
          kicker: "Робота",
          title: message.title,
          body: [fill(message.text, address, { персонаж: name, посада: position })],
          actions: [{ label: "Зрозуміло", primary: true, onSelect: () => this.overlay.close() }],
          onDismiss: () => this.overlay.close(),
        });
        break;
      }
      case "game-over":
        this.time.delayedCall(250, () => this.showEnd());
        break;
      default:
        break;
    }
  }

  private showMorning(night: GameState["lastNight"]): void {
    // Зміни настрою за ніч гравець не бачив: сердечками їх не показують. Думки вранці — з нуля.
    this.hearts.clear();
    this.thoughts = new ThoughtClock();
    // Подія, що сталася тієї ж ночі чи перемотаного дня (гості після аварії), чекає титулки, а не зникає під нею.
    const open = this.overlay.shown;
    if (open) this.queued.unshift(open);
    for (let i = this.queued.length - 1; i >= 0; i--) if (this.todayOnly.has(this.queued[i] as Card)) this.queued.splice(i, 1);
    this.overlay.title(dayTitle(this.state, night), () => this.afterMorning());
  }

  /** Картка дзвінка мами (§4.1): коли мама подзвонила, і знову після перезавантаження, поки гравець не вирішив. */
  private showCall(): void {
    const card = callCard(
      () => {
        this.overlay.close();
        // Дзвінок уже вирішено (подвійне натискання) — розмова не повторюється.
        if (answerCall(this.state)) advance(this.session.save, MODIFIERS.call.minutes);
      },
      () => {
        ignoreCall(this.state);
        this.overlay.close();
      },
    );
    this.todayOnly.add(card);
    this.queueCard(card);
  }

  private onModifier(kind: ModifierEvent, value: number, guests?: GuestsVisit, paidNow?: number): void {
    const money = Math.round(Math.abs(value));
    switch (kind) {
      case "mom-call":
        this.showCall();
        return;
      case "meeting-start":
        // Бабл камери над комп'ютером — `eventBubbles`.
        return;
      case "meeting-missed":
        this.notice("Нараду пропущено", "Керівництво чекало на дзвінку, а вас не було.");
        return;
      case "home-vet": {
        // Ветеринарка оглянула всіх котів, що вдома (рішення автора 2026-10-27, Х7), і як кожен поводився (§9.12); хвороби — id:
        // назви й поради до них дає `homeVetText`.
        const cats = this.state.cats
          .filter((c) => c.away === null)
          .map((c) => ({ name: c.name, sex: c.sex, diseases: c.diseases.map((d) => d.id), manner: vetManner(c) }));
        this.notice("Заходила ветеринарка", homeVetText(cats));
        return;
      }
      case "inspection": {
        const paid = Math.floor(paidNow ?? value);
        const fine = money > 0 ? `Представник ОСББ поморщився й виписав штраф: ${money} ₴.${paid < money ? ` Заплатили ${paid} ₴ — усе, що було.` : ""}` : "Представник ОСББ не знайшов, до чого причепитися.";
        this.notice("Перевірка від ОСББ", fine);
        return;
      }
      case "guests":
        this.notice("Прийшли гості", guestsText(guests));
        return;
      case "inspection-away":
        this.notice("Перевірка від ОСББ", "Представник ОСББ дзвонив у двері, але вдома нікого не було.");
        return;
      case "guests-away":
        this.notice("Гості не застали", "Гості дзвонили в двері, але вдома нікого не було, і вони пішли.");
        return;
      case "home-vet-away":
        this.notice("Ветеринарка не застала", "Ветеринарка дзвонила в двері, але вдома нікого не було.");
        return;
      case "mom-food": {
        const visit = value > 0;
        const text = visit ? MOM_FOOD_TEXTS.visit : MOM_FOOD_TEXTS.porch;
        // Мама поставила судочки в холодильник (§6.4, §11.4): закрили повідомлення — над холодильником вголос, скільки їх там.
        // Не застала — пакет у ящиках біля входу, їх і так видно.
        const fridge = (): void => {
          const count = supplyCount(this.state, "momMeal");
          this.bubbles.show({ kind: "say", at: "fridge", icon: PRODUCT_ICONS.momMeal, count }, this.anchorFn("fridge", "say"));
        };
        this.notice(text.title, text.text, undefined, visit ? fridge : undefined);
        return;
      }
      case "office-missed":
        this.notice("Збори без вас", "На зборах в офісі вас так і не дочекалися.");
        return;
      case "fireworks":
        this.cameras.main.shake(300, 0.004);
        return;
      default:
        return;
    }
  }

  /** Після титулки: знайда під дверима (§8.5). */
  private afterMorning(): void {
    if (!this.state.today.foundling) return this.overlay.close();
    this.overlay.show(
      foundlingCard(
        () => {
          decideFoundling(this.state, true);
          this.overlay.close();
        },
        () => {
          decideFoundling(this.state, false);
          this.overlay.close();
          carryFoundling(this.session.save);
          this.viewport.jump();
        },
      ),
    );
  }

  /** Повідомлення посеред дня (§4.1): стає в чергу, якщо відкрита інша картка. */
  /** Повідомлення дня; `after` — коли його закрили. */
  private notice(title: string, text: string, kicker = "Подія дня", after?: () => void): void {
    const close = (): void => {
      this.overlay.close();
      after?.();
    };
    this.queueCard({ kicker, title, body: [text], actions: [{ label: "Зрозуміло", primary: true, onSelect: close }], onDismiss: close });
  }

  private showEnd(): void {
    const end = this.state.end;
    if (end === null) return;
    const save = this.session.save;
    const { parts, actions } = endScreen(this.state, end, {
      replayDay: () => {
        replayDay(save);
        this.session.replace(save);
      },
      replayWeek: () => {
        replayWeek(save);
        this.session.replace(save);
      },
      newGame: () => this.chooseNewGame(),
    });
    this.overlay.ending(parts, actions);
  }

  private confirmNewGame(back: () => void): void {
    this.overlay.show({
      kicker: "Нова гра",
      title: "Почати заново?",
      body: ["Поточну гру буде втрачено, якщо її не зберегти файлом."],
      actions: [
        { label: "Почати нову гру", primary: true, onSelect: () => this.chooseNewGame() },
        { label: "Повернутися", onSelect: back },
      ],
      onDismiss: back,
    });
  }

  /**
   * Завантажити гру з файлу (§4.2): спершу підтвердження, як і для нової гри, — поточну гру буде втрачено. Картка каже, що у
   * файлі, щоб гравець помітив, якщо обрав не той (загальна ревізія 2026-10-29: раніше файл одразу замінював гру).
   */
  private confirmImport(save: Save, back: () => void): void {
    const loaded = save.current;
    const file = fill(IMPORT_SAVE.file, loaded.character.address, {
      "ім'я": loaded.character.name,
      тиждень: weekOf(loaded.day),
      складність: DIFFICULTY_TITLES[loaded.difficulty],
    });
    this.overlay.show({
      kicker: IMPORT_SAVE.kicker,
      title: IMPORT_SAVE.title,
      body: [file, IMPORT_SAVE.body],
      actions: [
        { label: IMPORT_SAVE.load, primary: true, onSelect: () => this.session.replace(save) },
        { label: IMPORT_SAVE.back, onSelect: back },
      ],
      onDismiss: back,
    });
  }

  /** Збереження не вдалося відкрити (§4.2, рішення автора 2026-10-27, Ц3): зберегти його файлом чи одразу нова гра. */
  private showUnreadableSave(json: string, next: () => void): void {
    const done = (): void => {
      this.session.unreadable = null;
      next();
    };
    this.overlay.show({
      kicker: UNREADABLE_SAVE.kicker,
      title: UNREADABLE_SAVE.title,
      body: [UNREADABLE_SAVE.body],
      actions: [
        {
          label: UNREADABLE_SAVE.save,
          primary: true,
          onSelect: () => {
            exportUnreadable(json);
            done();
          },
        },
        { label: UNREADABLE_SAVE.fresh, onSelect: done },
      ],
      // Гра ще не почалася: квартиру й панель заглушки нової гри за карткою не видно, як і в картках вибору персонажа.
      solid: true,
    });
  }

  /**
   * Нова гра (§5.1): зовнішність (з випадкової), звертання «він / вона», хронотип, ім'я, потім складність. Кожен крок, крім першого, —
   * з «Назад»; повернувшись, гравець бачить свій вибір. Статі немає (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А4).
   */
  private chooseNewGame(): void {
    // Seed нової гри — наперед: з нього й випадкова зовнішність редактора.
    const seed = newSeed();
    const looks = lookRng(seed);
    // Що гравець уже обрав: повернувшись «Назад», він бачить свій вибір.
    let entered: EnteredName | null = null;
    let addressed: Address | null = null;
    let chronotyped: Chronotype | null = null;
    const pickLook = (look: Look): void => this.overlay.show(lookCard(look, pickAddress, () => randomLook(looks)));
    const pickAddress = (look: Look): void =>
      this.overlay.show(addressCard(look, addressed, (address) => pickChronotype(look, address), () => pickLook(look)));
    const pickChronotype = (look: Look, address: Address): void => {
      addressed = address;
      this.overlay.show(chronotypeCard(chronotyped, (chronotype) => pickName(look, address, chronotype), () => pickAddress(look)));
    };
    const pickName = (look: Look, address: Address, chronotype: Chronotype): void => {
      chronotyped = chronotype;
      this.overlay.show(
        nameCard(
          address,
          startName(address, entered),
          (name) => {
            entered = { name, address };
            this.overlay.show(
              difficultyCard(
                (difficulty: Difficulty) => this.session.replace(newGame({ address, difficulty, name, look, chronotype, seed })),
                () => pickName(look, address, chronotype),
              ),
            );
          },
          (name) => {
            entered = { name, address };
            pickChronotype(look, address);
          },
        ),
      );
    };
    pickLook(randomLook(looks));
  }

  private openPhone(): void {
    if (this.blocked()) return;
    // Підказку телефоном побачено (§6.4).
    seePhoneHints(this.state);
    const confirmDiscard = (kind: ThingKind, done: () => void): void =>
      this.overlay.show({
        kicker: "Речі",
        title: `Викинути: ${THING_TITLES[kind].toLowerCase()}?`,
        // Без прогнозу комунальних: тексти не пояснюють механік (§11.3а; крок 17, вичитка 2026-10-28).
        body: ["Повернути не можна."],
        actions: [
          {
            label: "Викинути",
            primary: true,
            onSelect: () => {
              done();
              show("mine");
            },
          },
          { label: "Повернутися", onSelect: () => show("mine") },
        ],
        onDismiss: () => show("mine"),
      });
    const show = (tab: PhoneTab): void =>
      this.overlay.show(
        phoneCard(this.state, tab, {
          checkout: (cart) => {
            checkout(this.state, cart, "delivery");
            show(tab);
          },
          // Викинути — назавжди: спершу картка-підтвердження (перевірка побуту 2026-10-28: подвійний дотик викидав другу річ).
          discard: (item: HomeItem) => confirmDiscard(item.kind, () => discard(this.state, item.id)),
          discardThing: (thing) => {
            if ("appliance" in thing) confirmDiscard(thing.appliance, () => discardAppliance(this.state, thing.appliance));
            else if ("feeder" in thing) confirmDiscard("feeder", () => discardFeeder(this.state, thing.feeder));
            else confirmDiscard(thing.owned, () => (thing.owned === "carrier" ? discardCarrier(this.state) : discardLock(this.state)));
          },
          // Віддати — назавжди: спершу картка-підтвердження (перевірка розмноження 2026-10-28: був один дотик без підтвердження);
          // без чисел ефекту — тексти не називають прихованих чисел (§11.3а; крок 17, вичитка 2026-10-28).
          advertise: (cat) =>
            this.overlay.show({
              kicker: "Віддати в добрі руки",
              title: "Віддати в добрі руки?",
              body: [
                `${cat.name} завтра вранці поїде до нових господарів. ${recentlyArrived(cat, this.state.day + 1) ? GIVE_AWAY_RECENT : GIVE_AWAY_LATER}`,
              ],
              actions: [
                {
                  label: "Дати оголошення",
                  primary: true,
                  onSelect: () => {
                    advertise(this.state, cat);
                    show(tab);
                  },
                },
                { label: "Повернутися", onSelect: () => show(tab) },
              ],
              onDismiss: () => show(tab),
            }),
          cancelAd: (cat) => {
            cancelAd(this.state, cat);
            show(tab);
          },
          newGame: () => this.confirmNewGame(() => show(tab)),
          exportSave: () => exportSave(this.session.save),
          importSave: (file) => {
            // Поганий файл — одразу «Не вдалося завантажити», без зайвого питання; добрий — спершу підтвердження.
            void importSave(file).then(
              (save) => this.confirmImport(save, () => show(tab)),
              () => {
                this.overlay.close();
                this.notice("Не вдалося завантажити", "Цей файл не схожий на збереження Котоклопіту або збережений старою версією гри.", "Гра");
              },
            );
          },
          tab: show,
          close: () => this.overlay.close(),
        }),
      );
    show("shop");
  }
}
