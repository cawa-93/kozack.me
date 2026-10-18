import {
  BONUS_DEFINITIONS,
  BONUS_TYPES,
  type BonusOffer,
  type BonusType,
} from '../domain/bonuses';

export type { BonusOffer, BonusOfferOption } from '../domain/bonuses';

export const BONUS_OFFER_LEVEL_INTERVAL = 3;
export const BASE_BONUS_OPTION_COUNT = 2;
export const HIDE_UNDER_BLANKET_UNLOCK_COMPLETED_LEVEL = 6;
export const DEFAULT_BONUS_RANDOM_SEED = 0x6d2b_79f5;

export interface BonusOfferContext {
  readonly completedLevel: number;
  readonly coreHp: number;
  readonly coreMaxHp: number;
}

export type BonusResolveResult =
  | {
      readonly resolved: true;
      readonly selection: BonusType | null;
      readonly newStacks: number | null;
    }
  | {
      readonly resolved: false;
      readonly reason:
        | 'no-pending-offer'
        | 'offer-id-mismatch'
        | 'not-offered'
        | 'max-stacks-reached';
    };

type MutableBonusStacks = Record<BonusType, number>;

export class BonusSystem {
  readonly #seed: number;
  readonly #stacks: MutableBonusStacks = createEmptyStacks();
  #pendingOffer: BonusOffer | null = null;
  #lastCreatedCompletedLevel = 0;

  constructor(seed = DEFAULT_BONUS_RANDOM_SEED) {
    if (!Number.isSafeInteger(seed)) {
      throw new RangeError('Bonus random seed must be a safe integer.');
    }
    this.#seed = seed;
  }

  get pendingOffer(): BonusOffer | null {
    return this.#pendingOffer;
  }

  get stacks(): Readonly<Record<BonusType, number>> {
    return Object.freeze({ ...this.#stacks });
  }

  stackCount(type: BonusType): number {
    return this.#stacks[type];
  }

  createOffer(context: BonusOfferContext): BonusOffer | null {
    validateOfferContext(context);

    if (context.completedLevel % BONUS_OFFER_LEVEL_INTERVAL !== 0) {
      return null;
    }

    if (this.#pendingOffer !== null) {
      if (this.#pendingOffer.completedLevel === context.completedLevel) {
        return this.#pendingOffer;
      }
      throw new Error('Cannot create a bonus offer while another offer is pending.');
    }

    if (context.completedLevel <= this.#lastCreatedCompletedLevel) {
      return null;
    }

    const candidates = this.eligibleTypes(context);
    if (candidates.length < BASE_BONUS_OPTION_COUNT) {
      this.#lastCreatedCompletedLevel = context.completedLevel;
      return null;
    }
    const optionCount = Math.min(
      BASE_BONUS_OPTION_COUNT + this.#stacks['wider-thinking'],
      candidates.length,
    );
    const orderedCandidates = [...candidates].sort((left, right) => {
      const scoreDifference = this.candidateScore(
        context.completedLevel,
        left,
      ) - this.candidateScore(context.completedLevel, right);
      if (scoreDifference !== 0) {
        return scoreDifference;
      }
      if (left === right) {
        return 0;
      }
      return left < right ? -1 : 1;
    });
    const options = orderedCandidates.slice(0, optionCount).map((type) =>
      Object.freeze({
        type,
        currentStacks: this.#stacks[type],
        maxStacks: BONUS_DEFINITIONS[type].maxStacks,
      }));
    const offerHash = hashText(
      `${this.#seed}:${context.completedLevel}:${orderedCandidates.join(',')}`,
    );

    this.#pendingOffer = Object.freeze({
      id: `bonus:${context.completedLevel}:${offerHash.toString(16).padStart(8, '0')}`,
      completedLevel: context.completedLevel,
      options: Object.freeze(options),
    });
    this.#lastCreatedCompletedLevel = context.completedLevel;
    return this.#pendingOffer;
  }

  resolve(offerId: string, selection: BonusType | null): BonusResolveResult {
    const offer = this.#pendingOffer;
    if (offer === null) {
      return Object.freeze({ resolved: false, reason: 'no-pending-offer' });
    }
    if (offer.id !== offerId) {
      return Object.freeze({ resolved: false, reason: 'offer-id-mismatch' });
    }

    if (selection === null) {
      this.#pendingOffer = null;
      return Object.freeze({ resolved: true, selection: null, newStacks: null });
    }

    const currentStacks = this.#stacks[selection];
    const maximum = BONUS_DEFINITIONS[selection].maxStacks;
    if (currentStacks >= maximum) {
      return Object.freeze({ resolved: false, reason: 'max-stacks-reached' });
    }
    if (!offer.options.some((option) => option.type === selection)) {
      return Object.freeze({ resolved: false, reason: 'not-offered' });
    }

    const newStacks = currentStacks + 1;
    this.#stacks[selection] = newStacks;
    this.#pendingOffer = null;
    return Object.freeze({ resolved: true, selection, newStacks });
  }

  private eligibleTypes(context: BonusOfferContext): readonly BonusType[] {
    const otherTypes = BONUS_TYPES.filter((type) => {
      if (type === 'wider-thinking') {
        return false;
      }
      if (this.#stacks[type] >= BONUS_DEFINITIONS[type].maxStacks) {
        return false;
      }
      if (
        type === 'hide-under-blanket'
        && context.completedLevel < HIDE_UNDER_BLANKET_UNLOCK_COMPLETED_LEVEL
      ) {
        return false;
      }
      if (
        (type === 'vacation' || type === 'pet-cats')
        && context.coreHp >= context.coreMaxHp
      ) {
        return false;
      }
      return true;
    });

    const optionCount = BASE_BONUS_OPTION_COUNT + this.#stacks['wider-thinking'];
    const widerThinkingIsUseful =
      this.#stacks['wider-thinking']
        < BONUS_DEFINITIONS['wider-thinking'].maxStacks
      && optionCount < otherTypes.length;

    return widerThinkingIsUseful
      ? Object.freeze([...otherTypes, 'wider-thinking'])
      : Object.freeze(otherTypes);
  }

  private candidateScore(completedLevel: number, type: BonusType): number {
    return hashText(`${this.#seed}:${completedLevel}:${type}`);
  }
}

function createEmptyStacks(): MutableBonusStacks {
  return {
    vacation: 0,
    'social-hobby': 0,
    move: 0,
    earplugs: 0,
    'burn-bridges': 0,
    'wider-thinking': 0,
    'cat-treats': 0,
    'pet-cats': 0,
    'thick-literature': 0,
    'social-debt': 0,
    'hide-under-blanket': 0,
    'twitter-fight': 0,
  };
}

function validateOfferContext(context: BonusOfferContext): void {
  if (!Number.isSafeInteger(context.completedLevel) || context.completedLevel <= 0) {
    throw new RangeError('Completed level must be a positive safe integer.');
  }
  if (!Number.isSafeInteger(context.coreMaxHp) || context.coreMaxHp <= 0) {
    throw new RangeError('Maximum core HP must be a positive safe integer.');
  }
  if (
    !Number.isSafeInteger(context.coreHp)
    || context.coreHp < 0
    || context.coreHp > context.coreMaxHp
  ) {
    throw new RangeError('Core HP must be a safe integer within its maximum.');
  }
}

function hashText(value: string): number {
  let hash = 0x811c_9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85eb_ca6b);
  hash ^= hash >>> 13;
  return hash >>> 0;
}
