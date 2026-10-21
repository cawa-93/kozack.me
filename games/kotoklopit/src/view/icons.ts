// Іконки баблів (§11.4): без тексту, один набір на всю гру. Поки що — прості заглушки,
// намальовані кодом чорнилом; згодом їх замінить ШІ-графіка (крок 16 плану).

import Phaser from "phaser";

import { COLORS } from "./geometry";

export type IconName =
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
  | "laundry";

export const ICON_SIZE = 40;
export const BUBBLE_WIDTH = 52;
export const BUBBLE_HEIGHT = 52;

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
  heart: (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(0xd9455f).fillCircle(14, 15, 7.5).fillCircle(26, 15, 7.5).fillTriangle(7, 18, 33, 18, 20, 34);
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

/** Здоровий глузд (§6): спокійна голова з думкою — для шкали на панелі. */
Object.assign(ICONS, {
  mind: (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(0x9b7fd1).fillCircle(17, 23, 12);
    g.fillStyle(0xffffff).fillCircle(29, 10, 5).fillCircle(24, 7, 3);
    g.lineStyle(2.5, INK).strokeCircle(17, 23, 12);
    g.lineStyle(2, 0xffffff).beginPath().arc(17, 23, 5, Math.PI * 0.2, Math.PI * 1.6).strokePath();
  },
} satisfies Partial<Record<IconName, Draw>>);

/** Намалювати текстури іконок і тла бабла один раз на старті. */
export function createIconTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists("bubble")) return;
  const g = scene.make.graphics({}, false);
  for (const [name, draw] of Object.entries(ICONS)) {
    g.clear();
    draw(g);
    g.generateTexture(`icon-${name}`, ICON_SIZE, ICON_SIZE);
  }
  // Тло бабла з хвостиком донизу.
  g.clear();
  g.fillStyle(0xffffff).fillRoundedRect(2, 2, BUBBLE_WIDTH - 4, BUBBLE_HEIGHT - 12, 12);
  g.fillTriangle(BUBBLE_WIDTH / 2 - 7, BUBBLE_HEIGHT - 11, BUBBLE_WIDTH / 2 + 7, BUBBLE_HEIGHT - 11, BUBBLE_WIDTH / 2, BUBBLE_HEIGHT - 2);
  g.lineStyle(3, COLORS.ink).strokeRoundedRect(2, 2, BUBBLE_WIDTH - 4, BUBBLE_HEIGHT - 12, 12);
  g.generateTexture("bubble", BUBBLE_WIDTH, BUBBLE_HEIGHT);
  g.destroy();
}
