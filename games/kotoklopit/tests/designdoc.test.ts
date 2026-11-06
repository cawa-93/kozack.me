// Дизайн-документ (кореневий `CLAUDE.md`, «Дизайн-документ — короткий і завжди актуальний»): чисел гри в `GAME_DESIGN.md`
// немає, замість них — назви констант, тож кожна назва веде на наявне значення. Документ описує лише поточний стан: позначок
// змін і дат у ньому немає.

import { describe, expect, it } from "vitest";

import breeds from "../BREEDS.md?raw";
import dayModifiers from "../DAY_MODIFIERS.md?raw";
import diseases from "../DISEASES.md?raw";
import design from "../GAME_DESIGN.md?raw";
import texts from "../TEXTS.md?raw";
import traits from "../TRAITS.md?raw";
import * as config from "../src/sim/config";

const sources = Object.values(import.meta.glob<string>("../src/**/*.ts", { query: "?raw", import: "default", eager: true }));

/**
 * Посилання на константу: `DAYS_PER_WEEK`, `GUESTS.ringLead`. `[d]`, `[x]` чи `[]` у шляху — будь-який запис об'єкта чи
 * списку: `DIFFICULTY[d].earnings`, `POSITIONS[].sanity`.
 */
const REFERENCE = String.raw`[A-Z]{2}[A-Z0-9_]*(?:\[\w*\]|\.[A-Za-z_]\w*)*`;
const WHOLE_SPAN = new RegExp(`^${REFERENCE}$`);
const IN_FORMULA = new RegExp(REFERENCE, "g");

/** Назви в зворотних лапках і ті, що стоять у формулах блоків коду. Назви файлів (`TRAITS.md`) — не константи. */
function references(text: string): string[] {
  const inline = [...text.matchAll(/`([^`\n]+)`/g)].flatMap((span) => span[1] ?? "").filter((span) => WHOLE_SPAN.test(span));
  const fenced = [...text.matchAll(/^```\w*\r?\n([\s\S]*?)^```/gm)].flatMap((block) => block[1]?.match(IN_FORMULA) ?? []);
  return [...new Set([...inline, ...fenced])].filter((name) => !name.endsWith(".md"));
}

function hasPath(value: unknown, steps: readonly string[]): boolean {
  const [step, ...rest] = steps;
  if (step === undefined) return value !== undefined;
  if (typeof value !== "object" || value === null) return false;
  if (step.startsWith("[")) return Object.values(value).some((entry) => hasPath(entry, rest));
  return hasPath((value as Record<string, unknown>)[step.slice(1)], rest);
}

function isDeclared(name: string): boolean {
  const declaration = new RegExp(String.raw`\b(?:const|let|function|class|enum|type|interface)\s+${name}\b`);
  return sources.some((source) => declaration.test(source));
}

/** Значення за шляхом — у `src/sim/config.ts`; константу з іншого модуля перевіряємо лише за оголошенням. */
function resolves(reference: string): boolean {
  const name = reference.match(/^\w+/)?.[0] ?? "";
  if (!(name in config)) return isDeclared(name);
  const steps = reference.slice(name.length).match(/\[\w*\]|\.\w+/g) ?? [];
  return hasPath((config as Record<string, unknown>)[name], steps);
}

const DOCS = { "GAME_DESIGN.md": design, "TRAITS.md": traits, "DAY_MODIFIERS.md": dayModifiers, "DISEASES.md": diseases, "TEXTS.md": texts, "BREEDS.md": breeds };

describe.each(Object.entries(DOCS))("%s", (_name, doc) => {
  it("посилається лише на наявні константи", () => {
    expect(references(doc).filter((reference) => !resolves(reference))).toEqual([]);
  });

  it("не має позначок змін і дат", () => {
    expect(doc.match(/\[(?:Змінено пізніше|Уточнено|Пропозиція|Ухвалено|Пізніше)[^\]\n]*\]/gu) ?? []).toEqual([]);
    expect(doc.match(/\b20\d\d-\d\d-\d\d\b/g) ?? []).toEqual([]);
  });
});

it("дизайн-документ посилається на константи, а не на числа", () => {
  expect(references(design).length).toBeGreaterThan(100);
});
