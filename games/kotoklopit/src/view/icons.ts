// Іконки баблів (§11.4): без тексту, один набір на всю гру. Поки що — прості заглушки,
// намальовані кодом чорнилом; згодом їх замінить ШІ-графіка (крок 16 плану).

import Phaser from "phaser";

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
  | "lick";

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
    g.fillStyle(0x9a8f9c).fillCircle(31, 36, 1.8).fillCircle(35.5, 36, 1.8).fillCircle(26.5, 36, 1.8);
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
  toy: (g: Phaser.GameObjects.Graphics) => {
    // Іграшка-вудочка з пір'ям (§9.12).
    g.lineStyle(3, 0x8b5e3c).lineBetween(5, 34, 26, 10);
    g.lineStyle(1.5, INK, 0.8).lineBetween(26, 10, 30, 22);
    g.fillStyle(0xd9455f).fillEllipse(30, 26, 7, 12).fillEllipse(34, 27, 6, 10);
  },
} satisfies Partial<Record<IconName, Draw>>);

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
