// Гучний звук і кроки (§9.12, «Спільні механіки рис», рішення автора 2026-10-25, `TRAITS_REVIEW.md`): пилосос,
// робот-пилосос, віджим, розбита річ, персонаж упав, феєрверки. Чи ховатися — вирішує «Сміливість», як довго —
// «Стресостійкість», чи прокинутися — «Тривалість сну». Кроки персонажа будять лише чуйних.

import { changeMood, traitLevel } from "./cat";
import { hideSpot, isCarried, startAct } from "./catai";
import { tileOf, visibleFloorNear } from "./catmove";
import { HOUSEHOLD, MODIFIERS, NOISE, STEPS_WAKE } from "./config";
import { emit } from "./events";
import { roomAt } from "./home";
import { observe } from "./knowledge";
import { isNewborn } from "./reproduction";
import { stateRng, type Rng } from "./rng";
import type { Cat, GameState, Vec } from "./types";

/** Що загуркотіло: великі звуки (пилосос, робот, феєрверки) лякають кожного несміливого, дрібні — лише полохливих. */
export type NoiseKind = "vacuum" | "robot" | "fireworks" | "spin" | "broken" | "fall";

const BIG: Partial<Record<NoiseKind, number>> = NOISE.big;

/** Кіт спить на місці; сон, що саме скінчився (`finish`, напр. тріснув будиночок), — уже не сон. */
const asleep = (cat: Cat): boolean => cat.act.kind === "sleep" && cat.act.goal === null && cat.act.minutes > 1e-9;


/** Звідки сміливий кіт іде дивитися на пилосос: з дій, які не шкода кинути. */
const WATCH_FROM = new Set(["idle", "wander", "toy"]);

/** Чи чує кіт звук: та сама кімната; коли хтось із них у проході — поруч (§9.12). */
function hears(cat: Cat, at: Vec): boolean {
  const room = roomAt(cat);
  const source = roomAt(at);
  if (room !== null && source !== null) return room === source;
  return Math.hypot(cat.x - at.x, cat.y - at.y) <= NOISE.reach;
}

/**
 * Гучний звук (§9.12): `at` — звідки; null — чути в усій квартирі (пилосос, феєрверки). Сплячий кіт може
 * прокинутися («Тривалість сну»), а той, хто не спить, ховається чи ні («Сміливість»). `only` — кого звук стосується
 * (робот-пилосос: хто ще не чув його за це прибирання). Повертає id котів, що почули звук.
 */
export function loudNoise(state: GameState, kind: NoiseKind, at: Vec | null, only?: (cat: Cat) => boolean): number[] {
  const rng = stateRng(state, "behavior");
  const heard: number[] = [];
  for (const cat of state.cats) {
    if (cat.away !== null || isCarried(state, cat) || isNewborn(cat)) continue;
    // Хто вже ховається чи б'ється, на звук не зважає.
    if (cat.act.kind === "hide" || cat.act.kind === "fight") continue;
    if (at !== null && !hears(cat, at)) continue;
    if (only && !only(cat)) continue;
    heard.push(cat.id);
    if (asleep(cat)) {
      if (!rng.chance(NOISE.wake * (1 - NOISE.wakeStep * traitLevel(cat, "sleep")))) {
        // Поруч гуркоче, а кіт спить далі — прояв «Тривалості сну +». Прояви від звуку й кроків — не частіше ніж раз на
        // годину (перевірка 2026-10-25): інакше пилосос, увімкнений кілька разів поспіль, відкривав риси за хвилину.
        observe(state, cat, "sleep", 1, false, NOISE.observeEvery);
        continue;
      }
      wake(state, cat);
    }
    react(state, cat, kind, rng);
  }
  return heard;
}

/** Кота розбудили шум чи кроки (§9.12): настрій −1, і це видно; чуйний сон — прояв «Тривалості сну −». */
export function wake(state: GameState, cat: Cat): void {
  changeMood(state, cat, NOISE.wokenMood, "розбудив шум");
  startAct(cat, "idle", null, 2);
  emit(state, { type: "cat-woke", cat: cat.id });
  observe(state, cat, "sleep", -1, false, NOISE.observeEvery);
}

/**
 * Кіт, що не спить, почув звук (§9.12). Великий: несміливий (0 і менше) ховається, сміливий лишається — іде
 * подивитися на пилосос, а «Безстрашний» може покататися на роботі. Дрібний: ховається лише полохливий.
 */
function react(state: GameState, cat: Cat, kind: NoiseKind, rng: Rng): void {
  const bravery = traitLevel(cat, "bravery");
  const big = BIG[kind];
  if (big !== undefined) {
    if (bravery <= 0) return scare(state, cat, kind, big, rng);
    observe(state, cat, "bravery", 1, false, NOISE.observeEvery);
    if (kind === "vacuum" && WATCH_FROM.has(cat.act.kind)) return watch(state, cat);
    if (kind === "robot" && bravery >= 2 && rng.chance(NOISE.ride)) startAct(cat, "idle", null, HOUSEHOLD.robotMinutes, "robot");
    return;
  }
  if (bravery < 0 && rng.chance(NOISE.smallStep * -bravery)) scare(state, cat, kind, NOISE.smallMinutes * -bravery, rng);
}

/** Кіт злякався й ховається (§9.12): як довго — «Стресостійкість»; від феєрверків ще й псується настрій (§4.1). */
function scare(state: GameState, cat: Cat, kind: NoiseKind, minutes: number, rng: Rng): void {
  const stress = Math.max(NOISE.stressMin, 1 - NOISE.stressStep * traitLevel(cat, "stress"));
  const spot = hideSpot(state, rng, cat);
  startAct(cat, "hide", spot.at, minutes * stress, spot.target);
  if (kind === "fireworks") changeMood(state, cat, MODIFIERS.festival.mood, "феєрверки");
  emit(state, { type: "scared", cat: cat.id });
  observe(state, cat, "bravery", -1, false, NOISE.observeEvery);
}

/** Сміливий кіт іде подивитися на пилосос (§9.12): сідає поруч із персонажем, за його спиною. */
function watch(state: GameState, cat: Cat): void {
  const body = state.character.body;
  const spot = visibleFloorNear(state, { x: body.x - body.facing.x, y: body.y - body.facing.y });
  startAct(cat, "wander", tileOf(spot), NOISE.watchMinutes, "watch");
}

/**
 * Персонаж пройшов повз сплячого кота (§9.12): чуйного («Тривалість сну» −1 і менше) кроки будять, раз за прохід —
 * коли персонаж підійшов ближче `STEPS_WAKE.distance`.
 */
export function hearSteps(state: GameState, from: Vec): void {
  const body = state.character.body;
  for (const cat of state.cats) {
    if (cat.away !== null || !asleep(cat) || isNewborn(cat)) continue;
    const level = traitLevel(cat, "sleep");
    if (level >= 0) continue;
    const near = (p: Vec): boolean => Math.hypot(cat.x - p.x, cat.y - p.y) <= STEPS_WAKE.distance;
    if (near(from) || !near(body)) continue;
    if (stateRng(state, "behavior").chance(STEPS_WAKE.step * -level)) wake(state, cat);
  }
}
