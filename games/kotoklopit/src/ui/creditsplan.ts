// Титри життя (§4.2): з чого складається стрічка й у якому порядку. Без DOM — порядок перевіряє `tests/lifecredits.test.ts`,
// а малює `lifecredits.ts`.

import { lifeStory } from "../sim/story";
import { weekOf } from "../sim/time";
import type { GameState } from "../sim/types";
import { endingText, livingCatCaption, STORY_TEXTS, storyCaption, storyWeek, type StoryCaption } from "../texts";
import type { IconName } from "../view/iconnames";
import { livingCatPhoto, retirementPhoto, storyPhoto, type Photo } from "../view/photo";
import { storyIcon } from "../view/symbols";
import { plural } from "./titles";

export type CreditsBlock =
  /** Титул — по центру, в такт ударам звуку кінця гри: ім'я, тижні й назва фіналу (§4.2). */
  | { kind: "title"; name: string; weeks: string; finale: string }
  /** Заголовок тижня шляху: дня стрічка не показує (§4.2). */
  | { kind: "week"; label: string }
  | { kind: "polaroid"; caption: StoryCaption; photo: Photo }
  | { kind: "line"; caption: StoryCaption; icon: IconName | null }
  /** Вихід на пенсію — остання й головна подія шляху: великий полароїд, текст фіналу й смуга часу. */
  | { kind: "retirement"; caption: { title: string; text: string }; photo: Photo }
  | { kind: "living"; caption: { title: string; text: string }; photo: Photo };

/** Титул, шлях за тижнями з виходом на пенсію наприкінці, живі коти; «Нова гра» — після всього, її додає стрічка. */
export function creditsPlan(state: GameState): CreditsBlock[] {
  const weeks = weekOf(state.day);
  const ending = endingText(state, "retirement");
  const plan: CreditsBlock[] = [{ kind: "title", name: state.character.name, weeks: `${weeks} ${plural(weeks, "тиждень", "тижні", "тижнів")}`, finale: ending.title }];
  let week = 0;
  const weekOfDay = (day: number): void => {
    if (weekOf(day) === week) return;
    week = weekOf(day);
    plan.push({ kind: "week", label: storyWeek(week) });
  };
  for (const item of lifeStory(state)) {
    weekOfDay(item.day);
    const caption = storyCaption(item, state);
    const photo = storyPhoto(item, state);
    plan.push(photo ? { kind: "polaroid", caption, photo } : { kind: "line", caption, icon: storyIcon(item) });
  }
  weekOfDay(state.day);
  plan.push({ kind: "retirement", caption: { title: STORY_TEXTS.retirement, text: ending.text }, photo: retirementPhoto(state) });
  for (const cat of state.cats) plan.push({ kind: "living", caption: livingCatCaption(cat, state), photo: livingCatPhoto(cat) });
  return plan;
}
