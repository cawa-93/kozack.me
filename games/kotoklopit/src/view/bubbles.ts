// Бабли (§11.4): стан висить над річчю, поки триває, подія виринає й зникає.
// Над однією річчю — лише один бабл стану, найважливіший.
// Кожен бабл — вголос (мовна хмаринка) чи думка (хмаринка з кружечками), правка автора 2026-10-25;
// який саме — вирішує `eventBubbles` (symbols.ts) і сцена для станів.
// Фон, іконка й позначка — кадри атласу (`ui/bubble/*`, `icon/*`, крок 16), а де що лежить — `iso/bubblelook.ts`.

import Phaser from "phaser";

import { addArt } from "./art/atlas";
import { bubbleArt, iconArt, markArt, type BubbleKind, type IconName, type Mark } from "./iconnames";
import {
  BESIDE_GAP,
  besideDx,
  BUBBLE_COUNT,
  bubbleSpan,
  countPillCenter,
  countPillWidth,
  countSide,
  isoBubbleLook,
  type BubbleSpan,
  type IsoBubbleLook,
} from "./iso/bubblelook";
import { isoPopColor, UI_FILL, UI_FONT, UI_TEXT } from "./iso/uilook";
import type { EventBubble, Thinker } from "./symbols";
import { WORLD_LAYERS } from "./world/layers";

const BUBBLE_DEPTH = WORLD_LAYERS.bubbles;
/** Скільки висить бабл події, перш ніж згаснути, мс. */
const EVENT_HOLD_MS = 1100;
/** Думка про стан (§11.4) виринає сама, без дії гравця, тож висить довше — щоб уважний встиг помітити. */
export const THOUGHT_HOLD_MS = 1900;
/** Напис над кимось («+N ₴») не має власника, тож поруч із ним ніхто не стає: місця він не займає. */
const NO_SPAN: BubbleSpan = { left: 0, right: 0 };

interface StateBubble {
  container: Phaser.GameObjects.Container;
  kind: BubbleKind;
  name: IconName;
}

/** Де виринає бабл: точка чи той, за ким він летить. */
export type Anchor = { x: number; y: number } | (() => { x: number; y: number } | null);

interface Floater {
  container: Phaser.GameObjects.Container;
  at: Anchor;
  rise: number;
  /** Над ким бабл (ключ, як у `setState`): поки він видно, бабл стану там схований. */
  owner: string | undefined;
  /** Зсув убік, коли над тим самим уже висить інший бабл події. */
  dx: number;
  /** Скільки бабл займає ліворуч і праворуч від точки — щоб наступний став поруч. */
  span: BubbleSpan;
  icon: IconName | undefined;
}

/** Бабл, щойно складений: контейнер і скільки він займає ліворуч і праворуч від точки. */
interface Made {
  container: Phaser.GameObjects.Container;
  span: BubbleSpan;
}

const place = (at: Anchor): { x: number; y: number } | null => (typeof at === "function" ? at() : at);

export class Bubbles {
  private readonly states = new Map<string, StateBubble>();
  private readonly floaters = new Set<Floater>();
  /** Як лежить бабл кожного виду (з маніфесту). */
  private readonly looks: Readonly<Record<BubbleKind, IsoBubbleLook>> = { say: isoBubbleLook("say"), think: isoBubbleLook("think") };

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
  private make(kind: BubbleKind, icon: IconName, x: number, y: number, count?: number, mark?: Mark): Made {
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
        .text(0, 0, String(count), { fontFamily: UI_FONT, fontSize: `${c.font}px`, fontStyle: "bold", color: UI_TEXT.main, resolution: 2 })
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
  setState(anchor: string, kind: "say", icon: IconName | null, x: number, y: number): void;
  setState(anchor: string, kind: BubbleKind, icon: IconName | null, x: number, y: number): void {
    const current = this.states.get(anchor);
    if (icon === null) {
      current?.container.destroy();
      this.states.delete(anchor);
      return;
    }
    if (current && current.name === icon && current.kind === kind) {
      current.container.setPosition(x, y).setVisible(!this.busy(anchor));
      return;
    }
    current?.container.destroy();
    const container = this.make(kind, icon, x, y).container.setVisible(!this.busy(anchor));
    container.setScale(0.6);
    this.scene.tweens.add({ targets: container, scale: 1, duration: 160, ease: "Back.easeOut" });
    this.states.set(anchor, { container, kind, name: icon });
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
   * стану там само схований, щоб дві хмаринки не злипалися в одну.
   */
  show(bubble: EventBubble, at: Anchor, hold = EVENT_HOLD_MS): void {
    const start = place(at);
    if (!start) return;
    const { container, span } = this.make(bubble.kind, bubble.icon, start.x, start.y - 8, bubble.count, bubble.mark);
    const dx = this.beside(bubble.at, bubble.icon, span);
    container.setX(start.x + dx).setScale(0.5).setDepth(BUBBLE_DEPTH + 1);
    this.scene.tweens.add({ targets: container, scale: 1, duration: 180, ease: "Back.easeOut" });
    this.float(container, at, hold, { owner: bubble.at, dx, span, icon: bubble.icon });
    this.states.get(bubble.at)?.container.setVisible(false);
  }

  /** Короткий напис над кимось (§11.4): «+12 ₴» тощо. Так само виринає й летить за ним. */
  popText(text: string, at: Anchor, color: string): void {
    const start = place(at);
    if (!start) return;
    // Одиниця світу ізометрії дрібна (≈ 0,72 px CSS на телефоні), тож напис — 22 px; колір — токеном палітри арту
    // (`isoPopColor`).
    const style = { fontFamily: UI_FONT, fontSize: "22px", fontStyle: "bold", color: isoPopColor(color), stroke: UI_TEXT.stroke, strokeThickness: 4, resolution: 2 };
    const label = this.scene.add
      .text(0, 0, text, style)
      .setOrigin(0.5, 1)
      .setAlpha(0.75);
    const container = this.scene.add.container(start.x, start.y - 4, [label]).setDepth(BUBBLE_DEPTH + 2).addToDisplayList(this.layer);
    this.float(container, at, 700);
  }

  /**
   * Два різні бабли події, що виринули над тим самим разом (засідка «Ніндзя»: думка-запаморочення й «кігті» вголос, §11.4;
   * рішення автора 2026-10-30, «Відкрите після рішень», п. 6), стоять поруч: кожен наступний — упритул праворуч, потім
   * ліворуч (`besideDx`, за справжніми межами фонів: думка ширша, і вістря в неї збоку). Той самий бабл
   * (відмова, натиснута кілька разів поспіль) виринає на тому самому місці, як і раніше.
   */
  private beside(owner: string, icon: IconName, span: BubbleSpan): number {
    const taken: Floater[] = [];
    for (const f of this.floaters) {
      if (f.owner !== owner) continue;
      if (f.icon === icon) return f.dx;
      taken.push(f);
    }
    return besideDx(taken, span, BESIDE_GAP);
  }

  /** Підйом і згасання; позиція щокадру — від місця, якщо воно рухоме (див. `update`). */
  private float(
    container: Phaser.GameObjects.Container,
    at: Anchor,
    delay: number,
    beside: Pick<Floater, "owner" | "dx" | "span" | "icon"> = { owner: undefined, dx: 0, span: NO_SPAN, icon: undefined },
  ): void {
    const floater: Floater = { container, at, rise: 0, ...beside };
    this.floaters.add(floater);
    this.scene.tweens.add({ targets: floater, rise: -34, delay, duration: 500 });
    this.scene.tweens.add({
      targets: container,
      alpha: 0,
      delay,
      duration: 500,
      onComplete: () => {
        this.floaters.delete(floater);
        container.destroy();
      },
    });
  }

  /** Бабли подій летять за тими, над ким виринули; бабли стану під ними сховані. Викликати щокадру. */
  update(): void {
    for (const f of this.floaters) {
      const p = place(f.at);
      if (p) f.container.setPosition(p.x + f.dx, p.y - 8 + f.rise);
    }
    for (const [anchor, state] of this.states) state.container.setVisible(!this.busy(anchor));
  }

  clear(): void {
    for (const bubble of this.states.values()) bubble.container.destroy();
    this.states.clear();
    for (const f of this.floaters) f.container.destroy();
    this.floaters.clear();
  }
}
