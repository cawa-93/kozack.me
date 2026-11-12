// Ланцюг станції (§8.10, `src/audio/radio/broadcast.ts`): шматок, що декодувався, поки ефір перескочив далі чи станцію
// перемкнули, вже не заграє — і в пам'яті не лишається (розкодований шматок важить мегабайти).

import { afterEach, describe, expect, it, vi } from "vitest";

import { Broadcast } from "../src/audio/radio/broadcast";
import type { ChunkStore } from "../src/audio/radio/chunks";
import { STATIONS } from "../src/audio/radio/playlist";
import { fakeAudio, settle } from "./fakeaudio";

const NOW = 1_800_000_000;
/** Шматки є всі й одразу: їх байти не важливі, бо декодує фальшивий контекст. */
const store = { copy: () => new ArrayBuffer(8) } as unknown as ChunkStore;
/** Розкодовані шматки ланцюга: інакше їх не видно. */
const decodedOf = (broadcast: Broadcast): Map<string, unknown> => (broadcast as unknown as { decoded: Map<string, unknown> }).decoded;

afterEach(() => vi.unstubAllGlobals());

describe("ланцюг станції: розкодоване — лише те, що ще заграє (§8.10)", () => {
  it("ефір перескочив далі, поки шматок декодувався: шматок не лишається в пам'яті", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("без шуму ефіру"))));
    const audio = fakeAudio({ hold: true, seconds: 8 });
    // Годинник ефіру йде разом із годинником контексту.
    const broadcast = new Broadcast(audio.engine, store, () => NOW + audio.context.currentTime);
    broadcast.tune(STATIONS[0]!);
    expect(audio.decodes).toHaveLength(1);
    // Шматок не встиг за пів хвилини: ефір пішов далі, ланцюг стрибає туди, де трансляція зараз.
    audio.context.currentTime = 30;
    broadcast.tick();
    expect(audio.decodes).toHaveLength(2);
    audio.decodes[0]!.resolve();
    await settle();
    expect(decodedOf(broadcast).size).toBe(0);
    expect(audio.started()).toHaveLength(0);
    // Потрібний шматок заграє, щойно готовий.
    audio.decodes[1]!.resolve();
    await settle();
    expect(audio.started()).toHaveLength(1);
    expect(decodedOf(broadcast).size).toBe(0);
  });

  it("станцію перемкнули чи вимкнули, поки шматок декодувався: він не лишається в пам'яті", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("без шуму ефіру"))));
    const audio = fakeAudio({ hold: true, seconds: 8 });
    const broadcast = new Broadcast(audio.engine, store, () => NOW);
    broadcast.tune(STATIONS[0]!);
    broadcast.tune(null);
    audio.decodes[0]!.resolve();
    await settle();
    expect(decodedOf(broadcast).size).toBe(0);
  });
});
