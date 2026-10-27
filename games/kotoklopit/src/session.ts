// Поточна гра в браузері: збереження в localStorage (§2.1), швидкість і пауза режиму розробки.

import { onEvent } from "./sim/events";
import { deserialize, newGame, serialize, type NewGameOptions } from "./sim/game";
import type { Save } from "./sim/types";

const SAVE_KEY = "kotoklopit:save";
/** Сюди відкладається збереження, яке не вдалося прочитати: нова гра його не перезапише. */
const BACKUP_KEY = "kotoklopit:save-unreadable";
const AUTOSAVE_MS = 30_000;

export class Session {
  save: Save;
  /** Режим розробки: множник швидкості часу й пауза (§11.5). */
  speed = 1;
  paused = false;
  /** Чи зберігати гру в браузері; сценарії режиму розробки основне збереження не переписують. */
  persistent = true;
  /** Режим розробки: приховані числа над котами (§11.5). */
  showHidden = false;
  private readonly resetListeners = new Set<() => void>();

  constructor(save: Save) {
    this.save = save;
  }

  /** Продовжити збережену гру або почати нову. */
  static restore(defaults: NewGameOptions): Session {
    const session = new Session(loadSave() ?? newGame(defaults));
    onEvent((event) => {
      if (event.type === "night" || event.type === "game-over") session.persist();
    });
    window.setInterval(() => session.persist(), AUTOSAVE_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") session.persist();
    });
    return session;
  }

  /** Замінити гру (перегравання, нова гра, сценарій): сцена починає показ заново. */
  replace(save: Save): void {
    this.save = save;
    this.persist();
    for (const listener of this.resetListeners) listener();
  }

  onReset(listener: () => void): () => void {
    this.resetListeners.add(listener);
    return () => this.resetListeners.delete(listener);
  }

  persist(): void {
    if (!this.persistent) return;
    try {
      localStorage.setItem(SAVE_KEY, serialize(this.save));
    } catch {
      // Сховище може бути недоступне чи повне: гра йде далі без збереження.
    }
  }
}

export function loadSave(): Save | null {
  let json: string | null = null;
  try {
    json = localStorage.getItem(SAVE_KEY);
    return json === null ? null : deserialize(json);
  } catch {
    // Збереження старої версії чи пошкоджене — починаємо нову гру, але старе відкладаємо: інакше перше ж автозбереження
    // перезаписало б його назавжди (перевірка циклу гри 2026-10-27).
    try {
      if (json !== null) localStorage.setItem(BACKUP_KEY, json);
    } catch {
      // Сховище недоступне чи повне — нічого не вдієш.
    }
    return null;
  }
}
