// Гра не зберігається в браузері (§4.2): запис у сховище не вдався — раз за запуск картка радить зберегти гру файлом.

import { SAVE_FAILED } from "../texts";
import type { Card } from "./overlay";

/** Картка «Гра не зберігається»: «Зберегти файлом» зберігає (`onSave`) і закриває (`onClose`). */
export function saveFailedCard(onSave: () => void, onClose: () => void): Card {
  return {
    kicker: SAVE_FAILED.kicker,
    title: SAVE_FAILED.title,
    body: [SAVE_FAILED.body],
    actions: [
      { label: SAVE_FAILED.ok, onSelect: onClose },
      {
        label: SAVE_FAILED.save,
        primary: true,
        onSelect: () => {
          onSave();
          onClose();
        },
      },
    ],
    steps: true,
    onDismiss: onClose,
  };
}
