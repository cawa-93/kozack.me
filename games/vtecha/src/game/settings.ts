// Збереження в localStorage (§2): налаштування (§12.6), позначки вивченого навчання (§11.2.1),
// найкращий час і seed останнього забігу. Будь-яка помилка сховища — гра працює зі значеннями за замовчуванням.

import { VOLUME_DEFAULTS } from "../config";

export interface Settings {
  master: number;
  effects: number;
  ambient: number;
  mouseSensitivity: number;
  visualAudioCues: boolean;
  arachnophobiaMode: boolean;
}

const KEY_SETTINGS = "vtecha.settings";
const KEY_TUTORIAL = "vtecha.tutorial";
const KEY_BEST = "vtecha.bestTime";
const KEY_LAST_SEED = "vtecha.lastSeed";

function read<T>(key: string): Partial<T> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Partial<T>) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Сховище недоступне — нічого не зберігаємо.
  }
}

export function loadSettings(): Settings {
  const s = read<Settings>(KEY_SETTINGS) ?? {};
  return {
    master: num(s.master, VOLUME_DEFAULTS.master),
    effects: num(s.effects, VOLUME_DEFAULTS.effects),
    ambient: num(s.ambient, VOLUME_DEFAULTS.ambient),
    mouseSensitivity: num(s.mouseSensitivity, 1),
    visualAudioCues: s.visualAudioCues === true,
    arachnophobiaMode: s.arachnophobiaMode === true,
  };
}

export function saveSettings(s: Settings): void {
  write(KEY_SETTINGS, s);
}

export interface TutorialFlags {
  space: boolean;
  e: boolean;
  q: boolean;
}

export function loadTutorial(): TutorialFlags {
  const t = read<TutorialFlags>(KEY_TUTORIAL) ?? {};
  return { space: t.space === true, e: t.e === true, q: t.q === true };
}

export function saveTutorial(t: TutorialFlags): void {
  write(KEY_TUTORIAL, t);
}

export function resetTutorial(t: TutorialFlags): void {
  t.space = false;
  t.e = false;
  t.q = false;
  saveTutorial(t);
}

export function recordRun(seed: number, winTime: number | null): void {
  write(KEY_LAST_SEED, seed);
  if (winTime === null) return;
  const best = read<number>(KEY_BEST) as unknown as number | null;
  if (typeof best !== "number" || winTime < best) write(KEY_BEST, winTime);
}

function num(v: unknown, def: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}
