import { describe, expect, it } from 'vitest';

import {
  BONUS_DEFINITIONS,
  BONUS_TYPES,
  type BonusType,
} from '../../src/domain/bonuses';
import {
  BASE_BONUS_OPTION_COUNT,
  BonusSystem,
  HIDE_UNDER_BLANKET_UNLOCK_COMPLETED_LEVEL,
} from '../../src/systems/BonusSystem';

const DAMAGED_CORE = Object.freeze({ coreHp: 100, coreMaxHp: 200 });
const FULL_CORE = Object.freeze({ coreHp: 200, coreMaxHp: 200 });

function offerContext(
  completedLevel: number,
  core: Readonly<{ coreHp: number; coreMaxHp: number }> = DAMAGED_CORE,
): Readonly<{ completedLevel: number; coreHp: number; coreMaxHp: number }> {
  return Object.freeze({ completedLevel, ...core });
}

describe('bonus definitions', () => {
  it('defines every requested bonus with its logical cap and illustration', () => {
    expect(BONUS_TYPES).toEqual([
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
    expect(Object.fromEntries(
      BONUS_TYPES.map((type) => [type, BONUS_DEFINITIONS[type].maxStacks]),
    )).toEqual({
      vacation: 5,
      'social-hobby': 8,
      move: 10,
      earplugs: 10,
      'burn-bridges': 10,
      'wider-thinking': 9,
      'cat-treats': 5,
      'pet-cats': 20,
      'thick-literature': 8,
      'social-debt': 10,
      'hide-under-blanket': 1,
      'twitter-fight': 20,
    });

    for (const type of BONUS_TYPES) {
      const definition = BONUS_DEFINITIONS[type];
      expect(Object.isFrozen(definition)).toBe(true);
      expect(definition.title.length).toBeGreaterThan(0);
      expect(definition.description.length).toBeGreaterThan(0);
      expect(definition.imagePath).toBe(`/assets/bonuses/bonus-${type}.png`);
      expect(definition.maxStacks).toBeLessThanOrEqual(20);
    }
  });

  it('keeps player-facing descriptions qualitative except for battery gains', () => {
    const descriptionsWithExactBatteryValues = new Set<BonusType>([
      'social-hobby',
      'pet-cats',
    ]);

    for (const type of BONUS_TYPES) {
      const description = BONUS_DEFINITIONS[type].description;
      if (descriptionsWithExactBatteryValues.has(type)) {
        continue;
      }
      expect(description, type).not.toMatch(/[\d%]/);
    }

    expect(BONUS_DEFINITIONS['social-hobby'].description).toContain('50');
    expect(BONUS_DEFINITIONS['pet-cats'].description).toContain('100');
  });
});

describe('BonusSystem', () => {
  it('offers two unique deterministic options only after each third level', () => {
    const first = new BonusSystem(12345);
    const second = new BonusSystem(12345);

    expect(first.createOffer(offerContext(1))).toBeNull();
    expect(first.createOffer(offerContext(2))).toBeNull();
    const offer = first.createOffer(offerContext(3));
    const replay = second.createOffer(offerContext(3));

    expect(offer).not.toBeNull();
    expect(offer).toEqual(replay);
    expect(offer?.options).toHaveLength(BASE_BONUS_OPTION_COUNT);
    expect(new Set(offer?.options.map((option) => option.type)).size).toBe(2);
    expect(Object.isFrozen(offer)).toBe(true);
    expect(Object.isFrozen(offer?.options)).toBe(true);
  });

  it('caches one offer without rerolling when its context is read again', () => {
    const system = new BonusSystem(77);
    const first = system.createOffer(offerContext(3));
    const repeated = system.createOffer(offerContext(3, FULL_CORE));

    expect(repeated).toBe(first);
    expect(() => system.createOffer(offerContext(6))).toThrow(
      'another offer is pending',
    );
  });

  it('accepts one offered selection exactly once and snapshots stack values', () => {
    const system = new BonusSystem(100);
    const offer = system.createOffer(offerContext(3));
    expect(offer).not.toBeNull();
    const selected = offer?.options[0];
    expect(selected).toBeDefined();
    if (offer === null || selected === undefined) {
      throw new Error('Expected an offered bonus.');
    }

    expect(selected).toMatchObject({ currentStacks: 0 });
    expect(selected.maxStacks).toBe(BONUS_DEFINITIONS[selected.type].maxStacks);
    expect(system.resolve(offer.id, selected.type)).toEqual({
      resolved: true,
      selection: selected.type,
      newStacks: 1,
    });
    expect(system.stackCount(selected.type)).toBe(1);
    expect(system.pendingOffer).toBeNull();
    expect(system.resolve(offer.id, selected.type)).toEqual({
      resolved: false,
      reason: 'no-pending-offer',
    });
    expect(system.createOffer(offerContext(3))).toBeNull();
  });

  it('rejects mismatched and unavailable selections without consuming the offer', () => {
    const system = new BonusSystem(987);
    const offer = system.createOffer(offerContext(3));
    expect(offer).not.toBeNull();
    if (offer === null) {
      throw new Error('Expected an offered bonus.');
    }
    const unavailable = BONUS_TYPES.find(
      (type) => !offer.options.some((option) => option.type === type),
    );
    expect(unavailable).toBeDefined();
    if (unavailable === undefined) {
      throw new Error('Expected an unavailable bonus.');
    }

    expect(system.resolve('wrong-offer', offer.options[0]?.type ?? 'move')).toEqual({
      resolved: false,
      reason: 'offer-id-mismatch',
    });
    expect(system.resolve(offer.id, unavailable)).toEqual({
      resolved: false,
      reason: 'not-offered',
    });
    expect(system.pendingOffer).toBe(offer);
  });

  it('accepts Skip without changing any stack and cannot resolve it twice', () => {
    const system = new BonusSystem(42);
    const offer = system.createOffer(offerContext(3));
    expect(offer).not.toBeNull();
    if (offer === null) {
      throw new Error('Expected an offered bonus.');
    }

    expect(system.resolve(offer.id, null)).toEqual({
      resolved: true,
      selection: null,
      newStacks: null,
    });
    expect(Object.values(system.stacks).every((count) => count === 0)).toBe(true);
    expect(system.resolve(offer.id, null)).toEqual({
      resolved: false,
      reason: 'no-pending-offer',
    });
  });

  it('removes both healing-only choices while the core is full', () => {
    const fullCoreTypes = new Set<BonusType>();
    const damagedCoreTypes = new Set<BonusType>();

    for (let seed = 0; seed < 256; seed += 1) {
      const fullOffer = new BonusSystem(seed).createOffer(offerContext(3, FULL_CORE));
      const damagedOffer = new BonusSystem(seed).createOffer(
        offerContext(3, DAMAGED_CORE),
      );
      for (const option of fullOffer?.options ?? []) {
        fullCoreTypes.add(option.type);
      }
      for (const option of damagedOffer?.options ?? []) {
        damagedCoreTypes.add(option.type);
      }
    }

    expect(fullCoreTypes.has('vacation')).toBe(false);
    expect(fullCoreTypes.has('pet-cats')).toBe(false);
    expect(damagedCoreTypes.has('vacation')).toBe(true);
    expect(damagedCoreTypes.has('pet-cats')).toBe(true);
  });

  it('unlocks Hide Under Blanket only after completing level six', () => {
    const levelThreeTypes = new Set<BonusType>();
    const levelSixTypes = new Set<BonusType>();

    for (let seed = 0; seed < 256; seed += 1) {
      const levelThree = new BonusSystem(seed).createOffer(offerContext(3));
      const levelSix = new BonusSystem(seed).createOffer(offerContext(6));
      for (const option of levelThree?.options ?? []) {
        levelThreeTypes.add(option.type);
      }
      for (const option of levelSix?.options ?? []) {
        levelSixTypes.add(option.type);
      }
    }

    expect(HIDE_UNDER_BLANKET_UNLOCK_COMPLETED_LEVEL).toBe(6);
    expect(levelThreeTypes.has('hide-under-blanket')).toBe(false);
    expect(levelSixTypes.has('hide-under-blanket')).toBe(true);
  });

  it('offers Twitter Fight from the first bonus opportunity, even at full battery', () => {
    const levelThreeTypes = new Set<BonusType>();

    for (let seed = 0; seed < 256; seed += 1) {
      const offer = new BonusSystem(seed).createOffer(offerContext(3, FULL_CORE));
      for (const option of offer?.options ?? []) {
        levelThreeTypes.add(option.type);
      }
    }

    expect(levelThreeTypes.has('twitter-fight')).toBe(true);
  });

  it('expands later offers with Wider Thinking and then removes it when all fit', () => {
    const candidate = findSeedWithConsecutiveWiderThinkingOffers(9);
    expect(candidate).not.toBeNull();
    if (candidate === null) {
      throw new Error('Could not find a deterministic Wider Thinking sequence.');
    }

    const system = new BonusSystem(candidate);
    for (let stack = 0; stack < 9; stack += 1) {
      const completedLevel = (stack + 1) * 3;
      const offer = system.createOffer(offerContext(completedLevel));
      expect(offer?.options).toHaveLength(BASE_BONUS_OPTION_COUNT + stack);
      expect(offer?.options.some((option) => option.type === 'wider-thinking')).toBe(
        true,
      );
      if (offer === null) {
        throw new Error('Expected a Wider Thinking offer.');
      }
      expect(system.resolve(offer.id, 'wider-thinking').resolved).toBe(true);
    }

    const completeOffer = system.createOffer(offerContext(30));
    expect(completeOffer?.options).toHaveLength(11);
    expect(
      completeOffer?.options.some((option) => option.type === 'wider-thinking'),
    ).toBe(false);
    expect(new Set(completeOffer?.options.map((option) => option.type)).size).toBe(
      11,
    );
  });

  it('keeps one-shot and repeatable temporary bonuses in the lifetime inventory', () => {
    const system = new BonusSystem(3_141_592);
    let completedLevel = 0;

    while (
      system.stackCount('hide-under-blanket') < 1
      || system.stackCount('twitter-fight') < 2
    ) {
      completedLevel += 3;
      const offer = system.createOffer(offerContext(completedLevel));
      expect(offer).not.toBeNull();
      if (offer === null) {
        throw new Error('Expected a bonus offer.');
      }

      const desired = offer.options.find((option) =>
        option.type === 'hide-under-blanket'
          ? system.stackCount('hide-under-blanket') === 0
          : option.type === 'twitter-fight'
            && system.stackCount('twitter-fight') < 2
      );
      expect(system.resolve(offer.id, desired?.type ?? null).resolved).toBe(true);

      if (completedLevel > 3_000) {
        throw new Error('Could not acquire both temporary bonus types.');
      }
    }

    expect(system.stackCount('hide-under-blanket')).toBe(1);
    expect(system.stackCount('twitter-fight')).toBe(2);
    expect(system.stacks).toMatchObject({
      'hide-under-blanket': 1,
      'twitter-fight': 2,
    });
  });

  it('removes capped bonuses and rejects attempts to select them again', () => {
    const system = new BonusSystem(2026);
    let completedLevel = 0;

    while (system.stackCount('vacation') < BONUS_DEFINITIONS.vacation.maxStacks) {
      completedLevel += 3;
      const offer = system.createOffer(offerContext(completedLevel));
      expect(offer).not.toBeNull();
      if (offer === null) {
        throw new Error('Expected a bonus offer.');
      }
      if (offer.options.some((option) => option.type === 'vacation')) {
        expect(system.resolve(offer.id, 'vacation').resolved).toBe(true);
      } else {
        expect(system.resolve(offer.id, null).resolved).toBe(true);
      }
      if (completedLevel > 3_000) {
        throw new Error('Could not reach the Vacation stack cap.');
      }
    }

    completedLevel += 3;
    const nextOffer = system.createOffer(offerContext(completedLevel));
    expect(nextOffer).not.toBeNull();
    if (nextOffer === null) {
      throw new Error('Expected a bonus offer after reaching the cap.');
    }
    expect(nextOffer.options.some((option) => option.type === 'vacation')).toBe(
      false,
    );
    expect(system.resolve(nextOffer.id, 'vacation')).toEqual({
      resolved: false,
      reason: 'max-stacks-reached',
    });
    expect(system.pendingOffer).toBe(nextOffer);
  });

  it('consumes an opportunity instead of creating a zero- or one-card offer', () => {
    const system = new BonusSystem(9_001);
    let completedLevel = 0;
    let exhaustedLevel: number | null = null;

    for (let offerIndex = 0; offerIndex < 200; offerIndex += 1) {
      completedLevel += 3;
      const offer = system.createOffer(offerContext(completedLevel));
      if (offer === null) {
        exhaustedLevel = completedLevel;
        break;
      }
      expect(offer.options.length).toBeGreaterThanOrEqual(2);
      const selected = offer.options[0];
      if (selected === undefined) {
        throw new Error('Expected at least two bonus options.');
      }
      expect(system.resolve(offer.id, selected.type).resolved).toBe(true);
    }

    expect(exhaustedLevel).not.toBeNull();
    if (exhaustedLevel === null) {
      throw new Error('Expected the finite bonus catalog to become exhausted.');
    }
    expect(system.pendingOffer).toBeNull();
    expect(system.createOffer(offerContext(exhaustedLevel))).toBeNull();
  });

  it('validates its seed and offer context', () => {
    expect(() => new BonusSystem(Number.NaN)).toThrow(RangeError);
    const system = new BonusSystem();
    expect(() => system.createOffer(offerContext(0))).toThrow(RangeError);
    expect(() => system.createOffer({
      completedLevel: 3,
      coreHp: 201,
      coreMaxHp: 200,
    })).toThrow(RangeError);
  });
});

function findSeedWithConsecutiveWiderThinkingOffers(
  count: number,
): number | null {
  for (let seed = 0; seed < 100_000; seed += 1) {
    const system = new BonusSystem(seed);
    let matches = true;
    for (let index = 0; index < count; index += 1) {
      const offer = system.createOffer(offerContext((index + 1) * 3));
      if (
        offer === null
        || !offer.options.some((option) => option.type === 'wider-thinking')
      ) {
        matches = false;
        break;
      }
      system.resolve(offer.id, 'wider-thinking');
    }
    if (matches) {
      return seed;
    }
  }
  return null;
}
