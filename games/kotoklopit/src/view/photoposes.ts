// Пози фото титрів життя (§4.2): нерухомий кадр частин скелета з гри. Без Phaser і DOM.

import type { StoryCat } from "../sim/story";
import type { AlbumEntry, Cat, Look, Quality, StoryThing } from "../sim/types";
import type { PortraitPart } from "./art/compose";
import type { TintRecipe } from "./art/types";
import type { CatPhotoPose, PersonPhotoPose, Photo } from "./photo";

/** Кіт для фото: поля, з яких рецепт шерсті й розмір. */
export type PhotoCat = Pick<Cat, "id" | "genes" | "shape" | "diseases" | "collar" | "traits" | "breed" | "ageWeeks" | "weight">;

export function photoCat(cat: Cat | AlbumEntry, ageWeeks: number): PhotoCat {
  void ageWeeks;
  return cat as Cat;
}

export function catPhotoParts(cat: StoryCat, pose: CatPhotoPose): PortraitPart[] {
  void cat;
  void pose;
  return [];
}

export function personPhotoParts(look: Look, pose: PersonPhotoPose): PortraitPart[] {
  void look;
  void pose;
  return [];
}

export function thingPhotoParts(thing: StoryThing, quality: Quality): PortraitPart[] {
  void thing;
  void quality;
  return [];
}

/** Частина фото з рецептом, яким її фарбують. */
export interface PhotoPiece {
  part: PortraitPart;
  recipe: TintRecipe;
}

export interface PhotoLayout {
  /** Частини всіх героїв знизу догори. */
  pieces: PhotoPiece[];
  /** Найменша рамка фото, одиниці арту. */
  span: { w: number; h: number };
}

export function photoLayout(photo: Photo): PhotoLayout {
  void photo;
  return { pieces: [], span: { w: 0, h: 0 } };
}
