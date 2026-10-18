import { describe, expect, it } from 'vitest';

import {
  DEVELOPMENT_COIN_BONUS,
  developmentLevelUrl,
  parseDevelopmentLevel,
  resolveDevelopmentLaunch,
} from '../../src/dev/DevelopmentLaunch';

describe('development level launch', () => {
  it.each([
    ['1', 1],
    ['10', 10],
    [String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
  ])('parses a canonical positive safe integer: %s', (value, expected) => {
    expect(parseDevelopmentLevel(value)).toBe(expected);
  });

  it.each([
    '',
    '0',
    '-1',
    '1.5',
    '1e2',
    '+2',
    '01',
    ' 3 ',
    String(Number.MAX_SAFE_INTEGER + 1),
  ])('rejects an invalid level value: %s', (value) => {
    expect(parseDevelopmentLevel(value)).toBeNull();
  });

  it('resolves exactly one devLevel only in development mode', () => {
    expect(resolveDevelopmentLaunch(true, '?devLevel=10')).toEqual({
      initialLevelNumber: 10,
      initialCoinBonus: DEVELOPMENT_COIN_BONUS,
    });
    expect(resolveDevelopmentLaunch(false, '?devLevel=10')).toBeNull();
    expect(resolveDevelopmentLaunch(true, '')).toBeNull();
    expect(resolveDevelopmentLaunch(true, '?devLevel=4&devLevel=10')).toBeNull();
    expect(resolveDevelopmentLaunch(true, '?devLevel=invalid')).toBeNull();
  });

  it('preserves unrelated query state while replacing the development level', () => {
    expect(
      developmentLevelUrl('http://localhost:5173/?mute=1&devLevel=4', 12),
    ).toBe('http://localhost:5173/?mute=1&devLevel=12');
    expect(() => developmentLevelUrl('http://localhost:5173/', 0)).toThrow(
      RangeError,
    );
  });
});
