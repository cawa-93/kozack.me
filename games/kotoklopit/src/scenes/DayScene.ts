import Phaser from "phaser";

import { canUse, IDLE, useProgress, type Input } from "../sim/actions";
import { canDash, dash, isMoving, targetOf } from "../sim/body";
import { BURN_MINUTES, COOK_MINUTES, LOW_STAT, STANDUP_MINUTE, STANDUP_MINUTES } from "../sim/config";
import { order, supplyCount } from "../sim/economy";
import { onEvent, type GameEvent, type Refusal } from "../sim/events";
import { advance, interact, newGame, replayDay, replayWeek } from "../sim/game";
import { objectById } from "../sim/home";
import { isDrowsy, wakeMinute } from "../sim/sleep";
import { gameMinutes } from "../sim/time";
import type { Difficulty, GameState, Product, Quality, Sex } from "../sim/types";
import { isWorking, isWorkday, isWorkTime, patienceLevel } from "../sim/work";
import type { Session } from "../session";
import { difficultyCard, endCard, morningCard, newGameCard, phoneCard } from "../ui/cards";
import { Overlay } from "../ui/overlay";
import { drawApartment, drawItem, type ObjectView } from "../view/apartment";
import { Bubbles } from "../view/bubbles";
import { COLORS, SCREEN_HEIGHT, SCREEN_WIDTH } from "../view/geometry";
import { Hud } from "../view/hud";
import { createIconTextures, type IconName } from "../view/icons";
import { PersonView } from "../view/person";
import { TouchControls } from "../view/touch";

/** Довгий кадр (вкладка у фоні) не перемотує день: найбільше 0,1 секунди за кадр. */
const MAX_FRAME_SECONDS = 0.1;

const REFUSAL_ICONS: Record<Refusal, IconName | null> = {
  empty: "empty",
  "hands-full": "hands",
  occupied: "hands",
  "too-early": "moon",
  nothing: null,
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

// Рівень — один день (§4): квартира, персонаж, бабли й інтерфейс. Сцена лише показує стан
// і передає дії гравця в симуляцію; правил гри тут немає.
export class DayScene extends Phaser.Scene {
  private readonly overlay = new Overlay();
  private views = new Map<string, ObjectView>();
  /** Речі на плиті й поверхнях: окремий шар для кожного місця, щоб персонаж правильно їх перекривав. */
  private readonly items = new Map<string, Phaser.GameObjects.Graphics>();
  private marks!: Phaser.GameObjects.Graphics;
  private gloom!: Phaser.GameObjects.Rectangle;
  private person!: PersonView;
  private bubbles!: Bubbles;
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
    this.views = drawApartment(this);
    for (const id of ["stove", ...Object.keys(this.state.home.surfaces)]) {
      this.items.set(id, this.add.graphics().setDepth(this.view(id).depth + 1));
    }
    this.marks = this.add.graphics().setDepth(9_000);
    this.gloom = this.add
      .rectangle(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, 0x5b3a7a, 0)
      .setOrigin(0)
      .setDepth(15_000);
    this.person = new PersonView(this);
    this.bubbles = new Bubbles(this);
    this.hud = new Hud(this, () => this.openPhone());
    this.touch = new TouchControls(
      this,
      () => this.act(),
      () => this.dash(),
    );
    this.setupKeyboard();

    this.cleanup.push(onEvent((event) => this.onGameEvent(event)));
    this.cleanup.push(this.session.onReset(() => this.restart()));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup.forEach((stop) => stop()));
    this.restart();
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
    this.touch.reset();
    const state = this.state;
    if (state.end !== null) {
      this.showEnd();
      return;
    }
    // Титулка, якщо день щойно почався.
    if (state.minute === wakeMinute(state)) {
      const night = state.lastNight?.day === state.day - 1 ? state.lastNight : null;
      this.showMorning(night);
    }
  }

  private act(): void {
    if (this.blocked()) return;
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

  override update(time: number, delta: number): void {
    if (!this.blocked()) {
      const input = this.readInput();
      this.moving = this.state.character.activity === null && isMoving(input.move);
      const seconds = Math.min(delta / 1000, MAX_FRAME_SECONDS);
      advance(this.session.save, gameMinutes(seconds) * this.session.speed, input);
    } else {
      this.moving = false;
    }
    this.render(time);
  }

  private render(time: number): void {
    const state = this.state;
    this.hud.update(state, time);
    this.person.draw(state.character, this.moving, time);
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
    if (target && !this.blocked()) {
      const view = this.view(target.id);
      const alpha = 0.55 + 0.35 * Math.sin(time / 180);
      g.lineStyle(4, COLORS.highlight, alpha).strokeRect(view.top.x - 2, view.top.y - 2, view.top.w + 4, view.top.h + 4);
    }

    const progress = useProgress(state);
    const activity = state.character.activity;
    if (progress !== null && activity?.kind === "use") {
      const view = this.view(activity.target);
      bar(g, view.anchor.x, view.top.y - 14, progress, COLORS.good);
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

  /** Бабли стану (§11.4): що висить, поки триває. */
  private updateStateBubbles(): void {
    const state = this.state;
    const set = (id: string, icon: IconName | null): void => {
      const view = this.view(id);
      this.bubbles.setState(id, icon, view.anchor.x, view.anchor.y);
    };
    const working = isWorking(state);
    const standup = isWorkday(state) && state.minute >= STANDUP_MINUTE && state.minute < STANDUP_MINUTE + STANDUP_MINUTES;
    let computer: IconName | null = null;
    if (!working && standup) computer = "camera";
    else if (!working && isWorkTime(state)) {
      const level = patienceLevel(state);
      computer = level === "out" ? "cross" : level === "warning" ? "alert" : null;
    }
    set("computer", computer);

    const item = state.home.stove.item;
    set("stove", item === null ? null : item.kind === "burnt" ? "smoke" : item.kind === "meal" ? "meal" : "pot");
    set("fridge", supplyCount(state, "food") === 0 ? "empty" : null);
    set("shower", supplyCount(state, "hygiene") === 0 ? "empty" : null);
    set("door", state.home.porch.length > 0 ? "box" : null);
    const table = objectById("table");
    set("table", state.character.activity === null && canUse(state, table) && targetOf(state)?.id !== "table" ? "meal" : null);
    this.bubbles.setState("person", isDrowsy(state) ? "zz" : null, this.person.head.x, this.person.head.y);
  }

  /** Бабли подій і картки. */
  private onGameEvent(event: GameEvent): void {
    const popAt = (id: string, icon: IconName, count?: number): void => {
      const view = this.view(id);
      this.bubbles.pop(icon, view.anchor.x, view.anchor.y - 8, count);
    };
    const popPerson = (icon: IconName): void => this.bubbles.pop(icon, this.person.head.x, this.person.head.y - 8);
    switch (event.type) {
      case "refused": {
        const icon = REFUSAL_ICONS[event.reason];
        if (icon) popAt(event.object, icon);
        break;
      }
      case "ate":
        popAt("fridge", event.food > 0 ? "food" : "empty", event.food);
        break;
      case "showered":
        popAt("shower", "drop", event.left);
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
      case "night":
        if (this.state.end === null) {
          this.cameras.main.fadeIn(500, 20, 16, 24);
          this.showMorning(event.report);
        }
        break;
      case "game-over":
        this.time.delayedCall(250, () => this.showEnd());
        break;
      default:
        break;
    }
  }

  private showMorning(night: GameState["lastNight"]): void {
    this.overlay.show(morningCard(this.state, night, () => this.overlay.close()));
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

  private chooseNewGame(): void {
    this.overlay.show(
      newGameCard((sex: Sex) =>
        this.overlay.show(
          difficultyCard((difficulty: Difficulty) => this.session.replace(newGame({ sex, difficulty }))),
        ),
      ),
    );
  }

  private openPhone(): void {
    if (this.blocked()) return;
    const show = (): void =>
      this.overlay.show(
        phoneCard(
          this.state,
          (product: Product, quality: Quality) => {
            order(this.state, product, quality);
            show();
          },
          () => this.overlay.close(),
        ),
      );
    show();
  }
}

function bar(g: Phaser.GameObjects.Graphics, cx: number, y: number, value: number, color: number): void {
  const width = 46;
  const x = cx - width / 2;
  g.fillStyle(COLORS.ink).fillRoundedRect(x - 2, y - 2, width + 4, 10, 4);
  g.fillStyle(color).fillRoundedRect(x, y, Math.max(0, Math.min(1, value)) * width, 6, 3);
}
