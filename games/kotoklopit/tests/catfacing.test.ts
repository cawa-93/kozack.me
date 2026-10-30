// Куди дивиться кіт в ізометрії й розведення пар (крок 16, GRAPHICS_PLAN.md, «Вибір анімації»): `catFacing`
// (`src/view/anim/catfacing.ts`) — 4 ракурси з руху, цілі, вікна й настрою, з гістерезисом; `catPairs` (`anim/pairs.ts`) —
// пари вздовж горизонталі екрана.

import { describe, expect, it } from "vitest";

import { createCat, idleAct } from "../src/sim/cat";
import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { advance, newGame } from "../src/sim/game";
import { WINDOWS } from "../src/sim/home";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { absoluteMinute } from "../src/sim/time";
import type { Cat, CatAct, Save, TraitLevel, Vec } from "../src/sim/types";
import { catFacing, facingFromScreen, facingFromTiles, FACING_HYSTERESIS, personFacing } from "../src/view/anim/catfacing";
import { isoScreenDir, isoTileDir, ISO_TILE } from "../src/view/anim/iso";
import { catPairs, NURSING, PAIR_GAPS, pairOf } from "../src/view/anim/pairs";
import type { RigFacing } from "../src/view/rig/types";
import { withCatCorner } from "./helpers";

function game(seed = 4): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed }));
  save.current.minute = 17 * 60;
  save.current.character.body.x = 2.5;
  save.current.character.body.y = 2.5;
  return save;
}

function withCat(save: Save, at: Vec = { x: 9.5, y: 8.5 }, traits: Record<string, TraitLevel> = {}, ageWeeks = 3): Cat {
  const cat = createCat(save.current, createRng(save.current.cats.length + 21), { source: "shelter", ageWeeks, at });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.arrivedDay = -10;
  cat.mood = 50;
  cat.love = 50;
  cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 };
  cat.act = idleAct(30);
  addCat(save.current, cat);
  return cat;
}

const act = (kind: CatAct["kind"], extra: Partial<CatAct> = {}): CatAct => ({ kind, target: null, goal: null, minutes: 10, elapsed: 0, ...extra });

const FRONT: RigFacing = { view: "front", flip: false };
const FRONT_LEFT: RigFacing = { view: "front", flip: true };
const BACK: RigFacing = { view: "back", flip: false };
const BACK_LEFT: RigFacing = { view: "back", flip: true };

/** Кіт іде з точки на крок `step` (у клітинках). */
function walking(cat: Cat, step: Vec): Vec {
  const before = { x: cat.x, y: cat.y };
  cat.act = act("wander", { goal: { x: 3, y: 8 } });
  cat.x += step.x;
  cat.y += step.y;
  return before;
}

describe("ізометрія 2:1 (`anim/iso.ts`)", () => {
  it("клітинка вздовж x — униз праворуч на (TW/2, TH/2), уздовж y — униз ліворуч; обернене перетворення повертає вектор", () => {
    expect(isoScreenDir({ x: 1, y: 0 })).toEqual({ x: ISO_TILE.w / 2, y: ISO_TILE.h / 2 });
    expect(isoScreenDir({ x: 0, y: 1 })).toEqual({ x: -ISO_TILE.w / 2, y: ISO_TILE.h / 2 });
    expect(isoScreenDir({ x: 1, y: -1 })).toEqual({ x: ISO_TILE.w, y: 0 });
    for (const v of [{ x: 0.3, y: -0.7 }, { x: -2, y: 5 }, { x: 0, y: 0 }]) {
      const back = isoTileDir(isoScreenDir(v));
      expect(back.x).toBeCloseTo(v.x, 10);
      expect(back.y).toBeCloseTo(v.y, 10);
    }
  });
});

describe("ракурс за напрямом (`facingFromScreen`)", () => {
  it("униз екраном — спереду, угору — ззаду, ліворуч — віддзеркалення", () => {
    expect(facingFromScreen({ x: 1, y: 1 }, null)).toEqual(FRONT);
    expect(facingFromScreen({ x: -1, y: 1 }, null)).toEqual(FRONT_LEFT);
    expect(facingFromScreen({ x: 1, y: -1 }, null)).toEqual(BACK);
    expect(facingFromScreen({ x: -1, y: -1 }, null)).toEqual(BACK_LEFT);
    expect(facingFromScreen({ x: 0, y: 0 }, BACK)).toEqual(BACK);
    expect(facingFromScreen({ x: 0, y: 0 }, null)).toBeNull();
  });

  it("рух уздовж осей сітки — завжди однозначний; вздовж діагоналі (межі) ракурс тримається, як був", () => {
    for (const prev of [FRONT, FRONT_LEFT, BACK, BACK_LEFT, null]) {
      expect(facingFromTiles({ x: 1, y: 0 }, prev)).toEqual(FRONT);
      expect(facingFromTiles({ x: 0, y: 1 }, prev)).toEqual(FRONT_LEFT);
      expect(facingFromTiles({ x: -1, y: 0 }, prev)).toEqual(BACK_LEFT);
      expect(facingFromTiles({ x: 0, y: -1 }, prev)).toEqual(BACK);
    }
    // Праворуч уздовж горизонталі екрана: ракурс спереду чи ззаду — як був.
    expect(facingFromTiles({ x: 1, y: -1 }, BACK)).toEqual(BACK);
    expect(facingFromTiles({ x: 1, y: -1 }, FRONT)).toEqual(FRONT);
    // Униз уздовж вертикалі екрана: віддзеркалення — як було.
    expect(facingFromTiles({ x: 1, y: 1 }, FRONT_LEFT)).toEqual(FRONT_LEFT);
    expect(facingFromTiles({ x: 1, y: 1 }, FRONT)).toEqual(FRONT);
  });

  it("на межі не тремтить: напрям, що хитається біля діагоналі менше за гістерезис, ракурсу не змінює", () => {
    let facing: RigFacing | null = BACK;
    const wobble = FACING_HYSTERESIS * 0.8;
    for (let i = 0; i < 20; i++) {
      const dy = i % 2 === 0 ? wobble : -wobble;
      facing = facingFromScreen({ x: 1, y: dy }, facing);
      expect(facing).toEqual(BACK);
    }
    // Відійшов далі — ракурс змінився.
    expect(facingFromScreen({ x: 1, y: FACING_HYSTERESIS * 2 }, BACK)).toEqual(FRONT);
  });
});

describe("куди дивиться кіт (`catFacing`)", () => {
  it("іде — за рухом: 4 ізометричні ракурси", () => {
    const save = game();
    const cat = withCat(save);
    expect(catFacing(save.current, cat, walking(cat, { x: 0.05, y: 0 }))).toEqual(FRONT);
    expect(catFacing(save.current, cat, walking(cat, { x: 0, y: 0.05 }))).toEqual(FRONT_LEFT);
    expect(catFacing(save.current, cat, walking(cat, { x: -0.05, y: 0 }))).toEqual(BACK_LEFT);
    expect(catFacing(save.current, cat, walking(cat, { x: 0, y: -0.05 }))).toEqual(BACK);
  });

  it("кадр без руху — як минулого кадру; переставляння симом — не рух", () => {
    const save = game();
    const cat = withCat(save);
    cat.act = act("wander", { goal: { x: 3, y: 8 } });
    expect(catFacing(save.current, cat, { x: cat.x, y: cat.y }, { prev: BACK })).toEqual(BACK);
    // Без минулого — до мети: (3,5; 8,5) ліворуч від (9,5; 8,5) уздовж x — угору ліворуч.
    expect(catFacing(save.current, cat, { x: cat.x, y: cat.y })).toEqual(BACK_LEFT);
    expect(catFacing(save.current, cat, { x: cat.x - 5, y: cat.y }, { prev: BACK })).toEqual(BACK);
  });

  it("справжня хода сима по вітальні не тремтить: ракурс змінюється не частіше, ніж змінюється напрям руху", () => {
    const scenario = FILE_SCENARIOS["ten-cats"];
    if (!scenario) throw new Error("немає сценарію");
    const save = applyScenario(scenario);
    const prevPos = new Map<number, Vec>();
    const prevFacing = new Map<number, RigFacing>();
    let changes = 0;
    let frames = 0;
    for (let t = 0; t < 600; t++) {
      advance(save, 0.05);
      for (const cat of save.current.cats) {
        if (cat.away !== null || cat.act.goal === null) {
          prevPos.delete(cat.id);
          prevFacing.delete(cat.id);
          continue;
        }
        const facing = catFacing(save.current, cat, prevPos.get(cat.id) ?? null, { prev: prevFacing.get(cat.id) ?? null, pair: null });
        const before = prevFacing.get(cat.id);
        if (before && (before.view !== facing.view || before.flip !== facing.flip)) changes++;
        frames++;
        prevPos.set(cat.id, { x: cat.x, y: cat.y });
        prevFacing.set(cat.id, facing);
      }
    }
    expect(frames).toBeGreaterThan(100);
    // Кіт змінює напрям на поворотах шляху, а не щокадру.
    expect(changes / frames).toBeLessThan(0.1);
  });

  it("стоїть — до цілі: до суперника, до миски; без цілі — `facing` сима ліворуч чи праворуч, лицем до нас", () => {
    const save = game();
    const cat = withCat(save, { x: 9.5, y: 8.5 });
    const foe = withCat(save, { x: 9.5, y: 6.5 });
    cat.act = act("jealous", { target: `cat:${foe.id}` });
    // Суперник уздовж −y — на екрані вгору праворуч: ззаду, без віддзеркалення.
    expect(catFacing(save.current, cat, null, { pair: null })).toEqual(BACK);
    foe.x = 7.5;
    foe.y = 8.5;
    // Уздовж −x — угору ліворуч.
    expect(catFacing(save.current, cat, null)).toEqual(BACK_LEFT);
    const bowl = save.current.home.items.find((i) => i.kind === "bowl")!;
    cat.x = 17.5;
    cat.y = 4.4;
    cat.act = act("eat", { target: `item:${bowl.id}` });
    // Миска (17,5; 3,5) — вище по y: угору праворуч.
    expect(catFacing(save.current, cat, null)).toEqual(BACK);
    cat.act = idleAct(10);
    cat.facing = -1;
    expect(catFacing(save.current, cat, null)).toEqual(FRONT_LEFT);
    cat.facing = 1;
    expect(catFacing(save.current, cat, null)).toEqual(FRONT);
  });

  it("на підвіконні під вікном у задній стіні — спиною до нас, у вікно; сумний — лицем до нас", () => {
    const save = game();
    const bedroom = WINDOWS.find((w) => w.sill === "sill-bedroom")!;
    const living = WINDOWS.find((w) => w.sill === "sill-living")!;
    const cat = withCat(save, bedroom.seat);
    cat.act = act("window", { target: bedroom.sill });
    expect(catFacing(save.current, cat, null)).toEqual(BACK);
    const other = withCat(save, living.seat);
    other.act = act("window", { target: living.sill });
    expect(catFacing(save.current, other, null)).toEqual(BACK_LEFT);
    other.mood = 10;
    expect(catFacing(save.current, other, null).view).toBe("front");
  });

  it("відданий кліпає — лицем до нас і боком до персонажа; «Пастка на животику» — головою від нього; «Образливий» — спиною", () => {
    const save = game();
    const body = save.current.character.body;
    body.x = 11.5;
    body.y = 8.5;
    const cat = withCat(save, { x: 9.5, y: 8.5 });
    cat.mood = 90;
    cat.love = 90;
    // Персонаж праворуч по x — на екрані праворуч унизу.
    expect(catFacing(save.current, cat, null)).toEqual(FRONT);
    body.x = 7.5;
    expect(catFacing(save.current, cat, null)).toEqual(FRONT_LEFT);
    const belly = withCat(save, { x: 8.5, y: 8.5 }, { petting: -2 });
    expect(catFacing(save.current, belly, null)).toEqual(FRONT);
    // Персонаж, що «Образливого» щойно образив, — праворуч: той сидить спиною й дивиться ліворуч, від нього.
    body.x = 12.5;
    const touchy = withCat(save, { x: 10.5, y: 8.5 }, { touchy: 2 });
    touchy.offense = { at: absoluteMinute(save.current.day, save.current.minute) };
    expect(catFacing(save.current, touchy, null)).toEqual(BACK_LEFT);
  });

  it("на руках і на колінах — туди ж, куди персонаж: ракурс персонажа, а flip — відносно нього (гніздо дзеркалить контейнер)", () => {
    const save = game();
    const cat = withCat(save);
    save.current.character.held = { kind: "cat", cat: cat.id };
    save.current.character.body.facing = { x: 0, y: -1 };
    expect(catFacing(save.current, cat, null)).toEqual(BACK);
    expect(personFacing(save.current)).toEqual(BACK);
    // Персонаж дивиться ліворуч: його контейнер має scaleX −1, і кіт у гнізді `arms` дзеркалиться разом із ним. Свого flip
    // кіт не має — інакше −1 · −1 = +1, і кіт на руках дивився б праворуч.
    save.current.character.body.facing = { x: 0, y: 1 };
    expect(personFacing(save.current)).toEqual(FRONT_LEFT);
    expect(catFacing(save.current, cat, null)).toEqual(FRONT);
    const world = (own: RigFacing, owner: RigFacing): boolean => own.flip !== owner.flip;
    expect(world(catFacing(save.current, cat, null), personFacing(save.current))).toBe(true);
    // На колінах (гніздо `lap`) — так само.
    save.current.character.held = null;
    cat.act = act("lap");
    expect(catFacing(save.current, cat, null, { prev: FRONT_LEFT })).toEqual(FRONT);
    save.current.character.body.facing = { x: -1, y: 0 };
    expect(personFacing(save.current)).toEqual(BACK_LEFT);
    expect(catFacing(save.current, cat, null)).toEqual(BACK);
  });
});

describe("розведення пар (`catPairs`)", () => {
  /** Обидва після зсуву — на одній горизонталі екрана, на відстані `gap`. */
  function expectSideBySide(a: Cat, b: Cat, pairs: ReturnType<typeof catPairs>, gap: number): void {
    const pa = pairs.get(a.id)!;
    const pb = pairs.get(b.id)!;
    const at = (cat: Cat, p: typeof pa): Vec => {
      const s = isoScreenDir(cat);
      return { x: s.x + p.offset.x, y: s.y + p.offset.y };
    };
    const sa = at(a, pa);
    const sb = at(b, pb);
    expect(sa.y).toBeCloseTo(sb.y, 6);
    expect(Math.abs(sa.x - sb.x)).toBeCloseTo(gap, 6);
    // Той, хто ліворуч (у клубку — хто був ліворуч), дивиться праворуч, і навпаки, — обличчям одне до одного.
    const aLeft = sa.x < sb.x || (sa.x === sb.x && isoScreenDir(a).x < isoScreenDir(b).x);
    const [left, right] = aLeft ? [pa, pb] : [pb, pa];
    expect(left.facing).toEqual(FRONT);
    expect(right.facing).toEqual(FRONT_LEFT);
    // Зсув у клітинках — той самий, що на екрані.
    for (const p of [pa, pb]) {
      const s = isoScreenDir(p.tile);
      expect(s.x).toBeCloseTo(p.offset.x, 6);
      expect(s.y).toBeCloseTo(p.offset.y, 6);
    }
  }

  it("сценарій «Бійки» (`scenarios/cat-fights.json`): протистояння — морда до морди на горизонталі, клубок — в одній точці, хто ще йде — не в парі", () => {
    const scenario = FILE_SCENARIOS["cat-fights"];
    if (!scenario) throw new Error("немає сценарію");
    const save = applyScenario(scenario);
    const named = (name: string): Cat => save.current.cats.find((c) => c.name === name)!;
    const pairs = catPairs(save.current);
    expect(pairs.get(named("Барсик").id)?.kind).toBe("faceoff");
    expectSideBySide(named("Барсик"), named("Рижик"), pairs, PAIR_GAPS.faceoff);
    expect(pairs.get(named("Мурка").id)?.kind).toBe("brawl");
    expectSideBySide(named("Мурка"), named("Сніжка"), pairs, PAIR_GAPS.brawl);
    expect(pairs.has(named("Кузя").id)).toBe(false);
    // Пара в `catFacing` — обличчям одне до одного.
    const barsik = named("Барсик");
    expect(catFacing(save.current, barsik, null)).toEqual(pairs.get(barsik.id)!.facing);
  });

  it("сценарій «Гра й вилизування» (`scenarios/cats-play-groom.json`): ті, що сплять поруч, — пара; відстань — за розміром пари", () => {
    const scenario = FILE_SCENARIOS["cats-play-groom"];
    if (!scenario) throw new Error("немає сценарію");
    const save = applyScenario(scenario);
    const named = (name: string): Cat => save.current.cats.find((c) => c.name === name)!;
    const pairs = catPairs(save.current);
    expect(pairs.get(named("Ластик").id)?.kind).toBe("pile");
    expectSideBySide(named("Ластик"), named("Пухнастик"), pairs, PAIR_GAPS.pile);
    const half = catPairs(save.current, () => 0.5);
    expectSideBySide(named("Ластик"), named("Пухнастик"), half, PAIR_GAPS.pile * 0.5);
  });

  it("вилизування й гра-боротьба зблизька — пари; розбіглися далі — ні", () => {
    const save = game();
    const a = withCat(save, { x: 9.5, y: 8.5 });
    const b = withCat(save, { x: 9.9, y: 8.5 });
    a.act = act("groom", { target: `cat:${b.id}` });
    b.act = act("idle", { target: `licked:${a.id}` });
    expectSideBySide(a, b, catPairs(save.current), PAIR_GAPS.groom);
    const game2 = { phase: "tussle" as const, left: 2, chaser: a.id, swap: 2 };
    a.act = act("wrestle", { target: `cat:${b.id}`, paired: true, game: game2 });
    b.act = act("wrestle", { target: `cat:${a.id}`, paired: true, game: game2 });
    expect(pairOf(save.current, a)?.kind).toBe("wrestle");
    b.x = 14.5;
    expect(pairOf(save.current, a)).toBeNull();
  });

  it("гра з другом у русі (засідка, погоня, мисливець наздоганяє): не пара, і кожен дивиться туди, куди біжить, а не на другого", () => {
    const save = game();
    const hunter = withCat(save, { x: 9.5, y: 8.5 });
    const prey = withCat(save, { x: 10.5, y: 8.5 });
    const play = (phase: "ambush" | "chase" | "tussle" | "pause") => ({ phase, left: 2, chaser: hunter.id, swap: 2 });
    // Погоня: утікач біжить до (14, 8), мисливець — за ним на клітинку позаду; обидва зсуваються на +0,1 по x (униз-праворуч).
    hunter.act = act("wrestle", { target: `cat:${prey.id}`, paired: true, game: play("chase") });
    prey.act = act("wrestle", { target: `cat:${hunter.id}`, paired: true, game: play("chase"), run: { x: 14, y: 8 } });
    const from = { prey: { x: prey.x, y: prey.y }, hunter: { x: hunter.x, y: hunter.y } };
    prey.x += 0.1;
    hunter.x += 0.1;
    expect(catPairs(save.current).size).toBe(0);
    expect(catFacing(save.current, prey, from.prey)).toEqual(FRONT);
    expect(catFacing(save.current, hunter, from.hunter)).toEqual(FRONT);
    // Утікач далеко попереду й тікає від мисливця — теж за рухом, а не спиною до руху на мисливця.
    prey.x = 13.4;
    expect(catFacing(save.current, prey, { x: 13.3, y: prey.y })).toEqual(FRONT);
    // Першого кадру (руху ще не видно) — до клітинки, куди біжить.
    expect(catFacing(save.current, prey, null)).toEqual(FRONT);
    // Засідка: мисливець припав до підлоги обличчям до утікача, а той підтюпцем відходить ліворуч-униз (+y).
    prey.x = 10.5;
    hunter.act = act("wrestle", { target: `cat:${prey.id}`, paired: true, game: play("ambush") });
    prey.act = act("wrestle", { target: `cat:${hunter.id}`, paired: true, game: play("ambush"), run: { x: 10, y: 11 } });
    expect(catPairs(save.current).size).toBe(0);
    expect(catFacing(save.current, prey, { x: prey.x, y: prey.y - 0.05 })).toEqual(FRONT_LEFT);
    expect(catFacing(save.current, hunter, { x: hunter.x, y: hunter.y })).toEqual(FRONT);
    // Боротьба: мисливець ще наздоганяє (`run`) — не пара; добіг і стоїть поруч — пара.
    prey.x = 10.4;
    hunter.act = act("wrestle", { target: `cat:${prey.id}`, paired: true, game: play("tussle"), run: { x: 10, y: 8 } });
    prey.act = act("wrestle", { target: `cat:${hunter.id}`, paired: true, game: play("tussle") });
    expect(pairOf(save.current, prey)).toBeNull();
    delete hunter.act.run;
    expect(pairOf(save.current, prey)?.kind).toBe("wrestle");
  });

  it("«Щедра душа» підсувається до того, кого гладять, а той лишається під рукою", () => {
    const save = game();
    const lucky = withCat(save, { x: 9.5, y: 8.5 });
    const kind = withCat(save, { x: 10.1, y: 8.6 });
    kind.act = act("idle", { target: `cuddle:${lucky.id}` });
    const pairs = catPairs(save.current);
    expect(pairs.has(lucky.id)).toBe(false);
    const p = pairs.get(kind.id)!;
    expect(p.kind).toBe("cuddle");
    const sl = isoScreenDir(lucky);
    const sk = isoScreenDir(kind);
    expect(sk.y + p.offset.y).toBeCloseTo(sl.y, 6);
    expect(sk.x + p.offset.x - sl.x).toBeCloseTo(PAIR_GAPS.cuddle, 6);
    expect(p.facing).toEqual(FRONT_LEFT);
  });

  it("новонароджені біля сплячої матері — рядком перед нею, обличчям до неї; мати на місці", () => {
    const save = game();
    const mother = withCat(save, { x: 9.5, y: 8.5 });
    mother.act = act("sleep", { minutes: 600 });
    const kittens = [0, 1, 2].map((i) => {
      const k = withCat(save, { x: 9.5 + (i - 1) * 0.25, y: 8.65 }, {}, 0);
      k.source = "born";
      k.parents = { mother: mother.id, father: null };
      k.act = act("sleep", { minutes: 600 });
      return k;
    });
    const pairs = catPairs(save.current);
    expect(pairs.get(mother.id)).toMatchObject({ kind: "nursing", offset: { x: 0, y: 0 }, facing: null });
    const sm = isoScreenDir(mother);
    const spots = kittens.map((k) => {
      const p = pairs.get(k.id)!;
      expect(p.kind).toBe("nursing");
      const s = isoScreenDir(k);
      return { x: s.x + p.offset.x, y: s.y + p.offset.y, facing: p.facing };
    });
    for (const spot of spots) expect(spot.y).toBeCloseTo(sm.y + NURSING.front, 6);
    expect(spots.map((s) => s.x - sm.x)).toEqual([-NURSING.spacing, 0, NURSING.spacing].map((x) => expect.closeTo(x, 6)));
    expect(spots[0]!.facing).toEqual(FRONT);
    expect(spots[2]!.facing).toEqual(FRONT_LEFT);
    // Мати прокинулася — кошенята вже не рядком.
    mother.act = idleAct(10);
    expect(catPairs(save.current).size).toBe(0);
  });
});
