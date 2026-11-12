// Вікно втратило фокус чи вкладка пішла у фон (§10): клавішу чи палець, відпущені вже поза грою, гра не почує, тож усе
// «натиснуте» скидається — інакше персонаж ішов би сам. Скидання клавіш самого Phaser на це не годиться: зупинка будь-якої
// сцени (гонки після першої поїздки) знімає його в усіх сценах (`KeyboardPlugin.shutdown` — `off` без контексту).

import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { onFocusLost } from "../src/view/focuslost";

const require = createRequire(import.meta.url);
/** Модулі вихідного коду Phaser: пакет їх не експортує, тож — за шляхом від його `package.json` (як у `hudnews.test.ts`). */
const root = path.dirname(require.resolve("phaser/package.json"));
const phaser = (file: string): unknown => require(path.join(root, "src", file));

type Emitter = {
  on(event: string, fn: (...args: unknown[]) => void, context?: unknown): unknown;
  off(event: string, fn?: (...args: unknown[]) => void, context?: unknown): unknown;
  emit(event: string, ...args: unknown[]): boolean;
  listenerCount(event: string): number;
};
const EventEmitter = require("eventemitter3") as new () => Emitter;
const KeyboardPlugin = phaser("input/keyboard/KeyboardPlugin.js") as new (input: unknown) => {
  keys: unknown[];
  resetKeys(): void;
};
const Key = phaser("input/keyboard/keys/Key.js") as new (plugin: unknown, code: number) => { isDown: boolean };
const InputEvents = phaser("input/events") as { BOOT: string; START: string; SHUTDOWN: string };
const GameEvents = phaser("core/events") as { BLUR: string; HIDDEN: string };

/** Сцена з клавіатурою Phaser на спільних подіях гри; `stop` — як `scene.stop()` для її клавіатури. */
function scene(game: { events: Emitter }) {
  const pluginEvents = new EventEmitter();
  const keyboard = new KeyboardPlugin({
    systems: { game },
    scene: { sys: { settings: { input: {} }, events: new EventEmitter() } },
    pluginEvents,
    manager: { keyboard: {}, events: new EventEmitter() },
  });
  pluginEvents.emit(InputEvents.BOOT);
  pluginEvents.emit(InputEvents.START);
  return { keyboard, stop: () => pluginEvents.emit(InputEvents.SHUTDOWN) };
}

describe("втрата фокуса скидає натиснуте", () => {
  it("після зупинки іншої сцени клавіша дня, натиснута до Alt+Tab, на blur відпущена", () => {
    const game = { events: new EventEmitter() };
    const day = scene(game);
    const w = new Key(day.keyboard, 87);
    day.keyboard.keys[87] = w;
    let touch = 0;
    onFocusLost(game.events, () => {
      day.keyboard.resetKeys();
      touch++;
    });
    // Перша поїздка: сцена дороги стартувала й зупинилася.
    scene(game).stop();
    w.isDown = true;
    game.events.emit(GameEvents.BLUR);
    expect(w.isDown).toBe(false);
    expect(touch).toBe(1);
  });

  it("вкладка пішла у фон — так само", () => {
    const game = { events: new EventEmitter() };
    let resets = 0;
    onFocusLost(game.events, () => resets++);
    game.events.emit(GameEvents.HIDDEN);
    expect(resets).toBe(1);
  });

  it("відписка знімає лише своє", () => {
    const game = { events: new EventEmitter() };
    let mine = 0;
    let other = 0;
    const stop = onFocusLost(game.events, () => mine++);
    onFocusLost(game.events, () => other++);
    stop();
    game.events.emit(GameEvents.BLUR);
    game.events.emit(GameEvents.HIDDEN);
    expect(mine).toBe(0);
    expect(other).toBe(2);
  });
});
