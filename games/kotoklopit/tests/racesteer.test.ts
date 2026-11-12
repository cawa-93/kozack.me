// Перестроювання в гонці (§8.5, §10): одне натискання ←/A чи →/D — одне перестроювання, як одне відхилення джойстика. Затиснута
// клавіша дає автоповтор `keydown` (`event.repeat`), і він машину більше не перестроює. Без Phaser.

import { describe, expect, it } from "vitest";

import { LaneSteer } from "../src/view/racesteer";

describe("перестроювання в гонці (§8.5)", () => {
  it("натискання — одне перестроювання, яке кадр забирає раз", () => {
    const steer = new LaneSteer();
    expect(steer.take()).toBe(0);
    steer.key(-1, false);
    expect(steer.take()).toBe(-1);
    expect(steer.take()).toBe(0);
  });

  it("затиснута клавіша: автоповтор не перестроює ще раз", () => {
    const steer = new LaneSteer();
    steer.key(1, false);
    const frames = [steer.take()];
    for (let i = 0; i < 10; i++) {
      steer.key(1, true);
      frames.push(steer.take());
    }
    expect(frames.filter((dir) => dir !== 0)).toEqual([1]);
    // Відпустили й натиснули знову — нове перестроювання.
    steer.key(1, false);
    expect(steer.take()).toBe(1);
  });

  it("джойстик убік — перестроювання; скинуте керування нічого не лишає наступній гонці", () => {
    const steer = new LaneSteer();
    steer.push(1);
    expect(steer.take()).toBe(1);
    steer.key(-1, false);
    steer.clear();
    expect(steer.take()).toBe(0);
  });
});
