// Шина подій симуляції (§3 core/events): світ публікує, звук і рендер споживають раз на кадр.

import type { ActionKind, StageKind } from "./actions";
import type { ItemKind } from "./items";
import type { DoorVariant } from "../maze/grid";

export type GameEvent =
  | { type: "step"; x: number; y: number; sprint: boolean; surface: "floor" | "web" | "wornWeb" | "tornWeb" }
  | { type: "actionStart"; action: ActionKind; stage: StageKind }
  | { type: "actionStage"; action: ActionKind; stage: StageKind; item?: ItemKind }
  | { type: "actionCancel" }
  | { type: "actionFail"; stage: StageKind }
  | { type: "door"; variant: DoorVariant; open: boolean; x: number; y: number }
  | { type: "dynamoPress"; charge: number }
  | { type: "toggle"; kind: ItemKind; on: boolean }
  | { type: "matchStrike" }
  | { type: "flareIgnite" }
  | { type: "flareThrow" }
  | { type: "itemLand"; x: number; y: number; rolled: boolean }
  | { type: "webTrigger"; stinger: boolean }
  | { type: "webTear"; x: number; y: number }
  | { type: "webBurn"; x: number; y: number }
  | { type: "huntCry"; spider: number }
  | { type: "spitWindup"; spider: number }
  | { type: "spitFire"; spider: number }
  | { type: "spitHit" }
  | { type: "spitMiss"; x: number; y: number }
  | { type: "struggle"; count: number; wake: boolean }
  | { type: "freed" }
  | { type: "antidote" }
  | { type: "blackout" }
  | { type: "wake" }
  | { type: "death" }
  | { type: "exit"; final: boolean }
  | { type: "exhausted" };
