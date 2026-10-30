// Атлас арту окремо від гри (крок 16, GRAPHICS_PLAN.md: «Арт, маніфест і атласи»): зібрати, показати, скільки кадрів,
// сторінок і заглушок, помилки й попередження, і за бажанням записати `index.json` і сторінки в теку.
//
//   npm run art -w games/kotoklopit [-- --out <тека>] [--require-all] [--no-cache]
//
// Код конвеєра імпортує модулі гри без розширень (як збирач), тож Node сам його не запустить: його бере Vite
// (`runnerImport`). Код повернення 1 — є помилки (ті самі, що ламають `vite build`).

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { runnerImport } from "vite";

const GAME_DIR = path.resolve(import.meta.dirname, "..", "..");

const { values } = parseArgs({
  options: {
    out: { type: "string" },
    "require-all": { type: "boolean", default: false },
    "no-cache": { type: "boolean", default: false },
  },
});

const { module: art } = await runnerImport<typeof import("./build.ts")>(path.join(import.meta.dirname, "build.ts"), {
  root: GAME_DIR,
  logLevel: "error",
});
const requireAll = values["require-all"] || art.requireAllFromEnv();
const build = await art.buildGameArt({ gameDir: GAME_DIR, requireAll, cache: !values["no-cache"] });

for (const warning of build.warnings) console.warn(`попередження: ${warning}`);
for (const error of build.errors) console.error(`помилка: ${error}`);
console.log(art.describeBuild(build));
for (const page of build.index.pages) {
  console.log(`  ${page.file}: ${page.w}×${page.h}, ${art.formatBytes(build.files.get(page.file)?.length ?? 0)}`);
}

if (values.out !== undefined) {
  const out = path.resolve(values.out);
  await mkdir(out, { recursive: true });
  for (const [name, data] of build.files) await writeFile(path.join(out, name), data);
  console.log(`записано в ${out}`);
}
process.exitCode = build.errors.length > 0 ? 1 : 0;
