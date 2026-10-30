// Маніфест арту (крок 16, GRAPHICS_PLAN.md: «Арт, маніфест і атласи»): усі записи з модулів категорій
// `./manifest/<файл>.ts`, перевірені й з пошуком за id. Спільного реєстру немає: модулі знаходить `import.meta.glob`,
// і за кожен файл відповідає рівно один пакет робіт. Без Phaser і DOM.
//
// `import.meta.glob` перетворює Vite (і Vitest), тож у Node без Vite цей модуль не завантажиться: конвеєр бере його через
// Vite (`server.ssrLoadModule` чи `runnerImport`).

import { ART_SEGMENT, ART_VIEWS, framesOf, isArtLayer, type ArtCategory, type ArtEntry, type ArtId } from "./types";

/**
 * Роздільність растеризації за замовчуванням: пікселів атласу на одиницю арту (`ArtEntry.res` — для окремого запису).
 *
 * Чому 2: на телефоні камера показує одиницю арту приблизно як 0,7 CSS px (дорослий кіт 56 одиниць ≈ 40 px, §9.4), а
 * щільні екрани мають 2–3 пікселі на CSS px, тобто 1,4–2,1 пікселя екрана на одиницю, — з 2 частини й іконки не
 * розмиваються. Бюджет — усі атласи разом ≤ 5 МБ (webp), і найбільше його їдять великі пласкі кадри: плити кімнат,
 * стіни, меблі. Плита вітальні — приблизно 1472 × 736 одиниць, при 2 це 2944 px, ширше за сторінку атласу 2048², тож
 * такі записи беруть меншу `res` (≈ 1,3) чи діляться на частини — це вирішують маніфест (F5) і конвеєр (F2).
 */
export const DEFAULT_RES = 2;

/** Категорії арту (перший сегмент id); `Record` перевіряє, що перелік повний. */
const CATEGORY_SET: Readonly<Record<ArtCategory, true>> = {
  env: true,
  item: true,
  mess: true,
  fx: true,
  cat: true,
  person: true,
  icon: true,
  ui: true,
  race: true,
};
export const ART_CATEGORIES = Object.keys(CATEGORY_SET) as readonly ArtCategory[];

/** Що не так із записами: по рядку на помилку; порожньо — усе гаразд. */
export function manifestProblems(entries: readonly ArtEntry[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  /** Кадр → id запису, якому він належить: кадри всіх записів мають бути різні (`env/fridge` + `open` і `env/fridge/open`). */
  const frames = new Map<string, string>();
  for (const entry of entries) {
    const id: string = entry.id;
    const where = `«${id}»`;
    const segments = id.split("/");
    const category = segments[0] ?? "";
    if (!Object.hasOwn(CATEGORY_SET, category)) problems.push(`${where}: невідома категорія «${category}»`);
    if (segments.length < 2 || !segments.every((segment) => ART_SEGMENT.test(segment))) {
      problems.push(`${where}: id — «категорія/назва[/варіант…]», сегменти з малих латинських літер, цифр і дефіса`);
    }
    if (ids.has(id)) problems.push(`${where}: id повторюється`);
    ids.add(id);

    const { w, h } = entry.size;
    if (!(Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0)) problems.push(`${where}: розмір має бути додатним`);
    if (!(Number.isFinite(entry.pivot.x) && Number.isFinite(entry.pivot.y))) problems.push(`${where}: pivot має бути числом`);
    if (entry.res !== undefined && !(Number.isFinite(entry.res) && entry.res > 0)) problems.push(`${where}: res має бути додатною`);
    for (const [name, point] of Object.entries(entry.points ?? {})) {
      if (!ART_SEGMENT.test(name)) problems.push(`${where}: точка «${name}» — сегмент з малих латинських літер, цифр і дефіса`);
      if (!(Number.isFinite(point.x) && Number.isFinite(point.y))) problems.push(`${where}: точка «${name}» має бути числом`);
    }
    for (const layer of repeated(entry.layers ?? [])) problems.push(`${where}: шар «${layer}» повторюється`);
    for (const layer of entry.layers ?? []) {
      if (!isArtLayer(layer)) problems.push(`${where}: невідомий шар «${layer}»`);
    }
    for (const view of repeated(entry.views ?? [])) problems.push(`${where}: ракурс «${view}» повторюється`);
    for (const view of entry.views ?? []) {
      if (!ART_VIEWS.includes(view)) problems.push(`${where}: невідомий ракурс «${view}»`);
    }
    if (entry.views?.length === 0) problems.push(`${where}: порожній перелік ракурсів (без ракурсів — не задавати views)`);
    for (const state of repeated(entry.states ?? [])) problems.push(`${where}: стан «${state}» повторюється`);
    for (const state of entry.states ?? []) {
      if (!ART_SEGMENT.test(state)) problems.push(`${where}: стан «${state}» — сегмент з малих латинських літер, цифр і дефіса`);
      if ((ART_VIEWS as readonly string[]).includes(state)) problems.push(`${where}: стан «${state}» збігається з назвою ракурсу`);
    }
    if (entry.states?.length === 0) problems.push(`${where}: порожній перелік станів (без станів — не задавати states)`);

    for (const { frame } of framesOf(entry)) {
      const owner = frames.get(frame);
      if (owner !== undefined && owner !== id) problems.push(`${where}: кадр «${frame}» уже є в записі «${owner}»`);
      frames.set(frame, id);
    }
  }
  return problems;
}

/** Що в переліку трапляється більше одного разу. */
function repeated<T>(items: readonly T[]): T[] {
  return items.filter((item, i) => items.indexOf(item) !== i);
}

/** Записи за id; якщо з записами щось не так (`manifestProblems`) — помилка з усім переліком. */
export function indexEntries(entries: readonly ArtEntry[]): ReadonlyMap<ArtId, ArtEntry> {
  const problems = manifestProblems(entries);
  if (problems.length > 0) throw new Error(`Маніфест арту:\n- ${problems.join("\n- ")}`);
  return new Map(entries.map((entry) => [entry.id, entry]));
}

/** Модулі категорій: шлях → їхній `MANIFEST`. Поки каталог порожній — порожньо. */
const MODULES = import.meta.glob<readonly ArtEntry[]>("./manifest/*.ts", { import: "MANIFEST", eager: true });

/** Усі записи: файли за абеткою, у файлі — у його порядку. */
const ENTRIES: readonly ArtEntry[] = Object.keys(MODULES)
  .sort()
  .flatMap((file) => MODULES[file] ?? []);
const INDEX = indexEntries(ENTRIES);

/** Усі записи маніфесту (галерея, перевірки). */
export function artEntries(): readonly ArtEntry[] {
  return ENTRIES;
}

/** Запис за id; якщо такого немає — undefined (тоді atlas.ts показує заглушку за `fallback`). */
export function artEntry(id: string): ArtEntry | undefined {
  return INDEX.get(id as ArtId);
}
