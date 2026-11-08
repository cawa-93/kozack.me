// З чим створюють частину світу (крок 16, хвиля 0): сцена й шар світу Phaser, проєкція, поточний стан гри й увесь світ.

import type Phaser from "phaser";

import type { GameState } from "../../sim/types";
import type { WorldQuery } from "./part";
import type { Projection } from "./projection";

export interface PartContext {
  scene: Phaser.Scene;
  /** Шар світу: його показує камера, що їде за персонажем (`Viewport.world`). */
  layer: Phaser.GameObjects.Layer;
  /** Як клітинки лягають на екран. */
  projection: Projection;
  /** Поточний стан гри: якорі питають його й поза кадром (бабл події летить за котом). */
  state: () => GameState;
  /** Увесь світ: точки персонажа й котів, якорі інших частин. */
  world: WorldQuery;
}
