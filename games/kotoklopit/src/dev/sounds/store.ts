// Де живуть рішення сторінки звуків: у `npm run dev` — файл `audio/sfx/review.json`, який пише dev-сервер
// (`scripts/audio/reviewplugin.ts`); на прев'ю Netlify сервера немає — тоді лише цей браузер (`localStorage`) і файл, який автор
// завантажує кнопкою.

import type { Review, Reviews } from "./review";

/** Адреса рішень на dev-сервері: та сама, що в `scripts/audio/reviewplugin.ts`. */
const ROUTE = "/__sound-review";
const LOCAL_KEY = "kotoklopit:sound-review";

export type StoreMode = "disk" | "browser";

export class ReviewStore {
  private readonly queues = new Map<string, Promise<void>>();

  private constructor(
    readonly reviews: Reviews,
    private modeNow: StoreMode,
    private readonly onMode: (mode: StoreMode) => void,
  ) {}

  get mode(): StoreMode {
    return this.modeNow;
  }

  static async load(onMode: (mode: StoreMode) => void): Promise<ReviewStore> {
    try {
      const response = await fetch(ROUTE, { cache: "no-store" });
      const type = response.headers.get("content-type") ?? "";
      if (response.ok && type.includes("application/json")) return new ReviewStore((await response.json()) as Reviews, "disk", onMode);
    } catch {
      // Немає сервера — рішення лише в браузері.
    }
    return new ReviewStore(readLocal(), "browser", onMode);
  }

  /** Записати рішення звуку (null — прибрати). Записи одного звуку йдуть по черзі; збій сервера — далі лише браузер. */
  set(key: string, review: Review | null): void {
    if (review) this.reviews[key] = review;
    else delete this.reviews[key];
    if (this.modeNow === "browser") {
      writeLocal(this.reviews);
      return;
    }
    const previous = this.queues.get(key) ?? Promise.resolve();
    const next = previous.then(async () => {
      if (this.modeNow !== "disk") return;
      try {
        const response = await fetch(`${ROUTE}/${key}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(review),
        });
        if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
      } catch (error) {
        console.error("Звуки: рішення не записано на диск, далі — лише в браузері", error);
        this.modeNow = "browser";
        writeLocal(this.reviews);
        this.onMode("browser");
      }
    });
    this.queues.set(key, next);
  }

  /** Файл рішень для автора: той самий формат, що `audio/sfx/review.json`. */
  download(): void {
    const blob = new Blob([`${JSON.stringify(sortKeys(this.reviews), null, 2)}\n`], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "review.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
}

function sortKeys(reviews: Reviews): Reviews {
  return Object.fromEntries(Object.entries(reviews).sort(([a], [b]) => a.localeCompare(b)));
}

function readLocal(): Reviews {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Reviews) : {};
  } catch {
    return {};
  }
}

function writeLocal(reviews: Reviews): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(reviews));
  } catch {
    // Сховище браузера недоступне: лишається кнопка «Завантажити».
  }
}
