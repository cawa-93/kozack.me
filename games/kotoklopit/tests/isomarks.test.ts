// Позначки ізометричного світу (крок 16, T4): чисті розрахунки без Phaser (`src/view/iso/markslayout.ts`) — що на екрані
// комп'ютера, де екран на моніторі, де смуги й смужка пошуку роботи, пульс підсвітки, дуга польоту запасів.

import { describe, expect, it } from "vitest";

import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { useProgress } from "../src/sim/actions";
import { BURN_MINUTES, COOK_MINUTES, JOB_SEARCH, MODIFIERS, STANDUP_MINUTE } from "../src/sim/config";
import { objectById } from "../src/sim/home";
import { targetOf } from "../src/sim/targets";
import type { GameState } from "../src/sim/types";
import { searchProgress } from "../src/sim/work";
import { inMeeting } from "../src/view/anim/personanim";
import { artEntry } from "../src/view/art/manifest";
import { ANCHOR_GAP, artOffset, objectAnchorAt, objectScreen } from "../src/view/iso/geometry";
import {
  actionBar,
  actionBarAnchor,
  BUBBLE_HALF,
  EVENT_RISE,
  stackTop,
  SURFACE_CLEAR,
  BAR,
  BAR_RISE,
  barBox,
  barExtent,
  BUBBLE_ROOM,
  computerScreen,
  computerStack,
  FLIGHT,
  GLASS_INSET,
  flightArc,
  flightPoint,
  flightScale,
  flightTilt,
  highlightPulse,
  highlightTarget,
  onFace,
  onScreen,
  REJECTION_MS,
  rejectionAt,
  SCREEN_HALF,
  screenShow,
  screenTime,
  SEARCH_BAR,
  searchBar,
  STACK_GAP,
  stageMark,
  STOVE_BAR,
  stoveBar,
  stoveFaceBar,
} from "../src/view/iso/markslayout";
import { isoObjectLook } from "../src/view/world/objects";
import { ISO } from "../src/view/world/projection";

/** Стан сценарію (свіжа копія). */
function scenario(name: string): GameState {
  const file = FILE_SCENARIOS[name];
  if (!file) throw new Error(`Немає сценарію «${name}»`);
  return applyScenario(file).current;
}

/** Персонаж сидить за комп'ютером і працює (чи шукає роботу, якщо безробітний). */
function working(state: GameState): GameState {
  state.character.activity = { kind: "work", minutes: 0, money: 0, reputation: 0, sanity: 0 };
  state.character.body.x = 7;
  state.character.body.y = 7.35;
  return state;
}

/** Робочий день о 11:00 (не летучка й не нарада). */
function employed(state: GameState): GameState {
  state.job.unemployed = false;
  state.minute = 11 * 60;
  return state;
}

describe("підсвітка цілі (§8.2)", () => {
  it("ціль — та сама, що бере дія, лише поки персонаж вільний і гра не стоїть", () => {
    const state = scenario("boxes");
    const target = targetOf(state);
    expect(target).not.toBeNull();
    expect(highlightTarget(state, false)?.id).toBe(target?.id);
    expect(highlightTarget(state, true)).toBeNull();
    state.character.activity = { kind: "use", target: "boxes", progress: 0 };
    expect(highlightTarget(state, false)).toBeNull();
  });

  it("пульс — як у старому вигляді, 0,2–0,9", () => {
    for (let time = 0; time < 3000; time += 37) {
      const pulse = highlightPulse(time);
      expect(pulse).toBeCloseTo(0.55 + 0.35 * Math.sin(time / 180), 12);
      expect(pulse).toBeGreaterThanOrEqual(0.2 - 1e-9);
      expect(pulse).toBeLessThanOrEqual(0.9 + 1e-9);
    }
  });
});

describe("екран комп'ютера (§8.6)", () => {
  it("погашений, поки за комп'ютером ніхто не працює", () => {
    expect(screenShow(scenario("job-search"))).toBe("off");
    expect(screenShow(employed(scenario("job-search")))).toBe("off");
  });

  it("безробітний шукає роботу, а працівник — працює", () => {
    expect(screenShow(working(scenario("job-search")))).toBe("search");
    expect(screenShow(working(employed(scenario("job-search"))))).toBe("work");
  });

  it("летучка о 10:00 і нарада дня «Нарада» — відеодзвінок, але лише в робочий день", () => {
    const standup = working(employed(scenario("job-search")));
    standup.minute = STANDUP_MINUTE + 5;
    expect(inMeeting(standup)).toBe(true);
    expect(screenShow(standup)).toBe("meeting");

    const meeting = working(employed(scenario("job-search")));
    meeting.modifiers.day = "meeting";
    meeting.minute = MODIFIERS.meeting.from + 10;
    expect(screenShow(meeting)).toBe("meeting");
    meeting.minute = MODIFIERS.meeting.from + MODIFIERS.meeting.minutes;
    expect(screenShow(meeting)).toBe("work");

    // Безробітний на летучку не ходить: о 10:00 він шукає роботу.
    const jobless = working(scenario("job-search"));
    jobless.minute = STANDUP_MINUTE + 5;
    expect(inMeeting(jobless)).toBe(false);
    expect(screenShow(jobless)).toBe("search");
  });

  it("кіт на клавіатурі будить екран, а сплячий на комп'ютері — ні", () => {
    const state = scenario("food-hygiene");
    const cat = state.cats[0]!;
    cat.x = 7;
    cat.y = 6.5;
    cat.act = { kind: "keyboard", target: "computer", goal: null, minutes: 10, elapsed: 0 };
    expect(screenShow(state)).toBe("keyboard");
    // Кіт на клавіатурі — понад роботу (він її й зупиняє).
    expect(screenShow(working(state))).toBe("keyboard");
    state.character.activity = null;
    cat.act = { kind: "sleep", target: "computer", goal: null, minutes: 30, elapsed: 0 };
    expect(screenShow(state)).toBe("off");
  });

  it("з перегризеним дротом комп'ютер мертвий: ні роботи, ні кота на клавіатурі (§9.12, «Гризіння»)", () => {
    const state = working(employed(scenario("food-hygiene")));
    state.home.wireChewed = true;
    expect(screenShow(state)).toBe("off");
    const cat = state.cats[0]!;
    cat.x = 7;
    cat.y = 6.5;
    cat.act = { kind: "keyboard", target: "computer", goal: null, minutes: 10, elapsed: 0 };
    expect(screenShow(state)).toBe("off");
    delete state.home.wireChewed;
    expect(screenShow(state)).toBe("keyboard");
  });

  it("зміст екрана міняється кроками — між ними його не перемальовують", () => {
    expect(screenTime("off", 12_345)).toBe(0);
    // Літера — кожні 70 мс; у межах кроку час той самий.
    expect(screenTime("work", 140)).toBe(140);
    expect(screenTime("work", 209)).toBe(140);
    expect(screenTime("keyboard", 75)).toBe(70);
    // Кивок мовця — кожні 60 мс, вакансії гортаються кожні 2,4 с.
    expect(screenTime("meeting", 179)).toBe(120);
    expect(screenTime("search", 4799)).toBe(2400);
    // Крок не більший за 70 мс там, де щось рухається безперервно (рядок дописується, мовець киває).
    for (const show of ["work", "meeting", "keyboard"] as const) {
      for (let time = 0; time < 2000; time += 13) expect(time - screenTime(show, time)).toBeLessThan(70);
    }
  });

  it("екран — у площині лицьової грані монітора, між стільницею й верхом монітора, на полотні комп'ютера", () => {
    const quad = computerScreen();
    const computer = objectById("computer");
    const at = objectScreen(computer);
    const offset = artOffset("env/computer", "screen");
    expect(offset).not.toBeNull();
    // Середина — точка `screen` (з кутами скла — їхня середина, і вона та сама).
    expect(quad.center.x).toBeCloseTo(at.x + offset!.x, 6);
    expect(quad.center.y).toBeCloseTo(at.y + offset!.y, 6);
    // Площина екрана: y = стала (монітор на чверті глибини стола, лицем до кімнати), горизонталь — уздовж x (2:1), вертикаль
    // — угору.
    expect(quad.u.y / quad.u.x).toBeCloseTo(0.5, 6);
    expect(quad.v.x).toBeCloseTo(0, 6);
    expect(quad.v.y).toBeLessThan(0);
    const cells = quad.u.x / (128 / 2);
    expect(cells).toBeGreaterThan(0.2);
    const plane = computer.y + computer.h * 0.25;
    const middle = computer.x + computer.w / 2;
    const look = isoObjectLook("computer");
    const entry = artEntry("env/computer");
    expect(entry).toBeDefined();
    for (const s of [-1, 0, 1]) {
      for (const t of [-1, 1]) {
        const p = onScreen(quad, s, t);
        const floor = ISO.toScreen({ x: middle + s * cells, y: plane });
        expect(p.x).toBeCloseTo(floor.x, 6);
        const height = floor.y - p.y;
        expect(height).toBeGreaterThan(look.top);
        // Під верхом монітора: рамка над склом — ще ≈ 8.
        expect(height).toBeLessThan(look.tall - 4);
        expect(p.x).toBeGreaterThan(at.x - entry!.pivot.x);
        expect(p.x).toBeLessThan(at.x - entry!.pivot.x + entry!.size.w);
        expect(p.y).toBeGreaterThan(at.y - entry!.pivot.y);
      }
    }
  });

  it("кути скла з маніфесту (A4), якщо вони є: зміст — у них, з відступом на пів лінії", () => {
    const at = objectScreen(objectById("computer"));
    const tl = artOffset("env/computer", "screen-tl");
    const br = artOffset("env/computer", "screen-br");
    const quad = computerScreen();
    if (!tl || !br) {
      // Кутів ще немає: запасний розмір довкола точки `screen`.
      expect(quad.u.x).toBeCloseTo((SCREEN_HALF.cells * 128) / 2, 9);
      expect(quad.v).toEqual({ x: 0, y: -SCREEN_HALF.height });
      return;
    }
    const topLeft = onScreen(quad, -1, 1);
    const bottomRight = onScreen(quad, 1, -1);
    // Усередині скла, але не далі за відступ.
    expect(topLeft.x).toBeGreaterThan(at.x + tl.x);
    expect(topLeft.y).toBeGreaterThan(at.y + tl.y);
    expect(bottomRight.x).toBeLessThan(at.x + br.x);
    expect(bottomRight.y).toBeLessThan(at.y + br.y);
    expect(Math.hypot(topLeft.x - at.x - tl.x, topLeft.y - at.y - tl.y)).toBeLessThan(GLASS_INSET * 2);
  });
});

describe("смуги (§8.2, §8.6, §8.7)", () => {
  it("смуга дії — по центру якоря: вістря бабла торкається лише рамки, на річ лягає лише краєм", () => {
    const anchor = { x: 500, y: 300 };
    const box = barBox(anchor);
    const extent = barExtent(box, false);
    expect(box.x + box.w / 2).toBe(anchor.x);
    expect([box.w, box.h]).toEqual([BAR.width, BAR.height]);
    // Чорнильний верх — на BAR_RISE над якорем, заливка — уже під вістрям хвостика бабла (воно в якорі).
    expect(extent.top).toBe(anchor.y - BAR_RISE);
    expect(box.y).toBeGreaterThan(anchor.y - 1);
    // Верх речі — на ANCHOR_GAP під якорем: смуга з рамкою й тінню заходить на неї не більше ніж на висоту заливки.
    expect(extent.bottom - (anchor.y + ANCHOR_GAP)).toBeLessThanOrEqual(BAR.height);
  });

  it("місце бабла над якорем — не менше, ніж займає бабл нового вигляду (A12 у масштабі T3 0,75) і старого (62)", () => {
    const entry = artEntry("ui/bubble/say");
    expect(entry).toBeDefined();
    const icon = entry!.points?.["icon"];
    expect(icon).toBeDefined();
    // Плашка кількості — у правому верхньому куті поля іконки 64 (на 6 усередину), заввишки 32 з обвідкою 3.
    const countTop = entry!.pivot.y - (icon!.y - 26) + 16 + 1.5;
    const room = Math.ceil(Math.max(entry!.pivot.y, countTop) * 0.75) + 8 + 2;
    expect(BUBBLE_ROOM).toBeGreaterThanOrEqual(room);
    expect(BUBBLE_ROOM).toBeGreaterThanOrEqual(62);
  });

  it("над комп'ютером — стосом над зоною бабла: знизу смужка пошуку, над нею смуга лагодження дроту", () => {
    const anchor = objectAnchorAt(objectById("computer"));
    // Зона бабла — з запасом на те, куди бабл події підіймається, згасаючи.
    const bubble = { top: anchor.y - BUBBLE_ROOM - EVENT_RISE, bottom: anchor.y };
    const both = computerStack(anchor, true, true);
    const search = barExtent(both.search!, true);
    const action = barExtent(both.action!, false);
    // Ні смужка, ні смуга не заходять у зону бабла (його вістря — у якорі): бабл відмови не закриває етап, де все скінчилося.
    expect(search.bottom).toBeCloseTo(bubble.top - STACK_GAP, 9);
    expect(action.bottom).toBeCloseTo(search.top - STACK_GAP, 9);
    for (const box of [both.search!, both.action!]) expect(box.x + box.w / 2).toBe(anchor.x);
    expect([both.search!.w, both.action!.w]).toEqual([SEARCH_BAR.width, BAR.width]);
    // Смужка пошуку стоїть на тому самому місці, хоч би що було над нею; смуга дії без пошуку — на її місці.
    expect(computerStack(anchor, true, false).search).toEqual(both.search);
    expect(computerStack(anchor, true, false).action).toBeNull();
    const alone = computerStack(anchor, false, true);
    expect(alone.search).toBeNull();
    expect(barExtent(alone.action!, false).bottom).toBeCloseTo(bubble.top - STACK_GAP, 9);
    // І над монітором: екран і записку на ньому не закривають.
    const quad = computerScreen();
    const screenTop = Math.min(onScreen(quad, -1, 1).y, onScreen(quad, 1, 1).y);
    expect(search.bottom).toBeLessThan(screenTop);
  });

  it("бабл події, згасаючи й підіймаючись (останні 0,4 с), не заходить на смужку пошуку", () => {
    const anchor = objectAnchorAt(objectById("computer"));
    const search = barExtent(computerStack(anchor, true, false).search!, true);
    // Бабл виринає на 8 вище за якір і за 0,5 с згасання підіймається на EVENT_RISE (`Bubbles.float`).
    const highest = anchor.y - BUBBLE_ROOM - EVENT_RISE;
    expect(search.bottom).toBeLessThan(highest);
    expect(EVENT_RISE).toBeGreaterThanOrEqual(34);
  });

  it("комп'ютер біля верхнього краю видимого світу: стос — ліворуч від бабла й увесь під панеллю", () => {
    const anchor = objectAnchorAt(objectById("computer"));
    const above = computerStack(anchor, true, true);
    // Місця вгорі досить — як і без краю.
    expect(computerStack(anchor, true, true, stackTop(above) - 10)).toEqual(above);
    for (const top of [stackTop(above) + 1, anchor.y - BUBBLE_ROOM - 20, anchor.y - 30, anchor.y + 40]) {
      const stack = computerStack(anchor, true, true, top);
      expect(stackTop(stack)).toBeGreaterThanOrEqual(top + STACK_GAP - 1e-9);
      // Ліворуч від бабла (його вістря — в якорі, по центру), не заходить на нього.
      for (const box of [stack.search!, stack.action!]) expect(box.x + box.w).toBeLessThanOrEqual(anchor.x - BUBBLE_HALF);
      // Смуга дії — над смужкою пошуку, як і вгорі.
      expect(barExtent(stack.action!, false).bottom).toBeLessThan(barExtent(stack.search!, true).top);
    }
    const alone = computerStack(anchor, false, true, anchor.y);
    expect(alone.action!.x + alone.action!.w).toBeLessThanOrEqual(anchor.x - BUBBLE_HALF);
  });

  it("смуга їжі над столом висить вище за страву й кухоль; над іншими речами — у якорі", () => {
    const table = objectAnchorAt(objectById("table"));
    expect(actionBarAnchor("table", table)).toEqual({ x: table.x, y: table.y - SURFACE_CLEAR });
    expect(SURFACE_CLEAR).toBeGreaterThanOrEqual(22);
    const sink = objectAnchorAt(objectById("sink"));
    expect(actionBarAnchor("sink", sink)).toBe(sink);
    expect(actionBarAnchor("item:4", { x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
  });

  it("смуга плити — намальована на лицьовій грані плити: у її площині, посередині, не ширша за 0,8 клітинки", () => {
    const stove = objectById("stove");
    const look = isoObjectLook("stove");
    const face = stoveFaceBar(stove);
    const f = look.footprint;
    const front = ISO.toScreen({ x: (f.x0 + f.x1) / 2, y: f.y1 });
    // Уздовж грані (y = y1 сліду): на екрані 2 : 1, праворуч-униз.
    expect(face.u.y / face.u.x).toBeCloseTo(0.5, 9);
    expect(Math.hypot(face.u.x, face.u.y)).toBeCloseTo(1, 9);
    // Середина — посередині грані: по центру сліду й на STOVE_BAR.drop нижче за край стільниці.
    const middle = onFace(face, face.length / 2, face.height / 2);
    expect(middle.x).toBeCloseTo(front.x, 9);
    expect(middle.y).toBeCloseTo(front.y - look.top + STOVE_BAR.drop, 9);
    // З рамкою й облямівкою — не ширша за 0,8 клітинки (на екрані 0,8 × 64): не заходить на сусідні шафки.
    const out = STOVE_BAR.ink + STOVE_BAR.rim;
    const left = onFace(face, -out, 0);
    const right = onFace(face, face.length + out, 0);
    expect(right.x - left.x).toBeLessThanOrEqual(0.8 * 64 + 1e-9);
    // По висоті — між краєм стільниці й підлогою в кожній точці грані (верх грані паралельний смузі).
    for (const a of [-out, face.length / 2, face.length + out]) {
      const top = onFace(face, a, -out);
      const bottom = onFace(face, a, face.height + out);
      const edge = ISO.toScreen({ x: (f.x0 + f.x1) / 2 + (top.x - front.x) / 64, y: f.y1 });
      expect(top.y).toBeGreaterThan(edge.y - look.top);
      expect(bottom.y).toBeLessThan(edge.y);
    }
    // І нижче за якір бабла над плитою: бабл страви смуги не закриває.
    expect(onFace(face, 0, -out).y).toBeGreaterThan(objectAnchorAt(stove).y);
    // Табло, а не риска: заввишки 12–14 (рецензія хвилі 3) — помітно вище за рамку.
    expect(STOVE_BAR.height).toBeGreaterThanOrEqual(12);
    expect(STOVE_BAR.height).toBeLessThanOrEqual(14);
  });

  it("смуга дії — над її ціллю, скільки зроблено", () => {
    const state = scenario("food-hygiene");
    expect(actionBar(state)).toBeNull();
    state.character.activity = { kind: "use", target: "shower", progress: 3, inside: true };
    const bar = actionBar(state);
    expect(bar?.target).toBe("shower");
    expect(bar?.value).toBe(useProgress(state));
    expect(bar!.value).toBeGreaterThan(0);
    expect(bar!.value).toBeLessThanOrEqual(1);
  });

  it("плита: зелена, поки вариться, червона — до «підгоріло»; підгоріла й порожня — без смуги", () => {
    const state = scenario("last-portion");
    state.home.stove = { item: null, minutes: 0 };
    expect(stoveBar(state)).toBeNull();
    state.home.stove = { item: { kind: "raw", quality: "cheap" }, minutes: COOK_MINUTES / 2 };
    expect(stoveBar(state)).toEqual({ value: 0.5, danger: false });
    const burn = BURN_MINUTES[state.difficulty];
    state.home.stove = { item: { kind: "meal", quality: "cheap" }, minutes: (COOK_MINUTES + burn) / 2 };
    expect(stoveBar(state)?.danger).toBe(true);
    expect(stoveBar(state)?.value).toBeCloseTo(0.5, 9);
    state.home.stove = { item: { kind: "burnt", quality: "cheap" }, minutes: burn + 5 };
    expect(stoveBar(state)).toBeNull();
  });

  it("пошук роботи: лише безробітному; відмова — червона до кінця етапу вакансії, півтори секунди", () => {
    expect(searchBar(employed(scenario("job-search")), null, 0)).toBeNull();
    const state = scenario("job-search");
    const bar = searchBar(state, null, 0);
    expect(bar).toEqual({ value: searchProgress(state).progress, stages: JOB_SEARCH.stages, rejected: false });
    const rejection = rejectionAt(2, 1000);
    expect(rejection.end).toBeCloseTo(2 / JOB_SEARCH.stages, 12);
    expect(searchBar(state, rejection, 1000 + REJECTION_MS - 1)).toEqual({ value: rejection.end, stages: JOB_SEARCH.stages, rejected: true });
    expect(searchBar(state, rejection, 1000 + REJECTION_MS)?.rejected).toBe(false);
  });

  it("кружечки етапів: пройдені, попереду і той, де скінчилася відмова", () => {
    expect([1, 2, 3, 4].map((i) => stageMark(0.5, 4, i, false))).toEqual(["passed", "passed", "ahead", "ahead"]);
    expect([1, 2, 3, 4].map((i) => stageMark(0.5, 4, i, true))).toEqual(["passed", "failed", "ahead", "ahead"]);
  });

});

describe("політ запасів (§6.4)", () => {
  const from = { x: 1600, y: 900 };
  const to = { x: 1700, y: 500 };

  it("дуга від ящика до сховища: кінці — у точках, найвища — посередині, висота росте з відстанню в межах", () => {
    const arc = flightArc(from, to);
    expect(flightPoint(from, to, 0)).toEqual(from);
    const end = flightPoint(from, to, 1);
    expect(end.x).toBeCloseTo(to.x, 9);
    expect(end.y).toBeCloseTo(to.y, 9);
    const mid = flightPoint(from, to, 0.5);
    expect(mid.y).toBeCloseTo((from.y + to.y) / 2 - arc, 9);
    expect(flightArc(from, { x: from.x + 10, y: from.y })).toBe(FLIGHT.arcMin);
    expect(flightArc(from, { x: from.x + 5000, y: from.y })).toBe(FLIGHT.arcMax);
    expect(arc).toBeGreaterThan(FLIGHT.arcMin);
    expect(arc).toBeLessThan(FLIGHT.arcMax);
  });

  it("іконка вискакує, летить повного розміру й пірнає у сховище; приземляється рівно", () => {
    expect(flightScale(0)).toBeCloseTo(0.6, 9);
    expect(flightScale(0.5)).toBe(1);
    expect(flightScale(1)).toBeCloseTo(0.55, 9);
    expect(flightTilt(0)).toBe(0);
    expect(flightTilt(1)).toBeCloseTo(0, 9);
  });
});
