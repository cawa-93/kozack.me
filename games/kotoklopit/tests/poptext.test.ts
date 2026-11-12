// Напис над персонажем «+N ₴» (§11.4, `Bubbles.popText`): виринає раз на кілька секунд і живе ≈ 1,2 с, тож напис, що згас, не
// знищується, а чекає наступного — новий `Text` (і його текстура) не створюється щоразу. Сцена — підробка, що рахує створене.

import type Phaser from "phaser";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/view/art/atlas", () => ({ addArt: () => ({}) }));

const { Bubbles } = await import("../src/view/bubbles");

/** Об'єкт сцени з ланцюжками викликів: пам'ятає текст, колір, видимість, прозорість і чи знищений. */
class Fake {
  text = "";
  color = "";
  visible = true;
  alpha = 1;
  destroyed = false;
  x = 0;
  y = 0;
  constructor(readonly kind: string) {}
  setText(text: string): this {
    this.text = text;
    return this;
  }
  setColor(color: string): this {
    this.color = color;
    return this;
  }
  setVisible(on: boolean): this {
    this.visible = on;
    return this;
  }
  setAlpha(alpha: number): this {
    this.alpha = alpha;
    return this;
  }
  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }
  destroy(): void {
    this.destroyed = true;
  }
}
const chain = (target: Fake): Fake =>
  new Proxy(target, {
    get(object, name: string) {
      if (name in object) return (object as unknown as Record<string, unknown>)[name];
      return () => chain(object);
    },
  });

interface Tween {
  targets: unknown;
  onComplete?: () => void;
}

function fakeScene(): { scene: Phaser.Scene; made: Fake[]; tweens: Tween[] } {
  const made: Fake[] = [];
  const tweens: Tween[] = [];
  const add = (kind: string): Fake => {
    const object = chain(new Fake(kind));
    made.push(object);
    return object;
  };
  const scene = {
    add: {
      text: (_x: number, _y: number, text: string, style: { color: string }) => add("text").setText(text).setColor(style.color),
      container: (x: number, y: number) => add("container").setPosition(x, y),
    },
    tweens: { add: (tween: Tween) => tweens.push(tween), killTweensOf: () => {} },
    cameras: { main: { zoom: 1, worldView: { x: 0, y: 0, width: 0, right: 0 } } },
  };
  return { scene: scene as unknown as Phaser.Scene, made, tweens };
}

/** Догнати всі твіни: напис згасає й звільняється. */
function finish(tweens: Tween[]): void {
  for (const tween of tweens.splice(0)) tween.onComplete?.();
}

describe("«+N ₴» без нового напису щоразу (§11.4)", () => {
  it("напис, що згас, береться знову: той самий текст-об'єкт, новий текст і місце", () => {
    const { scene, made, tweens } = fakeScene();
    const bubbles = new Bubbles(scene, {} as Phaser.GameObjects.Layer);
    bubbles.popText("+12 ₴", { x: 100, y: 200 }, "#8fdc7a");
    finish(tweens);
    const label = made.find((m) => m.kind === "text")!;
    const box = made.find((m) => m.kind === "container")!;
    expect(box.destroyed).toBe(false);
    expect(box.visible).toBe(false);
    bubbles.popText("+40 ₴", { x: 300, y: 250 }, "#8fdc7a");
    expect(made.filter((m) => m.kind === "text")).toHaveLength(1);
    expect(label.text).toBe("+40 ₴");
    expect(box.visible).toBe(true);
    expect(box.alpha).toBe(1);
    expect([box.x, box.y]).toEqual([300, 246]);
  });

  it("два написи водночас — два об'єкти; згаслі обидва чекають наступних", () => {
    const { scene, made, tweens } = fakeScene();
    const bubbles = new Bubbles(scene, {} as Phaser.GameObjects.Layer);
    bubbles.popText("+1 ₴", { x: 0, y: 0 }, "#8fdc7a");
    bubbles.popText("+2 ₴", { x: 0, y: 0 }, "#8fdc7a");
    expect(made.filter((m) => m.kind === "text")).toHaveLength(2);
    finish(tweens);
    bubbles.popText("+3 ₴", { x: 0, y: 0 }, "#8fdc7a");
    bubbles.popText("+4 ₴", { x: 0, y: 0 }, "#8fdc7a");
    expect(made.filter((m) => m.kind === "text")).toHaveLength(2);
    // День показують заново — написи знищено, наступний — новий.
    bubbles.clear();
    expect(made.filter((m) => m.kind === "container").every((m) => m.destroyed)).toBe(true);
    bubbles.popText("+5 ₴", { x: 0, y: 0 }, "#8fdc7a");
    expect(made.filter((m) => m.kind === "text")).toHaveLength(3);
  });
});
