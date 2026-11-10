// Титри життя (§4.2): порядок блоків стрічки й її рух.

import { describe, expect, it } from "vitest";

import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { lifeStory } from "../src/sim/story";
import { endingText } from "../src/texts";
import { creditsPlan } from "../src/ui/creditsplan";
import { polaroidTilt, ROLL, rollEnd, rollOffset } from "../src/ui/rollmath";
import { storyPhoto } from "../src/view/photo";

function finale(id: string) {
  const scenario = FILE_SCENARIOS[id];
  if (!scenario) throw new Error(`немає сценарію ${id}`);
  return applyScenario(scenario).current;
}

describe("титри життя: порядок (§4.2)", () => {
  it("титул з ім'ям і тижнями → шлях → підсумок → живі коти", () => {
    const state = finale("finale-perfect-balance");
    const plan = creditsPlan(state);
    const kinds = plan.map((b) => b.kind);
    const story = lifeStory(state);
    expect(kinds[0]).toBe("title");
    expect(plan[0]).toMatchObject({ kind: "title", name: "Соломія", weeks: "20 тижнів" });
    // Шлях — кожна подія стрічки по черзі: з фото — полароїд, без — рядок.
    const path = plan.slice(1, 1 + story.length);
    expect(path.map((b) => b.kind)).toEqual(story.map((item) => (storyPhoto(item, state) ? "polaroid" : "line")));
    expect(kinds[1 + story.length]).toBe("summary");
    expect(plan[1 + story.length]).toMatchObject(endingText(state, "retirement"));
    // Живі коти — після підсумку, кожен своїм полароїдом, у порядку котів дому.
    const living = plan.slice(2 + story.length);
    expect(living.map((b) => b.kind)).toEqual(state.cats.map(() => "living"));
    expect(living.map((b) => (b.kind === "living" ? b.caption.title : ""))).toEqual(state.cats.map((c) => c.name));
  });

  it("без котів удома після підсумку нічого: стрічка закінчується підсумком", () => {
    const plan = creditsPlan(finale("finale-quiet-life"));
    expect(plan.at(-1)?.kind).toBe("summary");
  });
});

describe("титри життя: рух стрічки", () => {
  const viewport = 800;
  const end = 5000;

  /** Секунда кадрами по 16 мс (останній — 8 мс). */
  const second = (from: number, holding: boolean): number => {
    let offset = from;
    for (let t = 0; t < 1000; t += 16) offset = rollOffset(offset, Math.min(16, 1000 - t), viewport, end, holding);
    return offset;
  };

  it("їде вгору рівно: частка висоти екрана за секунду", () => {
    expect(second(0, false)).toBeCloseTo(ROLL.speed * viewport);
    expect(second(100, false)).toBeCloseTo(100 + ROLL.speed * viewport);
  });

  it("поки тримають — у `ROLL.fast` разів швидше", () => {
    expect(second(0, true)).toBeCloseTo(ROLL.speed * ROLL.fast * viewport);
    expect(ROLL.fast).toBeGreaterThan(2);
  });

  it("не їде далі за кінець", () => {
    expect(rollOffset(end - 1, 1000, viewport, end, true)).toBe(end);
  });

  it("довга пауза кадру (вкладка у фоні) не перестрибує стрічку", () => {
    expect(rollOffset(0, 60_000, viewport, end, false)).toBeLessThanOrEqual(ROLL.speed * viewport * (ROLL.maxStepMs / 1000) + 1e-9);
  });

  it("кінець — коли низ стрічки дійшов до низу екрана; коротка стрічка не їде", () => {
    expect(rollEnd(3000, viewport)).toBe(2200);
    expect(rollEnd(500, viewport)).toBe(0);
  });

  it("полароїди нахилені по черзі в різні боки, трохи", () => {
    const tilts = [0, 1, 2, 3].map(polaroidTilt);
    for (const [i, tilt] of tilts.entries()) {
      expect(Math.abs(tilt.rot)).toBeGreaterThan(0);
      expect(Math.abs(tilt.rot)).toBeLessThanOrEqual(4);
      if (i > 0) expect(Math.sign(tilt.rot)).not.toBe(Math.sign(tilts[i - 1]!.rot));
    }
  });
});
