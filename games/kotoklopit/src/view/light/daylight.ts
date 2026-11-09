// Світло доби (§8.9 «День і ніч», рішення автора 2026-11-02): яка зараз частина доби, наскільки темно й тепло, чи горять лампи
// (а в день відключення електрики — свічки) і звідки світить сонце. Чиста функція від хвилини доби й того, чи є світло; без
// Phaser і DOM (`tests/daylight.test.ts`). Межі доби — `DAYLIGHT` (`src/sim/config.ts`), кольори й прозорості — `lightlook.ts`.
//
// Удень (`morningEnd`–`eveningStart`) світла доби немає зовсім (`null`): квартира й дорога — рівно як були до блоку. На межах
// дня всі складники дорівнюють нулю, тож перехід у день і з дня — без стрибка.

import { DAYLIGHT, MINUTES_PER_DAY } from "../../sim/config";
import type { WallFace } from "../decor";

/** Частина доби поза днем: ніч (до `dawn` і з `night`), теплий ранок, вечір. */
export type DayPhase = "night" | "morning" | "evening";

/**
 * Сонце у вікнах: вранці — у вікна стіни y = 0 (спальня, кухня; `wall` = "y"), увечері — у вікно стіни x = 0 (вітальня).
 * `strength` 0–1 — яскравість смуг, `elevation` 0–1 — висота сонця: 0 — низько, смуги довгі, 1 — високо, короткі.
 */
export interface Sun {
  wall: WallFace;
  strength: number;
  elevation: number;
}

export interface Daylight {
  /** Хвилина доби 0–1440 (`dayMinute`). */
  minute: number;
  phase: DayPhase;
  /** Темрява 0–1: 0 — як удень, 1 — глуха ніч. */
  dark: number;
  /** Тепло світанку чи заходу 0–1. */
  warm: number;
  /** Електричні лампи й бра 0–1 (вмикаються самі; у відключення — 0). */
  lamps: number;
  /** Свічки 0–1: лише в день відключення, замість ламп (рішення автора 2026-11-02). */
  candles: number;
  /** Сонце у вікнах; немає — `null`. */
  sun: Sun | null;
  /** Чи є електрика (`!powerOut(state)`). */
  power: boolean;
}

/** Світло доби в «Дощ» (§4.1, §8.9): сонця у вікнах немає, тон доби той самий. */
export function overcast(d: Daylight): Daylight {
  return { ...d, sun: null };
}

/** Хвилина доби 0–1440: `state.minute` після півночі більший за 1440, доки персонаж не ляже (сова — до 26:00). */
export function dayMinute(minute: number): number {
  return ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** 0 до `from`, 1 від `to`, між ними — плавно (smoothstep). */
function ramp(m: number, from: number, to: number): number {
  if (m <= from) return 0;
  if (m >= to) return 1;
  const t = (m - from) / (to - from);
  return t * t * (3 - 2 * t);
}

/** Трапеція: росте `rise`→`from`, тримається до `to`, спадає до `fall`. */
function plateau(m: number, rise: number, from: number, to: number, fall: number): number {
  return ramp(m, rise, from) * (1 - ramp(m, to, fall));
}

/** Темрява за хвилиною доби. */
function darkness(m: number, phase: DayPhase): number {
  const D = DAYLIGHT;
  if (phase === "morning") {
    if (m < D.sunrise) return 1 - (1 - D.twilight) * ramp(m, D.dawn, D.sunrise);
    return D.twilight * (1 - ramp(m, D.sunrise, D.morningEnd));
  }
  if (phase === "evening") {
    if (m < D.sunset) return D.twilight * ramp(m, D.eveningStart, D.sunset);
    return D.twilight + (1 - D.twilight) * ramp(m, D.sunset, D.night);
  }
  return 1;
}

/** Лампи за хвилиною доби, без огляду на електрику: вмикаються близько `lampsOn`, гаснуть близько `lampsOff`. */
function lampLevel(m: number): number {
  const half = DAYLIGHT.lampFade / 2;
  if (m >= DAYLIGHT.eveningStart) return ramp(m, DAYLIGHT.lampsOn - half, DAYLIGHT.lampsOn + half);
  return 1 - ramp(m, DAYLIGHT.lampsOff - half, DAYLIGHT.lampsOff + half);
}

function sunAt(m: number, phase: DayPhase): Sun | null {
  if (phase === "night") return null;
  const span = phase === "morning" ? DAYLIGHT.sunMorning : DAYLIGHT.sunEvening;
  const end = phase === "morning" ? DAYLIGHT.morningEnd : span.to;
  const strength = ramp(m, span.from, span.from + 30) * (1 - ramp(m, end - 60, end));
  if (strength <= 0) return null;
  const t = Math.min(1, Math.max(0, (m - span.from) / (span.to - span.from)));
  return { wall: phase === "morning" ? "y" : "x", strength, elevation: phase === "morning" ? t : 1 - t };
}

/**
 * Світло доби о хвилині `minute` (будь-якій: нормалізується), `power` — чи є електрика. Удень — `null`: нічого не змінюється.
 */
export function daylight(minute: number, power: boolean): Daylight | null {
  const m = dayMinute(minute);
  const D = DAYLIGHT;
  if (m >= D.morningEnd && m < D.eveningStart) return null;
  const phase: DayPhase = m >= D.dawn && m < D.morningEnd ? "morning" : m >= D.eveningStart && m < D.night ? "evening" : "night";
  const warm =
    phase === "morning"
      ? plateau(m, D.dawn, D.warmMorning.from, D.warmMorning.to, D.morningEnd)
      : phase === "evening"
        ? plateau(m, D.eveningStart, D.warmEvening.from, D.warmEvening.to, D.night)
        : 0;
  const level = lampLevel(m);
  return {
    minute: m,
    phase,
    dark: darkness(m, phase),
    warm,
    lamps: power ? level : 0,
    candles: power ? 0 : level,
    sun: sunAt(m, phase),
    power,
  };
}

/** З якого рівня ламп (свічок) доби їхній кадр арту горить: з половини шляху вмикання. */
export const LIT_FROM = 0.5;

/** Чи горять електричні лампи й бра (стан арту `on`): з половини шляху вмикання. */
export function lampsOn(d: Daylight | null): boolean {
  return (d?.lamps ?? 0) >= LIT_FROM;
}

/** Чи горять свічки (стан арту `lit`). */
export function candlesLit(d: Daylight | null): boolean {
  return (d?.candles ?? 0) >= LIT_FROM;
}

const q = (v: number, steps: number): number => Math.round(v * steps);

/**
 * Ключ світла для перемальовування (`iso/light.ts`): той самий ключ — та сама картинка з точністю до кроку; удень — "day".
 */
export function lightKey(d: Daylight | null): string {
  if (!d) return "day";
  const sun = d.sun ? `${d.sun.wall}${q(d.sun.strength, 16)}:${q(d.sun.elevation, 16)}` : "-";
  return `${d.phase}|${q(d.dark, 32)}|${q(d.warm, 32)}|${q(d.lamps, 16)}|${q(d.candles, 16)}|${sun}`;
}
