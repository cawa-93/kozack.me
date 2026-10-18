import { describe, expect, it } from 'vitest';

import { BASIC_TOWER, HEAVY_TOWER } from '../../src/data/towers';
import { towerDamageForCellVictim } from '../../src/systems/TowerCombat';

describe('towerDamageForCellVictim', () => {
  it('applies direct damage only to the primary target for ordinary towers', () => {
    expect(towerDamageForCellVictim(BASIC_TOWER, 'primary')).toBe(10);
    expect(towerDamageForCellVictim(BASIC_TOWER, 'target-cell')).toBe(0);
    expect(towerDamageForCellVictim(BASIC_TOWER, 'adjacent-cell')).toBe(0);
  });

  it('applies the heavy direct, same-cell, and cardinal-cell damage zones', () => {
    expect(towerDamageForCellVictim(HEAVY_TOWER, 'primary')).toBe(80);
    expect(towerDamageForCellVictim(HEAVY_TOWER, 'target-cell')).toBe(20);
    expect(towerDamageForCellVictim(HEAVY_TOWER, 'adjacent-cell')).toBe(15);
  });
});
