// Як малюються позначки ізометричного світу (крок 16, T4): смуги прогресу, смужка пошуку роботи й зміст екрана комп'ютера —
// у манері арту (`art/STYLE.md`): пласкі кольори палітри (`art/palette.ts`), густий теплий чорнильний контур і одна тінь
// `shade`. Смуги — інтерфейс поверх світу, без ізометрії (як `fx` і бульбашки), а зміст екрана лежить у площині монітора
// (`ScreenQuad`). Де що — рахує `markslayout.ts`.

import type Phaser from "phaser";

import { PALETTE, SHADE, type PaletteToken } from "../../../art/palette";
import { BAR, BAR_DROP, clamp01, NOTE_CORNER, SEARCH_BAR, stageMark, type BarBox, type ScreenQuad, type ScreenShow } from "./markslayout";

/** Колір палітри арту як число для Phaser. */
export function tone(token: PaletteToken): number {
  return Number.parseInt(PALETTE[token].slice(1), 16);
}

const INK = tone("ink");
const PAPER = tone("paper");
const SHADE_TONE = tone("shade");

/** Чим заливати смугу: «добре» — зелене, небезпека — червоне (`art/STYLE.md`, «Сенси інтерфейсу»). */
export type BarTone = "good" | "danger";
const BAR_FILL: Record<BarTone, number> = { good: tone("green"), danger: tone("red") };

/** Заокруглений прямокутник, у якого радіус не більший за половину сторони (інакше Phaser вивертає кути). */
function pill(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  if (w <= 0 || h <= 0) return;
  g.fillRoundedRect(x, y, w, h, Math.min(w, h) / 2);
}

/** Тінь, чорнильна рамка й паперова доріжка смуги. */
function track(g: Phaser.GameObjects.Graphics, box: BarBox, ink: number): void {
  g.fillStyle(SHADE_TONE, SHADE.base);
  pill(g, box.x - ink, box.y - ink + BAR_DROP, box.w + ink * 2, box.h + ink * 2);
  g.fillStyle(INK, 1);
  pill(g, box.x - ink, box.y - ink, box.w + ink * 2, box.h + ink * 2);
  g.fillStyle(PAPER, 1);
  pill(g, box.x, box.y, box.w, box.h);
}

/** Заливка смуги на частку `value`: ліворуч, з тими самими заокругленими кінцями. */
function fill(g: Phaser.GameObjects.Graphics, box: BarBox, value: number, color: number): void {
  const w = clamp01(value) * box.w;
  if (w < 1) return;
  g.fillStyle(color, 1);
  pill(g, box.x, box.y, w, box.h);
}

/** Смуга прогресу (§8.2): паперова доріжка в чорнильній рамці, заливка кольором сенсу. */
export function drawBar(g: Phaser.GameObjects.Graphics, box: BarBox, value: number, kind: BarTone): void {
  track(g, box, BAR.ink);
  fill(g, box, value, BAR_FILL[kind]);
}

/** Кружечок етапу: попереду — порожній папір, пройдений — світло-зелений, де скінчилася відмова — червоний і більший. */
const STAGE_FILL = { ahead: PAPER, passed: tone("greenHi"), failed: tone("red") } as const;

/**
 * Смужка пошуку роботи (§8.6): одна вакансія — етапи (відгук, співбесіда, тестове, пропозиція) з кружечками на межах; на
 * відмові смужка червона, а кружечок, де все скінчилося, — червоний.
 */
export function drawSearchBar(g: Phaser.GameObjects.Graphics, box: BarBox, value: number, stages: number, rejected: boolean): void {
  track(g, box, SEARCH_BAR.ink);
  fill(g, box, value, rejected ? BAR_FILL.danger : BAR_FILL.good);
  const cy = box.y + box.h / 2;
  for (let i = 1; i <= stages; i++) {
    const mark = stageMark(value, stages, i, rejected);
    const r = SEARCH_BAR.stage + (mark === "failed" ? 2 : 0);
    const cx = box.x + (box.w * i) / stages;
    g.fillStyle(INK, 1).fillCircle(cx, cy, r + SEARCH_BAR.ink);
    g.fillStyle(STAGE_FILL[mark], 1).fillCircle(cx, cy, r);
  }
}

// --- Екран комп'ютера ---------------------------------------------------------------------------------------

/** Залити многокутник у площині екрана за координатами (s, t) його вершин — шляхом, без проміжних точок. */
function screenPath(g: Phaser.GameObjects.Graphics, q: ScreenQuad, st: readonly number[], color: number): void {
  g.fillStyle(color, 1).beginPath();
  for (let i = 0; i < st.length; i += 2) {
    const s = st[i]!;
    const t = st[i + 1]!;
    const x = q.center.x + q.u.x * s + q.v.x * t;
    const y = q.center.y + q.u.y * s + q.v.y * t;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath().fillPath();
}

/** Вершини чотирикутника — щоразу той самий масив: зміст екрана — це сотня чотирикутників. */
const QUAD_ST = [0, 0, 0, 0, 0, 0, 0, 0];

/** Чотирикутник у площині екрана від (s0, t0) до (s1, t1), координати −1…1 (праворуч, угору). */
function quad(g: Phaser.GameObjects.Graphics, q: ScreenQuad, s0: number, t0: number, s1: number, t1: number, color: number): void {
  QUAD_ST[0] = s0;
  QUAD_ST[1] = t1;
  QUAD_ST[2] = s1;
  QUAD_ST[3] = t1;
  QUAD_ST[4] = s1;
  QUAD_ST[5] = t0;
  QUAD_ST[6] = s0;
  QUAD_ST[7] = t0;
  screenPath(g, q, QUAD_ST, color);
}

/** Кружечок — 10 вершин, щоразу в тому самому масиві. */
const DOT_STEPS = 10;
const DOT_ST = new Array<number>(DOT_STEPS * 2).fill(0);

/** Коло в площині екрана (еліпс, сплющений площиною): `r` — радіус по горизонталі екрана. */
function dot(g: Phaser.GameObjects.Graphics, q: ScreenQuad, s: number, t: number, r: number, color: number): void {
  const ry = (r * Math.hypot(q.u.x, q.u.y)) / Math.hypot(q.v.x, q.v.y);
  for (let k = 0; k < DOT_STEPS; k++) {
    const a = (k / DOT_STEPS) * Math.PI * 2;
    DOT_ST[k * 2] = s + Math.cos(a) * r;
    DOT_ST[k * 2 + 1] = t + Math.sin(a) * ry;
  }
  screenPath(g, q, DOT_ST, color);
}

/** Детермінований «шум» для довжин рядків: той самий рядок — та сама довжина. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Рядок тексту на екрані: смужка товщиною `thick` (частка піввисоти) від `s0` завдовжки `length`. */
function line(g: Phaser.GameObjects.Graphics, q: ScreenQuad, s0: number, t: number, length: number, thick: number, color: number): void {
  if (length <= 0) return;
  quad(g, q, s0, t - thick / 2, s0 + length, t + thick / 2, color);
}

/**
 * Зміст екрана: тло світиться, на ньому — що зараз робить персонаж (чи кіт). `time` — час сцени, мс, округлений до кроку
 * змісту (`screenTime`): рядки дописуються, курсор блимає, мовець на дзвінку змінюється.
 */
export function drawScreen(g: Phaser.GameObjects.Graphics, q: ScreenQuad, show: ScreenShow, time: number): void {
  switch (show) {
    case "off":
      return;
    case "work":
      return drawWork(g, q, time);
    case "meeting":
      return drawMeeting(g, q, time);
    case "search":
      return drawSearch(g, q, time);
    case "keyboard":
      return drawKeyboard(g, q, time);
  }
}

/** Тло екрана: усе скло, крім кутка з запискою (`NOTE_CORNER`). */
function background(g: Phaser.GameObjects.Graphics, q: ScreenQuad, color: number): void {
  const { s, t } = NOTE_CORNER;
  screenPath(g, q, [-1, -1, 1, -1, 1, 1, s, 1, s, t, -1, t], color);
}

/** Смуга заголовка вгорі екрана (праворуч від записки). */
const TITLE = 0.62;

/** Вікно програми: тло й смуга заголовка. */
function screenWindow(g: Phaser.GameObjects.Graphics, q: ScreenQuad, body: PaletteToken, title: PaletteToken): void {
  background(g, q, tone(body));
  quad(g, q, NOTE_CORNER.s, TITLE, 1, 1, tone(title));
}

/** Робота: документ, який пишеться, — рядки з відступами з'являються один за одним, курсор блимає в кінці. */
function drawWork(g: Phaser.GameObjects.Graphics, q: ScreenQuad, time: number): void {
  screenWindow(g, q, "tealHi", "teal");
  const paper = tone("paper");
  // Кнопки вікна в заголовку.
  for (let k = 0; k < 3; k++) dot(g, q, 0.62 + k * 0.13, 0.81, 0.045, paper);
  const rows = 4;
  const step = 0.36;
  // Рядок пишеться ≈ 0,9 с; написаний аркуш починається знову.
  const typed = (time / 900) % (rows + 1);
  for (let row = 0; row < rows; row++) {
    const seed = Math.floor(time / (900 * (rows + 1))) * rows + row;
    const indent = row % 3 === 1 ? 0.22 : 0;
    const full = 0.75 + hash(seed) * 0.85 - indent;
    const done = Math.min(1, Math.max(0, typed - row));
    if (done <= 0) break;
    const t = 0.36 - row * step;
    line(g, q, -0.82 + indent, t, full * done, 0.17, paper);
    if (done < 1 && Math.floor(time / 260) % 2 === 0) quad(g, q, -0.82 + indent + full * done + 0.04, t - 0.13, -0.82 + indent + full * done + 0.1, t + 0.13, paper);
  }
}

/**
 * Відеодзвінок (летучка, нарада): темна програма дзвінка — угорі смуга з червоною кнопкою «покласти слухавку», під нею
 * чотири віконця колег; у того, хто говорить, — гірчична рамка, і він киває.
 */
function drawMeeting(g: Phaser.GameObjects.Graphics, q: ScreenQuad, time: number): void {
  screenWindow(g, q, "dark", "darkHi");
  dot(g, q, 0.82, 0.81, 0.07, tone("red"));
  const tiles: { bg: PaletteToken; shirt: PaletteToken; hair: PaletteToken }[] = [
    { bg: "blueHi", shirt: "blue", hair: "woodLo" },
    { bg: "greenHi", shirt: "plum", hair: "kibble" },
    { bg: "mustardHi", shirt: "teal", hair: "dark" },
    { bg: "pinkHi", shirt: "green", hair: "mustard" },
  ];
  const speaker = Math.floor(time / 1300) % tiles.length;
  // Дві смуги віконець між низом скла й заголовком.
  const rowH = (TITLE + 0.94 - 0.12) / 2;
  tiles.forEach((tile, i) => {
    const s0 = i % 2 === 0 ? -0.92 : 0.04;
    const s1 = s0 + 0.88;
    const t1 = i < 2 ? TITLE - 0.06 : TITLE - 0.06 - rowH - 0.06;
    const t0 = t1 - rowH;
    if (i === speaker) quad(g, q, s0 - 0.05, t0 - 0.07, s1 + 0.05, t1 + 0.07, tone("mustard"));
    quad(g, q, s0, t0, s1, t1, tone(tile.bg));
    const cs = (s0 + s1) / 2;
    // Плечі, голова й волосся колеги; хто говорить — киває.
    const nod = i === speaker ? Math.sin(time / 120) * 0.03 : 0;
    const k = rowH / 0.86;
    quad(g, q, cs - 0.3, t0, cs + 0.3, t0 + 0.28 * k, tone(tile.shirt));
    dot(g, q, cs, t0 + 0.45 * k + nod, 0.12, tone("pinkHi"));
    quad(g, q, cs - 0.12, t0 + 0.57 * k + nod, cs + 0.12, t0 + 0.68 * k + nod, tone(tile.hair));
  });
}

/** Пошук роботи: сторінка вакансій — рядок пошуку вгорі й список, що повільно гортається; поточна вакансія підсвічена. */
function drawSearch(g: Phaser.GameObjects.Graphics, q: ScreenQuad, time: number): void {
  screenWindow(g, q, "enamelHi", "blue");
  // Поле пошуку в заголовку.
  quad(g, q, -0.48, 0.7, 0.4, 0.92, tone("paper"));
  dot(g, q, 0.62, 0.81, 0.07, tone("paper"));
  const logos: PaletteToken[] = ["green", "plum", "orange", "teal", "red", "blue"];
  // Список гортається на рядок кожні 2,4 с.
  const first = Math.floor(time / 2400);
  for (let row = 0; row < 3; row++) {
    const n = first + row;
    const t = 0.32 - row * 0.5;
    if (row === 0) quad(g, q, -0.95, t - 0.22, 0.95, t + 0.22, tone("mustardHi"));
    quad(g, q, -0.82, t - 0.15, -0.6, t + 0.15, tone(logos[n % logos.length]!));
    line(g, q, -0.48, t + 0.07, 0.65 + hash(n) * 0.6, 0.12, tone("inkSoft"));
    line(g, q, -0.48, t - 0.1, 0.4 + hash(n + 7) * 0.4, 0.09, tone("greyLo"));
  }
}

/** Кіт на клавіатурі: екран прокинувся від його лап і швидко друкує одну літеру — рядок за рядком однакових зубчиків. */
function drawKeyboard(g: Phaser.GameObjects.Graphics, q: ScreenQuad, time: number): void {
  screenWindow(g, q, "tealHi", "teal");
  const paper = tone("paper");
  const perRow = 9;
  const rows = 4;
  // Літера на кожні ≈ 70 мс; заповнений екран починається знову.
  const typed = Math.floor(time / 70) % (perRow * rows + 6);
  const width = 1.64 / perRow;
  for (let k = 0; k < Math.min(typed, perRow * rows); k++) {
    const row = Math.floor(k / perRow);
    const col = k % perRow;
    const s = -0.82 + col * width;
    const t = 0.36 - row * 0.36;
    // Літера «п»: дві риски, як кіт тисне ту саму клавішу.
    quad(g, q, s, t - 0.12, s + width * 0.35, t + 0.12, paper);
    quad(g, q, s + width * 0.45, t - 0.12, s + width * 0.8, t + 0.12, paper);
  }
}
