// Звукові вподобання гравця (§8.10, §11.4а): окремий ключ, а не збереження гри, щоб вони не відкочувалися разом із днем.

const KEY = "kotoklopit:audio";

export interface AudioSettings {
  radioOn: boolean;
  station: string;
  /** Гучність музики, 0…1. */
  volume: number;
  /** Гучність звуків (світ та інтерфейс), 0…1. */
  effects: number;
}

export const DEFAULT_AUDIO: AudioSettings = { radioOn: false, station: "retro", volume: 0.6, effects: 0.8 };

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

const level = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback);

/** Прочитати налаштування; зіпсоване чи чужого типу значення дає типове. */
export function loadAudioSettings(storage: Storage | null, stations: readonly string[]): AudioSettings {
  let saved: Partial<AudioSettings> = {};
  try {
    saved = (JSON.parse(storage?.getItem(KEY) ?? "{}") as Partial<AudioSettings> | null) ?? {};
  } catch {
    saved = {};
  }
  return {
    radioOn: typeof saved.radioOn === "boolean" ? saved.radioOn : DEFAULT_AUDIO.radioOn,
    station: typeof saved.station === "string" && stations.includes(saved.station) ? saved.station : DEFAULT_AUDIO.station,
    volume: level(saved.volume, DEFAULT_AUDIO.volume),
    effects: level(saved.effects, DEFAULT_AUDIO.effects),
  };
}

export function saveAudioSettings(storage: Storage | null, settings: AudioSettings): void {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Приватне вікно чи повне сховище: гра без цього працює, вподобання просто не запам'ятаються.
  }
}

/** Спільні вподобання радіо й звуків: одна копія в пам'яті, інакше кожен затирав би зміни іншого. */
export class AudioPrefs {
  private settings: AudioSettings;

  constructor(
    private readonly storage: Storage | null,
    stations: readonly string[],
  ) {
    this.settings = loadAudioSettings(storage, stations);
  }

  get value(): AudioSettings {
    return this.settings;
  }

  update(change: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...change };
    saveAudioSettings(this.storage, this.settings);
  }
}

/** `localStorage`, якщо браузер його дає. */
export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
