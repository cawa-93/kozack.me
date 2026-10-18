// Павук: сприйняття (§9.1.1), навігація за власною пам'яттю про двері (§9.2), FSM (§9.3),
// плювок (§9.4) і процедурні ноги (§15), до яких прив'язані звуки кроків (§14.2).

import {
  CALM_IDLE_PAUSE,
  HUNT_CRY_COOLDOWN,
  PATH_REPLAN_THROTTLE,
  SCAN_DURATION,
  SCAN_DWELL_PER_DIRECTION,
  SEARCH_JUNCTION_SCAN,
  SEARCH_MAX_TURNS,
  SPIDER_CALM_MULT,
  SPIDER_HEARING_RANGE,
  SPIDER_HUNT_SPEED,
  SPIDER_RADIUS,
  SPIDER_REACTION_TIME,
  SPIDER_TURN_SPEED_CALM,
  SPIDER_TURN_SPEED_HUNT,
  SPIDER_VISION_ANGLE,
  SPIDER_VISION_RANGE,
  SPIT_COOLDOWN,
  SPIT_RANGE,
  SPIT_WINDUP,
} from "../config";
import type { Rng } from "../core/rng";
import type { GameEvent } from "../game/events";
import { circleFree, moveCircle } from "../game/physics";
import type { DoorState, TileMap } from "../maze/grid";
import { angleDiff } from "../vision/geom";
import { lineOfSight } from "../vision/los";
import { astar, cellAt, cellCenter, edgeTile, spiderNeighbors, type NavGrid } from "./nav";

export type SpiderState = "calm" | "hunt" | "investigate" | "scan" | "search";

export interface SpiderEnv {
  readonly nav: NavGrid;
  readonly map: TileMap;
  readonly rng: Rng;
  readonly simTime: number;
  /** moving — гравець справді змістився за цей крок (для слуху, §9.1.1). */
  readonly player: { x: number; y: number; moving: boolean };
  readonly doors: readonly DoorState[];
  emit(e: GameEvent): void;
  fireSpit(spider: Spider, targetX: number, targetY: number): void;
}

export interface Leg {
  side: -1 | 1;
  index: number;
  group: 0 | 1;
  /** Точка спокою в локальних координатах тіла (x — уперед). */
  restX: number;
  restY: number;
  footX: number;
  footY: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** Прогрес кроку 0..1; < 0 — лапа стоїть. */
  t: number;
  dur: number;
  /** Індивідуальна десинхронізація (§15: «неправильний» рух). */
  lag: number;
}

let nextSpiderId = 1;

export class Spider {
  readonly id = nextSpiderId++;
  state: SpiderState = "calm";
  facing: number;
  /** Маршрут у клітинках і індекс наступної. */
  path: number[] = [];
  pathIdx = 0;
  goalCell = -1;
  /** Точна цільова точка (LKP чи павутина); null — центр клітинки. */
  goalPoint: { x: number; y: number } | null = null;
  lkp: { x: number; y: number } | null = null;
  /** knownDoorStates (§9.2): ключ тайла → відчинені. */
  readonly known = new Map<number, boolean>();
  private replanAt = 0;
  private idle = 0;
  private scanDirs: number[] = [];
  private scanIdx = 0;
  private scanDwell = 0;
  private scanTime = 0;
  private scanLimit = SCAN_DURATION;
  private searchTurns = 0;
  private cameFrom = -1;
  windup = 0;
  private spitReadyAt = 0;
  private cryReadyAt = -Infinity;
  seesPlayer = false;
  /** Поточна швидкість (для анімації й звуку). */
  speed = 0;
  vx = 0;
  vy = 0;
  readonly legs: Leg[] = [];
  /** Лічильник опускань лап — для звуку кроків. */
  plants = 0;
  /** Висота тону крику ±15 % (§14.2). */
  readonly pitch: number;
  /** Посмикування в спокої (§15). */
  twitch = 0;
  private twitchAt = 0;
  /** Реакція після входу в HUNT (§9.3): поки > 0, павук лише розвертається до гравця. */
  reaction = 0;
  /** Клітинка, де павук востаннє чув гравця (§9.1.1). */
  private heardCell = -1;

  constructor(
    public x: number,
    public y: number,
    rng: Rng,
  ) {
    this.facing = rng.range(-Math.PI, Math.PI);
    this.pitch = rng.range(0.85, 1.15);
    this.twitchAt = rng.range(2, 6);
    for (const side of [-1, 1] as const) {
      for (let i = 0; i < 4; i++) {
        const a = side * ((28 + i * 34) * Math.PI) / 180;
        const reach = 0.62 + (i === 0 || i === 3 ? 0.08 : 0);
        const restX = Math.cos(a) * reach + 0.06;
        const restY = Math.sin(a) * reach;
        const c = Math.cos(this.facing);
        const s = Math.sin(this.facing);
        const fx = x + restX * c - restY * s;
        const fy = y + restX * s + restY * c;
        this.legs.push({
          side,
          index: i,
          group: ((i + (side > 0 ? 1 : 0)) % 2) as 0 | 1,
          restX,
          restY,
          footX: fx,
          footY: fy,
          fromX: fx,
          fromY: fy,
          toX: fx,
          toY: fy,
          t: -1,
          dur: 0.2,
          lag: rng.range(0, 0.05),
        });
      }
    }
  }

  /** Пам'ять про двері дорівнює реальному стану (старт рівня, телепортація, §9.2). */
  syncDoors(map: TileMap): void {
    this.known.clear();
    for (const d of map.doors.values()) this.known.set(map.key(d.tx, d.ty), d.open);
  }

  resetCalm(): void {
    this.state = "calm";
    this.path = [];
    this.pathIdx = 0;
    this.goalCell = -1;
    this.goalPoint = null;
    this.lkp = null;
    this.idle = 0;
    this.windup = 0;
    this.searchTurns = 0;
    this.seesPlayer = false;
  }

  private doorKnown(env: SpiderEnv) {
    return (tx: number, ty: number): boolean => {
      const k = env.map.key(tx, ty);
      const v = this.known.get(k);
      return v ?? env.map.door(tx, ty)?.open ?? false;
    };
  }

  // ---------------- сприйняття ----------------

  private canSee(env: SpiderEnv, px: number, py: number, range = SPIDER_VISION_RANGE): boolean {
    const dx = px - this.x;
    const dy = py - this.y;
    const d = Math.hypot(dx, dy);
    if (d > range) return false;
    if (d > 0.35 && Math.abs(angleDiff(Math.atan2(dy, dx), this.facing)) > SPIDER_VISION_ANGLE / 2) return false;
    return lineOfSight(this.x, this.y, px, py, (tx, ty) => env.map.opaque(tx, ty));
  }

  private perceive(env: SpiderEnv): void {
    this.seesPlayer = this.canSee(env, env.player.x, env.player.y);
    // Двері в полі зору оновлюють пам'ять (§9.2).
    for (const d of env.doors) {
      if (this.canSee(env, d.tx + 0.5, d.ty + 0.5)) this.known.set(env.map.key(d.tx, d.ty), d.open);
    }
  }

  /** Павутинний тайл скликав павуків (§10): усі, крім тих, що в HUNT. */
  alarm(env: SpiderEnv, x: number, y: number): void {
    if (this.state === "hunt") return;
    this.state = "investigate";
    this.lkp = { x, y };
    this.windup = 0;
    this.planTo(env, cellAt(env.nav, x, y), { x, y }, true);
  }

  // ---------------- крок симуляції ----------------

  update(dt: number, env: SpiderEnv): void {
    this.perceive(env);
    const t = env.simTime;

    if (this.seesPlayer) {
      if (this.state !== "hunt") {
        this.state = "hunt";
        this.searchTurns = 0;
        this.reaction = SPIDER_REACTION_TIME;
        this.windup = 0;
        if (t >= this.cryReadyAt) {
          env.emit({ type: "huntCry", spider: this.id });
          this.cryReadyAt = t + HUNT_CRY_COOLDOWN;
        }
        this.replanAt = 0;
      }
      this.lkp = { x: env.player.x, y: env.player.y };
    }

    // Слух (§9.1.1): гравець, що рухається ближче за 3 тайли з будь-якого напрямку → біжить у клітинку, де чув.
    let faceNoise = false;
    if (!this.seesPlayer && this.state !== "hunt" && env.player.moving && Math.hypot(env.player.x - this.x, env.player.y - this.y) < SPIDER_HEARING_RANGE) {
      const cell = cellAt(env.nav, env.player.x, env.player.y);
      if (cell === cellAt(env.nav, this.x, this.y)) {
        // Уже в тій клітинці — розвертається на звук (і побачить гравця, якщо той на лінії зору).
        faceNoise = true;
      } else if (this.state !== "investigate" || this.heardCell !== cell) {
        const c = cellCenter(env.nav, cell);
        if (this.planTo(env, cell, c, this.state !== "investigate")) {
          this.state = "investigate";
          this.lkp = c;
          this.heardCell = cell;
          this.windup = 0;
        }
      }
    }

    let speed = 0;
    let moveTarget: { x: number; y: number } | null = null;

    if (faceNoise) {
      this.turnToward(Math.atan2(env.player.y - this.y, env.player.x - this.x), SPIDER_TURN_SPEED_HUNT, dt);
    } else switch (this.state) {
      case "hunt": {
        if (this.windup > 0 && !this.seesPlayer) this.windup = 0; // ріг рятує завжди (§9.4)
        if (this.windup > 0) {
          // Під час windup павук не рухається (§9.4).
          this.turnToward(Math.atan2(env.player.y - this.y, env.player.x - this.x), SPIDER_TURN_SPEED_HUNT, dt);
          this.windup -= dt;
          if (this.windup <= 0) {
            env.fireSpit(this, env.player.x, env.player.y);
            env.emit({ type: "spitFire", spider: this.id });
            this.spitReadyAt = t + SPIT_COOLDOWN;
          }
          break;
        }
        if (!this.seesPlayer) {
          this.reaction = 0;
          this.state = "investigate";
          this.planTo(env, cellAt(env.nav, this.lkp!.x, this.lkp!.y), this.lkp, true);
          break;
        }
        if (this.reaction > 0) {
          // Пів секунди між криком і першою дією — вікно для реакції гравця (§9.3).
          this.turnToward(Math.atan2(env.player.y - this.y, env.player.x - this.x), SPIDER_TURN_SPEED_HUNT, dt);
          this.reaction -= dt;
          break;
        }
        const d = Math.hypot(env.player.x - this.x, env.player.y - this.y);
        if (
          d <= SPIT_RANGE &&
          t >= this.spitReadyAt &&
          lineOfSight(this.x, this.y, env.player.x, env.player.y, (tx, ty) => env.map.blocksProjectile(tx, ty))
        ) {
          this.windup = SPIT_WINDUP;
          env.emit({ type: "spitWindup", spider: this.id });
          break;
        }
        speed = SPIDER_HUNT_SPEED;
        if (this.segmentClear(env, env.player.x, env.player.y)) {
          moveTarget = env.player;
          this.path = [];
        } else {
          if (t >= this.replanAt || this.path.length === 0) {
            this.planTo(env, cellAt(env.nav, env.player.x, env.player.y), env.player, false);
          }
          moveTarget = this.followPath(env);
        }
        break;
      }
      case "investigate": {
        speed = SPIDER_HUNT_SPEED;
        moveTarget = this.followPath(env);
        if (!moveTarget) this.enterScan(env, SCAN_DURATION);
        break;
      }
      case "scan": {
        this.updateScan(env, dt);
        break;
      }
      case "search": {
        speed = SPIDER_HUNT_SPEED;
        moveTarget = this.followPath(env);
        if (!moveTarget) {
          this.searchTurns++;
          if (this.searchTurns >= SEARCH_MAX_TURNS) {
            this.resetCalm();
          } else {
            this.enterScan(env, SEARCH_JUNCTION_SCAN);
          }
        }
        break;
      }
      case "calm": {
        speed = SPIDER_HUNT_SPEED * SPIDER_CALM_MULT;
        if (this.idle > 0) {
          this.idle -= dt;
          speed = 0;
          break;
        }
        moveTarget = this.followPath(env);
        if (!moveTarget) {
          if (this.path.length > 0) {
            this.path = [];
            this.idle = env.rng.range(CALM_IDLE_PAUSE[0], CALM_IDLE_PAUSE[1]);
          } else {
            const goal = env.rng.int(0, env.nav.w * env.nav.h - 1);
            this.planTo(env, goal, null, true);
          }
        }
        break;
      }
    }

    // Рух.
    const px = this.x;
    const py = this.y;
    if (moveTarget && speed > 0) {
      const dx = moveTarget.x - this.x;
      const dy = moveTarget.y - this.y;
      const d = Math.hypot(dx, dy);
      const turnSpeed = this.state === "calm" ? SPIDER_TURN_SPEED_CALM : SPIDER_TURN_SPEED_HUNT;
      if (d > 1e-4) {
        this.turnToward(Math.atan2(dy, dx), turnSpeed, dt);
        const step = Math.min(d, speed * dt);
        const res = moveCircle(this.x, this.y, (dx / d) * step, (dy / d) * step, SPIDER_RADIUS, (tx, ty) => !env.map.walkableSpider(tx, ty));
        this.x = res.x;
        this.y = res.y;
      }
    }
    this.vx = (this.x - px) / dt;
    this.vy = (this.y - py) / dt;
    this.speed = Math.hypot(this.vx, this.vy);

    // Посмикування в спокої (§15).
    this.twitch = Math.max(0, this.twitch - dt);
    if (this.state === "calm") {
      this.twitchAt -= dt;
      if (this.twitchAt <= 0) {
        this.twitch = 0.1;
        this.twitchAt = env.rng.range(2, 6);
      }
    }
    this.updateLegs(dt);
  }

  private turnToward(target: number, degPerSec: number, dt: number): void {
    const diff = angleDiff(target, this.facing);
    const max = ((degPerSec * Math.PI) / 180) * dt;
    this.facing += Math.max(-max, Math.min(max, diff));
  }

  /** Чи може павук пройти навпростець до точки (для гонитви в межах видимості й string-pulling). */
  private segmentClear(env: SpiderEnv, x: number, y: number): boolean {
    const dx = x - this.x;
    const dy = y - this.y;
    const d = Math.hypot(dx, dy);
    const n = Math.ceil(d / 0.2);
    const blocked = (tx: number, ty: number) => !env.map.walkableSpider(tx, ty);
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      if (!circleFree(this.x + dx * f, this.y + dy * f, SPIDER_RADIUS * 0.95, blocked)) return false;
    }
    return true;
  }

  // ---------------- маршрути ----------------

  /** Прокладає маршрут; false — якщо перерахунок ще заблоковано throttle (§9.2). */
  private planTo(env: SpiderEnv, goal: number, point: { x: number; y: number } | null, force: boolean): boolean {
    if (!force && env.simTime < this.replanAt) return false;
    this.replanAt = env.simTime + PATH_REPLAN_THROTTLE;
    const from = cellAt(env.nav, this.x, this.y);
    const path = astar(env.nav, from, goal, this.doorKnown(env));
    this.goalCell = goal;
    this.goalPoint = point ? { x: point.x, y: point.y } : null;
    if (!path) {
      this.path = [];
      this.pathIdx = 0;
      return true;
    }
    this.path = path;
    this.pathIdx = path.length > 1 ? 1 : 0;
    return true;
  }

  /** Наступна точка маршруту або null, якщо маршрут пройдено. */
  private followPath(env: SpiderEnv): { x: number; y: number } | null {
    const nav = env.nav;
    if (this.path.length === 0) return null;
    for (let guard = 0; guard < 8; guard++) {
      if (this.pathIdx >= this.path.length) {
        // Кінцева точка — точна ціль (LKP), якщо вона є.
        const gp = this.goalPoint;
        if (gp && Math.hypot(gp.x - this.x, gp.y - this.y) > 0.2 && this.segmentClear(env, gp.x, gp.y)) return gp;
        this.path = this.state === "calm" ? this.path : [];
        return null;
      }
      const cell = this.path[this.pathIdx];
      const isLast = this.pathIdx === this.path.length - 1;
      // Фізично перекрито: наступне ребро — зачинені двері, а павук уважав їх відчиненими (§9.2).
      if (this.pathIdx > 0) {
        const prev = this.path[this.pathIdx - 1];
        const { tx, ty } = edgeTile(nav, prev, cell);
        const door = env.map.door(tx, ty);
        if (door && !door.open && Math.hypot(tx + 0.5 - this.x, ty + 0.5 - this.y) < 1.05) {
          this.known.set(env.map.key(tx, ty), false);
          this.planTo(env, this.goalCell, this.goalPoint, true);
          if (this.path.length === 0) return null;
          continue;
        }
      }
      const c = cellCenter(nav, cell);
      const target = isLast && this.goalPoint && cellAt(nav, this.goalPoint.x, this.goalPoint.y) === cell ? this.goalPoint : c;
      if (Math.hypot(target.x - this.x, target.y - this.y) < 0.12) {
        this.cameFrom = this.pathIdx > 0 ? this.path[this.pathIdx - 1] : this.cameFrom;
        this.pathIdx++;
        continue;
      }
      // String-pulling: зрізати кут, якщо наступна точка видна навпростець.
      if (this.pathIdx + 1 < this.path.length) {
        const n2 = cellCenter(nav, this.path[this.pathIdx + 1]);
        if (this.segmentClear(env, n2.x, n2.y)) {
          this.cameFrom = cell;
          this.pathIdx++;
          continue;
        }
      }
      return target;
    }
    // Ліміт кроків за тік вичерпано — маршрут не пройдено, рухаємося до поточної точки.
    return this.pathIdx < this.path.length ? cellCenter(nav, this.path[this.pathIdx]) : null;
  }

  // ---------------- SCAN / SEARCH ----------------

  private enterScan(env: SpiderEnv, limit: number): void {
    const nav = env.nav;
    const cell = cellAt(nav, this.x, this.y);
    const here = cellCenter(nav, cell);
    let nbs = spiderNeighbors(nav, cell, this.doorKnown(env));
    const forward = nbs.filter((n) => n !== this.cameFrom);
    if (forward.length > 0) nbs = forward;
    this.scanDirs = nbs.map((n) => {
      const c = cellCenter(nav, n);
      return Math.atan2(c.y - here.y, c.x - here.x);
    });
    this.scanIdx = 0;
    this.scanDwell = 0;
    this.scanTime = 0;
    this.scanLimit = limit;
    this.state = "scan";
    this.path = [];
  }

  private updateScan(env: SpiderEnv, dt: number): void {
    this.scanTime += dt;
    if (this.scanDirs.length > 0 && this.scanIdx < this.scanDirs.length) {
      const target = this.scanDirs[this.scanIdx];
      this.turnToward(target, SPIDER_TURN_SPEED_HUNT, dt);
      if (Math.abs(angleDiff(target, this.facing)) < 0.05) {
        this.scanDwell += dt;
        if (this.scanDwell >= SCAN_DWELL_PER_DIRECTION) {
          this.scanIdx++;
          this.scanDwell = 0;
        }
      }
    }
    if (this.scanTime >= this.scanLimit || this.scanIdx >= this.scanDirs.length) this.enterSearch(env);
  }

  private enterSearch(env: SpiderEnv): void {
    const nav = env.nav;
    const known = this.doorKnown(env);
    const start = cellAt(nav, this.x, this.y);
    let options = spiderNeighbors(nav, start, known);
    const forward = options.filter((n) => n !== this.cameFrom);
    if (forward.length > 0) options = forward;
    if (options.length === 0) {
      this.resetCalm();
      return;
    }
    // Біжить коридором до повороту чи перехрестя (§9.3 SEARCH).
    let prev = start;
    let cur = env.rng.pick(options);
    const path = [start, cur];
    for (let guard = 0; guard < 64; guard++) {
      const nbs = spiderNeighbors(nav, cur, known).filter((n) => n !== prev);
      if (nbs.length !== 1) break;
      const next = nbs[0];
      // Поворот: напрямок змінився.
      if (next - cur !== cur - prev) break;
      prev = cur;
      cur = next;
      path.push(cur);
    }
    this.state = "search";
    this.path = path;
    this.pathIdx = 1;
    this.goalCell = cur;
    this.goalPoint = null;
  }

  // ---------------- ноги ----------------

  private updateLegs(dt: number): void {
    const c = Math.cos(this.facing);
    const s = Math.sin(this.facing);
    const sp = this.speed;
    const lead = Math.min(0.22, sp * 0.06);
    const vx = sp > 1e-3 ? this.vx / sp : 0;
    const vy = sp > 1e-3 ? this.vy / sp : 0;
    const threshold = sp > 2 ? 0.3 : 0.2;
    const groupStepping = [false, false];
    for (const leg of this.legs) if (leg.t >= 0) groupStepping[leg.group] = true;
    for (const leg of this.legs) {
      const ix = this.x + leg.restX * c - leg.restY * s + vx * lead;
      const iy = this.y + leg.restX * s + leg.restY * c + vy * lead;
      if (leg.t >= 0) {
        leg.t += dt / leg.dur;
        if (leg.t >= 1) {
          leg.t = -1;
          leg.footX = leg.toX;
          leg.footY = leg.toY;
          this.plants++;
        } else {
          const e = leg.t * leg.t * (3 - 2 * leg.t);
          leg.footX = leg.fromX + (leg.toX - leg.fromX) * e;
          leg.footY = leg.fromY + (leg.toY - leg.fromY) * e;
        }
        continue;
      }
      const d = Math.hypot(ix - leg.footX, iy - leg.footY);
      const other = groupStepping[1 - leg.group];
      if (d > threshold && (!other || d > threshold * 1.8)) {
        leg.t = 0;
        leg.fromX = leg.footX;
        leg.fromY = leg.footY;
        leg.toX = ix + vx * lead * 0.6;
        leg.toY = iy + vy * lead * 0.6;
        leg.dur = Math.max(0.08, Math.min(0.24, 0.26 - sp * 0.035)) + leg.lag;
        groupStepping[leg.group] = true;
      }
    }
  }
}
