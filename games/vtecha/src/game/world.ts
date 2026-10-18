// Світ одного рівня: гравець, предмети на підлозі, двері, павутина, павуки, плювки, навчання.
// Порядок кроку — §13: ввід → гравець → тригери й навчання → павуки (якщо звільнені) →
// проджектайли → перевірка смерті.

import {
  BLACKOUT_DURATION,
  DOOR_AIM_HALF_ANGLE,
  DOOR_CLOSE_CLEARANCE,
  DOOR_REACH,
  DOOR_VIEW_PENETRATION,
  EXIT_REACH,
  EXIT_BREACH_RADIUS,
  FLARE_THROW_DISTANCE,
  FLARE_THROW_SPEED,
  ITEM_MIN_SEPARATION,
  ITEM_SCATTER_RADIUS,
  ITEM_SCATTER_TIME,
  LIGHT_MULTIPLIER,
  LIGHT_MIN_RADIUS,
  NIGHTVISION_ANGLE,
  NIGHTVISION_BRIGHTNESS,
  NIGHTVISION_RADIUS,
  NIGHTVISION_RAMP,
  FLASHLIGHT_HALO_RADIUS,
  PICKUP_REACH,
  PLAYER_RADIUS,
  RELEASE_DISTANCE,
  RESPAWN_MIN_SPIDER_DISTANCE,
  RESPAWN_PLACEMENT_ATTEMPTS,
  SPIDER_RADIUS,
  SPIT_MAX_FLIGHT,
  SPIT_MISS_DECAL_TIME,
  SPIT_PROJECTILE_SPEED,
  STRUGGLE_PRESSES,
  TUTORIAL_HINT_E_DELAY,
  TUTORIAL_HINT_SPACE_DELAY,
  WALL_LAMP_RADIUS,
  WEB_STINGER_COOLDOWN,
  WEB_TEAR_PASSES,
  WEB_TILE_SLOW,
} from "../config";
import { KEY, type KeyEvent } from "../core/input";
import type { Rng } from "../core/rng";
import { cellAt, cellCenter, spiderDistances, type NavGrid } from "../ai/nav";
import { Spider, type SpiderEnv } from "../ai/spider";
import { T, type DoorState, type TileMap } from "../maze/grid";
import type { LevelData } from "../maze/level";
import { BREACH_COLOR, THEMES } from "../render/themes";
import { angleDiff } from "../vision/geom";
import { ActionSystem, type ActionEvent, type ActionHost, type FloorPickup } from "./actions";
import type { GameEvent } from "./events";
import type { Inventory } from "./inventory";
import { Item, activate } from "./items";
import { circleOverlapsTile } from "./physics";
import { Player } from "./player";

export interface FloorItem extends FloorPickup {
  x: number;
  y: number;
  /** Анімація відкочування (§7.3.4.0). */
  fromX: number;
  fromY: number;
  roll: number;
}

export type DecorKind = "match" | "handcuffs" | "spit";

export interface Decor {
  id: number;
  kind: DecorKind;
  x: number;
  y: number;
  rot: number;
  /** Плямка плювка зникає (§9.4). */
  ttl: number;
}

export interface FloorMatch {
  id: number;
  x: number;
  y: number;
  remaining: number;
}

export interface Web {
  id: number;
  cell: number;
  tx: number;
  ty: number;
  passes: number;
  torn: boolean;
  /** Спалена вогнем у руці (§10.0.2): механічно як порвана, вигляд інший. */
  burnt: boolean;
  stingerReadyAt: number;
}

export interface Spit {
  x: number;
  y: number;
  dx: number;
  dy: number;
  traveled: number;
}

export interface FlyingFlare {
  item: Item;
  x: number;
  y: number;
  dx: number;
  dy: number;
  remaining: number;
}

export interface LightSource {
  x: number;
  y: number;
  radius: number;
  color: number;
  intensity: number;
  angle?: number;
  dir?: number;
  /** Туман послаблює (не діє на пролом рівня 5, §5.5). */
  fog: boolean;
  /** Ключ кешу для статичних джерел (полігон не змінюється, доки не змінились двері). */
  cacheKey?: string;
  /** Нічний зір — монохромний (§7.3.5). */
  nightVision?: boolean;
}

export interface Tutorial {
  learned: { space: boolean; e: boolean; q: boolean };
  save(): void;
}

export type HintKey = "Q" | "Space" | "E";

export interface WorldOptions {
  level: LevelData;
  inv: Inventory;
  rng: Rng;
  hasAntidote: boolean;
  aim: { x: number; y: number } | null;
  tutorial: Tutorial;
  /** Час забігу на старті рівня: таймери спорядження наскрізні між рівнями (§7.3.4.1). */
  startTime: number;
}

let nextObjId = 1000;

export class World implements ActionHost {
  readonly level: LevelData;
  readonly map: TileMap;
  readonly nav: NavGrid;
  readonly index: number;
  readonly inv: Inventory;
  readonly rng: Rng;
  readonly player: Player;
  readonly actions: ActionSystem;
  readonly floorItems: FloorItem[] = [];
  readonly decor: Decor[] = [];
  readonly floorMatches: FloorMatch[] = [];
  readonly webs = new Map<number, Web>();
  readonly spiders: Spider[] = [];
  readonly spits: Spit[] = [];
  readonly flyingFlares: FlyingFlare[] = [];
  readonly doors: DoorState[];
  readonly exitTile: { tx: number; ty: number };
  readonly lightMult: number;
  events: GameEvent[] = [];
  /** Об'єкти, змінені власною дією гравця — пам'ять оновлює їх одразу, навіть у темряві (§7.6). */
  readonly touched = new Set<number>();
  /** Лічильник змін геометрії (двері) — для кешу полігонів статичного світла. */
  mapVersion = 0;
  time = 0;
  hasAntidote: boolean;
  spidersReleased = false;
  blackout = 0;
  exited = false;
  dead: { reason: "spider" | "web" } | null = null;
  /** Спалах по краях екрана при підбиранні протиотрути (§10.1). */
  antidoteFlash = 0;
  shake = 0;
  hint: HintKey | null = null;
  private readonly tutorial: Tutorial;
  private spaceTimer = 0;
  private eTimer = 0;
  private qActive = false;
  private playerWebKey = -1;
  private readonly lampSources: LightSource[] = [];
  private readonly breach: LightSource | null = null;

  constructor(opts: WorldOptions) {
    const level = opts.level;
    this.level = level;
    this.map = level.map;
    this.index = level.index;
    this.nav = { w: level.w, h: level.h, map: level.map };
    this.inv = opts.inv;
    this.rng = opts.rng;
    this.hasAntidote = opts.hasAntidote;
    this.tutorial = opts.tutorial;
    this.time = opts.startTime;
    this.lightMult = LIGHT_MULTIPLIER[level.index];
    this.player = new Player(level.spawn.x, level.spawn.y, level.spawn.facing, opts.aim ?? undefined);
    this.actions = new ActionSystem(this);
    this.doors = [...level.map.doors.values()];
    const ex = level.exitCell % level.w;
    const ey = Math.floor(level.exitCell / level.w);
    // Вихід (§5.5): люк/сходи/тріщина в підлозі кутової клітинки; на рівні 5 — пролом у зовнішній стіні.
    this.exitTile = level.breach ?? { tx: 2 * ex + 1, ty: 2 * ey + 1 };

    for (const spawn of level.items) {
      const item = spawn.type === "antidote" ? null : new Item(spawn.type);
      if (item?.kind === "dynamo" && level.index === 0) item.pristine = true;
      this.floorItems.push({ id: nextObjId++, item, x: spawn.x, y: spawn.y, fromX: spawn.x, fromY: spawn.y, roll: 1 });
    }
    for (const cell of level.webs) {
      const tx = 2 * (cell % level.w) + 1;
      const ty = 2 * Math.floor(cell / level.w) + 1;
      this.webs.set(this.map.key(tx, ty), { id: nextObjId++, cell, tx, ty, passes: 0, torn: false, burnt: false, stingerReadyAt: 0 });
    }
    for (const s of level.spiders) {
      const sp = new Spider(s.x, s.y, this.rng);
      sp.syncDoors(this.map);
      this.spiders.push(sp);
    }
    const theme = THEMES[level.index];
    level.lamps.forEach((l, i) => {
      if (!l.lit) return;
      this.lampSources.push({
        x: l.tx + 0.5 + l.nx * 0.75,
        y: l.ty + 0.5 + l.ny * 0.75,
        radius: Math.max(WALL_LAMP_RADIUS * this.lightMult, LIGHT_MIN_RADIUS),
        color: theme.lampColor,
        intensity: 1,
        fog: true,
        cacheKey: `lamp${i}`,
      });
    });
    if (level.breach) {
      // Денне світло падає крізь пролом у стіні — центр джерела на тайлі пролому, на межі лабіринту.
      const b = level.breach;
      const inward = b.tx === 0 ? 1 : -1;
      this.breach = { x: b.tx + 0.5 + inward * 0.3, y: b.ty + 0.5, radius: EXIT_BREACH_RADIUS, color: BREACH_COLOR, intensity: 1.15, fog: false, cacheKey: "breach" };
    }
  }

  /** Новий унікальний ідентифікатор об'єкта світу (предмети, декор, павутина). */
  newObjectId(): number {
    return nextObjId++;
  }

  emit(e: GameEvent): void {
    this.events.push(e);
  }

  // ======================= крок симуляції =======================

  step(dt: number, keyEvents: KeyEvent[], isDown: (c: string) => boolean, aimDx: number, aimDy: number): void {
    this.time += dt;
    const p = this.player;
    this.antidoteFlash = Math.max(0, this.antidoteFlash - dt);
    this.shake = Math.max(0, this.shake - dt);

    if (this.blackout > 0) {
      // Непритомність (§10.2): нічого не відбувається, окрім часу; предмети на підлозі горять далі.
      this.updateItems(dt);
      this.blackout -= dt;
      if (this.blackout <= 0) this.wake();
      return;
    }

    // 1. Ввід.
    p.aim(aimDx, aimDy);
    for (const e of keyEvents) {
      if (e.type === "up") {
        this.actions.release(e.code);
        continue;
      }
      if (e.repeat || e.code === KEY.pause) continue;
      if (p.struggle !== null) {
        this.strugglePress();
        continue;
      }
      if (p.stun) {
        p.stunPress();
        this.shake = Math.max(this.shake, 0.08);
        this.emit({ type: "struggle", count: p.stun.presses, wake: false });
        continue;
      }
      if (e.code === KEY.sprintL || e.code === KEY.sprintR) p.onShiftPress();
      if (e.code === KEY.interact) this.eTimer = 0;
      if (e.code === KEY.activate) {
        this.spaceTimer = 0;
        if (this.inv.hand?.kind === "dynamo" && !this.actions.busy) this.learn("space");
      }
      this.actions.press(e.code, isDown);
    }

    // 2. Гравець.
    const onWeb = this.webAt(p.x, p.y);
    const speedMul = onWeb && !onWeb.torn ? WEB_TILE_SLOW : 1;
    const mv = p.update(dt, isDown, (tx, ty) => !this.map.walkablePlayer(tx, ty), speedMul);
    if (mv.exhaustedNow) this.emit({ type: "exhausted" });
    if (mv.footstep) {
      const w = this.webAt(p.x, p.y);
      this.emit({ type: "step", x: p.x, y: p.y, sprint: p.sprinting, surface: w && !w.burnt ? (w.torn ? "tornWeb" : w.passes > 0 ? "wornWeb" : "web") : "floor" });
    }
    if (!this.spidersReleased && p.distanceTravelled >= RELEASE_DISTANCE) this.spidersReleased = true;
    this.actions.update(dt);
    this.updateItems(dt);
    this.updateNightVision(dt);

    // Вихід рівня — дія з утриманням E (§5.5): завершена дія ставить exited.
    if (this.exited) return;

    // 3. Тригери тайлів і навчання.
    this.updateWebTrigger();
    this.updateTutorial(dt);

    // 4–8. Павуки — лише після першого кроку гравця (§9.6).
    if (this.spidersReleased) {
      const env = this.spiderEnv();
      for (const s of this.spiders) s.update(dt, env);
      this.updateSpits(dt);
    }

    // 9. Смерть.
    for (const s of this.spiders) {
      if (Math.hypot(s.x - p.x, s.y - p.y) < PLAYER_RADIUS + SPIDER_RADIUS) {
        this.caught(p.stun !== null);
        break;
      }
    }
  }

  private spiderEnv(): SpiderEnv {
    return {
      nav: this.nav,
      map: this.map,
      rng: this.rng,
      simTime: this.time,
      player: this.player,
      doors: this.doors,
      emit: (e) => this.emit(e),
      fireSpit: (s, tx, ty) => {
        const dx = tx - s.x;
        const dy = ty - s.y;
        const d = Math.hypot(dx, dy) || 1;
        this.spits.push({ x: s.x, y: s.y, dx: dx / d, dy: dy / d, traveled: 0 });
      },
    };
  }

  // ======================= предмети =======================

  private updateItems(dt: number): void {
    const p = this.player;
    for (const item of this.inv.all()) {
      if (item.update(dt)) {
        // Сірник догорів у руці — падає під ноги сам (§7.3.3).
        this.addDecor("match", p.x + this.rng.range(-0.15, 0.15), p.y + this.rng.range(-0.15, 0.15), true);
      }
    }
    for (const fi of this.floorItems) {
      fi.item?.update(dt);
      if (fi.roll < 1) fi.roll = Math.min(1, fi.roll + dt / ITEM_SCATTER_TIME);
    }
    for (let i = this.floorMatches.length - 1; i >= 0; i--) {
      const m = this.floorMatches[i];
      m.remaining -= dt;
      if (m.remaining <= 0) {
        this.floorMatches.splice(i, 1);
        this.addDecor("match", m.x, m.y, false, m.id);
      }
    }
    for (let i = this.decor.length - 1; i >= 0; i--) {
      const d = this.decor[i];
      if (d.kind === "spit") {
        d.ttl -= dt;
        if (d.ttl <= 0) this.decor.splice(i, 1);
      }
    }
    for (let i = this.flyingFlares.length - 1; i >= 0; i--) {
      const f = this.flyingFlares[i];
      f.item.update(dt);
      let step = Math.min(FLARE_THROW_SPEED * dt, f.remaining);
      let landed = false;
      while (step > 0) {
        const s = Math.min(step, 0.1);
        const nx = f.x + f.dx * s;
        const ny = f.y + f.dy * s;
        // Стіна, зачинені двері й ґрати зупиняють шашку; отвір вона пролітає (§7.3.2).
        if (this.map.blocksProjectile(Math.floor(nx), Math.floor(ny))) {
          landed = true;
          break;
        }
        f.x = nx;
        f.y = ny;
        f.remaining -= s;
        step -= s;
      }
      if (landed || f.remaining <= 1e-6) {
        this.flyingFlares.splice(i, 1);
        this.placeOnFloor(f.item, f.x, f.y, true);
      }
    }
  }

  private addDecor(kind: DecorKind, x: number, y: number, byPlayer: boolean, id = nextObjId++): void {
    this.decor.push({ id, kind, x, y, rot: this.rng.range(0, Math.PI * 2), ttl: kind === "spit" ? SPIT_MISS_DECAL_TIME : Infinity });
    if (byPlayer) this.touched.add(id);
  }

  /** Найближче вільне місце в радіусі 0.8 (§7.3.4.0): не в стіну, не на вихід, не впритул до іншого предмета. */
  findSpot(x: number, y: number, ignore?: FloorItem): { x: number; y: number } {
    const valid = (px: number, py: number) => {
      const tx = Math.floor(px);
      const ty = Math.floor(py);
      if (!this.map.walkablePlayer(tx, ty)) return false;
      if (tx === this.exitTile.tx && ty === this.exitTile.ty) return false;
      const m = 0.12;
      for (const [ox, oy] of [
        [m, 0],
        [-m, 0],
        [0, m],
        [0, -m],
      ]) {
        if (!this.map.walkablePlayer(Math.floor(px + ox), Math.floor(py + oy))) return false;
      }
      for (const o of this.floorItems) {
        if (o === ignore) continue;
        if (Math.hypot(o.x - px, o.y - py) < ITEM_MIN_SEPARATION) return false;
      }
      return true;
    };
    if (valid(x, y)) return { x, y };
    for (let r = 0.08; r <= ITEM_SCATTER_RADIUS + 1e-9; r += 0.08) {
      const n = Math.max(8, Math.round(r * 30));
      const off = this.rng.range(0, Math.PI * 2);
      for (let k = 0; k < n; k++) {
        const a = off + (k / n) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (valid(px, py)) return { x: px, y: py };
      }
    }
    return { x, y };
  }

  placeOnFloor(item: Item, x: number, y: number, thrown = false): void {
    if (item.kind === "handcuffs") {
      // Скинуті кайданки — декор, не предмет (§11.2.1); підказку Q вивчено.
      this.addDecor("handcuffs", x, y, true);
      this.learn("q");
      this.qActive = false;
      this.emit({ type: "itemLand", x, y, rolled: false });
      return;
    }
    const spot = this.findSpot(x, y);
    const rolled = Math.hypot(spot.x - x, spot.y - y) > 1e-3;
    const fi: FloorItem = { id: nextObjId++, item, x: spot.x, y: spot.y, fromX: x, fromY: y, roll: rolled ? 0 : 1 };
    this.floorItems.push(fi);
    this.touched.add(fi.id);
    this.emit({ type: "itemLand", x: spot.x, y: spot.y, rolled: rolled || thrown });
  }

  // ======================= ActionHost =======================

  simTime(): number {
    return this.time;
  }

  findPickupTarget(): FloorItem | null {
    const p = this.player;
    let best: FloorItem | null = null;
    let bestAng = Infinity;
    let bestDist = Infinity;
    for (const fi of this.floorItems) {
      const d = Math.hypot(fi.x - p.x, fi.y - p.y);
      if (d > PICKUP_REACH) continue;
      const ang = d < 1e-3 ? 0 : Math.abs(angleDiff(Math.atan2(fi.y - p.y, fi.x - p.x), p.facing));
      if (ang < bestAng - 1e-6 || (Math.abs(ang - bestAng) <= 1e-6 && d < bestDist)) {
        best = fi;
        bestAng = ang;
        bestDist = d;
      }
    }
    return best;
  }

  private doorDistance(d: { tx: number; ty: number }): number {
    const p = this.player;
    const cx = Math.max(d.tx, Math.min(d.tx + 1, p.x));
    const cy = Math.max(d.ty, Math.min(d.ty + 1, p.y));
    return Math.hypot(p.x - cx, p.y - cy);
  }

  /** Кут від погляду до дверей чи виходу, якщо їх можна вибрати (≤ 1 тайл і конус ±60°, §5.5–5.6); інакше null. */
  private doorAim(d: { tx: number; ty: number }, reach = DOOR_REACH): number | null {
    const p = this.player;
    if (this.doorDistance(d) > reach) return null;
    const inside = Math.floor(p.x) === d.tx && Math.floor(p.y) === d.ty;
    const ang = inside ? 0 : Math.abs(angleDiff(Math.atan2(d.ty + 0.5 - p.y, d.tx + 0.5 - p.x), p.facing));
    return ang > (DOOR_AIM_HALF_ANGLE * Math.PI) / 180 ? null : ang;
  }

  findDoorTarget(): DoorState | null {
    let best: DoorState | null = null;
    let bestAng = Infinity;
    for (const d of this.doors) {
      const ang = this.doorAim(d);
      if (ang !== null && ang < bestAng) {
        best = d;
        bestAng = ang;
      }
    }
    return best;
  }

  /**
   * Інтерактивні об'єкти, з якими гравець може взаємодіяти просто зараз (§7.3.4.2): предмети в досяжності
   * й двері/завали, що відповідають умовам вибору. Розібрані завали не входять — зачинити їх неможливо.
   */
  interactables(): { items: FloorItem[]; doors: DoorState[]; exit: boolean } {
    const p = this.player;
    if (p.immobile || this.blackout > 0) return { items: [], doors: [], exit: false };
    const items = this.floorItems.filter((fi) => Math.hypot(fi.x - p.x, fi.y - p.y) <= PICKUP_REACH);
    const doors = this.doors.filter((d) => !(d.variant === "rubble" && d.open) && this.doorAim(d) !== null);
    return { items, doors, exit: this.findExitTarget() };
  }

  /** Вихід у досяжності й у конусі погляду (або гравець на ньому), §5.5. */
  findExitTarget(): boolean {
    return !this.exited && this.doorAim(this.exitTile, EXIT_REACH) !== null;
  }

  exitInReach(): boolean {
    return this.doorDistance(this.exitTile) <= EXIT_REACH + 0.35;
  }

  /** Дію виходу дотримано (§5.5): починається перехід на наступний рівень або перемога. */
  leaveLevel(): void {
    if (this.exited) return;
    this.exited = true;
    this.emit({ type: "exit", final: this.index === 4 });
  }

  pickupInReach(target: FloorPickup): boolean {
    const fi = target as FloorItem;
    if (!this.floorItems.includes(fi)) return false;
    return Math.hypot(fi.x - this.player.x, fi.y - this.player.y) <= PICKUP_REACH + 0.1;
  }

  doorInReach(door: DoorState): boolean {
    return this.doorDistance(door) <= DOOR_REACH + 0.35;
  }

  takeFromFloor(target: FloorPickup): void {
    const i = this.floorItems.indexOf(target as FloorItem);
    if (i >= 0) this.floorItems.splice(i, 1);
    this.touched.add(target.id);
  }

  consumeAntidote(target: FloorPickup): void {
    this.takeFromFloor(target);
    this.hasAntidote = true;
    this.antidoteFlash = 1.2;
    this.emit({ type: "antidote" });
  }

  dropItem(item: Item): void {
    const p = this.player;
    if (item.kind === "matchbook" && item.matchTime > 0) this.releaseMatch(item);
    if (item.kind === "flashlight") item.floorDir = p.facing;
    this.placeOnFloor(item, p.x, p.y);
  }

  releaseMatch(item: Item): void {
    const p = this.player;
    const id = nextObjId++;
    this.floorMatches.push({ id, x: p.x + this.rng.range(-0.2, 0.2), y: p.y + this.rng.range(-0.2, 0.2), remaining: item.matchTime });
    this.touched.add(id);
    item.matchTime = 0;
  }

  tryToggleDoor(door: DoorState): boolean {
    if (door.open) {
      if (door.variant === "rubble") return false; // розібраний завал не зачиняється (§5.6)
      // Прохід має бути вільний: ніхто не стоїть у самому проході, на тайлі немає предмета (декор не заважає).
      const p = this.player;
      if (this.inDoorway(door, p.x, p.y, PLAYER_RADIUS)) return false;
      for (const s of this.spiders) if (this.inDoorway(door, s.x, s.y, SPIDER_RADIUS)) return false;
      for (const fi of this.floorItems) if (Math.floor(fi.x) === door.tx && Math.floor(fi.y) === door.ty) return false;
      door.open = false;
      // Люфт (§5.6): того, хто лише заступив на край тайла, виштовхує на його бік.
      this.pushOutOfDoor(door, p, PLAYER_RADIUS);
      for (const s of this.spiders) this.pushOutOfDoor(door, s, SPIDER_RADIUS);
    } else {
      door.open = true;
    }
    this.mapVersion++;
    this.touched.add(door.id);
    this.emit({ type: "door", variant: door.variant, open: door.open, x: door.tx + 0.5, y: door.ty + 0.5 });
    return true;
  }

  /** Прохід між клітинками вертикальний (ty парний) — лінія дверей горизонтальна, і навпаки. */
  private doorAxis(door: DoorState): { along: "x" | "y"; line: number } {
    const vertical = ((door.ty % 2) + 2) % 2 === 0;
    return vertical ? { along: "y", line: door.ty + 0.5 } : { along: "x", line: door.tx + 0.5 };
  }

  /** Стоїть у самому проході: коло торкається тайла, а центр ближче за DOOR_CLOSE_CLEARANCE до лінії дверей. */
  private inDoorway(door: DoorState, x: number, y: number, r: number): boolean {
    if (!circleOverlapsTile(x, y, r, door.tx, door.ty)) return false;
    const ax = this.doorAxis(door);
    return Math.abs((ax.along === "y" ? y : x) - ax.line) < DOOR_CLOSE_CLEARANCE;
  }

  private pushOutOfDoor(door: DoorState, e: { x: number; y: number }, r: number): void {
    if (!circleOverlapsTile(e.x, e.y, r, door.tx, door.ty)) return;
    const ax = this.doorAxis(door);
    const cur = ax.along === "y" ? e.y : e.x;
    const target = ax.line + Math.sign(cur - ax.line || 1) * (0.5 + r + 0.001);
    if (ax.along === "y") e.y = target;
    else e.x = target;
  }

  throwFlare(item: Item): void {
    const p = this.player;
    this.flyingFlares.push({ item, x: p.x, y: p.y, dx: Math.cos(p.facing), dy: Math.sin(p.facing), remaining: FLARE_THROW_DISTANCE });
    this.emit({ type: "flareThrow" });
  }

  activateHand(): void {
    const hand = this.inv.hand;
    if (!hand) return;
    const res = activate(hand, this.time);
    switch (res.kind) {
      case "charged":
        this.emit({ type: "dynamoPress", charge: hand.charge });
        break;
      case "toggled":
        this.emit({ type: "toggle", kind: hand.kind, on: res.on });
        break;
      case "matchLit":
        if (res.droppedRemaining > 0) {
          const p = this.player;
          const id = nextObjId++;
          this.floorMatches.push({ id, x: p.x + Math.cos(p.facing) * 0.25, y: p.y + Math.sin(p.facing) * 0.25, remaining: res.droppedRemaining });
          this.touched.add(id);
        }
        this.emit({ type: "matchStrike" });
        break;
      case "flareLit":
        this.emit({ type: "flareIgnite" });
        break;
      default:
        break;
    }
  }

  onActionEvent(e: ActionEvent): void {
    switch (e.type) {
      case "start":
        this.emit({ type: "actionStart", action: e.action, stage: e.stage });
        break;
      case "stageDone":
        this.emit({ type: "actionStage", action: e.action, stage: e.stage });
        if (e.last && e.action === "interact") this.learn("e");
        break;
      case "cancel":
        this.emit({ type: "actionCancel" });
        break;
      case "fail":
        this.emit({ type: "actionFail", stage: e.stage });
        // Підказка Q: гравець у кайданках провалив підбирання (§11.2.1).
        if (e.stage === "pickup" && this.inv.handcuffed) this.qActive = true;
        break;
    }
  }

  // ======================= світло =======================

  /** Світло в руці гравця (з урахуванням погашення на початку дії). */
  get handLit(): boolean {
    const hand = this.inv.hand;
    return hand !== null && hand.emitsLight && !(hand.kind === "dynamo" && this.actions.suppressHandLight);
  }

  /** Відкритий вогонь у руці, що палить павутину (§10.0.2): палаючий сірник або запалена запальничка. */
  get handFlame(): boolean {
    const hand = this.inv.hand;
    if (!hand) return false;
    return (hand.kind === "matchbook" || hand.kind === "lighter") && hand.emitsLight;
  }

  private updateNightVision(dt: number): void {
    if (this.handLit) this.player.nvTime = 0;
    else this.player.nvTime += dt;
  }

  /** Усі джерела світла кадру (§7.1–7.4). */
  collectLights(): LightSource[] {
    const out: LightSource[] = [];
    const p = this.player;
    const t = this.time;
    const flick = (amp: number, seed: number) =>
      amp > 0 ? 1 + amp * (Math.sin(t * 13.1 + seed) * 0.5 + Math.sin(t * 7.3 + seed * 2.1) * 0.35 + Math.sin(t * 23.7 + seed * 0.7) * 0.15) : 1;
    const itemLight = (item: Item, x: number, y: number, dir: number, seed: number) => {
      const spec = item.light(this.lightMult, dir);
      if (!spec) return;
      const f = flick(spec.flicker ?? 0, seed);
      out.push({ x, y, radius: Math.max(spec.radius * f, LIGHT_MIN_RADIUS), color: spec.color, intensity: 1, angle: spec.angle, dir: spec.dir, fog: true });
      if (spec.halo) out.push({ x, y, radius: FLASHLIGHT_HALO_RADIUS, color: spec.color, intensity: 0.55, fog: true });
    };
    if (this.handLit) itemLight(this.inv.hand!, p.x, p.y, p.facing, 1);
    else if (this.blackout <= 0) {
      const r = NIGHTVISION_RADIUS * Math.min(1, p.nvTime / NIGHTVISION_RAMP);
      if (r > 0.02) {
        out.push({ x: p.x, y: p.y, radius: r, color: 0xffffff, intensity: NIGHTVISION_BRIGHTNESS, angle: NIGHTVISION_ANGLE, dir: p.facing, fog: false, nightVision: true });
      }
    }
    for (const fi of this.floorItems) if (fi.item) itemLight(fi.item, fi.x, fi.y, fi.item.floorDir, fi.id);
    for (const f of this.flyingFlares) itemLight(f.item, f.x, f.y, 0, 7);
    for (const m of this.floorMatches) {
      const spec = { radius: Math.max(1.6 * this.lightMult, LIGHT_MIN_RADIUS) };
      out.push({ x: m.x, y: m.y, radius: spec.radius * flick(0.15, m.id), color: 0xffb46a, intensity: 1, fog: true });
    }
    const amp = THEMES[this.index].lampFlicker;
    this.lampSources.forEach((l, i) => {
      const f = THEMES[this.index].lampKind === "mushroom" ? 1 + amp * Math.sin(t * 0.9 + i * 1.7) : flick(amp, i * 3.3);
      out.push({ ...l, radius: l.radius * f });
    });
    if (this.breach) out.push(this.breach);
    return out;
  }

  // ======================= павутина =======================

  webAt(x: number, y: number): Web | undefined {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (!this.map.inBounds(tx, ty)) return undefined;
    return this.webs.get(this.map.key(tx, ty));
  }

  private updateWebTrigger(): void {
    const p = this.player;
    const w = this.webAt(p.x, p.y);
    const key = w ? this.map.key(w.tx, w.ty) : -1;
    if (key === this.playerWebKey) return;
    // Вихід із тайла: після WEB_TEAR_PASSES проходів павутина рветься (§10.0.1).
    const prev = this.playerWebKey >= 0 ? this.webs.get(this.playerWebKey) : undefined;
    if (prev && !prev.torn && prev.passes >= WEB_TEAR_PASSES) {
      prev.torn = true;
      this.touched.add(prev.id);
      this.emit({ type: "webTear", x: prev.tx + 0.5, y: prev.ty + 0.5 });
    }
    this.playerWebKey = key;
    if (w && !w.torn && this.handFlame) {
      // Вогонь у руці: павутина згорає без тривоги й сповільнення, прохід не рахується (§10.0.2).
      w.torn = true;
      w.burnt = true;
      this.touched.add(w.id);
      this.emit({ type: "webBurn", x: w.tx + 0.5, y: w.ty + 0.5 });
      return;
    }
    if (w && !w.torn) {
      // Вхід на цілу павутину: прохід і тривога для всіх павуків, крім тих, що в HUNT (§10).
      w.passes++;
      const stinger = this.time >= w.stingerReadyAt;
      if (stinger) {
        w.stingerReadyAt = this.time + WEB_STINGER_COOLDOWN;
        this.shake = Math.max(this.shake, 0.35);
      }
      this.emit({ type: "webTrigger", stinger });
      const env = this.spiderEnv();
      for (const s of this.spiders) s.alarm(env, w.tx + 0.5, w.ty + 0.5);
    }
  }

  // ======================= плювки =======================

  private updateSpits(dt: number): void {
    const p = this.player;
    for (let i = this.spits.length - 1; i >= 0; i--) {
      const s = this.spits[i];
      let step = SPIT_PROJECTILE_SPEED * dt;
      let done = false;
      while (step > 0 && !done) {
        const d = Math.min(step, 0.1);
        const nx = s.x + s.dx * d;
        const ny = s.y + s.dy * d;
        if (this.map.blocksProjectile(Math.floor(nx), Math.floor(ny))) {
          this.addDecor("spit", s.x, s.y, false);
          this.emit({ type: "spitMiss", x: s.x, y: s.y });
          done = true;
          break;
        }
        s.x = nx;
        s.y = ny;
        s.traveled += d;
        step -= d;
        if (Math.hypot(s.x - p.x, s.y - p.y) < 0.25 + PLAYER_RADIUS && this.blackout <= 0) {
          p.hitBySpit();
          this.actions.cancel();
          this.shake = Math.max(this.shake, 0.4);
          this.emit({ type: "spitHit" });
          done = true;
          break;
        }
        if (s.traveled >= SPIT_MAX_FLIGHT) {
          this.addDecor("spit", s.x, s.y, false);
          this.emit({ type: "spitMiss", x: s.x, y: s.y });
          done = true;
        }
      }
      if (done) this.spits.splice(i, 1);
    }
  }

  // ======================= смерть і протиотрута =======================

  private caught(whileStunned: boolean): void {
    if (this.dead || this.blackout > 0) return;
    this.actions.reset();
    if (!this.hasAntidote) {
      this.dead = { reason: whileStunned ? "web" : "spider" };
      this.emit({ type: "death" });
      return;
    }
    // Втрата свідомості (§10.2): спорядження падає на місці захоплення.
    this.hasAntidote = false;
    this.blackout = BLACKOUT_DURATION;
    this.emit({ type: "blackout" });
    const p = this.player;
    p.stun = null;
    for (const item of this.inv.clear()) {
      if (item.kind === "matchbook" && item.matchTime > 0) this.releaseMatch(item);
      if (item.kind === "flashlight") item.floorDir = p.facing;
      this.placeOnFloor(item, p.x + this.rng.range(-0.1, 0.1), p.y + this.rng.range(-0.1, 0.1));
    }
    this.spits.length = 0;
  }

  /** Пробудження (§10.2–10.3): гравець на павутині, павуки далеко, завмирання знову діє. */
  private wake(): void {
    this.blackout = 0;
    const doorOpen = (tx: number, ty: number) => this.map.door(tx, ty)?.open ?? false;
    const cells = this.nav.w * this.nav.h;
    const intact = [...this.webs.values()].filter((w) => !w.torn);
    let wakeCell: number;
    let web: Web;
    if (intact.length > 0) {
      web = this.rng.pick(intact);
      wakeCell = web.cell;
      this.placeSpidersAway(wakeCell, doorOpen);
    } else {
      // Запасний варіант: павуки спершу, потім найвіддаленіша клітинка, новий павутинний тайл.
      for (const s of this.spiders) {
        const c = cellCenter(this.nav, this.rng.int(0, cells - 1));
        s.x = c.x;
        s.y = c.y;
      }
      const fields = this.spiders.map((s) => spiderDistances(this.nav, cellAt(this.nav, s.x, s.y), doorOpen));
      let best = 0;
      let bestScore = -1;
      for (let c = 0; c < cells; c++) {
        if (c === this.level.exitCell) continue;
        let score = Infinity;
        for (const f of fields) score = Math.min(score, f[c] < 0 ? 1e6 : f[c]);
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
      wakeCell = best;
      if (bestScore < RESPAWN_MIN_SPIDER_DISTANCE) this.placeSpidersAway(wakeCell, doorOpen);
      const tx = 2 * (wakeCell % this.nav.w) + 1;
      const ty = 2 * Math.floor(wakeCell / this.nav.w) + 1;
      web = { id: nextObjId++, cell: wakeCell, tx, ty, passes: 0, torn: false, burnt: false, stingerReadyAt: 0 };
      this.webs.set(this.map.key(tx, ty), web);
    }
    for (const s of this.spiders) {
      s.resetCalm();
      s.syncDoors(this.map);
    }
    const c = cellCenter(this.nav, wakeCell);
    const p = this.player;
    p.x = c.x;
    p.y = c.y;
    p.resetVitals();
    p.struggle = 0;
    p.nvTime = 0;
    p.distanceTravelled = 0;
    this.spidersReleased = false;
    this.playerWebKey = this.map.key(web.tx, web.ty);
    this.touched.add(web.id);
    this.emit({ type: "wake" });
  }

  private placeSpidersAway(wakeCell: number, doorOpen: (tx: number, ty: number) => boolean): void {
    if (this.spiders.length === 0) return;
    const dist = spiderDistances(this.nav, wakeCell, doorOpen);
    const cells = this.nav.w * this.nav.h;
    for (let attempt = 0; attempt < RESPAWN_PLACEMENT_ATTEMPTS; attempt++) {
      const chosen = this.spiders.map(() => this.rng.int(0, cells - 1));
      if (chosen.every((c) => dist[c] >= RESPAWN_MIN_SPIDER_DISTANCE)) {
        chosen.forEach((c, i) => this.moveSpiderTo(this.spiders[i], c));
        return;
      }
    }
    // Примусово — у найвіддаленіші доступні клітинки.
    const order = [...Array(cells).keys()].sort((a, b) => dist[b] - dist[a]);
    this.spiders.forEach((s, i) => this.moveSpiderTo(s, order[i]));
  }

  private moveSpiderTo(s: Spider, cell: number): void {
    const c = cellCenter(this.nav, cell);
    s.x = c.x;
    s.y = c.y;
    for (const leg of s.legs) {
      leg.footX = c.x + leg.restX;
      leg.footY = c.y + leg.restY;
      leg.t = -1;
    }
  }

  private strugglePress(): void {
    const p = this.player;
    p.struggle = (p.struggle ?? 0) + 1;
    this.shake = Math.max(this.shake, 0.12);
    this.emit({ type: "struggle", count: p.struggle, wake: true });
    if (p.struggle >= STRUGGLE_PRESSES) {
      p.struggle = null;
      // Тайл, на якому гравець звільнився, назавжди порваний (§10.4).
      const w = this.webAt(p.x, p.y);
      if (w) {
        w.torn = true;
        this.touched.add(w.id);
      }
      this.emit({ type: "freed" });
    }
  }

  // ======================= навчання (§11.2.1) =======================

  private learn(k: "space" | "e" | "q"): void {
    if (this.tutorial.learned[k]) return;
    this.tutorial.learned[k] = true;
    this.tutorial.save();
  }

  private updateTutorial(dt: number): void {
    const learned = this.tutorial.learned;
    const p = this.player;
    // Q: у кайданках залишив камеру крізь розібраний завал (рівень 1).
    if (this.index === 0 && this.inv.handcuffed && p.y >= 1) this.qActive = true;
    if (!this.inv.handcuffed) this.qActive = false;

    const hand = this.inv.hand;
    if (this.index === 0 && hand?.kind === "dynamo" && hand.charge <= 0) this.spaceTimer += dt;
    else this.spaceTimer = 0;

    const near = this.interactables();
    const hasTarget = near.items.length > 0 || near.doors.length > 0 || near.exit;
    if (this.index === 0 && hasTarget && !this.actions.busy) this.eTimer += dt;
    else if (!hasTarget) this.eTimer = 0;

    let hint: HintKey | null = null;
    if (this.qActive && !learned.q) hint = "Q";
    else if (this.index === 0 && !learned.space && this.spaceTimer >= TUTORIAL_HINT_SPACE_DELAY) hint = "Space";
    else if (this.index === 0 && !learned.e && this.eTimer >= TUTORIAL_HINT_E_DELAY) hint = "E";
    this.hint = hint;
  }

  // ======================= для рендеру й звуку =======================

  /** Прозорість тайла для світла й зору (§13). */
  opaque = (tx: number, ty: number): boolean => this.map.opaque(tx, ty);

  /** Заглиблення світла й зору в зачинені дерев'яні двері й завали — до полотна (§7.2). */
  viewPenetration = (tx: number, ty: number): number | null => {
    const d = this.map.door(tx, ty);
    return d && !d.open && d.variant !== "grate" ? DOOR_VIEW_PENETRATION : null;
  };

  /** Часткові перешкоди світла — прути ґрат (§7.2.1). */
  lightOccluders = (tx: number, ty: number) => this.map.lightOccluders(tx, ty);

  get isExitTile(): (tx: number, ty: number) => boolean {
    return (tx, ty) => tx === this.exitTile.tx && ty === this.exitTile.ty;
  }

  /** Чи є тайл павутиною для звуку й малювання. */
  tileIsHole(tx: number, ty: number): boolean {
    return this.map.get(tx, ty) === T.Hole;
  }
}
