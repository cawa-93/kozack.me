// Пара дня «Будівельний пил ↔ Прибиральниця» (§4.1, рішення автора 2026-11-03). Прибиральниця — невидимий візит: дзвонить у
// двері за `GUESTS.ringLead` хвилин і о 13:00 миттєво прибирає квартиру із запасів гравця. Будівельний пил з 10:00 до 12:00
// осідає кімната за кімнатою — без випадковості, як і звичайний пил (§8.7 «Пил і павутина»). Викликає `tickModifiers`.

import { BOWL_CAPACITY, GUESTS, HOUSEHOLD, MODIFIERS, WATER_CAPACITY } from "./config";
import { openDoor, ringBell } from "./door";
import { addDust, dustOf } from "./dust";
import { takeSupply, topQuality } from "./economy";
import { emit, type CleanerVisit } from "./events";
import type { RoomId } from "./home";
import { catInWasher, stockBowl, tuftsOf } from "./household";
import { powerOut } from "./modifiers";
import type { BowlItem, GameState } from "./types";

/** Хвилину дня `at` перетнули за крок від `from` завдовжки `minutes` (як `crossed` у `modifiers.ts`). */
const crossed = (from: number, minutes: number, at: number): boolean => from % 1440 < at && (from % 1440) + minutes >= at;

/**
 * Прибиральниця за хвилини дня (§4.1): за `GUESTS.ringLead` хвилин до `MODIFIERS.cleaner.minute` дзвонить у двері — коти реагують,
 * як на будь-який візит (§9.12 «Двері й гості»), — а о цій хвилині заходить і прибирає. Персонаж удома — він відчиняє їй двері
 * (коти біля дверей можуть вибігти, як і з іншими гостями); персонажа немає — вона відчиняє своїми ключами й зачиняє за собою
 * (рішення виконавця 2026-11-03: без господаря двері ніхто не тримає відчиненими, тож коти не вибігають), і прибирання те саме.
 */
export function tickCleaner(state: GameState, from: number, minutes: number): void {
  const at = MODIFIERS.cleaner.minute;
  if (crossed(from, minutes, at - GUESTS.ringLead)) ringBell(state);
  if (!crossed(from, minutes, at)) return;
  const home = state.trip === null;
  if (home) openDoor(state);
  const visit = cleanHome(state);
  emit(state, { type: "modifier", kind: home ? "cleaner" : "cleaner-away", value: visit.messes + visit.tufts + visit.dust, cleaner: visit });
}

/**
 * Прибирання (§4.1, рішення автора 2026-11-03: «Невидима. Але прибирання миттєве»; «Запаси гравця»): одразу й усе.
 *
 * - Увесь безлад, який прибирає гравець, — на підлозі й меблях: «сюрпризи», блювота, грудки, мітки, калюжі, клапті шерсті,
 *   наповнювач, папір, уламки й сміття з перекинутого смітника (прибрали сміття — смітник знову стоїть, `trashTipped`).
 * - Жмути шерсті (і шкала шерсті — до нуля), пил і павутина в усіх кімнатах.
 * - Лотки, якими користувалися, і порожні — свіжий наповнювач із запасу, як у гравця (`takeSupply`: спершу кращий); немає — решта
 *   лотків лишається, як була.
 * - Пральна машина (`laundry`).
 * - Миски — корм із запасу, як насипала б автогодівниця чи друг (`stockBowl`): тим самим, що вже в мисці, а в порожню — для
 *   стерилізованих, коли в домі живе стерилізований кіт, хоч би де він зараз був (`includeAway`: кота повезли до ветеринара чи
 *   він вибіг на сходи, коли персонаж відчиняв їй двері); лише коли в домі є коти. Поїлки — вода доверху, завжди.
 *
 * Страву на плиті й столах не чіпає; скинуті дрібнички й розмотаний рулон (їх гравець не прибирає — вони на місцях уранці),
 * дріт, шафку з кормом і шкарпетку в схованці — теж (рішення виконавця 2026-11-03). Повертає, що зроблено.
 */
export function cleanHome(state: GameState): CleanerVisit {
  const home = state.home;
  const visit: CleanerVisit = {
    messes: home.messes.length,
    tufts: tuftsOf(state).length,
    dust: dustOf(state).length,
    litter: 0,
    hung: false,
    washing: false,
    fed: null,
    watered: false,
  };
  home.messes = [];
  home.tufts = [];
  home.fur = 0;
  home.dust = [];
  for (const box of home.items) {
    if (box.kind !== "litter" || (box.uses === 0 && box.litter !== null)) continue;
    const litter = takeSupply(state, "litter");
    if (litter === null) break;
    box.uses = 0;
    box.litter = litter;
    visit.litter += 1;
  }
  laundry(state, visit);
  const bowls = home.items.filter((i): i is BowlItem => i.kind === "bowl");
  if (state.cats.length > 0) {
    let poured = 0;
    for (const bowl of bowls) poured += stockBowl(state, bowl, BOWL_CAPACITY, { includeAway: true });
    if (poured > 0) visit.fed = bowls.every((b) => b.food >= BOWL_CAPACITY) ? "full" : "some";
  }
  for (const item of home.items) {
    if (item.kind !== "water" || item.water >= WATER_CAPACITY) continue;
    item.water = WATER_CAPACITY;
    visit.watered = true;
  }
  return visit;
}

/**
 * Пральна машина (§8.7, §4.1): випране розвішує (чистого одягу — не менше, ніж дає прання, як у `tapWasher`), а тоді, як і
 * гравець, запускає прання, якщо воно щось додасть: засіб, що візьметься першим, дасть більше днів чистого одягу, ніж є. Засіб —
 * із запасу; немає — не запускає. Без світла («Планове відключення») машина не працює, кота в барабані вона не виганяє й не пере
 * (рішення виконавця 2026-11-03), прання, що вже йде, не чіпає.
 */
function laundry(state: GameState, visit: CleanerVisit): void {
  const home = state.home;
  const washer = home.washer;
  if (washer.state === "done") {
    home.clothes = Math.max(home.clothes, HOUSEHOLD.clothesDays[washer.quality]);
    washer.state = "idle";
    visit.hung = true;
  }
  if (washer.state !== "idle" || powerOut(state) || catInWasher(state) !== null) return;
  const top = topQuality(state, "detergent");
  if (top === null || home.clothes >= HOUSEHOLD.clothesDays[top]) return;
  const quality = takeSupply(state, "detergent");
  if (quality === null) return;
  home.washer = { state: "washing", minutes: HOUSEHOLD.washMinutes, quality };
  visit.washing = true;
}

/**
 * Будівельний пил за хвилини дня (§4.1): від `MODIFIERS.constructionDust.from` щоразу через `every` хвилин наступна кімната з
 * `rooms` набирає пил і павутину на всіх своїх місцях (`settleDust`). Вийшов за двері — пил однаково осідає.
 */
export function tickConstructionDust(state: GameState, from: number, minutes: number): void {
  const { from: start, every, rooms } = MODIFIERS.constructionDust;
  rooms.forEach((room, i) => {
    if (crossed(from, minutes, start + i * every)) settleDust(state, room);
  });
}

/**
 * Кімната вкрилася будівельним пилом (§4.1, §8.7): усі вільні місця `DUST_SPOTS` цієї кімнати — павутина, кути, стіни й підлога,
 * як після довгого накопичення. Повертає, скільки місць додалося.
 */
export function settleDust(state: GameState, room: RoomId): number {
  let added = 0;
  while (addDust(state, room) !== null) added += 1;
  return added;
}

/** Коли будівельний пил осідає (§4.1): з першої кімнати до кінця останнього проміжку — для розкладу (`schedule.ts`). */
export function constructionDustHours(): { from: number; to: number } {
  const { from, every, rooms } = MODIFIERS.constructionDust;
  return { from, to: from + every * rooms.length };
}
