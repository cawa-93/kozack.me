// Прощання (§9.7): смерть кота від нульового здоров'я чи старості, причина смерті й «Альбом пам'яті».

import { ageDue, lifeMood, traitLevel } from "./cat";
import { changeStat } from "./character";
import { CAT_AGE_LIMIT, DEATH, DIFFICULTY, GIVE_AWAY_GRACE_DAYS, SANITY_FLOOR } from "./config";
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

/**
 * Віддати кота в добрі руки (§9.8): −15 здорового глузду (не нижче 10%), а протягом 7 днів після
 * появи — весь отриманий за нього бонус. Новонароджених не віддають.
 */
export function giveAway(state: GameState, cat: Cat, day: number): AlbumEntry | null {
  if (cat.ageWeeks < 1) return null;
  const { givenCatSanity, newCatSanity } = DIFFICULTY[state.difficulty];
  const loss = state.day - cat.arrivedDay < GIVE_AWAY_GRACE_DAYS ? -newCatSanity : givenCatSanity;
  changeStat(state, "sanity", loss, SANITY_FLOOR);
  state.ads = state.ads.filter((id) => id !== cat.id);
  return removeCat(state, cat, { kind: "given" }, day);
}

/** Дати оголошення (§9.8): нові господарі заберуть кота завтра вранці. */
export function advertise(state: GameState, cat: Cat): boolean {
  if (cat.ageWeeks < 1 || state.ads.includes(cat.id)) return false;
  state.ads.push(cat.id);
  return true;
}

/** Ранок: нові господарі забирають котів за оголошеннями. */
export function collectAds(state: GameState): AlbumEntry[] {
  const given: AlbumEntry[] = [];
  for (const id of [...state.ads]) {
    const cat = state.cats.find((c) => c.id === id);
    const entry = cat ? giveAway(state, cat, state.day) : null;
    if (entry) given.push(entry);
  }
  state.ads = [];
  return given;
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

/** Старість (§9.2): перевірка на початку власного тижня кота — у ніч, коли він постаршав (§9.1). */
export function oldAgeDeaths(state: GameState, rng: Rng): AlbumEntry[] {
  const gone: AlbumEntry[] = [];
  for (const cat of [...state.cats]) {
    if (ageDue(state, cat) && rng.chance(oldAgeChance(cat))) gone.push(removeCat(state, cat, { kind: "old" }, state.day));
  }
  return gone;
}

/** Рівень опису життя 0–9 (§9.7): від «Агонії» до «Легенди», по 10% середнього настрою. */
export function lifeLevel(mood: number): number {
  return Math.min(9, Math.max(0, Math.floor(mood / 10)));
}
