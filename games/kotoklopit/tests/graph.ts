// Точне порівняння двох графів даних для тестів готових анімацій (`animpack.test.ts`, `animbake.test.ts`): ті самі ключі
// в тому самому порядку, ті самі значення (`Object.is`: −0 — не 0) і ті самі спільні посилання — об'єкт, який в одному
// графі трапляється в кількох місцях, у другому в тих самих місцях теж один.

/** Перша відмінність між графами (шлях і що не так); null — графи однакові. */
export function graphDifference(a: unknown, b: unknown): string | null {
  const ab = new Map<object, object>();
  const ba = new Map<object, object>();
  const walk = (x: unknown, y: unknown, at: string): string | null => {
    if (x === null || typeof x !== "object" || y === null || typeof y !== "object") {
      return Object.is(x, y) ? null : `${at}: ${String(x)} ≠ ${String(y)}`;
    }
    const known = ab.get(x);
    if (known !== undefined || ba.has(y)) return known === y && ba.get(y) === x ? null : `${at}: спільне посилання не збігається`;
    ab.set(x, y);
    ba.set(y, x);
    if (Object.getPrototypeOf(x) !== Object.getPrototypeOf(y)) return `${at}: різний прототип`;
    const xs = Reflect.ownKeys(x);
    const ys = Reflect.ownKeys(y);
    if (xs.length !== ys.length || xs.some((key, i) => key !== ys[i])) return `${at}: ключі [${xs.map(String).join(", ")}] ≠ [${ys.map(String).join(", ")}]`;
    for (const key of xs) {
      const problem = walk((x as Record<PropertyKey, unknown>)[key], (y as Record<PropertyKey, unknown>)[key], `${at}.${String(key)}`);
      if (problem !== null) return problem;
    }
    return null;
  };
  return walk(a, b, "$");
}
