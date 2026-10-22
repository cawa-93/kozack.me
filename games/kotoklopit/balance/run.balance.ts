// Симуляція балансу (§11.2, крок 8 плану): бот-гравець проживає тижні гри для всіх 6 комбінацій
// персонажа й складності на кількох seed. Звіт — у консоль і `balance/REPORT.md`.
// Запуск: `npm run balance -w games/kotoklopit`; тижні й seed — змінні BALANCE_WEEKS, BALANCE_SEEDS.

import { writeFileSync } from "node:fs";

import { it } from "vitest";

import { lifeMood } from "../src/sim/cat";
import { newGame } from "../src/sim/game";
import type { Difficulty, GameState, Sex } from "../src/sim/types";
import { DIFFICULTY_TITLES } from "../src/texts";
import { Bot } from "./bot";

const WEEKS = Number(process.env["BALANCE_WEEKS"] ?? 6);
const SEEDS = Number(process.env["BALANCE_SEEDS"] ?? 3);

interface Run {
  sex: Sex;
  difficulty: Difficulty;
  seed: number;
  days: number;
  end: string | null;
  money: number;
  minMoney: number;
  sanity: number[];
  kittens: number;
  cats: number;
  catMood: number[];
  /** Середній настрій за життя всіх котів: і живих, і з альбому пам'яті (§9.7). */
  lives: number[];
  deaths: number;
  catHealth: number[];
  position: number;
  reputation: number;
  worked: number;
  petted: number;
  played: number;
  walked: number;
  warnings: number;
  seconds: number;
}

/** Рівень опису життя за середнім настроєм (§9.7): 0 — Агонія, 9 — Легенда. */
const level = (mood: number): number => Math.min(9, Math.max(0, Math.floor(mood / 10)));

function simulate(sex: Sex, difficulty: Difficulty, seed: number): Run {
  const started = performance.now();
  const save = newGame({ sex, difficulty, seed });
  const bot = new Bot(save);
  const run: Run = {
    sex,
    difficulty,
    seed,
    days: 0,
    end: null,
    money: 0,
    minMoney: Infinity,
    sanity: [],
    kittens: 0,
    cats: 0,
    catMood: [],
    lives: [],
    deaths: 0,
    catHealth: [],
    position: 0,
    reputation: 0,
    worked: 0,
    petted: 0,
    played: 0,
    walked: 0,
    warnings: 0,
    seconds: 0,
  };
  for (let d = 0; d < WEEKS * 7; d++) {
    const evening = save.current.character.stats.sanity;
    const report = bot.day();
    run.sanity.push(report?.sanityEvening ?? evening);
    if (report) {
      run.kittens += report.newCats.length;
      if (report.utilities?.outcome === "warning" || report.utilities?.outcome === "partial") run.warnings += 1;
    }
    run.days = d + 1;
    run.minMoney = Math.min(run.minMoney, save.current.character.money);
    if (save.current.end !== null) {
      run.end = save.current.end;
      break;
    }
  }
  const state: GameState = save.current;
  run.money = state.character.money;
  run.cats = state.cats.length;
  run.catMood = state.cats.map(lifeMood);
  run.lives = [...run.catMood, ...state.album.map((e) => e.lifeMood)];
  run.deaths = state.album.length;
  run.catHealth = state.cats.map((c) => c.health);
  run.position = state.job.position;
  run.reputation = state.job.reputation;
  run.worked = bot.log.worked / run.days;
  run.petted = (bot.log.petted + bot.log.played) / run.days;
  run.played = bot.log.played / run.days;
  run.walked = bot.log.walked / run.days;
  run.seconds = (performance.now() - started) / 1000;
  return run;
}

const avg = (values: readonly number[]): number => (values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : NaN);
const fmt = (value: number, digits = 1): string => (Number.isFinite(value) ? value.toFixed(digits) : "—");

function report(runs: Run[]): string {
  const lines: string[] = [];
  lines.push(`# Симуляція балансу`);
  lines.push("");
  lines.push(`${WEEKS} тижнів, ${SEEDS} seed на комбінацію. Бот — \`balance/bot.ts\`. Згенеровано ${new Date().toISOString().slice(0, 10)}.`);
  lines.push("");
  lines.push("| Персонаж | Складність | Дожили | Кінець | Гроші (мін) | Здоровий глузд ввечері (мін) | Кошенят | Котів (померло) | Настрій котів | Здоров'я котів | Посада | Робота, год/день | Коти, год/день | Попереджень ОСББ |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  const combos = new Map<string, Run[]>();
  for (const run of runs) {
    const key = `${run.sex}/${run.difficulty}`;
    combos.set(key, [...(combos.get(key) ?? []), run]);
  }
  for (const group of combos.values()) {
    const first = group[0];
    if (!first) continue;
    // Пенсія (§4.2) — успішний фінал, а не програш.
    const lost = (r: Run): boolean => r.end !== null && r.end !== "retirement";
    const survived = group.filter((r) => !lost(r)).length;
    const ends = group.filter(lost).map((r) => `${r.end} (д${r.days})`).join(", ") || "—";
    const allSanity = group.flatMap((r) => r.sanity);
    lines.push(
      [
        first.sex === "female" ? "жайворонок" : "сова",
        DIFFICULTY_TITLES[first.difficulty],
        `${survived}/${group.length}`,
        ends,
        `${fmt(avg(group.map((r) => r.money)), 0)} (${fmt(Math.min(...group.map((r) => r.minMoney)), 0)})`,
        `${fmt(avg(allSanity))} (${fmt(Math.min(...allSanity))})`,
        fmt(avg(group.map((r) => r.kittens))),
        `${fmt(avg(group.map((r) => r.cats)))} (${fmt(avg(group.map((r) => r.deaths)))})`,
        fmt(avg(group.flatMap((r) => r.catMood))),
        fmt(avg(group.flatMap((r) => r.catHealth))),
        fmt(avg(group.map((r) => r.position + 1))),
        fmt(avg(group.map((r) => r.worked))),
        fmt(avg(group.map((r) => r.petted))),
        fmt(avg(group.map((r) => r.warnings))),
      ].join(" | ").replace(/^/, "| ").concat(" |"),
    );
  }
  const levels = new Array<number>(10).fill(0);
  for (const mood of runs.flatMap((r) => r.lives)) levels[level(mood)] = (levels[level(mood)] ?? 0) + 1;
  lines.push("");
  lines.push(`Рівні життя всіх котів, живих і з альбому (§9.7), від «Агонії» до «Легенди»: ${levels.join(" · ")}.`);
  lines.push("");
  lines.push(`Час прогону: ${fmt(runs.reduce((s, r) => s + r.seconds, 0), 0)} с.`);
  return lines.join("\n");
}

it("баланс: 6 комбінацій персонажа й складності (§11.2)", () => {
  const runs: Run[] = [];
  for (const sex of ["female", "male"] as const) {
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      for (let seed = 1; seed <= SEEDS; seed++) runs.push(simulate(sex, difficulty, seed * 101));
    }
  }
  const text = report(runs);
  console.log(text);
  writeFileSync(new URL("./REPORT.md", import.meta.url), `${text}\n`);
});
