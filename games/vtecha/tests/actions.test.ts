import { describe, expect, it } from "vitest";
import { ActionSystem, type ActionEvent, type ActionHost, type FloorPickup } from "../src/game/actions";
import { Inventory } from "../src/game/inventory";
import { Item } from "../src/game/items";
import { KEY } from "../src/core/input";
import type { DoorState } from "../src/maze/grid";

const DT = 1 / 60;

class FakeHost implements ActionHost {
  inv = new Inventory();
  time = 0;
  floor: FloorPickup[] = [];
  dropped: Item[] = [];
  thrown: Item[] = [];
  matchesReleased = 0;
  antidote = false;
  door: DoorState | null = null;
  doorBlocked = false;
  reach = true;
  events: ActionEvent[] = [];
  activations = 0;
  simTime() {
    return this.time;
  }
  findPickupTarget() {
    return this.floor[0] ?? null;
  }
  findDoorTarget() {
    return this.door;
  }
  pickupInReach() {
    return this.reach;
  }
  doorInReach() {
    return true;
  }
  exitNear = false;
  left = false;
  findExitTarget() {
    return this.exitNear;
  }
  exitInReach() {
    return this.exitNear;
  }
  leaveLevel() {
    this.left = true;
  }
  takeFromFloor(t: FloorPickup) {
    this.floor = this.floor.filter((f) => f !== t);
  }
  consumeAntidote(t: FloorPickup) {
    this.antidote = true;
    this.takeFromFloor(t);
  }
  dropItem(item: Item) {
    this.dropped.push(item);
  }
  releaseMatch(item: Item) {
    this.matchesReleased++;
    item.matchTime = 0;
  }
  tryToggleDoor(d: DoorState) {
    if (this.doorBlocked) return false;
    d.open = !d.open;
    return true;
  }
  throwFlare(item: Item) {
    this.thrown.push(item);
  }
  activateHand() {
    this.activations++;
  }
  onActionEvent(e: ActionEvent) {
    this.events.push(e);
  }
}

/** Прокрутити симуляцію на t секунд з утриманими клавішами. */
function run(sys: ActionSystem, host: FakeHost, t: number) {
  for (let i = 0; i < Math.round(t / DT); i++) {
    host.time += DT;
    sys.update(DT);
  }
}

function setup() {
  const host = new FakeHost();
  const sys = new ActionSystem(host);
  const down = new Set<string>();
  const press = (code: string) => {
    down.add(code);
    sys.press(code, (c) => down.has(c));
  };
  const release = (code: string) => {
    down.delete(code);
    sys.release(code);
  };
  return { host, sys, press, release };
}

describe("дії з утриманням (§7.3.1)", () => {
  it("підбирання порожньою рукою: 1.0 с, предмет у руці", () => {
    const { host, sys, press } = setup();
    const lamp = new Item("gasLamp");
    host.floor.push({ id: 1, item: lamp });
    press(KEY.interact);
    run(sys, host, 0.9);
    expect(host.inv.hand).toBeNull();
    run(sys, host, 0.15);
    expect(host.inv.hand).toBe(lamp);
    expect(sys.busy).toBe(false);
  });

  it("відпускання раніше скасовує дію без наслідків", () => {
    const { host, sys, press, release } = setup();
    host.floor.push({ id: 1, item: new Item("flare") });
    press(KEY.interact);
    run(sys, host, 0.5);
    release(KEY.interact);
    run(sys, host, 1);
    expect(host.inv.hand).toBeNull();
    expect(host.floor.length).toBe(1);
    expect(host.events.some((e) => e.type === "cancel")).toBe(true);
  });

  it("рука зайнята й рюкзак повний: провал після 1.0 с", () => {
    const { host, sys, press } = setup();
    host.inv.hand = new Item("flashlight");
    host.inv.backpack[0] = new Item("flare");
    host.inv.backpack[1] = new Item("flare");
    host.inv.backpack[2] = new Item("flare");
    host.floor.push({ id: 1, item: new Item("gasLamp") });
    press(KEY.interact);
    run(sys, host, 1.05);
    expect(host.events.at(-1)?.type).toBe("fail");
    expect(host.floor.length).toBe(1);
    expect(sys.barView?.phase).toBe("fail");
  });

  it("рука зайнята: предмет іде в найменший вільний слот і гасне", () => {
    const { host, sys, press } = setup();
    host.inv.hand = new Item("flashlight");
    host.inv.backpack[0] = new Item("flare");
    const lamp = new Item("gasLamp");
    lamp.on = true;
    host.floor.push({ id: 1, item: lamp });
    press(KEY.interact);
    run(sys, host, 1.05);
    expect(host.inv.backpack[1]).toBe(lamp);
    expect(lamp.on).toBe(false);
  });

  it("зміна приладу: 1.5 + 1.5 с; скасування після першого етапу лишає руку порожньою", () => {
    const { host, sys, press, release } = setup();
    const torch = new Item("flashlight");
    torch.on = true;
    const lamp = new Item("gasLamp");
    host.inv.hand = torch;
    host.inv.backpack[1] = lamp;
    press(KEY.slot2);
    run(sys, host, 0.1);
    expect(torch.on).toBe(false); // світло гасне на початку дії
    run(sys, host, 1.5);
    expect(host.inv.hand).toBeNull();
    expect(host.inv.backpack[0]).toBe(torch);
    release(KEY.slot2);
    expect(host.inv.hand).toBeNull();
    expect(host.inv.backpack[1]).toBe(lamp);
  });

  it("скасування на першому етапі повертає світло", () => {
    const { host, sys, press, release } = setup();
    const torch = new Item("flashlight");
    torch.on = true;
    host.inv.hand = torch;
    host.inv.backpack[1] = new Item("gasLamp");
    press(KEY.slot2);
    run(sys, host, 0.5);
    expect(torch.on).toBe(false);
    release(KEY.slot2);
    expect(torch.on).toBe(true);
    expect(host.inv.hand).toBe(torch);
  });

  it("повна зміна приладу за 3.0 с", () => {
    const { host, sys, press } = setup();
    const torch = new Item("flashlight");
    const lamp = new Item("gasLamp");
    host.inv.hand = torch;
    host.inv.backpack[2] = lamp;
    press(KEY.slot3);
    run(sys, host, 2.95);
    expect(host.inv.hand).toBeNull();
    run(sys, host, 0.1);
    expect(host.inv.hand).toBe(lamp);
    expect(host.inv.backpack[0]).toBe(torch);
  });

  it("зміна при повному рюкзаку: обмін місцями за 2.5 с, нічого не падає (§7.3.1)", () => {
    const { host, sys, press } = setup();
    const torch = new Item("flashlight");
    torch.on = true;
    const lamp = new Item("gasLamp");
    const inv = new Inventory();
    inv.hand = torch;
    inv.backpack[0] = new Item("flare");
    inv.backpack[1] = lamp;
    inv.backpack[2] = new Item("matchbook");
    host.inv = inv;
    press(KEY.slot2);
    expect(torch.on).toBe(false); // гасне на початку дії
    run(sys, host, 2.4);
    expect(inv.hand).toBe(torch);
    run(sys, host, 0.15);
    expect(sys.busy).toBe(false);
    expect(host.dropped).toEqual([]);
    expect(inv.hand).toBe(lamp);
    expect(inv.backpack[1]).toBe(torch);
    expect(torch.on).toBe(false);
    expect(lamp.on).toBe(false); // узятий у руку невикористаним
  });

  it("обмін неподільний: відпустив раніше — усе як було, світло повертається", () => {
    const { host, sys, press, release } = setup();
    const torch = new Item("flashlight");
    torch.on = true;
    const inv = new Inventory();
    inv.hand = torch;
    for (let i = 0; i < 3; i++) inv.backpack[i] = new Item("flare");
    host.inv = inv;
    press(KEY.slot1);
    run(sys, host, 2.0);
    release(KEY.slot1);
    expect(inv.hand).toBe(torch);
    expect(torch.on).toBe(true);
    expect(inv.backpack.every((it) => it?.kind === "flare")).toBe(true);
  });

  it("палаючий сірник при обміні падає на підлогу, палаюча шашка — не обмінюється", () => {
    const a = setup();
    const matches = new Item("matchbook");
    matches.matchTime = 5;
    const inv = new Inventory();
    inv.hand = matches;
    for (let i = 0; i < 3; i++) inv.backpack[i] = new Item("gasLamp");
    a.host.inv = inv;
    a.press(KEY.slot3);
    run(a.sys, a.host, 2.55);
    expect(a.host.matchesReleased).toBe(1);
    expect(inv.backpack[2]).toBe(matches);
    const b = setup();
    const flare = new Item("flare");
    flare.on = true;
    const inv2 = new Inventory();
    inv2.hand = flare;
    for (let i = 0; i < 3; i++) inv2.backpack[i] = new Item("gasLamp");
    b.host.inv = inv2;
    b.press(KEY.slot1);
    run(b.sys, b.host, 1.05);
    expect(b.host.dropped).toEqual([flare]); // шашка падає, як і раніше
    run(b.sys, b.host, 1.5);
    expect(inv2.hand?.kind).toBe("gasLamp");
  });

  it("порожній слот: провал за 1.5 с, рука не ховається", () => {
    const { host, sys, press } = setup();
    const torch = new Item("flashlight");
    host.inv.hand = torch;
    press(KEY.slot1);
    run(sys, host, 1.55);
    expect(host.inv.hand).toBe(torch);
    expect(host.events.at(-1)?.type).toBe("fail");
  });

  it("акорд Q + цифра: викинути зі слота, у будь-якому порядку", () => {
    const a = setup();
    const flare = new Item("flare");
    const torch = new Item("flashlight");
    a.host.inv.hand = torch;
    a.host.inv.backpack[1] = flare;
    a.press(KEY.drop);
    run(a.sys, a.host, 0.5);
    a.press(KEY.slot2); // перемикає, відлік заново
    run(a.sys, a.host, 0.6);
    expect(a.host.dropped).toEqual([]);
    run(a.sys, a.host, 0.45);
    expect(a.host.dropped).toEqual([flare]);
    expect(a.host.inv.hand).toBe(torch);

    const b = setup();
    const lamp = new Item("gasLamp");
    b.host.inv.backpack[0] = lamp;
    b.press(KEY.slot1);
    run(b.sys, b.host, 0.3);
    b.press(KEY.drop);
    run(b.sys, b.host, 1.05);
    expect(b.host.dropped).toEqual([lamp]);
    expect(b.host.inv.hand).toBeNull();
  });

  it("кайданки: X і цифри провалюються, Q знімає; підбирання провалюється", () => {
    const { host, sys, press, release } = setup();
    host.inv.hand = new Item("handcuffs");
    press(KEY.stow);
    run(sys, host, 1.55);
    expect(host.events.at(-1)?.type).toBe("fail");
    release(KEY.stow);
    host.floor.push({ id: 1, item: new Item("dynamo") });
    press(KEY.interact);
    run(sys, host, 1.05);
    expect(host.events.at(-1)?.type).toBe("fail");
    release(KEY.interact);
    press(KEY.drop);
    run(sys, host, 1.05);
    expect(host.inv.hand).toBeNull();
    expect(host.dropped[0].kind).toBe("handcuffs");
  });

  it("палаюча шашка зайнятою рукою: 1.5 зняти + 1.0 підібрати", () => {
    const { host, sys, press } = setup();
    const torch = new Item("flashlight");
    host.inv.hand = torch;
    const flare = new Item("flare");
    flare.on = true;
    host.floor.push({ id: 1, item: flare });
    press(KEY.interact);
    run(sys, host, 1.55);
    expect(host.inv.backpack[0]).toBe(torch);
    run(sys, host, 1.0);
    expect(host.inv.hand).toBe(flare);
  });

  it("E без цілі — провал; E на дверях — перемикання; зайнятий прохід — провал", () => {
    const { host, sys, press, release } = setup();
    press(KEY.interact);
    run(sys, host, 1.05);
    expect(host.events.at(-1)?.type).toBe("fail");
    release(KEY.interact);
    const door: DoorState = { id: 1, tx: 0, ty: 0, variant: "wood", open: false, isCameraRubble: false };
    host.door = door;
    press(KEY.interact);
    run(sys, host, 1.05);
    expect(door.open).toBe(true);
    release(KEY.interact);
    host.doorBlocked = true;
    press(KEY.interact);
    run(sys, host, 1.05);
    expect(door.open).toBe(true);
    expect(host.events.at(-1)?.type).toBe("fail");
  });

  it("вихід (§5.5): E з утриманням 1.0 с; двері мають пріоритет; відпустив — лишився", () => {
    const a = setup();
    a.host.exitNear = true;
    a.press(KEY.interact);
    a.release(KEY.interact);
    expect(a.host.left).toBe(false);
    a.press(KEY.interact);
    run(a.sys, a.host, 0.9);
    expect(a.host.left).toBe(false);
    run(a.sys, a.host, 0.15);
    expect(a.host.left).toBe(true);

    const b = setup();
    b.host.exitNear = true;
    const door: DoorState = { id: 1, tx: 0, ty: 0, variant: "grate", open: false, isCameraRubble: false };
    b.host.door = door;
    expect(b.sys.resolveInteract().door).toBe(door);
    b.host.door = null;
    expect(b.sys.resolveInteract().exit).toBe(true);
    // Предмет, який можна підібрати, — ще раніше.
    b.host.floor.push({ id: 5, item: new Item("flare") });
    expect(b.sys.resolveInteract().exit).toBe(false);
  });

  it("предмет має пріоритет над дверима, але при повних руках E діє на двері", () => {
    const { host, sys, press } = setup();
    host.inv.hand = new Item("handcuffs");
    host.floor.push({ id: 1, item: new Item("dynamo") });
    const door: DoorState = { id: 1, tx: 0, ty: 0, variant: "rubble", open: false, isCameraRubble: true };
    host.door = door;
    press(KEY.interact);
    run(sys, host, 1.05);
    expect(door.open).toBe(true);
  });

  it("кидок шашки: не раніше ніж через 1 с після запалювання, утримання 1.0 с", () => {
    const { host, sys, press, release } = setup();
    const flare = new Item("flare");
    flare.on = true;
    flare.flareLitAt = 0;
    host.inv.hand = flare;
    host.time = 0.5;
    press(KEY.activate);
    expect(sys.busy).toBe(false);
    release(KEY.activate);
    host.time = 1.2;
    press(KEY.activate);
    expect(sys.busy).toBe(true);
    run(sys, host, 1.05);
    expect(host.thrown).toEqual([flare]);
    expect(host.inv.hand).toBeNull();
  });

  it("Space під час дії ігнорується; без дії — миттєва активація", () => {
    const { host, sys, press } = setup();
    host.inv.hand = new Item("dynamo");
    press(KEY.activate);
    expect(host.activations).toBe(1);
    host.inv.backpack[0] = new Item("flare");
    press(KEY.slot1);
    expect(sys.busy).toBe(true);
    press(KEY.activate);
    expect(host.activations).toBe(1);
  });

  it("ціль вийшла з досяжності — скасування", () => {
    const { host, sys, press } = setup();
    host.floor.push({ id: 1, item: new Item("flare") });
    press(KEY.interact);
    run(sys, host, 0.5);
    host.reach = false;
    run(sys, host, 0.1);
    expect(sys.busy).toBe(false);
    expect(host.events.at(-1)?.type).toBe("cancel");
  });

  it("протиотрута підбирається навіть при повному спорядженні", () => {
    const { host, sys, press } = setup();
    host.inv.hand = new Item("handcuffs");
    host.floor.push({ id: 9, item: null });
    press(KEY.interact);
    run(sys, host, 1.05);
    expect(host.antidote).toBe(true);
  });
});

describe("батарейка й пальне (§7.3.7)", () => {
  it("батарейка: утримання Space 1.5 с перезаряджає найменш заряджений ліхтарик", () => {
    const { host, sys, press } = setup();
    const a = new Item("flashlight");
    const b = new Item("flashlight");
    a.battery = 20;
    b.battery = 0; // розряджений — отримує заряд
    host.inv.backpack[0] = a;
    host.inv.backpack[2] = b;
    const bat = new Item("battery");
    host.inv.hand = bat;
    press(KEY.activate);
    expect(sys.busy).toBe(true);
    expect(host.activations).toBe(0);
    run(sys, host, 1.4);
    expect(b.battery).toBe(0);
    run(sys, host, 0.15);
    expect(sys.busy).toBe(false);
    expect(b.battery).toBe(60);
    expect(b.exhausted).toBe(false);
    expect(a.battery).toBe(20);
    expect(bat.exhausted).toBe(true);
    expect(host.inv.hand).toBe(bat); // розряджена батарейка лишається в руці
    // Використану батарейку Space більше нічого не робить.
    press(KEY.activate);
    expect(sys.busy).toBe(false);
  });

  it("за рівності заряду — менший номер слота; відпустив раніше — нічого", () => {
    const { host, sys, press, release } = setup();
    const a = new Item("gasLamp");
    const b = new Item("gasLamp");
    a.fuel = 30;
    b.fuel = 30;
    host.inv.backpack[1] = a;
    host.inv.backpack[2] = b;
    const fuel = new Item("fuel");
    host.inv.hand = fuel;
    press(KEY.activate);
    run(sys, host, 1.0);
    release(KEY.activate);
    expect(a.fuel).toBe(30);
    expect(fuel.exhausted).toBe(false);
    press(KEY.activate);
    run(sys, host, 1.55);
    expect(a.fuel).toBe(120);
    expect(b.fuel).toBe(30);
    expect(fuel.exhausted).toBe(true);
  });

  it("немає відповідного приладу — провал, матеріал цілий", () => {
    const { host, sys, press } = setup();
    host.inv.backpack[0] = new Item("gasLamp"); // батарейці не підходить
    const bat = new Item("battery");
    host.inv.hand = bat;
    press(KEY.activate);
    run(sys, host, 1.55);
    expect(host.events.at(-1)).toMatchObject({ type: "fail", stage: "reload" });
    expect(bat.exhausted).toBe(false);
  });
});

describe("запальничка (§7.3.8)", () => {
  it("світло як у сірника; бензин 80 с витрачається лише поки горить; Space запалює й гасить", async () => {
    const { activate } = await import("../src/game/items");
    const l = new Item("lighter");
    const m = new Item("matchbook");
    expect(l.lighterFuel).toBe(80);
    expect(l.emitsLight).toBe(false);
    activate(l, 0);
    activate(m, 0);
    expect(l.emitsLight).toBe(true);
    expect(l.light(1, 0)!.radius).toBe(m.light(1, 0)!.radius);
    l.update(10);
    expect(l.lighterFuel).toBe(70);
    activate(l, 0);
    expect(l.emitsLight).toBe(false);
    l.update(10);
    expect(l.lighterFuel).toBe(70);
    activate(l, 0);
    l.update(100);
    expect(l.exhausted).toBe(true);
    expect(l.emitsLight).toBe(false);
  });

  it("прибрана в рюкзак гасне; скасування повертає вогонь", () => {
    const { host, sys, press, release } = setup();
    const l = new Item("lighter");
    l.on = true;
    host.inv.hand = l;
    press(KEY.stow);
    expect(l.on).toBe(false); // гасне на початку дії
    run(sys, host, 0.5);
    release(KEY.stow);
    expect(l.on).toBe(true);
    press(KEY.stow);
    run(sys, host, 1.55);
    expect(host.inv.backpack[0]).toBe(l);
    expect(l.on).toBe(false);
  });
});
