export const HIGH_SCORE_STORAGE_KEY =
  'tower-defence:quiet-corner:survived-events-high-score:v1';

export interface HighScoreStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface HighScoreUpdateResult {
  readonly previous: number;
  readonly highScore: number;
  readonly isNewRecord: boolean;
}

function resolveBrowserStorage(): HighScoreStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function parseScore(value: string | null): number {
  if (value === null || value.trim().length === 0) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeCompletedLevels(completedLevels: number): number {
  return Number.isSafeInteger(completedLevels) && completedLevels >= 0
    ? completedLevels
    : 0;
}

export function readHighScore(
  storage: HighScoreStorage | null = resolveBrowserStorage(),
): number {
  if (storage === null) {
    return 0;
  }

  try {
    return parseScore(storage.getItem(HIGH_SCORE_STORAGE_KEY));
  } catch {
    return 0;
  }
}

export function updateHighScore(
  completedLevels: number,
  storage: HighScoreStorage | null = resolveBrowserStorage(),
): HighScoreUpdateResult {
  const previous = readHighScore(storage);
  const score = normalizeCompletedLevels(completedLevels);
  const isNewRecord = score > previous;

  if (isNewRecord && storage !== null) {
    try {
      storage.setItem(HIGH_SCORE_STORAGE_KEY, String(score));
    } catch {
      // Storage may be unavailable in private browsing or a restricted iframe.
    }
  }

  return {
    previous,
    highScore: isNewRecord ? score : previous,
    isNewRecord,
  };
}
