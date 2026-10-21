// Назви запасів і речей (§6.4): для магазину, телефона й карток.

import type { Product, ThingKind } from "../sim/types";

/** Українська множина: 1 порція, 2 порції, 5 порцій. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const portions = (n: number): string => `${n} ${plural(n, "порція", "порції", "порцій")}`;
export const PRODUCT_TITLES: Record<Product, { name: string; unit: (n: number) => string; place: string }> = {
  food: { name: "Продукти", unit: portions, place: "у холодильнику" },
  hygiene: { name: "Засоби гігієни", unit: (n) => `${n} ${plural(n, "душ", "душі", "душів")}`, place: "у ванній" },
  catFood: { name: "Котячий корм", unit: portions, place: "у шафці" },
  sterileFood: { name: "Корм для стерилізованих", unit: portions, place: "у баку" },
  litter: { name: "Наповнювач", unit: (n) => `${n} ${plural(n, "чистка", "чистки", "чисток")} лотка`, place: "у мішку" },
  pills: { name: "Таблетки для котів", unit: (n) => `${n} ${plural(n, "таблетка", "таблетки", "таблеток")}`, place: "в аптечці" },
  drops: { name: "Краплі для котів", unit: (n) => `${n} ${plural(n, "доза", "дози", "доз")}`, place: "в аптечці" },
  humanMeds: { name: "Ліки для себе", unit: (n) => `${n} ${plural(n, "доза", "дози", "доз")}`, place: "біля умивальника" },
  treats: { name: "Ласощі для котів", unit: (n) => `${n} ${plural(n, "ласощі", "ласощі", "ласощів")}`, place: "в аптечці" },
  collar: { name: "Нашийник", unit: (n) => `${n} шт.`, place: "в аптечці" },
  bell: { name: "Дзвіночок на нашийник", unit: (n) => `${n} шт.`, place: "в аптечці" },
  shampoo: { name: "Шампунь для котів", unit: (n) => `${n} ${plural(n, "купання", "купання", "купань")}`, place: "у ванній" },
  detergent: { name: "Пральний засіб", unit: (n) => `${n} ${plural(n, "прання", "прання", "прань")}`, place: "у пральній машині" },
};


export const THING_TITLES: Record<ThingKind, string> = {
  bowl: "Миска для корму",
  water: "Миска для води",
  litter: "Лоток",
  toy: "Іграшка-вудочка",
  house: "Будиночок",
  scratcher: "Кігтеточка",
  carrier: "Переноска",
  feeder: "Автогодівниця",
  fountain: "Фонтанчик для води",
  robot: "Робот-пилосос",
};
