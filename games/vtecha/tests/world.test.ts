import { describe, expect, it } from "vitest";
import { KEY, type KeyEvent } from "../src/core/input";
import { Rng } from "../src/core/rng";
import { Inventory } from "../src/game/inventory";
import { Item } from "../src/game/items";
import { Run } from "../src/game/run";
import { World } from "../src/game/world";
import { generateLevel } from "../src/maze/generate";
import { circleFree } from "../src/game/physics";
import { SPIDER_RADIUS } from "../src/config";
import { T } from "../src/maze/grid";

const DT = 1 / 60;

class Keys {
  down = new Set<string>();
  queue: KeyEvent[] = [];
  press(code: string) {
    this.down.add(code);
    this.queue.push({ type: "down", code, repeat: false });
  }
  release(code: string) {
    this.down.delete(code);
    this.queue.push({ type: "up", code, repeat: false });
  }
  drain() {
    const q = this.queue;
    this.queue = [];
    return q;
  }
  isDown = (c: string) => this.down.has(c);
}

function stepRun(run: Run, keys: Keys, seconds: number, aim = { dx: 0, dy: 0 }) {
  for (let i = 0; i < Math.round(seconds / DT); i++) run.step(DT, keys.drain(), keys.isDown, aim.dx, aim.dy);
}

const tutorial = () => ({ space: false, e: false, q: false });

describe("світ рівня 1: стартова камера (§5.4, §11.2.1)", () => {
  it("кайданки → Q → підібрати динамо-ліхтар → він світить", () => {
    const flags = tutorial();
    const run = new Run(12345, flags);
    const w = run.world;
    const keys = new Keys();
    expect(w.inv.handcuffed).toBe(true);
    // Динамо лежить у камері; повернемося до нього й спробуємо підібрати.
    const dyn = w.floorItems.find((f) => f.item?.kind === "dynamo")!;
    w.player.x = dyn.x + 0.3;
    w.player.y = dyn.y;
    w.player.aimX = -2;
    w.player.aimY = 0;
    w.player.aim(0, 0);
    keys.press(KEY.interact);
    stepRun(run, keys, 1.1);
    keys.release(KEY.interact);
    expect(w.inv.handcuffed).toBe(true);
    expect(w.hint).toBe("Q"); // провал у кайданках → підказка Q
    keys.press(KEY.drop);
    stepRun(run, keys, 1.1);
    keys.release(KEY.drop);
    expect(w.inv.hand).toBeNull();
    expect(flags.q).toBe(true);
    expect(w.decor.some((d) => d.kind === "handcuffs")).toBe(true);
    // Ліхтар не розряджався до першого підбирання.
    expect(dyn.item!.charge).toBeCloseTo(0.5);
    keys.press(KEY.interact);
    stepRun(run, keys, 1.1);
    keys.release(KEY.interact);
    expect(w.inv.hand?.kind).toBe("dynamo");
    expect(w.handLit).toBe(true);
    expect(flags.e).toBe(true);
    // Стартові 50 % гаснуть за 4 с (DYNAMO_DRAIN = 0.125, §7.3.6).
    stepRun(run, keys, 3.5);
    expect(w.inv.hand!.charge).toBeGreaterThan(0);
    stepRun(run, keys, 1.0);
    expect(w.inv.hand!.charge).toBe(0);
    expect(w.handLit).toBe(false);
    keys.press(KEY.activate);
    stepRun(run, keys, DT);
    expect(w.handLit).toBe(true);
    expect(flags.space).toBe(true);
  });

  it("підсвічування інтерактивних об'єктів у досяжності (§7.3.4.2)", () => {
    const run = new Run(4242, tutorial());
    const w = run.world;
    const dyn = w.floorItems.find((f) => f.item?.kind === "dynamo")!;
    const rubble = w.doors.find((d) => d.isCameraRubble)!;
    // Далеко від усього — нічого не підсвічено.
    w.player.x = rubble.tx + 1.5;
    w.player.y = -2.5;
    expect(w.interactables().items).toEqual([]);
    // Предмет у досяжності 0.6 — підсвічено навіть у темряві (у кайданках, без світла).
    w.player.x = dyn.x + 0.4;
    w.player.y = dyn.y;
    expect(w.interactables().items).toEqual([dyn]);
    // Завал: лише коли поруч і в конусі погляду.
    w.player.x = rubble.tx + 0.5;
    w.player.y = -0.6;
    w.player.aimX = 0;
    w.player.aimY = -2;
    w.player.aim(0, 0);
    expect(w.interactables().doors).toEqual([]);
    w.player.aimY = 2;
    w.player.aim(0, 0);
    expect(w.interactables().doors).toEqual([rubble]);
    // Ціль E — завал (у кайданках предмет не підібрати, тож E діє на двері, §5.6).
    expect(w.actions.resolveInteract().door).toBe(rubble);
    // Розібраний завал більше не підсвічується.
    rubble.open = true;
    expect(w.interactables().doors).toEqual([]);
  });

  it("завал камери розбирається E і відкриває прохід", () => {
    const run = new Run(777, tutorial());
    const w = run.world;
    const keys = new Keys();
    const rubble = w.doors.find((d) => d.isCameraRubble)!;
    w.player.x = rubble.tx + 0.5;
    w.player.y = -0.6;
    w.player.aimX = 0;
    w.player.aimY = 2;
    w.player.aim(0, 0);
    keys.press(KEY.interact);
    stepRun(run, keys, 1.1);
    keys.release(KEY.interact);
    expect(rubble.open).toBe(true);
    // Вийти в лабіринт — рух униз.
    keys.press(KEY.down);
    stepRun(run, keys, 0.8);
    expect(w.player.y).toBeGreaterThan(1);
  });
});

describe("вихід рівня — дія (§5.5)", () => {
  it("ступити на вихід недостатньо; E 1.0 с — перехід; на рівні 5 — пролом і перемога", () => {
    for (const lvl of [1, 4]) {
      const run = new Run(99 + lvl, tutorial());
      run.inv.hand = null;
      run.debugJump(lvl);
      const w = run.world;
      w.player.x = w.exitTile.tx + 0.5;
      w.player.y = w.exitTile.ty + 0.5;
      const keys = new Keys();
      stepRun(run, keys, 0.5);
      expect(w.exited).toBe(false);
      expect(run.state).toBe("playing");
      expect(w.interactables().exit).toBe(true);
      keys.press(KEY.interact);
      stepRun(run, keys, 0.8);
      expect(w.exited).toBe(false);
      stepRun(run, keys, 0.3);
      expect(w.exited).toBe(true);
      expect(run.state).toBe(lvl === 4 ? "won" : "transition");
      if (lvl === 4) expect(w.map.get(w.exitTile.tx, w.exitTile.ty)).toBe(T.Breach);
    }
  });
});

describe("павуки (§9)", () => {
  function levelWorld(levelIndex: number, seed: number) {
    const level = generateLevel(seed, levelIndex, 0);
    const inv = new Inventory();
    const w = new World({
      level,
      inv,
      rng: new Rng(seed),
      hasAntidote: false,
      aim: null,
      tutorial: { learned: tutorial(), save() {} },
      startTime: 0,
    });
    return w;
  }

  it("павуки заморожені до першого кроку гравця (§9.6)", () => {
    const w = levelWorld(3, 99);
    const before = w.spiders.map((s) => [s.x, s.y]);
    for (let i = 0; i < 600; i++) w.step(DT, [], () => false, 0, 0);
    expect(w.spiders.map((s) => [s.x, s.y])).toEqual(before);
    expect(w.spidersReleased).toBe(false);
  });

  it("блукання 60 с: павуки рухаються й ніколи не застрягають у стінах", () => {
    for (const seed of [1, 2, 3]) {
      const w = levelWorld(4, seed);
      w.spidersReleased = true;
      // Гравець стоїть у стартовій клітинці; щоб його не зловили, робимо його «невидимим» далеко.
      const start = w.spiders.map((s) => [s.x, s.y]);
      let moved = false;
      for (let i = 0; i < 3600; i++) {
        w.player.x = -100;
        w.player.y = -100;
        w.step(DT, [], () => false, 0, 0);
        for (const s of w.spiders) {
          expect(circleFree(s.x, s.y, SPIDER_RADIUS * 0.9, (tx, ty) => !w.map.walkableSpider(tx, ty))).toBe(true);
        }
      }
      w.spiders.forEach((s, i) => {
        if (Math.hypot(s.x - start[i][0], s.y - start[i][1]) > 2) moved = true;
      });
      expect(moved).toBe(true);
    }
  });

  it("павук, що бачить гравця, полює, кричить і наздоганяє того, хто стоїть", () => {
    let caught = 0;
    for (const seed of [11, 12, 13, 14]) {
      const w = levelWorld(2, seed);
      w.spidersReleased = true;
      const s = w.spiders[0];
      // Гравець у сусідній відкритій клітинці перед павуком.
      w.player.x = s.x;
      w.player.y = s.y;
      // Знайти напрям, куди можна відступити на 2 тайли.
      for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
        const tx = Math.floor(s.x + dx / 2);
        const ty = Math.floor(s.y + dy / 2);
        if (w.map.walkablePlayer(tx, ty) && w.map.walkablePlayer(Math.floor(s.x + dx), Math.floor(s.y + dy))) {
          w.player.x = s.x + dx;
          w.player.y = s.y + dy;
          s.facing = Math.atan2(dy, dx);
          break;
        }
      }
      if (w.player.x === s.x && w.player.y === s.y) continue;
      for (let i = 0; i < 600 && !w.dead; i++) w.step(DT, [], () => false, 0, 0);
      expect(w.events.some((e) => e.type === "huntCry")).toBe(true);
      if (w.dead) caught++;
    }
    expect(caught).toBeGreaterThan(0);
  });

  it("павутина: кожен із двох проходів скликає павуків, рветься після другого (§10.0.1)", () => {
    const w = levelWorld(3, 5);
    w.spidersReleased = true;
    const web = [...w.webs.values()][0];
    const triggers = () => w.events.filter((e) => e.type === "webTrigger").length;
    // Прохід 1: зверху вниз крізь тайл павутини.
    w.player.x = web.tx + 0.5;
    w.player.y = web.ty - 0.6;
    const keys = new Keys();
    keys.press(KEY.down);
    for (let i = 0; i < 90; i++) w.step(DT, keys.drain(), keys.isDown, 0, 0);
    expect(triggers()).toBe(1);
    expect(w.spiders.every((s) => s.state === "investigate" || s.state === "hunt")).toBe(true);
    for (let i = 0; i < 60; i++) w.step(DT, keys.drain(), keys.isDown, 0, 0);
    expect(Math.floor(w.player.y)).not.toBe(web.ty);
    expect(web.torn).toBe(false); // провисла, але ціла
    expect(web.passes).toBe(1);
    // Прохід 2: назад.
    w.player.x = web.tx + 0.5;
    w.player.y = web.ty + 1.6;
    keys.release(KEY.down);
    keys.press(KEY.up);
    for (let i = 0; i < 150; i++) w.step(DT, keys.drain(), keys.isDown, 0, 0);
    expect(Math.floor(w.player.y)).toBeLessThan(web.ty);
    expect(triggers()).toBe(2);
    expect(web.torn).toBe(true);
    // Прохід 3: порвана павутина мовчить.
    keys.release(KEY.up);
    keys.press(KEY.down);
    for (let i = 0; i < 150; i++) w.step(DT, keys.drain(), keys.isDown, 0, 0);
    expect(triggers()).toBe(2);
  });

  it("протиотрута: замість смерті — непритомність і пробудження далеко від павуків", () => {
    const w = levelWorld(4, 21);
    w.hasAntidote = true;
    w.inv.hand = new Item("gasLamp");
    w.spidersReleased = true;
    const s = w.spiders[0];
    w.player.x = s.x + 0.3;
    w.player.y = s.y;
    w.step(DT, [], () => false, 0, 0);
    expect(w.dead).toBeNull();
    expect(w.blackout).toBeGreaterThan(0);
    expect(w.inv.hand).toBeNull();
    expect(w.floorItems.some((f) => f.item?.kind === "gasLamp")).toBe(true);
    for (let i = 0; i < 300; i++) w.step(DT, [], () => false, 0, 0);
    expect(w.blackout).toBe(0);
    expect(w.player.struggle).toBe(0);
    expect(w.spidersReleased).toBe(false);
    const keys = new Keys();
    for (let k = 0; k < 5; k++) {
      keys.press(KEY.interact);
      keys.release(KEY.interact);
      w.step(DT, keys.drain(), keys.isDown, 0, 0);
    }
    expect(w.player.struggle).toBeNull();
    expect(w.webAt(w.player.x, w.player.y)?.torn).toBe(true);
  });
});

describe("плейтест-коригування (§5.6, §9.3, §8)", () => {
  function levelWorld(levelIndex: number, seed: number) {
    return new World({
      level: generateLevel(seed, levelIndex, 0),
      inv: new Inventory(),
      rng: new Rng(seed),
      hasAntidote: false,
      aim: null,
      tutorial: { learned: tutorial(), save() {} },
      startTime: 0,
    });
  }

  it("двері: підійшов упритул, відчинив і зачинив, не рушивши з місця; у самому проході — провал", () => {
    const w = levelWorld(1, 8);
    const door = w.doors.find((d) => !d.isCameraRubble)!;
    const vertical = door.ty % 2 === 0; // прохід уздовж y
    // Гравець упирається в зачинені двері з боку меншої координати.
    const keys = new Keys();
    const toward = vertical ? KEY.down : KEY.right;
    if (vertical) {
      w.player.x = door.tx + 0.5;
      w.player.y = door.ty - 0.9;
      w.player.aimX = 0;
      w.player.aimY = 2;
    } else {
      w.player.x = door.tx - 0.9;
      w.player.y = door.ty + 0.5;
      w.player.aimX = 2;
      w.player.aimY = 0;
    }
    w.player.aim(0, 0);
    keys.press(toward);
    for (let i = 0; i < 40; i++) w.step(DT, keys.drain(), keys.isDown, 0, 0);
    keys.release(toward);
    w.step(DT, keys.drain(), keys.isDown, 0, 0);
    const pressed = { x: w.player.x, y: w.player.y };
    // Відчинити.
    keys.press(KEY.interact);
    for (let i = 0; i < 66; i++) w.step(DT, keys.drain(), keys.isDown, 0, 0);
    keys.release(KEY.interact);
    w.step(DT, keys.drain(), keys.isDown, 0, 0);
    expect(door.open).toBe(true);
    // Точний сценарій бага: зачинити з того самого місця, де гравець упирався у двері.
    expect(w.player.x).toBeCloseTo(pressed.x);
    expect(w.player.y).toBeCloseTo(pressed.y);
    expect(w.tryToggleDoor(door)).toBe(true);
    expect(door.open).toBe(false);
    door.open = true;
    // Заступити на край тайла дверей (люфт) і зачинити, не рухаючись далі.
    if (vertical) w.player.y = door.ty + 0.05;
    else w.player.x = door.tx + 0.05;
    keys.press(KEY.interact);
    for (let i = 0; i < 66; i++) w.step(DT, keys.drain(), keys.isDown, 0, 0);
    keys.release(KEY.interact);
    w.step(DT, keys.drain(), keys.isDown, 0, 0);
    expect(door.open).toBe(false);
    // Гравця виштовхнуло з тайла дверей на його бік.
    expect(circleFree(w.player.x, w.player.y, 0.33, (tx, ty) => !w.map.walkablePlayer(tx, ty))).toBe(true);
    expect(vertical ? w.player.y < door.ty : w.player.x < door.tx).toBe(true);
    // Стоячи прямо в проході, зачинити не можна.
    door.open = true;
    w.player.x = door.tx + 0.5;
    w.player.y = door.ty + 0.5;
    w.player.aimX = vertical ? 0 : 2;
    w.player.aimY = vertical ? 2 : 0;
    w.player.aim(0, 0);
    expect(w.tryToggleDoor(door)).toBe(false);
    expect(door.open).toBe(true);
  });

  it("павук після входу в HUNT 0.5 с не діє (реакція), потім плює з ≤ 2.25 тайла", () => {
    for (const seed of [11, 12, 13, 14, 15]) {
      const w = levelWorld(2, seed);
      w.spidersReleased = true;
      const s = w.spiders[0];
      let placed = false;
      for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
        if (w.map.walkablePlayer(Math.floor(s.x + dx / 2), Math.floor(s.y + dy / 2)) && w.map.walkablePlayer(Math.floor(s.x + dx), Math.floor(s.y + dy))) {
          w.player.x = s.x + dx;
          w.player.y = s.y + dy;
          s.facing = Math.atan2(dy, dx);
          placed = true;
          break;
        }
      }
      if (!placed) continue;
      const sx = s.x;
      const sy = s.y;
      for (let i = 0; i < 27; i++) w.step(DT, [], () => false, 0, 0); // 0.45 с
      expect(s.state).toBe("hunt");
      expect(w.events.some((e) => e.type === "huntCry")).toBe(true);
      expect(w.events.some((e) => e.type === "spitWindup")).toBe(false);
      expect(Math.hypot(s.x - sx, s.y - sy)).toBeLessThan(1e-6);
      for (let i = 0; i < 30; i++) w.step(DT, [], () => false, 0, 0);
      expect(w.events.some((e) => e.type === "spitWindup")).toBe(true);
      return;
    }
    throw new Error("не знайшлося місця для тесту");
  });

  it("знерухомлення плювком — 1.0 с, натискання скорочують до 0.5 с (§8)", () => {
    const w = levelWorld(2, 3);
    w.player.hitBySpit();
    expect(w.player.stun!.duration).toBeCloseTo(1.0);
    for (let k = 0; k < 10; k++) w.player.stunPress();
    expect(w.player.stun!.duration).toBeCloseTo(0.5);
  });
});

describe("слух павука (§9.1.1)", () => {
  function setup(seed: number) {
    const w = new World({
      level: generateLevel(seed, 2, 0),
      inv: new Inventory(),
      rng: new Rng(seed),
      hasAntidote: false,
      aim: null,
      tutorial: { learned: tutorial(), save() {} },
      startTime: 0,
    });
    w.spidersReleased = true;
    return w;
  }

  it("гравець, що стоїть, нечутний; що рухається ближче за 3 тайли — павук біжить у його клітинку", () => {
    const place = (w: World, dist: number) => {
      const s = w.spiders[0];
      s.facing = Math.PI; // павук дивиться ліворуч, гравець праворуч — не бачить
      w.player.x = s.x + dist;
      w.player.y = s.y;
      return s;
    };
    // Стоїть упритул за спиною — нечутний.
    const w0 = setup(31);
    const s0 = place(w0, 2);
    for (let i = 0; i < 30; i++) w0.step(DT, [], () => false, 0, 0);
    expect(s0.state).toBe("calm");
    // Рухається — почутий.
    const w = setup(31);
    const s = place(w, 2);
    const keys = new Keys();
    keys.press(KEY.up);
    w.step(DT, keys.drain(), keys.isDown, 0, 0);
    expect(w.player.moving).toBe(true);
    expect(s.seesPlayer).toBe(false);
    expect(s.state).toBe("investigate");
    const playerCell = Math.floor((w.player.y - 1) / 2) * w.nav.w + Math.floor((w.player.x - 1) / 2);
    expect(s.goalCell).toBe(playerCell);
    // Рухається, але далі за 3 тайли — не чує.
    const w2 = setup(31);
    const s2 = place(w2, 3.5);
    const k2 = new Keys();
    k2.press(KEY.up);
    w2.step(DT, k2.drain(), k2.isDown, 0, 0);
    expect(s2.state).toBe("calm");
  });

  it("гравець у тій самій клітинці за спиною — павук розвертається й полює", () => {
    for (const seed of [32, 33, 34, 35, 36]) {
      const w = setup(seed);
      const s = w.spiders[0];
      // Прохід праворуч чи вниз від центру клітинки належить тій самій клітинці.
      const dir = w.map.walkablePlayer(Math.floor(s.x + 1), Math.floor(s.y)) ? [1, 0] : w.map.walkablePlayer(Math.floor(s.x), Math.floor(s.y + 1)) ? [0, 1] : null;
      if (!dir) continue;
      w.player.x = s.x + dir[0] * 1.2;
      w.player.y = s.y + dir[1] * 1.2;
      s.facing = Math.atan2(-dir[1], -dir[0]); // спиною до гравця
      // Гравець крокує від павука вздовж проходу — його чути.
      const keys = new Keys();
      keys.press(dir[0] ? KEY.right : KEY.down);
      let hunted = false;
      for (let i = 0; i < 40 && !w.dead; i++) {
        w.step(DT, keys.drain(), keys.isDown, 0, 0);
        if (s.state === "hunt") hunted = true;
      }
      expect(hunted).toBe(true);
      return;
    }
    throw new Error("не знайшлося місця для тесту");
  });
});

describe("спалювання павутини (§10.0.2)", () => {
  function webWorld(seed: number) {
    const level = generateLevel(seed, 3, 0);
    const w = new World({ level, inv: new Inventory(), rng: new Rng(seed), hasAntidote: false, aim: null, tutorial: { learned: tutorial(), save() {} }, startTime: 0 });
    w.spidersReleased = true;
    return w;
  }

  it("палаючий сірник у руці: павутина згорає без тривоги й сповільнення", () => {
    const w = webWorld(5);
    const matches = new Item("matchbook");
    w.inv.hand = matches;
    w.activateHand(); // чиркнути сірник
    expect(w.handFlame).toBe(true);
    const web = [...w.webs.values()][0];
    w.player.x = web.tx + 0.5;
    w.player.y = web.ty - 0.6;
    const keys = new Keys();
    keys.press(KEY.down);
    for (let i = 0; i < 30; i++) w.step(DT, keys.drain(), keys.isDown, 0, 0);
    expect(Math.floor(w.player.y)).toBe(web.ty);
    expect(web.burnt).toBe(true);
    expect(web.torn).toBe(true);
    expect(web.passes).toBe(0);
    expect(w.events.some((e) => e.type === "webTrigger")).toBe(false);
    expect(w.events.some((e) => e.type === "webBurn")).toBe(true);
    expect(w.spiders.some((s) => s.state === "investigate")).toBe(false);
    expect(matches.matchTime).toBeGreaterThan(0); // сірник не витрачено
  });

  it("незапалена пачка в руці — звичайний прохід із тривогою", () => {
    const w = webWorld(5);
    w.inv.hand = new Item("matchbook");
    const web = [...w.webs.values()][0];
    w.player.x = web.tx + 0.5;
    w.player.y = web.ty - 0.6;
    const keys = new Keys();
    keys.press(KEY.down);
    for (let i = 0; i < 30; i++) w.step(DT, keys.drain(), keys.isDown, 0, 0);
    expect(web.burnt).toBe(false);
    expect(w.events.some((e) => e.type === "webTrigger")).toBe(true);
  });
});

describe("запальничка палить павутину (§10.0.2, §7.3.8)", () => {
  it("запалена в руці — павутина згорає; загашена — звичайний прохід", () => {
    for (const lit of [true, false]) {
      const level = generateLevel(5, 3, 0);
      const w = new World({ level, inv: new Inventory(), rng: new Rng(5), hasAntidote: false, aim: null, tutorial: { learned: tutorial(), save() {} }, startTime: 0 });
      w.spidersReleased = true;
      w.inv.hand = new Item("lighter");
      if (lit) w.activateHand();
      const web = [...w.webs.values()][0];
      w.player.x = web.tx + 0.5;
      w.player.y = web.ty - 0.6;
      const keys = new Keys();
      keys.press(KEY.down);
      for (let i = 0; i < 30; i++) w.step(DT, keys.drain(), keys.isDown, 0, 0);
      expect(web.burnt).toBe(lit);
      expect(w.events.some((e) => e.type === "webTrigger")).toBe(!lit);
    }
  });
});

describe("павутина на рівні 2 (§10, §11.1)", () => {
  it("3 павутини без павуків: прохід сповільнює й дає стингер, скликати нікого", () => {
    const level = generateLevel(11, 1, 0);
    expect(level.webs.length).toBe(3);
    expect(level.spiders.length).toBe(0);
    const w = new World({ level, inv: new Inventory(), rng: new Rng(11), hasAntidote: false, aim: null, tutorial: { learned: tutorial(), save() {} }, startTime: 0 });
    const web = [...w.webs.values()][0];
    w.player.x = web.tx + 0.5;
    w.player.y = web.ty - 0.6;
    const keys = new Keys();
    keys.press(KEY.down);
    for (let i = 0; i < 30; i++) w.step(DT, keys.drain(), keys.isDown, 0, 0);
    expect(w.events.some((e) => e.type === "webTrigger" && e.stinger)).toBe(true);
    expect(web.passes).toBe(1);
  });
});

describe("сповільнення павутиною (§10)", () => {
  it("на цілій павутині швидкість утричі менша, на порваній — звичайна", () => {
    const level = generateLevel(5, 3, 0);
    const w = new World({ level, inv: new Inventory(), rng: new Rng(5), hasAntidote: false, aim: null, tutorial: { learned: tutorial(), save() {} }, startTime: 0 });
    const web = [...w.webs.values()][0];
    const keys = new Keys();
    keys.press(KEY.down);
    const speedOver = (frames: number) => {
      w.player.x = web.tx + 0.5;
      w.player.y = web.ty + 0.15;
      const y0 = w.player.y;
      for (let i = 0; i < frames; i++) w.step(DT, keys.drain(), keys.isDown, 0, 0);
      return (w.player.y - y0) / (frames * DT);
    };
    const slow = speedOver(20); // ≈ 0.28 тайла — лишається на тайлі павутини
    web.torn = true;
    const normal = speedOver(20);
    expect(slow / normal).toBeCloseTo(1 / 3, 2);
  });
});
