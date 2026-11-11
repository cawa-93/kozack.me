// Фото для титрів життя (§4.2): хто на полароїді й у якій позі. Без Phaser і DOM: пози — `photoposes.ts`, малює `src/ui/photo.ts`.

import { lifeMood } from "../sim/cat";
import { lifeLevel } from "../sim/farewell";
import type { StoryCat, StoryItem } from "../sim/story";
import { TRAIT_GROUPS } from "../sim/traits";
import type { Cat, GameState, Look, Quality, StoryThing, Trait } from "../sim/types";
import { characterTrait } from "../texts";
import { brokeShot } from "./brokephoto";
import { TRAIT_PHOTOS } from "./traitphoto";
import type { LifePose, TraitShot } from "./traitphoto/types";

/** Поза кота на фото (§4.2). */
export type CatPhotoPose = "curious" | "wary" | "nursing" | "content" | "calm" | "sulk" | "ill";
/** Поза персонажа на фото (§4.2). */
export type PersonPhotoPose = "unpack" | "desk" | "gloomy" | "phone" | "proud";

export type PhotoSubject =
  /**
   * `shot` — знімок поверх пози: риси (прощання й живі коти) чи поломки; немає — лише поза. `look` — вигляд персонажа, коли він є
   * в знімку (`TraitShot.person`).
   */
  | { kind: "cat"; cat: StoryCat; pose: CatPhotoPose; shot?: TraitShot; look?: Look }
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
export const LIFE_PHOTO_POSES: readonly { readonly from: number; readonly pose: LifePose }[] = [
  { from: 7, pose: "content" },
  { from: 5, pose: "calm" },
  { from: 3, pose: "sulk" },
  { from: 0, pose: "ill" },
];

/** Поза кота за середнім настроєм життя (`LIFE_PHOTO_POSES`). */
export function lifePhotoPose(mood: number): LifePose {
  const level = lifeLevel(mood);
  return (LIFE_PHOTO_POSES.find((row) => level >= row.from) ?? LIFE_PHOTO_POSES[LIFE_PHOTO_POSES.length - 1]!).pose;
}

/** Знімок риси для пози рівня. */
function shotOf(trait: Trait, pose: LifePose): TraitShot | undefined {
  const group = TRAIT_GROUPS.find((g) => g.id === trait.group);
  return group && TRAIT_PHOTOS[group.area][group.id]?.[trait.level > 0 ? "plus" : "minus"][pose];
}

/** Знімок риси з опису життя (§9.7) для пози рівня; кіт без рис — немає. */
export function traitShot(state: GameState, traits: readonly Trait[], pose: LifePose): TraitShot | undefined {
  const trait = characterTrait(state, traits);
  return trait ? shotOf(trait, pose) : undefined;
}

const catShot = (cat: StoryCat, pose: CatPhotoPose): PhotoSubject => ({ kind: "cat", cat, pose });

/** Кіт зі знімком; персонаж у знімку й його речі (капці) — у вигляді гравця `look`. */
function withShot(cat: StoryCat, pose: LifePose, shot: TraitShot | undefined, look: Look): PhotoSubject {
  if (!shot) return catShot(cat, pose);
  const person = shot.person !== undefined || (shot.props ?? []).some((prop) => prop.art.startsWith("person/"));
  return person ? { kind: "cat", cat, pose, shot, look } : { kind: "cat", cat, pose, shot };
}

/** Кіт у позі за рівнем життя `mood` зі знімком своєї риси. */
function lifeShot(state: GameState, cat: StoryCat, mood: number): PhotoSubject {
  const pose = lifePhotoPose(mood);
  return withShot(cat, pose, traitShot(state, cat.cat.traits, pose), state.character.look);
}

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
    case "trait": {
      const pose = lifePhotoPose(item.mood);
      return { subjects: [withShot(item.cat, pose, shotOf(item.trait, pose), look)] };
    }
    case "broke":
      return { subjects: [{ kind: "cat", cat: item.cat, pose: "content", shot: brokeShot(item.thing, item.quality) }] };
    case "career":
      if (!item.milestone) return null;
      return { subjects: [{ kind: "person", look, pose: item.change === "fired" || item.change === "demoted" ? "gloomy" : "desk" }] };
    case "farewell":
      return { subjects: [lifeShot(state, { cat: item.entry, ageWeeks: item.entry.ageWeeks }, item.entry.lifeMood)] };
  }
}

/** Скільки котів дому щонайбільше стоїть поруч на фото виходу на пенсію. */
export const PHOTO_HOME_CATS = 3;

/** Фото виходу на пенсію (§4.2): персонаж стоїть гордо, поруч — коти, що лишаються вдома, у позі за їхнім життям, без знімків рис. */
export function retirementPhoto(state: GameState): Photo {
  const cats = state.cats.slice(0, PHOTO_HOME_CATS).map((cat) => catShot({ cat, ageWeeks: cat.ageWeeks }, lifePhotoPose(lifeMood(cat))));
  return { subjects: [{ kind: "person", look: state.character.look, pose: "proud" }, ...cats] };
}

/** Фото кота, що лишається вдома (§4.2, «Живі коти»): поза — за рівнем життя, зі знімком риси. */
export function livingCatPhoto(cat: Cat, state: GameState): Photo {
  return { subjects: [lifeShot(state, { cat, ageWeeks: cat.ageWeeks }, lifeMood(cat))] };
}
