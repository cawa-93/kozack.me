// Дії зі спорядженням і дверима з утриманням клавіші (§7.3.1–7.3.1.3).
// Складна дія — послідовність атомарних етапів. Етап триває, лише поки утримуються його клавіші;
// відпускання скасовує поточний етап (завершені лишаються). Можливість виконання перевіряється
// лише в момент завершення етапу: неможливе — провал із червоним блиманням бару.

import {
  ACTION_BAR_CANCEL_FADE,
  ACTION_FAIL_FLASH,
  DOOR_TOGGLE_TIME,
  DROP_TIME,
  EQUIP_TIME,
  EXIT_TIME,
  FLARE_THROW_HOLD,
  FLARE_THROW_LOCKOUT,
  PICKUP_TIME,
  RELOAD_TIME,
  SWAP_TIME,
  UNEQUIP_TIME,
} from "../config";
import { KEY, SLOT_KEYS } from "../core/input";
import type { DoorState } from "../maze/grid";
import type { Inventory } from "./inventory";
import { RELOAD_TARGET, type Item } from "./items";

/** Предмет на підлозі, який можна підібрати: предмет спорядження або протиотрута (§10.1). */
export interface FloorPickup {
  readonly id: number;
  readonly item: Item | null; // null — протиотрута
}

export type StageKind = "pickup" | "unequip" | "dropHand" | "dropSlot" | "equip" | "door" | "throw" | "exit" | "reload" | "swap";
export type ActionKind = "interact" | "drop" | "dropSlot" | "stow" | "equip" | "throw" | "reload";

export interface Stage {
  kind: StageKind;
  duration: number;
}

/** Що хост (світ гри) надає системі дій. */
export interface ActionHost {
  readonly inv: Inventory;
  simTime(): number;
  /** Ціль підбирання в досяжності (§7.3.4) або null. */
  findPickupTarget(): FloorPickup | null;
  /** Двері поруч у конусі погляду (§5.6) або null. */
  findDoorTarget(): DoorState | null;
  pickupInReach(target: FloorPickup): boolean;
  doorInReach(door: DoorState): boolean;
  /** Вихід рівня в досяжності й у конусі погляду (§5.5). */
  findExitTarget(): boolean;
  /** Гравець не відійшов від виходу, на який діє (для скасування). */
  exitInReach(): boolean;
  /** Дію виходу дотримано — перехід на наступний рівень / назовні (§5.5). */
  leaveLevel(): void;
  /** Прибрати предмет із підлоги (підібрано). */
  takeFromFloor(target: FloorPickup): void;
  consumeAntidote(target: FloorPickup): void;
  /** Покласти предмет на підлогу біля гравця (§7.3.4.0): світло не гасне; палаючий сірник падає окремо. */
  dropItem(item: Item): void;
  /** Палаючий сірник пачки, яку ховають у рюкзак, падає й догорає (§7.3.0). */
  releaseMatch(item: Item): void;
  /** Спроба відчинити/зачинити двері; false — провал (прохід зайнятий, завал не зачиняється). */
  tryToggleDoor(door: DoorState): boolean;
  throwFlare(item: Item): void;
  /** Миттєва активація Space (§7.3.0). */
  activateHand(): void;
  onActionEvent(e: ActionEvent): void;
}

export type ActionEvent =
  | { type: "start"; action: ActionKind; stage: StageKind }
  | { type: "stageDone"; action: ActionKind; stage: StageKind; last: boolean }
  | { type: "cancel"; action: ActionKind; stage: StageKind }
  | { type: "fail"; action: ActionKind; stage: StageKind };

/** Стан прогрес-бару над персонажем (§7.3.1.2). */
export interface BarView {
  /** Тривалості етапів (для рисок-поділок). */
  stages: number[];
  /** Заповнення, с від початку дії. */
  elapsed: number;
  phase: "run" | "cancel" | "fail";
  /** Час у фазі cancel/fail. */
  phaseTime: number;
}

interface ActiveAction {
  kind: ActionKind;
  holdKeys: string[];
  stages: Stage[];
  index: number;
  time: number;
  slot: number;
  target: FloorPickup | null;
  door: DoorState | null;
  exit: boolean;
  /** Відновлення світла, погашеного на початку етапу «зняти» (§7.3.1.1). */
  restore: { item: Item; on: boolean } | null;
}

export class ActionSystem {
  private action: ActiveAction | null = null;
  private bar: BarView | null = null;
  /** Динамо-ліхтар у руці не світить, поки його знімають (§7.3.1: світло гасне на початку дії). */
  suppressHandLight = false;

  constructor(private readonly host: ActionHost) {}

  get busy(): boolean {
    return this.action !== null;
  }

  get current(): { kind: ActionKind; stage: StageKind } | null {
    const a = this.action;
    return a ? { kind: a.kind, stage: a.stages[a.index].kind } : null;
  }

  get barView(): BarView | null {
    return this.bar;
  }

  /** Нове натискання клавіші (без автоповтору). */
  press(code: string, isDown: (code: string) => boolean): void {
    const a = this.action;
    if (a) {
      this.chord(code, isDown);
      return; // одночасно триває лише одна дія (§7.3.1.1)
    }
    const inv = this.host.inv;
    if (code === KEY.interact) this.startInteract();
    else if (code === KEY.drop) {
      const held = SLOT_KEYS.findIndex((k) => isDown(k));
      if (held >= 0) this.startDropSlot(held, [KEY.drop, SLOT_KEYS[held]]);
      else this.start("drop", [KEY.drop], [{ kind: "dropHand", duration: DROP_TIME }]);
    } else if (code === KEY.stow) {
      const hand = inv.hand;
      const toFloor = hand !== null && !inv.handcuffed && (hand.isBurningFlare || inv.firstFreeSlot() < 0);
      this.start("stow", [KEY.stow], [toFloor ? { kind: "dropHand", duration: DROP_TIME } : { kind: "unequip", duration: UNEQUIP_TIME }]);
    } else if (SLOT_KEYS.includes(code)) {
      const slot = SLOT_KEYS.indexOf(code);
      if (isDown(KEY.drop)) this.startDropSlot(slot, [SLOT_KEYS[slot], KEY.drop]);
      else this.startEquip(slot);
    } else if (code === KEY.activate) {
      const hand = inv.hand;
      if (hand?.isBurningFlare) {
        // Кидок — лише новим натисканням і не раніше ніж через 1 с після запалювання (§7.3.2).
        if (this.host.simTime() - hand.flareLitAt >= FLARE_THROW_LOCKOUT) {
          this.start("throw", [KEY.activate], [{ kind: "throw", duration: FLARE_THROW_HOLD }]);
        }
        return;
      }
      if (hand && !inv.handcuffed && RELOAD_TARGET[hand.kind] && !hand.exhausted) {
        // Батарейка / пальне: перезарядка — дія з утриманням Space (§7.3.7).
        this.start("reload", [KEY.activate], [{ kind: "reload", duration: RELOAD_TIME }]);
        return;
      }
      this.host.activateHand();
    }
  }

  /** Відпускання клавіші: якщо це клавіша поточної дії — скасування етапу. */
  release(code: string): void {
    const a = this.action;
    if (a && a.holdKeys.includes(code)) this.cancel();
  }

  /** Скасування ззовні: плювок, пауза, перехід рівня, захоплення (§7.3.1.1). */
  cancel(): void {
    const a = this.action;
    if (!a) return;
    this.undoStageStart(a);
    const stage = a.stages[a.index].kind;
    this.bar = { stages: a.stages.map((s) => s.duration), elapsed: this.elapsedOf(a), phase: "cancel", phaseTime: 0 };
    this.action = null;
    this.host.onActionEvent({ type: "cancel", action: a.kind, stage });
  }

  /** Скинути все без анімації (новий рівень, пробудження). */
  reset(): void {
    if (this.action) this.undoStageStart(this.action);
    this.action = null;
    this.bar = null;
  }

  update(dt: number): void {
    if (this.bar && this.bar.phase !== "run") {
      this.bar.phaseTime += dt;
      const limit = this.bar.phase === "cancel" ? ACTION_BAR_CANCEL_FADE : ACTION_FAIL_FLASH;
      if (this.bar.phaseTime >= limit) this.bar = null;
    }
    const a = this.action;
    if (!a) return;
    // Підбирання прив'язане до цілі: ціль вийшла з досяжності — скасування (§7.3.1).
    if (a.target && !this.host.pickupInReach(a.target)) {
      this.cancel();
      return;
    }
    if (a.door && !this.host.doorInReach(a.door)) {
      this.cancel();
      return;
    }
    if (a.exit && !this.host.exitInReach()) {
      this.cancel();
      return;
    }
    a.time += dt;
    const stage = a.stages[a.index];
    if (a.time + 1e-9 < stage.duration) {
      this.bar = { stages: a.stages.map((s) => s.duration), elapsed: this.elapsedOf(a), phase: "run", phaseTime: 0 };
      return;
    }
    // Етап завершено: перевірка можливості й виконання.
    a.restore = null;
    this.suppressHandLight = false;
    const ok = this.execute(a, stage);
    if (!ok) {
      this.bar = { stages: a.stages.map((s) => s.duration), elapsed: this.totalOf(a), phase: "fail", phaseTime: 0 };
      this.action = null;
      this.host.onActionEvent({ type: "fail", action: a.kind, stage: stage.kind });
      return;
    }
    const last = a.index === a.stages.length - 1;
    this.host.onActionEvent({ type: "stageDone", action: a.kind, stage: stage.kind, last });
    if (last) {
      this.action = null;
      this.bar = null; // успіх — бар зникає одразу
      return;
    }
    a.index++;
    a.time = 0;
    this.beginStage(a);
    this.bar = { stages: a.stages.map((s) => s.duration), elapsed: this.elapsedOf(a), phase: "run", phaseTime: 0 };
  }

  // ---------- запуск дій ----------

  /**
   * На що подіє E зараз — за правилами пріоритету §5.6: предмет, якщо його можна підібрати;
   * інакше двері поруч; інакше спроба підібрати (провал). Чиста функція: нічого не змінює.
   */
  resolveInteract(): { stages: Stage[]; target: FloorPickup | null; door: DoorState | null; exit: boolean } {
    const inv = this.host.inv;
    const target = this.host.findPickupTarget();
    const pickup: Stage = { kind: "pickup", duration: PICKUP_TIME };
    const none = { target: null, door: null, exit: false };
    if (target) {
      const item = target.item;
      if (item === null || inv.hand === null) return { ...none, stages: [pickup], target };
      if (item.isBurningFlare && !inv.handcuffed) {
        // Палаюча шашка йде лише в руку: спершу звільнити руку (§7.3.2).
        if (inv.hand.isBurningFlare) return { ...none, stages: [{ kind: "dropHand", duration: DROP_TIME }, pickup], target };
        if (inv.firstFreeSlot() >= 0) return { ...none, stages: [{ kind: "unequip", duration: UNEQUIP_TIME }, pickup], target };
      } else if (!item.isBurningFlare && inv.firstFreeSlot() >= 0) {
        return { ...none, stages: [pickup], target };
      }
    }
    // Предмет не підібрати (або його немає): двері → вихід → провал підбирання (§5.5, §5.6).
    const door = this.host.findDoorTarget();
    if (door) return { ...none, stages: [{ kind: "door", duration: DOOR_TOGGLE_TIME }], door };
    if (this.host.findExitTarget()) return { ...none, stages: [{ kind: "exit", duration: EXIT_TIME }], exit: true };
    return { ...none, stages: [pickup], target }; // провал після 1.0 с
  }

  private startInteract(): void {
    const r = this.resolveInteract();
    this.start("interact", [KEY.interact], r.stages, { target: r.target ?? undefined, door: r.door ?? undefined, exit: r.exit });
  }

  private startEquip(slot: number): void {
    const inv = this.host.inv;
    const equip: Stage = { kind: "equip", duration: EQUIP_TIME };
    const hand = inv.hand;
    // Порожній слот або кайданки — провал без жодних змін, рука не ховається (§7.3.1).
    if (hand === null || inv.handcuffed || inv.backpack[slot] === null) {
      this.start("equip", [SLOT_KEYS[slot]], [equip], { slot });
      return;
    }
    if (hand.isBurningFlare) {
      // Палаючу шашку сховати неможливо: вона падає, потім узяти новий прилад (§7.3.2).
      this.start("equip", [SLOT_KEYS[slot]], [{ kind: "dropHand", duration: DROP_TIME }, equip], { slot });
      return;
    }
    if (inv.firstFreeSlot() < 0) {
      // Рюкзак повний: предмети в руці й у слоті міняються місцями, неподільно (§7.3.1).
      this.start("equip", [SLOT_KEYS[slot]], [{ kind: "swap", duration: SWAP_TIME }], { slot });
      return;
    }
    this.start("equip", [SLOT_KEYS[slot]], [{ kind: "unequip", duration: UNEQUIP_TIME }, equip], { slot });
  }

  private startDropSlot(slot: number, keys: string[]): void {
    this.start("dropSlot", keys, [{ kind: "dropSlot", duration: DROP_TIME }], { slot });
  }

  /** Акорд Q + номер слота в будь-якому порядку перемикає дію на «викинути зі слота» (§7.3.1.1). */
  private chord(code: string, isDown: (code: string) => boolean): void {
    const a = this.action!;
    if (a.kind === "drop" && SLOT_KEYS.includes(code) && isDown(KEY.drop)) {
      const slot = SLOT_KEYS.indexOf(code);
      this.retarget(() => this.startDropSlot(slot, [KEY.drop, code]));
    } else if (a.kind === "equip" && code === KEY.drop && isDown(SLOT_KEYS[a.slot])) {
      const slot = a.slot;
      this.retarget(() => this.startDropSlot(slot, [SLOT_KEYS[slot], KEY.drop]));
    }
  }

  private retarget(startNew: () => void): void {
    const a = this.action!;
    this.undoStageStart(a);
    this.action = null;
    startNew();
  }

  private start(
    kind: ActionKind,
    holdKeys: string[],
    stages: Stage[],
    opts: { target?: FloorPickup; door?: DoorState; slot?: number; exit?: boolean } = {},
  ): void {
    const a: ActiveAction = {
      kind,
      holdKeys,
      stages,
      index: 0,
      time: 0,
      slot: opts.slot ?? -1,
      target: opts.target ?? null,
      door: opts.door ?? null,
      exit: opts.exit ?? false,
      restore: null,
    };
    this.action = a;
    this.beginStage(a);
    this.bar = { stages: stages.map((s) => s.duration), elapsed: 0, phase: "run", phaseTime: 0 };
    this.host.onActionEvent({ type: "start", action: kind, stage: stages[0].kind });
  }

  /** Світло гасне миттєво на початку етапу «зняти» чи обміну (§7.3.1). */
  private beginStage(a: ActiveAction): void {
    const stage = a.stages[a.index];
    if (stage.kind !== "unequip" && stage.kind !== "swap") return;
    const hand = this.host.inv.hand;
    if (!hand || this.host.inv.handcuffed) return;
    if (hand.switchable && hand.on) {
      a.restore = { item: hand, on: true };
      hand.on = false;
    }
    if (hand.kind === "dynamo") this.suppressHandLight = true;
  }

  /** Скасований етап не лишає наслідків: погашений прилад знову світить (§7.3.1.1). */
  private undoStageStart(a: ActiveAction): void {
    if (a.restore) {
      const { item, on } = a.restore;
      if (!item.exhausted) item.on = on;
      a.restore = null;
    }
    this.suppressHandLight = false;
  }

  private elapsedOf(a: ActiveAction): number {
    let t = 0;
    for (let i = 0; i < a.index; i++) t += a.stages[i].duration;
    return t + Math.min(a.time, a.stages[a.index].duration);
  }

  private totalOf(a: ActiveAction): number {
    let t = 0;
    for (let i = 0; i <= a.index; i++) t += a.stages[i].duration;
    return t;
  }

  // ---------- виконання етапів ----------

  private execute(a: ActiveAction, stage: Stage): boolean {
    const host = this.host;
    const inv = host.inv;
    switch (stage.kind) {
      case "pickup": {
        const target = a.target;
        if (!target) return false;
        if (target.item === null) {
          host.consumeAntidote(target);
          return true;
        }
        const item = target.item;
        if (inv.hand === null) {
          host.takeFromFloor(target);
          inv.hand = item; // підібраний у руку лишається в тому стані, в якому лежав (§7.3.0)
        } else {
          if (item.isBurningFlare) return false;
          const slot = inv.firstFreeSlot();
          if (slot < 0) return false;
          host.takeFromFloor(target);
          inv.backpack[slot] = item;
          if (item.switchable) item.on = false; // у рюкзаку гасне
        }
        item.pristine = false;
        return true;
      }
      case "unequip": {
        const hand = inv.hand;
        if (!hand || inv.handcuffed || hand.isBurningFlare) return false;
        const slot = inv.firstFreeSlot();
        if (slot < 0) return false;
        if (hand.switchable) hand.on = false;
        if (hand.kind === "matchbook" && hand.matchTime > 0) host.releaseMatch(hand);
        inv.hand = null;
        inv.backpack[slot] = hand;
        return true;
      }
      case "dropHand": {
        const hand = inv.hand;
        if (!hand) return false;
        inv.hand = null;
        host.dropItem(hand);
        return true;
      }
      case "dropSlot": {
        if (inv.handcuffed) {
          // Кайданки знімаються Q з номером слота чи без (§11.2.1).
          const cuffs = inv.hand!;
          inv.hand = null;
          host.dropItem(cuffs);
          return true;
        }
        const item = inv.backpack[a.slot];
        if (!item) return false;
        inv.backpack[a.slot] = null;
        host.dropItem(item);
        return true;
      }
      case "swap": {
        // Обмін місцями (§7.3.1): старий прилад — у слот обраного, погашений; палаючий сірник падає.
        const hand = inv.hand;
        const item = inv.backpack[a.slot];
        if (!hand || !item || inv.handcuffed || hand.isBurningFlare) return false;
        if (hand.switchable) hand.on = false;
        if (hand.kind === "matchbook" && hand.matchTime > 0) host.releaseMatch(hand);
        inv.backpack[a.slot] = hand;
        inv.hand = item; // невикористаним: світло лише після Space, крім динамо (§7.3.0)
        return true;
      }
      case "equip": {
        if (inv.handcuffed || inv.hand !== null) return false;
        const item = inv.backpack[a.slot];
        if (!item) return false;
        inv.backpack[a.slot] = null;
        inv.hand = item; // невикористаним: світло лише після Space, крім динамо (§7.3.0)
        return true;
      }
      case "door":
        return a.door !== null && host.tryToggleDoor(a.door);
      case "exit":
        host.leaveLevel();
        return true;
      case "throw": {
        const hand = inv.hand;
        if (!hand || hand.kind !== "flare") return false;
        inv.hand = null;
        host.throwFlare(hand);
        return true;
      }
      case "reload": {
        // Немає відповідного приладу в інвентарі — провал; інакше найменш заряджений до повної (§7.3.7).
        const hand = inv.hand;
        if (!hand || hand.exhausted) return false;
        const target = inv.reloadTarget(hand);
        if (!target) return false;
        target.refill();
        hand.used = true;
        return true;
      }
    }
  }
}
