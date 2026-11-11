// Розклад в інтерфейсі (§8.4): спершу важливе, у межах групи — за часом; кур'єр — один рядок.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { MODIFIERS } from "../src/sim/config";
import { newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { absoluteMinute } from "../src/sim/time";
import type { GameState } from "../src/sim/types";
import { scheduleOf } from "../src/view/schedule";

/** Робочий день (вівторок), без модифікатора, о `hour`. */
function day(hour: number, modifier: string | null = null): GameState {
  const state = newGame({ address: "she", difficulty: "normal", seed: 1 }).current;
  state.modifiers.day = modifier;
  state.day = 1;
  state.minute = hour * 60;
  return state;
}

function courier(state: GameState, hour: number): void {
  state.home.deliveries.push({ id: state.home.deliveries.length + 1, product: "food", quality: "cheap", at: absoluteMinute(state.day, 0) + hour * 60 });
}

/** Те, що видно на панелі: два перші рядки. */
const panel = (state: GameState): string[] => scheduleOf(state).slice(0, 2);

describe("розклад дня (§8.4)", () => {
  it("кілька замовлень у дорозі — один рядок кур'єра з найближчим часом; летючка вище за нього", () => {
    const state = day(8);
    const today = absoluteMinute(state.day, 0);
    state.home.deliveries.push(
      { id: 1, product: "food", quality: "cheap", at: today + 16 * 60 },
      { id: 2, product: "litter", quality: "cheap", at: today + 9 * 60 + 30 },
      { id: 3, product: "food", quality: "premium", at: today + 9 * 60 + 30 },
    );
    const schedule = scheduleOf(state);
    expect(schedule.filter((line) => line.includes("кур'єр"))).toEqual(["≈09:30 кур'єр"]);
    expect(schedule.findIndex((line) => line.includes("летючка"))).toBeLessThan(schedule.indexOf("≈09:30 кур'єр"));
  });

  it("робота в розкладі лише до 09:00: коли вона вже йде, вона не «запланована» (загальна ревізія 2026-10-29)", () => {
    expect(scheduleOf(day(8))).toContain("09:00 робота");
    expect(scheduleOf(day(9.5)).some((line) => line.includes("робота"))).toBe(false);
  });

  it("події, за пропуск яких є штраф, — на панелі першими, а кур'єр і пакунок поступаються (загальна ревізія 2026-10-29)", () => {
    // Нарада о 14:00 і кур'єр ≈12:00 — раніше на панелі були «робота» й кур'єр, а наради не було.
    const meeting = day(11, "meeting");
    courier(meeting, 12);
    expect(panel(meeting)).toEqual(["14:00 нарада", "≈12:00 кур'єр"]);
    // Перевірка ОСББ у робочий день о 09:30 — летючка й перевірка, а не «робота».
    expect(panel(day(9.5, "inspection"))).toEqual(["10:00 летючка", "15:00 перевірка ОСББ"]);
    // Ветеринарка з пакунком під дверима — летючка й ветеринарка; пакунок і так видно над дверима.
    const homeVet = day(9.5, "home-vet");
    homeVet.home.porch.push({ id: 9, product: "food", quality: "cheap", at: 0 });
    expect(panel(homeVet)).toEqual(["10:00 летючка", "11:00 ветеринарка"]);
    // Збори в офісі з кур'єром уранці — «до 18:00 офіс» на панелі.
    const office = day(8, "office");
    courier(office, 9);
    expect(panel(office)).toEqual(["10:00 летючка", "до 18:00 офіс"]);
    expect(scheduleOf(office).slice(2)).toEqual(["09:00 робота", "≈09:00 кур'єр"]);
  });

  it("виставка котів (§4.1): напередодні — «завтра виставка котів» після подій дня, у її день — «виставка котів» першим рядком, поки не взяли участі", () => {
    const sunday = MODIFIERS.show.everyWeeks * 7 - 1;
    const withCat = (state: GameState): GameState => {
      addCat(state, createCat(state, createRng(3), { source: "shelter", ageWeeks: 30 }));
      return state;
    };
    // Субота напередодні, удома є кіт.
    const eve = withCat(day(10));
    eve.day = sunday - 1;
    expect(scheduleOf(eve)).toEqual(["завтра виставка котів"]);
    // Подія сьогоднішнього дня — вище за нагадування.
    eve.modifiers.day = "guests";
    const lines = scheduleOf(eve);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/гості$/);
    expect(lines[1]).toBe("завтра виставка котів");
    // Без кота нагадування немає; за тиждень до виставки й напередодні не тієї неділі — теж.
    const empty = day(10);
    empty.day = sunday - 1;
    expect(scheduleOf(empty)).toEqual([]);
    for (const other of [sunday - 8, sunday - 2, sunday + 6]) {
      const state = withCat(day(10));
      state.day = other;
      expect(scheduleOf(state).some((line) => line.includes("виставка")), `день ${other}`).toBe(false);
    }
    // День виставки: рядок без часу — перший, поки не взяли участі; про «завтра» вже мови немає.
    const show = withCat(day(10, "show"));
    show.day = sunday;
    courier(show, 12);
    expect(scheduleOf(show)[0]).toBe("виставка котів");
    expect(scheduleOf(show).some((line) => line.startsWith("завтра"))).toBe(false);
    show.today.showDone = true;
    expect(scheduleOf(show).some((line) => line.includes("виставка"))).toBe(false);
  });
});
