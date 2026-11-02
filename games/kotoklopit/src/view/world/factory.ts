// Фабрика світу (крок 16): проєкція й шість частин світу — ізометрія 2:1 (`GRAPHICS_PLAN.md`, `src/view/iso/*`). Частини
// незалежні: кожна малює свій шматок світу, а одна одну питають через `World`, тож будь-яку можна замінити окремо, не
// чіпаючи сцени.

import type Phaser from "phaser";

import type { GameState } from "../../sim/types";
import { IsoApartmentView } from "../iso/apartment";
import { IsoCatsView } from "../iso/cats";
import { IsoFloorView } from "../iso/floor";
import { IsoLightView } from "../iso/light";
import { IsoMarksView } from "../iso/marks";
import { IsoPersonView } from "../iso/person";
import type { PartContext } from "./context";
import type { ApartmentPart, CatsPart, PersonPart, WorldPart } from "./part";
import { ISO, type Projection } from "./projection";
import { World } from "./world";

/** Як будувати світ: проєкція й будівник кожної частини. */
export interface WorldBuilders {
  /** Проєкція світу: її бере й камера, тож вона потрібна ще до частин. */
  projection: Projection;
  apartment(ctx: PartContext): ApartmentPart;
  floor(ctx: PartContext): WorldPart;
  marks(ctx: PartContext): WorldPart;
  person(ctx: PartContext): PersonPart;
  cats(ctx: PartContext): CatsPart;
  light(ctx: PartContext): WorldPart;
}

/** Світ гри: ізометрична проєкція й частини на кадрах атласу арту. */
export const WORLD_BUILDERS: WorldBuilders = {
  projection: ISO,
  // Квартира й котячий куточок на кадрах маніфесту (F3b).
  apartment: (ctx) => new IsoApartmentView(ctx),
  floor: (ctx) => new IsoFloorView(ctx),
  // Позначки: підсвітка цілі, смуги прогресу, пошук роботи й екран комп'ютера в манері арту (T4).
  marks: (ctx) => new IsoMarksView(ctx),
  // Персонаж на скелеті з запеченими частинами, тінню й гніздами (T2).
  person: (ctx) => new IsoPersonView(ctx),
  // Коти на скелетах із запеченою шерстю (T1).
  cats: (ctx) => new IsoCatsView(ctx),
  // Світло доби (§8.9): карта світла множенням, промені й сяйва додаванням — м'якими градієнтами з коду.
  light: (ctx) => new IsoLightView(ctx),
};

/**
 * Створити світ у шарі `layer`. Частини створюються так: квартира, куточок, позначки, персонаж (на тій самій глибині, що
 * й меблі, — поверх них), коти (їх створюють першого кадру), світло доби (його зображення — з першою ніччю). Порядок створення — порядок у списку відображення, а важить
 * він лише за однакової глибини: шар сортує за глибиною, зберігаючи порядок додавання.
 */
export function createWorld(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, builders: WorldBuilders, state: () => GameState): World {
  const world = new World(builders.projection);
  const ctx: PartContext = { scene, layer, projection: builders.projection, state, world };
  const apartment = builders.apartment(ctx);
  const floor = builders.floor(ctx);
  const marks = builders.marks(ctx);
  const person = builders.person(ctx);
  const cats = builders.cats(ctx);
  const light = builders.light(ctx);
  world.attach({ apartment, floor, marks, person, cats, light });
  return world;
}
