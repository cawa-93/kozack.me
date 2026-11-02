// Декор квартири, якого сим не знає (§8.9 «День і ніч», §4.1 «Планове відключення»; рішення автора 2026-11-02): вікна, бра,
// бойлер, зарядна станція, свічки й невидимі стельові світильники. Єдине джерело їхніх місць: з нього беруть півоти маніфест
// арту (`src/view/art/manifest/a21-light.ts`), квартира (`iso/apartment.ts`) і джерела світла (`light/sources.ts`). Без Phaser.
//
// Координати — клітинки мапи (`src/sim/home.ts`), висота `z` — одиниці арту над підлогою (стіна заввишки 200, вікна спальні й
// вітальні — отвір z 72–172). Задні стіни: ряд y = 0 (лице до кімнати — площина y = 1) і стовпець x = 0 (площина x = 1);
// вони ніколи не згасають, тож усе настінне — лише на них (внутрішні стіни заввишки 66).

import { WINDOWS, type RoomId } from "../sim/home";
import type { Vec } from "../sim/types";

/** Площина задньої стіни: `y` — лице стіни ряду y = 0 (y = 1), `x` — лице стовпця x = 0 (x = 1). */
export type WallFace = "y" | "x";

/**
 * Вікно (`env/window/<room>`): клітинка стіни, лице, отвір уздовж стіни (`span`, координата x для лиця `y`, y для лиця `x`) і
 * по висоті (`z`). `sill` — підвіконня з `WINDOWS` (там сидять коти); у кухонного вікна його немає — воно лише декор.
 */
export interface Pane {
  room: RoomId;
  wall: Vec;
  face: WallFace;
  span: readonly [number, number];
  z: readonly [number, number];
  sill?: string;
}

/** Вікна спальні й вітальні — над підвіконнями (`WINDOWS`), отвір 0,8 клітинки × 100 (`art/env/window/bedroom.svg`). */
const SILL_PANES: readonly Pane[] = WINDOWS.map((w): Pane => {
  const face: WallFace = w.wall.y === 0 ? "y" : "x";
  const along = face === "y" ? w.wall.x : w.wall.y;
  const room = w.sill === "sill-bedroom" ? "bedroom" : "living";
  return { room, wall: w.wall, face, span: [along + 0.1, along + 0.9], z: [72, 172], sill: w.sill };
});

/**
 * Усі вікна квартири. Кухонне (рішення автора 2026-11-02: «Додати вікно на кухню», лише декор) — у задній стіні кухні над
 * правою стільницею, клітинка (16, 0), вище за кахельний фартух (z 56–118) і нижче за кришку стіни (200).
 */
export const PANES: readonly Pane[] = [...SILL_PANES, { room: "kitchen", wall: { x: 16, y: 0 }, face: "y", span: [16.1, 16.9], z: [125, 185] }];

/**
 * Бра (рішення автора 2026-11-02: «кілька настінних світильників як декор та світлові ефекти до них»): `env/sconce/back` на
 * лиці y = 1, `env/sconce/left` — на лиці x = 1 (своїм малюнком, не дзеркалом — `art/STYLE.md` §10). `at` — точка підлоги
 * біля лиця стіни під бра, `lamp` — висота абажура (звідки сяйво).
 */
export interface Sconce {
  id: "env/sconce/back" | "env/sconce/left";
  room: RoomId;
  at: Vec;
  face: WallFace;
  lamp: number;
}

export const SCONCES: readonly Sconce[] = [
  // Спальня: над узголів'ям ліжка (1, 1–2), узголів'я до z 72, павутина кута — з z 150.
  { id: "env/sconce/back", room: "bedroom", at: { x: 1.5, y: 1 }, face: "y", lamp: 122 },
  // Вітальня: обабіч вікна (фіранки y 7,7–9,3), подертий слід шпалер — y 10,2–10,8 до z 130.
  { id: "env/sconce/left", room: "living", at: { x: 1, y: 7.2 }, face: "x", lamp: 140 },
  { id: "env/sconce/left", room: "living", at: { x: 1, y: 9.8 }, face: "x", lamp: 140 },
];

/**
 * Бойлер (`env/boiler`, рішення автора 2026-11-02): на задній стіні ванної над пральною машиною (верх машини — z 72), між
 * рулоном паперу (9,5) і умивальником (11), лівіше й вище за тріснуту кахлину (≈ 10,375; z 90–105). `led` — висота індикатора
 * роботи: горить, коли є світло (сам індикатор — на передньому боці «бочки», точка `led` кадру).
 */
export const BOILER = { at: { x: 10.18, y: 1 } as Vec, face: "y" as WallFace, z: [118, 196] as const, led: 130 };

/**
 * Зарядна станція (`env/power-station`, рішення автора 2026-11-02 — «Зарядна станція в формі EcoFlow»: узагальнена
 * портативна станція без логотипа й назви марки): лише в день відключення, на підлозі праворуч від стола з комп'ютером
 * біля стіни ряду 5 (стіл (6–7, 6), під його правим краєм — системний блок x 7,46–7,8; дріт — від x 7,8 до розетки над
 * (8,75; 6)): слід x 8,04–8,5, y 6,06–6,36, кабель — до системного блока. `at` — центр сліду, `display` — висота дисплея.
 */
export const POWER_STATION = { at: { x: 8.27, y: 6.21 } as Vec, display: 18 };

/** Id точки зарядної станції в реєстрі глибини (`iso/apartment.ts`): сяйво дисплея (`iso/light.ts`) — одразу над нею. */
export const POWER_STATION_POINT = "power-station";

/**
 * Свічки (`env/candle`, лише в день відключення, лише вигляд — коти їх не чіпають): точка підлоги під свічкою (`at`) і висота
 * поверхні господаря, на якій вона стоїть (`z`). Господарі — речі мапи (`OBJECTS`), свічка малюється в їхньому проміжку
 * глибини, як дрібнички.
 */
export interface Candle {
  host: string;
  at: Vec;
  z: number;
}

export const CANDLES: readonly Candle[] = [
  { host: "table", at: { x: 13.3, y: 3.35 }, z: 54 },
  { host: "counter-right", at: { x: 16.42, y: 1.3 }, z: 62 },
  { host: "sink", at: { x: 11.22, y: 1.25 }, z: 70 },
  { host: "computer", at: { x: 7.84, y: 6.18 }, z: 54 },
  { host: "sill-living", at: { x: 1.14, y: 8.43 }, z: 70 },
  { host: "sill-bedroom", at: { x: 4.17, y: 1.14 }, z: 70 },
];

/**
 * Невидимі стельові світильники (рішення автора 2026-11-02: «Самих ліхтарів не видно, лише світлові промені від них»): точка
 * підлоги під світильником і висота стелі, звідки йде конус, `radius` — радіус плями на підлозі, клітинки.
 */
export interface CeilingLamp {
  room: RoomId;
  at: Vec;
  radius: number;
}

export const CEILING_HEIGHT = 230;

export const CEILING_LAMPS: readonly CeilingLamp[] = [
  { room: "bedroom", at: { x: 4, y: 3 }, radius: 2.2 },
  { room: "bathroom", at: { x: 10, y: 3 }, radius: 1.8 },
  { room: "kitchen", at: { x: 16, y: 3 }, radius: 2.2 },
  { room: "living", at: { x: 4.5, y: 8.5 }, radius: 2.4 },
  { room: "living", at: { x: 10, y: 8.5 }, radius: 2.4 },
  { room: "living", at: { x: 15.5, y: 8.5 }, radius: 2.4 },
];
