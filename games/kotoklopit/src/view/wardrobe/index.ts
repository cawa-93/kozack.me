// Гардероб персонажа (§5.1, `WARDROBE.md`): вигляд, як його вдягнено (`wearOf`), — єдине місце, що читає необов'язкові поля
// `Look` з типовими значеннями й застосовує правила поєднань. Реєстри — по файлу на ділянку (`hair.ts`, `tops.ts`…).

import type { Look } from "../../sim/types";
import { extraFrameOf } from "../art/placement";
import type { ArtId } from "../art/types";
import { accentFits, HAIR_ACCENTS } from "./accents";
import { BUILDS, FACES, IRIS_COLORS, SKIN_TONES } from "./body";
import { BOTTOM_CUTS } from "./bottoms";
import { BOTTOM_COLORS, SHOE_COLORS, TOP_COLORS } from "./clothes";
import { HAIR_COLORS, HAIR_STYLES } from "./hair";
import { PATTERNS, patternFits } from "./patterns";
import { SHOE_CUTS } from "./shoes";
import { TOP_CUTS } from "./tops";
import type { Wear } from "./types";

export type { Garment, SlotFrames, WardrobeColor, WardrobeEntry, Wear } from "./types";

/** Усі поля `Look` (`Record` змушує перелічити кожне нове). */
const KEYS: Readonly<Record<keyof Look, true>> = {
  face: true,
  skin: true,
  hair: true,
  hairColor: true,
  eyes: true,
  build: true,
  top: true,
  bottom: true,
  shoes: true,
  topCut: true,
  topPattern: true,
  bottomCut: true,
  bottomPattern: true,
  shoeCut: true,
  hairAccent: true,
};
export const LOOK_KEYS = Object.keys(KEYS) as readonly (keyof Look)[];

/** Номер варіанта з `n`: немає поля чи не число — 0, поза реєстром — по колу (як завжди було з кольорами й формами). */
function within(value: number | undefined, n: number): number {
  if (value === undefined || !Number.isFinite(value) || n <= 0) return 0;
  return ((Math.trunc(value) % n) + n) % n;
}

/**
 * Вигляд, як його вдягнено: поля з типовими значеннями (немає — 0), номери в межах реєстрів (`within`), і поєднання (`WARDROBE.md`,
 * «Поєднання»): візерунок, що не лягає на фасон, — однотонний; акцент у зачіски без маски — немає; верх із власним низом
 * задає фасон і візерунок низу. Що обрано в `Look`, не змінюється: повернувся фасон — повернувся й візерунок.
 */
export function wearOf(look: Partial<Look>): Wear {
  const hair = within(look.hair, HAIR_STYLES.length);
  const topCut = within(look.topCut, TOP_CUTS.length);
  const own = TOP_CUTS[topCut]?.bottom;
  const suit = own !== undefined;
  const bottomCut = within(suit ? own : look.bottomCut, BOTTOM_CUTS.length);
  const pattern = (value: number | undefined, garment: "top" | "bottom", cut: number): number => {
    const p = within(value, PATTERNS.length);
    return patternFits(p, garment, cut) ? p : 0;
  };
  const topPattern = pattern(look.topPattern, "top", topCut);
  return {
    face: within(look.face, FACES.length),
    skin: within(look.skin, SKIN_TONES.length),
    hair,
    hairColor: within(look.hairColor, HAIR_COLORS.length),
    eyes: within(look.eyes, IRIS_COLORS.length),
    build: within(look.build, BUILDS.length),
    top: within(look.top, TOP_COLORS.length),
    bottom: within(look.bottom, BOTTOM_COLORS.length),
    shoes: within(look.shoes, SHOE_COLORS.length),
    topCut,
    topPattern,
    bottomCut,
    bottomPattern: pattern(suit ? topPattern : look.bottomPattern, "bottom", bottomCut),
    shoeCut: within(look.shoeCut, SHOE_CUTS.length),
    hairAccent: accentFits(hair) ? within(look.hairAccent, HAIR_ACCENTS.length) : 0,
    suit,
  };
}

/** Чи вигляди однакові (поля без значення — 0). Без нових об'єктів: персонаж питає щокадру. */
export function sameLook(a: Look, b: Look): boolean {
  for (const key of LOOK_KEYS) if ((a[key] ?? 0) !== (b[key] ?? 0)) return false;
  return true;
}

/**
 * Вигляди, у яких хоч раз трапляється кожен варіант, що міняє кадри: обличчя, зачіска, фасон верху й кожен низ із кожним
 * взуттям (їхні поєднання міняють кадри) — за кожної статури. Для переліку кадрів (`personVariants`) і тестів.
 */
export function personLooks(): Wear[] {
  const looks: Look[] = [];
  const base: Look = { face: 0, skin: 0, hair: 0, hairColor: 0, eyes: 0, build: 0, top: 0, bottom: 0, shoes: 0 };
  for (let build = 0; build < BUILDS.length; build++) {
    for (let face = 0; face < FACES.length; face++) looks.push({ ...base, build, face });
    for (let hair = 0; hair < HAIR_STYLES.length; hair++) looks.push({ ...base, build, hair });
    for (let topCut = 0; topCut < TOP_CUTS.length; topCut++) looks.push({ ...base, build, topCut });
    for (let bottomCut = 0; bottomCut < BOTTOM_CUTS.length; bottomCut++) {
      for (let shoeCut = 0; shoeCut < SHOE_CUTS.length; shoeCut++) looks.push({ ...base, build, bottomCut, shoeCut });
    }
  }
  return looks.map(wearOf);
}

/** Плями фасонів (`stains` записів): кадр → накладка плям; будується раз. */
let stainMap: ReadonlyMap<string, ArtId | null> | null = null;

function stains(): ReadonlyMap<string, ArtId | null> {
  if (stainMap) return stainMap;
  const map = new Map<string, ArtId | null>();
  for (const cut of [...TOP_CUTS, ...BOTTOM_CUTS, ...SHOE_CUTS]) for (const [id, extra] of Object.entries(cut.stains ?? {})) map.set(id, extra);
  stainMap = map;
  return map;
}

/**
 * Кадр накладок `extra-*` для кадру частини кота чи персонажа: плями з запису фасону (`stains`: спільна накладка чи «без
 * плям»), інакше — за назвою (`extraFrameOf`, `<частина>-extra`). null — накладок немає.
 */
export function partExtraFrame(frame: string): string | null {
  const own = stains();
  if (own.size > 0 && frame.startsWith("person/")) {
    const parts = frame.split("/");
    for (let n = parts.length; n >= 2; n--) {
      const extra = own.get(parts.slice(0, n).join("/"));
      if (extra !== undefined) return extra === null ? null : [extra, ...parts.slice(n)].join("/");
    }
  }
  return extraFrameOf(frame);
}
