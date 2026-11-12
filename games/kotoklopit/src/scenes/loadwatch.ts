// Сторож завантаження атласу (§2.1 «Малювання й завантаження», `PreloadScene`): запит, що завис без відповіді й без помилки
// (мережа перемкнулася), не дає завантажувачеві ні кінця, ні помилки, і смуга стояла б вічно. Сторож бачить, що байтів давно
// немає, і скасовує такі запити як помилку — тоді гра каже, що не завантажилася, і пропонує спробувати ще. Без Phaser.

/**
 * Скільки мс завантаження може стояти без жодного байта, перш ніж його вважають зависло: повільна, але жива лінія за такий час
 * щось та приносить (браузер повідомляє про байти кожні ≈ 50 мс), а гравець довше на нерухомій смузі не чекає.
 */
export const LOAD_STALL_MS = 20_000;

export class LoadWatchdog {
  private last: number;

  /** `now` — коли почали чекати (мс). */
  constructor(now: number) {
    this.last = now;
  }

  /** Прийшли байти чи скінчився файл: завантаження живе. */
  alive(now: number): void {
    this.last = Math.max(this.last, now);
  }

  /** Чи стоїть завантаження без жодного байта довше за `LOAD_STALL_MS`. */
  stalled(now: number): boolean {
    return now - this.last >= LOAD_STALL_MS;
  }
}

/** Файл завантажувача Phaser (`Phaser.Loader.File`) — те, що з нього потрібно сторожеві. */
export interface LoadingFile {
  state: number;
  retryAttempts: number;
  xhrLoader: { abort(): void } | null;
  onError(...args: never[]): void;
}

/**
 * Скасувати файли, що зараз качаються (`state` — `loading`, `Phaser.Loader.FILE_LOADING`), як помилку без повторів: запит
 * обірвано, а завантажувач іде далі без них і закінчується, тож атлас «не завантажився». Повертає, скільки скасовано.
 */
export function cancelLoading(files: Iterable<LoadingFile>, loading: number): number {
  let cancelled = 0;
  // Копія: помилка файла прибирає його з набору, який обходимо.
  for (const file of [...files]) {
    if (file.state !== loading) continue;
    file.retryAttempts = 0;
    file.xhrLoader?.abort();
    file.onError();
    cancelled++;
  }
  return cancelled;
}
