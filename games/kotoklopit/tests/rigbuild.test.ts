// Перевірка скелета (`rigProblems`, `fitProblems`) — лише там, де є режим розробки (§2.1, «Анімація»): продакшн-збірка
// (`__DEV_TOOLS__` = false) її не виконує й коду перевірок не містить. Збираємо малий вхід зі скелетом тим самим Vite, що
// й гру, і шукаємо в результаті тексти помилок перевірки.

import path from "node:path";

import { build } from "vite";
import { describe, expect, it } from "vitest";

const GAME = path.resolve(import.meta.dirname, "..");
const ENTRY = "virtual:rig-entry";

/** Зібраний код входу, що створює скелет кота з точками арту; без мінімізації, щоб тексти лишалися як є. */
async function bundle(devTools: boolean): Promise<string> {
  const from = (file: string): string => JSON.stringify(path.join(GAME, file).replaceAll("\\", "/"));
  const result = await build({
    root: GAME,
    configFile: false,
    logLevel: "silent",
    define: { __DEV_TOOLS__: JSON.stringify(devTools) },
    plugins: [
      {
        name: "rig-entry",
        resolveId: (id) => (id === ENTRY ? `\0${ENTRY}` : null),
        load: (id) =>
          id === `\0${ENTRY}`
            ? `import { Rig } from ${from("src/view/rig/rigcore.ts")};
               import { CAT_RIG } from ${from("src/view/rig/defs/cat.ts")};
               export const make = (fit) => new Rig(CAT_RIG, { fit });`
            : null,
      },
    ],
    build: { write: false, minify: false, target: "es2022", rolldownOptions: { input: ENTRY, preserveEntrySignatures: "strict" } },
  });
  const outputs = Array.isArray(result) ? result : [result];
  return outputs.flatMap((output) => ("output" in output ? output.output : [])).map((chunk) => (chunk.type === "chunk" ? chunk.code : "")).join("\n");
}

/** Тексти, які є лише в перевірках: `rigProblems`, `fitProblems` і помилка конструктора. */
const CHECK_TEXTS = ["id повторюється", "ще не пораховано", "Скелет:"];

describe("перевірка скелета у збірці", () => {
  it("з режимом розробки — у коді, у продакшн-збірці — ні", async () => {
    const dev = await bundle(true);
    for (const text of CHECK_TEXTS) expect(dev, text).toContain(text);
    const prod = await bundle(false);
    expect(prod).toContain("new Rig(");
    for (const text of CHECK_TEXTS) expect(prod, text).not.toContain(text);
    expect(prod).not.toContain("__DEV_TOOLS__");
  });
});
