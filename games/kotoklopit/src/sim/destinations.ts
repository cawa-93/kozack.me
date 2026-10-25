// Події в пунктах призначення поїздок (§8.5): магазин, ветеринар, лікар, притулок, грумер,
// котокафе, офіс. Кожна подія додає свій час до поїздки; додому персонаж їде вже без гонки.

import { changeMood, createCat, offend, traitLevel } from "./cat";
import { changeStat, earn, spend } from "./character";
import {
  BREEDER,
  CAFE,
  DIFFICULTY,
  DISEASES,
  GROOMER,
  GUESTS,
  MINUTES_PER_HOUR,
  MODIFIERS,
  POSITIONS,
  PRODUCTS,
  SHELTER,
  SHOP_WINDOW,
  STERILIZATION,
  THINGS,
  TRAIT_EFFECTS,
  VET,
} from "./config";
import { breedById, breederPrice, knownBreedHalves, MIXED, PUREBREEDS } from "./breeds";
import { canOrderProduct, freeSlots, place, stash } from "./economy";
import { giveAway } from "./farewell";
import { emit } from "./events";
import { observe } from "./knowledge";
import { priceFactor } from "./modifiers";
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
  const base = "product" in goods ? PRODUCTS[goods.product].price[quality] * priceFactor(state, goods.product) : THINGS[goods.thing].price[quality];
  return Math.round(base * (1 + shopModifier(state, goods)));
}

/** Купити в магазині: речі одразу на своїх місцях, запаси — у ящиках біля входу (§6.4, §8.5). */
export function buyAtShop(state: GameState, goods: Goods, quality: Quality): boolean {
  if ("product" in goods && !canOrderProduct(state, goods.product)) return false;
  return purchase(state, goods, quality);
}

/**
 * Оплатити й забрати додому одну штуку. Що запасу ще немає в ящиках, перевіряє той, хто купує:
 * кошик перевіряє це один раз, бо після першої упаковки запас уже в ящиках.
 */
export function purchase(state: GameState, goods: Goods, quality: Quality): boolean {
  if (state.trip?.destination !== "shop") return false;
  if ("thing" in goods && freeSlots(state, goods.thing) <= 0) return false;
  if (!spend(state, shopPrice(state, goods, quality))) return false;
  // Запаси з магазину, як і доставка, — у ящики біля входу (§6.4).
  if ("product" in goods) stash(state, goods.product, quality, PRODUCTS[goods.product].units[quality]);
  else {
    const item = place(state, goods.thing, quality);
    if (item) state.home.items.push(item);
  }
  emit(state, { type: "bought", goods: goodsKey(goods), quality });
  return true;
}

// --- Ветеринар ------------------------------------------------------------------------------

/** Як кіт поводиться на огляді чи грумінгу (§9.12 «Переноска й ветеринар»): спокійний, шипить чи виривається й ховається. */
export type VetManner = "calm" | "hiss" | "hid";

/** Поведінка кота на огляді за «Ветеринаром» (§9.12): кіт без риси — null, рядка в картці немає. */
export function vetManner(cat: Cat): VetManner | null {
  const level = traitLevel(cat, "vet");
  if (level === 0) return null;
  if (level > 0) return "calm";
  return level <= -2 ? "hid" : "hiss";
}

/** Огляд (§8.5, §9.9): усі хвороби кота стають відомі; здоров'я й настрій — знімок; як кіт поводився (§9.12). */
export function vetExam(state: GameState): { health: number; mood: number; manner: VetManner | null } | null {
  const cat = tripCat(state);
  const trip = state.trip;
  if (!cat || trip?.destination !== "vet" || !spend(state, VET.exam)) return null;
  for (const disease of cat.diseases) disease.known = true;
  // Щеплення (§4.1): кота довезли до ветеринара.
  state.today.vaccinated = true;
  // Ветеринар бачить і фізіологічні стани, і породу (§9.9, §9.11).
  if (cat.pregnancy) cat.pregnancy.known = true;
  cat.sterilizedKnown = true;
  cat.breedKnown = [true, true];
  // «Ветеринар»: улюбленець майже не ображається на огляд, «Жах клініки» — удвічі більше.
  const vet = traitLevel(cat, "vet");
  offend(state, cat, VET.love * Math.max(0, 1 - TRAIT_EFFECTS.vetStep * vet), "ветеринар");
  // Спокійний чи наляканий на огляді — персонаж поруч і бачить, а картка каже це рядком (§9.9, §9.12). «Жах клініки»
  // виривається й забивається під шафу: огляд довший.
  const manner = vetManner(cat);
  if (manner === "hid") trip.visit += VET.hideMinutes;
  if (vet !== 0) observe(state, cat, "vet", vet > 0 ? 1 : -1);
  emit(state, { type: "vet-exam", cat: cat.id });
  return { health: cat.health, mood: cat.mood, manner };
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

/** Стерилізація чи кастрація (§9.8): кіт більше не матиме кошенят; 3 дні відновлення. */
export function vetSterilize(state: GameState): boolean {
  const cat = tripCat(state);
  const trip = state.trip;
  if (!cat || !trip || trip.destination !== "vet" || cat.sterilized || !spend(state, STERILIZATION.price)) return false;
  trip.visit += STERILIZATION.minutes;
  cat.sterilized = true;
  cat.sterilizedKnown = true;
  cat.pregnancy = null;
  cat.heatUntil = -1;
  cat.recoveryUntil = state.day + STERILIZATION.recoveryDays;
  changeMood(state, cat, STERILIZATION.mood, "операція");
  emit(state, { type: "sterilized", cat: cat.id });
  return true;
}

// --- Лікар, грумер, котокафе, офіс ----------------------------------------------------------

/** Грумер (§8.5): кіт не зригує шерстяних грудок 7 чи 14 днів, настрій трохи гірший. */
export function groom(state: GameState, quality: Quality): boolean {
  const cat = tripCat(state);
  const trip = state.trip;
  if (!cat || trip?.destination !== "groomer" || !spend(state, GROOMER.price[quality])) return false;
  cat.groomedUntil = state.day + GROOMER.days[quality];
  changeMood(state, cat, GROOMER.mood[quality], "грумер");
  // Як і на огляді, «Ветеринар» видно в картці грумера (§9.12): «Жах клініки» затягує грумінг.
  const manner = vetManner(cat);
  if (manner === "hid") trip.visit += VET.hideMinutes;
  if (manner !== null) observe(state, cat, "vet", manner === "calm" ? 1 : -1);
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

/** Виставка котів (§4.1): бал за настроєм і породою; приз — гроші й здоровий глузд; кіт хвилюється. */
export function enterShow(state: GameState, rng: Rng): number | null {
  const cat = tripCat(state);
  const show = MODIFIERS.show;
  if (!cat || state.trip?.destination !== "show" || !spend(state, show.fee)) return null;
  const [a, b] = cat.breed;
  const pedigree = a === b && a !== MIXED ? 0.5 : a !== MIXED || b !== MIXED ? 0.25 : 0;
  // «Душа компанії» спокійно тримається перед суддями, «Шипить на гостей» — навпаки (§9.12, «Гості»).
  const score = cat.mood / 100 + pedigree + rng.next() * 0.3 + GUESTS.showStep * traitLevel(cat, "guests");
  changeMood(state, cat, show.mood, "виставка");
  const prize = show.prizes.find((p) => score >= p.score);
  if (!prize) return 0;
  earn(state, prize.money);
  changeStat(state, "sanity", prize.sanity);
  return prize.money;
}

/** Збори в офісі (§8.5): 3 години рахуються як робота. */
export function officeMeeting(state: GameState): void {
  const trip = state.trip;
  if (trip?.destination !== "office") return;
  state.today.officeDone = true;
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
      // Здебільшого безпородні; зрідка — порода, навпіл чистокровна й напівкровка (§8.5).
      let breed: [string, string] = [MIXED, MIXED];
      if (rng.chance(SHELTER.breed)) {
        const real = PUREBREEDS[rng.int(0, PUREBREEDS.length - 1)]?.id ?? MIXED;
        breed = rng.chance(0.5) ? [real, real] : [real, MIXED];
      }
      const cat = createCat(state, rng, { source: "shelter", ageWeeks, breed, knownTraits: SHELTER.visibleTraits[state.difficulty] });
      cat.breedKnown = knownBreedHalves(state, breed, rng);
      // Притулок каже, чи кіт стерилізований (§9.8).
      if (ageWeeks >= SHELTER.sterilizedFromAge && rng.chance(SHELTER.sterilized)) cat.sterilized = true;
      cat.sterilizedKnown = true;
      cats.push(cat);
    }
    state.shelter = { week, cats };
  }
  return state.shelter.cats;
}

/** Розплідник тижня (§9.11): 3 чистокровні кошенята однієї породи, вік 2 тижні, порода відома. */
export function breederCats(state: GameState): { breed: string; cats: Cat[] } {
  const week = weekOf(state.day);
  if (state.breeder?.week !== week) {
    const rng = createRng(deriveSeed(state.seed, 11, week));
    const breed = PUREBREEDS[rng.int(0, PUREBREEDS.length - 1)]?.id ?? MIXED;
    const cats: Cat[] = [];
    for (let i = 0; i < BREEDER.cats; i++) {
      const cat = createCat(state, rng, { source: "breeder", ageWeeks: BREEDER.age, breed: [breed, breed], knownTraits: SHELTER.visibleTraits[state.difficulty] });
      cat.breedKnown = [true, true];
      cat.sterilizedKnown = true;
      cats.push(cat);
    }
    state.breeder = { week, breed, cats };
  }
  return state.breeder;
}

/** Ціна кошеняти розплідника (§9.11). */
export function breederCatPrice(state: GameState): number {
  return breederPrice(breedById(breederCats(state).breed));
}

/** Купити кошеня в розпліднику (§9.11): як будь-який новий кіт, дає бонус до здорового глузду. */
export function buyFromBreeder(state: GameState, catId: number): Cat | null {
  if (state.trip?.destination !== "breeder" || !state.breeder) return null;
  const cat = state.breeder.cats.find((c) => c.id === catId);
  if (!cat || !spend(state, breederCatPrice(state))) return null;
  state.breeder.cats = state.breeder.cats.filter((c) => c !== cat);
  welcome(state, cat);
  return cat;
}

/** Віддати кота з переноски притулку (§9.8): приймають одразу й безкоштовно. */
export function giveToShelter(state: GameState): boolean {
  const cat = tripCat(state);
  const trip = state.trip;
  if (!cat || !trip || trip.destination !== "shelter") return false;
  if (!giveAway(state, cat, state.day)) return false;
  trip.cat = null;
  return true;
}

/** Новий кіт їде додому разом із персонажем: стартовий пакет і бонус до здорового глузду (§6.2). */
function welcome(state: GameState, cat: Cat): void {
  cat.arrivedDay = state.day;
  cat.away = "trip";
  addCat(state, cat);
  giveStarterPack(state);
  applyMorningSanity(state, 0, 1);
  const trip = state.trip;
  if (trip && trip.cat === null) trip.cat = cat.id;
  else cat.away = null;
}

/** Взяти кота з притулку (§8.5, §6.2): стартовий пакет і бонус до здорового глузду. */
export function adopt(state: GameState, catId: number): Cat | null {
  if (state.trip?.destination !== "shelter" || !state.shelter) return null;
  const cat = state.shelter.cats.find((c) => c.id === catId);
  if (!cat || !spend(state, SHELTER.price)) return null;
  state.shelter.cats = state.shelter.cats.filter((c) => c !== cat);
  welcome(state, cat);
  return cat;
}
