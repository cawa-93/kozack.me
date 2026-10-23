import Phaser from "phaser";

import { catFeeling, useProgress, IDLE, type Input } from "../sim/actions";
import { canDash, dash, isMoving } from "../sim/body";
import { isDirty } from "../sim/catai";
import { BURN_MINUTES, COOK_MINUTES, LOW_STAT, MODIFIERS, STANDUP_MINUTE, STANDUP_MINUTES } from "../sim/config";
import { discard, seePhoneHints, supplyCount } from "../sim/economy";
import { checkout } from "../sim/shop";
import { onEvent, type GameEvent, type ModifierEvent, type Refusal } from "../sim/events";
import { advance, DEFAULT_LOOK, interact, newGame, replayDay, replayWeek, returnHome, rewindAccident } from "../sim/game";
import { TRIPS } from "../sim/config";
import { doctorExam, doctorTreat } from "../sim/illness";
import { adopt, buyFromBreeder, cafe, enterShow, giveToShelter, groom, officeMeeting, vetExam, vetSterilize, vetTreat } from "../sim/destinations";
import { canLeave, startTrip } from "../sim/trips";
import { advertise } from "../sim/farewell";
import { exportSave, importSave } from "../ui/files";
import { accidentCard, destinationCard, visitCard, type VisitLog } from "../ui/trips";
import { isPresent, objectById } from "../sim/home";
import { canGoToSleep, collapseMinute, isDrowsy } from "../sim/sleep";
import { targetOf, type Target } from "../sim/targets";
import { gameMinutes } from "../sim/time";
import type { Chronotype, Difficulty, GameState, HomeItem, Look, Sex } from "../sim/types";
import { isWorking, isWorkday, isWorkTime, patienceLevel } from "../sim/work";
import type { Session } from "../session";
import { callCard, careCard, chronotypeCard, difficultyCard, titleCard, endScreen, foundlingCard, hasCareSupplies, lookCard, dayTitle, nameCard, phoneCard, sexCard, sinkCard, type PhoneTab } from "../ui/cards";
import { decideFoundling, ignoreCall, powerOut } from "../sim/modifiers";
import { beardLook, groomBeard } from "../sim/grooming";
import { addBell, giveTreat, putCollar } from "../sim/care";
import { giveMedicine, medicineCat } from "../sim/diseases";
import { stateRng } from "../sim/rng";
import { Overlay, type Card } from "../ui/overlay";
import { CAREER_MESSAGES, diseaseTitle, fill, POSITION_TITLES } from "../texts";
import { canUse } from "../sim/actions";
import { drawApartment, drawItem, objectHeight, type ObjectView } from "../view/apartment";
import { Bubbles } from "../view/bubbles";
import { PRODUCT_ICONS, StorageIndicators } from "../view/storage";
import { boxesIndicator, STORAGES, storageIndicator, storageStages } from "../sim/storage";
import { drawStorage } from "../view/storagelook";
import { CatView } from "../view/cat";
import { drawCatCorner, itemScreen } from "../view/catcorner";
import { COLORS, toScreen, WALL_RISE } from "../view/geometry";
import { Hud } from "../view/hud";
import { createIconTextures, type IconName } from "../view/icons";
import { PALETTE } from "../view/palette";
import { PersonView } from "../view/person";
import { MoodHearts } from "../view/moodhearts";
import { TouchControls } from "../view/touch";
import { Viewport } from "../view/viewport";

/** Довгий кадр (вкладка у фоні) не перемотує день: найбільше 0,1 секунди за кадр. */
const MAX_FRAME_SECONDS = 0.1;
/** Коротше за це (мс) — натискання біля кота бере його на руки, довше — пестощі. */
const CAT_TAP_MS = 250;
/**
 * Засинання (§8.8): за `eyes` мс очі заплющуються, з `darkFrom` до `total` екран темніє, камера
 * наїжджає на `zoom`; потім ніч. Падіння без сил починається за `lead` ігрових хвилин до межі.
 */
const FALL_ASLEEP = { eyes: 1300, darkFrom: 1000, total: 2300, zoom: 0.5, lead: 0.01 } as const;

const REFUSAL_ICONS: Record<Refusal, IconName | null> = {
  empty: "empty",
  "hands-full": "hands",
  occupied: "hands",
  "too-early": "moon",
  nothing: null,
  wrong: "hands",
};

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

export class DayScene extends Phaser.Scene {
  private readonly overlay = new Overlay();
  private views = new Map<string, ObjectView>();
  /** Речі на плиті й поверхнях: окремий шар для кожного місця, щоб персонаж правильно їх перекривав. */
  private readonly items = new Map<string, Phaser.GameObjects.Graphics>();
  private readonly catViews = new Map<number, CatView>();
  /** Приховані числа над котами в режимі розробки (§11.5). */
  private readonly hiddenLabels = new Map<number, Phaser.GameObjects.Text>();
  /** Імена над котами в нашийниках (§9.10). */
  private readonly collarLabels = new Map<number, Phaser.GameObjects.Text>();
  private viewport!: Viewport;
  private corner!: Phaser.GameObjects.Graphics;
  private marks!: Phaser.GameObjects.Graphics;
  private gloom!: Phaser.GameObjects.Rectangle;
  /** Темрява засинання — над усім, і над інтерфейсом. */
  private dark!: Phaser.GameObjects.Rectangle;
  /** Персонаж засинає (§8.8): коли почав (мс) і чи падає без сил. */
  private asleep: { started: number; collapsed: boolean } | null = null;
  private person!: PersonView;
  private bubbles!: Bubbles;
  private hearts!: MoodHearts;
  private storage!: StorageIndicators;
  /** Малюнки наповнення сховищ і що на них намальовано. */
  private readonly storageLooks = new Map<string, { g: Phaser.GameObjects.Graphics; key: string }>();
  private interaction!: Phaser.GameObjects.Graphics;
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
    this.viewport = new Viewport(this);
    const { world, ui } = this.viewport;
    this.views = drawApartment(this, world);
    // Миски, лотки й безлад лежать на підлозі: під меблями, котами й персонажем.
    this.corner = this.add.graphics().setDepth(0).addToDisplayList(world);
    for (const id of ["stove", ...Object.keys(this.state.home.surfaces)]) {
      this.items.set(id, this.add.graphics().setDepth(this.view(id).depth + 1).addToDisplayList(world));
    }
    this.marks = this.add.graphics().setDepth(9_000).addToDisplayList(world);
    this.person = new PersonView(this, world);
    this.bubbles = new Bubbles(this, world);
    this.hearts = new MoodHearts(this, world, (cat) => this.anchorOf(`cat:${cat}`));
    this.storage = new StorageIndicators(this, world);
    this.interaction = this.add.graphics().setDepth(9_500).addToDisplayList(world);
    // Серпанок над квартирою, але під інтерфейсом.
    this.gloom = this.add.rectangle(0, 0, 1, 1, 0x5b3a7a, 0).setOrigin(0).setDepth(15_000).addToDisplayList(ui);
    this.hud = new Hud(this, ui, () => this.openPhone());
    this.dark = this.add.rectangle(0, 0, 1, 1, 0x000000, 0).setOrigin(0).setDepth(30_000).addToDisplayList(ui);
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
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup.forEach((stop) => stop()));
    this.restart();
    // Меню на старті (§4.2): лише для справжньої збереженої гри, не для сценаріїв режиму розробки.
    const state = this.state;
    if (this.session.persistent && state.end === null) {
      // Зовсім нова гра — одразу вибір персонажа (§5.1); збережена — меню.
      if (state.day === 0 && state.minute === state.dayStartMinute) this.chooseNewGame();
      else this.overlay.show(titleCard(state, () => this.restart(), () => this.chooseNewGame()));
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
    this.storage.clear();
    this.moneySeen = null;
    this.earned = 0;
    this.touch.reset();
    this.viewport.jump();
    // Коти нового стану — нові об'єкти, навіть якщо id ті самі.
    for (const view of this.catViews.values()) view.destroy();
    this.catViews.clear();
    for (const label of this.hiddenLabels.values()) label.destroy();
    this.hiddenLabels.clear();
    for (const label of this.collarLabels.values()) label.destroy();
    this.collarLabels.clear();
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
  }

  private act(): void {
    if (this.blocked()) return;
    const { held, activity } = this.state.character;
    if (held === null && activity === null && targetOf(this.state)?.type === "cat") {
      this.catPress = this.time.now;
      return;
    }
    // Умивальник для чоловічого персонажа: борода (§5.1) і ліки.
    if (this.state.character.sex === "male" && this.state.character.held === null && targetOf(this.state)?.id === "sink") {
      this.overlay.show(
        sinkCard(
          this.state,
          (choice) => {
            this.overlay.close();
            if (choice === "meds") {
              interact(this.session.save);
              return;
            }
            const minutes = groomBeard(this.state, choice);
            if (minutes !== null) advance(this.session.save, minutes);
          },
          () => this.overlay.close(),
        ),
      );
      return;
    }
    // Біля дверей нічого не чекає: поїздка (§8.5).
    if (canLeave(this.state)) {
      this.overlay.show(
        destinationCard(
          this.state,
          (destination) => {
            this.overlay.close();
            if (startTrip(this.state, destination)) this.visitLog = { exam: null, done: [] };
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
            if (choice === "bell") addBell(this.state);
            else if ("medicine" in choice) giveMedicine(this.state, choice.medicine, rng);
            else if ("treat" in choice) giveTreat(this.state, choice.treat, rng);
            else putCollar(this.state, choice.collar);
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

  private blocked(): boolean {
    return this.overlay.isOpen || this.session.paused || this.state.end !== null || this.asleep !== null;
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

  /** Що вже зробили в пункті призначення цієї поїздки. */
  private visitLog: VisitLog = { exam: null, done: [] };

  /** Поїздка (§8.5): гонку веде своя сцена, подію на місці й аварію — картки. */
  private updateTrip(): boolean {
    const trip = this.state.trip;
    if (trip === null || this.state.end !== null) return false;
    if (trip.phase === "drive") {
      if (!this.scene.isActive("race")) {
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
    const log = this.visitLog;
    if (trip.destination === "office" && !log.done.includes("office")) {
      officeMeeting(state);
      log.done.push("office");
    }
    const again = (): void => this.showVisit();
    const rng = stateRng(state, "behavior");
    this.overlay.show(
      visitCard(state, log, {
        checkout: (cart) => {
          checkout(state, cart, "store");
          again();
        },
        exam: () => {
          log.exam = vetExam(state);
          again();
        },
        treat: (disease, quality) => {
          const result = vetTreat(state, disease, quality, rng);
          if (result) log.done.push(`${disease}:${result}`);
          again();
        },
        doctor: () => {
          if (doctorExam(state)) log.done.push("doctor");
          again();
        },
        treatSelf: (illness, quality) => {
          doctorTreat(state, illness, quality, rng);
          again();
        },
        adopt: (id) => {
          const cat = adopt(state, id);
          if (cat) log.done.push(cat.name);
          again();
        },
        sterilize: () => {
          vetSterilize(state);
          again();
        },
        giveAway: () => {
          giveToShelter(state);
          again();
        },
        buyKitten: (id) => {
          const cat = buyFromBreeder(state, id);
          if (cat) log.done.push(cat.name);
          again();
        },
        groom: (quality) => {
          if (groom(state, quality)) log.done.push("groom");
          again();
        },
        cafe: (hours) => {
          if (cafe(state, hours)) log.done.push("cafe");
          again();
        },
        show: () => {
          const prize = enterShow(state, rng);
          if (prize !== null) log.done.push(`show:${prize}`);
          again();
        },
        home: () => {
          this.overlay.close();
          returnHome(this.session.save, trip.visit, TRIPS[trip.destination].road);
          this.viewport.jump();
        },
      }),
    );
  }

  /** Відпустили швидко — взяти кота на руки; тримають довше — це пестощі, їх веде симуляція (§8.2). */
  private resolveCatPress(hold: boolean): void {
    if (this.catPress === null) return;
    const elapsed = this.time.now - this.catPress;
    if (hold && elapsed < CAT_TAP_MS) return;
    this.catPress = null;
    // Пестощі, що встигли початися за мить натискання, симуляція вже зупинила: руки вільні.
    if (!hold && elapsed < CAT_TAP_MS) interact(this.session.save);
  }

  /**
   * Картка, що чекає своєї черги: подія сталася, поки відкрита титулка чи інша картка. Раніше
   * нова картка заміняла відкриту — і титулка ранку, картка знайди чи телефон зникали.
   */
  private readonly queued: Card[] = [];

  private queueCard(card: Card): void {
    if (this.overlay.isOpen) this.queued.push(card);
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
      this.moving = this.state.character.activity === null && this.state.character.body.stun <= 0 && isMoving(input.move);
      const minutes = gameMinutes(seconds) * this.session.speed;
      // Пора падати без сил (§8.8): зупинитися перед межею й засинати анімацією, а не миттєво.
      const untilCollapse = collapseMinute(this.state) - this.state.minute - FALL_ASLEEP.lead;
      if (minutes >= untilCollapse) {
        const night = advance(this.session.save, Math.max(0, untilCollapse), input);
        if (night === null && this.state.end === null) this.fallAsleep(true);
      } else {
        advance(this.session.save, minutes, input);
      }
      this.resolveCatPress(input.hold);
    } else {
      this.moving = false;
    }
    this.render(time, seconds);
  }

  /**
   * Пестощі й гра (§8.2): рука персонажа гладить кота; у грі від руки тягнеться волосінь вудки, а
   * пір'їнка кружляє над котом.
   */
  private drawInteraction(time: number): void {
    const g = this.interaction.clear();
    const activity = this.state.character.activity;
    if ((activity?.kind !== "pet" || activity.bitten) && (activity?.kind !== "play" || activity.done)) return;
    const cat = this.catViews.get(activity.cat);
    if (!cat) return;
    const hand = this.person.hands;
    if (activity.kind === "play") {
      const fx = cat.head.x + Math.cos(time / 220) * 16;
      const fy = cat.head.y - 14 + Math.sin(time / 160) * 8;
      const tip = { x: hand.x + (fx - hand.x) * 0.45, y: hand.y - 34 };
      g.lineStyle(3, 0x8b5e3c).lineBetween(hand.x, hand.y, tip.x, tip.y);
      g.lineStyle(1.2, COLORS.ink, 0.8).lineBetween(tip.x, tip.y, fx, fy);
      g.fillStyle(0xd9455f).fillEllipse(fx, fy + 4, 6, 12).fillStyle(0x5fa8d3).fillEllipse(fx - 4, fy + 6, 5, 10).fillStyle(0xe8b93a).fillEllipse(fx + 4, fy + 6, 5, 10);
      return;
    }
    // Рука ходить по спинці кота туди-сюди, не закриваючи морди.
    const skins = PALETTE.skin;
    const skin = skins[((this.state.character.look.skin % skins.length) + skins.length) % skins.length] ?? skins[0];
    const px = cat.back.x + Math.sin(time / 260) * 5;
    const py = cat.back.y;
    g.lineStyle(6, skin).lineBetween(hand.x, hand.y, px, py);
    g.fillStyle(skin).fillEllipse(px, py, 11, 8);
    g.lineStyle(1.5, COLORS.ink).strokeEllipse(px, py, 11, 8);
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
    this.hud.update(state, time);
    // Сховища з'являються в квартирі після першого отримання запасу (§6.4).
    for (const view of this.views.values()) if (view.object.requires || view.object.kind === "boxes") view.graphics.setVisible(isPresent(state, view.object));
    // У поїздці й у душовій кабіні персонажа не видно (§8.5, §8.7).
    const activity = state.character.activity;
    const inside = activity?.kind === "use" && activity.inside === true;
    this.person.draw(state.character, this.moving, time, state.trip !== null || inside, state.character.sex === "male" ? beardLook(state) : null, state.home.clothes <= 0, this.sleepiness(time));
    this.drawCats(time);
    drawCatCorner(this.corner, state);
    this.drawInteraction(time);
    this.showEarnings(time);
    this.bubbles.update();
    this.hearts.update();
    this.viewport.follow(this.person.head, seconds);
    this.drawItems();
    this.drawMarks(time);
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

  private view(id: string): ObjectView {
    const view = this.views.get(id);
    if (!view) throw new Error(`Немає вигляду для «${id}»`);
    return view;
  }

  /** Коти: вигляд для кожного кота в домі; кота на руках малюємо біля грудей персонажа. */
  private drawCats(time: number): void {
    const state = this.state;
    const held = state.character.held;
    const alive = new Set<number>();
    for (const cat of state.cats) {
      alive.add(cat.id);
      let view = this.catViews.get(cat.id);
      if (!view) {
        view = new CatView(this, this.viewport.world, cat);
        this.catViews.set(cat.id, view);
      }
      // Кіт на руках чи на колінах — біля персонажа.
      const withPerson = (held?.kind === "cat" && held.cat === cat.id) || cat.act.kind === "lap";
      const carried = withPerson ? this.person.hands : null;
      const activity = state.character.activity;
      const petting = activity?.kind === "pet" && !activity.bitten;
      const playing = activity?.kind === "play" && !activity.done;
      const interaction = (petting || playing) && activity?.cat === cat.id ? activity.kind : null;
      view.draw(state, cat, time, carried, interaction, catFeeling(state, cat));
      this.drawHidden(cat.id, view, cat.mood, cat.health, cat.love);
      this.drawCollar(cat, view);
    }
    for (const [id, view] of this.catViews) {
      if (alive.has(id)) continue;
      view.destroy();
      this.catViews.delete(id);
      this.bubbles.setState(`cat:${id}`, null, 0, 0);
      this.hiddenLabels.get(id)?.destroy();
      this.hiddenLabels.delete(id);
      this.collarLabels.get(id)?.destroy();
      this.collarLabels.delete(id);
    }
  }

  /** Режим розробки: настрій, здоров'я й любов над котом (§11.5). */
  private drawHidden(id: number, view: CatView, mood: number, health: number, love: number): void {
    let label = this.hiddenLabels.get(id);
    if (!this.session.showHidden) {
      label?.setVisible(false);
      return;
    }
    if (!label) {
      label = this.add
        .text(0, 0, "", { fontFamily: "system-ui, sans-serif", fontSize: "13px", color: "#ffffff", backgroundColor: "#1f1a24", padding: { x: 3, y: 1 }, resolution: 2 })
        .setOrigin(0.5, 1)
        .setDepth(12_000)
        .addToDisplayList(this.viewport.world);
      this.hiddenLabels.set(id, label);
    }
    label.setVisible(true).setPosition(view.head.x, view.head.y - 30).setText(`н${Math.round(mood)} з${Math.round(health)} л${Math.round(love)}`);
  }

  /** Ім'я над котом у нашийнику (§9.10). */
  private drawCollar(cat: GameState["cats"][number], view: CatView): void {
    let label = this.collarLabels.get(cat.id);
    if (!cat.collar || cat.away !== null) {
      label?.setVisible(false);
      return;
    }
    if (!label) {
      label = this.add
        .text(0, 0, cat.name, { fontFamily: "system-ui, sans-serif", fontSize: "13px", color: "#1f1a24", backgroundColor: "#f3e9dc", padding: { x: 4, y: 1 }, resolution: 2 })
        .setOrigin(0.5, 1)
        .setDepth(11_000)
        .addToDisplayList(this.viewport.world);
      this.collarLabels.set(cat.id, label);
    }
    label.setVisible(true).setPosition(view.head.x, view.head.y - 6).setText(cat.collar.bell ? `${cat.name} 🔔` : cat.name);
  }

  /** Речі на плиті й поверхнях. */
  private drawItems(): void {
    const { home } = this.state;
    for (const [id, g] of this.items) {
      g.clear();
      const item = id === "stove" ? home.stove.item : home.surfaces[id];
      if (!item) continue;
      const view = this.view(id);
      drawItem(g, item, view.top.x + view.top.w / 2, view.top.y + view.top.h / 2 + 6);
    }
  }

  /** Де на екрані ціль дії: для підсвітки й баблів. */
  private anchorOf(id: string): { x: number; y: number } | null {
    if (this.views.has(id)) {
      const view = this.view(id);
      return isPresent(this.state, view.object) ? view.anchor : null;
    }
    const [kind, raw] = id.split(":");
    const number = Number(raw);
    if (kind === "item") {
      const item = this.state.home.items.find((i) => i.id === number);
      if (!item) return null;
      const p = itemScreen(item);
      return { x: p.x, y: p.y - 14 };
    }
    if (kind === "mess") {
      const mess = this.state.home.messes.find((m) => m.id === number);
      if (!mess) return null;
      const p = toScreen(mess);
      return { x: p.x, y: p.y - 12 };
    }
    if (kind === "cat") return this.catViews.get(number)?.head ?? null;
    return null;
  }

  /** Підсвітка цілі, смуги прогресу, екран комп'ютера. */
  private drawMarks(time: number): void {
    const state = this.state;
    const g = this.marks.clear();
    const working = isWorking(state);

    const computer = this.view("computer");
    const screen = { x: computer.top.x + computer.top.w / 2 - 19, y: computer.top.y - 23, w: 38, h: 22 };
    g.fillStyle(working ? 0x79a6c2 : 0x2b2a33).fillRect(screen.x, screen.y, screen.w, screen.h);
    if (working && Math.floor(time / 300) % 2 === 0) g.fillStyle(0xffffff, 0.8).fillRect(screen.x + 5, screen.y + 6, 18, 3);

    const target = state.character.activity === null ? targetOf(state) : null;
    if (target && !this.blocked()) this.highlight(g, target, 0.55 + 0.35 * Math.sin(time / 180));

    const progress = useProgress(state);
    const activity = state.character.activity;
    if (progress !== null && activity?.kind === "use") {
      const anchor = this.anchorOf(activity.target);
      if (anchor) bar(g, anchor.x, anchor.y - 10, progress, COLORS.good);
    }
    const stove = state.home.stove;
    if (stove.item && stove.item.kind !== "burnt") {
      const view = this.view("stove");
      const cooking = stove.item.kind === "raw";
      const value = cooking ? stove.minutes / COOK_MINUTES : (stove.minutes - COOK_MINUTES) / (BURN_MINUTES[state.difficulty] - COOK_MINUTES);
      // Смуга на лицьовій грані плити: зелена — готується, червона — скоро підгорить.
      bar(g, view.anchor.x, view.top.y + view.top.h + 10, value, cooking ? COLORS.good : COLORS.danger);
    }
  }

  private highlight(g: Phaser.GameObjects.Graphics, target: Target, alpha: number): void {
    g.lineStyle(4, COLORS.highlight, alpha);
    if (target.type === "object") {
      const view = this.view(target.id);
      const box = view.outline ?? view.top;
      g.strokeRect(box.x - 2, box.y - 2, box.w + 4, box.h + 4);
      return;
    }
    if (target.type === "item") {
      const p = itemScreen(target.item);
      g.strokeEllipse(p.x, p.y, target.item.kind === "litter" ? 56 : 40, target.item.kind === "litter" ? 40 : 22);
      return;
    }
    if (target.type === "mess") {
      const p = toScreen(target.mess);
      g.strokeEllipse(p.x, p.y, 34, 18);
      return;
    }
    const view = this.catViews.get(target.cat.id);
    if (view) g.strokeEllipse(view.head.x, view.head.y + 30, 46, 46);
  }

  /** Бабли стану (§11.4): що висить, поки триває. */
  private updateStateBubbles(): void {
    const state = this.state;
    const set = (id: string, icon: IconName | null): void => {
      const anchor = this.anchorOf(id);
      if (anchor) this.bubbles.setState(id, icon, anchor.x, anchor.y);
      else this.bubbles.setState(id, null, 0, 0);
    };
    const working = isWorking(state);
    const standup = isWorkday(state) && state.minute >= STANDUP_MINUTE && state.minute < STANDUP_MINUTE + STANDUP_MINUTES;
    let computer: IconName | null = null;
    const day = state.minute % 1440;
    const meeting = state.modifiers.day === "meeting" && day >= MODIFIERS.meeting.from && day < MODIFIERS.meeting.from + MODIFIERS.meeting.minutes;
    if (!working && (standup || meeting)) computer = "camera";
    else if (powerOut(state)) computer = "empty";
    else if (!working && isWorkTime(state)) {
      const level = patienceLevel(state);
      computer = level === "out" ? "cross" : level === "warning" ? "alert" : null;
    }
    set("computer", computer);

    // Персонаж у душовій кабіні — над нею вода.
    const activity = state.character.activity;
    set("shower", activity?.kind === "use" && activity.inside ? "drop" : null);
    const item = state.home.stove.item;
    set("stove", item === null ? null : item.kind === "burnt" ? "smoke" : item.kind === "meal" ? "meal" : "pot");
    // Кіт на сходах важливіший за пакунок (§9.12).
    set("door", state.cats.some((c) => c.away === "stairs") ? "meow" : state.home.porch.length > 0 ? "box" : null);
    const table = objectById("table");
    const target = targetOf(state);
    set("table", state.character.activity === null && canUse(state, { type: "object", id: "table", object: table }) && target?.id !== "table" ? "meal" : null);
    // Побут (§8.7): пральна машина пере чи чекає, щоб випране розвісили; одяг скінчився.
    const washer = state.home.washer.state;
    set("washer", washer === "washing" ? "drop" : washer === "done" ? "alert" : null);

    // Котячий куток: без води, брудний лоток. Порожню миску показує кіт, що просить їсти.
    for (const thing of state.home.items) {
      const id = `item:${thing.id}`;
      if (thing.kind === "water") set(id, thing.water === 0 ? "thirst" : null);
      else if (thing.kind === "litter") set(id, isDirty(thing) ? "dirty" : null);
    }
    for (const cat of state.cats) {
      const hungry = cat.act.kind === "beg" && cat.act.goal === null;
      const fighting = cat.act.kind === "fight";
      // Дзвіночок видає кота, що ховається (§9.10).
      const ringing = cat.act.kind === "hide" && cat.collar?.bell === true;
      set(`cat:${cat.id}`, cat.away !== null ? null : fighting ? "fight" : hungry ? "kibble" : ringing ? "bell" : null);
    }
    // Наповнення видно з самого сховища (§6.4): перемальовуємо, лише коли воно змінилося.
    for (const storage of STORAGES) {
      const view = this.views.get(storage.object);
      if (!view) continue;
      let look = this.storageLooks.get(storage.object);
      if (!look) {
        look = { g: this.add.graphics().setDepth(view.depth + 0.5).addToDisplayList(this.viewport.world), key: "" };
        this.storageLooks.set(storage.object, look);
      }
      const present = isPresent(state, view.object);
      const stages = storageStages(state, storage);
      const key = `${present}|${stages.join(",")}`;
      if (key === look.key) continue;
      look.key = key;
      look.g.setVisible(present);
      drawStorage(look.g, view.object.kind, view.top, objectHeight(view.object.kind), stages);
    }
    // Вміст сховищ (§6.4): над баблом стану, якщо він є, але не вище задньої стіни — над високим
    // холодильником індикатор лягає на його лицьову грань.
    const highest = toScreen({ x: 0, y: 1 }).y - WALL_RISE + 40;
    for (const storage of STORAGES) {
      const anchor = this.anchorOf(storage.object);
      if (!anchor) continue;
      const lift = this.bubbles.hasState(storage.object) ? 56 : 0;
      this.storage.set(storage.object, storageIndicator(state, storage), anchor.x, Math.max(highest, anchor.y - lift));
    }
    // Ящики біля входу (§6.4): зблизька видно, що в них лежить.
    const boxes = this.anchorOf("boxes");
    this.storage.set("boxes", boxes ? boxesIndicator(state) : [], boxes?.x ?? 0, boxes?.y ?? 0);
    this.bubbles.setState("person", isDrowsy(state) ? "zz" : null, this.person.head.x, this.person.head.y);
  }

  /** Іконка летить дугою від однієї точки до іншої: запаси з ящиків — у сховища (§6.4). */
  private flyIcon(icon: IconName, from: { x: number; y: number }, to: { x: number; y: number }, delay: number, onArrive: () => void): void {
    const image = this.add.image(from.x, from.y, `icon-${icon}`).setDisplaySize(48, 48).setDepth(10_500).setVisible(false).addToDisplayList(this.viewport.world);
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
  private readonly personAnchor = (): { x: number; y: number } => ({ x: this.person.head.x, y: this.person.head.y });

  /** Бабли подій і картки. */
  private onGameEvent(event: GameEvent): void {
    const popAt = (id: string, icon: IconName, count?: number): void => {
      // Бабл летить за котом чи річчю, над якими виринув.
      this.bubbles.pop(icon, () => this.anchorOf(id), count);
    };
    const popPerson = (icon: IconName): void => this.bubbles.pop(icon, this.personAnchor);
    switch (event.type) {
      case "refused": {
        // Порожнє сховище показує, чого саме бракує: іконку запасу з нулем (§11.4).
        const storage = event.reason === "empty" ? STORAGES.find((s) => s.object === event.object) : undefined;
        const missing = storage?.products.find((p) => supplyCount(this.state, p) === 0);
        if (missing) {
          popAt(event.object, PRODUCT_ICONS[missing], 0);
          break;
        }
        const icon = REFUSAL_ICONS[event.reason];
        if (icon) popAt(event.object, icon);
        break;
      }
      case "call-remark":
        // Колеги на дзвінку помітили брудний одяг.
        popAt("computer", "laundry");
        break;
      case "unpacked": {
        // Запаси розлітаються з ящиків по своїх сховищах (§6.4), там — іконка із залишком.
        const from = this.view("boxes").anchor;
        event.moved.forEach((moved, i) => {
          const storage = STORAGES.find((s) => s.products.includes(moved.product));
          const to = storage ? this.anchorOf(storage.object) : null;
          if (!storage || !to) return;
          const icon = PRODUCT_ICONS[moved.product];
          this.flyIcon(icon, from, to, i * 140, () => popAt(storage.object, icon, supplyCount(this.state, moved.product)));
        });
        break;
      }
      case "supply-used":
        this.bubbles.pop(PRODUCT_ICONS[event.product], this.personAnchor, event.left);
        break;
      case "doorbell":
        popAt("door", "bell");
        break;
      case "received":
        popPerson("box");
        break;
      case "standup-started":
        popAt("computer", "camera");
        break;
      case "standup":
        if (!event.attended) popAt("computer", "camera-missed");
        break;
      case "glitch":
        popPerson("dizzy");
        this.cameras.main.shake(180, 0.004);
        break;
      case "meow":
        popAt(`cat:${event.cat}`, "meow");
        break;
      case "feeder":
        // Автогодівниця насипала: над мискою виринає корм (§8.7).
        for (const bowl of event.bowls) popAt(`item:${bowl}`, "kibble");
        break;
      case "cat-felt":
        // Настрій кота — сердечками, а не баблами (§9.12).
        this.hearts.add(event.cat, event.delta);
        break;
      case "picked-up":
        if (event.offended) popPerson("angry");
        break;
      case "cat-dodged":
        popAt(`cat:${event.cat}`, "laundry");
        break;
      case "bite":
        popPerson("bite");
        this.cameras.main.shake(140, 0.003);
        break;
      case "tripped":
      case "slipped":
      case "knocked-down":
        popPerson("dizzy");
        this.cameras.main.shake(160, 0.004);
        break;
      case "knocked":
      case "stole":
        popAt(`cat:${event.cat}`, "angry");
        break;
      case "keyboard":
        popAt("computer", "meow");
        break;
      case "symptom":
        popAt(`cat:${event.cat}`, event.symptom);
        break;
      case "cat-fight":
        this.cameras.main.shake(120, 0.002);
        break;
      case "escaped":
        popAt("door", "meow");
        break;
      case "night":
        if (this.state.end === null) {
          this.cameras.main.fadeIn(500, 20, 16, 24);
          this.showMorning(event.report);
        }
        break;
      case "modifier":
        this.onModifier(event.kind, event.value);
        break;
      case "career": {
        const message = CAREER_MESSAGES[event.change];
        const { name, sex } = this.state.character;
        const title = fill(POSITION_TITLES[event.position] ?? "", sex);
        const position = event.change === "demoted" ? title : title.toLowerCase();
        this.queueCard({
          kicker: "Робота",
          title: message.title,
          body: [fill(message.text, sex, { персонаж: name, посада: position })],
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
    // Зміни настрою за ніч гравець не бачив: сердечками їх не показують.
    this.hearts.clear();
    this.overlay.title(dayTitle(this.state, night), () => this.afterMorning());
  }

  private onModifier(kind: ModifierEvent, value: number): void {
    const money = Math.round(Math.abs(value));
    switch (kind) {
      case "mom-call":
        this.queueCard(
          callCard(
            () => {
              this.overlay.close();
              advance(this.session.save, MODIFIERS.call.minutes);
            },
            () => {
              ignoreCall(this.state);
              this.overlay.close();
            },
          ),
        );
        return;
      case "meeting-start":
        this.bubbles.pop("camera", () => this.anchorOf("computer"));
        return;
      case "meeting-missed":
        this.notice("Нараду пропущено", "Керівництво чекало на дзвінку, а вас не було.");
        return;
      case "home-vet": {
        const cat = this.state.cats.find((c) => c.id === value);
        const known = cat?.diseases.map((d) => diseaseTitle(d.id)) ?? [];
        this.notice("Заходила ветеринарка", `${cat?.name ?? "Кіт"}: ${known.length > 0 ? `знайшла — ${known.join(", ")}` : "хвороб не знайшла"}.`);
        return;
      }
      case "inspection":
        this.notice("Перевірка від ОСББ", money > 0 ? `Представник ОСББ поморщився й виписав штраф: ${money} ₴.` : "Представник ОСББ не знайшов, до чого причепитися.");
        return;
      case "guests":
        this.notice("Прийшли гості", value < 0 ? "Гості чемно не помітили безладу. Але ви помітили, що вони помітили." : "Гості в захваті від котів і чистоти.");
        return;
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
          decideFoundling(this.state, true, stateRng(this.state, "behavior"));
          this.overlay.close();
        },
        () => {
          decideFoundling(this.state, false, stateRng(this.state, "behavior"));
          this.overlay.close();
          advance(this.session.save, MODIFIERS.foundlingShelterMinutes);
        },
      ),
    );
  }

  /** Повідомлення посеред дня (§4.1): стає в чергу, якщо відкрита інша картка. */
  private notice(title: string, text: string, kicker = "Подія дня"): void {
    this.queueCard({ kicker, title, body: [text], actions: [{ label: "Зрозуміло", primary: true, onSelect: () => this.overlay.close() }], onDismiss: () => this.overlay.close() });
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

  /** Нова гра (§5.1): стать, зовнішність, хронотип, ім'я, потім складність. Кожен крок — з «Назад». */
  private chooseNewGame(): void {
    const names: Record<Sex, string> = { female: "Марта", male: "Тарас" };
    const pickSex = (): void => this.overlay.show(sexCard(DEFAULT_LOOK, (sex) => pickLook(sex, DEFAULT_LOOK[sex])));
    const pickLook = (sex: Sex, look: Look): void =>
      this.overlay.show(lookCard(sex, look, (chosen) => pickChronotype(sex, chosen), pickSex));
    const pickChronotype = (sex: Sex, look: Look): void =>
      this.overlay.show(chronotypeCard((chronotype) => pickName(sex, look, chronotype), () => pickLook(sex, look)));
    const pickName = (sex: Sex, look: Look, chronotype: Chronotype): void =>
      this.overlay.show(
        nameCard(
          sex,
          names[sex],
          (name) => {
            names[sex] = name;
            this.overlay.show(
              difficultyCard(
                (difficulty: Difficulty) => this.session.replace(newGame({ sex, difficulty, name, look, chronotype })),
                () => pickName(sex, look, chronotype),
              ),
            );
          },
          () => pickChronotype(sex, look),
        ),
      );
    pickSex();
  }

  private openPhone(): void {
    if (this.blocked()) return;
    // Підказку телефоном побачено (§6.4).
    seePhoneHints(this.state);
    const show = (tab: PhoneTab): void =>
      this.overlay.show(
        phoneCard(this.state, tab, {
          checkout: (cart) => {
            checkout(this.state, cart, "delivery");
            show(tab);
          },
          discard: (item: HomeItem) => {
            discard(this.state, item.id);
            show(tab);
          },
          advertise: (cat) => {
            advertise(this.state, cat);
            show(tab);
          },
          newGame: () => this.confirmNewGame(() => show(tab)),
          exportSave: () => exportSave(this.session.save),
          importSave: (file) => {
            void importSave(file).then(
              (save) => this.session.replace(save),
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

function bar(g: Phaser.GameObjects.Graphics, cx: number, y: number, value: number, color: number): void {
  const width = 46;
  const x = cx - width / 2;
  g.fillStyle(COLORS.ink).fillRoundedRect(x - 2, y - 2, width + 4, 10, 4);
  g.fillStyle(color).fillRoundedRect(x, y, Math.max(0, Math.min(1, value)) * width, 6, 3);
}
