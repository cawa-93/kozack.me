// Вхідні двері (§9.12 «Двері й гості», рішення автора 2026-10-25, `TRAITS_REVIEW.md`): коли їх відчиняють, коти біля
// них вибігають на сходи чи відходять подалі («Втечі»); на дзвінок «Душа компанії» біжить зустрічати, а сором'язливий
// ховається («Гості»). Хто й коли відчиняє двері — пакунки, поїздки, гості, ОСББ, мама, знайда — вирішують інші модулі; тут —
// лише запис, хто подзвонив і чекає під дверима (`guestAtDoor`), а впускає його раніше `visits.ts` (рішення автора 2026-11-03).

import { asleep, isAdapting, traitLevel } from "./cat";
import { backAway, hideSpot, isCarried, startAct } from "./catai";
import { tileOf, visibleFloorNear } from "./catmove";
import { CAT_ACT_MINUTES, ESCAPE, GUESTS } from "./config";
import { emit } from "./events";
import { observe } from "./knowledge";
import { escapeBonus, isNewborn } from "./reproduction";
import { stateRng } from "./rng";
import type { Cat, DoorGuest, GameState, Vec } from "./types";

/** Вхідні двері: від цієї точки рахується, хто біля них (§9.12). */
export const DOOR: Vec = { x: 11, y: 10.5 };
/**
 * Клітинка перед дверима: тут «Втікач» кричить, просячись на сходи, а «Душа компанії» зустрічає гостей. Не впритул — ряд
 * під дверима закриває передня стіна (камера «три чверті»), і кота там майже не видно.
 */
export const DOOR_TILE: Vec = { x: 10, y: 9 };
/** Куди тікає від відчинених дверей «Боїться дверей»: углиб вітальні, подалі від передпокою. */
const AWAY_FROM_DOOR: Vec = { x: 4.5, y: 7.5 };

const nearDoor = (cat: Cat, reach: number): boolean => Math.hypot(cat.x - DOOR.x, cat.y - DOOR.y) <= reach;
const clamp = (value: number): number => Math.min(1, Math.max(0, value));

/** Звідки кіт реагує на дзвінок, а «−» — і на відчинені двері: не спить і нічим важливим не зайнятий (§9.12). */
const BELL_FROM = new Set(["idle", "wander", "toy", "beg", "attention", "follow", "groom", "scratch"]);

/**
 * Двері відчинили (§9.12): кіт ближче 4 клітинок вибігає на сходи з шансом 10% + 25% × «Втечі» (+25% нестерилізованим і
 * кішкам у тічці); «Домосід» нюхає поріг і відходить, «Боїться дверей» тікає з передпокою (до 6 клітинок). Хто спить, у
 * дверях не кидається, як і новонароджений; кота на руках (і `except` — тих, хто саме заходить разом із персонажем) не чіпає.
 */
export function openDoor(state: GameState, except: readonly number[] = []): void {
  const rng = stateRng(state, "behavior");
  for (const cat of state.cats) {
    if (except.includes(cat.id) || cat.away !== null || isCarried(state, cat) || asleep(cat) || isNewborn(cat)) continue;
    const level = traitLevel(cat, "escape");
    if (level < 0) {
      // Хто ховається, їсть чи в лотку, на двері не зважає (перевірка етапу 2026-10-26: кіт, що сховався під диван від
      // дзвінка, вилазив зі схованки, щойно гості заходили).
      if (!BELL_FROM.has(cat.act.kind) || !nearDoor(cat, level <= -2 ? ESCAPE.fearReach : ESCAPE.distance)) continue;
      // Відходить від відчинених дверей — прояв «−» (§9.9): «Домосід» — на кілька кроків, «Боїться дверей» — углиб квартири.
      if (level <= -2) {
        startAct(cat, "wander", tileOf(visibleFloorNear(state, AWAY_FROM_DOOR)), CAT_ACT_MINUTES.wander, "flee");
        emit(state, { type: "scared", cat: cat.id });
      } else backAway(state, cat, DOOR);
      observe(state, cat, "escape", -1);
      continue;
    }
    if (!nearDoor(cat, ESCAPE.distance)) continue;
    if (!rng.chance(clamp(ESCAPE.base + ESCAPE.step * level + escapeBonus(state, cat)))) continue;
    // Персонаж бачить, як кіт вислизнув, — ще поки той біля дверей (§9.9).
    observe(state, cat, "escape");
    cat.away = "stairs";
    cat.x = DOOR.x;
    cat.y = 10.9;
    startAct(cat, "idle", null, 0);
    emit(state, { type: "escaped", cat: cat.id });
  }
}

/** Чи хтось із котів зараз на сходах (§9.12): спершу його треба впіймати. */
export const catOnStairs = (state: GameState): boolean => state.cats.some((c) => c.away === "stairs");

/**
 * Дзвінок у двері (§9.12 «Двері й гості»): кур'єр, гості, ОСББ, мама, ветеринарка, прибиральниця. Кіт, що не спить, звик до дому
 * й нічим важливим не зайнятий, реагує за «Гостями»: «+» біжить до дверей і 5 хвилин сидить там (прояв — `doorSeen` у
 * `catai.ts`), «−» ховається на 30 × |рівень| хвилин, а «Шипить на гостей» ще й шипить з-під дивана. `guest` — дзвонить той,
 * хто зайде сам за `GUESTS.ringLead` хвилин: дзвінок чути (бабл над дверима), «+» чекає під дверима, поки зайдуть, і ще 5
 * хвилин — гравець встигає взяти його на руки (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А5), — а гість чекає під
 * дверима: дія біля дверей відчинить йому раніше (рішення автора 2026-11-03, `visits.ts`). `false` — кур'єр: він лише лишає
 * пакунок, його дзвінок показує сама доставка, а двері відчиняє гравець.
 */
export function ringBell(state: GameState, guest: DoorGuest | false): void {
  const visitor = guest !== false;
  if (visitor) {
    state.today.guest = { who: guest };
    emit(state, { type: "doorbell" });
  }
  const rng = stateRng(state, "behavior");
  for (const cat of state.cats) {
    const level = traitLevel(cat, "guests");
    if (level === 0 || cat.away !== null || isCarried(state, cat) || asleep(cat) || isNewborn(cat) || isAdapting(state, cat)) continue;
    if (!BELL_FROM.has(cat.act.kind)) continue;
    if (level > 0) {
      startAct(cat, "idle", { ...DOOR_TILE }, GUESTS.greetMinutes + (visitor ? GUESTS.ringLead : 0), "guest");
      continue;
    }
    const spot = hideSpot(state, rng, cat);
    startAct(cat, "hide", spot.at, GUESTS.hideStep * -level, spot.target);
    emit(state, { type: "scared", cat: cat.id });
    if (level <= -2) emit(state, { type: "hissed-guests", cat: cat.id });
    // Ховається, щойно задзвонили, — прояв «−» (§9.9).
    observe(state, cat, "guests", -1);
  }
}

/**
 * Подія дня кожного гостя (§4.1): ті, хто заходить сам, приходять лише у свій день. За цією таблицею двері знають, що під ними
 * чекає саме сьогоднішній гість, а розклад (§8.4) — що гостя дня вже впустили; назва гостя й назва дня не мусять збігатися (мама —
 * день «Мамині гостинці»). Новий гість — рядок тут і у `VISITS` (`visits.ts`): тип `Record` не дасть забути жодного.
 */
export const GUEST_DAY: Readonly<Record<DoorGuest, string>> = {
  mom: "mom-food",
  "home-vet": "home-vet",
  inspection: "inspection",
  guests: "guests",
  cleaner: "cleaner",
};

/**
 * Хто подзвонив у двері й чекає, поки йому відчинять (§9.12 «Подзвонили — двері гостю», рішення автора 2026-11-03): дія біля
 * дверей відчиняє йому, а не веде в поїздку. null — під дверима ніхто не чекає; так само, коли запис не належить події
 * сьогоднішнього дня (`GUEST_DAY`; рецензія пакета 2026-11-03: запис, що пережив перехід у інший день, гостем під дверима не є).
 */
export function guestAtDoor(state: GameState): DoorGuest | null {
  const guest = state.today.guest;
  return guest !== undefined && guest.in !== true && GUEST_DAY[guest.who] === state.modifiers.day ? guest.who : null;
}

/** Гостя події сьогоднішнього дня вже впустили раніше за його хвилину (§9.12): у розкладі (§8.4) його вже немає. */
export function dayGuestLetIn(state: GameState): boolean {
  const guest = state.today.guest;
  return guest?.in === true && GUEST_DAY[guest.who] === state.modifiers.day;
}

/**
 * Призначена хвилина візиту `who` (§9.12): забрати запис про гостя — він заходить (чи, коли персонажа немає, іде). Повертає, чи
 * візит відбувається зараз: false — гравець уже відчинив йому раніше (`admitGuest`), і візит не повторюється. Без запису (дзвінка
 * не чули: хвилину перемотали сценарієм чи переходом у час режиму розробки) візит відбувається, як і раніше.
 */
export function takeGuest(state: GameState, who: DoorGuest): boolean {
  const guest = state.today.guest;
  if (guest?.who !== who) return true;
  clearGuest(state);
  return guest.in !== true;
}

/**
 * Під дверима вже ніхто не чекає (§9.12): ранок нового дня (гостю так і не відчинили — персонаж ліг, не дочекавшись), мама,
 * що лишила пакет під дверима, чи перехід у день або годину в режимі розробки (§11.5: дзвінка вже не чути, а хвилину візиту
 * могли перестрибнути — рецензія пакета 2026-11-03).
 */
export function clearGuest(state: GameState): void {
  delete state.today.guest;
}

/**
 * Гостю відчинили раніше за його хвилину (§9.12): «+», що чекав під дверима, зустрічає ще `GUESTS.greetMinutes` — від того, як
 * гостя впустили, а не від призначеної хвилини (рішення виконавця 2026-11-03). `minutes` дії — скільки вона ще триває на місці
 * (а не вся її тривалість), тож лишок і обмежуємо: хто ще біжить до дверей, дійшовши, посидить ті самі 5 хвилин.
 */
export function greetNow(state: GameState): void {
  for (const cat of state.cats) {
    const act = cat.act;
    if (act.kind === "idle" && act.target === "guest") act.minutes = Math.min(act.minutes, GUESTS.greetMinutes);
  }
}
