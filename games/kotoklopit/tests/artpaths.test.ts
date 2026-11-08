// Дані шляхів SVG арту (крок 16, art/STYLE.md §12): кожен `d` — справжні дані шляху. Браузер і librsvg мовчки не малюють
// шлях з помилкою (напр. `d="MQQZ"` — генератор не підставив координати), і перевірки полотна, кольорів і товщин цього не
// бачать: так у роті кота (A7) зникли жолобок язика й борозенка, описані в заголовку файлу.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { listFiles } from "../scripts/art/build";
import { isPrivateArtPath } from "../scripts/art/svg";

const ART_DIR = path.join(fileURLToPath(new URL("..", import.meta.url)), "art");

/** Скільки чисел бере кожна команда шляху (кратне — повтори; Z — жодного). */
const ARGS: Record<string, number> = { m: 2, l: 2, t: 2, h: 1, v: 1, c: 6, s: 4, q: 4, a: 7, z: 0 };
const TOKEN = /([MmLlHhVvCcSsQqTtAaZz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)|([\s,]+)|(.)/g;

/** Що не так із даними шляху (null — усе гаразд). Прапорці дуг `a` перевіряються лише кількістю. */
function pathDataProblem(d: string): string | null {
  const groups: { cmd: string; n: number }[] = [];
  for (const m of d.matchAll(TOKEN)) {
    if (m[4] !== undefined) return `зайвий символ «${m[4]}»`;
    if (m[1] !== undefined) groups.push({ cmd: m[1], n: 0 });
    else if (m[2] !== undefined) {
      const last = groups.at(-1);
      if (!last) return "число перед першою командою";
      last.n++;
    }
  }
  const first = groups[0];
  if (!first) return "порожній шлях";
  if (first.cmd.toLowerCase() !== "m") return `починається з «${first.cmd}», а не з M`;
  for (const { cmd, n } of groups) {
    const k = ARGS[cmd.toLowerCase()] ?? 0;
    if (k === 0 ? n !== 0 : n === 0 || n % k !== 0) return `«${cmd}» з ${n} числами (треба ${k === 0 ? "жодного" : `кратне ${k}`})`;
  }
  return null;
}

describe("дані шляхів SVG", () => {
  it("розбір: справжні дані проходять, обірвані — ні", () => {
    expect(pathDataProblem("M0 0L9 9Z")).toBeNull();
    expect(pathDataProblem("M1.5-2C3 4 5 6 7 8S1 2 3 4Q1 2 3 4T5 6H1V2A3 3 0 0 1 4 4z")).toBeNull();
    expect(pathDataProblem("M0 0 1 1 2 2Z")).toBeNull();
    expect(pathDataProblem("MQQZ")).not.toBeNull();
    expect(pathDataProblem("M1 2Q3 4 5Z")).not.toBeNull();
    expect(pathDataProblem("L1 2Z")).not.toBeNull();
    expect(pathDataProblem("M1 2LNaN 3")).not.toBeNull();
    expect(pathDataProblem("")).not.toBeNull();
  });

  it("кожен d у art/ — справжні дані шляху", () => {
    const problems: string[] = [];
    for (const svg of listFiles(ART_DIR).filter((file) => file.endsWith(".svg") && !isPrivateArtPath(file))) {
      const text = readFileSync(path.join(ART_DIR, svg), "utf8");
      for (const m of text.matchAll(/\sd="([^"]*)"/g)) {
        const d = m[1] ?? "";
        const problem = pathDataProblem(d);
        if (problem) problems.push(`art/${svg}: d="${d.slice(0, 40)}…" — ${problem}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
