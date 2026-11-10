// Сумісність збережень (§4.2): гру випущено, тож збереження кожної випущеної версії відкриваються й граються далі.
// Зразки — `tests/fixtures/saves/v<версія>-<набір>/`: їх записав код, що тоді був на сайті, і після запису їх не змінюють.
// Записати новий набір поточної версії (у `games/kotoklopit`): `SAVES_RECORD=<набір> npx vitest run tests/saves.test.ts`.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { Bot } from "../balance/bot";
import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { MINUTES_PER_DAY } from "../src/sim/config";
import { advance, deserialize, newGame, replayDay, replayWeek, serialize, type NewGameOptions } from "../src/sim/game";
import { migrate, RELEASED_SAVE_VERSION, SAVE_VERSION, snapshots, type Migration } from "../src/sim/saves";
import type { Save } from "../src/sim/types";

const FIXTURES = Object.entries(import.meta.glob<string>("./fixtures/saves/*/*.json", { query: "?raw", import: "default", eager: true })).map(
  ([path, json]) => [path.replace("./fixtures/saves/", ""), json] as const,
);

describe("версії збережень", () => {
  const save = newGame({ address: "she", difficulty: "normal", seed: 5 });
  const raw = (version: unknown): unknown => ({ ...structuredClone(save), version });

  it("відкривається лише випущена чи новіша версія, але не новіша за гру", () => {
    expect(migrate(raw(SAVE_VERSION)).version).toBe(SAVE_VERSION);
    for (const version of [RELEASED_SAVE_VERSION - 1, SAVE_VERSION + 1, 2.5, "2", undefined]) {
      expect(() => migrate(raw(version))).toThrow();
    }
    expect(() => migrate(null)).toThrow();
  });

  it("міграції йдуть по черзі від версії збереження й проходять кожен знімок стану, зокрема ранок", () => {
    const steps: number[] = [];
    const tag =
      (n: number): Migration =>
      (old) => {
        steps.push(n);
        for (const state of snapshots(old)) state["tags"] = [...(state["tags"] ?? []), n];
      };
    const migrations = [tag(1), tag(2), tag(3)];
    const old = { ...structuredClone(save), version: RELEASED_SAVE_VERSION + 1, morning: structuredClone(save.current) };
    const migrated = migrate(old, migrations) as Save & { current: { tags?: number[] }; morning: { tags?: number[] } };
    expect(steps).toEqual([2, 3]);
    expect(migrated.version).toBe(RELEASED_SAVE_VERSION + migrations.length);
    expect(migrated.current.tags).toEqual([2, 3]);
    expect(migrated.morning.tags).toEqual([2, 3]);
  });

  it("для кожної версії від випуску є записані зразки: нову версію без них не випускають", () => {
    const recorded = new Set(FIXTURES.map(([name]) => Number(/^v(\d+)-/.exec(name)?.[1])));
    for (let version = RELEASED_SAVE_VERSION; version <= SAVE_VERSION; version++) expect(recorded.has(version), `v${version}`).toBe(true);
  });
});

describe.each(FIXTURES)("збереження %s", (_name, json) => {
  it("відкривається в поточній версії й зберігається без втрат", () => {
    const save = deserialize(json);
    expect(save.version).toBe(SAVE_VERSION);
    expect(deserialize(serialize(save))).toEqual(save);
  });

  it("грається далі: бот проживає решту дня й ніч", () => {
    const save = deserialize(json);
    const { day } = save.current;
    new Bot(save).day();
    expect(save.current.end !== null || save.current.day > day).toBe(true);
  });

  it("переграється день і тиждень", () => {
    const save = deserialize(json);
    if (save.current.end !== null) return;
    replayDay(save);
    expect(save.current.day).toBe(save.dayStart.day);
    advance(save, 60);
    replayWeek(save);
    expect(save.current.day).toBe(save.weekStart.day);
    advance(save, 60);
  });
});

/** Ігри бота для зразків: різні складності, хронотипи й звертання. */
const BOT_RUNS: { name: string; options: NewGameOptions; days: number }[] = [
  { name: "normal", options: { address: "she", difficulty: "normal", chronotype: "lark", seed: 11 }, days: 22 },
  { name: "hard", options: { address: "he", difficulty: "hard", chronotype: "owl", seed: 12 }, days: 22 },
  { name: "easy", options: { address: "she", difficulty: "easy", chronotype: "owl", seed: 13 }, days: 15 },
  { name: "ukro", options: { address: "he", difficulty: "ukro", chronotype: "lark", seed: 14 }, days: 22 },
];
/** Ранки, які лягають у зразки: понеділок (новий тиждень), будні й неділя. */
const MORNINGS = new Set([1, 6, 7, 9, 13, 20]);
/** Дні, у які зразки — ще й посеред дня: о цій годині й пізніше, першим кроком бота. */
const MIDDAY = { days: new Set([2, 8, 15]), hours: [11, 17, 22] };
/** Сценарії зі станами, яких бот сам не дає: поїздки, гості, дім і багато котів. */
const SCENARIOS = [
  "doctor-trip", "home-departure", "night-drive", "vet-trip", "evening-home-road", "shop-visit",
  "mom-visit", "neighbor-parcels", "cleaner-visit", "home-vet",
  "ten-cats", "birth-tomorrow", "sick-cats", "cat-fights", "pet-two", "carriers",
  "big-box", "appliances", "fur-tufts", "dusty-home", "power-outage", "vacuum-bought",
  "utilities-due", "job-search",
];

it.runIf(process.env["SAVES_RECORD"])("запис зразків поточної версії", () => {
  const dir = new URL(`./fixtures/saves/v${SAVE_VERSION}-${process.env["SAVES_RECORD"]}/`, import.meta.url);
  // Набір пишеться один раз: записані зразки — збереження, які вже є в гравців, їх не переписують.
  expect(existsSync(dir)).toBe(false);
  mkdirSync(dir, { recursive: true });
  const write = (name: string, save: Save): void => writeFileSync(fileURLToPath(new URL(`${name}.json`, dir)), serialize(save));

  for (const run of BOT_RUNS) {
    const save = newGame(run.options);
    const captured = new Set<string>();
    let trip = false;
    const bot = new Bot(save, undefined, () => {
      const state = save.current;
      const clock = Math.floor((state.minute % MINUTES_PER_DAY) / 60);
      if (MIDDAY.days.has(state.day)) {
        for (const hour of MIDDAY.hours) {
          const key = `${state.day}-${hour}`;
          if (clock >= hour && !captured.has(key)) {
            captured.add(key);
            write(`bot-${run.name}-day${String(state.day).padStart(2, "0")}-${hour}h`, save);
          }
        }
      }
      if (state.trip !== null && !trip) {
        trip = true;
        write(`bot-${run.name}-trip`, save);
      }
    });
    for (let d = 0; d < run.days && save.current.end === null; d++) {
      bot.day();
      if (MORNINGS.has(save.current.day) && save.current.end === null) write(`bot-${run.name}-day${String(save.current.day).padStart(2, "0")}`, save);
    }
    if (save.current.end !== null) write(`bot-${run.name}-end`, save);
  }
  for (const name of SCENARIOS) {
    const scenario = FILE_SCENARIOS[name];
    expect(scenario, name).toBeDefined();
    if (scenario) write(`scenario-${name}`, applyScenario(scenario));
  }
}, 600_000);
