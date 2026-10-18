import { describe, expect, it } from 'vitest';

import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../../src/config/gameConfig';
import {
  BONUS_CARD_COLUMN_GAP,
  BONUS_CARD_HEIGHT,
  BONUS_CARD_ROW_GAP,
  BONUS_CARD_WIDTH,
  createBonusChoiceLayout,
  type BonusChoiceRectangle,
} from '../../src/game/ui/BonusChoiceLayout';

describe('bonus choice layout', () => {
  it.each([
    [2, 2, 1],
    [3, 3, 1],
    [4, 4, 1],
    [5, 5, 1],
    [6, 3, 2],
    [7, 4, 2],
    [8, 4, 2],
    [9, 5, 2],
    [10, 5, 2],
    [11, 6, 2],
  ] as const)('lays out %i choices as %i columns by %i rows', (
    optionCount,
    expectedColumns,
    expectedRows,
  ) => {
    const layout = createBonusChoiceLayout(optionCount);

    expect(layout.columns).toBe(expectedColumns);
    expect(layout.rows).toBe(expectedRows);
    expect(layout.cards).toHaveLength(optionCount);
  });

  it('keeps every supported layout inside the canvas without overlaps', () => {
    for (let optionCount = 2; optionCount <= 11; optionCount += 1) {
      const layout = createBonusChoiceLayout(optionCount);
      expect(isInsideCanvas(layout.panel)).toBe(true);
      expect(isInsideCanvas(layout.skipButton)).toBe(true);

      for (const card of layout.cards) {
        expect(isInsideCanvas(card)).toBe(true);
        expect(rectanglesOverlap(card, layout.skipButton)).toBe(false);
      }

      for (let leftIndex = 0; leftIndex < layout.cards.length; leftIndex += 1) {
        const left = layout.cards[leftIndex];
        expect(left).toBeDefined();
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < layout.cards.length;
          rightIndex += 1
        ) {
          const right = layout.cards[rightIndex];
          expect(right).toBeDefined();
          expect(rectanglesOverlap(left!, right!)).toBe(false);
        }
      }
    }
  });

  it('uses the specified card dimensions and gaps', () => {
    const layout = createBonusChoiceLayout(10);
    const [first, second, , , , sixth] = layout.cards;

    expect(first).toMatchObject({
      width: BONUS_CARD_WIDTH,
      height: BONUS_CARD_HEIGHT,
    });
    expect(second!.x - first!.x - BONUS_CARD_WIDTH).toBe(BONUS_CARD_COLUMN_GAP);
    expect(sixth!.y - first!.y - BONUS_CARD_HEIGHT).toBe(BONUS_CARD_ROW_GAP);
  });

  it('centres an incomplete final row independently', () => {
    const layout = createBonusChoiceLayout(7);
    const firstRow = layout.cards.filter((card) => card.row === 0);
    const secondRow = layout.cards.filter((card) => card.row === 1);

    expect(rowCentre(firstRow)).toBe(CANVAS_WIDTH / 2);
    expect(rowCentre(secondRow)).toBe(CANVAS_WIDTH / 2);
  });

  it.each([1, 12, 2.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an unsupported option count: %s',
    (optionCount) => {
      expect(() => createBonusChoiceLayout(optionCount)).toThrow(RangeError);
    },
  );
});

function isInsideCanvas(rectangle: BonusChoiceRectangle): boolean {
  return rectangle.x >= 0 &&
    rectangle.y >= 0 &&
    rectangle.x + rectangle.width <= CANVAS_WIDTH &&
    rectangle.y + rectangle.height <= CANVAS_HEIGHT;
}

function rectanglesOverlap(
  left: BonusChoiceRectangle,
  right: BonusChoiceRectangle,
): boolean {
  return left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y;
}

function rowCentre(cards: readonly BonusChoiceRectangle[]): number {
  const left = cards[0];
  const right = cards.at(-1);
  if (left === undefined || right === undefined) {
    throw new Error('Cannot calculate the centre of an empty row.');
  }
  return (left.x + right.x + right.width) / 2;
}
