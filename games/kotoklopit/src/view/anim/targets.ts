// Де ціль дії кота (`cat.act.target`) на підлозі, у клітинках (крок 16): до неї кіт повертається, коли стоїть (`catFacing`).
// Ціль у симі — рядок: інший кіт (`cat:`, `kitten:`, `licked:`, `declined:`, `pile:`, `cuddle:`), річ котячого кутка
// (`item:`, `sniff:`, `shun:`, `guard:item:`), дрібничка (`trinket:`), річ квартири за id, місце (`rug`, `doorframe`, `paper`,
// `wire`, `cabinet`, `big-box`) чи персонаж (`character`, `food`, `feet`). Без Phaser.

import { BIG_BOX_TARGET } from "../../sim/bigbox";
import { BIG_BOX, centerOf, DOORFRAME, itemPoint, objectById, OBJECTS, placedObject, RUG, TOILET_ROLL, trinketTile, withThing } from "../../sim/home";
import type { Cat, GameState, TrinketKind, Vec } from "../../sim/types";

/** Цілі-коти: префікс → інший кіт за id. */
const CAT_PREFIXES: ReadonlySet<string> = new Set(["cat", "kitten", "licked", "declined", "pile", "cuddle"]);
/** Цілі-речі котячого кутка: префікс → річ за id. */
const ITEM_PREFIXES: ReadonlySet<string> = new Set(["item", "sniff", "shun"]);
const OBJECT_IDS: ReadonlySet<string> = new Set(OBJECTS.map((o) => o.id));

const center = (v: Vec): Vec => ({ x: v.x + 0.5, y: v.y + 0.5 });

/** Точка цілі за рядком цілі; null — ціль не точка (сам кіт, «play», «won») чи її вже немає. */
export function targetPoint(state: GameState, target: string | null): Vec | null {
  if (target === null) return null;
  const colon = target.indexOf(":");
  if (colon > 0) {
    const kind = target.slice(0, colon);
    const rest = target.slice(colon + 1);
    if (kind === "guard") return targetPoint(state, rest);
    if (kind === "trinket") return center(trinketTile(rest as TrinketKind));
    const id = Number(rest);
    if (CAT_PREFIXES.has(kind)) {
      const other = state.cats.find((c) => c.id === id);
      return other && other.away === null ? { x: other.x, y: other.y } : null;
    }
    if (ITEM_PREFIXES.has(kind)) {
      const item = state.home.items.find((i) => i.id === id);
      return item ? itemPoint(item) : null;
    }
    return null;
  }
  switch (target) {
    case "character":
    case "food":
    case "feet":
      return state.trip === null ? { x: state.character.body.x, y: state.character.body.y } : null;
    case "rug":
      return centerOf(RUG);
    case "doorframe":
      return center(DOORFRAME);
    case "paper":
    case "roll":
      return TOILET_ROLL;
    case "wire":
      // Гризе дріт біля комп'ютера — до комп'ютера (§9.12, «Гризіння»).
      return centerOf(objectById("computer"));
    case "cabinet":
      // Лапає дверцята шафки з кормом, стоячи збоку від неї (§9.12, «Кмітливість у бешкеті»). Шафку, ящики й велику коробку
      // гра могла поставити не на своє місце (§8.7, «Що ставить гра»).
      return centerOf(placedObject(state, "cat-cabinet"));
    case BIG_BOX_TARGET:
      // Велика коробка (§4.1): дере її, стоячи збоку.
      return center(withThing(state, "big-box", BIG_BOX));
    default:
      return OBJECT_IDS.has(target) ? centerOf(placedObject(state, target)) : null;
  }
}

/** Точка цілі дії кота. */
export function actTargetPoint(state: GameState, cat: Cat): Vec | null {
  return targetPoint(state, cat.act.target);
}
