// Ефекти над світом нового вигляду (крок 16, хвиля 3, пакет «Стики будинку»): пара й дим над плитою, пара над пральною
// машиною, іскри з перегризеного дроту, хропіння, задишка й чхання котів — кадри `fx/*` A6. Що й коли — `fxlook.ts` (чисті
// функції), тут — малюнки, місце й глибина.
//
// Веде квартира (`apartment.ts`): вона оновлюється після котів, тож рот кота (`WorldQuery.cat`) уже цього кадру. Глибина —
// точки реєстру (`iso/depth.ts`): пара й дим — у проміжку своєї речі над її накладками (кіт, що виліз на стільницю, — над
// парою); іскри — точка на підлозі там, де дріт перекушено; ефект кота — над котом, а коли кіт дивиться від камери (`back`),
// — під ним: дихання йде туди, куди дивиться морда.

import type Phaser from "phaser";

import type { GameEvent } from "../../sim/events";
import { objectById, WIRE_TILE } from "../../sim/home";
import type { GameState } from "../../sim/types";
import { addArt, setArt } from "../art/atlas";
import type { ArtId } from "../art/types";
import type { PartContext } from "../world/context";
import type { Point } from "../world/part";
import { ISO } from "../world/projection";
import { isoDepth, type IsoDepth, type IsoPointHandle } from "./depth";
import {
  catFxShots,
  FX_DEPTH,
  pantState,
  puffState,
  snorePhase,
  snores,
  snoreState,
  sneezeLook,
  sparkState,
  sparking,
  stoveFx,
  washerFx,
  type CatFxKind,
  type ThingFx,
} from "./fxlook";
import { artOffset, objectScreen } from "./geometry";

/**
 * Звідки росте пара й дим і куди хилиться: точка запису речі (`pan` плити — конфорка зі сковородою, `top` пральної машини —
 * середина кришки), зсув від неї (одиниці арту) і нахил стовпчика, градуси. Над плитою й пральною машиною, поки вони
 * працюють, висить бабл стану (`DayScene`, §11.4) просто над серединою речі — і закрив би прямий стовпчик (перевірка
 * знімками): пара йде з лівого краю кришки й хилиться ліворуч, від хвостика бабла, тож видно і її, і бабл. У пральної машини
 * — з лівого дальнього боку кришки: праворуч від середини стоїть каністра засобу (A3).
 */
const PUFF_FROM = {
  stove: { point: "pan", shift: { x: -14, y: -12 }, angle: -34 },
  washer: { point: "top", shift: { x: -18, y: -6 }, angle: -30 },
} as const;

/** Півширина малюнка іскри на екрані для реєстру глибини. */
const SPARK_HALF = 21;

/** Ефект: малюнок, його точка в реєстрі й те, що показано (запис і стан) та в якому масштабі поверх базового. */
interface Fx {
  image: Phaser.GameObjects.Image;
  point: IsoPointHandle;
  key: string;
  /** Масштаб поверх базового (1 одиниця арту = 1 px світу), зі знаком — віддзеркалення. */
  factor: number;
}

/** Разовий ефект кота, що йде: котрий кіт, що, коли почався й коли скінчиться (мс сцени). */
interface Shot {
  cat: number;
  kind: Exclude<CatFxKind, "snore">;
  start: number;
  end: number;
}

export class IsoFxView {
  private readonly depth: IsoDepth;
  private stove: Fx | null = null;
  private washer: Fx | null = null;
  private spark: Fx | null = null;
  private readonly cats = new Map<number, Fx>();
  private readonly shots: Shot[] = [];
  /** Коли дріт перегризли (мс сцени): одразу після цього — довший сніп іскор. */
  private chewedAt = Number.NEGATIVE_INFINITY;
  /** Де пара плити й пральної машини й де дріт перекушено: речі не рухаються. */
  private readonly stoveAt: Point;
  private readonly washerAt: Point;
  private readonly sparkAt: Point;
  private readonly sparkCell: Point;
  /** Які коти мають ефект цього кадру (буфер між кадрами). */
  private readonly used = new Set<number>();

  constructor(private readonly ctx: PartContext) {
    this.depth = isoDepth(ctx);
    this.stoveAt = puffFrom("stove");
    this.washerAt = puffFrom("washer");
    // Дріт: кадр — у центрі клітинки `WIRE_TILE`, місце розриву — точка `cut` запису; клітинки розриву — для глибини.
    const tile = { x: WIRE_TILE.x + 0.5, y: WIRE_TILE.y + 0.5 };
    const wire = ISO.toScreen(tile);
    const cut = artOffset("env/wire", "cut") ?? { x: 0, y: 0 };
    this.sparkAt = { x: wire.x + cut.x, y: wire.y + cut.y };
    this.sparkCell = { x: tile.x + (cut.x / 64 + cut.y / 32) / 2, y: tile.y + (cut.y / 32 - cut.x / 64) / 2 };
  }

  /** Новий ефект: малюнок і точка в реєстрі. */
  private make(id: ArtId, state: string | null, half?: number): Fx {
    const image = addArt(this.ctx.scene, this.ctx.layer, id, { state });
    const point = this.depth.addPoint((d) => image.setDepth(d), half === undefined ? {} : { half });
    return { image, point, key: "", factor: 1 };
  }

  /** Показати на ефекті кадр `id`/`state` у точці `at` з масштабом `factor` (зі знаком — віддзеркалення). */
  private show(fx: Fx, id: ArtId, state: string | null, at: Point, factor = 1): void {
    const key = `${id}|${state ?? ""}`;
    if (fx.key !== key) {
      fx.key = key;
      setArt(fx.image, id, { state });
    }
    if (fx.factor !== factor) {
      // `setArt` зберігає масштаб відносно базового — тож базовий = теперішній / наш множник.
      fx.image.setScale((fx.image.scaleX / fx.factor) * factor, (fx.image.scaleY / Math.abs(fx.factor)) * Math.abs(factor));
      fx.factor = factor;
    }
    fx.image.setPosition(at.x, at.y).setVisible(true);
  }

  private hide(fx: Fx | null): void {
    if (!fx) return;
    fx.image.setVisible(false);
    fx.point.hide();
  }

  update(state: GameState, time: number): void {
    this.drawThing("stove", stoveFx(state), this.stoveAt, time);
    this.drawThing("washer", washerFx(state), this.washerAt, time);
    this.drawSpark(state, time);
    this.drawCats(state, time);
  }

  /** Пара чи дим над річчю `object` (плита, пральна машина). */
  private drawThing(object: "stove" | "washer", fx: ThingFx | null, at: Point, time: number): void {
    let view = object === "stove" ? this.stove : this.washer;
    if (!fx) {
      this.hide(view);
      return;
    }
    const id: ArtId = `fx/${fx}`;
    if (!view) {
      view = this.make(id, puffState(fx, time));
      if (object === "stove") this.stove = view;
      else this.washer = view;
    }
    this.show(view, id, puffState(fx, time), at);
    view.image.setAngle(PUFF_FROM[object].angle);
    view.point.placeAbove(object, FX_DEPTH.thing);
  }

  /** Іскри з перекушеного дроту (§9.12): спалахами. */
  private drawSpark(state: GameState, time: number): void {
    const frame = sparking(state) ? sparkState(time, time - this.chewedAt) : null;
    if (!frame) {
      this.hide(this.spark);
      return;
    }
    this.spark ??= this.make("fx/spark", frame, SPARK_HALF);
    this.show(this.spark, "fx/spark", frame, this.sparkAt);
    this.spark.point.place(this.sparkCell.x, this.sparkCell.y);
  }

  /** Хропіння сплячих і разові ефекти котів (задишка, чхання) — біля рота, туди, куди дивиться морда. */
  private drawCats(state: GameState, time: number): void {
    const used = this.used;
    used.clear();
    // Разові — понад хропіння (той, хто чхнув уві сні, на мить не хропе); чхання — понад задишку.
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const shot = this.shots[i]!;
      if (time >= shot.end) {
        this.shots.splice(i, 1);
        continue;
      }
      if (time < shot.start || used.has(shot.cat)) continue;
      if (shot.kind === "pant" && this.shots.some((s) => s.cat === shot.cat && s.kind === "sneeze" && time >= s.start && time < s.end)) continue;
      if (this.drawCat(shot.cat, shot.kind, time - shot.start, shot.end - shot.start)) used.add(shot.cat);
    }
    for (const cat of state.cats) {
      if (used.has(cat.id) || !snores(state, cat)) continue;
      if (this.drawCat(cat.id, "snore", time + snorePhase(cat.id), 0)) used.add(cat.id);
    }
    for (const [id, fx] of this.cats) {
      if (used.has(id)) continue;
      // Кота вже немає (віддали, помер) — прибрати; є — сховати до наступного разу.
      if (state.cats.some((c) => c.id === id)) this.hide(fx);
      else {
        destroyFx(fx);
        this.cats.delete(id);
      }
    }
  }

  /** Ефект кота `id`: `t` — мс від початку (для хропіння — час із зсувом кота), `ms` — тривалість разового. */
  private drawCat(id: number, kind: CatFxKind, t: number, ms: number): boolean {
    const points = this.ctx.world.cat(id);
    if (!points?.mouth || points.rigShown !== true) return false;
    const state = kind === "snore" ? snoreState(t, 0) : kind === "pant" ? pantState(t) : null;
    if (kind === "snore" && state === null) return false;
    const id_: ArtId = `fx/${kind}`;
    let fx = this.cats.get(id);
    if (!fx) {
      fx = this.make(id_, state);
      this.cats.set(id, fx);
    }
    const facing = points.facing ?? { view: "front", flip: false };
    let scale = points.scale ?? 1;
    let alpha = 1;
    if (kind === "sneeze") {
      const look = sneezeLook(ms > 0 ? t / ms : 1);
      scale *= look.scale;
      alpha = look.alpha;
    }
    this.show(fx, id_, state, points.mouth, facing.flip ? -scale : scale);
    fx.image.setAlpha(alpha);
    fx.point.placeAbove(`cat:${id}`, facing.view === "back" ? FX_DEPTH.catBack : FX_DEPTH.catFront);
    return true;
  }

  onEvent(event: GameEvent, time: number): void {
    if (event.type === "wire-chewed") this.chewedAt = time;
    for (const shot of catFxShots(event, this.ctx.state())) {
      // Новий разовий того самого виду замість старого.
      const old = this.shots.findIndex((s) => s.cat === shot.cat && s.kind === shot.kind);
      if (old >= 0) this.shots.splice(old, 1);
      this.shots.push({ cat: shot.cat, kind: shot.kind, start: time + shot.delay, end: time + shot.delay + shot.ms });
    }
  }

  /** Новий день чи нова гра: id котів можуть означати вже інших. */
  reset(): void {
    this.shots.length = 0;
    this.chewedAt = Number.NEGATIVE_INFINITY;
    for (const fx of this.cats.values()) destroyFx(fx);
    this.cats.clear();
  }

  destroy(): void {
    this.reset();
    for (const fx of [this.stove, this.washer, this.spark]) if (fx) destroyFx(fx);
    this.stove = null;
    this.washer = null;
    this.spark = null;
  }
}

/** Звідки росте пара над річчю (`PUFF_FROM`), px світу. */
function puffFrom(object: keyof typeof PUFF_FROM): Point {
  const from = PUFF_FROM[object];
  const at = objectScreen(objectById(object));
  const point = artOffset(`env/${object}`, from.point) ?? { x: 0, y: 0 };
  return { x: at.x + point.x + from.shift.x, y: at.y + point.y + from.shift.y };
}

function destroyFx(fx: Fx): void {
  fx.point.remove();
  fx.image.destroy();
}
