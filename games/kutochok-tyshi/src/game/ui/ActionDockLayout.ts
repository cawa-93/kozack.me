export interface ActionDockRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ActionDockLayout {
  readonly panel: ActionDockRect;
  readonly hitArea: ActionDockRect;
  readonly startButton: ActionDockRect;
  readonly speedButtons: readonly [
    ActionDockRect,
    ActionDockRect,
    ActionDockRect,
  ];
}

const OUTER_MARGIN = 14;
const PANEL_WIDTH = 280;
const PANEL_HEIGHT = 72;
const SHADOW_OFFSET = 4;
const INNER_Y = 12;
const INNER_HEIGHT = 48;
const SPEED_BUTTON_WIDTH = 80;
const SPEED_BUTTON_GAP = 8;
const START_BUTTON_WIDTH = 200;

export function actionDockLayout(
  canvasWidth: number,
  canvasHeight: number,
): ActionDockLayout {
  if (
    !Number.isFinite(canvasWidth)
    || !Number.isFinite(canvasHeight)
    || canvasWidth <= PANEL_WIDTH + OUTER_MARGIN + SHADOW_OFFSET
    || canvasHeight <= PANEL_HEIGHT + OUTER_MARGIN + SHADOW_OFFSET
  ) {
    throw new RangeError('Action dock requires a finite canvas larger than the dock.');
  }

  const panelX = canvasWidth - OUTER_MARGIN - SHADOW_OFFSET - PANEL_WIDTH;
  const panelY = canvasHeight - OUTER_MARGIN - SHADOW_OFFSET - PANEL_HEIGHT;
  const speedRowWidth =
    SPEED_BUTTON_WIDTH * 3 + SPEED_BUTTON_GAP * 2;
  const speedRowX = panelX + (PANEL_WIDTH - speedRowWidth) / 2;
  const buttonY = panelY + INNER_Y;
  const speedButton = (index: number): ActionDockRect => ({
    x: speedRowX + index * (SPEED_BUTTON_WIDTH + SPEED_BUTTON_GAP),
    y: buttonY,
    width: SPEED_BUTTON_WIDTH,
    height: INNER_HEIGHT,
  });
  const speedButtons = [
    speedButton(0),
    speedButton(1),
    speedButton(2),
  ] as const;

  return {
    panel: {
      x: panelX,
      y: panelY,
      width: PANEL_WIDTH,
      height: PANEL_HEIGHT,
    },
    hitArea: {
      x: panelX,
      y: panelY,
      width: PANEL_WIDTH + SHADOW_OFFSET,
      height: PANEL_HEIGHT + SHADOW_OFFSET,
    },
    startButton: {
      x: panelX + (PANEL_WIDTH - START_BUTTON_WIDTH) / 2,
      y: buttonY,
      width: START_BUTTON_WIDTH,
      height: INNER_HEIGHT,
    },
    speedButtons,
  };
}
