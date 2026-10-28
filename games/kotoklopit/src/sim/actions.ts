// Дії персонажа (§8.4, §8.7, §9.12, §10): коротке натискання бере, кладе чи вмикає річ, бере кота
// на руки; утримання — тривала дія: душ, їжа, прибирання, пестощі. Плита готує своїм часом.

import { actionSpeed, isMoving } from "./body";
import { changeLove, changeMood, idleAct, offend, sulking, traitLevel } from "./cat";
import { backAway, beggingFood, carryFeeling, catInBox, catOnComputer, catOnSink, forbiddenZoneAt, freshWater, hearFood, jealousy, openTap, sayNo, separateFight, showerDrops, touchStandoff, trashTipped, turnAway, upHigh, waterFright } from "./catai";
import { openDoor } from "./door";
import { visibleFloorNear } from "./catmove";
import { maybeFallIll } from "./diseases";
import { needsHumanMeds, takeHumanMeds, treatable } from "./illness";
import { bathe } from "./care";
import { catInWasher, emptyFeeder, furPerHour, sameFood, tapWasher, vacuumed } from "./household";
import { observe } from "./knowledge";
import { loudNoise } from "./noise";
import { powerOut } from "./modifiers";
import { changeStat, statCeiling, unpleasantTask } from "./character";
import {
  AFFECTION,
  BOWL_CAPACITY,
  HOUSEHOLD,
  ILLNESS,
  BURN_MINUTES,
  CHEWING,
  CLEAN_LITTER_MINUTES,
  CLIMBING,
  CLEAN_MESS_MINUTES,
  COOK_MINUTES,
  DIFFICULTY,
  DIRTY_CLOTHES_CATS,
  EAT_MINUTES,
  FEEDER_CAPACITY,
  ESCAPE,
  GIFTS,
  LITTER_SANITY,
  MEAL_SATIETY,
  MESS_SANITY,
  MOOD,
  LOVE_BEHAVIOR,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  PET,
  PETTING,
  PLAY,
  PLAYFUL,
  PLAY_RELIEF,
  REACH,
  SHOWER_HYGIENE,
  SHOWER_MINUTES,
  SHEDDING,
  SHOO,
  STRESS_EFFECTS,
  UNWILLING_ATTENTION,
  WATER_CAPACITY,
} from "./config";
import { feederAt, receivePackages, returnSupply, supplyCount, topQuality, unpack, useSupplies, useSupply } from "./economy";
import { emit, type Refusal } from "./events";
import { isSolid, SURFACE_IDS, type HomeObject } from "./home";
import { stateRng } from "./rng";
import { canGoToSleep } from "./sleep";
import { absoluteMinute } from "./time";
import { targetById, targetOf, type Target } from "./targets";
import type { BowlItem, Cat, Dish, GameState, HomeItem, Item, PetActivity, PlayActivity, Quality, Vec } from "./types";
import { exercise } from "./weight";
import { startWork, stopWork } from "./work";

/** Керування на цю мить: напрямок руху й чи утримується кнопка дії. */
export interface Input {
  move: Vec;
  hold: boolean;
}

export const IDLE: Input = { move: { x: 0, y: 0 }, hold: false };

/** Що має статися після натискання: зараз лише сон, бо його обробляє хід гри. */
export type TapResult = "sleep" | null;

/** Причини відмови без подробиць: їх можна передати просто назвою. */
type BareRefusal = Exclude<Refusal, { product: unknown } | { item: unknown } | { what: unknown } | { need: unknown }>["reason"];

/** Відмовити (§11.4): сцена покаже над персонажем думку з іконкою саме цієї причини. */
function refuse(state: GameState, target: string, refusal: Refusal | BareRefusal): null {
  emit(state, { type: "refused", object: target, ...(typeof refusal === "string" ? { reason: refusal } : refusal) });
  return null;
}

export function isDish(item: Item | null): item is Dish {
  return item?.kind === "raw" || item?.kind === "meal" || item?.kind === "burnt";
}

/** Запас холодильника в руках (§6.4): сира порція — продукти, мамин судочок — судочки; інше — null. */
function fridgeSupply(item: Item | null): { product: "food" | "momMeal"; quality: Quality } | null {
  if (item?.kind === "raw") return { product: "food", quality: item.quality };
  return item?.kind === "meal" && item.mom === true ? { product: "momMeal", quality: item.quality } : null;
}

/** Коротке натискання дії (§10). */
export function tap(state: GameState): TapResult {
  const character = state.character;
  if (state.end !== null || character.body.stun > 0) return null;
  if (character.activity?.kind === "work") {
    stopWork(state);
    return null;
  }
  // Під час тривалої дії натискання її не перериває: інакше можна випадково взяти страву зі столу.
  if (character.activity !== null) return null;
  const held = character.held;
  const target = targetOf(state);
  // Кота на руках опускають будь-де, а біля душу — купають (§8.7).
  if (held?.kind === "cat") {
    if (target?.type === "object" && target.object.kind === "shower") return tapObject(state, target.object, held);
    putDownCat(state, held.cat);
    return null;
  }
  // З іграшкою біля кота натискання нічого не робить: утримання тут же почне гру (§8.2).
  if (held?.kind === "toy" && target?.type === "cat") return null;
  // Іграшку кладуть на підлогу будь-де, крім смітника.
  if (held?.kind === "toy" && (target === null || target.type !== "object" || target.object.kind !== "trash")) {
    dropToy(state);
    return null;
  }
  if (target === null) return null;
  switch (target.type) {
    case "object":
      return tapObject(state, target.object, held);
    case "item":
      return tapItem(state, target.item, target.id, held);
    case "mess":
      // Безлад прибирають утриманням дії, і ціллю він буває лише з порожніми руками.
      return null;
    case "cat":
      // Кота в протистоянні торкаються — коти розходяться (§9.4, рішення автора 2026-10-26); рук для цього не треба.
      if (touchStandoff(state, target.cat)) return null;
      if (held !== null) return refuse(state, target.id, "hands-full");
      // Кіт спить у барабані — натискання виганяє його, як і дія біля машини (§8.7; перевірка побуту 2026-10-28: брало сплячого
      // на руки — «розбудили» й «проти волі»).
      if (catInWasher(state) === target.cat) {
        tapWasher(state);
        return null;
      }
      // Кіт сидить на умивальнику й просить води — натискання відкриває йому кран, а не бере на руки (§9.12, «Пиття»).
      if (catOnSink(state) === target.cat) {
        openTap(state, target.cat);
        return null;
      }
      // Кіт нагорі не дотягтися: злізе сам — на корм, на вудку чи прокинувшись; застряглого знімають (§9.12, «Лазіння»).
      if (upHigh(state, target.cat)) {
        if (target.cat.stuck !== true) return refuse(state, target.id, "cat-up-high");
        unpleasantTask(state, CLIMBING.rescueSanity);
        pickUpCat(state, target.cat);
        delete target.cat.stuck;
        return null;
      }
      if (avoidsDirtyClothes(state, target.cat)) {
        backAway(state, target.cat, state.character.body);
        observe(state, target.cat, "litterPicky");
        emit(state, { type: "cat-dodged", cat: target.cat.id, issue: "clothes" });
        return null;
      }
      pickUpCat(state, target.cat);
      return null;
  }
}

function tapObject(state: GameState, target: HomeObject, held: Item | null): TapResult {
  const character = state.character;
  switch (target.kind) {
    case "fridge": {
      // Сиру порцію й мамин судочок кладуть назад (§6.4).
      const back = fridgeSupply(held);
      if (held !== null && back !== null) {
        returnSupply(state, back.product, back.quality);
        character.held = null;
        emit(state, { type: "put", object: target.id, item: held });
        return null;
      }
      if (held !== null) return refuse(state, target.id, "hands-full");
      // Спершу — мамин судочок: він уже готовий, без плити (§6.4, рішення автора 2026-10-26).
      const mom = useSupply(state, "momMeal");
      if (mom !== null) return take(state, target, { kind: "meal", quality: mom, mom: true });
      const quality = useSupply(state, "food");
      if (quality === null) return refuse(state, target.id, { reason: "empty", product: "food" });
      return take(state, target, { kind: "raw", quality });
    }
    case "catCabinet":
    case "sterileBin": {
      // Кіт відчинив шафку з кормом — персонаж, підійшовши, зачиняє її (§9.12, «Кмітливість у бешкеті»).
      if (target.kind === "catCabinet") delete state.home.cabinetOpen;
      // Кожен корм — у своєму сховищі (§6.4): шафка — звичайний, бак — для стерилізованих (§9.8).
      const sterile = target.kind === "sterileBin";
      const product = sterile ? "sterileFood" : "catFood";
      if (held?.kind === "catfood") {
        // Корм у руках — лише «з чого насипати» (§6.4): зі сховища його ще не взято, тож просто кладуть назад.
        if (held.sterile !== sterile) return refuse(state, target.id, { reason: "not-here", item: held });
        character.held = null;
        emit(state, { type: "put", object: target.id, item: held });
        return null;
      }
      if (held !== null) return refuse(state, target.id, "hands-full");
      const quality = topQuality(state, product);
      if (quality === null) return refuse(state, target.id, { reason: "empty", product });
      return take(state, target, { kind: "catfood", quality, sterile });
    }
    case "catKit":
      // Аптечка: догляд за котом на руках відкриває картка сцени (§8.7); сюди доходить, коли для кота нічого немає.
      if (held?.kind === "cat") return refuse(state, target.id, "kit-empty");
      if (held !== null) return refuse(state, target.id, "hands-full");
      return refuse(state, target.id, { reason: "need", need: "cat" });
    case "litterBag":
      // Наповнювач не носять: він сам сиплеться в лоток, коли той чистять (§9.12).
      if (held !== null) return refuse(state, target.id, "hands-full");
      return refuse(state, target.id, { reason: "need", need: "dirty-litter" });
    case "boxes":
      // Ящики біля входу (§6.4): брати з них нічого не можна — лише розкласти все по сховищах.
      if (held !== null) return refuse(state, target.id, "hands-full");
      // У коробці спить допитливий кіт (§9.12): спершу його треба забрати.
      if (catInBox(state)) return refuse(state, target.id, "cat-in-box");
      if (unpack(state).length === 0) return refuse(state, target.id, "no-room");
      return null;
    case "stove": {
      const stove = state.home.stove;
      if (held !== null) {
        if (!isDish(held)) return refuse(state, target.id, { reason: "not-here", item: held });
        if (stove.item !== null) return refuse(state, target.id, "occupied");
        stove.item = held;
        // Готова страва, яку повернули на плиту, знову може підгоріти.
        stove.minutes = held.kind === "raw" ? 0 : COOK_MINUTES;
        character.held = null;
        emit(state, { type: "put", object: target.id, item: held });
        return null;
      }
      if (stove.item === null) return refuse(state, target.id, { reason: "need", need: "raw" });
      const item = stove.item;
      stove.item = null;
      stove.minutes = 0;
      return take(state, target, item);
    }
    case "table":
    case "counter": {
      const surfaces = state.home.surfaces;
      const item = surfaces[target.id] ?? null;
      if (held !== null) {
        if (!isDish(held)) return refuse(state, target.id, { reason: "not-here", item: held });
        if (item !== null) return refuse(state, target.id, "occupied");
        surfaces[target.id] = held;
        character.held = null;
        emit(state, { type: "put", object: target.id, item: held });
        return null;
      }
      if (item === null) return refuse(state, target.id, { reason: "need", need: "dish" });
      // Страву на столі їдять утриманням дії, а не беруть назад.
      if (target.kind === "table" && item.kind === "meal") return null;
      surfaces[target.id] = null;
      return take(state, target, item);
    }
    case "trash": {
      if (held === null) return refuse(state, target.id, { reason: "need", need: "item" });
      // Кіт перекинув смітник — спершу прибрати сміття (§9.12, «Кмітливість у бешкеті»).
      if (trashTipped(state)) return refuse(state, target.id, "trash-tipped");
      character.held = null;
      emit(state, { type: "trashed", item: held });
      return null;
    }
    case "computer":
      if (held !== null) return refuse(state, target.id, "hands-full");
      // Кіт спить на комп'ютері чи сидить на клавіатурі — спершу його треба забрати (§9.12).
      if (catOnComputer(state)) return refuse(state, target.id, "cat-on-computer");
      // Кіт перегриз дріт — спершу полагодити: утримати дію біля комп'ютера (§9.12, «Гризіння»).
      if (state.home.wireChewed === true) return refuse(state, target.id, "wire-chewed");
      // Вимкнули світло (§4.1): комп'ютер не працює.
      if (powerOut(state)) return refuse(state, target.id, "no-power");
      startWork(state);
      return null;
    case "bed":
      if (held !== null) return refuse(state, target.id, "hands-full");
      if (!canGoToSleep(state)) return refuse(state, target.id, "too-early");
      return "sleep";
    case "door": {
      if (held !== null) return refuse(state, target.id, "hands-full");
      // Спершу — кіт на сходах: його треба впіймати (§9.12).
      const escaped = state.cats.find((c) => c.away === "stairs");
      if (escaped) {
        catchCat(state, escaped);
        return null;
      }
      if (receivePackages(state).length === 0) return refuse(state, target.id, "no-packages");
      openDoor(state);
      return null;
    }
    case "shower":
      // Кіт на руках біля душу — купання (§8.7); інакше персонаж заходить у кабіну й лишається там до кінця душу.
      if (held?.kind === "cat") return bathe(state, stateRng(state, "behavior")) ? null : refuse(state, target.id, { reason: "empty", product: "shampoo" });
      if (held !== null) return refuse(state, target.id, "hands-full");
      // Увімкнули воду: «Водобоязнь» тікає з ванної — персонаж ще бачить це, заходячи в кабіну (§9.12).
      waterFright(state);
      character.activity = { kind: "use", target: target.id, progress: 0, inside: true };
      return null;
    case "sink": {
      // Ліки для себе — біля умивальника (§6.5). Кіт на умивальнику чекає крана — спершу відкрити воду йому (§9.12).
      if (held !== null) return refuse(state, target.id, "hands-full");
      const drinker = catOnSink(state);
      if (drinker) {
        openTap(state, drinker);
        return null;
      }
      if (!needsHumanMeds(state)) return refuse(state, target.id, treatable(state) ? "dose-taken" : "healthy");
      if (!takeHumanMeds(state, stateRng(state, "behavior"))) return refuse(state, target.id, { reason: "empty", product: "humanMeds" });
      return null;
    }
    case "sofa":
    case "wardrobe":
    case "windowsill":
      return null;
    case "washer": {
      if (held !== null) return refuse(state, target.id, "hands-full");
      const result = tapWasher(state);
      if (result === "empty") return refuse(state, target.id, { reason: "empty", product: "detergent" });
      if (result === "busy") return refuse(state, target.id, "washing");
      return null;
    }
    case "vacuum":
      // Пилососять утриманням дії (§8.7).
      if (held !== null) return refuse(state, target.id, "hands-full");
      return null;
  }
}

function tapItem(state: GameState, item: HomeItem, id: string, held: Item | null): TapResult {
  switch (item.kind) {
    case "bowl": {
      if (held === null) {
        // З порожніми руками біля годівниці — спорожнити її, щоб змінити корм (§9.12, правка автора 2026-10-25).
        const feeder = feederAt(state, item.slot);
        if (feeder && emptyFeeder(state, item, feeder).length > 0) return null;
        return refuse(state, id, { reason: "need", need: "catfood" });
      }
      if (held.kind !== "catfood") return refuse(state, id, { reason: "not-here", item: held });
      return pourFood(state, item, id, held);
    }
    case "water":
      if (held !== null) return refuse(state, id, "hands-full");
      if (item.water >= WATER_CAPACITY) return refuse(state, id, { reason: "full", what: "water" });
      item.water = WATER_CAPACITY;
      emit(state, { type: "watered", item: item.id });
      freshWater(state, item);
      return null;
    case "litter":
      // Лоток чистять утриманням дії; чистий — нічого чистити.
      if (held !== null) return refuse(state, id, "hands-full");
      // Порожній лоток без наповнювача в запасі нічим наповнити (перевірка побуту 2026-10-28: «чистка» забирала −3 і
      // лишала лоток порожнім, і так без кінця).
      if (item.litter === null && supplyCount(state, "litter") === 0) return refuse(state, id, { reason: "empty", product: "litter" });
      return canUse(state, { type: "item", id, item }) ? null : refuse(state, id, "clean");
    case "toy":
      if (held !== null) return refuse(state, id, "hands-full");
      state.home.items.splice(state.home.items.indexOf(item), 1);
      state.character.held = { kind: "toy", toy: item };
      return null;
    case "house":
    case "scratcher":
      // Будиночок і кігтеточка — для котів, ціллю персонажа вони не бувають (`targets.ts`).
      return null;
  }
}

/**
 * Насипати корм із рук (§6.4, §9.12, правка автора 2026-10-24): одразу доверху — і миску, і
 * автогодівницю над нею; якщо в сховищі менше — усе, що лишилося. Різні корми не змішують: ні
 * звичайний зі стерилізованим, ні дешевий з преміальним — ні в мисці, ні в годівниці. Корм у руках —
 * лише «з чого насипати»: де корм уже є, досипають тим самим, у порожню — тим, що в руках. Надкльовану
 * половинку («Апетит −», §9.12) доповнюють цілою порцією: миска з 1,5 порції стає повною (рішення автора 2026-10-26).
 */
function pourFood(state: GameState, bowl: BowlItem, id: string, held: Item & { kind: "catfood" }): TapResult {
  const feeder = feederAt(state, bowl.slot);
  const product = held.sterile ? "sterileFood" : "catFood";
  const inside = bowl.food > 0 ? bowl : feeder && feeder.food > 0 ? feeder : null;
  const quality = inside?.foodQuality ?? (state.home.supplies[product][held.quality] > 0 ? held.quality : topQuality(state, product));
  if (quality === null) return refuse(state, id, { reason: "empty", product });
  if (!sameFood(bowl, quality, held.sterile) || (feeder && !sameFood(feeder, quality, held.sterile))) return refuse(state, id, "mixed");
  // Надкльована половинка займає місце цілої порції, але її доповнюють: на неї йде ще одна порція.
  const half = bowl.half === true ? 1 : 0;
  const bowlRoom = BOWL_CAPACITY - bowl.food + half;
  const room = bowlRoom + (feeder ? FEEDER_CAPACITY[feeder.quality] - feeder.food : 0);
  if (room <= 0) return refuse(state, id, { reason: "full", what: "bowl" });
  const poured = useSupplies(state, product, quality, room);
  // Того самого корму вже немає, а інший є — змішувати не можна.
  if (poured === 0) return refuse(state, id, supplyCount(state, product) > 0 ? "mixed" : { reason: "empty", product });
  const toBowl = Math.min(poured, bowlRoom);
  if (half > 0 && toBowl > 0) {
    delete bowl.half;
    bowl.food += toBowl - 1;
  } else bowl.food += toBowl;
  bowl.foodQuality = quality;
  bowl.sterile = held.sterile;
  if (feeder && poured > toBowl) {
    feeder.food += poured - toBowl;
    feeder.foodQuality = quality;
    feeder.sterile = held.sterile;
  }
  state.character.held = null;
  emit(state, { type: "fed", item: bowl.id, food: bowl.food });
  hearFood(state, bowl);
  return null;
}

/** Покласти іграшку на підлогу під ногами. */
function dropToy(state: GameState): void {
  const held = state.character.held;
  if (held?.kind !== "toy") return;
  const { x, y, facing } = state.character.body;
  const spot = visibleFloorNear(state, { x: x + facing.x * 0.5, y: y + facing.y * 0.5 });
  // Дістану з-під меблів іграшку кладуть уже на видне місце (§9.12, «Подарунки й схованки»).
  const { hidden: _hidden, ...toy } = held.toy;
  state.home.items.push({ ...toy, x: spot.x, y: spot.y });
  state.character.held = null;
}

/** Повернути кота зі сходів (§9.12): ловити кота — неприємне завдання. */
function catchCat(state: GameState, cat: Cat): void {
  cat.away = null;
  cat.x = 10.5;
  cat.y = 10.3;
  cat.act = idleAct(3);
  cat.interacted = true;
  unpleasantTask(state, ESCAPE.catchSanity);
  maybeFallIll(state, cat, "fleas", ILLNESS.escapeFleas, stateRng(state, "behavior"));
  emit(state, { type: "cat-returned", cat: cat.id, caught: true });
}

function take(state: GameState, object: HomeObject, item: Item): null {
  state.character.held = item;
  emit(state, { type: "took", object: object.id, item });
  return null;
}

/** Чистюля не йде на руки до персонажа в брудному одязі (§9.12). */
export function avoidsDirtyClothes(state: GameState, cat: Cat): boolean {
  return state.home.clothes <= 0 && traitLevel(cat, "litterPicky") >= DIRTY_CLOTHES_CATS.picky;
}

/** Чи кіт зараз не хоче на руки: спить або не хоче уваги й не любить рук (§9.12). */
function unwilling(cat: Cat): boolean {
  // Застряглий нагорі радий, що його знімають (§9.12, «Лазіння»).
  if (cat.stuck === true) return false;
  return cat.act.kind === "sleep" || (cat.needs.attention < UNWILLING_ATTENTION && traitLevel(cat, "lap") <= 0);
}

/** Кіт займає місце: клавіатуру, комп'ютер чи коліна (§9.12). */
function occupying(state: GameState, cat: Cat): boolean {
  return cat.act.kind === "keyboard" || cat.act.kind === "lap" || catOnComputer(state) === cat;
}

/** Узяти кота на руки (§9.12): прогнаного з місця (зокрема з забороненого — «ні»), сонного чи небажаючого це ображає. */
export function pickUpCat(state: GameState, cat: Cat): void {
  separateFight(state, cat);
  // «Ні» (§9.12, «Слухняність»): зняти кота з комп'ютера чи кухонного столу — так само прогнати з місця, і кіт це запам'ятає.
  const zone = forbiddenZoneAt(state, cat);
  if (zone !== null) sayNo(state, cat, zone, stateRng(state, "behavior"));
  const shooed = occupying(state, cat) || zone !== null;
  const offended = shooed || unwilling(cat);
  if (shooed) {
    changeMood(state, cat, SHOO.mood, "прогнали з місця");
    offend(state, cat, SHOO.love, "прогнали з місця");
  } else {
    if (cat.act.kind === "sleep") changeMood(state, cat, MOOD.woken, "розбудили");
    if (offended) offend(state, cat, PET.unwantedLove, "узяли на руки проти волі");
  }
  // Розбудили чи прогнали — спокійний, коли опустять, може заснути знову (§9.12).
  const disturbed = shooed || cat.act.kind === "sleep";
  // Узяли, коли кіт саме просив їсти: ласощі зараз привчать його жебракувати (§7).
  const begging = beggingFood(state, cat);
  cat.interacted = true;
  cat.act = idleAct();
  state.character.held = { kind: "cat", cat: cat.id, ...(offended ? { offended: true } : {}), ...(disturbed ? { disturbed: true } : {}), ...(begging ? { begging: true } : {}) };
  emit(state, { type: "picked-up", cat: cat.id, offended });
  // Іншого кота взяли на руки — ревнивці це бачать (§9.12, «Ревнивість»).
  jealousy(state, cat, "hands");
}

/** Опустити кота з рук поруч із персонажем. */
export function putDownCat(state: GameState, catId: number): void {
  const character = state.character;
  const held = character.held;
  character.held = null;
  const cat = state.cats.find((c) => c.id === catId);
  if (!cat) return;
  const { x, y, facing } = character.body;
  const spot = { x: x + facing.x * 0.6, y: y + facing.y * 0.6 };
  const free = !isSolid(state, Math.floor(spot.x), Math.floor(spot.y));
  cat.x = free ? spot.x : x;
  cat.y = free ? spot.y : y;
  cat.act = idleAct(3);
  emit(state, { type: "put-down", cat: cat.id });
  // Спокійного розбудили чи прогнали, а він одразу лягає й спить далі — прояв «Стресостійкості +» (§9.12).
  const calm = traitLevel(cat, "stress");
  if (held?.kind === "cat" && held.disturbed === true && calm > 0 && stateRng(state, "behavior").chance(STRESS_EFFECTS.sleepStep * calm)) {
    cat.act = { kind: "sleep", target: null, goal: null, minutes: 8 * 60, elapsed: 0 };
    observe(state, cat, "stress", 1, false, STRESS_EFFECTS.everyMinutes);
  }
}

/** Тривалість тривалої дії з ціллю, без урахування швидкості. */
function useMinutes(target: Target): number {
  if (target.type === "item") return CLEAN_LITTER_MINUTES;
  if (target.type === "mess") return CLEAN_MESS_MINUTES;
  if (target.type === "object" && target.object.kind === "vacuum") return HOUSEHOLD.vacuumMinutes;
  if (target.type === "object" && target.object.kind === "computer") return CHEWING.fixMinutes;
  return target.type === "object" && target.object.kind === "shower" ? SHOWER_MINUTES : EAT_MINUTES;
}

/** Чи можна зараз почати чи продовжити тривалу дію з ціллю. */
export function canUse(state: GameState, target: Target): boolean {
  if (state.character.held !== null) return false;
  switch (target.type) {
    case "object":
      if (target.object.kind === "shower" || target.object.kind === "vacuum") return true;
      // Перегризений дріт лагодять утриманням дії (§9.12, «Гризіння»).
      if (target.object.kind === "computer") return state.home.wireChewed === true && catOnComputer(state) === null;
      if (target.object.kind === "table") return state.home.surfaces[target.object.id]?.kind === "meal";
      return false;
    case "item":
      return target.item.kind === "litter" && (target.item.uses > 0 || (target.item.litter === null && supplyCount(state, "litter") > 0));
    case "mess":
    case "cat":
      return true;
  }
}

/** Чи можна гратися: іграшка в руках, кіт поруч (§9.12). */
function canPlay(state: GameState, target: Target): boolean {
  return target.type === "cat" && state.character.held?.kind === "toy";
}

/** Що відчуває кіт, якого гладять чи тримають на руках (§9.12): це видно з нього самого. */
export type CatFeeling = "content" | "reluctant" | "struggling";

export function catFeeling(state: GameState, cat: Cat): CatFeeling | null {
  const { held, activity } = state.character;
  if (held?.kind === "cat" && held.cat === cat.id) return carryFeeling(state, cat);
  if (activity?.kind === "pet" && activity.cat === cat.id && !petOver(activity)) {
    const tolerance = petTolerance(cat);
    if (activity.minutes > tolerance) return "struggling";
    // За хвилину до кінця терпіння кожен кіт попереджає: б'є хвостом і притискає вуха (§9.12, рішення автора 2026-10-25).
    if (activity.minutes > tolerance - PETTING.warnMinutes) return "reluctant";
    return cat.needs.attention >= PET.wantsAttention ? "content" : "reluctant";
  }
  if (activity?.kind === "play" && activity.cat === cat.id && !activity.done) return "content";
  // «Нудьгує біля вікна» сіпає хвостом і мружиться на птахів за склом (§9.12, «Вікно»).
  if (cat.act.kind === "window" && cat.act.goal === null && traitLevel(cat, "window") <= -2) return "reluctant";
  return null;
}

/** Частка виконаної тривалої дії 0–1 або null, якщо її немає. */
export function useProgress(state: GameState): number | null {
  const activity = state.character.activity;
  if (activity?.kind !== "use") return null;
  const target = targetById(state, activity.target);
  return target ? Math.min(1, activity.progress / useMinutes(target)) : null;
}

/**
 * Тривалі дії за ігрові хвилини. Рух перериває і роботу, і тривалу дію;
 * відпущена кнопка лише ставить тривалу дію на паузу, а пестощі — закінчує.
 */
export function tickActivity(state: GameState, input: Input, minutes: number): void {
  const character = state.character;
  const activity = character.activity;
  // У душовій кабіні рух не діє: персонаж виходить, коли душ скінчився (§8.7).
  if (activity?.kind === "use" && activity.inside) {
    const target = targetById(state, activity.target);
    if (target === null) {
      character.activity = null;
      return;
    }
    activity.progress += minutes * actionSpeed(state);
    if (activity.progress >= useMinutes(target)) {
      character.activity = null;
      finishUse(state, target);
      // Тримали кнопку весь душ — нова дія не почнеться, поки не відпустили (§10; перевірка побуту 2026-10-28).
      if (input.hold) character.holdSpent = true;
    }
    return;
  }
  if (isMoving(input.move)) {
    if (activity?.kind === "work") stopWork(state);
    else {
      if (activity !== null && input.hold) character.holdSpent = true;
      character.activity = null;
    }
    return;
  }
  if (activity?.kind === "work") return;
  if (!input.hold) {
    character.holdSpent = false;
    if (activity?.kind === "pet" || activity?.kind === "play") character.activity = null;
    return;
  }
  // Одне утримання — одна дія: щоб почати наступну, кнопку треба відпустити (§10).
  if (activity === null && character.holdSpent) return;
  // Дія була й закінчилася, а кнопку ще тримають — наступна чекає, поки її відпустять.
  if (holdTick(state, minutes) && character.activity === null) character.holdSpent = true;
}

/** Утримання дії: почати тривалу дію біля цілі чи продовжити поточну. false — дії не було. */
function holdTick(state: GameState, minutes: number): boolean {
  const character = state.character;
  if (character.activity === null) {
    const target = targetOf(state);
    if (target === null) return false;
    // Кота в протистоянні не гладять і з ним не граються — утримання торкається його раз (§9.4): коти розходяться, а
    // пестощі не почнуться, доки кнопку не відпустили.
    if (target.type === "cat" && touchStandoff(state, target.cat)) return true;
    if (canPlay(state, target) && target.type === "cat") character.activity = { kind: "play", cat: target.cat.id, minutes: 0 };
    else if (!canUse(state, target)) return false;
    // У душ заходять натисканням, а не утриманням.
    else if (target.type === "object" && target.object.kind === "shower") return false;
    // Кота на умивальнику, що чекає крана, не гладять: натискання відкриває йому кран (§9.12, «Пиття»). Пестощі, що
    // почалися б за мить натискання, зсадили б його з умивальника, і натискання брало б кота на руки (перевірка етапу
    // 2026-10-25).
    else if (target.type === "cat" && catOnSink(state) === target.cat) return false;
    else if (target.type === "cat") character.activity = { kind: "pet", cat: target.cat.id, minutes: 0 };
    else {
      character.activity = { kind: "use", target: target.id, progress: 0 };
      // Пилосос загудів — гучний звук на всю квартиру (§9.12).
      if (target.type === "object" && target.object.kind === "vacuum") loudNoise(state, "vacuum", null);
    }
  }
  const current = character.activity;
  if (current?.kind === "pet") {
    pet(state, current, minutes);
    return true;
  }
  if (current?.kind === "play") {
    play(state, current, minutes);
    return true;
  }
  if (current?.kind !== "use") return false;
  const target = targetById(state, current.target);
  if (target === null || !canUse(state, target)) {
    character.activity = null;
    return true;
  }
  current.progress += minutes * actionSpeed(state);
  if (current.progress >= useMinutes(target)) {
    character.activity = null;
    finishUse(state, target);
  }
  return true;
}

function finishUse(state: GameState, target: Target): void {
  if (target.type === "item" && target.item.kind === "litter") {
    const box = target.item;
    box.uses = 0;
    box.litter = useSupply(state, "litter");
    const sanity = unpleasantTask(state, LITTER_SANITY);
    emit(state, { type: "cleaned", what: "litter", sanity });
    return;
  }
  if (target.type === "mess") {
    const messes = state.home.messes;
    messes.splice(messes.indexOf(target.mess), 1);
    const sanity = unpleasantTask(state, MESS_SANITY[target.mess.kind]);
    emit(state, { type: "cleaned", what: target.mess.kind, sanity });
    return;
  }
  if (target.type !== "object") return;
  const object = target.object;
  if (object.kind === "vacuum") return vacuumed(state);
  if (object.kind === "computer") {
    // Дріт замотано й замінено (§9.12, «Гризіння»): неприємно, а новий дріт — до ремонту на комунальних.
    delete state.home.wireChewed;
    unpleasantTask(state, CHEWING.fixSanity);
    state.home.repairs += CHEWING.wireRepair;
    emit(state, { type: "wire-fixed" });
    return;
  }
  if (object.kind === "shower") {
    // Засіб не витрачається, коли й без нього гігієна дійде до межі: 100 чи 60 у брудному одязі (§8.7).
    const plain = state.character.stats.hygiene + SHOWER_HYGIENE.none >= statCeiling(state, "hygiene");
    const quality = plain ? null : useSupply(state, "hygiene");
    const hygiene = SHOWER_HYGIENE[quality ?? "none"];
    changeStat(state, "hygiene", hygiene);
    emit(state, { type: "showered", hygiene, quality, left: supplyCount(state, "hygiene") });
    // Кабіна мокра: «Водолаз» приходить ловити краплі (§9.12).
    showerDrops(state);
    return;
  }
  const meal = state.home.surfaces[object.id];
  if (!meal) return;
  state.home.surfaces[object.id] = null;
  const satiety = MEAL_SATIETY[meal.quality];
  changeStat(state, "satiety", satiety);
  emit(state, { type: "ate", satiety, food: supplyCount(state, "food") });
}

/**
 * Скільки хвилин поспіль кіт терпить пестощі (§9.12). `level` — рівень «Терпимості до гладження»; без нього — самого
 * кота (порода й характер), 0 — як терпів би кіт без риси з тією самою любов'ю.
 */
export function petTolerance(cat: Cat, level = traitLevel(cat, "petting")): number {
  // Хто любить персонажа, терпить пестощі довше (§9.12, правка автора 2026-10-25).
  const love = 1 + LOVE_BEHAVIOR.tolerancePerPoint * Math.max(0, cat.love - 50);
  return Math.max(PET.minToleranceMinutes, PET.toleranceMinutes * (1 + PET.toleranceStep * level) * love);
}

/** Пестощі закінчилися, але кнопку ще тримають (§10): кіт вкусив чи пішов з-під руки. */
export function petOver(activity: PetActivity): boolean {
  return activity.bitten === true || activity.left === true;
}

/**
 * Пестощі (§8.2, §9.12): поки кіт хоче уваги — здоровий глузд, настрій і любов; коли не хоче —
 * менше здорового глузду, а настрій кота падає; довше, ніж кіт терпить, — настрій падає, і кіт може вкусити.
 */
function pet(state: GameState, activity: PetActivity, minutes: number): void {
  const character = state.character;
  const cat = state.cats.find((c) => c.id === activity.cat);
  const body = character.body;
  if (!cat || cat.away !== null || Math.hypot(cat.x - body.x, cat.y - body.y) > REACH + 0.6) {
    character.activity = null;
    return;
  }
  // Вкушений кіт чи той, що пішов з-під руки, відходить; рука чекає, поки кнопку відпустять.
  if (petOver(activity)) return;
  // Погладити кота, що б'ється, — розборонити (§9.4, перевірка стосунків 2026-10-26): бійка закінчується для обох, а не лише
  // для того, кого гладять (другий бився сам і міг травмуватися), і це неприємно, як узяти на руки.
  if (cat.act.kind === "fight") {
    separateFight(state, cat);
    cat.act = idleAct(1);
  }
  if (cat.act.kind === "sleep") changeMood(state, cat, MOOD.woken, "розбудили пестощами");
  // «Образливий», що дметься, гладити себе не дає: одразу йде з-під руки й сідає спиною (§9.12, перевірка етапу
  // 2026-10-25: пестощі щокадру зупиняли кота, і той, що дметься, муркотів під рукою).
  if (sulking(state, cat)) {
    activity.left = true;
    turnAway(state, cat);
    return;
  }
  // «Незалежний» не терпить пестощів, коли уваги не хоче: «Незалежний» іде з-під руки за хвилину, «Відлюдник» — одразу.
  // Без укусу: укус — «Терпимість до гладження» (§9.12, рішення автора 2026-10-25).
  const aloofness = -traitLevel(cat, "affection");
  if (aloofness > 0 && cat.needs.attention < PET.wantsAttention) {
    activity.unwanted = (activity.unwanted ?? 0) + minutes;
    if (activity.unwanted > Math.max(0, AFFECTION.leaveAfter - aloofness)) {
      activity.left = true;
      backAway(state, cat, character.body);
      emit(state, { type: "cat-left", cat: cat.id });
      // Не частіше ніж раз на годину: «Відлюдник» іде миттєво, і кілька натискань поспіль не мають відкривати рису.
      observe(state, cat, "affection", -1, false, AFFECTION.observeEvery);
      return;
    }
  }
  // Пестощі справді почалися — ревнивці це бачать (§9.4, §9.12 «Ревнивість»; перевірка етапу 2026-10-26: раніше ревнували й тоді,
  // коли кіт одразу йшов з-під руки). Ревнивець поруч може зігнати щасливця — тоді пестощам кінець.
  if (activity.minutes === 0 && minutes > 0) {
    jealousy(state, cat, "pet");
    if (petOver(activity)) return;
  }
  const before = activity.minutes;
  activity.minutes += minutes;
  cat.interacted = true;
  shedOnHands(state, cat, activity, minutes);
  // Кіт лишається на місці, поки його гладять.
  if (cat.act.kind !== "idle" || cat.act.goal !== null) cat.act = idleAct(1);
  cat.act.minutes = Math.max(cat.act.minutes, 1);
  const catSanity = DIFFICULTY[state.difficulty].catSanity;
  const tolerance = petTolerance(cat);
  if (activity.minutes <= tolerance) {
    const wants = cat.needs.attention >= PET.wantsAttention;
    changeStat(state, "sanity", (wants ? PET.sanity : PET.unwantedSanity) * catSanity * minutes);
    changeMood(state, cat, (wants ? PET.mood : PET.unwantedMood) * minutes);
    if (wants) changeLove(state, cat, PET.love * minutes);
    cat.needs.attention = Math.max(0, cat.needs.attention - PET.attentionPerMinute * minutes);
    if (Math.floor(activity.minutes) !== Math.floor(before)) emit(state, { type: "purr", cat: cat.id, enjoyed: wants });
    // Гладять довше, ніж витерпів би кіт без риси з тією самою любов'ю, а він муркоче — прояв «Терпимості +», раз за
    // пестощі (§9.9, рішення автора 2026-10-25).
    const plain = petTolerance(cat, 0);
    if (before <= plain && activity.minutes > plain) observe(state, cat, "petting");
    return;
  }
  changeMood(state, cat, PET.tooLongMood * minutes);
  const rng = stateRng(state, "behavior");
  // «Пастка на животику» кусає одразу, щойно терпіння вичерпано.
  const trap = traitLevel(cat, "petting") <= -2;
  if (trap || rng.chance(1 - (1 - PET.biteChancePerMinute) ** minutes)) {
    changeStat(state, "health", PET.biteHealth);
    activity.bitten = true;
    backAway(state, cat, character.body);
    emit(state, { type: "bite", cat: cat.id });
    observe(state, cat, "petting", -1);
  }
}

/**
 * Шерсть від пестощів (§8.7, §9.12, рішення автора 2026-10-25): кожна хвилина додає шерсті в квартирі; після 2 хвилин з
 * руки злітає жмут — раз за пестощі, з шансом 30% × (1 + «Догляд за шерстю»), у довгошерстого — частіше; «−» і безшерсті
 * — ніколи. Жмут — прояв «+»; чиста рука після 2 хвилин пестощів «−» — прояв «−» (раз на день).
 */
function shedOnHands(state: GameState, cat: Cat, activity: PetActivity, minutes: number): void {
  state.home.fur = Math.min(100, state.home.fur + (furPerHour(state, cat) * SHEDDING.petting * minutes) / 60);
  if (activity.shed !== undefined || activity.minutes < SHEDDING.tuftMinutes) return;
  const level = traitLevel(cat, "shedding");
  const long = cat.shape.coat === null && !cat.genes.short[0] && !cat.genes.short[1];
  const chance = cat.shape.coat === "hairless" ? 0 : Math.min(1, SHEDDING.tuft * Math.max(0, 1 + level) * (long ? SHEDDING.longTuft : 1));
  activity.shed = chance > 0 && stateRng(state, "behavior").chance(chance);
  if (activity.shed) {
    state.home.fur = Math.min(100, state.home.fur + SHEDDING.tuftFur);
    emit(state, { type: "fur-tuft", cat: cat.id });
    observe(state, cat, "shedding", 1, false, MINUTES_PER_HOUR);
  } else if (level < 0) observe(state, cat, "shedding", -1, false, MINUTES_PER_DAY);
}

/** Кіт поруч і не на сходах: з ним можна гратися чи його пестити. */
function catNearby(state: GameState, id: number): Cat | null {
  const body = state.character.body;
  const cat = state.cats.find((c) => c.id === id);
  if (!cat || cat.away !== null || Math.hypot(cat.x - body.x, cat.y - body.y) > REACH + 0.6) return null;
  return cat;
}

/**
 * Гра з котом (§8.2, §9.12): здоровий глузд, настрій і любов, поки кіт хоче гратися;
 * коли гри вже не хоче — іде.
 */
function play(state: GameState, activity: PlayActivity, minutes: number): void {
  const character = state.character;
  const cat = catNearby(state, activity.cat);
  if (!cat || character.held?.kind !== "toy") {
    character.activity = null;
    return;
  }
  if (activity.done) return;
  // Кіт, що не хоче гратися, на вудку не зважає: ні радості, ні пробудження.
  if (activity.minutes === 0 && cat.needs.play < PLAY.bored) {
    activity.done = true;
    return;
  }
  // «Нудьгар» і того, що хоче гратися, з шансом 30% на вудку не зважає — відвертається (§9.12, «Ігривість»): відмова зі
  // своєю іконкою й прояв «−».
  const playful = traitLevel(cat, "playful");
  if (activity.minutes === 0 && playful <= -PLAYFUL.boredLevel && cat.act.kind !== "sleep" && stateRng(state, "behavior").chance(PLAYFUL.ignore)) {
    activity.done = true;
    cat.facing = character.body.x >= cat.x ? -1 : 1;
    refuse(state, `cat:${cat.id}`, "cat-bored");
    observe(state, cat, "playful", -1);
    return;
  }
  // Гра справді почалася — ревнивці це бачать (§9.12, «Ревнивість»; перевірка етапу 2026-10-26: раніше шипіли й на кота, що
  // на вудку не зважав). Ревнивець поруч може зігнати щасливця — тоді гри немає.
  if (activity.minutes === 0 && minutes > 0) {
    jealousy(state, cat, "play");
    if (activity.done) return;
  }
  // Кіт щойно приніс іграшку до ніг, і з ним пограли — він тішиться: любов (§9.12, «Подарунки й схованки»).
  if (activity.minutes === 0 && cat.gift !== undefined) {
    if (absoluteMinute(state.day, state.minute) - cat.gift <= GIFTS.thanksMinutes) changeLove(state, cat, GIFTS.thanksLove, "пограли з подарунком");
    delete cat.gift;
  }
  const before = activity.minutes;
  activity.minutes += minutes;
  cat.interacted = true;
  // З ким сьогодні гралися вудкою, той рідше сидить у засідці (§9.12, «Засідки»).
  cat.playedToday = (cat.playedToday ?? 0) + minutes;
  if (cat.act.kind === "sleep") changeMood(state, cat, MOOD.woken, "розбудили грою");
  // Погратися вудкою з котом, що б'ється, — так само розборонити (§9.4).
  separateFight(state, cat);
  if (cat.act.kind !== "idle" || cat.act.goal !== null) cat.act = idleAct(1);
  cat.act.minutes = Math.max(cat.act.minutes, 1);
  const joy = Math.max(0, 1 + PLAY.playfulStep * playful);
  changeStat(state, "sanity", PLAY.sanity * joy * DIFFICULTY[state.difficulty].catSanity * minutes);
  changeMood(state, cat, PLAY.mood * minutes);
  changeLove(state, cat, PLAY.love * minutes);
  cat.needs.play = Math.max(0, cat.needs.play - playDrain(cat) * minutes);
  // Гра вудкою — рух: зайва вага йде (§9.12, «Схильність до повноти»), як від гри наодинці за ту саму частку потреби гри.
  exercise(cat, (playDrain(cat) * minutes) / PLAY_RELIEF);
  if (Math.floor(activity.minutes) !== Math.floor(before)) emit(state, { type: "purr", cat: cat.id, enjoyed: true });
  if (cat.needs.play < PLAY.bored) {
    activity.done = true;
    cat.act = idleAct(0);
    emit(state, { type: "played", cat: cat.id, minutes: activity.minutes });
    // Гра тривала довше чи коротше, ніж із котом без риси з тією самою потребою гри, — прояв «Ігривості» (§9.9); «−»,
    // награвшись, ліниво йде геть (рішення автора 2026-10-25).
    if (playful !== 0) observe(state, cat, "playful", playful > 0 ? 1 : -1);
    if (playful < 0) backAway(state, cat, character.body);
  }
}

/**
 * Скільки потреби гри знімає хвилина гри вудкою (§9.12, «Ігривість»): «+» грається довше — 15 / (1 + 0,25 × рівень), «−» —
 * коротше: 15 × (1 + 0,25 × |рівень|).
 */
export function playDrain(cat: Cat): number {
  const level = traitLevel(cat, "playful");
  return level >= 0 ? PLAY.needPerMinute / (1 + PLAYFUL.lengthStep * level) : PLAY.needPerMinute * (1 + PLAYFUL.lengthStep * -level);
}

/** Персонаж заснув: робота й тривала дія закінчуються, річ із рук випадає (§8.7). */
export function dropEverything(state: GameState): void {
  const character = state.character;
  stopWork(state);
  character.activity = null;
  const held = character.held;
  // Сира порція й мамин судочок — назад у холодильник (§6.4).
  const back = fridgeSupply(held);
  if (back !== null) returnSupply(state, back.product, back.quality);
  if (held?.kind === "cat") putDownCat(state, held.cat);
  if (held?.kind === "toy") dropToy(state);
  // Страву з рук — на вільну поверхню кухні, а не в нікуди.
  if (back === null && (held?.kind === "meal" || held?.kind === "burnt")) {
    const surfaces = state.home.surfaces;
    const free = SURFACE_IDS.find((id) => surfaces[id] === null);
    if (free !== undefined) surfaces[free] = held;
  }
  character.held = null;
}

/** Плита готує своїм часом: страва готова за 20 хвилин і підгорає ще через 15 (§8.7). */
export function tickStove(state: GameState, minutes: number): void {
  const stove = state.home.stove;
  const item = stove.item;
  if (item === null) return;
  stove.minutes += minutes;
  if (item.kind === "raw" && stove.minutes >= COOK_MINUTES) {
    stove.item = { kind: "meal", quality: item.quality };
    emit(state, { type: "cooked", result: "ready" });
  }
  if (stove.item?.kind === "meal" && stove.minutes >= BURN_MINUTES[state.difficulty]) {
    stove.item = { kind: "burnt", quality: item.quality };
    emit(state, { type: "cooked", result: "burnt" });
  }
}

