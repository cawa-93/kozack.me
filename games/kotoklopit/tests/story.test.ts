// Титри життя (§4.2): запис подій, яких не видно зі стану, шлях гравця (`lifeStory`) і підписи стрічки.

import { describe, expect, it } from "vitest";

import { applyScenario, addCatCorner, FILE_SCENARIOS } from "../src/dev/scenarios";
import { createCat } from "../src/sim/cat";
import { CAREER_AXIS, FIRST_WEEK_PROTECTION, JOB_SEARCH } from "../src/sim/config";
import { orderThing, receivePackages, tickDeliveries } from "../src/sim/economy";
import { advertise, removeCat } from "../src/sim/farewell";
import { advance, interact, newGame } from "../src/sim/game";
import { addCat, runNight } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { lifeStory, remember, type StoryItem } from "../src/sim/story";
import type { Address, AlbumEntry, Cat, CatSource, FarewellCause, GameState, Save, Sex } from "../src/sim/types";
import { changeReputation } from "../src/sim/work";
import { diseaseTitle, farewellText, fill, livingCatCaption, POSITION_TITLES, storyCaption, storyDate } from "../src/texts";
import { hours, standAt } from "./helpers";

const game = (address: Address = "she"): Save => newGame({ address, difficulty: "normal", seed: 3 });

/** Кіт, що з'явився вдома дня `day` у віці `age`; `now` — його вік зараз (за замовчуванням — як у день появи). */
function cat(state: GameState, options: { source: CatSource; age: number; day: number; now?: number; sex?: Sex; name?: string }): Cat {
  const c = createCat(state, createRng(state.nextId), {
    source: options.source,
    ageWeeks: options.now ?? options.age,
    ...(options.sex ? { sex: options.sex } : {}),
    ...(options.name ? { name: options.name } : {}),
  });
  c.arrivedDay = options.day;
  addCat(state, c);
  return c;
}

function farewell(state: GameState, c: Cat, cause: FarewellCause, day: number): AlbumEntry {
  return removeCat(state, c, cause, day);
}

const ofKind = <K extends StoryItem["kind"]>(items: StoryItem[], kind: K): Extract<StoryItem, { kind: K }>[] =>
  items.filter((i): i is Extract<StoryItem, { kind: K }> => i.kind === kind);

describe("запис подій титрів (§4.2)", () => {
  it("підвищення й пониження: день і посада після зміни", () => {
    const state = game().current;
    state.day = 10;
    changeReputation(state, 60);
    expect(state.story).toEqual([{ kind: "career", day: 10, change: "promoted", position: 1 }]);
    state.day = 12;
    state.job.position = 3;
    changeReputation(state, -60);
    expect(state.story?.[1]).toEqual({ kind: "career", day: 12, change: "demoted", position: 2 });
  });

  it("звільнення й нова робота — записи з днем", () => {
    const save = game();
    const state = save.current;
    state.day = FIRST_WEEK_PROTECTION.days;
    changeReputation(state, -60);
    expect(state.job.unemployed).toBe(true);
    expect(state.story).toEqual([{ kind: "career", day: FIRST_WEEK_PROTECTION.days, change: "fired", position: 0 }]);
    state.minute = hours(9);
    state.job.searchHours = JOB_SEARCH.hours.normal - 0.5;
    standAt(save, "computer");
    interact(save);
    advance(save, hours(1));
    expect(state.job.unemployed).toBe(false);
    expect(state.story?.[1]).toEqual({ kind: "career", day: FIRST_WEEK_PROTECTION.days, change: "hired", position: 0 });
  });

  it("доставка техніки: робот, фонтанчик і автогодівниця записані з якістю, ручний пилосос — ні", () => {
    const state = game().current;
    addCatCorner(state);
    state.day = 9;
    state.character.money = 100_000;
    expect(orderThing(state, "robot", "premium")).not.toBeNull();
    expect(orderThing(state, "fountain", "cheap")).not.toBeNull();
    expect(orderThing(state, "vacuum", "cheap")).not.toBeNull();
    expect(orderThing(state, "feeder", "premium")).not.toBeNull();
    expect(state.story).toBeUndefined();
    for (const delivery of state.home.deliveries) delivery.at = 0;
    tickDeliveries(state);
    receivePackages(state);
    expect(state.home.appliances.vacuum).toBe("cheap");
    expect(state.story).toEqual([
      { kind: "thing", day: 9, thing: "robot", quality: "premium" },
      { kind: "thing", day: 9, thing: "fountain", quality: "cheap" },
      { kind: "thing", day: 9, thing: "feeder", quality: "premium" },
    ]);
  });
});

describe("шлях гравця — lifeStory (§4.2)", () => {
  it("гра без `story` (збереження, старше за титри) — стрічка з котів: перший день, приїзд і прощання", () => {
    const state = game().current;
    state.day = 30;
    const murka = cat(state, { source: "shelter", age: 2, day: 4, now: 5 });
    const gone = cat(state, { source: "foundling", age: 1, day: 6, now: 3 });
    const entry = farewell(state, gone, { kind: "sorrow" }, 20);
    delete state.story;
    expect(lifeStory(state)).toEqual([
      { kind: "start", day: 0 },
      { kind: "arrival", day: 4, cat: { cat: murka, ageWeeks: 2 }, source: "shelter" },
      { kind: "arrival", day: 6, cat: { cat: entry, ageWeeks: 1 }, source: "foundling" },
      { kind: "farewell", day: 20, entry },
    ]);
  });

  it("за днем, а того самого дня — перший день, приїзд, пологи, техніка, кар'єра, прощання; далі — за id кота й порядком запису", () => {
    const state = game().current;
    state.day = 20;
    const mother = cat(state, { source: "shelter", age: 3, day: 0, sex: "female" });
    const a = cat(state, { source: "breeder", age: 2, day: 0 });
    const b = cat(state, { source: "shelter", age: 2, day: 0 });
    const newcomer = cat(state, { source: "foundling", age: 1, day: 3 });
    const kitten = cat(state, { source: "born", age: 0, day: 3 });
    kitten.parents = { mother: mother.id, father: null };
    remember(state, { kind: "career", day: 3, change: "promoted", position: 1 });
    remember(state, { kind: "thing", day: 3, thing: "robot", quality: "cheap" });
    // Прощання — у порядку альбому, а не за id.
    const gb = farewell(state, b, { kind: "sorrow" }, 3);
    const ga = farewell(state, a, { kind: "old" }, 3);
    const story = lifeStory(state);
    expect(story.map((i) => [i.day, i.kind])).toEqual([
      [0, "start"],
      [0, "arrival"],
      [0, "arrival"],
      [0, "arrival"],
      [3, "arrival"],
      [3, "births"],
      [3, "thing"],
      [3, "career"],
      [3, "farewell"],
      [3, "farewell"],
    ]);
    expect(ofKind(story, "arrival").map((i) => i.cat.cat.id)).toEqual([mother.id, a.id, b.id, newcomer.id]);
    expect(ofKind(story, "farewell").map((i) => i.entry)).toEqual([gb, ga]);
    expect(story.some((i) => i.kind === "arrival" && i.cat.cat.id === kitten.id)).toBe(false);
  });

  it("вік на фото приїзду — вік у день появи: кіт старшає щотижня в ніч на день своєї появи (§9.1)", () => {
    const state = game().current;
    state.day = 40;
    // Удома з 10-го дня, тоді — 3 тижні; відтоді постаршав 4 рази.
    const live = cat(state, { source: "shelter", age: 3, day: 10, now: 7 });
    // Туга вночі 30-го дня — до старшання тієї ночі: від 2-го дня постаршав 4 рази.
    const sad = farewell(state, cat(state, { source: "shelter", age: 1, day: 2, now: 5 }), { kind: "sorrow" }, 30);
    // Старість — у ніч, коли кіт постаршав (§9.2): ніч 27-го дня — його 4-та, і вік в альбомі вже з нею.
    const old = farewell(state, cat(state, { source: "breeder", age: 2, day: 0, now: 6 }), { kind: "old" }, 27);
    // Віддали вранці 15-го дня — після нічного старшання: від 1-го дня постаршав 2 рази.
    const given = farewell(state, cat(state, { source: "foundling", age: 1, day: 1, now: 3 }), { kind: "given" }, 15);
    const ages = new Map(ofKind(lifeStory(state), "arrival").map((i) => [i.cat.cat.id, i.cat.ageWeeks]));
    expect(ages.get(live.id)).toBe(3);
    expect(ages.get(sad.id)).toBe(1);
    expect(ages.get(old.id)).toBe(2);
    expect(ages.get(given.id)).toBe(1);
  });

  it("вік на фото — і в справжніх ночах: кіт постаршав, його віддали, а на фото приїзду він такий, як приїхав", () => {
    const save = game();
    const state = save.current;
    const c = cat(state, { source: "shelter", age: 2, day: 0 });
    for (let night = 0; night < 15; night++) {
      Object.assign(c, { health: 100, mood: 80 });
      state.character.stats.sanity = 100;
      // Рахунок «сплачено»: інакше другий тиждень виселяє (§6.4).
      state.home.utilitiesBill = 0;
      runNight(state, false);
    }
    expect(state.day).toBe(15);
    expect(c.ageWeeks).toBe(4);
    expect(ofKind(lifeStory(state), "arrival").find((i) => i.cat.cat.id === c.id)?.cat.ageWeeks).toBe(2);
    advertise(state, c);
    runNight(state, false);
    const entry = state.album.find((e) => e.id === c.id);
    expect(entry?.cause.kind).toBe("given");
    const story = lifeStory(state);
    expect(ofKind(story, "arrival").find((i) => i.cat.cat.id === c.id)?.cat.ageWeeks).toBe(2);
    expect(ofKind(story, "farewell").map((i) => [i.day, i.entry.id])).toEqual([[16, c.id]]);
  });

  it("пологи — один полароїд на маму й день: мама з віком того дня (жива чи з альбому), кошенята — з віком 0, і віддані теж", () => {
    const state = game().current;
    state.day = 35;
    // Удома з 3-го дня у 4 тижні; до 14-го постаршала раз, до 35-го — 4 рази.
    const murka = cat(state, { source: "shelter", age: 4, day: 3, now: 8, sex: "female", name: "Мурка" });
    // З розплідника 7-го дня у 5 тижнів; до 14-го постаршала раз, до прощання 30-го — 3 рази.
    const ryzhka = cat(state, { source: "breeder", age: 5, day: 7, now: 8, sex: "female", name: "Рижка" });
    const born = (mother: Cat | null, day: number, count: number): Cat[] =>
      Array.from({ length: count }, () => {
        const k = cat(state, { source: "born", age: 0, day, now: Math.floor((state.day - day) / 7) });
        k.parents = { mother: mother?.id ?? null, father: null };
        return k;
      });
    const first = born(murka, 14, 3);
    const second = born(ryzhka, 14, 2);
    const orphan = born(null, 21, 1);
    // Одне кошеня Мурки віддали, Рижки не стало.
    const givenKitten = farewell(state, first[1]!, { kind: "given" }, 22);
    const ryzhkaEntry = farewell(state, ryzhka, { kind: "sorrow" }, 30);
    const births = ofKind(lifeStory(state), "births");
    expect(births).toHaveLength(3);
    const [a, b, c] = births;
    expect(a?.day).toBe(14);
    expect(a?.mother).toEqual({ cat: murka, ageWeeks: 5 });
    expect(a?.kittens.map((k) => k.cat.id)).toEqual(first.map((k) => k.id));
    expect(a?.kittens.find((k) => k.cat.id === givenKitten.id)?.cat).toEqual(givenKitten);
    expect(a?.kittens.every((k) => k.ageWeeks === 0)).toBe(true);
    expect(b?.day).toBe(14);
    expect(b?.mother).toEqual({ cat: ryzhkaEntry, ageWeeks: 6 });
    expect(b?.kittens.map((k) => k.cat.id)).toEqual(second.map((k) => k.id));
    expect(c?.day).toBe(21);
    expect(c?.mother).toBeNull();
    expect(c?.kittens.map((k) => k.cat.id)).toEqual(orphan.map((k) => k.id));
  });

  it("кошеня в альбомі зі збереження, старшого за титри (без мами в записі), — з єдиним виводком того дня", () => {
    const state = game().current;
    state.day = 30;
    const mother = cat(state, { source: "shelter", age: 4, day: 0, now: 8, sex: "female" });
    const kittens = [0, 1].map(() => {
      const k = cat(state, { source: "born", age: 0, day: 14, now: 2 });
      k.parents = { mother: mother.id, father: null };
      return k;
    });
    const entry = farewell(state, kittens[0]!, { kind: "given" }, 20);
    delete (entry as { parents?: unknown }).parents;
    const births = ofKind(lifeStory(state), "births");
    expect(births).toHaveLength(1);
    expect(births[0]?.mother?.cat).toBe(mother);
    expect(births[0]?.kittens.map((k) => k.cat.id)).toEqual(kittens.map((k) => k.id));
  });

  it("техніка — лише перша поява кожного виду", () => {
    const state = game().current;
    remember(state, { kind: "thing", day: 5, thing: "robot", quality: "cheap" });
    remember(state, { kind: "thing", day: 9, thing: "robot", quality: "premium" });
    remember(state, { kind: "thing", day: 9, thing: "fountain", quality: "premium" });
    remember(state, { kind: "thing", day: 12, thing: "feeder", quality: "cheap" });
    remember(state, { kind: "thing", day: 13, thing: "fountain", quality: "cheap" });
    expect(ofKind(lifeStory(state), "thing")).toEqual([
      { kind: "thing", day: 5, thing: "robot", quality: "cheap" },
      { kind: "thing", day: 9, thing: "fountain", quality: "premium" },
      { kind: "thing", day: 12, thing: "feeder", quality: "cheap" },
    ]);
  });

  it("кар'єра — усі зміни; полароїд — звільнення, нова робота, уперше `CAREER_AXIS.middle` і вершина", () => {
    const middle = CAREER_AXIS.middle - 1;
    const top = CAREER_AXIS.high - 1;
    const state = game().current;
    let day = 0;
    const promote = (position: number): void => remember(state, { kind: "career", day: ++day, change: "promoted", position });
    for (let p = 1; p <= middle; p++) promote(p);
    remember(state, { kind: "career", day: ++day, change: "demoted", position: middle - 1 });
    for (let p = middle; p <= top; p++) promote(p);
    const career = ofKind(lifeStory(state), "career");
    expect(career).toHaveLength(state.story?.length ?? -1);
    const milestones = career.filter((c) => c.milestone).map((c) => [c.change, c.position]);
    expect(milestones).toEqual([
      ["promoted", middle],
      ["promoted", top],
    ]);

    const jobless = game().current;
    remember(jobless, { kind: "career", day: 8, change: "fired", position: 0 });
    remember(jobless, { kind: "career", day: 12, change: "hired", position: 0 });
    remember(jobless, { kind: "career", day: 20, change: "promoted", position: 1 });
    expect(ofKind(lifeStory(jobless), "career").map((c) => c.milestone)).toEqual([true, true, false]);
  });

  it("збереження, старше за титри, де посада вже була середньою: перше записане підвищення — рядок, вершина — полароїд", () => {
    const state = game().current;
    const top = CAREER_AXIS.high - 1;
    remember(state, { kind: "career", day: 50, change: "promoted", position: CAREER_AXIS.middle + 2 });
    remember(state, { kind: "career", day: 60, change: "promoted", position: top });
    expect(ofKind(lifeStory(state), "career").map((c) => c.milestone)).toEqual([false, true]);
  });
});

describe("підписи стрічки (§4.2, `TEXTS.md`, «Титри життя»)", () => {
  const PLACEHOLDER = /[{}[\]|]|undefined|null|NaN/;

  /** Усі тексти підпису без підстановок, що лишилися. */
  function clean(caption: { title: string; text?: string }): void {
    expect(caption.title).not.toMatch(PLACEHOLDER);
    expect(caption.title.trim()).not.toBe("");
    if (caption.text !== undefined) {
      expect(caption.text).not.toMatch(PLACEHOLDER);
      expect(caption.text.trim()).not.toBe("");
    }
  }

  it("дата — «Тиждень N, день» з великої", () => {
    expect(storyDate(0)).toBe("Тиждень 1, Понеділок");
    expect(storyDate(2)).toBe("Тиждень 1, Середа");
    expect(storyDate(9)).toBe("Тиждень 2, Середа");
    expect(storyDate(139)).toBe("Тиждень 20, Неділя");
  });

  it("перший день — коротко про початок, без котів", () => {
    const state = game().current;
    const caption = storyCaption({ kind: "start", day: 0 }, state);
    expect(caption.date).toBe("Тиждень 1, Понеділок");
    clean(caption);
    expect(caption.text).toBeDefined();
  });

  it("новий кіт: «{кіт} знайшов нову оселю» з притулку, за статтю; кожне джерело — свій підпис", () => {
    const state = game().current;
    const he = cat(state, { source: "shelter", age: 2, day: 3, sex: "male", name: "Дзвіночок" });
    const she = cat(state, { source: "shelter", age: 2, day: 3, sex: "female", name: "Мурка" });
    const arrival = (c: Cat, source: Exclude<CatSource, "born">): StoryItem => ({ kind: "arrival", day: 3, cat: { cat: c, ageWeeks: 2 }, source });
    expect(storyCaption(arrival(he, "shelter"), state).title).toBe("Дзвіночок знайшов нову оселю");
    expect(storyCaption(arrival(she, "shelter"), state).title).toBe("Мурка знайшла нову оселю");
    const sources = ["shelter", "shelter-forced", "breeder", "foundling"] as const;
    const captions = sources.map((s) => storyCaption(arrival(she, s), state));
    for (const caption of captions) {
      clean(caption);
      expect(caption.date).toBe(storyDate(3));
      expect(caption.title).toContain("Мурка");
      expect(caption.text).toBeDefined();
    }
    expect(new Set(captions.map((c) => c.title)).size).toBe(sources.length);
    expect(new Set(captions.map((c) => c.text)).size).toBe(sources.length);
    for (const source of sources) expect(storyCaption(arrival(he, source), state).title, source).not.toBe(storyCaption(arrival(she, source), state).title.replace("Мурка", "Дзвіночок"));
  });

  it("пологи — ім'я мами в називному: «{кішка} стала мамою», імена кошенят; одне кошеня й кілька — різні форми; без мами — без імені", () => {
    const state = game().current;
    const mother = cat(state, { source: "shelter", age: 4, day: 0, sex: "female", name: "Мурка" });
    const kittens = ["Пух", "Сірка", "Бусинка"].map((name) => cat(state, { source: "born", age: 0, day: 7, name }));
    const births = (m: Cat | null, ks: Cat[]): StoryItem => ({ kind: "births", day: 7, mother: m ? { cat: m, ageWeeks: 5 } : null, kittens: ks.map((k) => ({ cat: k, ageWeeks: 0 })) });
    const many = storyCaption(births(mother, kittens), state);
    clean(many);
    expect(many.title).toBe("Мурка стала мамою");
    for (const k of kittens) expect(many.text).toContain(k.name);
    const one = storyCaption(births(mother, kittens.slice(0, 1)), state);
    clean(one);
    expect(one.title).toBe("Мурка стала мамою");
    expect(one.text).toContain("Пух");
    expect(one.text).not.toContain("Сірка");
    const orphans = storyCaption(births(null, kittens), state);
    clean(orphans);
    expect(orphans.title).not.toContain("Мурка");
  });

  it("техніка — свій підпис на кожну річ", () => {
    const state = game().current;
    const things = (["robot", "fountain", "feeder"] as const).map((thing) => storyCaption({ kind: "thing", day: 4, thing, quality: "premium" }, state));
    for (const caption of things) {
      clean(caption);
      expect(caption.text).toBeDefined();
    }
    expect(new Set(things.map((c) => c.title)).size).toBe(3);
    expect(storyCaption({ kind: "thing", day: 4, thing: "robot", quality: "cheap" }, state).text).not.toBe(things[0]?.text);
  });

  it("кар'єра: посада за звертанням; рядок — без тексту, полароїд — з текстом; звільнення — за звертанням", () => {
    for (const address of ["he", "she"] as const) {
      const state = game(address).current;
      const line = storyCaption({ kind: "career", day: 20, change: "promoted", position: 3, milestone: false }, state);
      clean(line);
      expect(line.text).toBeUndefined();
      expect(line.title.toLowerCase()).toContain(fill(POSITION_TITLES[3] ?? "", address).toLowerCase());
      const down = storyCaption({ kind: "career", day: 21, change: "demoted", position: 2, milestone: false }, state);
      clean(down);
      expect(down.text).toBeUndefined();
      expect(down.title.toLowerCase()).toContain(fill(POSITION_TITLES[2] ?? "", address).toLowerCase());
      expect(down.title).not.toBe(line.title);
      for (const position of [CAREER_AXIS.middle - 1, CAREER_AXIS.high - 1]) {
        const big = storyCaption({ kind: "career", day: 50, change: "promoted", position, milestone: true }, state);
        clean(big);
        expect(big.text).toBeDefined();
        expect(`${big.title} ${big.text}`.toLowerCase()).toContain(fill(POSITION_TITLES[position] ?? "", address).toLowerCase());
      }
      for (const change of ["fired", "hired"] as const) {
        const caption = storyCaption({ kind: "career", day: 30, change, position: 0, milestone: true }, state);
        clean(caption);
        expect(caption.text).toBeDefined();
      }
    }
    const fired = (address: Address): string => storyCaption({ kind: "career", day: 30, change: "fired", position: 0, milestone: true }, game(address).current).title;
    expect(fired("he")).not.toBe(fired("she"));
  });

  it("прощання: «{кіт} пішов з життя» за статтю, віддали — свій; під фото — причина й опис життя з прощання", () => {
    const state = game().current;
    const he = farewell(state, cat(state, { source: "shelter", age: 2, day: 0, sex: "male", name: "Дзвіночок" }), { kind: "old" }, 70);
    const she = farewell(state, cat(state, { source: "shelter", age: 2, day: 0, sex: "female", name: "Мурка" }), { kind: "disease", disease: "heart" }, 80);
    const given = farewell(state, cat(state, { source: "shelter", age: 2, day: 0, sex: "female", name: "Ромашка" }), { kind: "given" }, 90);
    const caption = (entry: AlbumEntry) => storyCaption({ kind: "farewell", day: entry.day, entry }, state);
    expect(caption(he).title).toBe("Дзвіночок пішов з життя");
    expect(caption(she).title).toBe("Мурка пішла з життя");
    expect(caption(given).title).toContain("Ромашка");
    expect(caption(given).title).not.toContain("з життя");
    for (const entry of [he, she, given]) {
      const c = caption(entry);
      clean(c);
      const text = farewellText(entry, diseaseTitle);
      expect(c.text).toContain(text.cause);
      expect(c.text).toContain(text.life);
      expect(c.date).toBe(storyDate(entry.day));
    }
  });

  it("живі коти: ім'я на полі й як живеться зараз — свій текст на кожен рівень життя, у теперішньому часі, за статтю", () => {
    const state = game().current;
    const living = (sex: Sex, level: number): Cat => {
      const c = cat(state, { source: "shelter", age: 3, day: 0, sex, name: sex === "male" ? "Барсик" : "Мурка" });
      c.moodHistory = [level * 10 + 5];
      return c;
    };
    const past = new Set(["прожив", "прожила", "жив", "жила", "був", "була", "мав", "мала", "пішов", "пішла"]);
    const texts: string[] = [];
    for (let level = 0; level <= 9; level++) {
      const pair = (["male", "female"] as const).map((sex) => {
        const c = living(sex, level);
        const caption = livingCatCaption(c);
        expect(caption.title).toBe(c.name);
        clean(caption);
        expect(caption.text).toContain(c.name);
        const words = caption.text.toLowerCase().split(/[^а-яіїєґ'ʼ’-]+/u);
        expect(words.filter((w) => past.has(w)), `${level}: ${caption.text}`).toEqual([]);
        return caption.text;
      });
      texts.push(pair[1] ?? "");
    }
    expect(new Set(texts).size).toBe(10);
  });

  it("сценарії фіналів: шлях кар'єри веде до посади сценарію, у «Вигоранні» — звільнення без нової роботи, на вершині — полароїд", () => {
    for (const [id, scenario] of Object.entries(FILE_SCENARIOS)) {
      if (!id.startsWith("finale-")) continue;
      const state = applyScenario(scenario).current;
      const career = (state.story ?? []).filter((e) => e.kind === "career");
      expect(career.length, id).toBeGreaterThan(0);
      let position = 0;
      let unemployed = false;
      let day = 0;
      for (const entry of career) {
        expect(entry.day, id).toBeGreaterThanOrEqual(day);
        expect(entry.day, id).toBeLessThanOrEqual(state.day);
        day = entry.day;
        if (entry.change === "promoted") position += 1;
        if (entry.change === "demoted") position -= 1;
        if (entry.change === "fired") {
          expect(position, id).toBe(0);
          unemployed = true;
        }
        if (entry.change === "hired") {
          expect(unemployed, id).toBe(true);
          unemployed = false;
        }
        expect(entry.position, id).toBe(position);
      }
      expect(position, id).toBe(state.job.position);
      expect(unemployed, id).toBe(state.job.unemployed);
      const story = lifeStory(state);
      for (const item of story) clean(storyCaption(item, state));
      const top = ofKind(story, "career").some((c) => c.milestone && c.position === CAREER_AXIS.high - 1);
      expect(top, id).toBe(id === "finale-workaholic" || id === "finale-perfect-balance");
    }
    const burnout = applyScenario(FILE_SCENARIOS["finale-burnout"]!).current;
    expect(burnout.story?.filter((e) => e.kind === "career").at(-1)?.change).toBe("fired");
    const balance = lifeStory(applyScenario(FILE_SCENARIOS["finale-perfect-balance"]!).current);
    expect(ofKind(balance, "thing").map((t) => t.thing)).toEqual(expect.arrayContaining(["robot", "fountain"]));
  });
});
