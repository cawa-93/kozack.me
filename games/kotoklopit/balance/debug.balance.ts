// Трасування днів бота: що він робить і де застрягає. Запуск: BALANCE_DEBUG=<днів> npm run balance;
// персонаж, складність і seed — BALANCE_SEX, BALANCE_DIFFICULTY, BALANCE_SEED.

import { writeFileSync } from "node:fs";

import { it } from "vitest";

import { newGame } from "../src/sim/game";
import { formatClock } from "../src/sim/time";
import type { Difficulty, Sex } from "../src/sim/types";
import { Bot } from "./bot";

it.runIf(process.env["BALANCE_DEBUG"])("трасування бота", () => {
  const save = newGame({
    sex: (process.env["BALANCE_SEX"] ?? "female") as Sex,
    difficulty: (process.env["BALANCE_DIFFICULTY"] ?? "normal") as Difficulty,
    seed: Number(process.env["BALANCE_SEED"] ?? 101),
  });
  const lines: string[] = [];
  const bot = new Bot(save, undefined, (task) => {
    const s = save.current;
    const c = s.character;
    lines.push(
      `${formatClock(s.minute)} д${s.day} ${task} | ситість ${c.stats.satiety.toFixed(0)} гігієна ${c.stats.hygiene.toFixed(0)} глузд ${c.stats.sanity.toFixed(1)} гроші ${c.money.toFixed(0)} | у руках ${c.held?.kind ?? "—"} | плита ${s.home.stove.item?.kind ?? "—"} | їжа ${s.home.supplies.food.cheap}`,
    );
  });
  for (let d = 0; d < Number(process.env["BALANCE_DEBUG"]); d++) bot.day();
  writeFileSync(new URL("./TRACE.txt", import.meta.url), lines.join("\n"));
});
