// Вхід для `animbake.test.ts`: усі групи анімацій і їхній реєстр одним графом модулів — тест завантажує його з плагіном
// готових анімацій (`scripts/anims/plugin.ts`) і порівнює з тим, що дає код.

import * as index from "../../src/view/rig/anims/index";

export const groups = import.meta.glob<Record<string, unknown>>("../../src/view/rig/anims/*/*.ts", { eager: true });
export { index };
