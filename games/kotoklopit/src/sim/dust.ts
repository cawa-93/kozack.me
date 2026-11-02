// Пил і павутина (§8.7, «Пил і павутина», рішення автора 2026-11-02): звичайне «людське» забруднення, що накопичується з часом
// і без котів, — дуже повільно: спершу в кутах кімнат, потім уздовж стін, потім на відкритій підлозі. Прибирає пилосос у руках
// (`household.ts`), а пил на підлозі — й робот-пилосос. Без випадковості: місця й порядок сталі.

import { DUST } from "./config";
import { emit } from "./events";
import { ROOMS, type RoomId } from "./home";
import type { GameState, Vec } from "./types";

/**
 * Вид пилу на місці (§8.7): `cobweb` — павутина вгорі в задньому куті кімнати (точка — кут на підлозі, павутина — на висоті
 * стін); `corner` — клубок пилу в куті на підлозі; `wall` — смужка пилу вздовж плінтуса; `floor` — клубок пилу на відкритій
 * підлозі.
 */
export type DustKind = "cobweb" | "corner" | "wall" | "floor";

/** Місце для пилу в кімнаті (§8.7): точка підлоги в клітинках. */
export interface DustSpot extends Vec {
  room: RoomId;
  kind: DustKind;
  /** Смужка біля стіни (`wall`): уздовж якої осі йде стіна — "x" — стіна y = const, "y" — стіна x = const. */
  along?: "x" | "y";
}

const spot = (room: RoomId, kind: DustKind, x: number, y: number, along?: "x" | "y"): DustSpot => ({ room, kind, x, y, ...(along ? { along } : {}) });

/**
 * Місця для пилу по кімнатах, у порядку заповнення (§8.7): спершу кути (павутина й клубок у куті), потім уздовж стін, потім на
 * підлозі. Лише там, де пил видно в ізометрії й куди персонаж дійде з пилососом (рішення виконавця; перевіряє `tests/dust.test.ts`):
 * не під меблями; не в ряду 4 за стіною ряду 5 (у проходах — можна) і не в стовпцях x = 6 і x = 11 — їх закривають внутрішні
 * стіни (`hiddenTile`, `art/STYLE.md`); не в ряду 10 під передньою стіною; не за кухонним столом, шафкою з кормом, пральною
 * машиною чи шафою. Клубки на підлозі — не на місцях речей котячого кутка; кути й смужки — лише на місцях, які рідко зайняті
 * (п'ятий і шостий лоток, друга й третя вода). Смужки біля стін — лише вздовж плінтусів, які видно: задньої стіни y = 0 і x = 0,
 * лицьових граней стін x = 7 (ванна) і ряду 5 (вітальня), низької правої стіни x = 19 (кухня). Тож кутів і стін у кімнатах
 * по-різному: у ванній і на кухні їх мало (меблі вздовж стін), і пил там виходить на підлогу вже за ~5 діб, у спальні — за ~9, у
 * вітальні — за ~13,5. Жмутів шерсті (`FUR_SPOTS`) пил не накриває: від кожного щонайменше ≈ 0,8 клітинки.
 */
export const DUST_SPOTS: readonly DustSpot[] = [
  // Спальня: павутина в задньому куті над узголів'ям ліжка; клубки між ліжком і задньою стіною та біля ніг ліжка під лівою
  // стіною; смужки вздовж задньої стіни між ліжком і підвіконням і вздовж лівої; на підлозі — довкола килимка.
  spot("bedroom", "cobweb", 1, 1),
  spot("bedroom", "corner", 2.15, 1.15),
  spot("bedroom", "corner", 1.15, 3.15),
  spot("bedroom", "wall", 2.8, 1.12, "x"),
  spot("bedroom", "wall", 3.5, 1.12, "x"),
  spot("bedroom", "wall", 1.12, 3.65, "y"),
  spot("bedroom", "floor", 3.4, 2.1),
  spot("bedroom", "floor", 5.3, 2.4),
  spot("bedroom", "floor", 2.4, 3.4),
  spot("bedroom", "floor", 4.6, 3.4),
  // Ванна: павутина в правому задньому куті над умивальником (лівий закриває душова кабіна заввишки 186); клубок між кабіною й
  // лівою стіною x = 7 і смужка вздовж неї; на підлозі — перед кабіною, на прохолодній плитці, перед пральною машиною й у
  // проході.
  spot("bathroom", "cobweb", 12, 1),
  spot("bathroom", "corner", 8.15, 2.15),
  spot("bathroom", "wall", 8.12, 2.55, "y"),
  spot("bathroom", "floor", 9.6, 2.35),
  spot("bathroom", "floor", 10.45, 2.65),
  spot("bathroom", "floor", 8.7, 2.6),
  spot("bathroom", "floor", 10.6, 4.4),
  // Кухня: павутина в задньому куті над холодильником; клубок між смітником і правою стіною x = 19 і смужка вздовж неї (задню
  // стіну заставлено, а ліву закриває стіл); на підлозі — перед плитою й поверхнею і в проході.
  spot("kitchen", "cobweb", 13, 1),
  spot("kitchen", "corner", 18.7, 2.2),
  spot("kitchen", "wall", 18.72, 2.58, "y"),
  spot("kitchen", "floor", 16.3, 2.6),
  spot("kitchen", "floor", 15.35, 2.2),
  spot("kitchen", "floor", 15.4, 4.4),
  // Вітальня: павутина й клубок у задньому куті; клубок між столом із комп'ютером і стіною ряду 5; смужки вздовж лівої стіни
  // й стіни ряду 5 — там, де місця п'ятого й шостого лотка, третьої й другої води, біля дроту; на підлозі — на килимі й довкола.
  spot("living", "cobweb", 1, 6),
  spot("living", "corner", 1.15, 6.15),
  spot("living", "corner", 8.15, 6.15),
  spot("living", "wall", 1.12, 7.4, "y"),
  spot("living", "wall", 2.6, 6.12, "x"),
  spot("living", "wall", 8.75, 6.12, "x"),
  spot("living", "wall", 9.5, 6.12, "x"),
  spot("living", "wall", 14.5, 6.12, "x"),
  spot("living", "floor", 9.6, 8.6),
  spot("living", "floor", 4.2, 7.8),
  spot("living", "floor", 13.9, 7.8),
  spot("living", "floor", 16.5, 9),
  spot("living", "floor", 7.6, 8.4),
  spot("living", "floor", 5.8, 7.6),
];

/** Місця, де зараз пил (індекси `DUST_SPOTS`). */
export function dustOf(state: Pick<GameState, "home">): readonly number[] {
  return state.home.dust ?? [];
}

/** Пил на відкритій підлозі (§8.7): він — безлад, що дратує. Точки підлоги. */
export function floorDust(state: Pick<GameState, "home">): DustSpot[] {
  return dustOf(state).flatMap((i) => {
    const spot = DUST_SPOTS[i];
    return spot?.kind === "floor" ? [spot] : [];
  });
}

/** Кімната набрала пил (§8.7): на перше вільне місце її переліку; усі зайняті — пилу більше нікуди. */
export function addDust(state: GameState, room: RoomId): number | null {
  const dust = (state.home.dust ??= []);
  const index = DUST_SPOTS.findIndex((s, i) => s.room === room && !dust.includes(i));
  if (index < 0) return null;
  dust.push(index);
  emit(state, { type: "dust", spot: index });
  return index;
}

/** Прибрати пил з місця (§8.7): місце звільняється, і наступний пил знову йде в перше вільне. */
export function removeDust(state: GameState, index: number): void {
  state.home.dust = dustOf(state).filter((i) => i !== index);
}

/**
 * Хвилини пилу вдень і вночі (§8.7): кожна кімната набирає пил раз на `DUST.everyMinutes` — кімнати по черзі, на чверть цього
 * часу одна від одної, тож пил з'являється рівномірно, а не в усій квартирі разом. Годинник — `home.dustClock`: він рахує
 * прожиті хвилини, тож ні поїздка, ні ніч, ні перемотування дня після аварії пилу не оминають.
 */
export function tickDust(state: GameState, minutes: number): void {
  const home = state.home;
  const before = home.dustClock ?? 0;
  const after = before + minutes;
  home.dustClock = after;
  const every = DUST.everyMinutes;
  ROOMS.forEach((room, i) => {
    const offset = ((i + 1) * every) / ROOMS.length;
    const times = Math.floor((after - offset) / every) - Math.floor((before - offset) / every);
    for (let k = 0; k < times; k++) addDust(state, room.id);
  });
}
