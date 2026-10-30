// Галерея арту (крок 16, GRAPHICS_PLAN.md: F2): окрема сторінка `gallery.html` — лише в `npm run dev` і на прев'ю Netlify
// (як і режим розробки, у продакшн-збірку не потрапляє: вхід додає `vite.config.ts` лише з `__DEV_TOOLS__`). Шелл: власна
// гра Phaser, яка вантажить атлас так само, як гра (`loadArtAtlas`), а без атласу працює на заглушках `atlas.ts`; вкладки —
// модулі `tabs/<id>.ts` з `TAB` (`tab.ts`), їх знаходить `import.meta.glob`, тож спільного реєстру немає.
//
// Адреса: `?tab=<id>&bg=<light|dark|floor>&zoom=<k|phone>&t=<мс>&span=<мс>&speed=<k>&panel=<1|0>` (`params.ts`). Світ
// галереї — одиниці арту: (0, 0) — лівий верхній кут області перегляду, вкладка кладе вміст праворуч і донизу; перетягування
// прокручує, колесо — теж (з Ctrl — масштаб довкола курсора). Скрипт знімків чекає `<html data-art>` (атлас) і
// `<html data-gallery="<id>">` (вкладку відкрито).

import Phaser from "phaser";

import { PALETTE } from "../../../art/palette";
import { markArtReady } from "../../view/art/atlas";
import { loadArtAtlas, type ArtAtlasResult } from "../../view/art/atlasload";
import { COLORS } from "../../view/colors";
import "./gallery.css";
import { galleryView, onZoomRequest, setGalleryView, viewRect } from "./kit";
import {
  BG_TITLES,
  clampZoom,
  DEFAULT_SPAN,
  formatZoom,
  GALLERY_BGS,
  parseGalleryParams,
  replaceParams,
  SPANS,
  SPEEDS,
  ZOOM_PRESETS,
  type GalleryBg,
} from "./params";
import type { GalleryContext, GalleryTab, GalleryView } from "./tab";

/** Атрибут `<html data-gallery>`: id відкритої вкладки — для скрипта знімків. */
const GALLERY_READY_ATTR = "gallery";
/** Найбільша щільність пікселів полотна: на 3× екрані телефона цього досить, а пам'яті менше. */
const MAX_DPR = 3;
/** Ширина вікна, від якої бічна панель відкрита одразу. */
const SIDE_MIN_WIDTH = 1000;
/** Крок кнопок масштабу. */
const ZOOM_STEP = 1.25;
/** Тло «підлога»: колір і ізометрична сітка плиток 128 × 64 одиниці (лише для галереї, не арт). */
const FLOOR = { color: "#a38f74", tile: { w: 128, h: 64 } };
const FLOOR_TILE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='64' viewBox='0 0 128 64'%3E" +
  "%3Cpath d='M0 32L64 0L128 32L64 64Z' fill='%23000' fill-opacity='0.06' stroke='%23000' stroke-opacity='0.22' " +
  "stroke-width='1.5'/%3E%3C/svg%3E\")";
const BG_COLORS: Readonly<Record<GalleryBg, string>> = {
  light: PALETTE.paper,
  dark: `#${COLORS.background.toString(16).padStart(6, "0")}`,
  floor: FLOOR.color,
};

/** Вкладки: файли `tabs/*.ts`, за `order`, потім за id. */
const TABS: readonly GalleryTab[] = Object.entries(import.meta.glob<GalleryTab>("./tabs/*.ts", { eager: true, import: "TAB" }))
  .map(([path, tab]) => {
    const file = path.slice(path.lastIndexOf("/") + 1, -".ts".length);
    if (tab.id !== file) console.warn(`Галерея: вкладка ${path} має id «${tab.id}», а має бути «${file}» (назва файлу)`);
    return tab;
  })
  .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

const params = parseGalleryParams(window.location.search);
/** Сцена галереї, коли вона вже є. */
let scene: Phaser.Scene | null = null;
/** Курсор над областю перегляду, CSS px від її лівого верхнього кута: у рядку стану — координати світу під ним. */
let pointer = { x: 0, y: 0, inside: false };
const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), MAX_DPR);
setGalleryView({ zoom: params.zoom, dpr });

// --- Сторінка ---------------------------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text: string, title: string, onClick: () => void): HTMLButtonElement {
  const node = el("button", "g-button", text);
  node.type = "button";
  node.title = title;
  node.addEventListener("click", onClick);
  return node;
}

function select(options: readonly { value: string; title: string }[], value: string, onChange: (value: string) => void): HTMLSelectElement {
  const node = el("select", "g-select");
  for (const option of options) {
    const item = el("option", undefined, option.title);
    item.value = option.value;
    node.append(item);
  }
  node.value = value;
  node.addEventListener("change", () => onChange(node.value));
  return node;
}

const root = document.getElementById("gallery") ?? document.body.appendChild(el("div"));
root.className = "g-app";
const bar = el("header", "g-bar");
const tabsNav = el("nav", "g-tabs");
const tools = el("div", "g-tools");
bar.append(tabsNav, tools);
const side = el("aside", "g-side");
const stage = el("main", "g-stage");
const status = el("div", "g-status");
stage.append(status);
root.append(bar, side, stage);

let sideOpen = params.panel ?? window.innerWidth >= SIDE_MIN_WIDTH;
const applySide = (): void => {
  root.classList.toggle("g-side-closed", !sideOpen);
};
applySide();

// --- Час ----------------------------------------------------------------------------------------

/** Час галереї, мс: іде, поки «відтворення», і стоїть на повзунку, поки пауза. */
let time = params.time ?? 0;
let playing = params.time === null;
let span = params.span;
let speed = params.speed;

const playButton = button("", "Пауза / відтворення (пробіл)", () => setPlaying(!playing));
const slider = el("input", "g-slider");
slider.type = "range";
slider.min = "0";
slider.step = "1";
const timeLabel = el("output", "g-time");
slider.addEventListener("input", () => {
  setPlaying(false);
  time = Number(slider.value);
  showTime();
});

function setPlaying(value: boolean): void {
  playing = value;
  playButton.textContent = playing ? "⏸" : "▶";
  replaceParams({ t: playing ? null : String(Math.round(time)) });
}

function showTime(): void {
  slider.max = String(span);
  slider.value = String(Math.round(time));
  timeLabel.textContent = `${Math.round(time)} мс`;
}

const spanSelect = select(
  SPANS.map((value) => ({ value: String(value), title: `0–${value / 1000} с` })),
  String(span),
  (value) => {
    span = Number(value);
    time = Math.min(time, span);
    showTime();
    replaceParams({ span: span === DEFAULT_SPAN ? null : value });
  },
);
if (!SPANS.includes(span)) spanSelect.prepend(Object.assign(el("option", undefined, `0–${span / 1000} с`), { value: String(span) }));
spanSelect.value = String(span);
const speedTitle = (value: number): string => `×${String(value).replace(".", ",")}`;
const speedSelect = select(
  [...new Set([...SPEEDS, speed])].sort((a, b) => a - b).map((value) => ({ value: String(value), title: speedTitle(value) })),
  String(speed),
  (value) => {
    speed = Number(value);
    replaceParams({ speed: speed === 1 ? null : value });
  },
);

// --- Тло, масштаб і перегляд -------------------------------------------------------------------

let bg: GalleryBg = params.bg;
const bgSelect = select(
  GALLERY_BGS.map((value) => ({ value, title: BG_TITLES[value] })),
  bg,
  (value) => {
    bg = GALLERY_BGS.find((item) => item === value) ?? "light";
    applyBg();
    replaceParams({ bg: bg === "light" ? null : bg });
  },
);

let lastBg = "";
/** Тло області перегляду — CSS під прозорим полотном; сітка підлоги їде й масштабується разом зі світом. */
function applyBg(): void {
  const camera = scene?.cameras.main;
  const zoom = galleryView().zoom;
  const view = camera ? viewRect(camera) : { x: 0, y: 0 };
  const key = `${bg}|${zoom}|${view.x}|${view.y}`;
  if (key === lastBg) return;
  lastBg = key;
  stage.style.backgroundColor = BG_COLORS[bg];
  if (bg !== "floor") {
    stage.style.backgroundImage = "";
    return;
  }
  stage.style.backgroundImage = FLOOR_TILE;
  stage.style.backgroundSize = `${FLOOR.tile.w * zoom}px ${FLOOR.tile.h * zoom}px`;
  stage.style.backgroundPosition = `${-view.x * zoom}px ${-view.y * zoom}px`;
}

const zoomSelect = select(
  [...ZOOM_PRESETS.map((preset) => ({ value: formatZoom(preset.value), title: preset.title })), { value: "", title: "свій" }],
  "",
  (value) => {
    const preset = ZOOM_PRESETS.find((item) => formatZoom(item.value) === value);
    if (preset) setZoom(preset.value);
  },
);
const zoomLabel = el("output", "g-zoom");

/** Змінити масштаб, лишивши на місці точку світу під `anchor` (CSS px від лівого верхнього кута; за замовчуванням — центр). */
function setZoom(next: number, anchor?: { x: number; y: number }): void {
  const zoom = clampZoom(next);
  const camera = scene?.cameras.main;
  if (camera) {
    const view = viewRect(camera);
    const css = { w: view.w * galleryView().zoom, h: view.h * galleryView().zoom };
    const at = anchor ?? { x: css.w / 2, y: css.h / 2 };
    const world = { x: view.x + at.x / galleryView().zoom, y: view.y + at.y / galleryView().zoom };
    camera.setZoom(zoom * dpr);
    camera.setScroll(world.x - at.x / zoom, world.y - at.y / zoom);
  }
  setGalleryView({ zoom });
  showZoom();
  replaceParams({ zoom: Math.abs(zoom - 1) < 1e-9 ? null : formatZoom(zoom) });
}

// Вкладка може попросити інший масштаб (кнопка «як у грі на телефоні»).
onZoomRequest((zoom) => setZoom(zoom));

function showZoom(): void {
  const zoom = galleryView().zoom;
  const preset = ZOOM_PRESETS.find((item) => Math.abs(item.value - zoom) < 1e-9);
  zoomSelect.value = preset ? formatZoom(preset.value) : "";
  zoomLabel.textContent = `${(Math.round(zoom * 100) / 100).toString().replace(".", ",")} px / од.`;
}

function resetView(): void {
  scene?.cameras.main.setScroll(0, 0);
}

tools.append(
  labelled("Тло", bgSelect),
  labelled("Масштаб", zoomSelect),
  button("−", "Дрібніше (−)", () => setZoom(galleryView().zoom / ZOOM_STEP)),
  button("+", "Більше (+)", () => setZoom(galleryView().zoom * ZOOM_STEP)),
  zoomLabel,
  button("⌂", "На початок (0)", resetView),
  playButton,
  slider,
  timeLabel,
  spanSelect,
  speedSelect,
  button("☰", "Бічна панель", () => {
    sideOpen = !sideOpen;
    applySide();
    replaceParams({ panel: sideOpen ? "1" : "0" });
  }),
);

function labelled(title: string, control: HTMLElement): HTMLElement {
  const label = el("label", "g-label");
  label.append(el("span", undefined, title), control);
  return label;
}

// --- Вкладки -------------------------------------------------------------------------------------

interface Open {
  tab: GalleryTab;
  view: GalleryView | null;
  layer: Phaser.GameObjects.Layer;
  panel: HTMLElement;
  resize: Set<(width: number, height: number) => void>;
  /** Вкладка впала в `update` — більше не кликати, щоб не засипати консоль. */
  broken: boolean;
}

let open: Open | null = null;
const tabButtons = new Map<string, HTMLButtonElement>();
for (const tab of TABS) {
  const node = button(tab.title, tab.id, () => {
    if (open?.tab !== tab) openTab(tab);
  });
  node.classList.add("g-tab");
  tabButtons.set(tab.id, node);
  tabsNav.append(node);
}

function openTab(tab: GalleryTab): void {
  if (!scene) return;
  closeTab();
  resetView();
  const layer = scene.add.layer();
  const panel = el("div", "g-tab-panel");
  side.append(panel);
  const resize = new Set<(width: number, height: number) => void>();
  const current: Open = { tab, view: null, layer, panel, resize, broken: false };
  open = current;
  const ctx: GalleryContext = {
    scene,
    layer,
    panel,
    time: () => time,
    onResize(listener) {
      resize.add(listener);
      listener(stage.clientWidth, stage.clientHeight);
      return () => resize.delete(listener);
    },
  };
  try {
    current.view = tab.mount(ctx);
  } catch (error) {
    console.error(`Галерея: вкладка «${tab.id}» не відкрилася`, error);
    panel.append(el("p", "g-error", `Вкладка не відкрилася: ${error instanceof Error ? error.message : String(error)}`));
  }
  for (const [id, node] of tabButtons) node.classList.toggle("g-active", id === tab.id);
  replaceParams({ tab: tab.id === TABS[0]?.id ? null : tab.id });
  document.documentElement.dataset[GALLERY_READY_ATTR] = tab.id;
}

function closeTab(): void {
  if (!open) return;
  const { view, layer, panel, resize, tab } = open;
  open = null;
  try {
    view?.destroy();
  } catch (error) {
    console.error(`Галерея: вкладка «${tab.id}» не закрилася чисто`, error);
  }
  resize.clear();
  layer.destroy();
  panel.remove();
}

// --- Phaser --------------------------------------------------------------------------------------

class GalleryScene extends Phaser.Scene {
  constructor() {
    super("gallery");
  }

  create(): void {
    scene = this;
    const camera = this.cameras.main;
    camera.setOrigin(0, 0);
    camera.setZoom(galleryView().zoom * dpr);
    camera.setScroll(0, 0);
    setupInput(this);
    status.textContent = "Атлас вантажиться…";
    void loadArtAtlas(this)
      .catch((error: unknown): ArtAtlasResult => {
        // Атлас не склався — галерея однаково відкривається, на заглушках.
        console.error("Галерея: атлас не завантажився", error);
        return { state: "none", index: null };
      })
      .then((result) => {
        setGalleryView({ index: result.index });
        markArtReady(result.state);
        showStatus();
        const tab = TABS.find((item) => item.id === params.tab) ?? TABS[0];
        if (params.tab !== null && tab?.id !== params.tab) console.warn(`Галерея: вкладки «${params.tab}» немає`);
        if (tab) openTab(tab);
      });
  }

  override update(_time: number, delta: number): void {
    const step = playing ? delta * speed : 0;
    if (playing) {
      time = (time + step) % span;
      showTime();
    }
    applyBg();
    showStatus();
    const current = open;
    if (!current?.view?.update || current.broken) return;
    try {
      current.view.update(time, step);
    } catch (error) {
      current.broken = true;
      console.error(`Галерея: вкладка «${current.tab.id}» впала в update`, error);
    }
  }
}

let lastStatus = "";
function showStatus(): void {
  const index = galleryView().index;
  const atlas = index ? `атлас: ${index.pages.length} стор.` : "атласу немає — заглушки";
  const camera = scene?.cameras.main;
  let where = "";
  if (camera && pointer.inside) {
    const view = viewRect(camera);
    const zoom = galleryView().zoom;
    where = ` · x ${Math.round(view.x + pointer.x / zoom)}, y ${Math.round(view.y + pointer.y / zoom)}`;
  }
  const text = `${atlas}${where}`;
  if (text !== lastStatus) status.textContent = lastStatus = text;
}

/** Перетягування прокручує світ (якщо не почалося на інтерактивному об'єкті вкладки), колесо — теж, з Ctrl — масштаб. */
function setupInput(gallery: Phaser.Scene): void {
  let dragging = false;
  gallery.input.on(Phaser.Input.Events.POINTER_DOWN, (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
    dragging = over.length === 0;
  });
  gallery.input.on(Phaser.Input.Events.POINTER_UP, () => (dragging = false));
  gallery.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
    if (!dragging || !p.isDown) return;
    const camera = gallery.cameras.main;
    camera.scrollX -= (p.position.x - p.prevPosition.x) / camera.zoom;
    camera.scrollY -= (p.position.y - p.prevPosition.y) / camera.zoom;
  });
  stage.addEventListener("pointermove", (event) => {
    const rect = stage.getBoundingClientRect();
    pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top, inside: true };
  });
  stage.addEventListener("pointerleave", () => (pointer = { ...pointer, inside: false }));
  stage.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      const lines = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? rect.height : 1;
      const dx = event.deltaX * lines;
      const dy = event.deltaY * lines;
      if (event.ctrlKey || event.metaKey) {
        setZoom(galleryView().zoom * Math.pow(ZOOM_STEP, -dy / 100), { x: event.clientX - rect.left, y: event.clientY - rect.top });
        return;
      }
      const camera = gallery.cameras.main;
      const zoom = galleryView().zoom;
      camera.scrollX += (event.shiftKey ? dy : dx) / zoom;
      camera.scrollY += (event.shiftKey ? 0 : dy) / zoom;
    },
    { passive: false },
  );
  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === " ") setPlaying(!playing);
    else if (event.key === "+" || event.key === "=") setZoom(galleryView().zoom * ZOOM_STEP);
    else if (event.key === "-") setZoom(galleryView().zoom / ZOOM_STEP);
    else if (event.key === "0") resetView();
    else return;
    event.preventDefault();
  });
}

/** Розмір полотна — область перегляду в CSS px × щільність: так арт на телефоні чіткий. */
const stageSize = (): { width: number; height: number } => ({
  width: Math.max(1, Math.round(stage.clientWidth * dpr)),
  height: Math.max(1, Math.round(stage.clientHeight * dpr)),
});

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: stage,
  ...stageSize(),
  transparent: true,
  // Одна текстура на пакет малювання. Шейдер Phaser 4 вибирає текстуру пакета точним порівнянням інтерпольованого номера
  // (`outTexDatum == float(INDEX)`, GetTexture.glsl), і на повернутих зображеннях програмний WebGL знімків (SwiftShader)
  // часом промахується: шматки частин скелета зникають чи беруть чужу текстуру (запечені частини — кожна своя текстура).
  // З одною текстурою номер завжди 0 — точно. Галерея — для оцінки арту, тож тут надійність важливіша за кількість викликів
  // малювання; для гри це рішення T1/T2 (GRAPHICS_PLAN.md).
  render: { maxTextures: 1 },
  banner: false,
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr },
  input: { activePointers: 2 },
  scene: [GalleryScene],
});

let stageCss = { width: 0, height: 0 };
new ResizeObserver(() => {
  const css = { width: stage.clientWidth, height: stage.clientHeight };
  if (css.width === stageCss.width && css.height === stageCss.height) return;
  stageCss = css;
  const size = stageSize();
  game.scale.resize(size.width, size.height);
  for (const listener of open?.resize ?? []) listener(css.width, css.height);
}).observe(stage);

setPlaying(playing);
showTime();
showZoom();
applyBg();
