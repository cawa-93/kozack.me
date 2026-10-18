export function selectCharmBubbleEnemyIds(
  affectedEnemyIds: readonly string[],
  activationOrdinal: number,
): readonly string[] {
  if (affectedEnemyIds.length === 0) {
    return Object.freeze([]);
  }

  const count = Math.min(
    affectedEnemyIds.length,
    8,
    Math.max(1, Math.round(affectedEnemyIds.length * 2 / 15)),
  );
  const start = activationOrdinal % affectedEnemyIds.length;
  const selected: string[] = [];
  const selectedIndexes = new Set<number>();
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    let index = (
      start + Math.floor(ordinal * affectedEnemyIds.length / count)
    ) % affectedEnemyIds.length;
    while (selectedIndexes.has(index)) {
      index = (index + 1) % affectedEnemyIds.length;
    }
    selectedIndexes.add(index);
    selected.push(affectedEnemyIds[index] ?? affectedEnemyIds[0] ?? '');
  }
  return Object.freeze(selected.filter((id) => id.length > 0));
}
