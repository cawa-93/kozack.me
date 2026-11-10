// Бабл-підказка над кнопкою: чипи рис кота (§9.9) і «і» товару в магазині (§6.4). Мишею — поки вказівник над кнопкою; натискання
// (і дотик) бабл закріплює — до натискання ще раз чи поза `box`. Один бабл на всі кнопки в `box`.

import { element } from "./overlay";

export interface HintBubble {
  /** Бабл: його кладуть у `box` останнім, позиціонується він відносно `box`. */
  readonly bubble: HTMLElement;
  /** Кнопка, над якою бабл показує `text`. */
  attach(button: HTMLElement, text: string): void;
}

export function hintBubble(box: HTMLElement, className: string): HintBubble {
  const bubble = element("p", className);
  bubble.hidden = true;
  let active: HTMLElement | null = null;
  let pinned = false;
  const outside = (event: Event): void => {
    if (!box.contains(event.target as Node)) hide();
  };
  const hide = (): void => {
    active?.classList.remove("active");
    active = null;
    pinned = false;
    bubble.hidden = true;
    document.removeEventListener("pointerdown", outside, true);
  };
  const show = (button: HTMLElement, text: string): void => {
    active?.classList.remove("active");
    active = button;
    button.classList.add("active");
    bubble.textContent = text;
    bubble.hidden = false;
    place(box, button, bubble);
    document.addEventListener("pointerdown", outside, true);
  };
  return {
    bubble,
    attach(button, text) {
      button.addEventListener("pointerenter", (event) => {
        if ((event as PointerEvent).pointerType === "mouse" && !pinned) show(button, text);
      });
      button.addEventListener("pointerleave", (event) => {
        if ((event as PointerEvent).pointerType === "mouse" && active === button && !pinned) hide();
      });
      // Натискання не йде далі: на титулці воно інакше закрило б її.
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (active === button && pinned) hide();
        else {
          show(button, text);
          pinned = true;
        }
      });
    },
  };
}

/**
 * Бабл над кнопкою: хвостиком до її середини, але не за краями `box` — тоді зсувається сам бабл, а хвостик лишається над кнопкою.
 * Згори бракує місця (кнопка під краєм списку, що прокручується) — бабл під кнопкою (`.below`).
 */
function place(box: HTMLElement, button: HTMLElement, bubble: HTMLElement): void {
  const center = button.offsetLeft + button.offsetWidth / 2;
  const width = bubble.offsetWidth;
  const left = Math.max(0, Math.min(box.clientWidth - width, center - width / 2));
  bubble.style.left = `${left}px`;
  bubble.style.setProperty("--tail", `${center - left}px`);
  bubble.classList.remove("below");
  bubble.style.top = `${button.offsetTop}px`;
  const clip = clipTop(box);
  if (clip === null || typeof bubble.getBoundingClientRect !== "function") return;
  if (bubble.getBoundingClientRect().top >= clip) return;
  bubble.classList.add("below");
  bubble.style.top = `${button.offsetTop + button.offsetHeight}px`;
}

/** Верхній край найближчого предка, що обрізає вміст (прокручуваний список), на екрані; немає — null. */
function clipTop(box: HTMLElement): number | null {
  if (typeof getComputedStyle !== "function") return null;
  for (let node = box.parentElement; node !== null; node = node.parentElement) {
    if (getComputedStyle(node).overflowY !== "visible") return node.getBoundingClientRect().top;
  }
  return null;
}
