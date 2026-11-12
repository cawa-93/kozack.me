// Звуки гри (§11.4а): події симуляції й стан → групи → програвач. Сцена квартири каже, де персонаж і чи світ зараз звучить;
// картки (DOM) грають звук інтерфейсу через `uiSound`.

import { onEvent, type GameEvent } from "../../sim/events";
import type { GameState } from "../../sim/types";
import { SFX } from "../config";
import { glide, type AudioEngine } from "../engine";
import type { AudioPrefs } from "../settings";
import { soundBus } from "./bus";
import { soundFile } from "./files";
import { placement, soundPoint } from "./place";
import { Player, type LoopVoice } from "./player";
import { GROUPS } from "./registry";
import { startupFiles } from "./startup";
import type { Cue, LoopCue, SceneMoment, SoundDef, SoundGroup } from "./types";

/**
 * Що зараз звучить: усе (`live`); усе, але петлі світу тихо (`paused`: картка чи пауза — час стоїть); лише інтерфейс
 * (`away`: персонаж у поїздці, квартири не чути) чи нічого (`silent`: засинання й ніч — вона прокручується за мить, і її
 * події не мають звучати разом).
 */
export type SoundMode = "live" | "paused" | "away" | "silent";

export interface SoundScene {
  mode(): SoundMode;
  state(): GameState;
}

interface Playing {
  voice: LoopVoice;
  sound: string;
}

let current: Sounds | null = null;

/** Звук інтерфейсу чи будь-який звук групи без місця — з карток і сцен. Звук ще не готовий — тиша. */
export function uiSound(group: string, sound: string): void {
  current?.play(group, sound);
}

/** Мить сцени (`SceneMoment`) зі сцени, що не тримає звуків сама (сцена гонки). */
export function sceneMoment(moment: SceneMoment): void {
  current?.moment(moment);
}

/** Петля, яку веде сцена сама (мотор у гонці): гучність (множник `gain` звуку) і висота — щокадру. */
export interface SceneLoop {
  set(gain: number, rate: number): void;
  /** Коли петлю стало чути, мс `performance.now()`; ще не звучить — null (`LoopVoice.startedAt`). */
  startedAt(): number | null;
  stop(): void;
}

/** Увімкнути петлю групи без стану квартири; звуку ще немає (аудіо не запущено, файл не закодовано) — null, спробуйте пізніше. */
export function sceneLoop(group: string, sound: string): SceneLoop | null {
  return current?.sceneLoop(group, sound) ?? null;
}

export class Sounds {
  private readonly player: Player;
  private scene: SoundScene | null = null;
  private hushed = 0;
  /** Коли кожен звук звучав востаннє (мс) і скільки його звучить зараз. */
  private readonly last = new Map<string, number>();
  private readonly active = new Map<string, number>();
  private readonly variant = new Map<string, number>();
  private voices = 0;
  private readonly loops = new Map<string, Playing>();
  private loopClock = 0;

  constructor(
    private readonly engine: AudioEngine,
    private readonly prefs: AudioPrefs,
  ) {
    this.player = new Player(engine);
  }

  /** Викликати один раз під час запуску гри. */
  start(): void {
    current = this;
    onEvent((event, state) => this.onGameEvent(event, state));
    this.engine.onRunning(() => {
      this.applyVolume();
      const { fetch, warm } = startupFiles(GROUPS);
      void this.player.preload(fetch).then(() => this.player.keep(warm));
    });
  }

  /** Сцена квартири: звідки слухати й чи звучить світ. */
  attach(scene: SoundScene): void {
    this.scene = scene;
  }

  get volume(): number {
    return this.prefs.value.effects;
  }

  setVolume(volume: number): void {
    this.prefs.adjust({ effects: volume });
    this.applyVolume();
  }

  /** Поки йде `run` (ніч, перемотування), події симуляції не звучать. */
  hush<T>(run: () => T): T {
    this.hushed++;
    try {
      return run();
    } finally {
      this.hushed--;
    }
  }

  /** День показують заново: петлі стихають, пам'ять груп (`tick`) забувається. */
  reset(): void {
    for (const playing of this.loops.values()) playing.voice.stop();
    this.loops.clear();
    for (const group of GROUPS) group.reset?.();
  }

  /** Мить сцени (`SceneMoment`): звучить і в тиші ночі, і в поїздці. */
  moment(moment: SceneMoment): void {
    const state = this.scene?.state();
    if (!state) return;
    for (const group of GROUPS) {
      const cues = group.onScene?.(moment, state);
      if (cues) for (const cue of cues) this.fire(group, cue, state);
      for (const sound of group.prepare?.(moment, state) ?? []) {
        const file = soundFile(group.id, group.sounds[sound]?.files[0] ?? "");
        if (file) this.player.prepare(file);
      }
    }
  }

  sceneLoop(groupId: string, sound: string): SceneLoop | null {
    const group = GROUPS.find((g) => g.id === groupId);
    const def = group?.sounds[sound];
    const file = group && def?.loop ? soundFile(group.id, def.files[0] ?? "") : null;
    if (!def || !file) return null;
    const base = def.gain ?? 1;
    const voice = this.player.loop(file, { bus: soundBus(def), gain: base, pan: 0 });
    if (!voice) return null;
    return { set: (gain, rate) => voice.set(base * gain, 0, rate), startedAt: () => voice.startedAt(), stop: () => voice.stop() };
  }

  /** Звук групи без місця: інтерфейс, телефон. */
  play(groupId: string, sound: string): void {
    const group = GROUPS.find((g) => g.id === groupId);
    if (group) this.fire(group, { sound }, null);
  }

  /** Щокадру зі сцени квартири: звуки груп (`tick`) і петлі. */
  frame(dtMs: number): void {
    const scene = this.scene;
    if (!scene) return;
    const mode = scene.mode();
    const state = scene.state();
    if (mode === "live" && this.hushed === 0) {
      for (const group of GROUPS) {
        const cues = group.tick?.(state, dtMs);
        if (cues) for (const cue of cues) this.fire(group, cue, state);
      }
    }
    this.loopClock += dtMs;
    if (this.loopClock < SFX.loopMs) return;
    this.loopClock = 0;
    this.updateLoops(mode, state);
  }

  private onGameEvent(event: GameEvent, state: GameState): void {
    if (this.hushed > 0 || !this.scene) return;
    const mode = this.scene.mode();
    if (mode === "silent") return;
    for (const group of GROUPS) {
      const cues = group.onEvent?.(event, state);
      if (!cues) continue;
      for (const cue of cues) {
        const def = group.sounds[cue.sound];
        if (def && (mode !== "away" || def.ui)) this.fire(group, cue, state);
      }
    }
  }

  private fire(group: SoundGroup, cue: Cue, state: GameState | null): void {
    const def = group.sounds[cue.sound];
    if (!def || def.loop || def.files.length === 0) return;
    const key = `${group.id}/${cue.sound}`;
    // Пауза між повторами — за миттю звучання: той самий звук із затримкою в одній події не відкидається.
    const at = performance.now() + (cue.delayMs ?? 0);
    if (Math.abs(at - (this.last.get(key) ?? -Infinity)) < (def.cooldownMs ?? SFX.cooldownMs)) return;
    if (!this.hasVoice(key, def)) return;
    const file = soundFile(group.id, this.pick(key, def));
    if (!file) return;
    const place = state ? placement(state.trip ? null : state.character.body, soundPoint(state, cue.at)) : { gain: 1, pan: 0 };
    const gain = (def.gain ?? 1) * (cue.gain ?? 1) * place.gain * jitter(def.spread);
    const rate = (cue.rate ?? 1) * jitter(def.pitch);
    // Голос займає лише звук, що справді зазвучав: поки файл іде мережею, межі перевіряються знову в мить звучання.
    const voice = {
      take: (): boolean => {
        if (!this.hasVoice(key, def)) return false;
        this.voices++;
        this.active.set(key, (this.active.get(key) ?? 0) + 1);
        return true;
      },
      free: (): void => {
        this.voices--;
        this.active.set(key, (this.active.get(key) ?? 1) - 1);
      },
    };
    if (this.player.play(file, { bus: soundBus(def), gain, pan: place.pan, rate, delay: (cue.delayMs ?? 0) / 1000 }, voice)) this.last.set(key, at);
  }

  private hasVoice(key: string, def: SoundDef): boolean {
    return (this.active.get(key) ?? 0) < (def.voices ?? SFX.soundVoices) && this.voices < SFX.voices;
  }

  /** Випадковий варіант, не той самий, що минулого разу. */
  private pick(key: string, def: SoundDef): string {
    const count = def.files.length;
    const previous = this.variant.get(key) ?? -1;
    let index = Math.floor(Math.random() * count);
    if (count > 1 && index === previous) index = (index + 1 + Math.floor(Math.random() * (count - 1))) % count;
    this.variant.set(key, index);
    return def.files[index]!;
  }

  private updateLoops(mode: SoundMode, state: GameState): void {
    const wanted = new Map<string, { group: SoundGroup; cue: LoopCue; def: SoundDef }>();
    if (mode !== "silent" && this.hushed === 0) {
      for (const group of GROUPS) {
        const cues = group.loops?.(state);
        if (!cues) continue;
        for (const cue of cues) {
          const def = group.sounds[cue.sound];
          if (def?.loop && (mode !== "away" || def.ui)) wanted.set(`${group.id}/${cue.key}`, { group, cue, def });
        }
      }
    }
    for (const [key, playing] of this.loops) {
      const want = wanted.get(key);
      if (want && want.cue.sound === playing.sound) continue;
      playing.voice.stop();
      this.loops.delete(key);
    }
    const listener = state.trip ? null : state.character.body;
    for (const [key, { group, cue, def }] of wanted) {
      const place = placement(listener, soundPoint(state, cue.at));
      const gain = (def.gain ?? 1) * (cue.gain ?? 1) * place.gain * (mode === "paused" && !def.ui ? SFX.pausedLoops : 1);
      const playing = this.loops.get(key);
      if (playing) {
        playing.voice.set(gain, place.pan);
        continue;
      }
      const file = soundFile(group.id, def.files[0] ?? "");
      const voice = file ? this.player.loop(file, { bus: soundBus(def), gain, pan: place.pan }) : null;
      if (voice) this.loops.set(key, { voice, sound: cue.sound });
    }
  }

  private applyVolume(): void {
    const buses = this.engine.buses;
    const context = this.engine.context;
    if (!buses || !context) return;
    glide(buses.world.gain, this.volume * SFX.worldLevel, context);
    glide(buses.ui.gain, this.volume * SFX.uiLevel, context);
  }
}

/** Випадковий множник 1 ± `spread`. */
function jitter(spread: number | undefined): number {
  return spread ? 1 + (Math.random() * 2 - 1) * spread : 1;
}
