// Іконки карток наперед (§2): кожна — окремий SVG, і браузер вантажив би його, лише коли картка вже відкрита, а гравець бачив би
// порожні місця. Тому щойно гра запустилася, файли йдуть у фоні малими порціями, щоб не забивати слабкий зв'язок. Покликання на
// картинки лишаються тут: поки вони живі, браузер тримає їх у пам'яті, і нова картка отримує іконку одразу, без запиту.

import { DESTINATION_ICONS } from "../view/symbols";
import { glyphUrls } from "./glyphs";
import { iconUrl, iconUrls } from "./icons";

/** Скільки файлів вантажити водночас. */
const BATCH = 6;
/** Найдовше чекати вільної миті між порціями, мс: на зайнятому телефоні вона може й не настати. */
const IDLE_TIMEOUT_MS = 500;
/** Де немає `requestIdleCallback` (Safari), пауза між порціями, мс. */
const FALLBACK_PAUSE_MS = 50;

const kept: HTMLImageElement[] = [];

/** Що вантажити, по порядку: спершу гліфи й пункти поїздки, потім решта. Вбудоване в код (`data:`) запиту не потребує. */
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
  void warmImages(cardArtUrls(), loadImage, idle);
}
