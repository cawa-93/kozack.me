// Картки поверх гри: титулка й ранкові повідомлення (§4), кінець гри (§6.1), телефон (§6.4).
// Це DOM, а не полотно: текст лишається чітким на будь-якому екрані. Поки картка відкрита, гра на паузі.

import { drawGlyphs } from "./glyphs";
import "./overlay.css";

export interface CardAction {
  label: string;
  /** Головна дія: її викликають Enter і пробіл. */
  primary?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export interface Card {
  kicker?: string;
  title: string;
  /** Абзаци тексту або готові елементи. */
  body: (string | HTMLElement)[];
  actions: CardAction[];
  /** Esc закриває картку. */
  onDismiss?: () => void;
}

/** Розділ титулки дня: заголовок (тиждень, день) і блоки — кожен із кількох рядків, перший головний. */
export interface TitleSection {
  heading?: string;
  blocks: string[][];
}

/** Ритм титулки (секунди): затемнення, заголовок, кожен наступний рядок, пауза між розділами. */
const TITLE_TIMING = { start: 0.5, heading: 1.1, line: 0.45, section: 0.5, exit: 0.6, fade: 0.9 } as const;

export class Overlay {
  private readonly root: HTMLElement;
  private card: Card | null = null;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "overlay";
    this.root.hidden = true;
    document.body.append(this.root);
    window.addEventListener("keydown", (event) => this.key(event));
  }

  get isOpen(): boolean {
    return this.card !== null;
  }

  /**
   * Титулка дня (§4), як у кіно: на чорному екрані по черзі проявляються тиждень і його ефекти, день
   * і його ефекти, події ночі. Натискання до кінця показу відкриває все одразу; після — текст гасне,
   * і з темряви проявляється квартира. `onDone` — коли гру вже видно.
   */
  title(sections: TitleSection[], onDone: () => void): void {
    const screen = element("div", "title-screen");
    let delay: number = TITLE_TIMING.start;
    const reveal = (node: HTMLElement, after: number): void => {
      node.style.animationDelay = `${after}s`;
      screen.append(node);
    };
    for (const section of sections) {
      if (section.heading) {
        reveal(element("h2", "title-heading", section.heading), delay);
        delay += TITLE_TIMING.heading;
      }
      for (const block of section.blocks) {
        const box = element("div", block.length > 1 ? "title-block" : "title-block single");
        block.forEach((line, i) => box.append(element("p", i === 0 ? "title-line main" : "title-line", line)));
        reveal(box, delay);
        delay += TITLE_TIMING.line * block.length;
      }
      delay += TITLE_TIMING.section;
    }
    const prompt = element("p", "title-prompt", "Натисніть, щоб почати день");
    reveal(prompt, delay);
    const shownAt = performance.now() + delay * 1000;

    let leaving = false;
    const advance = (): void => {
      if (leaving) return;
      // Ще проявляється — показати все одразу, щоб не пропустити прощання чи подію.
      if (performance.now() < shownAt && !screen.classList.contains("all")) {
        screen.classList.add("all");
        return;
      }
      leaving = true;
      screen.classList.add("leaving");
      setTimeout(() => {
        this.root.classList.add("dawn");
        setTimeout(() => {
          this.root.classList.remove("cinematic", "dawn");
          this.close();
          onDone();
        }, TITLE_TIMING.fade * 1000);
      }, TITLE_TIMING.exit * 1000);
    };
    screen.addEventListener("click", advance);
    this.card = { title: "", body: [], actions: [{ label: "", primary: true, onSelect: advance }], onDismiss: advance };
    this.root.classList.add("cinematic");
    this.root.replaceChildren(screen);
    this.root.hidden = false;
  }

  show(card: Card): void {
    this.card = card;
    this.root.classList.remove("cinematic", "dawn");
    const panel = element("section", "card");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    if (card.kicker) panel.append(element("p", "card-kicker", card.kicker));
    const title = element("h2", "card-title", card.title);
    title.id = "card-title";
    panel.setAttribute("aria-labelledby", title.id);
    panel.append(title);
    for (const part of card.body) {
      if (typeof part !== "string") panel.append(part);
      else for (const paragraph of part.split("\n\n")) panel.append(element("p", "card-text", paragraph));
    }
    const actions = element("div", "card-actions");
    for (const action of card.actions) {
      const button = element("button", action.primary ? "button primary" : "button", action.label);
      button.disabled = action.disabled ?? false;
      button.addEventListener("click", () => action.onSelect());
      actions.append(button);
    }
    panel.append(actions);
    drawGlyphs(panel);
    this.root.replaceChildren(panel);
    this.root.hidden = false;
    panel.querySelector<HTMLButtonElement>(".primary:not(:disabled)")?.focus({ preventScroll: true });
  }

  close(): void {
    this.card = null;
    this.root.hidden = true;
    this.root.replaceChildren();
  }

  private key(event: KeyboardEvent): void {
    const card = this.card;
    if (!card) return;
    // Клавіші картки не доходять до гри: інакше пробіл, що закрив титулку, ще й натиснув би дію.
    if (event.key === "Escape" && card.onDismiss) {
      event.preventDefault();
      event.stopImmediatePropagation();
      card.onDismiss();
      return;
    }
    // Пробіл і Enter на кнопці в фокусі натискають її самі; у полі вводу — друкують.
    const active = document.activeElement;
    const typing = active instanceof HTMLInputElement || active instanceof HTMLSelectElement || active instanceof HTMLTextAreaElement;
    if ((event.key === "Enter" || event.key === " ") && !(active instanceof HTMLButtonElement) && !(typing && event.key === " ")) {
      const primary = card.actions.find((a) => a.primary && !a.disabled);
      if (primary) {
        event.preventDefault();
        event.stopImmediatePropagation();
        primary.onSelect();
      }
    }
  }
}

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
