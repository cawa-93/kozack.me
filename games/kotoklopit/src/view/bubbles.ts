// Бабли (§11.4): стан висить над річчю, поки триває, подія виринає й зникає.
// Над однією річчю — лише один бабл стану, найважливіший.
// Кожен бабл — вголос (мовна хмаринка) чи думка (хмаринка з кружечками), правка автора 2026-10-25;
// який саме — вирішує `eventBubbles` (symbols.ts) і сцена для станів.

import Phaser from "phaser";

import { COLORS } from "./geometry";
import { BUBBLE_ICON_Y, type BubbleKind, type IconName, type Mark } from "./icons";
import type { EventBubble, Thinker } from "./symbols";

const BUBBLE_DEPTH = 10_000;
const FONT = "system-ui, sans-serif";
/** У хмаринці-думці іконка трохи менша: край хвилястий, і кути іконки інакше лягали б на контур. */
const THOUGHT_ICON_SCALE = 0.85;
/** Де кількість відносно центру іконки: у правому верхньому куті мовної хмаринки й на правому горбику думки. */
const COUNT_AT: Record<BubbleKind, { x: number; y: number }> = { say: { x: 16, y: -16 }, think: { x: 18, y: -12 } };

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
}

const place = (at: Anchor): { x: number; y: number } | null => (typeof at === "function" ? at() : at);

export class Bubbles {
  private readonly states = new Map<string, StateBubble>();
  private readonly floaters = new Set<Floater>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
  ) {}

  private make(kind: BubbleKind, icon: IconName, x: number, y: number, count?: number, mark?: Mark): Phaser.GameObjects.Container {
    const iconY = BUBBLE_ICON_Y[kind];
    const scale = kind === "think" ? THOUGHT_ICON_SCALE : 1;
    const bg = this.scene.add.image(0, 0, `bubble-${kind}`).setOrigin(0.5, 1);
    const image = this.scene.add.image(0, iconY, `icon-${icon}`).setScale(scale);
    const container = this.scene.add.container(x, y, [bg, image]).setDepth(BUBBLE_DEPTH).addToDisplayList(this.layer);
    if (mark !== undefined) container.add(this.scene.add.image(0, iconY, `mark-${mark}`).setScale(scale));
    if (count !== undefined) {
      // Кількість — темна заокруглена плашка з білою обвідкою: видно і на світлій підлозі, і на темній стіні.
      // Довге число (120) росте назовні, праворуч, а не на іконку.
      const at = COUNT_AT[kind];
      const label = this.scene.add
        .text(0, 0, String(count), { fontFamily: FONT, fontSize: "15px", fontStyle: "bold", color: "#ffffff", resolution: 2 })
        .setOrigin(0.5);
      const h = 20;
      const w = Math.max(h, label.width + 10);
      const cx = at.x + (w - h) / 2;
      const cy = iconY + at.y;
      label.setPosition(cx, cy);
      const pill = this.scene.add.graphics();
      pill.fillStyle(COLORS.ink).fillRoundedRect(cx - w / 2, cy - h / 2, w, h, h / 2);
      pill.lineStyle(2, 0xffffff).strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, h / 2);
      container.add([pill, label]);
    }
    return container;
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
    const container = this.make(kind, icon, x, y).setVisible(!this.busy(anchor));
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
  show(bubble: EventBubble, at: Anchor): void {
    const start = place(at);
    if (!start) return;
    const container = this.make(bubble.kind, bubble.icon, start.x, start.y - 8, bubble.count, bubble.mark);
    container.setScale(0.5).setDepth(BUBBLE_DEPTH + 1);
    this.scene.tweens.add({ targets: container, scale: 1, duration: 180, ease: "Back.easeOut" });
    this.float(container, at, 1100, bubble.at);
    this.states.get(bubble.at)?.container.setVisible(false);
  }

  /** Короткий напис над кимось (§11.4): «+12 ₴» тощо. Так само виринає й летить за ним. */
  popText(text: string, at: Anchor, color: string): void {
    const start = place(at);
    if (!start) return;
    const label = this.scene.add
      .text(0, 0, text, { fontFamily: FONT, fontSize: "18px", fontStyle: "bold", color, stroke: "#1f1a24", strokeThickness: 3, resolution: 2 })
      .setOrigin(0.5, 1)
      .setAlpha(0.75);
    const container = this.scene.add.container(start.x, start.y - 4, [label]).setDepth(BUBBLE_DEPTH + 2).addToDisplayList(this.layer);
    this.float(container, at, 700);
  }

  /** Підйом і згасання; позиція щокадру — від місця, якщо воно рухоме (див. `update`). */
  private float(container: Phaser.GameObjects.Container, at: Anchor, delay: number, owner?: string): void {
    const floater: Floater = { container, at, rise: 0, owner };
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
      if (p) f.container.setPosition(p.x, p.y - 8 + f.rise);
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
