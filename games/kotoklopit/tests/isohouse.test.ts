// Стики будинку нового вигляду (крок 16, хвиля 3): вхідні двері, що відчиняються (окремі полотно й стояк зі своїми
// коробками глибини), — чисті частини `iso/looks.ts` і `iso/geometry.ts` і порядок малювання `isoOrder`.

import { describe, expect, it } from "vitest";

import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import type { GameEvent } from "../src/sim/events";
import { objectById } from "../src/sim/home";
import type { GameState } from "../src/sim/types";
import { artEntry } from "../src/view/art/manifest";
import { IsoDepth } from "../src/view/iso/depth";
import { BOXES_FRONT, DOOR_BOXES } from "../src/view/iso/geometry";
import { DOOR_OPEN_MS, doorState, opensDoor } from "../src/view/iso/looks";
import { isoOrder, type IsoBox, type IsoPoint } from "../src/view/world/isoorder";
import { isoObjectLook } from "../src/view/world/objects";

/** Стан сценарію (свіжа копія). */
function scenario(name: string): GameState {
  const file = FILE_SCENARIOS[name];
  if (!file) throw new Error(`Немає сценарію «${name}»`);
  return applyScenario(file).current;
}

/** Місце кожного елемента в порядку малювання: коробки — 0…nb−1, точки — далі. */
function ranks(boxes: readonly IsoBox[], points: readonly IsoPoint[]): number[] {
  const order = isoOrder(boxes, points);
  const rank: number[] = [];
  order.forEach((id, i) => (rank[id] = i));
  return rank;
}

describe("вхідні двері відчиняються (§9.12, «Двері й гості»)", () => {
  it("події, з якими відчиняють двері, — так; решта — ні", () => {
    const yes: GameEvent[] = [
      { type: "received", deliveries: [] },
      { type: "escaped", cat: 1 },
      { type: "cat-returned", cat: 1, caught: true },
      { type: "cat-returned", cat: 1, caught: false },
      { type: "trip-started", destination: "shop" },
      { type: "trip-ended", destination: "shop" },
      { type: "modifier", kind: "mom-food", value: 1 },
      { type: "modifier", kind: "guests", value: 0 },
      { type: "modifier", kind: "inspection", value: 0 },
      { type: "modifier", kind: "home-vet", value: 1 },
    ];
    for (const event of yes) expect(opensDoor(event), JSON.stringify(event)).toBe(true);
    const no: GameEvent[] = [
      { type: "doorbell" },
      { type: "modifier", kind: "guests-away", value: 0 },
      { type: "modifier", kind: "mom-call", value: 0 },
      { type: "meow", cat: 1 },
    ];
    for (const event of no) expect(opensDoor(event), JSON.stringify(event)).toBe(false);
  });

  it("відчинені мить після події й увесь час, поки кіт на сходах", () => {
    const state = scenario("new-mischief");
    expect(doorState(state, Number.POSITIVE_INFINITY)).toBe("closed");
    expect(doorState(state, -1)).toBe("closed");
    expect(doorState(state, 0)).toBe("open");
    expect(doorState(state, DOOR_OPEN_MS - 1)).toBe("open");
    expect(doorState(state, DOOR_OPEN_MS)).toBe("closed");
    state.cats[0]!.away = "stairs";
    expect(doorState(state, Number.POSITIVE_INFINITY)).toBe("open");
  });

  it("шматки відчинених дверей — записи маніфесту з тим самим полотном і pivot, що двері", () => {
    const door = artEntry("env/door");
    expect(door?.states).toEqual(["closed", "open"]);
    for (const id of ["env/door/leaf", "env/door/post"] as const) {
      const entry = artEntry(id);
      expect(entry, id).toBeDefined();
      expect(entry?.size).toEqual(door?.size);
      expect(entry?.pivot).toEqual(door?.pivot);
      expect(entry?.states).toBeUndefined();
    }
  });

  it("коробки відчинених дверей — у сліді дверей і в кімнаті перед ними; зачинені — увесь слід", () => {
    const door = objectById("door");
    const closed = isoObjectLook("door").footprint;
    expect(closed).toEqual({ x0: door.x, y0: door.y, x1: door.x + door.w, y1: door.y + door.h });
    for (const box of Object.values(DOOR_BOXES)) {
      expect(box.x0).toBeGreaterThanOrEqual(door.x);
      expect(box.x1).toBeLessThanOrEqual(door.x + door.w);
      expect(box.x1).toBeGreaterThan(box.x0);
      expect(box.y1).toBeGreaterThan(box.y0);
    }
    // Полотно — у кімнаті перед дверима (до ящиків (12, 9) не дістає), поріг і стояк — у сліді дверей.
    expect(DOOR_BOXES.leaf.y0).toBeLessThan(door.y);
    expect(DOOR_BOXES.leaf.x1).toBeLessThan(door.x + door.w);
    expect(DOOR_BOXES.body.y0).toBe(door.y);
    expect(DOOR_BOXES.post.y0).toBe(door.y);
  });

  it("порядок: поріг < персонаж біля дверей < полотно < «Втікач» праворуч від полотна; стояк — над полотном і над тим, хто за ним", () => {
    const { body, leaf, post } = DOOR_BOXES;
    const person: IsoPoint = { x: 11, y: 10.5, half: 26 };
    const runner: IsoPoint = { x: 11.8, y: 10.2, half: 30 };
    const wedge: IsoPoint = { x: 11.45, y: 10.85, half: 30 };
    const left: IsoPoint = { x: 10.5, y: 10.5, half: 30 };
    const r = ranks([body, leaf, post], [person, runner, wedge, left]);
    const [b, l, p, pe, ru, we, le] = [0, 1, 2, 3, 4, 5, 6].map((i) => r[i]!) as [number, number, number, number, number, number, number];
    expect(b).toBeLessThan(l);
    expect(l).toBeLessThan(p);
    expect(pe).toBeLessThan(l);
    expect(ru).toBeGreaterThan(l);
    expect(we).toBeLessThan(p);
    // Кіт ліворуч у прорізі — за лівим стояком (порогом).
    expect(le).toBeLessThan(b);
  });

  it("зачинені двері — одна коробка перед усіма, хто в кімнаті", () => {
    const closed = isoObjectLook("door").footprint;
    const points: IsoPoint[] = [
      { x: 11, y: 10.5 },
      { x: 11.8, y: 10.2 },
      { x: 10.5, y: 10.9 },
    ];
    const r = ranks([closed], points);
    for (let i = 1; i <= points.length; i++) expect(r[i]!).toBeLessThan(r[0]!);
  });
});

describe("кіт у верхній коробці купи ящиків (§9.12, «Допитливість»)", () => {
  it("передні стінки — кадр на кожну купу, те саме полотно, що в купи", () => {
    const pile = artEntry("env/boxes");
    const front = artEntry("env/boxes/front");
    expect(front?.states).toEqual(pile?.states);
    expect(front?.size).toEqual(pile?.size);
    expect(front?.pivot).toEqual(pile?.pivot);
    // Кіт лежить нижче за борт верхньої коробки (≈ 58): точка `top` — на 48 над підлогою.
    expect(pile!.pivot.y - pile!.points!.top!.y).toBe(48);
  });

  it("стінки — над котом у коробці (де б у клітинці він не лежав), а персонаж перед купою — над ними", () => {
    const depth = new IsoDepth();
    const boxes = objectById("boxes");
    const got: Record<string, number> = {};
    depth.addBox({ x0: boxes.x, y0: boxes.y, x1: boxes.x + boxes.w, y1: boxes.y + boxes.h, id: "boxes" }, (d) => (got.boxes = d));
    const front = depth.addPoint((d) => (got.front = d), { half: BOXES_FRONT.half });
    const cat = depth.addPoint((d) => (got.cat = d), { id: "cat:1" });
    const person = depth.addPoint((d) => (got.person = d), { id: "person" });
    front.place(BOXES_FRONT.x, BOXES_FRONT.y, "boxes");
    person.place(boxes.x + 1.2, boxes.y + 0.6);
    for (const [x, y] of [
      [12.5, 9.5],
      [12.95, 9.95],
      [12.05, 9.9],
    ] as const) {
      cat.place(x, y, "boxes");
      depth.solve();
      expect(got.cat!).toBeGreaterThan(got.boxes!);
      expect(got.front!).toBeGreaterThan(got.cat!);
      expect(got.person!).toBeGreaterThan(got.front!);
    }
  });
});
