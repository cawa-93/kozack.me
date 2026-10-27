// Іконки баблів (§11.4): без тексту, один набір на всю гру. Поки що — прості заглушки,
// намальовані кодом чорнилом; згодом їх замінить ШІ-графіка (крок 16 плану).

import Phaser from "phaser";

import { drawCatnip, drawPadlock, drawSock, drawTrinket } from "./catcorner";
import { COLORS } from "./geometry";

export type IconName =
  | "mood-up"
  | "mood-down"
  | "alert"
  | "cross"
  | "camera"
  | "camera-missed"
  | "pot"
  | "meal"
  | "smoke"
  | "empty"
  | "food"
  | "soap"
  | "bell"
  | "box"
  | "moon"
  | "hands"
  | "drop"
  | "zz"
  | "dizzy"
  | "meow"
  | "meow-silent"
  | "sulk"
  | "heart"
  | "angry"
  | "dirty"
  | "thirst"
  | "bite"
  | "kibble"
  | "fight"
  | "sneeze"
  | "itch"
  | "eyes"
  | "pain"
  | "spit-pill"
  | "spit-drops"
  | "kibble-sterile"
  | "litter"
  | "shampoo"
  | "detergent"
  | "human-meds"
  | "pills"
  | "drops"
  | "treats"
  | "collar"
  | "mind"
  | "laundry"
  | "cat"
  | "cat-laptop"
  | "no-power"
  | "washer"
  | "mix"
  | "no-room"
  | "kit"
  | "palms"
  | "toy"
  | "taken"
  | "sad"
  | "loud"
  | "lick"
  | "cough"
  | "fur"
  | "mug"
  | "phone"
  | "pen"
  | "cat-box"
  | "claws"
  | "sock"
  | "bin-tipped"
  | "cabinet-open"
  | "lock"
  | "cat-high"
  | "wire"
  | "chew-wire"
  | "chew-bag"
  | "bored"
  | "catnip"
  | "bird"
  | "table"
  | "chilly"
  | "hot"
  | "mom-meal"
  | "hiss-bowl"
  | "hiss-litter"
  | "hiss-window"
  | "hiss-hand"
  | "hiss-kitten";

/**
 * Позначка поверх іконки (§11.4, правило автора 2026-10-25): «no» — перекреслено (сюди не можна,
 * не потрібно), «ask» — знак питання (потрібно це), «ok» — галочка (це вже є).
 */
export type Mark = "no" | "ask" | "ok";

/**
 * Вид бабла (§11.4, правка автора 2026-10-25): «say» — вголос (нявкання, дзвінок, річ «каже» про свій стан),
 * «think» — думка персонажа чи кота (що відчуває, хоче чи усвідомлює). Думка — лише над головою того, хто думає.
 */
export type BubbleKind = "say" | "think";

export const ICON_SIZE = 40;
export const BUBBLE_WIDTH = 52;
export const BUBBLE_HEIGHT = 52;
/** Хмаринка-думка ширша й вища за мовну: хвилястий край і кружечки під нею, тож висить трохи вище. */
const THOUGHT_WIDTH = 64;
const THOUGHT_HEIGHT = 71;
/** Центр хмаринки-думки від верху текстури. */
const THOUGHT_CENTER = 25;
/** Де центр іконки відносно вістря бабла (низу текстури). */
export const BUBBLE_ICON_Y: Record<BubbleKind, number> = { say: -BUBBLE_HEIGHT / 2 - 4, think: THOUGHT_CENTER - THOUGHT_HEIGHT };

const INK = COLORS.ink;
type Draw = (g: Phaser.GameObjects.Graphics) => void;

const ICONS = {
  alert: (g) => {
    g.fillStyle(COLORS.warning).fillRoundedRect(16, 5, 8, 21, 3).fillCircle(20, 33, 4.5);
  },
  cross: (g) => {
    g.lineStyle(7, COLORS.danger).lineBetween(9, 9, 31, 31).lineBetween(31, 9, 9, 31);
  },
  camera: (g) => {
    g.fillStyle(INK).fillRoundedRect(5, 12, 22, 17, 4).fillTriangle(27, 20, 36, 13, 36, 28);
    g.fillStyle(COLORS.danger).fillCircle(11, 17, 2.5);
  },
  "camera-missed": (g) => {
    ICONS.camera(g);
    g.lineStyle(4, COLORS.danger).lineBetween(5, 34, 35, 6);
  },
  pot: (g) => {
    g.lineStyle(2.5, INK).beginPath().arc(14, 11, 3, Math.PI, 0).strokePath();
    g.beginPath().arc(24, 9, 3, Math.PI, 0).strokePath();
    g.fillStyle(INK).fillRoundedRect(7, 18, 26, 15, 4).fillRect(3, 19, 34, 3);
  },
  meal: (g) => {
    g.fillStyle(0xe0893a).fillEllipse(20, 22, 22, 12);
    g.fillStyle(0xffffff).fillEllipse(20, 27, 32, 10);
    g.lineStyle(2.5, INK).strokeEllipse(20, 27, 32, 10);
    g.lineStyle(2.5, COLORS.good).lineBetween(12, 10, 17, 15).lineBetween(17, 15, 28, 5);
  },
  smoke: (g) => {
    g.fillStyle(0x4a4448).fillCircle(14, 22, 8).fillCircle(24, 17, 9).fillCircle(26, 27, 7).fillCircle(16, 30, 6);
  },
  empty: (g) => {
    g.lineStyle(3, INK).strokeRoundedRect(8, 9, 24, 24, 3);
    g.lineStyle(4, COLORS.danger).lineBetween(6, 35, 34, 7);
  },
  food: (g) => {
    g.fillStyle(0xe0893a).fillEllipse(20, 19, 20, 11);
    g.fillStyle(0xffffff).fillEllipse(20, 24, 30, 10);
    g.lineStyle(2.5, INK).strokeEllipse(20, 24, 30, 10);
  },
  soap: (g) => {
    g.fillStyle(0x8fc3d6).fillRoundedRect(12, 14, 16, 20, 4);
    g.lineStyle(2.5, INK).strokeRoundedRect(12, 14, 16, 20, 4).lineBetween(20, 14, 20, 7).lineBetween(20, 7, 27, 7);
  },
  bell: (g) => {
    g.fillStyle(0xe8b93a).fillTriangle(8, 29, 32, 29, 20, 8).fillCircle(20, 15, 8);
    g.fillStyle(INK).fillCircle(20, 32, 3.5);
    g.lineStyle(2.5, INK).lineBetween(6, 29, 34, 29);
  },
  box: (g) => {
    g.fillStyle(0xb98a57).fillRect(7, 12, 26, 20);
    g.lineStyle(2.5, INK).strokeRect(7, 12, 26, 20);
    g.lineStyle(4, 0xe8d3a6).lineBetween(20, 12, 20, 32);
  },
  moon: (g) => {
    g.fillStyle(0xe8d27a).fillCircle(20, 20, 13);
    g.fillStyle(0xffffff).fillCircle(26, 15, 11);
  },
  hands: (g) => {
    g.fillStyle(0xe8c39e).fillRoundedRect(11, 16, 18, 18, 5);
    for (const x of [11, 16, 21, 26]) g.fillRoundedRect(x, 6, 4.5, 14, 2);
    g.lineStyle(4, COLORS.danger).lineBetween(6, 34, 34, 6);
  },
  drop: (g) => {
    g.fillStyle(0x6fb3d6).fillTriangle(20, 5, 10, 22, 30, 22).fillCircle(20, 25, 10);
  },
  zz: (g) => {
    g.lineStyle(3.5, INK);
    g.strokePoints([new Phaser.Math.Vector2(6, 16), new Phaser.Math.Vector2(18, 16), new Phaser.Math.Vector2(6, 30), new Phaser.Math.Vector2(18, 30)]);
    g.strokePoints([new Phaser.Math.Vector2(22, 8), new Phaser.Math.Vector2(34, 8), new Phaser.Math.Vector2(22, 22), new Phaser.Math.Vector2(34, 22)]);
  },
  dizzy: (g) => {
    g.lineStyle(3, 0x8a5cc0).beginPath();
    for (let i = 0; i <= 40; i++) {
      const angle = i * 0.45;
      const radius = 2 + i * 0.35;
      const x = 20 + Math.cos(angle) * radius;
      const y = 20 + Math.sin(angle) * radius;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokePath();
  },
} as Record<IconName, Draw>;

/** Іконки котів (§11.4): нявкання, сердечко, невдоволення, брудний лоток, немає води, укус, голод. */
Object.assign(ICONS, {
  meow: (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(0x6b5d6e).fillTriangle(9, 16, 15, 4, 19, 14).fillTriangle(31, 16, 25, 4, 21, 14).fillCircle(20, 22, 12);
    g.fillStyle(0xffffff).fillCircle(15, 19, 2.5).fillCircle(25, 19, 2.5);
    g.fillStyle(COLORS.danger).fillEllipse(20, 28, 7, 6);
  },
  "meow-silent": (g: Phaser.GameObjects.Graphics) => {
    // Беззвучне нявкання «Тихоні» (§9.12): та сама котяча голова з відкритим ротом, але рот порожній, а звуку — лише
    // три крапки.
    g.fillStyle(0x6b5d6e).fillTriangle(9, 16, 15, 4, 19, 14).fillTriangle(31, 16, 25, 4, 21, 14).fillCircle(20, 22, 12);
    g.fillStyle(0xffffff).fillCircle(15, 19, 2.5).fillCircle(25, 19, 2.5);
    g.fillStyle(0x3a3140).fillEllipse(20, 28, 7, 6);
    g.fillStyle(0x6b5d6e).fillCircle(26, 36, 2.2).fillCircle(31, 36, 2.2).fillCircle(36, 36, 2.2);
  },
  sulk: (g: Phaser.GameObjects.Graphics) => {
    // Кіт дметься (§9.12): надуте личко із заплющеними очима, брови насуплені, рот рискою, а збоку — пара «пф».
    g.fillStyle(0xe9a66b).fillCircle(18, 22, 13);
    g.lineStyle(2.5, INK).strokeCircle(18, 22, 13);
    g.lineStyle(2, INK).lineBetween(10, 20, 15, 20).lineBetween(21, 20, 26, 20);
    g.lineBetween(9, 14, 15, 17).lineBetween(27, 14, 21, 17);
    g.lineStyle(2.5, INK).lineBetween(14, 29, 22, 29);
    g.fillStyle(0xcfd8e0).fillCircle(33, 12, 4).fillCircle(37, 7, 2.8);
  },
  heart: (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(0xd9455f).fillCircle(14, 15, 7.5).fillCircle(26, 15, 7.5).fillTriangle(7, 18, 33, 18, 20, 34);
  },
  sad: (g: Phaser.GameObjects.Graphics) => {
    // Сумне личко (думка сумного кота, §11.4): брівки будиночком, кутики рота донизу, сльоза.
    g.fillStyle(0x8fb4d9).fillCircle(20, 21, 14);
    g.lineStyle(2.5, INK).strokeCircle(20, 21, 14);
    g.fillStyle(INK).fillCircle(15, 19, 1.8).fillCircle(25, 19, 1.8);
    g.lineStyle(2, INK).lineBetween(11, 15, 17, 12).lineBetween(29, 15, 23, 12);
    g.lineStyle(2.5, INK).beginPath().arc(20, 32, 6, Math.PI * 1.15, Math.PI * 1.85).strokePath();
    g.fillStyle(0x5fa8d3).fillCircle(12, 27, 2.4).fillTriangle(9.8, 26.2, 14.2, 26.2, 12, 21.5);
  },
  angry: (g: Phaser.GameObjects.Graphics) => {
    g.lineStyle(4, COLORS.danger);
    for (const [x, y, a] of [[13, 13, 0], [27, 13, 1], [13, 27, 3], [27, 27, 2]] as const) {
      g.beginPath().arc(x, y, 6, (a * Math.PI) / 2, (a * Math.PI) / 2 + Math.PI / 2).strokePath();
    }
  },
  dirty: (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(0x6b4a2b).fillEllipse(20, 30, 20, 8).fillEllipse(20, 25, 13, 6).fillEllipse(20, 21, 7, 4);
    g.lineStyle(2.5, 0x7a8a3a).lineBetween(10, 16, 12, 6).lineBetween(20, 15, 21, 4).lineBetween(30, 16, 28, 6);
  },
  thirst: (g: Phaser.GameObjects.Graphics) => {
    ICONS.drop(g);
    g.lineStyle(4, COLORS.danger).lineBetween(6, 34, 34, 6);
  },
  bite: (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(COLORS.danger).fillRoundedRect(6, 10, 28, 20, 8);
    g.fillStyle(0xffffff).fillTriangle(9, 12, 14, 12, 11.5, 20).fillTriangle(17, 12, 22, 12, 19.5, 20).fillTriangle(25, 12, 30, 12, 27.5, 20);
    g.fillTriangle(13, 28, 18, 28, 15.5, 21).fillTriangle(22, 28, 27, 28, 24.5, 21);
  },
  kibble: (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(0x8a5a33).fillEllipse(20, 21, 22, 10);
    g.fillStyle(0x9aa3ab).fillEllipse(20, 27, 30, 11);
    g.lineStyle(2.5, INK).strokeEllipse(20, 27, 30, 11);
  },
  fight: (g: Phaser.GameObjects.Graphics) => {
    // Хмара бійки з зірочками.
    g.fillStyle(0xcfc6bd).fillCircle(14, 22, 9).fillCircle(24, 17, 10).fillCircle(27, 27, 8).fillCircle(16, 30, 7);
    g.lineStyle(2.5, COLORS.danger).lineBetween(8, 8, 12, 14).lineBetween(32, 6, 28, 13).lineBetween(34, 30, 29, 27);
  },
  sneeze: (g: Phaser.GameObjects.Graphics) => {
    // Бризки чхання.
    g.fillStyle(0x6fb3d6);
    for (const [x, y, r] of [[12, 14, 3.5], [22, 10, 3], [30, 18, 3.5], [18, 24, 3], [28, 29, 2.5], [10, 28, 2.5]] as const) g.fillCircle(x, y, r);
    g.lineStyle(2.5, INK).lineBetween(4, 20, 9, 20);
  },
  itch: (g: Phaser.GameObjects.Graphics) => {
    // Блоха й рисочки свербежу.
    g.fillStyle(0x5a3a22).fillEllipse(20, 22, 12, 9).fillCircle(26, 19, 3);
    g.lineStyle(2, 0x5a3a22).lineBetween(16, 25, 11, 31).lineBetween(20, 26, 19, 32).lineBetween(24, 25, 28, 31);
    g.lineStyle(2.5, COLORS.danger).lineBetween(8, 8, 12, 13).lineBetween(32, 8, 28, 13);
  },
  eyes: (g: Phaser.GameObjects.Graphics) => {
    // Око, що сльозиться.
    g.fillStyle(0xffffff).fillEllipse(20, 18, 26, 14);
    g.lineStyle(2.5, INK).strokeEllipse(20, 18, 26, 14);
    g.fillStyle(0xd9455f, 0.5).fillEllipse(20, 18, 24, 12);
    g.fillStyle(INK).fillCircle(20, 18, 4);
    g.fillStyle(0x6fb3d6).fillTriangle(14, 26, 18, 26, 16, 34);
  },
  pain: (g: Phaser.GameObjects.Graphics) => {
    // Біль (§9.5, Х6): кіт із сечокам'яною кричить у лотку — червоний зубчастий спалах зі знаком оклику.
    const points: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 16; i++) {
      const r = i % 2 === 0 ? 17 : 9;
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      points.push(new Phaser.Math.Vector2(20 + r * Math.cos(a), 20 + r * Math.sin(a)));
    }
    g.fillStyle(COLORS.danger).fillPoints(points, true);
    g.lineStyle(2, INK).strokePoints(points, true, true);
    g.fillStyle(0xffffff).fillRoundedRect(18, 10, 4, 12, 1.5).fillCircle(20, 26.5, 2.3);
  },
  "spit-pill": (g: Phaser.GameObjects.Graphics) => {
    // Кіт випльовує таблетку (§9.5, Х3): таблетка вилітає праворуч, позаду рисочки руху й бризки слини.
    g.fillStyle(0xffffff).fillCircle(27, 20, 8);
    g.lineStyle(2.5, INK).strokeCircle(27, 20, 8).lineBetween(21.5, 20, 32.5, 20);
    g.lineStyle(2.5, INK).lineBetween(5, 14, 14, 15).lineBetween(3, 20, 14, 20).lineBetween(5, 26, 14, 25);
    g.fillStyle(0x6fb3d6).fillCircle(18, 32, 2).fillCircle(24, 34, 1.6).fillCircle(12, 33, 1.4);
  },
  "spit-drops": (g: Phaser.GameObjects.Graphics) => {
    // Кіт струшує краплі (§9.5, Х3): краплі розлітаються дугою, позаду рисочки руху.
    g.fillStyle(0x6fb3d6);
    for (const [x, y] of [[22, 10], [30, 17], [32, 27], [24, 32]] as const) g.fillCircle(x, y, 3.5).fillTriangle(x - 3.2, y - 1, x + 3.2, y - 1, x - 5, y - 7);
    g.lineStyle(2.5, INK).lineBetween(5, 14, 13, 16).lineBetween(3, 21, 13, 21).lineBetween(5, 28, 13, 26);
  },
  fur: (g: Phaser.GameObjects.Graphics) => {
    // Жмут шерсті на долоні (§9.12): долоня, а над нею пухнастий клубок з волосинками, що розлітаються.
    g.fillStyle(0xe8c39e).fillRoundedRect(9, 24, 22, 12, 5);
    g.fillStyle(0xcfc6bd).fillCircle(16, 20, 6).fillCircle(23, 18, 7).fillCircle(27, 23, 5);
    g.lineStyle(1.5, 0x8a7a68).lineBetween(12, 13, 15, 16).lineBetween(22, 8, 22, 12).lineBetween(31, 13, 28, 16).lineBetween(34, 20, 31, 21);
  },
  cough: (g: Phaser.GameObjects.Graphics) => {
    // Кахикання перед шерстяною грудкою (§9.12): клубок шерсті й три хвилі звуку «кх» над ним.
    g.fillStyle(0x8a7a68).fillEllipse(22, 28, 18, 12);
    g.lineStyle(2, 0x5a4c40).lineBetween(15, 27, 28, 29).lineBetween(17, 31, 29, 25);
    g.lineStyle(3, INK);
    for (const [x, r] of [[10, 5], [20, 6], [30, 5]] as const) g.beginPath().arc(x, 14, r, Math.PI * 1.15, Math.PI * 1.85).strokePath();
  },
} satisfies Partial<Record<IconName, Draw>>);

/** Іконки запасів (§6.4): над сховищем і над персонажем, коли запас витрачено. */
Object.assign(ICONS, {
  "kibble-sterile": (g: Phaser.GameObjects.Graphics) => {
    ICONS.kibble(g);
    g.fillStyle(0x4f86c6).fillCircle(31, 9, 6);
    g.fillStyle(0xffffff).fillRect(28, 8, 6, 2);
  },
  litter: (g: Phaser.GameObjects.Graphics) => {
    // Мішок із гірочкою гранул.
    g.fillStyle(0xcdb98f).fillRoundedRect(9, 10, 22, 24, 5);
    g.lineStyle(2.5, INK).strokeRoundedRect(9, 10, 22, 24, 5).lineBetween(14, 10, 26, 10);
    g.fillStyle(0x8a7a5a);
    for (const [x, y] of [[16, 22], [20, 20], [24, 23], [18, 27], [23, 28]] as const) g.fillCircle(x, y, 2);
  },
  shampoo: (g: Phaser.GameObjects.Graphics) => {
    // Пляшка з лапкою.
    g.fillStyle(0xd98fb8).fillRoundedRect(12, 12, 16, 22, 5).fillRect(16, 6, 8, 7);
    g.lineStyle(2.5, INK).strokeRoundedRect(12, 12, 16, 22, 5);
    g.fillStyle(0xffffff).fillCircle(20, 25, 3.5).fillCircle(16, 20, 1.6).fillCircle(20, 18, 1.6).fillCircle(24, 20, 1.6);
  },
  detergent: (g: Phaser.GameObjects.Graphics) => {
    // Коробка порошку з бульбашками.
    g.fillStyle(0xe8a33a).fillRect(9, 14, 22, 20);
    g.lineStyle(2.5, INK).strokeRect(9, 14, 22, 20);
    g.fillStyle(0x8fc3d6).fillCircle(15, 9, 4).fillCircle(24, 7, 3).fillCircle(27, 13, 2.5);
  },
  "human-meds": (g: Phaser.GameObjects.Graphics) => {
    // Капсула: половина червона, половина біла.
    g.fillStyle(COLORS.danger).fillRoundedRect(6, 14, 15, 13, 6);
    g.fillStyle(0xffffff).fillRoundedRect(19, 14, 15, 13, 6);
    g.lineStyle(2.5, INK).strokeRoundedRect(6, 14, 28, 13, 6);
  },
  pills: (g: Phaser.GameObjects.Graphics) => {
    // Кругла таблетка з рискою й лапкою: для котів.
    g.fillStyle(0xffffff).fillCircle(18, 22, 11);
    g.lineStyle(2.5, INK).strokeCircle(18, 22, 11).lineBetween(10, 22, 26, 22);
    g.fillStyle(0x6b4a2b).fillCircle(31, 9, 3).fillCircle(28, 5, 1.4).fillCircle(32, 4, 1.4).fillCircle(35, 6, 1.4);
  },
  drops: (g: Phaser.GameObjects.Graphics) => {
    // Флакончик із піпеткою.
    g.fillStyle(0x9ad0c2).fillRoundedRect(12, 18, 16, 16, 4);
    g.fillStyle(INK).fillRect(16, 10, 8, 8).fillRect(18, 4, 4, 7);
    g.fillStyle(0x6fb3d6).fillCircle(31, 30, 3.5);
  },
  treats: (g: Phaser.GameObjects.Graphics) => {
    // Рибка.
    g.fillStyle(0xe0893a).fillEllipse(18, 20, 22, 13).fillTriangle(28, 20, 36, 12, 36, 28);
    g.fillStyle(INK).fillCircle(12, 18, 2);
  },
  collar: (g: Phaser.GameObjects.Graphics) => {
    // Нашийник із жетоном.
    g.lineStyle(5, COLORS.danger).strokeCircle(20, 17, 11);
    g.fillStyle(0xe8b93a).fillCircle(20, 31, 5);
  },
} satisfies Partial<Record<IconName, Draw>>);

/** Брудний одяг (§8.7): зім'ята сорочка з хвилями запаху — так колеги бачать його на відеодзвінку. */
Object.assign(ICONS, {
  laundry: (g: Phaser.GameObjects.Graphics) => {
    const v = (points: [number, number][]) => points.map(([x, y]) => new Phaser.Math.Vector2(x, y));
    const shirt = v([[12, 14], [16, 11], [24, 11], [28, 14], [33, 18], [29, 22], [27, 20], [27, 33], [13, 33], [13, 20], [11, 22], [7, 18]]);
    g.fillStyle(0xc9b28a).fillPoints(shirt, true);
    g.lineStyle(2.5, INK).strokePoints(shirt, true);
    g.fillStyle(0x8a7a5a).fillCircle(17, 25, 2).fillCircle(23, 29, 1.6);
    g.lineStyle(2, 0x7a8a3a);
    for (const x of [14, 20, 26]) g.beginPath().arc(x, 6, 2.5, Math.PI * 0.5, Math.PI * 1.5).strokePath();
  },
} satisfies Partial<Record<IconName, Draw>>);

/** Настрій кота (§9.12): зелене сердечко — подобається, червоне з тріщиною — ні. Без бабла, з контуром. */
const moodHeart = (g: Phaser.GameObjects.Graphics, color: number): void => {
  // Спершу чорнильне сердечко трохи більше, зверху — кольорове: виходить контур.
  g.fillStyle(INK).fillCircle(13.5, 14.5, 9.5).fillCircle(26.5, 14.5, 9.5).fillTriangle(4.5, 18, 35.5, 18, 20, 37);
  g.fillStyle(color).fillCircle(13.5, 14.5, 7).fillCircle(26.5, 14.5, 7).fillTriangle(7.5, 17.5, 32.5, 17.5, 20, 33);
};
Object.assign(ICONS, {
  "mood-up": (g: Phaser.GameObjects.Graphics) => {
    moodHeart(g, 0x5cbf5a);
    g.fillStyle(0xffffff, 0.75).fillCircle(11.5, 12.5, 2.4);
  },
  "mood-down": (g: Phaser.GameObjects.Graphics) => {
    moodHeart(g, 0xd8453f);
    // Тріщина-зигзаг через усе сердечко.
    g.lineStyle(3, INK).beginPath().moveTo(20, 9).lineTo(17, 16).lineTo(22.5, 21).lineTo(18.5, 27).lineTo(20, 33).strokePath();
  },
} satisfies Partial<Record<IconName, Draw>>);

/** Здоровий глузд (§6): спокійна голова з думкою — для шкали на панелі. */
Object.assign(ICONS, {
  mind: (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(0x9b7fd1).fillCircle(17, 23, 12);
    g.fillStyle(0xffffff).fillCircle(29, 10, 5).fillCircle(24, 7, 3);
    g.lineStyle(2.5, INK).strokeCircle(17, 23, 12);
    g.lineStyle(2, 0xffffff).beginPath().arc(17, 23, 5, Math.PI * 0.2, Math.PI * 1.6).strokePath();
  },
} satisfies Partial<Record<IconName, Draw>>);

/** Іконки відмов (§11.4, правило автора 2026-10-25): кожна причина — своя, ні з чим не сплутати. */
Object.assign(ICONS, {
  cat: (g: Phaser.GameObjects.Graphics) => {
    // Кіт сидить: голова з вухами, тулуб, хвіст. Без рота — щоб не плутати з нявканням.
    g.lineStyle(4, 0x6b5d6e).beginPath().arc(30, 26, 7, Math.PI * 0.5, Math.PI * 1.6, true).strokePath();
    g.fillStyle(0x6b5d6e).fillEllipse(19, 29, 22, 16).fillTriangle(11, 12, 14, 2, 18, 9).fillTriangle(27, 12, 24, 2, 20, 9).fillCircle(19, 14, 9);
    g.fillStyle(0xffffff).fillCircle(15.5, 13, 2).fillCircle(22.5, 13, 2);
  },
  "cat-laptop": (g: Phaser.GameObjects.Graphics) => {
    // Ноутбук, а на клавіатурі розлігся кіт (§9.12).
    g.fillStyle(0x9fc3d6).fillRect(9, 4, 22, 15);
    g.lineStyle(2.5, INK).strokeRect(9, 4, 22, 15);
    g.fillStyle(INK).fillRect(4, 19, 32, 4);
    g.fillStyle(0x6b5d6e).fillEllipse(22, 25, 26, 11).fillCircle(9, 24, 6.5).fillTriangle(4, 21, 5, 14, 9, 18).fillTriangle(14, 21, 13, 14, 9, 18);
    g.lineStyle(3.5, 0x6b5d6e).lineBetween(34, 26, 37, 34);
    g.fillStyle(0xffffff).fillCircle(7, 24, 1.4).fillCircle(11, 24, 1.4);
  },
  claws: (g: Phaser.GameObjects.Graphics) => {
    // Подряпина (§9.12, «Переноска»): три червоні смуги від кігтів навскіс.
    g.lineStyle(4, COLORS.danger);
    for (const dx of [-8, 0, 8]) g.lineBetween(12 + dx, 8, 26 + dx, 32);
  },
  sock: (g: Phaser.GameObjects.Graphics) => drawSock(g, 20, 20, 2),
  "bin-tipped": (g: Phaser.GameObjects.Graphics) => {
    // Смітник на боці, з якого висипалося сміття (§9.12, «Кмітливість у бешкеті»).
    g.fillStyle(0x707a70).fillRoundedRect(4, 14, 22, 16, 3);
    g.lineStyle(2.5, INK).strokeRoundedRect(4, 14, 22, 16, 3);
    g.fillStyle(0x4e564e).fillEllipse(27, 22, 6, 16);
    g.fillStyle(0xe8c34a).fillEllipse(32, 32, 9, 4);
    g.fillStyle(0xd8d4cc).fillRect(28, 26, 6, 4).fillRect(34, 24, 4, 5);
    g.fillStyle(0x8a5a33).fillCircle(24, 34, 2.5);
  },
  "cabinet-open": (g: Phaser.GameObjects.Graphics) => {
    // Шафка з прочиненими дверцятами, у темряві — пачка корму (§9.12, «Кмітливість у бешкеті»).
    g.fillStyle(0xb08a5a).fillRect(6, 6, 24, 30);
    g.fillStyle(0x2a2428).fillRect(18, 9, 10, 24);
    g.fillStyle(0xe8b93a).fillRoundedRect(20, 18, 7, 12, 2);
    g.fillStyle(0xd2b080).fillPoints([new Phaser.Math.Vector2(30, 6), new Phaser.Math.Vector2(37, 10), new Phaser.Math.Vector2(37, 32), new Phaser.Math.Vector2(30, 36)], true);
    g.lineStyle(2.5, INK).strokeRect(6, 6, 24, 30).lineBetween(18, 6, 18, 36);
    g.lineStyle(2, INK).strokePoints([new Phaser.Math.Vector2(30, 6), new Phaser.Math.Vector2(37, 10), new Phaser.Math.Vector2(37, 32), new Phaser.Math.Vector2(30, 36)], true);
  },
  lock: (g: Phaser.GameObjects.Graphics) => drawPadlock(g, 20, 22, 2),
  wire: (g: Phaser.GameObjects.Graphics) => {
    // Перегризений дріт (§9.12, «Гризіння»): два кінці кабелю з мідними жилками, а між ними — іскра.
    g.lineStyle(5, INK).lineBetween(3, 30, 15, 22).lineBetween(25, 18, 37, 10);
    g.lineStyle(2, 0xd9822b).lineBetween(15, 22, 18, 20).lineBetween(22, 19, 25, 18);
    g.fillStyle(0xe8b93a).fillPoints([[20, 9], [23, 17], [29, 18], [23, 21], [20, 30], [18, 22], [11, 20], [18, 17]].map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
  },
  "chew-wire": (g: Phaser.GameObjects.Graphics) => {
    // Кіт гризе дріт (§9.12, «Гризіння»): кабель, а на ньому сліди зубів.
    g.lineStyle(5, INK).beginPath().moveTo(3, 28).lineTo(14, 22).lineTo(26, 24).lineTo(37, 16).strokePath();
    g.fillStyle(0xffffff);
    for (const [x, y] of [[16, 19], [20, 19], [24, 20], [16, 26], [20, 26], [24, 27]] as const) g.fillTriangle(x - 1.8, y, x + 1.8, y, x, y + (y < 23 ? 3 : -3));
  },
  "chew-bag": (g: Phaser.GameObjects.Graphics) => {
    // Кіт гризе пакет (§9.12, «Гризіння»): пакет із надкушеним кутом, з якого сиплеться корм.
    g.fillStyle(0xd9c7a0).fillPoints([[8, 8], [30, 8], [30, 20], [26, 24], [30, 28], [30, 36], [8, 36]].map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
    g.lineStyle(2.5, INK).strokePoints([[8, 8], [30, 8], [30, 20], [26, 24], [30, 28], [30, 36], [8, 36]].map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
    g.fillStyle(0x8a5a33).fillCircle(33, 26, 2).fillCircle(35, 31, 2).fillCircle(32, 34, 1.8);
  },
  "cat-high": (g: Phaser.GameObjects.Graphics) => {
    // Висока шафа, а на ній — кіт; рука до нього не дістає (§9.12, «Лазіння»).
    g.fillStyle(0x8a6e48).fillRect(16, 16, 18, 22);
    g.lineStyle(2.5, INK).strokeRect(16, 16, 18, 22).lineBetween(25, 16, 25, 38);
    g.fillStyle(0x6b5d6e).fillEllipse(25, 11, 16, 9).fillCircle(31, 7, 4.5).fillTriangle(28, 5, 29, 0, 31, 3).fillTriangle(34, 5, 33, 0, 31, 3);
    g.fillStyle(0xe8c39e).fillRoundedRect(2, 26, 9, 10, 3).fillRoundedRect(4, 18, 4, 10, 2);
    g.lineStyle(2, COLORS.danger).lineBetween(7, 14, 12, 9).lineBetween(12, 9, 13, 14);
  },
  "cat-box": (g: Phaser.GameObjects.Graphics) => {
    // Картонна коробка, а з неї визирає кіт — вуха й очі (§9.12, «Допитливість»).
    g.fillStyle(0x6b5d6e).fillCircle(20, 17, 9).fillTriangle(12, 13, 13, 4, 18, 10).fillTriangle(28, 13, 27, 4, 22, 10);
    g.fillStyle(0xffffff).fillCircle(16.5, 17, 1.8).fillCircle(23.5, 17, 1.8);
    g.fillStyle(0xc49a62).fillRect(5, 21, 30, 15);
    g.fillStyle(0xe8d9b0).fillRect(17, 21, 6, 15);
    g.lineStyle(2.5, INK).strokeRect(5, 21, 30, 15);
  },
  "no-power": (g: Phaser.GameObjects.Graphics) => {
    // Блискавка, перекреслена: світла немає (§4.1).
    const v = (points: [number, number][]) => points.map(([x, y]) => new Phaser.Math.Vector2(x, y));
    const bolt = v([[23, 3], [10, 22], [19, 22], [15, 37], [30, 16], [21, 16], [26, 3]]);
    g.fillStyle(0xe8b93a).fillPoints(bolt, true);
    g.lineStyle(2, INK).strokePoints(bolt, true);
    g.lineStyle(4, COLORS.danger).lineBetween(6, 34, 34, 6);
  },
  loud: (g: Phaser.GameObjects.Graphics) => {
    // Гучний звук (§9.12): гучномовець і три хвилі. Одним многокутником — без світлого шва між трикутниками.
    const speaker = [[5, 15], [10, 15], [19, 7], [19, 33], [10, 25], [5, 25]].map(([x, y]) => new Phaser.Math.Vector2(x, y));
    g.fillStyle(INK).fillPoints(speaker, true);
    g.lineStyle(3, COLORS.danger);
    for (const radius of [6, 11, 16]) g.beginPath().arc(19, 20, radius, -Math.PI / 4, Math.PI / 4).strokePath();
  },
  lick: (g: Phaser.GameObjects.Graphics) => {
    // Кіт нервово вилизується (§9.12): котячий ніс і рот «ω», з якого звисає рожевий язик, і краплина.
    const tongue = { tl: 0, tr: 0, bl: 7, br: 7 };
    g.fillStyle(0xe58fa2).fillRoundedRect(14, 15, 12, 21, tongue);
    g.lineStyle(3, INK).strokeRoundedRect(14, 15, 12, 21, tongue).lineBetween(20, 20, 20, 31);
    g.fillStyle(0xd9708a).fillTriangle(15, 1, 25, 1, 20, 6);
    g.lineStyle(3, INK).lineBetween(20, 6, 20, 9);
    g.beginPath().arc(14.5, 9, 5.5, 0, Math.PI).strokePath();
    g.beginPath().arc(25.5, 9, 5.5, 0, Math.PI).strokePath();
    g.fillStyle(0x8fc6e8).fillCircle(34, 32, 3.5).fillTriangle(30.8, 31, 37.2, 31, 34, 25);
  },
  washer: (g: Phaser.GameObjects.Graphics) => {
    // Пральна машина: барабан із бульбашками й стрілкою обертання — пере.
    g.fillStyle(0xf3efe6).fillRoundedRect(7, 4, 26, 32, 3);
    g.lineStyle(2.5, INK).strokeRoundedRect(7, 4, 26, 32, 3).lineBetween(7, 11, 33, 11);
    g.fillStyle(0x6fb3d6).fillCircle(20, 23, 8.5);
    g.lineStyle(2.5, INK).strokeCircle(20, 23, 8.5);
    g.lineStyle(2, 0xffffff).beginPath().arc(20, 23, 4.5, Math.PI * 0.1, Math.PI * 1.4).strokePath();
    g.fillStyle(INK).fillCircle(12, 7.5, 1.6).fillCircle(17, 7.5, 1.6);
  },
  mix: (g: Phaser.GameObjects.Graphics) => {
    // Миска, у якій навпіл два різні корми (§6.4).
    g.fillStyle(0x8a5a33).fillEllipse(14, 21, 14, 10);
    g.fillStyle(0x6f8a3a).fillEllipse(26, 21, 14, 10);
    g.lineStyle(1.5, 0xffffff).lineBetween(20, 16, 20, 25);
    g.fillStyle(0x9aa3ab).fillEllipse(20, 27, 30, 11);
    g.lineStyle(2.5, INK).strokeEllipse(20, 27, 30, 11);
  },
  "no-room": (g: Phaser.GameObjects.Graphics) => {
    // Шафа, де всі полиці повні, і зверху вже не влазить коробка (§6.4).
    g.fillStyle(0xb98a57).fillRect(4, 12, 27, 25);
    g.lineStyle(2.5, INK).strokeRect(4, 12, 27, 25).lineBetween(4, 24, 31, 24);
    const goods = [0xd98fb8, 0x8fc3d6, 0xe8a33a, 0x9ad0c2, 0xe0893a, 0xcdb98f];
    goods.forEach((color, i) => g.fillStyle(color).fillRect(6 + (i % 3) * 8.3, i < 3 ? 15 : 27, 6.6, 8));
    g.fillStyle(0xe8d3a6).fillRect(10, 2, 14, 9);
    g.lineStyle(2, INK).strokeRect(10, 2, 14, 9);
    g.fillStyle(COLORS.danger).fillRoundedRect(33, 4, 4.5, 11, 1.5).fillCircle(35.25, 19, 2.3);
  },
  kit: (g: Phaser.GameObjects.Graphics) => {
    // Аптечка з ручкою й хрестом (§8.7).
    g.lineStyle(3, INK).strokeRoundedRect(14, 6, 12, 8, 3);
    g.fillStyle(0xffffff).fillRoundedRect(5, 12, 30, 23, 4);
    g.lineStyle(2.5, INK).strokeRoundedRect(5, 12, 30, 23, 4);
    g.fillStyle(COLORS.danger).fillRect(17, 16, 6, 15).fillRect(12.5, 20.5, 15, 6);
  },
  palms: (g: Phaser.GameObjects.Graphics) => {
    // Дві розкриті порожні долоні: у руках нічого.
    for (const [x, thumb] of [[3, 1], [22, -1]] as const) {
      g.fillStyle(INK).fillRoundedRect(x - 1.5, 21.5, 18, 15, 6);
      for (const f of [0, 4.3, 8.6]) g.fillRoundedRect(x + f + 0.5, 12.5, 6, 13, 3);
      g.fillStyle(0xe8c39e).fillRoundedRect(x, 23, 15, 12, 5);
      for (const f of [0, 4.3, 8.6]) g.fillRoundedRect(x + f + 2, 14, 3, 12, 1.5);
      // Великий палець — убік.
      const tx = thumb > 0 ? x + 15 : x - 4;
      g.fillStyle(INK).fillRoundedRect(tx - 1, 23, 6, 9, 3);
      g.fillStyle(0xe8c39e).fillRoundedRect(tx + 0.5, 24.5, 3, 6, 1.5);
    }
  },
  taken: (g: Phaser.GameObjects.Graphics) => {
    // Місце зайняте: на поверхні вже стоїть тарілка зі стравою.
    g.fillStyle(0x8b5e3c).fillRect(3, 26, 34, 5).fillRect(6, 31, 3.5, 7).fillRect(30.5, 31, 3.5, 7);
    g.lineStyle(2, INK).strokeRect(3, 26, 34, 5);
    g.fillStyle(0xe0893a).fillEllipse(20, 17, 16, 9);
    g.fillStyle(0xffffff).fillEllipse(20, 22, 26, 8);
    g.lineStyle(2, INK).strokeEllipse(20, 22, 26, 8);
    g.fillStyle(COLORS.danger).fillRoundedRect(33, 3, 4.5, 11, 1.5).fillCircle(35.25, 18.5, 2.3);
  },
  // Дрібнички на столах (§9.12, «Скидання речей»): ті самі, що лежать на столах і падають на підлогу.
  mug: (g: Phaser.GameObjects.Graphics) => drawTrinket(g, "mug", 18, 33, 2.3),
  phone: (g: Phaser.GameObjects.Graphics) => drawTrinket(g, "phone", 20, 22, 2.6),
  pen: (g: Phaser.GameObjects.Graphics) => drawTrinket(g, "pen", 20, 22, 1.8),
  toy: (g: Phaser.GameObjects.Graphics) => {
    // Іграшка-вудочка з пір'ям (§9.12).
    g.lineStyle(3, 0x8b5e3c).lineBetween(5, 34, 26, 10);
    g.lineStyle(1.5, INK, 0.8).lineBetween(26, 10, 30, 22);
    g.fillStyle(0xd9455f).fillEllipse(30, 26, 7, 12).fillEllipse(34, 27, 6, 10);
  },
} satisfies Partial<Record<IconName, Draw>>);

/** Іконки етапу «Гра й стосунки котів» (§9.12). */
Object.assign(ICONS, {
  bored: (g: Phaser.GameObjects.Graphics) => {
    // «Нудьгар» відвернувся від вудки (§9.12, «Ігривість»): котяча голова позіхає, очі-рисочки, а пір'їнка висить без діла.
    g.lineStyle(2, 0x8b5e3c).lineBetween(31, 2, 34, 14);
    g.fillStyle(0xd9455f).fillEllipse(34, 19, 5, 9);
    g.fillStyle(0x6b5d6e).fillTriangle(5, 17, 10, 5, 15, 14).fillTriangle(27, 17, 22, 5, 17, 14).fillCircle(16, 23, 12);
    g.lineStyle(2, 0xffffff).lineBetween(9, 20, 14, 20).lineBetween(18, 20, 23, 20);
    g.fillStyle(0xd9708a).fillEllipse(16, 29, 8, 9);
    g.lineStyle(1.5, INK).strokeEllipse(16, 29, 8, 9);
  },
  catnip: (g: Phaser.GameObjects.Graphics) => drawCatnip(g, 20, 21, 1),
  table: (g: Phaser.GameObjects.Graphics) => {
    // Кухонний стіл із кухлем (§9.12, «Слухняність»): туди котові не можна.
    g.fillStyle(0x8b5e3c).fillRect(3, 24, 34, 6).fillRect(6, 30, 4, 9).fillRect(30, 30, 4, 9);
    g.lineStyle(2, INK).strokeRect(3, 24, 34, 6);
    g.fillStyle(0xd9e4ea).fillRoundedRect(15, 11, 11, 13, 2);
    g.lineStyle(2, INK).strokeRoundedRect(15, 11, 11, 13, 2).beginPath().arc(27, 17, 3.5, -Math.PI / 2, Math.PI / 2).strokePath();
  },
  bird: (g: Phaser.GameObjects.Graphics) => {
    // Пташка за вікном (§9.12, «Вікно»): кругле тільце, крило, дзьобик і хвостик.
    g.fillStyle(0x8a6e48).fillTriangle(6, 18, 14, 22, 8, 28);
    g.fillStyle(0xb08a5a).fillEllipse(20, 23, 22, 15).fillCircle(29, 15, 7);
    g.fillStyle(0xe0893a).fillEllipse(19, 26, 12, 7);
    g.fillStyle(0x6b4a2b).fillEllipse(17, 20, 12, 6);
    g.fillStyle(0xe8b93a).fillTriangle(35, 13, 35, 18, 40, 15);
    g.fillStyle(INK).fillCircle(30, 13, 1.6);
    g.lineStyle(2, INK).strokeEllipse(20, 23, 22, 15).strokeCircle(29, 15, 7).lineBetween(17, 30, 16, 36).lineBetween(23, 30, 24, 36);
  },
} satisfies Partial<Record<IconName, Draw>>);

/** Іконки етапу «Тіло й завершення» (§9.12). */
Object.assign(ICONS, {
  chilly: (g: Phaser.GameObjects.Graphics) => {
    // Сніжинка (§9.12, «Теплолюбність»): теплолюб мерзне в «Холод».
    g.lineStyle(3.5, 0x6fa8d6);
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3 + Math.PI / 2;
      const dx = Math.cos(a) * 15;
      const dy = Math.sin(a) * 15;
      g.lineBetween(20 - dx, 20 - dy, 20 + dx, 20 + dy);
      for (const end of [1, -1]) {
        const tx = 20 + end * dx * 0.65;
        const ty = 20 + end * dy * 0.65;
        const b = a + (end > 0 ? 0 : Math.PI);
        g.lineBetween(tx, ty, tx + Math.cos(b + 0.7) * 6, ty + Math.sin(b + 0.7) * 6).lineBetween(tx, ty, tx + Math.cos(b - 0.7) * 6, ty + Math.sin(b - 0.7) * 6);
      }
    }
  },
  hot: (g: Phaser.GameObjects.Graphics) => {
    // Пекуче сонце й крапля поту (§9.12, «Теплолюбність»): «Не мерзне» знемагає в «Спеку».
    g.lineStyle(3, 0xe0893a);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      g.lineBetween(17 + Math.cos(a) * 11, 17 + Math.sin(a) * 11, 17 + Math.cos(a) * 16, 17 + Math.sin(a) * 16);
    }
    g.fillStyle(0xf2b53a).fillCircle(17, 17, 8);
    g.lineStyle(2, INK).strokeCircle(17, 17, 8);
    g.fillStyle(0x6fa8d6).fillTriangle(33, 24, 29, 31, 37, 31).fillCircle(33, 32, 4);
  },
} satisfies Partial<Record<IconName, Draw>>);

/** Мамині судочки (§4.1, §6.4, рішення автора 2026-10-26). */
Object.assign(ICONS, {
  "mom-meal": (g: Phaser.GameObjects.Graphics) => drawMomMeal(g, 20, 34, 1.25),
} satisfies Partial<Record<IconName, Draw>>);

/**
 * Шипіння з причиною (§9.4 «Згода, охорона й сварки», рішення автора 2026-10-26, Р2; §11.4): злість ліворуч угорі, а праворуч
 * унизу — значок причини: миска, лоток, вікно, рука чи кошеня.
 */
function hissWith(cause: Draw): Draw {
  return (g) => {
    // Злість — менша, але з товстою рискою, як і повна: інакше дужки злипаються в червоний хрестик.
    g.lineStyle(4, COLORS.danger);
    for (const [x, y, a] of [[8, 8, 0], [19, 8, 1], [8, 19, 3], [19, 19, 2]] as const) {
      g.beginPath().arc(x, y, 5, (a * Math.PI) / 2, (a * Math.PI) / 2 + Math.PI / 2).strokePath();
    }
    g.save().translateCanvas(15, 15).scaleCanvas(0.63, 0.63);
    cause(g);
    g.restore();
  };
}

/** Лоток збоку: сірий піддон із наповнювачем. */
const tray: Draw = (g) => {
  g.fillStyle(0x8c9aa6).fillRoundedRect(3, 17, 34, 17, 5);
  g.fillStyle(0xd6c6a2).fillRoundedRect(7, 14, 26, 8, 3);
  g.lineStyle(2.5, INK).strokeRoundedRect(3, 17, 34, 17, 5);
  g.fillStyle(0x8a7a5a);
  for (const [x, y] of [[12, 17], [19, 16], [26, 17]] as const) g.fillCircle(x, y, 1.8);
};

/** Вікно: рама з хрестом і блакитне скло. */
const pane: Draw = (g) => {
  g.fillStyle(0xbfe1f2).fillRect(6, 5, 28, 28);
  g.lineStyle(3, INK).strokeRect(6, 5, 28, 28).lineBetween(20, 5, 20, 33).lineBetween(6, 19, 34, 19);
  g.fillStyle(0x8a6a4a).fillRect(3, 33, 34, 4);
};

/** Розкрита долоня — рука, що гладить. */
const palm: Draw = (g) => {
  g.fillStyle(INK).fillRoundedRect(9.5, 14.5, 21, 21, 6);
  for (const x of [9.5, 14.5, 19.5, 24.5]) g.fillRoundedRect(x, 4.5, 6, 15, 3);
  g.fillStyle(0xe8c39e).fillRoundedRect(11, 16, 18, 18, 5);
  for (const x of [11, 16, 21, 26]) g.fillRoundedRect(x, 6, 3.5, 13, 1.75);
};

Object.assign(ICONS, {
  "hiss-bowl": hissWith((g) => ICONS.kibble(g)),
  "hiss-litter": hissWith(tray),
  "hiss-window": hissWith(pane),
  "hiss-hand": hissWith(palm),
  "hiss-kitten": hissWith((g) => ICONS.cat(g)),
} satisfies Partial<Record<IconName, Draw>>);

/**
 * Мамин судочок (§6.4): прозорий пластиковий контейнер зі стравою й синя кришка із сердечком — щоб не сплутати ні зі
 * звичайною тарілкою, ні з сирими продуктами. `x`, `y` — середина низу, `s` — масштаб; та сама форма в руках і на столі.
 */
export function drawMomMeal(g: Phaser.GameObjects.Graphics, x: number, y: number, s = 1): void {
  g.fillStyle(0xeef3f5).fillRoundedRect(x - 11 * s, y - 13 * s, 22 * s, 13 * s, 3 * s);
  g.fillStyle(0xe0893a).fillRoundedRect(x - 9 * s, y - 9 * s, 18 * s, 7 * s, 2 * s);
  g.lineStyle(2, INK).strokeRoundedRect(x - 11 * s, y - 13 * s, 22 * s, 13 * s, 3 * s);
  g.fillStyle(0x4f86c6).fillRoundedRect(x - 12.5 * s, y - 18 * s, 25 * s, 6 * s, 2 * s);
  g.lineStyle(2, INK).strokeRoundedRect(x - 12.5 * s, y - 18 * s, 25 * s, 6 * s, 2 * s);
  g.fillStyle(0xd9455f).fillCircle(x - 1.3 * s, y - 15.6 * s, 1.5 * s).fillCircle(x + 1.3 * s, y - 15.6 * s, 1.5 * s);
  g.fillTriangle(x - 2.8 * s, y - 15.2 * s, x + 2.8 * s, y - 15.2 * s, x, y - 12.8 * s);
}

/** Позначки поверх іконки (§11.4): перекреслення на всю іконку, знак питання й галочка — кружечком у куті. */
const MARKS: Record<Mark, Draw> = {
  no: (g) => {
    g.lineStyle(7, 0xffffff).lineBetween(6, 34, 34, 6);
    g.lineStyle(4, COLORS.danger).lineBetween(6, 34, 34, 6);
  },
  ask: (g) => {
    g.fillStyle(0x4f86c6).fillCircle(30, 10, 9);
    g.lineStyle(2, INK).strokeCircle(30, 10, 9);
    g.lineStyle(2.6, 0xffffff).beginPath().arc(30, 7.5, 3, Math.PI, Math.PI * 2.5).strokePath();
    g.lineBetween(30, 10.5, 30, 12.5);
    g.fillStyle(0xffffff).fillCircle(30, 15.5, 1.6);
  },
  ok: (g) => {
    g.fillStyle(COLORS.good).fillCircle(30, 10, 9);
    g.lineStyle(2, INK).strokeCircle(30, 10, 9);
    g.lineStyle(3, 0xffffff).lineBetween(25.5, 10, 28.5, 13.5).lineBetween(28.5, 13.5, 34.5, 6.5);
  },
};

/**
 * Мовна хмаринка (вголос): заокруглене тло з чітким контуром і гострим хвостиком, скошеним, як у коміксі.
 * Контур — одним шляхом, тож хвостик зливається з тлом без шва. Вістря — посередині низу (там, де той, хто говорить).
 */
function drawSpeech(g: Phaser.GameObjects.Graphics): void {
  const left = 2;
  const top = 2;
  const right = BUBBLE_WIDTH - 2;
  const bottom = BUBBLE_HEIGHT - 10;
  const r = 14;
  g.beginPath();
  g.moveTo(left + r, top);
  g.lineTo(right - r, top);
  g.arc(right - r, top + r, r, -Math.PI / 2, 0);
  g.lineTo(right, bottom - r);
  g.arc(right - r, bottom - r, r, 0, Math.PI / 2);
  // Вістря трохи вище за низ текстури: гострий кут контуру виступає ще на ~3,5 px, інакше його зріже.
  g.lineTo(BUBBLE_WIDTH / 2 + 10, bottom);
  g.lineTo(BUBBLE_WIDTH / 2, BUBBLE_HEIGHT - 4.5);
  g.lineTo(BUBBLE_WIDTH / 2 + 2, bottom);
  g.lineTo(left + r, bottom);
  g.arc(left + r, bottom - r, r, Math.PI / 2, Math.PI);
  g.lineTo(left, top + r);
  g.arc(left + r, top + r, r, Math.PI, Math.PI * 1.5);
  g.closePath();
  g.fillStyle(0xffffff).fillPath();
  g.lineStyle(3, COLORS.ink).strokePath();
}

/**
 * Хмаринка-думка: хвилястий край із кружечків довкола овалу й два менші кружечки під нею замість хвостика —
 * до голови того, хто думає. Контур — ті самі фігури чорнилом, трохи більші, під білими.
 */
function drawThought(g: Phaser.GameObjects.Graphics): void {
  const cx = THOUGHT_WIDTH / 2;
  const cy = THOUGHT_CENTER;
  // Вісім великих горбиків довкола овалу 20×12 — западини між ними глибокі, хмаринку видно здалеку.
  const shapes: [number, number, number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    shapes.push([cx + Math.cos(a) * 20, cy + Math.sin(a) * 12, 10.5, 2.5]);
  }
  // Кружечки сходять донизу до вістря, з проміжком, щоб не злипалися з хмаринкою.
  shapes.push([cx - 3, cy + 30.5, 3.4, 2], [cx - 0.5, cy + 41.6, 2.2, 2]);
  g.fillStyle(COLORS.ink);
  for (const [x, y, r, line] of shapes) g.fillCircle(x, y, r + line);
  g.fillEllipse(cx, cy, 2 * (20 + 2.5), 2 * (12 + 2.5));
  g.fillStyle(0xffffff);
  for (const [x, y, r] of shapes) g.fillCircle(x, y, r);
  g.fillEllipse(cx, cy, 2 * 20, 2 * 12);
}

/** Намалювати текстури іконок і тла баблів один раз на старті. */
export function createIconTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists("bubble-say")) return;
  const g = scene.make.graphics({}, false);
  for (const [name, draw] of Object.entries(ICONS)) {
    g.clear();
    draw(g);
    g.generateTexture(`icon-${name}`, ICON_SIZE, ICON_SIZE);
  }
  for (const [name, draw] of Object.entries(MARKS)) {
    g.clear();
    draw(g);
    g.generateTexture(`mark-${name}`, ICON_SIZE, ICON_SIZE);
  }
  // Тло баблів: вголос і думка (§11.4).
  g.clear();
  drawSpeech(g);
  g.generateTexture("bubble-say", BUBBLE_WIDTH, BUBBLE_HEIGHT);
  g.clear();
  drawThought(g);
  g.generateTexture("bubble-think", THOUGHT_WIDTH, THOUGHT_HEIGHT);
  g.destroy();
}
