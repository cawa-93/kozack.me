// Один кіт ізометричного вигляду (крок 16, T1): скелет (`RigSprite` зі скелетом `ISO_CAT_RIG`) із запеченими частинами
// його шерсті й форм породи, тінь під ним, річ у зубах, а коли кота видно лише частково (під меблями, у будиночку, під
// ковдрою) — лише очі, вушка й кінчик хвоста. Що грати, куди дивитися й де стояти, вирішує частина котів (`cats.ts`), тут —
// лише як це показати. Глибина — точка в реєстрі (`iso/depth.ts`).
//
// Щокадру тут нічого не створюється: обвіс, пропорції, рецепт шерсті й анімація змінюються, лише коли змінилося те, від чого
// вони залежать (порівнянням полів, без рядків-ключів), а точки голови й спинки пишуться в ті самі об'єкти.

import Phaser from "phaser";

import type { Cat, Quality, Shape } from "../../sim/types";
import type { CatEars, CatFace } from "../anim/catface";
import type { CatAnimId } from "../anim/ids";
import { addArt, setArt } from "../art/atlas";
import { addBakedArt, bakedFrame, catOwner, releaseBaked, setBakedArt } from "../art/bake";
import { artEntry } from "../art/manifest";
import { catRecipeOf, farRecipe } from "../art/recipes";
import type { ArtId, ArtView, TintRecipe } from "../art/types";
import { CAT_ANIMS } from "../rig/anims";
import { BLEND_MS } from "../rig/rigcore";
import { RigSprite, type RigBaked, type SocketWorld } from "../rig/rigsprite";
import type { RigAnim, RigFacing, Vec2 } from "../rig/types";
import type { Point } from "../world/part";
import { composeCatAnim } from "./catanim";
import { CAT_FAR_SLOTS, fatStep, ISO_CAT_FIT, ISO_CAT_RIG, isoCatSkin, proportionsOf, type IsoCatBone, type IsoCatSlot, type IsoCatSocket } from "./catrig";
import { CAT_PIECE, type CatShow } from "./catspot";
import { ISO_DEPTH_SLOT, type IsoPointHandle } from "./depth";

export type IsoCatSprite = RigSprite<IsoCatBone, IsoCatSlot, IsoCatSocket>;
type CatRigAnim = RigAnim<IsoCatBone, IsoCatSlot>;

/**
 * Тінь під котом: на скільки ширша, коли під меблями видно лише очі, і скільки разів вона лежить одна на одній — темна
 * щілина під меблями. Тінь арту — `SHADE.base` (0,3, `STYLE.md` §3), дві поспіль — ≈ 0,51, тобто `SHADE.deep` (0,5): щілина
 * помітно темніша за тінь під лапами, як і в старому вигляді (там 0,55 проти 0,22).
 */
const GAP_SHADOW = { scale: 1.1, layers: 2 } as const;

/** Очі з-під меблів і з будиночка — на такій висоті над підлогою (одиниці арту), кінчик хвоста — збоку від очей. */
const PEEK = { eyes: 7, tailSide: 20, tailUp: 2, tailWindow: 9, earSpread: 7, earTilt: 18 } as const;

/** Над котом, якого не рахували (за краєм камери), одиниці арту: верх вух дорослого ≈ 56 і запас, як у якоря `head`. */
const CULLED_HEAD = 64;

/**
 * Полотно фільтрів кота (сяйво підсвітки), одиниці арту скелета, посередині — корінь: дорослий кіт заввишки до ≈ 90 і
 * завдовжки ≈ 80 уміщається з запасом (масштаб кота множить і полотно).
 */
const FILTER_BOX = { w: 180, h: 200 } as const;

/** Як часто перевіряти, чи не змінилася шерсть (глисти, дерматит, нашийник), мс: щокадру це зайве — хвороби тривають дні. */
const RECIPE_CHECK_MS = 500;

/** Що зараз показує кіт: анімація (основна й накладка — до складання з обличчям) і звідки рахується її час. */
interface Playing {
  base: CatRigAnim;
  overlay: CatRigAnim | null;
  eyes: string;
  mouth: string;
  ears: CatEars;
  anim: CatRigAnim;
  /** Годинник кота, коли почалася основна: від нього — фаза складеної анімації. */
  start: number;
}

/** Що кадр каже котові. Частина котів тримає один такий об'єкт і переписує його щокадру. */
export interface CatFrame {
  /** Основна анімація й накладка (`catAnim` чи разова). */
  anim: CatAnimId;
  overlay: CatAnimId | null;
  /** Почати основну заново (разова щойно почалася). */
  restart: boolean;
  /** Швидкість анімації (хода — за швидкістю кота). */
  speed: number;
  face: CatFace;
  facing: RigFacing;
  /** Корінь скелета на екрані (точка підлоги під котом, піднята на висоту меблів і дуги стрибка), px світу. */
  root: Point;
  /** Поверхня під котом (підлога чи верх меблів, без дуги стрибка): там тінь, px світу. */
  ground: Point;
  /** Масштаб усього кота (кошеня, порода, клубочок у барабані). */
  scale: number;
  /** Вага пропорцій кошеняти (`CatSize.kitten`). */
  kitten: number;
  pregnant: boolean;
  /** Обхват (`girthOf`): тінь ширша, тулуб — пропорції `fat`. */
  girth: number;
  show: CatShow;
  /** Ховається під меблями: з-під краю визирають очі й кінчик хвоста, під ними — темна щілина (з будиночка — лише очі). */
  under: boolean;
  shadow: boolean;
  /** Річ у зубах: іграшка якості, шкарпетка; null — нічого. */
  teeth: { kind: "toy"; quality: Quality } | { kind: "sock" } | null;
  /** Кіт далеко за краєм камери: скелет не рахувати й не малювати (місце, глибина й точки — як завжди). */
  culled: boolean;
  /** Час сцени, мс. */
  time: number;
}

/** Форми породи й вагітність, з яких зібрано обвіс (`isoCatSkin`). */
type SkinInputs = Pick<Shape, "muzzle" | "ears" | "tail" | "build" | "legs"> & { pregnant: boolean };

export class IsoCatView {
  readonly sprite: IsoCatSprite;
  readonly point: IsoPointHandle;
  /** Остання глибина точки (NaN — ще не було розв'язку). */
  depth = Number.NaN;

  private readonly shadow: Phaser.GameObjects.Image;
  private readonly shadowBase: Vec2;
  /** Другий шар тіні — темна щілина під меблями (`GAP_SHADOW`); створюється, коли кіт уперше ховається. */
  private gapShadow: Phaser.GameObjects.Image | null = null;
  /** Що в зубах (кадр атласу в гнізді `teeth`). */
  private teethImage: Phaser.GameObjects.Image | null = null;
  private teethKey = "";
  /** Що визирає, коли самого кота не видно: очі, вушка, кінчик хвоста. */
  private peekEyes: Phaser.GameObjects.Image | null = null;
  private peekTail: Phaser.GameObjects.Image | null = null;
  private peekEars: Phaser.GameObjects.Image[] = [];

  /** Кіт, якого показує вигляд (той самий id; об'єкт стану може бути новим). */
  private cat: Cat;
  private readonly owner: string;
  private recipe: TintRecipe;
  private far: TintRecipe;
  private recipeCheck = Number.NEGATIVE_INFINITY;
  private skin: SkinInputs | null = null;
  /** З чого зібрано пропорції: крок повноти, вага кошеняти, статура й лапи (−1 — ще не збирали). */
  private props = { fat: -1, kitten: -1, build: "", legs: "" };
  private playing: Playing | null = null;
  /** Власний годинник кота, мс: іде зі швидкістю анімації (хода кульгавого повільніша). */
  private clock = 0;
  private lastTime: number | null = null;
  private lastShow: CatShow = "rig";
  private lastFacing: RigFacing = { view: "front", flip: false };
  private readonly backSocket: SocketWorld = { x: 0, y: 0, angle: 0, flipped: false };

  /** Над головою (бабли, пір'їнка вудки) і спинка (рука, що гладить), px світу. */
  readonly head: Point = { x: 0, y: 0 };
  readonly back: Point = { x: 0, y: 0 };
  /** Де кіт на екрані зараз (корінь скелета) і його масштаб: для підсвітки й хмари бійки. */
  readonly root: Point = { x: 0, y: 0 };
  scale = 1;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
    cat: Cat,
    addPoint: (setDepth: (depth: number) => void) => IsoPointHandle,
  ) {
    this.cat = cat;
    this.owner = catOwner(cat.id);
    this.recipe = catRecipeOf(cat);
    this.far = farRecipe(this.recipe);
    const baked: RigBaked<IsoCatSlot> = { recipe: (slot) => ((CAT_FAR_SLOTS as readonly string[]).includes(slot) ? this.far : this.recipe), owner: this.owner };
    this.sprite = new RigSprite(scene, ISO_CAT_RIG, { fit: ISO_CAT_FIT, skin: isoCatSkin(cat.shape, false), baked });
    // Розмір контейнера — для фільтрів (сяйво підсвітки, `cats.ts`): з ним Phaser 4 малює кота в полотно довкола нього самого.
    // Без розміру фільтр бере всю камеру й зсуває кота вгору на відступ видової області камери під панеллю (`cam.y` × зум).
    this.sprite.setSize(FILTER_BOX.w, FILTER_BOX.h);
    layer.add(this.sprite);
    this.shadow = addArt(scene, layer, "fx/shadow/cat");
    this.shadowBase = { x: this.shadow.scaleX, y: this.shadow.scaleY };
    this.point = addPoint((depth) => this.applyDepth(depth));
  }

  /** Кадр: позу, обличчя, ракурс, місце й те, що видно. */
  draw(cat: Cat, f: CatFrame): void {
    const dt = this.lastTime === null ? 0 : Math.max(0, f.time - this.lastTime);
    this.lastTime = f.time;
    this.clock += dt * f.speed;
    this.updateRecipe(cat, f.time);
    this.cat = cat;
    this.updateSkin(cat.shape, f.pregnant);
    this.updateProportions(cat.shape, f.kitten, f.girth);
    this.root.x = f.root.x;
    this.root.y = f.root.y;
    this.scale = f.scale;

    const visible = f.show === "rig" && !f.culled;
    this.sprite.setVisible(visible);
    this.sprite.setScale(f.scale);
    this.sprite.setPosition(f.root.x, f.root.y);
    this.sprite.setFacing(f.facing);
    this.lastFacing = f.facing;
    this.play(f);
    // Невидимий скелет (видно лише очі чи вушка) не рахувати: з десятками котів це головна робота кадру.
    if (visible) this.sprite.update(this.clock);
    this.updateTeeth(f.teeth, visible);

    // Тінь: на поверхні під лапами (у стрибку — не злітає з котом), ширша в повного; під меблями — темна щілина, з якої
    // визирають очі.
    const gap = f.under && !f.culled;
    this.shadow.setVisible((f.shadow && visible) || gap);
    if (this.shadow.visible) {
      const k = f.scale * (gap ? GAP_SHADOW.scale : 1);
      this.shadow.setPosition(f.ground.x, f.ground.y).setScale(this.shadowBase.x * k * f.girth, this.shadowBase.y * k);
    }
    if (gap && !this.gapShadow) {
      this.gapShadow = addArt(this.scene, this.layer, "fx/shadow/cat");
      this.gapShadow.setDepth(this.pieceDepth(CAT_PIECE.shadow));
    }
    if (this.gapShadow) {
      this.gapShadow.setVisible(gap && GAP_SHADOW.layers > 1);
      if (this.gapShadow.visible) this.gapShadow.setPosition(this.shadow.x, this.shadow.y).setScale(this.shadow.scaleX, this.shadow.scaleY);
    }
    this.drawPeek(f);
    this.updatePoints(f, visible);
    this.lastShow = f.show;
  }

  /** Кота не видно (поїздка, сходи): нічого не малювати. */
  hide(): void {
    this.sprite.setVisible(false);
    this.shadow.setVisible(false);
    this.gapShadow?.setVisible(false);
    this.teethImage?.setVisible(false);
    this.peekEyes?.setVisible(false);
    this.peekTail?.setVisible(false);
    for (const ear of this.peekEars) ear.setVisible(false);
    this.point.hide();
    this.lastShow = "none";
  }

  /** Чи кота зараз видно (хоч очі). */
  get shown(): boolean {
    return this.lastShow !== "none";
  }

  /** Чи видно сам скелет (а не лише очі чи вушка). */
  get rigShown(): boolean {
    return this.lastShow === "rig";
  }

  destroy(): void {
    this.point.remove();
    this.sprite.destroy();
    this.shadow.destroy();
    this.gapShadow?.destroy();
    this.teethImage?.destroy();
    this.peekEyes?.destroy();
    this.peekTail?.destroy();
    for (const ear of this.peekEars) ear.destroy();
    releaseBaked(this.scene, this.owner);
  }

  /** Глибина шматка кота (поки розв'язку ще не було — від нуля). */
  private pieceDepth(piece: number): number {
    return (Number.isNaN(this.depth) ? 0 : this.depth) + piece;
  }

  /** Глибина від реєстру: тінь, скелет, те, що визирає, — у проміжку точки. */
  private applyDepth(depth: number): void {
    this.depth = depth;
    this.shadow.setDepth(depth + CAT_PIECE.shadow);
    this.gapShadow?.setDepth(depth + CAT_PIECE.shadow);
    this.sprite.setDepth(depth + CAT_PIECE.body);
    this.peekEyes?.setDepth(depth + CAT_PIECE.peek);
    this.peekTail?.setDepth(depth + CAT_PIECE.peek);
    for (const ear of this.peekEars) ear.setDepth(depth + CAT_PIECE.peek);
  }

  /**
   * Шерсть змінилася (глисти, дерматит, нашийник): запекти частини заново. Перевіряється раз на `RECIPE_CHECK_MS` і коли
   * об'єкт кота новий (завантаження, сценарій).
   */
  private updateRecipe(cat: Cat, time: number): void {
    if (cat === this.cat && time - this.recipeCheck < RECIPE_CHECK_MS) return;
    this.recipeCheck = time;
    const recipe = catRecipeOf(cat);
    if (recipe === this.recipe) return;
    const changed = recipe.key !== this.recipe.key;
    this.recipe = recipe;
    this.far = farRecipe(recipe);
    if (changed) this.sprite.refreshTextures();
  }

  /** Обвіс: форми породи й живіт вагітної. */
  private updateSkin(shape: Shape, pregnant: boolean): void {
    const s = this.skin;
    if (s && s.muzzle === shape.muzzle && s.ears === shape.ears && s.tail === shape.tail && s.build === shape.build && s.legs === shape.legs && s.pregnant === pregnant) return;
    this.skin = { muzzle: shape.muzzle, ears: shape.ears, tail: shape.tail, build: shape.build, legs: shape.legs, pregnant };
    this.sprite.setSkin(isoCatSkin(shape, pregnant));
  }

  /** Пропорції скелета: короткі лапи, статура, кошеня, повнота. */
  private updateProportions(shape: Shape, kitten: number, girth: number): void {
    const fat = fatStep(girth);
    const p = this.props;
    if (p.fat === fat && p.kitten === kitten && p.build === shape.build && p.legs === shape.legs) return;
    p.fat = fat;
    p.kitten = kitten;
    p.build = shape.build;
    p.legs = shape.legs;
    this.sprite.setProportions(proportionsOf(shape, kitten, fat));
  }

  /**
   * Грати складену анімацію (основна, накладка, обличчя). Та сама основна й накладка, інше лише обличчя — фаза та сама й
   * без змішування (кліпання міняє очі кілька разів на секунду), лише вуха — з коротким змішуванням; інша основна — від
   * початку зі змішуванням поз.
   */
  private play(f: CatFrame): void {
    const base = CAT_ANIMS[f.anim] as CatRigAnim;
    const overlay = f.overlay ? (CAT_ANIMS[f.overlay] as CatRigAnim) : null;
    const face = f.face;
    const prev = this.playing;
    if (prev && !f.restart && prev.base === base && prev.overlay === overlay && prev.eyes === face.eyes && prev.mouth === face.mouth && prev.ears === face.ears) return;
    const anim = composeCatAnim(base, overlay, face) as CatRigAnim;
    const sameBase = prev !== null && !f.restart && prev.base === base;
    const start = sameBase ? prev.start : this.clock;
    const elapsed = this.clock - start;
    const from = anim.loop ? elapsed % anim.duration : Math.min(anim.duration, elapsed);
    const sameMotion = sameBase && prev.overlay === overlay;
    const earsMoved = prev !== null && prev.ears !== face.ears;
    const blend = sameMotion ? (earsMoved ? BLEND_MS : 0) : BLEND_MS;
    this.sprite.play(anim, { from, blend, restart: f.restart || !sameMotion });
    if (prev) {
      prev.base = base;
      prev.overlay = overlay;
      prev.eyes = face.eyes;
      prev.mouth = face.mouth;
      prev.ears = face.ears;
      prev.anim = anim;
      prev.start = start;
    } else {
      this.playing = { base, overlay, eyes: face.eyes, mouth: face.mouth, ears: face.ears, anim, start };
    }
  }

  /** Іграшка чи шкарпетка в зубах (§9.12, «Подарунки й схованки»): кадр у гнізді `teeth`. */
  private updateTeeth(teeth: CatFrame["teeth"], visible: boolean): void {
    if (!teeth) {
      this.teethImage?.setVisible(false);
      return;
    }
    const id: ArtId = teeth.kind === "sock" ? "mess/sock" : `item/toy/${teeth.quality}`;
    const state = teeth.kind === "sock" ? "carried" : "teeth";
    if (!this.teethImage) {
      this.teethImage = addArt(this.scene, null, id, { state });
      this.sprite.attach("teeth", this.teethImage);
      this.teethKey = id;
    } else if (id !== this.teethKey) {
      setArt(this.teethImage, id, { state });
      this.teethKey = id;
    }
    this.teethImage.setVisible(visible);
  }

  /**
   * Що визирає (`CatShow`): з-під меблів і з будиночка — очі (стан — з обличчя) і, з-під меблів, кінчик хвоста; з-під
   * ковдри — вушка й кінчик хвоста. Частини запечені тим самим рецептом, що й кіт.
   */
  private drawPeek(f: CatFrame): void {
    const eyes = f.show === "eyes" && !f.culled;
    const ears = f.show === "ears" && !f.culled;
    const owner = this.owner;
    const view: ArtView = "front";
    const s = f.scale;
    if (eyes) {
      const state = f.face.eyes;
      if (!this.peekEyes) {
        this.peekEyes = addBakedArt(this.scene, this.layer, "cat/eyes", this.recipe, { state, view, owner });
        this.peekEyes.setDepth(this.pieceDepth(CAT_PIECE.peek));
      } else {
        setBakedArt(this.peekEyes, "cat/eyes", this.recipe, { state, view, owner });
      }
      this.peekEyes.setVisible(true).setPosition(f.root.x, f.root.y - PEEK.eyes * s);
      this.peekEyes.setScale(this.baseScale(this.peekEyes) * s, this.baseScale(this.peekEyes, "y") * s);
    } else {
      this.peekEyes?.setVisible(false);
    }
    // Кінчик хвоста: з-під меблів — збоку від очей, з-під ковдри — з протилежного від вушок краю горбика.
    const tailArt = this.sprite.rig.skin.tail;
    const tail = ((eyes && f.under) || ears) && this.cat.shape.tail !== "none";
    if (tail && tailArt) {
      if (!this.peekTail) {
        this.peekTail = addBakedArt(this.scene, this.layer, tailArt, this.recipe, { view, owner });
        this.peekTail.setDepth(this.pieceDepth(CAT_PIECE.peek));
      } else {
        setBakedArt(this.peekTail, tailArt, this.recipe, { view, owner });
      }
      const side = f.facing.flip ? 1 : -1;
      const x = f.root.x + side * PEEK.tailSide * s;
      const y = f.root.y - (ears ? 0 : PEEK.tailUp) * s;
      this.cropTailTip(this.peekTail, tailArt);
      this.peekTail.setVisible(true).setPosition(x, y);
      const base = this.baseScale(this.peekTail);
      this.peekTail.setScale(base * s * (f.facing.flip ? -1 : 1), this.baseScale(this.peekTail, "y") * s);
    } else {
      this.peekTail?.setVisible(false);
    }
    // Вушка з-під ковдри: обидва, трохи розведені.
    const earArt = this.sprite.rig.skin["ear-near"];
    if (ears && earArt) {
      while (this.peekEars.length < 2) {
        const image = addBakedArt(this.scene, this.layer, earArt, this.recipe, { view, owner });
        image.setDepth(this.pieceDepth(CAT_PIECE.peek));
        this.peekEars.push(image);
      }
      for (let i = 0; i < this.peekEars.length; i++) {
        const image = this.peekEars[i]!;
        setBakedArt(image, earArt, i === 0 ? this.far : this.recipe, { view, owner });
        const side = i === 0 ? 1 : -1;
        const dir = f.facing.flip ? -1 : 1;
        image
          .setVisible(true)
          .setPosition(f.root.x + side * dir * PEEK.earSpread * s, f.root.y - 2 * s)
          .setAngle(side * dir * PEEK.earTilt)
          .setScale(this.baseScale(image) * s * 0.85, this.baseScale(image, "y") * s * 0.85);
      }
    } else {
      for (const image of this.peekEars) image.setVisible(false);
    }
  }

  /** Базовий масштаб запеченого кадру (1 одиниця арту = 1 px світу): з розміру полотна. */
  private baseScale(image: Phaser.GameObjects.Image, axis: "x" | "y" = "x"): number {
    const baked = bakedFrame(this.scene, image.texture.key);
    if (!baked) return 1;
    return axis === "x" ? baked.geometry.size.w / baked.px.w : baked.geometry.size.h / baked.px.h;
  }

  /** Лишити від кадру хвоста лише кінчик (`tip` маніфесту, інакше — верх полотна). */
  private cropTailTip(image: Phaser.GameObjects.Image, art: ArtId): void {
    const baked = bakedFrame(this.scene, image.texture.key);
    const entry = artEntry(art);
    if (!baked || !entry) return;
    const k = baked.px.w / baked.geometry.size.w;
    const tip = entry.points?.tip ?? { x: entry.pivot.x, y: Math.min(entry.size.h / 4, entry.pivot.y) };
    const half = PEEK.tailWindow;
    const x = Math.max(0, (tip.x - half) * k);
    const y = Math.max(0, (tip.y - half) * k);
    image.setCrop(x, y, half * 2 * k, half * 2.4 * k);
    // Кадр обрізано — pivot кінчика, щоб кінчик стояв у точці, а не весь хвіст.
    image.setOrigin(tip.x / entry.size.w, (tip.y + half) / entry.size.h);
  }

  /** Точки для інших частин: над головою й спинка (з видимого скелета; інакше — над очима чи вушками). */
  private updatePoints(f: CatFrame, evaluated: boolean): void {
    // Якір і гніздо пишуть просто в точки (немає — точка лишається, як була).
    if (f.show === "rig" && evaluated) {
      this.sprite.anchor("head", this.head);
      const back = this.sprite.socket("pet", this.backSocket);
      if (back) {
        this.back.x = back.x;
        this.back.y = back.y;
      }
      return;
    }
    this.head.x = f.root.x;
    // Скелет не рахували (кіт за краєм камери) — над ним, як над дорослим котом заввишки ≈ 56.
    this.head.y = f.root.y - (f.show === "rig" ? CULLED_HEAD : PEEK.eyes + 22) * f.scale;
    this.back.x = f.root.x;
    this.back.y = f.root.y - PEEK.eyes * f.scale;
  }

  /** Ракурс, у якому кота показано зараз. */
  get facing(): RigFacing {
    return this.lastFacing;
  }

  /** Чи точка має глибину (розв'язок уже був). */
  get placed(): boolean {
    return !Number.isNaN(this.depth);
  }

  /** Півпроміжку глибини: над цим — те, що «над» котом. */
  static readonly ABOVE = ISO_DEPTH_SLOT / 2;
}
