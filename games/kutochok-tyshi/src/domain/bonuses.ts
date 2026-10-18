export type BonusType =
  | 'vacation'
  | 'social-hobby'
  | 'move'
  | 'earplugs'
  | 'burn-bridges'
  | 'wider-thinking'
  | 'cat-treats'
  | 'pet-cats'
  | 'thick-literature'
  | 'social-debt'
  | 'hide-under-blanket'
  | 'twitter-fight';

export interface BonusDefinition {
  readonly title: string;
  readonly description: string;
  readonly maxStacks: number;
  readonly imagePath: string;
}

export interface BonusOfferOption {
  readonly type: BonusType;
  readonly currentStacks: number;
  readonly maxStacks: number;
}

export interface BonusOffer {
  readonly id: string;
  readonly completedLevel: number;
  readonly options: readonly BonusOfferOption[];
}

export const BONUS_TYPES: readonly BonusType[] = Object.freeze([
  'vacation',
  'social-hobby',
  'move',
  'earplugs',
  'burn-bridges',
  'wider-thinking',
  'cat-treats',
  'pet-cats',
  'thick-literature',
  'social-debt',
  'hide-under-blanket',
  'twitter-fight',
]);

export const BONUS_DEFINITIONS: Readonly<Record<BonusType, BonusDefinition>> =
  Object.freeze({
    vacation: bonus(
      'Відпустка',
      'Повністю відновлює соціальну батарейку.',
      5,
      `${import.meta.env.BASE_URL}assets/bonuses/bonus-vacation.png`,
    ),
    'social-hobby': bonus(
      'Знайти соціальне хобі',
      'Збільшує максимум соціальної батарейки на 50 і відновлює 50.',
      8,
      `${import.meta.env.BASE_URL}assets/bonuses/bonus-social-hobby.png`,
    ),
    move: bonus(
      'Переїхати',
      'Уповільнює всіх гостей.',
      10,
      `${import.meta.env.BASE_URL}assets/bonuses/bonus-move.png`,
    ),
    earplugs: bonus(
      'Купити беруші',
      'Зменшує шкоду гостей.',
      10,
      `${import.meta.env.BASE_URL}assets/bonuses/bonus-earplugs.png`,
    ),
    'burn-bridges': bonus(
      'Спалити мости',
      'Зменшує кількість гостей.',
      10,
      `${import.meta.env.BASE_URL}assets/bonuses/bonus-burn-bridges.png`,
    ),
    'wider-thinking': bonus(
      'Ширше мислення',
      'Розширює майбутній вибір бонусів.',
      9,
      `${import.meta.env.BASE_URL}assets/bonuses/bonus-wider-thinking.png`,
    ),
    'cat-treats': bonus(
      'Смаколики котам',
      'Посилює чари котиків і допомагає їм чаклувати частіше.',
      5,
      `${import.meta.env.BASE_URL}assets/bonuses/bonus-cat-treats.png`,
    ),
    'pet-cats': bonus(
      'Погладити котиків',
      'Відновлює 100 одиниць соціальної батарейки.',
      20,
      `${import.meta.env.BASE_URL}assets/bonuses/bonus-pet-cats.png`,
    ),
    'thick-literature': bonus(
      'Товста література',
      'Зміцнює кожну стоску книг.',
      8,
      `${import.meta.env.BASE_URL}assets/bonuses/bonus-thick-literature.png`,
    ),
    'social-debt': bonus(
      'Соціальний борг',
      'Збільшує винагороду за рівень.',
      10,
      `${import.meta.env.BASE_URL}assets/bonuses/bonus-social-debt.png`,
    ),
    'hide-under-blanket': bonus(
      'Сховатись під ковдру і плакати',
      'Захищає від усіх гостей, але залишає без винагороди.',
      1,
      `${import.meta.env.BASE_URL}assets/bonuses/bonus-hide-under-blanket.png`,
    ),
    'twitter-fight': bonus(
      'Срач в Twitter',
      'Приваблює значно більше гостей, але щедро збільшує винагороду.',
      20,
      `${import.meta.env.BASE_URL}assets/bonuses/bonus-twitter-fight.png`,
    ),
  });

function bonus(
  title: string,
  description: string,
  maxStacks: number,
  imagePath: string,
): BonusDefinition {
  return Object.freeze({ title, description, maxStacks, imagePath });
}
