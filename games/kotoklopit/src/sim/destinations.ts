// Події в пунктах призначення поїздок (§8.5): магазин, ветеринар, лікар, притулок, розплідник, грумер,
// виставка, офіс. Кожна послуга додає свій час до поїздки, а без послуги на місці минає 15 хвилин (`visitMinutes`;
// рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А6); додому персонаж їде вже без гонки. Що зроблено на місці, послуга сама пише
// в журнал візиту (`trip.log`).

import { changeMood, createCat, offend, traitLevel, weightOf } from "./cat";
import { changeStat, earn, spend } from "./character";
import {
  BREEDER,
  DIFFICULTY,
  DISEASES,
  GROOMER,
  GUESTS,
  ILLNESS,
  MINUTES_PER_HOUR,
  MODIFIERS,
  POSITIONS,
  PRODUCTS,
  SHELTER,
  SHOP_WINDOW,
  STERILIZATION,
  THINGS,
  TRAIT_EFFECTS,
  TRIPS,
  UNSOLD,
  VET,
} from "./config";
import { breedById, breederPrice, knownBreedHalves, MIXED, PUREBREEDS, shelterBreed } from "./breeds";
import { cureDisease, maybeFallIll } from "./diseases";
import { isNursing } from "./reproduction";
import { canOrderProduct, freeSlots, place, spendingOf, stash } from "./economy";
import { emit } from "./events";
import { observe } from "./knowledge";
import { priceFactor } from "./modifiers";
import { addCat, applyMorningSanity, giveStarterPack } from "./night";
import { createRng, deriveSeed, stateRng, type Rng } from "./rng";
import { weekOf } from "./time";
import type { Cat, DiseaseId, GameState, Product, Quality, ThingKind, VisitLog } from "./types";
import { changeReputation, isWorkday } from "./work";

/** Товар магазину: запаси чи річ для котів (і те, і те буває «litter»: наповнювач і лоток). */
export type Goods = { product: Product } | { thing: ThingKind };

/** Усі товари магазину по порядку; мамині судочки не продаються (§6.4) — їх у каталозі немає. */
export const GOODS: readonly Goods[] = [
  ...(Object.keys(PRODUCTS) as Product[]).filter((product) => !UNSOLD.includes(product)).map((product) => ({ product })),
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
  if (!spend(state, shopPrice(state, goods, quality), spendingOf(goods))) return false;
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

/**
 * Огляд (§8.5, §9.9): усі хвороби кота стають відомі; здоров'я, настрій і вага — знімок; як кіт поводився (§9.12). Знімок лягає
 * в журнал поїздки: картка показує його, а операція знає, що огляд уже оплачено (§9.8; рішення автора 2026-10-29, А3).
 */
export function vetExam(state: GameState): VisitLog["exam"] {
  const cat = tripCat(state);
  const trip = state.trip;
  if (!cat || trip?.destination !== "vet" || !spend(state, VET.exam, "health")) return null;
  for (const disease of cat.diseases) disease.known = true;
  // Ветеринар бачить і фізіологічні стани, і породу (§9.9, §9.11).
  if (cat.pregnancy) cat.pregnancy.known = true;
  cat.sterilizedKnown = true;
  cat.breedKnown = [true, true];
  // «Ветеринар»: улюбленець майже не ображається на огляд, «Жах клініки» — удвічі більше.
  const vet = traitLevel(cat, "vet");
  offend(state, cat, VET.love * Math.max(0, 1 - TRAIT_EFFECTS.vetStep * vet), "ветеринар");
  // Спокійний чи наляканий на огляді — персонаж поруч і бачить, а картка каже це рядком (§9.9, §9.12). «Жах клініки»
  // виривається й забивається під шафу: огляд довший. Час огляду минає лише тоді, коли огляд був
  // (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А6).
  const manner = vetManner(cat);
  trip.visit += TRIPS.vet.visit;
  if (manner === "hid") trip.visit += VET.hideMinutes;
  if (vet !== 0) observe(state, cat, "vet", vet > 0 ? 1 : -1);
  emit(state, { type: "vet-exam", cat: cat.id });
  const exam = { health: cat.health, mood: cat.mood, weight: weightOf(cat), manner };
  (trip.log ??= { exam: null, done: [] }).exam = exam;
  return exam;
}

/** Лікування знайденої хвороби (§8.5): дешеве допомагає з шансом 70%, дороге — завжди; хронічну контролює 7 чи 14 днів. */
export function vetTreat(state: GameState, disease: DiseaseId, quality: Quality, rng: Rng): "cured" | "failed" | "controlled" | null {
  const cat = tripCat(state);
  const trip = state.trip;
  const found = cat?.diseases.find((d) => d.id === disease && d.known);
  // Ожиріння грошима не лікують: минає від дієти й ігор (§9.12, «Схильність до повноти»).
  if (!cat || !trip || !found || DISEASES[disease].cure.kind === "weight") return null;
  // Контроль діє довше, ніж дасть це лікування, — платити нема за що (перевірка поїздок 2026-10-28).
  if (DISEASES[disease].cure.kind === "control" && (found.controlled ?? -1) >= state.day + VET.controlDays[quality]) return null;
  // Дешеве цієї поїздки не допомогло — цю хворобу вже не лікують, ні дешевим, ні дорогим (§8.5; рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А6).
  if (trip.log?.done.includes(`${disease}:failed`)) return null;
  if (!spend(state, quality === "premium" ? VET.premium : VET.cheap, "health")) return null;
  trip.visit += VET.treatMinutes;
  // Що дало лікування — у журнал візиту: картка показує це в рядку хвороби.
  const logged = <R extends string>(result: R): R => {
    (trip.log ??= { exam: null, done: [] }).done.push(`${disease}:${result}`);
    return result;
  };
  if (DISEASES[disease].cure.kind === "control") {
    // Дешеве в наступній поїздці не скорочує контролю, уже купленого дорогим (перевірка поїздок 2026-10-28), як і таблетка.
    found.controlled = Math.max(found.controlled ?? state.day, state.day + VET.controlDays[quality]);
    return logged("controlled");
  }
  if (quality === "cheap" && !rng.chance(VET.cheapWorks)) return logged("failed");
  cureDisease(state, cat, disease, rng);
  return logged("cured");
}

/**
 * Оперують з 1 тижня — за тиждень до того, як кіт стає дорослим для розмноження (§9.8; перевірка розмноження 2026-10-28: оперували
 * й новонароджених; загальна ревізія 2026-10-29: було з 2 тижнів — кошеня, народжене вдома, дорослішає в ніч на понеділок, саме тоді,
 * коли кидається зачаття, і вікна для операції не мало).
 */
export const canSterilize = (cat: Cat): boolean => cat.ageWeeks >= STERILIZATION.minAge;

/** Чому ветеринар зараз не оперує (§9.8): замалий, вагітна (рішення автора 2026-10-28, Р1: операція мовчки переривала вагітність) чи годує. */
export function sterilizeBlocker(state: GameState, cat: Cat): "young" | "pregnant" | "nursing" | null {
  if (!canSterilize(cat)) return "young";
  if (cat.pregnancy !== null) return "pregnant";
  if (isNursing(state, cat)) return "nursing";
  return null;
}

/**
 * Що заважає операції з того, що гравець і так знає (§9.8, §9.9; рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А3): уже
 * стерилізований (відомо з притулку чи огляду), замалий (вік), відома вагітність, годує (кошенят видно). Прихованої вагітності
 * чи стерилізації картка до огляду не розкриває: їх покаже огляд, що входить в операцію.
 */
export function knownSterilizeBlocker(state: GameState, cat: Cat): "sterilized" | "young" | "pregnant" | "nursing" | null {
  if (cat.sterilized && cat.sterilizedKnown) return "sterilized";
  if (!canSterilize(cat)) return "young";
  if (cat.pregnancy?.known) return "pregnant";
  if (isNursing(state, cat)) return "nursing";
  return null;
}

/** Скільки зараз коштує операція (§9.8, А3): огляд у ціні, тож якщо огляд цієї поїздки вже оплачено окремо — без нього. */
export function sterilizePrice(state: GameState): number {
  return state.trip?.log?.exam ? STERILIZATION.price - VET.exam : STERILIZATION.price;
}

/**
 * Стерилізація чи кастрація (§9.8): кіт більше не матиме кошенят; 3 дні відновлення. Огляд у ціні (рішення автора 2026-10-29,
 * `GENERAL_REVIEW.md`, А3): без огляду цієї поїздки ветеринар спершу оглядає кота, як `vetExam`; якщо огляд показав, що кіт
 * уже стерилізований чи кішка вагітна, операції немає — заплачено лише за огляд. Грошей не вистачає на ціну операції — нічого.
 */
export function vetSterilize(state: GameState): boolean {
  const cat = tripCat(state);
  const trip = state.trip;
  if (!cat || !trip || trip.destination !== "vet" || knownSterilizeBlocker(state, cat) !== null) return false;
  if (state.character.money < sterilizePrice(state)) return false;
  if (!trip.log?.exam && vetExam(state) === null) return false;
  if (cat.sterilized || sterilizeBlocker(state, cat) !== null || !spend(state, STERILIZATION.price - VET.exam, "health")) return false;
  trip.visit += STERILIZATION.minutes;
  (trip.log ??= { exam: null, done: [] }).done.push("sterilize");
  cat.sterilized = true;
  cat.sterilizedKnown = true;
  cat.pregnancy = null;
  cat.heatUntil = -1;
  cat.recoveryUntil = state.day + STERILIZATION.recoveryDays;
  changeMood(state, cat, STERILIZATION.mood, "операція");
  emit(state, { type: "sterilized", cat: cat.id });
  return true;
}

// --- Грумер, виставка, офіс -----------------------------------------------------------------

/**
 * Чи грумер кота миє, а не вичісує: безшерстого вичісувати нічого (§8.5; рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А15).
 * Картка грумера каже за цим «вимитий», а не «вичесаний і пухнастий».
 */
export const groomerWashes = (cat: Cat): boolean => cat.shape.coat === "hairless";

/**
 * Грумер (§8.5): кіт не зригує шерстяних грудок 7 чи 14 днів, настрій трохи гірший. Безшерстого грумер миє (рішення автора
 * 2026-10-29, `GENERAL_REVIEW.md`, А15): як і купання вдома, це починає відлік до дерматиту знову (§8.7). Дерматиту, що вже
 * почався, грумер не лікує — це ветеринар чи купання вдома дорогим шампунем.
 */
export function groom(state: GameState, quality: Quality): boolean {
  const cat = tripCat(state);
  const trip = state.trip;
  if (!cat || trip?.destination !== "groomer" || !spend(state, GROOMER.price[quality], "other")) return false;
  cat.groomedUntil = state.day + GROOMER.days[quality];
  if (groomerWashes(cat)) cat.bathedDay = state.day;
  changeMood(state, cat, GROOMER.mood[quality], "грумер");
  // Час грумінгу минає лише за грумінг (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А6). Як і на огляді,
  // «Ветеринар» видно в картці грумера (§9.12): «Жах клініки» затягує грумінг.
  trip.visit += TRIPS.groomer.visit;
  (trip.log ??= { exam: null, done: [] }).done.push("groom");
  const manner = vetManner(cat);
  if (manner === "hid") trip.visit += VET.hideMinutes;
  if (manner !== null) observe(state, cat, "vet", manner === "calm" ? 1 : -1);
  return true;
}

/** Виставка котів (§4.1): бал за настроєм і породою; приз — гроші й здоровий глузд; кіт хвилюється. */
export function enterShow(state: GameState, rng: Rng): number | null {
  const cat = tripCat(state);
  const trip = state.trip;
  const show = MODIFIERS.show;
  if (!cat || trip?.destination !== "show" || state.today.showDone === true || !spend(state, show.fee, "other")) return null;
  state.today.showDone = true;
  // Три години на виставці — лише з участю (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А6).
  trip.visit += TRIPS.show.visit;
  const [a, b] = cat.breed;
  const pedigree = a === b && a !== MIXED ? 0.5 : a !== MIXED || b !== MIXED ? 0.25 : 0;
  // «Душа компанії» спокійно тримається перед суддями, «Шипить на гостей» — навпаки (§9.12, «Гості»).
  const score = cat.mood / 100 + pedigree + rng.next() * 0.3 + GUESTS.showStep * traitLevel(cat, "guests");
  changeMood(state, cat, show.mood, "виставка");
  const prize = show.prizes.find((p) => score >= p.score);
  (trip.log ??= { exam: null, done: [] }).done.push(`show:${prize?.money ?? 0}`);
  if (!prize) return 0;
  // Гроші призу сталі, а здоровий глузд — з множником «Здоровий глузд від котів», як пестощі (§4.1, §6.2;
  // рішення автора 2026-10-29, `GENERAL_REVIEW.md`, дрібні питання — «Приз виставки»).
  earn(state, prize.money);
  changeStat(state, "sanity", prize.sanity * DIFFICULTY[state.difficulty].catSanity);
  return prize.money;
}

/** Збори в офісі (§8.5): 3 години рахуються як робота. */
export function officeMeeting(state: GameState): void {
  const trip = state.trip;
  // Збори зараховуються раз на день: і після перезавантаження сторінки посеред них (перевірка циклу гри 2026-10-27).
  if (trip?.destination !== "office" || state.today.officeDone) return;
  state.today.officeDone = true;
  const position = POSITIONS[state.job.position];
  // Звільнили дорогою (летучка) — зборів для персонажа вже немає: він розвертається додому (перевірка поїздок 2026-10-28).
  if (!position || !isWorkday(state)) {
    trip.visit = 0;
    return;
  }
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
      const breed = shelterBreed(rng, SHELTER.breed);
      const cat = createCat(state, rng, { source: "shelter", ageWeeks, breed, knownTraits: SHELTER.visibleTraits[state.difficulty], taken: cats.map((c) => c.name) });
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
      const cat = createCat(state, rng, { source: "breeder", ageWeeks: BREEDER.age, breed: [breed, breed], knownTraits: SHELTER.visibleTraits[state.difficulty], taken: cats.map((c) => c.name) });
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
  if (!cat || !spend(state, breederCatPrice(state), "other")) return null;
  state.breeder.cats = state.breeder.cats.filter((c) => c !== cat);
  welcome(state, cat);
  return cat;
}

/**
 * Новий кіт їде додому разом із персонажем: стартовий пакет і бонус до здорового глузду (§6.2). У поїздці кіт — той, з яким
 * приїхали (`trip.cat`): новий у переноску не йде, інакше картка пропонувала б одразу віддати його назад, а другий узятий
 * кіт опинявся вдома ще до повернення персонажа (перевірка поїздок 2026-10-28).
 */
function welcome(state: GameState, cat: Cat): void {
  cat.arrivedDay = state.day;
  // Купання — відлік від дня, коли кіт з'явився (§9.12 «Купання»): список тижня створено в день першого візиту, і безшерстий,
  // куплений пізніше, «пам'ятав» купання з того дня — дерматит міг початися вже на другу ніч удома (загальна ревізія 2026-10-29).
  cat.bathedDay = state.day;
  cat.away = "trip";
  addCat(state, cat);
  giveStarterPack(state, cat);
  applyMorningSanity(state, 0, 1);
}

/** Взяти кота з притулку (§8.5, §6.2): стартовий пакет і бонус до здорового глузду. */
export function adopt(state: GameState, catId: number): Cat | null {
  if (state.trip?.destination !== "shelter" || !state.shelter) return null;
  const cat = state.shelter.cats.find((c) => c.id === catId);
  if (!cat || !spend(state, SHELTER.price, "other")) return null;
  state.shelter.cats = state.shelter.cats.filter((c) => c !== cat);
  welcome(state, cat);
  // З притулку — можливо, з блохами, як і примусове кошеня (§9.5; крок 17: кіт, якого брали самі, бліх не мав ніколи).
  maybeFallIll(state, cat, "fleas", ILLNESS.shelterFleas, stateRng(state, "behavior"));
  return cat;
}
