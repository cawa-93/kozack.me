export function drawAtlasFrame(
  context: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLCanvasElement,
  columns: number,
  rows: number,
  column: number,
  row: number,
  outputSize: number,
): void {
  const frameWidth = source.width / columns;
  const frameHeight = source.height / rows;
  context.clearRect(0, 0, outputSize, outputSize);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    source,
    column * frameWidth,
    row * frameHeight,
    frameWidth,
    frameHeight,
    0,
    0,
    outputSize,
    outputSize,
  );
  clearEdgeConnectedMatte(context, outputSize);
}

/**
 * Image-generation atlases may contain a very light checkerboard matte instead
 * of alpha. Only near-white pixels connected to the edge are removed, so white
 * eyes, page highlights, and fur enclosed by a sprite remain intact.
 */
function clearEdgeConnectedMatte(
  context: CanvasRenderingContext2D,
  size: number,
): void {
  const image = context.getImageData(0, 0, size, size);
  const visited = new Uint8Array(size * size);
  const queue = new Int32Array(size * size);
  let head = 0;
  let tail = 0;

  const isMatte = (index: number): boolean => {
    const offset = index * 4;
    const red = image.data[offset] ?? 0;
    const green = image.data[offset + 1] ?? 0;
    const blue = image.data[offset + 2] ?? 0;
    return red >= 236 && green >= 236 && blue >= 236;
  };

  const enqueue = (index: number): void => {
    if (visited[index] === 1 || !isMatte(index)) {
      return;
    }
    visited[index] = 1;
    queue[tail] = index;
    tail += 1;
  };

  for (let coordinate = 0; coordinate < size; coordinate += 1) {
    enqueue(coordinate);
    enqueue((size - 1) * size + coordinate);
    enqueue(coordinate * size);
    enqueue(coordinate * size + size - 1);
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;
    if (index === undefined) {
      continue;
    }

    image.data[index * 4 + 3] = 0;
    const x = index % size;
    const y = Math.floor(index / size);
    if (x > 0) enqueue(index - 1);
    if (x < size - 1) enqueue(index + 1);
    if (y > 0) enqueue(index - size);
    if (y < size - 1) enqueue(index + size);
  }

  context.putImageData(image, 0, 0);
}
