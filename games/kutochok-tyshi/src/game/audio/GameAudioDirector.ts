import type { DamageTowerType } from '../../domain/structures/Tower';
import {
  AUDIO_KEYS,
  getAudioAsset,
  KITTEN_MEOW_KEYS,
  type AudioAssetDefinition,
  type AudioKey,
  type KittenMeowKey,
  type MusicMode,
  type SoundEffectKey,
} from './AudioAssets';
import { clampVolume } from './VolumeMath';

export interface AudioLoopHandle {
  readonly isPlaying: boolean;
  play(): boolean;
  stop(): boolean;
  setVolume(volume: number): void;
  destroy(): void;
}

export interface AudioBackend {
  readonly locked: boolean;
  createLoop(asset: AudioAssetDefinition): AudioLoopHandle;
  playOneShot(
    asset: AudioAssetDefinition,
    maxVoices: number,
    sharedVoiceKeys?: readonly AudioKey[],
  ): boolean;
  removeByKey(key: AudioKey): void;
}

interface CuePolicy {
  readonly cooldownMs: number;
  readonly maxVoices: number;
  readonly queueWhileLocked?: boolean;
}

const CUE_POLICIES: Readonly<Record<SoundEffectKey, CuePolicy>> = {
  // Combat shots use the shared aggregate policy below instead.
  [AUDIO_KEYS.shotBasic]: { cooldownMs: 0, maxVoices: 2 },
  [AUDIO_KEYS.shotRapid]: { cooldownMs: 0, maxVoices: 2 },
  [AUDIO_KEYS.shotHeavy]: { cooldownMs: 0, maxVoices: 2 },
  [AUDIO_KEYS.coreDamage]: { cooldownMs: 350, maxVoices: 1 },
  [AUDIO_KEYS.defeat]: { cooldownMs: 1_000, maxVoices: 1 },
  [AUDIO_KEYS.uiClick]: {
    cooldownMs: 40,
    maxVoices: 2,
    queueWhileLocked: true,
  },
  [AUDIO_KEYS.uiHover]: { cooldownMs: 80, maxVoices: 1 },
  [AUDIO_KEYS.buildPlace]: { cooldownMs: 70, maxVoices: 2 },
  [AUDIO_KEYS.sellRemove]: { cooldownMs: 100, maxVoices: 1 },
  [AUDIO_KEYS.invalid]: { cooldownMs: 180, maxVoices: 1 },
  [AUDIO_KEYS.levelStart]: { cooldownMs: 500, maxVoices: 1 },
  [AUDIO_KEYS.mineExplosion]: { cooldownMs: 1_000, maxVoices: 1 },
};

export const KITTEN_MEOW_AUDIO_POLICY = {
  cooldownMs: 500,
  maxVoices: 1,
} as const;

export const COMBAT_AUDIO_POLICY = {
  aggregationWindowMs: 150,
  maxSoundsPerSecond: 6,
  maxVoices: 2,
  rollingWindowMs: 1_000,
} as const;

export const COMBAT_SHOT_KEYS = [
  AUDIO_KEYS.shotRapid,
  AUDIO_KEYS.shotBasic,
  AUDIO_KEYS.shotHeavy,
] as const;

type CombatShotKey = (typeof COMBAT_SHOT_KEYS)[number];

const COMBAT_PRIORITY: Readonly<Record<CombatShotKey, number>> = {
  [AUDIO_KEYS.shotRapid]: 0,
  [AUDIO_KEYS.shotBasic]: 1,
  [AUDIO_KEYS.shotHeavy]: 2,
};

function isCombatShotKey(key: SoundEffectKey): key is CombatShotKey {
  return (COMBAT_SHOT_KEYS as readonly SoundEffectKey[]).includes(key);
}

const MUSIC_KEYS: Readonly<Record<MusicMode, AudioKey>> = {
  menu: AUDIO_KEYS.menuMusic,
  level: AUDIO_KEYS.levelMusic,
};

function scaledAsset(
  asset: AudioAssetDefinition,
  volumeMultiplier: number,
): AudioAssetDefinition {
  return {
    ...asset,
    volume: asset.volume * volumeMultiplier,
  };
}

export function towerShotAudioKey(type: DamageTowerType): CombatShotKey {
  switch (type) {
    case 'basic':
      return AUDIO_KEYS.shotBasic;
    case 'rapid':
      return AUDIO_KEYS.shotRapid;
    case 'heavy':
      return AUDIO_KEYS.shotHeavy;
  }
}

export function kittenMeowKeyForRandom(randomValue: number): KittenMeowKey {
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new RangeError('Kitten-meow random value must be in [0, 1).');
  }

  const key = KITTEN_MEOW_KEYS[
    Math.floor(randomValue * KITTEN_MEOW_KEYS.length)
  ];
  if (key === undefined) {
    throw new RangeError('Could not select a kitten-meow audio variant.');
  }
  return key;
}

/**
 * Owns one music loop and rate-limited one-shots for a whole Phaser game.
 * It deliberately uses wall-clock time, so 2x/4x/10x simulation speed never
 * changes music pitch or turns a dense volley into unbounded audio spam.
 */
export class GameAudioDirector {
  readonly #lastCueAt = new Map<SoundEffectKey, number>();
  readonly #combatPlayedAt: number[] = [];
  readonly #backend: AudioBackend;
  readonly #now: () => number;
  readonly #random: () => number;

  #desiredMusic: MusicMode | null = null;
  #activeMusicKey: AudioKey | null = null;
  #activeMusic: AudioLoopHandle | null = null;
  #pendingCue: SoundEffectKey | null = null;
  #pendingCombatShot: CombatShotKey | null = null;
  #combatBatchStartedAt: number | null = null;
  #lastKittenMeowAt: number | null = null;
  #defeatPlayed = false;
  #musicVolume = 1;
  #effectsVolume = 1;

  constructor(
    backend: AudioBackend,
    now: () => number,
    random: () => number = Math.random,
  ) {
    this.#backend = backend;
    this.#now = now;
    this.#random = random;
  }

  get musicVolume(): number {
    return this.#musicVolume;
  }

  get effectsVolume(): number {
    return this.#effectsVolume;
  }

  setMusicVolume(value: number): void {
    this.#musicVolume = clampVolume(value);
    if (this.#activeMusic !== null && this.#activeMusicKey !== null) {
      this.#activeMusic.setVolume(
        getAudioAsset(this.#activeMusicKey).volume * this.#musicVolume,
      );
    }
  }

  setEffectsVolume(value: number): void {
    this.#effectsVolume = clampVolume(value);
  }

  setMusic(mode: MusicMode | null): void {
    if (mode !== null && this.#desiredMusic !== mode) {
      this.#defeatPlayed = false;
    }

    this.#desiredMusic = mode;
    const desiredKey = mode === null ? null : MUSIC_KEYS[mode];
    if (this.#activeMusicKey !== desiredKey) {
      this.disposeMusic();
    }
    this.reconcileMusic();
  }

  handleUnlocked(): void {
    this.reconcileMusic();

    const pendingCue = this.#pendingCue;
    this.#pendingCue = null;
    if (pendingCue !== null) {
      this.playCue(pendingCue);
    }
  }

  playCue(key: SoundEffectKey): boolean {
    if (isCombatShotKey(key)) {
      return this.queueCombatShot(key);
    }

    const policy = CUE_POLICIES[key];
    if (this.#backend.locked) {
      if (policy.queueWhileLocked === true) {
        this.#pendingCue = key;
      }
      return false;
    }

    const now = this.#now();
    const lastPlayedAt = this.#lastCueAt.get(key);
    if (
      lastPlayedAt !== undefined &&
      now >= lastPlayedAt &&
      now - lastPlayedAt < policy.cooldownMs
    ) {
      return false;
    }

    const played = this.#backend.playOneShot(
      scaledAsset(getAudioAsset(key), this.#effectsVolume),
      policy.maxVoices,
    );
    if (played) {
      this.#lastCueAt.set(key, now);
    }
    return played;
  }

  playKittenMeow(): boolean {
    if (this.#backend.locked) {
      return false;
    }

    const now = this.#now();
    if (
      this.#lastKittenMeowAt !== null &&
      now >= this.#lastKittenMeowAt &&
      now - this.#lastKittenMeowAt < KITTEN_MEOW_AUDIO_POLICY.cooldownMs
    ) {
      return false;
    }

    const key = kittenMeowKeyForRandom(this.#random());
    const played = this.#backend.playOneShot(
      scaledAsset(getAudioAsset(key), this.#effectsVolume),
      KITTEN_MEOW_AUDIO_POLICY.maxVoices,
      KITTEN_MEOW_KEYS,
    );
    if (played) {
      this.#lastKittenMeowAt = now;
    }
    return played;
  }

  queueTowerShot(type: DamageTowerType): boolean {
    return this.queueCombatShot(towerShotAudioKey(type));
  }

  /**
   * Flush once per rendered frame after simulation events were handled.
   * At most one representative (heavy > basic > rapid) is selected from each
   * 150 ms batch, then guarded by a six-per-rolling-second global budget and
   * a two-voice pool shared by all three shot assets.
   */
  flushCombat(): boolean {
    const pendingShot = this.#pendingCombatShot;
    if (
      pendingShot === null ||
      this.#combatBatchStartedAt === null ||
      this.#backend.locked
    ) {
      return false;
    }

    const now = this.#now();
    if (now < this.#combatBatchStartedAt) {
      this.#combatBatchStartedAt = now;
      this.#combatPlayedAt.length = 0;
      return false;
    }
    if (
      now - this.#combatBatchStartedAt <
      COMBAT_AUDIO_POLICY.aggregationWindowMs
    ) {
      return false;
    }

    this.expireCombatBudget(now);
    if (
      this.#combatPlayedAt.length >=
      COMBAT_AUDIO_POLICY.maxSoundsPerSecond
    ) {
      return false;
    }

    const played = this.#backend.playOneShot(
      scaledAsset(getAudioAsset(pendingShot), this.#effectsVolume),
      COMBAT_AUDIO_POLICY.maxVoices,
      COMBAT_SHOT_KEYS,
    );
    if (!played) {
      return false;
    }

    this.#combatPlayedAt.push(now);
    this.#pendingCombatShot = null;
    this.#combatBatchStartedAt = null;
    return true;
  }

  clearCombatQueue(): void {
    this.#pendingCombatShot = null;
    this.#combatBatchStartedAt = null;
  }

  playDefeat(): boolean {
    if (this.#defeatPlayed) {
      return false;
    }

    this.#defeatPlayed = true;
    this.#desiredMusic = null;
    this.#pendingCue = null;
    this.clearCombatQueue();
    this.#combatPlayedAt.length = 0;
    this.disposeMusic();
    this.#backend.removeByKey(AUDIO_KEYS.coreDamage);
    return this.playCue(AUDIO_KEYS.defeat);
  }

  private queueCombatShot(key: CombatShotKey): boolean {
    if (this.#backend.locked) {
      return false;
    }

    const now = this.#now();
    if (this.#pendingCombatShot === null) {
      this.#pendingCombatShot = key;
      this.#combatBatchStartedAt = now;
      return true;
    }

    if (
      COMBAT_PRIORITY[key] > COMBAT_PRIORITY[this.#pendingCombatShot]
    ) {
      this.#pendingCombatShot = key;
    }
    return true;
  }

  private expireCombatBudget(now: number): void {
    const latestPlayedAt = this.#combatPlayedAt.at(-1);
    if (latestPlayedAt !== undefined && now < latestPlayedAt) {
      this.#combatPlayedAt.length = 0;
      return;
    }

    while (
      this.#combatPlayedAt[0] !== undefined &&
      now - this.#combatPlayedAt[0] >= COMBAT_AUDIO_POLICY.rollingWindowMs
    ) {
      this.#combatPlayedAt.shift();
    }
  }

  private reconcileMusic(): void {
    if (this.#backend.locked) {
      return;
    }

    const desiredKey =
      this.#desiredMusic === null ? null : MUSIC_KEYS[this.#desiredMusic];
    if (
      desiredKey !== null &&
      this.#activeMusicKey === desiredKey &&
      this.#activeMusic?.isPlaying === true
    ) {
      return;
    }

    this.disposeMusic();
    if (desiredKey === null) {
      return;
    }

    const asset = scaledAsset(
      getAudioAsset(desiredKey),
      this.#musicVolume,
    );
    const music = this.#backend.createLoop(asset);
    if (!music.play()) {
      music.destroy();
      return;
    }

    this.#activeMusic = music;
    this.#activeMusicKey = desiredKey;
  }

  private disposeMusic(): void {
    if (this.#activeMusic !== null) {
      this.#activeMusic.stop();
      this.#activeMusic.destroy();
    }
    this.#activeMusic = null;
    this.#activeMusicKey = null;
  }
}
