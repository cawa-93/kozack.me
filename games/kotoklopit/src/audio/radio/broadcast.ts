// Ланцюг відтворення станції (§8.10). Шматки стають у чергу `AudioBufferSourceNode` точно до семпла, тож вони стикуються без
// шва, а годинник завжди правий: шматка немає — чути шум, втрачене пропадає, і звук повертається туди, де трансляція.
//
// Реальний час дробовий і великий (точність ~2·10⁻⁷ с), тож ним користуємось лише в мить настроювання. Далі ланцюг рахує цілі
// семпли: інакше округлення на межі шматка давало б мікровідрізки, а це клац щовісім секунд.

import { RADIO, SAMPLE_RATE, SFX } from "../config";
import type { AudioEngine } from "../engine";
import { timeoutSignal } from "../net";
import { soundFile } from "../sfx/files";
import type { ChunkStore } from "./chunks";
import { chunkKey, chunkOf, chunkSamples, chunkStart, nextSlot, slotAt, trackSamples, type ChunkRef, type Slot, type Station } from "./schedule";

const PRE_SAMPLES = RADIO.preFrames * RADIO.frameSamples;
const GAP_SAMPLES = Math.round(RADIO.gapSeconds * SAMPLE_RATE);
/** Згасання до шуму починається на чотири сталі раніше за кінець черги: обрив звучить уже на ~2% гучності. */
const FADE_SAMPLES = Math.round(((RADIO.crossfadeSeconds * 4) / 3) * SAMPLE_RATE);
/** Перевірка йде раз на `tickMs`: вихід у шум починаємо із запасом, щоб він встиг до кінця черги. */
const WARNING_SAMPLES = FADE_SAMPLES + Math.round((RADIO.tickMs / 1000) * SAMPLE_RATE);
/** `setTargetAtTime` наближається до мети плавно: за три такі сталі гучність проходить ~95% шляху. */
const FADE_CONSTANT = RADIO.crossfadeSeconds / 3;
const RELEASE_CONSTANT = RADIO.fadeSeconds / 3;

export class Broadcast {
  private station: Station | null = null;
  /** Гучність поточної станції: нею йдуть переходи. */
  private chain: GainNode | null = null;
  private noise: GainNode | null = null;
  private readonly sources = new Set<AudioBufferSourceNode>();
  /** Розкодовані шматки, що ще заграють (`ahead`): кожен важить мегабайти, тож те, що вже позаду, не тримаємо. */
  private readonly decoded = new Map<string, { ref: ChunkRef; buffer: AudioBuffer }>();
  private readonly decoding = new Set<string>();
  /** До якого семпла контексту ефір уже в черзі. */
  private cursor = 0;
  /** Що стане в чергу наступним: трек і семпл у ньому. */
  private slot: Slot | null = null;
  private sample = 0;
  /** Чути музику, а не шум. */
  private audible = false;

  constructor(
    private readonly engine: AudioEngine,
    private readonly store: ChunkStore,
    private readonly clock: () => number,
  ) {}

  /** Настроїтися на станцію, чи вимкнути (null). Те саме після паузи контексту: годинник контексту стояв. */
  tune(station: Station | null): void {
    this.release();
    this.station = station;
    const context = this.engine.context;
    if (!context || context.state !== "running" || !station || !this.engine.music) {
      this.quietNoise(context);
      return;
    }
    const chain = context.createGain();
    chain.gain.value = 0;
    chain.connect(this.engine.music);
    this.chain = chain;
    this.audible = false;
    this.seek(station, Math.ceil(context.currentTime * SAMPLE_RATE) + Math.round(RADIO.tuneSeconds * SAMPLE_RATE));
    // Готовий шматок встигне скасувати цей шум, і станція ввімкнеться без нього.
    this.fade(context, this.noiseGain(context), RADIO.staticLevel, context.currentTime + RADIO.noiseDelaySeconds);
    this.tick();
  }

  /** Поставити в чергу все, що вже можна; викликати регулярно. */
  tick(): void {
    const context = this.engine.context;
    const station = this.station;
    if (!context || context.state !== "running" || !station || !this.chain) return;
    const now = Math.ceil(context.currentTime * SAMPLE_RATE);
    if (this.cursor < now) {
      if (this.audible) this.toNoise(context, context.currentTime);
      this.seek(station, now);
    }
    const horizon = now + RADIO.queueSeconds * SAMPLE_RATE;
    let starved = false;
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
      if (!buffer) {
        starved = true;
        break;
      }
      this.play(context, buffer, chunk);
    }
    // Черга скоро скінчиться, а далі нічого: у шум ідемо заздалегідь, бо обірваний звук уже не згасити.
    if (starved && this.audible && this.cursor - now <= WARNING_SAMPLES) this.toNoise(context, Math.max(now, this.cursor - FADE_SAMPLES) / SAMPLE_RATE);
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
    for (const [key, entry] of this.decoded) if (!this.ahead(entry.ref)) this.decoded.delete(key);
  }

  /** Шматок ще заграє: той самий трек, не позаду місця, до якого дійшла черга. */
  private ahead(ref: ChunkRef): boolean {
    return this.slot !== null && this.slot.track.id === ref.track.id && ref.chunk >= chunkOf(this.sample);
  }

  private buffer(ref: ChunkRef): AudioBuffer | null {
    const key = chunkKey(ref);
    const ready = this.decoded.get(key);
    if (ready) return ready.buffer;
    if (this.decoding.has(key)) return null;
    const bytes = this.store.copy(ref);
    const context = this.engine.context;
    if (!bytes || !context) return null;
    this.decoding.add(key);
    context
      .decodeAudioData(bytes)
      .then((buffer) => {
        // Поки декодувався, ефір перескочив далі чи станцію перемкнули: такий шматок уже не заграє.
        if (!this.ahead(ref)) return;
        this.decoded.set(key, { ref, buffer });
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
    if (!this.audible) this.toMusic(context, this.cursor / SAMPLE_RATE);
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

  private toMusic(context: AudioContext, at: number): void {
    this.audible = true;
    this.fade(context, this.chain!, 1, at);
    this.fade(context, this.noiseGain(context), 0, at);
  }

  private toNoise(context: AudioContext, at: number): void {
    this.audible = false;
    this.fade(context, this.chain!, 0, at);
    this.fade(context, this.noiseGain(context), RADIO.staticLevel, at);
  }

  /** Плавно змінити гучність від миті `at`, скасувавши незавершений перехід. */
  private fade(context: AudioContext, node: GainNode, level: number, at: number): void {
    node.gain.cancelScheduledValues(context.currentTime);
    node.gain.setTargetAtTime(level, at, FADE_CONSTANT);
  }

  /** Обірвати поточну станцію: вона згасає, а не клацає. */
  private release(): void {
    const context = this.engine.context;
    const chain = this.chain;
    if (context && chain) {
      const now = context.currentTime;
      chain.gain.cancelScheduledValues(now);
      chain.gain.setTargetAtTime(0, now, RELEASE_CONSTANT);
      for (const source of this.sources) source.stop(now + RADIO.fadeSeconds * 2);
    }
    this.sources.clear();
    this.decoded.clear();
    this.chain = null;
    this.slot = null;
  }

  private quietNoise(context: AudioContext | null): void {
    if (context && this.noise) this.fade(context, this.noise, 0, context.currentTime);
  }

  /**
   * Гучність шуму ефіру. Вузол є одразу, а петлю з файлу (група `radio`) він отримує, щойно її декодовано: переходи йдуть як
   * завжди, першу мить хіба що тихо. Не завантажилась — наступне настроювання спробує знову.
   */
  private noiseGain(context: AudioContext): GainNode {
    if (this.noise) return this.noise;
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(this.engine.music!);
    this.noise = gain;
    void loadNoise(context).then((buffer) => {
      if (this.noise !== gain) return;
      if (!buffer) {
        gain.disconnect();
        this.noise = null;
        return;
      }
      const source = context.createBufferSource();
      source.buffer = buffer.data;
      source.loop = true;
      source.loopStart = buffer.loop.start;
      source.loopEnd = buffer.loop.end;
      source.connect(gain);
      source.start(0, buffer.loop.start);
    });
    return gain;
  }
}

/** Петля шуму ефіру: декодований файл і її коло в ньому, с; файлу немає чи мережа впала — null. */
async function loadNoise(context: AudioContext): Promise<{ data: AudioBuffer; loop: { start: number; end: number } } | null> {
  const file = soundFile("radio", "static");
  if (!file?.loop) return null;
  try {
    const response = await fetch(file.url, { signal: timeoutSignal(SFX.requestTimeoutMs) });
    if (!response.ok) return null;
    return { data: await context.decodeAudioData(await response.arrayBuffer()), loop: file.loop };
  } catch {
    return null;
  }
}
