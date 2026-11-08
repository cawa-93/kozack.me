// Стиснені шматки в пам'яті (§8.10): запити за чергою пріоритетів і витіснення найдавніших. Між сесіями шматки тримає кеш
// браузера: у шляху до них є хеш треку, тож вони незмінні. `fetchBytes` і годинник передають ззовні: так це перевіряється в Node.

import { RADIO } from "../config";
import { chunkKey, type ChunkRef } from "./schedule";

export type FetchBytes = (url: string) => Promise<ArrayBuffer>;

export class ChunkStore {
  /** Порядок вставки — порядок витіснення: щойно потрібне переставляється в кінець. */
  private readonly bytes = new Map<string, ArrayBuffer>();
  private readonly loading = new Set<string>();
  private readonly failedAt = new Map<string, number>();
  private total = 0;

  constructor(
    private readonly url: (ref: ChunkRef) => string,
    private readonly fetchBytes: FetchBytes,
    private readonly clock: () => number = () => performance.now(),
    private readonly limit: number = RADIO.cacheBytes,
  ) {}

  /** Попросити шматки: перші — найважливіші. Те, що вже є, лишається в пам'яті довше за решту. */
  want(refs: readonly ChunkRef[]): void {
    for (const ref of refs) {
      const key = chunkKey(ref);
      const known = this.bytes.get(key);
      if (known) {
        this.bytes.delete(key);
        this.bytes.set(key, known);
        continue;
      }
      if (this.loading.size >= RADIO.parallelRequests) continue;
      if (this.loading.has(key)) continue;
      const failed = this.failedAt.get(key);
      if (failed !== undefined && this.clock() - failed < RADIO.retryMs) continue;
      this.load(ref, key);
    }
  }

  /** Копія байтів: `decodeAudioData` забирає переданий буфер собі. */
  copy(ref: ChunkRef): ArrayBuffer | null {
    return this.bytes.get(chunkKey(ref))?.slice(0) ?? null;
  }

  get size(): number {
    return this.total;
  }

  private load(ref: ChunkRef, key: string): void {
    this.loading.add(key);
    this.fetchBytes(this.url(ref))
      .then((data) => {
        this.failedAt.delete(key);
        this.bytes.set(key, data);
        this.total += data.byteLength;
        this.evict();
      })
      .catch(() => this.failedAt.set(key, this.clock()))
      .finally(() => this.loading.delete(key));
  }

  private evict(): void {
    for (const [key, data] of this.bytes) {
      if (this.total <= this.limit) return;
      this.bytes.delete(key);
      this.total -= data.byteLength;
    }
  }
}
