// Яка графіка світу (крок 16, `GRAPHICS_PLAN.md`): стара «три чверті» чи нова ізометрія 2:1. Поки нова не готова, її
// вмикає прапорець `?gfx=iso`, і браузер пам'ятає вибір (автор дивиться прев'ю з телефона, а сценарії міняють адресу);
// `?gfx=legacy` повертає старий вигляд і теж запам'ятовується. Без прапорця — збережений вибір, а типово — старий вигляд.
// Без Phaser.

export type GfxMode = "legacy" | "iso";

export const GFX_MODES: readonly GfxMode[] = ["legacy", "iso"];
/** Параметр адреси сторінки: `?gfx=iso` чи `?gfx=legacy`. */
export const GFX_PARAM = "gfx";
/** Ключ збереженого вибору в localStorage. */
export const GFX_KEY = "kotoklopit:gfx";
/** Типово — старий вигляд, доки ізометрія не стане типовою (хвиля 3). */
export const DEFAULT_GFX: GfxMode = "legacy";

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
