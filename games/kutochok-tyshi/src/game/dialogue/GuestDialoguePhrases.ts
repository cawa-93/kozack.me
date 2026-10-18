import type { EnemyType } from '../../domain/enemies/EnemyDefinition';

export const GUEST_DIALOGUE_MAX_LENGTH = 30;

const WEAK_LEADS = Object.freeze([
  'Гайда',
  'Ходім',
  'Пішли',
  'Давай',
  'Може,',
  'Го',
  'Нумо',
  'Погнали',
  'Ходімо',
  'Рушаймо',
] as const);

const WEAK_ACTIVITIES = Object.freeze([
  'на каву',
  'на чай',
  'на какао',
  'на квіз',
  'на фест',
  'на бранч',
  'на пікнік',
  'на концерт',
  'на стендап',
  'на танці',
  'на йогу',
  'на лекцію',
  'на квест',
  'на матч',
  'на джем',
  'на боулінг',
  'на шопінг',
  'на ролики',
  'в кіно',
  'в гості',
] as const);

const WEAK_MOMENTS = Object.freeze([
  '',
  'зараз',
  'сьогодні',
  'увечері',
  'цими днями',
  'разом',
  'після пар',
  'у суботу',
  'на годинку',
  'на вихідних',
] as const);

const FAST_LEADS = Object.freeze([
  'Гайда вже',
  'Мерщій',
  'Хутчіш',
  'Побігли',
  'Полетіли',
  'Рвонули',
  'Нумо вже',
  'Швидше',
  'Час бігти',
  'Вже мчимо',
] as const);

const FAST_ACTIVITIES = Object.freeze([
  'на фест',
  'на рейв',
  'на матч',
  'на квест',
  'на спринт',
  'на танці',
  'на джем',
  'на флешмоб',
  'на забіг',
  'на батл',
  'на шоу',
  'на стрім',
  'на екшен',
  'на двіж',
  'на сцену',
  'на ролики',
  'на скейти',
  'в клуб',
  'в кіно',
  'в центр',
] as const);

const FAST_MOMENTS = Object.freeze([
  '',
  'зараз',
  'сьогодні',
  'увечері',
  'по обіді',
] as const);

const STRONG_LEADS = Object.freeze([
  'Усі гайда',
  'Ми йдемо',
  'Всі вперед',
  'Гурт іде',
  'Банда йде',
  'Ходім усі',
  'Натовп іде',
  'Ми гуртом',
  'Всі сюди',
  'Гей, усі',
] as const);

const STRONG_ACTIVITIES = Object.freeze([
  'на мітинг',
  'на караоке',
  'на вечірку',
  'на концерт',
  'на фест',
  'на флешмоб',
  'на парад',
  'на пікнік',
  'на ярмарок',
  'на танці',
] as const);

const STRONG_MOMENTS = Object.freeze([
  '',
  'зараз',
  'разом',
  'мерщій',
  'до ночі',
] as const);

const ROACH_PHRASES = Object.freeze(['І-Ґо-Ґо'] as const);

function combinePhraseAxes(
  leads: readonly string[],
  activities: readonly string[],
  moments: readonly string[],
): readonly string[] {
  const phrases: string[] = [];

  for (const lead of leads) {
    for (const activity of activities) {
      for (const moment of moments) {
        const phrase = [lead, activity, moment].filter(Boolean).join(' ');
        assertReadablePhrase(phrase);
        phrases.push(phrase);
      }
    }
  }

  if (new Set(phrases).size !== phrases.length) {
    throw new Error('Guest dialogue phrase axes must produce unique phrases.');
  }

  return Object.freeze(phrases);
}

function assertReadablePhrase(phrase: string): void {
  if ([...phrase].length > GUEST_DIALOGUE_MAX_LENGTH) {
    throw new Error(
      `Guest dialogue phrase exceeds ${GUEST_DIALOGUE_MAX_LENGTH} characters: ${phrase}`,
    );
  }
}

export const GUEST_DIALOGUE_CATALOG: Readonly<
  Record<EnemyType, readonly string[]>
> = Object.freeze({
  weak: combinePhraseAxes(WEAK_LEADS, WEAK_ACTIVITIES, WEAK_MOMENTS),
  fast: combinePhraseAxes(FAST_LEADS, FAST_ACTIVITIES, FAST_MOMENTS),
  strong: combinePhraseAxes(STRONG_LEADS, STRONG_ACTIVITIES, STRONG_MOMENTS),
  roach: ROACH_PHRASES,
});

export const GUEST_DIALOGUE_PHRASE_COUNTS: Readonly<Record<EnemyType, number>> =
  Object.freeze({
    weak: GUEST_DIALOGUE_CATALOG.weak.length,
    fast: GUEST_DIALOGUE_CATALOG.fast.length,
    strong: GUEST_DIALOGUE_CATALOG.strong.length,
    roach: GUEST_DIALOGUE_CATALOG.roach.length,
  });

export function getGuestDialogueCatalog(type: EnemyType): readonly string[] {
  return GUEST_DIALOGUE_CATALOG[type];
}

export function getGuestDialoguePhrase(type: EnemyType, index: number): string {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new RangeError('Guest dialogue phrase index must be a non-negative safe integer.');
  }

  const catalog = getGuestDialogueCatalog(type);
  return catalog[index % catalog.length]!;
}
