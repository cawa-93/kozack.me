// Звуки поїздки (§8.5, §11.4а; `SOUND_PLAN.md`, «Ефекти», рядок `trip`): двері й мотор на виїзді, ручник, мотор і двері на місці,
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
import { ENGINE, EngineHum, engineRate } from "../src/audio/sfx/trip/engine";
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
    race.cars.push({ lane: race.lane, start: 5 - RACE.carLength * 2 });
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

  it("мотор: холості на місці, вище зі швидкістю, але не вище за межу", () => {
    expect(engineRate(0)).toBe(ENGINE.idleRate);
    expect(engineRate(-1)).toBe(ENGINE.idleRate);
    expect(engineRate(RACE.startSpeed)).toBeGreaterThan(engineRate(0));
    expect(engineRate(RACE.maxSpeed)).toBeGreaterThan(engineRate(RACE.startSpeed));
    expect(engineRate(RACE.maxSpeed * 10)).toBe(ENGINE.maxRate);
  });

  it("гудіння вмикається, щойно звук готовий, і згасає, коли мотор заглушили", () => {
    const calls: string[] = [];
    let ready = false;
    const hum = new EngineHum((): SceneLoop | null =>
      ready ? { set: (gain, rate) => calls.push(`set ${gain} ${rate}`), stop: () => calls.push("stop") } : null,
    );
    hum.run(1, 1);
    ready = true;
    hum.run(1.2, 0.5);
    hum.stop();
    hum.stop();
    expect(calls).toEqual(["set 0.5 1.2", "stop"]);
  });
});
