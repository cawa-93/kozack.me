// Назви запасів і речей (§6.4): для магазину, телефона й карток.

import type { Product, Quality, ThingKind } from "../sim/types";

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
  lock: "Замок на шафку з кормом",
};

/**
 * Назви двох варіантів кожного товару (§6.4): замість «дешевий» і «дорогий» — сам товар, як його
 * назвали б у магазині. Ключ — запас чи `thing:річ`.
 */
export const VARIANT_TITLES: Record<string, Record<Quality, string>> = {
  food: { cheap: "Звичайні продукти", premium: "Фермерські продукти" },
  hygiene: { cheap: "Простий гель для душу", premium: "Ароматний набір" },
  catFood: { cheap: "Корм «Щодня»", premium: "Корм «Гурман»" },
  sterileFood: { cheap: "«Щодня» для стерилізованих", premium: "«Гурман» для стерилізованих" },
  litter: { cheap: "Глиняний наповнювач", premium: "Силікагелевий наповнювач" },
  pills: { cheap: "Аптечні таблетки", premium: "Ветеринарні таблетки" },
  drops: { cheap: "Аптечні краплі", premium: "Ветеринарні краплі" },
  humanMeds: { cheap: "Аптечні ліки", premium: "Надійні ліки" },
  treats: { cheap: "Смаколики", premium: "Делікатеси" },
  collar: { cheap: "Простий нашийник", premium: "Шкіряний нашийник" },
  bell: { cheap: "Мідний дзвіночок", premium: "Срібний дзвіночок" },
  shampoo: { cheap: "Простий шампунь", premium: "Делікатний шампунь" },
  detergent: { cheap: "Пральний порошок", premium: "Пральний концентрат" },
  "thing:bowl": { cheap: "Пластикова миска", premium: "Керамічна миска" },
  "thing:water": { cheap: "Пластикова поїлка", premium: "Керамічна поїлка" },
  "thing:litter": { cheap: "Простий лоток", premium: "Закритий лоток" },
  "thing:toy": { cheap: "Вудочка з пір'ям", premium: "Інтерактивна вудочка" },
  "thing:house": { cheap: "Картонний будиночок", premium: "Затишний будиночок" },
  "thing:scratcher": { cheap: "Картонна кігтеточка", premium: "Сизалева кігтеточка" },
  "thing:carrier": { cheap: "Пластикова переноска", premium: "Надійна переноска" },
  "thing:feeder": { cheap: "Проста автогодівниця", premium: "Розумна автогодівниця" },
  "thing:fountain": { cheap: "Простий фонтанчик", premium: "Тихий фонтанчик" },
  "thing:robot": { cheap: "Простий робот-пилосос", premium: "Розумний робот-пилосос" },
  "thing:lock": { cheap: "Дитячий замочок", premium: "Магнітний замок" },
};

/** Два варіанти послуги на місці (§8.5): лікування, грумінг. */
export const SERVICE_TITLES = {
  treat: { cheap: "Звичайне лікування", premium: "Ретельне лікування" },
  groom: { cheap: "Вичісування", premium: "Повний догляд" },
} as const satisfies Record<string, Record<Quality, string>>;
