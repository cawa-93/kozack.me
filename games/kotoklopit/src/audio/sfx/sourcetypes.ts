// Звідки взято звуки й як їх обробити (§2.1, §11.4а): формат `audio/sfx/<група>/sources.json`. З нього кодує
// `scripts/audio/sfx.ts`, перевіряє `tests/sfx-files.test.ts` і складаються титри.

/** Ліцензії, які беремо (§2.1): без NC, ND і SA. CC-BY — з автором у титрах. */
export const LICENSES = ["CC0-1.0", "PD", "CC-BY-2.0", "CC-BY-2.5", "CC-BY-3.0", "CC-BY-4.0"] as const;
export type License = (typeof LICENSES)[number];

/** Оригінал: файл, як його завантажено, з ліцензією й доказом. */
export interface Original {
  /** Файл відносно `sfx-library/<група>/` (поза git; автор тримає копію). */
  file: string;
  /** Сторінка, з якої взято: файл Commons, предмет Internet Archive. */
  url: string;
  title: string;
  /** Автор так, як його треба назвати в титрах. */
  author: string;
  license: License;
  licenseUrl: string;
  sha256: string;
}

/** Як із оригіналу зробити файл гри. */
export interface Recipe {
  /** Ключ у `originals`. */
  from: string;
  /** Відрізок оригіналу, с; без них — увесь. */
  start?: number;
  end?: number;
  /** Петля: кодується колом (`SFX.loopPad`, `SFX.loopCrossfade`). */
  loop?: boolean;
  /**
   * Ритмічна петля (музика): коло — рівно `end − start`, щоб замикалося в такт, а перехід кінця в початок береться з оригіналу
   * за `end`; грає з початку кола, а не з випадкового місця.
   */
  rhythm?: boolean;
  /** Разовий: пік, дБ FS (типово −1). Петля: середня гучність (RMS), дБ FS (типово −20), пік не вище −1. */
  level?: number;
  /** Плавні краї разового звуку, с (типово 0,003 і 0,02). */
  fadeIn?: number;
  fadeOut?: number;
  /** Фільтр ffmpeg перед обробкою: `highpass=f=150`, `lowpass=f=900` (за стіною), `asetrate=52800,aresample=48000` (вище). */
  filter?: string;
  /** Що це й навіщо — для людей. */
  note?: string;
}

export interface Sources {
  originals: Record<string, Original>;
  files: Record<string, Recipe>;
}
