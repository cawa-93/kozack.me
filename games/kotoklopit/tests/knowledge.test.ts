// Що знає персонаж (§9.9): прояви рис зараховуються лише свідком, три рівні видимості.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { decide, jealousy, tickCats } from "../src/sim/catai";
import { giveTreat } from "../src/sim/care";
import { pickUpCat } from "../src/sim/actions";
import { advance, newGame } from "../src/sim/game";
import { tapWasher } from "../src/sim/household";
import { absoluteMinute } from "../src/sim/time";
import { decideFoundling } from "../src/sim/modifiers";
import { TRAIT_GROUPS } from "../src/sim/traits";
import { fill } from "../src/texts";
import { traitNews } from "../src/ui/traits";
import { observe, visibility, witnesses } from "../src/sim/knowledge";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Cat, Save, TraitLevel } from "../src/sim/types";
import { changeRelation, nightlyRelations, relation } from "../src/sim/relations";
import { recordEvents, withCatCorner } from "./helpers";

function game(difficulty: "easy" | "normal" | "hard" = "normal"): Save {
  const save = newGame({ sex: "female", difficulty, seed: 4 });
  save.current.character.body.x = 9.5;
  save.current.character.body.y = 8.5;
  return save;
}

function withCat(save: Save, traits: Record<string, TraitLevel>, at = { x: 5.5, y: 8.5 }): Cat {
  const cat = createCat(save.current, createRng(2), { source: "shelter", ageWeeks: 3, at });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.arrivedDay = -10;
  addCat(save.current, cat);
  return cat;
}

describe("свідок (§9.9)", () => {
  it("персонаж бачить кота в тій самій кімнаті, але не в іншій", () => {
    const save = game();
    const living = withCat(save, {});
    const kitchen = withCat(save, {}, { x: 16.5, y: 2.5 });
    expect(witnesses(save.current, living)).toBe(true);
    expect(witnesses(save.current, kitchen)).toBe(false);
  });

  it("крізь стіну не видно, а з проходу між кімнатами — видно (пошук багів 2026-10-25)", () => {
    const save = game();
    // Ванна й кухня поруч, але між ними стіна.
    Object.assign(save.current.character.body, { x: 11.5, y: 2.5 });
    const kitchen = withCat(save, {}, { x: 13.5, y: 2.5 });
    expect(witnesses(save.current, kitchen)).toBe(false);
    // Персонаж у проході зі спальні до вітальні бачить кота у вітальні поруч.
    Object.assign(save.current.character.body, { x: 3.5, y: 5.5 });
    const living = withCat(save, {}, { x: 3.5, y: 7.5 });
    expect(witnesses(save.current, living)).toBe(true);
  });

  it("кіт на руках — завжди на очах, де б його не підняли; з душової кабіни не видно нікого", () => {
    const save = game();
    const cat = withCat(save, { water: 2 }, { x: 16.5, y: 2.5 });
    save.current.character.held = { kind: "cat", cat: cat.id };
    expect(witnesses(save.current, cat)).toBe(true);
    observe(save.current, cat, "water");
    expect(cat.traits[0]?.seen).toBe(1);
    save.current.character.held = null;
    Object.assign(cat, { x: 9.5, y: 8.5 });
    save.current.character.activity = { kind: "use", object: "shower", minutes: 5, inside: true } as unknown as NonNullable<Save["current"]["character"]["activity"]>;
    expect(witnesses(save.current, cat)).toBe(false);
  });

  it("кіт, що втік на сходи, не видно; кіт у переносці — видно, поки персонаж у поїздці з ним", () => {
    const save = game();
    const cat = withCat(save, {}, { x: 9.5, y: 8.5 });
    cat.away = "stairs";
    expect(witnesses(save.current, cat)).toBe(false);
    cat.away = "trip";
    expect(witnesses(save.current, cat)).toBe(false);
    save.current.trip = { destination: "vet" } as unknown as NonNullable<Save["current"]["trip"]>;
    expect(witnesses(save.current, cat)).toBe(true);
  });
});

describe("прояв — лише того боку, що показала поведінка (пошук багів 2026-10-25)", () => {
  it("«Тихоня» не відкривається тим, що нявкає інший бік групи; «Балакучий» — відкривається", () => {
    const save = game();
    const quiet = withCat(save, { talkative: -2 });
    const loud = withCat(save, { talkative: 2 });
    observe(save.current, quiet, "talkative");
    observe(save.current, loud, "talkative");
    expect(quiet.traits[0]?.seen).toBe(0);
    expect(loud.traits[0]?.seen).toBe(1);
    // «Годинами лежить» — прояв спокійного, а не енергійного.
    const calm = withCat(save, { energy: -1 });
    observe(save.current, calm, "energy", -1);
    observe(save.current, calm, "energy");
    expect(calm.traits[0]?.seen).toBe(1);
  });

  it("голодний кіт без корму не відкриває риси уваги за мить: похід по увагу — один прояв, і він не «Ласкавість»", () => {
    const save = withCatCorner(game("hard"));
    save.current.modifiers.day = null;
    save.current.day = 8;
    save.current.minute = 14 * 60;
    Object.assign(save.current.character.body, { x: 16.5, y: 3.5 });
    for (const item of save.current.home.items) if (item.kind === "bowl") item.food = 0;
    const cat = withCat(save, { affection: 2, demanding: 2, talkative: 2 }, { x: 15.5, y: 3.5 });
    cat.needs = { hunger: 95, thirst: 0, toilet: 0, fatigue: 0, attention: 70, play: 0 };
    cat.act = { kind: "attention", target: "character", goal: null, minutes: 20, elapsed: 0, forFood: true };
    // Дві години кіт то просить біля миски, то йде до персонажа: раніше кожен крок давав прояв (9 за дві години).
    for (let i = 0; i < 6000; i++) advance(save, 0.02);
    const seen = (group: string): number => cat.traits.find((t) => t.group === group)?.seen ?? 0;
    expect(seen("talkative")).toBeGreaterThan(0);
    for (const trait of cat.traits) expect(trait.seen, trait.group).toBeLessThanOrEqual(5);
    // Прийшов, бо голодний, а миски порожні, — це не «Ласкавість» (рішення автора 2026-10-25).
    expect(seen("affection")).toBe(0);
  });

  it("«Вимогливість» видно за тривалістю походу без ласки: довше звичайного — «+», пішов раніше — «−»; «Ласкавість» — коли прийшов", () => {
    const seenAfterVisit = (demanding: TraitLevel): { demanding: number; affection: number; minutes: number } => {
      const save = withCatCorner(game());
      save.current.modifiers.day = null;
      save.current.day = 8;
      save.current.minute = 14 * 60;
      const cat = withCat(save, { demanding, affection: 1 }, { x: 8.5, y: 8.5 });
      cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 90, play: 0 };
      decide(save.current, cat, createRng(1), { present: true });
      const minutes = cat.act.kind === "attention" ? cat.act.minutes : 0;
      // Персонаж не гладить: кіт ходить слідом, поки похід не скінчиться.
      for (let i = 0; i < 80; i++) advance(save, 0.5);
      return { demanding: cat.traits[0]?.seen ?? 0, affection: cat.traits[1]?.seen ?? 0, minutes };
    };
    const loud = seenAfterVisit(2);
    expect(loud.minutes).toBeCloseTo(30);
    expect(loud.demanding).toBeGreaterThanOrEqual(1);
    expect(loud.affection).toBeGreaterThanOrEqual(1);
    const modest = seenAfterVisit(-2);
    expect(modest.minutes).toBeCloseTo(10);
    expect(modest.demanding).toBeGreaterThanOrEqual(1);
  });
});

describe("чесні прояви (рішення автора 2026-10-25, `TRAITS_REVIEW.md`)", () => {
  it("порода й характер протилежні: прояв — лише коли знак суми збігається зі знаком риси", () => {
    const save = game();
    // «Спокійна» сомалі: +2 породи й −1 характеру — поводиться як енергійна, тож не відкривається ні так, ні так.
    const somali = withCat(save, { energy: -1 });
    somali.breed = ["somali", "somali"];
    observe(save.current, somali, "energy", -1);
    observe(save.current, somali, "energy");
    expect(somali.traits[0]?.seen).toBe(0);
    // «Вічний двигун» перська напівкровка: +2 характеру й −1 породи — сума +1, енергійна.
    const persian = withCat(save, { energy: 2 });
    persian.breed = ["perska", "mixed"];
    observe(save.current, persian, "energy");
    expect(persian.traits[0]?.seen).toBe(1);
    // Сума 0 — кіт поводиться як звичайний, риса не відкривається.
    const zero = withCat(save, { energy: 1 });
    zero.breed = ["perska", "mixed"];
    observe(save.current, zero, "energy");
    expect(zero.traits[0]?.seen).toBe(0);
  });

  it("ласощі — дія гравця: «Жебракування» не відкривають, а «Поступливий» після неприємного відтає й муркоче", () => {
    const save = game();
    save.current.home.supplies.treats.cheap = 5;
    const cat = withCat(save, { begging: 2, vengeful: -1 }, { x: 9.5, y: 8.5 });
    save.current.character.held = { kind: "cat", cat: cat.id };
    giveTreat(save.current, "cheap", createRng(1));
    expect(cat.traits[0]?.seen).toBe(0);
    expect(cat.traits[1]?.seen).toBe(0);
    // Неприємне від персонажа (§9.12): за брудний лоток чи день без уваги «Поступливий» не «відтає» — образи не було.
    cat.hurt = { at: absoluteMinute(save.current.day, save.current.minute), amount: 2 };
    giveTreat(save.current, "cheap", createRng(1));
    expect(cat.traits[1]?.seen).toBe(0);
    cat.hurt = { at: absoluteMinute(save.current.day, save.current.minute), amount: 2 };
    cat.offense = { at: absoluteMinute(save.current.day, save.current.minute) };
    const { events, stop } = recordEvents();
    giveTreat(save.current, "cheap", createRng(1));
    stop();
    expect(cat.traits[0]?.seen).toBe(0);
    expect(cat.traits[1]?.seen).toBe(1);
    expect(events.some((e) => e.type === "purr" && e.cat === cat.id)).toBe(true);
  });

  it("прогнати кота з місця — ще не прояв «Образливості»: дутися він має потім", () => {
    const save = game();
    const cat = withCat(save, { touchy: 2 }, { x: 9.5, y: 8.5 });
    cat.act = { kind: "lap", target: "character", goal: null, minutes: 60, elapsed: 0 };
    pickUpCat(save.current, cat);
    expect(cat.traits[0]?.seen).toBe(0);
  });

  it("бійка — прояв лише «Товариськості −»: «Територіальність» вона не відкриває", () => {
    const save = game();
    const a = withCat(save, { sociability: -1, territorial: 2 }, { x: 9.5, y: 8.5 });
    const b = withCat(save, {}, { x: 10.3, y: 8.5 });
    changeRelation(save.current, a, b, -80 - relation(save.current, a, b));
    // До бійки — протистояння (§9.4, рішення автора 2026-10-26): поки його немає, обидва знову стоять поруч без справ.
    for (let i = 0; i < 2000 && a.act.kind !== "fight"; i++) {
      for (const cat of [a, b]) cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 };
      if (a.act.kind !== "standoff" && b.act.kind !== "standoff") {
        // За 2,4 клітинки: ближче 2 вільні вороги розходяться (§9.4).
        Object.assign(a, { x: 8.3, y: 8.5 });
        Object.assign(b, { x: 10.7, y: 8.5 });
        for (const cat of [a, b]) cat.act = { kind: "idle", target: null, goal: null, minutes: 5, elapsed: 0 };
      }
      tickCats(save.current, 0.25, { present: true });
    }
    expect(a.act.kind).toBe("fight");
    expect(a.traits[0]?.seen).toBe(1);
    expect(a.traits[1]?.seen).toBe(0);
  });

  it("«Енергійність +» — активна забава, а не прогулянка", () => {
    let wandered = 0;
    let played = 0;
    for (let seed = 0; seed < 40; seed++) {
      const save = withCatCorner(game());
      save.current.modifiers.day = null;
      save.current.minute = 19 * 60;
      save.current.rng.behavior = seed;
      const cat = withCat(save, { energy: 2 }, { x: 8.5, y: 8.5 });
      cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 100 };
      cat.act = { kind: "idle", target: null, goal: null, minutes: 0, elapsed: 0 };
      tickCats(save.current, 0.01, { present: true });
      const seen = cat.traits[0]?.seen ?? 0;
      if (cat.act.kind === "wander") {
        wandered += 1;
        expect(seen, `seed ${seed}`).toBe(0);
      } else {
        played += 1;
        expect(seen, `seed ${seed}: ${cat.act.kind}`).toBe(1);
      }
    }
    expect(wandered).toBeGreaterThan(0);
    expect(played).toBeGreaterThan(0);
  });

  it("застали кота в барабані пральної машини — прояв «Допитливості»", () => {
    const save = game();
    Object.assign(save.current.character.body, { x: 10.5, y: 2.5 });
    const cat = withCat(save, { curiosity: 1 }, { x: 10.5, y: 1.5 });
    cat.act = { kind: "sleep", target: null, goal: null, minutes: 60, elapsed: 0 };
    expect(tapWasher(save.current)).toBe("cat");
    expect(cat.traits[0]?.seen).toBe(1);
  });

  it("біля лотка: «Акуратний» нічого не розкидав, «Спартанець» спокійно сходив у брудний лоток", () => {
    const save = withCatCorner(game());
    save.current.modifiers.day = null;
    Object.assign(save.current.character.body, { x: 9.5, y: 2.5 });
    const box = save.current.home.items.find((i) => i.kind === "litter");
    if (box?.kind !== "litter") throw new Error("немає лотка");
    box.uses = 99;
    const cat = withCat(save, { scatter: -1, litterPicky: -2 }, { x: 8.5, y: 3.5 });
    cat.needs = { hunger: 0, thirst: 0, toilet: 90, fatigue: 0, attention: 0, play: 0 };
    cat.act = { kind: "toilet", target: `item:${box.id}`, goal: null, minutes: 0.05, elapsed: 0 };
    tickCats(save.current, 0.1, { present: true });
    expect(cat.traits[0]?.seen).toBe(1);
    expect(cat.traits[1]?.seen).toBe(1);
    expect(save.current.home.messes.some((m) => m.kind === "litter")).toBe(false);
  });
});

describe("рівні видимості (§9.9)", () => {
  it("на середній складності: 2 прояви — «❓», 4 — підказка, 6 — риса відкрита", () => {
    const save = game();
    const cat = withCat(save, { thief: 2 });
    const trait = cat.traits[0];
    if (!trait) throw new Error("немає риси");
    const stages: number[] = [];
    for (let i = 0; i < 6; i++) {
      observe(save.current, cat, "thief");
      stages.push(visibility(save.current, trait));
    }
    expect(stages).toEqual([0, 1, 1, 2, 2, 3]);
    expect(trait.known).toBe(true);
  });

  it("на легкій складності вистачає трьох проявів", () => {
    const save = game("easy");
    const cat = withCat(save, { zoomies: 1 });
    for (let i = 0; i < 3; i++) observe(save.current, cat, "zoomies");
    expect(cat.traits[0]?.known).toBe(true);
  });

  it("не свідок — не зараховується; тиха риса не проявляється ніколи", () => {
    const save = game();
    const cat = withCat(save, { thief: 1, longevity: 2 }, { x: 16.5, y: 2.5 });
    observe(save.current, cat, "thief");
    expect(cat.traits[0]?.seen).toBe(0);
    cat.x = 9.5;
    cat.y = 8.5;
    for (let i = 0; i < 10; i++) observe(save.current, cat, "longevity");
    expect(cat.traits[1]?.seen).toBe(0);
  });

  it("уночі, поки персонаж спить, прояви не видно", () => {
    const save = game();
    const cat = withCat(save, { hairballs: 2 });
    for (let i = 0; i < 24 * 60 * 3; i++) tickCats(save.current, 1, { present: false });
    expect(cat.traits[0]?.seen).toBe(0);
    expect(save.current.home.messes.some((m) => m.kind === "hairball")).toBe(true);
  });
});

describe("що видно про кота з самого початку (пошук багів 2026-10-25)", () => {
  it("знайда: порода видна на легкій і не видна на важкій — як у притулку (§9.11)", () => {
    for (const [difficulty, known] of [["easy", true], ["hard", false]] as const) {
      const save = game(difficulty);
      save.current.today.foundling = true;
      const cat = decideFoundling(save.current, true, createRng(3));
      expect(cat?.breedKnown, difficulty).toEqual([known, known]);
    }
  });

  it("прояви в картці — у роді кота й до гравця на «ви»", () => {
    for (const group of TRAIT_GROUPS) for (const sign of group.signs ?? []) if (sign !== null) expect(sign, group.id).not.toMatch(/персонаж/);
    const lap = TRAIT_GROUPS.find((g) => g.id === "lap")?.signs?.[0] ?? "";
    expect(fill(lap, "female")).toBe("сама застрибує на коліна й муркоче на руках");
  });
});

describe("телефон каже, що стало відомо про кота (§9.9, правка автора 2026-10-25)", () => {
  it("підказка — «Здається, …», відкрита риса — назва й опис, «❓» — нічого", () => {
    const save = game();
    const cat = withCat(save, { lap: 2 });
    Object.assign(cat, { name: "Мурка", sex: "female" });
    expect(traitNews(save.current, cat.id, "lap", 1)).toBeNull();
    expect(traitNews(save.current, cat.id, "lap", 2)).toEqual({ title: "Мурка", text: "Здається, сама застрибує на коліна й муркоче на руках." });
    const known = traitNews(save.current, cat.id, "lap", 3);
    expect(known?.title).toBe("Мурка — Коліночна");
    expect(known?.text.length).toBeGreaterThan(10);
  });
});

describe("дрібниці з рішення автора 2026-10-25", () => {
  it("«Товариськість» діє щоночі, а не лише в мить знайомства", () => {
    const save = game();
    const a = withCat(save, { sociability: -2 });
    const b = withCat(save, { sociability: -2 });
    const c = withCat(save, { sociability: 2 });
    const d = withCat(save, { sociability: 2 });
    save.current.relations = {};
    for (const [x, y] of [[a, b], [c, d]] as const) save.current.relations[`${Math.min(x.id, y.id)}-${Math.max(x.id, y.id)}`] = 0;
    nightlyRelations(save.current);
    expect(relation(save.current, a, b)).toBeCloseTo(-1.5);
    expect(relation(save.current, c, d)).toBeCloseTo(2.5);
  });

  it("ревнивий кіт, що бачить, шипить на щасливця; далекий — ні", () => {
    const save = game();
    const lucky = withCat(save, {}, { x: 9.5, y: 8.5 });
    const near = withCat(save, { jealousy: 2 }, { x: 7.5, y: 8.5 });
    const far = withCat(save, { jealousy: 2 }, { x: 16.5, y: 2.5 });
    const { events, stop } = recordEvents();
    jealousy(save.current, lucky);
    stop();
    const hisses = events.filter((e) => e.type === "hissed");
    expect(hisses).toEqual([{ type: "hissed", cat: near.id, at: lucky.id }]);
    expect(near.traits[0]?.seen).toBe(1);
    expect(far.traits[0]?.seen).toBe(0);
  });

  it("кіт, що розбудив уночі, — прояв «Нічної активності», хоч персонаж і спав", () => {
    const save = game();
    const cat = withCat(save, { nocturnal: 2 }, { x: 16.5, y: 2.5 });
    observe(save.current, cat, "nocturnal");
    expect(cat.traits[0]?.seen).toBe(0);
    observe(save.current, cat, "nocturnal", 1, true);
    expect(cat.traits[0]?.seen).toBe(1);
  });
});
