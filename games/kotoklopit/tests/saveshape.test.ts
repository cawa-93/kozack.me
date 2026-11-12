// Збереження, яке не вдається відкрити (§4.2): не той файл чи зіпсоване збереження в браузері — це «Не вдалося завантажити» й
// нечитабельне збереження, а не гра, що падає на першому ж кадрі (а з браузера — на кожному запуску). Окрім версії, перевіряємо
// основну форму: знімки стану з персонажем, котами й домом.

import { afterEach, describe, expect, it } from "vitest";

import { loadSave } from "../src/session";
import { deserialize, newGame, serialize } from "../src/sim/game";

const good = (): Record<string, unknown> => JSON.parse(serialize(newGame({ address: "she", difficulty: "normal", seed: 5 })));

const BROKEN: [string, () => unknown][] = [
  ["лише версія", () => ({ version: good()["version"] })],
  ["поточного стану немає", () => ({ ...good(), current: null })],
  ["стан без персонажа", () => ({ ...good(), current: { day: 3 } })],
  [
    "стан без котів",
    () => {
      const save = good();
      delete (save["dayStart"] as Record<string, unknown>)["cats"];
      return save;
    },
  ],
  [
    "стан без дому",
    () => {
      const save = good();
      (save["weekStart"] as Record<string, unknown>)["home"] = "дім";
      return save;
    },
  ],
  ["ранок — не стан", () => ({ ...good(), morning: 7 })],
  ["масив замість збереження", () => [good()]],
];

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe("форма збереження (§4.2)", () => {
  it("справжнє збереження відкривається", () => {
    const save = good();
    expect(deserialize(JSON.stringify(save))).toEqual(save);
  });

  it.each(BROKEN)("%s — не відкривається", (_name, broken) => {
    expect(() => deserialize(JSON.stringify(broken()))).toThrow();
  });

  it("таке збереження в браузері — нечитабельне, а не гра", () => {
    const text = JSON.stringify({ ...good(), current: { day: 3 } });
    const items: Record<string, string> = { "kotoklopit:save": text };
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (key: string) => items[key] ?? null,
      setItem: (key: string, value: string) => {
        items[key] = value;
      },
    };
    expect(loadSave()).toEqual({ save: null, unreadable: text });
  });
});
