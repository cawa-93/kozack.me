import Phaser from 'phaser';

import {
  AUDIO_ASSETS,
  type MusicMode,
  type SoundEffectKey,
} from './AudioAssets';
import {
  GameAudioDirector,
  type AudioBackend,
  type AudioLoopHandle,
} from './GameAudioDirector';
import type { DamageTowerType } from '../../domain/structures/Tower';

interface DirectorState {
  readonly director: GameAudioDirector;
  unlockListenerAttached: boolean;
}

export interface GameAudioVolumes {
  readonly musicVolume: number;
  readonly effectsVolume: number;
}

class PhaserAudioBackend implements AudioBackend {
  readonly #manager: Phaser.Sound.BaseSoundManager;

  constructor(manager: Phaser.Sound.BaseSoundManager) {
    this.#manager = manager;
  }

  get locked(): boolean {
    return this.#manager.locked;
  }

  createLoop(asset: (typeof AUDIO_ASSETS)[number]): AudioLoopHandle {
    return this.#manager.add(asset.key, {
      loop: true,
      volume: asset.volume,
    }) as
      | Phaser.Sound.HTML5AudioSound
      | Phaser.Sound.NoAudioSound
      | Phaser.Sound.WebAudioSound;
  }

  playOneShot(
    asset: (typeof AUDIO_ASSETS)[number],
    maxVoices: number,
    sharedVoiceKeys?: readonly (typeof AUDIO_ASSETS)[number]['key'][],
  ): boolean {
    const voiceKeys: readonly string[] = sharedVoiceKeys ?? [asset.key];
    const playingVoices = this.#manager
      .getAllPlaying()
      .filter((sound) => voiceKeys.includes(sound.key)).length;
    if (playingVoices >= maxVoices) {
      return false;
    }
    return this.#manager.play(asset.key, { volume: asset.volume });
  }

  removeByKey(key: (typeof AUDIO_ASSETS)[number]['key']): void {
    this.#manager.removeByKey(key);
  }
}

const DIRECTORS = new WeakMap<Phaser.Game, DirectorState>();

export function preloadGameAudio(scene: Phaser.Scene): void {
  for (const asset of AUDIO_ASSETS) {
    if (!scene.cache.audio.exists(asset.key)) {
      scene.load.audio(asset.key, asset.source);
    }
  }
}

export function setGameMusic(
  scene: Phaser.Scene,
  mode: MusicMode | null,
): void {
  getDirectorState(scene).director.setMusic(mode);
}

export function playGameCue(
  scene: Phaser.Scene,
  key: SoundEffectKey,
): boolean {
  return getDirectorState(scene).director.playCue(key);
}

export function playKittenMeowCue(scene: Phaser.Scene): boolean {
  return getDirectorState(scene).director.playKittenMeow();
}

/** Queue a shot into the shared 150 ms combat mix. */
export function queueTowerShotCue(
  scene: Phaser.Scene,
  type: DamageTowerType,
): boolean {
  return getDirectorState(scene).director.queueTowerShot(type);
}

/** Call once per GameScene frame after tower-shot events are queued. */
export function flushCombatAudio(scene: Phaser.Scene): boolean {
  return getDirectorState(scene).director.flushCombat();
}

export function clearCombatAudioQueue(scene: Phaser.Scene): void {
  getDirectorState(scene).director.clearCombatQueue();
}

export function getGameAudioVolumes(scene: Phaser.Scene): GameAudioVolumes {
  const director = getDirectorState(scene).director;
  return {
    musicVolume: director.musicVolume,
    effectsVolume: director.effectsVolume,
  };
}

export function setGameMusicVolume(
  scene: Phaser.Scene,
  value: number,
): void {
  getDirectorState(scene).director.setMusicVolume(value);
}

export function setGameEffectsVolume(
  scene: Phaser.Scene,
  value: number,
): void {
  getDirectorState(scene).director.setEffectsVolume(value);
}

export function playDefeatCue(scene: Phaser.Scene): boolean {
  return getDirectorState(scene).director.playDefeat();
}

function getDirectorState(scene: Phaser.Scene): DirectorState {
  const existing = DIRECTORS.get(scene.game);
  const state =
    existing ?? {
      director: new GameAudioDirector(
        new PhaserAudioBackend(scene.sound),
        () => performance.now(),
      ),
      unlockListenerAttached: false,
    };
  if (existing === undefined) {
    DIRECTORS.set(scene.game, state);
  }

  if (scene.sound.locked && !state.unlockListenerAttached) {
    state.unlockListenerAttached = true;
    scene.sound.once(Phaser.Sound.Events.UNLOCKED, () => {
      state.unlockListenerAttached = false;
      state.director.handleUnlocked();
    });
  }
  return state;
}
