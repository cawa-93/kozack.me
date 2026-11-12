// Контракт звуків (§11.4а, `audio/SOUND.md`, «Ефекти»): кожна група — свій файл `groups/<група>.ts` з експортом `group`,
// реєстр знаходить її сам. Групи не знають про Web Audio: лише що й де звучить.

import type { GameEvent } from "../../sim/events";
import type { GameState } from "../../sim/types";

/**
 * Де звучить: персонаж (`person`), кіт (`cat:N`), річ квартири за id (`stove`), точка підлоги в клітинках; null чи без
 * `at` — без місця, на повну й посередині (інтерфейс, телефон).
 */
export type SoundAt = string | { readonly x: number; readonly y: number } | null;

export interface SoundDef {
  /** Варіанти: назви файлів групи без розширення (`meow-1`). Щоразу — випадковий, той самий двічі поспіль лише коли він один. */
  files: readonly string[];
  /** Гучність, типово 1: вирівнює звук відносно інших. */
  gain?: number;
  /** Випадковий розкид висоти: ± частка (0,05 — ±5%). Типово 0. */
  pitch?: number;
  /** Випадковий розкид гучності: ± частка. Типово 0. */
  spread?: number;
  /** Не частіше, мс (типово `SFX.cooldownMs`). */
  cooldownMs?: number;
  /** Скільки водночас (типово `SFX.soundVoices`). */
  voices?: number;
  /** Петля: файли закодовано по колу (`loop: true` у `sources.json`). Звучить, поки її повертає `loops`. */
  loop?: boolean;
  /** Шина інтерфейсу: звучить і в поїздці. Типово — світ. */
  ui?: boolean;
  /** Шина музики: гучність — повзунок радіо, як у треків радіо (музика титрів, `audio/SOUND.md`). */
  music?: boolean;
  /** Не вантажити на старті: великий і рідкісний (музика титрів). Файл береться, коли знадобиться чи його попросить `prepare`. */
  lazy?: boolean;
  /**
   * Декодувати заздалегідь, після решти, і тримати розкодованим: звучить рідко, а разовий звук, що декодувався довше за мить,
   * пропадає (кінець гри).
   */
  warm?: boolean;
}

/** Разовий звук. */
export interface Cue {
  /** Назва звуку в `sounds` тієї самої групи. */
  sound: string;
  at?: SoundAt;
  /** Множник гучності цього разу. */
  gain?: number;
  /** Зсув висоти цього разу: множник швидкості (1 — як є). */
  rate?: number;
  /** Затримка, мс: наприклад, другий удар після першого. */
  delayMs?: number;
}

/** Петля, що звучить, поки стан триває. `key` — хто звучить (`shower`, `purr:3`): за ним петлю впізнають між кадрами. */
export interface LoopCue {
  key: string;
  sound: string;
  at?: SoundAt;
  gain?: number;
}

/**
 * Мить сцени, якої симуляція не помічає подією: титулка ранку, екран кінця гри (причина — `state.end`), засинання в ліжку,
 * падіння без сил; у поїздці — машина стала на парковці (`parked`) і рушає з неї додому (`unparked`). Звучить завжди, хоч би що
 * казав режим сцени.
 */
export type SceneMoment = "morning" | "end" | "fall-asleep" | "collapse" | "parked" | "unparked";

export interface SoundGroup {
  /** Збігається з назвою файлу групи й теки `audio/sfx/<id>/`. */
  id: string;
  sounds: Readonly<Record<string, SoundDef>>;
  /** Звуки на подію симуляції. Подія з чужого переліку `audio/SOUND.md` — не цієї групи. */
  onEvent?(event: GameEvent, state: GameState): readonly Cue[];
  /** Звуки на мить сцени. */
  onScene?(moment: SceneMoment, state: GameState): readonly Cue[];
  /** Назви звуків, що знадобляться невдовзі після цієї миті сцени: стягнути й декодувати їх уже зараз (музика перед титрами). */
  prepare?(moment: SceneMoment, state: GameState): readonly string[];
  /** Петлі зі стану: душ, пральна, мурчання. Кличуть кожні `SFX.loopMs`. */
  loops?(state: GameState): readonly LoopCue[];
  /** Щокадру: звуки, що йдуть за станом (клавіатура, позіх, низька шкала). `dtMs` — реальний час кадру. Пам'ять між кадрами група тримає сама. */
  tick?(state: GameState, dtMs: number): readonly Cue[];
  /** Пам'ять `tick` скинути: день показують заново. */
  reset?(): void;
}
