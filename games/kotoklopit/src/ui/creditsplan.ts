// Титри життя (§4.2): з чого складається стрічка й у якому порядку. Без DOM — порядок перевіряє `tests/lifecredits.test.ts`,
// а малює `lifecredits.ts`.

import { lifeStory } from "../sim/story";
import { weekOf } from "../sim/time";
import type { GameState } from "../sim/types";
import { endingText, livingCatCaption, storyCaption, type StoryCaption } from "../texts";
import { livingCatPhoto, storyPhoto, type Photo } from "../view/photo";
import { plural } from "./titles";

export type CreditsBlock =
  | { kind: "title"; name: string; weeks: string }
  | { kind: "polaroid"; caption: StoryCaption; photo: Photo }
  | { kind: "line"; caption: StoryCaption }
  | { kind: "summary"; title: string; text: string }
  | { kind: "living"; caption: { title: string; text: string }; photo: Photo };

/** Титул, шлях, підсумок, живі коти; «Нова гра» — після всього, її додає стрічка. */
export function creditsPlan(state: GameState): CreditsBlock[] {
  const weeks = weekOf(state.day);
  const plan: CreditsBlock[] = [{ kind: "title", name: state.character.name, weeks: `${weeks} ${plural(weeks, "тиждень", "тижні", "тижнів")}` }];
  for (const item of lifeStory(state)) {
    const caption = storyCaption(item, state);
    const photo = storyPhoto(item, state);
    plan.push(photo ? { kind: "polaroid", caption, photo } : { kind: "line", caption });
  }
  plan.push({ kind: "summary", ...endingText(state, "retirement") });
  for (const cat of state.cats) plan.push({ kind: "living", caption: livingCatCaption(cat), photo: livingCatPhoto(cat) });
  return plan;
}
