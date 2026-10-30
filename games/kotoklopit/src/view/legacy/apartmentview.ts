// Квартира старого вигляду як частина світу (крок 16, хвиля 0): підлога, стіни, вікна й меблі (`apartment.ts`), сховища та
// їх наповнення (`storagelook.ts`), речі на плиті й поверхнях, дрібнички, туалетний папір, шафка з кормом, смітник і ящики
// біля входу.

import Phaser from "phaser";

import { trashTipped } from "../../sim/catai";
import { isPresent, TOILET_ROLL, TRINKETS } from "../../sim/home";
import { boxesShown, STORAGES, storageStages } from "../../sim/storage";
import type { Target } from "../../sim/targets";
import type { GameState } from "../../sim/types";
import { COLORS } from "../colors";
import type { PartContext } from "../world/context";
import { objectHeight } from "../world/objects";
import type { ApartmentPart, Point, WorldFrame } from "../world/part";
import { OBLIQUE } from "../world/projection";
import { drawApartment, drawBoxPile, drawItem, type ObjectView } from "./apartment";
import { drawCabinetExtras, drawTippedTrash, drawToiletRoll, drawTrinket } from "./catcorner";
import type { LegacyPen } from "./pen";
import { drawStorage } from "./storagelook";

export class LegacyApartmentView implements ApartmentPart {
  /** Стара квартира малюється лише косою проєкцією. */
  private readonly proj = OBLIQUE;
  private readonly views: Map<string, ObjectView>;
  /** Речі на плиті й поверхнях: окремий шар для кожного місця, щоб персонаж правильно їх перекривав. */
  private readonly items = new Map<string, Phaser.GameObjects.Graphics>();
  /** Дрібнички на столах (§9.12, «Скидання речей»): кожна — над своєю річчю квартири. */
  private readonly trinkets = new Map<string, Phaser.GameObjects.Graphics>();
  /** Рулон туалетного паперу на задній стіні ванної (§9.12, «Мисливський інстинкт»): над стіною, під котом. */
  private readonly toiletRoll: Phaser.GameObjects.Graphics;
  /** Шафка з кормом відчинена котом, замок на ній; перекинутий смітник (§9.12, «Кмітливість у бешкеті»). */
  private readonly cabinetLook: Phaser.GameObjects.Graphics;
  private readonly trashLook: Phaser.GameObjects.Graphics;
  /** Малюнки наповнення сховищ і що на них намальовано; з'являються першого кадру. */
  private readonly storageLooks = new Map<string, { g: Phaser.GameObjects.Graphics; key: string }>();
  /** Купа ящиків біля входу: скільки коробок намальовано. */
  private boxesDrawn = -1;

  constructor(
    private readonly ctx: PartContext,
    private readonly pen: LegacyPen,
  ) {
    const { scene, layer } = ctx;
    const proj = this.proj;
    this.views = drawApartment(scene, layer, proj);
    for (const id of ["stove", ...Object.keys(ctx.state().home.surfaces)]) {
      this.items.set(id, scene.add.graphics().setDepth(this.view(id).depth + 1).addToDisplayList(layer));
    }
    for (const trinket of TRINKETS) {
      this.trinkets.set(trinket.kind, scene.add.graphics().setDepth(this.view(trinket.object).depth + 1).addToDisplayList(layer));
    }
    this.toiletRoll = scene.add.graphics().setDepth(proj.depthOf(proj.toScreen({ x: 0, y: TOILET_ROLL.y }).y) + 1).addToDisplayList(layer);
    this.cabinetLook = scene.add.graphics().setDepth(this.view("cat-cabinet").depth + 0.6).addToDisplayList(layer);
    this.trashLook = scene.add.graphics().setDepth(this.view("trash").depth).addToDisplayList(layer);
  }

  /** Вигляд речі квартири: де її верхня грань, точка бабла, глибина й малюнок. */
  view(id: string): ObjectView {
    const view = this.views.get(id);
    if (!view) throw new Error(`Немає вигляду для «${id}»`);
    return view;
  }

  update(state: GameState, frame: WorldFrame): void {
    this.pen.begin(frame);
    // Сховища з'являються в квартирі після першого отримання запасу (§6.4).
    for (const view of this.views.values()) if (view.object.requires || view.object.kind === "boxes") view.graphics.setVisible(isPresent(state, view.object));
    this.drawBoxes(state);
    this.drawItems(state);
    this.drawStorages(state);
  }

  /** Купа ящиків біля входу: 1–4 коробки за вмістом (§6.4); перемальовується, лише коли змінилася. */
  private drawBoxes(state: GameState): void {
    const count = boxesShown(state);
    if (count === this.boxesDrawn) return;
    this.boxesDrawn = count;
    const view = this.view("boxes");
    drawBoxPile(view.graphics, view.top, objectHeight("boxes"), count);
  }

  /** Речі на плиті й поверхнях. */
  private drawItems(state: GameState): void {
    const { home } = state;
    for (const [id, g] of this.items) {
      g.clear();
      const item = id === "stove" ? home.stove.item : home.surfaces[id];
      if (!item) continue;
      const view = this.view(id);
      drawItem(g, item, view.top.x + view.top.w / 2, view.top.y + view.top.h / 2 + 6);
    }
    const roll = this.proj.toScreen(TOILET_ROLL);
    drawToiletRoll(this.toiletRoll.clear(), roll.x, roll.y, home.rollDown === true);
    // Шафка з кормом: відчинена котом і з замком (§9.12, «Кмітливість у бешкеті»); смітник лежить, поки сміття не прибрали.
    const cabinet = this.view("cat-cabinet");
    this.cabinetLook.clear();
    if (isPresent(state, cabinet.object)) drawCabinetExtras(this.cabinetLook, cabinet.top, objectHeight("catCabinet"), home.cabinetOpen === true, home.lock !== undefined);
    const tipped = trashTipped(state);
    const trash = this.view("trash");
    trash.graphics.setVisible(!tipped);
    this.trashLook.clear();
    if (tipped) drawTippedTrash(this.trashLook, trash.top, objectHeight("trash"));
    // Дрібнички стоять на своїх місцях, поки їх не скинули (§9.12).
    for (const trinket of TRINKETS) {
      const g = this.trinkets.get(trinket.kind);
      if (!g) continue;
      g.clear();
      if (home.trinkets?.[trinket.kind]) continue;
      const view = this.view(trinket.object);
      drawTrinket(g, trinket.kind, view.top.x + view.top.w * trinket.at, view.top.y + view.top.h / 2 + 6);
    }
  }

  /** Наповнення видно з самого сховища (§6.4): перемальовуємо, лише коли воно змінилося. */
  private drawStorages(state: GameState): void {
    for (const storage of STORAGES) {
      const view = this.views.get(storage.object);
      if (!view) continue;
      let look = this.storageLooks.get(storage.object);
      if (!look) {
        look = { g: this.ctx.scene.add.graphics().setDepth(view.depth + 0.5).addToDisplayList(this.ctx.layer), key: "" };
        this.storageLooks.set(storage.object, look);
      }
      const present = isPresent(state, view.object);
      const stages = storageStages(state, storage);
      const key = `${present}|${stages.join(",")}`;
      if (key === look.key) continue;
      look.key = key;
      look.g.setVisible(present);
      drawStorage(look.g, view.object.kind, view.top, objectHeight(view.object.kind), stages);
    }
  }

  reset(): void {}

  /** Підлогу, стіни й вікна, намальовані раз на старті, прибирає сама сцена разом зі списком відображення. */
  destroy(): void {
    for (const view of this.views.values()) view.graphics.destroy();
    for (const g of [...this.items.values(), ...this.trinkets.values(), this.toiletRoll, this.cabinetLook, this.trashLook]) g.destroy();
    for (const look of this.storageLooks.values()) look.g.destroy();
  }

  /** Над річчю квартири, поки вона є (сховища з'являються після першого запасу, §6.4). */
  anchor(id: string): Point | null {
    const view = this.views.get(id);
    if (!view) return null;
    return isPresent(this.ctx.state(), view.object) ? view.anchor : null;
  }

  objectAnchor(id: string): Point | null {
    return this.views.get(id)?.anchor ?? null;
  }

  /** Рамка довкола верхньої грані речі (сховища-фігури — довкола самої фігури). */
  highlight(target: Target, alpha: number): boolean {
    if (target.type !== "object") return false;
    const g = this.pen.g.lineStyle(4, COLORS.highlight, alpha);
    const view = this.view(target.id);
    const box = view.outline ?? view.top;
    g.strokeRect(box.x - 2, box.y - 2, box.w + 4, box.h + 4);
    return true;
  }
}
