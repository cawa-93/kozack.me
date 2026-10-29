// Персонаж без статі (§5.1; рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А4): звертання «він / вона» — лише граматика.

import { describe, expect, it } from "vitest";

import { dash } from "../src/sim/body";
import { changeStat } from "../src/sim/character";
import { createCat } from "../src/sim/cat";
import { DASH_COOLDOWN_MINUTES } from "../src/sim/config";
import { addSupply } from "../src/sim/economy";
import { advance, DEFAULT_LOOK, deserialize, goToSleep, interact, newGame, serialize } from "../src/sim/game";
import { hygieneFactor } from "../src/sim/household";
import { addCat } from "../src/sim/night";
import { hoursUntilWake } from "../src/sim/sleep";
import { createRng } from "../src/sim/rng";
import { fallIllPerson } from "../src/sim/illness";
import { fill } from "../src/texts";
import type { GameState, Look, Save } from "../src/sim/types";
import { callImpression } from "../src/sim/work";
import { chronotypeCard, startName } from "../src/ui/cards";
import { LOOK_OPTIONS, lookRng, randomLook } from "../src/ui/look";
import { BUILDS, FACES, HAIR_STYLES, PALETTE } from "../src/view/palette";
import { hours, recordEvents, standAt, withCatCorner } from "./helpers";

/** Що відповів умивальник на дію: причина відмови чи undefined. */
function sinkRefusal(save: Save): unknown {
  standAt(save, "sink");
  const { events, stop } = recordEvents();
  interact(save);
  stop();
  const event = events.find((e) => e.type === "refused");
  return event?.type === "refused" ? event.reason : undefined;
}

/** Хвилина ходьби праворуч із середини вітальні: скільки клітинок пройдено. */
function walkMinute(save: Save): number {
  Object.assign(save.current.character.body, { x: 4.5, y: 8.5, facing: { x: 1, y: 0 } });
  advance(save, 1, { move: { x: 1, y: 0 }, hold: false });
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

  it("зі старого збереження зникає день початку циклу", () => {
    const save = newGame({ address: "she", difficulty: "normal", seed: 1 });
    Object.assign(save.current.character, { cycleStart: -12 });
    const loaded = deserialize(serialize(save));
    expect(loaded.current.character).not.toHaveProperty("cycleStart");
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

  it("зі старого збереження зникають дні гоління й підрівнювання", () => {
    const save = newGame({ address: "he", difficulty: "normal", seed: 1 });
    Object.assign(save.current.character, { beard: { shaved: 0, trimmed: -100 } });
    const loaded = deserialize(serialize(save));
    expect(loaded.current.character).not.toHaveProperty("beard");
  });
});

describe("хронотип — лише час пробудження (рішення автора 2026-10-29, А4)", () => {
  it("картка хронотипу називає час пробудження й не обіцяє бадьорості в якісь години", () => {
    const card = chronotypeCard(null, () => undefined, () => undefined);
    expect(card.body).toEqual(["Жайворонок прокидається о 06:00.", "Сова прокидається о 08:00."]);
  });

  it("повернувшись «Назад» з кроку «Ім'я», гравець бачить обраний хронотип: головна кнопка — його, а спершу — жайворонок", () => {
    const primary = (chosen: "lark" | "owl" | null): string[] =>
      chronotypeCard(chosen, () => undefined, () => undefined)
        .actions.filter((a) => a.primary)
        .map((a) => a.label);
    expect(primary(null)).toEqual(["Жайворонок"]);
    expect(primary("lark")).toEqual(["Жайворонок"]);
    // Інакше Enter після «Назад» тихо міняв би сову на жайворонка.
    expect(primary("owl")).toEqual(["Сова"]);
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

  it("стара гра: стать персонажа стає звертанням (чоловіча — «він», жіноча — «вона»), а хронотип лишається, який був", () => {
    for (const [sex, address] of [["male", "he"], ["female", "she"]] as const) {
      const save = newGame({ address: "she", difficulty: "normal", seed: 1, chronotype: "owl" });
      const old = save.current.character as unknown as Record<string, unknown>;
      delete old["address"];
      old["sex"] = sex;
      const loaded = deserialize(serialize(save)).current.character;
      expect(loaded.address).toBe(address);
      expect(loaded).not.toHaveProperty("sex");
      expect(loaded.chronotype).toBe("owl");
    }
  });
});

describe("редактор персонажа один для всіх (рішення автора 2026-10-29, А4)", () => {
  /** Зовнішності за замовчуванням, які були до рішення: жіноча й чоловіча. */
  const OLD_LOOKS: Record<"female" | "male", Look> = {
    female: { face: 0, skin: 1, hair: 1, hairColor: 1, eyes: 0, build: 1, top: 0, bottom: 0, shoes: 0 },
    male: { face: 0, skin: 1, hair: 0, hairColor: 0, eyes: 0, build: 1, top: 1, bottom: 0, shoes: 0 },
  };

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

  it("стара гра: зовнішність лишається тією самою — частини конструктора й раніше були спільні", () => {
    for (const sex of ["female", "male"] as const) {
      const look = { ...OLD_LOOKS[sex], hair: 3, build: 2 };
      const save = newGame({ address: "she", difficulty: "normal", seed: 1, look });
      const old = save.current.character as unknown as Record<string, unknown>;
      delete old["address"];
      old["sex"] = sex;
      expect(deserialize(serialize(save)).current.character.look).toEqual(look);
    }
  });

  it("малюнок персонажа не знає ні статі, ні звертання: портрет і персонаж у квартирі беруть лише зовнішність", () => {
    const sources = import.meta.glob<string>(["../src/ui/portrait.ts", "../src/view/person.ts"], { query: "?raw", import: "default", eager: true });
    expect(Object.keys(sources)).toHaveLength(2);
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
