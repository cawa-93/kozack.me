// Індикатор сховища (§6.4, `StorageIndicators`): плашку, що зникла (персонаж відійшов, над ним бабл), сцена ховає, а не знищує, і
// знову показує ту саму; нова кількість — лише новий текст, а плашка з рамкою й іконками — та сама. Збирається заново, лише коли
// змінився склад рядків. Сцена — підробка, що рахує створені об'єкти.

import type Phaser from "phaser";
import { describe, expect, it } from "vitest";

import type { StorageLine } from "../src/sim/storage";
import { STORAGE_LOOK, StorageIndicators } from "../src/view/storage";

/** Об'єкт сцени, що підтримує ланцюжки викликів і пам'ятає, що з ним робили. */
class Fake {
  visible = true;
  destroyed = false;
  text = "";
  color = "";
  width = 0;
  readonly x = 0;
  readonly y = 0;
  constructor(readonly kind: string, text = "", color = "") {
    this.text = text;
    this.color = color;
    this.width = text.length * 10;
  }
  setText(text: string): this {
    this.text = text;
    this.width = text.length * 10;
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

function fakeScene(): { scene: Phaser.Scene; made: Fake[] } {
  const made: Fake[] = [];
  const add = (kind: string, text = "", color = ""): Fake => {
    const object = chain(new Fake(kind, text, color));
    made.push(object);
    return object;
  };
  const scene = {
    add: {
      text: (_x: number, _y: number, text: string, style: { color: string }) => add("text", text, style.color),
      graphics: () => add("graphics"),
      image: () => add("image"),
      container: () => add("container"),
    },
  };
  return { scene: scene as unknown as Phaser.Scene, made };
}

const count = (made: readonly Fake[], kind: string): number => made.filter((m) => m.kind === kind).length;

describe("індикатор сховища: ховати, а не збирати заново (§6.4)", () => {
  const fridge: StorageLine[] = [
    { product: "food", count: 12, limit: 40 },
    { product: "momMeal", count: 2, limit: 6 },
  ];

  it("зник — схований, а не знищений; знову той самий — показано ту саму плашку", () => {
    const { scene, made } = fakeScene();
    const indicators = new StorageIndicators(scene, {} as Phaser.GameObjects.Layer);
    indicators.set("fridge", fridge, 100, 200);
    const objects = made.length;
    const plate = made.find((m) => m.kind === "container")!;
    // Плашка — три частини кадру атласу (краї й середина) і дві іконки запасів, без `Graphics`.
    expect(count(made, "graphics")).toBe(0);
    expect(count(made, "image")).toBe(3 + fridge.length);
    indicators.set("fridge", [], 0, 0);
    expect(plate.visible).toBe(false);
    expect(plate.destroyed).toBe(false);
    indicators.set("fridge", fridge, 110, 200);
    expect(plate.visible).toBe(true);
    expect(made.length).toBe(objects);
  });

  it("інша кількість — лише новий текст і колір нуля, плашка з рамкою — та сама", () => {
    const { scene, made } = fakeScene();
    const indicators = new StorageIndicators(scene, {} as Phaser.GameObjects.Layer);
    indicators.set("fridge", fridge, 100, 200);
    const objects = made.length;
    indicators.set("fridge", [{ product: "food", count: 0, limit: 40 }, fridge[1]!], 100, 200);
    expect(made.length).toBe(objects);
    const texts = made.filter((m) => m.kind === "text");
    expect(texts.map((t) => t.text)).toEqual(["0/40", "2/6"]);
    expect(texts.map((t) => t.color)).toEqual([STORAGE_LOOK.zero, STORAGE_LOOK.text]);
    indicators.set("fridge", [], 0, 0);
    indicators.set("fridge", fridge, 100, 200);
    expect(made.length).toBe(objects);
    expect(texts.map((t) => t.text)).toEqual(["12/40", "2/6"]);
    expect(texts.map((t) => t.color)).toEqual([STORAGE_LOOK.text, STORAGE_LOOK.text]);
  });

  it("інший склад рядків (новий запас, ящики з іншим числом) — плашку зібрано заново, стару знищено", () => {
    const { scene, made } = fakeScene();
    const indicators = new StorageIndicators(scene, {} as Phaser.GameObjects.Layer);
    indicators.set("fridge", [fridge[0]!], 100, 200);
    const first = made.find((m) => m.kind === "container")!;
    indicators.set("fridge", fridge, 100, 200);
    expect(first.destroyed).toBe(true);
    expect(count(made, "container")).toBe(2);
    // Без ліміту (ящики) ширина фішки — за самим числом: інше число — інша плашка.
    indicators.set("boxes", [{ product: "hygiene", count: 5 }], 0, 0);
    const boxes = made.filter((m) => m.kind === "container").at(-1)!;
    indicators.set("boxes", [{ product: "hygiene", count: 15 }], 0, 0);
    expect(boxes.destroyed).toBe(true);
    indicators.clear();
    expect(made.filter((m) => m.kind === "container" && !m.destroyed)).toEqual([]);
  });
});
