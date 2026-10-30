// Позначки старого вигляду як частина світу (крок 16, хвиля 0): екран комп'ютера, підсвітка цілі дії (її малює частина,
// якій належить ціль), смуги прогресу дії й плити, смужка пошуку роботи (§8.2, §8.6). Де що — з якорів світу, тож
// позначки стають над річчю, хоч би яка частина її малювала.

import Phaser from "phaser";

import { useProgress } from "../../sim/actions";
import { BURN_MINUTES, COOK_MINUTES, JOB_SEARCH } from "../../sim/config";
import type { GameEvent } from "../../sim/events";
import { objectById } from "../../sim/home";
import { targetOf } from "../../sim/targets";
import type { GameState } from "../../sim/types";
import { isWorking, searchProgress } from "../../sim/work";
import { COLORS } from "../colors";
import type { PartContext } from "../world/context";
import type { Point, WorldFrame, WorldPart } from "../world/part";
import type { LegacyPen } from "./pen";

/** Скільки триває червона смужка відмови в пошуку роботи (§8.6), мс. */
const REJECTION_MS = 1500;
/** Верхня грань речі старого вигляду: на 4 нижче за якір і з відступом 4 від країв клітинки (`apartment.ts`). */
const TOP_INSET = 4;

export class LegacyMarksView implements WorldPart {
  /** Остання відмова в пошуку роботи (§8.6): коли (мс) і на якому місці смужки. */
  private rejection: { at: number; end: number } | null = null;

  constructor(
    private readonly ctx: PartContext,
    private readonly pen: LegacyPen,
  ) {}

  /** Підсвітка цілі, смуги прогресу, екран комп'ютера. */
  update(state: GameState, frame: WorldFrame): void {
    const { world, projection } = this.ctx;
    const time = frame.time;
    const g = this.pen.begin(frame);
    const working = isWorking(state);

    // Екран монітора над комп'ютерним столом.
    const computer = world.objectAnchor("computer");
    if (computer) {
      const screen = { x: computer.x - 19, y: computer.y - 19, w: 38, h: 22 };
      g.fillStyle(working ? 0x79a6c2 : 0x2b2a33).fillRect(screen.x, screen.y, screen.w, screen.h);
      if (working && Math.floor(time / 300) % 2 === 0) g.fillStyle(0xffffff, 0.8).fillRect(screen.x + 5, screen.y + 6, 18, 3);
    }

    const target = state.character.activity === null ? targetOf(state) : null;
    if (target && !frame.blocked) world.highlight(target, 0.55 + 0.35 * Math.sin(time / 180));

    const progress = useProgress(state);
    const activity = state.character.activity;
    if (progress !== null && activity?.kind === "use") {
      const anchor = world.anchor(activity.target);
      if (anchor) bar(g, anchor.x, anchor.y - 10, progress, COLORS.good);
    }
    const stove = state.home.stove;
    const plate = world.objectAnchor("stove");
    if (stove.item && stove.item.kind !== "burnt" && plate) {
      const cooking = stove.item.kind === "raw";
      const value = cooking ? stove.minutes / COOK_MINUTES : (stove.minutes - COOK_MINUTES) / (BURN_MINUTES[state.difficulty] - COOK_MINUTES);
      // Смуга на лицьовій грані плити, під верхньою: зелена — готується, червона — скоро підгорить.
      const top = plate.y + TOP_INSET;
      const topHeight = projection.rectToScreen(objectById("stove")).h - TOP_INSET * 2;
      bar(g, plate.x, top + topHeight + 10, value, cooking ? COLORS.good : COLORS.danger);
    }
    // Пошук роботи (§8.6): над монітором — етапи поточної вакансії (персонаж за столом не закриває); на відмові смужка червона.
    if (state.job.unemployed && computer) {
      const rejected = this.rejection !== null && time - this.rejection.at < REJECTION_MS;
      const value = rejected && this.rejection ? this.rejection.end : searchProgress(state).progress;
      searchBar(g, computer.x, computer.y - 40, value, JOB_SEARCH.stages, rejected);
    }
  }

  onEvent(event: GameEvent, time: number): void {
    // Вакансія — відмова (§8.6): хрестик і червона смужка, далі нова вакансія з нуля.
    if (event.type === "job-rejected") this.rejection = { at: time, end: event.vacancy / JOB_SEARCH.stages };
  }

  reset(): void {}

  destroy(): void {
    this.pen.destroy();
  }

  anchor(): Point | null {
    return null;
  }

  highlight(): boolean {
    return false;
  }
}

/**
 * Смужка пошуку роботи (§8.6): одна вакансія — етапи з позначками-кружечками на межах; пройдений
 * етап — світлий кружечок, на відмові — червона смужка й червоний кружечок, де все скінчилося.
 */
function searchBar(g: Phaser.GameObjects.Graphics, cx: number, y: number, value: number, stages: number, rejected: boolean): void {
  const width = 96;
  const x = cx - width / 2;
  g.fillStyle(COLORS.ink).fillRoundedRect(x - 2, y - 2, width + 4, 10, 4);
  g.fillStyle(rejected ? COLORS.danger : COLORS.good).fillRoundedRect(x, y, Math.max(0, Math.min(1, value)) * width, 6, 3);
  for (let i = 1; i <= stages; i++) {
    const mark = i / stages;
    const passed = value >= mark - 1e-6;
    const failedHere = rejected && Math.abs(value - mark) < 1e-6;
    g.fillStyle(failedHere ? COLORS.danger : passed ? COLORS.paper : 0x3a3340).fillCircle(x + width * mark, y + 3, 5);
    g.lineStyle(2, COLORS.ink).strokeCircle(x + width * mark, y + 3, 5);
  }
}

function bar(g: Phaser.GameObjects.Graphics, cx: number, y: number, value: number, color: number): void {
  const width = 46;
  const x = cx - width / 2;
  g.fillStyle(COLORS.ink).fillRoundedRect(x - 2, y - 2, width + 4, 10, 4);
  g.fillStyle(color).fillRoundedRect(x, y, Math.max(0, Math.min(1, value)) * width, 6, 3);
}
