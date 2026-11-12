// Готові дані анімацій (§2.1, «Анімація»): текст, яким збирання кладе в код гри вже пораховані доріжки
// (`scripts/anims/`), і його читання під час запуску. Без Phaser і DOM, без імпортів: модуль завантажують і гра, і
// збирання, і Node-тести.
//
// Текст — JSON `[вузли, зв'язки]`. Вузли — спершу корені (анімації) в переданому порядку, далі об'єкти, на які є кілька
// посилань (спільна доріжка двох кісток, перевизначення ракурсу кількох анімацій). Там, де один вузол посилається на
// інший, у JSON стоїть 0, а зв'язок `[вузол, на який вузол, …шлях]` ставить посилання на місце. Так об'єкт, спільний у
// коді, лишається одним об'єктом і в готових даних, а читання — один `JSON.parse` і кілька десятків присвоєнь, без обходу
// всіх ключів.

type Path = (string | number)[];
type Node = Record<string | number, unknown>;

const plain = (value: object): boolean => Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype;

/**
 * Записати корені (об'єкти анімацій) у текст. Передає лише те, що JSON відтворює точно: скінченні числа (−0 теж), рядки,
 * булеві, null, звичайні об'єкти й масиви; решта (undefined, NaN, функції, заморожені об'єкти, кола) — помилка з місцем
 * (`$<номер кореня>.шлях`), бо мовчазна заміна дала б гру, що відрізняється від коду.
 */
export function packAnims(roots: readonly object[]): string {
  // Скільки посилань на кожен об'єкт: корені й об'єкти з кількома посиланнями стають вузлами.
  const refs = new Map<object, number>();
  const open = new Set<object>();
  const count = (value: unknown, at: string): void => {
    if (value === null || typeof value !== "object") return;
    if (open.has(value)) throw new Error(`Готові анімації, ${at}: коло посилань`);
    const seen = refs.get(value) ?? 0;
    refs.set(value, seen + 1);
    if (seen > 0) return;
    if (!plain(value)) throw new Error(`Готові анімації, ${at}: не звичайний об'єкт чи масив`);
    if (Object.isFrozen(value)) throw new Error(`Готові анімації, ${at}: заморожений об'єкт`);
    open.add(value);
    const keys = Reflect.ownKeys(value);
    if (Array.isArray(value)) {
      // Власні ключі масиву без дір і зайвих властивостей — рівно індекси й `length`.
      if (keys.length !== value.length + 1) throw new Error(`Готові анімації, ${at}: масив із дірою чи зайвою властивістю`);
      value.forEach((item, i) => count(item, `${at}[${i}]`));
    } else {
      for (const key of keys) {
        if (typeof key !== "string") throw new Error(`Готові анімації, ${at}: ключ-символ`);
        count((value as Node)[key], `${at}.${key}`);
      }
    }
    open.delete(value);
  };
  roots.forEach((root, i) => count(root, `$${i}`));

  const index = new Map<object, number>();
  const nodes: object[] = [];
  const add = (value: object): void => {
    if (!index.has(value)) index.set(value, nodes.push(value) - 1);
  };
  roots.forEach(add);
  for (const [value, n] of refs) if (n > 1) add(value);

  const links: Path[] = [];
  const write = (value: unknown, node: number, path: Path, at: string): string => {
    if (value === null) return "null";
    switch (typeof value) {
      case "number":
        if (!Number.isFinite(value)) throw new Error(`Готові анімації, ${at}: число ${value}`);
        // JSON.stringify пише −0 як 0, а текст «-0» JSON.parse читає як −0.
        return Object.is(value, -0) ? "-0" : JSON.stringify(value);
      case "string":
      case "boolean":
        return JSON.stringify(value);
      case "object":
        break;
      default:
        throw new Error(`Готові анімації, ${at}: ${typeof value}`);
    }
    const other = index.get(value);
    if (other !== undefined && path.length > 0) {
      links.push([node, other, ...path]);
      return "0";
    }
    if (Array.isArray(value)) return `[${value.map((item, i) => write(item, node, [...path, i], `${at}[${i}]`)).join(",")}]`;
    return `{${Object.keys(value)
      .map((key) => `${JSON.stringify(key)}:${write((value as Node)[key], node, [...path, key], `${at}.${key}`)}`)
      .join(",")}}`;
  };
  const where = (i: number): string => (i < roots.length ? `$${i}` : `спільний об'єкт ${i}`);
  // Індексний цикл: спільні вузли вже всі в переліку, але запис іде по одному вузлу, щоб шлях зв'язку був від свого вузла.
  const texts: string[] = [];
  for (let i = 0; i < nodes.length; i++) texts.push(write(nodes[i], i, [], where(i)));
  return `[[${texts.join(",")}],${JSON.stringify(links)}]`;
}

/** Прочитати текст `packAnims`: вузли зі зв'язками на місцях; перші — корені в порядку запису. */
export function unpackAnims(text: string): unknown[] {
  const [nodes, links] = JSON.parse(text) as [Node[], Path[]];
  for (const link of links) {
    const last = link.length - 1;
    let at = nodes[link[0] as number] as Node;
    for (let i = 2; i < last; i++) at = at[link[i] as string | number] as Node;
    at[link[last] as string | number] = nodes[link[1] as number];
  }
  return nodes;
}
