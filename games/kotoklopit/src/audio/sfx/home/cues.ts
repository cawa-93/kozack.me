// Події дому → разові звуки (§11.4а; хто що озвучує — `SOUND_PLAN.md`, «Ефекти»). Набори зі сталим місцем — спільні масиви,
// а не нові щоразу.

import type { GameEvent, ModifierEvent } from "../../../sim/events";
import { cleaningTool } from "../../../sim/household";
import { CARRIER_SPOT, itemPoint, ROBOT_DOCK } from "../../../sim/home";
import type { GameState } from "../../../sim/types";
import type { Cue, SoundAt } from "../types";
import type { HomeSound } from "./sounds";
import { brokeAt, storageAt } from "./where";

type HomeCue = Cue & { sound: HomeSound };

const NONE: readonly HomeCue[] = [];
const one = (sound: HomeSound, at: SoundAt): readonly HomeCue[] => [{ sound, at }];

/** Холодильник щоразу відчиняють і зачиняють: що взяли чи поклали, байдуже. */
const FRIDGE: readonly HomeCue[] = [
  { sound: "fridge-open", at: "fridge" },
  { sound: "fridge-close", at: "fridge", delayMs: 450 },
];
const CABINET: Record<string, readonly HomeCue[]> = { "cat-cabinet": one("cabinet", "cat-cabinet"), "sterile-bin": one("cabinet", "sterile-bin") };

/** Хтось заходить (§4.1): замок, двері й те, з чим зайшли. */
const visit = (sound: HomeSound, delayMs: number): readonly HomeCue[] => [
  { sound: "lock", at: "door" },
  { sound: "door", at: "door", delayMs: 250 },
  { sound, at: "door", delayMs },
];

const VISITS: Partial<Record<ModifierEvent, readonly HomeCue[]>> = {
  guests: visit("guests", 600),
  inspection: visit("papers", 700),
  "home-vet": visit("vet-case", 800),
  cleaner: visit("bucket", 800),
  fireworks: one("fireworks", "sill-living"),
};
/** Мама заходить сама (§4.1): стукає тричі й відчиняє; не застала персонажа — тиша. */
const MOM: readonly HomeCue[] = [
  { sound: "knock", at: "door" },
  { sound: "knock", at: "door", delayMs: 190, rate: 1.04 },
  { sound: "knock", at: "door", delayMs: 380, rate: 0.97 },
  { sound: "door", at: "door", delayMs: 900 },
];
const RECEIVED: readonly HomeCue[] = [
  { sound: "lock", at: "door" },
  { sound: "door", at: "door", delayMs: 250 },
  { sound: "parcel", at: "door", delayMs: 700 },
];
const ROBOT_BACK: readonly HomeCue[] = [
  { sound: "beep-high", at: ROBOT_DOCK },
  { sound: "beep-low", at: ROBOT_DOCK, delayMs: 220 },
];
const LAUNDRY: Record<Extract<GameEvent, { type: "laundry" }>["stage"], readonly HomeCue[]> = {
  cat: one("washer-open", "washer"),
  started: one("washer-close", "washer"),
  spin: one("spin-start", "washer"),
  done: one("washer-done", "washer"),
  hung: one("hung", "washer"),
};
const STATIC = {
  doorbell: one("doorbell", "door"),
  trashed: one("trash", "trash"),
  unpacked: one("unpack", "boxes"),
  carrier: one("carrier", CARRIER_SPOT),
  ready: one("timer", "stove"),
  burnt: one("burnt", "stove"),
  wire: one("wire", "computer"),
  vacuumOn: one("vacuum-on", "person"),
} as const;

/** Річ кухні взяли чи поклали (`took`, `put`). */
function kitchen(object: string, took: boolean): readonly HomeCue[] {
  if (object === "fridge") return FRIDGE;
  const cabinet = CABINET[object];
  if (cabinet) return cabinet;
  return one(took ? "dish-pick" : "dish-put", object);
}

export function homeCues(event: GameEvent, state: GameState): readonly HomeCue[] {
  switch (event.type) {
    case "took":
    case "put":
      return kitchen(event.object, event.type === "took");
    case "thing-moved":
      return one(event.stage === "taken" ? "thing-take" : "thing-put", itemPoint(event.item));
    case "trashed":
      return STATIC.trashed;
    case "discarded":
      // Річ уже прибрано зі стану, але її місце — у самій події.
      return one("discard", itemPoint(event.item));
    case "unpacked":
      return STATIC.unpacked;
    case "received":
      return RECEIVED;
    case "supply-landed":
      return one("land", storageAt(event.product));
    case "doorbell":
      return STATIC.doorbell;
    case "carrier-opened":
      return STATIC.carrier;
    case "cooked":
      return event.result === "ready" ? STATIC.ready : STATIC.burnt;
    case "laundry":
      return LAUNDRY[event.stage];
    case "vacuum":
      // Віник — тихо: гуде лише пилосос, і лише коли є світло (§8.7).
      if (cleaningTool(state) !== "vacuum") return NONE;
      return event.stage === "taken" ? STATIC.vacuumOn : one("vacuum-off", state.home.vacuumAt ?? "person");
    case "robot":
      return ROBOT_BACK;
    case "broke":
      return one("broke", brokeAt(state, event.what));
    case "wire-fixed":
      return STATIC.wire;
    case "modifier":
      if (event.kind === "mom-food") return event.value === 1 ? MOM : NONE;
      return VISITS[event.kind] ?? NONE;
    default:
      return NONE;
  }
}
