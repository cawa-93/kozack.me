export const DEVELOPMENT_LEVEL_QUERY_PARAMETER = 'devLevel';
export const DEVELOPMENT_COIN_BONUS = 1_000;

export interface DevelopmentLaunch {
  readonly initialLevelNumber: number;
  readonly initialCoinBonus: number;
}

export function parseDevelopmentLevel(value: string): number | null {
  if (!/^[1-9]\d*$/u.test(value)) {
    return null;
  }

  const levelNumber = Number(value);
  return Number.isSafeInteger(levelNumber) ? levelNumber : null;
}

export function resolveDevelopmentLaunch(
  isDevelopment: boolean,
  search: string,
): DevelopmentLaunch | null {
  if (!isDevelopment) {
    return null;
  }

  const values = new URLSearchParams(search).getAll(
    DEVELOPMENT_LEVEL_QUERY_PARAMETER,
  );
  if (values.length !== 1) {
    return null;
  }

  const initialLevelNumber = parseDevelopmentLevel(values[0] ?? '');
  return initialLevelNumber === null
    ? null
    : Object.freeze({
        initialLevelNumber,
        initialCoinBonus: DEVELOPMENT_COIN_BONUS,
      });
}

export function developmentLevelUrl(
  currentHref: string,
  levelNumber: number,
): string {
  const normalizedLevel = parseDevelopmentLevel(String(levelNumber));
  if (normalizedLevel === null) {
    throw new RangeError(
      'A development level must be a positive safe integer.',
    );
  }

  const url = new URL(currentHref);
  url.searchParams.set(
    DEVELOPMENT_LEVEL_QUERY_PARAMETER,
    String(normalizedLevel),
  );
  return url.href;
}
