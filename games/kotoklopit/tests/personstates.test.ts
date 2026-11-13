// Стани персонажа (§8.4): панель показує їх іконками, профіль телефона — іконкою, назвою й описом; ліки біля хвороб — і в персонажа
// (§6.5), і в картці кота (§9.5).

import { describe, expect, it } from "vitest";

import { actionSpeed, glitchChance } from "../src/sim/body";
import { createCat } from "../src/sim/cat";
import { statCeiling, stinks } from "../src/sim/character";
import { diseaseMedicine, dosedToday, fallIll } from "../src/sim/diseases";
import { newGame } from "../src/sim/game";
import { hygieneFactor } from "../src/sim/household";
import { canDashWhenIll, fallIllPerson, illnessSpeed } from "../src/sim/illness";
import { moveFactor, unpleasantFactor, workSanityFactor } from "../src/sim/modifiers";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { absoluteMinute } from "../src/sim/time";
import type { GameState } from "../src/sim/types";
import { hourlyRate, positionOf } from "../src/sim/work";
import { DIFFICULTY, HUNGER_HEALTH_THRESHOLD, LOW_STAT, MINUTES_PER_HOUR, STAT_MAX } from "../src/sim/config";
import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { personStateAbout, personStateTitle } from "../src/texts";
import { catFacts } from "../src/ui/cards";
import { PANEL_STATE_SLOTS, panelStates, panelStatesReader, personStates, type PersonStateId } from "../src/view/personstates";
import { PERSON_STATE_ICONS } from "../src/view/symbols";
import { hours } from "./helpers";

const game = () => newGame({ address: "she", difficulty: "normal", seed: 4 }).current;

const dirty = (state: GameState): void => {
  state.home.clothes = 0;
  state.home.dirtyClothes = true;
};
const working = (state: GameState): void => {
  state.character.activity = { kind: "work", minutes: 0, money: 0, reputation: 0, sanity: 0 };
};
const hourNow = (state: GameState): number => Math.floor(absoluteMinute(state.day, state.minute) / MINUTES_PER_HOUR);
/** Персонаж посеред вітальні, безлад — поруч на очах чи в спальні. */
const mess = (state: GameState, room: "living" | "bedroom"): void => {
  Object.assign(state.character.body, { x: 11.5, y: 8.5 });
  state.home.messes.push({ id: 100, kind: "vomit", x: room === "living" ? 9.5 : 3.5, y: room === "living" ? 8.5 : 3.5, cat: null });
};

describe("стани персонажа (§8.4)", () => {
  it("безробіття й хвороби — стани; без них — порожньо", () => {
    const state = game();
    expect(personStates(state)).toEqual([]);
    state.job.unemployed = true;
    fallIllPerson(state, "cold");
    fallIllPerson(state, "injury");
    expect(personStates(state)).toEqual(["cold", "injury", "jobSearch"]);
  });

  it("недосип і «виспався» — за швидкістю після сну; «чудово виспався» — та сама подушка з ✓", () => {
    const state = game();
    state.character.sleepSpeed = -0.1;
    expect(personStates(state)).toContain("sleepDebt");
    state.character.sleepSpeed = 0.01;
    expect(personStates(state)).toContain("rested");
    state.character.sleepSpeed = 1;
    expect(personStates(state)).toContain("wellRested");
    expect(PERSON_STATE_ICONS.wellRested).toEqual({ icon: PERSON_STATE_ICONS.rested.icon, mark: "ok" });
  });

  it("усе, що діє на персонажа, — стан: показник на межі, брудний одяг, «Пригніченість», день і тиждень, оточення", () => {
    const cases: [PersonStateId, (state: GameState) => void][] = [
      ["weak", (s) => (s.character.stats.health = LOW_STAT - 1)],
      ["hungry", (s) => (s.character.stats.satiety = LOW_STAT - 1)],
      ["stench", (s) => (s.character.stats.hygiene = LOW_STAT - 1)],
      ["dizzy", (s) => (s.character.stats.sanity = LOW_STAT - 1)],
      ["dirtyClothes", dirty],
      ["depressed", (s) => (s.character.depressed = true)],
      ["vigor", (s) => (s.modifiers.day = "vigor")],
      ["vigor", (s) => (s.modifiers.week = "human-prevention")],
      ["heat", (s) => (s.modifiers.day = "heat")],
      ["heat", (s) => (s.modifiers.week = "heat-wave")],
      ["chill", (s) => (s.modifiers.day = "cold")],
      ["chill", (s) => (s.modifiers.week = "cold-snap")],
      ["renovation", (s) => (s.modifiers.day = "renovation")],
      ["neighborsAway", (s) => (s.modifiers.day = "neighbors-away")],
      ["quarterlyReport", (s) => (s.modifiers.week = "quarterly-report")],
      ["interestingProject", (s) => (s.modifiers.week = "fun-project")],
      ["fur", (s) => (s.home.tufts = [0])],
      ["mess", (s) => mess(s, "living")],
      ["meowing", (s) => (working(s), (s.character.meowNoise = { hour: hourNow(s), lost: 1 }))],
    ];
    for (const [id, apply] of cases) {
      const state = game();
      state.minute = hours(12);
      expect(personStates(state), id).not.toContain(id);
      apply(state);
      expect(personStates(state), id).toContain(id);
    }
  });

  it("стан — лише поки ефект діє: показник рівно на межі, ремонт поза годинами сусідів, звіт у безробітного, безлад не на очах", () => {
    const state = game();
    state.minute = hours(12);
    for (const stat of ["health", "satiety", "hygiene", "sanity"] as const) state.character.stats[stat] = LOW_STAT;
    expect(personStates(state)).toEqual([]);
    // Ремонт чути лише в робочі години сусідів.
    state.modifiers.day = "renovation";
    state.minute = hours(20);
    expect(personStates(state)).toEqual([]);
    state.modifiers.day = null;
    // Звітний тиждень безробітного не стосується.
    state.modifiers.week = "quarterly-report";
    state.job.unemployed = true;
    expect(personStates(state)).toEqual(["jobSearch"]);
    state.modifiers.week = null;
    state.job.unemployed = false;
    // Безлад в іншій кімнаті й з душової кабіни не дратує.
    mess(state, "bedroom");
    expect(personStates(state)).toEqual([]);
    state.home.messes = [];
    mess(state, "living");
    state.character.activity = { kind: "use", target: "shower", progress: 0, inside: true };
    expect(personStates(state)).toEqual([]);
    // Кіт нявчав цієї години, але персонаж уже не працює.
    state.character.activity = null;
    state.home.messes = [];
    state.character.meowNoise = { hour: hourNow(state), lost: 1 };
    expect(personStates(state)).toEqual([]);
    // Нявчав минулої години — уже тихо.
    working(state);
    state.character.meowNoise = { hour: hourNow(state) - 1, lost: 1 };
    expect(personStates(state)).toEqual([]);
  });

  it("порядок панелі: показники на межі, хвороби, «Пригніченість» і одяг, сон, оточення, важке дня й тижня, обставини, добре", () => {
    const state = game();
    state.minute = hours(12);
    for (const stat of ["health", "satiety", "hygiene", "sanity"] as const) state.character.stats[stat] = LOW_STAT - 1;
    for (const illness of ["cold", "injury", "exhaustion"] as const) fallIllPerson(state, illness);
    state.character.depressed = true;
    dirty(state);
    state.character.sleepSpeed = -0.1;
    mess(state, "living");
    state.home.tufts = [0];
    working(state);
    state.character.meowNoise = { hour: hourNow(state), lost: 1 };
    state.modifiers = { ...state.modifiers, day: "renovation", week: "heat-wave" };
    state.job.unemployed = true;
    expect(personStates(state)).toEqual([
      "weak",
      "hungry",
      "stench",
      "dizzy",
      "cold",
      "injury",
      "exhaustion",
      "depressed",
      "dirtyClothes",
      "sleepDebt",
      "mess",
      "fur",
      "meowing",
      "heat",
      "renovation",
      "jobSearch",
    ]);
    // Добре — наприкінці: спершу видно те, що шкодить.
    const good = game();
    good.minute = hours(12);
    good.character.sleepSpeed = 1;
    good.character.stats.health = LOW_STAT - 1;
    good.modifiers = { ...good.modifiers, day: "vigor", week: "fun-project" };
    expect(personStates(good)).toEqual(["weak", "wellRested", "vigor", "interestingProject"]);
  });

  it("невидимих ефектів немає: у кожному сценарії все, що діє на персонажа, має стан", () => {
    const effects: [string, (state: GameState) => boolean, PersonStateId[]][] = [
      ["швидкість дій", (s) => actionSpeed(s) !== 1, ["weak", "hungry", "drowsy", "sleepDebt", "rested", "wellRested"]],
      ["голод забирає здоров'я", (s) => s.character.stats.satiety < HUNGER_HEALTH_THRESHOLD, ["hungry"]],
      ["швидкість руху", (s) => moveFactor(s) !== 1 || illnessSpeed(s) !== 1, ["vigor", "cold", "injury"]],
      ["ривка немає", (s) => s.character.stats.health < LOW_STAT || !canDashWhenIll(s), ["weak", "cold", "injury"]],
      ["збої керування", (s) => glitchChance(s) > 0, ["dizzy"]],
      ["сморід", stinks, ["stench"]],
      ["гігієна падає інакше", (s) => hygieneFactor(s) !== 1, ["dirtyClothes", "fur", "heat", "chill"]],
      ["межа гігієни", (s) => statCeiling(s, "hygiene") < STAT_MAX, ["dirtyClothes"]],
      ["межа здорового глузду", (s) => statCeiling(s, "sanity") < STAT_MAX, ["depressed"]],
      ["неприємні справи", (s) => unpleasantFactor(s) !== 1, ["renovation", "neighborsAway"]],
      ["робота й здоровий глузд", (s) => !s.job.unemployed && workSanityFactor(s) !== 1, ["quarterlyReport", "interestingProject"]],
    ];
    expect(Object.keys(FILE_SCENARIOS).length).toBeGreaterThan(50);
    for (const [name, scenario] of Object.entries(FILE_SCENARIOS)) {
      const state = applyScenario(scenario).current;
      const shown = personStates(state);
      for (const [effect, acts, shows] of effects) {
        if (acts(state)) expect(shown.some((id) => shows.includes(id)), `${name}: ${effect}`).toBe(true);
      }
    }
  });

  it("на панелі — вісім кружечків: коли станів більше, останній каже, скільки ще", () => {
    expect(PANEL_STATE_SLOTS).toBe(8);
    const ids: PersonStateId[] = ["weak", "hungry", "stench", "dizzy", "cold", "injury", "exhaustion", "depressed", "dirtyClothes", "sleepDebt"];
    expect(panelStates(ids.slice(0, 3))).toEqual({ shown: ids.slice(0, 3), more: 0 });
    expect(panelStates(ids.slice(0, 8))).toEqual({ shown: ids.slice(0, 8), more: 0 });
    expect(panelStates(ids.slice(0, 9))).toEqual({ shown: ids.slice(0, 7), more: 2 });
    expect(panelStates(ids)).toEqual({ shown: ids.slice(0, 7), more: 3 });
  });

  it("панель питає стани щокадру, а перелік рахується раз на ігрову хвилину: доти й без змін — той самий об'єкт", () => {
    const read = panelStatesReader();
    const state = game();
    const first = read(state);
    expect(first).toMatchObject({ shown: [], more: 0 });
    // Та сама хвилина — без перерахунку, хоч стан уже інший.
    state.character.stats.hygiene = LOW_STAT - 1;
    expect(read(state)).toBe(first);
    state.minute += 1;
    const second = read(state);
    expect(second.shown).toEqual(["stench"]);
    // Нова хвилина, а стани ті самі — той самий об'єкт: панелі нема чого перемальовувати.
    state.minute += 1;
    expect(read(state)).toBe(second);
    // Інша гра (переграний день, сценарій) — одразу, хоч хвилина та сама.
    const other = game();
    other.minute = state.minute;
    expect(read(other).shown).toEqual([]);
  });

  it("кожен стан має іконку, назву й опис без чисел; форми — за звертанням", () => {
    const state = game();
    for (const id of Object.keys(PERSON_STATE_ICONS) as PersonStateId[]) {
      for (const address of ["he", "she"] as const) {
        state.character.address = address;
        expect(personStateTitle(id, address), id).toMatch(/^\S/);
        expect(personStateTitle(id, address), id).not.toMatch(/[[\]|]/);
        expect(personStateAbout(state, id), id).toMatch(/^\S/);
        expect(personStateAbout(state, id), id).not.toMatch(/[[\]|\d]/);
      }
    }
    expect(personStateTitle("rested", "he")).toBe("Виспався");
    expect(personStateTitle("cold", "she")).toBe("Застуда");
    expect(personStateTitle("stench", "she")).toBe("Сморід");
    expect(personStateTitle("dizzy", "she")).toBe("Запаморочення");
  });

  it("«Запаморочення» під захистом першого тижня — без збоїв керування: опис про них мовчить (§8.3)", () => {
    const state = game();
    state.character.stats.sanity = LOW_STAT - 1;
    expect(glitchChance(state)).toBe(0);
    const calm = personStateAbout(state, "dizzy");
    state.day = 30;
    expect(glitchChance(state)).toBeGreaterThan(0);
    expect(personStateAbout(state, "dizzy")).not.toBe(calm);
  });

  it("сценарій «Усі стани персонажа» — стани, що бувають разом; на панелі — сім і «ще»", () => {
    const scenario = FILE_SCENARIOS["person-states"];
    if (!scenario) throw new Error("немає сценарію");
    const states = personStates(applyScenario(scenario).current);
    expect(states).toEqual([
      "weak",
      "hungry",
      "stench",
      "dizzy",
      "cold",
      "injury",
      "exhaustion",
      "depressed",
      "dirtyClothes",
      "drowsy",
      "sleepDebt",
      "fur",
      "noPower",
      "heat",
      "jobSearch",
      "sickLeave",
    ]);
    expect(panelStates(states)).toEqual({ shown: states.slice(0, 7), more: 9 });
  });

  it("ставка за годину — посада × заробіток складності, без поправок дня", () => {
    const state = game();
    expect(hourlyRate(state)).toBe(positionOf(state).pay * DIFFICULTY.normal.earnings);
  });
});

describe("ліки котові біля хвороби в картці (§9.5)", () => {
  it("на що діють ліки: курс таблеток чи крапель, щоденна таблетка хронічної; дієту й ветеринара — ні", () => {
    expect(diseaseMedicine("cold")).toBe("pills");
    expect(diseaseMedicine("fleas")).toBe("drops");
    expect(diseaseMedicine("heart")).toBe("pills");
    expect(diseaseMedicine("stomach")).toBeNull();
    expect(diseaseMedicine("injury")).toBeNull();
  });

  it("«таблетку сьогодні дано» — лише біля відомої хвороби, на яку вона діє, і лише сьогоднішня доза", () => {
    const state = game();
    const cat = createCat(state, createRng(2), { source: "shelter", ageWeeks: 30, at: { x: 9.5, y: 8.5 } });
    addCat(state, cat);
    fallIll(state, cat, "cold");
    fallIll(state, cat, "fleas");
    for (const d of cat.diseases) d.known = true;
    const line = (): string => catFacts(state, cat).lines.find((l) => l.startsWith("Хвороби")) ?? "";
    expect(line()).not.toContain("сьогодні дано");
    // Учора — не сьогодні.
    cat.lastDose = { pills: absoluteMinute(state.day - 1, 20 * 60) };
    expect(dosedToday(state, cat, "pills")).toBe(false);
    expect(line()).not.toContain("сьогодні дано");
    cat.lastDose = { pills: absoluteMinute(state.day, state.minute) };
    expect(dosedToday(state, cat, "pills")).toBe(true);
    expect(line()).toContain("(таблетку сьогодні дано)");
    // Краплі від бліх не давали — біля бліх нічого.
    expect(line().match(/сьогодні дано/g)).toHaveLength(1);
    // Невідома хвороба — без позначки.
    for (const d of cat.diseases) d.known = false;
    expect(line()).toBe("");
  });
});
