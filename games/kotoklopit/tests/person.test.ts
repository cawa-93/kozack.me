// Персонаж без статі (§5.1; рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А4): звертання «він / вона» — лише граматика.

import { describe, expect, it } from "vitest";

import { dash } from "../src/sim/body";
import { changeStat } from "../src/sim/character";
import { createCat } from "../src/sim/cat";
import { DASH_COOLDOWN_MINUTES } from "../src/sim/config";
import { addSupply } from "../src/sim/economy";
import { advance, DEFAULT_LOOK, DEFAULT_NAME, goToSleep, interact, newGame } from "../src/sim/game";
import { hygieneFactor } from "../src/sim/household";
import { addCat } from "../src/sim/night";
import { hoursUntilWake } from "../src/sim/sleep";
import { createRng } from "../src/sim/rng";
import { fallIllPerson } from "../src/sim/illness";
import { CHARACTER_NAMES, fill } from "../src/texts";
import type { GameState, Look, Save } from "../src/sim/types";
import { callImpression } from "../src/sim/work";
import { chronotypeCard, startName } from "../src/ui/cards";
import { nameRng, randomName } from "../src/ui/charname";
import { LOOK_OPTIONS, lookRng, randomLook } from "../src/ui/look";
import { BUILDS, FACES, HAIR_STYLES, PALETTE } from "../src/view/palette";
import { bodyMinutes, hours, recordEvents, standAt, withCatCorner } from "./helpers";

/** Що відповів умивальник на дію: причина відмови чи undefined. */
function sinkRefusal(save: Save): unknown {
  standAt(save, "sink");
  const { events, stop } = recordEvents();
  interact(save);
  stop();
  const event = events.find((e) => e.type === "refused");
  return event?.type === "refused" ? event.reason : undefined;
}

/** Хвилина тіла ходьби праворуч із середини вітальні: скільки клітинок пройдено. */
function walkMinute(save: Save): number {
  Object.assign(save.current.character.body, { x: 4.5, y: 8.5, facing: { x: 1, y: 0 } });
  advance(save, bodyMinutes(1), { move: { x: 1, y: 0 }, hold: false });
  return save.current.character.body.x - 4.5;
}

describe("жіночого циклу немає (рішення автора 2026-10-29, А4)", () => {
  it("будь-якого дня 28-денного «циклу» жіночий персонаж ходить, робить ривок і втрачає гігієну, як завжди", () => {
    for (let day = 0; day < 28; day++) {
      const save = newGame({ address: "she", difficulty: "normal", seed: 1 });
      const state = save.current;
      state.day = day;
      state.modifiers = { day: null, week: null };
      expect(walkMinute(save)).toBeCloseTo(3);
      expect(hygieneFactor(state)).toBe(1);
      expect(dash(state)).toBe(true);
      expect(state.character.body.dashCooldown).toBe(DASH_COOLDOWN_MINUTES);
    }
  });
});

describe("бороди немає (рішення автора 2026-10-29, А4)", () => {
  it("враження на відеодзвінку щодня однакове для обох персонажів: ні бонусу за охайність, ні штрафу за щетину", () => {
    for (const address of ["she", "he"] as const) {
      const save = newGame({ address, difficulty: "normal", seed: 1 });
      const state = save.current;
      state.character.stats.hygiene = 50;
      for (let day = 0; day < 10; day++) {
        state.day = day;
        expect(callImpression(state)).toBe(0);
      }
      // Відчутне лишається: гігієна від 75 — бонус, брудний одяг — штраф (§8.6).
      state.character.stats.hygiene = 75;
      expect(callImpression(state)).toBe(0.5);
      state.home.clothes = 0;
      expect(callImpression(state)).toBe(0);
    }
  });

  it("умивальник у чоловічого персонажа — як у жіночого: ліки для себе або відмова, ні гоління, ні підрівнювання", () => {
    const save = newGame({ address: "he", difficulty: "normal", seed: 1 });
    save.current.modifiers.day = null;
    save.current.day = 6;
    expect(sinkRefusal(save)).toBe("healthy");
    fallIllPerson(save.current, "cold");
    expect(sinkRefusal(save)).toBe("empty");
    addSupply(save.current, "humanMeds", "cheap", 5);
    expect(sinkRefusal(save)).toBeUndefined();
    expect(sinkRefusal(save)).toBe("dose-taken");
  });
});

describe("хронотип — лише час пробудження (рішення автора 2026-10-29, А4)", () => {
  it("картка хронотипу — лише вибір, без пояснень: спершу обрано жайворонка", () => {
    const card = chronotypeCard("lark", () => undefined, () => undefined, () => undefined);
    expect(card.body).toEqual([]);
    expect(card.choices?.filter((c) => c.chosen).map((c) => c.label)).toEqual(["Жайворонок"]);
  });

  it("вибір лише позначає хронотип, а далі ведуть «Назад» ліворуч і «Далі» праворуч", () => {
    const picked: string[] = [];
    let advanced = 0;
    const card = chronotypeCard("owl", (c) => picked.push(c), () => advanced++, () => undefined);
    expect(card.choices?.filter((c) => c.chosen).map((c) => c.label)).toEqual(["Сова"]);
    card.choices?.[0]?.onSelect();
    expect(picked).toEqual(["lark"]);
    expect(advanced).toBe(0);
    expect(card.steps).toBe(true);
    // Інакше Enter після «Назад» обирав би за гравця: головна дія — лише «Далі».
    expect(card.actions.map((a) => [a.label, a.primary ?? false])).toEqual([["Назад", false], ["Далі", true]]);
  });
});

describe("випадкове ім'я персонажа (§5.1)", () => {
  it("за звертанням і щоразу інше, ніж у полі", () => {
    const rng = nameRng(7);
    for (const address of ["he", "she"] as const) {
      let name = DEFAULT_NAME[address];
      for (let i = 0; i < 30; i++) {
        const next = randomName(address, name, rng);
        expect(CHARACTER_NAMES[address]).toContain(next);
        expect(next).not.toBe(name);
        name = next;
      }
    }
  });

  it("ім'я за замовчуванням — перше в переліку свого звертання", () => {
    expect(CHARACTER_NAMES.he[0]).toBe(DEFAULT_NAME.he);
    expect(CHARACTER_NAMES.she[0]).toBe(DEFAULT_NAME.she);
  });
});

describe("звертання «він / вона» — лише граматика (рішення автора 2026-10-29, А4)", () => {
  it("тексти обирають форму за звертанням: «він» — чоловічу, «вона» — жіночу", () => {
    expect(fill("{персонаж} [звільнений|звільнена]", "he", { персонаж: "Саша" })).toBe("Саша звільнений");
    expect(fill("{персонаж} [звільнений|звільнена]", "she", { персонаж: "Саша" })).toBe("Саша звільнена");
  });

  it("з тим самим seed і вибором чотири дні гри з котом однакові для «він» і «вона» — відрізняється лише звертання", () => {
    const week = (address: "he" | "she"): GameState => {
      const save = withCatCorner(newGame({ address, difficulty: "normal", seed: 21, name: "Саша", look: DEFAULT_LOOK, chronotype: "owl" }));
      addCat(save.current, createCat(save.current, createRng(1), { source: "shelter", ageWeeks: 3 }));
      // Як liveDay, але й здоровий глузд підтримано: кіт без догляду лишає безлад, а гра не має закінчитися. Довше — скінчиться
      // чистий одяг, і гігієна обвалиться.
      const freshen = (): void => {
        for (const stat of ["satiety", "hygiene", "sanity"] as const) changeStat(save.current, stat, 100);
      };
      for (let day = 0; day < 4; day++) {
        freshen();
        advance(save, hours(8));
        freshen();
        advance(save, hours(hoursUntilWake(save.current) - 8));
        goToSleep(save);
      }
      return { ...save.current, character: { ...save.current.character, address: "she" } };
    };
    const he = week("he");
    expect(he.end).toBeNull();
    expect(he.day).toBe(4);
    expect(he.cats.length).toBeGreaterThan(0);
    expect(he).toEqual(week("she"));
  });
});

describe("редактор персонажа один для всіх (рішення автора 2026-10-29, А4)", () => {
  it("редактор пропонує кожну частину зовнішності й усі її варіанти, які вміє намалювати графіка", () => {
    expect(LOOK_OPTIONS.map((o) => o.key).sort()).toEqual(Object.keys(DEFAULT_LOOK).sort());
    const drawn: Record<keyof Look, number> = {
      face: FACES.length,
      skin: PALETTE.skin.length,
      hair: HAIR_STYLES.length,
      hairColor: PALETTE.hairColor.length,
      eyes: PALETTE.eyes.length,
      build: BUILDS.length,
      top: PALETTE.clothes.length,
      bottom: PALETTE.clothes.length,
      shoes: PALETTE.clothes.length,
    };
    for (const { key, options } of LOOK_OPTIONS) expect(options.length, key).toBe(drawn[key]);
  });

  it("випадкова зовнішність поєднує частини як завгодно: кожна зачіска з кожною статурою й кожним обличчям", () => {
    const combos = new Set<string>();
    for (let seed = 1; seed <= 600; seed++) {
      const look = randomLook(lookRng(seed));
      for (const { key, options } of LOOK_OPTIONS) {
        expect(Number.isInteger(look[key]), key).toBe(true);
        expect(look[key], key).toBeGreaterThanOrEqual(0);
        expect(look[key], key).toBeLessThan(options.length);
      }
      combos.add(`${look.hair}-${look.build}-${look.face}`);
    }
    expect(combos.size).toBe(HAIR_STYLES.length * BUILDS.length * FACES.length);
  });

  it("та сама нова гра починає редактор з тієї самої зовнішності: генератор — із seed гри", () => {
    expect(randomLook(lookRng(5))).toEqual(randomLook(lookRng(5)));
    const looks = new Set(Array.from({ length: 10 }, (_, seed) => JSON.stringify(randomLook(lookRng(seed)))));
    expect(looks.size).toBeGreaterThan(1);
  });

  it("без редактора зовнішність одна для всіх: «він» і «вона» з тим самим seed виглядають однаково", () => {
    const he = newGame({ address: "he", difficulty: "normal", seed: 3 }).current.character.look;
    const she = newGame({ address: "she", difficulty: "normal", seed: 3 }).current.character.look;
    expect(he).toEqual(DEFAULT_LOOK);
    expect(she).toEqual(DEFAULT_LOOK);
    // Своя копія в кожній грі: змінити її — не змінити зовнішності за замовчуванням.
    he.hair = 3;
    expect(DEFAULT_LOOK.hair).toBe(1);
  });

  it("малюнок персонажа не знає ні статі, ні звертання: портрет і персонаж у квартирі беруть лише зовнішність", () => {
    const sources = import.meta.glob<string>(
      ["../src/ui/portrait.ts", "../src/view/iso/personportrait.ts", "../src/view/art/recipes.ts", "../src/view/rig/defs/person.ts"],
      { query: "?raw", import: "default", eager: true },
    );
    expect(Object.keys(sources)).toHaveLength(4);
    for (const [file, source] of Object.entries(sources)) expect(source, file).not.toMatch(/\b(sex|Sex|address|Address)\b/);
  });

  it("ім'я на кроці «Ім'я»: власне лишається за будь-якого звертання, а за замовчуванням — за звертанням", () => {
    expect(startName("he", null)).toBe("Тарас");
    expect(startName("she", null)).toBe("Марта");
    // Гравець прийняв ім'я за замовчуванням, а потім повернувся й обрав інше звертання.
    expect(startName("she", { name: "Тарас", address: "he" })).toBe("Марта");
    expect(startName("he", { name: "Марта", address: "she" })).toBe("Тарас");
    expect(startName("he", { name: " ", address: "he" })).toBe("Тарас");
    expect(startName("he", { name: "Саша", address: "he" })).toBe("Саша");
    expect(startName("she", { name: "Саша", address: "he" })).toBe("Саша");
  });

  it("ім'я, що збігається з ім'ям за замовчуванням іншого звертання, — теж власне: «Марта» для «він» лишається «Мартою»", () => {
    // «Далі» → «Складність» → «Назад»: звертання те саме, а ім'я раніше підмінялося на «Тарас».
    expect(startName("he", { name: "Марта", address: "he" })).toBe("Марта");
    // І коли потім обрали «вона».
    expect(startName("she", { name: "Марта", address: "he" })).toBe("Марта");
    expect(startName("she", { name: "Тарас", address: "she" })).toBe("Тарас");
  });
});
