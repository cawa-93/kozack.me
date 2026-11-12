// Іконки карток наперед (§2.1): кожна — окремий SVG, і браузер вантажив би його, лише коли картка вже відкрита, а гравець бачив
// би порожні місця. Тому щойно гра запустилася, вона одним запитом бере пакет усіх іконок (`artpack.ts`): сотні окремих запитів
// на слабкому зв'язку йдуть довго й обриваються. Пакета немає (режим розробки) чи він не прийшов — окремі файли у фоні малими
// порціями. Покликання на картинки лишаються тут: поки вони живі, браузер тримає їх у пам'яті, і нова картка отримує іконку
// одразу.

import { fetchBytes } from "../audio/net";
import { DESTINATION_ICONS } from "../view/symbols";
import { adoptPack, cardArtPackUrl, parsePack, retried } from "./artpack";
import { glyphUrls } from "./glyphs";
import { iconUrl, iconUrls } from "./icons";

/** Скільки файлів вантажити водночас. */
const BATCH = 6;
/** Найдовше чекати вільної миті між порціями, мс: на зайнятому телефоні вона може й не настати. */
const IDLE_TIMEOUT_MS = 500;
/** Де немає `requestIdleCallback` (Safari), пауза між порціями, мс. */
const FALLBACK_PAUSE_MS = 50;
/** Паузи перед повторними спробами взяти пакет, мс: обрив мережі часто минає за кілька секунд. */
const PACK_RETRY_PAUSES_MS: readonly number[] = [2000, 6000];
/** Скільки запит пакета може стояти без жодного нового байта, мс: зависла мережа не має тримати його вічно. */
const PACK_STALL_MS = 15_000;

const kept: HTMLImageElement[] = [];

/** Що готувати, по порядку: спершу гліфи й пункти поїздки, потім решта. Вбудоване в код (`data:`) запиту не потребує. */
export function cardArtUrls(): string[] {
  const destinations = Object.values(DESTINATION_ICONS).map((icon) => iconUrl(icon) ?? "");
  return [...new Set([...glyphUrls(), ...destinations, ...iconUrls()])].filter((url) => url !== "" && !url.startsWith("data:"));
}

/** Завантажити `urls` порціями: наступна — лише після попередньої. Файл, що не прийшов, просто довантажить картка. */
export async function warmImages(urls: readonly string[], load: (url: string) => Promise<void>, pause: () => Promise<void>): Promise<void> {
  for (let i = 0; i < urls.length; i += BATCH) {
    await pause();
    await Promise.allSettled(urls.slice(i, i + BATCH).map(load));
  }
}

/** Чим `warmArt` ходить у мережу й у браузер. */
export interface WarmDeps {
  /** Адреса пакета; null — у збірці його немає. */
  packUrl: string | null;
  /** Текст файлу за адресою; збій мережі чи відповідь не 2xx — виняток. */
  fetchText(url: string): Promise<string>;
  /** Пакет прийшов: віддати його малюнки карткам. */
  adopt(pack: ReadonlyMap<string, string>): void;
  /** Адреси малюнків карток — ті, які картка отримала б зараз. */
  urls(): string[];
  load(url: string): Promise<void>;
  /** Перепочинок між порціями малюнків. */
  pause(): Promise<void>;
  wait(ms: number): Promise<void>;
}

/**
 * Приготувати іконки карток: узяти пакет (збій — кілька спроб із паузами, тихо) і розкласти малюнки в пам'ять браузера. Адреси
 * питаємо вже після пакета: прийшов — це його малюнки (без мережі), ні — окремі файли.
 */
export async function warmArt(deps: WarmDeps): Promise<void> {
  const { packUrl } = deps;
  if (packUrl !== null) {
    const pack = await retried(
      async () => {
        const parsed = parsePack(await deps.fetchText(packUrl));
        if (parsed === null) throw new Error("не пакет іконок");
        return parsed;
      },
      PACK_RETRY_PAUSES_MS,
      deps.wait,
    );
    if (pack !== null) deps.adopt(pack);
  }
  await warmImages(deps.urls(), deps.load, deps.pause);
}

function loadImage(url: string): Promise<void> {
  const image = new Image();
  kept.push(image);
  image.src = url;
  return image.decode();
}

function idle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") requestIdleCallback(() => resolve(), { timeout: IDLE_TIMEOUT_MS });
    else setTimeout(resolve, FALLBACK_PAUSE_MS);
  });
}

/** Почати фонове завантаження іконок карток. */
export function warmCardArt(): void {
  void warmArt({
    packUrl: cardArtPackUrl(),
    fetchText: async (url) => new TextDecoder().decode(await fetchBytes(url, PACK_STALL_MS)),
    adopt: adoptPack,
    urls: cardArtUrls,
    load: loadImage,
    pause: idle,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
}
