// Ввід: клавіатура за фізичним положенням клавіш (KeyboardEvent.code, §8) — працює з будь-якою
// розкладкою, зокрема українською; миша через Pointer Lock — лише зміщення (§8.1).

export interface KeyEvent {
  type: "down" | "up";
  code: string;
  /** true — повтор затиснутої клавіші; такі натискання не рахуються як нові (§8). */
  repeat: boolean;
}

export class Input {
  private readonly down = new Set<string>();
  private queue: KeyEvent[] = [];
  private mouseDx = 0;
  private mouseDy = 0;
  pointerLocked = false;
  /** Викликається, коли захоплення миші втрачено (Esc, Alt+Tab, втрата фокуса) — §8.1. */
  onPointerLockLost: (() => void) | null = null;
  /** Час останнього виходу з Pointer Lock — браузер ~1 с не дозволяє захопити знову (§18). */
  lastUnlockTime = -Infinity;
  /** Під час гри клавіші не повинні робити нічого за замовчуванням. */
  capture = false;
  /** Приймати рух миші без Pointer Lock (прихований режим автоматичних перевірок). */
  allowUnlockedMouse = false;

  constructor(private readonly target: HTMLElement) {
    window.addEventListener("keydown", (e) => this.handleKeyDown(e));
    window.addEventListener("keyup", (e) => this.handleKeyUp(e));
    window.addEventListener("blur", () => this.releaseAll());
    document.addEventListener("mousemove", (e) => {
      if (!this.pointerLocked && !(this.allowUnlockedMouse && this.capture)) return;
      this.mouseDx += e.movementX;
      this.mouseDy += e.movementY;
    });
    document.addEventListener("pointerlockchange", () => {
      const locked = document.pointerLockElement === this.target;
      if (this.pointerLocked && !locked) {
        this.lastUnlockTime = performance.now();
        this.releaseAll();
        this.onPointerLockLost?.();
      }
      this.pointerLocked = locked;
    });
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.capture && GAME_KEYS.has(e.code)) e.preventDefault();
    const repeat = e.repeat || this.down.has(e.code);
    this.queue.push({ type: "down", code: e.code, repeat });
    this.down.add(e.code);
  }

  private handleKeyUp(e: KeyboardEvent): void {
    if (!this.down.has(e.code)) return;
    this.down.delete(e.code);
    this.queue.push({ type: "up", code: e.code, repeat: false });
  }

  releaseAll(): void {
    for (const code of this.down) this.queue.push({ type: "up", code, repeat: false });
    this.down.clear();
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** Події клавіатури в порядку надходження з моменту попереднього виклику. */
  drainEvents(): KeyEvent[] {
    const out = this.queue;
    this.queue = [];
    return out;
  }

  drainMouse(): { dx: number; dy: number } {
    const out = { dx: this.mouseDx, dy: this.mouseDy };
    this.mouseDx = 0;
    this.mouseDy = 0;
    return out;
  }

  /** Захопити мишу — лише в обробнику жесту користувача (клік по кнопці, §12.5–12.6). */
  requestPointerLock(): Promise<void> {
    try {
      const result = this.target.requestPointerLock() as unknown;
      if (result instanceof Promise) return result.catch(() => undefined);
    } catch {
      // Браузер відхилив запит (наприклад, одразу після Esc) — гравець спробує ще раз клацанням.
    }
    return Promise.resolve();
  }

  exitPointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

/** Клавіші гри: браузер не повинен виконувати для них дії за замовчуванням (прокрутка пробілом тощо). */
const GAME_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyE",
  "KeyQ",
  "KeyX",
  "Digit1",
  "Digit2",
  "Digit3",
  "Space",
  "ShiftLeft",
  "ShiftRight",
  "Tab",
]);

export const KEY = {
  up: "KeyW",
  left: "KeyA",
  down: "KeyS",
  right: "KeyD",
  interact: "KeyE",
  drop: "KeyQ",
  stow: "KeyX",
  slot1: "Digit1",
  slot2: "Digit2",
  slot3: "Digit3",
  activate: "Space",
  sprintL: "ShiftLeft",
  sprintR: "ShiftRight",
  pause: "Escape",
} as const;

export const SLOT_KEYS: readonly string[] = [KEY.slot1, KEY.slot2, KEY.slot3];
