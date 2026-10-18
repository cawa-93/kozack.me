export class WallAttackersIndex {
  readonly #byWall = new Map<string, Set<string>>();
  readonly #byEnemy = new Map<string, string>();

  add(wallId: string, enemyId: string): void {
    this.removeEnemy(enemyId);
    let attackers = this.#byWall.get(wallId);
    if (attackers === undefined) {
      attackers = new Set<string>();
      this.#byWall.set(wallId, attackers);
    }
    attackers.add(enemyId);
    this.#byEnemy.set(enemyId, wallId);
  }

  removeEnemy(enemyId: string): void {
    const wallId = this.#byEnemy.get(enemyId);
    if (wallId === undefined) {
      return;
    }

    this.#byEnemy.delete(enemyId);
    const attackers = this.#byWall.get(wallId);
    attackers?.delete(enemyId);
    if (attackers?.size === 0) {
      this.#byWall.delete(wallId);
    }
  }

  releaseWall(wallId: string): readonly string[] {
    const attackers = this.#byWall.get(wallId);
    if (attackers === undefined) {
      return [];
    }

    const released = [...attackers];
    for (const enemyId of released) {
      this.#byEnemy.delete(enemyId);
    }
    this.#byWall.delete(wallId);
    return released;
  }

  attackersOf(wallId: string): ReadonlySet<string> {
    return this.#byWall.get(wallId) ?? new Set<string>();
  }
}
