// Скелет у Phaser (крок 16, GRAPHICS_PLAN.md: «Скелети й анімації»): контейнер із зображенням на кожен слот, якому позу
// щокадру рахує `rigcore.ts`. Кадр слота — `frameId(обвіс[слот], стан, ракурс)` з атласу (`addArt` / `setArt` з
// `art/atlas.ts`; кадру немає — заглушка); для записів із шарами (кіт, персонаж) — запечений компонувальником кадр за
// рецептом (`baked`: `setBakedArt` з `art/bake.ts`, як кота й персонажа показуватиме гра); або текстура ззовні
// (`setSlotTexture`, `setTextureSource`).
//
// Як користуватися (вигляд котів і персонажа, галерея):
//   const cat = new RigSprite(scene, CAT_RIG, { fit: CAT_FIT, skin: catSkin(shape), proportions: catProportions(shape),
//     baked: { recipe: catRecipeOf(model), owner: catOwner(model.id) } });
//   layer.add(cat);                         // чи scene.add.existing(cat); глибину всього контейнера — setDepth ззовні
//   cat.play(CAT_TRIAL.walk);               // та сама анімація вже грає — нічого не робить
//   cat.setFacing({ view: "back", flip: true });
//   cat.setPosition(x, y).update(time);     // щокадру: час сцени (мс) — той самий годинник, що й для play
//   cat.anchor("head");                     // точка над головою у світі — для бульбашок
//   person.attach("arms", cat);             // кіт іде за гніздом рук: місце, кут і z між слотами
//
// Віддзеркалення — `scaleX` контейнера зі знаком «−» (величину масштабу, якщо її задано ззовні, збережено). Прикріплене
// в гніздо віддзеркалюється разом із контейнером: кіт на руках персонажа, що дивиться ліворуч, теж дивиться ліворуч.
// Прикріплені скелети оновлює їхній власник (`update` у кожного свій).

import Phaser from "phaser";

import { addArt, setArt } from "../art/atlas";
import { addBakedArt, setBakedArt } from "../art/bake";
import { artEntry, DEFAULT_RES } from "../art/manifest";
import { artGeometry, artPlacement } from "../art/placement";
import type { ArtEntry, ArtId, ArtView, FrameLayer, TintRecipe } from "../art/types";
import { Rig, slotFrame, type ArtLookup, type PlayOptions, type ProportionRef, type RigFit, type SlotFrame } from "./rigcore";
import type { AnyRig, BoneOf, RigAnchor, RigAnim, RigDef, RigFacing, RigSkin, SlotOf, SocketOf, Vec2 } from "./types";

/** Текстура кадру слота ззовні (запечений кадр компонувальника): ключ текстури Phaser і кадр у ній. */
export interface SlotTexture {
  key: string;
  frame?: string | number | undefined;
}

/**
 * Звідки брати текстуру кадру слота: кличеться, коли кадр слота змінюється (обвіс, стан, ракурс); null — кадр атласу.
 * Текстура — повне полотно запису (`size · res` пікселів за будь-якої `res`, без обрізки): pivot і розмір беруться з
 * маніфесту, тож 1 одиниця арту = 1 px світу.
 */
export type SlotTextureSource<S extends string> = (slot: S, frame: SlotFrame) => SlotTexture | null;

/**
 * Запечені кадри для записів із шарами (кіт, персонаж): рецепт тонування (`recipes.ts`) — один на істоту чи свій для слота
 * (дальні частини — `farRecipe`), і власник бюджету запікання (`bake.ts`: кіт — `catOwner(id)`, персонаж — `person`).
 * Записи без шарів (вміст гнізд, речі) — як і раніше, кадри атласу.
 */
export interface RigBaked<S extends string> {
  recipe: TintRecipe | ((slot: S) => TintRecipe);
  owner?: string | undefined;
}

export interface RigSpriteOptions<B extends string, S extends string, K extends string> {
  /** Суглоби з точок кадрів (`CAT_FIT`, `PERSON_FIT`); не задано — лише числа визначення. */
  fit?: RigFit<B, S, K> | null | undefined;
  /** Обвіс поверх `def.skin`. */
  skin?: Partial<RigSkin<S>> | undefined;
  facing?: Partial<RigFacing> | undefined;
  proportions?: readonly ProportionRef[] | undefined;
  /** Записи маніфесту; за замовчуванням — `artEntry`. */
  lookup?: ArtLookup | undefined;
  /**
   * Який шар показувати в записах із шарами, поки компонувальника немає (галерея): `ink`, `fill`… Не задано — `all`:
   * у записів із шарами такого кадру в атласі немає, тож до запікання там заглушка.
   */
  layer?: FrameLayer | undefined;
  /** Текстури слотів ззовні (див. `SlotTextureSource`). */
  textures?: SlotTextureSource<S> | null | undefined;
  /** Запечені кадри записів із шарами (див. `RigBaked`); не задано — кадри атласу (шар `layer`). */
  baked?: RigBaked<S> | null | undefined;
}

/** Гніздо у світі: місце, кут (градуси) і чи віддзеркалено (тоді й вміст варто віддзеркалити). */
export interface SocketWorld {
  x: number;
  y: number;
  angle: number;
  flipped: boolean;
}

/** Що можна прикріпити в гніздо: будь-який об'єкт Phaser з місцем і кутом (зображення, контейнер, інший скелет). */
export type Attachable = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform;

/** Зображення слота й те, що воно показує. */
interface SlotView {
  image: Phaser.GameObjects.Image | null;
  /** Базовий масштаб кадру (1 одиниця арту = 1 px світу), без пози. */
  baseX: number;
  baseY: number;
  /** Показаний запис, стан і ракурс: зміна будь-чого — новий кадр. */
  art: ArtId | null;
  state: string | null;
  view: ArtView | null;
  /** Що показує зображення: кадр атласу, текстуру ззовні чи запечений кадр (`bake.ts`). */
  kind: "atlas" | "custom" | "baked";
  /** Текстура, закріплена `setSlotTexture`. */
  pinned: SlotTexture | null;
}

const DEG = Math.PI / 180;

export class RigSprite<B extends string, S extends string, K extends string> extends Phaser.GameObjects.Container {
  /** Поза скелета (`rigcore.ts`): ракурс, обвіс, пропорції, анімація, кістки, слоти, якорі й гнізда. */
  readonly rig: Rig<B, S, K>;

  private readonly lookup: ArtLookup;
  private layerName: FrameLayer | undefined;
  private source: SlotTextureSource<S> | null;
  private baked: RigBaked<S> | null;
  private readonly views: SlotView[];
  /** Прикріплене за індексом гнізда (`rig.socketIds`). */
  private readonly cargo: (Attachable | null)[];
  private appliedOrder = -1;
  private orderDirty = true;
  /** Час останнього `update`, мс: від нього починається `play`. */
  private now: number;

  private readonly matrix = new Phaser.GameObjects.Components.TransformMatrix();
  private readonly parentMatrix = new Phaser.GameObjects.Components.TransformMatrix();
  private readonly tmp: Vec2 = { x: 0, y: 0 };
  private readonly tmpA: Vec2 = { x: 0, y: 0 };
  private readonly tmpB: Vec2 = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene, def: RigDef<B, S, K>, opts: RigSpriteOptions<B, S, K> = {}) {
    super(scene, 0, 0);
    this.lookup = opts.lookup ?? artEntry;
    this.layerName = opts.layer;
    this.source = opts.textures ?? null;
    this.baked = opts.baked ?? null;
    this.rig = new Rig(def, { fit: opts.fit, lookup: this.lookup, skin: opts.skin, facing: opts.facing, proportions: opts.proportions });
    this.views = this.rig.slots.map(() => ({ image: null, baseX: 1, baseY: 1, art: null, state: null, view: null, kind: "atlas", pinned: null }));
    this.cargo = this.rig.socketIds.map(() => null);
    this.now = scene.time.now;
    this.update(this.now);
  }

  /** Ракурс і віддзеркалення зараз. */
  get facing(): Readonly<RigFacing> {
    return this.rig.facing;
  }

  /** Анімація, що грає (null — вихідна поза). */
  get anim(): RigAnim<B, S> | null {
    return this.rig.anim;
  }

  /**
   * Грати анімацію від часу останнього `update` (null — вихідна поза); `loop`, `from` (з якого моменту анімації, мс),
   * `blend` (мс змішування), `restart` — як у `Rig.play`.
   */
  play(anim: RigAnim<B, S> | null, opts: PlayOptions = {}): this {
    this.rig.play(anim, this.now, opts);
    return this;
  }

  /** Вихідна поза ракурсу. */
  stop(): this {
    return this.play(null);
  }

  /** Разова анімація дійшла до кінця (час — останнього `update`). */
  done(): boolean {
    return this.rig.done(this.now);
  }

  setFacing(facing: Partial<RigFacing>): this {
    this.rig.setFacing(facing);
    this.applyFlip();
    return this;
  }

  /** Замінити частину обвісу: новий кадр слоти отримають у наступному `update`. */
  setSkin(skin: Partial<RigSkin<S>>): this {
    this.rig.setSkin(skin);
    return this;
  }

  setProportions(list: readonly ProportionRef[]): this {
    this.rig.setProportions(list);
    return this;
  }

  /** Шар записів із шарами, поки компонувальника немає (`RigSpriteOptions.layer`). */
  setLayer(layer: FrameLayer | undefined): this {
    this.layerName = layer;
    return this.refreshTextures();
  }

  /**
   * Закріпити за слотом текстуру ззовні (запечений `CanvasTexture` компонувальника) — незалежно від стану й ракурсу;
   * null — знову кадр атласу (чи `setTextureSource`).
   */
  setSlotTexture(slot: S, key: string | null, frame?: string | number): this {
    const view = this.views[this.slotIndex(slot)];
    if (view) {
      view.pinned = key === null ? null : { key, frame };
      view.art = null;
    }
    return this;
  }

  /** Текстури всіх слотів ззовні за кадром (див. `SlotTextureSource`); null — кадри атласу. */
  setTextureSource(source: SlotTextureSource<S> | null): this {
    this.source = source;
    return this.refreshTextures();
  }

  /**
   * Запечені кадри записів із шарами за рецептом (див. `RigBaked`); null — кадри атласу. Новий рецепт (тьмяна шерсть,
   * плями на одязі) — кадри перезапікаються в наступному `update`.
   */
  setBaked(baked: RigBaked<S> | null): this {
    this.baked = baked;
    return this.refreshTextures();
  }

  /** Заново вибрати кадри всіх слотів у наступному `update` (атлас перезавантажено, джерело текстур змінилося). */
  refreshTextures(): this {
    for (const view of this.views) view.art = null;
    return this;
  }

  /**
   * Порахувати позу в момент `now` (мс; за замовчуванням — час сцени) і поставити зображення слотів і прикріплене в
   * гнізда. Кликати щокадру.
   */
  override update(now?: number): this {
    const scene = this.scene as Phaser.Scene | undefined;
    if (!scene) return this;
    this.now = now ?? scene.time.now;
    const rig = this.rig.evaluate(this.now);
    this.applyFlip();
    const view = rig.facing.view;
    for (let i = 0; i < rig.slots.length; i++) {
      const pose = rig.slots[i]!;
      const slot = this.views[i]!;
      if (!pose.visible || pose.art === null) {
        slot.image?.setVisible(false);
        continue;
      }
      const image = this.frameFor(i, pose.art, pose.state, view);
      image.setVisible(true);
      image.setPosition(pose.x, pose.y);
      image.setAngle(pose.rot);
      image.setScale(slot.baseX * pose.sx, slot.baseY * pose.sy);
    }
    for (let i = 0; i < this.cargo.length; i++) {
      const obj = this.cargo[i];
      if (!obj) continue;
      if (!obj.scene) {
        // Прикріплене знищили ззовні.
        this.cargo[i] = null;
        continue;
      }
      const socket = rig.socketAt(i);
      if (socket) {
        obj.setPosition(socket.x, socket.y);
        obj.setAngle(socket.rot);
      }
    }
    if (this.orderDirty || rig.orderVersion !== this.appliedOrder) this.reorder();
    return this;
  }

  /** Якір у світі (за позою останнього `update`); якоря в скелеті немає — null. */
  anchor(name: RigAnchor, out: Vec2 = { x: 0, y: 0 }): Vec2 | null {
    const p = this.rig.anchor(name, this.tmp, false);
    if (!p) return null;
    return this.toWorld(p.x, p.y, out);
  }

  /** Гніздо у світі (за позою останнього `update`): місце, кут і чи віддзеркалено; гнізда немає — null. */
  socket(name: K, out: SocketWorld = { x: 0, y: 0, angle: 0, flipped: false }): SocketWorld | null {
    const socket = this.rig.socketAt(this.rig.socketIndexOf(name));
    if (!socket) return null;
    const m = this.getWorldTransformMatrix(this.matrix, this.parentMatrix);
    const a = this.toWorld(socket.x, socket.y, this.tmpA);
    const b = this.toWorld(socket.x + Math.cos(socket.rot * DEG), socket.y + Math.sin(socket.rot * DEG), this.tmpB);
    out.x = a.x;
    out.y = a.y;
    out.angle = Math.atan2(b.y - a.y, b.x - a.x) / DEG;
    out.flipped = m.a * m.d - m.b * m.c < 0;
    return out;
  }

  /**
   * Прикріпити об'єкт у гніздо: він стає дитиною контейнера, щокадру стає в місце й кут гнізда й малюється між слотами за
   * його z (масштаб — свій). Те, що вже було в гнізді, відчіплюється.
   */
  attach(socket: K, obj: Attachable): this {
    const index = this.rig.socketIndexOf(socket);
    if (index < 0) throw new Error(`Скелет «${this.rig.def.id}»: гнізда «${socket}» немає`);
    const prev = this.cargo[index];
    if (prev === obj) return this;
    if (prev) this.detach(prev);
    for (let i = 0; i < this.cargo.length; i++) if (this.cargo[i] === obj) this.cargo[i] = null;
    if (!this.exists(obj)) this.add(obj);
    this.cargo[index] = obj;
    this.orderDirty = true;
    const pose = this.rig.socketAt(index);
    if (pose) {
      obj.setPosition(pose.x, pose.y);
      obj.setAngle(pose.rot);
    }
    return this;
  }

  /** Відчепити об'єкт (чи вміст гнізда): він повертається на сцену (`Container.remove`); куди далі — справа того, хто кличе. */
  detach(target: Attachable | K): Attachable | null {
    const index = typeof target === "string" ? this.rig.socketIndexOf(target) : this.cargo.indexOf(target);
    const obj = this.cargo[index];
    if (!obj) return null;
    this.cargo[index] = null;
    this.remove(obj);
    obj.setAngle(0);
    return obj;
  }

  /** Що зараз у гнізді. */
  attached(socket: K): Attachable | null {
    return this.cargo[this.rig.socketIndexOf(socket)] ?? null;
  }

  /** Знищити скелет; прикріплене не знищується — його відчеплено й повернено на сцену. */
  override destroy(fromScene?: boolean): void {
    for (const obj of this.cargo) if (obj) this.detach(obj);
    super.destroy(fromScene);
  }

  // --- Усередині ---

  private slotIndex(slot: S): number {
    return this.rig.slots.findIndex((pose) => pose.id === slot);
  }

  private applyFlip(): void {
    const size = Math.abs(this.scaleX) || 1;
    const want = this.rig.facing.flip ? -size : size;
    if (this.scaleX !== want) this.scaleX = want;
  }

  private toWorld(x: number, y: number, out: Vec2): Vec2 {
    const m = this.getWorldTransformMatrix(this.matrix, this.parentMatrix);
    out.x = m.a * x + m.c * y + m.e;
    out.y = m.b * x + m.d * y + m.f;
    return out;
  }

  /** Шар, який показувати в записі (`layer` для записів із шарами; інакше — `all`). */
  private layerFor(entry: ArtEntry | undefined): FrameLayer | undefined {
    const layer = this.layerName;
    if (!layer || layer === "all" || !entry?.layers) return undefined;
    return (entry.layers as readonly string[]).includes(layer) ? layer : undefined;
  }

  /** Зображення слота з потрібним кадром: нове чи те саме з новим кадром, лише коли кадр змінився. */
  private frameFor(i: number, art: ArtId, state: string | null, view: ArtView): Phaser.GameObjects.Image {
    const slot = this.views[i]!;
    if (slot.image && slot.art === art && slot.state === state && slot.view === view) return slot.image;
    slot.art = art;
    slot.state = state;
    slot.view = view;
    const entry = this.lookup(art);
    const frame = slotFrame(art, entry, state, view);
    const custom = slot.pinned ?? this.source?.(this.rig.slots[i]!.id as S, frame) ?? null;
    if (custom) {
      let image = slot.image;
      if (image && slot.kind === "baked") {
        // Запечений кадр не перетекстуровувати повз `setBakedArt` — нове зображення.
        this.remove(image, true);
        image = null;
      }
      if (!image) {
        image = new Phaser.GameObjects.Image(this.scene, 0, 0, custom.key, custom.frame);
        this.add(image);
        slot.image = image;
        this.orderDirty = true;
      } else {
        image.setTexture(custom.key, custom.frame);
      }
      const px = { w: image.frame.realWidth, h: image.frame.realHeight };
      const placement = artPlacement(artGeometry(entry, undefined, { px, res: entry?.res ?? DEFAULT_RES }), px);
      image.setOrigin(placement.originX, placement.originY);
      slot.baseX = placement.scaleX;
      slot.baseY = placement.scaleY;
      slot.kind = "custom";
      return image;
    }
    const baked = this.baked;
    if (baked && entry?.layers) {
      const recipe = typeof baked.recipe === "function" ? baked.recipe(this.rig.slots[i]!.id as S) : baked.recipe;
      const opts = { state: frame.state, view: frame.view, owner: baked.owner };
      if (!slot.image || slot.kind !== "baked") {
        // Нове зображення: `setBakedArt` веде облік показаних кадрів лише для своїх зображень.
        if (slot.image) this.remove(slot.image, true);
        slot.image = addBakedArt(this.scene, this, art, recipe, opts);
        slot.kind = "baked";
        this.orderDirty = true;
      } else {
        slot.image.setScale(slot.baseX, slot.baseY);
        setBakedArt(slot.image, art, recipe, opts);
      }
      slot.baseX = slot.image.scaleX;
      slot.baseY = slot.image.scaleY;
      return slot.image;
    }
    const opts = { state: frame.state, view: frame.view, layer: this.layerFor(entry) };
    if (!slot.image || slot.kind !== "atlas") {
      // Зображення під текстурою ззовні чи запеченим кадром — нове: `setArt` не знає, що текстуру міняли повз нього.
      if (slot.image) this.remove(slot.image, true);
      slot.image = addArt(this.scene, this, art, opts);
      slot.kind = "atlas";
      this.orderDirty = true;
    } else {
      slot.image.setScale(slot.baseX, slot.baseY);
      setArt(slot.image, art, opts);
    }
    slot.baseX = slot.image.scaleX;
    slot.baseY = slot.image.scaleY;
    return slot.image;
  }

  /** Переставити зображення й прикріплене за порядком z (`rig.order`); чужі діти (накладка галереї) лишаються зверху. */
  private reorder(): void {
    let k = 0;
    for (const item of this.rig.order) {
      const obj = item.kind === "slot" ? this.views[item.index]?.image : this.cargo[item.index];
      if (!obj) continue;
      if (this.getIndex(obj) !== k) this.moveTo(obj, k);
      k++;
    }
    this.appliedOrder = this.rig.orderVersion;
    this.orderDirty = false;
  }
}

/** Скелет у Phaser для визначення `R`. */
export type RigSpriteOf<R extends AnyRig> = RigSprite<BoneOf<R>, SlotOf<R>, SocketOf<R>>;
