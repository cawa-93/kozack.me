// Пестощі двох котів одразу (§9.12, «Двох одразу»): хто другий під руку й чия рука на якому коті. Самі пестощі — `actions.ts`.

import { PETTING } from "./config";
import { isNewborn } from "./reproduction";
import type { Cat, GameState, PetActivity, PetHand } from "./types";

/** Рука, що гладить кота `cat` у цих пестощах, або null. */
export function petHandOf(activity: PetActivity, cat: number): PetHand | null {
  if (activity.cat === cat) return activity;
  return activity.second?.cat === cat ? activity.second : null;
}

/** Рука персонажа на коті `cat` зараз (і та, з-під якої він уже вийшов, поки кнопку тримають) або null. */
export function handOn(state: GameState, cat: number): PetHand | null {
  const activity = state.character.activity;
  return activity?.kind === "pet" ? petHandOf(activity, cat) : null;
}

/** Кіт поруч просить ласки: прийшов по увагу, а не по їжу, і під рукою. */
function asksToPet(state: GameState, cat: Cat): boolean {
  const body = state.character.body;
  return (
    cat.away === null &&
    cat.act.kind === "attention" &&
    cat.act.forFood !== true &&
    !isNewborn(cat) &&
    Math.hypot(cat.x - body.x, cat.y - body.y) <= PETTING.stayReach
  );
}

/**
 * Другий кіт під другу руку, коли пестощі `first` починаються: найближчий інший, що просить ласки, — якщо разом із `first`
 * просять щонайменше двоє. Інакше null.
 */
export function secondToPet(state: GameState, first: Cat): Cat | null {
  const body = state.character.body;
  let asking = asksToPet(state, first) ? 1 : 0;
  let best: Cat | null = null;
  let bestDistance = Infinity;
  for (const cat of state.cats) {
    if (cat.id === first.id || !asksToPet(state, cat)) continue;
    asking += 1;
    const distance = Math.hypot(cat.x - body.x, cat.y - body.y);
    if (distance < bestDistance) {
      best = cat;
      bestDistance = distance;
    }
  }
  return asking >= 2 ? best : null;
}
