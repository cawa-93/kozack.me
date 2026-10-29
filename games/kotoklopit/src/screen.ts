// Екран браузера (§10): повноекранний режим, горизонтальна орієнтація (і пауза, поки телефон тримають
// вертикально) й безпечна зона, під яку не варто класти інтерфейс.

/** Чи дає браузер сторінці повноекранний режим: на iPhone — ні. */
export function canFullscreen(): boolean {
  return document.fullscreenEnabled;
}

export function isFullscreen(): boolean {
  return document.fullscreenElement !== null;
}

/** Увімкнути чи вимкнути повний екран. Браузер виконає це лише в обробнику дії гравця. */
export function toggleFullscreen(): void {
  if (isFullscreen()) void document.exitFullscreen().catch(() => undefined);
  else void enterFullscreen();
}

/** Перейти в повноекранний режим; `true`, якщо вийшло. */
async function enterFullscreen(): Promise<boolean> {
  if (!canFullscreen()) return false;
  if (isFullscreen()) return true;
  try {
    // Уся сторінка, а не лише полотно: картки й панель розробника — поза ним.
    await document.documentElement.requestFullscreen({ navigationUI: "hide" });
  } catch {
    return false;
  }
  try {
    await screen.orientation.lock("landscape");
  } catch {
    // Гра горизонтальна, але на десктопі фіксувати нічого, а iPad цього не вміє — це не помилка.
  }
  return true;
}

/**
 * Гра запускається на весь екран, але браузер дозволяє це лише після дії гравця:
 * переходимо на першому дотику, кліку чи клавіші. Якщо гравець потім вийде з повного
 * екрана, гра не повертає його туди сама — для цього є кнопка в інтерфейсі.
 */
export function fullscreenOnFirstAction(): void {
  if (!canFullscreen()) return;
  // На дотик браузер зважає лише після того, як палець відпустили.
  const events = ["pointerup", "keydown"] as const;
  const stop = (): void => {
    for (const type of events) window.removeEventListener(type, attempt, true);
  };
  function attempt(event: Event): void {
    // Esc браузер не вважає дією гравця.
    if (event instanceof KeyboardEvent && event.key === "Escape") return;
    void enterFullscreen().then((entered) => {
      if (entered) stop();
    });
  }
  for (const type of events) window.addEventListener(type, attempt, true);
}

/** Коли гра просить повернути телефон: той самий запит, що показує заглушку `.rotate` у style.css. */
const ROTATE_QUERY = "(orientation: portrait) and (pointer: coarse)";

let rotateMedia: MediaQueryList | null = null;

function rotateQuery(): MediaQueryList {
  rotateMedia ??= window.matchMedia(ROTATE_QUERY);
  return rotateMedia;
}

/**
 * Чи закриває гру заглушка «Поверніть телефон» (§10). Поки вона на екрані, гра стоїть на паузі, як під
 * карткою: гравець не бачить квартири й дороги (загальна ревізія 2026-10-29).
 */
export function isRotateNoticeShown(): boolean {
  return rotateQuery().matches;
}

/** Підписатися на появу й зникнення заглушки «Поверніть телефон»; повертає відписку. */
export function onRotateNotice(listener: (shown: boolean) => void): () => void {
  const query = rotateQuery();
  const handler = (event: MediaQueryListEvent): void => listener(event.matches);
  query.addEventListener("change", handler);
  return () => query.removeEventListener("change", handler);
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

let probe: HTMLElement | null = null;

/** Безпечна зона в пікселях CSS: виріз камери й заокруглені кути екрана телефона. */
export function safeArea(): Insets {
  if (probe === null) {
    probe = document.createElement("div");
    probe.className = "safe-area";
    document.body.append(probe);
  }
  const style = getComputedStyle(probe);
  return {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  };
}
