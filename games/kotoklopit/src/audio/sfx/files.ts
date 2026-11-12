// Файли звуків (§11.4а): `scripts/audio/sfx.ts` кодує їх у `audio/sfx/<група>/` і пише поруч `encoded.json`; Vite кладе файли
// в збірку з хешем у назві під довгий кеш.

/** Що знає про файл кодувальник. */
export interface EncodedFile {
  /** Хеш рецепта й оригіналу: змінились — файл перекодовується. */
  hash: string;
  /** Тривалість звуку без запасу на краях, с. */
  seconds: number;
  /** Петля: коло між цими мітками декодованого файлу, с (запас на краях — `SFX.loopPad`); `rhythm` — ритмічна (`Recipe.rhythm`). */
  loop?: LoopRange;
}

export interface LoopRange {
  start: number;
  end: number;
  rhythm?: boolean;
}

export type EncodedGroup = Record<string, EncodedFile>;

// Окремими файлами й малі (`?no-inline`): вбудовані, вони тягнулися б разом із кодом гри до першого кадру, а звучать лише
// після дотику.
const URLS = import.meta.glob<string>("/audio/sfx/*/*.mp3", { query: "?no-inline", import: "default", eager: true });
const ENCODED = import.meta.glob<EncodedGroup>("/audio/sfx/*/encoded.json", { import: "default", eager: true });

export interface SoundFile {
  key: string;
  url: string;
  loop: LoopRange | null;
}

const FILES = new Map<string, SoundFile>();
for (const [path, encoded] of Object.entries(ENCODED)) {
  const group = path.split("/").at(-2)!;
  for (const [name, file] of Object.entries(encoded)) {
    const url = URLS[`/audio/sfx/${group}/${name}.mp3`];
    if (url) FILES.set(`${group}/${name}`, { key: `${group}/${name}`, url, loop: file.loop ?? null });
  }
}

/** Файл `name` групи `group`; немає (не закодовано) — null. */
export function soundFile(group: string, name: string): SoundFile | null {
  return FILES.get(`${group}/${name}`) ?? null;
}

/** Усі закодовані файли: для перевірок. */
export function allSoundFiles(): readonly SoundFile[] {
  return [...FILES.values()];
}
