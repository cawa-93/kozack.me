// Запити звуку й музики (§8.10, §11.4а). Мобільна мережа буває не впалою, а завислою: запит без тайм-ауту не закінчується ніколи
// й займає своє місце в черзі назавжди. Але повільна лінія — ще не зависла: тайм-аут на весь запит не дав би їй докачати нічого
// великого, тож скасовуємо лише застій.

/**
 * Байти файлу. Запит скасовується, лише коли застиг: за `stallMs` не прийшло ні заголовків, ні нового шматка тіла, — а повільна,
 * але жива лінія докачує скільки завгодно довго. Браузер без потокового тіла — тайм-аут лише до заголовків. Збій мережі, застій
 * чи відповідь не 2xx — виняток.
 */
export async function fetchBytes(url: string, stallMs: number): Promise<ArrayBuffer> {
  const controller = typeof AbortController === "undefined" ? null : new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = (): void => {
    clearTimeout(timer);
    if (controller) timer = setTimeout(() => controller.abort(), stallMs);
  };
  try {
    arm();
    const response = await fetch(url, controller ? { signal: controller.signal } : undefined);
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    const reader = response.body?.getReader();
    if (!reader) {
      clearTimeout(timer);
      return await response.arrayBuffer();
    }
    const parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      arm();
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      size += value.byteLength;
    }
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const part of parts) {
      bytes.set(part, at);
      at += part.byteLength;
    }
    return bytes.buffer;
  } finally {
    clearTimeout(timer);
  }
}
