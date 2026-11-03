// Коти ізометричного вигляду як частина світу (крок 16, T1, `GRAPHICS_PLAN.md`): кожен кіт — скелет зі запеченими
// частинами його шерсті й породи (`catview.ts`), що грає анімацію за тим, що кіт робить і відчуває (`catAnim`, `catFace`,
// разові від подій і стрибки — `catevents.ts`), дивиться в один із чотирьох ізометричних ракурсів (`catFacing`), стоїть
// там, де він є (`catspot.ts`: підлога, меблі, схованка, будиночок, лоток, барабан, переноска, ковдра, робот, руки), у парі —
// розсунутий уздовж екрана (`catPairs`), у клубку бійки — на тлі хмари пилу. Як і старий вигляд (до кроку 16):
// імена в нашийниках (§9.10), приховані числа режиму розробки (§11.5), точки для баблів і руки, що гладить, підсвітка
// кота-цілі (§8.2). Глибина — точки реєстру (`iso/depth.ts`).

import Phaser from "phaser";

import { brawlFoe, catAnim, interactionWith, type CatAnimChoice } from "../pose";
import type { GameEvent } from "../../sim/events";
import { showsPregnancy } from "../../sim/reproduction";
import type { Target } from "../../sim/targets";
import type { Cat, GameState, Quality, Vec } from "../../sim/types";
import { hasDisease } from "../../sim/diseases";
import { coatOf } from "../../sim/genetics";
import { isSolid, itemPoint } from "../../sim/home";
import { absoluteMinute } from "../../sim/time";
import { girthOf } from "../../sim/weight";
import { catFace, type CatFace } from "../anim/catface";
import { catFacing, catMoving, facingFromTiles, holdFlip, personFacing, smoothHeading } from "../anim/catfacing";
import { catEventAnims, catMemory, catTransition, type CatMemory } from "../anim/catevents";
import { PERSON_ONE_SHOT_MS, type CatOneShotId } from "../anim/ids";
import { isoTileDir } from "../anim/iso";
import { PERSON_PICKUP_GRAB_MS, PERSON_PUTDOWN_RELEASE_MS } from "../rig/anims/person/move";
import { CAT_BRAWL_PHASE_MS } from "../rig/anims/cat/behavior";
import { catCrowds, catPairs, crowdMemory, perchCrowds, perchMemory, towardPerson, type CrowdMember, type PairPlacement, type PerchMember } from "../anim/pairs";
import { addArt, setArt } from "../art/atlas";
import { COAT_WHITE, PIGMENT_LOOK } from "../art/recipes";
import { COLORS } from "../colors";
import { highlightBoost, whitened } from "../light/lightmap";
import type { RigFacing } from "../rig/types";
import type { PartContext } from "../world/context";
import { WORLD_LAYERS } from "../world/layers";
import type { CatPoints, CatsPart, HandsLift, Point, WorldFrame } from "../world/part";
import { ISO } from "../world/projection";
import { CATCH, catchUp, catJump, catPlay, catStep, gaitRate, groundAt, nextGait, nextLift, putDownGround, startShot, stillPutDown, WALK_GAITS, type CatShot, type GaitMemory, type Lift, type PutDown } from "./catplay";
import { catSize, isoCatHalf, type CatSize } from "./catrig";
import { bowlOf, CAT_PIECE, catSpot, lapSeat, perchPlace, raised, type CatSpot, type CatSpotDepths, type CatSpotKind, type LapSeat } from "./catspot";
import { IsoCatView, type CatFrame } from "./catview";
import { ISO_DEPTH_SLOT, isoDepth, type IsoDepth } from "./depth";
import { liftedRoot, PERSON_DEPTH } from "./personlook";
import { CARRIER_GRATE_DEPTH } from "./floor";

/** На скільки вбік від голови персонажа бабл кота, якого він тримає на руках, px (§11.4), — як у старому вигляді. */
const CARRIED_BUBBLE_SHIFT = 34;

/**
 * Хмара бійки (§9.4, «Клубок бійки»): на якій висоті над підлогою її середина, наскільки вона менша за полотно (`scale`) і
 * бліда (`alpha`), як швидко кипить і летить шерсть.
 */
const BRAWL = { height: 24, scale: 0.78, alpha: 0.8, frameMs: 110, tufts: 4, tuftMs: 700, reach: 46 } as const;
const BRAWL_FRAMES = ["a", "b", "c"] as const;
/**
 * Хмара — позаду обох котів клубка (§9.4, поза 2: «позаду — бліда хмара пилу, що об'єднує двох в одну фігуру»; рецензія хвилі
 * 3): у проміжку дальшого з них, над тінню й під тулубом (`CAT_PIECE`), тож кулі обох котів, лапи, хвости й вуха — поверх неї,
 * і видно обидва забарвлення. Клапті шерсті, що летять, — над обома, вище за половину проміжку ближчого.
 */
const CLOUD_BEHIND = (CAT_PIECE.shadow + CAT_PIECE.body) / 2;
const TUFTS_ABOVE = ISO_DEPTH_SLOT * 0.6;

/**
 * Кіт далі за це від краю видимого світу (одиниці арту) — скелет не рахується й не малюється: на телефоні камера показує
 * частину квартири, а котів буває два десятки. Запас — більший за кота з баблом над ним, щоб на краю нічого не вискакувало.
 */
const CULL_MARGIN = 160;

/** Глибини інших частин, які треба знати, щоб поставити кота: ґратки переноски (`floor.ts`). */
const SPOT_DEPTHS: CatSpotDepths = { grate: CARRIER_GRATE_DEPTH };

/**
 * Кіт, якого беруть на руки чи опускають (рецензія хвилі 3): поза «на руках» і поза на підлозі змішуються, поки кіт іде з
 * кистями, а не за 120 мс у мить, коли він на пів дороги, — беручи, з миті, коли кисті підхопили кота (`PERSON_PICKUP_GRAB_MS`),
 * до кінця `pickUp`; опускаючи — з початку `putDown` до миті, коли кіт на підлозі (`PERSON_PUTDOWN_RELEASE_MS`). `root` — за
 * скільки мс корінь кота доходить до нового місця, коли він стає в руки чи сходить з них (гніздо рук на межі разових
 * персонажа, мс): без цього за кадр кіт перескакував.
 */
const LIFT_BLEND = { up: PERSON_ONE_SHOT_MS.pickUp - PERSON_PICKUP_GRAB_MS, down: PERSON_PUTDOWN_RELEASE_MS, root: 150 } as const;

/**
 * За скільки мс кіт доходить до свого місця в юрбі (`catCrowds`) на ≈ 63 %: прийшовши до персонажа чи до миски, він відступає
 * вбік кроком, а не перескакує.
 */
const CROWD_EASE_MS = 140;

/** Де кіт лежить на речі, і котів там розсуває юрба на речах (`perchCrowds`, `perchPlace`): меблі, будиночок, схованка. */
const PERCHED: ReadonlySet<CatSpotKind> = new Set<CatSpotKind>(["furniture", "house", "under"]);

/** Підписи над котами (імена в нашийниках, приховані числа), що налягли б один на одного, — один над одним із таким проміжком, px. */
const LABEL_GAP = 1;

/** Що кіт несе в зубах (`CatFrame.teeth`): сталі об'єкти, щоб щокадру не створювати нових. */
const SOCK = { kind: "sock" } as const;
const TOYS: Readonly<Record<Quality, { kind: "toy"; quality: Quality }>> = {
  cheap: { kind: "toy", quality: "cheap" },
  premium: { kind: "toy", quality: "premium" },
};

/**
 * Підсвітка кота-цілі (§8.2): сяйво (як у речей квартири, `iso/highlight.ts`; у темряві — сильніше й світліше, `HIGHLIGHT_DARK`);
 * без WebGL — кільце на підлозі (над картою світла, тож ніч його не гасить).
 */
const GLOW = { min: 2, pulse: 4, quality: 8, distance: 10 } as const;
const RING = { w: 58, h: 24, line: 4 } as const;

/** Що частина пам'ятає про кота між кадрами. */
interface Memory {
  /** Де кіт був минулого кадру й куди дивився (`catFacing`). */
  pos: Vec | null;
  facing: RigFacing | null;
  /** Згладжена швидкість кота, клітинок за секунду (`smoothHeading`): напрям руху для ракурсу. */
  heading: Vec;
  /** Коли кіт, що йде, востаннє віддзеркалився, мс сцени. */
  flipAt: number;
  /** Поза й накладка цього кадру (`catAnim`) і місце кота за нею (`catSpot`; null — не вдома): з першого проходу, для юрби. */
  choice: CatAnimChoice | null;
  spot: CatSpot | null;
  /** Зсув кота в юрбі зараз, клітинки: плавно йде до того, що каже `catCrowds` (`CROWD_EASE_MS`). */
  crowd: Vec;
  /** На скільки намальований кіт ще позаду свого місця на підлозі (клітинки): доганяє його (`CATCH`). */
  catchUp: Vec;
  /** Минулого кадру кіт стояв на підлозі (`floor`), і який тоді був зсув пари (клітинки): що змінилося, те стрибок. */
  floorWas: boolean;
  pairTile: Vec;
  /** Де кіт щодо рук персонажа минулого кадру: 0 — сам, 1 — на руках чи колінах, 2 — його беруть чи опускають. */
  hands: number;
  /** Котрий кіт на колінах персонажа цього кадру (`lapSeat`: 0 — перший); −1 — не на колінах. */
  lap: number;
  /** Корінь кота, що щойно став у руки чи зійшов з них, доходить до нового місця (`LIFT_BLEND.root`): зсув і коли почався. */
  rootFix: { x: number; y: number; start: number } | null;
  /** Для стрибків і позіхання (`catTransition`). */
  transition: CatMemory | null;
  shot: CatShot | null;
  /** Висота над підлогою: до якої йде стрибок, звідки й коли почався. */
  lift: Lift | null;
  /** Де була точка підлоги під котом і як швидко він іде на екрані: темп лап ходи й бігу (`gaitRate`). */
  gait: GaitMemory | null;
  /** Де кіт стояв на підлозі, коли персонаж почав брати його на руки (`Hands.lift`), px світу. */
  liftFrom: Point | null;
  /**
   * Кота опустили (`putDown`): де його поставив сим і де стояв персонаж. Поки обидва там і кіт не рушив (`stillPutDown`), він
   * стоїть, де його поставили руки, — зсув від точки сима в `crowd`, юрба його не зсуває.
   */
  putDown: PutDown | null;
  /** Розмір (кошеня, порода) і для якого віку й об'єкта кота його рахували: щокадру не перераховувати. */
  size: CatSize | null;
  sizeAge: number;
  sizeCat: Cat | null;
}

/** Хмара бійки двох котів. */
interface Cloud {
  image: Phaser.GameObjects.Image;
  /** Клапті шерсті — по черзі кольорів обох котів (`furColor`). */
  tufts: Phaser.GameObjects.Image[];
  /** Базовий масштаб хмари й клаптя (1 одиниця арту = 1 px світу): на нього множиться розмір котів. */
  base: { cloud: number; tuft: number };
  cats: [number, number];
  seen: boolean;
}

export class IsoCatsView implements CatsPart {
  private readonly depth: IsoDepth;
  private readonly views = new Map<number, IsoCatView>();
  private readonly memory = new Map<number, Memory>();
  private readonly clouds = new Map<string, Cloud>();
  /** Приховані числа над котами в режимі розробки (§11.5). */
  private readonly hiddenLabels = new Map<number, Phaser.GameObjects.Text>();
  /** Імена над котами в нашийниках (§9.10). */
  private readonly collarLabels = new Map<number, Phaser.GameObjects.Text>();
  /** Підсвітка: кого просили цього кадру, кого світимо зараз. */
  private wanted: { view: IsoCatView; alpha: number } | null = null;
  private glowing: { target: Phaser.GameObjects.Container; glow: Phaser.Filters.Glow } | null = null;
  private ring: Phaser.GameObjects.Graphics | null = null;
  /** Де на коті-цілі беремо яскравість карти світла (між лапами й головою): одна точка на всі кадри. */
  private readonly glowAt: Point = { x: 0, y: 0 };
  private readonly webgl: boolean;
  /** Видимий світ із запасом (`CULL_MARGIN`): коти поза ним не рахуються. */
  private readonly visible = new Phaser.Geom.Rectangle();
  /** Буфери кадру — живуть між кадрами, щоб щокадру не створювати нових: розміри котів, живі коти, кадр кота, підписи. */
  private readonly sizes = new Map<number, CatSize>();
  private readonly alive = new Set<number>();
  private readonly sizeOf = (cat: Cat): number => this.sizes.get(cat.id)?.relative ?? 1;
  private readonly frame: CatFrame = {
    anim: "sit",
    overlay: null,
    restart: false,
    speed: 1,
    phase: 0,
    blendMs: null,
    face: { eyes: "open", mouth: "closed", ears: "up" },
    facing: { view: "front", flip: false },
    root: { x: 0, y: 0 },
    ground: { x: 0, y: 0 },
    scale: 1,
    kitten: 0,
    pregnant: false,
    girth: 1,
    show: "rig",
    under: false,
    doorTail: false,
    shadow: false,
    teeth: null,
    culled: false,
    time: 0,
  };
  private readonly labelOrder: Phaser.GameObjects.Text[] = [];
  /** Юрба (`catCrowds`): хто стоїть на підлозі цього кадру й куди кого зсунути. */
  private readonly crowdMembers: CrowdMember[] = [];
  private readonly crowdShifts = new Map<number, Vec>();
  /** Місця юрби біля персонажа між кадрами (`catCrowds`). */
  private readonly crowdPlaces = crowdMemory();
  /**
   * Юрба на речах (`perchCrowds`): хто лежить на меблях, у будиночку чи під меблями цього кадру (записи — з `perchPool`, щоб
   * щокадру не створювати нових), і черга приходу.
   */
  private readonly perchMembers: PerchMember[] = [];
  private readonly perchPool: PerchMember[] = [];
  private readonly perchPlaces = perchMemory();
  /** Ігрова хвилина минулого кадру й скільки клітинок найшвидший кіт міг пробігти за цей кадр (`catStep`). */
  private minuteWas: number | null = null;
  private catStep = Number.POSITIVE_INFINITY;
  /** Буфери стрибка кота (`catJump`): щокадру не створювати нових. */
  private readonly moved: Vec = { x: 0, y: 0 };
  private readonly pairShift: Vec = { x: 0, y: 0 };
  private readonly jump: Vec = { x: 0, y: 0 };
  /** Спинка кота від кореня (кіт, якого беруть на руки чи опускають). */
  private readonly petOffset: Point = { x: 0, y: 0 };
  /** Скільки котів уже на колінах цього кадру (перший прохід) і місце кота на них (`lapSeat`). */
  private lapCount = 0;
  private readonly lapAt: LapSeat = { x: 0, y: 0, front: true };

  constructor(private readonly ctx: PartContext) {
    this.depth = isoDepth(ctx);
    this.webgl = ctx.scene.sys.game.renderer.type === Phaser.WEBGL;
  }

  update(state: GameState, frame: WorldFrame): void {
    this.wanted = null;
    const time = frame.time;
    const sizes = this.sizes;
    sizes.clear();
    for (const cat of state.cats) sizes.set(cat.id, this.sizeFor(cat));
    // Скільки клітинок найшвидший кіт міг пробігти за цей кадр — за ігровими хвилинами (швидкість гри режиму розробки теж).
    const minute = absoluteMinute(state.day, state.minute);
    const passed = this.minuteWas === null ? Number.NaN : minute - this.minuteWas;
    this.minuteWas = minute;
    this.catStep = catStep(passed);
    const pairs = catPairs(state, this.sizeOf);
    const crowd = this.crowd(state, pairs);
    const alive = this.alive;
    alive.clear();
    const seen = this.ctx.scene.cameras.main.worldView;
    this.visible.setTo(seen.x - CULL_MARGIN, seen.y - CULL_MARGIN, seen.width + CULL_MARGIN * 2, seen.height + CULL_MARGIN * 2);
    for (const cat of state.cats) {
      alive.add(cat.id);
      const size = sizes.get(cat.id) ?? catSize(cat);
      const view = this.viewOf(cat);
      const mem = this.memoryOf(cat.id);
      this.drawCat(state, cat, view, mem, size, pairs.get(cat.id) ?? null, crowd.get(cat.id) ?? null, time, frame.seconds);
      this.drawHidden(cat, view, frame.showHidden);
      this.drawCollar(cat, view);
    }
    // Підписи котів поруч (пара, клубок бійки) не налягають: вищий — над нижчим.
    this.separate(this.collarLabels);
    this.separate(this.hiddenLabels);
    for (const [id, view] of this.views) {
      if (alive.has(id)) continue;
      view.destroy();
      this.views.delete(id);
      this.memory.delete(id);
      this.hiddenLabels.get(id)?.destroy();
      this.hiddenLabels.delete(id);
      this.collarLabels.get(id)?.destroy();
      this.collarLabels.delete(id);
    }
    this.drawClouds(state, pairs, sizes, time);
  }

  /** Після всіх частин: глибини (реєстр), хмари над клубками, підсвітка. */
  lateUpdate(): void {
    this.depth.solve();
    for (const cloud of this.clouds.values()) {
      const a = this.views.get(cloud.cats[0])?.depth ?? Number.NaN;
      const b = this.views.get(cloud.cats[1])?.depth ?? Number.NaN;
      if (Number.isNaN(a) && Number.isNaN(b)) continue;
      const far = Number.isNaN(a) ? b : Number.isNaN(b) ? a : Math.min(a, b);
      const near = Number.isNaN(a) ? b : Number.isNaN(b) ? a : Math.max(a, b);
      cloud.image.setDepth(far + CLOUD_BEHIND);
      for (const tuft of cloud.tufts) tuft.setDepth(near + TUFTS_ABOVE);
    }
    this.applyHighlight();
  }

  onEvent(event: GameEvent, time: number): void {
    for (const shot of catEventAnims(event, this.ctx.state())) this.startShot(shot.cat, shot.anim, shot.face, shot.ms, time);
  }

  // --- Кіт ---------------------------------------------------------------------------------------

  /**
   * Вигляд кота. Півширина точки в реєстрі — з запасом на дорослого й найповнішого (`isoCatHalf`): вигляд живе, поки живе
   * кіт, а кошеня за цей час виростає й може погладшати.
   */
  private viewOf(cat: Cat): IsoCatView {
    let view = this.views.get(cat.id);
    if (!view) {
      const half = isoCatHalf(cat);
      view = new IsoCatView(this.ctx.scene, this.ctx.layer, cat, (setDepth) => this.depth.addPoint(setDepth, { id: `cat:${cat.id}`, half }));
      this.views.set(cat.id, view);
    }
    return view;
  }

  private memoryOf(id: number): Memory {
    let mem = this.memory.get(id);
    if (!mem) {
      mem = {
        pos: null,
        facing: null,
        heading: { x: 0, y: 0 },
        flipAt: Number.NEGATIVE_INFINITY,
        choice: null,
        spot: null,
        crowd: { x: 0, y: 0 },
        catchUp: { x: 0, y: 0 },
        floorWas: false,
        pairTile: { x: 0, y: 0 },
        hands: 0,
        lap: -1,
        rootFix: null,
        transition: null,
        shot: null,
        lift: null,
        gait: null,
        liftFrom: null,
        putDown: null,
        size: null,
        sizeAge: Number.NaN,
        sizeCat: null,
      };
      this.memory.set(id, mem);
    }
    return mem;
  }

  /** Розмір кота (`catSize`): рахується знову, лише коли змінився вік чи об'єкт кота. */
  private sizeFor(cat: Cat): CatSize {
    const mem = this.memoryOf(cat.id);
    if (mem.size === null || mem.sizeAge !== cat.ageWeeks || mem.sizeCat !== cat) {
      mem.size = catSize(cat);
      mem.sizeAge = cat.ageWeeks;
      mem.sizeCat = cat;
    }
    return mem.size;
  }

  private startShot(cat: number, anim: CatOneShotId | null, face: Partial<CatFace> | null, ms: number, time: number): void {
    const shot = startShot(anim, face, ms, time);
    if (shot) this.memoryOf(cat).shot = shot;
  }

  /**
   * Перший прохід кадру: поза (`catAnim`) і місце (`catSpot`) кожного кота — у пам'ять, — і зсуви юрби (`catCrowds`): хто стоїть
   * на підлозі не в парі майже в одній точці з іншими чи біля ніг персонажа; і юрби на речах (`perchCrowds`): хто лежить на
   * тій самій речі (меблі, будиночок, схованка під меблями).
   */
  private crowd(state: GameState, pairs: ReadonlyMap<number, PairPlacement>): ReadonlyMap<number, Vec> {
    const members = this.crowdMembers;
    members.length = 0;
    const perched = this.perchMembers;
    perched.length = 0;
    this.lapCount = 0;
    for (const cat of state.cats) {
      const mem = this.memoryOf(cat.id);
      mem.choice = catAnim(state, cat);
      mem.spot = null;
      // На колінах — за чергою (`state.cats` — за номером): перший з ближчого до камери боку, другий — з другого.
      mem.lap = cat.away === null && cat.act.kind === "lap" ? this.lapCount++ : -1;
      if (cat.away !== null) continue;
      const pair = pairs.get(cat.id) ?? null;
      const spot = catSpot(state, cat, mem.choice.anim, pair, SPOT_DEPTHS);
      mem.spot = spot;
      // На речі (не йде): з іншими на тій самій — рядком у межах її поверхні. Клубок бійки й кошенята біля матері — одна
      // фігура, їх не розсувають.
      const place = PERCHED.has(spot.kind) && !catMoving(cat) && pair?.kind !== "brawl" && pair?.kind !== "nursing" ? perchPlace(spot) : null;
      if (place) {
        const m = (this.perchPool[perched.length] ??= { id: 0, key: "", at: spot.at, size: 1, area: place.area, partner: null });
        m.id = cat.id;
        m.key = place.key;
        m.at = spot.at;
        m.size = this.sizeOf(cat);
        m.area = place.area;
        m.partner = pair?.with ?? null;
        perched.push(m);
      }
      // Кота щойно опустили — стоїть, де його поставили руки, і в юрбу не стає (`stillPutDown`).
      const lifting = this.ctx.world.person.hands.lift?.cat === cat.id;
      if (!stillPutDown(mem.putDown, cat, state.character.body, catMoving(cat), lifting)) mem.putDown = null;
      if (mem.putDown || pair || spot.kind !== "floor" || catMoving(cat)) continue;
      // Під рукою — теж до персонажа; звідки прийшов — з ракурсу, яким ішов (дивився праворуч — прийшов зліва).
      const touched = interactionWith(state, cat) !== null;
      const from = mem.facing ? (mem.facing.flip ? 1 : -1) : 0;
      // Їсть чи п'є з миски (дійшов до неї): з іншими біля тієї самої — обабіч неї.
      const bowl = spot.faces !== null ? bowlOf(state, cat) : null;
      members.push({
        id: cat.id,
        at: spot.at,
        size: this.sizeOf(cat),
        toPerson: touched || towardPerson(cat),
        touched,
        shift: mem.crowd,
        from,
        bowl: bowl ? { id: bowl.id, at: itemPoint(bowl) } : null,
      });
    }
    catCrowds(members, state.character.body, (x, y) => isSolid(state, x, y), this.crowdShifts, this.crowdPlaces);
    return perchCrowds(perched, this.crowdShifts, this.perchPlaces);
  }

  /**
   * Зсув кота в юрбі цього кадру (`Memory.crowd`): плавно до `target` (null — без зсуву); кадр без часу — як був. Вийшов із
   * юрби, а стоїть, де стояв (`hold`: персонаж відійшов, кота перестали гладити), — лишається там, де його намалювали, а не
   * ковзає в точку сима (у ноги персонажа): зсув знімається, коли кіт рушить.
   */
  private crowdShift(mem: Memory, target: Vec | null, hold: boolean, seconds: number, first: boolean): Vec {
    if (target === null && hold) return mem.crowd;
    const tx = target?.x ?? 0;
    const ty = target?.y ?? 0;
    const k = first ? 1 : seconds > 0 ? 1 - Math.exp((-seconds * 1000) / CROWD_EASE_MS) : 0;
    mem.crowd.x += (tx - mem.crowd.x) * k;
    mem.crowd.y += (ty - mem.crowd.y) * k;
    if (Math.abs(mem.crowd.x) < 1e-4 && Math.abs(mem.crowd.y) < 1e-4) {
      mem.crowd.x = 0;
      mem.crowd.y = 0;
    }
    return mem.crowd;
  }

  private drawCat(state: GameState, cat: Cat, view: IsoCatView, mem: Memory, size: CatSize, pair: PairPlacement | null, crowd: Vec | null, time: number, seconds: number): void {
    // Стрибок на меблі чи з них, позіхання після сну — разові від зміни між кадрами.
    const transition = catTransition(state, cat, mem.transition);
    if (transition) this.startShot(cat.id, transition.anim, transition.face, transition.ms, time);
    mem.transition = catMemory(cat);
    if (cat.away !== null) {
      view.hide();
      mem.pos = null;
      mem.floorWas = false;
      mem.lift = null;
      mem.gait = null;
      return;
    }

    // Що грати: поза й накладка (`catAnim`, з першого проходу), поверх — разова, поки триває.
    const choice = mem.choice ?? catAnim(state, cat);
    const { play, shot } = catPlay(choice, catFace(state, cat, time), mem.shot, time);
    mem.shot = shot;
    const { anim, overlay, restart, face } = play;

    // Персонаж бере кота на руки чи опускає (`Hands.lift`, T2): кіт біля рук, хоч сим уже й відпустив його, і йде з кистями.
    const handsLift = this.ctx.world.person.hands.lift;
    const lifting = handsLift && handsLift.cat === cat.id ? handsLift : null;
    if (lifting) this.markPutDown(mem, cat, state.character.body);
    // Місце — з першого проходу, якщо разова не змінила пози; на підлозі в юрбі — зсунутий уздовж екрана; щойно опущений —
    // там, де його поставили руки (зсув тримається, юрба не зсуває).
    const base = anim === choice.anim && mem.spot ? mem.spot : catSpot(state, cat, anim, pair, SPOT_DEPTHS);
    const floor = base.kind === "floor";
    // На речі (меблі, будиночок, схованка) — зсунутий у рядку юрби на речах (`perchCrowds`); вийшов з рядка, а лежить, де
    // лежав (сусід пішов), — лишається там, де його намалювали: місця не перебігають.
    const perched = PERCHED.has(base.kind);
    const put = mem.putDown !== null;
    const still = (perched || (floor && pair === null)) && !catMoving(cat) && mem.pos !== null && mem.pos.x === cat.x && mem.pos.y === cat.y;
    const shift = this.crowdShift(mem, (floor && !put) || perched ? crowd : null, still || put, seconds, mem.pos === null);
    // Сим переставив кота чи пара змінила зсув — доганяє нове місце (`CATCH`); далеко позаду — біжить туди лицем.
    const lag = this.catchUp(cat, mem, base, pair, seconds);
    const moved = (floor || perched) && (shift.x !== 0 || shift.y !== 0 || lag.x !== 0 || lag.y !== 0);
    const own = moved ? { ...base, at: { x: base.at.x + shift.x + lag.x, y: base.at.y + shift.y + lag.y } } : base;
    const catching = floor && anim === choice.anim && Math.hypot(lag.x, lag.y) > CATCH.run;
    const spot = lifting && own.kind !== "hands" ? { ...own, kind: "hands" as const } : own;
    this.liftFrom(state, view, mem, lifting, own);
    // На руках і на колінах — туди ж, куди персонаж у світі (кіт не в гнізді скелета персонажа, а в точці його рук). Іде — за
    // згладженим напрямом руху й не віддзеркалюючись надто часто (`smoothHeading`, `holdFlip`).
    if (mem.pos) smoothHeading(mem.heading, cat.x - mem.pos.x, cat.y - mem.pos.y, seconds);
    const was = mem.facing;
    const toward = catching ? facingFromTiles({ x: -lag.x, y: -lag.y }, was, true) : null;
    const faced =
      spot.kind === "hands"
        ? personFacing(state, was)
        : (toward ?? faceTo(catFacing(state, cat, mem.pos, { prev: was, pair, heading: mem.heading, at: own.kind === "floor" ? own.at : null }), spot));
    const facing = holdFlip(faced, was, spot.kind !== "hands" && (catMoving(cat) || catching), time - mem.flipAt);
    if (was && facing.flip !== was.flip) mem.flipAt = time;
    mem.facing = facing;
    if (mem.pos) {
      mem.pos.x = cat.x;
      mem.pos.y = cat.y;
    } else {
      mem.pos = { x: cat.x, y: cat.y };
    }

    const f = this.frame;
    f.scale = size.scale * spot.scale;
    this.place(view, spot, mem, time, f);
    // Опускають (сим уже відпустив): кіт там, де його ставлять руки, — і там лишиться, коли разова скінчиться.
    if (lifting && floor) this.keepPutDown(mem, base, f.ground);
    this.fixRoot(view, mem, spot.kind === "hands" ? (lifting ? 2 : 1) : 0, time, f);
    const act = cat.act;
    const carrying = act.kind === "carry" && act.picked === true && act.dropped !== true;
    // Беручи на руки й опускаючи: на підлозі — сидить, у руках — «на руках».
    // Беручи на руки: поза «на руках» — щойно кисті підхопили кота (поки ні — сидить), і змішується з сидінням увесь підйом;
    // опускаючи (сим уже відпустив) — поза на підлозі з першої миті, і змішується, поки кіт іде до підлоги (`LIFT_BLEND`).
    const sitting = anim === "carried" ? "sit" : anim;
    const held = state.character.held?.kind === "cat" && state.character.held.cat === cat.id;
    // Доганяє нове місце — біжить (травмований кульгає), якщо й так не йде.
    const body = catching && anim !== "run" && !WALK_GAITS.has(anim) ? (hasDisease(cat, "injury") ? "limp" : "run") : anim;
    f.anim = lifting ? (held && lifting.w > 0 ? "carried" : sitting) : body;
    f.blendMs = lifting ? (held ? LIFT_BLEND.up : LIFT_BLEND.down) : null;
    f.overlay = overlay;
    f.restart = restart;
    // Клубок бійки: обидва грають ту саму анімацію дзеркально — другий (з більшим номером) зі зсунутою фазою (N2).
    f.phase = anim === "brawl" && pair?.kind === "brawl" && cat.id > pair.with ? CAT_BRAWL_PHASE_MS : 0;
    f.face = face;
    f.facing = facing;
    // Хода й біг — у такт тому, як кіт іде на екрані (точка підлоги під ним), з довжиною його лап: лапи не ковзають.
    mem.gait = nextGait(mem.gait, f.ground.x, f.ground.y, seconds);
    f.speed = gaitRate(f.anim, mem.gait.speed, size.kitten, cat.shape.legs === "short", f.scale);
    f.kitten = size.kitten;
    f.pregnant = showsPregnancy(state, cat);
    f.girth = girthOf(cat);
    f.show = spot.show;
    f.under = spot.kind === "under";
    // Спить у будиночку: з темного входу видно ще й кінчик хвоста — самі заплющені очі там не видно.
    f.doorTail = spot.kind === "house" && act.kind === "sleep";
    // У клубку бійки тінь — сама хмара пилу під котами: тінь ближчого лягла б на хмару.
    f.shadow = lifting ? lifting.w < 0.5 : spot.shadow && !(anim === "brawl" && pair?.kind === "brawl");
    // Порожній прямокутник — камери ще немає (перший кадр): нікого не відкидати.
    f.culled = this.visible.width > CULL_MARGIN * 2 && !this.visible.contains(f.root.x, f.root.y);
    f.teeth = carrying ? this.teethOf(state, act.carry, act.target) : null;
    f.time = time;
    view.draw(cat, f);
  }

  /**
   * Наскільки намальований кіт ще позаду свого місця на підлозі (клітинки, `Memory.catchUp`): сим переставив кота далі, ніж
   * найшвидший кіт пробіг би за цей кадр (`catStep`), чи пара (`catPairs`) ввімкнула, змінила або зняла свій зсув, — кіт
   * доганяє нове місце (`CATCH`), а не перескакує за кадр. Не на підлозі (меблі, руки, схованка) — без цього: там свої стрибки.
   */
  private catchUp(cat: Cat, mem: Memory, base: CatSpot, pair: PairPlacement | null, seconds: number): Vec {
    const lag = mem.catchUp;
    const was = mem.pos;
    if (base.kind !== "floor" || was === null) {
      lag.x = 0;
      lag.y = 0;
      mem.floorWas = false;
      return lag;
    }
    const pairShift = this.pairShift;
    pairShift.x = pair?.tile.x ?? 0;
    pairShift.y = pair?.tile.y ?? 0;
    let jump: Vec | null = null;
    if (mem.floorWas) {
      this.moved.x = cat.x - was.x;
      this.moved.y = cat.y - was.y;
      pairShift.x -= mem.pairTile.x;
      pairShift.y -= mem.pairTile.y;
      jump = catJump(this.moved, pairShift, this.catStep, this.jump);
    }
    catchUp(lag, jump, seconds);
    mem.floorWas = true;
    mem.pairTile.x = pair?.tile.x ?? 0;
    mem.pairTile.y = pair?.tile.y ?? 0;
    return lag;
  }

  /**
   * Кіт став у руки чи зійшов з них (`hands` — де він щодо рук цього кадру, див. `Memory.hands`): корінь не перескакує в нове
   * місце (гніздо рук на межі разових персонажа), а доходить туди за `LIFT_BLEND.root` від того, де його намалювали востаннє.
   */
  private fixRoot(view: IsoCatView, mem: Memory, hands: number, time: number, f: CatFrame): void {
    if (hands !== mem.hands && view.shown) mem.rootFix = { x: view.root.x - f.root.x, y: view.root.y - f.root.y, start: time };
    mem.hands = hands;
    const fix = mem.rootFix;
    if (!fix) return;
    const e = (time - fix.start) / LIFT_BLEND.root;
    if (e >= 1) {
      mem.rootFix = null;
      return;
    }
    const k = 1 - e * e * (3 - 2 * e);
    f.root.x += fix.x * k;
    f.root.y += fix.y * k;
  }

  /** Що кіт несе в зубах (§9.12): шкарпетку чи іграшку її якості. */
  private teethOf(state: GameState, carry: "toy" | "sock" | undefined, target: string | null): CatFrame["teeth"] {
    if (carry === "sock") return SOCK;
    const toy = carry === "toy" ? state.home.items.find((item) => `item:${item.id}` === target) : undefined;
    return TOYS[toy?.quality ?? "cheap"];
  }

  /**
   * Поставити точку кота в реєстр глибини й записати в кадр, де на екрані корінь його скелета (з дугою стрибка) і поверхня
   * під ним (без дуги — там тінь).
   */
  private place(view: IsoCatView, spot: CatSpot, mem: Memory, time: number, f: CatFrame): void {
    if (spot.kind === "hands") {
      mem.lift = null;
      const hands = this.ctx.world.person.hands;
      if (hands.lift && mem.liftFrom) {
        this.placeOnPerson(view, hands.depth, null);
        // Спинка кота (гніздо `pet`) від кореня — з минулого кадру.
        this.petOffset.x = view.back.x - view.root.x;
        this.petOffset.y = view.back.y - view.root.y;
        liftedRoot(mem.liftFrom, hands.lift, this.petOffset, hands, f.root, f.ground);
        return;
      }
      // На колінах того, хто сидить спиною до камери, — упоперек колін, виступає збоку (`lapSeat`), а не в його силуеті.
      const lap = mem.lap >= 0 ? lapSeat(hands.facing?.view === "back", hands.facing?.flip === true, mem.lap, f.scale, this.lapAt) : null;
      this.placeOnPerson(view, hands.depth, lap);
      f.root.x = f.ground.x = hands.x + (lap?.x ?? 0);
      f.root.y = f.ground.y = hands.y + (lap?.y ?? 0);
      return;
    }
    if (spot.above) view.point.placeAbove(spot.above.id, spot.above.offset);
    else if (spot.box && spot.behind) view.point.placeUnder(spot.at.x, spot.at.y, spot.box);
    else if (spot.box) view.point.place(spot.at.x, spot.at.y, spot.box);
    else view.point.place(spot.at.x, spot.at.y);
    const s = ISO.toScreen(spot.at);
    const lift = this.lift(mem, spot, time);
    f.root.x = f.ground.x = s.x + spot.offset.x;
    f.root.y = s.y + spot.offset.y - lift;
    f.ground.y = s.y + spot.offset.y - (mem.lift ? groundAt(mem.lift, time) : lift);
  }

  /**
   * Де кіт стоїть на підлозі, поки персонаж бере його на руки чи опускає (`liftedRoot`): бере (сим уже тримає кота) — де його
   * намалювали востаннє перед тим, як персонаж узявся (кіт був на підлозі), опускає (сим уже відпустив) — під кистями
   * (`putDownGround`), і там лишиться, коли разова скінчиться (`keepPutDown`). Під кистями стіна чи меблі — на його місці на
   * підлозі за симом (`own`). Не бере й не опускає — забути.
   */
  private liftFrom(state: GameState, view: IsoCatView, mem: Memory, lifting: HandsLift | null, own: CatSpot): void {
    if (!lifting) {
      mem.liftFrom = null;
      return;
    }
    if (own.kind !== "hands") {
      mem.liftFrom ??= { x: 0, y: 0 };
      // Спинка кота від кореня — з минулого кадру (як у `place`).
      this.petOffset.x = view.back.x - view.root.x;
      this.petOffset.y = view.back.y - view.root.y;
      const under = putDownGround(lifting.at, this.petOffset, mem.liftFrom);
      const s = ISO.toScreen(own.at);
      const tile = isoTileDir({ x: under.x - s.x - own.offset.x, y: under.y - s.y - own.offset.y });
      if (view.shown && !isSolid(state, Math.floor(own.at.x + tile.x), Math.floor(own.at.y + tile.y))) return;
      mem.liftFrom.x = s.x + own.offset.x;
      mem.liftFrom.y = s.y + own.offset.y - own.lift;
    } else if (!mem.liftFrom) {
      mem.liftFrom = view.shown ? { x: view.root.x, y: view.root.y } : { x: lifting.at.x, y: lifting.at.y };
    }
  }

  /** Кота беруть чи опускають: запам'ятати, де його поставив сим і де стоїть персонаж (`stillPutDown`). */
  private markPutDown(mem: Memory, cat: Cat, body: Vec): void {
    const put = (mem.putDown ??= { cat: { x: 0, y: 0 }, person: { x: 0, y: 0 } });
    put.cat.x = cat.x;
    put.cat.y = cat.y;
    put.person.x = body.x;
    put.person.y = body.y;
  }

  /**
   * Опускають кота (сим уже відпустив): зсув від його місця за симом (`base`) до того, де він стоїть цього кадру (`ground`,
   * px світу), — у `crowd`, і без доганяння: коли разова скінчиться, кіт лишиться, де його поставили руки.
   */
  private keepPutDown(mem: Memory, base: CatSpot, ground: Point): void {
    const s = ISO.toScreen(base.at);
    const tile = isoTileDir({ x: ground.x - s.x - base.offset.x, y: ground.y - s.y - base.offset.y });
    mem.crowd.x = tile.x;
    mem.crowd.y = tile.y;
    mem.catchUp.x = 0;
    mem.catchUp.y = 0;
  }

  /**
   * Кіт на руках чи на колінах — поверх персонажа (§9.12): над його точкою реєстру (`person`), на глибині рук
   * (`hands.depth`), якщо вона в проміжку персонажа; інакше — на пів проміжку над ним, як старий кіт на ізометричній підлозі.
   * На колінах того, хто сидить спиною до камери (`lap`), — поверх персонажа чи за ним, як каже `lapSeat`.
   */
  private placeOnPerson(view: IsoCatView, handsDepth: number, lap: LapSeat | null): void {
    const person = this.depth.point("person");
    if (!person) {
      view.point.hide();
      view.sprite.setDepth(handsDepth);
      return;
    }
    const rel = lap ? (lap.front ? PERSON_DEPTH.cargoFront : PERSON_DEPTH.cargoBack) : handsDepth - person.depth;
    const offset = Number.isFinite(rel) && Math.abs(rel) < ISO_DEPTH_SLOT ? rel : IsoCatView.ABOVE;
    view.point.placeAbove("person", offset);
  }

  /** Висота над підлогою з плавним стрибком: на меблі й з них — дугою за час стрибка, решта — одразу. */
  private lift(mem: Memory, spot: CatSpot, time: number): number {
    const next = nextLift(mem.lift, spot.lift, raised(spot.kind) || spot.kind === "floor", time);
    mem.lift = next.lift;
    return next.now;
  }

  // --- Хмара бійки -------------------------------------------------------------------------------

  /**
   * Клубок бійки (§9.4): позаду двох котів, що зійшлися, — бліда хмара пилу (`fx/brawl-cloud`, кадри кипіння), менша за полотно,
   * а поверх неї — кулі обох котів із лапами, хвостами й вухами (анімація `brawl`) і клапті шерсті їхніх кольорів, що летять
   * навсібіч. Одна на пару — від кота з меншим номером.
   */
  private drawClouds(state: GameState, pairs: ReadonlyMap<number, PairPlacement>, sizes: ReadonlyMap<number, CatSize>, time: number): void {
    for (const cloud of this.clouds.values()) cloud.seen = false;
    for (const cat of state.cats) {
      const pair = pairs.get(cat.id);
      if (pair?.kind !== "brawl" || cat.id > pair.with) continue;
      const foe = brawlFoe(state, cat);
      const view = this.views.get(cat.id);
      if (!foe || !view?.shown) continue;
      const key = `${cat.id}-${foe.id}`;
      let cloud = this.clouds.get(key);
      if (!cloud) {
        const image = addArt(this.ctx.scene, this.ctx.layer, "fx/brawl-cloud", { state: "a" });
        const colors = [furColor(cat), furColor(foe)];
        const tufts = Array.from({ length: BRAWL.tufts }, (_, i) => {
          const tuft = addArt(this.ctx.scene, this.ctx.layer, "fx/fur-flying");
          // Клапоть сірий (greyHi): множення тону дає колір шерсті кота (без WebGL — лишається сірим).
          tuft.setTint(colors[i % colors.length] ?? COAT_WHITE);
          return tuft;
        });
        cloud = { image, tufts, base: { cloud: image.scaleX, tuft: tufts[0]?.scaleX ?? 1 }, cats: [cat.id, foe.id], seen: true };
        this.clouds.set(key, cloud);
      }
      cloud.seen = true;
      const k = ((sizes.get(cat.id)?.scale ?? 1) + (sizes.get(foe.id)?.scale ?? 1)) / 2;
      const cx = view.root.x;
      const cy = view.root.y - BRAWL.height * k;
      setArt(cloud.image, "fx/brawl-cloud", { state: BRAWL_FRAMES[Math.floor(time / BRAWL.frameMs) % BRAWL_FRAMES.length] });
      cloud.image.setVisible(true).setPosition(cx, cy).setScale(cloud.base.cloud * k * BRAWL.scale).setAlpha(BRAWL.alpha);
      cloud.tufts.forEach((tuft, i) => {
        const cycle = time / BRAWL.tuftMs + i / BRAWL.tufts + cat.id * 0.13;
        const p = cycle - Math.floor(cycle);
        const angle = i * 2.1 + cat.id + Math.floor(cycle) * 2.3;
        tuft
          .setVisible(true)
          .setPosition(cx + Math.cos(angle) * BRAWL.reach * p * k, cy + Math.sin(angle) * BRAWL.reach * 0.6 * p * k - p * 10 * k)
          .setAlpha(1 - p)
          .setScale(cloud.base.tuft * k);
      });
    }
    for (const [key, cloud] of this.clouds) {
      if (cloud.seen) continue;
      cloud.image.destroy();
      for (const tuft of cloud.tufts) tuft.destroy();
      this.clouds.delete(key);
    }
  }

  // --- Підписи ------------------------------------------------------------------------------------

  /**
   * Підписи над котами, що налягли б один на одного (пара, клубок бійки, коти поруч), — один над одним: від нижчого на екрані
   * до вищого кожен, що налягає на вже поставлений, піднімається над ним.
   */
  private separate(labels: ReadonlyMap<number, Phaser.GameObjects.Text>): void {
    const order = this.labelOrder;
    order.length = 0;
    for (const label of labels.values()) if (label.visible) order.push(label);
    if (order.length < 2) return;
    order.sort(byBottom);
    for (let i = 1; i < order.length; i++) {
      const label = order[i]!;
      // Кожне піднімання — над іншим підписом, тож за стільки кроків, скільки підписів нижче, він знайде вільне місце.
      for (let step = 0; step < i; step++) {
        let moved = false;
        for (let j = 0; j < i; j++) {
          const other = order[j]!;
          if (!overlap(label, other)) continue;
          label.setY(other.y - other.displayHeight - LABEL_GAP);
          moved = true;
        }
        if (!moved) break;
      }
    }
  }

  /** Режим розробки: настрій, здоров'я й любов над котом (§11.5). */
  private drawHidden(cat: Cat, view: IsoCatView, shown: boolean): void {
    let label = this.hiddenLabels.get(cat.id);
    if (!shown || !view.shown) {
      label?.setVisible(false);
      return;
    }
    if (!label) {
      label = this.ctx.scene.add
        .text(0, 0, "", { fontFamily: "system-ui, sans-serif", fontSize: "13px", color: "#ffffff", backgroundColor: "#1f1a24", padding: { x: 3, y: 1 }, resolution: 2 })
        .setOrigin(0.5, 1)
        .setDepth(WORLD_LAYERS.hidden)
        .addToDisplayList(this.ctx.layer);
      this.hiddenLabels.set(cat.id, label);
    }
    label.setVisible(true).setPosition(view.head.x, view.head.y - 30).setText(`н${Math.round(cat.mood)} з${Math.round(cat.health)} л${Math.round(cat.love)}`);
  }

  /** Ім'я над котом у нашийнику (§9.10). */
  private drawCollar(cat: Cat, view: IsoCatView): void {
    let label = this.collarLabels.get(cat.id);
    if (!cat.collar || cat.away !== null || !view.shown) {
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

  // --- Частина світу ------------------------------------------------------------------------------

  /** Коти нового стану — нові об'єкти, навіть якщо id ті самі. */
  reset(): void {
    this.clearHighlight();
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
    this.memory.clear();
    this.crowdPlaces.slots.clear();
    this.perchPlaces.order.clear();
    this.minuteWas = null;
    for (const cloud of this.clouds.values()) {
      cloud.image.destroy();
      for (const tuft of cloud.tufts) tuft.destroy();
    }
    this.clouds.clear();
    for (const label of this.hiddenLabels.values()) label.destroy();
    this.hiddenLabels.clear();
    for (const label of this.collarLabels.values()) label.destroy();
    this.collarLabels.clear();
  }

  destroy(): void {
    this.reset();
    this.ring?.destroy();
    this.ring = null;
  }

  points(cat: number): CatPoints | null {
    const view = this.views.get(cat);
    return view ? { head: view.head, back: view.back, mouth: view.mouth, root: view.root, facing: view.facing, scale: view.scale, rigShown: view.rigShown } : null;
  }

  /**
   * Над головою кота; кіт на руках — збоку від голови персонажа, щоб бабл не здавався його (§11.4). Кота не видно (поїздка,
   * сходи) — null: бабл не висить там, де кіт був.
   */
  anchor(id: string): Point | null {
    const [kind, raw] = id.split(":");
    if (kind !== "cat") return null;
    const number = Number(raw);
    const view = this.views.get(number);
    if (!view?.shown) return null;
    const head = view.head;
    const held = this.ctx.state().character.held;
    if (held?.kind === "cat" && held.cat === number) {
      const person = this.ctx.world.person.head;
      const side = head.x >= person.x ? 1 : -1;
      return { x: person.x + side * CARRIED_BUBBLE_SHIFT, y: head.y };
    }
    return head;
  }

  /** Кіт-ціль (§8.2): сяйво довкола нього (чи кільце на підлозі без WebGL). */
  highlight(target: Target, alpha: number): boolean {
    if (target.type !== "cat") return false;
    const view = this.views.get(target.cat.id);
    if (view?.shown) this.wanted = { view, alpha };
    return true;
  }

  private applyHighlight(): void {
    const wanted = this.wanted;
    const target = wanted && wanted.view.rigShown && this.webgl ? wanted.view.sprite : null;
    if (this.glowing && (this.glowing.target !== target || !this.glowing.target.active)) this.clearHighlight();
    if (target && wanted) {
      if (!this.glowing) {
        if (!target.filters) target.enableFilters();
        const filters = target.filters;
        if (filters) this.glowing = { target, glow: filters.internal.addGlow(COLORS.highlight, GLOW.min, 0, 1, false, GLOW.quality, GLOW.distance) };
      }
      if (this.glowing) {
        // Яскравість карти світла посередині кота — між лапами й головою.
        const { root, head } = wanted.view;
        this.glowAt.x = (root.x + head.x) / 2;
        this.glowAt.y = (root.y + head.y) / 2;
        const boost = highlightBoost(this.ctx.world.lightLevel(this.glowAt));
        const glow = this.glowing.glow;
        glow.outerStrength = (GLOW.min + GLOW.pulse * wanted.alpha) * boost.strength;
        const color = whitened(COLORS.highlight, boost.whiten);
        if (glow.color !== color) glow.color = color;
      }
    }
    // Без WebGL (чи коли видно лише очі) — кільце на підлозі довкола кота.
    const ringed = wanted && !target ? wanted : null;
    if (!ringed && !this.ring) return;
    const g = (this.ring ??= this.ctx.scene.add.graphics().setDepth(WORLD_LAYERS.marks - 0.5).addToDisplayList(this.ctx.layer));
    g.clear();
    if (!ringed) return;
    const k = ringed.view.scale;
    g.lineStyle(RING.line, COLORS.highlight, ringed.alpha).strokeEllipse(ringed.view.root.x, ringed.view.root.y, RING.w * k, RING.h * k);
  }

  private clearHighlight(): void {
    const current = this.glowing;
    if (current?.target.active) current.target.filters?.internal.remove(current.glow);
    this.glowing = null;
  }
}

/**
 * Ближче за це вздовж горизонталі екрана (клітинки x − y; ≈ 10 px) кіт стоїть не збоку від речі, а просто за нею (за мискою)
 * — тоді дивиться, як каже `catFacing`.
 */
const FACES_DEAD = 0.15;

/** Кіт збоку від речі (`CatSpot.faces`) дивиться на неї: ліворуч чи праворуч на екрані — до неї; ракурс — як був. */
function faceTo(facing: RigFacing, spot: CatSpot): RigFacing {
  if (!spot.faces) return facing;
  const d = spot.faces.x - spot.faces.y - (spot.at.x - spot.at.y);
  if (Math.abs(d) < FACES_DEAD) return facing;
  const flip = d < 0;
  return flip === facing.flip ? facing : { view: facing.view, flip };
}

/**
 * Колір шерсті кота для клаптів, що летять із бійки (§9.4): головний колір його забарвлення (§9.10) — ван білий, колорпойнт
 * світлий, табі — тло малюнка, решта — суцільний пігмент.
 */
function furColor(cat: Cat): number {
  const coat = coatOf(cat.genes, cat.shape);
  const look = PIGMENT_LOOK[coat.base];
  if (coat.white >= 3) return COAT_WHITE;
  if (coat.pointed) return look.pointBody;
  return coat.tabby ? look.ground : look.solid;
}

/** Підписи від нижчого на екрані до вищого (origin — низ посередині). */
const byBottom = (a: Phaser.GameObjects.Text, b: Phaser.GameObjects.Text): number => b.y - a.y;

/** Чи два підписи (origin — низ посередині) налягають. */
function overlap(a: Phaser.GameObjects.Text, b: Phaser.GameObjects.Text): boolean {
  const dx = Math.abs(a.x - b.x) * 2 < a.displayWidth + b.displayWidth;
  return dx && a.y > b.y - b.displayHeight && b.y > a.y - a.displayHeight;
}
