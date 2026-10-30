// Персонаж нового вигляду (крок 16, T2, `GRAPHICS_PLAN.md`): скелет `PERSON_RIG` у Phaser (`RigSprite`) з частинами,
// запеченими за виглядом (`personRecipe`: шкіра, волосся, очі, одяг; плями на одязі, коли чистого немає, §8.7), дальні рука,
// нога й черевик затінені (`farRecipe`, `PERSON_FAR_SLOTS`), тінь під ногами (`fx/shadow/person`) — рішення автора 2026-10-30.
//
// Що грає — `personAnim` (основна з `PERSON_ANIMS`, накладка рук, ракурс, поступ засинання) і `personEventAnim` (разові від
// подій), зведені в одну анімацію `mixAnims` (`personmix.ts`); де видно й куди дивиться — `personSpot` (за столом, за
// комп'ютером, біля ліжка, лицем до кота). Гнізда: річ у руках (`held`: страва, судочок, совок), вудочка (`rod`) з волосінню
// до пір'їнки над котом під час гри, рука, що гладить, — на спинці кота (`personreach.ts`); кіт на руках і на колінах — у
// точці й на глибині `hands` (його кладе туди частина котів). Брудний одяг — плями й запах (`fx/smell`). У поїздці й у
// душовій кабіні персонажа не видно (§8.5, §8.7). Засинаючи (§8.8), заплющує очі (`person/eyes`: `half`, `closed`), а голова
// хилиться.
//
// Глибина — точка «person» у реєстрі (`iso/depth.ts`); у її проміжку знизу догори: тінь, кіт на руках ззаду (ракурс `back`),
// сам персонаж, кіт на руках спереду, запах. Рука, що гладить, і вудочка — над усім світом (`WORLD_LAYERS.interaction`), як у
// старому вигляді. Що показує старий вигляд — `legacy/personview.ts`, `legacy/person.ts`.

import Phaser from "phaser";

import { petOver } from "../../sim/actions";
import type { GameEvent } from "../../sim/events";
import type { GameState, Item, Look } from "../../sim/types";
import { PALETTE as ART } from "../../../art/palette";
import { PERSON_BY_PROGRESS, type PersonAnimId } from "../anim/ids";
import { facingFromTiles } from "../anim/catfacing";
import { personAnim, personEventAnim, type PersonAnimChoice } from "../anim/personanim";
import { addArt, setArt } from "../art/atlas";
import { releaseBaked } from "../art/bake";
import { farRecipe, personColors, personRecipe } from "../art/recipes";
import type { ArtId, TintRecipe } from "../art/types";
import { PERSON_ANIMS } from "../rig/anims/index";
import { PERSON_FAR_SLOTS, PERSON_FIT, PERSON_RIG, personProportions, personSkin, type PersonSlot } from "../rig/defs/person";
import { RigSprite, type RigSpriteOf } from "../rig/rigsprite";
import type { AnimOf, RigFacing } from "../rig/types";
import type { PartContext } from "../world/context";
import { WORLD_LAYERS } from "../world/layers";
import type { Hands, PersonPart, Point, WorldFrame } from "../world/part";
import { isoDepth, type IsoPointHandle } from "./depth";
import { ANCHOR_GAP, artOffset } from "./geometry";
import type { IsoFrame } from "./looks";
import { cargoDepth, catSocket, eyesFrame, heldFrame, movesHead, PERSON_DEPTH, SLEEP_DROOP } from "./personlook";
import { mixAnims, type MixExtras } from "./personmix";
import { armSegment, featherAt, palmAt, PET_ARM } from "./personreach";
import { glideOffset, personSpot } from "./personspot";

type PersonAnim = AnimOf<typeof PERSON_RIG>;

/** Власник запечених кадрів персонажа (бюджет `bake.ts`). */
export const PERSON_OWNER = "person";

/** Над пір'їнкою волосінь і рука, що гладить: пір'їнка — на стільки вище за них. */
const FEATHER_DEPTH = 0.5;

/** Як часто хвилі запаху міняють кадр, мс (як над брудним лотком, `iso/floor.ts`). */
const SMELL_MS = 450;

/** Ширина тіні під ногами за статурою (`BUILDS`: струнка, звичайна, кремезна). */
const SHADOW_WIDTH = [0.9, 1, 1.15] as const;
/** Товщина рук за статурою — як `personProportions` (`PERSON_RIG.proportions`). */
const LIMB_WIDTH = [0.88, 1, 1.15] as const;

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

export class IsoPersonView implements PersonPart {
  private readonly sprite: RigSpriteOf<typeof PERSON_RIG>;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly smell: Phaser.GameObjects.Image;
  private readonly cargo: Record<"held" | "rod", Cargo>;
  /** Рука, що гладить, і волосінь вудочки — над світом. */
  private readonly reach: Phaser.GameObjects.Graphics;
  /** Пір'їнка над котом під час гри: кадр вудочки «схована» — видно лише пір'їнку. */
  private readonly feather: Phaser.GameObjects.Image;
  private featherKey = "";
  private readonly point: IsoPointHandle;
  /** Глибина точки з останнього розв'язку реєстру. */
  private depth = 0;

  /** Вигляд, за яким складено обвіс і рецепти (копія `Look`), і чи одяг брудний. */
  private look: Look | null = null;
  private stained = false;
  private recipe: TintRecipe;
  private far: TintRecipe;
  private readonly farSlots: ReadonlySet<string> = new Set<string>(PERSON_FAR_SLOTS);

  /** Годинник анімацій, мс: час сцени × швидкість (`PersonAnimParams.speed`). */
  private clock = 0;
  private lastTime: number | null = null;
  private facing: RigFacing | null = null;
  /** Зсув вигляду від точки тіла до місця справи, клітинки (`glideOffset`). */
  private offset = { x: 0, y: 0 };
  private oneShot: OneShot | null = null;
  /** Подія цього кадру, що просить разову анімацію (`onEvent` → наступний `update`). */
  private pending: { anim: PersonAnimId; ms: number } | null = null;
  /** Основна анімація, яку грали минулого кадру (до зведення): та сама — зведена продовжує її фазу. */
  private main: PersonAnim | null = null;
  private choice: PersonAnimChoice | null = null;
  private hidden = true;
  /** Гладить: ближню руку скелета сховано, її малює вигляд — до спинки кота (`lateUpdate`). */
  private reaching = false;

  head: Point = { x: 0, y: 0 };
  hands: Hands = { x: 0, y: 0, depth: 0 };

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
    ctx.layer.add(this.sprite);
    this.smell = addArt(scene, ctx.layer, "fx/smell", { state: "a" }).setVisible(false);
    this.cargo = {
      held: this.socketImage("held", { id: "item/dish/meal", state: "cheap" }),
      rod: this.socketImage("rod", { id: "item/toy/cheap", state: "hand" }),
    };
    this.reach = scene.add.graphics().setDepth(WORLD_LAYERS.interaction).addToDisplayList(ctx.layer);
    this.feather = addArt(scene, ctx.layer, "item/toy/cheap", { state: "hidden" }).setDepth(WORLD_LAYERS.interaction + FEATHER_DEPTH).setVisible(false);
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

    // Де видно й куди дивиться: за справою — на її місці, лицем до цілі.
    const spot = personSpot(state, choice.anim);
    const body = character.body;
    this.offset = glideOffset(this.offset, { x: spot.at.x - body.x, y: spot.at.y - body.y }, dt / 1000);
    const at = { x: body.x + this.offset.x, y: body.y + this.offset.y };
    const facing: RigFacing = (spot.face && facingFromTiles(spot.face, this.facing)) || { view: choice.view, flip: choice.flip };
    this.facing = facing;

    // Спершу ракурс: новий ракурс — нова вихідна поза, і `play` не змішує з позою старого.
    this.sprite.setFacing(facing);
    this.play(choice);
    const feet = this.ctx.projection.toScreen(at);
    this.sprite.setPosition(feet.x, feet.y);
    this.sprite.update(this.clock);
    this.sprite.setVisible(!this.hidden);

    // Тінь під ногами (не частина скелета: лишається на підлозі), запах над головою.
    const build = clampIndex(character.look.build, SHADOW_WIDTH.length);
    this.shadow.setPosition(feet.x, feet.y).setScale(SHADOW_WIDTH[build] ?? 1, 1).setVisible(!this.hidden);
    this.updateCargo(character.held);
    this.updatePoints();
    const smelly = params.dirty && !this.hidden;
    this.smell.setVisible(smelly);
    if (smelly) {
      setArt(this.smell, "fx/smell", { state: Math.floor(time / SMELL_MS) % 2 === 0 ? "a" : "b" });
      this.smell.setPosition(this.head.x, this.head.y + ANCHOR_GAP);
    }
    if (this.hidden) this.point.hide();
    else this.point.place(at.x, at.y);
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
    this.sprite.setBaked(this.baked());
  }

  /**
   * Анімація кадру: разова від події (поки грає) чи основна з накладкою рук; зверху — очі засинання, рука, що гладить
   * (її малює вигляд), і голова, що хилиться. За поступом (засинання) — час анімації з поступу, інакше — годинник; та сама
   * основна, лише з іншою накладкою чи очима, продовжує свою фазу.
   */
  private play(choice: PersonAnimChoice): void {
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
    const main = PERSON_ANIMS[shot ? shot.anim : choice.anim];
    const overlay = !shot && choice.overlay ? PERSON_ANIMS[choice.overlay] : null;
    const eyes = eyesFrame(params.eyes);
    this.reaching = !shot && !params.hidden && choice.anim === "pet";
    const extras: MixExtras = {
      ...(eyes ? { frames: { eyes } } : {}),
      ...(this.reaching ? { hidden: ["arm-near"] } : {}),
      ...(!shot && asleep && PERSON_BY_PROGRESS.has(choice.anim) && !movesHead(main) ? { ramp: { head: SLEEP_DROOP } } : {}),
    };
    const anim = mixAnims(main, overlay, extras);

    // Час — годинник анімацій (`clock`), тож `Rig.play` напряму: `RigSprite.play` узяв би час минулого кадру.
    const rig = this.sprite.rig;
    if (shot) {
      if (fresh || rig.anim !== anim) rig.play(anim, this.clock, { restart: true });
    } else if (asleep) {
      // За поступом: час — частка тривалості; без змішування (поза на початку засинання — та сама, що стоячи).
      rig.play(anim, this.clock, { restart: true, from: (params.progress ?? 0) * anim.duration, blend: 0 });
    } else if (rig.anim !== anim) {
      const from = this.main === main && anim.loop ? rig.time(this.clock) % anim.duration : 0;
      rig.play(anim, this.clock, { from, loop: choice.loop });
    }
    this.main = main;
  }

  /** Річ у руках — у гнізді `held`, вудочка — у `rod`; кота малює частина котів (у точці `hands`). */
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
    }
  }

  /** Над головою (бабли, камера) і руки (кіт на руках чи на колінах) — з пози скелета цього кадру. */
  private updatePoints(): void {
    const top = this.sprite.anchor("head");
    if (top) this.head = { x: top.x, y: top.y - ANCHOR_GAP };
    const socket = this.sprite.socket(catSocket(this.choice?.anim ?? "idle"));
    if (socket) this.hands = { x: socket.x, y: socket.y, depth: cargoDepth(this.depth, this.sprite.facing.view === "back") };
  }

  /**
   * Після котів (`World.update`): рука, що гладить, лягає на спинку кота, а пір'їнка вудочки кружляє над ним — там, де кота
   * намальовано цього кадру. Потім — розв'язок глибини.
   */
  lateUpdate(state: GameState, frame: WorldFrame): void {
    const g = this.reach.clear();
    this.feather.setVisible(false);
    const activity = state.character.activity;
    const look = state.character.look;
    if (this.reaching && activity?.kind === "pet" && !petOver(activity)) {
      const cat = this.ctx.world.cat(activity.cat);
      if (cat) this.drawPetArm(g, look, palmAt(cat.back, frame.time));
    } else if (!this.hidden && activity?.kind === "play" && activity.done !== true && this.choice?.anim === "rod") {
      const cat = this.ctx.world.cat(activity.cat);
      const toy = state.character.held?.kind === "toy" ? state.character.held.toy.quality : "cheap";
      if (cat) this.drawRodLine(g, toy, featherAt(cat.head, frame.time));
    }
    isoDepth(this.ctx).solve();
    // Розв'язок міг змінити глибину: руки — з новою.
    this.hands.depth = cargoDepth(this.depth, this.sprite.facing.view === "back");
  }

  /** Рука від плеча (поза скелета цього кадру; ближню руку скелета сховано) до долоні на спинці кота. */
  private drawPetArm(g: Phaser.GameObjects.Graphics, look: Look, palm: Point): void {
    const bone = this.sprite.rig.bone("arm-near").world;
    const flip = this.sprite.facing.flip ? -1 : 1;
    const shoulder = { x: this.sprite.x + bone.tx * flip, y: this.sprite.y + bone.ty };
    const colors = personColors(look);
    const k = LIMB_WIDTH[clampIndex(look.build, LIMB_WIDTH.length)] ?? 1;
    const sleeve = PET_ARM.sleeve * k;
    const { from, to } = armSegment(shoulder, palm);
    const ink = hex(ART.ink);
    // Рукав-«сосиска»: контур — ширший рукав чорнилом, поверх — рукав кольором верху.
    thickLine(g, from, to, sleeve + PET_ARM.ink, ink);
    thickLine(g, from, to, sleeve - PET_ARM.ink, colors.top);
    // Долоня-«рукавичка».
    const { rx, ry } = PET_ARM.palm;
    g.fillStyle(ink).fillEllipse(palm.x, palm.y, (rx + PET_ARM.ink / 2) * 2, (ry + PET_ARM.ink / 2) * 2);
    g.fillStyle(colors.skin).fillEllipse(palm.x, palm.y, (rx - PET_ARM.ink / 2) * 2, (ry - PET_ARM.ink / 2) * 2);
  }

  /** Волосінь від кінця вудочки (точка `feather` кадру в руці) до пір'їнки над котом. */
  private drawRodLine(g: Phaser.GameObjects.Graphics, quality: string, tip: Point): void {
    const id: ArtId = `item/toy/${quality}`;
    const socket = this.sprite.socket("rod");
    const offset = artOffset(id, "feather");
    if (!socket) return;
    const from = offset ? socketPoint(socket, offset) : { x: socket.x, y: socket.y };
    g.lineStyle(PET_ARM.line, hex(ART.ink), 0.85).lineBetween(from.x, from.y, tip.x, tip.y);
    // Пір'їнка: кадр вудочки «схована» (видно лише пір'їнку), щоб її точка `feather` була там, куди веде волосінь.
    const key = `${id}|hidden`;
    if (this.featherKey !== key) {
      this.featherKey = key;
      setArt(this.feather, id, { state: "hidden" });
    }
    this.feather.setPosition(tip.x - (offset?.x ?? 0), tip.y - (offset?.y ?? 0)).setVisible(true);
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
    this.offset = { x: 0, y: 0 };
    this.lastTime = null;
    this.main = null;
  }

  destroy(): void {
    this.point.remove();
    this.sprite.destroy();
    for (const cargo of Object.values(this.cargo)) cargo.image.destroy();
    this.shadow.destroy();
    this.smell.destroy();
    this.reach.destroy();
    this.feather.destroy();
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

function clampIndex(i: number, n: number): number {
  return ((Math.trunc(i) % n) + n) % n;
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

/** Товста лінія з круглими кінцями. */
function thickLine(g: Phaser.GameObjects.Graphics, a: Point, b: Point, width: number, color: number): void {
  g.lineStyle(width, color).lineBetween(a.x, a.y, b.x, b.y);
  g.fillStyle(color).fillCircle(a.x, a.y, width / 2).fillCircle(b.x, b.y, width / 2);
}
