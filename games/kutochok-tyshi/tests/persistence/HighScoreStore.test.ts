import { describe, expect, it } from 'vitest';

import {
  HIGH_SCORE_STORAGE_KEY,
  readHighScore,
  updateHighScore,
  type HighScoreStorage,
} from '../../src/persistence/HighScoreStore';

class FakeStorage implements HighScoreStorage {
  readonly writes: Array<{ readonly key: string; readonly value: string }> = [];

  constructor(private value: string | null = null) {}

  getItem(key: string): string | null {
    return key === HIGH_SCORE_STORAGE_KEY ? this.value : null;
  }

  setItem(key: string, value: string): void {
    this.value = value;
    this.writes.push({ key, value });
  }
}

class ThrowingStorage implements HighScoreStorage {
  getItem(): string | null {
    throw new Error('Storage access denied');
  }

  setItem(): void {
    throw new Error('Storage access denied');
  }
}

describe('high score storage', () => {
  it('returns zero when storage or a stored value is absent', () => {
    expect(readHighScore(null)).toBe(0);
    expect(readHighScore(new FakeStorage())).toBe(0);
  });

  it('reads a valid non-negative safe integer', () => {
    expect(readHighScore(new FakeStorage('42'))).toBe(42);
    expect(readHighScore(new FakeStorage(String(Number.MAX_SAFE_INTEGER)))).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it.each(['not-a-score', '', '  ', '-1', '2.5', 'Infinity', '9007199254740992'])(
    'treats invalid stored value %j as zero',
    (storedValue) => {
      expect(readHighScore(new FakeStorage(storedValue))).toBe(0);
    },
  );

  it('stores and reports a strictly higher score as a new record', () => {
    const storage = new FakeStorage('7');

    expect(updateHighScore(9, storage)).toEqual({
      previous: 7,
      highScore: 9,
      isNewRecord: true,
    });
    expect(storage.writes).toEqual([
      { key: HIGH_SCORE_STORAGE_KEY, value: '9' },
    ]);
    expect(readHighScore(storage)).toBe(9);
  });

  it('does not store or report an equal score as a new record', () => {
    const storage = new FakeStorage('9');

    expect(updateHighScore(9, storage)).toEqual({
      previous: 9,
      highScore: 9,
      isNewRecord: false,
    });
    expect(storage.writes).toHaveLength(0);
  });

  it('keeps the previous record when the current score is lower', () => {
    const storage = new FakeStorage('9');

    expect(updateHighScore(4, storage)).toEqual({
      previous: 9,
      highScore: 9,
      isNewRecord: false,
    });
    expect(storage.writes).toHaveLength(0);
  });

  it('replaces a corrupt stored value with a valid new record', () => {
    const storage = new FakeStorage('oops');

    expect(updateHighScore(3, storage)).toEqual({
      previous: 0,
      highScore: 3,
      isNewRecord: true,
    });
    expect(readHighScore(storage)).toBe(3);
  });

  it.each([-1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'normalizes invalid current score %s to zero',
    (score) => {
      const storage = new FakeStorage('5');

      expect(updateHighScore(score, storage)).toEqual({
        previous: 5,
        highScore: 5,
        isNewRecord: false,
      });
      expect(storage.writes).toHaveLength(0);
    },
  );

  it('does not throw when storage access fails', () => {
    const storage = new ThrowingStorage();

    expect(readHighScore(storage)).toBe(0);
    expect(updateHighScore(6, storage)).toEqual({
      previous: 0,
      highScore: 6,
      isNewRecord: true,
    });
  });
});
