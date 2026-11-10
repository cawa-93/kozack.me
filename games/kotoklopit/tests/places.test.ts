// Клітинки для речей (§8.7): де річ може стояти, що лишається вільним і межа кожного виду, куди б речі не переставили.

import { describe, expect, it } from "vitest";

import { freeSlots, place, utilitiesDue } from "../src/sim/economy";
import { newGame } from "../src/sim/game";
import { hiddenTile, isWall, LAUNDRY_BASKET, MAP_HEIGHT, MAP_WIDTH, nearestFreePlace, OBJECTS, PLACES, roomAt, slotById, SLOTS, WIRE_TILE } from "../src/sim/home";
import { WALL_HEIGHT, WALL_SEGMENTS } from "../src/view/art/manifest/lib/geometry";
import type { GameState, HomeItem, Vec } from "../src/sim/types";
import { boxCovers, wallsToFade } from "../src/view/iso/geometry";
import { SEATS, seatAt } from "../src/view/iso/personseat";
import { isoItemLook, isoObjectLook } from "../src/view/world/objects";

/** Нижча за всі речі — миска: її закриває перша. */
const BOWL = isoItemLook("bowl");

const tile = (p: Vec): string => `${Math.floor(p.x)},${Math.floor(p.y)}`;

/** Меблі, що стоять завжди: без сховищ і ящиків, які з'являються й можуть стати деінде (§8.7). */
const PERMANENT = OBJECTS.filter((o) => o.requires === undefined && o.kind !== "boxes");
/** Пів ширини плитки ізометрії, одиниці арту. */
const HALF_TILE = 64;

/**
 * Яку частку миски з центром у точці `p` видно з-за меблів: сітка точок по її силуету на екрані (уздовж горизонталі — зсув
 * уздовж x − y, тож глибина та сама; угору — висота), кожна — чи її закриває якась річ.
 */
function visibleShare(p: Vec): number {
  const N = 12;
  let seen = 0;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const s = (((i / N) * 2 - 1) * BOWL.half) / HALF_TILE / 2;
      const at = { x: p.x + s, y: p.y - s };
      const lift = (j / N) * BOWL.height;
      const covered = PERMANENT.some((o) => {
        const look = isoObjectLook(o.id);
        return boxCovers(look.footprint, look.tall, at, { half: 0.5, height: 0.5 }, lift);
      });
      if (!covered) seen++;
    }
  }
  return seen / (N + 1) ** 2;
}
const center = (p: Vec): Vec => ({ x: p.x + 0.5, y: p.y + 0.5 });
const placeTiles = new Set(PLACES.map(tile));

function game(): GameState {
  const { current } = newGame({ address: "she", difficulty: "normal", seed: 8 });
  current.modifiers.day = null;
  current.modifiers.week = null;
  return current;
}

/** Поставити нову річ виду `kind`, як із пакунка. */
function deliver(state: GameState, kind: Exclude<HomeItem["kind"], "toy">): HomeItem {
  const item = place(state, kind, "cheap");
  if (!item) throw new Error(`Немає місця для «${kind}»`);
  state.home.items.push(item);
  return item;
}

describe("клітинки для речей (§8.7)", () => {
  it("на клітинці рівно одне місце, і кожне місце знаходиться за id", () => {
    expect(placeTiles.size).toBe(PLACES.length);
    for (const place of PLACES) expect(slotById(place.id)).toBe(place);
  });

  it("усі місця магазину — серед клітинок для речей", () => {
    for (const slot of SLOTS) expect(placeTiles.has(tile(slot)), slot.id).toBe(true);
  });

  it("немає стін, проходів і меблів; під підвіконням і на місці сховища чи ящиків, яких ще немає, — можна", () => {
    for (const place of PLACES) {
      expect(isWall(place.x, place.y), place.id).toBe(false);
      expect(roomAt(center(place)), place.id).not.toBeNull();
      const object = OBJECTS.find((o) => place.x >= o.x && place.x < o.x + o.w && place.y >= o.y && place.y < o.y + o.h);
      expect(object === undefined || object.kind === "windowsill" || object.kind === "boxes" || object.requires !== undefined, `${place.id}: ${object?.id}`).toBe(true);
    }
    // Під вікнами вітальні й спальні, у кутку вітальні на місці бака корму для стерилізованих, місця аптечки й мішка наповнювача;
    // праворуч від входу до спальні під ближньою стіною (першу з двох клітинок частково закриває монітор — автор це допускає).
    for (const id of ["floor-1-8", "floor-4-1", "floor-18-6", "floor-13-6", "floor-5-6", "floor-5-4", "floor-6-4"]) expect(placeTiles.has(id.replace("floor-", "").replace("-", ",")), id).toBe(true);
  });

  // Речі гри (переноска, ящики, сховища, велика коробка, база робота) займають клітинку, лише поки стоять на ній
  // (`tests/gamethings.test.ts`).
  it("немає кошика, дроту й стільців, засунутих чи висунутих", () => {
    const seats = SEATS.flatMap((seat) => [seatAt(seat, "tucked"), seatAt(seat, "pulled")].map((p) => ({ x: p.x, y: p.y })));
    for (const p of [LAUNDRY_BASKET, WIRE_TILE, ...seats]) expect(placeTiles.has(tile(p)), tile(p)).toBe(false);
  });

  // Гравець бачить порожню клітинку — може поставити туди річ (§8.7): і за диваном, шафою, столом чи комп'ютером, якщо її хоч
  // частково видно, і там, куди гра потім ставить свої речі чи де кіт щось робить сам.
  it("клітинки, які видно порожніми, — для речей", () => {
    const open = {
      "переноска": [8, 9],
      "велика коробка й звідки її дерти": [11, 8, 12, 8],
      "ящики біля входу": [12, 9],
      "за диваном": [13, 9, 14, 9, 15, 9],
      "біля дверей": [9, 10, 10, 10, 11, 10, 12, 10],
      "за шафою": [5, 1],
      "за кухонним столом, з краю": [14, 2],
      "перед смітником": [18, 2],
      "за комп'ютером у спальні": [4, 4],
      "прохолодна плитка": [9, 2],
      "засідка біля ліжка": [1, 3],
    };
    for (const [what, xy] of Object.entries(open)) {
      for (let i = 0; i < xy.length; i += 2) expect(placeTiles.has(`${xy[i]},${xy[i + 1]}`), `${what}: ${xy[i]},${xy[i + 1]}`).toBe(true);
    }
    // Цілком за кухонним столом річ не видно.
    expect(placeTiles.has("13,2")).toBe(false);
  });

  // Меблі можуть закривати річ частково (за диваном видно верх миски, за монітором — край), але не цілком. Речі гри
  // (сховища, ящики) зсуваються з зайнятого місця, тож тут — лише меблі, що стоять завжди.
  it("річ на будь-якій клітинці меблі не закривають цілком", () => {
    for (const place of PLACES) expect(visibleShare(center(place)), place.id).toBeGreaterThan(0);
  });

  // І навпаки: клітинку кімнати, де миску видно хоч на третину, гравець бачить порожньою — туди можна поставити річ, якщо там
  // немає меблів, кошика, дроту чи стільця.
  it("кожна клітинка кімнати, яку видно, — для речей, крім меблів, кошика, дроту й стільців", () => {
    const seats = new Set(SEATS.flatMap((seat) => [seatAt(seat, "tucked"), seatAt(seat, "pulled")].map(tile)));
    // Висунутий стілець за комп'ютером стоїть на межі двох клітинок (x = 7,0): займає обидві.
    seats.add("6,7");
    const taken = new Set([tile(LAUNDRY_BASKET), tile(WIRE_TILE), ...seats]);
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (isWall(x, y) || roomAt({ x: x + 0.5, y: y + 0.5 }) === null || taken.has(`${x},${y}`)) continue;
        if (PERMANENT.some((o) => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h && o.kind !== "windowsill")) continue;
        if (visibleShare({ x: x + 0.5, y: y + 0.5 }) < 1 / 3) continue;
        expect(placeTiles.has(`${x},${y}`), `${x},${y}`).toBe(true);
      }
    }
  });

  // Зовнішня передня стіна — низький плінтус: ряд під нижньою лівою стіною вітальні видно, туди ставлять речі (кігтеточку до стіни).
  it("ряд під зовнішньою передньою стіною — для речей, і плінтус їх не закриває", () => {
    expect(hiddenTile(3, MAP_HEIGHT - 2)).toBe(false);
    expect(PLACES.some((p) => p.y === MAP_HEIGHT - 2)).toBe(true);
    for (const place of PLACES) {
      for (const wall of WALL_SEGMENTS.filter((w) => w.kind === "front")) {
        const { x, y, w, h } = wall.rect;
        expect(boxCovers({ x0: x, y0: y, x1: x + w, y1: y + h }, WALL_HEIGHT.front, center(place), BOWL), `${place.id}: ${wall.id}`).toBe(false);
      }
    }
  });

  // Гравці ставлять речі до ближньої стіни в кожній кімнаті, а не лише у вітальні з плінтусом: ряд перед внутрішньою стіною —
  // для речей, і стіна перед річчю згасає.
  it("ряд перед ближньою внутрішньою стіною — для речей у спальні, ванній і кухні, і стіна перед річчю згасає", () => {
    const hidden = PLACES.filter((p) => hiddenTile(p.x, p.y));
    expect([...new Set(hidden.map((p) => roomAt(center(p))))].sort()).toEqual(["bathroom", "bedroom", "kitchen"]);
    const inner = WALL_SEGMENTS.filter((w) => w.kind === "inner");
    const boxes = inner.map(({ rect: { x, y, w, h } }) => ({ x0: x, y0: y, x1: x + w, y1: y + h }));
    for (const place of hidden) {
      const state = game();
      state.home.items = [{ id: 900, kind: "bowl", quality: "cheap", slot: place.id, food: 0, foodQuality: null, sterile: false }];
      const out: boolean[] = [];
      wallsToFade(state, boxes, WALL_HEIGHT.inner, out);
      expect(out.some(Boolean), place.id).toBe(true);
    }
  });

  it("є в кожній кімнаті", () => {
    const rooms = new Set(PLACES.map((p) => roomAt(center(p))));
    expect([...rooms].sort()).toEqual(["bathroom", "bedroom", "kitchen", "living"]);
  });
});

describe("межа виду (§8.7)", () => {
  const moved = (item: HomeItem, id: string): void => {
    if ("slot" in item) item.slot = id;
  };

  it("не залежить від того, куди речі переставили", () => {
    const state = game();
    const limit = SLOTS.filter((s) => s.kind === "house").length;
    expect(freeSlots(state, "house")).toBe(limit);
    moved(deliver(state, "house"), "floor-3-8");
    expect(freeSlots(state, "house")).toBe(limit - 1);
  });

  it("річ на чужому місці не лишає нову без місця: та стає на вільне місце свого виду", () => {
    const state = game();
    const first = SLOTS.find((s) => s.kind === "house");
    const litter = deliver(state, "litter");
    moved(litter, first?.id ?? "");
    const house = deliver(state, "house");
    expect("slot" in house && house.slot).not.toBe(first?.id);
    expect(SLOTS.some((s) => "slot" in house && s.id === house.slot)).toBe(true);
  });

  it("усі місця виду зайняті чужими речами — нова стає на найближчу вільну клітинку", () => {
    const state = game();
    const own = SLOTS.filter((s) => s.kind === "scratcher");
    for (const slot of own) moved(deliver(state, "house"), slot.id);
    const post = deliver(state, "scratcher");
    expect("slot" in post && post.slot.startsWith("floor-")).toBe(true);
  });

  it("комунальні не залежать від місця речі", () => {
    const state = game();
    const house = deliver(state, "house");
    const before = utilitiesDue(state);
    moved(house, "floor-3-8");
    expect(utilitiesDue(state)).toBe(before);
  });
});

describe("пошук вільної клітинки (§8.7)", () => {
  const at = { x: 3.5, y: 8.5 };

  it("бере найближчу, а зайняту обминає", () => {
    const state = game();
    expect(nearestFreePlace(state, at)?.id).toBe("floor-3-8");
    deliver(state, "house");
    const item = state.home.items[0];
    if (item && "slot" in item) item.slot = "floor-3-8";
    expect(nearestFreePlace(state, at)?.id).not.toBe("floor-3-8");
  });

  it("обминає безлад, іграшку на підлозі, віник і автогодівницю без миски, а під диваном іграшка не заважає", () => {
    const blockers: ((state: GameState) => void)[] = [
      (s) => s.home.messes.push({ id: 1, kind: "litter", x: 3.2, y: 8.7, cat: null }),
      (s) => s.home.items.push({ id: 1, kind: "toy", quality: "cheap", x: 3.2, y: 8.7, uses: 0 }),
      (s) => {
        s.home.vacuumAt = { x: 3.2, y: 8.7 };
      },
      (s) => (s.home.feeders ??= []).push({ slot: "floor-3-8", quality: "cheap", food: 0, foodQuality: null, sterile: false }),
    ];
    for (const block of blockers) {
      const state = game();
      block(state);
      expect(nearestFreePlace(state, at)?.id).not.toBe("floor-3-8");
    }
    const state = game();
    state.home.items.push({ id: 1, kind: "toy", quality: "cheap", x: 3.2, y: 8.7, uses: 0, hidden: "sofa" });
    expect(nearestFreePlace(state, at)?.id).toBe("floor-3-8");
  });
});
