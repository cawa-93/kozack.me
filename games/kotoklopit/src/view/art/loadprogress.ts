// Хід завантаження атласу для смуги заставки (крок 16, `PreloadScene`): частка 0–1 за байтами, а не за кількістю файлів.
// Без Phaser і DOM (тести в Node).
//
// Завантажувач Phaser рахує поступ файлами: сторінки атласу вантажаться разом і приходять майже одночасно наприкінці, тож на
// Fast 3G смуга ≈ 15 с стояла на частці `index.json`, а потім за дві секунди добігала до кінця. Тут — байти, що вже прийшли
// (події `progress` запиту кожної сторінки), до байтів усіх сторінок: їх наперед дає `index.json` (`AtlasPage.bytes`), тож
// смуга рівномірна, поки мережа рівна, і не повертається назад.
//
// Сторінка «прийшла», коли вона вже й розпакована (`afterDecode`).

import type { AtlasPage } from "./types";

/**
 * Скільки смуги — на `index.json`: стиснений він ≈ 20 КБ, а сторінки — ≈ 3,7 МБ, тож час його приходу — це здебільшого
 * затримка мережі (на Fast 3G ≈ 0,6–1 с з ≈ 25 с атласу).
 */
export const INDEX_SHARE = 0.04;

/**
 * Скільки смуги лишається, коли прийшов останній байт: сторінки ще розпаковуються в зображення, атлас складається, і стартує
 * день — на Fast 3G з CPU ×4 це ≈ 3–4 с, і повна смуга стояла б, ніби гра зависла. Цю частку смуга не проходить: заставку
 * прибирають, щойно гра готова.
 */
export const DONE_SHARE = 0.04;

/**
 * Скільки байтів на піксель сторінки, поки розміру її файлу не знати (старий `index.json` без `bytes`, а сервер ще не сказав
 * `Content-Length`): webp атласу — ≈ 0,14.
 */
export const PAGE_BYTES_PER_PIXEL = 0.15;

/** Частка смуги на байти сторінок. */
const PAGES_SHARE = 1 - INDEX_SHARE - DONE_SHARE;

/** Сторінка в дорозі: скільки байтів очікуємо (і чи це розмір з `index.json`), скільки прийшло й чи вже вся. */
interface PageState {
  expected: number;
  sized: boolean;
  loaded: number;
  done: boolean;
}

/**
 * Поступ завантаження атласу: спершу `index.json` (`indexProgress`), потім сторінки (`pages`, далі `pageProgress` і `pageDone`).
 * Кожен метод повертає частку для смуги — не меншу, ніж була (`value`).
 */
export class AtlasLoadProgress {
  private readonly states: PageState[] = [];
  private shown = 0;

  /** Частка смуги зараз: 0–1, не спадає. */
  get value(): number {
    return this.shown;
  }

  /** `index.json` прийшов на частку `fraction` (0–1). */
  indexProgress(fraction: number): number {
    return this.show(INDEX_SHARE * clamp01(fraction));
  }

  /**
   * `index.json` розібрано: сторінки, які вантажитимуться; `have[i]` — сторінка вже є (прийшла за попередньої спроби).
   * Очікуваний розмір — `bytes` з `index.json`, без нього — за площею (`PAGE_BYTES_PER_PIXEL`).
   */
  pages(pages: readonly AtlasPage[], have: readonly boolean[] = []): number {
    this.states.length = 0;
    pages.forEach((page, i) => {
      const bytes = page.bytes ?? 0;
      const sized = bytes > 0;
      const expected = sized ? bytes : Math.max(1, page.w * page.h * PAGE_BYTES_PER_PIXEL);
      const done = have[i] === true;
      this.states.push({ expected, sized, loaded: done ? expected : 0, done });
    });
    return this.update();
  }

  /**
   * Сторінка `i` прийшла на `loaded` байтів з `total` (подія `progress` запиту; `total` 0 — сервер не сказав розміру). Якщо
   * розміру з `index.json` немає, очікуємо те, що каже сервер.
   */
  pageProgress(i: number, loaded: number, total: number): number {
    const state = this.states[i];
    if (!state || state.done) return this.shown;
    if (!state.sized && total > 0) state.expected = total;
    state.loaded = Math.max(state.loaded, Math.min(loaded, state.expected));
    return this.update();
  }

  /** Сторінка `i` прийшла вся (і стала зображенням). */
  pageDone(i: number): number {
    const state = this.states[i];
    if (!state) return this.shown;
    state.done = true;
    state.loaded = state.expected;
    return this.update();
  }

  private update(): number {
    let expected = 0;
    let loaded = 0;
    for (const state of this.states) {
      expected += state.expected;
      loaded += state.loaded;
    }
    const pages = expected > 0 ? loaded / expected : 1;
    return this.show(INDEX_SHARE + PAGES_SHARE * pages);
  }

  private show(value: number): number {
    this.shown = Math.max(this.shown, clamp01(value));
    return this.shown;
  }
}

/**
 * Скільки чекати `decode`, мс. Пастка: його проміс може не закінчитися довго чи взагалі (браузер відкладає розпакування
 * зображень поза документом, поки вкладку сховано), а завантаження без нього стояло б. Із запасом на велику сторінку на
 * повільному телефоні.
 */
export const DECODE_WAIT_MS = 3000;

/**
 * `done` — рівно раз, коли зображення розпаковано (`decode`): так сторінки атласу розпаковуються поза головним потоком, поки
 * приходять інші, а не всі разом синхронно, коли атлас уперше малюють. Без `decode` (старий браузер), з його помилкою чи
 * через `DECODE_WAIT_MS` без відповіді — однаково: зображення придатне, лише розпакується тоді, коли його вперше намалюють.
 */
export function afterDecode(image: { decode?: (() => Promise<void>) | undefined }, done: () => void): void {
  let decoding: Promise<void> | undefined;
  try {
    decoding = image.decode?.();
  } catch {
    decoding = undefined;
  }
  if (!decoding) {
    done();
    return;
  }
  let called = false;
  const once = (): void => {
    if (called) return;
    called = true;
    clearTimeout(timer);
    done();
  };
  const timer = setTimeout(once, DECODE_WAIT_MS);
  decoding.then(once, once);
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
