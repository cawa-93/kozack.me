// «Велика коробка» (§4.1, `DAY_MODIFIERS.md`): увесь день у вітальні стоїть велика порожня коробка (`BIG_BOX`, `hasBigBox`), а
// вночі її виносять на макулатуру. Коти сплять і ховаються в ній, як у картонному будиночку, граються в ній, як з іграшкою
// наодинці, і точать об неї кігті замість дивана (§9.12). Персонаж із нею нічого не робить.
//
// Коробка картонна й відкрита, тож вона — як дешевий будиночок: вага сну й схованки `HOUSE_SLEEP.cheap`, наляканий не
// заспокоюється швидше (`HOUSE_CALM` — лише повстяний), бонусу чи штрафу якості немає — її не купували. Гніздом вона не стає:
// гнізда — лише в будиночках (§9.8), а до ночі пологів коробки вже немає.

import { idleAct } from "./cat";
import { HOUSE_SLEEP, MODIFIERS } from "./config";
import { BIG_BOX, BIG_BOX_SCRATCH, catSpotNear, hasBigBox, withThing } from "./home";
import type { Rng } from "./rng";
import type { Cat, GameState, Vec } from "./types";

/** Клітинка коробки: її місце могло бути зайняте, тоді вона стоїть поруч (§8.7, «Що ставить гра»). */
export function bigBoxAt(state: Pick<GameState, "home">): Vec {
  return withThing(state, "big-box", BIG_BOX);
}

/** Звідки кіт дере коробку: збоку від неї там, де вона стоїть, а зайнято річчю — з вільної клітинки поруч (§8.7). */
export function bigBoxScratchAt(state: Pick<GameState, "home" | "modifiers" | "today">): Vec {
  return { ...catSpotNear(state, withThing(state, "big-box", BIG_BOX_SCRATCH)) };
}

/** Ціль дії кота, що в коробці чи йде до неї: сон, схованка, гра; і дряпання — збоку від неї (`BIG_BOX_SCRATCH`). */
export const BIG_BOX_TARGET = "big-box";

/**
 * У коробці вміщується один кіт: поки інший спить, ховається чи грається в ній (або вже йде туди), її не обирають. Хто дере
 * коробку, стоїть ззовні й місця в ній не займає.
 */
export function bigBoxFree(state: GameState, cat: Cat | null): boolean {
  if (!hasBigBox(state)) return false;
  return !state.cats.some((other) => other !== cat && other.away === null && other.act.target === BIG_BOX_TARGET && other.act.kind !== "scratch");
}

/** Коробка як місце для сну чи схованки (§9.12, «Будиночки»): з вагою картонного будиночка; немає чи зайнята — null. */
export function bigBoxSpot(state: GameState, cat: Cat | null): { weight: number; value: { at: Vec; target: string } } | null {
  return bigBoxFree(state, cat) ? { weight: HOUSE_SLEEP.cheap, value: { at: { ...bigBoxAt(state) }, target: BIG_BOX_TARGET } } : null;
}

/** Дряпання, що пішло б у диван, іде в коробку з шансом `MODIFIERS.bigBox.scratch`; без коробки кидка немає (потоки §6.1). */
export function scratchesBigBox(state: GameState, rng: Rng): boolean {
  return hasBigBox(state) && rng.chance(MODIFIERS.bigBox.scratch);
}

/** Точка на клітинці коробки, поки вона стоїть: кіт там — у коробці, хоч би й ішов крізь неї. */
export function inBigBox(state: Pick<GameState, "home" | "modifiers" | "today">, p: Vec): boolean {
  if (!hasBigBox(state)) return false;
  const box = bigBoxAt(state);
  return Math.floor(p.x) === box.x && Math.floor(p.y) === box.y;
}

/**
 * Персонаж ліг спати — коробку винесли (§4.1). Хто спав у ній чи йшов туди спати, спить там само на підлозі; хто ховався, грався
 * чи дер її, кидає це й вирішує заново — далі ніч веде його, як будь-якого кота.
 */
export function binBigBox(state: GameState): void {
  if (!hasBigBox(state)) return;
  state.today.bigBoxGone = true;
  for (const cat of state.cats) {
    if (cat.act.target !== BIG_BOX_TARGET) continue;
    if (cat.act.kind === "sleep") cat.act.target = null;
    else cat.act = idleAct();
  }
}
