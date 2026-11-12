// Титри життя (§4.2): екран пенсії — шлях гравця стрічкою, як титри фільму. Що й у якому порядку — `creditsplan.ts`, рух і такт —
// `rollmath.ts`. Титул проявляється на удари звуку кінця гри, далі стрічка їде в такт музиці: кожен блок займає ціле число долей
// і виїжджає знизу на удар. Стрічка їде трансформацією (плавно, з частками пікселя), а коли зупинилася чи гравець крутнув
// коліщатко, стає звичайною прокруткою: так її можна гортати назад.

import { sceneLoop, type SceneLoop } from "../audio/sfx/sounds";
import type { GameState } from "../sim/types";
import { timeBar } from "./cards";
import { creditsPlan, type CreditsBlock } from "./creditsplan";
import "./lifecredits.css";
import { element, type CardAction } from "./overlay";
import { iconImage } from "./icons";
import { drawPhoto } from "./photo";
import { CREDITS_INTRO, creditsMusicGain, polaroidTilt, rollEnd, rollOffset, slotHeight } from "./rollmath";
import type { Photo } from "../view/photo";

/** Сторона фото, px CSS: з висоти й ширини екрана, щоб полароїд із підписом умістився і на низькому телефоні. */
function photoSide(scale = 1): number {
  return Math.round(Math.max(140, Math.min(280 * scale, window.innerHeight * 0.44 * scale, window.innerWidth * 0.62)));
}

/** Фото вихід на пенсію — більше за решту: це головна подія шляху. */
const RETIREMENT_PHOTO = 1.3;

/**
 * Фото малюється один раз, коли полароїд підходить до екрана: до 60 фото одразу дали б паузу на старті. Спостерігач — щодо
 * самого екрана титрів: він обрізає стрічку (`overflow: hidden`), тож щодо вікна запас `rootMargin` не діяв би й фото
 * малювалося б у мить появи. Намальовано всі — спостерігач відключається.
 */
class PhotoQueue {
  private readonly pending = new Map<Element, () => void>();
  private readonly watcher: IntersectionObserver | null;

  constructor(root: HTMLElement) {
    this.watcher =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              for (const entry of entries) if (entry.isIntersecting) this.take(entry.target);
            },
            { root, rootMargin: "100% 0px" },
          );
  }

  add(canvas: HTMLCanvasElement, photo: Photo): void {
    const draw = (): void => drawPhoto(canvas, photo);
    if (!this.watcher) return draw();
    this.pending.set(canvas, draw);
    this.watcher.observe(canvas);
  }

  stop(): void {
    this.watcher?.disconnect();
    this.pending.clear();
  }

  private take(target: Element): void {
    const draw = this.pending.get(target);
    if (!draw) return;
    this.pending.delete(target);
    this.watcher?.unobserve(target);
    draw();
    if (this.pending.size === 0) this.watcher?.disconnect();
  }
}

function polaroid(photo: Photo, caption: string, index: number, photos: PhotoQueue, scale = 1): HTMLElement {
  const side = photoSide(scale);
  const ratio = Math.min(3, globalThis.devicePixelRatio || 1);
  const canvas = element("canvas", "polaroid-photo");
  canvas.width = Math.round(side * ratio);
  canvas.height = Math.round(side * ratio);
  canvas.style.width = `${side}px`;
  canvas.style.height = `${side}px`;
  photos.add(canvas, photo);
  const frame = element("figure", "polaroid");
  const tilt = polaroidTilt(index);
  frame.style.setProperty("--rot", `${tilt.rot}deg`);
  frame.style.setProperty("--shift", `${tilt.shift}px`);
  frame.append(element("div", "polaroid-shot"), element("figcaption", "polaroid-caption", caption));
  frame.firstElementChild?.append(canvas);
  return frame;
}

/** Напис титулу, що проявляється на удар звуку кінця гри. */
function beatLine<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: string, beat: number): HTMLElementTagNameMap[K] {
  const line = element(tag, `${className} credits-beat`, text);
  line.style.animationDelay = `${CREDITS_INTRO.beatsMs[beat] ?? 0}ms`;
  return line;
}

function block(item: CreditsBlock, index: number, photos: PhotoQueue, state: GameState): HTMLElement {
  switch (item.kind) {
    case "title": {
      const box = element("header", "credits-title");
      box.append(beatLine("h1", "credits-name", item.name, 0), beatLine("p", "credits-weeks", item.weeks, 1), beatLine("h2", "title-heading credits-finale", item.finale, 2));
      return box;
    }
    case "week":
      return element("li", "credits-week", item.label);
    case "polaroid": {
      const box = element("li", "credits-moment");
      box.append(polaroid(item.photo, item.caption.title, index, photos));
      if (item.caption.text) box.append(element("p", "credits-text", item.caption.text));
      return box;
    }
    case "line": {
      const box = element("li", "credits-line");
      const icon = item.icon && iconImage(item.icon);
      if (icon) {
        icon.className = "credits-line-icon";
        box.append(icon);
      }
      box.append(element("span", "credits-line-text", item.caption.title));
      return box;
    }
    case "retirement": {
      const box = element("li", "credits-moment credits-retirement");
      box.append(polaroid(item.photo, item.caption.title, index, photos, RETIREMENT_PHOTO));
      for (const paragraph of item.caption.text.split("\n\n")) box.append(element("p", "credits-finale-text", paragraph));
      const time = timeBar(state);
      if (time) box.append(time);
      return box;
    }
    case "living": {
      const box = element("li", "credits-moment credits-living");
      box.append(polaroid(item.photo, item.caption.title, index, photos));
      if (item.caption.text) box.append(element("p", "credits-text", item.caption.text));
      return box;
    }
  }
}

/**
 * Розмітка в такт (§4.2): титул — рівно на екран, кожен блок шляху й живих котів — ціле число долей. Висоти тексту залежать від
 * шрифту й ширини, тож розмітку повторюють, коли шрифти завантажились і коли змінився розмір вікна. Спершу всі заміри, потім
 * усі записи: запис посеред замірів змусив би браузер перераховувати розмітку на кожен блок. Відступ блоку на його висоту не
 * впливає (`offsetHeight` — без нього).
 */
function layOut(screen: HTMLElement, title: HTMLElement | null, lists: readonly HTMLElement[]): void {
  const viewport = screen.clientHeight;
  if (viewport <= 0) return;
  const blocks = lists.flatMap((list) => Array.from(list.children) as HTMLElement[]);
  const heights = blocks.map((block) => block.offsetHeight);
  if (title) title.style.height = `${viewport}px`;
  blocks.forEach((block, i) => {
    const height = heights[i]!;
    block.style.marginBottom = `${slotHeight(height, viewport) - height}px`;
  });
}

/**
 * Петля музики, коли вона є: від миті, коли її справді стало чути (`SceneLoop.startedAt` — за годинником звуку, після
 * декодування), рахуються долі, за якими йде стрічка.
 */
interface MusicClock {
  loop: SceneLoop | null;
}

/**
 * Музика під титрами (§4.2): петля групи `ui`, поки стрічка на екрані. Наростає кадрами, щойно стихає кінець гри; далі лише
 * зрідка перевіряє, чи стрічка ще на екрані, щоб не крутити кадри даремно.
 */
function playCreditsMusic(screen: HTMLElement, clock: MusicClock): void {
  let loop: SceneLoop | null = null;
  let born = -1;
  const stop = (): void => {
    loop?.stop();
    loop = null;
    clock.loop = null;
  };
  const start = (gain: number): void => {
    loop = sceneLoop("ui", "credits");
    clock.loop = loop;
    loop?.set(gain, 1);
  };
  const watch = (): void => {
    const timer = setInterval(() => {
      if (!screen.isConnected) {
        clearInterval(timer);
        stop();
        return;
      }
      if (!loop) start(1);
    }, 500);
  };
  const frame = (now: number): void => {
    if (!screen.isConnected) {
      // Ще не показали — чекаємо; уже прибрали — тиша.
      if (born < 0) requestAnimationFrame(frame);
      else stop();
      return;
    }
    if (born < 0) born = now;
    const gain = creditsMusicGain(now - born);
    // Звук ще не готовий (аудіо не запущено, файл не декодовано) — спробувати наступного кадру, а після наростання — зрідка.
    if (gain > 0 && !loop) start(gain);
    loop?.set(gain, 1);
    if (gain < 1) requestAnimationFrame(frame);
    else watch();
  };
  requestAnimationFrame(frame);
}

/** Хто тримає прискорення: клавіша й вказівник окремо, щоб відпущена клавіша не скидала затиснутий палець. */
interface Hold {
  key: boolean;
  pointer: boolean;
}

/**
 * Стрічка титрів життя для `Overlay.credits`. «Нова гра» діє лише тоді, коли стрічка зупинилася: доти пробіл і Enter, як і
 * натискання, лише прискорюють її (§4.2), а затиснута для прискорення клавіша кнопку не натискає — автоповтор картка й так
 * не вважає новим натисканням.
 */
export function lifeCredits(state: GameState, newGame: () => void): { screen: HTMLElement; actions: CardAction[] } {
  const screen = element("div", "credits-screen");
  const track = element("div", "credits-track");
  screen.append(track);
  const photos = new PhotoQueue(screen);
  const path = element("ol", "credits-path");
  const living = element("ol", "credits-path credits-path-living");
  let title: HTMLElement | null = null;
  let index = 0;
  for (const item of creditsPlan(state)) {
    const node = block(item, index, photos, state);
    if (item.kind === "polaroid" || item.kind === "living" || item.kind === "retirement") index += 1;
    if (item.kind === "title") title = node;
    else if (item.kind === "living") living.append(node);
    else path.append(node);
  }
  if (title) track.append(title);
  track.append(path);
  if (living.childElementCount > 0) track.append(living);

  let done = false;
  // Зупинилася — далі звичайна прокрутка: прискорення вже нема чого ловити, а розмітка в такт не потрібна. Ненамальовані фото
  // ще малюються, поки гравець гортає (`PhotoQueue`); слухачів на `window` не лишається, тож після закриття нічого не тримає стрічку.
  const finish = (): void => {
    if (done) return;
    done = true;
    screen.classList.add("free");
    track.style.transform = "";
    screen.scrollTop = offset;
    release();
    window.removeEventListener("resize", onResize);
  };
  const choose = (): void => {
    if (done) newGame();
  };
  const actions = element("div", "card-actions ending-actions credits-actions");
  const button = element("button", "button primary", "Нова гра");
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    choose();
  });
  actions.append(button);
  track.append(actions);

  const hold: Hold = { key: false, pointer: false };
  const music: MusicClock = { loop: null };
  let offset = 0;
  let last = 0;
  let started = -1;
  let attached = false;

  const isHoldKey = (event: KeyboardEvent): boolean => event.key === " " || event.key === "Enter";
  const onKeyDown = (event: KeyboardEvent): void => {
    if (done || !isHoldKey(event)) return;
    // Раніше за картку (перехоплення): інакше пробіл натиснув би «Нову гру», ще коли стрічка їде.
    event.preventDefault();
    event.stopImmediatePropagation();
    hold.key = true;
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    if (isHoldKey(event)) hold.key = false;
  };
  const onPointerDown = (event: PointerEvent): void => {
    if (done || (event.target as Element | null)?.closest?.("button")) return;
    hold.pointer = true;
  };
  const onPointerUp = (): void => {
    hold.pointer = false;
  };
  // Коліщатко — гравець узяв стрічку в свої руки: далі звичайна прокрутка.
  const onWheel = (): void => finish();
  const relayOut = (): void => layOut(screen, title, [path, living]);
  // Зміна розміру вікна приходить пачкою подій: розмітка — раз за кадр.
  let resizing = false;
  const onResize = (): void => {
    if (resizing) return;
    resizing = true;
    requestAnimationFrame(() => {
      resizing = false;
      relayOut();
    });
  };
  const release = (): void => {
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
  };
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  screen.addEventListener("pointerdown", onPointerDown);
  screen.addEventListener("wheel", onWheel, { passive: true });

  playCreditsMusic(screen, music);
  const still = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const frame = (now: number): void => {
    if (!screen.isConnected) {
      // Картку ще не показали — чекаємо; прибрали посеред руху (режим розробки завантажив інше) — прибрати за собою.
      if (!attached) requestAnimationFrame(frame);
      else {
        release();
        photos.stop();
        window.removeEventListener("resize", onResize);
      }
      return;
    }
    if (!attached) {
      attached = true;
      relayOut();
      window.addEventListener("resize", onResize);
      void document.fonts?.ready.then(relayOut);
    }
    if (still) finish();
    if (done) return;
    if (started < 0) started = now;
    const dt = last === 0 ? 0 : now - last;
    last = now;
    // Поки звучить кінець гри — титул посередині; далі стрічка їде за долями музики, від миті, коли та справді вступила.
    const rollFrom = started + CREDITS_INTRO.endMs;
    if (now >= rollFrom) {
      const end = rollEnd(track.offsetHeight, screen.clientHeight);
      offset = rollOffset(offset, dt, screen.clientHeight, end, hold.key || hold.pointer, now - (music.loop?.startedAt() ?? rollFrom));
      track.style.transform = `translate3d(0, ${-offset}px, 0)`;
      if (offset >= end) finish();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  return { screen, actions: [{ label: "Нова гра", primary: true, onSelect: choose }] };
}
