// Предмети спорядження (§7.3): стан, ресурси, активація Space (§7.3.0) і параметри світла.

import {
  DYNAMO_CHARGE_PER_PRESS,
  DYNAMO_DRAIN,
  DYNAMO_RADIUS_MAX,
  DYNAMO_RADIUS_MIN,
  DYNAMO_START_CHARGE,
  FLARE_BURN_TIME,
  FLARE_RADIUS,
  FLASHLIGHT_ANGLE,
  FLASHLIGHT_BATTERY,
  FLASHLIGHT_RADIUS,
  GAS_LAMP_FUEL,
  GAS_LAMP_RADIUS,
  LIGHTER_FUEL,
  LIGHTER_RADIUS,
  LIGHT_MIN_RADIUS,
  MATCHBOOK_SIZE,
  MATCH_BURN_TIME,
  MATCH_RADIUS,
} from "../config";

export type ItemKind = "dynamo" | "flashlight" | "gasLamp" | "flare" | "matchbook" | "lighter" | "battery" | "fuel" | "handcuffs";

/** Витратні матеріали (§7.3.7): що перезаряджають. */
export const RELOAD_TARGET: Partial<Record<ItemKind, ItemKind>> = { battery: "flashlight", fuel: "gasLamp" };

/** Параметри джерела світла для рендеру (§7.2–7.3). */
export interface LightSpec {
  radius: number;
  /** Колір світла (0xRRGGBB). */
  color: number;
  /** Повний кут сектора; undefined — коло 360°. */
  angle?: number;
  /** Напрямок сектора (рад). */
  dir?: number;
  /** Амплітуда мерехтіння радіуса (частка). */
  flicker?: number;
  /** Ореол навколо джерела (ліхтарик, §7.2). */
  halo?: number;
}

let nextItemId = 1;

export class Item {
  readonly id = nextItemId++;
  /** Динамо: заряд 0..1 (§7.3.6). */
  charge = 0;
  /** Динамо в камері: не розряджається до першого підбирання (§7.3.6). */
  pristine = false;
  /** Ліхтарик: батарея, с. */
  battery = FLASHLIGHT_BATTERY;
  /** Газова лампа: газ, с. */
  fuel = GAS_LAMP_FUEL;
  /** Запальничка: бензин, с (§7.3.8). */
  lighterFuel = LIGHTER_FUEL;
  /** Ліхтарик / газова лампа / запальничка ввімкнені; шашка запалена. */
  on = false;
  /** Шашка: залишок горіння, с. */
  flareTime = FLARE_BURN_TIME;
  /** Шашка: симуляційний час запалювання (для блокування кидка, §7.3.2). */
  flareLitAt = -Infinity;
  /** Сірники: лишилося в пачці. */
  matches = MATCHBOOK_SIZE;
  /** Сірник, що горить у руці: лишилося горіти, с (0 — не горить). */
  matchTime = 0;
  /** Напрямок світла ліхтарика, що лежить на підлозі (§7.3.0). */
  floorDir = 0;
  /** Батарейка / пальне вже використані (§7.3.7). */
  used = false;

  constructor(readonly kind: ItemKind) {
    if (kind === "dynamo") this.charge = DYNAMO_START_CHARGE;
  }

  /** Вичерпаний предмет (§7.3.4.0): світла більше не дасть. Динамо не вичерпується. */
  get exhausted(): boolean {
    switch (this.kind) {
      case "flashlight":
        return this.battery <= 0;
      case "gasLamp":
        return this.fuel <= 0;
      case "flare":
        return this.flareTime <= 0;
      case "matchbook":
        return this.matches <= 0 && this.matchTime <= 0;
      case "lighter":
        return this.lighterFuel <= 0;
      case "battery":
      case "fuel":
        return this.used;
      default:
        return false;
    }
  }

  /** Заряд приладу для вибору цілі перезарядки (§7.3.7), с. */
  get reloadLevel(): number {
    return this.kind === "flashlight" ? this.battery : this.fuel;
  }

  /** Перезарядка до повної (§7.3.7). */
  refill(): void {
    if (this.kind === "flashlight") this.battery = FLASHLIGHT_BATTERY;
    else if (this.kind === "gasLamp") this.fuel = GAS_LAMP_FUEL;
  }

  /** Вмикається й вимикається Space; у рюкзаку гасне, викинутий світить далі (§7.3.0). */
  get switchable(): boolean {
    return this.kind === "flashlight" || this.kind === "gasLamp" || this.kind === "lighter";
  }

  /** Палаюча шашка: не лягає в рюкзак і не гасне (§7.3.2). */
  get isBurningFlare(): boolean {
    return this.kind === "flare" && this.on && this.flareTime > 0;
  }

  /** Чи світить предмет зараз (у руці чи на підлозі; у рюкзаку нічого не світить). */
  get emitsLight(): boolean {
    switch (this.kind) {
      case "dynamo":
        // Ліхтар у камері до першого підбирання не світить: забіг починається з чорноти (§5.4.1, §7.3.6).
        return this.charge > 0 && !this.pristine;
      case "flashlight":
        return this.on && this.battery > 0;
      case "gasLamp":
        return this.on && this.fuel > 0;
      case "flare":
        return this.isBurningFlare;
      case "matchbook":
        return this.matchTime > 0;
      case "lighter":
        return this.on && this.lighterFuel > 0;
      default:
        return false;
    }
  }

  /** Частка ресурсу 0..1 для шкали в HUD (§12.4). */
  get resourceFraction(): number {
    switch (this.kind) {
      case "dynamo":
        return this.charge;
      case "flashlight":
        return this.battery / FLASHLIGHT_BATTERY;
      case "gasLamp":
        return this.fuel / GAS_LAMP_FUEL;
      case "flare":
        return this.flareTime / FLARE_BURN_TIME;
      case "matchbook":
        return this.matches / MATCHBOOK_SIZE;
      case "lighter":
        return this.lighterFuel / LIGHTER_FUEL;
      case "battery":
      case "fuel":
        return this.used ? 0 : 1;
      default:
        return 0;
    }
  }

  /**
   * Розряд і горіння за dt (§7.3.6: динамо розряджається всюди). Повертає true, якщо сірник
   * у руці щойно догорів — тоді він падає під ноги як згорілий (§7.3.3).
   */
  update(dt: number): boolean {
    switch (this.kind) {
      case "dynamo":
        if (!this.pristine) this.charge = Math.max(0, this.charge - DYNAMO_DRAIN * dt);
        break;
      case "flashlight":
        if (this.on) {
          this.battery = Math.max(0, this.battery - dt);
          if (this.battery <= 0) this.on = false;
        }
        break;
      case "gasLamp":
        if (this.on) {
          this.fuel = Math.max(0, this.fuel - dt);
          if (this.fuel <= 0) this.on = false;
        }
        break;
      case "flare":
        if (this.on) {
          this.flareTime = Math.max(0, this.flareTime - dt);
          if (this.flareTime <= 0) this.on = false;
        }
        break;
      case "lighter":
        if (this.on) {
          this.lighterFuel = Math.max(0, this.lighterFuel - dt);
          if (this.lighterFuel <= 0) this.on = false;
        }
        break;
      case "matchbook":
        if (this.matchTime > 0) {
          this.matchTime = Math.max(0, this.matchTime - dt);
          if (this.matchTime <= 0) return true;
        }
        break;
      default:
        break;
    }
    return false;
  }

  /** Параметри світла з урахуванням множника рівня (мінімальний радіус 1.0, §7.3). */
  light(mult: number, dir: number): LightSpec | null {
    if (!this.emitsLight) return null;
    const r = (base: number) => Math.max(base * mult, LIGHT_MIN_RADIUS);
    switch (this.kind) {
      case "dynamo": {
        const base = DYNAMO_RADIUS_MIN + (DYNAMO_RADIUS_MAX - DYNAMO_RADIUS_MIN) * this.charge;
        return { radius: r(base), color: 0xfff1d6, flicker: this.charge < 0.1 ? 0.25 : 0.02 };
      }
      case "flashlight":
        return {
          radius: r(FLASHLIGHT_RADIUS),
          color: 0xf4f7ff,
          angle: FLASHLIGHT_ANGLE,
          dir,
          halo: 1.0,
          flicker: this.battery < 5 ? 0.3 : 0,
        };
      case "gasLamp":
        return { radius: r(GAS_LAMP_RADIUS), color: 0xffc98a, flicker: 0.06 };
      case "flare":
        return { radius: r(FLARE_RADIUS), color: 0xff6a5a, flicker: 0.08 };
      case "matchbook":
        return { radius: r(MATCH_RADIUS), color: 0xffb46a, flicker: 0.15 };
      case "lighter":
        return { radius: r(LIGHTER_RADIUS), color: 0xffb46a, flicker: 0.15 };
      default:
        return null;
    }
  }
}

/** Результат миттєвої активації Space (§7.3.0). */
export type ActivationResult =
  | { kind: "none" }
  | { kind: "charged" }
  | { kind: "toggled"; on: boolean }
  | { kind: "matchLit"; /** Залишок горіння кинутого сірника (0 — сірника не було). */ droppedRemaining: number }
  | { kind: "flareLit" };

/**
 * Миттєва активація предмета в руці (§7.3.0). Кидок шашки — окрема дія з утриманням (§7.3.2),
 * тому для вже палаючої шашки тут нічого не відбувається.
 */
export function activate(item: Item, simTime: number): ActivationResult {
  switch (item.kind) {
    case "dynamo":
      item.charge = Math.min(1, item.charge + DYNAMO_CHARGE_PER_PRESS);
      return { kind: "charged" };
    case "flashlight":
      if (item.battery <= 0) return { kind: "none" };
      item.on = !item.on;
      return { kind: "toggled", on: item.on };
    case "gasLamp":
      if (item.fuel <= 0) return { kind: "none" };
      item.on = !item.on;
      return { kind: "toggled", on: item.on };
    case "lighter":
      if (item.lighterFuel <= 0) return { kind: "none" };
      item.on = !item.on;
      return { kind: "toggled", on: item.on };
    case "matchbook": {
      if (item.matches <= 0) return { kind: "none" };
      const droppedRemaining = item.matchTime;
      item.matches--;
      item.matchTime = MATCH_BURN_TIME;
      return { kind: "matchLit", droppedRemaining };
    }
    case "flare":
      if (item.on || item.flareTime <= 0) return { kind: "none" };
      item.on = true;
      item.flareLitAt = simTime;
      return { kind: "flareLit" };
    default:
      return { kind: "none" };
  }
}
