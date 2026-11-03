// Куди дивиться кіт в ізометрії й розведення пар (крок 16, GRAPHICS_PLAN.md, «Вибір анімації»): `catFacing`
// (`src/view/anim/catfacing.ts`) — 4 ракурси з руху, цілі, вікна й настрою, з гістерезисом; `catPairs` (`anim/pairs.ts`) —
// пари вздовж горизонталі екрана.

import { describe, expect, it } from "vitest";

import { createCat, idleAct } from "../src/sim/cat";
import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { advance, newGame } from "../src/sim/game";
import { catOnComputer } from "../src/sim/catai";
import { objectById, WINDOWS } from "../src/sim/home";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { absoluteMinute } from "../src/sim/time";
import type { Cat, CatAct, Save, TraitLevel, Vec } from "../src/sim/types";
import { catFacing, facingFromScreen, facingFromTiles, FACING_HYSTERESIS, FACING_SMOOTH, holdFlip, personFacing, smoothHeading } from "../src/view/anim/catfacing";
import { isoScreenDir, isoTileDir, ISO_TILE } from "../src/view/anim/iso";
import { catCrowds, catPairs, CROWD, crowdMemory, GROOM_FRONT, NURSING, PAIR_GAPS, pairOf, PERCH, perchCrowds, perchMemory, type CrowdMember, type PerchArea, type PerchMember } from "../src/view/anim/pairs";
import { isoOrder } from "../src/view/world/isoorder";
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

  it("іде майже прямо вгору шляхом сима з відрізків трохи різного нахилу — не перекидається з боку на бік (рецензія хвилі 3)", () => {
    // Справжній шлях кота з рецензії (кадри по 50 мс, `rv-walkback`): горизонтальна складова на екрані міняє знак.
    const path: [number, number][] = [
      [8.579, 9.365], [8.454, 9.265], [8.329, 9.165], [8.204, 9.064], [8.101, 8.949], [8.039, 8.801], [7.957, 8.669],
      [7.832, 8.569], [7.666, 8.435], [7.541, 8.335], [7.416, 8.235], [7.291, 8.135], [7.167, 8.035], [7.064, 7.918],
      [7.005, 7.77], [6.902, 7.652], [6.738, 7.517], [6.614, 7.415], [6.49, 7.314], [6.367, 7.212], [6.243, 7.111],
      [6.12, 7.009], [5.996, 6.908],
    ];
    const save = game();
    const cat = withCat(save, { x: path[0]![0], y: path[0]![1] });
    cat.act = act("wander", { goal: { x: 3, y: 6 } });
    // Кадри по 50 мс, між знімками рецензії — рівномірно.
    const run = (): number => {
      const heading = { x: 0, y: 0 };
      let prev: RigFacing | null = null;
      let flips = 0;
      let flipAt = Number.NEGATIVE_INFINITY;
      for (let i = 1; i < path.length; i++) {
        const [x0, y0] = path[i - 1]!;
        const [x1, y1] = path[i]!;
        cat.x = x1;
        cat.y = y1;
        const time = i * 50;
        smoothHeading(heading, x1 - x0, y1 - y0, 0.05);
        const facing = holdFlip(catFacing(save.current, cat, { x: x0, y: y0 }, { prev, pair: null, heading }), prev, true, time - flipAt);
        if (prev && facing.flip !== prev.flip) {
          flips++;
          flipAt = time;
        }
        // Угору екраном — завжди ззаду.
        expect(facing.view).toBe("back");
        prev = facing;
      }
      return flips;
    };
    // Кадр за кадром з гістерезисом 0,2 кіт віддзеркалювався кожні 0,3–0,5 с; згладжений — ні разу.
    expect(run()).toBe(0);
  });

  it("згладжений напрям іде за справжнім поворотом: кіт, що звернув з угору-ліворуч на угору-праворуч, віддзеркалюється", () => {
    const save = game();
    const cat = withCat(save, { x: 9.5, y: 8.5 });
    cat.act = act("wander", { goal: { x: 3, y: 6 } });
    const heading = { x: 0, y: 0 };
    let prev: RigFacing | null = null;
    let flipAt = Number.NEGATIVE_INFINITY;
    let turnedAt = Number.NaN;
    const speed = 2;
    for (let t = 16; t <= 2000; t += 16) {
      // Угору-ліворуч на екрані — −x; угору-праворуч — −y (ізометрія 2:1).
      const dir = t < 800 ? { x: -1, y: 0 } : { x: 0, y: -1 };
      const step = { x: dir.x * speed * 0.016, y: dir.y * speed * 0.016 };
      const before = { x: cat.x, y: cat.y };
      cat.x += step.x;
      cat.y += step.y;
      smoothHeading(heading, step.x, step.y, 0.016);
      const facing = holdFlip(catFacing(save.current, cat, before, { prev, pair: null, heading }), prev, true, t - flipAt);
      if (prev && facing.flip !== prev.flip) {
        flipAt = t;
        if (Number.isNaN(turnedAt)) turnedAt = t;
      }
      if (t < 800 && t > 100) expect(facing).toEqual(BACK_LEFT);
      prev = facing;
    }
    expect(prev).toEqual(BACK);
    // Не пізніше, ніж за згладжування й утримання віддзеркалення.
    expect(turnedAt - 800).toBeLessThan(FACING_SMOOTH.headingMs + FACING_SMOOTH.flipMs);
    // Переставлений кіт (стрибок на клітинки) напряму не змінює.
    const kept = { ...heading };
    smoothHeading(heading, 3, 0, 0.016);
    expect(heading).toEqual(kept);
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

  it("сидить на клавіатурі й заважає роботі — лицем до нас, з якої половини стола не сів би; бік — як був (рецензія пакета)", () => {
    const save = game();
    const desk = objectById("computer");
    // Розбудили на правій половині стола (`wakeOnComputer`): сідає на клавіатуру, а вигляд малює його на ній посеред стола
    // (`deskSeat`). До середини комп'ютера від точки сима (−0,5 по x) — спиною до камери, на пів монітора.
    const cat = withCat(save, { x: desk.x + 1.5, y: desk.y + 0.5 });
    cat.facing = -1;
    cat.act = act("keyboard", { target: "computer", minutes: 5 });
    expect(catOnComputer(save.current)).toBe(cat);
    expect(catFacing(save.current, cat, null, { pair: null })).toEqual(FRONT_LEFT);
    expect(catFacing(save.current, cat, null, { pair: null, prev: FRONT })).toEqual(FRONT);
    expect(catFacing(save.current, cat, null, { pair: null, prev: BACK_LEFT })).toEqual(FRONT_LEFT);
    // На лівій половині, куди його садить сим, — так само лицем до нас.
    cat.x = desk.x + 0.5;
    cat.facing = 1;
    expect(catFacing(save.current, cat, null, { pair: null })).toEqual(FRONT);
    // Другий з act keyboard, що чекає поруч (на клавіатурі вже перший), роботі не заважає — дивиться на комп'ютер, як і раніше.
    const second = withCat(save, { x: desk.x + 1.5, y: desk.y + 0.5 });
    second.facing = 1;
    second.act = act("keyboard", { target: "computer", minutes: 5 });
    expect(catOnComputer(save.current)).toBe(cat);
    expect(catFacing(save.current, second, null, { pair: null })).toEqual(BACK_LEFT);
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

  it("під рукою — головою від персонажа: рука лягає на спинку з боку крупа, а голова й вуха — на виду (рецензія хвилі 3)", () => {
    const save = game();
    const body = save.current.character.body;
    const cat = withCat(save, { x: 9.5, y: 8.5 });
    cat.facing = -1;
    save.current.character.activity = { kind: "pet", cat: cat.id, minutes: 0.5 };
    // Персонаж ліворуч на екрані (−x) — кіт дивиться праворуч, і навпаки.
    body.x = 8.9;
    body.y = 8.5;
    expect(catFacing(save.current, cat, null)).toEqual(FRONT);
    body.x = 10.1;
    expect(catFacing(save.current, cat, null)).toEqual(FRONT_LEFT);
  });

  it("у юрбі біля персонажа (сим поставив кота в його точку) — куди дивитися, від того місця, де кота намальовано (`at`)", () => {
    const save = game();
    const body = save.current.character.body;
    body.x = 9.5;
    body.y = 8.5;
    const cat = withCat(save, { x: 9.5, y: 8.5 });
    cat.facing = -1;
    const right = { x: 9.5 + 0.44, y: 8.5 - 0.44 };
    const left = { x: 9.5 - 0.44, y: 8.5 + 0.44 };
    // Під рукою праворуч від персонажа — головою праворуч, від нього; ліворуч — ліворуч.
    save.current.character.activity = { kind: "pet", cat: cat.id, minutes: 0.5 };
    expect(catFacing(save.current, cat, null, { at: right })).toEqual(FRONT);
    expect(catFacing(save.current, cat, null, { at: left })).toEqual(FRONT_LEFT);
    // Прийшов по увагу й стоїть обабіч — до персонажа.
    save.current.character.activity = null;
    cat.act = act("attention", { target: "character" });
    expect(catFacing(save.current, cat, null, { at: left })).toEqual(FRONT);
    expect(catFacing(save.current, cat, null, { at: right })).toEqual(FRONT_LEFT);
    // Підійшов знизу (спиною до камери) і став обабіч — обертається мордою до нас; персонаж помітно вище — спиною.
    expect(catFacing(save.current, cat, null, { at: { x: left.x, y: left.y + 0.05 }, prev: BACK })).toEqual(FRONT);
    expect(catFacing(save.current, cat, null, { at: { x: 10.1, y: 9.1 }, prev: FRONT })).toEqual(BACK);
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
  function expectSideBySide(a: Cat, b: Cat, pairs: ReturnType<typeof catPairs>, gap: number, front = 0): void {
    const pa = pairs.get(a.id)!;
    const pb = pairs.get(b.id)!;
    const at = (cat: Cat, p: typeof pa): Vec => {
      const s = isoScreenDir(cat);
      return { x: s.x + p.offset.x, y: s.y + p.offset.y };
    };
    const sa = at(a, pa);
    const sb = at(b, pb);
    expect(sa.y - front).toBeCloseTo(sb.y, 6);
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
    // Той, хто вилизує, — трохи ближче до камери: у порядку малювання поверх друга, з якого боку не сидів би.
    expectSideBySide(a, b, catPairs(save.current), PAIR_GAPS.groom, GROOM_FRONT);
    b.x = 9.1;
    expectSideBySide(a, b, catPairs(save.current), PAIR_GAPS.groom, GROOM_FRONT);
    for (const [x, y] of [[9.9, 8.5], [9.1, 8.5], [9.5, 8.9], [9.5, 8.1]] as const) {
      b.x = x;
      b.y = y;
      const pairs = catPairs(save.current);
      const ta = { x: a.x + pairs.get(a.id)!.tile.x, y: a.y + pairs.get(a.id)!.tile.y, half: 30 };
      const tb = { x: b.x + pairs.get(b.id)!.tile.x, y: b.y + pairs.get(b.id)!.tile.y, half: 30 };
      expect([...isoOrder([], [ta, tb])]).toEqual([1, 0]);
    }
    b.x = 9.9;
    b.y = 8.5;
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

describe("юрба (`catCrowds`)", () => {
  const free = (): boolean => false;
  const member = (id: number, at: Vec, toPerson = false, size = 1): CrowdMember => ({ id, at, size, toPerson });
  /** Де кіт на екрані після зсуву. */
  const placed = (m: CrowdMember, out: Map<number, Vec>): Vec => {
    const shift = out.get(m.id) ?? { x: 0, y: 0 };
    return isoScreenDir({ x: m.at.x + shift.x, y: m.at.y + shift.y });
  };

  it("четверо біля ніг персонажа (сим веде всіх у центр його клітинки) — обабіч нього, не на ньому й не одне в одному", () => {
    const person = { x: 2.5, y: 2.5 };
    const members = [1, 2, 3, 4].map((id) => member(id, { x: 2.5, y: 2.5 }, true));
    const out = catCrowds(members, person, free, new Map());
    const ps = isoScreenDir(person);
    const xs = members.map((m) => placed(m, out)).map((p) => p.x - ps.x).sort((a, b) => a - b);
    // Двоє ліворуч, двоє праворуч, перший — на `beside` від персонажа, далі — з кроком `step`.
    expect(xs).toEqual([-CROWD.beside - CROWD.step, -CROWD.beside, CROWD.beside, CROWD.beside + CROWD.step].map((x) => expect.closeTo(x, 6)));
    // Уздовж горизонталі екрана й трохи ближче до камери (`front`): хто зверху, кіт чи персонаж, не вирішує похибка округлення;
    // і кожен наступний праворуч — ще на `tie` ближче (сусіди не міняються місцями від похибки).
    const ys = members.map((m) => placed(m, out)).sort((a, b) => a.x - b.x).map((p) => p.y - ps.y);
    expect(ys).toEqual([0, 1, 2, 3].map((k) => expect.closeTo(CROWD.front + k * CROWD.tie, 6)));
  });

  /** Де на екрані кожен кіт юрби біля персонажа відносно нього (x) після зсуву. */
  const sides = (members: readonly CrowdMember[], out: Map<number, Vec>, person: Vec): Map<number, number> =>
    new Map(members.map((m) => [m.id, placed(m, out).x - isoScreenDir(person).x]));

  it("кота під рукою сим перемикає з уваги на `idle` — він лишається на своєму місці, і решта юрби не переставляється", () => {
    const person = { x: 4.5, y: 8.5 };
    const memory = crowdMemory();
    const at = { x: 4.5, y: 8.5 };
    const before = [1, 2, 3].map((id) => member(id, at, true));
    const first = sides(before, catCrowds(before, person, free, new Map(), memory), person);
    // Кота 1 почали гладити: сим міняє йому дію на `idle` — до персонажа він більше «не йде», але під рукою.
    const petted = [{ ...member(1, at, false), touched: true }, member(2, at, true), member(3, at, true)];
    const second = sides(petted, catCrowds(petted, person, free, new Map(), memory), person);
    for (const id of [1, 2, 3]) expect(second.get(id), `кіт ${id}`).toBeCloseTo(first.get(id)!, 6);
    // Під рукою — не в ногах персонажа: збоку, на `beside`.
    expect(Math.abs(second.get(1)!)).toBeCloseTo(CROWD.beside, 6);
    // Перестали гладити, а кіт стоїть, де стояв, — так і лишається (не ковзає в ноги персонажа).
    const after = [member(1, at, false), member(2, at, true), member(3, at, true)];
    const third = sides(after, catCrowds(after, person, free, new Map(), memory), person);
    for (const id of [1, 2, 3]) expect(third.get(id), `кіт ${id}`).toBeCloseTo(first.get(id)!, 6);
  });

  it("місця тримаються між кадрами: хто вийшов, не перекидає решту на другий бік; новий стає з краю свого боку", () => {
    const person = { x: 4.5, y: 8.5 };
    const memory = crowdMemory();
    const at = { x: 4.5, y: 8.5 };
    const four = [1, 2, 3, 4].map((id) => member(id, at, true));
    const was = sides(four, catCrowds(four, person, free, new Map(), memory), person);
    // Двоє ліворуч і двоє праворуч.
    expect([...was.values()].filter((x) => x < 0)).toHaveLength(2);
    // Один із правих пішов (рушив — сим веде його геть, у юрбі його вже немає): решта на своїх боках.
    const goneId = [...was.entries()].find(([, x]) => x > 0)![0];
    const three = four.filter((m) => m.id !== goneId);
    const now = sides(three, catCrowds(three, person, free, new Map(), memory), person);
    for (const m of three) expect(Math.sign(now.get(m.id)!), `кіт ${m.id}`).toBe(Math.sign(was.get(m.id)!));
    // Ліві не зрушили; правий, що лишився, став ближче, на `beside`.
    for (const m of three.filter((m) => was.get(m.id)! < 0)) expect(now.get(m.id)!).toBeCloseTo(was.get(m.id)!, 6);
    expect(Math.min(...three.map((m) => now.get(m.id)!).filter((x) => x > 0))).toBeCloseTo(CROWD.beside, 6);
    // Новий (сим привів його в точку персонажа) стає з краю того боку, де менше котів, — праворуч, хоч прийшов і зліва
    // (`from` −1); решта не рухається.
    const four2 = [...three, { ...member(9, at, true), from: -1 }];
    const next = sides(four2, catCrowds(four2, person, free, new Map(), memory), person);
    for (const m of three) expect(next.get(m.id)!).toBeCloseTo(now.get(m.id)!, 6);
    expect(next.get(9)!).toBeCloseTo(CROWD.beside + CROWD.step, 6);
    // Порівну — з того боку, звідки прийшов.
    const five = [...four2, { ...member(10, at, true), from: -1 }];
    const last = sides(five, catCrowds(five, person, free, new Map(), memory), person);
    expect(last.get(10)!).toBeCloseTo(-CROWD.beside - 2 * CROWD.step, 6);
  });

  it("з одного боку персонажа меблі — нові стають з другого, а не лишаються в його ногах", () => {
    const person = { x: 4.5, y: 8.7 };
    const memory = crowdMemory();
    const at = { x: 4.5, y: 8.7 };
    // Ліворуч на екрані (x менший, y більший) — ліжко: від клітинки y 9 і далі.
    const bed = (_x: number, y: number): boolean => y >= 9;
    const three = [1, 2, 3].map((id) => ({ ...member(id, at, true), from: -1 }));
    const out = catCrowds(three, person, bed, new Map(), memory);
    const xs = sides(three, out, person);
    // Усі троє зсунуті (ніхто не лишився в точці персонажа) і всі праворуч, кожен на своєму місці.
    expect(out.size).toBe(3);
    expect([...xs.values()].sort((a, b) => a - b)).toEqual([CROWD.beside, CROWD.beside + CROWD.step, CROWD.beside + 2 * CROWD.step].map((x) => expect.closeTo(x, 6)));
  });

  it("кіт під рукою на дальньому місці стає найближчим до персонажа на своєму боці (рука дістає) і там лишається", () => {
    const person = { x: 4.5, y: 8.5 };
    const memory = crowdMemory();
    const at = { x: 4.5, y: 8.5 };
    const four = [1, 2, 3, 4].map((id) => member(id, at, true));
    const was = sides(four, catCrowds(four, person, free, new Map(), memory), person);
    const [outerId, outerX] = [...was.entries()].find(([, x]) => Math.abs(x) > CROWD.beside + 1)!;
    const touch = (id: number): CrowdMember[] => four.map((m) => (m.id === id ? { ...m, touched: true } : m));
    const now = sides(four, catCrowds(touch(outerId), person, free, new Map(), memory), person);
    expect(now.get(outerId)!).toBeCloseTo(Math.sign(outerX) * CROWD.beside, 6);
    // Ніхто не перейшов на другий бік.
    for (const m of four) expect(Math.sign(now.get(m.id)!)).toBe(Math.sign(was.get(m.id)!));
    // Пестощі скінчилися — лишається найближчим.
    const after = sides(four, catCrowds(four, person, free, new Map(), memory), person);
    expect(after.get(outerId)!).toBeCloseTo(Math.sign(outerX) * CROWD.beside, 6);
  });

  it("персонаж відійшов — кіт уже не в юрбі біля нього й місця не тримає", () => {
    const memory = crowdMemory();
    const at = { x: 4.5, y: 8.5 };
    const cat = member(1, at, false);
    catCrowds([member(1, at, true)], { x: 4.5, y: 8.5 }, free, new Map(), memory);
    expect(memory.slots.has(1)).toBe(true);
    expect(catCrowds([cat], { x: 6.5, y: 8.5 }, free, new Map(), memory).size).toBe(0);
    expect(memory.slots.size).toBe(0);
  });

  it("персонаж стоїть не в центрі клітинки, а коти прийшли в її центр — обабіч нього, і жоден не в смузі його ніг", () => {
    // Ступив праворуч угору (6,03; 7,30), а троє — у центрі клітинки (5,5; 7,5): ≈ 47 ліворуч від нього на екрані. І стоїть
    // ліворуч угорі своєї клітинки (4,9; 8,1), коти — у центрі (4,5; 8,5): ≈ 51 ліворуч.
    for (const [person, at] of [
      [{ x: 6.03, y: 7.3 }, { x: 5.5, y: 7.5 }],
      [{ x: 4.9, y: 8.1 }, { x: 4.5, y: 8.5 }],
    ] as const) {
      const three = [1, 2, 3].map((id) => member(id, at, true));
      const xs = [...sides(three, catCrowds(three, person, free, new Map()), person).values()];
      // Стояли ліворуч від нього — ліворуч і лишаються (крізь персонажа не перебігають), рядком від `beside`.
      expect(xs.sort((a, b) => b - a)).toEqual([-CROWD.beside, -CROWD.beside - CROWD.step, -CROWD.beside - 2 * CROWD.step].map((x) => expect.closeTo(x, 6)));
      for (const x of xs) expect(Math.abs(x)).toBeGreaterThanOrEqual(CROWD.beside - 1e-6);
    }
    // Будь-де в клітинці персонажа кіт у її центрі — біля його ніг.
    for (const dx of [-0.49, 0, 0.49]) {
      for (const dy of [-0.49, 0, 0.49]) {
        const person = { x: 4.5 + dx, y: 8.5 + dy };
        const cat = member(1, { x: 4.5, y: 8.5 }, true);
        const x = placed(cat, catCrowds([cat], person, free, new Map())).x - isoScreenDir(person).x;
        expect(Math.abs(x), `персонаж ${person.x}, ${person.y}`).toBeCloseTo(CROWD.beside, 6);
      }
    }
  });

  it("один біля ніг персонажа — збоку від нього, з того боку, де стоїть; далеко від нього — на місці", () => {
    const person = { x: 5.5, y: 5.5 };
    const left = member(1, { x: 5.45, y: 5.55 }, true);
    const out = catCrowds([left], person, free, new Map());
    expect(placed(left, out).x - isoScreenDir(person).x).toBeCloseTo(-CROWD.beside, 6);
    const far = member(2, { x: 7.5, y: 5.5 }, true);
    expect(catCrowds([far], person, free, new Map()).size).toBe(0);
  });

  it("кіт під рукою позаду персонажа (≈ 51 угору на екрані) — обабіч нього, а не за ногами; той, хто лише прийшов, — на місці", () => {
    const person = { x: 5.5, y: 5.5 };
    const ps = isoScreenDir(person);
    // Діагональ угору: 0,8 клітинки за x і y — ≈ 51 угору на екрані, кіт у межах `REACH` + 0,6 від персонажа.
    const at = { x: 4.7, y: 4.7 };
    expect(ps.y - isoScreenDir(at).y).toBeGreaterThan(CROWD.person.y);
    expect(ps.y - isoScreenDir(at).y).toBeLessThan(CROWD.touch.y);
    const petted: CrowdMember = { ...member(1, at, true), touched: true };
    const x = placed(petted, catCrowds([petted], person, free, new Map())).x - ps.x;
    expect(Math.abs(x)).toBeCloseTo(CROWD.beside, 6);
    // Не під рукою — смуга «біля ніг» звичайна: стоїть, де стоїть.
    expect(catCrowds([member(1, at, true)], person, free, new Map()).size).toBe(0);
  });

  it("двоє в одній точці — рядком довкола спільної середини, правіший трохи ближче до камери; хто стоїть окремо — на місці", () => {
    const a = member(1, { x: 9.5, y: 8.5 });
    const b = member(2, { x: 9.5, y: 8.5 });
    const c = member(3, { x: 14.5, y: 6.5 });
    const out = catCrowds([a, b, c], null, free, new Map());
    const pa = placed(a, out);
    const pb = placed(b, out);
    expect(Math.abs(pa.x - pb.x)).toBeCloseTo(CROWD.step, 6);
    expect((pa.x + pb.x) / 2).toBeCloseTo(isoScreenDir(a.at).x, 6);
    // Ключ глибини (x + y) правішого більший на сталу величину, а не на похибку округлення.
    const [left, right] = pa.x < pb.x ? [pa, pb] : [pb, pa];
    expect(right.y - left.y).toBeCloseTo(CROWD.tie, 6);
    expect(out.has(3)).toBe(false);
    // Кошенята — тісніше (крок за розміром).
    const k1 = member(4, { x: 9.5, y: 8.5 }, false, 0.5);
    const k2 = member(5, { x: 9.5, y: 8.5 }, false, 0.5);
    const kids = catCrowds([k1, k2], null, free, new Map());
    expect(Math.abs(placed(k1, kids).x - placed(k2, kids).x)).toBeCloseTo(CROWD.step * 0.5, 6);
  });

  it("двоє біля однієї миски (охоронець і злодій, двоє голодних) — обабіч неї, і той, хто дивиться праворуч, — ліворуч", () => {
    const bowl = { id: 90, at: { x: 17.5, y: 3.5 } };
    // Обидва сидять за мискою (`bowlSeat`) в одній точці; Мурка дивиться ліворуч (`from` 1), Барсик — праворуч (−1).
    const seat = { x: 17.15, y: 3.15 };
    const murka = { ...member(104, seat), from: 1, bowl };
    const barsik = { ...member(105, seat), from: -1, bowl };
    const out = catCrowds([murka, barsik], null, free, new Map());
    const bx = isoScreenDir(bowl.at).x;
    expect(placed(barsik, out).x - bx).toBeCloseTo(-CROWD.bowl, 6);
    expect(placed(murka, out).x - bx).toBeCloseTo(CROWD.bowl, 6);
    // Не ближче до камери, ніж сиділи (за мискою), — лише сталий порядок сусідів.
    expect(placed(murka, out).y - isoScreenDir(seat).y).toBeCloseTo(CROWD.tie, 6);
    // Далі місця тримаються, хоч би як вони тепер дивилися: хто ліворуч, той ліворуч.
    const shifted = (m: CrowdMember): CrowdMember => ({ ...m, shift: out.get(m.id)!, from: -(m.from ?? 0) });
    const next = catCrowds([shifted(murka), shifted(barsik)], null, free, new Map());
    expect(placed(barsik, next).x).toBeLessThan(placed(murka, next).x);
    // Кошенята — тісніше.
    const k1 = { ...member(1, seat, false, 0.5), bowl };
    const k2 = { ...member(2, seat, false, 0.5), bowl };
    const kids = catCrowds([k1, k2], null, free, new Map());
    expect(Math.abs(placed(k1, kids).x - placed(k2, kids).x)).toBeCloseTo(2 * CROWD.bowl * 0.5, 6);
  });

  it("кіт біля миски не стає в юрбу біля ніг персонажа, а один біля своєї миски — на своєму місці", () => {
    const bowl = { id: 90, at: { x: 4.5, y: 8.5 } };
    const person = { x: 4.5, y: 8.5 };
    const eating = { ...member(1, { x: 4.15, y: 8.15 }, true), bowl };
    expect(catCrowds([eating], person, free, new Map()).size).toBe(0);
  });

  it("місце в юрбі в стіні чи в меблях — кіт лишається, де стоїть; щокадру той самий вихідний об'єкт", () => {
    const a = member(1, { x: 1.05, y: 6.5 });
    const b = member(2, { x: 1.05, y: 6.5 });
    const out = new Map<number, Vec>();
    const result = catCrowds([a, b], null, (x) => x < 1, out);
    expect(result).toBe(out);
    // Лівий пішов би в стіну (x < 1) — лишився; правий зсунувся.
    expect(out.size).toBe(1);
    expect(catCrowds([], null, free, out).size).toBe(0);
  });
});

describe("юрба на речах (`perchCrowds`)", () => {
  /** Поверхні: ліжко 1 × 2 (довгий бік — y), верх холодильника 1 × 1, дошка підвіконня вітальні (вздовж y), вхід будиночка. */
  const BED: PerchArea = { x0: 1, y0: 1, x1: 2, y1: 3, margin: PERCH.margin, step: PERCH.step };
  const FRIDGE: PerchArea = { x0: 13, y0: 1, x1: 14, y1: 2, margin: PERCH.margin, step: PERCH.step };
  const SILL: PerchArea = { x0: 1, y0: 8, x1: 1.3, y1: 9, margin: PERCH.margin, step: PERCH.step };
  const member = (id: number, at: Vec, area: PerchArea, key = "bed", size = 1, partner: number | null = null): PerchMember => ({ id, key, at, size, area, partner });
  const placedAt = (m: PerchMember, out: Map<number, Vec>): Vec => {
    const shift = out.get(m.id) ?? { x: 0, y: 0 };
    return { x: m.at.x + shift.x, y: m.at.y + shift.y };
  };
  const screen = (m: PerchMember, out: Map<number, Vec>): Vec => isoScreenDir(placedAt(m, out));
  const gap = (a: PerchMember, b: PerchMember, out: Map<number, Vec>): number => {
    const pa = screen(a, out);
    const pb = screen(b, out);
    return Math.hypot(pa.x - pb.x, pa.y - pb.y);
  };
  const inside = (p: Vec, area: PerchArea): boolean => p.x >= area.x0 - 1e-9 && p.x <= area.x1 + 1e-9 && p.y >= area.y0 - 1e-9 && p.y <= area.y1 + 1e-9;

  it("двоє в одній точці ліжка — рядком уздовж довгого боку (y), на крок один від одного, обидва на ліжку", () => {
    const a = member(1, { x: 1.5, y: 2.5 }, BED);
    const b = member(2, { x: 1.5, y: 2.5 }, BED);
    const out = perchCrowds([a, b], new Map());
    expect(gap(a, b, out)).toBeCloseTo(PERCH.step, 6);
    // Уздовж y: x не змінився, середина — там, де лежали.
    expect(placedAt(a, out).x).toBeCloseTo(1.5, 9);
    expect(placedAt(b, out).x).toBeCloseTo(1.5, 9);
    expect((placedAt(a, out).y + placedAt(b, out).y) / 2).toBeCloseTo(2.5, 9);
    for (const m of [a, b]) expect(inside(placedAt(m, out), BED)).toBe(true);
  });

  it("кошенята — тісніше (крок × розмір); хто й так далі за крок — лишається, де лежав", () => {
    const a = member(1, { x: 1.5, y: 2.5 }, BED, "bed", 0.5);
    const b = member(2, { x: 1.5, y: 2.5 }, BED, "bed", 0.5);
    expect(gap(a, b, perchCrowds([a, b], new Map()))).toBeCloseTo(PERCH.step * 0.5, 6);
    const far = member(3, { x: 1.5, y: 1.5 }, BED);
    const near = member(4, { x: 1.5, y: 2.5 }, BED);
    expect(perchCrowds([far, near], new Map()).size).toBe(0);
  });

  it("квадратна річ — горизонталлю екрана; не вміщаються — щільніше, але не ближче за `squeeze` кроку, і в межах речі", () => {
    const cats = [1, 2, 3].map((id) => member(id, { x: 13.5, y: 1.5 }, FRIDGE, "fridge"));
    const out = perchCrowds(cats, new Map());
    const ys = cats.map((m) => screen(m, out).y);
    for (const y of ys) expect(y).toBeCloseTo(ys[0]!, 6);
    const xs = cats.map((m) => screen(m, out).x).sort((p, q) => p - q);
    // Троє по 40 не вміщаються в 0,6 клітинки горизонталі (77): крок менший за 40, але не менший за squeeze.
    const step = xs[1]! - xs[0]!;
    expect(step).toBeLessThan(PERCH.step);
    expect(step).toBeGreaterThanOrEqual(PERCH.step * PERCH.squeeze - 1e-6);
    expect(xs[2]! - xs[1]!).toBeCloseTo(step, 6);
    for (const m of cats) expect(inside(placedAt(m, out), FRIDGE)).toBe(true);
    // Шестеро кошенят на підвіконні: кожного видно (не ближче за squeeze кроку).
    const kids = [1, 2, 3, 4, 5, 6].map((id) => member(id, { x: 1.12, y: 8.5 }, SILL, "sill", 0.6));
    const sill = perchCrowds(kids, new Map());
    const along = kids.map((m) => placedAt(m, sill).y).sort((p, q) => p - q);
    for (let i = 1; i < along.length; i++) expect((along[i]! - along[i - 1]!) * Math.hypot(64, 32)).toBeGreaterThanOrEqual(PERCH.step * 0.6 * PERCH.squeeze - 1e-6);
    // На підвіконні — уздовж дошки, на тій самій відстані від стіни.
    for (const m of kids) expect(placedAt(m, sill).x).toBeCloseTo(1.12, 9);
  });

  it("за рівних місць — черга приходу: хто лежав, лишається з того самого боку, хоч би який номер мав новий", () => {
    const memory = perchMemory();
    const first = member(9, { x: 1.5, y: 2.5 }, BED);
    expect(perchCrowds([first], new Map(), memory).size).toBe(0);
    const late = member(2, { x: 1.5, y: 2.5 }, BED);
    const out = perchCrowds([late, first], new Map(), memory);
    // Новий — далі вздовж ліжка (у кінці рядка), той, хто лежав, — з початку, хоч номер у нового менший.
    expect(placedAt(late, out).y).toBeGreaterThan(placedAt(first, out).y);
    // Наступного кадру — так само.
    const again = perchCrowds([first, late], new Map(), memory);
    expect(placedAt(late, again).y).toBeCloseTo(placedAt(late, out).y, 9);
    // Пішов і повернувся — тепер він новий.
    perchCrowds([late], new Map(), memory);
    const back = perchCrowds([first, late], new Map(), memory);
    expect(placedAt(first, back).y).toBeGreaterThan(placedAt(late, back).y);
  });

  it("двоє з пари лежать на своїй відстані, третій їх не розділяє; різні речі одна одну не зсувають", () => {
    // Пара, розсунута `catPairs` уздовж горизонталі екрана (±15), і третій у тій самій точці.
    const half = isoTileDir({ x: 15, y: 0 });
    const a = member(1, { x: 1.5 - half.x, y: 2.5 - half.y }, BED, "bed", 1, 2);
    const b = member(2, { x: 1.5 + half.x, y: 2.5 + half.y }, BED, "bed", 1, 1);
    const c = member(3, { x: 1.5, y: 2.5 }, BED);
    const out = perchCrowds([a, b, c], new Map());
    const pos = (m: PerchMember): number => placedAt(m, out).y;
    // Пара — поруч (її відстань уздовж ліжка не змінилася), третій — з одного боку від обох.
    expect(Math.abs(pos(a) - pos(b))).toBeCloseTo(Math.abs(a.at.y - b.at.y), 9);
    const c0 = pos(c);
    expect((c0 - pos(a)) * (c0 - pos(b))).toBeGreaterThan(0);
    expect(Math.min(gap(c, a, out), gap(c, b, out))).toBeGreaterThan(PERCH.step * 0.5);
    // Двоє на різних речах у «тій самій» точці (ключі різні) не зсуваються.
    const x = member(4, { x: 13.5, y: 1.5 }, FRIDGE, "fridge");
    const y = member(5, { x: 13.5, y: 1.5 }, FRIDGE, "wardrobe");
    expect(perchCrowds([x, y], new Map()).size).toBe(0);
  });

  it("дописує в той самий об'єкт, не очищаючи юрби на підлозі", () => {
    const out = new Map<number, Vec>([[42, { x: 0.1, y: 0 }]]);
    const result = perchCrowds([member(1, { x: 1.5, y: 2.5 }, BED), member(2, { x: 1.5, y: 2.5 }, BED)], out);
    expect(result).toBe(out);
    expect(out.get(42)).toEqual({ x: 0.1, y: 0 });
    expect(out.size).toBe(3);
  });
});
