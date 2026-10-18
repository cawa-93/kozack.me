import type { EnemyType } from '../domain/enemies/EnemyDefinition';
import type { BonusOffer, BonusType } from '../domain/bonuses';
import type { GridPoint } from '../domain/grid/GridPoint';
import type {
  DamageTowerType,
  TowerType,
} from '../domain/structures/Tower';
import type { MineType } from '../domain/structures/Mine';

export type SimulationEvent =
  | {
      readonly type: 'enemy-spawned';
      readonly enemyId: string;
      readonly enemyType: EnemyType;
    }
  | {
      readonly type: 'tower-shot';
      readonly towerId: string;
      readonly towerType: DamageTowerType;
      readonly targetEnemyId: string;
      readonly from: GridPoint;
      readonly to: GridPoint;
      readonly damage: number;
      readonly splashDamage: number;
      readonly adjacentSplashDamage: number;
    }
  | {
      readonly type: 'kitten-meowed';
      readonly towerId: string;
      readonly from: GridPoint;
      readonly radiusCells: number;
      readonly durationMs: number;
      readonly affectedEnemyIds: readonly string[];
      readonly bubbleEnemyIds: readonly string[];
    }
  | {
      readonly type: 'enemy-damaged';
      readonly enemyId: string;
      readonly towerId: string;
      readonly damage: number;
      readonly remainingHp: number;
      readonly damageZone: 'primary' | 'target-cell' | 'adjacent-cell';
      readonly position: GridPoint;
    }
  | {
      readonly type: 'enemy-killed';
      readonly enemyId: string;
      readonly towerId: string;
    }
  | {
      readonly type: 'tower-destroyed';
      readonly towerId: string;
      readonly towerType: TowerType;
      readonly position: GridPoint;
    }
  | {
      readonly type: 'wall-shot';
      readonly enemyId: string;
      readonly wallId: string;
      readonly from: GridPoint;
      readonly to: GridPoint;
    }
  | {
      readonly type: 'wall-destroyed';
      readonly wallId: string;
      readonly position: GridPoint;
    }
  | {
      readonly type: 'wall-sold';
      readonly wallId: string;
      readonly position: GridPoint;
    }
  | {
      readonly type: 'mine-triggered';
      readonly mineId: string;
      readonly mineType: MineType;
      readonly position: GridPoint;
      readonly triggerDelayMs: number;
    }
  | {
      readonly type: 'mine-detonated';
      readonly mineId: string;
      readonly mineType: MineType;
      readonly position: GridPoint;
      readonly killedEnemyCount: number;
      readonly damagedWallPositions: readonly GridPoint[];
    }
  | {
      readonly type: 'mine-sold';
      readonly mineId: string;
      readonly mineType: MineType;
      readonly position: GridPoint;
    }
  | {
      readonly type: 'navigation-rebuilt';
      readonly gridRevision: number;
    }
  | {
      readonly type: 'enemy-reached-core';
      readonly enemyId: string;
      readonly damage: number;
    }
  | {
      readonly type: 'enemy-healed-core';
      readonly enemyId: string;
      readonly healing: number;
    }
  | {
      readonly type: 'level-started';
      readonly levelNumber: number;
    }
  | {
      readonly type: 'level-completed';
      readonly levelNumber: number;
    }
  | {
      readonly type: 'bonus-offered';
      readonly offer: BonusOffer;
    }
  | {
      readonly type: 'bonus-selected';
      readonly bonusType: BonusType;
      readonly stackCount: number;
    }
  | { readonly type: 'bonus-skipped' }
  | { readonly type: 'level-victory' }
  | { readonly type: 'level-defeat' };
