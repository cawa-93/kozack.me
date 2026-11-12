// Одна вкладка (§4.2): гра йде лише в одній вкладці браузера — інакше дві перезаписували б одна одній збереження. Право
// грати — замок Web Locks (`GAME_LOCK`): вкладка тримає його, поки жива, а браузер відпускає сам, щойно її закрили. Друга
// вкладка чекає замка з повідомленням на заставці й відкриває гру — читає збереження — лише з ним: так вона бачить те, що
// перша встигла зберегти, закриваючись (`Session`: `visibilitychange`, `pagehide`).

import { TAB_BUSY } from "./texts";

/** Замок гри: один на весь сайт, з префіксом гри, як і ключі `localStorage`. */
export const GAME_LOCK = "kotoklopit:game";

/** Що замку потрібно від сторінки (справжня — `browserTab`; у тестах — підставна). */
export interface TabPage {
  /** Web Locks; без них (старий браузер, сторінка не з https) гра відкривається одразу, як без замка. */
  locks: Pick<LockManager, "request"> | undefined;
  /** `pagehide` і `pageshow` з `persisted`: сторінка йде в кеш «назад-уперед» чи повертається з нього. */
  onPage(type: "pagehide" | "pageshow", listener: (persisted: boolean) => void): void;
  reload(): void;
  /** Показати, що гру відкрито в іншій вкладці; повертає, як прибрати повідомлення. */
  busy(): () => void;
}

/** Відкрити гру (`open`: прочитати збереження й почати), коли вкладка дістала право грати. */
export async function openGame<T extends { persist(): void }>(page: TabPage, open: () => T): Promise<T> {
  let game: T | null = null;
  await claim(page, () => game?.persist());
  game = open();
  return game;
}

/**
 * Дочекатися замка гри: вільний — одразу, зайнятий — з повідомленням, доки ту вкладку не закрили. Сторінка в кеші «назад-
 * уперед» замка не тримає й не чекає: інакше гра стояла б в усіх вкладках, поки браузер не викине сторінку з кешу; повернулася
 * з кешу — перезавантажується (її гра вже застаріла) і стає в чергу заново.
 */
function claim(page: TabPage, save: () => void): Promise<void> {
  const { locks } = page;
  if (locks === undefined) return Promise.resolve();
  return new Promise((granted) => {
    let done = false;
    let hide: (() => void) | null = null;
    let release: (() => void) | null = null;
    const leave = new AbortController();
    const go = (): void => {
      if (done || leave.signal.aborted) return;
      done = true;
      hide?.();
      hide = null;
      granted();
    };
    // Колбек замка не закінчується, доки вкладка жива: так замок і тримається. Сторінка, що вже в кеші, його не тримає —
    // `ifAvailable` знімати нічим, і замок міг прийти вже після `pagehide`.
    const hold = (lock: Lock | null): Promise<void> | undefined => {
      if (lock === null || leave.signal.aborted) return undefined;
      go();
      return new Promise((free) => (release = free));
    };
    page.onPage("pagehide", (persisted) => {
      // Не в кеш — сторінки от-от не стане: замок браузер відпустить сам, уже після автозбереження.
      if (!persisted) return;
      if (release !== null) {
        // Зберегти до того, як відпустити: друга вкладка читає збереження, щойно дістала замок.
        save();
        release();
        release = null;
      }
      leave.abort();
    });
    page.onPage("pageshow", (persisted) => {
      if (persisted) page.reload();
    });
    // Web Locks відмовили (`catch`) — грати, як без замка: гра, що не відкривається, гірша за дві вкладки. Запит, знятий
    // сторінкою в кеші, — теж помилка, але `go` її пропускає.
    try {
      locks
        .request(GAME_LOCK, { ifAvailable: true }, (lock) => {
          if (lock !== null) return hold(lock);
          hide = page.busy();
          locks.request(GAME_LOCK, { signal: leave.signal }, hold).catch(go);
          return undefined;
        })
        .catch(go);
    } catch {
      go();
    }
  });
}

/** Справжня сторінка гри: Web Locks, події сторінки, перезавантаження й повідомлення на заставці (`index.html`). */
export function browserTab(): TabPage {
  // Сценарій режиму розробки (`?scenario=`) основного збереження не пише (`Session.persistent`), тож і замка не бере:
  // сценарії відкриваються поруч із грою.
  const scenario = __DEV_TOOLS__ && new URLSearchParams(location.search).has("scenario");
  return {
    locks: scenario ? undefined : (navigator as { locks?: LockManager }).locks,
    onPage: (type, listener) => window.addEventListener(type, (event) => listener(event.persisted)),
    reload: () => location.reload(),
    busy: showBusy,
  };
}

/** Повідомлення на заставці замість смуги — тим самим місцем, що й «Гра не завантажилася» (`PreloadScene`). */
function showBusy(): () => void {
  const root = document.getElementById("boot");
  const box = root?.querySelector<HTMLElement>(".boot-fail");
  if (!root || !box) return () => undefined;
  const title = document.createElement("p");
  title.textContent = TAB_BUSY.title;
  title.style.fontWeight = "700";
  const text = document.createElement("p");
  text.textContent = TAB_BUSY.body;
  box.replaceChildren(title, text);
  root.classList.add("boot-busy");
  return () => {
    root.classList.remove("boot-busy");
    box.replaceChildren();
  };
}
