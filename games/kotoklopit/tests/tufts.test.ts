// Жмути шерсті з'являються по одному біля кота (§8.7, «Жмути шерсті» [Змінено пізніше], рішення автора 2026-11-03: «котяча
// шерсть на підлозі з'являється посеред дня миттєво, що псує враження»): у симуляції — не частіше ніж раз на
// `HOUSEHOLD.tuftEveryMinutes`, на вільному місці, найближчому до кота вдома, уночі так само; на екрані — котиться з-під кота й
// наростає (чисті розрахунки `view/iso/tuftappear.ts`). Поріг 50, число жмутів за шкалою й прибирання — як і раніше.

import { describe, expect, it } from "vitest";

import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { createCat } from "../src/sim/cat";
import { HOUSEHOLD } from "../src/sim/config";
import { advance, deserialize, goToSleep, newGame, serialize } from "../src/sim/game";
import { isWall, roomAt } from "../src/sim/home";
import { FUR_SPOTS, furPerHour, furVisible, nightlyHousehold, tickHousehold, tuftCat, tuftsOf } from "../src/sim/household";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { absoluteMinute } from "../src/sim/time";
import type { Cat, GameState, Save, Vec } from "../src/sim/types";
import { catSpot } from "../src/view/iso/catspot";
import { freshTuft, TUFT_APPEAR, tuftAppearLook, tuftRollFrom } from "../src/view/iso/tuftappear";
import { hours, withCatCorner } from "./helpers";

function game(): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 12 }));
  save.current.modifiers.day = null;
  save.current.modifiers.week = null;
  save.current.minute = hours(10);
  return save;
}

/** Кіт удома в точці `at` (короткошерстий, без рис): лишає шерсть. */
function catAt(state: GameState, at: Vec): Cat {
  const cat = createCat(state, createRng(state.nextId), { source: "shelter", ageWeeks: 30, at });
  cat.traits = [];
  cat.arrivedDay = -10;
  cat.shape.coat = null;
  addCat(state, cat);
  return cat;
}

/**
 * Прожити `minutes` хвилин побуту похвилинно (коти стоять, де стоять). Повертає, на якій хвилині від старту з'являвся кожен
 * новий жмут, і який.
 */
function live(state: GameState, minutes: number): { minute: number; index: number }[] {
  const appeared: { minute: number; index: number }[] = [];
  for (let m = 0; m < minutes; m++) {
    const before = tuftsOf(state).length;
    tickHousehold(state, state.minute, 1);
    for (const index of tuftsOf(state).slice(before)) appeared.push({ minute: m, index });
    state.minute += 1;
  }
  return appeared;
}

const distance = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);

describe("жмути з'являються по одному (§8.7, [Змінено пізніше], рішення автора 2026-11-03)", () => {
  it("на 50 шерсті шість жмутів лягають не разом, а по одному — щонайменше через `tuftEveryMinutes`; без котів — на перших місцях", () => {
    const state = game().current;
    state.home.fur = HOUSEHOLD.dirtyFur;
    const appeared = live(state, 2 * hours(1));
    expect(appeared.map((a) => a.index)).toEqual([0, 1, 2, 3, 4, 5]);
    // Перший — одразу, як шерсть дійшла до 50; далі — по одному.
    expect(appeared[0]?.minute).toBe(0);
    for (let i = 1; i < appeared.length; i++) expect(appeared[i]!.minute - appeared[i - 1]!.minute).toBeGreaterThanOrEqual(HOUSEHOLD.tuftEveryMinutes);
    // Не повільніше, ніж треба: за годину — усі, скільки за шкалою.
    expect(appeared.at(-1)!.minute).toBeLessThanOrEqual(hours(1));
    expect(furVisible(state)).toBe(true);
  });

  it("менше 50 жмутів не з'являється, хоч би скільки часу минуло; понад шкалу — теж ні", () => {
    const state = game().current;
    state.home.fur = HOUSEHOLD.dirtyFur - 0.1;
    expect(live(state, hours(2))).toEqual([]);
    state.home.fur = 60;
    expect(live(state, hours(3))).toHaveLength(7);
  });

  it("новий жмут — на вільному місці, найближчому до кота вдома, і викочується саме з-під нього", () => {
    const state = game().current;
    const cat = catAt(state, { x: 5.6, y: 8.6 });
    state.home.fur = HOUSEHOLD.dirtyFur;
    const appeared = live(state, hours(1));
    const nearest = FUR_SPOTS.map((spot, index) => ({ index, d: distance(spot, cat) })).sort((a, b) => a.d - b.d);
    // Шість найближчих до кота — у вітальні, де й він: стіни між ними немає.
    for (const { index } of nearest.slice(0, 6)) expect(roomAt(FUR_SPOTS[index]!)).toBe("living");
    expect(appeared).toHaveLength(6);
    expect(appeared.map((a) => a.index)).toEqual(nearest.slice(0, 6).map((n) => n.index));
    for (const { index } of appeared) expect(tuftCat(state, index)?.id).toBe(cat.id);
  });

  it("із кількох котів — біля того, до кого місце найближче", () => {
    const state = game().current;
    const near = catAt(state, { x: 4.3, y: 2.9 });
    catAt(state, { x: 9.3, y: 9.6 });
    state.home.fur = HOUSEHOLD.dirtyFur;
    live(state, 1);
    // Спальня (4,1; 2,6) — за 0,36 клітинки від першого кота; до другого найближче місце далі.
    expect(tuftsOf(state)).toEqual([6]);
    expect(tuftCat(state, 6)?.id).toBe(near.id);
  });

  it("жмут не лягає за стіною, коли поруч кота є місце без стіни", () => {
    const state = game().current;
    // Кіт на кухні біля правої стіни: місце у вітальні (15,6; 7,2) ближче за кухонне (14,6; 2,4), але за стіною ряду 5.
    const cat = catAt(state, { x: 18.4, y: 4.3 });
    const living = FUR_SPOTS[4]!;
    const kitchen = FUR_SPOTS[7]!;
    expect(distance(cat, living)).toBeLessThan(distance(cat, kitchen));
    expect(isWall(17, 5)).toBe(true);
    state.home.fur = HOUSEHOLD.dirtyFur;
    live(state, 1);
    expect(tuftsOf(state)).toEqual([7]);
    // З-за стіни жмут не котиться: вигляд покаже, як він проступає на місці.
    expect(tuftCat(state, 4)).toBeNull();
    expect(tuftCat(state, 7)?.id).toBe(cat.id);
  });

  it("кіт на руках лишає шерсть біля персонажа, що його несе, а не там, де його взяли", () => {
    const state = game().current;
    // Кота взяли у вітальні й несуть у ванну купати: його клітинка лишається там, де його взяли, до `putDownCat`.
    const cat = catAt(state, { x: 14.2, y: 8 });
    state.character.held = { kind: "cat", cat: cat.id };
    state.character.body.x = 10.2;
    state.character.body.y = 3.2;
    expect(roomAt(state.character.body)).toBe("bathroom");
    state.home.fur = HOUSEHOLD.dirtyFur;
    live(state, 1);
    // Ванна (9,6; 3,6) — поруч із персонажем, а не (15,6; 7,2) біля того місця, де кота взяли: воно за стіною від персонажа.
    expect(tuftsOf(state)).toEqual([8]);
    expect(roomAt(FUR_SPOTS[8]!)).toBe("bathroom");
    expect(tuftCat(state, 8)?.id).toBe(cat.id);
    expect(tuftCat(state, 4)).toBeNull();
  });

  it("кіт у поїздці, на сходах чи безшерстий жмута не лишає: без інших котів — перше вільне місце, як було", () => {
    for (const setup of [(c: Cat) => (c.away = "trip"), (c: Cat) => (c.away = "stairs"), (c: Cat) => (c.shape.coat = "hairless")]) {
      const state = game().current;
      const cat = catAt(state, { x: 11.6, y: 7.4 });
      setup(cat);
      state.home.fur = HOUSEHOLD.dirtyFur;
      tickHousehold(state, state.minute, 0.1);
      expect(tuftsOf(state)).toEqual([0]);
      expect(tuftCat(state, 0)).toBeNull();
    }
  });

  it("шкала доросла до ще одного жмута одразу після попереднього — новий лише за `tuftEveryMinutes` після нього", () => {
    const state = game().current;
    state.home.fur = 55;
    live(state, 5 * HOUSEHOLD.tuftEveryMinutes + 1);
    expect(tuftsOf(state)).toEqual([0, 1, 2, 3, 4, 5]);
    const sixth = state.home.tuftAt!;
    state.home.fur = 60;
    const late = live(state, HOUSEHOLD.tuftEveryMinutes);
    expect(late.map((a) => a.index)).toEqual([6]);
    expect(state.home.tuftAt! - sixth).toBe(HOUSEHOLD.tuftEveryMinutes);
  });

  it("уночі жмути набираються так само по одному, і до ранку їх стільки, скільки за шкалою", () => {
    const save = game();
    const state = save.current;
    catAt(state, { x: 9.5, y: 8.4 });
    catAt(state, { x: 3.2, y: 2.6 });
    state.home.fur = 60;
    state.minute = hours(23);
    const bed = absoluteMinute(state.day, state.minute);
    goToSleep(save);
    const morning = save.current;
    const target = Math.floor((morning.home.fur / 100) * FUR_SPOTS.length);
    expect(target).toBeGreaterThanOrEqual(7);
    expect(tuftsOf(morning)).toHaveLength(target);
    // Останній ліг уночі, не раніше, ніж мали б лягти сім по одному, — і не вранці всі разом.
    const last = morning.home.tuftAt!;
    expect(last).toBeGreaterThanOrEqual(bed + 6 * HOUSEHOLD.tuftEveryMinutes);
    expect(last).toBeLessThan(absoluteMinute(morning.day, morning.minute));
  });

  it("вранці жмутів не менше, ніж за шкалою, хоч би якою короткою була ніч", () => {
    const state = game().current;
    state.home.fur = 60;
    nightlyHousehold(state, createRng(1));
    expect(tuftsOf(state)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe("жмути й збереження (§8.7, [Змінено пізніше])", () => {
  it("у збереженні, де жмути вже з'являлися по одному, завантаження їх не докладає: далі — по одному", () => {
    const save = game();
    const state = save.current;
    state.home.fur = 60;
    live(state, 1);
    expect(tuftsOf(state)).toEqual([0]);
    const loaded = deserialize(serialize(save)).current;
    expect(tuftsOf(loaded)).toEqual([0]);
    expect(loaded.home.tuftAt).toBe(state.home.tuftAt);
    live(loaded, HOUSEHOLD.tuftEveryMinutes);
    expect(tuftsOf(loaded)).toEqual([0, 1]);
  });

  it("сценарій «Шерсть дійшла до 50» (`scenarios/fur-tufts.json`): жмутів ще немає; за годину гри — шість, по одному, кожен біля кота", () => {
    const scenario = FILE_SCENARIOS["fur-tufts"];
    if (!scenario) throw new Error("немає сценарію");
    const save = applyScenario(scenario);
    const state = save.current;
    expect(tuftsOf(state)).toEqual([]);
    expect(state.home.fur).toBeLessThan(HOUSEHOLD.dirtyFur);
    expect(state.cats).toHaveLength(3);
    for (const cat of state.cats) expect(furPerHour(state, cat), cat.name).toBeGreaterThan(0);
    const seen: { minute: number; index: number }[] = [];
    for (let m = 0; m < hours(1); m++) {
      const before = tuftsOf(save.current).length;
      advance(save, 1);
      for (const index of tuftsOf(save.current).slice(before)) seen.push({ minute: m, index });
    }
    // Перший — за кілька хвилин, щойно шерсть дійшла до 50, — біля Пушка на килимі.
    expect(seen[0]!.minute).toBeLessThan(5);
    expect(tuftCat(save.current, seen[0]!.index)?.name).toBe("Пушок");
    expect(seen).toHaveLength(6);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!.minute - seen[i - 1]!.minute).toBeGreaterThanOrEqual(HOUSEHOLD.tuftEveryMinutes);
    for (const { index } of seen) expect(tuftCat(save.current, index), `жмут ${index}`).not.toBeNull();
  });
});

describe("поява жмута на екрані (вигляд, `view/iso/tuftappear.ts`)", () => {
  it("з появою показують лише жмут, що ліг щойно: давніший (поки гравця не було) і без `tuftAt` — уже лежать", () => {
    const state = game().current;
    expect(freshTuft(state)).toBeNull();
    state.home.fur = 60;
    live(state, 1);
    expect(freshTuft(state)).toBe(0);
    state.minute += TUFT_APPEAR.freshMinutes + 1;
    expect(freshTuft(state)).toBeNull();
    // Годинник пішов назад (режим розробки) — теж без появи.
    state.minute -= 2 * (TUFT_APPEAR.freshMinutes + 1);
    expect(freshTuft(state)).toBeNull();
  });

  it("котиться з-під кота, якщо його видно й він недалеко; інакше — проступає на місці", () => {
    const spot = FUR_SPOTS[2]!;
    const root = { x: 100, y: 50 };
    expect(tuftRollFrom({ x: spot.x + 1, y: spot.y }, root, spot)).toEqual(root);
    expect(tuftRollFrom(null, root, spot)).toBeNull();
    expect(tuftRollFrom({ x: spot.x + 1, y: spot.y }, null, spot)).toBeNull();
    expect(tuftRollFrom({ x: spot.x + TUFT_APPEAR.reach + 0.5, y: spot.y }, root, spot)).toBeNull();
  });

  it("котиться лише по підлозі: жмут із-під кота на шафі, холодильнику чи на руках проступає на місці, а не летить згори", () => {
    const cases: { name: string; at: Vec; carried?: boolean; spot: number }[] = [
      // Шафа (6, 1) і холодильник (13, 1) — `HIGH_PLACES`: меблі не стіна, тож жмут лягає «з-під» кота нагорі.
      { name: "шафа", at: { x: 6.5, y: 1.5 }, spot: 6 },
      { name: "холодильник", at: { x: 13.5, y: 1.5 }, spot: 7 },
      { name: "на руках", at: { x: 9.5, y: 8.4 }, carried: true, spot: 2 },
    ];
    for (const { name, at, carried, spot } of cases) {
      const state = game().current;
      const cat = catAt(state, at);
      if (carried) {
        state.character.held = { kind: "cat", cat: cat.id };
        state.character.body.x = at.x;
        state.character.body.y = at.y;
      }
      state.home.fur = HOUSEHOLD.dirtyFur;
      live(state, 1);
      expect(tuftsOf(state), name).toEqual([spot]);
      expect(tuftCat(state, spot)?.id, name).toBe(cat.id);
      // Кіт не на підлозі (`catSpot`): точки підлоги під ним вигляд не дає (`CatPoints.floor` — лише для `floor`), і без неї
      // жмут не котиться.
      expect(catSpot(state, cat, "sit", null, { grate: 0.004 }).kind, name).not.toBe("floor");
      expect(tuftRollFrom(cat, null, FUR_SPOTS[spot]!), name).toBeNull();
    }
    // А той самий кіт на підлозі — стоїть на підлозі: звідти й котиться.
    const state = game().current;
    expect(catSpot(state, catAt(state, { x: 9.5, y: 8.4 }), "sit", null, { grate: 0.004 }).kind).toBe("floor");
  });

  it("за ≈ 0,6–1 с викочується від кота, сповільнюючись, наростає й проступає; наприкінці — рівно на місці", () => {
    expect(TUFT_APPEAR.ms).toBeGreaterThanOrEqual(600);
    expect(TUFT_APPEAR.ms).toBeLessThanOrEqual(1000);
    const from = { x: 40, y: 10 };
    const to = { x: 100, y: 50 };
    const start = tuftAppearLook(0, from, to);
    expect(start).toMatchObject({ x: from.x, y: from.y, alpha: 0, scale: TUFT_APPEAR.grow, angle: 0 });
    expect(tuftAppearLook(1, from, to)).toEqual({ x: to.x, y: to.y, scale: 1, alpha: 1, angle: 0 });
    expect(tuftAppearLook(TUFT_APPEAR.fade, from, to).alpha).toBe(1);
    let left = Infinity;
    let step = Infinity;
    let scale = 0;
    let wobbled = false;
    for (let i = 1; i <= 20; i++) {
      const look = tuftAppearLook(i / 20, from, to);
      const d = distance(look, to);
      expect(d).toBeLessThanOrEqual(left);
      // Сповільнюється: кожен крок не довший за попередній.
      expect(left === Infinity || left - d <= step + 1e-9).toBe(true);
      if (left !== Infinity) step = left - d;
      left = d;
      expect(look.scale).toBeGreaterThanOrEqual(scale);
      scale = look.scale;
      expect(Math.abs(look.angle)).toBeLessThanOrEqual(TUFT_APPEAR.wobble);
      if (look.angle !== 0) wobbled = true;
    }
    expect(wobbled).toBe(true);
  });

  it("без кота — на місці: не рухається й не хитається, лише наростає й проступає", () => {
    const to = { x: 100, y: 50 };
    for (let i = 0; i <= 10; i++) {
      const look = tuftAppearLook(i / 10, null, to);
      expect(look).toMatchObject({ x: to.x, y: to.y, angle: 0 });
    }
    expect(tuftAppearLook(0, null, to).scale).toBe(TUFT_APPEAR.grow);
    expect(tuftAppearLook(0.5, null, to).scale).toBeLessThan(1);
  });
});
