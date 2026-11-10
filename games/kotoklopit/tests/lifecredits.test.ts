// Титри життя (§4.2): порядок блоків стрічки й її рух.

import { describe, expect, it } from "vitest";

import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { lifeStory } from "../src/sim/story";
import { weekOf } from "../src/sim/time";
import { endingText } from "../src/texts";
import { creditsPlan } from "../src/ui/creditsplan";
import { polaroidTilt, ROLL, rollEnd, rollOffset } from "../src/ui/rollmath";
import { storyPhoto } from "../src/view/photo";
import { CAREER_ICONS, storyIcon } from "../src/view/symbols";
import type { StoryItem } from "../src/sim/story";

function finale(id: string) {
  const scenario = FILE_SCENARIOS[id];
  if (!scenario) throw new Error(`немає сценарію ${id}`);
  return applyScenario(scenario).current;
}

describe("титри життя: порядок (§4.2)", () => {
  it("титул з ім'ям і тижнями → шлях за тижнями → підсумок → живі коти", () => {
    const state = finale("finale-perfect-balance");
    const plan = creditsPlan(state);
    const summary = plan.findIndex((b) => b.kind === "summary");
    expect(plan[0]).toMatchObject({ kind: "title", name: "Соломія", weeks: "20 тижнів" });
    // Шлях — кожна подія стрічки по черзі (з фото — полароїд, без — рядок), а перед першою подією тижня — його заголовок.
    const expected: string[] = [];
    let week = 0;
    for (const item of lifeStory(state)) {
      if (weekOf(item.day) !== week) {
        week = weekOf(item.day);
        expected.push(`Тиждень ${week}`);
      }
      expected.push(storyPhoto(item, state) ? "polaroid" : "line");
    }
    expect(plan.slice(1, summary).map((b) => (b.kind === "week" ? b.label : b.kind))).toEqual(expected);
    expect(plan[summary]).toMatchObject(endingText(state, "retirement"));
    // Живі коти — після підсумку, кожен своїм полароїдом, у порядку котів дому.
    const living = plan.slice(summary + 1);
    expect(living.map((b) => b.kind)).toEqual(state.cats.map(() => "living"));
    expect(living.map((b) => (b.kind === "living" ? b.caption.title : ""))).toEqual(state.cats.map((c) => c.name));
  });

  it("без котів удома після підсумку нічого: стрічка закінчується підсумком", () => {
    const plan = creditsPlan(finale("finale-quiet-life"));
    expect(plan.at(-1)?.kind).toBe("summary");
  });
});

describe("титри життя: іконки на лінії часу (§4.2, §11.4)", () => {
  const career = (change: string, milestone = false): StoryItem => ({ kind: "career", day: 3, change, position: 2, milestone }) as unknown as StoryItem;

  it("рядок кар'єри — з іконкою: підвищення — зірка, пониження — своя", () => {
    expect(storyIcon(career("promoted"))).toBe(CAREER_ICONS.promoted);
    expect(storyIcon(career("demoted"))).toBe(CAREER_ICONS.demoted);
    expect(CAREER_ICONS.promoted).toBe("promotion");
    expect(CAREER_ICONS.promoted).not.toBe(CAREER_ICONS.demoted);
  });

  it("полароїди й решта подій — без іконки на лінії", () => {
    expect(storyIcon(career("fired", true))).toBeNull();
    expect(storyIcon({ kind: "start", day: 0 } as unknown as StoryItem)).toBeNull();
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
