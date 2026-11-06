// Живі портрети котів у картках (§9.7). Один цикл на всі: кадри рідше за гру, а портрети за краєм прокрутки не малюються, щоб десяток
// котів у телефоні не гріли його. Коли картку закрили, полотно випадає з документа, і портрет сам зникає зі списку.

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
      if (portrait) portrait.visible = entry.isIntersecting;
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
    if (portrait.visible) portrait.figure.draw(portrait.poser.parts(time - portrait.born));
  }
}

/** Оживити кота на полотні: перший кадр — одразу, а далі він живе, поки полотно в документі. */
export function liveCatPortrait(canvas: HTMLCanvasElement, cat: Cat): void {
  const portrait: Live = {
    figure: new FigureCanvas(canvas, catRecipeOf(cat), PADDING),
    poser: new CatPoser(cat),
    born: performance.now(),
    attached: false,
    visible: true,
  };
  portrait.figure.draw(portrait.poser.parts(0));
  live.set(canvas, portrait);
  watch(canvas);
  if (!looping) {
    looping = true;
    requestAnimationFrame(tick);
  }
}
