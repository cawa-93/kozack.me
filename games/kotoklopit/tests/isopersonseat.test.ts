// Стільці нового вигляду (крок 16, хвиля 3, «Стики персонажа»; `src/view/iso/personseat.ts`): де стоїть стілець до стола з
// комп'ютером і кухонного стола — засунутий чи висунутий під того, хто сідає; і як його шматки (сидіння, спинка)
// стають у порядку глибини проти того, хто сидить і хто йде вздовж стола.

import { describe, expect, it } from "vitest";

import { BODY_RADIUS } from "../src/sim/config";
import { newGame } from "../src/sim/game";
import { isSolid, MAP, objectById, OBJECTS } from "../src/sim/home";
import type { GameState } from "../src/sim/types";
import { artEntry } from "../src/view/art/manifest";
import { framesOf } from "../src/view/art/types";
import {
  SEAT_AT_EDGE,
  SEAT_DEPTH,
  SEAT_GLIDE_RATE,
  SEAT_TUCK_GAP,
  seatAt,
  seatEdge,
  seatMode,
  SEATS,
  seatSpot,
  seatTuck,
  type Seat,
  type SeatSpot,
} from "../src/view/iso/personseat";
import { GLIDE_RATE, glideOffset, wireFixSpot } from "../src/view/iso/personspot";
import { PERSON_SEAT } from "../src/view/rig/anims/person/chores";
import { isoOrder, type IsoPoint } from "../src/view/world/isoorder";
import { isoObjectLook } from "../src/view/world/objects";

function state(): GameState {
  return newGame({ address: "she", difficulty: "normal", seed: 3 }).current;
}

const seat = (id: string): Seat => SEATS.find((s) => s.id === id)!;
const desk = seat("chair-desk");
const kitchen = seat("chair-kitchen");

/** Шматок стільця в реєстрі глибини (`seatSpot`). */
const spotOf = (chair: Seat, center: { x: number; y: number }, part: "seat" | "backrest", sitting = false): SeatSpot =>
  seatSpot(chair, center, part, { x: 0, y: 0, box: null, under: false, above: false }, sitting);

/** Півширина стільця на екрані (`CHAIR_HALF` в `iso/apartment.ts`), одиниці арту. */
const CHAIR_HALF = 44;

/**
 * Порядок малювання стола (коробка 0), шматків стільця з центром `center` (точки 1 — сидіння, 2 — спинка) і точок `others`
 * (3, 4…; на підлозі чи на столі — `on: 0`): так, як їх ставить квартира (`seatSpot` → `place` / `placeUnder`).
 */
function orderWithTable(chair: Seat, center: { x: number; y: number }, others: readonly IsoPoint[]): number[] {
  const piece = (part: "seat" | "backrest"): IsoPoint => {
    const spot = spotOf(chair, center, part);
    return { x: spot.x, y: spot.y, half: CHAIR_HALF, ...(spot.box === null ? {} : { on: 0, under: spot.under }) };
  };
  return [...isoOrder([isoObjectLook(chair.object).footprint], [piece("seat"), piece("backrest"), ...others])];
}

describe("стільці: де стоять", () => {
  it("кожен стілець — біля стола, за яким сидять (`use` з позою sit), і має кадр із двома шматками", () => {
    expect(SEATS.map((s) => s.object).sort()).toEqual(["computer", "table"]);
    for (const s of SEATS) {
      const use = isoObjectLook(s.object).use;
      expect(use?.pose, s.id).toBe("sit");
      const entry = artEntry(s.art);
      expect(entry, s.art).toBeDefined();
      expect(framesOf(entry!).map((f) => f.state).sort()).toEqual(["backrest", "seat"]);
    }
  });

  it("за столом ніхто не сидить — стілець засунутий до стола; працює — крісло висунуте під того, хто сидить", () => {
    const s = state();
    for (const chair of SEATS) expect(seatMode(s, chair), chair.id).toBe("tucked");
    s.character.activity = { kind: "work", minutes: 0, money: 0, reputation: 0, sanity: 0 };
    expect(seatMode(s, desk)).toBe("pulled");
    expect(seatMode(s, kitchen)).toBe("tucked");
    // Висунутий — центр сидіння там, де сидять (`use.at`); засунутий — на `seatTuck` ближче до стола.
    const use = isoObjectLook("computer").use!;
    expect(seatAt(desk, "pulled")).toEqual(use.at);
    const tucked = seatAt(desk, "tucked");
    expect(tucked.x).toBeCloseTo(use.at.x + use.facing.x * seatTuck(desk));
    expect(tucked.y).toBeCloseTo(use.at.y + use.facing.y * seatTuck(desk));
    // У поїздці — засунутий.
    s.trip = { destination: "vet", minutes: 0 } as never;
    expect(seatMode(s, desk)).toBe("tucked");
  });

  it("їсть за кухонним столом — стілець висунутий; лагодить дріт (на підлозі біля обриву) — крісло засунуте", () => {
    const s = state();
    s.character.activity = { kind: "use", target: "table", progress: 0 };
    expect(seatMode(s, kitchen)).toBe("pulled");
    expect(seatMode(s, desk)).toBe("tucked");
    s.character.activity = { kind: "use", target: "computer", progress: 0 };
    expect(seatMode(s, desk)).toBe("tucked");
    // Засунуте крісло не там, де сидить той, хто лагодить дріт.
    const fix = wireFixSpot().at;
    const tucked = seatAt(desk, "tucked");
    expect(Math.hypot(tucked.x - fix.x, tucked.y - fix.y)).toBeGreaterThan(0.8);
  });

  it("стільці стоять на підлозі кімнати, не на стінах і не на інших речах (сим про них не знає)", () => {
    const s = state();
    for (const chair of SEATS) {
      for (const mode of ["tucked", "pulled"] as const) {
        const at = seatAt(chair, mode);
        // Ні центр, ні кути сидіння (≈ 0,21 клітинки) — не в стіні.
        for (const [dx, dy] of [[0, 0], [-0.21, -0.2], [0.21, -0.2], [0.21, 0.2], [-0.21, 0.2]] as const) {
          const x = Math.floor(at.x + dx);
          const y = Math.floor(at.y + dy);
          expect(MAP[y]?.[x], `${chair.id} ${mode} (${x}, ${y})`).not.toBe("#");
        }
        // Інших речей квартири під стільцем немає (свій стіл — засунутий стілець лише трохи під стільницею).
        for (const o of OBJECTS) {
          if (o.id === chair.object || o.kind === "boxes") continue;
          const inside = at.x > o.x - 0.15 && at.x < o.x + o.w + 0.15 && at.y > o.y - 0.15 && at.y < o.y + o.h + 0.15;
          expect(inside, `${chair.id} ${mode} на «${o.id}»`).toBe(false);
        }
        // Засунутий — під своїм столом (його клітинка тверда), решта — на вільній підлозі.
        const table = objectById(chair.object);
        const tx = Math.floor(at.x);
        const ty = Math.floor(at.y);
        const own = tx >= table.x && tx < table.x + table.w && ty >= table.y && ty < table.y + table.h;
        expect(own, `${chair.id} ${mode}`).toBe(mode === "tucked");
        if (!own) expect(isSolid(s, tx, ty), `${chair.id} ${mode}`).toBe(false);
      }
    }
  });

  it("засунутий — під стільницею, спинка впритул до краю стола: у смугу, якою ходять уздовж стола, стілець не заходить", () => {
    for (const chair of SEATS) {
      const use = isoObjectLook(chair.object).use!;
      const f = isoObjectLook(chair.object).footprint;
      // Обидва столи — обличчям до камери (край — y1): решта перевірки рахує вздовж y.
      expect(use.facing, chair.id).toEqual({ x: 0, y: -1 });
      const edge = f.y1;
      expect(seatEdge(chair), chair.id).toBeCloseTo(use.at.y - edge);
      const tucked = seatAt(chair, "tucked");
      // Спинка — перед краєм (вона вища за стільницю), на `SEAT_TUCK_GAP` від нього.
      expect(tucked.y + chair.back - edge, chair.id).toBeCloseTo(SEAT_TUCK_GAP);
      // Ні спинка, ні сидіння (0,4 клітинки завглибшки) — не далі за край + 0,1, а тіло персонажа, що йде вздовж стола, — не
      // ближче за `BODY_RADIUS` від краю: між ними щонайменше 0,2 клітинки.
      const far = tucked.y + Math.max(chair.back, 0.2);
      expect(far, chair.id).toBeLessThanOrEqual(edge + 0.1);
      expect(edge + BODY_RADIUS - far, chair.id).toBeGreaterThanOrEqual(0.2);
      // Сидіння — під стільницею, посередині стола: не в його ніжках.
      expect(tucked.y, chair.id).toBeLessThan(edge);
      expect(tucked.x - 0.25, chair.id).toBeGreaterThan(f.x0 + 0.2);
      expect(tucked.x + 0.25, chair.id).toBeLessThan(f.x1 - 0.2);
    }
  });
});

describe("стільці: глибина проти того, хто сидить", () => {
  it("той, хто сидить (точка в `use.at`), — перед сидінням і за спинкою; хто стоїть позаду стільця — перед обома", () => {
    for (const chair of SEATS) {
      const use = isoObjectLook(chair.object).use!;
      const center = seatAt(chair, "pulled");
      // Висунутий стілець — на підлозі, як будь-яка річ.
      for (const part of ["seat", "backrest"] as const) expect(spotOf(chair, center, part).box, chair.id).toBeNull();
      // 0 — стіл, 1 — сидіння, 2 — спинка, 3 — той, хто сидить.
      const sitting = orderWithTable(chair, center, [use.at]);
      expect(sitting.indexOf(1), chair.id).toBeLessThan(sitting.indexOf(3));
      expect(sitting.indexOf(3), chair.id).toBeLessThan(sitting.indexOf(2));
      // Стоїть за засунутим стільцем (ближче до камери) — перед обома шматками.
      const tucked = seatAt(chair, "tucked");
      const behind = { x: use.at.x - use.facing.x * 0.3, y: use.at.y - use.facing.y * 0.3 };
      expect(orderWithTable(chair, tucked, [behind]).indexOf(3), chair.id).toBe(3);
    }
    expect(SEAT_DEPTH.seat).toBeLessThan(0);
    expect(SEAT_DEPTH.backrest).toBeGreaterThan(0);
  });

  it("засунутий стілець — частина стола: сидіння під його коробкою, спинка — на ній", () => {
    expect(SEAT_AT_EDGE).toBeGreaterThan(SEAT_TUCK_GAP);
    expect(SEAT_AT_EDGE).toBeLessThan(BODY_RADIUS);
    for (const chair of SEATS) {
      const tucked = seatAt(chair, "tucked");
      expect(spotOf(chair, tucked, "seat"), chair.id).toMatchObject({ box: chair.object, under: true });
      expect(spotOf(chair, tucked, "backrest"), chair.id).toMatchObject({ box: chair.object, under: false });
    }
  });

  it("хто йде вздовж стола, — перед засунутим стільцем, хоч би де був ліворуч чи праворуч; кіт на стільниці — за спинкою", () => {
    for (const chair of SEATS) {
      const f = isoObjectLook(chair.object).footprint;
      const tucked = seatAt(chair, "tucked");
      for (let dx = -1.6; dx <= 1.6; dx += 0.05) {
        // Персонаж (тіло на `BODY_RADIUS` від краю) і кіт (ближче до краю).
        for (const y of [f.y1 + BODY_RADIUS, f.y1 + 0.15]) {
          const order = orderWithTable(chair, tucked, [{ x: tucked.x + dx, y }]);
          expect(order.indexOf(3), `${chair.id} dx ${dx.toFixed(2)} y ${y}`).toBe(3);
        }
      }
      // Кіт на стільниці — за спинкою (вона стоїть перед краєм стола); стільниця — над сидінням і під спинкою.
      const onTable = orderWithTable(chair, tucked, [{ x: tucked.x, y: f.y1 - 0.4, on: 0 }]);
      expect(onTable.indexOf(3), chair.id).toBeLessThan(onTable.indexOf(2));
      expect(onTable.indexOf(1), chair.id).toBeLessThan(onTable.indexOf(0));
      expect(onTable.indexOf(0), chair.id).toBeLessThan(onTable.indexOf(2));
    }
  });

  it("стілець виїжджає з-під стола: сидіння — за тим, хто сідає, спинка — перед ним, лише коли вже ближча до камери", () => {
    for (const chair of SEATS) {
      const use = isoObjectLook(chair.object).use!;
      const from = seatAt(chair, "tucked");
      const to = seatAt(chair, "pulled");
      for (let t = 0; t <= 1.0001; t += 0.02) {
        const center = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
        const order = orderWithTable(chair, center, [use.at]);
        expect(order.indexOf(1), `${chair.id} t ${t.toFixed(2)}`).toBeLessThan(order.indexOf(3));
        // Спинка на столі чи на підлозі ближче до стола за того, хто сідає, — за ним; далі — перед ним.
        const back = spotOf(chair, center, "backrest");
        const ahead = back.box === null && back.x + back.y > use.at.x + use.at.y;
        expect(order.indexOf(2) > order.indexOf(3), `${chair.id} t ${t.toFixed(2)}`).toBe(ahead);
        // Сидячи — та сама межа: спинка, не ближча до стола за місце, де сидять, — просто над тим, хто сидить.
        const sitting = spotOf(chair, center, "backrest", true);
        const past = (center.x - use.at.x) * use.facing.x + (center.y - use.at.y) * use.facing.y <= SEAT_DEPTH.backrest + 1e-9;
        expect(sitting.above, `${chair.id} t ${t.toFixed(2)}`).toBe(past);
        // Ще не над ним — і в порядку за місцем, де сидять (спинка ніколи не опиняється за тим, хто вже сидить).
        if (!sitting.above) expect(ahead, `${chair.id} t ${t.toFixed(2)}`).toBe(false);
        // Сидіння й стілець, на якому не сидять, — ніколи не над персонажем.
        expect(spotOf(chair, center, "seat", true).above).toBe(false);
        expect(back.above).toBe(false);
      }
    }
  });

  it("сідає: стілець — під ним за ≈ 0,1 с, удвічі швидше, ніж він переходить на місце; спинка відтоді — над ним до кінця", () => {
    expect(SEAT_GLIDE_RATE).toBeGreaterThanOrEqual(2 * GLIDE_RATE);
    for (const chair of SEATS) {
      const use = isoObjectLook(chair.object).use!;
      const from = seatAt(chair, "tucked");
      const center = { ...from };
      const target = seatAt(chair, "pulled");
      const path = Math.hypot(target.x - from.x, target.y - from.y);
      let above = false;
      for (let frame = 1; frame <= 60; frame++) {
        glideOffset(center, target, 1 / 60, center, SEAT_GLIDE_RATE);
        const spot = spotOf(chair, center, "backrest", true);
        // Спинка, що вже над тим, хто сидить, — над ним і далі (не стрибає за нього й назад).
        if (above) expect(spot.above, `${chair.id} кадр ${frame}`).toBe(true);
        above = spot.above;
        // За 6 кадрів (0,1 с) — далі за 90 % шляху; спинка тоді вже над тим, хто сидить.
        if (frame === 6) {
          expect(Math.hypot(target.x - center.x, target.y - center.y), chair.id).toBeLessThan(path * 0.1);
          expect(spot.above, chair.id).toBe(true);
        }
      }
      expect(Math.hypot(center.x - use.at.x, center.y - use.at.y)).toBeLessThan(1e-3);
    }
  });

  it("персонаж устав — стілець засувають, і спинка знову за своєю точкою (не над ним)", () => {
    for (const chair of SEATS) {
      const center = seatAt(chair, "pulled");
      expect(spotOf(chair, center, "backrest", true).above, chair.id).toBe(true);
      expect(spotOf(chair, center, "backrest", false).above, chair.id).toBe(false);
    }
  });

  it("верх сидіння на малюнку — на висоті, де таз того, хто сидить (`PERSON_SEAT` 34, сидіння до 35)", () => {
    for (const chair of SEATS) {
      const entry = artEntry(chair.art)!;
      const top = entry.points?.["seat"];
      expect(top, chair.id).toBeDefined();
      // Точка сидіння — прямо над pivot, на висоті верху сидіння.
      expect(top!.x).toBeCloseTo(entry.pivot.x, 0);
      const height = entry.pivot.y - top!.y;
      expect(height).toBeGreaterThanOrEqual(PERSON_SEAT);
      expect(height).toBeLessThanOrEqual(PERSON_SEAT + 2);
    }
  });
});
