// Чи титри відкрила гра (§2.1, `back.ts`): адреса, з якої прийшли, — сторінка гри поруч із титрами. Адреса гри буває і з
// скісною рискою в кінці, і без неї (тоді «./» від неї — не тека гри), і з `index.html`. Без DOM.

/** Шлях теки: без `index.html` і скісної риски в кінці. */
const folder = (path: string): string => path.replace(/\/index\.html$/, "").replace(/\/+$/, "");

/** Чи `referrer` — сторінка гри, що лежить у тій самій теці, що й сторінка `page` (титри). */
export function isGamePage(referrer: string, page: string): boolean {
  try {
    const from = new URL(referrer);
    const here = new URL(page);
    return from.origin === here.origin && folder(from.pathname) === folder(new URL("./", here).pathname);
  } catch {
    return false;
  }
}
