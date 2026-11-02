// Пил і павутина (§8.7, «Пил і павутина», рішення автора 2026-11-02): місця по кімнатах (кути → стіни → підлога), де їх видно й
// куди дійти; кожна кімната — один пил раз на 36 годин, і вдень, і вночі; пил на підлозі дратує; прибирає пилосос у руках, а
// пил на підлозі — й робот.

import { describe, expect, it } from "vitest";

import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { DUST } from "../src/sim/config";
import { addDust, DUST_SPOTS, dustOf, floorDust, tickDust, type DustKind } from "../src/sim/dust";
import { advance, interact, newGame } from "../src/sim/game";
import { hiddenTile, isFixedSolid, isWall, OBJECTS, ROOMS, SLOTS, VACUUM_HOME, type RoomId } from "../src/sim/home";
import { annoyingMesses, FUR_SPOTS, furTufts, tickHousehold } from "../src/sim/household";
import { absoluteMinute } from "../src/sim/time";
import type { GameState, Save, Vec } from "../src/sim/types";
import { WALL_HEIGHT, WALL_SEGMENTS } from "../src/view/art/manifest/lib/geometry";
import { boxCovers } from "../src/view/iso/geometry";
import { isoObjectLook } from "../src/view/world/objects";
import { hours, liveDay, standAt, withCatCorner } from "./helpers";

function game(): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 8 }));
  save.current.modifiers.day = null;
  save.current.modifiers.week = null;
  save.current.minute = hours(10);
  return save;
}

const PHASE: Record<DustKind, number> = { cobweb: 0, corner: 0, wall: 1, floor: 2 };
const spotsOf = (room: RoomId): number[] => DUST_SPOTS.flatMap((s, i) => (s.room === room ? [i] : []));

/** Клітинка непрохідна за будь-яких сховищ (усі, що можуть з'явитися, — на місці). */
const solid = (x: number, y: number): boolean => isFixedSolid(x, y) || OBJECTS.some((o) => !o.walkable && x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h);

/** Персонаж (радіус 0,3) може стояти в точці. */
function fits(x: number, y: number): boolean {
  const r = 0.3;
  return [[-r, -r], [r, -r], [-r, r], [r, r]].every(([dx = 0, dy = 0]) => !solid(Math.floor(x + dx), Math.floor(y + dy)));
}

/** Між точками немає стіни (як у пилососа: біля самої стіни дістає). */
function clear(a: Vec, b: Vec): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.1);
  for (let i = 1; i < steps - 1; i++) {
    const t = i / steps;
    if (isWall(Math.floor(a.x + (b.x - a.x) * t), Math.floor(a.y + (b.y - a.y) * t))) return false;
  }
  return true;
}

/** Як близько персонаж може підійти до точки (без стіни між ними). */
function closest(p: Vec): number {
  let best = Infinity;
  for (let y = 0.3; y < 12; y += 0.05) {
    for (let x = 0.3; x < 20; x += 0.05) {
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < best && fits(x, y) && clear({ x, y }, p)) best = d;
    }
  }
  return best;
}

describe("місця пилу (§8.7, «Пил і павутина»)", () => {
  it("у кожній кімнаті — павутина й клубки в кутах, смужки вздовж стін і клубки на підлозі, саме в такому порядку", () => {
    for (const room of ROOMS) {
      const spots = spotsOf(room.id).map((i) => DUST_SPOTS[i]!);
      const kinds = new Set(spots.map((s) => s.kind));
      expect([...kinds].sort(), room.id).toEqual(["cobweb", "corner", "floor", "wall"]);
      for (let i = 1; i < spots.length; i++) expect(PHASE[spots[i]!.kind], `${room.id} ${i}`).toBeGreaterThanOrEqual(PHASE[spots[i - 1]!.kind]);
      // Павутина — у кутку кімнати на її межі; смужка біля стіни знає, уздовж якої осі йде стіна.
      for (const s of spots) {
        if (s.kind === "cobweb") {
          expect(Number.isInteger(s.x) && Number.isInteger(s.y), `${room.id}: павутина в куті`).toBe(true);
          expect([room.x, room.x + room.w]).toContain(s.x);
          expect(s.y).toBe(room.y);
        }
        if (s.kind === "wall") expect(s.along, `${room.id} (${s.x}, ${s.y})`).toMatch(/^[xy]$/);
        else expect(s.along).toBeUndefined();
      }
    }
  });

  it("пил видно: не під меблями й не за стінами, клубки на підлозі — не на місцях речей котячого кутка й не на жмутах", () => {
    // Центр плями: стіна чи річ не закривають її середини (краї смужки біля стіни можуть зайти за сусідню річ).
    const center = { height: 6, half: 6 };
    for (const [i, s] of DUST_SPOTS.entries()) {
      if (s.kind === "cobweb") continue;
      const name = `${i}: ${s.room} ${s.kind} (${s.x}, ${s.y})`;
      const tx = Math.floor(s.x);
      const ty = Math.floor(s.y);
      expect(solid(tx, ty), name).toBe(false);
      expect(hiddenTile(tx, ty), name).toBe(false);
      for (const w of WALL_SEGMENTS) {
        const box = { x0: w.rect.x, y0: w.rect.y, x1: w.rect.x + w.rect.w, y1: w.rect.y + w.rect.h };
        expect(boxCovers(box, w.kind === "inner" ? WALL_HEIGHT.inner : WALL_HEIGHT.front, s, center), `${name}: ${w.id}`).toBe(false);
      }
      for (const o of OBJECTS) {
        const look = isoObjectLook(o.id);
        expect(boxCovers(look.footprint, look.tall, s, center), `${name}: ${o.id}`).toBe(false);
      }
      if (s.kind === "floor") expect(SLOTS.some((slot) => slot.x === tx && slot.y === ty), name).toBe(false);
      expect(Math.min(...FUR_SPOTS.map((f) => Math.hypot(f.x - s.x, f.y - s.y))), name).toBeGreaterThan(0.75);
    }
  });

  it("до кожного місця можна підійти з пилососом ближче за його радіус, і не крізь стіну", () => {
    for (const [i, s] of DUST_SPOTS.entries()) expect(closest(s), `${i}: ${s.room} ${s.kind} (${s.x}, ${s.y})`).toBeLessThan(1.45);
  });

  it("павутина — вгорі в куті, над меблями: її не закриває нічого вище 150", () => {
    for (const s of DUST_SPOTS.filter((d) => d.kind === "cobweb")) {
      for (const o of OBJECTS) {
        const look = isoObjectLook(o.id);
        expect(boxCovers(look.footprint, look.tall, s, { height: 50, half: 30 }, 150), `${s.room}: ${o.id}`).toBe(false);
      }
    }
  });
});

describe("пил накопичується (§8.7, «Пил і павутина»)", () => {
  it("кожна кімната — один пил раз на 36 годин, по черзі з кроком 9 годин, на перше вільне місце", () => {
    const state = newGame({ address: "she", difficulty: "normal", seed: 8 }).current;
    const seen: { minute: number; room: RoomId }[] = [];
    for (let minute = 1; minute <= 2 * DUST.everyMinutes; minute++) {
      const before = dustOf(state).length;
      tickDust(state, 1);
      for (const i of dustOf(state).slice(before)) seen.push({ minute, room: DUST_SPOTS[i]!.room });
    }
    expect(seen).toEqual([
      { minute: hours(9), room: "bedroom" },
      { minute: hours(18), room: "bathroom" },
      { minute: hours(27), room: "kitchen" },
      { minute: hours(36), room: "living" },
      { minute: hours(45), room: "bedroom" },
      { minute: hours(54), room: "bathroom" },
      { minute: hours(63), room: "kitchen" },
      { minute: hours(72), room: "living" },
    ]);
    // Спершу — павутина в кутку, потім клубок у кутку.
    expect(dustOf(state).map((i) => DUST_SPOTS[i]!.kind)).toEqual(["cobweb", "cobweb", "cobweb", "cobweb", "corner", "corner", "corner", "corner"]);
  });

  it("і вдень, і вночі, і поки персонаж у поїздці: годинник пилу — прожиті хвилини", () => {
    const save = game();
    const before = save.current.home.dustClock ?? 0;
    const start = absoluteMinute(save.current.day, save.current.minute);
    liveDay(save);
    // Від 10:00 до ранку наступного дня — разом із ніччю.
    const lived = absoluteMinute(save.current.day, save.current.minute) - start;
    expect(lived).toBeGreaterThan(18 * 60);
    expect((save.current.home.dustClock ?? 0) - before).toBeCloseTo(lived, -1);
    expect(dustOf(save.current).length).toBeGreaterThan(0);
  });

  it("без пилососа: кути → стіни → підлога; усі місця зайняті — більше нікуди; прибране місце заповнюється знову першим", () => {
    const state = newGame({ address: "she", difficulty: "normal", seed: 8 }).current;
    const bedroom = spotsOf("bedroom");
    for (const index of bedroom) expect(addDust(state, "bedroom")).toBe(index);
    expect(addDust(state, "bedroom")).toBeNull();
    // Прибрали клубок у кутку — наступний пил туди, хоч на підлозі й стінах уже пил.
    const corner = bedroom.find((i) => DUST_SPOTS[i]!.kind === "corner")!;
    state.home.dust = dustOf(state).filter((i) => i !== corner);
    expect(addDust(state, "bedroom")).toBe(corner);
  });

  it("за 3 тижні без пилососа пил є в кожній кімнаті — і в кутах, і біля стін, і на підлозі", () => {
    const state = newGame({ address: "she", difficulty: "normal", seed: 8 }).current;
    tickDust(state, 21 * 24 * 60);
    for (const room of ROOMS) {
      const kinds = new Set(dustOf(state).flatMap((i) => (DUST_SPOTS[i]!.room === room.id ? [DUST_SPOTS[i]!.kind] : [])));
      expect([...kinds].sort(), room.id).toEqual(["cobweb", "corner", "floor", "wall"]);
    }
  });
});

describe("пил на підлозі дратує, кути й стіни — лише вигляд (§8.7)", () => {
  const annoyed = (kinds: DustKind[], messes = 0): number => {
    const state: GameState = newGame({ address: "she", difficulty: "normal", seed: 3 }).current;
    state.day = 8;
    state.character.body.x = 11.5;
    state.character.body.y = 8.5;
    state.home.dust = DUST_SPOTS.flatMap((s, i) => (s.room === "living" && kinds.includes(s.kind) ? [i] : []));
    for (let i = 0; i < messes; i++) state.home.messes.push({ id: 100 + i, kind: "vomit", x: 4.5 + i * 0.5, y: 8.5, cat: null });
    const before = state.character.stats.sanity;
    annoyingMesses(state, 60);
    return state.character.stats.sanity - before;
  };

  it("кожен клубок на підлозі на очах — −1 за годину, у спільній межі −4; павутина, кути й смужки — ні", () => {
    expect(annoyed(["cobweb", "corner", "wall"])).toBe(0);
    const floor = DUST_SPOTS.filter((s) => s.room === "living" && s.kind === "floor").length;
    expect(floor).toBeGreaterThanOrEqual(4);
    expect(annoyed(["floor"])).toBeCloseTo(-4);
    const state = newGame({ address: "she", difficulty: "normal", seed: 3 }).current;
    state.home.dust = [DUST_SPOTS.findIndex((s) => s.room === "living" && s.kind === "floor")];
    expect(floorDust(state)).toHaveLength(1);
  });

  it("клубок в іншій кімнаті не дратує", () => {
    const state = newGame({ address: "she", difficulty: "normal", seed: 3 }).current;
    state.day = 8;
    state.character.body.x = 11.5;
    state.character.body.y = 8.5;
    state.home.dust = DUST_SPOTS.flatMap((s, i) => (s.room === "kitchen" && s.kind === "floor" ? [i] : []));
    const before = state.character.stats.sanity;
    annoyingMesses(state, 60);
    expect(state.character.stats.sanity - before).toBe(0);
  });
});

describe("сценарій «Запилена квартира» (`scenarios/dusty-home.json`)", () => {
  it("пил у кожній кімнаті — у кутах, біля стін і на підлозі; дев'ять жмутів; пилосос на місці шафи; пилосос у руках прибирає довкола, а блювоту — ні", () => {
    const scenario = FILE_SCENARIOS["dusty-home"];
    if (!scenario) throw new Error("немає сценарію");
    const save = applyScenario(scenario);
    const state = save.current;
    for (const room of ROOMS) {
      const kinds = new Set(dustOf(state).flatMap((i) => (DUST_SPOTS[i]!.room === room.id ? [DUST_SPOTS[i]!.kind] : [])));
      expect([...kinds].sort(), room.id).toEqual(["cobweb", "corner", "floor", "wall"]);
    }
    // Вітальня — ще не вся: двоє останніх місць на підлозі вільні.
    expect(spotsOf("living").filter((i) => !dustOf(state).includes(i))).toHaveLength(2);
    expect(furTufts(state)).toHaveLength(9);
    expect(state.home.vacuumAt).toEqual(VACUUM_HOME);
    expect(state.cats).toHaveLength(3);
    standAt(save, "vacuum");
    interact(save);
    expect(state.character.held?.kind).toBe("vacuum");
    // Пройти вітальнею вздовж килима: папір зникає, блювота лишається.
    const body = state.character.body;
    body.x = 11.2;
    body.y = 8.4;
    advance(save, 0.1);
    expect(state.home.messes.map((m) => m.kind)).toEqual(["broken", "vomit"]);
  });
});

describe("пил прибирають (§8.7)", () => {
  it("пилосос у руках — пил і павутину поруч, крізь стіну — ні", () => {
    const save = game();
    const bedroom = spotsOf("bedroom");
    save.current.home.dust = [...bedroom];
    standAt(save, "vacuum");
    interact(save);
    const body = save.current.character.body;
    // Біля ліжка в куті спальні: павутина над узголів'ям і клубок біля ліжка.
    body.x = 2.4;
    body.y = 1.4;
    advance(save, 0.1);
    const left = dustOf(save.current);
    for (const i of bedroom) {
      const s = DUST_SPOTS[i]!;
      const near = Math.hypot(s.x - 2.4, s.y - 1.4) <= 1.5;
      expect(left.includes(i), `${i} ${s.kind}`).toBe(!near);
    }
    expect(left).not.toContain(bedroom[0]);
    // Пил у ванній за стіною x = 7 зі спальні не дістати.
    const bath = spotsOf("bathroom").find((i) => DUST_SPOTS[i]!.kind === "corner")!;
    save.current.home.dust = [bath];
    body.x = 6.65;
    body.y = 2.15;
    advance(save, 0.1);
    expect(dustOf(save.current)).toEqual([bath]);
  });

  it("робот-пилосос — пил на підлозі, повз який проїжджає, а павутину — ні", () => {
    const save = game();
    save.current.home.appliances.robot = "cheap";
    const living = spotsOf("living");
    save.current.home.dust = [...living];
    for (let minute = 12 * 60; minute < 13 * 60; minute++) tickHousehold(save.current, minute, 1);
    const left = dustOf(save.current).map((i) => DUST_SPOTS[i]!.kind);
    expect(left).toContain("cobweb");
    // Клубки на підлозі вітальні робот об'їздив усі.
    expect(left).not.toContain("floor");
  });
});
