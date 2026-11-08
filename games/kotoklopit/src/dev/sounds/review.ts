// Рішення автора щодо звуків (сторінка `sounds.html`): затвердити, замінити чи прибрати. Dev-сервер пише їх у
// `audio/sfx/review.json` (`scripts/audio/reviewplugin.ts`), звідти їх бере наступна правка звуків. Чисті функції — для тестів.

export const DECISIONS = ["ok", "replace", "delete"] as const;
export type Decision = (typeof DECISIONS)[number];

export interface Review {
  /** null — лише коментар, рішення ще немає. */
  decision: Decision | null;
  /** «Замінити» чи «прибрати» звук із кількома файлами: які саме; усі — увесь звук. */
  variants?: string[];
  comment?: string;
  /** Відбиток звуку на мить рішення (`soundPrint`): інший — звук відтоді змінили, рішення треба переглянути. */
  print: string;
  /** Коли вирішено, ISO. */
  at: string;
}

/** Ключ — `група/звук`. */
export type Reviews = Record<string, Review>;

/** Що сторінка знає про звук, щоб порівняти його з тим, про який вирішували. */
export interface SoundPrintInput {
  gain: number;
  files: readonly { name: string; hash: string }[];
}

/** Відбиток звуку: файли з хешами рецепта й оригіналу та гучність у групі. */
export function soundPrint(sound: SoundPrintInput): string {
  return `${sound.gain}|${sound.files.map((f) => `${f.name}:${f.hash}`).join(",")}`;
}

/** Стан звуку на сторінці: без рішення, рішення застаріло (звук змінено) чи саме рішення. */
export type ReviewStatus = "none" | "stale" | Decision;

export function reviewStatus(review: Review | undefined, print: string): ReviewStatus {
  if (!review || review.decision === null) return "none";
  return review.print === print ? review.decision : "stale";
}

export const FILTERS = ["all", "none", "stale", ...DECISIONS] as const;
export type Filter = (typeof FILTERS)[number];

export function matchesFilter(status: ReviewStatus, filter: Filter): boolean {
  return filter === "all" || status === filter;
}

/** Скільки звуків у кожному стані. */
export function countStatuses(statuses: Iterable<ReviewStatus>): Record<Filter, number> {
  const counts: Record<Filter, number> = { all: 0, none: 0, stale: 0, ok: 0, replace: 0, delete: 0 };
  for (const status of statuses) {
    counts.all++;
    counts[status]++;
  }
  return counts;
}

/**
 * Нове рішення: та сама кнопка вдруге знімає рішення (коментар лишається). «Замінити» й «прибрати» звуку з кількома файлами
 * спершу стосуються всіх файлів: автор знімає позначки з тих, що звучать добре. Немає ні рішення, ні коментаря — null.
 */
export function decide(review: Review | undefined, decision: Decision, files: readonly string[], print: string, now: string): Review | null {
  const same = review?.decision === decision && review.print === print;
  const next: Review = { decision: same ? null : decision, print, at: now };
  if (next.decision !== null && next.decision !== "ok" && files.length > 1) {
    const kept = review?.decision === next.decision ? review.variants?.filter((v) => files.includes(v)) : undefined;
    next.variants = kept && kept.length > 0 ? kept : [...files];
  }
  if (review?.comment) next.comment = review.comment;
  return next.decision === null && !next.comment ? null : next;
}

/** Позначка файлу-варіанта при «замінити» чи «прибрати». Порядок — як у звуку. */
export function toggleVariant(review: Review, file: string, files: readonly string[], now: string): Review {
  const chosen = new Set(review.variants ?? files);
  if (chosen.has(file)) chosen.delete(file);
  else chosen.add(file);
  return { ...review, variants: files.filter((f) => chosen.has(f)), at: now };
}

/** Новий коментар; порожній — прибрати. Без рішення й без коментаря — null (запис видаляється). */
export function withComment(review: Review | undefined, comment: string, print: string, now: string): Review | null {
  const text = comment.trim();
  const next: Review = review ? { ...review, at: now } : { decision: null, print, at: now };
  if (text) next.comment = text;
  else delete next.comment;
  return next.decision === null && !next.comment ? null : next;
}
