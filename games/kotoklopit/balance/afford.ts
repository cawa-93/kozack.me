// Коли по кишені (§6.4). Бот дорогого й автоматики не купує, тож ціни звіряємо з його грошима: разову річ — із накопиченнями,
// дорогий побут — із тижневим приростом, бо запаси купують знову й знову.

import { PRODUCTS, THINGS } from "../src/sim/config";
import type { Product, Quality, ThingKind } from "../src/sim/types";

/** Разова річ по кишені, коли коштує не більше цієї частки накопичень: бот не витрачає на необов'язкове, у гравця грошей менше. */
const SAVINGS_SHARE = 1 / 3;
/** За скільки останніх тижнів рахується приріст: виплати й витрати нерівні. */
const GAIN_WEEKS = 4;
/** Витрата за тиждень удома з двома котами. Оцінка, а не замір. */
const WEEKLY_USE: Partial<Record<Product, number>> = { food: 14, hygiene: 7, catFood: 26, litter: 14 };
/** Речі, які гравець купує котам у дорогому варіанті: по одній кожної. */
const PREMIUM_SET: readonly ThingKind[] = ["bowl", "water", "litter", "toy", "house", "scratcher", "carrier"];

/** Гроші наприкінці кожного тижня для однієї комбінації хронотипу й складності. */
export interface MoneyCurve {
  title: string;
  money: readonly number[];
}

const perUnit = (product: Product, quality: Quality): number => PRODUCTS[product].price[quality] / PRODUCTS[product].units[quality];

/** На скільки дорожчий тиждень, коли весь побут — дорогий. */
function premiumLifeExtra(): number {
  let extra = 0;
  for (const [product, use] of Object.entries(WEEKLY_USE) as [Product, number][]) extra += use * (perUnit(product, "premium") - perUnit(product, "cheap"));
  return extra;
}

/** Перший тиждень, коли разова річ по кишені; null — за гру не стала. */
function savedFor(money: readonly number[], price: number): number | null {
  const week = money.findIndex((m) => m * SAVINGS_SHARE >= price);
  return week < 0 ? null : week + 1;
}

/** Перший тиждень, коли приріст грошей покриває доплату; null — за гру не став. */
function gainCovers(money: readonly number[], extra: number): number | null {
  for (let week = GAIN_WEEKS; week < money.length; week++) {
    const now = money[week];
    const before = money[week - GAIN_WEEKS];
    if (now !== undefined && before !== undefined && (now - before) / GAIN_WEEKS >= extra) return week + 1;
  }
  return null;
}

export function affordTable(curves: readonly MoneyCurve[]): string[] {
  const set = PREMIUM_SET.reduce((sum, thing) => sum + THINGS[thing].price.premium, 0);
  const row = (title: string, price: number, week: (money: readonly number[]) => number | null): string =>
    `| ${title} | ${Math.round(price)} ₴ | ${curves.map((c) => week(c.money) ?? "—").join(" | ")} |`;
  const thing = (title: string, kind: ThingKind, quality: Quality): string => {
    const price = THINGS[kind].price[quality];
    return row(title, price, (money) => savedFor(money, price));
  };
  const extra = premiumLifeExtra();
  return [
    `Коли по кишені (§6.4), тиждень. Річ — коли коштує не більше ${Math.round(SAVINGS_SHARE * 100)}% накопичень бота; дорогий побут на двох котів — коли доплату покриває приріст грошей за ${GAIN_WEEKS} тижні:`,
    "",
    `| Що | Ціна | ${curves.map((c) => c.title).join(" | ")} |`,
    `|---|---|${curves.map(() => "---|").join("")}`,
    row("Дорогий побут, доплата за тиждень", extra, (money) => gainCovers(money, extra)),
    row("Дорогий набір речей", set, (money) => savedFor(money, set)),
    thing("Фонтанчик, дешевий", "fountain", "cheap"),
    thing("Фонтанчик, дорогий", "fountain", "premium"),
    thing("Годівниця, дешева", "feeder", "cheap"),
    thing("Годівниця, дорога", "feeder", "premium"),
    thing("Робот, дешевий", "robot", "cheap"),
    thing("Робот, дорогий", "robot", "premium"),
  ];
}
