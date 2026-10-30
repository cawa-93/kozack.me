// Маніфест арту (крок 16, «Шов хвилі 1»): записи з `src/view/art/manifest/*.ts` перевірено — id унікальні й за форматом,
// кадри різні, стани й ракурси правильні; пошук за id; палітра-каркас; шви арту без Phaser і DOM.

import { describe, expect, it } from "vitest";

import { ALLOWED_COLORS, LINE, PALETTE } from "../art/palette";
import { ART_CATEGORIES, artEntries, artEntry, DEFAULT_RES, indexEntries, manifestProblems } from "../src/view/art/manifest";
import type { ArtCategory, ArtEntry } from "../src/view/art/types";

const FRIDGE: ArtEntry = { id: "env/fridge", size: { w: 140, h: 260 }, pivot: { x: 70, y: 228 }, states: ["closed", "open"] };
const HEAD: ArtEntry = {
  id: "cat/head/base",
  size: { w: 64, h: 60 },
  pivot: { x: 30, y: 50 },
  points: { mouth: { x: 44, y: 40 } },
  layers: ["fill", "tabby-classic", "shade", "ink"],
  views: ["front", "back"],
};
const THIRST: ArtEntry = { id: "icon/thirst", size: { w: 40, h: 40 }, pivot: { x: 20, y: 20 } };

describe("маніфест арту", () => {
  it("записи з каталогу manifest/ без помилок, кожен знаходиться за id", () => {
    const entries = artEntries();
    expect(manifestProblems(entries)).toEqual([]);
    for (const entry of entries) expect(artEntry(entry.id), entry.id).toBe(entry);
    expect(artEntry("env/no-such-thing")).toBeUndefined();
  });

  it("indexEntries — записи за id у їхньому порядку", () => {
    const index = indexEntries([FRIDGE, HEAD, THIRST]);
    expect([...index.keys()]).toEqual(["env/fridge", "cat/head/base", "icon/thirst"]);
    expect(index.get("cat/head/base")).toBe(HEAD);
    expect(indexEntries([]).size).toBe(0);
  });

  it("id, що повторюється, — помилка", () => {
    expect(() => indexEntries([FRIDGE, THIRST, { ...FRIDGE }])).toThrow(/«env\/fridge»: id повторюється/);
  });

  it("кадри різних записів не збігаються", () => {
    const open: ArtEntry = { id: "env/fridge/open", size: { w: 10, h: 10 }, pivot: { x: 5, y: 5 } };
    expect(manifestProblems([FRIDGE, open])).toEqual(["«env/fridge/open»: кадр «env/fridge/open» уже є в записі «env/fridge»"]);
    const front: ArtEntry = { id: "cat/head/base/front", size: { w: 10, h: 10 }, pivot: { x: 5, y: 5 } };
    expect(() => indexEntries([HEAD, front])).toThrow(/кадр «cat\/head\/base\/front» уже є в записі «cat\/head\/base»/);
  });

  it("неправильні id, стани, ракурси, шари й розміри знаходяться всі разом", () => {
    const bad = [
      { id: "furniture/sofa", size: { w: 1, h: 1 }, pivot: { x: 0, y: 0 } },
      { id: "env/Sofa_big", size: { w: 1, h: 1 }, pivot: { x: 0, y: 0 } },
      { id: "env", size: { w: 1, h: 1 }, pivot: { x: 0, y: 0 } },
      { id: "env/sofa", size: { w: 0, h: 1 }, pivot: { x: 0, y: Number.NaN }, res: 0 },
      { id: "env/door", size: { w: 1, h: 1 }, pivot: { x: 0, y: 0 }, states: ["front", "Open", "shut", "shut"] },
      { id: "cat/tail/long", size: { w: 1, h: 1 }, pivot: { x: 0, y: 0 }, views: ["side", "front", "front"], layers: ["fill", "glow", "fill"] },
      { id: "env/rug", size: { w: 1, h: 1 }, pivot: { x: 0, y: 0 }, states: [], views: [], points: { Top: { x: 0, y: 0 } } },
    ] as unknown as ArtEntry[];
    const problems = manifestProblems(bad);
    expect(problems).toEqual([
      "«furniture/sofa»: невідома категорія «furniture»",
      "«env/Sofa_big»: id — «категорія/назва[/варіант…]», сегменти з малих латинських літер, цифр і дефіса",
      "«env»: id — «категорія/назва[/варіант…]», сегменти з малих латинських літер, цифр і дефіса",
      "«env/sofa»: розмір має бути додатним",
      "«env/sofa»: pivot має бути числом",
      "«env/sofa»: res має бути додатною",
      "«env/door»: стан «shut» повторюється",
      "«env/door»: стан «front» збігається з назвою ракурсу",
      "«env/door»: стан «Open» — сегмент з малих латинських літер, цифр і дефіса",
      "«cat/tail/long»: шар «fill» повторюється",
      "«cat/tail/long»: невідомий шар «glow»",
      "«cat/tail/long»: ракурс «front» повторюється",
      "«cat/tail/long»: невідомий ракурс «side»",
      "«env/rug»: точка «Top» — сегмент з малих латинських літер, цифр і дефіса",
      "«env/rug»: порожній перелік ракурсів (без ракурсів — не задавати views)",
      "«env/rug»: порожній перелік станів (без станів — не задавати states)",
    ]);
    expect(() => indexEntries(bad)).toThrow(/^Маніфест арту:\n- «furniture\/sofa»/);
  });

  it("категорії — усі з ArtCategory, роздільність за замовчуванням — 2", () => {
    const all: Record<ArtCategory, true> = { env: true, item: true, mess: true, fx: true, cat: true, person: true, icon: true, ui: true, race: true };
    expect([...ART_CATEGORIES].sort()).toEqual(Object.keys(all).sort());
    expect(DEFAULT_RES).toBe(2);
  });
});

describe("палітра арту (каркас)", () => {
  it("кольори — #rrggbb, дозволені — усі з палітри нижнім регістром і білий", () => {
    for (const [token, color] of Object.entries(PALETTE)) expect(color, token).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(PALETTE.fill).toBe("#ffffff");
    expect(PALETTE).toHaveProperty("ink");
    expect(PALETTE).toHaveProperty("paper");
    expect([...ALLOWED_COLORS].sort()).toEqual([...new Set([...Object.values(PALETTE).map((c) => c.toLowerCase()), "#ffffff"])].sort());
    for (const color of ALLOWED_COLORS) expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("товщини контуру в межах", () => {
    expect(LINE.min).toBeLessThanOrEqual(LINE.inner);
    expect(LINE.inner).toBeLessThan(LINE.outer);
    expect(LINE.outer).toBeLessThanOrEqual(LINE.max);
  });
});

const pure = import.meta.glob<string>(["../src/view/art/manifest.ts", "../src/view/art/placement.ts", "../art/palette.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
});
const gallery = import.meta.glob<string>("../src/dev/gallery/tab.ts", { query: "?raw", import: "default", eager: true });

describe("шви арту", () => {
  it("маніфест, розміщення кадрів і палітра — без Phaser і DOM", () => {
    expect(Object.keys(pure)).toHaveLength(3);
    for (const [file, source] of Object.entries(pure)) {
      expect(source, file).not.toMatch(/from\s+["']phaser["']/);
      expect(source, file).not.toMatch(/\b(window|document|localStorage)\s*[.[]/);
    }
  });

  it("інтерфейс вкладки галереї імпортує лише типи", () => {
    const source = Object.values(gallery)[0] ?? "";
    expect(source).not.toBe("");
    const imports = source.match(/^import .*$/gm) ?? [];
    expect(imports).toEqual(['import type Phaser from "phaser";']);
  });
});
