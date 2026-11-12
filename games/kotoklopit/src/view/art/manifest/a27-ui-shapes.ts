// Маніфест нерухомих фігур інтерфейсу Phaser, які раніше малював код (`Graphics` Phaser розбиває на трикутники щокадру, а
// зображення з атласу йдуть спільним пакетом): плашка кількості в баблі (`bubbles.ts`), плашка індикатора сховища
// (`storage.ts`), доріжка, заливка й штрихування шкал показників (`hud.ts`).
//
// Фігури змінної ширини — «три частини» (`src/view/slice3.ts`): тіло фігури — між точками `body` і `body-end`, край, що не
// тягнеться, — `cap.x` від боку тіла; обвідка й тінь за тілом ідуть разом із краями. Кольори запечено в кадри: tint у запасному
// Canvas не діє, тож колір — стан запису. Числа — ті самі, що в коді (`BUBBLE_COUNT`, `STORAGE_LOOK`, `isoBarRects`); звіряє
// `tests/uishapes.test.ts`. Полотна мінімальні: краї й вузька середина.

import type { ArtEntry } from "../types";

/** Поле полотна (`art/STYLE.md` §2). */
const FIELD = 4;

/**
 * Запис фігури: тіло `w` × `h` із краями `cap`; за тіло намальоване виходить на `out` з боків і згори та на `below` знизу
 * (обвідка, тінь).
 */
function shape(id: ArtEntry["id"], body: { w: number; h: number }, cap: number, out = 0, below = out): Omit<ArtEntry, "states"> {
  const left = FIELD + out;
  const size = { w: body.w + 2 * left, h: body.h + left + below + FIELD };
  return {
    id,
    size,
    pivot: { x: size.w / 2, y: size.h / 2 },
    points: { body: { x: left, y: left }, "body-end": { x: left + body.w, y: left + body.h }, cap: { x: cap, y: 0 } },
  };
}

export const MANIFEST: readonly ArtEntry[] = [
  // Плашка кількості в баблі: чорнильна пігулка заввишки 32 з паперовою обвідкою 3 (половина — за тілом).
  shape("ui/count", { w: 35, h: 32 }, 16, 1.5),
  // Плашка індикатора сховища: папір заввишки 48 у чорнильній рамці 3,5 із заокругленням 10, під нею тінь на 4 нижче.
  shape("ui/storage", { w: 22, h: 48 }, 10, 2, 4),
  // Доріжка й заливка шкали показника: пігулка без обвідки під рамкою `ui/hud/bar`; стан — колір (доріжка, показник, блимання).
  { ...shape("ui/hud/bar-fill", { w: 14, h: 12 }, 6), states: ["trough", "health", "satiety", "hygiene", "sanity", "blink"] },
  // Штрихування шкали над межею показника: смужки на всю довжину шкали, код показує їхню частину від межі.
  shape("ui/hud/bar-hatch", { w: 152, h: 12 }, 0),
];
