// Журнал режиму розробки (§11.5): приховані зміни й кидки випадковості з подій симуляції.

import { onEvent, type GameEvent } from "../sim/events";
import { formatClock, weekdayOf, weekOf } from "../sim/time";
import type { GameState, Item } from "../sim/types";

export interface JournalEntry {
  stamp: string;
  text: string;
}

const LIMIT = 300;
const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "нд"] as const;

const number = (value: number, digits = 1): string =>
  (Math.round(value * 10 ** digits) / 10 ** digits).toLocaleString("uk-UA");
const signed = (value: number, digits = 1): string => (value >= 0 ? `+${number(value, digits)}` : `−${number(-value, digits)}`);
const item = (i: Item): string =>
  `${{ raw: "сира порція", meal: "страва", burnt: "підгоріла страва" }[i.kind]} (${i.quality === "premium" ? "дорога" : "дешева"})`;

export function stampOf(state: GameState): string {
  return `т${weekOf(state.day)} ${WEEKDAYS[weekdayOf(state.day)]} ${formatClock(state.minute)}`;
}

/** Текст події для журналу або null, якщо подія не варта запису. */
export function describe(event: GameEvent): string | null {
  switch (event.type) {
    case "night": {
      const r = event.report;
      const parts = [`Ніч: сон ${number(r.sleptHours)} год${r.collapsed ? " (впав без сил)" : ""}`];
      parts.push(`кроки — ${r.steps.join(", ")}`);
      if (r.utilities) parts.push(`комунальні — ${r.utilities.outcome}, сплачено ${r.utilities.paid}`);
      if (r.newCats.length > 0) parts.push(`нових котів: ${r.newCats.length}`);
      parts.push(`здоровий глузд ${number(r.sanityEvening)} → ${number(r.sanityMorning)}`);
      return parts.join("; ");
    }
    case "game-over":
      return `Кінець гри: ${event.end}`;
    case "took":
      return `Узято з «${event.object}»: ${item(event.item)}`;
    case "put":
      return `Покладено на «${event.object}»: ${item(event.item)}`;
    case "trashed":
      return `Викинуто: ${item(event.item)}`;
    case "refused":
      return `Відмова «${event.object}»: ${event.reason}`;
    case "cooked":
      return event.result === "ready" ? "Плита: страва готова" : "Плита: страва підгоріла";
    case "ate":
      return `Їжа: ситість ${signed(event.satiety)}, у холодильнику ${event.food}`;
    case "showered":
      return `Душ: гігієна ${signed(event.hygiene)} (${event.quality ?? "без засобів"}), лишилося ${event.left}`;
    case "work-started":
      return "Сів за комп'ютер";
    case "work-stopped":
      return `Робота ${number(event.minutes / 60, 2)} год: гроші ${signed(event.money)}, репутація ${signed(event.reputation, 2)}, здоровий глузд ${signed(event.sanity)}`;
    case "patience":
      return {
        ok: "Терпіння знову вище 50",
        warning: "Терпіння нижче 50: «!»",
        out: "Терпіння на нулі: «Х», репутація падає",
      }[event.level];
    case "standup-started":
      return "Летучка почалася";
    case "standup":
      return `Летучка: ${event.attended ? "присутність" : "пропуск"}, репутація ${signed(event.reputation, 2)}`;
    case "ordered":
      return `Замовлено ${event.delivery.product} (${event.delivery.quality}): −${event.price}`;
    case "doorbell":
      return `Кур'єр під дверима: ${event.delivery.product} (${event.delivery.quality})`;
    case "received":
      return `Забрано пакунків: ${event.deliveries.length}`;
    case "dash":
      return null;
    case "glitch":
      return `Кидок: збій керування (шанс ${number(event.chance * 100, 0)}% за хвилину), зсув ${number(event.angle, 0)}°`;
  }
}

export class Journal {
  readonly entries: JournalEntry[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(private readonly stateOf: () => GameState) {
    onEvent((event, state) => {
      const text = describe(event);
      if (text !== null) this.add(text, state);
    });
  }

  add(text: string, state: GameState = this.stateOf()): void {
    this.entries.unshift({ stamp: stampOf(state), text });
    this.entries.length = Math.min(this.entries.length, LIMIT);
    for (const listener of this.listeners) listener();
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }

  clear(): void {
    this.entries.length = 0;
    for (const listener of this.listeners) listener();
  }
}
