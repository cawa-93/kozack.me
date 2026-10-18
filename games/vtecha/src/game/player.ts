// Гравець (§8): рух WASD, біг і витривалість (§8.2), віртуальний приціл (§8.1), знерухомлення (§8).

import {
  MOUSE_DEADZONE,
  MOUSE_RETICLE_MAX,
  PLAYER_RADIUS,
  PLAYER_SPRINT_SPEED,
  PLAYER_WALK_SPEED,
  STAMINA_DRAIN,
  STAMINA_EXHAUST_RECOVER,
  STAMINA_REGEN_DELAY,
  STAMINA_REGEN_IDLE,
  STAMINA_REGEN_WALK,
  WEB_STUN_DURATION,
  WEB_STUN_MIN,
  WEB_STUN_PRESS_REDUCTION,
} from "../config";
import { KEY } from "../core/input";
import { moveCircle, type BlockedFn } from "./physics";

export class Player {
  facing: number;
  /** Віртуальний приціл: зсув від центру гравця, тайли (§8.1). */
  aimX: number;
  aimY: number;
  stamina = 1;
  exhausted = false;
  /** Біг дозволено лише після нового натискання Shift (після виснаження, §8.2). */
  sprintArmed = true;
  private regenDelay = 0;
  sprinting = false;
  moving = false;
  /** Знерухомлення плювком (§8): минуло / тривалість. */
  stun: { elapsed: number; duration: number; presses: number } | null = null;
  /** Боротьба з павутиною після пробудження (§10.3): кількість ривків; null — не бореться. */
  struggle: number | null = null;
  /** Час без світла в руках — для розкриття нічного зору (§7.3.5). */
  nvTime = 0;
  /** Накопичений шлях для зняття завмирання павуків (§9.6). */
  distanceTravelled = 0;
  private stepAcc = 0;

  constructor(
    public x: number,
    public y: number,
    facing: number,
    aim?: { x: number; y: number },
  ) {
    this.facing = facing;
    this.aimX = aim?.x ?? Math.cos(facing) * 2;
    this.aimY = aim?.y ?? Math.sin(facing) * 2;
    this.updateFacing();
  }

  get immobile(): boolean {
    return this.stun !== null || this.struggle !== null;
  }

  /** Зміщення миші в тайлах → приціл і напрямок погляду (§8.1). */
  aim(dx: number, dy: number): void {
    this.aimX += dx;
    this.aimY += dy;
    const d = Math.hypot(this.aimX, this.aimY);
    if (d > MOUSE_RETICLE_MAX) {
      this.aimX *= MOUSE_RETICLE_MAX / d;
      this.aimY *= MOUSE_RETICLE_MAX / d;
    }
    this.updateFacing();
  }

  private updateFacing(): void {
    if (Math.hypot(this.aimX, this.aimY) >= MOUSE_DEADZONE) this.facing = Math.atan2(this.aimY, this.aimX);
  }

  /** Нове натискання Shift знову дозволяє біг, якщо гравець не виснажений. */
  onShiftPress(): void {
    if (!this.exhausted) this.sprintArmed = true;
  }

  /** Натискання під час знерухомлення: −0.1 с, не менше 0.5 с (§8). */
  stunPress(): void {
    if (!this.stun) return;
    this.stun.presses++;
    this.stun.duration = Math.max(WEB_STUN_MIN, WEB_STUN_DURATION - WEB_STUN_PRESS_REDUCTION * this.stun.presses);
  }

  hitBySpit(): void {
    this.stun = { elapsed: 0, duration: WEB_STUN_DURATION, presses: 0 };
  }

  /**
   * Рух і витривалість за крок. Повертає пройдену відстань і чи настав момент кроку (звук).
   */
  update(dt: number, isDown: (code: string) => boolean, blocked: BlockedFn, speedMul: number): { moved: number; footstep: boolean; exhaustedNow: boolean } {
    let exhaustedNow = false;
    if (this.stun) {
      this.stun.elapsed += dt;
      if (this.stun.elapsed >= this.stun.duration) this.stun = null;
    }
    let ix = 0;
    let iy = 0;
    if (!this.immobile) {
      if (isDown(KEY.up)) iy -= 1;
      if (isDown(KEY.down)) iy += 1;
      if (isDown(KEY.left)) ix -= 1;
      if (isDown(KEY.right)) ix += 1;
    }
    const len = Math.hypot(ix, iy);
    const shift = isDown(KEY.sprintL) || isDown(KEY.sprintR);
    const wantSprint = len > 0 && shift && !this.exhausted && this.sprintArmed && this.stamina > 0;
    let moved = 0;
    if (len > 0) {
      const speed = (wantSprint ? PLAYER_SPRINT_SPEED : PLAYER_WALK_SPEED) * speedMul;
      const px = this.x;
      const py = this.y;
      const res = moveCircle(this.x, this.y, (ix / len) * speed * dt, (iy / len) * speed * dt, PLAYER_RADIUS, blocked);
      this.x = res.x;
      this.y = res.y;
      moved = Math.hypot(this.x - px, this.y - py);
    }
    this.moving = moved > 1e-4;
    this.sprinting = wantSprint && this.moving;

    // Витривалість (§8.2).
    if (this.sprinting) {
      this.stamina -= STAMINA_DRAIN * dt;
      this.regenDelay = STAMINA_REGEN_DELAY;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.exhausted = true;
        this.sprintArmed = false;
        exhaustedNow = true;
      }
    } else if (this.regenDelay > 0) {
      this.regenDelay = Math.max(0, this.regenDelay - dt);
    } else {
      this.stamina = Math.min(1, this.stamina + (this.moving ? STAMINA_REGEN_WALK : STAMINA_REGEN_IDLE) * dt);
    }
    if (this.exhausted && this.stamina >= STAMINA_EXHAUST_RECOVER) this.exhausted = false;

    this.distanceTravelled += moved;
    this.stepAcc += moved;
    const stride = this.sprinting ? 0.95 : 0.72;
    let footstep = false;
    if (this.stepAcc >= stride) {
      this.stepAcc -= stride;
      footstep = true;
    }
    return { moved, footstep, exhaustedNow };
  }

  resetVitals(): void {
    this.stamina = 1;
    this.exhausted = false;
    this.sprintArmed = true;
    this.regenDelay = 0;
    this.stun = null;
  }
}
