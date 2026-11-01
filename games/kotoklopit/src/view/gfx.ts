// Яка графіка світу (крок 16, `GRAPHICS_PLAN.md`): стара «три чверті» чи нова ізометрія 2:1. З хвилі 3 типова — ізометрія;
// `?gfx=legacy` ще повертає старий вигляд і запам'ятовується, поки його не видалено (той самий пакет хвилі 3). Без Phaser.

export type GfxMode = "legacy" | "iso";

export const GFX_MODES: readonly GfxMode[] = ["legacy", "iso"];
/** Параметр адреси сторінки: `?gfx=iso` чи `?gfx=legacy`. */
export const GFX_PARAM = "gfx";
/** Ключ збереженого вибору в localStorage. */
export const GFX_KEY = "kotoklopit:gfx";
/** Типово — ізометрія (хвиля 3). */
export const DEFAULT_GFX: GfxMode = "iso";

/** Сховище вибору: localStorage браузера чи підміна в тестах. */
export type GfxStorage = Pick<Storage, "getItem" | "setItem">;

/** Назва графіки з адреси чи сховища; будь-що інше — null. */
export function parseGfx(value: string | null | undefined): GfxMode | null {
  return GFX_MODES.find((mode) => mode === value) ?? null;
}

/**
 * Графіка за адресою сторінки (`location.search`) і збереженим вибором: прапорець в адресі перемагає й запам'ятовується,
 * без нього — збережене, а без збереженого — типове. Незнайоме слово в адресі не рахується й не запам'ятовується.
 * Сховище, що не відповідає (приватний режим браузера), гри не ламає.
 */
export function chooseGfx(search: string, storage: GfxStorage | null): GfxMode {
  const asked = parseGfx(new URLSearchParams(search).get(GFX_PARAM));
  if (asked !== null) {
    try {
      storage?.setItem(GFX_KEY, asked);
    } catch {
      // Не запам'яталося — лише цей раз.
    }
    return asked;
  }
  try {
    return parseGfx(storage?.getItem(GFX_KEY)) ?? DEFAULT_GFX;
  } catch {
    return DEFAULT_GFX;
  }
}

/** Графіка цієї сторінки браузера. */
export function currentGfx(): GfxMode {
  let storage: GfxStorage | null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  return chooseGfx(window.location.search, storage);
}
