// Бабли (§11.4): стан висить над річчю, поки триває, подія виринає й зникає.
// Над однією річчю — лише один бабл стану, найважливіший.
// Кожен бабл — вголос (мовна хмаринка) чи думка (хмаринка з кружечками), правка автора 2026-10-25;
// який саме — вирішує `eventBubbles` (symbols.ts) і сцена для станів.
// Фон, іконка й позначка — кадри атласу (`ui/bubble/*`, `icon/*`, крок 16), а де що лежить — `iso/bubblelook.ts`.
// Бабли, що налазять один на одного (свої й чужі, подій і стану), щокадру стають у ряд поруч — `layoutBubbles` там само.

import Phaser from "phaser";

import { addArt } from "./art/atlas";
import { bubbleArt, iconArt, markArt, type BubbleKind, type IconName, type Mark } from "./iconnames";
import {
  BUBBLE_COUNT,
  bubbleRepeat,
  bubbleSpan,
  countPillCenter,
  countPillWidth,
  countSide,
  isoBubbleLook,
  layoutBubbles,
  type BubbleBounds,
  type BubbleSays,
  type BubbleSpan,
  type IsoBubbleLook,
  type LaidBubble,
} from "./iso/bubblelook";
import { isoPopColor, UI_FILL, UI_FONT, UI_TEXT } from "./iso/uilook";
import type { EventBubble, Thinker } from "./symbols";
import { WORLD_LAYERS } from "./world/layers";
import { textResolution } from "./zoom";

const BUBBLE_DEPTH = WORLD_LAYERS.bubbles;
/** Скільки висить бабл події, перш ніж згаснути, мс. */
const EVENT_HOLD_MS = 1100;
/** Думка про стан (§11.4) виринає сама, без дії гравця, тож висить довше — щоб уважний встиг помітити. */
export const THOUGHT_HOLD_MS = 1900;
/** Напис над кимось («+N ₴») не має власника, тож поруч із ним ніхто не стає: місця він не займає. */
const NO_SPAN: BubbleSpan = { left: 0, right: 0 };
/** На скільки вище за точку виринає бабл події (як у старому вигляді). */
const EVENT_LIFT = 8;
/**
 * Як швидко бабл доїжджає до нового місця в ряду, коли поруч виринув чи підійшов інший (`layoutBubbles`), мс: стала
 * експоненти — за ≈ 0,25 с він на місці. Не стрибком: бабл, що смикнувся вбік, читається як новий.
 */
const SLIDE_MS = 80;
/** Відступ ряду баблів від краю видимої частини світу, одиниці світу (`layoutBubbles`, `bounds`). */
const EDGE = 4;
/** Виринання бабла: з якого масштабу, як довго, мс (бабл події; бабл стану — з 0,6 за 160 мс). */
const POP = { from: 0.5, ms: 180 } as const;
/**
 * Повтор того самого бабла (`bubbleRepeat`, «again»): бабл, що висить, наново «вискакує» з цього масштабу — помітно, що
 * натискання дійшло, а другого бабла поверх немає.
 */
const POP_AGAIN = 0.6;

/**
 * Бабл, що стає в ряд з іншими (`LaidBubble`): `x`, `y` — його точка, `target` — куди стати, `dx` — зсув, з яким він
 * зараз стоїть (їде до `target`, `SLIDE_MS`).
 */
interface Placed extends LaidBubble {
  container: Phaser.GameObjects.Container;
  dx: number;
  /** Чи вже стояв: щойно виринулий бабл стає на місце одразу, а не їде з точки. */
  placed: boolean;
}

/** Бабл стану. */
interface StateBubble extends Placed {
  /** Напис на плашці: скільки котів під замком (§8.7). */
  count: string | undefined;
  /** Ключ, як у `setState`. */
  owner: string;
  kind: BubbleKind;
  name: IconName;
}

/** Де виринає бабл: точка чи той, за ким він летить. */
export type Anchor = { x: number; y: number } | (() => { x: number; y: number } | null);

/**
 * Бабл події чи напис: `owner` — над ким бабл (ключ, як у `setState`; поки він видно, бабл стану там схований; у напису
 * власника немає, і поруч з іншими він не стає).
 */
interface Floater extends Placed {
  at: Anchor;
  rise: number;
  /** Що каже бабл події (повтор — `bubbleRepeat`); у напису — нічого. */
  says: BubbleSays | undefined;
  /** Скільки висить, перш ніж згаснути, мс (повтор починає відлік знову). */
  hold: number;
}

/** Бабл, щойно складений: контейнер і скільки він займає ліворуч і праворуч від точки. */
interface Made {
  container: Phaser.GameObjects.Container;
  span: BubbleSpan;
}

const place = (at: Anchor): { x: number; y: number } | null => (typeof at === "function" ? at() : at);

export class Bubbles {
  private readonly states = new Map<string, StateBubble>();
  /** Бабли стану, підтверджені цього кадру (`setState` з іконкою); решту прибирає `sweepStates`. */
  private readonly confirmed = new Set<string>();
  private readonly floaters = new Set<Floater>();
  /** Як лежить бабл кожного виду (з маніфесту). */
  private readonly looks: Readonly<Record<BubbleKind, IsoBubbleLook>> = { say: isoBubbleLook("say"), think: isoBubbleLook("think") };
  /**
   * Бабли для розстановки цього кадру (`arrange`, перші `count`): масив той самий, щоб не виділяти пам'ять щокадру. За
   * `count` до наступного такого ж кадру можуть лишатися посилання на бабли, що вже згасли.
   */
  private readonly laid: Placed[] = [];
  /** Видима частина світу (`arrange`): той самий об'єкт щокадру. */
  private readonly bounds: BubbleBounds = { left: 0, right: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
  ) {}

  /**
   * Скільки місця над точкою бабла виду `kind` займає він сам разом із виринанням, px світу: вище за верхній край видимої
   * квартири мінус це бабл не ставлять, щоб його не сховала панель (`DayScene.belowHud`).
   */
  room(kind: BubbleKind): number {
    return this.looks[kind].room;
  }

  /**
   * Бабл: фон `ui/bubble/<вид>` вістрям у точці, іконка й позначка — кадри атласу в точці `icon` фону, кількість — плашка
   * у верхньому куті іконки (правому; з позначкою — лівому, `countSide`). Усе — у вкладеному контейнері зі сталим масштабом
   * (`ISO_BUBBLE_SCALE`), бо масштаб зовнішнього анімують виринання й `setState`.
   */
  private make(kind: BubbleKind, icon: IconName, x: number, y: number, count?: number | string, mark?: Mark): Made {
    const look = this.looks[kind];
    const scene = this.scene;
    const body = scene.add.container(0, 0).setScale(look.scale);
    addArt(scene, body, bubbleArt(kind));
    const place = (image: Phaser.GameObjects.Image): void => {
      image.setPosition(look.icon.x, look.icon.y).setDisplaySize(look.iconSize, look.iconSize);
    };
    place(addArt(scene, body, iconArt(icon)));
    if (mark !== undefined) place(addArt(scene, body, markArt(mark)));
    let pillWidth: number | undefined;
    if (count !== undefined) {
      // Кількість — чорнильна плашка з паперовою обвідкою й паперовими цифрами: видно і на світлій підлозі, і на темній стіні.
      const c = BUBBLE_COUNT;
      const label = scene.add
        .text(0, 0, String(count), { fontFamily: UI_FONT, fontSize: `${c.font}px`, fontStyle: "bold", color: UI_TEXT.main, resolution: this.resolution(look.scale) })
        .setOrigin(0.5);
      const h = c.height;
      const w = countPillWidth(label.width);
      pillWidth = w;
      const { x: cx, y: cy } = countPillCenter(look, w, countSide(mark));
      label.setPosition(cx, cy);
      const pill = scene.add.graphics();
      pill.fillStyle(UI_FILL.ink).fillRoundedRect(cx - w / 2, cy - h / 2, w, h, h / 2);
      pill.lineStyle(c.outline, UI_FILL.paper).strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, h / 2);
      body.add([pill, label]);
    }
    const container = scene.add.container(x, y, [body]).setDepth(BUBBLE_DEPTH).addToDisplayList(this.layer);
    return { container, span: bubbleSpan(look, pillWidth, countSide(mark)) };
  }

  /**
   * Бабл стану над річчю, котом чи персонажем; null прибирає його. Викликати щокадру для кожного.
   * Над річчю — завжди вголос: речі не думають (§11.4), тож думка — лише над `Thinker`.
   */
  setState(anchor: Thinker, kind: "think", icon: IconName | null, x: number, y: number): void;
  setState(anchor: string, kind: "say", icon: IconName | null, x: number, y: number, count?: string): void;
  setState(anchor: string, kind: BubbleKind, icon: IconName | null, x: number, y: number, count?: string): void {
    const current = this.states.get(anchor);
    if (icon === null) {
      current?.container.destroy();
      this.states.delete(anchor);
      return;
    }
    this.confirmed.add(anchor);
    if (current && current.name === icon && current.kind === kind && current.count === count) {
      current.visible = !this.busy(anchor);
      current.x = x;
      current.y = y;
      current.container.setPosition(x + current.dx, y).setVisible(current.visible);
      return;
    }
    current?.container.destroy();
    const visible = !this.busy(anchor);
    const container = this.make(kind, icon, x, y, count).container.setVisible(visible);
    container.setScale(0.6);
    this.scene.tweens.add({ targets: container, scale: 1, duration: 160, ease: "Back.easeOut" });
    const look = this.looks[kind];
    this.states.set(anchor, { container, kind, name: icon, count, owner: anchor, icon, x, y, span: look.span, height: look.height, visible, target: 0, dx: 0, placed: false });
    // Стає в ряд одразу, ще до кадру.
    this.arrange(0);
  }

  /**
   * Прибрати бабли стану, яких цього кадру ніхто не підтвердив (§11.4): їхнього власника вже немає — лоток викинули чи взяли
   * в руки, кота віддали. Викликати раз за кадр, після всіх `setState`: так бабл не переживає власника, хоч би хто це був, і
   * кожному новому виду речей не треба свого прибирання.
   */
  sweepStates(): void {
    for (const [anchor, bubble] of this.states) {
      if (this.confirmed.has(anchor)) continue;
      bubble.container.destroy();
      this.states.delete(anchor);
    }
    this.confirmed.clear();
  }

  hasState(anchor: string): boolean {
    return this.states.has(anchor);
  }

  /** Чи висить зараз над ним (ключ, як у `setState`) бабл події. */
  busy(owner: string): boolean {
    for (const f of this.floaters) if (f.owner === owner) return true;
    return false;
  }

  /**
   * Бабл події (§11.4) — вголос чи думка над `bubble.at`: виринає й за мить зникає. Якщо місце — функція,
   * бабл летить за тим, над ким виринув (персонаж чи кіт іде далі, а бабл — з ним). Поки він видно, бабл
   * стану там само схований, щоб дві хмаринки не злипалися в одну. Той самий бабл, що ще висить (відмова, натиснута
   * кілька разів поспіль), не виринає вдруге поверх себе, а наново «вискакує» сам; та сама іконка з іншою кількістю — на
   * місці старої (`bubbleRepeat`).
   */
  show(bubble: EventBubble, at: Anchor, hold = EVENT_HOLD_MS): void {
    const says: BubbleSays = { owner: bubble.at, kind: bubble.kind, icon: bubble.icon, mark: bubble.mark, count: bubble.count };
    for (const shown of this.floaters) {
      const repeat = shown.says ? bubbleRepeat(shown.says, says) : null;
      if (repeat === "again") {
        this.again(shown, hold);
        return;
      }
      if (repeat === "update") {
        this.drop(shown);
        break;
      }
    }
    const start = place(at);
    if (!start) return;
    const { container, span } = this.make(bubble.kind, bubble.icon, start.x, start.y - EVENT_LIFT, bubble.count, bubble.mark);
    container.setScale(POP.from).setDepth(BUBBLE_DEPTH + 1);
    this.scene.tweens.add({ targets: container, scale: 1, duration: POP.ms, ease: "Back.easeOut" });
    this.float(container, at, hold, { owner: bubble.at, span, icon: bubble.icon, height: this.looks[bubble.kind].height, says });
    const state = this.states.get(bubble.at);
    if (state) {
      state.visible = false;
      state.container.setVisible(false);
    }
    // Стає поруч з іншими одразу, ще до кадру.
    this.arrange(0);
  }

  /** Короткий напис над кимось (§11.4): «+12 ₴» тощо. Так само виринає й летить за ним. */
  popText(text: string, at: Anchor, color: string): void {
    const start = place(at);
    if (!start) return;
    // Одиниця світу ізометрії дрібна (≈ 0,72 px CSS на телефоні), тож напис — 22 px; колір — токеном палітри арту
    // (`isoPopColor`).
    const style = { fontFamily: UI_FONT, fontSize: "22px", fontStyle: "bold", color: isoPopColor(color), stroke: UI_TEXT.stroke, strokeThickness: 4, resolution: this.resolution(1) };
    const label = this.scene.add
      .text(0, 0, text, style)
      .setOrigin(0.5, 1)
      .setAlpha(0.75);
    const container = this.scene.add.container(start.x, start.y - 4, [label]).setDepth(BUBBLE_DEPTH + 2).addToDisplayList(this.layer);
    this.float(container, at, 700);
  }

  /**
   * Роздільність напису в баблі, збільшеного контейнером у `scale` разів: пікселі полотна на піксель шрифту — зум камери
   * квартири (`Viewport`, разом із наїздом) на масштаб (`textResolution`). Береться, коли бабл складається: бабли живуть
   * секунду-дві.
   */
  private resolution(scale: number): number {
    return textResolution(this.scene.cameras.main.zoom * scale);
  }

  /** Підйом і згасання; позиція щокадру — від місця, якщо воно рухоме (див. `update`). */
  private float(
    container: Phaser.GameObjects.Container,
    at: Anchor,
    hold: number,
    beside: Pick<Floater, "owner" | "span" | "icon" | "height" | "says"> = { owner: undefined, span: NO_SPAN, icon: undefined, height: 0, says: undefined },
  ): void {
    const floater: Floater = { container, at, rise: 0, x: container.x, y: container.y, visible: true, target: 0, dx: 0, placed: false, hold, ...beside };
    this.floaters.add(floater);
    this.fade(floater);
  }

  /** Через `hold` мс бабл підіймається на `EVENT_RISE` (34, `iso/markslayout.ts`) і згасає за 0,5 с, потім зникає. */
  private fade(floater: Floater): void {
    const { container, hold } = floater;
    this.scene.tweens.add({ targets: floater, rise: -34, delay: hold, duration: 500 });
    this.scene.tweens.add({
      targets: container,
      alpha: 0,
      delay: hold,
      duration: 500,
      // Згас: зникає сам (зупиняти твіни тут не треба — вони й так скінчилися).
      onComplete: () => {
        this.floaters.delete(floater);
        container.destroy();
      },
    });
  }

  /**
   * Той самий бабл ще раз (`bubbleRepeat`, «again»): на своєму місці (і той, що вже згасав, — знову непрозорий і внизу)
   * наново вискакує й висить від початку.
   */
  private again(floater: Floater, hold: number): void {
    const { container } = floater;
    this.scene.tweens.killTweensOf(floater);
    this.scene.tweens.killTweensOf(container);
    floater.rise = 0;
    floater.hold = hold;
    container.setAlpha(1).setScale(POP_AGAIN);
    this.scene.tweens.add({ targets: container, scale: 1, duration: POP.ms, ease: "Back.easeOut" });
    this.fade(floater);
    this.arrange(0);
  }

  /** Бабл події зникає одразу: його замінив новий на тому самому місці. */
  private drop(floater: Floater): void {
    if (!this.floaters.delete(floater)) return;
    this.scene.tweens.killTweensOf(floater);
    this.scene.tweens.killTweensOf(floater.container);
    floater.container.destroy();
  }

  /** Бабли подій летять за тими, над ким виринули, і стають поруч (`arrange`); бабли стану під ними сховані. Викликати щокадру. */
  update(): void {
    for (const state of this.states.values()) {
      state.visible = !this.busy(state.owner);
      state.container.setVisible(state.visible);
    }
    this.arrange(1 - Math.exp(-this.scene.game.loop.delta / SLIDE_MS));
  }

  /**
   * Бабли подій — над тими, над ким виринули; бабли, що налазять один на одного (свої й чужі, подій і стану), — в ряд поруч
   * (`layoutBubbles`, щокадру, бо коти ходять і сходяться), не за краєм екрана. `slide` — яку частку шляху до нового
   * місця бабл проходить цього кадру; щойно виринулий стає на місце одразу.
   */
  private arrange(slide: number): void {
    const laid = this.laid;
    let count = 0;
    for (const f of this.floaters) {
      const p = place(f.at);
      if (p) {
        f.x = p.x;
        f.y = p.y - EVENT_LIFT + f.rise;
      }
      laid[count++] = f;
    }
    for (const state of this.states.values()) laid[count++] = state;
    // Бабли лежать у шарі квартири, а його показує головна камера (`Viewport`).
    const view = this.scene.cameras.main.worldView;
    this.bounds.left = view.x + EDGE;
    this.bounds.right = view.right - EDGE;
    layoutBubbles(laid, count, view.width > 0 ? this.bounds : undefined);
    for (let i = 0; i < count; i++) {
      const b = laid[i]!;
      if (!b.visible) {
        // Схований бабл стану, коли знову з'явиться, стане на місце одразу.
        b.placed = false;
        continue;
      }
      b.dx = b.placed ? b.dx + (b.target - b.dx) * slide : b.target;
      b.placed = true;
      b.container.setPosition(b.x + b.dx, b.y);
    }
  }

  clear(): void {
    for (const bubble of this.states.values()) bubble.container.destroy();
    this.states.clear();
    this.confirmed.clear();
    for (const f of this.floaters) f.container.destroy();
    this.floaters.clear();
    this.laid.length = 0;
  }
}
