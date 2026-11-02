// Маніфест пакета «Котячі сліди: шафа й паркет спальні» (рішення автора 2026-11-02, §9.12, «Котячі сліди в квартирі»): сліди,
// які після першої хвилі слідів ще лишалися намальованими на речах спальні, тепер — окремі накладки `env/trace/<слід>`
// (`CatTrace`, SVG `art/env/trace/<слід>.svg`), тож на старті спальня ціла.
//
// Накладка має те саме полотно, pivot і роздільність, що її господар: вигляд ставить її в ту саму точку трохи над ним.
// Геометрію беремо із запису господаря (пакет A4), а не дублюємо числа: так полотно й pivot збігаються точно й міняються
// разом із ним.

import type { ArtEntry, ArtId } from "../types";
import { MANIFEST as ROOMS } from "./a04-rooms";

/** Накладка-слід `id` на кадрі господаря `host` з пакета A4: його полотно, pivot, роздільність і стани. */
function traceOn(id: ArtId, host: ArtId): ArtEntry {
  const entry = ROOMS.find((e) => e.id === host);
  if (!entry) throw new Error(`Слід «${id}»: немає господаря «${host}»`);
  return {
    id,
    size: entry.size,
    pivot: entry.pivot,
    ...(entry.res === undefined ? {} : { res: entry.res }),
    ...(entry.states === undefined ? {} : { states: entry.states }),
  };
}

export const MANIFEST: readonly ArtEntry[] = [
  // Подряпини кігтями на лівому краю шухляди шафи в спальні (`wardrobe`: кіт уперше виліз на шафу, «Лазіння») — три борозни
  // woodLo між контуром шухляди й ручкою. Станів у шафи немає — немає їх і в накладки.
  traceOn("env/trace/wardrobe", "env/wardrobe"),
];
