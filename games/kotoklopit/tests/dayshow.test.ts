// Що з дня малювати цього кадру (§2.1 «Малювання й завантаження», §8.5 «На місці — кадр парковки»): під непрозорою карткою
// (`Overlay.covers`) і на місці (під карткою пункту — кадр парковки) день схований зовсім, під повною темрявою дня (засинання,
// аварія, виїзд) — лише квартира: темрява сама в сцені дня. Квартиру, яку не малювали, перший кадр показує одразу на місці:
// згладжування доганяють за `REVEAL_SECONDS`. Без Phaser.

import { describe, expect, it } from "vitest";

import { dayShow, REVEAL_SECONDS } from "../src/view/dayshow";
import { catchUp, crowdShift, CROWD_EASE_MS, nextGait } from "../src/view/iso/catplay";
import { nextPace } from "../src/view/iso/personlook";
import { glideOffset } from "../src/view/iso/personspot";

describe("що з дня малювати (§2.1)", () => {
  it("гра відкрита — і сцена, і квартира", () => {
    expect(dayShow({ away: false, covered: false, dark: 0 })).toEqual({ scene: true, world: true });
    expect(dayShow({ away: false, covered: false, dark: 0.99 })).toEqual({ scene: true, world: true });
  });

  it("непрозора картка чи кадр парковки на місці — день не малюється зовсім", () => {
    expect(dayShow({ away: false, covered: true, dark: 0 })).toEqual({ scene: false, world: false });
    expect(dayShow({ away: true, covered: false, dark: 0 })).toEqual({ scene: false, world: false });
    expect(dayShow({ away: true, covered: true, dark: 1 })).toEqual({ scene: false, world: false });
  });

  it("повна темрява дня — квартиру не малюють, а сама темрява (у сцені дня) лишається", () => {
    expect(dayShow({ away: false, covered: false, dark: 1 })).toEqual({ scene: true, world: false });
  });

  it("перший кадр після схованої квартири — уже на місці: згладжування котів і персонажа доганяють одразу", () => {
    // Кіт перескочив недалеко (менше за `CATCH.max`): за один кадр намальований лишається позаду, за другий — на місці.
    const lag = { x: 0, y: 0 };
    catchUp(lag, { x: 1.5, y: 0.5 }, REVEAL_SECONDS);
    catchUp(lag, null, REVEAL_SECONDS);
    expect(Math.hypot(lag.x, lag.y)).toBe(0);
    // Зсув у юрбі, хода, крок персонажа, стілець — на місці (день оновлює квартиру двічі за той кадр, як і тут).
    const crowd = { crowd: { x: 0, y: 0 } };
    for (let i = 0; i < 2; i++) crowdShift(crowd, { x: 0.4, y: -0.3 }, false, REVEAL_SECONDS, false);
    expect(crowd.crowd.x).toBeCloseTo(0.4, 6);
    expect(crowd.crowd.y).toBeCloseTo(-0.3, 6);
    expect(REVEAL_SECONDS * 1000).toBeGreaterThan(5 * CROWD_EASE_MS);
    const gait = nextGait(nextGait({ x: 0, y: 0, speed: 50 }, 0, 0, REVEAL_SECONDS), 0, 0, REVEAL_SECONDS);
    expect(gait.speed).toBeCloseTo(0, 6);
    const pace = nextPace(nextPace({ x: 10, y: 10, vx: 300, vy: 0, known: true }, 10, 10, REVEAL_SECONDS), 10, 10, REVEAL_SECONDS);
    expect(pace.vx).toBeCloseTo(0, 6);
    expect(glideOffset({ x: 0, y: 0 }, { x: 2, y: 1 }, REVEAL_SECONDS)).toEqual({ x: 2, y: 1 });
  });
});
