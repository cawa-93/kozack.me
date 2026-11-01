// Ефекти над світом нового вигляду (крок 16, хвиля 3, «Стики будинку»): чисті функції `src/view/iso/fxlook.ts` — коли
// пара, дим, іскри, хропіння, задишка й чхання, якими кадрами, і що кожен кадр є в маніфесті.

import { describe, expect, it } from "vitest";

import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import type { Cat, GameState } from "../src/sim/types";
import { CAT_ONE_SHOT_MS } from "../src/view/anim/ids";
import { artEntry } from "../src/view/art/manifest";
import type { ArtId } from "../src/view/art/types";
import { CAT_PIECE } from "../src/view/iso/catspot";
import { ISO_DEPTH_SLOT } from "../src/view/iso/depth";
import {
  catFxShots,
  FX_DEPTH,
  PANT,
  pantState,
  PUFF_MS,
  puffState,
  SNEEZE,
  sneezeLook,
  SNORE,
  snorePhase,
  snores,
  snoreState,
  SPARK,
  sparkState,
  sparking,
  stoveFx,
  washerFx,
} from "../src/view/iso/fxlook";
import { catPose } from "../src/view/pose";

/** Стан сценарію (свіжа копія). */
function scenario(name: string): GameState {
  const file = FILE_SCENARIOS[name];
  if (!file) throw new Error(`Немає сценарію «${name}»`);
  return applyScenario(file).current;
}

/** Перший кіт сценарію з хворобою `id` (чи будь-який — якщо такого немає, додати хворобу). */
function sickCat(state: GameState, id: "breathing" | "heart" | "cold"): Cat {
  const cat = state.cats[0]!;
  cat.diseases = [{ id, day: state.day, doses: 0, diet: 0, calm: 0, controlled: null, known: false }];
  return cat;
}

/** Кіт спить клубком на підлозі. */
function asleepOnFloor(cat: Cat): void {
  cat.away = null;
  cat.act = { kind: "sleep", target: null, goal: null, minutes: 120, elapsed: 0 };
}

/** Кадр є в маніфесті. */
function expectFrame(id: ArtId, state: string | null): void {
  const entry = artEntry(id);
  expect(entry, id).toBeDefined();
  if (state === null) expect(entry?.states, id).toBeUndefined();
  else expect(entry?.states ?? [], `${id}#${state}`).toContain(state);
}

describe("пара й дим над речами (§8.7)", () => {
  it("плита: сире щойно поклали — нічого; вариться й готове — пара; пригоріло — дим; порожня — нічого", () => {
    const state = scenario("appliances");
    state.home.stove = { item: null, minutes: 0 };
    expect(stoveFx(state)).toBeNull();
    state.home.stove = { item: { kind: "raw", quality: "cheap" }, minutes: 0 };
    expect(stoveFx(state)).toBeNull();
    state.home.stove = { item: { kind: "raw", quality: "cheap" }, minutes: 3 };
    expect(stoveFx(state)).toBe("steam");
    state.home.stove = { item: { kind: "meal", quality: "cheap" }, minutes: 40 };
    expect(stoveFx(state)).toBe("steam");
    state.home.stove = { item: { kind: "burnt", quality: "cheap" }, minutes: 90 };
    expect(stoveFx(state)).toBe("smoke");
  });

  it("пральна машина: пара лише поки пере", () => {
    const state = scenario("appliances");
    for (const washer of ["idle", "done"] as const) {
      state.home.washer.state = washer;
      expect(washerFx(state)).toBeNull();
    }
    state.home.washer.state = "washing";
    expect(washerFx(state)).toBe("steam");
  });

  it("кадри пари й диму чергуються a/b і є в маніфесті", () => {
    for (const kind of ["steam", "smoke"] as const) {
      expect(puffState(kind, 0)).toBe("a");
      expect(puffState(kind, PUFF_MS[kind])).toBe("b");
      expect(puffState(kind, PUFF_MS[kind] * 2)).toBe("a");
      expectFrame(`fx/${kind}`, "a");
      expectFrame(`fx/${kind}`, "b");
    }
  });
});

describe("іскри з перегризеного дроту (§9.12, «Гризіння»)", () => {
  it("лише поки дріт перегризено", () => {
    const state = scenario("appliances");
    delete state.home.wireChewed;
    expect(sparking(state)).toBe(false);
    state.home.wireChewed = true;
    expect(sparking(state)).toBe(true);
  });

  it("спалахи на початку циклу, далі пауза; одразу після події — суцільний сніп", () => {
    const never = Number.POSITIVE_INFINITY;
    expect(sparkState(0, never)).toBe("a");
    expect(sparkState(SPARK.flashMs, never)).toBe("b");
    expect(sparkState(SPARK.flashMs * 2.5, never)).toBeNull();
    expect(sparkState(SPARK.cycleMs - 1, never)).toBeNull();
    // Більшу частину циклу іскор немає — іскрить, а не горить.
    let shown = 0;
    for (let t = 0; t < SPARK.cycleMs; t += 10) if (sparkState(t, never) !== null) shown++;
    expect(shown / (SPARK.cycleMs / 10)).toBeLessThan(0.2);
    for (let t = 0; t < SPARK.burstMs; t += 20) expect(sparkState(SPARK.flashMs * 2.5, t)).not.toBeNull();
    expectFrame("fx/spark", "a");
    expectFrame("fx/spark", "b");
  });

  it("точка розриву дроту є в маніфесті й лежить між кінцями, нижче за обидві вилки", () => {
    const wire = artEntry("env/wire");
    const cut = wire?.points?.cut;
    expect(cut).toBeDefined();
    expect(cut!.y).toBeGreaterThan(wire!.points!.desk!.y);
    expect(cut!.y).toBeGreaterThan(wire!.points!.socket!.y);
    expect(cut!.x).toBeGreaterThan(wire!.points!.desk!.x);
    expect(cut!.x).toBeLessThan(wire!.points!.socket!.x);
  });
});

describe("хропіння (§9.5, проблеми з диханням)", () => {
  it("хропе той, хто спить з проблемами з диханням і грає анімацію хропіння; здоровий і той, хто не спить, — ні", () => {
    const state = scenario("sick-cats");
    const cat = sickCat(state, "breathing");
    asleepOnFloor(cat);
    expect(catPose(state, cat)).toBe("snore");
    expect(snores(state, cat)).toBe(true);
    cat.act = { kind: "idle", target: null, goal: null, minutes: 30, elapsed: 0 };
    expect(snores(state, cat)).toBe(false);
    asleepOnFloor(cat);
    cat.diseases = [];
    expect(snores(state, cat)).toBe(false);
  });

  it("під ковдрою, у переносці й на сходах бульбашки немає", () => {
    const state = scenario("sick-cats");
    const cat = sickCat(state, "breathing");
    asleepOnFloor(cat);
    cat.act.blanket = true;
    expect(snores(state, cat)).toBe(false);
    asleepOnFloor(cat);
    cat.act.target = "carrier";
    expect(snores(state, cat)).toBe(false);
    asleepOnFloor(cat);
    cat.away = "stairs";
    expect(snores(state, cat)).toBe(false);
  });

  it("подих: вдих — in, видих — out, між подихами — нічого; коти хроплять не хором", () => {
    expect(snoreState(0, 0)).toBe("in");
    expect(snoreState(SNORE.inMs, 0)).toBe("out");
    expect(snoreState(SNORE.outMs, 0)).toBeNull();
    expect(snoreState(SNORE.breathMs, 0)).toBe("in");
    expect(snoreState(-1, 0)).toBeNull();
    expect(new Set([1, 2, 3, 4].map(snorePhase)).size).toBe(4);
    expectFrame("fx/snore", "in");
    expectFrame("fx/snore", "out");
  });
});

describe("разові ефекти котів (§9.5): задишка після гри й чхання", () => {
  it("задишка — лише в того, хто швидко втомлюється (дихання, серце), поки кіт дихає з відкритим ротом", () => {
    const state = scenario("sick-cats");
    const cat = sickCat(state, "heart");
    const shots = catFxShots({ type: "played", cat: cat.id, minutes: 10 }, state);
    expect(shots).toEqual([{ cat: cat.id, kind: "pant", delay: PANT.delay, ms: CAT_ONE_SHOT_MS.pant - PANT.delay - PANT.tail }]);
    cat.diseases = [];
    expect(catFxShots({ type: "played", cat: cat.id, minutes: 10 }, state)).toEqual([]);
    expect(pantState(0)).toBe("a");
    expect(pantState(PANT.frameMs)).toBe("b");
    expectFrame("fx/pant", "a");
    expectFrame("fx/pant", "b");
  });

  it("задишка обох після гри котів між собою — у кожного, хто швидко втомлюється", () => {
    const state = scenario("sick-cats");
    const [a, b] = state.cats;
    a!.diseases = [{ id: "breathing", day: state.day, doses: 0, diet: 0, calm: 0, controlled: null, known: false }];
    b!.diseases = [];
    const shots = catFxShots({ type: "cats-played", cats: [a!.id, b!.id] }, state);
    expect(shots.map((s) => s.cat)).toEqual([a!.id]);
  });

  it("чхання — хмаринка в мить «чхи!» анімації, коротко; інші симптоми — без ефекту", () => {
    const state = scenario("sick-cats");
    const cat = sickCat(state, "cold");
    const [shot] = catFxShots({ type: "symptom", cat: cat.id, symptom: "sneeze" }, state);
    expect(shot).toEqual({ cat: cat.id, kind: "sneeze", delay: SNEEZE.delay, ms: SNEEZE.ms });
    // «Чхи!» — кивок анімації на 300–365 мс з 800: хмаринка — з кивком і зникає до кінця анімації.
    expect(SNEEZE.delay).toBeGreaterThanOrEqual(300);
    expect(SNEEZE.delay).toBeLessThanOrEqual(365);
    expect(SNEEZE.delay + SNEEZE.ms).toBeLessThanOrEqual(CAT_ONE_SHOT_MS.sneeze);
    expect(catFxShots({ type: "symptom", cat: cat.id, symptom: "itch" }, state)).toEqual([]);
    expect(catFxShots({ type: "meow", cat: cat.id }, state)).toEqual([]);
    expectFrame("fx/sneeze", null);
  });

  it("хмаринка чхання росте й наприкінці згасає", () => {
    expect(sneezeLook(0)).toEqual({ scale: 0.7, alpha: 1 });
    expect(sneezeLook(0.5).scale).toBeGreaterThan(sneezeLook(0.2).scale);
    expect(sneezeLook(0.5).alpha).toBe(1);
    expect(sneezeLook(0.8).alpha).toBeCloseTo(0.5);
    expect(sneezeLook(1)).toEqual({ scale: 1.15, alpha: 0 });
  });
});

describe("глибина ефектів (`iso/depth.ts`)", () => {
  it("у проміжку власника: ефект кота над усіма його шматками, від камери — під ними; пара — нижче за пів проміжку", () => {
    const top = Math.max(...Object.values(CAT_PIECE));
    expect(FX_DEPTH.catFront).toBeGreaterThan(top);
    expect(FX_DEPTH.catFront).toBeLessThan(ISO_DEPTH_SLOT / 2);
    expect(FX_DEPTH.catBack).toBeLessThan(Math.min(...Object.values(CAT_PIECE)));
    expect(FX_DEPTH.catBack).toBeGreaterThan(0);
    expect(FX_DEPTH.thing).toBeLessThan(ISO_DEPTH_SLOT / 2);
  });
});
