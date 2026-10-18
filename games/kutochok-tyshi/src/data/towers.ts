import type {
  TowerDefinition,
  TowerType,
} from '../domain/structures/Tower';

export const TOWER_WALL_HP_BONUS = 50;
export const TOWER_RANGE_CELLS = 5;

function tower(
  id: TowerType,
  name: string,
  description: string,
  unlockLevel: number,
  cost: number,
  damagePerShot: number,
  shotsPerSecond: number,
  splashDamage = 0,
  adjacentSplashDamage = 0,
  rangeCells = TOWER_RANGE_CELLS,
  behavior: TowerDefinition['behavior'] = 'damage',
  charmDurationMs = 0,
): TowerDefinition {
  return Object.freeze({
    id,
    name,
    description,
    behavior,
    unlockLevel,
    cost,
    damagePerShot,
    shotsPerSecond,
    attackIntervalMs: 1_000 / shotsPerSecond,
    splashDamage,
    adjacentSplashDamage,
    rangeCells,
    charmDurationMs,
  });
}

export const BASIC_TOWER = tower('basic', 'Basic', 'Надійний кіт-чарівник.', 1, 5, 10, 1);
export const RAPID_TOWER = tower('rapid', 'Rapid', 'Швидко сипле іскрами.', 4, 8, 6, 2.5);
export const HEAVY_TOWER = tower('heavy', 'Heavy', 'Потужна магія проти натовпу.', 10, 11, 60, 0.2, 20, 15);
export const KITTEN_TOWER = tower(
  'kitten',
  'Кошенятко',
  'Неймовірно миленьке',
  16,
  110,
  0,
  0.125,
  0,
  0,
  10,
  'charm',
  2_000,
);

export const TOWER_DEFINITIONS: Readonly<Record<TowerType, TowerDefinition>> =
  Object.freeze({
    basic: BASIC_TOWER,
    rapid: RAPID_TOWER,
    heavy: HEAVY_TOWER,
    kitten: KITTEN_TOWER,
  });

export function getTowerDefinition(type: TowerType): TowerDefinition {
  return TOWER_DEFINITIONS[type];
}
