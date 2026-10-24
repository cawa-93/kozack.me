// Збереження файлом (§4.2): довгу гру браузер може стерти, тож її можна зберегти й завантажити.

import { deserialize, serialize } from "../sim/game";
import type { Save } from "../sim/types";

/** Завантажити поточну гру файлом JSON. */
export function exportSave(save: Save): void {
  const blob = new Blob([serialize(save)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const { day } = save.current;
  link.href = url;
  link.download = `kotoklopit-${save.current.character.name}-день-${day + 1}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Прочитати збереження з файлу; помилка — якщо файл не збереження чи старої версії. */
export async function importSave(file: File): Promise<Save> {
  return deserialize(await file.text());
}
