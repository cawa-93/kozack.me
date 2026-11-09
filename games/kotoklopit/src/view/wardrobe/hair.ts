// Зачіски й кольори волосся (§5.1, `WARDROBE.md`, «Волосся»). Зачіска — кадри за головою й над очима на полотні голови
// (той самий pivot у шиї), колір — заливка `fill-hair`. Акцент — `accents.ts`.

import type { ArtId } from "../art/types";
import type { SlotFrames, WardrobeColor, WardrobeEntry, Wear } from "./types";

export type HairGroup = "пряме" | "хвилясте" | "кучеряве" | "кудлате" | "дреди й коси" | "коротко" | "кіберпанк";

export interface HairStyle extends WardrobeEntry {
  readonly group: HairGroup;
  /** Кадр за головою (слот `hair-back`; ззаду — поверх голови); null — немає. */
  readonly back: ArtId | null;
  /** Кадр над очима (слот `hair-front`); null — немає. */
  readonly front: ArtId | null;
  /** Чи є в кадрах маска акценту `fill-accent` (ряд «Акцент» активний). */
  readonly accent?: boolean;
}

/** Кіберпанк і лиса — рідше за звичайні зачіски у «Випадково». */
const RARE = 0.5;

export const HAIR_STYLES: readonly HairStyle[] = [
  { name: "коротка", group: "коротко", back: "person/hair-back/0", front: "person/hair-front/0" },
  { name: "довга", group: "пряме", back: "person/hair-back/1", front: "person/hair-front/1" },
  { name: "хвостик", group: "пряме", back: "person/hair-back/2", front: "person/hair-front/2" },
  { name: "кучері", group: "кучеряве", back: "person/hair-back/3", front: "person/hair-front/3" },
  { name: "каре", group: "пряме", back: "person/hair-back/bob", front: "person/hair-front/bob" },
  { name: "хвилі до плечей", group: "хвилясте", back: "person/hair-back/waves", front: "person/hair-front/waves" },
  { name: "афро", group: "кучеряве", back: "person/hair-back/afro", front: "person/hair-front/afro" },
  { name: "скуйовджена", group: "кудлате", back: "person/hair-back/shaggy", front: "person/hair-front/shaggy" },
  { name: "дреди", group: "дреди й коси", back: "person/hair-back/locs", front: "person/hair-front/locs" },
  { name: "коса на плече", group: "дреди й коси", back: "person/hair-back/braid", front: "person/hair-front/braid" },
  { name: "лиса", group: "коротко", back: null, front: null, weight: RARE },
  { name: "андеркат із чубом", group: "кіберпанк", back: "person/hair-back/undercut", front: "person/hair-front/undercut", accent: true, weight: RARE },
  { name: "неонові пасма", group: "кіберпанк", back: "person/hair-back/streaks", front: "person/hair-front/streaks", accent: true, weight: RARE },
  { name: "візерунок на скроні", group: "кіберпанк", back: "person/hair-back/shaved", front: "person/hair-front/shaved", accent: true, weight: RARE },
  // Дешеві: лише нова передня частина, задня — каре й «довгої».
  { name: "каре з чубчиком", group: "пряме", back: "person/hair-back/bob", front: "person/hair-front/bob-bangs" },
  { name: "довге з прямим проділом", group: "пряме", back: "person/hair-back/1", front: "person/hair-front/middle-part" },
];

/**
 * Кольори волосся. Три перші світліші чи інші, ніж просто «чорне, каштанове, русяве», бо інакше зливалися з контуром і шкірою:
 * - чорне — #463a40, як у чорного кота (`PIGMENT_LOOK.black`): темніше зливалося з чорнилом, і пасма, вихор, гумка хвостика й
 *   завитки кучерів зникали, а ззаду зачіска ставала плямою без форми;
 * - каштанове — темне червонясто-буре: темніше буре зливалося з чорнилом (пасма зникали), світліше — з дуже темною шкірою
 *   (зачіска того самого кольору, що й обличчя). Світлішим від шкіри його не відвести (стає русявим чи рудим), темнішим за
 *   чорне бути не може, тож — червоніше;
 * - русяве — попелясте «мишаче»: рудувато-буре майже збігалося зі смаглявою шкірою, і волосся зливалося з обличчям і шиєю.
 * Межі відмінності від шкіри, чорнила й одне від одного перевіряє `tests/compose.test.ts`.
 */
export const HAIR_COLORS: readonly WardrobeColor[] = [
  { name: "чорне", color: 0x463a40 },
  { name: "каштанове", color: 0x5a2216 },
  { name: "русяве", color: 0x8f8566 },
  { name: "біляве", color: 0xd9b45a },
  { name: "руде", color: 0xb8462f },
  { name: "сиве", color: 0x9aa3ab },
];

/** Кадри зачіски на голові. */
export function hairSkin(wear: Wear): SlotFrames<"hair-back" | "hair-front"> {
  const style = HAIR_STYLES[wear.hair] ?? HAIR_STYLES[0];
  return { "hair-back": style?.back ?? null, "hair-front": style?.front ?? null };
}
