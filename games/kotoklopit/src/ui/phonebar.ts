// Рядок стану телефона (§6.4, «Телефон — смартфон набік»): угорі екрана — годинник гри, праворуч зв'язок і батарея. Значки
// малює CSS (`phone.css`), без SVG: вони лише прикраса й нічого не кажуть гравцеві, тож для читача екрана приховані.

import { formatClock } from "../sim/time";
import { element } from "./overlay";

/** Рядок стану; `minute` — годинник гри (`GameState.minute`): поки телефон відкритий, гра на паузі, тож час не йде. */
export function phoneStatusBar(minute: number): HTMLElement {
  const bar = element("div", "phone-status");
  const icons = element("span", "phone-status-icons");
  icons.setAttribute("aria-hidden", "true");
  icons.append(element("span", "phone-signal"), element("span", "phone-battery"));
  bar.append(element("span", "phone-clock", formatClock(minute)), icons);
  return bar;
}
