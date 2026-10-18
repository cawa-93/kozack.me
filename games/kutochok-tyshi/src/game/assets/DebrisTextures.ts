import type Phaser from 'phaser';

export const DEBRIS_VARIANT_COUNT = 4;
export const DEBRIS_TEXTURE_SIZE = 120;
export const DEBRIS_DISPLAY_WIDTH = 38;
export const DEBRIS_DISPLAY_HEIGHT = 34;

const DEBRIS_TEXTURE_PREFIX = 'damaged-book-debris';
const DEBRIS_DESIGN_SIZE = 30;
const RENDER_SCALE = DEBRIS_TEXTURE_SIZE / DEBRIS_DESIGN_SIZE;

const DebrisColor = {
  Ink: '#3b2547',
  Shadow: 'rgba(59, 37, 71, 0.25)',
  Page: '#ffe9bd',
  PageShade: '#e8c99a',
  Coral: '#db6f7f',
  CoralDark: '#a84562',
  Teal: '#4d9c98',
  TealDark: '#286f72',
  Mustard: '#d7a544',
  MustardDark: '#986824',
  Lavender: '#9a78ba',
  LavenderDark: '#674c86',
} as const;

interface BookPalette {
  readonly cover: string;
  readonly dark: string;
}

interface ClosedBookOptions {
  readonly tornSide?: 'left' | 'right';
  readonly bentCover?: boolean;
}

type DebrisDrawer = (context: CanvasRenderingContext2D) => void;

const CORAL_BOOK: BookPalette = {
  cover: DebrisColor.Coral,
  dark: DebrisColor.CoralDark,
};
const TEAL_BOOK: BookPalette = {
  cover: DebrisColor.Teal,
  dark: DebrisColor.TealDark,
};
const MUSTARD_BOOK: BookPalette = {
  cover: DebrisColor.Mustard,
  dark: DebrisColor.MustardDark,
};
const LAVENDER_BOOK: BookPalette = {
  cover: DebrisColor.Lavender,
  dark: DebrisColor.LavenderDark,
};

const DRAW_VARIANTS: readonly DebrisDrawer[] = [
  drawVariantOne,
  drawVariantTwo,
  drawVariantThree,
  drawVariantFour,
];

export function debrisTextureKey(variant: number): string {
  assertVariant(variant);
  return `${DEBRIS_TEXTURE_PREFIX}-${variant}`;
}

export function debrisVariantIndex(x: number, y: number): number {
  assertGridCoordinate(x, 'x');
  assertGridCoordinate(y, 'y');

  let hash = (
    Math.imul(x | 0, 0x9e37_79b1)
    ^ Math.imul(y | 0, 0x85eb_ca77)
    ^ Math.imul(Math.trunc(x / 0x1_0000_0000), 0xc2b2_ae3d)
    ^ Math.imul(Math.trunc(y / 0x1_0000_0000), 0x27d4_eb2f)
  ) >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb_352d) >>> 0;
  hash = (hash ^ (hash >>> 15)) >>> 0;
  return hash % DEBRIS_VARIANT_COUNT;
}

export function createDebrisTextures(scene: Phaser.Scene): void {
  for (let variant = 0; variant < DEBRIS_VARIANT_COUNT; variant += 1) {
    const key = debrisTextureKey(variant);
    if (scene.textures.exists(key)) {
      continue;
    }

    const texture = scene.textures.createCanvas(
      key,
      DEBRIS_TEXTURE_SIZE,
      DEBRIS_TEXTURE_SIZE,
    );
    if (texture === null) {
      throw new Error(`Could not create damaged-book debris texture: ${key}`);
    }

    const drawer = DRAW_VARIANTS[variant];
    if (drawer === undefined) {
      throw new Error(`Missing damaged-book debris drawer for variant ${variant}.`);
    }
    const context = texture.getContext();
    context.clearRect(0, 0, DEBRIS_TEXTURE_SIZE, DEBRIS_TEXTURE_SIZE);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.save();
    context.scale(RENDER_SCALE, RENDER_SCALE);
    drawPileShadow(context);
    drawer(context);
    context.restore();
    texture.refresh();
  }
}

function drawPileShadow(context: CanvasRenderingContext2D): void {
  context.save();
  context.fillStyle = DebrisColor.Shadow;
  context.beginPath();
  context.ellipse(15, 23.3, 13.6, 4.2, -0.04, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawVariantOne(context: CanvasRenderingContext2D): void {
  drawClosedBook(context, 14, 20.7, 23.5, 6.8, -0.12, MUSTARD_BOOK, {
    tornSide: 'right',
  });
  drawClosedBook(context, 17.2, 16.7, 20, 6.3, 0.15, LAVENDER_BOOK, {
    bentCover: true,
  });
  drawClosedBook(context, 11.5, 13.4, 17, 5.7, -0.22, TEAL_BOOK, {
    tornSide: 'left',
  });
  drawOpenBook(context, 17.5, 9.4, 16.5, 8.4, 0.12, CORAL_BOOK);
  drawLoosePage(context, 5.1, 20.7, -0.32, false);
}

function drawVariantTwo(context: CanvasRenderingContext2D): void {
  drawClosedBook(context, 15.6, 21, 25, 6.5, 0.1, CORAL_BOOK, {
    bentCover: true,
  });
  drawClosedBook(context, 10.2, 16.5, 17.5, 6.1, -0.28, MUSTARD_BOOK, {
    tornSide: 'left',
  });
  drawClosedBook(context, 20.1, 15.2, 16, 5.7, 0.31, TEAL_BOOK, {
    tornSide: 'right',
  });
  drawOpenBook(context, 13.9, 10, 17.8, 8.9, -0.13, LAVENDER_BOOK);
  drawLoosePage(context, 25.1, 22, 0.43, true);
}

function drawVariantThree(context: CanvasRenderingContext2D): void {
  drawClosedBook(context, 14.8, 21.2, 24.5, 6.8, -0.08, TEAL_BOOK, {
    tornSide: 'right',
  });
  drawClosedBook(context, 18.3, 17.3, 19.5, 6.2, 0.23, CORAL_BOOK, {
    tornSide: 'left',
  });
  drawClosedBook(context, 9.6, 14.5, 15.7, 5.8, -0.34, LAVENDER_BOOK, {
    bentCover: true,
  });
  drawClosedBook(context, 18.2, 11.8, 17, 5.7, 0.06, MUSTARD_BOOK, {
    tornSide: 'right',
  });
  drawLoosePage(context, 5.2, 21.5, -0.5, true);
}

function drawVariantFour(context: CanvasRenderingContext2D): void {
  drawClosedBook(context, 14.3, 21, 24, 6.7, 0.14, LAVENDER_BOOK, {
    tornSide: 'left',
  });
  drawClosedBook(context, 9.8, 16.8, 17, 6, -0.2, CORAL_BOOK, {
    bentCover: true,
  });
  drawClosedBook(context, 20.2, 16, 16.2, 5.8, 0.27, MUSTARD_BOOK, {
    tornSide: 'right',
  });
  drawOpenBook(context, 14.3, 10.4, 18.4, 9.2, -0.06, TEAL_BOOK);
  drawLoosePage(context, 25.3, 21.6, 0.34, false);
}

function drawClosedBook(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  rotation: number,
  palette: BookPalette,
  options: ClosedBookOptions,
): void {
  const left = -width / 2;
  const top = -height / 2;
  const pageTop = top + 1.8;
  const pageHeight = height - 3.2;

  context.save();
  context.translate(centerX, centerY);
  context.rotate(rotation);
  context.lineJoin = 'round';
  context.lineCap = 'round';

  context.fillStyle = DebrisColor.Ink;
  context.beginPath();
  context.roundRect(left - 0.7, top - 0.7, width + 1.4, height + 1.4, 1.6);
  context.fill();

  context.fillStyle = palette.cover;
  context.beginPath();
  context.roundRect(left, top, width, height, 1.2);
  context.fill();

  context.fillStyle = DebrisColor.Page;
  drawDamagedPageBlock(
    context,
    left + 2.6,
    pageTop,
    width - 3.7,
    pageHeight,
    options.tornSide,
  );

  context.fillStyle = palette.dark;
  context.beginPath();
  context.roundRect(left + 0.3, top + 0.35, 3.2, height - 0.7, 0.8);
  context.fill();

  context.strokeStyle = DebrisColor.PageShade;
  context.lineWidth = 0.55;
  context.beginPath();
  context.moveTo(left + 4.4, pageTop + pageHeight * 0.39);
  context.lineTo(left + width - 1.7, pageTop + pageHeight * 0.39);
  context.moveTo(left + 4.1, pageTop + pageHeight * 0.7);
  context.lineTo(left + width - 2.3, pageTop + pageHeight * 0.7);
  context.stroke();

  context.strokeStyle = DebrisColor.Ink;
  context.lineWidth = 0.85;
  context.beginPath();
  context.moveTo(left + 0.8, top + 0.45);
  context.lineTo(left + width - 1.3, top + 0.45);
  context.moveTo(left + 0.9, top + height - 0.45);
  context.lineTo(left + width - 1.8, top + height - 0.45);
  context.stroke();

  if (options.bentCover === true) {
    context.fillStyle = palette.dark;
    context.strokeStyle = DebrisColor.Ink;
    context.lineWidth = 0.7;
    context.beginPath();
    context.moveTo(left + width - 5.5, top - 0.1);
    context.quadraticCurveTo(left + width - 1, top - 2.2, left + width + 0.4, top + 1);
    context.lineTo(left + width - 4.8, top + 1.5);
    context.closePath();
    context.fill();
    context.stroke();
  }

  context.restore();
}

function drawDamagedPageBlock(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  tornSide: ClosedBookOptions['tornSide'],
): void {
  context.beginPath();
  if (tornSide === 'left') {
    context.moveTo(x + 1.5, y);
    context.lineTo(x + width, y);
    context.lineTo(x + width, y + height);
    context.lineTo(x, y + height);
    context.lineTo(x + 1.4, y + height * 0.65);
    context.lineTo(x + 0.2, y + height * 0.37);
  } else if (tornSide === 'right') {
    context.moveTo(x, y);
    context.lineTo(x + width - 1.1, y);
    context.lineTo(x + width, y + height * 0.32);
    context.lineTo(x + width - 1.5, y + height * 0.57);
    context.lineTo(x + width, y + height);
    context.lineTo(x, y + height);
  } else {
    context.roundRect(x, y, width, height, 0.6);
  }
  context.closePath();
  context.fill();
}

function drawOpenBook(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  rotation: number,
  palette: BookPalette,
): void {
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  context.save();
  context.translate(centerX, centerY);
  context.rotate(rotation);
  context.lineJoin = 'round';
  context.lineCap = 'round';

  context.fillStyle = DebrisColor.Ink;
  context.beginPath();
  context.moveTo(-halfWidth - 0.8, -halfHeight + 0.8);
  context.lineTo(-0.2, -halfHeight + 2.2);
  context.lineTo(halfWidth + 0.8, -halfHeight + 0.3);
  context.lineTo(halfWidth - 0.3, halfHeight + 0.9);
  context.lineTo(0, halfHeight - 0.4);
  context.lineTo(-halfWidth + 0.1, halfHeight + 0.5);
  context.closePath();
  context.fill();

  context.fillStyle = palette.dark;
  context.beginPath();
  context.moveTo(-halfWidth, -halfHeight + 1.1);
  context.lineTo(0, -halfHeight + 2.5);
  context.lineTo(halfWidth, -halfHeight + 0.7);
  context.lineTo(halfWidth - 0.9, halfHeight);
  context.lineTo(0, halfHeight - 1.1);
  context.lineTo(-halfWidth + 0.9, halfHeight - 0.4);
  context.closePath();
  context.fill();

  context.fillStyle = DebrisColor.Page;
  context.beginPath();
  context.moveTo(-halfWidth + 1, -halfHeight + 0.6);
  context.quadraticCurveTo(-halfWidth * 0.45, -halfHeight - 0.2, -0.1, -halfHeight + 2.2);
  context.lineTo(-0.2, halfHeight - 1.8);
  context.quadraticCurveTo(-halfWidth * 0.48, halfHeight - 3, -halfWidth + 1.3, halfHeight - 1.1);
  context.closePath();
  context.fill();
  context.strokeStyle = DebrisColor.Ink;
  context.lineWidth = 0.75;
  context.stroke();

  context.fillStyle = DebrisColor.Page;
  context.beginPath();
  context.moveTo(0.1, -halfHeight + 2.2);
  context.quadraticCurveTo(halfWidth * 0.48, -halfHeight - 0.6, halfWidth - 1, -halfHeight + 0.2);
  context.lineTo(halfWidth - 1.5, halfHeight - 1.5);
  context.quadraticCurveTo(halfWidth * 0.48, halfHeight - 3.2, 0.2, halfHeight - 1.8);
  context.closePath();
  context.fill();
  context.stroke();

  context.strokeStyle = DebrisColor.PageShade;
  context.lineWidth = 0.55;
  context.beginPath();
  context.moveTo(-halfWidth + 2.4, -0.7);
  context.lineTo(-1.8, 0.7);
  context.moveTo(2, 0.5);
  context.lineTo(halfWidth - 2.6, -0.9);
  context.stroke();

  context.strokeStyle = palette.cover;
  context.lineWidth = 1.2;
  context.beginPath();
  context.moveTo(0, -halfHeight + 2.1);
  context.lineTo(0, halfHeight - 1.5);
  context.stroke();
  context.restore();
}

function drawLoosePage(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  rotation: number,
  foldRight: boolean,
): void {
  context.save();
  context.translate(centerX, centerY);
  context.rotate(rotation);
  context.fillStyle = DebrisColor.Page;
  context.strokeStyle = DebrisColor.Ink;
  context.lineWidth = 0.7;
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(-3.3, -2.2);
  context.lineTo(2.1, -2.7);
  context.lineTo(3.4, foldRight ? 0.5 : 2.5);
  context.lineTo(-2.4, 2.6);
  context.lineTo(-3.6, 0.7);
  context.closePath();
  context.fill();
  context.stroke();
  context.strokeStyle = DebrisColor.PageShade;
  context.lineWidth = 0.45;
  context.beginPath();
  context.moveTo(-1.8, -0.5);
  context.lineTo(1.8, -0.8);
  context.moveTo(-1.4, 0.8);
  context.lineTo(1.9, 0.5);
  context.stroke();
  context.restore();
}

function assertVariant(variant: number): void {
  if (
    !Number.isInteger(variant)
    || variant < 0
    || variant >= DEBRIS_VARIANT_COUNT
  ) {
    throw new RangeError(
      `Debris variant must be an integer from 0 to ${DEBRIS_VARIANT_COUNT - 1}; received ${variant}`,
    );
  }
}

function assertGridCoordinate(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Debris ${label} coordinate must be a safe integer; received ${value}`);
  }
}
