// Прослухані шматки радіо між сесіями (§8.10, `SOUND_PLAN.md`, «Кеш»): HTTP-кеш мобільні браузери витісняють швидко, а Cache Storage
// живе, поки сайт відвідують. Шматки незмінні (у назві теки — хеш і профіль), тож перевіряти збережене не треба. Сховище недоступне,
// зіпсоване чи повне — шматок просто береться з мережі.

import { RADIO } from "../config";

export const RADIO_CACHE = "kotoklopit-radio";

/** Те з `Cache`, чим користуємось: так це перевіряється в Node. */
export interface ChunkCache {
  match(url: string): Promise<Response | undefined>;
  put(url: string, response: Response): Promise<void>;
  keys(): Promise<readonly Request[]>;
  delete(request: Request): Promise<boolean>;
}

/** Скільки нових шматків між прибираннями: перелік ключів довгий, рахувати його щоразу немає потреби. */
const TRIM_EVERY = 50;

/** Отримувач шматків: спершу сховище, потім мережа; нове кладе в сховище, а найдавніше понад `limit` видаляє. */
export function persistentFetch(open: () => Promise<ChunkCache | null>, network: (url: string) => Promise<Response>, limit: number = RADIO.persistChunks): (url: string) => Promise<ArrayBuffer> {
  let opened: Promise<ChunkCache | null> | null = null;
  let stored = 0;
  const cache = (): Promise<ChunkCache | null> => (opened ??= open().catch(() => null));
  return async (url) => {
    const store = await cache();
    const hit = await store?.match(url).catch(() => undefined);
    if (hit) return hit.arrayBuffer();
    const response = await network(url);
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    if (store) {
      store
        .put(url, response.clone())
        .then(() => (++stored % TRIM_EVERY === 0 ? trim(store, limit) : undefined))
        .catch(() => {
          // Квота вичерпана чи сховище закрите: шматок лишається лише в пам'яті й HTTP-кеші.
        });
    }
    return response.arrayBuffer();
  };
}

/** Ключі Cache Storage йдуть у порядку додавання: найдавніші — на початку. */
export async function trim(store: ChunkCache, limit: number): Promise<void> {
  const keys = await store.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - limit))) await store.delete(key);
}
