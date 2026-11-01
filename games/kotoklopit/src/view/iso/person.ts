// Персонаж нового вигляду (крок 16, T2, `GRAPHICS_PLAN.md`): скелет `PERSON_RIG` у Phaser (`RigSprite`) з частинами,
// запеченими за виглядом (`personRecipe`: шкіра, волосся, очі, одяг; плями на одязі, коли чистого немає, §8.7), дальні рука,
// нога й черевик затінені (`farRecipe`, `PERSON_FAR_SLOTS`), тінь під ногами (`fx/shadow/person`) — рішення автора 2026-10-30.
//
// Що грає — `personAnim` (основна з `PERSON_ANIMS`, накладка рук, ракурс, поступ засинання) і `personEventAnim` (разові від
// подій), зведені в одну анімацію `mixAnims` (`personmix.ts`): накладка рук (несе річ, тримає кота) заміняє руки основної й
// разової, крім анімацій, що ведуть руки самі (`armsOverlay`). Де видно й куди дивиться — `personSpot` (за столом, за
// комп'ютером, біля ліжка, лицем до кота), обличчя, падаючи без сил, — `showFace`. Гнізда: річ у руках (`held`: страва,
// судочок, совок), вудочка (`rod`); кіт на руках і на колінах — у точці й на глибині `hands` (його кладе туди частина котів).
//
// Рука, що гладить (§8.2), — ближня рука скелета (той самий запечений кадр `person/arm`), повернута навколо плеча до спинки
// кота й розтягнута не більше ніж у `REACH_STRETCH` (решту відстані дає присід анімації `pet`); на глибині над персонажем, а
// кіт попереду — над котом (`reachDepth`). Вудочка під час гри — кадр A5 у руці, обтятий до палички, волосінь від її кінчика
// до пучка пір'я з того самого кадру, що кружляє над котом (`personreach.ts`). Брудний одяг — плями й запах (`fx/smell`). У
// поїздці й у душовій кабіні персонажа не видно (§8.5, §8.7). Засинаючи (§8.8), заплющує очі (`person/eyes`: `half`,
// `closed`), а голова хилиться.
//
// Глибина — точка «person» у реєстрі (`iso/depth.ts`); у її проміжку знизу догори: тінь, кіт на руках ззаду (ракурс `back`),
// сам персонаж, рука, що гладить, кіт на руках спереду, запах. Волосінь і пір'я над котом — над усім світом
// (`WORLD_LAYERS.interaction`), як у старому вигляді.

import Phaser from "phaser";

import { petOver } from "../../sim/actions";
import type { GameEvent } from "../../sim/events";
import type { GameState, Item, Look } from "../../sim/types";
import { PALETTE as ART } from "../../../art/palette";
import { PERSON_BY_PROGRESS, type PersonAnimId } from "../anim/ids";
import { facingFromTiles } from "../anim/catfacing";
import { personAnim, personEventAnim, type PersonAnimChoice } from "../anim/personanim";
import { addArt, setArt } from "../art/atlas";
import { addBakedArt, releaseBaked, setBakedArt } from "../art/bake";
import { artEntry } from "../art/manifest";
import { farRecipe, personRecipe } from "../art/recipes";
import type { ArtId, TintRecipe } from "../art/types";
import { PERSON_ANIMS } from "../rig/anims/index";
import { PERSON_FAR_SLOTS, PERSON_FIT, PERSON_RIG, personProportions, personSkin, type PersonSlot } from "../rig/defs/person";
import { slotFrame } from "../rig/rigcore";
import { RigSprite, type RigSpriteOf, type SocketWorld } from "../rig/rigsprite";
import type { AnimOf, RigFacing, Vec2 } from "../rig/types";
import type { PartContext } from "../world/context";
import { WORLD_LAYERS } from "../world/layers";
import type { Hands, PersonPart, Point, WorldFrame } from "../world/part";
import { isoDepth, type IsoPointHandle } from "./depth";
import { ANCHOR_GAP } from "./geometry";
import type { IsoFrame } from "./looks";
import { armsOverlay, cargoDepth, catSocket, eyesFrame, heldFrame, movesHead, PERSON_DEPTH, personExtras, reachDepth, shadowScale } from "./personlook";
import { mixAnims } from "./personmix";
import { cropPixels, featherAt, featherRect, lineEnd, palmAt, reachArm, reachedPose, ROD_PLAY, type PartPose, type UnitRect } from "./personreach";
import { glideOffset, personSpot, showFace } from "./personspot";

type PersonAnim = AnimOf<typeof PERSON_RIG>;

/** Власник запечених кадрів персонажа (бюджет `bake.ts`). */
export const PERSON_OWNER = "person";

/** Над волосінню пір'я: на стільки вище за неї. */
const FEATHER_DEPTH = 0.5;

/** Як часто хвилі запаху міняють кадр, мс (як над брудним лотком, `iso/floor.ts`). */
const SMELL_MS = 450;

/** Разова анімація, що зараз грає: що, з якого моменту годинника анімацій і скільки. */
interface OneShot {
  anim: PersonAnimId;
  start: number;
  ms: number;
}

/** Річ у гнізді: зображення, прикріплене раз назавжди, і кадр, що зараз показано. */
interface Cargo {
  image: Phaser.GameObjects.Image;
  key: string;
}

/** Обтинання кадру (`setCrop`): за яким кадром текстури його пораховано (новий кадр — інша роздільність, рахувати знову). */
interface Crop {
  frame: Phaser.Textures.Frame | null;
}

export class IsoPersonView implements PersonPart {
  private readonly sprite: RigSpriteOf<typeof PERSON_RIG>;
  private readonly shadow: Phaser.GameObjects.Image;
  /** Базовий масштаб кадру тіні (`addArt`: 1 одиниця арту = 1 px світу) — статура його лише множить. */
  private readonly shadowBase: Vec2;
  private readonly smell: Phaser.GameObjects.Image;
  private readonly cargo: Record<"held" | "rod", Cargo>;
  /** Паличка вудочки в руці під час гри — обтята (без мотузки й пір'я). */
  private readonly rodCrop: Crop = { frame: null };
  /** Волосінь вудочки — над світом. */
  private readonly line: Phaser.GameObjects.Graphics;
  /** Пучок пір'я над котом під час гри: той самий кадр вудочки [`hand`], обтятий до пучка. */
  private readonly feather: Phaser.GameObjects.Image;
  private featherKey = "";
  private readonly featherCrop: Crop = { frame: null };
  /** Рука, що гладить: запечений кадр ближньої руки, поставлений поза скелетом (з'являється з першими пестощами). */
  private arm: Phaser.GameObjects.Image | null = null;
  private armKey = "";
  private armBase: Vec2 = { x: 1, y: 1 };
  private readonly point: IsoPointHandle;
  /** Глибина точки з останнього розв'язку реєстру. */
  private depth = 0;

  /** Вигляд, за яким складено обвіс і рецепти (копія `Look`), і чи одяг брудний; номер рецепта — для руки, що гладить. */
  private look: Look | null = null;
  private stained = false;
  private recipe: TintRecipe;
  private far: TintRecipe;
  private recipeVersion = 0;
  private readonly farSlots: ReadonlySet<string> = new Set<string>(PERSON_FAR_SLOTS);

  /** Годинник анімацій, мс: час сцени × швидкість (`PersonAnimParams.speed`). */
  private clock = 0;
  private lastTime: number | null = null;
  private facing: RigFacing | null = null;
  /** Зсув вигляду від точки тіла до місця справи, клітинки (`glideOffset`), і де вигляд стоїть цього кадру. */
  private readonly offset: Vec2 = { x: 0, y: 0 };
  private readonly at: Vec2 = { x: 0, y: 0 };
  private oneShot: OneShot | null = null;
  /** Подія цього кадру, що просить разову анімацію (`onEvent` → наступний `update`). */
  private pending: { anim: PersonAnimId; ms: number } | null = null;
  /** Основна анімація, яку грали минулого кадру (до зведення): та сама — зведена продовжує її фазу. */
  private main: PersonAnim | null = null;
  private choice: PersonAnimChoice | null = null;
  private hidden = true;
  /** Кого гладить (ближня рука лягає на спинку) і з ким грається вудочкою цього кадру; null — ні. */
  private petCat: number | null = null;
  private rodCat: number | null = null;

  private readonly tmpPoint: Vec2 = { x: 0, y: 0 };
  private readonly tmpTarget: Vec2 = { x: 0, y: 0 };
  private readonly tmpSocket: SocketWorld = { x: 0, y: 0, angle: 0, flipped: false };

  readonly head: Point = { x: 0, y: 0 };
  readonly hands: Hands = { x: 0, y: 0, depth: 0 };

  constructor(private readonly ctx: PartContext) {
    const scene = ctx.scene;
    const look = ctx.state().character.look;
    this.recipe = personRecipe(look);
    this.far = farRecipe(this.recipe);
    this.sprite = new RigSprite(scene, PERSON_RIG, {
      fit: PERSON_FIT,
      skin: personSkin(look),
      proportions: personProportions(look),
      baked: this.baked(),
    });
    this.look = { ...look };
    this.shadow = addArt(scene, ctx.layer, "fx/shadow/person");
    this.shadowBase = { x: this.shadow.scaleX, y: this.shadow.scaleY };
    ctx.layer.add(this.sprite);
    this.smell = addArt(scene, ctx.layer, "fx/smell", { state: "a" }).setVisible(false);
    this.cargo = {
      held: this.socketImage("held", { id: "item/dish/meal", state: "cheap" }),
      rod: this.socketImage("rod", { id: "item/toy/cheap", state: "hand" }),
    };
    this.line = scene.add.graphics().setDepth(WORLD_LAYERS.interaction).addToDisplayList(ctx.layer);
    this.feather = addArt(scene, ctx.layer, "item/toy/cheap", { state: "hand" }).setDepth(WORLD_LAYERS.interaction + FEATHER_DEPTH).setVisible(false);
    this.point = isoDepth(ctx).addPoint((d) => this.setDepth(d), { id: "person" });
  }

  /** Зображення в гнізді скелета: прикріплене раз (рухається й дзеркалиться з ним), сховане, доки в руках нічого немає. */
  private socketImage(socket: "held" | "rod", frame: IsoFrame): Cargo {
    const image = addArt(this.ctx.scene, this.sprite, frame.id, { state: frame.state }).setVisible(false);
    this.sprite.attach(socket, image);
    return { image, key: frameKey(frame) };
  }

  /** Запечені частини: ближні — рецептом вигляду, дальні — затіненим (`farRecipe`). */
  private baked(): { recipe: (slot: PersonSlot) => TintRecipe; owner: string } {
    const recipe = this.recipe;
    const far = this.far;
    return { recipe: (slot) => (this.farSlots.has(slot) ? far : recipe), owner: PERSON_OWNER };
  }

  private setDepth(d: number): void {
    this.depth = d;
    this.shadow.setDepth(d + PERSON_DEPTH.shadow);
    this.sprite.setDepth(d + PERSON_DEPTH.body);
    this.smell.setDepth(d + PERSON_DEPTH.smell);
  }

  update(state: GameState, frame: WorldFrame): void {
    const time = frame.time;
    const dt = this.lastTime === null ? 0 : Math.min(250, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    const character = state.character;
    const choice = personAnim(state, { moving: frame.moving, sleepiness: frame.sleepiness, prev: this.facing });
    this.choice = choice;
    const params = choice.params;
    this.clock += dt * params.speed;
    this.hidden = params.hidden;
    this.syncLook(character.look, params.dirty);

    // Де видно й куди дивиться: за справою — на її місці, лицем до цілі; засинаючи — спершу лицем до кімнати (очі видно).
    const spot = personSpot(state, choice.anim, params.progress);
    const body = character.body;
    this.tmpTarget.x = spot.at.x - body.x;
    this.tmpTarget.y = spot.at.y - body.y;
    glideOffset(this.offset, this.tmpTarget, dt / 1000, this.offset);
    this.at.x = body.x + this.offset.x;
    this.at.y = body.y + this.offset.y;
    const faced = (spot.face && facingFromTiles(spot.face, this.facing)) || { view: choice.view, flip: choice.flip };
    const facing = showFace(choice.anim, faced);
    this.facing = facing;

    // Спершу ракурс: новий ракурс — нова вихідна поза, і `play` не змішує з позою старого.
    this.sprite.setFacing(facing);
    this.play(choice, this.reachTargets(state, choice));
    const feet = this.ctx.projection.toScreen(this.at);
    this.sprite.setPosition(feet.x, feet.y);
    this.sprite.update(this.clock);
    this.sprite.setVisible(!this.hidden);

    // Тінь під ногами (не частина скелета: лишається на підлозі), запах над головою.
    const shadow = shadowScale(this.shadowBase, character.look.build, this.tmpPoint);
    this.shadow.setPosition(feet.x, feet.y).setScale(shadow.x, shadow.y).setVisible(!this.hidden);
    this.updateCargo(character.held);
    this.updatePoints();
    const smelly = params.dirty && !this.hidden;
    this.smell.setVisible(smelly);
    if (smelly) {
      setArt(this.smell, "fx/smell", { state: Math.floor(time / SMELL_MS) % 2 === 0 ? "a" : "b" });
      this.smell.setPosition(this.head.x, this.head.y + ANCHOR_GAP);
    }
    if (this.hidden) this.point.hide();
    else this.point.place(this.at.x, this.at.y);
  }

  /**
   * Кого гладить і з ким грається вудочкою (разові вирішує `play`): анімація `pet` чи `rod`, справа ще триває, кіт є в частині
   * котів. Кота немає — рука й вудочка такі, як в анімації.
   */
  private reachTargets(state: GameState, choice: PersonAnimChoice): { pet: number | null; rod: number | null } {
    const activity = state.character.activity;
    if (choice.params.hidden || !activity) return NO_REACH;
    const world = this.ctx.world;
    if (choice.anim === "pet" && activity.kind === "pet" && !petOver(activity) && world.cat(activity.cat)) return { pet: activity.cat, rod: null };
    const toy = state.character.held?.kind === "toy";
    if (choice.anim === "rod" && activity.kind === "play" && activity.done !== true && toy && world.cat(activity.cat)) return { pet: null, rod: activity.cat };
    return NO_REACH;
  }

  /** Обвіс, пропорції й рецепти за виглядом; плями на одязі — новий рецепт (кадри перезапікаються). */
  private syncLook(look: Look, dirty: boolean): void {
    const was = this.look;
    const same = was !== null && sameLook(was, look);
    if (same && this.stained === dirty) return;
    if (!same) {
      this.sprite.setSkin(personSkin(look));
      this.sprite.setProportions(personProportions(look));
      this.look = { ...look };
    }
    this.stained = dirty;
    this.recipe = personRecipe(look, dirty ? { stained: true } : {});
    this.far = farRecipe(this.recipe);
    this.recipeVersion++;
    this.sprite.setBaked(this.baked());
  }

  /**
   * Анімація кадру: разова від події (поки грає) чи основна; до обох — накладка рук (`armsOverlay`), зверху — очі засинання,
   * схована ближня рука (гладить: її ставить `placeArm`) і голова, що хилиться. За поступом (засинання) — час анімації з
   * поступу, інакше — годинник; та сама основна, лише з іншою накладкою чи очима, продовжує свою фазу.
   */
  private play(choice: PersonAnimChoice, reach: { pet: number | null; rod: number | null }): void {
    const params = choice.params;
    const asleep = params.progress !== null;
    let fresh = false;
    if (this.pending && !params.hidden && !asleep) {
      this.oneShot = { ...this.pending, start: this.clock };
      fresh = true;
    }
    this.pending = null;
    if (this.oneShot && (params.hidden || asleep || this.clock - this.oneShot.start >= this.oneShot.ms)) this.oneShot = null;

    const shot = this.oneShot;
    this.petCat = shot ? null : reach.pet;
    this.rodCat = shot ? null : reach.rod;
    const id = shot ? shot.anim : choice.anim;
    const main = PERSON_ANIMS[id];
    const overlay = armsOverlay(id, choice.overlay);
    const droop = !shot && asleep && PERSON_BY_PROGRESS.has(choice.anim) && !movesHead(main);
    const anim = mixAnims(main, overlay ? PERSON_ANIMS[overlay] : null, personExtras(eyesFrame(params.eyes), this.petCat !== null, droop));

    // Час — годинник анімацій (`clock`), тож `Rig.play` напряму: `RigSprite.play` узяв би час минулого кадру.
    const rig = this.sprite.rig;
    if (shot) {
      // Разова з іншою накладкою (узяв річ посеред неї) — з тієї самої миті разової, а не з початку.
      if (fresh || rig.anim !== anim) rig.play(anim, this.clock, { restart: true, from: fresh ? 0 : this.clock - shot.start });
    } else if (asleep) {
      // За поступом: час — частка тривалості; без змішування (поза на початку засинання — та сама, що стоячи).
      rig.play(anim, this.clock, { restart: true, from: (params.progress ?? 0) * anim.duration, blend: 0 });
    } else if (rig.anim !== anim) {
      const from = this.main === main && anim.loop ? rig.time(this.clock) % anim.duration : 0;
      rig.play(anim, this.clock, { from, loop: choice.loop });
    }
    this.main = main;
  }

  /**
   * Річ у руках — у гнізді `held`, вудочка — у `rod` (граючись із котом — лише паличка: пір'я кружляє над котом); кота
   * малює частина котів (у точці `hands`).
   */
  private updateCargo(item: Item | null): void {
    const want = this.hidden ? null : heldFrame(item);
    for (const socket of ["held", "rod"] as const) {
      const cargo = this.cargo[socket];
      const frame = want?.socket === socket ? want.frame : null;
      cargo.image.setVisible(frame !== null);
      if (!frame) continue;
      const key = frameKey(frame);
      if (cargo.key !== key) {
        cargo.key = key;
        setArt(cargo.image, frame.id, { state: frame.state });
      }
      if (socket === "rod") cropTo(cargo.image, frame.id, this.rodCat !== null ? ROD_PLAY.stick : null, this.rodCrop);
    }
  }

  /** Над головою (бабли, камера) і руки (кіт на руках чи на колінах і куди він дивиться) — з пози скелета цього кадру. */
  private updatePoints(): void {
    const top = this.sprite.anchor("head", this.tmpPoint);
    if (top) {
      this.head.x = top.x;
      this.head.y = top.y - ANCHOR_GAP;
    }
    const socket = this.sprite.socket(catSocket(this.choice?.anim ?? "idle"), this.tmpSocket);
    if (socket) {
      this.hands.x = socket.x;
      this.hands.y = socket.y;
    }
    this.hands.depth = cargoDepth(this.depth, this.sprite.facing.view === "back");
    this.hands.facing = this.sprite.facing;
  }

  /**
   * Після котів (`World.update`): розв'язок глибини; далі рука, що гладить, лягає на спинку кота, а пір'я вудочки кружляє
   * над ним — там, де кота намальовано цього кадру, і на глибині, яку кіт отримав у цьому розв'язку.
   */
  lateUpdate(_state: GameState, frame: WorldFrame): void {
    const registry = isoDepth(this.ctx);
    registry.solve();
    // Розв'язок міг змінити глибину: руки — з новою.
    this.hands.depth = cargoDepth(this.depth, this.sprite.facing.view === "back");

    if (this.petCat !== null) {
      const cat = this.ctx.world.cat(this.petCat);
      const catDepth = registry.point(`cat:${this.petCat}`)?.depth ?? null;
      this.placeArm(cat ? palmAt(cat.back, frame.time) : null, reachDepth(this.depth, catDepth));
    } else {
      this.arm?.setVisible(false);
    }
    const g = this.line.clear();
    this.feather.setVisible(false);
    if (this.rodCat !== null) {
      const cat = this.ctx.world.cat(this.rodCat);
      if (cat) this.drawRod(g, this.rodId(), featherAt(cat.head, frame.time));
    }
  }

  /** Запис вудочки в руці (з кадру гнізда `rod`). */
  private rodId(): ArtId {
    return this.cargo.rod.key.slice(0, this.cargo.rod.key.indexOf("|")) as ArtId;
  }

  /**
   * Ближня рука, що гладить: той самий запечений кадр, що в слоті скелета (там його сховано), у позі анімації `pet`,
   * повернута навколо плеча так, щоб кисть (`grip`) лягла на `palm` (спинка кота), і розтягнута не більше за
   * `REACH_STRETCH`. `palm` null — поза анімації як є.
   */
  private placeArm(palm: Point | null, depth: number): void {
    const rig = this.sprite.rig;
    const slot = rig.slot("arm-near");
    if (slot.art === null) {
      this.arm?.setVisible(false);
      return;
    }
    const image = this.armImage(slot.art, slot.state);
    let pose: PartPose = slot;
    const sign = this.sprite.facing.flip ? -1 : 1;
    const hand = palm ? rig.anchor("hands", this.tmpPoint, false) : null;
    if (palm && hand) {
      const bone = rig.bone("arm-near").world;
      const shoulder = { x: bone.tx, y: bone.ty };
      // Ціль — у системі кореня скелета (обличчям праворуч), як і поза.
      const target = { x: (palm.x - this.sprite.x) * sign, y: palm.y - this.sprite.y };
      pose = reachedPose(slot, shoulder, hand, reachArm(shoulder, hand, target));
    }
    // Віддзеркалений скелет дзеркалить і руку: місце по x, кут і масштаб по x — зі знаком.
    image
      .setPosition(this.sprite.x + sign * pose.x, this.sprite.y + pose.y)
      .setAngle(sign * pose.rot)
      .setScale(sign * this.armBase.x * pose.sx, this.armBase.y * pose.sy)
      .setDepth(depth)
      .setVisible(true);
  }

  /** Зображення руки, що гладить, з кадром слота (стан, ракурс) і рецептом вигляду; новий кадр — лише коли щось змінилося. */
  private armImage(art: ArtId, state: string | null): Phaser.GameObjects.Image {
    const frame = slotFrame(art, artEntry(art), state, this.sprite.facing.view);
    const key = `${frame.frame}|${this.recipeVersion}`;
    let image = this.arm;
    if (image && this.armKey === key) return image;
    const opts = { state: frame.state, view: frame.view, owner: PERSON_OWNER };
    if (!image) {
      image = addBakedArt(this.ctx.scene, this.ctx.layer, art, this.recipe, opts);
      this.arm = image;
    } else {
      // `setBakedArt` зберігає масштаб відносно базового — спершу базовий.
      image.setScale(this.armBase.x, this.armBase.y);
      setBakedArt(image, art, this.recipe, opts);
    }
    this.armKey = key;
    this.armBase = { x: image.scaleX, y: image.scaleY };
    return image;
  }

  /**
   * Вудочка під час гри: волосінь від кінчика палички в руці (`ROD_PLAY.tip`) до пучка пір'я, що кружляє над котом (`at` —
   * де його точка `feather`); пучок — кадр вудочки [`hand`], обтятий до пір'я.
   */
  private drawRod(g: Phaser.GameObjects.Graphics, id: ArtId, at: Point): void {
    const entry = artEntry(id);
    const socket = this.sprite.socket("rod", this.tmpSocket);
    const feather = entry?.points?.["feather"];
    if (!entry || !socket || !feather) return;
    const tip = socketPoint(socket, { x: ROD_PLAY.tip.x - entry.pivot.x, y: ROD_PLAY.tip.y - entry.pivot.y });
    const end = lineEnd(at);
    g.lineStyle(ROD_PLAY.line, hex(ART.ink), 0.85).lineBetween(tip.x, tip.y, end.x, end.y);
    if (this.featherKey !== id) {
      this.featherKey = id;
      setArt(this.feather, id, { state: "hand" });
    }
    cropTo(this.feather, id, featherRect(feather), this.featherCrop);
    this.feather.setPosition(at.x - (feather.x - entry.pivot.x), at.y - (feather.y - entry.pivot.y)).setVisible(true);
  }

  onEvent(event: GameEvent): void {
    const shot = personEventAnim(event);
    if (shot) this.pending = { anim: shot.anim, ms: shot.ms };
  }

  /** День показують заново: разові, ракурс і перехід до місця справи — з чистого аркуша. */
  reset(): void {
    this.oneShot = null;
    this.pending = null;
    this.facing = null;
    this.offset.x = 0;
    this.offset.y = 0;
    this.lastTime = null;
    this.main = null;
  }

  destroy(): void {
    this.point.remove();
    this.sprite.destroy();
    for (const cargo of Object.values(this.cargo)) cargo.image.destroy();
    this.shadow.destroy();
    this.smell.destroy();
    this.line.destroy();
    this.feather.destroy();
    this.arm?.destroy();
    releaseBaked(this.ctx.scene, PERSON_OWNER);
  }

  /** Над головою: бабли подій летять за персонажем. */
  anchor(id: string): Point | null {
    return id === "person" ? { x: this.head.x, y: this.head.y } : null;
  }

  highlight(): boolean {
    return false;
  }
}

const NO_REACH = { pet: null, rod: null } as const;

/**
 * Обтяти зображення кадру запису `id` до прямокутника `rect` (одиниці арту; null — без обтинання). Рахується знову, лише
 * коли змінився кадр текстури (інший запис, атлас замість заглушки — інша роздільність).
 */
function cropTo(image: Phaser.GameObjects.Image, id: ArtId, rect: UnitRect | null, memo: Crop): void {
  if (!rect) {
    if (memo.frame !== null) {
      image.setCrop();
      memo.frame = null;
    }
    return;
  }
  if (memo.frame === image.frame) return;
  const entry = artEntry(id);
  const px = cropPixels(rect, image.frame.realWidth, entry?.size.w ?? image.frame.realWidth);
  image.setCrop(px.x, px.y, px.w, px.h);
  memo.frame = image.frame;
}

function frameKey(frame: IsoFrame): string {
  return `${frame.id}|${frame.state ?? ""}`;
}

function sameLook(a: Look, b: Look): boolean {
  return (
    a.face === b.face &&
    a.skin === b.skin &&
    a.hair === b.hair &&
    a.hairColor === b.hairColor &&
    a.eyes === b.eyes &&
    a.build === b.build &&
    a.top === b.top &&
    a.bottom === b.bottom &&
    a.shoes === b.shoes
  );
}

function hex(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}

/** Точка кадру в гнізді: зсув від pivot (одиниці арту) уздовж осей гнізда у світі (віддзеркалене гніздо — дзеркально). */
function socketPoint(socket: { x: number; y: number; angle: number; flipped: boolean }, offset: Point): Point {
  const rad = (socket.angle * Math.PI) / 180;
  const ax = { x: Math.cos(rad), y: Math.sin(rad) };
  // Вісь y кадру: за годинниковою від осі x, а у віддзеркаленому — проти.
  const ay = socket.flipped ? { x: ax.y, y: -ax.x } : { x: -ax.y, y: ax.x };
  return { x: socket.x + offset.x * ax.x + offset.y * ay.x, y: socket.y + offset.x * ax.y + offset.y * ay.y };
}
