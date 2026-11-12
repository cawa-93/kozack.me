// Метрики шрифту написів Phaser: кожен `scene.add.text` без готових `metrics` у стилі міряє шрифт на власному полотні
// (`MeasureText`), і так само — `setFontSize`, `setFontStyle` і `setStroke`. Тут шрифт (родина, розмір, накреслення) міряється
// раз, а далі його метрики отримують усі написи панелі, баблів, сховищ і календарика.

import type Phaser from "phaser";

/** Метрики шрифту, як їх чекає стиль напису Phaser (`TextStyle.metrics`). */
export interface FontMetrics {
  ascent: number;
  descent: number;
  fontSize: number;
}

/** Шрифт напису: поля стилю Phaser; число в `fontSize` — пікселі. */
export interface FontSpec {
  fontFamily: string;
  fontSize: string | number;
  fontStyle?: string | undefined;
}

/** Рядок шрифту для полотна — той самий, що складає Phaser (`TextStyle._font`): із ним метрики ті самі, що він зняв би сам. */
export function fontString(spec: FontSpec): string {
  const size = typeof spec.fontSize === "number" ? `${spec.fontSize}px` : spec.fontSize;
  return [spec.fontStyle ?? "", size, spec.fontFamily].join(" ").trim();
}

/**
 * Метрики за рядком шрифту. `measure` міряє (null — не вдалося), `ready` каже, чи шрифт уже завантажено: до того браузер малює
 * запасним шрифтом, тож такі метрики віддаються, але не запам'ятовуються.
 */
export class MetricsCache {
  private readonly known = new Map<string, FontMetrics>();

  constructor(
    private readonly measure: (font: string) => FontMetrics | null,
    private readonly ready: (font: string) => boolean,
  ) {}

  get(font: string): FontMetrics | undefined {
    const known = this.known.get(font);
    if (known) return known;
    const measured = this.measure(font);
    if (!measured) return undefined;
    if (this.ready(font)) this.known.set(font, measured);
    return measured;
  }
}

/** Рядок, за яким міряє Phaser (`TextStyle.testString`). */
const TEST_STRING = "|MÉqgy";

let context: CanvasRenderingContext2D | null | undefined;

/** Те саме, що `MeasureText` Phaser, але на одному спільному полотні; старий браузер без меж рядка — null (Phaser міряє сам). */
function measure(font: string): FontMetrics | null {
  if (typeof document === "undefined") return null;
  if (context === undefined) context = document.createElement("canvas").getContext("2d");
  if (!context) return null;
  context.font = font;
  const measured = context.measureText(TEST_STRING);
  if (!("actualBoundingBoxAscent" in measured)) return null;
  const ascent = measured.actualBoundingBoxAscent;
  const descent = measured.actualBoundingBoxDescent;
  return { ascent, descent, fontSize: ascent + descent };
}

/** Чи завантажено шрифти, якими браузер намалює рядок виміру; браузер без `document.fonts` — так. */
function ready(font: string): boolean {
  try {
    return document.fonts?.check(font, TEST_STRING) ?? true;
  } catch {
    return true;
  }
}

const cache = new MetricsCache(measure, ready);

/** Метрики шрифту; без браузера чи коли виміряти не вдалося — немає (Phaser тоді міряє сам). */
export function textMetrics(spec: FontSpec): FontMetrics | undefined {
  return cache.get(fontString(spec));
}

/** Стиль напису з готовими метриками шрифту: `scene.add.text` із ним шрифт не міряє. */
export function withMetrics<T extends FontSpec>(style: T): T & { metrics?: FontMetrics } {
  const metrics = textMetrics(style);
  return metrics ? { ...style, metrics } : style;
}

/**
 * Змінити розмір шрифту напису без виміру: `Text.setFontSize` міряє шрифт щоразу, а `setStyle` з метриками — ні. Так само
 * наново дати метрики напису, чий вебшрифт щойно завантажився (той самий розмір).
 */
export function setFontSize(text: Phaser.GameObjects.Text, px: number): void {
  const fontSize = `${px}px`;
  const metrics = textMetrics({ fontFamily: text.style.fontFamily, fontStyle: text.style.fontStyle, fontSize });
  text.setStyle(metrics ? { fontSize, metrics } : { fontSize });
}
