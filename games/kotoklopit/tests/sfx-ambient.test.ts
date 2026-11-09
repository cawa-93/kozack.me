// Тло квартири (§11.4а, «Тло»): вулиця з вікон за часом доби й погодою, фестиваль, вечірка, холодильник і ремонт уривками.

import { describe, expect, it } from "vitest";

import { AMBIENT } from "../src/audio/config";
import { AmbientLoops, streetSound } from "../src/audio/sfx/ambient/loops";
import { Repairs } from "../src/audio/sfx/ambient/repairs";
import { group } from "../src/audio/sfx/groups/ambient";
import { soundPoint } from "../src/audio/sfx/place";
import type { Cue, LoopCue } from "../src/audio/sfx/types";
import { DAYLIGHT, MODIFIERS } from "../src/sim/config";
import { constructionDustHours } from "../src/sim/cleaner";
import { newGame } from "../src/sim/game";
import type { GameState } from "../src/sim/types";

/** День із цим модифікатором (null — без нього) у цю хвилину. */
function at(minute: number, day: string | null = null, week: string | null = null): GameState {
  const state = newGame({ address: "she", difficulty: "normal", seed: 4 }).current;
  state.minute = minute;
  state.modifiers = { day, week };
  return state;
}

const sounds = (loops: readonly LoopCue[]): string[] => loops.map((l) => l.sound);
const loopsAt = (state: GameState): readonly LoopCue[] => new AmbientLoops().read(state);

describe("тло квартири (§11.4а, «Тло»)", () => {
  it("вулицю чути з трьох вікон: зранку пташки, удень місто, увечері й після півночі — тиха вулиця", () => {
    expect(streetSound(at(7 * 60))).toBe("birds");
    expect(streetSound(at(DAYLIGHT.morningEnd))).toBe("city");
    expect(streetSound(at(DAYLIGHT.eveningStart))).toBe("evening");
    expect(streetSound(at(25 * 60))).toBe("evening");
    const street = loopsAt(at(12 * 60)).filter((l) => l.key.startsWith("street:"));
    expect(street.map((l) => l.at)).toEqual([...AMBIENT.windows]);
    expect(new Set(sounds(street))).toEqual(new Set(["city"]));
  });

  it("дощ, спека й холод — увесь день замість вулиці; спека й холод — і тижнем", () => {
    for (const minute of [7 * 60, 12 * 60, 22 * 60]) {
      expect(streetSound(at(minute, "rain")), `дощ ${minute}`).toBe("rain");
      expect(streetSound(at(minute, "heat")), `спека ${minute}`).toBe("cicadas");
      expect(streetSound(at(minute, "cold")), `холод ${minute}`).toBe("wind");
    }
    expect(streetSound(at(12 * 60, null, "heat-wave"))).toBe("cicadas");
    expect(streetSound(at(12 * 60, null, "cold-snap"))).toBe("wind");
  });

  it("фестиваль — увечері з вікон, до кінця феєрверків", () => {
    expect(streetSound(at(AMBIENT.festivalFrom - 1, "festival"))).toBe("evening");
    expect(streetSound(at(AMBIENT.festivalFrom, "festival"))).toBe("festival");
    expect(streetSound(at(MODIFIERS.festival.minute, "festival"))).toBe("festival");
    expect(streetSound(at(MODIFIERS.festival.minute + MODIFIERS.festival.minutes, "festival"))).toBe("evening");
  });

  it("вечірка в сусідів — увечері за стіною вітальні", () => {
    expect(sounds(loopsAt(at(AMBIENT.partyFrom - 1, "noisy-neighbors")))).not.toContain("party");
    const party = loopsAt(at(AMBIENT.partyFrom, "noisy-neighbors")).find((l) => l.sound === "party");
    expect(party?.at).toEqual(AMBIENT.neighbors);
    expect(sounds(loopsAt(at(23 * 60)))).not.toContain("party");
  });

  it("холодильник гуде, а без світла замовкає", () => {
    expect(loopsAt(at(12 * 60)).find((l) => l.sound === "fridge")?.at).toBe("fridge");
    expect(sounds(loopsAt(at(12 * 60, "outage")))).not.toContain("fridge");
  });

  it("перелік петель — той самий масив, поки нічого не змінилося; інша пора доби — новий", () => {
    const loops = new AmbientLoops();
    const state = at(12 * 60);
    const first = loops.read(state);
    state.minute += 30;
    expect(loops.read(state)).toBe(first);
    state.minute = DAYLIGHT.eveningStart;
    expect(loops.read(state)).not.toBe(first);
  });

  it("кожна петля й уривок — звук групи, звідки чути — місце в квартирі", () => {
    const states = [at(7 * 60), at(AMBIENT.partyFrom, "noisy-neighbors"), at(AMBIENT.festivalFrom, "festival"), at(12 * 60, "rain")];
    for (const state of states) {
      for (const loop of loopsAt(state)) {
        expect(group.sounds[loop.sound]?.loop, loop.sound).toBe(true);
        expect(soundPoint(state, loop.at), `${loop.key}`).not.toBeNull();
      }
    }
    for (const sound of ["drill", "hammer", "stairwell"]) expect(group.sounds[sound]?.loop, sound).toBeFalsy();
    expect(soundPoint(at(12 * 60), "door")).not.toBeNull();
    expect(group.onEvent).toBeUndefined();
  });
});

describe("ремонт уривками (§11.4а, «Тло»)", () => {
  /** Скільки уривків і яких за `ms` реального часу кадрами по 16 мс. */
  function listen(repairs: Repairs, state: GameState, ms: number): string[] {
    const heard: string[] = [];
    for (let t = 0; t < ms; t += 16) for (const cue of repairs.tick(state, 16) as readonly Cue[]) heard.push(cue.sound);
    return heard;
  }

  it("«Ремонт у сусідів» — дриль чи молоток у робочі години сусідів, не частіше за проміжок і не одразу", () => {
    const state = at(MODIFIERS.neighborsHours.from, "renovation");
    const [min, max] = AMBIENT.renovation.everyMs;
    const repairs = new Repairs(() => 0);
    expect(listen(repairs, state, min - 100)).toEqual([]);
    const heard = listen(repairs, state, max * 3);
    expect(heard.length).toBeGreaterThan(0);
    expect(heard.length).toBeLessThanOrEqual(Math.ceil((max * 3) / min));
    expect(new Set(heard)).toEqual(new Set(["drill"]));
    expect(new Set(listen(new Repairs(() => 0.9), state, max * 3))).toEqual(new Set(["hammer"]));
    expect(listen(new Repairs(() => 0), at(MODIFIERS.neighborsHours.to, "renovation"), max * 3)).toEqual([]);
    expect(listen(new Repairs(() => 0), at(12 * 60), max * 3)).toEqual([]);
  });

  it("«Будівельний пил» — стукіт у під'їзді, лише поки пил осідає", () => {
    const { from, to } = constructionDustHours();
    const [, max] = AMBIENT.stairwell.everyMs;
    expect(new Set(listen(new Repairs(() => 0.5), at(from, "construction-dust"), max * 3))).toEqual(new Set(["stairwell"]));
    expect(listen(new Repairs(() => 0.5), at(to, "construction-dust"), max * 3)).toEqual([]);
  });

  it("скинули — перший уривок знову чекає свій проміжок", () => {
    const state = at(MODIFIERS.neighborsHours.from, "renovation");
    const [min] = AMBIENT.renovation.everyMs;
    const repairs = new Repairs(() => 0);
    listen(repairs, state, min - 100);
    repairs.reset();
    expect(listen(repairs, state, min - 100)).toEqual([]);
  });
});
