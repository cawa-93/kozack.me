// Ланцюг відтворення станції (§8.10). Шматки стають у чергу `AudioBufferSourceNode` точно до семпла, тож вони стикуються без
// шва, а годинник завжди правий: шматок не встиг — грає шум ефіру, втрачене пропадає, і звук повертається туди, де трансляція.
//
// Реальний час дробовий і великий (точність ~2·10⁻⁷ с), тож ним користуємось лише в мить настроювання. Далі ланцюг рахує цілі
// семпли: інакше округлення на межі шматка давало б мікровідрізки, а це клац щовісім секунд.

import { RADIO, SAMPLE_RATE } from "../config";
import type { AudioEngine } from "../engine";
import type { ChunkStore } from "./chunks";
import { chunkKey, chunkOf, chunkSamples, chunkStart, nextSlot, slotAt, trackSamples, type ChunkRef, type Slot, type Station } from "./schedule";

const PRE_SAMPLES = RADIO.preFrames * RADIO.frameSamples;
const GAP_SAMPLES = Math.round(RADIO.gapSeconds * SAMPLE_RATE);

export class Broadcast {
  private station: Station | null = null;
  /** Гучність поточної станції: щоб обірвати її без клацання. */
  private chain: GainNode | null = null;
  private noise: GainNode | null = null;
  private readonly sources = new Set<AudioBufferSourceNode>();
  private readonly decoded = new Map<string, AudioBuffer>();
  private readonly decoding = new Set<string>();
  /** До якого семпла контексту ефір уже в черзі. */
  private cursor = 0;
  /** Що стане в чергу наступним: трек і семпл у ньому. */
  private slot: Slot | null = null;
  private sample = 0;
  private noisy = false;

  constructor(
    private readonly engine: AudioEngine,
    private readonly store: ChunkStore,
    private readonly clock: () => number,
  ) {}

  /** Настроїтися на станцію, чи вимкнути (null). Те саме після паузи контексту: годинник контексту стояв. */
  tune(station: Station | null): void {
    this.silence();
    this.station = station;
    const context = this.engine.context;
    if (!context || context.state !== "running" || !station || !this.engine.music) return;
    const chain = context.createGain();
    chain.connect(this.engine.music);
    this.chain = chain;
    this.seek(station, Math.ceil(context.currentTime * SAMPLE_RATE) + Math.round(RADIO.tuneSeconds * SAMPLE_RATE));
    this.setNoise(true);
    this.tick();
  }

  /** Поставити в чергу все, що вже можна; викликати регулярно. */
  tick(): void {
    const context = this.engine.context;
    const station = this.station;
    if (!context || context.state !== "running" || !station || !this.chain) return;
    const now = Math.ceil(context.currentTime * SAMPLE_RATE);
    if (this.cursor < now) this.seek(station, now);
    const horizon = now + RADIO.queueSeconds * SAMPLE_RATE;
    while (this.cursor < horizon && this.slot) {
      const { track } = this.slot;
      if (this.sample >= trackSamples(track)) {
        this.slot = nextSlot(station, this.slot);
        this.sample = 0;
        this.cursor += GAP_SAMPLES;
        continue;
      }
      const chunk = chunkOf(this.sample);
      const buffer = this.buffer({ track, chunk });
      if (!buffer) break;
      this.play(context, buffer, chunk);
    }
    this.setNoise(this.cursor <= now);
  }

  /** Перейти туди, де трансляція буде на цьому семплі контексту; у паузі між треками — лишити її тишею. */
  private seek(station: Station, sample: number): void {
    const context = this.engine.context;
    if (!context) return;
    const air = this.clock() + sample / SAMPLE_RATE - context.currentTime;
    const slot = slotAt(station, air);
    this.slot = slot;
    this.sample = Math.max(0, Math.round((air - slot.start) * SAMPLE_RATE));
    this.cursor = sample + Math.max(0, Math.round((slot.start - air) * SAMPLE_RATE));
  }

  private buffer(ref: ChunkRef): AudioBuffer | null {
    const key = chunkKey(ref);
    const ready = this.decoded.get(key);
    if (ready) return ready;
    if (this.decoding.has(key)) return null;
    const bytes = this.store.copy(ref);
    const context = this.engine.context;
    if (!bytes || !context) return null;
    this.decoding.add(key);
    context
      .decodeAudioData(bytes)
      .then((buffer) => {
        this.decoded.set(key, buffer);
        this.tick();
      })
      .catch(() => {
        // Биті байти: станція йде далі з шумом, наступний шматок відновить звук.
      })
      .finally(() => this.decoding.delete(key));
    return null;
  }

  private play(context: AudioContext, buffer: AudioBuffer, chunk: number): void {
    const track = this.slot!.track;
    const inChunk = this.sample - chunkStart(chunk);
    const samples = chunkSamples(track, chunk) - inChunk;
    const skip = chunk === 0 ? 0 : PRE_SAMPLES;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.chain!);
    source.addEventListener("ended", () => this.sources.delete(source));
    source.start(this.cursor / SAMPLE_RATE, (skip + inChunk) / SAMPLE_RATE, samples / SAMPLE_RATE);
    this.sources.add(source);
    this.decoded.delete(chunkKey({ track, chunk }));
    this.cursor += samples;
    this.sample += samples;
  }

  private silence(): void {
    const context = this.engine.context;
    const chain = this.chain;
    if (context && chain) {
      const end = context.currentTime + RADIO.fadeSeconds;
      chain.gain.setValueAtTime(chain.gain.value, context.currentTime);
      chain.gain.linearRampToValueAtTime(0, end);
      for (const source of this.sources) source.stop(end);
    }
    this.sources.clear();
    this.decoded.clear();
    this.chain = null;
    this.slot = null;
    this.setNoise(false);
  }

  private setNoise(on: boolean): void {
    if (on === this.noisy) return;
    const context = this.engine.context;
    const music = this.engine.music;
    if (!context || !music) return;
    this.noisy = on;
    this.noise ??= startNoise(context, music);
    this.noise.gain.setTargetAtTime(on ? RADIO.staticLevel : 0, context.currentTime, 0.02);
  }
}

/**
 * ТИМЧАСОВО (§8.10): шум ефіру створюється один раз під час гри, бо звук ще не обрано. До релізу замінити файлом.
 * Це 2 секунди приглушеного шуму по колу.
 */
function startNoise(context: AudioContext, output: AudioNode): GainNode {
  const buffer = context.createBuffer(1, 2 * SAMPLE_RATE, SAMPLE_RATE);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = last * 0.82 + (Math.random() * 2 - 1) * 0.18;
    data[i] = last * 3;
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const gain = context.createGain();
  gain.gain.value = 0;
  source.connect(gain);
  gain.connect(output);
  source.start();
  return gain;
}
