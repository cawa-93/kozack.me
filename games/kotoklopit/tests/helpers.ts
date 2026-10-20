import { targetOf } from "../src/sim/targets";
import { addCatCorner } from "../src/dev/scenarios";
import { changeStat } from "../src/sim/character";
import { onEvent, type GameEvent } from "../src/sim/events";
import { advance, goToSleep, interact } from "../src/sim/game";
import { distanceToRect, isSolid, MAP_HEIGHT, MAP_WIDTH, objectById, slotById, type Rect } from "../src/sim/home";
import { hoursUntilWake } from "../src/sim/sleep";
import type { NightReport, Save, Vec } from "../src/sim/types";

let current: Save | null = null;

/** Хвилина дня з годин: 22.5 — 22:30, 26 — 02:00 наступної доби. */
export function hours(value: number): number {
  return value * 60;
}

/**
 * Прожити день, як найпростіший гравець: поїсти й помитися зранку та посеред дня,
 * лягти спати рівно за 8 годин до пробудження.
 */
export function liveDay(save: Save): NightReport | null {
  const freshen = (): void => {
    changeStat(save.current, "satiety", 100);
    changeStat(save.current, "hygiene", 100);
  };
  freshen();
  advance(save, hours(8));
  freshen();
  advance(save, hours(hoursUntilWake(save.current) - 8));
  return goToSleep(save);
}

/** Збирати події симуляції, поки тест не скасує підписку. */
export function recordEvents(): { events: GameEvent[]; stop: () => void } {
  const events: GameEvent[] = [];
  const stop = onEvent((event) => events.push(event));
  return { events, stop };
}

/** Поставити персонажа на клітинку й повернути обличчям до речі. */
export function standAt(save: Save, id: string): void {
  current = save;
  const tile = reachTiles(id)[0];
  if (!tile) throw new Error(`До «${id}» не підійти`);
  const body = save.current.character.body;
  body.x = tile.x + 0.5;
  body.y = tile.y + 0.5;
  face(save, id);
}

/** Прямокутник цілі: річ квартири чи місце речі котячого кутка (`item:<id>`). */
function rectOf(id: string): Rect {
  if (!id.startsWith("item:")) return objectById(id);
  const item = current?.current.home.items.find((i) => `item:${i.id}` === id);
  if (!item) throw new Error(`Немає «${id}»`);
  if (item.kind === "toy") return { x: item.x - 0.3, y: item.y - 0.3, w: 0.6, h: 0.6 };
  const slot = slotById(item.slot);
  return { x: slot.x + 0.15, y: slot.y + 0.15, w: 0.7, h: 0.7 };
}

/** Повернутися до речі, не зрушивши з місця. */
function face(save: Save, id: string): void {
  current = save;
  const body = save.current.character.body;
  const o = rectOf(id);
  const dx = Math.min(Math.max(body.x, o.x), o.x + o.w) - body.x;
  const dy = Math.min(Math.max(body.y, o.y), o.y + o.h) - body.y;
  const length = Math.hypot(dx, dy) || 1;
  body.facing = { x: dx / length, y: dy / length };
}

/** Прохідні клітинки, з яких річ на відстані дії. */
function reachTiles(id: string): Vec[] {
  const o = rectOf(id);
  const tiles: Vec[] = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (!isSolid(current!.current, x, y) && distanceToRect({ x: x + 0.5, y: y + 0.5 }, o) <= 0.55) tiles.push({ x, y });
    }
  }
  return tiles;
}

/** Найкоротший шлях клітинками до місця біля речі. */
function path(from: Vec, id: string): Vec[] {
  const goals = new Set(reachTiles(id).map((t) => `${t.x},${t.y}`));
  const start = { x: Math.floor(from.x), y: Math.floor(from.y) };
  const previous = new Map<string, string | null>([[`${start.x},${start.y}`, null]]);
  const queue: Vec[] = [start];
  while (queue.length > 0) {
    const tile = queue.shift();
    if (!tile) break;
    const key = `${tile.x},${tile.y}`;
    if (goals.has(key)) {
      const result: Vec[] = [];
      for (let k: string | null = key; k !== null; k = previous.get(k) ?? null) {
        const [x = 0, y = 0] = k.split(",").map(Number);
        result.unshift({ x, y });
      }
      return result;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const next = { x: tile.x + dx, y: tile.y + dy };
      const nextKey = `${next.x},${next.y}`;
      if (isSolid(current!.current, next.x, next.y) || previous.has(nextKey)) continue;
      previous.set(nextKey, key);
      queue.push(next);
    }
  }
  throw new Error(`Немає шляху до «${id}»`);
}

/** Дійти до речі справжнім рухом, як гравець, і повернутися до неї обличчям. */
export function walkTo(save: Save, id: string): void {
  current = save;
  for (const tile of path(save.current.character.body, id)) {
    const goal = { x: tile.x + 0.5, y: tile.y + 0.5 };
    for (let i = 0; i < 500; i++) {
      const body = save.current.character.body;
      const dx = goal.x - body.x;
      const dy = goal.y - body.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 0.05) break;
      const step = Math.min(0.02, distance / 3);
      advance(save, step, { move: { x: dx / distance, y: dy / distance }, hold: false });
    }
  }
  face(save, id);
  const target = targetOf(save.current);
  if (target?.id !== id) throw new Error(`Біля «${id}» ціль — «${target?.id ?? "нічого"}»`);
}

/** Утримувати дію, доки тривала дія не закінчиться. */
export function holdUntilDone(save: Save, limit = hours(1)): void {
  let spent = 0;
  do {
    advance(save, 0.5, { move: { x: 0, y: 0 }, hold: true });
    spent += 0.5;
  } while (save.current.character.activity !== null && spent < limit);
}

/** Прокрутити час до хвилини дня. */
export function waitUntil(save: Save, minute: number): void {
  advance(save, Math.max(0, minute - save.current.minute));
}

export { interact };

/** Котячий куток (як у сценаріях): на старті гри котячих речей немає (§9.12), а тестам механік вони потрібні. */
export function withCatCorner(save: Save): Save {
  addCatCorner(save.current);
  // Знімки перегравання — з куточком.
  save.dayStart = structuredClone(save.current);
  save.weekStart = structuredClone(save.current);
  return save;
}
