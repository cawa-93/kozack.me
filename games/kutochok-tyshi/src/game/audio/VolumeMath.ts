export function clampVolume(value: number): number {
  if (Number.isNaN(value) || value === Number.NEGATIVE_INFINITY) {
    return 0;
  }
  if (value === Number.POSITIVE_INFINITY) {
    return 1;
  }
  return Math.max(0, Math.min(1, value));
}

export function volumeAtSliderPosition(
  pointerX: number,
  trackStartX: number,
  trackWidth: number,
): number {
  if (!Number.isFinite(trackWidth) || trackWidth <= 0) {
    throw new RangeError('Slider width must be a positive finite number.');
  }
  return clampVolume((pointerX - trackStartX) / trackWidth);
}

export function sliderPositionForVolume(
  volume: number,
  trackStartX: number,
  trackWidth: number,
): number {
  if (!Number.isFinite(trackWidth) || trackWidth <= 0) {
    throw new RangeError('Slider width must be a positive finite number.');
  }
  return trackStartX + clampVolume(volume) * trackWidth;
}
