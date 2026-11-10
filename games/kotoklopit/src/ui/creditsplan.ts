// Титри життя (§4.2): з чого складається стрічка й у якому порядку. Без DOM — порядок перевіряє `tests/lifecredits.test.ts`,
// а малює `lifecredits.ts`.

import { lifeStory } from "../sim/story";
import { weekOf } from "../sim/time";
import type { GameState } from "../sim/types";
import { endingText, livingCatCaption, storyCaption, storyWeek, type StoryCaption } from "../texts";
import type { IconName } from "../view/iconnames";
import { livingCatPhoto, storyPhoto, type Photo } from "../view/photo";
import { storyIcon } from "../view/symbols";
import { plural } from "./titles";

export type CreditsBlock =
  | { kind: "title"; name: string; weeks: string }
  /** Заголовок тижня шляху: дня стрічка не показує (§4.2). */
  | { kind: "week"; label: string }
  | { kind: "polaroid"; caption: StoryCaption; photo: Photo }
  | { kind: "line"; caption: StoryCaption; icon: IconName | null }
  | { kind: "summary"; title: string; text: string }
  | { kind: "living"; caption: { title: string; text: string }; photo: Photo };

/** Титул, шлях за тижнями, підсумок, живі коти; «Нова гра» — після всього, її додає стрічка. */
export function creditsPlan(state: GameState): CreditsBlock[] {
  const weeks = weekOf(state.day);
  const plan: CreditsBlock[] = [{ kind: "title", name: state.character.name, weeks: `${weeks} ${plural(weeks, "тиждень", "тижні", "тижнів")}` }];
  let week = 0;
  for (const item of lifeStory(state)) {
    if (weekOf(item.day) !== week) {
      week = weekOf(item.day);
      plan.push({ kind: "week", label: storyWeek(week) });
    }
    const caption = storyCaption(item, state);
    const photo = storyPhoto(item, state);
    plan.push(photo ? { kind: "polaroid", caption, photo } : { kind: "line", caption, icon: storyIcon(item) });
  }
  plan.push({ kind: "summary", ...endingText(state, "retirement") });
  for (const cat of state.cats) plan.push({ kind: "living", caption: livingCatCaption(cat), photo: livingCatPhoto(cat) });
  return plan;
}
