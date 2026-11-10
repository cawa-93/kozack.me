// Речі гри не на своєму місці (§8.7, «Що ставить гра»): сховища, ящики біля входу, переноска й велика коробка, які гра
// поставила поруч із зайнятим місцем, вигляд, сцена й звук беруть там, де вони стоять зараз (`state.home.displaced`). Тут зсув
// задано руками: розставляє речі симуляція (`tests/gamethings.test.ts`).

import { describe, expect, it } from "vitest";

import { catEvent } from "../src/audio/sfx/cats/events";
import { homeCues } from "../src/audio/sfx/home/cues";
import { brokeAt } from "../src/audio/sfx/home/where";
import { soundPoint } from "../src/audio/sfx/place";
import type { Cue } from "../src/audio/sfx/types";
import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { BIG_BOX_TARGET } from "../src/sim/bigbox";
import { createCat } from "../src/sim/cat";
import { newGame } from "../src/sim/game";
import {
  BIG_BOX,
  CARRIER_SPOT,
  centerOf,
  GAME_THINGS,
  hiddenTile,
  itemTile,
  objectById,
  OBJECTS,
  PLACES,
  placedObject,
  thingHome,
  thingPresent,
  withThing,
} from "../src/sim/home";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Cat, GameState, GameThing, Vec } from "../src/sim/types";
import { targetPoint } from "../src/view/anim/targets";
import { BIG_BOX_AT, BIG_BOX_FOOTPRINT, BIG_BOX_FRONT, BIG_BOX_ID, bigBoxAt, bigBoxFootprint, bigBoxFront, bigBoxSeat } from "../src/view/iso/bigboxlook";
import { catSpot, hidePeek, perchPlace, type CatSpot } from "../src/view/iso/catspot";
import { IsoDepth } from "../src/view/iso/depth";
import { placeChanged } from "../src/view/iso/geometry";
import { personSpot, shotFace } from "../src/view/iso/personspot";
import { isoObjectLook, placedObjectLook, thingPoint } from "../src/view/world/objects";

/** Сховища й ящики — речі квартири (`OBJECTS`), що їх ставить гра. */
const OBJECT_THINGS = ["cat-cabinet", "litter-bag", "sterile-bin", "cat-kit", "boxes"] as const;

/** Куди зсунуто кожну річ у тестах: вільні клітинки поруч зі своїм місцем. */
const MOVED: Record<GameThing, Vec> = {
  "cat-cabinet": { x: 17, y: 3 },
  "litter-bag": { x: 5, y: 7 },
  "sterile-bin": { x: 18, y: 7 },
  "cat-kit": { x: 14, y: 6 },
  boxes: { x: 13, y: 8 },
  carrier: { x: 7, y: 9 },
  "big-box": { x: 11, y: 7 },
};

/** Квартира, де всі речі гри є: сховища з запасами, ящики з покупками, переноска й велика коробка. */
function home(): GameState {
  const state = newGame({ address: "she", difficulty: "normal", seed: 3 }).current;
  state.modifiers.day = "big-box";
  state.modifiers.week = null;
  state.home.acquired.push("catFood", "litter", "sterileFood", "pills");
  state.home.boxes = { catFood: { cheap: 2, premium: 0 } };
  state.home.carriers.push({ quality: "cheap", wear: 0 });
  return state;
}

/** Зсунути речі гри на `MOVED`. */
function displace(state: GameState, ...things: GameThing[]): void {
  state.home.displaced = { ...state.home.displaced };
  for (const thing of things) state.home.displaced[thing] = { ...MOVED[thing] };
}

const shiftOf = (thing: GameThing): Vec => ({ x: MOVED[thing].x - thingHome(thing).x, y: MOVED[thing].y - thingHome(thing).y });
const plus = (p: Vec, d: Vec): Vec => ({ x: p.x + d.x, y: p.y + d.y });

function catAt(state: GameState, at: Vec, act: Cat["act"]): Cat {
  const cat = createCat(state, createRng(5 + state.cats.length), { source: "shelter", ageWeeks: 30, at });
  cat.arrivedDay = -10;
  cat.traits = [];
  cat.act = act;
  addCat(state, cat);
  return cat;
}

const sleepOn = (target: string | null): Cat["act"] => ({ kind: "sleep", target, goal: null, minutes: 240, elapsed: 0 });

describe("вигляд речі там, де вона стоїть (`placedObjectLook`)", () => {
  it("на своєму місці — той самий вигляд, що `isoObjectLook`; меблі не зсуваються ніколи", () => {
    const state = home();
    for (const o of OBJECTS) expect(placedObjectLook(state, o.id), o.id).toBe(isoObjectLook(o.id));
    displace(state, ...GAME_THINGS);
    for (const o of OBJECTS.filter((o) => !(OBJECT_THINGS as readonly string[]).includes(o.id))) expect(placedObjectLook(state, o.id), o.id).toBe(isoObjectLook(o.id));
  });

  it("зсунуте сховище чи ящики несуть із собою слід і місце персонажа; висоти й бабл — ті самі", () => {
    const state = home();
    displace(state, ...OBJECT_THINGS);
    for (const id of OBJECT_THINGS) {
      const own = isoObjectLook(id);
      const look = placedObjectLook(state, id);
      const d = shiftOf(id);
      expect(look.footprint, id).toEqual({ x0: own.footprint.x0 + d.x, y0: own.footprint.y0 + d.y, x1: own.footprint.x1 + d.x, y1: own.footprint.y1 + d.y });
      expect(look.use?.at, id).toEqual(own.use && plus(own.use.at, d));
      expect(look.use?.pose, id).toBe(own.use?.pose);
      expect(look.use?.facing, id).toEqual(own.use?.facing);
      expect({ top: look.top, tall: look.tall, perch: look.perch, perchFull: look.perchFull, bubble: look.bubble }, id).toEqual({
        top: own.top,
        tall: own.tall,
        perch: own.perch,
        perchFull: own.perchFull,
        bubble: own.bubble,
      });
    }
  });

  it("щокадру — той самий об'єкт, доки річ стоїть там само; переставили — новий; повернули — свій", () => {
    const state = home();
    displace(state, "cat-cabinet");
    const look = placedObjectLook(state, "cat-cabinet");
    expect(placedObjectLook(state, "cat-cabinet")).toBe(look);
    // Нова клітинка в стані (збереження, сценарій), але та сама — вигляд той самий.
    state.home.displaced = { "cat-cabinet": { ...MOVED["cat-cabinet"] } };
    expect(placedObjectLook(state, "cat-cabinet")).toBe(look);
    state.home.displaced = { "cat-cabinet": { x: 16, y: 2 } };
    const other = placedObjectLook(state, "cat-cabinet");
    expect(other).not.toBe(look);
    expect(other.footprint.x0).toBe(16);
    state.home.displaced = {};
    expect(placedObjectLook(state, "cat-cabinet")).toBe(isoObjectLook("cat-cabinet"));
  });

  it("точка, прив'язана до речі гри (`thingPoint`): зі зсувом, як `withThing`; без зсуву — сама точка; щокадру — той самий об'єкт", () => {
    const state = home();
    expect(thingPoint(state, "carrier", CARRIER_SPOT)).toBe(CARRIER_SPOT);
    displace(state, "carrier");
    const at = thingPoint(state, "carrier", CARRIER_SPOT);
    expect(at).toEqual(withThing(state, "carrier", CARRIER_SPOT));
    expect(at).toEqual(plus(CARRIER_SPOT, shiftOf("carrier")));
    expect(thingPoint(state, "carrier", CARRIER_SPOT)).toBe(at);
    state.home.displaced = { carrier: { ...MOVED.carrier } };
    expect(thingPoint(state, "carrier", CARRIER_SPOT)).toBe(at);
    // Інша річ того самого зсуву не має.
    expect(thingPoint(state, "big-box", BIG_BOX_AT)).toBe(BIG_BOX_AT);
  });
});

describe("квартира бачить, що річ переставили (`placeChanged`)", () => {
  it("змінилося лише тоді, коли клітинка речі інша, ніж минулого разу; без нових об'єктів", () => {
    const state = home();
    const seen = { x: Number.NaN, y: Number.NaN };
    expect(placeChanged(state, "boxes", seen)).toBe(false);
    displace(state, "boxes");
    expect(placeChanged(state, "boxes", seen)).toBe(true);
    expect(placeChanged(state, "boxes", seen)).toBe(false);
    state.home.displaced = { boxes: { ...MOVED.boxes } };
    expect(placeChanged(state, "boxes", seen)).toBe(false);
    state.home.displaced = { boxes: { x: 14, y: 8 } };
    expect(placeChanged(state, "boxes", seen)).toBe(true);
    // Повернули на своє місце (уночі) — теж зміна, і далі тихо.
    delete state.home.displaced.boxes;
    expect(placeChanged(state, "boxes", seen)).toBe(true);
    expect(placeChanged(state, "boxes", seen)).toBe(false);
  });

  it("коробку реєстру глибини переставляють разом із річчю: порядок — за новим слідом", () => {
    const registry = new IsoDepth();
    let boxDepth = Number.NaN;
    let pointDepth = Number.NaN;
    const box = registry.addBox({ x0: 13, y0: 6, x1: 14, y1: 7, id: "cat-kit" }, (d) => (boxDepth = d));
    registry.addPoint((d) => (pointDepth = d)).place(14.5, 7.5);
    registry.solve();
    expect(pointDepth).toBeGreaterThan(boxDepth);
    // Річ стала перед персонажем — він тепер за нею.
    box.move({ x0: 15, y0: 8, x1: 16, y1: 9 });
    registry.solve();
    expect(pointDepth).toBeLessThan(boxDepth);
  });
});

describe("велика коробка, переноска й коти на зсунутих речах", () => {
  it("велика коробка: кадр, слід, передні стінки й кіт у ній — зі зсувом; без зсуву — свої сталі", () => {
    const state = home();
    expect(bigBoxAt(state)).toBe(BIG_BOX_AT);
    expect(bigBoxFootprint(state)).toBe(BIG_BOX_FOOTPRINT);
    expect(bigBoxFront(state)).toBe(BIG_BOX_FRONT);
    displace(state, "big-box");
    const d = shiftOf("big-box");
    expect(bigBoxAt(state)).toEqual(plus(BIG_BOX_AT, d));
    expect(bigBoxFootprint(state)).toEqual({ x0: BIG_BOX.x + d.x, y0: BIG_BOX.y + d.y, x1: BIG_BOX.x + d.x + 1, y1: BIG_BOX.y + d.y + 1 });
    expect(bigBoxFront(state)).toMatchObject(plus(BIG_BOX_FRONT, d));
    expect(bigBoxAt(state)).toBe(bigBoxAt(state));
    expect(bigBoxFootprint(state)).toBe(bigBoxFootprint(state));
    const cat = catAt(state, bigBoxAt(state), sleepOn(BIG_BOX_TARGET));
    expect(bigBoxSeat(state, cat)).toEqual(bigBoxAt(state));
    // Юрба в коробці — у межах сліду там, де вона стоїть.
    const spot = { kind: "furniture", at: bigBoxAt(state), box: BIG_BOX_ID } as CatSpot;
    expect(perchPlace(spot, state)?.area).toMatchObject(bigBoxFootprint(state));
  });

  it("кіт спить у зсунутій переносці — там, де вона стоїть", () => {
    const state = home();
    displace(state, "carrier");
    const at = withThing(state, "carrier", CARRIER_SPOT);
    const cat = catAt(state, { x: at.x, y: at.y - 0.4 }, sleepOn("carrier"));
    const spot = catSpot(state, cat, "sleep", null, { grate: 0 });
    expect(spot.kind).toBe("carrier");
    expect(spot.at).toEqual(at);
  });

  it("кіт на зсунутому сховищі — на ньому, а юрба — у межах його сліду там, де воно стоїть; під ним — визирає з-під його краю", () => {
    const state = home();
    displace(state, "cat-kit");
    const f = placedObjectLook(state, "cat-kit").footprint;
    const cat = catAt(state, { x: f.x0 + 0.5, y: f.y0 + 0.5 }, sleepOn(null));
    const spot = catSpot(state, cat, "sleep", null, { grate: 0 });
    expect(spot).toMatchObject({ kind: "furniture", box: "cat-kit" });
    expect(perchPlace(spot, state)?.area).toMatchObject(f);
    const peek = hidePeek(state, "cat-kit", cat);
    expect(peek.at.x === f.x1 || peek.at.y === f.y1).toBe(true);
    expect(peek.at.x >= f.x0 && peek.at.x <= f.x1 && peek.at.y >= f.y0 && peek.at.y <= f.y1).toBe(true);
  });

  it("куди дивиться кіт: шафка з кормом, ящики, аптечка й велика коробка — там, де стоять", () => {
    const state = home();
    displace(state, ...GAME_THINGS);
    expect(targetPoint(state, "cabinet")).toEqual(centerOf(placedObject(state, "cat-cabinet")));
    expect(targetPoint(state, "boxes")).toEqual(centerOf(placedObject(state, "boxes")));
    expect(targetPoint(state, "cat-kit")).toEqual(centerOf(placedObject(state, "cat-kit")));
    expect(targetPoint(state, BIG_BOX_TARGET)).toEqual({ x: MOVED["big-box"].x + 0.5, y: MOVED["big-box"].y + 0.5 });
  });
});

describe("персонаж біля зсунутої речі", () => {
  it("користуючись сховищем, стоїть перед ним там, де воно стоїть", () => {
    const state = home();
    displace(state, ...OBJECT_THINGS);
    for (const id of ["cat-cabinet", "sterile-bin", "litter-bag"] as const) {
      state.character.activity = { kind: "use", target: id, progress: 0 };
      const use = isoObjectLook(id).use!;
      expect(personSpot(state, "idle"), id).toMatchObject({ at: plus(use.at, shiftOf(id)), face: use.facing, pose: use.pose });
    }
  });

  it("розпаковує зсунуті ящики — лицем до них, а не туди, де вони стояли", () => {
    const state = home();
    state.home.displaced = { boxes: { x: 3, y: 2 } };
    const home0 = thingHome("boxes");
    const use = isoObjectLook("boxes").use!;
    const at = plus(use.at, { x: 3 - home0.x, y: 2 - home0.y });
    state.character.body = { ...state.character.body, x: at.x, y: at.y };
    expect(shotFace(state, { object: "boxes" })).toEqual(use.facing);
  });
});

describe("звуки зсунутих речей (§11.4а)", () => {
  /** Де звучить перший звук набору. */
  const placeOf = (state: GameState, cues: readonly Cue[]): Vec | null => soundPoint(state, cues[0]?.at);

  it("сховища й ящики звучать звідти, де стоять", () => {
    const state = home();
    displace(state, ...OBJECT_THINGS);
    for (const id of OBJECT_THINGS) {
      const o = placedObject(state, id);
      expect(soundPoint(state, id), id).toEqual({ x: o.x + o.w / 2, y: o.y + o.h / 2 });
    }
    // Так само — і через подію: шафку лапає кіт, ящики розпакували, запас ліг у сховище.
    expect(placeOf(state, catEvent({ type: "cabinet-pawed", cat: 1, opened: true }, state))).toEqual(centerOf(placedObject(state, "cat-cabinet")));
    expect(placeOf(state, homeCues({ type: "unpacked", moved: [] }, state))).toEqual(centerOf(placedObject(state, "boxes")));
    expect(placeOf(state, homeCues({ type: "supply-landed", product: "sterileFood" }, state))).toEqual(centerOf(placedObject(state, "sterile-bin")));
  });

  it("переноска: відчинили, кіт кричить, зламалася — звідти, де вона стоїть", () => {
    const state = home();
    displace(state, "carrier");
    const at = withThing(state, "carrier", CARRIER_SPOT);
    expect(placeOf(state, homeCues({ type: "carrier-opened", cats: 1 }, state))).toEqual(at);
    expect(placeOf(state, catEvent({ type: "carrier-cry", cat: 1 }, state))).toEqual(at);
    expect(soundPoint(state, brokeAt(state, "carrier"))).toEqual(at);
    // Без зсуву — біля дверей, як завжди.
    const still = home();
    expect(placeOf(still, homeCues({ type: "carrier-opened", cats: 1 }, still))).toEqual(CARRIER_SPOT);
  });
});

describe("сценарій `scenarios/displaced-things.json`", () => {
  it("усі речі гри є й стоять не на своїх місцях, на вільних клітинках, які видно; свої місця зайняті речами гравця", () => {
    const scenario = FILE_SCENARIOS["displaced-things"];
    expect(scenario).toBeDefined();
    const state = applyScenario(scenario!).current;
    const player = (t: Vec): boolean =>
      state.home.items.some((i) => {
        const tile = itemTile(i);
        return tile.x === t.x && tile.y === t.y;
      }) ||
      (state.home.vacuumAt !== null && state.home.vacuumAt !== undefined && Math.floor(state.home.vacuumAt.x) === t.x && Math.floor(state.home.vacuumAt.y) === t.y);
    const taken = new Set<string>();
    for (const thing of GAME_THINGS) {
      expect(thingPresent(state, thing), thing).toBe(true);
      const at = state.home.displaced?.[thing];
      expect(at, thing).toBeDefined();
      const home = thingHome(thing);
      expect(at, thing).not.toEqual(home);
      expect(PLACES.some((p) => p.x === at!.x && p.y === at!.y), `${thing}: ${at!.x},${at!.y}`).toBe(true);
      expect(hiddenTile(at!.x, at!.y), thing).toBe(false);
      expect(player(at!), thing).toBe(false);
      expect(taken.has(`${at!.x},${at!.y}`), thing).toBe(false);
      taken.add(`${at!.x},${at!.y}`);
      expect(player(home), `${thing}: своє місце зайняте`).toBe(true);
    }
    // На своїх місцях сховищ — миски гравця.
    for (const id of ["cat-cabinet", "litter-bag", "sterile-bin", "cat-kit"] as const) {
      const o = objectById(id);
      expect(state.home.items.some((i) => i.kind === "bowl" && itemTile(i).x === o.x && itemTile(i).y === o.y), id).toBe(true);
    }
  });
});
