// Увесь світ на екрані (крок 16, хвиля 0): шість частин і проєкція, через які сцена малює кадр і питає, де що. Частини
// створює фабрика (`factory.ts`). Без Phaser.

import type { GameEvent } from "../../sim/events";
import { CARRIER_TARGET, VACUUM_TARGET, type Target } from "../../sim/targets";
import type { GameState } from "../../sim/types";
import { BASKET_ANCHOR, type CatPoints, type PersonPart, type Point, type WorldFrame, type WorldPart, type WorldParts, type WorldQuery } from "./part";
import type { Projection } from "./projection";

export class World implements WorldQuery {
  private parts: WorldParts | null = null;

  constructor(readonly projection: Projection) {}

  /** Підключити частини: їх створюють уже з цим світом, бо частини питають одна одну через нього. */
  attach(parts: WorldParts): void {
    this.parts = parts;
  }

  private get all(): WorldParts {
    if (!this.parts) throw new Error("Частини світу ще не створено");
    return this.parts;
  }

  /**
   * Порядок оновлення за тим, хто кого питає: персонаж (його руки потрібні котові на руках), коти, куточок, квартира
   * (сховища з'являються після котів), позначки (їм потрібні якорі всіх), світло доби (§8.9: його точки в реєстрі глибини —
   * над господарями й між меблями, що вже стоять цього кадру).
   */
  private ordered(): WorldPart[] {
    const { person, cats, floor, apartment, marks, light } = this.all;
    return [person, cats, floor, apartment, marks, light];
  }

  /** Кадр: усі частини по черзі, потім другий прохід (`lateUpdate`). */
  update(state: GameState, frame: WorldFrame): void {
    const parts = this.ordered();
    for (const part of parts) part.update(state, frame);
    for (const part of parts) part.lateUpdate?.(state, frame);
  }

  onEvent(event: GameEvent, time: number): void {
    for (const part of this.ordered()) part.onEvent?.(event, time);
  }

  reset(): void {
    for (const part of this.ordered()) part.reset();
  }

  destroy(): void {
    for (const part of this.ordered()) part.destroy();
  }

  /**
   * Якір до частини-власниці за id: `person`, `cat:N`, `item:N` і `mess:N`, вертикальний пилосос на підлозі (`VACUUM_TARGET`),
   * переноски й кошик білизни (`BASKET_ANCHOR`) — у підлоги; решта без двокрапки — річ квартири.
   */
  anchor(id: string): Point | null {
    const { person, cats, floor, apartment } = this.all;
    if (id === "person") return person.anchor(id);
    if (id === VACUUM_TARGET || id === CARRIER_TARGET || id === BASKET_ANCHOR) return floor.anchor(id);
    const colon = id.indexOf(":");
    if (colon < 0) return apartment.anchor(id);
    const kind = id.slice(0, colon);
    if (kind === "cat") return cats.anchor(id);
    if (kind === "item" || kind === "mess") return floor.anchor(id);
    return null;
  }

  objectAnchor(id: string): Point | null {
    return this.all.apartment.objectAnchor(id);
  }

  /** Підсвітку цілі бере перша частина, якій вона належить. */
  highlight(target: Target, alpha: number): boolean {
    const { apartment, floor, cats, person, marks } = this.all;
    for (const part of [apartment, floor, cats, person, marks]) if (part.highlight(target, alpha)) return true;
    return false;
  }

  get person(): PersonPart {
    return this.all.person;
  }

  cat(id: number): CatPoints | null {
    return this.all.cats.points(id);
  }

  lightLevel(p: Point): number {
    return this.all.light.lightLevel(p);
  }
}
