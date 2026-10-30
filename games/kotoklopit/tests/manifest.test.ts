// Повнота маніфесту арту (крок 16, F5, GRAPHICS_PLAN.md: «Джерела для маніфесту (F5)»): кожна річ, стан, форма, варіант і
// іконка, що їх показує гра, має запис у `src/view/art/manifest/*.ts`. Очікуване рахується з коду гри (мапа, речі,
// сховища, магазин, форми кота, вигляд персонажа, назви іконок), а не з копії переліку: з'явиться в грі нова річ чи
// іконка — тест покаже, що її треба намалювати. Тут же — правила записів: id, розміри, pivot, ракурси й шари.

import { describe, expect, it } from "vitest";

import { BOWL_CAPACITY, THINGS } from "../src/sim/config";
import type { TabbyPattern } from "../src/sim/genetics";
import { FUR_SPOTS, ROBOT_DOCK } from "../src/sim/household";
import { MAP, MAP_HEIGHT, MAP_WIDTH, OBJECTS, ROOMS, roomAt, TRINKETS, WINDOWS, type Rect } from "../src/sim/home";
import { MAX_BOXES, STORAGES, type FillStage } from "../src/sim/storage";
import type { Dish, Home, HomeItem, Item, Look, MessKind, Quality, Shape, ThingKind } from "../src/sim/types";
import { LOOK_OPTIONS } from "../src/ui/look";
import { GLYPH_ART } from "../src/view/art/manifest/a12-icons";
import { backWallCells, CAT_COAT, CAT_FLUFF, iso, TH, TW, WALL_HEIGHT, WALL_SEGMENTS, wallKind } from "../src/view/art/manifest/lib/geometry";
import { artEntries, artEntry, DEFAULT_RES, manifestProblems } from "../src/view/art/manifest";
import { ART_VIEWS, framesOf, type ArtEntry, type ArtLayer, type TortieLayer, type WhiteLayer } from "../src/view/art/types";
import { ICON_NAMES, type BubbleKind, type Mark } from "../src/view/iconnames";

const ENTRIES = artEntries();

/** Запис за id; немає — помилка з id, щоб було видно, чого бракує. */
function entry(id: string): ArtEntry {
  const found = artEntry(id);
  if (!found) throw new Error(`немає запису «${id}»`);
  return found;
}
const states = (id: string): readonly string[] => entry(id).states ?? [];
/** `momMeal` → `mom-meal`: назви з коду в сегменти id. */
const kebab = (name: string): string => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
/** Ключі запису-переліку: `Record<Union, true>` змушує перелічити всі значення типу (новий — помилка типів тут). */
const keys = <K extends string | number>(record: Record<K, unknown>): K[] => Object.keys(record) as K[];

const QUALITIES: Record<Quality, true> = { cheap: true, premium: true };
const FILL_STAGES: Record<FillStage, true> = { 0: true, 1: true, 2: true, 3: true, 4: true };
const FULL = keys(FILL_STAGES).map((stage) => `full-${stage}`);

/** Чи вміщує полотно запису точку `p` (одиниці арту від pivot). */
const inside = (e: ArtEntry, p: { x: number; y: number }): boolean => {
  const x = e.pivot.x + p.x;
  const y = e.pivot.y + p.y;
  return x >= 0 && y >= 0 && x <= e.size.w && y <= e.size.h;
};

describe("маніфест: правила записів", () => {
  it("записи без помилок: id за форматом і унікальні, кадри різні, розміри додатні", () => {
    expect(ENTRIES.length).toBeGreaterThan(0);
    expect(manifestProblems(ENTRIES)).toEqual([]);
  });

  it("pivot — у межах полотна, точки — біля нього", () => {
    // Точка може вийти за полотно недалеко: `top` голови кота — над вухами, а вуха — окремі частини (еталон F1b).
    const NEAR = 16;
    for (const e of ENTRIES) {
      expect(e.pivot.x >= 0 && e.pivot.x <= e.size.w && e.pivot.y >= 0 && e.pivot.y <= e.size.h, `${e.id}: pivot`).toBe(true);
      for (const [name, p] of Object.entries(e.points ?? {})) {
        expect(p.x >= -NEAR && p.x <= e.size.w + NEAR && p.y >= -NEAR && p.y <= e.size.h + NEAR, `${e.id}: точка ${name}`).toBe(true);
      }
    }
  });

  it("кожен кадр уміщується на сторінку атласу 2048²", () => {
    for (const e of ENTRIES) {
      const res = e.res ?? DEFAULT_RES;
      expect(Math.max(e.size.w, e.size.h) * res, e.id).toBeLessThanOrEqual(2048);
    }
  });

  it("ракурси — лише в частин скелета кота й персонажа, і там обидва", () => {
    for (const e of ENTRIES) {
      const rig = e.id.startsWith("cat/") || e.id.startsWith("person/");
      expect(e.views, e.id).toEqual(rig ? ART_VIEWS : undefined);
    }
  });

  it("шари — лише дозволені для категорії", () => {
    // Кіт — шерсть, пасма, райдужка й деталі в готових кольорах; персонаж — його заливки й деталі; решта — готові кольори
    // або білий кузов, що фарбує код.
    const allowed = (id: string): readonly ArtLayer[] =>
      id.startsWith("cat/")
        ? [...CAT_COAT, ...CAT_FLUFF, "fill-iris", "detail"]
        : id.startsWith("person/")
          ? ["fill-skin", "fill-hair", "fill-iris", "fill-top", "fill-bottom", "fill-shoes", "detail", "shade", "ink"]
          : ["fill", "detail", "shade", "ink"];
    for (const e of ENTRIES) {
      for (const layer of e.layers ?? []) if (!layer.startsWith("extra-")) expect(allowed(e.id), `${e.id}: ${layer}`).toContain(layer);
    }
  });

  it("файл маніфесту — свій пакет: категорії записів за файлом", () => {
    const files = import.meta.glob<readonly ArtEntry[]>("../src/view/art/manifest/*.ts", { import: "MANIFEST", eager: true });
    const allowed: Record<string, readonly string[]> = {
      "a01-build": ["env/"],
      "a02-kitchen": ["env/"],
      "a03-bath": ["env/"],
      "a04-rooms": ["env/"],
      "a05-catstuff": ["item/"],
      "a06-mess": ["mess/", "fx/"],
      "a07-cat-base": ["cat/"],
      "a08-cat-variants": ["cat/"],
      "a10-person": ["person/"],
      "a11-icons": ["icon/"],
      "a12-icons": ["icon/", "ui/bubble/", "ui/glyph/"],
      "a13-ui": ["ui/"],
      "a14-race": ["race/"],
    };
    const names = Object.keys(files).map((f) => f.replace(/^.*\//, "").replace(/\.ts$/, ""));
    expect(names.sort()).toEqual(Object.keys(allowed).sort());
    for (const [file, entries] of Object.entries(files)) {
      const name = file.replace(/^.*\//, "").replace(/\.ts$/, "");
      expect(entries.length, name).toBeGreaterThan(0);
      for (const e of entries) expect(allowed[name]?.some((prefix) => e.id.startsWith(prefix)), `${name}: ${e.id}`).toBe(true);
    }
  });

  it("сумарне полотно атласу в межах оцінки бюджету", () => {
    // Площа всіх шарів усіх кадрів до обрізки, пікселі атласу: верхня межа того, що піде на сторінки. Оцінка на хвилю 1 —
    // ≈ 34 Мпкс (`art/INVENTORY.md`); межа з запасом на те, що додасть хвиля 2. Перевищення — сигнал переглянути `res`.
    let area = 0;
    for (const e of ENTRIES) {
      const res = e.res ?? DEFAULT_RES;
      area += framesOf(e).length * (e.layers?.length ?? 1) * e.size.w * res * e.size.h * res;
    }
    expect(area).toBeLessThan(48e6);
  });

  it("маніфест — без Phaser і DOM", () => {
    const sources = import.meta.glob<string>(["../src/view/art/manifest/*.ts", "../src/view/art/manifest/lib/*.ts"], {
      query: "?raw",
      import: "default",
      eager: true,
    });
    expect(Object.keys(sources).length).toBeGreaterThan(13);
    for (const [file, source] of Object.entries(sources)) {
      expect(source, file).not.toMatch(/from\s+["']phaser["']/);
      expect(source, file).not.toMatch(/\b(window|document|localStorage)\s*[.[]/);
    }
  });
});

describe("маніфест: квартира", () => {
  it("кімната — плити підлоги й задніх стін, що вміщують її з pivot у верхній вершині (room.x, room.y)", () => {
    for (const room of ROOMS) {
      const floor = entry(`env/room/${room.id}/floor`);
      // Ромб кімнати від верхньої вершини її першої клітинки.
      for (const corner of [iso({ x: 0, y: room.h }), iso({ x: room.w, y: 0 }), iso({ x: room.w, y: room.h })]) {
        expect(inside(floor, corner), `${room.id}: підлога`).toBe(true);
      }
      const wall = entry(`env/room/${room.id}/wall`);
      const cells = backWallCells(room);
      expect(cells.length, room.id).toBeGreaterThan(0);
      for (const c of cells) {
        const o = { x: c.x - room.x, y: c.y - room.y };
        expect(inside(wall, iso(o, WALL_HEIGHT.back)), `${room.id}: верх стіни (${c.x}, ${c.y})`).toBe(true);
        expect(inside(wall, iso({ x: o.x + 1, y: o.y + 1 })), `${room.id}: низ стіни (${c.x}, ${c.y})`).toBe(true);
      }
    }
  });

  it("кожна клітинка стіни мапи — рівно в одному: задня стіна кімнати, сегмент чи вхідні двері", () => {
    const door = OBJECTS.find((o) => o.kind === "door");
    const covers = (r: Rect, x: number, y: number): boolean => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (MAP[y]?.[x] !== "#") continue;
        const owners = [
          ...ROOMS.filter((room) => backWallCells(room).some((c) => c.x === x && c.y === y)).map((room) => `env/room/${room.id}/wall`),
          ...WALL_SEGMENTS.filter((s) => covers(s.rect, x, y)).map((s) => s.id),
          ...(door && covers(door, x, y) ? ["env/door"] : []),
        ];
        expect(owners, `(${x}, ${y})`).toHaveLength(1);
        // Задні — лише ряд y = 0 і стовпець x = 0; передні — ряд y = 11 і стовпець x = 19 (контракт).
        const kind = wallKind(x, y);
        if (kind === "back") expect(x === 0 || y === 0, `(${x}, ${y})`).toBe(true);
        if (kind === "front") expect(x === MAP_WIDTH - 1 || y === MAP_HEIGHT - 1, `(${x}, ${y})`).toBe(true);
      }
    }
  });

  it("сегмент стіни — запис, що вміщує всі його клітинки, з pivot у верхній вершині першої", () => {
    for (const s of WALL_SEGMENTS) {
      const e = entry(s.id);
      const height = s.kind === "inner" ? WALL_HEIGHT.inner : WALL_HEIGHT.front;
      for (let y = 0; y < s.rect.h; y++) {
        for (let x = 0; x < s.rect.w; x++) {
          expect(wallKind(s.rect.x + x, s.rect.y + y), s.id).toBe(s.kind);
          expect(inside(e, iso({ x, y }, height)) && inside(e, iso({ x: x + 1, y: y + 1 })), `${s.id}: (${x}, ${y})`).toBe(true);
        }
      }
    }
  });

  it("кожна річ квартири (OBJECTS) — запис env/<id>, слід уміщується, pivot — точка під центром сліду", () => {
    for (const o of OBJECTS) {
      const e = entry(`env/${o.id}`);
      const half = { x: ((o.w + o.h) * TW) / 4, y: ((o.w + o.h) * TH) / 4 };
      expect(inside(e, { x: -half.x, y: 0 }) && inside(e, { x: half.x, y: 0 }) && inside(e, { x: 0, y: half.y }), o.id).toBe(true);
    }
  });

  it("стани речей, які показує вигляд", () => {
    // Пральна машина — усі стани сима; плита — кожна страва; ящики — 1…MAX_BOXES коробок; холодильник — за контрактом.
    const washer: Record<Home["washer"]["state"], true> = { idle: true, washing: true, done: true };
    expect(states("env/washer")).toEqual(expect.arrayContaining(keys(washer)));
    const stove: Record<Dish["kind"], string> = { raw: "raw", meal: "ready", burnt: "burnt" };
    expect(states("env/stove")).toEqual(expect.arrayContaining(["off", "cooking", ...Object.values(stove)]));
    expect(states("env/boxes")).toEqual(Array.from({ length: MAX_BOXES }, (_, i) => `pile-${i + 1}`));
    expect(states("env/fridge")).toEqual(["closed", "open"]);
    // Стани з прапорців квартири (`Home`): шафку відчинив кіт, рулон розмотано, дріт перегризено, шкарпетка в схованці.
    const flags = {
      cabinetOpen: ["env/cat-cabinet", "open"],
      rollDown: ["env/toilet-roll", "unrolled"],
      wireChewed: ["env/wire", "chewed"],
      sock: ["mess/sock", "peek"],
    } as const satisfies Partial<Record<keyof Home, readonly [string, string]>>;
    for (const [id, state] of Object.values(flags)) expect(states(id), id).toContain(state);
    // Решта: перекинутий смітник, увімкнений монітор, відчинені двері, кран, душ, кіт під ковдрою, шафа з пилососом.
    const shown: readonly [string, string][] = [
      ["env/trash", "tipped"],
      ["env/computer", "on"],
      ["env/computer", "off"],
      ["env/door", "open"],
      ["env/sink", "running"],
      ["env/shower", "running"],
      ["env/bed", "hump"],
      ["env/vacuum", "open"],
    ];
    for (const [id, state] of shown) expect(states(id), id).toContain(state);
  });

  it("8 сховищ × стани запасів 0–4: кожен запас видно з самого сховища", () => {
    expect(STORAGES).toHaveLength(8);
    for (const storage of STORAGES) {
      const base = `env/${storage.object}`;
      const own = ENTRIES.filter((e) => e.id === base || e.id.startsWith(`${base}/`));
      expect(own.some((e) => FULL.every((s) => e.states?.includes(s))), `${storage.object}: full-0…full-4`).toBe(true);
      const shaped = FULL.every((s) => states(base).includes(s));
      for (const product of storage.products) {
        expect(shaped || artEntry(`${base}/${kebab(product)}`) !== undefined, `${storage.object}: ${product}`).toBe(true);
      }
    }
  });

  it("вікна, туалетний папір, дріт, кошик білизни", () => {
    for (const w of WINDOWS) {
      const sill = OBJECTS.find((o) => o.id === w.sill);
      expect(sill, w.sill).toBeDefined();
      entry(`env/window/${roomAt(sill ?? { x: 0, y: 0 })}`);
      expect(entry(`env/${w.sill}`).points?.["seat"], w.sill).toBeDefined();
    }
    entry("env/toilet-roll");
    entry("env/wire");
    expect(states("env/laundry-basket")).toEqual(expect.arrayContaining(["load-0", "load-5", "overflow"]));
  });
});

describe("маніфест: речі котів, у руках, бруд", () => {
  it("кожна річ магазину (THINGS) × якість — item/<річ>/<якість>, і речі котячого кутка серед них", () => {
    for (const thing of Object.keys(THINGS) as ThingKind[]) {
      for (const quality of Object.keys(THINGS[thing].price) as Quality[]) entry(`item/${kebab(thing)}/${quality}`);
    }
    const homeKinds: Record<HomeItem["kind"], true> = { bowl: true, water: true, litter: true, toy: true, house: true, scratcher: true };
    for (const kind of keys(homeKinds)) expect(Object.keys(THINGS), kind).toContain(kind);
    expect(ROBOT_DOCK).toBeDefined();
    entry("item/robot-dock");
  });

  it("корм у мисках і годівницях, наповнювач у лотках, іграшка — у всіх станах", () => {
    const foods = [...keys(QUALITIES), "sterile"];
    for (const q of keys(QUALITIES)) {
      const bowl = states(`item/bowl/${q}`);
      expect(bowl).toContain("empty");
      for (const food of foods) for (let n = 1; n <= BOWL_CAPACITY; n++) expect(bowl, `миска: ${food}-${n}`).toContain(`${food}-${n}`);
      const feeder = states(`item/feeder/${q}`);
      for (const food of foods) expect(feeder, `годівниця: ${food}`).toEqual(expect.arrayContaining([`${food}-low`, `${food}-full`]));
      // Наповнювач лотка — якість (`LitterItem.litter`) чи немає.
      const litter = states(`item/litter/${q}`);
      expect(litter).toContain("empty");
      for (const fill of keys(QUALITIES)) expect(litter).toEqual(expect.arrayContaining([fill, `${fill}-used`, `${fill}-dirty`]));
      expect(states(`item/water/${q}`)).toEqual(expect.arrayContaining(["empty", "full"]));
      // Іграшка лежить, захована (`ToyItem.hidden`), у зубах кота й у руці персонажа (`HeldToy`).
      expect(states(`item/toy/${q}`)).toEqual(expect.arrayContaining(["floor", "hidden", "teeth", "hand"]));
    }
  });

  it("кожна річ у руках (Item) має кадр; кота на руках малює його скелет", () => {
    const held: Record<Item["kind"], string | null> = {
      raw: "item/dish/raw",
      meal: "item/dish/meal",
      burnt: "item/dish/burnt",
      catfood: "item/scoop",
      cat: null,
      toy: "item/toy/cheap",
    };
    for (const id of Object.values(held)) if (id !== null) entry(id);
    for (const kind of ["raw", "meal", "burnt"] as const satisfies readonly Dish["kind"][]) expect(states(`item/dish/${kind}`)).toEqual(keys(QUALITIES));
    // Мамин судочок (`Dish.mom`) і совок корму для стерилізованих (`CatFoodScoop.sterile`).
    entry("item/dish/mom");
    expect(states("item/scoop")).toEqual([...keys(QUALITIES), "sterile"]);
  });

  it("кожен вид бруду, дрібнички зі столів, жмути шерсті", () => {
    const messes: Record<MessKind, true> = {
      surprise: true,
      vomit: true,
      hairball: true,
      litter: true,
      broken: true,
      fur: true,
      mark: true,
      puddle: true,
      paper: true,
      garbage: true,
    };
    for (const kind of keys(messes)) entry(`mess/${kebab(kind)}`);
    for (const t of TRINKETS) expect(states(`mess/trinket/${t.kind}`)).toEqual(["standing", "fallen"]);
    expect(FUR_SPOTS.length).toBeGreaterThan(0);
    entry("mess/fur-tuft");
  });
});

describe("маніфест: кіт", () => {
  const cats = ENTRIES.filter((e) => e.id.startsWith("cat/"));
  // Частини з шерстю: без накладок і без очей (у очей — райдужка, а не шерсть).
  const base = cats.filter((e) => !/^cat\/[a-z]+-extra\//.test(e.id) && e.id !== "cat/eyes");
  const tabby: Record<TabbyPattern, true> = { classic: true, mackerel: true, spotted: true, ticked: true };
  const tortie: Record<TortieLayer, true> = { "tortie-a": true, "tortie-b": true, "tortie-c": true };
  const white: Record<WhiteLayer, true> = { "white-1": true, "white-2": true, "white-3": true };
  const coat: readonly ArtLayer[] = [
    "fill",
    ...keys(tabby).map((p): ArtLayer => `tabby-${p}`),
    ...keys(tortie),
    ...keys(white),
    "point",
    "shade",
    "ink",
  ];

  it("кожне значення форм (Shape) — частина кота; безхвостий — без хвоста", () => {
    const builds: Record<Shape["build"], true> = { slim: true, normal: true, stocky: true };
    for (const b of keys(builds)) for (const id of [`cat/body/${b}`, `cat/body-extra/${b}`, `cat/belly/${b}`]) entry(id);
    const ears: Record<Shape["ears"], true> = { normal: true, large: true, folded: true, curled: true, tufted: true };
    for (const e of keys(ears)) entry(`cat/ear/${e}`);
    const muzzles: Record<Shape["muzzle"], true> = { normal: true, flat: true, long: true };
    for (const m of keys(muzzles)) entry(`cat/muzzle/${m}`);
    const tails: Record<Shape["tail"], true> = { long: true, short: true, fluffy: true, bobtail: true, none: true };
    for (const t of keys(tails)) {
      if (t === "none") expect(artEntry("cat/tail/none")).toBeUndefined();
      else for (const id of [`cat/tail/${t}`, `cat/tail-extra/${t}`]) entry(id);
    }
    const legs: Record<Shape["legs"], true> = { normal: true, short: true };
    for (const l of keys(legs)) for (const id of [`cat/leg-front/${l}`, `cat/leg-back/${l}`]) entry(id);
    entry("cat/head/base");
    entry("cat/head-extra/base");
  });

  it("кожна частина — усі шари шерсті; тулуб, голова й хвіст — з пасмами довгої шерсті", () => {
    expect(base.length).toBeGreaterThan(20);
    for (const e of base) {
      expect(e.layers, e.id).toEqual(expect.arrayContaining([...coat]));
      if (/^cat\/(body|head|tail)\//.test(e.id)) expect(e.layers, e.id).toEqual(expect.arrayContaining(["fluff", "fluff-ink"]));
    }
  });

  it("очі й рот — стани виразів за контрактом, очі — райдужка без шерсті (еталон F1b)", () => {
    expect(states("cat/eyes")).toEqual(["open", "half", "closed", "arc", "squint", "round", "sick"]);
    expect(entry("cat/eyes").layers).toEqual(["fill-iris", "detail", "shade", "ink"]);
    expect(states("cat/mouth")).toEqual(["closed", "meow", "hiss", "yawn", "eat", "tongue"]);
  });

  it("накладки шерсті: безшерсті, кучеряві, залисини, тьмяна шерсть, нашийник", () => {
    const layers = new Set(cats.flatMap((e) => e.layers ?? []));
    const coats: Record<NonNullable<Shape["coat"]>, ArtLayer> = { hairless: "extra-wrinkles", curly: "extra-curls" };
    for (const layer of [...Object.values(coats), "extra-bald", "extra-dull", "extra-collar"] as const) expect(layers.has(layer), layer).toBe(true);
    for (const e of cats.filter((c) => c.id.includes("-extra/"))) {
      // Накладка — у полотні своєї частини.
      const part = artEntry(e.id.replace(/-extra\//, "/"));
      expect(part, e.id).toBeDefined();
      expect({ size: e.size, pivot: e.pivot }, e.id).toEqual({ size: part?.size, pivot: part?.pivot });
    }
  });
});

describe("маніфест: персонаж", () => {
  const persons = ENTRIES.filter((e) => e.id.startsWith("person/"));
  const count = (key: keyof Look): number => LOOK_OPTIONS.find((o) => o.key === key)?.options.length ?? 0;

  it("кожен варіант форми (Look: обличчя, зачіска, статура) — частина персонажа", () => {
    for (const key of ["face", "hair", "build"] as const) expect(count(key), key).toBeGreaterThan(0);
    for (let i = 0; i < count("face"); i++) entry(`person/head/${i}`);
    for (let i = 0; i < count("hair"); i++) for (const id of [`person/hair-back/${i}`, `person/hair-front/${i}`]) entry(id);
    for (let i = 0; i < count("build"); i++) for (const id of [`person/torso/${i}`, `person/torso-extra/${i}`]) entry(id);
    expect(artEntry(`person/head/${count("face")}`)).toBeUndefined();
    for (const id of ["person/eyes", "person/arm", "person/leg", "person/shoe", "person/leg-extra"]) entry(id);
    expect(states("person/eyes")).toEqual(["open", "half", "closed"]);
  });

  it("кожен колір вигляду (Look) — шар заливки, який фарбує компонувальник; плями на одязі — накладка", () => {
    const fills: Record<Exclude<keyof Look, "face" | "hair" | "build">, ArtLayer> = {
      skin: "fill-skin",
      hairColor: "fill-hair",
      eyes: "fill-iris",
      top: "fill-top",
      bottom: "fill-bottom",
      shoes: "fill-shoes",
    };
    const layers = new Set(persons.flatMap((e) => e.layers ?? []));
    for (const [key, layer] of Object.entries(fills)) {
      expect(count(key as keyof Look), key).toBeGreaterThan(0);
      expect(layers.has(layer), `${key}: ${layer}`).toBe(true);
    }
    expect(layers.has("extra-stain")).toBe(true);
  });
});

describe("маніфест: іконки й гліфи", () => {
  it("кожна IconName — icon/<назва>, квадратна, з pivot у центрі", () => {
    for (const name of ICON_NAMES) {
      const e = entry(`icon/${name}`);
      expect(e.size.w, name).toBe(e.size.h);
      expect(e.pivot, name).toEqual({ x: e.size.w / 2, y: e.size.h / 2 });
    }
  });

  it("кожна позначка (Mark) і обидва фони бульбашок (BubbleKind)", () => {
    const marks: Record<Mark, true> = { no: true, ask: true, ok: true };
    for (const mark of keys(marks)) entry(`icon/mark/${mark}`);
    const bubbles: Record<BubbleKind, true> = { say: true, think: true };
    for (const kind of keys(bubbles)) expect(entry(`ui/bubble/${kind}`).points?.["icon"], kind).toBeDefined();
  });

  it("кожен гліф DOM (src/ui/glyphs.ts) і «❓» з карток — ui/glyph/<назва>", () => {
    const ui = import.meta.glob<string>("../src/ui/*.ts", { query: "?raw", import: "default", eager: true });
    const glyphs = Object.entries(ui).find(([file]) => file.endsWith("/glyphs.ts"))?.[1] ?? "";
    const table = glyphs.slice(glyphs.indexOf("const GLYPHS"), glyphs.indexOf("};", glyphs.indexOf("const GLYPHS")));
    const symbols = [...table.matchAll(/^\s*"([^"]+)":\s*`/gm)].map((m) => m[1] ?? "");
    expect(symbols.length).toBeGreaterThan(0);
    if (Object.values(ui).some((source) => source.includes("❓"))) symbols.push("❓");
    for (const symbol of symbols) {
      const name = GLYPH_ART[symbol];
      expect(name, symbol).toBeDefined();
      entry(`ui/glyph/${name}`);
    }
    expect(Object.keys(GLYPH_ART).sort()).toEqual([...new Set(symbols)].sort());
  });
});
