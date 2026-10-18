import { describe, expect, it } from 'vitest';

import type { EnemyType } from '../../src/domain/enemies/EnemyDefinition';
import {
  getGuestDialogueCatalog,
  getGuestDialoguePhrase,
  GUEST_DIALOGUE_CATALOG,
  GUEST_DIALOGUE_MAX_LENGTH,
  GUEST_DIALOGUE_PHRASE_COUNTS,
} from '../../src/game/dialogue/GuestDialoguePhrases';

const ORDINARY_ENEMY_TYPES = Object.freeze([
  'weak',
  'fast',
  'strong',
] as const satisfies readonly EnemyType[]);

describe('guest dialogue phrases', () => {
  it('provides the requested exact catalog sizes', () => {
    expect(GUEST_DIALOGUE_PHRASE_COUNTS).toEqual({
      weak: 2_000,
      fast: 1_000,
      strong: 500,
      roach: 1,
    });

    for (const type of ORDINARY_ENEMY_TYPES) {
      expect(getGuestDialogueCatalog(type)).toHaveLength(
        GUEST_DIALOGUE_PHRASE_COUNTS[type],
      );
    }
  });

  it('keeps every ordinary phrase unique, compact, and cleanly spaced', () => {
    for (const type of ORDINARY_ENEMY_TYPES) {
      const catalog = getGuestDialogueCatalog(type);

      expect(new Set(catalog)).toHaveLength(catalog.length);
      for (const phrase of catalog) {
        expect(phrase).toBe(phrase.trim());
        expect(phrase).toMatch(/[А-ЯІЇЄҐа-яіїєґ]/u);
        expect(phrase).not.toMatch(/\s{2,}/u);
        expect([...phrase].length).toBeLessThanOrEqual(
          GUEST_DIALOGUE_MAX_LENGTH,
        );
      }
    }
  });

  it('gives Roach only its fixed horse call', () => {
    expect(GUEST_DIALOGUE_CATALOG.roach).toEqual(['І-Ґо-Ґо']);
    expect(getGuestDialoguePhrase('roach', 0)).toBe('І-Ґо-Ґо');
    expect(getGuestDialoguePhrase('roach', 10_000)).toBe('І-Ґо-Ґо');
  });

  it('uses stable cartesian ordering and wraps indexed reads', () => {
    expect(getGuestDialoguePhrase('weak', 0)).toBe('Гайда на каву');
    expect(getGuestDialoguePhrase('weak', 1)).toBe('Гайда на каву зараз');
    expect(getGuestDialoguePhrase('weak', 1_999)).toBe(
      'Рушаймо в гості на вихідних',
    );
    expect(getGuestDialoguePhrase('fast', 999)).toBe(
      'Вже мчимо в центр по обіді',
    );
    expect(getGuestDialoguePhrase('strong', 499)).toBe(
      'Гей, усі на танці до ночі',
    );
    expect(getGuestDialoguePhrase('weak', 2_000)).toBe(
      getGuestDialoguePhrase('weak', 0),
    );
  });

  it('exposes immutable catalogs and rejects invalid indexes', () => {
    expect(Object.isFrozen(GUEST_DIALOGUE_CATALOG)).toBe(true);
    for (const type of [...ORDINARY_ENEMY_TYPES, 'roach'] as const) {
      expect(Object.isFrozen(getGuestDialogueCatalog(type))).toBe(true);
    }

    expect(() => getGuestDialoguePhrase('weak', -1)).toThrow(RangeError);
    expect(() => getGuestDialoguePhrase('weak', 0.5)).toThrow(RangeError);
    expect(() => getGuestDialoguePhrase('weak', Number.NaN)).toThrow(RangeError);
    expect(() =>
      getGuestDialoguePhrase('weak', Number.MAX_SAFE_INTEGER + 1),
    ).toThrow(RangeError);
  });
});
