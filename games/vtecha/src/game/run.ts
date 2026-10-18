// Забіг (§12.1): 5 рівнів поспіль, наскрізний таймер, перенесення інвентаря, переходи й кінець.

import { LEVEL_TRANSITION_TIME } from "../config";
import { Rng, hashSeed } from "../core/rng";
import type { KeyEvent } from "../core/input";
import { generateLevel } from "../maze/generate";
import type { LevelData } from "../maze/level";
import { Inventory } from "./inventory";
import { Item } from "./items";
import type { TutorialFlags } from "./settings";
import { saveTutorial } from "./settings";
import { World } from "./world";

export type RunState = "playing" | "transition" | "dying" | "dead" | "won";

/** Затримка перед екраном смерті: завмирання 0.15 с + зум і заливка (§9.5). */
export const DEATH_SEQUENCE = 1.6;
/** Перехід до денного світла на перемозі (§12.3). */
export const VICTORY_SEQUENCE = 1.4;

export class Run {
  readonly rng: Rng;
  readonly inv = new Inventory();
  levelIndex = 0;
  /** Час забігу, с — зупиняється лише на паузі (§12.1). */
  time = 0;
  state: RunState = "playing";
  world: World;
  private next: LevelData | null = null;
  transition = 0;
  endTimer = 0;
  deathReason: "spider" | "web" = "spider";

  constructor(
    readonly runSeed: number,
    private readonly tutorial: TutorialFlags,
  ) {
    this.rng = new Rng(hashSeed(runSeed, 0x5eed, 7));
    // Стартовий комплект забігу — лише кайданки (§8, §11.2.1).
    this.inv.hand = new Item("handcuffs");
    this.world = this.makeWorld(generateLevel(runSeed, 0, null), null);
  }

  private makeWorld(level: LevelData, prev: World | null): World {
    return new World({
      level,
      inv: this.inv,
      rng: this.rng,
      hasAntidote: prev?.hasAntidote ?? false,
      aim: prev ? { x: prev.player.aimX, y: prev.player.aimY } : null,
      tutorial: { learned: this.tutorial, save: () => saveTutorial(this.tutorial) },
      startTime: this.time,
    });
  }

  /** Крок симуляції (фіксований dt). */
  step(dt: number, keys: KeyEvent[], isDown: (c: string) => boolean, aimDx: number, aimDy: number): void {
    switch (this.state) {
      case "playing": {
        this.time += dt;
        const w = this.world;
        w.step(dt, keys, isDown, aimDx, aimDy);
        if (w.dead) {
          this.state = "dying";
          this.deathReason = w.dead.reason;
          this.endTimer = 0;
        } else if (w.exited) {
          if (this.levelIndex === 4) {
            this.state = "won";
            this.endTimer = 0;
          } else {
            this.state = "transition";
            this.transition = 0;
            this.next = generateLevel(this.runSeed, this.levelIndex + 1, w.level.exitCorner);
          }
        }
        break;
      }
      case "transition": {
        // Таймер забігу й ресурси спорядження не зупиняються (§12.1, §7.3.4.1).
        this.time += dt;
        for (const item of this.inv.all()) item.update(dt);
        this.transition += dt;
        if (this.transition >= LEVEL_TRANSITION_TIME / 2 && this.next) {
          const prev = this.world;
          this.levelIndex++;
          this.world = this.makeWorld(this.next, prev);
          this.next = null;
        }
        if (this.transition >= LEVEL_TRANSITION_TIME) this.state = "playing";
        break;
      }
      case "dying":
        this.endTimer += dt;
        if (this.endTimer >= DEATH_SEQUENCE) this.state = "dead";
        break;
      case "won":
        this.endTimer += dt;
        break;
      case "dead":
        break;
    }
  }

  /** Лише для налагодження з консолі: одразу перейти на рівень (0..4). */
  debugJump(levelIndex: number): void {
    const prev = this.world;
    this.levelIndex = levelIndex;
    this.world = this.makeWorld(generateLevel(this.runSeed, levelIndex, levelIndex === 0 ? null : 0), prev);
    this.state = "playing";
  }

  /** Пауза скасовує поточну дію (§12.6). */
  pause(): void {
    this.world.actions.cancel();
  }
}

export function formatTime(t: number): string {
  const ms = Math.floor(t * 1000);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(r).padStart(3, "0")}`;
}
