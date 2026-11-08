// Збереження файлом (§4.2): довгу гру браузер може стерти, тож її можна зберегти й завантажити.

import { deserialize, serialize } from "../sim/game";
import type { Save } from "../sim/types";

/** Завантажити поточну гру файлом JSON. */
export function exportSave(save: Save): void {
  downloadJson(serialize(save), `kotoklopit-${save.current.character.name}-день-${save.current.day + 1}.json`);
}

/** Завантажити збереження, яке не вдалося відкрити, як є (§4.2, Ц3): щоб не загубилося. */
export function exportUnreadable(json: string): void {
  downloadJson(json, "kotoklopit-нечитабельне-збереження.json");
}

function downloadJson(json: string, fileName: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Прочитати збереження з файлу; помилка — якщо файл не збереження чи старої версії. */
export async function importSave(file: File): Promise<Save> {
  return deserialize(await file.text());
}
