// Фабрика світу (крок 16, хвиля 0): за прапорцем графіки (`gfx.ts`) створює проєкцію й п'ять частин світу. Частини
// підміняються поодинці: щоб підключити ізометричну частину, досить замінити її будівника в `ISO` нижче — сцена про це
// не знає.

import type Phaser from "phaser";

import type { GameState } from "../../sim/types";
import type { GfxMode } from "../gfx";
import { LegacyApartmentView } from "../legacy/apartmentview";
import { LegacyCatsView } from "../legacy/catsview";
import { LegacyFloorView } from "../legacy/floorview";
import { LegacyMarksView } from "../legacy/marksview";
import { LegacyPen } from "../legacy/pen";
import { LegacyPersonView } from "../legacy/personview";
import type { PartContext } from "./context";
import type { ApartmentPart, CatsPart, PersonPart, WorldPart } from "./part";
import { OBLIQUE, type Projection } from "./projection";
import { World } from "./world";

/** Спільне для частин старого вигляду: пензель позначок (створюється, коли він потрібен першій такій частині). */
export interface LegacyKit {
  readonly pen: LegacyPen;
}

/** Як будувати світ: проєкція й будівник кожної частини. Ізометричним частинам `legacy` не потрібен. */
export interface WorldBuilders {
  /** Проєкція світу: її бере й камера, тож вона потрібна ще до частин. */
  projection: Projection;
  apartment(ctx: PartContext, legacy: LegacyKit): ApartmentPart;
  floor(ctx: PartContext, legacy: LegacyKit): WorldPart;
  marks(ctx: PartContext, legacy: LegacyKit): WorldPart;
  person(ctx: PartContext, legacy: LegacyKit): PersonPart;
  cats(ctx: PartContext, legacy: LegacyKit): CatsPart;
}

/** Старий вигляд: коса проєкція «три чверті» й малюнки кодом (`src/view/legacy/*`). */
const LEGACY: WorldBuilders = {
  projection: OBLIQUE,
  apartment: (ctx, legacy) => new LegacyApartmentView(ctx, legacy.pen),
  floor: (ctx, legacy) => new LegacyFloorView(ctx, legacy.pen),
  marks: (ctx, legacy) => new LegacyMarksView(ctx, legacy.pen),
  person: (ctx) => new LegacyPersonView(ctx),
  cats: (ctx, legacy) => new LegacyCatsView(ctx, legacy.pen),
};

/**
 * Нова графіка (`?gfx=iso`, `GRAPHICS_PLAN.md`). Поки ізометричних частин немає, це старий вигляд. Пакети підключають свої
 * частини тут, кожен — свій рядок: F3 — `projection` (ізометрична), `apartment` і `floor` (`src/view/iso/*`); T1 — `cats`;
 * T2 — `person`; T4 — `marks`. Що ще не підключили, лишається старим і стає на ізометричну підлогу за проєкцією.
 */
const ISO: WorldBuilders = { ...LEGACY };

export const WORLD_BUILDERS: Record<GfxMode, WorldBuilders> = { legacy: LEGACY, iso: ISO };

/**
 * Створити світ у шарі `layer`. Частини створюються так: квартира, куточок, позначки, персонаж (на тій самій глибині, що
 * й меблі, — поверх них), коти (їх створюють першого кадру). Порядок створення — порядок у списку відображення, а важить
 * він лише за однакової глибини: шар сортує за глибиною, зберігаючи порядок додавання.
 *
 * Пензель позначок старого вигляду (`LegacyPen`, глибина `WORLD_LAYERS.marks`) — не за цим порядком: його створює перша
 * стара частина, якій він потрібен, ще до своєї графіки. У старому вигляді це квартира, тож пензель — перший у списку,
 * раніше за підлогу; у змішаному світі його місце залежить від того, які частини ще старі. Нова частина на глибині
 * `WORLD_LAYERS.marks` не має покладатися на свій порядок відносно пензля.
 */
export function createWorld(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, builders: WorldBuilders, state: () => GameState): World {
  const world = new World(builders.projection);
  const ctx: PartContext = { scene, layer, projection: builders.projection, state, world };
  let pen: LegacyPen | null = null;
  const legacy: LegacyKit = {
    get pen() {
      return (pen ??= new LegacyPen(scene, layer));
    },
  };
  const apartment = builders.apartment(ctx, legacy);
  const floor = builders.floor(ctx, legacy);
  const marks = builders.marks(ctx, legacy);
  const person = builders.person(ctx, legacy);
  const cats = builders.cats(ctx, legacy);
  world.attach({ apartment, floor, marks, person, cats });
  return world;
}
