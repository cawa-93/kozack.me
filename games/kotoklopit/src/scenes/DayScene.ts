import Phaser from "phaser";

import { useProgress, IDLE, type Input } from "../sim/actions";
import { canDash, dash, isMoving } from "../sim/body";
import { isDirty } from "../sim/catai";
import { BURN_MINUTES, COOK_MINUTES, LOW_STAT, MODIFIERS, STANDUP_MINUTE, STANDUP_MINUTES } from "../sim/config";
import { discard, order, orderThing } from "../sim/economy";
import { onEvent, type GameEvent, type ModifierEvent, type Refusal } from "../sim/events";
import { advance, DEFAULT_LOOK, interact, newGame, replayDay, replayWeek, returnHome, rewindAccident } from "../sim/game";
import { TRIPS } from "../sim/config";
import { doctorExam, doctorTreat } from "../sim/illness";
import { adopt, buyAtShop, buyFromBreeder, cafe, enterShow, giveToShelter, groom, officeMeeting, vetExam, vetSterilize, vetTreat } from "../sim/destinations";
import { canLeave, startTrip } from "../sim/trips";
import { advertise } from "../sim/farewell";
import { exportSave, importSave } from "../ui/files";
import { accidentCard, destinationCard, visitCard, type VisitLog } from "../ui/trips";
import { isPresent, objectById } from "../sim/home";
import { isDrowsy } from "../sim/sleep";
import { targetOf, type Target } from "../sim/targets";
import { gameMinutes } from "../sim/time";
import type { Chronotype, Difficulty, GameState, HomeItem, Look, Product, Quality, Sex, ThingKind } from "../sim/types";
import { isWorking, isWorkday, isWorkTime, patienceLevel } from "../sim/work";
import type { Session } from "../session";
import { callCard, careCard, chronotypeCard, difficultyCard, titleCard, endCard, foundlingCard, hasCareSupplies, lookCard, morningCard, nameCard, phoneCard, sexCard, sinkCard, type PhoneTab } from "../ui/cards";
import { decideFoundling, ignoreCall, powerOut } from "../sim/modifiers";
import { beardLook, groomBeard } from "../sim/grooming";
import { addBell, giveTreat, putCollar } from "../sim/care";
import { giveMedicine, medicineCat } from "../sim/diseases";
import { stateRng } from "../sim/rng";
import { Overlay } from "../ui/overlay";
import { CAREER_MESSAGES, diseaseTitle, fill, POSITION_TITLES } from "../texts";
import { canUse } from "../sim/actions";
import { drawApartment, drawItem, type ObjectView } from "../view/apartment";
import { Bubbles } from "../view/bubbles";
import { PRODUCT_ICONS, StorageIndicators } from "../view/storage";
import { STORAGES, storageIndicator } from "../sim/storage";
import { CatView } from "../view/cat";
import { drawCatCorner, itemScreen } from "../view/catcorner";
import { COLORS, toScreen, WALL_RISE } from "../view/geometry";
import { Hud } from "../view/hud";
import { createIconTextures, type IconName } from "../view/icons";
import { PersonView } from "../view/person";
import { TouchControls } from "../view/touch";
import { Viewport } from "../view/viewport";

/** Довгий кадр (вкладка у фоні) не перемотує день: найбільше 0,1 секунди за кадр. */
const MAX_FRAME_SECONDS = 0.1;

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
  private person!: PersonView;
  private bubbles!: Bubbles;
  private storage!: StorageIndicators;
  private hud!: Hud;
  private touch!: TouchControls;
  private keys!: Keys;
  private moving = false;
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
    this.storage = new StorageIndicators(this, world);
    // Серпанок над квартирою, але під інтерфейсом.
    this.gloom = this.add.rectangle(0, 0, 1, 1, 0x5b3a7a, 0).setOrigin(0).setDepth(15_000).addToDisplayList(ui);
    this.hud = new Hud(this, ui, () => this.openPhone());
    this.touch = new TouchControls(
      this,
      ui,
      () => this.act(),
      () => this.dash(),
    );
    this.viewport.onLayout((frame) => {
      this.gloom.setSize(frame.width, frame.height);
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
    this.bubbles.clear();
    this.storage.clear();
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
    if (cat && targetOf(this.state)?.id === "cat-kit" && hasCareSupplies(this.state)) {
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
    interact(this.session.save);
  }

  private dash(): void {
    if (this.blocked()) return;
    dash(this.state);
  }

  private blocked(): boolean {
    return this.overlay.isOpen || this.session.paused || this.state.end !== null;
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
        buy: (goods, quality) => {
          buyAtShop(state, goods, quality);
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

  override update(time: number, delta: number): void {
    if (this.updateTrip()) {
      this.render(time, 0);
      return;
    }
    const seconds = Math.min(delta / 1000, MAX_FRAME_SECONDS);
    if (!this.blocked()) {
      const input = this.readInput();
      this.moving = this.state.character.activity === null && this.state.character.body.stun <= 0 && isMoving(input.move);
      advance(this.session.save, gameMinutes(seconds) * this.session.speed, input);
    } else {
      this.moving = false;
    }
    this.render(time, seconds);
  }

  private render(time: number, seconds: number): void {
    const state = this.state;
    this.hud.update(state, time);
    // Сховища з'являються в квартирі після першого отримання запасу (§6.4).
    for (const view of this.views.values()) if (view.object.requires) view.graphics.setVisible(isPresent(state, view.object));
    this.person.draw(state.character, this.moving, time, state.trip !== null, state.character.sex === "male" ? beardLook(state) : null);
    this.drawCats(time);
    drawCatCorner(this.corner, state);
    this.viewport.follow(this.person.head, seconds);
    this.drawItems();
    this.drawMarks(time);
    this.updateStateBubbles();
    this.touch.draw(canDash(state));
    // Низький здоровий глузд — світ трохи пливе (§6.3).
    const sanity = state.character.stats.sanity;
    this.gloom.setFillStyle(0x5b3a7a, sanity < LOW_STAT ? ((LOW_STAT - sanity) / LOW_STAT) * 0.22 : 0);
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
      view.draw(state, cat, time, carried);
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
      const value = cooking ? stove.minutes / COOK_MINUTES : (stove.minutes - COOK_MINUTES) / (BURN_MINUTES - COOK_MINUTES);
      // Смуга на лицьовій грані плити: зелена — готується, червона — скоро підгорить.
      bar(g, view.anchor.x, view.top.y + view.top.h + 10, value, cooking ? COLORS.good : COLORS.danger);
    }
  }

  private highlight(g: Phaser.GameObjects.Graphics, target: Target, alpha: number): void {
    g.lineStyle(4, COLORS.highlight, alpha);
    if (target.type === "object") {
      const { top } = this.view(target.id);
      g.strokeRect(top.x - 2, top.y - 2, top.w + 4, top.h + 4);
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

    const item = state.home.stove.item;
    set("stove", item === null ? null : item.kind === "burnt" ? "smoke" : item.kind === "meal" ? "meal" : "pot");
    // Кіт на сходах важливіший за пакунок (§9.12).
    set("door", state.cats.some((c) => c.away === "stairs") ? "meow" : state.home.porch.length > 0 ? "box" : null);
    const table = objectById("table");
    const target = targetOf(state);
    set("table", state.character.activity === null && canUse(state, { type: "object", id: "table", object: table }) && target?.id !== "table" ? "meal" : null);
    // Побут (§8.7): пральна машина пере чи чекає, щоб випране розвісили; одяг скінчився.
    const washer = state.home.washer.state;
    set("washer", washer === "washing" ? "drop" : washer === "done" ? "alert" : state.home.clothes <= 0 ? "dirty" : null);

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
    // Вміст сховищ (§6.4): над баблом стану, якщо він є, але не вище задньої стіни — над високим
    // холодильником індикатор лягає на його лицьову грань.
    const highest = toScreen({ x: 0, y: 1 }).y - WALL_RISE + 40;
    for (const storage of STORAGES) {
      const anchor = this.anchorOf(storage.object);
      if (!anchor) continue;
      const lift = this.bubbles.hasState(storage.object) ? 56 : 0;
      this.storage.set(storage.object, storageIndicator(state, storage), anchor.x, Math.max(highest, anchor.y - lift));
    }
    this.bubbles.setState("person", isDrowsy(state) ? "zz" : null, this.person.head.x, this.person.head.y);
  }

  /** Бабли подій і картки. */
  private onGameEvent(event: GameEvent): void {
    const popAt = (id: string, icon: IconName, count?: number): void => {
      const anchor = this.anchorOf(id);
      if (anchor) this.bubbles.pop(icon, anchor.x, anchor.y - 8, count);
    };
    const popPerson = (icon: IconName): void => this.bubbles.pop(icon, this.person.head.x, this.person.head.y - 8);
    switch (event.type) {
      case "refused": {
        const icon = REFUSAL_ICONS[event.reason];
        if (icon) popAt(event.object, icon);
        break;
      }
      case "supply-used":
        this.bubbles.pop(PRODUCT_ICONS[event.product], this.person.head.x, this.person.head.y - 8, event.left);
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
      case "purr":
        popAt(`cat:${event.cat}`, event.enjoyed ? "heart" : "angry");
        break;
      case "picked-up":
        if (event.offended) popPerson("angry");
        break;
      case "cat-refused-food":
        popAt(`cat:${event.cat}`, "angry");
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
      case "groomed":
        popAt(`cat:${event.friend}`, "heart");
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
        this.time.delayedCall(300, () =>
          this.overlay.show({
            kicker: "Робота",
            title: message.title,
            body: [fill(message.text, sex, { персонаж: name, посада: position })],
            actions: [{ label: "Зрозуміло", primary: true, onSelect: () => this.overlay.close() }],
            onDismiss: () => this.overlay.close(),
          }),
        );
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
    this.overlay.show(morningCard(this.state, night, () => this.afterMorning()));
  }

  private onModifier(kind: ModifierEvent, value: number): void {
    const money = Math.round(Math.abs(value));
    switch (kind) {
      case "mom-call":
        this.time.delayedCall(200, () =>
          this.overlay.show(
            callCard(
              () => {
                this.overlay.close();
                advance(this.session.save, 30);
              },
              () => {
                ignoreCall(this.state);
                this.overlay.close();
              },
            ),
          ),
        );
        return;
      case "meeting-start":
        this.bubbles.pop("camera", this.anchorOf("computer")?.x ?? 0, (this.anchorOf("computer")?.y ?? 0) - 8);
        return;
      case "meeting-missed":
        this.notice("Нараду пропущено", "Керівництво чекало на дзвінку, а вас не було. Репутація помітно впала.");
        return;
      case "home-vet": {
        const cat = this.state.cats.find((c) => c.id === value);
        const known = cat?.diseases.map((d) => diseaseTitle(d.id)) ?? [];
        this.notice("Ветеринарка оглянула кота", `${cat?.name ?? "Кіт"}: ${known.length > 0 ? `знайшла — ${known.join(", ")}` : "хвороб не знайшла"}.`);
        return;
      }
      case "inspection":
        this.notice("Перевірка від ОСББ", money > 0 ? `Представник ОСББ поморщився й виписав штраф: ${money}.` : "Представник ОСББ не знайшов, до чого причепитися.");
        return;
      case "guests":
        this.notice("Прийшли гості", value < 0 ? "Гості чемно не помітили безладу. Але ви помітили, що вони помітили." : "Гості в захваті від котів і чистоти.");
        return;
      case "office-missed":
        this.notice("Збори без вас", "На зборах в офісі вас так і не дочекалися. Репутація постраждала.");
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
          advance(this.session.save, 120);
        },
      ),
    );
  }

  /** Повідомлення модифікатора посеред дня (§4.1). */
  private notice(title: string, text: string): void {
    if (this.overlay.isOpen) return;
    this.overlay.show({ kicker: "Подія дня", title, body: [text], actions: [{ label: "Зрозуміло", primary: true, onSelect: () => this.overlay.close() }], onDismiss: () => this.overlay.close() });
  }

  private showEnd(): void {
    const end = this.state.end;
    if (end === null) return;
    const save = this.session.save;
    this.overlay.show(
      endCard(this.state, end, {
        replayDay: () => {
          replayDay(save);
          this.session.replace(save);
        },
        replayWeek: () => {
          replayWeek(save);
          this.session.replace(save);
        },
        newGame: () => this.chooseNewGame(),
      }),
    );
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
            this.overlay.show(difficultyCard((difficulty: Difficulty) => this.session.replace(newGame({ sex, difficulty, name, look, chronotype }))));
          },
          () => pickChronotype(sex, look),
        ),
      );
    pickSex();
  }

  private openPhone(): void {
    if (this.blocked()) return;
    const show = (tab: PhoneTab): void =>
      this.overlay.show(
        phoneCard(this.state, tab, {
          order: (product: Product, quality: Quality) => {
            order(this.state, product, quality);
            show(tab);
          },
          orderThing: (thing: ThingKind, quality: Quality) => {
            orderThing(this.state, thing, quality);
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
              () => this.notice("Не вдалося завантажити", "Цей файл не схожий на збереження Котоклопіту або збережений старою версією гри."),
            );
          },
          tab: show,
          close: () => this.overlay.close(),
        }),
      );
    show("supplies");
  }
}

function bar(g: Phaser.GameObjects.Graphics, cx: number, y: number, value: number, color: number): void {
  const width = 46;
  const x = cx - width / 2;
  g.fillStyle(COLORS.ink).fillRoundedRect(x - 2, y - 2, width + 4, 10, 4);
  g.fillStyle(color).fillRoundedRect(x, y, Math.max(0, Math.min(1, value)) * width, 6, 3);
}
