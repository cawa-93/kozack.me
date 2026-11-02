// Ефекти над світом нового вигляду (крок 16, хвиля 3, пакет «Стики будинку»): котрий із кадрів `fx/*` A6 показати, де й коли —
// зі стану гри й подій. Пара над плитою, що готує, і над пральною машиною, що пере (§8.7); дим від пригорілого (§8.7); хропіння
// сплячого кота з проблемами з диханням (§9.5, `DISEASES.md`, Д1 — як анімація `snore`); задишка після гри в того, хто швидко
// втомлюється (§9.5, як разова накладка `pant`); чхання застудженого (§9.5, разом із накладкою `sneeze`); іскри з перегризеного
// дроту (§9.12, «Гризіння»). Душова кабіна, що тече, пару має сама (A3, стан `running`), тож окремої пари над нею немає; у
// день відключення світла вода холодна (`running-cold`) — без пари.
//
// Чисті функції без Phaser: їх перевіряє `tests/isofx.test.ts`, малює `fx.ts`. Нічого не виділяють, крім разових ефектів
// від подій (подія — рідкість, не кадр).

import { hasDisease } from "../../sim/diseases";
import type { GameEvent } from "../../sim/events";
import { powerOut } from "../../sim/modifiers";
import type { Cat, GameState } from "../../sim/types";
import { catEventAnims } from "../anim/catevents";
import { CAT_ONE_SHOT_MS } from "../anim/ids";
import { catPose } from "../pose";
import { stoveState } from "./looks";

/**
 * Глибина ефектів у проміжку свого власника (`ISO_DEPTH_SLOT` 0,01, `iso/depth.ts`): пара й дим — над накладками речі (до
 * 0,003) і смугою плити (0,0012), нижче за пів проміжку (кіт, що виліз на стільницю, — над парою); ефект кота — над усіма
 * шматками кота (тінь, тіло, очі з-під меблів — до 0,003, `CAT_PIECE`), а коли кіт дивиться від камери, — під ними.
 */
export const FX_DEPTH = { thing: 0.004, catFront: 0.004, catBack: 0.0005 } as const;

/** Ефект речі квартири: пара (готує, пере) чи дим (пригоріло). */
export type ThingFx = "steam" | "smoke";

/** Ефект кота: хропіння, задишка, чхання. */
export type CatFxKind = "snore" | "pant" | "sneeze";

/**
 * Плита (§8.7): поки страва вариться чи готова й гріється — пара; пригоріла — дим; порожня чи сире щойно поклали — нічого.
 * На газовому пальнику дня відключення — так само: рахує базовий `stoveState`, а не кадр `stoveArtState`.
 */
export function stoveFx(state: GameState): ThingFx | null {
  const look = stoveState(state);
  if (look === "cooking" || look === "ready") return "steam";
  return look === "burnt" ? "smoke" : null;
}

/**
 * Звідки пара й дим плити — точка запису `env/stove`: середина сковороди (`pan`), а в день відключення світла (§4.1, рішення
 * автора 2026-11-02) — середина сковороди, піднятої на туристичний газовий пальник (`pan-gas`, кадри `gas-*`).
 */
export function stovePuffPoint(state: GameState): "pan" | "pan-gas" {
  return powerOut(state) ? "pan-gas" : "pan";
}

/** Пральна машина (§8.7): поки пере — над кришкою пара. */
export function washerFx(state: GameState): ThingFx | null {
  return state.home.washer.state === "washing" ? "steam" : null;
}

/** Перегризений дріт (§9.12, «Гризіння»): з кінців дроту, поки його не полагодили, час від часу сиплються іскри. */
export function sparking(state: GameState): boolean {
  return state.home.wireChewed === true;
}

/**
 * Кіт хропе (§9.5, проблеми з диханням): удома й спить так, що грає анімацію хропіння (`catPose` — `snore`: клубком на місці
 * чи на колінах; під ковдрою, у переносці й на прохолодній плитці — інші пози, там бульбашки немає). Спершу — дешева
 * перевірка хвороби: з двома десятками котів поза рахується лише для тих, хто справді хворий.
 */
export function snores(state: GameState, cat: Cat): boolean {
  return cat.away === null && hasDisease(cat, "breathing") && catPose(state, cat) === "snore";
}

/**
 * Разові ефекти кота з анімацією N3: задишка — поки кіт часто дихає з відкритим ротом (від `PANT.delay` до `PANT.tail` перед
 * кінцем накладки, коли рот уже закривається); чхання — хмаринка в мить «чхи!» (кивок `sneeze` — на 300–365 мс), коротко.
 */
export const PANT = { delay: 120, tail: 700, frameMs: 280 } as const;
export const SNEEZE = { delay: 330, ms: 420 } as const;

/** Разовий ефект кота від події: котрий кіт, що, через скільки мс від події починається і скільки триває. */
export interface CatFxShot {
  cat: number;
  kind: Exclude<CatFxKind, "snore">;
  delay: number;
  ms: number;
}

/**
 * Разові ефекти котів від події (§9.5): ті самі, що разові анімації (`catEventAnims`), — задишка після гри з вудкою чи з
 * другом (лише в того, хто швидко втомлюється: дихання, серце) і чхання застудженого. Решта подій — без ефекту.
 */
export function catFxShots(event: GameEvent, state: GameState): CatFxShot[] {
  if (event.type !== "played" && event.type !== "cats-played" && event.type !== "symptom") return [];
  const shots: CatFxShot[] = [];
  for (const shot of catEventAnims(event, state)) {
    if (shot.anim === "pant") shots.push({ cat: shot.cat, kind: "pant", delay: PANT.delay, ms: CAT_ONE_SHOT_MS.pant - PANT.delay - PANT.tail });
    if (shot.anim === "sneeze") shots.push({ cat: shot.cat, kind: "sneeze", delay: SNEEZE.delay, ms: SNEEZE.ms });
  }
  return shots;
}

// --- Кадри в часі ---------------------------------------------------------------------------------------

/** Як часто міняють кадр `a`/`b` пара й дим, мс: дим важчий — гойдається повільніше. */
export const PUFF_MS = { steam: 420, smoke: 560 } as const;

/** Кадр пари чи диму в мить `time` (мс сцени): клубочки гойдаються з боку на бік. */
export function puffState(kind: ThingFx, time: number): "a" | "b" {
  return Math.floor(time / PUFF_MS[kind]) % 2 === 0 ? "a" : "b";
}

/**
 * Хропіння: подих за подихом, як у анімації `snore` (два подихи за 3,6 с): бульбашка росте на вдиху (`in`), велика на видиху
 * (`out`), між подихами її немає. `phase` — свій зсув кота, щоб коти не хропли хором.
 */
export const SNORE = { breathMs: 1800, inMs: 700, outMs: 1500 } as const;

export function snoreState(time: number, phase: number): "in" | "out" | null {
  const t = (((time + phase) % SNORE.breathMs) + SNORE.breathMs) % SNORE.breathMs;
  if (t < SNORE.inMs) return "in";
  return t < SNORE.outMs ? "out" : null;
}

/** Зсув хропіння кота, мс: від id, сталий. */
export function snorePhase(cat: number): number {
  return (cat * 577) % SNORE.breathMs;
}

/** Задишка: хмаринки чергуються в такт частого дихання. `t` — мс від початку ефекту. */
export function pantState(t: number): "a" | "b" {
  return Math.floor(t / PANT.frameMs) % 2 === 0 ? "a" : "b";
}

/**
 * Чхання: хмаринка вилітає з носа — росте з 0,7 до 1,15 і за останні 40 % згасає. `progress` — частка ефекту 0–1.
 */
export function sneezeLook(progress: number): { scale: number; alpha: number } {
  const p = Math.min(1, Math.max(0, progress));
  const grow = 1 - (1 - p) * (1 - p);
  return { scale: 0.7 + 0.45 * grow, alpha: p < 0.6 ? 1 : Math.max(0, 1 - (p - 0.6) / 0.4) };
}

/**
 * Іскри дроту: короткі спалахи `a`-`b`, далі пауза — щоб іскрило, а не горіло. Цикл свій (`SPARK.cycleMs`), спалахи — на його
 * початку; одразу після події «дріт перегризено» — довший сніп (`SPARK.burstMs`).
 */
export const SPARK = { cycleMs: 1900, burstMs: 700, flashMs: 80 } as const;

export function sparkState(time: number, sinceChewed: number): "a" | "b" | null {
  if (sinceChewed >= 0 && sinceChewed < SPARK.burstMs) return Math.floor(sinceChewed / SPARK.flashMs) % 2 === 0 ? "a" : "b";
  const t = time % SPARK.cycleMs;
  if (t < SPARK.flashMs) return "a";
  if (t < SPARK.flashMs * 2) return "b";
  if (t >= SPARK.flashMs * 4 && t < SPARK.flashMs * 5) return "a";
  return null;
}
