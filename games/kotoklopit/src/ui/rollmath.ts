// Рух стрічки титрів життя (§4.2): чиста арифметика, щоб перевірити її без браузера.

/**
 * Ритм стрічки: `speed` — частка висоти екрана за секунду (тож на телефоні й моніторі стрічка однаково неспішна), `fast` — у скільки
 * разів швидше, поки тримають; `maxStepMs` — найдовший крок кадру: після вкладки у фоні стрічка не перестрибує; `startMs` — пауза
 * на титулі перед рушанням.
 */
export const ROLL = { speed: 0.13, fast: 6, maxStepMs: 100, startMs: 2200 } as const;

/**
 * Музика під титрами (§4.2): `delayMs` — мовчить, поки звучить кінець гри (звук `end` групи `ui` ≈ 5,6 с), `fadeMs` — далі
 * плавно наростає.
 */
export const CREDITS_MUSIC = { delayMs: 4500, fadeMs: 3000 } as const;

/** Гучність музики титрів через `ms` від появи стрічки: 0…1. */
export function creditsMusicGain(ms: number): number {
  return Math.min(1, Math.max(0, (ms - CREDITS_MUSIC.delayMs) / CREDITS_MUSIC.fadeMs));
}

/** Наступний зсув стрічки, px. */
export function rollOffset(offset: number, dtMs: number, viewport: number, end: number, holding: boolean): number {
  const step = (ROLL.speed * (holding ? ROLL.fast : 1) * viewport * Math.min(dtMs, ROLL.maxStepMs)) / 1000;
  return Math.min(end, Math.max(0, offset + step));
}

/** Де стрічка зупиняється: її низ (з «Новою грою») — біля низу екрана. */
export function rollEnd(trackHeight: number, viewport: number): number {
  return Math.max(0, trackHeight - viewport);
}

/** Нахил і зсув полароїда, наче їх розклали руками: по черзі в різні боки, трохи різні. */
export function polaroidTilt(index: number): { rot: number; shift: number } {
  const side = index % 2 === 0 ? -1 : 1;
  const wobble = [1.6, 2.4, 1.1, 2.9, 2][index % 5] ?? 2;
  return { rot: side * wobble, shift: side * (3 + (index % 3) * 2) };
}
