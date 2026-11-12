// Збереження файлом (§4.2): посилання на файл живе, доки його не прочитав браузер, а завеликий файл не читається.

import { afterEach, describe, expect, it, vi } from "vitest";

import { exportSave, exportUnreadable, importSave } from "../src/ui/files";
import { newGame, serialize } from "../src/sim/game";

/** Документ для тесту: посилання, яке «клацають», і тіло сторінки — у Node їх немає. */
function fakeDocument(): { clicks: string[] } {
  const clicks: string[] = [];
  const link = { href: "", download: "", click: () => clicks.push(link.href), remove: () => undefined };
  (globalThis as { document?: unknown }).document = { createElement: () => link, body: { append: () => undefined } };
  return { clicks };
}

/** Файл для тесту: розмір і текст, а чи текст читали — видно з `read`. */
function fakeFile(size: number, text: string): { file: File; read: () => number } {
  let reads = 0;
  const file = {
    size,
    text: async () => {
      reads++;
      return text;
    },
  } as unknown as File;
  return { file, read: () => reads };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (globalThis as { document?: unknown }).document;
});

describe("зберегти файлом", () => {
  it("посилання на файл відкликається не одразу: Safari на iPhone читає його лише після «Завантажити?»", () => {
    vi.useFakeTimers();
    const { clicks } = fakeDocument();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:save");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    exportSave(newGame({ address: "she", difficulty: "normal", seed: 3 }));
    expect(clicks).toEqual(["blob:save"]);
    // Гравець читає питання браузера й думає: посилання ще живе.
    vi.advanceTimersByTime(59_000);
    expect(revoke).not.toHaveBeenCalled();
    // Але й не висить у пам'яті до кінця гри.
    vi.advanceTimersByTime(2_000);
    expect(revoke).toHaveBeenCalledWith("blob:save");
  });

  it("так само — нечитабельне збереження", () => {
    vi.useFakeTimers();
    fakeDocument();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:unreadable");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    exportUnreadable("{}");
    vi.advanceTimersByTime(59_000);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    expect(revoke).toHaveBeenCalledWith("blob:unreadable");
  });
});

describe("завантажити з файлу", () => {
  it("збереження з файлу відкривається", async () => {
    const { file } = fakeFile(1000, serialize(newGame({ address: "she", difficulty: "normal", seed: 3 })));
    await expect(importSave(file)).resolves.toMatchObject({ current: { seed: 3 } });
  });

  it("завеликий файл (випадково обране відео) не читається: одразу помилка, як поганий файл", async () => {
    // Справжнє збереження — десятки кілобайтів; 25 МБ — точно не воно.
    const { file, read } = fakeFile(25 * 1024 * 1024, serialize(newGame({ address: "she", difficulty: "normal", seed: 3 })));
    await expect(importSave(file)).rejects.toThrow();
    expect(read()).toBe(0);
  });
});
