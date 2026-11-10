// Рух стрічки титрів життя (§4.2): чиста арифметика, щоб перевірити її без браузера.

/**
 * Титул під звук кінця гри (`ui/end`, «game over 3»): три написи — на три його удари, мс від початку звуку; `endMs` — коли звук
 * стихає: тоді титул їде вгору й вступає музика. Числа — заміри закодованого файлу `audio/sfx/ui/end.mp3`.
 */
export const CREDITS_INTRO = { beatsMs: [1893, 2829, 3818], endMs: 5640 } as const;

/**
 * Музика під титрами (`ui/credits`): вступає, щойно стихає кінець гри, і швидко наростає. `barMs` — такт петлі: вона рівно 60
 * тактів (рецепт `credits` в `audio/sfx/ui/sources.json`).
 */
export const CREDITS_MUSIC = { delayMs: CREDITS_INTRO.endMs, fadeMs: 600, barMs: (117.051 - 14.212) * (1000 / 60) } as const;

/** Гучність музики титрів через `ms` від появи стрічки: 0…1. */
export function creditsMusicGain(ms: number): number {
  return Math.min(1, Math.max(0, (ms - CREDITS_MUSIC.delayMs) / CREDITS_MUSIC.fadeMs));
}

/**
 * Ритм стрічки: висота екрана проїжджає за `barsPerScreen` тактів музики, тож стрічка йде в такт; `fast` — у скільки разів
 * швидше, поки тримають; `maxStepMs` — найдовший крок кадру: після вкладки у фоні стрічка не перестрибує; `gapBeats` — щонайменший
 * проміжок між блоками, у долях.
 */
export const ROLL = { barsPerScreen: 6, fast: 6, maxStepMs: 100, gapBeats: 1 } as const;

/** Швидкість стрічки, px/мс. */
export function rollSpeed(viewport: number): number {
  return viewport / (ROLL.barsPerScreen * CREDITS_MUSIC.barMs);
}

/** Скільки стрічка проїжджає за долю такту, px: на цю сітку стають блоки. */
export function beatPx(viewport: number): number {
  return viewport / (ROLL.barsPerScreen * 4);
}

/** Допуск сітки, px: менше — уже в ритмі. */
const ON_BEAT = 0.5;

/**
 * Наступний зсув стрічки, px; `musicMs` — скільки музика грає після цього кадру. Поки тримають — швидше; відпустили — стрічка
 * доганяє найближчу долю на тій самій швидкості й далі йде в ритмі, тож блоки знову виїжджають на удар.
 */
export function rollOffset(offset: number, dtMs: number, viewport: number, end: number, holding: boolean, musicMs: number): number {
  const dt = Math.min(dtMs, ROLL.maxStepMs);
  const speed = rollSpeed(viewport);
  const fast = offset + speed * ROLL.fast * dt;
  if (holding) return Math.min(end, Math.max(0, fast));
  const beat = beatPx(viewport);
  const normal = offset + speed * dt;
  const ahead = (((normal - speed * musicMs) % beat) + beat) % beat;
  if (ahead < ON_BEAT || beat - ahead < ON_BEAT) return Math.min(end, Math.max(0, normal));
  return Math.min(end, Math.max(0, Math.min(fast, normal + (beat - ahead))));
}

/** Висота місця блоку: ціле число долей, щонайменше з проміжком `gapBeats`, — тож кожен блок виїжджає знизу на удар. */
export function slotHeight(height: number, viewport: number): number {
  const beat = beatPx(viewport);
  return Math.ceil((height + beat * ROLL.gapBeats - 1e-6) / beat) * beat;
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
