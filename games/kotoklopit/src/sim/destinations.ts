// Події в пунктах призначення поїздок (§8.5): магазин, ветеринар, лікар, притулок, грумер,
// котокафе, офіс. Кожна подія додає свій час до поїздки; додому персонаж їде вже без гонки.

import { changeLove, changeMood, createCat, traitLevel } from "./cat";
import { changeStat, earn, spend } from "./character";
import {
  CAFE,
  DIFFICULTY,
  DISEASES,
  DOCTOR,
  GROOMER,
  MINUTES_PER_HOUR,
  POSITIONS,
  PRODUCTS,
  SHELTER,
  SHOP_WINDOW,
  THINGS,
  VET,
} from "./config";
import { freeSlots, place } from "./economy";
import { emit } from "./events";
import { observe } from "./knowledge";
import { addCat, applyMorningSanity, giveStarterPack } from "./night";
import { createRng, deriveSeed, type Rng } from "./rng";
import { weekOf } from "./time";
import type { Cat, DiseaseId, GameState, Product, Quality, ThingKind } from "./types";
import { changeReputation } from "./work";

/** Товар магазину: запаси чи річ для котів (і те, і те буває «litter»: наповнювач і лоток). */
export type Goods = { product: Product } | { thing: ThingKind };

/** Усі товари магазину по порядку. */
export const GOODS: readonly Goods[] = [
  ...(Object.keys(PRODUCTS) as Product[]).map((product) => ({ product })),
  ...(Object.keys(THINGS) as ThingKind[]).map((thing) => ({ thing })),
];

export const goodsKey = (goods: Goods): string => ("product" in goods ? goods.product : `thing:${goods.thing}`);

/** Кіт у переносці цієї поїздки. */
export function tripCat(state: GameState): Cat | null {
  const id = state.trip?.cat;
  return state.cats.find((c) => c.id === id) ?? null;
}

// --- Магазин --------------------------------------------------------------------------------

/** Модифікатор ціни товару на цю поїздку (§6.4): випадає окремо для кожного товару. */
export function shopModifier(state: GameState, goods: Goods): number {
  const range = SHOP_WINDOW[state.difficulty];
  const index = GOODS.findIndex((g) => goodsKey(g) === goodsKey(goods));
  const rng = createRng(deriveSeed(state.trip?.seed ?? state.seed, index + 1));
  return range.min + rng.next() * (range.max - range.min);
}

export function shopPrice(state: GameState, goods: Goods, quality: Quality): number {
  const base = "product" in goods ? PRODUCTS[goods.product].price[quality] : THINGS[goods.thing].price[quality];
  return Math.round(base * (1 + shopModifier(state, goods)));
}

/** Купити в магазині: запаси й речі одразу вдома (§8.5). */
export function buyAtShop(state: GameState, goods: Goods, quality: Quality): boolean {
  if (state.trip?.destination !== "shop") return false;
  if ("thing" in goods && freeSlots(state, goods.thing) <= 0) return false;
  if (!spend(state, shopPrice(state, goods, quality))) return false;
  if ("product" in goods) state.home.supplies[goods.product][quality] += PRODUCTS[goods.product].units[quality];
  else {
    const item = place(state, goods.thing, quality);
    if (item) state.home.items.push(item);
  }
  emit(state, { type: "bought", goods: goodsKey(goods), quality });
  return true;
}

// --- Ветеринар ------------------------------------------------------------------------------

/** Огляд (§8.5, §9.9): усі хвороби кота стають відомі; здоров'я й настрій — знімок. */
export function vetExam(state: GameState): { health: number; mood: number } | null {
  const cat = tripCat(state);
  if (!cat || state.trip?.destination !== "vet" || !spend(state, VET.exam)) return null;
  for (const disease of cat.diseases) disease.known = true;
  changeLove(state, cat, VET.love, "ветеринар");
  observe(state, cat, "vet");
  emit(state, { type: "vet-exam", cat: cat.id });
  return { health: cat.health, mood: cat.mood };
}

/** Лікування знайденої хвороби (§8.5): дешеве допомагає з шансом 70%, дороге — завжди; хронічну контролює 7 днів. */
export function vetTreat(state: GameState, disease: DiseaseId, quality: Quality, rng: Rng): "cured" | "failed" | "controlled" | null {
  const cat = tripCat(state);
  const trip = state.trip;
  const found = cat?.diseases.find((d) => d.id === disease && d.known);
  if (!cat || !trip || !found || !spend(state, quality === "premium" ? VET.premium : VET.cheap)) return null;
  trip.visit += VET.treatMinutes;
  if (DISEASES[disease].cure.kind === "control") {
    found.controlled = state.day + VET.controlDays;
    return "controlled";
  }
  if (quality === "cheap" && !rng.chance(VET.cheapWorks)) return "failed";
  cat.diseases = cat.diseases.filter((d) => d !== found);
  emit(state, { type: "cat-cured", cat: cat.id, disease });
  return "cured";
}

// --- Лікар, грумер, котокафе, офіс ----------------------------------------------------------

/** Огляд у лікаря (§8.5): здоров'я персонажа +20. Хвороби персонажа додасть крок 13. */
export function doctorVisit(state: GameState): boolean {
  if (state.trip?.destination !== "doctor" || !spend(state, DOCTOR.exam)) return false;
  changeStat(state, "health", DOCTOR.health);
  return true;
}

/** Грумер (§8.5): кіт не зригує шерстяних грудок 7 чи 14 днів, настрій трохи гірший. */
export function groom(state: GameState, quality: Quality): boolean {
  const cat = tripCat(state);
  if (!cat || state.trip?.destination !== "groomer" || !spend(state, GROOMER.price[quality])) return false;
  cat.groomedUntil = state.day + GROOMER.days[quality];
  changeMood(state, cat, GROOMER.mood[quality], "грумер");
  return true;
}

/** Котокафе (§8.5): здоровий глузд слабшає з кожною годиною; ревниві коти вдома ображаються. */
export function cafe(state: GameState, hours: number): boolean {
  const trip = state.trip;
  if (trip?.destination !== "cafe" || hours < 1 || !spend(state, CAFE.pricePerHour * hours)) return false;
  trip.visit = hours * MINUTES_PER_HOUR;
  const factor = DIFFICULTY[state.difficulty].catSanity;
  for (let h = 0; h < Math.min(hours, CAFE.sanity.length); h++) changeStat(state, "sanity", (CAFE.sanity[h] ?? 0) * factor);
  for (const cat of state.cats) {
    const jealousy = traitLevel(cat, "jealousy");
    if (jealousy > 0) changeMood(state, cat, CAFE.jealousyMood * jealousy, "пахне чужими котами");
  }
  return true;
}

/** Збори в офісі (§8.5): 3 години рахуються як робота. */
export function officeMeeting(state: GameState): void {
  const trip = state.trip;
  if (trip?.destination !== "office") return;
  const position = POSITIONS[state.job.position];
  if (!position) return;
  const hours = trip.visit / MINUTES_PER_HOUR;
  earn(state, position.pay * DIFFICULTY[state.difficulty].earnings * hours);
  changeReputation(state, position.reputation * hours);
}

// --- Притулок -------------------------------------------------------------------------------

/** Коти притулку цього тижня (§8.5): той самий вибір до кінця тижня. */
export function shelterCats(state: GameState): Cat[] {
  const week = weekOf(state.day);
  if (state.shelter?.week !== week) {
    const rng = createRng(deriveSeed(state.seed, 7, week));
    const cats: Cat[] = [];
    for (let i = 0; i < SHELTER.cats; i++) {
      const ageWeeks = rng.int(SHELTER.minAge, SHELTER.maxAge);
      cats.push(createCat(state, rng, { source: "shelter", ageWeeks, knownTraits: SHELTER.visibleTraits[state.difficulty] }));
    }
    state.shelter = { week, cats };
  }
  return state.shelter.cats;
}

/** Взяти кота з притулку (§8.5, §6.2): стартовий пакет і бонус до здорового глузду. */
export function adopt(state: GameState, catId: number): Cat | null {
  if (state.trip?.destination !== "shelter" || !state.shelter) return null;
  const cat = state.shelter.cats.find((c) => c.id === catId);
  if (!cat || !spend(state, SHELTER.price)) return null;
  state.shelter.cats = state.shelter.cats.filter((c) => c !== cat);
  cat.arrivedDay = state.day;
  cat.away = "trip";
  addCat(state, cat);
  giveStarterPack(state);
  applyMorningSanity(state, 0, 1);
  // Новий кіт їде додому разом із персонажем (у переносці чи на руках).
  if (state.trip.cat === null) state.trip.cat = cat.id;
  else cat.away = null;
  return cat;
}
