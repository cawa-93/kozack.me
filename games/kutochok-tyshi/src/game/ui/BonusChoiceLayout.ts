import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../../config/gameConfig';

export const BONUS_CARD_WIDTH = 148;
export const BONUS_CARD_HEIGHT = 286;
export const BONUS_CARD_COLUMN_GAP = 8;
export const BONUS_CARD_ROW_GAP = 18;
export const BONUS_SKIP_WIDTH = 240;
export const BONUS_SKIP_HEIGHT = 58;

const MIN_OPTION_COUNT = 2;
const MAX_OPTION_COUNT = 11;
const PANEL_HORIZONTAL_PADDING = 32;
const PANEL_MIN_WIDTH = 650;
const PANEL_MAX_WIDTH = 1_000;
const SINGLE_ROW_PANEL_HEIGHT = 574;
const DOUBLE_ROW_PANEL_HEIGHT = 860;
const CARD_TOP_OFFSET = 128;
const SKIP_BOTTOM_MARGIN = 31;

export interface BonusChoiceRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface BonusCardLayout extends BonusChoiceRectangle {
  readonly index: number;
  readonly row: number;
  readonly column: number;
}

export interface BonusChoiceLayout {
  readonly panel: BonusChoiceRectangle;
  readonly skipButton: BonusChoiceRectangle;
  readonly columns: number;
  readonly rows: number;
  readonly cards: readonly BonusCardLayout[];
}

/**
 * Computes fixed-canvas bonus-card placement without depending on Phaser.
 * Each row is centred independently so an incomplete second row stays balanced.
 */
export function createBonusChoiceLayout(optionCount: number): BonusChoiceLayout {
  assertOptionCount(optionCount);

  const columns = optionCount <= 5 ? optionCount : Math.ceil(optionCount / 2);
  const rows = Math.ceil(optionCount / columns);
  const maximumRowWidth = rowWidth(columns);
  const panelWidth = Math.min(
    PANEL_MAX_WIDTH,
    Math.max(PANEL_MIN_WIDTH, maximumRowWidth + PANEL_HORIZONTAL_PADDING * 2),
  );
  const panelHeight = rows === 1
    ? SINGLE_ROW_PANEL_HEIGHT
    : DOUBLE_ROW_PANEL_HEIGHT;
  const panel = Object.freeze({
    x: (CANVAS_WIDTH - panelWidth) / 2,
    y: (CANVAS_HEIGHT - panelHeight) / 2,
    width: panelWidth,
    height: panelHeight,
  });

  const cards: BonusCardLayout[] = [];
  for (let row = 0; row < rows; row += 1) {
    const firstIndex = row * columns;
    const cardsInRow = Math.min(columns, optionCount - firstIndex);
    const startX = panel.x + (panel.width - rowWidth(cardsInRow)) / 2;
    const y = panel.y + CARD_TOP_OFFSET + row * (
      BONUS_CARD_HEIGHT + BONUS_CARD_ROW_GAP
    );

    for (let column = 0; column < cardsInRow; column += 1) {
      cards.push(Object.freeze({
        index: firstIndex + column,
        row,
        column,
        x: startX + column * (BONUS_CARD_WIDTH + BONUS_CARD_COLUMN_GAP),
        y,
        width: BONUS_CARD_WIDTH,
        height: BONUS_CARD_HEIGHT,
      }));
    }
  }

  const skipButton = Object.freeze({
    x: (CANVAS_WIDTH - BONUS_SKIP_WIDTH) / 2,
    y: panel.y + panel.height - SKIP_BOTTOM_MARGIN - BONUS_SKIP_HEIGHT,
    width: BONUS_SKIP_WIDTH,
    height: BONUS_SKIP_HEIGHT,
  });

  return Object.freeze({
    panel,
    skipButton,
    columns,
    rows,
    cards: Object.freeze(cards),
  });
}

function rowWidth(cardCount: number): number {
  return cardCount * BONUS_CARD_WIDTH +
    Math.max(0, cardCount - 1) * BONUS_CARD_COLUMN_GAP;
}

function assertOptionCount(optionCount: number): void {
  if (
    !Number.isSafeInteger(optionCount) ||
    optionCount < MIN_OPTION_COUNT ||
    optionCount > MAX_OPTION_COUNT
  ) {
    throw new RangeError('A bonus offer must contain between 2 and 11 options.');
  }
}
