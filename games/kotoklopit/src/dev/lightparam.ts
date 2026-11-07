// Режим розробки (§11.5, §8.9): світло доби на задану хвилину — `?light=HH:MM` чи назва (`dawn`, `morning`, `evening`,
// `dusk`, `night`, `day`), або `?light=off` — без світла доби зовсім (звірка знімків). Ті самі назви — у рядку «Світло» панелі.

/** Назви — хвилини доби: світанок, теплий ранок, вечір, лампи щойно ввімкнулися, ніч, день. */
export const LIGHT_PRESETS: Readonly<Record<string, number>> = {
  dawn: 5 * 60 + 30,
  morning: 7 * 60 + 30,
  evening: 19 * 60,
  dusk: 20 * 60 + 5,
  night: 22 * 60 + 30,
  day: 12 * 60,
};

/** Значення `?light=`: хвилина доби, `"off"` або `null` — не задано чи не розібрано. */
export function parseLight(value: string | null): number | "off" | null {
  if (value === null) return null;
  const v = value.trim().toLowerCase();
  if (v === "off") return "off";
  const preset = LIGHT_PRESETS[v];
  if (preset !== undefined) return preset;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}
