// Реєстр анімацій скелетів (крок 16, шов хвилі 2): усі групи кота й персонажа в одному словнику за назвою (`anim/ids.ts`).
// За ним вигляд (`iso/*`, T1 і T2) грає анімацію, яку обрали `catAnim` і `personAnim`. Тип словника перевіряє повноту:
// назва без анімації в групі — помилка типів. Галерея знаходить групи сама (`anims/*/*.ts`), цей файл їй не потрібен.

import type { CatAnimId, PersonAnimId } from "../../anim/ids";
import type { CAT_RIG } from "../defs/cat";
import type { PERSON_RIG } from "../defs/person";
import type { AnimOf } from "../types";
import { CAT_BASIC } from "./cat/basic";
import { CAT_BEHAVIOR } from "./cat/behavior";
import { CAT_FEELINGS } from "./cat/feelings";
import { PERSON_CHORES } from "./person/chores";
import { PERSON_MOVE } from "./person/move";

/** Усі анімації кота: назва → анімація. */
export const CAT_ANIMS: Readonly<Record<CatAnimId, AnimOf<typeof CAT_RIG>>> = { ...CAT_BASIC, ...CAT_BEHAVIOR, ...CAT_FEELINGS };

/** Усі анімації персонажа: назва → анімація. */
export const PERSON_ANIMS: Readonly<Record<PersonAnimId, AnimOf<typeof PERSON_RIG>>> = { ...PERSON_MOVE, ...PERSON_CHORES };
