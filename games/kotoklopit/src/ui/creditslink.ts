// Посилання на титри (§2.1) унизу вкладки «Гра» телефона: титри відкриваються в новій вкладці, щоб гра лишилася відкритою.

import { element } from "./overlay";

export const CREDITS_LINK = "Автори музики, звуків і програм";
/** Від бази гри, а не відносно сторінки: адреса гри буває й без скісної риски в кінці. */
export const CREDITS_URL = `${import.meta.env.BASE_URL}credits.html`;

export function creditsLink(): HTMLElement {
  const box = element("p", "game-credits");
  const link = element("a", undefined, CREDITS_LINK);
  link.href = CREDITS_URL;
  link.target = "_blank";
  link.rel = "noopener";
  box.append(link);
  return box;
}
