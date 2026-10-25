// Бабли (§11.4): стан висить над річчю, поки триває, подія виринає й зникає.
// Над однією річчю — лише один бабл стану, найважливіший.

import Phaser from "phaser";

import { BUBBLE_HEIGHT, type IconName, type Mark } from "./icons";

const BUBBLE_DEPTH = 10_000;
const FONT = "system-ui, sans-serif";

interface StateBubble {
  container: Phaser.GameObjects.Container;
  name: IconName;
}

/** Де виринає бабл: точка чи той, за ким він летить. */
export type Anchor = { x: number; y: number } | (() => { x: number; y: number } | null);

interface Floater {
  container: Phaser.GameObjects.Container;
  at: Anchor;
  rise: number;
}

const place = (at: Anchor): { x: number; y: number } | null => (typeof at === "function" ? at() : at);

export class Bubbles {
  private readonly states = new Map<string, StateBubble>();
  private readonly floaters = new Set<Floater>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
  ) {}

  private make(icon: IconName, x: number, y: number, count?: number, mark?: Mark): Phaser.GameObjects.Container {
    const bg = this.scene.add.image(0, 0, "bubble").setOrigin(0.5, 1);
    const image = this.scene.add.image(0, -BUBBLE_HEIGHT / 2 - 4, `icon-${icon}`);
    const container = this.scene.add.container(x, y, [bg, image]).setDepth(BUBBLE_DEPTH).addToDisplayList(this.layer);
    if (mark !== undefined) container.add(this.scene.add.image(0, -BUBBLE_HEIGHT / 2 - 4, `mark-${mark}`));
    if (count !== undefined) {
      const label = this.scene.add
        .text(16, -BUBBLE_HEIGHT + 6, String(count), {
          fontFamily: FONT,
          fontSize: "15px",
          fontStyle: "bold",
          color: "#ffffff",
          backgroundColor: "#1f1a24",
          padding: { x: 4, y: 1 },
          resolution: 2,
        })
        .setOrigin(0.5);
      container.add(label);
    }
    return container;
  }

  /** Бабл стану над річчю; null прибирає його. Викликати щокадру для кожної речі. */
  setState(anchor: string, icon: IconName | null, x: number, y: number): void {
    const current = this.states.get(anchor);
    if (icon === null) {
      current?.container.destroy();
      this.states.delete(anchor);
      return;
    }
    if (current && current.name === icon) {
      current.container.setPosition(x, y);
      return;
    }
    current?.container.destroy();
    const container = this.make(icon, x, y);
    container.setScale(0.6);
    this.scene.tweens.add({ targets: container, scale: 1, duration: 160, ease: "Back.easeOut" });
    this.states.set(anchor, { container, name: icon });
  }

  hasState(anchor: string): boolean {
    return this.states.has(anchor);
  }

  /**
   * Бабл події: виринає й за мить зникає. Якщо місце — функція, бабл летить за тим, над ким виринув
   * (персонаж чи кіт іде далі, а бабл — з ним).
   */
  pop(icon: IconName, at: Anchor, count?: number, mark?: Mark): void {
    const start = place(at);
    if (!start) return;
    const container = this.make(icon, start.x, start.y - 8, count, mark);
    container.setScale(0.5).setDepth(BUBBLE_DEPTH + 1);
    this.scene.tweens.add({ targets: container, scale: 1, duration: 180, ease: "Back.easeOut" });
    this.float(container, at, 1100);
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
  private float(container: Phaser.GameObjects.Container, at: Anchor, delay: number): void {
    const floater: Floater = { container, at, rise: 0 };
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

  /** Бабли подій летять за тими, над ким виринули. Викликати щокадру. */
  update(): void {
    for (const f of this.floaters) {
      const p = place(f.at);
      if (p) f.container.setPosition(p.x, p.y - 8 + f.rise);
    }
  }

  clear(): void {
    for (const bubble of this.states.values()) bubble.container.destroy();
    this.states.clear();
    for (const f of this.floaters) f.container.destroy();
    this.floaters.clear();
  }
}
