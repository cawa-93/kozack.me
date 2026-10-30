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
  /**
   * Збереження, яке не вдалося відкрити на старті (§4.2, Ц3): сцена пропонує зберегти його файлом, перш ніж почати нову гру.
   * Після цього — null.
   */
  unreadable: string | null = null;
  private readonly resetListeners = new Set<() => void>();

  constructor(save: Save) {
    this.save = save;
  }

  /** Продовжити збережену гру або почати нову. */
  static restore(defaults: NewGameOptions): Session {
    const loaded = loadSave();
    const session = new Session(loaded.save ?? newGame(defaults));
    session.unreadable = loaded.unreadable;
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
    // Доки гравець не відповів на картку про нечитабельне збереження, заглушка нової гри не лягає на його місце:
    // інакше після перезавантаження картки вже не було б (перевірка циклу гри 2026-10-27).
    if (!this.persistent || this.unreadable !== null) return;
    try {
      localStorage.setItem(SAVE_KEY, serialize(this.save));
    } catch {
      // Сховище може бути недоступне чи повне: гра йде далі без збереження.
    }
  }
}

/** Що знайшлося в браузері: гра, яку вдалося відкрити, чи текст збереження, яке не вдалося. */
export interface Loaded {
  save: Save | null;
  unreadable: string | null;
}

export function loadSave(): Loaded {
  let json: string | null = null;
  try {
    json = localStorage.getItem(SAVE_KEY);
    return { save: json === null ? null : deserialize(json), unreadable: null };
  } catch {
    // Збереження старої версії чи пошкоджене — починаємо нову гру, але старе відкладаємо: інакше перше ж автозбереження
    // перезаписало б його назавжди (перевірка циклу гри 2026-10-27); сцена ще й запропонує зберегти його файлом (Ц3).
    try {
      if (json !== null) localStorage.setItem(BACKUP_KEY, json);
    } catch {
      // Сховище недоступне чи повне — нічого не вдієш.
    }
    return { save: null, unreadable: json };
  }
}
