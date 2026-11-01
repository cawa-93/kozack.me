// Стільці нового вигляду (крок 16, хвиля 3, «Стики персонажа»; `src/view/iso/personseat.ts`): де стоїть стілець до стола з
// комп'ютером і кухонного стола — засунутий, висунутий під того, хто сідає, чи відкочений; і як його шматки (сидіння, спинка)
// стають у порядку глибини проти того, хто сидить.

import { describe, expect, it } from "vitest";

import { newGame } from "../src/sim/game";
import { isSolid, MAP, objectById, OBJECTS } from "../src/sim/home";
import type { GameState } from "../src/sim/types";
import { artEntry } from "../src/view/art/manifest";
import { framesOf } from "../src/view/art/types";
import { SEAT_DEPTH, SEAT_TUCK, seatAt, seatDepthPoint, seatMode, SEATS, type Seat } from "../src/view/iso/personseat";
import { PERSON_SEAT } from "../src/view/rig/anims/person/chores";
import { isoOrder } from "../src/view/world/isoorder";
import { isoObjectLook } from "../src/view/world/objects";

function state(): GameState {
  return newGame({ address: "she", difficulty: "normal", seed: 3 }).current;
}

const seat = (id: string): Seat => SEATS.find((s) => s.id === id)!;
const desk = seat("chair-desk");
const kitchen = seat("chair-kitchen");

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
    // Висунутий — центр сидіння там, де сидять (`use.at`); засунутий — на `SEAT_TUCK` ближче до стола.
    const use = isoObjectLook("computer").use!;
    expect(seatAt(desk, "pulled")).toEqual(use.at);
    const tucked = seatAt(desk, "tucked");
    expect(tucked.x).toBeCloseTo(use.at.x + use.facing.x * SEAT_TUCK);
    expect(tucked.y).toBeCloseTo(use.at.y + use.facing.y * SEAT_TUCK);
    // У поїздці — засунутий.
    s.trip = { destination: "vet", minutes: 0 } as never;
    expect(seatMode(s, desk)).toBe("tucked");
  });

  it("їсть за кухонним столом — стілець висунутий; лагодить дріт на підлозі під столом — крісло відкочене вбік", () => {
    const s = state();
    s.character.activity = { kind: "use", target: "table", progress: 0 };
    expect(seatMode(s, kitchen)).toBe("pulled");
    expect(seatMode(s, desk)).toBe("tucked");
    s.character.activity = { kind: "use", target: "computer", progress: 0 };
    expect(seatMode(s, desk)).toBe("aside");
    // Відкочене — не там, де сидять на підлозі (`use.at`), а вбік більше ніж на пів клітинки.
    const use = isoObjectLook("computer").use!;
    const aside = seatAt(desk, "aside");
    expect(Math.hypot(aside.x - use.at.x, aside.y - use.at.y)).toBeGreaterThan(0.5);
  });

  it("стільці стоять на підлозі кімнати, не на стінах і не на інших речах (сим про них не знає)", () => {
    const s = state();
    for (const chair of SEATS) {
      for (const mode of ["tucked", "pulled", "aside"] as const) {
        if (mode === "aside" && !chair.aside) continue;
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
        expect(isSolid(s, Math.floor(at.x), Math.floor(at.y)), `${chair.id} ${mode}`).toBe(false);
      }
      // Засунутий — щонайбільше на 0,1 клітинки під стільницею свого стола (сидіння під нею, спинка перед нею).
      const table = objectById(chair.object);
      const tucked = seatAt(chair, "tucked");
      expect(tucked.y - 0.2).toBeGreaterThan(table.y + table.h - 0.1);
    }
  });
});

describe("стільці: глибина проти того, хто сидить", () => {
  it("той, хто сидить (точка в `use.at`), — перед сидінням і за спинкою; хто стоїть позаду стільця — перед обома", () => {
    for (const chair of SEATS) {
      const use = isoObjectLook(chair.object).use!;
      const center = seatAt(chair, "pulled");
      const seatPoint = seatDepthPoint(chair, center, "seat");
      const backPoint = seatDepthPoint(chair, center, "backrest");
      const order = (points: { x: number; y: number }[]): number[] => [...isoOrder([], points)];
      // 0 — сидіння, 1 — спинка, 2 — той, хто сидить.
      const sitting = order([seatPoint, backPoint, use.at]);
      expect(sitting.indexOf(0), chair.id).toBeLessThan(sitting.indexOf(2));
      expect(sitting.indexOf(2), chair.id).toBeLessThan(sitting.indexOf(1));
      // Стоїть за засунутим стільцем (ближче до камери) — перед обома шматками.
      const tucked = seatAt(chair, "tucked");
      const behind = { x: use.at.x - use.facing.x * 0.3, y: use.at.y - use.facing.y * 0.3 };
      const standing = order([seatDepthPoint(chair, tucked, "seat"), seatDepthPoint(chair, tucked, "backrest"), behind]);
      expect(standing.indexOf(2), chair.id).toBe(2);
    }
    expect(SEAT_DEPTH.seat).toBeLessThan(0);
    expect(SEAT_DEPTH.backrest).toBeGreaterThan(0);
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
