// Запити звуку й музики (§8.10, §11.4а). Мобільна мережа буває не впалою, а завислою: запит без тайм-ауту не закінчується ніколи
// й займає своє місце в черзі назавжди.

/** Сигнал, що скасовує запит через `ms`; браузер без `AbortSignal.timeout` (Safari до 16) — той самий через таймер. */
export function timeoutSignal(ms: number): AbortSignal | null {
  if (typeof AbortSignal === "undefined") return null;
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  if (typeof AbortController === "undefined") return null;
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}
