import { describe, expect, it } from 'vitest';
// @ts-expect-error -- this Vitest-only integrity check runs in Node, while the
// production TypeScript project intentionally does not install Node typings.
import { readFileSync } from 'node:fs';

import {
  AUDIO_ASSETS,
  AUDIO_KEYS,
  COMBAT_SHOT_GAIN,
  getAudioAsset,
  KITTEN_MEOW_KEYS,
  type AudioAssetDefinition,
  type AudioKey,
} from '../../src/game/audio/AudioAssets';
import {
  COMBAT_AUDIO_POLICY,
  COMBAT_SHOT_KEYS,
  GameAudioDirector,
  KITTEN_MEOW_AUDIO_POLICY,
  kittenMeowKeyForRandom,
  towerShotAudioKey,
  type AudioBackend,
  type AudioLoopHandle,
} from '../../src/game/audio/GameAudioDirector';

class FakeLoop implements AudioLoopHandle {
  isPlaying = false;
  playCount = 0;
  stopCount = 0;
  destroyCount = 0;
  readonly volumes: number[] = [];

  play(): boolean {
    this.playCount += 1;
    this.isPlaying = true;
    return true;
  }

  stop(): boolean {
    this.stopCount += 1;
    this.isPlaying = false;
    return true;
  }

  setVolume(volume: number): void {
    this.volumes.push(volume);
  }

  destroy(): void {
    this.destroyCount += 1;
    this.isPlaying = false;
  }
}

class FakeBackend implements AudioBackend {
  locked = false;
  readonly loops: Array<{ asset: AudioAssetDefinition; loop: FakeLoop }> = [];
  readonly oneShots: Array<{
    asset: AudioAssetDefinition;
    maxVoices: number;
    sharedVoiceKeys: readonly AudioKey[] | undefined;
  }> = [];
  readonly removedKeys: AudioKey[] = [];
  playOneShotResult = true;

  createLoop(asset: AudioAssetDefinition): AudioLoopHandle {
    const loop = new FakeLoop();
    this.loops.push({ asset, loop });
    return loop;
  }

  playOneShot(
    asset: AudioAssetDefinition,
    maxVoices: number,
    sharedVoiceKeys?: readonly AudioKey[],
  ): boolean {
    this.oneShots.push({ asset, maxVoices, sharedVoiceKeys });
    return this.playOneShotResult;
  }

  removeByKey(key: AudioKey): void {
    this.removedKeys.push(key);
  }
}

function createDirector(
  backend = new FakeBackend(),
  random: () => number = () => 0,
) {
  let now = 0;
  return {
    backend,
    director: new GameAudioDirector(backend, () => now, random),
    setNow(value: number): void {
      now = value;
    },
  };
}

describe('audio asset manifest', () => {
  it('contains unique stable keys and separates two loops from one-shots', () => {
    const keys = AUDIO_ASSETS.map((asset) => asset.key);
    const sources = AUDIO_ASSETS.map((asset) => asset.source);

    expect(KITTEN_MEOW_KEYS).toHaveLength(13);
    expect(AUDIO_ASSETS).toHaveLength(14 + KITTEN_MEOW_KEYS.length);
    expect(AUDIO_ASSETS).toHaveLength(27);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(sources).size).toBe(sources.length);
    expect(AUDIO_ASSETS.filter((asset) => asset.loop).map((asset) => asset.key))
      .toEqual([AUDIO_KEYS.menuMusic, AUDIO_KEYS.levelMusic]);
    expect(AUDIO_ASSETS.every((asset) => asset.source.endsWith('.wav'))).toBe(true);
    expect(
      AUDIO_ASSETS.every((asset) => asset.volume > 0 && asset.volume <= 1),
    ).toBe(true);
    expect(KITTEN_MEOW_KEYS.map((key) => getAudioAsset(key).source)).toEqual(
      KITTEN_MEOW_KEYS.map(
        (_, index) =>
          `/assets/audio/kitten-meow-${String(index + 1).padStart(2, '0')}.wav`,
      ),
    );
  });

  it('ships every referenced kitten WAV with a RIFF/WAVE header and audio data', () => {
    for (const key of KITTEN_MEOW_KEYS) {
      const asset = getAudioAsset(key);
      const fileUrl = new URL(`../../public${asset.source}`, import.meta.url);
      const wave = readFileSync(fileUrl);
      const dataOffset = wave.indexOf('data', 12, 'ascii');

      expect(wave.toString('ascii', 0, 4), asset.source).toBe('RIFF');
      expect(wave.toString('ascii', 8, 12), asset.source).toBe('WAVE');
      expect(dataOffset, asset.source).toBeGreaterThanOrEqual(12);
      expect(wave.readUInt32LE(dataOffset + 4), asset.source).toBeGreaterThan(0);
      expect(
        dataOffset + 8 + wave.readUInt32LE(dataOffset + 4),
        asset.source,
      ).toBeLessThanOrEqual(wave.length);
    }
  });

  it('maps random endpoints and every midpoint to the complete kitten bank', () => {
    expect(kittenMeowKeyForRandom(0)).toBe(KITTEN_MEOW_KEYS[0]);
    expect(kittenMeowKeyForRandom(1 - Number.EPSILON)).toBe(
      KITTEN_MEOW_KEYS.at(-1),
    );
    expect(
      KITTEN_MEOW_KEYS.map((_, index) =>
        kittenMeowKeyForRandom(index / KITTEN_MEOW_KEYS.length),
      ),
    ).toEqual(KITTEN_MEOW_KEYS);
    expect(
      KITTEN_MEOW_KEYS.map((_, index) =>
        kittenMeowKeyForRandom(
          (index + 0.5) / KITTEN_MEOW_KEYS.length,
        ),
      ),
    ).toEqual(KITTEN_MEOW_KEYS);

    for (const invalid of [
      -Number.EPSILON,
      1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(() => kittenMeowKeyForRandom(invalid)).toThrow(RangeError);
    }
  });

  it('mixes all combat shots roughly 7 dB below their original levels', () => {
    expect(getAudioAsset(AUDIO_KEYS.shotBasic).volume).toBeCloseTo(
      0.24 * COMBAT_SHOT_GAIN,
    );
    expect(getAudioAsset(AUDIO_KEYS.shotRapid).volume).toBeCloseTo(
      0.16 * COMBAT_SHOT_GAIN,
    );
    expect(getAudioAsset(AUDIO_KEYS.shotHeavy).volume).toBeCloseTo(
      0.3 * COMBAT_SHOT_GAIN,
    );
    expect(COMBAT_SHOT_GAIN).toBeCloseTo(0.4467, 4);
  });
});

describe('game audio director', () => {
  it('replaces menu music with one level loop and never duplicates it', () => {
    const { backend, director } = createDirector();

    director.setMusic('menu');
    const menu = backend.loops[0];
    expect(menu?.asset.key).toBe(AUDIO_KEYS.menuMusic);

    director.setMusic('level');
    expect(menu?.loop.stopCount).toBe(1);
    expect(menu?.loop.destroyCount).toBe(1);
    expect(backend.loops[1]?.asset.key).toBe(AUDIO_KEYS.levelMusic);

    director.setMusic('level');
    expect(backend.loops).toHaveLength(2);
  });

  it('keeps only the latest requested music while browser audio is locked', () => {
    const backend = new FakeBackend();
    backend.locked = true;
    const { director } = createDirector(backend);

    director.setMusic('menu');
    director.playCue(AUDIO_KEYS.uiHover);
    director.playCue(AUDIO_KEYS.uiClick);
    director.setMusic('level');
    expect(backend.loops).toHaveLength(0);
    expect(backend.oneShots).toHaveLength(0);

    backend.locked = false;
    director.handleUnlocked();

    expect(backend.loops.map(({ asset }) => asset.key)).toEqual([
      AUDIO_KEYS.levelMusic,
    ]);
    expect(backend.oneShots.map(({ asset }) => asset.key)).toEqual([
      AUDIO_KEYS.uiClick,
    ]);
  });

  it('preserves independent wall-clock limits for non-combat cues', () => {
    const { backend, director, setNow } = createDirector();

    expect(director.playCue(AUDIO_KEYS.uiClick)).toBe(true);
    expect(director.playCue(AUDIO_KEYS.uiClick)).toBe(false);

    setNow(39);
    expect(director.playCue(AUDIO_KEYS.uiClick)).toBe(false);
    setNow(40);
    expect(director.playCue(AUDIO_KEYS.uiClick)).toBe(true);
    expect(backend.oneShots.map(({ asset }) => asset.key)).toEqual([
      AUDIO_KEYS.uiClick,
      AUDIO_KEYS.uiClick,
    ]);
  });

  it('emits every kitten variant from controlled random values', () => {
    const randomValues = KITTEN_MEOW_KEYS.map(
      (_, index) => (index + 0.5) / KITTEN_MEOW_KEYS.length,
    );
    let randomCalls = 0;
    const { backend, director, setNow } = createDirector(
      new FakeBackend(),
      () => randomValues[randomCalls++] ?? 0,
    );

    for (let index = 0; index < KITTEN_MEOW_KEYS.length; index += 1) {
      setNow(index * KITTEN_MEOW_AUDIO_POLICY.cooldownMs);
      expect(director.playKittenMeow()).toBe(true);
    }

    expect(randomCalls).toBe(KITTEN_MEOW_KEYS.length);
    expect(backend.oneShots.map(({ asset }) => asset.key)).toEqual(
      KITTEN_MEOW_KEYS,
    );
    expect(
      backend.oneShots.every(
        ({ maxVoices }) =>
          maxVoices === KITTEN_MEOW_AUDIO_POLICY.maxVoices,
      ),
    ).toBe(true);
    expect(
      backend.oneShots.every(
        ({ sharedVoiceKeys }) => sharedVoiceKeys === KITTEN_MEOW_KEYS,
      ),
    ).toBe(true);
  });

  it('shares one cooldown and one voice family across kitten variants', () => {
    const randomValues = [
      0.5 / KITTEN_MEOW_KEYS.length,
      1.5 / KITTEN_MEOW_KEYS.length,
    ];
    let randomCalls = 0;
    const { backend, director, setNow } = createDirector(
      new FakeBackend(),
      () => randomValues[randomCalls++] ?? 0,
    );

    expect(director.playKittenMeow()).toBe(true);
    expect(director.playKittenMeow()).toBe(false);
    setNow(KITTEN_MEOW_AUDIO_POLICY.cooldownMs - 1);
    expect(director.playKittenMeow()).toBe(false);
    setNow(KITTEN_MEOW_AUDIO_POLICY.cooldownMs);
    expect(director.playKittenMeow()).toBe(true);

    expect(randomCalls).toBe(2);
    expect(backend.oneShots.map(({ asset }) => asset.key)).toEqual([
      KITTEN_MEOW_KEYS[0],
      KITTEN_MEOW_KEYS[1],
    ]);
    expect(backend.oneShots[0]?.maxVoices).toBe(1);
    expect(backend.oneShots[1]?.maxVoices).toBe(1);
    expect(backend.oneShots[0]?.sharedVoiceKeys).toBe(KITTEN_MEOW_KEYS);
    expect(backend.oneShots[1]?.sharedVoiceKeys).toBe(KITTEN_MEOW_KEYS);
  });

  it('does not consume kitten random selection while audio is locked', () => {
    const backend = new FakeBackend();
    backend.locked = true;
    let randomCalls = 0;
    const { director } = createDirector(backend, () => {
      randomCalls += 1;
      return 0;
    });

    expect(director.playKittenMeow()).toBe(false);
    expect(randomCalls).toBe(0);
    expect(backend.oneShots).toHaveLength(0);

    backend.locked = false;
    expect(director.playKittenMeow()).toBe(true);
    expect(randomCalls).toBe(1);
  });

  it('applies effects volume to kitten variants', () => {
    const selectedValue = 4.5 / KITTEN_MEOW_KEYS.length;
    const { backend, director } = createDirector(
      new FakeBackend(),
      () => selectedValue,
    );
    director.setEffectsVolume(0.25);

    expect(director.playKittenMeow()).toBe(true);
    expect(backend.oneShots[0]?.asset.key).toBe(KITTEN_MEOW_KEYS[4]);
    expect(backend.oneShots[0]?.asset.volume).toBeCloseTo(0.34 * 0.25);
  });

  it('keeps kitten and mine cues outside the shared combat-shot budget', () => {
    const { backend, director, setNow } = createDirector();

    for (let index = 0; index < COMBAT_AUDIO_POLICY.maxSoundsPerSecond; index += 1) {
      setNow(index * COMBAT_AUDIO_POLICY.aggregationWindowMs);
      director.queueTowerShot(index % 2 === 0 ? 'rapid' : 'basic');
      setNow((index + 1) * COMBAT_AUDIO_POLICY.aggregationWindowMs);
      expect(director.flushCombat()).toBe(true);
    }

    expect(director.playKittenMeow()).toBe(true);
    expect(director.playCue(AUDIO_KEYS.mineExplosion)).toBe(true);
    director.queueTowerShot('heavy');
    setNow(1_050);
    expect(director.flushCombat()).toBe(false);

    expect(backend.oneShots).toHaveLength(
      COMBAT_AUDIO_POLICY.maxSoundsPerSecond + 2,
    );
    expect(backend.oneShots.at(-2)?.asset.key).toBe(KITTEN_MEOW_KEYS[0]);
    expect(backend.oneShots.at(-2)?.sharedVoiceKeys).toBe(
      KITTEN_MEOW_KEYS,
    );
    expect(backend.oneShots.at(-1)?.asset.key).toBe(
      AUDIO_KEYS.mineExplosion,
    );
  });

  it('aggregates a volley for 150 ms and chooses heavy over basic over rapid', () => {
    const { backend, director, setNow } = createDirector();

    expect(director.queueTowerShot('rapid')).toBe(true);
    setNow(50);
    expect(director.queueTowerShot('basic')).toBe(true);
    setNow(100);
    expect(director.queueTowerShot('heavy')).toBe(true);
    setNow(COMBAT_AUDIO_POLICY.aggregationWindowMs - 1);
    expect(director.flushCombat()).toBe(false);
    setNow(COMBAT_AUDIO_POLICY.aggregationWindowMs);
    expect(director.flushCombat()).toBe(true);

    expect(backend.oneShots).toHaveLength(1);
    expect(backend.oneShots[0]?.asset.key).toBe(AUDIO_KEYS.shotHeavy);
    expect(backend.oneShots[0]?.maxVoices).toBe(2);
    expect(backend.oneShots[0]?.sharedVoiceKeys).toEqual(COMBAT_SHOT_KEYS);
  });

  it('limits all shot types together to six sounds in any rolling second', () => {
    const { backend, director, setNow } = createDirector();

    for (let index = 0; index < 6; index += 1) {
      setNow(index * 150);
      director.queueTowerShot(index % 2 === 0 ? 'rapid' : 'basic');
      setNow((index + 1) * 150);
      expect(director.flushCombat()).toBe(true);
    }
    expect(backend.oneShots).toHaveLength(6);

    setNow(900);
    director.queueTowerShot('heavy');
    setNow(1_050);
    expect(director.flushCombat()).toBe(false);
    expect(backend.oneShots).toHaveLength(6);

    setNow(1_150);
    expect(director.flushCombat()).toBe(true);
    expect(backend.oneShots).toHaveLength(7);
    expect(backend.oneShots.at(-1)?.asset.key).toBe(AUDIO_KEYS.shotHeavy);
  });

  it('keeps a ready batch queued while the shared two-voice pool is full', () => {
    const backend = new FakeBackend();
    backend.playOneShotResult = false;
    const { director, setNow } = createDirector(backend);

    director.queueTowerShot('basic');
    setNow(150);
    expect(director.flushCombat()).toBe(false);
    expect(backend.oneShots[0]?.sharedVoiceKeys).toEqual(COMBAT_SHOT_KEYS);

    backend.playOneShotResult = true;
    expect(director.flushCombat()).toBe(true);
    expect(backend.oneShots.at(-1)?.asset.key).toBe(AUDIO_KEYS.shotBasic);
  });

  it('discards an unfinished combat batch when gameplay pauses', () => {
    const { backend, director, setNow } = createDirector();

    director.queueTowerShot('heavy');
    director.clearCombatQueue();
    setNow(1_000);

    expect(director.flushCombat()).toBe(false);
    expect(backend.oneShots).toHaveLength(0);
  });

  it('applies clamped music and effects controls to active and future audio', () => {
    const { backend, director } = createDirector();

    expect(director.musicVolume).toBe(1);
    expect(director.effectsVolume).toBe(1);
    director.setMusic('level');
    director.setMusicVolume(0.25);
    expect(director.musicVolume).toBe(0.25);
    expect(backend.loops[0]?.loop.volumes).toEqual([0.3 * 0.25]);

    director.setEffectsVolume(0.5);
    expect(director.playCue(AUDIO_KEYS.uiClick)).toBe(true);
    expect(backend.oneShots[0]?.asset.volume).toBeCloseTo(0.22 * 0.5);

    director.setMusicVolume(4);
    director.setEffectsVolume(Number.NaN);
    expect(director.musicVolume).toBe(1);
    expect(director.effectsVolume).toBe(0);
    expect(backend.loops[0]?.loop.volumes.at(-1)).toBe(0.3);
  });

  it('supports a silent default before future music and effects are requested', () => {
    const { backend, director } = createDirector();

    director.setMusicVolume(0);
    director.setEffectsVolume(0);
    director.setMusic('level');
    expect(director.playCue(AUDIO_KEYS.uiClick)).toBe(true);

    expect(backend.loops[0]?.asset.volume).toBe(0);
    expect(backend.oneShots[0]?.asset.volume).toBe(0);
    expect(director.musicVolume).toBe(0);
    expect(director.effectsVolume).toBe(0);
  });

  it('stops music, silences the hurt cue, and plays defeat only once', () => {
    const { backend, director, setNow } = createDirector();

    director.setMusic('level');
    expect(director.playDefeat()).toBe(true);
    expect(director.playDefeat()).toBe(false);

    expect(backend.loops[0]?.loop.stopCount).toBe(1);
    expect(backend.loops[0]?.loop.destroyCount).toBe(1);
    expect(backend.removedKeys).toEqual([AUDIO_KEYS.coreDamage]);
    expect(backend.oneShots.map(({ asset }) => asset.key)).toEqual([
      AUDIO_KEYS.defeat,
    ]);

    setNow(1_000);
    director.setMusic('level');
    expect(director.playDefeat()).toBe(true);
  });

  it('routes every wizard-cat type to its own casting sound', () => {
    expect(towerShotAudioKey('basic')).toBe(AUDIO_KEYS.shotBasic);
    expect(towerShotAudioKey('rapid')).toBe(AUDIO_KEYS.shotRapid);
    expect(towerShotAudioKey('heavy')).toBe(AUDIO_KEYS.shotHeavy);
  });
});
