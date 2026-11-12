// Кадр на місці (§8.5 «На місці — кадр парковки») нерухомий: сцена дороги перемальовує його не щокадру, а лише коли змінилося те,
// від чого він залежить (`parkedKey`): розмір полотна й щільність, безпечна зона, місце й пункт, світло доби й хвилина напису.
// Так само парковка пункту з її машинами береться з кешу за зерном (`lotCars`). Без Phaser.

import { describe, expect, it } from "vitest";

import { lotCars, ownSlot, parkedKey, type ParkedKeyInput } from "../src/view/parking";

const base: ParkedKeyInput = {
  width: 2532,
  height: 1170,
  ui: 1.625,
  unit: 1.083,
  safe: { top: 0, right: 47, bottom: 21, left: 47 },
  spot: { done: 12.5, seed: 77 },
  destination: "vet",
  light: 615.5,
  clock: "10:15",
};

describe("кадр на місці — за ключем (§8.5)", () => {
  it("те саме — той самий ключ: кадр не перемальовується", () => {
    expect(parkedKey({ ...base, safe: { ...base.safe }, spot: { ...base.spot } })).toBe(parkedKey(base));
  });

  it("усе, від чого залежить кадр, міняє ключ", () => {
    const key = parkedKey(base);
    const changed: ParkedKeyInput[] = [
      { ...base, width: 2000 },
      { ...base, height: 1000 },
      { ...base, ui: 2 },
      { ...base, unit: 1 },
      { ...base, safe: { ...base.safe, top: 10 } },
      { ...base, safe: { ...base.safe, right: 0 } },
      { ...base, safe: { ...base.safe, bottom: 0 } },
      { ...base, safe: { ...base.safe, left: 0 } },
      { ...base, spot: { ...base.spot, done: 12 } },
      { ...base, spot: { ...base.spot, seed: 78 } },
      { ...base, destination: "shop" },
      { ...base, light: 640 },
      { ...base, light: null },
      { ...base, clock: "10:16" },
    ];
    for (const input of changed) expect(parkedKey(input), JSON.stringify(input)).not.toBe(key);
  });

  it("парковка пункту з того самого зерна — з кешу: той самий перелік машин і те саме своє місце", () => {
    const cars = lotCars(4242);
    expect(lotCars(4242)).toBe(cars);
    expect(ownSlot(4242)).toBe(ownSlot(4242));
    // Інше зерно — інша парковка, а повернення до першого — знову та сама.
    lotCars(4243);
    expect(lotCars(4242)).toEqual(cars);
  });
});
