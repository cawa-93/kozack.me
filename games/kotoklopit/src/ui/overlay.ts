// Картки поверх гри: титулка й ранкові повідомлення (§4), кінець гри (§6.1), телефон (§6.4).
// Це DOM, а не полотно: текст лишається чітким на будь-якому екрані. Поки картка відкрита, гра на паузі.

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

  show(card: Card): void {
    this.card = card;
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
