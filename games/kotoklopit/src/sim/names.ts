// Імена котів для нових кошенят. Ім'я обирається з умов дня, тож на переграванні воно те саме (§6.1).

import type { Rng } from "./rng";
import type { Sex } from "./types";

export const CAT_NAMES: Record<Sex, readonly string[]> = {
  male: ["Барсик", "Мурчик", "Пушок", "Тигрик", "Рижик", "Вуглик", "Персик", "Котофей", "Боцман", "Сирник", "Пиріжок", "Філя"],
  female: ["Мурка", "Ласка", "Перлинка", "Зірка", "Маруся", "Дуся", "Ромашка", "Ожина", "Квасоля", "Ватрушка", "Бусинка", "Хмаринка"],
};

/** Ім'я, якого ще немає серед котів у домі; якщо всі зайняті — будь-яке. */
export function pickCatName(rng: Rng, sex: Sex, taken: readonly string[]): string {
  const names = CAT_NAMES[sex];
  const free = names.filter((name) => !taken.includes(name));
  const pool = free.length > 0 ? free : names;
  return pool[rng.int(0, pool.length - 1)] ?? names[0] ?? "Кіт";
}
