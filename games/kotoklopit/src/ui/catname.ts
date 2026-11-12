// Поле імені кота (§9.7): нове ім'я діє одразу, з кожною літерою, а порожнє поле, з якого вийшли, лишає ім'я, з яким у поле
// зайшли. Інакше ім'я, стерте по літері (на телефоні так і стирають — утриманням), лишалося б першою літерою: порожнє значення
// `renameCat` пропускає, а попередні вже діяли. Без DOM.

import { renameCat } from "../sim/cat";
import type { Cat } from "../sim/types";

export interface CatNameEditor {
  /** Поле отримало фокус: запам'ятати ім'я, до якого повертатися. */
  focus(): void;
  /** Нове значення поля. */
  input(value: string): void;
  /** Вийшли з поля: що в ньому показати (ім'я кота). */
  blur(): string;
}

export function catNameEditor(cat: Pick<Cat, "name">): CatNameEditor {
  let before = cat.name;
  let empty = false;
  return {
    focus: () => {
      before = cat.name;
      empty = false;
    },
    input: (value) => {
      empty = value.trim() === "";
      renameCat(cat, value);
    },
    blur: () => {
      if (empty) cat.name = before;
      empty = false;
      return cat.name;
    },
  };
}
