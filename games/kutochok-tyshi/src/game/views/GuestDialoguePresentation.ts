export const GUEST_DIALOGUE_MIN_INTERVAL_MS = 3_000;
export const GUEST_DIALOGUE_MAX_INTERVAL_MS = 12_000;
export const GUEST_DIALOGUE_LIFETIME_MS = 1_500;
export const GUEST_DIALOGUE_RADIUS_CELLS = 10;
export const MAX_GUEST_DIALOGUES = 8;

export interface GuestDialogueFrame {
  readonly alpha: number;
  readonly scale: number;
  readonly rise: number;
}

export function guestDialogueIntervalMs(randomUnit: number): number {
  assertRandomUnit(randomUnit);
  const inclusiveRange =
    GUEST_DIALOGUE_MAX_INTERVAL_MS - GUEST_DIALOGUE_MIN_INTERVAL_MS + 1;
  return GUEST_DIALOGUE_MIN_INTERVAL_MS + Math.floor(randomUnit * inclusiveRange);
}

export function isWithinGuestDialogueRadius(
  guestCellX: number,
  guestCellY: number,
  coreCellX: number,
  coreCellY: number,
): boolean {
  const deltaX = guestCellX - coreCellX;
  const deltaY = guestCellY - coreCellY;
  return deltaX * deltaX + deltaY * deltaY
    <= GUEST_DIALOGUE_RADIUS_CELLS * GUEST_DIALOGUE_RADIUS_CELLS;
}

export function guestDialogueFrame(elapsedMs: number): GuestDialogueFrame {
  if (!Number.isFinite(elapsedMs)) {
    throw new RangeError('Guest dialogue elapsed time must be finite.');
  }
  const elapsed = Math.max(0, Math.min(GUEST_DIALOGUE_LIFETIME_MS, elapsedMs));
  const intro = Math.min(1, elapsed / 110);
  const outro = Math.min(1, (GUEST_DIALOGUE_LIFETIME_MS - elapsed) / 130);
  const visibility = Math.min(intro, outro);
  return {
    alpha: visibility,
    scale: 0.82 + 0.18 * easeOutBack(intro),
    rise: -6 * (elapsed / GUEST_DIALOGUE_LIFETIME_MS),
  };
}

function easeOutBack(value: number): number {
  const overshoot = 1.35;
  const shifted = value - 1;
  return 1 + (overshoot + 1) * shifted ** 3 + overshoot * shifted ** 2;
}

function assertRandomUnit(randomUnit: number): void {
  if (!Number.isFinite(randomUnit) || randomUnit < 0 || randomUnit >= 1) {
    throw new RangeError('Random unit must be in the half-open range [0, 1).');
  }
}
