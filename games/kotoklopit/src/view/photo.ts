// Фото для титрів життя (§4.2): хто на полароїді й у якій позі. Без Phaser і DOM: малює `src/ui/photo.ts`.
// КОНТРАКТ: типи й сигнатури — спільні для фото й стрічки; тіла заповнює пакет «фото».

import type { StoryCat, StoryItem } from "../sim/story";
import type { Cat, GameState, Look, Quality, StoryThing } from "../sim/types";

/** Поза кота на фото (§4.2). */
export type CatPhotoPose = "curious" | "wary" | "nursing" | "content" | "calm" | "sulk" | "ill";
/** Поза персонажа на фото (§4.2). */
export type PersonPhotoPose = "unpack" | "desk" | "gloomy" | "phone";

export type PhotoSubject =
  | { kind: "cat"; cat: StoryCat; pose: CatPhotoPose }
  | { kind: "person"; look: Look; pose: PersonPhotoPose }
  | { kind: "thing"; thing: StoryThing; quality: Quality };

/** Що на фото: один чи кілька героїв (мама з кошенятами). */
export interface Photo {
  subjects: PhotoSubject[];
}

/** Фото події стрічки; null — подія без фото (рядок). */
export function storyPhoto(item: StoryItem, state: GameState): Photo | null {
  if (item.kind === "career" && !item.milestone) return null;
  return { subjects: [{ kind: "person", look: state.character.look, pose: "desk" }] };
}

/** Фото кота, що лишається вдома (§4.2, «Живі коти»): поза — за рівнем життя. */
export function livingCatPhoto(cat: Cat): Photo {
  return { subjects: [{ kind: "cat", cat: { cat, ageWeeks: cat.ageWeeks }, pose: "calm" }] };
}
