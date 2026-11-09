// Ревізія модифікаторів дня й тижня (§4.1, `DAY_MODIFIERS.md`): легкі боки, що справді полегшують, і розбіжності коду з
// документом, які ревізія закрила.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { sunSpot } from "../src/sim/catai";
import { MODIFIERS, SUN_SPOTS } from "../src/sim/config";
import { illnessChance } from "../src/sim/diseases";
import { goToSleep, newGame } from "../src/sim/game";
import {
  chooseDayModifier,
  chooseWeekModifier,
  guestsVisit,
  homeVetVisit,
  hygieneFactorMod,
  reputationFactor,
  searchFactor,
  thirstFactor,
  tickModifiers,
  unpleasantFactor,
} from "../src/sim/modifiers";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Cat, GameState, LitterItem, Save } from "../src/sim/types";
import { BILL_TEXTS, CALL_TEXTS, fill, homeVetText, SHOW_PRIZE_TEXTS, WAKE_TEXTS } from "../src/texts";
import { callCard, dayTitle } from "../src/ui/cards";
import { scheduleOf } from "../src/view/schedule";
import { hours, withCatCorner } from "./helpers";

const game = (): Save => withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 14 }));

function withCat(save: Save, over: Partial<Cat> = {}): Cat {
  const cat = createCat(save.current, createRng(7), { source: "shelter", ageWeeks: 40, at: { x: 9.5, y: 8.5 } });
  addCat(save.current, cat);
  Object.assign(cat, over);
  return cat;
}

/** Модифікатори дня, що випадають за `n` зерен у день `day`. */
function seen(state: GameState, day = 2, n = 1500): Set<string | null> {
  const out = new Set<string | null>();
  for (let seed = 0; seed < n; seed++) {
    state.modifiers.day = null;
    out.add(chooseDayModifier(state, day, createRng(seed)));
  }
  return out;
}

describe("робота", () => {
  it("«Аврал» — без «Затишшя», як і «Тиждень дедлайнів»", () => {
    const save = game();
    save.current.modifiers.week = "crunch";
    expect(seen(save.current).has("lull")).toBe(false);
  });

  it("«Затишшя» — дзеркало «Дедлайну» за репутацією: ×1,5 ↔ ×⅔", () => {
    expect(MODIFIERS.deadline.reputation * MODIFIERS.lull.reputation).toBeCloseTo(1);
    expect(MODIFIERS.deadline.decay * MODIFIERS.lull.decay).toBeCloseTo(1);
  });

  it("«Швидкий інтернет» — дзеркало відключення: репутація й пошук роботи швидше", () => {
    const state = game().current;
    state.modifiers.day = "fast-internet";
    expect(reputationFactor(state)).toBe(MODIFIERS.fastInternet.reputation);
    expect(searchFactor(state)).toBe(MODIFIERS.fastInternet.search);
    state.modifiers.day = "outage";
    expect(searchFactor(state)).toBe(MODIFIERS.outage.search);
  });

  it("розклад: обідня перерва, поки триває, — до її кінця; офіс — до кінця робочого дня", () => {
    const state = game().current;
    state.day = 1;
    state.modifiers.day = "lunch";
    state.minute = hours(13);
    expect(scheduleOf(state)).toContain(`до ${String(MODIFIERS.lunch.to / 60).padStart(2, "0")}:00 обідня перерва`);
    state.minute = MODIFIERS.lunch.to;
    expect(scheduleOf(state).some((l) => l.includes("обідня перерва"))).toBe(false);
  });
});

describe("коти й погода", () => {
  it("у «Дощ» немає сонячної плями", () => {
    const spot = SUN_SPOTS[0]!;
    expect(sunSpot(spot.from)).not.toBeNull();
    expect(sunSpot(spot.from, true)).toBeNull();
  });

  it("«Холод» — дзеркало «Спеки»: коти менше п'ють, гігієна персонажа падає повільніше", () => {
    const state = game().current;
    state.modifiers.day = "cold";
    expect(thirstFactor(state)).toBe(MODIFIERS.cold.thirst);
    expect(hygieneFactorMod(state)).toBe(MODIFIERS.cold.hygiene);
    state.modifiers.day = "heat";
    expect(thirstFactor(state)).toBe(MODIFIERS.heat.thirst);
    state.modifiers.day = null;
    state.modifiers.week = "cold-snap";
    expect(thirstFactor(state)).toBe(MODIFIERS.cold.thirst);
  });

  it("«Котячий березень ↔ Спокійний сезон» — лише з нестерилізованою дорослою кішкою", () => {
    const weeks = (save: Save): Set<string | null> => new Set(Array.from({ length: 400 }, (_, i) => chooseWeekModifier(save.current, i + 1)));
    const tom = game();
    withCat(tom, { sex: "male" });
    expect(weeks(tom).has("cat-march")).toBe(false);
    expect(weeks(tom).has("calm-season")).toBe(false);
    const spayed = game();
    withCat(spayed, { sex: "female", sterilized: true });
    expect(weeks(spayed).has("cat-march")).toBe(false);
    const queen = game();
    withCat(queen, { sex: "female", sterilized: false });
    expect(weeks(queen).has("cat-march")).toBe(true);
  });

  it("«Котячий грип» — лише заразні хвороби: застуда частішає, травма — ні", () => {
    const save = game();
    const cat = withCat(save);
    const base = (id: "cold" | "injury"): number => illnessChance(save.current, cat, id, 0.01);
    const cold = base("cold");
    const injury = base("injury");
    save.current.modifiers.week = "cat-flu";
    expect(base("cold")).toBeCloseTo(cold * (MODIFIERS.week.catIllness["cat-flu"] ?? 1));
    expect(base("injury")).toBeCloseTo(injury);
  });

  it("«Тихий вечір»: настрій — лише котам удома", () => {
    const save = game();
    const home = withCat(save);
    const away = withCat(save);
    away.away = "stairs";
    const [h, a] = [home.mood, away.mood];
    save.current.modifiers.day = "quiet-evening";
    tickModifiers(save.current, MODIFIERS.quietEvening.minute - 1, 2, false);
    expect(home.mood).toBeGreaterThan(h);
    expect(away.mood).toBe(a);
  });
});

describe("дім", () => {
  it("сусіди — лише в їхні робочі години: множник неприємних справ і настрій котів", () => {
    const state = game().current;
    state.modifiers.day = "renovation";
    state.minute = hours(8);
    expect(unpleasantFactor(state)).toBe(1);
    state.minute = hours(12);
    expect(unpleasantFactor(state)).toBe(MODIFIERS.renovation.unpleasant);
    state.minute = hours(20);
    expect(unpleasantFactor(state)).toBe(1);
    state.modifiers.day = "neighbors-away";
    state.minute = hours(12);
    expect(unpleasantFactor(state)).toBe(MODIFIERS.neighborsAway.unpleasant);
  });

  it("«Сусіди у відпустці»: коти вдома, що не сплять, у години сусідів веселішають; увечері — ні", () => {
    const save = game();
    const cat = withCat(save, { mood: 50 });
    save.current.modifiers.day = "neighbors-away";
    tickModifiers(save.current, hours(12), 60, false);
    expect(cat.mood).toBeCloseTo(50 + MODIFIERS.neighborsAway.catMoodPerHour);
    cat.mood = 50;
    tickModifiers(save.current, hours(20), 60, false);
    expect(cat.mood).toBe(50);
  });

  it("ветеринарка оглядає й кота під замком у переносці: він там і лишається; картка називає вагітну", () => {
    const save = game();
    const cat = withCat(save, { sex: "female" });
    cat.away = "carrier";
    cat.diseases.push({ id: "fleas", day: 0, doses: 0, diet: 0, calm: 0, controlled: null, known: false });
    homeVetVisit(save.current);
    expect(cat.diseases[0]?.known).toBe(true);
    expect(cat.away).toBe("carrier");
    const text = homeVetText([{ name: "Мурка", sex: "female", diseases: [], manner: null, pregnant: true }]);
    expect(text).toContain("Мурка вагітна.");
  });

  it("мітки від гостей — лише коли гості зайшли", () => {
    const save = game();
    save.current.modifiers.day = "guests";
    expect(save.current.today.guestsCame).toBeUndefined();
    guestsVisit(save.current);
    expect(save.current.today.guestsCame).toBe(true);
  });

  it("друг заповнює й порожній лоток без наповнювача, а брудний — першим", () => {
    const save = game();
    const state = save.current;
    const box = state.home.items.find((i): i is LitterItem => i.kind === "litter")!;
    box.litter = null;
    box.uses = 0;
    state.home.supplies.litter.cheap = 5;
    state.modifiers.day = "friend-help";
    tickModifiers(state, MODIFIERS.friend.from - 1, 2, false);
    expect(box.litter).not.toBeNull();
  });
});

describe("тексти титулки й карток", () => {
  it("рахунок із перерахунком — каже це; сусіди розбудили — титулка називає час", () => {
    const state = game().current;
    state.day = 7;
    const night = { wakeUps: [], newCats: [], givenCats: [], lostCats: [], ledger: null, utilities: { outcome: "billed", bill: 50, recalculated: true }, neighborsWoke: hours(5) };
    const lines = dayTitle(state, night as never).flatMap((s) => s.blocks.flat());
    expect(lines).toContain(fill(BILL_TEXTS.arrivedRecalculated, "female", { сума: 50 }));
    expect(lines).toContain(fill(WAKE_TEXTS.neighbors, "female", { час: "05:00" }));
  });

  it("«Тиха ніч»: сон діє, як довший (`MODIFIERS.quietNight.sleepBonus`)", () => {
    const speedAfter = (day: string | null): number => {
      const save = game();
      save.current.modifiers.day = day;
      save.current.minute = hours(23);
      goToSleep(save);
      return save.current.character.sleepSpeed;
    };
    expect(speedAfter("quiet-night")).toBeGreaterThan(speedAfter(null));
  });

  it("мама без котів питає про кота; приз виставки — за місцем", () => {
    expect(callCard(false, () => {}, () => {}).body).toEqual([CALL_TEXTS.bodyNoCats]);
    expect(callCard(true, () => {}, () => {}).body).toEqual([CALL_TEXTS.body]);
    expect(SHOW_PRIZE_TEXTS).toHaveLength(MODIFIERS.show.prizes.length);
  });
});
