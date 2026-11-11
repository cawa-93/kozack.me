// Котячі сліди в квартирі (§9.12 «Гра й бешкет» — «Котячі сліди в квартирі», рішення автора 2026-11-02; §8.3): на старті
// квартира ціла, слід з'являється від першої дії кота чи з «котоднями» й лишається; сліди коробок зникають разом із коробками.
import { describe, expect, it } from "vitest";
import { describe as describeEvent } from "../src/dev/journal";
import { applyScenario } from "../src/dev/scenarios";
import { createCat, idleAct } from "../src/sim/cat";
import { tickCats, upHigh } from "../src/sim/catai";
import { CHEWING, CUNNING, SCRATCH, STORAGE_LIMITS, TRACE_CAT_DAYS } from "../src/sim/config";
import { DOOR_TILE } from "../src/sim/door";
import { addSupply, place, stash, unpack } from "../src/sim/economy";
import type { GameEvent } from "../src/sim/events";
import { advance, deserialize, goToSleep, newGame, replayDay, replayWeek, serialize } from "../src/sim/game";
import { BOX_SCRATCH, CABINET_PAW, DOORFRAME, itemTile, objectById, RUG, WIRE_TILE } from "../src/sim/home";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { hoursUntilWake } from "../src/sim/sleep";
import { addTrace, CAT_TRACES, catDays, hasTrace, nightlyTraces, traces } from "../src/sim/traces";
import type { Cat, CatTrace, Save, TraitLevel, Vec } from "../src/sim/types";
import { eventBubbles } from "../src/view/symbols";
import { hours, recordEvents, withCatCorner } from "./helpers";

function game(seed = 11): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed }));
  save.current.modifiers.day = null;
  save.current.minute = hours(12);
  Object.assign(save.current.character.body, { x: 9.5, y: 8.5 });
  return save;
}

function withCat(save: Save, traits: Record<string, TraitLevel> = {}, ageWeeks = 10): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks, at: { x: 9.5, y: 7.5 } });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.breed = ["mixed", "mixed"];
  cat.arrivedDay = -10;
  cat.love = 50;
  cat.act = idleAct(30);
  cat.needs = { hunger: 10, thirst: 10, toilet: 10, fatigue: 10, attention: 10, play: 10 };
  addCat(save.current, cat);
  return cat;
}

/** Кіт уже на місці (`goal` — null) і зараз почне дію. */
function at(cat: Cat, tile: Vec, act: Pick<Cat["act"], "kind" | "target" | "minutes">): void {
  Object.assign(cat, { x: tile.x + 0.5, y: tile.y + 0.5 });
  cat.act = { ...act, goal: null, elapsed: 0 };
}

const SOFA = ((): Vec => {
  const sofa = objectById("sofa");
  return { x: sofa.x, y: sofa.y - 1 };
})();

/** Де кіт точить кігті, щоб лишити слід (як у `startScratch`). */
const SCRATCH_TILES: Record<"sofa" | "doorframe" | "rug" | "boxes", Vec> = { sofa: SOFA, doorframe: DOORFRAME, rug: { x: RUG.x, y: RUG.y }, boxes: BOX_SCRATCH };

function scratch(save: Save, cat: Cat, where: keyof typeof SCRATCH_TILES): void {
  at(cat, SCRATCH_TILES[where], { kind: "scratch", target: where, minutes: SCRATCH.minutes });
  tickCats(save.current, SCRATCH.minutes + 0.05, { present: true });
}

function chew(save: Save, cat: Cat, target: "wire" | "boxes"): void {
  cat.needs.hunger = 10;
  at(cat, target === "wire" ? WIRE_TILE : BOX_SCRATCH, { kind: "chew", target, minutes: CHEWING.minMinutes });
  tickCats(save.current, CHEWING.minMinutes + 0.1, { present: true });
}

const traceEvents = (events: GameEvent[]): CatTrace[] => events.flatMap((e) => (e.type === "trace" ? [e.trace] : []));

describe("котячі сліди: на старті квартира ціла (§8.3, §9.12)", () => {
  it("нова гра — без слідів і без котоднів", () => {
    const { current } = newGame({ address: "she", difficulty: "normal", seed: 1 });
    expect(traces(current)).toEqual([]);
    expect(catDays(current)).toBe(0);
    for (const trace of CAT_TRACES) expect(hasTrace(current, trace)).toBe(false);
  });

  it("сценарій із котами без полів слідів — теж ціла квартира", () => {
    const save = applyScenario({ name: "коти", cats: [{ ageWeeks: 10 }, { ageWeeks: 30 }] });
    expect(save.current.cats).toHaveLength(2);
    expect(traces(save.current)).toEqual([]);
    expect(catDays(save.current)).toBe(0);
  });

  it("сліди — без бабла (показуй, а не розказуй, §11.4), а журнал режиму розробки пише кожен своїми словами", () => {
    const { current } = newGame({ address: "she", difficulty: "normal", seed: 1 });
    const lines = CAT_TRACES.map((trace) => {
      expect(eventBubbles({ type: "trace", trace }), trace).toEqual([]);
      const line = describeEvent({ type: "trace", trace }, current);
      expect(line, trace).toContain("слід");
      return line;
    });
    expect(new Set(lines).size).toBe(CAT_TRACES.length);
    for (const step of TRACE_CAT_DAYS) expect(describeEvent({ type: "trace", trace: step.trace }, current)).toContain("котодні");
  });
});

describe("сліди від дії кота: уперше — і назавжди (§9.12)", () => {
  for (const [where, trace] of [["sofa", "sofa"], ["doorframe", "doorframe"], ["rug", "rug"], ["boxes", "boxes-claws"]] as const) {
    it(`подер «${where}» — слід «${trace}», раз`, () => {
      const save = game();
      if (where === "boxes") save.current.home.boxes = { food: { cheap: 3, premium: 0 } };
      const cat = withCat(save);
      const { events, stop } = recordEvents();
      scratch(save, cat, where);
      expect(events.some((e) => e.type === "scratched" && e.where === where)).toBe(true);
      scratch(save, cat, where);
      stop();
      expect(traces(save.current)).toEqual([trace]);
      expect(traceEvents(events)).toEqual([trace]);
    });
  }

  it("подер диван — запис титрів (§4.2) лише першого разу, з котом; одвірок, килимок і коробки — ні", () => {
    const save = game();
    save.current.home.boxes = { food: { cheap: 3, premium: 0 } };
    const cat = withCat(save);
    for (const where of ["doorframe", "rug", "boxes"] as const) scratch(save, cat, where);
    expect(save.current.story).toBeUndefined();
    save.current.minute = hours(11);
    scratch(save, cat, "sofa");
    scratch(save, cat, "sofa");
    expect(save.current.story).toEqual([{ kind: "broke", day: save.current.day, minute: hours(11), thing: "sofa", cat: cat.id }]);
  });

  it("кігтеточка слідів не лишає", () => {
    const save = game();
    const post = place(save.current, "scratcher", "cheap");
    if (!post) throw new Error("кігтеточку не поставити");
    save.current.home.items.push(post);
    const cat = withCat(save);
    const { events, stop } = recordEvents();
    at(cat, itemTile(post), { kind: "scratch", target: `item:${post.id}`, minutes: SCRATCH.minutes });
    tickCats(save.current, SCRATCH.minutes + 0.05, { present: true });
    stop();
    expect(events.some((e) => e.type === "scratched" && e.where === "post")).toBe(true);
    expect(traces(save.current)).toEqual([]);
    expect(traceEvents(events)).toEqual([]);
  });

  it("подер коробки, яких тим часом не стало (розпакували), — сліду немає", () => {
    const save = game();
    const cat = withCat(save);
    const { events, stop } = recordEvents();
    scratch(save, cat, "boxes");
    stop();
    expect(events.some((e) => e.type === "scratched" && e.where === "boxes")).toBe(true);
    expect(traces(save.current)).toEqual([]);
  });

  it("лапав дверцята шафки з кормом — подряпини на них, хоч відчинив, хоч замок утримав", () => {
    for (const lock of [false, true]) {
      const save = game();
      addSupply(save.current, "catFood", "cheap", 6);
      if (lock) place(save.current, "lock", "premium");
      const cat = withCat(save, { cunning: 1 });
      cat.needs.hunger = 90;
      const { events, stop } = recordEvents();
      for (let i = 0; i < 2; i++) {
        delete save.current.home.cabinetOpen;
        cat.needs.hunger = 90;
        at(cat, CABINET_PAW, { kind: "raid", target: "cabinet", minutes: CUNNING.pawMinutes });
        tickCats(save.current, CUNNING.pawMinutes + 0.05, { present: true });
      }
      stop();
      expect(events.filter((e) => e.type === "cabinet-pawed" && e.opened === !lock), `замок: ${lock}`).toHaveLength(2);
      expect(traces(save.current)).toEqual(["cabinet"]);
      expect(traceEvents(events)).toEqual(["cabinet"]);
    }
  });

  it("«Втікач» кричить під вхідними дверима — подряпини на них, щойно дійшов, і без свідків", () => {
    const save = game();
    // Персонаж на кухні: дверей не бачить.
    Object.assign(save.current.character.body, { x: 15.5, y: 2.5 });
    const cat = withCat(save, { escape: 1 });
    cat.act = { kind: "beg", target: "door", goal: { ...DOOR_TILE }, minutes: 6, elapsed: 0 };
    Object.assign(cat, { x: 5.5, y: 8.5 });
    const { events, stop } = recordEvents();
    tickCats(save.current, 0.05, { present: true });
    expect(cat.act.goal).not.toBeNull();
    expect(traces(save.current)).toEqual([]);
    for (let i = 0; i < 100 && cat.act.kind === "beg"; i++) tickCats(save.current, 0.25, { present: true });
    // Удруге під дверима — нового сліду немає.
    at(cat, DOOR_TILE, { kind: "beg", target: "door", minutes: 6 });
    tickCats(save.current, 1, { present: false });
    stop();
    expect(traces(save.current)).toEqual(["door"]);
    expect(traceEvents(events)).toEqual(["door"]);
  });

  /** Кіт іде спати нагору `id` із сусідньої клітинки під ним; повертає, скільки кроків до мети. */
  function climb(save: Save, cat: Cat, id: "wardrobe" | "fridge"): number {
    const high = objectById(id);
    Object.assign(cat, { x: high.x + 0.5, y: high.y + 1.5 });
    cat.act = { kind: "sleep", target: null, goal: { x: high.x, y: high.y }, minutes: 60, elapsed: 0 };
    let ticks = 0;
    for (; ticks < 20 && cat.act.goal !== null; ticks++) tickCats(save.current, 0.1, { present: true });
    expect(cat.act.goal, id).toBeNull();
    return ticks;
  }

  it("виліз на шафу в спальні — подряпини на шухляді, щойно нагорі, раз і без свідків; холодильник слідів не лишає", () => {
    // Персонаж у вітальні (`game`): спальні не бачить.
    const save = game();
    const cat = withCat(save, { climbing: 1 }, 40);
    const { events, stop } = recordEvents();
    expect(climb(save, cat, "fridge")).toBeGreaterThan(1);
    expect(traces(save.current)).toEqual([]);
    // Лише зібрався на шафу, ще не нагорі, — сліду немає.
    const wardrobe = objectById("wardrobe");
    Object.assign(cat, { x: wardrobe.x + 0.5, y: wardrobe.y + 1.5 });
    cat.act = { kind: "sleep", target: null, goal: { x: wardrobe.x, y: wardrobe.y }, minutes: 60, elapsed: 0 };
    tickCats(save.current, 0.1, { present: true });
    expect(cat.act.goal).not.toBeNull();
    expect(traces(save.current)).toEqual([]);
    climb(save, cat, "wardrobe");
    expect(upHigh(save.current, cat)).toBe(true);
    expect(traces(save.current)).toEqual(["wardrobe"]);
    // Удруге на шафі — нового сліду немає.
    climb(save, cat, "wardrobe");
    stop();
    expect(traces(save.current)).toEqual(["wardrobe"]);
    expect(traceEvents(events)).toEqual(["wardrobe"]);
  });

  it("гриз пакети в коробках — погризений клапан, раз; дріт комп'ютера слідів не лишає", () => {
    const save = game();
    save.current.home.boxes = { catFood: { cheap: 5, premium: 0 } };
    const cat = withCat(save, { chewing: 1 });
    const { events, stop } = recordEvents();
    chew(save, cat, "wire");
    expect(traces(save.current)).toEqual([]);
    chew(save, cat, "boxes");
    chew(save, cat, "boxes");
    stop();
    expect(events.filter((e) => e.type === "bag-chewed")).toHaveLength(2);
    expect(save.current.home.boxes?.catFood?.cheap).toBe(3);
    expect(traces(save.current)).toEqual(["boxes-chewed"]);
    expect(traceEvents(events)).toEqual(["boxes-chewed"]);
  });

  it("сліди лишаються в порядку появи", () => {
    const save = game();
    save.current.home.boxes = { food: { cheap: 3, premium: 0 } };
    const cat = withCat(save);
    scratch(save, cat, "rug");
    scratch(save, cat, "sofa");
    scratch(save, cat, "boxes");
    scratch(save, cat, "rug");
    expect(traces(save.current)).toEqual(["rug", "sofa", "boxes-claws"]);
  });
});

describe("сліди на коробках тимчасові (§9.12)", () => {
  /** Ящики з кормом і обидва сліди на них, а ще подертий диван. */
  function boxed(): { save: Save; cat: Cat } {
    const save = game();
    save.current.home.boxes = { catFood: { cheap: 4, premium: 0 } };
    const cat = withCat(save, { chewing: 1 });
    scratch(save, cat, "sofa");
    scratch(save, cat, "boxes");
    chew(save, cat, "boxes");
    expect(traces(save.current)).toEqual(["sofa", "boxes-claws", "boxes-chewed"]);
    return { save, cat };
  }

  it("усе розпаковано — сліди коробок зникають, без події; решта лишається", () => {
    const { save } = boxed();
    const { events, stop } = recordEvents();
    expect(unpack(save.current).length).toBeGreaterThan(0);
    stop();
    expect(save.current.home.boxes).toEqual({});
    expect(traces(save.current)).toEqual(["sofa"]);
    expect(traceEvents(events)).toEqual([]);
  });

  it("розпаковано не все (сховище повне) — коробки й сліди на них лишаються", () => {
    const { save } = boxed();
    save.current.home.boxes = { catFood: { cheap: 3, premium: 0 }, food: { cheap: 1, premium: 0 } };
    save.current.home.supplies.food = { cheap: STORAGE_LIMITS.food, premium: 0 };
    unpack(save.current);
    expect(save.current.home.boxes?.catFood).toBeUndefined();
    expect(save.current.home.boxes?.food?.cheap).toBe(1);
    expect(traces(save.current)).toEqual(["sofa", "boxes-claws", "boxes-chewed"]);
  });

  it("кіт догриз останній пакет — коробок немає, і слідів на них теж", () => {
    const { save, cat } = boxed();
    save.current.home.boxes = { catFood: { cheap: 1, premium: 0 } };
    const { events, stop } = recordEvents();
    chew(save, cat, "boxes");
    stop();
    expect(events.some((e) => e.type === "bag-chewed")).toBe(true);
    expect(traces(save.current)).toEqual(["sofa"]);
    expect(traceEvents(events)).toEqual([]);
  });

  it("нова доставка приходить у цілих коробках; слід знову — лише від нової дії", () => {
    const { save, cat } = boxed();
    unpack(save.current);
    stash(save.current, "litter", "cheap", 3);
    expect(traces(save.current)).toEqual(["sofa"]);
    const { events, stop } = recordEvents();
    scratch(save, cat, "boxes");
    stop();
    expect(traces(save.current)).toEqual(["sofa", "boxes-claws"]);
    expect(traceEvents(events)).toEqual(["boxes-claws"]);
  });
});

describe("сліди з котоднями (§9.12)", () => {
  /** Ночі, після яких з'явився кожен слід котоднів. */
  function nightsOf(cats: number): Partial<Record<CatTrace, number>> {
    const save = game();
    for (let i = 0; i < cats; i++) withCat(save, {}, i === 0 ? 2 : 10);
    const appeared: Partial<Record<CatTrace, number>> = {};
    const { events, stop } = recordEvents();
    for (let night = 1; night <= 20; night++) {
      const from = events.length;
      nightlyTraces(save.current);
      for (const trace of traceEvents(events.slice(from))) appeared[trace] = night;
    }
    stop();
    expect(catDays(save.current)).toBe(20 * cats);
    expect(traces(save.current)).toEqual(TRACE_CAT_DAYS.map((step) => step.trace));
    return appeared;
  }

  it("з одним котом (кошеням): килимок перед душем — за 2 ночі, петля — за 5, шпалери — за 9, лінолеум — за 14", () => {
    expect(nightsOf(1)).toEqual({ "bath-mat": 2, "bedroom-rug": 5, wallpaper: 9, lino: 14 });
  });

  it("з трьома котами — швидше: за 1, 2, 3 і 5 ночей", () => {
    expect(nightsOf(3)).toEqual({ "bath-mat": 1, "bedroom-rug": 2, wallpaper: 3, lino: 5 });
  });

  it("без котів котоднів немає й слідів теж", () => {
    const save = game();
    for (let night = 0; night < 30; night++) nightlyTraces(save.current);
    expect(catDays(save.current)).toBe(0);
    expect(traces(save.current)).toEqual([]);
  });

  it("за кілька порогів одразу — сліди по черзі, кожен із подією", () => {
    const save = game();
    for (let i = 0; i < 10; i++) withCat(save);
    const { events, stop } = recordEvents();
    nightlyTraces(save.current);
    stop();
    expect(catDays(save.current)).toBe(10);
    expect(traceEvents(events)).toEqual(["bath-mat", "bedroom-rug", "wallpaper"]);
  });

  /** Прожити день до сну, як найпростіший гравець (`liveDay`), і заснути з таким здоровим глуздом. */
  function sleepWith(save: Save, sanity: number): void {
    const stats = save.current.character.stats;
    Object.assign(stats, { satiety: 100, hygiene: 100 });
    advance(save, hours(8));
    Object.assign(stats, { satiety: 100, hygiene: 100 });
    advance(save, hours(hoursUntilWake(save.current) - 8));
    expect(save.current.end).toBeNull();
    save.current.character.stats.sanity = sanity;
    goToSleep(save);
  }

  it("справжня ніч: котодні — коти, що прожили день; кошеня, що з'явилося вночі, — з наступної ночі", () => {
    const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 3 }));
    // Перший кіт — кошеня з притулку вночі (§8.3): цієї ночі котоднів ще немає.
    sleepWith(save, 10);
    expect(save.current.cats).toHaveLength(1);
    expect(catDays(save.current)).toBe(0);
    sleepWith(save, 90);
    expect(catDays(save.current)).toBe(1);
    expect(traces(save.current)).toEqual([]);
    sleepWith(save, 90);
    expect(catDays(save.current)).toBe(2);
    expect(traces(save.current)).toEqual(["bath-mat"]);
  });
});

describe("сліди в збереженнях, сценаріях і переграванні (§6.1, §9.12)", () => {
  it("у новій грі слідів немає, котодні — 0 і рахуються з першої ночі", () => {
    const save = game();
    withCat(save);
    withCat(save);
    const loaded = deserialize(serialize(save)).current;
    expect(traces(loaded)).toEqual([]);
    expect(catDays(loaded)).toBe(0);
    expect(loaded.home.traces).toBeUndefined();
    nightlyTraces(loaded);
    expect(catDays(loaded)).toBe(2);
    expect(traces(loaded)).toEqual(["bath-mat"]);
    expect(addTrace(loaded, "sofa")).toBe(true);
    expect(addTrace(loaded, "sofa")).toBe(false);
    expect(traces(loaded)).toEqual(["bath-mat", "sofa"]);
  });

  it("збереження пам'ятає сліди й котодні в усіх знімках", () => {
    const save = game();
    save.current.home.boxes = { food: { cheap: 2, premium: 0 } };
    addTrace(save.current, "rug");
    addTrace(save.current, "boxes-claws");
    save.current.home.catDays = 3;
    addTrace(save.current, "bath-mat");
    save.weekStart = structuredClone(save.current);
    const loaded = deserialize(serialize(save));
    for (const state of [loaded.current, loaded.weekStart]) {
      expect(traces(state)).toEqual(["rug", "boxes-claws", "bath-mat"]);
      expect(catDays(state)).toBe(3);
    }
  });

  it("перегравання дня й тижня повертає сліди й котодні знімка", () => {
    const save = game();
    // Кіт, що лазить, може за день видертися на шафу й лишити слід, якого перелік нижче не чекає.
    withCat(save, { climbing: -1 });
    addTrace(save.current, "sofa");
    save.current.home.catDays = 1;
    // Ніч: знімок дня — з диваном і котоднями після неї.
    advance(save, hours(hoursUntilWake(save.current) - 8));
    save.current.character.stats.sanity = 90;
    goToSleep(save);
    expect(catDays(save.current)).toBe(2);
    expect(traces(save.current)).toEqual(["sofa", "bath-mat"]);
    addTrace(save.current, "rug");
    save.current.home.catDays = 7;
    replayDay(save);
    expect(traces(save.current)).toEqual(["sofa", "bath-mat"]);
    expect(catDays(save.current)).toBe(2);
    // Знімок тижня — понеділок до слідів.
    replayWeek(save);
    expect(traces(save.current)).toEqual([]);
    expect(catDays(save.current)).toBe(0);
  });
});
