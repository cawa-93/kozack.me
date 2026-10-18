import type {
  MineDefinition,
  MineType,
} from '../domain/structures/Mine';

export const SHEER_HEART_ATTACK: MineDefinition = Object.freeze({
  id: 'sheer-heart-attack',
  name: 'Sheer Heart Attack',
  description: 'Затамовує подих, а тоді стирає всіх гостей на рівні.',
  unlockLevel: 21,
  cost: 300,
  triggerDelayMs: 1_000,
  adjacentWallDamage: 10,
});

export const MINE_DEFINITIONS: Readonly<Record<MineType, MineDefinition>> =
  Object.freeze({
    'sheer-heart-attack': SHEER_HEART_ATTACK,
  });

export function getMineDefinition(type: MineType): MineDefinition {
  return MINE_DEFINITIONS[type];
}
