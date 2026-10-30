// Коти ізометричного вигляду як частина світу (крок 16, T1, `GRAPHICS_PLAN.md`): кожен кіт — скелет зі запеченими
// частинами його шерсті й породи (`catview.ts`), що грає анімацію за тим, що кіт робить і відчуває (`catAnim`, `catFace`,
// разові від подій і стрибки — `catevents.ts`), дивиться в один із чотирьох ізометричних ракурсів (`catFacing`), стоїть
// там, де він є (`catspot.ts`: підлога, меблі, схованка, будиночок, барабан, переноска, ковдра, робот, руки), у парі —
// розсунутий уздовж екрана (`catPairs`), у клубку бійки — за хмарою пилу. Як і старий вигляд (`legacy/catsview.ts`):
// імена в нашийниках (§9.10), приховані числа режиму розробки (§11.5), точки для баблів і руки, що гладить, підсвітка
// кота-цілі (§8.2). Глибина — точки реєстру (`iso/depth.ts`).

import Phaser from "phaser";

import { brawlFoe, catAnim } from "../pose";
import type { GameEvent } from "../../sim/events";
import { showsPregnancy } from "../../sim/reproduction";
import type { Target } from "../../sim/targets";
import type { Cat, GameState, Vec } from "../../sim/types";
import { girthOf } from "../../sim/weight";
import { catFace, type CatFace } from "../anim/catface";
import { catFacing, personFacing } from "../anim/catfacing";
import { catEventAnims, catMemory, catTransition, type CatMemory } from "../anim/catevents";
import { CAT_ONE_SHOT_MS, CAT_OVERLAYS, type CatAnimId, type CatOneShotId } from "../anim/ids";
import { catPairs, type PairPlacement } from "../anim/pairs";
import { addArt, setArt } from "../art/atlas";
import { COLORS } from "../colors";
import type { RigFacing } from "../rig/types";
import type { PartContext } from "../world/context";
import { WORLD_LAYERS } from "../world/layers";
import type { CatPoints, CatsPart, Point, WorldFrame } from "../world/part";
import { ISO } from "../world/projection";
import { catSize, isoCatProportions, type CatSize } from "./catrig";
import { catSpot, raised, type CatSpot } from "./catspot";
import { IsoCatView, type CatFrame } from "./catview";
import { ISO_DEPTH_SLOT, isoDepth, type IsoDepth } from "./depth";

/** На скільки вбік від голови персонажа бабл кота, якого він тримає на руках, px (§11.4), — як у старому вигляді. */
const CARRIED_BUBBLE_SHIFT = 34;

/** Стрибок на меблі й з них (`jumpUp`, `jumpDown`): скільки триває підйом чи спуск і наскільки вище дуга, одиниці арту. */
const JUMP = { ms: CAT_ONE_SHOT_MS.jumpUp, arc: 14 } as const;

/** Хмара бійки (§9.4, «Клубок бійки»): на якій висоті над підлогою її середина, як швидко кипить і летить шерсть. */
const BRAWL = { height: 26, frameMs: 110, tufts: 3, tuftMs: 700, reach: 46 } as const;
const BRAWL_FRAMES = ["a", "b", "c"] as const;
/** Хмара — над обома котами клубка: над вищою з їхніх глибин, вище за половину проміжку точки. */
const CLOUD_ABOVE = ISO_DEPTH_SLOT * 0.6;

/**
 * Кіт далі за це від краю видимого світу (одиниці арту) — скелет не рахується й не малюється: на телефоні камера показує
 * частину квартири, а котів буває два десятки. Запас — більший за кота з баблом над ним, щоб на краю нічого не вискакувало.
 */
const CULL_MARGIN = 160;

/** Підсвітка кота-цілі (§8.2): сяйво (як у речей квартири, `iso/highlight.ts`); без WebGL — кільце на підлозі. */
const GLOW = { min: 2, pulse: 4, quality: 8, distance: 10 } as const;
const RING = { w: 58, h: 24, line: 4 } as const;

/** Разова анімація чи вираз кота, що зараз грає. */
interface Shot {
  anim: CatOneShotId | null;
  face: Partial<CatFace> | null;
  until: number;
  started: boolean;
}

/** Що частина пам'ятає про кота між кадрами. */
interface Memory {
  /** Де кіт був минулого кадру й куди дивився (`catFacing`). */
  pos: Vec | null;
  facing: RigFacing | null;
  /** Для стрибків і позіхання (`catTransition`). */
  transition: CatMemory | null;
  shot: Shot | null;
  /** Висота над підлогою: до якої йде стрибок, звідки й коли почався. */
  lift: { from: number; to: number; start: number } | null;
}

/** Хмара бійки двох котів. */
interface Cloud {
  image: Phaser.GameObjects.Image;
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
  private readonly webgl: boolean;
  /** Видимий світ із запасом (`CULL_MARGIN`): коти поза ним не рахуються. */
  private readonly visible = new Phaser.Geom.Rectangle();

  constructor(private readonly ctx: PartContext) {
    this.depth = isoDepth(ctx);
    this.webgl = ctx.scene.sys.game.renderer.type === Phaser.WEBGL;
  }

  update(state: GameState, frame: WorldFrame): void {
    this.wanted = null;
    const time = frame.time;
    const sizes = new Map<number, CatSize>();
    for (const cat of state.cats) sizes.set(cat.id, catSize(cat));
    const pairs = catPairs(state, (c) => sizes.get(c.id)?.relative ?? 1);
    const alive = new Set<number>();
    const seen = this.ctx.scene.cameras.main.worldView;
    this.visible.setTo(seen.x - CULL_MARGIN, seen.y - CULL_MARGIN, seen.width + CULL_MARGIN * 2, seen.height + CULL_MARGIN * 2);
    for (const cat of state.cats) {
      alive.add(cat.id);
      const size = sizes.get(cat.id) ?? catSize(cat);
      const view = this.viewOf(cat, size);
      const mem = this.memoryOf(cat.id);
      this.drawCat(state, cat, view, mem, size, pairs.get(cat.id) ?? null, time);
      this.drawHidden(cat, view, frame.showHidden);
      this.drawCollar(cat, view);
    }
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
      const depths = cloud.cats.map((id) => this.views.get(id)?.depth ?? Number.NaN).filter((d) => !Number.isNaN(d));
      if (depths.length === 0) continue;
      const d = Math.max(...depths) + CLOUD_ABOVE;
      cloud.image.setDepth(d);
      for (const tuft of cloud.tufts) tuft.setDepth(d + 0.0005);
    }
    this.applyHighlight();
  }

  onEvent(event: GameEvent, time: number): void {
    for (const shot of catEventAnims(event, this.ctx.state())) this.startShot(shot.cat, shot.anim, shot.face, shot.ms, time);
  }

  // --- Кіт ---------------------------------------------------------------------------------------

  private viewOf(cat: Cat, size: CatSize): IsoCatView {
    let view = this.views.get(cat.id);
    if (!view) {
      view = new IsoCatView(this.ctx.scene, this.ctx.layer, cat, (setDepth) => this.depth.addPoint(setDepth, { id: `cat:${cat.id}`, half: IsoCatView.half(size.scale) }));
      this.views.set(cat.id, view);
    }
    return view;
  }

  private memoryOf(id: number): Memory {
    let mem = this.memory.get(id);
    if (!mem) {
      mem = { pos: null, facing: null, transition: null, shot: null, lift: null };
      this.memory.set(id, mem);
    }
    return mem;
  }

  private startShot(cat: number, anim: CatOneShotId | null, face: Partial<CatFace> | null, ms: number, time: number): void {
    if (ms <= 0) return;
    this.memoryOf(cat).shot = { anim, face, until: time + ms, started: false };
  }

  private drawCat(state: GameState, cat: Cat, view: IsoCatView, mem: Memory, size: CatSize, pair: PairPlacement | null, time: number): void {
    // Стрибок на меблі чи з них, позіхання після сну — разові від зміни між кадрами.
    const transition = catTransition(state, cat, mem.transition);
    if (transition) this.startShot(cat.id, transition.anim, transition.face, transition.ms, time);
    mem.transition = catMemory(cat);
    if (cat.away !== null) {
      view.hide();
      mem.pos = null;
      mem.lift = null;
      return;
    }

    // Що грати: поза й накладка (`catAnim`), поверх — разова, поки триває.
    const choice = catAnim(state, cat);
    let anim: CatAnimId = choice.anim;
    let overlay: CatAnimId | null = choice.overlay;
    let speed = choice.speed;
    let restart = false;
    let face = catFace(state, cat, time);
    const shot = mem.shot;
    if (shot && time < shot.until) {
      if (shot.anim !== null) {
        if (CAT_OVERLAYS.has(shot.anim)) overlay = shot.anim;
        else {
          anim = shot.anim;
          speed = 1;
        }
        if (!shot.started) restart = true;
      }
      if (shot.face) face = { ...face, ...shot.face };
      shot.started = true;
    } else if (shot) {
      mem.shot = null;
    }

    const spot = catSpot(state, cat, anim, pair);
    // На руках і на колінах — туди ж, куди персонаж у світі (кіт не в гнізді скелета персонажа, а в точці його рук).
    const facing = spot.kind === "hands" ? personFacing(state, mem.facing) : catFacing(state, cat, mem.pos, { prev: mem.facing, pair });
    mem.facing = facing;
    mem.pos = { x: cat.x, y: cat.y };

    const root = this.place(view, spot, mem, time);
    const act = cat.act;
    const carrying = act.kind === "carry" && act.picked === true && act.dropped !== true;
    const toy = carrying && act.carry === "toy" ? state.home.items.find((item) => `item:${item.id}` === act.target) : undefined;
    const f: CatFrame = {
      anim,
      overlay,
      restart,
      speed,
      face,
      facing,
      root,
      scale: size.scale * spot.scale,
      proportions: isoCatProportions(cat, size),
      pregnant: showsPregnancy(state, cat),
      girth: girthOf(cat),
      show: spot.show,
      under: spot.kind === "under",
      shadow: spot.shadow,
      // Порожній прямокутник — камери ще немає (перший кадр): нікого не відкидати.
      culled: this.visible.width > CULL_MARGIN * 2 && !this.visible.contains(root.x, root.y),
      teeth: !carrying ? null : act.carry === "sock" ? { kind: "sock" } : { kind: "toy", quality: toy?.quality ?? "cheap" },
      time,
    };
    view.draw(cat, f);
  }

  /** Поставити точку кота в реєстр глибини й повернути, де на екрані корінь його скелета. */
  private place(view: IsoCatView, spot: CatSpot, mem: Memory, time: number): Point {
    if (spot.kind === "hands") {
      mem.lift = null;
      const hands = this.ctx.world.person.hands;
      this.placeOnPerson(view, hands.depth);
      return { x: hands.x, y: hands.y };
    }
    if (spot.above) view.point.placeAbove(spot.above.id, spot.above.offset);
    else if (spot.box) view.point.place(spot.at.x, spot.at.y, spot.box);
    else view.point.place(spot.at.x, spot.at.y);
    const s = ISO.toScreen(spot.at);
    const lift = this.lift(mem, spot, time);
    return { x: s.x + spot.offset.x, y: s.y + spot.offset.y - lift };
  }

  /**
   * Кіт на руках чи на колінах — поверх персонажа (§9.12): над його точкою реєстру (`person`), на глибині рук
   * (`hands.depth`), якщо вона в проміжку персонажа; інакше — на пів проміжку над ним, як старий кіт на ізометричній підлозі.
   */
  private placeOnPerson(view: IsoCatView, handsDepth: number): void {
    const person = this.depth.point("person");
    if (!person) {
      view.point.hide();
      view.sprite.setDepth(handsDepth);
      return;
    }
    const rel = handsDepth - person.depth;
    const offset = Number.isFinite(rel) && Math.abs(rel) < ISO_DEPTH_SLOT ? rel : IsoCatView.ABOVE;
    view.point.placeAbove("person", offset);
  }

  /** Висота над підлогою з плавним стрибком: на меблі й з них — дугою за час стрибка, решта — одразу. */
  private lift(mem: Memory, spot: CatSpot, time: number): number {
    const target = spot.lift;
    const jumping = raised(spot.kind) || spot.kind === "floor";
    if (!jumping || mem.lift === null) {
      mem.lift = { from: target, to: target, start: time - JUMP.ms };
      return target;
    }
    if (mem.lift.to !== target) {
      const now = liftAt(mem.lift, time);
      mem.lift = { from: now, to: target, start: time };
    }
    return liftAt(mem.lift, time);
  }

  // --- Хмара бійки -------------------------------------------------------------------------------

  /**
   * Клубок бійки (§9.4): над двома котами, що зійшлися, — хмара пилу (`fx/brawl-cloud`, кадри кипіння), з якої стирчать їхні
   * лапи й хвости (анімація `brawl`), і клапті шерсті, що летять навсібіч. Одна на пару — від кота з меншим номером.
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
        const tufts = Array.from({ length: BRAWL.tufts }, () => addArt(this.ctx.scene, this.ctx.layer, "fx/fur-flying"));
        cloud = { image, tufts, base: { cloud: image.scaleX, tuft: tufts[0]?.scaleX ?? 1 }, cats: [cat.id, foe.id], seen: true };
        this.clouds.set(key, cloud);
      }
      cloud.seen = true;
      const k = ((sizes.get(cat.id)?.scale ?? 1) + (sizes.get(foe.id)?.scale ?? 1)) / 2;
      const cx = view.root.x;
      const cy = view.root.y - BRAWL.height * k;
      setArt(cloud.image, "fx/brawl-cloud", { state: BRAWL_FRAMES[Math.floor(time / BRAWL.frameMs) % BRAWL_FRAMES.length] });
      cloud.image.setVisible(true).setPosition(cx, cy).setScale(cloud.base.cloud * k);
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
    return view ? { head: view.head, back: view.back } : null;
  }

  /** Над головою кота; кіт на руках — збоку від голови персонажа, щоб бабл не здавався його (§11.4). */
  anchor(id: string): Point | null {
    const [kind, raw] = id.split(":");
    if (kind !== "cat") return null;
    const number = Number(raw);
    const head = this.views.get(number)?.head;
    if (!head) return null;
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
      if (this.glowing) this.glowing.glow.outerStrength = GLOW.min + GLOW.pulse * wanted.alpha;
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

/** Висота стрибка в момент `time`: від `from` до `to` за `JUMP.ms` з дугою вгору. */
function liftAt(lift: { from: number; to: number; start: number }, time: number): number {
  const u = Math.min(1, Math.max(0, (time - lift.start) / JUMP.ms));
  if (u >= 1 || lift.from === lift.to) return lift.to;
  const ease = u * u * (3 - 2 * u);
  return lift.from + (lift.to - lift.from) * ease + Math.sin(u * Math.PI) * JUMP.arc;
}
