// Ласощі після неприємного (§7): повертають частину любові, утраченої саме через неприємне від персонажа (ліки, ветеринар,
// купання), — а не через брудний лоток чи день без взаємодії: там персонаж котові нічого не зробив.

import { describe, expect, it } from "vitest";

import { addCarrier, releaseCats, seatCat, tickCaged } from "../src/sim/carriers";
import { closeCatDay, createCat, idleAct, offend, changeLove, sinceOffense, traitLevel } from "../src/sim/cat";
import { giveTreat } from "../src/sim/care";
import { CARRIER, DIRTY_LITTER, LOVE, MEDICINE, SHOO, TREATS, VET } from "../src/sim/config";
import { vetExam } from "../src/sim/destinations";
import { goHome, newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { startTrip } from "../src/sim/trips";
import type { Cat, Save } from "../src/sim/types";
import { driveSafely, hours, recordEvents, standAt, withCatCorner } from "./helpers";

function game(): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 4 }));
  save.current.modifiers.day = null;
  save.current.modifiers.week = null;
  save.current.minute = hours(12);
  save.current.home.supplies.treats.cheap = 5;
  return save;
}

function withCat(save: Save): Cat {
  const cat = createCat(save.current, createRng(2), { source: "shelter", ageWeeks: 20, at: { x: 9.5, y: 8.5 } });
  cat.traits = [];
  cat.arrivedDay = -10;
  cat.love = 50;
  cat.act = idleAct(30);
  addCat(save.current, cat);
  // Без «Відданості», «Образливості» й «Мстивості» любов змінюється рівно на задане, а ласощі повертають `TREATS.refund`.
  for (const group of ["devotion", "touchy", "vengeful"]) expect(traitLevel(cat, group)).toBe(0);
  return cat;
}

/** Скільки любові дали ласощі коту на руках. */
function treat(save: Save, cat: Cat): number {
  save.current.character.held = { kind: "cat", cat: cat.id };
  const before = cat.love;
  expect(giveTreat(save.current, "cheap", createRng(1))).toBe(true);
  save.current.character.held = null;
  return cat.love - before;
}

describe("ласощі після неприємного (§7)", () => {
  it("після брудного лотка ласощі дають лише своє: повертати нічого", () => {
    const save = game();
    const cat = withCat(save);
    changeLove(save.current, cat, DIRTY_LITTER.love, "брудний лоток");
    expect(cat.love).toBe(50 + DIRTY_LITTER.love);
    expect(treat(save, cat)).toBeCloseTo(TREATS.love, 9);
  });

  it("після дня без взаємодії ласощі дають лише своє: повертати нічого", () => {
    const save = game();
    const cat = withCat(save);
    closeCatDay(save.current, cat);
    expect(cat.love).toBe(50 + LOVE.noInteractionPerDay);
    expect(treat(save, cat)).toBeCloseTo(TREATS.love, 9);
  });

  it("після ветеринара — половина саме тієї втрати, хоч потім був і брудний лоток, і день без взаємодії", () => {
    const save = game();
    const cat = withCat(save);
    offend(save.current, cat, VET.love, "ветеринар");
    expect(cat.love).toBe(50 + VET.love);
    changeLove(save.current, cat, DIRTY_LITTER.love, "брудний лоток");
    closeCatDay(save.current, cat);
    expect(treat(save, cat)).toBeCloseTo(TREATS.love + TREATS.refund * -VET.love, 9);
    // Повертають раз: наступні ласощі — лише свої.
    expect(treat(save, cat)).toBeCloseTo(TREATS.love, 9);
  });

  it("після поїздки до ветеринара — щойно вдома: неприємне в поїздці рахується з повернення (§9.12 «Образа»)", () => {
    const save = game();
    save.current.character.money = 1000;
    const cat = withCat(save);
    expect(traitLevel(cat, "vet")).toBe(0);
    standAt(save, "door");
    save.current.character.held = { kind: "cat", cat: cat.id };
    expect(startTrip(save.current, "vet")).toBe(true);
    driveSafely(save);
    expect(vetExam(save.current)).not.toBeNull();
    expect(cat.love).toBe(50 + VET.love);
    goHome(save);
    expect(save.current.trip).toBeNull();
    expect(cat.away).toBeNull();
    expect(treat(save, cat)).toBeCloseTo(TREATS.love + TREATS.refund * -VET.love, 9);
  });

  it("кілька образ за годину — ласощі повертають частку всіх; давнішу за `TREATS.hurtMinutes` — ні", () => {
    const save = game();
    const cat = withCat(save);
    offend(save.current, cat, SHOO.love, "прогнали з місця");
    save.current.minute += 10;
    offend(save.current, cat, MEDICINE.love, "ліки");
    expect(treat(save, cat)).toBeCloseTo(TREATS.love + TREATS.refund * -(SHOO.love + MEDICINE.love), 9);
    expect(treat(save, cat)).toBeCloseTo(TREATS.love, 9);

    // Перша образа вже поза вікном, друга — ще в ньому: повертається лише друга.
    offend(save.current, cat, SHOO.love, "прогнали з місця");
    save.current.minute += TREATS.hurtMinutes - 10;
    offend(save.current, cat, MEDICINE.love, "ліки");
    save.current.minute += 20;
    expect(treat(save, cat)).toBeCloseTo(TREATS.love + TREATS.refund * -MEDICINE.love, 9);
  });

  it("неприємне в поїздці — усе з повернення додому, а образа вдома перед довгою поїздкою вже минула", () => {
    const save = game();
    save.current.character.money = 1000;
    const cat = withCat(save);
    offend(save.current, cat, SHOO.love, "прогнали з місця");
    standAt(save, "door");
    save.current.character.held = { kind: "cat", cat: cat.id };
    expect(startTrip(save.current, "vet")).toBe(true);
    driveSafely(save);
    expect(vetExam(save.current)).not.toBeNull();
    offend(save.current, cat, MEDICINE.love, "ліки");
    goHome(save);
    expect(cat.away).toBeNull();
    expect(treat(save, cat)).toBeCloseTo(TREATS.love + TREATS.refund * -(VET.love + MEDICINE.love), 9);
  });

  /** Кіт, якого довели до стресу в переносці вдома й випустили. */
  function stressedInCarrier(save: Save, cat: Cat): void {
    addCarrier(save.current.home, "cheap");
    save.current.character.held = { kind: "cat", cat: cat.id };
    expect(seatCat(save.current, cat)).toBe(true);
    const rng = createRng(1);
    for (let i = 0; i < 130; i++) tickCaged(save.current, cat, 1, rng, true);
    const love = cat.love;
    releaseCats(save.current);
    expect(cat.act.kind).toBe("hide");
    expect(cat.love).toBeCloseTo(love + CARRIER.offense, 9);
    expect(sinceOffense(save.current, cat)).toBe(0);
  }

  it("стрес у переносці вдома — образа, але ласощі цієї втрати не повертають", () => {
    const save = game();
    const cat = withCat(save);
    stressedInCarrier(save, cat);
    expect(treat(save, cat)).toBeCloseTo(TREATS.love, 9);
    // Образа лишилася: кіт без «Прощає за ласощі» від ласощів не відтає.
    expect(sinceOffense(save.current, cat)).toBe(0);
  });

  it("переноска не забирає в ласощів те, що вони повертають за іншу образу", () => {
    const save = game();
    const cat = withCat(save);
    offend(save.current, cat, SHOO.love, "прогнали з місця");
    stressedInCarrier(save, cat);
    expect(treat(save, cat)).toBeCloseTo(TREATS.love + TREATS.refund * -SHOO.love, 9);
  });

  it("«Прощає за ласощі» після переноски від ласощів відтає й муркоче, але любові за неї не повертає", () => {
    const save = game();
    const cat = withCat(save);
    cat.traits = [{ group: "vengeful", level: -1, seen: 0, known: false }];
    stressedInCarrier(save, cat);
    const { events, stop } = recordEvents();
    expect(treat(save, cat)).toBeCloseTo(TREATS.love, 9);
    stop();
    expect(events.some((e) => e.type === "purr" && e.cat === cat.id)).toBe(true);
    expect(sinceOffense(save.current, cat)).toBeNull();
  });
});
