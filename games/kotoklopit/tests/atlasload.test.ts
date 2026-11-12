// Завантаження сторінок атласу (`atlasload.ts`): сторінка віддається текстурі лише розпакованою (`afterDecode`), інакше
// браузер розпаковує всі сторінки синхронно, коли атлас уперше малюють, — пауза в кінці завантаження.

import { afterEach, describe, expect, it, vi } from "vitest";

import { afterDecode, DECODE_WAIT_MS } from "../src/view/art/loadprogress";

/** Зображення, чиє `decode` закінчується, коли скаже тест. */
function decoding(): { image: { decode: () => Promise<void> }; finish: () => void; fail: () => void } {
  let finish = (): void => {};
  let fail = (): void => {};
  const promise = new Promise<void>((resolve, reject) => {
    finish = resolve;
    fail = () => reject(new Error("EncodingError"));
  });
  return { image: { decode: () => promise }, finish, fail };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("сторінка атласу — лише розпакованою (`afterDecode`)", () => {
  it("чекає, поки зображення розпакується, і далі — рівно раз", async () => {
    const page = decoding();
    let done = 0;
    afterDecode(page.image, () => done++);
    await flush();
    expect(done).toBe(0);
    page.finish();
    await flush();
    expect(done).toBe(1);
  });

  it("помилка розпакування не зупиняє завантаження: зображення придатне, лише розпакується пізніше", async () => {
    const page = decoding();
    let done = 0;
    afterDecode(page.image, () => done++);
    page.fail();
    await flush();
    expect(done).toBe(1);
  });

  describe("розпакування, що не закінчується (браузер не розпаковує поза екраном, вкладку сховано)", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("не тримає завантаження: по запобіжнику — далі, а пізніше розпакування вже нічого не кличе", async () => {
      vi.useFakeTimers();
      const page = decoding();
      let done = 0;
      afterDecode(page.image, () => done++);
      await vi.advanceTimersByTimeAsync(DECODE_WAIT_MS - 1);
      expect(done).toBe(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(done).toBe(1);
      page.finish();
      await vi.advanceTimersByTimeAsync(DECODE_WAIT_MS);
      expect(done).toBe(1);
    });

    it("запобіжник — не менше секунди: розпакування великої сторінки на повільному телефоні він не обриває", () => {
      expect(DECODE_WAIT_MS).toBeGreaterThanOrEqual(1000);
    });

    it("розпаковане вчасно запобіжник уже не кличе вдруге", async () => {
      vi.useFakeTimers();
      const page = decoding();
      let done = 0;
      afterDecode(page.image, () => done++);
      page.finish();
      await vi.advanceTimersByTimeAsync(0);
      expect(done).toBe(1);
      await vi.advanceTimersByTimeAsync(DECODE_WAIT_MS * 2);
      expect(done).toBe(1);
    });
  });

  it("браузер без `decode` — одразу; `decode`, що кидає виняток, — теж", () => {
    let done = 0;
    afterDecode({}, () => done++);
    expect(done).toBe(1);
    afterDecode(
      {
        decode: () => {
          throw new Error("не підтримується");
        },
      },
      () => done++,
    );
    expect(done).toBe(2);
  });
});
