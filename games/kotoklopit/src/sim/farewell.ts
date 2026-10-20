// Прощання (§9.7): смерть кота від нульового здоров'я чи старості, причина смерті й «Альбом пам'яті».

import { lifeMood, traitLevel } from "./cat";
import { CAT_AGE_LIMIT, DEATH } from "./config";
import { emit } from "./events";
import { forgetRelations } from "./relations";
import type { Rng } from "./rng";
import type { AlbumEntry, Cat, FarewellCause, GameState } from "./types";

/**
 * Причина смерті від нульового здоров'я (§9.7): джерело, що завдало найбільше шкоди за останній
 * тиждень, — хвороба чи туга (поганий настрій).
 */
export function zeroHealthCause(cat: Cat): FarewellCause {
  const bySource = new Map<string, number>();
  for (const entry of cat.healthLog) bySource.set(entry.source, (bySource.get(entry.source) ?? 0) + entry.amount);
  let top = "mood";
  let most = -Infinity;
  for (const [source, amount] of bySource) {
    if (amount > most) {
      top = source;
      most = amount;
    }
  }
  return top.startsWith("disease:") ? { kind: "disease", disease: top.slice("disease:".length) } : { kind: "sorrow" };
}

/** Кота більше немає вдома: він іде в альбом пам'яті з повним характером. */
export function removeCat(state: GameState, cat: Cat, cause: FarewellCause, day: number): AlbumEntry {
  state.cats = state.cats.filter((c) => c.id !== cat.id);
  forgetRelations(state, cat);
  const held = state.character.held;
  if (held?.kind === "cat" && held.cat === cat.id) state.character.held = null;
  const entry: AlbumEntry = {
    id: cat.id,
    name: cat.name,
    sex: cat.sex,
    source: cat.source,
    ageWeeks: cat.ageWeeks,
    traits: structuredClone(cat.traits),
    breed: [...cat.breed],
    genes: structuredClone(cat.genes),
    shape: structuredClone(cat.shape),
    cause,
    lifeMood: lifeMood(cat),
    arrivedDay: cat.arrivedDay,
    day,
  };
  state.album.push(entry);
  emit(state, { type: "cat-gone", entry });
  return entry;
}

/** Вечірня перевірка (§9.5): здоров'я на нулі — кіт помирає з шансом 60%. */
export function zeroHealthDeaths(state: GameState, rng: Rng): AlbumEntry[] {
  const gone: AlbumEntry[] = [];
  for (const cat of [...state.cats]) {
    if (cat.health > 0 || !rng.chance(DEATH.zeroHealth)) continue;
    gone.push(removeCat(state, cat, zeroHealthCause(cat), state.day));
  }
  return gone;
}

/** Шанс смерті на початку тижня понад межу віку (§9.2). */
export function oldAgeChance(cat: Cat): number {
  if (cat.ageWeeks <= CAT_AGE_LIMIT) return 0;
  const chance = DEATH.ageBase + DEATH.ageStep * (cat.ageWeeks - CAT_AGE_LIMIT) - DEATH.longevityStep * traitLevel(cat, "longevity");
  return Math.min(1, Math.max(0, chance));
}

/** Ніч на понеділок (§9.2): старість. */
export function oldAgeDeaths(state: GameState, rng: Rng): AlbumEntry[] {
  const gone: AlbumEntry[] = [];
  for (const cat of [...state.cats]) {
    if (rng.chance(oldAgeChance(cat))) gone.push(removeCat(state, cat, { kind: "old" }, state.day));
  }
  return gone;
}

/** Рівень опису життя 0–9 (§9.7): від «Агонії» до «Легенди», по 10% середнього настрою. */
export function lifeLevel(mood: number): number {
  return Math.min(9, Math.max(0, Math.floor(mood / 10)));
}
