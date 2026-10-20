// Гонка дорогою (§8.5): три смуги, свої й чужі машини, газ і гальмо. Сцена лише малює стан
// гонки й передає керування в симуляцію; коли гонка закінчилася, повертає день.

import Phaser from "phaser";

import { RACE } from "../sim/config";
import { drive } from "../sim/game";
import { carAt, type RaceInput } from "../sim/race";
import { formatClock, gameMinutes } from "../sim/time";
import type { Destination, GameState } from "../sim/types";
import type { Session } from "../session";
import { safeArea } from "../screen";
import { COLORS } from "../view/geometry";

const MAX_FRAME_SECONDS = 0.1;

export const DESTINATION_TITLES: Record<Destination, string> = {
  shop: "Магазин",
  vet: "Ветеринар",
  doctor: "Лікар",
  shelter: "Притулок",
  breeder: "Розплідник",
  groomer: "Грумер",
  cafe: "Котокафе",
  office: "Офіс",
};

const CAR_COLORS = [0x4f7fb3, 0x8e4a6a, 0x6fae6a, 0xe8b93a, 0x9aa3ab];

export class RaceScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private label!: Phaser.GameObjects.Text;
  private keys: Record<"up" | "down" | "up2" | "down2", Phaser.Input.Keyboard.Key> | null = null;
  private steer: -1 | 0 | 1 = 0;
  /** Натиснуті кнопки газу й гальма на сенсорному екрані: pointer id → напрям. */
  private readonly pedals = new Map<number, 1 | -1>();
  private swipe: { id: number; x: number } | null = null;

  constructor(private readonly session: Session) {
    super("race");
  }

  private get state(): GameState {
    return this.session.save.current;
  }

  create(): void {
    this.g = this.add.graphics();
    this.label = this.add.text(0, 0, "", { fontFamily: "system-ui, sans-serif", fontSize: "22px", color: "#f3e9dc", fontStyle: "bold", resolution: 2 });
    const keyboard = this.input.keyboard;
    if (keyboard) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      this.keys = keyboard.addKeys({ up: K.W, down: K.S, up2: K.UP, down2: K.DOWN }, false) as RaceScene["keys"];
      for (const [key, dir] of [["LEFT", -1], ["A", -1], ["RIGHT", 1], ["D", 1]] as const) {
        keyboard.on(`keydown-${key}`, () => (this.steer = dir));
      }
    }
    this.input.addPointer(2);
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.down(p));
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => this.up(p));
    this.input.on("pointerupoutside", (p: Phaser.Input.Pointer) => this.up(p));
  }

  /** Ліва половина — кермо (дотик ліворуч чи праворуч від середини, або свайп), права — газ угорі, гальмо внизу. */
  private down(p: Phaser.Input.Pointer): void {
    const { width, height } = this.scale;
    if (p.x < width / 2) {
      this.swipe = { id: p.id, x: p.x };
      return;
    }
    this.pedals.set(p.id, p.y < height / 2 ? 1 : -1);
  }

  private up(p: Phaser.Input.Pointer): void {
    this.pedals.delete(p.id);
    if (this.swipe?.id !== p.id) return;
    const dx = p.x - this.swipe.x;
    if (Math.abs(dx) > 30) this.steer = dx < 0 ? -1 : 1;
    else this.steer = p.x < this.scale.width / 4 ? -1 : 1;
    this.swipe = null;
  }

  private input_(): RaceInput {
    const k = this.keys;
    let throttle = 0;
    if (k && (k.up.isDown || k.up2.isDown)) throttle += 1;
    if (k && (k.down.isDown || k.down2.isDown)) throttle -= 1;
    for (const dir of this.pedals.values()) throttle += dir;
    const steer = this.steer;
    this.steer = 0;
    return { steer, throttle: Math.max(-1, Math.min(1, throttle)) };
  }

  override update(_time: number, delta: number): void {
    const state = this.state;
    if (state.trip?.phase !== "drive" || state.end !== null) return this.finish();
    if (!this.session.paused) {
      const seconds = Math.min(delta / 1000, MAX_FRAME_SECONDS);
      const { result, night } = drive(this.session.save, gameMinutes(seconds) * this.session.speed, this.input_());
      if (result !== null || night !== null) return this.finish();
    }
    this.draw();
  }

  private finish(): void {
    this.pedals.clear();
    this.scene.wake("day");
    this.scene.stop();
  }

  private draw(): void {
    const trip = this.state.trip;
    if (!trip) return;
    const race = trip.race;
    const { width, height } = this.scale;
    const g = this.g.clear();
    const safe = safeArea();
    g.fillStyle(0x55704a).fillRect(0, 0, width, height);
    const roadW = Math.min(width * 0.7, 420);
    const laneW = roadW / RACE.lanes;
    const left = (width - roadW) / 2;
    g.fillStyle(0x3a3a40).fillRect(left, 0, roadW, height);
    // Розмітка біжить униз, поки машина їде вгору.
    const pixelsPerUnit = (height * 0.75) / RACE.view;
    const dash = 0.25;
    const offset = ((race.done % (dash * 2)) / (dash * 2)) * dash * 2 * pixelsPerUnit;
    g.fillStyle(0xf3e9dc, 0.8);
    for (let lane = 1; lane < RACE.lanes; lane++) {
      const x = left + lane * laneW - 2;
      for (let y = -dash * 2 * pixelsPerUnit + offset; y < height; y += dash * 2 * pixelsPerUnit) g.fillRect(x, y, 4, dash * pixelsPerUnit);
    }
    const carW = laneW * 0.55;
    const carH = RACE.carLength * pixelsPerUnit * 1.6;
    const playerY = height * 0.78;
    for (const car of race.cars) {
      const y = playerY - (carAt(race, car) - race.done) * pixelsPerUnit;
      if (y < -carH || y > height + carH) continue;
      this.car(g, left + (car.lane + 0.5) * laneW, y, carW, carH, CAR_COLORS[Math.floor(car.start * 7) % CAR_COLORS.length] ?? 0x9aa3ab);
    }
    this.car(g, left + (race.lane + 0.5) * laneW, playerY, carW, carH, COLORS.danger);
    // Стрілка прогресу дороги збоку.
    const barX = left + roadW + 24;
    const barTop = safe.top + 90;
    const barH = height - barTop - safe.bottom - 40;
    g.fillStyle(COLORS.ink, 0.6).fillRoundedRect(barX, barTop, 12, barH, 6);
    g.fillStyle(COLORS.good).fillRoundedRect(barX, barTop + barH * (1 - race.done / race.road), 12, barH * (race.done / race.road), 6);
    // Педалі для сенсорного екрана.
    const px = width - safe.right - 90;
    g.fillStyle(0xffffff, 0.18).fillCircle(px, height * 0.3, 54).fillCircle(px, height * 0.72, 54);
    g.lineStyle(3, 0xffffff, 0.5).strokeCircle(px, height * 0.3, 54).strokeCircle(px, height * 0.72, 54);
    g.fillStyle(0xffffff, 0.7).fillTriangle(px - 20, height * 0.3 + 12, px + 20, height * 0.3 + 12, px, height * 0.3 - 18);
    g.fillRect(px - 18, height * 0.72 - 6, 36, 12);
    this.label
      .setPosition(safe.left + 20, safe.top + 16)
      .setText(`${DESTINATION_TITLES[trip.destination]} · ${formatClock(this.state.minute)} · швидкість ×${race.speed.toFixed(1)}`);
  }

  private car(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number): void {
    g.fillStyle(color).fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
    g.fillStyle(0xcfe3ef, 0.9).fillRoundedRect(x - w / 2 + 5, y - h / 2 + h * 0.18, w - 10, h * 0.22, 4);
    g.lineStyle(2.5, COLORS.ink).strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);
  }
}
