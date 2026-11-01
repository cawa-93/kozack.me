// Позначки ізометричного світу (крок 16, T4, `GRAPHICS_PLAN.md`): підсвітка цілі дії, смуги прогресу дії й плити, смужка
// пошуку роботи й зміст екрана комп'ютера (§8.2, §8.6, §8.7). Те саме, що показують позначки старого вигляду
// (`legacy/marksview.ts`), з того самого стану, у манері арту (`marksdraw.ts`).
//
// - Підсвітку малює частина, якій належить ціль (квартира й куточок — сяйвом, `iso/highlight.ts`): позначки щокадру
//   кажуть світу, що підсвітити й наскільки яскраво (пульс), а самим позначкам цілей не належить.
// - Смуги — інтерфейс над світом (`WORLD_LAYERS.marks`), без ізометрії: смуга дії — над ціллю, під баблом; над комп'ютером —
//   стосом над зоною його бабла (`computerStack`); смуга плити — на її лицьовій грані.
// - Зміст екрана — у площині монітора, у проміжку глибини стола з комп'ютером (`iso/depth.ts`): його закриває персонаж, що
//   сидить за столом, і кіт на клавіатурі, а сам він лежить на кадрі `env/computer`.

import type Phaser from "phaser";

import type { GameEvent } from "../../sim/events";
import { objectById } from "../../sim/home";
import type { GameState } from "../../sim/types";
import type { PartContext } from "../world/context";
import { WORLD_LAYERS } from "../world/layers";
import type { Point, WorldFrame, WorldPart } from "../world/part";
import { isoDepth, type IsoDepth, type IsoPointHandle } from "./depth";
import { drawBar, drawScreen, drawSearchBar } from "./marksdraw";
import {
  actionBar,
  barBox,
  computerScreen,
  computerStack,
  highlightPulse,
  highlightTarget,
  rejectionAt,
  screenShow,
  screenTime,
  searchBar,
  stoveBar,
  stoveBarBox,
  type BarBox,
  type Rejection,
  type ScreenQuad,
} from "./markslayout";

/**
 * Зміст екрана — над кадром стола з комп'ютером, у його проміжку глибини (`ISO_DEPTH_SLOT` 0,01): над накладками речі
 * (0,001), під стравою й дрібничками (0,002–0,0025, ручка лежить скраю стола) і під котом, що сидить на клавіатурі (пів
 * проміжку й вище).
 */
const SCREEN_DEPTH = 0.0012;

export class IsoMarksView implements WorldPart {
  private readonly depth: IsoDepth;
  /** Смуги: над усім світом, під баблами. */
  private readonly bars: Phaser.GameObjects.Graphics;
  /** Зміст екрана комп'ютера: у проміжку глибини стола. */
  private readonly screen: Phaser.GameObjects.Graphics;
  private readonly screenPoint: IsoPointHandle;
  private readonly quad: ScreenQuad;
  /** Де смуга плити: плита не рухається. */
  private readonly stoveBox: BarBox;
  /** Що зараз намальовано на екрані (зміст і його крок): поки те саме, екран не перемальовують. */
  private screenKey = "";
  /** Остання відмова в пошуку роботи (§8.6). */
  private rejection: Rejection | null = null;

  constructor(private readonly ctx: PartContext) {
    const { scene, layer } = ctx;
    this.depth = isoDepth(ctx);
    this.bars = scene.add.graphics().setDepth(WORLD_LAYERS.marks).addToDisplayList(layer);
    const screen = scene.add.graphics().addToDisplayList(layer);
    this.screen = screen;
    this.screenPoint = this.depth.addPoint((d) => screen.setDepth(d));
    this.screenPoint.placeAbove("computer", SCREEN_DEPTH);
    this.quad = computerScreen();
    this.stoveBox = stoveBarBox(objectById("stove"));
  }

  update(state: GameState, frame: WorldFrame): void {
    const { world } = this.ctx;
    const time = frame.time;

    // Підсвітка цілі (§8.2): її малює частина, якій ціль належить.
    const target = highlightTarget(state, frame.blocked);
    if (target) world.highlight(target, highlightPulse(time));

    const g = this.bars.clear();
    // Смуга тривалої дії — над ціллю, під її баблом; над комп'ютером (лагодження дроту) — у стосі над баблом.
    const action = actionBar(state);
    const onComputer = action?.target === "computer";
    const actionAnchor = action && !onComputer ? world.anchor(action.target) : null;
    if (action && actionAnchor) drawBar(g, barBox(actionAnchor), action.value, "good");
    // Плита (§8.7): зелена — готується, червона — скоро підгорить; на лицьовій грані плити, щоб не закривати страву.
    const stove = stoveBar(state);
    if (stove) drawBar(g, this.stoveBox, stove.value, stove.danger ? "danger" : "good");
    // Пошук роботи (§8.6): етапи поточної вакансії, на відмові смужка червона; над комп'ютером, над зоною його бабла.
    const search = searchBar(state, this.rejection, time);
    const computer = search || onComputer ? world.objectAnchor("computer") : null;
    if (computer) {
      const stack = computerStack(computer, search !== null, onComputer);
      if (search && stack.search) drawSearchBar(g, stack.search, search.value, search.stages, search.rejected);
      if (action && stack.action) drawBar(g, stack.action, action.value, "good");
    }

    // Екран комп'ютера: що на ньому; перемальовується, лише коли зміст зробив крок (рядок дописався, мовець кивнув).
    const show = screenShow(state);
    const at = screenTime(show, time);
    const key = `${show}:${at}`;
    if (key !== this.screenKey) {
      this.screenKey = key;
      this.screen.clear();
      drawScreen(this.screen, this.quad, show, at);
    }
  }

  lateUpdate(): void {
    this.depth.solve();
  }

  onEvent(event: GameEvent, time: number): void {
    // Вакансія — відмова (§8.6): червона смужка до етапу, де все скінчилося, далі нова вакансія з нуля.
    if (event.type === "job-rejected") this.rejection = rejectionAt(event.vacancy, time);
  }

  reset(): void {
    this.rejection = null;
    this.screenKey = "";
  }

  destroy(): void {
    this.screenPoint.remove();
    this.screen.destroy();
    this.bars.destroy();
  }

  /** Позначки не мають своїх речей: якорі — в інших частин. */
  anchor(): Point | null {
    return null;
  }

  /** І цілей дії серед позначок немає. */
  highlight(): boolean {
    return false;
  }
}
