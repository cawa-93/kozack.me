// Анімації групи «chores» — пакет N4b «Персонаж — справи» (крок 16, хвиля 2, `anim/ids.ts`). ЗАГЛУШКА шва хвилі 2: кожна назва групи —
// вихідна поза (`stub.ts`). Пакет замінює цей файл повністю: `export const PERSON_CHORES = defineAnims(PERSON_RIG, { … })` з усіма
// назвами `PERSON_ANIM_GROUPS.chores` (повноту перевіряє реєстр `../index.ts`).

import { PERSON_ANIM_GROUPS, PERSON_BY_PROGRESS, PERSON_ONE_SHOT_MS } from "../../../anim/ids";
import { PERSON_RIG } from "../../defs/person";
import { stubAnims } from "../stub";

export const PERSON_CHORES = stubAnims(PERSON_RIG, PERSON_ANIM_GROUPS.chores, PERSON_ONE_SHOT_MS, PERSON_BY_PROGRESS);
