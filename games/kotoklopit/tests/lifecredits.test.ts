// Титри життя (§4.2): порядок блоків стрічки й її рух.

import { describe, expect, it } from "vitest";

import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { lifeStory } from "../src/sim/story";
import { weekOf } from "../src/sim/time";
import { endingText } from "../src/texts";
import { creditsPlan } from "../src/ui/creditsplan";
import { beatPx, CREDITS_INTRO, CREDITS_MUSIC, creditsMusicGain, polaroidTilt, ROLL, rollEnd, rollOffset, rollSpeed, slotHeight } from "../src/ui/rollmath";
import { storyPhoto } from "../src/view/photo";
import { CAREER_ICONS, storyIcon } from "../src/view/symbols";
import type { StoryItem } from "../src/sim/story";

function finale(id: string) {
  const scenario = FILE_SCENARIOS[id];
  if (!scenario) throw new Error(`немає сценарію ${id}`);
  return applyScenario(scenario).current;
}

describe("титри життя: порядок (§4.2)", () => {
  it("титул (ім'я, тижні, назва фіналу) → шлях за тижнями → «Вихід на пенсію» останньою подією → живі коти", () => {
    const state = finale("finale-perfect-balance");
    const plan = creditsPlan(state);
    const ending = endingText(state, "retirement");
    const retirement = plan.findIndex((b) => b.kind === "retirement");
    expect(plan[0]).toEqual({ kind: "title", name: "Соломія", weeks: "20 тижнів", finale: ending.title });
    // Шлях — кожна подія стрічки по черзі (з фото — полароїд, без — рядок), а перед першою подією тижня — його заголовок;
    // пенсія — подія останнього тижня.
    const expected: string[] = [];
    let week = 0;
    const weekOfItem = (day: number): void => {
      if (weekOf(day) === week) return;
      week = weekOf(day);
      expected.push(`Тиждень ${week}`);
    };
    for (const item of lifeStory(state)) {
      weekOfItem(item.day);
      expected.push(storyPhoto(item, state) ? "polaroid" : "line");
    }
    weekOfItem(state.day);
    expected.push("retirement");
    expect(plan.slice(1, retirement + 1).map((b) => (b.kind === "week" ? b.label : b.kind))).toEqual(expected);
    // Пенсія — ключова подія: підпис «Вихід на пенсію», під фото — текст фіналу; на фото — персонаж.
    const key = plan[retirement];
    expect(key?.kind === "retirement" && key.caption).toEqual({ title: "Вихід на пенсію", text: ending.text });
    expect(key?.kind === "retirement" && key.photo.subjects.some((s) => s.kind === "person")).toBe(true);
    expect(plan.some((b) => (b.kind as string) === "summary")).toBe(false);
    // Живі коти — після пенсії, кожен своїм полароїдом, у порядку котів дому.
    const living = plan.slice(retirement + 1);
    expect(living.map((b) => b.kind)).toEqual(state.cats.map(() => "living"));
    expect(living.map((b) => (b.kind === "living" ? b.caption.title : ""))).toEqual(state.cats.map((c) => c.name));
  });

  it("без котів удома стрічка закінчується виходом на пенсію", () => {
    const plan = creditsPlan(finale("finale-quiet-life"));
    expect(plan.at(-1)?.kind).toBe("retirement");
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

describe("титри життя: титул і музика (§4.2)", () => {
  it("три написи титулу — на три удари звуку кінця гри, усі до його кінця", () => {
    expect(CREDITS_INTRO.beatsMs).toHaveLength(3);
    const [a, b, c] = CREDITS_INTRO.beatsMs;
    expect(a! < b! && b! < c! && c! < CREDITS_INTRO.endMs).toBe(true);
  });

  it("музика мовчить, поки звучить кінець гри, далі швидко наростає й тримає повну гучність", () => {
    expect(CREDITS_MUSIC.delayMs).toBe(CREDITS_INTRO.endMs);
    expect(creditsMusicGain(0)).toBe(0);
    expect(creditsMusicGain(CREDITS_MUSIC.delayMs - 1)).toBe(0);
    expect(creditsMusicGain(CREDITS_MUSIC.delayMs + CREDITS_MUSIC.fadeMs / 2)).toBeCloseTo(0.5);
    expect(creditsMusicGain(CREDITS_MUSIC.delayMs + CREDITS_MUSIC.fadeMs)).toBe(1);
    expect(creditsMusicGain(10 * 60_000)).toBe(1);
  });
});

describe("титри життя: рух стрічки в такт музиці", () => {
  const viewport = 800;
  const end = 50_000;
  const beat = beatPx(viewport);

  /** Стрічка кадрами по 16 мс від `from` мс музики до `to`; `hold` — коли тримають. */
  function run(offset: number, from: number, to: number, hold: (ms: number) => boolean = () => false): number {
    for (let t = from; t < to; t += 16) {
      const dt = Math.min(16, to - t);
      offset = rollOffset(offset, dt, viewport, end, hold(t), t + dt);
    }
    return offset;
  }
  /** Наскільки стрічка зсунута від сітки долей музики, px. */
  const phase = (offset: number, ms: number): number => {
    const e = (((offset - rollSpeed(viewport) * ms) % beat) + beat) % beat;
    return Math.min(e, beat - e);
  };

  it("екран — за `ROLL.barsPerScreen` тактів музики; доля — чверть такту", () => {
    expect(run(0, 0, CREDITS_MUSIC.barMs)).toBeCloseTo(viewport / ROLL.barsPerScreen, 1);
    expect(beat).toBeCloseTo(viewport / ROLL.barsPerScreen / 4);
  });

  it("поки тримають — у `ROLL.fast` разів швидше", () => {
    expect(run(0, 0, 1000, () => true)).toBeCloseTo(rollSpeed(viewport) * ROLL.fast * 1000, 0);
    expect(ROLL.fast).toBeGreaterThan(2);
  });

  it("відпустили — швидко доганяє найближчу долю й далі йде в ритмі", () => {
    const held = run(0, 0, 1300, (t) => t < 300);
    expect(phase(held, 1300)).toBeLessThan(0.6);
    expect(phase(run(held, 1300, 5000), 5000)).toBeLessThan(0.6);
  });

  it("не їде далі за кінець, а довга пауза кадру (вкладка у фоні) не перестрибує стрічку", () => {
    expect(rollOffset(end - 1, 1000, viewport, end, true, 1000)).toBe(end);
    expect(rollOffset(0, 60_000, viewport, end, false, 60_000)).toBeLessThanOrEqual(rollSpeed(viewport) * ROLL.fast * ROLL.maxStepMs + 1e-9);
  });

  it("кожен блок займає ціле число долей — виїжджає знизу на удар, — з проміжком", () => {
    for (const height of [10, 37, beat, 300, 512.4]) {
      const slot = slotHeight(height, viewport);
      expect(slot / beat).toBeCloseTo(Math.round(slot / beat), 6);
      expect(slot).toBeGreaterThanOrEqual(height + beat * ROLL.gapBeats - 1e-9);
      expect(slot).toBeLessThan(height + beat * (ROLL.gapBeats + 1));
    }
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
