// Точка входу: Pixi-рендер, фіксований крок симуляції 60 Гц з акумулятором (§13), екрани, звук.

import { Container } from "pixi.js";
import { VIEWPORT_TILES } from "./config";
import { AudioEngine } from "./audio/audio";
import { Input, KEY, type KeyEvent } from "./core/input";
import { randomRunSeed } from "./core/rng";
import { Item, type ItemKind } from "./game/items";
import { Run, VICTORY_SEQUENCE, formatTime } from "./game/run";
import { loadSettings, loadTutorial, recordRun, resetTutorial, saveSettings } from "./game/settings";
import { GameRenderer } from "./render/renderer";
import { Hud } from "./ui/hud";
import { Screens } from "./ui/screens";

const DT = 1 / 60;
/** resume — меню паузи закрите повторним Esc, гра чекає клацання для захоплення миші (§12.6). */
type Mode = "menu" | "playing" | "paused" | "resume" | "result";

async function main(): Promise<void> {
  const settings = loadSettings();
  const tutorial = loadTutorial();
  const gameEl = document.getElementById("game")!;
  const uiEl = document.getElementById("ui")!;
  const renderer = new GameRenderer();
  await renderer.init(gameEl);
  const canvas = renderer.r.canvas as HTMLCanvasElement;
  const input = new Input(canvas);
  const audio = new AudioEngine(settings);
  const hud = new Hud(uiEl, renderer.atlas);
  // Прихований режим для автоматичних перевірок без Pointer Lock (headless-браузер його не дає).
  const noLock = new URLSearchParams(location.search).has("nolock");

  let run: Run | null = null;
  let mode: Mode = "menu";
  let carry: KeyEvent[] = [];
  // Лише консоль розробника (§12.4: debug.showTimer); у меню цього немає.
  const debug = {
    showTimer: false,
    run: () => run,
    jump: (level: number) => run?.debugJump(level),
    give: (kind: ItemKind) => {
      if (!run) return;
      const item = new Item(kind);
      item.on = true;
      run.inv.hand = item;
    },
  };
  (window as unknown as { debug: typeof debug }).debug = debug;

  const lock = () => {
    if (!noLock) void input.requestPointerLock();
  };

  let pausedAt = 0;
  const unlockTime = () => (noLock ? performance.now() - 2000 : input.lastUnlockTime);
  const pause = () => {
    if (mode !== "playing" || !run) return;
    mode = "paused";
    pausedAt = performance.now();
    run.pause();
    input.capture = false;
    input.exitPointerLock();
    screens.showPause(unlockTime());
  };

  /** Продовжити гру після паузи (миша вже захоплена або захоплюється цим жестом). */
  const resume = () => {
    if (!run) return;
    audio.start();
    input.drainEvents();
    input.drainMouse();
    input.capture = true;
    mode = "playing";
    screens.hide();
    lock();
  };

  /** Повторне Esc на паузі: меню закривається; гра продовжиться першим клацанням (§12.6). */
  const closePauseMenu = () => {
    if (noLock) {
      resume();
      return;
    }
    mode = "resume";
    screens.showResumeHint(input.lastUnlockTime + 1100);
  };

  const screens = new Screens(uiEl, settings, {
    onStart() {
      // Жест користувача: захоплення миші й увімкнення звуку (§12.5).
      audio.start();
      run = new Run(randomRunSeed(), tutorial);
      input.drainEvents();
      input.drainMouse();
      carry = [];
      input.capture = true;
      mode = "playing";
      screens.hide();
      lock();
    },
    onContinue() {
      resume();
    },
    onSettingsChanged(_key, channel) {
      saveSettings(settings);
      audio.applyVolumes();
      if (channel) {
        audio.start();
        audio.sample(channel);
      }
    },
    onResetTutorial() {
      resetTutorial(tutorial);
    },
    onResultDone() {
      run = null;
      mode = "menu";
      screens.showStart();
    },
  });

  input.onPointerLockLost = () => pause();
  window.addEventListener("blur", () => pause());
  // Клік по полю гри після паузи — лише повторне захоплення миші, якщо меню вже закрите.
  canvas.addEventListener("mousedown", () => {
    if (mode === "playing" && !input.pointerLocked) lock();
    // Після закриття меню паузи через Esc: клацання захоплює мишу (браузер дозволяє ~1 с після Esc).
    if (mode === "resume" && screens.resumeReady) lock();
  });
  input.allowUnlockedMouse = noLock;
  // Панель розробника (§12.7): лише в режимі розробки, у продакшн-збірку не потрапляє.
  if (import.meta.env.DEV) {
    const { installDevPanel } = await import("./dev/panel");
    installDevPanel(uiEl, () => run, renderer);
  }

  const blank = new Container();
  let acc = 0;
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const events = input.drainEvents();
    const mouse = input.drainMouse();
    // Esc поза грою (§12.6): закриває меню паузи / знову відкриває його; у налаштуваннях зі старту — назад.
    let esc = events.some((e) => e.type === "down" && e.code === KEY.pause && !e.repeat);
    if (esc && mode !== "playing") {
      // Одне натискання — одна дія: закрита пауза в цьому ж кадрі не відкривається знову.
      const handled = now - pausedAt > 250;
      esc = false;
      if (handled) {
        if (mode === "paused" && run) closePauseMenu();
        else if (mode === "resume") {
          mode = "paused";
          pausedAt = now;
          screens.showPause(unlockTime());
        } else if (mode === "menu" && screens.inSettings) screens.showStart();
      }
    }
    if (mode === "resume" && input.pointerLocked) resume();
    if (run) {
      if (mode === "playing") {
        if (noLock && esc) pause();
      }
      if (mode === "playing") {
        acc += dt;
        const ppt = renderer.S / VIEWPORT_TILES;
        const k = settings.mouseSensitivity / ppt;
        let aimDx = mouse.dx * k;
        let aimDy = mouse.dy * k;
        let pending = carry.concat(events);
        while (acc >= DT) {
          run.step(DT, pending, input.isDown.bind(input), aimDx, aimDy);
          pending = [];
          aimDx = 0;
          aimDy = 0;
          acc -= DT;
          audio.handleEvents(run.world.events, run.world);
          run.world.events = [];
        }
        carry = pending;
      } else {
        acc = 0;
        carry = [];
      }

      if (mode === "playing" && run.state === "dead") {
        mode = "result";
        input.capture = false;
        input.exitPointerLock();
        recordRun(run.runSeed, null);
        screens.showDeath(run.deathReason, formatTime(run.time), run.levelIndex + 1);
      } else if (mode === "playing" && run.state === "won" && run.endTimer >= VICTORY_SEQUENCE) {
        mode = "result";
        input.capture = false;
        input.exitPointerLock();
        recordRun(run.runSeed, run.time);
        screens.showVictory(formatTime(run.time));
      }

      const w = run.world;
      audio.update(dt, w, mode !== "playing");
      audio.setMuffle(mode === "paused" || mode === "resume" ? 0.6 : w.blackout > 0 ? 0.9 : w.player.stun ? 0.45 : 0);
      renderer.edgeCues = audio.edgeCues;
      renderer.render(run, dt, settings, mode !== "playing");
    } else {
      audio.setMuffle(0);
      renderer.r.render({ container: blank });
    }
    const showHud = !!run && mode === "playing" && (run.state === "playing" || run.state === "transition") && run.world.blackout <= 0;
    hud.layout(renderer.vpX, renderer.vpY, renderer.S);
    hud.update(run?.world ?? null, showHud, run && debug.showTimer ? formatTime(run.time) : null);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void main();
