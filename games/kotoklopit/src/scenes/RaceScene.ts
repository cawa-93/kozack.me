// Гонка дорогою (§8.5): три смуги, свої й чужі машини; джойстик чи стрілки: вперед — газ, назад — гальмо. Сцена лише малює стан
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
/** Джойстик гонки: радіус, мертва зона й наскільки відхилити вбік, щоб перестроїтися. */
const STICK_RADIUS = 70;
const STICK_DEAD = 0.2;
const STICK_STEER = 0.5;

export const DESTINATION_TITLES: Record<Destination, string> = {
  shop: "Магазин",
  vet: "Ветеринар",
  doctor: "Лікар",
  shelter: "Притулок",
  breeder: "Розплідник",
  groomer: "Грумер",
  cafe: "Котокафе",
  office: "Офіс",
  show: "Виставка котів",
};

const CAR_COLORS = [0x4f7fb3, 0x8e4a6a, 0x6fae6a, 0xe8b93a, 0x9aa3ab];

export class RaceScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private label!: Phaser.GameObjects.Text;
  private keys: Record<"up" | "down" | "up2" | "down2", Phaser.Input.Keyboard.Key> | null = null;
  private steer: -1 | 0 | 1 = 0;
  /** Плаваючий джойстик, як удома: вперед — газ, назад — гальмо, убік — перестроїтися. */
  private stick: { id: number; origin: { x: number; y: number }; x: number; y: number; steered: boolean } | null = null;

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
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.moveStick(p));
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => this.up(p));
    this.input.on("pointerupoutside", (p: Phaser.Input.Pointer) => this.up(p));
  }

  /** Джойстик з'являється під пальцем будь-де на екрані. */
  private down(p: Phaser.Input.Pointer): void {
    if (this.stick !== null) return;
    this.stick = { id: p.id, origin: { x: p.x, y: p.y }, x: 0, y: 0, steered: false };
  }

  private moveStick(p: Phaser.Input.Pointer): void {
    const stick = this.stick;
    if (stick?.id !== p.id) return;
    const dx = p.x - stick.origin.x;
    const dy = p.y - stick.origin.y;
    const length = Math.hypot(dx, dy);
    const scale = length > STICK_RADIUS ? STICK_RADIUS / length : 1;
    stick.x = (dx * scale) / STICK_RADIUS;
    stick.y = (dy * scale) / STICK_RADIUS;
    // Одне відхилення вбік — одне перестроювання; наступне — після повернення до середини.
    if (!stick.steered && Math.abs(stick.x) >= STICK_STEER) {
      this.steer = stick.x < 0 ? -1 : 1;
      stick.steered = true;
    } else if (Math.abs(stick.x) < STICK_STEER / 2) stick.steered = false;
  }

  private up(p: Phaser.Input.Pointer): void {
    if (this.stick?.id === p.id) this.stick = null;
  }

  private input_(): RaceInput {
    const k = this.keys;
    let throttle = 0;
    if (k && (k.up.isDown || k.up2.isDown)) throttle += 1;
    if (k && (k.down.isDown || k.down2.isDown)) throttle -= 1;
    // Джойстик угору — газ, униз — гальмо, сильніше відхилення — сильніше натиск.
    const forward = -(this.stick?.y ?? 0);
    if (Math.abs(forward) > STICK_DEAD) throttle += (forward - Math.sign(forward) * STICK_DEAD) / (1 - STICK_DEAD);
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
    this.stick = null;
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
    // Джойстик під пальцем.
    const stick = this.stick;
    if (stick) {
      g.fillStyle(0xffffff, 0.12).fillCircle(stick.origin.x, stick.origin.y, STICK_RADIUS);
      g.lineStyle(3, 0xffffff, 0.35).strokeCircle(stick.origin.x, stick.origin.y, STICK_RADIUS);
      g.fillStyle(0xffffff, 0.35).fillCircle(stick.origin.x + stick.x * STICK_RADIUS, stick.origin.y + stick.y * STICK_RADIUS, 30);
    }
    this.label
      .setPosition(safe.left + 20, safe.top + 16)
      .setText(`${DESTINATION_TITLES[trip.destination]} · ${formatClock(this.state.minute)} · ×${race.speed.toFixed(1).replace(".", ",")}`);
  }

  private car(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number): void {
    g.fillStyle(color).fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
    g.fillStyle(0xcfe3ef, 0.9).fillRoundedRect(x - w / 2 + 5, y - h / 2 + h * 0.18, w - 10, h * 0.22, 4);
    g.lineStyle(2.5, COLORS.ink).strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);
  }
}
