// Породи котів (§9.11, `BREEDS.md`): риси породи, схильності до хвороб і особливості зовнішності.
// Поки що лише безпородні; повний список порід додасть крок 12 плану.

export interface Breed {
  id: string;
  name: string;
  /** Риси породи: група рис (чи "size") → напрям «+» або «−». */
  traits: Readonly<Record<string, 1 | -1>>;
  /** Схильності до хвороб (`DISEASES.md`). */
  risks: readonly string[];
}

export const MIXED = "mixed";

export const BREEDS: readonly Breed[] = [
  { id: MIXED, name: "Безпородний", traits: { hardiness: 1, longevity: 1 }, risks: [] },
];

const BY_ID = new Map(BREEDS.map((b) => [b.id, b]));

export function breedById(id: string): Breed {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Немає породи «${id}»`);
  return found;
}

/**
 * Рівень породної риси (§9.11): чистокровний ±2, кожна половина суміші ±1, половинки додаються.
 * Безпородний ніколи не чистокровний: обидві половинки «безпородний» дають лише ±1.
 */
export function breedLevel(breed: readonly [string, string], group: string): number {
  const [a, b] = breed;
  const direction = (id: string): number => breedById(id).traits[group] ?? 0;
  if (a === MIXED && b === MIXED) return direction(MIXED);
  return direction(a) + direction(b);
}

/** Чистокровний: дві однакові справжні породи (§9.11). */
export function isPurebred(breed: readonly [string, string]): boolean {
  return breed[0] === breed[1] && breed[0] !== MIXED;
}
