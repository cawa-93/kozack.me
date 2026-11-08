// Звуки котів (§11.4а, `audio/SOUND.md`, «Хто що озвучує», рядок `cats`): кожна подія групи дає наявні звуки, кожен бабл «вголос»
// звучить, нявкання — за віком і ситуацією, петлі з'являються й зникають зі станом, кіт на сходах нявчить з-за дверей.

import { afterEach, describe, expect, it } from "vitest";

import { soundFile } from "../src/audio/sfx/files";
import { group } from "../src/audio/sfx/groups/cats";
import { loopCode } from "../src/audio/sfx/cats/loops";
import { STAIRS_MEOW } from "../src/audio/sfx/cats/stairs";
import { meowMood, meowSound, voiceRate } from "../src/audio/sfx/cats/voice";
import type { Cue, LoopCue } from "../src/audio/sfx/types";
import { petTolerance } from "../src/sim/actions";
import { createCat, idleAct } from "../src/sim/cat";
import { CAT_AGE_LIMIT, KITTEN_MAX_AGE, PET, PETTING, THOUGHTS } from "../src/sim/config";
import type { GameEvent } from "../src/sim/events";
import { newGame } from "../src/sim/game";
import { createRng } from "../src/sim/rng";
import type { Cat, CatAct, GameState } from "../src/sim/types";
import { eventBubbles } from "../src/view/symbols";
import { EVENTS } from "./bubblecases";

/** Події групи `cats` — рядок `cats` таблиці «Хто що озвучує». */
const CAT_EVENTS = new Set<GameEvent["type"]>([
  "meow", "carrier-cry", "purr", "hissed", "hissed-guests", "standoff", "standoff-parted", "cat-fight", "fight-stopped", "bite",
  "clawed", "cat-ate", "cat-refused-food", "litter-refused", "coughing", "symptom", "catnip", "chatter", "window-angry", "knocked",
  "trinket-fell", "stole", "toy-broke", "scratched", "keyboard", "trash-tipped", "chewing", "wire-chewed", "bag-chewed",
  "cabinet-pawed", "played", "cats-played", "groom-started", "groomed", "cat-cuddled", "picked-up", "put-down", "cat-broke-free",
  "cat-dodged", "scared", "cat-woke", "nervous", "escaped", "cat-returned", "cat-arrived", "birth", "medicine-spat", "tap-opened",
  "mess", "treat-snatched", "play-declined", "sulked", "cat-left",
]);

/** Бабли «вголос» котів без звуку (`audio/SOUND.md`, «Без звуку»): звук лише засмічував чи автор прибрав запис (кашель). */
const MUTE = new Set<GameEvent["type"]>(["coughing", "stole", "treat-snatched"]);

/** Приклади подій групи, яких немає серед прикладів баблів (`bubblecases.ts`). */
const MORE: GameEvent[] = [
  { type: "carrier-cry", cat: 1 },
  { type: "purr", cat: 1, enjoyed: true },
  { type: "standoff", cats: [1, 2] },
  { type: "standoff-parted", cat: 1 },
  { type: "cat-fight", cats: [1, 2] },
  { type: "fight-stopped", cat: 1 },
  { type: "cat-ate", cat: 1, quality: "cheap" },
  { type: "toy-broke", toy: 5 },
  { type: "trinket-fell", cat: 1, trinket: "mug", object: "table", broken: false },
  { type: "trinket-fell", cat: 1, trinket: "phone", object: "table", broken: false },
  { type: "bag-chewed", cat: 1, product: "catFood" },
  { type: "played", cat: 1, minutes: 5 },
  { type: "cats-played", cats: [1, 2] },
  { type: "groomed", cat: 1, friend: 2 },
  { type: "put-down", cat: 1 },
  { type: "cat-broke-free", cat: 1 },
  { type: "cat-returned", cat: 1, caught: true },
  { type: "cat-arrived", cat: 1 },
  { type: "birth", cat: 1, kittens: 3 },
  { type: "mess", mess: { id: 1, kind: "hairball", x: 4, y: 8, cat: 1 } },
  { type: "mess", mess: { id: 2, kind: "paper", x: 9, y: 4, cat: 1 } },
  { type: "mess", mess: { id: 3, kind: "litter", x: 8, y: 3, cat: 1 } },
  { type: "play-declined", cat: 1, by: 2, sick: true },
  { type: "play-declined", cat: 1, by: 2, sick: false },
];

const SAMPLES: GameEvent[] = [...EVENTS.filter((e) => CAT_EVENTS.has(e.type)), ...MORE];

function state(): GameState {
  return newGame({ seed: 7, address: "she", difficulty: "normal" }).current;
}

function addCat(s: GameState, ageWeeks: number, at = { x: 9.5, y: 8.5 }): Cat {
  const cat = createCat(s, createRng(s.nextId + 11), { source: "shelter", ageWeeks, at });
  cat.mood = 60;
  cat.act = idleAct(30);
  s.cats.push(cat);
  return cat;
}

/** Стан із двома дорослими котами з id 1 і 2, як у прикладах подій. */
function withCats(): GameState {
  const s = state();
  s.nextId = 1;
  addCat(s, 3);
  addCat(s, 3, { x: 10.5, y: 8.5 });
  return s;
}

function act(kind: CatAct["kind"], patch: Partial<CatAct> = {}): CatAct {
  return { ...idleAct(5), kind, ...patch };
}

const sounds = (cues: readonly Cue[] | readonly LoopCue[]): string[] => cues.map((c) => c.sound);

afterEach(() => group.reset?.());

describe("звуки котів (§11.4а)", () => {
  it("кожна подія групи дає лише наявні звуки з файлами", () => {
    const s = withCats();
    for (const event of SAMPLES) {
      for (const cue of group.onEvent?.(event, s) ?? []) {
        const def = group.sounds[cue.sound];
        expect(def, `${event.type} → ${cue.sound}`).toBeDefined();
        expect(def?.loop, `${event.type}: разовий звук`).not.toBe(true);
        for (const file of def?.files ?? []) expect(soundFile("cats", file), `${cue.sound}: ${file}`).not.toBeNull();
      }
    }
  });

  it("кожен бабл «вголос» події котів звучить, крім беззвучних; думки — ні", () => {
    const s = withCats();
    const mute: string[] = [];
    for (const event of SAMPLES) {
      const cues = group.onEvent?.(event, s) ?? [];
      // «Тихоня» відкриває рота, а звуку немає (§9.12): бабл уголос, але беззвучний.
      const silent = event.type === "meow" && event.silent === true;
      const aloud = !silent && eventBubbles(event).some((b) => b.kind === "say");
      if (aloud && cues.length === 0) mute.push(event.type);
    }
    expect([...new Set(mute)].sort()).toEqual([...MUTE].sort());
    // Беззвучне нявкання «Тихоні» не звучить.
    expect(group.onEvent?.({ type: "meow", cat: 1, silent: true }, s)).toEqual([]);
  });

  it("усі події групи — з переліку `cats`, чужі не озвучує", () => {
    const s = withCats();
    const foreign: GameEvent[] = [{ type: "doorbell" }, { type: "laundry", stage: "spin" }, { type: "tripped", cat: 1 }, { type: "refused", object: "bed", reason: "too-early" }];
    for (const event of foreign) expect(group.onEvent?.(event, s), event.type).toEqual([]);
  });

  it("нявкання — за віком і ситуацією", () => {
    const s = state();
    const kitten = addCat(s, KITTEN_MAX_AGE);
    const adult = addCat(s, KITTEN_MAX_AGE + 1);
    const old = addCat(s, CAT_AGE_LIMIT + 1);
    expect(meowSound(kitten, meowMood(kitten))).toBe("meow-kitten");
    expect(meowSound(adult, meowMood(adult))).toBe("meow");
    expect(meowSound(old, meowMood(old))).toBe("meow-old");
    adult.act = act("beg", { target: "item:1" });
    expect(meowSound(adult, meowMood(adult))).toBe("meow-ask");
    kitten.act = act("beg", { target: "high" });
    expect(meowSound(kitten, meowMood(kitten))).toBe("cry-kitten");
    adult.act = act("attention", { target: "character" });
    expect(meowSound(adult, meowMood(adult))).toBe("meow-ask");
    adult.act = act("beg", { target: "high" });
    expect(meowSound(adult, meowMood(adult))).toBe("cry");
    adult.act = act("follow", { target: "door" });
    expect(meowSound(adult, meowMood(adult))).toBe("meow-happy");
    adult.act = idleAct(5);
    adult.mood = THOUGHTS.sad - 1;
    expect(meowSound(adult, meowMood(adult))).toBe("meow-sad");
    // Подія нявкання бере голос кота: старий — нижчий за дорослого з тим самим id.
    expect(voiceRate(old)).toBeLessThan(voiceRate({ ...old, ageWeeks: 3 }));
    const cues = group.onEvent?.({ type: "meow", cat: old.id }, s) ?? [];
    expect(cues).toEqual([{ sound: "meow-old", at: `cat:${old.id}`, rate: voiceRate(old) }]);
  });

  it("кожен кіт — своїм голосом: висота стала, різна між котами й у межах кількох відсотків", () => {
    const s = state();
    const cats = Array.from({ length: 8 }, () => addCat(s, 3));
    const rates = cats.map(voiceRate);
    expect(new Set(rates).size).toBeGreaterThan(3);
    for (const rate of rates) expect(Math.abs(rate - 1)).toBeLessThanOrEqual(0.07);
    expect(cats.map(voiceRate)).toEqual(rates);
  });

  it("кіт на сходах нявкає з-за дверей: подія й сталий відлік у `tick`", () => {
    const s = withCats();
    const cat = s.cats[0]!;
    expect(group.tick?.(s, 10_000)).toEqual([]);
    cat.away = "stairs";
    expect(sounds(group.onEvent?.({ type: "meow", cat: cat.id }, s) ?? [])).toEqual(["meow-door"]);
    expect(group.tick?.(s, STAIRS_MEOW.first - 1)).toEqual([]);
    expect(group.tick?.(s, 2)).toEqual([{ sound: "meow-door", at: "door" }]);
    expect(group.tick?.(s, STAIRS_MEOW.from - 1)).toEqual([]);
    cat.away = null;
    expect(group.tick?.(s, 60_000)).toEqual([]);
  });

  it("петлі: з'являються й зникають зі станом, без нового масиву, поки нічого не змінилося", () => {
    const s = withCats();
    const [a, b] = s.cats as [Cat, Cat];
    const loops = (): readonly LoopCue[] => group.loops?.(s) ?? [];
    expect(loops()).toEqual([]);

    // Під рукою муркоче, поки хоче ласки й терпить; замовкає перед попередженням і після укусу.
    a.needs.attention = 80;
    s.character.activity = { kind: "pet", cat: a.id, minutes: 0.5 };
    const petting = loops();
    expect(petting).toEqual([{ key: `purr:${a.id}`, sound: "purr-loop", at: `cat:${a.id}`, gain: 1 }]);
    expect(loops()).toBe(petting);
    s.character.activity.minutes = petTolerance(a) - PETTING.warnMinutes + 0.1;
    expect(loops()).toEqual([]);
    s.character.activity.minutes = 0.5;
    a.needs.attention = PET.wantsAttention - 1;
    expect(loops()).toEqual([]);
    a.needs.attention = 80;
    s.character.activity.bitten = true;
    expect(loops()).toEqual([]);
    s.character.activity = null;

    a.act = act("eat", { goal: { x: 1, y: 1 } });
    expect(loops()).toEqual([]);
    // Кіт їсть беззвучно: запис їжі автор прибрав.
    a.act = act("eat", { goal: null });
    expect(loops()).toEqual([]);
    a.act = act("toilet", { refused: true });
    expect(loops()).toEqual([]);
    a.act = act("toilet");
    b.act = act("scratch");
    expect(sounds(loops())).toEqual(["dig-loop", "scratch-loop"]);
    a.act = act("zoomies", { goal: { x: 3, y: 3 } });
    b.act = act("drink");
    expect(sounds(loops())).toEqual(["zoom-loop", "lap-loop"]);

    // Бійка — одна петля на пару, від меншого кота.
    a.act = act("fight", { target: `cat:${b.id}`, paired: true });
    b.act = act("fight", { target: `cat:${a.id}`, paired: true });
    const fight = loops();
    expect(fight).toEqual([{ key: `fight:${Math.min(a.id, b.id)}`, sound: "fight-loop", at: `cat:${Math.min(a.id, b.id)}`, gain: 1 }]);
    b.act = idleAct(5);
    a.act = idleAct(5);
    expect(loops()).toEqual([]);

    // Кіт поза домом не звучить.
    a.act = act("eat");
    a.away = "trip";
    expect(loops()).toEqual([]);
  });

  it("однакових петель — не більше двох водночас", () => {
    const s = state();
    const cats = Array.from({ length: 4 }, () => addCat(s, 3));
    for (const cat of cats) cat.act = act("drink");
    expect(sounds(group.loops?.(s) ?? [])).toEqual(["lap-loop", "lap-loop"]);
  });

  it("код петлі не залежить від зайвого: кіт, що йде до мети, ще не п'є і не дряпає", () => {
    const s = withCats();
    const cat = s.cats[0]!;
    for (const kind of ["drink", "toilet", "scratch", "chew", "groom"] as const) {
      cat.act = act(kind, { goal: { x: 2, y: 2 } });
      expect(loopCode(s, cat), kind).toBe(0);
      cat.act = act(kind);
      expect(loopCode(s, cat), kind).toBeGreaterThan(0);
    }
  });

  it("усі петлі групи — петлі, усі звуки вжито", () => {
    const used = new Set<string>();
    const s = withCats();
    for (const event of SAMPLES) for (const cue of group.onEvent?.(event, s) ?? []) used.add(cue.sound);
    for (const [name, def] of Object.entries(group.sounds)) if (def.loop) used.add(name);
    // Нявкання за віком і ситуацією та кіт за дверима.
    for (const name of ["meow", "meow-ask", "meow-happy", "meow-sad", "meow-old", "meow-kitten", "cry", "cry-kitten", "meow-door"]) used.add(name);
    expect(Object.keys(group.sounds).filter((name) => !used.has(name))).toEqual([]);
  });
});
