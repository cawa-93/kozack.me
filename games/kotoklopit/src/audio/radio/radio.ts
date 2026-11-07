// Радіо (§8.10): вподобання гравця, ефір і завантаження разом. Сцени й картка працюють лише з цим класом.

import { RADIO } from "../config";
import { AudioEngine } from "../engine";
import { loadAudioSettings, saveAudioSettings, type AudioSettings } from "../settings";
import { Broadcast } from "./broadcast";
import { ChunkStore } from "./chunks";
import { setRadioLit } from "./lamp";
import { STATIONS, chunkUrl } from "./playlist";
import { persistentFetch, RADIO_CACHE } from "./persist";
import { wantedChunks } from "./prefetch";
import type { Station } from "./schedule";

/** Реальний час, с: той самий годинник і для ефіру, і для завантажень. */
const clock = (): number => Date.now() / 1000;

/** Шматки: пам'ять (`ChunkStore`), далі сховище між сесіями, далі мережа з HTTP-кешем браузера. */
const fetchBytes = persistentFetch(
  () => (typeof caches === "undefined" ? Promise.resolve(null) : caches.open(RADIO_CACHE)),
  (url) => fetch(url),
);

export class Radio {
  readonly stations: readonly Station[] = STATIONS;
  private readonly engine = new AudioEngine();
  private readonly store = new ChunkStore(chunkUrl, fetchBytes);
  private readonly broadcast = new Broadcast(this.engine, this.store, clock);
  private settings: AudioSettings;
  /** Відколи решта станцій напоготові; null — персонаж далеко. */
  private nearSince: number | null = null;

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

  /** Персонаж поруч із радіо: решта станцій стає напоготові. */
  setNear(near: boolean): void {
    if (near === (this.nearSince !== null)) return;
    this.nearSince = near ? clock() : null;
    if (near) this.tick();
  }

  /** Відкрито картку: станцію от-от змінять, тож поновити готовність, навіть якщо вона вже вичерпалась. */
  standby(): void {
    this.nearSince = clock();
    this.tick();
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
