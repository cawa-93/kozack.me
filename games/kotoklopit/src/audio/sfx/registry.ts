// Реєстр груп звуків: кожна група — свій файл `groups/<id>.ts` з експортом `group`. Нова група додається файлом, а не правкою
// чужого коду (кореневий `CLAUDE.md`, «Як працюємо»).

import type { SoundGroup } from "./types";

const MODULES = import.meta.glob<SoundGroup>("./groups/*.ts", { import: "group", eager: true });

/** Групи в порядку назв файлів. */
export const GROUPS: readonly SoundGroup[] = Object.keys(MODULES)
  .sort()
  .map((path) => MODULES[path]!);

/** Назва файлу групи — для перевірки, що `id` з нею збігається. */
export const GROUP_FILES: readonly string[] = Object.keys(MODULES)
  .sort()
  .map((path) => path.slice("./groups/".length, -".ts".length));
