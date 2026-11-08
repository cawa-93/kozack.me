// Звуки поїздки (§8.5, §11.4а; `audio/SOUND.md`, «Хто що озвучує», рядок `trip`): двері й мотор на виїзді, ручник, мотор і двері на місці,
// гудки в гонці; чути й у поїздці.

import { describe, expect, it } from "vitest";

import { soundFile } from "../src/audio/sfx/files";
import { group } from "../src/audio/sfx/groups/trip";
import type { GameEvent } from "../src/sim/events";
import { newGame } from "../src/sim/game";
import { RACE } from "../src/sim/config";
import { driveRace, newRace } from "../src/sim/race";
import { HORN, Horns } from "../src/audio/sfx/trip/horns";
import { Revs } from "../src/audio/sfx/trip/revs";
import { ENGINE, EngineHum, engineMix, engineRate } from "../src/audio/sfx/trip/engine";
import type { SceneLoop } from "../src/audio/sfx/sounds";
import type { SceneMoment } from "../src/audio/sfx/types";

describe("звуки поїздки", () => {
  const state = newGame({ address: "he", difficulty: "normal", seed: 3 }).current;
  const sounds = (event: GameEvent): string[] => (group.onEvent?.(event, state) ?? []).map((cue) => cue.sound);

  it("на виїзді — двері, мотор заводиться й машина рушає; стала на парковці — мотор глухне, ручник, двері", () => {
    const scene = (moment: SceneMoment): string[] => (group.onScene?.(moment, state) ?? []).map((cue) => cue.sound);
    expect(sounds({ type: "trip-started", destination: "shop" })).toEqual(["car-door", "engine-start", "rev"]);
    expect(scene("unparked")).toEqual(["car-door", "engine-start", "rev"]);
    // Фініш — ще не парковка: машина заїжджає на місце, і все звучить, коли вона стала.
    expect(sounds({ type: "trip-arrived", destination: "shop" })).toEqual([]);
    expect(scene("parked")).toEqual(["engine-stop", "handbrake", "car-door"]);
    expect(scene("morning")).toEqual([]);
    expect(sounds({ type: "trip-crashed", losses: [], speed: 5, minutes: 30 })).toEqual(["crash"]);
    expect(sounds({ type: "doorbell" })).toEqual([]);
  });

  it("у поїздці квартири не чути, тож звуки групи — на шині інтерфейсу й закодовані", () => {
    for (const [name, def] of Object.entries(group.sounds)) {
      expect(def.ui, name).toBe(true);
      for (const file of def.files) {
        const encoded = soundFile("trip", file);
        expect(encoded, `${name}: ${file}`).not.toBeNull();
        expect(encoded?.loop !== null, `${name}: ${file} — петля`).toBe(def.loop === true);
      }
    }
  });

  it("гудок: машина позаду пригальмувала впритул — сигналить, тягнеться далі — знову не раніше ніж за `HORN.repeatMs`", () => {
    const race = newRace(1000, 1);
    race.spawned = Infinity;
    race.done = 5;
    race.speed = 0;
    // Машина позаду за 0,15 дороги до «впритул» (`RACE.carLength`): наздоганяє за кілька кроків.
    race.cars.push({ lane: race.lane, start: 5 - RACE.carLength - 0.15 });
    const horns = new Horns();
    const honks = (ms: number): number => {
      let count = 0;
      for (let t = 0; t < ms; t += 50) {
        driveRace(race, 0.05, { steer: 0, throttle: 0 }, "normal");
        if (horns.tick(race, 50)) count++;
      }
      return count;
    };
    expect(honks(HORN.repeatMs * 2 + 500)).toBe(3);
    // Поїхав — більше не сигналять.
    race.speed = RACE.maxSpeed;
    driveRace(race, 1, { steer: 0, throttle: 1 }, "normal");
    expect(honks(HORN.repeatMs)).toBe(0);
  });

  it("газування — щойно натиснули газ, а не щокадру, поки його тримають", () => {
    const revs = new Revs();
    expect([0, 1, 1, 0.5, 0, -1, 0.3, 0].map((throttle) => revs.tick(throttle))).toEqual([false, true, false, false, false, false, true, false]);
  });

  it("мотор: холості на місці, вище зі швидкістю, на найбільшій — високі оберти й не вище", () => {
    const top = ENGINE.highHz / ENGINE.idleHz;
    expect(engineRate(0)).toBe(1);
    expect(engineRate(-1)).toBe(1);
    expect(engineRate(RACE.startSpeed)).toBeGreaterThan(engineRate(0));
    expect(engineRate(RACE.maxSpeed)).toBeCloseTo(top, 9);
    expect(engineRate(RACE.maxSpeed * 10)).toBeCloseTo(top, 9);
    expect(engineMix(engineRate(0))).toBe(0);
    expect(engineMix(engineRate(RACE.maxSpeed))).toBeCloseTo(1, 9);
    expect(engineMix(engineRate(RACE.startSpeed))).toBeGreaterThan(0);
  });

  it("гудіння: два шари вмикаються, щойно звук готовий, і згасають, коли мотор заглушили", () => {
    const calls: string[] = [];
    let ready = false;
    const hum = new EngineHum((sound): SceneLoop | null =>
      ready ? { set: (gain, rate) => calls.push(`${sound} ${gain.toFixed(2)} ${rate.toFixed(2)}`), stop: () => calls.push(`stop ${sound}`) } : null,
    );
    hum.run(1, 1);
    ready = true;
    // Холості: чутно лише нижній шар на своїй висоті.
    hum.run(1, 0.5);
    // Найбільша швидкість: лише верхній шар на своїй висоті.
    hum.run(engineRate(RACE.maxSpeed), 1);
    hum.stop();
    hum.stop();
    const idleHigh = (ENGINE.idleHz / ENGINE.highHz).toFixed(2);
    const top = (ENGINE.highHz / ENGINE.idleHz).toFixed(2);
    expect(calls).toEqual([
      "engine 0.50 1.00",
      `engine-high 0.00 ${idleHigh}`,
      `engine 0.00 ${top}`,
      "engine-high 1.00 1.00",
      "stop engine",
      "stop engine-high",
    ]);
  });
});
