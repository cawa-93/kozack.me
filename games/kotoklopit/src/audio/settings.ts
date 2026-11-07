// Звукові вподобання гравця (§8.10): окремий ключ, а не збереження гри, щоб вони не відкочувалися разом із днем.

const KEY = "kotoklopit:audio";

export interface AudioSettings {
  radioOn: boolean;
  station: string;
  /** Гучність музики, 0…1. */
  volume: number;
}

export const DEFAULT_AUDIO: AudioSettings = { radioOn: false, station: "retro", volume: 0.6 };

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

/** Прочитати налаштування; зіпсоване чи чужого типу значення дає типове. */
export function loadAudioSettings(storage: Storage | null, stations: readonly string[]): AudioSettings {
  let saved: Partial<AudioSettings> = {};
  try {
    saved = (JSON.parse(storage?.getItem(KEY) ?? "{}") as Partial<AudioSettings> | null) ?? {};
  } catch {
    saved = {};
  }
  const volume = typeof saved.volume === "number" && Number.isFinite(saved.volume) ? Math.min(1, Math.max(0, saved.volume)) : DEFAULT_AUDIO.volume;
  return {
    radioOn: typeof saved.radioOn === "boolean" ? saved.radioOn : DEFAULT_AUDIO.radioOn,
    station: typeof saved.station === "string" && stations.includes(saved.station) ? saved.station : DEFAULT_AUDIO.station,
    volume,
  };
}

export function saveAudioSettings(storage: Storage | null, settings: AudioSettings): void {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Приватне вікно чи повне сховище: гра без цього працює, вподобання просто не запам'ятаються.
  }
}
