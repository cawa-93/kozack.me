// Гості, що заходять самі (§9.12 «Двері й гості», «Подзвонили — двері гостю»; рішення автора 2026-11-03): подзвонили — і поки не
// зайшли, дія біля дверей відчиняє їм одразу, а не веде в поїздку. Візит той самий, що й у призначену хвилину: тіло кожного —
// одна функція, яку кличе і своя хвилина (`tickModifiers`, `tickCleaner`), і двері. Новий гість — рядок у `VISITS` і в
// `GUEST_DAY` (`door.ts`, його подія дня).

import { cleanerVisit } from "./cleaner";
import { greetNow, guestAtDoor } from "./door";
import { guestsVisit, homeVetVisit, inspectionVisit, momVisit } from "./modifiers";
import { courierVisit, neighborVisit } from "./parcels";
import type { DoorGuest, GameState } from "./types";

/**
 * Візит кожного гостя (§4.1). Обгортки, а не самі функції: модулі візитів імпортують дії персонажа (`actions.ts`), а ті — цей
 * модуль, тож функції беруться лише під час виклику.
 */
const VISITS: Record<DoorGuest, (state: GameState) => void> = {
  mom: (state) => momVisit(state),
  "home-vet": (state) => homeVetVisit(state),
  inspection: (state) => inspectionVisit(state),
  guests: (state) => guestsVisit(state),
  cleaner: (state) => cleanerVisit(state),
  parcels: (state) => courierVisit(state),
  neighbor: (state) => neighborVisit(state),
};

/**
 * Відчинити гостю, що подзвонив і чекає під дверима (§9.12): він заходить зараз — з тими самими наслідками й тією самою подією
 * дня, з якої сцена показує картку, — а в призначену хвилину вже не приходить (`takeGuest`). «+», що чекав під дверима, зустрічає
 * ще 5 хвилин від цієї миті. False — під дверима ніхто не чекає.
 */
export function admitGuest(state: GameState): boolean {
  const who = guestAtDoor(state);
  if (who === null) return false;
  state.today.guest = { who, in: true };
  greetNow(state);
  VISITS[who](state);
  return true;
}
