// Бабли (§11.4): стан висить над річчю, поки триває, подія виринає й зникає.
// Над однією річчю — лише один бабл стану, найважливіший.

import Phaser from "phaser";

import { BUBBLE_HEIGHT, type IconName } from "./icons";

const BUBBLE_DEPTH = 10_000;
const FONT = "system-ui, sans-serif";

interface StateBubble {
  container: Phaser.GameObjects.Container;
  name: IconName;
}

export class Bubbles {
  private readonly states = new Map<string, StateBubble>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
  ) {}

  private make(icon: IconName, x: number, y: number, count?: number): Phaser.GameObjects.Container {
    const bg = this.scene.add.image(0, 0, "bubble").setOrigin(0.5, 1);
    const image = this.scene.add.image(0, -BUBBLE_HEIGHT / 2 - 4, `icon-${icon}`);
    const container = this.scene.add.container(x, y, [bg, image]).setDepth(BUBBLE_DEPTH).addToDisplayList(this.layer);
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

  /** Бабл події: виринає й за мить зникає. */
  pop(icon: IconName, x: number, y: number, count?: number): void {
    const container = this.make(icon, x, y, count);
    container.setScale(0.5).setDepth(BUBBLE_DEPTH + 1);
    this.scene.tweens.add({ targets: container, scale: 1, duration: 180, ease: "Back.easeOut" });
    this.scene.tweens.add({
      targets: container,
      y: y - 34,
      alpha: 0,
      delay: 1100,
      duration: 500,
      onComplete: () => container.destroy(),
    });
  }

  clear(): void {
    for (const bubble of this.states.values()) bubble.container.destroy();
    this.states.clear();
  }
}
