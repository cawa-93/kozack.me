// Пара дня «Будівельний пил ↔ Прибиральниця» (§4.1, рішення автора 2026-11-03; `DAY_MODIFIERS.md`): прибиральниця о 13:00
// миттєво прибирає квартиру із запасів гравця, будівельний пил з 10:00 до 12:00 осідає кімната за кімнатою.

import { describe, expect, it } from "vitest";

import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { createCat } from "../src/sim/cat";
import { trashTipped } from "../src/sim/catai";
import { cleanHome, settleDust } from "../src/sim/cleaner";
import { BOWL_CAPACITY, GUESTS, HOUSEHOLD, MODIFIERS, WATER_CAPACITY } from "../src/sim/config";
import { DUST_SPOTS, dustOf } from "../src/sim/dust";
import type { CleanerVisit, GameEvent } from "../src/sim/events";
import { advance, newGame } from "../src/sim/game";
import { objectById, ROOMS } from "../src/sim/home";
import { tuftsOf } from "../src/sim/household";
import { chooseDayModifier, DAY_PAIRS, tickModifiers } from "../src/sim/modifiers";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { BowlItem, Cat, GameState, LitterItem, Save, WaterItem } from "../src/sim/types";
import { CLEANER_TITLE, cleanerText, DAY_MODIFIER_TEXTS } from "../src/texts";
import { opensDoor } from "../src/view/iso/looks";
import { scheduleOf } from "../src/view/schedule";
import { recordEvents } from "./helpers";

const CLEANER = MODIFIERS.cleaner.minute;

/** Будній день о 12:50, модифікатор `day`; удома кіт і котячий куток. */
function game(day: string = "cleaner"): Save {
  const save = newGame({ address: "she", difficulty: "normal", seed: 14 });
  const state = save.current;
  state.day = 3;
  state.minute = CLEANER - 10;
  state.modifiers.day = day;
  return save;
}

function withCat(state: GameState, options: { sterilized?: boolean; at?: { x: number; y: number } } = {}): Cat {
  const cat = createCat(state, createRng(state.cats.length + 3), { source: "shelter", ageWeeks: 10, sex: "female", at: options.at ?? { x: 5.5, y: 8.5 } });
  cat.arrivedDay = -10;
  cat.sterilized = options.sterilized ?? false;
  cat.traits = [];
  addCat(state, cat);
  return cat;
}

/** Брудна квартира: безлад усіх видів, шерсть, пил, брудні лотки, випране в машині, порожні миски й поїлка, страва на плиті й столі. */
function dirty(state: GameState): { bowls: BowlItem[]; water: WaterItem; boxes: LitterItem[] } {
  const home = state.home;
  const kinds = ["surprise", "vomit", "hairball", "litter", "broken", "fur", "mark", "puddle", "paper", "garbage"] as const;
  home.messes = kinds.map((kind, i) => ({ id: 800 + i, kind, x: 2 + i, y: 8.5, cat: null }));
  home.fur = 80;
  home.tufts = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  home.dust = DUST_SPOTS.map((_, i) => i);
  const bowls: BowlItem[] = [
    { id: 901, kind: "bowl", quality: "cheap", slot: "bowl-1", food: 0, foodQuality: null, sterile: false },
    { id: 902, kind: "bowl", quality: "cheap", slot: "bowl-2", food: 1, foodQuality: "cheap", sterile: false },
  ];
  const water: WaterItem = { id: 903, kind: "water", quality: "cheap", slot: "water-1", water: 0 };
  const boxes: LitterItem[] = [
    { id: 904, kind: "litter", quality: "cheap", slot: "litter-1", litter: "cheap", uses: 3 },
    { id: 905, kind: "litter", quality: "cheap", slot: "litter-2", litter: "cheap", uses: 1 },
    { id: 906, kind: "litter", quality: "cheap", slot: "litter-3", litter: "cheap", uses: 0 },
  ];
  home.items.push(...bowls, water, ...boxes);
  home.stove = { item: { kind: "raw", quality: "cheap" }, minutes: 3 };
  home.surfaces["table"] = { kind: "meal", quality: "cheap" };
  return { bowls, water, boxes };
}

function stock(state: GameState, supplies: Partial<Record<"catFood" | "sterileFood" | "litter" | "detergent", number>>): void {
  for (const [product, amount] of Object.entries(supplies) as [keyof typeof supplies, number][]) state.home.supplies[product].cheap = amount;
}

/** Що прибиральниця зробила: з події картки. */
function visitOf(events: GameEvent[]): { kind: string; visit: CleanerVisit } | null {
  for (const e of events) if (e.type === "modifier" && e.cleaner) return { kind: e.kind, visit: e.cleaner };
  return null;
}

describe("каталог: «Будівельний пил ↔ Прибиральниця» (§4.1, рішення автора 2026-11-03)", () => {
  it("пара групи «Дім», будь-який день: обидва боки випадають і з котами, і без них", () => {
    const entry = DAY_PAIRS.find((p) => p.easy === "cleaner");
    expect(entry).toMatchObject({ hard: "construction-dust", group: "home", whenHard: "any", whenEasy: "any" });
    for (const cats of [false, true]) {
      const save = newGame({ address: "she", difficulty: "normal", seed: 14 });
      if (cats) withCat(save.current);
      const seen = new Set<string | null>();
      // Субота й будень: пара — будь-коли.
      for (const day of [2, 5]) {
        for (let seed = 0; seed < 2000; seed++) {
          save.current.modifiers.day = null;
          seen.add(chooseDayModifier(save.current, day, createRng(seed)));
        }
      }
      expect(seen.has("cleaner")).toBe(true);
      expect(seen.has("construction-dust")).toBe(true);
    }
  });
});

describe("прибиральниця (§4.1)", () => {
  it("дзвонить у двері за `ringLead` хвилин — і ще нічого не прибирає; о 13:00 заходить і миттєво прибирає все", () => {
    const save = game();
    const state = save.current;
    withCat(state);
    dirty(state);
    const { events, stop } = recordEvents();
    tickModifiers(state, CLEANER - GUESTS.ringLead - 0.5, 1, false);
    expect(events.filter((e) => e.type === "doorbell")).toHaveLength(1);
    expect(state.home.messes).toHaveLength(10);
    // Хвилину до приходу — ще під дверима.
    tickModifiers(state, CLEANER - GUESTS.ringLead + 0.5, GUESTS.ringLead - 1.5, false);
    expect(state.home.messes).toHaveLength(10);
    expect(visitOf(events)).toBeNull();
    tickModifiers(state, CLEANER - 1, 1.5, false);
    stop();
    expect(state.home.messes).toEqual([]);
    expect(visitOf(events)?.kind).toBe("cleaner");
    // Одна подія за візит, і дзвінок — один.
    expect(events.filter((e) => e.type === "modifier" && e.cleaner)).toHaveLength(1);
    expect(events.filter((e) => e.type === "doorbell")).toHaveLength(1);
    // Наступні хвилини — уже нічого.
    const after = recordEvents();
    tickModifiers(state, CLEANER + 0.5, 30, false);
    after.stop();
    expect(after.events).toEqual([]);
  });

  it("увесь безлад (і перекинутий смітник), жмути шерсті й шкала шерсті, пил і павутина в усіх кімнатах; страву на плиті й столі не чіпає", () => {
    const save = game();
    const state = save.current;
    withCat(state);
    dirty(state);
    stock(state, { catFood: 10, litter: 5, detergent: 2 });
    expect(trashTipped(state)).toBe(true);
    const visit = cleanHome(state);
    expect(state.home.messes).toEqual([]);
    expect(trashTipped(state)).toBe(false);
    expect(tuftsOf(state)).toEqual([]);
    expect(state.home.fur).toBe(0);
    expect(dustOf(state)).toEqual([]);
    expect(visit).toMatchObject({ messes: 10, tufts: 9, dust: DUST_SPOTS.length });
    expect(state.home.stove.item).toEqual({ kind: "raw", quality: "cheap" });
    expect(state.home.surfaces["table"]).toEqual({ kind: "meal", quality: "cheap" });
  });

  it("лотки, якими користувалися, — свіжий наповнювач із запасу; миски — корм, поїлки — вода; що зроблено — у події", () => {
    const save = game();
    const state = save.current;
    withCat(state);
    const { bowls, water, boxes } = dirty(state);
    stock(state, { catFood: 10, litter: 5 });
    const visit = cleanHome(state);
    // Брудний і трохи використаний — чисті, по одиниці наповнювача; чистий — як був.
    expect(boxes.map((b) => b.uses)).toEqual([0, 0, 0]);
    expect(state.home.supplies.litter.cheap).toBe(3);
    expect(visit.litter).toBe(2);
    // Порожня миска — доверху, у почату досипано того самого корму.
    expect(bowls.map((b) => b.food)).toEqual([BOWL_CAPACITY, BOWL_CAPACITY]);
    expect(state.home.supplies.catFood.cheap).toBe(10 - BOWL_CAPACITY - (BOWL_CAPACITY - 1));
    expect(water.water).toBe(WATER_CAPACITY);
    expect(visit).toMatchObject({ fed: "full", watered: true });
  });

  it("бере лише те, що є: без наповнювача, засобу й корму — лотки брудні, прання немає, миски порожні, а воду наливає завжди", () => {
    const save = game();
    const state = save.current;
    withCat(state);
    const { bowls, water, boxes } = dirty(state);
    state.home.clothes = 0;
    stock(state, { catFood: 0, sterileFood: 0, litter: 0, detergent: 0 });
    const visit = cleanHome(state);
    expect(boxes[0]?.uses).toBe(3);
    expect(state.home.washer.state).toBe("idle");
    expect(bowls.map((b) => b.food)).toEqual([0, 1]);
    expect(water.water).toBe(WATER_CAPACITY);
    expect(visit).toEqual({ messes: 10, tufts: 9, dust: DUST_SPOTS.length, litter: 0, hung: false, washing: false, fed: null, watered: true });
  });

  it("наповнювача на один лоток — чистить один; корму на одну миску — «насипано не всім»", () => {
    const save = game();
    const state = save.current;
    withCat(state);
    const { bowls, boxes } = dirty(state);
    bowls[1]!.food = 0;
    bowls[1]!.foodQuality = null;
    stock(state, { catFood: BOWL_CAPACITY, litter: 1 });
    const visit = cleanHome(state);
    expect(boxes.filter((b) => b.uses > 0)).toHaveLength(1);
    expect(state.home.supplies.litter.cheap).toBe(0);
    expect(bowls.map((b) => b.food)).toEqual([BOWL_CAPACITY, 0]);
    expect(visit).toMatchObject({ litter: 1, fed: "some" });
  });

  it("корм — той, що насипав би й гравець: стерилізованому коту — для стерилізованих; без котів мисок не наповнює", () => {
    const save = game();
    const state = save.current;
    withCat(state, { sterilized: true });
    const { bowls } = dirty(state);
    bowls[1]!.food = 0;
    bowls[1]!.foodQuality = null;
    stock(state, { catFood: 10, sterileFood: 10 });
    cleanHome(state);
    expect(bowls.every((b) => b.sterile && b.food === BOWL_CAPACITY)).toBe(true);
    expect(state.home.supplies.catFood.cheap).toBe(10);

    const empty = game().current;
    const { bowls: idle, water } = dirty(empty);
    stock(empty, { catFood: 10 });
    const visit = cleanHome(empty);
    expect(idle.map((b) => b.food)).toEqual([0, 1]);
    expect(empty.home.supplies.catFood.cheap).toBe(10);
    expect(water.water).toBe(WATER_CAPACITY);
    expect(visit.fed).toBeNull();
  });

  it("пральна машина: випране розвішує; брудний одяг — запускає прання із засобом із запасу; прання, що йде, не чіпає", () => {
    // Випране в машині й чистого одягу мало: розвісила — і вже досить, нового прання не треба.
    const done = game().current;
    done.home.clothes = 1;
    done.home.washer = { state: "done", minutes: 0, quality: "cheap" };
    stock(done, { detergent: 2 });
    expect(cleanHome(done)).toMatchObject({ hung: true, washing: false });
    expect(done.home.clothes).toBe(HOUSEHOLD.clothesDays.cheap);
    expect(done.home.washer.state).toBe("idle");
    expect(done.home.supplies.detergent.cheap).toBe(2);

    // Брудний одяг і засіб — прання запущено.
    const dirtyClothes = game().current;
    dirtyClothes.home.clothes = 2;
    stock(dirtyClothes, { detergent: 2 });
    expect(cleanHome(dirtyClothes)).toMatchObject({ hung: false, washing: true });
    expect(dirtyClothes.home.washer).toEqual({ state: "washing", minutes: HOUSEHOLD.washMinutes, quality: "cheap" });
    expect(dirtyClothes.home.supplies.detergent.cheap).toBe(1);

    // Шафа повна — машина не запускається, засіб лишається, як і в гравця.
    const full = game().current;
    full.home.clothes = HOUSEHOLD.clothesDays.cheap;
    stock(full, { detergent: 2 });
    expect(cleanHome(full).washing).toBe(false);
    expect(full.home.supplies.detergent.cheap).toBe(2);

    // Прання вже йде — як було.
    const washing = game().current;
    washing.home.clothes = 0;
    washing.home.washer = { state: "washing", minutes: 20, quality: "cheap" };
    stock(washing, { detergent: 2 });
    expect(cleanHome(washing)).toMatchObject({ hung: false, washing: false });
    expect(washing.home.washer.minutes).toBe(20);
  });

  it("без світла (сумісність із «Плановим відключенням») випране розвішує, а прання не запускає; кота в барабані не пере", () => {
    const dark = game("outage").current;
    dark.home.washer = { state: "done", minutes: 0, quality: "cheap" };
    dark.home.clothes = 0;
    stock(dark, { detergent: 2 });
    // Випране розвісила (одягу вже досить); далі — брудне знову, а світла немає.
    expect(cleanHome(dark).hung).toBe(true);
    dark.home.clothes = 0;
    expect(cleanHome(dark).washing).toBe(false);
    expect(dark.home.supplies.detergent.cheap).toBe(2);

    const catInside = game().current;
    const washer = objectById("washer");
    const cat = withCat(catInside, { at: { x: washer.x + 0.5, y: washer.y + 0.5 } });
    cat.act = { kind: "sleep", target: null, goal: null, minutes: 120, elapsed: 0 };
    catInside.home.clothes = 0;
    stock(catInside, { detergent: 2 });
    expect(cleanHome(catInside).washing).toBe(false);
    expect(catInside.home.washer.state).toBe("idle");
  });

  it("має ключі: персонажа немає вдома — прибирає так само, двері за собою зачиняє (коти не вибігають), картка — «нікого вдома»", () => {
    const save = game();
    const state = save.current;
    // «Втікач» біля самих дверей: коли двері відчиняє персонаж, він міг би вибігти на сходи.
    const runner = withCat(state, { at: { x: 11, y: 9.8 } });
    runner.traits = [{ group: "escape", level: 2, seen: 0, known: true }];
    const { boxes } = dirty(state);
    stock(state, { catFood: 10, litter: 5 });
    state.trip = { destination: "shop" } as unknown as NonNullable<GameState["trip"]>;
    const { events, stop } = recordEvents();
    tickModifiers(state, CLEANER - 0.5, 1, false);
    stop();
    expect(state.home.messes).toEqual([]);
    expect(boxes[0]?.uses).toBe(0);
    expect(visitOf(events)?.kind).toBe("cleaner-away");
    expect(runner.away).toBeNull();
    expect(events.some((e) => e.type === "escaped")).toBe(false);
  });

  it("у грі: спершу дзвінок, за 6 хвилин — чиста квартира; на інший день прибиральниці немає", () => {
    const save = game();
    const state = save.current;
    withCat(state);
    dirty(state);
    stock(state, { catFood: 10, litter: 5 });
    state.minute = CLEANER - GUESTS.ringLead - 2;
    const { events, stop } = recordEvents();
    advance(save, GUESTS.ringLead + 3);
    stop();
    expect(state.home.messes).toEqual([]);
    expect(events.findIndex((e) => e.type === "doorbell")).toBeLessThan(events.findIndex((e) => e.type === "modifier" && e.kind === "cleaner"));

    const other = game("inspection");
    dirty(other.current);
    tickModifiers(other.current, CLEANER - 1, 2, false);
    expect(other.current.home.messes.length).toBeGreaterThan(0);
  });
});

describe("будівельний пил (§4.1)", () => {
  const roomSpots = (room: string): number[] => DUST_SPOTS.flatMap((s, i) => (s.room === room ? [i] : []));
  const dustIn = (state: GameState, room: string): number[] => dustOf(state).filter((i) => DUST_SPOTS[i]?.room === room).sort((a, b) => a - b);

  it("з 10:00 щопівгодини одна кімната — пил і павутина на всіх її місцях: вітальня, ванна, кухня, спальня; о 12:00 — усюди", () => {
    const save = game("construction-dust");
    const state = save.current;
    state.minute = 9 * 60 + 58;
    state.home.dust = [];
    expect(MODIFIERS.constructionDust.rooms).toEqual(["living", "bathroom", "kitchen", "bedroom"]);
    // Кімнати, де пил на всіх місцях (звичайний пил за ці години може лягти й деінде — його не рахують).
    const full = (): string[] => ROOMS.map((r) => r.id).filter((room) => dustIn(state, room).join() === roomSpots(room).join());
    const order: string[][] = [];
    for (const minute of [10 * 60 - 1, 10 * 60 + 1, 10 * 60 + 29, 10 * 60 + 31, 11 * 60 + 1, 11 * 60 + 31]) {
      advance(save, minute - state.minute);
      order.push(full());
    }
    expect(order).toEqual([[], ["living"], ["living"], ["bathroom", "living"], ["bathroom", "kitchen", "living"], ["bedroom", "bathroom", "kitchen", "living"]]);
    expect(dustOf(state)).toHaveLength(DUST_SPOTS.length);
    // Павутина, кути, стіни й підлога — як після довгого накопичення (§8.7).
    for (const kind of ["cobweb", "corner", "wall", "floor"]) expect(dustOf(state).some((i) => DUST_SPOTS[i]?.kind === kind)).toBe(true);
  });

  it("між півгодинами нічого не осідає; після 12:00 — лише звичайний пил", () => {
    const state = game("construction-dust").current;
    state.home.dust = [];
    tickModifiers(state, 10 * 60 + 1, 28, false);
    expect(dustOf(state)).toEqual([]);
    tickModifiers(state, 10 * 60 + 29.5, 1, false);
    expect(dustIn(state, "bathroom")).toEqual(roomSpots("bathroom"));
    const before = dustOf(state).length;
    tickModifiers(state, 12 * 60, 120, false);
    expect(dustOf(state).length).toBe(before);
  });

  it("кімната вже запилена — лягає на вільні місця; кожне місце — подія `dust` (вигляд і журнал); персонажа немає — пил однаково осідає", () => {
    const state = game("construction-dust").current;
    const living = roomSpots("living");
    state.home.dust = living.slice(0, 3);
    const { events, stop } = recordEvents();
    expect(settleDust(state, "living")).toBe(living.length - 3);
    stop();
    expect(events.filter((e) => e.type === "dust")).toHaveLength(living.length - 3);
    expect(settleDust(state, "living")).toBe(0);

    const away = game("construction-dust").current;
    away.home.dust = [];
    away.trip = { destination: "shop" } as unknown as NonNullable<GameState["trip"]>;
    tickModifiers(away, 10 * 60 - 0.5, 1, false);
    expect(dustIn(away, "living")).toEqual(living);
  });

  it("на інший день — ні", () => {
    const state = game("cleaner").current;
    state.home.dust = [];
    tickModifiers(state, 10 * 60 - 0.5, 1, false);
    expect(dustOf(state)).toEqual([]);
  });
});

describe("тексти, розклад і двері (§4.1, `TEXTS.md`)", () => {
  const visit = (over: Partial<CleanerVisit> = {}): CleanerVisit => ({ messes: 3, tufts: 2, dust: 5, litter: 0, hung: false, washing: false, fed: null, watered: false, ...over });

  it("титулки пари — з `TEXTS.md`", () => {
    expect(DAY_MODIFIER_TEXTS["construction-dust"]).toEqual({ title: "Будівельний пил", situation: "У під'їзді ремонт: з десятої до полудня в квартиру летітиме пил." });
    expect(DAY_MODIFIER_TEXTS["cleaner"]).toEqual({ title: "Прибиральниця", situation: "О 13:00 прийде прибиральниця — мама подарувала прибирання." });
  });

  it("картка «Заходила прибиральниця» — у квартирі чисто, а далі лише те, що вдалося; без персонажа — «Поки вас не було…»", () => {
    expect(CLEANER_TITLE).toBe("Заходила прибиральниця");
    expect(cleanerText(visit({ litter: 2, washing: true, fed: "full", watered: true }), true)).toBe(
      "Прибиральниця пройшлася з ганчіркою й пилососом — у квартирі чисто. Лотки почищено. Прання запущено. Котячі миски й поїлки повні.",
    );
    expect(cleanerText(visit({ litter: 1, hung: true, fed: "some", watered: true }), false)).toBe(
      "Поки вас не було, заходила прибиральниця — у квартирі чисто. Лоток почищено. Випране розвішано. У котячі миски насипано корму, поїлки повні.",
    );
    // Нічого із запасів — лише чистота (і вода, якщо доливала).
    expect(cleanerText(visit(), true)).toBe("Прибиральниця пройшлася з ганчіркою й пилососом — у квартирі чисто.");
    expect(cleanerText(visit({ watered: true }), true)).toBe("Прибиральниця пройшлася з ганчіркою й пилососом — у квартирі чисто. Поїлки повні.");
    expect(cleanerText(visit({ fed: "full" }), true)).toMatch(/ Котячі миски повні\.$/);
    expect(cleanerText(visit({ fed: "some" }), true)).toMatch(/ У котячі миски насипано корму\.$/);
    // Ціни й чисел ефектів картка не називає (§11.3а).
    expect(cleanerText(visit({ litter: 3, hung: true, washing: true, fed: "full", watered: true }), true)).not.toMatch(/\d/);
  });

  it("розклад: «13:00 прибиральниця» і «10:00–12:00 пил» — до події, як інші рядки", () => {
    const at = (day: string, hour: number): string[] => {
      const state = game(day).current;
      state.minute = hour * 60;
      return scheduleOf(state);
    };
    expect(at("cleaner", 9.5)).toContain("13:00 прибиральниця");
    expect(at("cleaner", 12.9)).toContain("13:00 прибиральниця");
    expect(at("cleaner", 13.5)).not.toContain("13:00 прибиральниця");
    expect(at("construction-dust", 8)).toContain("10:00–12:00 пил");
    expect(at("construction-dust", 10.25).some((line) => line.includes("пил"))).toBe(false);
    // На панелі (два перші рядки) — серед важливого, разом із летучкою.
    expect(at("cleaner", 9.5).slice(0, 2)).toEqual(["10:00 летучка", "13:00 прибиральниця"]);
  });

  it("двері: персонаж відчиняє прибиральниці, коли він удома; без нього їх ніхто не бачить", () => {
    expect(opensDoor({ type: "modifier", kind: "cleaner", value: 0, cleaner: visit() })).toBe(true);
    expect(opensDoor({ type: "modifier", kind: "cleaner-away", value: 0, cleaner: visit() })).toBe(false);
  });
});

describe("сценарії", () => {
  const load = (name: string): Save => {
    const file = FILE_SCENARIOS[name];
    if (!file) throw new Error(`Немає сценарію «${name}»`);
    expect(file.name.length).toBeGreaterThan(0);
    expect(file.description?.length ?? 0).toBeGreaterThan(0);
    return applyScenario(file);
  };

  it("«Прибиральниця»: о 12:54 дзвінок — Пушок біжить до дверей, Тихоня ховається; о 13:00 усе чисто з тих запасів, що були, страва на плиті лишається", () => {
    const save = load("cleaner-visit");
    const state = save.current;
    expect(state.modifiers.day).toBe("cleaner");
    expect(state.minute).toBe(CLEANER - 10);
    const cat = (name: string): Cat => state.cats.find((c) => c.name === name)!;
    const { events, stop } = recordEvents();
    advance(save, 5);
    expect(events.some((e) => e.type === "doorbell")).toBe(true);
    expect(cat("Пушок").act.target).toBe("guest");
    expect(cat("Тихоня").act.kind).toBe("hide");
    expect(cat("Соня").act.kind).toBe("sleep");
    expect(state.home.messes.length).toBeGreaterThan(0);
    advance(save, 6);
    stop();
    const home = state.home;
    expect(home.messes).toEqual([]);
    expect(tuftsOf(state)).toEqual([]);
    expect(dustOf(state)).toEqual([]);
    expect(home.items.filter((i): i is LitterItem => i.kind === "litter").map((b) => b.uses)).toEqual([0, 0]);
    expect(home.supplies.litter.cheap).toBe(0);
    expect(home.washer.state).toBe("washing");
    expect(home.supplies.detergent.cheap).toBe(0);
    expect(home.items.filter((i): i is BowlItem => i.kind === "bowl").map((b) => b.food)).toEqual([BOWL_CAPACITY, BOWL_CAPACITY]);
    expect(home.items.filter((i): i is WaterItem => i.kind === "water").map((w) => w.water)).toEqual([WATER_CAPACITY, WATER_CAPACITY]);
    expect(home.stove.item?.kind).toBe("raw");
    const visit = visitOf(events);
    expect(visit?.kind).toBe("cleaner");
    expect(cleanerText(visit?.visit, true)).toBe("Прибиральниця пройшлася з ганчіркою й пилососом — у квартирі чисто. Лотки почищено. Прання запущено. Котячі миски й поїлки повні.");
    // Двері відчиняла персонажка: Пушок, що чекав під дверима, на сходи не вибіг.
    expect(state.cats.every((c) => c.away === null)).toBe(true);
  });

  it("«Будівельний пил»: чиста квартира о 09:58, о 10:00 — уся вітальня, до 12:00 — уся квартира", () => {
    const save = load("construction-dust");
    const state = save.current;
    expect(state.modifiers.day).toBe("construction-dust");
    expect(dustOf(state)).toEqual([]);
    expect(scheduleOf(state)).toContain("10:00–12:00 пил");
    advance(save, 3);
    const living = DUST_SPOTS.flatMap((s, i) => (s.room === "living" ? [i] : []));
    expect([...dustOf(state)].sort((a, b) => a - b)).toEqual(living);
    advance(save, 2 * 60);
    expect(dustOf(state)).toHaveLength(DUST_SPOTS.length);
  });
});
