// Іконки карток наперед (§2.1): пакет одним запитом, а без нього — окремі файли по порядку й порціями.

import { describe, expect, it } from "vitest";

import { glyphUrls } from "../src/ui/glyphs";
import { iconUrl, iconUrls } from "../src/ui/icons";
import { cardArtUrls, warmArt, warmImages } from "../src/ui/warmart";
import { DESTINATION_ICONS } from "../src/view/symbols";

describe("іконки карток наперед (§2)", () => {
  it("спершу гліфи й пункти поїздки, усі іконки — по одному разу", () => {
    const urls = cardArtUrls();
    expect(new Set(urls).size).toBe(urls.length);
    for (const url of iconUrls()) if (!url.startsWith("data:")) expect(urls).toContain(url);
    const first = urls.slice(0, glyphUrls().length + Object.keys(DESTINATION_ICONS).length);
    for (const icon of Object.values(DESTINATION_ICONS)) expect(first).toContain(iconUrl(icon));
  });

  it("вбудоване в код запиту не потребує", () => {
    expect(cardArtUrls().some((url) => url.startsWith("data:"))).toBe(false);
  });

  it("наступна порція — лише після попередньої, і файл, що не прийшов, не зупиняє решту", async () => {
    const urls = Array.from({ length: 13 }, (_, i) => `file-${i}`);
    let running = 0;
    let most = 0;
    const loaded: string[] = [];
    await warmImages(
      urls,
      async (url) => {
        running += 1;
        most = Math.max(most, running);
        await Promise.resolve();
        running -= 1;
        loaded.push(url);
        if (url === "file-2") throw new Error("немає мережі");
      },
      () => Promise.resolve(),
    );
    expect(loaded.sort()).toEqual([...urls].sort());
    expect(most).toBeLessThanOrEqual(6);
  });
});

describe("іконки карток наперед: пакет одним запитом (§2.1)", () => {
  const PACK = '{"icon/kibble":"<svg/>"}';

  /** Перебіг `warmArt` із мережею `answers` (по відповіді на запит: текст чи помилка): що гра робила й у якому порядку. */
  async function run(packUrl: string | null, answers: readonly (string | Error)[]): Promise<{ log: string[]; adopted: (readonly [string, string])[][] }> {
    const log: string[] = [];
    const adopted: (readonly [string, string])[][] = [];
    let asked = 0;
    await warmArt({
      packUrl,
      fetchText: async (url) => {
        log.push(`запит ${url}`);
        const answer = answers[asked++] ?? new Error("зайвий запит");
        if (answer instanceof Error) throw answer;
        return answer;
      },
      adopt: (pack) => {
        log.push("пакет");
        adopted.push([...pack]);
      },
      // Після пакета картки беруть адреси з нього — ті самі гра й готує наперед.
      urls: () => (adopted.length > 0 ? ["blob:1", "blob:2"] : ["a.svg", "b.svg"]),
      load: async (url) => void log.push(`малюнок ${url}`),
      pause: () => Promise.resolve(),
      wait: async (ms) => void log.push(`пауза ${ms > 0 ? "є" : "нульова"}`),
    });
    return { log, adopted };
  }

  it("пакет прийшов — один запит, і наперед готуються малюнки вже з пакета", async () => {
    const { log, adopted } = await run("/assets/card-art-1.json", [PACK]);
    expect(log).toEqual(["запит /assets/card-art-1.json", "пакет", "малюнок blob:1", "малюнок blob:2"]);
    expect(adopted).toEqual([[["icon/kibble", "<svg/>"]]]);
  });

  it("мережа обірвалася — ще спроба після паузи, без окремих файлів", async () => {
    const { log } = await run("/p.json", [new Error("немає мережі"), PACK]);
    expect(log).toEqual(["запит /p.json", "пауза є", "запит /p.json", "пакет", "малюнок blob:1", "малюнок blob:2"]);
  });

  it("замість пакета прийшло щось інше — це теж невдала спроба", async () => {
    const { log } = await run("/p.json", ["<!doctype html>", PACK]);
    expect(log).toEqual(["запит /p.json", "пауза є", "запит /p.json", "пакет", "малюнок blob:1", "малюнок blob:2"]);
  });

  it("пакет так і не прийшов — тихо, після кількох спроб, далі окремими файлами", async () => {
    const { log, adopted } = await run("/p.json", Array.from({ length: 10 }, () => new Error("немає мережі")));
    const requests = log.filter((line) => line.startsWith("запит")).length;
    expect(requests).toBeGreaterThanOrEqual(2);
    expect(requests).toBeLessThanOrEqual(3);
    expect(log.filter((line) => line.startsWith("пауза"))).toEqual(Array.from({ length: requests - 1 }, () => "пауза є"));
    expect(adopted).toEqual([]);
    expect(log.slice(-2)).toEqual(["малюнок a.svg", "малюнок b.svg"]);
  });

  it("збірка без пакета (режим розробки) — жодного запиту по нього, окремі файли, як і були", async () => {
    const { log } = await run(null, []);
    expect(log).toEqual(["малюнок a.svg", "малюнок b.svg"]);
  });
});
