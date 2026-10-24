import { describe, expect, it } from "vitest";

import { actionSpeed } from "../src/sim/body";
import { advance, goToSleep, newGame } from "../src/sim/game";
import { fallIllPerson } from "../src/sim/illness";
import {
  canGoToSleep,
  collapseMinute,
  isDrowsy,
  sleepSpeedAfter,
  wakeMinute,
} from "../src/sim/sleep";
import type { Sex } from "../src/sim/types";
import { hours } from "./helpers";

const game = (sex: Sex) => newGame({ sex, difficulty: "normal", seed: 1 });

describe("вікна сну (§8.8)", () => {
  const cases = [
    { sex: "female", wake: 6, bedtime: 20, drowsy: 22, collapse: 24 },
    { sex: "male", wake: 8, bedtime: 22, drowsy: 24, collapse: 26 },
  ] as const;

  for (const { sex, wake, bedtime, drowsy, collapse } of cases) {
    describe(sex === "female" ? "жайворонок" : "сова", () => {
      it(`прокидається о ${wake}:00`, () => {
        const save = game(sex);
        expect(wakeMinute(save.current)).toBe(hours(wake));
        expect(save.current.minute).toBe(hours(wake));
      });

      it(`може лягти з ${bedtime}:00`, () => {
        const { current } = game(sex);
        current.minute = hours(bedtime) - 1;
        expect(canGoToSleep(current)).toBe(false);
        current.minute = hours(bedtime);
        expect(canGoToSleep(current)).toBe(true);
      });

      it(`відчуває «Сонливість» після ${drowsy % 24}:00`, () => {
        const { current } = game(sex);
        current.minute = hours(drowsy);
        expect(isDrowsy(current)).toBe(false);
        current.minute = hours(drowsy) + 1;
        expect(isDrowsy(current)).toBe(true);
      });

      it(`падає без сил о ${String(collapse % 24).padStart(2, "0")}:00 і спить 6 годин`, () => {
        const save = game(sex);
        expect(collapseMinute(save.current)).toBe(hours(collapse));
        save.current.minute = hours(collapse - 1);
        const report = advance(save, hours(3));
        expect(report?.collapsed).toBe(true);
        expect(report?.sleptHours).toBe(6);
        expect(save.current.day).toBe(1);
        expect(save.current.minute).toBe(hours(wake));
        expect(save.current.character.sleepSpeed).toBeCloseTo(-0.1);
      });
    });
  }
});

describe("ефекти сну (§8.8)", () => {
  it("кожна година понад чи менше 8 — ±5%, але не більше +10%", () => {
    expect(sleepSpeedAfter(10)).toBeCloseTo(0.1);
    expect(sleepSpeedAfter(9)).toBeCloseTo(0.05);
    expect(sleepSpeedAfter(8)).toBe(0);
    expect(sleepSpeedAfter(7)).toBeCloseTo(-0.05);
    expect(sleepSpeedAfter(6)).toBeCloseTo(-0.1);
    expect(sleepSpeedAfter(5)).toBeCloseTo(-0.15);
    expect(sleepSpeedAfter(7.5)).toBeCloseTo(-0.025);
    expect(sleepSpeedAfter(11)).toBeCloseTo(0.1);
  });

  for (const [bedtime, speed] of [
    [20, 0.1],
    [21, 0.05],
    [22, 0],
    [23, -0.05],
  ] as const) {
    it(`лягти о ${bedtime}:00 — швидкість наступного дня ${speed * 100}%`, () => {
      const save = game("female");
      save.current.minute = hours(bedtime);
      const report = goToSleep(save);
      expect(report?.collapsed).toBe(false);
      // Жайворонок прокидається о 06:00, тобто о 30:00 від початку дня.
      expect(report?.sleptHours).toBe(30 - bedtime);
      expect(save.current.character.sleepSpeed).toBeCloseTo(speed);
    });
  }

  it("лягти зарано не можна", () => {
    const save = game("female");
    save.current.minute = hours(19);
    expect(() => goToSleep(save)).toThrow();
  });

  it("недосип і «Сонливість» множаться", () => {
    const { current } = game("female");
    current.character.sleepSpeed = -0.1;
    current.minute = hours(12);
    expect(actionSpeed(current)).toBeCloseTo(0.9);
    current.minute = hours(23);
    expect(actionSpeed(current)).toBeCloseTo(0.72);
  });
});

describe("страва в руках на ніч (§8.7)", () => {
  it("лягає на вільну поверхню кухні, а не зникає", () => {
    const save = game("female");
    const state = save.current;
    state.character.held = { kind: "meal", quality: "cheap" };
    state.minute = hours(22);
    goToSleep(save);
    expect(Object.values(state.home.surfaces).filter((i) => i?.kind === "meal")).toHaveLength(1);
  });
});

describe("показники уві сні (§8.8)", () => {
  it("голод і гігієна падають учетверо повільніше, здоров'я відновлюється, глузд не змінюється", () => {
    const save = game("female");
    const { stats } = save.current.character;
    Object.assign(stats, { health: 50, satiety: 50, hygiene: 50, sanity: 50 });
    save.current.minute = hours(22);
    goToSleep(save);
    expect(stats.satiety).toBeCloseTo(50 - (4 * 8) / 4);
    expect(stats.hygiene).toBeCloseTo(50 - (3 * 8) / 4);
    expect(stats.health).toBeCloseTo(58);
    expect(stats.sanity).toBe(50);
  });

  it("сон відновлює здоров'я, лише якщо персонаж ліг ситим і не хворий", () => {
    for (const [satiety, ill, health] of [[24, false, 50], [50, true, 50], [25, false, 58]] as const) {
      const save = game("female");
      const { stats } = save.current.character;
      Object.assign(stats, { health: 50, satiety });
      if (ill) fallIllPerson(save.current, "injury");
      save.current.minute = hours(22);
      goToSleep(save);
      // Травма шкодить і сама: −3 за ніч.
      expect(stats.health).toBeCloseTo(ill ? health - 3 : health);
    }
  });

  it("за кожну годину сну менше 8 здоров'я −2", () => {
    const save = game("female");
    const { stats } = save.current.character;
    stats.health = 50;
    // Жайворонок падає без сил о 24:00 і спить 6 годин: +6 за сон, −4 за недосип.
    save.current.minute = hours(24);
    goToSleep(save);
    expect(stats.health).toBeCloseTo(52);
  });

  it("чоловічий персонаж голоднішає на 10% швидше й уві сні", () => {
    const save = game("male");
    const { stats } = save.current.character;
    stats.satiety = 50;
    save.current.minute = hours(24);
    goToSleep(save);
    expect(stats.satiety).toBeCloseTo(50 - (4 * 1.1 * 8) / 4);
  });

  it("показники не опускаються нижче 5 і межа їх не піднімає", () => {
    const save = game("female");
    const { stats } = save.current.character;
    stats.satiety = 6;
    stats.hygiene = 3;
    save.current.minute = hours(22);
    goToSleep(save);
    expect(stats.satiety).toBe(5);
    expect(stats.hygiene).toBe(3);
    expect(save.current.end).toBeNull();
  });
});
