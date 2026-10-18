export interface NavigationProfile {
  readonly id: string;
  readonly cellsPerSecond: number;
  readonly damagePerHit: number;
  readonly attackIntervalMs: number;
  readonly instantWallBreak?: boolean;
}
