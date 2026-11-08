// Каталог звуків (`sounds.html`, `src/dev/sounds/`): кожен звук гри описано, а рішення автора поводяться передбачувано.
// Сама сторінка — DOM, її перевіряє браузер.

import { describe, expect, it } from "vitest";

import { GROUPS } from "../src/audio/sfx/registry";
import { ABOUT } from "../src/dev/sounds/about";
import { aboutMismatch, buildCatalog } from "../src/dev/sounds/catalog";
import { countStatuses, decide, reviewStatus, soundPrint, toggleVariant, withComment } from "../src/dev/sounds/review";

const NOW = "2026-11-08T10:00:00.000Z";

describe("описи звуків", () => {
  it("кожен звук кожної групи описано рівно раз, і зайвих описів немає", () => {
    expect(Object.keys(ABOUT).sort()).toEqual(GROUPS.map((g) => g.id).sort());
    for (const group of GROUPS) {
      expect(aboutMismatch(group, ABOUT[group.id]), group.id).toEqual({ missing: [], extra: [], repeated: [] });
    }
  });

  it("назви звуків у групі різні, а «коли звучить» не порожнє", () => {
    for (const [id, about] of Object.entries(ABOUT)) {
      const entries = about.sections.flatMap((section) => Object.values(section.sounds));
      const titles = entries.map(([title]) => title);
      expect(new Set(titles).size, id).toBe(titles.length);
      for (const [title, when] of entries) expect(when.trim().length, `${id}: ${title}`).toBeGreaterThan(0);
    }
  });

  it("каталог показує всі звуки й файли з відбитком", () => {
    const catalog = buildCatalog({ groups: GROUPS, about: ABOUT, encoded: {}, sources: {}, url: () => null });
    const sounds = catalog.flatMap((group) => group.sections.flatMap((section) => section.sounds));
    expect(sounds.length).toBe(GROUPS.reduce((sum, g) => sum + Object.keys(g.sounds).length, 0));
    const parcel = sounds.find((s) => s.key === "home/parcel");
    expect(parcel?.files[0]?.shared).toEqual(["Поставив річ", "Запас ліг на місце"]);
  });
});

describe("рішення щодо звуку", () => {
  const files = ["meow-1", "meow-2", "meow-3"];
  const print = soundPrint({ gain: 0.7, files: files.map((name) => ({ name, hash: `h-${name}` })) });

  it("«замінити» спершу стосується всіх файлів, позначки знімаються по одній", () => {
    const review = decide(undefined, "replace", files, print, NOW)!;
    expect(review).toMatchObject({ decision: "replace", variants: files, print });
    expect(toggleVariant(review, "meow-2", files, NOW).variants).toEqual(["meow-1", "meow-3"]);
    expect(decide(undefined, "ok", files, print, NOW)?.variants).toBeUndefined();
    expect(decide(undefined, "delete", ["one"], print, NOW)?.variants).toBeUndefined();
  });

  it("та сама кнопка вдруге знімає рішення, коментар лишається", () => {
    const review = withComment(decide(undefined, "replace", files, print, NOW)!, "гуде", print, NOW)!;
    expect(decide(review, "replace", files, print, NOW)).toMatchObject({ decision: null, comment: "гуде" });
    expect(decide(decide(undefined, "ok", files, print, NOW)!, "ok", files, print, NOW)).toBeNull();
    expect(withComment(undefined, "  ", print, NOW)).toBeNull();
  });

  it("звук змінили після рішення — його треба переслухати; натиснути рішення знову — підтвердити", () => {
    const review = decide(undefined, "ok", files, print, NOW)!;
    const changed = soundPrint({ gain: 0.7, files: files.map((name) => ({ name, hash: `new-${name}` })) });
    expect(reviewStatus(review, print)).toBe("ok");
    expect(reviewStatus(review, changed)).toBe("stale");
    expect(reviewStatus(review, soundPrint({ gain: 0.5, files: files.map((name) => ({ name, hash: `h-${name}` })) }))).toBe("stale");
    expect(reviewStatus(decide(review, "ok", files, changed, NOW)!, changed)).toBe("ok");
    expect(reviewStatus(withComment(undefined, "гуде", print, NOW)!, print)).toBe("none");
  });

  it("лічильники фільтрів", () => {
    expect(countStatuses(["none", "ok", "ok", "stale", "delete"])).toEqual({ all: 5, none: 1, stale: 1, ok: 2, replace: 0, delete: 1 });
  });
});
