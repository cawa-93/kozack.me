// Радіо (§8.10): вподобання гравця, ефір і завантаження разом. Сцени й картка працюють лише з цим класом.

import { RADIO } from "../config";
import type { AudioEngine } from "../engine";
import { timeoutSignal } from "../net";
import type { AudioPrefs } from "../settings";
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
  (url) => fetch(url, { signal: timeoutSignal(RADIO.requestTimeoutMs) }),
);

export class Radio {
  readonly stations: readonly Station[] = STATIONS;
  private readonly store = new ChunkStore(chunkUrl, fetchBytes);
  private readonly broadcast: Broadcast;
  /** Відколи решта станцій напоготові; null — персонаж далеко. */
  private nearSince: number | null = null;
  /** Гра ще не почалася (меню на старті, створення персонажа, §8.10): радіо мовчить, хоч би яким його лишили. */
  private held = false;

  constructor(
    private readonly engine: AudioEngine,
    private readonly prefs: AudioPrefs,
  ) {
    this.broadcast = new Broadcast(engine, this.store, clock);
  }

  /** Викликати один раз під час запуску гри. */
  start(): void {
    this.engine.onRunning(() => {
      this.applyVolume();
      this.broadcast.tune(this.playing());
    });
    setRadioLit(this.on);
    window.setInterval(() => this.tick(), RADIO.tickMs);
    this.tick();
  }

  get on(): boolean {
    return !this.held && this.prefs.value.radioOn;
  }

  get station(): Station {
    return this.stations.find((station) => station.id === this.prefs.value.station) ?? this.stations[0]!;
  }

  get volume(): number {
    return this.prefs.value.volume;
  }

  /** Дотик до станції. Та, що вже грає, лишається як є: перенастроювання дало б провал звуку й шум до нового декодування. */
  choose(station: Station): void {
    if (this.on && station.id === this.station.id) return;
    this.update({ station: station.id, radioOn: true });
    this.broadcast.tune(this.playing());
  }

  toggle(): void {
    this.update({ radioOn: !this.prefs.value.radioOn });
    this.broadcast.tune(this.playing());
  }

  /** Замовкнути, поки гра не почалася (§8.10); звук повертає `release`. */
  hold(): void {
    this.setHeld(true);
  }

  /** Гра почалася: продовжили збережену — радіо таке, яким його лишили; нову — спершу `switchOff`. */
  release(): void {
    this.setHeld(false);
  }

  /** Нова гра починається з вимкненим радіо (§8.10). */
  switchOff(): void {
    this.update({ radioOn: false });
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

  private setHeld(held: boolean): void {
    if (held === this.held) return;
    this.held = held;
    setRadioLit(this.on);
    this.broadcast.tune(this.playing());
  }

  private playing(): Station | null {
    return this.on ? this.station : null;
  }

  private update(change: { station?: string; radioOn?: boolean; volume?: number }): void {
    this.prefs.update(change);
    setRadioLit(this.on);
  }

  private applyVolume(): void {
    const music = this.engine.music;
    if (music) music.gain.value = this.volume;
  }

  private tick(): void {
    const now = clock();
    this.store.want(wantedChunks({ stations: this.stations, listening: this.playing()?.id ?? null, nearSeconds: this.nearSince === null ? null : now - this.nearSince, now }));
    this.broadcast.tick();
  }
}
