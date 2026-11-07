// Знайомство з новим котом (§9.7): картка кота поверх гри. У полі — згенероване ім'я, його можна змінити чи лишити.

import { isKitten } from "../sim/cat";
import type { Cat, GameState } from "../sim/types";
import { CAT_INTRO_TEXTS } from "../texts";
import { catFacts } from "./cards";
import { catProfile } from "./catprofile";
import type { Card } from "./overlay";

export function catIntroCard(state: GameState, cat: Cat, onDone: () => void): Card {
  return {
    kicker: isKitten(cat) ? CAT_INTRO_TEXTS.kitten : CAT_INTRO_TEXTS[cat.sex],
    title: CAT_INTRO_TEXTS.title,
    body: [catProfile(cat, catFacts(state, cat))],
    actions: [{ label: CAT_INTRO_TEXTS.done, primary: true, onSelect: onDone }],
    onDismiss: onDone,
  };
}
