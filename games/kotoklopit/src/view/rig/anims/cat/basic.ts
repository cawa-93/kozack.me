// Анімації групи «basic» — пакет N1 «Кіт — базові» (крок 16, хвиля 2, `anim/ids.ts`). ЗАГЛУШКА шва хвилі 2: кожна назва групи —
// вихідна поза (`stub.ts`). Пакет замінює цей файл повністю: `export const CAT_BASIC = defineAnims(CAT_RIG, { … })` з усіма
// назвами `CAT_ANIM_GROUPS.basic` (повноту перевіряє реєстр `../index.ts`).

import { CAT_ANIM_GROUPS, CAT_ONE_SHOT_MS } from "../../../anim/ids";
import { CAT_RIG } from "../../defs/cat";
import { stubAnims } from "../stub";

export const CAT_BASIC = stubAnims(CAT_RIG, CAT_ANIM_GROUPS.basic, CAT_ONE_SHOT_MS);
