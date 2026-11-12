// Пакет іконок карток (§2.1 «Малювання й завантаження»): збірка складає іконки, позначки й гліфи карток в один файл
// «назва → текст SVG» (`scripts/icons/`), а гра бере його одним запитом замість сотень. Малюнок із пакета картка показує за
// адресою `blob:`; поки пакета немає (ще вантажиться, не прийшов, режим розробки) — за адресою окремого файлу.
//
// Адреси `blob:` не відкликаються: картка може показати малюнок будь-коли, поки жива сторінка.

/** Адресу пакета від теки збірки підставляє плагін збирання (`PACK_DEFINE`); без плагіна (dev, тести) константи немає. */
declare const __CARD_ART_PACK__: string | undefined;

/** Адреса пакета; null — у цій збірці пакета немає. */
export const cardArtPackUrl = (): string | null => (typeof __CARD_ART_PACK__ === "string" ? `${import.meta.env.BASE_URL}${__CARD_ART_PACK__}` : null);

/** Адреси малюнків пакета, що вже прийшов: назва → `blob:`. */
const PACK = new Map<string, string>();

/** Розібрати файл пакета: назва → текст SVG. Не пакет (сторінка помилки, обірваний файл) — null. */
export function parsePack(text: string): Map<string, string> | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const pack = new Map<string, string>();
  for (const [name, svg] of Object.entries(data)) {
    if (typeof svg !== "string" || !svg.startsWith("<svg")) return null;
    pack.set(name, svg);
  }
  return pack.size > 0 ? pack : null;
}

/** Назва малюнка в пакеті: шлях файлу (як його дає `import.meta.glob`) від теки `art/` без розширення. */
export function artKey(path: string): string {
  return path.slice(path.lastIndexOf("/art/") + "/art/".length).replace(/\.svg$/, "");
}

/**
 * Адреса малюнка `path` (шлях, як його дає `import.meta.glob`): з пакета, якщо він там є, інакше — файлу з `files`
 * (шлях → адреса). Файлу немає — null. Чистий розрахунок без DOM.
 */
export function artUrl(path: string, files: Readonly<Record<string, string>>, pack: ReadonlyMap<string, string> = PACK): string | null {
  const file = files[path];
  if (file === undefined) return null;
  return pack.get(artKey(path)) ?? file;
}

/** Пакет прийшов: відтепер картки беруть його малюнки. Уже показані картки лишаються з адресами файлів. */
export function adoptPack(
  pack: ReadonlyMap<string, string>,
  toUrl: (svg: string) => string = (svg) => URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })),
): void {
  for (const [name, svg] of pack) PACK.set(name, toUrl(svg));
}

/**
 * Виконати `task`; не вдалося — ще раз після кожної паузи з `pauses` (мс). Не вдалося й після останньої — null: помилка
 * тиха, бо в того, хто кличе, є запасний шлях.
 */
export async function retried<T>(task: () => Promise<T>, pauses: readonly number[], wait: (ms: number) => Promise<void>): Promise<T | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await task();
    } catch {
      const pause = pauses[attempt];
      if (pause === undefined) return null;
      await wait(pause);
    }
  }
}
