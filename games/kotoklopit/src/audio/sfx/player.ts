// Відтворення звуків (§11.4а): стиснені файли тримаємо в пам'яті, декодуємо на першу потребу й лише до межі — розкодований звук
// у 24 рази важчий за MP3. Нічого щокадру не створюється: вузли — лише на сам звук.

import { SFX } from "../config";
import type { AudioEngine } from "../engine";
import type { SoundFile } from "./files";

/** Скільки розкодованого звуку тримати, байт; найдавніше використане витісняється. */
const DECODED_LIMIT = 32 * 1024 * 1024;
/** Звук, що декодувався довше, ніж цей час, уже запізнився: не грати, мс. */
const LATE_MS = 250;

interface Decoded {
  buffer: AudioBuffer;
  /** Звідки починати разовий звук: тиша на початку від кодека, с. */
  lead: number;
  bytes: number;
}

export interface PlayOptions {
  bus: "world" | "ui";
  gain: number;
  pan: number;
  rate: number;
  /** Затримка від цієї миті, с. */
  delay: number;
}

/** Петля, що звучить: гучність і зсув змінюються плавно. */
export interface LoopVoice {
  set(gain: number, pan: number): void;
  stop(): void;
}

export class Player {
  private readonly bytes = new Map<string, Promise<ArrayBuffer | null>>();
  private readonly decoded = new Map<string, Decoded>();
  private readonly decoding = new Map<string, Promise<Decoded | null>>();
  private decodedBytes = 0;

  constructor(private readonly engine: AudioEngine) {}

  /** Стягнути стиснені файли наперед, по кілька водночас: потім перший звук чекатиме лише декодування. */
  async preload(files: readonly SoundFile[]): Promise<void> {
    const queue = [...files];
    const worker = async (): Promise<void> => {
      for (let file = queue.shift(); file; file = queue.shift()) await this.fetchBytes(file);
    };
    await Promise.all(Array.from({ length: SFX.parallelLoads }, worker));
  }

  /** Разовий звук. Файл ще не декодовано — зіграє, щойно буде, якщо не запізнився. */
  play(file: SoundFile, options: PlayOptions, onEnd: () => void): boolean {
    const context = this.engine.context;
    const bus = this.engine.buses?.[options.bus];
    if (!context || !bus || context.state !== "running") return false;
    const ready = this.decoded.get(file.key);
    if (ready) {
      this.touch(file.key, ready);
      this.start(context, bus, ready, options, onEnd);
      return true;
    }
    const asked = performance.now();
    void this.decode(file).then((decoded) => {
      if (decoded && performance.now() - asked < LATE_MS) this.start(context, bus, decoded, options, onEnd);
      else onEnd();
    });
    return true;
  }

  /** Петля з плавним входом. Файл ще не декодовано — увійде, щойно буде. */
  loop(file: SoundFile, options: Omit<PlayOptions, "delay" | "rate">): LoopVoice | null {
    const context = this.engine.context;
    const bus = this.engine.buses?.[options.bus];
    if (!context || !bus || context.state !== "running" || !file.loop) return null;
    const range = file.loop;
    const gain = context.createGain();
    gain.gain.value = 0;
    const panner = context.createStereoPanner();
    panner.pan.value = options.pan;
    gain.connect(panner).connect(bus);
    let source: AudioBufferSourceNode | null = null;
    let target = options.gain;
    let stopped = false;
    const begin = (decoded: Decoded): void => {
      if (stopped) return;
      source = context.createBufferSource();
      source.buffer = decoded.buffer;
      source.loop = true;
      source.loopStart = range.start;
      source.loopEnd = range.end;
      source.connect(gain);
      // Кожна петля — з випадкового місця кола: дві однакові не звучать в унісон.
      source.start(context.currentTime, range.start + Math.random() * (range.end - range.start));
      gain.gain.setTargetAtTime(target, context.currentTime, SFX.loopFade / 3);
    };
    const ready = this.decoded.get(file.key);
    if (ready) begin(ready);
    else void this.decode(file).then((decoded) => decoded && begin(decoded));
    return {
      set: (next, pan) => {
        if (Math.abs(next - target) > 0.01) {
          target = next;
          if (source) gain.gain.setTargetAtTime(next, context.currentTime, SFX.loopFade / 3);
        }
        if (Math.abs(panner.pan.value - pan) > 0.02) panner.pan.setTargetAtTime(pan, context.currentTime, SFX.loopFade / 3);
      },
      stop: () => {
        stopped = true;
        const now = context.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setTargetAtTime(0, now, SFX.loopFade / 3);
        const end = now + SFX.loopFade * 2;
        if (source) source.stop(end);
        window.setTimeout(() => gain.disconnect(), (SFX.loopFade * 2 + 0.1) * 1000);
      },
    };
  }

  private start(context: AudioContext, bus: GainNode, decoded: Decoded, options: PlayOptions, onEnd: () => void): void {
    const source = context.createBufferSource();
    source.buffer = decoded.buffer;
    source.playbackRate.value = options.rate;
    const gain = context.createGain();
    gain.gain.value = options.gain;
    let tail: AudioNode = gain;
    if (options.pan !== 0) {
      const panner = context.createStereoPanner();
      panner.pan.value = options.pan;
      gain.connect(panner);
      tail = panner;
    }
    source.connect(gain);
    tail.connect(bus);
    source.onended = () => {
      tail.disconnect();
      onEnd();
    };
    source.start(context.currentTime + options.delay, decoded.lead);
  }

  private fetchBytes(file: SoundFile): Promise<ArrayBuffer | null> {
    let bytes = this.bytes.get(file.key);
    if (!bytes) {
      bytes = fetch(file.url)
        .then((response) => (response.ok ? response.arrayBuffer() : null))
        .catch(() => null);
      this.bytes.set(file.key, bytes);
      // Мережа збоїла — наступна потреба спробує знову.
      void bytes.then((result) => result === null && this.bytes.delete(file.key));
    }
    return bytes;
  }

  private decode(file: SoundFile): Promise<Decoded | null> {
    const ready = this.decoded.get(file.key);
    if (ready) return Promise.resolve(ready);
    let pending = this.decoding.get(file.key);
    if (!pending) {
      pending = this.fetchBytes(file)
        .then(async (bytes) => {
          const context = this.engine.context;
          if (!bytes || !context) return null;
          // decodeAudioData забирає буфер, а стиснений файл ще знадобиться після витіснення.
          const buffer = await context.decodeAudioData(bytes.slice(0));
          const decoded: Decoded = { buffer, lead: file.loop ? 0 : leadOf(buffer), bytes: buffer.length * buffer.numberOfChannels * 4 };
          this.remember(file.key, decoded);
          return decoded;
        })
        .catch(() => null)
        .finally(() => this.decoding.delete(file.key));
      this.decoding.set(file.key, pending);
    }
    return pending;
  }

  private touch(key: string, decoded: Decoded): void {
    this.decoded.delete(key);
    this.decoded.set(key, decoded);
  }

  private remember(key: string, decoded: Decoded): void {
    this.decoded.set(key, decoded);
    this.decodedBytes += decoded.bytes;
    for (const [old, entry] of this.decoded) {
      if (this.decodedBytes <= DECODED_LIMIT || old === key) break;
      this.decoded.delete(old);
      this.decodedBytes -= entry.bytes;
    }
  }
}

/** Тиша на початку разового звуку: кодек MP3 додає її по-різному в різних браузерах, а звук має бути одразу. */
function leadOf(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0);
  const limit = Math.min(data.length, Math.round(buffer.sampleRate * 0.1));
  for (let i = 0; i < limit; i++) if (Math.abs(data[i]!) > SFX.leadThreshold) return i / buffer.sampleRate;
  return 0;
}
