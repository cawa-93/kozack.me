// Програвач сторінки звуків: файли декодуються на першу потребу, звучить щось одне. Петля грає колом між мітками `encoded.json`,
// як у грі (`src/audio/sfx/player.ts`), поки її не зупинять; разові звуки звучать один за одним із паузою.

import type { CatalogFile } from "./catalog";

/** Пауза між варіантами, коли слухають усі, с. */
const GAP = 0.35;

export class Listener {
  private context: AudioContext | null = null;
  private readonly buffers = new Map<string, Promise<AudioBuffer>>();
  private playing: { sources: AudioBufferSourceNode[]; done: () => void; timer: number } | null = null;

  /** Зіграти файли (`loop` — перший колом); `done` — коли дозвучало чи зупинили. Попереднє зупиняється. */
  async play(files: readonly CatalogFile[], gain: number, loop: boolean, done: () => void): Promise<void> {
    this.stop();
    const context = (this.context ??= new AudioContext());
    if (context.state === "suspended") await context.resume();
    const playable = files.filter((f): f is CatalogFile & { url: string } => f.url !== null);
    if (playable.length === 0) {
      done();
      return;
    }
    const token = { sources: [] as AudioBufferSourceNode[], done, timer: 0 };
    this.playing = token;
    let buffers: AudioBuffer[];
    try {
      buffers = await Promise.all(playable.map((f) => this.decode(context, f.url)));
    } catch (error) {
      console.error("Звуки: файл не декодовано", error);
      this.finish(token);
      return;
    }
    if (this.playing !== token) return;
    const out = context.createGain();
    out.gain.value = gain;
    out.connect(context.destination);
    let at = context.currentTime + 0.03;
    playable.forEach((file, i) => {
      const buffer = buffers[i]!;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(out);
      if (loop && file.loop) {
        source.loop = true;
        source.loopStart = file.loop.start;
        source.loopEnd = file.loop.end;
        source.start(at, file.loop.start);
        token.sources.push(source);
        return;
      }
      source.start(at);
      token.sources.push(source);
      at += buffer.duration + GAP;
    });
    if (!loop) token.timer = window.setTimeout(() => this.finish(token), (at - context.currentTime - GAP) * 1000 + 50);
  }

  stop(): void {
    if (this.playing) this.finish(this.playing);
  }

  private finish(token: NonNullable<Listener["playing"]>): void {
    if (this.playing !== token) return;
    this.playing = null;
    window.clearTimeout(token.timer);
    for (const source of token.sources) {
      try {
        source.stop();
      } catch {
        // Ще не почався чи вже дозвучав.
      }
    }
    token.done();
  }

  private decode(context: AudioContext, url: string): Promise<AudioBuffer> {
    let buffer = this.buffers.get(url);
    if (!buffer) {
      buffer = fetch(url)
        .then((response) => response.arrayBuffer())
        .then((data) => context.decodeAudioData(data));
      buffer.catch(() => this.buffers.delete(url));
      this.buffers.set(url, buffer);
    }
    return buffer;
  }
}
