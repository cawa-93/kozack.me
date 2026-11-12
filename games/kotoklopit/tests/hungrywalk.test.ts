// Похід голодного кота до персонажа (§9.12, «Похід по увагу»; `TRAITS.md`, «Голодний кіт без корму»): кіт доходить за будь-якої
// частоти кадрів, нявчить поруч `HUNGRY_ASK_MINUTES` хвилин і йде просити до миски; корм у мисці закінчує похід одразу.

import { describe, expect, it } from "vitest";

import { createCat, idleAct } from "../src/sim/cat";
import { beggingFood, decide, tickCats } from "../src/sim/catai";
import { CAT_ACT_MINUTES, HUNGRY_ASK_MINUTES, LOVE_BEHAVIOR, RELATIONS } from "../src/sim/config";
import { advance, newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { changeRelation } from "../src/sim/relations";
import { createRng } from "../src/sim/rng";
import type { BowlItem, Cat, Save, TraitLevel } from "../src/sim/types";
import { bodyMinutes, hours, recordEvents, withCatCorner } from "./helpers";

type Needs = Cat["needs"];

/** Хвилини дії кота на місці — за часом тіла (§8.1): стільки ігрових хвилин кіт просить біля персонажа. */
const ASK = bodyMinutes(HUNGRY_ASK_MINUTES);

const FAR = { x: 15.5, y: 3.5 };

/** Опівдні, персонаж удома й нічим не зайнятий, миски порожні. */
function game(seed = 11): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed }));
  save.current.modifiers.day = null;
  save.current.minute = hours(12);
  for (const item of save.current.home.items) if (item.kind === "bowl") item.food = 0;
  return save;
}

function withCat(save: Save, traits: Record<string, TraitLevel> = {}, at = FAR): Cat {
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 30, at });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.arrivedDay = -10;
  cat.love = 60;
  cat.act = idleAct(1);
  cat.needs = { hunger: 95, thirst: 0, toilet: 0, fatigue: 0, attention: 10, play: 0 };
  addCat(save.current, cat);
  return cat;
}

/** Голодний кіт вирішує, куди йти: перший seed, з яким він іде до персонажа. */
function sendToPerson(save: Save, cat: Cat): void {
  for (let seed = 0; seed < 40; seed++) {
    cat.act = idleAct(1);
    decide(save.current, cat, createRng(seed), { present: true });
    if (cat.act.kind === "attention") return;
  }
  throw new Error("кіт так і не пішов до персонажа");
}

const gap = (save: Save, cat: Cat): number => Math.hypot(cat.x - save.current.character.body.x, cat.y - save.current.character.body.y);

interface Walk {
  /** Хвилина, коли кіт уперше опинився поруч із персонажем; null — не дійшов. */
  arrived: number | null;
  /** Хвилина, коли похід закінчився; null — триває. */
  ended: number | null;
  /** Скільки разів нявкнув уголос, уже дійшовши. */
  meows: number;
  /** Усі дії кота за цей час, без повторів поспіль. */
  acts: string[];
}

/** Прожити `minutes` кроками `dt`, тримаючи потреби кота сталими; `each` — що зробити перед кожним кроком. */
function follow(save: Save, cat: Cat, minutes: number, dt: number, needs: Needs, each?: (t: number) => void): Walk {
  const walk: Walk = { arrived: null, ended: null, meows: 0, acts: [cat.act.kind] };
  const { events, stop } = recordEvents();
  for (let t = 0; t < minutes; t += dt) {
    each?.(t);
    Object.assign(cat.needs, needs);
    events.length = 0;
    advance(save, dt);
    if (walk.acts.at(-1) !== cat.act.kind) walk.acts.push(cat.act.kind);
    if (walk.ended === null && cat.act.kind !== "attention") walk.ended = t + dt;
    if (walk.ended !== null) continue;
    if (walk.arrived === null && gap(save, cat) <= 1.5) walk.arrived = t + dt;
    if (walk.arrived !== null) walk.meows += events.filter((e) => e.type === "meow" && e.cat === cat.id && e.silent !== true).length;
  }
  stop();
  return walk;
}

const HUNGRY: Needs = { hunger: 95, thirst: 0, toilet: 0, fatigue: 0, attention: 10, play: 0 };

describe("похід голодного кота до персонажа (§9.12)", () => {
  it("доходить при 30, 60 і 120 кадрах/с, нявчить поруч `HUNGRY_ASK_MINUTES` хвилин, хоч уваги йому вистачає, і йде просити до миски", () => {
    const walks = [30, 60, 120].map((fps) => {
      const save = game();
      const cat = withCat(save);
      sendToPerson(save, cat);
      expect(cat.act.forFood).toBe(true);
      const walk = follow(save, cat, 60, 2 / fps, HUNGRY, () => {
        // Поки кіт іде й просить поруч, ласощі привчають його жебракувати (§7).
        if (cat.act.kind === "attention") expect(beggingFood(save.current, cat)).toBe(true);
      });
      expect(walk.arrived, `${fps} кадрів/с: дійшов`).not.toBeNull();
      expect(walk.ended, `${fps} кадрів/с: похід закінчився`).not.toBeNull();
      expect(walk.ended! - walk.arrived!, `${fps} кадрів/с: скільки просив поруч`).toBeGreaterThan(ASK - 1);
      expect(walk.ended! - walk.arrived!, `${fps} кадрів/с: скільки просив поруч`).toBeLessThan(ASK + 1.5);
      expect(walk.meows, `${fps} кадрів/с: нявкав поруч`).toBeGreaterThanOrEqual(2);
      // Після персонажа — до миски, без нового вибору «до персонажа чи до миски».
      expect(walk.acts.slice(0, 2), `${fps} кадрів/с`).toEqual(["attention", "beg"]);
      const bowl = save.current.home.items.find((i) => i.kind === "bowl") as BowlItem;
      expect(bowl.food).toBe(0);
      return walk;
    });
    const [slow, , fast] = walks;
    expect(Math.abs(slow!.arrived! - fast!.arrived!)).toBeLessThan(0.5);
    expect(Math.abs(slow!.ended! - fast!.ended!)).toBeLessThan(0.5);
  });

  it("просив біля персонажа — далі просить саме біля миски", () => {
    const save = game();
    const cat = withCat(save);
    sendToPerson(save, cat);
    follow(save, cat, 40, 1 / 30, HUNGRY, () => {
      if (cat.act.kind !== "beg") return;
      const bowl = save.current.home.items.find((i) => i.kind === "bowl") as BowlItem;
      expect(cat.act.target).toBe(`item:${bowl.id}`);
    });
    expect(cat.act.kind).toBe("beg");
  });

  it("миску наповнили — похід закінчується, і кіт іде їсти", () => {
    const save = game();
    const cat = withCat(save);
    sendToPerson(save, cat);
    const bowl = save.current.home.items.find((i) => i.kind === "bowl") as BowlItem;
    let filledAt: number | null = null;
    const walk = follow(save, cat, 20, 1 / 30, HUNGRY, (t) => {
      // Насипали, коли кіт уже дійшов і просить поруч.
      if (filledAt === null && cat.act.seen === true && t > 3) {
        bowl.food = 2;
        filledAt = t;
      }
    });
    expect(filledAt).not.toBeNull();
    expect(walk.ended! - filledAt!).toBeLessThan(0.2);
    expect(walk.acts.slice(0, 2)).toEqual(["attention", "eat"]);
  });

  it("шанси шафки й крадіжки в поході не перекидаються: злодюжка й кмітливий доходять до персонажа", () => {
    const tempt = (): { save: Save; cat: Cat } => {
      const save = game();
      save.current.home.surfaces["table"] = { kind: "meal", quality: "cheap" };
      save.current.home.supplies.catFood.cheap = 3;
      return { save, cat: withCat(save, { thief: 2, cunning: 2 }) };
    };
    // Спокуси справжні: вирішуючи з місця, такий кіт іде до шафки чи краде.
    const probe = tempt();
    const kinds = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      probe.cat.act = idleAct(1);
      decide(probe.save.current, probe.cat, createRng(seed), { present: true });
      kinds.add(probe.cat.act.kind);
    }
    expect(kinds.has("steal") || kinds.has("raid")).toBe(true);

    for (const fps of [30, 120]) {
      const { save, cat } = tempt();
      sendToPerson(save, cat);
      const walk = follow(save, cat, ASK / 2, 2 / fps, HUNGRY);
      expect(walk.acts, `${fps} кадрів/с`).toEqual(["attention"]);
    }
  });

  it("лоток перериває й похід голодного кота", () => {
    const save = game();
    const cat = withCat(save);
    sendToPerson(save, cat);
    const walk = follow(save, cat, 1, 1 / 30, { ...HUNGRY, toilet: 95 });
    expect(walk.acts[1]).toBe("toilet");
  });

  it("зголоднів у звичайному поході по увагу — просить поруч не довше за `HUNGRY_ASK_MINUTES` і йде до миски", () => {
    const save = game();
    const cat = withCat(save);
    cat.needs.hunger = 0;
    cat.needs.attention = 95;
    decide(save.current, cat, createRng(1), { present: true });
    expect(cat.act.kind).toBe("attention");
    expect(cat.act.forFood).toBeUndefined();
    const needs: Needs = { ...HUNGRY, hunger: 0, attention: 95 };
    const before = follow(save, cat, 30, 1 / 30, needs, () => {
      if (cat.act.seen === true) needs.hunger = 95;
    });
    // Уперше зголоднівши, кіт вирішує раз: лишається (тепер — по їжу) або йде до миски.
    if (before.ended === null) throw new Error("похід мав закінчитися");
    expect(before.ended - before.arrived!).toBeLessThan(ASK + 1.5);
    expect(before.acts[1]).toBe("beg");
  });

  it("звичайний похід по увагу — як досі: ситий кіт, якому уваги досить, іде, щойно дійшов; кому бракує — ходить слідом довше", () => {
    const content = game();
    const calm = withCat(content);
    calm.act = { kind: "attention", target: "character", goal: { x: Math.floor(content.current.character.body.x), y: Math.floor(content.current.character.body.y) }, minutes: CAT_ACT_MINUTES.attention, elapsed: 0 };
    const short = follow(content, calm, 30, 1 / 30, { ...HUNGRY, hunger: 0, attention: 10 });
    expect(short.arrived).not.toBeNull();
    expect(short.ended! - short.arrived!).toBeLessThan(1.5);

    const lonely = game();
    const needy = withCat(lonely);
    needy.act = { kind: "attention", target: "character", goal: { x: Math.floor(lonely.current.character.body.x), y: Math.floor(lonely.current.character.body.y) }, minutes: CAT_ACT_MINUTES.attention, elapsed: 0 };
    const long = follow(lonely, needy, 60, 1 / 30, { ...HUNGRY, hunger: 0, attention: 95 });
    // Не дочекавшись ласки, такий кіт приходить знову — тож похід може й не закінчитися.
    expect((long.ended ?? 60) - long.arrived!).toBeGreaterThan(ASK + 2);
  });

  it("похід по їжу — не прояв «Вимогливості»: короткий похід не робить кота «Тактовним»", () => {
    const save = game();
    const cat = withCat(save, { demanding: -1 });
    sendToPerson(save, cat);
    // Уваги теж бракує: за звичайний похід така тривалість була б проявом.
    follow(save, cat, 40, 1 / 30, { ...HUNGRY, attention: 95 });
    expect(cat.act.kind).toBe("beg");
    expect(cat.traits.find((t) => t.group === "demanding")?.seen).toBe(0);
  });

  it("персонаж поїхав чи заснув — кіт не йде туди, де той стояв, а одразу вирішує заново й просить біля миски", () => {
    const save = game();
    const cat = withCat(save);
    sendToPerson(save, cat);
    // Ніч і поїздка: коти живуть без персонажа, кроками по хвилині.
    tickCats(save.current, 1, { present: false });
    expect(cat.act.kind).toBe("beg");
    const bowl = save.current.home.items.find((i) => i.kind === "bowl") as BowlItem;
    expect(cat.act.target).toBe(`item:${bowl.id}`);
  });

  it("ворог біля персонажа, «Не випрошує» й кіт, що не любить, до персонажа не йдуть — просять біля миски", () => {
    const never = (save: Save, cat: Cat): void => {
      for (let seed = 0; seed < 40; seed++) {
        cat.act = idleAct(1);
        decide(save.current, cat, createRng(seed), { present: true });
        expect(cat.act.kind, `seed ${seed}`).toBe("beg");
      }
    };
    const proud = game();
    never(proud, withCat(proud, { begging: -2 }));

    const cold = game();
    const aloof = withCat(cold);
    aloof.love = LOVE_BEHAVIOR.aloof - 1;
    never(cold, aloof);

    const feud = game();
    const cat = withCat(feud);
    const body = feud.current.character.body;
    const foe = withCat(feud, {}, { x: body.x + 0.5, y: body.y });
    foe.needs.hunger = 0;
    changeRelation(feud.current, cat, foe, RELATIONS.enemy - 10);
    never(feud, cat);
  });
});
