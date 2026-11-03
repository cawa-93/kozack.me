// Позначки ізометричного світу (крок 16, T4, `GRAPHICS_PLAN.md`): підсвітка цілі дії, смуги прогресу дії й плити, смужка
// пошуку роботи й зміст екрана комп'ютера (§8.2, §8.6, §8.7) — зі стану гри, у манері арту (`marksdraw.ts`).
//
// - Підсвітку малює частина, якій належить ціль (квартира й куточок — сяйвом, `iso/highlight.ts`): позначки щокадру
//   кажуть світу, що підсвітити й наскільки яскраво (пульс), а самим позначкам цілей не належить.
// - Смуги дії й пошуку — інтерфейс над світом (`WORLD_LAYERS.marks`), без ізометрії: смуга дії — над ціллю, під баблом (над
//   столом — вище за страву й кухоль), лагодження дроту — над обривом, поруч із персонажем (`wireBarAnchor`); смужка пошуку —
//   над зоною бабла комп'ютера, а біля верхнього краю — збоку від нього (`searchBarBox`).
// - Смуга плити й зміст екрана намальовані на речах: у площині їхньої грані й у проміжку глибини речі (`iso/depth.ts`), тож
//   їх закриває той, хто стоїть чи сидить перед ними (персонаж біля плити й за столом, кіт на клавіатурі).

import type Phaser from "phaser";

import type { GameEvent } from "../../sim/events";
import { objectById } from "../../sim/home";
import type { GameState } from "../../sim/types";
import type { PartContext } from "../world/context";
import { WORLD_LAYERS } from "../world/layers";
import type { Point, WorldFrame, WorldPart } from "../world/part";
import { isoDepth, type IsoDepth, type IsoPointHandle } from "./depth";
import { drawBar, drawFaceBar, drawScreen, drawSearchBar } from "./marksdraw";
import {
  actionBar,
  actionBarPoint,
  barBox,
  computerScreen,
  highlightPulse,
  highlightTarget,
  rejectionAt,
  screenShow,
  screenTime,
  searchBar,
  searchBarBox,
  stoveBar,
  stoveFaceBar,
  type FaceBar,
  type Rejection,
  type ScreenQuad,
} from "./markslayout";

/**
 * Те, що намальовано на речі, — над її кадром, у її проміжку глибини (`ISO_DEPTH_SLOT` 0,01): над накладками речі (0,001),
 * під стравою й дрібничками (0,002–0,0025, ручка лежить скраю стола) і під котом, що сидить на клавіатурі (пів проміжку й
 * вище).
 */
const ON_THING_DEPTH = 0.0012;

export class IsoMarksView implements WorldPart {
  private readonly depth: IsoDepth;
  /** Смуги дії й пошуку: над усім світом, під баблами. */
  private readonly bars: Phaser.GameObjects.Graphics;
  /** Смуга плити: на її лицьовій грані, у проміжку глибини плити. */
  private readonly stove: Phaser.GameObjects.Graphics;
  private readonly stovePoint: IsoPointHandle;
  /** Де смуга плити: плита не рухається. */
  private readonly stoveFace: FaceBar;
  /** Зміст екрана комп'ютера: у проміжку глибини стола. */
  private readonly screen: Phaser.GameObjects.Graphics;
  private readonly screenPoint: IsoPointHandle;
  private readonly quad: ScreenQuad;
  /** Що зараз намальовано на екрані (зміст і його крок): поки те саме, екран не перемальовують. */
  private screenKey = "";
  /** Остання відмова в пошуку роботи (§8.6). */
  private rejection: Rejection | null = null;

  constructor(private readonly ctx: PartContext) {
    const { scene, layer } = ctx;
    this.depth = isoDepth(ctx);
    this.bars = scene.add.graphics().setDepth(WORLD_LAYERS.marks).addToDisplayList(layer);
    const stove = scene.add.graphics().addToDisplayList(layer);
    this.stove = stove;
    this.stovePoint = this.depth.addPoint((d) => stove.setDepth(d));
    this.stovePoint.placeAbove("stove", ON_THING_DEPTH);
    this.stoveFace = stoveFaceBar(objectById("stove"));
    const screen = scene.add.graphics().addToDisplayList(layer);
    this.screen = screen;
    this.screenPoint = this.depth.addPoint((d) => screen.setDepth(d));
    this.screenPoint.placeAbove("computer", ON_THING_DEPTH);
    this.quad = computerScreen();
  }

  update(state: GameState, frame: WorldFrame): void {
    const { world } = this.ctx;
    const time = frame.time;

    // Підсвітка цілі (§8.2): її малює частина, якій ціль належить.
    const target = highlightTarget(state, frame.blocked);
    if (target) world.highlight(target, highlightPulse(time));

    const g = this.bars.clear();
    // Смуга тривалої дії — над ціллю, під її баблом; лагодження дроту — над обривом, поруч із персонажем (§9.12).
    const action = actionBar(state);
    const actionAt = action ? actionBarPoint(action.target, world) : null;
    if (action && actionAt) drawBar(g, barBox(actionAt), action.value, "good");
    // Пошук роботи (§8.6): етапи поточної вакансії, на відмові смужка червона; над комп'ютером, над зоною його бабла.
    const search = searchBar(state, this.rejection, time);
    const computer = search ? world.objectAnchor("computer") : null;
    if (search && computer) {
      // Верхній край видимого світу (під панеллю): смужка, що не влазить над баблом, стає збоку від нього.
      const box = searchBarBox(computer, this.ctx.scene.cameras.main.worldView.y);
      drawSearchBar(g, box, search.value, search.stages, search.rejected);
    }

    // Плита (§8.7): зелена — готується, червона — скоро підгорить; на лицьовій грані плити, щоб не закривати страву.
    this.stove.clear();
    const stove = stoveBar(state);
    if (stove) drawFaceBar(this.stove, this.stoveFace, stove.value, stove.danger ? "danger" : "good");

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
    this.stovePoint.remove();
    this.stove.destroy();
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
