export const AUDIO_KEYS = {
  menuMusic: 'audio-music-menu',
  levelMusic: 'audio-music-level',
  shotBasic: 'audio-shot-basic',
  shotRapid: 'audio-shot-rapid',
  shotHeavy: 'audio-shot-heavy',
  coreDamage: 'audio-core-damage',
  defeat: 'audio-defeat',
  uiClick: 'audio-ui-click',
  uiHover: 'audio-ui-hover',
  buildPlace: 'audio-build-place',
  sellRemove: 'audio-sell-remove',
  invalid: 'audio-invalid',
  levelStart: 'audio-level-start',
  kittenMeow01: 'audio-kitten-meow-01',
  kittenMeow02: 'audio-kitten-meow-02',
  kittenMeow03: 'audio-kitten-meow-03',
  kittenMeow04: 'audio-kitten-meow-04',
  kittenMeow05: 'audio-kitten-meow-05',
  kittenMeow06: 'audio-kitten-meow-06',
  kittenMeow07: 'audio-kitten-meow-07',
  kittenMeow08: 'audio-kitten-meow-08',
  kittenMeow09: 'audio-kitten-meow-09',
  kittenMeow10: 'audio-kitten-meow-10',
  kittenMeow11: 'audio-kitten-meow-11',
  kittenMeow12: 'audio-kitten-meow-12',
  kittenMeow13: 'audio-kitten-meow-13',
  mineExplosion: 'audio-mine-explosion',
} as const;

export type AudioKey = (typeof AUDIO_KEYS)[keyof typeof AUDIO_KEYS];

export const KITTEN_MEOW_KEYS = [
  AUDIO_KEYS.kittenMeow01,
  AUDIO_KEYS.kittenMeow02,
  AUDIO_KEYS.kittenMeow03,
  AUDIO_KEYS.kittenMeow04,
  AUDIO_KEYS.kittenMeow05,
  AUDIO_KEYS.kittenMeow06,
  AUDIO_KEYS.kittenMeow07,
  AUDIO_KEYS.kittenMeow08,
  AUDIO_KEYS.kittenMeow09,
  AUDIO_KEYS.kittenMeow10,
  AUDIO_KEYS.kittenMeow11,
  AUDIO_KEYS.kittenMeow12,
  AUDIO_KEYS.kittenMeow13,
] as const;

export type KittenMeowKey = (typeof KITTEN_MEOW_KEYS)[number];

export type MusicMode = 'menu' | 'level';

export type SoundEffectKey = Exclude<
  AudioKey,
  | typeof AUDIO_KEYS.menuMusic
  | typeof AUDIO_KEYS.levelMusic
  | KittenMeowKey
>;

export interface AudioAssetDefinition {
  readonly key: AudioKey;
  readonly source: string;
  readonly loop: boolean;
  readonly volume: number;
}

/** Roughly -7 dB compared with the original combat-shot mix. */
export const COMBAT_SHOT_GAIN = 10 ** (-7 / 20);

const audioAsset = (
  key: AudioKey,
  fileName: string,
  volume: number,
  loop = false,
): AudioAssetDefinition => ({
  key,
  source: `${import.meta.env.BASE_URL}assets/audio/${fileName}`,
  loop,
  volume,
});

const KITTEN_MEOW_ASSETS = KITTEN_MEOW_KEYS.map((key, index) =>
  audioAsset(
    key,
    `kitten-meow-${String(index + 1).padStart(2, '0')}.wav`,
    0.34,
  ),
);

export const AUDIO_ASSETS: readonly AudioAssetDefinition[] = [
  audioAsset(AUDIO_KEYS.menuMusic, 'music-menu.wav', 0.34, true),
  audioAsset(AUDIO_KEYS.levelMusic, 'music-level.wav', 0.3, true),
  audioAsset(
    AUDIO_KEYS.shotBasic,
    'shot-basic.wav',
    0.24 * COMBAT_SHOT_GAIN,
  ),
  audioAsset(
    AUDIO_KEYS.shotRapid,
    'shot-rapid.wav',
    0.16 * COMBAT_SHOT_GAIN,
  ),
  audioAsset(
    AUDIO_KEYS.shotHeavy,
    'shot-heavy.wav',
    0.3 * COMBAT_SHOT_GAIN,
  ),
  audioAsset(AUDIO_KEYS.coreDamage, 'core-damage.wav', 0.42),
  audioAsset(AUDIO_KEYS.defeat, 'defeat.wav', 0.48),
  audioAsset(AUDIO_KEYS.uiClick, 'ui-click.wav', 0.22),
  audioAsset(AUDIO_KEYS.uiHover, 'ui-hover.wav', 0.1),
  audioAsset(AUDIO_KEYS.buildPlace, 'build-place.wav', 0.3),
  audioAsset(AUDIO_KEYS.sellRemove, 'sell-remove.wav', 0.3),
  audioAsset(AUDIO_KEYS.invalid, 'invalid.wav', 0.28),
  audioAsset(AUDIO_KEYS.levelStart, 'level-start.wav', 0.38),
  ...KITTEN_MEOW_ASSETS,
  audioAsset(AUDIO_KEYS.mineExplosion, 'mine-explosion.wav', 0.52),
];

export function getAudioAsset(key: AudioKey): AudioAssetDefinition {
  const asset = AUDIO_ASSETS.find((candidate) => candidate.key === key);
  if (asset === undefined) {
    throw new Error(`Unknown audio asset: ${key}`);
  }
  return asset;
}
