// Готові дані всіх груп анімацій (§2.1, «Анімація»): модулі `src/view/rig/anims/<скелет>/<група>.ts` виконуються тут, під
// час збирання, а їхні словники анімацій стають текстом для коду гри (`bake.ts`). Цей файл завантажує Vite
// (`runnerImport` у `plugin.ts`): тут код гри з імпортами без розширень і `import.meta.glob`.

/// <reference types="vite/client" />

import { packAnims } from "../../src/view/rig/animpack";
import type { GroupData } from "./bake";

const MODULES = import.meta.glob<Record<string, unknown>>("../../src/view/rig/anims/*/*.ts", { eager: true });

/**
 * Дані кожної групи за назвою `<скелет>/<група>`. Словник анімацій — кожен експортований об'єкт модуля (решта експортів
 * групи — числа й функції); анімація під кількома назвами чи в кількох словниках модуля — один корінь.
 */
export function groupData(): Record<string, GroupData> {
  const out: Record<string, GroupData> = {};
  for (const [file, module] of Object.entries(MODULES)) {
    const name = /([^/]+\/[^/]+)\.ts$/.exec(file)?.[1] ?? file;
    const roots: object[] = [];
    const index = new Map<object, number>();
    const dicts: Record<string, Record<string, number>> = {};
    for (const [dict, anims] of Object.entries(module)) {
      if (typeof anims !== "object" || anims === null) continue;
      const indexes: Record<string, number> = {};
      for (const [anim, value] of Object.entries(anims)) {
        if (typeof value !== "object" || value === null) throw new Error(`Готові анімації, ${name}: «${dict}.${anim}» — не анімація`);
        let at = index.get(value);
        if (at === undefined) {
          at = roots.push(value) - 1;
          index.set(value, at);
        }
        indexes[anim] = at;
      }
      dicts[dict] = indexes;
    }
    out[name] = { text: packAnims(roots), dicts };
  }
  return out;
}
