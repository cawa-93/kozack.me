// Обробка семплів для `sfx.ts` (§11.4а): чисті функції без ffmpeg і файлів — їх перевіряє `tests/sfx-encode.test.ts`. Без
// імпортів: сталі передає `sfx.ts`, тож модуль однаково беруть і Node, і тести.

/** Що з рецепта (`Recipe`, `src/audio/sfx/sourcetypes.ts`) потрібно відрізку й петлі. */
export interface Span {
  start?: number;
  end?: number;
  loop?: boolean;
  rhythm?: boolean;
  level?: number;
}

/** Будова петлі: частота, перехід кінця в початок і запас по колу на краях файлу, с. */
export interface LoopShape {
  sampleRate: number;
  crossfade: number;
  pad: number;
}

export const db = (level: number): number => 10 ** (level / 20);

export function peak(data: Float32Array): number {
  let max = 0;
  for (const sample of data) max = Math.max(max, Math.abs(sample));
  return max;
}

export function rms(data: Float32Array): number {
  let sum = 0;
  for (const sample of data) sum += sample * sample;
  return Math.sqrt(sum / Math.max(1, data.length));
}

export function scale(data: Float32Array, factor: number): void {
  for (let i = 0; i < data.length; i++) data[i]! *= factor;
}

const isRhythm = (span: Span): boolean => span.loop === true && span.rhythm === true;

/** Скільки матеріалу на перехід ритмічної петлі може бракувати через округлення ffmpeg, с; більше — справді бракує. */
const RHYTHM_SLACK = 0.001;

/** Що вирізати з оригіналу, с. Ритмічній петлі — ще `crossfade` за `end`: з цього матеріалу її кінець переходить у початок. */
export function cut(span: Span, crossfade: number): { start: number | undefined; end: number | undefined } {
  if (!isRhythm(span)) return { start: span.start, end: span.end };
  if (span.end === undefined) throw new Error("ритмічна петля — лише з end: перехід береться з матеріалу за ним");
  return { start: span.start, end: span.end + crossfade };
}

/**
 * Петля з вирізаного (`cut`): кінець плавно переходить у початок, гучність за RMS (`level`, типово −20 дБ FS), пік не вище
 * −1 дБ FS. Звичайна петля коротша за відрізок на перехід; ритмічна — рівно `end − start`, щоб коло замикалося в такт.
 * Повертає файл із запасом по колу й межі кола в ньому, семпли.
 */
export function loopSamples(data: Float32Array, span: Span, shape: LoopShape): { samples: Float32Array; start: number; length: number } {
  const rhythm = isRhythm(span);
  let fade = Math.min(Math.round(shape.crossfade * shape.sampleRate), Math.floor(data.length / 4));
  let length = data.length - fade;
  if (rhythm) {
    fade = Math.round(shape.crossfade * shape.sampleRate);
    length = Math.round(((span.end ?? 0) - (span.start ?? 0)) * shape.sampleRate);
    // Кінець вирізаного відрізка різні збірки ffmpeg округлюють (обрізка й перерахунок частоти) з різницею в кілька семплів:
    // бракує стількох — перехід на них коротший, а коло те саме.
    const short = length + fade - data.length;
    if (short > Math.round(RHYTHM_SLACK * shape.sampleRate)) throw new Error(`ритмічна петля: за end бракує ${(short / shape.sampleRate).toFixed(3)} с матеріалу на перехід`);
    if (short > 0) fade -= short;
  }
  const body = data.slice(0, length);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    // Рівна потужність (sin/cos) — для різного звуку на краях. Ритмічну ріжуть по тактах, тож за end і на start звучить той
    // самий удар: рівні ваги складають його як є, а рівна потужність підсилила б удар на шві (до +3 дБ).
    const [into, out] = rhythm ? [t, 1 - t] : [Math.sin((t * Math.PI) / 2), Math.cos((t * Math.PI) / 2)];
    body[i] = data[i]! * into + data[length + i]! * out;
  }
  const level = rms(body);
  if (level > 0) scale(body, db(span.level ?? -20) / level);
  const top = peak(body);
  if (top > db(-1)) scale(body, db(-1) / top);
  const pad = Math.min(Math.round(shape.pad * shape.sampleRate), length);
  const samples = new Float32Array(length + pad * 2);
  samples.set(body.subarray(length - pad), 0);
  samples.set(body, pad);
  samples.set(body.subarray(0, pad), pad + length);
  return { samples, start: pad, length };
}
