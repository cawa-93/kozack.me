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
  /**
   * Режим розробки: множник швидкості часу й пауза (§11.5). Ці поля й `showHidden`, `lightAt` сцени читають лише під
   * `__DEV_TOOLS__`: тоді продакшн-збірка викидає гілки, які їх обслуговують.
   */
  speed = 1;
  paused = false;
  /**
   * Прискорення роботи (§8): скільки секунд реального часу робота вже йде без зупинки (`clockFrame`, src/sim/time.ts). Лічить
   * сцена; у збереження не потрапляє — після перезавантаження сторінки робота розганяється з ×1. Тут, а не в сцені, щоб
   * панель розробника бачила множник.
   */
  workSeconds = 0;
  /** Чи зберігати гру в браузері; сценарії режиму розробки основне збереження не переписують. */
  persistent = true;
  /** Режим розробки: приховані числа над котами (§11.5). */
  showHidden = false;
  /**
   * Режим розробки (§11.5, §8.9): світло доби на іншу хвилину, ніж годинник гри (`?light=`, рядок «Світло» в панелі), або
   * `"off"` — без світла доби зовсім. `null` — за годинником гри.
   */
  lightAt: number | "off" | null = null;
  /**
   * Збереження, яке не вдалося відкрити на старті (§4.2, Ц3): сцена пропонує зберегти його файлом, перш ніж почати нову гру.
   * Після цього — null.
   */
  unreadable: string | null = null;
  /** Запис у сховище браузера не вдався (§4.2) — і чи гравцеві про це вже сказали (`takeSaveWarning`). */
  private saveFailed = false;
  private saveWarned = false;
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
    // Safari, покидаючи сторінку, не завжди ховає вкладку (`visibilitychange`), а `pagehide` буває завжди: вкладка, що чекала
    // своєї черги (§4.2, «Одна вкладка»), має прочитати вже записане.
    window.addEventListener("pagehide", () => session.persist());
    return session;
  }

  /** Замінити гру (перегравання, нова гра, сценарій): сцена починає показ заново. */
  replace(save: Save): void {
    this.save = save;
    // Гру замінено (нова гра, перегравання, сценарій, зміна з панелі розробника) — розгін роботи з нуля, навіть якщо персонаж
    // і далі за комп'ютером (§8): сцена так само показує день заново.
    this.workSeconds = 0;
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
      // Сховище недоступне чи повне: гра йде далі без збереження, а сцена скаже про це гравцеві.
      this.saveFailed = true;
    }
  }

  /** Чи сказати гравцеві, що гра не зберігається в браузері (§4.2): після першого невдалого запису — раз за запуск. */
  takeSaveWarning(): boolean {
    if (!this.saveFailed || this.saveWarned) return false;
    this.saveWarned = true;
    return true;
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
