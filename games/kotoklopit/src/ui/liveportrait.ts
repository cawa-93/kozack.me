// Живі портрети котів у картках (§9.7). Один цикл на всі: кадри рідше за гру, а портрети за краєм прокрутки не малюються й навіть не
// складаються, щоб десяток котів у телефоні не гріли його. Коли картку закрили, полотно випадає з документа, і портрет сам зникає зі
// списку.

import type { Cat } from "../sim/types";
import { FigureCanvas } from "../view/art/compose";
import { catRecipeOf } from "../view/art/recipes";
import { CatPoser } from "../view/iso/catportrait";

/** Найменший проміжок між кадрами, мс: рухи повільні, більше не потрібно. */
const FRAME_MS = 1000 / 24;
/** Скільки чекати, поки полотно потрапить у документ, мс: картку могли збудувати й не показати. */
const ATTACH_MS = 3000;
/** Поле довкола кота, частка меншої сторони полотна: голові й хвосту є куди рухатися. */
const PADDING = 0.02;

interface Live {
  figure: FigureCanvas;
  poser: CatPoser;
  born: number;
  attached: boolean;
  visible: boolean;
  /** Перший кадр уже є (з кешу чи коли картку стало видно). */
  drawn: boolean;
}

const live = new Map<HTMLCanvasElement, Live>();
let looping = false;
let lastFrame = 0;

/** Хто з портретів зараз на екрані; створюється з першим портретом: цей модуль імпортують і без браузера. */
let watcher: IntersectionObserver | null = null;

function watch(canvas: HTMLCanvasElement): void {
  watcher ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const portrait = live.get(entry.target as HTMLCanvasElement);
      if (!portrait) continue;
      portrait.visible = entry.isIntersecting;
      // Перший кадр — поза спокою, як і з кешу: з неї фігура бере масштаб і місце (`FigureCanvas`). Проміжку кадрів циклу не
      // чекаємо, щоб картка не стояла порожньою.
      if (portrait.visible && !portrait.drawn) portrait.drawn = portrait.figure.draw(portrait.poser.parts(0));
    }
  });
  watcher.observe(canvas);
}

function forget(canvas: HTMLCanvasElement): void {
  live.delete(canvas);
  watcher?.unobserve(canvas);
}

function tick(time: number): void {
  if (live.size === 0) {
    looping = false;
    return;
  }
  requestAnimationFrame(tick);
  if (time - lastFrame < FRAME_MS) return;
  lastFrame = time;
  for (const [canvas, portrait] of live) {
    if (canvas.isConnected) portrait.attached = true;
    else if (portrait.attached || time - portrait.born > ATTACH_MS) {
      forget(canvas);
      continue;
    }
    if (portrait.visible && portrait.figure.draw(portrait.poser.parts(time - portrait.born))) portrait.drawn = true;
  }
}

/**
 * Оживити кота на полотні: він живе, поки полотно в документі. Перший кадр одразу — лише якщо кота вже складено (картку відкривали чи
 * телефон її перебудував): це лише перекласти готове, і картка не блимне порожньою. Інакше — коли картку видно (`watch`).
 */
export function liveCatPortrait(canvas: HTMLCanvasElement, cat: Cat): void {
  const figure = new FigureCanvas(canvas, catRecipeOf(cat), PADDING);
  const poser = new CatPoser(cat);
  const born = performance.now();
  const portrait: Live = { figure, poser, born, attached: false, visible: false, drawn: figure.draw(poser.parts(0), { cachedOnly: true }) };
  live.set(canvas, portrait);
  watch(canvas);
  if (!looping) {
    looping = true;
    requestAnimationFrame(tick);
  }
}
