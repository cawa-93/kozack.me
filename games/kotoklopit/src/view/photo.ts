// Фото для титрів життя (§4.2): хто на полароїді й у якій позі. Без Phaser і DOM: пози — `photoposes.ts`, малює `src/ui/photo.ts`.

import { lifeMood } from "../sim/cat";
import { lifeLevel } from "../sim/farewell";
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

/** Скільки кошенят на фото пологів, щонайбільше: більше в полароїд ≈ 200 px не вміщається так, щоб кожне було видно. */
export const PHOTO_KITTENS = 3;

/**
 * Поза кота за рівнем життя (`lifeLevel`, §9.7) — від найвищого рівня, з якого вона: щасливе життя мружиться від задоволення,
 * звичайне — спокійно сидить, нелегке — ображено, нещасне — хворий і зіщулений (§4.2, таблиця подій, «Прощання»).
 */
export const LIFE_PHOTO_POSES: readonly { readonly from: number; readonly pose: CatPhotoPose }[] = [
  { from: 7, pose: "content" },
  { from: 5, pose: "calm" },
  { from: 3, pose: "sulk" },
  { from: 0, pose: "ill" },
];

/** Поза кота за середнім настроєм життя (`LIFE_PHOTO_POSES`). */
export function lifePhotoPose(mood: number): CatPhotoPose {
  const level = lifeLevel(mood);
  return (LIFE_PHOTO_POSES.find((row) => level >= row.from) ?? LIFE_PHOTO_POSES[LIFE_PHOTO_POSES.length - 1]!).pose;
}

const catShot = (cat: StoryCat, pose: CatPhotoPose): PhotoSubject => ({ kind: "cat", cat, pose });

/** Фото події стрічки; null — подія без фото (рядок). */
export function storyPhoto(item: StoryItem, state: GameState): Photo | null {
  const look = state.character.look;
  switch (item.kind) {
    case "start":
      return { subjects: [{ kind: "person", look, pose: "unpack" }] };
    case "arrival":
      return { subjects: [catShot(item.cat, item.source === "foundling" ? "wary" : "curious")] };
    case "births":
      return {
        subjects: [...(item.mother ? [catShot(item.mother, "nursing")] : []), ...item.kittens.slice(0, PHOTO_KITTENS).map((kitten) => catShot(kitten, "nursing"))],
      };
    case "thing":
      return { subjects: [{ kind: "thing", thing: item.thing, quality: item.quality }] };
    case "career":
      if (!item.milestone) return null;
      return { subjects: [{ kind: "person", look, pose: item.change === "fired" || item.change === "demoted" ? "gloomy" : "desk" }] };
    case "farewell":
      return { subjects: [catShot({ cat: item.entry, ageWeeks: item.entry.ageWeeks }, lifePhotoPose(item.entry.lifeMood))] };
  }
}

/** Фото кота, що лишається вдома (§4.2, «Живі коти»): поза — за рівнем життя. */
export function livingCatPhoto(cat: Cat): Photo {
  return { subjects: [catShot({ cat, ageWeeks: cat.ageWeeks }, lifePhotoPose(lifeMood(cat)))] };
}
