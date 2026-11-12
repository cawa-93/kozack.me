// Кодування петель звуків (`scripts/audio/sfx.ts`, `audio/SOUND.md`, «Ефекти»): коло замикається переходом кінця в початок;
// ритмічна петля (музика титрів) — рівно відрізок рецепта, щоб коло замикалося в такт.

import { describe, expect, it } from "vitest";

import { SAMPLE_RATE, SFX } from "../src/audio/config";
import { cut, loopSamples } from "../scripts/audio/sfxmath";

const SHAPE = { sampleRate: SAMPLE_RATE, crossfade: SFX.loopCrossfade, pad: SFX.loopPad };
const at = (seconds: number): number => Math.round(seconds * SAMPLE_RATE);
/** Оригінал — рівна драбинка: за значенням семпла видно, звідки він узявся. */
const ORIGINAL = Float32Array.from({ length: at(6) }, (_, i) => 1 + i / at(6));
const cutOut = (span: { start: number | undefined; end: number | undefined }): Float32Array => ORIGINAL.slice(at(span.start ?? 0), span.end === undefined ? undefined : at(span.end));

describe("кодування петель (§11.4а)", () => {
  it("ритмічна петля: коло — рівно end − start, а перехід у початок — з матеріалу за end", () => {
    const recipe = { loop: true, rhythm: true, start: 1, end: 3 };
    const span = cut(recipe, SFX.loopCrossfade);
    expect(span).toEqual({ start: 1, end: 3 + SFX.loopCrossfade });
    const { samples, start, length } = loopSamples(cutOut(span), recipe, SHAPE);
    expect(length).toBe(at(2));
    const body = samples.subarray(start, start + length);
    // Гучність вирівнюється множником; останній семпл кола — оригінал перед end, без змін.
    const k = body[length - 1]! / ORIGINAL[at(3) - 1]!;
    const fade = at(SFX.loopCrossfade);
    // Після кінця кола звучить те, що в оригіналі йде за end, і лише переходом — початок.
    expect(body[0]! / k).toBeCloseTo(ORIGINAL[at(3)]!, 4);
    expect(body[fade]! / k).toBeCloseTo(ORIGINAL[at(1) + fade]!, 4);
    // Запас по колу на краях файлу.
    expect(samples.length).toBe(length + 2 * at(SFX.loopPad));
    expect(samples[start - 1]).toBe(body[length - 1]);
    expect(samples[start + length]).toBe(body[0]);
  });

  it("ритмічна петля на шві не гучнішає: за end і на start — той самий удар, і перехід складає його без підсилення", () => {
    // Музика, що повторюється кожні 2 с: такт за end — той самий, що на start.
    const period = at(2);
    const music = Float32Array.from({ length: at(6) }, (_, i) => Math.sin((2 * Math.PI * (i % period)) / 997) * (1 - (i % period) / period));
    const recipe = { loop: true, rhythm: true, start: 1, end: 3, level: -20 };
    const span = cut(recipe, SFX.loopCrossfade);
    const { samples, start, length } = loopSamples(music.slice(at(1), at(span.end!)), recipe, SHAPE);
    const body = samples.subarray(start, start + length);
    const k = body[length - 1]! / music[at(3) - 1]!;
    for (let i = 0; i < at(SFX.loopCrossfade); i += 97) expect(body[i]! / k, `семпл ${i}`).toBeCloseTo(music[at(1) + i]!, 4);
  });

  it("звичайна петля (тло, побут) — як досі: коло коротше за відрізок на перехід, тож файли не перекодовуються", () => {
    const recipe = { loop: true, start: 1, end: 3 };
    const span = cut(recipe, SFX.loopCrossfade);
    expect(span).toEqual({ start: 1, end: 3 });
    const { length } = loopSamples(cutOut(span), recipe, SHAPE);
    expect(length).toBe(at(2) - at(SFX.loopCrossfade));
  });

  it("ритмічній петлі, за end якої бракує матеріалу на перехід, кодувальник відмовляє", () => {
    const recipe = { loop: true, rhythm: true, start: 1, end: 3 };
    expect(() => loopSamples(cutOut({ start: 1, end: 3.1 }), recipe, SHAPE)).toThrow(/end/);
    expect(() => cut({ loop: true, rhythm: true, start: 1 }, SFX.loopCrossfade)).toThrow(/end/);
  });
});
