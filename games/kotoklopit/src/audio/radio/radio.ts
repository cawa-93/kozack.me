// Радіо (§8.10): вподобання гравця, ефір і завантаження разом. Сцени й картка працюють лише з цим класом.

import { RADIO } from "../config";
import { AudioEngine } from "../engine";
import { loadAudioSettings, saveAudioSettings, type AudioSettings } from "../settings";
import { Broadcast } from "./broadcast";
import { ChunkStore } from "./chunks";
import { setRadioLit } from "./lamp";
import { STATIONS, chunkUrl } from "./playlist";
import { wantedChunks } from "./prefetch";
import { onAir, type RadioTrack, type Station } from "./schedule";

/** Реальний час, с: той самий годинник і для ефіру, і для завантажень. */
const clock = (): number => Date.now() / 1000;

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.arrayBuffer();
}

export class Radio {
  readonly stations: readonly Station[] = STATIONS;
  private readonly engine = new AudioEngine();
  private readonly store = new ChunkStore(chunkUrl, fetchBytes);
  private readonly broadcast = new Broadcast(this.engine, this.store, clock);
  private settings: AudioSettings;
  /** Коли радіо стало ціллю дії; null — персонаж не біля нього. */
  private nearSince: number | null = null;
  /** Останній трек, що звучав: у паузі між треками рядок «Зараз грає» не блимає. */
  private lastTrack: RadioTrack | null = null;

  constructor() {
    this.settings = loadAudioSettings(storage(), this.stations.map((station) => station.id));
  }

  /** Викликати один раз під час запуску гри. */
  start(): void {
    this.engine.start();
    this.engine.onRunning(() => {
      this.applyVolume();
      this.broadcast.tune(this.playing());
    });
    setRadioLit(this.settings.radioOn);
    window.setInterval(() => this.tick(), RADIO.tickMs);
    this.tick();
  }

  get on(): boolean {
    return this.settings.radioOn;
  }

  get station(): Station {
    return this.stations.find((station) => station.id === this.settings.station) ?? this.stations[0]!;
  }

  get volume(): number {
    return this.settings.volume;
  }

  /** Що звучить на обраній станції; показуємо це й на вимкненому радіо: ефір іде завжди. */
  nowPlaying(): RadioTrack | null {
    const track = onAir(this.station, clock()).track;
    if (track) this.lastTrack = track;
    return this.lastTrack;
  }

  choose(station: Station): void {
    this.update({ station: station.id, radioOn: true });
    this.broadcast.tune(this.playing());
  }

  toggle(): void {
    this.update({ radioOn: !this.settings.radioOn });
    this.broadcast.tune(this.playing());
  }

  setVolume(volume: number): void {
    this.update({ volume });
    this.applyVolume();
  }

  /** Радіо стало ціллю дії чи відкрита його картка: решта станцій стає напоготові. */
  setNear(near: boolean): void {
    if (near === (this.nearSince !== null)) return;
    this.nearSince = near ? clock() : null;
    if (near) this.tick();
  }

  private playing(): Station | null {
    return this.settings.radioOn ? this.station : null;
  }

  private update(change: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...change };
    saveAudioSettings(storage(), this.settings);
    setRadioLit(this.settings.radioOn);
  }

  private applyVolume(): void {
    const music = this.engine.music;
    if (music) music.gain.value = this.settings.volume;
  }

  private tick(): void {
    const now = clock();
    this.store.want(wantedChunks({ stations: this.stations, listening: this.playing()?.id ?? null, nearSeconds: this.nearSince === null ? null : now - this.nearSince, now }));
    this.broadcast.tick();
  }
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
