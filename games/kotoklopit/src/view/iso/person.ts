// Персонаж нового вигляду (крок 16, T2, `GRAPHICS_PLAN.md`): скелет `PERSON_RIG` у Phaser (`RigSprite`) з частинами,
// запеченими за виглядом (`personRecipe`: шкіра, волосся, очі, одяг; плями на одязі, коли чистого немає, §8.7), дальні рука,
// нога й черевик затінені (`farRecipe`, `PERSON_FAR_SLOTS`), тінь під ногами (`fx/shadow/person`) — рішення автора 2026-10-30.
//
// Що грає — `personAnim` (основна з `PERSON_ANIMS`, накладка рук, ракурс, поступ засинання) і `personEventAnim` (разові від
// подій): накладку рук (несе річ, тримає кота, тримає пилосос) кладе `personWithArms` (N4a) — заміняє руки основної й разової, руки з річчю
// тримають рівно проти нахилу тулуба, а анімації, що ведуть руки самі (`PERSON_OWN_ARMS`), лишає як є; поправки вигляду
// (очі засинання, схована рука, голова хилиться) — `mixAnims` (`personmix.ts`). Де видно й куди дивиться — `personSpot`
// (за столом, за комп'ютером, біля ліжка, лицем до кота), обличчя, падаючи без сил, — `showFace`. Хода йде в такт тому, як
// ноги пересуваються на екрані (`gaitRate`, контракт N4a `personGaitSpeed`), — стопи не ковзають. Гнізда: річ у руках (`held`:
// страва, судочок, совок, телефон, пилосос), вудочка (`rod`); кіт на руках і на колінах — у точці й на глибині `hands` (його
// кладе туди частина котів).
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

import { petDone, petOver } from "../../sim/actions";
import type { GameEvent } from "../../sim/events";
import { cleaningTool } from "../../sim/household";
import type { CleaningTool, GameState, Item, Look } from "../../sim/types";
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
import { personCatGrip, personVacuumBrush, personWithArms } from "../rig/anims/person/move";
import { PERSON_FAR_SLOTS, PERSON_FIT, PERSON_RIG, personProportions, personSkin, type PersonSlot } from "../rig/defs/person";
import { slotFrame } from "../rig/rigcore";
import { RigSprite, type RigSpriteOf, type SocketWorld } from "../rig/rigsprite";
import type { AnimOf, RigFacing, Vec2 } from "../rig/types";
import type { PartContext } from "../world/context";
import { WORLD_LAYERS } from "../world/layers";
import type { Hands, HandsLift, PersonPart, Point, WorldFrame } from "../world/part";
import { isoDepth, type IsoPointHandle } from "./depth";
import { ANCHOR_GAP } from "./geometry";
import type { IsoFrame } from "./looks";
import {
  armsOverlay,
  cargoDepth,
  catSocket,
  eyesFrame,
  gaitRate,
  heldFrame,
  heldView,
  liftedCat,
  liftWeights,
  movesHead,
  newPace,
  nextPace,
  PERSON_DEPTH,
  sweepDustState,
  personExtras,
  farReachDepth,
  reachDepth,
  shadowScale,
  shownHeld,
} from "./personlook";
import { mixAnims } from "./personmix";
import { cropPixels, featherAt, featherRect, lineEnd, palmAt, reachArm, reachedPose, ROD_PLAY, type PartPose, type UnitRect } from "./personreach";
import { glideOffset, glideRate, personSpot, shotFace, shotPlace, showFace, touchFacing, type ShotPlace } from "./personspot";

type PersonAnim = AnimOf<typeof PERSON_RIG>;

/** Власник запечених кадрів персонажа (бюджет `bake.ts`). */
export const PERSON_OWNER = "person";

/** Над волосінню пір'я: на стільки вище за неї. */
const FEATHER_DEPTH = 0.5;

/** Як часто хвилі запаху міняють кадр, мс (як над брудним лотком, `iso/floor.ts`). */
const SMELL_MS = 450;

/**
 * Разова анімація від події: що, скільки, біля чого (лицем до цього, `shotFace`) і що було в руках до події (до миті дотику
 * рука ще з ним, `shownHeld`).
 */
interface Shot {
  anim: PersonAnimId;
  ms: number;
  place: ShotPlace | null;
  before: Item | null;
  /** Кіт, якого бере на руки чи опускає (`liftedCat`). */
  cat: number | null;
}

/** Разова анімація, що зараз грає: подія й з якого моменту годинника анімацій. */
interface OneShot extends Shot {
  start: number;
}

/** Річ у гнізді: зображення, прикріплене раз назавжди, кадр, що зараз показано, масштаб відносно базового кадру й зсув. */
interface Cargo {
  image: Phaser.GameObjects.Image;
  key: string;
  scale: number;
  shift: { readonly x: number; readonly y: number } | null;
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
  /** Пил з-під віника (§8.7) і його поточний кадр: кадр міняється рідше, ніж малюється світ. */
  private readonly sweepDust: Phaser.GameObjects.Image;
  private sweepDustShown: string | null = null;
  private readonly cargo: Record<"held" | "rod", Cargo>;
  /** Паличка вудочки в руці під час гри — обтята (без мотузки й пір'я). */
  private readonly rodCrop: Crop = { frame: null };
  /** Волосінь вудочки — над світом. */
  private readonly line: Phaser.GameObjects.Graphics;
  /** Пучок пір'я над котом під час гри: той самий кадр вудочки [`hand`], обтятий до пучка. */
  private readonly feather: Phaser.GameObjects.Image;
  private featherKey = "";
  private readonly featherCrop: Crop = { frame: null };
  /** Руки, що гладять: ближня — першого кота, дальня — другого («Двох одразу»); з'являються з першими пестощами. */
  private readonly arms: { readonly near: PetArm; readonly far: PetArm } = {
    near: { slot: "arm-near", anchor: "hands", lag: 0, image: null, key: "", base: { x: 1, y: 1 } },
    far: { slot: "arm-far", anchor: "hands-far", lag: FAR_STROKE_LAG, image: null, key: "", base: { x: 1, y: 1 } },
  };
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

  /** Годинник анімацій, мс: час сцени × швидкість (`PersonAnimParams.speed`), на ході — ще й × темп ходи (`gaitRate`). */
  private clock = 0;
  /** Де були ноги минулого кадру й як швидко вони йдуть на екрані: темп ходи (`nextPace`). */
  private readonly pace = newPace();
  private lastTime: number | null = null;
  private facing: RigFacing | null = null;
  /** Зсув вигляду від точки тіла до місця справи, клітинки (`glideOffset`), і де вигляд стоїть цього кадру. */
  private readonly offset: Vec2 = { x: 0, y: 0 };
  private readonly at: Vec2 = { x: 0, y: 0 };
  private oneShot: OneShot | null = null;
  /** Подія цього кадру, що просить разову анімацію (`onEvent` → наступний `update`). */
  private pending: Shot | null = null;
  /** Разова почалася цього кадру (з першого кадру — з початку, без змішування з попередньою). */
  private fresh = false;
  /** Що було в руках за станом гри минулого кадру: подія, що міняє `held`, приходить уже після зміни. */
  private lastHeld: Item | null = null;
  /** Основна анімація, яку грали минулого кадру (до зведення): та сама — зведена продовжує її фазу. */
  private main: PersonAnim | null = null;
  private choice: PersonAnimChoice | null = null;
  private hidden = true;
  /** Кого гладить (ближня рука лягає на спинку; дальня — на другого) і з ким грається вудочкою цього кадру; null — ні. */
  private petCat: number | null = null;
  private petFarCat: number | null = null;
  private rodCat: number | null = null;

  private readonly tmpPoint: Vec2 = { x: 0, y: 0 };
  private readonly tmpTarget: Vec2 = { x: 0, y: 0 };
  /** Точка між двома котами, яких гладить («Двох одразу»): той самий об'єкт щокадру. */
  private readonly touchAt: Point = { x: 0, y: 0 };
  private readonly tmpSocket: SocketWorld = { x: 0, y: 0, angle: 0, flipped: false };
  /** Щітка пилососа в руках цього кадру (`brush`) і чи вона є. */
  private readonly brushAt: Point = { x: 0, y: 0 };
  private brushShown = false;

  /** Кіт, якого бере на руки чи опускає (`Hands.lift`): той самий об'єкт щокадру. */
  private readonly lift: HandsLift = { cat: -1, w: 0, grip: 0, at: { x: 0, y: 0 } };
  /** Де кисті підхоплюють кота (`personCatGrip`) за ракурсом і статурою: рахується раз на пару. */
  private readonly grips = new Map<string, Vec2>();

  readonly head: Point = { x: 0, y: 0 };
  readonly hands: Hands = { x: 0, y: 0, depth: 0, lift: null };

  /** Щітка пилососа в руках на екрані (§8.7): туди втягується пил, шерсть і сухий безлад, що прибрав пилосос. */
  get brush(): Point | null {
    return this.brushShown ? this.brushAt : null;
  }

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
    this.sweepDust = addArt(scene, ctx.layer, "fx/sweep-dust", { state: "a" }).setVisible(false);
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
    return { image, key: frameKey(frame), scale: 1, shift: null };
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
    this.sweepDust.setDepth(d + PERSON_DEPTH.smell);
  }

  update(state: GameState, frame: WorldFrame): void {
    const time = frame.time;
    const dt = this.lastTime === null ? 0 : Math.min(250, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    const character = state.character;
    const choice = personAnim(state, { moving: frame.moving, sleepiness: frame.sleepiness, prev: this.facing });
    this.choice = choice;
    const params = choice.params;
    this.hidden = params.hidden;
    this.syncLook(character.look, params.dirty);

    // Де видно: за справою — на її місці; ноги — точка на екрані, з неї й темп ходи.
    const spot = personSpot(state, choice.anim, params.progress);
    const body = character.body;
    this.tmpTarget.x = spot.at.x - body.x;
    this.tmpTarget.y = spot.at.y - body.y;
    glideOffset(this.offset, this.tmpTarget, dt / 1000, this.offset, glideRate(params.progress));
    this.at.x = body.x + this.offset.x;
    this.at.y = body.y + this.offset.y;
    const feet = this.ctx.projection.toScreen(this.at);
    nextPace(this.pace, feet.x, feet.y, dt / 1000);
    // Хода — у такт тому, як ноги йдуть на екрані (`gaitRate`); разова (і та, що почнеться цього кадру) — своїм часом.
    const free = this.oneShot === null && this.pending === null;
    this.clock += dt * params.speed * (free ? gaitRate(choice.anim, frame.moving, this.pace) : 1);

    this.advanceShot(params);
    // Куди дивиться: гладить кота чи грається з ним — лицем туди, де кота намальовано (юрба ставить його обабіч, `touchFacing`),
    // а двох («Двох одразу») — у бік між ними, щоб жоден не опинився за спиною;
    // за справою — лицем до цілі; засинаючи — спершу лицем до кімнати (очі видно); разова справа біля речі — лицем до неї.
    const reach = this.reachTargets(state, choice);
    const catAt = this.oneShot ? null : this.touchPoint(reach);
    const face = (this.oneShot?.place ? shotFace(state, this.oneShot.place) : null) ?? spot.face;
    const faced = catAt ? touchFacing(feet, catAt, this.facing) : (face && facingFromTiles(face, this.facing)) || { view: choice.view, flip: choice.flip };
    const facing = showFace(choice.anim, faced);
    this.facing = facing;

    // Спершу ракурс: новий ракурс — нова вихідна поза, і `play` не змішує з позою старого.
    this.sprite.setFacing(facing);
    this.play(choice, reach);
    this.sprite.setPosition(feet.x, feet.y);
    this.sprite.update(this.clock);
    this.sprite.setVisible(!this.hidden);

    // Тінь під ногами (не частина скелета: лишається на підлозі), запах над головою.
    const shadow = shadowScale(this.shadowBase, character.look.build, this.tmpPoint);
    this.shadow.setPosition(feet.x, feet.y).setScale(shadow.x, shadow.y).setVisible(!this.hidden);
    const shot = this.oneShot;
    const shown = shownHeld(shot?.before ?? null, character.held, shot?.anim ?? null, shot ? this.clock - shot.start : 0);
    this.updateCargo(shown, shot ? shot.anim : choice.anim, cleaningTool(state));
    this.lastHeld = character.held;
    this.updatePoints();
    const smelly = params.dirty && !this.hidden;
    this.smell.setVisible(smelly);
    if (smelly) {
      setArt(this.smell, "fx/smell", { state: Math.floor(time / SMELL_MS) % 2 === 0 ? "a" : "b" });
      this.smell.setPosition(this.head.x, this.head.y + ANCHOR_GAP);
    }
    this.updateSweepDust(time);
    if (this.hidden) this.point.hide();
    else this.point.place(this.at.x, this.at.y);
  }

  /** Пил із-під віника (§8.7): лише поки віник у руках, у точці, де він торкається підлоги. */
  private updateSweepDust(time: number): void {
    const sweeping = this.brushShown && this.cargo.held.key.startsWith("item/broom|");
    this.sweepDust.setVisible(sweeping);
    if (!sweeping) return;
    this.sweepDust.setPosition(this.brushAt.x, this.brushAt.y);
    const state = sweepDustState(time);
    if (state === this.sweepDustShown) return;
    this.sweepDustShown = state;
    setArt(this.sweepDust, "fx/sweep-dust", { state });
  }

  /**
   * Кого гладить і з ким грається вудочкою (разові вирішує `play`): анімація `pet` чи `rod`, справа ще триває, кіт є в частині
   * котів. Кота немає — рука й вудочка такі, як в анімації.
   */
  private reachTargets(state: GameState, choice: PersonAnimChoice): Reach {
    const activity = state.character.activity;
    if (choice.params.hidden || !activity) return NO_REACH;
    const world = this.ctx.world;
    if (choice.anim === "pet" && activity.kind === "pet" && !petDone(activity)) {
      const second = activity.second;
      const pet = !petOver(activity) && world.cat(activity.cat) ? activity.cat : null;
      const petFar = second && !petOver(second) && world.cat(second.cat) ? second.cat : null;
      return pet === null && petFar === null ? NO_REACH : { pet, petFar, rod: null };
    }
    const toy = state.character.held?.kind === "toy";
    if (choice.anim === "rod" && activity.kind === "play" && activity.done !== true && toy && world.cat(activity.cat)) return { pet: null, petFar: null, rod: activity.cat };
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
   * Разова від події: подія минулого кадру починає її (з годинника анімацій цього кадру), закінчена, схований персонаж і
   * засинання — скасовують.
   */
  private advanceShot(params: PersonAnimChoice["params"]): void {
    const asleep = params.progress !== null;
    this.fresh = false;
    if (this.pending && !params.hidden && !asleep) {
      this.oneShot = { ...this.pending, start: this.clock };
      this.fresh = true;
    }
    this.pending = null;
    if (this.oneShot && (params.hidden || asleep || this.clock - this.oneShot.start >= this.oneShot.ms)) this.oneShot = null;
  }

  /**
   * Анімація кадру: разова від події (поки грає) чи основна; до обох — накладка рук (`armsOverlay`), зверху — очі засинання,
   * схована ближня рука (гладить: її ставить `placeArm`) і голова, що хилиться. За поступом (засинання) — час анімації з
   * поступу, інакше — годинник; та сама основна, лише з іншою накладкою чи очима, продовжує свою фазу.
   */
  private play(choice: PersonAnimChoice, reach: Reach): void {
    const params = choice.params;
    const asleep = params.progress !== null;
    const fresh = this.fresh;
    const shot = this.oneShot;
    this.petCat = shot ? null : reach.pet;
    this.petFarCat = shot ? null : reach.petFar;
    this.rodCat = shot ? null : reach.rod;
    const id = shot ? shot.anim : choice.anim;
    const main = PERSON_ANIMS[id];
    const droop = !shot && asleep && PERSON_BY_PROGRESS.has(choice.anim) && !movesHead(main);
    const armed = personWithArms(main, armsOverlay(id, choice.overlay), id);
    const anim = mixAnims(armed, personExtras(eyesFrame(params.eyes), this.petCat !== null, droop, this.petFarCat !== null));

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
   * Річ у руках — у гнізді `held`, вудочка — у `rod` (граючись із котом — лише паличка: пір'я кружляє над котом), телефон
   * біля вуха (`anim` — `phone`) — у `held`; кота малює частина котів (у точці `hands`). Річ із ракурсами (пилосос — щітка на
   * підлозі попереду, §8.7) — кадром ракурсу персонажа (`heldView`): змінився ракурс — інший кадр.
   */
  private updateCargo(item: Item | null, anim: PersonAnimId, tool: CleaningTool): void {
    const want = this.hidden ? null : heldFrame(item, anim, tool);
    for (const socket of ["held", "rod"] as const) {
      const cargo = this.cargo[socket];
      const frame = want?.socket === socket ? want.frame : null;
      cargo.image.setVisible(frame !== null);
      if (!frame || !want) continue;
      const entry = artEntry(frame.id);
      const view = heldView(entry?.views, this.sprite.facing.view);
      const key = view ? `${frameKey(frame)}|${view}` : frameKey(frame);
      const shift = want.shift ?? null;
      if (cargo.key !== key || cargo.shift !== shift) {
        cargo.key = key;
        cargo.shift = shift;
        // `setArt` ставить origin у pivot кадру; зсув — інша точка кадру в гнізді (телефон визирає з-під кулака).
        setArt(cargo.image, frame.id, { state: frame.state, ...(view ? { view } : {}) });
        if (entry) cargo.image.setOrigin((entry.pivot.x + (shift?.x ?? 0)) / entry.size.w, (entry.pivot.y + (shift?.y ?? 0)) / entry.size.h);
      }
      if (cargo.scale !== want.scale) {
        // `setArt` зберігає масштаб відносно базового кадру — множимо саме його.
        cargo.image.setScale((cargo.image.scaleX / cargo.scale) * want.scale, (cargo.image.scaleY / cargo.scale) * want.scale);
        cargo.scale = want.scale;
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
    this.hands.lift = this.liftNow();
    this.updateBrush();
  }

  /**
   * Щітка пилососа чи віника в руках (`brush`): гніздо `held` плюс щітка кадру від хвату в ракурсі персонажа
   * (`personVacuumBrush`), повернута й віддзеркалена разом із гніздом.
   */
  private updateBrush(): void {
    const cargo = this.cargo.held;
    const brushed = cargo.key.startsWith("item/vacuum|") || cargo.key.startsWith("item/broom|");
    const socket = cargo.image.visible && brushed ? this.sprite.socket("held", this.tmpSocket) : null;
    this.brushShown = socket !== null;
    if (!socket) return;
    const at = socketPoint(socket, personVacuumBrush(this.sprite.facing.view));
    this.brushAt.x = at.x;
    this.brushAt.y = at.y;
  }

  /**
   * Бере кота на руки чи опускає (`pickUp`, `putDown` з котом): ваги (`liftWeights`) і де кисті підхоплюють кота у світі
   * (`personCatGrip` у системі кореня, віддзеркалений разом зі скелетом). Інакше — null.
   */
  private liftNow(): HandsLift | null {
    const shot = this.oneShot;
    if (this.hidden || !shot || shot.cat === null || (shot.anim !== "pickUp" && shot.anim !== "putDown")) return null;
    const facing = this.sprite.facing;
    const build = this.look?.build ?? 1;
    const key = `${facing.view}|${build}`;
    let grip = this.grips.get(key);
    if (!grip) {
      grip = personCatGrip(facing.view, personProportions({ build }));
      this.grips.set(key, grip);
    }
    const lift = this.lift;
    liftWeights(shot.anim, Math.min(shot.ms, Math.max(0, this.clock - shot.start)), lift);
    lift.cat = shot.cat;
    lift.at.x = this.sprite.x + (facing.flip ? -grip.x : grip.x);
    lift.at.y = this.sprite.y + grip.y;
    return lift;
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

    this.reachCat(this.arms.near, this.petCat, frame.time, registry, reachDepth);
    this.reachCat(this.arms.far, this.petFarCat, frame.time, registry, farReachDepth);
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

  /** Де кіт, до якого персонаж повернутий лицем: той, кого гладить чи з ким грається, а двох — точка між ними. */
  private touchPoint(reach: Reach): Point | null {
    const first = reach.pet ?? reach.petFar ?? reach.rod;
    const a = first === null ? null : (this.ctx.world.cat(first)?.root ?? null);
    const b = reach.pet !== null && reach.petFar !== null ? (this.ctx.world.cat(reach.petFar)?.root ?? null) : null;
    if (!a || !b) return a;
    this.touchAt.x = (a.x + b.x) / 2;
    this.touchAt.y = (a.y + b.y) / 2;
    return this.touchAt;
  }

  /** Рука `arm` гладить кота `cat` (null — рука схована, а слот скелета показує анімація). */
  private reachCat(arm: PetArm, cat: number | null, time: number, registry: IsoDepth, depthOf: (person: number, cat: number | null) => number): void {
    if (cat === null) {
      arm.image?.setVisible(false);
      return;
    }
    const drawn = this.ctx.world.cat(cat);
    const catDepth = registry.point(`cat:${cat}`)?.depth ?? null;
    this.placeArm(arm, drawn ? palmAt(drawn.back, time + arm.lag) : null, depthOf(this.depth, catDepth));
  }

  /**
   * Рука, що гладить: той самий запечений кадр, що в слоті скелета (там його сховано), у позі анімації `pet`,
   * повернута навколо плеча так, щоб кисть (`grip`) лягла на `palm` (спинка кота), і розтягнута не більше за
   * `REACH_STRETCH`. `palm` null — поза анімації як є.
   */
  private placeArm(arm: PetArm, palm: Point | null, depth: number): void {
    const rig = this.sprite.rig;
    const slot = rig.slot(arm.slot);
    if (slot.art === null) {
      arm.image?.setVisible(false);
      return;
    }
    const image = this.armImage(arm, slot.art, slot.state);
    let pose: PartPose = slot;
    const sign = this.sprite.facing.flip ? -1 : 1;
    const hand = palm ? rig.anchor(arm.anchor, this.tmpPoint, false) : null;
    if (palm && hand) {
      const bone = rig.bone(arm.slot).world;
      const shoulder = { x: bone.tx, y: bone.ty };
      // Ціль — у системі кореня скелета (обличчям праворуч), як і поза.
      const target = { x: (palm.x - this.sprite.x) * sign, y: palm.y - this.sprite.y };
      pose = reachedPose(slot, shoulder, hand, reachArm(shoulder, hand, target, arm.slot === "arm-far"));
    }
    // Віддзеркалений скелет дзеркалить і руку: місце по x, кут і масштаб по x — зі знаком.
    image
      .setPosition(this.sprite.x + sign * pose.x, this.sprite.y + pose.y)
      .setAngle(sign * pose.rot)
      .setScale(sign * arm.base.x * pose.sx, arm.base.y * pose.sy)
      .setDepth(depth)
      .setVisible(true);
  }

  /**
   * Зображення руки, що гладить, з кадром слота (стан, ракурс) і рецептом вигляду (дальня — затінена, як у скелеті); новий
   * кадр — лише коли щось змінилося.
   */
  private armImage(arm: PetArm, art: ArtId, state: string | null): Phaser.GameObjects.Image {
    const frame = slotFrame(art, artEntry(art), state, this.sprite.facing.view);
    const key = `${frame.frame}|${this.recipeVersion}`;
    let image = arm.image;
    if (image && arm.key === key) return image;
    const recipe = arm.slot === "arm-far" ? this.far : this.recipe;
    const opts = { state: frame.state, view: frame.view, owner: PERSON_OWNER };
    if (!image) {
      image = addBakedArt(this.ctx.scene, this.ctx.layer, art, recipe, opts);
      arm.image = image;
    } else {
      // `setBakedArt` зберігає масштаб відносно базового — спершу базовий.
      image.setScale(arm.base.x, arm.base.y);
      setBakedArt(image, art, recipe, opts);
    }
    arm.key = key;
    arm.base = { x: image.scaleX, y: image.scaleY };
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
    if (shot) this.pending = { anim: shot.anim, ms: shot.ms, place: shotPlace(event), before: this.lastHeld, cat: liftedCat(event) };
  }

  /** День показують заново: разові, ракурс і перехід до місця справи — з чистого аркуша. */
  reset(): void {
    this.oneShot = null;
    this.pending = null;
    this.fresh = false;
    this.lastHeld = null;
    this.facing = null;
    this.offset.x = 0;
    this.offset.y = 0;
    this.lastTime = null;
    this.main = null;
    this.pace.known = false;
    this.pace.vx = 0;
    this.pace.vy = 0;
  }

  destroy(): void {
    this.point.remove();
    this.sprite.destroy();
    for (const cargo of Object.values(this.cargo)) cargo.image.destroy();
    this.shadow.destroy();
    this.smell.destroy();
    this.sweepDust.destroy();
    this.line.destroy();
    this.feather.destroy();
    this.arms.near.image?.destroy();
    this.arms.far.image?.destroy();
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

/** Кого гладить кожна рука й з ким грається вудочкою (`reachTargets`). */
interface Reach {
  readonly pet: number | null;
  readonly petFar: number | null;
  readonly rod: number | null;
}

const NO_REACH: Reach = { pet: null, petFar: null, rod: null };

/** Рука, що гладить, поставлена поза скелетом: слот і кисть скелета, зсув погладжування й запечене зображення. */
interface PetArm {
  readonly slot: "arm-near" | "arm-far";
  readonly anchor: "hands" | "hands-far";
  /** Зсув погладжування, мс: дві руки гладять не в такт. */
  readonly lag: number;
  image: Phaser.GameObjects.Image | null;
  key: string;
  base: Vec2;
}

/** Дальня рука гладить на пів погладжування пізніше за ближню. */
const FAR_STROKE_LAG = 700;

type IsoDepth = ReturnType<typeof isoDepth>;

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
