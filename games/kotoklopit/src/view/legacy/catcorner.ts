// Котячий куток і безлад на підлозі (§9.12): миски з кормом і водою, лотки, «сюрпризи», блювота,
// шерстяні грудки. Усе пласке й лежить на підлозі, тож малюється одним шаром під котами й персонажем.

import Phaser from "phaser";

import { bowlEaten, carriedToy, isDirty } from "../../sim/catai";
import { furTufts, ROBOT_DOCK, robotAt, robotProgress } from "../../sim/household";
import { BOWL_CAPACITY, FEEDER_CAPACITY, WATER_CAPACITY } from "../../sim/config";
import { CARRIER_SPOT, itemPoint, LAUNDRY_BASKET, slotCenter, STASHES } from "../../sim/home";
import type { FallenTrinket, Feeder, GameState, HomeItem, Mess, TrinketKind, Vec } from "../../sim/types";
import { COLORS } from "../colors";
import { TILE_H, TILE_W, toScreen } from "../geometry";

const BOWL = { cheap: 0x9aa3ab, premium: 0x4f7fb3 } as const;
const KIBBLE = { cheap: 0x8a5a33, premium: 0x6e2f22 } as const;
const LITTER = { cheap: 0xd6c6a2, premium: 0xece4d2 } as const;

/** Центр речі на екрані. */
export function itemScreen(item: HomeItem): { x: number; y: number } {
  const p = itemPoint(item);
  return toScreen({ x: p.x, y: p.y + (item.kind === "toy" ? 0 : 0.05) });
}

/** Іграшка-вудочка: паличка з пір'ям; дорога — яскравіша. */
export function drawToy(g: Phaser.GameObjects.Graphics, quality: "cheap" | "premium", x: number, y: number, scale = 1): void {
  const s = scale;
  g.lineStyle(2.5 * s, 0x8b5e3c).lineBetween(x - 12 * s, y, x + 6 * s, y - 10 * s);
  g.lineStyle(1.5 * s, COLORS.ink, 0.7).lineBetween(x + 6 * s, y - 10 * s, x + 10 * s, y - 2 * s);
  const feather = quality === "premium" ? 0xd9455f : 0x6fae6a;
  g.fillStyle(feather).fillEllipse(x + 11 * s, y + 1 * s, 6 * s, 10 * s).fillEllipse(x + 14 * s, y + 2 * s, 5 * s, 8 * s);
}

/**
 * Шафка з кормом (§9.12, «Кмітливість у бешкеті»): `t` — її верхня грань, `height` — висота лицьової. Відчинена котом — праві
 * дверцята розчахнуті, усередині темно; замок — на стику дверцят.
 */
export function drawCabinetExtras(g: Phaser.GameObjects.Graphics, t: { x: number; y: number; w: number; h: number }, height: number, open: boolean, lock: boolean): void {
  const cx = t.x + t.w / 2;
  const y0 = t.y + t.h;
  const y1 = y0 + height;
  if (open) {
    g.fillStyle(0x2a2428).fillRect(cx, y0 + 2, t.w / 2 - 1, height - 4);
    const right = t.x + t.w;
    const door = [
      [right, y0 + 1],
      [right + 13, y0 + 6],
      [right + 13, y1 - 2],
      [right, y1 - 1],
    ].map(([x, y]) => new Phaser.Math.Vector2(x!, y!));
    g.fillStyle(0xc49e6a).fillPoints(door, true);
    g.lineStyle(2, COLORS.ink).strokePoints(door, true);
  }
  if (lock) drawPadlock(g, open ? cx - 7 : cx, (y0 + y1) / 2 + 2, 1.2);
}

/** Перекинутий смітник (§9.12, «Кмітливість у бешкеті»): лежить на боці кришкою вперед, поки сміття не прибрали. */
export function drawTippedTrash(g: Phaser.GameObjects.Graphics, t: { x: number; y: number; w: number; h: number }, height: number): void {
  const floor = t.y + t.h + height;
  const w = t.w;
  g.fillStyle(0x5a625a).fillRoundedRect(t.x, floor - 18, w - 8, 18, 4);
  g.lineStyle(2.5, COLORS.ink).strokeRoundedRect(t.x, floor - 18, w - 8, 18, 4);
  g.fillStyle(0x3e453e).fillEllipse(t.x + w - 8, floor - 9, 10, 18);
  g.lineStyle(2, COLORS.ink).strokeEllipse(t.x + w - 8, floor - 9, 10, 18);
}

/** Навісний замочок (§9.12, «Кмітливість у бешкеті»): дужка й корпус; `x`, `y` — центр корпусу. */
export function drawPadlock(g: Phaser.GameObjects.Graphics, x: number, y: number, scale = 1): void {
  const s = scale;
  g.lineStyle(2 * s, 0x8c9aa6).beginPath().arc(x, y - 3 * s, 3.2 * s, Math.PI, 0).strokePath();
  g.fillStyle(0xe8b93a).fillRoundedRect(x - 4.5 * s, y - 3 * s, 9 * s, 7 * s, 1.5 * s);
  g.lineStyle(Math.max(1, 0.8 * s), COLORS.ink).strokeRoundedRect(x - 4.5 * s, y - 3 * s, 9 * s, 7 * s, 1.5 * s);
  g.fillStyle(COLORS.ink).fillCircle(x, y, 1 * s);
}

/** Шкарпетка (§9.12, «Подарунки й схованки»): смугаста, п'ятою вбік; `x`, `y` — центр. */
export function drawSock(g: Phaser.GameObjects.Graphics, x: number, y: number, scale = 1): void {
  const s = scale;
  const points = [
    [-4, -8], [3, -8], [3, 2], [8, 4], [8, 8], [-2, 8], [-4, 5],
  ].map(([dx, dy]) => new Phaser.Math.Vector2(x + dx! * s, y + dy! * s));
  g.fillStyle(0x5a7fc0).fillPoints(points, true);
  g.fillStyle(0xf3efe6).fillRect(x - 4 * s, y - 8 * s, 7 * s, 3 * s);
  g.lineStyle(Math.max(1, 0.8 * s), COLORS.ink).strokePoints(points, true);
}

/** Гілочка котячої м'яти (§9.12, «Котяча м'ята»): стеблинка й зубчасті листочки. */
export function drawCatnip(g: Phaser.GameObjects.Graphics, x: number, y: number, scale = 1): void {
  const s = scale;
  g.lineStyle(Math.max(1.5, 2 * s), 0x4f7f3a).lineBetween(x, y + 14 * s, x, y - 12 * s);
  for (const [dx, dy, flip] of [[0, -9, 1], [0, -2, -1], [0, 5, 1], [0, 10, -1]] as const) {
    const lx = x + dx * s + flip * 7 * s;
    const ly = y + dy * s;
    g.fillStyle(0x7fbf5a).fillEllipse(lx, ly, 13 * s, 7 * s);
    g.lineStyle(Math.max(1, 1.2 * s), COLORS.ink).strokeEllipse(lx, ly, 13 * s, 7 * s);
  }
  g.fillStyle(0x9ad07a).fillEllipse(x, y - 15 * s, 7 * s, 8 * s);
  g.lineStyle(Math.max(1, 1.2 * s), COLORS.ink).strokeEllipse(x, y - 15 * s, 7 * s, 8 * s);
}

/**
 * Рулон туалетного паперу на задній стіні ванної (§9.12, «Мисливський інстинкт»): тримач, а на ньому рулон; розмотаний —
 * порожня втулка й короткий хвостик паперу. `x`, `y` — точка стіни над підлогою.
 */
export function drawToiletRoll(g: Phaser.GameObjects.Graphics, x: number, y: number, down: boolean): void {
  const top = y - 26;
  g.lineStyle(2, COLORS.ink).lineBetween(x - 9, top, x + 9, top);
  if (down) {
    g.fillStyle(0xb9a27a).fillRect(x - 5, top - 3, 10, 6);
    g.lineStyle(1.5, COLORS.ink).strokeRect(x - 5, top - 3, 10, 6);
    g.lineStyle(3, 0xf8f6f0).lineBetween(x + 2, top + 3, x + 4, top + 12);
    return;
  }
  g.fillStyle(0xf8f6f0).fillRoundedRect(x - 8, top - 6, 16, 12, 4);
  g.lineStyle(1.5, COLORS.ink).strokeRoundedRect(x - 8, top - 6, 16, 12, 4);
  g.fillStyle(0xf8f6f0).fillRect(x + 3, top + 4, 5, 8);
  g.lineStyle(1, COLORS.ink, 0.6).strokeRect(x + 3, top + 4, 5, 8);
}

/**
 * Дрібничка зі столу (§9.12, «Скидання речей»): кухоль, телефон, ручка. `fallen` — лежить на підлозі: кухоль — на боці,
 * телефон — екраном догори, ручка — навскіс.
 */
export function drawTrinket(g: Phaser.GameObjects.Graphics, kind: TrinketKind, x: number, y: number, scale = 1, fallen = false): void {
  const s = scale;
  const line = s >= 2 ? 3 : 2;
  switch (kind) {
    case "mug": {
      const handle = { x: fallen ? x - 2 * s : x + 6 * s, y: fallen ? y - 9 * s : y - 6 * s };
      g.lineStyle(line, COLORS.ink).beginPath().arc(handle.x, handle.y, 3 * s, fallen ? Math.PI : -Math.PI / 2, fallen ? 0 : Math.PI / 2).strokePath();
      const body = fallen ? { x: x - 7 * s, y: y - 7 * s, w: 13 * s, h: 8 * s } : { x: x - 5 * s, y: y - 12 * s, w: 10 * s, h: 12 * s };
      g.fillStyle(0xd9455f).fillRoundedRect(body.x, body.y, body.w, body.h, 2 * s);
      // Відблиск на боці кухля.
      g.fillStyle(0xffffff, 0.8).fillRect(body.x + 2 * s, body.y + 2 * s, fallen ? 3 * s : 2 * s, fallen ? 2 * s : 5 * s);
      g.lineStyle(line, COLORS.ink).strokeRoundedRect(body.x, body.y, body.w, body.h, 2 * s);
      return;
    }
    case "phone":
      g.fillStyle(0x222026).fillRoundedRect(x - 6 * s, y - 4 * s, 12 * s, 7 * s, 1.5 * s);
      g.fillStyle(0x5fa8d3).fillRect(x - 4.5 * s, y - 2.8 * s, 9 * s, 4.6 * s);
      g.lineStyle(line - 0.5, COLORS.ink).strokeRoundedRect(x - 6 * s, y - 4 * s, 12 * s, 7 * s, 1.5 * s);
      return;
    case "pen": {
      const dx = (fallen ? 7 : 8) * s;
      const dy = (fallen ? 3 : 1) * s;
      g.lineStyle(3 * s, 0x4f7fb3).lineBetween(x - dx, y + dy, x + dx, y - dy);
      g.lineStyle(3 * s, COLORS.ink).lineBetween(x + dx - 2 * s, y - dy + 0.5 * s, x + dx, y - dy);
      return;
    }
  }
}

export function drawCatCorner(g: Phaser.GameObjects.Graphics, state: GameState): void {
  g.clear();
  // Шерсть: видно лише від межі, коли вона вже шкодить і дратує (§8.7, реалізація рішення автора А17); що більше, то більше жмутів.
  for (const spot of furTufts(state)) {
    const { x, y } = toScreen(spot);
    g.fillStyle(0xcfc6bd, 0.75).fillEllipse(x, y, 10, 5).fillEllipse(x + 5, y - 2, 7, 4);
  }
  for (const item of state.home.items) {
    // Іграшку в зубах малює кіт (§9.12, «Подарунки й схованки»).
    if (item.kind === "toy" && carriedToy(state, item)) continue;
    drawHomeItem(g, item, state.home.appliances.fountain !== null, item.kind === "bowl" ? (bowlEaten(state, item) ?? 0) : 0);
  }
  for (const mess of state.home.messes) drawMess(g, mess);
  // Скинуті дрібнички лежать на підлозі до ранку; розбитий кухоль — уламки, їх малює безлад (§9.12).
  for (const [kind, fallen] of Object.entries(state.home.trinkets ?? {}) as [TrinketKind, FallenTrinket | undefined][]) {
    if (!fallen || fallen.broken === true) continue;
    const { x, y } = toScreen(fallen);
    drawTrinket(g, kind, x, y, 1, true);
  }
  drawAppliances(g, state);
}

/**
 * Автогодівниця над місцем миски (§9.12): дешева — вузький сірий бункер, дорога — ширший світлий із
 * вогником. У віконці видно, скільки корму лишилося; бункер — у межах клітинки миски, бо позаду неї
 * може стояти ще одна миска.
 */
function drawFeeder(g: Phaser.GameObjects.Graphics, feeder: Feeder): void {
  const c = slotCenter(feeder.slot);
  const { x, y } = toScreen({ x: c.x, y: c.y + 0.05 });
  const premium = feeder.quality === "premium";
  const w = premium ? 22 : 16;
  const h = premium ? 21 : 19;
  const top = y - 4 - h;
  g.fillStyle(premium ? 0xf1ece2 : 0xb9bec4).fillRoundedRect(x - w / 2, top, w, h, premium ? 6 : 2);
  if (premium) g.fillStyle(0x4f7fb3).fillRect(x - w / 2, top + h - 5, w, 3);
  // Віконце: корм насипаний знизу на частку від повного бункера.
  const win = { x: x - (premium ? 5 : 3), y: top + 3, w: premium ? 10 : 6, h: h - (premium ? 10 : 7) };
  g.fillStyle(0x2b2530, 0.25).fillRect(win.x, win.y, win.w, win.h);
  const level = Math.min(1, feeder.food / FEEDER_CAPACITY[feeder.quality]);
  if (level > 0) {
    // Корм для стерилізованих — зеленуватий, як у мисці (§9.8).
    const kibble = feeder.sterile ? 0x6f8a3a : KIBBLE[feeder.foodQuality ?? "cheap"];
    const fill = Math.max(2, Math.round(win.h * level));
    g.fillStyle(kibble).fillRect(win.x, win.y + win.h - fill, win.w, fill);
  }
  g.lineStyle(1.5, COLORS.ink).strokeRect(win.x, win.y, win.w, win.h);
  // Розумна годівниця світиться: зелений — корм є, жовтий — бункер порожній.
  if (premium) g.fillStyle(level > 0 ? 0x5cbf5a : 0xe8b93a).fillCircle(x + 7.5, top + 5, 2);
  g.fillStyle(0x8c9aa6).fillRect(x - 3, top + h, 6, 4);
  g.lineStyle(2, COLORS.ink).strokeRoundedRect(x - w / 2, top, w, h, premium ? 6 : 2).strokeRect(x - 3, top + h, 6, 4);
}

/**
 * Техніка (§8.7) — видно, що вона є й що робить: автогодівниці над мисками, робот-пилосос на базі
 * чи в дорозі. Фонтанчики малює сама миска з водою.
 */
function drawAppliances(g: Phaser.GameObjects.Graphics, state: GameState): void {
  drawHousehold(g, state);
  const appliances = state.home.appliances;
  for (const feeder of state.home.feeders ?? []) drawFeeder(g, feeder);
  if (appliances.robot) {
    const dock = toScreen(ROBOT_DOCK);
    g.fillStyle(0x4a4448).fillRoundedRect(dock.x - 16, dock.y + 4, 32, 8, 3);
    const progress = robotProgress(state);
    const { x, y } = toScreen(robotAt(state));
    g.fillStyle(appliances.robot === "premium" ? 0x2f2f36 : 0x8c9aa6).fillEllipse(x, y, 30, 15);
    g.fillStyle(0xd8d4cc).fillEllipse(x, y - 3, 20, 9);
    // Вогник: зелений — їде, синій — заряджається на базі.
    g.fillStyle(progress === null ? 0x5fa8d3 : 0x5cbf5a).fillCircle(x, y - 4, 2.5);
    g.lineStyle(2, COLORS.ink).strokeEllipse(x, y, 30, 15);
  }
}

/** Біля дверей — переноска, якщо вона є (§8.5); біля пральної машини — кошик білизни (§8.7). */
const CARRIER_AT: Vec = CARRIER_SPOT;
const BASKET_AT: Vec = LAUNDRY_BASKET;

/**
 * Побут, видний у квартирі (ревізія 2026-10-22): переноска стоїть біля дверей — видно, що вона є;
 * кошик брудної білизни наповнюється, поки чистого одягу стає менше, і переповнюється, коли він
 * скінчився (§8.7): так видно, що час прати, ще до плям на одязі.
 */
function drawHousehold(g: Phaser.GameObjects.Graphics, state: GameState): void {
  const carrier = state.home.carrier;
  if (carrier) {
    const { x, y } = toScreen(CARRIER_AT);
    g.fillStyle(carrier === "premium" ? 0x8e4a6a : 0x9aa3ab).fillRoundedRect(x - 18, y - 22, 36, 24, 6);
    g.fillStyle(0x2b2530, 0.6).fillRoundedRect(x - 10, y - 16, 20, 12, 3);
    g.lineStyle(1.5, 0xd8d4cc).lineBetween(x - 5, y - 16, x - 5, y - 4).lineBetween(x, y - 16, x, y - 4).lineBetween(x + 5, y - 16, x + 5, y - 4);
    g.lineStyle(2, COLORS.ink).strokeRoundedRect(x - 18, y - 22, 36, 24, 6);
    g.lineStyle(3, COLORS.ink).beginPath().arc(x, y - 22, 8, Math.PI, 0).strokePath();
  }
  // Шкарпетка в котячій схованці за диваном (§9.12, «Подарунки й схованки»): видно п'ятку.
  if (state.home.sock === true) {
    const sock = toScreen(STASHES.sofa.at);
    drawSock(g, sock.x - 14, sock.y - 1, 0.9);
  }
  const { x, y } = toScreen(BASKET_AT);
  // Скільки днів одягу вже брудні: від порожнього кошика (5 і більше чистих днів) до гірки.
  const dirty = Math.max(0, Math.min(5, 5 - state.home.clothes));
  const colors = [0xc0675a, 0x5a7fc0, 0xe0c060, 0x6fae6a, 0x8e4a6a];
  for (let i = 0; i < dirty; i++) g.fillStyle(colors[i] ?? 0xc0675a).fillEllipse(x - 8 + (i % 3) * 8, y - 14 - Math.floor(i / 3) * 6, 14, 9);
  if (state.home.clothes <= 0) g.fillStyle(0xd8d4cc).fillEllipse(x + 12, y + 2, 12, 6).fillStyle(0xc0675a).fillEllipse(x - 14, y + 3, 10, 5);
  g.fillStyle(0xb98a57).fillRoundedRect(x - 14, y - 14, 28, 16, 4);
  g.lineStyle(1.5, 0x8b5e3c);
  for (const dx of [-7, 0, 7]) g.lineBetween(x + dx, y - 12, x + dx, y);
  g.lineStyle(2, COLORS.ink).strokeRoundedRect(x - 14, y - 14, 28, 16, 4);
}

/**
 * Річ котячого кутка. `eaten` — скільки порції вже з'їв кіт, що зараз їсть із миски (§9.12): корм меншає поступово, і
 * видно, хто ковтає за мить, а хто їсть по зернятку; надкльована половинка — менша купка.
 */
function drawHomeItem(g: Phaser.GameObjects.Graphics, item: HomeItem, fountain: boolean, eaten: number): void {
  const { x, y } = itemScreen(item);
  switch (item.kind) {
    case "bowl": {
      g.fillStyle(BOWL[item.quality]).fillEllipse(x, y, 30, 13);
      g.lineStyle(2, COLORS.ink).strokeEllipse(x, y, 30, 13);
      if (item.quality === "premium") g.lineStyle(1.5, 0xe8b93a).strokeEllipse(x, y - 1, 26, 10);
      const food = item.food - (item.half === true ? 0.5 : 0) - eaten;
      if (food > 0.02) {
        // Корм для стерилізованих — зеленуватий, щоб миски не плутати (§9.8).
        const kibble = item.sterile ? 0x6f8a3a : KIBBLE[item.foodQuality ?? "cheap"];
        const size = 0.3 + (0.7 * food) / BOWL_CAPACITY;
        g.fillStyle(kibble).fillEllipse(x, y - 2 * size, 20 * size, 8 * size);
      }
      return;
    }
    case "water": {
      g.fillStyle(BOWL[item.quality]).fillEllipse(x, y, 28, 12);
      g.lineStyle(2, COLORS.ink).strokeEllipse(x, y, 28, 12);
      if (item.water > 0) g.fillStyle(0x6fb3d6, 0.9).fillEllipse(x, y - 1, 22 * (0.5 + (0.5 * item.water) / WATER_CAPACITY), 7);
      if (fountain) {
        // Фонтанчик (§8.7): білий купол посередині й струмінь, що дугою падає у воду.
        g.fillStyle(0xf3efe6).fillEllipse(x, y - 4, 12, 10);
        g.lineStyle(1.5, COLORS.ink).strokeEllipse(x, y - 4, 12, 10);
        g.lineStyle(2, 0x9fd0ea).beginPath().arc(x + 6, y - 8, 6, Math.PI, Math.PI * 1.9).strokePath();
        g.beginPath().arc(x - 6, y - 8, 6, Math.PI * 1.1, 0).strokePath();
      }
      return;
    }
    case "toy":
      // Під диваном чи холодильником видно лише пір'їнку (§9.12, «Подарунки й схованки»).
      if (item.hidden !== undefined) {
        const feather = item.quality === "premium" ? 0xd9455f : 0x6fae6a;
        g.fillStyle(feather).fillEllipse(x, y, 9, 5).fillEllipse(x + 5, y + 1, 7, 4);
        g.lineStyle(1, COLORS.ink, 0.6).strokeEllipse(x, y, 9, 5);
        return;
      }
      drawToy(g, item.quality, x, y);
      return;
    case "litter": {
      const w = TILE_W * 0.78;
      const h = TILE_H * 0.62;
      g.fillStyle(item.quality === "premium" ? 0x6f8f8a : 0x8c9aa6).fillRoundedRect(x - w / 2, y - h / 2, w, h, 6);
      g.fillStyle(item.litter ? LITTER[item.litter] : 0x4a4448).fillRoundedRect(x - w / 2 + 4, y - h / 2 + 4, w - 8, h - 8, 4);
      g.lineStyle(2, COLORS.ink).strokeRoundedRect(x - w / 2, y - h / 2, w, h, 6);
      g.fillStyle(0x6b4a2b);
      for (let i = 0; i < Math.min(item.uses, 6); i++) g.fillCircle(x - w / 3 + ((i * 11) % (w * 0.66)), y - 3 + ((i * 7) % 9), 3.2);
      if (item.quality === "premium") {
        // «Закритий лоток»: дашок над задньою половиною, вхід — спереду.
        g.fillStyle(0x5f7d78).fillRoundedRect(x - w / 2, y - h / 2 - 10, w, h / 2 + 8, { tl: 14, tr: 14, bl: 2, br: 2 });
        g.lineStyle(2, COLORS.ink).strokeRoundedRect(x - w / 2, y - h / 2 - 10, w, h / 2 + 8, { tl: 14, tr: 14, bl: 2, br: 2 });
      }
      if (isDirty(item)) g.lineStyle(2, 0x7a8a3a, 0.8).lineBetween(x - 8, y - h / 2 - 2, x - 5, y - h / 2 - 12).lineBetween(x + 4, y - h / 2 - 2, x + 7, y - h / 2 - 12);
      return;
    }
    case "house": {
      // Будиночок: коробка з дахом і круглим входом; дорогий — м'який і яскравіший.
      const w = TILE_W * 0.7;
      const h = TILE_H * 0.55;
      const wall = item.quality === "premium" ? 0xc77d9a : 0xb59a72;
      g.fillStyle(wall).fillRect(x - w / 2, y - h, w, h);
      g.fillStyle(item.quality === "premium" ? 0x8e4a6a : 0x8a6e48).fillTriangle(x - w / 2 - 4, y - h, x + w / 2 + 4, y - h, x, y - h - 18);
      g.fillStyle(0x2b2530).fillEllipse(x, y - h * 0.38, w * 0.42, h * 0.62);
      g.lineStyle(2, COLORS.ink).strokeRect(x - w / 2, y - h, w, h).strokeTriangle(x - w / 2 - 4, y - h, x + w / 2 + 4, y - h, x, y - h - 18);
      return;
    }
    case "scratcher": {
      // Кігтеточка: стовпчик, обмотаний мотузкою, на підставці.
      g.fillStyle(0x8b6a4a).fillEllipse(x, y, 30, 12);
      g.fillStyle(item.quality === "premium" ? 0xe0c48a : 0xc8b08a).fillRect(x - 6, y - 40, 12, 40);
      g.lineStyle(1.5, 0x8a7350);
      for (let i = 1; i < 8; i++) g.lineBetween(x - 6, y - 40 + i * 5, x + 6, y - 38 + i * 5);
      if (item.quality === "premium") g.fillStyle(0xd9455f).fillEllipse(x, y - 44, 20, 8);
      g.lineStyle(2, COLORS.ink).strokeRect(x - 6, y - 40, 12, 40).strokeEllipse(x, y, 30, 12);
      return;
    }
  }
}

function drawMess(g: Phaser.GameObjects.Graphics, mess: Mess): void {
  const { x, y } = toScreen(mess);
  switch (mess.kind) {
    case "surprise":
      g.fillStyle(0x6b4a2b).fillEllipse(x, y, 16, 8).fillEllipse(x + 1, y - 4, 11, 6).fillEllipse(x, y - 7, 6, 4);
      g.lineStyle(1.5, COLORS.ink, 0.7).strokeEllipse(x, y, 16, 8);
      return;
    case "vomit":
      g.fillStyle(0xb5ad4a, 0.9).fillEllipse(x, y, 22, 10).fillEllipse(x + 8, y + 2, 9, 6).fillEllipse(x - 9, y - 1, 7, 5);
      return;
    case "hairball":
      g.fillStyle(0x8a7a68).fillEllipse(x, y - 2, 14, 9);
      g.lineStyle(1.5, 0x5a4c40).lineBetween(x - 6, y - 3, x + 5, y - 1).lineBetween(x - 4, y, x + 6, y - 4);
      return;
    case "litter":
      g.fillStyle(LITTER.cheap);
      for (const [dx, dy] of [[-10, 0], [-4, 3], [3, -2], [9, 2], [0, 5], [-7, -3], [6, 6]] as const) g.fillCircle(x + dx, y + dy, 2.2);
      return;
    case "puddle":
      // Калюжа від перекинутої миски з водою (§9.12, «Пиття»).
      g.fillStyle(0x6fb3d6, 0.6).fillEllipse(x, y, 30, 11).fillEllipse(x + 10, y + 3, 12, 6);
      g.lineStyle(1.5, 0x4f8fb3, 0.7).strokeEllipse(x, y, 30, 11);
      return;
    case "mark":
      g.fillStyle(0xd6c94a, 0.55).fillEllipse(x, y, 26, 10);
      g.lineStyle(1.5, 0xa89a2a, 0.7).strokeEllipse(x, y, 26, 10);
      return;
    case "fur":
      g.fillStyle(0xcfc6bd, 0.95).fillEllipse(x - 6, y, 12, 7).fillEllipse(x + 5, y - 2, 10, 6).fillEllipse(x + 1, y + 4, 9, 5);
      g.lineStyle(1, 0x8a7a68).lineBetween(x - 10, y, x - 2, y - 1).lineBetween(x + 1, y - 3, x + 9, y - 1);
      return;
    case "paper":
      // Розмотаний туалетний папір (§9.12, «Мисливський інстинкт»): біла стрічка петлями.
      g.lineStyle(4, 0xf8f6f0).beginPath().moveTo(x - 14, y + 2).lineTo(x - 7, y - 4).lineTo(x - 1, y + 3).lineTo(x + 6, y - 3).lineTo(x + 14, y + 1).strokePath();
      g.lineStyle(1, 0xb9b4aa).beginPath().moveTo(x - 14, y + 4).lineTo(x - 7, y - 2).lineTo(x - 1, y + 5).lineTo(x + 6, y - 1).lineTo(x + 14, y + 3).strokePath();
      g.fillStyle(0xf8f6f0).fillEllipse(x - 4, y + 1, 9, 6);
      return;
    case "garbage":
      // Сміття з перекинутого смітника (§9.12, «Кмітливість у бешкеті»): шкірка банана, папірці, обгортка.
      g.fillStyle(0x6b5d4a, 0.35).fillEllipse(x, y + 1, 30, 10);
      g.fillStyle(0xe8c34a).fillEllipse(x - 8, y, 12, 5);
      g.fillStyle(0xd8d4cc).fillRect(x + 1, y - 4, 7, 5).fillRect(x + 9, y - 1, 5, 4);
      g.fillStyle(0xc0675a).fillRect(x - 3, y + 2, 6, 3);
      g.lineStyle(1, COLORS.ink, 0.6).strokeRect(x + 1, y - 4, 7, 5);
      return;
    case "broken":
      g.fillStyle(0xf3efe6).fillTriangle(x - 10, y, x - 4, y - 6, x - 2, y + 2).fillTriangle(x + 2, y + 1, x + 9, y - 4, x + 10, y + 4);
      g.lineStyle(1.5, COLORS.ink).strokeTriangle(x - 10, y, x - 4, y - 6, x - 2, y + 2).strokeTriangle(x + 2, y + 1, x + 9, y - 4, x + 10, y + 4);
      return;
  }
}
