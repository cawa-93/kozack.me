// Коти старого вигляду як частина світу (крок 16, хвиля 0): вигляд кожного кота в домі (`cat.ts`), настрій з поведінки
// (§11.4), імена в нашийниках (§9.10) і приховані числа режиму розробки (§11.5).

import Phaser from "phaser";

import { catFeeling, petOver } from "../../sim/actions";
import { objectById, WINDOWS } from "../../sim/home";
import type { Target } from "../../sim/targets";
import type { Cat, GameState, Vec } from "../../sim/types";
import { catFacing, personFacing } from "../anim/catfacing";
import { isoScreenDir } from "../anim/iso";
import { catPairs, type PairPlacement } from "../anim/pairs";
import { COLORS } from "../colors";
import { legacyDepthPoint } from "../iso/transition";
import type { RigFacing } from "../rig/types";
import { blinkAmount, catLook } from "../thoughts";
import type { PartContext } from "../world/context";
import { WORLD_LAYERS } from "../world/layers";
import type { CatPoints, CatsPart, Point, WorldFrame } from "../world/part";
import { CatView } from "./cat";
import type { LegacyPen } from "./pen";

/** На скільки вбік від голови персонажа бабл кота, якого він тримає на руках, px (§11.4). */
const CARRIED_BUBBLE_SHIFT = 34;

export class LegacyCatsView implements CatsPart {
  private readonly views = new Map<number, CatView>();
  /** Приховані числа над котами в режимі розробки (§11.5). */
  private readonly hiddenLabels = new Map<number, Phaser.GameObjects.Text>();
  /** Імена над котами в нашийниках (§9.10). */
  private readonly collarLabels = new Map<number, Phaser.GameObjects.Text>();
  /** Ізометрія: де кіт був минулого кадру й куди дивився (`isoSide`). */
  private readonly facings = new Map<number, { pos: Vec; facing: RigFacing }>();

  constructor(
    private readonly ctx: PartContext,
    private readonly pen: LegacyPen,
  ) {}

  /** Коти: вигляд для кожного кота в домі; кота на руках малюємо біля грудей персонажа. */
  update(state: GameState, frame: WorldFrame): void {
    this.pen.begin(frame);
    const time = frame.time;
    const held = state.character.held;
    const alive = new Set<number>();
    const iso = this.ctx.projection.kind === "iso";
    const pairs = iso ? catPairs(state) : null;
    for (const cat of state.cats) {
      alive.add(cat.id);
      let view = this.views.get(cat.id);
      if (!view) {
        const id = `cat:${cat.id}`;
        view = new CatView(this.ctx.scene, this.ctx.layer, cat, this.ctx.projection, iso ? (set) => legacyDepthPoint(this.ctx, id, set) : null);
        this.views.set(cat.id, view);
      }
      // Кіт на руках чи на колінах — біля персонажа.
      const withPerson = (held?.kind === "cat" && held.cat === cat.id) || cat.act.kind === "lap";
      const carried = withPerson ? this.ctx.world.person.hands : null;
      const activity = state.character.activity;
      const petting = activity?.kind === "pet" && !petOver(activity);
      const playing = activity?.kind === "play" && !activity.done;
      const interaction = (petting || playing) && activity?.cat === cat.id ? activity.kind : null;
      // Настрій з поведінки (§11.4): сумна поза чи повільне моргання до персонажа.
      const look = catLook(state, cat);
      // Персонаж праворуч чи ліворуч на екрані: у косій — за x клітинок, в ізометрії — за горизонталлю екрана (x − y).
      const person = state.character.body;
      const toward = (iso ? isoScreenDir({ x: person.x - cat.x, y: person.y - cat.y }).x >= 0 : person.x >= cat.x) ? 1 : -1;
      // На підвіконні під вікном у задній стіні кіт дивиться у вікно — спиною до нас (§9.12, «Вікно»; перевірка етапу 2026-10-26).
      const pane = cat.act.kind === "window" && cat.act.goal === null ? WINDOWS.find((w) => w.sill === cat.act.target) : undefined;
      const toWindow = pane !== undefined && pane.wall.y < objectById(pane.sill).y;
      const mood =
        toWindow && look !== "sad"
          ? { sad: false, blink: 0, face: null, back: true }
          : look === null
            ? null
            : look === "sad"
              ? { sad: true, blink: 0, face: null }
              : look === "belly"
                ? // Головою від персонажа: рука гладить живіт і не закриває морду (§9.12, перевірка етапу 2026-10-25).
                  { sad: false, blink: 0, face: -toward, belly: true }
                : look === "nudge"
                  ? { sad: false, blink: 0, face: toward, nudge: true }
                  : look === "sulk"
                    ? { sad: false, blink: 0, face: -toward, back: true }
                    : { sad: false, blink: blinkAmount(time, cat.id), face: toward };
      const side = pairs ? this.isoSide(state, cat, pairs, withPerson) : null;
      view.draw(state, cat, time, carried, interaction, catFeeling(state, cat), mood, side);
      this.drawHidden(cat.id, view, cat.mood, cat.health, cat.love, frame.showHidden);
      this.drawCollar(cat, view);
    }
    for (const [id, view] of this.views) {
      if (alive.has(id)) continue;
      view.destroy();
      this.views.delete(id);
      this.hiddenLabels.get(id)?.destroy();
      this.hiddenLabels.delete(id);
      this.collarLabels.get(id)?.destroy();
      this.collarLabels.delete(id);
      this.facings.delete(id);
    }
  }

  /**
   * Перехідний вигляд кроку 16 (`?gfx=iso`): куди кіт дивиться на екрані (1 — праворуч, −1 — ліворуч). Сим знає лише
   * `facing` ±1 за x клітинок, а в ізометрії вісь x — діагональ екрана, тож бік — з `catFacing` (рух, пара, ціль дії). Кіт на
   * руках і на колінах — туди ж, куди персонаж у світі (`personFacing`): старий кіт не в гнізді скелета, його ніхто не дзеркалить.
   */
  private isoSide(state: GameState, cat: Cat, pairs: ReadonlyMap<number, PairPlacement>, withPerson: boolean): number {
    const last = this.facings.get(cat.id) ?? null;
    const prev = last?.facing ?? null;
    const facing = withPerson ? personFacing(state, prev) : catFacing(state, cat, last?.pos ?? null, { prev, pair: pairs.get(cat.id) ?? null });
    this.facings.set(cat.id, { pos: { x: cat.x, y: cat.y }, facing });
    return facing.flip ? -1 : 1;
  }

  /** Режим розробки: настрій, здоров'я й любов над котом (§11.5). */
  private drawHidden(id: number, view: CatView, mood: number, health: number, love: number, shown: boolean): void {
    let label = this.hiddenLabels.get(id);
    if (!shown) {
      label?.setVisible(false);
      return;
    }
    if (!label) {
      label = this.ctx.scene.add
        .text(0, 0, "", { fontFamily: "system-ui, sans-serif", fontSize: "13px", color: "#ffffff", backgroundColor: "#1f1a24", padding: { x: 3, y: 1 }, resolution: 2 })
        .setOrigin(0.5, 1)
        .setDepth(WORLD_LAYERS.hidden)
        .addToDisplayList(this.ctx.layer);
      this.hiddenLabels.set(id, label);
    }
    label.setVisible(true).setPosition(view.head.x, view.head.y - 30).setText(`н${Math.round(mood)} з${Math.round(health)} л${Math.round(love)}`);
  }

  /** Ім'я над котом у нашийнику (§9.10). */
  private drawCollar(cat: Cat, view: CatView): void {
    let label = this.collarLabels.get(cat.id);
    if (!cat.collar || cat.away !== null) {
      label?.setVisible(false);
      return;
    }
    if (!label) {
      label = this.ctx.scene.add
        .text(0, 0, cat.name, { fontFamily: "system-ui, sans-serif", fontSize: "13px", color: "#1f1a24", backgroundColor: "#f3e9dc", padding: { x: 4, y: 1 }, resolution: 2 })
        .setOrigin(0.5, 1)
        .setDepth(WORLD_LAYERS.collars)
        .addToDisplayList(this.ctx.layer);
      this.collarLabels.set(cat.id, label);
    }
    label.setVisible(true).setPosition(view.head.x, view.head.y - 6).setText(cat.name);
  }

  /** Коти нового стану — нові об'єкти, навіть якщо id ті самі. */
  reset(): void {
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
    for (const label of this.hiddenLabels.values()) label.destroy();
    this.hiddenLabels.clear();
    for (const label of this.collarLabels.values()) label.destroy();
    this.collarLabels.clear();
    this.facings.clear();
  }

  destroy(): void {
    this.reset();
  }

  points(cat: number): CatPoints | null {
    const view = this.views.get(cat);
    return view ? { head: view.head, back: view.back } : null;
  }

  /** Над головою кота. */
  anchor(id: string): Point | null {
    const [kind, raw] = id.split(":");
    if (kind !== "cat") return null;
    const number = Number(raw);
    const head = this.views.get(number)?.head;
    if (!head) return null;
    // Кіт на руках — на рівні грудей персонажа: бабл над ним зсунутий убік, інакше накриває голову персонажа
    // й здається, що це каже персонаж (§11.4).
    const held = this.ctx.state().character.held;
    if (held?.kind === "cat" && held.cat === number) {
      const person = this.ctx.world.person.head;
      const side = head.x >= person.x ? 1 : -1;
      return { x: person.x + side * CARRIED_BUBBLE_SHIFT, y: head.y };
    }
    return head;
  }

  /** Коло довкола кота. */
  highlight(target: Target, alpha: number): boolean {
    if (target.type !== "cat") return false;
    const g = this.pen.g.lineStyle(4, COLORS.highlight, alpha);
    const view = this.views.get(target.cat.id);
    if (view) g.strokeEllipse(view.head.x, view.head.y + 30, 46, 46);
    return true;
  }
}
