// Один кіт ізометричного вигляду (крок 16, T1): скелет (`RigSprite` зі скелетом `ISO_CAT_RIG`) із запеченими частинами
// його шерсті й форм породи, тінь під ним, річ у зубах, а в будиночку — лише очі й кінчик хвоста. Під ковдрою й під меблями
// кота показує скелет: анімації `blanket` і `peek` лишають видимими лише вушка й кінчик хвоста чи голову. Що грати, куди дивитися й де стояти, вирішує частина котів (`cats.ts`), тут —
// лише як це показати. Глибина — точка в реєстрі (`iso/depth.ts`).
//
// Видимий кіт щокадру нових об'єктів не створює: обвіс, пропорції, рецепт шерсті й анімація змінюються, лише коли змінилося
// те, від чого вони залежать (порівнянням полів, без рядків-ключів), а точки голови й спинки пишуться в ті самі об'єкти. Що
// визирає (очі й кінчик хвоста схованого кота), просить кадр щокадру — це кілька котів, а не два десятки.

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
import { catPetPoint } from "../rig/anims/cat/basic";
import { RigSprite, type RigBaked, type SocketWorld } from "../rig/rigsprite";
import type { RigAnim, RigFacing, Vec2 } from "../rig/types";
import type { Point } from "../world/part";
import { composeCatAnim, playBlend } from "./catanim";
import { bonePoint, brawlTop, CAT_FAR_SLOTS, fatStep, ISO_CAT_FIT, ISO_CAT_RIG, isoCatSkin, proportionsOf, type IsoCatBone, type IsoCatSlot, type IsoCatSocket } from "./catrig";
import { CAT_PIECE, type CatShow } from "./catspot";
import { ISO_DEPTH_SLOT, type IsoPointHandle } from "./depth";

export type IsoCatSprite = RigSprite<IsoCatBone, IsoCatSlot, IsoCatSocket>;
type CatRigAnim = RigAnim<IsoCatBone, IsoCatSlot>;

/** Кінчик хвоста з входу будиночка: половина вікна кадру хвоста. Бабл над котом у будиночку — на `eyesTop` над очима. */
const PEEK = { tailWindow: 9, eyesTop: 22 } as const;
/**
 * Кіт спить у будиночку (рецензія хвилі 3): заплющені очі — темна дужка в темному вході, і будиночок здавався порожнім. Тож з
 * входу ще й звисає на підлогу кінчик хвоста кольору шерсті: зсув від середини входу (точка `door` на висоті ≈ 26, грань +x) —
 * униз до порога й трохи вперед, одиниці арту (× масштаб кота).
 */
const DOOR_TAIL = { x: 13, y: 31 } as const;

/** Над котом, якого не рахували (за краєм камери), одиниці арту: верх вух дорослого ≈ 56 і запас, як у якоря `head`. */
const CULLED_HEAD = 64;

/**
 * Полотно фільтрів кота (сяйво підсвітки), одиниці арту скелета, посередині — корінь: дорослий кіт заввишки до ≈ 90 і
 * завдовжки ≈ 80 уміщається з запасом (масштаб кота множить і полотно).
 */
const FILTER_BOX = { w: 180, h: 200 } as const;

/** Як часто перевіряти, чи не змінилася шерсть (глисти, дерматит, нашийник), мс: щокадру це зайве — хвороби тривають дні. */
const RECIPE_CHECK_MS = 500;

/** Де рука гладить того, хто лежить на спині (N1, `catPetPoint`; null — у гнізді `pet` на спинці): за анімацією, раз на назву. */
const PET_POINTS = new Map<CatAnimId, Vec2 | null>();
function petPointOf(anim: CatAnimId): Vec2 | null {
  let point = PET_POINTS.get(anim);
  if (point === undefined) {
    point = catPetPoint(anim);
    PET_POINTS.set(anim, point);
  }
  return point;
}

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
  /** Швидкість анімації: хода й біг — у такт тому, як кіт іде на екрані (`gaitRate`), решта — 1. */
  speed: number;
  /**
   * На скільки мс зсунути фазу основної, коли вона починається: другий кіт клубка бійки (N2, `CAT_BRAWL_PHASE_MS`) — інакше
   * обидва, граючи ту саму анімацію дзеркально, були б точним дзеркалом одне одного.
   */
  phase: number;
  /**
   * Змішування поз (мс), коли основна змінилася цього кадру, — замість звичайного (`playBlend`): кіт, якого беруть на руки чи
   * опускають, міняє позу, поки йде з кистями. null — звичайне.
   */
  blendMs: number | null;
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
  /** Спить у будиночку: з входу на поріг звисає кінчик хвоста (`DOOR_TAIL`). */
  doorTail: boolean;
  shadow: boolean;
  /** Річ у зубах: іграшка якості, шкарпетка; null — нічого. */
  teeth: { kind: "toy"; quality: Quality } | { kind: "sock" } | null;
  /** Кіт далеко за краєм камери: скелет не рахувати й не малювати (місце, глибина й точки — як завжди). */
  culled: boolean;
  /** Час сцени, мс. */
  time: number;
}

/** Форми породи, вагітність і чи без хвоста (кошеня під ковдрою), з яких зібрано обвіс (`isoCatSkin`). */
type SkinInputs = Pick<Shape, "muzzle" | "ears" | "tail" | "build" | "legs"> & { pregnant: boolean; tailless: boolean };

export class IsoCatView {
  readonly sprite: IsoCatSprite;
  readonly point: IsoPointHandle;
  /** Остання глибина точки (NaN — ще не було розв'язку). */
  depth = Number.NaN;

  private readonly shadow: Phaser.GameObjects.Image;
  private readonly shadowBase: Vec2;
  /** Що в зубах (кадр атласу в гнізді `teeth`). */
  private teethImage: Phaser.GameObjects.Image | null = null;
  private teethKey = "";
  /** Що визирає, коли самого кота не видно: очі й кінчик хвоста. */
  private peekEyes: Phaser.GameObjects.Image | null = null;
  private peekTail: Phaser.GameObjects.Image | null = null;

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
  private readonly tmpPoint: Vec2 = { x: 0, y: 0 };

  /** Над головою (бабли, пір'їнка вудки) і спинка (рука, що гладить), px світу. */
  readonly head: Point = { x: 0, y: 0 };
  readonly back: Point = { x: 0, y: 0 };
  /** Рот (якір `mouth` скелета): звідти хропіння, задишка й чхання (`iso/fx.ts`), px світу. */
  readonly mouth: Point = { x: 0, y: 0 };
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
    // Кошеня під ковдрою: горбик — на дорослого, і коротенький хвостик кошеняти не виходить з-під його краю, а лягав би на
    // ковдру спереду, — лише вушка (`blanketOffset`).
    this.updateSkin(cat.shape, f.pregnant, f.anim === "blanket" && f.kitten > 0);
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

    // Тінь: на поверхні під лапами (у стрибку — не злітає з котом), ширша в повного.
    this.shadow.setVisible(f.shadow && visible);
    if (this.shadow.visible) this.shadow.setPosition(f.ground.x, f.ground.y).setScale(this.shadowBase.x * f.scale * f.girth, this.shadowBase.y * f.scale);
    this.drawPeek(f);
    this.updatePoints(f, visible);
    this.lastShow = f.show;
  }

  /** Кота не видно (поїздка, сходи): нічого не малювати. */
  hide(): void {
    this.sprite.setVisible(false);
    this.shadow.setVisible(false);
    this.teethImage?.setVisible(false);
    this.peekEyes?.setVisible(false);
    this.peekTail?.setVisible(false);
    this.point.hide();
    this.lastShow = "none";
  }

  /** Чи кота зараз видно (хоч очі). */
  get shown(): boolean {
    return this.lastShow !== "none";
  }

  /** Чи видно сам скелет (а не лише очі). */
  get rigShown(): boolean {
    return this.lastShow === "rig";
  }

  destroy(): void {
    this.point.remove();
    this.sprite.destroy();
    this.shadow.destroy();
    this.teethImage?.destroy();
    this.peekEyes?.destroy();
    this.peekTail?.destroy();
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
    this.sprite.setDepth(depth + CAT_PIECE.body);
    this.peekEyes?.setDepth(depth + CAT_PIECE.peek);
    this.peekTail?.setDepth(depth + CAT_PIECE.peek);
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

  /** Обвіс: форми породи, живіт вагітної і (кошеня під ковдрою) без хвоста. */
  private updateSkin(shape: Shape, pregnant: boolean, tailless: boolean): void {
    const s = this.skin;
    if (s && s.muzzle === shape.muzzle && s.ears === shape.ears && s.tail === shape.tail && s.build === shape.build && s.legs === shape.legs && s.pregnant === pregnant && s.tailless === tailless) return;
    this.skin = { muzzle: shape.muzzle, ears: shape.ears, tail: shape.tail, build: shape.build, legs: shape.legs, pregnant, tailless };
    const skin = isoCatSkin(shape, pregnant);
    this.sprite.setSkin(tailless ? { ...skin, tail: null } : skin);
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
   * початку зі змішуванням поз, а на спину й зі спини — одним кадром (`playBlend`).
   */
  private play(f: CatFrame): void {
    const base = CAT_ANIMS[f.anim] as CatRigAnim;
    const overlay = f.overlay ? (CAT_ANIMS[f.overlay] as CatRigAnim) : null;
    const face = f.face;
    const prev = this.playing;
    if (prev && !f.restart && prev.base === base && prev.overlay === overlay && prev.eyes === face.eyes && prev.mouth === face.mouth && prev.ears === face.ears) return;
    const anim = composeCatAnim(base, overlay, face) as CatRigAnim;
    const sameBase = prev !== null && !f.restart && prev.base === base;
    const start = sameBase ? prev.start : this.clock - f.phase;
    const elapsed = this.clock - start;
    const from = anim.loop ? elapsed % anim.duration : Math.min(anim.duration, elapsed);
    const sameMotion = sameBase && prev.overlay === overlay;
    const blend = f.blendMs !== null && !sameBase ? f.blendMs : playBlend(prev, { base, overlay, ears: face.ears }, f.restart);
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

  /** Іграшка чи шкарпетка в зубах (§9.12, «Схованки»): кадр у гнізді `teeth`. */
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
   * Що видно з будиночка (`CatShow`): очі (стан — з обличчя), у сплячого ще й кінчик хвоста на порозі. Частини запечені тим
   * самим рецептом, що й кіт.
   */
  private drawPeek(f: CatFrame): void {
    const eyes = f.show === "eyes" && !f.culled;
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
      this.peekEyes.setVisible(true).setPosition(f.root.x, f.root.y);
      this.peekEyes.setScale(this.baseScale(this.peekEyes) * s, this.baseScale(this.peekEyes, "y") * s);
    } else {
      this.peekEyes?.setVisible(false);
    }
    const tailArt = this.sprite.rig.skin.tail;
    const tail = eyes && f.doorTail && this.cat.shape.tail !== "none";
    if (tail && tailArt) {
      if (!this.peekTail) {
        this.peekTail = addBakedArt(this.scene, this.layer, tailArt, this.recipe, { view, owner });
        this.peekTail.setDepth(this.pieceDepth(CAT_PIECE.peek));
      } else {
        setBakedArt(this.peekTail, tailArt, this.recipe, { view, owner });
      }
      this.cropTailTip(this.peekTail, tailArt);
      this.peekTail.setVisible(true).setPosition(f.root.x + DOOR_TAIL.x * s, f.root.y + DOOR_TAIL.y * s);
      const base = this.baseScale(this.peekTail);
      this.peekTail.setScale(base * s * (f.facing.flip ? -1 : 1), this.baseScale(this.peekTail, "y") * s);
    } else {
      this.peekTail?.setVisible(false);
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

  /** Точки для інших частин: над головою й спинка (з видимого скелета; інакше — над очима). */
  private updatePoints(f: CatFrame, evaluated: boolean): void {
    // Якір і гніздо пишуть просто в точки (немає — точка лишається, як була). У клубку бійки бабл — над кулею (`catBrawlTop`),
    // а тому, хто лежить на спині, рука лягає на живіт (`catPetPoint`), а не на спинку, що на підлозі.
    if (f.show === "rig" && evaluated) {
      if (f.anim === "brawl") this.toWorld(brawlTop(f.kitten, this.tmpPoint), this.head);
      else this.sprite.anchor("head", this.head);
      this.sprite.anchor("mouth", this.mouth);
      const belly = petPointOf(f.anim);
      if (belly) {
        this.rigPoint("body", belly, this.back);
        return;
      }
      const back = this.sprite.socket("pet", this.backSocket);
      if (back) {
        this.back.x = back.x;
        this.back.y = back.y;
      }
      return;
    }
    this.head.x = f.root.x;
    // Скелет не рахували (кіт за краєм камери) — над ним, як над дорослим котом заввишки ≈ 56.
    this.head.y = f.root.y - (f.show === "rig" ? CULLED_HEAD : PEEK.eyesTop) * f.scale;
    this.back.x = f.root.x;
    this.back.y = f.root.y;
    this.mouth.x = this.back.x;
    this.mouth.y = this.back.y;
  }

  /**
   * Точка `local` у системі кістки `bone` (поза з останнього `update`) — у світі, в `out`: кістка — у системі кореня кота
   * обличчям праворуч, а спрайт ставить корінь у свою точку з масштабом кота (від'ємний по x — віддзеркалено).
   */
  private rigPoint(bone: IsoCatBone, local: Vec2, out: Point): void {
    this.toWorld(bonePoint(this.sprite.rig, bone, local, this.tmpPoint), out);
  }

  /** Точка в системі кореня кота (обличчям праворуч) — у світі, в `out`. */
  private toWorld(p: Vec2, out: Point): void {
    out.x = this.sprite.x + p.x * this.sprite.scaleX;
    out.y = this.sprite.y + p.y * this.sprite.scaleY;
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
