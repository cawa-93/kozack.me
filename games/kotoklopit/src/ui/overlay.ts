// Картки поверх гри: титулка й ранкові повідомлення (§4), кінець гри (§6.1), телефон (§6.4).
// Це DOM, а не полотно: текст лишається чітким на будь-якому екрані. Поки картка відкрита, гра на паузі.

import { uiSound } from "../audio/sfx/sounds";
import { drawGlyphs } from "./glyphs";
import { drawIcons } from "./icons";
import "./overlay.css";
import type { Destination } from "../sim/types";

export interface CardAction {
  label: string;
  /** Головна дія: її викликають Enter і пробіл. */
  primary?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/** Вкладка картки: компактний рядок угорі замість кнопок унизу. */
export interface CardTab {
  label: string;
  active?: boolean;
  onSelect: () => void;
}

/** Своє оформлення картки: радіо (§8.10), телефон (§6.4), мапа «Куди поїхати?» і картки на місці (§8.5 «Оформлення поїздок»). */
export type CardSkin = "radio" | "phone" | "map" | `place-${Destination}`;

export interface Card {
  kicker?: string;
  /**
   * Годинник на місці (§8.5 «На місці — кадр парковки»): останньою частиною примітки праворуч від заголовка («🕐 10:45»;
   * рішення автора 2026-11-03 — до того дописувався до підзаголовка «Поїздка · 10:45»), але видно його лише на місці з карткою
   * посередині (`.away` без `.aside`, `overlay.css`). Коли картка ліворуч, час показує напис над парковкою у вільній смузі
   * (`RaceScene`), а без смуги той ховався б під карткою.
   */
  awayClock?: string;
  /** Порожній заголовок не показується: так картка з вкладками економить висоту. */
  title: string;
  /**
   * Примітка праворуч від заголовка, у тому самому рядку (§8.5, «Картки поїздок без «Поїздка»»; рішення автора 2026-11-03):
   * короткі частини через « · » — гроші, події дня, знижки. Не вміщається — переходить під заголовок. Без неї (і без
   * годинника) заголовок — як був.
   */
  aside?: string[];
  tabs?: CardTab[];
  /** Абзаци тексту або готові елементи. */
  body: (string | HTMLElement)[];
  /**
   * Смуга, що липне до низу картки, зі своїми кнопками: кошик магазину з «Додому» чи «Купити» (§6.4, «Бірка знижки й кошик
   * унизу»). Стоїть після тіла й перед кнопками дій (`actions`), якщо ті є.
   */
  bar?: HTMLElement;
  actions: CardAction[];
  /**
   * Кнопки дій — праворуч (`.card-actions.end`), а не ліворуч: картка пункту на місці, де «Додому» стоїть там само, де в смузі
   * кошика магазину, ветеринара й лікаря (рецензія 2026-11-03, GAME_DESIGN §8.5, «Картки поїздок без «Поїздка»»).
   */
  actionsEnd?: boolean;
  /** Esc закриває картку. */
  onDismiss?: () => void;
  /** Хрестик у кутку замість кнопки «Скасувати» чи «Закрити»; натискання — як Esc. */
  closable?: boolean;
  /** Своє оформлення картки замість паперу: клас `card-<skin>`; пункт поїздки ще й `card-place` (§8.5 «Оформлення поїздок»). */
  skin?: CardSkin;
  /** Темне тло: гра ще не почалася (меню, нова гра), тож квартиру за карткою не видно. */
  solid?: boolean;
}

/** Розділ титулки дня: заголовок (тиждень, день) і блоки — кожен із кількох рядків, перший головний. */
export interface TitleSection {
  heading?: string;
  /** Рядки блоку; готовий елемент (як-от риси кота на прощанні) стоїть окремим рядком. */
  blocks: (string | HTMLElement)[][];
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
    // Звук кнопок і вкладок (§11.4а) — одним слухачем на всі картки. Перехоплення: кнопка, що закриває картку, прибирає себе з
    // DOM, і клац має прозвучати до звуку закриття.
    this.root.addEventListener("click", (event) => pressSound(event.target), true);
    // Повзунок «Звуки»: пробний клац, коли його відпустили, — не на кожен рух.
    this.root.addEventListener("change", (event) => {
      if ((event.target as Element | null)?.classList?.contains("sound-volume")) uiSound("ui", "click");
    });
  }

  get isOpen(): boolean {
    return this.card !== null;
  }

  /** Відкрита звичайна картка (не титулка й не кінець гри): щоб відкласти її, коли поверх неї з'являється інша. */
  get shown(): Card | null {
    return this.root.classList.contains("cinematic") ? null : this.card;
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
        block.forEach((line, i) => box.append(typeof line === "string" ? element("p", i === 0 ? "title-line main" : "title-line", line) : line));
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
    // Іконки біля назв (§11.4): хвороба кота на прощанні, як і в картках.
    drawIcons(screen);
    this.card = { title: "", body: [], actions: [{ label: "", primary: true, onSelect: advance }], onDismiss: advance };
    this.root.classList.add("cinematic");
    this.root.replaceChildren(screen);
    this.root.hidden = false;
  }

  /**
   * Екран кінця гри (§4.2): як титулка дня — на чорному екрані по черзі проявляються частини, а
   * кнопки — останніми. Натискання до кінця показу — клік, дотик, пробіл чи Enter — відкриває все одразу, а дія кнопки —
   * лише після цього (загальна ревізія 2026-10-29: раніше пробіл ще до появи кнопок одразу переграв день, а дотик туди, де
   * кнопка ще невидима, натискав її).
   */
  ending(parts: HTMLElement[], actions: CardAction[]): void {
    const screen = element("div", "title-screen ending-screen");
    let delay: number = TITLE_TIMING.start;
    for (const part of parts) {
      part.style.animationDelay = `${delay}s`;
      screen.append(part);
      delay += part.classList.contains("title-heading") ? TITLE_TIMING.heading : TITLE_TIMING.line * 2;
    }
    const shownAt = performance.now() + delay * 1000;
    const revealed = (): boolean => performance.now() >= shownAt || screen.classList.contains("all");
    // Кнопки ще проявляються — натискання лише відкриває все, як на титулці.
    const gated = actions.map((action) => ({
      ...action,
      onSelect: () => {
        if (revealed()) action.onSelect();
        else screen.classList.add("all");
      },
    }));
    const buttons = element("div", "card-actions ending-actions");
    for (const action of gated) {
      const button = element("button", action.primary ? "button primary" : "button", action.label);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        action.onSelect();
      });
      buttons.append(button);
    }
    buttons.style.animationDelay = `${delay}s`;
    screen.append(buttons);
    screen.addEventListener("click", () => screen.classList.add("all"));
    drawGlyphs(screen);
    drawIcons(screen);
    this.card = { title: "", body: [], actions: gated };
    this.root.classList.remove("dawn");
    this.root.classList.add("cinematic");
    this.root.replaceChildren(screen);
    this.root.hidden = false;
  }

  /**
   * На місці (§8.5 «На місці — кадр парковки», `.away`): під карткою — кадр парковки, а не квартира, тож тло затемнене слабше —
   * хоч би де стояла картка. День ставить це щокадру. Титулки, кінця гри й меню (`solid`) не стосується.
   */
  setAway(on: boolean): void {
    this.root.classList.toggle("away", on);
  }

  /**
   * Картку притиснуто ліворуч (`.aside`): на місці праворуч від неї видно парковку пункту. Чи вона там уміщається, вирішує сцена
   * дороги (`RaceScene.parkingAside`), а не ширина екрана; день ставить це щокадру. Титулки, кінця гри й меню (`solid`) не
   * стосується.
   */
  setAside(on: boolean): void {
    this.root.classList.toggle("aside", on);
  }

  show(card: Card): void {
    // Звук відкриття — лише коли картки не було: перемальовування тієї самої (покупка, вкладка) і заміна іншою мовчать.
    if (this.card === null) uiSound("ui", "open");
    this.card = card;
    this.root.classList.remove("cinematic", "dawn");
    this.root.classList.toggle("solid", card.solid ?? false);
    if (card.solid) this.root.classList.remove("aside", "away");
    const panel = element("section", ["card", ...(card.skin ? [`card-${card.skin}`] : []), ...(card.skin?.startsWith("place-") ? ["card-place"] : [])].join(" "));
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    if (card.closable && card.onDismiss) {
      const dismiss = card.onDismiss;
      const close = element("button", "card-close", "×");
      close.setAttribute("aria-label", "Закрити");
      close.addEventListener("click", () => dismiss());
      panel.append(close);
    }
    if (card.kicker) panel.append(element("p", "card-kicker", card.kicker));
    const title = card.title ? element("h2", "card-title", card.title) : null;
    if (title) {
      title.id = "card-title";
      panel.setAttribute("aria-labelledby", title.id);
    }
    const note = cardAside(card);
    if (note) {
      // Заголовок і примітка — один рядок (`.card-head`): примітка праворуч, а коли не вміщається — під заголовком.
      const head = element("div", "card-head");
      if (title) head.append(title);
      head.append(note);
      panel.append(head);
    } else if (title) panel.append(title);
    if (card.tabs) {
      // Рядок вкладок липне до верху картки (`.card-tabbar`): каталог прокручується під ним. У телефоні над вкладками ще й рядок
      // стану, а хрестик — кнопка на корпусі (`phone.css`).
      const tabbar = element("div", "card-tabbar");
      const tabs = element("div", "card-tabs");
      tabs.setAttribute("role", "tablist");
      for (const tab of card.tabs) {
        const button = element("button", tab.active ? "card-tab active" : "card-tab", tab.label);
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", String(tab.active ?? false));
        button.addEventListener("click", () => tab.onSelect());
        tabs.append(button);
      }
      tabbar.append(tabs);
      panel.append(tabbar);
    }
    for (const part of card.body) {
      if (typeof part !== "string") panel.append(part);
      else for (const paragraph of part.split("\n\n")) panel.append(element("p", "card-text", paragraph));
    }
    if (card.bar) panel.append(card.bar);
    const actions = element("div", card.actionsEnd ? "card-actions end" : "card-actions");
    for (const action of card.actions) {
      const button = element("button", action.primary ? "button primary" : "button", action.label);
      button.disabled = action.disabled ?? false;
      button.addEventListener("click", () => action.onSelect());
      actions.append(button);
    }
    if (card.actions.length > 0) panel.append(actions);
    drawGlyphs(panel);
    drawIcons(panel);
    this.root.replaceChildren(panel);
    this.root.hidden = false;
    panel.querySelector<HTMLButtonElement>(".primary:not(:disabled)")?.focus({ preventScroll: true });
  }

  close(): void {
    // Титулка й кінець гри мають свої звуки (`Sounds.moment`), тож їхнє закриття мовчить.
    if (this.card !== null && !this.root.classList.contains("cinematic")) uiSound("ui", "close");
    this.card = null;
    this.root.classList.remove("cinematic", "dawn", "aside", "away");
    this.root.hidden = true;
    this.root.replaceChildren();
  }

  private key(event: KeyboardEvent): void {
    const card = this.card;
    if (!card) return;
    const active = document.activeElement;
    const typing = active instanceof HTMLInputElement || active instanceof HTMLSelectElement || active instanceof HTMLTextAreaElement;
    // Автоповтор затиснутого пробілу чи Enter — не нове натискання (загальна ревізія 2026-10-29). Затиснутий пробіл (пестощі)
    // не гортає титулку й екран кінця гри, а preventDefault не дає кнопці в фокусі стати натиснутою: інакше, відпустивши
    // пробіл, гравець «відповідав» мамі чи брав знайду, сам того не обравши. Пробіл у полі вводу друкується, як і раніше.
    if (event.repeat && (event.key === "Enter" || (event.key === " " && !typing))) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    // Клавіші картки не доходять до гри: інакше пробіл, що закрив титулку, ще й натиснув би дію.
    if (event.key === "Escape" && card.onDismiss) {
      event.preventDefault();
      event.stopImmediatePropagation();
      card.onDismiss();
      return;
    }
    // Пробіл і Enter на кнопці в фокусі натискають її самі; у полі вводу — друкують.
    if ((event.key === "Enter" || event.key === " ") && !(active instanceof HTMLButtonElement) && !(typing && event.key === " ")) {
      const primary = card.actions.find((a) => a.primary && !a.disabled);
      if (primary) {
        event.preventDefault();
        event.stopImmediatePropagation();
        // Клавіша замість кнопки звучить, як кнопка; титулку й кінець гри гортають без клацу, як і дотиком.
        if (!this.root.classList.contains("cinematic")) uiSound("ui", "click");
        primary.onSelect();
      }
    }
  }
}

/** Звук натискання: вкладка — свій, будь-яка інша кнопка — клац; поле, повзунок і текст мовчать. */
function pressSound(target: EventTarget | null): void {
  const button = (target as Element | null)?.closest?.("button");
  if (!button || button.disabled) return;
  uiSound("ui", button.classList.contains("card-tab") ? "tab" : "click");
}

/**
 * Примітка праворуч від заголовка (`Card.aside`): частини окремими шматками (« · » між ними ставить CSS), годинник на місці —
 * останнім (`.card-clock`: його видно лише з карткою посередині, і тоді перед ним немає зайвої « · »). Нічого — null.
 */
function cardAside(card: Card): HTMLElement | null {
  const parts = card.aside ?? [];
  if (parts.length === 0 && !card.awayClock) return null;
  const note = element("p", "card-aside");
  for (const part of parts) note.append(element("span", "card-aside-part", part));
  if (card.awayClock) note.append(element("span", "card-aside-part card-clock", `🕐 ${card.awayClock}`));
  return note;
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
